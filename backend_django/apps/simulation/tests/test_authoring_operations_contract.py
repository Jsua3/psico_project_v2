"""P-05b — Las 28 operaciones de autoría de ``authoring_service``, una por una.

Antes de partir ``authoring_service.py`` en un subsistema detrás de una fachada, esta
prueba fija qué hace cada operación que usan las vistas: qué responde (código y
mensaje), qué escribe y qué deja en la auditoría (acción, tipo de recurso, id y el
``context`` con el nombre y el módulo de la función auditada). Las operaciones que ya
tenían prueba en ``test_authoring.py`` y ``test_audit.py`` (editor, clonar, publicar,
checklist, mundo) se repiten aquí solo en lo que cambia al mover el código.

Todo va por HTTP contra el caso sembrado SIM-VBG-001, sobre un borrador clonado.

El último bloque (desde «lo que mover el código podía perder») se añadió después de la
primera ronda de mutaciones: cada prueba de ahí mata una mutación que las anteriores,
y las de `test_authoring.py`, dejaban pasar. Se comprobó que también pasan sobre el
código original, el de antes de partirlo.
"""
import json
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import (
    AuditLog,
    CaseVersion,
    ClinicalTool,
    DecisionOption,
    DialogueLine,
    DialogueTree,
    MapObject,
    PublicationChecklist,
    SceneMap,
    SimulationCase,
    SimulationNode,
)
from apps.simulation.services.case_cloning import CopySpec

User = get_user_model()
BASE = "/api/admin/cases"


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="admin_ops@x.com", password="x", nombre="Ad", apellido="Ops", role="ADMIN"
    )


@pytest.fixture
def published_cv(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id


@pytest.fixture
def api(admin):
    return cl(admin)


@pytest.fixture
def draft(api, published_cv):
    """Un borrador clonado de la versión publicada sembrada."""
    resp = api.post(f"{BASE}/{published_cv}/clone-version")
    assert resp.status_code == 200, resp.data
    return resp.data["data"]["caseVersionId"]


def _editor(api, cv):
    return api.get(f"{BASE}/{cv}/editor").data["data"]


def _audit(action, resource_id, admin):
    rows = AuditLog.objects.filter(action=action, resource_id=str(resource_id), actor_id=admin.id)
    row = rows.order_by("-id").first()
    assert row is not None, f"sin auditoría {action} para {resource_id}"
    return row


def _assert_audited(admin, action, resource_type, resource_id, method):
    row = _audit(action, resource_id, admin)
    assert row.resource_type == resource_type
    assert row.actor_role == "ADMIN"
    context = json.loads(row.context_json)
    assert context == {"method": method, "class": "authoring_service"}


def _new_node(api, cv, key="extra-p05b"):
    resp = api.post(
        f"{BASE}/{cv}/nodes",
        {"nodeKey": key, "title": "Extra", "narrative": "N", "requiredTools": [], "supportResources": []},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    return next(n for n in resp.data["data"]["nodes"] if n["key"] == key)


# ── casos ────────────────────────────────────────────────────────────────────
def test_crear_un_caso_no_deja_rastro_de_auditoria_hoy(api, admin):
    """Comportamiento actual: `create_case` no está auditada (a diferencia del resto de mutaciones)."""
    before = AuditLog.objects.filter(action__startswith="ADMIN_").count()

    resp = api.post(BASE, {"title": "Caso sin rastro", "code": "P05B-SIN-RASTRO"}, format="json")

    assert resp.status_code == 200
    assert AuditLog.objects.filter(action__startswith="ADMIN_").count() == before


def test_la_lista_de_casos_trae_las_versiones_de_los_casos_activos(api, draft, published_cv):
    resp = api.get(BASE)

    assert resp.status_code == 200
    ids = {item["caseVersionId"] for item in resp.data["data"]}
    assert {draft, published_cv} <= ids
    assert {"caseVersionId", "code", "title", "status", "nodeCount"} <= set(resp.data["data"][0])


# ── nodos ────────────────────────────────────────────────────────────────────
def test_actualizar_un_nodo(api, admin, draft):
    node = _new_node(api, draft)

    resp = api.put(
        f"{BASE}/{draft}/nodes/{node['id']}",
        {"nodeKey": "extra-editado", "title": "Título nuevo", "narrative": "Texto nuevo",
         "requiredTools": ["PAP"], "supportResources": ["Línea 106"], "terminal": True,
         "positionX": 7, "positionY": 9},
        format="json",
    )

    assert resp.status_code == 200
    assert resp.data["message"] == "Nodo actualizado"
    updated = next(n for n in resp.data["data"]["nodes"] if n["id"] == node["id"])
    assert (updated["key"], updated["title"], updated["terminal"]) == ("extra-editado", "Título nuevo", True)
    assert updated["requiredTools"] == ["PAP"] and updated["supportResources"] == ["Línea 106"]
    assert (updated["positionX"], updated["positionY"]) == (7, 9)
    _assert_audited(admin, "ADMIN_UPDATE_NODE", "NODE", node["id"], "update_node")


def test_eliminar_un_nodo(api, admin, draft):
    node = _new_node(api, draft)

    resp = api.delete(f"{BASE}/{draft}/nodes/{node['id']}")

    assert resp.status_code == 200
    assert resp.data["message"] == "Nodo eliminado"
    assert all(n["id"] != node["id"] for n in resp.data["data"]["nodes"])
    _assert_audited(admin, "ADMIN_DELETE_NODE", "NODE", node["id"], "delete_node")


def test_crear_un_nodo_audita_con_la_version_como_recurso(api, admin, draft):
    node = _new_node(api, draft, "auditado")

    assert node["title"] == "Extra"
    _assert_audited(admin, "ADMIN_CREATE_NODE", "CASE_VERSION", draft, "create_node")


def test_un_nodo_de_otra_version_se_rechaza_y_uno_inexistente_es_404(api, draft, published_cv):
    foreign = _editor(api, published_cv)["nodes"][0]["id"]

    other = api.put(f"{BASE}/{draft}/nodes/{foreign}", {"nodeKey": "x", "title": "t", "narrative": "n"}, format="json")
    missing = api.put(f"{BASE}/{draft}/nodes/99999999", {"nodeKey": "x", "title": "t", "narrative": "n"}, format="json")

    assert other.status_code == 400
    assert other.data["message"] == f"El nodo {foreign} no pertenece a la versión {draft}"
    assert missing.status_code == 404
    assert missing.data["message"] == "Nodo no encontrado: 99999999"


# ── decisiones ───────────────────────────────────────────────────────────────
def _decision_body(source, target, **overrides):
    body = {
        "sourceNodeId": source, "targetNodeId": target, "optionKey": "opt-p05b", "text": "Decido esto",
        "classification": "RISKY", "prohibitedConduct": False, "scoreDelta": -3, "stressDelta": 4,
        "prohibitedPenalty": 0, "immediateFeedback": "Mensaje",
    }
    body.update(overrides)
    return body


def test_crear_actualizar_y_eliminar_una_decision(api, admin, draft):
    a, b = _new_node(api, draft, "dec-a"), _new_node(api, draft, "dec-b")

    created = api.post(f"{BASE}/{draft}/decisions", _decision_body(a["id"], b["id"]), format="json")

    assert created.status_code == 200 and created.data["message"] == "Decision creada"
    edge = next(d for d in created.data["data"]["decisions"] if d["optionKey"] == "opt-p05b")
    assert (edge["sourceKey"], edge["targetKey"], edge["classification"]) == ("dec-a", "dec-b", "RISKY")
    assert (edge["scoreDelta"], edge["stressDelta"], edge["immediateFeedback"]) == (-3, 4, "Mensaje")
    _assert_audited(admin, "ADMIN_CREATE_DECISION", "CASE_VERSION", draft, "create_decision")

    updated = api.put(
        f"{BASE}/{draft}/decisions/{edge['id']}",
        _decision_body(a["id"], b["id"], text="Otro texto", classification="ADEQUATE", scoreDelta=5),
        format="json",
    )
    assert updated.status_code == 200 and updated.data["message"] == "Decision actualizada"
    again = next(d for d in updated.data["data"]["decisions"] if d["id"] == edge["id"])
    assert (again["text"], again["classification"], again["scoreDelta"]) == ("Otro texto", "ADEQUATE", 5)
    _assert_audited(admin, "ADMIN_UPDATE_DECISION", "DECISION", edge["id"], "update_decision")

    deleted = api.delete(f"{BASE}/{draft}/decisions/{edge['id']}")
    assert deleted.status_code == 200 and deleted.data["message"] == "Decision eliminada"
    assert all(d["id"] != edge["id"] for d in deleted.data["data"]["decisions"])
    _assert_audited(admin, "ADMIN_DELETE_DECISION", "DECISION", edge["id"], "delete_decision")


def test_una_decision_sin_clave_recibe_una_generada_con_los_nodos(api, draft):
    a, b = _new_node(api, draft, "gen-a"), _new_node(api, draft, "gen-b")
    body = _decision_body(a["id"], b["id"])
    body.pop("optionKey")

    resp = api.post(f"{BASE}/{draft}/decisions", body, format="json")

    keys = [d["optionKey"] for d in resp.data["data"]["decisions"] if d["sourceKey"] == "gen-a"]
    assert len(keys) == 1 and keys[0].startswith("gen-a->gen-b-")


def test_las_decisiones_invalidas_se_rechazan_con_su_mensaje(api, draft, published_cv):
    a, b = _new_node(api, draft, "val-a"), _new_node(api, draft, "val-b")
    foreign = _editor(api, published_cv)["decisions"][0]["id"]

    bad_class = api.post(f"{BASE}/{draft}/decisions", _decision_body(a["id"], b["id"], classification="OTRA"), format="json")
    no_source = api.post(f"{BASE}/{draft}/decisions", _decision_body(99999999, b["id"]), format="json")
    no_target = api.post(f"{BASE}/{draft}/decisions", _decision_body(a["id"], 99999998), format="json")
    other = api.put(f"{BASE}/{draft}/decisions/{foreign}", _decision_body(a["id"], b["id"]), format="json")
    missing = api.delete(f"{BASE}/{draft}/decisions/99999999")

    assert (bad_class.status_code, bad_class.data["message"]) == (400, "Clasificación inválida: OTRA")
    assert (no_source.status_code, no_source.data["message"]) == (404, "Nodo origen: 99999999")
    assert (no_target.status_code, no_target.data["message"]) == (404, "Nodo destino: 99999998")
    assert other.status_code == 400
    assert other.data["message"] == f"La decisión {foreign} no pertenece a la versión {draft}"
    assert (missing.status_code, missing.data["message"]) == (404, "Decision no encontrada: 99999999")


# ── mapas ────────────────────────────────────────────────────────────────────
def test_crear_y_eliminar_un_mapa(api, admin, draft):
    node = _new_node(api, draft, "con-mapa")

    created = api.post(
        f"{BASE}/{draft}/maps",
        {"nodeId": node["id"], "mapKey": "mapa-p05b", "title": "Mapa", "width": 800, "height": 600,
         "spawnX": 10, "spawnY": 20},
        format="json",
    )

    assert created.status_code == 200 and created.data["message"] == "Mapa creado"
    scene_map = next(m for m in created.data["data"]["maps"] if m["key"] == "mapa-p05b")
    assert (scene_map["width"], scene_map["height"], scene_map["theme"]) == (800, 600, "clinical-soft")
    assert (scene_map["nodeId"], scene_map["spawnX"], scene_map["spawnY"]) == (node["id"], 10, 20)
    _assert_audited(admin, "ADMIN_CREATE_MAP", "CASE_VERSION", draft, "create_map")

    deleted = api.delete(f"{BASE}/{draft}/maps/{scene_map['id']}")
    assert deleted.status_code == 200 and deleted.data["message"] == "Mapa eliminado"
    assert all(m["id"] != scene_map["id"] for m in deleted.data["data"]["maps"])
    _assert_audited(admin, "ADMIN_DELETE_MAP", "MAP", scene_map["id"], "delete_map")


def test_actualizar_un_mapa_cambia_su_nodo_y_audita_con_el_mapa(api, admin, draft):
    first = _editor(api, draft)["maps"][0]
    other_node = _new_node(api, draft, "otro-nodo")

    resp = api.put(
        f"{BASE}/{draft}/maps/{first['id']}",
        {"nodeId": other_node["id"], "mapKey": first["key"], "title": "Renombrado", "width": 700, "height": 500},
        format="json",
    )

    assert resp.status_code == 200 and resp.data["message"] == "Mapa actualizado"
    updated = next(m for m in resp.data["data"]["maps"] if m["id"] == first["id"])
    assert (updated["title"], updated["nodeId"], updated["width"]) == ("Renombrado", other_node["id"], 700)
    _assert_audited(admin, "ADMIN_UPDATE_MAP", "MAP", first["id"], "update_map")


def test_crear_un_mapa_con_un_nodo_inexistente_es_404(api, draft):
    resp = api.post(f"{BASE}/{draft}/maps", {"nodeId": 99999999, "mapKey": "x", "title": "t"}, format="json")

    assert (resp.status_code, resp.data["message"]) == (404, "Nodo no encontrado: 99999999")


# ── objetos ──────────────────────────────────────────────────────────────────
def test_crear_actualizar_y_eliminar_un_objeto(api, admin, draft):
    map_id = _editor(api, draft)["maps"][0]["id"]

    created = api.post(
        f"{BASE}/{draft}/maps/{map_id}/objects",
        {"objectKey": "obj-p05b", "label": "Objeto", "objectType": "PERSON", "x": 30, "y": 40,
         "width": 0, "height": -1, "visible": True, "interactionPrompt": "Hablar", "interactionText": ""},
        format="json",
    )

    assert created.status_code == 200 and created.data["message"] == "Objeto creado"
    obj = next(o for o in created.data["data"]["objects"] if o["key"] == "obj-p05b")
    assert (obj["type"], obj["x"], obj["y"], obj["mapId"]) == ("PERSON", 30, 40, map_id)
    # Valores por defecto de un objeto sin tamaño ni apariencia.
    assert (obj["width"], obj["height"]) == (48, 48)
    assert (obj["colorHex"], obj["icon"], obj["shortCode"]) == ("#4FA3A5", "psychology", "ACT")
    assert (obj["collision"], obj["visible"], obj["decisionOptionId"]) == (False, True, None)
    _assert_audited(admin, "ADMIN_CREATE_OBJECT", "MAP", map_id, "create_object")

    updated = api.put(
        f"{BASE}/{draft}/objects/{obj['id']}",
        {"objectKey": "obj-p05b", "label": "Renombrado", "objectType": "PERSON", "x": 31, "y": 41,
         "width": 60, "height": 70, "collision": True, "visible": True, "colorHex": "#112233",
         "interactionPrompt": "Hablar", "interactionText": ""},
        format="json",
    )
    assert updated.status_code == 200 and updated.data["message"] == "Objeto actualizado"
    again = next(o for o in updated.data["data"]["objects"] if o["id"] == obj["id"])
    assert (again["label"], again["width"], again["collision"], again["colorHex"]) == ("Renombrado", 60, True, "#112233")
    _assert_audited(admin, "ADMIN_UPDATE_OBJECT", "OBJECT", obj["id"], "update_object")

    deleted = api.delete(f"{BASE}/{draft}/objects/{obj['id']}")
    assert deleted.status_code == 200 and deleted.data["message"] == "Objeto eliminado"
    assert not MapObject.objects.filter(pk=obj["id"]).exists()
    _assert_audited(admin, "ADMIN_DELETE_OBJECT", "OBJECT", obj["id"], "delete_object")


def test_crear_un_objeto_sin_texto_de_interaccion_falla_hoy_con_500(api, draft):
    """Comportamiento actual (defecto): `interactionPrompt` e `interactionText` son NOT NULL y esta
    operación guarda `None` si faltan, así que revienta en la base. El editor de mundo (`save_world`)
    sí los completa con «»."""
    map_id = _editor(api, draft)["maps"][0]["id"]

    resp = api.post(
        f"{BASE}/{draft}/maps/{map_id}/objects",
        {"objectKey": "sin-texto", "label": "L", "objectType": "PROP"},
        format="json",
    )

    assert resp.status_code == 500
    assert not MapObject.objects.filter(object_key="sin-texto").exists()


def test_crear_una_herramienta_sin_descripcion_falla_hoy_con_500(api, draft):
    """Comportamiento actual (defecto): `description` es NOT NULL y `create_tool` guarda `None`
    si falta, igual que `create_object` con el texto de interacción."""
    resp = api.post(f"{BASE}/{draft}/tools", {"toolCode": "SIN-DESC", "label": "L"}, format="json")

    assert resp.status_code == 500
    assert not ClinicalTool.objects.filter(tool_code="SIN-DESC").exists()


def test_un_objeto_de_otra_version_se_rechaza(api, draft, published_cv):
    foreign = _editor(api, published_cv)["objects"][0]["id"]

    resp = api.delete(f"{BASE}/{draft}/objects/{foreign}")

    assert resp.status_code == 400
    assert resp.data["message"] == f"El objeto {foreign} no pertenece a la versión {draft}"


# ── diálogos ─────────────────────────────────────────────────────────────────
def test_crear_actualizar_y_eliminar_un_dialogo(api, admin, draft):
    map_id = _editor(api, draft)["maps"][0]["id"]

    created = api.post(
        f"{BASE}/{draft}/maps/{map_id}/dialogues",
        {"treeKey": "dlg-p05b", "speakerName": "Voz", "lines": [
            {"displayOrder": 1, "speakerName": "Voz", "text": "Primera"},
            {"displayOrder": 2, "speakerName": "Voz", "text": "Segunda", "emotion": "calma"},
        ]},
        format="json",
    )

    assert created.status_code == 200 and created.data["message"] == "Dialogo creado"
    tree = DialogueTree.objects.get(scene_map_id=map_id, tree_key="dlg-p05b")
    assert tree.emotion == "neutral"
    lines = list(DialogueLine.objects.filter(dialogue_tree=tree).order_by("display_order"))
    assert [(l.display_order, l.text, l.emotion) for l in lines] == [(1, "Primera", "neutral"), (2, "Segunda", "calma")]
    _assert_audited(admin, "ADMIN_CREATE_DIALOGUE", "MAP", map_id, "create_dialogue")

    updated = api.put(
        f"{BASE}/{draft}/dialogues/{tree.id}",
        {"treeKey": "dlg-p05b", "speakerName": "Otra voz", "emotion": "tension",
         "lines": [{"displayOrder": 1, "speakerName": "Otra voz", "text": "Única"}]},
        format="json",
    )
    assert updated.status_code == 200 and updated.data["message"] == "Dialogo actualizado"
    tree.refresh_from_db()
    assert (tree.speaker_name, tree.emotion) == ("Otra voz", "tension")
    assert [l.text for l in DialogueLine.objects.filter(dialogue_tree=tree)] == ["Única"]
    _assert_audited(admin, "ADMIN_UPDATE_DIALOGUE", "DIALOGUE", tree.id, "update_dialogue")

    deleted = api.delete(f"{BASE}/{draft}/dialogues/{tree.id}")
    assert deleted.status_code == 200 and deleted.data["message"] == "Dialogo eliminado"
    assert not DialogueTree.objects.filter(pk=tree.id).exists()
    _assert_audited(admin, "ADMIN_DELETE_DIALOGUE", "DIALOGUE", tree.id, "delete_dialogue")


def test_actualizar_un_dialogo_sin_lineas_en_el_cuerpo_borra_las_que_tenia(api, draft):
    """Comportamiento actual: `lines` ausente borra las líneas (se borran antes de mirar el cuerpo)."""
    map_id = _editor(api, draft)["maps"][0]["id"]
    api.post(
        f"{BASE}/{draft}/maps/{map_id}/dialogues",
        {"treeKey": "dlg-sin-lineas", "speakerName": "Voz", "lines": [{"displayOrder": 1, "speakerName": "Voz", "text": "x"}]},
        format="json",
    )
    tree = DialogueTree.objects.get(scene_map_id=map_id, tree_key="dlg-sin-lineas")

    api.put(f"{BASE}/{draft}/dialogues/{tree.id}", {"treeKey": "dlg-sin-lineas", "speakerName": "Voz"}, format="json")

    assert DialogueLine.objects.filter(dialogue_tree=tree).count() == 0


# ── herramientas ─────────────────────────────────────────────────────────────
def test_crear_actualizar_y_eliminar_una_herramienta(api, admin, draft):
    created = api.post(
        f"{BASE}/{draft}/tools", {"toolCode": "P05B", "label": "Herramienta", "description": "Para probar"}, format="json"
    )

    assert created.status_code == 200 and created.data["message"] == "Herramienta creada"
    tool = next(t for t in created.data["data"]["tools"] if t["code"] == "P05B")
    assert (tool["icon"], tool["category"], tool["active"]) == ("psychology", "clinical", True)
    _assert_audited(admin, "ADMIN_CREATE_TOOL", "CASE_VERSION", draft, "create_tool")

    updated = api.put(
        f"{BASE}/{draft}/tools/{tool['id']}",
        {"toolCode": "P05B", "label": "Renombrada", "icon": "star", "category": "extra", "description": "d"},
        format="json",
    )
    assert updated.status_code == 200 and updated.data["message"] == "Herramienta actualizada"
    again = next(t for t in updated.data["data"]["tools"] if t["id"] == tool["id"])
    assert (again["label"], again["icon"], again["category"]) == ("Renombrada", "star", "extra")
    _assert_audited(admin, "ADMIN_UPDATE_TOOL", "TOOL", tool["id"], "update_tool")

    deleted = api.delete(f"{BASE}/{draft}/tools/{tool['id']}")
    assert deleted.status_code == 200 and deleted.data["message"] == "Herramienta eliminada"
    assert not ClinicalTool.objects.filter(pk=tool["id"]).exists()
    _assert_audited(admin, "ADMIN_DELETE_TOOL", "TOOL", tool["id"], "delete_tool")


def test_una_herramienta_de_otra_version_se_rechaza(api, draft, published_cv):
    foreign = _editor(api, published_cv)["tools"][0]["id"]

    resp = api.delete(f"{BASE}/{draft}/tools/{foreign}")

    assert resp.status_code == 400
    assert resp.data["message"] == f"La herramienta {foreign} no pertenece a la versión {draft}"


# ── checklist, publicar y clonar: auditoría ──────────────────────────────────
def test_checklist_publicar_y_clonar_dejan_su_rastro(api, admin, published_cv):
    clone = api.post(f"{BASE}/{published_cv}/clone-version")
    clone_id = clone.data["data"]["caseVersionId"]
    _assert_audited(admin, "ADMIN_CLONE_VERSION", "CASE_VERSION", published_cv, "clone_version")

    api.put(f"{BASE}/{clone_id}/checklist", {"contentOriginal": True}, format="json")
    _assert_audited(admin, "ADMIN_CHECKLIST_UPDATE", "CASE_VERSION", clone_id, "update_checklist")

    published = api.post(f"{BASE}/{clone_id}/publish")
    # Sin checklist completo la publicación se rechaza y no deja rastro.
    assert published.status_code == 400
    assert not AuditLog.objects.filter(action="ADMIN_PUBLISH_CASE", resource_id=str(clone_id)).exists()


def test_publicar_un_borrador_completo_deja_rastro(api, admin, published_cv):
    clone_id = api.post(f"{BASE}/{published_cv}/clone-version").data["data"]["caseVersionId"]
    api.put(
        f"{BASE}/{clone_id}/checklist",
        {"contentOriginal": True, "ethicsReviewed": True, "safetyProtocols": True,
         "noStigmatizing": True, "triggerWarnings": True, "accessibilityOk": True},
        format="json",
    )

    resp = api.post(f"{BASE}/{clone_id}/publish")

    if resp.status_code == 200:
        assert resp.data["data"]["status"] == "PUBLISHED"
        _assert_audited(admin, "ADMIN_PUBLISH_CASE", "CASE_VERSION", clone_id, "publish")
    else:  # el caso sembrado no valida: el rechazo no deja rastro
        assert not AuditLog.objects.filter(action="ADMIN_PUBLISH_CASE", resource_id=str(clone_id)).exists()


# ── mundo ────────────────────────────────────────────────────────────────────
def test_guardar_el_mundo_actualiza_el_mapa_y_crea_objetos_con_sus_valores_por_defecto(api, admin, draft):
    we = api.get(f"{BASE}/{draft}/world-editor").data["data"]

    resp = api.put(
        f"{BASE}/{draft}/world?nodeId={we['nodeId']}",
        {"revision": we["revision"],
         "map": {"width": 1000, "height": 600, "spawnX": 50, "spawnY": 60, "theme": "oscuro"},
         "objects": [{"key": "nuevo-p05b", "label": "Nuevo", "type": "PROP", "x": 5, "y": 6, "visible": True}]},
        format="json",
    )

    assert resp.status_code == 200 and resp.data["message"] == "Mundo guardado"
    saved = resp.data["data"]
    assert (saved["map"]["width"], saved["map"]["height"], saved["map"]["theme"]) == (1000, 600, "oscuro")
    assert (saved["map"]["spawnX"], saved["map"]["spawnY"]) == (50, 60)
    obj = next(o for o in saved["objects"] if o["key"] == "nuevo-p05b")
    assert (obj["width"], obj["height"], obj["facing"], obj["zIndex"]) == (48, 48, "down", 0)
    assert (obj["colorHex"], obj["icon"], obj["shortCode"]) == ("#4FA3A5", "psychology", "ACT")
    _assert_audited(admin, "ADMIN_SAVE_WORLD", "CASE_VERSION", draft, "save_world")


def test_el_mundo_de_un_nodo_sin_mapa_es_404(api, draft):
    resp = api.get(f"{BASE}/{draft}/world-editor?nodeId=99999999")
    save = api.put(f"{BASE}/{draft}/world?nodeId=99999999", {}, format="json")

    assert resp.status_code == 404
    assert resp.data["message"] == f"No hay mapa para el nodo 99999999 en versión {draft}"
    assert save.status_code == 404
    assert save.data["message"] == "No hay mapa para el nodo 99999999"


def test_el_mundo_de_una_version_sin_mapas_es_404(api, admin):
    created = api.post(BASE, {"title": "Sin mapas", "code": "P05B-SIN-MAPAS"}, format="json").data["data"]
    for scene_map in created["maps"]:
        SceneMap.objects.filter(pk=scene_map["id"]).delete()

    resp = api.get(f"{BASE}/{created['caseVersionId']}/world-editor")

    assert (resp.status_code, resp.data["message"]) == (404, "Esta versión no tiene mapas aún")


# ── toda mutación sobre una versión publicada se rechaza sin rastro ──────────
def _published_mutations(editor_data, cv):
    node = editor_data["nodes"][0]
    decision = editor_data["decisions"][0]
    scene_map = editor_data["maps"][0]
    obj = editor_data["objects"][0]
    tool = editor_data["tools"][0]
    tree = DialogueTree.objects.filter(scene_map_id=scene_map["id"]).order_by("id").first() or DialogueTree.objects.create(
        scene_map_id=scene_map["id"], tree_key="arbol-publicado", speaker_name="Voz"
    )
    body = {"nodeKey": "x", "title": "t", "narrative": "n"}
    return [
        ("POST", f"{BASE}/{cv}/nodes", body, "ADMIN_CREATE_NODE", cv),
        ("PUT", f"{BASE}/{cv}/nodes/{node['id']}", body, "ADMIN_UPDATE_NODE", node["id"]),
        ("DELETE", f"{BASE}/{cv}/nodes/{node['id']}", None, "ADMIN_DELETE_NODE", node["id"]),
        ("POST", f"{BASE}/{cv}/decisions", _decision_body(node["id"], node["id"]), "ADMIN_CREATE_DECISION", cv),
        ("PUT", f"{BASE}/{cv}/decisions/{decision['id']}", _decision_body(node["id"], node["id"]), "ADMIN_UPDATE_DECISION", decision["id"]),
        ("DELETE", f"{BASE}/{cv}/decisions/{decision['id']}", None, "ADMIN_DELETE_DECISION", decision["id"]),
        ("POST", f"{BASE}/{cv}/maps", {"nodeId": node["id"], "mapKey": "m", "title": "t"}, "ADMIN_CREATE_MAP", cv),
        ("PUT", f"{BASE}/{cv}/maps/{scene_map['id']}", {"mapKey": "m", "title": "t"}, "ADMIN_UPDATE_MAP", scene_map["id"]),
        ("DELETE", f"{BASE}/{cv}/maps/{scene_map['id']}", None, "ADMIN_DELETE_MAP", scene_map["id"]),
        ("POST", f"{BASE}/{cv}/maps/{scene_map['id']}/objects", {"objectKey": "o", "label": "l", "objectType": "PROP"}, "ADMIN_CREATE_OBJECT", scene_map["id"]),
        ("PUT", f"{BASE}/{cv}/objects/{obj['id']}", {"objectKey": "o", "label": "l", "objectType": "PROP"}, "ADMIN_UPDATE_OBJECT", obj["id"]),
        ("DELETE", f"{BASE}/{cv}/objects/{obj['id']}", None, "ADMIN_DELETE_OBJECT", obj["id"]),
        ("POST", f"{BASE}/{cv}/maps/{scene_map['id']}/dialogues", {"treeKey": "d", "speakerName": "s"}, "ADMIN_CREATE_DIALOGUE", scene_map["id"]),
        ("PUT", f"{BASE}/{cv}/dialogues/{tree.id}", {"treeKey": "d", "speakerName": "s"}, "ADMIN_UPDATE_DIALOGUE", tree.id),
        ("DELETE", f"{BASE}/{cv}/dialogues/{tree.id}", None, "ADMIN_DELETE_DIALOGUE", tree.id),
        ("POST", f"{BASE}/{cv}/tools", {"toolCode": "T", "label": "l"}, "ADMIN_CREATE_TOOL", cv),
        ("PUT", f"{BASE}/{cv}/tools/{tool['id']}", {"toolCode": "T", "label": "l"}, "ADMIN_UPDATE_TOOL", tool["id"]),
        ("DELETE", f"{BASE}/{cv}/tools/{tool['id']}", None, "ADMIN_DELETE_TOOL", tool["id"]),
        ("PUT", f"{BASE}/{cv}/checklist", {"contentOriginal": True}, "ADMIN_CHECKLIST_UPDATE", cv),
        ("PUT", f"{BASE}/{cv}/world", {}, "ADMIN_SAVE_WORLD", cv),
    ]


def test_ninguna_mutacion_sobre_una_version_publicada_pasa_ni_deja_rastro(api, published_cv):
    editor_data = _editor(api, published_cv)
    assert editor_data["status"] == "PUBLISHED"

    for method, url, body, action, resource_id in _published_mutations(editor_data, published_cv):
        before = AuditLog.objects.filter(action=action, resource_id=str(resource_id)).count()
        resp = getattr(api, method.lower())(url, body, format="json") if body is not None else getattr(api, method.lower())(url)
        assert resp.status_code == 400, (method, url, resp.status_code, resp.data)
        assert "DRAFT" in resp.data["message"], (method, url, resp.data["message"])
        assert AuditLog.objects.filter(action=action, resource_id=str(resource_id)).count() == before, (method, url)

    # y los datos de la versión publicada siguen intactos
    assert SimulationNode.objects.filter(case_version_id=published_cv).count() == len(editor_data["nodes"])
    assert DecisionOption.objects.filter(case_version_id=published_cv).count() == len(editor_data["decisions"])
    assert DialogueTree.objects.filter(scene_map__case_version_id=published_cv).exists()


# ── lo que mover el código podía perder sin que nada fallara ─────────────────
def test_la_vista_previa_del_mundo_sigue_al_nodo_pedido(api, draft):
    maps = _editor(api, draft)["maps"]
    assert len(maps) >= 2
    first, second = maps[0], maps[1]

    by_default = api.get(f"{BASE}/{draft}/world-preview").data["data"]
    chosen = api.get(f"{BASE}/{draft}/world-preview?nodeId={second['nodeId']}").data["data"]

    assert by_default["nodeId"] == first["nodeId"]
    assert (chosen["nodeId"], chosen["map"]["key"]) == (second["nodeId"], second["key"])
    # La vista previa es la misma lectura que el editor de mundo.
    assert chosen == api.get(f"{BASE}/{draft}/world-editor?nodeId={second['nodeId']}").data["data"]


def test_la_validacion_del_mundo_exige_una_salida_segura(api):
    created = api.post(BASE, {"title": "Sin salida", "code": "P05B-SIN-SALIDA"}, format="json").data["data"]
    cv, map_id = created["caseVersionId"], created["maps"][0]["id"]

    before = api.post(f"{BASE}/{cv}/world/validate").data["data"]
    api.post(
        f"{BASE}/{cv}/maps/{map_id}/objects",
        {"objectKey": "salida", "label": "Salida", "objectType": "EXIT", "x": 10, "y": 10,
         "interactionPrompt": "Salir", "interactionText": ""},
        format="json",
    )
    after = api.post(f"{BASE}/{cv}/world/validate").data["data"]

    assert "NO_SAFE_EXIT" in {e["code"] for e in before["errors"]}
    assert "NO_SAFE_EXIT" not in {e["code"] for e in after["errors"]}


def test_las_opciones_de_un_dialogo_solo_enlazan_decisiones_de_su_version(api, draft, published_cv):
    we = api.get(f"{BASE}/{draft}/world-editor").data["data"]
    own = _editor(api, draft)["decisions"][0]["id"]
    foreign = _editor(api, published_cv)["decisions"][0]["id"]

    resp = api.put(
        f"{BASE}/{draft}/world?nodeId={we['nodeId']}",
        {"dialogues": [{"key": "dlg-opciones", "speakerName": "Voz", "lines": [], "choices": [
            {"key": "propia", "text": "A", "decisionOptionId": own, "displayOrder": 1},
            {"key": "ajena", "text": "B", "decisionOptionId": foreign, "displayOrder": 2},
        ]}]},
        format="json",
    )

    tree = next(t for t in resp.data["data"]["dialogues"] if t["key"] == "dlg-opciones")
    assert {c["key"]: c["decisionOptionId"] for c in tree["choices"]} == {"propia": own, "ajena": None}


def test_una_decision_sin_retroalimentacion_la_guarda_vacia(api, draft):
    a, b = _new_node(api, draft, "fb-a"), _new_node(api, draft, "fb-b")
    body = _decision_body(a["id"], b["id"])
    body.pop("immediateFeedback")

    resp = api.post(f"{BASE}/{draft}/decisions", body, format="json")

    assert resp.status_code == 200
    edge = next(d for d in resp.data["data"]["decisions"] if d["sourceKey"] == "fb-a")
    assert edge["immediateFeedback"] == ""


def test_una_version_archivada_tampoco_se_modifica_ni_se_publica(api, draft):
    CaseVersion.objects.filter(pk=draft).update(status="ARCHIVED")

    edited = api.post(f"{BASE}/{draft}/nodes", {"nodeKey": "x", "title": "t", "narrative": "n"}, format="json")
    published = api.post(f"{BASE}/{draft}/publish")

    assert edited.status_code == 400 and "Estado actual: ARCHIVED" in edited.data["message"]
    assert (published.status_code, published.data["message"]) == (400, "No se puede publicar una versión archivada.")


def test_publicar_una_version_ya_publicada_se_rechaza(api, published_cv):
    resp = api.post(f"{BASE}/{published_cv}/publish")

    assert resp.status_code == 400
    assert resp.data["message"] == "El caso ya está publicado. Use 'Clonar versión' para crear una nueva."


def test_publicar_deja_la_version_publicada_con_su_fecha(api, published_cv):
    clone_id = api.post(f"{BASE}/{published_cv}/clone-version").data["data"]["caseVersionId"]
    api.put(
        f"{BASE}/{clone_id}/checklist",
        {"contentOriginal": True, "ethicsReviewed": True, "safetyProtocols": True,
         "noStigmatizing": True, "triggerWarnings": True, "accessibilityOk": True},
        format="json",
    )

    resp = api.post(f"{BASE}/{clone_id}/publish")

    assert resp.status_code == 200 and resp.data["data"]["status"] == "PUBLISHED"
    version = CaseVersion.objects.get(pk=clone_id)
    assert version.status == "PUBLISHED"
    assert version.published_at is not None


def test_publicar_con_errores_de_validacion_se_rechaza_y_los_nombra(api):
    created = api.post(BASE, {"title": "Con errores", "code": "P05B-ERRORES"}, format="json").data["data"]
    cv = created["caseVersionId"]
    api.put(
        f"{BASE}/{cv}/checklist",
        {"contentOriginal": True, "ethicsReviewed": True, "safetyProtocols": True,
         "noStigmatizing": True, "triggerWarnings": True, "accessibilityOk": True},
        format="json",
    )

    resp = api.post(f"{BASE}/{cv}/publish")

    assert resp.status_code == 400
    assert resp.data["message"].startswith("El caso no puede publicarse con errores de validación: ")
    assert "[NO_SAFE_EXIT]" in resp.data["message"]
    assert CaseVersion.objects.get(pk=cv).status == "DRAFT"


def test_el_checklist_completo_queda_completo_y_el_parcial_pendiente(api, draft):
    api.put(
        f"{BASE}/{draft}/checklist",
        {"contentOriginal": True, "ethicsReviewed": True, "safetyProtocols": True},
        format="json",
    )
    partial = PublicationChecklist.objects.filter(case_version_id=draft).order_by("-id").first()
    assert (partial.completion_ratio, partial.status, partial.completed_at) == (50, "PENDING", None)

    resp = api.put(
        f"{BASE}/{draft}/checklist",
        {"contentOriginal": True, "ethicsReviewed": True, "safetyProtocols": True,
         "noStigmatizing": True, "triggerWarnings": True, "accessibilityOk": True},
        format="json",
    )

    full = PublicationChecklist.objects.filter(case_version_id=draft).order_by("-id").first()
    assert (full.completion_ratio, full.status) == (100, "COMPLETE")
    assert full.completed_at is not None
    assert resp.data["data"]["checklistCompletion"] == 100 and resp.data["data"]["publishable"] is True


def test_cada_clon_recibe_el_siguiente_menor_de_su_caso(api, published_cv):
    major, minor, _patch = CaseVersion.objects.get(pk=published_cv).semantic_version.split(".")

    first = api.post(f"{BASE}/{published_cv}/clone-version").data["data"]
    second = api.post(f"{BASE}/{published_cv}/clone-version").data["data"]

    assert first["semanticVersion"] == f"{major}.{int(minor) + 1}.0"
    assert second["semanticVersion"] == f"{major}.{int(minor) + 2}.0"


def test_un_numero_de_version_que_no_tiene_tres_partes_recibe_un_parche(api, draft):
    CaseVersion.objects.filter(pk=draft).update(semantic_version="7.2")

    resp = api.post(f"{BASE}/{draft}/clone-version")

    assert resp.data["data"]["semanticVersion"] == "7.2.1"


def test_los_codigos_de_caso_se_normalizan_y_no_se_repiten(api):
    api.post(BASE, {"title": "Caso repetido"}, format="json")
    api.post(BASE, {"title": "Caso repetido"}, format="json")
    duplicated = api.post(BASE, {"title": "Otro", "code": "caso repetido"}, format="json")

    codes = list(
        SimulationCase.objects.filter(title="Caso repetido").order_by("id").values_list("code", flat=True)
    )
    assert codes == ["CASO-REPETIDO", "CASO-REPETIDO-2"]
    assert (duplicated.status_code, duplicated.data["message"]) == (400, "Ya existe un caso con el codigo: CASO-REPETIDO")


def test_un_caso_nuevo_nace_con_un_checklist_pendiente_en_cero(api):
    created = api.post(BASE, {"title": "Con checklist", "code": "P05B-CHECK"}, format="json").data["data"]

    rows = PublicationChecklist.objects.filter(case_version_id=created["caseVersionId"])
    assert [(r.completion_ratio, r.status) for r in rows] == [(0, "PENDING")]
    assert (created["checklistCompletion"], created["publishable"]) == (0, False)


# ── las transacciones de las operaciones que escriben varias veces ───────────
def test_actualizar_un_dialogo_que_falla_a_mitad_conserva_sus_lineas(api, draft):
    """`update_dialogue` borra las líneas y vuelve a crearlas: si una falla, vuelven las de antes."""
    map_id = _editor(api, draft)["maps"][0]["id"]
    api.post(
        f"{BASE}/{draft}/maps/{map_id}/dialogues",
        {"treeKey": "dlg-atomico", "speakerName": "Voz",
         "lines": [{"displayOrder": 1, "speakerName": "Voz", "text": "Se conserva"}]},
        format="json",
    )
    tree = DialogueTree.objects.get(scene_map_id=map_id, tree_key="dlg-atomico")

    resp = api.put(
        f"{BASE}/{draft}/dialogues/{tree.id}",
        {"treeKey": "dlg-atomico", "speakerName": "Voz",
         "lines": [{"displayOrder": 1, "speakerName": "Voz", "text": "Nueva"},
                   {"displayOrder": 2, "speakerName": "Voz", "text": None}]},
        format="json",
    )

    assert resp.status_code == 500
    assert [line.text for line in DialogueLine.objects.filter(dialogue_tree=tree)] == ["Se conserva"]


def _authoring_snapshot(cv):
    """Todo lo que las operaciones de autoría pueden escribir en una versión, tal como está en la base."""
    return {
        "nodes": list(SimulationNode.objects.filter(case_version_id=cv).order_by("id").values()),
        "decisions": list(DecisionOption.objects.filter(case_version_id=cv).order_by("id").values()),
        "maps": list(SceneMap.objects.filter(case_version_id=cv).order_by("id").values()),
        "objects": list(MapObject.objects.filter(scene_map__case_version_id=cv).order_by("id").values()),
        "tools": list(ClinicalTool.objects.filter(case_version_id=cv).order_by("id").values()),
        "checklists": list(PublicationChecklist.objects.filter(case_version_id=cv).order_by("id").values()),
    }


def test_toda_mutacion_se_deshace_si_falla_el_armado_de_la_vista(api, draft):
    """Cada mutación devuelve la vista completa del editor dentro de su transacción: si armarla
    falla, lo escrito se deshace. Casi todas escriben una sola vez, así que solo esto prueba que
    cada una conserva su transacción."""
    def created_id(resp, collection, field, value):
        assert resp.status_code == 200, resp.data
        return next(item["id"] for item in resp.data["data"][collection] if item[field] == value)

    node_a, node_b, node_c, node_e, node_f = (_new_node(api, draft, f"vista-{k}")["id"] for k in "abcef")
    decision_1 = created_id(api.post(f"{BASE}/{draft}/decisions", _decision_body(node_a, node_b, optionKey="vista-1"), format="json"), "decisions", "optionKey", "vista-1")
    decision_2 = created_id(api.post(f"{BASE}/{draft}/decisions", _decision_body(node_a, node_c, optionKey="vista-2"), format="json"), "decisions", "optionKey", "vista-2")
    map_1 = created_id(api.post(f"{BASE}/{draft}/maps", {"nodeId": node_b, "mapKey": "vista-m1", "title": "M1"}, format="json"), "maps", "key", "vista-m1")
    map_2 = created_id(api.post(f"{BASE}/{draft}/maps", {"nodeId": node_c, "mapKey": "vista-m2", "title": "M2"}, format="json"), "maps", "key", "vista-m2")
    object_body = {"label": "O", "objectType": "PROP", "interactionPrompt": "", "interactionText": ""}
    object_1 = created_id(api.post(f"{BASE}/{draft}/maps/{map_1}/objects", {**object_body, "objectKey": "vista-o1"}, format="json"), "objects", "key", "vista-o1")
    object_2 = created_id(api.post(f"{BASE}/{draft}/maps/{map_1}/objects", {**object_body, "objectKey": "vista-o2"}, format="json"), "objects", "key", "vista-o2")
    tool_1 = created_id(api.post(f"{BASE}/{draft}/tools", {"toolCode": "V1", "label": "T1", "description": "d"}, format="json"), "tools", "code", "V1")
    tool_2 = created_id(api.post(f"{BASE}/{draft}/tools", {"toolCode": "V2", "label": "T2", "description": "d"}, format="json"), "tools", "code", "V2")

    node_body = {"nodeKey": "vista-x", "title": "Cambiado", "narrative": "n"}
    mutations = [
        ("create_node", "post", f"{BASE}/{draft}/nodes", node_body),
        ("update_node", "put", f"{BASE}/{draft}/nodes/{node_a}", {**node_body, "nodeKey": "vista-a"}),
        ("delete_node", "delete", f"{BASE}/{draft}/nodes/{node_e}", None),
        ("create_decision", "post", f"{BASE}/{draft}/decisions", _decision_body(node_b, node_c, optionKey="vista-3")),
        ("update_decision", "put", f"{BASE}/{draft}/decisions/{decision_1}", _decision_body(node_a, node_b, optionKey="vista-1", text="Cambiado")),
        ("delete_decision", "delete", f"{BASE}/{draft}/decisions/{decision_2}", None),
        ("create_map", "post", f"{BASE}/{draft}/maps", {"nodeId": node_f, "mapKey": "vista-m3", "title": "M3"}),
        ("update_map", "put", f"{BASE}/{draft}/maps/{map_1}", {"mapKey": "vista-m1", "title": "Cambiado"}),
        ("delete_map", "delete", f"{BASE}/{draft}/maps/{map_2}", None),
        ("create_object", "post", f"{BASE}/{draft}/maps/{map_1}/objects", {**object_body, "objectKey": "vista-o3"}),
        ("update_object", "put", f"{BASE}/{draft}/objects/{object_1}", {**object_body, "objectKey": "vista-o1", "label": "Cambiado"}),
        ("delete_object", "delete", f"{BASE}/{draft}/objects/{object_2}", None),
        ("create_tool", "post", f"{BASE}/{draft}/tools", {"toolCode": "V3", "label": "T3", "description": "d"}),
        ("update_tool", "put", f"{BASE}/{draft}/tools/{tool_1}", {"toolCode": "V1", "label": "Cambiado", "description": "d"}),
        ("delete_tool", "delete", f"{BASE}/{draft}/tools/{tool_2}", None),
        ("update_checklist", "put", f"{BASE}/{draft}/checklist", {"contentOriginal": True}),
    ]

    for name, method, url, body in mutations:
        before = _authoring_snapshot(draft)
        with patch.object(PublicationChecklist.objects, "filter", side_effect=RuntimeError("fallo al armar la vista")):
            call = getattr(api, method)
            resp = call(url, body, format="json") if body is not None else call(url)
        assert resp.status_code == 500, (name, resp.status_code)
        assert _authoring_snapshot(draft) == before, name


def test_crear_un_dialogo_que_falla_a_mitad_no_deja_el_arbol(api, draft):
    map_id = _editor(api, draft)["maps"][0]["id"]

    resp = api.post(
        f"{BASE}/{draft}/maps/{map_id}/dialogues",
        {"treeKey": "dlg-a-medias", "speakerName": "Voz",
         "lines": [{"displayOrder": 1, "speakerName": "Voz", "text": None}]},
        format="json",
    )

    assert resp.status_code == 500
    assert not DialogueTree.objects.filter(scene_map_id=map_id, tree_key="dlg-a-medias").exists()


def test_guardar_el_mundo_que_falla_a_mitad_no_deja_el_mapa_cambiado(api, draft):
    we = api.get(f"{BASE}/{draft}/world-editor").data["data"]

    resp = api.put(
        f"{BASE}/{draft}/world?nodeId={we['nodeId']}",
        {"map": {"width": 1234, "theme": "a-medias"},
         "objects": [{"key": "sin-tipo", "label": "x", "visible": True}]},  # sin `type`: NOT NULL
        format="json",
    )

    assert resp.status_code == 500
    scene_map = SceneMap.objects.get(pk=we["map"]["id"])
    assert (scene_map.width, scene_map.theme) == (we["map"]["width"], we["map"]["theme"])


def test_clonar_una_version_es_todo_o_nada(api, published_cv):
    original = CopySpec.copy
    copied = []

    def fail_on_third(self, source, **links):
        copied.append(self.model.__name__)
        if len(copied) == 3:
            raise RuntimeError("fallo a mitad del clon")
        return original(self, source, **links)

    before = CaseVersion.objects.count()
    with patch.object(CopySpec, "copy", autospec=True, side_effect=fail_on_third):
        resp = api.post(f"{BASE}/{published_cv}/clone-version")

    assert resp.status_code == 500
    assert len(copied) == 3                        # alcanzó a copiar la versión y un nodo
    assert CaseVersion.objects.count() == before   # y no quedó un clon a medias


def test_crear_un_caso_es_todo_o_nada(api):
    with patch.object(PublicationChecklist.objects, "create", side_effect=RuntimeError("fallo al final")):
        resp = api.post(BASE, {"title": "Caso a medias", "code": "P05B-A-MEDIAS"}, format="json")

    assert resp.status_code == 500
    assert not SimulationCase.objects.filter(code="P05B-A-MEDIAS").exists()
