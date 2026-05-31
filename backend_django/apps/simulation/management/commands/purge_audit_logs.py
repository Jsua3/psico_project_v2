"""Purge expired audit_logs rows (12-month retention).

Django equivalent of Spring's AuditLogCleanupScheduler (@Scheduled cron
"0 0 3 * * *"). Run from cron / Task Scheduler daily at 03:00:

    python manage.py purge_audit_logs
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.simulation.models import AuditLog


class Command(BaseCommand):
    help = "Delete audit_logs rows whose retention_until has passed (12-month policy)."

    def handle(self, *args, **options):
        now = timezone.now()
        deleted, _ = AuditLog.objects.filter(retention_until__lt=now).delete()
        if deleted:
            self.stdout.write(
                f"Audit retention purge: deleted {deleted} expired entries (before {now.isoformat()})"
            )
        else:
            self.stdout.write(f"Audit retention purge: no entries expired as of {now.isoformat()}")
