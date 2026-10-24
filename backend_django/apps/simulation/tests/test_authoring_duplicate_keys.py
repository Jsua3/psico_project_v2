"""Una clave repetida en el editor de casos es un 400 que nombra el campo, no un 500.

El editor guardaba nodos, decisiones, mapas, objetos, herramientas y diálogos sin mirar si la clave ya
la usaba otra fila del mismo caso (o del mismo mapa). La base la rechazaba con su restricción única
(``IntegrityError``), nadie la atrapaba y el autor veía «Error interno del servidor» sin saber qué
corregir. Pasaba, por ejemplo, al crear dos objetos «puerta» con la misma clave en un mapa o un
segundo mapa para un nodo que ya tenía el suyo.

Cada choque lleva su control: editar una fila sin cambiarle la clave sigue funcionando, y la misma
clave de objeto en OTRO mapa es válida (la restricción es por mapa).
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion

pytestmark = [pytest.mark.req("RNF-08")]

User = get_user_model()
BASE = "/api/authoring/cases"


class Editor:
    """Un ADMIN editando un caso nuevo: cada orden lleva la revisión vigente y la actualiza."""

    def __init__(self, user):
        self.api = APIClient()
        self.api.force_authenticate(user=user)
        data = self.api.post(BASE, {"title": "Caso de claves repetidas"}, format="json").data["data"]
        self.cv = data["caseVersionId"]
        self.data = data

    def send(self, method, path, body):
        body = {**body, "revision": self.data["revision"]}
        response = getattr(self.api, method)(f"{BASE}/{self.cv}/{path}", body, format="json")
        if response.status_code == 200:
            self.data = response.data["data"]
        return response

    def ok(self, method, path, body):
        response = self.send(method, path, body)
        assert response.status_code == 200, response.data
        return self.data


def _node(key):
    return {"nodeKey": key, "title": f"Nodo {key}", "narrative": "Texto"}


def _decision(source, target, key):
    return {"sourceNodeId": source, "targetNodeId": target, "optionKey": key, "text": "Ir",
            "classification": "ADEQUATE"}


def _map(node_id, key):
    return {"nodeId": node_id, "mapKey": key, "title": f"Mapa {key}"}


def _object(key):
    return {"objectKey": key, "label": "Puerta", "objectType": "EXIT"}


def _tool(code):
    return {"toolCode": code, "label": f"Herramienta {code}"}


def _dialogue(key):
    return {"treeKey": key, "speakerName": "Voz"}


@pytest.fixture
def editor(db):
    admin = User.objects.create_user(
        email="dup_admin@x.com", password="pass1234", nombre="Ad", apellido="Min", role="ADMIN"
    )
    ed = Editor(admin)
    start = ed.data["nodes"][0]["id"]
    first_map = ed.data["maps"][0]["id"]
    ed.ok("post", "nodes", _node("segundo"))
    ed.ok("post", "nodes", _node("tercero"))
    ids = {n["key"]: n["id"] for n in ed.data["nodes"]}
    ed.ok("post", "decisions", _decision(start, ids["segundo"], "ir-al-segundo"))
    ed.ok("post", "decisions", _decision(start, ids["tercero"], "ir-al-tercero"))
    ed.ok("post", "maps", _map(ids["segundo"], "mapa-segundo"))
    ed.ok("post", f"maps/{first_map}/objects", _object("puerta"))
    ed.ok("post", f"maps/{first_map}/objects", _object("ventana"))
    ed.ok("post", "tools", _tool("ESCALA"))
    ed.ok("post", "tools", _tool("GUIA"))
    ed.ok("post", f"maps/{first_map}/dialogues", _dialogue("saludo"))
    ed.ok("post", f"maps/{first_map}/dialogues", _dialogue("despedida"))
    ed.ids = {
        "start": start, **ids, "first_map": first_map,
        "second_map": next(m["id"] for m in ed.data["maps"] if m["key"] == "mapa-segundo"),
        "puerta": next(o["id"] for o in ed.data["objects"] if o["key"] == "puerta"),
        "ventana": next(o["id"] for o in ed.data["objects"] if o["key"] == "ventana"),
        "ir-al-tercero": next(d["id"] for d in ed.data["decisions"] if d["optionKey"] == "ir-al-tercero"),
        "GUIA": next(t["id"] for t in ed.data["tools"] if t["code"] == "GUIA"),
    }
    return ed


# (método, ruta, cuerpo, campo); la ruta y el cuerpo se arman con los ids del caso de la prueba.
DUPLICATES = [
    pytest.param("post", "nodes", lambda i: _node("segundo"), "nodeKey", id="nodo-nuevo"),
    pytest.param("put", "nodes/{tercero}", lambda i: _node("segundo"), "nodeKey", id="nodo-editado"),
    pytest.param("post", "decisions", lambda i: _decision(i["segundo"], i["tercero"], "ir-al-segundo"),
                 "optionKey", id="decision-nueva"),
    pytest.param("put", "decisions/{ir-al-tercero}", lambda i: _decision(i["start"], i["tercero"], "ir-al-segundo"),
                 "optionKey", id="decision-editada"),
    pytest.param("post", "maps", lambda i: _map(i["tercero"], "mapa-segundo"), "mapKey", id="mapa-nuevo-clave"),
    pytest.param("put", "maps/{first_map}", lambda i: _map(i["start"], "mapa-segundo"), "mapKey",
                 id="mapa-editado-clave"),
    pytest.param("post", "maps", lambda i: _map(i["segundo"], "otro-mapa"), "nodeId", id="segundo-mapa-del-nodo"),
    pytest.param("put", "maps/{first_map}", lambda i: _map(i["segundo"], "escena-inicial"), "nodeId",
                 id="mapa-movido-a-un-nodo-con-mapa"),
    pytest.param("post", "maps/{first_map}/objects", lambda i: _object("puerta"), "objectKey", id="objeto-nuevo"),
    pytest.param("put", "objects/{ventana}", lambda i: _object("puerta"), "objectKey", id="objeto-editado"),
    pytest.param("post", "tools", lambda i: _tool("ESCALA"), "toolCode", id="herramienta-nueva"),
    pytest.param("put", "tools/{GUIA}", lambda i: _tool("ESCALA"), "toolCode", id="herramienta-editada"),
    pytest.param("post", "maps/{first_map}/dialogues", lambda i: _dialogue("saludo"), "treeKey", id="dialogo-nuevo"),
]


@pytest.mark.parametrize("method,path,body,field", DUPLICATES)
def test_a_repeated_key_is_a_400_that_names_the_field(editor, method, path, body, field):
    before = editor.data
    revision = CaseVersion.objects.get(pk=editor.cv).version

    response = editor.send(method, path.format(**editor.ids), body(editor.ids))

    assert response.status_code == 400, response.data
    assert response.data["code"] == "VALIDATION_ERROR"
    assert response.data["field"] == field
    # Nada cambió: ni la revisión ni lo que el editor muestra.
    assert CaseVersion.objects.get(pk=editor.cv).version == revision
    after = editor.api.get(f"{BASE}/{editor.cv}/editor").data["data"]
    for part in ("nodes", "decisions", "maps", "objects", "tools"):
        assert after[part] == before[part]


# Controles: guardar una fila con SU propia clave no choca consigo misma.
KEEPS_ITS_KEY = [
    pytest.param("put", "nodes/{segundo}", lambda i: {**_node("segundo"), "title": "Otro título"}, id="nodo"),
    pytest.param("put", "decisions/{ir-al-tercero}",
                 lambda i: {**_decision(i["start"], i["tercero"], "ir-al-tercero"), "text": "Otro"}, id="decision"),
    pytest.param("put", "maps/{first_map}", lambda i: {**_map(i["start"], "escena-inicial"), "title": "Otro"},
                 id="mapa"),
    pytest.param("put", "objects/{puerta}", lambda i: {**_object("puerta"), "label": "Otra"}, id="objeto"),
    pytest.param("put", "tools/{GUIA}", lambda i: {**_tool("GUIA"), "label": "Otra"}, id="herramienta"),
]


@pytest.mark.parametrize("method,path,body", KEEPS_ITS_KEY)
def test_saving_a_row_with_its_own_key_still_works(editor, method, path, body):
    editor.ok(method, path.format(**editor.ids), body(editor.ids))


def test_the_same_object_key_in_another_map_is_valid(editor):
    data = editor.ok("post", f"maps/{editor.ids['second_map']}/objects", _object("puerta"))

    assert sorted(o["mapId"] for o in data["objects"] if o["key"] == "puerta") == sorted(
        [editor.ids["first_map"], editor.ids["second_map"]]
    )
