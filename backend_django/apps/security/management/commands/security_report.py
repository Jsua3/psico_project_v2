"""Informe de seguridad de los últimos días (S4-3): recuentos, ids y roles; sin correos ni direcciones IP.

Solo lee y solo imprime texto: no escribe nada en la base.
"""
import time
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum
from django.utils import timezone

from apps.security.limits import CONTADORES, LIMITS
from apps.security.models import RateLimitBucket
from apps.simulation.models import AuditLog

DIA = 86400
ALCANCES_DE_LOGIN = ("login_fail_account_ip", "login_fail_account")
ROLES_PRIVILEGIADOS = ("ADMIN", "PROFESOR")
#: Acción de auditoría de un informe exportado. Hoy ninguna ruta la registra (la exportación de ``reportes`` no es
#: ``@auditable``): mientras no la haya, la sección imprime 0.
ACCION_EXPORTAR_INFORME = None


def _suma(consulta):
    return consulta.aggregate(total=Sum("count"))["total"] or 0


class Command(BaseCommand):
    help = "Recuentos de seguridad de los últimos días, sin datos personales."  # BORRADOR

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=7, help="Días a revisar, de 1 a 90.")  # BORRADOR

    def handle(self, *args, **options):
        dias = options["days"]
        if not 1 <= dias <= 90:
            raise CommandError("--days debe estar entre 1 y 90.")  # BORRADOR
        # Las ventanas del limitador son segundos desde la época; las fechas de usuario y auditoría, ``timezone.now``.
        desde_ventana = int(time.time()) - dias * DIA
        desde_fecha = timezone.now() - timedelta(days=dias)

        self.stdout.write(f"Informe de seguridad: últimos {dias} días")  # BORRADOR

        fallos = RateLimitBucket.objects.filter(scope="audit_failure", window_start__gte=desde_ventana)
        self.stdout.write(f"Fallos de auditoría: {_suma(fallos)}")  # BORRADOR

        self.stdout.write("Límites aplicados (ventanas por encima de su tope):")  # BORRADOR
        for alcance, limite in LIMITS.items():
            if alcance in CONTADORES:
                continue
            por_encima = RateLimitBucket.objects.filter(
                scope=alcance, count__gt=limite.limit, window_start__gte=desde_ventana
            ).count()
            self.stdout.write(f"  {alcance}: {por_encima}")

        logins = RateLimitBucket.objects.filter(scope__in=ALCANCES_DE_LOGIN, window_start__gte=desde_ventana)
        self.stdout.write(f"Fallos de inicio de sesión: {_suma(logins)}")  # BORRADOR

        nuevas = get_user_model().objects.filter(role__in=ROLES_PRIVILEGIADOS, created_at__gte=desde_fecha)
        self.stdout.write(f"Cuentas nuevas con rol ADMIN o PROFESOR: {nuevas.count()}")  # BORRADOR
        for pk, rol in nuevas.order_by("pk").values_list("pk", "role"):
            self.stdout.write(f"  id={pk} rol={rol}")

        exportados = 0
        if ACCION_EXPORTAR_INFORME:
            exportados = AuditLog.objects.filter(
                action=ACCION_EXPORTAR_INFORME, occurred_at__gte=desde_fecha
            ).count()
        self.stdout.write(f"Informes exportados: {exportados}")  # BORRADOR
