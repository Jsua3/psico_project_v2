"""E2-4 · El profesor autora sus casos, con propiedad (RF-05, RF-08, CU-01, ED-9).

La autoría deja de ser solo del ADMIN: el PROFESOR crea, edita y lista **sus** casos
(``simulation_cases.created_by``); un caso ajeno no se lee (404) ni se muta (403) por
ninguna de las rutas de ``urls_admin``; publicar sigue siendo del ADMIN. Espacio canónico
``/api/authoring/**`` con el alias ``/api/admin/cases/**``.
"""
import re

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation import urls_admin
from apps.simulation.models import AuditLog, CaseVersion, SimulationCase

pytestmark = [pytest.mark.req("RF-05"), pytest.mark.req("RF-08"), pytest.mark.req("CU-01")]

User = get_user_model()
AUTHORING = "/api/authoring/cases"
LEGACY = "/api/admin/cases"


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(email=email, password="pass1234", nombre="N", apellido="A", role=role)


@pytest.fixture
def admin(db):
    return _user("own_a_admin@x.com", "ADMIN")


@pytest.fixture
def prof_a(db):
    return _user("own_a_prof_a@x.com", "PROFESOR")


@pytest.fixture
def prof_b(db):
    return _user("own_a_prof_b@x.com", "PROFESOR")


@pytest.fixture
def estudiante(db):
    return _user("own_a_est@x.com", "ESTUDIANTE")


def _create_case(user, title="Caso de la profesora A", **extra):
    response = cl(user).post(AUTHORING, {"title": title, **extra}, format="json")
    assert response.status_code == 200, response.data
    return response.data["data"]


@pytest.fixture
def case_a(prof_a):
    """Un caso de ``prof_a`` con su nodo y mapa iniciales."""
    return _create_case(prof_a)


# ─── propiedad ──────────────────────────────────────────────────────────────────────────
def test_the_professor_authors_their_case_and_cannot_spoof_the_owner(prof_a, prof_b):
    data = _create_case(
        prof_a, "Caso con intentos de suplantar",
        createdBy=prof_b.id, ownerId=prof_b.id, userId=prof_b.id, status="PUBLISHED", role="ADMIN",
    )

    version = CaseVersion.objects.select_related("simulation_case").get(pk=data["caseVersionId"])
    assert version.simulation_case.created_by_id == prof_a.id
    assert version.status == "DRAFT"
    assert data["status"] == "DRAFT"


def test_each_professor_lists_only_their_cases_and_admin_lists_all(prof_a, prof_b, admin, case_a):
    case_b = _create_case(prof_b, "Caso de B")

    ids_a = {item["caseVersionId"] for item in cl(prof_a).get(AUTHORING).data["data"]}
    ids_b = {item["caseVersionId"] for item in cl(prof_b).get(AUTHORING).data["data"]}
    ids_admin = {item["caseVersionId"] for item in cl(admin).get(AUTHORING).data["data"]}

    assert ids_a == {case_a["caseVersionId"]}
    assert ids_b == {case_b["caseVersionId"]}
    assert {case_a["caseVersionId"], case_b["caseVersionId"]} <= ids_admin
    assert len(ids_admin) > 2  # y el caso sembrado, del ADMIN


def test_the_alias_serves_the_same_list_and_editor(prof_a, case_a):
    cv = case_a["caseVersionId"]

    assert cl(prof_a).get(LEGACY).data["data"] == cl(prof_a).get(AUTHORING).data["data"]
    assert cl(prof_a).get(f"{LEGACY}/{cv}/editor").status_code == 200
    assert cl(prof_a).get(f"{AUTHORING}/{cv}/editor").status_code == 200


def test_create_case_leaves_an_audit_row_with_the_actors_role(prof_a):
    _create_case(prof_a, "Caso auditado")

    row = AuditLog.objects.filter(action="CASE_CREATED", actor_id=prof_a.id).get()
    assert row.actor_role == "PROFESOR"


# ─── cada ruta de urls_admin contra un caso ajeno ───────────────────────────────────────
#: (método, patrón de ruta como en urls_admin, cuerpo, estado esperado para un PROFESOR ajeno).
#: Leer lo ajeno es 404; mutarlo, 403; publicar es del ADMIN (403 en la puerta).
FOREIGN_ROUTES = [
    ("get", "<int:case_version_id>/editor", None, 404),
    ("get", "<int:case_version_id>/world-editor", None, 404),
    ("get", "<int:case_version_id>/world-preview", None, 404),
    ("post", "<int:case_version_id>/world/validate", {}, 404),
    ("put", "<int:case_version_id>/world", {"objects": []}, 403),
    ("put", "<int:case_version_id>/checklist", {"contentOriginal": True}, 403),
    ("post", "<int:case_version_id>/publish", {}, 403),
    ("post", "<int:case_version_id>/clone-version", {}, 403),
    ("get", "<int:case_version_id>/lifecycle", None, 404),
    ("post", "<int:case_version_id>/lifecycle", {"action": "submit"}, 403),
    ("post", "<int:case_version_id>/nodes", {"nodeKey": "x", "title": "t", "narrative": "n"}, 403),
    ("put", "<int:case_version_id>/nodes/<int:node_id>", {"nodeKey": "x", "title": "t", "narrative": "n"}, 403),
    ("delete", "<int:case_version_id>/nodes/<int:node_id>", None, 403),
    ("post", "<int:case_version_id>/decisions", {"sourceNodeId": 1, "targetNodeId": 1, "text": "t",
                                                  "classification": "ADEQUATE"}, 403),
    ("put", "<int:case_version_id>/decisions/<int:decision_id>", {"text": "t"}, 403),
    ("delete", "<int:case_version_id>/decisions/<int:decision_id>", None, 403),
    ("post", "<int:case_version_id>/maps", {"mapKey": "m", "title": "M", "nodeId": 1}, 403),
    ("put", "<int:case_version_id>/maps/<int:map_id>", {"mapKey": "m", "title": "M"}, 403),
    ("delete", "<int:case_version_id>/maps/<int:map_id>", None, 403),
    ("post", "<int:case_version_id>/maps/<int:map_id>/objects", {"objectKey": "o", "label": "O",
                                                                 "objectType": "OBJECT"}, 403),
    ("put", "<int:case_version_id>/objects/<int:object_id>", {"objectKey": "o", "label": "O"}, 403),
    ("delete", "<int:case_version_id>/objects/<int:object_id>", None, 403),
    ("post", "<int:case_version_id>/maps/<int:map_id>/dialogues", {"treeKey": "d", "speakerName": "S"}, 403),
    ("put", "<int:case_version_id>/dialogues/<int:tree_id>", {"treeKey": "d", "speakerName": "S"}, 403),
    ("delete", "<int:case_version_id>/dialogues/<int:tree_id>", None, 403),
    ("post", "<int:case_version_id>/tools", {"toolCode": "T", "label": "T"}, 403),
    ("put", "<int:case_version_id>/tools/<int:tool_id>", {"toolCode": "T", "label": "T"}, 403),
    ("delete", "<int:case_version_id>/tools/<int:tool_id>", None, 403),
]


def _route_patterns():
    return {str(p.pattern) for p in urls_admin.urlpatterns if str(p.pattern)}


def test_the_foreign_route_table_covers_every_authoring_route():
    """Una ruta nueva de ``urls_admin`` obliga a decidir qué pasa con un caso ajeno."""
    assert {pattern for _, pattern, _, _ in FOREIGN_ROUTES} == _route_patterns()


def _path(pattern, case_version_id, ids):
    def fill(match):
        name = match.group(1)
        return str(case_version_id if name == "case_version_id" else ids.get(name, 1))

    return re.sub(r"<int:(\w+)>", fill, pattern)


@pytest.mark.parametrize("method,pattern,body,expected", FOREIGN_ROUTES)
def test_a_foreign_professor_never_gets_through(prof_b, case_a, method, pattern, body, expected):
    ids = {"node_id": case_a["nodes"][0]["id"], "map_id": case_a["maps"][0]["id"]}
    path = f"{AUTHORING}/{_path(pattern, case_a['caseVersionId'], ids)}"
    client = cl(prof_b)

    response = getattr(client, method)(path, body, format="json") if body is not None else getattr(client, method)(path)

    assert response.status_code == expected, (method, path, response.status_code)


@pytest.mark.parametrize("method,pattern,body,expected", FOREIGN_ROUTES)
def test_a_student_is_stopped_at_the_gate(estudiante, case_a, method, pattern, body, expected):
    ids = {"node_id": case_a["nodes"][0]["id"], "map_id": case_a["maps"][0]["id"]}
    path = f"{AUTHORING}/{_path(pattern, case_a['caseVersionId'], ids)}"
    client = cl(estudiante)

    response = getattr(client, method)(path, body, format="json") if body is not None else getattr(client, method)(path)

    assert response.status_code == 403


def test_a_foreign_case_that_does_not_exist_is_404_for_everyone(prof_a, admin):
    assert cl(prof_a).get(f"{AUTHORING}/99999999/editor").status_code == 404
    assert cl(admin).get(f"{AUTHORING}/99999999/editor").status_code == 404


# ─── lo propio funciona completo ────────────────────────────────────────────────────────
def test_the_owner_edits_their_case_end_to_end(prof_a, case_a):
    cv = case_a["caseVersionId"]
    client = cl(prof_a)
    node_id, map_id = case_a["nodes"][0]["id"], case_a["maps"][0]["id"]

    assert client.get(f"{AUTHORING}/{cv}/editor").status_code == 200
    created = client.post(
        f"{AUTHORING}/{cv}/nodes",
        {"nodeKey": "n2", "title": "Segundo", "narrative": "Texto", "positionX": 10, "positionY": 10},
        format="json",
    )
    assert created.status_code == 200
    second = next(n for n in created.data["data"]["nodes"] if n["key"] == "n2")
    assert client.put(
        f"{AUTHORING}/{cv}/nodes/{second['id']}",
        {"nodeKey": "n2", "title": "Segundo editado", "narrative": "Texto"},
        format="json",
    ).status_code == 200
    assert client.post(
        f"{AUTHORING}/{cv}/decisions",
        {"sourceNodeId": node_id, "targetNodeId": second["id"], "text": "Ir", "classification": "ADEQUATE"},
        format="json",
    ).status_code == 200
    assert client.post(
        f"{AUTHORING}/{cv}/maps/{map_id}/objects",
        {"objectKey": "obj-1", "label": "Objeto", "objectType": "OBJECT", "x": 10, "y": 10,
         "interactionPrompt": "Examinar", "interactionText": "Un objeto del caso."},
        format="json",
    ).status_code == 200
    assert client.post(
        f"{AUTHORING}/{cv}/tools",
        {"toolCode": "T1", "label": "Herramienta", "description": "Sirve para algo."},
        format="json",
    ).status_code == 200
    assert client.put(f"{AUTHORING}/{cv}/checklist", {"contentOriginal": True}, format="json").status_code == 200
    assert client.get(f"{AUTHORING}/{cv}/world-editor").status_code == 200
    # El nodo tiene una decisión entrante: primero se borra la decisión y luego el nodo.
    edge = client.get(f"{AUTHORING}/{cv}/editor").data["data"]["decisions"][0]
    assert client.delete(f"{AUTHORING}/{cv}/decisions/{edge['id']}").status_code == 200
    assert client.delete(f"{AUTHORING}/{cv}/nodes/{second['id']}").status_code == 200


def test_the_owner_cannot_publish_but_admin_can_reach_the_publish_gate(prof_a, admin, case_a):
    cv = case_a["caseVersionId"]

    assert cl(prof_a).post(f"{AUTHORING}/{cv}/publish", {}, format="json").status_code == 403
    # El ADMIN llega a la regla de negocio (la lista está incompleta): 400, no 403.
    assert cl(admin).post(f"{AUTHORING}/{cv}/publish", {}, format="json").status_code == 400


def test_admin_edits_any_professors_case(admin, case_a):
    cv = case_a["caseVersionId"]

    response = cl(admin).post(
        f"{AUTHORING}/{cv}/tools",
        {"toolCode": "ADM", "label": "Del ADMIN", "description": "Creada por el ADMIN."},
        format="json",
    )

    assert response.status_code == 200
    assert SimulationCase.objects.get(versions__pk=cv).created_by.role == "PROFESOR"
