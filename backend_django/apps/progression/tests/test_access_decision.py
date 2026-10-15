"""E3-2 · La decisión de acceso: una sola función (RN-04, RF-15, decisiones 5 y 12).

``access_decision(student, case_version_id, now)`` es la única consulta de habilitación: dice si
el estudiante puede **iniciar** esa versión y, si no, por qué (``NOT_ASSIGNED``,
``NOT_YET_OPEN``, ``CLOSED`` o ``LOCKED_BY_SEQUENCE``). Un intento abierto se deja terminar.
"""
import datetime

import pytest
from django.contrib.auth import get_user_model

from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante
from apps.progression.access import access_decision, access_map
from apps.progression.models import StudentCaseCompletion
from apps.simulation.models import (
    CaseVersion,
    SimulationAttempt,
    SimulationCase,
    SimulationNode,
)

pytestmark = [pytest.mark.req("RN-04"), pytest.mark.req("RF-15")]

User = get_user_model()
D = datetime.datetime
NOW = D(2026, 10, 14, 12, 0, 0)
PAST = D(2026, 10, 1, 8)
FUTURE = D(2026, 10, 30, 8)


def _user(email, role):
    return User.objects.create_user(email=email, password="Clave-Segura-2026!", nombre="N", apellido="A", role=role)


@pytest.fixture
def profesor(db):
    return _user("acc_prof@x.com", "PROFESOR")


@pytest.fixture
def estudiante(db):
    return _user("acc_est@x.com", "ESTUDIANTE")


@pytest.fixture
def grupo(profesor, estudiante):
    group = Grupo.objects.create(nombre="G acc", codigo="ACC1", profesor=profesor)
    GrupoEstudiante.objects.create(grupo=group, estudiante=estudiante, status="ACTIVE")
    return group


_counter = {"n": 0}


def _version(owner, status="PUBLISHED", active=True):
    _counter["n"] += 1
    case = SimulationCase.objects.create(
        code=f"ACC-{_counter['n']}", title=f"Caso acc {_counter['n']}", created_by=owner, active=active
    )
    return CaseVersion.objects.create(
        simulation_case=case, semantic_version="1.0.0", status=status, created_by=owner
    )


def _assign(grupo, version, **fields):
    return CaseAssignment.objects.create(grupo=grupo, case_version=version, **fields)


def _complete(student, version):
    StudentCaseCompletion.objects.create(
        student_id=student.id, simulation_case_id=version.simulation_case_id,
        first_completed_at=NOW,
    )


def _decision(student, version, now=NOW):
    return access_decision(student, version.id, now=now)


# ─── los cuatro motivos y el permitido ──────────────────────────────────────────────────────
def test_a_case_that_is_not_assigned_is_not_assigned(estudiante, profesor, grupo):
    version = _version(profesor)

    decision = _decision(estudiante, version)

    assert (decision.allowed, decision.reason) == (False, "NOT_ASSIGNED")


def test_an_assigned_case_without_window_is_allowed(estudiante, profesor, grupo):
    version = _version(profesor)
    _assign(grupo, version)

    decision = _decision(estudiante, version)

    assert (decision.allowed, decision.reason) == (True, None)


def test_a_scheduled_case_says_when_it_opens(estudiante, profesor, grupo):
    version = _version(profesor)
    _assign(grupo, version, opens_at=FUTURE)

    decision = _decision(estudiante, version)

    assert (decision.allowed, decision.reason) == (False, "NOT_YET_OPEN")
    assert decision.opens_at == FUTURE
    assert decision.as_dict() == {
        "allowed": False, "reason": "NOT_YET_OPEN", "opensAt": "2026-10-30T08:00:00-05:00",
    }


def test_a_closed_case_says_when_it_closed(estudiante, profesor, grupo):
    version = _version(profesor)
    _assign(grupo, version, opens_at=PAST, closes_at=D(2026, 10, 10))

    decision = _decision(estudiante, version)

    assert (decision.allowed, decision.reason) == (False, "CLOSED")
    assert decision.closes_at == D(2026, 10, 10)


def test_the_window_frontier_is_open_at_the_opening_and_closed_at_the_closing(estudiante, profesor, grupo):
    version = _version(profesor)
    _assign(grupo, version, opens_at=D(2026, 10, 14, 0, 0, 0), closes_at=D(2026, 10, 20, 0, 0, 0))

    assert _decision(estudiante, version, D(2026, 10, 13, 23, 59, 59)).reason == "NOT_YET_OPEN"
    assert _decision(estudiante, version, D(2026, 10, 14, 0, 0, 0)).allowed is True
    assert _decision(estudiante, version, D(2026, 10, 19, 23, 59, 59)).allowed is True
    assert _decision(estudiante, version, D(2026, 10, 20, 0, 0, 0)).reason == "CLOSED"


# ─── la secuencia ────────────────────────────────────────────────────────────────────────────
def test_the_second_case_is_locked_until_the_first_is_completed(estudiante, profesor, grupo):
    first, second = _version(profesor), _version(profesor)
    _assign(grupo, first)
    _assign(grupo, second)

    assert _decision(estudiante, first).allowed is True
    assert (_decision(estudiante, second).allowed, _decision(estudiante, second).reason) == (
        False, "LOCKED_BY_SEQUENCE",
    )

    _complete(estudiante, first)

    assert _decision(estudiante, second).allowed is True


def test_sort_order_decides_the_sequence_before_the_case_order(estudiante, profesor, grupo):
    older, newer = _version(profesor), _version(profesor)
    _assign(grupo, older, sort_order=5)
    _assign(grupo, newer, sort_order=0)

    assert _decision(estudiante, newer).allowed is True
    assert _decision(estudiante, older).reason == "LOCKED_BY_SEQUENCE"


def test_a_closed_and_uncompleted_case_does_not_block_the_next_one(estudiante, profesor, grupo):
    """R4: un docente que cierra la ventana no debe dejar sin avanzar al resto de la secuencia."""
    first, second = _version(profesor), _version(profesor)
    _assign(grupo, first, opens_at=PAST, closes_at=D(2026, 10, 10))
    _assign(grupo, second)

    assert _decision(estudiante, first).reason == "CLOSED"
    assert _decision(estudiante, second).allowed is True


def test_a_scheduled_case_before_an_open_one_does_block_it(estudiante, profesor, grupo):
    first, second = _version(profesor), _version(profesor)
    _assign(grupo, first, opens_at=FUTURE)
    _assign(grupo, second)

    assert _decision(estudiante, second).reason == "LOCKED_BY_SEQUENCE"


def test_a_closed_case_that_was_completed_still_counts_as_done(estudiante, profesor, grupo):
    first, second, third = _version(profesor), _version(profesor), _version(profesor)
    _assign(grupo, first)
    _assign(grupo, second, opens_at=PAST, closes_at=D(2026, 10, 10))
    _assign(grupo, third)
    _complete(estudiante, first)

    assert _decision(estudiante, third).allowed is True


# ─── varias asignaciones de una misma versión (R5) ───────────────────────────────────────────
def test_any_open_assignment_opens_the_case(estudiante, profesor, grupo):
    other = Grupo.objects.create(nombre="G acc 2", codigo="ACC2", profesor=profesor)
    GrupoEstudiante.objects.create(grupo=other, estudiante=estudiante, status="ACTIVE")
    version = _version(profesor)
    _assign(grupo, version, opens_at=PAST, closes_at=D(2026, 10, 10))  # cerrada
    _assign(other, version)  # abierta

    assert _decision(estudiante, version).allowed is True


def test_without_an_open_one_a_scheduled_assignment_wins_over_a_closed_one(estudiante, profesor, grupo):
    other = Grupo.objects.create(nombre="G acc 2", codigo="ACC2", profesor=profesor)
    GrupoEstudiante.objects.create(grupo=other, estudiante=estudiante, status="ACTIVE")
    version = _version(profesor)
    _assign(grupo, version, opens_at=PAST, closes_at=D(2026, 10, 10))  # cerrada
    _assign(other, version, opens_at=FUTURE)  # programada

    decision = _decision(estudiante, version)

    assert (decision.reason, decision.opens_at) == ("NOT_YET_OPEN", FUTURE)


def test_a_direct_student_assignment_is_resolved_like_a_group_one(estudiante, profesor):
    version = _version(profesor)
    CaseAssignment.objects.create(estudiante=estudiante, case_version=version, opens_at=FUTURE)

    assert _decision(estudiante, version).reason == "NOT_YET_OPEN"


# ─── lo que no cuenta como asignación ─────────────────────────────────────────────────────────
def test_a_paused_assignment_is_not_an_assignment(estudiante, profesor, grupo):
    version = _version(profesor)
    _assign(grupo, version, active=False)

    assert _decision(estudiante, version).reason == "NOT_ASSIGNED"


def test_an_inactive_group_gives_no_access(estudiante, profesor, grupo):
    version = _version(profesor)
    _assign(grupo, version)
    Grupo.objects.filter(pk=grupo.pk).update(activo=False)

    assert _decision(estudiante, version).reason == "NOT_ASSIGNED"


@pytest.mark.parametrize("status", ["INVITED", "DECLINED", "REMOVED"])
def test_only_active_members_get_the_group_assignment(estudiante, profesor, grupo, status):
    version = _version(profesor)
    _assign(grupo, version)
    GrupoEstudiante.objects.filter(grupo=grupo, estudiante=estudiante).update(status=status)

    assert _decision(estudiante, version).reason == "NOT_ASSIGNED"


def test_staff_always_pass(profesor, estudiante, grupo):
    admin = _user("acc_admin@x.com", "ADMIN")
    version = _version(profesor)
    _assign(grupo, version, opens_at=FUTURE)

    assert _decision(profesor, version).allowed is True
    assert _decision(admin, version).allowed is True


# ─── un intento abierto se deja terminar (decisión 12) ────────────────────────────────────────
def _open_attempt(student, version):
    node = SimulationNode.objects.create(
        case_version=version, node_key="n1", title="Inicio", narrative="x", start_node=True
    )
    return SimulationAttempt.objects.create(
        attempt_token_hash=f"hash-{version.id}-{student.id}", case_version=version, student=student,
        current_node=node, status="IN_PROGRESS",
    )


def test_an_open_attempt_is_let_finish_after_the_window_closes(estudiante, profesor, grupo):
    version = _version(profesor)
    _assign(grupo, version, opens_at=PAST, closes_at=D(2026, 10, 10))
    assert _decision(estudiante, version).reason == "CLOSED"

    _open_attempt(estudiante, version)

    decision = _decision(estudiante, version)
    assert decision.allowed is True and decision.reason is None


def test_an_open_attempt_is_not_blocked_by_the_sequence(estudiante, profesor, grupo):
    first, second = _version(profesor), _version(profesor)
    _assign(grupo, first)
    _assign(grupo, second)
    _open_attempt(estudiante, second)

    assert _decision(estudiante, second).allowed is True


def test_an_open_attempt_does_not_survive_the_assignment_being_removed(estudiante, profesor, grupo):
    version = _version(profesor)
    assignment = _assign(grupo, version)
    _open_attempt(estudiante, version)
    assignment.delete()

    assert _decision(estudiante, version).reason == "NOT_ASSIGNED"


def test_a_completed_attempt_does_not_count_as_open(estudiante, profesor, grupo):
    version = _version(profesor)
    _assign(grupo, version, opens_at=PAST, closes_at=D(2026, 10, 10))
    attempt = _open_attempt(estudiante, version)
    SimulationAttempt.objects.filter(pk=attempt.pk).update(status="COMPLETED")

    assert _decision(estudiante, version).reason == "CLOSED"


# ─── por lotes ────────────────────────────────────────────────────────────────────────────────
def test_the_map_equals_the_per_case_decisions(estudiante, profesor, grupo):
    first, second, third, stray = (_version(profesor) for _ in range(4))
    _assign(grupo, first)
    _assign(grupo, second)
    _assign(grupo, third, opens_at=FUTURE)

    decisions = access_map(estudiante, [first.id, second.id, third.id, stray.id], now=NOW)

    assert {vid: (d.allowed, d.reason) for vid, d in decisions.items()} == {
        first.id: (True, None),
        second.id: (False, "LOCKED_BY_SEQUENCE"),
        third.id: (False, "NOT_YET_OPEN"),  # la ventana se dice antes que la secuencia
        stray.id: (False, "NOT_ASSIGNED"),
    }
    for version in (first, second, third, stray):
        single = _decision(estudiante, version)
        assert (single.allowed, single.reason) == (
            decisions[version.id].allowed, decisions[version.id].reason,
        )


def test_the_number_of_queries_does_not_grow_with_the_number_of_cases(
    estudiante, profesor, grupo, django_assert_max_num_queries
):
    versions = [_version(profesor) for _ in range(8)]
    for version in versions:
        _assign(grupo, version)

    with django_assert_max_num_queries(6):
        decisions = access_map(estudiante, [v.id for v in versions], now=NOW)

    assert len(decisions) == 8
