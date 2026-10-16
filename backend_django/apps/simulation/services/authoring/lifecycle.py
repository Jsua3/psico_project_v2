"""Ciclo de vida de la versión del caso (E2-5, §3.3 del plan estructural) ⇢ contrato C4.

El estado vive en la **versión** (REGLA-005: lo publicado no se edita, se clona):

    DRAFT ──submit──▶ IN_REVIEW ──approve──▶ PUBLISHED ──archive──▶ ARCHIVED
      ▲                   │ reject (ADMIN, con motivo FORMA|CONTENIDO y nota)
      └───────────────────┘                  DRAFT ──archive──▶ ARCHIVED
                       «volver a borrador» = clone (de PUBLISHED o ARCHIVED)

La parte de arriba es una **máquina pura** (``can_transition``, ``allowed_transitions``) que
toma sus permisos de la matriz de políticas; la de abajo son las transiciones, cada una bajo
``SELECT … FOR UPDATE`` de la versión, con su fila en ``case_reviews`` y su auditoría.

Banderas (R4): con ``REVIEW_WORKFLOW_STRICT`` apagada, ``approve`` también publica un
borrador (el atajo del editor de hoy) y la constancia es opcional; encendida, solo se
publica desde ``IN_REVIEW`` y con la constancia de revisión de contenido de Psicología.
"""
import datetime
from types import SimpleNamespace

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status as http

from apps.simulation.models import CaseReview, CaseVersion
from apps.simulation.models.case import ReviewDecision, ReviewReason
from apps.simulation.services import validation_issues
from shared import policies
from shared.exceptions import ApiError

from .editor_view import latest_checklist_ratio
from .guards import check_revision, revision_bump
from .world_definition import run_world_validation

DRAFT = "DRAFT"
IN_REVIEW = "IN_REVIEW"
PUBLISHED = "PUBLISHED"
ARCHIVED = "ARCHIVED"
STATES = (DRAFT, IN_REVIEW, PUBLISHED, ARCHIVED)

#: En el orden en que se ofrecen al cliente (``allowedTransitions``).
ACTIONS = ("submit", "approve", "reject", "archive", "clone")

#: acción → (estados desde los que se puede, acción de la matriz de políticas ``case.<acción>``)
RULES = {
    "submit": ((DRAFT,), "submit"),
    "approve": ((IN_REVIEW,), "publish"),
    "reject": ((IN_REVIEW,), "publish"),
    "archive": ((DRAFT, PUBLISHED), "archive"),
    "clone": ((PUBLISHED, ARCHIVED), "author"),
}
POLICY_ACTION = {action: policy for action, (_, policy) in RULES.items()}


# ─── Máquina pura ─────────────────────────────────────────────────────────────────────────
def can_transition(state, action, *, role, is_author):
    """¿Puede alguien con ``role`` (y que es o no la autora del caso) hacer ``action`` desde ``state``?"""
    rule = RULES.get(action)
    if rule is None or state not in rule[0]:
        return False
    actor = SimpleNamespace(id=1, role=role, is_authenticated=True)
    return policies.can(actor, "case", rule[1], owner_id=1 if is_author else 2)


def allowed_transitions(state, *, role, is_author):
    return [a for a in ACTIONS if can_transition(state, a, role=role, is_author=is_author)]


# ─── Transiciones ─────────────────────────────────────────────────────────────────────────
def _lock_version(case_version_id):
    """La versión bajo ``FOR UPDATE`` (serializa dos transiciones sobre el mismo caso)."""
    from rest_framework.exceptions import NotFound

    version = (
        CaseVersion.objects.select_for_update(of=("self",))
        .select_related("simulation_case")
        .filter(pk=case_version_id)
        .first()
    )
    if version is None:
        raise NotFound("Version de caso no encontrada")
    return version


def _is_author(actor, version):
    return version.simulation_case.created_by_id == actor.id


def _require_transition(version, action, actor):
    """403 si la persona no puede esa acción nunca; 409 ``INVALID_TRANSITION`` si es el estado."""
    is_author = _is_author(actor, version)
    if can_transition(version.status, action, role=actor.role, is_author=is_author):
        return
    if any(can_transition(s, action, role=actor.role, is_author=is_author) for s in STATES):
        raise ApiError(
            "INVALID_TRANSITION",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            f"No se puede aplicar «{action}» a una versión en estado {version.status}.",
            http.HTTP_409_CONFLICT,
            state=version.status,
            action=action,
        )
    raise ApiError(
        "CASE_TRANSITION_FORBIDDEN",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        "No tienes permiso para esta transición del caso.",
        http.HTTP_403_FORBIDDEN,
    )


def publishing_blockers(version):
    """Lo que impide enviar o aprobar: lista incompleta y errores de validación del mundo."""
    blockers = []
    if latest_checklist_ratio(version.id) < 100:
        blockers.append({
            "code": "CHECKLIST_INCOMPLETE",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "message": "El checklist ético y académico debe estar al 100% antes de enviar el caso a revisión.",
        })
    errors = run_world_validation(version)["errors"]
    if errors:
        blockers.append({
            "code": "VALIDATION_ERRORS",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "message": f"El caso tiene {len(errors)} error(es) de validación que impiden publicarlo.",
            "issues": validation_issues.build_issues(errors),
        })
    return blockers


def _require_publishable(version):
    blockers = publishing_blockers(version)
    if blockers:
        raise ApiError(
            "CASE_NOT_PUBLISHABLE", blockers[0]["message"], http.HTTP_409_CONFLICT, blockers=blockers
        )


def _set_status(version, new_status, actor, **fields):
    """Cambia el estado, avanza la revisión y anota quién lo hizo, en una sola escritura."""
    CaseVersion.objects.filter(pk=version.pk).update(
        status=new_status, **revision_bump(actor.id), **fields
    )
    version.refresh_from_db()


def _pending_review(version):
    return CaseReview.objects.filter(case_version_id=version.pk, decision__isnull=True).first()


@transaction.atomic
def submit(case_version_id, actor, revision=None):
    version = _lock_version(case_version_id)
    check_revision(version, revision, actor.id)
    _require_transition(version, "submit", actor)
    _require_publishable(version)
    CaseReview.objects.create(case_version=version, requested_by=actor)
    _set_status(version, IN_REVIEW, actor)
    return lifecycle_view(version.pk, actor)


def _parse_content_review(payload, *, required):
    """La constancia de revisión de contenido: ``{reviewer, reviewedOn, reference}`` o ``None``."""
    def invalid(message=None):
        return ApiError(
            "CONTENT_REVIEW_REQUIRED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            message or "Falta la constancia de revisión de contenido de Psicología "
            "(revisor, fecha y referencia o acta).",
            http.HTTP_400_BAD_REQUEST,
            field="contentReview",
        )

    if not payload:
        if required:
            raise invalid()
        return None
    if not isinstance(payload, dict):
        raise invalid()
    reviewer = str(payload.get("reviewer") or "").strip()
    reference = str(payload.get("reference") or "").strip()
    raw_date = str(payload.get("reviewedOn") or "").strip()
    if not (reviewer and reference and raw_date):
        raise invalid()
    try:
        reviewed_on = datetime.date.fromisoformat(raw_date)
    except ValueError:
        raise invalid() from None
    if reviewed_on > timezone.now().date():
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise invalid("La fecha de la revisión de contenido no puede ser posterior a hoy.")
    return {"reviewer": reviewer[:255], "reviewed_on": reviewed_on, "reference": reference[:255]}


@transaction.atomic
def approve(case_version_id, actor, note="", content_review=None, revision=None):
    """Publica la versión: la decide el ADMIN, con la constancia de Psicología si es estricta."""
    version = _lock_version(case_version_id)
    check_revision(version, revision, actor.id)
    strict = settings.REVIEW_WORKFLOW_STRICT
    if version.status == DRAFT and not strict:
        # El atajo del editor de hoy: el ADMIN publica un borrador (con su fila de revisión).
        if not policies.can(actor, "case", "publish"):
            raise ApiError(
                "CASE_TRANSITION_FORBIDDEN",
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                "No tienes permiso para publicar casos.",
                http.HTTP_403_FORBIDDEN,
            )
    else:
        _require_transition(version, "approve", actor)
    _require_publishable(version)
    constancia = _parse_content_review(content_review, required=strict)

    review = _pending_review(version) or CaseReview(case_version=version, requested_by=actor)
    now = timezone.now()
    review.decided_by = actor
    review.decided_at = now
    review.decision = ReviewDecision.APPROVED
    review.note = (note or "").strip()
    if constancia:
        review.content_reviewer = constancia["reviewer"]
        review.content_reviewed_on = constancia["reviewed_on"]
        review.content_reference = constancia["reference"]
    review.save()
    _set_status(version, PUBLISHED, actor, published_at=now)
    return lifecycle_view(version.pk, actor)


@transaction.atomic
def reject(case_version_id, actor, reason, note, revision=None):
    """Devuelve la versión a borrador con motivo (FORMA | CONTENIDO) y una nota (consejo §9.1-B)."""
    version = _lock_version(case_version_id)
    check_revision(version, revision, actor.id)
    _require_transition(version, "reject", actor)
    if reason not in ReviewReason.values:
        raise ApiError(
            "VALIDATION_ERROR",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "El motivo debe ser FORMA o CONTENIDO.",
            http.HTTP_400_BAD_REQUEST,
            field="reason",
        )
    note = (note or "").strip()
    if not note:
        raise ApiError(
            "VALIDATION_ERROR",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Devolver un caso a borrador exige una nota para quien lo autora.",
            http.HTTP_400_BAD_REQUEST,
            field="note",
        )
    review = _pending_review(version) or CaseReview(case_version=version, requested_by=actor)
    review.decided_by = actor
    review.decided_at = timezone.now()
    review.decision = ReviewDecision.REJECTED
    review.reason = reason
    review.note = note
    review.save()
    _set_status(version, DRAFT, actor)
    return lifecycle_view(version.pk, actor)


def _lock_case_versions(case_version_id):
    """Cerrojo sobre TODAS las versiones del caso, en orden de id y antes que nada.

    Archivar «todo el caso» toca varias filas: dos órdenes sobre versiones distintas del mismo
    caso, si cada una tomara primero la suya, se cruzarían (interbloqueo). Con el mismo orden se
    serializan.
    """
    case_id = (
        CaseVersion.objects.filter(pk=case_version_id).values_list("simulation_case_id", flat=True).first()
    )
    if case_id is not None:
        list(
            CaseVersion.objects.select_for_update(of=("self",))
            .filter(simulation_case_id=case_id)
            .order_by("pk")
            .values_list("pk", flat=True)
        )


@transaction.atomic
def archive(case_version_id, actor, scope="version", revision=None):
    """Archiva la versión; con ``scope="case"``, también todas las demás versiones publicadas del caso.

    Los intentos abiertos de una versión archivada se pueden terminar; solo se cierra la puerta
    a los nuevos (decisión 11).
    """
    if scope not in ("version", "case"):
        raise ApiError(
            "VALIDATION_ERROR",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "El alcance debe ser version o case.",
            http.HTTP_400_BAD_REQUEST,
            field="scope",
        )
    if scope == "case":
        _lock_case_versions(case_version_id)
    version = _lock_version(case_version_id)
    check_revision(version, revision, actor.id)
    _require_transition(version, "archive", actor)
    _set_status(version, ARCHIVED, actor)
    if scope == "case":
        siblings = CaseVersion.objects.filter(
            simulation_case_id=version.simulation_case_id, status=PUBLISHED
        ).exclude(pk=version.pk)
        siblings.update(status=ARCHIVED, **revision_bump(actor.id))
    return lifecycle_view(version.pk, actor)


def clone(case_version_id, actor):
    """«Volver a borrador» es clonar: devuelve el ciclo de la **nueva** versión (REGLA-005)."""
    from . import publication  # perezoso: publication importa este módulo

    version = _lock_version(case_version_id)
    _require_transition(version, "clone", actor)
    new_version_id = publication.clone_version(case_version_id, actor)["caseVersionId"]
    return lifecycle_view(new_version_id, actor)


# ─── Vista (C4) ───────────────────────────────────────────────────────────────────────────
def _name(user):
    return f"{user.nombre} {user.apellido}".strip() if user else None


def _review_view(review):
    view = {
        "requestedBy": _name(review.requested_by),
        "requestedAt": review.requested_at.isoformat(),
    }
    if review.decision:
        view.update({
            "decision": review.decision,
            "decidedBy": _name(review.decided_by),
            "decidedAt": review.decided_at.isoformat() if review.decided_at else None,
            "note": review.note,
        })
        if review.reason:
            view["reason"] = review.reason
        if review.content_reference:
            view["contentReview"] = {
                "reviewer": review.content_reviewer,
                "reviewedOn": review.content_reviewed_on.isoformat() if review.content_reviewed_on else None,
                "reference": review.content_reference,
            }
    return view


def lifecycle_view(case_version_id, actor):
    """``CaseLifecycle`` (C4): estado, transiciones permitidas, motivo de bloqueo y última revisión."""
    version = CaseVersion.objects.select_related("simulation_case").get(pk=case_version_id)
    allowed = allowed_transitions(
        version.status, role=actor.role, is_author=_is_author(actor, version)
    )
    view = {"caseVersionId": version.pk, "state": version.status, "allowedTransitions": allowed}
    if "submit" in allowed or "approve" in allowed:
        blockers = publishing_blockers(version)
        if blockers:
            view["blockedReason"] = {"code": blockers[0]["code"], "message": blockers[0]["message"]}
    review = (
        CaseReview.objects.select_related("requested_by", "decided_by")
        .filter(case_version_id=version.pk)
        .order_by("-id")
        .first()
    )
    if review is not None:
        view["review"] = _review_view(review)
    return view
