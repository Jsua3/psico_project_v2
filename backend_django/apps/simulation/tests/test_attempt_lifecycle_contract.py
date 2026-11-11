"""A-03a / P-12 — Ciclo de vida del intento: qué hace cada operación en cada estado.

Caracteriza, ANTES de reorganizar los estados con `AttemptStatus` y una tabla de
transiciones, la matriz operación × estado: qué operaciones se aceptan, cuáles se
rechazan (y con qué mensaje) y cuáles son idempotentes. Las transiciones inválidas
no tenían ninguna prueba. Los estados se escriben como texto a propósito: el
contrato es el valor que viaja y se guarda, no la clase que lo nombra.

Estados: IN_PROGRESS, PAUSED, COMPLETED, REPLACED y SAFE_EXITED (este último solo
histórico: ningún código nuevo lo escribe).
"""
import pytest
from django.utils import timezone

from apps.simulation.models import AttemptEvent, ReflectionJournal, SimulationAttempt

from .test_game import (  # noqa: F401
    assign_case_to_student, attempt_headers, case_version_id, classification_of, cl, estudiante, explore_what_the_case_asks,
)

STATUSES = ["IN_PROGRESS", "PAUSED", "COMPLETED", "REPLACED", "SAFE_EXITED"]
TERMINAL = ["COMPLETED", "REPLACED", "SAFE_EXITED"]
NOT_IN_PROGRESS = [s for s in STATUSES if s != "IN_PROGRESS"]
BASE = "/api/simulation"


def _body(attempt, **extra):
    return {"attemptToken": attempt["attemptToken"], **extra}


# ── operaciones (cliente, intento recién iniciado) → respuesta ────────────────
def _decisions(c, a):
    option_id = a["currentNode"]["options"][0]["id"]
    return c.post(f"{BASE}/attempts/{a['attemptId']}/decisions", _body(a, decisionOptionId=option_id), format="json")


def _reflections(c, a):
    return c.post(
        f"{BASE}/attempts/{a['attemptId']}/reflections",
        _body(a, nodeId=a["currentNode"]["id"], text="una nota"), format="json",
    )


def _safe_exit(c, a):
    return c.post(f"{BASE}/attempts/{a['attemptId']}/safe-exit", _body(a, reason="necesito parar"), format="json")


def _resume(c, a):
    return c.post(f"{BASE}/attempts/{a['attemptId']}/resume", _body(a), format="json")


def _use_tool(c, a):
    return c.post(f"{BASE}/attempts/{a['attemptId']}/tools/use", _body(a, toolCode="PAP"), format="json")


def _move(c, a):
    return c.patch(f"{BASE}/attempts/{a['attemptId']}/world-state", _body(a, playerX=340, playerY=430), format="json")


def _interact(c, a):
    return c.post(f"{BASE}/attempts/{a['attemptId']}/interactions/no-existe", _body(a), format="json")


def _npc(c, a):
    return c.post(f"{BASE}/attempts/{a['attemptId']}/npcs/no-existe", _body(a), format="json")


def _enter_room(c, a):
    return c.post(f"{BASE}/attempts/{a['attemptId']}/enter-room", _body(a, targetNodeKey="sala-x"), format="json")


def _get(path):
    def call(c, a):
        return c.get(f"{BASE}/attempts/{a['attemptId']}/{path}".rstrip("/"), **attempt_headers(a["attemptToken"]))
    return call


OPERATIONS = {
    "decisions": _decisions,
    "reflections": _reflections,
    "safe_exit": _safe_exit,
    "resume": _resume,
    "use_tool": _use_tool,
    "move": _move,
    "interact": _interact,
    "npc": _npc,
    "enter_room": _enter_room,
    "get_world": _get("world"),
    "get_attempt": _get(""),
    "progress_map": _get("progress-map"),
    "completion_report": _get("completion-report"),
}

WORLD_GUARD = "El intento ya no acepta interacciones en el mundo"


def _others(message):
    return {s: (400, message) for s in NOT_IN_PROGRESS}


#: operación → estado → (código HTTP, mensaje de error o None si no se comprueba)
EXPECTED = {
    "decisions": {"IN_PROGRESS": (200, None), **_others("El intento ya no acepta decisiones")},
    "reflections": {"IN_PROGRESS": (200, None), **_others("La bitácora ya está bloqueada")},
    "safe_exit": {s: (200, None) for s in STATUSES},   # idempotente: fuera de IN_PROGRESS devuelve el estado
    "resume": {
        "IN_PROGRESS": (200, None), "PAUSED": (200, None),
        **{s: (400, "Solo un intento en pausa segura puede reanudarse") for s in TERMINAL},
    },
    "use_tool": {
        "IN_PROGRESS": (400, "La herramienta no está en tu inventario; recógela primero"),
        **_others("El intento ya no acepta herramientas"),
    },
    "move": {"IN_PROGRESS": (400, "currentMapKey es obligatorio"), **_others(WORLD_GUARD)},
    "interact": {"IN_PROGRESS": (404, "Interaccion no encontrada"), **_others(WORLD_GUARD)},
    "npc": {"IN_PROGRESS": (None, None), **_others(WORLD_GUARD)},   # None: se comprueba aparte
    "enter_room": {"IN_PROGRESS": (400, "doorKey es obligatorio para cambiar de sala"), **_others(WORLD_GUARD)},
    "get_world": {s: (200, None) for s in STATUSES},
    "get_attempt": {s: (200, None) for s in STATUSES},
    "progress_map": {s: (200, None) for s in STATUSES},
    "completion_report": {
        "IN_PROGRESS": (400, "El intento aún está en progreso"),
        **{s: (200, None) for s in NOT_IN_PROGRESS},
    },
}

READ_ONLY = {"get_world", "get_attempt", "progress_map", "completion_report"}

#: E6-4 (R13): la ÚNICA escritura que una lectura puede hacer. El dueño de un intento COMPLETADO que abre su reporte deja
#: un ``FEEDBACK_VIEWED`` (a lo sumo uno por intento, por la clave única de la base); ninguna otra lectura ni otro estado
#: escribe. Se anota aquí, en el contrato, para que una escritura nueva en un GET falle esta prueba y no pase inadvertida.
VIEWS_FEEDBACK = {("completion_report", "COMPLETED")}

#: Pares (operación, estado) que sí cambian algo en el intento o sus eventos.
MUTATES = {
    ("decisions", "IN_PROGRESS"), ("reflections", "IN_PROGRESS"),
    ("safe_exit", "IN_PROGRESS"), ("resume", "PAUSED"),
}


@pytest.fixture
def intentos(estudiante, case_version_id):
    """Fábrica de intentos en el estado pedido (se inician de verdad y luego se fuerza el estado)."""
    assign_case_to_student(estudiante, case_version_id, "LIFE-1")
    client = cl(estudiante)

    def make(status="IN_PROGRESS", force_new=True):
        payload = {"caseVersionId": case_version_id}
        if force_new:
            payload["forceNew"] = True
        data = client.post(f"{BASE}/attempts", payload, format="json").data["data"]
        if status != "IN_PROGRESS":
            fields = {"status": status}
            if status in TERMINAL:
                fields.update(ended_at=timezone.now(), locked_at=timezone.now())
            SimulationAttempt.objects.filter(pk=data["attemptId"]).update(**fields)
        return data

    return client, make


def _events(attempt_id):
    return list(AttemptEvent.objects.filter(attempt_id=attempt_id).order_by("id").values_list("event_type", flat=True))


@pytest.mark.parametrize("status", STATUSES)
@pytest.mark.parametrize("operation", list(OPERATIONS))
def test_cada_operacion_en_cada_estado(intentos, operation, status):
    client, make = intentos
    attempt = make(status)
    before = (SimulationAttempt.objects.get(pk=attempt["attemptId"]).status, _events(attempt["attemptId"]))

    response = OPERATIONS[operation](client, attempt)

    code, message = EXPECTED[operation][status]
    if code is not None:
        assert response.status_code == code, response.data
    if message is not None:
        assert response.data["message"] == message
    after = (SimulationAttempt.objects.get(pk=attempt["attemptId"]).status, _events(attempt["attemptId"]))
    read_only = operation in READ_ONLY
    rejected = response.status_code >= 400
    idempotent = (operation, status) not in MUTATES and operation in ("safe_exit", "resume")
    if read_only or rejected or idempotent:
        viewed = ["FEEDBACK_VIEWED"] if (operation, status) in VIEWS_FEEDBACK and not rejected else []
        assert after == (before[0], before[1] + viewed), (
            "una operación rechazada, idempotente o de solo lectura no cambia nada (salvo el evento de E6-4 en el "
            "reporte de un intento completado)"
        )


def test_un_npc_inexistente_en_curso_se_rechaza_sin_cambiar_nada(intentos):
    client, make = intentos
    attempt = make("IN_PROGRESS")

    response = _npc(client, attempt)

    assert response.status_code in (400, 404)
    assert response.data["message"] != WORLD_GUARD


@pytest.mark.parametrize("status", NOT_IN_PROGRESS)
def test_pausar_fuera_de_en_progreso_devuelve_el_estado_sin_eventos(intentos, status):
    client, make = intentos
    attempt = make(status)

    response = _safe_exit(client, attempt)

    assert response.status_code == 200
    assert response.data["data"]["status"] == status
    assert "SAFE_EXIT_REQUESTED" not in _events(attempt["attemptId"])
    assert SimulationAttempt.objects.get(pk=attempt["attemptId"]).status == status


def test_pausar_un_intento_en_progreso_lo_deja_en_pausa_sin_cerrarlo(intentos):
    client, make = intentos
    attempt = make("IN_PROGRESS")

    response = _safe_exit(client, attempt)

    assert response.data["data"]["status"] == "PAUSED"
    row = SimulationAttempt.objects.get(pk=attempt["attemptId"])
    assert (row.status, row.ended_at, row.locked_at) == ("PAUSED", None, None)
    assert _events(attempt["attemptId"]).count("SAFE_EXIT_REQUESTED") == 1


def test_reanudar_un_intento_en_pausa_lo_devuelve_a_en_progreso(intentos):
    client, make = intentos
    attempt = make("PAUSED")

    response = _resume(client, attempt)

    assert response.data["data"]["status"] == "IN_PROGRESS"
    assert _events(attempt["attemptId"]).count("ATTEMPT_RESUMED") == 1
    row = SimulationAttempt.objects.get(pk=attempt["attemptId"])
    assert (row.status, row.ended_at, row.locked_at) == ("IN_PROGRESS", None, None)


def test_reanudar_un_intento_en_progreso_es_idempotente(intentos):
    client, make = intentos
    attempt = make("IN_PROGRESS")

    response = _resume(client, attempt)

    assert response.status_code == 200
    assert response.data["data"]["status"] == "IN_PROGRESS"
    assert "ATTEMPT_RESUMED" not in _events(attempt["attemptId"])


def test_llegar_a_un_nodo_terminal_completa_el_intento_y_lo_cierra(intentos):
    client, make = intentos
    attempt = make("IN_PROGRESS")
    note = client.post(
        f"{BASE}/attempts/{attempt['attemptId']}/reflections",
        _body(attempt, nodeId=attempt["currentNode"]["id"], text="antes de terminar"), format="json",
    )
    assert note.status_code == 200

    state = explore_what_the_case_asks(client, attempt)  # el caso 2.1 retiene las recomendadas hasta explorar
    for _ in range(25):
        if state["status"] != "IN_PROGRESS":
            break
        options = state["currentNode"]["options"]
        option = next((o for o in options if classification_of(o) == "ADEQUATE"), options[0])
        resp = client.post(
            f"{BASE}/attempts/{attempt['attemptId']}/decisions",
            _body(attempt, decisionOptionId=option["id"]), format="json",
        )
        assert resp.status_code == 200, resp.data
        state = resp.data["data"]["attempt"]

    row = SimulationAttempt.objects.get(pk=attempt["attemptId"])
    assert row.status == "COMPLETED"
    assert row.ended_at is not None and row.locked_at is not None
    assert _events(attempt["attemptId"]).count("ATTEMPT_COMPLETED") == 1
    assert ReflectionJournal.objects.get(attempt_id=attempt["attemptId"]).locked is True


@pytest.mark.parametrize("status", ["IN_PROGRESS", "PAUSED"])
def test_un_intento_nuevo_forzado_reemplaza_al_abierto(settings, intentos, estudiante, case_version_id, status):
    # Política heredada (bandera apagada) hasta que el visual migre su consumo (F10-9†).
    settings.ATTEMPT_START_STRICT = False
    client, make = intentos
    old = make(status)

    fresh = client.post(f"{BASE}/attempts", {"caseVersionId": case_version_id, "forceNew": True}, format="json").data["data"]

    assert fresh["attemptId"] != old["attemptId"]
    row = SimulationAttempt.objects.get(pk=old["attemptId"])
    assert row.status == "REPLACED"
    assert row.ended_at is not None and row.locked_at is not None
    assert _events(old["attemptId"]).count("ATTEMPT_REPLACED") == 1


@pytest.mark.parametrize("status", ["IN_PROGRESS", "PAUSED"])
def test_con_la_politica_estricta_forzar_un_intento_nuevo_no_reemplaza_al_abierto(
    settings, intentos, case_version_id, status
):
    """RN-07 (E1-1): reemplazar un intento es una acción docente; el estudiante recibe 409."""
    settings.ATTEMPT_START_STRICT = True
    client, make = intentos
    old = make(status)

    response = client.post(f"{BASE}/attempts", {"caseVersionId": case_version_id, "forceNew": True}, format="json")

    assert response.status_code == 409
    assert response.data["code"] == "ATTEMPT_ALREADY_OPEN"
    assert response.data["existingAttemptId"] == old["attemptId"]
    row = SimulationAttempt.objects.get(pk=old["attemptId"])
    assert row.status == status
    assert row.ended_at is None and row.locked_at is None
    assert "ATTEMPT_REPLACED" not in _events(old["attemptId"])


@pytest.mark.parametrize("status", TERMINAL)
def test_un_intento_nuevo_forzado_no_toca_a_los_cerrados(intentos, case_version_id, status):
    client, make = intentos
    old = make(status)
    before = SimulationAttempt.objects.get(pk=old["attemptId"])

    fresh = client.post(f"{BASE}/attempts", {"caseVersionId": case_version_id, "forceNew": True}, format="json").data["data"]

    after = SimulationAttempt.objects.get(pk=old["attemptId"])
    assert fresh["attemptId"] != old["attemptId"]
    assert (after.status, after.ended_at) == (before.status, before.ended_at)
    assert "ATTEMPT_REPLACED" not in _events(old["attemptId"])


@pytest.mark.parametrize("status", ["IN_PROGRESS", "PAUSED"])
def test_iniciar_sin_forzar_devuelve_el_intento_abierto(intentos, case_version_id, status):
    client, make = intentos
    open_attempt = make(status)

    again = client.post(f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]

    assert again["attemptId"] == open_attempt["attemptId"]
    assert again["status"] == status
    assert SimulationAttempt.objects.filter(case_version_id=case_version_id).count() == 1


@pytest.mark.parametrize("status", TERMINAL)
def test_iniciar_sin_forzar_con_un_intento_cerrado_crea_uno_nuevo(intentos, case_version_id, status):
    client, make = intentos
    closed = make(status)

    fresh = client.post(f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]

    assert fresh["attemptId"] != closed["attemptId"]
    assert fresh["status"] == "IN_PROGRESS"
    assert SimulationAttempt.objects.get(pk=closed["attemptId"]).status == status


@pytest.mark.parametrize("status", STATUSES)
def test_el_intento_activo_solo_incluye_en_progreso_y_en_pausa(intentos, case_version_id, status):
    client, make = intentos
    attempt = make(status)

    response = client.get(f"{BASE}/cases/{case_version_id}/active-attempt")

    if status in ("IN_PROGRESS", "PAUSED"):
        assert response.status_code == 200
        assert response.data["data"]["attemptId"] == attempt["attemptId"]
        assert response.data["data"]["status"] == status
    else:
        assert response.status_code == 204
