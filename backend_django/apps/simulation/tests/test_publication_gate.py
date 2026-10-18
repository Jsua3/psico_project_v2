"""E4-4 · La compuerta única de publicación y el sello (RN-05, SIEP-RN-02, REGLA-012, Review Focus 3).

Una versión se publica por un solo camino: ``gate.ensure_publishable`` valida el mundo y el documento y
calcula la huella del documento validado; ``gate.mark_published`` escribe ``PUBLISHED`` junto con el sello
(``validated_at`` y ``definition_hash``) en una sola sentencia, bajo el mismo cerrojo de la versión que
ya toma ``approve``. ``start_attempt`` y ``find_active_attempt`` (sin intento abierto) exigen el sello;
reanudar un intento abierto no lo exige («se deja terminar»). «Lo que se ejecuta es lo que se validó»:
el sello de cada versión publicada es la huella de su documento.
"""
import threading
import uuid

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.casedef.canonical import definition_hash
from apps.simulation.models import (
    AuditLog,
    CaseReview,
    CaseVersion,
    SimulationAttempt,
    SimulationCase,
    SimulationNode,
)
from apps.simulation.services import game_service
from apps.simulation.services.authoring import definition_io, gate, graph, lifecycle, publication
from shared.exceptions import ApiError
from shared.testing import purge_audit_rows, run_concurrently

from .test_case_lifecycle import AUTHORING, CHECKLIST, _draft_owned_by
from .test_game import assign_case_to_student

pytestmark = [pytest.mark.req("RN-05"), pytest.mark.req("SIEP-RN-02"), pytest.mark.req("REGLA-012")]

User = get_user_model()


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(email=email, password="pass1234", nombre="Nom", apellido="Ape", role=role)


@pytest.fixture
def admin(db):
    return _user("gate_admin@x.com", "ADMIN")


@pytest.fixture
def prof(db):
    return _user("gate_prof@x.com", "PROFESOR")


@pytest.fixture
def estudiante(db):
    return _user("gate_est@x.com", "ESTUDIANTE")


@pytest.fixture
def seeded(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")


def _approve(admin, cv, **body):
    return cl(admin).post(f"{AUTHORING}/{cv}/lifecycle", {"action": "approve", **body}, format="json")


# ─── aprobar valida y sella ───────────────────────────────────────────────────────────────────
def test_approving_a_version_with_errors_is_refused_with_the_issues_and_leaves_no_seal(admin):
    created = cl(admin).post(AUTHORING, {"title": "Caso a medias"}, format="json").data["data"]
    cv = created["caseVersionId"]
    assert cl(admin).put(f"{AUTHORING}/{cv}/checklist", CHECKLIST, format="json").status_code == 200

    response = _approve(admin, cv)

    assert response.status_code == 409
    assert response.data["code"] == "CASE_NOT_PUBLISHABLE"
    blocker = next(b for b in response.data["blockers"] if b["code"] == "VALIDATION_ERRORS")
    assert {"WORLD", "DSL"} <= {issue["code"].split(".")[0] for issue in blocker["issues"]}
    version = CaseVersion.objects.get(pk=cv)
    assert (version.status, version.validated_at, version.definition_hash) == ("DRAFT", None, None)


def test_approving_a_valid_version_seals_it_with_the_hash_of_its_document(admin, prof):
    cv = _draft_owned_by(prof)

    response = _approve(admin, cv)

    assert response.status_code == 200, response.data
    version = CaseVersion.objects.get(pk=cv)
    assert version.status == "PUBLISHED"
    assert version.validated_at is not None and version.published_at == version.validated_at
    assert version.definition_hash.startswith("sha256:") and len(version.definition_hash) == 71
    assert version.definition_hash == definition_hash(definition_io.export_definition(cv))


def test_the_legacy_publish_endpoint_seals_too(admin, prof):
    cv = _draft_owned_by(prof)

    response = cl(admin).post(f"{AUTHORING}/{cv}/publish", {}, format="json")

    assert response.status_code == 200, response.data
    version = CaseVersion.objects.get(pk=cv)
    assert version.status == "PUBLISHED" and version.definition_hash == definition_hash(definition_io.export_definition(cv))


def test_the_checklist_is_part_of_the_gate_unless_the_caller_waives_it(prof):
    cv = _draft_owned_by(prof, filled=False)
    version = CaseVersion.objects.get(pk=cv)

    with pytest.raises(ApiError) as refused:
        gate.ensure_publishable(version)
    assert refused.value.api_code == "CASE_NOT_PUBLISHABLE"
    assert refused.value.extra["blockers"][0]["code"] == "CHECKLIST_INCOMPLETE"

    seal = gate.ensure_publishable(version, require_checklist=False)
    assert seal.definition_hash == definition_hash(definition_io.export_definition(cv))


def test_the_seal_does_not_depend_on_the_state_of_the_version(prof):
    cv = _draft_owned_by(prof)
    version = CaseVersion.objects.get(pk=cv)
    before = gate.ensure_publishable(version).definition_hash

    CaseVersion.objects.filter(pk=cv).update(status="IN_REVIEW")

    assert gate.ensure_publishable(CaseVersion.objects.get(pk=cv)).definition_hash == before


def test_the_seal_changes_when_the_document_changes(prof):
    cv = _draft_owned_by(prof)
    version = CaseVersion.objects.get(pk=cv)
    before = gate.ensure_publishable(version).definition_hash

    CaseVersion.objects.filter(pk=cv).update(narrative_context="Otro contexto para el caso.")

    assert gate.ensure_publishable(CaseVersion.objects.get(pk=cv)).definition_hash != before


def test_mark_published_writes_the_state_and_the_seal_in_one_update(admin, prof, django_assert_num_queries):
    cv = _draft_owned_by(prof)
    version = CaseVersion.objects.get(pk=cv)
    seal = gate.ensure_publishable(version)

    with django_assert_num_queries(2):  # el UPDATE y la relectura de la fila
        gate.mark_published(version, seal, admin)

    version.refresh_from_db()
    assert version.status == "PUBLISHED"
    assert (version.validated_at, version.definition_hash) == (seal.validated_at, seal.definition_hash)
    assert version.last_edited_by_id == admin.id


# ─── arrancar un intento exige el sello ───────────────────────────────────────────────────────
def _unseal(version_id):
    CaseVersion.objects.filter(pk=version_id).update(validated_at=None, definition_hash=None)


def test_starting_an_attempt_on_a_published_version_without_a_seal_is_refused(seeded, estudiante):
    assign_case_to_student(estudiante, seeded.id, "GATE-A")
    _unseal(seeded.id)

    with pytest.raises(ApiError) as refused:
        game_service.start_attempt(seeded.id, estudiante)

    assert refused.value.api_code == "CASE_NOT_PUBLISHABLE" and refused.value.status_code == 409
    assert not SimulationAttempt.objects.filter(student_id=estudiante.id).exists()


def test_finding_the_active_attempt_without_one_open_needs_the_seal(seeded, estudiante):
    assign_case_to_student(estudiante, seeded.id, "GATE-B")
    _unseal(seeded.id)

    with pytest.raises(ApiError) as refused:
        game_service.find_active_attempt(seeded.id, estudiante)

    assert refused.value.api_code == "CASE_NOT_PUBLISHABLE"


def test_an_open_attempt_is_resumed_even_if_the_version_lost_its_seal(seeded, estudiante):
    assign_case_to_student(estudiante, seeded.id, "GATE-C")
    first = game_service.start_attempt(seeded.id, estudiante)
    _unseal(seeded.id)

    resumed = game_service.start_attempt(seeded.id, estudiante)
    found = game_service.find_active_attempt(seeded.id, estudiante)

    assert resumed["attemptId"] == first["attemptId"] and resumed["resumed"] is True
    assert found["attemptId"] == first["attemptId"] and found["resumed"] is True


def test_a_sealed_published_version_starts_attempts_as_always(seeded, estudiante):
    assign_case_to_student(estudiante, seeded.id, "GATE-D")

    state = game_service.start_attempt(seeded.id, estudiante)

    assert state["resumed"] is False


def test_a_draft_is_still_refused_as_not_published(prof, estudiante):
    cv = _draft_owned_by(prof)
    assign_case_to_student(estudiante, cv, "GATE-E")

    with pytest.raises(Exception) as refused:
        game_service.start_attempt(cv, estudiante)

    assert "no está publicado" in str(refused.value)


# ─── la prueba de todas las publicadas ────────────────────────────────────────────────────────
def test_every_published_version_of_the_database_has_the_seal_of_its_document(db):
    published = list(CaseVersion.objects.filter(status="PUBLISHED"))
    assert published  # la siembra deja al menos el caso demo

    for version in published:
        assert version.validated_at is not None, version
        assert version.definition_hash == definition_hash(definition_io.export_definition(version.id)), version


# ─── hilos con commits reales: el sello es el de lo publicado ─────────────────────────────────
def _real_valid_draft(owner):
    """Un borrador válido con commits reales (la prueba lo borra al terminar)."""
    seeded = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    cv = publication.clone_version(seeded.id, owner)["caseVersionId"]
    suffix = uuid.uuid4().hex[:8]
    case = SimulationCase.objects.create(code=f"GATE-{suffix.upper()}", title=f"Caso {suffix}", created_by=owner)
    CaseVersion.objects.filter(pk=cv).update(simulation_case=case, semantic_version="0.1.0")
    assert cl(owner).put(f"{AUTHORING}/{cv}/checklist", CHECKLIST, format="json").status_code == 200
    return cv, case


def _edit_request(node, **changes):
    """El cuerpo completo de ``update_node`` con los valores de ahora (omitir un campo lo apaga)."""
    return {
        "nodeKey": node.node_key, "title": node.title, "narrative": node.narrative,
        "startNode": node.start_node, "terminal": node.terminal_node,
        "sensitiveContent": node.sensitive_content, "safeExitRequired": node.safe_exit_required,
        "warningMessage": node.warning_message, "positionX": node.position_x, "positionY": node.position_y,
        **changes,
    }


def _forget(case, *users):
    started = [v.pk for v in CaseVersion.objects.filter(simulation_case=case)]
    CaseReview.objects.filter(case_version_id__in=started).delete()
    purge_audit_rows(AuditLog.objects.filter(resource_id__in=[str(pk) for pk in started]))
    case.delete()
    for user in users:
        user.delete()


def test_an_edit_that_arrives_during_the_approval_cannot_slip_into_the_sealed_version(real_commits, monkeypatch):
    suffix = uuid.uuid4().hex[:8]
    admin = _user(f"gate_ca_{suffix}@x.com", "ADMIN")
    cv, case = _real_valid_draft(admin)
    node = SimulationNode.objects.filter(case_version_id=cv).order_by("id").first()
    validated, edit_started = threading.Event(), threading.Event()
    real = gate.ensure_publishable

    def slow(version, **kwargs):
        seal = real(version, **kwargs)
        validated.set()
        edit_started.wait(10)
        threading.Event().wait(0.5)  # la edición ya intentó entrar: la aprobación sigue sosteniendo el cerrojo
        return seal

    monkeypatch.setattr(gate, "ensure_publishable", slow)

    def approve():
        return lifecycle.approve(cv, admin)

    def edit():
        validated.wait(10)
        edit_started.set()
        return graph.update_node(cv, node.id, _edit_request(node, title="Título cambiado durante la aprobación"))

    try:
        approval, edition = run_concurrently(approve, edit)

        assert approval.error is None
        assert edition.error is not None and "Solo se puede modificar una versión en estado DRAFT" in str(edition.error)
        version = CaseVersion.objects.get(pk=cv)
        assert version.status == "PUBLISHED"
        assert version.definition_hash == definition_hash(definition_io.export_definition(cv))
    finally:
        _forget(case, admin)


def test_two_simultaneous_approvals_publish_once_and_the_other_gets_an_invalid_transition(real_commits):
    suffix = uuid.uuid4().hex[:8]
    admin = _user(f"gate_cb_{suffix}@x.com", "ADMIN")
    cv, case = _real_valid_draft(admin)

    def approve():
        return lifecycle.approve(cv, admin)

    try:
        outcomes = run_concurrently(approve, approve)

        errors = [o.error for o in outcomes if o.error is not None]
        assert len(errors) == 1 and getattr(errors[0], "api_code", None) == "INVALID_TRANSITION"
        assert CaseVersion.objects.get(pk=cv).status == "PUBLISHED"
        assert CaseReview.objects.filter(case_version_id=cv, decision="APPROVED").count() == 1
    finally:
        _forget(case, admin)
