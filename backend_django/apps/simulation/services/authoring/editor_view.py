"""La vista de lectura del editor de casos (``CaseEditorView``) y sus DTO.

Cada mutación de autoría devuelve esta vista completa, así que casi todo el
subsistema depende de este módulo.
"""
from apps.simulation.models import (
    CaseReview,
    ClinicalTool,
    DecisionOption,
    MapObject,
    PublicationChecklist,
    Rubric,
    RubricCriterion,
    SceneMap,
    SimulationNode,
)
from shared.jsonutils import read_string_list as _read_string_list

from . import checklist as checklist_rules
from .guards import require_version


def editor(case_version_id):
    version = require_version(case_version_id)
    nodes = list(SimulationNode.objects.filter(case_version_id=case_version_id).order_by("id"))
    decisions = list(
        DecisionOption.objects.filter(case_version_id=case_version_id)
        .select_related("source_node", "target_node")
        .order_by("id")
    )
    maps = list(
        SceneMap.objects.filter(case_version_id=case_version_id)
        .select_related("node")
        .order_by("id")
    )
    objects = []
    for scene_map in maps:
        objects.extend(
            MapObject.objects.filter(scene_map_id=scene_map.id).order_by("id")
        )
    latest = _latest_checklist(case_version_id)
    checklist = _ratio_of(latest)

    return {
        "caseVersionId": version.id,
        "revision": version.version,
        "title": version.simulation_case.title,
        "semanticVersion": version.semantic_version,
        "status": version.status,
        "nodes": [node_editor_state(n) for n in nodes],
        "decisions": [decision_edge(d) for d in decisions],
        "maps": [map_editor_state(m) for m in maps],
        "objects": [map_object_editor(o) for o in objects],
        "tools": [
            clinical_tool_editor(t)
            for t in ClinicalTool.objects.filter(case_version_id=case_version_id).order_by("id")
        ],
        "rubrics": [
            rubric_view(r)
            for r in Rubric.objects.filter(case_version_id=case_version_id, active=True).order_by("id")
        ],
        "checklistCompletion": checklist,
        "publishable": checklist >= 100,
        "checklist": checklist_view(case_version_id, latest),
    }


def _latest_checklist(case_version_id):
    return (
        PublicationChecklist.objects.filter(case_version_id=case_version_id)
        .prefetch_related("items")
        .order_by("-submitted_at", "-id")
        .first()
    )


def _fulfilled_codes(latest):
    return {item.code for item in latest.items.all() if item.fulfilled} if latest else set()


def _ratio_of(latest):
    """El porcentaje de la última lista, con la obligatoriedad vigente (E2-7).

    Una lista anterior a los ítems (sin filas) conserva el porcentaje que guardó.
    """
    if latest is None:
        return 0
    if not latest.items.all():
        return int(latest.completion_ratio)
    return checklist_rules.ratio(_fulfilled_codes(latest), checklist_rules.strict())


def latest_checklist_ratio(case_version_id):
    return _ratio_of(_latest_checklist(case_version_id))


def checklist_view(case_version_id, latest=None):
    """La lista de publicación para el editor: ítems, ítem derivado de la constancia y modo."""
    if latest is None:
        latest = _latest_checklist(case_version_id)
    strict_mode = checklist_rules.strict()
    required = set(checklist_rules.required_codes(strict_mode))
    fulfilled = _fulfilled_codes(latest)
    review = (
        CaseReview.objects.filter(case_version_id=case_version_id, content_reference__isnull=False)
        .order_by("-id")
        .first()
    )
    content_review = {"fulfilled": False}
    if review is not None:
        content_review = {
            "fulfilled": True,
            "reviewer": review.content_reviewer,
            "reviewedOn": review.content_reviewed_on.isoformat() if review.content_reviewed_on else None,
            "reference": review.content_reference,
        }
    return {
        "items": [
            {
                "code": code,
                "label": label,
                "required": code in required,
                "fulfilled": code in fulfilled,
                "draft": is_draft,
            }
            for code, label, _, is_draft in checklist_rules.CHECKLIST_ITEMS
        ],
        "contentReview": content_review,
        "strict": strict_mode,
    }


# ─── editor-state DTO builders ────────────────────────────────────────────────
def node_editor_state(node):
    return {
        "id": node.id,
        "key": node.node_key,
        "title": node.title,
        "narrative": node.narrative,
        "supportResources": _read_string_list(node.support_resources_json),
        "requiredTools": _read_string_list(node.required_tools_json),
        "sensitiveContent": node.sensitive_content,
        "safeExitRequired": node.safe_exit_required,
        "warningMessage": node.warning_message,
        "terminal": node.terminal_node,
        "startNode": node.start_node,
        "positionX": node.position_x,
        "positionY": node.position_y,
    }


def decision_edge(d):
    return {
        "id": d.id,
        "optionKey": d.option_key,
        "sourceNodeId": d.source_node_id,
        "sourceKey": d.source_node.node_key,
        "targetNodeId": d.target_node_id,
        "targetKey": d.target_node.node_key,
        "text": d.text,
        "classification": d.classification,
        "prohibitedConduct": d.prohibited_conduct,
        "prohibitionReason": d.prohibition_reason,
        "scoreDelta": d.score_delta,
        "stressDelta": d.stress_delta,
        "prohibitedPenalty": d.prohibited_penalty,
        "immediateFeedback": d.immediate_feedback,
        "consequenceText": d.consequence_text,
        "theoryBasis": d.theory_basis,
        "feedbackText": d.feedback_text,
    }


def map_editor_state(m):
    return {
        "id": m.id,
        "key": m.map_key,
        "title": m.title,
        "width": m.width,
        "height": m.height,
        "theme": m.theme,
        "spawnX": m.spawn_x,
        "spawnY": m.spawn_y,
        "nodeId": m.node_id,
        "nodeKey": m.node.node_key,
    }


def map_object_editor(o):
    return {
        "id": o.id,
        "key": o.object_key,
        "label": o.label,
        "type": o.object_type,
        "x": o.position_x,
        "y": o.position_y,
        "width": o.width,
        "height": o.height,
        "colorHex": o.color_hex,
        "icon": o.icon,
        "shortCode": o.short_code,
        "collision": o.collision,
        "visible": o.visible,
        "interactionPrompt": o.interaction_prompt,
        "interactionText": o.interaction_text,
        "decisionOptionId": o.decision_option_id,
        "toolCode": o.tool_code,
        "mapId": o.scene_map_id,
    }


def clinical_tool_editor(t):
    return {
        "id": t.id,
        "code": t.tool_code,
        "label": t.label,
        "icon": t.icon,
        "category": t.category,
        "description": t.description,
        "active": t.active,
    }


def rubric_view(rubric):
    return {
        "rubricId": rubric.id,
        "rubricName": rubric.name,
        "description": rubric.description,
        "criteria": [
            {
                "id": c.id,
                "competency": c.competency,
                "title": c.title,
                "description": c.description,
                "maxScore": c.max_score,
                "displayOrder": c.display_order,
            }
            for c in RubricCriterion.objects.filter(rubric_id=rubric.id).order_by("display_order")
        ],
        "scores": [],
        "totalScore": None,
        "comment": None,
    }
