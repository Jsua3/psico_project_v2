"""Pruebas de caracterización de ``build_completion_report`` (reporte de cierre).

Fijan la forma exacta del reporte y las reglas de negocio que lo llenan
(conteos, competencias, recomendaciones, resumen, línea de tiempo) para poder
reorganizar su construcción —patrón Builder— sin cambiar lo que recibe el
estudiante ni el docente. Trabajan con filas reales de la base de pruebas.
"""
import uuid
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.simulation.models import (
    AttemptEvent, CaseVersion, DecisionOption, ReflectionJournal, SimulationAttempt, SimulationNode,
)
from apps.simulation.serializers.game_dtos import build_completion_report

User = get_user_model()

REPORT_KEYS = {
    "attemptId", "caseTitle", "status", "finalScore", "finalStress", "metrics",
    "adequateDecisions", "riskyDecisions", "inadequateDecisions", "prohibitedDecisions",
    "toolsUsed", "retries", "prohibitedRetries", "reflectionsCount", "safeExitUsed",
    "visitedNodeTitles", "competencies", "recommendations", "summaryMessage",
    "totalDurationSeconds", "activeSeconds", "clockSeconds", "timeline", "ending",
}
TIMELINE_KEYS = {
    "atSeconds", "time", "type", "classification", "prohibited", "label", "scoreDelta", "stressDelta",
}
GENERIC_RECOMMENDATION = (
    "Consolida el aprendizaje repitiendo el caso con foco en la ruta institucional y la bitácora reflexiva."
)


@pytest.fixture
def version(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_rep@x.com", password="x", nombre="Est", apellido="Rep", role="ESTUDIANTE"
    )


@pytest.fixture
def attempt(version, estudiante):
    return SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex,
        case_version=version,
        student=estudiante,
        current_node=SimulationNode.objects.filter(case_version=version, start_node=True).first(),
    )


def _option(version, classification, prohibited=False):
    qs = DecisionOption.objects.filter(
        case_version=version, classification=classification, prohibited_conduct=prohibited
    ).select_related("source_node")
    option = qs.first()
    if option is None and classification == "INADEQUATE" and not prohibited:
        # El caso semilla solo trae inadecuadas con conducta prohibida; se crea una que no lo sea.
        base = DecisionOption.objects.filter(case_version=version).first()
        option = DecisionOption.objects.create(
            case_version=version, option_key="TEST-INADEQUATE-LIBRE", source_node=base.source_node,
            target_node=base.target_node, text="Opción inadecuada sin conducta prohibida",
            classification="INADEQUATE", prohibited_conduct=False,
        )
    assert option is not None, f"el caso base no tiene opción {classification} prohibited={prohibited}"
    return option


def _event(attempt, event_type, *, option=None, node=None, detail=None, score=0, stress=0, seconds=None):
    ev = AttemptEvent.objects.create(
        attempt=attempt, event_type=event_type, decision_option=option, node=node,
        detail=detail, score_delta=score, stress_delta=stress,
    )
    if seconds is not None:
        AttemptEvent.objects.filter(pk=ev.pk).update(occurred_at=attempt.started_at + timedelta(seconds=seconds))
        ev.refresh_from_db()
    return ev


def _report(attempt):
    attempt.refresh_from_db()
    events = list(AttemptEvent.objects.filter(attempt_id=attempt.id).order_by("occurred_at", "id"))
    return build_completion_report(attempt, events)


# ─── forma ───────────────────────────────────────────────────────────────────
def test_intento_vacio_tiene_la_forma_completa_y_valores_neutros(attempt, version):
    report = _report(attempt)

    assert set(report) == REPORT_KEYS
    assert report["attemptId"] == str(attempt.id)
    assert report["caseTitle"] == version.simulation_case.title
    assert report["status"] == "IN_PROGRESS"
    assert (report["finalScore"], report["finalStress"]) == (0, 0)
    assert report["metrics"] == {
        "professionalScore": 0, "sceneStress": 0, "victimRisk": 50, "userTrust": 50,
        "institutionalRouteActivated": False, "revictimizationRisk": False,
    }
    assert (report["adequateDecisions"], report["riskyDecisions"],
            report["inadequateDecisions"], report["prohibitedDecisions"]) == (0, 0, 0, 0)
    assert (report["toolsUsed"], report["retries"], report["prohibitedRetries"],
            report["reflectionsCount"]) == (0, 0, 0, 0)
    assert report["safeExitUsed"] is False
    assert report["visitedNodeTitles"] == []
    assert report["competencies"] == []
    assert report["recommendations"] == [GENERIC_RECOMMENDATION]
    assert report["summaryMessage"] == "Intento en progreso."
    assert report["totalDurationSeconds"] is None
    assert report["timeline"] == []
    assert report["ending"] is None


# ─── conteos ─────────────────────────────────────────────────────────────────
def test_cuenta_decisiones_por_clasificacion_y_conducta_prohibida(attempt, version):
    adecuada = _option(version, "ADEQUATE")
    riesgosa = _option(version, "RISKY")
    inadecuada = _option(version, "INADEQUATE")
    prohibida = _option(version, "INADEQUATE", prohibited=True)
    _event(attempt, "DECISION_SELECTED", option=adecuada)
    _event(attempt, "DECISION_SELECTED", option=adecuada)
    _event(attempt, "DECISION_SELECTED", option=riesgosa)
    _event(attempt, "DECISION_SELECTED", option=inadecuada)
    _event(attempt, "PROHIBITED_DECISION_SELECTED", option=prohibida)

    report = _report(attempt)

    assert report["adequateDecisions"] == 2
    assert report["riskyDecisions"] == 1
    assert report["inadequateDecisions"] == 2  # la prohibida también es inadecuada
    assert report["prohibitedDecisions"] == 1


def test_los_reintentos_se_cuentan_aparte_y_no_puntuan(attempt, version):
    inadecuada = _option(version, "INADEQUATE")
    prohibida = _option(version, "INADEQUATE", prohibited=True)
    _event(attempt, "DECISION_RETRY_REQUIRED", option=inadecuada)
    _event(attempt, "PROHIBITED_DECISION_RETRY_REQUIRED", option=prohibida)
    _event(attempt, "PROHIBITED_DECISION_RETRY_REQUIRED", option=prohibida)

    report = _report(attempt)

    assert report["retries"] == 3
    assert report["prohibitedRetries"] == 2
    assert (report["inadequateDecisions"], report["prohibitedDecisions"]) == (0, 0)


def test_eventos_ajenos_a_decisiones_no_cuentan_aunque_traigan_opcion(attempt, version):
    _event(attempt, "ROOM_ENTERED", option=_option(version, "ADEQUATE"))
    _event(attempt, "DECISION_SELECTED")  # sin opción

    report = _report(attempt)

    assert report["adequateDecisions"] == 0


def test_cuenta_herramientas_usadas(attempt):
    _event(attempt, "TOOL_USED", detail="Herramienta usada: x — pertinente")
    _event(attempt, "TOOL_USED", detail="otra cosa")

    assert _report(attempt)["toolsUsed"] == 2


def test_nodos_visitados_sin_repetir_y_en_orden(attempt, version):
    nodes = list(SimulationNode.objects.filter(case_version=version).order_by("id")[:3])
    for node in (nodes[1], nodes[0], nodes[1], nodes[2], nodes[0]):
        _event(attempt, "NODE_ENTERED", node=node)
    _event(attempt, "ROOM_ENTERED", node=SimulationNode.objects.filter(case_version=version).last())
    _event(attempt, "NODE_ENTERED")  # sin nodo: se ignora

    assert _report(attempt)["visitedNodeTitles"] == [nodes[1].title, nodes[0].title, nodes[2].title]


def test_salida_segura_se_marca_por_evento_aunque_el_intento_se_completara(attempt):
    attempt.status = "COMPLETED"
    attempt.save(update_fields=["status"])
    _event(attempt, "SAFE_EXIT_REQUESTED", detail="Necesito parar")

    report = _report(attempt)

    assert report["status"] == "COMPLETED"
    assert report["safeExitUsed"] is True


# ─── competencias ────────────────────────────────────────────────────────────
def test_competencias_aparecen_en_orden_fijo(attempt, version):
    attempt.institutional_route_activated = True
    attempt.save(update_fields=["institutional_route_activated"])
    _event(attempt, "DECISION_SELECTED", option=_option(version, "ADEQUATE"))
    _event(attempt, "TOOL_USED", detail="x")
    node = SimulationNode.objects.filter(case_version=version).first()
    ReflectionJournal.objects.create(attempt=attempt, node=node, encrypted_text="c", encryption_key_ref="k")

    report = _report(attempt)

    assert report["reflectionsCount"] == 1
    assert report["competencies"] == [
        "Articulación con rutas institucionales de protección",
        "Comunicación ética y contención emocional",
        "Uso pertinente de herramientas clínicas",
        "Reflexión clínica documentada",
    ]


@pytest.mark.parametrize("setup, expected", [
    ("ruta", ["Articulación con rutas institucionales de protección"]),
    ("adecuada", ["Comunicación ética y contención emocional"]),
    ("herramienta", ["Uso pertinente de herramientas clínicas"]),
    ("riesgosa", []),  # una decisión riesgosa sola no da ninguna competencia
])
def test_cada_competencia_depende_de_su_propia_condicion(attempt, version, setup, expected):
    if setup == "ruta":
        attempt.institutional_route_activated = True
        attempt.save(update_fields=["institutional_route_activated"])
    elif setup == "adecuada":
        _event(attempt, "DECISION_SELECTED", option=_option(version, "ADEQUATE"))
    elif setup == "herramienta":
        _event(attempt, "TOOL_USED", detail="x")
    else:
        _event(attempt, "DECISION_SELECTED", option=_option(version, "RISKY"))

    assert _report(attempt)["competencies"] == expected


# ─── recomendaciones ─────────────────────────────────────────────────────────
@pytest.mark.parametrize("classification", ["RISKY", "INADEQUATE"])
def test_decision_riesgosa_o_inadecuada_recomienda_revisar_con_el_docente(attempt, version, classification):
    _event(attempt, "DECISION_SELECTED", option=_option(version, classification))

    assert _report(attempt)["recommendations"] == [
        "Revisa las decisiones riesgosas o inadecuadas con tu docente en sesión de retroalimentación."
    ]


@pytest.mark.parametrize("stress, esperada", [(69, False), (70, True), (100, True)])
def test_estres_desde_70_recomienda_autorregulacion(attempt, stress, esperada):
    attempt.stress_index = stress
    attempt.save(update_fields=["stress_index"])

    recs = _report(attempt)["recommendations"]

    texto = "Practica estrategias de autorregulación antes de escenarios de alta carga emocional."
    assert (texto in recs) is esperada
    assert (GENERIC_RECOMMENDATION in recs) is (not esperada)


def test_riesgo_de_revictimizacion_recomienda_repasar_principios(attempt):
    attempt.revictimization_risk = True
    attempt.save(update_fields=["revictimization_risk"])

    assert _report(attempt)["recommendations"] == [
        "Repasa los principios de no revictimización y el marco ético de intervención."
    ]


@pytest.mark.parametrize("status", ["SAFE_EXITED", "PAUSED"])
def test_pausa_o_salida_segura_recomienda_retomar_con_acompanamiento(attempt, status):
    attempt.status = status
    attempt.save(update_fields=["status"])

    assert _report(attempt)["recommendations"] == [
        "Retoma el caso con acompañamiento docente cuando te sientas preparado/a."
    ]


def test_reconsideracion_singular_y_plural(attempt, version):
    _event(attempt, "DECISION_RETRY_REQUIRED", option=_option(version, "RISKY"))
    assert _report(attempt)["recommendations"] == [
        "Reconsideraste 1 respuesta antes de decidir; revísala con tu docente."
    ]
    _event(attempt, "DECISION_RETRY_REQUIRED", option=_option(version, "RISKY"))
    assert _report(attempt)["recommendations"] == [
        "Reconsideraste 2 respuestas antes de decidir; revísalas con tu docente."
    ]


def test_todas_las_recomendaciones_salen_en_orden_y_la_generica_se_omite(attempt, version):
    attempt.status = "SAFE_EXITED"
    attempt.stress_index = 85
    attempt.revictimization_risk = True
    attempt.save(update_fields=["status", "stress_index", "revictimization_risk"])
    _event(attempt, "DECISION_SELECTED", option=_option(version, "RISKY"))
    _event(attempt, "DECISION_RETRY_REQUIRED", option=_option(version, "INADEQUATE"))

    assert _report(attempt)["recommendations"] == [
        "Revisa las decisiones riesgosas o inadecuadas con tu docente en sesión de retroalimentación.",
        "Reconsideraste 1 respuesta antes de decidir; revísala con tu docente.",
        "Practica estrategias de autorregulación antes de escenarios de alta carga emocional.",
        "Repasa los principios de no revictimización y el marco ético de intervención.",
        "Retoma el caso con acompañamiento docente cuando te sientas preparado/a.",
    ]


# ─── resumen, duración y final ───────────────────────────────────────────────
@pytest.mark.parametrize("status, message", [
    ("COMPLETED", "Intento finalizado. Tu recorrido quedó registrado para evaluación formativa."),
    ("PAUSED", "Pausa segura activa. Tu intento quedó guardado tal cual y puedes reanudarlo cuando lo decidas, sin penalización."),
    ("SAFE_EXITED", "Salida segura registrada. El intento quedó cerrado, sin penalización, y disponible para revisión docente."),
    ("REPLACED", "Intento reemplazado. Empezaste uno nuevo y este quedó cerrado tal como estaba, disponible para revisión docente."),
    ("IN_PROGRESS", "Intento en progreso."),
])
def test_mensaje_de_resumen_por_estado(attempt, status, message):
    attempt.status = status
    attempt.save(update_fields=["status"])

    assert _report(attempt)["summaryMessage"] == message


def test_duracion_total_solo_con_inicio_y_fin(attempt):
    assert _report(attempt)["totalDurationSeconds"] is None
    SimulationAttempt.objects.filter(pk=attempt.pk).update(
        ended_at=attempt.started_at + timedelta(seconds=754, milliseconds=900)
    )

    assert _report(attempt)["totalDurationSeconds"] == 754


def test_el_final_solo_se_calcula_en_intentos_completados(attempt, version):
    _event(attempt, "DECISION_SELECTED", option=_option(version, "ADEQUATE"))
    assert _report(attempt)["ending"] is None

    attempt.status = "COMPLETED"
    attempt.ended_at = timezone.now()
    attempt.save(update_fields=["status", "ended_at"])

    assert isinstance(_report(attempt)["ending"], dict)


# ─── línea de tiempo ─────────────────────────────────────────────────────────
def test_linea_de_tiempo_solo_incluye_eventos_clave_con_su_forma(attempt, version):
    adecuada = _option(version, "ADEQUATE")
    prohibida = _option(version, "INADEQUATE", prohibited=True)
    _event(attempt, "NODE_ENTERED", node=SimulationNode.objects.filter(case_version=version).first(), seconds=1)
    _event(attempt, "DECISION_SELECTED", option=adecuada, score=5, stress=-2, seconds=65)
    _event(attempt, "PROHIBITED_DECISION_SELECTED", option=prohibida, score=-10, stress=8, seconds=125)
    _event(attempt, "TOOL_USED", detail="texto que no calza con el formato", seconds=130)
    _event(attempt, "ROOM_ENTERED", detail="Pasillo", seconds=200)
    _event(attempt, "SAFE_EXIT_REQUESTED", detail="Salida segura solicitada", seconds=3725)

    timeline = _report(attempt)["timeline"]

    assert [t["type"] for t in timeline] == [
        "DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED", "TOOL_USED", "ROOM_ENTERED", "SAFE_EXIT_REQUESTED",
    ]
    assert all(set(t) == TIMELINE_KEYS for t in timeline)
    decision, prohibida_t, tool, room, salida = timeline
    assert (decision["atSeconds"], decision["time"]) == (65, "01:05")
    assert decision["classification"] == "ADEQUATE" and decision["prohibited"] is False
    assert decision["label"] == adecuada.text
    assert (decision["scoreDelta"], decision["stressDelta"]) == (5, -2)
    assert prohibida_t["prohibited"] is True and prohibida_t["classification"] == "INADEQUATE"
    assert (prohibida_t["scoreDelta"], prohibida_t["stressDelta"]) == (-10, 8)
    # Si el detalle de la herramienta no sigue el formato interno, no se filtra tal cual al estudiante.
    assert tool["label"] == "Herramienta aplicada"
    assert tool["classification"] is None
    assert room["label"] == "Pasillo"
    assert (salida["atSeconds"], salida["time"]) == (3725, "62:05")


def test_herramienta_con_formato_interno_muestra_nombres_legibles(attempt, version):
    from apps.simulation.models import ClinicalTool
    tool = ClinicalTool.objects.filter(case_version=version).first()
    if tool is None:
        pytest.skip("el caso base no define herramientas clínicas")
    _event(attempt, "TOOL_USED", detail=f"Herramienta usada: {tool.tool_code} — pertinente")

    label = _report(attempt)["timeline"][0]["label"]

    assert label == f"Herramienta aplicada: {tool.label} — pertinente"
    assert tool.tool_code not in label
