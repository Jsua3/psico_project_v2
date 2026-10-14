"""El editor de mundo (WorldDefinition v2): leer, guardar, validar y previsualizar.

Un «mundo» es lo que el estudiante explora en un nodo: su mapa, los objetos, las
zonas de colisión, los diálogos y las herramientas, más la validación del conjunto.
"""
from django.db import transaction
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
from apps.simulation.services import validation_issues, world_validation
from shared.jsonutils import (
    coerce_int as _int,
    read_map as _read_map,
    write_map as _write_map,
)

from .editor_view import clinical_tool_editor
from .guards import bump_revision, character_link, decision_link, ensure_draft, require_version
from .icons import validate_icon
from .scenes import save_dialogue_choices


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


def validate_case(case_version_id):
    """C6: ``{issues: ValidationIssue[], canPublish}`` con mensajes llanos y sin ids."""
    version = require_version(case_version_id)
    issues, can_publish = validation_issues.issues_of(run_world_validation(version))
    return {"issues": issues, "canPublish": can_publish}


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
        scene_map.theme = map_def.get("theme")
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
        obj.facing = wo.get("facing") if wo.get("facing") is not None else "down"
        obj.color_hex = wo.get("colorHex") if wo.get("colorHex") is not None else "#4FA3A5"
        validate_icon(wo.get("icon"), current=obj.icon)
        obj.icon = wo.get("icon") if wo.get("icon") is not None else "psychology"
        obj.short_code = wo.get("shortCode") if wo.get("shortCode") is not None else "ACT"
        obj.collision = bool(wo.get("collision"))
        obj.visible = bool(wo.get("visible"))
        obj.interaction_prompt = wo.get("interactionPrompt") if wo.get("interactionPrompt") is not None else ""
        obj.interaction_text = wo.get("interactionText") if wo.get("interactionText") is not None else ""
        obj.tool_code = wo.get("toolCode")
        obj.unlock_condition_json = _write_map(wo.get("unlockCondition"))
        obj.movement_pattern_json = _write_map(wo.get("movementPattern"))
        obj.metadata_json = _write_map(wo.get("metadata"))
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
        tree.speaker_name = dt.get("speakerName") or ""
        tree.portrait_key = dt.get("portraitKey")
        tree.emotion = dt.get("emotion") if dt.get("emotion") is not None else "neutral"
        tree.save()
        kept_tree_ids.append(tree.id)
        DialogueLine.objects.filter(dialogue_tree=tree).delete()
        for ln in (dt.get("lines") or []):
            DialogueLine.objects.create(
                dialogue_tree=tree,
                display_order=_int(ln.get("order")),
                speaker_name=ln.get("speakerName") or tree.speaker_name,
                text=ln.get("text") or "",
                emotion=ln.get("emotion") if ln.get("emotion") is not None else "neutral",
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
        zone.label = wz.get("label")
        zone.position_x = _int(wz.get("x"))
        zone.position_y = _int(wz.get("y"))
        zone.width = width if width > 0 else 1
        zone.height = height if height > 0 else 1
        zone.save()
        kept_ids.append(zone.id)
    CollisionZone.objects.filter(scene_map=scene_map).exclude(pk__in=kept_ids).delete()


# ─── world-snapshot validation ────────────────────────────────────────────────
def run_world_validation(version):
    case_version_id = version.id
    nodes = list(SimulationNode.objects.filter(case_version_id=case_version_id).order_by("id"))
    decisions = list(
        DecisionOption.objects.filter(case_version_id=case_version_id)
        .order_by("id")
    )
    maps = list(SceneMap.objects.filter(case_version_id=case_version_id).order_by("id"))

    all_objects, all_collisions, all_dialogues = [], [], []
    for m in maps:
        all_objects.extend(MapObject.objects.filter(scene_map_id=m.id).order_by("id"))
        all_collisions.extend(CollisionZone.objects.filter(scene_map_id=m.id).order_by("id"))
        all_dialogues.extend(DialogueTree.objects.filter(scene_map_id=m.id).order_by("id"))

    has_safe_exit = any((o.object_type or "").upper() == "EXIT" for o in all_objects)

    snapshot = {
        "nodes": [
            {
                "id": n.id,
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
            }
            for m in maps
        ],
        "objects": [
            {
                "id": o.id,
                "mapId": o.scene_map_id,
                "x": o.position_x,
                "y": o.position_y,
                "width": o.width,
                "height": o.height,
                "type": o.object_type,
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
        "dialogues": [{"id": d.id, "mapId": d.scene_map_id} for d in all_dialogues],
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
        {"order": l.display_order, "speakerName": l.speaker_name, "text": l.text, "emotion": l.emotion}
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
