"""Reporte congelado del intento (E1-8, RF-22, RF-23, CU-12, TD-08, N2).

Al completarse un intento se persiste, dentro de la misma transacción, **un** reporte
inmutable (``AttemptReport``). Es un superconjunto del reporte de cierre de siempre
(``game_dtos.build_completion_report``: el frontend actual no cambia) con lo que añade
E1-8: ``schemaVersion``, ``ordinal``, ``definitionHash``, ``decisionReview[]``,
``reflections[]`` (sin el texto de la bitácora) y ``timeByScene``. Lo leen el reporte del
intento, el del estudiante y el historial; leer no escribe. Un intento completado antes
de E1-8 no tiene fila: se sirve en vivo (sin persistirlo) y ``backfill_attempt_reports``
lo congela.

E6-1d (``schemaVersion 2``) añade el perfil por competencia (``competencyLevels``), ``nonRecommendedCount``,
``reflectionCoverage`` y ``keyLearningEvidence``: se calculan UNA vez, al cerrar, con la rúbrica, el catálogo y los
efectos de ese momento, y no se recalculan (un reporte cerrado no cambia). Un reporte v1 sigue siendo v1: se lee tal
cual, sin las claves nuevas.
"""
import hashlib
import json
import logging

from django.db import transaction
from django.db.models import Q

from shared.jsonutils import read_map

from apps.simulation.serializers import game_dtos as dto

from apps.simulation.assessment import competencies as assessment_competencies
from apps.simulation.assessment import definitions, evidence
from apps.simulation.assessment import evaluation as system_evaluation

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

logger = logging.getLogger(__name__)

REPORT_SCHEMA_VERSION = 2  # 1 = E1-8; 2 = E6-1d (perfil por competencia, no recomendadas, cobertura, evidencia)


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


def _competency_levels(attempt, events):
    """El perfil por competencia; es un dato derivado y NUNCA impide cerrar ni leer un reporte: si falla, queda vacío (y
    se registra). Va en un punto de guardado para que un error de base de datos no deje abortada la transacción."""
    try:
        with transaction.atomic():
            return assessment_competencies.competency_profile(attempt, events)
    except Exception:  # noqa: BLE001 - el cierre del intento no depende de su perfil por competencia
        logger.exception("No se pudo calcular el perfil por competencia del intento %s", attempt.id)
        return []


def build_report_payload(attempt, events, ordinal=None, definition_hash=None):
    """El reporte completo (superconjunto del de cierre) con lo de E1-8."""
    payload = dto.build_completion_report(attempt, events)
    # La lista nombra las notas (sin su texto: solo el dueño lo lee, por su propia ruta).
    reflections = [
        {"nodeId": r.node_id, "nodeTitle": r.node.title, "locked": r.locked}
        for r in ReflectionJournal.objects.filter(attempt_id=attempt.id).select_related("node").order_by("node_id")
    ]
    competency_levels = _competency_levels(attempt, events)
    coverage = evidence.reflection_coverage(
        [r["nodeId"] for r in reflections], evidence.decision_scene_ids(events), definitions.reflection_definition()
    )
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
        "reflections": reflections,
        # E6-1d: nombres de nivel, nunca un índice numérico (RN-09).
        "competencyLevels": competency_levels,
        "profileRules": definitions.PROFILE_RULES,  # la versión de la regla con la que se calculó (E6, revisión I-3)
        "nonRecommendedCount": evidence.non_recommended_count(events),
        "reflectionCoverage": coverage,
        "keyLearningEvidence": evidence.key_learning_evidence(
            attempt.status == AttemptStatus.COMPLETED, coverage, competency_levels
        ),
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
    row = AttemptReport.objects.create(
        attempt=attempt,
        report_json=json.dumps(payload, ensure_ascii=False),
        report_schema_version=REPORT_SCHEMA_VERSION,
        definition_hash=definition_hash,
        attempt_ordinal=ordinal,
    )
    _record_system_evaluation(attempt, payload)
    return row


#: Evento de que el estudiante abrió su retroalimentación (E6-4). Sin nodo ni opción.
FEEDBACK_VIEWED = "FEEDBACK_VIEWED"
#: Su clave de idempotencia: el ``request_id`` único por intento hace que la base descarte la segunda fila. Lleva una
#: «/», que ningún cliente puede mandar en un ``requestId`` (``shared.idempotency``), así que no choca con las órdenes.
FEEDBACK_VIEWED_KEY = "sistema/retroalimentacion-vista"


def _insert_feedback_viewed(attempt):
    AttemptEvent.objects.bulk_create(
        [AttemptEvent(
            attempt=attempt, event_type=FEEDBACK_VIEWED, request_id=FEEDBACK_VIEWED_KEY,
            detail="Retroalimentación vista",  # BORRADOR: texto nuevo del servidor, pendiente de Psicología (VD-23)
        )],
        ignore_conflicts=True,  # INSERT … ON CONFLICT DO NOTHING: a lo sumo una fila por intento, sin comprobar antes
    )


def record_feedback_viewed(attempt, actor):
    """Registra que el dueño de un intento COMPLETADO abrió su reporte (E6-4, R13); solo la primera vez cuenta.

    Es la única escritura de una lectura y por eso es estrecha: solo el dueño (el docente y el ADMIN leen sin escribir),
    solo un intento completado, y nunca rompe la lectura —en un punto de guardado— si la escritura falla.
    """
    if attempt.status != AttemptStatus.COMPLETED or attempt.student_id != actor.id:
        return
    try:
        with transaction.atomic():
            _insert_feedback_viewed(attempt)
    except Exception:  # noqa: BLE001 - la lectura del reporte no depende de este evento
        logger.exception("No se pudo registrar que el intento %s vio su retroalimentación", attempt.id)


def _record_system_evaluation(attempt, payload):
    """La evaluación automática (E6-1e) deriva del reporte que acaba de congelarse y NUNCA rompe el cierre: es un dato
    derivado, como lo que escuchan los suscriptores de ``attempt_completed`` (``send_robust``). Va en un punto de
    guardado para que un fallo de base de datos no deje abortada la transacción que cierra el intento."""
    try:
        with transaction.atomic():
            system_evaluation.record_system_evaluation(attempt, payload)
    except Exception:  # noqa: BLE001 - el cierre del intento no depende de su evaluación automática
        logger.exception("No se pudo crear la evaluación del sistema del intento %s", attempt.id)


def repair_system_evaluation(attempt):
    """Crea la evaluación del sistema de un intento CERRADO con reporte v2 que no la tiene; devuelve la fila o ``None``.

    La crea ``freeze_report`` al cerrar, pero ahí un fallo transitorio (un deadlock, un tiempo de espera) solo se
    registra y el intento quedaría sin ella para siempre: este es el camino de reparación (lo usa
    ``backfill_attempt_reports``). Lee el reporte CONGELADO —no recalcula nada— y, a diferencia del cierre, deja
    pasar el error para que quien repara sepa que no pudo. Un reporte v1 no tiene niveles de qué derivarla.
    """
    frozen = frozen_report_for(attempt.id)
    if frozen is None or frozen.get("schemaVersion", 1) < 2:
        return None
    return system_evaluation.record_system_evaluation(attempt, frozen)


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
