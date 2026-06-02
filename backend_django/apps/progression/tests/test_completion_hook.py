import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.progression.models import StudentCaseCompletion
from apps.simulation.models import CaseVersion

User = get_user_model()


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_prog@x.com", password="x", nombre="Est", apellido="Prog", role="ESTUDIANTE"
    )


@pytest.fixture
def case_version_id(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id


def _cl(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_completing_case_records_completion(estudiante, case_version_id):
    c = _cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    token, attempt_id = start["attemptToken"], start["attemptId"]
    state = start
    for _ in range(25):
        if state["status"] != "IN_PROGRESS":
            break
        options = state["currentNode"]["options"]
        assert options
        state = c.post(
            f"/api/simulation/attempts/{attempt_id}/decisions",
            {"attemptToken": token, "decisionOptionId": options[0]["id"]},
            format="json",
        ).data["data"]
    assert state["status"] == "COMPLETED"
    case_id = CaseVersion.objects.get(pk=case_version_id).simulation_case_id
    assert StudentCaseCompletion.objects.filter(
        student_id=estudiante.id, simulation_case_id=case_id
    ).count() == 1


def test_safe_exit_does_not_record_completion(estudiante, case_version_id):
    c = _cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    c.post(
        f"/api/simulation/attempts/{start['attemptId']}/safe-exit",
        {"attemptToken": start["attemptToken"], "reason": "pausa"},
        format="json",
    )
    case_id = CaseVersion.objects.get(pk=case_version_id).simulation_case_id
    assert not StudentCaseCompletion.objects.filter(
        student_id=estudiante.id, simulation_case_id=case_id
    ).exists()
