"""Mirrors Spring InstructorSimulationService 1:1 (application/InstructorSimulationService.java).

Instructor review of student attempts: recent list, full trace (timeline +
DECRYPTED reflections for authorized review + rubric summaries, with anonymized
student alias), and rubric evaluation read/save.
"""
from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied

from apps.simulation.serializers import game_dtos as dto
from shared import policies
from shared.exceptions import ApiError

from ..models import (
    AttemptEvent,
    ReflectionJournal,
    RubricEvaluation,
    SimulationAttempt,
)
from . import attempt_lifecycle as lifecycle
from . import crypto_service, world_service
from . import rubric_service
from .attempt_lock import lock_attempt_row
from .attempt_replacement import replace_open_attempt
from .audit_service import auditable
from .instructor_scope import student_ids_for_instructor


def _dt(value):
    return value.isoformat() if value else None


def _anonymize(attempt):
    return f"Estudiante-{attempt.student_id if attempt.student_id is not None else 0}"


def _require_attempt(attempt_id, instructor=None):
    attempt = (
        SimulationAttempt.objects.filter(pk=attempt_id)
        .select_related("case_version__simulation_case", "current_node", "student")
        .first()
    )
    if not attempt:
        raise NotFound("Intento no encontrado")
    if instructor is not None:
        student_ids = student_ids_for_instructor(instructor)  # None = ADMIN (sin restricción)
        member = student_ids is None or attempt.student_id in student_ids
        if not policies.can(instructor, "attempt", "review", member=member):
            raise PermissionDenied("No tienes permiso para revisar este intento")
    return attempt


def recent_attempts(instructor):
    attempts = (
        SimulationAttempt.objects.select_related("case_version__simulation_case", "student")
        # E2-5: las versiones archivadas siguen en el seguimiento (sus intentos abiertos se terminan).
        .filter(case_version__simulation_case__active=True)
        .order_by("-started_at")
    )
    student_ids = student_ids_for_instructor(instructor)
    if student_ids is not None:
        if not student_ids:
            return []
        attempts = attempts.filter(student_id__in=student_ids)
    attempts = attempts[:20]
    return [
        {
            "attemptId": str(a.id),
            "studentAlias": _anonymize(a),
            "caseTitle": a.case_version.simulation_case.title,
            "status": a.status,
            "accumulatedScore": a.accumulated_score,
            "stressIndex": a.stress_index,
            "startedAt": _dt(a.started_at),
        }
        for a in attempts
    ]


@transaction.atomic
def trace(attempt_id, instructor=None):
    attempt = _require_attempt(attempt_id, instructor)
    events = list(
        AttemptEvent.objects.filter(attempt_id=attempt_id)
        .select_related("node", "decision_option")
        .order_by("occurred_at", "id")
    )
    report = dto.build_completion_report(attempt, events)
    total_duration = report["totalDurationSeconds"]
    if total_duration is None and attempt.started_at and events:
        last_at = events[-1].occurred_at
        if last_at:
            total_duration = int((last_at - attempt.started_at).total_seconds())
    return {
        "attemptId": str(attempt.id),
        "studentAlias": _anonymize(attempt),
        "caseTitle": attempt.case_version.simulation_case.title,
        "status": attempt.status,
        "accumulatedScore": attempt.accumulated_score,
        "stressIndex": attempt.stress_index,
        "metrics": dto.metrics(attempt),
        "startedAt": _dt(attempt.started_at),
        "endedAt": _dt(attempt.ended_at),
        "adequateDecisions": report["adequateDecisions"],
        "riskyDecisions": report["riskyDecisions"],
        "inadequateDecisions": report["inadequateDecisions"],
        "prohibitedDecisions": report["prohibitedDecisions"],
        # Primeras respuestas que el juego no aplicó (regla de reintento): no entran en los contadores de
        # arriba; sin esto la fila «reintento» de la línea de tiempo contradice el contador de contraindicadas.
        "retries": report["retries"],
        "prohibitedRetries": report["prohibitedRetries"],
        "safeExitUsed": report["safeExitUsed"],
        "totalDurationSeconds": total_duration,
        "activeSeconds": report["activeSeconds"],
        "timeline": report["timeline"],
        "visitedNodeTitles": report["visitedNodeTitles"],
        "events": [_to_trace_event(e) for e in events],
        "world": world_service.world_for_attempt(attempt),
        "reflections": [
            {
                "nodeId": r.node_id,
                "nodeTitle": r.node.title,
                "text": crypto_service.decrypt(r.encrypted_text),
                "locked": r.locked,
            }
            for r in ReflectionJournal.objects.filter(attempt_id=attempt_id).select_related("node")
        ],
        "rubricEvaluations": [
            rubric_service.evaluation_summary(ev)
            for ev in RubricEvaluation.objects.filter(attempt_id=attempt_id)
            .select_related("rubric")
            .order_by("-evaluated_at")
        ],
    }


@transaction.atomic
def replace_attempt(attempt_id, reason, instructor):
    """Reemplaza un intento abierto por acción docente (RN-07, E1-2): motivo y auditoría.

    El ESTUDIANTE nunca reemplaza al abierto (E1-1); un PROFESOR solo los de sus estudiantes
    (``_require_attempt``) y el ADMIN cualquiera. El intento queda REPLACED, con su bitácora
    bloqueada y quién y por qué lo reemplazó.
    """
    # Cerrojo de la fila: serializa el reemplazo con las órdenes del estudiante sobre el intento.
    lock_attempt_row(attempt_id)
    attempt = _require_attempt(attempt_id, instructor)
    if not lifecycle.state_of(attempt).is_open:
        raise ApiError(
            "ATTEMPT_NOT_OPEN",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "El intento ya está cerrado y no puede reemplazarse.",
            status.HTTP_409_CONFLICT,
        )
    replace_open_attempt(attempt, by=instructor, reason=reason)
    return {
        "attemptId": str(attempt.id),
        "status": attempt.status,
        "reason": reason,
        "replacedAt": _dt(attempt.ended_at),
    }


replace_attempt = auditable("ATTEMPT_REPLACED", "ATTEMPT")(replace_attempt)


def rubric(attempt_id, instructor=None):
    _require_attempt(attempt_id, instructor)
    return rubric_service.attempt_rubric_view(attempt_id)


@transaction.atomic
def save_rubric(attempt_id, request, instructor):
    _require_attempt(attempt_id, instructor)
    return rubric_service.save_attempt_evaluation(attempt_id, request, instructor)


# ─── DTO builders ─────────────────────────────────────────────────────────────
def _to_trace_event(event):
    classification = event.decision_option.classification if event.decision_option_id else None
    return {
        "type": event.event_type,
        "classification": classification,
        "nodeTitle": event.node.title if event.node_id else None,
        "decisionText": event.decision_option.text if event.decision_option_id else None,
        "scoreDelta": event.score_delta,
        "stressDelta": event.stress_delta,
        "detail": event.detail,
        "occurredAt": _dt(event.occurred_at),
    }
