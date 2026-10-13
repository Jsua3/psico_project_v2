"""Los settings de producción que el despliegue necesita (E0-3, revisión de fase)."""
import runpy

import pytest
from django.core.exceptions import ImproperlyConfigured

pytestmark = pytest.mark.req("RNF-06")

BASE_ENV = {
    "DJANGO_SECRET_KEY": "una-clave-de-prueba-que-no-es-la-insegura-por-defecto-123456",
    "DJANGO_ALLOWED_HOSTS": "siep.example.edu.co",
    "DATABASE_URL": "postgres://usuario:clave@bd.example:5432/siep",
    "JWT_SECRET": "otra-clave-de-prueba-de-al-menos-sesenta-y-cuatro-caracteres-0123456789",
}


def _production(monkeypatch, **overrides):
    env = {**BASE_ENV, **overrides}
    for name in ("RAILWAY_PUBLIC_DOMAIN", "DJANGO_ALLOWED_HOSTS", "DATABASE_URL"):
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        if value is not None:
            monkeypatch.setenv(name, value)
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

    base = runpy.run_module("psychosim.settings.base", run_name="base_bajo_prueba")

    assert base["DATABASES"]["default"]["OPTIONS"]["connect_timeout"] <= 10
