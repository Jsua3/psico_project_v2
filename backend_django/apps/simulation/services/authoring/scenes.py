"""Las escenas del caso: mapas, objetos y diálogos."""
from django.db import transaction
from rest_framework.exceptions import NotFound

from apps.simulation.models import (
    DEFAULT_MAP_HEIGHT,
    DEFAULT_MAP_WIDTH,
    DecisionOption,
    DialogueChoice,
    DialogueLine,
    DialogueTree,
    MapObject,
    SceneMap,
    SimulationNode,
)
from shared.jsonutils import coerce_int as _int, write_map as _write_map

from .editor_view import editor
from .guards import (
    ensure_draft,
    require_dialogue_in_version,
    require_map_in_version,
    require_object_in_version,
)
from .request_utils import flag


# ─── Map CRUD ────────────────────────────────────────────────────────────────
@transaction.atomic
def create_map(case_version_id, request):
    version = ensure_draft(case_version_id)
    node = SimulationNode.objects.filter(pk=request.get("nodeId")).first()
    if not node:
        raise NotFound(f"Nodo no encontrado: {request.get('nodeId')}")
    scene_map = SceneMap(case_version=version, node=node)
    _apply_map_request(scene_map, request)
    scene_map.save()
    return editor(case_version_id)


@transaction.atomic
def update_map(case_version_id, map_id, request):
    ensure_draft(case_version_id)
    scene_map = require_map_in_version(map_id, case_version_id)
    if request.get("nodeId") is not None:
        node = SimulationNode.objects.filter(pk=request.get("nodeId")).first()
        if not node:
            raise NotFound(f"Nodo no encontrado: {request.get('nodeId')}")
        scene_map.node = node
    _apply_map_request(scene_map, request)
    scene_map.save()
    return editor(case_version_id)


@transaction.atomic
def delete_map(case_version_id, map_id):
    ensure_draft(case_version_id)
    scene_map = require_map_in_version(map_id, case_version_id)
    scene_map.delete()
    return editor(case_version_id)


def _apply_map_request(scene_map, request):
    scene_map.map_key = request.get("mapKey")
    scene_map.title = request.get("title")
    width = _int(request.get("width"))
    height = _int(request.get("height"))
    scene_map.width = width if width > 0 else DEFAULT_MAP_WIDTH
    scene_map.height = height if height > 0 else DEFAULT_MAP_HEIGHT
    scene_map.theme = request.get("theme") if request.get("theme") is not None else "clinical-soft"
    scene_map.spawn_x = _int(request.get("spawnX"))
    scene_map.spawn_y = _int(request.get("spawnY"))


# ─── Map Object CRUD ─────────────────────────────────────────────────────────
@transaction.atomic
def create_object(case_version_id, map_id, request):
    ensure_draft(case_version_id)
    scene_map = require_map_in_version(map_id, case_version_id)
    obj = MapObject(scene_map=scene_map)
    _apply_object_request(obj, request)
    obj.save()
    return editor(case_version_id)


@transaction.atomic
def update_object(case_version_id, object_id, request):
    ensure_draft(case_version_id)
    obj = require_object_in_version(object_id, case_version_id)
    _apply_object_request(obj, request)
    obj.save()
    return editor(case_version_id)


@transaction.atomic
def delete_object(case_version_id, object_id):
    ensure_draft(case_version_id)
    obj = require_object_in_version(object_id, case_version_id)
    obj.delete()
    return editor(case_version_id)


def _apply_object_request(obj, request):
    obj.object_key = request.get("objectKey")
    obj.label = request.get("label")
    obj.object_type = request.get("objectType")
    obj.position_x = _int(request.get("x"))
    obj.position_y = _int(request.get("y"))
    width = _int(request.get("width"))
    height = _int(request.get("height"))
    obj.width = width if width > 0 else 48
    obj.height = height if height > 0 else 48
    obj.color_hex = request.get("colorHex") if request.get("colorHex") is not None else "#4FA3A5"
    obj.icon = request.get("icon") if request.get("icon") is not None else "psychology"
    obj.short_code = request.get("shortCode") if request.get("shortCode") is not None else "ACT"
    obj.collision = flag(request, "collision")
    obj.visible = flag(request, "visible")
    obj.interaction_prompt = request.get("interactionPrompt")
    obj.interaction_text = request.get("interactionText")
    obj.tool_code = request.get("toolCode")
    decision_option_id = request.get("decisionOptionId")
    if decision_option_id is not None:
        decision = DecisionOption.objects.filter(pk=decision_option_id).first()
        if decision:
            obj.decision_option = decision
    else:
        obj.decision_option = None


# ─── Dialogue CRUD ────────────────────────────────────────────────────────────
@transaction.atomic
def create_dialogue(case_version_id, map_id, request):
    ensure_draft(case_version_id)
    scene_map = require_map_in_version(map_id, case_version_id)
    map_object = None
    if request.get("mapObjectId") is not None:
        map_object = MapObject.objects.filter(pk=request.get("mapObjectId")).first()
    tree = DialogueTree(scene_map=scene_map, map_object=map_object)
    _apply_dialogue_request(tree, request)
    tree.save()
    _save_dialogue_lines(tree, request.get("lines"))
    return editor(case_version_id)


@transaction.atomic
def update_dialogue(case_version_id, tree_id, request):
    ensure_draft(case_version_id)
    tree = require_dialogue_in_version(tree_id, case_version_id)
    _apply_dialogue_request(tree, request)
    tree.save()
    DialogueLine.objects.filter(dialogue_tree_id=tree_id).delete()
    _save_dialogue_lines(tree, request.get("lines"))
    return editor(case_version_id)


@transaction.atomic
def delete_dialogue(case_version_id, tree_id):
    ensure_draft(case_version_id)
    tree = require_dialogue_in_version(tree_id, case_version_id)
    tree.delete()
    return editor(case_version_id)


def _apply_dialogue_request(tree, request):
    tree.tree_key = request.get("treeKey")
    tree.speaker_name = request.get("speakerName")
    tree.portrait_key = request.get("portraitKey")
    tree.emotion = request.get("emotion") if request.get("emotion") is not None else "neutral"


def _save_dialogue_lines(tree, lines):
    if lines is None:
        return
    for line_req in lines:
        DialogueLine.objects.create(
            dialogue_tree=tree,
            display_order=_int(line_req.get("displayOrder")),
            speaker_name=line_req.get("speakerName"),
            text=line_req.get("text"),
            emotion=line_req.get("emotion") if line_req.get("emotion") is not None else "neutral",
        )


def save_dialogue_choices(tree, choices, case_version_id):
    """Las opciones de un diálogo. También las guarda el editor de mundo (``save_world``)."""
    if not choices:
        return
    for ch in choices:
        decision = None
        if ch.get("decisionOptionId") is not None:
            decision = DecisionOption.objects.filter(
                pk=ch.get("decisionOptionId"), case_version_id=case_version_id
            ).first()
        DialogueChoice.objects.create(
            dialogue_tree=tree,
            choice_key=ch.get("key") or "",
            text=ch.get("text") or "",
            decision_option=decision,
            required_tool_code=ch.get("requiredToolCode"),
            effect_json=_write_map(ch.get("effect")),
            display_order=_int(ch.get("displayOrder")),
        )
