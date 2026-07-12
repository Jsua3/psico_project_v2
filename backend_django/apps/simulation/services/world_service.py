"""Mirrors Spring SimulationWorldService 1:1 (application/SimulationWorldService.java).

The explorable-world runtime: world snapshot, player movement, object interactions
(with dialogue/tool unlocks), and clinical-tool usage with pertinence feedback.
Reuses game_service's token hashing + owner/staff attempt guard.
"""
import json
import math
import re

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from ..models import (
    AttemptEvent,
    AttemptWorldState,
    ClinicalTool,
    CollisionZone,
    DialogueChoice,
    DialogueLine,
    DialogueTree,
    MapObject,
    SceneMap,
)
from . import game_service
from shared.jsonutils import (
    coerce_int as _int,
    read_map as _read_map,
    read_string_list as _read_string_list,
    write_map as _write_map,
)


# ─── json helpers ─────────────────────────────────────────────────────────────
def _append_unique(raw_json, value):
    items = _read_string_list(raw_json)
    if value not in items:
        items.append(value)
    return json.dumps(items)


def _clamp(value, low, high):
    return max(low, min(high, value))


# ─── autoridad del servidor (GAME-01) ────────────────────────────────────────
#: Velocidad máxima plausible del jugador (código actual ~150 px/s, histórico
#: ~220): margen amplio para no rechazar movimiento legítimo.
PLAYER_MAX_SPEED_PPS = 300
#: Margen base del presupuesto de desplazamiento (jitter, primer sync).
POSITION_BASE_ALLOWANCE_PX = 240
#: Tope del presupuesto: pasado este tiempo el delta ya no crece (el clamp a
#: los límites del mapa acota el resto).
POSITION_BUDGET_MAX_SECONDS = 30
#: Distancia máxima (al rectángulo del objeto) para interactuar/usar puertas.
INTERACTION_RANGE_PX = 120
#: Claves canónicas de NPC: slug en minúsculas.
NPC_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def _require_finite_int(value, name):
    if isinstance(value, bool) or value is None:
        raise ValidationError(f"{name} es obligatorio y debe ser un entero")
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"{name} debe ser un entero")


def _rect_distance(px, py, rect_x, rect_y, rect_w, rect_h):
    dx = max(rect_x - px, 0, px - (rect_x + (rect_w or 0)))
    dy = max(rect_y - py, 0, py - (rect_y + (rect_h or 0)))
    return math.hypot(dx, dy)


def _require_nearby(world_state, map_object, what="el objeto"):
    distance = _rect_distance(
        world_state.player_x, world_state.player_y,
        map_object.position_x, map_object.position_y,
        map_object.width, map_object.height,
    )
    if distance > INTERACTION_RANGE_PX:
        raise ValidationError(f"Estás demasiado lejos de {what} para interactuar")


def _position_blocked(scene_map_id, x, y):
    """¿El punto (pies del jugador) cae dentro de la autoridad espacial del
    backend? Fuente canónica: collision_zones + map_objects con collision."""
    for zone in CollisionZone.objects.filter(scene_map_id=scene_map_id):
        if zone.position_x <= x < zone.position_x + zone.width \
                and zone.position_y <= y < zone.position_y + zone.height:
            return True
    for obj in MapObject.objects.filter(scene_map_id=scene_map_id, collision=True, visible=True):
        if obj.position_x <= x < obj.position_x + (obj.width or 0) \
                and obj.position_y <= y < obj.position_y + (obj.height or 0):
            return True
    return False


def _stamp_position_sync(world_state, flags=None):
    flags = flags if flags is not None else _read_map(world_state.flags_json)
    flags["positionSyncedAt"] = timezone.now().timestamp()
    world_state.flags_json = _write_map(flags)
    return flags


def _require_plausible_displacement(world_state, x, y):
    """Presupuesto temporal: velocidad_máx × tiempo desde el último sync de
    posición + margen. Sin ancla (estados legados) se acepta y se ancla."""
    flags = _read_map(world_state.flags_json)
    synced_at = flags.get("positionSyncedAt")
    if not isinstance(synced_at, (int, float)):
        return
    elapsed = min(max(timezone.now().timestamp() - synced_at, 0.0), POSITION_BUDGET_MAX_SECONDS)
    allowed = POSITION_BASE_ALLOWANCE_PX + PLAYER_MAX_SPEED_PPS * elapsed
    delta = math.hypot(x - world_state.player_x, y - world_state.player_y)
    if delta > allowed:
        raise ValidationError("Desplazamiento no plausible para el tiempo transcurrido")


# ─── public API ───────────────────────────────────────────────────────────────
@transaction.atomic
def get_world(attempt_id, attempt_token, actor):
    attempt = game_service._require_attempt(attempt_id, attempt_token, actor)
    world_state = require_world_state(attempt)
    return _to_world_state(attempt, world_state)


@transaction.atomic
def update_position(attempt_id, attempt_token, player_x, player_y, actor,
                    current_map_key=None):
    """Movimiento validado en servidor (GAME-01/4A): números finitos, mapa
    actual obligatorio, límites del mapa, desplazamiento plausible en el
    tiempo transcurrido y punto fuera de la autoridad espacial de colisión."""
    attempt = game_service._require_attempt(attempt_id, attempt_token, actor)
    _require_in_progress(attempt)
    world_state = require_world_state(attempt)
    if not current_map_key or not str(current_map_key).strip():
        raise ValidationError("currentMapKey es obligatorio")
    if current_map_key != world_state.scene_map.map_key:
        # Carrera benigna tras un cambio de sala: eco sin mutación ni evento.
        return _to_world_state(attempt, world_state)
    x = _require_finite_int(player_x, "playerX")
    y = _require_finite_int(player_y, "playerY")
    map_w = world_state.scene_map.width or 960
    map_h = world_state.scene_map.height or 540
    if not (0 <= x <= map_w and 0 <= y <= map_h):
        raise ValidationError("La posición está fuera de los límites del mapa")
    _require_plausible_displacement(world_state, x, y)
    if _position_blocked(world_state.scene_map_id, x, y):
        raise ValidationError("La posición cae dentro de un obstáculo del mapa")
    world_state.player_x = x
    world_state.player_y = y
    _stamp_position_sync(world_state)
    world_state.save()
    _save_event(attempt, "WORLD_POSITION_UPDATED", "Posicion de jugador actualizada")
    return _to_world_state(attempt, world_state)


@transaction.atomic
def open_interaction(attempt_id, attempt_token, interaction_key, actor):
    attempt = game_service._require_attempt(attempt_id, attempt_token, actor)
    _require_in_progress(attempt)
    world_state = require_world_state(attempt)
    map_object = MapObject.objects.filter(
        scene_map_id=world_state.scene_map_id, object_key=interaction_key, visible=True
    ).first()
    if not map_object:
        raise NotFound("Interaccion no encontrada")
    _require_nearby(world_state, map_object)

    world_state.inspected_object_keys_json = _append_unique(
        world_state.inspected_object_keys_json, map_object.object_key
    )

    dialogue = _to_dialogue(map_object)
    if dialogue is not None:
        world_state.viewed_dialogue_keys_json = _append_unique(
            world_state.viewed_dialogue_keys_json, dialogue["key"]
        )
        if map_object.object_type == "PERSON":
            flags = _read_map(world_state.flags_json)
            viewed = flags.get("viewedNpcKeys")
            if not isinstance(viewed, list):
                viewed = []
            for key in (map_object.object_key, dialogue["key"]):
                if key and key not in viewed:
                    viewed.append(key)
            flags["viewedNpcKeys"] = viewed
            world_state.flags_json = _write_map(flags)

    unlocked_tool = None
    if map_object.tool_code and map_object.tool_code.strip():
        world_state.inventory_json = _append_unique(
            world_state.inventory_json, map_object.tool_code
        )
        unlocked_tool = map_object.tool_code

    world_state.save()
    _save_event(attempt, "MAP_INTERACTION_OPENED", map_object.interaction_prompt)

    return {
        "world": _to_world_state(attempt, world_state),
        "interaction": _to_map_object(map_object),
        "dialogue": dialogue,
        "preparedDecisionOptionId": map_object.decision_option_id,
        "unlockedToolCode": unlocked_tool,
    }


@transaction.atomic
def use_tool(attempt_id, attempt_token, tool_code, target_interaction_key, actor):
    """Uso de herramienta autoritativo (GAME-01/4C): exige inventario, valida
    el target (existencia + cercanía), no considera pertinente el uso sin
    target salvo herramienta declarada global, y es idempotente ante
    reintentos (un solo evento y un solo efecto de estrés)."""
    attempt = game_service._require_attempt(attempt_id, attempt_token, actor)
    world_state = require_world_state(attempt)
    if attempt.status != "IN_PROGRESS":
        raise ValidationError("El intento ya no acepta herramientas")
    tool = ClinicalTool.objects.filter(
        case_version_id=attempt.case_version_id, tool_code=tool_code
    ).first()
    if not tool:
        raise NotFound("Herramienta no encontrada")

    inventory = _read_string_list(world_state.inventory_json)
    if tool_code not in inventory:
        raise ValidationError("La herramienta no está en tu inventario; recógela primero")

    target_key = (target_interaction_key or "").strip() or None
    if target_key:
        target_obj = MapObject.objects.filter(
            scene_map_id=world_state.scene_map_id, object_key=target_key, visible=True
        ).first()
        if not target_obj:
            raise NotFound("El objetivo de la herramienta no existe en la sala actual")
        _require_nearby(world_state, target_obj, "el objetivo")

    pertinent = _evaluate_tool_pertinence(tool, target_key, world_state)
    feedback_message = _generate_tool_feedback(tool, target_key, pertinent)

    usage_key = tool_code if not target_key else f"{tool_code}@{target_key}"
    already_used = usage_key in _read_string_list(world_state.used_tool_keys_json)
    if already_used:
        # Reintento de la misma acción: sin nuevo evento ni doble efecto.
        return {
            "world": _to_world_state(attempt, world_state),
            "toolCode": tool_code,
            "targetKey": target_key,
            "pertinent": pertinent,
            "stressDelta": 0,
            "feedbackMessage": feedback_message,
            "alreadyUsed": True,
        }

    world_state.used_tool_keys_json = _append_unique(world_state.used_tool_keys_json, usage_key)
    world_state.save()

    stress_delta = -5 if pertinent else 3
    attempt.stress_index = _clamp(attempt.stress_index + stress_delta, 0, 100)
    attempt.save()

    sign = "+" if stress_delta >= 0 else ""
    detail = (
        f"Herramienta usada: {tool_code}"
        + (f" sobre {target_key}" if target_key is not None else "")
        + f" — {'pertinente' if pertinent else 'no pertinente'}"
        + f" (estres {sign}{stress_delta}%)"
    )
    _save_event(attempt, "TOOL_USED", detail)

    return {
        "world": _to_world_state(attempt, world_state),
        "toolCode": tool_code,
        "targetKey": target_key,
        "pertinent": pertinent,
        "stressDelta": stress_delta,
        "feedbackMessage": feedback_message,
        "alreadyUsed": False,
    }


@transaction.atomic
def record_npc_interaction(attempt_id, attempt_token, npc_key, actor):
    """NPC autoritativo (GAME-01/4B): clave canónica (slug) y pertenencia a la
    sala actual. La lista autorada vive en ambient_json["ambientNpcKeys"]
    (NPCs ambientales del ScenarioConfig) más los objetos PERSON del mapa.
    Si el mapa no autoró la lista (contenido legado), solo se valida el
    formato — documentado como modo observación."""
    attempt = game_service._require_attempt(attempt_id, attempt_token, actor)
    _require_in_progress(attempt)
    npc_key = (npc_key or "").strip()
    if not npc_key or not NPC_KEY_RE.match(npc_key):
        raise ValidationError("La clave del NPC no es válida")
    world_state = require_world_state(attempt)
    ambient = _read_map(world_state.scene_map.ambient_json)
    authored = ambient.get("ambientNpcKeys")
    if isinstance(authored, list):
        person_keys = set(
            MapObject.objects.filter(
                scene_map_id=world_state.scene_map_id, object_type="PERSON"
            ).values_list("object_key", flat=True)
        )
        if npc_key not in set(authored) | person_keys:
            raise NotFound("El NPC no existe en la sala actual")
    flags = _read_map(world_state.flags_json)
    viewed = flags.get("viewedNpcKeys")
    if not isinstance(viewed, list):
        viewed = []
    if npc_key not in viewed:
        viewed.append(npc_key)
    flags["viewedNpcKeys"] = viewed
    world_state.flags_json = _write_map(flags)
    world_state.save(update_fields=["flags_json", "updated_at"])
    _save_event(attempt, "NPC_DIALOGUE_VIEWED", f"NPC escuchado: {npc_key}")
    return _to_world_state(attempt, world_state)


def world_for_attempt(attempt):
    return _to_world_state(attempt, require_world_state(attempt))


@transaction.atomic
def enter_room(attempt_id, attempt_token, target_node_key, actor, door_key=None):
    """Fase 5 — spatial door: load the target room's map for the attempt at the entry
    point, WITHOUT advancing the DAG or scoring. Decoupled from the node via
    flags.syncedNodeId so the next /world load won't reset it (until a decision does).

    Caso PDF — validación de puerta: `door_key` es OPCIONAL por compatibilidad
    (clientes legacy solo envían targetNodeKey). Cuando llega, la puerta debe
    existir como objeto EXIT del mapa actual, su metadata.targetNodeKey debe
    coincidir con el destino solicitado y sus condiciones `requires*`
    verificables en backend deben cumplirse (requiresInspected contra objetos
    inspeccionados, requiresTools contra inventario, requiresNodes contra el
    nodo actual del DAG). `requiresNpcs` se valida solo en frontend: los
    diálogos de NPCs ambientales no se persisten en el world state.
    """
    attempt = game_service._require_attempt(attempt_id, attempt_token, actor)
    _require_in_progress(attempt)
    if not door_key or not str(door_key).strip():
        # GAME-01/4D: el bypass sin puerta se eliminó; todos los consumidores
        # actuales (frontend) envían doorKey.
        raise ValidationError("doorKey es obligatorio para cambiar de sala")
    target = (
        SceneMap.objects.select_related("node")
        .filter(node__case_version_id=attempt.current_node.case_version_id,
                node__node_key=target_node_key)
        .first()
    )
    if not target:
        raise NotFound(f"No hay sala para el nodo destino: {target_node_key}")
    state = require_world_state(attempt)
    door_meta = _validate_door(attempt, state, door_key, target_node_key)
    entry_x, entry_y = _door_entry(door_meta, target)
    state.scene_map = target
    state.player_x = entry_x
    state.player_y = entry_y
    flags = _read_map(state.flags_json)
    flags["syncedNodeId"] = attempt.current_node_id  # keep — door room is intentional
    _stamp_position_sync(state, flags)
    state.save()
    _save_event(attempt, "ROOM_ENTERED", f"Puerta hacia sala {target_node_key}")
    return _to_world_state(attempt, state)


def _validate_door(attempt, state, door_key, target_node_key):
    """La puerta debe existir en el mapa ACTUAL, estar al alcance del jugador,
    apuntar al destino solicitado y tener TODAS sus condiciones verificables
    cumplidas (requiresInspected, requiresTools, requiresNodes y requiresNpcs
    — los NPCs vistos sí se persisten en flags.viewedNpcKeys)."""
    door = MapObject.objects.filter(
        scene_map_id=state.scene_map_id, object_key=door_key, object_type="EXIT"
    ).first()
    if not door:
        raise NotFound(f"La puerta no existe en la sala actual: {door_key}")
    meta = _read_map(door.metadata_json)
    if meta.get("targetNodeKey") != target_node_key:
        raise ValidationError("La puerta no conduce a la sala solicitada")
    _require_nearby(state, door, "la puerta")

    locked_message = meta.get("lockedMessage") or "La puerta está bloqueada."
    inspected = set(_read_string_list(state.inspected_object_keys_json))
    for required in meta.get("requiresInspected") or []:
        if required not in inspected:
            raise ValidationError(locked_message)
    inventory = set(_read_string_list(state.inventory_json))
    for required in meta.get("requiresTools") or []:
        if required not in inventory:
            raise ValidationError(locked_message)
    required_nodes = meta.get("requiresNodes") or []
    if required_nodes and attempt.current_node.node_key not in required_nodes:
        raise ValidationError(locked_message)
    flags = _read_map(state.flags_json)
    viewed_npcs = flags.get("viewedNpcKeys")
    viewed_npcs = set(viewed_npcs) if isinstance(viewed_npcs, list) else set()
    for required in meta.get("requiresNpcs") or []:
        if required not in viewed_npcs:
            raise ValidationError(locked_message)
    return meta


def _door_entry(meta, target):
    try:
        entry_x = _require_finite_int(meta["entryX"], "entryX autorado")
        entry_y = _require_finite_int(meta["entryY"], "entryY autorado")
    except KeyError:
        raise ValidationError("La puerta no tiene una entrada autorada válida")
    return (
        _clamp(entry_x, 0, target.width or 960),
        _clamp(entry_y, 0, target.height or 540),
    )


# ─── internals ────────────────────────────────────────────────────────────────
def require_world_state(attempt):
    expected_map = SceneMap.objects.filter(node_id=attempt.current_node_id).first()
    if not expected_map:
        raise NotFound("La escena no tiene mapa configurado")
    state = (
        AttemptWorldState.objects.filter(attempt_id=attempt.id)
        .select_related("scene_map")
        .first()
    )
    if state is None:
        state = AttemptWorldState(
            attempt=attempt,
            scene_map=expected_map,
            player_x=expected_map.spawn_x,
            player_y=expected_map.spawn_y,
        )
    # Fase 5: the displayed room is reset to the DAG node's map ONLY when the node
    # changed (e.g. a decision advanced it), tracked via flags.syncedNodeId. Between
    # node changes, a spatial door may have set a different room — respect it.
    flags = _read_map(state.flags_json)
    if state.scene_map_id is None or flags.get("syncedNodeId") != attempt.current_node_id:
        state.scene_map = expected_map
        state.player_x = expected_map.spawn_x
        state.player_y = expected_map.spawn_y
        flags["syncedNodeId"] = attempt.current_node_id
        _stamp_position_sync(state, flags)
    state.save()  # updated_at is auto_now
    return state


def _require_in_progress(attempt):
    if attempt.status != "IN_PROGRESS":
        raise ValidationError("El intento ya no acepta interacciones en el mundo")


def _is_global_tool(tool):
    """Una herramienta solo es aplicable sin objetivo si su categoría la
    declara explícitamente global (GAME-01/4C)."""
    return (tool.category or "").strip().lower() == "global"


def _evaluate_tool_pertinence(tool, target_key, world_state):
    if not target_key:
        return _is_global_tool(tool)
    obj = MapObject.objects.filter(
        scene_map_id=world_state.scene_map_id, object_key=target_key
    ).first()
    if not obj:
        return False
    if tool.tool_code == obj.tool_code:
        return True
    tree = DialogueTree.objects.filter(map_object_id=obj.id).first()
    if not tree:
        return False
    return DialogueChoice.objects.filter(
        dialogue_tree_id=tree.id, required_tool_code=tool.tool_code
    ).exists()


def _generate_tool_feedback(tool, target_key, pertinent):
    if pertinent:
        return (
            f"Has aplicado {tool.label} de forma pertinente"
            + (" en el contexto adecuado" if target_key is not None else "")
            + ". Esto contribuye a una intervencion profesional y etica."
        )
    return (
        f"Has utilizado {tool.label}, pero este no es el contexto mas apropiado "
        "para esta herramienta. Considera revisar que herramienta se ajusta mejor "
        "a la situacion actual."
    )


def _save_event(attempt, event_type, detail):
    AttemptEvent.objects.create(
        attempt=attempt,
        event_type=event_type,
        node=attempt.current_node,
        detail=detail,
    )


# ─── DTO builders ─────────────────────────────────────────────────────────────
def _to_world_state(attempt, state):
    scene_map = state.scene_map
    inventory = _read_string_list(state.inventory_json)
    inventory_set = set(inventory)
    return {
        "attemptId": str(attempt.id),
        "status": attempt.status,
        "map": {
            "id": scene_map.id,
            "key": scene_map.map_key,
            "title": scene_map.title,
            "width": scene_map.width,
            "height": scene_map.height,
            "theme": scene_map.theme,
            "spawnX": scene_map.spawn_x,
            "spawnY": scene_map.spawn_y,
            "ambient": _read_map(scene_map.ambient_json),
        },
        "player": {"x": state.player_x, "y": state.player_y},
        "objects": [
            _to_map_object(o)
            for o in MapObject.objects.filter(
                scene_map_id=scene_map.id, visible=True
            ).order_by("id")
            if not (o.object_type == "TOOL" and o.tool_code and o.tool_code in inventory_set)
        ],
        "collisions": [
            _to_collision_zone(c)
            for c in CollisionZone.objects.filter(scene_map_id=scene_map.id).order_by("id")
        ],
        "tools": [
            _to_clinical_tool(t)
            for t in ClinicalTool.objects.filter(
                case_version_id=attempt.case_version_id, active=True
            ).order_by("id")
        ],
        "inventory": inventory,
        "inspectedObjectKeys": _read_string_list(state.inspected_object_keys_json),
        "viewedDialogueKeys": _read_string_list(state.viewed_dialogue_keys_json),
        "usedToolKeys": _read_string_list(state.used_tool_keys_json),
        "flags": _read_map(state.flags_json),
    }


def _to_map_object(o):
    return {
        "key": o.object_key,
        "label": o.label,
        "type": o.object_type,
        "x": o.position_x,
        "y": o.position_y,
        "width": o.width,
        "height": o.height,
        "color": o.color_hex,
        "icon": o.icon,
        "shortCode": o.short_code,
        "collision": o.collision,
        "interactionPrompt": o.interaction_prompt,
        "interactionText": o.interaction_text,
        "decisionOptionId": o.decision_option_id,
        "toolCode": o.tool_code,
        "dialogue": _to_dialogue(o),
        # ── B1: additive movement passthrough (authored motion can override the
        #     frontend default later; authoring itself is deferred to sub-project E) ──
        "movementPattern": _read_map(o.movement_pattern_json),
        "facing": o.facing,
        "metadata": _read_map(o.metadata_json),
    }


def _to_collision_zone(c):
    return {
        "key": c.zone_key,
        "label": c.label,
        "x": c.position_x,
        "y": c.position_y,
        "width": c.width,
        "height": c.height,
    }


def _to_clinical_tool(t):
    return {
        "code": t.tool_code,
        "label": t.label,
        "icon": t.icon,
        "category": t.category,
        "description": t.description,
        "active": t.active,
    }


def _to_dialogue(map_object):
    tree = DialogueTree.objects.filter(map_object_id=map_object.id).first()
    if not tree:
        return None
    return {
        "key": tree.tree_key,
        "speakerName": tree.speaker_name,
        "portraitKey": tree.portrait_key,
        "emotion": tree.emotion,
        "lines": [
            {"order": l.display_order, "speakerName": l.speaker_name, "text": l.text, "emotion": l.emotion}
            for l in DialogueLine.objects.filter(dialogue_tree_id=tree.id).order_by("display_order")
        ],
        "choices": [
            {
                "key": c.choice_key,
                "text": c.text,
                "decisionOptionId": c.decision_option_id,
                "requiredToolCode": c.required_tool_code,
                "effect": _read_map(c.effect_json),
            }
            for c in DialogueChoice.objects.filter(dialogue_tree_id=tree.id).order_by("display_order")
        ],
    }
