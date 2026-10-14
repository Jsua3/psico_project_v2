"""E2-5 · Ciclo de vida y revisión del caso (C4: ``GET|POST …/cases/{id}/lifecycle``).

Flujo: el autor envía a revisión (``submit``), el ADMIN aprueba con constancia de revisión de
contenido de Psicología (``approve``) o devuelve con motivo FORMA/CONTENIDO (``reject``), y
autor o ADMIN archivan. Con ``REVIEW_WORKFLOW_STRICT`` apagada, ``/publish`` del ADMIN sigue
publicando un borrador (compatibilidad con el editor actual).
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.grupos.models import Grupo
from apps.simulation.models import AuditLog, CaseReview, CaseVersion, SimulationAttempt, SimulationCase
from apps.simulation.services.authoring import publication

from .test_game import assign_case_to_student, attempt_headers

pytestmark = [pytest.mark.req("RF-13"), pytest.mark.req("CU-05"), pytest.mark.req("RQ-NEG-008")]

User = get_user_model()
AUTHORING = "/api/authoring/cases"
CHECKLIST = {
    "contentOriginal": True, "ethicsReviewed": True, "safetyProtocols": True,
    "noStigmatizing": True, "triggerWarnings": True, "accessibilityOk": True,
    "scopeEducational": True,
}
CONTENT_REVIEW = {"reviewer": "Mg. Elena Rojas (Psicología)", "reviewedOn": "2026-10-10", "reference": "Acta 12-2026"}


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(email=email, password="pass1234", nombre="Nom", apellido="Ape", role=role)


@pytest.fixture
def admin(db):
    return _user("lc_admin@x.com", "ADMIN")


@pytest.fixture
def prof_a(db):
    return _user("lc_prof_a@x.com", "PROFESOR")


@pytest.fixture
def prof_b(db):
    return _user("lc_prof_b@x.com", "PROFESOR")


@pytest.fixture
def estudiante(db):
    return _user("lc_est@x.com", "ESTUDIANTE")


_counter = {"n": 0}


def _draft_owned_by(owner, filled=True):
    """Un borrador **válido** (copia del caso sembrado) cuyo caso es de ``owner``."""
    _counter["n"] += 1
    seeded = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    cv = publication.clone_version(seeded.id, owner)["caseVersionId"]
    case = SimulationCase.objects.create(
        code=f"LC-{_counter['n']}", title=f"Caso del ciclo {_counter['n']}", created_by=owner
    )
    CaseVersion.objects.filter(pk=cv).update(simulation_case=case, semantic_version="0.1.0")
    if filled:
        assert cl(owner).put(f"{AUTHORING}/{cv}/checklist", CHECKLIST, format="json").status_code == 200
    return cv


def _post(client, cv, **body):
    return client.post(f"{AUTHORING}/{cv}/lifecycle", body, format="json")


def _state(client, cv):
    return client.get(f"{AUTHORING}/{cv}/lifecycle").data["data"]


# ─── enviar a revisión ──────────────────────────────────────────────────────────────────
def test_submit_is_blocked_while_the_checklist_is_incomplete(prof_a):
    cv = _draft_owned_by(prof_a, filled=False)

    blocked = _state(cl(prof_a), cv)
    response = _post(cl(prof_a), cv, action="submit")

    assert blocked["state"] == "DRAFT"
    assert blocked["allowedTransitions"] == ["submit", "archive"]
    assert blocked["blockedReason"]["code"] == "CHECKLIST_INCOMPLETE"
    assert response.status_code == 409
    assert response.data["code"] == "CASE_NOT_PUBLISHABLE"
    assert CaseVersion.objects.get(pk=cv).status == "DRAFT"


def test_submit_freezes_the_draft_and_opens_a_review(prof_a):
    cv = _draft_owned_by(prof_a)

    response = _post(cl(prof_a), cv, action="submit")

    assert response.status_code == 200
    body = response.data["data"]
    assert body["state"] == "IN_REVIEW"
    assert body["allowedTransitions"] == []
    assert body["review"]["requestedBy"] == "Nom Ape"
    assert "decision" not in body["review"]
    review = CaseReview.objects.get(case_version_id=cv)
    assert (review.requested_by_id, review.decision) == (prof_a.id, None)
    assert AuditLog.objects.filter(action="CASE_SUBMITTED", resource_id=str(cv)).count() == 1
    edit = cl(prof_a).post(
        f"{AUTHORING}/{cv}/nodes", {"nodeKey": "x", "title": "t", "narrative": "n"}, format="json"
    )
    assert edit.status_code == 400  # un caso en revisión no se edita


def test_a_foreign_professor_cannot_see_or_submit(prof_b, prof_a):
    cv = _draft_owned_by(prof_a)

    assert cl(prof_b).get(f"{AUTHORING}/{cv}/lifecycle").status_code == 404
    assert _post(cl(prof_b), cv, action="submit").status_code == 403


# ─── aprobar con constancia ─────────────────────────────────────────────────────────────
def test_only_admin_approves_and_strict_mode_asks_for_the_certificate(prof_a, admin, settings):
    settings.REVIEW_WORKFLOW_STRICT = True
    cv = _draft_owned_by(prof_a)
    _post(cl(prof_a), cv, action="submit")

    assert _post(cl(prof_a), cv, action="approve").status_code == 403
    missing = _post(cl(admin), cv, action="approve")
    assert missing.status_code == 400
    assert missing.data["code"] == "CONTENT_REVIEW_REQUIRED"
    partial = _post(cl(admin), cv, action="approve", contentReview={"reviewer": "Mg. Elena Rojas"})
    assert partial.status_code == 400
    assert CaseVersion.objects.get(pk=cv).status == "IN_REVIEW"

    approved = _post(cl(admin), cv, action="approve", note="Contenido validado", contentReview=CONTENT_REVIEW)

    assert approved.status_code == 200
    assert approved.data["data"]["state"] == "PUBLISHED"
    version = CaseVersion.objects.get(pk=cv)
    assert version.status == "PUBLISHED" and version.published_at is not None
    review = CaseReview.objects.get(case_version_id=cv)
    assert review.decision == "APPROVED" and review.decided_by_id == admin.id
    assert review.content_reviewer == CONTENT_REVIEW["reviewer"]
    assert str(review.content_reviewed_on) == "2026-10-10"
    assert review.content_reference == "Acta 12-2026"
    assert review.note == "Contenido validado"
    assert AuditLog.objects.filter(action="CASE_APPROVED", resource_id=str(cv)).count() == 1


def test_strict_mode_does_not_publish_a_draft_directly(prof_a, admin, settings):
    settings.REVIEW_WORKFLOW_STRICT = True
    cv = _draft_owned_by(prof_a)

    via_lifecycle = _post(cl(admin), cv, action="approve", contentReview=CONTENT_REVIEW)
    via_publish = cl(admin).post(f"{AUTHORING}/{cv}/publish", {"contentReview": CONTENT_REVIEW}, format="json")

    assert via_lifecycle.status_code == 409
    assert via_lifecycle.data["code"] == "INVALID_TRANSITION"
    assert via_publish.status_code == 409
    assert via_publish.data["code"] == "REVIEW_REQUIRED"
    assert CaseVersion.objects.get(pk=cv).status == "DRAFT"


def test_legacy_publish_still_publishes_a_draft_when_the_flag_is_off(prof_a, admin, settings):
    settings.REVIEW_WORKFLOW_STRICT = False
    cv = _draft_owned_by(prof_a)

    response = cl(admin).post(f"{LEGACY_BASE}/{cv}/publish", {}, format="json")

    assert response.status_code == 200
    assert response.data["data"]["status"] == "PUBLISHED"
    review = CaseReview.objects.get(case_version_id=cv)
    assert (review.decision, review.decided_by_id) == ("APPROVED", admin.id)


LEGACY_BASE = "/api/admin/cases"


# ─── devolver a borrador ────────────────────────────────────────────────────────────────
def test_reject_needs_a_reason_and_a_note_and_the_author_can_resubmit(prof_a, admin):
    cv = _draft_owned_by(prof_a)
    _post(cl(prof_a), cv, action="submit")

    no_reason = _post(cl(admin), cv, action="reject", note="Falta claridad")
    bad_reason = _post(cl(admin), cv, action="reject", reason="OTRA", note="x")
    no_note = _post(cl(admin), cv, action="reject", reason="FORMA", note="  ")
    assert no_reason.status_code == bad_reason.status_code == no_note.status_code == 400
    assert no_reason.data["field"] == "reason"
    assert no_note.data["field"] == "note"

    rejected = _post(cl(admin), cv, action="reject", reason="CONTENIDO", note="Revisar el protocolo de riesgo")

    assert rejected.status_code == 200
    assert rejected.data["data"]["state"] == "DRAFT"
    assert rejected.data["data"]["review"]["decision"] == "REJECTED"
    assert rejected.data["data"]["review"]["reason"] == "CONTENIDO"
    assert rejected.data["data"]["review"]["note"] == "Revisar el protocolo de riesgo"
    assert _post(cl(prof_a), cv, action="submit").status_code == 200
    reviews = list(CaseReview.objects.filter(case_version_id=cv).order_by("id"))
    assert [r.decision for r in reviews] == ["REJECTED", None]


# ─── archivar ───────────────────────────────────────────────────────────────────────────
def _published(owner, admin, settings):
    settings.REVIEW_WORKFLOW_STRICT = False
    cv = _draft_owned_by(owner)
    assert cl(admin).post(f"{AUTHORING}/{cv}/publish", {}, format="json").status_code == 200
    return cv


def test_the_author_archives_a_published_version_and_can_only_clone_it(prof_a, admin, settings):
    cv = _published(prof_a, admin, settings)
    before = _state(cl(prof_a), cv)
    assert before["allowedTransitions"] == ["archive", "clone"]

    response = _post(cl(prof_a), cv, action="archive")

    assert response.status_code == 200
    assert response.data["data"]["state"] == "ARCHIVED"
    assert response.data["data"]["allowedTransitions"] == ["clone"]
    assert AuditLog.objects.filter(action="CASE_ARCHIVED", resource_id=str(cv)).count() == 1
    assert _post(cl(prof_a), cv, action="archive").status_code == 409


def test_archiving_the_case_archives_every_published_version(prof_a, admin, settings):
    first = _published(prof_a, admin, settings)
    case_id = CaseVersion.objects.get(pk=first).simulation_case_id
    second = publication.clone_version(first, prof_a)["caseVersionId"]
    cl(prof_a).put(f"{AUTHORING}/{second}/checklist", CHECKLIST, format="json")
    assert cl(admin).post(f"{AUTHORING}/{second}/publish", {}, format="json").status_code == 200

    response = _post(cl(prof_a), second, action="archive", scope="case")

    assert response.status_code == 200
    statuses = set(CaseVersion.objects.filter(simulation_case_id=case_id).values_list("status", flat=True))
    assert statuses == {"ARCHIVED"}


def test_clone_from_the_lifecycle_returns_the_new_draft(prof_a, admin, settings):
    cv = _published(prof_a, admin, settings)

    response = _post(cl(prof_a), cv, action="clone")

    assert response.status_code == 200
    body = response.data["data"]
    assert body["caseVersionId"] != cv
    assert body["state"] == "DRAFT"
    assert CaseVersion.objects.get(pk=body["caseVersionId"]).cloned_from_id == cv


def test_an_open_attempt_of_an_archived_version_can_still_be_finished(prof_a, admin, estudiante, settings):
    cv = _published(prof_a, admin, settings)
    grupo = assign_case_to_student(estudiante, cv, "LC-ARCH")
    student = cl(estudiante)
    started = student.post("/api/simulation/attempts", {"caseVersionId": cv}, format="json").data["data"]
    _post(cl(prof_a), cv, action="archive")

    state = student.get(
        f"/api/simulation/attempts/{started['attemptId']}", **attempt_headers(started["attemptToken"])
    )
    other = _user("lc_other_student@x.com", "ESTUDIANTE")
    assign_case_to_student(other, cv, "LC-ARCH2")
    fresh = cl(other).post("/api/simulation/attempts", {"caseVersionId": cv}, format="json")

    assert state.status_code == 200
    assert fresh.status_code == 403  # un intento NUEVO exige versión publicada
    # El seguimiento docente conserva el intento de la versión archivada.
    recent = cl(Grupo.objects.get(pk=grupo.pk).profesor).get("/api/instructor/attempts/recent")
    assert str(started["attemptId"]) in {a["attemptId"] for a in recent.data["data"]}
    assert SimulationAttempt.objects.get(pk=started["attemptId"]).status == "IN_PROGRESS"


# ─── la forma del contrato ──────────────────────────────────────────────────────────────
def test_lifecycle_for_admin_in_review_offers_approve_and_reject(prof_a, admin):
    cv = _draft_owned_by(prof_a)
    _post(cl(prof_a), cv, action="submit")

    seen = _state(cl(admin), cv)

    assert seen["state"] == "IN_REVIEW"
    assert seen["allowedTransitions"] == ["approve", "reject"]
    assert set(seen) >= {"caseVersionId", "state", "allowedTransitions"}


def test_an_unknown_action_is_a_validation_error(prof_a):
    cv = _draft_owned_by(prof_a)

    response = _post(cl(prof_a), cv, action="teleport")

    assert response.status_code == 400
    assert response.data["field"] == "action"
