"""Los settings de producción que el despliegue necesita (E0-3, revisión de fase)."""
import importlib
import runpy
from pathlib import Path

import pytest
from django.core.exceptions import ImproperlyConfigured

from psychosim.settings import base as base_settings

pytestmark = pytest.mark.req("RNF-06")

BASE_ENV = {
    "DJANGO_SECRET_KEY": "una-clave-de-prueba-que-no-es-la-insegura-por-defecto-123456",
    "DJANGO_ALLOWED_HOSTS": "siep.example.edu.co",
    "DATABASE_URL": "postgres://usuario:clave@bd.example:5432/siep",
    "JWT_SECRET": "otra-clave-de-prueba-de-al-menos-sesenta-y-cuatro-caracteres-0123456789",
    # E2-12: el correo de producción es real y el aviso de solicitudes tiene destino.
    "EMAIL_BACKEND": "django.core.mail.backends.smtp.EmailBackend",
    "ACCESS_REQUEST_NOTIFY_EMAILS": "admin@siep.example.edu.co",
    # S1-1: proxies de confianza delante de Django; producción la exige (sin valor por defecto).
    "SIEP_TRUSTED_PROXIES": "1",
}


@pytest.fixture(autouse=True)
def _restore_base_settings(monkeypatch):
    """``production`` hace ``from .base import *``: se recarga ``base`` con el entorno de la prueba y, al terminar,
    se deshace ese entorno ANTES de recargarlo (un SIEP_TRUSTED_PROXIES no numérico haría fallar la recarga)."""
    yield
    monkeypatch.undo()
    importlib.reload(base_settings)


def _production(monkeypatch, *, recargar_base=True, **overrides):
    env = {**BASE_ENV, **overrides}
    for name in (
        "RAILWAY_PUBLIC_DOMAIN", "DJANGO_ALLOWED_HOSTS", "DATABASE_URL", "EMAIL_BACKEND",
        "ACCESS_REQUEST_NOTIFY_EMAILS", "ACCESS_REQUEST_NOTIFY_DISABLED", "SIEP_ALLOW_CONSOLE_EMAIL",
        "SIEP_TRUSTED_PROXIES", "DJANGO_SECURE_SSL_REDIRECT", "SIEP_HSTS_SECONDS",
    ):
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        if value is not None:
            monkeypatch.setenv(name, value)
    if recargar_base:  # ``base`` con un valor no numérico lanzaría ValueError antes que production
        importlib.reload(base_settings)  # production hace ``from .base import *``
    return runpy.run_module("psychosim.settings.production", run_name="production_bajo_prueba")


def test_el_healthcheck_de_railway_pasa_el_filtro_de_hosts(monkeypatch):
    # Railway sondea /api/health con «Host: healthcheck.railway.app»; sin este host
    # Django responde 400 (DisallowedHost) y el despliegue nunca se promueve.
    settings = _production(monkeypatch)

    assert "healthcheck.railway.app" in settings["ALLOWED_HOSTS"]
    assert "siep.example.edu.co" in settings["ALLOWED_HOSTS"]


def test_el_host_del_healthcheck_no_entra_a_los_origenes_de_csrf(monkeypatch):
    settings = _production(monkeypatch)

    assert "https://healthcheck.railway.app" not in settings["CSRF_TRUSTED_ORIGINS"]
    assert "https://siep.example.edu.co" in settings["CSRF_TRUSTED_ORIGINS"]


def test_sin_hosts_configurados_sigue_fallando_al_arrancar(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="DJANGO_ALLOWED_HOSTS"):
        _production(monkeypatch, DJANGO_ALLOWED_HOSTS=None)


@pytest.mark.parametrize("database_url", [None, "postgres://u:p@h:5432/d"])
def test_la_conexion_a_la_bd_tiene_un_tope_de_espera(monkeypatch, database_url):
    # Sin tope, una BD inalcanzable bloquea /api/health ~130 s (el valor por defecto de psycopg)
    # y gunicorn mata el worker a los 120 s.
    monkeypatch.delenv("DATABASE_URL", raising=False)
    if database_url:
        monkeypatch.setenv("DATABASE_URL", database_url)

    base_py = Path(__file__).resolve().parents[2] / "psychosim" / "settings" / "base.py"
    base = runpy.run_path(str(base_py), run_name="base_bajo_prueba")

    assert base["DATABASES"]["default"]["OPTIONS"]["connect_timeout"] <= 10


# ── S1-1 · SIEP_TRUSTED_PROXIES: obligatoria en producción y un entero ≥ 0 ────────────────

@pytest.mark.req("SIEP-RNF-02")
@pytest.mark.security
def test_siep_trusted_proxies_es_obligatoria_en_produccion(monkeypatch):
    # Sin valor por defecto: sin declarar cuántos proxies hay delante, la auditoría anotaría IPs falsificables.
    with pytest.raises(ImproperlyConfigured, match="SIEP_TRUSTED_PROXIES"):
        _production(monkeypatch, SIEP_TRUSTED_PROXIES=None)


@pytest.mark.req("SIEP-RNF-02")
@pytest.mark.security
@pytest.mark.parametrize("valor", ["abc", "-1", "1.5"])
def test_siep_trusted_proxies_rechaza_lo_que_no_es_un_entero_no_negativo(monkeypatch, valor):
    with pytest.raises(ImproperlyConfigured, match="SIEP_TRUSTED_PROXIES"):
        _production(monkeypatch, recargar_base=False, SIEP_TRUSTED_PROXIES=valor)


@pytest.mark.req("SIEP-RNF-02")
@pytest.mark.security
@pytest.mark.parametrize("valor", ["0", "1"])
def test_siep_trusted_proxies_acepta_cero_y_uno(monkeypatch, valor):
    settings = _production(monkeypatch, SIEP_TRUSTED_PROXIES=valor)

    assert settings["SIEP_TRUSTED_PROXIES"] == int(valor)


# ── S2-2 · HTTPS forzado y HSTS escalonado ──────────────────────────────────────────────────

@pytest.mark.req("RNF-02")
@pytest.mark.security
def test_la_redireccion_a_https_viene_activa_y_solo_exime_el_healthcheck(monkeypatch):
    # Por defecto Django redirige a HTTPS; la única ruta exenta es /api/health, que Railway sondea por HTTP plano.
    settings = _production(monkeypatch)

    assert settings["SECURE_SSL_REDIRECT"] is True
    assert settings["SECURE_REDIRECT_EXEMPT"] == [r"^api/health$"]


@pytest.mark.req("RNF-02")
@pytest.mark.security
@pytest.mark.parametrize("valor", ["false", "FALSE", " false "])
def test_solo_false_explicito_apaga_la_redireccion(monkeypatch, valor):
    settings = _production(monkeypatch, DJANGO_SECURE_SSL_REDIRECT=valor)

    assert settings["SECURE_SSL_REDIRECT"] is False


@pytest.mark.req("RNF-02")
@pytest.mark.security
@pytest.mark.parametrize("valor", ["true", "", "0", "no"])
def test_cualquier_otro_valor_deja_la_redireccion_encendida(monkeypatch, valor):
    settings = _production(monkeypatch, DJANGO_SECURE_SSL_REDIRECT=valor)

    assert settings["SECURE_SSL_REDIRECT"] is True


@pytest.mark.req("RNF-02")
@pytest.mark.security
def test_hsts_arranca_en_3600_sin_subdominios_ni_preload(monkeypatch):
    # Subdominios y preload obligan a HTTPS en todo el dominio: no se activan hasta fijar el dominio (SD-5).
    settings = _production(monkeypatch)

    assert settings["SECURE_HSTS_SECONDS"] == 3600
    assert settings["SECURE_HSTS_INCLUDE_SUBDOMAINS"] is False
    assert settings["SECURE_HSTS_PRELOAD"] is False


@pytest.mark.req("RNF-02")
@pytest.mark.security
@pytest.mark.parametrize("valor", ["0", "86400", "604800", "15552000", "63072000"])
def test_siep_hsts_seconds_acepta_los_escalones_y_los_limites(monkeypatch, valor):
    settings = _production(monkeypatch, SIEP_HSTS_SECONDS=valor)

    assert settings["SECURE_HSTS_SECONDS"] == int(valor)


@pytest.mark.req("RNF-02")
@pytest.mark.security
@pytest.mark.parametrize(
    ("valor", "causa"),
    [
        ("abc", "no es un entero"),
        ("1.5", "no es un entero"),
        ("3600s", "no es un entero"),
        ("", "no es un entero"),
        ("-1", "fuera del rango"),
        ("63072001", "fuera del rango"),
    ],
)
def test_siep_hsts_seconds_rechaza_lo_que_no_es_un_entero_entre_0_y_63072000(monkeypatch, valor, causa):
    with pytest.raises(ImproperlyConfigured, match=f"SIEP_HSTS_SECONDS.*{causa}") as error:
        _production(monkeypatch, SIEP_HSTS_SECONDS=valor)

    # La causa va en el mensaje; el valor leído no, ni en el texto ni en una excepción encadenada.
    assert not valor or valor not in str(error.value)
    assert error.value.__context__ is None
