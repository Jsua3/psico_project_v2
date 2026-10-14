"""Cuentas: aprobación por lote de las pendientes y cambio de contraseña (E2-9, RN-10).

Una cuenta **pendiente** es la que nació de una importación del docente: ``activo = False``,
``must_change_password = True`` y sin contraseña usable. El ADMIN la aprueba: se activa, recibe
una contraseña temporal **por correo** (nunca por la respuesta de la API ni por el log) y el
primer inicio la obliga a fijar una propia (``apps.users.authentication``).
"""
import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.utils.crypto import get_random_string
from rest_framework import status

from apps.simulation.services.audit_service import auditable
from shared.exceptions import ApiError

User = get_user_model()
logger = logging.getLogger(__name__)

#: Sin caracteres ambiguos (0/O, 1/l/I): la persona la teclea desde un correo.
_TEMPORARY_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
_TEMPORARY_LENGTH = 14


def new_temporary_password():
    return get_random_string(_TEMPORARY_LENGTH, allowed_chars=_TEMPORARY_ALPHABET)


def _send_approval_email(user, temporary_password):
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    send_mail(
        "[SIEP] Tu cuenta fue aprobada",
        (
            f"Hola {user.nombre},\n\n"
            "Tu cuenta en SIEP fue aprobada. Para entrar usa:\n\n"
            f"Correo: {user.email}\n"
            f"Contraseña temporal: {temporary_password}\n\n"
            "Al entrar te pediremos que la cambies por una propia antes de continuar.\n"
            "Si no esperabas este mensaje, ignóralo.\n"
        ),
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
        fail_silently=False,
    )


@auditable("USER_APPROVED", "USER", -1)
def approve_pending(user_ids, actor):
    """Aprueba por lote: ``{approved, skipped, emailed, failed}``; nunca devuelve una contraseña.

    Solo las cuentas pendientes se aprueban; el resto va a ``skipped``. El correo sale **antes**
    de activar la cuenta: si falla, la cuenta sigue pendiente (``failed``) y no queda activa con
    una contraseña que nadie conoce.
    """
    ordered = list(dict.fromkeys(int(i) for i in user_ids))
    found = {u.id: u for u in User.objects.filter(pk__in=ordered)}
    approved, skipped, failed = [], [], []
    for user_id in ordered:
        user = found.get(user_id)
        if user is None or not user.is_pending_approval:
            skipped.append(user_id)
            continue
        temporary = new_temporary_password()
        try:
            _send_approval_email(user, temporary)
        except Exception:  # noqa: BLE001  (un servidor de correo caído no debe romper el lote)
            logger.exception("No se pudo enviar el correo de aprobación al usuario %s", user.id)
            failed.append(user_id)
            continue
        with transaction.atomic():
            user.set_password(temporary)
            user.activo = True
            user.must_change_password = True
            user.save(update_fields=["password", "activo", "must_change_password"])
        approved.append(user_id)
    return {"approved": len(approved), "skipped": skipped, "emailed": len(approved), "failed": failed}


def lock_admins():
    """Cerrojo sobre TODAS las filas de ADMIN, en orden de id (primero, antes que el destino).

    Dos administradores que se desactivan entre sí toman los mismos cerrojos en el mismo orden:
    se serializan en vez de cruzarse (interbloqueo) y la segunda orden ya ve el resultado de la
    primera. Debe llamarse dentro de una transacción.
    """
    return list(
        User.objects.select_for_update().filter(role="ADMIN").order_by("pk").values_list("pk", flat=True)
    )


def ensure_not_last_admin(user, *, role=None, activo=None):
    """400 ``LAST_ADMIN`` si el cambio dejaría al sistema sin un ADMIN activo (D-6).

    Se llama dentro de una transacción que ya tomó ``lock_admins()``.
    """
    steps_down = (role is not None and role != "ADMIN") or activo is False
    if not (user.role == "ADMIN" and user.activo and steps_down):
        return
    active_admins = list(
        User.objects.filter(role="ADMIN", activo=True).order_by("pk").values_list("pk", flat=True)
    )
    if not [pk for pk in active_admins if pk != user.pk]:
        raise ApiError(
            "LAST_ADMIN",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "No puedes desactivar ni quitar el rol al último administrador activo.",
            status.HTTP_400_BAD_REQUEST,
        )


def _field_error(field, message):
    return ApiError("VALIDATION_ERROR", message, status.HTTP_400_BAD_REQUEST, field=field)


@auditable("PASSWORD_CHANGED", "USER", -1)
def change_password(user, current_password, new_password):
    """Cambia la contraseña de ``user`` y apaga el cambio obligatorio."""
    if not user.check_password(current_password or ""):
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise _field_error("currentPassword", "La contraseña actual no es correcta.")
    if new_password == current_password:
        raise _field_error("newPassword", "La nueva contraseña debe ser distinta de la actual.")
    try:
        password_validation.validate_password(new_password, user)
    except DjangoValidationError as exc:
        raise _field_error("newPassword", " ".join(exc.messages)) from None
    user.set_password(new_password)
    user.must_change_password = False
    user.save(update_fields=["password", "must_change_password"])
    return user
