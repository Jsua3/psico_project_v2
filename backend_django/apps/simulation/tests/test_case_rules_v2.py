"""Modelo de métricas nuevo · Reglas y efectos: hitos, nivel de riesgo y estado de la persona.

Sin base de datos. ``rules_of`` lee con indulgencia (lo roto se descarta, nunca lanza);
``validate_effects`` es estricto (400 con ``field: effects``); lo viejo sigue funcionando.
"""
import json
from types import SimpleNamespace

import pytest

from apps.simulation.casedef.vocabulary import RiskLevel
from apps.simulation.services.case_rules import (
    MAX_EFFECT_ENTRIES,
    CaseRules,
    Milestone,
    normalize_effects,
    rules_of,
    validate_effects,
)
from shared.exceptions import ApiError

pytestmark = [pytest.mark.req("RN-08")]


def _rules(raw):
    """``rules_of`` sobre una versión cuya columna ``rules`` guarda ``raw`` como JSON (TEXT)."""
    return rules_of(SimpleNamespace(rules=json.dumps(raw)))


# ─── los hitos y el nivel de riesgo en las reglas ─────────────────────────────────────────────
def test_a_case_without_the_new_rules_has_no_milestones_and_no_risk_level():
    rules = CaseRules()

    assert rules.milestones == () and rules.risk_level is None
    assert _rules({}).milestones == () and _rules({}).risk_level is None
    assert rules_of(SimpleNamespace(rules=None)).milestones == ()
    assert rules_of(SimpleNamespace(rules="{no es json")).milestones == ()


def test_milestones_are_parsed_with_their_defaults():
    rules = _rules(
        {
            "milestones": [
                {"key": "recomendo_proteccion", "label": "Recomendar medidas de protección", "decisive": True},
                {"key": "escucho", "label": "Escuchar", "description": "Sin interrumpir."},
            ]
        }
    )

    assert rules.milestones == (
        Milestone("recomendo_proteccion", "Recomendar medidas de protección", "", True),
        Milestone("escucho", "Escuchar", "Sin interrumpir.", False),
    )


def test_broken_and_duplicated_milestones_are_dropped_never_raised():
    rules = _rules(
        {
            "milestones": [
                "texto",
                None,
                {"label": "Sin clave"},
                {"key": "con espacio", "label": "Clave inválida"},
                {"key": 7, "label": "Clave numérica"},
                {"key": "sin_etiqueta"},
                {"key": "etiqueta_vacia", "label": "  "},
                {"key": "ok", "label": "Bueno", "description": 5, "decisive": "si"},
                {"key": "ok", "label": "Repetido"},
            ]
        }
    )

    assert rules.milestones == (Milestone("ok", "Bueno", "", False),)


@pytest.mark.parametrize("raw", ["texto", {"key": "a"}, 5, None])
def test_milestones_that_are_not_a_list_are_ignored(raw):
    assert _rules({"milestones": raw}).milestones == ()


@pytest.mark.parametrize("name", ["VARIABLE", "MODERATE", "SEVERE", "EXTREME"])
def test_the_risk_level_is_one_of_the_four_levels(name):
    assert _rules({"riskLevel": name}).risk_level is RiskLevel(name)


@pytest.mark.parametrize("raw", ["EXTREMO", "extreme", "", 3, ["SEVERE"], None])
def test_an_unknown_risk_level_is_none(raw):
    assert _rules({"riskLevel": raw}).risk_level is None


def test_endings_keep_a_condition_of_the_new_vocabulary():
    when = {"all": [{"milestone": "a"}, {"persona": {"bond": "OPEN"}}, {"count": "risky", "lte": 1}]}

    rules = _rules({"endings": [{"key": "protectora", "title": "Protectora", "when": when}]})

    assert rules.endings[0]["when"] == when


# ─── normalize_effects: lo nuevo, indulgente ──────────────────────────────────────────────────
def test_normalize_keeps_a_valid_persona_and_milestones():
    raw = {"persona": {"bond": 1, "activation": -1}, "milestones": ["a", "b"], "competencies": {"C1": "LOGRADO"}}

    assert normalize_effects(raw) == raw


def test_normalize_keeps_only_the_valid_persona_keys():
    assert normalize_effects({"persona": {"bond": 2, "activation": 0}}) == {"persona": {"activation": 0}}
    assert normalize_effects({"persona": {"bond": True, "activation": "1", "otra": 1}}) == {}
    assert normalize_effects({"persona": {"bond": -1, "activation": 1.0}}) == {"persona": {"bond": -1}}


def test_normalize_drops_an_empty_or_wrong_typed_persona():
    assert normalize_effects({"persona": {}}) == {}
    assert normalize_effects({"persona": [1, 0]}) == {}
    assert normalize_effects({"persona": "bond"}) == {}


def test_normalize_deduplicates_milestones_keeping_the_order_and_drops_non_strings():
    raw = {"milestones": ["b", "a", "b", 3, None, "con espacio", "", ["a"], "a"]}

    assert normalize_effects(raw) == {"milestones": ["b", "a"]}


@pytest.mark.parametrize("raw", [{"milestones": "a"}, {"milestones": {"a": True}}, {"milestones": [1, 2]}, {"milestones": []}])
def test_normalize_drops_milestones_that_are_not_a_list_of_keys(raw):
    assert normalize_effects(raw) == {}


@pytest.mark.parametrize(
    "raw",
    [None, "texto", 3, [], {"persona": None}, {"persona": {"bond": None}}, {"milestones": None}, {"persona": 1, "milestones": 1}],
)
def test_normalize_never_raises_on_broken_data(raw):
    assert normalize_effects(raw) == {}


def test_normalize_still_keeps_the_old_effects_next_to_the_new_ones():
    raw = {"severity": "risky", "flags": {"f": True}, "metrics": {"m": -5}, "persona": {"bond": -1}, "milestones": ["x"]}

    assert normalize_effects(raw) == raw


# ─── validate_effects: lo nuevo, estricto ─────────────────────────────────────────────────────
def _refusal(raw, milestones=("a",)):
    with pytest.raises(ApiError) as caught:
        validate_effects(raw, (), milestones)
    assert caught.value.status_code == 400
    assert caught.value.extra["field"] == "effects"
    return caught.value


def test_validate_accepts_declared_milestones_and_a_persona_step():
    raw = {"persona": {"bond": 1, "activation": -1}, "milestones": ["a", "b"]}

    assert validate_effects(raw, (), ("a", "b", "c")) == raw


def test_validate_deduplicates_milestones():
    assert validate_effects({"milestones": ["a", "a"]}, (), ("a",)) == {"milestones": ["a"]}


def test_validate_clears_an_empty_persona_and_empty_milestones():
    assert validate_effects({"persona": {}, "milestones": []}, (), ()) == {}


def test_the_third_argument_is_optional_so_the_current_callers_keep_working():
    assert validate_effects({"severity": "risky"}, ()) == {"severity": "risky"}
    assert validate_effects(None, ()) == {}
    _refusal({"milestones": ["a"]}, milestones=())


def test_an_undeclared_milestone_is_a_400_naming_effects():
    error = _refusal({"milestones": ["a", "fantasma"]})

    assert "fantasma" in str(error.detail)


@pytest.mark.parametrize("bond", [2, -2, 1.5, "1", True, None])
def test_a_persona_bond_out_of_range_or_not_an_integer_is_a_400(bond):
    _refusal({"persona": {"bond": bond}})


def test_a_persona_activation_of_two_is_a_400():
    _refusal({"persona": {"activation": 2}})


@pytest.mark.parametrize("persona", [{"mood": 1}, {"bond": 1, "mood": 0}, [1, 0], "bond", 1])
def test_a_persona_with_other_keys_or_the_wrong_type_is_a_400(persona):
    _refusal({"persona": persona})


@pytest.mark.parametrize("milestones", ["a", {"a": True}, [1], [""], ["con espacio"], [["a"]]])
def test_milestones_of_the_wrong_shape_are_a_400(milestones):
    _refusal({"milestones": milestones})


def test_more_milestones_than_the_cap_is_a_400():
    keys = [f"h{i}" for i in range(MAX_EFFECT_ENTRIES + 1)]

    _refusal({"milestones": keys}, milestones=keys)
    assert validate_effects({"milestones": keys[:-1]}, (), keys) == {"milestones": keys[:-1]}


def test_an_unknown_effect_still_names_the_accepted_ones():
    error = _refusal({"desconocido": 1})

    assert "persona" in str(error.detail) and "milestones" in str(error.detail)
