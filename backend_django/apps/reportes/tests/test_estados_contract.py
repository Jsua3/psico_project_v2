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
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.reportes.services import _estudiante_sim_dto
from apps.simulation.models import SimulationAttempt, SimulationNode

from .test_reportes import (  # noqa: F401
    _add_student, _assign_case, _grupo, case_version_id, cl, estudiante, profesor,
)

pytestmark = pytest.mark.usefixtures("fetch_raise")  # DJA-7: un acceso perezoso accidental lanza

User = get_user_model()


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


def _mixed_attempts(estudiante, case_version_id, grupo=None):
    """1 en progreso, 3 completados (uno de ayer), 1 salida segura histórica y 1 reemplazo del
    estudiante; más 2 en pausa de otros dos estudiantes del grupo (DM-5.4: un estudiante no puede
    tener dos intentos abiertos del mismo caso, así que las pausas son de personas distintas)."""
    now = timezone.now()
    _attempt(estudiante, case_version_id, "IN_PROGRESS", score=10)
    for n, score in enumerate((11, 12)):
        otro = User.objects.create_user(
            email=f"pausa{n}_{uuid.uuid4().hex[:6]}@x.com", password="pass1234",
            nombre="Otro", apellido=f"Pausa{n}", role="ESTUDIANTE",
        )
        if grupo is not None:
            _add_student(grupo, otro)
        _attempt(otro, case_version_id, "PAUSED", score=score)
    _attempt(estudiante, case_version_id, "COMPLETED", score=30, ended_at=now)
    _attempt(estudiante, case_version_id, "COMPLETED", score=50, ended_at=now)
    _attempt(estudiante, case_version_id, "COMPLETED", score=70, ended_at=now - timedelta(days=1))
    _attempt(estudiante, case_version_id, "SAFE_EXITED", score=20, ended_at=now)
    _attempt(estudiante, case_version_id, "REPLACED", score=99, ended_at=now)


def test_el_tablero_cuenta_cada_estado_por_separado(profesor, estudiante, case_version_id):
    grupo = _grupo(profesor)
    _add_student(grupo, estudiante)  # el tablero es del docente: sus estudiantes
    before = cl(profesor).get("/api/reportes/dashboard").data["data"]

    _mixed_attempts(estudiante, case_version_id, grupo)

    after = cl(profesor).get("/api/reportes/dashboard").data["data"]
    assert after["simulacionesEnProgreso"] - before["simulacionesEnProgreso"] == 1
    assert after["simulacionesCompletadas"] - before["simulacionesCompletadas"] == 3
    assert after["simulacionesCompletadasHoy"] - before["simulacionesCompletadasHoy"] == 2


def test_el_reporte_de_grupo_cuenta_cada_estado_por_separado(profesor, estudiante, case_version_id):
    grupo = _grupo(profesor)
    _add_student(grupo, estudiante)
    _assign_case(grupo, case_version_id)
    _mixed_attempts(estudiante, case_version_id, grupo)

    sim = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}?caseVersionId={case_version_id}").data["data"]["simulacion"]
    mine = next(e for e in sim["estudiantes"] if e["nombre"] == "Est Rep")

    # El grupo suma los 6 intentos del estudiante y las 2 pausas de sus compañeros; cada
    # estudiante ve solo lo suyo (las pausas no son de «Est Rep»).
    for block, total, pausas in ((sim, 8, 2), (mine, 6, 0)):
        assert block["totalIntentos"] == total
        assert block["intentosCompletados"] == 3
        assert block["intentosEnProgreso"] == 1
        assert block["intentosEnPausa"] == pausas
        assert block["intentosSalidaSegura"] == 1   # la histórica, sin evento: cuenta por su estado
        assert "puntajePromedio" not in block and "decisionesAdecuadas" not in block


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
