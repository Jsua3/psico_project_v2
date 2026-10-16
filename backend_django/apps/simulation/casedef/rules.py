"""El registro de las reglas semánticas del taller (E4-2a): ``OCL-01…08`` y ``PROP-01…08``.

Cada regla es una función ``f(documento) -> Outcome`` registrada con ``@rule``. La primera línea de su
docstring es «<ID>. <descripción>» y de ahí sale el título que muestra el informe. ``rules_ocl`` y
``rules_prop`` se importan desde ``validate`` para poblar el registro, en ese orden.
"""
from dataclasses import dataclass
from typing import Callable

REGISTRY = []


@dataclass(frozen=True)
class RuleSpec:
    id: str
    kind: str
    title: str
    inv: str
    function: Callable


def rule(identifier, kind, inv=""):
    """Registra una función como regla del taller."""

    def decorator(function):
        first = (function.__doc__ or "").strip().splitlines()[0]
        title = first.split(". ", 1)[1] if ". " in first else first
        REGISTRY.append(RuleSpec(identifier, kind, title, inv, function))
        return function

    return decorator
