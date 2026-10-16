"""El informe de las reglas sobre un documento (E4-2a): hallazgos, resultado por regla y veredicto.

Es la forma de datos del validador del taller: cada regla devuelve cuántos elementos evaluó y sus
hallazgos (``Outcome``), o dice por qué no aplica; ``RuleReport`` junta una ``RuleResult`` por regla
(``FORMA``, ``OCL-01…08``, ``PROP-01…08``). ``failed_rules()`` y ``verdict()`` son lo que compara la
prueba diferencial con el taller (E4-3); el traductor a ``ValidationIssue`` es de E4-2b.
"""
from dataclasses import dataclass

CUMPLE, INCUMPLE, NO_APLICA = "CUMPLE", "INCUMPLE", "NO_APLICA"
VALID, WITH_ERRORS = "valido", "con-errores"


@dataclass(frozen=True)
class Finding:
    """Un incumplimiento: el elemento (``Escena E02``), su ruta en el documento y la explicación."""

    element: str
    path: str
    message: str


class Outcome:
    """Lo que devuelve cada regla: elementos evaluados, hallazgos y, si no pudo evaluarse, el motivo."""

    __slots__ = ("evaluados", "hallazgos", "no_aplica")

    def __init__(self, evaluados=0, hallazgos=None, no_aplica=None):
        self.evaluados = evaluados
        self.hallazgos = hallazgos or []
        self.no_aplica = no_aplica


@dataclass(frozen=True)
class RuleResult:
    rule: str
    kind: str
    title: str
    state: str
    #: Cuántos elementos evaluó (``None`` en la forma).
    evaluated: int | None
    findings: tuple
    #: El motivo por el que la regla no aplica, si es el caso.
    reason: str | None = None


@dataclass(frozen=True)
class RuleReport:
    results: tuple

    def failed_rules(self):
        return {result.rule for result in self.results if result.state == INCUMPLE}

    def verdict(self):
        return WITH_ERRORS if self.failed_rules() else VALID

    def findings(self):
        return [finding for result in self.results for finding in result.findings]
