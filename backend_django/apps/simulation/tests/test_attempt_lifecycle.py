"""P-12 · State: la tabla de estados y transiciones del intento (sin base de datos)."""
from types import SimpleNamespace

import pytest
from rest_framework.exceptions import ValidationError

from apps.simulation.models import AttemptStatus
from apps.simulation.services import attempt_lifecycle as lifecycle
from apps.simulation.services.attempt_lifecycle import (
    COMPLETE, PAUSE, REPLACE, RESUME, InvalidAttemptTransition,
)

IN_PROGRESS, PAUSED = AttemptStatus.IN_PROGRESS, AttemptStatus.PAUSED
COMPLETED, REPLACED, SAFE_EXITED = AttemptStatus.COMPLETED, AttemptStatus.REPLACED, AttemptStatus.SAFE_EXITED
ACTIONS = [COMPLETE, PAUSE, RESUME, REPLACE]

#: La tabla completa: estado → {acción: estado siguiente}.
TABLE = {
    IN_PROGRESS: {COMPLETE: COMPLETED, PAUSE: PAUSED, REPLACE: REPLACED},
    PAUSED: {RESUME: IN_PROGRESS, REPLACE: REPLACED},
    COMPLETED: {},
    REPLACED: {},
    SAFE_EXITED: {},
}


def attempt(status):
    return SimpleNamespace(status=status)


def test_cada_estado_de_attempt_status_tiene_su_objeto_de_estado():
    for status in AttemptStatus:
        assert lifecycle.state_of(attempt(status)).status == status


def test_state_of_acepta_el_valor_guardado_como_texto():
    assert lifecycle.state_of(attempt("PAUSED")).status == AttemptStatus.PAUSED


@pytest.mark.parametrize("status", list(TABLE))
def test_las_transiciones_permitidas_son_exactamente_las_de_la_tabla(status):
    assert lifecycle.state_of(attempt(status)).transitions == TABLE[status]


@pytest.mark.parametrize("status", list(TABLE))
@pytest.mark.parametrize("action", ACTIONS)
def test_cada_accion_en_cada_estado(status, action):
    state = lifecycle.state_of(attempt(status))
    expected = TABLE[status].get(action)

    assert state.can(action) is (expected is not None)
    if expected is None:
        with pytest.raises(InvalidAttemptTransition):
            state.next(action)
    else:
        assert state.next(action) == expected


def test_solo_en_progreso_acepta_jugar():
    playing = [s for s in AttemptStatus if lifecycle.state_of(attempt(s)).plays]
    assert playing == [IN_PROGRESS]


def test_estan_abiertos_en_progreso_y_en_pausa():
    open_statuses = [s for s in AttemptStatus if lifecycle.state_of(attempt(s)).is_open]
    assert set(open_statuses) == {IN_PROGRESS, PAUSED}
    assert set(lifecycle.OPEN_STATUSES) == {IN_PROGRESS, PAUSED}


def test_los_estados_terminales_no_tienen_salida():
    for status in (COMPLETED, REPLACED, SAFE_EXITED):
        state = lifecycle.state_of(attempt(status))
        assert state.transitions == {}
        assert not state.plays and not state.is_open


def test_ninguna_transicion_llega_a_la_salida_segura_historica():
    targets = {t for transitions in TABLE.values() for t in transitions.values()}
    reachable = {t for s in AttemptStatus for t in lifecycle.state_of(attempt(s)).transitions.values()}
    assert SAFE_EXITED not in reachable
    assert reachable == targets


def test_un_intento_nuevo_nace_en_progreso():
    assert lifecycle.INITIAL_STATUS == IN_PROGRESS


class TestApply:
    def test_mueve_el_intento_al_estado_siguiente(self):
        a = attempt(IN_PROGRESS)

        result = lifecycle.apply(a, PAUSE)

        assert a.status == PAUSED
        assert result == PAUSED

    def test_recorre_un_ciclo_completo(self):
        a = attempt(IN_PROGRESS)
        for action, expected in [(PAUSE, PAUSED), (RESUME, IN_PROGRESS), (COMPLETE, COMPLETED)]:
            lifecycle.apply(a, action)
            assert a.status == expected

    def test_una_transicion_invalida_lanza_y_no_cambia_el_estado(self):
        a = attempt(COMPLETED)

        with pytest.raises(InvalidAttemptTransition):
            lifecycle.apply(a, RESUME)

        assert a.status == COMPLETED

    def test_la_excepcion_es_un_error_de_validacion_con_estado_y_accion(self):
        with pytest.raises(ValidationError) as caught:
            lifecycle.apply(attempt(REPLACED), COMPLETE)

        message = str(caught.value.detail[0])
        assert "REPLACED" in message and "complete" in message
