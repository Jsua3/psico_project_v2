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


def _findings(document):
    return [f for r in validate.run_rules(document).results if r.rule in ("OCL-09", "OCL-10", "OCL-11", "OCL-12")
            for f in r.findings]

@pytest.mark.parametrize("junk", [[], {}, 7, [1, 2], {"a": 1}])
def test_unexpected_key_types_never_raise_in_the_four_rules(junk):
    document = _doc()
    siep = document["x-siep"]
    scene = _scene(document)
    for obj in scene["mapa"]["objetos"]:
        obj["clave"], obj["herramienta"], obj["opcion"] = junk, junk, junk
    scene["mapa"]["ambiente"] = {"ambientNpcs": [{"key": junk}]}
    for dialog in scene["mapa"]["dialogos"]:
        dialog["objeto"] = junk
        for choice in dialog["elecciones"]:
            choice["opcion"] = junk
    for tool in siep["herramientas"]:
        tool["codigo"] = junk
    for milestone in siep["reglas"]["milestones"]:
        milestone["key"] = junk
    for option in scene["opciones"]:
        option["clave"] = junk
    _gated(scene)["requiere"] = {"all": [{"talked": "laura"}, {"has": "MAPA"}, {"milestone": "analizo"}]}
    _gated(scene)["reaccion"]["personaje"] = junk
    report = validate.run_rules(document)
    assert not [f for r in report.results for f in r.findings if "Error interno" in f.message]
    assert {r.rule: r.state for r in report.results}["OCL-12"] in ("CUMPLE", "INCUMPLE", "NO_APLICA")

@pytest.mark.parametrize("clave", [None, "", []])
def test_an_option_without_key_does_not_satisfy_ocl_12_by_accident(clave):
    document = _doc()
    scene = _scene(document)
    option = _gated(scene)
    option.pop("clave", None)
    if clave is not None:
        option["clave"] = clave
    option["reaccion"].pop("personaje", None)
    for obj in scene["mapa"]["objetos"]:
        obj.pop("opcion", None)
    for dialog in scene["mapa"]["dialogos"]:
        for choice in dialog["elecciones"]:
            choice.pop("opcion", None)
    assert _states(document)["OCL-12"] == "INCUMPLE"


# ─── Ruling 10: la sala es el mapa de la escena o cualquier mapa donde una PERSON ofrece la opción ───
def _offer_from_another_map(document, character):
    """Quita la oferta de la opción con requisito del mapa de su escena y la pone en una PERSON de otra escena."""
    scene = _scene(document)
    key = _gated(scene)["clave"]
    for obj in scene["mapa"]["objetos"]:
        if obj.get("opcion") == key:
            obj["opcion"] = None
    for dialog in scene["mapa"]["dialogos"]:
        for choice in dialog["elecciones"]:
            if choice.get("opcion") == key:
                choice["opcion"] = None
    other = next(s for s in document["x-siep"]["escenas"] if s is not scene)
    other["mapa"]["objetos"].append(
        {"clave": "persona-de-otro-mapa", "tipo": "PERSON", "personaje": character, "opcion": key, "visible": True}
    )
    return scene


def test_an_option_offered_only_by_a_person_of_another_map_satisfies_ocl_12():
    document = _doc()
    scene = _offer_from_another_map(document, "otra-persona")
    _gated(scene)["reaccion"].pop("personaje", None)
    assert _states(document)["OCL-12"] == "CUMPLE"


def test_a_character_standing_where_the_option_is_offered_satisfies_ocl_12():
    document = _doc()
    scene = _offer_from_another_map(document, "otra-persona")
    _gated(scene)["reaccion"]["personaje"] = "otra-persona"
    assert _states(document)["OCL-12"] == "CUMPLE"


def test_a_character_of_a_map_that_does_not_offer_the_option_still_breaks_ocl_12():
    document = _doc()
    scene = _offer_from_another_map(document, "otra-persona")
    third = next(s for s in document["x-siep"]["escenas"] if s is not scene and s["mapa"] is not None
                 and not any(o["clave"] == "persona-de-otro-mapa" for o in s["mapa"]["objetos"]))
    third["mapa"]["objetos"].append({"clave": "ajena", "tipo": "PERSON", "personaje": "ajena", "visible": True})
    _gated(scene)["reaccion"]["personaje"] = "ajena"
    assert _states(document)["OCL-12"] == "INCUMPLE"


def test_a_requirement_over_the_length_cap_is_a_condition_issue():
    document = _doc()
    _gated(_scene(document))["requiere"] = {"all": [{"inspected": f"objeto-{n}"} for n in range(300)]}
    issues = [i for i in validate.validate_document(document) if i.code == "DSL.SIEP_CONDITION"]
    assert len(issues) == 1
    assert "demasiado largo" in issues[0].message
    assert issues[0].path.endswith(".requiere")
