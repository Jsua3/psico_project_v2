"""A-01 — Puntos de uso de los ayudantes compartidos (shared/jsonutils.py).

Al unificar las copias de `_clamp` y de los lectores JSON, cada módulo sigue
importándolas con su alias de siempre. Estas pruebas fijan que cada punto de uso
acota o lee igual que antes: sin ellas, quitar la acotación de un sitio o dejar de
leer un campo JSON no rompía ninguna prueba (lo reveló la mutación de A-01).

Todas son puras (objetos simples, sin base de datos). La del estrés al usar una herramienta
se retiró con la Tarea 5: ya no hay estrés que acotar (``test_tool_use_no_stress.py``).
"""
import json
from types import SimpleNamespace

from apps.simulation.serializers import game_dtos
from apps.simulation.services import (
    case_effects,
    decision_effects,
    world_service,
)


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
    pap_contencion = {
        "severity": "recommended",
        "flags": {"pap_aplicado": True, "familia_contenida": True},
        "metrics": {"confianza": 15, "crisis_emocional": -20, "calidad_duelo": 15,
                    "rigor_tecnico": 10, "etica_profesional": 10, "riesgo_victima": -5},
    }
    case_effects.apply_case_effects(
        SimpleNamespace(id=1),
        SimpleNamespace(option_key="h1-pap-contencion", effects=json.dumps(pap_contencion)),
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
        terminal_node=False, decision_prompt="", display_order=0, intensity="MEDIUM",
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
