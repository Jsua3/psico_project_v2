"""E3-7 · Retroalimentación y fundamento teórico autorables (RF-10, CU-04).

Cada decisión lleva tres textos que el estudiante lee al cerrar —su consecuencia, su
retroalimentación y su fundamento teórico—: texto plano con tope de 1200 caracteres y 400 con el
campo. «Ausente = no tocar» y la cadena vacía los borra. ``validate`` avisa (sin bloquear) de las
decisiones que no explican nada.
"""
import copy

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import DecisionOption
from apps.simulation.services import world_validation

pytestmark = [pytest.mark.req("RF-10"), pytest.mark.req("CU-04")]

User = get_user_model()
AUTHORING = "/api/authoring/cases"
FIELDS = ("consequenceText", "feedbackText", "theoryBasis")


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def author(db):
    return User.objects.create_user(
        email="fb_author@x.com", password="Clave-Segura-2026!", nombre="Au", apellido="Tor", role="PROFESOR"
    )


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="fb_admin@x.com", password="Clave-Segura-2026!", nombre="Ad", apellido="Min", role="ADMIN"
    )


@pytest.fixture
def case(author):
    client = cl(author)
    created = client.post(AUTHORING, {"title": "Caso con retroalimentación"}, format="json")
    assert created.status_code == 200, created.data
    cv = created.data["data"]["caseVersionId"]
    with_second = client.post(
        f"{AUTHORING}/{cv}/nodes",
        {"nodeKey": "fin", "title": "Fin", "narrative": "Fin.", "terminal": True}, format="json",
    ).data["data"]
    ids = {n["key"]: n["id"] for n in with_second["nodes"]}
    return {"cv": cv, "source": ids["inicio"], "target": ids["fin"]}


def _body(case, **extra):
    return {
        "sourceNodeId": case["source"], "targetNodeId": case["target"],
        "text": "Hablar con la familia.", "classification": "ADEQUATE", **extra,
    }


def _create(client, case, **extra):
    response = client.post(f"{AUTHORING}/{case['cv']}/decisions", _body(case, **extra), format="json")
    return response


# ─── los tres textos ──────────────────────────────────────────────────────────────────────────
def test_the_three_texts_are_saved_and_returned_by_the_editor(author, case):
    response = _create(
        cl(author), case,
        consequenceText="La familia se calma.", feedbackText="Contener antes de informar es lo indicado.",
        theoryBasis="Primeros auxilios psicológicos.",
    )

    assert response.status_code == 200, response.data
    decision = response.data["data"]["decisions"][0]
    assert decision["consequenceText"] == "La familia se calma."
    assert decision["feedbackText"] == "Contener antes de informar es lo indicado."
    assert decision["theoryBasis"] == "Primeros auxilios psicológicos."


@pytest.mark.parametrize("field", FIELDS)
@pytest.mark.parametrize(
    "text",
    ["<script>alert(1)</script>", "Con <b>formato</b>", "Mira https://ejemplo.com", "x" * 1201],
    ids=["script", "negrita", "enlace", "mas-de-1200"],
)
def test_an_invalid_text_is_a_400_naming_the_field(author, case, field, text):
    response = _create(cl(author), case, **{field: text})

    assert response.status_code == 400, response.data
    assert response.data["field"] == field
    assert DecisionOption.objects.filter(case_version_id=case["cv"]).count() == 0


@pytest.mark.parametrize("field", FIELDS)
def test_the_cap_is_1200_inclusive(author, case, field):
    response = _create(cl(author), case, **{field: "y" * 1200})

    assert response.status_code == 200, response.data
    assert response.data["data"]["decisions"][0][field] == "y" * 1200


def test_absent_is_not_touched_and_an_empty_string_clears(author, case):
    client = cl(author)
    created = _create(
        client, case, consequenceText="Consecuencia.", feedbackText="Retro.", theoryBasis="Teoría."
    )
    decision_id = created.data["data"]["decisions"][0]["id"]

    kept = client.put(
        f"{AUTHORING}/{case['cv']}/decisions/{decision_id}", _body(case, text="Texto nuevo."), format="json"
    )
    cleared = client.put(
        f"{AUTHORING}/{case['cv']}/decisions/{decision_id}",
        _body(case, consequenceText="", theoryBasis="   "), format="json",
    )

    first = kept.data["data"]["decisions"][0]
    assert (first["consequenceText"], first["feedbackText"], first["theoryBasis"]) == (
        "Consecuencia.", "Retro.", "Teoría.",
    )
    second = cleared.data["data"]["decisions"][0]
    assert second["consequenceText"] in (None, "")
    assert second["theoryBasis"] in (None, "")
    assert second["feedbackText"] == "Retro."


def test_cloning_copies_the_three_texts(author, admin, case):
    _create(cl(author), case, consequenceText="C.", feedbackText="F.", theoryBasis="T.")

    cloned = cl(admin).post(f"{AUTHORING}/{case['cv']}/clone-version", {}, format="json")

    assert cloned.status_code == 200, cloned.data
    copy_ = DecisionOption.objects.get(case_version_id=cloned.data["data"]["caseVersionId"])
    assert (copy_.consequence_text, copy_.feedback_text, copy_.theory_basis) == ("C.", "F.", "T.")


# ─── la advertencia ───────────────────────────────────────────────────────────────────────────
def _issues(client, case):
    response = client.post(f"{AUTHORING}/{case['cv']}/validate", {}, format="json")
    assert response.status_code == 200, response.data
    return response.data["data"]


def test_validate_warns_about_a_decision_without_feedback(author, case):
    client = cl(author)
    decision = _create(client, case).data["data"]["decisions"][0]

    result = _issues(client, case)

    warnings = [i for i in result["issues"] if i["code"] == "WORLD.DECISION_WITHOUT_FEEDBACK"]
    assert len(warnings) == 1
    assert warnings[0]["severity"] == "warning"
    assert warnings[0]["nodeId"] == case["source"]
    assert str(decision["id"]) not in warnings[0]["message"]  # lenguaje llano, sin ids
    assert "Hablar con la familia" in warnings[0]["message"]


def test_a_decision_with_feedback_is_not_warned(author, case):
    client = cl(author)
    _create(client, case, feedbackText="Explicación.")
    _create(client, case, text="Otra opción.", immediateFeedback="Respuesta inmediata.")

    result = _issues(client, case)

    assert not [i for i in result["issues"] if i["code"] == "WORLD.DECISION_WITHOUT_FEEDBACK"]


# ─── la regla pura ────────────────────────────────────────────────────────────────────────────
SNAPSHOT = {
    "nodes": [
        {"id": 1, "startNode": True, "terminalNode": False, "x": 0, "y": 0},
        {"id": 2, "startNode": False, "terminalNode": True, "x": 100, "y": 0},
    ],
    "decisions": [
        {
            "id": 10, "sourceNodeId": 1, "targetNodeId": 2, "prohibitedConduct": False,
            "prohibitionReason": None, "feedbackText": None, "immediateFeedback": "",
        },
    ],
    "maps": [
        {"id": 1, "nodeId": 1, "width": 960, "height": 540, "spawnX": 100, "spawnY": 100},
        {"id": 2, "nodeId": 2, "width": 960, "height": 540, "spawnX": 100, "spawnY": 100},
    ],
    "objects": [{"id": 1, "mapId": 1, "x": 50, "y": 50, "width": 48, "height": 48, "type": "EXIT"}],
    "collisions": [],
    "dialogues": [],
    "hasSafeExit": True,
}


def _warnings(snapshot):
    return [w for w in world_validation.validate(snapshot)["warnings"] if w["code"] == "DECISION_WITHOUT_FEEDBACK"]


def test_the_rule_is_a_warning_that_does_not_block_publishing():
    result = world_validation.validate(copy.deepcopy(SNAPSHOT))

    assert result["errors"] == []
    assert result["canPublish"] is True
    assert [w["entityRef"] for w in result["warnings"] if w["code"] == "DECISION_WITHOUT_FEEDBACK"] == ["decision:10"]


@pytest.mark.parametrize("field,value", [("feedbackText", "Explicación."), ("immediateFeedback", "Bien.")])
def test_any_feedback_silences_the_warning(field, value):
    snapshot = copy.deepcopy(SNAPSHOT)
    snapshot["decisions"][0][field] = value

    assert _warnings(snapshot) == []


def test_blank_feedback_still_warns():
    snapshot = copy.deepcopy(SNAPSHOT)
    snapshot["decisions"][0]["feedbackText"] = "   "

    assert len(_warnings(snapshot)) == 1
