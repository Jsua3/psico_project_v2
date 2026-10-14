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


# ─── E2-12 · el aviso por correo de una invitación ──────────────────────────────────────
@pytest.fixture
def locmem(settings):
    from django.core import mail

    settings.MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}
    mail.outbox.clear()
    return mail


@pytest.mark.req("DJA-3")
def test_an_invitation_emails_the_student_and_nobody_else(profesor, grupo, estudiante, locmem):
    teacher = _user("inv_otro_docente@x.com", "PROFESOR")

    _invite(cl(profesor), grupo, estudiante.email)
    _invite(cl(profesor), grupo, "nadie.registrado@x.com")
    _invite(cl(profesor), grupo, teacher.email)

    assert len(locmem.outbox) == 1
    message = locmem.outbox[0]
    assert message.to == [estudiante.email]
    assert "G inv" in message.body and "Nom Ape" in message.body
    # Una orden repetida no reenvía el aviso.
    _invite(cl(profesor), grupo, estudiante.email)
    assert len(locmem.outbox) == 1


@pytest.mark.req("DJA-3")
def test_the_answer_is_the_same_whether_or_not_an_email_went_out(profesor, grupo, estudiante, locmem):
    with_mail = _invite(cl(profesor), grupo, estudiante.email)
    without_mail = _invite(cl(profesor), grupo, "tampoco.existe@x.com")

    assert with_mail.status_code == without_mail.status_code == 200
    assert with_mail.data == without_mail.data


@pytest.mark.req("DJA-3")
def test_a_failing_mail_server_does_not_break_the_invitation(profesor, grupo, estudiante, monkeypatch):
    def boom(*args, **kwargs):
        raise ConnectionError("SMTP caído")

    monkeypatch.setattr("apps.grupos.notifications.send_mail", boom)

    response = _invite(cl(profesor), grupo, estudiante.email)

    assert response.status_code == 200
    assert _status(grupo, estudiante) == "INVITED"


# ─── Revisión de fase E2 · lo que el docente ve de una cuenta que no es suya (D-14) ──────────────────
def _import_file(client, grupo, rows):
    from apps.grupos.tests.test_grupos import _xlsx_upload

    return client.post(
        f"/api/grupos/{grupo.id}/estudiantes/import/",
        {"file": _xlsx_upload([["nombre", "apellido", "email"], *rows])},
        format="multipart",
    )


def _named_user(email, nombre, apellido):
    return User.objects.create_user(
        email=email, password="Clave-Segura-2026!", nombre=nombre, apellido=apellido, role="ESTUDIANTE"
    )


def test_the_import_result_echoes_what_the_teacher_typed_not_the_account(profesor, grupo):
    account = _named_user("inv_priv@x.com", "Maria Real", "Perez Real")

    response = _import_file(cl(profesor), grupo, [["Tecleado", "ComoQuiso", account.email]])

    assert response.status_code == 200, response.data
    assert response.data["data"]["students"] == [{
        "row": 2, "nombre": "Tecleado", "apellido": "ComoQuiso", "email": account.email,
        "role": "ESTUDIANTE", "membershipStatus": "INVITED",
    }]
    assert "Real" not in str(response.data)


def test_the_roster_hides_the_name_of_whoever_has_not_accepted(profesor, grupo):
    account = _named_user("inv_priv2@x.com", "Maria Real", "Perez Real")
    _invite(cl(profesor), grupo, account.email)

    pending = cl(profesor).get(f"/api/grupos/{grupo.id}/estudiantes").data["data"]

    assert pending == [{
        "id": account.id, "nombre": "", "apellido": "", "email": account.email,
        "role": "ESTUDIANTE", "membershipStatus": "INVITED",
    }]
    assert "Real" not in str(pending)
    cl(account).post(f"/api/me/invitations/{grupo.id}/accept", {}, format="json")
    accepted = cl(profesor).get(f"/api/grupos/{grupo.id}/estudiantes").data["data"]
    assert (accepted[0]["nombre"], accepted[0]["apellido"], accepted[0]["activo"]) == (
        "Maria Real", "Perez Real", True,
    )


def test_the_group_counts_the_pending_invitations_apart(profesor, grupo):
    first, second = _named_user("inv_cnt1@x.com", "A", "A"), _named_user("inv_cnt2@x.com", "B", "B")
    _invite(cl(profesor), grupo, first.email)
    _invite(cl(profesor), grupo, second.email)

    before = next(g for g in cl(profesor).get("/api/grupos").data["data"] if g["id"] == grupo.id)
    cl(first).post(f"/api/me/invitations/{grupo.id}/accept", {}, format="json")
    after = next(g for g in cl(profesor).get("/api/grupos").data["data"] if g["id"] == grupo.id)

    assert (before["totalEstudiantes"], before["totalInvitados"]) == (0, 2)
    assert (after["totalEstudiantes"], after["totalInvitados"]) == (1, 1)


def test_listing_the_groups_counts_memberships_in_one_query(profesor, django_assert_max_num_queries):
    for index in range(8):
        Grupo.objects.create(nombre=f"G{index}", codigo=f"CNT{index}", profesor=profesor)

    with django_assert_max_num_queries(6):
        response = cl(profesor).get("/api/grupos")

    assert response.status_code == 200
    assert len(response.data["data"]) == 8


# ─── Revisión de fase E2 · carreras de las membresías, salir del grupo, correo y puente ──────────────
def _audit_context(action):
    import json

    from apps.simulation.models import AuditLog

    row = AuditLog.objects.filter(action=action).order_by("-id").first()
    assert row is not None, f"no hay fila de auditoría {action}"
    return json.loads(row.context_json)


@pytest.mark.parametrize("answer", ["accept", "decline"])
def test_a_stale_answer_cannot_resurrect_a_removed_membership(profesor, grupo, estudiante, monkeypatch, answer):
    """El docente retiró la invitación entre la lectura y la escritura del estudiante: su respuesta
    (basada en una fila vieja) no puede pisar el estado nuevo."""
    from apps.grupos import memberships

    _invite(cl(profesor), grupo, estudiante.email)
    stale = memberships._own(grupo.id, estudiante.id)
    assert stale.status == "INVITED"
    cl(profesor).delete(f"/api/grupos/{grupo.id}/estudiantes/{estudiante.id}")
    assert _status(grupo, estudiante) == "REMOVED"
    monkeypatch.setattr(memberships, "_own", lambda group_id, student_id: stale)

    response = cl(estudiante).post(f"/api/me/invitations/{grupo.id}/{answer}", {}, format="json")

    assert response.status_code == 409
    assert response.data["code"] == "MEMBERSHIP_NOT_INVITED"
    assert _status(grupo, estudiante) == "REMOVED"


def test_an_invitation_that_loses_the_race_to_create_the_row_is_not_an_error(
    profesor, grupo, estudiante, monkeypatch
):
    """Otra petición inserta la fila entre «miré y no estaba» y «la creé»: el INSERT choca con la
    llave primaria. La invitación perdedora devuelve la fila que ganó, no un 500."""
    from django.db import connection
    from django.db.models.query import QuerySet

    from apps.grupos import memberships

    original_get, original_first = QuerySet.get, QuerySet.first
    raced = []

    def other_request_inserts_first():
        raced.append(True)
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO grupo_estudiante (grupo_id, estudiante_id, status) VALUES (%s, %s, 'INVITED')",
                [grupo.id, estudiante.id],
            )

    def racing_get(self, *args, **kwargs):
        if self.model is GrupoEstudiante and not raced:
            other_request_inserts_first()
            raise GrupoEstudiante.DoesNotExist()  # la lectura se hizo antes del INSERT ajeno
        return original_get(self, *args, **kwargs)

    def racing_first(self, *args, **kwargs):
        if self.model is GrupoEstudiante and not raced:
            other_request_inserts_first()
            return None
        return original_first(self, *args, **kwargs)

    monkeypatch.setattr(QuerySet, "get", racing_get)
    monkeypatch.setattr(QuerySet, "first", racing_first)

    row, changed = memberships.invite(grupo, estudiante, profesor)

    assert raced == [True]
    assert (row.status, changed) == ("INVITED", False)
    assert GrupoEstudiante.objects.filter(grupo_id=grupo.id, estudiante_id=estudiante.id).count() == 1


def test_a_student_can_leave_a_group_and_the_teacher_can_reinvite(profesor, grupo, estudiante):
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=estudiante, status="ACTIVE")

    left = cl(estudiante).post(f"/api/me/invitations/{grupo.id}/leave", {}, format="json")

    assert left.status_code == 200
    assert left.data["data"]["status"] == "REMOVED"
    assert _status(grupo, estudiante) == "REMOVED"
    assert cl(estudiante).get("/api/me/invitations").data["data"] == []  # lo retirado no se lista
    _invite(cl(profesor), grupo, estudiante.email)
    assert _status(grupo, estudiante) == "INVITED"
    assert _audit_context("MEMBERSHIP_LEFT")["studentId"] == estudiante.id


def test_leaving_is_only_for_an_active_member(profesor, grupo, estudiante):
    _invite(cl(profesor), grupo, estudiante.email)  # INVITED, no ACTIVE

    pending = cl(estudiante).post(f"/api/me/invitations/{grupo.id}/leave", {}, format="json")
    stranger = cl(_user("inv_stranger@x.com")).post(f"/api/me/invitations/{grupo.id}/leave", {}, format="json")

    assert pending.status_code == 409 and pending.data["code"] == "MEMBERSHIP_NOT_ACTIVE"
    assert stranger.status_code == 404
    assert _status(grupo, estudiante) == "INVITED"


def test_a_teacher_cannot_leave_on_behalf_of_a_student(profesor, grupo, estudiante):
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=estudiante, status="ACTIVE")

    response = cl(profesor).post(f"/api/me/invitations/{grupo.id}/leave", {}, format="json")

    assert response.status_code == 403
    assert _status(grupo, estudiante) == "ACTIVE"


def test_the_invitation_email_goes_out_after_the_transaction_block(
    profesor, grupo, estudiante, monkeypatch
):
    """Con el correo dentro del ``atomic`` un servidor lento retiene los cerrojos de la base."""
    from django.db import connection

    from apps.grupos import notifications

    depth = []
    monkeypatch.setattr(
        notifications, "send_mail", lambda *args, **kwargs: depth.append(len(connection.savepoint_ids))
    )
    baseline = len(connection.savepoint_ids)

    _invite(cl(profesor), grupo, estudiante.email)

    assert depth == [baseline]


def test_the_import_emails_go_out_after_the_transaction_block(profesor, grupo, estudiante, monkeypatch):
    from django.db import connection

    from apps.grupos import notifications

    depth = []
    monkeypatch.setattr(
        notifications, "send_mail", lambda *args, **kwargs: depth.append(len(connection.savepoint_ids))
    )
    baseline = len(connection.savepoint_ids)

    response = _import_file(cl(profesor), grupo, [["Nom", "Ape", estudiante.email]])

    assert response.status_code == 200
    assert depth == [baseline]


def test_a_mail_server_that_is_down_is_tried_once_per_import(profesor, grupo, monkeypatch):
    """El primer fallo corta los demás envíos: no se espera un tiempo de espera por cada alumno."""
    from apps.grupos import notifications

    calls = []

    def boom(*args, **kwargs):
        calls.append(args[3])
        raise ConnectionError("SMTP caído")

    monkeypatch.setattr(notifications, "send_mail", boom)
    students = [_user(f"inv_down_{i}@x.com") for i in range(5)]
    rows = [[s.nombre, s.apellido, s.email] for s in students]

    response = _import_file(cl(profesor), grupo, rows)

    assert response.status_code == 200
    assert response.data["data"]["assigned"] == 5
    assert len(calls) == 1


@pytest.mark.req("DJA-3")
def test_an_import_emails_only_up_to_the_limit_and_still_invites_everyone(profesor, grupo, locmem, settings):
    settings.INVITATION_EMAIL_LIMIT = 3
    students = [_user(f"inv_bulk_{i}@x.com") for i in range(6)]
    rows = [[s.nombre, s.apellido, s.email] for s in students]

    response = _import_file(cl(profesor), grupo, rows)

    assert response.status_code == 200, response.data
    assert response.data["data"]["assigned"] == 6
    assert len(locmem.outbox) == 3
    assert GrupoEstudiante.objects.filter(grupo_id=grupo.id, status="INVITED").count() == 6


def test_the_email_limit_has_a_sane_default(settings):
    assert 1 <= settings.INVITATION_EMAIL_LIMIT <= 100


# ─── puente transitorio: invitar une al grupo sin aceptación (apagado por defecto) ───────────────────
def test_the_invitations_bridge_is_off_by_default(settings):
    assert settings.INVITATIONS_AUTO_ACCEPT is False


def test_with_the_bridge_on_an_invitation_joins_the_group_at_once(profesor, grupo, estudiante, settings, locmem):
    settings.INVITATIONS_AUTO_ACCEPT = True

    response = _invite(cl(profesor), grupo, estudiante.email)

    assert response.status_code == 200
    assert _status(grupo, estudiante) == "ACTIVE"
    assert response.data["data"]["totalEstudiantes"] == 1
    assert locmem.outbox == []  # ya es miembro: no hay nada que aceptar ni que avisar
    other = _user("inv_bridge_other@x.com")
    _import_file(cl(profesor), grupo, [[other.nombre, other.apellido, other.email]])
    assert _status(grupo, other) == "ACTIVE"


def test_with_the_bridge_on_a_pending_invitation_is_promoted(profesor, grupo, estudiante, settings):
    _invite(cl(profesor), grupo, estudiante.email)
    assert _status(grupo, estudiante) == "INVITED"
    settings.INVITATIONS_AUTO_ACCEPT = True

    _invite(cl(profesor), grupo, estudiante.email)

    assert _status(grupo, estudiante) == "ACTIVE"


# ─── la auditoría nombra a la persona de la membresía ────────────────────────────────────────────────
def test_membership_audit_rows_name_the_student(profesor, grupo, estudiante):
    other = _user("inv_audit2@x.com")

    _invite(cl(profesor), grupo, estudiante.email)
    assert _audit_context("MEMBERSHIP_INVITED")["studentId"] == estudiante.id
    cl(estudiante).post(f"/api/me/invitations/{grupo.id}/accept", {}, format="json")
    assert _audit_context("MEMBERSHIP_ACCEPTED")["studentId"] == estudiante.id
    _invite(cl(profesor), grupo, other.email)
    cl(other).post(f"/api/me/invitations/{grupo.id}/decline", {}, format="json")
    assert _audit_context("MEMBERSHIP_DECLINED")["studentId"] == other.id
    cl(profesor).delete(f"/api/grupos/{grupo.id}/estudiantes/{estudiante.id}")
    assert _audit_context("MEMBERSHIP_REMOVED")["studentId"] == estudiante.id


def test_the_import_audit_row_counts_and_names_what_it_did(profesor, grupo, estudiante):
    response = _import_file(
        cl(profesor), grupo, [["Nuevo", "Cuenta", "inv_audit_new@x.com"], [estudiante.nombre, "X", estudiante.email]]
    )

    context = _audit_context("STUDENTS_IMPORTED")
    new_id = User.objects.get(email="inv_audit_new@x.com").id
    assert response.status_code == 200
    assert sorted(context["studentIds"]) == sorted([new_id, estudiante.id])
    assert (context["created"], context["invited"]) == (1, 2)
    assert "inv_audit_new@x.com" not in str(context)  # ids, no correos
