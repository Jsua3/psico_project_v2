"""S3-2a · Dónde se exige el consentimiento al aviso de contenido (ETH-01) y dónde NUNCA.

Con ``SIEP_CONSENT_REQUIRED`` encendida, el estudiante que no tiene un consentimiento vigente (de ESA versión del caso y de la
versión ACTUAL del aviso) no carga el mundo de su intento ni da ninguna orden de juego: 403 ``CONSENT_REQUIRED`` con la versión
vigente. Lo que entrega contenido o avanza el caso está en ``EXIGEN``; lo que quien está en crisis necesita siempre, en ``LIBRES``
(REGLA-004 / ETH-02: pausa, salida segura, reanudar, abandonar, consultar el intento abierto, los reportes y el propio
consentimiento). Una guardia compara las dos tablas con el urlconf: una ruta nueva de ``api/simulation/`` sin clasificar rompe
la prueba y obliga a decidir.

Cada orden lleva su control negativo: las pruebas quitan la exigencia de ESA orden (o la ponen en una libre) y comprueban que
el resultado cambia, de modo que las pruebas positivas se ponen en rojo si alguien lo hace de verdad.
"""
import secrets
import sys
from dataclasses import dataclass
from typing import Callable

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext, override_settings
from django.urls import URLPattern, URLResolver, get_resolver

from apps.privacy import consent_service
from apps.privacy.models import ConsentRecord, ConsentType
from apps.simulation.models import AttemptEvent, AttemptWorldState, ReflectionJournal, SimulationAttempt
from apps.simulation.services import game_service, hints, world_service

from .support import BASE, asignar_caso, cliente, crear_version, url_consentimiento

pytestmark = [pytest.mark.req("ETH-01", "SIEP-RF-05", "RNF-010"), pytest.mark.security]


# ── La partida: un estudiante con el caso asignado y un intento abierto, creado con las banderas apagadas ──


class Partida:
    def __init__(self, estudiante, version, *, conocer_el_mundo=True):
        self.student = estudiante
        self.version = version
        self.grupo = asignar_caso(estudiante, version)
        self.api = cliente(estudiante)
        inicio = self.api.post(f"{BASE}/attempts", {"caseVersionId": version.id}, format="json").data["data"]
        self.attempt_id = inicio["attemptId"]
        self.token = inicio["attemptToken"]
        self.node_id = inicio["currentNode"]["id"]
        self.option_id = inicio["currentNode"]["options"][0]["id"]
        self.map_key = self.x = self.y = None
        if conocer_el_mundo:  # con la exigencia encendida el mundo no se carga: hay que llegar con las banderas apagadas
            mundo = self.api.get(self.url("/world"), **self.cabecera).data["data"]
            self.map_key, self.x, self.y = mundo["map"]["key"], mundo["player"]["x"], mundo["player"]["y"]

    @property
    def cabecera(self):
        return {"HTTP_X_SIEP_ATTEMPT_TOKEN": self.token}

    def url(self, resto=""):
        return f"{BASE}/attempts/{self.attempt_id}{resto}"

    def cuerpo(self, **extra):
        return {"attemptToken": self.token, **extra}


@pytest.fixture
def partida(estudiante_a, version_publicada):
    return Partida(estudiante_a, version_publicada)


def consentir(p):
    respuesta = p.api.post(
        url_consentimiento(p.version.id), {"noticeVersion": consent_service.content_notice_version()}, format="json"
    )
    assert respuesta.status_code in (200, 201), respuesta.data
    return respuesta


def retirar(p):
    respuesta = p.api.delete(url_consentimiento(p.version.id))
    assert respuesta.status_code == 200, respuesta.data
    return respuesta


def instantanea(p):
    """Todo lo que una orden rechazada NO puede tocar del intento."""
    intento = SimulationAttempt.objects.get(pk=p.attempt_id)
    mundo = AttemptWorldState.objects.filter(pk=p.attempt_id).first()
    return {
        "estado": intento.status,
        "nodo": intento.current_node_id,
        "puntaje": intento.accumulated_score,
        "estres": intento.stress_index,
        "token": intento.attempt_token_hash,
        "actividad": (intento.last_activity_at, intento.active_seconds),
        "eventos": AttemptEvent.objects.filter(attempt_id=p.attempt_id).count(),
        "bitacoras": list(ReflectionJournal.objects.filter(attempt_id=p.attempt_id).values_list("id", "encrypted_text")),
        "mundo": (mundo.player_x, mundo.player_y, mundo.updated_at) if mundo else None,
    }


# ── Las órdenes que EXIGEN consentimiento (entregan contenido o avanzan el caso) ────────────────────────


@dataclass(frozen=True)
class Caso:
    nombre: str
    ruta: str  # tal como está en el urlconf, sin «api/simulation/»
    servicio: str | None  # la función que carga el intento con ``_require_attempt`` (o la que se llama directo)
    llamar: Callable
    pasa: frozenset  # los estados posibles cuando el consentimiento está en regla (la orden decide lo suyo)
    motivo: str


def _pistas_siguiente(p):
    return p.api.post(p.url("/hints/next"), p.cuerpo(requestId=f"cons-{secrets.token_hex(6)}"), format="json")


def _con_encuesta(llamada):
    """Ejecuta la llamada con la encuesta breve encendida (lo normal es apagada: 404 como si no existiera)."""
    with override_settings(ATTEMPT_FEEDBACK_SURVEY=True):
        return llamada()


ATTEMPT = "attempts/<uuid:attempt_id>"

EXIGEN = [
    Caso("GET attempts/{id}", ATTEMPT, "get_attempt",
         lambda p: p.api.get(p.url(), **p.cabecera), frozenset({200}),
         "el estado del intento trae la escena actual y sus opciones"),
    Caso("GET world", f"{ATTEMPT}/world", "get_world",
         lambda p: p.api.get(p.url("/world"), **p.cabecera), frozenset({200}),
         "el mundo: mapa, objetos, diálogos y herramientas de la sala"),
    Caso("GET progress-map", f"{ATTEMPT}/progress-map", "get_progress_map",
         lambda p: p.api.get(p.url("/progress-map"), **p.cabecera), frozenset({200}),
         "el recorrido por las escenas del caso y dónde va el intento"),
    Caso("GET hints", f"{ATTEMPT}/hints", "get_hint_state",
         lambda p: p.api.get(p.url("/hints"), **p.cabecera), frozenset({200}),
         "las pistas ya reveladas de la escena actual"),
    Caso("POST hints/next", f"{ATTEMPT}/hints/next", "reveal_next_hint",
         _pistas_siguiente, frozenset({200, 409}),
         "revela una pista de la escena y deja un evento"),
    Caso("PATCH world-state", f"{ATTEMPT}/world-state", "update_position",
         lambda p: p.api.patch(p.url("/world-state"), p.cuerpo(playerX=p.x + 4, playerY=p.y, currentMapKey=p.map_key), format="json"),
         frozenset({200}),
         "mueve al jugador en el mundo y guarda su posición"),
    Caso("POST enter-room", f"{ATTEMPT}/enter-room", "enter_room",
         lambda p: p.api.post(p.url("/enter-room"), p.cuerpo(targetNodeKey="sala-que-no-existe", doorKey="puerta-que-no-existe"), format="json"),
         frozenset({400, 404}),
         "cruza una puerta y carga la sala de destino"),
    Caso("POST interactions", f"{ATTEMPT}/interactions/<str:interaction_key>", "open_interaction",
         lambda p: p.api.post(p.url("/interactions/familia-crisis"), p.cuerpo(), format="json"), frozenset({200, 400}),
         "abre un objeto o a una persona del mundo (diálogo, herramienta)"),
    Caso("POST npcs", f"{ATTEMPT}/npcs/<str:npc_key>", "record_npc_interaction",
         lambda p: p.api.post(p.url("/npcs/vecino"), p.cuerpo(), format="json"), frozenset({400, 404}),
         "registra el diálogo con una persona de la sala"),
    Caso("POST tools/use", f"{ATTEMPT}/tools/use", "use_tool",
         lambda p: p.api.post(p.url("/tools/use"), p.cuerpo(toolCode="herramienta-que-no-existe"), format="json"),
         frozenset({400, 404}),
         "usa una herramienta clínica: cambia el estrés del intento"),
    Caso("POST decisions", f"{ATTEMPT}/decisions", "choose_decision",
         lambda p: p.api.post(p.url("/decisions"), p.cuerpo(decisionOptionId=p.option_id), format="json"), frozenset({200}),
         "decide: avanza el caso y entrega la consecuencia y la siguiente escena"),
    Caso("POST reflections", f"{ATTEMPT}/reflections", "save_reflection",
         lambda p: p.api.post(p.url("/reflections"), p.cuerpo(nodeId=p.node_id, text="Reflexión " + secrets.token_urlsafe(6)), format="json"),
         frozenset({200}),
         "guarda la bitácora de la escena"),
]


# ── Lo que NUNCA exige consentimiento ────────────────────────────────────────────────────────────────────


def _pausar(p):
    return p.api.post(p.url("/safe-exit"), p.cuerpo(reason="Necesito parar un momento"), format="json")


def _reanudar_tras_pausar(p):
    assert _pausar(p).status_code == 200
    return p.api.post(p.url("/resume"), p.cuerpo(), format="json")


def _empezar(p, **extra):
    return p.api.post(f"{BASE}/attempts", {"caseVersionId": p.version.id, **extra}, format="json")


LIBRES = [
    Caso("POST safe-exit (pausa y salida segura)", f"{ATTEMPT}/safe-exit", "safe_exit",
         _pausar, frozenset({200}),
         "quien necesita parar siempre puede (REGLA-004, ETH-02)"),
    Caso("POST resume (reanudar, para volver a pausar)", f"{ATTEMPT}/resume", "resume_attempt",
         _reanudar_tras_pausar, frozenset({200}),
         "recupera el intento pausado; sin consentimiento el cliente muestra el aviso antes de dar órdenes de juego"),
    Caso("GET active-attempt (consultar el intento abierto)", "cases/<int:case_version_id>/active-attempt", "find_active_attempt",
         lambda p: p.api.get(f"{BASE}/cases/{p.version.id}/active-attempt"), frozenset({200}),
         "da el intento abierto y un token nuevo: sin él no se puede pausar tras recargar la página"),
    Caso("POST attempts (devuelve el intento abierto)", "attempts", "start_attempt",
         _empezar, frozenset({200}),
         "crear o recuperar el intento no entrega el mundo (el flujo es intento → aviso → mundo)"),
    Caso("POST attempts forceNew (abandonar)", "attempts", "start_attempt",
         lambda p: _empezar(p, forceNew=True), frozenset({200}),
         "empezar de nuevo cierra el intento anterior: abandonar no se condiciona"),
    Caso("GET attempts/history", "attempts/history", None,
         lambda p: p.api.get(f"{BASE}/attempts/history"), frozenset({200}),
         "el resumen de los propios intentos (sin escenas)"),
    Caso("GET student-report", f"{ATTEMPT}/student-report", None,
         lambda p: p.api.get(p.url("/student-report")), frozenset({200}),
         "reporte: lo hecho se puede leer aunque se retire el consentimiento"),
    Caso("GET completion-report", f"{ATTEMPT}/completion-report", "get_completion_report",
         lambda p: p.api.get(p.url("/completion-report"), **p.cabecera), frozenset({400}),
         "reporte de cierre (mientras se juega responde su propio 400)"),
    Caso("GET report", f"{ATTEMPT}/report", "get_attempt_report",
         lambda p: p.api.get(p.url("/report"), **p.cabecera), frozenset({409}),
         "reporte congelado de un intento completado (antes, su propio 409)"),
    Caso("GET evaluation", f"{ATTEMPT}/evaluation", None,
         lambda p: p.api.get(p.url("/evaluation")), frozenset({200}),
         "la evaluación del docente para su dueño"),
    # BORRADOR (E6-3): la encuesta breve se responde sobre un intento YA COMPLETADO, que pasó por el consentimiento; no entrega
    # contenido ni avanza el caso, y retirar el consentimiento no debe impedir contestar sobre lo ya vivido. Va con la encuesta
    # ENCENDIDA (apagada responde 404 antes de mirar el consentimiento y la prueba no protegería nada): el intento de la partida
    # sigue abierto, así que la lectura da 200 y la respuesta su propio 409; lo que importa es que no sea CONSENT_REQUIRED.
    Caso("GET feedback (encuesta breve)", f"{ATTEMPT}/feedback", None,
         lambda p: _con_encuesta(lambda: p.api.get(p.url("/feedback"))), frozenset({200}),
         "la encuesta de un intento: no entrega contenido del caso"),
    Caso("POST feedback (encuesta breve)", f"{ATTEMPT}/feedback", None,
         lambda p: _con_encuesta(lambda: p.api.post(p.url("/feedback"), {"rating": 4}, format="json")), frozenset({409}),
         "responder la encuesta no avanza el caso (con el intento abierto, su propio 409)"),
    Caso("GET catalog", "catalog", None,
         lambda p: p.api.get(f"{BASE}/catalog"), frozenset({200}), "el catálogo de casos"),
    Caso("GET cases", "cases", None,
         lambda p: p.api.get(f"{BASE}/cases"), frozenset({200}), "los casos asignados"),
    Caso("GET brief", "cases/<int:case_version_id>/brief", None,
         lambda p: p.api.get(f"{BASE}/cases/{p.version.id}/brief"), frozenset({200}),
         "la ficha previa al juego: es lo que se lee ANTES de aceptar"),
    Caso("GET consent", "cases/<int:case_version_id>/consent", None,
         lambda p: p.api.get(url_consentimiento(p.version.id)), frozenset({200}),
         "sin esta ruta no habría cómo dar el consentimiento"),
    Caso("POST consent", "cases/<int:case_version_id>/consent", None,
         lambda p: p.api.post(url_consentimiento(p.version.id), {"noticeVersion": consent_service.content_notice_version()}, format="json"),
         frozenset({200, 201}),
         "dar el consentimiento"),
    Caso("DELETE consent", "cases/<int:case_version_id>/consent", None,
         lambda p: p.api.delete(url_consentimiento(p.version.id)), frozenset({200}),
         "retirarlo"),
]

#: Rutas de ``api/simulation/`` sin prueba de comportamiento aquí, con el motivo de que no se condicionen.
SIN_PRUEBA = {
    "ai-assistant": (
        "no carga el mundo ni toca el intento: manda título del caso y nodo al proveedor y devuelve texto del asistente; "
        "está apagada por defecto (AI_ASSISTANT_ENABLED) y responde 404 (ver informe de S3-2a)"
    ),
}


def _rutas_de_simulacion():
    rutas = set()

    def recorrer(patrones, prefijo=""):
        for patron in patrones:
            if isinstance(patron, URLResolver):
                recorrer(patron.url_patterns, prefijo + str(patron.pattern))
            elif isinstance(patron, URLPattern):
                ruta = (prefijo + str(patron.pattern)).rstrip("/")
                if ruta.startswith("api/simulation/"):
                    rutas.add(ruta.removeprefix("api/simulation/"))

    recorrer(get_resolver().url_patterns)
    return rutas


def _ids(casos):
    return [caso.nombre for caso in casos]


def _no_es_el_consentimiento(codigo):
    return codigo not in ("CONSENT_REQUIRED", "DATA_TREATMENT_CONSENT_REQUIRED")


# ── La guardia: cada ruta de simulación está clasificada ─────────────────────────────────────────────────


def test_cada_ruta_de_simulacion_esta_clasificada_frente_al_consentimiento():
    clasificadas = {caso.ruta for caso in EXIGEN + LIBRES} | set(SIN_PRUEBA)

    reales = _rutas_de_simulacion()

    assert reales - clasificadas == set(), (
        f"Rutas nuevas sin clasificar: decide si EXIGEN consentimiento o van LIBRES (y por qué): {sorted(reales - clasificadas)}"
    )
    assert clasificadas - reales == set(), f"Rutas clasificadas que ya no existen: {sorted(clasificadas - reales)}"


def test_ninguna_ruta_esta_a_la_vez_entre_las_que_exigen_y_las_libres():
    nombres = [caso.nombre for caso in EXIGEN + LIBRES]
    assert len(nombres) == len(set(nombres))
    assert not {caso.ruta for caso in EXIGEN} & {caso.ruta for caso in LIBRES}


def test_los_servicios_de_las_ordenes_existen():
    # El control negativo localiza la llamada por el nombre de la función: un nombre mal escrito lo dejaría sin efecto.
    for caso in EXIGEN + LIBRES:
        if caso.servicio:
            assert any(hasattr(modulo, caso.servicio) for modulo in (game_service, world_service, hints)), caso.servicio


# ── Sin consentimiento: las órdenes de juego responden 403 y NO escriben nada ───────────────────────────


@pytest.mark.parametrize("caso", EXIGEN, ids=_ids(EXIGEN))
def test_sin_consentimiento_la_orden_responde_403_consent_required_y_no_toca_el_intento(settings, partida, caso):
    settings.SIEP_CONSENT_REQUIRED = True
    antes = instantanea(partida)

    respuesta = caso.llamar(partida)

    assert respuesta.status_code == 403, respuesta.data
    assert respuesta.data["success"] is False
    assert respuesta.data["code"] == "CONSENT_REQUIRED"
    assert respuesta.data["noticeVersion"] == settings.SIEP_CONTENT_NOTICE_VERSION
    assert instantanea(partida) == antes


@pytest.mark.parametrize("caso", EXIGEN, ids=_ids(EXIGEN))
def test_con_el_consentimiento_vigente_la_orden_sigue_su_curso(settings, partida, caso):
    settings.SIEP_CONSENT_REQUIRED = True
    consentir(partida)

    respuesta = caso.llamar(partida)

    assert respuesta.status_code in caso.pasa, respuesta.data
    assert _no_es_el_consentimiento(respuesta.data.get("code"))


@pytest.mark.parametrize("caso", EXIGEN, ids=_ids(EXIGEN))
def test_tras_retirar_el_consentimiento_vuelve_el_403_y_lo_hecho_sigue(settings, partida, caso):
    settings.SIEP_CONSENT_REQUIRED = True
    consentir(partida)
    # Algo hecho: una bitácora y un paso por el mundo.
    assert partida.api.post(partida.url("/reflections"), partida.cuerpo(nodeId=partida.node_id, text="Lo que viví"), format="json").status_code == 200
    assert partida.api.patch(
        partida.url("/world-state"), partida.cuerpo(playerX=partida.x + 4, playerY=partida.y, currentMapKey=partida.map_key), format="json"
    ).status_code == 200
    antes = instantanea(partida)
    assert antes["bitacoras"] and antes["mundo"] is not None
    retirar(partida)

    respuesta = caso.llamar(partida)

    assert respuesta.status_code == 403 and respuesta.data["code"] == "CONSENT_REQUIRED"
    assert instantanea(partida) == antes  # el intento, sus eventos y sus reflexiones siguen intactos


@pytest.mark.parametrize("caso", EXIGEN, ids=_ids(EXIGEN))
def test_con_la_bandera_apagada_nada_cambia(settings, partida, caso):
    assert settings.SIEP_CONSENT_REQUIRED is False

    respuesta = caso.llamar(partida)

    assert respuesta.status_code in caso.pasa, respuesta.data
    assert _no_es_el_consentimiento(respuesta.data.get("code"))


def test_apagada_la_bandera_el_servidor_no_consulta_el_consentimiento(settings, partida):
    with CaptureQueriesContext(connection) as capturadas:
        partida.api.get(partida.url("/world"), **partida.cabecera)

    assert not [q for q in capturadas.captured_queries if "consent_records" in q["sql"]]


# ── Control negativo: quitar la exigencia de UNA orden la deja pasar sin consentimiento ─────────────────


def _sin_exigencia_en(monkeypatch, servicio):
    """``_require_attempt`` deja de exigir el consentimiento cuando lo llama ``servicio`` (lo que pasaría si alguien quitara la
    exigencia de esa orden)."""
    original = game_service._require_attempt

    def envoltorio(*args, **kwargs):
        if sys._getframe(1).f_code.co_name == servicio:
            kwargs["enforce_consent"] = False
        return original(*args, **kwargs)

    monkeypatch.setattr(game_service, "_require_attempt", envoltorio)


@pytest.mark.parametrize("caso", EXIGEN, ids=_ids(EXIGEN))
def test_control_negativo_sin_la_exigencia_de_esa_orden_responde_sin_pedir_consentimiento(settings, monkeypatch, partida, caso):
    settings.SIEP_CONSENT_REQUIRED = True
    _sin_exigencia_en(monkeypatch, caso.servicio)

    respuesta = caso.llamar(partida)

    assert respuesta.status_code in caso.pasa, respuesta.data  # sin la llamada, la prueba del 403 de arriba estaría en rojo
    assert _no_es_el_consentimiento(respuesta.data.get("code"))


def test_control_negativo_quitar_la_exigencia_de_una_orden_no_afloja_las_demas(settings, monkeypatch, partida):
    settings.SIEP_CONSENT_REQUIRED = True
    _sin_exigencia_en(monkeypatch, "get_world")

    assert partida.api.get(partida.url("/world"), **partida.cabecera).status_code == 200
    assert partida.api.get(partida.url("/hints"), **partida.cabecera).status_code == 403


# ── Lo que NUNCA exige: sigue en 200 aunque falte o se haya retirado el consentimiento ──────────────────


@pytest.mark.parametrize("caso", LIBRES, ids=_ids(LIBRES))
def test_las_ordenes_libres_responden_igual_sin_consentimiento_con_la_exigencia_encendida(settings, partida, caso):
    settings.SIEP_CONSENT_REQUIRED = True

    respuesta = caso.llamar(partida)

    assert respuesta.status_code in caso.pasa, respuesta.data
    assert _no_es_el_consentimiento(respuesta.data.get("code") if hasattr(respuesta.data, "get") else None)


@pytest.mark.parametrize("caso", LIBRES, ids=_ids(LIBRES))
def test_las_ordenes_libres_responden_igual_con_el_consentimiento_retirado(settings, partida, caso):
    settings.SIEP_CONSENT_REQUIRED = True
    consentir(partida)
    retirar(partida)

    respuesta = caso.llamar(partida)

    assert respuesta.status_code in caso.pasa, respuesta.data
    assert _no_es_el_consentimiento(respuesta.data.get("code") if hasattr(respuesta.data, "get") else None)


@pytest.mark.parametrize("encendida", [True, False])
def test_la_pausa_con_la_exigencia_encendida_y_sin_consentimiento_deja_el_intento_pausado(settings, partida, encendida):
    settings.SIEP_CONSENT_REQUIRED = encendida

    respuesta = _pausar(partida)

    assert respuesta.status_code == 200 and respuesta.data["data"]["status"] == "PAUSED"
    assert SimulationAttempt.objects.get(pk=partida.attempt_id).status == "PAUSED"
    assert AttemptEvent.objects.filter(attempt_id=partida.attempt_id, event_type="SAFE_EXIT_REQUESTED").count() == 1


def test_reanudar_un_intento_pausado_sin_consentimiento_devuelve_el_intento_en_juego(settings, partida):
    settings.SIEP_CONSENT_REQUIRED = True

    respuesta = _reanudar_tras_pausar(partida)

    assert respuesta.status_code == 200 and respuesta.data["data"]["status"] == "IN_PROGRESS"
    # Reanudar no da el mundo: las órdenes de juego siguen pidiendo el consentimiento.
    assert partida.api.get(partida.url("/world"), **partida.cabecera).status_code == 403


def test_abandonar_empezando_de_nuevo_sin_consentimiento_cierra_el_intento_anterior(settings, partida):
    settings.SIEP_CONSENT_REQUIRED = True

    respuesta = _empezar(partida, forceNew=True)

    assert respuesta.status_code == 200 and respuesta.data["data"]["resumed"] is False
    assert respuesta.data["data"]["attemptId"] != partida.attempt_id
    assert SimulationAttempt.objects.get(pk=partida.attempt_id).status == "REPLACED"


def test_consultar_el_intento_abierto_sin_consentimiento_da_un_token_con_el_que_se_puede_pausar(settings, partida):
    settings.SIEP_CONSENT_REQUIRED = True

    abierto = partida.api.get(f"{BASE}/cases/{partida.version.id}/active-attempt")
    token_nuevo = abierto.data["data"]["attemptToken"]
    pausa = partida.api.post(partida.url("/safe-exit"), {"attemptToken": token_nuevo, "reason": "Tras recargar"}, format="json")

    assert abierto.status_code == 200 and abierto.data["data"]["resumed"] is True
    assert pausa.status_code == 200 and pausa.data["data"]["status"] == "PAUSED"


# ── Control negativo de la invariante: si la pausa (o cualquier orden libre) exigiera consentimiento, se vería ──


def _exigiendo_en(monkeypatch, servicio):
    """``_require_attempt`` EXIGE el consentimiento cuando lo llama ``servicio`` (lo que pasaría si alguien llamara a
    ``require_consent`` desde esa orden libre)."""
    original = game_service._require_attempt

    def envoltorio(*args, **kwargs):
        if sys._getframe(1).f_code.co_name == servicio:
            kwargs["enforce_consent"] = True
        return original(*args, **kwargs)

    monkeypatch.setattr(game_service, "_require_attempt", envoltorio)


def _exigiendo_antes(monkeypatch, nombre):
    """La función de ``game_service`` llama a ``require_consent`` antes de hacer lo suyo."""
    original = getattr(game_service, nombre)

    def envoltorio(case_version_id, actor, *args, **kwargs):
        consent_service.require_consent(actor, case_version_id)
        return original(case_version_id, actor, *args, **kwargs)

    monkeypatch.setattr(game_service, nombre, envoltorio)


LIBRES_CON_SERVICIO = [caso for caso in LIBRES if caso.servicio]


@pytest.mark.parametrize("caso", LIBRES_CON_SERVICIO, ids=_ids(LIBRES_CON_SERVICIO))
def test_control_negativo_si_una_orden_libre_exigiera_consentimiento_la_invariante_lo_veria(settings, monkeypatch, partida, caso):
    settings.SIEP_CONSENT_REQUIRED = True
    if caso.servicio in ("find_active_attempt", "start_attempt"):
        _exigiendo_antes(monkeypatch, caso.servicio)
    else:
        _exigiendo_en(monkeypatch, caso.servicio)

    respuesta = caso.llamar(partida)

    # Con la llamada puesta, la orden libre responde 403: la prueba de arriba (200 sin consentimiento) estaría en rojo.
    assert respuesta.status_code == 403 and respuesta.data["code"] == "CONSENT_REQUIRED"


# ── La traza del docente y los reportes no exigen el consentimiento de quien los lee ───────────────────


def test_la_traza_del_docente_no_exige_consentimiento_de_nadie(settings, partida):
    settings.SIEP_CONSENT_REQUIRED = True
    docente = partida.grupo.profesor

    traza = cliente(docente).get(f"/api/instructor/attempts/{partida.attempt_id}/trace")

    assert traza.status_code == 200
    assert traza.data["data"]["world"] is not None  # el mundo del intento (``estudiante=False``) sale sin el consentimiento


def test_el_reporte_del_estudiante_lo_leen_su_dueno_y_su_docente_sin_consentimiento(settings, partida):
    settings.SIEP_CONSENT_REQUIRED = True

    for lector in (partida.student, partida.grupo.profesor):
        assert cliente(lector).get(partida.url("/student-report")).status_code == 200


# ── No se revela el estado del consentimiento a quien no tiene el intento ─────────────────────────────────


def test_un_token_equivocado_sigue_siendo_404_y_no_revela_el_estado_del_consentimiento(settings, partida):
    settings.SIEP_CONSENT_REQUIRED = True

    respuesta = partida.api.get(partida.url("/world"), HTTP_X_SIEP_ATTEMPT_TOKEN=secrets.token_urlsafe(24))

    assert respuesta.status_code == 404 and respuesta.data["code"] == "NOT_FOUND"


def test_el_intento_de_otra_persona_no_se_destraba_con_el_consentimiento_propio(settings, partida, estudiante_b):
    settings.SIEP_CONSENT_REQUIRED = True
    asignar_caso(estudiante_b, partida.version)
    api_b = cliente(estudiante_b)
    api_b.post(url_consentimiento(partida.version.id), {"noticeVersion": consent_service.content_notice_version()}, format="json")

    respuesta = api_b.get(partida.url("/world"), **partida.cabecera)

    assert respuesta.status_code in (403, 404) and respuesta.data["code"] != "CONSENT_REQUIRED"


# ── Qué cuenta como consentimiento vigente ───────────────────────────────────────────────────────────────


def test_el_consentimiento_de_otro_caso_no_destraba_este(settings, partida, docente):
    settings.SIEP_CONSENT_REQUIRED = True
    consent_service.accept_content_notice(partida.student, crear_version(docente, estado="PUBLISHED"), consent_service.content_notice_version())

    assert partida.api.get(partida.url("/world"), **partida.cabecera).status_code == 403


def test_cambiar_la_version_del_aviso_vuelve_a_exigir_el_consentimiento_con_la_version_nueva(settings, partida):
    settings.SIEP_CONSENT_REQUIRED = True
    consentir(partida)
    assert partida.api.get(partida.url("/world"), **partida.cabecera).status_code == 200

    settings.SIEP_CONTENT_NOTICE_VERSION = "2026-11-borrador"
    nuevo = partida.api.get(partida.url("/world"), **partida.cabecera)
    assert nuevo.status_code == 403 and nuevo.data["noticeVersion"] == "2026-11-borrador"

    consentir(partida)  # el cliente muestra el aviso nuevo y lo acepta
    assert partida.api.get(partida.url("/world"), **partida.cabecera).status_code == 200
    assert ConsentRecord.objects.filter(person=partida.student).count() == 2  # la aceptación vieja sigue como evidencia


def test_un_registro_retirado_o_de_otra_version_no_destraba(settings, partida):
    settings.SIEP_CONSENT_REQUIRED = True
    ConsentRecord.objects.create(
        person=partida.student, consent_type=ConsentType.CONTENT_NOTICE, case_version=partida.version, notice_version="aviso-viejo"
    )

    assert partida.api.get(partida.url("/world"), **partida.cabecera).status_code == 403


# ── El flujo completo, de principio a fin ────────────────────────────────────────────────────────────────


def test_el_flujo_de_un_estudiante_con_la_exigencia_encendida(settings, estudiante_a, version_publicada):
    settings.SIEP_CONSENT_REQUIRED = True
    # Crear el intento no pide consentimiento (el flujo es intento → aviso → mundo).
    p = Partida(estudiante_a, version_publicada, conocer_el_mundo=False)
    mundo = lambda: p.api.get(p.url("/world"), **p.cabecera)  # noqa: E731

    estado = p.api.get(url_consentimiento(p.version.id)).data["data"]
    assert (estado["required"], estado["accepted"]) == (True, False)
    assert mundo().status_code == 403

    consentir(p)
    assert mundo().status_code == 200
    assert p.api.post(p.url("/decisions"), p.cuerpo(decisionOptionId=p.option_id), format="json").status_code == 200

    retirar(p)
    assert mundo().status_code == 403
    assert _pausar(p).status_code == 200  # aun retirado el consentimiento, pausar sigue siendo posible
    abierto = p.api.get(f"{BASE}/cases/{p.version.id}/active-attempt").data["data"]
    assert abierto["status"] == "PAUSED"
    p.token = abierto["attemptToken"]  # consultar el intento abierto emite un token nuevo: el anterior ya no vale

    consentir(p)  # se vuelve a aceptar el aviso
    assert mundo().status_code == 200


# ── DATA_TREATMENT: detrás de su propia bandera (apagada hasta que la institución entregue texto y versión) ─


def test_con_la_bandera_del_tratamiento_de_datos_el_mundo_responde_403_hasta_que_se_registra(settings, partida):
    settings.SIEP_DATA_TREATMENT_NOTICE_VERSION = "datos-1"
    settings.SIEP_DATA_TREATMENT_CONSENT_REQUIRED = True

    sin_registro = partida.api.get(partida.url("/world"), **partida.cabecera)
    assert sin_registro.status_code == 403
    assert sin_registro.data["code"] == "DATA_TREATMENT_CONSENT_REQUIRED"

    consent_service.accept_data_treatment(partida.student, "datos-1")  # aún no hay ruta: se registra con el servicio

    assert partida.api.get(partida.url("/world"), **partida.cabecera).status_code == 200


def test_la_pausa_tampoco_exige_el_tratamiento_de_datos(settings, partida):
    settings.SIEP_DATA_TREATMENT_NOTICE_VERSION = "datos-1"
    settings.SIEP_DATA_TREATMENT_CONSENT_REQUIRED = True

    assert _pausar(partida).status_code == 200
    assert partida.api.get(f"{BASE}/cases/{partida.version.id}/active-attempt").status_code == 200


@pytest.mark.parametrize("caso", EXIGEN, ids=_ids(EXIGEN))
def test_con_la_bandera_del_tratamiento_encendida_cada_orden_de_juego_lo_exige(settings, partida, caso):
    settings.SIEP_DATA_TREATMENT_NOTICE_VERSION = "datos-1"
    settings.SIEP_DATA_TREATMENT_CONSENT_REQUIRED = True

    respuesta = caso.llamar(partida)

    assert respuesta.status_code == 403 and respuesta.data["code"] == "DATA_TREATMENT_CONSENT_REQUIRED"
