"""S2-6b · Límites de entrada de la autoría y del guardado del mundo.

Los enteros que se guardan en una columna ``integer`` de PostgreSQL (int4) y los ids o referencias del cuerpo del
mundo que no son enteros daban 500 (el sondeo de la tarea lo midió: ver el informe). Ahora dan 400 con el campo.
El fondo de sala (``ambient.backgroundImage``) se valida al guardar y al publicar. Un número como 1e400 llega como
infinito: también es un 400.
"""
import json
import secrets

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, SceneMap, SimulationNode

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security]

User = get_user_model()
BASE = "/api/admin/cases"
INF = "__INFINITO__"  # en el JSON del cuerpo se escribe como 1e400, que Python lee como infinito
FUERA_DE_INT4 = [2**31, 2**63, -(2**31) - 1]


def _json(datos):
    return json.dumps(datos).replace(json.dumps(INF), "1e400")


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="limites_admin@x.com", password=secrets.token_urlsafe(24), nombre="A", apellido="L", role="ADMIN"
    )


@pytest.fixture
def api(admin):
    client = APIClient()
    client.force_authenticate(user=admin)
    return client


@pytest.fixture
def borrador(api, db):
    publicada = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    resp = api.post(f"{BASE}/{publicada.id}/clone-version")
    assert resp.status_code == 200, resp.data
    return resp.data["data"]["caseVersionId"]


@pytest.fixture
def nodos(borrador):
    return list(SimulationNode.objects.filter(case_version_id=borrador).order_by("id"))


@pytest.fixture
def mapa(borrador):
    return SceneMap.objects.filter(case_version_id=borrador).order_by("id").first()


def _revision(borrador):
    return CaseVersion.objects.get(pk=borrador).version


def _put(api, url, datos):
    return api.generic("PUT", url, _json(datos), content_type="application/json")


def _post(api, url, datos):
    return api.generic("POST", url, _json(datos), content_type="application/json")


def _cuerpo_nodo(borrador, nodo, **extra):
    return {
        "nodeKey": nodo.node_key, "title": nodo.title, "narrative": nodo.narrative or "Narrativa",
        "revision": _revision(borrador), **extra,
    }


def _guardar_mundo(api, borrador, cuerpo):
    return _put(api, f"{BASE}/{borrador}/world", {"revision": _revision(borrador), **cuerpo})


# ─── Autoría: enteros que van a una columna int4 ────────────────────────────────────────
@pytest.mark.parametrize("valor", FUERA_DE_INT4)
def test_posicion_del_nodo_fuera_de_int4_da_400_con_el_campo(api, borrador, nodos, valor):
    nodo = nodos[0]

    resp = _put(api, f"{BASE}/{borrador}/nodes/{nodo.id}", _cuerpo_nodo(borrador, nodo, positionX=valor))

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "positionX"


@pytest.mark.parametrize("valor", [2**31 - 1, -(2**31)])
def test_posicion_en_el_limite_de_int4_se_acepta(api, borrador, nodos, valor):
    nodo = nodos[0]

    resp = _put(api, f"{BASE}/{borrador}/nodes/{nodo.id}", _cuerpo_nodo(borrador, nodo, positionY=valor))

    assert resp.status_code == 200, resp.data


def test_revision_infinita_da_400_y_no_500(api, borrador, nodos):
    nodo = nodos[0]

    resp = _put(api, f"{BASE}/{borrador}/nodes/{nodo.id}", _cuerpo_nodo(borrador, nodo, revision=INF))

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "revision"


@pytest.mark.parametrize("campo", ["scoreDelta", "stressDelta", "prohibitedPenalty"])
@pytest.mark.parametrize("valor", FUERA_DE_INT4)
def test_puntaje_de_la_decision_fuera_de_int4_da_400(api, borrador, nodos, campo, valor):
    cuerpo = {
        "sourceNodeId": nodos[0].id, "targetNodeId": nodos[1].id, "optionKey": "LIM_OPCION",
        "text": "Texto de prueba", "classification": "ADEQUATE", "revision": _revision(borrador), campo: valor,
    }

    resp = _post(api, f"{BASE}/{borrador}/decisions", cuerpo)

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == campo


@pytest.mark.parametrize("campo", ["width", "height", "spawnX", "spawnY"])
@pytest.mark.parametrize("valor", [2**31, -(2**31) - 1])
def test_medida_del_mapa_fuera_de_int4_da_400(api, borrador, mapa, campo, valor):
    cuerpo = {"mapKey": mapa.map_key, "title": mapa.title, "revision": _revision(borrador), campo: valor}

    resp = _put(api, f"{BASE}/{borrador}/maps/{mapa.id}", cuerpo)

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == campo


@pytest.mark.parametrize("campo", ["x", "y", "width", "height"])
@pytest.mark.parametrize("valor", [2**31, 2**63])
def test_medida_del_objeto_fuera_de_int4_da_400(api, borrador, mapa, campo, valor):
    cuerpo = {
        "objectKey": "LIM_OBJ", "label": "Objeto", "objectType": "OBJECT",
        "x": 0, "y": 0, "width": 10, "height": 10, "revision": _revision(borrador), campo: valor,
    }

    resp = _post(api, f"{BASE}/{borrador}/maps/{mapa.id}/objects", cuerpo)

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == campo


def test_orden_de_linea_de_dialogo_fuera_de_int4_da_400(api, borrador, mapa):
    cuerpo = {
        "treeKey": "LIM_DLG", "speakerName": "Personaje", "revision": _revision(borrador),
        "lines": [{"displayOrder": 2**31, "speakerName": "P", "text": "Hola", "emotion": "neutral"}],
    }

    resp = _post(api, f"{BASE}/{borrador}/maps/{mapa.id}/dialogues", cuerpo)

    assert resp.status_code == 400, resp.data
    assert "displayOrder" in resp.data["message"]


def test_orden_de_pista_fuera_de_int4_da_400(api, borrador, mapa):
    cuerpo = {"text": "Pista", "hintOrder": 2**31, "revision": _revision(borrador)}

    resp = _post(api, f"{BASE}/{borrador}/maps/{mapa.id}/hints", cuerpo)

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "hintOrder"


def test_orden_de_personaje_fuera_de_int4_da_400(api, borrador):
    cuerpo = {
        "characterKey": "LIM_PERS", "displayName": "Persona", "displayOrder": 2**31,
        "revision": _revision(borrador),
    }

    resp = _post(api, f"{BASE}/{borrador}/characters", cuerpo)

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "displayOrder"


# ─── Guardado del mundo: números, ids y fondo de sala ───────────────────────────────────
def test_guardar_el_mundo_con_valores_normales_sigue_funcionando(api, borrador):
    resp = _guardar_mundo(api, borrador, {"map": {"width": 320, "height": 240, "spawnX": 10, "spawnY": 20}})

    assert resp.status_code == 200, resp.data


@pytest.mark.parametrize("campo, valor", [("width", 2**31), ("spawnY", -(2**63)), ("height", INF)])
def test_medida_del_mapa_fuera_de_int4_da_400_al_guardar_el_mundo(api, borrador, campo, valor):
    resp = _guardar_mundo(api, borrador, {"map": {campo: valor}})

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == f"map.{campo}"


@pytest.mark.parametrize("campo, valor", [("x", 2**31), ("width", INF), ("zIndex", -(2**31) - 1)])
def test_medida_de_objeto_fuera_de_int4_da_400_al_guardar_el_mundo(api, borrador, campo, valor):
    objeto = {"key": "LIM_W", "label": "w", "type": "OBJECT", "x": 0, "y": 0, "width": 10, "height": 10, "zIndex": 0}
    objeto[campo] = valor

    resp = _guardar_mundo(api, borrador, {"objects": [objeto]})

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == f"objects.{campo}"


@pytest.mark.parametrize("campo, valor", [("x", -(2**63)), ("height", 2**31)])
def test_medida_de_zona_fuera_de_int4_da_400_al_guardar_el_mundo(api, borrador, campo, valor):
    zona = {"key": "Z1", "label": "z", "x": 0, "y": 0, "width": 10, "height": 10}
    zona[campo] = valor

    resp = _guardar_mundo(api, borrador, {"collisionZones": [zona]})

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == f"collisionZones.{campo}"


def test_orden_de_linea_de_dialogo_fuera_de_int4_da_400_al_guardar_el_mundo(api, borrador):
    dialogo = {
        "key": "LIM_DLG", "speakerName": "S",
        "lines": [{"order": 2**40, "speakerName": "S", "text": "t", "emotion": "neutral"}],
    }

    resp = _guardar_mundo(api, borrador, {"dialogues": [dialogo]})

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "dialogues.lines.order"


def test_orden_de_opcion_de_dialogo_fuera_de_int4_da_400_al_guardar_el_mundo(api, borrador):
    dialogo = {"key": "LIM_DLG", "speakerName": "S", "lines": [], "choices": [{"key": "c1", "text": "t", "displayOrder": 2**31}]}

    resp = _guardar_mundo(api, borrador, {"dialogues": [dialogo]})

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "choices.displayOrder"


def test_id_de_decision_de_una_opcion_que_no_es_entero_da_400(api, borrador):
    dialogo = {
        "key": "LIM_DLG", "speakerName": "S", "lines": [],
        "choices": [{"key": "c1", "text": "t", "decisionOptionId": "1e3"}],
    }

    resp = _guardar_mundo(api, borrador, {"dialogues": [dialogo]})

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "choices.decisionOptionId"


@pytest.mark.parametrize(
    "seccion, clave, valor",
    [
        ("objects", "id", "abc"),
        ("objects", "characterId", INF),
        ("objects", "decisionOptionId", "1e3"),
        ("dialogues", "mapObjectId", ""),
        ("dialogues", "id", "abc"),
        ("collisionZones", "id", "abc"),
    ],
)
def test_id_que_no_es_entero_da_400_al_guardar_el_mundo(api, borrador, seccion, clave, valor):
    filas = {
        "objects": [{"key": "LIM_W", "label": "w", "type": "OBJECT", "x": 0, "y": 0, "width": 10, "height": 10}],
        "dialogues": [{"key": "LIM_DLG", "speakerName": "S", "lines": []}],
        "collisionZones": [{"key": "Z1", "label": "z", "x": 0, "y": 0, "width": 10, "height": 10}],
    }
    filas[seccion][0][clave] = valor

    resp = _guardar_mundo(api, borrador, {seccion: filas[seccion]})

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == f"{seccion}.{clave}"


def test_fondo_de_sala_ajeno_no_se_guarda(api, borrador):
    resp = _guardar_mundo(api, borrador, {"map": {"ambient": {"backgroundImage": "https://evil.test/fondo.png"}}})

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "map.ambient.backgroundImage"


def test_fondo_de_sala_propio_se_guarda(api, borrador, mapa):
    resp = _guardar_mundo(api, borrador, {"map": {"ambient": {"backgroundImage": "/assets/world/bg.webp"}}})

    assert resp.status_code == 200, resp.data
    mapa.refresh_from_db()
    assert "/assets/world/bg.webp" in mapa.ambient_json


def _codigos(resp):
    return [issue["code"] for issue in resp.data["data"]["issues"]]


def test_mundo_guardado_con_fondo_ajeno_no_se_publica(api, borrador, mapa):
    SceneMap.objects.filter(pk=mapa.pk).update(ambient_json='{"backgroundImage": "https://evil.test/fondo.png"}')

    resp = api.post(f"{BASE}/{borrador}/validate")

    assert resp.status_code == 200, resp.data
    assert resp.data["data"]["canPublish"] is False
    assert any(codigo.endswith("MAP_BACKGROUND_NOT_ALLOWED") for codigo in _codigos(resp))


def test_mundo_con_fondo_propio_no_bloquea_la_publicacion_por_el_fondo(api, borrador, mapa):
    SceneMap.objects.filter(pk=mapa.pk).update(ambient_json='{"backgroundImage": "/assets/world/bg.webp"}')

    resp = api.post(f"{BASE}/{borrador}/validate")

    assert resp.status_code == 200, resp.data
    assert not any(codigo.endswith("MAP_BACKGROUND_NOT_ALLOWED") for codigo in _codigos(resp))
