"""Reporte de cierre v3 (Tarea 9 del modelo de métricas): contrato de ``build_completion_report`` y de
``attempt_report.build_report_payload``.

El reporte v3 no lleva puntaje, estrés, métricas ni la lista heurística de competencias; trae los hitos cumplidos y
faltantes, la persona al final, el final con su razón, los conteos POR CLASE de respuesta y las recomendaciones que salen
solo de hitos faltantes y competencias en inicio. Un intento que no se completó recibe solo un resumen. Las pruebas
trabajan con filas reales de la base de pruebas.
"""
import json
import uuid
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.simulation.models import (
    AttemptEvent, CaseVersion, DecisionOption, ReflectionJournal, SimulationAttempt, SimulationNode,
)
from apps.simulation.serializers.game_dtos import build_completion_report
from apps.simulation.services import attempt_report, case_state
from apps.simulation.services.world_state import ensure_world_state

User = get_user_model()

#: Lo que arma el DTO: hechos, recomendaciones de hechos, línea de tiempo y final.
REPORT_KEYS = {
    "attemptId", "caseTitle", "status", "toolsUsed", "retries", "prohibitedRetries", "reflectionsCount",
    "safeExitUsed", "visitedNodeTitles", "recommendations", "summaryMessage", "totalDurationSeconds", "activeSeconds",
    "clockSeconds", "timeline", "ending",
}
#: Lo que añade ``build_report_payload`` (el reporte congelado v3).
V3_KEYS = REPORT_KEYS | {
    "schemaVersion", "ordinal", "definitionHash", "counts", "milestones", "persona", "decisionReview", "reflections",
    "competencyLevels", "profileRules", "nonRecommendedCount", "reflectionCoverage", "keyLearningEvidence",
    "timeByScene",
}
SUMMARY_KEYS = {
    "attemptId", "caseTitle", "status", "summaryMessage", "retries", "reflectionsCount", "safeExitUsed", "toolsUsed",
    "visitedNodeTitles", "activeSeconds", "clockSeconds", "totalDurationSeconds", "recommendations",
}
COUNT_KEYS = {
    "recommended", "acceptable", "risky", "contraindicated", "retries", "prohibitedRetries", "toolsUsed", "reflections",
}
TIMELINE_KEYS = {"atSeconds", "time", "type", "class", "prohibited", "label"}
#: Lo que la v3 retira; ninguna de estas claves puede aparecer en ningún lugar del reporte.
RETIRED_KEYS = {
    "finalScore", "finalStress", "metrics", "competencies", "adequateDecisions", "riskyDecisions",
    "inadequateDecisions", "prohibitedDecisions", "scoreDelta", "stressDelta", "classification", "severityCounts",
}
FORBIDDEN_WORDS = ("puntaje", "estrés", "estres", "desempeño", "ranking", "paciente")
SUPPORT_RECOMMENDATION = "Retoma el caso con acompañamiento docente cuando te sientas preparado/a."

MILESTONES = [
    {"key": "saludo", "label": "Saludar a la persona usuaria", "decisive": False},
    {"key": "riesgo_valorado", "label": "Valorar el riesgo", "decisive": True},
    {"key": "proteccion_recomendada", "label": "Recomendar medidas de protección", "decisive": True},
    {"key": "derechos_informados", "label": "Informar derechos", "decisive": False},
]


def _all_keys(value):
    """Todas las claves de un JSON anidado."""
    if isinstance(value, dict):
        found = set(value)
        for item in value.values():
            found |= _all_keys(item)
        return found
    if isinstance(value, list):
        found = set()
        for item in value:
            found |= _all_keys(item)
        return found
    return set()


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


def _option(version, response_class):
    """Una opción nueva de la clase pedida."""
    base = DecisionOption.objects.filter(case_version=version).first()
    return DecisionOption.objects.create(
        case_version=version, option_key=f"T9-{uuid.uuid4().hex[:8]}", source_node=base.source_node,
        target_node=base.target_node, text=f"Opción {response_class}", response_class=response_class,
    )


def _event(attempt, event_type, *, option=None, node=None, detail=None, seconds=None):
    ev = AttemptEvent.objects.create(
        attempt=attempt, event_type=event_type, decision_option=option, node=node, detail=detail,
    )
    if seconds is not None:
        AttemptEvent.objects.filter(pk=ev.pk).update(occurred_at=attempt.started_at + timedelta(seconds=seconds))
        ev.refresh_from_db()
    return ev


def _declare(version, milestones=MILESTONES):
    CaseVersion.objects.filter(pk=version.pk).update(rules=json.dumps({"milestones": milestones}))


def _world(attempt, *, milestones=(), persona=None):
    state = ensure_world_state(attempt)
    flags = {"milestones": list(milestones)}
    if persona is not None:
        flags["persona"] = persona
    state.flags_json = json.dumps(flags)
    state.save(update_fields=["flags_json"])


def _reload(attempt):
    return SimulationAttempt.objects.select_related("case_version__simulation_case").get(pk=attempt.pk)


def _events(attempt):
    return attempt_report.load_events(attempt.id)


def _report(attempt):
    attempt = _reload(attempt)
    return build_completion_report(attempt, _events(attempt), class_of=case_state.response_class_of)


def _payload(attempt):
    attempt = _reload(attempt)
    return attempt_report.build_report_payload(attempt, _events(attempt))


def _complete(attempt):
    attempt.status = "COMPLETED"
    attempt.ended_at = timezone.now()
    attempt.save(update_fields=["status", "ended_at"])


# ─── forma ───────────────────────────────────────────────────────────────────
def test_el_reporte_de_cierre_del_dto_tiene_solo_hechos_y_ninguna_cifra_de_evaluacion(attempt, version):
    report = _report(attempt)

    assert set(report) == REPORT_KEYS
    assert report["attemptId"] == str(attempt.id)
    assert report["caseTitle"] == version.simulation_case.title
    assert report["status"] == "IN_PROGRESS"
    assert (report["toolsUsed"], report["retries"], report["prohibitedRetries"], report["reflectionsCount"]) == (0, 0, 0, 0)
    assert report["safeExitUsed"] is False
    assert report["visitedNodeTitles"] == []
    assert report["recommendations"] == []  # una lista vacía es válida: no hay recomendación de relleno
    assert report["summaryMessage"] == "Intento en progreso."
    assert report["totalDurationSeconds"] is None
    assert report["timeline"] == []
    assert report["ending"] is None
    assert not RETIRED_KEYS & _all_keys(report)


def test_el_reporte_v3_tiene_las_claves_del_contrato_y_ninguna_de_las_retiradas(attempt, version):
    _declare(version)
    option = _option(version, "RECOMMENDED")
    _event(attempt, "DECISION_SELECTED", option=option, seconds=5)
    _complete(attempt)

    payload = _payload(attempt)

    assert set(payload) == V3_KEYS
    assert payload["schemaVersion"] == 4
    for retired in ("finalScore", "finalStress", "metrics", "competencies"):
        assert retired not in payload
    assert not RETIRED_KEYS & _all_keys(payload)


def test_los_conteos_del_reporte_v3_son_los_de_la_especificacion(attempt):
    payload = _payload(attempt)

    assert set(payload["counts"]) == COUNT_KEYS
    assert set(payload["counts"].values()) == {0}


def test_el_reporte_v3_no_lleva_ninguna_cifra_que_no_sea_un_hecho_o_una_duracion(attempt, version):
    """Ningún puntaje, porcentaje ni delta: solo conteos de hechos y duraciones (RN-09 y «ninguna cifra al estudiante»)."""
    _declare(version)
    _event(attempt, "DECISION_SELECTED", option=_option(version, "RISKY"), seconds=3)
    _event(attempt, "TOOL_USED", detail="x", seconds=4)
    _complete(attempt)

    payload = _payload(attempt)

    numeric = {
        key for key, value in payload.items()
        if isinstance(value, (int, float)) and not isinstance(value, bool)
    }
    assert numeric <= {
        "schemaVersion", "ordinal", "toolsUsed", "retries", "prohibitedRetries", "reflectionsCount",
        "totalDurationSeconds", "activeSeconds", "clockSeconds", "nonRecommendedCount",
    }


# ─── conteos por clase ───────────────────────────────────────────────────────
def test_cuenta_las_decisiones_registradas_por_clase_de_respuesta(attempt, version):
    recomendada, aceptable = _option(version, "RECOMMENDED"), _option(version, "ACCEPTABLE")
    riesgosa, contraindicada = _option(version, "RISKY"), _option(version, "CONTRAINDICATED")
    _event(attempt, "DECISION_SELECTED", option=recomendada)
    _event(attempt, "DECISION_SELECTED", option=recomendada)
    _event(attempt, "DECISION_SELECTED", option=aceptable)
    _event(attempt, "DECISION_SELECTED", option=riesgosa)
    _event(attempt, "PROHIBITED_DECISION_SELECTED", option=contraindicada)

    counts = _payload(attempt)["counts"]

    assert (counts["recommended"], counts["acceptable"], counts["risky"], counts["contraindicated"]) == (2, 1, 1, 1)


def test_los_reintentos_se_cuentan_aparte_y_no_son_decisiones(attempt, version):
    riesgosa, contraindicada = _option(version, "RISKY"), _option(version, "CONTRAINDICATED")
    _event(attempt, "DECISION_RETRY_REQUIRED", option=riesgosa)
    _event(attempt, "PROHIBITED_DECISION_RETRY_REQUIRED", option=contraindicada)
    _event(attempt, "PROHIBITED_DECISION_RETRY_REQUIRED", option=contraindicada)

    payload = _payload(attempt)

    assert (payload["retries"], payload["prohibitedRetries"]) == (3, 2)
    assert (payload["counts"]["retries"], payload["counts"]["prohibitedRetries"]) == (3, 2)
    assert (payload["counts"]["risky"], payload["counts"]["contraindicated"]) == (0, 0)
    assert payload["decisionReview"] == []


def test_eventos_ajenos_a_decisiones_no_cuentan_aunque_traigan_opcion(attempt, version):
    _event(attempt, "ROOM_ENTERED", option=_option(version, "RECOMMENDED"))
    _event(attempt, "DECISION_SELECTED")  # sin opción

    counts = _payload(attempt)["counts"]

    assert counts["recommended"] == 0


def test_cuenta_herramientas_usadas_y_reflexiones(attempt, version):
    _event(attempt, "TOOL_USED", detail="Herramienta usada: x — pertinente")
    _event(attempt, "TOOL_USED", detail="otra cosa")
    node = SimulationNode.objects.filter(case_version=version).first()
    ReflectionJournal.objects.create(attempt=attempt, node=node, encrypted_text="c", encryption_key_ref="k")

    payload = _payload(attempt)

    assert payload["toolsUsed"] == 2 and payload["counts"]["toolsUsed"] == 2
    assert payload["reflectionsCount"] == 1 and payload["counts"]["reflections"] == 1


def test_nodos_visitados_sin_repetir_y_en_orden(attempt, version):
    nodes = list(SimulationNode.objects.filter(case_version=version).order_by("id")[:3])
    for node in (nodes[1], nodes[0], nodes[1], nodes[2], nodes[0]):
        _event(attempt, "NODE_ENTERED", node=node)
    _event(attempt, "ROOM_ENTERED", node=SimulationNode.objects.filter(case_version=version).last())
    _event(attempt, "NODE_ENTERED")  # sin nodo: se ignora

    assert _report(attempt)["visitedNodeTitles"] == [nodes[1].title, nodes[0].title, nodes[2].title]


def test_salida_segura_se_marca_por_evento_aunque_el_intento_se_completara(attempt):
    _complete(attempt)
    _event(attempt, "SAFE_EXIT_REQUESTED", detail="Necesito parar")

    report = _report(attempt)

    assert report["status"] == "COMPLETED"
    assert report["safeExitUsed"] is True


# ─── hitos ───────────────────────────────────────────────────────────────────
def test_los_hitos_cumplidos_van_en_el_orden_en_que_se_cumplieron_y_los_faltantes_en_el_del_caso(attempt, version):
    _declare(version)
    _world(attempt, milestones=["proteccion_recomendada", "saludo"])

    milestones = _payload(attempt)["milestones"]

    assert milestones["done"] == [
        {"key": "proteccion_recomendada", "label": "Recomendar medidas de protección", "decisive": True},
        {"key": "saludo", "label": "Saludar a la persona usuaria", "decisive": False},
    ]
    assert milestones["missing"] == [
        {"key": "riesgo_valorado", "label": "Valorar el riesgo", "decisive": True},
        {"key": "derechos_informados", "label": "Informar derechos", "decisive": False},
    ]


def test_milestones_missing_nombra_cada_hito_faltante_en_palabras(attempt, version):
    _declare(version)

    missing = _payload(attempt)["milestones"]["missing"]

    assert [m["label"] for m in missing] == [m["label"] for m in MILESTONES]
    assert all(" " in m["label"] and m["label"] != m["key"] for m in missing)  # palabras, no la clave interna


def test_un_hito_cumplido_que_el_caso_ya_no_declara_se_conserva_con_la_clave_como_etiqueta(attempt, version):
    _declare(version)
    _world(attempt, milestones=["hito_retirado"])

    milestones = _payload(attempt)["milestones"]

    assert milestones["done"] == [{"key": "hito_retirado", "label": "hito_retirado", "decisive": False}]
    assert [m["key"] for m in milestones["missing"]] == [m["key"] for m in MILESTONES]


def test_un_caso_sin_hitos_declarados_da_listas_vacias(attempt, version):
    CaseVersion.objects.filter(pk=version.pk).update(rules=json.dumps({}))

    assert _payload(attempt)["milestones"] == {"done": [], "missing": []}


# ─── persona ─────────────────────────────────────────────────────────────────
def test_la_persona_final_viaja_con_sus_valores_y_su_frase(attempt):
    _world(attempt, persona={"bond": "OPEN", "activation": "CALM"})

    persona = _payload(attempt)["persona"]

    assert persona["bond"] == "OPEN" and persona["activation"] == "CALM"
    assert persona["label"] == case_state.persona_label(case_state.read(_reload(attempt)).persona)
    assert set(persona) == {"bond", "activation", "label"}


def test_un_intento_sin_estado_guardado_parte_de_la_persona_inicial(attempt):
    persona = _payload(attempt)["persona"]

    assert (persona["bond"], persona["activation"]) == ("GUARDED", "TENSE")


# ─── recomendaciones ─────────────────────────────────────────────────────────
def _con_competencias(monkeypatch, levels):
    monkeypatch.setattr(
        attempt_report, "_competency_levels",
        lambda attempt, events: [
            {"code": code, "name": name, "level": level, "basis": "DECLARED" if level else None, "evidence": []}
            for code, name, level in levels
        ],
    )


def test_las_recomendaciones_salen_de_hitos_faltantes_con_los_decisivos_primero(attempt, version):
    _declare(version)
    _world(attempt, milestones=["saludo"])

    recommendations = _payload(attempt)["recommendations"]

    assert recommendations == [
        "Revisa cómo valorar el riesgo: es un paso del caso que quedó sin cumplir.",
        "Revisa cómo recomendar medidas de protección: es un paso del caso que quedó sin cumplir.",
        "Revisa cómo informar derechos: es un paso del caso que quedó sin cumplir.",
    ]


def test_un_hito_cumplido_no_genera_recomendacion(attempt, version):
    _declare(version)
    _world(attempt, milestones=[m["key"] for m in MILESTONES])

    assert _payload(attempt)["recommendations"] == []


def test_la_recomendacion_de_hito_conserva_las_mayusculas_de_las_siglas(attempt, version):
    _declare(version, [{"key": "icbf", "label": "Informar al ICBF", "decisive": True}])

    assert _payload(attempt)["recommendations"] == [
        "Revisa cómo informar al ICBF: es un paso del caso que quedó sin cumplir."
    ]


def test_las_competencias_en_inicio_generan_recomendacion_y_las_demas_no(attempt, version, monkeypatch):
    _declare(version, [])
    _con_competencias(monkeypatch, [
        ("CONTENCION", "Contención emocional", "EN_INICIO"),
        ("RUTA", "Ruta institucional", "EN_PROCESO"),
        ("ETICA", "Ética del cuidado", "LOGRADO"),
        ("REFLEXION", "Reflexión clínica", "DESTACADO"),
        ("HERRAMIENTAS", "Uso de herramientas", None),
    ])

    recommendations = _payload(attempt)["recommendations"]

    assert recommendations == [
        "Refuerza Contención emocional: en las respuestas que la ponen en juego estás en inicio, repásalo con tu docente."
    ]


def test_las_recomendaciones_salen_en_orden_hitos_competencias_y_hechos(attempt, version, monkeypatch):
    _declare(version, [{"key": "riesgo_valorado", "label": "Valorar el riesgo", "decisive": True}])
    _con_competencias(monkeypatch, [("CONTENCION", "Contención emocional", "EN_INICIO")])
    _event(attempt, "DECISION_RETRY_REQUIRED", option=_option(version, "RISKY"))
    attempt.status = "PAUSED"
    attempt.save(update_fields=["status"])

    recommendations = _payload(attempt)["recommendations"]

    assert [r.split(":")[0].split(" ")[0] for r in recommendations] == ["Revisa", "Refuerza", "Reconsideraste", "Retoma"]
    assert recommendations[2] == "Reconsideraste 1 respuesta antes de decidir; revísala con tu docente."
    assert recommendations[3] == SUPPORT_RECOMMENDATION


def test_sin_hitos_faltantes_ni_competencias_en_inicio_la_lista_es_vacia_y_no_hay_recomendacion_generica(attempt, version):
    _declare(version, [])

    assert _payload(attempt)["recommendations"] == []


def test_la_reconsideracion_va_en_singular_y_en_plural(attempt, version):
    _declare(version, [])
    _event(attempt, "DECISION_RETRY_REQUIRED", option=_option(version, "RISKY"))
    assert _payload(attempt)["recommendations"] == [
        "Reconsideraste 1 respuesta antes de decidir; revísala con tu docente."
    ]
    _event(attempt, "DECISION_RETRY_REQUIRED", option=_option(version, "RISKY"))
    assert _payload(attempt)["recommendations"] == [
        "Reconsideraste 2 respuestas antes de decidir; revísalas con tu docente."
    ]


@pytest.mark.parametrize("status", ["SAFE_EXITED", "PAUSED"])
def test_pausa_o_salida_segura_recomienda_retomar_con_acompanamiento(attempt, version, status):
    _declare(version, [])
    attempt.status = status
    attempt.save(update_fields=["status"])

    assert _payload(attempt)["recommendations"] == [SUPPORT_RECOMMENDATION]


def test_los_textos_nuevos_del_estudiante_no_usan_vocabulario_prohibido(attempt, version, monkeypatch):
    _declare(version)
    _con_competencias(monkeypatch, [("CONTENCION", "Contención emocional", "EN_INICIO")])
    _event(attempt, "DECISION_RETRY_REQUIRED", option=_option(version, "RISKY"))
    attempt.status = "PAUSED"
    attempt.save(update_fields=["status"])

    payload = _payload(attempt)
    text = " ".join(payload["recommendations"] + [payload["persona"]["label"]]).lower()

    assert payload["recommendations"]
    for word in FORBIDDEN_WORDS:
        assert word not in text


# ─── revisión de decisiones y línea de tiempo ────────────────────────────────
def test_la_revision_de_decisiones_lleva_la_clase_y_ya_no_la_clasificacion(attempt, version):
    contraindicada, recomendada = _option(version, "CONTRAINDICATED"), _option(version, "RECOMMENDED")
    _event(attempt, "PROHIBITED_DECISION_SELECTED", option=contraindicada, seconds=1)
    _event(attempt, "DECISION_SELECTED", option=recomendada, seconds=2)

    review = _payload(attempt)["decisionReview"]

    assert [(item["class"], item["prohibited"]) for item in review] == [
        ("CONTRAINDICATED", True), ("RECOMMENDED", False),
    ]
    assert all("classification" not in item and "feedback" in item and "consequence" in item for item in review)


def test_linea_de_tiempo_solo_incluye_eventos_clave_y_no_lleva_cifras(attempt, version):
    recomendada = _option(version, "RECOMMENDED")
    contraindicada = _option(version, "CONTRAINDICATED")
    _event(attempt, "NODE_ENTERED", node=SimulationNode.objects.filter(case_version=version).first(), seconds=1)
    _event(attempt, "DECISION_SELECTED", option=recomendada, seconds=65)
    _event(attempt, "PROHIBITED_DECISION_SELECTED", option=contraindicada, seconds=125)
    _event(attempt, "TOOL_USED", detail="texto que no calza con el formato", seconds=130)
    _event(attempt, "ROOM_ENTERED", detail="Pasillo", seconds=200)
    _event(attempt, "SAFE_EXIT_REQUESTED", detail="Salida segura solicitada", seconds=3725)

    timeline = _report(attempt)["timeline"]

    assert [t["type"] for t in timeline] == [
        "DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED", "TOOL_USED", "ROOM_ENTERED", "SAFE_EXIT_REQUESTED",
    ]
    assert all(set(t) == TIMELINE_KEYS for t in timeline)
    decision, prohibida, tool, room, salida = timeline
    assert (decision["atSeconds"], decision["time"]) == (65, "01:05")
    assert decision["class"] == "RECOMMENDED" and decision["prohibited"] is False
    assert decision["label"] == recomendada.text
    assert prohibida["class"] == "CONTRAINDICATED" and prohibida["prohibited"] is True
    # Si el detalle de la herramienta no sigue el formato interno, no se filtra tal cual al estudiante.
    assert tool["label"] == "Herramienta aplicada"
    assert tool["class"] is None and tool["prohibited"] is False
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


def test_el_final_solo_se_calcula_en_intentos_completados_y_trae_su_razon(attempt, version):
    _declare(version)
    _event(attempt, "DECISION_SELECTED", option=_option(version, "RECOMMENDED"))
    assert _payload(attempt)["ending"] is None

    _complete(attempt)
    ending = _payload(attempt)["ending"]

    assert {"key", "title", "message", "tone", "reason"} <= set(ending)
    assert isinstance(ending["reason"], list) and ending["reason"]
    assert not {"severityCounts", "caseFlags", "caseMetrics"} & set(ending)


# ─── el intento que no se completó: solo un resumen ──────────────────────────
@pytest.mark.parametrize("status", ["PAUSED", "SAFE_EXITED", "REPLACED", "IN_PROGRESS"])
def test_un_intento_que_no_se_completo_recibe_solo_el_resumen_sin_ninguna_clase(attempt, version, status):
    _declare(version)
    _event(attempt, "DECISION_SELECTED", option=_option(version, "CONTRAINDICATED"), seconds=3)
    _event(attempt, "DECISION_RETRY_REQUIRED", option=_option(version, "RISKY"), seconds=4)
    attempt.status = status
    attempt.save(update_fields=["status"])

    report = attempt_report.report_for(_reload(attempt))

    assert set(report) == SUMMARY_KEYS
    assert report["retries"] == 1
    assert not {
        "decisionReview", "competencyLevels", "milestones", "ending", "timeline", "counts", "persona",
    } & set(report)
    assert not RETIRED_KEYS & _all_keys(report)
    assert "CONTRAINDICATED" not in json.dumps(report)
    expected = [SUPPORT_RECOMMENDATION] if status in ("PAUSED", "SAFE_EXITED") else []
    assert report["recommendations"] == expected
