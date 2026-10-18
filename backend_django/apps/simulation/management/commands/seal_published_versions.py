"""Sella las versiones publicadas que aún no tienen sello (E4-4, R13).

Lo publicado antes de E4 no tiene ``validated_at`` ni ``definition_hash``, y sin sello no se puede
arrancar un intento nuevo. Aquí cada publicada sin sello pasa por la misma compuerta que una
publicación (``gate.ensure_publishable``, sin exigir la lista ética, que es una constancia humana) y
recibe su sello; las que no validan se **informan** y quedan sin sello (no se despublican). Es
idempotente; ``--reseal`` recalcula también las ya selladas (cuando el formato del documento cambia a
propósito). Debe correr tras ``migrate`` en cada despliegue (``bootstrap_dev_db`` lo hace en desarrollo).

Sin ``--strict`` termina con código 0 aunque alguna versión no valide (el arranque de desarrollo no debe
abortar por ello); con ``--strict`` termina con error si alguna quedó sin sello, para que un despliegue lo vea.
"""
from django.core.management.base import BaseCommand, CommandError
from rest_framework.exceptions import APIException

from apps.simulation.models import CaseVersion
from apps.simulation.services.authoring import gate


class Command(BaseCommand):
    help = "Valida y sella las versiones publicadas que no tienen sello (--reseal: también las selladas)."

    def add_arguments(self, parser):
        parser.add_argument("--reseal", action="store_true", help="Recalcula también el sello de las ya selladas.")
        parser.add_argument(
            "--strict", action="store_true", help="Termina con error si alguna versión no se pudo sellar (despliegues)."
        )

    def handle(self, *args, **options):
        published = CaseVersion.objects.filter(status="PUBLISHED").select_related("simulation_case").order_by("id")
        if not options["reseal"]:
            published = published.filter(definition_hash__isnull=True)
        sealed = unsealed = 0
        failed = []
        for version in published:
            label = f"{version.simulation_case.code} v{version.semantic_version}"
            try:
                seal = gate.ensure_publishable(version, require_checklist=False)
            except APIException as error:
                unsealed += 1
                failed.append(label)
                self.stderr.write(self.style.WARNING(f"Sin sello: {label} no valida ({gate.blocker_codes(error)})."))
                continue
            gate.stamp(version, seal)
            sealed += 1
            self.stdout.write(f"Sellada: {label} {seal.definition_hash}")
        summary = f"Selladas: {sealed}. Sin sello por no validar: {unsealed}."
        self.stdout.write(self.style.SUCCESS(summary) if not unsealed else self.style.WARNING(summary))
        if options["strict"] and failed:
            raise CommandError("Quedaron sin sello por no validar: " + ", ".join(failed) + ".")
