"""E4-2b · La validación única de una versión: el mundo y el documento juntos (RF-12, RN-05, LS-14, LS-15).

``validate_version`` junta lo que ve el validador del mundo (``WORLD.*``, sobre las filas) con lo que ve el
validador del documento (``DSL.*``, sobre el documento canónico que se exporta de la versión: la forma y
las 16 reglas del taller, ``x-siep``, los textos y los límites). Lo que publica es lo que se validó. Un
defecto que ven los dos sale una vez, con el código del mundo; los mensajes nombran por título y no llevan
ids de DSL; ``POST …/validate`` y los bloqueos de publicación cuentan los dos tipos.
"""
import copy
import re

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.simulation.casedef import siep_check
from apps.simulation.models import CaseVersion, DecisionOption, DialogueLine, SimulationNode
from apps.simulation.services import case_effects
from apps.simulation.services.authoring import definition_io, lifecycle, publication, validation
from apps.simulation.services.authoring.world_definition import run_world_validation

pytestmark = [pytest.mark.req("RF-12"), pytest.mark.req("RN-05"), pytest.mark.req("LS-14"), pytest.mark.req("LS-15")]

User = get_user_model()
BASE = "/api/authoring/cases"
DSL_ID = re.compile(r"\b(?:RUB-\d{2,}|CR\d{2,}|OP\d{2,}|E\d{2,}|D\d{2,}|P\d{2,}|H\d{2,}|R\d{2,})\b")


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="uni_admin@x.com", password="pass1234", nombre="Ad", apellido="Min", role="ADMIN"
    )


@pytest.fixture
def case(admin):
    return cl(admin).post(BASE, {"title": "Caso a medias"}, format="json").data["data"]


@pytest.fixture
def seeded(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")


def _codes(issues):
    return {issue["code"] for issue in issues}


def _one_option_case(admin, case):
    """Un borrador cuya escena inicial tiene una decisión de una sola opción hacia «Entrevista inicial»."""
    cv, api = case["caseVersionId"], cl(admin)
    start = case["nodes"][0]["id"]
    created = api.post(
        f"{BASE}/{cv}/nodes", {"nodeKey": "entrevista", "title": "Entrevista inicial", "narrative": "Texto"}, format="json"
    ).data["data"]
    target = next(n for n in created["nodes"] if n["key"] == "entrevista")
    api.post(
        f"{BASE}/{cv}/decisions",
        {"sourceNodeId": start, "targetNodeId": target["id"], "text": "Ir a la entrevista", "classification": "ADEQUATE"},
        format="json",
    )
    return cv, start, target["id"], api


# ─── el caso sembrado ─────────────────────────────────────────────────────────────────────────
def test_the_seeded_case_has_no_errors(seeded):
    issues, can_publish = validation.validate_version(seeded.id)

    assert [issue for issue in issues if issue["severity"] == "error"] == []
    assert can_publish is True


def test_the_default_metrics_copy_matches_the_service_constant():
    """``casedef`` no importa Django: copia las siete métricas por defecto y esta prueba vigila la copia."""
    assert siep_check.DEFAULT_METRICS == tuple(case_effects.CASE_METRIC_KEYS)


# ─── lo que ve el documento, con el foco del editor ───────────────────────────────────────────
def test_a_decision_with_one_option_names_the_scene_by_its_title_and_carries_the_focus(admin, case):
    cv, start, _, _ = _one_option_case(admin, case)

    issues, can_publish = validation.validate_version(cv)

    issue = next(i for i in issues if i["code"] == "DSL.OCL-02")
    assert issue["severity"] == "error" and can_publish is False
    assert issue["nodeId"] == start
    assert issue["path"] == "escenas[0].decision.opciones"
    assert f"«{case['nodes'][0]['title']}»" in issue["message"]
    assert not DSL_ID.search(issue["message"]), issue["message"]


def test_every_document_message_is_free_of_dsl_ids(admin, case):
    cv, *_ = _one_option_case(admin, case)

    issues, _ = validation.validate_version(cv)

    for issue in issues:
        assert not DSL_ID.search(issue["message"]), (issue["code"], issue["message"])


def test_markup_stored_in_a_scene_narrative_is_reported_with_the_scene_focus(admin, case):
    start = case["nodes"][0]["id"]
    SimulationNode.objects.filter(pk=start).update(narrative="Mira <img src=x onerror=alert(1)> esto")

    issues, can_publish = validation.validate_version(case["caseVersionId"])

    issue = next(i for i in issues if i["code"] == "DSL.TEXT_MARKUP")
    assert issue["path"] == "escenas[0].descripcion" and issue["nodeId"] == start
    assert can_publish is False


def test_a_problem_inside_a_map_carries_the_node_and_the_map(seeded, admin):
    version = publication.clone_version(seeded.id, admin)["caseVersionId"]
    loaded = definition_io.load_definition(version)
    position, scene = next(
        (n, scene) for n, scene in enumerate(loaded.definition.scenes)
        if scene.key in loaded.scene_map_ids
        and DialogueLine.objects.filter(dialogue_tree__scene_map_id=loaded.scene_map_ids[scene.key]).exists()
    )
    map_id = loaded.scene_map_ids[scene.key]
    line = DialogueLine.objects.filter(dialogue_tree__scene_map_id=map_id).first()
    DialogueLine.objects.filter(pk=line.pk).update(text="Pulsa javascript:alert(1) ya")

    issues, _ = validation.validate_version(version)

    issue = next(i for i in issues if i["code"] == "DSL.TEXT_LINK")
    assert issue["nodeId"] == loaded.scene_node_ids[scene.key] and issue["mapId"] == map_id
    assert issue["path"].startswith(f"x-siep.escenas[{position}].mapa.dialogos")


def test_a_case_created_without_a_description_is_unblocked_by_writing_its_context(admin):
    """La descripción del caso no se edita después de crearlo; el contexto sí: con él basta (OCL-07)."""
    created = cl(admin).post(BASE, {"title": "Sin descripción"}, format="json").data["data"]
    cv = created["caseVersionId"]
    issues, _ = validation.validate_version(cv)
    assert "DSL.OCL-07" in _codes(issues)

    saved = cl(admin).put(f"{BASE}/{cv}/brief", {"context": "Un equipo discute su proyecto."}, format="json")
    assert saved.status_code == 200, saved.data
    issues, _ = validation.validate_version(cv)
    assert "DSL.OCL-07" not in _codes(issues)


# ─── el mundo y el documento sin repetirse ────────────────────────────────────────────────────
def test_without_scenes_only_the_world_reports_it(case):
    SimulationNode.objects.filter(case_version_id=case["caseVersionId"]).delete()

    issues, can_publish = validation.validate_version(case["caseVersionId"])

    assert "WORLD.NO_NODES" in _codes(issues) and can_publish is False
    assert "DSL.OCL-01" not in _codes(issues)
    assert not [i for i in issues if i.get("path") in ("escenas", "caso.escenaInicial")]
    assert not [i for i in issues if i.get("path") == "caso" and "escenaInicial" in i["message"]]


def test_without_a_start_scene_only_the_world_reports_it(case):
    SimulationNode.objects.filter(case_version_id=case["caseVersionId"]).update(start_node=False)

    issues, _ = validation.validate_version(case["caseVersionId"])

    assert "WORLD.NO_START_NODE" in _codes(issues)
    assert not [i for i in issues if i.get("path") == "caso.escenaInicial"]
    assert not [i for i in issues if i.get("path") == "caso" and "escenaInicial" in i["message"]]


def test_a_cycle_is_reported_once_by_the_world(admin, case):
    cv, start, target, api = _one_option_case(admin, case)
    api.post(
        f"{BASE}/{cv}/decisions",
        {"sourceNodeId": target, "targetNodeId": start, "text": "Volver", "classification": "ADEQUATE"},
        format="json",
    )

    issues, _ = validation.validate_version(cv)

    assert "WORLD.GRAPH_CYCLE" in _codes(issues)
    assert "DSL.PROP-06" not in _codes(issues)


def test_a_prohibited_option_without_a_reason_is_reported_once_by_the_world(admin, case):
    cv, *_ = _one_option_case(admin, case)
    DecisionOption.objects.filter(case_version_id=cv).update(prohibited_conduct=True, prohibition_reason=None)

    issues, _ = validation.validate_version(cv)

    assert "WORLD.PROHIBITED_WITHOUT_REASON" in _codes(issues)
    assert not [i for i in issues if i["code"] == "DSL.FORMA" and "motivoProhibicion" in i["message"]]


def test_the_world_issues_come_first_and_the_document_ones_after(admin, case):
    cv, *_ = _one_option_case(admin, case)

    issues, _ = validation.validate_version(cv)

    prefixes = [issue["code"].split(".")[0] for issue in issues]
    assert prefixes == sorted(prefixes, key=["WORLD", "DSL"].index)
    assert {"WORLD", "DSL"} <= set(prefixes)


# ─── los puntos de entrada ────────────────────────────────────────────────────────────────────
def test_the_validate_endpoint_returns_both_kinds_together(admin, case):
    cv, *_ = _one_option_case(admin, case)

    response = cl(admin).post(f"{BASE}/{cv}/validate", {}, format="json")

    assert response.status_code == 200, response.data
    result = response.data["data"]
    assert set(result) == {"issues", "canPublish"} and result["canPublish"] is False
    assert {"WORLD", "DSL"} <= {issue["code"].split(".")[0] for issue in result["issues"]}
    assert all(
        "path" in issue for issue in result["issues"] if issue["code"].startswith("DSL.")
    )


def test_the_publishing_blockers_count_both_kinds(admin, case):
    cv, *_ = _one_option_case(admin, case)

    blockers = lifecycle.publishing_blockers(CaseVersion.objects.get(pk=cv))

    blocker = next(b for b in blockers if b["code"] == "VALIDATION_ERRORS")
    assert {"WORLD", "DSL"} <= {issue["code"].split(".")[0] for issue in blocker["issues"]}
    assert f"{len(blocker['issues'])} error(es)" in blocker["message"]
    assert all(issue["severity"] == "error" for issue in blocker["issues"])


def test_a_valid_clone_of_the_seeded_case_still_publishes_without_errors(seeded, admin):
    version = publication.clone_version(seeded.id, admin)["caseVersionId"]

    issues, can_publish = validation.validate_version(version)

    assert can_publish is True, [i for i in issues if i["severity"] == "error"]


# ─── el documento suelto (la importación) ─────────────────────────────────────────────────────
@pytest.fixture
def document(seeded):
    return copy.deepcopy(definition_io.export_definition(seeded.id))


def test_a_loose_document_is_validated_with_paths_and_without_focus(document):
    document["x-siep"]["escenas"][0]["sobra"] = 1

    issues, can_publish = validation.validate_document_issues(document)

    issue = next(i for i in issues if i["code"] == "DSL.SIEP_SCHEMA")
    assert issue["path"] == "x-siep.escenas[0]" and "nodeId" not in issue
    assert can_publish is False


def test_the_exported_seeded_document_is_valid_as_a_loose_document(document):
    issues, can_publish = validation.validate_document_issues(document)

    assert [i for i in issues if i["severity"] == "error"] == [] and can_publish is True


def test_a_loose_document_with_an_unknown_reference_a_bad_condition_and_hostile_text_is_rejected(document):
    siep = document["x-siep"]
    entry = next(e for e in siep["escenas"] if e.get("mapa") and e["mapa"]["objetos"])
    entry["mapa"]["objetos"][0]["opcion"] = "no-existe"
    siep["reglas"]["endings"][0]["when"] = {"eval": "x"}
    document["escenas"][0]["descripcion"] = "<img src=x onerror=alert(1)>"
    document["escenas"][0]["decision"]["pistas"] = ["Mira https://ejemplo.org"]

    issues, can_publish = validation.validate_document_issues(document)

    assert {"DSL.SIEP_REF", "DSL.SIEP_CONDITION", "DSL.TEXT_MARKUP", "DSL.TEXT_LINK"} <= _codes(issues)
    assert can_publish is False


def test_an_https_link_in_a_dialogue_line_is_fine_but_not_in_a_hint(document):
    entry = next(e for e in document["x-siep"]["escenas"] if e.get("mapa") and e["mapa"]["dialogos"])
    entry["mapa"]["dialogos"][0]["lineas"][0]["texto"] = "Guía en https://ejemplo.org"
    issues, _ = validation.validate_document_issues(document)
    assert "DSL.TEXT_LINK" not in _codes(issues)

    document["escenas"][0]["decision"]["pistas"] = ["Guía en https://ejemplo.org"]
    issues, _ = validation.validate_document_issues(document)
    assert "DSL.TEXT_LINK" in _codes(issues)


def test_too_many_scenes_in_a_loose_document_exceed_the_limit(document):
    template = document["escenas"][-1]
    document["escenas"] = [{**template, "id": f"E{n:03d}", "orden": n} for n in range(1, 202)]

    issues, can_publish = validation.validate_document_issues(document)

    assert "DSL.LIMIT_EXCEEDED" in _codes(issues) and can_publish is False


# ─── consultas constantes ─────────────────────────────────────────────────────────────────────
def _queries(action):
    with CaptureQueriesContext(connection) as captured:
        action()
    return len(captured)


def test_the_validation_queries_do_not_grow_with_the_number_of_scenes(seeded, admin):
    small = cl(admin).post(BASE, {"title": "Caso pequeño"}, format="json").data["data"]["caseVersionId"]
    big = publication.clone_version(seeded.id, admin)["caseVersionId"]  # ocho escenas con su mapa

    for action in (
        lambda version: run_world_validation(CaseVersion.objects.get(pk=version)),
        validation.validate_version,
    ):
        assert _queries(lambda: action(small)) == _queries(lambda: action(big))
