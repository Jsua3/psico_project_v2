"""A-03a — Cómo cuentan los reportes cada estado del intento.

La mutación de A-03a mostró que cambiar el estado que cuenta cada contador del
tablero o del reporte de grupo no rompía ninguna prueba. Estas fijan, con los
estados escritos como texto, qué cuenta cada contador y cómo se resume el estado
de un estudiante. No usan eventos de salida segura: los estados históricos
cuentan por sí solos.
"""
import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.reportes.services import _estudiante_sim_dto
from apps.simulation.models import SimulationAttempt, SimulationNode

from .test_reportes import (  # noqa: F401
    _add_student, _assign_case, _grupo, case_version_id, cl, estudiante, profesor,
)

SCORED = ("COMPLETED", "SAFE_EXITED")


def _attempt(estudiante, case_version_id, status, score=0, ended_at=None):
    return SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex,
        case_version_id=case_version_id,
        student_id=estudiante.id,
        current_node=SimulationNode.objects.filter(case_version_id=case_version_id, start_node=True).first(),
        status=status,
        accumulated_score=score,
        ended_at=ended_at,
    )


def _mixed_attempts(estudiante, case_version_id):
    """1 en progreso, 2 en pausa, 3 completados (uno de ayer), 1 salida segura histórica, 1 reemplazo."""
    now = timezone.now()
    _attempt(estudiante, case_version_id, "IN_PROGRESS", score=10)
    _attempt(estudiante, case_version_id, "PAUSED", score=11)
    _attempt(estudiante, case_version_id, "PAUSED", score=12)
    _attempt(estudiante, case_version_id, "COMPLETED", score=30, ended_at=now)
    _attempt(estudiante, case_version_id, "COMPLETED", score=50, ended_at=now)
    _attempt(estudiante, case_version_id, "COMPLETED", score=70, ended_at=now - timedelta(days=1))
    _attempt(estudiante, case_version_id, "SAFE_EXITED", score=20, ended_at=now)
    _attempt(estudiante, case_version_id, "REPLACED", score=99, ended_at=now)


def test_el_tablero_cuenta_cada_estado_por_separado(profesor, estudiante, case_version_id):
    before = cl(profesor).get("/api/reportes/dashboard").data["data"]

    _mixed_attempts(estudiante, case_version_id)

    after = cl(profesor).get("/api/reportes/dashboard").data["data"]
    assert after["simulacionesEnProgreso"] - before["simulacionesEnProgreso"] == 1
    assert after["simulacionesCompletadas"] - before["simulacionesCompletadas"] == 3
    assert after["simulacionesCompletadasHoy"] - before["simulacionesCompletadasHoy"] == 2


def test_el_promedio_del_tablero_solo_usa_completados_y_salidas_seguras(profesor, estudiante, case_version_id):
    _mixed_attempts(estudiante, case_version_id)
    scores = list(
        SimulationAttempt.objects.filter(status__in=SCORED).values_list("accumulated_score", flat=True)
    )

    data = cl(profesor).get("/api/reportes/dashboard").data["data"]

    assert data["puntajePromedioGlobal"] == pytest.approx(sum(scores) / len(scores))
    assert 99 not in scores and 10 not in scores   # el reemplazo y el intento en juego no puntúan


def test_el_reporte_de_grupo_cuenta_cada_estado_por_separado(profesor, estudiante, case_version_id):
    grupo = _grupo(profesor)
    _add_student(grupo, estudiante)
    _assign_case(grupo, case_version_id)
    _mixed_attempts(estudiante, case_version_id)

    sim = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}?caseVersionId={case_version_id}").data["data"]["simulacion"]
    mine = next(e for e in sim["estudiantes"] if e["nombre"] == "Est Rep")

    for block in (sim, mine):
        assert block["totalIntentos"] == 8
        assert block["intentosCompletados"] == 3
        assert block["intentosEnProgreso"] == 1
        assert block["intentosEnPausa"] == 2
        assert block["intentosSalidaSegura"] == 1   # la histórica, sin evento: cuenta por su estado
        assert block["puntajePromedio"] == pytest.approx((30 + 50 + 70 + 20) / 4)


def _attempts(*statuses):
    return [SimulationAttempt(status=s, accumulated_score=10) for s in statuses]


@pytest.mark.parametrize(
    "statuses, estado",
    [
        (["IN_PROGRESS", "PAUSED", "COMPLETED"], "EN_PROGRESO"),
        (["PAUSED", "COMPLETED"], "EN_PAUSA"),
        (["COMPLETED", "SAFE_EXITED"], "COMPLETADO"),
        (["SAFE_EXITED", "REPLACED"], "SAFE_EXITED"),
        (["REPLACED"], "PENDIENTE"),
        ([], "PENDIENTE"),
    ],
)
def test_el_estado_del_estudiante_sigue_esta_precedencia(estudiante, statuses, estado):
    dto = _estudiante_sim_dto(estudiante, _attempts(*statuses))

    assert dto["estado"] == estado


def test_los_contadores_del_estudiante_distinguen_cada_estado(estudiante):
    dto = _estudiante_sim_dto(
        estudiante, _attempts("COMPLETED", "COMPLETED", "IN_PROGRESS", "PAUSED", "PAUSED", "PAUSED", "REPLACED")
    )

    assert (dto["intentosCompletados"], dto["intentosEnProgreso"], dto["intentosEnPausa"]) == (2, 1, 3)
    assert dto["totalIntentos"] == 7
