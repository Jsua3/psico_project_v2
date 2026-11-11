"""El grafo del caso: nodos y decisiones."""
import json
import time

from django.db import models, transaction
from rest_framework import status
from rest_framework.exceptions import ValidationError

from apps.simulation.casedef.legacy import intensity_for
from apps.simulation.casedef.vocabulary import CLASSIFICATION_OF_CLASS, GOAL_MAX, ResponseClass, legacy_class
from apps.simulation.models import CaseCharacter, DecisionOption, SimulationNode
from apps.simulation.services import case_rules
from apps.simulation.services.text_rules import validate_plain_text
from shared.exceptions import ApiError

from .editor_view import editor
from .guards import bump_revision, ensure_draft, ensure_unique, in_version
from .request_utils import flag, write_string_list

#: Lo que un editor antiguo todavía puede mandar y ya no tiene dónde guardarse: la respuesta se valora por su clase.
RETIRED_FIELDS = ("scoreDelta", "stressDelta", "prohibitedPenalty")
VALID_CLASSIFICATIONS = frozenset(CLASSIFICATION_OF_CLASS.values())
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
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    ensure_unique(node, "nodeKey", "Ya hay un nodo con esa clave en el caso.",
                  case_version_id=node.case_version_id, node_key=node.node_key)
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
    # Un nodo nuevo sensible nace con intensidad alta (como al importar); si no, la que se pida o la de siempre.
    if "intensity" in request:
        node.intensity = request["intensity"]
    elif node.pk is None:
        node.intensity = intensity_for(node.sensitive_content).value
    node.terminal_node = flag(request, "terminal")
    node.start_node = flag(request, "startNode")
    node.position_x = request.get("positionX")
    node.position_y = request.get("positionY")
    if "aiSuggested" in request:
        node.ai_suggested = bool(request["aiSuggested"])
    # «Ausente = no tocar»; una cadena vacía borra el enunciado (es blando).
    if "decisionPrompt" in request:
        node.decision_prompt = validate_plain_text(
            request.get("decisionPrompt"), MAX_DECISION_PROMPT_LENGTH, "decisionPrompt", multiline=True
        )
    # El objetivo de la escena (DSL 2.1): igual que el enunciado, texto plano con tope; ausente = no tocar.
    if "goal" in request:
        node.goal = validate_plain_text(request.get("goal"), GOAL_MAX, "goal", multiline=False)


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


def _refuse_retired_fields(request):
    """400 con el campo si la petición manda el puntaje, el estrés o la penalización: el modelo ya no los tiene."""
    for name in RETIRED_FIELDS:
        if name in request:
            raise ApiError(
                "VALIDATION_ERROR",
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                "Este campo ya no existe: la respuesta se valora por su clase.",
                status.HTTP_400_BAD_REQUEST,
                field=name,
            )


def _apply_decision_request(decision, request, case_version_id, version):
    _refuse_retired_fields(request)
    source_id, target_id = request.get("sourceNodeId"), request.get("targetNodeId")
    # RN-02: una decisión solo une nodos de su propia versión del caso.
    src = in_version(SimulationNode, source_id, case_version_id, not_found=f"Nodo origen: {source_id}")
    tgt = in_version(SimulationNode, target_id, case_version_id, not_found=f"Nodo destino: {target_id}")
    option_key = request.get("optionKey")
    decision.option_key = option_key if option_key is not None else (
        f"{src.node_key}->{tgt.node_key}-{int(time.time() * 1000)}"
    )
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    ensure_unique(decision, "optionKey", "Ya hay una decisión con esa clave en el caso.",
                  case_version_id=decision.case_version_id, option_key=decision.option_key)
    decision.source_node = src
    decision.target_node = tgt
    decision.text = request.get("text")
    if "aiSuggested" in request:
        decision.ai_suggested = bool(request["aiSuggested"])
    decision.prohibition_reason = request.get("prohibitionReason")
    _apply_response_class(decision, request)
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
    # los limpia; una forma rota o un hito que el caso no declara es un 400 con el campo.
    if "effects" in request:
        milestones = {milestone.key for milestone in case_rules.rules_of(version).milestones}
        decision.effects = json.dumps(case_rules.validate_effects(request.get("effects"), milestones), ensure_ascii=False)
    # Requisito y reacción (DSL 2.1): «ausente = no tocar»; nulo o ``{}`` los limpia; lo roto es un 400 con el campo.
    if "requires" in request:
        decision.requires_json = json.dumps(case_rules.validate_requires(request.get("requires")), ensure_ascii=False)
    if "reaction" in request:
        characters = set(
            CaseCharacter.objects.filter(case_version_id=case_version_id).values_list("character_key", flat=True)
        )
        decision.reaction_json = json.dumps(
            case_rules.validate_reaction(request.get("reaction"), characters), ensure_ascii=False
        )


def _apply_response_class(decision, request):
    """La clase de la opción (R-5): ``responseClass`` manda; sin ella, un editor antiguo la deriva de ``classification``.

    La clasificación antigua ya no se guarda: solo sirve para derivar la clase. ``prohibitedConduct`` tampoco: marcarla
    equivale a la clase contraindicada.

    - ``responseClass`` presente: se escribe tal cual.
    - solo ``classification``: la clase sale de ``legacy_class`` (conducta prohibida = contraindicada); una opción que
      ya tenía clase y cuya clasificación derivada coincide con la enviada la conserva (Aceptable no se vuelve
      Recomendada por reenviar «ADEQUATE»).
    - ninguna de las dos: en una opción nueva es un 400 ``field: responseClass``; en una existente no se toca la clase
      (salvo que se marque la conducta como prohibida, que la vuelve contraindicada).
    """
    explicit = request.get("responseClass")
    classification = request.get("classification")
    if classification is not None and classification not in VALID_CLASSIFICATIONS:
        raise ValidationError(f"Clasificación inválida: {classification}")
    prohibited = flag(request, "prohibitedConduct")
    if explicit is not None:
        decision.response_class = explicit
    elif classification is not None:
        current = ResponseClass(decision.response_class) if decision.response_class else None
        if current is None or prohibited or CLASSIFICATION_OF_CLASS[current] != classification:
            decision.response_class = legacy_class(classification, None, prohibited).value
    elif decision.pk is None:
        raise ApiError(
            "VALIDATION_ERROR",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "La opción necesita su clase: Recomendada, Aceptable, Con riesgo o Contraindicada.",
            status.HTTP_400_BAD_REQUEST,
            field="responseClass",
        )
    elif prohibited:
        decision.response_class = ResponseClass.CONTRAINDICATED.value
