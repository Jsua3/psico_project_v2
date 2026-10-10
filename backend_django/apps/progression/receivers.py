"""Suscriptores de progresión a los hechos del simulador (P-13 · Observer)."""
from .services import record_case_completion


def record_completion_on_attempt_completed(sender, attempt, **kwargs):
    """Un intento se completó: el estudiante tiene el caso terminado (idempotente, no lanza)."""
    record_case_completion(attempt.student_id, attempt.case_version.simulation_case_id)
