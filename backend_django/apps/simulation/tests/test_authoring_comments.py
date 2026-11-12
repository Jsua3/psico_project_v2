"""Tarea 4 (bloque A2) · ``comments`` de la escena por la API de autoría, con validación estricta."""
import json

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import CaseCharacter, SimulationNode

User = get_user_model()
AUTHORING = "/api/authoring/cases"


@pytest.fixture
def api(db):
    user = User.objects.create_user(
        email="cm_author@x.com", password="Clave-Segura-2026!", nombre="Au", apellido="Tor", role="PROFESOR"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def case(api):
    created = api.post(AUTHORING, {"title": "Caso con comentarios"}, format="json")
    assert created.status_code == 200, created.data
    cv = created.data["data"]["caseVersionId"]
    state = api.get(f"{AUTHORING}/{cv}/editor").data["data"]
    CaseCharacter.objects.create(case_version_id=cv, character_key="abuela", display_name="Abuela")
    return {"cv": cv, "node": next(n["id"] for n in state["nodes"] if n["key"] == "inicio")}


def _put_node(api, case, **extra):
    body = {"nodeKey": "inicio", "title": "Inicio", "narrative": "Inicio.", **extra}
    return api.put(f"{AUTHORING}/{case['cv']}/nodes/{case['node']}", body, format="json")


def _stored(case):
    return json.loads(SimulationNode.objects.get(pk=case["node"]).comments_json)


def _editor_node(api, case):
    state = api.get(f"{AUTHORING}/{case['cv']}/editor").data["data"]
    return next(n for n in state["nodes"] if n["id"] == case["node"])


def test_put_nodo_guarda_comentarios_validos_y_el_editor_los_lee(api, case):
    comments = [
        {"personaje": "abuela", "linea": "Pasa, pasa.", "cuando": {"talked": "abuela"}, "emocion": "alegre",
         "gesto": "asiente"},
        {"personaje": "abuela", "linea": "Hace frío.", "emocion": "triste"},
    ]

    response = _put_node(api, case, comments=comments)

    assert response.status_code == 200, response.data
    assert _stored(case) == comments
    assert _editor_node(api, case)["comments"] == comments


def test_el_editor_da_lista_vacia_si_la_escena_no_tiene_comentarios(api, case):
    assert _editor_node(api, case)["comments"] == []


def test_ausente_no_toca_y_null_o_lista_vacia_limpian(api, case):
    comments = [{"personaje": "abuela", "linea": "Hola."}]
    assert _put_node(api, case, comments=comments).status_code == 200

    assert _put_node(api, case).status_code == 200
    assert _stored(case) == comments

    assert _put_node(api, case, comments=None).status_code == 200
    assert _stored(case) == []

    assert _put_node(api, case, comments=comments).status_code == 200
    assert _put_node(api, case, comments=[]).status_code == 200
    assert _stored(case) == []


@pytest.mark.parametrize("comments, mensaje", [
    ([{}] * 7, "Una escena admite hasta 6 comentarios."),
    ([{"personaje": "abuela"}], "Cada comentario necesita personaje y linea."),
    ([{"personaje": "nadie", "linea": "x"}], "El caso no tiene el personaje «nadie»."),
    ([{"personaje": "abuela", "linea": "x", "tono": "y"}],
     "El comentario no admite «tono»: solo personaje, linea, cuando, emocion, gesto."),
    ([{"personaje": "abuela", "linea": "x", "cuando": {"talked": 3}}],
     "La condición del comentario no es válida en el vocabulario del caso."),
    ([{"personaje": "abuela", "linea": "x", "gesto": "salta"}],
     "El gesto «salta» no existe: se-acerca, asiente, se-aparta, baja-la-mirada, se-agita."),
])
def test_comentarios_invalidos_dan_400_con_field_comments(api, case, comments, mensaje):
    assert _put_node(api, case, comments=[{"personaje": "abuela", "linea": "Previo."}]).status_code == 200

    response = _put_node(api, case, comments=comments)

    assert response.status_code == 400, response.data
    assert response.data["field"] == "comments"
    assert response.data["message"] == mensaje
    assert _stored(case) == [{"personaje": "abuela", "linea": "Previo."}]


@pytest.mark.parametrize("linea", ["Con <b>formato</b>", "Mira https://ejemplo.com", "dos\nlíneas", "x" * 401])
def test_la_linea_del_comentario_es_texto_plano_de_una_linea(api, case, linea):
    response = _put_node(api, case, comments=[{"personaje": "abuela", "linea": linea}])

    assert response.status_code == 400, response.data
    assert response.data["field"] == "comments"


def test_un_cuando_demasiado_largo_es_400(api, case):
    cuando = {"all": [{"talked": "abuela"}] * 400}

    response = _put_node(api, case, comments=[{"personaje": "abuela", "linea": "x", "cuando": cuando}])

    assert response.status_code == 400, response.data
    assert response.data["field"] == "comments"


def test_crear_un_nodo_con_comentarios(api, case):
    response = api.post(
        f"{AUTHORING}/{case['cv']}/nodes",
        {"nodeKey": "otra", "title": "Otra", "narrative": "Otra.",
         "comments": [{"personaje": "abuela", "linea": "Ya voy."}]},
        format="json",
    )

    assert response.status_code == 200, response.data
    nodo = next(n for n in response.data["data"]["nodes"] if n["key"] == "otra")
    assert nodo["comments"] == [{"personaje": "abuela", "linea": "Ya voy."}]
