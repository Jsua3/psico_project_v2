"""Tarea 5 (x-siep 2.1) · la base guarda ``requiere``, ``reaccion`` y ``objetivo`` y los conserva al leer, escribir y clonar."""
import pytest
from django.contrib.auth import get_user_model

from apps.simulation.models import CaseVersion, DecisionOption, SimulationCase, SimulationNode
from apps.simulation.services.authoring import definition_io
from apps.simulation.services.authoring.publication import clone_version
from apps.simulation.tests.definition_samples import sample_definition, sample_definition_v21

User = get_user_model()


@pytest.fixture
def actor(db):
    return User.objects.create_user(
        email="v21_admin@x.com", password="pass1234", nombre="Ad", apellido="Min", role="ADMIN"
    )


@pytest.fixture
def case(actor):
    return SimulationCase.objects.create(code="V21-CASO", title="Caso 2.1", created_by=actor)


def test_writing_and_loading_keeps_the_new_fields(case, actor):
    definition = sample_definition_v21()
    version = definition_io.write_definition(definition, case=case, actor=actor)
    loaded = definition_io.load_definition(version.id).definition
    assert [(o.requires, o.reaction) for s in loaded.scenes for o in s.options] == \
           [(o.requires, o.reaction) for s in definition.scenes for o in s.options]
    assert [s.goal for s in loaded.scenes] == [s.goal for s in definition.scenes]
    assert any(o.requires for s in loaded.scenes for o in s.options)
    assert any(s.goal for s in loaded.scenes)


def test_cloning_copies_the_new_fields(case, actor):
    version = definition_io.write_definition(sample_definition_v21(), case=case, actor=actor)
    clone_version(version.id, actor)
    clone = CaseVersion.objects.get(cloned_from=version)
    options = lambda v: list(  # noqa: E731
        DecisionOption.objects.filter(case_version=v).order_by("id").values_list("option_key", "requires_json", "reaction_json")
    )
    nodes = lambda v: list(  # noqa: E731
        SimulationNode.objects.filter(case_version=v).order_by("id").values_list("node_key", "goal")
    )
    assert options(clone) == options(version)
    assert nodes(clone) == nodes(version)
    assert any(requires != "{}" for _, requires, _ in options(clone))
    assert any(goal for _, goal in nodes(clone))


def test_new_columns_default_to_empty(case, actor):
    version = definition_io.write_definition(sample_definition(), case=case, actor=actor)
    assert set(DecisionOption.objects.filter(case_version=version).values_list("requires_json", "reaction_json")) == {("{}", "{}")}
    assert set(SimulationNode.objects.filter(case_version=version).values_list("goal", flat=True)) == {""}
