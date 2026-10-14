"""Cierre de un intento abierto por reemplazo (RN-07, E1-2).

Lo comparten las dos rutas que reemplazan un intento: el ``forceNew`` heredado del
estudiante (``game_service.start_attempt``, mientras ``ATTEMPT_START_STRICT`` esté
apagada) y la acción docente (``instructor_service.replace_attempt``). Reemplazar no
es una salida segura: el intento queda ``REPLACED`` (terminal, no puntúa), con su
bitácora bloqueada, un evento propio y quién y por qué lo reemplazó.
"""
from django.utils import timezone

from ..models import AttemptEvent, ReflectionJournal
from . import attempt_lifecycle as lifecycle

_SAVED_FIELDS = ["status", "ended_at", "locked_at", "replaced_by", "replace_reason"]


def replace_open_attempt(attempt, *, by, reason):
    """Cierra ``attempt`` como ``REPLACED`` y deja el motivo en el intento y en un evento.

    ``by`` es el usuario que reemplaza (queda en ``replaced_by``: el propio estudiante en
    la ruta heredada, el docente o el ADMIN en la acción docente). Lanza
    ``InvalidAttemptTransition`` (400) si el intento no está abierto. El llamador debe
    haber cargado ``current_node``.
    """
    lifecycle.apply(attempt, lifecycle.REPLACE)
    now = timezone.now()
    attempt.ended_at = now
    attempt.locked_at = now
    attempt.replaced_by = by
    attempt.replace_reason = reason
    attempt.save(update_fields=_SAVED_FIELDS)
    ReflectionJournal.objects.filter(attempt_id=attempt.id).update(locked=True, updated_at=now)
    AttemptEvent.objects.create(
        attempt=attempt,
        event_type="ATTEMPT_REPLACED",
        node=attempt.current_node,
        detail=reason,
    )
    return attempt
