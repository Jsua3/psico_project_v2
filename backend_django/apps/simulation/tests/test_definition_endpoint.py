"""E4-7 · ``GET …/cases/{id}/definition``: el documento de una versión (RF-12, RQ-NEG-007, LS-14).

Devuelve ``{definition, definitionHash, sealedHash, validatedAt, reuseRatio}`` de una versión **borrador o
publicada**: el mismo documento que se valida, se sella y se importa. El hash de un borrador es el que tendría
si se publicara; ``sealedHash`` es el que se selló (vacío sin sello), ``validatedAt`` solo lo tiene lo sellado
y ``reuseRatio`` solo un clon publicado. Leer lo ajeno
no confirma que exista (404); un estudiante no pasa la puerta (403). Está montado en las dos rutas
(``/api/authoring/cases`` y su alias ``/api/admin/cases``).
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.casedef.canonical import canonical_bytes, definition_hash
from apps.simulation.models import CaseVersion
from apps.simulation.services.authoring import definition_io, gate, publication

pytestmark = [pytest.mark.req("RF-12"), pytest.mark.req("LS-14"), pytest.mark.req("RQ-NEG-007")]

User = get_user_model()
AUTHORING = "/api/authoring/cases"
ALIAS = "/api/admin/cases"


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(email=email, password="pass1234", nombre="Nom", apellido="Ape", role=role)


@pytest.fixture
def admin(db):
    return _user("def_admin@x.com", "ADMIN")


@pytest.fixture
def owner(db):
    return _user("def_owner@x.com", "PROFESOR")


@pytest.fixture
def stranger(db):
    return _user("def_stranger@x.com", "PROFESOR")


@pytest.fixture
def student(db):
    return _user("def_student@x.com", "ESTUDIANTE")


@pytest.fixture
def seeded(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")


@pytest.fixture
def draft(seeded, owner):
    """Un borrador del profesor (copia del caso sembrado) a su nombre."""
    from apps.simulation.models import SimulationCase

    cv = publication.clone_version(seeded.id, owner)["caseVersionId"]
    case = SimulationCase.objects.create(code="DEF-OWNER-1", title="Caso del profesor", created_by=owner)
    CaseVersion.objects.filter(pk=cv).update(simulation_case=case, semantic_version="0.1.0")
    return CaseVersion.objects.get(pk=cv)


def _get(user, version_id, base=AUTHORING):
    return cl(user).get(f"{base}/{version_id}/definition")


def test_the_owner_reads_the_document_of_their_draft(owner, draft):
    response = _get(owner, draft.id)

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert set(data) == {"definition", "definitionHash", "sealedHash", "validatedAt", "reuseRatio"}
    assert canonical_bytes(data["definition"]) == canonical_bytes(definition_io.export_definition(draft.id))
    assert data["definitionHash"] == definition_hash(data["definition"])


def test_a_draft_has_the_hash_it_would_have_if_it_were_published_and_no_seal(owner, admin, draft):
    before = _get(owner, draft.id).data["data"]
    assert before["validatedAt"] is None and before["sealedHash"] is None and before["reuseRatio"] is None

    seal = gate.ensure_publishable(draft, require_checklist=False)
    gate.mark_published(draft, seal, admin)

    after = _get(owner, draft.id).data["data"]
    assert after["definitionHash"] == before["definitionHash"] == seal.definition_hash
    assert after["validatedAt"] is not None and after["sealedHash"] == seal.definition_hash
    assert after["reuseRatio"] == 1.0  # un clon sin cambios


def test_the_admin_reads_any_version_through_both_routes(admin, seeded):
    first = _get(admin, seeded.id)
    second = _get(admin, seeded.id, ALIAS)

    assert first.status_code == second.status_code == 200
    assert first.data["data"] == second.data["data"]
    assert first.data["data"]["definitionHash"] == seeded.definition_hash
    assert first.data["data"]["reuseRatio"] is None  # el original no es un clon


def test_the_answer_is_the_same_in_two_calls(admin, seeded):
    assert _get(admin, seeded.id).data == _get(admin, seeded.id).data


def test_a_foreign_professor_does_not_learn_that_the_version_exists(stranger, draft):
    assert _get(stranger, draft.id).status_code == 404


def test_a_version_that_does_not_exist_is_404_for_everyone(owner, admin):
    assert _get(owner, 99999999).status_code == 404
    assert _get(admin, 99999999).status_code == 404


def test_a_student_is_stopped_at_the_gate(student, draft):
    assert _get(student, draft.id).status_code == 403


def test_an_anonymous_request_is_not_authenticated(draft):
    assert APIClient().get(f"{AUTHORING}/{draft.id}/definition").status_code in (401, 403)
