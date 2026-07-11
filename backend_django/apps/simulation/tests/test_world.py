"""T15b — Explorable world (/api/simulation/.../world|world-state|interactions|tools).
Contract-faithful to Spring SimulationGameController + SimulationWorldService.
Runs against the seeded SIM-VBG-001 (every node has a scene map)."""
import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from rest_framework.test import APIClient

from apps.grupos.models import Grupo
from apps.simulation.models import CaseVersion

User = get_user_model()


def cl(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def estudiante(db, case_version_id):
    user = User.objects.create_user(
        email="est_world@x.com", password="x", nombre="Est", apellido="World", role="ESTUDIANTE"
    )
    _assign_case_to_student(user, case_version_id)
    return user


@pytest.fixture
def otro_estudiante(db):
    return User.objects.create_user(
        email="est_world2@x.com", password="x", nombre="Otro", apellido="Est", role="ESTUDIANTE"
    )


@pytest.fixture
def profesor(db):
    return User.objects.create_user(
        email="prof_world@x.com", password="x", nombre="Pro", apellido="World", role="PROFESOR"
    )


@pytest.fixture
def case_version_id(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id


def _assign_case_to_student(estudiante, case_version_id):
    profesor = User.objects.create_user(
        email="prof_world_owner@x.com",
        password="x",
        nombre="Pro",
        apellido="World",
        role="PROFESOR",
    )
    grupo = Grupo.objects.create(nombre="Grupo world", codigo="WORLD1", profesor=profesor)
    with connection.cursor() as cur:
        cur.execute(
            "INSERT INTO grupo_estudiante (grupo_id, estudiante_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, estudiante.id],
        )
        cur.execute(
            "INSERT INTO grupo_case_version (grupo_id, case_version_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, case_version_id],
        )


def _start(client, case_version_id):
    data = client.post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]
    return data["attemptId"], data["attemptToken"]


def _move(client, attempt_id, token, map_key, *points):
    """Camina en pasos plausibles (GAME-01: el servidor valida desplazamiento,
    límites y colisiones; ya no acepta teletransportes)."""
    resp = None
    for x, y in points:
        resp = client.patch(
            f"/api/simulation/attempts/{attempt_id}/world-state",
            {"attemptToken": token, "playerX": x, "playerY": y, "currentMapKey": map_key},
            format="json",
        )
        assert resp.status_code == 200, f"mover a ({x},{y}): {resp.data}"
    return resp


#: Rutas plausibles en hospital-urgencias (spawn 480,430).
PATH_TO_FAMILIA = ((340, 430), (250, 430))
PATH_TO_DOOR = ((430, 435), (610, 440), (790, 445))


def _inspect_familia(client, attempt_id, token, map_key="hospital-urgencias"):
    _move(client, attempt_id, token, map_key, *PATH_TO_FAMILIA)
    resp = client.post(
        f"/api/simulation/attempts/{attempt_id}/interactions/familia-crisis",
        {"attemptToken": token}, format="json",
    )
    assert resp.status_code == 200, resp.data
    return resp


def test_get_world_returns_scene(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    resp = c.get(f"/api/simulation/attempts/{attempt_id}/world?attemptToken={token}")
    assert resp.status_code == 200
    world = resp.data["data"]
    assert world["attemptId"] == attempt_id
    assert world["status"] == "IN_PROGRESS"
    assert world["map"]["id"] is not None
    assert world["player"]["x"] == world["map"]["spawnX"]
    assert isinstance(world["objects"], list)
    assert len(world["tools"]) >= 1
    obj = world["objects"][0]
    for key in ("key", "label", "type", "x", "y", "color", "shortCode", "collision",
                "dialogue", "movementPattern", "facing", "metadata"):
        assert key in obj


def test_update_world_state_records_and_rejects_out_of_bounds(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = c.get(f"/api/simulation/attempts/{attempt_id}/world?attemptToken={token}").data["data"]
    resp = c.patch(
        f"/api/simulation/attempts/{attempt_id}/world-state",
        {"attemptToken": token, "playerX": 340, "playerY": 430, "currentMapKey": world["map"]["key"]},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["message"] == "Estado de mundo actualizado"
    assert resp.data["data"]["player"] == {"x": 340, "y": 430}

    # GAME-01: fuera de límites ya no se clampa en silencio — se rechaza.
    out = c.patch(
        f"/api/simulation/attempts/{attempt_id}/world-state",
        {"attemptToken": token, "playerX": 5000, "playerY": 200, "currentMapKey": world["map"]["key"]},
        format="json",
    )
    assert out.status_code == 400


def test_update_world_state_ignores_stale_map_key_after_room_change(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    initial = c.get(f"/api/simulation/attempts/{attempt_id}/world?attemptToken={token}").data["data"]
    _inspect_familia(c, attempt_id, token, initial["map"]["key"])
    _move(c, attempt_id, token, initial["map"]["key"], *PATH_TO_DOOR)
    entered = c.post(
        f"/api/simulation/attempts/{attempt_id}/enter-room",
        {"attemptToken": token, "targetNodeKey": "hospital-sala-escucha",
         "entryX": 160, "entryY": 452, "doorKey": "puerta-sala-escucha"},
        format="json",
    ).data["data"]
    assert entered["player"] == {"x": 160, "y": 452}

    stale = c.patch(
        f"/api/simulation/attempts/{attempt_id}/world-state",
        {"attemptToken": token, "playerX": 500, "playerY": 450, "currentMapKey": initial["map"]["key"]},
        format="json",
    )
    assert stale.status_code == 200
    assert stale.data["data"]["map"]["key"] == "hospital-sala-escucha"
    assert stale.data["data"]["player"] == {"x": 160, "y": 452}


def test_interaction_marks_inspected(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = c.get(f"/api/simulation/attempts/{attempt_id}/world?attemptToken={token}").data["data"]
    resp = _inspect_familia(c, attempt_id, token, world["map"]["key"])
    assert resp.data["message"] == "Interaccion registrada"
    result = resp.data["data"]
    assert result["interaction"]["key"] == "familia-crisis"
    assert "familia-crisis" in result["world"]["inspectedObjectKeys"]
    assert "preparedDecisionOptionId" in result


def test_tool_object_disappears_after_pickup(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = c.get(f"/api/simulation/attempts/{attempt_id}/world?attemptToken={token}").data["data"]
    tool = next(obj for obj in world["objects"] if obj["type"] == "TOOL" and obj["toolCode"])

    resp = c.post(
        f"/api/simulation/attempts/{attempt_id}/interactions/{tool['key']}",
        {"attemptToken": token},
        format="json",
    )

    assert resp.status_code == 200
    updated = resp.data["data"]["world"]
    assert tool["toolCode"] in updated["inventory"]
    assert tool["key"] not in {obj["key"] for obj in updated["objects"]}

    again = c.get(f"/api/simulation/attempts/{attempt_id}/world?attemptToken={token}").data["data"]
    assert tool["key"] not in {obj["key"] for obj in again["objects"]}


def test_use_tool_requires_inventory_and_no_target_is_not_pertinent(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = c.get(f"/api/simulation/attempts/{attempt_id}/world?attemptToken={token}").data["data"]

    # GAME-01/4C: sin recogerla, use_tool ya no regala la herramienta.
    rejected = c.post(
        f"/api/simulation/attempts/{attempt_id}/tools/use",
        {"attemptToken": token, "toolCode": "PAP"},
        format="json",
    )
    assert rejected.status_code == 400

    _move(c, attempt_id, token, world["map"]["key"], (340, 430))
    pickup = c.post(
        f"/api/simulation/attempts/{attempt_id}/interactions/tool-pap",
        {"attemptToken": token}, format="json",
    )
    assert pickup.status_code == 200

    resp = c.post(
        f"/api/simulation/attempts/{attempt_id}/tools/use",
        {"attemptToken": token, "toolCode": "PAP"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["message"] == "Herramienta usada"
    result = resp.data["data"]
    assert result["toolCode"] == "PAP"
    # Sin target y sin categoría global: uso registrado pero NO pertinente.
    assert result["pertinent"] is False
    assert result["stressDelta"] == 3
    assert "PAP" in result["world"]["inventory"]


def test_record_npc_interaction_persists_in_world_flags(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    resp = c.post(
        f"/api/simulation/attempts/{attempt_id}/npcs/enfermera-urgencias",
        {"attemptToken": token},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["message"] == "Interaccion con NPC registrada"
    assert resp.data["data"]["flags"]["viewedNpcKeys"] == ["enfermera-urgencias"]

    again = c.get(f"/api/simulation/attempts/{attempt_id}/world?attemptToken={token}")
    assert again.status_code == 200
    assert again.data["data"]["flags"]["viewedNpcKeys"] == ["enfermera-urgencias"]


def test_person_map_interaction_persists_as_viewed_npc(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = c.get(f"/api/simulation/attempts/{attempt_id}/world?attemptToken={token}").data["data"]
    resp = _inspect_familia(c, attempt_id, token, world["map"]["key"])
    viewed = resp.data["data"]["world"]["flags"]["viewedNpcKeys"]
    assert "familia-crisis" in viewed
    assert resp.data["data"]["dialogue"]["key"] in viewed


def test_staff_can_view_world_but_other_student_cannot(estudiante, otro_estudiante, profesor, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    # Professor (staff, non-owner) may view.
    staff_resp = cl(profesor).get(
        f"/api/simulation/attempts/{attempt_id}/world?attemptToken={token}"
    )
    assert staff_resp.status_code == 200
    # A different student (non-owner, non-staff) may not.
    other_resp = cl(otro_estudiante).get(
        f"/api/simulation/attempts/{attempt_id}/world?attemptToken={token}"
    )
    assert other_resp.status_code == 403


def test_world_requires_token(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, _ = _start(c, case_version_id)
    resp = c.get(f"/api/simulation/attempts/{attempt_id}/world")
    assert resp.status_code == 400  # token obligatorio


def test_world_objects_expose_movement_fields(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = c.get(f"/api/simulation/attempts/{attempt_id}/world?attemptToken={token}").data["data"]
    assert world["objects"], "expected at least one world object in SIM-VBG-001"
    for obj in world["objects"]:
        assert "movementPattern" in obj
        assert "facing" in obj
        assert "metadata" in obj
        assert isinstance(obj["movementPattern"], dict)
        assert isinstance(obj["metadata"], dict)
        assert isinstance(obj["facing"], str)


# --- Fase 5: spatial doors (enter-room, non-scored, decoupled from DAG) --------
def test_enter_room_moves_and_persists(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    cur = c.get(f"/api/simulation/attempts/{attempt_id}/world?attemptToken={token}").data["data"]["map"]["key"]
    _inspect_familia(c, attempt_id, token, cur)
    _move(c, attempt_id, token, cur, *PATH_TO_DOOR)

    resp = c.post(
        f"/api/simulation/attempts/{attempt_id}/enter-room",
        {"attemptToken": token, "targetNodeKey": "hospital-sala-escucha",
         "entryX": 160, "entryY": 452, "doorKey": "puerta-sala-escucha"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["data"]["map"]["key"] == "hospital-sala-escucha"
    # persists across a fresh /world load (door room is NOT reset to the DAG node's map)
    again = c.get(f"/api/simulation/attempts/{attempt_id}/world?attemptToken={token}").data["data"]
    assert again["map"]["key"] == "hospital-sala-escucha"


def test_enter_room_invalid_node(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    resp = c.post(
        f"/api/simulation/attempts/{attempt_id}/enter-room",
        {"attemptToken": token, "targetNodeKey": "no-existe", "entryX": 0, "entryY": 0,
         "doorKey": "puerta-sala-escucha"},
        format="json",
    )
    assert resp.status_code in (400, 404)


def test_seed_caso_pdf_idempotente_y_puertas_jugables(estudiante, case_version_id):
    import json as _json
    from django.core.management import call_command
    from apps.simulation.models import MapObject, SceneMap

    call_command("seed_caso_pdf")
    call_command("seed_caso_pdf")  # idempotente

    urgencias = SceneMap.objects.filter(
        case_version_id=case_version_id, node__node_key="hospital-urgencias"
    ).first()
    assert urgencias is not None
    doors = MapObject.objects.filter(scene_map_id=urgencias.id, object_key="puerta-sala-escucha")
    assert doors.count() == 1
    door = doors.first()
    assert door.object_type == "EXIT"
    meta = _json.loads(door.metadata_json)
    assert meta["targetNodeKey"] == "hospital-sala-escucha"
    assert meta["requiresInspected"] == ["familia-crisis"]
    assert meta["lockedMessage"]

    escucha = SceneMap.objects.filter(
        case_version_id=case_version_id, node__node_key="hospital-sala-escucha"
    ).first()
    back = MapObject.objects.filter(scene_map_id=escucha.id, object_key="puerta-urgencias").first()
    assert back is not None
    assert _json.loads(back.metadata_json)["targetNodeKey"] == "hospital-urgencias"

    # la puerta es jugable con enter-room una vez cumplido el requisito
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _inspect_familia(c, attempt_id, token)
    _move(c, attempt_id, token, "hospital-urgencias", *PATH_TO_DOOR)
    resp = c.post(
        f"/api/simulation/attempts/{attempt_id}/enter-room",
        {"attemptToken": token, "targetNodeKey": meta["targetNodeKey"],
         "entryX": meta["entryX"], "entryY": meta["entryY"],
         "doorKey": "puerta-sala-escucha"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["data"]["map"]["key"] == "hospital-sala-escucha"
