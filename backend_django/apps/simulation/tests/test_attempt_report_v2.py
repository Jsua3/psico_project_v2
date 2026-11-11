"""E6-1d · El reporte congelado v2: perfil por competencia, no recomendadas, cobertura de reflexión y evidencia clave.

Al cerrar un intento el reporte (``attempt_reports``) pasa a ``schemaVersion 2`` con cuatro claves nuevas (R2):
``competencyLevels`` (``[{code, name, level}]``), ``nonRecommendedCount``, ``reflectionCoverage`` y
``keyLearningEvidence``. Lo cerrado no cambia (Review Focus 5 del maestro) y un reporte v1 sigue leyéndose tal cual,
sin las claves nuevas. Nunca viaja un índice numérico (RN-09): solo los nombres de los niveles.

Desde la Tarea 9 los intentos nuevos cierran en ``schemaVersion 3``, que conserva esas cuatro claves (la analítica lee v2 y v3
igual); el archivo conserva su nombre porque prueba lo que sobrevive. Lo propio de la v3 está en
``test_completion_report_contract.py``.
"""
import json
import uuid
from types import SimpleNamespace

import pytest
from django.core.management import call_command
from django.db import connection

from apps.simulation.assessment import competencies as assessment_competencies
from apps.simulation.assessment import definitions, evidence
from apps.simulation.models import (
    AttemptReport,
    Competency,
    DecisionOption,
    FormativeLevel,
    Rubric,
    RubricCriterion,
    SimulationAttempt,
)
from apps.simulation.services import attempt_report

from .competency_support import SEEDED_CODES, declare_all_seeded, declare_competencies
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

NEW_KEYS = ("competencyLevels", "nonRecommendedCount", "reflectionCoverage", "keyLearningEvidence", "profileRules")
SEEDED_COMPETENCIES = list(SEEDED_CODES)


@pytest.fixture(autouse=True)
def seeded_declares_destacado(request):
    """El caso sembrado no declara competencias y sin declaración no hay nivel: aquí todas declaran ``DESTACADO``.

    Solo para las pruebas que juegan el caso; la que prueba «sin declaración» las quita dentro de la prueba.
    """
    if "case_version_id" in request.fixturenames:
        declare_all_seeded(request.getfixturevalue("case_version_id"))


# ─── la evidencia: puro ───────────────────────────────────────────────────────────────────────
def _decision(classification="ADEQUATE", prohibited=False, event_type="DECISION_SELECTED", node_id=1):
    response_class = "CONTRAINDICATED" if prohibited else {
        "ADEQUATE": "RECOMMENDED", "RISKY": "RISKY", "INADEQUATE": "CONTRAINDICATED",
    }[classification]
    option = SimpleNamespace(response_class=response_class)
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
def test_las_no_recomendadas_son_las_decisiones_registradas_con_riesgo_o_contraindicadas(events, expected):
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


def test_el_reporte_nuevo_es_v3_y_conserva_las_claves_que_nacieron_en_la_v2(completed):
    """La v3 sigue llevando lo de E6-1d (perfil, no recomendadas, cobertura, evidencia): la analítica lee v2 y v3 igual."""
    _, attempt_id, _ = completed

    row, payload = _frozen(attempt_id)

    assert row.report_schema_version == 4 and payload["schemaVersion"] == 4
    assert all(key in payload for key in NEW_KEYS)


def test_un_recorrido_adecuado_da_destacado_en_las_competencias_de_la_rubrica(completed):
    _, attempt_id, _ = completed

    _, payload = _frozen(attempt_id)

    assert [entry["code"] for entry in payload["competencyLevels"]] == SEEDED_COMPETENCIES
    assert {entry["level"] for entry in payload["competencyLevels"]} == {"DESTACADO"}
    assert all(
        set(entry) == {"code", "name", "level", "basis", "evidence"} and entry["name"]
        for entry in payload["competencyLevels"]
    )
    assert {entry["basis"] for entry in payload["competencyLevels"]} == {"DECLARED"}
    for entry in payload["competencyLevels"]:  # las seis decisiones del recorrido sostienen cada nivel, en orden
        assert [item["order"] for item in entry["evidence"]] == [1, 2, 3, 4, 5, 6]
        assert {item["level"] for item in entry["evidence"]} == {"DESTACADO"}
        assert all(item["nodeTitle"] and item["optionText"] and item["class"] for item in entry["evidence"])
    assert payload["nonRecommendedCount"] == 0
    assert payload["reflectionCoverage"] == {"definition": "ANY", "reflections": 0, "decisionScenes": 6, "covered": False}
    assert payload["keyLearningEvidence"] is False  # no escribió ninguna reflexión


def test_el_caso_sembrado_sin_declaraciones_deja_todas_las_competencias_sin_evidencia(estudiante, case_version_id):
    """Revisión de foco 3, de punta a punta: sin ``effects.competencies`` nadie inventa un nivel."""
    declare_competencies(case_version_id, {})  # quita lo que las demás pruebas declaran
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    _complete(client, attempt_id, token)

    _, payload = _frozen(attempt_id)

    assert [entry["code"] for entry in payload["competencyLevels"]] == SEEDED_COMPETENCIES
    assert all(e["level"] is None and e["basis"] is None and e["evidence"] == [] for e in payload["competencyLevels"])
    assert payload["keyLearningEvidence"] is False  # sin ningún nivel no hay evidencia clave


def test_el_reporte_sella_la_version_de_la_regla_con_la_que_se_calculo_el_perfil(completed):
    _, attempt_id, _ = completed

    _, payload = _frozen(attempt_id)

    assert payload["profileRules"] == definitions.PROFILE_RULES


def test_si_el_perfil_falla_el_cierre_se_completa_con_el_perfil_vacio(estudiante, case_version_id, monkeypatch, caplog):
    """Es un dato derivado: el estudiante no puede quedarse sin terminar el caso porque falle su cálculo."""
    def broken(attempt, events):
        raise RuntimeError("el perfil se rompió")

    monkeypatch.setattr(assessment_competencies, "competency_profile", broken)
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)

    with caplog.at_level("ERROR"):
        _complete(client, attempt_id, token)

    assert SimulationAttempt.objects.get(pk=attempt_id).status == "COMPLETED"
    _, payload = _frozen(attempt_id)
    assert payload["competencyLevels"] == [] and payload["keyLearningEvidence"] is False
    assert any("perfil por competencia" in message for message in caplog.messages)


def test_un_error_real_de_base_de_datos_en_el_perfil_no_aborta_el_cierre(estudiante, case_version_id, monkeypatch):
    """Un ``RuntimeError`` no aborta la transacción de PostgreSQL; un error de SQL sí, y solo el punto de guardado lo salva."""
    def broken(attempt, events):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1/0")

    monkeypatch.setattr(assessment_competencies, "competency_profile", broken)
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)

    _complete(client, attempt_id, token)

    assert SimulationAttempt.objects.get(pk=attempt_id).status == "COMPLETED"
    assert AttemptReport.objects.filter(attempt_id=attempt_id).exists()


def test_el_reporte_no_trae_ningun_indice_numerico_de_competencia(completed):
    _, attempt_id, _ = completed

    _, payload = _frozen(attempt_id)

    assert not any(isinstance(value, (int, float)) and not isinstance(value, bool)
                   for entry in payload["competencyLevels"] for value in entry.values())
    assert all(entry["level"] in FormativeLevel.values for entry in payload["competencyLevels"])


def test_una_contraindicada_registrada_deja_a_todas_en_en_proceso_y_cuenta_como_no_recomendada(
    estudiante, case_version_id,
):
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    node = SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    first, second = DecisionOption.objects.filter(
        source_node_id=node, response_class="CONTRAINDICATED"
    ).order_by("id")[:2]
    # la regla de segunda oportunidad: la primera respuesta mala no se aplica; la segunda (OTRA opción: repetir la
    # misma en menos de 2 s es un doble clic) queda registrada
    assert _decide(client, attempt_id, token, first.id, requestId="req-critica-0001").status_code == 200
    assert _decide(client, attempt_id, token, second.id, requestId="req-critica-0002").status_code == 200
    _complete(client, attempt_id, token)

    _, payload = _frozen(attempt_id)

    assert payload["nonRecommendedCount"] == 1
    assert {entry["level"] for entry in payload["competencyLevels"]} == {"EN_PROCESO"}  # el promedio da 4, con tope
    assert {item["class"] for item in payload["competencyLevels"][0]["evidence"]} == {"RECOMMENDED", "CONTRAINDICATED"}


def test_una_con_riesgo_cuenta_como_no_recomendada_pero_el_nivel_es_el_que_declara_el_autor(
    estudiante, case_version_id,
):
    """«No recomendada» se mide por la clase; el nivel, por lo declarado (aquí la con riesgo declara ``LOGRADO``)."""
    declare_all_seeded(case_version_id, "LOGRADO", response_classes=["RISKY"])
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    reached = False
    for step in range(30):
        attempt = SimulationAttempt.objects.get(pk=attempt_id)
        if attempt.status != "IN_PROGRESS":
            break
        options = DecisionOption.objects.filter(source_node_id=attempt.current_node_id).order_by("id")
        risky, contraindicated = options.filter(response_class="RISKY").first(), options.filter(
            response_class="CONTRAINDICATED"
        ).first()
        if not reached and risky is not None and contraindicated is not None:
            reached = True  # la contraindicada concede la segunda oportunidad (no se aplica); la con riesgo SÍ se registra
            assert _decide(client, attempt_id, token, contraindicated.id, requestId="req-reintento-0001").status_code == 200
            chosen = risky
        else:
            chosen = options.filter(response_class="RECOMMENDED").first() or options.first()
        assert _decide(client, attempt_id, token, chosen.id, requestId=f"req-paso-{step:04d}-id").status_code == 200
    assert reached and SimulationAttempt.objects.get(pk=attempt_id).status == "COMPLETED"

    _, payload = _frozen(attempt_id)

    assert payload["nonRecommendedCount"] == 1
    assert {entry["level"] for entry in payload["competencyLevels"]} == {"DESTACADO"}  # (5 × 4 + 3) / 6 = 3,8 → 4
    risky_evidence = [i for i in payload["competencyLevels"][0]["evidence"] if i["class"] == "RISKY"]
    assert len(risky_evidence) == 1 and risky_evidence[0]["level"] == "LOGRADO"


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
    good = DecisionOption.objects.filter(source_node_id=first, response_class="RECOMMENDED").first()
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
        effects=json.dumps({"competencies": {"REFLEXION": "EN_INICIO"}}),
        response_class="CONTRAINDICATED",
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


def test_un_intento_sin_fila_se_sirve_en_vivo_como_v3_y_el_comando_lo_congela_como_v3(completed):
    client, attempt_id, token = completed
    AttemptReport.objects.filter(attempt_id=attempt_id).delete()  # un intento anterior a E1-8

    live = client.get(f"{BASE}/attempts/{attempt_id}/report", HTTP_X_SIEP_ATTEMPT_TOKEN=token).data["data"]

    assert live["schemaVersion"] == 4 and all(key in live for key in NEW_KEYS)
    assert AttemptReport.objects.filter(attempt_id=attempt_id).count() == 0  # leer no escribe

    call_command("backfill_attempt_reports")

    row, payload = _frozen(attempt_id)
    assert row.report_schema_version == 4 and payload["competencyLevels"] == live["competencyLevels"]


def test_un_caso_sin_rubrica_activa_cierra_con_el_perfil_vacio(estudiante, case_version_id):
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    Rubric.objects.update(active=False)  # ni la del caso ni la rúbrica por defecto
    _complete(client, attempt_id, token)

    _, payload = _frozen(attempt_id)

    assert payload["competencyLevels"] == []
    assert payload["keyLearningEvidence"] is False
