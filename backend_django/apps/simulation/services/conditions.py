"""Las condiciones de los finales viven en ``casedef.conditions`` (E4-0, R1): son Python puro y el
documento del caso las valida sin Django. Este módulo las reexporta para que quien ya las importa
desde los servicios no cambie."""
from apps.simulation.casedef.conditions import (  # noqa: F401
    COMPARATORS,
    COUNT_NAMES,
    MAX_DEPTH,
    evaluate,
    is_valid,
)

__all__ = ["COMPARATORS", "COUNT_NAMES", "MAX_DEPTH", "evaluate", "is_valid"]
