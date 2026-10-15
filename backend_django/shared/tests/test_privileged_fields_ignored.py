"""Un cuerpo de escritura no puede fijar ``role``, ``status``, ``userId`` ni ``ownerId`` (E2-1, LS-8).

Cada caso manda esos campos «de más» a un endpoint que **no** los admite y comprueba que el
efecto persistido es el del actor autenticado. Cuando una tarea posterior añade un endpoint de
escritura, su caso entra aquí.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.grupos.models import Grupo
from apps.simulation.models import CaseVersion, SimulationAttempt
from apps.simulation.tests.test_game import assign_case_to_student
from apps.users.models import AccessRequest

pytestmark = [pytest.mark.django_db, pytest.mark.req("LS-8"), pytest.mark.req("RNF-002")]

User = get_user_model()
PRIVILEGED = {"role": "ADMIN", "status": "COMPLETED", "userId": 1, "ownerId": 1, "estudiante": 1}


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(
        email=email, password="Pass-1234-x", nombre="Per", apellido="Son", role=role
    )


def test_access_request_cannot_set_status_or_role():
    response = APIClient().post(
        "/api/auth/access-request",
        {"nombre": "Ana", "apellido": "Gil", "email": "ana.gil@x.edu.co", **PRIVILEGED},
        format="json",
    )
    assert response.status_code == 201
    saved = AccessRequest.objects.get(email="ana.gil@x.edu.co")
    assert saved.status == "PENDING"
    assert not User.objects.filter(email="ana.gil@x.edu.co").exists()


def test_group_owner_is_always_the_acting_professor():
    mine, other = _user("own_p1@x.com", "PROFESOR"), _user("own_p2@x.com", "PROFESOR")
    body = {"nombre": "Grupo A", "codigo": "PRIV-A", "profesorId": other.id, "profesor": other.id,
            **{**PRIVILEGED, "ownerId": other.id, "userId": other.id}}
    created = _client(mine).post("/api/grupos", body, format="json")
    assert created.status_code == 201
    grupo = Grupo.objects.get(codigo="PRIV-A")
    assert grupo.profesor_id == mine.id

    updated = _client(mine).put(
        f"/api/grupos/{grupo.id}",
        {"nombre": "Grupo A2", "profesorId": other.id, "ownerId": other.id},
        format="json",
    )
    assert updated.status_code == 200
    grupo.refresh_from_db()
    assert (grupo.nombre, grupo.profesor_id) == ("Grupo A2", mine.id)


def test_user_status_endpoint_ignores_role():
    admin = _user("priv_admin@x.com", "ADMIN")
    target = _user("priv_target@x.com", "ESTUDIANTE")
    response = _client(admin).patch(
        f"/api/admin/users/{target.id}/status", {"activo": False, **PRIVILEGED}, format="json"
    )
    assert response.status_code == 200
    target.refresh_from_db()
    assert (target.role, target.activo) == ("ESTUDIANTE", False)


def test_started_attempt_belongs_to_the_student_who_started_it():
    estudiante = _user("priv_est@x.com", "ESTUDIANTE")
    other = _user("priv_other@x.com", "ESTUDIANTE")
    case_version_id = CaseVersion.objects.get(
        simulation_case__code="SIM-VBG-001", status="PUBLISHED"
    ).id
    assign_case_to_student(estudiante, case_version_id, "PRIV-ATT")
    response = _client(estudiante).post(
        "/api/simulation/attempts",
        {"caseVersionId": case_version_id, "studentId": other.id, **{**PRIVILEGED, "userId": other.id}},
        format="json",
    )
    assert response.status_code == 200
    attempt = SimulationAttempt.objects.get(pk=response.data["data"]["attemptId"])
    assert attempt.student_id == estudiante.id
    assert attempt.status == "IN_PROGRESS"
