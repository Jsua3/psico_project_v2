"""La evidencia de aprendizaje de un intento cerrado (E6-1d, RQ-NEG-003, RQ-NEG-004; mesa §A20).

Tres cálculos puros que el reporte congelado v2 guarda al cerrar: cuántas decisiones **no recomendadas** tomó la persona,
si **reflexionó** (según la definición vigente) y si el intento es **evidencia clave** de aprendizaje (completado, con
reflexión y con un perfil de competencias). Las definiciones están en BORRADOR hasta que Psicología las confirme.
"""
from apps.simulation.casedef.vocabulary import ResponseClass
from apps.simulation.services import case_effects
from apps.simulation.services.case_state import response_class_of

from .definitions import REFLECTION_PER_DECISION_SCENE


def _registered_decisions(events):
    return [
        event for event in events
        if event.decision_option_id is not None and event.event_type in case_effects.REGISTERED_DECISION_EVENT_TYPES
    ]


def non_recommended_count(events):
    """Decisiones registradas «con riesgo» o «contraindicadas» (los reintentos no se aplicaron: no cuentan)."""
    return sum(
        1 for event in _registered_decisions(events)
        if response_class_of(event.decision_option) in (ResponseClass.RISKY, ResponseClass.CONTRAINDICATED)
    )


def decision_scene_ids(events):
    """Las escenas donde la persona tomó una decisión registrada, sin repetir y en orden."""
    return sorted({event.node_id for event in _registered_decisions(events) if event.node_id is not None})


def reflection_coverage(reflection_node_ids, decision_scene_ids, definition):
    """``{definition, reflections, decisionScenes, covered}`` según qué cuenta como reflexión.

    ``ANY``: al menos una nota. ``PER_DECISION_SCENE``: una nota en cada escena donde hubo una decisión (y al menos
    una escena con decisión). Los conteos son de escenas distintas; el texto de las notas nunca llega aquí.
    """
    reflected, scenes = set(reflection_node_ids), set(decision_scene_ids)
    if definition == REFLECTION_PER_DECISION_SCENE:
        covered = bool(scenes) and scenes <= reflected
    else:
        covered = bool(reflected)
    return {"definition": definition, "reflections": len(reflected), "decisionScenes": len(scenes), "covered": covered}


def key_learning_evidence(attempt_completed, coverage, competency_levels):
    """«Evidencia clave» (RQ-NEG-004): intento completado, con reflexión y con al menos un nivel de competencia."""
    return bool(
        attempt_completed
        and coverage["covered"]
        and any(entry["level"] is not None for entry in competency_levels)
    )
