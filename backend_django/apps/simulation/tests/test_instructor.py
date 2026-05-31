"""T15a — Instructor simulation panel (/api/instructor).
Contract-faithful to Spring InstructorSimulationController + InstructorSimulationService.
All endpoints PROFESOR/ADMIN; reflections in the trace are decrypted for review."""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion

User = get_user_model()


def cl(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_inst@x.com", password="x", nombre="Est", apellido="Inst", role="ESTUDIANTE"
    )


@pytest.fixture
def profesor(db):
    return User.objects.create_user(
        email="prof_inst@x.com", password="x", nombre="Pro", apellido="Inst", role="PROFESOR"
    )


@pytest.fixture
def case_version_id(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id


def _play_one_decision(client, case_version_id):
    start = client.post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]
    token, attempt_id = start["attemptToken"], start["attemptId"]
    node_id = start["currentNode"]["id"]
    # leave a reflection (so trace can decrypt it)
    client.post(
        f"/api/simulation/attempts/{attempt_id}/reflections",
        {"attemptToken": token, "nodeId": node_id, "text": "Mi nota clínica"},
        format="json",
    )
    option_id = start["currentNode"]["options"][0]["id"]
    client.post(
        f"/api/simulation/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": option_id},
        format="json",
    )
    return attempt_id


# --- permissions -----------------------------------------------------------
def test_recent_forbidden_for_estudiante(estudiante):
    assert cl(estudiante).get("/api/instructor/attempts/recent").status_code == 403


def test_recent_attempts_lists(estudiante, profesor, case_version_id):
    attempt_id = _play_one_decision(cl(estudiante), case_version_id)
    resp = cl(profesor).get("/api/instructor/attempts/recent")
    assert resp.status_code == 200
    ids = [a["attemptId"] for a in resp.data["data"]]
    assert attempt_id in ids
    mine = next(a for a in resp.data["data"] if a["attemptId"] == attempt_id)
    assert mine["studentAlias"].startswith("Estudiante-")
    assert "email" not in str(mine)  # anonymized


# --- trace -----------------------------------------------------------------
def test_trace_has_events_world_and_decrypted_reflection(estudiante, profesor, case_version_id):
    attempt_id = _play_one_decision(cl(estudiante), case_version_id)
    resp = cl(profesor).get(f"/api/instructor/attempts/{attempt_id}/trace")
    assert resp.status_code == 200
    trace = resp.data["data"]
    assert trace["attemptId"] == attempt_id
    assert trace["studentAlias"].startswith("Estudiante-")
    assert len(trace["events"]) >= 1
    assert trace["world"] is not None and trace["world"]["map"] is not None
    assert any(r["text"] == "Mi nota clínica" for r in trace["reflections"])  # decrypted
    assert isinstance(trace["rubricEvaluations"], list)


def test_trace_missing_attempt_404(profesor):
    import uuid
    resp = cl(profesor).get(f"/api/instructor/attempts/{uuid.uuid4()}/trace")
    assert resp.status_code == 404


# --- rubric evaluation -----------------------------------------------------
def test_rubric_get_returns_criteria(estudiante, profesor, case_version_id):
    attempt_id = _play_one_decision(cl(estudiante), case_version_id)
    resp = cl(profesor).get(f"/api/instructor/attempts/{attempt_id}/rubric-evaluation")
    assert resp.status_code == 200
    view = resp.data["data"]
    assert view["rubricId"] is not None
    assert len(view["criteria"]) >= 1
    assert view["scores"] == []
    assert view["totalScore"] is None


def test_save_rubric_evaluation(estudiante, profesor, case_version_id):
    attempt_id = _play_one_decision(cl(estudiante), case_version_id)
    p = cl(profesor)
    view = p.get(f"/api/instructor/attempts/{attempt_id}/rubric-evaluation").data["data"]
    rubric_id = view["rubricId"]
    criteria = view["criteria"]
    scores = [{"criterionId": c["id"], "score": 3, "comment": "ok"} for c in criteria]

    resp = p.post(
        f"/api/instructor/attempts/{attempt_id}/rubric-evaluation",
        {"rubricId": rubric_id, "comment": "Buen desempeño", "scores": scores},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["message"] == "Rubrica guardada"
    saved = resp.data["data"]
    assert saved["totalScore"] == 3 * len(criteria)
    assert saved["comment"] == "Buen desempeño"
    assert len(saved["scores"]) == len(criteria)

    # appears in the trace's rubric evaluations
    trace = p.get(f"/api/instructor/attempts/{attempt_id}/trace").data["data"]
    assert len(trace["rubricEvaluations"]) >= 1
    assert trace["rubricEvaluations"][0]["totalScore"] == 3 * len(criteria)
