"""E4-5 · Importar un documento crea un borrador (RF-12, RQ-NEG-007, LS-14, LS-16, Review Focus 4).

``POST /api/authoring/cases/import`` (y su alias ``/api/admin/cases/import``) recibe el documento del caso
—el que exporta ``definition_io.export_definition``, o uno del DSL del taller sin ``x-siep``—, lo valida con
el validador único y crea **siempre un borrador** con quien importa como dueño. Un documento válido da lo
mismo al volver: ``export(import(export(v))) == export(v)``. Uno sin ``x-siep`` recibe una sala mínima
jugable por escena. Ante el primer error no queda ninguna fila.
"""
import copy
import json

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.casedef.canonical import definition_hash, document_text
from apps.simulation.models import (
    CaseVersion,
    DecisionOption,
    DialogueChoice,
    MapObject,
    PublicationChecklist,
    SimulationCase,
    SimulationNode,
)
from apps.simulation.services.authoring import definition_io, validation
from apps.simulation.tests import dsl_support

pytestmark = [pytest.mark.req("RF-12"), pytest.mark.req("LS-14"), pytest.mark.req("RQ-NEG-007")]

User = get_user_model()
IMPORT = "/api/authoring/cases/import"
ALIAS = "/api/admin/cases/import"


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def post(user, document, path=IMPORT, content_type="application/json"):
    body = document if isinstance(document, bytes) else json.dumps(document, ensure_ascii=False).encode("utf-8")
    return cl(user).generic("POST", path, data=body, content_type=content_type)


def _user(email, role):
    return User.objects.create_user(email=email, password="pass1234", nombre="Nom", apellido="Ape", role=role)


@pytest.fixture
def admin(db):
    return _user("imp_admin@x.com", "ADMIN")


@pytest.fixture
def prof(db):
    return _user("imp_prof@x.com", "PROFESOR")


@pytest.fixture
def other_prof(db):
    return _user("imp_other@x.com", "PROFESOR")


@pytest.fixture
def student(db):
    return _user("imp_student@x.com", "ESTUDIANTE")


@pytest.fixture
def seeded(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")


@pytest.fixture
def exported(seeded):
    return definition_io.export_definition(seeded.id)


def workshop_document():
    """El primer escenario válido del taller, sin ``ejecucion`` (que el producto no importa)."""
    _, _, document = next(s for s in dsl_support.scenarios() if s[1] == "valido")
    document = copy.deepcopy(document)
    document.pop("ejecucion", None)
    return document


def _as(document, code, **caso):
    document = copy.deepcopy(document)
    document["caso"]["id"] = code
    document["caso"].update(caso)
    return document


def _comparable(document, code, state="BORRADOR"):
    document = copy.deepcopy(document)
    document["caso"]["id"] = code
    document["caso"]["estado"] = state
    return document


# ─── ida y vuelta ─────────────────────────────────────────────────────────────────────────────
def test_the_seeded_case_comes_back_identical_after_an_import(admin, exported):
    response = post(admin, _as(exported, "COPIA-001"))

    assert response.status_code == 201, response.data
    again = definition_io.export_definition(response.data["data"]["caseVersionId"])
    expected = _comparable(exported, "COPIA-001")
    assert again == expected
    assert document_text(again) == document_text(expected)
    assert definition_hash(again) == definition_hash(expected)


def test_a_second_round_trip_is_a_fixed_point(admin, exported):
    first = post(admin, _as(exported, "COPIA-002")).data["data"]["caseVersionId"]
    second_document = _as(definition_io.export_definition(first), "COPIA-003")

    second = post(admin, second_document).data["data"]["caseVersionId"]

    assert definition_io.export_definition(second) == _comparable(second_document, "COPIA-003")


def test_the_alias_route_imports_the_same_way(admin, exported):
    response = post(admin, _as(exported, "COPIA-004"), path=ALIAS)

    assert response.status_code == 201, response.data


def test_the_response_carries_the_ids_and_the_warnings_only(admin, exported):
    data = post(admin, _as(exported, "COPIA-005")).data["data"]

    assert set(data) == {"caseVersionId", "caseId", "issues"}
    assert CaseVersion.objects.get(pk=data["caseVersionId"]).simulation_case_id == data["caseId"]
    assert all(issue["severity"] == "warning" for issue in data["issues"])


def test_the_imported_version_is_a_draft_with_a_checklist_and_no_seal(admin, exported):
    version = CaseVersion.objects.get(pk=post(admin, _as(exported, "COPIA-006", estado="PUBLICADO")).data["data"]["caseVersionId"])

    assert version.status == "DRAFT"  # caso.estado se ignora
    assert (version.validated_at, version.definition_hash, version.published_at) == (None, None, None)
    assert PublicationChecklist.objects.filter(case_version=version).exists()


def test_a_description_derived_from_the_context_is_not_stored_as_the_case_description(admin, exported):
    """El caso sin descripción propia exporta su contexto como descripción y lo marca; al volver, no se guarda."""
    document = _as(exported, "DERIVADA-001")
    document["caso"]["descripcion"] = document["x-siep"]["contexto"] = "El contexto que lee el estudiante."
    document["x-siep"]["descripcionDerivada"] = True

    data = post(admin, document).data["data"]

    assert not SimulationCase.objects.get(pk=data["caseId"]).description
    version = CaseVersion.objects.get(pk=data["caseVersionId"])
    assert version.narrative_context == "El contexto que lee el estudiante."
    assert definition_io.export_definition(version.id) == _comparable(document, "DERIVADA-001")


# ─── un documento del taller, sin x-siep ──────────────────────────────────────────────────────
def test_a_workshop_document_without_x_siep_is_imported_with_a_minimal_room_per_scene(admin):
    document = workshop_document()

    response = post(admin, document)

    assert response.status_code == 201, response.data
    cv = response.data["data"]["caseVersionId"]
    imported = definition_io.export_definition(cv)
    assert [scene["clave"] for scene in imported["x-siep"]["escenas"]] == [e["id"] for e in document["escenas"]]
    for entry, source in zip(imported["x-siep"]["escenas"], document["escenas"]):
        room = entry["mapa"]
        assert any(obj["tipo"] == "EXIT" for obj in room["objetos"])
        offered = {c["opcion"] for tree in room["dialogos"] for c in tree["elecciones"]}
        wanted = {o["id"] for o in source.get("decision", {}).get("opciones", [])}
        assert offered == wanted  # una elección por opción, y ninguna más


def test_the_minimal_rooms_make_the_imported_case_publishable_apart_from_the_checklist(admin):
    cv = post(admin, workshop_document()).data["data"]["caseVersionId"]

    issues, can_publish = validation.validate_version(cv)

    assert can_publish is True, [i for i in issues if i["severity"] == "error"]


def test_a_workshop_document_keeps_its_texts_and_structure_after_the_import(admin):
    source = workshop_document()
    cv = post(admin, source).data["data"]["caseVersionId"]

    imported = definition_io.export_definition(cv)

    assert imported["caso"]["titulo"] == source["caso"]["titulo"]
    assert imported["caso"]["escenaInicial"] == source["caso"]["escenaInicial"]
    assert [(e["id"], e["titulo"]) for e in imported["escenas"]] == [(e["id"], e["titulo"]) for e in source["escenas"]]
    source_options = [o["texto"] for e in source["escenas"] for o in e.get("decision", {}).get("opciones", [])]
    imported_options = [o["texto"] for e in imported["escenas"] for o in e.get("decision", {}).get("opciones", [])]
    assert imported_options == source_options


def test_a_workshop_import_is_stable_on_a_second_round(admin):
    first = post(admin, _as(workshop_document(), "TALLER-A")).data["data"]["caseVersionId"]
    document = _as(definition_io.export_definition(first), "TALLER-B")

    second = post(admin, document).data["data"]["caseVersionId"]

    assert definition_io.export_definition(second) == _comparable(document, "TALLER-B")


def test_feedback_attached_to_a_decision_is_omitted_with_a_warning(admin):
    document = workshop_document()
    assert any("decision" in item for item in document["retroalimentacion"])  # el taller lo usa

    response = post(admin, document)

    assert response.status_code == 201
    codes = {issue["code"] for issue in response.data["data"]["issues"]}
    assert "DSL.FEEDBACK_ON_DECISION_IGNORED" in codes


def test_the_tematica_field_has_no_home_in_the_product_and_is_reported(admin):
    document = workshop_document()
    assert "tematica" in document["caso"]

    codes = {issue["code"] for issue in post(admin, document).data["data"]["issues"]}

    assert "DSL.FIELD_IGNORED" in codes


def test_the_imported_draft_opens_in_the_editors_and_lists_among_the_cases(prof, exported):
    """Lo importado es un borrador como cualquier otro: el editor, el editor de mundo y la lista lo leen."""
    data = post(prof, _as(exported, "EDITOR-001")).data["data"]
    cv = data["caseVersionId"]
    api = cl(prof)

    editor = api.get(f"/api/authoring/cases/{cv}/editor")
    world = api.get(f"/api/authoring/cases/{cv}/world-editor")
    listing = api.get("/api/authoring/cases")

    assert editor.status_code == 200, editor.data
    assert editor.data["data"]["caseVersionId"] == cv and editor.data["data"]["nodes"]
    assert world.status_code == 200, world.data
    assert cv in {item["caseVersionId"] for item in listing.data["data"]}


def test_the_imported_workshop_draft_opens_in_the_world_editor_of_every_scene(admin):
    cv = post(admin, workshop_document()).data["data"]["caseVersionId"]
    api = cl(admin)
    nodes = api.get(f"/api/authoring/cases/{cv}/editor").data["data"]["nodes"]

    for node in nodes:
        response = api.get(f"/api/authoring/cases/{cv}/world-editor", {"nodeId": node["id"]})
        assert response.status_code == 200, (node["key"], response.data)


# ─── quién importa y dónde ────────────────────────────────────────────────────────────────────
def test_the_person_who_imports_owns_the_new_case(prof, exported):
    data = post(prof, _as(exported, "PROF-001")).data["data"]

    assert SimulationCase.objects.get(pk=data["caseId"]).created_by_id == prof.id


def test_an_own_case_receives_a_new_version(prof, exported):
    first = post(prof, _as(exported, "PROF-002", version="1.0.0")).data["data"]
    second = post(prof, _as(exported, "PROF-002", version="1.1.0"))

    assert second.status_code == 201, second.data
    assert second.data["data"]["caseId"] == first["caseId"]
    assert second.data["data"]["caseVersionId"] != first["caseVersionId"]
    assert CaseVersion.objects.filter(simulation_case_id=first["caseId"]).count() == 2


def test_somebody_elses_case_is_refused(prof, other_prof, exported):
    post(prof, _as(exported, "PROF-003", version="1.0.0"))

    response = post(other_prof, _as(exported, "PROF-003", version="2.0.0"))

    assert response.status_code == 403
    assert response.data["code"] == "CASE_NOT_OWNED"


def test_the_admin_can_add_a_version_to_anyones_case(prof, admin, exported):
    first = post(prof, _as(exported, "PROF-004", version="1.0.0")).data["data"]

    response = post(admin, _as(exported, "PROF-004", version="2.0.0"))

    assert response.status_code == 201
    assert response.data["data"]["caseId"] == first["caseId"]


def test_a_repeated_version_is_a_conflict(prof, exported):
    post(prof, _as(exported, "PROF-005", version="1.0.0"))

    response = post(prof, _as(exported, "PROF-005", version="1.0.0"))

    assert response.status_code == 409
    assert response.data["code"] == "CASE_VERSION_EXISTS"


def test_a_student_cannot_import(student, exported):
    assert post(student, _as(exported, "NO-001")).status_code == 403


def test_an_anonymous_request_is_not_authenticated(exported):
    response = APIClient().generic(
        "POST", IMPORT, data=json.dumps(_as(exported, "NO-002")).encode("utf-8"), content_type="application/json"
    )

    assert response.status_code in (401, 403)


# ─── lo que el producto no importa ────────────────────────────────────────────────────────────
def test_a_document_with_execution_data_is_rejected_whole(admin, exported):
    document = _as(exported, "EJEC-001")
    document["ejecucion"] = {"estudiantes": [], "intentos": [], "evaluaciones": []}
    before = SimulationCase.objects.count()

    response = post(admin, document)

    assert response.status_code == 400 and response.data["code"] == "DSL_INVALID"
    assert "DSL.EXECUTION_NOT_IMPORTABLE" in {issue["code"] for issue in response.data["issues"]}
    assert SimulationCase.objects.count() == before


# ─── nada queda a medias ──────────────────────────────────────────────────────────────────────
def _row_counts():
    return tuple(
        model.objects.count()
        for model in (SimulationCase, CaseVersion, SimulationNode, DecisionOption, MapObject, DialogueChoice)
    )


def test_an_invalid_document_leaves_no_rows(admin, exported):
    document = _as(exported, "FALLA-001")
    document["x-siep"]["escenas"][0]["mapa"]["objetos"][0]["opcion"] = "no-existe"
    before = _row_counts()

    response = post(admin, document)

    assert response.status_code == 400 and response.data["code"] == "DSL_INVALID"
    assert any(issue["code"] == "DSL.SIEP_REF" for issue in response.data["issues"])
    assert _row_counts() == before


def test_a_failure_while_writing_rolls_everything_back(admin, exported, monkeypatch):
    from apps.simulation.models import RubricCriterion

    def explode(*args, **kwargs):
        raise RuntimeError("fallo a mitad de la escritura")

    monkeypatch.setattr(RubricCriterion.objects, "bulk_create", explode)
    before = _row_counts()

    response = post(admin, _as(exported, "FALLA-002"))

    assert response.status_code == 500  # un fallo inesperado no se disfraza de documento inválido
    assert _row_counts() == before
