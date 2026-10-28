"""A-01 — Puntos de uso de los ayudantes compartidos (shared/jsonutils.py).

Al unificar las copias de `_clamp` y de los lectores JSON, cada módulo sigue
importándolas con su alias de siempre. Estas pruebas fijan que cada punto de uso
acota o lee igual que antes: sin ellas, quitar la acotación de un sitio o dejar de
leer un campo JSON no rompía ninguna prueba (lo reveló la mutación de A-01).

Todas son puras (objetos simples, sin base de datos). Las de la acotación de los indicadores del intento y de las
métricas del caso se retiraron con el modelo de métricas: ya no hay indicadores 0-100 que acotar.
"""
from types import SimpleNamespace

from apps.simulation.serializers import game_dtos
from apps.simulation.services import world_service


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
