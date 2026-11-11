"""E4 · Regresiones de la revisión de fase que necesitan la base de datos: la importación por HTTP (C1, I7),
las rúbricas de una versión sellada (I4, M7), la semilla (I6) y las claves de NPC de las puertas (M3).

Cada prueba lleva el hallazgo de la revisión que la originó. Las puras (C2, I1, I2, I3) están en
``test_casedef_review_fixes.py``; el modo estricto de ``seal_published_versions`` (I5), en
``test_seal_command.py``.
"""
import copy
import json
import time
from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, DialogueTree, MapObject, Rubric, RubricCriterion, SceneMap, SimulationCase
from apps.simulation.services import rubric_service
from apps.simulation.services.authoring import definition_io, gate, importing, publication
from apps.simulation.services.authoring.world_definition import run_world_validation
from apps.simulation.tests import dsl_support

pytestmark = [pytest.mark.req("RF-12"), pytest.mark.req("LS-14"), pytest.mark.req("RN-05")]

User = get_user_model()
IMPORT = "/api/authoring/cases/import"
SEED_CODE = "SIM-VBG-001"


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(email=email, password="pass1234", nombre="Nom", apellido="Ape", role=role)


@pytest.fixture
def admin(db):
    return _user("rev_admin@x.com", "ADMIN")


@pytest.fixture
def teacher(db):
    return _user("rev_teacher@x.com", "PROFESOR")


@pytest.fixture
def other_teacher(db):
    return _user("rev_other@x.com", "PROFESOR")


@pytest.fixture
def seeded(db):
    return CaseVersion.objects.get(simulation_case__code=SEED_CODE, status="PUBLISHED")


def _document(seeded, code, *, default_weights=False):
    """El documento completo del caso sembrado con otro código; con ``default_weights`` sus criterios no pesan."""
    document = copy.deepcopy(definition_io.export_definition(seeded.id))
    document["caso"]["id"] = code
    if default_weights:
        for rubric in document["x-siep"]["rubricas"]:
            for criterion in rubric["criterios"]:
                criterion["peso"], criterion["puntajeMaximo"] = "0.00", 20
    return document


def _import(document, actor):
    return CaseVersion.objects.get(pk=importing.import_document(document, actor)["caseVersionId"])


def _publish(version, actor):
    gate.mark_published(version, gate.ensure_publishable(version, require_checklist=False), actor)
    return version


def _rubric(version):
    return Rubric.objects.get(case_version=version)


# ─── C1 · el cuerpo hostil por HTTP ───────────────────────────────────────────────────────────
def test_a_body_that_is_one_long_unterminated_string_gets_a_fast_400(admin):
    """C1: ``"`` y ``\\"`` repetido ocupaba un worker minutos; ahora es un 400 en milésimas."""
    raw = ('"' + '\\"' * 24_000).encode("utf-8")
    started = time.perf_counter()
    response = cl(admin).generic("POST", IMPORT, data=raw, content_type="application/json")
    assert time.perf_counter() - started < 2.0
    assert response.status_code == 400 and response.data["code"] == "DSL_INVALID"


# ─── I7 · application/json con parámetros ─────────────────────────────────────────────────────
@pytest.mark.parametrize("content_type", [
    "application/json; charset=utf-8", "application/json;charset=UTF-8", "Application/JSON", "application/json ; charset=utf-8",
])
def test_the_import_accepts_the_json_media_type_with_parameters(admin, seeded, content_type):
    """I7: ``request.content_type`` trae la cabecera cruda y ``; charset=utf-8`` daba 400 «Solo se admite JSON»."""
    raw = json.dumps(_document(seeded, "REV-CT"), ensure_ascii=False).encode("utf-8")
    response = cl(admin).generic("POST", IMPORT, data=raw, content_type=content_type)
    assert response.status_code == 201, getattr(response, "data", None)


@pytest.mark.parametrize("content_type", ["text/plain", "application/x-www-form-urlencoded", "application/jsonx"])
def test_the_import_still_rejects_other_media_types(admin, seeded, content_type):
    raw = json.dumps(_document(seeded, "REV-CT2")).encode("utf-8")
    response = cl(admin).generic("POST", IMPORT, data=raw, content_type=content_type)
    assert response.status_code == 400 and response.data["code"] == "DSL_INVALID"


# ─── I4 · lo sellado no se reescribe ──────────────────────────────────────────────────────────
def _weights(version):
    return [c.weight for c in RubricCriterion.objects.filter(rubric=_rubric(version), active=True).order_by("id")]


def test_an_imported_draft_is_born_with_the_weights_the_evaluation_will_use(admin, seeded):
    """I4: pesos sin ponderar (0,00 → el puntaje máximo, 80 en total) se normalizaban en la primera evaluación.

    El borrador sale de la importación con los pesos sumando 100: su hash es el que tendrá al publicarse.
    """
    version = _import(_document(seeded, "REV-W", default_weights=True), admin)
    assert sum(_weights(version)) == 100 and len(set(_weights(version))) == 1

    draft_hash = definition_io.definition_view(version.id)["definitionHash"]
    _publish(version, admin)

    assert CaseVersion.objects.get(pk=version.pk).definition_hash == draft_hash


def test_publishing_normalizes_a_rubric_whose_weights_were_left_raw_so_evaluating_never_rewrites_it(admin, seeded):
    """La red de seguridad de la compuerta: aunque algo deje los pesos sin ponderar, lo sellado ya los trae."""
    version = _import(_document(seeded, "REV-NET"), admin)
    RubricCriterion.objects.filter(rubric__case_version=version).update(weight=0)  # el estado que dejaría un parche a mano

    _publish(version, admin)

    assert sum(_weights(version)) == 100
    sealed = CaseVersion.objects.get(pk=version.pk).definition_hash
    rubric = _rubric(version)
    rubric_service._normalize_criteria_weights(list(rubric_service._criteria_qs(rubric)))  # lo que hace evaluar
    assert definition_io.definition_view(version.id)["definitionHash"] == sealed


def test_an_inactive_rubric_is_left_exactly_as_authored(admin, seeded):
    version = _import(_document(seeded, "REV-INACT"), admin)
    rubric = _rubric(version)
    Rubric.objects.filter(pk=rubric.pk).update(active=False)
    RubricCriterion.objects.filter(rubric=rubric).update(weight=7)

    rubric_service.normalize_version_rubrics(version.id)

    assert set(_weights(version)) == {7}


def test_a_rubric_of_a_published_version_cannot_be_edited_or_toggled(admin, seeded):
    """I4: ``PUT /api/rubrics/{id}`` y ``…/deactivate`` cambiaban el documento de una versión ya sellada."""
    version = _publish(_import(_document(seeded, "REV-LOCK"), admin), admin)
    rubric = _rubric(version)
    assert sum(c.weight for c in RubricCriterion.objects.filter(rubric=rubric, active=True)) == 100  # solo falla el estado
    sealed = definition_io.definition_view(version.id)["definitionHash"]

    with pytest.raises(ValidationError) as edit:
        rubric_service.update_rubric(rubric.id, {"name": "Otro nombre"}, admin)
    with pytest.raises(ValidationError) as toggle:
        rubric_service.activate(rubric.id, False, admin)

    assert "DRAFT" in str(edit.value.detail) and "DRAFT" in str(toggle.value.detail)
    after = Rubric.objects.get(pk=rubric.id)
    assert (after.name, after.active) == (rubric.name, rubric.active)
    assert definition_io.definition_view(version.id)["definitionHash"] == sealed


def test_a_rubric_of_a_draft_version_is_still_editable(admin, seeded):
    version = _import(_document(seeded, "REV-DRAFT"), admin)
    rubric = _rubric(version)

    rubric_service.update_rubric(rubric.id, {"name": "Nombre nuevo"}, admin)

    assert Rubric.objects.get(pk=rubric.id).name == "Nombre nuevo"


def test_a_library_rubric_without_a_version_is_editable_whatever_versions_exist(admin, seeded):
    library = Rubric.objects.create(name="De la biblioteca", description="", active=False, version="1.0", created_by=admin)
    rubric_service.update_rubric(library.id, {"name": "Renombrada"}, admin)
    assert Rubric.objects.get(pk=library.id).name == "Renombrada"


def test_the_definition_view_shows_the_sealed_hash_beside_the_current_one(admin, seeded):
    """I4: el hash actual se recalcula y ocultaba la deriva; el sellado viaja aparte para verla."""
    view = definition_io.definition_view(seeded.id)
    assert view["sealedHash"] == view["definitionHash"] == seeded.definition_hash

    RubricCriterion.objects.filter(rubric__case_version=seeded).update(title="Alterado por fuera")
    drifted = definition_io.definition_view(seeded.id)
    assert drifted["sealedHash"] == seeded.definition_hash != drifted["definitionHash"]


def test_a_draft_has_no_sealed_hash(admin, seeded):
    draft = publication.clone_version(seeded.id, admin)["caseVersionId"]
    assert definition_io.definition_view(draft)["sealedHash"] is None


# ─── M7 · la rúbrica importada es del dueño del caso ──────────────────────────────────────────
def test_a_version_imported_by_an_admin_into_a_teachers_case_keeps_its_rubrics_private(admin, teacher, other_teacher, seeded):
    """M7: ``created_by`` era quien importa; con un ADMIN la rúbrica quedaba visible para todos los docentes."""
    SimulationCase.objects.create(code="REV-OWN", title="Caso del docente", created_by=teacher)

    version = _import(_document(seeded, "REV-OWN"), admin)

    rubric = _rubric(version)
    assert rubric.created_by_id == teacher.id
    assert rubric.id not in [r["id"] for r in rubric_service.list_rubrics(other_teacher)]
    assert rubric.id in [r["id"] for r in rubric_service.list_rubrics(teacher)]


# ─── I6 · la semilla no archiva lo que acaba de publicar ──────────────────────────────────────
def _seed(*args):
    out, err = StringIO(), StringIO()
    call_command("seed_caso_pdf", *args, stdout=out, stderr=err)
    return out.getvalue(), err.getvalue()


def test_seeding_an_older_version_leaves_the_current_published_one_alone(seeded):
    """I6: tras ``--semantic-version 2.2.0``, la siembra por defecto (2.1.0, archivada) archivaba la 2.2.0."""
    _seed("--semantic-version", "2.2.0")
    assert CaseVersion.objects.get(simulation_case__code=SEED_CODE, status="PUBLISHED").semantic_version == "2.2.0"

    _, err = _seed()

    current = CaseVersion.objects.get(simulation_case__code=SEED_CODE, status="PUBLISHED")  # sin publicada: DoesNotExist
    assert current.semantic_version == "2.2.0"
    assert "ARCHIVED" in err


def test_a_published_version_that_does_not_validate_is_reported_by_the_seed_not_fatal(seeded):
    """I6: una base de desarrollo cuya versión publicada ya no valida tumbaba todo el arranque."""
    CaseVersion.objects.filter(pk=seeded.pk).update(validated_at=None, definition_hash=None, narrative_context="")
    SimulationCase.objects.filter(pk=seeded.simulation_case_id).update(description="")

    _, err = _seed()

    version = CaseVersion.objects.get(pk=seeded.pk)
    assert (version.status, version.definition_hash) == ("PUBLISHED", None)
    assert "no valida" in err and SEED_CODE in err


# ─── M3 · las puertas piden NPC por cualquiera de las claves con que el motor los reconoce ───
def _clone_with_dialogue(admin, seeded):
    draft = publication.clone_version(seeded.id, admin)["caseVersionId"]
    tree = DialogueTree.objects.filter(scene_map__case_version_id=draft).first()
    door = MapObject.objects.filter(scene_map__case_version_id=draft, object_type="EXIT").first()
    return CaseVersion.objects.get(pk=draft), tree, door


def _requires_npcs(door, keys):
    MapObject.objects.filter(pk=door.pk).update(metadata_json=json.dumps({"requiresNpcs": keys}))


def _unknown(version):
    return [i for i in run_world_validation(version)["errors"] if i["code"] == "REQUIRES_UNKNOWN"]


def test_a_door_may_require_an_npc_by_the_key_of_its_dialogue(admin, seeded):
    """M3: ``viewedNpcKeys`` guarda la clave del objeto y la del diálogo; la regla solo aceptaba la del objeto."""
    version, tree, door = _clone_with_dialogue(admin, seeded)
    DialogueTree.objects.filter(pk=tree.pk).update(tree_key="clave-propia-del-dialogo")  # distinta de la de todo objeto
    _requires_npcs(door, ["clave-propia-del-dialogo"])
    assert _unknown(version) == []


def test_a_door_may_require_an_ambient_npc_of_the_room(admin, seeded):
    version, _, door = _clone_with_dialogue(admin, seeded)
    SceneMap.objects.filter(pk=door.scene_map_id).update(
        ambient_json=json.dumps({"ambientNpcs": [{"key": "vecina-ambiente", "x": 10, "y": 10, "interactionRadius": 40}]})
    )
    _requires_npcs(door, ["vecina-ambiente"])
    assert _unknown(version) == []


def test_a_door_that_requires_an_npc_nobody_has_is_still_an_error(admin, seeded):
    version, _, door = _clone_with_dialogue(admin, seeded)
    _requires_npcs(door, ["nadie-conocido"])
    assert [i["entityRef"] for i in _unknown(version)] == [f"object:{door.id}"]


def test_the_workshop_scenarios_still_publish_after_all_of_it(admin):
    """Una última comprobación de humo: un documento del taller sigue importándose y publicándose."""
    _, _, document = next(s for s in dsl_support.scenarios() if s[1] == "valido")
    document = copy.deepcopy(document)
    document.pop("ejecucion", None)
    document["caso"]["id"] = "REV-TALLER"
    version = _publish(_import(document, admin), admin)
    assert version.status == "PUBLISHED" and version.definition_hash.startswith("sha256:")
