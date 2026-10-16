"""Condiciones de los finales del caso como datos (E3-8, R11, RNF-008).

Una condición es un árbol JSON; ``evaluate`` lo recorre **sin** ``eval`` ni ``exec``: una cadena
con código es solo un nombre que no existe (y por tanto ``False``). El vocabulario:

    {"all": [c, …]}                     todas se cumplen (lista vacía: verdadera)
    {"any": [c, …]}                     alguna se cumple (lista vacía: falsa)
    {"not": c}                          la negación
    {"flag": "pap_aplicado"}            la bandera clínica está encendida
    {"metric": "confianza", "gte": 60}  una métrica del caso contra un número
    {"count": "critical", "eq": 0}      cuántas decisiones registradas de esa severidad

Comparadores (``gte``, ``gt``, ``lte``, ``lt``, ``eq``): si hay varios, se cumplen todos. El
contexto es ``{"flags": {…}, "metrics": {…}, "counts": {…}}``. Cualquier cosa que no sea una
condición conocida —tipo equivocado, clave desconocida, métrica que el caso no declara, anidada
más allá de ``MAX_DEPTH``— evalúa a ``False``: un dato malformado nunca rompe una partida, solo
hace que ese final no aplique.
"""
COMPARATORS = ("gte", "gt", "lte", "lt", "eq")
COUNT_NAMES = ("recommended", "acceptable", "risky", "critical")
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
    if "flag" in condition:
        name = condition["flag"]
        flags = context.get("flags")
        if not _only(condition, "flag") or not isinstance(name, str) or not isinstance(flags, dict):
            return False
        return bool(flags.get(name))
    if "metric" in condition:
        name = condition["metric"]
        metrics = context.get("metrics")
        if not _only(condition, "metric", *COMPARATORS) or not isinstance(name, str):
            return False
        if not isinstance(metrics, dict) or name not in metrics:
            return False
        return _compare(metrics[name], condition)
    if "count" in condition:
        name = condition["count"]
        counts = context.get("counts")
        if not _only(condition, "count", *COMPARATORS) or name not in COUNT_NAMES:
            return False
        if not isinstance(counts, dict):
            return False
        return _compare(counts.get(name, 0), condition)
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
    if "flag" in condition:
        return _only(condition, "flag") and isinstance(condition["flag"], str) and bool(condition["flag"])
    if "metric" in condition or "count" in condition:
        subject = "metric" if "metric" in condition else "count"
        if not _only(condition, subject, *COMPARATORS):
            return False
        name = condition[subject]
        known = isinstance(name, str) and bool(name) if subject == "metric" else name in COUNT_NAMES
        comparators = [condition[c] for c in COMPARATORS if c in condition]
        return known and bool(comparators) and all(_is_number(bound) for bound in comparators)
    return False
