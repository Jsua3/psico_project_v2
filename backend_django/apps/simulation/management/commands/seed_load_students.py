"""Siembra estudiantes virtuales para la carga de un aula (E0-2, RNF-009).

Solo corre bajo ``psychosim.settings.test`` (la BD desechable y aislada): el
usuario real nunca recibe cuentas ``cargaNNN``. Es idempotente y las cuentas
quedan en el grupo demo, que ya tiene el caso ``SIM-VBG-001`` asignado.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from apps.grupos.models import Grupo

User = get_user_model()
GRUPO_DEMO = "DEMO1"
MAX_STUDENTS = 500


class Command(BaseCommand):
    help = "Crea N estudiantes virtuales (carga001…) en el grupo demo para la prueba de carga."

    def add_arguments(self, parser):
        parser.add_argument("--count", type=int, required=True)
        parser.add_argument("--password", required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        if not getattr(settings, "SIEP_TEST_ATTESTATION_NONCE", None):
            raise CommandError("seed_load_students corre solo bajo psychosim.settings.test.")
        count = options["count"]
        if not 1 <= count <= MAX_STUDENTS:
            raise CommandError(f"--count debe estar entre 1 y {MAX_STUDENTS}.")
        grupo = Grupo.objects.filter(codigo=GRUPO_DEMO).first()
        if grupo is None:
            raise CommandError("Falta el grupo DEMO1: corre bootstrap_dev_db primero.")

        for number in range(1, count + 1):
            email = f"carga{number:03d}@psychosim.edu.co"
            user = User.objects.filter(email=email).first()
            if user is None:
                user = User.objects.create_user(
                    email=email,
                    password=options["password"],
                    nombre="Carga",
                    apellido=f"{number:03d}",
                    role="ESTUDIANTE",
                )
            with connection.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO grupo_estudiante (grupo_id, estudiante_id) VALUES (%s, %s) "
                    "ON CONFLICT DO NOTHING",
                    [grupo.id, user.id],
                )
        self.stdout.write(self.style.SUCCESS(f"{count} estudiantes de carga listos en {GRUPO_DEMO}."))
