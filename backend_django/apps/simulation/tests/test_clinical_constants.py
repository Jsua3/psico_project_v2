"""A-03c — Los números de las reglas del intento y del mapa, fijados uno a uno.

Antes de darles nombre a los literales (escala 0-100, valores iniciales, métrica inicial del
caso y tamaño por defecto del mapa), estas pruebas fijan cada valor tal como se comporta hoy.
Los que ya tenían prueba están en otros archivos: la acotación a 0-100 y el 960×540 de
`_door_entry` en ``test_shared_helper_call_sites``, y el umbral de estrés alto (69/70/100)
en ``test_completion_report_contract``. Las tablas de la conducta prohibida (estrés, confianza
y riesgo por decisión) y el estrés de las herramientas se retiraron con la Tarea 5: ya nada las usa.

Casi todas son puras; las del intento nuevo, el movimiento y la autoría recorren el
flujo HTTP real contra el caso sembrado SIM-VBG-001.
"""
import json
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model

from apps.simulation.models import AttemptWorldState, SceneMap, SimulationAttempt
from apps.simulation.services import case_effects

from .test_game import (  # noqa: F401
    assign_case_to_student, attempt_headers, case_version_id, cl, estudiante,
)

User = get_user_model()


# ── case_effects: la métrica del caso inicia en 50 ───────────────────────────
class _FakeState:
    def __init__(self, raw):
        self.flags_json = json.dumps(raw)

    def save(self, update_fields=None):
        pass


def test_las_metricas_del_caso_sin_estado_guardado_inician_todas_en_50(monkeypatch):
    monkeypatch.setattr(case_effects, "_load_state", lambda attempt: None)

    flags, metrics = case_effects.read_case_state(SimpleNamespace(id=1))

    assert flags == {}
    assert metrics == {key: 50 for key in case_effects.CASE_METRIC_KEYS}


def test_una_metrica_fuera_de_la_lista_del_caso_tambien_parte_de_50(monkeypatch):
    state = _FakeState({})
    monkeypatch.setattr(case_effects, "_load_state", lambda attempt: state)
    effects = {"severity": case_effects.SEVERITY_ACCEPTABLE, "flags": {}, "metrics": {"metrica_extra": 10}}

    case_effects.apply_case_effects(
        SimpleNamespace(id=1),
        SimpleNamespace(option_key="opcion-de-prueba", effects=json.dumps(effects)),
    )

    assert json.loads(state.flags_json)["caseMetrics"]["metrica_extra"] == 60


# ── intento nuevo: valores iniciales ─────────────────────────────────────────
def test_un_intento_nuevo_arranca_sin_estres_y_con_confianza_y_riesgo_a_media_escala(
    estudiante, case_version_id
):
    assign_case_to_student(estudiante, case_version_id, "SIM-A03C-INI")

    data = cl(estudiante).post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]

    row = SimulationAttempt.objects.get(pk=data["attemptId"])
    assert (row.stress_index, row.victim_risk, row.user_trust) == (0, 50, 50)
    assert data["metrics"] == {}  # las columnas conservan sus valores, pero ya no viajan al estudiante


def test_los_valores_por_defecto_del_modelo_son_los_iniciales_del_intento():
    field = SimulationAttempt._meta.get_field

    assert field("stress_index").default == 0
    assert field("victim_risk").default == 50
    assert field("user_trust").default == 50


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
