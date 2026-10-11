import uuid

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import Grupo
from apps.progression.models import StudentCaseCompletion
from apps.simulation.models import CaseVersion, SimulationCase

User = get_user_model()


def _assign(estudiante, profesor, *case_version_ids):
    """Un grupo activo del profesor con el estudiante y esas versiones asignadas (RN-04)."""
    grupo = Grupo.objects.create(
        nombre="G-cat", codigo=f"CAT{uuid.uuid4().hex[:6].upper()}", profesor=profesor
    )
    with connection.cursor() as cur:
        cur.execute(
            "INSERT INTO grupo_estudiante (grupo_id, estudiante_id) VALUES (%s, %s)",
            [grupo.id, estudiante.id],
        )
        for case_version_id in case_version_ids:
            cur.execute(
                "INSERT INTO grupo_case_version (grupo_id, case_version_id) VALUES (%s, %s)",
                [grupo.id, case_version_id],
            )
    return grupo


def _cl(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="admin_cat@x.com", password="x", nombre="Ad", apellido="Cat", role="ADMIN"
    )


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_cat@x.com", password="x", nombre="Est", apellido="Cat", role="ESTUDIANTE"
    )


@pytest.fixture
def second_case(db, admin):
    """A second PUBLISHED case so progression/unlock is testable (only SIM-VBG-001 is seeded)."""
    case = SimulationCase.objects.create(
        code="SIM-CAT-TEST-002", title="Caso de prueba 2", description="stub",
        active=True, created_by=admin,
    )
    return CaseVersion.objects.create(
        simulation_case=case, semantic_version="1.0.0", status="PUBLISHED",
        created_by=admin, published_at=timezone.now(),
    )


@pytest.fixture
def first_case_version_id(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id


def test_student_sees_first_unlocked_rest_locked(estudiante, admin, second_case, first_case_version_id):
    _assign(estudiante, admin, first_case_version_id, second_case.id)
    data = _cl(estudiante).get("/api/simulation/catalog").data["data"]
    assert len(data) >= 2
    assert data[0]["unlocked"] is True and data[0]["order"] == 0
    last = data[-1]
    assert last["caseVersionId"] == second_case.id
    assert last["unlocked"] is False and last["locked"] is True
    for key in ("caseVersionId", "code", "title", "description", "order", "unlocked", "completed", "locked"):
        assert key in data[0]


def test_completing_first_unlocks_second(estudiante, admin, second_case, first_case_version_id):
    _assign(estudiante, admin, first_case_version_id, second_case.id)
    first = _cl(estudiante).get("/api/simulation/catalog").data["data"][0]
    first_case_id = CaseVersion.objects.get(pk=first["caseVersionId"]).simulation_case_id
    StudentCaseCompletion.objects.create(
        student_id=estudiante.id, simulation_case_id=first_case_id,
        first_completed_at=timezone.now(),
    )
    data = _cl(estudiante).get("/api/simulation/catalog").data["data"]
    assert data[0]["completed"] is True
    assert data[1]["unlocked"] is True


# --- RF-15 / RN-04: el estudiante ve solo los casos que tiene asignados ----------
def test_student_catalog_lists_only_assigned_cases(estudiante, admin, second_case, first_case_version_id):
    _assign(estudiante, admin, first_case_version_id)

    data = _cl(estudiante).get("/api/simulation/catalog").data["data"]

    assert [item["caseVersionId"] for item in data] == [first_case_version_id]
    assert second_case.id not in {item["caseVersionId"] for item in data}


def test_student_without_assignment_sees_an_empty_catalog(estudiante, second_case):
    assert _cl(estudiante).get("/api/simulation/catalog").data["data"] == []


def test_unlock_is_computed_only_among_assigned_cases(estudiante, admin, second_case):
    """Asignado solo al caso 2: es el primero de su secuencia, no queda bloqueado por el 1."""
    _assign(estudiante, admin, second_case.id)

    data = _cl(estudiante).get("/api/simulation/catalog").data["data"]

    assert [item["caseVersionId"] for item in data] == [second_case.id]
    assert data[0]["order"] == 0
    assert data[0]["unlocked"] is True and data[0]["locked"] is False


def test_student_in_an_inactive_group_sees_nothing(estudiante, admin, first_case_version_id):
    grupo = _assign(estudiante, admin, first_case_version_id)
    grupo.activo = False
    grupo.save(update_fields=["activo"])

    assert _cl(estudiante).get("/api/simulation/catalog").data["data"] == []


def test_staff_sees_everything_unlocked(admin, second_case):
    data = _cl(admin).get("/api/simulation/catalog").data["data"]
    assert all(item["unlocked"] for item in data)
    assert all(not item["locked"] for item in data)
