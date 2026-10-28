"""E5-9 (reparación) · El documento OpenAPI dice lo que el servidor responde, y se prueba contra el servidor.

El esquema que E5 publicó prometía ``status`` donde el servidor responde ``success``, envolvía en una lista lo que
es un objeto y describía campos que ninguna respuesta trae (``studentId``, ``createdAt``, ``playerX``…). Aquí cada
contrato tipado se prueba contra la respuesta REAL del endpoint: lo que recibe el cliente tiene que ser lo que el
documento dice, clave por clave y tipo por tipo (``shared.contract_testing``). Tipar un endpoint nuevo sin darle
su caso en ``CALLS`` hace fallar la prueba del registro, la de ``test_openapi_contract`` impide que el número de
contratos tipados baje y cada error que un contrato documenta tiene que tener su caso en ``ERRORS``.
"""
import copy
import json
import re
import uuid
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Callable

import pytest
from django.conf import settings as django_settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from drf_spectacular.generators import SchemaGenerator
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, GrupoEstudiante, MembershipStatus
from apps.simulation.models import (
    AttemptFeedback,
    AttemptHintView,
    AuditLog,
    CaseCharacter,
    CaseReview,
    CaseVersion,
    Rubric,
    SceneHint,
    SceneMap,
    SimulationAttempt,
    SimulationNode,
)
from apps.simulation.services.authoring import definition_io, lifecycle
from apps.simulation.tests import dsl_support
from apps.simulation.tests.analytics_support import make_student, seed_student_pair
from apps.simulation.services.ai_providers import ProviderError
from apps.simulation.views.ai_assistant import AIAssistantView
from shared import contract_testing
from shared.contract_testing import (
    declared_properties,
    declared_response_schemas,
    exercised_properties,
    response_schema,
    typed_operations,
)

from .test_instructor import assign_case_to_student, cl

pytestmark = pytest.mark.req("RNF-07")

User = get_user_model()
ATTEMPT_HEADER = "HTTP_X_SIEP_ATTEMPT_TOKEN"

#: Las ``Componente.propiedad`` que las respuestas reales de este módulo han mostrado (lo llena ``assert_matches``).
SEEN: set[str] = set()
#: Los contratos del registro que ya se probaron: la guardia de propiedades solo vale con todos.
CASES_RUN: set[tuple[str, str]] = set()


def assert_matches(data, schema, document, **options):
    """``contract_testing.assert_matches`` y, además, apunta qué propiedades declaradas vio esta respuesta."""
    contract_testing.assert_matches(data, schema, document, **options)
    SEEN.update(exercised_properties(data, schema, document))
ROUTE_FAMILIES = ("/api/admin/cases", "/api/authoring/cases")  # la misma vista con dos prefijos
WORLD_STATE = "/api/simulation/attempts/{attempt_id}/world-state"
ATTEMPT = "/api/simulation/attempts/{attempt_id}"
HINTS = "/api/simulation/attempts/{attempt_id}/hints"
FEEDBACK = "/api/simulation/attempts/{attempt_id}/feedback"
ANALYTICS = "/api/reportes/analiticas"

HINTS_NEXT = "/api/simulation/attempts/{attempt_id}/hints/next"
BRIEF = "/api/simulation/cases/{case_version_id}/brief"
CONSENT = "/api/simulation/cases/{case_version_id}/consent"
STUDENT_REPORT = "/api/reportes/estudiante/{estudiante_id}"
INVITATIONS = "/api/me/invitations"


def invitation_path(action):
    """La ruta del documento con que se responde una invitación (``accept``, ``decline`` o ``leave``)."""
    return f"/api/me/invitations/{{group_id}}/{action}"


@dataclass
class World:
    """Datos reales sobre los que se llama a cada endpoint: intentos, auditoría, asignaciones, pistas, un borrador."""

    admin: object
    profesor: object
    student: object
    outsider: object  # un estudiante sin ningún caso asignado
    attempt_id: str
    token: str
    map_key: str
    x: int
    y: int
    version_id: int  # la versión publicada que se sembró
    draft_id: int  # un borrador vacío, con hallazgos de validación
    grupo_id: int  # el grupo de la docente al que pertenece el estudiante
    free_student: object  # un estudiante con el caso asignado y sin ningún intento
    invited: object  # un estudiante con la invitación al grupo pendiente de respuesta (``INVITED``)


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
    outsider = make(email="fuera_contrato@x.com", password="x", nombre="Fue", apellido="Ra", role="ESTUDIANTE")
    grupo = assign_case_to_student(student, version.id, "CONTRATO", profesor=profesor)
    free_student = make(email="libre_contrato@x.com", password="x", nombre="Li", apellido="Bre", role="ESTUDIANTE")
    CaseCharacter.objects.create(
        case_version=version, character_key="madre-contrato", display_name="Marta", role_label="Madre",
        portrait_key="madre-1", show_in_brief=True,
    )
    CaseAssignment.objects.create(case_version=version, estudiante=free_student, assigned_by=admin)
    invited = make(email="invitado_contrato@x.com", password="x", nombre="In", apellido="Vitado", role="ESTUDIANTE")
    GrupoEstudiante.objects.create(
        grupo=grupo, estudiante=invited, status=MembershipStatus.INVITED, invited_by=profesor, invited_at=timezone.now()
    )

    client = cl(student)
    started = client.post("/api/simulation/attempts", {"caseVersionId": version.id}, format="json").data["data"]
    attempt_id, token = started["attemptId"], started["attemptToken"]
    scene = client.get(f"/api/simulation/attempts/{attempt_id}/world", **{ATTEMPT_HEADER: token}).data["data"]

    # Un intento terminado (``endedAt`` con valor, lo que el abierto no tiene).
    SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex, student=student, case_version=version,
        current_node=SimulationNode.objects.filter(case_version=version, start_node=True).first(),
        status="COMPLETED", active_seconds=300.4, ended_at=timezone.now(),
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
    # Asignaciones: la del grupo con ventana abierta y una directa al estudiante ya cerrada (otro destino y estado).
    now = timezone.now()
    CaseAssignment.objects.filter(grupo=grupo, case_version=version).update(
        opens_at=now - timedelta(days=1), closes_at=now + timedelta(days=1)
    )
    CaseAssignment.objects.create(
        case_version=version, estudiante=student, opens_at=now - timedelta(days=9), closes_at=now - timedelta(days=8),
        sort_order=1, assigned_by=admin,
    )
    # Dos pistas en la sala del jugador, una ya pedida: el estado trae ``shown`` y ``available``.
    for order, text in enumerate(("Mira a tu alrededor.", "Habla con la familia."), start=1):
        SceneHint.objects.create(scene_map_id=scene["map"]["id"], hint_order=order, text=text)
    client.post(
        f"/api/simulation/attempts/{attempt_id}/hints/next", {"attemptToken": token, "requestId": "contrato-1"},
        format="json",
    )
    cl(admin).post("/api/admin/cases", {"title": "Caso de contrato"}, format="json")
    draft = CaseVersion.objects.get(simulation_case__title="Caso de contrato")
    SceneMap.objects.filter(case_version=draft).update(spawn_x=99999)  # un hallazgo del mundo que apunta a su mapa
    return World(
        admin, profesor, student, outsider, attempt_id, token, scene["map"]["key"], scene["player"]["x"],
        scene["player"]["y"], version.id, draft.id, grupo.id, free_student, invited,
    )


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


def _post_document(user, path, document):
    body = document if isinstance(document, bytes) else json.dumps(document, ensure_ascii=False).encode("utf-8")
    return cl(user).generic("POST", path, data=body, content_type="application/json")


def _import_seeded_copy(world, prefix, code="COPIA-CONTRATO"):
    document = definition_io.export_definition(world.version_id)
    document["caso"]["id"] = code
    return _post_document(world.admin, f"{prefix}/import", document)


def _workshop_document(code="TALLER-CONTRATO"):
    """El primer escenario válido del taller, sin ``ejecucion``: al importarlo el servidor avisa de lo que no guarda."""
    _, _, document = next(s for s in dsl_support.scenarios() if s[1] == "valido")
    document = copy.deepcopy(document)
    document.pop("ejecucion", None)
    document["caso"]["id"] = code
    return document


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


@calls(WORLD_STATE, "PATCH")
def _world_patch_ack(world):
    return _patch_position(world)


@calls("/api/assignments", "GET")
def _assignments(world):
    return cl(world.admin).get("/api/assignments")


def _new_assignment(world, **changes):
    body = {
        "caseVersionId": world.version_id, "target": {"type": "GROUP", "groupId": world.grupo_id}, "sortOrder": 3,
        "opensAt": "2026-10-20T08:00:00-05:00", **changes,
    }
    return cl(world.profesor).post("/api/assignments", body, format="json")


@calls("/api/assignments", "POST", 201)
def _assignment_created(world):
    CaseAssignment.objects.filter(grupo_id=world.grupo_id, case_version_id=world.version_id).delete()
    return _new_assignment(world)


@calls(BRIEF, "GET")
def _brief(world):
    return cl(world.student).get(f"/api/simulation/cases/{world.version_id}/brief")


@calls(ATTEMPT, "GET")
def _attempt_state(world):
    return cl(world.student).get(f"/api/simulation/attempts/{world.attempt_id}", **{ATTEMPT_HEADER: world.token})


@calls(HINTS, "GET")
def _hints(world):
    return cl(world.student).get(f"/api/simulation/attempts/{world.attempt_id}/hints", **{ATTEMPT_HEADER: world.token})


def _completed_attempt_id(world):
    """El intento terminado del estudiante del mundo (el que ``world`` crea con ``endedAt``): el que se encuesta."""
    return SimulationAttempt.objects.get(student=world.student, status="COMPLETED").pk


def _feedback_url(world):
    return f"/api/simulation/attempts/{_completed_attempt_id(world)}/feedback"


def _survey_on(call):
    """Ejecuta la llamada con la encuesta encendida (lo normal es apagada: el 404 de «no existe»)."""
    with override_settings(ATTEMPT_FEEDBACK_SURVEY=True):
        return call()


@calls(FEEDBACK, "GET")
def _survey_state(world):
    """Ya respondida: trae las cuatro propiedades (sin responder solo trae ``submitted``, en su propia prueba)."""
    AttemptFeedback.objects.create(
        attempt_id=_completed_attempt_id(world), rating=4, comment="Me ayudó a ordenar lo que viví."
    )
    return _survey_on(lambda: cl(world.student).get(_feedback_url(world)))


@calls(FEEDBACK, "POST", 201)
def _survey_answered(world):
    body = {"rating": 4, "comment": "Me ayudó a ordenar lo que viví."}
    return _survey_on(lambda: cl(world.student).post(_feedback_url(world), body, format="json"))


def _analytics_cohort(world):
    """Cinco estudiantes con dos intentos cerrados, evaluados, con el evento y la encuesta, en el grupo de la docente.

    Con ellos la analítica muestra TODOS sus bloques (el que falta es un bloque que ninguna respuesta real probaría).
    """
    version = CaseVersion.objects.get(pk=world.version_id)
    rubric = Rubric.objects.create(case_version=version, name="Rúbrica de contrato", active=True, created_by=world.admin)
    first = {"levels": ("EN_INICIO", "EN_PROCESO"), "non_recommended": 4, "covered": False, "key": False}
    second = {"levels": ("LOGRADO", "LOGRADO"), "non_recommended": 2, "covered": True, "key": True,
              "milestones_done": ("riesgo_valorado",)}
    for index in range(5):
        who = make_student(f"ctr{index}")
        GrupoEstudiante.objects.create(grupo_id=world.grupo_id, estudiante=who, status=MembershipStatus.ACTIVE)
        seed_student_pair(who, version, rubric, world.profesor, first=first, second=second, rating=4)


@calls(ANALYTICS, "GET")
def _analytics(world):
    _analytics_cohort(world)
    return _survey_on(lambda: cl(world.profesor).get(ANALYTICS, {"grupoId": world.grupo_id}))


def _answer_twice(world):
    client = cl(world.student)
    _survey_on(lambda: client.post(_feedback_url(world), {"rating": 4}, format="json"))
    return _survey_on(lambda: client.post(_feedback_url(world), {"rating": 5}, format="json"))

def _consent_url(world, version_id=None):
    return f"/api/simulation/cases/{world.version_id if version_id is None else version_id}/consent"


def _accept_consent(world):
    return cl(world.student).post(
        _consent_url(world), {"noticeVersion": django_settings.SIEP_CONTENT_NOTICE_VERSION}, format="json"
    )


@calls(CONSENT, "GET")
def _consent_state(world):
    return cl(world.student).get(_consent_url(world))


@calls(CONSENT, "POST", 201)
def _consent_accepted(world):
    return _accept_consent(world)


@calls(CONSENT, "DELETE")
def _consent_withdrawn(world):
    _accept_consent(world)  # algo vigente que retirar: así la fecha del retiro llega con valor
    return cl(world.student).delete(_consent_url(world))


def _next_hint(world, client=None, **body):
    body = {"attemptToken": world.token, "requestId": "contrato-2", **body}
    return (client or cl(world.student)).post(
        f"/api/simulation/attempts/{world.attempt_id}/hints/next", body, format="json"
    )


calls(HINTS_NEXT, "POST")(_next_hint)


@calls(STUDENT_REPORT, "GET")
def _student_report(world):
    return cl(world.profesor).get(f"/api/reportes/estudiante/{world.student.id}")


@calls(INVITATIONS, "GET")
def _my_invitations(world):
    return cl(world.invited).get("/api/me/invitations")


def _answer_invitation(world, action, who):
    return cl(getattr(world, who)).post(f"/api/me/invitations/{world.grupo_id}/{action}", {}, format="json")


for _action, _who in (("accept", "invited"), ("decline", "invited"), ("leave", "student")):
    calls(invitation_path(_action), "POST")(lambda world, _action=_action, _who=_who: _answer_invitation(world, _action, _who))


@calls("/api/health", "GET")
def _health(world):
    return APIClient().get("/api/health")


def _register_case_routes(prefix):
    calls(f"{prefix}/{{case_version_id}}/validate", "POST")(
        lambda world: cl(world.admin).post(f"{prefix}/{world.draft_id}/validate", {}, format="json")
    )
    calls(f"{prefix}/{{case_version_id}}/definition", "GET")(
        lambda world: cl(world.admin).get(f"{prefix}/{world.version_id}/definition")
    )
    calls(f"{prefix}/import", "POST", 201)(lambda world: _import_seeded_copy(world, prefix))
    calls(f"{prefix}/{{case_version_id}}/lifecycle", "GET")(
        lambda world: cl(world.admin).get(f"{prefix}/{world.draft_id}/lifecycle")
    )
    # «Volver a borrador» es clonar: responde el ciclo de la versión NUEVA (REGLA-005).
    calls(f"{prefix}/{{case_version_id}}/lifecycle", "POST")(
        lambda world: cl(world.admin).post(f"{prefix}/{world.version_id}/lifecycle", {"action": "clone"}, format="json")
    )


def _assistant_call(world, prefix, route, body=None):
    """Una ruta del asistente de autoría con la bandera encendida y el proveedor simulado (P5)."""
    from unittest import mock

    from apps.simulation.services.authoring.assistant import guide, proposals

    simulated = {
        "mensaje": "Propuesta simulada", "cambios": [{"op": "set-intensity", "nodeId": 1}], "modo": "connected",
        "model": "claude-opus-5-5", "changes": 1,
    }
    guided = {"accionId": "mapa.agregar-sala", "modo": "foco", "mensaje": "Aquí.", "model": "claude-haiku-5-5", "changes": 0}
    url = f"{prefix}/{world.draft_id}/assistant/{route}"
    with override_settings(AI_AUTHORING_ENABLED=True, AI_AUTHORING_API_KEY="clave-de-prueba"),             mock.patch.object(proposals, "propose", return_value=simulated),             mock.patch.object(guide, "answer", return_value=guided):
        client = cl(world.admin)
        return client.get(url) if body is None else client.post(url, body, format="json")


for _prefix in ROUTE_FAMILIES:
    _register_case_routes(_prefix)
    calls(f"{_prefix}/{{case_version_id}}/assistant/status", "GET")(
        lambda world, _prefix=_prefix: _assistant_call(world, _prefix, "status")
    )
    calls(f"{_prefix}/{{case_version_id}}/assistant/propose", "POST")(
        lambda world, _prefix=_prefix: _assistant_call(world, _prefix, "propose", {"peticion": "x", "pantalla": "mapa"})
    )
    calls(f"{_prefix}/{{case_version_id}}/assistant/guide", "POST")(
        lambda world, _prefix=_prefix: _assistant_call(world, _prefix, "guide", {"pregunta": "x", "acciones": []})
    )


#: Claves que la respuesta real trae y el documento NO publica a propósito (una credencial no se declara en el esquema:
#: ``test_openapi_schema_never_exposes_prohibited_fields``). La prueba las exige presentes y las quita antes de comparar.
UNDECLARED_ON_PURPOSE: dict[tuple[str, str], set[str]] = {(ATTEMPT, "GET"): {"attemptToken"}}


@pytest.mark.parametrize(("path", "method"), sorted(CALLS))
def test_la_respuesta_real_coincide_con_el_esquema_del_documento(path, method, document, world):
    call, status = CALLS[(path, method)]

    response = call(world)

    assert response.status_code == status, response.content
    CASES_RUN.add((path, method))
    body = response.json()
    assert body["success"] is True and set(body) <= {"success", "message", "data"}  # el sobre real
    for clave in UNDECLARED_ON_PURPOSE.get((path, method), ()):
        assert body["data"].pop(clave)
    assert_matches(body, response_schema(document, path, method, str(status)), document)


def test_todo_contrato_tipado_tiene_su_caso_contra_el_servidor(document):
    assert typed_operations(document) == set(CALLS), (
        "Los contratos tipados del documento y los casos que se prueban contra el servidor deben ser los mismos"
    )


# ─── Los casos del registro solo prueban lo que hay: aquí se exige que haya de todas las clases ─────────────
def test_el_listado_de_auditoria_trae_filas_con_y_sin_los_campos_opcionales(world):
    items = _audit(world).json()["data"]["items"]

    assert any(i["actorId"] is not None and i["ipAddress"] and i["resourceType"] for i in items)
    assert any(i["actorId"] is None and i["ipAddress"] is None and i["resourceType"] is None for i in items)


def test_el_listado_de_revision_trae_intentos_abiertos_y_terminados(world):
    items = _instructor_attempts(world).json()["data"]["items"]

    assert {i["endedAt"] is None for i in items} == {True, False}


def test_con_la_sala_vieja_el_patch_responde_un_superconjunto_del_acuse(document, world):
    """Si la sala del cliente ya no es la actual, el servidor devuelve el mundo completo: las claves del acuse y más."""
    response = _patch_position(world, map_key="sala-que-ya-no-es")

    assert response.status_code == 200
    body = response.json()
    assert {"objects", "collisions"} <= set(body["data"])
    assert_matches(body, response_schema(document, WORLD_STATE, "PATCH"), document, allow_extra=True)


def test_las_asignaciones_traen_los_dos_destinos_y_estados_distintos(world):
    rows = _assignments(world).json()["data"]

    assert {r["target"]["type"] for r in rows} == {"GROUP", "STUDENT"}
    assert {r["state"] for r in rows} == {"OPEN", "CLOSED"}
    assert any("opensAt" in r and "closesAt" in r for r in rows)


def test_aceptar_el_aviso_otra_vez_documenta_su_200_y_coincide(document, world):
    """El primer POST crea (201) y el reenvío idempotente responde 200 con la misma forma."""
    _accept_consent(world)

    response = _accept_consent(world)

    assert response.status_code == 200
    declared = document["paths"][CONSENT]["post"]["responses"]
    assert {"200", "201"} <= set(declared)
    assert_matches(response.json(), response_schema(document, CONSENT, "POST", "200"), document)


def _afirmar_estado_del_intento(body, document):
    """Coincide con el documento; la única clave de más es ``attemptToken``, la credencial que el documento no publica."""
    assert body["data"]["attemptToken"]
    sin_credencial = copy.deepcopy(body)
    del sin_credencial["data"]["attemptToken"]
    assert_matches(sin_credencial, response_schema(document, ATTEMPT, "GET"), document)


def test_el_estado_del_intento_trae_la_persona_y_la_intensidad_y_coincide_con_el_documento(document, world):
    body = _attempt_state(world).json()

    assert set(body["data"]["persona"]) == {"bond", "activation", "label"}
    assert body["data"]["currentNode"]["intensity"] in {"LOW", "MEDIUM", "HIGH"}
    assert body["data"]["completionReport"] is None
    _afirmar_estado_del_intento(body, document)


def test_el_estado_de_un_intento_completado_trae_el_informe_congelado_y_coincide_con_el_documento(document, world):
    from apps.simulation.services import attempt_report

    completo = SimulationAttempt.objects.get(student=world.student, status="COMPLETED")
    # Sin token en claro: el estado se pide con el del intento abierto, así que se completa ese mismo.
    abierto = SimulationAttempt.objects.get(pk=world.attempt_id)
    abierto.status = "COMPLETED"
    abierto.save(update_fields=["status"])
    attempt_report.freeze_report(abierto)

    body = _attempt_state(world).json()

    assert completo.pk != abierto.pk
    assert body["data"]["completionReport"]["schemaVersion"] == 3
    _afirmar_estado_del_intento(body, document)


def test_las_pistas_traen_la_pedida_y_las_que_quedan(world):
    data = _hints(world).json()["data"]

    assert len(data["shown"]) == 1 and data["available"] == 1 and "reason" not in data


@pytest.mark.parametrize("hints", [0, 1], ids=["sin pistas en la escena", "todas pedidas"])
def test_las_pistas_dicen_por_que_no_hay_mas(hints, document, world):
    SceneHint.objects.all().delete()
    for order in range(hints):
        hint = SceneHint.objects.create(scene_map_id=_current_map_id(world), hint_order=order + 1, text="Una pista.")
        AttemptHintView.objects.create(attempt_id=world.attempt_id, hint=hint)

    body = _hints(world).json()

    assert body["data"]["reason"] == ("ALL_SHOWN" if hints else "NONE_FOR_SCENE")
    assert_matches(body, response_schema(document, HINTS, "GET"), document)


def _current_map_id(world):
    scene = cl(world.student).get(f"/api/simulation/attempts/{world.attempt_id}/world", **{ATTEMPT_HEADER: world.token})
    return scene.json()["data"]["map"]["id"]


def test_la_encuesta_sin_responder_es_solo_submitted_false_y_coincide_con_el_documento(document, world):
    body = _survey_on(lambda: cl(world.student).get(_feedback_url(world))).json()

    assert body["data"] == {"submitted": False}
    assert_matches(body, response_schema(document, FEEDBACK, "GET"), document)


def test_responder_la_encuesta_devuelve_lo_guardado_y_lo_que_la_consulta_repite(document, world):
    """El 201 y el GET que le sigue son la misma forma con los mismos valores (el cliente pinta lo que guardó)."""
    body = {"rating": 5, "comment": "  Me dio claridad.  "}
    posted = _survey_on(lambda: cl(world.student).post(_feedback_url(world), body, format="json"))
    read = _survey_on(lambda: cl(world.student).get(_feedback_url(world)))

    assert posted.status_code == 201 and read.status_code == 200
    assert posted.json()["data"] == read.json()["data"]
    assert posted.json()["data"]["comment"] == "Me dio claridad."
    assert_matches(posted.json(), response_schema(document, FEEDBACK, "POST", "201"), document)


def test_la_ficha_de_un_caso_cerrado_dice_por_que_y_trae_su_ventana(document, world):
    """Un intento abierto se deja terminar aunque la ventana cierre: la ficha cerrada es de quien no tiene intento."""
    late = User.objects.create_user(
        email="tarde_contrato@x.com", password="x", nombre="Tar", apellido="De", role="ESTUDIANTE"
    )
    CaseAssignment.objects.create(
        case_version_id=world.version_id, estudiante=late, assigned_by=world.admin,
        opens_at=timezone.now() - timedelta(days=9), closes_at=timezone.now() - timedelta(days=8),
    )

    body = cl(late).get(f"/api/simulation/cases/{world.version_id}/brief").json()

    assert body["data"]["access"]["allowed"] is False and body["data"]["access"]["reason"] == "CLOSED"
    assert {"opensAt", "closesAt"} <= set(body["data"]["access"])
    assert_matches(body, response_schema(document, BRIEF, "GET"), document)


def test_la_validacion_de_un_borrador_vacio_trae_hallazgos(world):
    data = cl(world.admin).post(f"/api/admin/cases/{world.draft_id}/validate", {}, format="json").json()["data"]

    assert data["issues"] and data["canPublish"] is False
    assert {i["severity"] for i in data["issues"]} <= {"error", "warning"}


@pytest.mark.parametrize("prefix", ROUTE_FAMILIES)
def test_el_ciclo_de_vida_trae_la_ultima_revision_con_y_sin_constancia_de_contenido(prefix, document, world):
    path = f"{prefix}/{{case_version_id}}/lifecycle"
    returned = cl(world.admin).get(f"{prefix}/{world.version_id}/lifecycle").json()
    review = returned["data"]["review"]
    assert review["decision"] == "REJECTED" and review["reason"] == "CONTENIDO" and "contentReview" not in review
    assert_matches(returned, response_schema(document, path, "GET"), document)

    CaseReview.objects.create(
        case_version_id=world.version_id, requested_by=world.admin, decided_by=world.admin, decision="APPROVED",
        decided_at=timezone.now(), note="Cumple.", content_reviewer="Dra. Ruiz",
        content_reviewed_on=timezone.now().date(), content_reference="Acta 4",
    )
    approved = cl(world.admin).get(f"{prefix}/{world.version_id}/lifecycle").json()
    assert approved["data"]["review"]["contentReview"]["reference"] == "Acta 4"
    assert_matches(approved, response_schema(document, path, "GET"), document)


def test_las_acciones_del_ciclo_de_vida_que_el_documento_lista_son_las_del_servicio():
    """La lista del documento es una copia (el módulo de formas no importa servicios): si una acción nace, se enteran."""
    from apps.simulation.serializers.contracts import LIFECYCLE_ACTIONS

    assert LIFECYCLE_ACTIONS == lifecycle.ACTIONS


def test_el_reporte_de_un_estudiante_trae_intentos_abiertos_y_terminados(world):
    attempts = _student_report(world).json()["data"]["attempts"]

    assert {a["clockSeconds"] is None for a in attempts} == {True, False}
    assert sorted(a["ordinal"] for a in attempts) == [1, 2]


def test_las_invitaciones_traen_la_pendiente_y_la_membresia_sin_fecha_de_invitacion(document, world):
    """Las membresías anteriores a las invitaciones no tienen fecha de invitación: ``invitedAt`` es nulo."""
    pending = cl(world.invited).get(INVITATIONS).json()
    member = cl(world.student).get(INVITATIONS).json()

    assert [(r["status"], r["invitedAt"] is not None) for r in pending["data"]] == [("INVITED", True)]
    assert [(r["status"], r["invitedAt"]) for r in member["data"]] == [("ACTIVE", None)]
    for body in (pending, member):
        assert_matches(body, response_schema(document, INVITATIONS, "GET"), document)


@pytest.mark.parametrize("sealed", [False, True], ids=["borrador sin sello", "publicada con sello"])
def test_la_definicion_de_una_version_trae_todos_sus_campos_con_y_sin_sello(sealed, document, world):
    version_id = world.version_id if sealed else world.draft_id
    if sealed:
        CaseVersion.objects.filter(pk=version_id).update(
            definition_hash="sha256:" + "a" * 64, validated_at=timezone.now(), reuse_ratio=Decimal("0.5")
        )

    body = cl(world.admin).get(f"/api/admin/cases/{version_id}/definition").json()

    data = body["data"]
    assert all(data[key] is not None for key in ("sealedHash", "validatedAt", "reuseRatio")) is sealed
    assert (data["sealedHash"] is None) is not sealed
    assert_matches(body, response_schema(document, "/api/admin/cases/{case_version_id}/definition", "GET"), document)


def test_una_importacion_con_avisos_trae_los_hallazgos(document, world):
    response = _post_document(world.admin, "/api/admin/cases/import", _workshop_document())

    assert response.status_code == 201, response.content
    body = response.json()
    assert body["data"]["issues"], "el documento del taller debería dejar avisos al importarse"
    assert_matches(body, response_schema(document, "/api/admin/cases/import", "POST", "201"), document)


def test_el_estado_de_salud_degradado_es_el_sobre_que_el_documento_declara(document, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("la base de datos no responde")

    monkeypatch.setattr("shared.health.connection.cursor", broken)

    response = APIClient().get("/api/health")

    assert response.status_code == 503
    assert_matches(response.json(), response_schema(document, "/api/health", "GET", "503"), document)


def test_un_endpoint_sin_tipar_se_documenta_con_el_sobre_generico_y_coincide(document, world):
    """El sobre genérico es un objeto ``{success, message?, data?}``, no una lista de sobres."""
    schema = response_schema(document, "/api/grupos", "GET")

    assert schema == {"$ref": "#/components/schemas/ApiEnvelope"}
    assert_matches(cl(world.profesor).get("/api/grupos").json(), schema, document)


# ─── Lo que el servidor responde y NO es un 200 con el sobre JSON: el documento lo dice como es ──────────
#: POST que crean y responden 201 con el sobre genérico (el documento decía 200).
CREATED = [
    ("grupo", "/api/grupos", lambda w: cl(w.profesor).post("/api/grupos", {"nombre": "Grupo nuevo", "codigo": "NUEVO1"}, format="json")),
    ("competencia", "/api/competencies", lambda w: cl(w.admin).post("/api/competencies", {"code": "CTR", "name": "Competencia de contrato"}, format="json")),
    ("rúbrica", "/api/rubrics", lambda w: cl(w.admin).post("/api/rubrics/", {
        "name": "Rúbrica de contrato", "description": "D", "version": "1.0", "active": False,
        "criteria": [{"title": "Uno", "description": "A", "weight": 100, "displayOrder": 1, "active": True}],
    }, format="json")),
    ("solicitud de acceso", "/api/auth/access-request", lambda w: APIClient().post(
        "/api/auth/access-request", {"nombre": "Ana", "apellido": "Gil", "email": "ana.contrato@psychosim.edu.co"}, format="json")),
]


@pytest.mark.parametrize(("path", "call"), [pytest.param(path, call, id=what) for what, path, call in CREATED])
def test_una_operacion_que_crea_documenta_su_201_y_no_un_200(path, call, document, world):
    response = call(world)

    assert response.status_code == 201, response.content
    declared = document["paths"][path]["post"]["responses"]
    assert "201" in declared and "200" not in declared, f"POST {path} responde 201 y el documento declara {sorted(declared)}"
    assert_matches(response.json(), response_schema(document, path, "POST", "201"), document)


#: Respuestas que no son el sobre JSON: (nombre, ruta del documento, método, llamada real, estado, tipo de contenido).
NOT_JSON_ENVELOPE = [
    ("plantilla de estudiantes", "/api/grupos/estudiantes/import/template", "GET",
     lambda w: cl(w.profesor).get("/api/grupos/estudiantes/import/template"), 200,
     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ("reporte del grupo en CSV", "/api/reportes/grupo/{grupo_id}/export", "GET",
     lambda w: cl(w.profesor).get(f"/api/reportes/grupo/{w.grupo_id}/export"), 200, "text/csv"),
    ("sin intento abierto", "/api/simulation/cases/{case_version_id}/active-attempt", "GET",
     lambda w: cl(w.free_student).get(f"/api/simulation/cases/{w.version_id}/active-attempt"), 204, None),
]


@pytest.mark.parametrize(
    ("path", "method", "call", "status", "media"),
    [pytest.param(path, method, call, status, media, id=what) for what, path, method, call, status, media in NOT_JSON_ENVELOPE],
)
def test_lo_que_no_es_el_sobre_json_dice_en_el_documento_como_es(path, method, call, status, media, document, world):
    response = call(world)

    assert response.status_code == status, response.content
    declared = document["paths"][path][method.lower()]["responses"]
    assert str(status) in declared, f"{method} {path} responde {status} y el documento declara {sorted(declared)}"
    content = declared[str(status)].get("content", {})
    if media is None:
        assert content == {}, "una respuesta sin cuerpo no declara contenido"
    else:
        assert response["Content-Type"].split(";")[0] == media
        assert set(content) == {media}, f"{path} responde {media} y el documento declara {sorted(content)}"


def test_con_un_intento_abierto_la_consulta_del_intento_activo_sigue_siendo_el_sobre(document, world):
    response = cl(world.student).get(f"/api/simulation/cases/{world.version_id}/active-attempt")

    assert response.status_code == 200
    declared = document["paths"]["/api/simulation/cases/{case_version_id}/active-attempt"]["get"]["responses"]
    assert_matches(response.json(), declared["200"]["content"]["application/json"]["schema"], document)


def test_el_asistente_de_ia_responde_su_propio_objeto_y_no_el_sobre(document, world, settings, monkeypatch):
    settings.AI_ASSISTANT_ENABLED = True
    monkeypatch.setattr(AIAssistantView, "_call_llm", lambda self, question, context: "¿Qué observas?")

    response = cl(world.student).post(
        "/api/simulation/ai-assistant", {"attempt_id": world.attempt_id, "question": "¿Qué hago?"}, format="json"
    )

    assert response.status_code == 200 and response.json() == {"response": "¿Qué observas?"}
    assert_matches(response.json(), response_schema(document, "/api/simulation/ai-assistant", "POST"), document)


def test_el_asistente_apagado_responde_el_sobre_de_error_que_el_documento_declara(document, world, settings):
    settings.AI_ASSISTANT_ENABLED = False

    response = cl(world.student).post(
        "/api/simulation/ai-assistant", {"attempt_id": world.attempt_id, "question": "x"}, format="json"
    )

    declared = document["paths"]["/api/simulation/ai-assistant"]["post"]["responses"]
    assert response.status_code == 404 and "404" in declared
    assert_matches(response.json(), declared["404"]["content"]["application/json"]["schema"], document)


# ─── Errores: cada uno que un contrato tipado documenta tiene su caso ─────────────────────────────────────
def _transition(prefix, who, version, body):
    """``POST …/lifecycle`` de ``who`` (``world.<who>``) sobre la versión ``version`` (``world.<version>``).

    Manda la revisión vigente de la versión: con ``REVISION_REQUIRED`` encendida un cuerpo sin ella es un 400 antes de
    llegar al motivo que cada fila de ``ERRORS`` prueba, y estas pruebas valen con la bandera en cualquier valor.
    """
    def call(w):
        version_id = getattr(w, version)
        revision = CaseVersion.objects.get(pk=version_id).version
        return cl(getattr(w, who)).post(
            f"{prefix}/{version_id}/lifecycle", {**body, "revision": revision}, format="json"
        )

    return call


def _stale_submit(prefix):
    """Enviar a revisión con una revisión que el servidor ya superó (otra sesión editó después)."""
    def call(w):
        current = CaseVersion.objects.get(pk=w.draft_id).version
        return cl(w.admin).post(
            f"{prefix}/{w.draft_id}/lifecycle", {"action": "submit", "revision": current + 7}, format="json"
        )

    return call


def _case_route_errors(prefix):
    validate, definition, import_, lifecycle = (
        f"{prefix}/{{case_version_id}}/validate", f"{prefix}/{{case_version_id}}/definition", f"{prefix}/import",
        f"{prefix}/{{case_version_id}}/lifecycle",
    )
    return [
        ("ciclo de vida sin sesión", lifecycle, "GET", lambda w: APIClient().get(f"{prefix}/{w.draft_id}/lifecycle"),
         401, "UNAUTHENTICATED"),
        ("ciclo de vida sin permiso", lifecycle, "GET", lambda w: cl(w.student).get(f"{prefix}/{w.draft_id}/lifecycle"),
         403, "FORBIDDEN"),
        ("ciclo de vida de una versión inexistente", lifecycle, "GET",
         lambda w: cl(w.admin).get(f"{prefix}/999999/lifecycle"), 404, "NOT_FOUND"),
        ("transición sin sesión", lifecycle, "POST",
         lambda w: APIClient().post(f"{prefix}/{w.draft_id}/lifecycle", {"action": "submit"}, format="json"),
         401, "UNAUTHENTICATED"),
        ("transición sin permiso", lifecycle, "POST", _transition(prefix, "student", "draft_id", {"action": "submit"}),
         403, "FORBIDDEN"),
        ("transición de una versión inexistente", lifecycle, "POST",
         lambda w: cl(w.admin).post(f"{prefix}/999999/lifecycle", {"action": "submit"}, format="json"), 404, "NOT_FOUND"),
        ("transición con una acción que no existe", lifecycle, "POST",
         _transition(prefix, "admin", "draft_id", {"action": "explotar"}), 400, "VALIDATION_ERROR"),
        ("enviar a revisión lo que ya está publicado", lifecycle, "POST",
         _transition(prefix, "admin", "version_id", {"action": "submit"}), 409, "INVALID_TRANSITION"),
        ("enviar a revisión un borrador con bloqueos", lifecycle, "POST",
         _transition(prefix, "admin", "draft_id", {"action": "submit"}), 409, "CASE_NOT_PUBLISHABLE"),
        ("transición con una revisión vencida", lifecycle, "POST", _stale_submit(prefix), 409, "REVISION_CONFLICT"),
        ("validar sin sesión", validate, "POST", lambda w: APIClient().post(f"{prefix}/{w.draft_id}/validate"),
         401, "UNAUTHENTICATED"),
        ("validar sin permiso", validate, "POST", lambda w: cl(w.student).post(f"{prefix}/{w.draft_id}/validate"),
         403, "FORBIDDEN"),
        ("validar una versión inexistente", validate, "POST", lambda w: cl(w.admin).post(f"{prefix}/999999/validate"),
         404, "NOT_FOUND"),
        ("definición sin sesión", definition, "GET", lambda w: APIClient().get(f"{prefix}/{w.version_id}/definition"),
         401, "UNAUTHENTICATED"),
        ("definición sin permiso", definition, "GET", lambda w: cl(w.student).get(f"{prefix}/{w.version_id}/definition"),
         403, "FORBIDDEN"),
        ("definición de una versión inexistente", definition, "GET", lambda w: cl(w.admin).get(f"{prefix}/999999/definition"),
         404, "NOT_FOUND"),
        ("importar sin sesión", import_, "POST", lambda w: APIClient().post(f"{prefix}/import", {}, format="json"),
         401, "UNAUTHENTICATED"),
        ("importar sin permiso", import_, "POST", lambda w: _post_document(w.student, f"{prefix}/import", {}),
         403, "FORBIDDEN"),
        ("importar un documento inválido", import_, "POST", lambda w: _post_document(w.admin, f"{prefix}/import", {}),
         400, "DSL_INVALID"),
        ("importar una versión que ya existe", import_, "POST",
         lambda w: _post_document(w.admin, f"{prefix}/import", definition_io.export_definition(w.version_id)),
         409, "CASE_VERSION_EXISTS"),
        *_assistant_route_errors(prefix),
    ]


def _assistant_route_errors(prefix):
    """Los errores documentados de las tres rutas del asistente de autoría (P5)."""
    errors = []
    for route, method, bad_body in (
        ("status", "GET", None), ("propose", "POST", {}), ("guide", "POST", {}),
    ):
        path = f"{prefix}/{{case_version_id}}/assistant/{route}"
        send = (lambda client, url, body: client.get(url)) if method == "GET" else (
            lambda client, url, body: client.post(url, body, format="json")
        )
        errors += [
            (f"asistente ({route}) sin sesión", path, method,
             lambda w, path=path, send=send: send(APIClient(), path.replace("{case_version_id}", str(w.draft_id)), {}),
             401, "UNAUTHENTICATED"),
            (f"asistente ({route}) sin permiso", path, method,
             lambda w, path=path, send=send: send(cl(w.student), path.replace("{case_version_id}", str(w.draft_id)), {}),
             403, "FORBIDDEN"),
            (f"asistente ({route}) de una versión inexistente", path, method,
             lambda w, path=path, send=send: send(cl(w.admin), path.replace("{case_version_id}", "999999"), {}),
             404, "NOT_FOUND"),
        ]
        if bad_body is not None:
            errors.append((
                f"asistente ({route}) con el cuerpo incompleto", path, method,
                lambda w, path=path, send=send: _with_assistant_on(
                    lambda: send(cl(w.admin), path.replace("{case_version_id}", str(w.draft_id)), {})
                ),
                400, "VALIDATION_ERROR",
            ))
    path = f"{prefix}/{{case_version_id}}/assistant/propose"
    body = {"peticion": "x", "pantalla": "mapa"}
    errors += [
        ("asistente (propose) con una propuesta inválida", path, "POST",
         lambda w, path=path: _propose_failing(w, path, proposals_module().InvalidProposal("Motivo fijo.")),
         422, "AI_PROPOSAL_INVALID"),
        ("asistente (propose) con el proveedor caído", path, "POST",
         lambda w, path=path: _propose_failing(w, path, ProviderError("http", "caído")),
         502, "AI_PROVIDER_ERROR"),
        ("asistente (propose) sin cupo", path, "POST",
         lambda w, path=path: _propose_failing(w, path, None, AI_AUTHORING_DAILY_LIMIT_PER_USER=0),
         429, "AI_LIMIT_EXCEEDED"),
    ]
    guide_path = f"{prefix}/{{case_version_id}}/assistant/guide"
    errors += [
        ("asistente (guide) con el proveedor caído", guide_path, "POST",
         lambda w, path=guide_path: _guide_failing(w, path, ProviderError("http", "caído")),
         502, "AI_PROVIDER_ERROR"),
        ("asistente (guide) rechazado por el proveedor", guide_path, "POST",
         lambda w, path=guide_path: _guide_failing(w, path, ProviderError("refusal", "no")),
         422, "AI_REFUSED"),
        ("asistente (guide) sin cupo", guide_path, "POST",
         lambda w, path=guide_path: _guide_failing(w, path, None, AI_AUTHORING_DAILY_LIMIT_PER_USER=0),
         429, "AI_LIMIT_EXCEEDED"),
    ]
    for segment, param in (("nodes", "node_id"), ("decisions", "decision_id"), ("dialogues", "tree_id"), ("objects", "object_id")):
        path = f"{prefix}/{{case_version_id}}/{segment}/{{{param}}}/accept-ai"
        errors += [
            (f"revisar ({segment}) sin sesión", path, "POST",
             lambda w, path=path: APIClient().post(_accept_url(path, w.draft_id), {}, format="json"), 401, "UNAUTHENTICATED"),
            (f"revisar ({segment}) sin permiso", path, "POST",
             lambda w, path=path: cl(w.student).post(_accept_url(path, w.draft_id), {}, format="json"), 403, "FORBIDDEN"),
            (f"revisar ({segment}) de una versión inexistente", path, "POST",
             lambda w, path=path: cl(w.admin).post(_accept_url(path, 999999), {}, format="json"), 404, "NOT_FOUND"),
        ]
    return errors


def _accept_url(path, version_id):
    url = path.replace("{case_version_id}", str(version_id))
    return re.sub(r"\{[a-z_]+_id\}", "1", url)


def _guide_failing(w, path, error, **settings_):
    """``guide`` con el asistente encendido y el proveedor simulado fallando con ``error``."""
    from unittest import mock

    from apps.simulation.services.authoring.assistant import guide

    url = path.replace("{case_version_id}", str(w.draft_id))
    config = dict(AI_AUTHORING_ENABLED=True, AI_AUTHORING_API_KEY="clave-de-prueba", **settings_)
    with override_settings(**config), mock.patch.object(guide, "answer", side_effect=error):
        return cl(w.admin).post(url, {"pregunta": "x", "acciones": []}, format="json")


def proposals_module():
    from apps.simulation.services.authoring.assistant import proposals

    return proposals


def _propose_failing(w, path, error, **settings_):
    """``propose`` con el asistente encendido y el proveedor simulado fallando con ``error``."""
    from unittest import mock

    url = path.replace("{case_version_id}", str(w.draft_id))
    config = dict(AI_AUTHORING_ENABLED=True, AI_AUTHORING_API_KEY="clave-de-prueba", **settings_)
    with override_settings(**config), mock.patch.object(proposals_module(), "propose", side_effect=error):
        return cl(w.admin).post(url, {"peticion": "x", "pantalla": "mapa"}, format="json")


def _with_assistant_on(call):
    with override_settings(AI_AUTHORING_ENABLED=True, AI_AUTHORING_API_KEY="clave-de-prueba"):
        return call()


def _foreign_teacher_report(w):
    """Un docente que no tiene a este estudiante en ninguno de sus grupos pide su reporte."""
    other = User.objects.create_user(
        email="otra_prof_contrato@x.com", password="x", nombre="Ot", apellido="Ra", role="PROFESOR"
    )
    return cl(other).get(f"/api/reportes/estudiante/{w.student.id}")


def _hint_while_paused(w):
    SimulationAttempt.objects.filter(pk=w.attempt_id).update(status="PAUSED")
    return _next_hint(w, requestId="contrato-9")


def _answer_as(action, who, group=None):
    """Responder la invitación del grupo del mundo (o de ``group``) como ``world.<who>``, o sin sesión si ``who`` es None."""
    def call(w):
        client = APIClient() if who is None else cl(getattr(w, who))
        return client.post(f"/api/me/invitations/{group or w.grupo_id}/{action}", {}, format="json")

    return call


def _invitation_errors():
    rows = [
        ("invitaciones sin sesión", INVITATIONS, "GET", lambda w: APIClient().get(INVITATIONS), 401, "UNAUTHENTICATED"),
        ("invitaciones de un docente", INVITATIONS, "GET", lambda w: cl(w.profesor).get(INVITATIONS), 403, "FORBIDDEN"),
    ]
    conflict = {"accept": ("student", "MEMBERSHIP_NOT_INVITED"), "decline": ("student", "MEMBERSHIP_NOT_INVITED"),
                "leave": ("invited", "MEMBERSHIP_NOT_ACTIVE")}
    for action, (who, code) in conflict.items():
        path = invitation_path(action)
        rows += [
            (f"{action} sin sesión", path, "POST", _answer_as(action, None), 401, "UNAUTHENTICATED"),
            (f"{action} como docente", path, "POST", _answer_as(action, "profesor"), 403, "FORBIDDEN"),
            (f"{action} de un grupo sin invitación", path, "POST", _answer_as(action, "invited", group=999999), 404, "NOT_FOUND"),
            (f"{action} cuando el estado no lo permite", path, "POST", _answer_as(action, who), 409, code),
        ]
    return rows


ERRORS = [
    ("pista siguiente sin sesión", HINTS_NEXT, "POST",
     lambda w: APIClient().post(f"/api/simulation/attempts/{w.attempt_id}/hints/next", {}, format="json"),
     401, "UNAUTHENTICATED"),
    ("pista siguiente sin permiso", HINTS_NEXT, "POST", lambda w: _next_hint(w, client=cl(w.profesor)), 403, "FORBIDDEN"),
    ("pista siguiente sin el token del intento", HINTS_NEXT, "POST", lambda w: _next_hint(w, attemptToken=""),
     400, "VALIDATION_ERROR"),
    ("pista siguiente de un intento inexistente", HINTS_NEXT, "POST",
     lambda w: cl(w.student).post(
         f"/api/simulation/attempts/{uuid.uuid4()}/hints/next", {"attemptToken": w.token}, format="json"),
     404, "NOT_FOUND"),
    ("pista siguiente con el intento en pausa", HINTS_NEXT, "POST", _hint_while_paused, 409, "ATTEMPT_NOT_PLAYING"),
    ("reporte del estudiante sin sesión", STUDENT_REPORT, "GET",
     lambda w: APIClient().get(f"/api/reportes/estudiante/{w.student.id}"), 401, "UNAUTHENTICATED"),
    ("reporte del estudiante como estudiante", STUDENT_REPORT, "GET",
     lambda w: cl(w.student).get(f"/api/reportes/estudiante/{w.student.id}"), 403, "FORBIDDEN"),
    ("reporte de un estudiante de otro docente", STUDENT_REPORT, "GET", _foreign_teacher_report, 403, "FORBIDDEN"),
    ("reporte de un estudiante inexistente", STUDENT_REPORT, "GET",
     lambda w: cl(w.profesor).get("/api/reportes/estudiante/999999"), 404, "NOT_FOUND"),
    *_invitation_errors(),
    ("auditoría sin sesión", "/api/admin/audit", "GET", lambda w: APIClient().get("/api/admin/audit"), 401, "UNAUTHENTICATED"),
    ("auditoría sin permiso", "/api/admin/audit", "GET", lambda w: cl(w.student).get("/api/admin/audit"), 403, "FORBIDDEN"),
    ("auditoría con parámetro inválido", "/api/admin/audit", "GET",
     lambda w: cl(w.admin).get("/api/admin/audit", {"actorId": "abc"}), 400, "INVALID_QUERY_PARAM"),
    ("revisión sin sesión", "/api/instructor/attempts", "GET", lambda w: APIClient().get("/api/instructor/attempts"),
     401, "UNAUTHENTICATED"),
    ("revisión sin permiso", "/api/instructor/attempts", "GET", lambda w: cl(w.student).get("/api/instructor/attempts"),
     403, "FORBIDDEN"),
    ("revisión con estado desconocido", "/api/instructor/attempts", "GET",
     lambda w: cl(w.profesor).get("/api/instructor/attempts", {"estado": "NOEXISTE"}), 400, "INVALID_QUERY_PARAM"),
    ("revisión de un grupo inexistente", "/api/instructor/attempts", "GET",
     lambda w: cl(w.profesor).get("/api/instructor/attempts", {"grupoId": 999999}), 404, "NOT_FOUND"),
    ("posición sin sesión", WORLD_STATE, "PATCH",
     lambda w: APIClient().patch(f"/api/simulation/attempts/{w.attempt_id}/world-state", {}, format="json"),
     401, "UNAUTHENTICATED"),
    ("posición sin permiso", WORLD_STATE, "PATCH",
     lambda w: cl(w.profesor).patch(f"/api/simulation/attempts/{w.attempt_id}/world-state", {}, format="json"),
     403, "FORBIDDEN"),
    ("posición fuera del mapa", WORLD_STATE, "PATCH", lambda w: _patch_position(w, x=5000), 400, "VALIDATION_ERROR"),
    ("posición de un intento inexistente", WORLD_STATE, "PATCH",
     lambda w: cl(w.student).patch(
         f"/api/simulation/attempts/{uuid.uuid4()}/world-state",
         {"attemptToken": w.token, "playerX": 1, "playerY": 1, "currentMapKey": w.map_key}, format="json"),
     404, "NOT_FOUND"),
    ("asignaciones sin sesión", "/api/assignments", "GET", lambda w: APIClient().get("/api/assignments"),
     401, "UNAUTHENTICATED"),
    ("asignaciones sin permiso", "/api/assignments", "GET", lambda w: cl(w.student).get("/api/assignments"),
     403, "FORBIDDEN"),
    ("asignaciones con un grupo que no es número", "/api/assignments", "GET",
     lambda w: cl(w.admin).get("/api/assignments", {"groupId": "abc"}), 400, "VALIDATION_ERROR"),
    ("asignaciones de un grupo inexistente", "/api/assignments", "GET",
     lambda w: cl(w.admin).get("/api/assignments", {"groupId": 999999}), 404, "NOT_FOUND"),
    ("asignar sin sesión", "/api/assignments", "POST",
     lambda w: APIClient().post("/api/assignments", {}, format="json"), 401, "UNAUTHENTICATED"),
    ("asignar sin permiso", "/api/assignments", "POST",
     lambda w: cl(w.student).post("/api/assignments", {}, format="json"), 403, "FORBIDDEN"),
    ("asignar con el cuerpo vacío", "/api/assignments", "POST",
     lambda w: cl(w.profesor).post("/api/assignments", {}, format="json"), 400, "VALIDATION_ERROR"),
    ("asignar a un grupo inexistente", "/api/assignments", "POST",
     lambda w: _new_assignment(w, target={"type": "GROUP", "groupId": 999999}), 404, "NOT_FOUND"),
    ("ficha sin sesión", BRIEF, "GET", lambda w: APIClient().get(f"/api/simulation/cases/{w.version_id}/brief"),
     401, "UNAUTHENTICATED"),
    ("ficha de un caso no asignado", BRIEF, "GET",
     lambda w: cl(w.outsider).get(f"/api/simulation/cases/{w.version_id}/brief"), 403, "ACCESS_NOT_ASSIGNED"),
    ("ficha de un caso inexistente", BRIEF, "GET", lambda w: cl(w.student).get("/api/simulation/cases/999999/brief"),
     404, "NOT_FOUND"),
    ("estado del intento sin sesión", ATTEMPT, "GET",
     lambda w: APIClient().get(f"/api/simulation/attempts/{w.attempt_id}"), 401, "UNAUTHENTICATED"),
    ("estado del intento sin permiso", ATTEMPT, "GET",
     lambda w: cl(w.profesor).get(f"/api/simulation/attempts/{w.attempt_id}", **{ATTEMPT_HEADER: w.token}),
     403, "FORBIDDEN"),
    ("estado del intento sin el token", ATTEMPT, "GET",
     lambda w: cl(w.student).get(f"/api/simulation/attempts/{w.attempt_id}"), 400, "VALIDATION_ERROR"),
    ("estado de un intento inexistente", ATTEMPT, "GET",
     lambda w: cl(w.student).get(f"/api/simulation/attempts/{uuid.uuid4()}", **{ATTEMPT_HEADER: w.token}),
     404, "NOT_FOUND"),
    ("pistas sin sesión", HINTS, "GET",
     lambda w: APIClient().get(f"/api/simulation/attempts/{w.attempt_id}/hints"), 401, "UNAUTHENTICATED"),
    ("pistas sin permiso", HINTS, "GET",
     lambda w: cl(w.profesor).get(f"/api/simulation/attempts/{w.attempt_id}/hints", **{ATTEMPT_HEADER: w.token}),
     403, "FORBIDDEN"),
    ("pistas sin el token del intento", HINTS, "GET",
     lambda w: cl(w.student).get(f"/api/simulation/attempts/{w.attempt_id}/hints"), 400, "VALIDATION_ERROR"),
    ("pistas de un intento inexistente", HINTS, "GET",
     lambda w: cl(w.student).get(f"/api/simulation/attempts/{uuid.uuid4()}/hints", **{ATTEMPT_HEADER: w.token}),
     404, "NOT_FOUND"),
    ("encuesta sin sesión", FEEDBACK, "GET", lambda w: APIClient().get(_feedback_url(w)), 401, "UNAUTHENTICATED"),
    ("encuesta sin permiso", FEEDBACK, "GET", lambda w: cl(w.profesor).get(_feedback_url(w)), 403, "FORBIDDEN"),
    ("encuesta apagada", FEEDBACK, "GET", lambda w: cl(w.student).get(_feedback_url(w)), 404, "NOT_FOUND"),
    ("encuesta de un intento ajeno", FEEDBACK, "GET",
     lambda w: _survey_on(lambda: cl(w.outsider).get(_feedback_url(w))), 404, "NOT_FOUND"),
    ("responder sin sesión", FEEDBACK, "POST",
     lambda w: APIClient().post(_feedback_url(w), {"rating": 4}, format="json"), 401, "UNAUTHENTICATED"),
    ("responder sin permiso", FEEDBACK, "POST",
     lambda w: cl(w.profesor).post(_feedback_url(w), {"rating": 4}, format="json"), 403, "FORBIDDEN"),
    ("responder con la encuesta apagada", FEEDBACK, "POST",
     lambda w: cl(w.student).post(_feedback_url(w), {"rating": 4}, format="json"), 404, "NOT_FOUND"),
    ("responder con una calificación fuera de rango", FEEDBACK, "POST",
     lambda w: _survey_on(lambda: cl(w.student).post(_feedback_url(w), {"rating": 9}, format="json")),
     400, "VALIDATION_ERROR"),
    ("responder un intento que sigue abierto", FEEDBACK, "POST",
     lambda w: _survey_on(lambda: cl(w.student).post(
         f"/api/simulation/attempts/{w.attempt_id}/feedback", {"rating": 4}, format="json")),
     409, "ATTEMPT_NOT_COMPLETED"),
    ("responder dos veces", FEEDBACK, "POST", _answer_twice, 409, "FEEDBACK_ALREADY_SENT"),
    ("analítica sin sesión", ANALYTICS, "GET", lambda w: APIClient().get(ANALYTICS), 401, "UNAUTHENTICATED"),
    ("analítica sin permiso", ANALYTICS, "GET", lambda w: cl(w.student).get(ANALYTICS), 403, "FORBIDDEN"),
    ("analítica con un id que no es un número", ANALYTICS, "GET",
     lambda w: cl(w.profesor).get(ANALYTICS, {"grupoId": "abc"}), 400, "INVALID_QUERY_PARAM"),
    ("analítica de un grupo inexistente", ANALYTICS, "GET",
     lambda w: cl(w.profesor).get(ANALYTICS, {"grupoId": 999999}), 404, "NOT_FOUND"),

    ("consentimiento sin sesión", CONSENT, "GET", lambda w: APIClient().get(_consent_url(w)), 401, "UNAUTHENTICATED"),
    ("consentimiento sin permiso", CONSENT, "GET", lambda w: cl(w.profesor).get(_consent_url(w)), 403, "FORBIDDEN"),
    ("consentimiento de una versión inexistente", CONSENT, "GET",
     lambda w: cl(w.student).get(_consent_url(w, 999999)), 404, "NOT_FOUND"),
    ("aceptar sin sesión", CONSENT, "POST", lambda w: APIClient().post(_consent_url(w), {}, format="json"),
     401, "UNAUTHENTICATED"),
    ("aceptar sin permiso", CONSENT, "POST", lambda w: cl(w.profesor).post(_consent_url(w), {}, format="json"),
     403, "FORBIDDEN"),
    ("aceptar sin decir la versión del aviso", CONSENT, "POST",
     lambda w: cl(w.student).post(_consent_url(w), {}, format="json"), 400, "VALIDATION_ERROR"),
    ("aceptar una versión inexistente", CONSENT, "POST",
     lambda w: cl(w.student).post(
         _consent_url(w, 999999), {"noticeVersion": django_settings.SIEP_CONTENT_NOTICE_VERSION}, format="json"),
     404, "NOT_FOUND"),
    ("aceptar con un aviso que ya no es el vigente", CONSENT, "POST",
     lambda w: cl(w.student).post(_consent_url(w), {"noticeVersion": "aviso-viejo"}, format="json"),
     409, "NOTICE_VERSION_STALE"),
    ("retirar sin sesión", CONSENT, "DELETE", lambda w: APIClient().delete(_consent_url(w)), 401, "UNAUTHENTICATED"),
    ("retirar sin permiso", CONSENT, "DELETE", lambda w: cl(w.profesor).delete(_consent_url(w)), 403, "FORBIDDEN"),
    ("retirar de una versión inexistente", CONSENT, "DELETE",
     lambda w: cl(w.student).delete(_consent_url(w, 999999)), 404, "NOT_FOUND"),
    *[row for prefix in ROUTE_FAMILIES for row in _case_route_errors(prefix)],
]
#: Estados documentados que no son un ``ErrorEnvelope`` y tienen su propio caso arriba.
OTHER_DOCUMENTED = {("/api/health", "GET"): {503}}


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


def test_cada_error_que_un_contrato_tipado_documenta_tiene_su_caso(document):
    """Documentar un 404 sin probarlo es prometer sin evidencia: lo documentado y lo probado son lo mismo."""
    tested: dict[tuple[str, str], set[int]] = {key: set(statuses) for key, statuses in OTHER_DOCUMENTED.items()}
    for _what, path, method, _call, status, _code in ERRORS:
        tested.setdefault((path, method), set()).add(status)
    for path, method in CALLS:
        declared = {int(code) for code in document["paths"][path][method.lower()]["responses"] if not code.startswith("2")}
        assert declared == tested.get((path, method), set()), (
            f"{method} {path}: el documento declara {sorted(declared)} y la prueba cubre "
            f"{sorted(tested.get((path, method), set()))}"
        )


# ─── «Parte revisada»: POST …/{nodes|decisions|dialogues|objects}/{id}/accept-ai (P5) ───────────────────────────────
# Devuelven el editor (sin contrato tipado): el 200 se contrasta con el sobre genérico y el 409 con el de error.
_ACCEPT_PARAMS = {"nodes": "node_id", "decisions": "decision_id", "dialogues": "tree_id", "objects": "object_id"}


def _accept_marked(prefix, kind, segment):
    """Un borrador del autor con una parte marcada de cada clase, y la ruta ``accept-ai`` de la de clase ``kind``."""
    from .test_ai_suggested import _marked_draft

    author = User.objects.create_user(email=f"ia_autor_{kind}@x.com", password="x", nombre="Au", apellido="Tor", role="PROFESOR")
    cv, ids = _marked_draft(author)
    template = f"{prefix}/{{case_version_id}}/{segment}/{{{_ACCEPT_PARAMS[segment]}}}/accept-ai"
    return author, cv, ids, template, f"{prefix}/{cv}/{segment}/{ids[kind]}/accept-ai"


@pytest.mark.parametrize("prefix", ROUTE_FAMILIES)
@pytest.mark.parametrize("kind,segment", [("node", "nodes"), ("decision", "decisions"), ("tree", "dialogues"), ("object", "objects")])
def test_aceptar_una_parte_de_la_ia_responde_el_sobre_que_el_documento_declara(prefix, kind, segment, document, db):
    author, cv, _ids, template, url = _accept_marked(prefix, kind, segment)
    revision = cl(author).get(f"/api/authoring/cases/{cv}/editor").json()["data"]["revision"]

    response = cl(author).post(url, {"revision": revision}, format="json")

    assert response.status_code == 200, response.content
    declared = document["paths"][template]["post"]["responses"]
    assert "200" in declared
    assert_matches(response.json(), declared["200"]["content"]["application/json"]["schema"], document)


@pytest.mark.parametrize("prefix", ROUTE_FAMILIES)
@pytest.mark.parametrize("kind,segment", [("node", "nodes"), ("decision", "decisions"), ("tree", "dialogues"), ("object", "objects")])
def test_aceptar_con_una_revision_vencida_es_el_409_que_el_documento_declara(prefix, kind, segment, document, db):
    author, cv, _ids, template, url = _accept_marked(prefix, kind, segment)
    stale = cl(author).get(f"/api/authoring/cases/{cv}/editor").json()["data"]["revision"]
    admin = User.objects.create_user(email=f"ia_admin_{kind}@x.com", password="x", nombre="Ad", apellido="Min", role="ADMIN")
    ids_node = _ids["node"]
    other = cl(admin)  # otra persona edita después: la revisión de la autora ya no es de su tanda
    fresh = other.get(f"/api/authoring/cases/{cv}/editor").json()["data"]["revision"]
    assert other.post(f"/api/authoring/cases/{cv}/nodes/{ids_node}/accept-ai", {"revision": fresh}, format="json").status_code == 200

    response = cl(author).post(url, {"revision": stale}, format="json")

    assert response.status_code == 409, response.content
    body = response.json()
    assert body["success"] is False and body["code"] == "REVISION_CONFLICT"
    declared = document["paths"][template]["post"]["responses"]
    assert "409" in declared
    assert_matches(body, declared["409"]["content"]["application/json"]["schema"], document)


#: Propiedades declaradas que ninguna respuesta real de este módulo puede mostrar, con el motivo de cada una.
NEVER_SEEN: dict[str, str] = {
    "ImportRejectedEnvelope.field": "el 400 de una importación rechazada lleva `issues`, no `field` (ese es de ErrorEnvelope)",
    "CaseConflictEnvelope.field": "los 409 de una transición se explican con `code` y sus campos propios, nunca con `field`",
    "MembershipConflictEnvelope.field": "los 409 de una invitación se explican con `code` y `status`, nunca con `field`",
    "ImportRejectedEnvelope.motivo": "`motivo` es solo del 422 AI_PROPOSAL_INVALID del asistente",
    "CaseConflictEnvelope.motivo": "`motivo` es solo del 422 AI_PROPOSAL_INVALID del asistente",
    "MembershipConflictEnvelope.motivo": "`motivo` es solo del 422 AI_PROPOSAL_INVALID del asistente",
}


def test_cada_propiedad_declarada_de_un_contrato_tipado_la_vio_alguna_respuesta_real(document):
    """Una propiedad que ninguna respuesta real ejercita puede renombrarse en el servidor sin que falle ninguna prueba."""
    if CASES_RUN != set(CALLS):
        pytest.skip("necesita los casos del registro completos: se ejecutó solo una parte del módulo")

    typed = typed_operations(document)
    declared = declared_properties(declared_response_schemas(document, typed), document)
    # ``message`` es opcional en todo sobre y solo lo mandan las mutaciones (`api_ok(..., message=…)`): se comprueba
    # donde viaja —el acuse del PATCH, la importación, la asignación—; los demás sobres lo comparten por herencia.
    assert any(prop.endswith("Envelope.message") for prop in SEEN), "ninguna respuesta real trajo `message`"
    envelope_messages = {prop for prop in declared if prop.endswith("Envelope.message")}
    unseen = sorted(declared - SEEN - set(NEVER_SEEN) - envelope_messages)

    assert not unseen, "Propiedades declaradas que ninguna respuesta real mostró (añade un caso o anótalas con su motivo):\n  " + "\n  ".join(unseen)
    assert not (set(NEVER_SEEN) - declared), "NEVER_SEEN lista propiedades que el documento ya no declara"
    assert not (set(NEVER_SEEN) & SEEN), "NEVER_SEEN lista propiedades que ya se ven: bórralas"
