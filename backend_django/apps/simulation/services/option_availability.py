"""Qué opciones de la escena se ofrecen al estudiante (bloque A, DSL 2.1).

Una opción con ``requires_json`` solo se ofrece cuando su condición se cumple con lo que el intento lleva: hitos, persona,
conteos y los hechos de exploración de la sala de la escena (``talked``, ``inspected``, ``has``, ``used``). Los hechos
por sala viven en ``AttemptWorldState.flags_json`` bajo ``exploredBySala``; un intento abierto antes de este cambio no
los tiene y usa las listas globales del mundo. Un requisito roto no se ofrece, pero si eso dejara la escena sin salida
se ofrecen todas: una partida nunca se atasca por un dato mal armado.
"""
import logging

from apps.simulation.casedef.availability import is_available
from apps.simulation.models import (
    REGISTERED_DECISION_EVENT_TYPES,
    AttemptEvent,
    AttemptWorldState,
    DecisionOption,
    SceneMap,
)
from shared.jsonutils import read_map, read_string_list, write_map

from . import case_rules, case_state, endings

logger = logging.getLogger("siep.game")

EXPLORED_KEY = "exploredBySala"
_FACT_KINDS = ("talked", "inspected")


def sala_key(scene_map) -> str:
    """La clave de la sala de un mapa: ``ambient.salaId`` si existe y, si no, la clave del mapa."""
    sala = read_map(scene_map.ambient_json).get("salaId")
    if isinstance(sala, str) and sala.strip():
        return sala
    return scene_map.map_key


def record_fact(world_state, kind: str, key: str) -> None:
    """Anota que el jugador habló con ``key`` o lo inspeccionó, en la sala actual del mundo. No guarda: lo hace quien llama."""
    if kind not in _FACT_KINDS or not key:
        return
    flags = read_map(world_state.flags_json)
    by_sala = flags.get(EXPLORED_KEY)
    if not isinstance(by_sala, dict):
        by_sala = {}
    entry = by_sala.get(sala_key(world_state.scene_map))
    if not isinstance(entry, dict):
        entry = {}
    keys = entry.get(kind)
    if not isinstance(keys, list):
        keys = []
    if key not in keys:
        keys.append(key)
    entry[kind] = keys
    by_sala[sala_key(world_state.scene_map)] = entry
    flags[EXPLORED_KEY] = by_sala
    world_state.flags_json = write_map(flags)


def _strings(value) -> set:
    """Las cadenas de una lista guardada; cualquier otra cosa es un conjunto vacío."""
    return {item for item in value if isinstance(item, str)} if isinstance(value, list) else set()


def _explored(world_state, node) -> dict:
    """Los hechos de exploración de la sala del nodo; sin estado del mundo, todo vacío."""
    empty = {"talked": set(), "inspected": set(), "has": set(), "used": set()}
    if world_state is None:
        return empty
    flags = read_map(world_state.flags_json)
    explored = {
        "has": set(read_string_list(world_state.inventory_json)),
        "used": set(read_string_list(world_state.used_tool_keys_json)),
    }
    by_sala = flags.get(EXPLORED_KEY)
    if isinstance(by_sala, dict):
        scene_map = SceneMap.objects.filter(node_id=node.id).first()
        entry = by_sala.get(sala_key(scene_map)) if scene_map is not None else None
        entry = entry if isinstance(entry, dict) else {}
        explored["talked"] = _strings(entry.get("talked"))
        explored["inspected"] = _strings(entry.get("inspected"))
    else:
        # Intento anterior al registro por sala: las listas globales del mundo.
        viewed = flags.get("viewedNpcKeys")
        explored["talked"] = _strings(viewed)
        explored["inspected"] = set(read_string_list(world_state.inspected_object_keys_json))
    return explored


def availability_context(attempt, node, world_state=None) -> dict:
    """El contexto de las condiciones de las opciones: ``{"milestones", "persona", "counts", "explored"}``."""
    if world_state is None:
        world_state = AttemptWorldState.objects.filter(attempt_id=attempt.id).select_related("scene_map").first()
    decisions = [
        event.decision_option
        for event in AttemptEvent.objects.filter(
            attempt_id=attempt.id, event_type__in=REGISTERED_DECISION_EVENT_TYPES, decision_option__isnull=False
        ).select_related("decision_option")
    ]
    context = endings.condition_context(case_state.read(attempt), decisions)
    context["explored"] = _explored(world_state, node)
    return context


def split_options(attempt, node=None, world_state=None):
    """``(ofrecidas, retenidas)`` de la escena, por id. Si ninguna quedara ofrecida, se ofrecen todas."""
    node = node or attempt.current_node
    options = list(DecisionOption.objects.filter(source_node_id=node.id).order_by("id"))
    context = None
    offered, withheld = [], []
    for option in options:
        requires = case_rules.requires_of(option)
        if requires is None:
            withheld.append(option)
            continue
        if requires and context is None:
            context = availability_context(attempt, node, world_state)
        (offered if is_available(requires, context or {}) else withheld).append(option)
    if options and not offered:
        logger.warning(
            "Todas las opciones de la escena %s (intento %s) quedaron retenidas por su requisito: se ofrecen todas.",
            node.id, attempt.id,
        )
        return options, []
    return offered, withheld


def is_offered(attempt, option) -> bool:
    """¿Se ofrece esta opción ahora? (la revalidación al elegir)."""
    return option.id in {o.id for o in split_options(attempt)[0]}
