"""El grafo del caso: nodos y decisiones."""
import time

from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import ValidationError

from apps.simulation.models import DecisionOption, SimulationNode
from shared.exceptions import ApiError
from shared.jsonutils import coerce_int as _int

from .editor_view import editor
from .guards import bump_revision, ensure_draft, in_version
from .request_utils import flag, write_string_list

VALID_CLASSIFICATIONS = {"ADEQUATE", "RISKY", "INADEQUATE"}


# ─── Node CRUD ────────────────────────────────────────────────────────────────
@transaction.atomic
def create_node(case_version_id, request):
    version = ensure_draft(case_version_id, request.get("revision"))
    node = SimulationNode(case_version=version)
    _apply_node_request(node, request)
    node.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def update_node(case_version_id, node_id, request):
    ensure_draft(case_version_id, request.get("revision"))
    node = in_version(SimulationNode, node_id, case_version_id)
    _apply_node_request(node, request)
    node.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def delete_node(case_version_id, node_id, revision=None):
    ensure_draft(case_version_id, revision)
    node = in_version(SimulationNode, node_id, case_version_id)
    # D-9: un nodo al que otras decisiones llegan no se borra en silencio (el DDL las arrastraría).
    # Las decisiones que SALEN de él (y un lazo sobre sí mismo) se van con el nodo, como siempre.
    incoming = DecisionOption.objects.filter(target_node_id=node.id).exclude(source_node_id=node.id).count()
    if incoming:
        raise ApiError(
            "NODE_HAS_INCOMING_DECISIONS",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            f"El nodo tiene {incoming} decisión(es) que llegan a él: bórralas o redirígelas antes de eliminarlo.",
            status.HTTP_400_BAD_REQUEST,
            incoming=incoming,
        )
    node.delete()
    bump_revision(case_version_id)
    return editor(case_version_id)


def _apply_node_request(node, request):
    node.node_key = request.get("nodeKey")
    node.title = request.get("title")
    node.narrative = request.get("narrative")
    # Una lista presente (aunque vacía) reemplaza; una ausente significa «no tocar»: el
    # formulario del editor no las edita y antes las enviaba vacías, borrándolas. En un
    # nodo nuevo, ausente es lista vacía.
    if node.pk is None or "requiredTools" in request:
        node.required_tools_json = write_string_list(request.get("requiredTools"))
    if node.pk is None or "supportResources" in request:
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
    version = ensure_draft(case_version_id, request.get("revision"))
    decision = DecisionOption(case_version=version)
    _apply_decision_request(decision, request, case_version_id)
    decision.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def update_decision(case_version_id, decision_id, request):
    ensure_draft(case_version_id, request.get("revision"))
    decision = in_version(DecisionOption, decision_id, case_version_id)
    _apply_decision_request(decision, request, case_version_id)
    decision.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def delete_decision(case_version_id, decision_id, revision=None):
    ensure_draft(case_version_id, revision)
    decision = in_version(DecisionOption, decision_id, case_version_id)
    decision.delete()
    bump_revision(case_version_id)
    return editor(case_version_id)


def _apply_decision_request(decision, request, case_version_id):
    source_id, target_id = request.get("sourceNodeId"), request.get("targetNodeId")
    # RN-02: una decisión solo une nodos de su propia versión del caso.
    src = in_version(SimulationNode, source_id, case_version_id, not_found=f"Nodo origen: {source_id}")
    tgt = in_version(SimulationNode, target_id, case_version_id, not_found=f"Nodo destino: {target_id}")
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
    # Un texto presente (aunque vacío) reemplaza; uno ausente significa «no tocar»: los editores
    # anteriores no los envían y no deben borrarlos (E1-7).
    for field, key in (
        ("consequence_text", "consequenceText"),
        ("theory_basis", "theoryBasis"),
        ("feedback_text", "feedbackText"),
    ):
        if key in request:
            value = request.get(key)
            setattr(decision, field, value.strip() or None if isinstance(value, str) else None)
