"""El guardado de la sala (``PUT …/world``) no responde 500 por una clave repetida.

El cuerpo es el estado completo de la sala: lo que no viene se borra, pero se borraba DESPUÉS de
guardar lo que viene. Una entrada sin id con la clave de una fila que ese mismo guardado iba a borrar
(un objeto quitado y vuelto a poner, o uno cuyo id el editor no llegó a recibir porque se canceló el
guardado anterior) chocaba con la restricción única de la base y respondía «Error interno del
servidor». Ahora esa fila se reutiliza. Dos entradas del mismo cuerpo con la misma clave son un 400
que nombra el campo.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, CollisionZone, DialogueTree, MapObject

pytestmark = [pytest.mark.req("RNF-08")]

User = get_user_model()
BASE = "/api/authoring/cases"


@pytest.fixture
def api(db):
    admin = User.objects.create_user(
        email="world_dup@x.com", password="pass1234", nombre="Ad", apellido="Min", role="ADMIN"
    )
    client = APIClient()
    client.force_authenticate(user=admin)
    return client


@pytest.fixture
def cv(api):
    return api.post(BASE, {"title": "Sala con claves repetidas"}, format="json").data["data"]["caseVersionId"]


def _save(api, cv, **lists):
    revision = api.get(f"{BASE}/{cv}/world-editor").data["data"]["revision"]
    return api.put(f"{BASE}/{cv}/world", {"revision": revision, **lists}, format="json")


def _ok(api, cv, **lists):
    response = _save(api, cv, **lists)
    assert response.status_code == 200, response.data
    return response.data["data"]


def _object(key, **extra):
    return {"key": key, "label": f"Objeto {key}", "type": "OBJECT", "x": 10, "y": 10, **extra}


def _zone(key, **extra):
    return {"key": key, "label": f"Zona {key}", "x": 0, "y": 0, "width": 10, "height": 10, **extra}


def _dialogue(key, **extra):
    return {"key": key, "speakerName": "Voz", "lines": [{"order": 0, "text": "Hola"}], **extra}


# ─── claves repetidas dentro del mismo cuerpo: 400 con el campo ────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "lists,field",
    [
        pytest.param({"objects": [_object("puerta"), _object("puerta")]}, "objects.key", id="objetos"),
        pytest.param({"collisionZones": [_zone("muro"), _zone("muro")]}, "collisionZones.key", id="zonas"),
        pytest.param({"dialogues": [_dialogue("saludo"), _dialogue("saludo")]}, "dialogues.key", id="dialogos"),
        pytest.param(
            {"dialogues": [_dialogue("saludo", lines=[{"order": 1, "text": "a"}, {"order": 1, "text": "b"}])]},
            "dialogues.lines.order", id="lineas-de-un-dialogo",
        ),
        pytest.param(
            {"dialogues": [_dialogue("saludo", choices=[{"key": "si", "text": "Sí"}, {"key": "si", "text": "Ya"}])]},
            "choices.key", id="opciones-de-un-dialogo",
        ),
    ],
)
def test_two_entries_with_the_same_key_are_a_400_that_names_the_field(api, cv, lists, field):
    revision = CaseVersion.objects.get(pk=cv).version

    response = _save(api, cv, **lists)

    assert response.status_code == 400, response.data
    assert response.data["code"] == "VALIDATION_ERROR"
    assert response.data["field"] == field
    assert CaseVersion.objects.get(pk=cv).version == revision


def test_the_same_line_order_in_two_dialogues_is_valid(api, cv):
    _ok(api, cv, dialogues=[_dialogue("saludo"), _dialogue("despedida")])

    assert DialogueTree.objects.filter(scene_map__case_version_id=cv).count() == 2


# ─── una clave que ya tiene una fila que nadie reclama: se reutiliza esa fila ──────────────────────────────────────
def test_an_object_removed_and_put_back_in_the_same_save_reuses_its_row(api, cv):
    first = _ok(api, cv, objects=[_object("puerta")])
    original = first["objects"][0]["id"]

    # El editor lo quitó y puso otro con la misma clave: llega sin id.
    data = _ok(api, cv, objects=[_object("puerta", label="Puerta nueva")])

    rows = MapObject.objects.filter(scene_map__case_version_id=cv, object_key="puerta")
    assert [(o.id, o.label) for o in rows] == [(original, "Puerta nueva")]
    assert [o["id"] for o in data["objects"]] == [original]


def test_an_object_resent_without_the_id_it_never_received_is_not_duplicated(api, cv):
    _ok(api, cv, objects=[_object("ventana"), _object("puerta")])
    known = MapObject.objects.get(scene_map__case_version_id=cv, object_key="ventana").id

    # Un guardado cancelado ya creó «puerta»; el siguiente la vuelve a mandar sin id, con «ventana» por su id.
    _ok(api, cv, objects=[_object("ventana", id=known), _object("puerta", x=99)])

    rows = MapObject.objects.filter(scene_map__case_version_id=cv).order_by("object_key")
    assert [(o.object_key, o.position_x) for o in rows] == [("puerta", 99), ("ventana", 10)]


def test_a_row_claimed_by_its_id_is_not_taken_by_a_new_entry_with_its_old_key(api, cv):
    _ok(api, cv, objects=[_object("puerta")])
    claimed = MapObject.objects.get(scene_map__case_version_id=cv, object_key="puerta").id

    # La fila cambia de clave (por su id) y una entrada nueva toma la clave que dejó libre.
    _ok(api, cv, objects=[_object("puerta-vieja", id=claimed), _object("otra")])

    rows = {o.object_key: o.id for o in MapObject.objects.filter(scene_map__case_version_id=cv)}
    assert rows["puerta-vieja"] == claimed
    assert rows["otra"] != claimed


def test_a_zone_and_a_dialogue_put_back_with_the_same_key_reuse_their_rows(api, cv):
    first = _ok(api, cv, collisionZones=[_zone("muro")], dialogues=[_dialogue("saludo")])
    zone_id = first["collisionZones"][0]["id"]
    tree_id = DialogueTree.objects.get(scene_map__case_version_id=cv, tree_key="saludo").id

    _ok(api, cv, collisionZones=[_zone("muro", x=5)], dialogues=[_dialogue("saludo", speakerName="Otra voz")])

    assert [(z.id, z.position_x) for z in CollisionZone.objects.filter(scene_map__case_version_id=cv)] == [(zone_id, 5)]
    assert [(t.id, t.speaker_name) for t in DialogueTree.objects.filter(scene_map__case_version_id=cv)] == [
        (tree_id, "Otra voz")
    ]
