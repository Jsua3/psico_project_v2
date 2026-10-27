"""E1-8 · El reporte del intento se congela al cerrar (RF-22, RF-23, CU-12, TD-08, N2).

Review Focus 5: un reporte cerrado no puede cambiar cuando cambian las reglas o los textos
del caso. Al completarse un intento se persiste, dentro de la misma transacción, una fila
inmutable de ``attempt_reports`` con el reporte (superconjunto del de cierre de siempre),
su ``decisionReview[]``, el ordinal del intento y la huella de la definición del caso.
"""
import json

import pytest
from django.core.management import call_command
from django.db.models import F

from apps.simulation.casedef.vocabulary import ResponseClass
from apps.simulation.models import (
    AttemptEvent,
    AttemptReport,
    CaseVersion,
    DecisionOption,
    SimulationAttempt,
    SimulationNode,
)
from apps.simulation.services import case_state

from .test_world import _start, case_version_id, cl, estudiante  # noqa: F401  (fixtures)

pytestmark = [pytest.mark.req("RF-22"), pytest.mark.req("RF-23"), pytest.mark.req("CU-12"), pytest.mark.req("TD-08")]

BASE = "/api/simulation"


def _decide(client, attempt_id, token, option_id, **extra):
    return client.post(
        f"{BASE}/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": option_id, **extra},
        format="json",
    )


def _complete(client, attempt_id, token, first_bad=False):
    """Recorre el caso con la opción adecuada de cada nodo (con un reintento al inicio si se pide)."""
    for step in range(30):
        attempt = SimulationAttempt.objects.get(pk=attempt_id)
        if attempt.status != "IN_PROGRESS":
            break
        options = DecisionOption.objects.filter(source_node_id=attempt.current_node_id).order_by("id")
        if first_bad and step == 0:
            bad = options.filter(classification__in=["RISKY", "INADEQUATE"]).first()
            assert _decide(client, attempt_id, token, bad.id, requestId="req-reintento-0001").status_code == 200
        good = options.filter(classification="ADEQUATE").first() or options.first()
        response = _decide(client, attempt_id, token, good.id, requestId=f"req-paso-{step:04d}-id")
        assert response.status_code == 200, response.data
    assert SimulationAttempt.objects.get(pk=attempt_id).status == "COMPLETED"


def _reports(client, attempt_id, token):
    headers = {"HTTP_X_SIEP_ATTEMPT_TOKEN": token}
    return {
        "report": client.get(f"{BASE}/attempts/{attempt_id}/report", **headers).data["data"],
        "completion": client.get(f"{BASE}/attempts/{attempt_id}/completion-report", **headers).data["data"],
        "student": client.get(f"{BASE}/attempts/{attempt_id}/student-report").data["data"],
    }


@pytest.fixture
def completed(estudiante, case_version_id):
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    _complete(client, attempt_id, token)
    return client, attempt_id, token


def test_completar_persiste_una_fila_con_version_de_esquema_ordinal_y_huella(completed):
    _, attempt_id, _ = completed

    row = AttemptReport.objects.get(attempt_id=attempt_id)

    assert row.report_schema_version == 3  # modelo de métricas: hitos, persona y clases (ver test_completion_report_contract.py)
    assert row.attempt_ordinal == 1
    assert len(row.definition_hash) == 64
    payload = json.loads(row.report_json)
    assert payload["schemaVersion"] == 3 and payload["ordinal"] == 1
    assert payload["definitionHash"] == row.definition_hash
    assert payload["status"] == "COMPLETED"


def test_mutar_efectos_y_textos_despues_de_cerrar_no_cambia_el_reporte(completed, case_version_id):
    client, attempt_id, token = completed
    before = _reports(client, attempt_id, token)

    DecisionOption.objects.filter(case_version_id=case_version_id).update(
        score_delta=F("score_delta") + 100, classification="INADEQUATE", response_class="CONTRAINDICATED",
        consequence_text="otra consecuencia", feedback_text="otra explicación",
        theory_basis="otra teoría", immediate_feedback="otro mensaje", prohibited_conduct=True,
    )
    SimulationNode.objects.filter(case_version_id=case_version_id).update(title="otro título", narrative="otra")
    CaseVersion.objects.filter(pk=case_version_id).update(rules=json.dumps({"secondChance": False}))

    after = _reports(client, attempt_id, token)

    assert after == before


def test_el_reporte_congelado_es_inmutable(completed):
    _, attempt_id, _ = completed
    row = AttemptReport.objects.get(attempt_id=attempt_id)
    row.report_json = "{}"

    with pytest.raises(RuntimeError):
        row.save()

    assert json.loads(AttemptReport.objects.get(attempt_id=attempt_id).report_json)["status"] == "COMPLETED"


def test_decision_review_trae_cada_decision_con_su_consecuencia_y_su_retroalimentacion(
    estudiante, case_version_id
):
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    start_node = SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    good = DecisionOption.objects.filter(source_node_id=start_node, classification="ADEQUATE").first()
    DecisionOption.objects.filter(pk=good.pk).update(
        consequence_text="Consecuencia propia", feedback_text="Explicación pedagógica", theory_basis="Teoría X",
    )
    _complete(client, attempt_id, token, first_bad=True)

    review = AttemptReport.objects.get(attempt_id=attempt_id)
    payload = json.loads(review.report_json)["decisionReview"]

    first = payload[0]
    assert [item["order"] for item in payload] == list(range(1, len(payload) + 1))
    assert first["nodeId"] == start_node
    assert first["chosen"] == {"optionId": good.id, "text": good.text}
    assert first["consequence"] == "Consecuencia propia"
    assert first["feedback"] == {"explanation": "Explicación pedagógica", "theoryBasis": "Teoría X"}
    assert first["class"] == case_state.response_class_of(good).value
    assert first["class"] in {member.value for member in ResponseClass}
    assert "classification" not in first  # la clasificación antigua ya no viaja
    assert first["prohibited"] is (first["class"] == ResponseClass.CONTRAINDICATED.value)
    assert first["reconsidered"]["firstOptionText"]
    # Las decisiones sin textos propios caen a la narrativa del nodo y al mensaje inmediato.
    second = payload[1]
    option = DecisionOption.objects.get(pk=second["chosen"]["optionId"])
    assert second["consequence"] == option.target_node.narrative
    assert second["feedback"]["explanation"] == option.immediate_feedback
    assert "theoryBasis" not in second["feedback"]
    assert "reconsidered" not in second


@pytest.mark.parametrize("status", ["IN_PROGRESS", "PAUSED", "REPLACED", "SAFE_EXITED"])
def test_un_intento_no_completado_responde_409_con_codigo(estudiante, case_version_id, status):
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    SimulationAttempt.objects.filter(pk=attempt_id).update(status=status)

    response = client.get(f"{BASE}/attempts/{attempt_id}/report", HTTP_X_SIEP_ATTEMPT_TOKEN=token)

    assert response.status_code == 409
    assert response.data["code"] == "ATTEMPT_NOT_COMPLETED"


def test_el_ordinal_sube_con_cada_intento_del_estudiante_en_el_caso(estudiante, case_version_id):
    client = cl(estudiante)
    ordinals = []
    for _ in range(2):
        attempt_id, token = _start(client, case_version_id)
        _complete(client, attempt_id, token)
        ordinals.append(AttemptReport.objects.get(attempt_id=attempt_id).attempt_ordinal)

    assert ordinals == [1, 2]


def test_el_reporte_no_trae_el_texto_de_la_bitacora(estudiante, case_version_id):
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    node_id = SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    client.post(
        f"{BASE}/attempts/{attempt_id}/reflections",
        {"attemptToken": token, "nodeId": node_id, "text": "SECRETO-DE-LA-BITACORA"}, format="json",
    )
    _complete(client, attempt_id, token)

    reports = _reports(client, attempt_id, token)

    assert "SECRETO-DE-LA-BITACORA" not in json.dumps(reports)
    assert reports["report"]["reflections"] == [
        {"nodeId": node_id, "nodeTitle": SimulationNode.objects.get(pk=node_id).title, "locked": True}
    ]


def test_un_intento_completado_sin_fila_se_sirve_en_vivo_y_el_comando_lo_congela(completed):
    client, attempt_id, token = completed
    AttemptReport.objects.filter(attempt_id=attempt_id).delete()  # un intento anterior a E1-8

    live = client.get(f"{BASE}/attempts/{attempt_id}/report", HTTP_X_SIEP_ATTEMPT_TOKEN=token)

    assert live.status_code == 200
    assert live.data["data"]["schemaVersion"] == 3
    assert AttemptReport.objects.filter(attempt_id=attempt_id).count() == 0  # leer no escribe

    call_command("backfill_attempt_reports")
    call_command("backfill_attempt_reports")

    assert AttemptReport.objects.filter(attempt_id=attempt_id).count() == 1


#: Un reporte v2 tal como lo congelaba el sistema antes del modelo de métricas: con puntaje, estrés y clasificación.
#: Está escrito a mano a propósito: lo cerrado no se toca ni se recalcula.
V2_CONGELADO = {
    "schemaVersion": 2, "ordinal": 1, "definitionHash": "b" * 64, "attemptId": "x", "caseTitle": "Caso", "status": "COMPLETED",
    "finalScore": 70, "finalStress": 35, "metrics": {"professionalScore": 70, "sceneStress": 35},
    "adequateDecisions": 4, "riskyDecisions": 1, "inadequateDecisions": 2, "prohibitedDecisions": 1,
    "competencies": ["Comunicación ética y contención emocional"],
    "counts": {"adequate": 4, "risky": 1, "inadequate": 2, "prohibited": 1, "retries": 0},
    "decisionReview": [{"order": 1, "classification": "ADEQUATE", "prohibited": False}],
    "competencyLevels": [], "profileRules": "borrador-1", "nonRecommendedCount": 3,
    "recommendations": ["Practica estrategias de autorregulación antes de escenarios de alta carga emocional."],
    "timeline": [{"type": "DECISION_SELECTED", "classification": "ADEQUATE", "scoreDelta": 5, "stressDelta": -2}],
}


def _congelar_v2(attempt_id):
    """Cambia la fila congelada del intento por el reporte v2 literal (un intento cerrado antes de la v3)."""
    AttemptReport.objects.filter(attempt_id=attempt_id).delete()
    return AttemptReport.objects.create(
        attempt_id=attempt_id, report_json=json.dumps(V2_CONGELADO, ensure_ascii=False),
        report_schema_version=2, definition_hash="b" * 64, attempt_ordinal=1,
    )


def test_un_reporte_v2_congelado_se_lee_tal_cual_por_las_tres_rutas(completed):
    client, attempt_id, token = completed
    _congelar_v2(attempt_id)

    reports = _reports(client, attempt_id, token)

    # Sin transformar: conserva su puntaje, su estrés y su clasificación, y no gana claves de la v3.
    assert reports["report"] == V2_CONGELADO
    assert reports["completion"] == V2_CONGELADO
    assert reports["student"] == V2_CONGELADO
    assert "milestones" not in reports["report"] and "persona" not in reports["report"]


def test_el_historial_no_expone_los_conteos_de_un_reporte_v2_congelado(completed):
    client, attempt_id, _ = completed
    _congelar_v2(attempt_id)

    history = {h["attemptId"]: h for h in client.get(f"{BASE}/attempts/history").data["data"]}

    # El reporte v2 conserva sus cifras al servirse como reporte; la lista del historial ya no las repite.
    entry = history[attempt_id]
    assert not {"accumulatedScore", "adequateDecisions", "riskyDecisions", "inadequateDecisions",
                "prohibitedDecisions"} & set(entry)


def test_el_historial_sigue_respondiendo_con_un_reporte_v3_que_ya_no_trae_conteos_por_clasificacion(completed):
    client, attempt_id, _ = completed
    frozen = json.loads(AttemptReport.objects.get(attempt_id=attempt_id).report_json)
    assert frozen["schemaVersion"] == 3 and "adequateDecisions" not in frozen

    response = client.get(f"{BASE}/attempts/history")

    assert response.status_code == 200
    assert attempt_id in {h["attemptId"] for h in response.data["data"]}


def test_la_huella_de_la_definicion_mira_la_clase_los_efectos_y_las_reglas_y_no_las_columnas_retiradas(
    case_version_id,
):
    from apps.simulation.services import attempt_report

    base = attempt_report.case_definition_hash(case_version_id)
    option = DecisionOption.objects.filter(case_version_id=case_version_id).order_by("id").first()

    # Las columnas retiradas ya no cuentan.
    DecisionOption.objects.filter(pk=option.pk).update(
        classification="INADEQUATE", score_delta=99, stress_delta=99, prohibited_penalty=99, prohibited_conduct=True,
    )
    assert attempt_report.case_definition_hash(case_version_id) == base

    # La clase, los efectos, las reglas y la intensidad de la escena sí.
    other = "CONTRAINDICATED" if option.response_class != "CONTRAINDICATED" else "RECOMMENDED"
    DecisionOption.objects.filter(pk=option.pk).update(response_class=other)
    by_class = attempt_report.case_definition_hash(case_version_id)
    assert by_class != base
    DecisionOption.objects.filter(pk=option.pk).update(effects=json.dumps({"milestones": ["nuevo-hito"]}))
    by_effects = attempt_report.case_definition_hash(case_version_id)
    assert by_effects != by_class
    CaseVersion.objects.filter(pk=case_version_id).update(rules=json.dumps({"secondChance": True}))
    by_rules = attempt_report.case_definition_hash(case_version_id)
    assert by_rules != by_effects
    node = SimulationNode.objects.filter(case_version_id=case_version_id).order_by("id").first()
    SimulationNode.objects.filter(pk=node.pk).update(intensity="LOW" if node.intensity != "LOW" else "MEDIUM")
    assert attempt_report.case_definition_hash(case_version_id) != by_rules


def test_el_reporte_incluye_el_tiempo_por_escena(completed):
    _, attempt_id, _ = completed

    payload = json.loads(AttemptReport.objects.get(attempt_id=attempt_id).report_json)

    assert payload["timeByScene"], "al menos la escena inicial"
    assert all({"nodeId", "seconds"} <= set(scene) for scene in payload["timeByScene"])
    assert len(AttemptEvent.objects.filter(attempt_id=attempt_id, event_type="ATTEMPT_COMPLETED")) == 1
