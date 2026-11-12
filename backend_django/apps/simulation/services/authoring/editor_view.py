"""La vista de lectura del editor de casos (``CaseEditorView``) y sus DTO.

Cada mutación de autoría devuelve esta vista completa, así que casi todo el
subsistema depende de este módulo.
"""
from apps.simulation.casedef.vocabulary import ResponseClass
from apps.simulation.models import (
    AttemptStatus,
    CaseCharacter,
    CaseReview,
    ClinicalTool,
    DecisionOption,
    MapObject,
    PublicationChecklist,
    Rubric,
    RubricCriterion,
    SceneHint,
    SceneMap,
    SimulationAttempt,
    SimulationNode,
)
from apps.simulation.services import case_rules
from apps.simulation.services.case_state import response_class_of
from shared.jsonutils import read_map as _read_map, read_string_list as _read_string_list

from . import checklist as checklist_rules
from . import ethics
from .guards import require_version


def rehearsed_to_end(case_version_id, actor):
    """¿``actor`` ya llevó un ensayo de esta versión hasta un final? Los de otras personas no cuentan."""
    if actor is None:
        return False
    return SimulationAttempt.all_objects.filter(
        case_version_id=case_version_id, is_rehearsal=True, student_id=actor.id, status=AttemptStatus.COMPLETED
    ).exists()


def editor(case_version_id, actor=None):
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
        "context": version.narrative_context or "",
        "learningObjectives": _read_string_list(version.learning_objectives),
        "rules": rules_state(version),
        "nodes": [node_editor_state(n) for n in nodes],
        "decisions": [decision_edge(d) for d in decisions],
        "maps": [map_editor_state(m) for m in maps],
        "objects": [map_object_editor(o) for o in objects],
        "tools": [
            clinical_tool_editor(t)
            for t in ClinicalTool.objects.filter(case_version_id=case_version_id).order_by("id")
        ],
        "hints": [
            hint_editor(h)
            for h in SceneHint.objects.filter(scene_map__case_version_id=case_version_id)
            .order_by("scene_map_id", "hint_order", "id")
        ],
        "characters": [
            character_editor(c)
            for c in CaseCharacter.objects.filter(case_version_id=case_version_id)
            .order_by("display_order", "id")
        ],
        "rubrics": [
            rubric_view(r)
            for r in Rubric.objects.filter(case_version_id=case_version_id, active=True).order_by("id")
        ],
        "checklistCompletion": checklist,
        "publishable": checklist >= 100,
        "checklist": checklist_view(case_version_id, latest),
        "rehearsedToEnd": rehearsed_to_end(case_version_id, actor),
    }


def rules_state(version):
    """Las reglas del modelo como las lee el editor: ``{milestones[], riskLevel, endings[]}``, normalizadas.

    Lo que el cliente lee aquí es lo que escribe con ``PUT …/rules/{milestones,risk,endings}``.
    """
    rules = case_rules.rules_of(version)
    return {
        "milestones": [
            {"key": m.key, "label": m.label, "description": m.description, "decisive": m.decisive}
            for m in rules.milestones
        ],
        "riskLevel": rules.risk_level.value if rules.risk_level else None,
        "endings": [dict(e) for e in rules.endings],
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


def _marked_codes(latest):
    """Las casillas marcadas de la lista.

    Una lista anterior a los ítems (sin filas) que llegó al 100 % tenía marcadas las seis de entonces: así no se
    escapa de la comprobación del respaldo; por debajo del 100 % no se sabe cuáles eran (y no puede publicar).
    """
    if latest is None:
        return set()
    if not latest.items.all():
        return set(checklist_rules.required_codes(False)) if int(latest.completion_ratio) >= 100 else set()
    return _fulfilled_codes(latest)


def latest_checklist_codes(case_version_id):
    """Los códigos de las casillas marcadas en la última lista (vacío si no hay lista): lo que la compuerta respalda."""
    return _marked_codes(_latest_checklist(case_version_id))


def _ratio_of(latest):
    """El porcentaje de la última lista, con la obligatoriedad vigente (E2-7).

    Una lista anterior a los ítems (sin filas) conserva el porcentaje que guardó.
    """
    if latest is None:
        return 0
    if not latest.items.all():
        legacy = int(latest.completion_ratio)
        if checklist_rules.strict():
            legacy = min(legacy, checklist_rules.legacy_strict_cap())
        return legacy
    return checklist_rules.ratio(_fulfilled_codes(latest), checklist_rules.strict())


def latest_checklist_ratio(case_version_id):
    return _ratio_of(_latest_checklist(case_version_id))


def checklist_view(case_version_id, latest=None):
    """La lista de publicación para el editor: ítems con su respaldo, ítem derivado de la constancia y modo.

    Cada ítem dice quién lo respalda (``backing``: ``system``, ``constancia`` o ``author``, con su ``backingLabel``) y si
    el dato que lo respalda existe ahora (``backed``: ``True``/``False``, o ``None`` si es solo una declaración).
    ``backed`` mira el dato, no la casilla: es lo mismo que la compuerta comprueba al publicar (``ethics``).
    """
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
    facts = ethics.facts_of(case_version_id, content_review=review is not None)
    items = []
    for code, label, _, is_draft, *_ in checklist_rules.CHECKLIST_ITEMS:
        backing = checklist_rules.backing_of(code, strict_mode)
        items.append({
            "code": code,
            "label": label,
            "required": code in required,
            "fulfilled": code in fulfilled,
            "draft": is_draft,
            "backing": backing,
            "backed": ethics.backed(code, facts, strict_mode),
            "backingLabel": checklist_rules.BACKING_LABELS[backing],
        })
    return {"items": items, "contentReview": content_review, "strict": strict_mode}


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
        "decisionPrompt": node.decision_prompt,
        "goal": node.goal,
        "comments": case_rules.comments_of(node),
        "displayOrder": node.display_order,
        "intensity": node.intensity,
        "aiSuggested": node.ai_suggested,
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
        "responseClass": response_class_of(d).value,
        # Derivada: la casilla «conducta contraindicada» del editor y el grafo la leen; la clase es la fuente.
        "prohibitedConduct": response_class_of(d) is ResponseClass.CONTRAINDICATED,
        "prohibitionReason": d.prohibition_reason,
        "immediateFeedback": d.immediate_feedback,
        "consequenceText": d.consequence_text,
        "theoryBasis": d.theory_basis,
        "feedbackText": d.feedback_text,
        "effects": _read_map(d.effects),
        "requires": _read_map(d.requires_json),
        "reaction": case_rules.reaction_of(d),
        "aiSuggested": d.ai_suggested,
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
        "characterId": o.character_id,
        "toolCode": o.tool_code,
        "mapId": o.scene_map_id,
        "aiSuggested": o.ai_suggested,
    }


def hint_editor(h):
    return {"id": h.id, "mapId": h.scene_map_id, "order": h.hint_order, "text": h.text}


def character_editor(c):
    return {
        "id": c.id,
        "key": c.character_key,
        "displayName": c.display_name,
        "roleLabel": c.role_label,
        "portraitKey": c.portrait_key,
        "showInBrief": c.show_in_brief,
        "displayOrder": c.display_order,
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
                "displayOrder": c.display_order,
            }
            for c in RubricCriterion.objects.filter(rubric_id=rubric.id).order_by("display_order")
        ],
        "scores": [],
        "comment": None,
    }
