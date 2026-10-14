"""Pruebas de las costuras que introduce P-04 (Builder del reporte de cierre).

Trabajan con intentos y eventos simulados (sin base de datos) para comprobar que
cada paso del constructor hace una sola cosa y que el director los une en el
mismo orden de siempre. La forma completa del reporte la fija
``test_completion_report_contract``.
"""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from apps.simulation.serializers import game_dtos
from apps.simulation.serializers.game_dtos import CompletionReportBuilder, build_completion_report


def _option(classification, prohibited=False):
    return SimpleNamespace(classification=classification, prohibited_conduct=prohibited)


def _event(event_type, option=None, node_title=None):
    return SimpleNamespace(
        event_type=event_type,
        decision_option=option,
        decision_option_id=1 if option else None,
        node_id=1 if node_title else None,
        node=SimpleNamespace(title=node_title) if node_title else None,
    )


def _attempt(**overrides):
    base = dict(
        id="11111111-1111-1111-1111-111111111111",
        status="COMPLETED",
        accumulated_score=70,
        stress_index=30,
        victim_risk=10,
        user_trust=60,
        institutional_route_activated=False,
        revictimization_risk=False,
        started_at=datetime(2026, 10, 1, 10, 0, 0, tzinfo=timezone.utc),
        ended_at=datetime(2026, 10, 1, 10, 5, 30, tzinfo=timezone.utc),
        active_seconds=0.0,
        case_version=SimpleNamespace(simulation_case=SimpleNamespace(title="Caso de prueba")),
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# ─── Paso: conteos ───────────────────────────────────────────────────────────
def test_count_events_clasifica_decisiones_y_herramientas():
    events = [
        _event("DECISION_SELECTED", _option("ADEQUATE")),
        _event("DECISION_SELECTED", _option("RISKY")),
        _event("PROHIBITED_DECISION_SELECTED", _option("INADEQUATE", prohibited=True)),
        _event("TOOL_USED"),
        _event("TOOL_USED"),
    ]

    b = CompletionReportBuilder(_attempt(), events).count_events()

    assert (b.adequate, b.risky, b.inadequate, b.prohibited, b.tools_used) == (1, 1, 1, 1, 2)


def test_count_events_los_reintentos_no_son_decisiones():
    events = [
        _event("DECISION_RETRY_REQUIRED", _option("INADEQUATE")),
        _event("PROHIBITED_DECISION_RETRY_REQUIRED", _option("INADEQUATE", prohibited=True)),
    ]

    b = CompletionReportBuilder(_attempt(), events).count_events()

    assert (b.retries, b.prohibited_retries) == (2, 1)
    assert (b.adequate, b.risky, b.inadequate, b.prohibited) == (0, 0, 0, 0)


def test_count_events_los_nodos_visitados_no_se_repiten_y_conservan_el_orden():
    events = [
        _event("NODE_ENTERED", node_title="Recepción"),
        _event("NODE_ENTERED", node_title="Sala"),
        _event("NODE_ENTERED", node_title="Recepción"),
    ]

    assert CompletionReportBuilder(_attempt(), events).count_events().visited == ["Recepción", "Sala"]


# ─── Pasos: competencias, recomendaciones, resumen ───────────────────────────
def test_add_competencies_depende_de_los_conteos_ya_hechos():
    b = CompletionReportBuilder(_attempt(institutional_route_activated=True), [])
    b.adequate, b.tools_used, b.reflections_count = 1, 1, 1

    assert b.add_competencies().competencies == [
        "Articulación con rutas institucionales de protección",
        "Comunicación ética y contención emocional",
        "Uso pertinente de herramientas clínicas",
        "Reflexión clínica documentada",
    ]


def test_add_competencies_sin_logros_queda_vacio():
    assert CompletionReportBuilder(_attempt(), []).add_competencies().competencies == []


def test_add_recommendations_sin_motivos_da_la_recomendacion_generica():
    got = CompletionReportBuilder(_attempt(), []).add_recommendations().recommendations

    assert got == [game_dtos._GENERIC_RECOMMENDATION]


def test_add_recommendations_en_orden_y_sin_la_generica_cuando_hay_otras():
    b = CompletionReportBuilder(
        _attempt(stress_index=70, revictimization_risk=True, status="PAUSED"), [],
    )
    b.risky, b.retries = 1, 2

    got = b.add_recommendations().recommendations

    assert len(got) == 5
    assert got[0].startswith("Revisa las decisiones riesgosas")
    assert got[1] == "Reconsideraste 2 respuestas antes de decidir; revísalas con tu docente."
    assert got[2].startswith("Practica estrategias de autorregulación")
    assert got[3].startswith("Repasa los principios de no revictimización")
    assert got[4].startswith("Retoma el caso con acompañamiento docente")


@pytest.mark.parametrize("status", ["COMPLETED", "PAUSED", "SAFE_EXITED", "REPLACED", "IN_PROGRESS"])
def test_add_summary_tiene_un_mensaje_por_estado(status):
    assert CompletionReportBuilder(_attempt(status=status), []).add_summary().summary


def test_add_summary_con_un_estado_desconocido_falla_como_antes():
    with pytest.raises(KeyError):
        CompletionReportBuilder(_attempt(status="OTRO"), []).add_summary()


# ─── Ensamblado y director ───────────────────────────────────────────────────
@pytest.fixture
def sin_base_de_datos(monkeypatch):
    class _Journal:
        class objects:
            @staticmethod
            def filter(**kwargs):
                return SimpleNamespace(count=lambda: 3)

    monkeypatch.setattr(game_dtos, "ReflectionJournal", _Journal)
    monkeypatch.setattr(game_dtos, "build_timeline", lambda attempt, events: ["linea"])
    monkeypatch.setattr(game_dtos.case_effects, "compute_ending", lambda attempt, events: {"ending": 2})


def test_build_ensambla_todo_en_el_orden_publico(sin_base_de_datos):
    report = CompletionReportBuilder(_attempt(), []).count_events().count_reflections().add_summary().build()

    assert list(report) == [
        "attemptId", "caseTitle", "status", "finalScore", "finalStress", "metrics",
        "adequateDecisions", "riskyDecisions", "inadequateDecisions", "prohibitedDecisions",
        "toolsUsed", "retries", "prohibitedRetries", "reflectionsCount", "safeExitUsed",
        "visitedNodeTitles", "competencies", "recommendations", "summaryMessage",
        "totalDurationSeconds", "activeSeconds", "clockSeconds", "timeline", "ending",
    ]
    assert report["reflectionsCount"] == 3
    assert report["totalDurationSeconds"] == 330
    assert report["timeline"] == ["linea"] and report["ending"] == {"ending": 2}


def test_el_director_aplica_todos_los_pasos(sin_base_de_datos):
    events = [_event("DECISION_SELECTED", _option("ADEQUATE")), _event("SAFE_EXIT_REQUESTED")]

    report = build_completion_report(_attempt(), events)

    assert report["adequateDecisions"] == 1
    assert report["safeExitUsed"] is True
    assert report["reflectionsCount"] == 3
    assert "Comunicación ética y contención emocional" in report["competencies"]
    assert "Reflexión clínica documentada" in report["competencies"]
    assert report["recommendations"] == [game_dtos._GENERIC_RECOMMENDATION]
    assert report["summaryMessage"].startswith("Intento finalizado")


def test_sin_duracion_cuando_el_intento_no_ha_terminado(sin_base_de_datos):
    report = build_completion_report(_attempt(ended_at=None, status="IN_PROGRESS"), [])

    assert report["totalDurationSeconds"] is None
