"""E6-2a · La lectura de los agregados de aprendizaje: ``analytics.load_rows`` (RQ-NEG-001 a 005).

Arma una fila por intento COMPLETADO desde el reporte congelado, las evaluaciones, el evento ``FEEDBACK_VIEWED`` y la
encuesta, con un número CONSTANTE de consultas (no crece con la cohorte) y sin traer texto libre (el comentario de la
encuesta no se lee jamás; el del docente solo se mira para saber si está vacío). Un reporte ilegible o de otra forma no
tumba nada: la fila entra como «sin dato». El cálculo sobre estas filas está en ``test_assessment_analytics.py``.
"""
import uuid
from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.simulation.assessment import analytics
from apps.simulation.assessment.analytics import AttemptRow
from apps.simulation.models import AttemptEvent, CaseVersion, Rubric, SimulationCase
from shared.testing import measure

from .analytics_support import (
    T0 as T,
    add_evaluation,
    add_rating,
    add_viewed,
    completed_attempt,
    make_student,
    make_user,
    v2_report,
)

pytestmark = [
    pytest.mark.req("RQ-NEG-001"), pytest.mark.req("RQ-NEG-002"), pytest.mark.req("RQ-NEG-003"),
    pytest.mark.req("RQ-NEG-004"), pytest.mark.req("RQ-NEG-005"), pytest.mark.django_db,
]

student = make_student


@pytest.fixture
def world(db):
    admin, teacher = make_user("ADMIN", "admin"), make_user("PROFESOR", "prof")
    make_case = lambda title: SimulationCase.objects.create(  # noqa: E731
        code=f"AN-{uuid.uuid4().hex[:6].upper()}", title=title, created_by=admin
    )
    case_a, case_b = make_case("Caso A"), make_case("Caso B")
    version = lambda case, number: CaseVersion.objects.create(  # noqa: E731
        simulation_case=case, semantic_version=f"{number}.0.0", status="PUBLISHED", created_by=admin
    )
    v_a1, v_a2, v_b = version(case_a, 1), version(case_a, 2), version(case_b, 1)
    return SimpleNamespace(
        admin=admin, teacher=teacher, case_a=case_a, case_b=case_b, v_a1=v_a1, v_a2=v_a2, v_b=v_b,
        rubric=Rubric.objects.create(case_version=v_a1, name="Rúbrica", active=True, created_by=admin),
    )


def attempt(world, who, version, ordinal=1, **kwargs):
    return completed_attempt(who, version, ordinal, **kwargs)


viewed = add_viewed


def evaluate(world, record, *, origin, status="EVALUATED", comment=None):
    return add_evaluation(record, world.rubric, origin=origin, teacher=world.teacher, status=status, comment=comment)


# ─── la fila ──────────────────────────────────────────────────────────────────────────────────
def test_cada_fila_trae_lo_que_el_reporte_la_evaluacion_el_evento_y_la_encuesta_guardan(world):
    who = student()
    first = attempt(world, who, world.v_a1, 1, started_at=T, report=v2_report(
        levels=("EN_INICIO", "EN_PROCESO"), non_recommended=3, covered=False, key=False))
    second = attempt(world, who, world.v_a2, 2, started_at=T + timedelta(days=2), report=v2_report(
        levels=("LOGRADO",), non_recommended=1, covered=True, key=True, definition="PER_DECISION_SCENE"))
    evaluate(world, first, origin="SISTEMA")
    evaluate(world, first, origin="DOCENTE", comment="Buen trabajo")
    viewed(first, T + timedelta(days=1))
    add_rating(first, 4, "esto es privado")
    AttemptEvent.objects.create(attempt=second, event_type="HINT_VIEWED")  # otro evento no es ver la retroalimentación
    evaluate(world, second, origin="SISTEMA", status="PENDING")  # una competencia sin evidencia: no está completa
    evaluate(world, second, origin="DOCENTE", comment="  \n ")  # un comentario en blanco no es un comentario

    rows = {row.attempt_id: row for row in analytics.load_rows({who.id})}

    assert rows[str(first.id)] == AttemptRow(
        attempt_id=str(first.id), student_id=who.id, case_id=world.case_a.id, started_at=T, ordinal=1, schema_version=2,
        levels=("EN_INICIO", "EN_PROCESO"), non_recommended=3, reflection_definition="ANY", reflection_covered=False,
        key_evidence=False, system_evaluated=True, teacher_commented=True, feedback_viewed_at=T + timedelta(days=1),
        rating=4,
    )
    assert rows[str(second.id)] == AttemptRow(
        attempt_id=str(second.id), student_id=who.id, case_id=world.case_a.id, started_at=T + timedelta(days=2), ordinal=2,
        schema_version=2, levels=("LOGRADO",), non_recommended=1, reflection_definition="PER_DECISION_SCENE",
        reflection_covered=True, key_evidence=True, system_evaluated=False, teacher_commented=False,
        feedback_viewed_at=None, rating=None,
    )


def test_la_fila_no_tiene_ningun_campo_de_texto_libre_y_la_encuesta_no_se_lee_entera(world):
    who = student()
    record = attempt(world, who, world.v_a1, report=v2_report())
    add_rating(record, 5, "texto privado del estudiante")

    with CaptureQueriesContext(connection) as queries:
        rows = analytics.load_rows({who.id})

    sql = " ".join(q["sql"] for q in queries.captured_queries)
    assert '"attempt_feedback"."comment"' not in sql  # la columna del comentario nunca se pide
    assert "comment" not in AttemptRow.__dataclass_fields__ and "texto privado" not in repr(rows)


# ─── el alcance ───────────────────────────────────────────────────────────────────────────────
def test_solo_los_intentos_completados_del_alcance_entran(world):
    inside = [student(f"in{i}") for i in range(3)]
    done = [attempt(world, who, world.v_a1, report=v2_report()) for who in inside]
    others = [student(f"st{i}") for i in range(4)]
    for who, status in zip(others, ("IN_PROGRESS", "PAUSED", "SAFE_EXITED", "REPLACED")):
        attempt(world, who, world.v_a1, status=status, report=v2_report())
    stranger = student("fuera")
    attempt(world, stranger, world.v_a1, report=v2_report())  # completado, pero de alguien fuera del alcance

    rows = analytics.load_rows({who.id for who in inside + others})

    assert sorted(row.attempt_id for row in rows) == sorted(str(record.id) for record in done)


def test_none_es_todo_el_alcance_y_un_alcance_vacio_no_consulta(world):
    first, second = attempt(world, student(), world.v_a1, report=v2_report()), attempt(world, student(), world.v_b, report=v2_report())

    everyone = {row.attempt_id for row in analytics.load_rows(None)}
    empty, stats = measure(lambda: analytics.load_rows(set()))

    assert {str(first.id), str(second.id)} <= everyone
    assert empty == [] and stats.queries == 0


def test_la_version_del_caso_limita_las_filas_y_las_versiones_de_un_caso_comparten_el_caso(world):
    who = student()
    one, two = attempt(world, who, world.v_a1, 1, report=v2_report()), attempt(world, who, world.v_a2, 2, report=v2_report())
    other = attempt(world, who, world.v_b, 1, report=v2_report())

    only_first = analytics.load_rows({who.id}, world.v_a1.id)
    every = {row.attempt_id: row for row in analytics.load_rows({who.id})}

    assert [row.attempt_id for row in only_first] == [str(one.id)]
    assert every[str(one.id)].case_id == every[str(two.id)].case_id == world.case_a.id  # una sola serie
    assert every[str(other.id)].case_id == world.case_b.id != world.case_a.id


# ─── datos viejos, rotos o de otra forma ──────────────────────────────────────────────────────
def test_un_intento_sin_reporte_o_con_reporte_ilegible_entra_como_version_cero_y_no_tumba_nada(world, caplog):
    without, broken, not_an_object = student(), student(), student()
    missing = attempt(world, without, world.v_a1, report=None)
    unreadable = attempt(world, broken, world.v_a1, report="esto no es json")
    listed = attempt(world, not_an_object, world.v_a1, report="[1, 2]")

    with caplog.at_level("WARNING"):
        rows = {row.attempt_id: row for row in analytics.load_rows({without.id, broken.id, not_an_object.id})}

    assert {row.schema_version for row in rows.values()} == {0}
    assert all(row.levels == () and row.non_recommended is None and row.key_evidence is None for row in rows.values())
    assert rows[str(missing.id)].ordinal is None  # sin reporte no hay ordinal
    assert {str(unreadable.id), str(listed.id)} == {
        id_ for id_ in rows if any(id_ in message for message in caplog.messages)
    }  # avisa de los dos que existen y no se leen; del que no tiene reporte no


def test_un_reporte_v1_trae_solo_lo_basico(world):
    who = student()
    record = attempt(world, who, world.v_a1, report={"schemaVersion": 1, "status": "COMPLETED"}, schema_version=1)

    (row,) = analytics.load_rows({who.id})

    assert row == AttemptRow(
        attempt_id=str(record.id), student_id=who.id, case_id=world.case_a.id, started_at=row.started_at, ordinal=1,
        schema_version=1,
    )


def test_un_reporte_v2_con_claves_de_otro_tipo_se_lee_como_sin_dato(world):
    who, other = student(), student()
    attempt(world, who, world.v_a1, report={
        "schemaVersion": 2, "competencyLevels": "no es una lista", "nonRecommendedCount": "3",
        "reflectionCoverage": [], "keyLearningEvidence": "sí",
    })
    attempt(world, other, world.v_a1, report={
        "schemaVersion": 2, "nonRecommendedCount": True,  # un booleano no es una cuenta
        "reflectionCoverage": {"definition": 5, "covered": "sí"}, "keyLearningEvidence": 1,
    })

    rows = {row.student_id: row for row in analytics.load_rows({who.id, other.id})}

    for row in rows.values():
        assert (row.levels, row.non_recommended, row.reflection_definition, row.reflection_covered, row.key_evidence) == (
            (), None, None, None, False
        )


def test_los_niveles_que_no_existen_o_no_tienen_dato_no_cuentan(world):
    who = student()
    attempt(world, who, world.v_a1, report={
        "schemaVersion": 2, "nonRecommendedCount": 0, "keyLearningEvidence": False,
        "competencyLevels": [{"level": "NO_EXISTE"}, "texto", {"level": None}, {"code": "X"}, {"level": "DESTACADO"}],
    })

    (row,) = analytics.load_rows({who.id})

    assert row.levels == ("DESTACADO",)


# ─── el costo ─────────────────────────────────────────────────────────────────────────────────
def test_el_numero_de_consultas_no_depende_de_cuantos_estudiantes_hay(world):
    ids = []
    for index in range(25):
        who = student(f"c{index}")
        ids.append(who.id)
        for ordinal, version in ((1, world.v_a1), (2, world.v_a2)):
            record = attempt(world, who, version, ordinal, started_at=T + timedelta(days=ordinal), report=v2_report())
            evaluate(world, record, origin="SISTEMA")
            evaluate(world, record, origin="DOCENTE", comment="Comentario")
            viewed(record, T + timedelta(days=ordinal, hours=1))
            add_rating(record, 4)

    small_rows, small = measure(lambda: analytics.load_rows(ids[:5]))
    big_rows, big = measure(lambda: analytics.load_rows(ids))

    assert (len(small_rows), len(big_rows)) == (10, 50)
    assert small.queries == big.queries == 4  # los intentos con su reporte, los eventos, las evaluaciones y la encuesta
    assert small.writes == big.writes == 0
