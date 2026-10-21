"""Apoyo de las pruebas de publicación: lo que un borrador necesita para pasar la compuerta ética (S3-3).

El caso sembrado (``SIM-VBG-001``) no trae recursos de apoyo en ninguna de sus escenas, así que un borrador clonado de él con
la lista completa se bloquea con ``ETHICS.NO_SUPPORT_RESOURCES``: marcó «protocolos de seguridad» sin que ninguna escena tenga
un recurso. La regla no se debilita; las pruebas que necesitan un borrador PUBLICABLE le dan uno aquí.
"""
import json

from apps.simulation.models import SimulationNode

#: Un recurso de apoyo de prueba. A propósito no parece uno real: los reales los entrega y verifica Psicología.
TEST_SUPPORT_RESOURCE = "Recurso de apoyo de prueba (no verificado)"


def give_support_resource(case_version_id, text=TEST_SUPPORT_RESOURCE):
    """Pone un recurso de apoyo en la primera escena de la versión (por la base: lo que el editor guardaría)."""
    node = SimulationNode.objects.filter(case_version_id=case_version_id).order_by("id").first()
    SimulationNode.objects.filter(pk=node.pk).update(support_resources_json=json.dumps([text], ensure_ascii=False))
