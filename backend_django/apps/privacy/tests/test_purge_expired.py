"""S3-4 · Depurar lo vencido (RNF-003, RNF-007): ``services.purge_expired`` y el comando ``purge_expired_data``.

Aplica los contadores del limitador vencidos (la lógica de ``purge_rate_limits``), la auditoría pasada de ``retention_until`` (la de
``purge_audit_logs``, ≥ 360 días) y las solicitudes de acceso RESUELTAS más viejas que ``SIEP_RETENTION_ACCESS_REQUEST_DAYS``.
Con la variable vacía o en 0 NO se borra ninguna solicitud: el plazo es de la institución (SD-9). Una solicitud pendiente nunca se
borra por esta vía. ``dry_run`` cuenta sin borrar.

Cada garantía lleva su control negativo: con el plazo en 0 las solicitudes viejas siguen; sin la ventana de purgado la base rechaza
el borrado de la auditoría.
"""
import io
import json
import secrets
from contextlib import contextmanager
from datetime import datetime, timedelta

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import DatabaseError, connection, transaction
from django.utils import timezone

from apps.privacy import services
from apps.privacy.tests.data_subject_support import crear_cuenta, volcado
from apps.security import limiter
from apps.security.models import RateLimitBucket
from apps.simulation.models import AuditLog
from apps.users.models import AccessRequest
from shared.exceptions import ApiError

pytestmark = [pytest.mark.req("RNF-003", "RNF-007"), pytest.mark.security, pytest.mark.django_db]

AHORA = datetime(2026, 10, 19, 12, 0, 0)
INSTANTE = 1_800_000_000.0
DIA = 86400


@pytest.fixture(autouse=True)
def reloj(monkeypatch):
    """Congela los dos relojes: el de la base (fechas) y el del limitador (segundos desde la época)."""
    monkeypatch.setattr(timezone, "now", lambda: AHORA)
    monkeypatch.setattr(limiter, "_now", lambda: INSTANTE)


@pytest.fixture
def admin():
    return crear_cuenta("ADMIN", "admin")


def _solicitud(estado, *, creada_hace, resuelta_hace=None):
    """Una solicitud con las fechas dadas (``timedelta`` hacia atrás desde ``AHORA``). Su correo es único de esta ejecución."""
    solicitud = AccessRequest.objects.create(
        nombre="Ana", apellido="Prueba", email=f"{secrets.token_hex(6)}@example.com", status=estado
    )
    AccessRequest.objects.filter(pk=solicitud.pk).update(
        created_at=AHORA - creada_hace, reviewed_at=None if resuelta_hace is None else AHORA - resuelta_hace
    )
    return solicitud.pk


def _auditoria(*, vence_en):
    """Una fila de auditoría que vence ``vence_en`` (``timedelta``; negativo = ya venció). Devuelve su id."""
    return AuditLog.objects.create(action="PRUEBA", retention_until=AHORA + vence_en).pk


def _contador(window_start, nombre, scope="login_ip"):
    return RateLimitBucket.objects.create(
        scope=scope, key_hash=limiter.key_hash(nombre), window_start=window_start, count=1
    ).key_hash


def _solicitudes_que_quedan():
    return set(AccessRequest.objects.values_list("pk", flat=True))


@contextmanager
def _sin_ventana():
    yield


# ── Las solicitudes de acceso: solo con el plazo de la institución ───────────────────────────────────────────────


def _mundo_de_solicitudes():
    return {
        "pendiente_vieja": _solicitud("PENDING", creada_hace=timedelta(days=900)),
        "revisada_vieja": _solicitud("REVIEWED", creada_hace=timedelta(days=900), resuelta_hace=timedelta(days=800)),
        "descartada_vieja": _solicitud("DISMISSED", creada_hace=timedelta(days=900), resuelta_hace=timedelta(days=100)),
        "resuelta_reciente": _solicitud("REVIEWED", creada_hace=timedelta(days=900), resuelta_hace=timedelta(days=2)),
        "resuelta_justo_en_el_plazo": _solicitud("REVIEWED", creada_hace=timedelta(days=90), resuelta_hace=timedelta(days=30)),
        "resuelta_un_segundo_despues": _solicitud(
            "DISMISSED", creada_hace=timedelta(days=90), resuelta_hace=timedelta(days=30, seconds=1)
        ),
        "resuelta_sin_fecha_de_revision": _solicitud("REVIEWED", creada_hace=timedelta(days=200)),
        "resuelta_sin_fecha_y_reciente": _solicitud("REVIEWED", creada_hace=timedelta(days=3)),
    }


def test_con_la_variable_en_cero_no_se_borra_ninguna_solicitud(admin, settings):
    settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS = 0
    ids = _mundo_de_solicitudes()

    informe = services.purge_expired(executed_by=admin)

    assert informe["solicitudes"] == 0 and informe["diasDeSolicitudes"] == 0
    assert _solicitudes_que_quedan() == set(ids.values())


def test_con_la_variable_puesta_se_borran_solo_las_resueltas_vencidas(admin, settings):
    settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS = 30
    ids = _mundo_de_solicitudes()

    informe = services.purge_expired(executed_by=admin)

    borradas = {"revisada_vieja", "descartada_vieja", "resuelta_un_segundo_despues", "resuelta_sin_fecha_de_revision"}
    assert informe["solicitudes"] == len(borradas)
    assert _solicitudes_que_quedan() == {pk for nombre, pk in ids.items() if nombre not in borradas}


def test_una_solicitud_pendiente_nunca_se_borra_por_vieja_que_sea(admin, settings):
    settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS = 1
    pendiente = _solicitud("PENDING", creada_hace=timedelta(days=5000))

    services.purge_expired(executed_by=admin)

    assert AccessRequest.objects.filter(pk=pendiente).exists()


def test_la_edad_de_una_solicitud_cuenta_desde_que_se_resolvio_no_desde_que_se_creo(admin, settings):
    settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS = 30
    resuelta_ayer = _solicitud("REVIEWED", creada_hace=timedelta(days=400), resuelta_hace=timedelta(days=1))

    services.purge_expired(executed_by=admin)

    assert AccessRequest.objects.filter(pk=resuelta_ayer).exists()


def test_control_negativo_con_el_plazo_en_cero_las_mismas_solicitudes_vencidas_siguen_y_con_el_plazo_se_van(admin, settings):
    ids = _mundo_de_solicitudes()
    vencidas = {ids["revisada_vieja"], ids["descartada_vieja"]}
    settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS = 0

    services.purge_expired(executed_by=admin)
    assert vencidas <= _solicitudes_que_quedan()

    settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS = 30
    services.purge_expired(executed_by=admin)
    assert not vencidas & _solicitudes_que_quedan()


def test_un_plazo_absurdo_no_rompe_nada_y_no_borra_nada(admin, settings):
    settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS = 999_999_999
    ids = _mundo_de_solicitudes()

    informe = services.purge_expired(executed_by=admin)

    assert informe["solicitudes"] == 0
    assert _solicitudes_que_quedan() == set(ids.values())


# ── La auditoría y los contadores vencidos ───────────────────────────────────────────────────────────────────────


def test_la_auditoria_vencida_se_borra_y_la_vigente_se_queda(admin):
    vencida = _auditoria(vence_en=-timedelta(days=1))
    vigente = _auditoria(vence_en=timedelta(days=1))
    justo_ahora = _auditoria(vence_en=timedelta(0))

    informe = services.purge_expired(executed_by=admin)

    assert informe["auditoria"] == 1
    assert not AuditLog.objects.filter(pk=vencida).exists()
    assert AuditLog.objects.filter(pk__in=[vigente, justo_ahora]).count() == 2


def _la_base_rechaza_borrar(pk):
    try:
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute("DELETE FROM audit_logs WHERE id = %s", [pk])
    except DatabaseError:
        return True
    return False


def test_tras_depurar_la_auditoria_sigue_siendo_de_solo_anadir(admin):
    _auditoria(vence_en=-timedelta(days=1))
    vigente = _auditoria(vence_en=timedelta(days=1))

    services.purge_expired(executed_by=admin)

    assert _la_base_rechaza_borrar(vigente), "la ventana de purgado debe cerrarse al terminar"


def test_control_negativo_sin_la_ventana_de_purgado_la_base_rechaza_borrar_la_auditoria(admin, monkeypatch):
    _auditoria(vence_en=-timedelta(days=1))
    monkeypatch.setattr(services, "audit_purge_window", _sin_ventana)

    with pytest.raises(DatabaseError):
        services.purge_expired(executed_by=admin)


def test_los_contadores_vencidos_se_borran_con_la_regla_de_purge_rate_limits(admin):
    corte = int(INSTANTE) - 2 * 600  # login_ip: ventanas de 600 s, se conservan dos
    _contador(corte - 1, "vencido")
    en_el_corte = _contador(corte, "en-el-corte")
    vigente = _contador(int(INSTANTE), "vigente")
    _contador(int(INSTANTE) - 3 * DIA, "contador", scope="audit_failure")  # los contadores conservan dos días
    contador_reciente = _contador(int(INSTANTE) - DIA, "reciente", scope="audit_failure")

    informe = services.purge_expired(executed_by=admin)

    assert informe["contadores"] == 2
    assert set(RateLimitBucket.objects.values_list("key_hash", flat=True)) == {en_el_corte, vigente, contador_reciente}


def test_el_simulacro_cuenta_lo_mismo_que_la_depuracion_y_no_borra_nada(admin, settings):
    settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS = 30
    _mundo_de_solicitudes()
    _auditoria(vence_en=-timedelta(days=1))
    _contador(int(INSTANTE) - 3 * DIA, "vencido")
    antes = volcado()

    simulado = services.purge_expired(dry_run=True, executed_by=admin)

    assert volcado() == antes
    real = services.purge_expired(executed_by=admin)
    assert volcado() != antes
    for clave in ("contadores", "auditoria", "solicitudes"):
        assert simulado[clave] == real[clave] > 0, clave
    assert simulado["simulacro"] is True and real["simulacro"] is False


# ── El evento de auditoría ───────────────────────────────────────────────────────────────────────────────────────


def test_si_se_borra_algo_queda_un_evento_con_el_id_del_admin_y_los_recuentos(admin, settings):
    settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS = 30
    _mundo_de_solicitudes()
    _auditoria(vence_en=-timedelta(days=1))
    _contador(int(INSTANTE) - 3 * DIA, "vencido")

    informe = services.purge_expired(executed_by=admin)

    [evento] = AuditLog.objects.filter(action="EXPIRED_DATA_PURGED")
    assert evento.actor_id == admin.pk
    assert json.loads(evento.context_json) == {
        "taxonomy": "datos.depurar", "executedBy": admin.pk, "rateLimits": informe["contadores"],
        "auditLogs": informe["auditoria"], "accessRequests": informe["solicitudes"],
    }


def test_sin_nada_que_borrar_no_queda_evento(admin):
    services.purge_expired(executed_by=admin)

    assert not AuditLog.objects.filter(action="EXPIRED_DATA_PURGED").exists()


def test_sin_executed_by_borra_pero_no_audita(settings):
    settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS = 30
    _mundo_de_solicitudes()

    informe = services.purge_expired()

    assert informe["solicitudes"] > 0
    assert not AuditLog.objects.filter(action="EXPIRED_DATA_PURGED").exists()


def test_quien_ejecuta_debe_ser_un_admin_activo(settings):
    estudiante = crear_cuenta("ESTUDIANTE", "ana")
    settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS = 30
    _mundo_de_solicitudes()
    antes = volcado()

    with pytest.raises(ApiError) as error:
        services.purge_expired(executed_by=estudiante)

    assert error.value.api_code == "EXECUTOR_NOT_ADMIN"
    assert volcado() == antes


# ── El comando ───────────────────────────────────────────────────────────────────────────────────────────────────


def _comando(*argumentos):
    salida = io.StringIO()
    call_command("purge_expired_data", *argumentos, stdout=salida, stderr=io.StringIO())
    return salida.getvalue()


def test_el_comando_exige_confirm_y_un_admin_y_no_toca_nada_sin_ellos(admin, settings):
    settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS = 30
    _mundo_de_solicitudes()
    _auditoria(vence_en=-timedelta(days=1))
    estudiante = crear_cuenta("ESTUDIANTE", "ana")
    antes = volcado()

    with pytest.raises(CommandError, match="--confirm"):
        _comando("--executed-by", admin.email)
    with pytest.raises(CommandError):
        _comando("--confirm")
    with pytest.raises(CommandError):
        _comando("--executed-by", estudiante.email, "--confirm")

    assert volcado() == antes


def test_el_comando_borra_y_dice_solo_recuentos_e_ids(admin, settings):
    settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS = 30
    ids = _mundo_de_solicitudes()
    correos = list(AccessRequest.objects.values_list("email", flat=True))
    _auditoria(vence_en=-timedelta(days=1))

    salida = _comando("--executed-by", admin.email, "--confirm")

    assert "se borraron" in salida and str(admin.pk) in salida
    assert "4" in salida  # las cuatro solicitudes vencidas
    for dato in (*correos, admin.email, "Ana", "Prueba"):
        assert dato not in salida
    assert len(_solicitudes_que_quedan()) == len(ids) - 4


def test_el_comando_con_dry_run_no_pide_confirm_no_escribe_nada_y_dice_lo_que_haria(admin, settings):
    settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS = 30
    _mundo_de_solicitudes()
    _auditoria(vence_en=-timedelta(days=1))
    antes = volcado()

    salida = _comando("--executed-by", admin.email, "--dry-run")

    assert volcado() == antes
    assert "se borrarían" in salida and "simulacro" in salida.lower()


def test_el_comando_dice_que_sin_plazo_no_se_borra_ninguna_solicitud(admin, settings):
    settings.SIEP_RETENTION_ACCESS_REQUEST_DAYS = 0
    _mundo_de_solicitudes()

    salida = _comando("--executed-by", admin.email, "--confirm")

    assert "sin plazo configurado" in salida
