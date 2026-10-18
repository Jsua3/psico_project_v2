"""Purge expired audit_logs rows (≥ 12-month retention policy, E5-7 / RNF-007).

Django equivalent of Spring's AuditLogCleanupScheduler (@Scheduled cron
"0 0 3 * * *"). Run from cron / Task Scheduler daily at 03:00:

    python manage.py purge_audit_logs
    python manage.py purge_audit_logs --dry-run
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.simulation.models import AuditLog
from apps.simulation.services.audit_service import audit_purge_window, retention_days


class Command(BaseCommand):
    help = "Delete audit_logs rows whose retention_until has passed (≥ 12-month policy)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Count expired audit_logs rows without deleting them.",
        )

    def handle(self, *args, **options):
        now = timezone.now()
        days = retention_days()
        expired_qs = AuditLog.objects.filter(retention_until__lt=now)
        if options.get("dry_run"):
            count = expired_qs.count()
            self.stdout.write(
                f"Audit retention dry-run (policy={days}d): {count} expired entries as of {now.isoformat()}"
            )
            return

        # S4-2: la base solo deja borrar la auditoría dentro de esta ventana (migración 0026); fuera, sigue rechazando.
        with audit_purge_window():
            deleted, _ = expired_qs.delete()
        if deleted:
            self.stdout.write(
                f"Audit retention purge (policy={days}d): deleted {deleted} expired entries (before {now.isoformat()})"
            )
        else:
            self.stdout.write(
                f"Audit retention purge (policy={days}d): no entries expired as of {now.isoformat()}"
            )
