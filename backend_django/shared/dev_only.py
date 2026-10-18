"""Guarda de las siembras de demostración: solo corren en desarrollo (S5-4, SF-19).

``seed_demo_access`` y ``seed_demo_users`` crean cuentas con contraseñas de demostración
conocidas. Se niegan a correr con los ajustes de producción o con ``DATABASE_URL`` definido
(la señal de una base de plataforma), salvo la excepción explícita ``SIEP_ALLOW_DEMO_SEED``,
que solo el desarrollo documenta.
"""
import os

from django.conf import settings
from django.core.management.base import CommandError

ALLOW_ENV = "SIEP_ALLOW_DEMO_SEED"
_VALORES_QUE_ABREN = frozenset({"1", "true", "yes", "on"})


def require_dev_environment(command_name):
    """Lanza ``CommandError`` si la siembra no puede correr en este entorno.

    Se llama al principio de ``handle``, antes de tocar la base. El mensaje nombra el comando
    y el motivo, pero nunca imprime el valor de una variable de entorno.
    """
    if os.environ.get(ALLOW_ENV, "").lower() in _VALORES_QUE_ABREN:
        return
    motivos = []
    if settings.SETTINGS_MODULE.endswith(".production"):
        motivos.append("los ajustes son los de producción")
    if os.environ.get("DATABASE_URL"):
        motivos.append("DATABASE_URL está definido (base de plataforma)")
    if motivos:
        # BORRADOR: mensaje de consola para el operador, pendiente de revisión.
        raise CommandError(
            f"{command_name} se niega a correr: {' y '.join(motivos)}. "
            "Las cuentas de demostración solo se siembran en desarrollo. "
            f"Solo para una base de pruebas desechable, define {ALLOW_ENV}=true."
        )
