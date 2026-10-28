"""Reemplazar un intento (forceNew) no es una salida segura (ETH-02).

Desde la pausa reanudable, la salida segura deja el intento en PAUSED y el único
código que escribe SAFE_EXITED es el reemplazo con forceNew, que además registra
SAFE_EXIT_REQUESTED. Estas pruebas fijan el contrato que debe cumplirse sin
importar cómo se modele el reemplazo (evento propio o estado propio):

- el reemplazo cierra el intento como REPLACED y deja su propio evento
  (ATTEMPT_REPLACED), sin rastro de salida segura;
- el reporte docente cuenta como «salida segura» los intentos que la usaron;
- las salidas seguras terminales anteriores a la pausa (SAFE_EXITED) se
  conservan tal cual: cuentan como salida segura.
"""
import uuid

import pytest

from django.utils import timezone

from apps.simulation.models import AttemptEvent, SimulationAttempt, SimulationNode
from apps.simulation.services import game_service

from .test_reportes import (  # noqa: F401
    _add_student,
    _assign_case,
    _grupo,
    case_version_id,
    cl,
    estudiante,
    profesor,
)

pytestmark = pytest.mark.usefixtures("fetch_raise")  # DJA-7: un acceso perezoso accidental lanza


def _setup(profesor, estudiante, case_version_id):
    grupo = _grupo(profesor)
    _add_student(grupo, estudiante)
    _assign_case(grupo, case_version_id)
    return grupo


def _start(client, case_version_id, force_new=False):
    payload = {"caseVersionId": case_version_id}
    if force_new:
        payload["forceNew"] = True
    resp = client.post("/api/simulation/attempts", payload, format="json")
    assert resp.status_code == 200
    return resp.data["data"]


def _pause(client, attempt):
    resp = client.post(
        f"/api/simulation/attempts/{attempt['attemptId']}/safe-exit",
        {"attemptToken": attempt["attemptToken"], "reason": "Necesito parar"},
        format="json",
    )
    assert resp.status_code == 200
    return resp.data["data"]


def _closed_attempt(estudiante, case_version_id, status):
    return SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex,
        case_version_id=case_version_id,
        student_id=estudiante.id,
        current_node=SimulationNode.objects.filter(
            case_version_id=case_version_id, start_node=True
        ).first(),
        status=status,
        ended_at=timezone.now(),
    )


def _reporte(profesor, grupo, case_version_id):
    sim = cl(profesor).get(
        f"/api/reportes/grupo/{grupo.id}?caseVersionId={case_version_id}"
    ).data["data"]["simulacion"]
    mine = next(e for e in sim["estudiantes"] if e["nombre"] == "Est Rep")
    return sim, mine


def test_reemplazo_no_registra_salida_segura(profesor, estudiante, case_version_id):
    _setup(profesor, estudiante, case_version_id)
    c = cl(estudiante)
    old = _start(c, case_version_id)
    _start(c, case_version_id, force_new=True)

    assert not AttemptEvent.objects.filter(
        attempt_id=old["attemptId"], event_type="SAFE_EXIT_REQUESTED"
    ).exists(), "el estudiante no pidió salida segura; solo empezó otro intento"
    report = game_service.get_student_report(old["attemptId"], estudiante)
    assert report["safeExitUsed"] is False


def test_intento_reemplazado_se_reporta_como_reemplazo(
    profesor, estudiante, case_version_id
):
    _setup(profesor, estudiante, case_version_id)
    c = cl(estudiante)
    old = _start(c, case_version_id)
    _start(c, case_version_id, force_new=True)

    state = game_service.get_attempt(old["attemptId"], old["attemptToken"], estudiante)
    assert state["status"] == "REPLACED"
    assert state["supportResources"] == [], "nadie pidió apoyo: no es una salida segura"
    assert state["completionReport"] is None, "el estado de un intento sin completar no trae el reporte en vivo"
    report = game_service.get_student_report(old["attemptId"], estudiante)
    assert "reemplaz" in report["summaryMessage"].lower()
    assert "salida segura" not in report["summaryMessage"].lower()
    assert "timeline" not in report  # un intento sin cerrar solo recibe el resumen: sin línea de tiempo ni clases


def test_reporte_no_cuenta_reemplazo_como_salida_segura(
    profesor, estudiante, case_version_id
):
    grupo = _setup(profesor, estudiante, case_version_id)
    c = cl(estudiante)
    _start(c, case_version_id)
    _start(c, case_version_id, force_new=True)

    sim, mine = _reporte(profesor, grupo, case_version_id)
    assert sim["totalIntentos"] == 2
    assert sim["intentosSalidaSegura"] == 0
    assert mine["intentosSalidaSegura"] == 0


def test_reporte_muestra_salida_segura_real(profesor, estudiante, case_version_id):
    grupo = _setup(profesor, estudiante, case_version_id)
    c = cl(estudiante)
    _pause(c, _start(c, case_version_id))

    sim, mine = _reporte(profesor, grupo, case_version_id)
    assert sim["intentosSalidaSegura"] == 1, "la pausa ES la salida segura real"
    assert mine["intentosSalidaSegura"] == 1
    assert mine["estado"] == "EN_PAUSA"


def test_pausa_luego_reemplazada_cuenta_como_salida_segura(
    profesor, estudiante, case_version_id
):
    grupo = _setup(profesor, estudiante, case_version_id)
    c = cl(estudiante)
    old = _start(c, case_version_id)
    _pause(c, old)
    _start(c, case_version_id, force_new=True)

    sim, mine = _reporte(profesor, grupo, case_version_id)
    assert sim["intentosSalidaSegura"] == 1, "la pausa ocurrió aunque luego se reemplazara"
    assert mine["intentosSalidaSegura"] == 1
    assert mine["estado"] == "EN_PROGRESO"


def test_salida_segura_historica_se_conserva(profesor, estudiante, case_version_id):
    """Decisión 2026-10-01: las SAFE_EXITED reales (previas a la pausa) no cambian."""
    grupo = _setup(profesor, estudiante, case_version_id)
    legacy = _closed_attempt(estudiante, case_version_id, "SAFE_EXITED")
    AttemptEvent.objects.create(
        attempt=legacy,
        event_type="SAFE_EXIT_REQUESTED",
        node=legacy.current_node,
        detail="Salida segura solicitada",
    )

    sim, mine = _reporte(profesor, grupo, case_version_id)
    assert sim["intentosSalidaSegura"] == 1
    assert mine["estado"] == "SAFE_EXITED"
