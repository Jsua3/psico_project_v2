"""Validadores de contraseña propios (E2 · revisión de fase)."""
from django.core.exceptions import ValidationError


class MaximumLengthBytesValidator:
    """BCrypt solo admite 72 bytes: una contraseña más larga es un error de validación, no un 500.

    La tabla ``users`` guarda BCrypt crudo para seguir siendo compatible con Spring
    (``apps.users.models.CustomUser.set_password``); ``bcrypt`` 5 rechaza con ``ValueError`` lo que
    pase de 72 bytes. Se mide en bytes UTF-8: una letra con tilde o un emoji pesan más de uno.
    """

    def __init__(self, max_bytes=72):
        self.max_bytes = max_bytes

    def validate(self, password, user=None):
        if len((password or "").encode("utf-8")) > self.max_bytes:
            raise ValidationError(
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                "La contraseña es demasiado larga: usa como máximo %(max)d caracteres "
                "(los acentos y los símbolos cuentan por más de uno).",
                code="password_too_long",
                params={"max": self.max_bytes},
            )

    def get_help_text(self):
        return f"Tu contraseña no puede superar los {self.max_bytes} caracteres."
