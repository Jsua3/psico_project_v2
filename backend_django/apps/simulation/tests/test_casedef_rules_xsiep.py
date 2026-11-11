import pytest
from apps.simulation.casedef import validate
from apps.simulation.casedef.export import to_document
from apps.simulation.tests.definition_samples import sample_definition, sample_definition_v21

def _doc():
    return to_document(sample_definition_v21())

def _scene(document):
    return next(s for s in document["x-siep"]["escenas"] if any("requiere" in o for o in s["opciones"]))

def _gated(scene):
    return next(o for o in scene["opciones"] if "requiere" in o)

def _states(document):
    return {r.rule: r.state for r in validate.run_rules(document).results}

def test_valid_sample_satisfies_the_four_rules():
    states = _states(_doc())
    assert [states[f"OCL-{n}"] for n in ("09", "10", "11", "12")] == ["CUMPLE"] * 4

def test_a_case_without_new_fields_is_not_affected():
    states = _states(to_document(sample_definition()))
    assert states["OCL-09"] == "CUMPLE"
    assert [states[f"OCL-{n}"] for n in ("10", "11", "12")] == ["NO_APLICA"] * 3

def _all_gated(d):
    for option in _scene(d)["opciones"]:
        option["requiere"] = _gated(_scene(d))["requiere"]

@pytest.mark.parametrize("mutate, rule", [
    (_all_gated, "OCL-09"),
    (lambda d: _gated(_scene(d)).__setitem__("requiere", {"inspected": "no-existe"}), "OCL-10"),
    (lambda d: _gated(_scene(d)).__setitem__("requiere", {"has": "HERRAMIENTA-SIN-OBJETO"}), "OCL-10"),
    (lambda d: _gated(_scene(d)).__setitem__("requiere", {"milestone": "hito_no_declarado"}), "OCL-10"),
    (lambda d: _gated(_scene(d))["reaccion"].__setitem__("gesto", "saluda"), "OCL-11"),
    (lambda d: _gated(_scene(d))["reaccion"].__setitem__("emocion", "furiosa"), "OCL-11"),
    (lambda d: _gated(_scene(d))["reaccion"].__setitem__("personaje", "nadie"), "OCL-12"),
])
def test_each_mutation_breaks_its_rule(mutate, rule):
    document = _doc()
    mutate(document)
    assert _states(document)[rule] == "INCUMPLE"
    assert f"DSL.{rule}" in {issue.code for issue in validate.validate_document(document)}

def test_an_empty_requirement_counts_as_no_requirement():
    document = _doc()
    for option in _scene(document)["opciones"]:
        option["requiere"] = {}
    assert _states(document)["OCL-09"] == "CUMPLE"

def test_a_malformed_requirement_is_a_condition_issue():
    document = _doc()
    _gated(_scene(document))["requiere"] = {"visto": "algo"}
    assert "DSL.SIEP_CONDITION" in {issue.code for issue in validate.validate_document(document)}
