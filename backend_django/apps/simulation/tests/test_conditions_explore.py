import pytest
from apps.simulation.casedef import conditions as c

CTX = {
    "explored": {"talked": {"enfermera"}, "inspected": {"historia"}, "has": {"PAP"}, "used": {"PAP@familia", "SPIKES"}},
    "milestones": {"contuvo"}, "counts": {}, "persona": {"bond": "GUARDED", "activation": "TENSE"},
}

@pytest.mark.parametrize("cond, expected", [
    ({"talked": "enfermera"}, True), ({"talked": "medico"}, False),
    ({"inspected": "historia"}, True), ({"has": "PAP"}, True), ({"has": "SPIKES"}, False),
    ({"used": "PAP"}, True),      # «PAP@familia» cuenta como uso de PAP
    ({"used": "SPIKES"}, True), ({"used": "PA"}, False),
    ({"all": [{"talked": "enfermera"}, {"used": "PAP"}]}, True),
    ({"any": [{"talked": "medico"}, {"milestone": "contuvo"}]}, True),
    ({"not": {"talked": "medico"}}, True),
    ({"talked": ""}, False), ({"talked": 3}, False), ({"talked": "enfermera", "extra": 1}, False),
])
def test_evaluate_facts(cond, expected):
    assert c.evaluate(cond, CTX) is expected

def test_facts_are_false_without_explored_context():
    assert c.evaluate({"talked": "enfermera"}, {"milestones": set()}) is False
    assert c.evaluate({"talked": "enfermera"}, {"explored": "roto"}) is False

def test_facts_are_valid_only_when_asked():
    assert c.is_valid({"talked": "x"}) is False
    assert c.is_valid({"talked": "x"}, facts=True) is True
    assert c.is_valid({"all": [{"inspected": "x"}, {"milestone": "m"}]}, facts=True) is True
    assert c.is_valid({"not": {"used": "PAP"}}, facts=True) is True
    assert c.is_valid({"talked": ""}, facts=True) is False
    assert c.is_valid({"talked": "x", "extra": 1}, facts=True) is False

def test_facts_in_lists_each_fact_once_in_order():
    cond = {"all": [{"talked": "a"}, {"any": [{"inspected": "b"}, {"talked": "a"}]}, {"not": {"used": "T"}}]}
    assert c.facts_in(cond) == [("talked", "a"), ("inspected", "b"), ("used", "T")]
    assert c.facts_in("roto") == []

def test_unmet_facts_skips_what_is_met_and_what_is_negated():
    cond = {"all": [{"talked": "enfermera"}, {"inspected": "carpeta"}, {"not": {"used": "X"}}]}
    assert c.unmet_facts(cond, CTX) == [("inspected", "carpeta")]
