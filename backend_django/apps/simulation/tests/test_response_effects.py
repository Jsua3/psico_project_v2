"""Motor de respuestas: la clase de una opción, el paso de la persona y los hitos (RN-08).

``resolve`` es puro (no toca la base); ``apply`` escribe en el estado del mundo del intento
a través de ``case_state``. La clase sale de la columna ``response_class``.
"""
import json
import uuid

import pytest
from django.contrib.auth import get_user_model

from apps.simulation.casedef.vocabulary import INITIAL_PERSONA, Activation, Bond, ResponseClass
from apps.simulation.models import (
    AttemptWorldState,
    CaseVersion,
    DecisionOption,
    SimulationAttempt,
    SimulationNode,
)
from apps.simulation.services import case_state, response_effects

pytestmark = [pytest.mark.req("RN-08")]

User = get_user_model()


def _option(response_class="ACCEPTABLE", effects=None):
    """Una opción sin guardar: ``resolve`` solo lee sus campos."""
    return DecisionOption(
        option_key=f"opt-{uuid.uuid4().hex[:6]}",
        text="Hacer algo",
        response_class=response_class,
        effects=json.dumps(effects) if effects is not None else "{}",
    )


@pytest.fixture
def version(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_resp@x.com", password="x", nombre="Est", apellido="Resp", role="ESTUDIANTE"
    )


def _attempt(version, student, node):
    return SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex, case_version=version, student=student, current_node=node
    )


@pytest.fixture
def attempt(version, estudiante):
    node = SimulationNode.objects.filter(case_version=version, start_node=True).first()
    return _attempt(version, estudiante, node)


@pytest.fixture
def attempt_sin_mundo(version, estudiante):
    """Un intento cuyo nodo no tiene escena: ``ensure_world_state`` devuelve ``None``."""
    node = SimulationNode.objects.create(
        case_version=version, node_key="sin-escena", title="Sin escena", narrative="x"
    )
    return _attempt(version, estudiante, node)


# ── resolve ─────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "response_class, step",
    [
        ("RECOMMENDED", (1, -1)),
        ("ACCEPTABLE", (0, 0)),
        ("RISKY", (-1, 0)),
        ("CONTRAINDICATED", (-1, 1)),
    ],
)
def test_el_paso_por_defecto_sale_de_la_clase(response_class, step):
    effects = response_effects.resolve(_option(response_class=response_class))

    assert effects.response_class is ResponseClass(response_class)
    assert effects.persona_step == step
    assert effects.milestones == ()


def test_el_persona_de_la_opcion_gana_a_la_tabla_por_defecto():
    effects = response_effects.resolve(
        _option("RECOMMENDED", effects={"persona": {"bond": -1, "activation": 1}})
    )

    assert effects.persona_step == (-1, 1)


def test_un_persona_con_una_sola_clave_deja_la_otra_en_cero():
    only_bond = response_effects.resolve(_option("RECOMMENDED", effects={"persona": {"bond": 1}}))
    only_activation = response_effects.resolve(_option("RISKY", effects={"persona": {"activation": -1}}))

    assert only_bond.persona_step == (1, 0)  # no hereda el -1 de activación de la clase
    assert only_activation.persona_step == (0, -1)  # no hereda el -1 de vínculo de la clase


def test_los_hitos_de_la_opcion_salen_sin_repetidos_y_en_orden():
    effects = response_effects.resolve(
        _option("ACCEPTABLE", effects={"milestones": ["b_hito", "a_hito", "b_hito"]})
    )

    assert effects.milestones == ("b_hito", "a_hito")


# ── apply ───────────────────────────────────────────────────────────────────
@pytest.mark.django_db
def test_apply_escribe_los_hitos_y_mueve_a_la_persona(attempt):
    effects = response_effects.resolve(
        _option("RECOMMENDED", effects={"milestones": ["valorar_riesgo"]})
    )

    response_effects.apply(attempt, effects)

    state = case_state.read(attempt)
    assert state.milestones == frozenset({"valorar_riesgo"})
    assert state.persona == (Bond.OPEN, Activation.CALM)  # GUARDED+TENSE, +1 vínculo y -1 activación


@pytest.mark.django_db
def test_un_hito_repetido_no_se_duplica_y_conserva_el_orden(attempt):
    first = response_effects.resolve(_option("ACCEPTABLE", effects={"milestones": ["a_hito", "b_hito"]}))
    second = response_effects.resolve(_option("ACCEPTABLE", effects={"milestones": ["b_hito", "c_hito"]}))

    response_effects.apply(attempt, first)
    response_effects.apply(attempt, second)

    assert case_state.milestones_in_order(attempt) == ("a_hito", "b_hito", "c_hito")


@pytest.mark.django_db
def test_los_extremos_acotan_a_la_persona(attempt):
    recommended = response_effects.resolve(_option("RECOMMENDED"))
    for _ in range(3):
        response_effects.apply(attempt, recommended)
    assert case_state.read(attempt).persona == (Bond.OPEN, Activation.CALM)  # ya no sube más

    contraindicated = response_effects.resolve(_option("CONTRAINDICATED"))
    for _ in range(4):
        response_effects.apply(attempt, contraindicated)
    assert case_state.read(attempt).persona == (Bond.WITHDRAWN, Activation.CRISIS)  # ya no baja más


@pytest.mark.django_db
def test_apply_conserva_las_demas_claves_del_mundo(attempt):
    response_effects.apply(attempt, response_effects.resolve(_option("ACCEPTABLE")))
    before = json.loads(AttemptWorldState.objects.get(attempt_id=attempt.id).flags_json)
    assert "syncedNodeId" in before

    response_effects.apply(
        attempt, response_effects.resolve(_option("RISKY", effects={"milestones": ["a_hito"]}))
    )

    after = json.loads(AttemptWorldState.objects.get(attempt_id=attempt.id).flags_json)
    assert after["syncedNodeId"] == before["syncedNodeId"]
    assert after["milestones"] == ["a_hito"]
    assert after["persona"] == {"bond": "WITHDRAWN", "activation": "TENSE"}


@pytest.mark.django_db
def test_apply_sin_mundo_no_falla_ni_escribe(attempt_sin_mundo):
    effects = response_effects.resolve(_option("RECOMMENDED", effects={"milestones": ["a_hito"]}))

    response_effects.apply(attempt_sin_mundo, effects)

    assert not AttemptWorldState.objects.filter(attempt_id=attempt_sin_mundo.id).exists()
    assert case_state.read(attempt_sin_mundo).persona == INITIAL_PERSONA
