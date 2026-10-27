"""El editor de mundo (WorldDefinition v2): leer, guardar, validar y previsualizar.

Un «mundo» es lo que el estudiante explora en un nodo: su mapa, los objetos, las
zonas de colisión, los diálogos y las herramientas, más la validación del conjunto.
"""
from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import NotFound

from apps.simulation.models import (
    ClinicalTool,
    CollisionZone,
    DecisionOption,
    DialogueChoice,
    DialogueLine,
    DialogueTree,
    MapObject,
    SceneMap,
    SimulationNode,
)
from apps.simulation.services import world_validation
from shared.exceptions import ApiError
from shared.jsonutils import (
    INT4_MAX,
    INT4_MIN,
    coerce_int as _int,
    read_map as _read_map,
    write_map as _write_map,
)

from .editor_view import clinical_tool_editor
from .guards import bump_revision, character_link, decision_link, ensure_draft, require_version
from .icons import validate_icon
from .limites import _texto
from .scenes import line_mark, marks_of_lines, save_dialogue_choices
from ..world_assets import world_asset_url_problem


def world_editor(case_version_id, node_id):
    version = require_version(case_version_id)
    all_maps = list(SceneMap.objects.filter(case_version_id=case_version_id).order_by("id"))

    if node_id is not None:
        scene_map = next((m for m in all_maps if m.node_id == node_id), None)
        if scene_map is None:
            raise NotFound(f"No hay mapa para el nodo {node_id} en versión {case_version_id}")
    else:
        scene_map = all_maps[0] if all_maps else None
        if scene_map is None:
            raise NotFound("Esta versión no tiene mapas aún")

    objects = list(MapObject.objects.filter(scene_map_id=scene_map.id).order_by("id"))
    collisions = list(CollisionZone.objects.filter(scene_map_id=scene_map.id).order_by("id"))
    dialogue_trees = list(DialogueTree.objects.filter(scene_map_id=scene_map.id).order_by("id"))
    tools = list(ClinicalTool.objects.filter(case_version_id=case_version_id).order_by("id"))

    exit_objects = [o for o in objects if (o.object_type or "").upper() == "EXIT"]
    has_safe_exit = bool(exit_objects)
    exit_key = exit_objects[0].object_key if exit_objects else None

    validation = run_world_validation(version)
    outgoing = list(
        DecisionOption.objects.filter(source_node_id=scene_map.node_id)
        .select_related("target_node")
        .order_by("id")
    )

    return {
        "schemaVersion": 2,
        "caseVersionId": case_version_id,
        "revision": version.version,
        "nodeId": scene_map.node_id,
        "map": _scene_map_definition(scene_map),
        "objects": [_world_object(o) for o in objects],
        "collisionZones": [_world_collision_zone(c) for c in collisions],
        "dialogues": [_world_dialogue_tree(t) for t in dialogue_trees],
        "clinicalTools": [clinical_tool_editor(t) for t in tools],
        "safeExit": {
            "configured": has_safe_exit,
            "exitObjectKey": exit_key,
            "supportResources": [],
        },
        "validation": validation,
        "availableDecisions": [
            {
                "id": d.id,
                "optionKey": d.option_key,
                "text": d.text,
                "classification": d.classification,
                "targetNodeKey": d.target_node.node_key,
                "prohibitedConduct": d.prohibited_conduct,
            }
            for d in outgoing
        ],
        "rooms": [
            {"nodeId": mm.node_id, "nodeKey": mm.node.node_key, "mapKey": mm.map_key, "title": mm.title}
            for mm in SceneMap.objects.filter(case_version_id=case_version_id)
            .select_related("node").order_by("id")
        ],
    }


def world_preview(case_version_id, node_id):
    return world_editor(case_version_id, node_id)


def validate_world(case_version_id):
    version = require_version(case_version_id)
    return run_world_validation(version)


@transaction.atomic
def save_world(case_version_id, node_id, request):
    """Guarda la sala tal como la manda el editor.

    El cuerpo es el estado completo de la sala: cada lista presente (`objects`,
    `collisionZones`, `dialogues`) reemplaza a la de la base, así que lo que no viene se
    borra, y una lista ausente no se toca. Todo se busca dentro del mapa de la sala: el
    editor numera lo nuevo con identificadores locales que pueden coincidir con los de
    otra sala (A-05).
    """
    ensure_draft(case_version_id, request.get("revision"))
    _validar_enteros_del_mundo(request)
    _validar_fondo_de_sala(request.get("map"))

    all_maps = list(SceneMap.objects.filter(case_version_id=case_version_id).order_by("id"))
    if node_id is not None:
        scene_map = next((m for m in all_maps if m.node_id == node_id), None)
        if scene_map is None:
            raise NotFound(f"No hay mapa para el nodo {node_id}")
    else:
        scene_map = all_maps[0] if all_maps else None
        if scene_map is None:
            raise NotFound("Esta versión no tiene mapas aún")

    map_def = request.get("map")
    if map_def is not None:
        _apply_map_definition(scene_map, map_def)

    saved_objects = None
    objects = request.get("objects")
    if objects is not None:
        saved_objects = _save_objects(scene_map, objects, case_version_id)

    dialogues = request.get("dialogues")
    if dialogues is not None:
        _save_dialogues(scene_map, case_version_id, dialogues, saved_objects)

    if saved_objects is not None:
        _delete_absent_objects(scene_map, saved_objects)

    zones = request.get("collisionZones")
    if zones is not None:
        _save_collision_zones(scene_map, zones)

    # E2-6: cada guardado avanza la revisión (en Spring @Version no avanzaba y el 409 era inerte).
    bump_revision(case_version_id)
    return world_editor(case_version_id, node_id)


# ─── Límites de entrada del guardado (S2-6b) ──────────────────────────────────────────────
def _fuera_de_int4(value):
    """Un número que no cabe en una columna int4, o infinito (un 1e400 del JSON). Un texto cualquiera no es un
    número: el guardado lo toma por cero como siempre."""
    try:
        numero = int(value)
    except OverflowError:
        return True
    except (TypeError, ValueError):
        return False
    return not INT4_MIN <= numero <= INT4_MAX


def _id_no_entero(value):
    try:
        int(value)
    except (TypeError, ValueError, OverflowError):
        return True
    return False


def _filas(value):
    return [fila for fila in value if isinstance(fila, dict)] if isinstance(value, list) else []


def _revisar_numeros(fila, claves, seccion):
    if not isinstance(fila, dict):
        return
    for clave in claves:
        if fila.get(clave) is not None and _fuera_de_int4(fila[clave]):
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise ApiError(
                "VALIDATION_ERROR",
                f"El valor de {seccion}.{clave} debe ser un entero entre {INT4_MIN} y {INT4_MAX}.",
                status.HTTP_400_BAD_REQUEST,
                field=f"{seccion}.{clave}",
            )


def _revisar_ids(fila, claves, seccion):
    if not isinstance(fila, dict):
        return
    for clave in claves:
        if fila.get(clave) is not None and _id_no_entero(fila[clave]):
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise ApiError(
                "VALIDATION_ERROR",
                f"El identificador {seccion}.{clave} debe ser un número entero.",
                status.HTTP_400_BAD_REQUEST,
                field=f"{seccion}.{clave}",
            )


def _validar_enteros_del_mundo(request):
    """Los números y los identificadores del cuerpo que el guardado lee sin validar (S2-6b): un valor fuera de
    int4 o un id que no es entero es un 400 con su campo, en vez de un 500 de la base de datos."""
    _revisar_numeros(request.get("map"), ("width", "height", "spawnX", "spawnY"), "map")
    for objeto in _filas(request.get("objects")):
        _revisar_numeros(objeto, ("x", "y", "width", "height", "zIndex"), "objects")
        _revisar_ids(objeto, ("id", "decisionOptionId", "characterId"), "objects")
    for zona in _filas(request.get("collisionZones")):
        _revisar_numeros(zona, ("x", "y", "width", "height"), "collisionZones")
        _revisar_ids(zona, ("id",), "collisionZones")
    for dialogo in _filas(request.get("dialogues")):
        _revisar_ids(dialogo, ("id", "mapObjectId"), "dialogues")
        for linea in _filas(dialogo.get("lines")):
            _revisar_numeros(linea, ("order",), "dialogues.lines")
        for opcion in _filas(dialogo.get("choices")):
            _revisar_numeros(opcion, ("displayOrder",), "choices")
            _revisar_ids(opcion, ("decisionOptionId",), "choices")


def _validar_fondo_de_sala(map_def):
    """El fondo de sala (``ambient.backgroundImage``) solo puede ser una ruta propia o un host permitido (S2-6b)."""
    ambient = map_def.get("ambient") if isinstance(map_def, dict) else None
    if not isinstance(ambient, dict) or "backgroundImage" not in ambient:
        return
    problema = world_asset_url_problem(ambient.get("backgroundImage"))
    if problema is not None:
        raise ApiError(
            "VALIDATION_ERROR", problema, status.HTTP_400_BAD_REQUEST, field="map.ambient.backgroundImage"
        )


def _problema_del_fondo(scene_map):
    """El problema del fondo de la sala guardada, o ``None``: lo mira la publicación (S2-6b)."""
    return world_asset_url_problem(_read_map(scene_map.ambient_json).get("backgroundImage"))


def _apply_map_definition(scene_map, map_def):
    if _int(map_def.get("width")) > 0:
        scene_map.width = _int(map_def.get("width"))
    if _int(map_def.get("height")) > 0:
        scene_map.height = _int(map_def.get("height"))
    if _int(map_def.get("spawnX"), -1) >= 0:
        scene_map.spawn_x = _int(map_def.get("spawnX"))
    if _int(map_def.get("spawnY"), -1) >= 0:
        scene_map.spawn_y = _int(map_def.get("spawnY"))
    if map_def.get("theme") is not None:
        scene_map.theme = _texto(SceneMap, "theme", map_def.get("theme"), "map.theme")
    if map_def.get("ambient") is not None:
        scene_map.ambient_json = _write_map(map_def.get("ambient"))
    scene_map.save()


def _save_objects(scene_map, objects, case_version_id):
    """Crea o actualiza los objetos recibidos; devuelve los guardados, en el orden recibido."""
    saved = []
    for wo in objects:
        obj = None
        if wo.get("id") is not None:
            obj = MapObject.objects.filter(pk=wo.get("id"), scene_map=scene_map).first()
        if obj is None:
            obj = MapObject()
        obj.scene_map = scene_map
        obj.object_key = wo.get("key")
        obj.label = wo.get("label")
        obj.object_type = wo.get("type")
        obj.position_x = _int(wo.get("x"))
        obj.position_y = _int(wo.get("y"))
        obj.width = _int(wo.get("width")) if _int(wo.get("width")) > 0 else 48
        obj.height = _int(wo.get("height")) if _int(wo.get("height")) > 0 else 48
        obj.z_index = _int(wo.get("zIndex"))
        obj.facing = (
            _texto(MapObject, "facing", wo.get("facing"), "objects.facing")
            if wo.get("facing") is not None else "down"
        )
        obj.color_hex = (
            _texto(MapObject, "color_hex", wo.get("colorHex"), "objects.colorHex")
            if wo.get("colorHex") is not None else "#4FA3A5"
        )
        validate_icon(wo.get("icon"), current=obj.icon)
        obj.icon = wo.get("icon") if wo.get("icon") is not None else "psychology"
        obj.short_code = (
            _texto(MapObject, "short_code", wo.get("shortCode"), "objects.shortCode")
            if wo.get("shortCode") is not None else "ACT"
        )
        obj.collision = bool(wo.get("collision"))
        obj.visible = bool(wo.get("visible"))
        obj.interaction_prompt = (
            _texto(MapObject, "interaction_prompt", wo.get("interactionPrompt"), "objects.interactionPrompt")
            if wo.get("interactionPrompt") is not None else ""
        )
        obj.interaction_text = wo.get("interactionText") if wo.get("interactionText") is not None else ""
        obj.tool_code = _texto(MapObject, "tool_code", wo.get("toolCode"), "objects.toolCode")
        obj.unlock_condition_json = _write_map(wo.get("unlockCondition"))
        obj.movement_pattern_json = _write_map(wo.get("movementPattern"))
        obj.metadata_json = _write_map(wo.get("metadata"))
        if "aiSuggested" in wo:
            obj.ai_suggested = bool(wo["aiSuggested"])
        if wo.get("decisionOptionId") is not None:
            # Una decisión de otra versión nunca se enlaza (400); una borrada deja el enlace como estaba.
            decision = decision_link(wo.get("decisionOptionId"), case_version_id)
            if decision:
                obj.decision_option = decision
        else:
            obj.decision_option = None
        # «Ausente = no tocar»: el autoguardado del editor actual no manda ``characterId``.
        if "characterId" in wo:
            obj.character = character_link(wo.get("characterId"), case_version_id)
        obj.save()
        saved.append(obj)
    return saved


def _save_dialogues(scene_map, case_version_id, dialogues, saved_objects):
    """Crea o actualiza los diálogos recibidos y borra los ausentes.

    Un diálogo solo puede colgar de un objeto que queda en la sala: si `saved_objects` es
    la lista recibida, los objetos que se van a borrar ya no son dueños posibles.
    """
    if saved_objects is None:
        owners = list(MapObject.objects.filter(scene_map=scene_map))
    else:
        owners = saved_objects
    owner_by_key = {o.object_key: o for o in owners}
    owner_ids = {o.id for o in owners}
    kept_tree_ids = []
    for dt in dialogues:
        tree = None
        if dt.get("id") is not None:
            tree = DialogueTree.objects.filter(pk=dt.get("id"), scene_map=scene_map).first()
        if tree is None:
            tree = DialogueTree(scene_map=scene_map)
        owner = None
        if dt.get("mapObjectKey") is not None:
            owner = owner_by_key.get(dt.get("mapObjectKey"))
        if owner is None and dt.get("mapObjectId") is not None:
            candidate = MapObject.objects.filter(pk=dt.get("mapObjectId"), scene_map=scene_map).first()
            if candidate is not None and candidate.id in owner_ids:
                owner = candidate
        tree.scene_map = scene_map
        tree.map_object = owner
        tree.tree_key = dt.get("key") or ""
        tree.speaker_name = _texto(DialogueTree, "speaker_name", dt.get("speakerName"), "dialogues.speakerName") or ""
        tree.portrait_key = _texto(DialogueTree, "portrait_key", dt.get("portraitKey"), "dialogues.portraitKey")
        tree.emotion = (
            _texto(DialogueTree, "emotion", dt.get("emotion"), "dialogues.emotion")
            if dt.get("emotion") is not None else "neutral"
        )
        tree.save()
        kept_tree_ids.append(tree.id)
        previous = marks_of_lines(tree.id)
        DialogueLine.objects.filter(dialogue_tree=tree).delete()
        for ln in (dt.get("lines") or []):
            DialogueLine.objects.create(
                dialogue_tree=tree,
                ai_suggested=line_mark(ln, _int(ln.get("order")), previous),
                display_order=_int(ln.get("order")),
                speaker_name=(
                    _texto(DialogueLine, "speaker_name", ln.get("speakerName"), "dialogues.lines.speakerName")
                    or tree.speaker_name
                ),
                text=ln.get("text") or "",
                emotion=(
                    _texto(DialogueLine, "emotion", ln.get("emotion"), "dialogues.lines.emotion")
                    if ln.get("emotion") is not None else "neutral"
                ),
            )
        DialogueChoice.objects.filter(dialogue_tree=tree).delete()
        save_dialogue_choices(tree, dt.get("choices"), case_version_id)
    DialogueTree.objects.filter(scene_map=scene_map).exclude(pk__in=kept_tree_ids).delete()


def _delete_absent_objects(scene_map, saved_objects):
    """Borra los objetos de la sala que el editor ya no manda, con los diálogos que colgaban de ellos."""
    absent = MapObject.objects.filter(scene_map=scene_map).exclude(pk__in=[o.id for o in saved_objects])
    # En producción la clave foránea borra en cascada los árboles del objeto; el esquema de
    # desarrollo no tiene cascada y borrar el objeto fallaría. Se borran explícitamente.
    DialogueTree.objects.filter(map_object__in=absent).delete()
    absent.delete()


def _save_collision_zones(scene_map, zones):
    """Crea o actualiza las zonas recibidas y borra las ausentes."""
    kept_ids = []
    for wz in zones:
        zone = None
        if wz.get("id") is not None:
            zone = CollisionZone.objects.filter(pk=wz.get("id"), scene_map=scene_map).first()
        if zone is None:
            zone = CollisionZone(scene_map=scene_map)
        width, height = _int(wz.get("width")), _int(wz.get("height"))
        zone.zone_key = wz.get("key") or ""
        zone.label = _texto(CollisionZone, "label", wz.get("label"), "collisionZones.label")
        zone.position_x = _int(wz.get("x"))
        zone.position_y = _int(wz.get("y"))
        zone.width = width if width > 0 else 1
        zone.height = height if height > 0 else 1
        zone.save()
        kept_ids.append(zone.id)
    CollisionZone.objects.filter(scene_map=scene_map).exclude(pk__in=kept_ids).delete()


# ─── world-snapshot validation ────────────────────────────────────────────────
def _ambient_npc_keys(scene_map):
    """Las claves de los NPC ambientales de la sala (``ambient.ambientNpcs[].key``)."""
    npcs = _read_map(scene_map.ambient_json).get("ambientNpcs")
    if not isinstance(npcs, list):
        return []
    return [npc["key"] for npc in npcs if isinstance(npc, dict) and isinstance(npc.get("key"), str)]


def run_world_validation(version):
    """El validador del mundo sobre las filas de la versión: ocho consultas, vengan las escenas que vengan."""
    case_version_id = version.id
    nodes = list(SimulationNode.objects.filter(case_version_id=case_version_id).order_by("id"))
    decisions = list(
        DecisionOption.objects.filter(case_version_id=case_version_id)
        .order_by("id")
    )
    maps = list(SceneMap.objects.filter(case_version_id=case_version_id).order_by("id"))
    in_version = {"scene_map__case_version_id": case_version_id}
    all_objects = list(MapObject.objects.filter(**in_version).order_by("scene_map_id", "id"))
    all_collisions = list(CollisionZone.objects.filter(**in_version).order_by("scene_map_id", "id"))
    all_dialogues = list(DialogueTree.objects.filter(**in_version).order_by("scene_map_id", "id"))
    choices = DialogueChoice.objects.filter(dialogue_tree__scene_map__case_version_id=case_version_id).values_list(
        "id", "dialogue_tree__scene_map_id", "decision_option_id", "required_tool_code"
    )
    tool_codes = ClinicalTool.objects.filter(case_version_id=case_version_id).values_list("tool_code", flat=True)

    has_safe_exit = any((o.object_type or "").upper() == "EXIT" for o in all_objects)

    snapshot = {
        "nodes": [
            {
                "id": n.id,
                "key": n.node_key,
                "startNode": n.start_node,
                "terminalNode": n.terminal_node,
                "x": n.position_x if n.position_x is not None else 0,
                "y": n.position_y if n.position_y is not None else 0,
            }
            for n in nodes
        ],
        "decisions": [
            {
                "id": d.id,
                "sourceNodeId": d.source_node_id,
                "targetNodeId": d.target_node_id,
                "prohibitedConduct": d.prohibited_conduct,
                "prohibitionReason": d.prohibition_reason,
                "feedbackText": d.feedback_text,
                "immediateFeedback": d.immediate_feedback,
            }
            for d in decisions
        ],
        "maps": [
            {
                "id": m.id,
                "nodeId": m.node_id,
                "width": m.width,
                "height": m.height,
                "spawnX": m.spawn_x,
                "spawnY": m.spawn_y,
                "ambientNpcKeys": _ambient_npc_keys(m),
                "backgroundProblem": _problema_del_fondo(m),
            }
            for m in maps
        ],
        "objects": [
            {
                "id": o.id,
                "mapId": o.scene_map_id,
                "key": o.object_key,
                "x": o.position_x,
                "y": o.position_y,
                "width": o.width,
                "height": o.height,
                "type": o.object_type,
                "optionId": o.decision_option_id,
                "toolCode": o.tool_code,
                "meta": _read_map(o.metadata_json),
            }
            for o in all_objects
        ],
        "collisions": [
            {
                "id": c.id,
                "mapId": c.scene_map_id,
                "x": c.position_x,
                "y": c.position_y,
                "width": c.width,
                "height": c.height,
            }
            for c in all_collisions
        ],
        "dialogues": [{"id": d.id, "mapId": d.scene_map_id, "key": d.tree_key} for d in all_dialogues],
        "choices": [
            {"id": pk, "mapId": map_id, "optionId": option_id, "requiredTool": tool}
            for pk, map_id, option_id, tool in choices
        ],
        "tools": [{"code": code} for code in tool_codes],
        "hasSafeExit": has_safe_exit,
    }
    return world_validation.validate(snapshot)


# ─── world-definition DTO builders ────────────────────────────────────────────
def _scene_map_definition(m):
    return {
        "id": m.id,
        "key": m.map_key,
        "title": m.title,
        "width": m.width,
        "height": m.height,
        "theme": m.theme,
        "spawnX": m.spawn_x,
        "spawnY": m.spawn_y,
        "ambient": _read_map(m.ambient_json),
    }


def _world_object(o):
    return {
        "id": o.id,
        "key": o.object_key,
        "label": o.label,
        "type": o.object_type,
        "x": o.position_x,
        "y": o.position_y,
        "width": o.width,
        "height": o.height,
        "zIndex": o.z_index,
        "facing": o.facing,
        "colorHex": o.color_hex,
        "icon": o.icon,
        "shortCode": o.short_code,
        "collision": o.collision,
        "visible": o.visible,
        "interactionPrompt": o.interaction_prompt,
        "interactionText": o.interaction_text,
        "decisionOptionId": o.decision_option_id,
        "characterId": o.character_id,
        "toolCode": o.tool_code,
        "unlockCondition": _read_map(o.unlock_condition_json),
        "movementPattern": _read_map(o.movement_pattern_json),
        "metadata": _read_map(o.metadata_json),
        "aiSuggested": o.ai_suggested,
    }


def _world_collision_zone(c):
    return {
        "id": c.id,
        "key": c.zone_key,
        "label": c.label,
        "x": c.position_x,
        "y": c.position_y,
        "width": c.width,
        "height": c.height,
    }


def _world_dialogue_tree(tree):
    lines = [
        {"order": l.display_order, "speakerName": l.speaker_name, "text": l.text, "emotion": l.emotion,
         "aiSuggested": l.ai_suggested}
        for l in DialogueLine.objects.filter(dialogue_tree_id=tree.id).order_by("display_order")
    ]
    choices = [
        {
            "key": c.choice_key,
            "text": c.text,
            "decisionOptionId": c.decision_option_id,
            "requiredToolCode": c.required_tool_code,
            "effect": _read_map(c.effect_json),
            "displayOrder": c.display_order,
        }
        for c in DialogueChoice.objects.filter(dialogue_tree_id=tree.id).order_by("display_order")
    ]
    return {
        "id": tree.id,
        "key": tree.tree_key,
        "speakerName": tree.speaker_name,
        "portraitKey": tree.portrait_key,
        "emotion": tree.emotion,
        "mapObjectId": tree.map_object_id,
        "lines": lines,
        "choices": choices,
    }
