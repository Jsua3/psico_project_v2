"""Tarea 7 (x-siep 2.1) · el servidor del juego solo ofrece las opciones disponibles y revalida al elegir.

El caso sale de ``sample_definition_v21``: en ``inicio`` la opción ``analizar`` exige ``inspected: carpeta`` y
``intervenir`` no exige nada. Los focos 2 a 5 de la revisión (todas retenidas, repetición, intento anterior sin registro
por sala, JSON corrupto) tienen su prueba aquí.
"""
import json
import logging
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.simulation.models import (
    AttemptWorldState,
    CaseVersion,
    DecisionOption,
    SceneMap,
    SimulationAttempt,
    SimulationCase,
)
from apps.simulation.services import game_service, option_availability, world_service
from apps.simulation.services.authoring import definition_io
from apps.simulation.services.world_state import require_world_state
from apps.simulation.tests.definition_samples import sample_definition_v21
from apps.simulation.tests.test_world import _assign_case_to_student

User = get_user_model()


@pytest.fixture
def author(db):
    return User.objects.create_user(
        email="disp_admin@x.com", password="pass1234", nombre="Ad", apellido="Min", role="ADMIN"
    )


@pytest.fixture
def actor(db):
    return User.objects.create_user(
        email="disp_est@x.com", password="pass1234", nombre="Est", apellido="Disp", role="ESTUDIANTE"
    )


@pytest.fixture
def game(actor, author):
    definition = sample_definition_v21()
    case = SimulationCase.objects.create(code="DISP-CASO", title="Disponibilidad", created_by=author)
    version = definition_io.write_definition(definition, case=case, actor=author)
    CaseVersion.objects.filter(pk=version.id).update(
        status="PUBLISHED", validated_at=timezone.now(), definition_hash="a" * 64
    )
    _assign_case_to_student(actor, version.id)
    started = game_service.start_attempt(version.id, actor)
    attempt = SimulationAttempt.objects.get(pk=started["attemptId"])
    options = {o.option_key: o for o in DecisionOption.objects.filter(case_version_id=version.id)}
    return SimpleNamespace(
        version=version, attempt=attempt, token=started["attemptToken"], actor=actor,
        gated=options["analizar"], plain=options["intervenir"], definition=definition,
    )


def _state(game):
    return game_service.get_attempt(game.attempt.id, game.token, game.actor)


def _option_ids(state):
    return {o["id"] for o in state["currentNode"]["options"]}


def _interact(game, key):
    return world_service.open_interaction(game.attempt.id, game.token, key, game.actor)


def _fresh(game):
    return SimulationAttempt.objects.get(pk=game.attempt.id)


def test_gated_option_is_hidden_until_the_object_is_inspected(game):
    assert game.gated.id not in _option_ids(_state(game))
    assert game.plain.id in _option_ids(_state(game))

    result = _interact(game, "carpeta")

    assert game.gated.id in {o["id"] for o in result["world"]["decisionOptions"]}
    assert game.gated.id in _option_ids(_state(game))


def test_a_talked_condition_unlocks_after_speaking_with_the_person(game):
    DecisionOption.objects.filter(pk=game.gated.id).update(requires_json='{"talked": "laura"}')
    assert game.gated.id not in _option_ids(_state(game))

    result = _interact(game, "laura")

    assert game.gated.id in {o["id"] for o in result["world"]["decisionOptions"]}


def test_every_tool_response_carries_the_options_even_on_repeat(game):
    DecisionOption.objects.filter(pk=game.gated.id).update(requires_json='{"used": "MAPA"}')
    _interact(game, "kit")  # recoge la herramienta
    first = world_service.use_tool(game.attempt.id, game.token, "MAPA", None, game.actor, request_id="uso-0001")
    assert game.gated.id in {o["id"] for o in first["world"]["decisionOptions"]}

    again = world_service.use_tool(game.attempt.id, game.token, "MAPA", None, game.actor, request_id="uso-0001")
    other = world_service.use_tool(game.attempt.id, game.token, "MAPA", None, game.actor, request_id="uso-0002")

    assert game.gated.id in {o["id"] for o in again["world"]["decisionOptions"]}
    assert other["alreadyUsed"] is True
    assert game.gated.id in {o["id"] for o in other["world"]["decisionOptions"]}


def test_world_reading_and_teacher_view(game):
    world = world_service.get_world(game.attempt.id, game.token, game.actor)
    assert {o["id"] for o in world["decisionOptions"]} == {game.plain.id}
    assert all(set(o) == {"id", "text"} for o in world["decisionOptions"])

    teacher = world_service.world_for_attempt(_fresh(game))
    assert teacher["decisionOptions"] == []


def test_current_node_carries_the_goal(game):
    assert _state(game)["currentNode"]["goal"] == game.definition.scenes[0].goal


def test_choosing_a_hidden_option_is_rejected(game):
    with pytest.raises(ValidationError, match="no está disponible"):
        game_service.choose_decision(game.attempt.id, game.token, game.gated.id, game.actor)


def test_a_fact_from_another_room_does_not_unlock(game):
    other_room = SceneMap.objects.get(case_version_id=game.version.id, map_key="sala-mapa")
    world_state = require_world_state(_fresh(game))
    home_room = world_state.scene_map
    world_state.scene_map = other_room
    option_availability.record_fact(world_state, "inspected", "carpeta")
    world_state.scene_map = home_room
    world_state.save()

    flags = json.loads(AttemptWorldState.objects.get(attempt_id=game.attempt.id).flags_json)
    assert flags["exploredBySala"]["sala-mapa"]["inspected"] == ["carpeta"]
    offered, _ = option_availability.split_options(_fresh(game))
    assert game.gated.id not in {o.id for o in offered}


def test_all_options_gated_by_bad_data_are_all_offered(game, caplog):  # Foco 2
    DecisionOption.objects.filter(source_node=game.attempt.current_node).update(
        requires_json='{"inspected": "no-existe"}'
    )
    total = DecisionOption.objects.filter(source_node=game.attempt.current_node).count()

    with caplog.at_level(logging.WARNING, logger="siep.game"):
        offered, withheld = option_availability.split_options(_fresh(game))

    assert len(offered) == total and withheld == []
    assert any(record.name == "siep.game" for record in caplog.records)


def test_replaying_a_decision_returns_the_first_answer(game):  # Foco 3
    _interact(game, "carpeta")
    first = game_service.choose_decision(game.attempt.id, game.token, game.gated.id, game.actor, request_id="req-0001")
    again = game_service.choose_decision(game.attempt.id, game.token, game.gated.id, game.actor, request_id="req-0001")
    assert first["consequence"] is not None
    assert again["consequence"] == first["consequence"]


def test_attempt_without_room_record_uses_the_global_lists(game):  # Foco 4
    world_state = require_world_state(_fresh(game))
    world_state.inspected_object_keys_json = json.dumps(["carpeta"])
    world_state.save()
    assert "exploredBySala" not in json.loads(world_state.flags_json)

    assert game.gated.id in _option_ids(_state(game))
    assert game.gated.id in {o.id for o in option_availability.split_options(_fresh(game))[0]}


def test_attempt_without_world_state_does_not_fail(game):  # Foco 4
    AttemptWorldState.objects.filter(attempt_id=game.attempt.id).delete()

    ids = _option_ids(_state(game))

    assert game.gated.id not in ids
    assert game.plain.id in ids


def test_corrupt_requires_json_hides_the_option_without_error(game):  # Foco 5
    DecisionOption.objects.filter(pk=game.gated.id).update(requires_json="{no es json")
    assert game.gated.id not in {o.id for o in option_availability.split_options(_fresh(game))[0]}
    assert game.gated.id not in _option_ids(_state(game))
    assert option_availability.is_offered(_fresh(game), DecisionOption.objects.get(pk=game.gated.id)) is False


def test_student_world_does_not_expose_the_room_record(game):
    result = _interact(game, "carpeta")
    assert "exploredBySala" not in result["world"]["flags"]
    assert "exploredBySala" in json.loads(AttemptWorldState.objects.get(attempt_id=game.attempt.id).flags_json)


def test_sala_key_prefers_the_ambient_sala_id(game):
    scene_map = SceneMap.objects.get(case_version_id=game.version.id, map_key="sala-inicio")
    assert option_availability.sala_key(scene_map) == "sala-inicio"
    scene_map.ambient_json = json.dumps({"salaId": "sala-especial"})
    assert option_availability.sala_key(scene_map) == "sala-especial"
