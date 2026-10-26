"""E6-1e · La evaluación automática del sistema (RQ-NEG-005, RF-22; R6 y R7 de la fase).

Al cerrar un intento el sistema crea SU evaluación (``origin = SISTEMA``, sin docente) con un nivel por criterio de la
rúbrica del caso, derivado del perfil por competencia que el reporte congelado ya guardó. Es única por intento y
rúbrica, la crea ``freeze_report`` (así el relleno de reportes viejos también la crea) y **no cambia nada de lo que ya
se veía**: el formulario del docente, su traza («evaluación aplicada»), el recuento de rúbricas aplicadas del reporte
de grupo y la evaluación que lee el estudiante siguen hablando solo de las evaluaciones del DOCENTE (Review Focus 1).
"""
import json
from decimal import Decimal
from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.db import connection
from rest_framework.test import APIClient

from apps.grupos.models import Grupo
from apps.simulation.assessment import competencies as assessment_competencies
from apps.simulation.assessment import evaluation as system_evaluation
from apps.simulation.models import (
    AttemptReport,
    CaseVersion,
    CriterionScore,
    DecisionOption,
    Rubric,
    RubricCriterion,
    RubricEvaluation,
    SimulationAttempt,
)
from apps.simulation.services import attempt_report, game_service
from shared.testing import measure, run_concurrently

from .competency_support import declare_all_seeded, declare_competencies
from .test_attempt_concurrency import _option, committed_attempt  # noqa: F401  (fixture)
from .test_attempt_report_frozen import (  # noqa: F401  (fixtures y ayudantes)
    BASE,
    _complete,
    _start,
    case_version_id,
    cl,
    completed,
    estudiante,
)

pytestmark = [pytest.mark.req("RQ-NEG-005"), pytest.mark.req("RF-22")]

User = get_user_model()
TEACHER_BASE = "/api/instructor"
SEEDED = ["CONTENCION", "MARCO_NORMATIVO", "INTERVENCION_ETICA", "REFLEXION"]


def _system(attempt_id):
    return RubricEvaluation.objects.filter(attempt_id=attempt_id, origin="SISTEMA")


def _declare_competencies(case_version_id, competencies):
    """Todas las opciones del caso declaran el mismo mapa de competencias (se conservan sus demás efectos)."""
    declare_competencies(case_version_id, competencies)


@pytest.fixture(autouse=True)
def seeded_declares_destacado(request):
    """El caso sembrado no declara competencias y sin declaración no hay nivel: aquí todas declaran ``DESTACADO``.

    No aplica a las pruebas con commits reales (``real_commits``): esas no deben escribir en la siembra.
    """
    if "real_commits" not in request.fixturenames:
        declare_all_seeded(request.getfixturevalue("case_version_id"))


@pytest.fixture
def profesor(estudiante):
    """La docente dueña del grupo al que el fixture ``estudiante`` pertenece."""
    return User.objects.get(email="prof_world_owner@x.com")


# ─── la evaluación del sistema ────────────────────────────────────────────────────────────────
def test_al_cerrar_el_sistema_deja_una_evaluacion_sin_docente_con_un_nivel_por_criterio(completed):
    _, attempt_id, _ = completed

    evaluation = _system(attempt_id).get()

    assert evaluation.instructor_id is None
    assert evaluation.status == "EVALUATED"
    assert evaluation.rubric_id == assessment_competencies.rubric_of(
        SimulationAttempt.objects.get(pk=attempt_id).case_version_id
    ).id
    scores = CriterionScore.objects.filter(rubric_evaluation=evaluation)
    assert scores.count() == 4
    assert {score.level for score in scores} == {"DESTACADO"}
    assert {score.score for score in scores} == {Decimal("4.00")}  # el índice interno de DESTACADO
    assert evaluation.total_score == Decimal("4.00")
    assert "automática" in evaluation.comment
    assert json.loads(evaluation.snapshot_json)["rubricId"] == evaluation.rubric_id


def test_el_nivel_de_cada_criterio_es_el_de_su_competencia(estudiante, case_version_id):
    _declare_competencies(case_version_id, {
        "CONTENCION": "DESTACADO", "MARCO_NORMATIVO": "LOGRADO", "INTERVENCION_ETICA": "EN_PROCESO", "REFLEXION": "EN_INICIO",
    })
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    _complete(client, attempt_id, token)

    evaluation = _system(attempt_id).get()

    by_competency = {
        score.rubric_criterion.competency: score.level
        for score in CriterionScore.objects.filter(rubric_evaluation=evaluation).select_related("rubric_criterion")
    }
    assert by_competency == {
        "CONTENCION": "DESTACADO", "MARCO_NORMATIVO": "LOGRADO", "INTERVENCION_ETICA": "EN_PROCESO", "REFLEXION": "EN_INICIO",
    }
    assert evaluation.total_score == Decimal("2.50")  # (4 + 3 + 2 + 1) / 4 con los cuatro criterios al 25 %


def test_el_total_es_la_suma_ponderada_del_indice_de_cada_nivel(estudiante, case_version_id):
    rubric = assessment_competencies.rubric_of(case_version_id)
    for weight, competency in zip((40, 30, 20, 10), SEEDED):
        RubricCriterion.objects.filter(rubric=rubric, competency=competency).update(weight=weight)
    _declare_competencies(case_version_id, {
        "CONTENCION": "DESTACADO", "MARCO_NORMATIVO": "LOGRADO", "INTERVENCION_ETICA": "EN_PROCESO", "REFLEXION": "EN_INICIO",
    })
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    _complete(client, attempt_id, token)

    evaluation = _system(attempt_id).get()

    assert evaluation.total_score == Decimal("3.00")  # 4 × 0,4 + 3 × 0,3 + 2 × 0,2 + 1 × 0,1


def test_el_sistema_no_reescribe_las_ponderaciones_de_la_rubrica(estudiante, case_version_id):
    """Evaluar no escribe una rúbrica sellada: aunque los pesos no sumen 100, solo se leen."""
    rubric = assessment_competencies.rubric_of(case_version_id)
    RubricCriterion.objects.filter(rubric=rubric).update(weight=10)  # suman 40, no 100
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    _complete(client, attempt_id, token)

    assert _system(attempt_id).get().total_score == Decimal("4.00")  # media ponderada: no depende de que sumen 100
    assert set(RubricCriterion.objects.filter(rubric=rubric).values_list("weight", flat=True)) == {Decimal("10.00")}


def test_cerrar_otra_vez_o_rellenar_no_crea_otra_evaluacion(completed):
    _, attempt_id, _ = completed
    attempt = SimulationAttempt.objects.get(pk=attempt_id)

    attempt_report.freeze_report(attempt)
    call_command("backfill_attempt_reports")

    assert _system(attempt_id).count() == 1


def test_pedirla_otra_vez_no_escribe_nada(completed):
    _, attempt_id, _ = completed
    attempt = SimulationAttempt.objects.get(pk=attempt_id)
    report = attempt_report.frozen_report_for(attempt_id)

    evaluation, cost = measure(lambda: system_evaluation.record_system_evaluation(attempt, report))

    assert evaluation.pk == _system(attempt_id).get().pk
    assert cost.writes == 0  # ni siquiera intenta un INSERT que el único parcial rechazaría


def test_el_relleno_crea_el_reporte_y_la_evaluacion_de_un_intento_anterior(completed):
    _, attempt_id, _ = completed
    AttemptReport.objects.filter(attempt_id=attempt_id).delete()
    _system(attempt_id).delete()  # un intento cerrado antes de E6

    call_command("backfill_attempt_reports")

    assert AttemptReport.objects.filter(attempt_id=attempt_id).count() == 1
    assert _system(attempt_id).count() == 1


def test_el_relleno_repara_la_evaluacion_que_falto_aunque_el_reporte_ya_exista(completed):
    """Un fallo transitorio al cerrar deja un intento con reporte v2 y sin evaluación: nada la repararía jamás."""
    _, attempt_id, _ = completed
    _system(attempt_id).delete()  # lo que dejaría un deadlock o un tiempo de espera al insertarla
    out = StringIO()

    call_command("backfill_attempt_reports", stdout=out)
    again = StringIO()
    call_command("backfill_attempt_reports", stdout=again)  # idempotente: ya no hay nada que reparar

    assert _system(attempt_id).count() == 1
    assert "Evaluaciones del sistema creadas: 1" in out.getvalue()
    assert "Evaluaciones del sistema creadas: 0" in again.getvalue()


def test_reparar_una_evaluacion_de_un_reporte_cuyo_json_es_v1_no_hace_nada(completed):
    """La función también se defiende sola: un reporte v1 no trae los niveles de los que derivarla."""
    _, attempt_id, _ = completed
    _system(attempt_id).delete()
    row = AttemptReport.objects.get(attempt_id=attempt_id)
    payload = json.loads(row.report_json)
    AttemptReport.objects.filter(pk=row.pk).update(report_json=json.dumps({**payload, "schemaVersion": 1}))

    assert attempt_report.repair_system_evaluation(SimulationAttempt.objects.get(pk=attempt_id)) is None
    assert _system(attempt_id).count() == 0


def test_si_el_caso_ya_no_tiene_rubrica_el_relleno_no_cuenta_una_evaluacion_que_no_creo(completed):
    _, attempt_id, _ = completed
    _system(attempt_id).delete()
    Rubric.objects.update(active=False)  # sin rúbrica no hay nada que evaluar
    out = StringIO()

    call_command("backfill_attempt_reports", stdout=out)

    assert _system(attempt_id).count() == 0 and "Evaluaciones del sistema creadas: 0" in out.getvalue()


def test_un_error_real_de_base_de_datos_en_la_evaluacion_no_aborta_el_cierre(estudiante, case_version_id, monkeypatch):
    """Un ``RuntimeError`` no aborta la transacción de PostgreSQL; un error de SQL sí, y solo el punto de guardado la salva."""
    def broken(attempt, report):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1/0")

    monkeypatch.setattr(system_evaluation, "record_system_evaluation", broken)
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)

    _complete(client, attempt_id, token)

    assert SimulationAttempt.objects.get(pk=attempt_id).status == "COMPLETED"
    assert AttemptReport.objects.filter(attempt_id=attempt_id).exists() and _system(attempt_id).count() == 0


def test_el_relleno_no_inventa_una_evaluacion_para_un_reporte_v1(completed):
    _, attempt_id, _ = completed
    _system(attempt_id).delete()
    AttemptReport.objects.filter(attempt_id=attempt_id).update(report_schema_version=1)  # lo cerrado antes de E6

    call_command("backfill_attempt_reports")

    assert _system(attempt_id).count() == 0


def test_si_un_intento_no_se_puede_reparar_el_relleno_sigue_con_los_demas_y_avisa(completed, monkeypatch):
    _, attempt_id, _ = completed
    _system(attempt_id).delete()

    def broken(attempt, report):
        raise RuntimeError("la rúbrica se rompió")

    monkeypatch.setattr(system_evaluation, "record_system_evaluation", broken)
    out, err = StringIO(), StringIO()

    with pytest.raises(CommandError, match="1 evaluación"):
        call_command("backfill_attempt_reports", stdout=out, stderr=err)

    assert str(attempt_id) in err.getvalue() and _system(attempt_id).count() == 0


def test_sin_rubrica_activa_no_hay_evaluacion_del_sistema(estudiante, case_version_id):
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    Rubric.objects.update(active=False)
    _complete(client, attempt_id, token)

    assert _system(attempt_id).count() == 0
    assert AttemptReport.objects.filter(attempt_id=attempt_id).count() == 1  # el cierre no se rompe


def test_una_competencia_sin_evidencia_deja_la_evaluacion_pendiente_con_un_nivel_menos(estudiante, case_version_id):
    _declare_competencies(case_version_id, {"CONTENCION": "DESTACADO", "MARCO_NORMATIVO": "LOGRADO"})
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    _complete(client, attempt_id, token)

    evaluation = _system(attempt_id).get()

    assert evaluation.status == "PENDING"
    assert CriterionScore.objects.filter(rubric_evaluation=evaluation).count() == 2
    assert evaluation.total_score == Decimal("1.75")  # (4 + 3) × 25 %: lo que no tiene nivel no suma


@pytest.mark.parametrize("report", [{}, {"competencyLevels": []}, {"competencyLevels": [{"code": "X", "name": "X", "level": None}]}])
def test_un_reporte_sin_perfil_no_genera_evaluacion(completed, report):
    """Un reporte v1 (sin la clave) o con el perfil vacío o sin ningún nivel no da de qué evaluar."""
    _, attempt_id, _ = completed
    attempt = SimulationAttempt.objects.get(pk=attempt_id)
    _system(attempt_id).delete()

    assert system_evaluation.record_system_evaluation(attempt, report) is None
    assert _system(attempt_id).count() == 0


def test_si_la_evaluacion_del_sistema_falla_el_cierre_sigue_y_el_reporte_queda(estudiante, case_version_id, monkeypatch):
    """Es un dato derivado: ni el intento ni su reporte dependen de ella (como los suscriptores de ``attempt_completed``)."""

    def broken(attempt, report):
        raise RuntimeError("la evaluación del sistema se rompió")

    monkeypatch.setattr(system_evaluation, "record_system_evaluation", broken)
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)

    _complete(client, attempt_id, token)  # exige un 200 en cada decisión, incluida la que cierra

    assert SimulationAttempt.objects.get(pk=attempt_id).status == "COMPLETED"
    assert AttemptReport.objects.filter(attempt_id=attempt_id).count() == 1
    assert _system(attempt_id).count() == 0


def test_dos_cierres_a_la_vez_dejan_una_sola_evaluacion(committed_attempt):
    """Hilos con commits reales: el relleno y el cierre pueden coincidir; el único parcial decide y nadie falla."""
    a = committed_attempt
    for _ in range(12):
        attempt = SimulationAttempt.objects.get(pk=a.attempt_id)
        if attempt.status != "IN_PROGRESS":
            break
        good = _option(attempt.current_node_id, "ADEQUATE") or DecisionOption.objects.filter(
            source_node_id=attempt.current_node_id
        ).first()
        game_service.choose_decision(a.attempt_id, a.token, good.id, a.student)
    attempt = SimulationAttempt.objects.get(pk=a.attempt_id)
    assert attempt.status == "COMPLETED"
    report = attempt_report.frozen_report_for(attempt.id)
    # el caso sembrado no declara competencias (sin declaración no hay nivel): el reporte de esta prueba trae niveles
    report["competencyLevels"] = [{"code": code, "level": "DESTACADO"} for code in SEEDED]
    _system(attempt.id).delete()

    outcomes = run_concurrently(
        lambda: system_evaluation.record_system_evaluation(attempt, report),
        lambda: system_evaluation.record_system_evaluation(attempt, report),
    )

    assert [o.error for o in outcomes] == [None, None]
    assert _system(attempt.id).count() == 1
    assert {o.value.pk for o in outcomes} == {_system(attempt.id).get().pk}


# ─── lo que ya se veía no cambia (Review Focus 1) ─────────────────────────────────────────────
def test_el_formulario_del_docente_sigue_pendiente_hasta_que_el_docente_evalua(completed, profesor):
    _, attempt_id, _ = completed
    assert _system(attempt_id).count() == 1

    form = cl(profesor).get(f"{TEACHER_BASE}/attempts/{attempt_id}/rubric-evaluation").data["data"]

    assert form["status"] == "PENDING"
    assert all(item["level"] is None and item["score"] is None for item in form["items"])


def test_la_evaluacion_del_docente_convive_con_la_del_sistema_y_es_la_que_el_formulario_muestra(completed, profesor):
    _, attempt_id, _ = completed
    form = cl(profesor).get(f"{TEACHER_BASE}/attempts/{attempt_id}/rubric-evaluation").data["data"]
    scores = [{"criterionId": item["criterionId"], "level": "LOGRADO"} for item in form["items"]]

    saved = cl(profesor).post(
        f"{TEACHER_BASE}/attempts/{attempt_id}/rubric-evaluation", {"scores": scores, "comment": "Bien"}, format="json"
    )

    assert saved.status_code == 200, saved.data
    assert saved.data["data"]["status"] == "EVALUATED"
    assert {item["level"] for item in saved.data["data"]["items"]} == {"LOGRADO"}  # no los DESTACADO del sistema
    assert RubricEvaluation.objects.filter(attempt_id=attempt_id).count() == 2


def test_el_estudiante_no_ve_la_evaluacion_del_sistema_en_su_evaluacion(completed, profesor):
    client, attempt_id, _ = completed
    assert client.get(f"{BASE}/attempts/{attempt_id}/evaluation").data["data"]["evaluations"] == []

    form = cl(profesor).get(f"{TEACHER_BASE}/attempts/{attempt_id}/rubric-evaluation").data["data"]
    scores = [{"criterionId": item["criterionId"], "level": "LOGRADO"} for item in form["items"]]
    cl(profesor).post(f"{TEACHER_BASE}/attempts/{attempt_id}/rubric-evaluation", {"scores": scores}, format="json")

    seen = client.get(f"{BASE}/attempts/{attempt_id}/evaluation").data["data"]["evaluations"]
    assert [evaluation["origin"] for evaluation in seen] == ["DOCENTE"]


def test_la_traza_del_docente_separa_su_evaluacion_de_la_del_sistema(completed, profesor):
    _, attempt_id, _ = completed

    trace = cl(profesor).get(f"{TEACHER_BASE}/attempts/{attempt_id}/trace").data["data"]

    assert trace["rubricEvaluations"] == []  # el cliente marca «evaluación aplicada» si hay alguna con nivel
    # Plegada: antes de que el docente guarde la suya, la valoración del sistema no viaja (no ancla su juicio).
    assert trace["systemEvaluation"] is None
    assert trace["systemEvaluationAvailable"] is True

    form = cl(profesor).get(f"{TEACHER_BASE}/attempts/{attempt_id}/rubric-evaluation").data["data"]
    scores = [{"criterionId": item["criterionId"], "level": "EN_PROCESO"} for item in form["items"]]
    cl(profesor).post(f"{TEACHER_BASE}/attempts/{attempt_id}/rubric-evaluation", {"scores": scores}, format="json")

    trace = cl(profesor).get(f"{TEACHER_BASE}/attempts/{attempt_id}/trace").data["data"]
    assert [e["origin"] for e in trace["rubricEvaluations"]] == ["DOCENTE"]
    assert trace["systemEvaluation"]["origin"] == "SISTEMA"
    assert trace["systemEvaluation"]["overallLevel"] == "DESTACADO"
    assert trace["systemEvaluation"]["totalScore"] is None  # sin RUBRIC_NUMERIC_TOTAL no viaja un número
    assert isinstance(trace["systemEvaluation"]["competencyLevels"], list)
    assert trace["systemEvaluationAvailable"] is True


def test_un_intento_sin_evaluacion_del_sistema_trae_la_clave_nula(estudiante, case_version_id, profesor):
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)

    trace = cl(profesor).get(f"{TEACHER_BASE}/attempts/{attempt_id}/trace").data["data"]

    assert trace["systemEvaluation"] is None
    assert trace["systemEvaluationAvailable"] is False


def test_el_reporte_de_grupo_cuenta_solo_las_rubricas_que_aplico_el_docente(completed, profesor, case_version_id):
    _, attempt_id, _ = completed
    grupo = Grupo.objects.get(codigo="WORLD1")

    before = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}?caseVersionId={case_version_id}").data["data"]["simulacion"]
    assert before["rubricasAplicadas"] == 0
    assert [e["rubricasAplicadas"] for e in before["estudiantes"]] == [0]

    form = cl(profesor).get(f"{TEACHER_BASE}/attempts/{attempt_id}/rubric-evaluation").data["data"]
    scores = [{"criterionId": item["criterionId"], "level": "LOGRADO"} for item in form["items"]]
    cl(profesor).post(f"{TEACHER_BASE}/attempts/{attempt_id}/rubric-evaluation", {"scores": scores}, format="json")

    after = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}?caseVersionId={case_version_id}").data["data"]["simulacion"]
    assert after["rubricasAplicadas"] == 1
    assert [e["rubricasAplicadas"] for e in after["estudiantes"]] == [1]
