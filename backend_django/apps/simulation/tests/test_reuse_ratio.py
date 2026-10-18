"""E4-7 · Reutilización de un clon (RQ-NEG-007, N13).

``reuse_ratio(origen, clon)`` mide cuánto del caso original sobrevive idéntico en el clon: las entidades
(personajes, herramientas, escenas, opciones, pistas, mapas, objetos, colisiones, diálogos y criterios)
que están igual en los dos —misma clase, misma clave del producto y mismos campos— entre la mayor de las dos
cantidades, de modo que lo añadido, lo cambiado y lo borrado bajan la razón. Se mide sobre el **modelo**
(no sobre el documento): renumerar los ids de DSL al insertar una escena no cuenta como cambio de las demás.
Al publicar un clon se guarda en ``case_versions.reuse_ratio`` con cuatro decimales; un original no tiene.
"""
import dataclasses
from decimal import Decimal
from fractions import Fraction

import pytest
from django.contrib.auth import get_user_model

from apps.simulation.casedef.reuse import reuse_ratio
from apps.simulation.models import (
    CaseCharacter,
    CaseVersion,
    ClinicalTool,
    CollisionZone,
    DecisionOption,
    DialogueTree,
    MapObject,
    RubricCriterion,
    SceneHint,
    SceneMap,
    SimulationNode,
)
from apps.simulation.services.authoring import definition_io, gate, importing, publication
from apps.simulation.tests.definition_samples import sample_definition

pytestmark = [pytest.mark.req("RQ-NEG-007"), pytest.mark.req("RF-12")]

User = get_user_model()
#: Las entidades de ``sample_definition()`` contadas a mano: 2 personajes, 2 herramientas, 4 escenas,
#: 5 opciones, 2 pistas, 3 mapas, 3 objetos, 3 colisiones, 1 diálogo y 3 criterios.
TOTAL = 2 + 2 + 4 + 5 + 2 + 3 + 3 + 3 + 1 + 3


def _scene(definition, key):
    return next(scene for scene in definition.scenes if scene.key == key)


def _replace_scene(definition, key, **changes):
    scenes = tuple(
        dataclasses.replace(scene, **changes) if scene.key == key else scene for scene in definition.scenes
    )
    return dataclasses.replace(definition, scenes=scenes)


def _with_text_changed(definition):
    scene = _scene(definition, "inicio")
    options = tuple(
        dataclasses.replace(option, text="Otro texto") if option.key == "analizar" else option
        for option in scene.options
    )
    return _replace_scene(definition, "inicio", options=options)


def _without_object(definition, key):
    scene = _scene(definition, "inicio")
    world = dataclasses.replace(scene.world, objects=tuple(o for o in scene.world.objects if o.key != key))
    return _replace_scene(definition, "inicio", world=world)


# ─── la medida, sobre el modelo ───────────────────────────────────────────────────────────────
def test_an_identical_clone_reuses_everything():
    assert reuse_ratio(sample_definition(), sample_definition()) == Fraction(1)


def test_a_changed_option_and_a_deleted_object_cost_one_each():
    source = sample_definition()
    clone = _without_object(_with_text_changed(source), "kit")

    assert reuse_ratio(source, clone) == Fraction(TOTAL - 2, TOTAL)


def test_a_deleted_object_alone_lowers_the_ratio_too():
    source = sample_definition()

    assert reuse_ratio(source, _without_object(source, "kit")) == Fraction(TOTAL - 1, TOTAL)


def test_a_new_scene_lowers_the_ratio():
    source = sample_definition()
    extra = dataclasses.replace(_scene(source, "cierre"), key="extra", title="Extra", hints=())
    clone = dataclasses.replace(source, scenes=source.scenes + (extra,))

    assert reuse_ratio(source, clone) == Fraction(TOTAL, TOTAL + 1)


def test_inserting_a_scene_at_the_start_does_not_change_the_others():
    """Los ids de DSL se renumeran (``E01`` pasa a ``E02``…); el modelo no: las demás escenas son las mismas."""
    source = sample_definition()
    first = dataclasses.replace(_scene(source, "cierre"), key="primera", title="Primera", hints=())
    clone = dataclasses.replace(source, scenes=(first,) + source.scenes)

    assert reuse_ratio(source, clone) == Fraction(TOTAL, TOTAL + 1)


def test_an_edited_character_hint_tool_and_criterion_each_cost_one():
    source = sample_definition()
    character = dataclasses.replace(source.characters[0], role_label="Otro rol")
    tool = dataclasses.replace(source.tools[0], description="Otra descripción")
    rubric = source.rubrics[0]
    criterion = dataclasses.replace(rubric.criteria[0], title="Otro título")
    clone = dataclasses.replace(
        source,
        characters=(character,) + source.characters[1:],
        tools=(tool,) + source.tools[1:],
        rubrics=(dataclasses.replace(rubric, criteria=(criterion,) + rubric.criteria[1:]),) + source.rubrics[1:],
    )
    clone = _replace_scene(clone, "inicio", hints=("Otra pista.",))

    assert reuse_ratio(source, clone) == Fraction(TOTAL - 4, TOTAL)


def test_an_empty_clone_of_an_empty_case_has_no_ratio():
    empty = dataclasses.replace(
        sample_definition(), characters=(), tools=(), scenes=(), rubrics=()
    )

    assert reuse_ratio(empty, empty) is None


def test_a_clone_that_shares_nothing_reuses_nothing():
    source = sample_definition()
    clone = dataclasses.replace(
        source,
        characters=(dataclasses.replace(source.characters[0], key="nuevo"),),
        tools=(), scenes=(), rubrics=(),
    )

    assert reuse_ratio(source, clone) == Fraction(0)


# ─── al publicar ──────────────────────────────────────────────────────────────────────────────
def _entities(version):
    return sum((
        CaseCharacter.objects.filter(case_version=version).count(),
        ClinicalTool.objects.filter(case_version=version).count(),
        SimulationNode.objects.filter(case_version=version).count(),
        DecisionOption.objects.filter(case_version=version).count(),
        SceneHint.objects.filter(scene_map__case_version=version).count(),
        SceneMap.objects.filter(case_version=version).count(),
        MapObject.objects.filter(scene_map__case_version=version).count(),
        CollisionZone.objects.filter(scene_map__case_version=version).count(),
        DialogueTree.objects.filter(scene_map__case_version=version).count(),
        RubricCriterion.objects.filter(rubric__case_version=version).count(),
    ))


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="reuse_admin@x.com", password="pass1234", nombre="Ad", apellido="Min", role="ADMIN"
    )


@pytest.fixture
def seeded(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")


def _publish(version, admin):
    seal = gate.ensure_publishable(version, require_checklist=False)
    gate.mark_published(version, seal, admin)
    version.refresh_from_db()
    return version


def test_publishing_an_untouched_clone_stores_a_ratio_of_one(admin, seeded):
    clone = CaseVersion.objects.get(pk=publication.clone_version(seeded.id, admin)["caseVersionId"])

    _publish(clone, admin)

    assert clone.reuse_ratio == Decimal("1.0000")


def test_publishing_an_edited_clone_stores_the_ratio_with_four_decimals(admin, seeded):
    clone = CaseVersion.objects.get(pk=publication.clone_version(seeded.id, admin)["caseVersionId"])
    node = SimulationNode.objects.filter(case_version=clone).order_by("id").first()
    SimulationNode.objects.filter(pk=node.pk).update(title=node.title + " (editada)")
    total = _entities(clone)

    _publish(clone, admin)

    assert clone.reuse_ratio == (Decimal(total - 1) / Decimal(total)).quantize(Decimal("0.0001"))
    assert clone.reuse_ratio.as_tuple().exponent == -4


def test_publishing_an_original_leaves_the_ratio_empty(admin, seeded):
    """Un caso importado no es un clon de nadie: se publica por la compuerta y no tiene razón de reutilización."""
    document = definition_io.export_definition(seeded.id)
    document["caso"]["id"] = "ORIGINAL-001"
    original = CaseVersion.objects.get(pk=importing.import_document(document, admin)["caseVersionId"])
    assert original.cloned_from_id is None

    _publish(original, admin)

    assert original.status == "PUBLISHED" and original.reuse_ratio is None


def test_a_clone_does_not_inherit_the_seal_or_the_ratio_of_its_source(admin, seeded):
    clone = CaseVersion.objects.get(pk=publication.clone_version(seeded.id, admin)["caseVersionId"])

    assert (clone.validated_at, clone.definition_hash, clone.reuse_ratio) == (None, None, None)
