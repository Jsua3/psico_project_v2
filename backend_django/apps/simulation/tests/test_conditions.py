"""E3-8 · El evaluador de condiciones de los finales (R11): un árbol JSON sin ``eval``.

Sin base de datos. Cada operador, el anidamiento, los tipos equivocados y lo desconocido; y que una cadena con código no
se ejecuta nunca. El vocabulario es el vigente (``all``, ``any``, ``not``, ``milestone``, ``count`` por clase y
``persona``, este último en ``test_conditions_v2``); el del modelo antiguo (``flag``, ``metric`` y el conteo por
severidad) ya no existe y evalúa a falso.
"""
import os

import pytest

from apps.simulation.services import conditions
from apps.simulation.services.conditions import evaluate, is_valid

pytestmark = [pytest.mark.req("RNF-008"), pytest.mark.req("TD-02")]

CONTEXT = {
    "milestones": {"valoro_riesgo", "informo_derechos"},
    "counts": {"recommended": 4, "acceptable": 1, "risky": 0, "contraindicated": 2},
}


# ─── operadores ───────────────────────────────────────────────────────────────────────────────
def test_milestone_is_true_only_when_the_milestone_is_done():
    assert evaluate({"milestone": "valoro_riesgo"}, CONTEXT) is True
    assert evaluate({"milestone": "no_hecho"}, CONTEXT) is False


@pytest.mark.parametrize(
    "name,comparator,bound,expected",
    [("recommended", "gte", 4, True), ("contraindicated", "eq", 0, False), ("risky", "eq", 0, True),
     ("contraindicated", "gte", 2, True), ("acceptable", "lte", 0, False)],
)
def test_count_comparators(name, comparator, bound, expected):
    assert evaluate({"count": name, comparator: bound}, CONTEXT) is expected


@pytest.mark.parametrize(
    "comparator,bound,expected",
    [("gte", 4, True), ("gte", 5, False), ("gt", 3, True), ("gt", 4, False),
     ("lte", 4, True), ("lte", 3, False), ("lt", 5, True), ("lt", 4, False),
     ("eq", 4, True), ("eq", 3, False)],
)
def test_every_comparator(comparator, bound, expected):
    assert evaluate({"count": "recommended", comparator: bound}, CONTEXT) is expected


def test_several_comparators_must_all_hold():
    assert evaluate({"count": "recommended", "gte": 3, "lte": 5}, CONTEXT) is True
    assert evaluate({"count": "recommended", "gte": 3, "lt": 4}, CONTEXT) is False


def test_all_any_and_not():
    yes, no = {"milestone": "valoro_riesgo"}, {"milestone": "no_hecho"}

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
        {"count": "contraindicated", "gte": 3},
        {"all": [{"milestone": "valoro_riesgo"}, {"not": {"count": "risky", "gt": 0}}]},
    ]}

    assert evaluate(condition, CONTEXT) is True


# ─── lo que no es una condición ───────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "condition",
    [
        None, "valoro_riesgo", 5, [], [{"milestone": "valoro_riesgo"}], {},
        {"unknown": 1},
        {"milestone": 7},
        {"milestone": ""},
        {"milestone": ["valoro_riesgo"]},
        {"count": "recommended"},                     # sin comparador
        {"count": "recommended", "gte": "4"},          # límite que no es número
        {"count": "recommended", "gte": True},         # un booleano no es un número
        {"count": "mortal", "gte": 0},                 # clase desconocida
        {"all": "no es una lista"},
        {"any": {"milestone": "valoro_riesgo"}},
        {"all": [{"milestone": "valoro_riesgo"}], "any": []},  # dos operadores a la vez
        {"milestone": "valoro_riesgo", "extra": 1},
        {"not": {"unknown": 1}},                       # negar lo desconocido no lo vuelve verdadero
        {"not": None},
        # el vocabulario del modelo antiguo ya no existe
        {"flag": "pap_aplicado"},
        {"metric": "confianza", "gte": 0},
        {"count": "critical", "eq": 0},
    ],
)
def test_anything_unknown_or_malformed_is_false(condition):
    assert evaluate(condition, CONTEXT) is False


def test_a_missing_or_broken_context_is_false_not_an_error():
    assert evaluate({"milestone": "x"}, {}) is False
    assert evaluate({"count": "risky", "eq": 0}, {"counts": []}) is False
    assert evaluate({"milestone": "x"}, None) is False


def test_too_deep_a_tree_is_false_instead_of_blowing_the_stack():
    condition = {"milestone": "valoro_riesgo"}
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
        evaluate({"milestone": code}, CONTEXT),
        evaluate({"count": code, "gte": 0}, CONTEXT),
        evaluate({code: True}, CONTEXT),
        evaluate({"all": [code]}, CONTEXT),
        evaluate(code, CONTEXT),
    ]

    assert results == [False] * 5
    assert called == []
    assert not marker.exists()


# ─── la regla de guardado ─────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "condition",
    [
        {"milestone": "valoro_riesgo"},
        {"count": "risky", "lte": 1},
        {"all": []},
        {"not": {"any": [{"milestone": "a"}, {"count": "contraindicated", "eq": 0}]}},
    ],
)
def test_is_valid_accepts_the_whole_vocabulary(condition):
    assert is_valid(condition) is True


@pytest.mark.parametrize(
    "condition",
    [{}, {"unknown": 1}, {"milestone": ""}, {"count": "risky"}, {"count": "x", "gte": 1}, {"not": {}},
     {"all": [{"milestone": "a"}, {"nope": 1}]}, {"count": "risky", "gte": "1"},
     {"flag": "pap_aplicado"}, {"metric": "confianza", "gte": 50}, {"count": "critical", "eq": 0}],
)
def test_is_valid_rejects_what_the_evaluator_would_not_understand(condition):
    assert is_valid(condition) is False
