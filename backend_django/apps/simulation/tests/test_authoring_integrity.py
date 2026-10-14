"""E2-6 · Edición segura: revisión que sí avanza, referencias acotadas y entradas validadas
(RNF-08, DJA-1, D-9, D-12, TD-05, TD-20).

Antes la columna ``version`` nunca se incrementaba (el 409 era inerte), una referencia a un
nodo, mapa, objeto o decisión se buscaba por pk global, y un campo ausente daba 500.
"""
import json
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, DecisionOption, MapObject

pytestmark = [pytest.mark.req("RNF-08"), pytest.mark.req("DJA-1")]

User = get_user_model()
BASE = "/api/authoring/cases"
BACKEND = Path(__file__).resolve().parents[3]


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="integ_admin@x.com", password="pass1234", nombre="Ad", apellido="Min", role="ADMIN"
    )


@pytest.fixture
def api(admin):
    return cl(admin)


def _new_case(api, title):
    data = api.post(BASE, {"title": title}, format="json").data["data"]
    return data


@pytest.fixture
def case(api):
    return _new_case(api, "Caso de integridad A")


@pytest.fixture
def other(api):
    return _new_case(api, "Caso de integridad B")


def _node_body(key, **extra):
    return {"nodeKey": key, "title": f"Nodo {key}", "narrative": "Texto", **extra}


def _add_node(api, cv, key, revision=None):
    body = _node_body(key)
    if revision is not None:
        body["revision"] = revision
    response = api.post(f"{BASE}/{cv}/nodes", body, format="json")
    assert response.status_code == 200, response.data
    return next(n for n in response.data["data"]["nodes"] if n["key"] == key), response.data["data"]


# ─── la revisión avanza con cada mutación ───────────────────────────────────────────────
def test_every_mutation_advances_the_revision_by_one(api, case):
    cv, start, map_id = case["caseVersionId"], case["nodes"][0]["id"], case["maps"][0]["id"]
    revision = case["revision"]

    def step(response):
        nonlocal revision
        assert response.status_code == 200, response.data
        data = response.data["data"]
        assert data["revision"] == revision + 1, data["revision"]
        revision = data["revision"]
        return data

    second = step(api.post(f"{BASE}/{cv}/nodes", _node_body("n2"), format="json"))
    node2 = next(n for n in second["nodes"] if n["key"] == "n2")
    step(api.put(f"{BASE}/{cv}/nodes/{node2['id']}", _node_body("n2", title="Editado"), format="json"))
    decision = step(api.post(
        f"{BASE}/{cv}/decisions",
        {"sourceNodeId": start, "targetNodeId": node2["id"], "text": "Ir", "classification": "ADEQUATE"},
        format="json",
    ))
    edge = decision["decisions"][0]
    step(api.put(
        f"{BASE}/{cv}/decisions/{edge['id']}",
        {"sourceNodeId": start, "targetNodeId": node2["id"], "text": "Ir ya", "classification": "ADEQUATE"},
        format="json",
    ))
    step(api.post(
        f"{BASE}/{cv}/maps", {"mapKey": "m2", "title": "M2", "nodeId": node2["id"]}, format="json"
    ))
    obj = step(api.post(
        f"{BASE}/{cv}/maps/{map_id}/objects",
        {"objectKey": "o1", "label": "O", "objectType": "OBJECT"}, format="json",
    ))
    object_id = obj["objects"][0]["id"]
    step(api.put(
        f"{BASE}/{cv}/objects/{object_id}", {"objectKey": "o1", "label": "O2", "objectType": "OBJECT"}, format="json"
    ))
    step(api.post(
        f"{BASE}/{cv}/maps/{map_id}/dialogues", {"treeKey": "d1", "speakerName": "Voz"}, format="json"
    ))
    tool = step(api.post(f"{BASE}/{cv}/tools", {"toolCode": "T1", "label": "T"}, format="json"))
    tool_id = tool["tools"][0]["id"]
    step(api.put(f"{BASE}/{cv}/tools/{tool_id}", {"toolCode": "T1", "label": "T2"}, format="json"))
    step(api.put(f"{BASE}/{cv}/checklist", {"contentOriginal": True}, format="json"))
    step(api.delete(f"{BASE}/{cv}/tools/{tool_id}"))
    step(api.delete(f"{BASE}/{cv}/objects/{object_id}"))


def test_the_world_save_advances_the_revision_too(api, case):
    cv = case["caseVersionId"]
    world = api.get(f"{BASE}/{cv}/world-editor").data["data"]

    saved = api.put(f"{BASE}/{cv}/world", {"revision": world["revision"], "objects": []}, format="json")

    assert saved.status_code == 200
    assert saved.data["data"]["revision"] == world["revision"] + 1


# ─── conflicto y cadena sin conflicto ───────────────────────────────────────────────────
def test_a_stale_revision_conflicts_with_the_current_state_and_changes_nothing(api, case):
    cv = case["caseVersionId"]
    node, after_first = _add_node(api, cv, "n2", revision=case["revision"])
    stale = case["revision"]

    response = api.put(
        f"{BASE}/{cv}/nodes/{node['id']}",
        _node_body("n2", title="Pisado", revision=stale),
        format="json",
    )

    assert response.status_code == 409
    assert response.data["code"] == "REVISION_CONFLICT"
    assert response.data["revision"] == after_first["revision"]
    assert response.data["current"]["revision"] == after_first["revision"]
    assert next(n for n in response.data["current"]["nodes"] if n["id"] == node["id"])["title"] == "Nodo n2"


@pytest.mark.parametrize("transport", ["query", "header"])
def test_a_delete_carries_its_revision_in_the_query_or_a_header(api, case, transport):
    cv = case["caseVersionId"]
    node, current = _add_node(api, cv, "n2")
    stale = current["revision"] - 1
    kwargs = {"HTTP_X_CASE_REVISION": str(stale)} if transport == "header" else {}
    suffix = f"?revision={stale}" if transport == "query" else ""

    refused = api.delete(f"{BASE}/{cv}/nodes/{node['id']}{suffix}", **kwargs)
    assert refused.status_code == 409 and refused.data["code"] == "REVISION_CONFLICT"

    fresh = current["revision"]
    kwargs = {"HTTP_X_CASE_REVISION": str(fresh)} if transport == "header" else {}
    suffix = f"?revision={fresh}" if transport == "query" else ""
    assert api.delete(f"{BASE}/{cv}/nodes/{node['id']}{suffix}", **kwargs).status_code == 200


def test_saves_chained_with_each_responses_revision_never_conflict(api, case):
    cv = case["caseVersionId"]
    node, current = _add_node(api, cv, "n2")
    revision = current["revision"]

    for i in range(6):
        response = api.put(
            f"{BASE}/{cv}/nodes/{node['id']}",
            _node_body("n2", title=f"Título {i}", revision=revision),
            format="json",
        )
        assert response.status_code == 200, (i, response.data)
        revision = response.data["data"]["revision"]
    assert revision == current["revision"] + 6


def test_the_world_save_conflicts_with_the_same_code(api, case):
    cv = case["caseVersionId"]
    world = api.get(f"{BASE}/{cv}/world-editor").data["data"]
    api.put(f"{BASE}/{cv}/world", {"revision": world["revision"], "objects": []}, format="json")

    stale = api.put(f"{BASE}/{cv}/world", {"revision": world["revision"], "objects": []}, format="json")

    assert stale.status_code == 409
    assert stale.data["code"] == "REVISION_CONFLICT"


def test_revision_required_flag(api, case, settings):
    cv = case["caseVersionId"]
    settings.REVISION_REQUIRED = True

    missing = api.post(f"{BASE}/{cv}/nodes", _node_body("n2"), format="json")
    given = api.post(f"{BASE}/{cv}/nodes", _node_body("n2", revision=case["revision"]), format="json")

    assert missing.status_code == 400
    assert missing.data["code"] == "REVISION_REQUIRED"
    assert missing.data["field"] == "revision"
    assert given.status_code == 200


def test_without_the_flag_a_missing_revision_is_accepted(api, case, settings):
    settings.REVISION_REQUIRED = False

    assert api.post(f"{BASE}/{case['caseVersionId']}/nodes", _node_body("n2"), format="json").status_code == 200


# ─── referencias acotadas a su versión ──────────────────────────────────────────────────
def _decision_in(api, case, key="x"):
    cv = case["caseVersionId"]
    node, _ = _add_node(api, cv, key)
    response = api.post(
        f"{BASE}/{cv}/decisions",
        {"sourceNodeId": case["nodes"][0]["id"], "targetNodeId": node["id"], "text": "Ir",
         "classification": "ADEQUATE"},
        format="json",
    )
    assert response.status_code == 200, response.data
    return response.data["data"]["decisions"][0]["id"], node["id"]


def test_a_map_cannot_point_at_a_node_of_another_version(api, case, other):
    foreign_node = other["nodes"][0]["id"]
    cv = case["caseVersionId"]

    created = api.post(f"{BASE}/{cv}/maps", {"mapKey": "mx", "title": "MX", "nodeId": foreign_node}, format="json")
    updated = api.put(
        f"{BASE}/{cv}/maps/{case['maps'][0]['id']}",
        {"mapKey": "escena-inicial", "title": "Escena", "nodeId": foreign_node},
        format="json",
    )

    for response in (created, updated):
        assert response.status_code == 400
        assert response.data["message"] == f"El nodo {foreign_node} no pertenece a la versión {cv}"


def test_an_object_cannot_link_a_decision_of_another_version(api, case, other):
    foreign_decision, _ = _decision_in(api, other, "y")
    cv, map_id = case["caseVersionId"], case["maps"][0]["id"]

    response = api.post(
        f"{BASE}/{cv}/maps/{map_id}/objects",
        {"objectKey": "o1", "label": "O", "objectType": "OBJECT", "decisionOptionId": foreign_decision},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["message"] == f"La decisión {foreign_decision} no pertenece a la versión {cv}"
    assert not MapObject.objects.filter(object_key="o1", scene_map_id=map_id).exists()


def test_a_dialogue_cannot_hang_from_an_object_of_another_map(api, case, other):
    other_object = api.post(
        f"{BASE}/{other['caseVersionId']}/maps/{other['maps'][0]['id']}/objects",
        {"objectKey": "ajeno", "label": "Ajeno", "objectType": "OBJECT"},
        format="json",
    ).data["data"]["objects"][0]["id"]
    cv, map_id = case["caseVersionId"], case["maps"][0]["id"]

    response = api.post(
        f"{BASE}/{cv}/maps/{map_id}/dialogues",
        {"treeKey": "dx", "speakerName": "Voz", "mapObjectId": other_object},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["message"] == f"El objeto {other_object} no pertenece a la versión {cv}"


def test_the_world_save_scopes_decision_links_to_the_version(api, case, other):
    foreign_decision, _ = _decision_in(api, other, "z")
    cv = case["caseVersionId"]
    world = api.get(f"{BASE}/{cv}/world-editor").data["data"]

    response = api.put(
        f"{BASE}/{cv}/world",
        {"revision": world["revision"], "objects": [
            {"key": "o1", "label": "O", "type": "OBJECT", "x": 10, "y": 10, "decisionOptionId": foreign_decision}
        ]},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["message"] == f"La decisión {foreign_decision} no pertenece a la versión {cv}"
    assert DecisionOption.objects.get(pk=foreign_decision).case_version_id != cv


# ─── entradas validadas ─────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "path,body,field",
    [
        ("nodes", {"title": "t", "narrative": "n"}, "nodeKey"),
        ("nodes", {"nodeKey": "k", "narrative": "n"}, "title"),
        ("decisions", {"sourceNodeId": 1, "targetNodeId": 1, "classification": "ADEQUATE"}, "text"),
        ("decisions", {"targetNodeId": 1, "text": "t", "classification": "ADEQUATE"}, "sourceNodeId"),
        ("maps", {"title": "t", "nodeId": 1}, "mapKey"),
        ("maps/{map}/objects", {"label": "L", "objectType": "OBJECT"}, "objectKey"),
        ("maps/{map}/objects", {"objectKey": "k", "label": "L"}, "objectType"),
        ("maps/{map}/dialogues", {"speakerName": "S"}, "treeKey"),
        ("tools", {"label": "L"}, "toolCode"),
    ],
)
def test_a_missing_field_is_a_400_that_names_it(api, case, path, body, field):
    url = f"{BASE}/{case['caseVersionId']}/{path.format(map=case['maps'][0]['id'])}"

    response = api.post(url, body, format="json")

    assert response.status_code == 400, response.data
    assert response.data["field"] == field
    assert response.data["code"] == "VALIDATION_ERROR"


def test_optional_text_fields_default_instead_of_failing(api, case):
    cv, map_id = case["caseVersionId"], case["maps"][0]["id"]

    tool = api.post(f"{BASE}/{cv}/tools", {"toolCode": "T9", "label": "Sin descripción"}, format="json")
    obj = api.post(
        f"{BASE}/{cv}/maps/{map_id}/objects",
        {"objectKey": "sin-texto", "label": "O", "objectType": "OBJECT"}, format="json",
    )

    assert tool.status_code == 200
    assert obj.status_code == 200


def test_absent_lists_and_texts_are_not_touched(api, case):
    """«Ausente = no tocar» sobrevive a los serializadores (R13, E1-7)."""
    cv = case["caseVersionId"]
    node, _ = _add_node(api, cv, "n2")
    api.put(
        f"{BASE}/{cv}/nodes/{node['id']}",
        _node_body("n2", requiredTools=["PAP"], supportResources=["Línea 106"]), format="json",
    )

    response = api.put(f"{BASE}/{cv}/nodes/{node['id']}", _node_body("n2", title="Solo el título"), format="json")

    kept = next(n for n in response.data["data"]["nodes"] if n["id"] == node["id"])
    assert kept["title"] == "Solo el título"
    assert kept["requiredTools"] == ["PAP"]
    assert kept["supportResources"] == ["Línea 106"]


# ─── borrar un nodo con decisiones entrantes ────────────────────────────────────────────
def test_a_node_with_incoming_decisions_is_not_deleted(api, case):
    cv = case["caseVersionId"]
    decision_id, node_id = _decision_in(api, case, "destino")

    refused = api.delete(f"{BASE}/{cv}/nodes/{node_id}")

    assert refused.status_code == 400
    assert refused.data["code"] == "NODE_HAS_INCOMING_DECISIONS"
    assert refused.data["incoming"] == 1
    assert DecisionOption.objects.filter(pk=decision_id).exists()


def test_a_node_with_only_outgoing_decisions_is_deleted_with_them(api, case):
    cv = case["caseVersionId"]
    decision_id, _ = _decision_in(api, case, "destino")
    start = case["nodes"][0]["id"]

    deleted = api.delete(f"{BASE}/{cv}/nodes/{start}")

    assert deleted.status_code == 200
    assert not DecisionOption.objects.filter(pk=decision_id).exists()


# ─── iconos ─────────────────────────────────────────────────────────────────────────────
def test_an_unknown_icon_is_rejected_and_a_known_one_accepted(api, case):
    cv, map_id = case["caseVersionId"], case["maps"][0]["id"]
    body = {"objectKey": "o-icono", "label": "O", "objectType": "OBJECT"}

    bad = api.post(f"{BASE}/{cv}/maps/{map_id}/objects", {**body, "icon": "no_such_icon_zzz"}, format="json")
    good = api.post(f"{BASE}/{cv}/maps/{map_id}/objects", {**body, "icon": "psychology"}, format="json")

    assert bad.status_code == 400
    assert bad.data["field"] == "icon"
    assert good.status_code == 200


def test_an_icon_already_stored_is_accepted_again(api, case):
    """Guardar el mundo reenvía todos los objetos: un valor viejo fuera de la lista no bloquea."""
    cv, map_id = case["caseVersionId"], case["maps"][0]["id"]
    created = api.post(
        f"{BASE}/{cv}/maps/{map_id}/objects",
        {"objectKey": "o-legado", "label": "O", "objectType": "OBJECT"}, format="json",
    ).data["data"]["objects"][0]
    MapObject.objects.filter(pk=created["id"]).update(icon="icono_de_legado")

    again = api.put(
        f"{BASE}/{cv}/objects/{created['id']}",
        {"objectKey": "o-legado", "label": "O", "objectType": "OBJECT", "icon": "icono_de_legado"},
        format="json",
    )

    assert again.status_code == 200
    assert CaseVersion.objects.get(pk=cv).status == "DRAFT"


def test_the_local_icon_list_matches_the_frontends():
    local = json.loads(
        (BACKEND / "apps" / "simulation" / "data" / "material_icons.json").read_text(encoding="utf-8")
    )
    source = BACKEND.parent / "frontend" / "scripts" / "ui" / "material-symbols-rounded.icons.json"
    if not source.exists():
        pytest.skip("el frontend no está en este checkout")

    assert sorted(local) == sorted(json.loads(source.read_text(encoding="utf-8")))
