"""S4-1 · El registro de eventos: la taxonomía nueva, ``record`` y la lista blanca del contexto.

``audit_logs`` debe responder «quién entró, quién cambió qué y quién leyó datos de otra persona» (RNF-007,
SIEP-RNF-02). Aquí se prueba la pieza común: las etiquetas ``entidad.verbo`` de los eventos nuevos, el ayudante
``record`` que escribe UNA fila sin decorador (para los lugares donde el actor aún no está autenticado o la operación no
es una función de servicio) y la lista blanca que decide qué campos puede llevar el contexto de cada evento.
"""
import json
import logging
import secrets
from contextlib import contextmanager
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory

from apps.simulation.models import AuditLog
from apps.simulation.services import audit_service

pytestmark = [pytest.mark.req("RNF-007", "SIEP-RNF-02"), pytest.mark.security, pytest.mark.django_db]

User = get_user_model()

#: Los eventos que S4-1 añade a la taxonomía: código crudo → etiqueta ``entidad.verbo``.
ETIQUETAS_NUEVAS = {
    "LOGIN_SUCCEEDED": "sesion.entrar",
    "LOGIN_FAILED": "sesion.fallar",
    "LOGIN_LOCKED": "sesion.bloquear",
    "LOGOUT": "sesion.salir",
    "USER_CREATED": "usuario.crear",
    "USER_UPDATED": "usuario.actualizar",
    "USER_STATUS_CHANGED": "usuario.estado",
    "USER_ROLE_CHANGED": "usuario.rol",
    "ACCESS_REQUEST_CREATED": "solicitud.crear",
    "ACCESS_REQUEST_RESOLVED": "solicitud.resolver",
    "REPORT_VIEWED": "reporte.leer",
    "REPORT_EXPORTED": "reporte.exportar",
    "AUDIT_VIEWED": "auditoria.leer",
    "RUBRIC_CREATED": "rubrica.crear",
    "RUBRIC_UPDATED": "rubrica.actualizar",
    "RUBRIC_ACTIVATED": "rubrica.activar",
    # Dos códigos que ya se escribían (R1b, R1b2) y caían a una etiqueta automática fea (``admin.created.by.command``).
    "ADMIN_CREATED_BY_COMMAND": "usuario.crear_admin",
    "ADMIN_RESET_BY_COMMAND": "usuario.reponer_admin",
    # Lecturas de datos de otras personas y altas que la compuerta de cobertura exige declarar (S4-1, punto 5).
    "USER_LIST_VIEWED": "usuario.listar",
    "ACCESS_REQUEST_LIST_VIEWED": "solicitud.listar",
    "GROUP_STUDENTS_VIEWED": "grupo.listar_estudiantes",
    "COMPETENCY_CREATED": "competencia.crear",
}


def _peticion(usuario=None, ip="203.0.113.7", agente="agente-de-prueba/1.0"):
    peticion = RequestFactory().post("/x", REMOTE_ADDR=ip, HTTP_USER_AGENT=agente)
    peticion.user = usuario if usuario is not None else AnonymousUser()
    return peticion


@contextmanager
def _ligada(peticion):
    """Liga la petición como lo hace ``AuditContextMiddleware``."""
    audit_service.bind_request(peticion)
    try:
        yield
    finally:
        audit_service.clear_request()


def _persona(rol="ADMIN"):
    return User.objects.create_user(
        email=f"persona.{secrets.token_hex(6)}@inst.test",
        password=secrets.token_urlsafe(24),
        nombre="Ana",
        apellido="Prueba",
        role=rol,
    )


def _filas(accion):
    return list(AuditLog.objects.filter(action=accion).order_by("id"))


# ── La taxonomía ───────────────────────────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("codigo, etiqueta", sorted(ETIQUETAS_NUEVAS.items()))
def test_la_taxonomia_trae_el_evento_con_su_etiqueta(codigo, etiqueta):
    assert audit_service.AUDIT_TAXONOMY[codigo] == etiqueta
    assert audit_service.canonical_action(codigo) == etiqueta
    assert codigo in audit_service.matching_actions(etiqueta)  # el filtro por etiqueta encuentra el código crudo


def test_ninguna_etiqueta_nueva_repite_una_que_ya_existia():
    """«Reutiliza, no dupliques»: cada etiqueta nueva nombra un evento que antes no tenía nombre."""
    etiquetas = list(audit_service.AUDIT_TAXONOMY.values())
    for etiqueta in ETIQUETAS_NUEVAS.values():
        assert etiquetas.count(etiqueta) == 1, etiqueta


def test_los_eventos_que_ya_existian_con_otro_nombre_se_reutilizan():
    """Aprobar, fijar la clave, cerrar sesiones, la analítica y la evaluación de rúbricas ya tenían su código."""
    taxonomia = audit_service.AUDIT_TAXONOMY
    assert taxonomia["USER_APPROVED"] == "usuario.aprobar"
    assert taxonomia["PASSWORD_SET_BY_ADMIN"] == "usuario.fijar_clave"
    assert taxonomia["SESSIONS_REVOKED"] == "sesion.revocar"
    assert taxonomia["ANALYTICS_VIEWED"] == "analitica.ver"
    assert taxonomia["RUBRIC_SAVED"] == "rubrica.evaluar"
    assert taxonomia["TRACE_VIEWED"] == "traza.leer"


# ── record ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def test_record_escribe_una_fila_con_el_actor_el_recurso_la_ip_y_el_agente(settings):
    settings.SIEP_TRUSTED_PROXIES = 0
    actor = _persona("ADMIN")

    with _ligada(_peticion(actor)):
        audit_service.record("USER_UPDATED", "USER", 7, {"targetId": 7, "changed": ["nombre"]})

    [fila] = _filas("USER_UPDATED")
    assert fila.actor_id == actor.pk
    assert fila.actor_role == "ADMIN"
    assert (fila.resource_type, fila.resource_id) == ("USER", "7")
    assert fila.ip_address == "203.0.113.7"
    assert fila.user_agent == "agente-de-prueba/1.0"
    assert json.loads(fila.context_json) == {"taxonomy": "usuario.actualizar", "targetId": 7, "changed": ["nombre"]}
    assert abs((fila.retention_until - fila.occurred_at) - timedelta(days=360)) < timedelta(seconds=10)


def test_record_con_el_actor_explicito_manda_sobre_una_peticion_anonima(settings):
    """El acceso con éxito: la petición aún no está autenticada, pero quien entró es el actor."""
    settings.SIEP_TRUSTED_PROXIES = 0
    persona = _persona("PROFESOR")

    with _ligada(_peticion()):
        audit_service.record("LOGIN_SUCCEEDED", "USER", persona.pk, {"provider": "password"}, actor=persona)

    [fila] = _filas("LOGIN_SUCCEEDED")
    assert (fila.actor_id, fila.actor_role) == (persona.pk, "PROFESOR")
    assert fila.resource_id == str(persona.pk)


def test_record_de_una_peticion_sin_sesion_es_anonimo():
    with _ligada(_peticion()):
        audit_service.record("LOGIN_FAILED", "USER", None, {"reason": "unknown_account"})

    [fila] = _filas("LOGIN_FAILED")
    assert fila.actor_id is None
    assert fila.actor_role == "ANONYMOUS"
    assert fila.resource_id is None


def test_record_fuera_de_una_peticion_es_anonimo_y_sin_ip():
    audit_service.record("LOGOUT", "USER", 3)

    [fila] = _filas("LOGOUT")
    assert (fila.actor_id, fila.actor_role, fila.ip_address, fila.user_agent) == (None, "ANONYMOUS", None, None)


def test_un_fallo_al_escribir_no_rompe_la_operacion_y_queda_como_error(monkeypatch, caplog):
    def fallar(*args, **kwargs):
        raise RuntimeError("base caída")

    monkeypatch.setattr(AuditLog.objects, "create", fallar)

    with caplog.at_level(logging.ERROR, logger="apps.simulation.services.audit_service"):
        assert audit_service.record("LOGOUT", "USER", 3) is None

    errores = [r for r in caplog.records if getattr(r, "fields", {}).get("event") == "audit_write_failed"]
    assert [e.fields for e in errores] == [{"event": "audit_write_failed", "action": "LOGOUT", "error": "RuntimeError"}]


# ── La lista blanca del contexto ───────────────────────────────────────────────────────────────────────────────────
def test_todo_evento_nuevo_declara_su_lista_blanca():
    for codigo in ETIQUETAS_NUEVAS:
        assert codigo in audit_service.CONTEXT_WHITELIST, codigo


def _contexto_de_un_fallo_con_de_todo():
    clave, ficha = secrets.token_urlsafe(24), secrets.token_urlsafe(40)
    correo = f"quien.{secrets.token_hex(4)}@inst.test"
    audit_service.record(
        "LOGIN_FAILED", "USER", None,
        {
            "emailHash": "a" * 64, "reason": "bad_password",
            "email": correo, "password": clave, "token": ficha, "question": "texto libre de una estudiante",
        },
    )
    [fila] = _filas("LOGIN_FAILED")
    return fila, (correo, clave, ficha)


def _afirmar_lista_blanca_aplicada():
    fila, secretos = _contexto_de_un_fallo_con_de_todo()
    assert json.loads(fila.context_json) == {"taxonomy": "sesion.fallar", "emailHash": "a" * 64, "reason": "bad_password"}
    for secreto in secretos:
        assert secreto not in fila.context_json


def test_la_lista_blanca_descarta_lo_que_el_evento_no_declara():
    _afirmar_lista_blanca_aplicada()


def test_control_negativo_sin_lista_blanca_el_correo_y_la_clave_llegan_a_la_fila(monkeypatch):
    monkeypatch.setattr(audit_service, "CONTEXT_WHITELIST", {})

    with pytest.raises(AssertionError):
        _afirmar_lista_blanca_aplicada()


def test_la_lista_blanca_tambien_manda_cuando_la_accion_se_escribe_con_su_etiqueta():
    """Escribir ``sesion.fallar`` en vez de ``LOGIN_FAILED`` no es una forma de saltarse la lista blanca."""
    audit_service.record(
        "sesion.fallar", "USER", None, {"emailHash": "b" * 64, "reason": "bad_password", "email": "alguien@inst.test"}
    )

    [fila] = _filas("sesion.fallar")
    assert json.loads(fila.context_json) == {"taxonomy": "sesion.fallar", "emailHash": "b" * 64, "reason": "bad_password"}


def test_la_lista_blanca_descarta_valores_con_forma_de_correo_de_texto_o_anidados():
    audit_service.record(
        "USER_UPDATED", "USER", 3,
        {
            "targetId": 3,
            "changed": ["nombre", "alguien@inst.test", "dos palabras", {"anidado": "x"}, "x" * 65],
        },
    )
    audit_service.record("USER_STATUS_CHANGED", "USER", 3, {"targetId": "texto con espacios", "activo": False})

    [actualizado] = _filas("USER_UPDATED")
    [estado] = _filas("USER_STATUS_CHANGED")
    assert json.loads(actualizado.context_json)["changed"] == ["nombre"]
    assert json.loads(estado.context_json) == {"taxonomy": "usuario.estado", "activo": False}


def test_un_evento_sin_lista_blanca_conserva_todo_su_contexto():
    """Los eventos que ya existían (el juego, los casos…) no pasan por la lista blanca: su contexto no cambia."""
    audit_service.append(
        None, "SYSTEM", "ATTEMPT_STARTED", "CASE_VERSION", "5", {"unaClaveCualquiera": "con espacios", "n": 2}, None, None, None
    )

    [fila] = _filas("ATTEMPT_STARTED")
    assert json.loads(fila.context_json) == {
        "taxonomy": "intento.iniciar", "unaClaveCualquiera": "con espacios", "n": 2,
    }


# ── @auditable toma el recurso del resultado ───────────────────────────────────────────────────────────────────────
def test_auditable_toma_el_recurso_de_lo_que_devuelve_la_operacion():
    @audit_service.auditable("AUDIT_PRUEBA_RECURSO", "PRUEBA", -1, resource_id=lambda args, kwargs, result: result["id"])
    def crear_algo():
        return {"id": 41}

    assert crear_algo() == {"id": 41}

    [fila] = _filas("AUDIT_PRUEBA_RECURSO")
    assert (fila.resource_type, fila.resource_id) == ("PRUEBA", "41")


def test_si_el_recurso_del_resultado_falla_la_fila_se_escribe_sin_el_y_la_operacion_sigue():
    @audit_service.auditable(
        "AUDIT_PRUEBA_RECURSO_ROTO", "PRUEBA", -1, resource_id=lambda args, kwargs, result: result["no"]
    )
    def crear_algo_roto():
        return {"id": 1}

    assert crear_algo_roto() == {"id": 1}

    [fila] = _filas("AUDIT_PRUEBA_RECURSO_ROTO")
    assert fila.resource_type == "PRUEBA"
    assert fila.resource_id is None
