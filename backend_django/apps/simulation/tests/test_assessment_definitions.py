"""E6-5 · Definiciones y umbrales de la analítica como configuración (RQ-NEG-001 a 005).

Son definiciones operativas en BORRADOR hasta que Psicología las confirme (mesa §A20): el nivel que cuenta como
«Aceptable», la celda mínima por debajo de la cual no se publica un agregado, qué es una reflexión y si la encuesta
breve existe. Se leen de ``settings`` AL LLAMAR (como las banderas del contrato) y una configuración inválida nunca
rompe una consulta: cae al valor por defecto, salvo la celda mínima, que tiene un piso de privacidad.
"""
import pytest

from apps.simulation.assessment import definitions
from apps.simulation.models import FormativeLevel

pytestmark = [
    pytest.mark.req("RQ-NEG-001"),
    pytest.mark.req("RQ-NEG-002"),
    pytest.mark.req("RQ-NEG-003"),
    pytest.mark.req("RQ-NEG-004"),
    pytest.mark.req("RQ-NEG-005"),
]


def test_sin_configurar_las_definiciones_son_las_del_borrador():
    assert definitions.acceptable_level() == FormativeLevel.LOGRADO
    assert definitions.min_cell_size() == 5
    assert definitions.reflection_definition() == "ANY"
    assert definitions.survey_enabled() is False
    assert definitions.DEFINITIONS_STATUS == "BORRADOR"


@pytest.mark.parametrize(
    ("configured", "expected"),
    [(3, 5), (0, 5), (-4, 5), (5, 5), (12, 12), ("8", 8), ("abc", 5), (None, 5), (True, 5), (7.9, 7)],
)
def test_la_celda_minima_nunca_baja_de_5(settings, configured, expected):
    """El piso es de privacidad: ni la configuración ni un valor roto pueden publicar celdas más pequeñas."""
    settings.MIN_CELL_SIZE = configured

    assert definitions.min_cell_size() == expected


@pytest.mark.parametrize(
    ("configured", "expected"),
    [
        ("EN_INICIO", FormativeLevel.EN_INICIO),
        ("DESTACADO", FormativeLevel.DESTACADO),
        ("LOGRADO", FormativeLevel.LOGRADO),
        ("destacado", FormativeLevel.DESTACADO),
        ("en_inicio", FormativeLevel.EN_INICIO),
        ("  EN_PROCESO ", FormativeLevel.EN_PROCESO),
        ("EXCELENTE", FormativeLevel.LOGRADO),
        ("", FormativeLevel.LOGRADO),
        (None, FormativeLevel.LOGRADO),
        (3, FormativeLevel.LOGRADO),
    ],
)
def test_el_nivel_aceptable_es_uno_de_los_cuatro_o_el_del_borrador(settings, configured, expected):
    settings.ACCEPTABLE_LEVEL = configured

    assert definitions.acceptable_level() == expected


@pytest.mark.parametrize(
    ("configured", "expected"),
    [("PER_DECISION_SCENE", "PER_DECISION_SCENE"), ("per_decision_scene", "PER_DECISION_SCENE"), ("ANY", "ANY"),
     ("otra", "ANY"), ("", "ANY"), (None, "ANY"), (1, "ANY")],
)
def test_la_definicion_de_reflexion_es_una_de_las_dos_o_la_del_borrador(settings, configured, expected):
    settings.REFLECTION_DEFINITION = configured

    assert definitions.reflection_definition() == expected


@pytest.mark.parametrize(("configured", "expected"), [(True, True), (False, False), (None, False), ("true", False)])
def test_la_encuesta_solo_existe_con_la_bandera_encendida(settings, configured, expected):
    """Solo un booleano verdadero la enciende: un texto suelto en la configuración no abre un endpoint."""
    settings.ATTEMPT_FEEDBACK_SURVEY = configured

    assert definitions.survey_enabled() is expected
