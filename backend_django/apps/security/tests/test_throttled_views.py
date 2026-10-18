"""Los límites en las rutas de entrada (S1-2, DJA-2), de punta a punta con el cliente HTTP de prueba.

Con el limitador encendido (``settings.SIEP_THROTTLE_ENABLED = True``) el reloj está fijo: ninguna ventana cambia
a mitad de una prueba. Cada prueba crea sus cuentas y usa sus propias IP.
"""
import secrets
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from rest_framework.test import APIClient

from apps.security import limiter
from apps.security.limits import LIMITS, Limit
from apps.security.models import RateLimitBucket

pytestmark = [pytest.mark.req("DJA-2"), pytest.mark.security, pytest.mark.django_db]

User = get_user_model()
LOGIN = "/api/auth/login"
ACCESO = "/api/auth/access-request"
GOOGLE = "/api/auth/google"
INSTANTE = 1_800_000_000.0


@pytest.fixture
def reloj(monkeypatch):
    instante = {"t": INSTANTE}
    monkeypatch.setattr(limiter, "_now", lambda: instante["t"])
    return instante


@pytest.fixture
def limitador(settings):
    settings.SIEP_THROTTLE_ENABLED = True
    return settings


@pytest.fixture
def cliente():
    return APIClient()


@pytest.fixture
def clave():
    """Una contraseña nueva en cada prueba: nunca un literal."""
    return secrets.token_urlsafe(32)


@pytest.fixture
def clave_hash(clave):
    # Se calcula una vez por prueba: BCrypt es lento y cada cuenta comparte la misma contraseña.
    return make_password(clave)


def _cuenta(clave_hash):
    return User.objects.create(
        email=f"alumna-{uuid.uuid4().hex[:12]}@ejemplo.org",
        password=clave_hash,
        nombre="Prueba",
        apellido="Limite",
        role="ESTUDIANTE",
    )


def _login(cliente, correo, clave, ip):
    return cliente.post(LOGIN, {"email": correo, "password": clave}, format="json", REMOTE_ADDR=ip)


def _solicitud(cliente, correo, ip):
    return cliente.post(
        ACCESO, {"nombre": "Ana", "apellido": "Prueba", "email": correo}, format="json", REMOTE_ADDR=ip
    )


def _correo_nuevo():
    return f"solicitud-{uuid.uuid4().hex[:10]}@ejemplo.org"


# ── Bloqueo por fallos de inicio de sesión ──────────────────────────────────────────────────────────────


def test_cinco_fallos_de_una_cuenta_bloquean_el_sexto_intento_aunque_la_clave_sea_buena(
    cliente, reloj, limitador, clave, clave_hash
):
    cuenta = _cuenta(clave_hash)
    erronea = secrets.token_urlsafe(32)
    for _ in range(5):
        assert _login(cliente, cuenta.email, erronea, ip="198.51.100.1").status_code == 401

    respuesta = _login(cliente, cuenta.email, clave, ip="198.51.100.1")

    assert respuesta.status_code == 429
    assert respuesta.data["code"] == "THROTTLED"
    assert int(respuesta["Retry-After"]) >= 1


def test_treinta_fallos_repartidos_entre_ips_bloquean_la_cuenta_desde_otra_ip(
    cliente, reloj, limitador, clave, clave_hash
):
    cuenta = _cuenta(clave_hash)
    erronea = secrets.token_urlsafe(32)
    for numero in range(1, 31):
        assert _login(cliente, cuenta.email, erronea, ip=f"198.51.100.{numero}").status_code == 401

    assert _login(cliente, cuenta.email, clave, ip="198.51.100.200").status_code == 429


def test_cuarenta_inicios_correctos_desde_una_ip_no_reciben_ningun_429(cliente, reloj, limitador, clave, clave_hash):
    cuentas = [_cuenta(clave_hash) for _ in range(40)]

    for cuenta in cuentas:
        assert _login(cliente, cuenta.email, clave, ip="10.20.30.40").status_code == 200


def test_con_la_bandera_apagada_el_sexto_intento_no_da_429(cliente, reloj, settings, clave, clave_hash):
    settings.SIEP_THROTTLE_ENABLED = False
    cuenta = _cuenta(clave_hash)
    erronea = secrets.token_urlsafe(32)
    for _ in range(5):
        assert _login(cliente, cuenta.email, erronea, ip="198.51.100.1").status_code == 401

    assert _login(cliente, cuenta.email, clave, ip="198.51.100.1").status_code == 200


def test_la_tabla_no_guarda_ni_el_correo_ni_la_ip_en_claro(cliente, reloj, limitador, clave, clave_hash):
    cuenta = _cuenta(clave_hash)
    ip = "198.51.100.99"

    _login(cliente, cuenta.email, secrets.token_urlsafe(32), ip=ip)

    filas = list(RateLimitBucket.objects.all())
    assert filas
    texto = " ".join(f"{fila.scope} {fila.key_hash} {fila.window_start} {fila.count}" for fila in filas)
    assert cuenta.email not in texto and ip not in texto


# ── Volumen por IP y solicitudes de acceso (cableadas en la parte 4) ─────────────────────────────────────


def test_volumen_por_ip_login_ip_da_429_al_pasarse_del_limite(cliente, reloj, limitador, clave, clave_hash, monkeypatch):
    monkeypatch.setitem(LIMITS, "login_ip", Limit(3, 600))
    cuentas = [_cuenta(clave_hash) for _ in range(4)]

    for cuenta in cuentas[:3]:
        assert _login(cliente, cuenta.email, clave, ip="198.51.100.9").status_code == 200

    assert _login(cliente, cuentas[3].email, clave, ip="198.51.100.9").status_code == 429


def test_tercer_intento_con_el_mismo_correo_en_un_dia_da_429(cliente, reloj, limitador):
    correo = _correo_nuevo()

    assert _solicitud(cliente, correo, "198.51.100.61").status_code != 429
    assert _solicitud(cliente, correo, "198.51.100.62").status_code != 429
    assert _solicitud(cliente, correo, "198.51.100.63").status_code == 429


def test_sexto_intento_desde_la_misma_ip_da_429(cliente, reloj, limitador):
    for _ in range(5):
        assert _solicitud(cliente, _correo_nuevo(), "198.51.100.70").status_code != 429

    assert _solicitud(cliente, _correo_nuevo(), "198.51.100.70").status_code == 429


def test_google_limita_por_ip(cliente, reloj, limitador, monkeypatch):
    monkeypatch.setitem(LIMITS, "google_ip", Limit(1, 600))

    assert cliente.post(GOOGLE, {"credential": "x"}, format="json", REMOTE_ADDR="198.51.100.80").status_code != 429
    assert cliente.post(GOOGLE, {"credential": "x"}, format="json", REMOTE_ADDR="198.51.100.80").status_code == 429


def test_el_429_del_login_trae_la_forma_throttled_con_la_espera_y_la_cabecera(
    cliente, reloj, limitador, clave, clave_hash
):
    cuenta = _cuenta(clave_hash)
    for _ in range(5):
        _login(cliente, cuenta.email, secrets.token_urlsafe(32), ip="198.51.100.1")

    respuesta = _login(cliente, cuenta.email, clave, ip="198.51.100.1")

    espera = int(respuesta["Retry-After"])
    assert respuesta.status_code == 429
    assert respuesta.data == {
        "success": False,
        "code": "THROTTLED",
        "message": f"Demasiados intentos. Espera {espera} s e inténtalo de nuevo.",
        "retryAfter": espera,
    }
