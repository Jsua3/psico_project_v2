"""E3-2 · Las cuatro superficies de acceso dicen lo mismo (Review Focus 2 del maestro).

Catálogo, lobby, inicio y continuación se apoyan en la misma decisión: para cada resultado
(permitido, sin asignar, aún no abre, cerrado, bloqueado por la secuencia) se recorre cada
superficie. Un intento abierto se deja terminar aunque la ventana cierre o la versión se archive;
si le retiran la asignación se bloquea.
"""
import datetime

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante
from apps.simulation.models import CaseVersion, SimulationCase

pytestmark = [pytest.mark.req("RN-04"), pytest.mark.req("RF-15")]

User = get_user_model()
BASE = "/api/simulation"


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def profesor(db):
    return User.objects.create_user(
        email="surf_prof@x.com", password="Clave-Segura-2026!", nombre="P", apellido="S", role="PROFESOR"
    )


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="surf_est@x.com", password="Clave-Segura-2026!", nombre="E", apellido="S", role="ESTUDIANTE"
    )


@pytest.fixture
def grupo(profesor, estudiante):
    group = Grupo.objects.create(nombre="G surf", codigo="SURF1", profesor=profesor)
    GrupoEstudiante.objects.create(grupo=group, estudiante=estudiante, status="ACTIVE")
    return group


@pytest.fixture
def seeded(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")


def _earlier_case(profesor):
    """Una versión publicada sin completar que precede al caso sembrado en la secuencia."""
    case = SimulationCase.objects.create(code="SURF-PREV", title="Caso previo", created_by=profesor)
    return CaseVersion.objects.create(
        simulation_case=case, semantic_version="1.0.0", status="PUBLISHED", created_by=profesor
    )


def _prepare(reason, grupo, seeded, profesor):
    """Deja al estudiante en el resultado ``reason`` respecto del caso sembrado."""
    now = timezone.now()
    day = datetime.timedelta(days=1)
    if reason == "NOT_ASSIGNED":
        return
    if reason == "ALLOWED":
        CaseAssignment.objects.create(grupo=grupo, case_version=seeded)
    elif reason == "NOT_YET_OPEN":
        CaseAssignment.objects.create(grupo=grupo, case_version=seeded, opens_at=now + day)
    elif reason == "CLOSED":
        CaseAssignment.objects.create(
            grupo=grupo, case_version=seeded, opens_at=now - 10 * day, closes_at=now - day
        )
    elif reason == "LOCKED_BY_SEQUENCE":
        CaseAssignment.objects.create(grupo=grupo, case_version=_earlier_case(profesor), sort_order=0)
        CaseAssignment.objects.create(grupo=grupo, case_version=seeded, sort_order=1)
    else:  # pragma: no cover
        raise AssertionError(reason)


REASONS = ["ALLOWED", "NOT_ASSIGNED", "NOT_YET_OPEN", "CLOSED", "LOCKED_BY_SEQUENCE"]


def _item(rows, version_id):
    return next((row for row in rows if row["caseVersionId"] == version_id), None)


# ─── las cuatro superficies × los cinco resultados ───────────────────────────────────────────
@pytest.mark.parametrize("reason", REASONS)
def test_the_catalog_says_the_decision(estudiante, profesor, grupo, seeded, reason):
    _prepare(reason, grupo, seeded, profesor)

    item = _item(cl(estudiante).get(f"{BASE}/catalog").data["data"], seeded.id)

    if reason == "NOT_ASSIGNED":
        assert item is None
        return
    assert item is not None
    assert item["access"]["allowed"] is (reason == "ALLOWED")
    assert item["access"].get("reason") == (None if reason == "ALLOWED" else reason)
    assert item["unlocked"] is (reason == "ALLOWED")  # el cliente actual sigue leyendo `unlocked`
    assert item["locked"] is (reason != "ALLOWED")
    if reason == "NOT_YET_OPEN":
        assert item["access"]["opensAt"].endswith("-05:00")
    if reason == "CLOSED":
        assert item["access"]["closesAt"].endswith("-05:00")


@pytest.mark.parametrize("reason", REASONS)
def test_the_lobby_says_the_same(estudiante, profesor, grupo, seeded, reason):
    _prepare(reason, grupo, seeded, profesor)

    item = _item(cl(estudiante).get(f"{BASE}/cases").data["data"], seeded.id)

    if reason == "NOT_ASSIGNED":
        assert item is None
        return
    assert item is not None
    assert item["access"]["allowed"] is (reason == "ALLOWED")
    assert item["access"].get("reason") == (None if reason == "ALLOWED" else reason)


@pytest.mark.parametrize("reason", REASONS)
def test_starting_an_attempt_obeys_the_same_decision(estudiante, profesor, grupo, seeded, reason):
    _prepare(reason, grupo, seeded, profesor)

    response = cl(estudiante).post(f"{BASE}/attempts", {"caseVersionId": seeded.id}, format="json")

    if reason == "ALLOWED":
        assert response.status_code == 200, response.data
        return
    assert response.status_code == 403, response.data
    assert response.data["code"] == f"ACCESS_{reason}"
    if reason == "NOT_YET_OPEN":
        assert response.data["opensAt"].endswith("-05:00")
    if reason == "CLOSED":
        assert response.data["closesAt"].endswith("-05:00")


@pytest.mark.parametrize("reason", REASONS)
def test_the_catalog_and_the_start_never_disagree(estudiante, profesor, grupo, seeded, reason):
    """La razón del catálogo es la del 403 del inicio: no hay dos criterios."""
    _prepare(reason, grupo, seeded, profesor)
    item = _item(cl(estudiante).get(f"{BASE}/catalog").data["data"], seeded.id)

    start = cl(estudiante).post(f"{BASE}/attempts", {"caseVersionId": seeded.id}, format="json")

    catalog_says_allowed = bool(item and item["access"]["allowed"])
    assert (start.status_code == 200) is catalog_says_allowed
    if not catalog_says_allowed and item is not None:
        assert start.data["code"] == f"ACCESS_{item['access']['reason']}"


# ─── la continuación: un intento abierto se deja terminar (decisión 12) ────────────────────────
def _start_open_attempt(student, grupo, seeded):
    assignment = CaseAssignment.objects.create(grupo=grupo, case_version=seeded)
    started = cl(student).post(f"{BASE}/attempts", {"caseVersionId": seeded.id}, format="json")
    assert started.status_code == 200, started.data
    return assignment, started.data["data"]


def test_an_open_attempt_continues_after_the_window_closes(estudiante, grupo, seeded):
    assignment, state = _start_open_attempt(estudiante, grupo, seeded)
    now = timezone.now()
    CaseAssignment.objects.filter(pk=assignment.pk).update(
        opens_at=now - datetime.timedelta(days=10), closes_at=now - datetime.timedelta(days=1)
    )

    active = cl(estudiante).get(f"{BASE}/cases/{seeded.id}/active-attempt")
    read = cl(estudiante).get(
        f"{BASE}/attempts/{state['attemptId']}",
        HTTP_X_SIEP_ATTEMPT_TOKEN=active.data["data"]["attemptToken"],
    )
    again = cl(estudiante).post(f"{BASE}/attempts", {"caseVersionId": seeded.id}, format="json")

    assert active.status_code == 200 and active.data["data"]["resumed"] is True
    assert read.status_code == 200
    assert again.status_code == 200 and again.data["data"]["resumed"] is True  # reanuda, no inicia otro


def test_an_open_attempt_continues_after_the_version_is_archived(estudiante, grupo, seeded):
    _, state = _start_open_attempt(estudiante, grupo, seeded)
    CaseVersion.objects.filter(pk=seeded.pk).update(status="ARCHIVED")

    active = cl(estudiante).get(f"{BASE}/cases/{seeded.id}/active-attempt")

    assert active.status_code == 200
    assert active.data["data"]["attemptId"] == state["attemptId"]


@pytest.mark.parametrize("how", ["deleted", "paused", "member_removed"])
def test_an_open_attempt_is_blocked_when_the_assignment_goes_away(estudiante, grupo, seeded, how):
    assignment, state = _start_open_attempt(estudiante, grupo, seeded)
    if how == "deleted":
        assignment.delete()
    elif how == "paused":
        CaseAssignment.objects.filter(pk=assignment.pk).update(active=False)
    else:
        GrupoEstudiante.objects.filter(grupo=grupo, estudiante=estudiante).update(status="REMOVED")

    active = cl(estudiante).get(f"{BASE}/cases/{seeded.id}/active-attempt")
    read = cl(estudiante).get(
        f"{BASE}/attempts/{state['attemptId']}", HTTP_X_SIEP_ATTEMPT_TOKEN=state["attemptToken"]
    )

    assert active.status_code == read.status_code == 403
    assert active.data["code"] == read.data["code"] == "ACCESS_NOT_ASSIGNED"


def test_staff_see_every_case_open_in_the_catalog(profesor, seeded):
    item = _item(cl(profesor).get(f"{BASE}/catalog").data["data"], seeded.id)

    assert item is not None
    assert item["access"] == {"allowed": True}
    assert item["unlocked"] is True
