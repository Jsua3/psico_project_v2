"""Tarea 5 (bloque A2) · ``world.comments``: lo que dicen los personajes al acercarse, ya evaluado en el servidor.

El caso sale de ``sample_definition_with_comments``: ``inicio`` trae dos comentarios de ``laura``; uno sin ``cuando`` y otro
que solo se dice tras inspeccionar la ``carpeta`` en esa sala.
"""
import json
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.simulation.models import (
    AttemptWorldState,
    CaseVersion,
    MapObject,
    SceneMap,
    SimulationAttempt,
    SimulationCase,
    SimulationNode,
)
from apps.simulation.services import comments as comments_service
from apps.simulation.services import game_service, world_service
from apps.simulation.services.authoring import definition_io
from apps.simulation.tests.definition_samples import sample_definition_with_comments
from apps.simulation.tests.test_world import _assign_case_to_student, attempt_headers

User = get_user_model()
LAURA_LINE = "Qué bueno que llegó, la esperaba."
FOLDER_LINE = "Esa carpeta tiene las notas del equipo."


@pytest.fixture
def author(db):
    return User.objects.create_user(
        email="com_admin@x.com", password="pass1234", nombre="Ad", apellido="Min", role="ADMIN"
    )


@pytest.fixture
def actor(db):
    return User.objects.create_user(
        email="com_est@x.com", password="pass1234", nombre="Est", apellido="Com", role="ESTUDIANTE"
    )


@pytest.fixture
def game(actor, author):
    case = SimulationCase.objects.create(code="COM-CASO", title="Comentarios", created_by=author)
    version = definition_io.write_definition(sample_definition_with_comments(), case=case, actor=author)
    CaseVersion.objects.filter(pk=version.id).update(
        status="PUBLISHED", validated_at=timezone.now(), definition_hash="b" * 64
    )
    _assign_case_to_student(actor, version.id)
    started = game_service.start_attempt(version.id, actor)
    attempt = SimulationAttempt.objects.get(pk=started["attemptId"])
    client = APIClient()
    client.force_authenticate(user=actor)
    return SimpleNamespace(
        version=version, attempt=attempt, token=started["attemptToken"], actor=actor, client=client,
        node=SimulationNode.objects.get(case_version_id=version.id, node_key="inicio"),
    )


def _world(game):
    return world_service.get_world(game.attempt.id, game.token, game.actor)


def _lines(world):
    return [c["line"] for c in world["comments"]]


def _set_comments(game, comments, node=None):
    node = node or game.node
    SimulationNode.objects.filter(pk=node.id).update(comments_json=json.dumps(comments))
    node.refresh_from_db()


def test_sin_cuando_el_comentario_sale_desde_el_principio(game):
    world = _world(game)

    assert _lines(world) == [LAURA_LINE]
    assert world["comments"][0] == {
        "id": f"{game.node.id}-0", "objectKey": "laura", "line": LAURA_LINE, "emotion": None, "gesture": None,
    }


def test_con_cuando_sale_solo_despues_de_inspeccionar_en_esa_sala(game):
    assert FOLDER_LINE not in _lines(_world(game))

    response = game.client.post(
        f"/api/simulation/attempts/{game.attempt.id}/interactions/carpeta",
        {"attemptToken": game.token}, format="json",
    )

    assert response.status_code == 200, response.data
    comments = response.data["data"]["world"]["comments"]
    assert [c["line"] for c in comments] == [LAURA_LINE, FOLDER_LINE]
    assert comments[1]["id"] == f"{game.node.id}-1"
    assert (comments[1]["emotion"], comments[1]["gesture"]) == ("preocupada", "se-acerca")
    assert FOLDER_LINE in _lines(_world(game))


def test_nunca_viaja_la_condicion(game):
    world_service.open_interaction(game.attempt.id, game.token, "carpeta", game.actor)
    world = _world(game)

    assert len(world["comments"]) == 2
    for comment in world["comments"]:
        assert set(comment) == {"id", "objectKey", "line", "emotion", "gesture"}
    assert "cuando" not in json.dumps(world["comments"])


def test_cuando_roto_o_personaje_ausente_no_sale_y_no_rompe(game):
    _set_comments(game, [
        {"personaje": "laura", "linea": "roto", "cuando": {"inventado": "x"}},
        {"personaje": "laura", "linea": "no es objeto", "cuando": "carpeta"},
        {"personaje": "laura", "linea": "vacío", "cuando": {}},
        {"personaje": "figurante", "linea": "sin persona en el mapa"},
        {"personaje": "fantasma", "linea": "no existe"},
        {"personaje": "laura", "linea": "bueno", "emocion": "inventada", "gesto": 7},
    ])

    world = _world(game)

    assert _lines(world) == ["bueno"]
    assert world["comments"][0]["id"] == f"{game.node.id}-5"  # la posición es la del documento
    assert (world["comments"][0]["emotion"], world["comments"][0]["gesture"]) == (None, None)
    SimulationNode.objects.filter(pk=game.node.id).update(comments_json="no es json{")
    assert _world(game)["comments"] == []


def test_vacio_en_la_traza_docente_y_con_el_intento_cerrado(game):
    assert world_service.world_for_attempt(SimulationAttempt.objects.get(pk=game.attempt.id))["comments"] == []

    SimulationAttempt.objects.filter(pk=game.attempt.id).update(status="PAUSED")
    assert _world(game)["comments"] == []


def test_vacio_en_una_escena_terminal(game):
    closing = SimulationNode.objects.get(case_version_id=game.version.id, node_key="cierre")
    _set_comments(game, [{"personaje": "laura", "linea": "hola"}], closing)
    SimulationAttempt.objects.filter(pk=game.attempt.id).update(current_node=closing)

    assert _world(game)["comments"] == []


def test_objectKey_es_la_persona_en_el_mapa_del_estudiante_y_si_no_en_el_de_la_escena(game):
    # Sin persona de ese personaje en el mapa del estudiante: la de la escena.
    other = SceneMap.objects.get(case_version_id=game.version.id, map_key="sala-mapa")
    scene_laura = MapObject.objects.get(scene_map__node_id=game.node.id, object_key="laura")
    state = world_service.resolve_world_state(SimulationAttempt.objects.get(pk=game.attempt.id))[0]
    state.scene_map = other
    state.save()
    assert _world(game)["comments"][0]["objectKey"] == "laura"

    # Con otra Laura en el mapa del estudiante: esa gana.
    MapObject.objects.create(
        scene_map=other, object_key="laura-aqui", label="Laura", object_type="PERSON", character=scene_laura.character,
    )
    assert _world(game)["comments"][0]["objectKey"] == "laura-aqui"
    # Una persona oculta no cuenta.
    MapObject.objects.filter(scene_map=other, object_key="laura-aqui").update(visible=False)
    assert _world(game)["comments"][0]["objectKey"] == "laura"


def test_sin_comentarios_no_hay_consultas_de_mas(game):
    _set_comments(game, [])
    attempt = SimulationAttempt.objects.get(pk=game.attempt.id)
    state = AttemptWorldState.objects.filter(attempt_id=attempt.id).select_related("scene_map").first()
    with CaptureQueriesContext(connection) as queries:
        assert comments_service.due_comments(attempt, game.node, state) == []
    assert len(queries) == 0

    url = f"/api/simulation/attempts/{game.attempt.id}/world"
    game.client.get(url, **attempt_headers(game.token))  # calienta cachés
    with CaptureQueriesContext(connection) as sin:
        assert game.client.get(url, **attempt_headers(game.token)).status_code == 200
    assert len(sin) <= 9  # el tope de ``get_world`` en test_query_budget

    _set_comments(game, [{"personaje": "laura", "linea": "hola"}])
    with CaptureQueriesContext(connection) as con:
        assert game.client.get(url, **attempt_headers(game.token)).status_code == 200
    assert len(con) <= len(sin) + 1  # una sola consulta de personas, sin repetir el contexto
