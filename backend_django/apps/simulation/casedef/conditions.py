"""Condiciones de los finales del caso como datos (E3-8, R11, RNF-008).

Una condición es un árbol JSON; ``evaluate`` lo recorre **sin** ``eval`` ni ``exec``: una cadena
con código es solo un nombre que no existe (y por tanto ``False``). El vocabulario:

    {"all": [c, …]}                     todas se cumplen (lista vacía: verdadera)
    {"any": [c, …]}                     alguna se cumple (lista vacía: falsa)
    {"not": c}                          la negación
    {"milestone": "derivo_a_comisaria"} el hito está cumplido
    {"count": "contraindicated", "gte": 1}  cuántas respuestas de esa clase (las clases son ``recommended``,
                                        ``acceptable``, ``risky`` y ``contraindicated``)
    {"persona": {"bond": "OPEN"}}       el estado de la persona consultante: ``bond`` ∈
                                        WITHDRAWN|GUARDED|OPEN y ``activation`` ∈ CALM|TENSE|CRISIS; si trae las
                                        dos, se cumplen ambas

Comparadores (``gte``, ``gt``, ``lte``, ``lt``, ``eq``): si hay varios, se cumplen todos. El contexto es
``{"counts": {…}, "milestones": {…}, "persona": {"bond": …, "activation": …}}``. Cualquier cosa que no sea una
condición conocida —tipo equivocado, clave desconocida (también el vocabulario del modelo antiguo: ``flag``, ``metric``
y el conteo por severidad), anidada más allá de ``MAX_DEPTH``— evalúa a ``False``: un dato malformado nunca rompe una
partida, solo hace que ese final no aplique. El documento 1.0 se valida con ``legacy.is_valid_condition``, que sí
conoce el vocabulario antiguo.
"""
from apps.simulation.casedef.vocabulary import Activation, Bond

COMPARATORS = ("gte", "gt", "lte", "lt", "eq")
#: Lo que se puede contar: las clases de respuesta (en minúscula).
COUNT_NAMES = ("recommended", "acceptable", "risky", "contraindicated")
#: Dimensiones de la persona consultante y los valores que cada una admite.
PERSONA_DIMENSIONS = {
    "bond": tuple(member.value for member in Bond),
    "activation": tuple(member.value for member in Activation),
}
#: Hasta dónde se anida una condición; más allá es un dato roto, no un reglamento.
MAX_DEPTH = 12

_GROUPS = ("all", "any")


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _compare(value, spec):
    """``True`` si ``value`` cumple **todos** los comparadores de ``spec`` (y hay al menos uno)."""
    present = [(name, spec[name]) for name in COMPARATORS if name in spec]
    if not present or not _is_number(value):
        return False
    for name, bound in present:
        if not _is_number(bound):
            return False
        if name == "gte" and not value >= bound:
            return False
        if name == "gt" and not value > bound:
            return False
        if name == "lte" and not value <= bound:
            return False
        if name == "lt" and not value < bound:
            return False
        if name == "eq" and not value == bound:
            return False
    return True


def _only(condition, *allowed):
    return set(condition) <= set(allowed)


def _persona_spec_valid(spec):
    """¿``spec`` es un ``{"bond"|"activation": valor}`` no vacío, con valores del vocabulario?"""
    return (
        isinstance(spec, dict)
        and bool(spec)
        and all(
            dimension in PERSONA_DIMENSIONS
            and isinstance(value, str)
            and value in PERSONA_DIMENSIONS[dimension]
            for dimension, value in spec.items()
        )
    )


def evaluate(condition, context, _depth=0):
    """El valor de verdad de ``condition`` con ``context``; ``False`` ante todo lo desconocido."""
    if _depth > MAX_DEPTH or not isinstance(condition, dict):
        return False
    context = context if isinstance(context, dict) else {}
    next_depth = _depth + 1

    for group in _GROUPS:
        if group in condition:
            items = condition[group]
            if not _only(condition, group) or not isinstance(items, list):
                return False
            results = (evaluate(item, context, next_depth) for item in items)
            return all(results) if group == "all" else any(results)
    if "not" in condition:
        if not _only(condition, "not"):
            return False
        inner = condition["not"]
        # ``not`` de algo desconocido no vuelve verdadero lo malformado: sigue siendo falso.
        return is_valid(inner) and not evaluate(inner, context, next_depth)
    if "count" in condition:
        name = condition["count"]
        counts = context.get("counts")
        if not _only(condition, "count", *COMPARATORS) or name not in COUNT_NAMES:
            return False
        if not isinstance(counts, dict):
            return False
        return _compare(counts.get(name, 0), condition)
    if "milestone" in condition:
        key = condition["milestone"]
        milestones = context.get("milestones")
        if not _only(condition, "milestone") or not isinstance(key, str) or not key:
            return False
        if not isinstance(milestones, (set, frozenset, list, tuple)):
            return False
        return key in milestones
    if "persona" in condition:
        spec = condition["persona"]
        persona = context.get("persona")
        if not _only(condition, "persona") or not _persona_spec_valid(spec) or not isinstance(persona, dict):
            return False
        return all(persona.get(dimension) == value for dimension, value in spec.items())
    return False


def is_valid(condition, _depth=0):
    """¿Es una condición del vocabulario, completa y bien formada? (la regla de guardado, R11)."""
    if _depth > MAX_DEPTH or not isinstance(condition, dict):
        return False
    next_depth = _depth + 1
    for group in _GROUPS:
        if group in condition:
            items = condition[group]
            return (
                _only(condition, group)
                and isinstance(items, list)
                and all(is_valid(item, next_depth) for item in items)
            )
    if "not" in condition:
        return _only(condition, "not") and is_valid(condition["not"], next_depth)
    if "count" in condition:
        if not _only(condition, "count", *COMPARATORS):
            return False
        comparators = [condition[c] for c in COMPARATORS if c in condition]
        return condition["count"] in COUNT_NAMES and bool(comparators) and all(_is_number(bound) for bound in comparators)
    if "milestone" in condition:
        return _only(condition, "milestone") and isinstance(condition["milestone"], str) and bool(condition["milestone"])
    if "persona" in condition:
        return _only(condition, "persona") and _persona_spec_valid(condition["persona"])
    return False
