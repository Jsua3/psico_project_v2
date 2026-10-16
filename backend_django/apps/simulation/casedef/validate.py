"""El validador del documento base: forma + las 16 reglas del taller (E4-2a).

``run_rules(documento)`` hace lo que el validador del taller (Fase 4): primero la **forma**, contra
``dsl-casos.schema.json`` (los errores que el esquema atribuye a ``OCL-01…08`` los evalúa la función de
cada regla, no la forma), y después las ocho reglas ``OCL`` y las ocho ``PROP``, siempre todas. El
resultado es un ``RuleReport``. La clave ``x-siep`` no es parte del DSL del taller: se quita antes de
mirar la forma (su validación es de E4-2b). Aquí no hay mensajes llanos ni ``ValidationIssue``: eso es
del traductor de E4-2b; los mensajes de este informe son los del taller, con los ids de DSL.
"""
import functools
import json
from pathlib import Path

from . import form
from .report import CUMPLE, INCUMPLE, NO_APLICA, Finding, Outcome, RuleReport, RuleResult
from .rules import REGISTRY
from . import rules_ocl, rules_prop  # noqa: F401  (registran las reglas, en este orden)

SCHEMA_NAME = "dsl-casos.schema.json"
SIEP_KEY = "x-siep"
OCL_IDS = tuple(f"OCL-0{n}" for n in range(1, 9))

#: Reglas que hace cumplir solo el esquema (Fase 3, §6.2) y que el informe de forma nombra.
FORM_RULES = {
    "INV-09": "todo caso declara su escena inicial",
    "INV-12": "una opción marcada como conducta prohibida documenta su motivo",
    "INV-19": "la bitácora se bloquea cuando el intento termina o es reemplazado, y no antes",
    "INV-20": "una evaluación EVALUADA tiene fecha y al menos una valoración",
    "RN-03": "solo un caso publicado se ejecuta; con intentos no puede estar en BORRADOR",
}

_ROUTE_LABELS = {
    "caso": "Caso", "personajes": "Personaje", "herramientas": "Herramienta", "escenas": "Escena",
    "decision": "Decisión", "opciones": "Opción", "retroalimentacion": "Retroalimentación",
    "rubricas": "Rúbrica", "criterios": "Criterio", "estudiantes": "Estudiante", "intentos": "Intento",
    "bitacora": "Bitácora", "decisiones": "Registro de decisión", "reflexiones": "Reflexión",
    "evaluaciones": "Evaluación", "valoraciones": "Valoración",
}


@functools.lru_cache(maxsize=1)
def base_schema():
    """El esquema del taller (copia literal en ``casedef/schema``)."""
    return json.loads((Path(__file__).parent / "schema" / SCHEMA_NAME).read_text(encoding="utf-8"))


def route_text(route):
    """``('escenas', 1, 'decision')`` → ``'escenas[1].decision'``."""
    text = ""
    for step in route:
        if isinstance(step, int):
            text += f"[{step}]"
        else:
            text += ("." if text else "") + str(step)
    return text or "(raíz)"


def _label(kind, obj):
    ident = obj.get("id")
    if isinstance(ident, str):
        return f"{kind} {ident}"
    if "orden" in obj:
        return f"{kind} {obj['orden']}"
    if isinstance(obj.get("escena"), str):
        return f"{kind} sobre la escena {obj['escena']}"
    return kind


def element_at(document, route):
    """Nombre legible del elemento más cercano con identificador que contiene la ruta."""
    node, label, key = document, "Documento", None
    for step in route:
        try:
            node = node[step]
        except (KeyError, IndexError, TypeError):
            break
        if isinstance(step, str):
            key = step
            if step in _ROUTE_LABELS and isinstance(node, dict):
                label = _label(_ROUTE_LABELS[step], node)
        elif key in _ROUTE_LABELS and isinstance(node, dict):
            label = _label(_ROUTE_LABELS[key], node)
    return label


def _form_message(error):
    if not error.rule:
        return error.message + "."
    detail = FORM_RULES.get(error.rule)
    suffix = f" (regla: {detail})" if detail else ""
    return f"[{error.rule}] {error.message}{suffix}."


def _form_result(document, schema):
    if not isinstance(document, dict):
        finding = Finding("Documento", "(raíz)", "El documento DSL debe ser un objeto JSON.")
        return RuleResult("FORMA", "FORMA", "El documento es un objeto JSON", INCUMPLE, 1, (finding,))
    base = {key: value for key, value in document.items() if key != SIEP_KEY}
    # Los errores que el esquema atribuye a OCL-01..OCL-08 los evalúa la función de cada regla.
    own = [error for error in form.errors(schema, base) if error.rule not in OCL_IDS]
    findings = tuple(
        Finding(element_at(base, error.path), route_text(error.path), _form_message(error)) for error in own
    )
    return RuleResult(
        "FORMA", "FORMA", f"Forma del documento según {SCHEMA_NAME}",
        INCUMPLE if findings else CUMPLE, None, findings,
    )


def run_rules(document, schema=None):
    """El ``RuleReport`` de ``document``: la forma y las 16 reglas del taller, todas."""
    schema = schema or base_schema()
    results = [_form_result(document, schema)]
    subject = document if isinstance(document, dict) else {}
    for spec in REGISTRY:
        try:
            outcome = spec.function(subject)
        except Exception as exc:  # noqa: BLE001 - una regla que falla no debe tumbar el informe
            outcome = Outcome(0, [Finding("(interno)", "", f"Error interno al evaluar la regla: {type(exc).__name__}: {exc}")])
        state = NO_APLICA if outcome.no_aplica else (INCUMPLE if outcome.hallazgos else CUMPLE)
        results.append(RuleResult(
            spec.id, spec.kind, spec.title, state, outcome.evaluados, tuple(outcome.hallazgos), outcome.no_aplica,
        ))
    return RuleReport(tuple(results))
