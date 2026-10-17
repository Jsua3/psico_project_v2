"""Port of Spring's SimulationGameService — the DAG state machine."""
import base64
import hashlib
import json
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import OuterRef
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.grupos import assignments
from apps.simulation.models import (
    INITIAL_STRESS_INDEX,
    INITIAL_USER_TRUST,
    INITIAL_VICTIM_RISK,
    AttemptEvent,
    AttemptReport,
    AttemptStatus,
    CaseVersion,
    DecisionOption,
    ReflectionJournal,
    SimulationAttempt,
    SimulationNode,
)
from apps.simulation.serializers import game_dtos as dto
from apps.simulation.signals import attempt_completed, attempt_start_requested
from . import attempt_lifecycle as lifecycle
from . import case_effects, crypto_service, decision_effects
from . import attempt_duration, attempt_report, case_rules
from shared.exceptions import ApiError
from shared import policies
from shared.idempotency import DUPLICATE_WINDOW_SECONDS, normalize_request_id

from .attempt_lock import lock_attempt_row, locked_attempt
from .attempt_replacement import replace_open_attempt
from .audit_service import auditable
from .instructor_scope import student_ids_for_instructor
from .node_iterator import BreadthFirstNodeIterator


def _hash_token(raw_token: str) -> str:
    digest = hashlib.sha256(raw_token.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _new_token() -> str:
    return secrets.token_urlsafe(32)


def _save_event(attempt, event_type, node, decision, score_delta, stress_delta, detail, request_id=None):
    AttemptEvent.objects.create(
        attempt=attempt,
        event_type=event_type,
        node=node,
        decision_option=decision,
        score_delta=score_delta,
        stress_delta=stress_delta,
        detail=detail,
        request_id=request_id,
    )


def request_id_reused():
    """409 REQUEST_ID_REUSED: el mismo ``requestId`` llegó con otra orden (error del cliente)."""
    return ApiError(
        "REQUEST_ID_REUSED",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        "El requestId ya se usó en otra orden de este intento.",
        status.HTTP_409_CONFLICT,
    )


def _lock_reflections(attempt):
    ReflectionJournal.objects.filter(attempt_id=attempt.id).update(
        locked=True, updated_at=timezone.now()
    )


def _get_version(case_version_id):
    version = CaseVersion.objects.filter(pk=case_version_id).select_related("simulation_case").first()
    if not version:
        raise NotFound("Versión de caso no encontrada")
    return version


def _ensure_published(version):
    """Solo se arranca una versión publicada **y sellada** (E4-4): lo que se ejecuta es lo que se validó."""
    if version.status != "PUBLISHED" or not version.simulation_case.active:
        raise PermissionDenied("El caso no está publicado")
    if version.validated_at is None or not version.definition_hash:
        raise ApiError(
            "CASE_NOT_PUBLISHABLE",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "El caso está publicado pero aún no tiene el sello de validación: pide a un administrador "
            "que lo valide y lo selle antes de empezar.",
            status.HTTP_409_CONFLICT,
        )


def _require_published(case_version_id):
    version = _get_version(case_version_id)
    _ensure_published(version)
    return version


def _require_attempt(attempt_id, attempt_token, actor, enforce_assignment=True):
    """El intento del token, **solo para su dueño** (E2-2, D-11, RNF-04).

    Un docente o el ADMIN no leen un intento ajeno por token: su vía es ``/api/instructor/**``
    y el reporte de finalización (``get_student_report``), que aplican el alcance.

    ``enforce_assignment=False`` solo para la salida segura (REGLA-004 / ETH-02: siempre
    alcanzable, aunque el estudiante ya no tenga el caso asignado).
    """
    if not attempt_token:
        raise ValidationError("El token del intento es obligatorio")
    attempt = (
        SimulationAttempt.objects.filter(
            pk=attempt_id, attempt_token_hash=_hash_token(attempt_token)
        )
        .select_related("case_version__simulation_case", "current_node", "student")
        # E1-4: la asignación vigente del dueño viaja en la misma consulta (sin un viaje más).
        .annotate(owner_has_assignment=assignments.assignment_exists(
            OuterRef("student_id"), OuterRef("case_version_id")
        ))
        .first()
    )
    if not attempt:
        raise NotFound("Intento no encontrado")
    owner = attempt.student_id == actor.id
    if not policies.can(actor, "attempt", "play", owner_id=attempt.student_id):
        raise PermissionDenied("No tiene acceso a este intento")
    # Un estudiante al que ya no le asignaron el caso no continúa un intento abierto; uno
    # cerrado sigue siendo suyo y se puede leer. Una versión archivada o un caso dado de baja
    # NO bloquean: se deja terminar (Review Focus 2).
    if (enforce_assignment and owner and actor.role == "ESTUDIANTE"
            and lifecycle.state_of(attempt).is_open and not attempt.owner_has_assignment):
        raise access_not_assigned()
    return attempt


def _reissue_token(attempt):
    raw = _new_token()
    attempt.attempt_token_hash = _hash_token(raw)
    attempt.save(update_fields=["attempt_token_hash"])
    return raw


def access_not_assigned():
    """403 ACCESS_NOT_ASSIGNED: el estudiante ya no tiene el caso asignado por un grupo activo."""
    return ApiError(
        "ACCESS_NOT_ASSIGNED",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        "Ya no tienes este caso asignado. Consúltalo con tu docente.",
        status.HTTP_403_FORBIDDEN,
    )


#: Reexportado: lo importan el catálogo de progresión y otras pruebas desde su ubicación anterior.
assigned_case_version_ids = assignments.assigned_case_version_ids
_student_can_access_case = assignments.student_has_assignment


def list_published_cases(actor=None):
    versions = (
        CaseVersion.objects.filter(status="PUBLISHED", simulation_case__active=True)
        .select_related("simulation_case")
        .order_by("-published_at")
    )
    if actor is not None and getattr(actor, "role", None) == "ESTUDIANTE":
        assigned_ids = assigned_case_version_ids(actor.id)
        if not assigned_ids:
            return []
        versions = versions.filter(id__in=assigned_ids)
    result = []
    for v in versions:
        node_count = SimulationNode.objects.filter(case_version_id=v.id).count()
        result.append(dto.case_summary(v, node_count))
    return result


def _close_active_attempts(student, case_version_id, reason):
    # Reemplazar con forceNew (ruta heredada, mientras ATTEMPT_START_STRICT esté apagada) cierra
    # de forma TERMINAL tanto los intentos en progreso como los pausados. Es un reemplazo, no una
    # salida segura: estado y evento propios; ``replaced_by`` es el propio estudiante.
    actives = SimulationAttempt.objects.filter(
        student_id=student.id, case_version_id=case_version_id,
        status__in=lifecycle.OPEN_STATUSES,
    ).select_related("current_node")
    for active in actives:
        replace_open_attempt(active, by=student, reason=reason)


def _state(attempt, attempt_token, feedback=None):
    """El estado del intento; si está completado, con su reporte congelado (E1-8).

    En modo «retroalimentación al cierre» un intento que NO está completado no lleva el reporte
    en vivo (traía conteos y línea de tiempo con la clasificación de cada decisión): la
    evaluación llega al cerrar, por el reporte congelado.
    """
    if attempt.status == AttemptStatus.COMPLETED:
        report = attempt_report.frozen_report_for(attempt.id)
        return dto.attempt_state(attempt, attempt_token, feedback, completion_report=report)
    at_close = case_rules.feedback_at_close_only(case_rules.rules_of(attempt.case_version))
    return dto.attempt_state(attempt, attempt_token, feedback, include_report=not at_close)


def _open_attempt_of(student_id, case_version_id):
    """El intento abierto (en juego o en pausa) del estudiante en esa versión del caso, si lo hay."""
    return (
        SimulationAttempt.objects.filter(
            student_id=student_id, case_version_id=case_version_id,
            status__in=lifecycle.OPEN_STATUSES,
        )
        .select_related("case_version__simulation_case", "current_node")
        .order_by("-started_at")
        .first()
    )


def _resumed_state(attempt):
    """El intento abierto con un token nuevo y ``resumed: true`` (C1)."""
    state = _state(attempt, _reissue_token(attempt), None)
    state["resumed"] = True
    return state


@transaction.atomic
def start_attempt(case_version_id, actor, force_new=False):
    """Inicia un intento o devuelve el abierto (C1, RN-07, DM-5.4).

    Un intento pausado también cuenta como abierto: nunca se duplica en silencio. Con
    ``ATTEMPT_START_STRICT``, ``forceNew`` de un estudiante que ya tiene uno abierto es un
    409: reemplazar un intento es una acción docente (``replace_attempt``). El índice único
    parcial de la BD es la última defensa; quien pierde una carrera recibe el intento ganador.
    """
    version = _get_version(case_version_id)
    is_student = getattr(actor, "role", None) == "ESTUDIANTE"
    if is_student and not _student_can_access_case(actor.id, case_version_id):
        raise access_not_assigned()

    open_attempt = _open_attempt_of(actor.id, case_version_id)
    if open_attempt is not None:
        # Cerrojo del intento abierto y relectura bajo él: una orden que lo está completando o un
        # reemplazo docente en curso terminan antes, y no se sobrescribe un estado que ya cambió.
        lock_attempt_row(open_attempt.id)
        open_attempt = _open_attempt_of(actor.id, case_version_id)
    if open_attempt is not None:
        if not force_new:
            # Reanudar no exige que la versión siga publicada: se deja terminar (Review Focus 2).
            return _resumed_state(open_attempt)
        if settings.ATTEMPT_START_STRICT and is_student:
            raise ApiError(
                "ATTEMPT_ALREADY_OPEN",
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                "Ya tienes un intento abierto de este caso. Continúalo o pide a tu docente que lo reemplace.",
                status.HTTP_409_CONFLICT,
                existingAttemptId=str(open_attempt.id),
            )
        _ensure_published(version)  # reemplazar crea uno nuevo, y eso sí exige un caso publicado
        if is_student:
            # Empezar de nuevo es iniciar uno nuevo (decisión 12, R6): exige ventana abierta y la
            # secuencia, sin la excepción de «se deja terminar» del intento que se reemplaza.
            attempt_start_requested.send(
                sender=SimulationAttempt, student=actor, case_version_id=case_version_id,
                replacing=True,
            )
        _close_active_attempts(actor, case_version_id, "Reemplazado por nuevo intento")
    else:
        _ensure_published(version)
        if is_student:
            # SIEP-RF-12: el desbloqueo lineal lo hace cumplir el servidor, no solo la interfaz. Quien
            # ya tiene un intento abierto de ese caso no pasa por aquí (lo reanuda o lo reemplaza). El
            # simulador solo anuncia el inicio; quien quiera vetarlo (progresión) se suscribe (P-13).
            attempt_start_requested.send(
                sender=SimulationAttempt, student=actor, case_version_id=case_version_id
            )

    start_node = SimulationNode.objects.filter(case_version_id=version.id, start_node=True).first()
    if not start_node:
        raise NotFound("El caso no tiene nodo inicial")

    raw_token = _new_token()
    try:
        with transaction.atomic():  # savepoint: un IntegrityError no rompe la transacción externa
            attempt = SimulationAttempt.objects.create(
                attempt_token_hash=_hash_token(raw_token),
                case_version=version,
                student_id=actor.id,
                current_node=start_node,
                last_activity_at=timezone.now(),
                status=lifecycle.INITIAL_STATUS,
                accumulated_score=0,
                stress_index=INITIAL_STRESS_INDEX,
                victim_risk=INITIAL_VICTIM_RISK,
                user_trust=INITIAL_USER_TRUST,
                institutional_route_activated=False,
                revictimization_risk=False,
            )
    except IntegrityError:
        winner = _open_attempt_of(actor.id, case_version_id)
        if winner is None:
            raise
        return _resumed_state(winner)
    _save_event(attempt, "ATTEMPT_STARTED", start_node, None, 0, 0, "Intento iniciado")
    _save_event(attempt, "NODE_ENTERED", start_node, None, 0, 0, "Nodo inicial")
    state = _state(attempt, raw_token, None)
    state["resumed"] = False
    return state


def find_active_attempt(case_version_id, actor):
    """El intento abierto del estudiante en esa versión, con un token nuevo; ``None`` si no hay.

    Con un intento abierto no se exige que la versión siga publicada (se deja terminar), pero sí
    que el estudiante conserve la asignación (E1-4). Sin intento abierto, el caso debe estar
    publicado, como siempre.
    """
    active = _open_attempt_of(actor.id, case_version_id)
    if not active:
        _require_published(case_version_id)
        return None
    if getattr(actor, "role", None) == "ESTUDIANTE" and not assignments.student_has_assignment(
        actor.id, case_version_id
    ):
        raise access_not_assigned()
    state = _state(active, _reissue_token(active), None)
    state["resumed"] = True
    return state


def get_attempt(attempt_id, attempt_token, actor):
    attempt = _require_attempt(attempt_id, attempt_token, actor)
    return _state(attempt, attempt_token, None)


def get_completion_report(attempt_id, attempt_token, actor):
    attempt = _require_attempt(attempt_id, attempt_token, actor)
    if lifecycle.state_of(attempt).plays:
        raise ValidationError("El intento aún está en progreso")
    return attempt_report.report_for(attempt)


def get_attempt_report(attempt_id, attempt_token, actor):
    """El reporte congelado del intento (C2): solo de un intento COMPLETADO, si no 409.

    Un intento en juego, en pausa o reemplazado todavía no (o ya no) tiene reporte de cierre.
    """
    attempt = _require_attempt(attempt_id, attempt_token, actor)
    if attempt.status != AttemptStatus.COMPLETED:
        raise ApiError(
            "ATTEMPT_NOT_COMPLETED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "El intento no está completado: aún no tiene reporte de cierre.",
            status.HTTP_409_CONFLICT,
        )
    return attempt_report.report_for(attempt)


def list_attempt_history(actor):
    """Resumen de los intentos del propio estudiante (más recientes primero).

    Las cuentas de un intento completado salen de su reporte congelado (E1-8: no cambian si
    el caso cambia después); las de los demás se calculan en una sola consulta agregada para
    evitar N+1, con la misma semántica que el reporte de finalización.
    """
    attempts = list(
        SimulationAttempt.objects.filter(student_id=actor.id)
        .select_related("case_version__simulation_case")
        .order_by("-started_at")
    )
    if not attempts:
        return []

    attempt_ids = [a.id for a in attempts]
    counts = {}
    for row in AttemptReport.objects.filter(attempt_id__in=attempt_ids).only("attempt_id", "report_json"):
        frozen = json.loads(row.report_json)
        counts[row.attempt_id] = {
            "ADEQUATE": frozen["adequateDecisions"],
            "RISKY": frozen["riskyDecisions"],
            "INADEQUATE": frozen["inadequateDecisions"],
            "PROHIBITED": frozen["prohibitedDecisions"],
        }
    live_ids = [aid for aid in attempt_ids if aid not in counts]
    for aid in live_ids:
        counts[aid] = {"ADEQUATE": 0, "RISKY": 0, "INADEQUATE": 0, "PROHIBITED": 0}
    if live_ids:
        # Solo decisiones registradas: los reintentos no puntúan (misma regla que el reporte).
        decision_events = (
            AttemptEvent.objects.filter(
                attempt_id__in=live_ids,
                event_type__in=case_effects.REGISTERED_DECISION_EVENT_TYPES,
                decision_option__isnull=False,
            )
            .values(
                "attempt_id",
                "decision_option__classification",
                "decision_option__prohibited_conduct",
            )
        )
        for ev in decision_events:
            bucket = counts[ev["attempt_id"]]
            classification = ev["decision_option__classification"]
            if classification in bucket:
                bucket[classification] += 1
            if ev["decision_option__prohibited_conduct"]:
                bucket["PROHIBITED"] += 1

    return [
        {
            "attemptId": str(a.id),
            "caseVersionId": a.case_version_id,
            "caseTitle": a.case_version.simulation_case.title,
            "status": a.status,
            "accumulatedScore": a.accumulated_score,
            "adequateDecisions": counts[a.id]["ADEQUATE"],
            "riskyDecisions": counts[a.id]["RISKY"],
            "inadequateDecisions": counts[a.id]["INADEQUATE"],
            "prohibitedDecisions": counts[a.id]["PROHIBITED"],
            "totalDurationSeconds": (
                int((a.ended_at - a.started_at).total_seconds())
                if a.started_at and a.ended_at else None
            ),
            # Del acumulador (E1-5); un intento sin terminar no informa tiempo activo, como antes.
            "activeDurationSeconds": int(round(a.active_seconds or 0)) if a.ended_at else None,
            "startedAt": a.started_at.isoformat() if a.started_at else None,
            "endedAt": a.ended_at.isoformat() if a.ended_at else None,
        }
        for a in attempts
    ]


def get_student_report(attempt_id, actor):
    """Reporte de finalización de un intento accedido por su dueño, por el ADMIN o por el
    profesor del estudiante, sin requerir el token del intento (se usa desde el historial
    del estudiante)."""
    attempt = (
        SimulationAttempt.objects.filter(pk=attempt_id)
        .select_related("case_version__simulation_case", "current_node", "student")
        .first()
    )
    if not attempt:
        raise NotFound("Intento no encontrado")
    # El dueño, o quien puede revisarlo: el ADMIN o el profesor con alcance sobre el estudiante.
    member = False
    if attempt.student_id != actor.id and actor.role in ("PROFESOR", "ADMIN"):
        alcance = student_ids_for_instructor(actor)  # None = ADMIN (sin restricción)
        member = alcance is None or attempt.student_id in alcance
    if not policies.can(actor, "attempt", "report", owner_id=attempt.student_id, member=member):
        raise PermissionDenied("No tiene acceso a este intento")
    return attempt_report.report_for(attempt)


def _override_evidence_labels(missing_evidence):
    labels = []
    for raw in missing_evidence or []:
        label = " ".join(str(raw).split())
        if label and label not in labels:
            labels.append(label)
    return labels


_DECISION_EVENT_TYPES = case_effects.REGISTERED_DECISION_EVENT_TYPES + case_effects.RETRY_EVENT_TYPES


def _find_decision_replay(attempt, decision_option_id, request_id):
    """El evento de una decisión ya procesada que esta orden repite, o ``None`` (E1-3).

    Con un ``requestId`` que el intento ya vio la clave es exacta (el mismo id con otra opción es
    un error del cliente: 409). Si el id es nuevo o no viene, la misma opción elegida otra vez
    dentro de ``DUPLICATE_WINDOW_SECONDS`` es un doble clic, no una respuesta nueva: no gasta la
    segunda oportunidad.
    """
    events = AttemptEvent.objects.filter(attempt_id=attempt.id).select_related(
        "decision_option__target_node"
    )
    if request_id:
        event = events.filter(request_id=request_id).first()
        if event is not None:
            if event.event_type not in _DECISION_EVENT_TYPES or event.decision_option_id != decision_option_id:
                raise request_id_reused()
            return event
        # Un id que este intento aún no vio no prueba que sea una respuesta deliberada: un cliente
        # que genera un id por clic manda dos en un doble clic. La ventana corre igual (revisión de E1).
    since = timezone.now() - timedelta(seconds=DUPLICATE_WINDOW_SECONDS)
    last = (
        events.filter(event_type__in=_DECISION_EVENT_TYPES, occurred_at__gte=since)
        .order_by("-occurred_at", "-id")
        .first()
    )
    if last is not None and last.decision_option_id == decision_option_id:
        return last
    return None


#: Mensaje del reintento cuando la respuesta no puede ser evaluativa (``FEEDBACK_AT_CLOSE_ONLY``):
#: anuncia que se puede volver a elegir sin decir si la respuesta fue buena o mala.
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
RETRY_NEUTRAL_MESSAGE = "Puedes volver a elegir en esta escena."


def _decision_response(attempt, attempt_token, decision, effects, message, rules, retry_required=False):
    """La respuesta de una decisión (C2): consecuencia narrativa y, según la regla, lo evaluativo.

    Con ``FEEDBACK_AT_CLOSE_ONLY`` (o ``feedbackTiming = AT_CLOSE`` en la versión) la forma es
    ``{attempt, consequence, retry?}`` y no viaja clasificación, deltas ni mensaje evaluativo:
    llegan en el reporte al cierre. Con la bandera apagada se conserva la forma de siempre
    (``attemptState`` con ``feedback``) y se **añaden** ``consequence`` y ``retry``. Un reintento
    no aplicó nada, así que no tiene consecuencia (``consequence: null``).
    """
    at_close = case_rules.feedback_at_close_only(rules)
    consequence = None if retry_required else dto.consequence_dto(decision)
    retry = None
    if retry_required:
        retry = {"allowed": True, "message": RETRY_NEUTRAL_MESSAGE if at_close else message}
    if at_close:
        response = {"attempt": _state(attempt, attempt_token, None), "consequence": consequence}
        if retry:
            response["retry"] = retry
        return response
    feedback = dto.feedback_dto(decision, effects, message, retry_required=retry_required)
    response = _state(attempt, attempt_token, feedback)
    response["consequence"] = consequence
    if retry:
        response["retry"] = retry
    return response


def _replayed_decision_state(attempt, attempt_token, event):
    """La respuesta de una decisión ya procesada, reconstruida desde su evento y el estado actual."""
    decision = event.decision_option
    effects = decision_effects.resolve(decision)
    rules = case_rules.rules_of(attempt.case_version)
    if event.event_type in case_effects.RETRY_EVENT_TYPES:
        return _decision_response(
            attempt, attempt_token, decision, effects, event.detail, rules, retry_required=True
        )
    message = decision_effects.format_feedback(decision, effects)
    return _decision_response(attempt, attempt_token, decision, effects, message, rules)


@locked_attempt
def choose_decision(
    attempt_id, attempt_token, decision_option_id, actor,
    evidence_override=False, missing_evidence=None, request_id=None,
):
    attempt = _require_attempt(attempt_id, attempt_token, actor)
    request_id = normalize_request_id(request_id)
    # La repetición se resuelve ANTES de la guarda de estado: un doble clic sobre la decisión que
    # cerró el intento recibe la respuesta de la primera vez, no «el intento ya no acepta decisiones».
    replay = _find_decision_replay(attempt, decision_option_id, request_id)
    if replay is not None:
        return _replayed_decision_state(attempt, attempt_token, replay)
    if not lifecycle.state_of(attempt).plays:
        raise ValidationError("El intento ya no acepta decisiones")
    attempt_duration.touch(attempt, timezone.now())  # solo en memoria; se guarda con el intento

    decision = (
        DecisionOption.objects.filter(pk=decision_option_id)
        .select_related("source_node", "target_node", "case_version")
        .first()
    )
    if not decision:
        raise NotFound("Decisión no encontrada")
    if decision.source_node_id != attempt.current_node_id:
        raise ValidationError("La decisión no está disponible desde la escena actual")
    if decision.case_version_id != attempt.case_version_id:
        raise ValidationError("La decisión no pertenece al caso del intento")

    effects = decision_effects.resolve(decision)
    rules = case_rules.rules_of(attempt.case_version)
    is_bad_answer = decision.prohibited_conduct or decision.classification in {"RISKY", "INADEQUATE"}
    if is_bad_answer and rules.second_chance:
        # Regla de 2 oportunidades por escena/cuestionario (``rules.secondChance``, E1-7): la
        # PRIMERA respuesta riesgosa/inadecuada concede una segunda (y última) oportunidad sin
        # cambiar métricas ni avanzar el DAG. Si la SEGUNDA también es mala, ya no se reintenta:
        # queda registrada y avanza (cae al bloque de commit). Sin la regla, se registra al instante.
        prior_retries = AttemptEvent.objects.filter(
            attempt_id=attempt.id,
            node_id=attempt.current_node_id,
            event_type__in=case_effects.RETRY_EVENT_TYPES,
        ).count()
        if prior_retries == 0:
            message = (
                "La respuesta seleccionada puede ser riesgosa o inadecuada para este momento. "
                "Tienes una última oportunidad para volver a responder esta escena."
            )
            event_type = (
                "PROHIBITED_DECISION_RETRY_REQUIRED"
                if decision.prohibited_conduct
                else "DECISION_RETRY_REQUIRED"
            )
            # Trazado para revisión/rúbrica docente; sin cambios de métricas ni avance.
            _save_event(attempt, event_type, decision.source_node, decision, 0, 0, message, request_id)
            attempt.save(update_fields=attempt_duration.ACTIVITY_FIELDS)  # el reintento también es actividad
            return _decision_response(
                attempt, attempt_token, decision, effects, message, rules, retry_required=True
            )

    decision_effects.apply(attempt, effects)
    # Efecto mariposa del caso: flags clínicos + métricas acumulativas (se
    # aplica ANTES de avanzar el nodo — el world state sigue sincronizado al
    # nodo actual y el próximo /world hará el reset de sala que corresponda).
    case_effects.apply_case_effects(attempt, decision)
    event_type = "PROHIBITED_DECISION_SELECTED" if decision.prohibited_conduct else "DECISION_SELECTED"

    message = decision_effects.format_feedback(decision, effects)
    # Las etiquetas del override son trazabilidad para el docente: se guardan
    # solo en el evento; el mensaje que ve el jugador no las lleva.
    event_detail = message
    if evidence_override:
        labels = _override_evidence_labels(missing_evidence)
        if labels:
            event_detail = f"{message} | Override de evidencia: {', '.join(labels)}"
    attempt.current_node = decision.target_node

    _save_event(
        attempt, event_type, decision.source_node, decision,
        effects.score_delta, effects.stress_delta, event_detail, request_id,
    )
    _save_event(attempt, "NODE_ENTERED", decision.target_node, None, 0, 0, "Nodo visitado")

    if decision.target_node.terminal_node:
        now = timezone.now()
        lifecycle.apply(attempt, lifecycle.COMPLETE)
        attempt.ended_at = now
        attempt.locked_at = now
        _lock_reflections(attempt)

    attempt.save()

    if attempt.status == AttemptStatus.COMPLETED:
        _save_event(attempt, "ATTEMPT_COMPLETED", decision.target_node, None, 0, 0, "Intento finalizado")
        # E1-8: el reporte queda congelado en la misma transacción que cierra el intento.
        attempt_report.freeze_report(attempt)
        # P-13: se anuncia el hecho; quien reacciona (progresión, hoy) se suscribe. Síncrona y
        # dentro de esta transacción, y robusta: un suscriptor que falla no rompe la decisión.
        attempt_completed.send_robust(sender=SimulationAttempt, attempt=attempt)

    return _decision_response(attempt, attempt_token, decision, effects, message, rules)


@locked_attempt
def save_reflection(attempt_id, attempt_token, node_id, text, actor, request_id=None):
    attempt = _require_attempt(attempt_id, attempt_token, actor)
    request_id = normalize_request_id(request_id)
    if request_id:
        previous = AttemptEvent.objects.filter(attempt_id=attempt.id, request_id=request_id).first()
        if previous is not None:
            if previous.event_type != "REFLECTION_SAVED" or previous.node_id != node_id:
                raise request_id_reused()
            saved = ReflectionJournal.objects.filter(attempt_id=attempt.id, node_id=node_id).first()
            return {"nodeId": node_id, "locked": bool(saved and saved.locked)}
    if not lifecycle.state_of(attempt).plays:
        raise ValidationError("La bitácora ya está bloqueada")
    if not text or not text.strip():
        raise ValidationError("La bitácora requiere texto")
    node = SimulationNode.objects.filter(pk=node_id).select_related("case_version").first()
    if not node:
        raise NotFound("Nodo no encontrado")
    if node.case_version_id != attempt.case_version_id:
        raise ValidationError("El nodo no pertenece al caso del intento")

    reflection = ReflectionJournal.objects.filter(attempt_id=attempt.id, node_id=node.id).first()
    if reflection and reflection.locked:
        raise ValidationError("La bitácora ya está bloqueada")
    if not reflection:
        reflection = ReflectionJournal(attempt=attempt, node=node)
    reflection.encrypted_text = crypto_service.encrypt(text)
    reflection.encryption_key_ref = crypto_service.key_ref()
    reflection.locked = False  # la guarda de arriba ya exige que el intento esté en juego
    reflection.save()

    attempt_duration.record_activity(attempt)
    _save_event(attempt, "REFLECTION_SAVED", node, None, 0, 0, "Bitácora registrada", request_id)
    return {"nodeId": node.id, "locked": reflection.locked}


@locked_attempt
def safe_exit(attempt_id, attempt_token, reason, actor):
    """Pausa reanudable real (ETH-02, opción A).

    No fija ended_at/locked_at ni bloquea reflexiones: el intento queda en
    PAUSED y puede reanudarse con el mismo attemptId. Idempotente: repetir la
    llamada devuelve el estado sin duplicar eventos. No revalida la asignación:
    la salida segura siempre es alcanzable (REGLA-004).
    """
    attempt = _require_attempt(attempt_id, attempt_token, actor, enforce_assignment=False)
    if not lifecycle.state_of(attempt).can(lifecycle.PAUSE):
        return _state(attempt, attempt_token, None)
    attempt_duration.touch(attempt, timezone.now())  # suma hasta la pausa; lo que siga no cuenta
    lifecycle.apply(attempt, lifecycle.PAUSE)
    attempt.save()
    detail = reason if (reason and reason.strip()) else "Salida segura solicitada"
    _save_event(attempt, "SAFE_EXIT_REQUESTED", attempt.current_node, None, 0, 0, detail)
    return _state(attempt, attempt_token, None)


@locked_attempt
def resume_attempt(attempt_id, attempt_token, actor):
    """Reanuda un intento pausado (mismo attemptId, estado intacto).

    Idempotente: reanudar un intento ya IN_PROGRESS devuelve su estado sin
    registrar un segundo evento. Cualquier otro estado es un error explícito.
    """
    attempt = _require_attempt(attempt_id, attempt_token, actor)
    state = lifecycle.state_of(attempt)
    if state.plays:
        return _state(attempt, attempt_token, None)
    if not state.can(lifecycle.RESUME):
        raise ValidationError("Solo un intento en pausa segura puede reanudarse")
    lifecycle.apply(attempt, lifecycle.RESUME)
    attempt_duration.reset_clock(attempt, timezone.now())  # el tiempo en pausa no es tiempo activo
    attempt.save()
    _save_event(attempt, "ATTEMPT_RESUMED", attempt.current_node, None, 0, 0, "Intento reanudado tras pausa segura")
    return _state(attempt, attempt_token, None)


def get_progress_map(attempt_id, attempt_token, actor):
    attempt = _require_attempt(attempt_id, attempt_token, actor)
    case_version_id = attempt.case_version_id

    all_nodes = list(SimulationNode.objects.filter(case_version_id=case_version_id).order_by("id"))
    edges = DecisionOption.objects.filter(case_version_id=case_version_id).order_by("id").values_list(
        "source_node_id", "target_node_id"
    )
    ordered = BreadthFirstNodeIterator(all_nodes, edges)

    visited_keys = list(dict.fromkeys(
        ev.node.node_key
        for ev in AttemptEvent.objects.filter(attempt_id=attempt_id, event_type="NODE_ENTERED")
        .select_related("node").order_by("occurred_at", "id")
        if ev.node_id
    ))

    return {
        "nodes": [dto.progress_map_node(n) for n in ordered],
        "visitedNodeKeys": visited_keys,
        "currentNodeKey": attempt.current_node.node_key,
    }


# ─── Audit instrumentation (parity with Spring @Auditable) ───────────────────
start_attempt = auditable("ATTEMPT_STARTED", "CASE_VERSION")(start_attempt)
choose_decision = auditable("DECISION_SELECTED", "ATTEMPT")(choose_decision)
save_reflection = auditable("REFLECTION_SAVED", "ATTEMPT")(save_reflection)
safe_exit = auditable("SAFE_EXIT_REQUESTED", "ATTEMPT")(safe_exit)
resume_attempt = auditable("ATTEMPT_RESUMED", "ATTEMPT")(resume_attempt)
