"""A-03c — El tamaño por defecto del mapa, fijado.

Un mapa sin tamaño guardado mide 960×540: ese valor limita el movimiento del jugador y es el tamaño del primer mapa de un
caso nuevo. Los valores iniciales y las tablas del intento antiguo (escala 0-100, estrés, confianza, riesgo y la métrica
inicial del caso) se retiraron con el modelo de métricas; la acotación de la entrada de una puerta (``_door_entry``) está
en ``test_shared_helper_call_sites``.

Recorren el flujo HTTP real contra el caso sembrado SIM-VBG-001.
"""
import pytest
from django.contrib.auth import get_user_model

from apps.simulation.models import AttemptWorldState, SceneMap

from .test_game import (  # noqa: F401
    assign_case_to_student, attempt_headers, case_version_id, cl, estudiante,
)

User = get_user_model()


# ── mapa sin tamaño guardado: 960 × 540 ──────────────────────────────────────
OUT_OF_BOUNDS = "La posición está fuera de los límites del mapa"


def _move(client, attempt_id, token, map_key, x, y):
    return client.patch(
        f"/api/simulation/attempts/{attempt_id}/world-state",
        {"attemptToken": token, "playerX": x, "playerY": y, "currentMapKey": map_key},
        format="json",
    )


def test_un_mapa_sin_tamano_guardado_limita_el_movimiento_a_960_por_540(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-A03C-MAP")
    client = cl(estudiante)
    data = client.post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]
    attempt_id, token = data["attemptId"], data["attemptToken"]
    world = client.get(
        f"/api/simulation/attempts/{attempt_id}/world", **attempt_headers(token)
    ).data["data"]
    map_key = world["map"]["key"]
    SceneMap.objects.filter(case_version_id=case_version_id, map_key=map_key).update(width=0, height=0)
    # Sin ancla de sincronización el desplazamiento siempre es plausible: aquí solo importan los límites.
    AttemptWorldState.objects.filter(attempt_id=attempt_id).update(flags_json="{}")

    # El rectángulo de pies mide 22 × 16 y cuelga de (x - 11, y - 16): el borde derecho queda en x + 11
    # y el inferior en y.
    edge_right = _move(client, attempt_id, token, map_key, 949, 300)    # borde derecho en 960
    past_right = _move(client, attempt_id, token, map_key, 950, 300)    # borde derecho en 961
    edge_bottom = _move(client, attempt_id, token, map_key, 400, 540)   # borde inferior en 540
    past_bottom = _move(client, attempt_id, token, map_key, 400, 541)   # borde inferior en 541

    assert edge_right.data.get("message") != OUT_OF_BOUNDS
    assert past_right.status_code == 400 and past_right.data["message"] == OUT_OF_BOUNDS
    assert edge_bottom.data.get("message") != OUT_OF_BOUNDS
    assert past_bottom.status_code == 400 and past_bottom.data["message"] == OUT_OF_BOUNDS


# ── autoría: tamaño por defecto de un mapa ───────────────────────────────────
BASE_ADMIN = "/api/admin/cases"


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="admin_a03c@x.com", password="x", nombre="Ad", apellido="Min", role="ADMIN"
    )


def _new_draft(admin, code):
    resp = cl(admin).post(BASE_ADMIN, {"title": f"Caso {code}", "code": code}, format="json")
    assert resp.status_code == 200
    return resp.data["data"]


def test_un_caso_nuevo_trae_su_primer_mapa_de_960_por_540(admin):
    draft = _new_draft(admin, "A03C-NUEVO")

    first = draft["maps"][0]
    assert (first["width"], first["height"]) == (960, 540)


@pytest.mark.parametrize(
    ("width", "height", "expected"),
    [
        (0, 0, (960, 540)),
        (-5, -1, (960, 540)),
        (None, None, (960, 540)),
        (800, 600, (800, 600)),
        (0, 600, (960, 600)),
        (800, 0, (800, 540)),
    ],
)
def test_un_mapa_sin_tamano_valido_se_guarda_como_960_por_540(admin, width, height, expected):
    draft = _new_draft(admin, "A03C-MAPA")
    first = draft["maps"][0]
    body = {
        "mapKey": first["key"], "title": "Mapa de prueba",
        "width": width, "height": height, "spawnX": 10, "spawnY": 20,
    }

    resp = cl(admin).put(
        f"{BASE_ADMIN}/{draft['caseVersionId']}/maps/{first['id']}", body, format="json"
    )

    assert resp.status_code == 200
    saved = next(m for m in resp.data["data"]["maps"] if m["id"] == first["id"])
    assert (saved["width"], saved["height"]) == expected
