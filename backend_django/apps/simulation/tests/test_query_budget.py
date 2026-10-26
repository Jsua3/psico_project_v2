"""E0-1 · Presupuesto de consultas por request (RNF-05, TD-07, LW-12 en su parte de API).

Cada escenario arma el estado mínimo, mide la llamada y compara con
``QUERY_BUDGETS``. El trinquete SOLO BAJA y muerde en los dos sentidos: si la
medición sube la prueba falla, y si baja también (hay que bajar el número aquí,
para que una regresión posterior no quepa en la holgura que dejó una mejora).
Con ``SIEP_BASELINE_OUT=<archivo.json>`` la misma prueba escribe las mediciones que
lee ``scripts/baseline/measure-backend.mjs``.

Límites declarados de la medición: los escenarios usan ``force_authenticate``, así
que omiten la consulta de usuario de la autenticación JWT de una request real (+1),
y ``get_group_report`` se mide con un solo estudiante, de modo que un N+1 por
estudiante no se vería (lo cubre E5-6, que pagina y mide con varios).
"""
import json
import os
import platform
import statistics

import django
import pytest
from django.db import connection

from apps.simulation.models import DecisionOption, SimulationAttempt
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
    # E5-1: carga de árboles/líneas/opciones en 3 consultas y AttemptWorldState junto al intento.
    "get_world": 8,  # (0) era 14; antes de E1-6 era 16 con 2 escrituras (D-15)
    # E5-1: acuse mínimo + cerrojo en la lectura del intento + INSERT directo del estado inicial. Reparación de
    # E5-1: 6 → 7, porque el estado del mundo se lee DESPUÉS del cerrojo (en la misma sentencia llegaba viejo y el
    # PATCH pisaba lo que otra orden acababa de confirmar: test_world_patch_race.py). Sigue siendo 21 → 7.
    "patch_world_state": 7,  # (2) era 21 (4)
    "enter_room": 13,  # (3) era 26
    # era 9 (4) sin mundo: +1 cerrojo y +1 búsqueda de repetición (E1-3), +1 lectura y +1 UPDATE del
    # estado del mundo por los efectos del caso, que la medición anterior omitía por no tener mundo.
    # Tarea 5 (modelo de métricas): 12 → 11. La decisión ya no llama a ``decision_effects`` ni a ``case_effects``: los
    # hitos y la persona los escribe ``response_effects.apply`` (una lectura del mundo con su mapa y un UPDATE).
    "post_decision": 11,  # (5)
    "get_student_report": 3,  # (0) era 4: E0-11 acotó node y decision_option con select_related
    # E6: lo que cuestan el cierre (reporte v2, evaluación del sistema) y la primera lectura del dueño (el evento).
    # Tarea 5: 35 → 36 a propósito. ``response_effects.apply`` pasa por ``ensure_world_state``, que sincroniza el mundo con
    # la escena actual si nadie lo hizo (+1 SELECT del mapa y +1 UPDATE): este escenario recorre el caso sin pedir ``/world``
    # en cada escena, así que paga esa sincronización una vez; un jugador real ya la tiene hecha por su ``GET /world``.
    # Tarea 9: 36 → 32 a propósito. El reporte v3 ya no cuenta clasificaciones ni arma las competencias heurísticas; las
    # cuatro consultas que se fueron eran de ese cálculo, y el perfil por competencia y la evaluación del sistema siguen.
    "post_decision_closing": 32,  # (10) la decisión que cierra: reporte v3 + evaluación del sistema (antes de E6: 26 y 9)
    "get_student_report_completed": 3,  # (1) la primera lectura del dueño de un intento completado escribe el evento
    # S4-1: 15 → 16 a propósito. Leer el reporte de un grupo es leer datos de otras personas y deja UNA fila de
    # auditoría (`reporte.leer`, RNF-007): es el INSERT de `audit_logs`, la única escritura. Las 15 de lectura no cambian.
    "get_group_report": 13,  # (1) crece con el grupo: E5-6 lo pagina
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
    # Un jugador real ya cargó y recorrió el mundo al decidir: sin estado del mundo los efectos del
    # caso no se escribían y la medición subestimaba la decisión (E1-6 la hace con el estado creado).
    map_key = _map_key(client, attempt_id, token)
    _walk(client, attempt_id, token, map_key, PATH_TO_FAMILIA[:1])
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


def _play_until_the_closing_decision(client, attempt_id, token):
    """Decide con la opción adecuada de cada nodo hasta quedar ante la que cierra el intento; devuelve esa opción."""
    for _ in range(30):
        attempt = SimulationAttempt.objects.get(pk=attempt_id)
        options = DecisionOption.objects.filter(source_node_id=attempt.current_node_id).select_related("target_node")
        good = options.filter(classification="ADEQUATE").first() or options.first()
        if good.target_node.terminal_node:
            return good
        response = client.post(
            f"/api/simulation/attempts/{attempt_id}/decisions",
            {"attemptToken": token, "decisionOptionId": good.id}, format="json",
        )
        assert response.status_code == 200, response.data
    raise AssertionError("el caso no llegó a un nodo final")


def scenario_post_decision_closing(estudiante, case_version_id):
    """La decisión que cierra el intento: congela el reporte v3 y crea la evaluación del sistema (E6-1d, E6-1e)."""
    _, client, attempt_id, token, _ = _start(estudiante, case_version_id, "BUD-CLOSE")
    closing = _play_until_the_closing_decision(client, attempt_id, token)
    url = f"/api/simulation/attempts/{attempt_id}/decisions"
    body = {"attemptToken": token, "decisionOptionId": closing.id}
    return (lambda: client.post(url, body, format="json")), 1


def scenario_get_student_report_completed(estudiante, case_version_id):
    """La lectura del dueño de un intento COMPLETADO: además del reporte, escribe el evento (a lo sumo una vez)."""
    _, client, attempt_id, token, _ = _start(estudiante, case_version_id, "BUD-OWNER")
    closing = _play_until_the_closing_decision(client, attempt_id, token)
    done = client.post(
        f"/api/simulation/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": closing.id}, format="json",
    )
    assert done.status_code == 200, done.data
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
    "post_decision_closing": scenario_post_decision_closing,
    "get_student_report_completed": scenario_get_student_report_completed,
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

    from shared import cache as shared_cache

    samples = []
    for _ in range(repeats):
        shared_cache.clear()
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
    assert worst.queries == QUERY_BUDGETS[name], (
        f"{name}: {worst.queries} consultas ({worst.writes} escrituras); "
        f"presupuesto {QUERY_BUDGETS[name]}. El presupuesto solo baja: si la medición "
        f"bajó, pon QUERY_BUDGETS[{name!r}] = {worst.queries}; si subió, optimiza."
    )


def test_list_published_cases_no_hace_count_por_caso(estudiante, case_version_id):
    """E5-1: ``list_published_cases`` anota ``node_count`` en una sola consulta sin N+1 por versión."""
    from apps.simulation.models import CaseVersion, SimulationCase, SimulationNode
    from apps.simulation.services import game_service
    from shared.testing import assert_queries_at_most, fetch_mode_raise, seal_version

    assign_case_to_student(estudiante, case_version_id, "BUD-CASES")
    extra_case = SimulationCase.objects.create(
        code="SIM-EXTRA-E5", title="Extra", description="x", active=True, created_by=estudiante
    )
    extra_ver = CaseVersion.objects.create(
        simulation_case=extra_case, semantic_version="1.0.0", status="DRAFT", created_by=estudiante
    )
    SimulationNode.objects.create(
        case_version=extra_ver, node_key="n1", title="N1", narrative="x", start_node=True, terminal_node=True
    )
    CaseVersion.objects.filter(pk=extra_ver.id).update(status="PUBLISHED")
    seal_version(extra_ver)

    with fetch_mode_raise(), assert_queries_at_most(1):
        items = game_service.list_published_cases(actor=None)
    assert len(items) >= 2
    by_code = {item["code"]: item["nodeCount"] for item in items}
    assert by_code["SIM-EXTRA-E5"] == 1


def test_patch_world_state_devuelve_acuse_minimo_salvo_cambio_de_sala(estudiante, case_version_id):
    """E5-1: ``PATCH world-state`` devuelve el acuse mínimo cuando no cambió la sala."""
    _, client, attempt_id, token, _ = _start(estudiante, case_version_id, "BUD-ACK")
    map_key = _map_key(client, attempt_id, token)
    response = client.patch(
        f"/api/simulation/attempts/{attempt_id}/world-state",
        {"attemptToken": token, "playerX": 340, "playerY": 430, "currentMapKey": map_key},
        format="json",
    )
    assert response.status_code == 200
    data = response.data["data"]
    assert data["map"] == {"key": map_key}
    assert data["player"] == {"x": 340, "y": 430}
    assert "objects" not in data
    assert "tools" not in data

