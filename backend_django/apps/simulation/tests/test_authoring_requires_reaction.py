"""Tarea 6 · ``requires``, ``reaction`` y ``goal`` por la API de autoría, con validación estricta y la compuerta OCL-09."""
import json

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import CaseCharacter, DecisionOption, SimulationNode
from apps.simulation.services import case_rules
from apps.simulation.services.authoring import validation

User = get_user_model()
AUTHORING = "/api/authoring/cases"


@pytest.fixture
def api(db):
    user = User.objects.create_user(
        email="rr_author@x.com", password="Clave-Segura-2026!", nombre="Au", apellido="Tor", role="PROFESOR"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def case(api):
    created = api.post(AUTHORING, {"title": "Caso con requisito"}, format="json")
    assert created.status_code == 200, created.data
    cv = created.data["data"]["caseVersionId"]
    state = api.post(
        f"{AUTHORING}/{cv}/nodes",
        {"nodeKey": "fin", "title": "Fin", "narrative": "Fin.", "terminal": True}, format="json",
    ).data["data"]
    ids = {n["key"]: n["id"] for n in state["nodes"]}
    decision = api.post(
        f"{AUTHORING}/{cv}/decisions",
        {"sourceNodeId": ids["inicio"], "targetNodeId": ids["fin"], "text": "Hablar.", "classification": "ADEQUATE"},
        format="json",
    )
    assert decision.status_code == 200, decision.data
    return {
        "cv": cv, "source": ids["inicio"], "target": ids["fin"],
        "decision": decision.data["data"]["decisions"][0]["id"],
    }


def _put(api, case, **extra):
    body = {"sourceNodeId": case["source"], "targetNodeId": case["target"], "text": "Hablar.",
            "classification": "ADEQUATE", **extra}
    return api.put(f"{AUTHORING}/{case['cv']}/decisions/{case['decision']}", body, format="json")


def _row(case):
    return DecisionOption.objects.get(pk=case["decision"])


def test_put_decision_saves_requires_and_reaction(api, case):
    response = _put(
        api, case, requires={"inspected": "carpeta"}, reaction={"linea": "Gracias.", "gesto": "asiente"}
    )

    assert response.status_code == 200, response.data
    decision = _row(case)
    assert json.loads(decision.requires_json) == {"inspected": "carpeta"}
    assert json.loads(decision.reaction_json) == {"linea": "Gracias.", "gesto": "asiente"}


@pytest.mark.parametrize("body, field", [
    ({"requires": {"visto": "x"}}, "requires"),
    ({"requires": {"all": [{"talked": "a"}] * 400}}, "requires"),
    ({"reaction": {"gesto": "saluda"}}, "reaction"),
    ({"reaction": {"emocion": "furiosa"}}, "reaction"),
    ({"reaction": {"linea": "x" * 401}}, "reaction"),
    ({"reaction": {"personaje": "no-esta-en-el-caso"}}, "reaction"),
    ({"reaction": {"color": "rojo"}}, "reaction"),
])
def test_put_decision_rejects_bad_values_naming_the_field(api, case, body, field):
    response = _put(api, case, **body)

    assert response.status_code == 400, response.data
    assert response.data["field"] == field
    assert _row(case).requires_json == "{}"
    assert _row(case).reaction_json == "{}"


def test_a_known_character_is_accepted_and_empty_keys_are_dropped(api, case):
    CaseCharacter.objects.create(case_version_id=case["cv"], character_key="ana", display_name="Ana")

    response = _put(api, case, reaction={"personaje": "ana", "linea": "", "emocion": "triste"})

    assert response.status_code == 200, response.data
    assert json.loads(_row(case).reaction_json) == {"personaje": "ana", "emocion": "triste"}


def test_null_and_empty_clear(api, case):
    _put(api, case, requires={"talked": "ana"}, reaction={"gesto": "asiente"})
    assert _row(case).requires_json != "{}"

    assert _put(api, case, requires=None, reaction={}).status_code == 200

    assert _row(case).requires_json == "{}"
    assert _row(case).reaction_json == "{}"


def test_omitting_the_fields_does_not_touch_them(api, case):
    _put(api, case, requires={"talked": "ana"}, reaction={"gesto": "asiente"})

    assert _put(api, case, text="Texto nuevo.").status_code == 200

    decision = _row(case)
    assert decision.text == "Texto nuevo."
    assert json.loads(decision.requires_json) == {"talked": "ana"}
    assert json.loads(decision.reaction_json) == {"gesto": "asiente"}


def _put_node(api, case, **extra):
    body = {"nodeKey": "inicio", "title": "Inicio", "narrative": "Inicio.", **extra}
    return api.put(f"{AUTHORING}/{case['cv']}/nodes/{case['source']}", body, format="json")


def test_put_node_saves_goal_and_rejects_a_long_one(api, case):
    ok = _put_node(api, case, goal="g" * 200)
    assert ok.status_code == 200, ok.data
    assert SimulationNode.objects.get(pk=case["source"]).goal == "g" * 200

    too_long = _put_node(api, case, goal="g" * 201)
    assert too_long.status_code == 400
    assert too_long.data["field"] == "goal"

    # ausente = no tocar
    assert _put_node(api, case).status_code == 200
    assert SimulationNode.objects.get(pk=case["source"]).goal == "g" * 200


def test_editor_view_returns_the_new_fields(api, case):
    _put(api, case, requires={"talked": "ana"}, reaction={"gesto": "asiente"})
    _put_node(api, case, goal="Escuchar.")

    state = api.get(f"{AUTHORING}/{case['cv']}/editor").data["data"]

    decision = next(d for d in state["decisions"] if d["id"] == case["decision"])
    assert decision["requires"] == {"talked": "ana"}
    assert decision["reaction"] == {"gesto": "asiente"}
    node = next(n for n in state["nodes"] if n["id"] == case["source"])
    assert node["goal"] == "Escuchar."
    other = next(n for n in state["nodes"] if n["id"] == case["target"])
    assert other["goal"] == ""


def test_ocl_09_blocks_publication(api, case):
    _put(api, case, requires={"talked": "ana"})

    assessment = validation.assess_version(case["cv"])

    assert "DSL.OCL-09" in {issue["code"] for issue in assessment.issues}
    assert assessment.can_publish is False


# ─── lectura de lo guardado ───────────────────────────────────────────────────────────────────
class _Row:
    def __init__(self, requires_json="{}", reaction_json="{}"):
        self.requires_json, self.reaction_json = requires_json, reaction_json


@pytest.mark.parametrize("stored, expected", [
    ("{}", {}),
    ('{"talked": "ana"}', {"talked": "ana"}),
    ("no es json", None),
    ("[1]", None),
    ('{"visto": "x"}', None),
    ("", None),
])
def test_requires_of_reads_strictly(stored, expected):
    assert case_rules.requires_of(_Row(requires_json=stored)) == expected


@pytest.mark.parametrize("stored, expected", [
    ('{"gesto": "asiente"}', {"gesto": "asiente"}),
    ("no es json", {}),
    ("[1]", {}),
])
def test_reaction_of_is_lenient(stored, expected):
    assert case_rules.reaction_of(_Row(reaction_json=stored)) == expected
