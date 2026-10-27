"""P5 · Tarea 5 · La marca «sugerido por la IA» se guarda, se baja al revisar y bloquea el envío.

Todo va por HTTP: crear con ``aiSuggested`` (nodo, decisión, objeto, línea de diálogo y final), los cuatro
``POST …/accept-ai`` (solo el autor; revisión; auditoría), la compuerta del ciclo de vida y el clon de la versión.
"""
import json

import pytest
from django.contrib.auth import get_user_model

from apps.simulation.models import (
    AuditLog,
    CaseVersion,
    DecisionOption,
    DialogueLine,
    MapObject,
    SimulationNode,
)
from apps.simulation.services.authoring import gate

from .test_case_lifecycle import _draft_owned_by, _post, cl

pytestmark = [pytest.mark.req("RF-05"), pytest.mark.req("RF-13")]

User = get_user_model()
AUTHORING = "/api/authoring/cases"


def _user(email, role):
    return User.objects.create_user(email=email, password="pass1234", nombre="N", apellido="A", role=role)


@pytest.fixture
def prof(db):
    return _user("ai_prof@x.com", "PROFESOR")


@pytest.fixture
def prof_b(db):
    return _user("ai_prof_b@x.com", "PROFESOR")


@pytest.fixture
def admin(db):
    return _user("ai_admin@x.com", "ADMIN")


def _editor(client, cv):
    return client.get(f"{AUTHORING}/{cv}/editor").data["data"]


def _with_rev(client, cv, body=None):
    return {**(body or {}), "revision": _editor(client, cv)["revision"]}


def _marked_draft(prof):
    """Un borrador del autor con UNA parte marcada de cada clase: nodo, decisión, objeto, diálogo (dos líneas) y final."""
    cv = _draft_owned_by(prof)
    client = cl(prof)
    base = f"{AUTHORING}/{cv}"
    editor = _editor(client, cv)
    node_a, node_b = editor["nodes"][0], editor["nodes"][1]
    scene_map = editor["maps"][0]

    # Un nodo existente se marca al reescribirlo: un nodo suelto nuevo sería un error de validación que taparía la compuerta.
    body = {
        "nodeKey": node_b["key"], "title": node_b["title"], "narrative": node_b["narrative"],
        "terminal": node_b["terminal"], "startNode": node_b["startNode"], "aiSuggested": True,
        "sensitiveContent": node_b["sensitiveContent"], "safeExitRequired": node_b["safeExitRequired"],
        "warningMessage": node_b["warningMessage"], "intensity": node_b["intensity"],
        "positionX": node_b["positionX"], "positionY": node_b["positionY"],
    }
    r = client.put(f"{base}/nodes/{node_b['id']}", _with_rev(client, cv, body), format="json")
    assert r.status_code == 200, r.data
    node = next(n for n in r.data["data"]["nodes"] if n["id"] == node_b["id"])

    r = client.post(f"{base}/decisions", _with_rev(client, cv, {
        "sourceNodeId": node_a["id"], "targetNodeId": node_b["id"], "text": "Opción de la IA",
        "responseClass": "ACCEPTABLE", "optionKey": "ia-opcion", "aiSuggested": True}), format="json")
    assert r.status_code == 200, r.data
    decision = next(d for d in r.data["data"]["decisions"] if d["optionKey"] == "ia-opcion")

    r = client.post(f"{base}/maps/{scene_map['id']}/objects", _with_rev(client, cv, {
        "objectKey": "ia-objeto", "label": "Objeto de la IA", "objectType": "PROP", "aiSuggested": True,
        "decisionOptionId": decision["id"]}),
        format="json")
    assert r.status_code == 200, r.data
    obj = next(o for o in r.data["data"]["objects"] if o["key"] == "ia-objeto")

    r = client.post(f"{base}/maps/{scene_map['id']}/dialogues", _with_rev(client, cv, {
        "treeKey": "ia-dialogo", "speakerName": "Voz", "lines": [
            {"displayOrder": 1, "text": "Primera", "aiSuggested": True},
            {"displayOrder": 2, "text": "Segunda", "aiSuggested": True},
            {"displayOrder": 3, "text": "Propia"},
        ]}), format="json")
    assert r.status_code == 200, r.data
    tree_id = DialogueLine.objects.get(
        dialogue_tree__tree_key="ia-dialogo", dialogue_tree__scene_map__case_version_id=cv, display_order=1
    ).dialogue_tree_id

    endings = _editor(client, cv)["rules"]["endings"] + [
        {"key": "ia_final", "title": "Final de la IA", "message": "M", "tone": "neutral", "aiSuggested": True}]
    r = client.put(f"{base}/rules/endings", _with_rev(client, cv, {"endings": endings}), format="json")
    assert r.status_code == 200, r.data
    return cv, {"node": node["id"], "decision": decision["id"], "object": obj["id"], "tree": tree_id}


# ─── crear con la marca ────────────────────────────────────────────────────────────────────────
def test_creating_with_ai_suggested_stores_it_and_the_editor_shows_it(prof):
    cv, ids = _marked_draft(prof)
    client = cl(prof)

    assert SimulationNode.objects.get(pk=ids["node"]).ai_suggested is True
    assert DecisionOption.objects.get(pk=ids["decision"]).ai_suggested is True
    assert MapObject.objects.get(pk=ids["object"]).ai_suggested is True
    assert list(
        DialogueLine.objects.filter(dialogue_tree_id=ids["tree"]).order_by("display_order").values_list("ai_suggested", flat=True)
    ) == [True, True, False]
    editor = _editor(client, cv)
    assert next(n for n in editor["nodes"] if n["id"] == ids["node"])["aiSuggested"] is True
    assert next(d for d in editor["decisions"] if d["id"] == ids["decision"])["aiSuggested"] is True
    assert next(o for o in editor["objects"] if o["id"] == ids["object"])["aiSuggested"] is True
    endings = {e["key"]: e["aiSuggested"] for e in editor["rules"]["endings"]}
    assert endings["ia_final"] is True
    assert not any(value for key, value in endings.items() if key != "ia_final")
    # lo no marcado nace en falso
    assert next(n for n in editor["nodes"] if n["id"] != ids["node"])["aiSuggested"] is False

    world = client.get(f"{AUTHORING}/{cv}/world-editor").data["data"]
    marks = [line["aiSuggested"] for tree in world["dialogues"] if tree["id"] == ids["tree"] for line in tree["lines"]]
    assert marks == [True, True, False]


def test_updating_without_the_flag_leaves_the_mark_and_with_it_overwrites(prof):
    cv, ids = _marked_draft(prof)
    client = cl(prof)
    node = next(n for n in _editor(client, cv)["nodes"] if n["id"] == ids["node"])
    body = {"nodeKey": node["key"], "title": "Otro título", "narrative": "N"}

    r = client.put(f"{AUTHORING}/{cv}/nodes/{ids['node']}", _with_rev(client, cv, body), format="json")
    assert r.status_code == 200, r.data
    assert SimulationNode.objects.get(pk=ids["node"]).ai_suggested is True  # ausente = no tocar

    r = client.put(f"{AUTHORING}/{cv}/nodes/{ids['node']}", _with_rev(client, cv, {**body, "aiSuggested": False}), format="json")
    assert r.status_code == 200, r.data
    assert SimulationNode.objects.get(pk=ids["node"]).ai_suggested is False


def test_replacing_a_dialogue_keeps_the_marks_of_lines_that_do_not_say_otherwise(prof):
    cv, ids = _marked_draft(prof)
    client = cl(prof)
    body = _with_rev(client, cv, {"treeKey": "ia-dialogo", "speakerName": "Voz", "lines": [
        {"displayOrder": 1, "text": "Primera editada"},
        {"displayOrder": 2, "text": "Segunda revisada", "aiSuggested": False},
    ]})

    r = client.put(f"{AUTHORING}/{cv}/dialogues/{ids['tree']}", body, format="json")

    assert r.status_code == 200, r.data
    assert list(
        DialogueLine.objects.filter(dialogue_tree_id=ids["tree"]).order_by("display_order").values_list("ai_suggested", flat=True)
    ) == [True, False]


def _put_endings(client, cv, endings):
    return client.put(f"{AUTHORING}/{cv}/rules/endings", _with_rev(client, cv, {"endings": endings}), format="json")


def _bare(endings):
    """Los finales como los manda un cliente que no conoce ``aiSuggested``: sin la clave."""
    return [{k: v for k, v in e.items() if k != "aiSuggested"} for e in endings]


def test_a_put_that_omits_the_ending_flag_keeps_the_mark_and_the_gate_still_blocks(prof):
    cv, ids = _marked_draft(prof)
    client = cl(prof)
    base = f"{AUTHORING}/{cv}"
    for segment, key in (("nodes", "node"), ("decisions", "decision"), ("objects", "object"), ("dialogues", "tree")):
        assert client.post(f"{base}/{segment}/{ids[key]}/accept-ai", _with_rev(client, cv), format="json").status_code == 200
    assert gate.ai_suggested_count(CaseVersion.objects.get(pk=cv)) == 1  # solo queda el final

    r = _put_endings(client, cv, _bare(_editor(client, cv)["rules"]["endings"]))

    assert r.status_code == 200, r.data
    endings = {e["key"]: e["aiSuggested"] for e in _editor(client, cv)["rules"]["endings"]}
    assert endings["ia_final"] is True
    assert gate.ai_suggested_count(CaseVersion.objects.get(pk=cv)) == 1
    blocked = _post(client, cv, action="submit")
    assert blocked.status_code == 409
    assert [b["code"] for b in blocked.data["blockers"]] == ["AI_SUGGESTED_UNREVIEWED"]


def test_an_explicit_false_lowers_the_ending_mark_and_an_explicit_true_raises_it(prof):
    cv, _ = _marked_draft(prof)
    client = cl(prof)
    endings = _editor(client, cv)["rules"]["endings"]

    lowered = [{**e, "aiSuggested": False} if e["key"] == "ia_final" else e for e in endings]
    assert _put_endings(client, cv, lowered).status_code == 200
    assert {e["key"]: e["aiSuggested"] for e in _editor(client, cv)["rules"]["endings"]}["ia_final"] is False

    raised = [{**e, "aiSuggested": True} if e["key"] == "ia_final" else e for e in _editor(client, cv)["rules"]["endings"]]
    assert _put_endings(client, cv, raised).status_code == 200
    assert {e["key"]: e["aiSuggested"] for e in _editor(client, cv)["rules"]["endings"]}["ia_final"] is True


def test_a_renamed_ending_key_starts_without_the_mark(prof):
    cv, _ = _marked_draft(prof)
    client = cl(prof)
    renamed = [
        {**e, "key": "ia_final_renombrado"} if e["key"] == "ia_final" else e
        for e in _bare(_editor(client, cv)["rules"]["endings"])
    ]

    assert _put_endings(client, cv, renamed).status_code == 200

    endings = {e["key"]: e["aiSuggested"] for e in _editor(client, cv)["rules"]["endings"]}
    assert endings["ia_final_renombrado"] is False
    assert "ia_final" not in endings


def test_an_ending_mark_must_be_a_boolean(prof):
    cv = _draft_owned_by(prof)
    client = cl(prof)
    ending = {"key": "f", "title": "T", "message": "M", "aiSuggested": "si"}

    r = client.put(f"{AUTHORING}/{cv}/rules/endings", _with_rev(client, cv, {"endings": [ending]}), format="json")

    assert r.status_code == 400
    assert r.data["field"] == "endings"


# ─── aceptar ───────────────────────────────────────────────────────────────────────────────────
ROUTES = [
    ("node", "nodes", "ADMIN_ACCEPT_AI_NODE", "ia.aceptar_nodo"),
    ("decision", "decisions", "ADMIN_ACCEPT_AI_DECISION", "ia.aceptar_decision"),
    ("object", "objects", "ADMIN_ACCEPT_AI_OBJECT", "ia.aceptar_objeto"),
    ("tree", "dialogues", "ADMIN_ACCEPT_AI_DIALOGUE", "ia.aceptar_dialogo"),
]


def _marks(ids):
    return {
        "node": SimulationNode.objects.get(pk=ids["node"]).ai_suggested,
        "decision": DecisionOption.objects.get(pk=ids["decision"]).ai_suggested,
        "object": MapObject.objects.get(pk=ids["object"]).ai_suggested,
        "tree": DialogueLine.objects.filter(dialogue_tree_id=ids["tree"], ai_suggested=True).exists(),
    }


@pytest.mark.parametrize("kind,segment,action,taxonomy", ROUTES)
def test_accept_lowers_the_mark_audits_it_and_is_idempotent(prof, kind, segment, action, taxonomy):
    cv, ids = _marked_draft(prof)
    client = cl(prof)
    before = _editor(client, cv)["revision"]
    url = f"{AUTHORING}/{cv}/{segment}/{ids[kind]}/accept-ai"

    r = client.post(url, {"revision": before}, format="json")

    assert r.status_code == 200, r.data
    assert r.data["message"] == "Parte revisada"
    assert r.data["data"]["caseVersionId"] == cv and r.data["data"]["revision"] == before + 1
    assert _marks(ids)[kind] is False
    assert all(value for other, value in _marks(ids).items() if other != kind)  # las demás siguen marcadas
    row = AuditLog.objects.get(action=action, resource_id=str(cv))
    assert (row.actor_id, row.resource_type) == (prof.id, "CASE_VERSION")
    assert json.loads(row.context_json)["taxonomy"] == taxonomy

    again = client.post(url, {"revision": before + 1}, format="json")
    assert again.status_code == 200, again.data
    assert _marks(ids)[kind] is False


def test_accepting_a_dialogue_lowers_every_line_of_the_tree(prof):
    cv, ids = _marked_draft(prof)
    client = cl(prof)

    r = client.post(f"{AUTHORING}/{cv}/dialogues/{ids['tree']}/accept-ai", _with_rev(client, cv), format="json")

    assert r.status_code == 200
    assert not DialogueLine.objects.filter(dialogue_tree_id=ids["tree"], ai_suggested=True).exists()


@pytest.mark.parametrize("kind,segment,action,taxonomy", ROUTES)
def test_only_the_author_can_accept(prof, prof_b, admin, kind, segment, action, taxonomy):
    cv, ids = _marked_draft(prof)
    url = f"{AUTHORING}/{cv}/{segment}/{ids[kind]}/accept-ai"

    foreign = cl(prof_b).post(url, {}, format="json")

    assert foreign.status_code == 403
    assert _marks(ids)[kind] is True
    assert not AuditLog.objects.filter(action=action).exists()
    assert cl(admin).post(url, {}, format="json").status_code == 200  # el ADMIN puede por la política


def test_accept_with_a_stale_revision_is_a_conflict(prof, admin):
    cv, ids = _marked_draft(prof)
    stale = _editor(cl(prof), cv)["revision"]
    other = cl(admin)  # otra persona edita después: la revisión de la autora ya no es de su tanda
    assert other.post(f"{AUTHORING}/{cv}/nodes/{ids['node']}/accept-ai", _with_rev(other, cv), format="json").status_code == 200

    r = cl(prof).post(f"{AUTHORING}/{cv}/decisions/{ids['decision']}/accept-ai", {"revision": stale}, format="json")

    assert r.status_code == 409
    assert r.data["code"] == "REVISION_CONFLICT"
    assert DecisionOption.objects.get(pk=ids["decision"]).ai_suggested is True


def test_accepting_an_element_that_is_not_in_the_version_is_refused(prof):
    cv, ids = _marked_draft(prof)
    other_cv, other_ids = _marked_draft(prof)
    client = cl(prof)

    missing = client.post(f"{AUTHORING}/{cv}/nodes/99999999/accept-ai", _with_rev(client, cv), format="json")
    foreign = client.post(f"{AUTHORING}/{cv}/nodes/{other_ids['node']}/accept-ai", _with_rev(client, cv), format="json")

    assert missing.status_code == 404
    assert foreign.status_code == 400  # ``guards.in_version``: existe, pero es de otra versión
    assert SimulationNode.objects.get(pk=other_ids["node"]).ai_suggested is True


# ─── la compuerta ──────────────────────────────────────────────────────────────────────────────
def test_submit_is_blocked_with_the_count_until_everything_is_accepted(prof):
    cv, ids = _marked_draft(prof)
    client = cl(prof)
    base = f"{AUTHORING}/{cv}"
    expected = 1 + 1 + 1 + 2 + 1  # nodo, decisión, objeto, dos líneas, final

    blocked = _post(client, cv, action="submit")

    assert blocked.status_code == 409
    assert blocked.data["code"] == "CASE_NOT_PUBLISHABLE"
    assert f"{expected} parte(s) sugeridas por la IA sin revisar." in blocked.data["message"]
    assert [b["code"] for b in blocked.data["blockers"]] == ["AI_SUGGESTED_UNREVIEWED"]
    assert CaseVersion.objects.get(pk=cv).status == "DRAFT"
    assert gate.blockers_of(CaseVersion.objects.get(pk=cv))[0]["code"] == "AI_SUGGESTED_UNREVIEWED"

    for segment, key in (("nodes", "node"), ("decisions", "decision"), ("objects", "object"), ("dialogues", "tree")):
        r = client.post(f"{base}/{segment}/{ids[key]}/accept-ai", _with_rev(client, cv), format="json")
        assert r.status_code == 200, r.data
    ending = _editor(client, cv)["rules"]["endings"]
    ending = [{**e, "aiSuggested": False} for e in ending]
    assert client.put(f"{base}/rules/endings", _with_rev(client, cv, {"endings": ending}), format="json").status_code == 200

    assert gate.ai_suggested_count(CaseVersion.objects.get(pk=cv)) == 0
    assert _post(client, cv, action="submit").status_code == 200
    assert CaseVersion.objects.get(pk=cv).status == "IN_REVIEW"


def _clone_of_node(clone, node_id):
    key = SimulationNode.objects.get(pk=node_id).node_key
    return SimulationNode.objects.get(case_version_id=clone, node_key=key).id


# ─── clonar ────────────────────────────────────────────────────────────────────────────────────
def test_cloning_a_version_keeps_the_marks(prof):
    cv, ids = _marked_draft(prof)

    r = cl(prof).post(f"{AUTHORING}/{cv}/clone-version", {}, format="json")

    assert r.status_code == 200, r.data
    clone = r.data["data"]["caseVersionId"]
    editor = _editor(cl(prof), clone)
    assert [n["id"] for n in editor["nodes"] if n["aiSuggested"]] == [_clone_of_node(clone, ids["node"])]
    assert [d["optionKey"] for d in editor["decisions"] if d["aiSuggested"]] == ["ia-opcion"]
    assert [o["key"] for o in editor["objects"] if o["aiSuggested"]] == ["ia-objeto"]
    assert [e["key"] for e in editor["rules"]["endings"] if e["aiSuggested"]] == ["ia_final"]
    assert DialogueLine.objects.filter(dialogue_tree__scene_map__case_version_id=clone, ai_suggested=True).count() == 2
    assert gate.ai_suggested_count(CaseVersion.objects.get(pk=clone)) == 6
