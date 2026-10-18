"""E6-1d · El reporte congelado v2: perfil por competencia, no recomendadas, cobertura de reflexión y evidencia clave.

Al cerrar un intento el reporte (``attempt_reports``) pasa a ``schemaVersion 2`` con cuatro claves nuevas (R2):
``competencyLevels`` (``[{code, name, level}]``), ``nonRecommendedCount``, ``reflectionCoverage`` y
``keyLearningEvidence``. Lo cerrado no cambia (Review Focus 5 del maestro) y un reporte v1 sigue leyéndose tal cual,
sin las claves nuevas. Nunca viaja un índice numérico (RN-09): solo los nombres de los niveles.
"""
import json
import uuid
from types import SimpleNamespace

import pytest
from django.core.management import call_command

from apps.simulation.assessment import evidence
from apps.simulation.models import (
    AttemptReport,
    Competency,
    DecisionOption,
    FormativeLevel,
    Rubric,
    RubricCriterion,
    SimulationAttempt,
)
from apps.simulation.services import attempt_report, case_effects

from .test_attempt_report_frozen import (  # noqa: F401  (fixtures y ayudantes)
    BASE,
    _complete,
    _decide,
    _reports,
    _start,
    case_version_id,
    cl,
    completed,
    estudiante,
)

pytestmark = [pytest.mark.req("RQ-NEG-002"), pytest.mark.req("RQ-NEG-003"), pytest.mark.req("RQ-NEG-004")]

NEW_KEYS = ("competencyLevels", "nonRecommendedCount", "reflectionCoverage", "keyLearningEvidence")
SEEDED_COMPETENCIES = ["CONTENCION", "MARCO_NORMATIVO", "INTERVENCION_ETICA", "REFLEXION"]


# ─── la evidencia: puro ───────────────────────────────────────────────────────────────────────
def _decision(classification="ADEQUATE", prohibited=False, event_type="DECISION_SELECTED", node_id=1):
    option = SimpleNamespace(classification=classification, prohibited_conduct=prohibited)
    return SimpleNamespace(event_type=event_type, decision_option_id=1, decision_option=option, node_id=node_id)


@pytest.mark.parametrize(
    ("events", "expected"),
    [
        ([], 0),
        ([_decision("ADEQUATE")], 0),
        ([_decision("RISKY")], 1),
        ([_decision("INADEQUATE")], 1),
        ([_decision("ADEQUATE", prohibited=True, event_type="PROHIBITED_DECISION_SELECTED")], 1),
        ([_decision("RISKY"), _decision("INADEQUATE"), _decision("ADEQUATE"), _decision("RISKY")], 3),
        # el reintento es una respuesta que el juego no aplicó: no cuenta
        ([_decision("INADEQUATE", event_type="DECISION_RETRY_REQUIRED")], 0),
        ([_decision("INADEQUATE", prohibited=True, event_type="PROHIBITED_DECISION_RETRY_REQUIRED")], 0),
        ([SimpleNamespace(event_type="NODE_ENTERED", decision_option_id=None, decision_option=None, node_id=1)], 0),
    ],
)
def test_las_no_recomendadas_son_las_decisiones_registradas_riesgosas_inadecuadas_o_prohibidas(events, expected):
    assert evidence.non_recommended_count(events) == expected


def test_las_escenas_con_decision_son_las_de_las_decisiones_registradas():
    events = [
        _decision(node_id=3), _decision(node_id=3), _decision(node_id=5),
        _decision("RISKY", event_type="DECISION_RETRY_REQUIRED", node_id=9),
    ]

    assert evidence.decision_scene_ids(events) == [3, 5]


@pytest.mark.parametrize(
    ("reflections", "scenes", "definition", "covered"),
    [
        ([], [3, 5], "ANY", False),
        ([3], [3, 5], "ANY", True),
        ([9], [3, 5], "ANY", True),  # cualquier nota: aunque sea de una escena sin decisión
        ([], [], "ANY", False),
        ([3], [3, 5], "PER_DECISION_SCENE", False),
        ([3, 5], [3, 5], "PER_DECISION_SCENE", True),
        ([3, 5, 9], [3, 5], "PER_DECISION_SCENE", True),
        ([9], [3, 5], "PER_DECISION_SCENE", False),
        ([3], [], "PER_DECISION_SCENE", False),  # sin escenas con decisión no hay a qué cubrir
        ([3, 3, 3], [5, 5], "ANY", True),  # los conteos son de escenas distintas
    ],
)
def test_la_cobertura_de_reflexion_sigue_la_definicion(reflections, scenes, definition, covered):
    coverage = evidence.reflection_coverage(reflections, scenes, definition)

    assert coverage == {
        "definition": definition, "reflections": len(set(reflections)), "decisionScenes": len(set(scenes)),
        "covered": covered,
    }


@pytest.mark.parametrize(
    ("completed_attempt", "covered", "levels", "expected"),
    [
        (True, True, [{"level": "LOGRADO"}], True),
        (True, True, [{"level": None}, {"level": "EN_PROCESO"}], True),
        (False, True, [{"level": "LOGRADO"}], False),  # no completado
        (True, False, [{"level": "LOGRADO"}], False),  # sin reflexión
        (True, True, [], False),  # sin perfil de competencias
        (True, True, [{"level": None}], False),  # perfil sin ningún nivel
    ],
)
def test_la_evidencia_clave_es_completado_con_reflexion_y_perfil(completed_attempt, covered, levels, expected):
    assert evidence.key_learning_evidence(completed_attempt, {"covered": covered}, levels) is expected


# ─── el reporte congelado ─────────────────────────────────────────────────────────────────────
def _frozen(attempt_id):
    row = AttemptReport.objects.get(attempt_id=attempt_id)
    return row, json.loads(row.report_json)


def test_el_reporte_nuevo_es_v2_con_las_cuatro_claves(completed):
    _, attempt_id, _ = completed

    row, payload = _frozen(attempt_id)

    assert row.report_schema_version == 2 and payload["schemaVersion"] == 2
    assert all(key in payload for key in NEW_KEYS)


def test_un_recorrido_adecuado_da_destacado_en_las_competencias_de_la_rubrica(completed):
    _, attempt_id, _ = completed

    _, payload = _frozen(attempt_id)

    assert [entry["code"] for entry in payload["competencyLevels"]] == SEEDED_COMPETENCIES
    assert {entry["level"] for entry in payload["competencyLevels"]} == {"DESTACADO"}
    assert all(set(entry) == {"code", "name", "level"} and entry["name"] for entry in payload["competencyLevels"])
    assert payload["nonRecommendedCount"] == 0
    assert payload["reflectionCoverage"] == {"definition": "ANY", "reflections": 0, "decisionScenes": 6, "covered": False}
    assert payload["keyLearningEvidence"] is False  # no escribió ninguna reflexión


def test_el_reporte_no_trae_ningun_indice_numerico_de_competencia(completed):
    _, attempt_id, _ = completed

    _, payload = _frozen(attempt_id)

    assert not any(isinstance(value, (int, float)) and not isinstance(value, bool)
                   for entry in payload["competencyLevels"] for value in entry.values())
    assert all(entry["level"] in FormativeLevel.values for entry in payload["competencyLevels"])


def test_una_decision_critica_registrada_deja_a_todas_en_en_proceso_y_cuenta_como_no_recomendada(
    estudiante, case_version_id,
):
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    node = SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    first, second = DecisionOption.objects.filter(source_node_id=node, classification="INADEQUATE").order_by("id")[:2]
    # la regla de segunda oportunidad: la primera respuesta mala no se aplica; la segunda (OTRA opción: repetir la
    # misma en menos de 2 s es un doble clic) queda registrada
    assert _decide(client, attempt_id, token, first.id, requestId="req-critica-0001").status_code == 200
    assert _decide(client, attempt_id, token, second.id, requestId="req-critica-0002").status_code == 200
    _complete(client, attempt_id, token)

    _, payload = _frozen(attempt_id)

    assert payload["nonRecommendedCount"] == 1
    assert {entry["level"] for entry in payload["competencyLevels"]} == {"EN_PROCESO"}  # el promedio da 4, con tope


def test_una_riesgosa_con_severidad_aceptable_cuenta_como_no_recomendada_pero_no_baja_el_nivel(
    estudiante, case_version_id,
):
    """«No recomendada» se mide por la clasificación; el nivel, por la severidad (aquí ``acceptable`` → LOGRADO)."""
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    first = DecisionOption.objects.filter(
        source_node_id=SimulationAttempt.objects.get(pk=attempt_id).current_node_id, classification="ADEQUATE",
    ).first()
    assert _decide(client, attempt_id, token, first.id, requestId="req-adecuada-0001").status_code == 200
    second_node = SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    risky = list(DecisionOption.objects.filter(source_node_id=second_node, classification="RISKY"))
    accepted = next(option for option in risky if case_effects.option_severity(option) == "acceptable")
    other = next(option for option in risky if option.id != accepted.id)
    assert _decide(client, attempt_id, token, other.id, requestId="req-riesgosa-0001").status_code == 200  # reintento
    assert _decide(client, attempt_id, token, accepted.id, requestId="req-riesgosa-0002").status_code == 200
    _complete(client, attempt_id, token)

    _, payload = _frozen(attempt_id)

    assert payload["nonRecommendedCount"] == 1
    assert {entry["level"] for entry in payload["competencyLevels"]} == {"DESTACADO"}  # (5 × 4 + 3) / 6 = 3,8 → 4


def test_con_una_reflexion_hay_cobertura_y_evidencia_clave(estudiante, case_version_id):
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    node_id = SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    saved = client.post(
        f"{BASE}/attempts/{attempt_id}/reflections",
        {"attemptToken": token, "nodeId": node_id, "text": "Lo que aprendí"}, format="json",
    )
    assert saved.status_code == 200
    _complete(client, attempt_id, token)

    _, payload = _frozen(attempt_id)

    assert payload["reflectionCoverage"] == {"definition": "ANY", "reflections": 1, "decisionScenes": 6, "covered": True}
    assert payload["keyLearningEvidence"] is True
    assert "Lo que aprendí" not in json.dumps(payload)


def test_un_intento_sin_completar_nunca_es_evidencia_clave_aunque_haya_reflexionado(estudiante, case_version_id):
    """El contrato de ``build_report_payload``: la evidencia clave exige un intento COMPLETADO (RQ-NEG-004)."""
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    first = SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    good = DecisionOption.objects.filter(source_node_id=first, classification="ADEQUATE").first()
    client.post(
        f"{BASE}/attempts/{attempt_id}/reflections",
        {"attemptToken": token, "nodeId": first, "text": "Una nota"}, format="json",
    )
    assert _decide(client, attempt_id, token, good.id, requestId="req-adecuada-0001").status_code == 200
    attempt = SimulationAttempt.objects.get(pk=attempt_id)
    assert attempt.status == "IN_PROGRESS"

    payload = attempt_report.build_report_payload(attempt, attempt_report.load_events(attempt.id))

    assert payload["reflectionCoverage"]["covered"] is True
    assert any(entry["level"] for entry in payload["competencyLevels"])  # tiene perfil y reflexión, pero no cerró
    assert payload["keyLearningEvidence"] is False


def test_con_una_nota_por_escena_la_cobertura_exige_una_en_cada_escena_con_decision(estudiante, case_version_id, settings):
    settings.REFLECTION_DEFINITION = "PER_DECISION_SCENE"
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    node_id = SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    client.post(
        f"{BASE}/attempts/{attempt_id}/reflections",
        {"attemptToken": token, "nodeId": node_id, "text": "Solo en la primera escena"}, format="json",
    )
    _complete(client, attempt_id, token)

    _, payload = _frozen(attempt_id)

    assert payload["reflectionCoverage"] == {
        "definition": "PER_DECISION_SCENE", "reflections": 1, "decisionScenes": 6, "covered": False,
    }
    assert payload["keyLearningEvidence"] is False


def test_cambiar_la_rubrica_el_catalogo_y_los_efectos_despues_de_cerrar_no_cambia_el_perfil(completed, case_version_id):
    client, attempt_id, token = completed
    before = _reports(client, attempt_id, token)

    Competency.objects.filter(code="CONTENCION").update(name="Otro nombre", code="OTRO_CODIGO")
    RubricCriterion.objects.filter(rubric__case_version_id=case_version_id).update(active=False)
    Rubric.objects.update(active=False)
    DecisionOption.objects.filter(case_version_id=case_version_id).update(
        effects=json.dumps({"severity": "critical", "competencies": {"REFLEXION": "EN_INICIO"}}),
        classification="INADEQUATE",
    )

    after = _reports(client, attempt_id, token)

    assert after == before
    assert before["report"]["competencyLevels"][0]["code"] == "CONTENCION"


def test_un_reporte_v1_se_lee_sin_error_y_sin_las_claves_nuevas(completed):
    client, attempt_id, token = completed
    row, payload = _frozen(attempt_id)
    legacy = {key: value for key, value in payload.items() if key not in NEW_KEYS}
    legacy["schemaVersion"] = 1
    AttemptReport.objects.filter(pk=row.pk).update(report_json=json.dumps(legacy), report_schema_version=1)

    reports = _reports(client, attempt_id, token)

    for name in ("report", "completion", "student"):
        assert reports[name]["schemaVersion"] == 1
        assert not any(key in reports[name] for key in NEW_KEYS), name


def test_un_intento_sin_fila_se_sirve_en_vivo_como_v2_y_el_comando_lo_congela_como_v2(completed):
    client, attempt_id, token = completed
    AttemptReport.objects.filter(attempt_id=attempt_id).delete()  # un intento anterior a E1-8

    live = client.get(f"{BASE}/attempts/{attempt_id}/report", HTTP_X_SIEP_ATTEMPT_TOKEN=token).data["data"]

    assert live["schemaVersion"] == 2 and all(key in live for key in NEW_KEYS)
    assert AttemptReport.objects.filter(attempt_id=attempt_id).count() == 0  # leer no escribe

    call_command("backfill_attempt_reports")

    row, payload = _frozen(attempt_id)
    assert row.report_schema_version == 2 and payload["competencyLevels"] == live["competencyLevels"]


def test_un_caso_sin_rubrica_activa_cierra_con_el_perfil_vacio(estudiante, case_version_id):
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    Rubric.objects.update(active=False)  # ni la del caso ni la rúbrica por defecto
    _complete(client, attempt_id, token)

    _, payload = _frozen(attempt_id)

    assert payload["competencyLevels"] == []
    assert payload["keyLearningEvidence"] is False
