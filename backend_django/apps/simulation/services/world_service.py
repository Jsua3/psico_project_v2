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
    DEFAULT_MAP_HEIGHT,
    DEFAULT_MAP_WIDTH,
    AttemptEvent,
    ClinicalTool,
    CollisionZone,
    DialogueChoice,
    DialogueLine,
    DialogueTree,
    MapObject,
    SceneMap,
)
from . import attempt_duration, attempt_lifecycle as lifecycle, door_chain, game_service
from .attempt_lock import locked_attempt
from .world_state import (
    require_world_state,
    resolve_world_state,
    stamp_position_sync as _stamp_position_sync,
)
from .world_assets import world_asset_url_problem
from shared import security_events
from shared.idempotency import normalize_request_id
from shared.jsonutils import (
    clamp as _clamp,
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
#: Holgura sobre el `interactionRadius` sembrado de un NPC ambiental: el cliente
#: sincroniza la posición por muestras y puede llegar unos píxeles fuera del
#: radio con el que ya vio el aviso de interacción. Evita rechazos legítimos sin
#: re-sembrar los mapas (el radio sembrado es 60 px).
NPC_RANGE_TOLERANCE_PX = 16
#: Claves canónicas de NPC: slug en minúsculas.
NPC_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
PLAYER_HITBOX_WIDTH = 22
PLAYER_HITBOX_HEIGHT = 16


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


def _player_hitbox(x, y):
    """Feet rectangle shared with frontend/player-motion.util.ts."""
    return (
        x - PLAYER_HITBOX_WIDTH // 2,
        y - PLAYER_HITBOX_HEIGHT,
        PLAYER_HITBOX_WIDTH,
        PLAYER_HITBOX_HEIGHT,
    )


def _rectangles_intersect(a_x, a_y, a_w, a_h, b_x, b_y, b_w, b_h):
    return (
        a_x < b_x + b_w
        and a_x + a_w > b_x
        and a_y < b_y + b_h
        and a_y + a_h > b_y
    )


def _require_nearby(world_state, map_object, what="el objeto"):
    distance = _rect_distance(
        world_state.player_x, world_state.player_y,
        map_object.position_x, map_object.position_y,
        map_object.width, map_object.height,
    )
    if distance > INTERACTION_RANGE_PX:
        raise ValidationError(f"Estás demasiado lejos de {what} para interactuar")


def _picked_up(map_object, inventory):
    """Herramienta ya recogida: sale del mundo (DTO y geometría que bloquea)."""
    return (map_object.object_type == "TOOL" and bool(map_object.tool_code)
            and map_object.tool_code in inventory)


def _position_blocked(world_state, x, y, objects=None):
    """¿El hitbox completo de pies solapa la geometría autoritativa del mapa?

    Solo cuenta lo que el mundo expone al cliente (_to_world_state): así el
    frontend puede replicar exactamente esta regla y nunca proponer una
    posición que el servidor rechace en silencio."""
    scene_map_id = world_state.scene_map_id
    inventory = set(_read_string_list(world_state.inventory_json))
    player_x, player_y, player_w, player_h = _player_hitbox(x, y)
    for zone in CollisionZone.objects.filter(scene_map_id=scene_map_id):
        if _rectangles_intersect(
            player_x, player_y, player_w, player_h,
            zone.position_x, zone.position_y, zone.width, zone.height,
        ):
            return True
    colliders = (
        [o for o in objects if o.collision and o.visible]
        if objects is not None
        else MapObject.objects.filter(scene_map_id=scene_map_id, collision=True, visible=True)
    )
    for obj in colliders:
        if _picked_up(obj, inventory):
            continue
        if _rectangles_intersect(
            player_x, player_y, player_w, player_h,
            obj.position_x, obj.position_y, obj.width or 0, obj.height or 0,
        ):
            return True
    return False


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
def get_world(attempt_id, attempt_token, actor):
    """Lectura pura (E1-6, D-15): resuelve el estado del mundo sin guardarlo.

    Si el estado no existe o no está sincronizado con el nodo actual, devuelve el que
    tendría (spawn del nodo) sin persistirlo: la sincronización la hace la primera orden
    que mute. Un nodo final sin escena sirve el último mundo guardado.
    """
    attempt = game_service._require_attempt(attempt_id, attempt_token, actor)
    world_state, _ = resolve_world_state(attempt, tolerate_missing_map=True)
    return _to_world_state(attempt, world_state)


@transaction.atomic
def update_position(attempt_id, attempt_token, player_x, player_y, actor,
                    current_map_key=None):
    """Movimiento validado en servidor (GAME-01/4A): números finitos, mapa
    actual obligatorio, límites del mapa, desplazamiento plausible en el
    tiempo transcurrido y punto fuera de la autoridad espacial de colisión."""
    attempt = game_service._require_attempt(attempt_id, attempt_token, actor, lock=True)
    _require_in_progress(attempt)
    world_state, _ = resolve_world_state(attempt)
    if not current_map_key or not str(current_map_key).strip():
        raise ValidationError("currentMapKey es obligatorio")
    if current_map_key != world_state.scene_map.map_key:
        # Carrera benigna tras un cambio de sala: eco sin mutación ni evento.
        if world_state._state.adding:
            world_state.save(force_insert=True)
        return _to_world_state(attempt, world_state)
    x = _require_finite_int(player_x, "playerX")
    y = _require_finite_int(player_y, "playerY")
    map_w = world_state.scene_map.width or DEFAULT_MAP_WIDTH
    map_h = world_state.scene_map.height or DEFAULT_MAP_HEIGHT
    hitbox_x, hitbox_y, hitbox_w, hitbox_h = _player_hitbox(x, y)
    if not (0 <= hitbox_x and hitbox_x + hitbox_w <= map_w
            and 0 <= hitbox_y and hitbox_y + hitbox_h <= map_h):
        raise ValidationError("La posición está fuera de los límites del mapa")
    _require_plausible_displacement(world_state, x, y)
    if _position_blocked(world_state, x, y):
        raise ValidationError("La posición cae dentro de un obstáculo del mapa")
    world_state.player_x = x
    world_state.player_y = y
    _stamp_position_sync(world_state)
    if world_state._state.adding:
        world_state.save(force_insert=True)
    else:
        world_state.save(update_fields=["scene_map", "player_x", "player_y", "flags_json", "updated_at"])
    # El reloj queda como dato en el intento: ya no se escribe un evento por cada movimiento (E1-5).
    attempt_duration.record_activity(attempt)
    return _to_position_ack(attempt, world_state)


@locked_attempt
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
    attempt_duration.record_activity(attempt)
    _save_event(attempt, "MAP_INTERACTION_OPENED", map_object.interaction_prompt)

    return {
        "world": _to_world_state(attempt, world_state),
        "interaction": _to_map_object(map_object),
        "dialogue": dialogue,
        "preparedDecisionOptionId": map_object.decision_option_id,
        "unlockedToolCode": unlocked_tool,
    }


#: El veredicto con que termina el detalle de un uso. Los eventos guardados antes de la Tarea 5 traen además el
#: fragmento « (estrés ±N%)», que ya no se escribe pero se sigue reconociendo al repetir una orden.
_TOOL_RESULT = re.compile(r" — (?P<verdict>no pertinente|pertinente)(?: \(estrés [+-]?\d+%\))?$")


def _replayed_tool_use(attempt, event, tool_code, target_key):
    """La respuesta de un uso de herramienta ya procesado, reconstruida desde su evento (E1-3)."""
    detail = event.detail or ""
    expected = f"Herramienta usada: {tool_code}" + (f" sobre {target_key}" if target_key else "") + " —"
    match = _TOOL_RESULT.search(detail)
    if event.event_type != "TOOL_USED" or match is None or not detail.startswith(expected):
        raise game_service.request_id_reused()
    tool = ClinicalTool.objects.filter(case_version_id=attempt.case_version_id, tool_code=tool_code).first()
    if not tool:
        raise NotFound("Herramienta no encontrada")
    pertinent = match["verdict"] == "pertinente"
    return {
        "world": _current_world(attempt),
        "toolCode": tool_code,
        "targetKey": target_key,
        "pertinent": pertinent,
        "feedbackMessage": _generate_tool_feedback(tool, target_key, pertinent),
        "alreadyUsed": False,
    }


@locked_attempt
def use_tool(attempt_id, attempt_token, tool_code, target_interaction_key, actor, request_id=None):
    """Uso de herramienta autoritativo (GAME-01/4C): exige inventario, valida
    el target (existencia + cercanía), no considera pertinente el uso sin
    target salvo herramienta declarada global, y es idempotente ante
    reintentos (un solo evento). No mueve ninguna cifra del intento: solo cuenta como actividad.
    Con ``request_id`` la repetición devuelve la misma respuesta de la primera vez (E1-3)."""
    attempt = game_service._require_attempt(attempt_id, attempt_token, actor)
    request_id = normalize_request_id(request_id)
    target_key = (target_interaction_key or "").strip() or None
    if request_id:
        previous = AttemptEvent.objects.filter(attempt_id=attempt.id, request_id=request_id).first()
        if previous is not None:
            return _replayed_tool_use(attempt, previous, tool_code, target_key)
    world_state = require_world_state(attempt)
    if not lifecycle.state_of(attempt).plays:
        raise ValidationError("El intento ya no acepta herramientas")
    tool = ClinicalTool.objects.filter(
        case_version_id=attempt.case_version_id, tool_code=tool_code
    ).first()
    if not tool:
        raise NotFound("Herramienta no encontrada")

    inventory = _read_string_list(world_state.inventory_json)
    if tool_code not in inventory:
        raise ValidationError("La herramienta no está en tu inventario; recógela primero")

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
            "feedbackMessage": feedback_message,
            "alreadyUsed": True,
        }

    world_state.used_tool_keys_json = _append_unique(world_state.used_tool_keys_json, usage_key)
    world_state.save()

    attempt_duration.record_activity(attempt)

    detail = (
        f"Herramienta usada: {tool_code}"
        + (f" sobre {target_key}" if target_key is not None else "")
        + f" — {'pertinente' if pertinent else 'no pertinente'}"
    )
    _save_event(attempt, "TOOL_USED", detail, request_id)

    return {
        "world": _to_world_state(attempt, world_state),
        "toolCode": tool_code,
        "targetKey": target_key,
        "pertinent": pertinent,
        "feedbackMessage": feedback_message,
        "alreadyUsed": False,
    }


def _require_nearby_ambient_npc(world_state, npc_key):
    """Resolve NPC geometry from the current server-owned map before crediting it."""
    ambient_npcs = _read_map(world_state.scene_map.ambient_json).get("ambientNpcs")
    if isinstance(ambient_npcs, list):
        for npc in ambient_npcs:
            if not isinstance(npc, dict) or npc.get("key") != npc_key:
                continue
            x = _require_finite_int(npc.get("x"), "posición X del NPC")
            y = _require_finite_int(npc.get("y"), "posición Y del NPC")
            radius = _require_finite_int(npc.get("interactionRadius"), "radio del NPC")
            if radius <= 0:
                raise ValidationError("El radio de interacción del NPC debe ser positivo")
            distance = math.hypot(world_state.player_x - x, world_state.player_y - y)
            if distance > radius + NPC_RANGE_TOLERANCE_PX:
                raise ValidationError("Estás demasiado lejos del NPC para interactuar")
            return

    person = MapObject.objects.filter(
        scene_map_id=world_state.scene_map_id,
        object_type="PERSON",
        object_key=npc_key,
        visible=True,
    ).first()
    if person:
        _require_nearby(world_state, person, "el NPC")
        return

    if not isinstance(ambient_npcs, list):
        raise ValidationError("La sala no autoró NPCs ambientales con posición")
    raise NotFound("El NPC no existe en la sala actual")


@locked_attempt
def record_npc_interaction(attempt_id, attempt_token, npc_key, actor):
    """Credit only a current-room NPC whose server-owned geometry is nearby."""
    attempt = game_service._require_attempt(attempt_id, attempt_token, actor)
    _require_in_progress(attempt)
    npc_key = (npc_key or "").strip()
    if not npc_key or not NPC_KEY_RE.match(npc_key):
        raise ValidationError("La clave del NPC no es válida")
    world_state = require_world_state(attempt)
    _require_nearby_ambient_npc(world_state, npc_key)
    flags = _read_map(world_state.flags_json)
    viewed = flags.get("viewedNpcKeys")
    if not isinstance(viewed, list):
        viewed = []
    if npc_key not in viewed:
        viewed.append(npc_key)
    flags["viewedNpcKeys"] = viewed
    world_state.flags_json = _write_map(flags)
    world_state.save(update_fields=["flags_json", "updated_at"])
    attempt_duration.record_activity(attempt)
    _save_event(attempt, "NPC_DIALOGUE_VIEWED", f"NPC escuchado: {npc_key}")
    return _to_world_state(attempt, world_state)


def world_for_attempt(attempt):
    """El mundo del intento para la traza docente: puro y tolerante (E1-6, D-15, D-16).

    ``None`` si el intento está en un nodo sin escena y nunca guardó un mundo.
    """
    try:
        state, _ = resolve_world_state(attempt, tolerate_missing_map=True)
    except NotFound:
        return None
    return _to_world_state(attempt, state, estudiante=False)


def _current_world(attempt):
    """El mundo actual sin escribir (respuestas repetidas de una orden ya procesada)."""
    state, _ = resolve_world_state(attempt)
    return _to_world_state(attempt, state)


@locked_attempt
def enter_room(attempt_id, attempt_token, target_node_key, actor, door_key=None, request_id=None):
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
    request_id = normalize_request_id(request_id)
    if request_id:
        previous = AttemptEvent.objects.filter(attempt_id=attempt.id, request_id=request_id).first()
        if previous is not None:
            # La misma orden otra vez: no se vuelve a reubicar al jugador en la entrada de la sala.
            if previous.event_type != "ROOM_ENTERED" or previous.detail != f"Puerta hacia sala {target_node_key}":
                raise game_service.request_id_reused()
            return _current_world(attempt)
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
    attempt_duration.record_activity(attempt)
    _save_event(attempt, "ROOM_ENTERED", f"Puerta hacia sala {target_node_key}", request_id)
    return _to_world_state(attempt, state)


def _validate_door(attempt, state, door_key, target_node_key):
    """La puerta debe existir en el mapa ACTUAL, estar al alcance del jugador,
    apuntar al destino solicitado y tener TODAS sus condiciones verificables
    cumplidas (requiresInspected, requiresTools, requiresNodes y requiresNpcs
    — los NPCs vistos sí se persisten en flags.viewedNpcKeys).

    Las reglas son una cadena de responsabilidad (ver ``door_chain``); aquí solo
    se arma el contexto y se la recorre."""
    ctx = door_chain.DoorContext(attempt, state, door_key, target_node_key)
    _DOOR_CHAIN.handle(ctx)
    return ctx.meta


# La cercanía se inyecta por función para que la cadena no importe este módulo.
_DOOR_CHAIN = door_chain.build_door_chain(lambda state, door, what: _require_nearby(state, door, what))


def _door_entry(meta, target):
    try:
        entry_x = _require_finite_int(meta["entryX"], "entryX autorado")
        entry_y = _require_finite_int(meta["entryY"], "entryY autorado")
    except KeyError:
        raise ValidationError("La puerta no tiene una entrada autorada válida")
    return (
        _clamp(entry_x, 0, target.width or DEFAULT_MAP_WIDTH),
        _clamp(entry_y, 0, target.height or DEFAULT_MAP_HEIGHT),
    )


# ─── internals ────────────────────────────────────────────────────────────────
def _require_in_progress(attempt):
    if not lifecycle.state_of(attempt).plays:
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
            + ". Esto contribuye a una intervención profesional y ética."
        )
    return (
        f"Has utilizado {tool.label}, pero este no es el contexto más apropiado "
        "para esta herramienta. Considera revisar qué herramienta se ajusta mejor "
        "a la situación actual."
    )


def _save_event(attempt, event_type, detail, request_id=None):
    AttemptEvent.objects.create(
        attempt=attempt,
        event_type=event_type,
        node=attempt.current_node,
        detail=detail,
        request_id=request_id,
    )


# ─── DTO builders ─────────────────────────────────────────────────────────────
def _to_position_ack(attempt, state):
    """Acuse mínimo al sincronizar la posición (E5-1): sin releer objetos, diálogos ni herramientas."""
    return {
        "attemptId": str(attempt.id),
        "status": attempt.status,
        "map": {"key": state.scene_map.map_key},
        "player": {"x": state.player_x, "y": state.player_y},
    }


def _dialogues_by_object_id(scene_map_id):
    """Árboles de diálogo de una sala con sus líneas y opciones en 3 consultas (E5-1)."""
    trees = list(DialogueTree.objects.filter(scene_map_id=scene_map_id).order_by("id"))
    if not trees:
        return {}
    tree_ids = [t.id for t in trees]
    lines_by_tree = {}
    for l in DialogueLine.objects.filter(dialogue_tree_id__in=tree_ids).order_by("display_order", "id"):
        lines_by_tree.setdefault(l.dialogue_tree_id, []).append({
            "order": l.display_order,
            "speakerName": l.speaker_name,
            "text": l.text,
            "emotion": l.emotion,
        })
    choices_by_tree = {}
    for c in DialogueChoice.objects.filter(dialogue_tree_id__in=tree_ids).order_by("display_order", "id"):
        choices_by_tree.setdefault(c.dialogue_tree_id, []).append({
            "key": c.choice_key,
            "text": c.text,
            "decisionOptionId": c.decision_option_id,
            "requiredToolCode": c.required_tool_code,
            "effect": _read_map(c.effect_json),
        })
    result = {}
    for tree in trees:
        if tree.map_object_id is not None and tree.map_object_id not in result:
            result[tree.map_object_id] = {
                "key": tree.tree_key,
                "speakerName": tree.speaker_name,
                "portraitKey": tree.portrait_key,
                "emotion": tree.emotion,
                "lines": lines_by_tree.get(tree.id, []),
                "choices": choices_by_tree.get(tree.id, []),
            }
    return result


def _static_world_key(scene_map_id, case_version):
    from shared import cache as shared_cache

    return shared_cache.static_world_key(scene_map_id, case_version)


def _build_static_world(scene_map, case_version_id):
    dialogues = _dialogues_by_object_id(scene_map.id)
    return {
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
        "objects": [
            _to_map_object(o, dialogue=dialogues.get(o.id))
            for o in MapObject.objects.filter(
                scene_map_id=scene_map.id, visible=True
            ).order_by("id")
        ],
        "collisions": [
            _to_collision_zone(c)
            for c in CollisionZone.objects.filter(scene_map_id=scene_map.id).order_by("id")
        ],
        "tools": [
            _to_clinical_tool(t)
            for t in ClinicalTool.objects.filter(
                case_version_id=case_version_id, active=True
            ).order_by("id")
        ],
    }


def _static_world_for(attempt, scene_map):
    from shared import cache as shared_cache

    case_version = getattr(attempt, "case_version", None)
    key = _static_world_key(scene_map.id, case_version)
    if key is None:
        return _build_static_world(scene_map, attempt.case_version_id)
    return shared_cache.get_or_set(
        key, lambda: _build_static_world(scene_map, attempt.case_version_id)
    )


def _picked_up_dto(obj_dto, inventory_set):
    return (
        obj_dto.get("type") == "TOOL"
        and bool(obj_dto.get("toolCode"))
        and obj_dto["toolCode"] in inventory_set
    )


def _mapa_para_estudiante(mapa):
    """S2-6b · Un fondo que no es ruta propia ni host permitido no llega a la persona: el mundo sale sin fondo y queda
    un ``security_event`` por servida (sin la URL). Una versión ya publicada no pasa por la validación de guardado.
    Devuelve una copia: el mapa estático vive en la caché y no se toca."""
    ambient = mapa.get("ambient") or {}
    if world_asset_url_problem(ambient.get("backgroundImage")) is None:
        return mapa
    security_events.log_security_event("world_asset_blocked", scope="background")
    return {**mapa, "ambient": {clave: valor for clave, valor in ambient.items() if clave != "backgroundImage"}}


def _to_world_state(attempt, state, *, estudiante=True):
    """El estado del mundo tal como lo ve la persona. La traza docente (``estudiante=False``) no filtra el fondo."""
    scene_map = state.scene_map
    inventory = _read_string_list(state.inventory_json)
    inventory_set = set(inventory)
    static = _static_world_for(attempt, scene_map)
    mapa = _mapa_para_estudiante(static["map"]) if estudiante else static["map"]
    return {
        "attemptId": str(attempt.id),
        "status": attempt.status,
        "map": mapa,
        "player": {"x": state.player_x, "y": state.player_y},
        "objects": [
            o for o in static["objects"]
            if not _picked_up_dto(o, inventory_set)
        ],
        "collisions": static["collisions"],
        "tools": static["tools"],
        "inventory": inventory,
        "inspectedObjectKeys": _read_string_list(state.inspected_object_keys_json),
        "viewedDialogueKeys": _read_string_list(state.viewed_dialogue_keys_json),
        "usedToolKeys": _read_string_list(state.used_tool_keys_json),
        "flags": _read_map(state.flags_json),
    }


_UNSET = object()


def _to_map_object(o, dialogue=_UNSET):
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
        "dialogue": _to_dialogue(o) if dialogue is _UNSET else dialogue,
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
