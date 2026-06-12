"""Puertas espaciales del caso competitivo (vertical slice SIM-VBG-001).

Crea/actualiza objetos EXIT cuyo metadata {targetNodeKey, entryX, entryY,
requiresNpcs?, lockedMessage?} consume el frontend junto al endpoint
enter-room existente (Fase 5 del editor). Idempotente: corre N veces sin
duplicar. No toca el DAG ni las decisiones.
"""
import json

from django.core.management.base import BaseCommand, CommandError

from apps.simulation.models import CaseVersion, MapObject, SceneMap

DOORS = [
    {
        "node_key": "urgencias-crisis",
        "object_key": "puerta-sala-escucha",
        "label": "Sala de escucha",
        "prompt": "Pasar a la sala de escucha",
        "position": (912, 440),
        "metadata": {
            "targetNodeKey": "ruta-proteccion",
            "entryX": 126,
            "entryY": 364,
            "requiresNpcs": ["enfermera-urgencias"],
            "lockedMessage": (
                "La sala de escucha se está preparando. Habla primero con la "
                "enfermera de turno para recibir el contexto clínico."
            ),
        },
    },
    {
        "node_key": "ruta-proteccion",
        "object_key": "puerta-urgencias",
        "label": "Sala de urgencias",
        "prompt": "Volver a la sala de urgencias",
        "position": (48, 330),
        "metadata": {"targetNodeKey": "urgencias-crisis", "entryX": 786, "entryY": 440},
    },
]


class Command(BaseCommand):
    help = "Crea/actualiza las puertas EXIT del caso competitivo (idempotente)."

    def add_arguments(self, parser):
        parser.add_argument("--case-code", default="SIM-VBG-001")
        parser.add_argument("--case-version", type=int, default=None,
                            help="Id de case_version explícito (tests).")

    def handle(self, *args, **options):
        if options["case_version"]:
            version = CaseVersion.objects.filter(pk=options["case_version"]).first()
        else:
            version = (
                CaseVersion.objects.filter(
                    simulation_case__code=options["case_code"], status="PUBLISHED"
                ).order_by("id").first()
            )
        if not version:
            raise CommandError("No se encontró la versión del caso para sembrar puertas")

        created = updated = 0
        for door in DOORS:
            scene_map = SceneMap.objects.filter(
                case_version_id=version.id, node__node_key=door["node_key"]
            ).first()
            if not scene_map:
                self.stderr.write(f"Sin mapa para nodo {door['node_key']} — puerta omitida")
                continue
            _, was_created = MapObject.objects.update_or_create(
                scene_map=scene_map,
                object_key=door["object_key"],
                defaults={
                    "label": door["label"],
                    "object_type": "EXIT",
                    "position_x": door["position"][0],
                    "position_y": door["position"][1],
                    "width": 36,
                    "height": 48,
                    "color_hex": "#B69CFF",
                    "icon": "door_front",
                    "short_code": "EXIT",
                    "collision": False,
                    "visible": True,
                    "interaction_prompt": door["prompt"],
                    "interaction_text": door["label"],
                    "metadata_json": json.dumps(door["metadata"]),
                },
            )
            created += int(was_created)
            updated += int(not was_created)
        self.stdout.write(self.style.SUCCESS(f"Puertas: {created} creadas, {updated} actualizadas"))
