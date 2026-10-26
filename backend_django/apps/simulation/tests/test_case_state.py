"""Estado del intento: hitos y persona leídos del mundo persistido, y el conteo por clase (RN-08)."""
import json
import uuid

import pytest
from django.contrib.auth import get_user_model

from apps.simulation.casedef.vocabulary import INITIAL_PERSONA, Activation, Bond
from apps.simulation.models import (
    AttemptWorldState,
    CaseVersion,
    DecisionOption,
    SimulationAttempt,
    SimulationNode,
)
from apps.simulation.services import case_state, response_effects
from apps.simulation.services.world_state import ensure_world_state

pytestmark = [pytest.mark.req("RN-08")]

User = get_user_model()


@pytest.fixture
def attempt(db):
    version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    student = User.objects.create_user(
        email="est_state@x.com", password="x", nombre="Est", apellido="State", role="ESTUDIANTE"
    )
    return SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex,
        case_version=version,
        student=student,
        current_node=SimulationNode.objects.filter(case_version=version, start_node=True).first(),
    )


def _set_world_flags(attempt, flags):
    """Guarda ``flags_json`` tal cual (crea el mundo si no existe) para probar lecturas rotas."""
    state = ensure_world_state(attempt)
    state.flags_json = flags if isinstance(flags, str) else json.dumps(flags)
    state.save(update_fields=["flags_json"])


def _option(response_class=None, classification="ADEQUATE", prohibited=False, effects=None):
    return DecisionOption(
        option_key=f"opt-{uuid.uuid4().hex[:6]}",
        text="x",
        classification=classification,
        prohibited_conduct=prohibited,
        response_class=response_class,
        effects=json.dumps(effects) if effects is not None else "{}",
    )


# ── read ────────────────────────────────────────────────────────────────────
def test_un_intento_sin_estado_parte_de_la_persona_inicial_y_sin_hitos(attempt):
    state = case_state.read(attempt)

    assert state.milestones == frozenset()
    assert state.persona == INITIAL_PERSONA == (Bond.GUARDED, Activation.TENSE)
    assert case_state.milestones_in_order(attempt) == ()
    assert not AttemptWorldState.objects.filter(attempt_id=attempt.id).exists()  # leer no crea el mundo


def test_read_refleja_lo_que_apply_escribio(attempt):
    effects = response_effects.resolve(_option("RISKY", effects={"milestones": ["a_hito", "b_hito"]}))

    response_effects.apply(attempt, effects)

    state = case_state.read(attempt)
    assert state.milestones == frozenset({"a_hito", "b_hito"})
    assert state.persona == (Bond.WITHDRAWN, Activation.TENSE)
    assert case_state.milestones_in_order(attempt) == ("a_hito", "b_hito")


def test_read_lee_el_formato_que_dejo_la_migracion_0030(attempt):
    _set_world_flags(
        attempt,
        {"milestones": ["x_hito"], "persona": {"bond": "OPEN", "activation": "CRISIS"}, "syncedNodeId": 1},
    )

    state = case_state.read(attempt)

    assert state.milestones == frozenset({"x_hito"})
    assert state.persona == (Bond.OPEN, Activation.CRISIS)


@pytest.mark.parametrize(
    "flags",
    [
        {},
        "esto no es json",
        {"milestones": "no-es-lista", "persona": "no-es-mapa"},
        {"milestones": [1, None, {"a": 1}], "persona": {"bond": "INVENTADO", "activation": 3}},
    ],
)
def test_un_estado_ausente_o_roto_cae_a_los_valores_iniciales(attempt, flags):
    _set_world_flags(attempt, flags)

    state = case_state.read(attempt)

    assert state.milestones == frozenset()
    assert state.persona == INITIAL_PERSONA
    assert case_state.milestones_in_order(attempt) == ()


def test_una_sola_dimension_rota_solo_afecta_a_esa(attempt):
    _set_world_flags(attempt, {"persona": {"bond": "OPEN", "activation": "basura"}})

    assert case_state.read(attempt).persona == (Bond.OPEN, Activation.TENSE)


# ── counts ──────────────────────────────────────────────────────────────────
def test_counts_trae_las_cuatro_claves_siempre():
    assert case_state.counts([]) == {"recommended": 0, "acceptable": 0, "risky": 0, "contraindicated": 0}


def test_counts_cuenta_por_clase_y_aplica_el_respaldo_r8():
    decisions = [
        _option("RECOMMENDED"),
        _option("RECOMMENDED"),
        _option("ACCEPTABLE"),
        _option("RISKY"),
        _option("CONTRAINDICATED"),
        _option(None, classification="INADEQUATE"),  # R-8: sin clase, contraindicada por clasificación
        _option(None, classification="ADEQUATE"),  # R-8: recomendada
    ]

    assert case_state.counts(decisions) == {
        "recommended": 3,
        "acceptable": 1,
        "risky": 1,
        "contraindicated": 2,
    }


# ── persona_label ───────────────────────────────────────────────────────────
def test_persona_label_dice_como_se_muestra_la_persona():
    assert case_state.persona_label((Bond.GUARDED, Activation.TENSE)) == "se muestra cautelosa y tensa"
    assert case_state.persona_label((Bond.OPEN, Activation.CALM)) == "se muestra abierta y serena"
    assert case_state.persona_label((Bond.WITHDRAWN, Activation.CRISIS)) == "se muestra retraída y en crisis"


# ── persona_trail (la traza docente) ────────────────────────────────────────
def _persona_option(response_class, persona=None):
    effects = {"persona": persona} if persona else {}
    return DecisionOption(response_class=response_class, effects=json.dumps(effects))


def test_persona_trail_repite_la_regla_del_juego_paso_a_paso_desde_el_estado_inicial():
    trail = case_state.persona_trail([
        _persona_option("RECOMMENDED"),     # (+1, −1): de cautelosa y tensa a abierta y serena
        _persona_option("RECOMMENDED"),     # los extremos se acotan: sigue abierta y serena
        _persona_option("CONTRAINDICATED"),  # (−1, +1): cautelosa y tensa
        _persona_option("ACCEPTABLE"),      # (0, 0)
        _persona_option("RISKY", {"bond": -1, "activation": 1}),  # el paso declarado manda sobre el de la clase: retraída y en crisis
    ])

    assert trail == [
        (Bond.OPEN, Activation.CALM), (Bond.OPEN, Activation.CALM),
        (Bond.GUARDED, Activation.TENSE), (Bond.GUARDED, Activation.TENSE),
        (Bond.WITHDRAWN, Activation.CRISIS),
    ]


def test_persona_trail_sin_decisiones_esta_vacia():
    assert case_state.persona_trail([]) == []
