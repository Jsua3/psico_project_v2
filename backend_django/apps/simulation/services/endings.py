"""El final del caso por hitos y clases de respuesta, con una plantilla automática (Tarea 6 del modelo de métricas).

Las condiciones usan el vocabulario de ``casedef.conditions``: ``milestone``, ``count`` por clase de respuesta y
``persona``.

- Un caso puede declarar sus propios finales (``rules.endings``); si los declara, ganan a la plantilla.
- Si no declara ninguno, aplica la plantilla: ``critica`` → ``protectora`` → ``riesgo_persistente`` → ``con_brechas``.
  Sus condiciones las arma ``casedef.legacy.template_endings_when`` (la misma conversión que hizo la migración
  ``0030``) sobre los hitos decisivos del caso. Cualquier caso termina con un final (Revisión de foco 2): también el
  que no declara hitos decisivos ni finales propios y el intento que se completa sin decisiones registradas (el
  antiguo motor devolvía ``None``); a ese le toca lo que la tabla da a «nada contraindicado, nada con riesgo». Con cero
  hitos decisivos «falta algún hito decisivo» nunca se cumple (no hay nada que falte): ``critica`` pide entonces dos o
  más contraindicadas.
- ``reason`` explica el final en palabras (qué hitos decisivos se cumplieron, cuántas respuestas contraindicadas o con
  riesgo y, en un final propio que mira a la persona, cómo se muestra); un conteo de hechos no es una medida.
- Un ``when`` roto no aplica y nunca rompe la partida: ``conditions.evaluate`` lo evalúa a falso.
"""
from typing import NotRequired, TypedDict

from apps.simulation.casedef import conditions, legacy
from apps.simulation.models import REGISTERED_DECISION_EVENT_TYPES, AttemptStatus

from . import case_rules, case_state


class Ending(TypedDict):
    """Un final del caso; sin ``when`` es el de por defecto (aplica siempre que se llega a él)."""

    key: str
    title: str
    message: str
    tone: str
    when: NotRequired[dict]


# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23): los nombres y los textos de
# los cuatro finales de plantilla están a confirmar con Psicología (preguntas 13 y 21 de §5).
_TEMPLATE_TEXTS = {
    "critica": (
        "Intervención con riesgo de revictimización",
        "Alguna de tus respuestas pudo hacerle daño a la persona usuaria, o quedaron sin darse pasos de protección "
        "que el caso exigía. Revisa tu recorrido con tu docente.",
        "critical",
    ),
    "protectora": (
        "Intervención protectora",
        "Cuidaste a la persona usuaria y diste los pasos de protección que el caso pedía. Repasa tu recorrido para "
        "ver qué te funcionó.",
        "positive",
    ),
    "riesgo_persistente": (
        "El riesgo sigue abierto",
        "Quedó pendiente alguno de los pasos de protección, o varias de tus respuestas dejaron a la persona usuaria "
        "en riesgo. Revisa con tu docente qué faltó.",
        "warning",
    ),
    "con_brechas": (
        "Intervención con brechas",
        "Hiciste parte del trabajo, pero quedaron respuestas por mejorar. Repasa tu recorrido y piensa qué harías "
        "distinto.",
        "neutral",
    ),
}


def build_template(rules: case_rules.CaseRules) -> tuple[Ending, ...]:
    """Los cuatro finales de plantilla del caso, en el orden en que se evalúan.

    Las condiciones salen de los hitos decisivos de ``rules``; ``con_brechas`` no trae ``when``: es el de por defecto.
    """
    decisive = [milestone.key for milestone in rules.milestones if milestone.decisive]
    when_by_key = legacy.template_endings_when(decisive)
    template = []
    for key in legacy.TEMPLATE_ORDER:
        title, message, tone = _TEMPLATE_TEXTS[key]
        ending: Ending = {"key": key, "title": title, "message": message, "tone": tone}
        if when_by_key[key] is not None:
            ending["when"] = when_by_key[key]
        template.append(ending)
    return tuple(template)


def stored_endings_are_template(rules: case_rules.CaseRules) -> bool:
    """``True`` si los finales guardados son los cuatro de la plantilla, aunque el docente haya reescrito su título o su mensaje.

    Lo son cuando sus claves, en orden, y sus ``when`` coinciden exactamente con los de ``build_template`` para los hitos
    decisivos de ahora. El editor los guarda así cuando el docente solo reescribe los textos de la plantilla: para la
    publicación siguen siendo la plantilla (un final inalcanzable es un aviso) y no finales propios. Sin finales guardados
    no hay nada que reconocer: ``False``.
    """
    stored = tuple(rules.endings)
    if not stored:
        return False
    template = build_template(rules)
    return len(stored) == len(template) and all(
        isinstance(mine, dict) and mine.get("key") == base["key"] and mine.get("when") == base.get("when")
        for mine, base in zip(stored, template)
    )


def endings_of(rules: case_rules.CaseRules) -> tuple[Ending, ...]:
    """Los finales de la versión: los propios si declara alguno (ganan a la plantilla) y, si no, la plantilla."""
    return tuple(rules.endings) if rules.endings else build_template(rules)


def _context(state: case_state.CaseState, decisions) -> dict:
    bond, activation = state.persona
    return {
        "milestones": set(state.milestones),
        "persona": {"bond": bond.value, "activation": activation.value},
        "counts": case_state.counts(decisions),
    }


def _mentions_persona(condition) -> bool:
    if isinstance(condition, list):
        return any(_mentions_persona(item) for item in condition)
    if not isinstance(condition, dict):
        return False
    return "persona" in condition or any(_mentions_persona(value) for value in condition.values())


def _reason(rules: case_rules.CaseRules, ending: Ending, context: dict, persona) -> list[str]:
    """Las frases en palabras que explican el final: hitos decisivos, respuestas contraindicadas o con riesgo, persona."""
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23)
    phrases = []
    for milestone in rules.milestones:
        if milestone.decisive:
            done = milestone.key in context["milestones"]
            phrases.append(f"{'Cumpliste' if done else 'Faltó'}: {milestone.label}")
    contraindicated = context["counts"]["contraindicated"]
    if contraindicated:
        phrases.append(
            "Una respuesta contraindicada" if contraindicated == 1 else f"{contraindicated} respuestas contraindicadas"
        )
    risky = context["counts"]["risky"]
    if risky:
        phrases.append("Una respuesta con riesgo" if risky == 1 else f"{risky} respuestas con riesgo")
    if _mentions_persona(ending.get("when")):
        phrases.append(f"La persona usuaria {case_state.persona_label(persona)}")
    return phrases


def compute_ending(attempt, events) -> dict | None:
    """El final del intento completado: ``{key, title, message, tone, reason}``, o ``None``.

    ``None`` si el intento no está completado o si todos los finales (propios) traen ``when`` y ninguno se cumple.
    Gana el primero, en orden, cuyo ``when`` se cumple o que no trae ``when``. Las decisiones que cuentan son las
    registradas (no los reintentos).
    """
    if attempt.status != AttemptStatus.COMPLETED:
        return None
    version = getattr(attempt, "case_version", None)
    rules = case_rules.rules_of(version) if version is not None else case_rules.CaseRules()
    decisions = [
        event.decision_option
        for event in events
        if event.decision_option_id and event.event_type in REGISTERED_DECISION_EVENT_TYPES
    ]
    state = case_state.read(attempt)
    context = _context(state, decisions)
    for ending in endings_of(rules):
        if "when" in ending and not conditions.evaluate(ending["when"], context):
            continue
        return {
            "key": ending["key"],
            "title": ending["title"],
            "message": ending["message"],
            "tone": ending["tone"],
            "reason": _reason(rules, ending, context, state.persona),
        }
    return None
