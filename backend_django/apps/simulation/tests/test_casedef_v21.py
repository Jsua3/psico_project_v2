from dataclasses import replace

from apps.simulation.casedef import siep, validate
from apps.simulation.casedef.canonical import definition_hash
from apps.simulation.casedef.export import to_document
from apps.simulation.casedef.import_ import to_definition
from apps.simulation.tests.definition_samples import sample_definition, sample_definition_v21

EXPECTED_HASH_20 = "sha256:ed52231851fc324442d65cb4fd694291d5eb4770acd24065c51df5ab17e9b0a1"
NEW_KEYS = {"requiere", "reaccion", "objetivo"}


def _keys(node):
    if isinstance(node, dict):
        return set(node) | set().union(*map(_keys, node.values())) if node else set()
    if isinstance(node, list):
        return set().union(*map(_keys, node)) if node else set()
    return set()


def test_a_case_without_new_fields_exports_exactly_as_before():
    document = to_document(sample_definition())
    assert document["x-siep"]["version"] == "2.0"
    assert not (_keys(document) & NEW_KEYS)
    assert definition_hash(document) == EXPECTED_HASH_20


def test_a_case_with_new_fields_exports_2_1_and_round_trips():
    definition = sample_definition_v21()
    document = to_document(definition)
    assert document["x-siep"]["version"] == "2.1"
    assert validate.validate_document(document) == []
    assert to_definition(document) == definition


def test_importing_2_0_gives_empty_new_fields():
    definition = to_definition(to_document(sample_definition()))
    assert all(o.requires == {} and o.reaction == {} for s in definition.scenes for o in s.options)
    assert all(s.goal == "" for s in definition.scenes)


def test_version_of_tells_the_two_versions_apart():
    assert siep.version_of(sample_definition()) == "2.0"
    assert siep.version_of(sample_definition_v21()) == "2.1"


def test_schema_rejects_bad_reaction_and_long_goal():
    document = to_document(sample_definition_v21())
    scene = next(s for s in document["x-siep"]["escenas"] if s["opciones"])
    scene["opciones"][0]["reaccion"] = {"linea": "x" * 401, "color": "rojo"}
    scene["objetivo"] = "x" * 201
    codes = {issue.code for issue in validate.validate_document(document)}
    assert codes & {"DSL.SIEP_SCHEMA", "DSL.TEXT_TOO_LONG"}


def test_explicit_empty_requires_reaction_and_goal_export_as_2_0_without_the_fields():
    base = sample_definition_v21()
    scenes = tuple(
        replace(scene, goal="", options=tuple(replace(o, requires={}, reaction={}) for o in scene.options))
        for scene in base.scenes
    )
    document = to_document(replace(base, scenes=scenes))
    assert document["x-siep"]["version"] == "2.0"
    assert not (_keys(document) & NEW_KEYS)
