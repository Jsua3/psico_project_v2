"""S7-1a · Ataques al token de sesión: una fila por ataque, cada una con su control negativo.

Un atacante con (o sin) cuenta intenta entrar con un token que el servidor no emitió, que ya no vale o que dice más de lo
que es. Todo va contra el cliente de pruebas de DRF (nunca contra una red), por ``GET /api/auth/me`` y por una orden de
juego (``POST /api/simulation/attempts``); en las dos, el rechazo llega al autenticar, antes de mirar el cuerpo.

Las llaves, las contraseñas y los tokens se generan en cada ejecución. La llave de firma real es
``settings.SIMPLE_JWT["SIGNING_KEY"]``. Un **control negativo** apaga el control que la fila vigila (con ``monkeypatch`` o
``override_settings``, a través de ``afirmar_que_cae``) y comprueba que la MISMA fila deja de cumplirse: así se sabe que la
fila no pasa en vacío.

Ya cubierto por pruebas existentes (aquí se repite como fila de la tabla de abuso, con su control):

- firmado con otra llave → ``shared/tests/test_jwt_signing_key.py`` (``test_un_token_que_no_firma_el_servidor_responde_401``);
- ``ep`` viejo y cierre de sesión de una persona sin tocar a otra → ``apps/users/tests/test_session_epoch.py``.
"""
import base64
import json
import secrets
import time
import uuid
from datetime import timedelta

import jwt
import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt import authentication as autenticacion_jwt
from rest_framework_simplejwt import state
from rest_framework_simplejwt.backends import TokenBackend

from apps.users.authentication import SiepJWTAuthentication
from apps.users.serializers import generate_access_token

from .test_abuse_cases import _parchado, afirmar_que_cae

pytestmark = [
    pytest.mark.req("SIEP-RNF-04"),
    pytest.mark.req("RNF-002"),
    pytest.mark.req("LS-8"),
    pytest.mark.security,
    pytest.mark.django_db,
]

User = get_user_model()

YO = "/api/auth/me"
ORDEN_DE_JUEGO = "/api/simulation/attempts"
USUARIOS_DEL_ADMIN = "/api/admin/users"
#: Las dos rutas por las que se prueba cada ataque: una lectura propia y una orden de juego.
RUTAS = {"yo": ("GET", YO), "orden": ("POST", ORDEN_DE_JUEGO)}
#: Marca de «esta claim no va en el token» (``None`` sí es un valor: ``null`` en el JSON).
QUITAR = object()


# ── Piezas ──────────────────────────────────────────────────────────────────────────────────────────────────────


def _cuenta(rol="ESTUDIANTE", **extra):
    """Una cuenta nueva sin contraseña (la sesión sale de un token, no del inicio de sesión): nada que adivinar."""
    return User.objects.create_user(
        email=f"jwt-{rol.lower()}-{secrets.token_hex(5)}@example.com",
        password=None,
        nombre="Prueba",
        apellido="Token",
        role=rol,
        **extra,
    )


def _llave():
    return settings.SIMPLE_JWT["SIGNING_KEY"]


def _cargas(cuenta, **cambios):
    """Las claims de un token de acceso de ``cuenta`` tal como las emite el servidor, con ``cambios`` (``QUITAR`` borra)."""
    ahora = int(time.time())
    cargas = {
        "token_type": "access",
        "iat": ahora,
        "exp": ahora + 3600,
        "jti": uuid.uuid4().hex,
        "userId": cuenta.id,
        "role": cuenta.role,
        "sub": cuenta.email,
        "ep": cuenta.session_epoch,
    }
    cargas.update(cambios)
    return {clave: valor for clave, valor in cargas.items() if valor is not QUITAR}


def _firmar(cargas, llave=None):
    return jwt.encode(cargas, llave or _llave(), algorithm="HS256")


def _b64(dato):
    return base64.urlsafe_b64encode(json.dumps(dato, separators=(",", ":")).encode()).rstrip(b"=").decode()


def _sin_firma(cargas, alg="none", punto_final=True):
    """Un token que declara ``alg: none`` y no lleva firma (con o sin el punto que la separa)."""
    token = f"{_b64({'alg': alg, 'typ': 'JWT'})}.{_b64(cargas)}"
    return token + "." if punto_final else token


def _como(cabecera):
    cliente = APIClient()
    if cabecera is not None:
        cliente.credentials(HTTP_AUTHORIZATION=cabecera)
    return cliente


def _pedir(cabecera, ruta):
    metodo, url = RUTAS[ruta]
    cliente = _como(cabecera)
    if metodo == "GET":
        return cliente.get(url)
    return cliente.post(url, {"caseVersionId": 1}, format="json")  # el 401 llega antes de mirar el cuerpo


def _rechazada(respuesta, codigo="INVALID_CREDENTIALS"):
    """401 con el código estable y sin ningún dato de nadie en el cuerpo."""
    assert respuesta.status_code == 401, (respuesta.status_code, respuesta.data)
    assert respuesta.data["code"] == codigo, respuesta.data
    assert "data" not in respuesta.data, respuesta.data


# ── Lo que cada control negativo apaga ───────────────────────────────────────────────────────────────────────────


class _BackendSinFirma(TokenBackend):
    """Un backend que decodifica SIN comprobar la firma: lo que pasaría si alguien quitara la verificación."""

    def decode(self, token, verify=True):
        return super().decode(token, verify=False)


def _firma_sin_comprobar(monkeypatch):
    return _parchado(monkeypatch, (state, "token_backend", _BackendSinFirma("HS256", _llave())))


def _vencimiento_sin_comprobar(monkeypatch):
    """Una tolerancia de cien años: ningún token vence (lo que pasaría si se quitara la comprobación de ``exp``)."""
    return _parchado(monkeypatch, (state, "token_backend", TokenBackend("HS256", _llave(), leeway=timedelta(days=36500))))


def _confiar_en_la_claim_role(monkeypatch):
    """La identidad se arma con la claim ``role`` del token en vez de la base: la mala práctica que la fila vigila."""
    original = SiepJWTAuthentication.get_user

    def get_user(self, validated_token):
        cuenta = original(self, validated_token)
        cuenta.role = validated_token.get("role", cuenta.role)
        return cuenta

    return _parchado(monkeypatch, (SiepJWTAuthentication, "get_user", get_user))


def _sin_exigir_la_epoca():
    return override_settings(SIEP_SESSION_EPOCH_ENFORCE=False)


def _sin_comprobar_si_esta_activa(monkeypatch):
    """simplejwt lee ``CHECK_USER_IS_ACTIVE`` del objeto ``api_settings`` que importó (``override_settings`` no lo alcanza)."""
    return _parchado(monkeypatch, (autenticacion_jwt.api_settings, "CHECK_USER_IS_ACTIVE", False))


# ── Firma y vencimiento: un token que el servidor no emitió, o que ya no vale ───────────────────────────────────

#: nombre de la fila → (cómo se arma la cabecera, qué control apaga la comprobación que la rechaza; ``None`` si no hay uno)
ATAQUES = {
    "alg-none-con-las-claims-de-un-admin": (
        lambda: "Bearer " + _sin_firma(_cargas(_cuenta("ADMIN"))),
        _firma_sin_comprobar,
    ),
    # Sin el punto final el token ni siquiera tiene tres trozos: lo rechaza el lector de PyJWT antes de mirar la firma, así
    # que no hay una comprobación de firma que apagar (su control es el de la fila hermana ``alg-none-con-las-claims…``).
    "alg-none-sin-el-punto-final": (
        lambda: "Bearer " + _sin_firma(_cargas(_cuenta("ADMIN")), punto_final=False),
        None,
    ),
    "alg-None-con-mayuscula-inicial": (
        lambda: "Bearer " + _sin_firma(_cargas(_cuenta("ADMIN")), alg="None"),
        _firma_sin_comprobar,
    ),
    "alg-NONE-en-mayusculas": (
        lambda: "Bearer " + _sin_firma(_cargas(_cuenta("ADMIN")), alg="NONE"),
        _firma_sin_comprobar,
    ),
    "firmado-con-otra-llave": (
        lambda: "Bearer " + _firmar(_cargas(_cuenta()), llave=secrets.token_urlsafe(48)),
        _firma_sin_comprobar,
    ),
    "firmado-con-otra-llave-y-claims-de-admin": (
        lambda: "Bearer " + _firmar(_cargas(_cuenta("ADMIN")), llave=secrets.token_urlsafe(48)),
        _firma_sin_comprobar,
    ),
    "expirado": (
        lambda: "Bearer " + _firmar(_cargas(_cuenta(), exp=int(time.time()) - 10)),
        _vencimiento_sin_comprobar,
    ),
}


@pytest.mark.parametrize("ruta", RUTAS)
@pytest.mark.parametrize("ataque", ATAQUES)
def test_un_token_falsificado_o_vencido_responde_401(ataque, ruta):
    construir, _ = ATAQUES[ataque]

    _rechazada(_pedir(construir(), ruta))


@pytest.mark.parametrize("ataque", [nombre for nombre, (_, apagar) in ATAQUES.items() if apagar is not None])
def test_control_negativo_sin_la_comprobacion_el_token_falsificado_o_vencido_entra(ataque, monkeypatch):
    """Apagada la comprobación de la firma (o del vencimiento), la MISMA fila deja de cumplirse."""
    construir, apagar = ATAQUES[ataque]

    afirmar_que_cae(
        lambda: _rechazada(_pedir(construir(), "yo")),
        lambda: apagar(monkeypatch),
    )


# ── La época de sesión: ``ep`` menor que la de la persona ───────────────────────────────────────────────────────


def _ep_viejo_tras_revoke_sessions(ruta):
    estudiante = _cuenta()
    token = generate_access_token(estudiante)
    administrador = _cuenta("ADMIN")
    cerrar = _como(f"Bearer {generate_access_token(administrador)}").post(
        f"/api/admin/users/{estudiante.pk}/revoke-sessions"
    )
    assert cerrar.status_code == 200, cerrar.data
    _rechazada(_pedir(f"Bearer {token}", ruta), "TOKEN_INVALID")


def _ep_viejo_tras_cambiar_la_clave(ruta):
    clave, nueva = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    estudiante = User.objects.create_user(
        email=f"jwt-clave-{secrets.token_hex(5)}@example.com",
        password=clave,
        nombre="Prueba",
        apellido="Clave",
        role="ESTUDIANTE",
    )
    token = generate_access_token(estudiante)
    cambio = _como(f"Bearer {token}").post(
        "/api/auth/change-password", {"currentPassword": clave, "newPassword": nueva}, format="json"
    )
    assert cambio.status_code == 200, cambio.data
    _rechazada(_pedir(f"Bearer {token}", ruta), "TOKEN_INVALID")
    assert _pedir(f"Bearer {cambio.data['data']['token']}", "yo").status_code == 200  # la sesión actual sigue con otro token


def _ep_viejo_de_a_tras_su_cierre_de_sesion(ruta):
    a, b = _cuenta(), _cuenta()
    token_a, token_b = generate_access_token(a), generate_access_token(b)
    assert _como(f"Bearer {token_a}").post("/api/auth/logout").status_code == 200
    _rechazada(_pedir(f"Bearer {token_a}", ruta), "TOKEN_INVALID")
    assert _pedir(f"Bearer {token_b}", "yo").status_code == 200  # el cierre de A no toca a B


FILAS_DE_EPOCA = {
    "tras-revoke-sessions-del-admin": _ep_viejo_tras_revoke_sessions,
    "tras-cambiar-la-clave": _ep_viejo_tras_cambiar_la_clave,
    "a-tras-cerrar-su-sesion-mientras-b-sigue-valiendo": _ep_viejo_de_a_tras_su_cierre_de_sesion,
}


@pytest.mark.parametrize("ruta", RUTAS)
@pytest.mark.parametrize("fila", FILAS_DE_EPOCA)
def test_un_token_con_ep_menor_que_la_epoca_de_la_persona_responde_401_token_invalid(fila, ruta):
    FILAS_DE_EPOCA[fila](ruta)


@pytest.mark.parametrize("fila", FILAS_DE_EPOCA)
def test_control_negativo_sin_exigir_la_epoca_el_token_viejo_sigue_valiendo(fila):
    afirmar_que_cae(lambda: FILAS_DE_EPOCA[fila]("yo"), _sin_exigir_la_epoca)


# ── Claims manipuladas: el servidor carga el rol y la cuenta de la base por el id ───────────────────────────────


def _claim_role_admin_de_un_estudiante():
    estudiante = _cuenta()
    cabecera = "Bearer " + _firmar(_cargas(estudiante, role="ADMIN"))  # válido: lo único falso es el rol de la claim
    pedido = _como(cabecera).get(USUARIOS_DEL_ADMIN)
    assert pedido.status_code == 403, (pedido.status_code, pedido.data)
    assert pedido.data["code"] == "FORBIDDEN", pedido.data
    quien = _como(cabecera).get(YO)
    assert quien.status_code == 200, quien.data
    assert quien.data["data"]["role"] == "ESTUDIANTE", quien.data


def test_un_token_valido_de_un_estudiante_con_role_admin_en_la_claim_sigue_siendo_estudiante():
    _claim_role_admin_de_un_estudiante()


def test_control_negativo_si_el_servidor_creyera_la_claim_role_el_estudiante_seria_admin(monkeypatch):
    afirmar_que_cae(_claim_role_admin_de_un_estudiante, lambda: _confiar_en_la_claim_role(monkeypatch))


@pytest.mark.parametrize("ruta", RUTAS)
def test_un_token_firmado_sin_userid_responde_401(ruta):
    """La claim ``userId`` es lo único que dice de quién es el token: sin ella no hay a quién cargar."""
    cuenta = _cuenta()

    _rechazada(_pedir("Bearer " + _firmar(_cargas(cuenta, userId=QUITAR)), ruta))


@pytest.mark.parametrize("ruta", RUTAS)
def test_un_token_firmado_con_el_userid_de_una_cuenta_que_no_existe_responde_401(ruta):
    cuenta = _cuenta()
    inexistente = User.objects.order_by("-id").values_list("id", flat=True).first() + 1_000_000

    _rechazada(_pedir("Bearer " + _firmar(_cargas(cuenta, userId=inexistente)), ruta))


def _token_de_una_cuenta_inactiva(ruta):
    cuenta = _cuenta()
    token = _firmar(_cargas(cuenta))
    User.objects.filter(pk=cuenta.pk).update(activo=False)
    _rechazada(_pedir(f"Bearer {token}", ruta))


@pytest.mark.parametrize("ruta", RUTAS)
def test_el_token_de_una_cuenta_inactiva_responde_401(ruta):
    _token_de_una_cuenta_inactiva(ruta)


def test_control_negativo_sin_comprobar_que_la_cuenta_esta_activa_el_token_de_una_inactiva_entra(monkeypatch):
    afirmar_que_cae(lambda: _token_de_una_cuenta_inactiva("yo"), lambda: _sin_comprobar_si_esta_activa(monkeypatch))


@pytest.mark.xfail(
    strict=True,
    raises=AssertionError,
    reason=(
        "HALLAZGO: un token con la firma correcta y un `userId` que no es un entero (texto, lista, objeto) llega al ORM "
        "y responde 500 INTERNAL_ERROR en vez de 401 (TypeError/ValueError sin capturar en `get_user` de simplejwt, que "
        "`SiepJWTAuthentication.authenticate` no envuelve; apps/users/authentication.py:31). Exige la llave de firma, así "
        "que no es explotable desde fuera; solo endurece la respuesta."
    ),
)
@pytest.mark.parametrize("valor", ["abc", [1], {"a": 1}], ids=["texto", "lista", "objeto"])
def test_un_token_firmado_con_un_userid_que_no_es_un_entero_responde_401_y_no_500(valor):
    cuenta = _cuenta()

    _rechazada(_pedir("Bearer " + _firmar(_cargas(cuenta, userId=valor)), "yo"))


# ── La cabecera Authorization rara: siempre 401 y nunca 500 ─────────────────────────────────────────────────────


def _cabeceras_raras(token):
    """nombre de la fila → (cabecera, código del 401). El token es VÁLIDO: lo único raro es la forma de la cabecera."""
    credencial_ajena = base64.b64encode(f"{secrets.token_hex(4)}:{secrets.token_hex(4)}".encode()).decode()
    return {
        "bearer-sin-token": ("Bearer", "INVALID_CREDENTIALS"),
        "bearer-con-un-espacio-y-nada-mas": ("Bearer ", "INVALID_CREDENTIALS"),
        "bearer-en-minusculas": (f"bearer {token}", "UNAUTHENTICATED"),
        "dos-tokens-separados-por-espacio": (f"Bearer {token} {token}", "INVALID_CREDENTIALS"),
        "dos-tokens-separados-por-coma": (f"Bearer {token},{token}", "INVALID_CREDENTIALS"),
        "basic": (f"Basic {credencial_ajena}", "UNAUTHENTICATED"),
        "esquema-desconocido": (f"Token {token}", "UNAUTHENTICATED"),
        "el-token-sin-esquema": (token, "UNAUTHENTICATED"),
        "token-con-tres-trozos-al-azar": (
            "Bearer " + ".".join(secrets.token_urlsafe(8) for _ in range(3)),
            "INVALID_CREDENTIALS",
        ),
        "token-de-cien-mil-caracteres": ("Bearer " + "A" * 100_000, "INVALID_CREDENTIALS"),
    }


NOMBRES_DE_CABECERAS = list(_cabeceras_raras("x"))


def _fila_de_cabecera(nombre, ruta):
    token = generate_access_token(_cuenta())
    cabecera, codigo = _cabeceras_raras(token)[nombre]
    _rechazada(_pedir(cabecera, ruta), codigo)


@pytest.mark.parametrize("ruta", RUTAS)
@pytest.mark.parametrize("nombre", NOMBRES_DE_CABECERAS)
def test_una_cabecera_authorization_rara_responde_401_y_nunca_500(nombre, ruta):
    _fila_de_cabecera(nombre, ruta)


def test_la_cabecera_correcta_con_el_mismo_token_si_entra():
    """El punto de comparación de las filas anteriores: con la forma buena, el mismo token abre la puerta."""
    token = generate_access_token(_cuenta())

    assert _pedir(f"Bearer {token}", "yo").status_code == 200


def _aceptar_bearer_en_minusculas(monkeypatch):
    return _parchado(monkeypatch, (autenticacion_jwt, "AUTH_HEADER_TYPE_BYTES", {b"Bearer", b"bearer"}))


def _aceptar_mas_de_dos_trozos(monkeypatch):
    return _parchado(
        monkeypatch, (autenticacion_jwt.JWTAuthentication, "get_raw_token", lambda self, header: header.split()[1])
    )


@pytest.mark.parametrize(
    ("nombre", "apagar"),
    [
        ("bearer-en-minusculas", _aceptar_bearer_en_minusculas),
        ("dos-tokens-separados-por-espacio", _aceptar_mas_de_dos_trozos),
    ],
    ids=["esquema-sin-distinguir-mayusculas", "sin-exigir-exactamente-dos-trozos"],
)
def test_control_negativo_si_la_cabecera_rara_se_aceptara_la_fila_caeria(nombre, apagar, monkeypatch):
    afirmar_que_cae(lambda: _fila_de_cabecera(nombre, "yo"), lambda: apagar(monkeypatch))
