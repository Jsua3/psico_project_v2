"""Borra los contadores del limitador cuya ventana venció hace más de dos días (S1-2, DJA-2).

Una ventana vigente o de hace menos de dos días se conserva: el corte es ``ahora - 2 días``, estricto.
"""
from django.core.management.base import BaseCommand

from apps.security import limiter
from apps.security.models import RateLimitBucket

RETENCION_SEGUNDOS = 2 * 86400


class Command(BaseCommand):
    help = "Borra los contadores del limitador de ventanas vencidas hace más de dos días."  # BORRADOR

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Cuenta lo que borraría, sin borrar nada.",  # BORRADOR
        )

    def handle(self, *args, **options):
        corte = int(limiter._now()) - RETENCION_SEGUNDOS
        vencidas = RateLimitBucket.objects.filter(window_start__lt=corte)
        if options["dry_run"]:
            total = vencidas.count()
            self.stdout.write(f"Se borrarían {total} contadores vencidos (--dry-run).")  # BORRADOR
            return
        borrados, _ = vencidas.delete()
        self.stdout.write(f"Se borraron {borrados} contadores vencidos.")  # BORRADOR
