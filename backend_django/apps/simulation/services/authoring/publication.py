"""Lo que lleva un caso de borrador a publicado: checklist, publicar y clonar una versión.

La versión publicada no se modifica nunca (REGLA-005): para cambiarla se clona a un
borrador nuevo. La copia de las entidades está declarada en ``case_cloning``.
"""
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status as http
from rest_framework.exceptions import ValidationError

from apps.simulation.models import (
    CaseCharacter,
    CaseVersion,
    ClinicalTool,
    CollisionZone,
    DecisionOption,
    DialogueChoice,
    DialogueLine,
    DialogueTree,
    MapObject,
    PublicationChecklist,
    PublicationChecklistItem,
    Rubric,
    RubricCriterion,
    SceneHint,
    SceneMap,
    SimulationNode,
)
from apps.simulation.services import case_cloning as cloning
from shared.exceptions import ApiError

from . import checklist as checklist_rules
from . import lifecycle
from .editor_view import editor, latest_checklist_ratio
from .guards import bump_revision, ensure_draft, require_version
from .request_utils import flag
from .world_definition import run_world_validation


# ─── Checklist ────────────────────────────────────────────────────────────────
@transaction.atomic
def update_checklist(case_version_id, request, actor):
    version = ensure_draft(case_version_id, request.get("revision"))
    strict_mode = checklist_rules.strict()
    marked = {code for code in checklist_rules.CODES if flag(request, code)}
    ratio = checklist_rules.ratio(marked, strict_mode)
    checklist = PublicationChecklist(
        case_version=version,
        submitted_by=actor,
        completion_ratio=ratio,
        status="COMPLETE" if ratio >= 100 else "PENDING",
    )
    if ratio >= 100:
        checklist.completed_at = timezone.now()
    checklist.save()
    # E2-7: se guarda **qué** casillas se marcaron, no solo el porcentaje.
    required = set(checklist_rules.required_codes(strict_mode))
    PublicationChecklistItem.objects.bulk_create(
        PublicationChecklistItem(
            checklist=checklist, code=code, label=label,
            required=code in required, fulfilled=code in marked,
        )
        for code, label, _, _ in checklist_rules.CHECKLIST_ITEMS
    )
    bump_revision(case_version_id)
    return editor(case_version_id)


# ─── Publish ──────────────────────────────────────────────────────────────────
@transaction.atomic
def publish(case_version_id, actor, payload=None):
    """``POST …/publish`` heredado: alias de ``approve`` del ciclo de vida (R9).

    Conserva los mensajes y códigos de siempre (400 con la lista incompleta o con errores de
    validación) y delega el cambio de estado en ``lifecycle.approve``, que deja la fila de
    revisión. Con ``REVIEW_WORKFLOW_STRICT`` encendida, solo publica desde ``IN_REVIEW``.
    """
    payload = payload or {}
    version = require_version(case_version_id)

    if version.status == "PUBLISHED":
        raise ValidationError(
            "El caso ya está publicado. Use 'Clonar versión' para crear una nueva."
        )
    if version.status == "ARCHIVED":
        raise ValidationError("No se puede publicar una versión archivada.")
    if settings.REVIEW_WORKFLOW_STRICT and version.status != "IN_REVIEW":
        raise ApiError(
            "REVIEW_REQUIRED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "El caso debe enviarse a revisión antes de publicarse.",
            http.HTTP_409_CONFLICT,
        )

    if latest_checklist_ratio(case_version_id) < 100:
        raise ValidationError(
            "El checklist ético y académico debe estar al 100% antes de publicar."
        )

    validation = run_world_validation(version)
    if validation["errors"]:
        summary = " | ".join(
            f"[{i['code']}] {i['message']}" for i in validation["errors"]
        ) or "Errores de validación detectados"
        raise ValidationError(
            f"El caso no puede publicarse con errores de validación: {summary}"
        )

    lifecycle.approve(
        case_version_id, actor, payload.get("note"), payload.get("contentReview"), payload.get("revision")
    )
    return editor(case_version_id)


# ─── Clone version ──────────────────────────────────────────────────────────
@transaction.atomic
def clone_version(case_version_id, actor):
    source = require_version(case_version_id)
    clone = cloning.CASE_VERSION.copy(
        source,
        simulation_case=source.simulation_case,
        semantic_version=_next_minor(source),
        status="DRAFT",
        cloned_from=source,
        created_by=actor,
    )

    node_copies = _clone_nodes(source, clone)
    decision_copies = _clone_decisions(source, clone, node_copies)
    map_copies = _clone_maps(source, clone, node_copies)
    _clone_collision_zones(map_copies)
    _clone_hints(map_copies)
    character_copies = _clone_characters(source, clone)
    object_copies = _clone_map_objects(map_copies, decision_copies, character_copies)
    _clone_dialogues(map_copies, object_copies, decision_copies)
    _clone_clinical_tools(source, clone)
    _clone_rubrics(source, clone)
    create_draft_checklist(clone, actor)

    return editor(clone.id)


def _clone_nodes(source, clone):
    return {
        node.id: cloning.NODE.copy(node, case_version=clone)
        for node in SimulationNode.objects.filter(case_version_id=source.id).order_by("id")
    }


def _clone_decisions(source, clone, node_copies):
    return {
        d.id: cloning.DECISION.copy(
            d,
            case_version=clone,
            source_node=node_copies.get(d.source_node_id),
            target_node=node_copies.get(d.target_node_id),
        )
        for d in DecisionOption.objects.filter(case_version_id=source.id).order_by("id")
    }


def _clone_maps(source, clone, node_copies):
    return {
        m.id: cloning.MAP.copy(m, case_version=clone, node=node_copies.get(m.node_id))
        for m in SceneMap.objects.filter(case_version_id=source.id).order_by("id")
    }


def _clone_collision_zones(map_copies):
    for source_map_id, cloned_map in map_copies.items():
        for zone in CollisionZone.objects.filter(scene_map_id=source_map_id).order_by("id"):
            cloning.COLLISION_ZONE.copy(zone, scene_map=cloned_map)


def _clone_hints(map_copies):
    for source_map_id, cloned_map in map_copies.items():
        for hint in SceneHint.objects.filter(scene_map_id=source_map_id).order_by("hint_order", "id"):
            cloning.HINT.copy(hint, scene_map=cloned_map)


def _clone_characters(source, clone):
    return {
        c.id: cloning.CHARACTER.copy(c, case_version=clone)
        for c in CaseCharacter.objects.filter(case_version_id=source.id).order_by("id")
    }


def _clone_map_objects(map_copies, decision_copies, character_copies):
    copies = {}
    for source_map_id, cloned_map in map_copies.items():
        for obj in MapObject.objects.filter(scene_map_id=source_map_id).order_by("id"):
            copies[obj.id] = cloning.MAP_OBJECT.copy(
                obj,
                scene_map=cloned_map,
                decision_option=decision_copies.get(obj.decision_option_id) if obj.decision_option_id else None,
                character=character_copies.get(obj.character_id) if obj.character_id else None,
            )
    return copies


def _clone_dialogues(map_copies, object_copies, decision_copies):
    for source_map_id, cloned_map in map_copies.items():
        for tree in DialogueTree.objects.filter(scene_map_id=source_map_id).order_by("id"):
            tree_copy = cloning.DIALOGUE_TREE.copy(
                tree,
                scene_map=cloned_map,
                map_object=object_copies.get(tree.map_object_id) if tree.map_object_id else None,
            )
            for line in DialogueLine.objects.filter(dialogue_tree_id=tree.id).order_by("display_order"):
                cloning.DIALOGUE_LINE.copy(line, dialogue_tree=tree_copy)
            for choice in DialogueChoice.objects.filter(dialogue_tree_id=tree.id).order_by("display_order"):
                cloning.DIALOGUE_CHOICE.copy(
                    choice,
                    dialogue_tree=tree_copy,
                    decision_option=decision_copies.get(choice.decision_option_id) if choice.decision_option_id else None,
                )


def _clone_clinical_tools(source, clone):
    for tool in ClinicalTool.objects.filter(case_version_id=source.id).order_by("id"):
        cloning.CLINICAL_TOOL.copy(tool, case_version=clone)


def _clone_rubrics(source, clone):
    # La copia conserva a quién pertenece la rúbrica: quien clona no se vuelve su dueño (un ADMIN que
    # clona la rúbrica privada de una autora la haría visible para todos los docentes).
    for rubric in Rubric.objects.filter(case_version_id=source.id).order_by("id"):
        rubric_copy = cloning.RUBRIC.copy(rubric, case_version=clone, created_by=rubric.created_by)
        for criterion in RubricCriterion.objects.filter(rubric_id=rubric.id).order_by("display_order"):
            cloning.RUBRIC_CRITERION.copy(
                criterion, rubric=rubric_copy, competency_ref=criterion.competency_ref
            )


def create_draft_checklist(clone, actor):
    PublicationChecklist.objects.create(
        case_version=clone,
        submitted_by=actor,
        completion_ratio=0,
        status="PENDING",
    )


def _next_minor(source):
    version = source.semantic_version
    parts = version.split(".")
    if len(parts) != 3:
        return version + ".1"
    major = _parse_part(parts[0], -1)
    max_minor = _parse_part(parts[1], 0)
    for other in CaseVersion.objects.filter(
        simulation_case_id=source.simulation_case_id
    ).order_by("-created_at"):
        other_parts = other.semantic_version.split(".")
        if len(other_parts) != 3:
            continue
        if _parse_part(other_parts[0], -1) != major:
            continue
        minor = _parse_part(other_parts[1], 0)
        if minor > max_minor:
            max_minor = minor
    return f"{major}.{max_minor + 1}.0"


def _parse_part(value, fallback):
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback
