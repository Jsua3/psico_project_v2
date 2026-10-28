"""E1-6 · Las lecturas del mundo no escriben (D-15) y la traza tolera un nodo final sin mapa (D-16).

Antes, ``GET /world`` sincronizaba y **guardaba** el estado del mundo en cada llamada (un
UPDATE por lectura, con ``updated_at`` cambiando) y la traza de un intento en un nodo
final sin mapa respondía 404. Ahora resolver el estado es una función pura; solo las
órdenes que mutan lo persisten, y el ancla de plausibilidad del desplazamiento es
``last_activity_at`` (el momento del cambio de nodo), no un sello que ponía la lectura.
"""
from datetime import datetime

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.simulation.models import (
    AttemptWorldState,
    DecisionOption,
    SceneMap,
    SimulationAttempt,
    SimulationNode,
)
from shared.testing import measure

from .test_world import _move, _start, case_version_id, cl, estudiante  # noqa: F401  (fixtures)

pytestmark = pytest.mark.req("RF-20")

BASE = "/api/simulation"
User = get_user_model()


def _world(client, attempt_id, token):
    return client.get(f"{BASE}/attempts/{attempt_id}/world", HTTP_X_SIEP_ATTEMPT_TOKEN=token)


def _advance(client, attempt_id, token):
    """Decide la opción adecuada del nodo actual: el intento pasa al nodo siguiente."""
    node_id = SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    good = DecisionOption.objects.filter(source_node_id=node_id, response_class="RECOMMENDED").order_by("id").first()
    response = client.post(
        f"{BASE}/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": good.id},
        format="json",
    )
    assert response.status_code == 200, response.data


@pytest.fixture
def frozen_clock(monkeypatch):
    """Congela ``timezone.now``: el presupuesto de desplazamiento depende del tiempo transcurrido."""
    now = datetime(2026, 9, 1, 10, 0, 0)  # naive: USE_TZ=False
    monkeypatch.setattr(timezone, "now", lambda: now)
    return now


@pytest.fixture
def instructor(db):
    return User.objects.create_user(
        email="admin_traza@x.com", password="pass1234", nombre="Ad", apellido="Traza", role="ADMIN"
    )


def test_get_world_no_escribe_nada_ni_crea_el_estado(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)

    response, cost = measure(lambda: _world(c, attempt_id, token))

    assert response.status_code == 200
    assert cost.writes == 0, cost.statements
    assert not AttemptWorldState.objects.filter(attempt_id=attempt_id).exists()
    assert response.data["data"]["player"]["x"] == response.data["data"]["map"]["spawnX"]


def test_get_world_con_estado_guardado_no_cambia_updated_at(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    map_key = _world(c, attempt_id, token).data["data"]["map"]["key"]
    _move(c, attempt_id, token, map_key, (340, 430))
    before = AttemptWorldState.objects.get(attempt_id=attempt_id)

    response, cost = measure(lambda: _world(c, attempt_id, token))

    after = AttemptWorldState.objects.get(attempt_id=attempt_id)
    assert response.status_code == 200
    assert cost.writes == 0
    assert after.updated_at == before.updated_at
    assert response.data["data"]["player"] == {"x": 340, "y": 430}


def test_get_world_tras_decidir_devuelve_el_spawn_del_nodo_nuevo_sin_persistirlo(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    first_map = _world(c, attempt_id, token).data["data"]["map"]["key"]
    _move(c, attempt_id, token, first_map, (340, 430))  # crea el estado guardado en la sala 1
    before = AttemptWorldState.objects.get(attempt_id=attempt_id)
    _advance(c, attempt_id, token)

    world = _world(c, attempt_id, token).data["data"]

    assert world["map"]["key"] != first_map
    assert world["player"] == {"x": world["map"]["spawnX"], "y": world["map"]["spawnY"]}
    after = AttemptWorldState.objects.get(attempt_id=attempt_id)
    assert after.scene_map_id == before.scene_map_id, "la lectura no persiste la sincronización"
    assert (after.player_x, after.player_y) == (before.player_x, before.player_y)


def test_el_primer_movimiento_tras_cambiar_de_nodo_se_acepta_y_persiste_la_sincronizacion(
    estudiante, case_version_id, frozen_clock
):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    first_map = _world(c, attempt_id, token).data["data"]["map"]["key"]
    _move(c, attempt_id, token, first_map, (340, 430))
    _advance(c, attempt_id, token)
    world = _world(c, attempt_id, token).data["data"]
    spawn_x, spawn_y = world["map"]["spawnX"], world["map"]["spawnY"]

    response = c.patch(
        f"{BASE}/attempts/{attempt_id}/world-state",
        {"attemptToken": token, "playerX": spawn_x + 20, "playerY": spawn_y, "currentMapKey": world["map"]["key"]},
        format="json",
    )

    assert response.status_code == 200, response.data
    state = AttemptWorldState.objects.get(attempt_id=attempt_id)
    assert state.scene_map.map_key == world["map"]["key"]
    assert (state.player_x, state.player_y) == (spawn_x + 20, spawn_y)


def test_un_salto_absurdo_tras_cambiar_de_nodo_sigue_rechazado(estudiante, case_version_id, frozen_clock):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    first_map = _world(c, attempt_id, token).data["data"]["map"]["key"]
    _move(c, attempt_id, token, first_map, (340, 430))
    _advance(c, attempt_id, token)
    world = _world(c, attempt_id, token).data["data"]
    spawn_x, width = world["map"]["spawnX"], world["map"]["width"]
    # El punto del mapa más lejano del spawn: sin tiempo transcurrido el presupuesto es de 240 px.
    far_x = max((40, width - 40), key=lambda x: abs(x - spawn_x))
    assert abs(far_x - spawn_x) > 240, "el destino debe quedar fuera del presupuesto base"

    response = c.patch(
        f"{BASE}/attempts/{attempt_id}/world-state",
        {"attemptToken": token, "playerX": far_x, "playerY": world["map"]["spawnY"],
         "currentMapKey": world["map"]["key"]},
        format="json",
    )

    assert response.status_code == 400
    assert "plausible" in response.data["message"]


def test_la_traza_de_un_nodo_final_sin_mapa_responde_200_con_world_nulo(estudiante, case_version_id, instructor):
    c = cl(estudiante)
    attempt_id, _ = _start(c, case_version_id)
    current = SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    SceneMap.objects.filter(node_id=current).delete()  # un nodo final sin escena

    response = cl(instructor).get(f"/api/instructor/attempts/{attempt_id}/trace")

    assert response.status_code == 200, response.data
    assert response.data["data"]["world"] is None


def test_get_world_de_un_nodo_sin_mapa_y_sin_estado_guardado_sigue_siendo_404(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    current = SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    SceneMap.objects.filter(node_id=current).delete()

    response = _world(c, attempt_id, token)

    assert response.status_code == 404


def test_get_world_de_un_nodo_final_sin_mapa_sirve_el_ultimo_mundo_guardado(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    map_key = _world(c, attempt_id, token).data["data"]["map"]["key"]
    _move(c, attempt_id, token, map_key, (340, 430))
    attempt = SimulationAttempt.objects.get(pk=attempt_id)
    final = SimulationNode.objects.create(
        case_version_id=attempt.case_version_id, node_key="fin-sin-mapa", title="Fin", narrative="Fin",
        terminal_node=True,
    )
    SimulationAttempt.objects.filter(pk=attempt_id).update(current_node=final, status="COMPLETED")

    response = _world(c, attempt_id, token)

    assert response.status_code == 200
    assert response.data["data"]["map"]["key"] == map_key
    assert response.data["data"]["player"] == {"x": 340, "y": 430}
