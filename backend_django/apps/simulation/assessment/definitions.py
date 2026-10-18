"""Definiciones y umbrales de la analítica de aprendizaje (E6-5, RQ-NEG-001 a 005).

Son definiciones operativas **en BORRADOR** hasta que Psicología las confirme (mesa §A20): el sistema entrega el
mecanismo y estos valores por defecto, no sustituye sus decisiones. Se leen de ``settings`` AL LLAMAR y una
configuración inválida nunca rompe una consulta: cae al valor por defecto. La celda mínima es la excepción en
cuanto a que tiene un **piso de privacidad** (5): ni la configuración ni un valor roto pueden publicar celdas
más pequeñas.
"""
from django.conf import settings

from apps.simulation.models import FormativeLevel

#: Estado de todas las definiciones de este módulo; viaja en la respuesta de los agregados (``definitions.status``).
DEFINITIONS_STATUS = "BORRADOR"

#: Piso de la celda mínima: un agregado de menos estudiantes distintos no se publica (mesa §A20, privacidad).
MIN_CELL_FLOOR = 5

REFLECTION_ANY = "ANY"
REFLECTION_PER_DECISION_SCENE = "PER_DECISION_SCENE"
REFLECTION_DEFINITIONS = (REFLECTION_ANY, REFLECTION_PER_DECISION_SCENE)


def acceptable_level():
    """El nivel formativo desde el cual un desempeño cuenta como «Aceptable» (RQ-NEG-002). Por defecto ``LOGRADO``."""
    raw = getattr(settings, "ACCEPTABLE_LEVEL", None)
    if isinstance(raw, str):
        name = raw.strip().upper()
        if name in FormativeLevel.values:
            return FormativeLevel(name)
    return FormativeLevel.LOGRADO


def min_cell_size():
    """Cuántos estudiantes distintos hacen falta para publicar un agregado: la configuración, con piso 5."""
    try:
        configured = int(getattr(settings, "MIN_CELL_SIZE", MIN_CELL_FLOOR))
    except (TypeError, ValueError):
        return MIN_CELL_FLOOR
    return max(MIN_CELL_FLOOR, configured)


def reflection_definition():
    """Qué cuenta como «reflexión» en un cierre (RQ-NEG-003): ``ANY`` (≥ 1 nota) o ``PER_DECISION_SCENE``
    (una nota en cada escena donde hubo una decisión). Por defecto ``ANY``."""
    raw = getattr(settings, "REFLECTION_DEFINITION", None)
    if isinstance(raw, str) and raw.strip().upper() in REFLECTION_DEFINITIONS:
        return raw.strip().upper()
    return REFLECTION_ANY


def survey_enabled():
    """¿Existe la encuesta breve opcional (RQ-NEG-004, C14)? Solo con un booleano verdadero en la configuración."""
    return getattr(settings, "ATTEMPT_FEEDBACK_SURVEY", False) is True
