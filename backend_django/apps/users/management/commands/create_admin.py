"""Crea la primera cuenta ADMIN de un despliegue (SIEP-RNF-03, plan 03 R1b).

    python manage.py create_admin --email X --nombre N --apellido A [--password-env NOMBRE_DE_VARIABLE]

La clave NO va como argumento: quedaría en el historial del terminal. Sale de la variable indicada (por defecto
``SIEP_ADMIN_PASSWORD``) o, si esa variable no existe y hay terminal interactiva, se pide dos veces con ``getpass``.
La cuenta queda con una clave TEMPORAL: la persona la cambia en su primer acceso. La lógica vive en
``account_service.create_admin_account``; este comando solo lee la entrada y muestra el resultado.
"""
import getpass
import os
import sys

from django.core.management.base import BaseCommand, CommandError

from apps.users.serializers import normalize_email_value
from apps.users.services import account_service
from shared.exceptions import ApiError

VARIABLE_POR_DEFECTO = "SIEP_ADMIN_PASSWORD"


# BORRADOR: textos de consola nuevos para el operador, pendientes de revisión.
def _clave(nombre_variable):
    valor = os.environ.get(nombre_variable, "")
    if valor:
        return valor
    if sys.stdin is not None and sys.stdin.isatty():
        primera = getpass.getpass("Contraseña temporal del administrador: ")
        segunda = getpass.getpass("Repite la contraseña: ")
        if primera != segunda:
            raise CommandError("Las dos contraseñas no coinciden. No se creó ninguna cuenta.")
        return primera
    raise CommandError(
        "Falta la contraseña temporal: define la variable de entorno indicada con --password-env "
        f"(por defecto {VARIABLE_POR_DEFECTO}) o ejecuta el comando en una terminal interactiva."
    )


class Command(BaseCommand):
    # BORRADOR: texto de ayuda nuevo, pendiente de revisión.
    help = "Crea la primera cuenta ADMIN con una clave temporal. La clave sale de una variable o de la terminal."

    def create_parser(self, prog_name, subcommand, **kwargs):
        # Sin abreviaturas: «--password» no debe colarse como «--password-env» y tomar la clave como nombre de variable.
        kwargs.setdefault("allow_abbrev", False)
        return super().create_parser(prog_name, subcommand, **kwargs)

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--nombre", required=True)
        parser.add_argument("--apellido", required=True)
        parser.add_argument("--password-env", default=VARIABLE_POR_DEFECTO)

    def handle(self, *args, **options):
        clave = _clave(options["password_env"])
        try:
            cuenta = account_service.create_admin_account(
                normalize_email_value(options["email"]), options["nombre"], options["apellido"], clave
            )
        except ApiError as exc:
            raise CommandError(str(exc.detail)) from None
        # Solo el id: ni el correo ni la clave se imprimen.
        self.stdout.write(
            f"Cuenta ADMIN creada (id {cuenta.pk}). La contraseña es temporal: la cambia en su primer acceso."
        )
