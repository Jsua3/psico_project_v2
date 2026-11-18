"""Crea un caso borrador desde un lugar de la biblioteca, igual que el editor (``POST /api/authoring/cases`` con
``lugarId``): sirve para sembrar en una base de demo el hospital por piezas (x-siep 2.2) sin pasar por la pantalla.

Uso (en una base de desarrollo, después de ``seed_demo_access``):

    python manage.py crear_caso_desde_lugar --lugar hospital --autor profesora@psychosim.edu.co

Sin ``--salas`` copia todas las salas del lugar en su orden (la primera es la escena de inicio). Cada corrida crea un caso
nuevo con su propio código. Solo corre en desarrollo (``shared.dev_only``).
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.biblioteca.services import lugares
from apps.simulation.services.authoring import cases
from shared.dev_only import require_dev_environment

User = get_user_model()


class Command(BaseCommand):
    help = "Crea un caso borrador copiando salas de un lugar de la biblioteca (por omisión, todo el hospital por piezas)."

    def add_arguments(self, parser):
        parser.add_argument("--lugar", default="hospital", help="id del lugar en biblioteca/escenarios/indice.json")
        parser.add_argument("--autor", default="profesora@psychosim.edu.co", help="correo de la docente dueña del caso")
        parser.add_argument("--titulo", default="Urgencias de noche (salas por piezas)")
        parser.add_argument("--salas", default="", help="ids separados por coma; por omisión, todas en su orden")

    def handle(self, *args, **opciones):
        require_dev_environment("crear_caso_desde_lugar")
        autor = User.objects.filter(email=opciones["autor"]).first()
        if autor is None:
            raise CommandError(f"No hay una cuenta con el correo {opciones['autor']}: corre antes seed_demo_access.")
        lugar = lugares.cargar_lugar(opciones["lugar"])
        salas = [s.strip() for s in opciones["salas"].split(",") if s.strip()] or [s["id"] for s in lugar["salas"]]
        with transaction.atomic():
            creado = cases.create_case({"title": opciones["titulo"], "lugarId": lugar["id"], "salas": salas}, autor)
        version_id = creado.get("caseVersionId") if isinstance(creado, dict) else None
        self.stdout.write(self.style.SUCCESS(
            f"Caso creado desde «{lugar['nombre']}» con {len(salas)} salas (versión {version_id})."
        ))
