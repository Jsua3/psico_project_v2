"""La única consulta de acceso: asignación, ventana y secuencia (E3-2; RN-04, RF-15, decisión 12).

``access_decision(student, case_version_id, now)`` responde si el estudiante puede **iniciar** esa
versión y, si no, por qué. Es lo que consultan el catálogo, el lobby y el inicio de un intento:
ninguna otra capa vuelve a decidir la habilitación.

Reglas:

- **Asignación y ventana** (``apps.grupos.access``): ``NOT_ASSIGNED``, ``NOT_YET_OPEN``, ``CLOSED``.
- **Secuencia lineal** (SIEP-RF-12): un caso abierto se bloquea (``LOCKED_BY_SEQUENCE``) si el
  anterior de la secuencia no está completado. La secuencia ordena por ``(sort_order, caso,
  versión)`` los casos publicados y activos que el estudiante tiene asignados. Un anterior
  **cerrado y sin completar no bloquea** (R4: cerrar una ventana no deja sin avanzar al resto);
  uno programado o abierto sin completar, sí.
- **Un intento abierto se deja terminar** (decisión 12): si el estudiante ya tiene uno en juego o
  en pausa de esa versión y la asignación sigue activa, la decisión es «permitido» aunque la
  ventana haya cerrado o la secuencia ya no lo habilite. Quitarle la asignación sí lo bloquea.

El personal (PROFESOR/ADMIN) siempre pasa.
"""
from dataclasses import dataclass, replace

from apps.grupos.access import (
    CLOSED,
    LOCKED_BY_SEQUENCE,
    NOT_ASSIGNED_DECISION,
    AccessDecision,
    assignment_decisions,
)
from apps.simulation.models import CaseVersion, SimulationAttempt
from apps.simulation.models.attempt import OPEN_ATTEMPT_STATUSES

from .models import StudentCaseCompletion

ALLOWED_FOR_STAFF = AccessDecision(True)


def is_staff(actor):
    return getattr(actor, "role", None) in ("PROFESOR", "ADMIN")


@dataclass(frozen=True)
class SequenceItem:
    """Un caso de la secuencia del estudiante, ya decidido."""

    version: object
    decision: AccessDecision
    completed: bool
    order: int


def sequence_of(student, now=None):
    """La secuencia del estudiante: sus casos publicados y activos, en orden, con su decisión."""
    decisions = assignment_decisions(student.id, now=now)
    if not decisions:
        return []
    versions = (
        CaseVersion.objects.filter(
            pk__in=list(decisions), status="PUBLISHED", simulation_case__active=True
        )
        .select_related("simulation_case")
    )
    ordered = sorted(
        versions,
        key=lambda v: (decisions[v.id].sort_order, v.simulation_case_id, v.id),
    )
    completed_cases = set(
        StudentCaseCompletion.objects.filter(student_id=student.id)
        .values_list("simulation_case_id", flat=True)
    )
    open_versions = set(
        SimulationAttempt.objects.filter(
            student_id=student.id,
            status__in=OPEN_ATTEMPT_STATUSES,
            case_version_id__in=list(decisions),
        ).values_list("case_version_id", flat=True)
    )

    items = []
    previous_done = True  # el primero de la secuencia siempre queda libre de ella
    for index, version in enumerate(ordered):
        by_window = decisions[version.id]
        completed = version.simulation_case_id in completed_cases
        if version.id in open_versions:
            decision = replace(by_window, allowed=True, reason=None)  # se deja terminar
        elif not by_window.allowed:
            decision = by_window
        elif not previous_done:
            decision = replace(by_window, allowed=False, reason=LOCKED_BY_SEQUENCE)
        else:
            decision = by_window
        items.append(SequenceItem(version, decision, completed, index))
        if completed:
            previous_done = True
        elif by_window.reason == CLOSED:
            pass  # cerrado y sin completar: no bloquea al siguiente (R4)
        else:
            previous_done = False
    return items


def access_map(actor, case_version_ids, now=None):
    """``{case_version_id: AccessDecision}`` de las versiones pedidas, en pocas consultas."""
    ids = list(case_version_ids)
    if is_staff(actor):
        return {version_id: ALLOWED_FOR_STAFF for version_id in ids}
    by_sequence = {item.version.id: item.decision for item in sequence_of(actor, now)}
    missing = [version_id for version_id in ids if version_id not in by_sequence]
    by_assignment = assignment_decisions(actor.id, missing, now) if missing else {}
    result = {}
    for version_id in ids:
        if version_id in by_sequence:
            result[version_id] = by_sequence[version_id]
        else:
            # Asignada pero fuera de la secuencia (sin publicar o dada de baja) o sin asignar.
            result[version_id] = by_assignment.get(version_id, NOT_ASSIGNED_DECISION)
    return result


def access_decision(actor, case_version_id, now=None):
    """La decisión de acceso del actor a una versión (la única consulta de habilitación)."""
    return access_map(actor, [case_version_id], now)[case_version_id]
