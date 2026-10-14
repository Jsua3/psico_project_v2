"""Avisos por correo de los grupos (E2-12, DJA-3).

Un aviso es **mejor esfuerzo**: un servidor de correo caído no rompe la operación (queda en el
registro). Y nunca revela nada: quien invita recibe la misma respuesta haya o no cuenta.
"""
import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def notify_invitation(student, grupo, teacher):
    """Avisa al estudiante que ``teacher`` lo invitó a ``grupo`` (y que debe aceptar)."""
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    subject = f"[SIEP] Te invitaron al grupo {grupo.nombre}"
    body = (
        f"Hola {student.nombre},\n\n"
        f"{teacher.nombre} {teacher.apellido} te invitó a su grupo «{grupo.nombre}» en SIEP.\n"
        "Para unirte, entra a SIEP y acepta la invitación; hasta entonces no verá tu actividad.\n"
        "Si no esperabas esta invitación, puedes rechazarla desde la misma pantalla.\n"
    )
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [student.email], fail_silently=False)
    except Exception:  # noqa: BLE001  (un servidor de correo caído no debe romper la orden)
        logger.exception("No se pudo enviar el aviso de invitación al usuario %s", student.id)
