"""Mirrors Spring InstructorSimulationService 1:1 (application/InstructorSimulationService.java).

Instructor review of student attempts: recent list, full trace (timeline +
DECRYPTED reflections for authorized review + rubric summaries, with anonymized
student alias), and rubric evaluation read/save.
"""
import logging

from cryptography.exceptions import InvalidTag
from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied

from apps.grupos.models import Grupo, GrupoEstudiante, MembershipStatus
from apps.simulation.serializers import game_dtos as dto
from shared import policies
from shared.exceptions import ApiError
from shared.identity import IdentityPresenter
from shared.security_events import log_security_event

from ..models import (
    AttemptEvent,
    EvaluationOrigin,
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

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
MAX_PAGE = 1_000_000  # más allá, el OFFSET se sale del rango de la base y el listado cae con un 500


def _dt(value):
    return value.isoformat() if value else None


def _anonymize(attempt, instructor=None):
    return IdentityPresenter.alias_for(attempt.student_id, viewer=instructor)


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


def list_attempts(
    instructor,
    *,
    grupo_id=None,
    estudiante_id=None,
    case_version_id=None,
    estado=None,
    page=1,
    page_size=DEFAULT_PAGE_SIZE,
):
    """Listado paginado y filtrable de intentos para revisión docente (E5-6: RF-25, CU-14).

    Sin tope fijo de 20 ni filtro ``PUBLISHED``: incluye intentos de versiones archivadas
    o en borrador dentro del alcance del docente, con ``coverage {shown, total}``.
    """
    attempts = SimulationAttempt.objects.select_related(
        "case_version__simulation_case", "student"
    ).filter(case_version__simulation_case__active=True)

    if grupo_id is not None:
        grupo = Grupo.objects.filter(pk=grupo_id).first()
        if not grupo:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise NotFound("Grupo no encontrado")
        if getattr(instructor, "role", None) != "ADMIN":
            if grupo.profesor_id != instructor.id or not grupo.activo:
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                raise PermissionDenied("No tienes permiso para revisar intentos de este grupo")
        group_student_ids = set(
            GrupoEstudiante.objects.filter(
                grupo_id=grupo.id, status=MembershipStatus.ACTIVE
            ).values_list("estudiante_id", flat=True)
        )
        attempts = attempts.filter(student_id__in=group_student_ids)
    else:
        student_ids = student_ids_for_instructor(instructor)
        if student_ids is not None:
            attempts = attempts.filter(student_id__in=student_ids)

    if estudiante_id is not None:
        attempts = attempts.filter(student_id=estudiante_id)
    if case_version_id is not None:
        attempts = attempts.filter(case_version_id=case_version_id)
    if estado:
        attempts = attempts.filter(status=estado)

    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))

    total = attempts.count()
    offset = (page - 1) * page_size
    rows = list(attempts.order_by("-started_at", "-id")[offset : offset + page_size])
    items = [
        {
            "attemptId": str(a.id),
            "studentAlias": _anonymize(a, instructor=instructor),
            "caseVersionId": a.case_version_id,
            "caseVersionStatus": a.case_version.status,
            "caseTitle": a.case_version.simulation_case.title,
            "status": a.status,
            "accumulatedScore": a.accumulated_score,
            "stressIndex": a.stress_index,
            "activeSeconds": int(round(a.active_seconds or 0)),
            "startedAt": _dt(a.started_at),
            "endedAt": _dt(a.ended_at),
        }
        for a in rows
    ]
    return {
        "items": items,
        "page": page,
        "pageSize": page_size,
        "coverage": {"shown": len(items), "total": total},
    }


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
            "studentAlias": _anonymize(a, instructor=instructor),
            "caseTitle": a.case_version.simulation_case.title,
            "status": a.status,
            "accumulatedScore": a.accumulated_score,
            "stressIndex": a.stress_index,
            "startedAt": _dt(a.started_at),
        }
        for a in attempts
    ]


def _texto_de_bitacora(bitacora):
    """El texto de una bitácora, o None si no se puede descifrar (llave retirada o fila alterada). Una fila así no tumba
    el reporte del docente: su id va al registro de seguridad y nunca su contenido (S5-2)."""
    try:
        return crypto_service.decrypt(
            bitacora.encrypted_text,
            key_ref=bitacora.encryption_key_ref,
            attempt_id=bitacora.attempt_id,
            node_id=bitacora.node_id,
        )
    except (ValueError, InvalidTag):
        log_security_event("reflection_undecryptable", level=logging.ERROR, scope=f"reflection_journal:{bitacora.pk}")
        return None


def _bitacora_del_reporte(bitacora):
    texto = _texto_de_bitacora(bitacora)
    return {
        "nodeId": bitacora.node_id,
        "nodeTitle": bitacora.node.title,
        # `text` es null cuando la bitácora no se puede leer; `readable` es la marca que lo dice sin ambigüedad.
        "text": texto,
        "readable": texto is not None,
        "locked": bitacora.locked,
    }


@transaction.atomic
def trace(attempt_id, instructor=None):
    attempt = _require_attempt(attempt_id, instructor)
    events = list(
        AttemptEvent.objects.filter(attempt_id=attempt_id)
        .select_related("node", "decision_option")
        .order_by("occurred_at", "id")
    )
    report = dto.build_completion_report(attempt, events)
    evaluations = list(
        RubricEvaluation.objects.filter(attempt_id=attempt_id).select_related("rubric").order_by("-evaluated_at")
    )
    total_duration = report["totalDurationSeconds"]
    if total_duration is None and attempt.started_at and events:
        last_at = events[-1].occurred_at
        if last_at:
            total_duration = int((last_at - attempt.started_at).total_seconds())
    return {
        "attemptId": str(attempt.id),
        "studentAlias": _anonymize(attempt, instructor=instructor),
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
            _bitacora_del_reporte(r)
            for r in ReflectionJournal.objects.filter(attempt_id=attempt_id).select_related("node")
        ],
        # Solo las del docente: el cliente marca «evaluación aplicada» si alguna trae nivel (E6-1e, R7). La evaluación
        # automática del sistema va aparte, en ``systemEvaluation`` (nula si el intento no la tiene).
        "rubricEvaluations": [
            rubric_service.evaluation_summary(ev) for ev in evaluations if ev.origin != EvaluationOrigin.SISTEMA
        ],
        "systemEvaluation": next(
            (rubric_service.evaluation_summary(ev) for ev in evaluations if ev.origin == EvaluationOrigin.SISTEMA), None
        ),
    }


trace = auditable("traza.leer", "ATTEMPT")(trace)


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


# S4-1 · leer la evaluación de un intento ajeno es parte de revisarlo: queda con la misma etiqueta que la traza
# (``traza.leer``); el ``method`` de la fila (``rubric``) dice que fue la evaluación.
rubric = auditable("traza.leer", "ATTEMPT")(rubric)


@transaction.atomic
def save_rubric(attempt_id, request, instructor):
    _require_attempt(attempt_id, instructor)
    return rubric_service.save_attempt_evaluation(attempt_id, request, instructor)


save_rubric = auditable("rubrica.evaluar", "ATTEMPT")(save_rubric)


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
