"""Cupo del asistente de IA de autoría: tope diario por persona y tope mensual del programa (P5).

El cupo se RESERVA antes de llamar al proveedor (``consume``) y se devuelve si el proveedor falla
(``refund``): una respuesta 502 no gasta ayuda. La reserva es atómica: la fila del día se toma con
``select_for_update``, así dos peticiones simultáneas al borde del límite no pasan las dos.
"""
from dataclasses import dataclass

from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone
from rest_framework import status

from apps.simulation.models import AuthoringAssistantUsage
from shared.exceptions import ApiError

from . import config as assistant_config

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
DAILY_MESSAGE = "Llegaste al límite de ayuda de la IA por hoy."
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
MONTHLY_MESSAGE = "El programa agotó la ayuda de la IA de este mes."


@dataclass(frozen=True)
class Allowance:
    """Lo que le queda a la persona hoy, después de reservar un uso."""

    remaining_today: int


class LimitExceeded(ApiError):
    """Se agotó el cupo; ``scope`` es ``"daily"`` o ``"monthly"``. Responde 429 ``AI_LIMIT_EXCEEDED``."""

    def __init__(self, scope):
        message = DAILY_MESSAGE if scope == "daily" else MONTHLY_MESSAGE
        super().__init__("AI_LIMIT_EXCEEDED", message, status.HTTP_429_TOO_MANY_REQUESTS)
        self.scope = scope


def used_today(user) -> int:
    row = AuthoringAssistantUsage.objects.filter(user=user, day=timezone.now().date()).first()
    return row.count if row else 0


def remaining_today(user, config=None) -> int:
    """Lo que le queda hoy a ``user`` (nunca negativo)."""
    config = config or assistant_config.current()
    return max(0, config.daily_limit - used_today(user))


def consume(user) -> Allowance:
    """Reserva un uso para ``user`` o lanza ``LimitExceeded``."""
    config = assistant_config.current()
    today = timezone.now().date()
    with transaction.atomic():
        AuthoringAssistantUsage.objects.get_or_create(user=user, day=today)
        row = AuthoringAssistantUsage.objects.select_for_update().get(user=user, day=today)
        if row.count >= config.daily_limit:
            raise LimitExceeded("daily")
        month_total = (
            AuthoringAssistantUsage.objects.filter(day__year=today.year, day__month=today.month)
            .aggregate(total=Sum("count"))["total"]
            or 0
        )
        if month_total >= config.monthly_limit:
            raise LimitExceeded("monthly")
        row.count += 1
        row.save(update_fields=["count"])
        return Allowance(remaining_today=max(0, config.daily_limit - row.count))


def refund(user) -> None:
    """Devuelve un uso a ``user`` (sin bajar de cero), en su propia transacción."""
    with transaction.atomic():
        AuthoringAssistantUsage.objects.filter(
            user=user, day=timezone.now().date(), count__gt=0
        ).update(count=F("count") - 1)
