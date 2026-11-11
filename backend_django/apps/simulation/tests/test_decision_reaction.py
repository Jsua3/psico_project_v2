"""Tarea 8 (x-siep 2.1) · la respuesta de una decisión trae la reacción del personaje, también en la segunda oportunidad.

Mismo caso que la Tarea 7 (``sample_definition_v21``): ``analizar`` (RECOMMENDED) exige haber inspeccionado la carpeta y
trae reacción propia; ``intervenir`` (RISKY) no tiene requisito ni reacción. La muestra no trae una opción
CONTRAINDICATED: se cambia la clase en la base.
"""
import json
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.simulation.casedef import vocabulary
from apps.simulation.services.world_state import require_world_state
from apps.simulation.models import (
    CaseVersion,
    DecisionOption,
    SimulationAttempt,
    SimulationCase,
)
from apps.simulation.services import game_service, reaction, world_service
from apps.simulation.services.authoring import definition_io
from apps.simulation.tests.definition_samples import sample_definition_v21
from apps.simulation.tests.test_world import _assign_case_to_student
from shared.jsonutils import read_map, write_map

User = get_user_model()

PERSON_KEY = "laura"


@pytest.fixture
def author(db):
    return User.objects.create_user(
        email="reac_admin@x.com", password="pass1234", nombre="Ad", apellido="Min", role="ADMIN"
    )


@pytest.fixture
def actor(db):
    return User.objects.create_user(
        email="reac_est@x.com", password="pass1234", nombre="Est", apellido="Reac", role="ESTUDIANTE"
    )


@pytest.fixture
def game(actor, author):
    definition = sample_definition_v21()
    case = SimulationCase.objects.create(code="REAC-CASO", title="Reacción", created_by=author)
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
        gated=options["analizar"], plain=options["intervenir"],
    )


def _choose(game, option):
    return game_service.choose_decision(game.attempt.id, game.token, option.id, game.actor)


def _set_persona(game, bond, activation):
    world_state = require_world_state(SimulationAttempt.objects.get(pk=game.attempt.id))
    flags = read_map(world_state.flags_json)
    flags["persona"] = {"bond": bond, "activation": activation}
    world_state.flags_json = write_map(flags)
    world_state.save()


def test_authored_reaction_travels_with_the_decision(game):
    world_service.open_interaction(game.attempt.id, game.token, "carpeta", game.actor)

    response = _choose(game, game.gated)

    assert response["reaction"] == {
        "line": "Gracias por quedarse.", "emotion": "triste", "gesture": "se-acerca", "objectKey": PERSON_KEY,
    }


def test_reaction_defaults_follow_the_class(game):
    DecisionOption.objects.filter(pk=game.plain.id).update(response_class="CONTRAINDICATED")
    _no_second_chance(game)

    response = _choose(game, game.plain)

    assert response["reaction"] == {"line": "", "emotion": None, "gesture": "se-aparta", "objectKey": PERSON_KEY}


def _no_second_chance(game):
    CaseVersion.objects.filter(pk=game.version.id).update(
        rules=json.dumps({**read_map(CaseVersion.objects.get(pk=game.version.id).rules), "secondChance": False})
    )


def test_contraindicated_in_crisis_shakes(game):
    # Sin efectos propios: manda el paso por defecto de la clase (-1, +1), que deja la activación en CRISIS.
    DecisionOption.objects.filter(pk=game.plain.id).update(response_class="CONTRAINDICATED", effects="{}")
    _no_second_chance(game)
    _set_persona(game, "WITHDRAWN", "TENSE")

    response = _choose(game, game.plain)

    assert response["reaction"]["gesture"] == "se-agita"


def test_second_chance_retry_also_reacts(game):
    response = _choose(game, game.plain)  # RISKY y secondChance: pide reintento

    assert response["retry"]["allowed"] is True
    assert response["reaction"]["gesture"] == "baja-la-mirada"
    assert response["reaction"]["emotion"] is None
    assert response["consequence"] is None


def test_corrupt_reaction_json_falls_back_to_defaults(game):  # Foco 5
    DecisionOption.objects.filter(pk=game.plain.id).update(reaction_json="{no es json")

    response = _choose(game, game.plain)

    assert response["reaction"]["gesture"] in vocabulary.GESTURES
    assert response["reaction"]["line"] == ""


def test_reaction_never_carries_the_class(game):
    world_service.open_interaction(game.attempt.id, game.token, "carpeta", game.actor)

    response = _choose(game, game.gated)

    assert set(response["reaction"]) == {"line", "emotion", "gesture", "objectKey"}


def test_out_of_vocabulary_values_fall_back(game):
    DecisionOption.objects.filter(pk=game.plain.id).update(
        reaction_json=json.dumps({"linea": "Hola", "emocion": "furiosa", "gesto": "baila"})
    )

    response = _choose(game, game.plain)  # RISKY: reintento

    assert response["reaction"]["line"] == "Hola"
    assert response["reaction"]["emotion"] is None
    assert response["reaction"]["gesture"] == "baja-la-mirada"


def test_reaction_character_picks_the_person_by_character(game):
    DecisionOption.objects.filter(pk=game.plain.id).update(reaction_json=json.dumps({"personaje": "laura"}))

    response = _choose(game, game.plain)

    assert response["reaction"]["objectKey"] == PERSON_KEY


def test_no_person_and_no_line_means_no_reaction(db):
    decision = SimpleNamespace(
        response_class="ACCEPTABLE", reaction_json="{}", source_node_id=-1, case_version_id=-1, id=-1,
    )
    assert reaction.resolve(decision, vocabulary.INITIAL_PERSONA) is None


# ─── Ruling 10: reacciona la persona de la sala donde se decide, en el caso real ───
def _real_case_attempt(actor):
    """Siembra SIM-VBG-001 (2.1.0) y abre un intento; devuelve ``(attempt, token, version_id)``."""
    from django.core.management import call_command

    call_command("seed_caso_pdf")
    version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    _assign_case_to_student(actor, version.id)
    started = game_service.start_attempt(version.id, actor)
    return SimulationAttempt.objects.get(pk=started["attemptId"]), started["attemptToken"], version.id


def _grant_what_the_case_asks(attempt):
    world_state = require_world_state(attempt)
    flags = read_map(world_state.flags_json)
    flags["viewedNpcKeys"] = ["enfermera-urgencias"]
    world_state.flags_json = write_map(flags)
    world_state.inventory_json = json.dumps(["PAP", "SPIKES", "RISK_METER"])
    world_state.used_tool_keys_json = json.dumps(["PAP@familia-crisis", "RISK_METER@sobreviviente-consulta"])
    world_state.save()


def _go_to(attempt, map_key):
    """Pone al estudiante en otro mapa del mundo sin mover el nodo (como al cruzar una puerta)."""
    from apps.simulation.models import SceneMap

    world_state = require_world_state(attempt)
    world_state.scene_map = SceneMap.objects.get(case_version_id=attempt.case_version_id, map_key=map_key)
    world_state.save()


def test_h1_reacts_with_the_person_of_the_room_where_the_student_decides(actor, author):
    attempt, token, version_id = _real_case_attempt(actor)
    _grant_what_the_case_asks(attempt)
    _go_to(attempt, "hospital-sala-escucha")
    option = DecisionOption.objects.get(case_version_id=version_id, option_key="h1-pap-contencion")

    response = game_service.choose_decision(attempt.id, token, option.id, actor)

    assert response["reaction"]["objectKey"] == "familia-duelo"
    assert response["reaction"]["line"].startswith("(La abuela respira un poco más despacio")
    assert (response["reaction"]["emotion"], response["reaction"]["gesture"]) == ("triste", "se-acerca")


def test_a_decision_without_written_reaction_still_gets_the_person_who_offers_it(actor, author):
    attempt, token, version_id = _real_case_attempt(actor)
    _grant_what_the_case_asks(attempt)
    _go_to(attempt, "hospital-sala-escucha")
    option = DecisionOption.objects.get(case_version_id=version_id, option_key="h1-noticia-sin-protocolo")
    assert option.reaction_json in (None, "", "{}")

    response = game_service.choose_decision(attempt.id, token, option.id, actor)  # contraindicada: reintento

    assert response["reaction"]["objectKey"] == "familia-duelo"
    assert response["reaction"]["gesture"] in ("se-aparta", "se-agita")
