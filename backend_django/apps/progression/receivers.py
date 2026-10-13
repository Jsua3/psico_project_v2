"""Suscriptores de progresión a los hechos del simulador (P-13 · Observer)."""
from rest_framework import status

from shared.exceptions import ApiError

from .catalog import is_case_unlocked
from .services import record_case_completion


def enforce_linear_unlock_on_start(sender, student, case_version_id, **kwargs):
    """SIEP-RF-12: un caso bloqueado por la secuencia no se puede iniciar (403)."""
    if not is_case_unlocked(student, case_version_id):
        raise ApiError(
            "ACCESS_LOCKED_BY_SEQUENCE",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Este caso se desbloquea al completar el anterior.",
            status.HTTP_403_FORBIDDEN,
        )


def record_completion_on_attempt_completed(sender, attempt, **kwargs):
    """Un intento se completó: el estudiante tiene el caso terminado (idempotente, no lanza)."""
    record_case_completion(attempt.student_id, attempt.case_version.simulation_case_id)
