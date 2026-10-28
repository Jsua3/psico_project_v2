"""El estado de un intento en el modelo de respuesta: hitos cumplidos y estado de la persona.

Vive en ``AttemptWorldState.flags_json`` bajo ``milestones`` (lista de claves, en el orden en que
se cumplieron) y ``persona`` (``{"bond": "GUARDED", "activation": "TENSE"}``, los valores de los
enums como cadenas), junto a las demás claves del mundo (``syncedNodeId``, ``positionSyncedAt``…).
No hay columnas nuevas; la migración 0030 dejó los intentos antiguos en este formato.

Quien decide qué escribir es ``response_effects``; este módulo solo lee, escribe y cuenta, y no lo importa (así no hay
ciclo).
"""
from dataclasses import dataclass

from apps.simulation.casedef.vocabulary import (
    DEFAULT_PERSONA_STEP,
    INITIAL_PERSONA,
    LABELS,
    Activation,
    Bond,
    ResponseClass,
    step_persona,
)
from apps.simulation.models import AttemptWorldState
from shared.jsonutils import read_map as _read_map, write_map as _write_map

from . import case_rules


@dataclass(frozen=True)
class CaseState:
    """Lo que el intento lleva cumplido: sus hitos y cómo se muestra la persona."""

    milestones: frozenset[str]
    persona: tuple[Bond, Activation]


def response_class_of(decision) -> ResponseClass:
    """La clase de una opción: la de su columna ``response_class`` (NOT NULL desde la migración 0031).

    Vive aquí, y no en ``response_effects``, para que ``counts`` la use sin que los dos módulos se importen entre sí.
    """
    return ResponseClass(decision.response_class)


def _milestones_of(raw) -> list[str]:
    stored = raw.get("milestones")
    if not isinstance(stored, list):
        return []
    return list(dict.fromkeys(m for m in stored if isinstance(m, str)))


def _enum_or(enum, value, default):
    try:
        return enum(value)
    except ValueError:
        return default


def _persona_of(raw) -> tuple[Bond, Activation]:
    stored = raw.get("persona")
    if not isinstance(stored, dict):
        return INITIAL_PERSONA
    initial_bond, initial_activation = INITIAL_PERSONA
    return (
        _enum_or(Bond, stored.get("bond"), initial_bond),
        _enum_or(Activation, stored.get("activation"), initial_activation),
    )


def _raw_flags(attempt) -> dict:
    state = AttemptWorldState.objects.filter(attempt_id=attempt.id).first()
    return _read_map(state.flags_json) if state is not None else {}


def read(attempt) -> CaseState:
    """El estado del intento tal como está guardado, sin crear el mundo.

    Sin estado guardado, o con claves ausentes o malformadas, parte de los valores iniciales: sin
    hitos y con la persona ``INITIAL_PERSONA``. Nunca lanza.
    """
    raw = _raw_flags(attempt)
    return CaseState(frozenset(_milestones_of(raw)), _persona_of(raw))


def milestones_in_order(attempt) -> tuple[str, ...]:
    """Los hitos cumplidos en el orden en que se cumplieron (el reporte de cierre lo necesita)."""
    return tuple(_milestones_of(_raw_flags(attempt)))


def advance(world_state, milestones, persona_step) -> None:
    """Suma ``milestones`` (sin repetir, en orden) y mueve a la persona un paso en ``world_state``.

    Lee el estado guardado en ``world_state.flags_json``, conserva sus demás claves y lo persiste.
    ``persona_step`` es ``(d_bond, d_activation)``; ``step_persona`` acota los extremos.
    """
    raw = _read_map(world_state.flags_json)
    done = _milestones_of(raw)
    done.extend(m for m in milestones if m not in done)
    bond, activation = step_persona(*_persona_of(raw), *persona_step)
    raw["milestones"] = done
    raw["persona"] = {"bond": bond.value, "activation": activation.value}
    world_state.flags_json = _write_map(raw)
    world_state.save(update_fields=["flags_json", "updated_at"])


def persona_step_of(decision) -> tuple[int, int]:
    """El paso (vínculo, activación) de una opción: el que declara en ``effects.persona`` (una dimensión sin declarar
    vale 0) o, sin él, el de la tabla de su clase."""
    declared = case_rules.effects_of(decision).get("persona")
    if declared:
        return declared.get("bond", 0), declared.get("activation", 0)
    return DEFAULT_PERSONA_STEP[response_class_of(decision)]


def persona_trail(decisions) -> list[tuple[Bond, Activation]]:
    """La persona DESPUÉS de cada decisión, recalculada desde ``INITIAL_PERSONA`` sobre las opciones dadas en orden.

    Es la misma regla con la que se escribe el estado del intento (``advance``), repetida sobre los eventos: así la
    traza docente reconstruye la escena a escena sin guardar nada más. Puro: no toca la base.
    """
    persona = INITIAL_PERSONA
    trail = []
    for decision in decisions:
        persona = step_persona(*persona, *persona_step_of(decision))
        trail.append(persona)
    return trail


def counts(decisions) -> dict[str, int]:
    """Cuántas opciones hay de cada clase: ``{"recommended", "acceptable", "risky", "contraindicated"}``.

    Siempre trae las cuatro claves.
    """
    totals = {member.value.lower(): 0 for member in ResponseClass}
    for decision in decisions:
        totals[response_class_of(decision).value.lower()] += 1
    return totals


def persona_dto(persona: tuple[Bond, Activation]) -> dict[str, str]:
    """La persona tal como viaja al estudiante: ``{"bond", "activation", "label"}`` (valores del enum y frase en palabras)."""
    bond, activation = persona
    return {"bond": bond.value, "activation": activation.value, "label": persona_label(persona)}


def persona_label(persona: tuple[Bond, Activation]) -> str:
    """La persona en palabras para el estudiante: «se muestra cautelosa y tensa»."""
    bond, activation = persona
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23)
    return f"se muestra {LABELS[bond]} y {LABELS[activation]}"
