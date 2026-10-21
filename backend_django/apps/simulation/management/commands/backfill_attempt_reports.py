"""Congela el reporte de los intentos completados antes de E1-8.

Un intento completado sin fila en ``attempt_reports`` se sirve con el cálculo en vivo
(leer no escribe). Este comando le persiste su reporte para que deje de depender de cómo
esté hoy la definición del caso: la huella y el ordinal salen del caso actual, así que
conviene correrlo una vez, poco después de desplegar E1-8, antes de editar el caso.
Es idempotente: no toca un intento que ya tiene reporte.

Una segunda pasada (E6) repara los intentos cerrados con reporte v2 a los que les falta la evaluación del sistema
(``freeze_report`` solo registra un fallo transitorio al crearla): lee el reporte congelado, no recalcula nada y
no toca los reportes v1. Si algún intento no se puede reparar, sigue con los demás y termina con error.

    python manage.py backfill_attempt_reports
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.simulation.models import AttemptReport, AttemptStatus, EvaluationOrigin, SimulationAttempt
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

        missing = (
            SimulationAttempt.objects.filter(status=AttemptStatus.COMPLETED, report__report_schema_version__gte=2)
            .exclude(rubric_evaluations__origin=EvaluationOrigin.SISTEMA)
            .order_by("started_at", "id")
        )
        created, failed = 0, []
        for attempt in missing.iterator(chunk_size=200):
            try:
                with transaction.atomic():
                    created += 1 if attempt_report.repair_system_evaluation(attempt) is not None else 0
            except Exception as error:  # noqa: BLE001 - se cuenta, se avisa y se sigue con los demás
                failed.append(attempt.id)
                self.stderr.write(f"No se pudo crear la evaluación del sistema del intento {attempt.id}: {error}")
        self.stdout.write(f"Evaluaciones del sistema creadas: {created}")
        if failed:
            raise CommandError(f"{len(failed)} evaluación(es) del sistema no se pudieron crear")
