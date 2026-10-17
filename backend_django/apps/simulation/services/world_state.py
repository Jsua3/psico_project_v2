"""Estado del mundo de un intento: resolverlo sin escribir y persistirlo al mutar (E1-6).

Hasta E1-5 leer el mundo lo **guardaba** (un UPDATE por cada ``GET /world``) y el resto
del servidor daba por hecho que, al decidir, ese estado ya existía. Ahora resolverlo es
una función pura (``resolve_world_state``): la lectura no escribe nada y solo las órdenes
que mutan lo persisten (``require_world_state``). Vive aparte de ``world_service`` porque
también lo necesitan los efectos del caso (``case_effects``), que ``world_service`` y
``game_service`` importan: así no hay ciclo.
"""
from django.utils import timezone
from rest_framework.exceptions import NotFound

from shared.jsonutils import read_map as _read_map, write_map as _write_map

from ..models import AttemptWorldState, SceneMap


def stamp_position_sync(world_state, flags=None):
    """Ancla del presupuesto de desplazamiento: el momento (reloj de pared) del último sync."""
    flags = flags if flags is not None else _read_map(world_state.flags_json)
    flags["positionSyncedAt"] = timezone.now().timestamp()
    world_state.flags_json = _write_map(flags)
    return flags


def _cached_world_state(attempt):
    if "world_state" in attempt._state.fields_cache:
        return attempt._state.fields_cache["world_state"]
    return (
        AttemptWorldState.objects.filter(attempt_id=attempt.id)
        .select_related("scene_map")
        .first()
    )


def resolve_world_state(attempt, tolerate_missing_map=False):
    """El estado del mundo del intento SIN escribir nada (E1-6, D-15).

    Devuelve ``(state, dirty)``. ``dirty`` es True cuando el estado devuelto no es el
    guardado: no existe o hay que sincronizarlo con el nodo actual. Quien muta lo
    persiste con ``require_world_state``; las lecturas lo usan tal cual.

    Con ``tolerate_missing_map``, un nodo sin escena (un final sin mapa) devuelve el
    último mundo guardado en vez de fallar; sin estado guardado sigue siendo un 404.
    """
    state = _cached_world_state(attempt)
    flags = _read_map(state.flags_json) if state is not None else {}
    if (
        state is not None
        and state.scene_map_id is not None
        and flags.get("syncedNodeId") == attempt.current_node_id
    ):
        return state, False
    expected_map = SceneMap.objects.filter(node_id=attempt.current_node_id).first()
    if expected_map is None:
        if tolerate_missing_map and state is not None and state.scene_map_id is not None:
            return state, False
        raise NotFound("La escena no tiene mapa configurado")
    dirty = False
    if state is None:
        state = AttemptWorldState(
            attempt=attempt,
            scene_map=expected_map,
            player_x=expected_map.spawn_x,
            player_y=expected_map.spawn_y,
        )
        dirty = True
    # Fase 5: the displayed room is reset to the DAG node's map ONLY when the node
    # changed (e.g. a decision advanced it), tracked via flags.syncedNodeId. Between
    # node changes, a spatial door may have set a different room — respect it.
    if state.scene_map_id is None or flags.get("syncedNodeId") != attempt.current_node_id:
        state.scene_map = expected_map
        state.player_x = expected_map.spawn_x
        state.player_y = expected_map.spawn_y
        flags["syncedNodeId"] = attempt.current_node_id
        # El ancla del presupuesto de desplazamiento es el momento en que cambió el nodo
        # (la última actividad del intento), no el de la primera lectura del mundo (R6).
        anchor = attempt.last_activity_at or attempt.started_at
        if anchor is not None:
            flags["positionSyncedAt"] = anchor.timestamp()
            state.flags_json = _write_map(flags)
        else:
            stamp_position_sync(state, flags)
        dirty = True
    return state, dirty


def require_world_state(attempt):
    """El estado del mundo para una orden que lo MUTA: se sincroniza con el nodo y se guarda."""
    state, dirty = resolve_world_state(attempt)
    if dirty:
        state.save(force_insert=state._state.adding)
    return state


def ensure_world_state(attempt):
    """El estado persistido del mundo, o ``None`` si el nodo actual no tiene escena.

    Para quien necesita escribir en él sin ser una orden del mundo (los efectos del caso al
    decidir): antes de E1-6 la primera lectura del mundo lo creaba.
    """
    try:
        return require_world_state(attempt)
    except NotFound:
        return None
