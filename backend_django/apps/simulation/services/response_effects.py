"""El efecto de una respuesta: su clase, el paso de la persona y los hitos que cumple.

``resolve`` es puro: lee los datos de la opción. ``apply`` escribe en el estado del intento a través de
``case_state``.
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


def resolve(decision) -> ResponseEffects:
    """Los efectos de una opción, de sus datos.

    La clase es la de la columna ``response_class``. El paso de la
    persona es el que declara la opción en ``effects.persona`` (una dimensión sin declarar vale 0)
    o, sin él, el de la tabla de su clase. Los hitos salen de ``effects.milestones`` sin repetir.
    """
    response_class = case_state.response_class_of(decision)
    entry = case_rules.effects_of(decision)
    return ResponseEffects(
        response_class=response_class,
        persona_step=case_state.persona_step_of(decision),
        milestones=tuple(dict.fromkeys(entry.get("milestones", ()))),
    )


def apply(attempt, effects: ResponseEffects) -> None:
    """Escribe los hitos y el paso de la persona en el estado del mundo del intento.

    No-op silencioso si el intento no tiene mundo (un nodo sin escena: el motor genérico sin
    mundo). Desde E1-6 leer el mundo ya no lo guarda, así que
    ``ensure_world_state`` lo crea aquí si hace falta.
    """
    world_state = ensure_world_state(attempt)
    if world_state is None:
        return
    case_state.advance(world_state, effects.milestones, effects.persona_step)
