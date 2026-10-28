"""El estado del intento en el modelo de respuesta (Tarea 7 del modelo de métricas).

El estado que recibe el estudiante lleva a la persona consultante en palabras (``persona``) y la
intensidad de la escena (``currentNode.intensity``); las cifras viejas (``accumulatedScore``,
``stressIndex``, ``metrics``, ``clinicalState``) ya no viajan (Tarea 17).

Corre por HTTP contra el caso publicado por seed_caso_pdf (SIM-VBG-001): hospital-urgencias es la
escena sensible (intensidad ``HIGH``); las demás son ``MEDIUM``.
"""
import json

import pytest

from apps.simulation.casedef.vocabulary import Activation, Bond
from apps.simulation.models import DecisionOption, SimulationAttempt, SimulationNode

from .test_caso_pdf import (  # noqa: F401  (fixtures y ayudas del recorrido canónico)
    _decide_payload,
    _deliberate_clock,
    _start,
    _world,
    case_version_id,
    cl,
    estudiante,
)

#: Claves de la vieja forma numérica: ninguna cifra clínica llega al estudiante.
RETIRED_STATE_KEYS = {"accumulatedScore", "stressIndex", "metrics", "clinicalState"}
LIVE_NUMBER_KEYS = {"victimRisk", "userTrust", "sceneStress", "professionalScore", "revictimizationRisk"}


def _state(client, attempt_id, token):
    return client.get(
        f"/api/simulation/attempts/{attempt_id}", HTTP_X_SIEP_ATTEMPT_TOKEN=token,
    ).data["data"]


def _keys(value):
    """Todas las claves de un JSON anidado."""
    found = set()
    if isinstance(value, dict):
        for key, child in value.items():
            found.add(key)
            found |= _keys(child)
    elif isinstance(value, list):
        for child in value:
            found |= _keys(child)
    return found


def _persona_of(state):
    return state["persona"]["bond"], state["persona"]["activation"]


def _option_key(client, attempt_id, token, response_class):
    """La clave de la primera opción de la escena actual con esa clase de respuesta."""
    attempt = SimulationAttempt.objects.get(pk=attempt_id)
    return DecisionOption.objects.filter(
        source_node_id=attempt.current_node_id, response_class=response_class,
    ).order_by("id").first().option_key


def test_el_estado_trae_a_la_persona_desde_el_inicio_en_palabras(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)

    persona = _state(c, attempt_id, token)["persona"]

    assert persona["bond"] == Bond.GUARDED.value
    assert persona["activation"] == Activation.TENSE.value
    assert persona["label"] == "se muestra cautelosa y tensa"


def test_el_estado_al_iniciar_tambien_trae_a_la_persona(estudiante, case_version_id):
    c = cl(estudiante)
    started = c.post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]

    assert _persona_of(started) == ("GUARDED", "TENSE")


def test_una_recomendada_mueve_un_paso_a_la_persona(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)
    key = _option_key(c, attempt_id, token, "RECOMMENDED")

    state = _decide_payload(c, attempt_id, token, key, case_version_id)["attempt"]

    assert _persona_of(state) == ("OPEN", "CALM")
    assert state["persona"]["label"] == "se muestra abierta y serena"
    assert _persona_of(_state(c, attempt_id, token)) == ("OPEN", "CALM")


def test_una_contraindicada_registrada_baja_el_vinculo_y_sube_la_activacion(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)
    key = _option_key(c, attempt_id, token, "CONTRAINDICATED")

    # La 1.ª respuesta contraindicada se reintenta (no se aplica): la persona no se mueve.
    first = _decide_payload(c, attempt_id, token, key, case_version_id)
    assert "retry" in first and _persona_of(first["attempt"]) == ("GUARDED", "TENSE")

    # La 2.ª se registra: -1 vínculo, +1 activación.
    state = _decide_payload(c, attempt_id, token, key, case_version_id)["attempt"]

    assert _persona_of(state) == ("WITHDRAWN", "CRISIS")
    assert state["persona"]["label"] == "se muestra retraída y en crisis"


def test_un_intento_pausado_y_reanudado_reconstruye_a_la_persona(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)
    key = _option_key(c, attempt_id, token, "RECOMMENDED")
    before = _decide_payload(c, attempt_id, token, key, case_version_id)["attempt"]

    paused = c.post(
        f"/api/simulation/attempts/{attempt_id}/safe-exit",
        {"attemptToken": token, "reason": "Pausa solicitada"}, format="json",
    ).data["data"]
    resumed = c.post(
        f"/api/simulation/attempts/{attempt_id}/resume", {"attemptToken": token}, format="json",
    ).data["data"]

    assert paused["status"] == "PAUSED" and resumed["status"] == "IN_PROGRESS"
    assert _persona_of(before) == ("OPEN", "CALM")
    assert paused["persona"] == resumed["persona"] == before["persona"]
    assert resumed["currentNode"]["key"] == before["currentNode"]["key"]


def test_la_intensidad_de_la_escena_sale_de_la_columna(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)

    state = _state(c, attempt_id, token)

    assert state["currentNode"]["key"] == "hospital-urgencias"
    assert state["currentNode"]["sensitiveContent"] is True
    assert state["currentNode"]["intensity"] == "HIGH"

    # Cambiarla en la columna cambia lo que se sirve: no se deriva de otra cosa.
    SimulationNode.objects.filter(pk=state["currentNode"]["id"]).update(intensity="LOW")
    assert _state(c, attempt_id, token)["currentNode"]["intensity"] == "LOW"


def test_las_escenas_no_sensibles_van_en_intensidad_media(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)
    key = _option_key(c, attempt_id, token, "RECOMMENDED")

    node = _decide_payload(c, attempt_id, token, key, case_version_id)["attempt"]["currentNode"]

    assert node["sensitiveContent"] is False
    assert node["intensity"] == "MEDIUM"


@pytest.mark.parametrize("empty", ["", None])
def test_una_intensidad_vacia_se_sirve_como_media(empty):
    from apps.simulation.serializers.game_dtos import node_state

    node = SimulationNode(id=1, node_key="n", title="N", intensity=empty)

    assert node_state(node, include_options=False)["intensity"] == "MEDIUM"


def test_las_claves_viejas_ya_no_viajan_ni_las_cifras_clinicas(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)
    key = _option_key(c, attempt_id, token, "RECOMMENDED")

    for state in (
        _state(c, attempt_id, token),
        _decide_payload(c, attempt_id, token, key, case_version_id)["attempt"],
        _state(c, attempt_id, token),
    ):
        assert not RETIRED_STATE_KEYS & set(state)
        assert not LIVE_NUMBER_KEYS & _keys(state)
        assert "finalScore" not in json.dumps(state) and "finalStress" not in json.dumps(state)
