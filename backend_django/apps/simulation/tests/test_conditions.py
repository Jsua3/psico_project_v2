"""E3-8 · El evaluador de condiciones de los finales (R11): un árbol JSON sin ``eval``.

Sin base de datos. Cada operador, el anidamiento, los tipos equivocados y lo desconocido; y que
una cadena con código no se ejecuta nunca.
"""
import os

import pytest

from apps.simulation.services import conditions
from apps.simulation.services.conditions import evaluate, is_valid

pytestmark = [pytest.mark.req("RNF-008"), pytest.mark.req("TD-02")]

CONTEXT = {
    "flags": {"pap_aplicado": True, "apagada": False},
    "metrics": {"confianza": 60, "crisis_emocional": 20},
    "counts": {"recommended": 4, "acceptable": 1, "risky": 0, "critical": 2},
}


# ─── operadores ───────────────────────────────────────────────────────────────────────────────
def test_flag_is_true_only_when_the_flag_is_on():
    assert evaluate({"flag": "pap_aplicado"}, CONTEXT) is True
    assert evaluate({"flag": "apagada"}, CONTEXT) is False
    assert evaluate({"flag": "no_existe"}, CONTEXT) is False


@pytest.mark.parametrize(
    "comparator,bound,expected",
    [("gte", 60, True), ("gte", 61, False), ("gt", 59, True), ("gt", 60, False),
     ("lte", 60, True), ("lte", 59, False), ("lt", 61, True), ("lt", 60, False),
     ("eq", 60, True), ("eq", 59, False)],
)
def test_metric_comparators(comparator, bound, expected):
    assert evaluate({"metric": "confianza", comparator: bound}, CONTEXT) is expected


def test_several_comparators_must_all_hold():
    assert evaluate({"metric": "confianza", "gte": 50, "lte": 70}, CONTEXT) is True
    assert evaluate({"metric": "confianza", "gte": 50, "lt": 60}, CONTEXT) is False


@pytest.mark.parametrize(
    "name,comparator,bound,expected",
    [("recommended", "gte", 4, True), ("critical", "eq", 0, False), ("risky", "eq", 0, True),
     ("critical", "gte", 2, True), ("acceptable", "lte", 0, False)],
)
def test_count_comparators(name, comparator, bound, expected):
    assert evaluate({"count": name, comparator: bound}, CONTEXT) is expected


def test_all_any_and_not():
    yes, no = {"flag": "pap_aplicado"}, {"flag": "apagada"}

    assert evaluate({"all": [yes, {"count": "recommended", "gte": 1}]}, CONTEXT) is True
    assert evaluate({"all": [yes, no]}, CONTEXT) is False
    assert evaluate({"any": [no, yes]}, CONTEXT) is True
    assert evaluate({"any": [no, no]}, CONTEXT) is False
    assert evaluate({"not": no}, CONTEXT) is True
    assert evaluate({"not": yes}, CONTEXT) is False


def test_an_empty_all_is_true_and_an_empty_any_is_false():
    assert evaluate({"all": []}, CONTEXT) is True
    assert evaluate({"any": []}, CONTEXT) is False


def test_nesting_composes():
    condition = {"any": [
        {"count": "critical", "gte": 3},
        {"all": [{"flag": "pap_aplicado"}, {"not": {"metric": "crisis_emocional", "gt": 50}}]},
    ]}

    assert evaluate(condition, CONTEXT) is True


def test_the_four_default_endings_are_expressible_as_data():
    """Las condiciones del caso PDF se evalúan con el mismo evaluador (R10)."""
    from apps.simulation.services.case_effects import DEFAULT_ENDINGS

    by_key = {e["key"]: e for e in DEFAULT_ENDINGS}
    context = {
        "flags": {"mediacion_agresor_intentada": True},
        "metrics": {},
        "counts": {"recommended": 0, "acceptable": 0, "risky": 0, "critical": 0},
    }

    assert evaluate(by_key["critico"]["when"], context) is True  # mediación sin protección
    assert "when" not in by_key["brechas"]  # el último es el valor por defecto
    for ending in DEFAULT_ENDINGS:
        assert "when" not in ending or is_valid(ending["when"])


# ─── lo que no es una condición ───────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "condition",
    [
        None, "pap_aplicado", 5, [], [{"flag": "pap_aplicado"}], {},
        {"unknown": 1},
        {"flag": 7},
        {"flag": ["pap_aplicado"]},
        {"metric": "confianza"},                      # sin comparador
        {"metric": "confianza", "gte": "50"},          # límite que no es número
        {"metric": "confianza", "gte": True},          # un booleano no es un número
        {"metric": "no_existe", "gte": 0},             # métrica que el caso no declara
        {"metric": 5, "gte": 0},
        {"count": "mortal", "gte": 0},                 # severidad desconocida
        {"count": "critical"},
        {"all": "no es una lista"},
        {"any": {"flag": "pap_aplicado"}},
        {"all": [{"flag": "pap_aplicado"}], "any": []},  # dos operadores a la vez
        {"flag": "pap_aplicado", "extra": 1},
        {"not": {"unknown": 1}},                       # negar lo desconocido no lo vuelve verdadero
        {"not": None},
    ],
)
def test_anything_unknown_or_malformed_is_false(condition):
    assert evaluate(condition, CONTEXT) is False


def test_a_missing_or_broken_context_is_false_not_an_error():
    assert evaluate({"flag": "x"}, {}) is False
    assert evaluate({"metric": "confianza", "gte": 0}, {"metrics": None}) is False
    assert evaluate({"count": "critical", "eq": 0}, {"counts": []}) is False
    assert evaluate({"flag": "x"}, None) is False


def test_too_deep_a_tree_is_false_instead_of_blowing_the_stack():
    condition = {"flag": "pap_aplicado"}
    for _ in range(conditions.MAX_DEPTH + 2):
        condition = {"all": [condition]}

    assert evaluate(condition, CONTEXT) is False
    assert is_valid(condition) is False


def test_a_string_of_code_is_a_name_that_does_not_exist_and_is_never_executed(monkeypatch, tmp_path):
    marker = tmp_path / "ejecutado.txt"
    code = f"__import__('os').system('echo hola > {marker}')"
    called = []
    monkeypatch.setattr(os, "system", lambda *a, **k: called.append(a))

    results = [
        evaluate({"flag": code}, CONTEXT),
        evaluate({"metric": code, "gte": 0}, CONTEXT),
        evaluate({"count": code, "gte": 0}, CONTEXT),
        evaluate({code: True}, CONTEXT),
        evaluate({"all": [code]}, CONTEXT),
        evaluate(code, CONTEXT),
    ]

    assert results == [False] * 6
    assert called == []
    assert not marker.exists()


# ─── la regla de guardado ─────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "condition",
    [
        {"flag": "pap_aplicado"},
        {"metric": "confianza", "gte": 50},
        {"count": "risky", "lte": 1},
        {"all": []},
        {"not": {"any": [{"flag": "a"}, {"count": "critical", "eq": 0}]}},
    ],
)
def test_is_valid_accepts_the_whole_vocabulary(condition):
    assert is_valid(condition) is True


@pytest.mark.parametrize(
    "condition",
    [{}, {"unknown": 1}, {"flag": ""}, {"metric": "m"}, {"count": "x", "gte": 1}, {"not": {}},
     {"all": [{"flag": "a"}, {"nope": 1}]}, {"metric": "m", "gte": "1"}],
)
def test_is_valid_rejects_what_the_evaluator_would_not_understand(condition):
    assert is_valid(condition) is False
