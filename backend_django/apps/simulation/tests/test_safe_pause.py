"""ETH-02 (opción A aprobada): la salida segura es una pausa reanudable real.

Contrato:
- safe-exit deja el intento en PAUSED sin ended_at/locked_at y sin bloquear
  reflexiones;
- en pausa no se aceptan mutaciones (decisiones, bitácora, posición);
- resume reanuda el MISMO attemptId conservando nodo y métricas;
- pausa y reanudación son idempotentes y auditables;
- forzar un intento nuevo cierra el pausado de forma terminal y honesta;
- los intentos pausados no puntúan en reportes.
"""
from django.contrib.auth import get_user_model

from apps.reportes.services import SCORED_STATUSES, _estudiante_sim_dto
from apps.simulation.models import AttemptEvent, ReflectionJournal, SimulationAttempt

from .test_game import assign_case_to_student, case_version_id, cl, estudiante  # noqa: F401

User = get_user_model()


def _start(client, case_version_id, force_new=False):
    payload = {"caseVersionId": case_version_id}
    if force_new:
        payload["forceNew"] = True
    resp = client.post("/api/simulation/attempts", payload, format="json")
    assert resp.status_code == 200
    return resp.data["data"]


def _pause(client, attempt_id, token, reason="Pausa solicitada"):
    return client.post(
        f"/api/simulation/attempts/{attempt_id}/safe-exit",
        {"attemptToken": token, "reason": reason},
        format="json",
    )


def _resume(client, attempt_id, token):
    return client.post(
        f"/api/simulation/attempts/{attempt_id}/resume",
        {"attemptToken": token},
        format="json",
    )


def test_safe_exit_pausa_sin_cierre(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "PAUSE-1")
    c = cl(estudiante)
    start = _start(c, case_version_id)

    resp = _pause(c, start["attemptId"], start["attemptToken"])
    assert resp.status_code == 200
    assert resp.data["data"]["status"] == "PAUSED"
    assert resp.data["data"]["supportResources"], "la pausa ofrece recursos de apoyo"

    row = SimulationAttempt.objects.get(pk=start["attemptId"])
    assert row.status == "PAUSED"
    assert row.ended_at is None
    assert row.locked_at is None


def test_safe_exit_idempotente(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "PAUSE-2")
    c = cl(estudiante)
    start = _start(c, case_version_id)

    first = _pause(c, start["attemptId"], start["attemptToken"])
    second = _pause(c, start["attemptId"], start["attemptToken"])
    assert first.status_code == 200 and second.status_code == 200
    assert second.data["data"]["status"] == "PAUSED"
    events = AttemptEvent.objects.filter(
        attempt_id=start["attemptId"], event_type="SAFE_EXIT_REQUESTED"
    ).count()
    assert events == 1


def test_pausa_no_bloquea_reflexiones_permanentemente(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "PAUSE-3")
    c = cl(estudiante)
    start = _start(c, case_version_id)
    node_id = start["currentNode"]["id"]

    r = c.post(
        f"/api/simulation/attempts/{start['attemptId']}/reflections",
        {"attemptToken": start["attemptToken"], "nodeId": node_id, "text": "antes de la pausa"},
        format="json",
    )
    assert r.status_code == 200 and r.data["data"]["locked"] is False

    _pause(c, start["attemptId"], start["attemptToken"])
    refl = ReflectionJournal.objects.get(attempt_id=start["attemptId"], node_id=node_id)
    assert refl.locked is False, "la pausa no bloquea la bitácora de forma permanente"

    _resume(c, start["attemptId"], start["attemptToken"])
    again = c.post(
        f"/api/simulation/attempts/{start['attemptId']}/reflections",
        {"attemptToken": start["attemptToken"], "nodeId": node_id, "text": "después de reanudar"},
        format="json",
    )
    assert again.status_code == 200 and again.data["data"]["locked"] is False


def test_mutaciones_bloqueadas_en_pausa(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "PAUSE-4")
    c = cl(estudiante)
    start = _start(c, case_version_id)
    _pause(c, start["attemptId"], start["attemptToken"])

    option_id = start["currentNode"]["options"][0]["id"]
    decision = c.post(
        f"/api/simulation/attempts/{start['attemptId']}/decisions",
        {"attemptToken": start["attemptToken"], "decisionOptionId": option_id},
        format="json",
    )
    assert decision.status_code == 400

    reflection = c.post(
        f"/api/simulation/attempts/{start['attemptId']}/reflections",
        {"attemptToken": start["attemptToken"], "nodeId": start["currentNode"]["id"], "text": "x"},
        format="json",
    )
    assert reflection.status_code == 400

    position = c.patch(
        f"/api/simulation/attempts/{start['attemptId']}/world-state",
        {"attemptToken": start["attemptToken"], "playerX": 10, "playerY": 10},
        format="json",
    )
    assert position.status_code == 400

    assert not AttemptEvent.objects.filter(
        attempt_id=start["attemptId"], decision_option__isnull=False
    ).exists()


def test_resume_conserva_estado_y_audita(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "PAUSE-5")
    c = cl(estudiante)
    start = _start(c, case_version_id)
    _pause(c, start["attemptId"], start["attemptToken"])

    resp = _resume(c, start["attemptId"], start["attemptToken"])
    assert resp.status_code == 200
    data = resp.data["data"]
    assert data["attemptId"] == start["attemptId"], "reanuda el MISMO intento"
    assert data["status"] == "IN_PROGRESS"
    assert data["currentNode"]["key"] == start["currentNode"]["key"]
    assert data["accumulatedScore"] == start["accumulatedScore"]

    assert AttemptEvent.objects.filter(
        attempt_id=start["attemptId"], event_type="ATTEMPT_RESUMED"
    ).count() == 1
    row = SimulationAttempt.objects.get(pk=start["attemptId"])
    assert row.ended_at is None and row.locked_at is None


def test_resume_idempotente(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "PAUSE-6")
    c = cl(estudiante)
    start = _start(c, case_version_id)
    _pause(c, start["attemptId"], start["attemptToken"])

    first = _resume(c, start["attemptId"], start["attemptToken"])
    second = _resume(c, start["attemptId"], start["attemptToken"])
    assert first.status_code == 200 and second.status_code == 200
    assert second.data["data"]["status"] == "IN_PROGRESS"
    assert AttemptEvent.objects.filter(
        attempt_id=start["attemptId"], event_type="ATTEMPT_RESUMED"
    ).count() == 1


def test_resume_intento_ajeno_rechazado(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "PAUSE-7")
    c = cl(estudiante)
    start = _start(c, case_version_id)
    _pause(c, start["attemptId"], start["attemptToken"])

    otra = User.objects.create_user(
        email="otra_est@x.com", password="pass1234", nombre="Otra", apellido="Est", role="ESTUDIANTE"
    )
    resp = _resume(cl(otra), start["attemptId"], start["attemptToken"])
    assert resp.status_code in (403, 404)
    assert SimulationAttempt.objects.get(pk=start["attemptId"]).status == "PAUSED"


def test_active_attempt_incluye_pausado(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "PAUSE-8")
    c = cl(estudiante)
    start = _start(c, case_version_id)
    _pause(c, start["attemptId"], start["attemptToken"])

    resp = c.get(f"/api/simulation/cases/{case_version_id}/active-attempt")
    assert resp.status_code == 200
    assert resp.data["data"]["attemptId"] == start["attemptId"]
    assert resp.data["data"]["status"] == "PAUSED"


def test_start_sin_force_devuelve_pausado_sin_duplicar(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "PAUSE-9")
    c = cl(estudiante)
    start = _start(c, case_version_id)
    _pause(c, start["attemptId"], start["attemptToken"])

    again = _start(c, case_version_id)
    assert again["attemptId"] == start["attemptId"]
    assert again["status"] == "PAUSED"
    assert SimulationAttempt.objects.filter(
        student_id=estudiante.id, case_version_id=case_version_id
    ).count() == 1


def test_force_new_cierra_pausado_terminal(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "PAUSE-10")
    c = cl(estudiante)
    start = _start(c, case_version_id)
    _pause(c, start["attemptId"], start["attemptToken"])

    fresh = _start(c, case_version_id, force_new=True)
    assert fresh["attemptId"] != start["attemptId"]

    old = SimulationAttempt.objects.get(pk=start["attemptId"])
    assert old.status == "REPLACED", "el reemplazo cierra el intento de forma terminal"
    assert old.ended_at is not None
    events = list(
        AttemptEvent.objects.filter(attempt_id=start["attemptId"])
        .exclude(event_type__in=["ATTEMPT_STARTED", "NODE_ENTERED"])
        .values_list("event_type", flat=True)
    )
    assert events == ["SAFE_EXIT_REQUESTED", "ATTEMPT_REPLACED"], (
        "la pausa real se conserva y el reemplazo deja su propio evento"
    )


def test_reporte_pausado_es_honesto(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "PAUSE-11")
    c = cl(estudiante)
    start = _start(c, case_version_id)
    resp = _pause(c, start["attemptId"], start["attemptToken"])

    # El estado de la pausa no trae el reporte en vivo (traía clases y conteos de las decisiones): el estudiante
    # solo lo lee, honesto, por su endpoint de reporte.
    assert resp.data["data"]["completionReport"] is None
    report = c.get(
        f"/api/simulation/attempts/{start['attemptId']}/completion-report",
        HTTP_X_SIEP_ATTEMPT_TOKEN=start["attemptToken"],
    ).data["data"]
    assert report["status"] == "PAUSED"
    assert report["safeExitUsed"] is True
    assert report["totalDurationSeconds"] is None, "la pausa no fija duración final"
    assert "pausa" in report["summaryMessage"].lower()


def test_pausados_excluidos_del_score_docente(estudiante, case_version_id):
    assert "PAUSED" not in SCORED_STATUSES

    paused = SimulationAttempt(status="PAUSED", accumulated_score=80)
    completed = SimulationAttempt(status="COMPLETED", accumulated_score=40)
    dto = _estudiante_sim_dto(estudiante, [paused, completed])
    assert dto["puntajePromedio"] == 40.0, "el intento pausado no contamina el promedio"
    assert dto["intentosEnPausa"] == 1
