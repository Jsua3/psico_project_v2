"""``security_report`` (S4-3, S4-1): recuentos de los últimos días, sin correos ni direcciones IP. Solo lee e imprime.

Desde S4-1, los fallos de inicio de sesión, los informes exportados y las cuentas nuevas con rol privilegiado salen de
``audit_logs`` (que se conserva un año): los contadores del limitador solo guardan las últimas ventanas, así que ya no
cubrían días. «Límites aplicados» sigue saliendo de esos contadores y lo dice en el texto.
"""
import io
import secrets
import time
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import RequestFactory
from django.utils import timezone

from apps.security.models import RateLimitBucket
from apps.simulation.models import AuditLog
from apps.simulation.services import audit_service
from shared.testing import purge_audit_rows, rewrite_audit_rows

pytestmark = [pytest.mark.req("SIEP-RNF-02"), pytest.mark.security, pytest.mark.django_db]

User = get_user_model()
DIA = 86400
IP_DE_PRUEBA = "203.0.113.9"  # bloque de documentación (RFC 5737): no es una dirección real


@pytest.fixture
def base_vacia():
    """La base de pruebas trae datos sembrados hoy. Se retrasan y se borran dentro de la transacción de la prueba,
    que se deshace al terminar, para que las ventanas empiecen vacías."""
    User.objects.update(created_at=timezone.now() - timedelta(days=365))
    RateLimitBucket.objects.all().delete()
    purge_audit_rows(AuditLog.objects.all())


def _informe(*args):
    salida = io.StringIO()
    call_command("security_report", *args, stdout=salida)
    return salida.getvalue()


def _contador(alcance, cuenta, dias_atras=0):
    return RateLimitBucket.objects.create(
        scope=alcance,
        key_hash=secrets.token_hex(32),
        window_start=int(time.time()) - dias_atras * DIA,
        count=cuenta,
    )


def _usuario(rol):
    return User.objects.create_user(
        email=f"{secrets.token_hex(6)}@prueba.test",
        password=secrets.token_urlsafe(24),
        nombre="Prueba",
        apellido="Informe",
        role=rol,
    )


def _auditar(accion, contexto=None, dias_atras=0, recurso="USER", recurso_id=None):
    """Una fila de auditoría como la dejaría la aplicación, con su fecha retrasada ``dias_atras`` días."""
    audit_service.record(accion, recurso, recurso_id, contexto or {})
    fila = AuditLog.objects.filter(action=accion).order_by("-id").first()
    if dias_atras:
        rewrite_audit_rows(AuditLog.objects.filter(pk=fila.pk), occurred_at=timezone.now() - timedelta(days=dias_atras))
    return fila


def test_sin_datos_imprime_ceros(base_vacia):
    salida = _informe()

    assert "últimos 7 días" in salida
    assert "Fallos de auditoría: 0" in salida
    assert "  login_ip: 0" in salida
    assert "Fallos de inicio de sesión: 0" in salida
    assert "Cuentas nuevas con rol ADMIN o PROFESOR: 0" in salida
    assert "Informes exportados: 0" in salida


def test_los_limites_aplicados_dicen_que_salen_de_la_ventana_reciente_del_limitador(base_vacia):
    assert "ventana reciente del limitador" in _informe()


def test_cuenta_fallos_de_auditoria_y_limites_de_la_ventana_del_limitador(base_vacia):
    _contador("audit_failure", 3)
    _contador("audit_failure", 2, dias_atras=3)
    _contador("audit_failure", 9, dias_atras=10)  # fuera de la ventana de 7 días
    _contador("login_fail_account_ip", 7)  # su tope es 5: una ventana aplicada
    _contador("login_fail_account", 4)  # su tope es 30: no aplicado
    _contador("audit_login_fail", 12)  # su tope es 10: pasó del tope de filas de auditoría

    salida = _informe("--days", "7")

    assert "Fallos de auditoría: 5" in salida
    assert "  login_fail_account_ip: 1" in salida
    assert "  login_fail_account: 0" in salida
    assert "  audit_login_fail: 1" in salida
    assert "  audit_failure:" not in salida  # un contador no es un límite aplicado


def test_los_fallos_de_inicio_de_sesion_salen_de_la_auditoria_y_no_de_los_contadores(base_vacia):
    _contador("login_fail_account_ip", 7)  # lo que contaba antes de S4-1: ya no entra en el recuento
    _contador("login_fail_account", 4)
    for _ in range(3):
        _auditar("LOGIN_FAILED", {"emailHash": secrets.token_hex(32), "reason": "bad_password"})
    _auditar("LOGIN_FAILED", {"emailHash": secrets.token_hex(32), "reason": "unknown_account"}, dias_atras=3)
    _auditar("LOGIN_FAILED", {"emailHash": secrets.token_hex(32), "reason": "inactive"}, dias_atras=10)  # fuera
    _auditar("LOGIN_SUCCEEDED", {"provider": "password"})  # no es un fallo

    salida = _informe("--days", "7")

    assert "Fallos de inicio de sesión: 4" in salida
    assert "Fallos de inicio de sesión: 5" in _informe("--days", "30")


def test_los_fallos_de_inicio_de_sesion_tambien_se_cuentan_con_la_etiqueta_canonica(base_vacia):
    """Las filas pueden traer el código crudo (``LOGIN_FAILED``) o la etiqueta (``sesion.fallar``)."""
    AuditLog.objects.create(action="sesion.fallar", context_json="{}", retention_until=timezone.now() + timedelta(days=360))

    assert "Fallos de inicio de sesión: 1" in _informe()


def test_cuenta_los_informes_exportados_desde_la_auditoria(base_vacia):
    _auditar("REPORT_EXPORTED", {"groupId": 4}, recurso="GRUPO", recurso_id=4)
    _auditar("REPORT_EXPORTED", {"groupId": 5}, dias_atras=2, recurso="GRUPO", recurso_id=5)
    _auditar("REPORT_EXPORTED", {"groupId": 6}, dias_atras=30, recurso="GRUPO", recurso_id=6)  # fuera de la ventana
    _auditar("REPORT_VIEWED", {"groupId": 4}, recurso="GRUPO", recurso_id=4)  # leer no es exportar

    assert "Informes exportados: 2" in _informe("--days", "7")


def test_cuenta_las_cuentas_con_rol_privilegiado_nuevo_solo_con_id_y_rol(base_vacia):
    admin, profesor, estudiante, antigua = _usuario("ADMIN"), _usuario("PROFESOR"), _usuario("ESTUDIANTE"), _usuario("ADMIN")
    ascendida, degradada, por_comando = _usuario("PROFESOR"), _usuario("ESTUDIANTE"), _usuario("ADMIN")
    _auditar("USER_CREATED", {"targetId": admin.pk, "role": "ADMIN", "activo": True})
    _auditar("USER_CREATED", {"targetId": profesor.pk, "role": "PROFESOR", "activo": True})
    _auditar("USER_CREATED", {"targetId": estudiante.pk, "role": "ESTUDIANTE", "activo": True})  # no es privilegiada
    _auditar("USER_CREATED", {"targetId": antigua.pk, "role": "ADMIN", "activo": True}, dias_atras=30)  # fuera
    _auditar("USER_ROLE_CHANGED", {"targetId": ascendida.pk, "changed": ["role"], "role": "PROFESOR", "previousRole": "ESTUDIANTE"})
    _auditar("USER_ROLE_CHANGED", {"targetId": degradada.pk, "changed": ["role"], "role": "ESTUDIANTE", "previousRole": "PROFESOR"})
    _auditar("ADMIN_CREATED_BY_COMMAND", {"targetId": por_comando.pk})  # el primer ADMIN nace por comando: es ADMIN

    salida = _informe("--days", "7")

    assert "Cuentas nuevas con rol ADMIN o PROFESOR: 4" in salida
    assert f"  id={admin.pk} rol=ADMIN" in salida
    assert f"  id={profesor.pk} rol=PROFESOR" in salida
    assert f"  id={ascendida.pk} rol=PROFESOR" in salida
    assert f"  id={por_comando.pk} rol=ADMIN" in salida
    assert f"id={estudiante.pk}" not in salida and f"id={antigua.pk}" not in salida and f"id={degradada.pk}" not in salida
    assert "ESTUDIANTE" not in salida


def test_una_fila_sin_contexto_legible_no_rompe_el_informe(base_vacia):
    AuditLog.objects.create(action="USER_CREATED", context_json="esto no es json", retention_until=timezone.now())
    AuditLog.objects.create(action="USER_CREATED", context_json="[1, 2]", retention_until=timezone.now())
    AuditLog.objects.create(action="USER_CREATED", context_json='{"role": "ADMIN"}', retention_until=timezone.now())

    assert "Cuentas nuevas con rol ADMIN o PROFESOR: 0" in _informe()


def test_no_imprime_correos_ni_direcciones_ip_ni_hashes(base_vacia):
    usuario = _usuario("ADMIN")
    hash_del_correo = secrets.token_hex(32)
    AuditLog.objects.create(
        actor=usuario,
        action="ADMIN_CREATE_NODE",
        ip_address=IP_DE_PRUEBA,
        context_json="{}",
        retention_until=timezone.now() + timedelta(days=360),
    )
    peticion = RequestFactory().post("/x", REMOTE_ADDR=IP_DE_PRUEBA)
    peticion.user = AnonymousUser()
    audit_service.bind_request(peticion)  # las filas siguientes guardan esa IP, como las de una petición real
    try:
        _auditar("LOGIN_FAILED", {"emailHash": hash_del_correo, "reason": "bad_password"})
        _auditar("USER_CREATED", {"targetId": usuario.pk, "role": "ADMIN", "activo": True})
        _auditar("REPORT_EXPORTED", {"groupId": 1}, recurso="GRUPO", recurso_id=1)
    finally:
        audit_service.clear_request()
    assert AuditLog.objects.filter(action="LOGIN_FAILED", ip_address=IP_DE_PRUEBA).exists()  # la IP sí está en la fila

    salida = _informe("--days", "7")

    assert "@" not in salida
    assert IP_DE_PRUEBA not in salida
    assert hash_del_correo not in salida


def test_los_dias_deben_estar_entre_1_y_90(base_vacia):
    with pytest.raises(CommandError):
        _informe("--days", "0")
    with pytest.raises(CommandError):
        _informe("--days", "91")
    assert "últimos 90 días" in _informe("--days", "90")
