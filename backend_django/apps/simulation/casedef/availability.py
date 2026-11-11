"""Disponibilidad de una opción como dato (bloque A, DSL 2.1): Python puro, sin Django ni otras apps.

Una opción sin requisito (``{}``) siempre está disponible; con requisito, lo decide ``conditions.evaluate`` sobre el
contexto de la partida (hitos, persona, conteos y hechos de exploración ``explored``).
"""
from apps.simulation.casedef import conditions


def is_available(requires: dict, context: dict) -> bool:
    """``True`` si la opción con ese requisito se ofrece: ``{}`` siempre; lo demás, lo que evalúe la condición."""
    if requires == {}:
        return True
    return conditions.evaluate(requires, context)
