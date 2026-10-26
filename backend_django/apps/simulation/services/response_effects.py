"""El efecto de una respuesta: su clase, el paso de la persona y los hitos que cumple.

Sustituye a ``decision_effects`` (puntaje, estrés, confianza y riesgo numéricos, y la detección de
revictimización por palabras clave) y a ``case_effects.apply_case_effects`` (banderas y métricas
del caso); ambos se retiran en la Tarea 16. ``resolve`` es puro: lee los datos de la opción.
``apply`` escribe en el estado del intento a través de ``case_state``.
"""
from dataclasses import dataclass

from apps.simulation.casedef.vocabulary import ResponseClass

from . import case_rules, case_state
from .world_state import ensure_world_state


@dataclass(frozen=True)
class ResponseEffects:
    """Lo que una respuesta le hace al intento, ya resuelto."""

    response_class: ResponseClass
    persona_step: tuple[int, int]
    milestones: tuple[str, ...]
    revictimization: bool


def resolve(decision) -> ResponseEffects:
    """Los efectos de una opción, de sus datos.

    La clase es la declarada o, sin ella, la que dan los datos antiguos (R-8). El paso de la
    persona es el que declara la opción en ``effects.persona`` (una dimensión sin declarar vale 0)
    o, sin él, el de la tabla de su clase. Los hitos salen de ``effects.milestones`` sin repetir.
    Solo una ``CONTRAINDICATED`` enciende la revictimización.
    """
    response_class = case_state.response_class_of(decision)
    entry = case_rules.effects_of(decision)
    return ResponseEffects(
        response_class=response_class,
        persona_step=case_state.persona_step_of(decision),
        milestones=tuple(dict.fromkeys(entry.get("milestones", ()))),
        revictimization=response_class is ResponseClass.CONTRAINDICATED,
    )


def apply(attempt, effects: ResponseEffects) -> None:
    """Escribe los hitos y el paso de la persona en el estado del mundo del intento.

    No-op silencioso si el intento no tiene mundo (un nodo sin escena: el motor genérico sin
    mundo), igual que ``apply_case_effects``. Desde E1-6 leer el mundo ya no lo guarda, así que
    ``ensure_world_state`` lo crea aquí si hace falta.
    """
    world_state = ensure_world_state(attempt)
    if world_state is None:
        return
    case_state.advance(world_state, effects.milestones, effects.persona_step)
