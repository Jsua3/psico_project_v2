"""Builds the per-actor case catalog with linear unlock state.

Published cases form the linear sequence, ordered by **case** (its creation order) and then
by version: a new version of an earlier case keeps that case's place (E1-11; the order used
to follow the version's ``created_at``). A student sees only the cases assigned to them by
their active groups (RF-15, RN-04); within that sequence, case i is unlocked iff the student
completed case i-1 (the first is always unlocked). PROFESOR/ADMIN see everything unlocked.

The server enforces the same rule when a student starts an attempt (``is_case_unlocked``);
``sort_order`` on the assignment replaces this ordering in E3-1.
"""
from apps.grupos.assignments import assigned_case_version_ids
from apps.simulation.models import CaseVersion

from .models import StudentCaseCompletion


def _is_staff(actor):
    return getattr(actor, "role", None) in ("PROFESOR", "ADMIN")


def unlock_states(actor):
    """Los casos publicados del actor, en orden de secuencia, con su estado de desbloqueo."""
    versions = CaseVersion.objects.filter(status="PUBLISHED", simulation_case__active=True)
    is_staff = _is_staff(actor)
    if not is_staff:
        versions = versions.filter(id__in=assigned_case_version_ids(actor.id))
    versions = list(versions.select_related("simulation_case").order_by("simulation_case_id", "id"))
    completed_ids = set()
    if not is_staff:
        completed_ids = set(
            StudentCaseCompletion.objects.filter(student_id=actor.id)
            .values_list("simulation_case_id", flat=True)
        )

    items = []
    prev_completed = True  # case 0 always unlocked
    for order, v in enumerate(versions):
        case_id = v.simulation_case_id
        completed = case_id in completed_ids
        unlocked = True if is_staff else prev_completed
        items.append({
            "caseVersionId": v.id,
            "code": v.simulation_case.code,
            "title": v.simulation_case.title,
            "description": v.simulation_case.description,
            "order": order,
            "unlocked": unlocked,
            "completed": completed,
            "locked": not unlocked,
        })
        prev_completed = True if is_staff else completed
    return items


def build_catalog(actor):
    return unlock_states(actor)


def is_case_unlocked(actor, case_version_id):
    """¿Puede este actor iniciar esa versión según la secuencia lineal? (SIEP-RF-12).

    Un caso que no está en su secuencia (no asignado, no publicado o dado de baja) no cuenta
    como desbloqueado: quien llama decide qué error corresponde a cada razón.
    """
    for item in unlock_states(actor):
        if item["caseVersionId"] == case_version_id:
            return item["unlocked"]
    return False
