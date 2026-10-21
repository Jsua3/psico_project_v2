"""E6-1c / M-4 · La migración 0027 se revierte aunque ya existan evaluaciones del sistema.

La 0027 hizo nulable ``rubric_evaluations.instructor_id`` para la evaluación automática (``origin = SISTEMA``, sin
docente). Devolver esa columna a NOT NULL con una fila del sistema en la tabla no se podía: la reversión fallaba con
«column contains null values» justo cuando más datos hay. Las filas del sistema son DERIVADAS (las crea el cierre del
intento y las repone ``backfill_attempt_reports``), así que la reversión las borra; las del docente no se tocan.

Como en ``grupos``/``test_assignment_data_migration``, el ejecutor de migraciones corre sobre la base de la propia
prueba (el DDL de PostgreSQL es transaccional): se retrocede a la 0026 con filas reales y se vuelve a avanzar.
"""
from decimal import Decimal
from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from apps.simulation.models import CriterionScore, RubricCriterion, RubricEvaluation

from .test_attempt_concurrency import _option, committed_attempt  # noqa: F401  (fixture)
from .test_attempt_report_frozen import (  # noqa: F401  (fixtures y ayudantes)
    case_version_id,
    cl,
    completed,
    estudiante,
)

pytestmark = [pytest.mark.django_db, pytest.mark.req("RQ-NEG-005"), pytest.mark.req("RNF-08")]

User = get_user_model()
BEFORE = [("simulation", "0026_audit_logs_append_only")]


def _migrate(targets):
    executor = MigrationExecutor(connection)
    executor.migrate(targets)
    return MigrationExecutor(connection)  # el grafo y el estado ya recargados


def _latest():
    """Las hojas de ``simulation`` de HOY: la prueba no fija cuál es la última migración (otra rama puede añadir más)."""
    return list(MigrationExecutor(connection).loader.graph.leaf_nodes("simulation"))


def _immediate():
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")  # sin eventos de FK pendientes antes del DDL


def _instructor_is_nullable():
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT is_nullable FROM information_schema.columns "
            "WHERE table_name = 'rubric_evaluations' AND column_name = 'instructor_id'"
        )
        return cursor.fetchone()[0] == "YES"


def _constraint_names():
    """Los CHECK de la tabla y sus índices (un único PARCIAL es un índice único, no una fila de ``pg_constraint``)."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT conname FROM pg_constraint WHERE conrelid = 'rubric_evaluations'::regclass "
            "UNION SELECT indexname FROM pg_indexes WHERE tablename = 'rubric_evaluations'"
        )
        return {name for (name,) in cursor.fetchall()}


@pytest.fixture
def profesor(estudiante):
    """La docente dueña del grupo al que el fixture ``estudiante`` pertenece."""
    return User.objects.get(email="prof_world_owner@x.com")


@pytest.fixture
def both_evaluations(completed, profesor):
    """El intento cerrado (con SU evaluación del sistema) más una evaluación del docente con un criterio puntuado."""
    _, attempt_id, _ = completed
    system = RubricEvaluation.objects.get(attempt_id=attempt_id, origin="SISTEMA")
    teacher = RubricEvaluation.objects.create(
        attempt_id=attempt_id, rubric_id=system.rubric_id, instructor=profesor, origin="DOCENTE",
        status="EVALUATED", total_score=Decimal("3.00"),
    )
    criterion = RubricCriterion.objects.filter(rubric_id=system.rubric_id).order_by("id").first()
    CriterionScore.objects.create(
        rubric_evaluation=teacher, rubric_criterion=criterion, score=Decimal("3.00"), level="LOGRADO"
    )
    return attempt_id, system, teacher


def test_revertir_la_0027_con_evaluaciones_del_sistema_las_borra_y_deja_las_del_docente(both_evaluations):
    attempt_id, system, teacher = both_evaluations
    assert _instructor_is_nullable()  # hoy el esquema admite evaluaciones sin docente
    _immediate()

    executor = _migrate(BEFORE)

    state = executor.loader.project_state(BEFORE).apps
    Evaluation = state.get_model("simulation", "RubricEvaluation")
    Score = state.get_model("simulation", "CriterionScore")
    assert list(Evaluation.objects.filter(attempt_id=attempt_id).values_list("pk", "origin")) == [(teacher.pk, "DOCENTE")]
    assert not Score.objects.filter(rubric_evaluation_id=system.pk).exists()  # sus criterios se fueron con ella
    assert Score.objects.filter(rubric_evaluation_id=teacher.pk).count() == 1  # los del docente no se tocan
    assert not _instructor_is_nullable()  # y la columna volvió a NOT NULL
    assert "uq_rubric_evaluations_system_attempt_rubric" not in _constraint_names()


def test_volver_a_avanzar_deja_el_esquema_de_hoy_y_el_relleno_repone_la_evaluacion_del_sistema(both_evaluations):
    attempt_id, _, teacher = both_evaluations
    _immediate()
    _migrate(BEFORE)
    _immediate()

    _migrate(_latest())

    assert _instructor_is_nullable()
    assert {"rubric_evaluations_origin_instructor_check", "uq_rubric_evaluations_system_attempt_rubric"} <= _constraint_names()
    assert not RubricEvaluation.objects.filter(attempt_id=attempt_id, origin="SISTEMA").exists()  # derivadas: no vuelven solas
    assert RubricEvaluation.objects.filter(pk=teacher.pk, origin="DOCENTE").exists()

    call_command("backfill_attempt_reports", stdout=StringIO())

    repaired = RubricEvaluation.objects.get(attempt_id=attempt_id, origin="SISTEMA")
    assert repaired.instructor_id is None and repaired.status == "EVALUATED"
    assert RubricEvaluation.objects.filter(attempt_id=attempt_id).count() == 2
