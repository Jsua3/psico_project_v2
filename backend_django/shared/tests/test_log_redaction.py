"""S4-3 · Registros sin secretos: ``redact`` en el formateador JSON y el escenario de credenciales conocidas.

Los valores de prueba se generan en cada ejecución con ``secrets``: ninguna credencial literal en el código.
"""
import json
import logging
import re
import secrets
import sys
import time

import pytest
from django.contrib.auth import get_user_model
from django.test import Client, override_settings
from django.urls import path
from rest_framework.views import APIView

from apps.simulation.models import AuditLog
from apps.users.serializers import generate_access_token
from psychosim.urls import urlpatterns as urls_del_proyecto
from shared import jsonlog
from shared.jsonlog import JsonFormatter, RequestIdFilter

pytestmark = [pytest.mark.req("RNF-06"), pytest.mark.security]

User = get_user_model()
RUTA_CABECERA = "/prueba-registros/cabecera"
RUTA_CONTRASENA = "/prueba-registros/contrasena"


class VistaContrasena(APIView):
    """Escribe la contraseña que recibe en el texto de una excepción: el caso que el registro debe redactar."""

    authentication_classes = []
    permission_classes = []

    def post(self, request):
        raise RuntimeError(f"password={request.data['password']}")


class VistaCabecera(APIView):
    """Autenticada con JWT y falla mostrando la cabecera Authorization en el texto de la excepción."""

    def get(self, request):
        raise RuntimeError(f"cabecera recibida: {request.META.get('HTTP_AUTHORIZATION', '')}")


# URLconf de esta prueba: las rutas del proyecto (el login incluido) y dos vistas que fallan a propósito.
urlpatterns = [
    path("prueba-registros/contrasena", VistaContrasena.as_view()),
    path("prueba-registros/cabecera", VistaCabecera.as_view()),
    *urls_del_proyecto,
]


@pytest.fixture
def capturados():
    """Cada línea que emite el proceso durante la prueba, con el formateador JSON de verdad (``shared.jsonlog``)."""
    lineas = []

    class Manejador(logging.Handler):
        def emit(self, record):
            lineas.append(self.format(record))

    manejador = Manejador()
    manejador.setFormatter(JsonFormatter())
    manejador.addFilter(RequestIdFilter())
    raiz = logging.getLogger()
    raiz.addHandler(manejador)
    try:
        yield lineas
    finally:
        raiz.removeHandler(manejador)


def _jwt_de_prueba():
    return ".".join(["eyJ" + secrets.token_urlsafe(18), secrets.token_urlsafe(18), secrets.token_urlsafe(18)])


def _usuario():
    return User.objects.create_user(
        email=f"{secrets.token_hex(6)}@prueba.test",
        password=secrets.token_urlsafe(24),
        nombre="Prueba",
        apellido="Registros",
        role="ESTUDIANTE",
    )


def _escenario_de_credenciales(usuario):
    """Un login fallido, una petición con su JWT que falla y otra cuya excepción lleva una contraseña.

    Devuelve las credenciales que no deben aparecer en ningún registro ni en la auditoría.
    """
    cliente = Client()
    clave_fallida = secrets.token_urlsafe(24)
    cliente.post(
        "/api/auth/login", {"email": usuario.email, "password": clave_fallida}, content_type="application/json"
    )
    jwt = generate_access_token(usuario)
    cliente.get(RUTA_CABECERA, HTTP_AUTHORIZATION=f"Bearer {jwt}")
    clave_expuesta = secrets.token_urlsafe(24)
    cliente.post(RUTA_CONTRASENA, {"password": clave_expuesta}, content_type="application/json")
    return [clave_fallida, jwt, clave_expuesta]


def _afirmar_sin_secretos(lineas, secretos):
    texto = "\n".join(lineas)
    filas = " ".join(fila.context_json for fila in AuditLog.objects.all())
    for secreto in secretos:
        assert secreto not in texto, "una credencial salió al registro"
        assert secreto not in filas, "una credencial salió a la auditoría"
    # Sondas: las excepciones que llevaban la credencial sí se registraron, ya con el valor sustituido.
    assert "Bearer [REDACTADO]" in texto
    assert "password=[REDACTADO]" in texto


@pytest.mark.django_db
@override_settings(ROOT_URLCONF=__name__)
def test_credenciales_conocidas_no_aparecen_en_los_registros_ni_en_la_auditoria(capturados):
    usuario = _usuario()
    secretos = _escenario_de_credenciales(usuario)

    _afirmar_sin_secretos(capturados, secretos)
    registros = [json.loads(linea) for linea in capturados]
    de_la_cabecera = [r for r in registros if r.get("path") == RUTA_CABECERA and r["level"] == "ERROR"]
    assert len(de_la_cabecera) == 1
    assert de_la_cabecera[0]["actor_id"] == usuario.pk


@pytest.mark.django_db
@override_settings(ROOT_URLCONF=__name__)
def test_control_negativo_sin_redaccion_la_credencial_sale(capturados, monkeypatch):
    monkeypatch.setattr(jsonlog, "redact", lambda valor: valor)
    secretos = _escenario_de_credenciales(_usuario())

    with pytest.raises(AssertionError, match="credencial salió"):
        _afirmar_sin_secretos(capturados, secretos)


def test_redact_por_clave_sustituye_el_valor_sin_distinguir_mayusculas_ni_por_subcadena():
    secreto = secrets.token_urlsafe(24)

    limpio = jsonlog.redact(
        {
            "Authorization": f"Bearer {secreto}",
            "accessToken": secreto,
            "temporaryPassword": secreto,
            "x-cookie": secreto,
            "nombre": "Ana",
        }
    )

    assert limpio == {
        "Authorization": "[REDACTADO]",
        "accessToken": "[REDACTADO]",
        "temporaryPassword": "[REDACTADO]",
        "x-cookie": "[REDACTADO]",
        "nombre": "Ana",
    }


def test_redact_en_texto_libre_quita_bearer_pares_clave_valor_y_jwt():
    secreto = secrets.token_urlsafe(24)
    jwt = _jwt_de_prueba()

    assert jsonlog.redact(f"Bearer {jwt}") == "Bearer [REDACTADO]"
    assert jsonlog.redact(f"password={secreto}&usuario=ana") == "password=[REDACTADO]&usuario=ana"
    assert jsonlog.redact(f'{{"token": "{secreto}", "x": 1}}') == '{"token": "[REDACTADO]", "x": 1}'
    assert jsonlog.redact(f"credential: {secreto}") == "credential: [REDACTADO]"
    assert jsonlog.redact(f"sesion {jwt} abierta") == "sesion [REDACTADO] abierta"
    assert jsonlog.redact("sin datos sensibles") == "sin datos sensibles"


def test_redact_es_lineal_con_un_texto_largo_sin_claves():
    """Un texto de decenas de miles de letras no puede frenar el registro: el patrón de claves va anclado a su token.

    Sin el ancla, este texto tardaba más de diez segundos; con ella, milisegundos."""
    inicio = time.perf_counter()

    jsonlog.redact("a" * 30_000)

    assert time.perf_counter() - inicio < 2


#: El patrón de antes de la revisión S7-2 (#1): la palabra sensible rodeada de ``[\w.-]*`` sin tope.
_CLAVE_VALOR_SIN_TOPE = re.compile(jsonlog._CLAVE_VALOR.pattern.replace("{0,120}", "*"), re.IGNORECASE)


def _tarda(patron, texto):
    inicio = time.perf_counter()
    patron.sub("[x]", texto)
    return time.perf_counter() - inicio


@pytest.mark.parametrize(
    "texto",
    [
        pytest.param("password" * 5_000, id="la-palabra-repetida-sin-separador"),
        pytest.param("token" * 8_000, id="otra-palabra-repetida"),
        pytest.param("x_password_" * 4_000, id="con-prefijo-y-sufijo"),
        pytest.param("password: '" * 4_000, id="con-comilla-sin-cerrar"),
        pytest.param('password="' + "\\\"" * 20_000, id="comilla-escapada-sin-cerrar"),
        pytest.param("a.b-c_" * 20_000 + "secret", id="token-largo-con-la-palabra-al-final"),
    ],
)
def test_redact_no_es_cuadratico_con_la_palabra_sensible_repetida(texto):
    """Revisión S7-2 (#1): una ruta de 4 KB sin autenticar hecha de la palabra repetida costaba 165 ms de CPU por línea de
    registro (y ~9 s con 40 000 caracteres). Con el tope a lo que rodea a la palabra, el costo es lineal."""
    inicio = time.perf_counter()

    jsonlog.redact(texto)

    assert time.perf_counter() - inicio < 1.5, "la redacción de un texto hostil debe costar milisegundos, no segundos"


def test_control_negativo_sin_el_tope_el_patron_si_era_cuadratico():
    """El patrón viejo (sin ``{0,120}``) tarda órdenes de magnitud más que el nuevo con la misma entrada: la prueba de arriba
    sí vigila el tope. Se compara por razón (no por segundos) para no depender de la velocidad de la máquina."""
    texto = "password" * 1_000

    assert _tarda(_CLAVE_VALOR_SIN_TOPE, texto) > 20 * max(_tarda(jsonlog._CLAVE_VALOR, texto), 1e-5)


def test_el_tope_no_cambia_lo_que_se_redacta_en_los_casos_normales():
    secreto = secrets.token_urlsafe(24)

    assert jsonlog.redact(f"x_password={secreto}") == "x_password=[REDACTADO]"
    assert jsonlog.redact(f"mi.clave.secret-key: {secreto};") == "mi.clave.secret-key: [REDACTADO];"
    assert jsonlog.redact(f'{{"temporaryPassword":"{secreto}"}}') == '{"temporaryPassword":"[REDACTADO]"}'
    assert jsonlog.redact("ruta /api/password-reset sin valor") == "ruta /api/password-reset sin valor"


def test_redact_recorre_diccionarios_listas_y_tuplas_anidados():
    secreto = secrets.token_urlsafe(24)

    limpio = jsonlog.redact(
        {
            "pasos": [{"password": secreto}, f"password={secreto}"],
            "tupla": ({"nota": f"token={secreto}"},),
            "n": 3,
        }
    )

    assert limpio == {
        "pasos": [{"password": "[REDACTADO]"}, "password=[REDACTADO]"],
        "tupla": ({"nota": "token=[REDACTADO]"},),
        "n": 3,
    }
    assert isinstance(limpio["tupla"], tuple)


def test_json_formatter_redacta_el_mensaje_la_traza_y_los_campos():
    secreto = secrets.token_urlsafe(24)
    try:
        raise RuntimeError(f"password={secreto}")
    except RuntimeError:
        registro = logging.getLogger("siep.test").makeRecord(
            "siep.test",
            logging.ERROR,
            __file__,
            1,
            f"falló con token={secreto}",
            (),
            sys.exc_info(),
            extra={"fields": {"authorization": f"Bearer {secreto}", "intento": 2}},
        )

    linea = JsonFormatter().format(registro)
    datos = json.loads(linea)

    assert secreto not in linea
    assert datos["message"] == "falló con token=[REDACTADO]"
    assert datos["authorization"] == "[REDACTADO]"
    assert datos["intento"] == 2
    assert "RuntimeError: password=[REDACTADO]" in datos["exc"]


class _ValorQueNoSePuedeRedactar(dict):
    """Un valor cuya redacción falla: el formateador lo marca y la línea sale igual."""

    def items(self):
        raise RuntimeError("no se puede leer")


def test_si_la_redaccion_falla_en_un_campo_ese_campo_queda_marcado_y_la_linea_sale():
    registro = logging.getLogger("siep.test").makeRecord(
        "siep.test",
        logging.INFO,
        __file__,
        1,
        "mensaje intacto",
        (),
        None,
        extra={"fields": {"roto": _ValorQueNoSePuedeRedactar(), "ok": "dato"}},
    )

    datos = json.loads(JsonFormatter().format(registro))

    assert datos["roto"] == "[REDACCION_FALLIDA]"
    assert datos["ok"] == "dato"
    assert datos["message"] == "mensaje intacto"
