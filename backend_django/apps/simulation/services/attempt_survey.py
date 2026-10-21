"""La encuesta breve opcional al terminar un intento (E6-3, RQ-NEG-004; R14 de la fase, contrato C14).

Una respuesta por intento completado: ``rating`` entero de 1 a 5 y un comentario opcional de texto plano de hasta 500
caracteres. Existe solo si Psicología la aprueba: con ``ATTEMPT_FEEDBACK_SURVEY`` apagada (por defecto) los dos
endpoints responden 404 como si no existieran. La responde el DUEÑO del intento (otro estudiante recibe 404: no se
entera de que existe) y no pide el token del intento: cerrado, ya no protege nada.

Las respuestas, en este orden: 404 (apagada o intento ajeno) → 400 (``rating`` o ``comment`` inválidos, con el campo)
→ 409 ``ATTEMPT_NOT_COMPLETED`` → 409 ``FEEDBACK_ALREADY_SENT``. La unicidad es de la base (``attempt_id`` único): si
dos órdenes llegan a la vez, una guarda y la otra recibe el 409, no un 500.

El comentario es del estudiante: no viaja a ningún reporte, a la auditoría ni a la analítica (esta solo ve la
calificación, agregada y con celda mínima).
"""
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.exceptions import NotFound

from apps.simulation.assessment import definitions
from apps.simulation.models import AttemptFeedback, AttemptStatus, SimulationAttempt
from shared.exceptions import ApiError

from .text_rules import validate_plain_text

RATING_MIN, RATING_MAX = 1, 5
COMMENT_MAX_LENGTH = 500


def _invalid(message, field):
    return ApiError("VALIDATION_ERROR", message, status.HTTP_400_BAD_REQUEST, field=field)


def _require_enabled():
    if not definitions.survey_enabled():
        raise NotFound("Recurso no encontrado")


def _owned_attempt(attempt_id, actor):
    """El intento del estudiante; el de otro es un 404 (no se entera de que existe)."""
    attempt = SimulationAttempt.objects.filter(pk=attempt_id, student_id=actor.id).only("id", "status").first()
    if attempt is None:
        raise NotFound("Intento no encontrado")
    return attempt


def _rating(payload):
    rating = payload.get("rating")
    # ``type(...) is int`` deja fuera a los booleanos (que en Python son enteros), a 4.0 y a «4».
    if type(rating) is not int or not RATING_MIN <= rating <= RATING_MAX:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise _invalid(f"La calificación debe ser un número entero de {RATING_MIN} a {RATING_MAX}.", "rating")
    return rating


def _comment(payload):
    """El comentario limpio (o vacío): texto plano, sin marcado ni enlaces, de hasta 500 caracteres."""
    return validate_plain_text(payload.get("comment"), COMMENT_MAX_LENGTH, "comment", multiline=True)


def _answered(attempt_id):
    return AttemptFeedback.objects.filter(attempt_id=attempt_id).exists()


def _already_sent():
    return ApiError(
        "FEEDBACK_ALREADY_SENT",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        "Ya respondiste la encuesta de este intento.",
        status.HTTP_409_CONFLICT,
    )


def _state(response):
    return {
        "submitted": True,
        "rating": response.rating,
        "comment": response.comment,
        "submittedAt": response.created_at.isoformat(),
    }


def read(attempt_id, actor):
    """``GET …/attempts/{id}/feedback``: ``{submitted: false}`` o la respuesta ya guardada."""
    _require_enabled()
    attempt = _owned_attempt(attempt_id, actor)
    response = AttemptFeedback.objects.filter(attempt_id=attempt.id).first()
    return {"submitted": False} if response is None else _state(response)


def submit(attempt_id, payload, actor):
    """``POST …/attempts/{id}/feedback``: guarda la respuesta del dueño de un intento completado; una sola."""
    _require_enabled()
    attempt = _owned_attempt(attempt_id, actor)
    rating, comment = _rating(payload), _comment(payload)  # ``payload`` es un objeto: el analizador de JSON lo exige
    if attempt.status != AttemptStatus.COMPLETED:
        raise ApiError(
            "ATTEMPT_NOT_COMPLETED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "La encuesta se responde al terminar el intento.",
            status.HTTP_409_CONFLICT,
        )
    if _answered(attempt.id):
        raise _already_sent()
    try:
        with transaction.atomic():  # punto de guardado: la perdedora de una carrera no deja abortada la transacción
            response = AttemptFeedback.objects.create(attempt_id=attempt.id, rating=rating, comment=comment)
    except IntegrityError:  # otra orden respondió entre la comprobación previa y el INSERT: la base es el árbitro
        if not _answered(attempt.id):
            raise
        raise _already_sent() from None
    return _state(response)
