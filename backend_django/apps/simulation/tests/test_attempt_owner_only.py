"""E2-2 · Un intento solo lo lee su dueño por token (D-11, RNF-04, LS-7).

Hoy un PROFESOR o un ADMIN con el token de un intento ajeno lo leía (intento, reporte de
cierre, mapa de progreso, mundo). La vía del docente es ``/api/instructor/**`` y
``student-report``, que sí aplican el alcance de sus estudiantes.
"""
import pytest
from django.contrib.auth import get_user_model

from apps.grupos.models import Grupo

from .test_game import (  # noqa: F401  (fixtures de pytest)
    assign_case_to_student,
    attempt_headers,
    case_version_id,
    cl,
    estudiante,
)

pytestmark = [pytest.mark.req("D-11"), pytest.mark.req("RNF-04"), pytest.mark.req("LS-7")]

BASE = "/api/simulation"
User = get_user_model()

TOKEN_READS = [
    "attempts/{id}",
    "attempts/{id}/completion-report",
    "attempts/{id}/progress-map",
    "attempts/{id}/world",
    "attempts/{id}/report",
]


@pytest.fixture
def profesor(db):
    return User.objects.create_user(
        email="own_prof@x.com", password="pass1234", nombre="Pro", apellido="Own", role="PROFESOR"
    )


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="own_admin@x.com", password="pass1234", nombre="Ad", apellido="Own", role="ADMIN"
    )


@pytest.fixture
def otro_estudiante(db):
    return User.objects.create_user(
        email="own_otro@x.com", password="pass1234", nombre="Otro", apellido="Est", role="ESTUDIANTE"
    )


@pytest.fixture
def abierto(estudiante, profesor, case_version_id):
    """Un intento en juego del estudiante, en un grupo del ``profesor``."""
    grupo = assign_case_to_student(estudiante, case_version_id, "OWN-1")
    Grupo.objects.filter(pk=grupo.pk).update(profesor=profesor)
    return cl(estudiante).post(
        f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]


def _get(client, template, attempt):
    path = f"{BASE}/{template.format(id=attempt['attemptId'])}"
    return client.get(path, **attempt_headers(attempt["attemptToken"]))


@pytest.mark.parametrize("template", TOKEN_READS)
@pytest.mark.parametrize("who", ["profesor", "admin", "otro_estudiante"])
def test_nobody_but_the_owner_reads_an_attempt_by_token(request, who, template, abierto):
    response = _get(cl(request.getfixturevalue(who)), template, abierto)

    assert response.status_code == 403
    assert response.data["code"] == "FORBIDDEN"


@pytest.mark.parametrize("template", TOKEN_READS)
def test_the_owner_still_reads_their_attempt(estudiante, template, abierto):
    response = _get(cl(estudiante), template, abierto)

    # 200 las lecturas; el reporte de cierre y el de finalización de un intento en curso
    # responden con su propio error de estado, nunca con 403.
    assert response.status_code in (200, 400, 409)
    assert response.status_code != 403


def test_the_teachers_way_in_is_the_instructor_api(profesor, admin, abierto):
    assert cl(profesor).get(f"/api/instructor/attempts/{abierto['attemptId']}/trace").status_code == 200
    assert cl(admin).get(f"/api/instructor/attempts/{abierto['attemptId']}/trace").status_code == 200


def test_a_teacher_without_the_student_gets_403_on_the_trace(estudiante, abierto):
    ajeno = User.objects.create_user(
        email="own_ajeno@x.com", password="pass1234", nombre="Aj", apellido="Eno", role="PROFESOR"
    )

    assert cl(ajeno).get(f"/api/instructor/attempts/{abierto['attemptId']}/trace").status_code == 403


def test_student_report_keeps_its_own_scope(estudiante, profesor, admin, otro_estudiante, abierto):
    url = f"{BASE}/attempts/{abierto['attemptId']}/student-report"
    ajeno = User.objects.create_user(
        email="own_ajeno2@x.com", password="pass1234", nombre="Aj", apellido="Eno2", role="PROFESOR"
    )

    assert cl(estudiante).get(url).status_code == 200
    assert cl(profesor).get(url).status_code == 200
    assert cl(admin).get(url).status_code == 200
    assert cl(ajeno).get(url).status_code == 403
    assert cl(otro_estudiante).get(url).status_code == 403


# ─── E2-3 · El ADMIN (y el PROFESOR) no juegan (ED-5, RF-02) ────────────────────────────
def _play_calls(attempt, case_version_id):
    """(método, ruta, cuerpo) de las 12 órdenes de juego, con un intento ajeno real."""
    token = {"attemptToken": attempt["attemptToken"]}
    base = f"{BASE}/attempts/{attempt['attemptId']}"
    return [
        ("post", f"{BASE}/attempts", {"caseVersionId": case_version_id}),
        ("get", f"{BASE}/cases/{case_version_id}/active-attempt", None),
        ("get", f"{BASE}/attempts/history", None),
        ("post", f"{base}/decisions", {**token, "decisionOptionId": 1}),
        ("post", f"{base}/reflections", {**token, "nodeId": 1, "text": "x"}),
        ("post", f"{base}/safe-exit", {**token, "reason": "x"}),
        ("post", f"{base}/resume", token),
        ("patch", f"{base}/world-state", {**token, "playerX": 1, "playerY": 1}),
        ("post", f"{base}/enter-room", {**token, "targetNodeKey": "x"}),
        ("post", f"{base}/interactions/x", token),
        ("post", f"{base}/npcs/x", token),
        ("post", f"{base}/tools/use", {**token, "toolCode": "x"}),
    ]


@pytest.mark.req("RF-02")
@pytest.mark.parametrize("who", ["admin", "profesor"])
def test_only_students_play(request, who, abierto, case_version_id):
    actor = cl(request.getfixturevalue(who))
    for method, path, body in _play_calls(abierto, case_version_id):
        response = getattr(actor, method)(path, body, format="json") if body is not None else actor.get(path)
        assert response.status_code == 403, (method, path)
        assert response.data["code"] == "FORBIDDEN", (method, path)


@pytest.mark.req("RF-02")
def test_admin_cannot_create_an_attempt_even_with_the_case_published(admin, case_version_id):
    from apps.simulation.models import SimulationAttempt

    before = SimulationAttempt.objects.count()
    response = cl(admin).post(f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json")

    assert response.status_code == 403
    assert SimulationAttempt.objects.count() == before


@pytest.mark.req("RF-02")
def test_the_editor_preview_still_works_for_the_admin_without_an_attempt(admin, case_version_id):
    from apps.simulation.models import SimulationAttempt

    before = SimulationAttempt.objects.count()
    response = cl(admin).get(f"/api/admin/cases/{case_version_id}/world-preview")

    assert response.status_code == 200
    assert SimulationAttempt.objects.count() == before
