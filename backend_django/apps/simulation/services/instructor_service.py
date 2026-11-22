"""Mirrors Spring InstructorSimulationService 1:1 (application/InstructorSimulationService.java).

Instructor review of student attempts: recent list, full trace (timeline +
DECRYPTED reflections for authorized review + rubric summaries, with anonymized
student alias), and rubric evaluation read/save.
"""
import logging

from cryptography.exceptions import InvalidTag
from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied

from apps.grupos.models import Grupo, GrupoEstudiante, MembershipStatus
from apps.simulation.serializers import game_dtos as dto
from shared import policies
from shared.exceptions import ApiError
from shared.identity import IdentityPresenter
from shared.security_events import log_security_event

from ..models import (
    REGISTERED_DECISION_EVENT_TYPES,
    AttemptEvent,
    AttemptStatus,
    EvaluationOrigin,
    ReflectionJournal,
    Rubric,
    RubricEvaluation,
    SimulationAttempt,
    SimulationRubricAssignment,
)
from . import attempt_lifecycle as lifecycle
from . import attempt_report, case_state, crypto_service, world_service
from . import rubric_service
from .attempt_lock import lock_attempt_row
from .attempt_replacement import replace_open_attempt
from .audit_service import auditable
from .option_availability import OPTIONS_NOT_OFFERED
from .instructor_scope import student_ids_for_instructor

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
MAX_PAGE = 1_000_000  # más allá, el OFFSET se sale del rango de la base y el listado cae con un 500


#: ``?evaluacion=`` de la revisión (BK-3): los terminados que esperan la valoración del docente, o los ya valorados.
EVALUATION_FILTERS = ("pendiente", "aplicada")

#: El estado de la valoración del docente sobre un intento (BK-3), para la bandeja «Por revisar»:
#: ``APLICADA`` = ya hay una valoración del DOCENTE concluida (``EVALUATED``); ``PENDIENTE`` = el intento terminó, el caso
#: se valora con una rúbrica y no hay valoración concluida (una guardada a medias sigue pendiente); ``NO_APLICA`` = el
#: intento no terminó o el caso no tiene ninguna rúbrica con que valorarlo.
APLICADA, PENDIENTE, NO_APLICA = "APLICADA", "PENDIENTE", "NO_APLICA"
EVALUATION_STATUSES = (PENDIENTE, APLICADA, NO_APLICA)


def _dt(value):
    return value.isoformat() if value else None


def _valoracion_concluida():
    """``Exists`` de una valoración del DOCENTE concluida sobre el intento de la fila (la que el estudiante ya ve)."""
    return Exists(
        RubricEvaluation.objects.filter(
            attempt_id=OuterRef("pk"), origin=EvaluationOrigin.DOCENTE, status="EVALUATED"
        )
    )


def _hay_rubrica_predeterminada():
    return Rubric.objects.filter(is_default=True, active=True).exists()


def _con_rubrica_q():
    """El filtro de los intentos cuya versión se valora con alguna rúbrica: la misma resolución que
    ``rubric_service.rubric_for_case_version`` (asignada, propia de la versión o la predeterminada)."""
    if _hay_rubrica_predeterminada():
        return Q()
    asignada = SimulationRubricAssignment.objects.filter(case_version_id=OuterRef("case_version_id"), active=True)
    propia = Rubric.objects.filter(case_version_id=OuterRef("case_version_id"), active=True)
    return Q(Exists(asignada)) | Q(Exists(propia))


def _versiones_con_rubrica(version_ids):
    """Las versiones de ``version_ids`` que se valoran con alguna rúbrica (dos consultas como mucho)."""
    ids = set(version_ids)
    if not ids or _hay_rubrica_predeterminada():
        return ids
    asignadas = SimulationRubricAssignment.objects.filter(case_version_id__in=ids, active=True)
    propias = Rubric.objects.filter(case_version_id__in=ids, active=True)
    return set(asignadas.values_list("case_version_id", flat=True)) | set(propias.values_list("case_version_id", flat=True))


def _estados_de_valoracion(attempts):
    """``{attempt_id: estado}`` (BK-3) de los intentos de una página, sin una consulta por intento."""
    ids = [a.id for a in attempts]
    if not ids:
        return {}
    valorados = set(
        RubricEvaluation.objects.filter(
            attempt_id__in=ids, origin=EvaluationOrigin.DOCENTE, status="EVALUATED"
        ).values_list("attempt_id", flat=True)
    )
    con_rubrica = _versiones_con_rubrica(a.case_version_id for a in attempts)
    estados = {}
    for a in attempts:
        if a.id in valorados:
            estados[a.id] = APLICADA
        elif a.status == AttemptStatus.COMPLETED and a.case_version_id in con_rubrica:
            estados[a.id] = PENDIENTE
        else:
            estados[a.id] = NO_APLICA
    return estados


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
    evaluacion=None,
    page=1,
    page_size=DEFAULT_PAGE_SIZE,
):
    """Listado paginado y filtrable de intentos para revisión docente (E5-6: RF-25, CU-14).

    Sin tope fijo de 20 ni filtro ``PUBLISHED``: incluye intentos de versiones archivadas
    o en borrador dentro del alcance del docente, con ``coverage {shown, total}``.

    ``evaluacion`` (BK-3): ``pendiente`` deja los terminados que esperan la valoración del docente (los mismos que
    ``evaluationStatus == PENDIENTE``); ``aplicada``, los ya valorados. Cada fila trae ``evaluationStatus``.
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
    if evaluacion == "pendiente":
        attempts = (
            attempts.filter(status=AttemptStatus.COMPLETED)
            .exclude(_valoracion_concluida())
            .filter(_con_rubrica_q())
        )
    elif evaluacion == "aplicada":
        attempts = attempts.filter(_valoracion_concluida())

    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))

    total = attempts.count()
    offset = (page - 1) * page_size
    rows = list(attempts.order_by("-started_at", "-id")[offset : offset + page_size])
    estados = _estados_de_valoracion(rows)
    items = [
        {
            "attemptId": str(a.id),
            "studentAlias": _anonymize(a, instructor=instructor),
            "caseVersionId": a.case_version_id,
            "caseVersionStatus": a.case_version.status,
            "caseTitle": a.case_version.simulation_case.title,
            "status": a.status,
            "activeSeconds": int(round(a.active_seconds or 0)),
            "startedAt": _dt(a.started_at),
            "endedAt": _dt(a.ended_at),
            "evaluationStatus": estados[a.id],
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
    attempts = list(attempts[:20])
    estados = _estados_de_valoracion(attempts)
    return [
        {
            "attemptId": str(a.id),
            "studentAlias": _anonymize(a, instructor=instructor),
            "caseTitle": a.case_version.simulation_case.title,
            "status": a.status,
            "startedAt": _dt(a.started_at),
            # BK-3 (aditivos): el Inicio docente lista «Por revisar» y dice «terminó hace…» sin pedir otra lista.
            "caseVersionId": a.case_version_id,
            "endedAt": _dt(a.ended_at),
            "evaluationStatus": estados[a.id],
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


def _persona_por_escena(events):
    """La persona consultante DESPUÉS de cada decisión registrada, escena a escena: ``[{nodeId, nodeTitle, bond,
    activation, label}]``. Recalculada sobre los eventos con la regla del juego (``case_state.persona_trail``)."""
    decisions = [
        ev for ev in events
        if ev.decision_option_id and ev.event_type in REGISTERED_DECISION_EVENT_TYPES
    ]
    trail = case_state.persona_trail(ev.decision_option for ev in decisions)
    return [
        {"nodeId": ev.node_id, "nodeTitle": ev.node.title if ev.node_id else "", **case_state.persona_dto(persona)}
        for ev, persona in zip(decisions, trail)
    ]


def _declara_competencias(attempt):
    from apps.simulation.assessment.competencies import case_declares_competencies

    return case_declares_competencies(attempt.case_version_id)


def _valoracion_del_sistema(attempt, evaluations):
    """``(systemEvaluation, systemEvaluationAvailable)``: la valoración automática, plegada hasta que el docente guarda la suya.

    Verla antes ancla el juicio de quien revisa. Se muestra solo cuando el intento ya tiene una evaluación del DOCENTE
    concluida (``EVALUATED``); entonces trae el resumen del sistema y su perfil por competencia con la evidencia de
    cada una. Antes, ``None`` y ``available`` dice si hay algo que mostrar (para «se mostrará cuando registres tu
    valoración»).
    """
    system = next((ev for ev in evaluations if ev.origin == EvaluationOrigin.SISTEMA), None)
    if system is None:
        return None, False
    if not any(ev.origin == EvaluationOrigin.DOCENTE and ev.status == "EVALUATED" for ev in evaluations):
        return None, True
    summary = rubric_service.evaluation_summary(system)
    summary["competencyLevels"] = attempt_report.report_for(attempt).get("competencyLevels", [])
    return summary, True


def _evidencia_por_competencia(attempt, events):
    """RK-4 · ``[{code, name, items: [{order, nodeTitle, optionText, class, atSeconds}]}]``: por cada competencia de la
    rúbrica con que se valora el intento, las decisiones registradas que la tocan, en orden.

    Es lo que la docente mira al lado de cada criterio mientras valora. A propósito NO trae ningún nivel: ni el que
    aporta cada decisión ni el que calculó el sistema para la competencia. Esa valoración automática sigue plegada hasta
    que la docente guarda la suya (``_valoracion_del_sistema``): verla antes ancla su juicio. Reutiliza la misma regla que
    el perfil por competencia (``assessment.competencies.contributions``), así que una ficha aparece aquí solo si esa
    decisión entra en el perfil. Sin rúbrica, o sin criterios con competencia, la lista está vacía.
    """
    from apps.simulation.assessment import competencies as perfil  # perezoso: assessment importa rubric_service

    rubric = perfil.rubric_of(attempt.case_version_id)
    if rubric is None:
        return []
    competencias = perfil.rubric_competencies(rubric)
    codigos = {c.code for c in competencias}
    fichas = {code: [] for code in codigos}
    order = 0
    for ev in events:
        if not ev.decision_option_id or ev.event_type not in REGISTERED_DECISION_EVENT_TYPES:
            continue
        order += 1  # la posición entre las registradas: la misma ``order`` que el perfil y ``decisionReview``
        option = ev.decision_option
        tocadas = perfil.contributions(option, codigos)
        if not tocadas:
            continue
        response_class = case_state.response_class_of(option)
        at_seconds = (
            int((ev.occurred_at - attempt.started_at).total_seconds())
            if ev.occurred_at and attempt.started_at else None
        )
        for code in tocadas:
            fichas[code].append({
                "order": order,
                "nodeTitle": ev.node.title if ev.node_id else "",
                "optionText": option.text,
                "class": response_class.value if response_class else None,
                "atSeconds": at_seconds,
            })
    return [{"code": c.code, "name": c.name, "items": fichas[c.code]} for c in competencias]


@transaction.atomic
def trace(attempt_id, instructor=None):
    attempt = _require_attempt(attempt_id, instructor)
    events = list(
        AttemptEvent.objects.filter(attempt_id=attempt_id)
        .select_related("node", "decision_option")
        .order_by("occurred_at", "id")
    )
    report = dto.build_completion_report(attempt, events, class_of=case_state.response_class_of)
    evaluations = list(
        RubricEvaluation.objects.filter(attempt_id=attempt_id).select_related("rubric").order_by("-evaluated_at")
    )
    total_duration = report["totalDurationSeconds"]
    if total_duration is None and attempt.started_at and events:
        last_at = events[-1].occurred_at
        if last_at:
            total_duration = int((last_at - attempt.started_at).total_seconds())
    system_evaluation, system_available = _valoracion_del_sistema(attempt, evaluations)
    return {
        "attemptId": str(attempt.id),
        "studentAlias": _anonymize(attempt, instructor=instructor),
        "caseTitle": attempt.case_version.simulation_case.title,
        "status": attempt.status,
        "startedAt": _dt(attempt.started_at),
        "endedAt": _dt(attempt.ended_at),
        # Cuántas decisiones registradas hubo de cada clase, los hitos cumplidos y los que faltaron, y el final.
        "counts": case_state.counts(
            ev.decision_option for ev in events
            if ev.decision_option_id and ev.event_type in REGISTERED_DECISION_EVENT_TYPES
        ),
        "milestones": attempt_report.build_milestones(attempt),
        "personaPorEscena": _persona_por_escena(events),
        "ending": report["ending"],
        # Primeras respuestas que el juego no aplicó (regla de reintento): no entran en `counts`; sin esto la fila
        # «reintento» de la línea de tiempo contradice el conteo de contraindicadas.
        "retries": report["retries"],
        "prohibitedRetries": report["prohibitedRetries"],
        "safeExitUsed": report["safeExitUsed"],
        "totalDurationSeconds": total_duration,
        "activeSeconds": report["activeSeconds"],
        "timeline": report["timeline"],
        "visitedNodeTitles": report["visitedNodeTitles"],
        # ``OPTIONS_NOT_OFFERED`` es contabilidad del informe de cierre, no un hecho del recorrido.
        "events": [_to_trace_event(e) for e in events if e.event_type != OPTIONS_NOT_OFFERED],
        "world": world_service.world_for_attempt(attempt),
        "reflections": [
            _bitacora_del_reporte(r)
            for r in ReflectionJournal.objects.filter(attempt_id=attempt_id).select_related("node")
        ],
        # Solo las del docente: el cliente marca «evaluación aplicada» si alguna trae nivel (E6-1e, R7).
        "rubricEvaluations": [
            rubric_service.evaluation_summary(ev) for ev in evaluations if ev.origin != EvaluationOrigin.SISTEMA
        ],
        # La valoración automática va plegada hasta que el docente guarde la suya (ver ``_valoracion_del_sistema``).
        "systemEvaluation": system_evaluation,
        "systemEvaluationAvailable": system_available,
        # V5: sin competencias declaradas en el caso no hay valoración del sistema; la docente ve por qué y el editor.
        "caseVersionId": attempt.case_version_id,
        "competenciesDeclared": _declara_competencias(attempt),
        # RK-4 (aditivo): la evidencia por competencia para valorar cada criterio a la vista, sin niveles calculados.
        "evidenceByCompetency": _evidencia_por_competencia(attempt, events),
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
    response_class = case_state.response_class_of(event.decision_option) if event.decision_option_id else None
    return {
        "type": event.event_type,
        "class": response_class.value if response_class else None,
        "nodeTitle": event.node.title if event.node_id else None,
        "decisionText": event.decision_option.text if event.decision_option_id else None,
        "detail": event.detail,
        "occurredAt": _dt(event.occurred_at),
    }
