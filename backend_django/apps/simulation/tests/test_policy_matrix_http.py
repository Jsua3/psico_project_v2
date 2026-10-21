"""E2-13 · La matriz de políticas, fila por fila, contra rutas HTTP reales (RF-02, RNF-002).

``shared/policy-matrix.json`` declara quién puede qué; esta prueba lo **demuestra** sobre la
API: por cada fila de ``MATRIX`` hay una ruta real y el estado que cada rol recibe. Una fila
nueva sin ruta aquí falla (``test_every_row_has_a_route``). ``audit.read`` consta sin ruta
hasta E5-7 (C15, ``GET /api/admin/audit``).

Cada celda del diccionario es ``rol → estado esperado``; ``"!403"`` significa «la puerta de
rol dejó pasar» (la regla de negocio decide después y responde otro estado).
"""
import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.grupos.models import Grupo, CaseAssignment, GrupoEstudiante
from apps.simulation.models import CaseVersion, SimulationCase
from shared import policies

pytestmark = [pytest.mark.req("RF-02"), pytest.mark.req("RNF-002")]

User = get_user_model()
ROLES = ("anon", "ESTUDIANTE", "PROFESOR", "ADMIN")

#: Filas de la matriz que aún no tienen endpoint (se anota por qué, no se omite en silencio).
NO_ROUTE_YET = {("audit", "read"): "GET /api/admin/audit llega en E5-7 (C15)"}


def _client(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


class World:
    """Un grupo del profesor, con un estudiante activo, un caso asignado y un intento abierto."""

    def __init__(self, db_):
        make = lambda email, role: User.objects.create_user(  # noqa: E731
            email=email, password="Clave-Segura-2026!", nombre="Nom", apellido=role.title(), role=role
        )
        self.admin = make("mx_admin@x.com", "ADMIN")
        self.prof = make("mx_prof@x.com", "PROFESOR")
        self.foreign = make("mx_foreign@x.com", "PROFESOR")
        self.student = make("mx_student@x.com", "ESTUDIANTE")
        self.other_student = make("mx_other@x.com", "ESTUDIANTE")
        self.version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
        self.grupo = Grupo.objects.create(nombre="Grupo MX", codigo="MX1", profesor=self.prof)
        GrupoEstudiante.objects.create(grupo=self.grupo, estudiante=self.student, status="ACTIVE")
        CaseAssignment.objects.create(grupo=self.grupo, case_version=self.version)
        self.attempt = _client(self.student).post(
            "/api/simulation/attempts", {"caseVersionId": self.version.id}, format="json"
        ).data["data"]
        self._cases = 0

    def actor(self, label):
        return {"anon": None, "ESTUDIANTE": self.student, "PROFESOR": self.prof, "ADMIN": self.admin}[label]

    def fresh_case(self, owner=None):
        """Un caso borrador nuevo del ``owner`` (por defecto, el profesor)."""
        self._cases += 1
        owner = owner or self.prof
        case = SimulationCase.objects.create(code=f"MX-C{self._cases}", title="Caso MX", created_by=owner)
        return CaseVersion.objects.create(
            simulation_case=case, semantic_version="0.1.0", status="DRAFT", created_by=owner
        ).id

    def fresh_group(self):
        self._cases += 1
        return Grupo.objects.create(nombre="G", codigo=f"MXG{self._cases}", profesor=self.prof)


@pytest.fixture
def world(db):
    return World(db)


def statuses(world, call):
    """``{rol: estado}`` de ``call(client, world)`` para cada rol."""
    return {label: call(_client(world.actor(label)), world) for label in ROLES}


def _code(response):
    return response.status_code


# ─── una función por fila: (recurso, acción) → estados esperados por rol ────────────────
def row_attempt_play(world):
    def call(client, w):
        return _code(client.post("/api/simulation/attempts", {"caseVersionId": w.version.id}, format="json"))

    return statuses(world, call), {"anon": 401, "ESTUDIANTE": 200, "PROFESOR": 403, "ADMIN": 403}


def row_attempt_review(world):
    def call(client, w):
        return _code(client.get(f"/api/instructor/attempts/{w.attempt['attemptId']}/trace"))

    got = statuses(world, call)
    got["foreign PROFESOR"] = _code(_client(world.foreign).get(
        f"/api/instructor/attempts/{world.attempt['attemptId']}/trace"))
    return got, {"anon": 401, "ESTUDIANTE": 403, "PROFESOR": 200, "ADMIN": 200, "foreign PROFESOR": 403}


def row_attempt_report(world):
    def call(client, w):
        return _code(client.get(f"/api/simulation/attempts/{w.attempt['attemptId']}/student-report"))

    got = statuses(world, call)
    got["foreign PROFESOR"] = _code(_client(world.foreign).get(
        f"/api/simulation/attempts/{world.attempt['attemptId']}/student-report"))
    got["other STUDENT"] = _code(_client(world.other_student).get(
        f"/api/simulation/attempts/{world.attempt['attemptId']}/student-report"))
    return got, {
        "anon": 401, "ESTUDIANTE": 200, "PROFESOR": 200, "ADMIN": 200,
        "foreign PROFESOR": 403, "other STUDENT": 403,
    }


def row_case_author(world):
    def call(client, w):
        return _code(client.get("/api/authoring/cases"))

    return statuses(world, call), {"anon": 401, "ESTUDIANTE": 403, "PROFESOR": 200, "ADMIN": 200}


def row_case_submit(world):
    cv = world.fresh_case()
    url = f"/api/authoring/cases/{cv}/lifecycle"
    got = {}
    for label in ROLES:
        got[label] = _code(_client(world.actor(label)).post(url, {"action": "submit"}, format="json"))
    got["foreign PROFESOR"] = _code(_client(world.foreign).post(url, {"action": "submit"}, format="json"))
    # El dueño y el ADMIN pasan la puerta (la lista incompleta es 409, no 403).
    expected = {"anon": 401, "ESTUDIANTE": 403, "PROFESOR": "!403", "ADMIN": "!403", "foreign PROFESOR": 403}
    return got, expected


def row_case_archive(world):
    got = {}
    for label in ROLES:
        cv = world.fresh_case()
        got[label] = _code(_client(world.actor(label)).post(
            f"/api/authoring/cases/{cv}/lifecycle", {"action": "archive"}, format="json"))
    cv = world.fresh_case()
    got["foreign PROFESOR"] = _code(_client(world.foreign).post(
        f"/api/authoring/cases/{cv}/lifecycle", {"action": "archive"}, format="json"))
    return got, {"anon": 401, "ESTUDIANTE": 403, "PROFESOR": 200, "ADMIN": 200, "foreign PROFESOR": 403}


def row_case_publish(world):
    cv = world.fresh_case()
    got = statuses(world, lambda client, w: _code(client.post(f"/api/authoring/cases/{cv}/publish", {}, format="json")))
    # El ADMIN llega a la regla de negocio (la lista está incompleta): 400, no 403.
    return got, {"anon": 401, "ESTUDIANTE": 403, "PROFESOR": 403, "ADMIN": 400}


def row_group_manage(world):
    counter = iter(range(1000))

    def call(client, w):
        return _code(client.post("/api/grupos", {"nombre": "Nuevo", "codigo": f"MXN{next(counter)}"}, format="json"))

    return statuses(world, call), {"anon": 401, "ESTUDIANTE": 403, "PROFESOR": 201, "ADMIN": 403}


def row_group_list(world):
    return statuses(world, lambda client, w: _code(client.get("/api/grupos"))), {
        "anon": 401, "ESTUDIANTE": 403, "PROFESOR": 200, "ADMIN": 200,
    }


def row_membership_invite(world):
    def call(client, w):
        return _code(client.post(
            f"/api/grupos/{w.grupo.id}/estudiantes", {"email": "alguien@x.com"}, format="json"))

    got = statuses(world, call)
    got["foreign PROFESOR"] = _code(_client(world.foreign).post(
        f"/api/grupos/{world.grupo.id}/estudiantes", {"email": "alguien@x.com"}, format="json"))
    return got, {"anon": 401, "ESTUDIANTE": 403, "PROFESOR": 200, "ADMIN": 200, "foreign PROFESOR": 400}


def row_membership_respond(world):
    group = world.fresh_group()
    GrupoEstudiante.objects.create(grupo=group, estudiante=world.student, status="INVITED")
    url = f"/api/me/invitations/{group.id}/accept"
    got = {
        "anon": _code(_client().post(url, {}, format="json")),
        "PROFESOR": _code(_client(world.prof).post(url, {}, format="json")),
        "other STUDENT": _code(_client(world.other_student).post(url, {}, format="json")),
        "ESTUDIANTE": _code(_client(world.student).post(url, {}, format="json")),
    }
    return got, {"anon": 401, "PROFESOR": 403, "other STUDENT": 404, "ESTUDIANTE": 200}


def row_assignment_manage(world):
    def call(client, w):
        return _code(client.post(
            f"/api/grupos/{w.grupo.id}/casos", {"caseVersionId": w.version.id}, format="json"))

    got = statuses(world, call)
    got["foreign PROFESOR"] = _code(_client(world.foreign).post(
        f"/api/grupos/{world.grupo.id}/casos", {"caseVersionId": world.version.id}, format="json"))
    return got, {"anon": 401, "ESTUDIANTE": 403, "PROFESOR": 200, "ADMIN": 403, "foreign PROFESOR": 400}


def row_assignment_list(world):
    def call(client, w):
        return _code(client.get(f"/api/grupos/{w.grupo.id}/casos"))

    got = statuses(world, call)
    got["foreign PROFESOR"] = _code(_client(world.foreign).get(f"/api/grupos/{world.grupo.id}/casos"))
    return got, {"anon": 401, "ESTUDIANTE": 403, "PROFESOR": 200, "ADMIN": 200, "foreign PROFESOR": 400}


def row_rubric_read(world):
    return statuses(world, lambda client, w: _code(client.get("/api/rubrics/"))), {
        "anon": 401, "ESTUDIANTE": 403, "PROFESOR": 200, "ADMIN": 200,
    }


RUBRIC = {
    "name": "Rúbrica MX", "description": "d", "version": "1.0", "active": False,
    "criteria": [{"title": "Uno", "weight": 50}, {"title": "Dos", "weight": 50}],
}


def row_rubric_edit(world):
    return statuses(world, lambda client, w: _code(client.post("/api/rubrics/", RUBRIC, format="json"))), {
        "anon": 401, "ESTUDIANTE": 403, "PROFESOR": 201, "ADMIN": 201,
    }


def row_rubric_default(world):
    created = _client(world.admin).post("/api/rubrics/", {**RUBRIC, "active": True}, format="json").data["data"]
    url = f"/api/rubrics/{created['id']}/default"
    got = statuses(world, lambda client, w: _code(client.post(url, {}, format="json")))
    return got, {"anon": 401, "ESTUDIANTE": 403, "PROFESOR": 403, "ADMIN": 200}


def row_competency_read(world):
    return statuses(world, lambda client, w: _code(client.get("/api/competencies"))), {
        "anon": 401, "ESTUDIANTE": 403, "PROFESOR": 200, "ADMIN": 200,
    }


def row_competency_manage(world):
    def call(client, w):
        return _code(client.post("/api/competencies", {"code": "", "name": ""}, format="json"))

    # El cuerpo vacío es un 400 de validación: la puerta de rol dejó pasar solo al ADMIN.
    return statuses(world, call), {"anon": 401, "ESTUDIANTE": 403, "PROFESOR": 403, "ADMIN": 400}


def row_user_manage(world):
    return statuses(world, lambda client, w: _code(client.get("/api/admin/users"))), {
        "anon": 401, "ESTUDIANTE": 403, "PROFESOR": 403, "ADMIN": 200,
    }


def row_analytics_read(world):
    got = statuses(world, lambda client, w: _code(client.get("/api/reportes/dashboard")))
    got["foreign PROFESOR scope"] = _code(_client(world.foreign).get(f"/api/reportes/grupo/{world.grupo.id}"))
    got["PROFESOR scope"] = _code(_client(world.prof).get(f"/api/reportes/grupo/{world.grupo.id}"))
    # E6-2b: la analítica de aprendizaje (C13) cuelga de la misma política y de la misma regla de alcance del grupo.
    got.update({f"analytics {role}": code for role, code in statuses(
        world, lambda client, w: _code(client.get("/api/reportes/analiticas"))).items()})
    got["analytics foreign PROFESOR scope"] = _code(
        _client(world.foreign).get("/api/reportes/analiticas", {"grupoId": world.grupo.id}))
    got["analytics PROFESOR scope"] = _code(
        _client(world.prof).get("/api/reportes/analiticas", {"grupoId": world.grupo.id}))
    return got, {
        "anon": 401, "ESTUDIANTE": 403, "PROFESOR": 200, "ADMIN": 200,
        "foreign PROFESOR scope": 403, "PROFESOR scope": 200,
        "analytics anon": 401, "analytics ESTUDIANTE": 403, "analytics PROFESOR": 200, "analytics ADMIN": 200,
        "analytics foreign PROFESOR scope": 403, "analytics PROFESOR scope": 200,
    }


def row_consent_read(world):
    url = f"/api/simulation/cases/{world.version.id}/consent"
    return statuses(world, lambda client, w: _code(client.get(url))), {
        "anon": 401, "ESTUDIANTE": 200, "PROFESOR": 403, "ADMIN": 403,
    }


def row_consent_record(world):
    url = f"/api/simulation/cases/{world.version.id}/consent"
    body = {"noticeVersion": settings.SIEP_CONTENT_NOTICE_VERSION}
    got = statuses(world, lambda client, w: _code(client.post(url, body, format="json")))
    for label, code in statuses(world, lambda client, w: _code(client.delete(url))).items():
        got[f"DELETE {label}"] = code
    # Solo el estudiante pasa la puerta de rol: acepta (201) y retira (200); el resto ni llega a la regla.
    return got, {
        "anon": 401, "ESTUDIANTE": 201, "PROFESOR": 403, "ADMIN": 403,
        "DELETE anon": 401, "DELETE ESTUDIANTE": 200, "DELETE PROFESOR": 403, "DELETE ADMIN": 403,
    }


def row_catalog_read(world):
    return statuses(world, lambda client, w: _code(client.get("/api/simulation/cases"))), {
        "anon": 401, "ESTUDIANTE": 200, "PROFESOR": 200, "ADMIN": 200,
    }


def row_account_self(world):
    return statuses(world, lambda client, w: _code(client.get("/api/auth/me"))), {
        "anon": 401, "ESTUDIANTE": 200, "PROFESOR": 200, "ADMIN": 200,
    }


ROWS = {
    ("attempt", "play"): row_attempt_play,
    ("attempt", "review"): row_attempt_review,
    ("attempt", "report"): row_attempt_report,
    ("case", "author"): row_case_author,
    ("case", "submit"): row_case_submit,
    ("case", "archive"): row_case_archive,
    ("case", "publish"): row_case_publish,
    ("group", "manage"): row_group_manage,
    ("group", "list"): row_group_list,
    ("membership", "invite"): row_membership_invite,
    ("membership", "respond"): row_membership_respond,
    ("assignment", "manage"): row_assignment_manage,
    ("assignment", "list"): row_assignment_list,
    ("rubric", "read"): row_rubric_read,
    ("rubric", "edit"): row_rubric_edit,
    ("rubric", "default"): row_rubric_default,
    ("competency", "read"): row_competency_read,
    ("competency", "manage"): row_competency_manage,
    ("user", "manage"): row_user_manage,
    ("analytics", "read"): row_analytics_read,
    ("consent", "read"): row_consent_read,
    ("consent", "record"): row_consent_record,
    ("catalog", "read"): row_catalog_read,
    ("account", "self"): row_account_self,
}


def test_every_row_has_a_route():
    """Una fila de la matriz sin ruta aquí (y sin motivo anotado) rompe la prueba."""
    assert set(ROWS) | set(NO_ROUTE_YET) == set(policies.MATRIX)
    assert not set(ROWS) & set(NO_ROUTE_YET)


@pytest.mark.parametrize("row", sorted(ROWS), ids=lambda r: f"{r[0]}.{r[1]}")
def test_the_route_of_each_row_gives_each_role_its_status(world, row):
    got, expected = ROWS[row](world)

    for label, want in expected.items():
        if want == "!403":
            assert got[label] not in (401, 403), (row, label, got)
        else:
            assert got[label] == want, (row, label, got)
