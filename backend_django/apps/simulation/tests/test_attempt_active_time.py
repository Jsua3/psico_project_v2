"""E1-5 · Tiempo activo acumulado en el intento (RF-21, decisión 14, N6).

``active_seconds += min(ahora − last_activity_at, 300)`` en cada orden que cambia el
intento; la pausa segura no suma y ya no se inserta ``WORLD_POSITION_UPDATED`` (el
reloj queda como dato). La prueba de «una sesión larga con pausa» fija que el
acumulador coincide con el cálculo viejo, que recorría los eventos.
"""
import importlib
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.simulation.models import AttemptEvent, SimulationAttempt
from apps.simulation.services.attempt_duration import (
    IDLE_CAP_SECONDS,
    active_duration_seconds,
    scene_durations,
    touch,
)

from .test_world import _move, _start, case_version_id, cl, estudiante  # noqa: F401  (fixtures)

pytestmark = pytest.mark.req("RF-21")

BASE = "/api/simulation"
T0 = datetime(2026, 9, 1, 10, 0, 0)  # naive: USE_TZ=False


def at(seconds):
    return T0 + timedelta(seconds=seconds)


class Clock:
    """Reloj controlable que sustituye a ``timezone.now`` durante la prueba."""

    def __init__(self, start):
        self.value = start

    def __call__(self):
        return self.value

    def at(self, seconds):
        self.value = at(seconds)


@pytest.fixture
def clock(monkeypatch):
    fake = Clock(T0)
    monkeypatch.setattr(timezone, "now", fake)
    return fake


# ── la función pura ──────────────────────────────────────────────────────────
def test_el_acumulador_suma_el_intervalo_y_lo_acota():
    attempt = SimpleNamespace(active_seconds=0.0, last_activity_at=at(0))

    touch(attempt, at(60))
    assert attempt.active_seconds == 60 and attempt.last_activity_at == at(60)

    touch(attempt, at(60 + 3600))
    assert attempt.active_seconds == 60 + IDLE_CAP_SECONDS


def test_el_acumulador_ignora_un_intervalo_nulo_o_negativo():
    attempt = SimpleNamespace(active_seconds=5.0, last_activity_at=at(100))

    touch(attempt, at(100))
    touch(attempt, at(90))

    assert attempt.active_seconds == 5.0
    assert attempt.last_activity_at == at(90)


def test_el_tiempo_por_escena_sale_de_node_entered_y_room_entered():
    events = [
        ("NODE_ENTERED", 1, at(0)),
        ("DECISION_RETRY_REQUIRED", 1, at(30)),
        ("ROOM_ENTERED", 1, at(40)),
        ("NODE_ENTERED", 2, at(100)),
        ("SAFE_EXIT_REQUESTED", 2, at(130)),
        ("ATTEMPT_RESUMED", 2, at(9000)),
        ("ATTEMPT_COMPLETED", 2, at(9020)),
    ]

    assert scene_durations(events, end_at=at(9020)) == [
        {"nodeId": 1, "seconds": 40.0},
        {"nodeId": 1, "seconds": 60.0},
        {"nodeId": 2, "seconds": 50.0},  # 30 antes de la pausa + 20 tras reanudar
    ]


# ── la sesión larga con pausa ────────────────────────────────────────────────
def test_una_sesion_larga_con_pausa_coincide_con_el_calculo_viejo(estudiante, case_version_id, clock):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)  # t = 0
    world = c.get(f"{BASE}/attempts/{attempt_id}/world", HTTP_X_SIEP_ATTEMPT_TOKEN=token).data["data"]
    map_key = world["map"]["key"]
    marks = []  # lo que el cálculo viejo veía como eventos (incluidos los de posición)

    def step(seconds, call, mark):
        clock.at(seconds)
        response = call()
        assert response.status_code == 200, response.data
        marks.append((mark, at(seconds)))

    def move(x):
        return lambda: c.patch(
            f"{BASE}/attempts/{attempt_id}/world-state",
            {"attemptToken": token, "playerX": x, "playerY": 430, "currentMapKey": map_key},
            format="json",
        )

    step(10, move(340), "WORLD_POSITION_UPDATED")
    step(20, move(250), "WORLD_POSITION_UPDATED")
    step(25, lambda: c.post(
        f"{BASE}/attempts/{attempt_id}/interactions/familia-crisis", {"attemptToken": token}, format="json"
    ), "MAP_INTERACTION_OPENED")
    step(1025, move(300), "WORLD_POSITION_UPDATED")  # 1000 s de silencio: cuenta como máximo 300
    step(1030, lambda: c.post(
        f"{BASE}/attempts/{attempt_id}/safe-exit", {"attemptToken": token, "reason": "pausa"}, format="json"
    ), "SAFE_EXIT_REQUESTED")
    step(1030 + 7200, lambda: c.post(  # dos horas en pausa: no cuentan
        f"{BASE}/attempts/{attempt_id}/resume", {"attemptToken": token}, format="json"
    ), "ATTEMPT_RESUMED")
    step(1030 + 7210, lambda: c.post(
        f"{BASE}/attempts/{attempt_id}/reflections",
        {"attemptToken": token, "nodeId": SimulationAttempt.objects.get(pk=attempt_id).current_node_id,
         "text": "nota"},
        format="json",
    ), "REFLECTION_SAVED")

    attempt = SimulationAttempt.objects.get(pk=attempt_id)
    old = active_duration_seconds(attempt.started_at, at(1030 + 7210), marks)
    assert abs(attempt.active_seconds - old) <= 1
    assert round(attempt.active_seconds) == 340
    assert attempt.last_activity_at == at(1030 + 7210)


def test_reanudar_no_cuenta_el_tiempo_en_pausa(estudiante, case_version_id, clock):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    clock.at(30)
    c.post(f"{BASE}/attempts/{attempt_id}/safe-exit", {"attemptToken": token, "reason": "x"}, format="json")
    clock.at(30 + 86_400)

    c.post(f"{BASE}/attempts/{attempt_id}/resume", {"attemptToken": token}, format="json")

    attempt = SimulationAttempt.objects.get(pk=attempt_id)
    assert attempt.status == "IN_PROGRESS"
    assert attempt.active_seconds == 30
    assert attempt.last_activity_at == at(30 + 86_400)


def test_mover_ya_no_inserta_world_position_updated_y_si_actualiza_el_acumulador(
    estudiante, case_version_id, clock
):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = c.get(f"{BASE}/attempts/{attempt_id}/world", HTTP_X_SIEP_ATTEMPT_TOKEN=token).data["data"]
    before = AttemptEvent.objects.filter(attempt_id=attempt_id).count()
    clock.at(12)

    _move(c, attempt_id, token, world["map"]["key"], (340, 430))

    assert AttemptEvent.objects.filter(attempt_id=attempt_id).count() == before
    assert not AttemptEvent.objects.filter(
        attempt_id=attempt_id, event_type="WORLD_POSITION_UPDATED"
    ).exists()
    attempt = SimulationAttempt.objects.get(pk=attempt_id)
    assert attempt.active_seconds == 12 and attempt.last_activity_at == at(12)


def test_un_intento_nuevo_arranca_el_reloj_en_su_inicio(estudiante, case_version_id, clock):
    clock.at(5)

    attempt_id, _ = _start(cl(estudiante), case_version_id)

    attempt = SimulationAttempt.objects.get(pk=attempt_id)
    assert attempt.active_seconds == 0
    assert attempt.last_activity_at == at(5)


# ── lecturas ─────────────────────────────────────────────────────────────────
def test_el_historial_usa_el_acumulador_y_no_lee_eventos_para_el_tiempo(
    estudiante, case_version_id, settings
):
    settings.ATTEMPT_START_STRICT = False
    c = cl(estudiante)
    closed = c.post(f"{BASE}/attempts", {"caseVersionId": case_version_id, "forceNew": True}, format="json").data["data"]
    SimulationAttempt.objects.filter(pk=closed["attemptId"]).update(active_seconds=41.6)
    running = c.post(f"{BASE}/attempts", {"caseVersionId": case_version_id, "forceNew": True}, format="json").data["data"]

    with CaptureQueriesContext(connection) as queries:
        response = c.get(f"{BASE}/attempts/history")

    history = {h["attemptId"]: h for h in response.data["data"]}
    assert history[closed["attemptId"]]["status"] == "REPLACED"
    assert history[closed["attemptId"]]["activeDurationSeconds"] == 42
    assert history[running["attemptId"]]["activeDurationSeconds"] is None
    reads_event_type = [
        q["sql"] for q in queries.captured_queries
        if '"attempt_events"."event_type"' in q["sql"].split(" FROM ")[0]
    ]
    assert reads_event_type == [], "el tiempo activo ya no se calcula con los eventos"


def test_el_reporte_de_cierre_informa_tiempo_activo_y_de_reloj(estudiante, case_version_id, clock):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    clock.at(90)
    c.post(f"{BASE}/attempts/{attempt_id}/safe-exit", {"attemptToken": token, "reason": "x"}, format="json")
    SimulationAttempt.objects.filter(pk=attempt_id).update(ended_at=at(500))

    report = c.get(
        f"{BASE}/attempts/{attempt_id}/completion-report", HTTP_X_SIEP_ATTEMPT_TOKEN=token
    ).data["data"]

    assert report["activeSeconds"] == 90
    assert report["clockSeconds"] == 500
    assert report["totalDurationSeconds"] == 500


# ── la migración de datos ────────────────────────────────────────────────────
def test_la_migracion_de_datos_calcula_el_acumulador_con_el_calculo_viejo():
    migration = importlib.import_module("apps.simulation.migrations.0007_attempt_active_time_backfill")
    marks = [
        ("WORLD_POSITION_UPDATED", at(10)),
        ("DECISION_SELECTED", at(40)),
        ("SAFE_EXIT_REQUESTED", at(50)),
        ("ATTEMPT_RESUMED", at(50 + 86_400)),
        ("DECISION_SELECTED", at(60 + 86_400)),
    ]

    expected = active_duration_seconds(at(0), at(90 + 86_400), marks)

    assert migration.compute_active_seconds(at(0), at(90 + 86_400), marks) == pytest.approx(expected, abs=1)
