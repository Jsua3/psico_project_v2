"""S2-6b (segunda parte) · Topes de texto de las columnas del guardado del mundo.

El guardado del mundo lee el cuerpo sin serializador de campos: un texto más largo que su columna daba 500 de
PostgreSQL (el sondeo midió 13 campos). Ahora el tope sale del modelo (``Model._meta.get_field(campo).max_length``)
y un texto de más es un 400 que nombra la ruta del campo y el tope. Exactamente del tope, se guarda.
"""
import json
import secrets

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, SceneMap
from apps.simulation.models.world import CollisionZone, DialogueChoice, DialogueLine, DialogueTree, MapObject

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security]

User = get_user_model()
BASE = "/api/admin/cases"


def _con_objeto(campos):
    return {"objects": [{"key": "LIM_T", "label": "t", "type": "OBJECT", **campos}]}


def _con_dialogo(campos):
    return {"dialogues": [{"key": "LIM_DLG", "speakerName": "S", "lines": [], **campos}]}


# (ruta del campo en el cuerpo, modelo, campo del modelo, cómo se pone el valor en el cuerpo)
CAMPOS = [
    ("map.theme", SceneMap, "theme", lambda v: {"map": {"theme": v}}),
    ("objects.facing", MapObject, "facing", lambda v: _con_objeto({"facing": v})),
    ("objects.colorHex", MapObject, "color_hex", lambda v: _con_objeto({"colorHex": v})),
    ("objects.shortCode", MapObject, "short_code", lambda v: _con_objeto({"shortCode": v})),
    ("objects.interactionPrompt", MapObject, "interaction_prompt", lambda v: _con_objeto({"interactionPrompt": v})),
    ("objects.toolCode", MapObject, "tool_code", lambda v: _con_objeto({"toolCode": v})),
    ("dialogues.speakerName", DialogueTree, "speaker_name", lambda v: _con_dialogo({"speakerName": v})),
    ("dialogues.emotion", DialogueTree, "emotion", lambda v: _con_dialogo({"emotion": v})),
    # Fuera de los 13 del sondeo: lo encontró la misma pasada (tope 120, sin serializador que lo valide).
    ("dialogues.portraitKey", DialogueTree, "portrait_key", lambda v: _con_dialogo({"portraitKey": v})),
    (
        "dialogues.lines.speakerName", DialogueLine, "speaker_name",
        lambda v: _con_dialogo({"lines": [{"order": 0, "speakerName": v, "text": "t", "emotion": "neutral"}]}),
    ),
    (
        "dialogues.lines.emotion", DialogueLine, "emotion",
        lambda v: _con_dialogo({"lines": [{"order": 0, "speakerName": "S", "text": "t", "emotion": v}]}),
    ),
    (
        "collisionZones.label", CollisionZone, "label",
        lambda v: {"collisionZones": [{"key": "Z1", "label": v, "x": 0, "y": 0, "width": 10, "height": 10}]},
    ),
    ("choices.key", DialogueChoice, "choice_key", lambda v: _con_dialogo({"choices": [{"key": v, "text": "t"}]})),
    (
        "choices.requiredToolCode", DialogueChoice, "required_tool_code",
        lambda v: _con_dialogo({"choices": [{"key": "c1", "text": "t", "requiredToolCode": v}]}),
    ),
]
IDS = [caso[0] for caso in CAMPOS]


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="textos_admin@x.com", password=secrets.token_urlsafe(24), nombre="A", apellido="T", role="ADMIN"
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


def _guardar_mundo(api, borrador, cuerpo):
    revision = CaseVersion.objects.get(pk=borrador).version
    return api.generic(
        "PUT", f"{BASE}/{borrador}/world", json.dumps({"revision": revision, **cuerpo}),
        content_type="application/json",
    )


@pytest.mark.parametrize("ruta, modelo, campo, poner", CAMPOS, ids=IDS)
def test_texto_de_mas_de_su_columna_da_400_con_la_ruta_y_el_tope(api, borrador, ruta, modelo, campo, poner):
    tope = modelo._meta.get_field(campo).max_length

    resp = _guardar_mundo(api, borrador, poner("x" * (tope + 1)))

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == ruta
    assert str(tope) in resp.data["message"]


@pytest.mark.parametrize("ruta, modelo, campo, poner", CAMPOS, ids=IDS)
def test_texto_del_tamano_de_su_columna_se_guarda(api, borrador, ruta, modelo, campo, poner):
    tope = modelo._meta.get_field(campo).max_length

    resp = _guardar_mundo(api, borrador, poner("x" * tope))

    assert resp.status_code == 200, resp.data
