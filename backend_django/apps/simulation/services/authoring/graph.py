"""El grafo del caso: nodos y decisiones."""
import json
import time

from django.db import models, transaction
from rest_framework import status
from rest_framework.exceptions import ValidationError

from apps.simulation.models import DecisionOption, SimulationNode
from apps.simulation.services import case_rules
from apps.simulation.services.case_effects import CASE_METRIC_KEYS
from apps.simulation.services.text_rules import validate_plain_text
from shared.exceptions import ApiError
from shared.jsonutils import coerce_int as _int

from .editor_view import editor
from .guards import bump_revision, ensure_draft, in_version
from .request_utils import flag, write_string_list

VALID_CLASSIFICATIONS = {"ADEQUATE", "RISKY", "INADEQUATE"}
#: El enunciado de la decisión es un párrafo corto (E3-6); más largo es narrativa, no enunciado.
MAX_DECISION_PROMPT_LENGTH = 1200
#: La consecuencia, la retroalimentación y el fundamento teórico de una decisión (E3-7, RF-10).
MAX_DECISION_TEXT_LENGTH = 1200


# ─── Node CRUD ────────────────────────────────────────────────────────────────
@transaction.atomic
def create_node(case_version_id, request):
    version = ensure_draft(case_version_id, request.get("revision"))
    node = SimulationNode(case_version=version)
    _apply_node_request(node, request)
    # Un nodo nuevo queda al final del orden informativo (E3-6).
    last = SimulationNode.objects.filter(case_version_id=case_version_id).aggregate(
        top=models.Max("display_order")
    )["top"]
    node.display_order = 0 if last is None else last + 1
    node.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def reorder_nodes(case_version_id, request):
    """``PATCH …/nodes/reorder``: el orden informativo de **todos** los nodos, de una vez (RF-08).

    El cuerpo trae cada nodo de la versión exactamente una vez; ``display_order`` pasa a ser su
    posición (0…n-1). No toca el grafo ni el nodo de inicio: es solo cómo el editor los lista.
    """
    ensure_draft(case_version_id, request.get("revision"))
    order = request.get("order")
    node_ids = set(
        SimulationNode.objects.filter(case_version_id=case_version_id).values_list("id", flat=True)
    )
    if not isinstance(order, list) or len(order) != len(set(order)) or set(order) != node_ids:
        raise ApiError(
            "VALIDATION_ERROR",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "El orden debe incluir cada nodo del caso exactamente una vez.",
            status.HTTP_400_BAD_REQUEST,
            field="order",
        )
    positions = models.Case(
        *[models.When(pk=node_id, then=models.Value(position)) for position, node_id in enumerate(order)],
        output_field=models.IntegerField(),
    )
    SimulationNode.objects.filter(case_version_id=case_version_id).update(display_order=positions)
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
    # «Ausente = no tocar»; una cadena vacía borra el enunciado (es blando).
    if "decisionPrompt" in request:
        node.decision_prompt = validate_plain_text(
            request.get("decisionPrompt"), MAX_DECISION_PROMPT_LENGTH, "decisionPrompt", multiline=True
        )


# ─── Decision CRUD ──────────────────────────────────────────────────────────
@transaction.atomic
def create_decision(case_version_id, request):
    version = ensure_draft(case_version_id, request.get("revision"))
    decision = DecisionOption(case_version=version)
    _apply_decision_request(decision, request, case_version_id, version)
    decision.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def update_decision(case_version_id, decision_id, request):
    version = ensure_draft(case_version_id, request.get("revision"))
    decision = in_version(DecisionOption, decision_id, case_version_id)
    _apply_decision_request(decision, request, case_version_id, version)
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


def _apply_decision_request(decision, request, case_version_id, version):
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
            text = validate_plain_text(
                request.get(key), MAX_DECISION_TEXT_LENGTH, key, multiline=True
            )
            setattr(decision, field, text or None)
    # Los efectos de la opción son datos del caso (E3-8): «ausente = no tocar»; ``{}``/``null``
    # los limpia; una forma rota o una métrica que el caso no declara es un 400 con el campo.
    if "effects" in request:
        declared = {key for key, _ in case_rules.rules_of(version).metrics} or set(CASE_METRIC_KEYS)
        decision.effects = json.dumps(
            case_rules.validate_effects(request.get("effects"), declared), ensure_ascii=False
        )
