"""Eventos de seguridad: una línea ``security_event`` en el registro ``siep.security`` (S2-6b).

Mismo formato que ``shared/body_limit.py``: el nombre del evento y su ámbito, nunca la URL, la clave ni el correo de
nadie. Quien lo llama decide qué es un evento; este módulo solo lo deja escrito.
"""
import logging

security_logger = logging.getLogger("siep.security")


def log_security_event(event, *, scope=None):
    """Registra un ``security_event`` con el nombre ``event`` y el ámbito ``scope``."""
    security_logger.info("security_event", extra={"fields": {"event": event, "scope": scope}})
