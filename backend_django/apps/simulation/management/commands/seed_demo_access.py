"""Create the local demo users, group and assignment required to play."""
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.grupos.models import Grupo, CaseAssignment, GrupoEstudiante
from apps.simulation.models import CaseVersion, SceneMap, SimulationCase, SimulationNode
from shared.dev_only import require_dev_environment

User = get_user_model()

DEMO_USERS = [
    {
        "email": "admin@psychosim.edu.co",
        "password": "Admin123!",
        "nombre": "Admin",
        "apellido": "SIEP",
        "role": "ADMIN",
    },
    {
        "email": "profesora@psychosim.edu.co",
        "password": "Profesor123!",
        "nombre": "Profesora",
        "apellido": "Demo",
        "role": "PROFESOR",
    },
    {
        "email": "estudiante@psychosim.edu.co",
        "password": "Estudiante123!",
        "nombre": "Estudiante",
        "apellido": "Demo",
        "role": "ESTUDIANTE",
    },
]


class Command(BaseCommand):
    help = "Seed local demo users and assign SIM-VBG-001 to the demo student group."

    def add_arguments(self, parser):
        parser.add_argument(
            "--skip-case-seed",
            action="store_true",
            help="Do not run seed_caso_pdf before creating demo access records.",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            # BORRADOR: ayuda de consola, pendiente de revisión.
            help="Repone rol, nombre, activo y contraseña de las cuentas demo que ya existen.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        require_dev_environment("seed_demo_access")
        if not options["skip_case_seed"] and not self._case_is_ready():
            call_command("seed_caso_pdf")
        elif not options["skip_case_seed"]:
            self.stdout.write("Caso SIM-VBG-001 ya esta completo; no se reconstruye ni se borran intentos.")
        call_command("seed_default_rubric")

        users = {}
        for spec in DEMO_USERS:
            user = User.objects.filter(email=spec["email"]).first()
            if user is None:
                user = User.objects.create_user(
                    email=spec["email"],
                    password=spec["password"],
                    nombre=spec["nombre"],
                    apellido=spec["apellido"],
                    role=spec["role"],
                    activo=True,
                )
                self.stdout.write(f"Creado usuario {spec['role']}: {spec['email']}")
            elif options["reset"]:
                self._reponer(user, spec)
                # BORRADOR: mensaje de consola para el operador, pendiente de revisión.
                self.stdout.write(f"Repuesto usuario {spec['role']}: {spec['email']}")
            else:
                # BORRADOR: mensaje de consola para el operador, pendiente de revisión.
                self.stdout.write(
                    f"Ya existe: {spec['email']} (no se modifica; usa --reset para reponerla)"
                )
            users[spec["role"]] = user

        case = SimulationCase.objects.filter(code="SIM-VBG-001", active=True).first()
        if not case:
            raise CommandError("No existe el caso activo SIM-VBG-001")
        version = (
            CaseVersion.objects.filter(simulation_case=case, status="PUBLISHED")
            .order_by("-published_at", "-id")
            .first()
        )
        if not version:
            raise CommandError("SIM-VBG-001 no tiene version publicada")

        grupo, _ = Grupo.objects.update_or_create(
            codigo="SIEP-DEMO",
            defaults={
                "nombre": "Grupo Demo SIEP",
                "profesor": users["PROFESOR"],
                "activo": True,
            },
        )

        GrupoEstudiante.objects.get_or_create(
            grupo_id=grupo.id, estudiante_id=users["ESTUDIANTE"].id, defaults={"status": "ACTIVE"}
        )
        CaseAssignment.objects.get_or_create(grupo_id=grupo.id, case_version_id=version.id)

        self.stdout.write(
            self.style.SUCCESS(
                "Acceso demo listo: estudiante@psychosim.edu.co puede iniciar "
                f"SIM-VBG-001 version {version.id} desde el grupo {grupo.codigo}."
            )
        )

    def _case_is_ready(self):
        case = SimulationCase.objects.filter(code="SIM-VBG-001", active=True).first()
        if not case:
            return False
        version = (
            CaseVersion.objects.filter(simulation_case=case, status="PUBLISHED")
            .order_by("-published_at", "-id")
            .first()
        )
        if not version:
            return False
        return (
            SimulationNode.objects.filter(case_version=version).count() >= 8
            and SceneMap.objects.filter(case_version=version).count() >= 8
        )

    @staticmethod
    def _reponer(user, spec):
        """Repone rol, nombre, activo y contraseña de una cuenta demo; solo con ``--reset``."""
        changed = False
        for field in ("nombre", "apellido", "role"):
            if getattr(user, field) != spec[field]:
                setattr(user, field, spec[field])
                changed = True
        if not user.activo:
            user.activo = True
            changed = True
        if not user.check_password(spec["password"]):
            user.set_password(spec["password"])
            changed = True
        if changed:
            user.save()
