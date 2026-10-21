"""Siembra del caso canónico del PDF: «Violencia Familiar y Tentativa de Feminicidio» (E4-6).

El caso es un **documento** —``apps/simulation/data/cases/SIM-VBG-001.dsl.json``, el DSL del taller con su
extensión ``x-siep``— y esta orden lo trata como a cualquier otro: lo importa, lo valida y lo publica por la
compuerta única (``authoring.gate``), sin exigir la lista ética (es una constancia humana de Psicología y
este es el caso de desarrollo). Para cambiar el caso se edita el documento y se publica una versión nueva.

Y **no reescribe lo publicado** (REGLA-005): si la versión ya existe y está publicada, se queda como está,
con todos sus intentos. Solo se sella si le falta el sello (se publicó antes de E4) y se avisa por la salida
de error si su sello difiere del documento del repositorio. Las demás versiones publicadas del caso pasan a
ARCHIVED (el catálogo muestra una sola) y los casos heredados duplicados se retiran.
"""
import json
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from rest_framework.exceptions import APIException

from apps.simulation.casedef.canonical import definition_hash
from apps.simulation.models import CaseVersion, SimulationCase
from apps.simulation.services.authoring import gate, importing
from apps.simulation.services.competencies import link_unlinked_criteria
from shared.dev_only import is_dev_environment

CASE_CODE = "SIM-VBG-001"
DOCUMENT = Path(__file__).resolve().parents[2] / "data" / "cases" / "SIM-VBG-001.dsl.json"
ADMIN_EMAIL = "admin@psychosim.edu.co"
#: Casos legacy del mismo dominio que deben retirarse del catálogo al sembrar el canónico (evita que
#: aparezcan casos de feminicidio duplicados).
LEGACY_DUPLICATE_CASE_CODES = ("SOC-FEM-001", "VBG-001")


class Command(BaseCommand):
    help = "Siembra el caso PDF desde su documento DSL: lo importa, lo valida y lo publica. No reescribe lo publicado."

    def add_arguments(self, parser):
        parser.add_argument("--case-code", default=CASE_CODE)
        parser.add_argument("--semantic-version", default="2.0.0")

    def _admin(self):
        """Quién firma la siembra. Si la cuenta demo existe, se usa tal cual (sin tocar clave, rol ni estado).

        La cuenta demo, con su clave pública, solo se crea en desarrollo. Fuera de desarrollo se usa el
        primer ADMIN activo y, si no hay ninguno, la siembra se niega.
        """
        User = get_user_model()
        admin = User.objects.filter(email=ADMIN_EMAIL).first()
        if admin is not None:
            return admin
        if is_dev_environment():
            return User.objects.create_user(
                email=ADMIN_EMAIL, password="Admin123!", nombre="Admin", apellido="SIEP", role="ADMIN", activo=True,
            )
        admin = User.objects.filter(role="ADMIN", activo=True).order_by("id").first()
        if admin is None:
            # BORRADOR: mensaje de consola para el operador, pendiente de revisión.
            raise CommandError("No hay ningún ADMIN activo para firmar la siembra del caso.")
        return admin

    def _import_and_publish(self, document, admin):
        imported = importing.import_document(document, admin)
        version = CaseVersion.objects.select_related("simulation_case").get(pk=imported["caseVersionId"])
        link_unlinked_criteria(create=True)  # las competencias del caso quedan en el catálogo y enlazadas (E3-9)
        seal = gate.ensure_publishable(version, require_checklist=False)
        gate.mark_published(version, seal, admin)
        return version

    def _keep(self, version, document):
        """Una versión que ya existe no se reescribe: se sella si le falta y se avisa si difiere del documento."""
        label = f"{version.simulation_case.code} v{version.semantic_version}"
        if version.status != "PUBLISHED":
            self.stderr.write(self.style.WARNING(
                f"La versión {label} está en {version.status}: no se publica ni se reescribe desde el documento."
            ))
            return "conservada"
        action = "conservada"
        if version.definition_hash is None:
            try:
                seal = gate.ensure_publishable(version, require_checklist=False)
            except APIException as error:
                # Una base de desarrollo antigua puede traer una publicada que las reglas nuevas no aceptan:
                # se informa y el arranque sigue (publica una versión nueva con --semantic-version).
                self.stderr.write(self.style.WARNING(
                    f"La versión {label} está publicada pero no valida ({gate.blocker_codes(error)}): se deja sin "
                    "sello; publica los cambios como una versión nueva (--semantic-version)."
                ))
                return "sin sello"
            gate.stamp(version, seal)
            self.stdout.write(f"Sellada: {label} {version.definition_hash}")
            action = "sellada"
        if version.definition_hash != definition_hash(document):
            self.stderr.write(self.style.WARNING(
                f"El sello de {label} difiere del documento del repositorio ({DOCUMENT.name}): no se reescribe lo "
                "publicado; publica los cambios como una versión nueva (--semantic-version)."
            ))
        return action

    @transaction.atomic
    def handle(self, *args, **options):
        document = json.loads(DOCUMENT.read_text(encoding="utf-8"))
        document["caso"]["id"] = options["case_code"]
        document["caso"]["version"] = options["semantic_version"]
        admin = self._admin()

        case = SimulationCase.objects.filter(code=options["case_code"]).first()
        if case is not None and not case.versions.exists():
            # Una cáscara sin versiones (la que deja bootstrap_dev_db) toma el rótulo del documento.
            case.title = document["caso"]["titulo"]
            case.description = document["caso"].get("descripcion") or None
            case.save(update_fields=["title", "description", "updated_at"])

        version = (
            CaseVersion.objects.select_related("simulation_case")
            .filter(simulation_case__code=options["case_code"], semantic_version=options["semantic_version"])
            .first()
        )
        if version is None:
            version = self._import_and_publish(document, admin)
            action = "sembrada"
        else:
            action = self._keep(version, document)
        case = version.simulation_case
        SimulationCase.objects.filter(pk=case.pk).update(active=True)

        # Las demás publicadas se archivan solo si la de este documento quedó publicada: sembrar una versión
        # vieja (archivada) no puede dejar el caso sin ninguna.
        archived = 0
        if version.status == "PUBLISHED":
            archived = (
                CaseVersion.objects.filter(simulation_case=case, status="PUBLISHED")
                .exclude(pk=version.pk)
                .update(status="ARCHIVED")
            )

        # ── Retirar casos legacy duplicados del mismo dominio ────────────────
        # SOC-FEM-001 es el caso de feminicidio previo (mismo PDF, código viejo) que quedaba publicado junto
        # al canónico SIM-VBG-001. Se desactiva y se archivan sus versiones para que el catálogo muestre un
        # único caso.
        legacy_cases = SimulationCase.objects.filter(code__in=LEGACY_DUPLICATE_CASE_CODES).exclude(pk=case.pk)
        legacy_versions_archived = CaseVersion.objects.filter(
            simulation_case__in=legacy_cases, status="PUBLISHED"
        ).update(status="ARCHIVED")
        legacy_deactivated = legacy_cases.update(active=False)

        self.stdout.write(self.style.SUCCESS(
            f"Caso PDF {action}: {case.code} versión {version.semantic_version} (id {version.id}). "
            f"Versiones archivadas: {archived}. Casos legacy retirados: {legacy_deactivated} "
            f"(versiones archivadas: {legacy_versions_archived})."
        ))
