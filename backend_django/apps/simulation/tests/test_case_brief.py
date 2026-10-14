"""E3-4 · La ficha del caso (C8, RF-16, CU-07): contexto, personajes y objetivos sin crear intento.

``GET /api/simulation/cases/{id}/brief`` es lo que el estudiante lee **antes** de jugar: no crea
intento, solo lista los personajes que Psicología marcó para la ficha y no revela nada de un caso
que no tiene asignado (R8, Review Focus 7). ``PUT /api/authoring/cases/{id}/brief`` es la autoría:
texto plano con tope y 400 con el campo (Review Focus 4).
"""
import datetime
import json

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante
from apps.simulation.models import (
    AuditLog,
    CaseCharacter,
    CaseVersion,
    SimulationAttempt,
    SimulationCase,
    SimulationNode,
)

pytestmark = [pytest.mark.req("RF-16"), pytest.mark.req("CU-07")]

User = get_user_model()
BRIEF = "/api/simulation/cases/{}/brief"
AUTHORING = "/api/authoring/cases"
SEEDED_CODE = "SIM-VBG-001"


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(
        email=email, password="Clave-Segura-2026!", nombre="N", apellido="A", role=role
    )


@pytest.fixture
def profesor(db):
    return _user("brief_prof@x.com", "PROFESOR")


@pytest.fixture
def otro_profesor(db):
    return _user("brief_prof2@x.com", "PROFESOR")


@pytest.fixture
def admin(db):
    return _user("brief_admin@x.com", "ADMIN")


@pytest.fixture
def estudiante(db):
    return _user("brief_est@x.com", "ESTUDIANTE")


@pytest.fixture
def grupo(profesor, estudiante):
    group = Grupo.objects.create(nombre="G brief", codigo="BRIEF1", profesor=profesor)
    GrupoEstudiante.objects.create(grupo=group, estudiante=estudiante, status="ACTIVE")
    return group


@pytest.fixture
def seeded(db):
    return CaseVersion.objects.get(simulation_case__code=SEEDED_CODE, status="PUBLISHED")


def _published_case(owner, title="Caso de la ficha", code="BRIEF-CASE", context="", objectives=()):
    case = SimulationCase.objects.create(code=code, title=title, created_by=owner)
    return CaseVersion.objects.create(
        simulation_case=case, semantic_version="1.0.0", status="PUBLISHED", created_by=owner,
        narrative_context=context, learning_objectives=json.dumps(list(objectives)),
    )


def _authored(client, title="Caso en autoría"):
    response = client.post(AUTHORING, {"title": title}, format="json")
    assert response.status_code == 200, response.data
    return response.data["data"]


# ─── el estudiante ────────────────────────────────────────────────────────────────────────────
def test_the_brief_does_not_create_an_attempt(estudiante, grupo, seeded):
    CaseAssignment.objects.create(grupo=grupo, case_version=seeded)
    before = SimulationAttempt.objects.count()

    response = cl(estudiante).get(BRIEF.format(seeded.id))

    assert response.status_code == 200, response.data
    assert SimulationAttempt.objects.count() == before
    assert not SimulationAttempt.objects.filter(student=estudiante).exists()


def test_the_brief_carries_title_context_objectives_and_access(estudiante, grupo, profesor):
    version = _published_case(
        profesor, title="Violencia y rutas", context="Un barrio. Una familia.",
        objectives=["Identifica necesidades inmediatas.", "Activa rutas institucionales."],
    )
    CaseAssignment.objects.create(grupo=grupo, case_version=version)

    data = cl(estudiante).get(BRIEF.format(version.id)).data["data"]

    assert data["caseVersionId"] == version.id
    assert data["title"] == "Violencia y rutas"
    assert data["context"] == "Un barrio. Una familia."
    assert data["learningObjectives"] == ["Identifica necesidades inmediatas.", "Activa rutas institucionales."]
    assert data["access"] == {"allowed": True}
    assert data["characters"] == []
    assert data["hasSensitiveContent"] is False


def test_only_the_characters_marked_for_the_brief_are_listed_in_order(estudiante, grupo, profesor):
    version = _published_case(profesor)
    CaseCharacter.objects.create(
        case_version=version, character_key="b", display_name="Beatriz", role_label="Hermana",
        portrait_key="b-1", show_in_brief=True, display_order=2,
    )
    CaseCharacter.objects.create(
        case_version=version, character_key="a", display_name="Ana", role_label="Madre",
        portrait_key="a-1", show_in_brief=True, display_order=1,
    )
    CaseCharacter.objects.create(
        case_version=version, character_key="oculto", display_name="No se muestra",
        show_in_brief=False, display_order=0,
    )
    CaseAssignment.objects.create(grupo=grupo, case_version=version)

    characters = cl(estudiante).get(BRIEF.format(version.id)).data["data"]["characters"]

    assert [c["displayName"] for c in characters] == ["Ana", "Beatriz"]
    assert set(characters[0]) == {"id", "displayName", "roleLabel", "portraitKey"}
    assert (characters[0]["roleLabel"], characters[0]["portraitKey"]) == ("Madre", "a-1")


def test_sensitive_content_follows_the_nodes_of_the_version(estudiante, grupo, profesor):
    version = _published_case(profesor)
    node = SimulationNode.objects.create(
        case_version=version, node_key="n", title="N", narrative="x", sensitive_content=False
    )
    CaseAssignment.objects.create(grupo=grupo, case_version=version)
    client = cl(estudiante)

    assert client.get(BRIEF.format(version.id)).data["data"]["hasSensitiveContent"] is False

    SimulationNode.objects.filter(pk=node.pk).update(sensitive_content=True)

    assert client.get(BRIEF.format(version.id)).data["data"]["hasSensitiveContent"] is True


def _prepare(reason, grupo, version, profesor):
    now = timezone.now()
    day = datetime.timedelta(days=1)
    if reason == "NOT_ASSIGNED":
        return
    if reason == "ALLOWED":
        CaseAssignment.objects.create(grupo=grupo, case_version=version)
    elif reason == "NOT_YET_OPEN":
        CaseAssignment.objects.create(grupo=grupo, case_version=version, opens_at=now + day)
    elif reason == "CLOSED":
        CaseAssignment.objects.create(
            grupo=grupo, case_version=version, opens_at=now - 10 * day, closes_at=now - day
        )
    elif reason == "LOCKED_BY_SEQUENCE":
        earlier = _published_case(profesor, title="Previo", code="BRIEF-PREV")
        CaseAssignment.objects.create(grupo=grupo, case_version=earlier, sort_order=0)
        CaseAssignment.objects.create(grupo=grupo, case_version=version, sort_order=1)
    else:  # pragma: no cover
        raise AssertionError(reason)


@pytest.mark.parametrize("reason", ["NOT_YET_OPEN", "CLOSED", "LOCKED_BY_SEQUENCE"])
def test_an_assigned_case_that_cannot_start_still_serves_its_brief(
    estudiante, profesor, grupo, reason
):
    version = _published_case(profesor, title="Caso asignado", context="Contexto visible.")
    _prepare(reason, grupo, version, profesor)

    response = cl(estudiante).get(BRIEF.format(version.id))

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert data["title"] == "Caso asignado"
    assert data["access"]["allowed"] is False
    assert data["access"]["reason"] == reason
    if reason == "NOT_YET_OPEN":
        assert data["access"]["opensAt"].endswith("-05:00")
    if reason == "CLOSED":
        assert data["access"]["closesAt"].endswith("-05:00")


def test_an_unassigned_student_gets_a_403_and_nothing_of_the_case(estudiante, profesor, grupo):
    secret_title, secret_context = "Titulo reservado del caso", "Contexto reservado del caso"
    version = _published_case(
        profesor, title=secret_title, context=secret_context, objectives=["Objetivo reservado."]
    )
    CaseCharacter.objects.create(
        case_version=version, character_key="p", display_name="Personaje reservado", show_in_brief=True
    )

    response = cl(estudiante).get(BRIEF.format(version.id))

    assert response.status_code == 403
    assert response.data["code"] == "ACCESS_NOT_ASSIGNED"
    body = response.content.decode()
    for secret in (secret_title, secret_context, "Objetivo reservado", "Personaje reservado"):
        assert secret not in body


def test_an_inactive_assignment_is_the_same_as_none(estudiante, profesor, grupo):
    version = _published_case(profesor, title="Retirado")
    CaseAssignment.objects.create(grupo=grupo, case_version=version, active=False)

    response = cl(estudiante).get(BRIEF.format(version.id))

    assert response.status_code == 403
    assert response.data["code"] == "ACCESS_NOT_ASSIGNED"


def test_an_unpublished_version_is_not_served_to_students(estudiante, profesor, grupo):
    draft = _published_case(profesor, title="Borrador", code="BRIEF-DRAFT")
    CaseVersion.objects.filter(pk=draft.pk).update(status="DRAFT")
    CaseAssignment.objects.create(grupo=grupo, case_version=draft)

    assert cl(estudiante).get(BRIEF.format(draft.id)).status_code == 404


def test_a_deactivated_case_is_not_served_to_students(estudiante, profesor, grupo):
    version = _published_case(profesor, title="Dado de baja", code="BRIEF-OFF")
    CaseAssignment.objects.create(grupo=grupo, case_version=version)
    SimulationCase.objects.filter(pk=version.simulation_case_id).update(active=False)

    assert cl(estudiante).get(BRIEF.format(version.id)).status_code == 404


def test_a_missing_version_is_a_404(estudiante):
    assert cl(estudiante).get(BRIEF.format(999999999)).status_code == 404


# ─── el personal ──────────────────────────────────────────────────────────────────────────────
def test_staff_sees_a_published_brief_without_an_assignment(profesor, admin, seeded):
    for user in (profesor, admin):
        response = cl(user).get(BRIEF.format(seeded.id))

        assert response.status_code == 200, response.data
        assert response.data["data"]["access"] == {"allowed": True}


def test_the_owner_previews_their_draft_and_another_professor_does_not(profesor, otro_profesor):
    case = _authored(cl(profesor), "Mi borrador")
    cv = case["caseVersionId"]
    assert cl(profesor).put(
        f"{AUTHORING}/{cv}/brief", {"context": "Contexto del borrador."}, format="json"
    ).status_code == 200

    own = cl(profesor).get(BRIEF.format(cv))
    foreign = cl(otro_profesor).get(BRIEF.format(cv))

    assert own.status_code == 200, own.data
    assert own.data["data"]["context"] == "Contexto del borrador."
    assert foreign.status_code == 404


# ─── el caso sembrado ─────────────────────────────────────────────────────────────────────────
def test_the_seeded_case_serves_its_paragraphs_and_objectives_from_the_server(admin, seeded):
    data = cl(admin).get(BRIEF.format(seeded.id)).data["data"]

    paragraphs = data["context"].split("\n\n")
    assert len(paragraphs) == 6
    assert paragraphs[0].startswith("Son las 11 de la noche en un barrio")
    assert paragraphs[-1].startswith("Tu intervención inicia en urgencias.")
    assert len(data["learningObjectives"]) == 4
    assert data["learningObjectives"][0] == (
        "Identifica necesidades inmediatas y estabiliza a la víctima y su red de apoyo."
    )
    assert data["hasSensitiveContent"] is True


# ─── autoría ──────────────────────────────────────────────────────────────────────────────────
def test_the_author_writes_the_context_and_the_objectives(profesor):
    client = cl(profesor)
    case = _authored(client)
    cv = case["caseVersionId"]

    response = client.put(
        f"{AUTHORING}/{cv}/brief",
        {"context": "Un barrio con altas condiciones de vulnerabilidad.",
         "learningObjectives": ["Identifica necesidades inmediatas.", "Aplica referentes legales."]},
        format="json",
    )

    assert response.status_code == 200, response.data
    editor = response.data["data"]
    assert editor["context"] == "Un barrio con altas condiciones de vulnerabilidad."
    assert editor["learningObjectives"] == ["Identifica necesidades inmediatas.", "Aplica referentes legales."]
    assert editor["revision"] == case["revision"] + 1
    assert client.get(f"{AUTHORING}/{cv}/editor").data["data"]["learningObjectives"] == editor["learningObjectives"]


def test_absent_fields_are_not_touched(profesor):
    client = cl(profesor)
    cv = _authored(client)["caseVersionId"]
    client.put(
        f"{AUTHORING}/{cv}/brief", {"context": "Contexto.", "learningObjectives": ["Objetivo uno."]},
        format="json",
    )

    only_context = client.put(f"{AUTHORING}/{cv}/brief", {"context": "Otro contexto."}, format="json")
    only_objectives = client.put(
        f"{AUTHORING}/{cv}/brief", {"learningObjectives": ["Objetivo dos."]}, format="json"
    )
    cleared = client.put(f"{AUTHORING}/{cv}/brief", {"learningObjectives": []}, format="json")

    assert only_context.data["data"]["learningObjectives"] == ["Objetivo uno."]
    assert only_objectives.data["data"]["context"] == "Otro contexto."
    assert only_objectives.data["data"]["learningObjectives"] == ["Objetivo dos."]
    assert cleared.data["data"]["learningObjectives"] == []
    assert cleared.data["data"]["context"] == "Otro contexto."


@pytest.mark.parametrize(
    "body,field",
    [
        ({"learningObjectives": ["<script>alert(1)</script>"]}, "learningObjectives"),
        ({"learningObjectives": ["Un objetivo con <b>negrita</b>"]}, "learningObjectives"),
        ({"learningObjectives": ["Mira https://ejemplo.com"]}, "learningObjectives"),
        ({"learningObjectives": ["x" * 281]}, "learningObjectives"),
        ({"learningObjectives": ["Uno válido.", "   "]}, "learningObjectives"),
        ({"learningObjectives": [f"Objetivo {n}." for n in range(13)]}, "learningObjectives"),
        ({"learningObjectives": "no es una lista"}, "learningObjectives"),
        ({"context": "<i>énfasis</i>"}, "context"),
        ({"context": "Más en www.ejemplo.org"}, "context"),
        ({"context": "javascript:alert(1)"}, "context"),
        ({"context": "x" * 4001}, "context"),
    ],
)
def test_invalid_authored_text_is_a_400_naming_the_field_and_changes_nothing(profesor, body, field):
    client = cl(profesor)
    case = _authored(client)
    cv = case["caseVersionId"]

    response = client.put(f"{AUTHORING}/{cv}/brief", body, format="json")

    assert response.status_code == 400, response.data
    assert response.data["field"] == field
    assert client.get(f"{AUTHORING}/{cv}/editor").data["data"]["revision"] == case["revision"]


def test_a_foreign_professor_cannot_write_the_brief(profesor, otro_profesor):
    cv = _authored(cl(profesor))["caseVersionId"]

    response = cl(otro_profesor).put(f"{AUTHORING}/{cv}/brief", {"context": "x"}, format="json")

    assert response.status_code == 403


def test_a_published_version_is_not_edited(admin, seeded):
    response = cl(admin).put(f"{AUTHORING}/{seeded.id}/brief", {"context": "x"}, format="json")

    assert response.status_code == 400


def test_a_stale_revision_conflicts(profesor, admin):
    case = _authored(cl(profesor))
    cv, stale = case["caseVersionId"], case["revision"]
    assert cl(admin).put(f"{AUTHORING}/{cv}/brief", {"context": "Primero."}, format="json").status_code == 200

    response = cl(profesor).put(
        f"{AUTHORING}/{cv}/brief", {"context": "Segundo.", "revision": stale}, format="json"
    )

    assert response.status_code == 409
    assert response.data["code"] == "REVISION_CONFLICT"


def test_cloning_copies_the_context_and_the_objectives(profesor, admin):
    client = cl(profesor)
    cv = _authored(client)["caseVersionId"]
    client.put(
        f"{AUTHORING}/{cv}/brief",
        {"context": "Contexto copiado.", "learningObjectives": ["Objetivo copiado."]}, format="json",
    )

    cloned = cl(admin).post(f"{AUTHORING}/{cv}/clone-version", {}, format="json")

    assert cloned.status_code == 200, cloned.data
    assert cloned.data["data"]["context"] == "Contexto copiado."
    assert cloned.data["data"]["learningObjectives"] == ["Objetivo copiado."]


def test_the_brief_write_is_audited(profesor):
    client = cl(profesor)
    cv = _authored(client)["caseVersionId"]

    client.put(f"{AUTHORING}/{cv}/brief", {"context": "Auditado."}, format="json")

    assert AuditLog.objects.filter(
        action="ADMIN_UPDATE_BRIEF", resource_type="CASE_VERSION", resource_id=str(cv),
        actor_id=profesor.id,
    ).exists()
