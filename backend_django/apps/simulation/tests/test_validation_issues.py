"""E2-8 · ``ValidationIssue``: la validación del caso con una forma única (contrato C6).

``POST …/cases/{id}/validate`` devuelve ``{issues, canPublish}``; cada ``issue`` trae un
``code`` estable (los 17 errores y los 2 avisos del validador, con prefijo ``WORLD.``), un
``message`` en lenguaje llano **sin ids** que nombra la escena o el mapa por su título, y el
``nodeId``/``mapId`` al que el editor puede llevar el foco. ``/world/validate`` conserva la
forma heredada.
"""
import ast
import re
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, SimulationCase
from apps.simulation.services import validation_issues, world_validation
from apps.simulation.services.authoring import publication

pytestmark = [pytest.mark.req("RF-12")]

User = get_user_model()
BASE = "/api/authoring/cases"


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="val_admin@x.com", password="pass1234", nombre="Ad", apellido="Min", role="ADMIN"
    )


@pytest.fixture
def owner(db):
    return User.objects.create_user(
        email="val_owner@x.com", password="pass1234", nombre="Pro", apellido="Fe", role="PROFESOR"
    )


def _codes_in_the_validator():
    source = Path(world_validation.__file__).read_text(encoding="utf-8")
    found = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Call) and getattr(node.func, "id", "") in ("_err", "_warn") and node.args:
            first = node.args[0]
            if isinstance(first, ast.Constant) and isinstance(first.value, str):
                found.add(first.value)
    return found


def test_every_code_the_validator_can_emit_has_a_plain_message():
    """Un código nuevo en el validador sin plantilla en lenguaje llano rompe esta prueba."""
    emitted = _codes_in_the_validator()

    assert len(emitted) == 20  # 17 errores + 3 avisos (#67; E3-7 añade «decisión sin retroalimentación»)
    assert emitted == set(validation_issues.PLAIN)


def test_no_plain_template_exposes_an_id():
    for code, template in validation_issues.PLAIN.items():
        assert not re.search(r"\bid\b|id=|\d", template), code


@pytest.fixture
def case(admin):
    return cl(admin).post(BASE, {"title": "Caso con problemas"}, format="json").data["data"]


def _validate(client, cv):
    response = client.post(f"{BASE}/{cv}/validate", {}, format="json")
    assert response.status_code == 200, response.data
    return response.data["data"]


def test_the_shape_is_issues_and_can_publish(admin, case):
    result = _validate(cl(admin), case["caseVersionId"])

    assert set(result) == {"issues", "canPublish"}
    assert result["canPublish"] is False
    codes = {issue["code"] for issue in result["issues"]}
    assert {"WORLD.NO_TERMINAL_NODE", "WORLD.NO_SAFE_EXIT"} <= codes
    for issue in result["issues"]:
        assert set(issue) >= {"code", "severity", "message"}
        assert issue["severity"] in ("error", "warning")
        assert issue["code"].startswith("WORLD.")


def test_messages_name_the_scene_by_its_title_and_carry_the_focus_target(admin, case):
    cv = case["caseVersionId"]
    api = cl(admin)
    start = case["nodes"][0]["id"]
    created = api.post(
        f"{BASE}/{cv}/nodes",
        {"nodeKey": "entrevista", "title": "Entrevista inicial", "narrative": "Texto"},
        format="json",
    ).data["data"]
    target = next(n for n in created["nodes"] if n["key"] == "entrevista")
    api.post(
        f"{BASE}/{cv}/decisions",
        {"sourceNodeId": start, "targetNodeId": target["id"], "text": "Ir a la entrevista",
         "classification": "ADEQUATE"},
        format="json",
    )

    result = _validate(api, cv)

    by_code = {}
    for issue in result["issues"]:
        by_code.setdefault(issue["code"], []).append(issue)
    no_options = next(i for i in by_code["WORLD.NODE_WITHOUT_OPTIONS"] if i["nodeId"] == target["id"])
    no_map = next(i for i in by_code["WORLD.NODE_WITHOUT_MAP"] if i["nodeId"] == target["id"])
    assert "«Entrevista inicial»" in no_options["message"]
    assert "«Entrevista inicial»" in no_map["message"]
    for issue in result["issues"]:
        assert not re.search(r"id\s*=|\bid\b", issue["message"]), issue["message"]
        assert str(target["id"]) not in re.findall(r"\d+", issue["message"])


def test_a_map_problem_carries_the_map_and_its_scene(admin, case):
    cv = case["caseVersionId"]
    api = cl(admin)
    world = api.get(f"{BASE}/{cv}/world-editor").data["data"]
    api.put(
        f"{BASE}/{cv}/world",
        {"revision": world["revision"], "map": {"spawnX": 99999, "spawnY": 10, "width": 960, "height": 540}},
        format="json",
    )

    result = _validate(api, cv)

    issue = next(i for i in result["issues"] if i["code"] == "WORLD.SPAWN_OUT_OF_BOUNDS")
    assert issue["mapId"] == case["maps"][0]["id"]
    assert issue["nodeId"] == case["nodes"][0]["id"]
    assert "«Escena inicial»" in issue["message"]


def test_a_valid_case_can_publish_and_its_warnings_do_not_block(admin, owner):
    seeded = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    cv = publication.clone_version(seeded.id, owner)["caseVersionId"]
    CaseVersion.objects.filter(pk=cv).update(
        simulation_case=SimulationCase.objects.create(code="VAL-OK", title="Válido", created_by=owner),
        semantic_version="0.1.0",
    )

    result = _validate(cl(owner), cv)

    assert result["canPublish"] is True
    assert not [i for i in result["issues"] if i["severity"] == "error"]


def test_a_foreign_professor_is_stopped(admin, owner, case):
    stranger = User.objects.create_user(
        email="val_stranger@x.com", password="pass1234", nombre="Ex", apellido="Traño", role="PROFESOR"
    )

    assert cl(stranger).post(f"{BASE}/{case['caseVersionId']}/validate", {}, format="json").status_code == 404


def test_the_legacy_world_validate_keeps_its_shape(admin, case):
    response = cl(admin).post(f"{BASE}/{case['caseVersionId']}/world/validate", {}, format="json")

    assert response.status_code == 200
    assert set(response.data["data"]) == {"errors", "warnings", "canPublish"}
    assert all({"severity", "code", "message", "entityRef"} <= set(e) for e in response.data["data"]["errors"])


def test_a_blocked_submit_reports_the_plain_issues(admin, owner):
    case = cl(owner).post(BASE, {"title": "Caso a medias"}, format="json").data["data"]
    cv = case["caseVersionId"]
    cl(owner).put(
        f"{BASE}/{cv}/checklist",
        {code: True for code in ("contentOriginal", "ethicsReviewed", "safetyProtocols",
                                 "noStigmatizing", "triggerWarnings", "accessibilityOk")},
        format="json",
    )

    response = cl(owner).post(f"{BASE}/{cv}/lifecycle", {"action": "submit"}, format="json")

    assert response.status_code == 409
    blocker = next(b for b in response.data["blockers"] if b["code"] == "VALIDATION_ERRORS")
    assert blocker["issues"] and all(i["code"].startswith("WORLD.") for i in blocker["issues"])
