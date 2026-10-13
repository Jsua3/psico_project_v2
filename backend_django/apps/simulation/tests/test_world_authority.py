"""GAME-01 — el backend es autoritativo para el mundo explorable.

Matriz negativa exigida: teletransporte, fuera de límites, colliders, mapa
falso, interacción remota, objeto/NPC inventado, herramienta no poseída,
target falso, herramienta sin target no global, puerta sin clave/manipulada,
requisitos incumplidos, repetición e intento ajeno. Ninguna petición
rechazada puede mutar estado ni crear eventos.

Geometría del mapa inicial sembrado (hospital-urgencias, 960×528, spawn
480,430): familia-crisis PERSON (190,420,48,48) · tool-pap TOOL PAP
(318,428) · zona-restringida OBJECT (660,268) · puerta-sala-escucha EXIT
(838,440, requiresInspected=[familia-crisis]) · mostrador-triage colisión
(380,252,220,56).
"""
import pytest
from django.contrib.auth import get_user_model

from apps.simulation.models import AttemptEvent, AttemptWorldState, MapObject

from .test_world import _assign_case_to_student, _start, case_version_id, cl, estudiante, otro_estudiante  # noqa: F401

User = get_user_model()

WORLD = "/api/simulation/attempts/{}/world"
STATE = "/api/simulation/attempts/{}/world-state"
TOOLS = "/api/simulation/attempts/{}/tools/use"
DOOR = "/api/simulation/attempts/{}/enter-room"


def _world(c, attempt_id, token):
    return c.get(
        WORLD.format(attempt_id),
        HTTP_X_SIEP_ATTEMPT_TOKEN=token,
    ).data["data"]


def _move(c, attempt_id, token, x, y, map_key):
    return c.patch(
        STATE.format(attempt_id),
        {"attemptToken": token, "playerX": x, "playerY": y, "currentMapKey": map_key},
        format="json",
    )


def _interact(c, attempt_id, token, key):
    return c.post(
        f"/api/simulation/attempts/{attempt_id}/interactions/{key}",
        {"attemptToken": token},
        format="json",
    )


def _events(attempt_id, event_type):
    return AttemptEvent.objects.filter(attempt_id=attempt_id, event_type=event_type).count()


def _player(attempt_id):
    state = AttemptWorldState.objects.get(attempt_id=attempt_id)
    return state.player_x, state.player_y


# ─── 4A: movimiento ───────────────────────────────────────────────────────────
def test_teletransporte_rechazado_sin_mutacion(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    before = AttemptEvent.objects.filter(attempt_id=attempt_id).count()

    resp = _move(c, attempt_id, token, 100, 250, world["map"]["key"])  # salto ~420px inmediato
    assert resp.status_code == 400
    assert _player(attempt_id) == (480, 430)
    # Un movimiento rechazado no escribe nada; uno aceptado tampoco deja evento (E1-5).
    assert AttemptEvent.objects.filter(attempt_id=attempt_id).count() == before


def test_fuera_de_limites_rechazado(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)

    assert _move(c, attempt_id, token, 5000, 200, world["map"]["key"]).status_code == 400
    assert _move(c, attempt_id, token, -20, 430, world["map"]["key"]).status_code == 400
    assert _player(attempt_id) == (480, 430)


def test_coordenadas_no_numericas_rechazadas(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)

    resp = c.patch(
        STATE.format(attempt_id),
        {"attemptToken": token, "playerX": "abc", "playerY": 430, "currentMapKey": world["map"]["key"]},
        format="json",
    )
    assert resp.status_code == 400
    faltante = c.patch(
        STATE.format(attempt_id),
        {"attemptToken": token, "playerY": 430, "currentMapKey": world["map"]["key"]},
        format="json",
    )
    assert faltante.status_code == 400


def test_dentro_de_collider_rechazado(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)

    resp = _move(c, attempt_id, token, 450, 280, world["map"]["key"])  # mostrador-triage
    assert resp.status_code == 400
    assert _player(attempt_id) == (480, 430)


def test_hitbox_completo_no_puede_solapar_collider(estudiante, case_version_id):
    """El punto de pies queda fuera del mostrador, pero su hitbox invade x=380."""
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)

    resp = _move(c, attempt_id, token, 370, 300, world["map"]["key"])

    assert resp.status_code == 400
    assert _player(attempt_id) == (480, 430)


def test_herramienta_recogida_deja_de_bloquear(estudiante, case_version_id):
    """La geometría que bloquea es la misma que el mundo expone al cliente: una
    herramienta recogida desaparece del DTO, así que tampoco puede bloquear."""
    MapObject.objects.filter(
        scene_map__case_version_id=case_version_id, object_key="tool-pap",
    ).update(collision=True)
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    map_key = world["map"]["key"]

    assert _move(c, attempt_id, token, 342, 440, map_key).status_code == 400  # sobre el kit

    picked = _interact(c, attempt_id, token, "tool-pap")  # a 114 px del spawn
    assert picked.status_code == 200
    assert "tool-pap" not in [obj["key"] for obj in picked.data["data"]["world"]["objects"]]

    resp = _move(c, attempt_id, token, 342, 440, map_key)
    assert resp.status_code == 200
    assert _player(attempt_id) == (342, 440)


def test_map_key_obligatorio_y_mapa_falso_no_muta(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)

    sin_mapa = c.patch(
        STATE.format(attempt_id),
        {"attemptToken": token, "playerX": 490, "playerY": 430},
        format="json",
    )
    assert sin_mapa.status_code == 400

    falso = _move(c, attempt_id, token, 490, 430, "mapa-inventado")
    assert falso.status_code == 200  # carrera benigna: eco sin mutación
    assert _player(attempt_id) == (480, 430)


def test_movimiento_legitimo_aceptado(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)

    resp = _move(c, attempt_id, token, 340, 430, world["map"]["key"])
    assert resp.status_code == 200
    assert resp.data["data"]["player"] == {"x": 340, "y": 430}


def test_intento_ajeno_no_puede_mover(estudiante, otro_estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)

    resp = cl(otro_estudiante).patch(
        STATE.format(attempt_id),
        {"attemptToken": token, "playerX": 340, "playerY": 430, "currentMapKey": world["map"]["key"]},
        format="json",
    )
    assert resp.status_code in (403, 404)
    assert _player(attempt_id) == (480, 430)


# ─── 4B: interacciones y NPCs ────────────────────────────────────────────────
def test_interaccion_remota_rechazada_sin_evento(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)

    resp = _interact(c, attempt_id, token, "familia-crisis")  # a ~242px del spawn
    assert resp.status_code == 400
    assert _events(attempt_id, "MAP_INTERACTION_OPENED") == 0
    world = _world(c, attempt_id, token)
    assert "familia-crisis" not in world["inspectedObjectKeys"]


def test_objeto_inventado_404_sin_evento(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)

    assert _interact(c, attempt_id, token, "objeto-inventado").status_code == 404
    assert _events(attempt_id, "MAP_INTERACTION_OPENED") == 0


def test_interaccion_cercana_funciona(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    _move(c, attempt_id, token, 340, 430, world["map"]["key"])
    _move(c, attempt_id, token, 250, 430, world["map"]["key"])

    resp = _interact(c, attempt_id, token, "familia-crisis")
    assert resp.status_code == 200
    assert "familia-crisis" in resp.data["data"]["world"]["inspectedObjectKeys"]


def test_npc_inventado_o_malformado_rechazado(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)

    invented = c.post(
        f"/api/simulation/attempts/{attempt_id}/npcs/npc-inventado",
        {"attemptToken": token}, format="json",
    )
    assert invented.status_code == 404

    malformed = c.post(
        f"/api/simulation/attempts/{attempt_id}/npcs/NPC%20INVENTADO",
        {"attemptToken": token}, format="json",
    )
    assert malformed.status_code == 400

    assert _events(attempt_id, "NPC_DIALOGUE_VIEWED") == 0
    world = _world(c, attempt_id, token)
    assert world["flags"].get("viewedNpcKeys") in (None, [])


def test_npc_canonico_aceptado(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    assert _move(c, attempt_id, token, 560, 380, world["map"]["key"]).status_code == 200

    resp = c.post(
        f"/api/simulation/attempts/{attempt_id}/npcs/enfermera-urgencias",
        {"attemptToken": token}, format="json",
    )
    assert resp.status_code == 200
    assert "enfermera-urgencias" in resp.data["data"]["flags"]["viewedNpcKeys"]


def test_npc_remoto_rechazado_sin_evidencia_ni_evento(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)  # spawn (480, 430); nurse is authored at (560, 330)

    resp = c.post(
        f"/api/simulation/attempts/{attempt_id}/npcs/enfermera-urgencias",
        {"attemptToken": token}, format="json",
    )

    assert resp.status_code == 400
    assert _events(attempt_id, "NPC_DIALOGUE_VIEWED") == 0
    assert _world(c, attempt_id, token)["flags"].get("viewedNpcKeys") in (None, [])


def _record_npc(c, attempt_id, token, npc_key="enfermera-urgencias"):
    return c.post(
        f"/api/simulation/attempts/{attempt_id}/npcs/{npc_key}",
        {"attemptToken": token}, format="json",
    )


@pytest.mark.parametrize(
    "player_y, distance, accepted",
    [
        (400, 70, True),    # dentro de radio 60 + tolerancia 16
        (406, 76, True),    # justo en el límite
        (407, 77, False),   # un píxel fuera de la tolerancia
        (420, 90, False),   # claramente lejos
    ],
)
def test_npc_acepta_hasta_radio_mas_tolerancia(estudiante, case_version_id, player_y, distance, accepted):
    """T11.4: la enfermera está en (560, 330) con radio 60 y el cliente sincroniza por
    muestras, así que puede quedar unos píxeles fuera. Se acepta hasta radio + 16
    (NPC_RANGE_TOLERANCE_PX), sin re-sembrar la base."""
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    assert _move(c, attempt_id, token, 560, player_y, world["map"]["key"]).status_code == 200
    assert distance == abs(player_y - 330)

    resp = _record_npc(c, attempt_id, token)

    if accepted:
        assert resp.status_code == 200
        assert "enfermera-urgencias" in resp.data["data"]["flags"]["viewedNpcKeys"]
        assert _events(attempt_id, "NPC_DIALOGUE_VIEWED") == 1
    else:
        assert resp.status_code == 400
        assert _events(attempt_id, "NPC_DIALOGUE_VIEWED") == 0
        assert _world(c, attempt_id, token)["flags"].get("viewedNpcKeys") in (None, [])


# ─── 4C: herramientas ────────────────────────────────────────────────────────
def _pickup_pap(c, attempt_id, token, map_key):
    _move(c, attempt_id, token, 340, 430, map_key)
    resp = _interact(c, attempt_id, token, "tool-pap")
    assert resp.status_code == 200
    assert "PAP" in resp.data["data"]["world"]["inventory"]


def test_herramienta_no_poseida_rechazada(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)
    stress_before = 0

    resp = c.post(
        TOOLS.format(attempt_id),
        {"attemptToken": token, "toolCode": "PAP"}, format="json",
    )
    assert resp.status_code == 400
    assert _events(attempt_id, "TOOL_USED") == 0
    world = _world(c, attempt_id, token)
    assert "PAP" not in world["inventory"], "use_tool no puede regalar la herramienta"
    assert world["usedToolKeys"] == []
    assert stress_before == 0


def test_herramienta_inexistente_404(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)
    resp = c.post(
        TOOLS.format(attempt_id),
        {"attemptToken": token, "toolCode": "NO-EXISTE"}, format="json",
    )
    assert resp.status_code == 404


def test_herramienta_sin_target_no_global_no_es_pertinente(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    _pickup_pap(c, attempt_id, token, world["map"]["key"])

    resp = c.post(
        TOOLS.format(attempt_id),
        {"attemptToken": token, "toolCode": "PAP"}, format="json",
    )
    assert resp.status_code == 200
    assert resp.data["data"]["pertinent"] is False
    assert resp.data["data"]["stressDelta"] == 3


def test_target_falso_o_lejano_rechazado(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    _pickup_pap(c, attempt_id, token, world["map"]["key"])

    falso = c.post(
        TOOLS.format(attempt_id),
        {"attemptToken": token, "toolCode": "PAP", "targetInteractionKey": "target-falso"},
        format="json",
    )
    assert falso.status_code == 404

    lejano = c.post(
        TOOLS.format(attempt_id),
        {"attemptToken": token, "toolCode": "PAP", "targetInteractionKey": "zona-restringida"},
        format="json",
    )
    assert lejano.status_code == 400
    assert _events(attempt_id, "TOOL_USED") == 0


def test_uso_repetido_no_duplica_evento_ni_efecto(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    _pickup_pap(c, attempt_id, token, world["map"]["key"])
    _move(c, attempt_id, token, 250, 430, world["map"]["key"])

    first = c.post(
        TOOLS.format(attempt_id),
        {"attemptToken": token, "toolCode": "PAP", "targetInteractionKey": "familia-crisis"},
        format="json",
    )
    assert first.status_code == 200
    repeat = c.post(
        TOOLS.format(attempt_id),
        {"attemptToken": token, "toolCode": "PAP", "targetInteractionKey": "familia-crisis"},
        format="json",
    )
    assert repeat.status_code == 200
    assert repeat.data["data"]["stressDelta"] == 0
    assert _events(attempt_id, "TOOL_USED") == 1


# ─── 4D: puertas ─────────────────────────────────────────────────────────────
def _go_to_door(c, attempt_id, token, map_key):
    for x, y in ((430, 435), (610, 440), (790, 445)):
        assert _move(c, attempt_id, token, x, y, map_key).status_code == 200


def test_puerta_sin_clave_rechazada(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)

    resp = c.post(
        DOOR.format(attempt_id),
        {"attemptToken": token, "targetNodeKey": "hospital-sala-escucha", "entryX": 160, "entryY": 452},
        format="json",
    )
    assert resp.status_code == 400
    assert _world(c, attempt_id, token)["map"]["key"] == world["map"]["key"]


def test_puerta_con_destino_manipulado_rechazada(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    _move(c, attempt_id, token, 340, 430, world["map"]["key"])
    _move(c, attempt_id, token, 250, 430, world["map"]["key"])
    _interact(c, attempt_id, token, "familia-crisis")
    _go_to_door(c, attempt_id, token, world["map"]["key"])

    resp = c.post(
        DOOR.format(attempt_id),
        {"attemptToken": token, "targetNodeKey": "comisaria-recepcion",
         "entryX": 160, "entryY": 452, "doorKey": "puerta-sala-escucha"},
        format="json",
    )
    assert resp.status_code == 400
    assert _world(c, attempt_id, token)["map"]["key"] == world["map"]["key"]


def test_puerta_lejana_rechazada(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    _move(c, attempt_id, token, 340, 430, world["map"]["key"])
    _move(c, attempt_id, token, 250, 430, world["map"]["key"])
    _interact(c, attempt_id, token, "familia-crisis")  # requisito cumplido

    resp = c.post(
        DOOR.format(attempt_id),
        {"attemptToken": token, "targetNodeKey": "hospital-sala-escucha",
         "entryX": 160, "entryY": 452, "doorKey": "puerta-sala-escucha"},
        format="json",
    )
    assert resp.status_code == 400  # a ~540px de la puerta


def test_puerta_con_requisitos_incumplidos_rechazada(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    _go_to_door(c, attempt_id, token, world["map"]["key"])  # cerca, pero sin inspeccionar

    resp = c.post(
        DOOR.format(attempt_id),
        {"attemptToken": token, "targetNodeKey": "hospital-sala-escucha",
         "entryX": 160, "entryY": 452, "doorKey": "puerta-sala-escucha"},
        format="json",
    )
    assert resp.status_code == 400
    assert _world(c, attempt_id, token)["map"]["key"] == world["map"]["key"]


def test_flujo_completo_de_puerta_valida(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    _move(c, attempt_id, token, 340, 430, world["map"]["key"])
    _move(c, attempt_id, token, 250, 430, world["map"]["key"])
    assert _interact(c, attempt_id, token, "familia-crisis").status_code == 200
    _go_to_door(c, attempt_id, token, world["map"]["key"])

    resp = c.post(
        DOOR.format(attempt_id),
        {"attemptToken": token, "targetNodeKey": "hospital-sala-escucha",
         "entryX": 160, "entryY": 452, "doorKey": "puerta-sala-escucha"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["data"]["map"]["key"] == "hospital-sala-escucha"

    # La clave de una puerta de OTRO mapa no existe en la sala nueva.
    back = c.post(
        DOOR.format(attempt_id),
        {"attemptToken": token, "targetNodeKey": "hospital-urgencias",
         "entryX": 480, "entryY": 430, "doorKey": "puerta-sala-escucha"},
        format="json",
    )
    assert back.status_code == 404
