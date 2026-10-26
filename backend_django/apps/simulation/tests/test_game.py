import json
import uuid
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import Grupo
from apps.simulation.models import AttemptEvent, CaseVersion, DecisionOption, ReflectionJournal, SimulationAttempt
from apps.simulation.services import case_state, crypto_service
from apps.simulation.services.game_service import RETRY_NEUTRAL_MESSAGE

User = get_user_model()


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_sim@x.com", password="pass1234", nombre="Est", apellido="Sim", role="ESTUDIANTE"
    )


@pytest.fixture
def case_version_id(db):
    return CaseVersion.objects.get(
        simulation_case__code="SIM-VBG-001", status="PUBLISHED"
    ).id


def cl(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def attempt_headers(token):
    return {"HTTP_X_SIEP_ATTEMPT_TOKEN": token}


def classification_of(option):
    """El JSON del nodo ya no trae la clasificación (T11.5): se consulta por id."""
    return DecisionOption.objects.get(pk=option["id"]).classification


def assign_case_to_student(estudiante, case_version_id, codigo="SIM-G"):
    profesor = User.objects.create_user(
        email=f"prof_{codigo.lower()}@x.com",
        password="pass1234",
        nombre="Pro",
        apellido="Sim",
        role="PROFESOR",
    )
    grupo = Grupo.objects.create(nombre=f"Grupo {codigo}", codigo=codigo, profesor=profesor)
    with connection.cursor() as cur:
        cur.execute(
            "INSERT INTO grupo_estudiante (grupo_id, estudiante_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, estudiante.id],
        )
        cur.execute(
            "INSERT INTO case_assignments (grupo_id, case_version_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, case_version_id],
        )
    return grupo


def test_crypto_roundtrip():
    cipher = crypto_service.encrypt("Texto sensible áéí")
    assert cipher != "Texto sensible áéí"
    assert crypto_service.decrypt(cipher) == "Texto sensible áéí"
    assert crypto_service.key_ref() == "local-aes-gcm-v1"


def test_cases_lists_only_assigned_for_students(estudiante, case_version_id):
    assert cl(estudiante).get("/api/simulation/cases").data["data"] == []
    assign_case_to_student(estudiante, case_version_id)

    resp = cl(estudiante).get("/api/simulation/cases")
    assert resp.status_code == 200
    codes = {c["code"] for c in resp.data["data"]}
    assert "SIM-VBG-001" in codes


def test_start_attempt_requires_group_case_assignment(estudiante, case_version_id):
    resp = cl(estudiante).post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json")
    assert resp.status_code == 403


def test_decision_override_persists_missing_evidence(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-OVERRIDE")
    c = cl(estudiante)
    attempt = c.post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json",
    ).data["data"]
    option_id = next(
        option["id"] for option in attempt["currentNode"]["options"]
        if classification_of(option) == "ADEQUATE"
    )

    response = c.post(
        f"/api/simulation/attempts/{attempt['attemptId']}/decisions",
        {
            "attemptToken": attempt["attemptToken"],
            "decisionOptionId": option_id,
            "evidenceOverride": True,
            "missingEvidence": ["Hablar con la familia", "Usar PAP"],
        },
        format="json",
    )

    assert response.status_code == 200
    event = AttemptEvent.objects.get(
        attempt_id=attempt["attemptId"], decision_option_id=option_id,
    )
    assert "override de evidencia" in event.detail.lower()
    assert "Hablar con la familia" in event.detail
    assert "Usar PAP" in event.detail

    # T11.2: las etiquetas internas quedan solo en el evento; el jugador no las lee.
    shown = json.dumps(response.data["data"]).lower()
    assert set(response.data["data"]) == {"attempt", "consequence"}
    assert "override" not in shown
    assert "usar pap" not in shown
    assert "hablar con la familia" not in shown
    # El evento guarda la explicación propia de la opción y, después, las etiquetas del override.
    option = DecisionOption.objects.get(pk=option_id)
    explanation = option.feedback_text or option.immediate_feedback
    assert explanation and event.detail.startswith(explanation)


def test_full_playthrough_reaches_terminal_and_locks_reflection(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-FULL")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json")
    assert start.status_code == 200
    assert start.data["message"] == "Intento iniciado"
    data = start.data["data"]
    token, attempt_id = data["attemptToken"], data["attemptId"]
    assert data["status"] == "IN_PROGRESS"
    assert data["metrics"]["userTrust"] == 50 and data["metrics"]["victimRisk"] == 50

    # Reflection at the start node -> encrypted at rest, unlocked while in progress.
    node_id = data["currentNode"]["id"]
    r = c.post(
        f"/api/simulation/attempts/{attempt_id}/reflections",
        {"attemptToken": token, "nodeId": node_id, "text": "Mi reflexión inicial"},
        format="json",
    )
    assert r.status_code == 200 and r.data["data"]["locked"] is False
    refl = ReflectionJournal.objects.get(attempt_id=attempt_id, node_id=node_id)
    assert refl.encrypted_text != "Mi reflexión inicial"  # stored encrypted
    assert crypto_service.decrypt(refl.encrypted_text) == "Mi reflexión inicial"

    # Walk the DAG (first option each step) until a terminal node.
    state = data
    for _ in range(20):
        if state["status"] != "IN_PROGRESS":
            break
        options = state["currentNode"]["options"]
        assert options, "non-terminal node must offer decisions"
        option = next((o for o in options if classification_of(o) == "ADEQUATE"), options[0])
        resp = c.post(
            f"/api/simulation/attempts/{attempt_id}/decisions",
            {"attemptToken": token, "decisionOptionId": option["id"]},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["message"] == "Decision procesada"
        assert set(resp.data["data"]) == {"attempt", "consequence"}
        assert resp.data["data"]["consequence"]["text"]
        state = resp.data["data"]["attempt"]

    assert state["status"] == "COMPLETED"
    assert state["completionReport"] is not None
    assert state["completionReport"]["status"] == "COMPLETED"

    # Reflection is locked once the attempt ends.
    refl.refresh_from_db()
    assert refl.locked is True

    # Cannot add reflections to a finished attempt.
    blocked = c.post(
        f"/api/simulation/attempts/{attempt_id}/reflections",
        {"attemptToken": token, "nodeId": node_id, "text": "tarde"},
        format="json",
    )
    assert blocked.status_code == 400

    report = c.get(
        f"/api/simulation/attempts/{attempt_id}/completion-report",
        **attempt_headers(token),
    )
    assert report.status_code == 200
    assert report.data["data"]["status"] == "COMPLETED"


def test_inadequate_decision_requires_retry_without_advancing(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-RETRY")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    attempt_id, token = start["attemptId"], start["attemptToken"]
    node_id = start["currentNode"]["id"]
    node_key = start["currentNode"]["key"]
    state_before = case_state.read(SimulationAttempt.objects.get(pk=attempt_id))

    wrong = DecisionOption.objects.filter(
        source_node_id=node_id,
        classification="INADEQUATE",
    ).first()
    assert wrong is not None

    retry = c.post(
        f"/api/simulation/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": wrong.id},
        format="json",
    )
    assert retry.status_code == 200
    assert set(retry.data["data"]) == {"attempt", "consequence", "retry"}
    assert retry.data["data"]["retry"] == {"allowed": True, "message": RETRY_NEUTRAL_MESSAGE}
    retry_state = retry.data["data"]["attempt"]
    assert retry_state["status"] == "IN_PROGRESS"
    assert retry_state["currentNode"]["key"] == node_key
    assert "feedback" not in retry_state
    assert case_state.read(SimulationAttempt.objects.get(pk=attempt_id)) == state_before
    assert AttemptEvent.objects.filter(
        attempt_id=attempt_id,
        event_type="PROHIBITED_DECISION_RETRY_REQUIRED",
        decision_option_id=wrong.id,
    ).exists()

    correct = DecisionOption.objects.filter(
        source_node_id=node_id,
        classification="ADEQUATE",
    ).first()
    assert correct is not None
    advanced = c.post(
        f"/api/simulation/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": correct.id},
        format="json",
    )
    assert advanced.status_code == 200
    assert advanced.data["data"]["attempt"]["currentNode"]["key"] != node_key


def test_risky_decision_requires_retry_without_advancing(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-RISKY")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    attempt_id, token = start["attemptId"], start["attemptToken"]

    first_correct = DecisionOption.objects.filter(
        source_node_id=start["currentNode"]["id"],
        classification="ADEQUATE",
    ).first()
    assert first_correct is not None
    current = c.post(
        f"/api/simulation/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": first_correct.id},
        format="json",
    ).data["data"]["attempt"]

    node_id = current["currentNode"]["id"]
    node_key = current["currentNode"]["key"]
    state_before = case_state.read(SimulationAttempt.objects.get(pk=attempt_id))

    risky = DecisionOption.objects.filter(
        source_node_id=node_id,
        response_class="RISKY",  # la clase de la respuesta decide el reintento, no la clasificación antigua
    ).first()
    assert risky is not None

    retry = c.post(
        f"/api/simulation/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": risky.id},
        format="json",
    )
    assert retry.status_code == 200
    assert set(retry.data["data"]) == {"attempt", "consequence", "retry"}
    assert retry.data["data"]["retry"] == {"allowed": True, "message": RETRY_NEUTRAL_MESSAGE}
    retry_state = retry.data["data"]["attempt"]
    assert retry_state["status"] == "IN_PROGRESS"
    assert retry_state["currentNode"]["key"] == node_key
    assert "feedback" not in retry_state
    assert case_state.read(SimulationAttempt.objects.get(pk=attempt_id)) == state_before
    assert AttemptEvent.objects.filter(
        attempt_id=attempt_id,
        event_type="DECISION_RETRY_REQUIRED",
        decision_option_id=risky.id,
    ).exists()

    correct = DecisionOption.objects.filter(
        source_node_id=node_id,
        classification="ADEQUATE",
    ).first()
    assert correct is not None
    advanced = c.post(
        f"/api/simulation/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": correct.id},
        format="json",
    )
    assert advanced.status_code == 200
    assert advanced.data["data"]["attempt"]["currentNode"]["key"] != node_key


@pytest.fixture
def time_passes(monkeypatch):
    """Devuelve ``advance(segundos)``: adelanta el reloj entre dos respuestas deliberadas.

    La misma opción dos veces en menos de 2 s es un doble clic (E1-3) y no gasta la segunda
    oportunidad; las pruebas que simulan una respuesta deliberada dejan pasar el tiempo.
    """
    real_now = timezone.now
    offset = {"seconds": 0}
    monkeypatch.setattr(timezone, "now", lambda: real_now() + timedelta(seconds=offset["seconds"]))

    def advance(seconds):
        offset["seconds"] += seconds

    return advance


def test_second_bad_answer_is_registered_and_advances(estudiante, case_version_id, time_passes):
    """Regla de 2 oportunidades: la 1ª respuesta mala reintenta; la 2ª se registra
    y avanza (queda el registro), aunque siga siendo riesgosa/inadecuada."""
    assign_case_to_student(estudiante, case_version_id, "SIM-2STRIKE")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts",
                   {"caseVersionId": case_version_id, "forceNew": True}, format="json").data["data"]
    attempt_id, token = start["attemptId"], start["attemptToken"]
    node_id, node_key = start["currentNode"]["id"], start["currentNode"]["key"]

    bad = DecisionOption.objects.filter(
        source_node_id=node_id, classification__in=["INADEQUATE", "RISKY"]
    ).first()
    assert bad is not None

    # 1ª respuesta mala -> reintento, no avanza, retryRequired True
    r1 = c.post(f"/api/simulation/attempts/{attempt_id}/decisions",
                {"attemptToken": token, "decisionOptionId": bad.id, "requestId": uuid.uuid4().hex},
                format="json").data["data"]
    assert r1["attempt"]["currentNode"]["key"] == node_key
    assert r1["retry"]["allowed"] is True

    # 2ª respuesta mala (deliberada: pasan unos segundos) -> se registra y avanza, retryRequired False
    time_passes(5)
    r2 = c.post(f"/api/simulation/attempts/{attempt_id}/decisions",
                {"attemptToken": token, "decisionOptionId": bad.id, "requestId": uuid.uuid4().hex},
                format="json").data["data"]
    assert r2["attempt"]["currentNode"]["key"] != node_key
    assert "retry" not in r2
    assert AttemptEvent.objects.filter(
        attempt_id=attempt_id,
        event_type__in=["DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED"],
        decision_option_id=bad.id,
    ).exists()


def test_wrong_token_404(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-WRONG")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    resp = c.get(
        f"/api/simulation/attempts/{start['attemptId']}",
        **attempt_headers("bogus-token"),
    )
    assert resp.status_code == 404


def test_private_attempt_gets_require_header_and_disable_cache(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-PRIVATE-GETS")
    c = cl(estudiante)
    start = c.post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]
    attempt_id, token = start["attemptId"], start["attemptToken"]
    c.post(
        f"/api/simulation/attempts/{attempt_id}/safe-exit",
        {"attemptToken": token, "reason": "comprobar lecturas privadas"},
        format="json",
    )

    for suffix in ("", "/progress-map", "/world", "/completion-report"):
        url = f"/api/simulation/attempts/{attempt_id}{suffix}"
        allowed = c.get(url, **attempt_headers(token))
        assert allowed.status_code == 200
        assert allowed["Cache-Control"] == "no-store"

        query_only = c.get(f"{url}?attemptToken={token}")
        assert query_only.status_code == 400


def test_safe_exit_returns_resources(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-SAFE")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    resp = c.post(
        f"/api/simulation/attempts/{start['attemptId']}/safe-exit",
        {"attemptToken": start["attemptToken"], "reason": "Necesito una pausa"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["message"] == "Pausa segura registrada"
    assert resp.data["data"]["status"] == "PAUSED"
    assert len(resp.data["data"]["supportResources"]) == 3


def test_completion_report_includes_timeline(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-REPORT")
    c = cl(estudiante)
    attempt = c.post("/api/simulation/attempts",
                     {"caseVersionId": case_version_id, "forceNew": True}, format="json").data["data"]
    attempt_id, token = attempt["attemptId"], attempt["attemptToken"]
    option_id = next(
        o for o in attempt["currentNode"]["options"] if classification_of(o) == "ADEQUATE"
    )["id"]
    c.post(f"/api/simulation/attempts/{attempt_id}/decisions",
           {"attemptToken": token, "decisionOptionId": option_id}, format="json")
    c.post(f"/api/simulation/attempts/{attempt_id}/safe-exit",
           {"attemptToken": token, "reason": "test"}, format="json")

    report = c.get(
        f"/api/simulation/attempts/{attempt_id}/completion-report",
        **attempt_headers(token),
    ).data["data"]

    assert "timeline" in report
    decisions = [t for t in report["timeline"]
                 if t["type"] in ("DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED")]
    assert decisions, "la decisión elegida debe aparecer en la línea de tiempo"
    entry = decisions[0]
    assert entry["label"]
    assert entry["classification"] in ("ADEQUATE", "RISKY", "INADEQUATE")
    assert entry["time"].count(":") == 1          # mm:ss
    assert isinstance(entry["scoreDelta"], int)
    assert isinstance(entry["stressDelta"], int)
    assert report["totalDurationSeconds"] is None or report["totalDurationSeconds"] >= 0


def test_attempt_history_lists_own_attempts(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-HIST")
    c = cl(estudiante)
    attempt = c.post("/api/simulation/attempts",
                     {"caseVersionId": case_version_id, "forceNew": True}, format="json").data["data"]
    attempt_id, token = attempt["attemptId"], attempt["attemptToken"]
    option_id = next(
        o for o in attempt["currentNode"]["options"] if classification_of(o) == "ADEQUATE"
    )["id"]
    c.post(f"/api/simulation/attempts/{attempt_id}/decisions",
           {"attemptToken": token, "decisionOptionId": option_id}, format="json")

    resp = c.get("/api/simulation/attempts/history")
    assert resp.status_code == 200
    history = resp.data["data"]
    mine = next((h for h in history if h["attemptId"] == attempt_id), None)
    assert mine is not None
    assert mine["caseVersionId"] == case_version_id
    assert mine["adequateDecisions"] >= 1
    assert "startedAt" in mine
    # Intento en curso: el tiempo activo solo se informa al terminar.
    assert "activeDurationSeconds" in mine
    assert mine["activeDurationSeconds"] is None


def test_attempt_history_active_duration_and_events_only_for_finished_attempts(
    estudiante, case_version_id
):
    """Un intento cerrado informa un tiempo activo entero acotado por el total (del acumulador
    del intento, E1-5), y el de un intento sin terminar es None."""
    assign_case_to_student(estudiante, case_version_id, "SIM-HFIN")
    c = cl(estudiante)
    closed = c.post("/api/simulation/attempts",
                    {"caseVersionId": case_version_id, "forceNew": True}, format="json").data["data"]
    # Iniciar otro con forceNew cierra el anterior (REPLACED con ended_at).
    running = c.post("/api/simulation/attempts",
                     {"caseVersionId": case_version_id, "forceNew": True}, format="json").data["data"]

    with CaptureQueriesContext(connection) as queries:
        resp = c.get("/api/simulation/attempts/history")
    assert resp.status_code == 200
    history = {h["attemptId"]: h for h in resp.data["data"]}

    finished = history[closed["attemptId"]]
    assert finished["status"] == "REPLACED"
    active = finished["activeDurationSeconds"]
    assert isinstance(active, int) and not isinstance(active, bool)
    assert 0 <= active <= finished["totalDurationSeconds"] + 1

    unfinished = history[running["attemptId"]]
    assert unfinished["status"] == "IN_PROGRESS"
    assert unfinished["activeDurationSeconds"] is None

    # Desde E1-5 el tiempo activo sale del acumulador: ninguna consulta LEE event_type de
    # attempt_events (la de conteos de decisiones lo usa solo para filtrar, no lo selecciona).
    marks_sql = [
        q["sql"] for q in queries.captured_queries
        if '"attempt_events"."event_type"' in q["sql"].split(" FROM ")[0]
    ]
    assert marks_sql == [], "el historial ya no recorre los eventos para calcular el tiempo activo"


def test_student_report_returns_completion_report(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-SREPORT")
    c = cl(estudiante)
    attempt = c.post("/api/simulation/attempts",
                     {"caseVersionId": case_version_id, "forceNew": True}, format="json").data["data"]
    attempt_id, token = attempt["attemptId"], attempt["attemptToken"]
    c.post(f"/api/simulation/attempts/{attempt_id}/safe-exit",
           {"attemptToken": token, "reason": "test"}, format="json")

    resp = c.get(f"/api/simulation/attempts/{attempt_id}/student-report")
    assert resp.status_code == 200
    report = resp.data["data"]
    assert report["attemptId"] == attempt_id
    assert "timeline" in report and "metrics" in report


def test_student_report_denies_other_students(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-SREPORT2")
    owner_client = cl(estudiante)
    attempt = owner_client.post("/api/simulation/attempts",
                                {"caseVersionId": case_version_id, "forceNew": True}, format="json").data["data"]
    other = User.objects.create_user(
        email="otro_est@x.com", password="x", nombre="Otro", apellido="Est", role="ESTUDIANTE"
    )
    resp = cl(other).get(f"/api/simulation/attempts/{attempt['attemptId']}/student-report")
    assert resp.status_code == 403


# ─── T11.5: el JSON del nodo no revela la clasificación (límite 1) ───────────
def test_node_options_only_expose_id_and_text(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-NODEJSON")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]

    options = start["currentNode"]["options"]
    assert len(options) >= 2
    for option in options:
        assert set(option) == {"id", "text"}
    node_json = json.dumps(start["currentNode"])
    assert "classification" not in node_json
    assert "prohibitedConduct" not in node_json

    # El estado que devuelve cualquier otro endpoint del jugador tampoco la trae.
    again = c.get(
        f"/api/simulation/attempts/{start['attemptId']}", **attempt_headers(start["attemptToken"])
    ).data["data"]
    assert all(set(o) == {"id", "text"} for o in again["currentNode"]["options"])

    # Tras elegir, tampoco: la respuesta es solo la consecuencia (la clase llega en el reporte de cierre).
    option = next(o for o in options if classification_of(o) == "ADEQUATE")
    decided = c.post(
        f"/api/simulation/attempts/{start['attemptId']}/decisions",
        {"attemptToken": start["attemptToken"], "decisionOptionId": option["id"]},
        format="json",
    ).data["data"]
    assert set(decided) == {"attempt", "consequence"}
    assert "classification" not in json.dumps(decided)
    assert "prohibitedConduct" not in json.dumps(decided)


# ─── T11.1: los reintentos no cuentan como decisiones ────────────────────────
def _world(c, attempt_id, token):
    return c.get(f"/api/simulation/attempts/{attempt_id}/world", **attempt_headers(token))


def _decide(c, attempt_id, token, case_version_id, option_key):
    option = DecisionOption.objects.get(case_version_id=case_version_id, option_key=option_key)
    # Respuesta deliberada: lleva su requestId como el cliente real (E1-3); sin él, la misma opción
    # dos veces en menos de 2 s es un doble clic y no gasta la segunda oportunidad.
    resp = c.post(
        f"/api/simulation/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": option.id, "requestId": uuid.uuid4().hex},
        format="json",
    )
    assert resp.status_code == 200, f"{option_key}: {resp.data}"
    return resp.data["data"]["attempt"]


def test_retries_do_not_lower_report_or_force_critical_ending(estudiante, case_version_id):
    """DLG-07: dos primeras respuestas críticas (que el juego NO aplica) más seis
    decisiones correctas dan el Final 1 y ninguna crítica registrada."""
    assign_case_to_student(estudiante, case_version_id, "SIM-RETRYEND")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    attempt_id, token = start["attemptId"], start["attemptToken"]
    assert _world(c, attempt_id, token).status_code == 200  # materializa el estado del caso

    state = None
    for key in (
        "h1-interrogar-victima", "h1-pap-contencion",
        "h2-459-1257", "h3-integral-psicosocial",
        "c1-mediacion-perdon", "c1-riesgo-proteccion-derechos",
        "c2-2126-1098-1257", "c3-integral-derechos",
    ):
        state = _decide(c, attempt_id, token, case_version_id, key)

    assert state["status"] == "COMPLETED"
    report = state["completionReport"]
    # (El final y sus conteos por severidad se vuelven a probar con el motor de finales, Tarea 6.)

    # El reporte cuenta solo lo registrado y muestra los reintentos aparte.
    assert report["adequateDecisions"] == 6
    assert report["riskyDecisions"] == 0
    assert report["inadequateDecisions"] == 0
    assert report["prohibitedDecisions"] == 0
    assert report["retries"] == 2
    retry_events = [t for t in report["timeline"] if t["type"].endswith("RETRY_REQUIRED")]
    assert len(retry_events) == 2  # la trazabilidad conserva el reintento


def test_report_recommends_reviewing_a_reconsidered_answer_without_counting_it(estudiante, case_version_id):
    """L-03: una primera respuesta prohibida que el juego no aplicó queda en la recomendación del cierre
    (el estudiante ve que reconsideró algo), sin contarla como decisión ni bajar el desempeño."""
    assign_case_to_student(estudiante, case_version_id, "SIM-RETRYREC")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    attempt_id, token = start["attemptId"], start["attemptToken"]
    assert _world(c, attempt_id, token).status_code == 200

    _decide(c, attempt_id, token, case_version_id, "h1-interrogar-victima")  # prohibida: reintento
    _decide(c, attempt_id, token, case_version_id, "h1-pap-contencion")      # la adecuada se registra
    c.post(f"/api/simulation/attempts/{attempt_id}/safe-exit",
           {"attemptToken": token, "reason": "test"}, format="json")

    report = c.get(
        f"/api/simulation/attempts/{attempt_id}/completion-report", **attempt_headers(token)
    ).data["data"]
    assert report["retries"] == 1
    assert report["prohibitedRetries"] == 1
    assert "Reconsideraste 1 respuesta antes de decidir; revísala con tu docente." in report["recommendations"]
    # No son decisiones: los contadores y el final no cambian.
    assert report["prohibitedDecisions"] == 0
    assert report["inadequateDecisions"] == 0
    assert report["adequateDecisions"] == 1


def test_report_recommendation_is_plural_and_replaces_the_generic_closing_one(estudiante, case_version_id):
    """Con varias reconsideraciones la recomendación va en plural y el cierre genérico («Consolida el
    aprendizaje…») ya no es la única huella: el estudiante ve que reconsideró respuestas."""
    assign_case_to_student(estudiante, case_version_id, "SIM-RETRYPLURAL")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    attempt_id, token = start["attemptId"], start["attemptToken"]
    assert _world(c, attempt_id, token).status_code == 200

    bad_keys = ("h1-interrogar-victima", "c1-mediacion-perdon")
    state = None
    for key in (
        "h1-interrogar-victima", "h1-pap-contencion",
        "h2-459-1257", "h3-integral-psicosocial",
        "c1-mediacion-perdon", "c1-riesgo-proteccion-derechos",
        "c2-2126-1098-1257", "c3-integral-derechos",
    ):
        state = _decide(c, attempt_id, token, case_version_id, key)

    assert state["status"] == "COMPLETED"
    report = state["completionReport"]
    assert report["retries"] == 2
    expected_prohibited = sum(
        1 for key in bad_keys
        if DecisionOption.objects.get(case_version_id=case_version_id, option_key=key).prohibited_conduct
    )
    assert report["prohibitedRetries"] == expected_prohibited
    assert report["recommendations"] == ["Reconsideraste 2 respuestas antes de decidir; revísalas con tu docente."]
    assert report["adequateDecisions"] == 6  # reconsiderar no resta ni suma decisiones


def test_report_without_retries_has_no_reconsideration_recommendation(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-NORETRYREC")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    attempt_id, token = start["attemptId"], start["attemptToken"]
    c.post(f"/api/simulation/attempts/{attempt_id}/safe-exit",
           {"attemptToken": token, "reason": "test"}, format="json")
    report = c.get(
        f"/api/simulation/attempts/{attempt_id}/completion-report", **attempt_headers(token)
    ).data["data"]
    assert report["retries"] == 0
    assert report["prohibitedRetries"] == 0
    assert not any("Reconsideraste" in text for text in report["recommendations"])


def test_report_reports_zero_retries_when_none_happened(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-NORETRY")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    attempt_id, token = start["attemptId"], start["attemptToken"]
    c.post(f"/api/simulation/attempts/{attempt_id}/safe-exit",
           {"attemptToken": token, "reason": "test"}, format="json")
    report = c.get(
        f"/api/simulation/attempts/{attempt_id}/completion-report", **attempt_headers(token)
    ).data["data"]
    assert report["retries"] == 0


def test_second_bad_answer_still_counts_as_registered_decision(estudiante, case_version_id, time_passes):
    """La regla de reintento no cambia: la 2.ª respuesta mala sí queda registrada y cuenta."""
    assign_case_to_student(estudiante, case_version_id, "SIM-2NDCOUNTS")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    attempt_id, token = start["attemptId"], start["attemptToken"]
    assert _world(c, attempt_id, token).status_code == 200

    _decide(c, attempt_id, token, case_version_id, "h1-interrogar-victima")  # reintento
    time_passes(5)  # una respuesta deliberada, no un doble clic
    _decide(c, attempt_id, token, case_version_id, "h1-interrogar-victima")  # registrada
    c.post(f"/api/simulation/attempts/{attempt_id}/safe-exit",
           {"attemptToken": token, "reason": "test"}, format="json")

    report = c.get(
        f"/api/simulation/attempts/{attempt_id}/completion-report", **attempt_headers(token)
    ).data["data"]
    assert report["retries"] == 1
    assert report["prohibitedDecisions"] == 1
    assert report["inadequateDecisions"] == 1


def test_attempt_history_does_not_count_retries(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-HISTRETRY")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts",
                   {"caseVersionId": case_version_id, "forceNew": True}, format="json").data["data"]
    attempt_id, token = start["attemptId"], start["attemptToken"]
    assert _world(c, attempt_id, token).status_code == 200
    _decide(c, attempt_id, token, case_version_id, "h1-interrogar-victima")  # solo reintento

    history = c.get("/api/simulation/attempts/history").data["data"]
    mine = next(h for h in history if h["attemptId"] == attempt_id)
    assert mine["prohibitedDecisions"] == 0
    assert mine["inadequateDecisions"] == 0
    assert mine["adequateDecisions"] == 0
