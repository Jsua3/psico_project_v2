"""El validador del documento: la forma y las 16 reglas del taller (E4-2a) y el documento completo (E4-2b).

``run_rules(documento)`` hace lo que el validador del taller (Fase 4): primero la **forma**, contra
``dsl-casos.schema.json`` (los errores que el esquema atribuye a ``OCL-01…08`` los evalúa la función de
cada regla, no la forma), y después las ocho reglas ``OCL`` y las ocho ``PROP``, siempre todas. El
resultado es un ``RuleReport``, con los mensajes del taller y sus ids de DSL. La clave ``x-siep`` no es
parte del DSL del taller: se quita antes de mirar la forma.

``validate_document(documento)`` es el validador **único** del documento completo (R17): los límites,
la forma y las 16 reglas del taller con sus mensajes por título (``messages``), ``x-siep`` (esquema,
enlaces, claves, condiciones y métricas: ``siep_check``) y los textos (``text_check``). Devuelve una
lista de ``Issue`` con código ``DSL.*``, gravedad, ruta y mensaje llano; nunca lanza, sea cual sea el
documento.
"""
import functools
import json
import logging
from pathlib import Path

from . import form, limits, messages, siep_check, text_check
from .messages import route_text
from .report import CUMPLE, ERROR, INCUMPLE, NO_APLICA, PREFIX, WARNING, Finding, Issue, Outcome, RuleReport, RuleResult
from .rules import REGISTRY
from . import rules_ocl, rules_prop  # noqa: F401  (registran las reglas, en este orden)

logger = logging.getLogger("siep.casedef")

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


def _rule_issues(report, names):
    """Los hallazgos del taller como ``Issue``: ``DSL.<regla>`` con el mensaje por título."""
    issues = []
    for result in report.results:
        for finding in result.findings:
            path = "" if finding.path == "(raíz)" else finding.path
            # Una escena a la que ninguna opción llega es contenido que nadie vería, no un caso roto.
            severity = WARNING if result.rule == "PROP-02" and path.startswith("escenas[") else ERROR
            issues.append(Issue(f"{PREFIX}{result.rule}", severity, path, messages.plain_message(finding, names)))
    return issues


def _unique(issues):
    """Un hallazgo por código y ruta en los que dos pasadas coinciden (topes y textos largos); el primero gana."""
    seen, kept = set(), []
    for issue in issues:
        shared = issue.code.startswith((PREFIX + "TEXT_", PREFIX + "LIMIT_"))
        key = (issue.code, issue.path) if shared else (issue.code, issue.path, issue.message)
        if key not in seen:
            seen.add(key)
            kept.append(issue)
    return kept


def validate_unguarded(document):
    """Todos los hallazgos del documento completo (R17), sin la red de seguridad de ``validate_document``.

    Cada paso es defensivo con los tipos de lo que lee; esta función existe para que las pruebas vean
    una excepción que la red de seguridad ocultaría.
    """
    exceeded = limits.hard(document)
    if exceeded:  # un documento fuera de los límites duros no se recorre más
        return exceeded
    names = messages.names_of(document)
    return _unique(
        limits.soft(document)
        + _rule_issues(run_rules(document), names)
        + text_check.check(document, names)
        + siep_check.check(document, names)
    )


def validate_document(document):
    """Todos los hallazgos del documento completo (R17), sin lanzar nunca.

    Un documento que llega de fuera puede traer cualquier forma. Si, aun así, un paso falla por algo que
    nadie previó, el documento se rechaza con un error de forma (400 en la importación) y el fallo queda
    en el registro del servidor: jamás un 500 que el autor no sabe cómo arreglar.
    """
    try:
        return validate_unguarded(document)
    except Exception:  # noqa: BLE001 - la red de seguridad de un límite con entradas hostiles
        logger.exception("casedef: el validador falló con un documento ajeno")
        return [Issue(
            f"{PREFIX}FORMA", ERROR, "",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "El documento tiene una forma que no se pudo revisar: comprueba que cada lista, objeto y texto "
            "sea del tipo que indica el formato.",
        )]
