"""S4-2 · Auditoría de solo añadir: la base rechaza UPDATE, DELETE y TRUNCATE sobre ``audit_logs``.

``audit_logs`` es la evidencia de quién hizo qué (RNF-007, retención de 360 días como mínimo). La migración 0026
pone un trigger que rechaza esas sentencias salvo dentro de ``audit_purge_window()``, que enciende la bandera
``siep.purge`` solo para su transacción. Aquí se prueba que la base lo rechaza, que el purgado y los ayudantes de
prueba siguen funcionando y que la migración se revierte y se vuelve a aplicar.
"""
import io
from datetime import timedelta

import pytest
from django.core.management import call_command
from django.db import DatabaseError, connection, transaction
from django.utils import timezone

from apps.simulation.models import AuditLog
from apps.simulation.services import audit_service
from shared.testing import purge_audit_rows, rewrite_audit_rows

pytestmark = [pytest.mark.req("SIEP-RNF-02"), pytest.mark.security, pytest.mark.django_db]

ANTERIOR = "0025_case_version_reuse_ratio"  # última migración de simulation antes de la 0026
SQLSTATE_PRIVILEGIO = "42501"  # insufficient_privilege: el código con el que lanza el trigger


def _fila(*, action="S4_2_PRUEBA", dias=360):
    return AuditLog.objects.create(
        action=action, actor_role="SYSTEM", retention_until=timezone.now() + timedelta(days=dias)
    )


def _rechazado(sentencia, params=None):
    """Ejecuta ``sentencia`` en un savepoint y exige que la base la rechace con el código de privilegio."""
    with pytest.raises(DatabaseError) as error:
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(sentencia, params)
    assert getattr(error.value.__cause__, "sqlstate", None) == SQLSTATE_PRIVILEGIO, str(error.value)
    return error.value


def _triggers_en_audit_logs():
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal"
        )
        return cursor.fetchone()[0]


def _resolver_controles_diferidos():
    """Cada inserción deja un control diferido de clave foránea. Con ese control pendiente, PostgreSQL rechaza el
    TRUNCATE con el error 55006 antes de llegar al trigger: se resuelve antes para que la prueba mida el trigger."""
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")


def test_update_sql_directo_se_rechaza_y_la_fila_queda_intacta():
    fila = _fila(action="ATTEMPT_STARTED")

    _rechazado("UPDATE audit_logs SET action = %s WHERE id = %s", ["ALTERADA", fila.pk])

    fila.refresh_from_db()
    assert fila.action == "ATTEMPT_STARTED"


def test_delete_sql_directo_se_rechaza_y_la_fila_sigue():
    fila = _fila()

    _rechazado("DELETE FROM audit_logs WHERE id = %s", [fila.pk])

    assert AuditLog.objects.filter(pk=fila.pk).exists()


def test_update_y_delete_del_orm_sin_ventana_tambien_se_rechazan():
    fila = _fila(action="ATTEMPT_STARTED")

    with pytest.raises(DatabaseError):
        with transaction.atomic():
            AuditLog.objects.filter(pk=fila.pk).update(action="ALTERADA")
    with pytest.raises(DatabaseError):
        with transaction.atomic():
            AuditLog.objects.filter(pk=fila.pk).delete()

    fila.refresh_from_db()
    assert fila.action == "ATTEMPT_STARTED"


def test_truncate_se_rechaza_y_no_pierde_filas():
    fila = _fila()
    _resolver_controles_diferidos()

    _rechazado("TRUNCATE audit_logs")

    assert AuditLog.objects.filter(pk=fila.pk).exists()


def test_insert_sigue_funcionando_por_el_servicio_de_auditoria():
    antes = AuditLog.objects.count()

    audit_service.append(None, "SYSTEM", "S4_2_ALTA", None, None, {}, None, None, None)

    assert AuditLog.objects.count() == antes + 1
    assert AuditLog.objects.filter(action="S4_2_ALTA").exists()


def test_purgado_borra_lo_vencido_y_conserva_lo_vigente():
    vencida = _fila(dias=-1)
    vigente = _fila(dias=30)
    esperadas = AuditLog.objects.filter(retention_until__lt=timezone.now()).count()
    salida = io.StringIO()

    call_command("purge_audit_logs", stdout=salida)

    assert not AuditLog.objects.filter(pk=vencida.pk).exists()
    assert AuditLog.objects.filter(pk=vigente.pk).exists()
    assert f"deleted {esperadas} expired entries" in salida.getvalue()


def test_tras_el_purgado_la_base_vuelve_a_rechazar_el_borrado():
    _fila(dias=-1)
    call_command("purge_audit_logs", stdout=io.StringIO())
    fila = _fila(dias=30)

    _rechazado("DELETE FROM audit_logs WHERE id = %s", [fila.pk])

    assert AuditLog.objects.filter(pk=fila.pk).exists()


def test_dry_run_cuenta_sin_borrar():
    vencida = _fila(dias=-1)
    esperadas = AuditLog.objects.filter(retention_until__lt=timezone.now()).count()
    salida = io.StringIO()

    call_command("purge_audit_logs", "--dry-run", stdout=salida)

    assert AuditLog.objects.filter(pk=vencida.pk).exists()
    assert f": {esperadas} expired entries" in salida.getvalue()


def test_la_migracion_se_revierte_y_vuelve_a_aplicarse():
    call_command("migrate", "simulation", ANTERIOR, interactive=False, verbosity=0)
    try:
        assert _triggers_en_audit_logs() == 0
        fila = _fila()
        AuditLog.objects.filter(pk=fila.pk).delete()  # sin el trigger, la base deja borrar
        assert not AuditLog.objects.filter(pk=fila.pk).exists()
    finally:
        call_command("migrate", "simulation", interactive=False, verbosity=0)

    assert _triggers_en_audit_logs() == 2
    fila = _fila()
    _rechazado("DELETE FROM audit_logs WHERE id = %s", [fila.pk])


def test_una_ventana_que_falla_no_deja_la_puerta_abierta():
    fila = _fila(dias=30)

    with pytest.raises(RuntimeError):
        with audit_service.audit_purge_window():
            raise RuntimeError("fallo a propósito")

    _rechazado("DELETE FROM audit_logs WHERE id = %s", [fila.pk])


def test_una_ventana_interior_no_cierra_la_de_fuera():
    dentro = _fila(dias=30)
    fuera = _fila(dias=30)

    with audit_service.audit_purge_window():
        with audit_service.audit_purge_window():
            pass
        AuditLog.objects.filter(pk=dentro.pk).delete()  # la ventana exterior sigue abierta

    assert not AuditLog.objects.filter(pk=dentro.pk).exists()
    _rechazado("DELETE FROM audit_logs WHERE id = %s", [fuera.pk])


def test_los_ayudantes_de_prueba_actualizan_y_borran_dentro_de_la_ventana():
    fila = _fila(action="S4_2_ANTES")
    borrable = _fila()

    rewrite_audit_rows(AuditLog.objects.filter(pk=fila.pk), action="S4_2_DESPUES")
    borradas, _ = purge_audit_rows(AuditLog.objects.filter(pk=borrable.pk))

    fila.refresh_from_db()
    assert fila.action == "S4_2_DESPUES"
    assert borradas == 1
    assert not AuditLog.objects.filter(pk=borrable.pk).exists()
