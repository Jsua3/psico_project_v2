"""Ninguna cifra al estudiante (Revisión de foco 5 del modelo de métricas, Tarea 17).

Se juega un intento COMPLETO del caso sembrado SIM-VBG-001 por la API HTTP, como estudiante, y se recoge CADA respuesta
JSON de ``/api/simulation/**``. Cada una se recorre entera: falla si un número (``int``/``float``, no ``bool``) cuelga de
una clave que no sea una de la lista blanca explícita de abajo (ids, contadores de HECHOS, duraciones y geometría), o si
aparece, en cualquier nivel, una de las claves retiradas del modelo viejo (puntaje, estrés, métricas, estado clínico,
deltas y conteos por severidad).

Un conteo de hechos («reconsideraste 2 respuestas») no es una medida: ``counts.*`` del reporte congelado v3 son hechos
(cuántas respuestas hubo de cada clase), no un puntaje; el reporte v1/v2 ya cerrado sí lleva cifras, pero este recorrido
usa un intento nuevo (reporte v3), y los reportes viejos se prueban aparte (``test_attempt_report_frozen``).
"""
import json
import re

import pytest
from rest_framework.test import APIClient

from apps.simulation.models import SceneHint, SceneMap, SimulationAttempt

from .test_caso_pdf import (  # noqa: F401  (fixtures y ayudas del recorrido canónico)
    PATH_TO_DOOR,
    _deliberate_clock,
    _move,
    case_version_id,
    estudiante,
)

BASE = "/api/simulation"

#: Claves que NO pueden aparecer en ningún nivel de ninguna respuesta: son el modelo numérico viejo.
RETIRED_KEYS = frozenset({
    "accumulatedScore", "stressIndex", "metrics", "clinicalState", "scoreDelta", "stressDelta", "finalScore",
    "finalStress", "adequateDecisions", "riskyDecisions", "inadequateDecisions", "prohibitedDecisions",
})

#: Claves cuyo valor PUEDE ser un número, cada una con su razón. Todo lo demás que sea numérico es una medida y falla.
ALLOWED_NUMERIC_KEYS = {
    # ── identidad y orden (no miden nada); los ``*Id`` entran por ``ALLOWED_SUFFIXES`` ──
    "id": "identificador de una fila",
    "ordinal": "número de intento del estudiante en ese caso (1.º, 2.º…): un ordinal, no una medida",
    "schemaVersion": "versión del formato del reporte congelado",
    "displayOrder": "posición de la escena/opción en la presentación",
    "order": "posición en la lista (revisión de decisiones, pistas)",
    # ── contadores de HECHOS (qué pasó, no cómo le fue) ──
    "retries": "cuántas veces reconsideró una respuesta antes de decidir",
    "prohibitedRetries": "cuántas veces reconsideró una respuesta contraindicada (hecho, sin evaluarlo)",
    "reflections": "cuántas reflexiones escribió (hecho del recorrido)",
    "reflectionsCount": "cuántas reflexiones escribió (hecho del reporte)",
    "toolsUsed": "cuántas herramientas usó",
    "available": "cuántas pistas trae la escena (hecho de la escena, no de la persona)",
    "decisionScenes": "cuántas escenas de decisión tiene el caso (estructura del caso)",
    "nodeCount": "cuántas escenas tiene el caso (estructura del caso)",
    "recommended": "cuántas respuestas hubo de cada clase: hecho, no puntaje (``counts`` del reporte v3)",
    "acceptable": "ídem: respuestas Aceptables registradas",
    "risky": "ídem: respuestas Con riesgo registradas",
    "contraindicated": "ídem: respuestas Contraindicadas registradas",
    "nonRecommendedCount": "cuántas respuestas no fueron Recomendadas: conteo de hechos",
    "rating": "eco de la propia respuesta del estudiante en la encuesta de cierre, no una medida de él",
    # ── duraciones y tiempos; los ``*Seconds`` entran por ``ALLOWED_SUFFIXES`` ──
    "seconds": "una duración",
    "positionSyncedAt": "marca de tiempo (época) de la última posición sincronizada: un instante, no una medida",
    # ── posiciones y geometría del mundo ──
    "x": "posición", "y": "posición", "width": "geometría del mapa", "height": "geometría del mapa",
    "spawnX": "punto de aparición del mapa", "spawnY": "punto de aparición del mapa",
    "entryX": "punto de entrada de la puerta", "entryY": "punto de entrada de la puerta",
    "interactionRadius": "radio de interacción de un objeto",
}

#: Sufijos con una sola razón cada uno: ``*Id`` (identificador: ``caseVersionId``, ``nodeId``, ``optionId``,
#: ``decisionOptionId``, ``firstOptionId``, ``syncedNodeId``…) y ``*Seconds`` (duración: ``activeSeconds``,
#: ``clockSeconds``, ``totalDurationSeconds``, ``activeDurationSeconds``, ``atSeconds``…).
ALLOWED_SUFFIXES = ("Id", "Seconds")


class RecordingClient(APIClient):
    """Un cliente que guarda el cuerpo JSON de cada respuesta de ``/api/simulation/**``."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.recorded = []

    def request(self, **kwargs):
        response = super().request(**kwargs)
        path = kwargs.get("PATH_INFO", "")
        if path.startswith(BASE) and response.get("Content-Type", "").startswith("application/json"):
            self.recorded.append((f"{kwargs.get('REQUEST_METHOD')} {path}", response.status_code, json.loads(response.content)))
        return response


def _allowed(key):
    return key in ALLOWED_NUMERIC_KEYS or key.endswith(ALLOWED_SUFFIXES)


def _walk(value, where, key, found_numbers, found_keys):
    if isinstance(value, dict):
        for child_key, child in value.items():
            found_keys.append((where, child_key))
            _walk(child, where, child_key, found_numbers, found_keys)
    elif isinstance(value, list):
        for child in value:
            _walk(child, where, key, found_numbers, found_keys)
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        found_numbers.append((where, key, value))


def _scan(recorded):
    numbers, keys = [], []
    for where, _status, body in recorded:
        _walk(body, where, None, numbers, keys)
    return numbers, keys


# ─── el recorrido ─────────────────────────────────────────────────────────────────────────────────────────────────
def _play(estudiante, case_version_id, settings):
    settings.ATTEMPT_FEEDBACK_SURVEY = True
    client = RecordingClient()
    client.force_authenticate(user=estudiante)

    def header(token):
        return {"HTTP_X_SIEP_ATTEMPT_TOKEN": token}

    def decide(attempt_id, token, option_key, expect_retry=False):
        from .test_caso_pdf import _decide_payload

        payload = _decide_payload(client, attempt_id, token, option_key, case_version_id)
        assert ("retry" in payload) is expect_retry
        return payload["attempt"]

    # Lo que ve antes de empezar.
    assert client.get(f"{BASE}/cases").status_code == 200
    assert client.get(f"{BASE}/catalog").status_code == 200
    assert client.get(f"{BASE}/cases/{case_version_id}/brief").status_code == 200

    # Inicio y lectura del estado.
    started = client.post(f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    attempt_id, token = started["attemptId"], started["attemptToken"]
    assert client.get(f"{BASE}/attempts/{attempt_id}", **header(token)).status_code == 200

    # El mundo: lectura, NPC, caminar, herramienta, inspección, reflexión, puerta y vuelta.
    world = client.get(f"{BASE}/attempts/{attempt_id}/world", **header(token)).data["data"]
    map_key = world["map"]["key"]
    _move(client, attempt_id, token, map_key, (560, 380))
    assert client.post(f"{BASE}/attempts/{attempt_id}/npcs/enfermera-urgencias", {"attemptToken": token},
                       format="json").status_code == 200
    _move(client, attempt_id, token, map_key, (430, 435), (340, 430))
    assert client.post(f"{BASE}/attempts/{attempt_id}/interactions/tool-pap", {"attemptToken": token},
                       format="json").status_code == 200
    _move(client, attempt_id, token, map_key, (250, 430))
    used = client.post(
        f"{BASE}/attempts/{attempt_id}/tools/use",
        {"attemptToken": token, "toolCode": "PAP", "targetInteractionKey": "familia-crisis"}, format="json",
    )
    assert used.status_code == 200 and used.data["data"]["pertinent"] is True
    assert client.post(f"{BASE}/attempts/{attempt_id}/interactions/familia-crisis", {"attemptToken": token},
                       format="json").status_code == 200
    assert client.post(
        f"{BASE}/attempts/{attempt_id}/reflections",
        {"attemptToken": token, "nodeId": started["currentNode"]["id"], "text": "Me quedo con la calma de la familia."},
        format="json",
    ).status_code == 200

    # Pistas: la escena trae una; se mira el estado y se pide.
    attempt = SimulationAttempt.objects.get(pk=attempt_id)
    scene_map = SceneMap.objects.get(case_version_id=attempt.case_version_id, node_id=attempt.current_node_id)
    SceneHint.objects.create(scene_map=scene_map, hint_order=10, text="Piensa primero en la seguridad de la familia.")
    assert client.get(f"{BASE}/attempts/{attempt_id}/hints", **header(token)).status_code == 200
    assert client.post(f"{BASE}/attempts/{attempt_id}/hints/next", {"attemptToken": token, "requestId": "req-hint-0000001"},
                       format="json").status_code == 200
    assert client.get(f"{BASE}/attempts/{attempt_id}/hints", **header(token)).status_code == 200

    # Cambia de sala y vuelve (puertas).
    _move(client, attempt_id, token, map_key, (340, 430), *PATH_TO_DOOR[-3:])
    assert client.post(
        f"{BASE}/attempts/{attempt_id}/enter-room",
        {"attemptToken": token, "targetNodeKey": "hospital-sala-escucha", "doorKey": "puerta-sala-escucha"},
        format="json",
    ).status_code == 200
    assert client.post(
        f"{BASE}/attempts/{attempt_id}/enter-room",
        {"attemptToken": token, "targetNodeKey": "hospital-urgencias", "doorKey": "puerta-urgencias"}, format="json",
    ).status_code == 200

    # Decisiones: una contraindicada que se reintenta, la recomendada, pausa y reanudación, y el resto hasta el final.
    decide(attempt_id, token, "h1-interrogar-victima", expect_retry=True)
    decide(attempt_id, token, "h1-pap-contencion")
    decide(attempt_id, token, "h2-459-1257")
    assert client.get(f"{BASE}/attempts/{attempt_id}/progress-map", **header(token)).status_code == 200
    paused = client.post(f"{BASE}/attempts/{attempt_id}/safe-exit", {"attemptToken": token, "reason": "Necesito parar"},
                         format="json")
    assert paused.status_code == 200 and paused.data["data"]["status"] == "PAUSED"
    assert client.get(f"{BASE}/attempts/{attempt_id}/student-report").status_code == 200
    assert client.get(f"{BASE}/attempts/{attempt_id}/completion-report", **header(token)).status_code == 200
    # Preguntar por el intento activo de un intento en pausa lo reanuda con una credencial nueva.
    active = client.get(f"{BASE}/cases/{case_version_id}/active-attempt")
    assert active.status_code == 200
    token = active.data["data"]["attemptToken"]
    resumed = client.post(f"{BASE}/attempts/{attempt_id}/resume", {"attemptToken": token}, format="json")
    assert resumed.status_code == 200 and resumed.data["data"]["status"] == "IN_PROGRESS"
    decide(attempt_id, token, "h3-integral-psicosocial")
    decide(attempt_id, token, "c1-riesgo-proteccion-derechos")
    decide(attempt_id, token, "c2-2126-1098-1257")
    final = decide(attempt_id, token, "c3-integral-derechos")
    assert final["status"] == "COMPLETED" and final["completionReport"]["schemaVersion"] == 3

    # Después de cerrar: el estado, los tres reportes, la evaluación, el recorrido, el historial y la encuesta.
    assert client.get(f"{BASE}/attempts/{attempt_id}", **header(token)).status_code == 200
    assert client.get(f"{BASE}/attempts/{attempt_id}/report", **header(token)).status_code == 200
    assert client.get(f"{BASE}/attempts/{attempt_id}/student-report").status_code == 200
    assert client.get(f"{BASE}/attempts/{attempt_id}/completion-report", **header(token)).status_code == 200
    assert client.get(f"{BASE}/attempts/{attempt_id}/evaluation").status_code == 200
    assert client.get(f"{BASE}/attempts/{attempt_id}/progress-map", **header(token)).status_code == 200
    assert client.get(f"{BASE}/attempts/{attempt_id}/feedback").status_code == 200
    assert client.post(f"{BASE}/attempts/{attempt_id}/feedback", {"rating": 4, "comment": "Útil."},
                       format="json").status_code == 201

    # Otro intento que queda en pausa por una salida segura.
    other = client.post(f"{BASE}/attempts", {"caseVersionId": case_version_id, "forceNew": True},
                        format="json").data["data"]
    assert client.post(f"{BASE}/attempts/{other['attemptId']}/safe-exit",
                       {"attemptToken": other["attemptToken"], "reason": "Salida segura"}, format="json").status_code == 200
    assert client.get(f"{BASE}/cases/{case_version_id}/active-attempt").status_code == 200
    assert client.get(f"{BASE}/attempts/{other['attemptId']}/student-report").status_code == 200
    assert client.get(f"{BASE}/attempts/history").status_code == 200

    return client.recorded


@pytest.fixture
def recorrido(estudiante, case_version_id, settings):
    return _play(estudiante, case_version_id, settings)


def _shape(where):
    """``GET /api/simulation/attempts/<uuid>/hints`` -> ``GET /api/simulation/attempts/{id}/hints``."""
    where = re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "{id}", where)
    return re.sub(r"/cases/\d+/", "/cases/{n}/", where)


#: Los endpoints de ``/api/simulation/**`` que un estudiante usa en un intento y que el recorrido debe tocar.
COVERED = {
    "GET /api/simulation/cases", "GET /api/simulation/catalog", "GET /api/simulation/cases/{n}/brief",
    "GET /api/simulation/cases/{n}/active-attempt", "GET /api/simulation/attempts/history",
    "POST /api/simulation/attempts", "GET /api/simulation/attempts/{id}", "GET /api/simulation/attempts/{id}/world",
    "PATCH /api/simulation/attempts/{id}/world-state", "POST /api/simulation/attempts/{id}/enter-room",
    "POST /api/simulation/attempts/{id}/interactions/familia-crisis", "POST /api/simulation/attempts/{id}/npcs/enfermera-urgencias",
    "POST /api/simulation/attempts/{id}/tools/use", "POST /api/simulation/attempts/{id}/reflections",
    "POST /api/simulation/attempts/{id}/decisions", "POST /api/simulation/attempts/{id}/safe-exit",
    "POST /api/simulation/attempts/{id}/resume", "GET /api/simulation/attempts/{id}/hints",
    "POST /api/simulation/attempts/{id}/hints/next", "GET /api/simulation/attempts/{id}/progress-map",
    "GET /api/simulation/attempts/{id}/report", "GET /api/simulation/attempts/{id}/student-report",
    "GET /api/simulation/attempts/{id}/completion-report", "GET /api/simulation/attempts/{id}/evaluation",
    "GET /api/simulation/attempts/{id}/feedback", "POST /api/simulation/attempts/{id}/feedback",
}


def test_el_recorrido_cubre_los_endpoints_del_estudiante(recorrido):
    seen = {_shape(where) for where, _status, _body in recorrido}

    assert COVERED <= seen, f"el recorrido no tocó: {sorted(COVERED - seen)}"
    assert len(recorrido) >= 50


def test_ninguna_respuesta_lleva_una_clave_del_modelo_numerico_viejo(recorrido):
    _numbers, keys = _scan(recorrido)

    found = sorted({(where, key) for where, key in keys if key in RETIRED_KEYS})

    assert found == [], f"claves retiradas en las respuestas: {found}"


def test_ningun_numero_de_las_respuestas_es_una_medida(recorrido):
    numbers, _keys = _scan(recorrido)

    measures = sorted({(where, key, value) for where, key, value in numbers if not _allowed(key)}, key=str)

    assert measures == [], f"números que no son id, hecho, duración ni posición: {measures}"
