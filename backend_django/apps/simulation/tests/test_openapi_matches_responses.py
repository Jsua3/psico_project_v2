"""E5-9 (reparación) · El documento OpenAPI dice lo que el servidor responde, y se prueba contra el servidor.

El esquema que E5 publicó prometía ``status`` donde el servidor responde ``success``, envolvía en una lista lo que
es un objeto y describía campos que ninguna respuesta trae (``studentId``, ``createdAt``, ``playerX``…). Aquí cada
contrato tipado se prueba contra la respuesta REAL del endpoint: lo que recibe el cliente tiene que ser lo que el
documento dice, clave por clave y tipo por tipo (``shared.contract_testing``). Tipar un endpoint nuevo sin darle
su caso en ``CALLS`` hace fallar la prueba del registro, y la de ``test_openapi_contract`` impide que el número de
contratos tipados baje.
"""
import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Callable

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from drf_spectacular.generators import SchemaGenerator
from rest_framework.test import APIClient

from apps.simulation.models import AuditLog, CaseReview, CaseVersion, SimulationAttempt, SimulationNode
from shared.contract_testing import assert_matches, response_schema, typed_operations

from .test_instructor import assign_case_to_student, cl

pytestmark = pytest.mark.req("RNF-07")

User = get_user_model()
ATTEMPT_HEADER = "HTTP_X_SIEP_ATTEMPT_TOKEN"


@dataclass
class World:
    """Datos reales sobre los que se llama a cada endpoint: un intento en curso, uno terminado y auditoría."""

    admin: object
    profesor: object
    student: object
    attempt_id: str
    token: str
    map_key: str
    x: int
    y: int


@pytest.fixture(scope="module")
def document():
    return SchemaGenerator().get_schema(request=None, public=True)


@pytest.fixture
def world(db):
    version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    make = User.objects.create_user
    admin = make(email="admin_contrato@x.com", password="x", nombre="Ad", apellido="Contrato", role="ADMIN")
    profesor = make(email="prof_contrato@x.com", password="x", nombre="Pro", apellido="Contrato", role="PROFESOR")
    student = make(email="est_contrato@x.com", password="x", nombre="Est", apellido="Contrato", role="ESTUDIANTE")
    assign_case_to_student(student, version.id, "CONTRATO", profesor=profesor)

    client = cl(student)
    started = client.post("/api/simulation/attempts", {"caseVersionId": version.id}, format="json").data["data"]
    attempt_id, token = started["attemptId"], started["attemptToken"]
    scene = client.get(f"/api/simulation/attempts/{attempt_id}/world", **{ATTEMPT_HEADER: token}).data["data"]

    # Un intento terminado (``endedAt`` con valor, lo que el abierto no tiene).
    SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex, student=student, case_version=version,
        current_node=SimulationNode.objects.filter(case_version=version, start_node=True).first(),
        status="COMPLETED", accumulated_score=70, stress_index=20, active_seconds=300.4, ended_at=timezone.now(),
    )
    # Auditoría con todos los campos y otra de sistema (sin actor, recurso, IP ni agente: los nulos reales).
    retention = timezone.now() + timedelta(days=360)
    AuditLog.objects.create(
        actor=admin, actor_role="ADMIN", action="CASE_CREATED", resource_type="CASE", resource_id="7",
        context_json='{"method": "post"}', ip_address="127.0.0.1", user_agent="pytest", retention_until=retention,
    )
    AuditLog.objects.create(action="AUDIT_PURGE", retention_until=retention)
    # Revisiones decididas, para que los indicadores de calidad no sean todos cero.
    CaseReview.objects.create(case_version=version, requested_by=admin, decided_by=admin, decision="APPROVED")
    CaseReview.objects.create(
        case_version=version, requested_by=admin, decided_by=admin, decision="REJECTED", reason="CONTENIDO", note="x"
    )
    return World(admin, profesor, student, attempt_id, token, scene["map"]["key"], scene["player"]["x"], scene["player"]["y"])


def _patch_position(world, *, x=None, y=None, map_key=None):
    return cl(world.student).patch(
        f"/api/simulation/attempts/{world.attempt_id}/world-state",
        {
            "attemptToken": world.token,
            "playerX": world.x + 4 if x is None else x,
            "playerY": world.y if y is None else y,
            "currentMapKey": world.map_key if map_key is None else map_key,
        },
        format="json",
    )


#: Contratos tipados que esta prueba recorre: (ruta del documento, método) → (llamada al endpoint real, estado).
CALLS: dict[tuple[str, str], tuple[Callable[[World], object], int]] = {}


def calls(path: str, method: str, status: int = 200):
    def register(call):
        CALLS[(path, method)] = (call, status)
        return call

    return register


@calls("/api/admin/audit", "GET")
def _audit(world):
    return cl(world.admin).get("/api/admin/audit")


@calls("/api/instructor/attempts", "GET")
def _instructor_attempts(world):
    return cl(world.profesor).get("/api/instructor/attempts")


@calls("/api/simulation/attempts/{attempt_id}/world-state", "PATCH")
def _world_patch_ack(world):
    return _patch_position(world)


@pytest.mark.parametrize(("path", "method"), sorted(CALLS))
def test_la_respuesta_real_coincide_con_el_esquema_del_documento(path, method, document, world):
    call, status = CALLS[(path, method)]

    response = call(world)

    assert response.status_code == status, response.content
    body = response.json()
    assert body["success"] is True and set(body) <= {"success", "message", "data"}  # el sobre real
    assert_matches(body, response_schema(document, path, method, str(status)), document)


def test_todo_contrato_tipado_tiene_su_caso_contra_el_servidor(document):
    assert typed_operations(document) == set(CALLS), (
        "Los contratos tipados del documento y los casos que se prueban contra el servidor deben ser los mismos"
    )


def test_el_listado_de_auditoria_trae_filas_con_y_sin_los_campos_opcionales(document, world):
    """El caso del registro solo prueba lo que hay: aquí se exige que haya de las dos clases."""
    items = _audit(world).json()["data"]["items"]

    assert any(i["actorId"] is not None and i["ipAddress"] and i["resourceType"] for i in items)
    assert any(i["actorId"] is None and i["ipAddress"] is None and i["resourceType"] is None for i in items)


def test_el_listado_de_revision_trae_intentos_abiertos_y_terminados(document, world):
    items = _instructor_attempts(world).json()["data"]["items"]

    assert {i["endedAt"] is None for i in items} == {True, False}


def test_con_la_sala_vieja_el_patch_responde_un_superconjunto_del_acuse(document, world):
    """Si la sala del cliente ya no es la actual, el servidor devuelve el mundo completo: las claves del acuse y más."""
    response = _patch_position(world, map_key="sala-que-ya-no-es")

    assert response.status_code == 200
    body = response.json()
    assert {"objects", "collisions"} <= set(body["data"])
    assert_matches(body, response_schema(document, "/api/simulation/attempts/{attempt_id}/world-state", "PATCH"),
                   document, allow_extra=True)


def test_un_endpoint_sin_tipar_se_documenta_con_el_sobre_generico_y_coincide(document, world):
    """El sobre genérico es un objeto ``{success, message?, data?}``, no una lista de sobres."""
    schema = response_schema(document, "/api/grupos", "GET")

    assert schema == {"$ref": "#/components/schemas/ApiEnvelope"}
    assert_matches(cl(world.profesor).get("/api/grupos").json(), schema, document)


WORLD_STATE = "/api/simulation/attempts/{attempt_id}/world-state"
ERRORS = [
    ("sin sesión", "/api/admin/audit", "GET", lambda w: APIClient().get("/api/admin/audit"), 401, "UNAUTHENTICATED"),
    ("sin permiso", "/api/admin/audit", "GET", lambda w: cl(w.student).get("/api/admin/audit"), 403, "FORBIDDEN"),
    ("parámetro inválido", "/api/admin/audit", "GET",
     lambda w: cl(w.admin).get("/api/admin/audit", {"actorId": "abc"}), 400, "INVALID_QUERY_PARAM"),
    ("sin sesión", "/api/instructor/attempts", "GET", lambda w: APIClient().get("/api/instructor/attempts"),
     401, "UNAUTHENTICATED"),
    ("sin permiso", "/api/instructor/attempts", "GET", lambda w: cl(w.student).get("/api/instructor/attempts"),
     403, "FORBIDDEN"),
    ("estado desconocido", "/api/instructor/attempts", "GET",
     lambda w: cl(w.profesor).get("/api/instructor/attempts", {"estado": "NOEXISTE"}), 400, "INVALID_QUERY_PARAM"),
    ("grupo inexistente", "/api/instructor/attempts", "GET",
     lambda w: cl(w.profesor).get("/api/instructor/attempts", {"grupoId": 999999}), 404, "NOT_FOUND"),
    ("sin sesión", WORLD_STATE, "PATCH",
     lambda w: APIClient().patch(f"/api/simulation/attempts/{w.attempt_id}/world-state", {}, format="json"),
     401, "UNAUTHENTICATED"),
    ("sin permiso", WORLD_STATE, "PATCH",
     lambda w: cl(w.profesor).patch(f"/api/simulation/attempts/{w.attempt_id}/world-state", {}, format="json"),
     403, "FORBIDDEN"),
    ("posición fuera del mapa", WORLD_STATE, "PATCH", lambda w: _patch_position(w, x=5000), 400, "VALIDATION_ERROR"),
    ("intento inexistente", WORLD_STATE, "PATCH",
     lambda w: cl(w.student).patch(
         f"/api/simulation/attempts/{uuid.uuid4()}/world-state",
         {"attemptToken": w.token, "playerX": 1, "playerY": 1, "currentMapKey": w.map_key}, format="json"),
     404, "NOT_FOUND"),
]


@pytest.mark.parametrize(
    ("path", "method", "call", "status", "code"),
    [pytest.param(e[1], e[2], e[3], e[4], e[5], id=f"{e[0]} · {e[2]} {e[1]}") for e in ERRORS],
)
def test_los_errores_reales_son_el_sobre_de_error_que_el_documento_declara(
    path, method, call, status, code, document, world
):
    response = call(world)

    assert response.status_code == status, response.content
    body = response.json()
    assert body["success"] is False and body["code"] == code
    declared = document["paths"][path][method.lower()]["responses"]
    assert str(status) in declared, f"{method} {path} no documenta su respuesta {status}"
    assert_matches(body, declared[str(status)]["content"]["application/json"]["schema"], document)
    assert_matches(body, {"$ref": "#/components/schemas/ErrorEnvelope"}, document)


def test_cada_error_que_un_contrato_tipado_documenta_tiene_su_caso(document):
    """Documentar un 404 sin probarlo es prometer sin evidencia: lo documentado y lo probado son lo mismo."""
    tested: dict[tuple[str, str], set[int]] = {}
    for _what, path, method, _call, status, _code in ERRORS:
        tested.setdefault((path, method), set()).add(status)
    for path, method in CALLS:
        declared = {int(code) for code in document["paths"][path][method.lower()]["responses"] if not code.startswith("2")}
        assert declared == tested.get((path, method), set()), (
            f"{method} {path}: el documento declara {sorted(declared)} y la prueba cubre "
            f"{sorted(tested.get((path, method), set()))}"
        )
