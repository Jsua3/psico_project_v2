"""Congela el reporte de los intentos completados antes de E1-8.

Un intento completado sin fila en ``attempt_reports`` se sirve con el cálculo en vivo
(leer no escribe). Este comando le persiste su reporte para que deje de depender de cómo
esté hoy la definición del caso: la huella y el ordinal salen del caso actual, así que
conviene correrlo una vez, poco después de desplegar E1-8, antes de editar el caso.
Es idempotente: no toca un intento que ya tiene reporte.

    python manage.py backfill_attempt_reports
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.simulation.models import AttemptReport, AttemptStatus, SimulationAttempt
from apps.simulation.services import attempt_report


class Command(BaseCommand):
    help = "Congela el reporte de los intentos COMPLETED que todavía no lo tienen (idempotente)."

    def handle(self, *args, **options):
        already = AttemptReport.objects.values_list("attempt_id", flat=True)
        pending = (
            SimulationAttempt.objects.filter(status=AttemptStatus.COMPLETED)
            .exclude(pk__in=already)
            .select_related("case_version__simulation_case")
            .order_by("started_at", "id")
        )
        frozen = 0
        for attempt in pending.iterator(chunk_size=200):
            with transaction.atomic():
                attempt_report.freeze_report(attempt)
            frozen += 1
        self.stdout.write(f"Reportes congelados: {frozen}")
