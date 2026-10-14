"""E2-10 · Membresías con invitación (C5; D-14, decisión 22, RF-04, RF-25).

El docente **invita**; el estudiante acepta o rechaza; mientras no sea ``ACTIVE`` la persona
no entra al caso asignado y su traza, su bitácora descifrada y los reportes no la incluyen.
Lo anterior a la migración quedó ``ACTIVE`` y «agregar por correo» no revela si la cuenta
existe ni si es de estudiante.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.grupos.models import Grupo, GrupoEstudiante
from apps.simulation.models import CaseVersion
from apps.simulation.tests.test_game import attempt_headers

pytestmark = [pytest.mark.req("D-14"), pytest.mark.req("RF-04"), pytest.mark.req("RF-25")]

User = get_user_model()


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _user(email, role="ESTUDIANTE"):
    return User.objects.create_user(email=email, password="Clave-Segura-2026!", nombre="Nom", apellido="Ape", role=role)


@pytest.fixture
def profesor(db):
    return _user("inv_prof@x.com", "PROFESOR")


@pytest.fixture
def otro_profesor(db):
    return _user("inv_prof2@x.com", "PROFESOR")


@pytest.fixture
def admin(db):
    return _user("inv_admin@x.com", "ADMIN")


@pytest.fixture
def estudiante(db):
    return _user("inv_est@x.com")


@pytest.fixture
def grupo(profesor):
    return Grupo.objects.create(nombre="G inv", codigo="INV1", profesor=profesor)


@pytest.fixture
def case_version_id(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id


def _invite(client, grupo, email):
    return client.post(f"/api/grupos/{grupo.id}/estudiantes", {"email": email}, format="json")


def _status(grupo, estudiante):
    return GrupoEstudiante.objects.get(grupo_id=grupo.id, estudiante_id=estudiante.id).status


# ─── invitar, aceptar y rechazar ────────────────────────────────────────────────────────
def test_inviting_creates_an_invited_membership_that_the_student_sees(profesor, grupo, estudiante):
    response = _invite(cl(profesor), grupo, estudiante.email)

    assert response.status_code == 200
    assert _status(grupo, estudiante) == "INVITED"
    invitations = cl(estudiante).get("/api/me/invitations").data["data"]
    assert invitations == [{
        "id": grupo.id, "groupId": grupo.id, "groupName": "G inv", "teacherName": "Nom Ape",
        "invitedAt": invitations[0]["invitedAt"], "status": "INVITED",
    }]
    assert invitations[0]["invitedAt"]


def test_accepting_makes_the_membership_active_and_declining_hides_it(profesor, grupo, estudiante):
    _invite(cl(profesor), grupo, estudiante.email)

    accepted = cl(estudiante).post(f"/api/me/invitations/{grupo.id}/accept", {}, format="json")

    assert accepted.status_code == 200
    assert accepted.data["data"]["status"] == "ACTIVE"
    assert _status(grupo, estudiante) == "ACTIVE"
    again = cl(estudiante).post(f"/api/me/invitations/{grupo.id}/accept", {}, format="json")
    assert again.status_code == 409 and again.data["code"] == "MEMBERSHIP_NOT_INVITED"


def test_declining_keeps_the_student_out(profesor, grupo, estudiante):
    _invite(cl(profesor), grupo, estudiante.email)

    declined = cl(estudiante).post(f"/api/me/invitations/{grupo.id}/decline", {}, format="json")

    assert declined.status_code == 200
    assert _status(grupo, estudiante) == "DECLINED"
    listed = cl(estudiante).get("/api/me/invitations").data["data"]
    assert [i["status"] for i in listed] == ["DECLINED"]
    # El docente puede volver a invitar.
    _invite(cl(profesor), grupo, estudiante.email)
    assert _status(grupo, estudiante) == "INVITED"


def test_a_student_only_answers_their_own_invitations(profesor, grupo, estudiante):
    other = _user("inv_other@x.com")
    _invite(cl(profesor), grupo, estudiante.email)

    response = cl(other).post(f"/api/me/invitations/{grupo.id}/accept", {}, format="json")

    assert response.status_code == 404
    assert _status(grupo, estudiante) == "INVITED"
    assert cl(other).get("/api/me/invitations").data["data"] == []


def test_the_admin_can_activate_on_behalf_of_the_student(profesor, grupo, estudiante, admin):
    _invite(cl(profesor), grupo, estudiante.email)

    response = cl(admin).post(
        f"/api/grupos/{grupo.id}/estudiantes/{estudiante.id}/activar", {}, format="json"
    )

    assert response.status_code == 200
    assert _status(grupo, estudiante) == "ACTIVE"
    assert cl(profesor).post(
        f"/api/grupos/{grupo.id}/estudiantes/{estudiante.id}/activar", {}, format="json"
    ).status_code == 403


def test_only_the_groups_professor_or_admin_invites(profesor, otro_profesor, grupo, estudiante, admin):
    assert _invite(cl(otro_profesor), grupo, estudiante.email).status_code == 400
    assert not GrupoEstudiante.objects.filter(grupo_id=grupo.id).exists()
    assert _invite(cl(admin), grupo, estudiante.email).status_code == 200
    assert _status(grupo, estudiante) == "INVITED"
    assert cl(estudiante).post(
        f"/api/grupos/{grupo.id}/estudiantes", {"email": "x@x.com"}, format="json"
    ).status_code == 403


# ─── «agregar por correo» no revela quién tiene cuenta ─────────────────────────────────
def test_the_three_answers_of_add_by_email_are_identical(profesor, grupo, estudiante):
    teacher = _user("inv_docente2@x.com", "PROFESOR")
    ok = _invite(cl(profesor), grupo, estudiante.email)
    missing = _invite(cl(profesor), grupo, "no.existe@x.com")
    not_a_student = _invite(cl(profesor), grupo, teacher.email)
    already = _invite(cl(profesor), grupo, estudiante.email)

    bodies = [r.data for r in (ok, missing, not_a_student, already)]
    assert {r.status_code for r in (ok, missing, not_a_student, already)} == {200}
    assert bodies[0] == bodies[1] == bodies[2] == bodies[3]
    assert not GrupoEstudiante.objects.filter(estudiante_id=teacher.id).exists()


# ─── lo que ve el docente mientras no es ACTIVE ────────────────────────────────────────
def _plant_open_attempt(estudiante, grupo, case_version_id):
    """Un intento abierto del estudiante, con la asignación y la membresía de ``grupo``."""
    from apps.grupos.models import GrupoCaseVersion

    GrupoCaseVersion.objects.get_or_create(grupo_id=grupo.id, case_version_id=case_version_id)
    GrupoEstudiante.objects.update_or_create(
        grupo_id=grupo.id, estudiante_id=estudiante.id, defaults={"status": "ACTIVE"}
    )
    started = cl(estudiante).post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]
    return started


def test_an_invited_student_has_no_access_no_trace_and_no_report_rows(profesor, grupo, estudiante, case_version_id):
    started = _plant_open_attempt(estudiante, grupo, case_version_id)
    attempt_id = started["attemptId"]
    assert cl(profesor).get(f"/api/instructor/attempts/{attempt_id}/trace").status_code == 200
    report = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}?caseVersionId={case_version_id}").data["data"]
    assert report["simulacion"]["estudiantes"]

    GrupoEstudiante.objects.filter(grupo_id=grupo.id, estudiante_id=estudiante.id).update(status="INVITED")

    # Sin acceso al caso ni a su intento abierto.
    assert cl(estudiante).post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).status_code == 403
    state = cl(estudiante).get(
        f"/api/simulation/attempts/{attempt_id}", **attempt_headers(started["attemptToken"])
    )
    assert state.status_code == 403 and state.data["code"] == "ACCESS_NOT_ASSIGNED"
    # Sin traza para su docente y fuera de los reportes y del CSV.
    assert cl(profesor).get(f"/api/instructor/attempts/{attempt_id}/trace").status_code == 403
    hidden = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}?caseVersionId={case_version_id}").data["data"]
    assert hidden["simulacion"]["estudiantes"] == []
    csv = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}/export?caseVersionId={case_version_id}").content.decode()
    assert len([line for line in csv.strip().split("\n") if line]) == 1  # solo el encabezado


@pytest.mark.parametrize("status", ["DECLINED", "REMOVED"])
def test_declined_or_removed_students_stay_hidden(profesor, grupo, estudiante, case_version_id, status):
    started = _plant_open_attempt(estudiante, grupo, case_version_id)
    GrupoEstudiante.objects.filter(grupo_id=grupo.id, estudiante_id=estudiante.id).update(status=status)

    assert cl(profesor).get(f"/api/instructor/attempts/{started['attemptId']}/trace").status_code == 403
    assert cl(estudiante).post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).status_code == 403


def test_accepting_makes_everything_appear(profesor, grupo, estudiante, case_version_id):
    started = _plant_open_attempt(estudiante, grupo, case_version_id)
    GrupoEstudiante.objects.filter(grupo_id=grupo.id, estudiante_id=estudiante.id).update(status="INVITED")
    assert cl(profesor).get(f"/api/instructor/attempts/{started['attemptId']}/trace").status_code == 403

    cl(estudiante).post(f"/api/me/invitations/{grupo.id}/accept", {}, format="json")

    assert cl(profesor).get(f"/api/instructor/attempts/{started['attemptId']}/trace").status_code == 200


def test_removing_a_student_is_a_soft_state_and_keeps_the_row(profesor, grupo, estudiante):
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=estudiante, status="ACTIVE")

    response = cl(profesor).delete(f"/api/grupos/{grupo.id}/estudiantes/{estudiante.id}")

    assert response.status_code == 200
    assert _status(grupo, estudiante) == "REMOVED"
    listed = cl(profesor).get(f"/api/grupos/{grupo.id}/estudiantes").data["data"]
    assert listed == []


def test_the_member_list_and_total_reflect_the_status(profesor, grupo, estudiante):
    other = _user("inv_second@x.com")
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=estudiante, status="ACTIVE")
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=other, status="INVITED")

    listed = cl(profesor).get(f"/api/grupos/{grupo.id}/estudiantes").data["data"]
    groups = cl(profesor).get("/api/grupos").data["data"]

    assert {s["email"]: s["membershipStatus"] for s in listed} == {
        estudiante.email: "ACTIVE", other.email: "INVITED",
    }
    assert next(g for g in groups if g["id"] == grupo.id)["totalEstudiantes"] == 1


def test_rows_inserted_without_a_status_are_active_grandfathered(grupo, estudiante):
    """Las membresías anteriores a E2-10 (y los INSERT crudos de semillas) quedan ACTIVE."""
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO grupo_estudiante (grupo_id, estudiante_id) VALUES (%s, %s)", [grupo.id, estudiante.id]
        )

    assert _status(grupo, estudiante) == "ACTIVE"


def test_an_orm_row_without_a_status_is_the_least_privileged_one(grupo, estudiante):
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=estudiante)

    assert _status(grupo, estudiante) == "INVITED"
