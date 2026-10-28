"""Las escenas del caso: mapas, objetos y diálogos."""
from django.db import transaction
from rest_framework.exceptions import ValidationError

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
from .guards import bump_revision, character_link, decision_link, ensure_draft, in_version
from .icons import validate_icon
from .limites import _texto
from .request_utils import flag


# ─── Map CRUD ────────────────────────────────────────────────────────────────
@transaction.atomic
def create_map(case_version_id, request):
    version = ensure_draft(case_version_id, request.get("revision"))
    node = in_version(SimulationNode, request.get("nodeId"), case_version_id)
    scene_map = SceneMap(case_version=version, node=node)
    _apply_map_request(scene_map, request)
    scene_map.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def update_map(case_version_id, map_id, request):
    ensure_draft(case_version_id, request.get("revision"))
    scene_map = in_version(SceneMap, map_id, case_version_id)
    if request.get("nodeId") is not None:
        scene_map.node = in_version(SimulationNode, request.get("nodeId"), case_version_id)
    _apply_map_request(scene_map, request)
    scene_map.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def delete_map(case_version_id, map_id, revision=None):
    ensure_draft(case_version_id, revision)
    scene_map = in_version(SceneMap, map_id, case_version_id)
    scene_map.delete()
    bump_revision(case_version_id)
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
    ensure_draft(case_version_id, request.get("revision"))
    scene_map = in_version(SceneMap, map_id, case_version_id)
    obj = MapObject(scene_map=scene_map)
    _apply_object_request(obj, request, case_version_id)
    obj.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def update_object(case_version_id, object_id, request):
    ensure_draft(case_version_id, request.get("revision"))
    obj = in_version(MapObject, object_id, case_version_id)
    _apply_object_request(obj, request, case_version_id)
    obj.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def delete_object(case_version_id, object_id, revision=None):
    ensure_draft(case_version_id, revision)
    obj = in_version(MapObject, object_id, case_version_id)
    obj.delete()
    bump_revision(case_version_id)
    return editor(case_version_id)


def _apply_object_request(obj, request, case_version_id):
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
    validate_icon(request.get("icon"), current=obj.icon)
    obj.icon = request.get("icon") if request.get("icon") is not None else "psychology"
    obj.short_code = request.get("shortCode") if request.get("shortCode") is not None else "ACT"
    obj.collision = flag(request, "collision")
    obj.visible = flag(request, "visible")
    obj.interaction_prompt = request.get("interactionPrompt")
    obj.interaction_text = request.get("interactionText")
    obj.tool_code = request.get("toolCode")
    if "aiSuggested" in request:
        obj.ai_suggested = bool(request["aiSuggested"])
    decision_option_id = request.get("decisionOptionId")
    if decision_option_id is not None:
        # Una decisión de otra versión nunca se enlaza (400); una borrada deja el enlace como estaba.
        decision = decision_link(decision_option_id, case_version_id)
        if decision:
            obj.decision_option = decision
    else:
        obj.decision_option = None
    # «Ausente = no tocar»: el editor que no conoce a los personajes no puede borrar el vínculo.
    if "characterId" in request:
        obj.character = character_link(request.get("characterId"), case_version_id)


# ─── Dialogue CRUD ────────────────────────────────────────────────────────────
@transaction.atomic
def create_dialogue(case_version_id, map_id, request):
    ensure_draft(case_version_id, request.get("revision"))
    scene_map = in_version(SceneMap, map_id, case_version_id)
    map_object = None
    if request.get("mapObjectId") is not None:
        map_object = in_version(MapObject, request.get("mapObjectId"), case_version_id)
        if map_object.scene_map_id != scene_map.id:
            raise ValidationError(f"El objeto {map_object.id} no pertenece al mapa {scene_map.id}")
    tree = DialogueTree(scene_map=scene_map, map_object=map_object)
    _apply_dialogue_request(tree, request)
    tree.save()
    _save_dialogue_lines(tree, request.get("lines"))
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def update_dialogue(case_version_id, tree_id, request):
    ensure_draft(case_version_id, request.get("revision"))
    tree = in_version(DialogueTree, tree_id, case_version_id)
    _apply_dialogue_request(tree, request)
    tree.save()
    previous = marks_of_lines(tree_id)
    DialogueLine.objects.filter(dialogue_tree_id=tree_id).delete()
    _save_dialogue_lines(tree, request.get("lines"), previous)
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def delete_dialogue(case_version_id, tree_id, revision=None):
    ensure_draft(case_version_id, revision)
    tree = in_version(DialogueTree, tree_id, case_version_id)
    tree.delete()
    bump_revision(case_version_id)
    return editor(case_version_id)


def _apply_dialogue_request(tree, request):
    tree.tree_key = request.get("treeKey")
    tree.speaker_name = request.get("speakerName")
    tree.portrait_key = request.get("portraitKey")
    tree.emotion = request.get("emotion") if request.get("emotion") is not None else "neutral"


def marks_of_lines(tree_id):
    """``{display_order: ai_suggested}`` de las líneas de un diálogo, antes de reemplazarlas."""
    return dict(DialogueLine.objects.filter(dialogue_tree_id=tree_id).values_list("display_order", "ai_suggested"))


def line_mark(line_req, display_order, previous):
    """La marca «sugerido por la IA» de una línea: la que traiga, o (ausente = no tocar) la que tenía en ese orden."""
    if "aiSuggested" in line_req:
        return bool(line_req["aiSuggested"])
    return bool(previous.get(display_order, False))


def _save_dialogue_lines(tree, lines, previous=None):
    if lines is None:
        return
    previous = previous or {}
    for line_req in lines:
        order = _int(line_req.get("displayOrder"))
        DialogueLine.objects.create(
            dialogue_tree=tree,
            ai_suggested=line_mark(line_req, order, previous),
            display_order=order,
            speaker_name=line_req.get("speakerName") or tree.speaker_name,
            text=line_req.get("text") or "",
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
            choice_key=_texto(DialogueChoice, "choice_key", ch.get("key"), "choices.key") or "",
            text=ch.get("text") or "",
            decision_option=decision,
            required_tool_code=_texto(DialogueChoice, "required_tool_code", ch.get("requiredToolCode"), "choices.requiredToolCode"),
            effect_json=_write_map(ch.get("effect")),
            display_order=_int(ch.get("displayOrder")),
        )
