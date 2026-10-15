"""Suscriptores de progresión a los hechos del simulador (P-13 · Observer)."""
from rest_framework import status

from apps.grupos.access import CLOSED, LOCKED_BY_SEQUENCE, NOT_ASSIGNED, NOT_YET_OPEN
from apps.grupos.assignments import format_window_value
from shared.exceptions import ApiError

from .access import access_decision
from .services import record_case_completion

#: razón de la decisión de acceso → (código estable del 403, texto). Todos son borradores (VD-23).
_REFUSALS = {
    NOT_ASSIGNED: (
        "ACCESS_NOT_ASSIGNED",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        "Ya no tienes este caso asignado. Consúltalo con tu docente.",
    ),
    NOT_YET_OPEN: (
        "ACCESS_NOT_YET_OPEN",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        "Este caso aún no está abierto.",
    ),
    CLOSED: (
        "ACCESS_CLOSED",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        "El plazo de este caso ya terminó.",
    ),
    LOCKED_BY_SEQUENCE: (
        "ACCESS_LOCKED_BY_SEQUENCE",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        "Este caso se desbloquea al completar el anterior.",
    ),
}


def enforce_access_on_start(sender, student, case_version_id, replacing=False, **kwargs):
    """SIEP-RF-12, RN-04: iniciar un intento nuevo exige que la decisión de acceso lo permita (403).

    ``replacing``: «empezar de nuevo» sobre un intento abierto; el que se reemplaza no cuenta como
    excepción (se deja terminar, no reiniciar).
    """
    decision = access_decision(student, case_version_id, ignore_open_attempt=replacing)
    if decision.allowed:
        return
    code, message = _REFUSALS[decision.reason]
    extra = {}
    if decision.opens_at is not None:
        extra["opensAt"] = format_window_value(decision.opens_at)
    if decision.closes_at is not None:
        extra["closesAt"] = format_window_value(decision.closes_at)
    raise ApiError(code, message, status.HTTP_403_FORBIDDEN, **extra)


def record_completion_on_attempt_completed(sender, attempt, **kwargs):
    """Un intento se completó: el estudiante tiene el caso terminado (idempotente, no lanza)."""
    record_case_completion(attempt.student_id, attempt.case_version.simulation_case_id)
