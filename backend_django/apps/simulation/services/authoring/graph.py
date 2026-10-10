"""El grafo del caso: nodos y decisiones."""
import time

from django.db import transaction
from rest_framework.exceptions import NotFound, ValidationError

from apps.simulation.models import DecisionOption, SimulationNode
from shared.jsonutils import coerce_int as _int

from .editor_view import editor
from .guards import ensure_draft, require_decision_in_version, require_node_in_version
from .request_utils import flag, write_string_list

VALID_CLASSIFICATIONS = {"ADEQUATE", "RISKY", "INADEQUATE"}


# ─── Node CRUD ────────────────────────────────────────────────────────────────
@transaction.atomic
def create_node(case_version_id, request):
    version = ensure_draft(case_version_id)
    node = SimulationNode(case_version=version)
    _apply_node_request(node, request)
    node.save()
    return editor(case_version_id)


@transaction.atomic
def update_node(case_version_id, node_id, request):
    ensure_draft(case_version_id)
    node = require_node_in_version(node_id, case_version_id)
    _apply_node_request(node, request)
    node.save()
    return editor(case_version_id)


@transaction.atomic
def delete_node(case_version_id, node_id):
    ensure_draft(case_version_id)
    node = require_node_in_version(node_id, case_version_id)
    node.delete()
    return editor(case_version_id)


def _apply_node_request(node, request):
    node.node_key = request.get("nodeKey")
    node.title = request.get("title")
    node.narrative = request.get("narrative")
    node.required_tools_json = write_string_list(request.get("requiredTools"))
    node.support_resources_json = write_string_list(request.get("supportResources"))
    node.sensitive_content = flag(request, "sensitiveContent")
    node.safe_exit_required = flag(request, "safeExitRequired")
    node.warning_message = request.get("warningMessage")
    node.terminal_node = flag(request, "terminal")
    node.start_node = flag(request, "startNode")
    node.position_x = request.get("positionX")
    node.position_y = request.get("positionY")


# ─── Decision CRUD ──────────────────────────────────────────────────────────
@transaction.atomic
def create_decision(case_version_id, request):
    version = ensure_draft(case_version_id)
    decision = DecisionOption(case_version=version)
    _apply_decision_request(decision, request)
    decision.save()
    return editor(case_version_id)


@transaction.atomic
def update_decision(case_version_id, decision_id, request):
    ensure_draft(case_version_id)
    decision = require_decision_in_version(decision_id, case_version_id)
    _apply_decision_request(decision, request)
    decision.save()
    return editor(case_version_id)


@transaction.atomic
def delete_decision(case_version_id, decision_id):
    ensure_draft(case_version_id)
    decision = require_decision_in_version(decision_id, case_version_id)
    decision.delete()
    return editor(case_version_id)


def _apply_decision_request(decision, request):
    src = SimulationNode.objects.filter(pk=request.get("sourceNodeId")).first()
    if not src:
        raise NotFound(f"Nodo origen: {request.get('sourceNodeId')}")
    tgt = SimulationNode.objects.filter(pk=request.get("targetNodeId")).first()
    if not tgt:
        raise NotFound(f"Nodo destino: {request.get('targetNodeId')}")
    option_key = request.get("optionKey")
    decision.option_key = option_key if option_key is not None else (
        f"{src.node_key}->{tgt.node_key}-{int(time.time() * 1000)}"
    )
    decision.source_node = src
    decision.target_node = tgt
    decision.text = request.get("text")
    classification = request.get("classification")
    if classification not in VALID_CLASSIFICATIONS:
        raise ValidationError(f"Clasificación inválida: {classification}")
    decision.classification = classification
    decision.prohibited_conduct = flag(request, "prohibitedConduct")
    decision.prohibition_reason = request.get("prohibitionReason")
    decision.score_delta = _int(request.get("scoreDelta"))
    decision.stress_delta = _int(request.get("stressDelta"))
    decision.prohibited_penalty = _int(request.get("prohibitedPenalty"))
    feedback = request.get("immediateFeedback")
    decision.immediate_feedback = feedback if feedback is not None else ""
