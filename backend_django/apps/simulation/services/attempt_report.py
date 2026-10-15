"""Reporte congelado del intento (E1-8, RF-22, RF-23, CU-12, TD-08, N2).

Al completarse un intento se persiste, dentro de la misma transacción, **un** reporte
inmutable (``AttemptReport``). Es un superconjunto del reporte de cierre de siempre
(``game_dtos.build_completion_report``: el frontend actual no cambia) con lo que añade
E1-8: ``schemaVersion``, ``ordinal``, ``definitionHash``, ``decisionReview[]``,
``reflections[]`` (sin el texto de la bitácora) y ``timeByScene``. Lo leen el reporte del
intento, el del estudiante y el historial; leer no escribe. Un intento completado antes
de E1-8 no tiene fila: se sirve en vivo (sin persistirlo) y ``backfill_attempt_reports``
lo congela.
"""
import hashlib
import json

from django.db.models import Q

from shared.jsonutils import read_map

from apps.simulation.serializers import game_dtos as dto

from ..models import (
    AttemptEvent,
    AttemptReport,
    AttemptStatus,
    CaseVersion,
    DecisionOption,
    ReflectionJournal,
    SimulationAttempt,
    SimulationNode,
)
from . import attempt_duration, case_effects

REPORT_SCHEMA_VERSION = 1


def load_events(attempt_id):
    """Los eventos del intento en orden, con lo que el reporte lee de cada uno."""
    return list(
        AttemptEvent.objects.filter(attempt_id=attempt_id)
        .select_related("node", "decision_option__target_node")
        .order_by("occurred_at", "id")
    )


def case_definition_hash(case_version_id):
    """Huella (sha256) de la definición del caso tal como está ahora: grafo, textos y reglas.

    Es la «versión» con la que se cerró el intento: si después cambia cualquier texto o efecto,
    el reporte guarda la huella de lo que la persona vio.
    """
    rules = CaseVersion.objects.filter(pk=case_version_id).values_list("rules", flat=True).first()
    nodes = list(
        SimulationNode.objects.filter(case_version_id=case_version_id)
        .order_by("node_key")
        .values_list("node_key", "title", "narrative", "start_node", "terminal_node", "sensitive_content")
    )
    options = list(
        DecisionOption.objects.filter(case_version_id=case_version_id)
        .order_by("option_key")
        .values_list(
            "option_key", "source_node__node_key", "target_node__node_key", "text", "classification",
            "score_delta", "stress_delta", "prohibited_penalty", "prohibited_conduct",
            "immediate_feedback", "consequence_text", "theory_basis", "feedback_text", "effects",
        )
    )
    canonical = json.dumps(
        {"nodes": nodes, "options": options, "rules": read_map(rules)},
        sort_keys=True, ensure_ascii=False, separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def attempt_ordinal(attempt):
    """N.º de intento del estudiante en el **caso** (todas sus versiones), contando este (R10)."""
    return SimulationAttempt.objects.filter(
        student_id=attempt.student_id,
        case_version__simulation_case_id=attempt.case_version.simulation_case_id,
    ).filter(
        Q(started_at__lt=attempt.started_at) | Q(started_at=attempt.started_at, id__lte=attempt.id)
    ).count()


def build_decision_review(events):
    """``decisionReview[]``: una entrada por decisión registrada, en el orden en que ocurrieron."""
    review = []
    first_answers = {}  # nodo → primera respuesta que el juego no aplicó (reintento)
    for ev in events:
        if not ev.decision_option_id:
            continue
        if ev.event_type in case_effects.RETRY_EVENT_TYPES:
            first_answers.setdefault(ev.node_id, ev.decision_option)
            continue
        if ev.event_type not in case_effects.REGISTERED_DECISION_EVENT_TYPES:
            continue
        option = ev.decision_option
        feedback = {"explanation": option.feedback_text or option.immediate_feedback or ""}
        if option.theory_basis:
            feedback["theoryBasis"] = option.theory_basis
        item = {
            "order": len(review) + 1,
            "nodeId": ev.node_id,
            "nodeTitle": ev.node.title if ev.node_id else "",
            "chosen": {"optionId": option.id, "text": option.text},
            "consequence": dto.consequence_dto(option)["text"],
            "feedback": feedback,
            "classification": option.classification,
            "prohibited": bool(option.prohibited_conduct),
        }
        first = first_answers.pop(ev.node_id, None)
        if first is not None:
            item["reconsidered"] = {"firstOptionId": first.id, "firstOptionText": first.text}
        review.append(item)
    return review


def build_report_payload(attempt, events, ordinal=None, definition_hash=None):
    """El reporte completo (superconjunto del de cierre) con lo de E1-8."""
    payload = dto.build_completion_report(attempt, events)
    payload.update({
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "ordinal": ordinal if ordinal is not None else attempt_ordinal(attempt),
        "definitionHash": definition_hash or case_definition_hash(attempt.case_version_id),
        "counts": {
            "adequate": payload["adequateDecisions"],
            "risky": payload["riskyDecisions"],
            "inadequate": payload["inadequateDecisions"],
            "prohibited": payload["prohibitedDecisions"],
            "retries": payload["retries"],
            "prohibitedRetries": payload["prohibitedRetries"],
            "toolsUsed": payload["toolsUsed"],
            "reflections": payload["reflectionsCount"],
        },
        "decisionReview": build_decision_review(events),
        # La lista nombra las notas (sin su texto: solo el dueño lo lee, por su propia ruta).
        "reflections": [
            {"nodeId": r.node_id, "nodeTitle": r.node.title, "locked": r.locked}
            for r in ReflectionJournal.objects.filter(attempt_id=attempt.id)
            .select_related("node").order_by("node_id")
        ],
        "timeByScene": [
            {"nodeId": scene["nodeId"], "seconds": round(scene["seconds"], 1)}
            for scene in attempt_duration.scene_durations(
                [(ev.event_type, ev.node_id, ev.occurred_at) for ev in events], end_at=attempt.ended_at
            )
        ],
    })
    return payload


def freeze_report(attempt, events=None):
    """Persiste el reporte del intento (una sola vez; idempotente) y devuelve la fila."""
    existing = AttemptReport.objects.filter(attempt_id=attempt.id).first()
    if existing is not None:
        return existing
    events = events if events is not None else load_events(attempt.id)
    ordinal = attempt_ordinal(attempt)
    definition_hash = case_definition_hash(attempt.case_version_id)
    payload = build_report_payload(attempt, events, ordinal, definition_hash)
    return AttemptReport.objects.create(
        attempt=attempt,
        report_json=json.dumps(payload, ensure_ascii=False),
        report_schema_version=REPORT_SCHEMA_VERSION,
        definition_hash=definition_hash,
        attempt_ordinal=ordinal,
    )


def frozen_report_for(attempt_id):
    """El reporte congelado del intento como diccionario, o ``None`` si no hay."""
    raw = AttemptReport.objects.filter(attempt_id=attempt_id).values_list("report_json", flat=True).first()
    return json.loads(raw) if raw else None


def report_for(attempt):
    """El reporte del intento: el congelado si es un intento completado con fila; si no, en vivo.

    En vivo no se persiste (leer no escribe). Un intento completado antes de E1-8 se arma con el
    reporte completo; uno que no se completó (pausado, reemplazado, salida segura histórica) no
    tiene reporte de cierre y recibe el resumen de siempre.
    """
    if attempt.status == AttemptStatus.COMPLETED:
        frozen = frozen_report_for(attempt.id)
        if frozen is not None:
            return frozen
        return build_report_payload(attempt, load_events(attempt.id))
    return dto.build_completion_report(attempt, load_events(attempt.id))
