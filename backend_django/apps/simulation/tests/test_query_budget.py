"""E0-1 · Presupuesto de consultas por request (RNF-05, TD-07, LW-12 en su parte de API).

Cada escenario arma el estado mínimo, mide la llamada y compara con
``QUERY_BUDGETS``. El trinquete SOLO BAJA: E5-1 reduce estos números y ninguna
tarea puede subirlos. Con ``SIEP_BASELINE_OUT=<archivo.json>`` la misma prueba
escribe las mediciones que lee ``scripts/baseline/measure-backend.mjs``.
"""
import json
import os
import platform
import statistics

import django
import pytest
from django.db import connection

from apps.simulation.models import DecisionOption
from shared.testing import measure

from .test_game import (  # noqa: F401  (fixtures de pytest)
    assign_case_to_student,
    attempt_headers,
    case_version_id,
    cl,
    estudiante,
)

pytestmark = pytest.mark.req("RNF-05")

#: Presupuesto de consultas por request. Solo baja (E5-1).
QUERY_BUDGETS = {
    # Medido en master 80e365e (2026-10-13), sin SAVEPOINT. «escrituras» entre paréntesis.
    "get_world": 16,  # (2) una LECTURA que escribe: D-15, lo corrige E1-6
    "patch_world_state": 19,  # (3) E5-1 apunta a ≤ 6
    "enter_room": 25,  # (3)
    "post_decision": 9,  # (4)
    "get_student_report": 3,  # (0) era 4: E0-11 acotó node y decision_option con select_related
    "get_group_report": 15,  # (0) crece con el grupo: E5-6 lo pagina
}
TIMED_REPEATS = 5  # los GET se repiten para sacar la mediana de milisegundos
PATH_TO_FAMILIA = ((340, 430), (250, 430))
PATH_TO_DOOR = ((430, 435), (610, 440), (790, 445))

_ENDPOINTS = {}
_ENVIRONMENT = {}


def _start(estudiante, case_version_id, codigo):
    grupo = assign_case_to_student(estudiante, case_version_id, codigo)
    client = cl(estudiante)
    data = client.post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]
    return grupo, client, data["attemptId"], data["attemptToken"], data


def _map_key(client, attempt_id, token):
    world = client.get(f"/api/simulation/attempts/{attempt_id}/world", **attempt_headers(token))
    return world.data["data"]["map"]["key"]


def _walk(client, attempt_id, token, map_key, points):
    for x, y in points:
        response = client.patch(
            f"/api/simulation/attempts/{attempt_id}/world-state",
            {"attemptToken": token, "playerX": x, "playerY": y, "currentMapKey": map_key},
            format="json",
        )
        assert response.status_code == 200, response.data


def scenario_get_world(estudiante, case_version_id):
    _, client, attempt_id, token, _ = _start(estudiante, case_version_id, "BUD-WORLD")
    url = f"/api/simulation/attempts/{attempt_id}/world"
    return (lambda: client.get(url, **attempt_headers(token))), TIMED_REPEATS


def scenario_patch_world_state(estudiante, case_version_id):
    _, client, attempt_id, token, _ = _start(estudiante, case_version_id, "BUD-PATCH")
    map_key = _map_key(client, attempt_id, token)
    url = f"/api/simulation/attempts/{attempt_id}/world-state"
    body = {"attemptToken": token, "playerX": 340, "playerY": 430, "currentMapKey": map_key}
    return (lambda: client.patch(url, body, format="json")), 1


def scenario_enter_room(estudiante, case_version_id):
    _, client, attempt_id, token, _ = _start(estudiante, case_version_id, "BUD-DOOR")
    map_key = _map_key(client, attempt_id, token)
    _walk(client, attempt_id, token, map_key, PATH_TO_FAMILIA)
    inspected = client.post(
        f"/api/simulation/attempts/{attempt_id}/interactions/familia-crisis",
        {"attemptToken": token},
        format="json",
    )
    assert inspected.status_code == 200, inspected.data
    _walk(client, attempt_id, token, map_key, PATH_TO_DOOR)
    url = f"/api/simulation/attempts/{attempt_id}/enter-room"
    body = {
        "attemptToken": token,
        "targetNodeKey": "hospital-sala-escucha",
        "entryX": 160,
        "entryY": 452,
        "doorKey": "puerta-sala-escucha",
    }
    return (lambda: client.post(url, body, format="json")), 1


def scenario_post_decision(estudiante, case_version_id):
    _, client, attempt_id, token, data = _start(estudiante, case_version_id, "BUD-DECIDE")
    option = next(
        o for o in data["currentNode"]["options"]
        if DecisionOption.objects.get(pk=o["id"]).classification == "ADEQUATE"
    )
    url = f"/api/simulation/attempts/{attempt_id}/decisions"
    body = {"attemptToken": token, "decisionOptionId": option["id"]}
    return (lambda: client.post(url, body, format="json")), 1


def scenario_get_student_report(estudiante, case_version_id):
    _, client, attempt_id, token, _ = _start(estudiante, case_version_id, "BUD-SREPORT")
    client.post(
        f"/api/simulation/attempts/{attempt_id}/safe-exit",
        {"attemptToken": token, "reason": "medición"},
        format="json",
    )
    url = f"/api/simulation/attempts/{attempt_id}/student-report"
    return (lambda: client.get(url)), TIMED_REPEATS


def scenario_get_group_report(estudiante, case_version_id):
    grupo, _, _, _, _ = _start(estudiante, case_version_id, "BUD-GROUP")
    client = cl(grupo.profesor)
    url = f"/api/reportes/grupo/{grupo.id}?caseVersionId={case_version_id}"
    return (lambda: client.get(url)), TIMED_REPEATS


SCENARIOS = {
    "get_world": scenario_get_world,
    "patch_world_state": scenario_patch_world_state,
    "enter_room": scenario_enter_room,
    "post_decision": scenario_post_decision,
    "get_student_report": scenario_get_student_report,
    "get_group_report": scenario_get_group_report,
}


@pytest.fixture(scope="module", autouse=True)
def _write_measurements():
    yield
    out = os.environ.get("SIEP_BASELINE_OUT")
    if not out or not _ENDPOINTS:
        return
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(
            {"endpoints": _ENDPOINTS, "environment": _ENVIRONMENT},
            handle,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )


def test_los_escenarios_cubren_los_presupuestos():
    assert set(SCENARIOS) == set(QUERY_BUDGETS)


@pytest.mark.parametrize("name", sorted(QUERY_BUDGETS))
def test_presupuesto_de_consultas(name, estudiante, case_version_id):
    if not _ENVIRONMENT:
        with connection.cursor() as cursor:
            cursor.execute("SHOW server_version")
            _ENVIRONMENT.update(
                postgres=cursor.fetchone()[0],
                python=platform.python_version(),
                django=django.get_version(),
            )
    call, repeats = SCENARIOS[name](estudiante, case_version_id)

    samples = []
    for _ in range(repeats):
        response, cost = measure(call)
        assert response.status_code == 200, getattr(response, "data", response.content)
        samples.append(cost)

    worst = max(samples, key=lambda cost: cost.queries)
    _ENDPOINTS[name] = {
        "queries": worst.queries,
        "writes": worst.writes,
        "bytes": worst.bytes,
        "ms_median": round(statistics.median(s.milliseconds for s in samples), 1),
        "samples": len(samples),
        "budget": QUERY_BUDGETS[name],
    }
    assert worst.queries <= QUERY_BUDGETS[name], (
        f"{name}: {worst.queries} consultas ({worst.writes} escrituras); "
        f"presupuesto {QUERY_BUDGETS[name]}. El presupuesto solo baja."
    )
