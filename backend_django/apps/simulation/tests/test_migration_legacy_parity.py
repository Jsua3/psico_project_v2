"""T4b · La migración ``0030`` y ``casedef.legacy`` convierten igual (una tabla espejada, no importada).

``legacy`` dice que la 0030 «queda congelada» y que su tabla se espeja; si una cambia, la otra no sigue sola. Esta
prueba importa el módulo de la migración (su nombre empieza por un número: ``importlib``) y compara las constantes y las
dos funciones puras que ambas comparten, para que la divergencia sea un rojo y no un descuido.
"""
import importlib

import pytest

from apps.simulation.casedef import legacy
from apps.simulation.casedef.vocabulary import legacy_class

migracion = importlib.import_module("apps.simulation.migrations.0030_metrics_model_data")

DECISIVOS = [(), ("a",), ("a", "b"), ("riesgo_feminicidio_valorado", "medidas_proteccion_activadas", "asesoria_derechos_realizada")]


def test_las_constantes_de_la_conversion_son_las_mismas():
    assert migracion.NEGATIVE_FLAGS == legacy.NEGATIVE_FLAGS
    assert migracion.LEGACY_EFFECT_KEYS == legacy.LEGACY_EFFECT_KEYS
    assert migracion.ENDING_KEY_MAP == legacy.ENDING_KEY_MAP
    assert migracion.TEMPLATE_ORDER == legacy.TEMPLATE_ORDER
    assert migracion.VBG_DECISIVE == legacy.DECISIVE_BY_CASE[migracion.VBG_CODE]


@pytest.mark.parametrize("decisivos", DECISIVOS, ids=["sin-decisivos", "uno", "dos", "los-de-vbg"])
def test_la_condicion_de_cada_final_de_plantilla_es_la_misma(decisivos):
    en_legacy = legacy.template_endings_when(decisivos)

    for clave in legacy.TEMPLATE_ORDER:
        assert migracion._template_when(clave, decisivos) == en_legacy[clave], clave


def test_el_rotulo_de_un_hito_sin_texto_propio_es_el_mismo():
    for clave in ("riesgo_feminicidio_valorado", "x", "con_guion_bajo", ""):
        assert migracion._label(clave) == legacy.milestone_label(clave)


def test_una_condicion_con_el_vocabulario_antiguo_se_reconoce_igual():
    condiciones = [
        {"flag": "x"}, {"metric": "confianza", "gte": 5}, {"count": "critical", "gte": 1},
        {"all": [{"any": [{"flag": "x"}]}]}, {"not": {"milestone": "a"}}, {"count": "risky", "gte": 3}, "texto", None,
    ]
    for condicion in condiciones:
        assert migracion._uses_legacy(condicion) == legacy.uses_legacy_condition(condicion), condicion


def test_los_finales_de_la_migracion_y_los_de_legacy_salen_iguales():
    antiguos = [
        {"key": "critico", "title": "T1", "message": "M1", "tone": "critical", "when": {"flag": "x"}},
        {"key": "propio", "title": "T2", "message": "M2", "tone": "neutral", "when": {"milestone": "a"}},
        {"key": "propio_roto", "title": "T3", "message": "M3", "when": {"metric": "m", "gte": 1}},
        {"key": "brechas", "title": "T4", "message": "M4", "tone": "neutral"},
        {"key": "integral", "title": "T5", "message": "M5", "tone": "positive"},
    ]
    decisivos = ("a", "b")
    notas_migracion, notas_legacy = [], []

    de_migracion = migracion._migrate_endings(antiguos, decisivos, notas_migracion)
    de_legacy = legacy.convert_endings(antiguos, decisivos, notas_legacy)

    assert de_migracion == de_legacy
    assert notas_migracion == notas_legacy and notas_legacy


def test_la_clase_de_una_opcion_antigua_viene_de_una_sola_tabla():
    """Las migraciones 0030 y 0031 no copian ``legacy_class``: la importan (y 0031 la deja congelada en su comentario)."""
    contraccion = importlib.import_module("apps.simulation.migrations.0031_drop_legacy_metrics")

    assert migracion.legacy_class is legacy_class and contraccion.legacy_class is legacy_class
