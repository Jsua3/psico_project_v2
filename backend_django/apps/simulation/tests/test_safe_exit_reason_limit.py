"""El motivo escrito de una salida segura tiene tope, y el tope recorta: nunca impide la pausa (S3-4, REGLA-004, RNF-003).

El motivo es texto libre de la persona y se guarda en el detalle del evento ``SAFE_EXIT_REQUESTED``. Sin tope, una persona
podía guardar hasta el máximo del cuerpo en cada pausa; con un tope que rechaza, un motivo largo habría dejado sin pausa a quien
la necesita. Por eso el servidor lo recorta a ``SAFE_EXIT_REASON_MAX``.
"""
import pytest

from apps.reportes.tests.test_reportes import (  # noqa: F401
    _add_student,
    _assign_case,
    _grupo,
    case_version_id,
    cl,
    estudiante,
    profesor,
)
from apps.simulation.models import AttemptEvent, SimulationAttempt
from apps.simulation.services import game_service

pytestmark = [pytest.mark.req("RNF-003"), pytest.mark.security]


def _pausar(profesor, estudiante, case_version_id, motivo):
    """Empieza un intento y pide la salida segura con ``motivo``. Devuelve (respuesta, id del intento)."""
    grupo = _grupo(profesor)
    _add_student(grupo, estudiante)
    _assign_case(grupo, case_version_id)
    cliente = cl(estudiante)
    inicio = cliente.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json")
    assert inicio.status_code == 200, inicio.data
    intento = inicio.data["data"]
    respuesta = cliente.post(
        f"/api/simulation/attempts/{intento['attemptId']}/safe-exit",
        {"attemptToken": intento["attemptToken"], "reason": motivo},
        format="json",
    )
    return respuesta, intento["attemptId"]


def _detalle(intento_id):
    return AttemptEvent.objects.get(attempt_id=intento_id, event_type="SAFE_EXIT_REQUESTED").detail


@pytest.mark.django_db
def test_un_motivo_larguisimo_no_impide_la_pausa_y_se_recorta(profesor, estudiante, case_version_id):
    respuesta, intento_id = _pausar(profesor, estudiante, case_version_id, "a" * 200_000)

    assert respuesta.status_code == 200, "un motivo largo no puede dejar a la persona sin pausa (REGLA-004)"
    assert SimulationAttempt.objects.get(pk=intento_id).status == "PAUSED"
    assert _detalle(intento_id) == "a" * game_service.SAFE_EXIT_REASON_MAX


@pytest.mark.django_db
def test_control_negativo_un_motivo_corto_se_guarda_sin_los_espacios_de_los_bordes(profesor, estudiante, case_version_id):
    respuesta, intento_id = _pausar(profesor, estudiante, case_version_id, "  Necesito parar  ")

    assert respuesta.status_code == 200
    assert _detalle(intento_id) == "Necesito parar"


@pytest.mark.django_db
def test_control_negativo_sin_el_recorte_el_motivo_largo_se_guardaria_entero(
    profesor, estudiante, case_version_id, monkeypatch
):
    monkeypatch.setattr(game_service, "SAFE_EXIT_REASON_MAX", 10**9)

    respuesta, intento_id = _pausar(profesor, estudiante, case_version_id, "b" * 5_000)

    assert respuesta.status_code == 200
    assert len(_detalle(intento_id)) == 5_000, "con el tope apagado el texto entra entero: la prueba de arriba sí vigila el tope"
