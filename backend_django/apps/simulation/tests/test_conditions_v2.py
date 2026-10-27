"""Modelo de métricas nuevo · Las condiciones de los finales con hitos, persona y clases.

Sin base de datos. ``milestone``, ``persona`` y ``count`` con las cuatro clases son todo el vocabulario: el viejo
(``flag``, ``metric``, severidades) ya no existe; lo desconocido evalúa a ``False``.
"""
import pytest

from apps.simulation.casedef import conditions as pure_conditions
from apps.simulation.services.conditions import COUNT_NAMES, evaluate, is_valid

pytestmark = [pytest.mark.req("RN-08")]

# El final «protectora» de la plantilla en miniatura: el hito hecho y ninguna contraindicada.
PROTECTORA = {"all": [{"milestone": "a"}, {"not": {"count": "contraindicated", "gte": 1}}]}


def _context(milestones=(), contraindicated=0, persona=None):
    return {
        "milestones": set(milestones),
        "counts": {"contraindicated": contraindicated},
        "persona": persona if persona is not None else {"bond": "GUARDED", "activation": "TENSE"},
    }


# ─── hito + conteo de la clase ────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "context,expected",
    [
        pytest.param(_context(milestones={"a"}, contraindicated=0), True, id="hito-y-ninguna-contraindicada"),
        pytest.param(_context(milestones=set(), contraindicated=0), False, id="falta-el-hito"),
        pytest.param(_context(milestones={"a"}, contraindicated=1), False, id="una-contraindicada"),
    ],
)
def test_the_template_condition_over_three_cases(context, expected):
    assert evaluate(PROTECTORA, context) is expected


def test_milestone_reads_a_set_a_frozenset_or_a_list():
    for container in ({"a"}, frozenset({"a"}), ["a"], ("a",)):
        assert evaluate({"milestone": "a"}, {"milestones": container}) is True
        assert evaluate({"milestone": "b"}, {"milestones": container}) is False


@pytest.mark.parametrize("context", [{}, {"milestones": None}, {"milestones": "a"}, {"milestones": {"a": True}}])
def test_milestone_with_a_missing_or_wrong_context_is_false(context):
    assert evaluate({"milestone": "a"}, context) is False


@pytest.mark.parametrize("condition", [{"milestone": 1}, {"milestone": ""}, {"milestone": "a", "gte": 1}, {"milestone": None}])
def test_a_malformed_milestone_is_false_and_invalid(condition):
    assert evaluate(condition, {"milestones": {"a", 1, ""}}) is False
    assert is_valid(condition) is False


def test_not_milestone_is_true_when_the_milestone_is_missing():
    assert evaluate({"not": {"milestone": "a"}}, {}) is True
    assert evaluate({"not": {"milestone": "a"}}, {"milestones": {"a"}}) is False


# ─── conteo por clase ─────────────────────────────────────────────────────────────────────────
def test_count_names_are_the_four_classes():
    assert set(COUNT_NAMES) == {"recommended", "acceptable", "risky", "contraindicated"}
    assert COUNT_NAMES is pure_conditions.COUNT_NAMES


@pytest.mark.parametrize(
    "comparator,bound,expected",
    [("gte", 2, True), ("gte", 3, False), ("gt", 2, False), ("gt", 1, True), ("lte", 2, True), ("lt", 2, False), ("eq", 2, True)],
)
def test_count_by_class_with_each_comparator(comparator, bound, expected):
    context = {"counts": {"contraindicated": 2}}
    assert evaluate({"count": "contraindicated", comparator: bound}, context) is expected


def test_count_of_a_class_missing_from_the_context_is_zero():
    assert evaluate({"count": "risky", "eq": 0}, {"counts": {}}) is True
    assert evaluate({"count": "contraindicated", "eq": 0}, {"counts": {"risky": 3}}) is True
    assert evaluate({"count": "contraindicated", "eq": 0}, {}) is False  # sin ``counts`` no hay de qué leer


def test_the_old_severity_count_no_longer_exists():
    assert evaluate({"count": "critical", "gte": 1}, {"counts": {"critical": 1}}) is False
    assert is_valid({"count": "critical", "gte": 1}) is False


def test_an_unknown_count_name_is_false_and_invalid():
    assert evaluate({"count": "catastrofica", "gte": 0}, {"counts": {}}) is False
    assert is_valid({"count": "catastrofica", "gte": 0}) is False
    assert is_valid({"count": "contraindicated", "gte": 1}) is True


# ─── la persona consultante ───────────────────────────────────────────────────────────────────
def test_persona_matches_one_dimension_or_both():
    context = _context(persona={"bond": "OPEN", "activation": "CALM"})
    assert evaluate({"persona": {"bond": "OPEN"}}, context) is True
    assert evaluate({"persona": {"activation": "CALM"}}, context) is True
    assert evaluate({"persona": {"bond": "OPEN", "activation": "CALM"}}, context) is True


def test_persona_is_false_when_any_dimension_differs():
    context = _context(persona={"bond": "OPEN", "activation": "TENSE"})
    assert evaluate({"persona": {"bond": "WITHDRAWN"}}, context) is False
    assert evaluate({"persona": {"bond": "OPEN", "activation": "CALM"}}, context) is False


def test_persona_reads_enum_members_as_their_string_values():
    from apps.simulation.casedef.vocabulary import Activation, Bond

    assert evaluate({"persona": {"bond": "OPEN"}}, {"persona": {"bond": Bond.OPEN, "activation": Activation.CALM}}) is True


@pytest.mark.parametrize("context", [{}, {"persona": None}, {"persona": "OPEN"}, {"persona": {}}])
def test_persona_with_a_missing_or_wrong_context_is_false(context):
    assert evaluate({"persona": {"bond": "OPEN"}}, context) is False


@pytest.mark.parametrize(
    "condition",
    [
        {"persona": {"mood": "OPEN"}},  # dimensión desconocida
        {"persona": {"bond": "CALM"}},  # valor de otra dimensión
        {"persona": {"bond": "open"}},  # el valor va en mayúscula
        {"persona": {"bond": 1}},
        {"persona": {}},
        {"persona": "OPEN"},
        {"persona": {"bond": "OPEN"}, "gte": 1},
    ],
)
def test_a_malformed_persona_condition_is_false_and_invalid(condition):
    assert evaluate(condition, {"persona": {"bond": "OPEN", "activation": "CALM"}}) is False
    assert is_valid(condition) is False


def test_not_persona_does_not_make_a_malformed_condition_true():
    assert evaluate({"not": {"persona": {"mood": "OPEN"}}}, {"persona": {"bond": "OPEN"}}) is False
    assert evaluate({"not": {"persona": {"bond": "WITHDRAWN"}}}, {"persona": {"bond": "OPEN"}}) is True


# ─── is_valid con el vocabulario nuevo ────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "condition",
    [
        {"milestone": "a"},
        {"persona": {"bond": "OPEN"}},
        {"persona": {"activation": "CRISIS", "bond": "WITHDRAWN"}},
        {"count": "contraindicated", "gte": 1},
        PROTECTORA,
        {"any": [{"persona": {"activation": "CRISIS"}}, {"milestone": "x"}, {"count": "risky", "gte": 2}]},
    ],
)
def test_is_valid_accepts_the_vocabulary_alone_and_mixed(condition):
    assert is_valid(condition) is True


def test_is_valid_rejects_the_old_vocabulary_even_mixed_with_the_new():
    assert is_valid({"any": [{"persona": {"activation": "CRISIS"}}, {"flag": "vieja"}]}) is False
