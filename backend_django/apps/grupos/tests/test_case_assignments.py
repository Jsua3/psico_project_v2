"""E3-1 · Asignaciones con ventana (C7; RF-14, CU-06, decisiones 5 y 12).

Una tabla para el destino grupo **o** estudiante (``case_assignments``), con ventana
``[opens_at, closes_at)``, orden de la secuencia y pausa (``active``). La API crea hoy solo
destino ``GROUP``; ``/api/grupos/{id}/casos`` queda como alias con sus formas de siempre.
"""
import datetime
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient

from apps.grupos import assignments
from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante
from apps.simulation.models import CaseVersion, SimulationCase

pytestmark = [pytest.mark.req("RF-14"), pytest.mark.req("CU-06")]

User = get_user_model()
API = "/api/assignments"


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(email=email, password="Clave-Segura-2026!", nombre="N", apellido="A", role=role)


@pytest.fixture
def profesor(db):
    return _user("asg_prof@x.com", "PROFESOR")


@pytest.fixture
def otro_profesor(db):
    return _user("asg_prof2@x.com", "PROFESOR")


@pytest.fixture
def admin(db):
    return _user("asg_admin@x.com", "ADMIN")


@pytest.fixture
def estudiante(db):
    return _user("asg_est@x.com", "ESTUDIANTE")


@pytest.fixture
def grupo(profesor):
    return Grupo.objects.create(nombre="G asg", codigo="ASG1", profesor=profesor)


@pytest.fixture
def grupo_ajeno(otro_profesor):
    return Grupo.objects.create(nombre="G ajeno", codigo="ASG2", profesor=otro_profesor)


@pytest.fixture
def case_version_id(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id


def _published_version(owner, code, status="PUBLISHED", active=True):
    case = SimulationCase.objects.create(code=code, title=f"Caso {code}", created_by=owner, active=active)
    return CaseVersion.objects.create(
        simulation_case=case, semantic_version="1.0.0", status=status, created_by=owner
    )


def _create(client, grupo, case_version_id, **extra):
    body = {"caseVersionId": case_version_id, "target": {"type": "GROUP", "groupId": grupo.id}, **extra}
    return client.post(API, body, format="json")


# ─── el esquema ────────────────────────────────────────────────────────────────────────────
def test_the_table_needs_exactly_one_target(db, grupo, estudiante, case_version_id):
    with pytest.raises(IntegrityError, match="case_assignments_target_check"):
        with transaction.atomic():
            CaseAssignment.objects.create(case_version_id=case_version_id)
    with pytest.raises(IntegrityError, match="case_assignments_target_check"):
        with transaction.atomic():
            CaseAssignment.objects.create(
                case_version_id=case_version_id, grupo=grupo, estudiante=estudiante
            )


def test_the_window_must_close_after_it_opens(db, grupo, case_version_id):
    with pytest.raises(IntegrityError, match="case_assignments_window_check"):
        with transaction.atomic():
            CaseAssignment.objects.create(
                case_version_id=case_version_id, grupo=grupo,
                opens_at=datetime.datetime(2026, 10, 20), closes_at=datetime.datetime(2026, 10, 20),
            )


def test_one_assignment_per_group_and_version_and_per_student_and_version(
    db, grupo, estudiante, case_version_id
):
    CaseAssignment.objects.create(case_version_id=case_version_id, grupo=grupo)
    CaseAssignment.objects.create(case_version_id=case_version_id, estudiante=estudiante)

    with pytest.raises(IntegrityError, match="uq_case_assignments_group_version"):
        with transaction.atomic():
            CaseAssignment.objects.create(case_version_id=case_version_id, grupo=grupo)
    with pytest.raises(IntegrityError, match="uq_case_assignments_student_version"):
        with transaction.atomic():
            CaseAssignment.objects.create(case_version_id=case_version_id, estudiante=estudiante)


def test_the_data_migration_copies_every_group_assignment_with_the_same_order_and_date():
    """``0004``: cada ``grupo_case_version`` pasa a ``case_assignments`` con ``sort_order = 0``."""
    import importlib

    migration = importlib.import_module("apps.grupos.migrations.0004_copy_group_case_versions")
    old_rows = [
        SimpleNamespace(grupo_id=1, case_version_id=10, assigned_at=datetime.datetime(2026, 9, 1, 8)),
        SimpleNamespace(grupo_id=2, case_version_id=10, assigned_at=None),
    ]
    created = []

    class _Rows:
        def all(self):
            return self

        def iterator(self):
            return iter(old_rows)

    class _Assignments:
        def bulk_create(self, rows, ignore_conflicts=False):
            created.extend(rows)

    class _Model:
        def __init__(self, **fields):
            self.__dict__.update(fields)

    old_model = SimpleNamespace(objects=_Rows())
    new_model = type("CaseAssignment", (_Model,), {"objects": _Assignments()})
    fake_apps = SimpleNamespace(
        get_model=lambda app, name: old_model if name == "GrupoCaseVersion" else new_model
    )

    migration.copy_forward(fake_apps, None)

    assert [(r.grupo_id, r.case_version_id, r.sort_order, r.active) for r in created] == [
        (1, 10, 0, True), (2, 10, 0, True),
    ]
    assert created[0].assigned_at == datetime.datetime(2026, 9, 1, 8)


# ─── C7: crear ──────────────────────────────────────────────────────────────────────────────
def test_the_professor_assigns_a_published_case_to_their_group(profesor, grupo, case_version_id):
    response = _create(
        cl(profesor), grupo, case_version_id,
        opensAt="2026-10-14T08:00:00-05:00", closesAt="2026-10-20T20:00:00-05:00", sortOrder=2,
    )

    assert response.status_code == 201, response.data
    data = response.data["data"]
    assert data["caseVersionId"] == case_version_id
    assert data["target"] == {"type": "GROUP", "groupId": grupo.id}
    assert (data["opensAt"], data["closesAt"]) == ("2026-10-14T08:00:00-05:00", "2026-10-20T20:00:00-05:00")
    assert (data["active"], data["sortOrder"]) == (True, 2)
    assert data["state"] in {"SCHEDULED", "OPEN", "CLOSED"}
    row = CaseAssignment.objects.get(pk=data["id"])
    assert (row.grupo_id, row.assigned_by_id) == (grupo.id, profesor.id)


def test_dates_without_a_window_are_omitted_and_the_state_is_open(profesor, grupo, case_version_id):
    data = _create(cl(profesor), grupo, case_version_id).data["data"]

    assert "opensAt" not in data and "closesAt" not in data
    assert data["state"] == "OPEN"


def test_assigning_to_a_student_is_not_supported_yet(profesor, estudiante, case_version_id):
    response = cl(profesor).post(
        API, {"caseVersionId": case_version_id, "target": {"type": "STUDENT", "studentId": estudiante.id}},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "ASSIGNMENT_TARGET_UNSUPPORTED"
    assert response.data["field"] == "target"
    assert CaseAssignment.objects.filter(estudiante_id=estudiante.id).count() == 0


@pytest.mark.parametrize("status,active", [("DRAFT", True), ("IN_REVIEW", True), ("PUBLISHED", False)])
def test_only_published_and_active_cases_are_assigned(profesor, grupo, status, active):
    version = _published_version(profesor, f"ASG-{status}-{active}", status=status, active=active)

    response = _create(cl(profesor), grupo, version.id)

    assert response.status_code == 400
    assert "publicados y activos" in str(response.data)


def test_a_missing_case_version_is_a_404_and_a_missing_group_too(profesor, grupo):
    assert _create(cl(profesor), grupo, 999999999).status_code == 404
    body = {"caseVersionId": 1, "target": {"type": "GROUP", "groupId": 999999999}}
    assert cl(profesor).post(API, body, format="json").status_code == 404


def test_a_foreign_group_is_forbidden_with_its_code(profesor, grupo_ajeno, case_version_id):
    response = _create(cl(profesor), grupo_ajeno, case_version_id)

    assert response.status_code == 403
    assert response.data["code"] == "GROUP_NOT_OWNED"
    assert CaseAssignment.objects.filter(grupo_id=grupo_ajeno.id).count() == 0


def test_only_the_professor_assigns_not_the_admin_nor_the_student(admin, estudiante, grupo, case_version_id):
    assert _create(cl(admin), grupo, case_version_id).status_code == 403
    assert _create(cl(estudiante), grupo, case_version_id).status_code == 403
    assert cl(estudiante).get(API).status_code == 403


def test_the_same_case_twice_in_a_group_is_a_409_naming_the_existing_one(profesor, grupo, case_version_id):
    first = _create(cl(profesor), grupo, case_version_id).data["data"]

    again = _create(cl(profesor), grupo, case_version_id)

    assert again.status_code == 409
    assert again.data["code"] == "ASSIGNMENT_ALREADY_EXISTS"
    assert again.data["existingAssignmentId"] == first["id"]


@pytest.mark.parametrize(
    "extra,field",
    [
        ({"opensAt": "mañana"}, "opensAt"),
        ({"closesAt": "2026-13-45"}, "closesAt"),
        ({"opensAt": "2026-10-20T08:00:00", "closesAt": "2026-10-20T08:00:00"}, "closesAt"),
        ({"opensAt": "2026-10-20T08:00:00", "closesAt": "2026-10-19T08:00:00"}, "closesAt"),
        ({"sortOrder": -1}, "sortOrder"),
        ({"sortOrder": 100000}, "sortOrder"),
    ],
)
def test_an_invalid_window_or_order_is_a_400_naming_the_field(profesor, grupo, case_version_id, extra, field):
    response = _create(cl(profesor), grupo, case_version_id, **extra)

    assert response.status_code == 400, response.data
    assert response.data["field"] == field


# ─── C7: leer, cambiar y retirar ───────────────────────────────────────────────────────────────
def test_each_professor_lists_only_their_groups_and_admin_lists_all(
    profesor, otro_profesor, admin, grupo, grupo_ajeno, case_version_id
):
    mine = _create(cl(profesor), grupo, case_version_id).data["data"]
    theirs = _create(cl(otro_profesor), grupo_ajeno, case_version_id).data["data"]

    listed_by_a = {a["id"] for a in cl(profesor).get(API).data["data"]}
    listed_by_admin = {a["id"] for a in cl(admin).get(API).data["data"]}
    by_group = [a["id"] for a in cl(profesor).get(f"{API}?groupId={grupo.id}").data["data"]]
    by_version = [a["id"] for a in cl(profesor).get(f"{API}?caseVersionId={case_version_id}").data["data"]]

    assert listed_by_a == {mine["id"]}
    assert {mine["id"], theirs["id"]} <= listed_by_admin
    assert by_group == [mine["id"]] and by_version == [mine["id"]]
    assert cl(profesor).get(f"{API}?groupId={grupo_ajeno.id}").status_code == 404
    assert cl(profesor).get(f"{API}?groupId=abc").status_code == 400


def test_patch_changes_only_what_it_carries_and_null_clears_a_date(profesor, grupo, case_version_id):
    created = _create(
        cl(profesor), grupo, case_version_id,
        opensAt="2026-10-14T08:00:00", closesAt="2026-10-20T08:00:00", sortOrder=5,
    ).data["data"]
    url = f"{API}/{created['id']}"

    paused = cl(profesor).patch(url, {"active": False}, format="json")
    cleared = cl(profesor).patch(url, {"closesAt": None, "sortOrder": 1}, format="json")

    assert paused.status_code == 200
    assert paused.data["data"]["active"] is False
    assert paused.data["data"]["opensAt"] == "2026-10-14T08:00:00-05:00"  # no se tocó
    assert paused.data["data"]["sortOrder"] == 5
    assert "closesAt" not in cleared.data["data"]
    assert (cleared.data["data"]["sortOrder"], cleared.data["data"]["active"]) == (1, False)


def test_patch_validates_the_resulting_window_and_an_empty_body(profesor, grupo, case_version_id):
    created = _create(cl(profesor), grupo, case_version_id, opensAt="2026-10-14T08:00:00").data["data"]
    url = f"{API}/{created['id']}"

    inverted = cl(profesor).patch(url, {"closesAt": "2026-10-13T08:00:00"}, format="json")
    empty = cl(profesor).patch(url, {}, format="json")

    assert inverted.status_code == 400 and inverted.data["field"] == "closesAt"
    assert empty.status_code == 400
    assert CaseAssignment.objects.get(pk=created["id"]).closes_at is None


def test_a_foreign_assignment_is_not_found_to_patch_or_delete(profesor, otro_profesor, grupo_ajeno, case_version_id):
    theirs = _create(cl(otro_profesor), grupo_ajeno, case_version_id).data["data"]

    assert cl(profesor).patch(f"{API}/{theirs['id']}", {"active": False}, format="json").status_code == 404
    assert cl(profesor).delete(f"{API}/{theirs['id']}").status_code == 404
    assert CaseAssignment.objects.get(pk=theirs["id"]).active is True


def test_delete_retires_the_assignment(profesor, grupo, case_version_id):
    created = _create(cl(profesor), grupo, case_version_id).data["data"]

    response = cl(profesor).delete(f"{API}/{created['id']}")

    assert response.status_code == 200
    assert not CaseAssignment.objects.filter(pk=created["id"]).exists()


# ─── el alias heredado /api/grupos/{id}/casos ───────────────────────────────────────────────────
def test_the_legacy_routes_keep_their_shapes_and_share_the_table(profesor, grupo, case_version_id):
    legacy = cl(profesor).post(f"/api/grupos/{grupo.id}/casos", {"caseVersionId": case_version_id}, format="json")

    assert legacy.status_code == 200
    assert [c["caseVersionId"] for c in legacy.data["data"]] == [case_version_id]
    assert set(legacy.data["data"][0]) >= {"caseVersionId", "code", "title", "nodeCount", "status"}
    listed = cl(profesor).get(f"{API}?groupId={grupo.id}").data["data"]
    assert [a["caseVersionId"] for a in listed] == [case_version_id]
    removed = cl(profesor).delete(f"/api/grupos/{grupo.id}/casos/{case_version_id}")
    assert removed.status_code == 200 and removed.data["data"] == []
    assert CaseAssignment.objects.filter(grupo_id=grupo.id).count() == 0


def test_the_legacy_list_hides_a_paused_assignment_and_assigning_again_reactivates_it(
    profesor, grupo, case_version_id
):
    created = _create(cl(profesor), grupo, case_version_id).data["data"]
    cl(profesor).patch(f"{API}/{created['id']}", {"active": False}, format="json")

    hidden = cl(profesor).get(f"/api/grupos/{grupo.id}/casos").data["data"]
    again = cl(profesor).post(f"/api/grupos/{grupo.id}/casos", {"caseVersionId": case_version_id}, format="json")

    assert hidden == []
    assert [c["caseVersionId"] for c in again.data["data"]] == [case_version_id]
    assert CaseAssignment.objects.get(pk=created["id"]).active is True


# ─── lo que lee el acceso ───────────────────────────────────────────────────────────────────────
def test_a_paused_assignment_no_longer_reaches_the_student(profesor, estudiante, grupo, case_version_id):
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=estudiante, status="ACTIVE")
    created = _create(cl(profesor), grupo, case_version_id).data["data"]
    assert assignments.student_has_assignment(estudiante.id, case_version_id) is True

    cl(profesor).patch(f"{API}/{created['id']}", {"active": False}, format="json")

    assert assignments.student_has_assignment(estudiante.id, case_version_id) is False
    assert assignments.assigned_case_version_ids(estudiante.id) == []


def test_a_direct_student_assignment_reaches_the_student_without_a_group(estudiante, case_version_id):
    """El destino estudiante ya funciona en el esquema y en la lectura (decisión 5, sin migración)."""
    CaseAssignment.objects.create(case_version_id=case_version_id, estudiante=estudiante)

    assert assignments.student_has_assignment(estudiante.id, case_version_id) is True
    assert assignments.assigned_case_version_ids(estudiante.id) == [case_version_id]


def test_privileged_fields_in_the_body_are_ignored_on_create(profesor, otro_profesor, grupo, case_version_id):
    response = cl(profesor).post(
        API,
        {
            "caseVersionId": case_version_id,
            "target": {"type": "GROUP", "groupId": grupo.id},
            "assignedBy": otro_profesor.id, "active": False, "grupo": 999, "estudiante": 1, "id": 12345,
        },
        format="json",
    )

    assert response.status_code == 201, response.data
    row = CaseAssignment.objects.get(pk=response.data["data"]["id"])
    assert (row.assigned_by_id, row.active, row.grupo_id, row.estudiante_id) == (profesor.id, True, grupo.id, None)
    assert row.id != 12345


def test_assignment_responses_include_case_title(profesor, grupo):
    version = _published_version(profesor, "TITLE-CASE")
    client = cl(profesor)
    created = _create(client, grupo, version.id)
    assert created.status_code == 201
    assert created.json()["data"]["caseTitle"] == version.simulation_case.title
    listed = client.get(API, {"groupId": grupo.id})
    assert listed.status_code == 200
    assert any(item["caseTitle"] == version.simulation_case.title for item in listed.json()["data"])
