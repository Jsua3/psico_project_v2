"""E5-1 (reparación) · Cerrojo primero, lectura después: el ``PATCH world-state`` no pisa lo que otra orden confirmó.

``attempt_lock`` fija la regla: toda orden que muta el intento toma ``SELECT … FOR UPDATE`` de su fila **antes de
leer nada**, para que la que espera lea, al despertar, lo que la primera ya confirmó. E5-1 había juntado el cerrojo
y la lectura del estado del mundo en UNA sentencia (``select_for_update(of=("self",))`` con
``select_related("world_state")``): PostgreSQL le entrega a quien espera la fila del intento al día, pero las filas
de las otras tablas de la unión tal como estaban antes de esperar. El PATCH de posición, que reescribe
``flags_json``, devolvía entonces al estado del mundo un contenido viejo (marcas como ``viewedNpcKeys``, que abren
puertas) o revertía un cambio de sala que otra orden acababa de confirmar.

Hilos con commits reales (``committed_attempt`` y ``run_concurrently``): el «dueño del cerrojo» es cualquier otra
orden del intento (interactuar, decidir, cruzar una puerta); aquí se representa con la escritura que esas hacen
sobre el estado del mundo.
"""
import json
import time

import pytest
from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.simulation.models import AttemptWorldState, SceneMap, SimulationAttempt
from apps.simulation.services import world_service
from apps.simulation.services.attempt_lock import lock_attempt_row
from shared.testing import run_concurrently

from .test_attempt_concurrency import committed_attempt  # noqa: F401  (fixture)

pytestmark = [pytest.mark.req("RNF-08"), pytest.mark.req("TD-04"), pytest.mark.req("RNF-05")]

#: Cuánto tarda la «otra orden» en confirmar; el PATCH llega a mitad de ese tiempo, con el cerrojo ya tomado.
HOLD_SECONDS = 1.2
ARRIVES_AFTER = 0.4


def _start_position(a):
    """Persiste el estado inicial del mundo (el primer PATCH lo crea) y devuelve ``(clave del mapa, x, y)``."""
    world = world_service.get_world(a.attempt_id, a.token, a.student)
    key, x, y = world["map"]["key"], world["player"]["x"], world["player"]["y"]
    world_service.update_position(a.attempt_id, a.token, x + 4, y, a.student, key)
    return key, x + 4, y


def _hold_lock_and_write(a, **changes):
    """La «otra orden»: toma el cerrojo del intento, escribe sobre el estado del mundo y tarda en confirmar."""

    def order():
        with transaction.atomic():
            lock_attempt_row(a.attempt_id)
            state = AttemptWorldState.objects.get(attempt_id=a.attempt_id)
            updates = dict(changes)
            if "mark" in updates:
                flags = json.loads(state.flags_json or "{}")
                flags["marcaDeLaOtraOrden"] = updates.pop("mark")
                updates["flags_json"] = json.dumps(flags)
            AttemptWorldState.objects.filter(pk=state.pk).update(**updates)
            time.sleep(HOLD_SECONDS)

    return order


def _patch_after_a_moment(a, key, x, y):
    def move():
        time.sleep(ARRIVES_AFTER)
        return world_service.update_position(a.attempt_id, a.token, x + 4, y, a.student, key)

    return move


def test_el_patch_de_posicion_no_pisa_las_marcas_que_otra_orden_confirmo_mientras_esperaba(committed_attempt):
    a = committed_attempt
    key, x, y = _start_position(a)

    other, moved = run_concurrently(_hold_lock_and_write(a, mark="confirmada"), _patch_after_a_moment(a, key, x, y))

    assert other.error is None and moved.error is None, (other.error, moved.error)
    flags = json.loads(AttemptWorldState.objects.get(attempt_id=a.attempt_id).flags_json)
    assert flags.get("marcaDeLaOtraOrden") == "confirmada", "el PATCH pisó lo que la otra orden confirmó"
    assert moved.value["player"] == {"x": x + 4, "y": y}
    assert AttemptWorldState.objects.get(attempt_id=a.attempt_id).player_x == x + 4


def test_un_cambio_de_sala_confirmado_mientras_el_patch_espera_no_se_revierte(committed_attempt):
    a = committed_attempt
    key, x, y = _start_position(a)
    state = AttemptWorldState.objects.get(attempt_id=a.attempt_id)
    version_id = SimulationAttempt.objects.get(pk=a.attempt_id).case_version_id
    other_room = SceneMap.objects.filter(case_version_id=version_id).exclude(pk=state.scene_map_id).first()
    assert other_room is not None

    other, moved = run_concurrently(
        _hold_lock_and_write(a, scene_map_id=other_room.id, player_x=other_room.spawn_x, player_y=other_room.spawn_y),
        _patch_after_a_moment(a, key, x, y),  # el cliente aún manda la sala vieja
    )

    assert other.error is None and moved.error is None, (other.error, moved.error)
    saved = AttemptWorldState.objects.get(attempt_id=a.attempt_id)
    assert saved.scene_map_id == other_room.id, "el PATCH devolvió al jugador a la sala anterior"
    assert (saved.player_x, saved.player_y) == (other_room.spawn_x, other_room.spawn_y)
    # y al cliente se le entrega el mundo completo de la sala nueva (no el acuse mínimo)
    assert moved.value["map"]["key"] == other_room.map_key
    assert "objects" in moved.value and "collisions" in moved.value


def test_el_patch_ve_el_estado_del_intento_que_otra_orden_confirmo_mientras_esperaba(committed_attempt):
    """La fila del intento llega al día aunque viaje en la misma consulta que el cerrojo (E5-1): su unión es estática."""
    a = committed_attempt
    key, x, y = _start_position(a)

    def finish_the_attempt():
        with transaction.atomic():
            lock_attempt_row(a.attempt_id)
            SimulationAttempt.objects.filter(pk=a.attempt_id).update(status="COMPLETED")
            time.sleep(HOLD_SECONDS)

    other, moved = run_concurrently(finish_the_attempt, _patch_after_a_moment(a, key, x, y))

    assert other.error is None
    assert isinstance(moved.error, ValidationError), moved.value  # el intento ya no acepta movimiento
    assert AttemptWorldState.objects.get(attempt_id=a.attempt_id).player_x == x


def test_el_patch_no_falla_si_otra_orden_avanza_el_nodo_del_intento_mientras_espera(committed_attempt):
    """``current_node`` tampoco es estático: con la unión en la sentencia que espera el cerrojo, la fila nueva del
    intento (otro ``current_node_id``) no casaba con la fila vieja del nodo y el INNER JOIN la descartaba: un 404
    espurio para un intento que existe."""
    a = committed_attempt
    key, x, y = _start_position(a)
    attempt = SimulationAttempt.objects.get(pk=a.attempt_id)
    next_map = SceneMap.objects.filter(case_version_id=attempt.case_version_id).exclude(node_id=attempt.current_node_id).first()
    assert next_map is not None

    def advance_the_node():
        with transaction.atomic():
            lock_attempt_row(a.attempt_id)
            SimulationAttempt.objects.filter(pk=a.attempt_id).update(current_node_id=next_map.node_id)
            time.sleep(HOLD_SECONDS)

    other, moved = run_concurrently(advance_the_node, _patch_after_a_moment(a, key, x, y))

    assert other.error is None and moved.error is None, (other.error, moved.error)
    # El mundo sigue al nodo que la otra orden confirmó: el cliente, con la sala vieja, recibe el mundo completo de la nueva.
    assert moved.value["map"]["key"] == next_map.map_key
    assert {"objects", "collisions"} <= set(moved.value)
    assert SimulationAttempt.objects.get(pk=a.attempt_id).current_node_id == next_map.node_id


def test_con_la_sala_vieja_el_patch_devuelve_el_mundo_completo_y_con_la_actual_solo_el_acuse(committed_attempt):
    """Las dos mitades de «acuse mínimo salvo cambio de sala» (E5-1), sin hilos."""
    a = committed_attempt
    key, x, y = _start_position(a)

    ack = world_service.update_position(a.attempt_id, a.token, x + 4, y, a.student, key)
    assert set(ack) == {"attemptId", "status", "map", "player"}
    assert ack["map"] == {"key": key} and ack["player"] == {"x": x + 4, "y": y}

    state = AttemptWorldState.objects.get(attempt_id=a.attempt_id)
    version_id = SimulationAttempt.objects.get(pk=a.attempt_id).case_version_id
    other_room = SceneMap.objects.filter(case_version_id=version_id).exclude(pk=state.scene_map_id).first()
    AttemptWorldState.objects.filter(pk=state.pk).update(scene_map_id=other_room.id)

    echo = world_service.update_position(a.attempt_id, a.token, x + 8, y, a.student, key)  # la sala que el cliente cree

    assert echo["map"]["key"] == other_room.map_key
    assert {"objects", "collisions", "tools", "inventory"} <= set(echo)
    assert AttemptWorldState.objects.get(attempt_id=a.attempt_id).scene_map_id == other_room.id  # eco sin mutación
