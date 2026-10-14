"""A-01 — Puntos de uso de los ayudantes compartidos (shared/jsonutils.py).

Al unificar las copias de `_clamp` y de los lectores JSON, cada módulo sigue
importándolas con su alias de siempre. Estas pruebas fijan que cada punto de uso
acota o lee igual que antes: sin ellas, quitar la acotación de un sitio o dejar de
leer un campo JSON no rompía ninguna prueba (lo reveló la mutación de A-01).

Casi todas son puras (objetos simples, sin base de datos); la del estrés al usar una
herramienta recorre el flujo HTTP real.
"""
import json
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from rest_framework.test import APIClient

from apps.grupos.models import Grupo
from apps.simulation.models import CaseVersion, SimulationAttempt
from apps.simulation.serializers import game_dtos
from apps.simulation.services import (
    case_effects,
    decision_effects,
    instructor_service,
    world_service,
)

User = get_user_model()


# ── decision_effects.apply ───────────────────────────────────────────────────
def _attempt(**overrides):
    base = dict(
        accumulated_score=0, stress_index=50, user_trust=50, victim_risk=50,
        institutional_route_activated=False, revictimization_risk=False,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _effects(**overrides):
    base = dict(
        score_delta=0, stress_delta=0, trust_delta=0, victim_risk_delta=0,
        institutional_route_activated=False, revictimization_risk=False,
    )
    base.update(overrides)
    return decision_effects.DecisionEffects(**base)


def test_decision_effects_acota_por_arriba_a_100():
    attempt = _attempt(stress_index=95, user_trust=98, victim_risk=99)

    decision_effects.apply(
        attempt, _effects(stress_delta=40, trust_delta=10, victim_risk_delta=15)
    )

    assert (attempt.stress_index, attempt.user_trust, attempt.victim_risk) == (100, 100, 100)


def test_decision_effects_acota_por_abajo_a_0():
    attempt = _attempt(stress_index=5, user_trust=3, victim_risk=2)

    decision_effects.apply(
        attempt, _effects(stress_delta=-10, trust_delta=-20, victim_risk_delta=-5)
    )

    assert (attempt.stress_index, attempt.user_trust, attempt.victim_risk) == (0, 0, 0)


def test_decision_effects_dentro_del_rango_suma_sin_acotar():
    attempt = _attempt()

    decision_effects.apply(
        attempt, _effects(stress_delta=10, trust_delta=-5, victim_risk_delta=7)
    )

    assert (attempt.stress_index, attempt.user_trust, attempt.victim_risk) == (60, 45, 57)


# ── case_effects.apply_case_effects ──────────────────────────────────────────
class _FakeState:
    """Estado de mundo mínimo: solo `flags_json` y `save`."""

    def __init__(self, raw):
        self.flags_json = json.dumps(raw)
        self.saved_fields = None

    def save(self, update_fields=None):
        self.saved_fields = update_fields


def test_case_effects_acota_las_metricas_del_caso_a_0_100(monkeypatch):
    state = _FakeState({"caseMetrics": {"confianza": 95, "crisis_emocional": 10}})
    monkeypatch.setattr(case_effects, "_load_state", lambda attempt: state)

    # h1-pap-contencion: confianza +15, crisis_emocional -20, calidad_duelo +15 (resto fuera del caso).
    case_effects.apply_case_effects(
        SimpleNamespace(id=1), SimpleNamespace(option_key="h1-pap-contencion")
    )

    metrics = json.loads(state.flags_json)["caseMetrics"]
    assert metrics["confianza"] == 100        # 95 + 15, acotada
    assert metrics["crisis_emocional"] == 0   # 10 - 20, acotada
    assert metrics["calidad_duelo"] == 65     # 50 (por defecto) + 15, sin acotar
    assert state.saved_fields == ["flags_json", "updated_at"]


# ── world_service._door_entry ────────────────────────────────────────────────
def test_door_entry_acota_la_entrada_a_los_limites_del_mapa_destino():
    target = SimpleNamespace(width=800, height=600)

    assert world_service._door_entry({"entryX": 5000, "entryY": -30}, target) == (800, 0)


def test_door_entry_usa_960_por_540_si_el_mapa_no_trae_tamano():
    target = SimpleNamespace(width=0, height=None)

    assert world_service._door_entry({"entryX": 5000, "entryY": 5000}, target) == (960, 540)


def test_door_entry_dentro_del_mapa_no_cambia():
    target = SimpleNamespace(width=960, height=540)

    assert world_service._door_entry({"entryX": 120, "entryY": 340}, target) == (120, 340)


# ── game_dtos.node_state ─────────────────────────────────────────────────────
def _node(**overrides):
    base = dict(
        id=7, node_key="n-1", title="Escena", narrative="Texto",
        support_resources_json='["Línea 106", "Bienestar"]', required_tools_json='["PAP"]',
        sensitive_content=False, safe_exit_required=False, warning_message=None,
        terminal_node=False, decision_prompt="", display_order=0,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_node_state_lee_las_listas_json_del_nodo():
    state = game_dtos.node_state(_node(), include_options=False)

    assert state["supportResources"] == ["Línea 106", "Bienestar"]
    assert state["requiredTools"] == ["PAP"]


def test_node_state_con_json_invalido_o_ausente_devuelve_listas_vacias():
    state = game_dtos.node_state(
        _node(support_resources_json="no es json", required_tools_json=None),
        include_options=False,
    )

    assert state["supportResources"] == []
    assert state["requiredTools"] == []


# ── instructor_service._score_view ───────────────────────────────────────────
def _score(evidence_json):
    return SimpleNamespace(
        rubric_criterion_id=3, score=4.5, comment="Bien", evidence_json=evidence_json
    )


def test_score_view_lee_la_evidencia_como_diccionario():
    view = instructor_service._score_view(_score('{"eventIds": [1, 2]}'))

    assert view == {
        "criterionId": 3, "score": 4.5, "comment": "Bien", "evidence": {"eventIds": [1, 2]},
    }


@pytest.mark.parametrize("raw", [None, "", "[1, 2]", "no es json"])
def test_score_view_con_evidencia_que_no_es_un_objeto_devuelve_diccionario_vacio(raw):
    assert instructor_service._score_view(_score(raw))["evidence"] == {}


# ── world_service.use_tool: el estrés queda acotado ──────────────────────────
def _cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def case_version_id(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id


@pytest.fixture
def estudiante(db, case_version_id):
    user = User.objects.create_user(
        email="est_helpers@x.com", password="x", nombre="Est", apellido="Helpers", role="ESTUDIANTE"
    )
    profesor = User.objects.create_user(
        email="prof_helpers@x.com", password="x", nombre="Pro", apellido="Helpers", role="PROFESOR"
    )
    grupo = Grupo.objects.create(nombre="Grupo helpers", codigo="HELP1", profesor=profesor)
    with connection.cursor() as cur:
        cur.execute(
            "INSERT INTO grupo_estudiante (grupo_id, estudiante_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, user.id],
        )
        cur.execute(
            "INSERT INTO case_assignments (grupo_id, case_version_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, case_version_id],
        )
    return user


def _attempt_with_pap_in_inventory(client, case_version_id):
    """Inicia un intento y recoge la herramienta PAP (misma ruta que test_world)."""
    data = client.post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]
    attempt_id, token = data["attemptId"], data["attemptToken"]
    headers = {"HTTP_X_SIEP_ATTEMPT_TOKEN": token}
    world = client.get(f"/api/simulation/attempts/{attempt_id}/world", **headers).data["data"]
    moved = client.patch(
        f"/api/simulation/attempts/{attempt_id}/world-state",
        {"attemptToken": token, "playerX": 340, "playerY": 430, "currentMapKey": world["map"]["key"]},
        format="json",
    )
    assert moved.status_code == 200, moved.data
    pickup = client.post(
        f"/api/simulation/attempts/{attempt_id}/interactions/tool-pap",
        {"attemptToken": token}, format="json",
    )
    assert pickup.status_code == 200, pickup.data
    return attempt_id, token


def _use_pap(client, attempt_id, token):
    resp = client.post(
        f"/api/simulation/attempts/{attempt_id}/tools/use",
        {"attemptToken": token, "toolCode": "PAP"}, format="json",
    )
    assert resp.status_code == 200, resp.data
    return resp.data["data"]


def test_usar_una_herramienta_no_pertinente_no_pasa_el_estres_de_100(estudiante, case_version_id):
    client = _cl(estudiante)
    attempt_id, token = _attempt_with_pap_in_inventory(client, case_version_id)
    SimulationAttempt.objects.filter(pk=attempt_id).update(stress_index=99)

    result = _use_pap(client, attempt_id, token)

    assert result["pertinent"] is False and result["stressDelta"] == 3
    assert SimulationAttempt.objects.get(pk=attempt_id).stress_index == 100  # 99 + 3, acotado


def test_usar_una_herramienta_pertinente_no_baja_el_estres_de_0(
    estudiante, case_version_id, monkeypatch
):
    client = _cl(estudiante)
    attempt_id, token = _attempt_with_pap_in_inventory(client, case_version_id)
    SimulationAttempt.objects.filter(pk=attempt_id).update(stress_index=2)
    monkeypatch.setattr(world_service, "_evaluate_tool_pertinence", lambda *args: True)

    result = _use_pap(client, attempt_id, token)

    assert result["pertinent"] is True and result["stressDelta"] == -5
    assert SimulationAttempt.objects.get(pk=attempt_id).stress_index == 0  # 2 - 5, acotado
