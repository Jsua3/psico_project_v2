"""Cercanía de una persona que camina (P6, tarea 4).

El cliente ofrece «Hablar con…» a 74 px de la posición VIVA de la persona, pero el servidor solo conoce la guardada.
Para que acepte lo que el cliente ofrece, el área de cercanía de una PERSON se amplía según ``metadata.movimiento``:
``deambula`` agranda el rectángulo guardado por el radio máximo de deambular; ``va-y-viene`` lo extiende hasta el
rectángulo de ``hasta``; ``quieto``, ausente o mal formado exigen los 120 px de siempre.
"""
import json
import re
import uuid
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from rest_framework.exceptions import ValidationError

from apps.simulation.models import CaseVersion, MapObject, SimulationAttempt, SimulationNode
from apps.simulation.services import world_service

User = get_user_model()

REPO_ROOT = Path(__file__).resolve().parents[4]
PERSON_WALK_UTIL = REPO_ROOT / "frontend" / "src" / "app" / "features" / "simulator" / "person-walk.util.ts"
KEY = "persona-que-camina"
ORIGIN = (400, 300)
SIZE = (48, 48)


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_walk@x.com", password="x", nombre="Est", apellido="Walk", role="ESTUDIANTE"
    )


@pytest.fixture
def escena(estudiante):
    version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    attempt = SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex,
        case_version=version,
        student=estudiante,
        current_node=SimulationNode.objects.filter(case_version=version, start_node=True).first(),
    )
    state = world_service.require_world_state(attempt)
    persona = MapObject.objects.create(
        scene_map_id=state.scene_map_id, object_key=KEY, label="Persona", object_type="PERSON",
        position_x=ORIGIN[0], position_y=ORIGIN[1], width=SIZE[0], height=SIZE[1], visible=True,
        metadata_json="{}",
    )
    return {"state": state, "persona": persona}


def _movimiento(escena, movimiento):
    persona = escena["persona"]
    persona.metadata_json = json.dumps({} if movimiento is None else {"movimiento": movimiento})
    persona.save()


def _jugador_a(escena, dx_desde_borde_derecho):
    """Jugador en la misma fila de la persona, a ``dx`` px a la derecha de su rectángulo guardado."""
    state = escena["state"]
    state.player_x = ORIGIN[0] + SIZE[0] + dx_desde_borde_derecho
    state.player_y = ORIGIN[1]


def _cerca(escena):
    world_service._require_nearby(escena["state"], escena["persona"])


def test_el_radio_de_deambular_coincide_con_el_del_cliente():
    fuente = PERSON_WALK_UTIL.read_text(encoding="utf-8")
    encontrado = re.search(r"export const PERSON_WANDER_RADIUS_PX = (\d+);", fuente)
    assert encontrado, "person-walk.util.ts ya no declara PERSON_WANDER_RADIUS_PX"
    assert world_service.PERSON_WANDER_RADIUS_PX == int(encontrado.group(1))


def test_quieto_exige_los_120_px_de_siempre(escena):
    for valor in (None, "quieto"):
        _movimiento(escena, valor)
        _jugador_a(escena, world_service.INTERACTION_RANGE_PX)
        _cerca(escena)
        _jugador_a(escena, world_service.INTERACTION_RANGE_PX + 1)
        with pytest.raises(ValidationError):
            _cerca(escena)


def test_deambula_acepta_junto_a_su_posicion_extrema(escena):
    _movimiento(escena, "deambula")
    radio = world_service.PERSON_WANDER_RADIUS_PX
    # Persona en su extremo (a `radio` px de su origen) y el jugador 74 px más allá (lo que el cliente ofrece).
    _jugador_a(escena, radio + 74)
    _cerca(escena)
    # Y el área sigue acotada: más allá del radio de deambular + el alcance normal, no.
    _jugador_a(escena, radio + world_service.INTERACTION_RANGE_PX + 1)
    with pytest.raises(ValidationError):
        _cerca(escena)


def test_deambula_en_forma_de_objeto_tambien_amplia(escena):
    _movimiento(escena, {"tipo": "deambula"})
    _jugador_a(escena, world_service.PERSON_WANDER_RADIUS_PX + 74)
    _cerca(escena)


def test_va_y_viene_acepta_junto_a_hasta(escena):
    hasta = {"x": ORIGIN[0] + 300, "y": ORIGIN[1]}
    _movimiento(escena, {"tipo": "va-y-viene", "hasta": hasta})
    state = escena["state"]
    # Junto a `hasta` (a 74 px de su rectángulo), mucho más lejos que 120 px del origen.
    state.player_x = hasta["x"] + SIZE[0] + 74
    state.player_y = hasta["y"]
    _cerca(escena)
    # Fuera del rectángulo que cubre ida y vuelta + 120 px, no.
    state.player_x = hasta["x"] + SIZE[0] + world_service.INTERACTION_RANGE_PX + 1
    with pytest.raises(ValidationError):
        _cerca(escena)


def test_va_y_viene_hacia_atras_tambien_cubre_el_lado_opuesto(escena):
    hasta = {"x": ORIGIN[0] - 300, "y": ORIGIN[1]}
    _movimiento(escena, {"tipo": "va-y-viene", "hasta": hasta})
    state = escena["state"]
    state.player_x = hasta["x"] - 74
    state.player_y = hasta["y"]
    _cerca(escena)


@pytest.mark.parametrize("malformado", [
    "corre", 7, True, [], {}, {"tipo": "vuela"},
    {"tipo": "va-y-viene"}, {"tipo": "va-y-viene", "hasta": None}, {"tipo": "va-y-viene", "hasta": {"x": 1}},
    {"tipo": "va-y-viene", "hasta": {"x": "a", "y": 2}}, {"tipo": "va-y-viene", "hasta": {"x": True, "y": 2}},
])
def test_un_movimiento_mal_formado_se_trata_como_quieto(escena, malformado):
    _movimiento(escena, malformado)
    _jugador_a(escena, world_service.INTERACTION_RANGE_PX + 1)
    with pytest.raises(ValidationError):
        _cerca(escena)
    _jugador_a(escena, world_service.INTERACTION_RANGE_PX)
    _cerca(escena)


def test_solo_las_personas_amplian_su_area(escena):
    persona = escena["persona"]
    persona.object_type = "OBJECT"
    persona.metadata_json = json.dumps({"movimiento": "deambula"})
    persona.save()
    _jugador_a(escena, world_service.INTERACTION_RANGE_PX + 1)
    with pytest.raises(ValidationError):
        _cerca(escena)


def test_metadata_invalida_no_rompe(escena):
    persona = escena["persona"]
    persona.metadata_json = "{no es json"
    persona.save()
    _jugador_a(escena, world_service.INTERACTION_RANGE_PX + 1)
    with pytest.raises(ValidationError):
        _cerca(escena)


# ── Revisión final · C6: un dato enorme no rompe ni agranda el área sin límite ────────────────────────────────────────


def test_un_entero_enorme_en_hasta_se_trata_como_quieto_y_no_lanza(escena):
    """Un entero de 400 dígitos desbordaba `math.isfinite` (OverflowError → 500): es un dato mal formado, es quieto."""
    _movimiento(escena, {"tipo": "va-y-viene", "hasta": {"x": 10 ** 400, "y": 300}})
    assert world_service._person_movement(escena["persona"]) is None
    _jugador_a(escena, world_service.INTERACTION_RANGE_PX + 1)
    with pytest.raises(ValidationError):
        _cerca(escena)
    _jugador_a(escena, world_service.INTERACTION_RANGE_PX)
    _cerca(escena)


def test_un_hasta_fuera_de_rango_razonable_no_es_un_numero_valido(escena):
    for fuera in (1_000_001, -1_000_001, 2.5e9, float("inf")):
        _movimiento(escena, {"tipo": "va-y-viene", "hasta": {"x": fuera, "y": 300}})
        assert world_service._person_movement(escena["persona"]) is None, fuera
    _movimiento(escena, {"tipo": "va-y-viene", "hasta": {"x": 1_000_000, "y": 300}})
    assert world_service._person_movement(escena["persona"]) is not None


def test_un_hasta_enorme_se_recorta_al_tamano_del_mapa(escena):
    """Un `hasta` a 900 000 px no vuelve «cercano» lo que está fuera de la sala: el área llega, como mucho, al borde del mapa."""
    _movimiento(escena, {"tipo": "va-y-viene", "hasta": {"x": 900_000, "y": 300}})
    mapa = escena["state"].scene_map
    ancho = mapa.width or world_service.DEFAULT_MAP_WIDTH
    x, y, w, _ = world_service._interaction_rect(escena["persona"])
    assert x + w <= ancho + SIZE[0], "el rectángulo se pasó del borde derecho del mapa"
    state = escena["state"]
    state.player_x = ancho + 2_000
    state.player_y = ORIGIN[1]
    with pytest.raises(ValidationError):
        _cerca(escena)
    # Y dentro de la sala el recorrido legítimo (hasta el borde) sigue cubierto.
    state.player_x = ancho - 10
    _cerca(escena)
