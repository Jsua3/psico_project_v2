"""Pruebas de las costuras del Builder del reporte de cierre (P-04), en su forma v3.

Trabajan con intentos y eventos simulados (sin base de datos) para comprobar que
cada paso del constructor hace una sola cosa y que el director los une en el
mismo orden de siempre. El constructor solo cuenta hechos: las clases de respuesta, los hitos y las
competencias los añade ``attempt_report.build_report_payload``. La forma completa del reporte la fija
``test_completion_report_contract``.
"""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from apps.simulation.serializers import game_dtos
from apps.simulation.serializers.game_dtos import (
    CompletionReportBuilder,
    build_completion_report,
    build_student_summary,
)

SUPPORT = "Retoma el caso con acompañamiento docente cuando te sientas preparado/a."


def _option():
    return SimpleNamespace(text="x")


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
        started_at=datetime(2026, 10, 1, 10, 0, 0, tzinfo=timezone.utc),
        ended_at=datetime(2026, 10, 1, 10, 5, 30, tzinfo=timezone.utc),
        active_seconds=0.0,
        case_version=SimpleNamespace(simulation_case=SimpleNamespace(title="Caso de prueba")),
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# ─── Paso: conteos de hechos ─────────────────────────────────────────────────
def test_count_events_cuenta_herramientas_y_no_clasifica_decisiones():
    events = [
        _event("DECISION_SELECTED", _option()),
        _event("PROHIBITED_DECISION_SELECTED", _option()),
        _event("TOOL_USED"),
        _event("TOOL_USED"),
    ]

    b = CompletionReportBuilder(_attempt(), events).count_events()

    assert b.tools_used == 2
    assert not hasattr(b, "adequate") and not hasattr(b, "prohibited")  # las clases son de build_report_payload


def test_count_events_los_reintentos_se_cuentan_aparte():
    events = [
        _event("DECISION_RETRY_REQUIRED", _option()),
        _event("PROHIBITED_DECISION_RETRY_REQUIRED", _option()),
    ]

    b = CompletionReportBuilder(_attempt(), events).count_events()

    assert (b.retries, b.prohibited_retries) == (2, 1)


def test_count_events_los_nodos_visitados_no_se_repiten_y_conservan_el_orden():
    events = [
        _event("NODE_ENTERED", node_title="Recepción"),
        _event("NODE_ENTERED", node_title="Sala"),
        _event("NODE_ENTERED", node_title="Recepción"),
    ]

    assert CompletionReportBuilder(_attempt(), events).count_events().visited == ["Recepción", "Sala"]


def test_el_constructor_ya_no_tiene_el_paso_de_competencias_heuristicas():
    assert not hasattr(CompletionReportBuilder, "add_competencies")
    assert not hasattr(game_dtos, "HIGH_STRESS_THRESHOLD")
    assert not hasattr(game_dtos, "_GENERIC_RECOMMENDATION")


# ─── Pasos: recomendaciones y resumen ────────────────────────────────────────
def test_add_recommendations_sin_motivos_queda_vacia_sin_recomendacion_generica():
    assert CompletionReportBuilder(_attempt(), []).add_recommendations().recommendations == []


def test_add_recommendations_solo_de_hechos_en_orden():
    b = CompletionReportBuilder(_attempt(status="PAUSED"), [])
    b.retries = 2

    got = b.add_recommendations().recommendations

    assert got == ["Reconsideraste 2 respuestas antes de decidir; revísalas con tu docente.", SUPPORT]


@pytest.mark.parametrize("status", ["PAUSED", "SAFE_EXITED"])
def test_add_recommendations_tras_una_pausa_o_salida_segura_recomienda_retomar(status):
    assert CompletionReportBuilder(_attempt(status=status), []).add_recommendations().recommendations == [SUPPORT]


@pytest.mark.parametrize("status", ["COMPLETED", "REPLACED", "IN_PROGRESS"])
def test_add_recommendations_en_los_demas_estados_no_recomienda_retomar(status):
    assert CompletionReportBuilder(_attempt(status=status), []).add_recommendations().recommendations == []


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
    monkeypatch.setattr(game_dtos, "build_timeline", lambda attempt, events, class_of=None: ["linea"])
    monkeypatch.setattr(game_dtos.endings, "compute_ending", lambda attempt, events: {"ending": 2})


def test_build_ensambla_todo_en_el_orden_publico(sin_base_de_datos):
    report = CompletionReportBuilder(_attempt(), []).count_events().count_reflections().add_summary().build()

    assert list(report) == [
        "attemptId", "caseTitle", "status", "toolsUsed", "retries", "reflectionsCount", "safeExitUsed",
        "visitedNodeTitles", "summaryMessage", "totalDurationSeconds", "activeSeconds", "clockSeconds",
        "prohibitedRetries", "recommendations", "timeline", "ending",
    ]
    assert report["reflectionsCount"] == 3
    assert report["totalDurationSeconds"] == 330
    assert report["timeline"] == ["linea"] and report["ending"] == {"ending": 2}


def test_build_no_lleva_ninguna_clave_numerica_de_evaluacion(sin_base_de_datos):
    report = build_completion_report(_attempt(), [])

    for retired in ("finalScore", "finalStress", "metrics", "competencies", "adequateDecisions", "riskyDecisions",
                    "inadequateDecisions", "prohibitedDecisions"):
        assert retired not in report


def test_el_director_aplica_todos_los_pasos(sin_base_de_datos):
    events = [_event("DECISION_RETRY_REQUIRED", _option()), _event("SAFE_EXIT_REQUESTED")]

    report = build_completion_report(_attempt(), events)

    assert report["retries"] == 1
    assert report["safeExitUsed"] is True
    assert report["reflectionsCount"] == 3
    assert report["recommendations"] == ["Reconsideraste 1 respuesta antes de decidir; revísala con tu docente."]
    assert report["summaryMessage"].startswith("Intento finalizado")


def test_el_director_pasa_la_funcion_de_clase_a_la_linea_de_tiempo(monkeypatch, sin_base_de_datos):
    received = {}
    monkeypatch.setattr(
        game_dtos, "build_timeline", lambda attempt, events, class_of=None: received.setdefault("class_of", class_of) or []
    )
    marker = object()

    build_completion_report(_attempt(), [], class_of=marker)

    assert received["class_of"] is marker


def test_sin_duracion_cuando_el_intento_no_ha_terminado(sin_base_de_datos):
    report = build_completion_report(_attempt(ended_at=None, status="IN_PROGRESS"), [])

    assert report["totalDurationSeconds"] is None


# ─── El resumen de un intento que no se completó ─────────────────────────────
def test_el_resumen_solo_lleva_hechos_y_la_recomendacion_de_apoyo(sin_base_de_datos):
    events = [
        _event("DECISION_SELECTED", _option()),
        _event("DECISION_RETRY_REQUIRED", _option()),
        _event("TOOL_USED"),
        _event("NODE_ENTERED", node_title="Recepción"),
    ]

    summary = build_student_summary(_attempt(status="PAUSED", ended_at=None), events)

    assert set(summary) == {
        "attemptId", "caseTitle", "status", "toolsUsed", "retries", "reflectionsCount", "safeExitUsed",
        "visitedNodeTitles", "summaryMessage", "totalDurationSeconds", "activeSeconds", "clockSeconds",
        "recommendations",
    }
    assert (summary["retries"], summary["toolsUsed"], summary["visitedNodeTitles"]) == (1, 1, ["Recepción"])
    assert summary["recommendations"] == [SUPPORT]  # ni siquiera lo reconsiderado: eso llega al cerrar


def test_el_resumen_de_un_intento_reemplazado_no_trae_recomendaciones(sin_base_de_datos):
    assert build_student_summary(_attempt(status="REPLACED"), [])["recommendations"] == []
