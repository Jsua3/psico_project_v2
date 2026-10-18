"""``security_report`` (S4-3): recuentos de los últimos días, sin correos ni direcciones IP. Solo lee e imprime."""
import io
import secrets
import time
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from apps.security.models import RateLimitBucket
from apps.simulation.models import AuditLog

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


def _usuario(rol, dias_atras=0):
    usuario = User.objects.create_user(
        email=f"{secrets.token_hex(6)}@prueba.test",
        password=secrets.token_urlsafe(24),
        nombre="Prueba",
        apellido="Informe",
        role=rol,
    )
    if dias_atras:
        User.objects.filter(pk=usuario.pk).update(created_at=timezone.now() - timedelta(days=dias_atras))
    return usuario


def test_sin_datos_imprime_ceros(base_vacia):
    salida = _informe()

    assert "últimos 7 días" in salida
    assert "Fallos de auditoría: 0" in salida
    assert "  login_ip: 0" in salida
    assert "Fallos de inicio de sesión: 0" in salida
    assert "Cuentas nuevas con rol ADMIN o PROFESOR: 0" in salida
    assert "Informes exportados: 0" in salida


def test_cuenta_fallos_de_auditoria_limites_y_logins_de_la_ventana(base_vacia):
    _contador("audit_failure", 3)
    _contador("audit_failure", 2, dias_atras=3)
    _contador("audit_failure", 9, dias_atras=10)  # fuera de la ventana de 7 días
    _contador("login_fail_account_ip", 7)  # su tope es 5: una ventana aplicada
    _contador("login_fail_account", 4)  # su tope es 30: no aplicado

    salida = _informe("--days", "7")

    assert "Fallos de auditoría: 5" in salida
    assert "Fallos de inicio de sesión: 11" in salida
    assert "  login_fail_account_ip: 1" in salida
    assert "  login_fail_account: 0" in salida
    assert "  audit_failure:" not in salida  # un contador no es un límite aplicado


def test_cuenta_las_cuentas_nuevas_de_admin_y_profesor_solo_con_id_y_rol(base_vacia):
    admin = _usuario("ADMIN")
    profesor = _usuario("PROFESOR")
    _usuario("ESTUDIANTE")
    _usuario("ADMIN", dias_atras=30)  # antigua: fuera de la ventana

    salida = _informe("--days", "7")

    assert "Cuentas nuevas con rol ADMIN o PROFESOR: 2" in salida
    assert f"  id={admin.pk} rol=ADMIN" in salida
    assert f"  id={profesor.pk} rol=PROFESOR" in salida
    assert "ESTUDIANTE" not in salida


def test_no_imprime_correos_ni_direcciones_ip(base_vacia):
    usuario = _usuario("ADMIN")
    AuditLog.objects.create(
        actor=usuario,
        action="ADMIN_CREATE_NODE",
        ip_address=IP_DE_PRUEBA,
        context_json="{}",
        retention_until=timezone.now() + timedelta(days=360),
    )

    salida = _informe("--days", "7")

    assert "@" not in salida
    assert IP_DE_PRUEBA not in salida


def test_los_dias_deben_estar_entre_1_y_90(base_vacia):
    with pytest.raises(CommandError):
        _informe("--days", "0")
    with pytest.raises(CommandError):
        _informe("--days", "91")
    assert "últimos 90 días" in _informe("--days", "90")
