"""El vocabulario puro del modelo de respuesta: clases, persona consultante, intensidad y riesgo.

Sin base de datos y sin Django: el módulo bajo prueba lo importan también las migraciones.
"""
import pytest

from apps.simulation.casedef.vocabulary import (
    DEFAULT_PERSONA_STEP,
    INITIAL_PERSONA,
    LABELS,
    Activation,
    Bond,
    Intensity,
    ResponseClass,
    RiskLevel,
    legacy_class,
    step_persona,
)

pytestmark = [pytest.mark.req("RN-08")]


def test_tabla_por_defecto_de_la_persona():
    assert DEFAULT_PERSONA_STEP == {
        ResponseClass.RECOMMENDED: (+1, -1),
        ResponseClass.ACCEPTABLE: (0, 0),
        ResponseClass.RISKY: (-1, 0),
        ResponseClass.CONTRAINDICATED: (-1, +1),
    }


def test_estado_inicial_de_la_persona():
    assert INITIAL_PERSONA == (Bond.GUARDED, Activation.TENSE)


def test_step_persona_se_acota_en_los_extremos():
    assert step_persona(Bond.OPEN, Activation.CALM, +1, -1) == (Bond.OPEN, Activation.CALM)
    assert step_persona(Bond.WITHDRAWN, Activation.CRISIS, -1, +1) == (Bond.WITHDRAWN, Activation.CRISIS)


def test_step_persona_avanza_un_nivel_por_paso():
    assert step_persona(Bond.GUARDED, Activation.TENSE, +1, -1) == (Bond.OPEN, Activation.CALM)
    assert step_persona(Bond.GUARDED, Activation.TENSE, -1, +1) == (Bond.WITHDRAWN, Activation.CRISIS)
    assert step_persona(Bond.GUARDED, Activation.TENSE, 0, 0) == (Bond.GUARDED, Activation.TENSE)


def test_step_persona_acota_saltos_mayores_a_uno():
    assert step_persona(Bond.WITHDRAWN, Activation.CALM, +5, +5) == (Bond.OPEN, Activation.CRISIS)


def test_clases_y_etiquetas():
    assert {c.value for c in ResponseClass} == {"RECOMMENDED", "ACCEPTABLE", "RISKY", "CONTRAINDICATED"}
    assert LABELS[ResponseClass.RECOMMENDED] == "Recomendada"
    assert LABELS[ResponseClass.ACCEPTABLE] == "Aceptable"
    assert LABELS[ResponseClass.RISKY] == "Con riesgo"
    assert LABELS[ResponseClass.CONTRAINDICATED] == "Contraindicada"
    assert LABELS[Bond.WITHDRAWN] == "retraída"
    assert LABELS[Bond.GUARDED] == "cautelosa"
    assert LABELS[Bond.OPEN] == "abierta"
    assert LABELS[Activation.CALM] == "serena"
    assert LABELS[Activation.TENSE] == "tensa"
    assert LABELS[Activation.CRISIS] == "en crisis"
    assert LABELS[Intensity.LOW] == "baja"
    assert LABELS[Intensity.MEDIUM] == "media"
    assert LABELS[Intensity.HIGH] == "alta"
    assert LABELS[RiskLevel.VARIABLE] == "variable"
    assert LABELS[RiskLevel.MODERATE] == "moderado"
    assert LABELS[RiskLevel.SEVERE] == "grave"
    assert LABELS[RiskLevel.EXTREME] == "extremo"


def test_todo_miembro_tiene_etiqueta():
    for enum in (ResponseClass, Bond, Activation, Intensity, RiskLevel):
        for member in enum:
            assert LABELS[member]


def test_los_valores_son_cadenas_en_mayuscula():
    assert ResponseClass.RISKY == "RISKY"
    assert Bond.GUARDED == "GUARDED"
    assert Activation.CRISIS == "CRISIS"
    assert Intensity.MEDIUM == "MEDIUM"
    assert RiskLevel.SEVERE == "SEVERE"


def test_legacy_class_tabla_de_conversion():
    C = ResponseClass
    # La conducta prohibida gana sobre cualquier gravedad.
    assert legacy_class("ADEQUATE", "recommended", True) is C.CONTRAINDICATED
    assert legacy_class(None, None, True) is C.CONTRAINDICATED
    # Crítica es contraindicada.
    assert legacy_class("ADEQUATE", "critical", False) is C.CONTRAINDICATED
    # Cada gravedad.
    assert legacy_class("INADEQUATE", "recommended", False) is C.RECOMMENDED
    assert legacy_class("INADEQUATE", "acceptable", False) is C.ACCEPTABLE
    assert legacy_class("INADEQUATE", "risky", False) is C.RISKY
    # Sin gravedad (o desconocida), por clasificación.
    assert legacy_class("ADEQUATE", None, False) is C.RECOMMENDED
    assert legacy_class("RISKY", None, False) is C.RISKY
    assert legacy_class("INADEQUATE", None, False) is C.CONTRAINDICATED
    assert legacy_class("ADEQUATE", "rara", False) is C.RECOMMENDED
    # Nada reconocible: aceptable.
    assert legacy_class(None, None, False) is C.ACCEPTABLE
    assert legacy_class("rara", "rara", False) is C.ACCEPTABLE
