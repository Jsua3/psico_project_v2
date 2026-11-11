"""Qué opciones de la escena se ofrecen al estudiante (bloque A, DSL 2.1).

Una opción con ``requires_json`` solo se ofrece cuando su condición se cumple con lo que el intento lleva: hitos, persona,
conteos y los hechos de exploración de la sala de la escena (``talked``, ``inspected``, ``has``, ``used``). Los hechos
por sala viven en ``AttemptWorldState.flags_json`` bajo ``exploredBySala``; un intento abierto antes de este cambio no
los tiene y usa las listas globales del mundo. Un requisito roto no se ofrece, pero si eso dejara la escena sin salida
se ofrecen todas: una partida nunca se atasca por un dato mal armado.
"""
import json
import logging

from apps.simulation.casedef.availability import is_available
from apps.simulation.casedef.conditions import unmet_facts
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
#: Foto de lo explorado antes de que el intento tuviera registro por sala (Ruling 8): ``{"talked": [...], "inspected": [...]}``.
BEFORE_KEY = "exploredBeforeSala"
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
        # Primer registro por sala de este intento: lo explorado hasta ahora (listas globales) se guarda aparte para no
        # perderlo. Quien llama DEBE invocar ``record_fact`` ANTES de agregar ``key`` a las listas globales: así el hecho
        # que se está registrando no entra en la foto (por eso el ``!= key`` es solo una segunda guarda).
        before = {
            "talked": [k for k in _strings_list(flags.get("viewedNpcKeys")) if not (kind == "talked" and k == key)],
            "inspected": [
                k for k in _strings_list(read_string_list(world_state.inspected_object_keys_json))
                if not (kind == "inspected" and k == key)
            ],
        }
        if before["talked"] or before["inspected"]:
            flags[BEFORE_KEY] = before
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


def _strings_list(value) -> list:
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


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
        before = flags.get(BEFORE_KEY)
        before = before if isinstance(before, dict) else {}
        explored["talked"] = _strings(entry.get("talked")) | _strings(before.get("talked"))
        explored["inspected"] = _strings(entry.get("inspected")) | _strings(before.get("inspected"))
    else:
        # Intento anterior al registro por sala: las listas globales del mundo.
        viewed = flags.get("viewedNpcKeys")
        explored["talked"] = _strings(viewed)
        explored["inspected"] = set(read_string_list(world_state.inspected_object_keys_json))
    return explored


def _mentions_count(condition) -> bool:
    """¿La condición compara algún conteo de respuestas (``count``)? Solo entonces hace falta leer las decisiones."""
    if isinstance(condition, list):
        return any(_mentions_count(item) for item in condition)
    if not isinstance(condition, dict):
        return False
    return "count" in condition or any(_mentions_count(value) for value in condition.values())


def availability_context(attempt, node, world_state=case_state.NOT_LOADED, *, need_counts=True) -> dict:
    """El contexto de las condiciones de las opciones: ``{"milestones", "persona", "counts", "explored"}``.

    Con ``world_state`` ya cargado no se vuelve a leer (hitos y persona salen de ahí). ``need_counts=False`` evita leer las
    decisiones del intento cuando ningún requisito cuenta respuestas: los conteos quedan en cero.
    """
    if world_state is case_state.NOT_LOADED:
        world_state = AttemptWorldState.objects.filter(attempt_id=attempt.id).select_related("scene_map").first()
    decisions = []
    if need_counts:
        decisions = [
            event.decision_option
            for event in AttemptEvent.objects.filter(
                attempt_id=attempt.id, event_type__in=REGISTERED_DECISION_EVENT_TYPES, decision_option__isnull=False
            ).select_related("decision_option")
        ]
    context = endings.condition_context(case_state.read(attempt, world_state=world_state), decisions)
    context["explored"] = _explored(world_state, node)
    return context


def evaluate_options(attempt, node=None, world_state=case_state.NOT_LOADED):
    """``(ofrecidas, retenidas, contexto)`` de la escena. El contexto se arma solo si algún requisito lo necesita (si no,
    ``{}``) y, cuando se arma, se lee una vez. Si ninguna quedara ofrecida, se ofrecen todas."""
    node = node or attempt.current_node
    context = None
    options = list(DecisionOption.objects.filter(source_node_id=node.id).order_by("id"))
    offered, withheld = [], []
    for option in options:
        requires = case_rules.requires_of(option)
        if requires is None:
            withheld.append(option)
            continue
        if requires and context is None:
            need_counts = any(_mentions_count(case_rules.requires_of(o) or {}) for o in options)
            context = availability_context(attempt, node, world_state, need_counts=need_counts)
        (offered if is_available(requires, context or {}) else withheld).append(option)
    if options and not offered:
        logger.warning(
            "Todas las opciones de la escena %s (intento %s) quedaron retenidas por su requisito: se ofrecen todas.",
            node.id, attempt.id,
        )
        return options, [], context or {}
    return offered, withheld, context or {}


def split_options(attempt, node=None, world_state=case_state.NOT_LOADED):
    """``(ofrecidas, retenidas)`` de la escena, por id (ver ``evaluate_options``)."""
    offered, withheld, _ = evaluate_options(attempt, node, world_state)
    return offered, withheld


#: Evento de contabilidad (no es de decisión ni sale en la línea de tiempo): qué opciones no se ofrecieron al decidir.
OPTIONS_NOT_OFFERED = "OPTIONS_NOT_OFFERED"


def not_offered_detail(withheld, context) -> str:
    """El detalle del evento ``OPTIONS_NOT_OFFERED``: ``{"v": 1, "options": [{"id", "unmet": [[tipo, clave], …]}]}``.

    ``unmet`` lista los hechos del requisito que no se cumplen; queda vacía si el requisito está roto.
    """
    entries = []
    for option in withheld:
        requires = case_rules.requires_of(option)
        unmet = unmet_facts(requires, context) if requires else []
        entries.append({"id": option.id, "unmet": [list(fact) for fact in unmet]})
    return json.dumps({"v": 1, "options": entries}, ensure_ascii=False)


def is_offered(attempt, option) -> bool:
    """¿Se ofrece esta opción ahora? (la revalidación al elegir)."""
    return option.id in {o.id for o in split_options(attempt)[0]}
