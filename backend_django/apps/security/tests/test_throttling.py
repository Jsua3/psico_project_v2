"""Clases de límite por alcance (S1-2, DJA-2): cuentan con el limitador, por IP de cliente o por cuenta.

Las pruebas de las vistas (qué ruta lleva qué clase, el 429 de punta a punta) están en ``test_cableado.py`` y
``test_throttled_views.py``; aquí, la lógica de cada clase y el invariante de las órdenes de crisis.
"""
import logging
from types import SimpleNamespace

import pytest
from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.security import limiter
from apps.security.limits import LIMITS, Limit
from apps.security.models import RateLimitBucket
from apps.security.throttling import (
    AccessRequestEmailThrottle,
    AccessRequestGlobalThrottle,
    HeavyUserThrottle,
    ImportUserThrottle,
    LoginIpThrottle,
    PasswordChangeUserThrottle,
    ScopedThrottle,
)

pytestmark = [pytest.mark.req("DJA-2"), pytest.mark.security]

INSTANTE = 1_800_000_000.0
IP = "203.0.113.10"


@pytest.fixture
def reloj(monkeypatch):
    instante = {"t": INSTANTE}
    monkeypatch.setattr(limiter, "_now", lambda: instante["t"])
    return instante


@pytest.fixture
def limitador_encendido(settings):
    settings.SIEP_THROTTLE_ENABLED = True
    return settings


def _peticion(datos=None, ip=IP, usuario=None):
    """Una petición de DRF con su IP (``REMOTE_ADDR``) y su usuario (anónimo por defecto)."""
    django_request = APIRequestFactory().post("/prueba", datos or {}, format="json", REMOTE_ADDR=ip)
    request = Request(django_request, parsers=[JSONParser()])
    request.user = usuario if usuario is not None else AnonymousUser()
    return request


def test_permite_el_limite_y_bloquea_el_siguiente(db, reloj, limitador_encendido, monkeypatch):
    monkeypatch.setitem(LIMITS, "login_ip", Limit(3, 600))

    assert [LoginIpThrottle().allow_request(_peticion(), None) for _ in range(3)] == [True, True, True]

    bloqueada = LoginIpThrottle()
    assert bloqueada.allow_request(_peticion(), None) is False
    assert bloqueada.wait() >= 1


def test_las_peticiones_de_ips_distintas_no_comparten_contador(db, reloj, limitador_encendido, monkeypatch):
    monkeypatch.setitem(LIMITS, "login_ip", Limit(1, 600))

    assert LoginIpThrottle().allow_request(_peticion(ip="198.51.100.1"), None) is True
    assert LoginIpThrottle().allow_request(_peticion(ip="198.51.100.1"), None) is False
    assert LoginIpThrottle().allow_request(_peticion(ip="198.51.100.2"), None) is True


def test_la_clave_de_ip_es_el_hash_de_la_ip_del_cliente():
    assert LoginIpThrottle().key(_peticion(), None) == limiter.key_hash(IP)


def test_sin_correo_utilizable_la_peticion_pasa_sin_contar(db, reloj, limitador_encendido):
    for datos in ({}, {"email": ""}, {"email": "   "}, {"email": 123}):
        assert AccessRequestEmailThrottle().allow_request(_peticion(datos), None) is True

    assert not RateLimitBucket.objects.exists()


def test_el_correo_se_normaliza_antes_de_contarlo():
    con_mayusculas = AccessRequestEmailThrottle().key(_peticion({"email": "  Alumna@Ejemplo.ORG "}), None)
    en_minusculas = AccessRequestEmailThrottle().key(_peticion({"email": "alumna@ejemplo.org"}), None)

    assert con_mayusculas == en_minusculas
    assert con_mayusculas is not None


def test_la_solicitud_global_usa_una_clave_constante():
    primera = AccessRequestGlobalThrottle().key(_peticion({"email": "uno@ejemplo.org"}), None)
    segunda = AccessRequestGlobalThrottle().key(_peticion({"email": "dos@ejemplo.org"}), None)

    assert primera == segunda


def test_las_clases_de_persona_cuentan_por_cuenta_y_sin_cuenta_pasan(db, reloj, limitador_encendido, monkeypatch):
    monkeypatch.setitem(LIMITS, "import_user", Limit(1, 3600))
    ana = SimpleNamespace(pk=7, is_authenticated=True)
    beto = SimpleNamespace(pk=8, is_authenticated=True)

    assert ImportUserThrottle().allow_request(_peticion(usuario=ana), None) is True
    assert ImportUserThrottle().allow_request(_peticion(usuario=ana), None) is False
    # La misma IP con otra cuenta tiene su propio contador.
    assert ImportUserThrottle().allow_request(_peticion(usuario=beto), None) is True
    assert ImportUserThrottle().allow_request(_peticion(usuario=AnonymousUser()), None) is True


def test_las_tres_clases_de_persona_tienen_su_propio_alcance():
    assert [clase.scope for clase in (ImportUserThrottle, HeavyUserThrottle, PasswordChangeUserThrottle)] == [
        "import_user",
        "heavy_user",
        "password_change_user",
    ]


def test_si_la_base_no_responde_el_limite_deja_pasar_la_peticion(reloj, limitador_encendido, monkeypatch, caplog):
    class BaseCaida:
        def cursor(self):
            raise DatabaseError("fallo simulado")

    monkeypatch.setattr(limiter, "connection", BaseCaida())

    with caplog.at_level(logging.WARNING, logger="siep.security"):
        assert LoginIpThrottle().allow_request(_peticion(), None) is True

    registros = [registro for registro in caplog.records if registro.name == "siep.security"]
    assert [registro.fields["event"] for registro in registros] == ["throttle_backend_error"]


# Las órdenes de quien está en crisis (salir de forma segura, consultar o reanudar su intento) nunca tienen límite.
RUTAS_DE_CRISIS = (
    "api/simulation/attempts/<uuid:attempt_id>/safe-exit",
    "api/simulation/attempts/<uuid:attempt_id>/resume",
    "api/simulation/cases/<int:case_version_id>/active-attempt",
)


def _vistas_por_ruta():
    """La clase de vista de cada ruta del urlconf, por su texto (sin barra final)."""
    vistas = {}

    def recorrer(patrones, prefijo=""):
        for patron in patrones:
            if isinstance(patron, URLResolver):
                recorrer(patron.url_patterns, prefijo + str(patron.pattern))
            elif isinstance(patron, URLPattern):
                vistas[(prefijo + str(patron.pattern)).rstrip("/")] = getattr(patron.callback, "cls", None)

    recorrer(get_resolver().url_patterns)
    return vistas


def test_las_ordenes_de_crisis_no_tienen_alcance_de_limitacion():
    vistas = _vistas_por_ruta()
    for ruta in RUTAS_DE_CRISIS:
        vista = vistas.get(ruta)
        assert vista is not None, f"la ruta {ruta} no existe: el invariante debe nombrar rutas reales"
        con_alcance = [clase for clase in vista.throttle_classes if issubclass(clase, ScopedThrottle)]
        assert con_alcance == [], f"{ruta} no debe tener límite y tiene {con_alcance}"
