"""Siembra la base local: aplica las migraciones y deja el caso demo listo.

El esquema lo construye ``migrate`` (Django es el dueño; E0-8): aquí solo hay datos.
Crea los usuarios demo, siembra el caso PDF y lo asigna al grupo demo.
"""
from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.grupos.models import Grupo, GrupoCaseVersion, GrupoEstudiante
from apps.simulation.models import CaseVersion, SimulationCase
from apps.users.models import CustomUser

DEMO_CASE_CODE = "SIM-VBG-001"
DEMO_GRUPO_CODIGO = "DEMO1"


def _ensure_case_shell(author):
    case, created = SimulationCase.objects.get_or_create(
        code=DEMO_CASE_CODE,
        defaults={
            "title": "Violencia Familiar y Tentativa de Feminicidio",
            "description": "Caso formativo de psicología social.",
            "active": True,
            "created_by": author,
        },
    )
    return case, created


def _assign_demo_group(profesor, estudiante, case_version_id):
    grupo, created = Grupo.objects.get_or_create(
        codigo=DEMO_GRUPO_CODIGO,
        defaults={
            "nombre": "Grupo demo SIEP",
            "profesor": profesor,
            "activo": True,
        },
    )
    GrupoEstudiante.objects.get_or_create(
        grupo_id=grupo.id, estudiante_id=estudiante.id, defaults={"status": "ACTIVE"}
    )
    GrupoCaseVersion.objects.get_or_create(grupo_id=grupo.id, case_version_id=case_version_id)
    return grupo, created


class Command(BaseCommand):
    help = "Aplica las migraciones, siembra el caso demo y lo asigna al estudiante demo."

    def handle(self, *args, **options):
        call_command("migrate", verbosity=0)
        call_command("seed_demo_users")

        admin = CustomUser.objects.filter(email="admin@psychosim.edu.co").first()
        profesor = CustomUser.objects.filter(email="profesora@psychosim.edu.co").first()
        estudiante = CustomUser.objects.filter(email="estudiante@psychosim.edu.co").first()
        author = admin or profesor
        if author is None:
            self.stderr.write(self.style.ERROR("Faltan usuarios demo. Ejecuta seed_demo_users primero."))
            return

        case, case_created = _ensure_case_shell(author)
        if case_created:
            self.stdout.write(f"Caso base creado: {case.code}")

        call_command("seed_caso_pdf")

        version = CaseVersion.objects.get(
            simulation_case__code=DEMO_CASE_CODE,
            status="PUBLISHED",
        )
        if profesor is None or estudiante is None:
            self.stderr.write(self.style.WARNING(
                "Usuarios profesor/estudiante no encontrados; omitiendo asignación de grupo."
            ))
            return

        grupo, grupo_created = _assign_demo_group(profesor, estudiante, version.id)
        action = "creado" if grupo_created else "actualizado"
        self.stdout.write(self.style.SUCCESS(
            f"Simulador listo: caso {DEMO_CASE_CODE} v{version.semantic_version} "
            f"asignado al grupo {grupo.codigo} ({action})."
        ))
