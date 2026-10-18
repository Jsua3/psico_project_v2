"""E3-6 · Enunciado de la decisión y orden informativo de los nodos (RF-06, RF-08).

``decisionPrompt`` es el enunciado que el estudiante lee antes de elegir (texto plano, blando:
puede estar vacío) y ``displayOrder`` el orden informativo con que el editor lista los nodos; ni
uno ni otro cambia el grafo ni el recorrido. ``PATCH …/nodes/reorder`` asigna el orden de todos
los nodos de una vez.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import AuditLog, CaseVersion, DecisionOption, SimulationNode

from .test_world import _start, attempt_headers, case_version_id, estudiante  # noqa: F401  (fixtures)

pytestmark = [pytest.mark.req("RF-06"), pytest.mark.req("RF-08")]

User = get_user_model()
AUTHORING = "/api/authoring/cases"


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(
        email=email, password="Clave-Segura-2026!", nombre="N", apellido="A", role=role
    )


@pytest.fixture
def author(db):
    return _user("order_author@x.com", "PROFESOR")


@pytest.fixture
def admin(db):
    return _user("order_admin@x.com", "ADMIN")


@pytest.fixture
def case(author):
    response = cl(author).post(AUTHORING, {"title": "Caso con orden"}, format="json")
    assert response.status_code == 200, response.data
    return response.data["data"]


def _node_body(key, **extra):
    return {"nodeKey": key, "title": key.title(), "narrative": "Texto.", **extra}


def _add_nodes(client, cv, *keys):
    data = None
    for key in keys:
        response = client.post(f"{AUTHORING}/{cv}/nodes", _node_body(key), format="json")
        assert response.status_code == 200, response.data
        data = response.data["data"]
    return data


# ─── el enunciado ─────────────────────────────────────────────────────────────────────────────
def test_the_prompt_is_saved_and_returned_by_the_editor(author, case):
    cv = case["caseVersionId"]
    client = cl(author)

    created = client.post(
        f"{AUTHORING}/{cv}/nodes",
        _node_body("sala", decisionPrompt="¿Qué haces primero con la familia?"), format="json",
    )

    assert created.status_code == 200, created.data
    node = next(n for n in created.data["data"]["nodes"] if n["key"] == "sala")
    assert node["decisionPrompt"] == "¿Qué haces primero con la familia?"
    start = next(n for n in created.data["data"]["nodes"] if n["key"] == "inicio")
    assert start["decisionPrompt"] == ""


def test_an_absent_prompt_is_not_touched_and_an_empty_one_clears_it(author, case):
    cv = case["caseVersionId"]
    client = cl(author)
    created = client.post(
        f"{AUTHORING}/{cv}/nodes", _node_body("sala", decisionPrompt="Enunciado."), format="json"
    )
    node = next(n for n in created.data["data"]["nodes"] if n["key"] == "sala")

    kept = client.put(f"{AUTHORING}/{cv}/nodes/{node['id']}", _node_body("sala", title="Nuevo"), format="json")
    cleared = client.put(
        f"{AUTHORING}/{cv}/nodes/{node['id']}", _node_body("sala", decisionPrompt=""), format="json"
    )

    assert next(n for n in kept.data["data"]["nodes"] if n["id"] == node["id"])["decisionPrompt"] == "Enunciado."
    assert next(n for n in cleared.data["data"]["nodes"] if n["id"] == node["id"])["decisionPrompt"] == ""


@pytest.mark.parametrize(
    "text",
    ["<script>alert(1)</script>", "Elige <b>bien</b>", "Mira https://ejemplo.com", "x" * 1201],
)
def test_an_invalid_prompt_is_a_400_naming_the_field(author, case, text):
    cv = case["caseVersionId"]

    response = cl(author).post(
        f"{AUTHORING}/{cv}/nodes", _node_body("sala", decisionPrompt=text), format="json"
    )

    assert response.status_code == 400, response.data
    assert response.data["field"] == "decisionPrompt"
    assert not SimulationNode.objects.filter(case_version_id=cv, node_key="sala").exists()


def test_the_game_serves_the_prompt_of_the_current_node(estudiante, case_version_id):
    version = CaseVersion.objects.get(pk=case_version_id)
    start = SimulationNode.objects.get(case_version=version, start_node=True)
    SimulationNode.objects.filter(pk=start.pk).update(decision_prompt="¿Cómo contienes a la familia?")
    client = cl(estudiante)

    attempt_id, token = _start(client, case_version_id)
    state = client.get(f"/api/simulation/attempts/{attempt_id}", **attempt_headers(token)).data["data"]

    assert state["currentNode"]["decisionPrompt"] == "¿Cómo contienes a la familia?"
    assert "displayOrder" in state["currentNode"]


# ─── el orden ─────────────────────────────────────────────────────────────────────────────────
def _ids(editor):
    return [n["id"] for n in editor["nodes"]]


def test_reorder_assigns_the_sequence_and_bumps_the_revision_once(author, case):
    cv = case["caseVersionId"]
    client = cl(author)
    editor = _add_nodes(client, cv, "b", "c")
    ids = _ids(editor)
    wanted = [ids[2], ids[0], ids[1]]
    before = editor["revision"]

    response = client.patch(f"{AUTHORING}/{cv}/nodes/reorder", {"order": wanted}, format="json")

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert data["revision"] == before + 1
    by_id = {n["id"]: n["displayOrder"] for n in data["nodes"]}
    assert [by_id[i] for i in wanted] == [0, 1, 2]
    assert [n["id"] for n in data["nodes"]] == ids  # el editor sigue listando por id; el orden es un dato


def test_reorder_needs_every_node_exactly_once(author, case):
    cv = case["caseVersionId"]
    client = cl(author)
    ids = _ids(_add_nodes(client, cv, "b", "c"))
    other = client.post(AUTHORING, {"title": "Otro"}, format="json").data["data"]
    foreign_id = other["nodes"][0]["id"]

    bodies = {
        "missing": {"order": ids[:-1]},
        "duplicate": {"order": [ids[0], ids[0], ids[1]]},
        "foreign": {"order": [ids[0], ids[1], foreign_id]},
        "unknown": {"order": [ids[0], ids[1], 999999999]},
        "extra": {"order": ids + [foreign_id]},
        "not a list": {"order": "1,2,3"},
        "no order": {},
    }
    for name, body in bodies.items():
        response = client.patch(f"{AUTHORING}/{cv}/nodes/reorder", body, format="json")
        assert response.status_code == 400, (name, response.data)
        assert response.data["field"] == "order", name
    # Nada cambió: cada nodo nuevo nace al final (0, 1, 2) y el orden rechazado no lo movió.
    assert [
        n.display_order for n in SimulationNode.objects.filter(case_version_id=cv).order_by("id")
    ] == [0, 1, 2]


def test_reorder_respects_ownership_the_draft_and_the_revision(author, admin, case):
    cv = case["caseVersionId"]
    ids = _ids(_add_nodes(cl(author), cv, "b"))
    stranger = _user("order_stranger@x.com", "PROFESOR")
    stale = case["revision"]

    assert cl(stranger).patch(
        f"{AUTHORING}/{cv}/nodes/reorder", {"order": ids}, format="json"
    ).status_code == 403
    assert cl(admin).patch(
        f"{AUTHORING}/{cv}/nodes/reorder", {"order": ids}, format="json"
    ).status_code == 200
    conflict = cl(author).patch(
        f"{AUTHORING}/{cv}/nodes/reorder", {"order": ids, "revision": stale}, format="json"
    )
    assert conflict.status_code == 409
    assert conflict.data["code"] == "REVISION_CONFLICT"

    CaseVersion.objects.filter(pk=cv).update(status="PUBLISHED")
    assert cl(admin).patch(
        f"{AUTHORING}/{cv}/nodes/reorder", {"order": ids}, format="json"
    ).status_code == 400


def test_reorder_does_not_change_the_graph(author, case):
    cv = case["caseVersionId"]
    client = cl(author)
    ids = _ids(_add_nodes(client, cv, "b"))
    client.post(
        f"{AUTHORING}/{cv}/decisions",
        {"sourceNodeId": ids[0], "targetNodeId": ids[1], "text": "Pasar", "classification": "ADEQUATE"},
        format="json",
    )
    before = list(DecisionOption.objects.filter(case_version_id=cv).values_list("source_node_id", "target_node_id"))

    response = client.patch(
        f"{AUTHORING}/{cv}/nodes/reorder", {"order": list(reversed(ids))}, format="json"
    )

    assert response.status_code == 200, response.data
    after = list(DecisionOption.objects.filter(case_version_id=cv).values_list("source_node_id", "target_node_id"))
    assert after == before
    assert SimulationNode.objects.get(case_version_id=cv, start_node=True).id == ids[0]


def test_cloning_copies_the_prompt_and_the_order(author, admin, case):
    cv = case["caseVersionId"]
    client = cl(author)
    node = next(
        n for n in client.post(
            f"{AUTHORING}/{cv}/nodes", _node_body("sala", decisionPrompt="Enunciado copiado."), format="json"
        ).data["data"]["nodes"] if n["key"] == "sala"
    )
    ids = _ids(client.get(f"{AUTHORING}/{cv}/editor").data["data"])
    client.patch(f"{AUTHORING}/{cv}/nodes/reorder", {"order": list(reversed(ids))}, format="json")

    cloned = cl(admin).post(f"{AUTHORING}/{cv}/clone-version", {}, format="json")

    assert cloned.status_code == 200, cloned.data
    copy = SimulationNode.objects.get(case_version_id=cloned.data["data"]["caseVersionId"], node_key="sala")
    assert copy.decision_prompt == "Enunciado copiado."
    assert copy.display_order == SimulationNode.objects.get(pk=node["id"]).display_order == 0


def test_a_node_with_incoming_decisions_is_still_not_deleted(author, case):
    cv = case["caseVersionId"]
    client = cl(author)
    ids = _ids(_add_nodes(client, cv, "b"))
    client.post(
        f"{AUTHORING}/{cv}/decisions",
        {"sourceNodeId": ids[0], "targetNodeId": ids[1], "text": "Pasar", "classification": "ADEQUATE"},
        format="json",
    )

    response = client.delete(f"{AUTHORING}/{cv}/nodes/{ids[1]}")

    assert response.status_code == 400
    assert response.data["code"] == "NODE_HAS_INCOMING_DECISIONS"


def test_reorder_is_audited(author, case):
    cv = case["caseVersionId"]
    client = cl(author)
    ids = _ids(_add_nodes(client, cv, "b"))

    client.patch(f"{AUTHORING}/{cv}/nodes/reorder", {"order": ids}, format="json")

    assert AuditLog.objects.filter(
        action="ADMIN_REORDER_NODES", resource_type="CASE_VERSION", resource_id=str(cv),
        actor_id=author.id,
    ).exists()
