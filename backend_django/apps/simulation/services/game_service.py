"""Port of Spring's SimulationGameService — the DAG state machine."""
import base64
import hashlib
import secrets

from django.db import connection, transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.simulation.models import (
    INITIAL_STRESS_INDEX,
    INITIAL_USER_TRUST,
    INITIAL_VICTIM_RISK,
    AttemptEvent,
    AttemptStatus,
    CaseVersion,
    DecisionOption,
    ReflectionJournal,
    SimulationAttempt,
    SimulationNode,
)
from apps.simulation.serializers import game_dtos as dto
from apps.simulation.signals import attempt_completed
from . import attempt_lifecycle as lifecycle
from . import case_effects, crypto_service, decision_effects
from .attempt_duration import active_duration_seconds
from .audit_service import auditable
from .instructor_scope import student_ids_for_instructor
from .node_iterator import BreadthFirstNodeIterator


def _hash_token(raw_token: str) -> str:
    digest = hashlib.sha256(raw_token.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _new_token() -> str:
    return secrets.token_urlsafe(32)


def _save_event(attempt, event_type, node, decision, score_delta, stress_delta, detail):
    AttemptEvent.objects.create(
        attempt=attempt,
        event_type=event_type,
        node=node,
        decision_option=decision,
        score_delta=score_delta,
        stress_delta=stress_delta,
        detail=detail,
    )


def _lock_reflections(attempt):
    ReflectionJournal.objects.filter(attempt_id=attempt.id).update(
        locked=True, updated_at=timezone.now()
    )


def _require_published(case_version_id):
    version = CaseVersion.objects.filter(pk=case_version_id).select_related("simulation_case").first()
    if not version:
        raise NotFound("Versión de caso no encontrada")
    if version.status != "PUBLISHED" or not version.simulation_case.active:
        raise PermissionDenied("El caso no está publicado")
    return version


def _require_attempt(attempt_id, attempt_token, actor):
    if not attempt_token:
        raise ValidationError("El token del intento es obligatorio")
    attempt = (
        SimulationAttempt.objects.filter(
            pk=attempt_id, attempt_token_hash=_hash_token(attempt_token)
        )
        .select_related("case_version__simulation_case", "current_node", "student")
        .first()
    )
    if not attempt:
        raise NotFound("Intento no encontrado")
    owner = attempt.student_id == actor.id
    staff = actor.role in ("ADMIN", "PROFESOR")
    if not owner and not staff:
        raise PermissionDenied("No tiene acceso a este intento")
    return attempt


def _reissue_token(attempt):
    raw = _new_token()
    attempt.attempt_token_hash = _hash_token(raw)
    attempt.save(update_fields=["attempt_token_hash"])
    return raw


def assigned_case_version_ids(student_id):
    """Versiones de caso asignadas al estudiante por sus grupos activos (RN-04)."""
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT gcv.case_version_id
            FROM grupo_estudiante ge
            INNER JOIN grupos g ON g.id = ge.grupo_id AND g.activo = TRUE
            INNER JOIN grupo_case_version gcv ON gcv.grupo_id = ge.grupo_id
            WHERE ge.estudiante_id = %s
            """,
            [student_id],
        )
        return [row[0] for row in cur.fetchall()]


def _student_can_access_case(student_id, case_version_id):
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT 1
            FROM grupo_estudiante ge
            INNER JOIN grupos g ON g.id = ge.grupo_id AND g.activo = TRUE
            INNER JOIN grupo_case_version gcv ON gcv.grupo_id = ge.grupo_id
            WHERE ge.estudiante_id = %s AND gcv.case_version_id = %s
            LIMIT 1
            """,
            [student_id, case_version_id],
        )
        return cur.fetchone() is not None


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


def _close_active_attempts(student_id, case_version_id, reason):
    # Reemplazar con forceNew cierra de forma TERMINAL tanto los intentos en
    # progreso como los pausados (la pausa reanudable deja de tener sentido).
    # Es un reemplazo, no una salida segura: estado y evento propios.
    actives = SimulationAttempt.objects.filter(
        student_id=student_id, case_version_id=case_version_id,
        status__in=lifecycle.OPEN_STATUSES,
    ).select_related("current_node")
    now = timezone.now()
    for active in actives:
        lifecycle.apply(active, lifecycle.REPLACE)
        active.ended_at = now
        active.locked_at = now
        active.save()
        _lock_reflections(active)
        _save_event(active, "ATTEMPT_REPLACED", active.current_node, None, 0, 0, reason)


@transaction.atomic
def start_attempt(case_version_id, actor, force_new=False):
    version = _require_published(case_version_id)
    if getattr(actor, "role", None) == "ESTUDIANTE" and not _student_can_access_case(actor.id, case_version_id):
        raise PermissionDenied("El caso no ha sido asignado a tu grupo")

    if not force_new:
        # Un intento pausado también cuenta como activo: nunca se duplica en
        # silencio; el cliente debe reanudarlo o pedir forceNew explícito.
        active = (
            SimulationAttempt.objects.filter(
                student_id=actor.id, case_version_id=case_version_id,
                status__in=lifecycle.OPEN_STATUSES,
            )
            .select_related("case_version__simulation_case", "current_node")
            .order_by("-started_at")
            .first()
        )
        if active:
            return dto.attempt_state(active, _reissue_token(active), None)
    else:
        _close_active_attempts(actor.id, case_version_id, "Reemplazado por nuevo intento")

    start_node = SimulationNode.objects.filter(case_version_id=version.id, start_node=True).first()
    if not start_node:
        raise NotFound("El caso no tiene nodo inicial")

    raw_token = _new_token()
    attempt = SimulationAttempt.objects.create(
        attempt_token_hash=_hash_token(raw_token),
        case_version=version,
        student_id=actor.id,
        current_node=start_node,
        status=lifecycle.INITIAL_STATUS,
        accumulated_score=0,
        stress_index=INITIAL_STRESS_INDEX,
        victim_risk=INITIAL_VICTIM_RISK,
        user_trust=INITIAL_USER_TRUST,
        institutional_route_activated=False,
        revictimization_risk=False,
    )
    _save_event(attempt, "ATTEMPT_STARTED", start_node, None, 0, 0, "Intento iniciado")
    _save_event(attempt, "NODE_ENTERED", start_node, None, 0, 0, "Nodo inicial")
    return dto.attempt_state(attempt, raw_token, None)


def find_active_attempt(case_version_id, actor):
    _require_published(case_version_id)
    active = (
        SimulationAttempt.objects.filter(
            student_id=actor.id, case_version_id=case_version_id,
            status__in=lifecycle.OPEN_STATUSES,
        )
        .select_related("case_version__simulation_case", "current_node")
        .order_by("-started_at")
        .first()
    )
    if not active:
        return None
    return dto.attempt_state(active, _reissue_token(active), None)


def get_attempt(attempt_id, attempt_token, actor):
    attempt = _require_attempt(attempt_id, attempt_token, actor)
    return dto.attempt_state(attempt, attempt_token, None)


def get_completion_report(attempt_id, attempt_token, actor):
    attempt = _require_attempt(attempt_id, attempt_token, actor)
    if lifecycle.state_of(attempt).plays:
        raise ValidationError("El intento aún está en progreso")
    events = list(
        AttemptEvent.objects.filter(attempt_id=attempt.id)
        .select_related("node", "decision_option")
        .order_by("occurred_at", "id")
    )
    return dto.build_completion_report(attempt, events)


def list_attempt_history(actor):
    """Resumen de los intentos del propio estudiante (más recientes primero).

    Las cuentas de decisiones se calculan en una sola consulta agregada para
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
    counts = {
        aid: {"ADEQUATE": 0, "RISKY": 0, "INADEQUATE": 0, "PROHIBITED": 0}
        for aid in attempt_ids
    }
    # Solo decisiones registradas: los reintentos no puntúan (misma regla que el reporte).
    decision_events = (
        AttemptEvent.objects.filter(
            attempt_id__in=attempt_ids,
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

    # El tiempo activo solo se calcula para intentos terminados (ended_at); un
    # intento en curso no lo necesita y sus eventos (posiciones del mundo) crecen
    # con el juego, así que no se cargan.
    finished_ids = [a.id for a in attempts if a.ended_at]
    event_marks = {}
    if finished_ids:
        for attempt_id, event_type, occurred_at in (
            AttemptEvent.objects.filter(attempt_id__in=finished_ids)
            .order_by("attempt_id", "occurred_at", "id")
            .values_list("attempt_id", "event_type", "occurred_at")
        ):
            event_marks.setdefault(attempt_id, []).append((event_type, occurred_at))

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
            "activeDurationSeconds": active_duration_seconds(
                a.started_at, a.ended_at, event_marks.get(a.id, [])
            ),
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
    if attempt.student_id != actor.id:
        # None = ADMIN (sin restricción); para el resto, solo los estudiantes de sus grupos.
        alcance = student_ids_for_instructor(actor)
        if alcance is not None and attempt.student_id not in alcance:
            raise PermissionDenied("No tiene acceso a este intento")
    events = list(
        AttemptEvent.objects.filter(attempt_id=attempt.id)
        .select_related("node", "decision_option")
        .order_by("occurred_at", "id")
    )
    return dto.build_completion_report(attempt, events)


def _override_evidence_labels(missing_evidence):
    labels = []
    for raw in missing_evidence or []:
        label = " ".join(str(raw).split())
        if label and label not in labels:
            labels.append(label)
    return labels


@transaction.atomic
def choose_decision(
    attempt_id, attempt_token, decision_option_id, actor,
    evidence_override=False, missing_evidence=None,
):
    attempt = _require_attempt(attempt_id, attempt_token, actor)
    if not lifecycle.state_of(attempt).plays:
        raise ValidationError("El intento ya no acepta decisiones")

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
    is_bad_answer = decision.prohibited_conduct or decision.classification in {"RISKY", "INADEQUATE"}
    if is_bad_answer:
        # Regla de 2 oportunidades por escena/cuestionario: la PRIMERA respuesta
        # riesgosa/inadecuada concede una segunda (y última) oportunidad sin
        # cambiar métricas ni avanzar el DAG. Si la SEGUNDA también es mala, ya
        # no se reintenta: queda registrada y avanza (cae al bloque de commit).
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
            _save_event(attempt, event_type, decision.source_node, decision, 0, 0, message)
            feedback = dto.feedback_dto(decision, effects, message, retry_required=True)
            return dto.attempt_state(attempt, attempt_token, feedback)

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

    _save_event(attempt, event_type, decision.source_node, decision, effects.score_delta, effects.stress_delta, event_detail)
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
        # P-13: se anuncia el hecho; quien reacciona (progresión, hoy) se suscribe. Síncrona y
        # dentro de esta transacción, y robusta: un suscriptor que falla no rompe la decisión.
        attempt_completed.send_robust(sender=SimulationAttempt, attempt=attempt)

    feedback = dto.feedback_dto(decision, effects, message)
    return dto.attempt_state(attempt, attempt_token, feedback)


@transaction.atomic
def save_reflection(attempt_id, attempt_token, node_id, text, actor):
    attempt = _require_attempt(attempt_id, attempt_token, actor)
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

    _save_event(attempt, "REFLECTION_SAVED", node, None, 0, 0, "Bitácora registrada")
    return {"nodeId": node.id, "locked": reflection.locked}


@transaction.atomic
def safe_exit(attempt_id, attempt_token, reason, actor):
    """Pausa reanudable real (ETH-02, opción A).

    No fija ended_at/locked_at ni bloquea reflexiones: el intento queda en
    PAUSED y puede reanudarse con el mismo attemptId. Idempotente: repetir la
    llamada devuelve el estado sin duplicar eventos.
    """
    attempt = _require_attempt(attempt_id, attempt_token, actor)
    if not lifecycle.state_of(attempt).can(lifecycle.PAUSE):
        return dto.attempt_state(attempt, attempt_token, None)
    lifecycle.apply(attempt, lifecycle.PAUSE)
    attempt.save()
    detail = reason if (reason and reason.strip()) else "Salida segura solicitada"
    _save_event(attempt, "SAFE_EXIT_REQUESTED", attempt.current_node, None, 0, 0, detail)
    return dto.attempt_state(attempt, attempt_token, None)


@transaction.atomic
def resume_attempt(attempt_id, attempt_token, actor):
    """Reanuda un intento pausado (mismo attemptId, estado intacto).

    Idempotente: reanudar un intento ya IN_PROGRESS devuelve su estado sin
    registrar un segundo evento. Cualquier otro estado es un error explícito.
    """
    attempt = _require_attempt(attempt_id, attempt_token, actor)
    state = lifecycle.state_of(attempt)
    if state.plays:
        return dto.attempt_state(attempt, attempt_token, None)
    if not state.can(lifecycle.RESUME):
        raise ValidationError("Solo un intento en pausa segura puede reanudarse")
    lifecycle.apply(attempt, lifecycle.RESUME)
    attempt.save()
    _save_event(attempt, "ATTEMPT_RESUMED", attempt.current_node, None, 0, 0, "Intento reanudado tras pausa segura")
    return dto.attempt_state(attempt, attempt_token, None)


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
