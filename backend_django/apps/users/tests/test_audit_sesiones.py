"""S4-1 · Quién entró: el acceso, su fallo, su bloqueo y el cierre de sesión dejan rastro (RNF-007, SIEP-RNF-02).

Cada evento deja UNA fila con el actor y el recurso correctos. El fallo guarda el correo intentado como HASH (nunca en
claro) y el motivo; como un atacante puede provocar fallos sin tope y la auditoría es de solo añadir con retención de un
año, lo que se escribe se limita a 10 filas por correo cada 15 minutos (``audit_login_fail``). El bloqueo de cuenta deja
UNA fila por correo y ventana. Ninguna fila lleva un correo, una contraseña ni un token.

Cada escenario es una función que actúa y afirma; las mismas funciones sirven al control negativo: con la escritura de
la auditoría apagada, cada una debe caer.
"""
import json
import logging
import secrets
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.conf import settings as django_settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.security import limiter
from apps.security.limiter import key_hash
from apps.security.limits import LIMITS, Limit
from apps.security.models import RateLimitBucket
from apps.simulation.models import AuditLog
from apps.simulation.services import audit_service
from apps.users.serializers import generate_access_token
from apps.users.services import audit_events

pytestmark = [pytest.mark.req("RNF-007", "SIEP-RNF-02"), pytest.mark.security, pytest.mark.django_db]

User = get_user_model()
LOGIN = "/api/auth/login"
GOOGLE = "/api/auth/google"
LOGOUT = "/api/auth/logout"
INSTANTE = 1_800_000_000.0
IP = "198.51.100.77"
AGENTE = "agente-de-prueba/1.0"
VENTANA = 900  # los 15 minutos de ``login_fail_account*`` y de ``audit_login_fail``


@pytest.fixture(autouse=True)
def reloj(settings, monkeypatch):
    """El limitador va encendido y el reloj fijo: las ventanas no se mueven a mitad de una prueba."""
    settings.SIEP_THROTTLE_ENABLED = True
    instante = {"t": INSTANTE}
    monkeypatch.setattr(limiter, "_now", lambda: instante["t"])
    return instante


def _cuenta(rol="ESTUDIANTE", **extra):
    clave = secrets.token_urlsafe(24)
    cuenta = User.objects.create_user(
        email=f"s41.{secrets.token_hex(6)}@inst.test", password=clave, nombre="Ana", apellido="Prueba", role=rol, **extra
    )
    return cuenta, clave


def _correo():
    return f"nadie.{secrets.token_hex(6)}@inst.test"


def _login(cliente, correo, clave, ip=IP):
    return cliente.post(
        LOGIN, {"email": correo, "password": clave}, format="json", REMOTE_ADDR=ip, HTTP_USER_AGENT=AGENTE
    )


def _fallos(cliente, correo, cuantos, ip=IP):
    return [_login(cliente, correo, secrets.token_urlsafe(16), ip).status_code for _ in range(cuantos)]


def _filas(accion, **filtros):
    return list(AuditLog.objects.filter(action=accion, **filtros).order_by("id"))


def _una(accion, **filtros):
    filas = _filas(accion, **filtros)
    assert len(filas) == 1, f"{accion}: {len(filas)} filas (se esperaba 1)"
    return filas[0]


def _contexto(fila):
    return json.loads(fila.context_json)


def _filas_de_fallo(correo):
    """Las filas ``sesion.fallar`` de ese correo (se reconocen por su hash)."""
    esperado = key_hash(correo)
    return [fila for fila in _filas("LOGIN_FAILED") if _contexto(fila).get("emailHash") == esperado]


def _sin_secretos(*secretos):
    """Ninguna fila de auditoría de la prueba lleva un correo, una contraseña ni un token."""
    volcado = repr(list(AuditLog.objects.values()))
    for secreto in secretos:
        assert secreto not in volcado, "un dato de la persona llegó a la auditoría"


# ── Escenarios: cada uno actúa y afirma ────────────────────────────────────────────────────────────────────────────
def _acceso_con_exito(reloj):
    cuenta, clave = _cuenta("PROFESOR")

    respuesta = _login(APIClient(), cuenta.email, clave)

    assert respuesta.status_code == 200
    fila = _una("LOGIN_SUCCEEDED", resource_id=str(cuenta.pk))
    assert (fila.actor_id, fila.actor_role) == (cuenta.pk, "PROFESOR")  # quien entró, aunque aún no tuviera sesión
    assert fila.resource_type == "USER"
    assert (fila.ip_address, fila.user_agent) == (IP, AGENTE)
    assert _contexto(fila) == {"taxonomy": "sesion.entrar", "provider": "password"}
    _sin_secretos(cuenta.email, clave, respuesta.data["data"]["token"])


def _acceso_con_google(reloj):
    cuenta, _ = _cuenta("ESTUDIANTE")
    verificada = {"email": cuenta.email, "email_verified": True, "sub": secrets.token_hex(8)}
    cliente_de_google = f"{secrets.token_hex(6)}.apps.googleusercontent.com"  # generado: ni un identificador literal

    with override_settings(GOOGLE_OAUTH_CLIENT_ID=cliente_de_google), patch(
        "apps.users.views.verify_google_credential", return_value=verificada
    ):
        respuesta = APIClient().post(
            GOOGLE, {"credential": secrets.token_urlsafe(24)}, format="json", REMOTE_ADDR=IP, HTTP_USER_AGENT=AGENTE
        )

    assert respuesta.status_code == 200
    fila = _una("LOGIN_SUCCEEDED", resource_id=str(cuenta.pk))
    assert (fila.actor_id, fila.actor_role) == (cuenta.pk, "ESTUDIANTE")
    assert _contexto(fila) == {"taxonomy": "sesion.entrar", "provider": "google"}
    _sin_secretos(cuenta.email, respuesta.data["data"]["token"])


def _preparar_fallo(motivo):
    """(correo, contraseña que se prueba, cuenta o None) para que el intento falle por ``motivo``."""
    if motivo == "unknown_account":
        return _correo(), secrets.token_urlsafe(16), None
    if motivo == "bad_password":
        cuenta, _ = _cuenta()
        return cuenta.email, secrets.token_urlsafe(16), cuenta
    if motivo == "inactive":
        cuenta, clave = _cuenta(activo=False)
        return cuenta.email, clave, cuenta
    assert motivo == "expired_temp_password"
    vencida = timezone.now() - timedelta(days=django_settings.SIEP_TEMP_PASSWORD_DAYS + 1)
    cuenta, clave = _cuenta(must_change_password=True, temp_password_set_at=vencida)
    return cuenta.email, clave, cuenta


def _fallo_por(motivo):
    correo, clave, cuenta = _preparar_fallo(motivo)

    respuesta = _login(APIClient(), correo, clave)

    assert respuesta.status_code == 401
    filas = _filas_de_fallo(correo)
    assert len(filas) == 1, f"{motivo}: {len(filas)} filas (se esperaba 1)"
    fila = filas[0]
    esperado = key_hash(correo)
    assert len(esperado) == 64 and esperado != correo  # el HMAC de 64 caracteres, no el correo
    assert (fila.actor_id, fila.actor_role) == (None, "ANONYMOUS")
    assert (fila.resource_type, fila.resource_id) == ("USER", None if cuenta is None else str(cuenta.pk))
    assert (fila.ip_address, fila.user_agent) == (IP, AGENTE)
    assert _contexto(fila) == {"taxonomy": "sesion.fallar", "emailHash": esperado, "reason": motivo}
    _sin_secretos(correo, clave)


def _bloqueo_de_una_cuenta(reloj):
    cuenta, _ = _cuenta()
    cliente = APIClient()

    primeros = _fallos(cliente, cuenta.email, 5)
    bloqueados = _fallos(cliente, cuenta.email, 3)  # ya bloqueada: ni se prueba la contraseña ni se cuenta otro fallo

    assert primeros == [401] * 5 and bloqueados == [429] * 3
    fila = _una("LOGIN_LOCKED")
    assert (fila.actor_id, fila.actor_role) == (None, "ANONYMOUS")
    assert (fila.resource_type, fila.resource_id) == ("USER", str(cuenta.pk))
    assert fila.ip_address == IP
    assert _contexto(fila) == {"taxonomy": "sesion.bloquear", "scope": "login_fail_account_ip", "targetId": cuenta.pk}
    assert len(_filas_de_fallo(cuenta.email)) == 5  # los 429 no son fallos de contraseña: no dejan fila
    _sin_secretos(cuenta.email)


def _bloqueo_de_un_correo_inexistente(reloj):
    correo = _correo()
    cliente = APIClient()

    assert _fallos(cliente, correo, 5) == [401] * 5
    assert _fallos(cliente, correo, 2) == [429] * 2

    fila = _una("LOGIN_LOCKED")
    assert (fila.resource_type, fila.resource_id) == ("USER", None)  # sin cuenta no hay id: nada que revelar
    assert _contexto(fila) == {"taxonomy": "sesion.bloquear", "scope": "login_fail_account_ip"}
    _sin_secretos(correo)


def _cierre_de_sesion(reloj):
    cuenta, _ = _cuenta("ESTUDIANTE")
    cliente = APIClient()
    cliente.credentials(HTTP_AUTHORIZATION=f"Bearer {generate_access_token(cuenta)}")

    respuesta = cliente.post(LOGOUT, {}, format="json", REMOTE_ADDR=IP, HTTP_USER_AGENT=AGENTE)

    assert respuesta.status_code == 200
    fila = _una("LOGOUT")
    assert (fila.actor_id, fila.actor_role) == (cuenta.pk, "ESTUDIANTE")
    assert (fila.resource_type, fila.resource_id) == ("USER", str(cuenta.pk))
    assert (fila.ip_address, fila.user_agent) == (IP, AGENTE)
    assert _contexto(fila) == {"taxonomy": "sesion.salir"}
    # El mismo token ya no sirve: un segundo cierre es un 401 y no deja otra fila.
    assert cliente.post(LOGOUT, {}, format="json").status_code == 401
    assert len(_filas("LOGOUT")) == 1


ESCENARIOS = {
    "acceso con éxito": _acceso_con_exito,
    "acceso con Google": _acceso_con_google,
    "fallo por contraseña errónea": lambda reloj: _fallo_por("bad_password"),
    "fallo por cuenta inexistente": lambda reloj: _fallo_por("unknown_account"),
    "fallo por cuenta inactiva": lambda reloj: _fallo_por("inactive"),
    "fallo por contraseña temporal vencida": lambda reloj: _fallo_por("expired_temp_password"),
    "bloqueo de una cuenta": _bloqueo_de_una_cuenta,
    "bloqueo de un correo inexistente": _bloqueo_de_un_correo_inexistente,
    "cierre de sesión": _cierre_de_sesion,
}


@pytest.mark.parametrize("escenario", list(ESCENARIOS.values()), ids=list(ESCENARIOS))
def test_el_evento_deja_una_fila_con_el_actor_y_el_recurso_correctos(escenario, reloj):
    escenario(reloj)


@pytest.mark.parametrize("escenario", list(ESCENARIOS.values()), ids=list(ESCENARIOS))
def test_control_negativo_con_la_escritura_apagada_cada_evento_cae(escenario, reloj, monkeypatch):
    monkeypatch.setattr(audit_service, "append", lambda *args, **kwargs: None)

    with pytest.raises(AssertionError):
        escenario(reloj)


# ── El bloqueo deja UNA fila por ventana ───────────────────────────────────────────────────────────────────────────
def test_el_bloqueo_deja_una_fila_por_ventana_y_otra_cuando_vuelve_a_saltar(reloj):
    cuenta, _ = _cuenta()
    cliente = APIClient()
    _fallos(cliente, cuenta.email, 5)
    _fallos(cliente, cuenta.email, 4)
    assert len(_filas("LOGIN_LOCKED")) == 1

    reloj["t"] += VENTANA  # la ventana siguiente: los contadores empiezan de cero
    _fallos(cliente, cuenta.email, 5)
    _fallos(cliente, cuenta.email, 4)

    assert len(_filas("LOGIN_LOCKED")) == 2


def test_un_bloqueo_repartido_en_muchas_ips_deja_una_sola_fila_por_correo_y_ventana(reloj):
    """Quien reparte los fallos en IPs distintas hace saltar el bloqueo de cada pareja cuenta + IP: la fila es una."""
    cuenta, _ = _cuenta()
    cliente = APIClient()

    for numero in range(4):
        assert _fallos(cliente, cuenta.email, 5, ip=f"198.51.100.{20 + numero}") == [401] * 5

    assert len(_filas("LOGIN_LOCKED")) == 1


# ── El tope de filas de fallo ──────────────────────────────────────────────────────────────────────────────────────
def _eventos_de_tope(caplog):
    return [
        registro.fields
        for registro in caplog.records
        if registro.name == "siep.security" and getattr(registro, "fields", {}).get("event") == "audit_login_fail_capped"
    ]


def _afirmar_tope(caplog):
    """14 fallos del mismo correo desde IPs distintas: solo 10 filas y UN aviso del tope, sin el correo."""
    correo, otro = _correo(), _correo()
    cliente = APIClient()

    with caplog.at_level(logging.INFO, logger="siep.security"):
        estados = [_login(cliente, correo, secrets.token_urlsafe(16), f"198.51.100.{100 + n}").status_code for n in range(14)]
        assert _login(cliente, otro, secrets.token_urlsafe(16), "198.51.100.200").status_code == 401

    assert estados == [401] * 14  # el tope limita lo que se escribe, no lo que se responde
    assert len(_filas_de_fallo(correo)) == 10
    assert _eventos_de_tope(caplog) == [{"event": "audit_login_fail_capped", "scope": "audit_login_fail"}]
    assert correo not in repr(_eventos_de_tope(caplog))
    assert len(_filas_de_fallo(otro)) == 1  # el tope es por correo: el de otra persona sigue escribiéndose
    contador = RateLimitBucket.objects.get(scope="audit_login_fail", key_hash=key_hash(correo))
    assert contador.count == 14  # lo que pasó del tope queda contado en el limitador
    _sin_secretos(correo, otro)


def test_los_fallos_dejan_filas_hasta_diez_y_luego_no(caplog):
    _afirmar_tope(caplog)


def test_control_negativo_sin_el_tope_el_atacante_llena_la_tabla(caplog, monkeypatch):
    monkeypatch.setattr(audit_events, "hit", lambda alcance, clave: 0)

    with pytest.raises(AssertionError):
        _afirmar_tope(caplog)


def _filas_de_fallo_por_hash(hashes):
    return [fila for fila in _filas("LOGIN_FAILED") if _contexto(fila).get("emailHash") in hashes]


def _afirmar_tope_por_ip(caplog):
    """25 fallos desde UNA IP con 25 correos que no existen: solo 20 filas y UN aviso del tope de la IP. Rotar correos esquiva
    el tope por correo (cada uno deja 1 fila), no el de la IP."""
    correos = [_correo() for _ in range(25)]
    cliente = APIClient()

    with caplog.at_level(logging.INFO, logger="siep.security"):
        estados = [_login(cliente, correo, secrets.token_urlsafe(16), "198.51.100.60").status_code for correo in correos]
        otra_ip = _correo()
        assert _login(cliente, otra_ip, secrets.token_urlsafe(16), "198.51.100.61").status_code == 401

    assert estados == [401] * 25  # el tope limita lo que se escribe, no lo que se responde
    assert len(_filas_de_fallo_por_hash({key_hash(correo) for correo in correos})) == 20
    assert _eventos_de_tope(caplog) == [{"event": "audit_login_fail_capped", "scope": "audit_login_fail_ip"}]
    assert len(_filas_de_fallo(otra_ip)) == 1  # el tope es por IP agrupada: otra IP sigue escribiéndose
    _sin_secretos(*correos, otra_ip)


def test_rotar_correos_desde_una_ip_no_llena_la_tabla_mas_alla_de_veinte_filas(caplog):
    _afirmar_tope_por_ip(caplog)


def test_control_negativo_sin_el_tope_por_ip_rotar_correos_llena_la_tabla(caplog, monkeypatch):
    monkeypatch.setattr(audit_events, "hit", lambda alcance, clave: 0)

    with pytest.raises(AssertionError):
        _afirmar_tope_por_ip(caplog)


def _afirmar_tope_global(caplog, monkeypatch):
    """Entre TODAS las IPs y correos, a lo más el tope global de filas; el aviso sale una vez y sin datos."""
    monkeypatch.setitem(LIMITS, "audit_login_fail_global", Limit(6, 3600))
    correos = [_correo() for _ in range(10)]
    cliente = APIClient()

    with caplog.at_level(logging.INFO, logger="siep.security"):
        estados = [_login(cliente, correo, secrets.token_urlsafe(16), f"198.51.100.{120 + n}").status_code for n, correo in enumerate(correos)]

    assert estados == [401] * 10
    assert len(_filas_de_fallo_por_hash({key_hash(correo) for correo in correos})) == 6
    assert _eventos_de_tope(caplog) == [{"event": "audit_login_fail_capped", "scope": "audit_login_fail_global"}]
    _sin_secretos(*correos)


def test_el_total_de_filas_de_fallo_tiene_su_propio_tope(caplog, monkeypatch):
    _afirmar_tope_global(caplog, monkeypatch)


def test_control_negativo_sin_el_tope_global_la_tabla_crece_sin_limite(caplog, monkeypatch):
    monkeypatch.setattr(audit_events, "hit", lambda alcance, clave: 0)

    with pytest.raises(AssertionError):
        _afirmar_tope_global(caplog, monkeypatch)


def test_el_tope_se_renueva_con_la_ventana(reloj):
    correo = _correo()
    cliente = APIClient()
    for n in range(12):
        _login(cliente, correo, secrets.token_urlsafe(16), f"198.51.100.{100 + n}")
    assert len(_filas_de_fallo(correo)) == 10

    reloj["t"] += VENTANA
    _login(cliente, correo, secrets.token_urlsafe(16), "198.51.100.150")

    assert len(_filas_de_fallo(correo)) == 11


# ── El limitador apagado no rompe el acceso ────────────────────────────────────────────────────────────────────────
def test_con_el_limitador_apagado_el_acceso_sigue_funcionando_y_deja_rastro(settings):
    settings.SIEP_THROTTLE_ENABLED = False
    cuenta, clave = _cuenta()
    cliente = APIClient()

    assert _login(cliente, cuenta.email, clave).status_code == 200
    assert _fallos(cliente, cuenta.email, 12) == [401] * 12  # ni 429 ni 500

    _una("LOGIN_SUCCEEDED", resource_id=str(cuenta.pk))
    assert len(_filas_de_fallo(cuenta.email)) >= 1
    assert _filas("LOGIN_LOCKED") == []  # sin limitador no hay bloqueo que registrar
