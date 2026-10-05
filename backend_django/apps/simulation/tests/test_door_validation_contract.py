"""Pruebas de caracterización de ``world_service._validate_door``.

Fijan cada condición de una puerta (``requiresInspected``, ``requiresTools``,
``requiresNodes``, ``requiresNpcs``), el mensaje de bloqueo y, sobre todo, el
ORDEN en que se revisan las reglas: primero que la puerta exista, luego que
conduzca al destino, luego la cercanía y al final las condiciones. Ese orden es
lo que debe conservar el patrón Chain of Responsibility al separar cada regla en
su propio eslabón.
"""
import json
import uuid

import pytest
from django.contrib.auth import get_user_model
from rest_framework.exceptions import NotFound, ValidationError

from apps.simulation.models import CaseVersion, MapObject, SimulationAttempt, SimulationNode
from apps.simulation.services import world_service

User = get_user_model()

DOOR_KEY = "puerta-sala-escucha"
TARGET = "hospital-sala-escucha"
DEFAULT_LOCK = "La puerta está bloqueada."
FAR = "Estás demasiado lejos de la puerta para interactuar"


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_door@x.com", password="x", nombre="Est", apellido="Door", role="ESTUDIANTE"
    )


@pytest.fixture
def escena(estudiante):
    """Intento en curso con su estado de mundo, el jugador pegado a la puerta y la puerta sin condiciones."""
    version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    attempt = SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex,
        case_version=version,
        student=estudiante,
        current_node=SimulationNode.objects.filter(case_version=version, start_node=True).first(),
    )
    state = world_service.require_world_state(attempt)
    door = MapObject.objects.get(scene_map_id=state.scene_map_id, object_key=DOOR_KEY, object_type="EXIT")
    base = json.loads(door.metadata_json)
    door.metadata_json = json.dumps({
        "targetNodeKey": base["targetNodeKey"], "entryX": base["entryX"], "entryY": base["entryY"],
    })
    door.save()
    state.player_x, state.player_y = door.position_x, door.position_y
    return {"attempt": attempt, "state": state, "door": door}


def _set_meta(escena, **extra):
    door = escena["door"]
    meta = json.loads(door.metadata_json)
    meta.update(extra)
    door.metadata_json = json.dumps(meta)
    door.save()


def _validate(escena, door_key=DOOR_KEY, target=TARGET):
    return world_service._validate_door(escena["attempt"], escena["state"], door_key, target)


# ─── camino feliz ────────────────────────────────────────────────────────────
def test_puerta_sin_condiciones_devuelve_su_metadata(escena):
    meta = _validate(escena)

    assert meta["targetNodeKey"] == TARGET
    assert "entryX" in meta and "entryY" in meta


def test_listas_vacias_o_nulas_equivalen_a_sin_condicion(escena):
    _set_meta(escena, requiresInspected=[], requiresTools=None, requiresNodes=[], requiresNpcs=None)

    assert _validate(escena)["targetNodeKey"] == TARGET


def test_con_todas_las_condiciones_cumplidas_deja_pasar(escena):
    escena["state"].inspected_object_keys_json = json.dumps(["familia-crisis"])
    escena["state"].inventory_json = json.dumps(["PAP"])
    escena["state"].flags_json = json.dumps({"viewedNpcKeys": ["recepcionista"]})
    _set_meta(
        escena,
        requiresInspected=["familia-crisis"], requiresTools=["PAP"],
        requiresNodes=[escena["attempt"].current_node.node_key], requiresNpcs=["recepcionista"],
    )

    assert _validate(escena)["targetNodeKey"] == TARGET


# ─── cada condición, por separado ────────────────────────────────────────────
@pytest.mark.parametrize("extra", [
    {"requiresInspected": ["familia-crisis"]},
    {"requiresTools": ["PAP"]},
    {"requiresNodes": ["nodo-que-no-es-el-actual"]},
    {"requiresNpcs": ["recepcionista"]},
])
def test_condicion_incumplida_bloquea_con_el_mensaje_por_defecto(escena, extra):
    _set_meta(escena, **extra)

    with pytest.raises(ValidationError) as exc:
        _validate(escena)

    assert exc.value.detail[0] == DEFAULT_LOCK


@pytest.mark.parametrize("extra", [
    {"requiresInspected": ["familia-crisis"]},
    {"requiresTools": ["PAP"]},
    {"requiresNodes": ["nodo-que-no-es-el-actual"]},
    {"requiresNpcs": ["recepcionista"]},
])
def test_el_mensaje_de_bloqueo_autorado_reemplaza_al_de_por_defecto(escena, extra):
    _set_meta(escena, lockedMessage="Habla primero con la familia.", **extra)

    with pytest.raises(ValidationError) as exc:
        _validate(escena)

    assert exc.value.detail[0] == "Habla primero con la familia."


def test_basta_con_que_falte_una_de_varias_piezas_requeridas(escena):
    escena["state"].inspected_object_keys_json = json.dumps(["a"])
    _set_meta(escena, requiresInspected=["a", "b"])

    with pytest.raises(ValidationError):
        _validate(escena)

    escena["state"].inspected_object_keys_json = json.dumps(["a", "b"])
    assert _validate(escena)


def test_requiresNodes_acepta_cualquiera_de_los_nodos_listados(escena):
    actual = escena["attempt"].current_node.node_key
    _set_meta(escena, requiresNodes=["otro-nodo", actual])

    assert _validate(escena)


@pytest.mark.parametrize("viewed", [None, "texto", {"a": 1}, 7])
def test_npcs_vistos_con_formato_invalido_cuentan_como_ninguno(escena, viewed):
    escena["state"].flags_json = json.dumps({"viewedNpcKeys": viewed})
    _set_meta(escena, requiresNpcs=["recepcionista"])

    with pytest.raises(ValidationError):
        _validate(escena)


# ─── orden de las reglas ─────────────────────────────────────────────────────
def test_puerta_inexistente_es_404(escena):
    with pytest.raises(NotFound) as exc:
        _validate(escena, door_key="puerta-fantasma")

    assert "puerta-fantasma" in str(exc.value.detail)


def test_un_objeto_que_no_es_salida_no_cuenta_como_puerta(escena):
    MapObject.objects.filter(pk=escena["door"].pk).update(object_type="PROP")

    with pytest.raises(NotFound):
        _validate(escena)


def test_destino_distinto_se_rechaza(escena):
    with pytest.raises(ValidationError) as exc:
        _validate(escena, target="comisaria-recepcion")

    assert exc.value.detail[0] == "La puerta no conduce a la sala solicitada"


def test_el_destino_se_revisa_antes_que_la_cercania_y_las_condiciones(escena):
    escena["state"].player_x, escena["state"].player_y = 0, 0
    _set_meta(escena, requiresTools=["PAP"])

    with pytest.raises(ValidationError) as exc:
        _validate(escena, target="comisaria-recepcion")

    assert exc.value.detail[0] == "La puerta no conduce a la sala solicitada"


def test_lejos_de_la_puerta_se_rechaza(escena):
    escena["state"].player_x, escena["state"].player_y = 0, 0

    with pytest.raises(ValidationError) as exc:
        _validate(escena)

    assert exc.value.detail[0] == FAR


def test_la_cercania_se_revisa_antes_que_las_condiciones(escena):
    escena["state"].player_x, escena["state"].player_y = 0, 0
    _set_meta(escena, requiresInspected=["familia-crisis"], lockedMessage="Bloqueada")

    with pytest.raises(ValidationError) as exc:
        _validate(escena)

    assert exc.value.detail[0] == FAR


def test_con_varias_condiciones_incumplidas_se_lanza_una_sola_vez_con_el_mismo_mensaje(escena):
    _set_meta(
        escena, lockedMessage="Bloqueada",
        requiresInspected=["x"], requiresTools=["y"], requiresNodes=["z"], requiresNpcs=["w"],
    )

    with pytest.raises(ValidationError) as exc:
        _validate(escena)

    assert exc.value.detail == ["Bloqueada"]
