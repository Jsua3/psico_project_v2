"""Datos de prueba de las competencias declaradas (``effects.competencies``) en el caso sembrado.

Desde ``borrador-2`` una opción que no declara competencias no aporta a ninguna, y el caso sembrado no declara nada: las
pruebas que necesitan niveles en el reporte de un intento JUGADO se los declaran aquí, en la base de la prueba.
"""
import json

from apps.simulation.models import DecisionOption

SEEDED_CODES = ("CONTENCION", "MARCO_NORMATIVO", "INTERVENCION_ETICA", "REFLEXION")


def declare_competencies(case_version_id, competencies, response_classes=None):
    """Las opciones del caso (solo las de ``response_classes``, si se da) declaran ``competencies`` (``{código: nivel}``).

    Se conservan los demás efectos de cada opción.
    """
    options = DecisionOption.objects.filter(case_version_id=case_version_id)
    if response_classes is not None:
        options = options.filter(response_class__in=[str(getattr(c, "value", c)) for c in response_classes])
    for option in options:
        effects = json.loads(option.effects) if option.effects else {}
        effects["competencies"] = dict(competencies)
        DecisionOption.objects.filter(pk=option.pk).update(effects=json.dumps(effects))


def declare_all_seeded(case_version_id, level="DESTACADO", response_classes=None):
    """Todas las opciones declaran el mismo ``level`` en las cuatro competencias de la rúbrica sembrada."""
    declare_competencies(case_version_id, {code: level for code in SEEDED_CODES}, response_classes)
