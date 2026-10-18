"""S1-1 · ``shared.client_ip.client_ip``: la IP del cliente según los saltos de confianza (SIEP-RNF-02).

``SIEP_TRUSTED_PROXIES = n`` cuenta los proxies de confianza delante de Django; cada uno añade la dirección que
ve a la cola de ``X-Forwarded-For``. El cliente real es la entrada que queda a ``n`` posiciones desde la derecha:
lo que el cliente escribió va a la izquierda y no cuenta.
"""
import pytest
from django.test import RequestFactory

from shared.client_ip import client_ip

pytestmark = [pytest.mark.req("SIEP-RNF-02"), pytest.mark.security]

#: Dirección de ``REMOTE_ADDR`` de las pruebas (bloque de documentación, RFC 5737).
REMOTE = "203.0.113.7"


def _peticion(cabecera=None, remote=REMOTE):
    peticion = RequestFactory().get("/")
    if cabecera is not None:
        peticion.META["HTTP_X_FORWARDED_FOR"] = cabecera
    if remote is None:
        peticion.META.pop("REMOTE_ADDR", None)
    else:
        peticion.META["REMOTE_ADDR"] = remote
    return peticion


def test_sin_saltos_de_confianza_se_ignora_la_cabecera(settings):
    settings.SIEP_TRUSTED_PROXIES = 0

    assert client_ip(_peticion("6.6.6.6, 9.9.9.9")) == REMOTE


def test_con_un_salto_se_toma_la_ultima_entrada(settings):
    settings.SIEP_TRUSTED_PROXIES = 1

    assert client_ip(_peticion("9.9.9.9")) == "9.9.9.9"


def test_con_un_salto_una_cabecera_falsificada_a_la_izquierda_no_cambia_el_resultado(settings):
    settings.SIEP_TRUSTED_PROXIES = 1

    assert client_ip(_peticion("6.6.6.6, 9.9.9.9")) == "9.9.9.9"


def test_con_dos_saltos_se_toma_la_penultima_entrada(settings):
    settings.SIEP_TRUSTED_PROXIES = 2

    assert client_ip(_peticion("1.1.1.1, 2.2.2.2, 3.3.3.3")) == "2.2.2.2"


@pytest.mark.parametrize("cabecera", [None, "", "   ", " , ", "9.9.9.9"])
def test_con_menos_entradas_que_saltos_o_sin_cabecera_se_usa_remote_addr(settings, cabecera):
    settings.SIEP_TRUSTED_PROXIES = 2

    assert client_ip(_peticion(cabecera)) == REMOTE


@pytest.mark.parametrize("entrada", ["no-es-ip", "9.9.9.9:443", "999.1.1.1"])
def test_una_entrada_que_no_es_ip_se_usa_remote_addr(settings, entrada):
    settings.SIEP_TRUSTED_PROXIES = 1

    assert client_ip(_peticion(f"6.6.6.6, {entrada}")) == REMOTE


@pytest.mark.parametrize(
    ("cabecera", "saltos", "esperada"),
    [
        ("  9.9.9.9  ", 1, "9.9.9.9"),
        ("1.1.1.1,,2.2.2.2", 1, "2.2.2.2"),
        ("1.1.1.1,,2.2.2.2", 2, "1.1.1.1"),
    ],
)
def test_recorta_espacios_y_descarta_entradas_vacias(settings, cabecera, saltos, esperada):
    settings.SIEP_TRUSTED_PROXIES = saltos

    assert client_ip(_peticion(cabecera)) == esperada


@pytest.mark.parametrize("cabecera", ["2001:db8::1", "2001:0db8:0000:0000:0000:0000:0000:0001"])
def test_ipv6_sale_en_su_forma_comprimida(settings, cabecera):
    settings.SIEP_TRUSTED_PROXIES = 1

    assert client_ip(_peticion(f"9.9.9.9, {cabecera}")) == "2001:db8::1"


def test_sin_remote_addr_devuelve_cadena_vacia(settings):
    settings.SIEP_TRUSTED_PROXIES = 0
    assert client_ip(_peticion(remote=None)) == ""

    settings.SIEP_TRUSTED_PROXIES = 1
    assert client_ip(_peticion("no-es-ip", remote=None)) == ""


def test_un_numero_negativo_nunca_lee_por_la_izquierda(settings):
    # Con -1, la entrada a «-n» posiciones sería la segunda por la izquierda: lo que escribió el cliente.
    settings.SIEP_TRUSTED_PROXIES = -1

    assert client_ip(_peticion("6.6.6.6, 9.9.9.9")) == REMOTE
