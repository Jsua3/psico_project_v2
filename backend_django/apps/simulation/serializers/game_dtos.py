"""Response DTO builders for the student simulation flow — field names match
Spring SimulationDtos exactly (camelCase JSON)."""
import json
import re

from apps.simulation.models import (
    ClinicalTool,
    DecisionOption,
    MapObject,
    ReflectionJournal,
)
from apps.simulation.services import case_effects

SAFE_EXIT_RESOURCES = [
    "Puedes pausar el intento y retomarlo con acompañamiento docente.",
    "Si el contenido activa malestar, contacta al Centro Integral de Psicología o a Bienestar Universitario.",
    "En riesgo inmediato, prioriza líneas locales de emergencia y rutas institucionales de protección.",
]


def read_string_list(raw):
    if not raw:
        return []
    try:
        value = json.loads(raw)
        return value if isinstance(value, list) else []
    except (ValueError, TypeError):
        return []


def metrics(attempt):
    return {
        "professionalScore": attempt.accumulated_score,
        "sceneStress": attempt.stress_index,
        "victimRisk": attempt.victim_risk,
        "userTrust": attempt.user_trust,
        "institutionalRouteActivated": attempt.institutional_route_activated,
        "revictimizationRisk": attempt.revictimization_risk,
    }


def case_summary(version, node_count):
    case = version.simulation_case
    return {
        "caseVersionId": version.id,
        "code": case.code,
        "title": case.title,
        "description": case.description,
        "semanticVersion": version.semantic_version,
        "nodeCount": node_count,
        "status": version.status,
    }


def decision_option_state(option):
    # Evaluación formativa: antes de elegir, el jugador solo recibe id y texto.
    # La clasificación y la conducta prohibida viajan únicamente en el feedback
    # posterior a la decisión (feedback_dto).
    return {
        "id": option.id,
        "text": option.text,
    }


def node_state(node, include_options):
    if include_options and not node.terminal_node:
        options = [
            decision_option_state(o)
            for o in DecisionOption.objects.filter(source_node_id=node.id).order_by("id")
        ]
    else:
        options = []
    return {
        "id": node.id,
        "key": node.node_key,
        "title": node.title,
        "narrative": node.narrative,
        "supportResources": read_string_list(node.support_resources_json),
        "requiredTools": read_string_list(node.required_tools_json),
        "sensitiveContent": node.sensitive_content,
        "safeExitRequired": node.safe_exit_required,
        "warningMessage": node.warning_message,
        "terminal": node.terminal_node,
        "options": options,
    }


def feedback_dto(decision, effects, message, retry_required=False):
    return {
        "classification": decision.classification,
        "scoreDelta": effects.score_delta,
        "stressDelta": effects.stress_delta,
        "trustDelta": effects.trust_delta,
        "victimRiskDelta": effects.victim_risk_delta,
        "prohibitedConduct": decision.prohibited_conduct,
        "institutionalRouteActivated": effects.institutional_route_activated,
        "revictimizationRisk": effects.revictimization_risk,
        "message": message,
        "prohibitionReason": decision.prohibition_reason,
        # True solo mientras quede una oportunidad (no se aplicó ni avanzó nada);
        # en la 2ª respuesta riesgosa/inadecuada queda registrada y va en False.
        "retryRequired": retry_required,
    }


TIMELINE_EVENT_TYPES = {
    "DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED",
    "DECISION_RETRY_REQUIRED", "PROHIBITED_DECISION_RETRY_REQUIRED",
    "TOOL_USED", "ROOM_ENTERED", "SAFE_EXIT_REQUESTED", "ATTEMPT_REPLACED",
}


def _format_mmss(seconds):
    if seconds is None:
        return "--:--"
    minutes, secs = divmod(max(0, int(seconds)), 60)
    return f"{minutes:02d}:{secs:02d}"


# Detalle que guarda world_service al usar una herramienta: lleva claves internas (código de la
# herramienta y clave del objeto), que no deben llegar al estudiante.
_TOOL_USED_DETAIL = re.compile(
    r"^Herramienta usada: (?P<tool>\S+)(?: sobre (?P<target>\S+))? — (?P<verdict>no pertinente|pertinente)"
)


def _tool_event_labels(attempt, events):
    """Nombres legibles (herramienta y objeto) para los eventos TOOL_USED de la línea de tiempo."""
    details = [
        _TOOL_USED_DETAIL.match(ev.detail or "")
        for ev in events
        if ev.event_type == "TOOL_USED"
    ]
    details = [m for m in details if m]
    if not details:
        return {}, {}
    tools = {
        t.tool_code: t.label
        for t in ClinicalTool.objects.filter(case_version_id=attempt.case_version_id)
    }
    targets = {m["target"] for m in details if m["target"]}
    objects = {
        o.object_key: o.label
        for o in MapObject.objects.filter(
            scene_map__case_version_id=attempt.case_version_id, object_key__in=targets
        )
    } if targets else {}
    return tools, objects


def _tool_event_label(detail, tools, objects):
    """«Herramienta aplicada: Primeros Auxilios Psicológicos con Familia en crisis — pertinente»."""
    match = _TOOL_USED_DETAIL.match(detail or "")
    if not match:
        return "Herramienta aplicada"
    label = f"Herramienta aplicada: {tools.get(match['tool'], 'una herramienta')}"
    if match["target"]:
        label += f" con {objects.get(match['target'], 'la persona o el objeto de la sala')}"
    return f"{label} — {match['verdict']}"


def build_timeline(attempt, events):
    """Línea de tiempo de decisiones/acciones clave para el reporte del estudiante."""
    start = attempt.started_at
    timeline = []
    tool_labels, object_labels = _tool_event_labels(attempt, events)
    for ev in events:
        if ev.event_type not in TIMELINE_EVENT_TYPES:
            continue
        seconds = None
        if start and ev.occurred_at:
            seconds = int((ev.occurred_at - start).total_seconds())
        decision = ev.decision_option if ev.decision_option_id else None
        timeline.append({
            "atSeconds": seconds,
            "time": _format_mmss(seconds),
            "type": ev.event_type,
            "classification": decision.classification if decision else None,
            "prohibited": bool(decision.prohibited_conduct) if decision else False,
            "label": (
                decision.text if decision
                else _tool_event_label(ev.detail, tool_labels, object_labels) if ev.event_type == "TOOL_USED"
                else ev.detail
            ) or "",
            "scoreDelta": ev.score_delta,
            "stressDelta": ev.stress_delta,
        })
    return timeline


def _reconsidered_recommendation(retries):
    if retries == 1:
        return "Reconsideraste 1 respuesta antes de decidir; revísala con tu docente."
    return f"Reconsideraste {retries} respuestas antes de decidir; revísalas con tu docente."


_SUMMARY_BY_STATUS = {
    "COMPLETED": "Intento finalizado. Tu recorrido quedó registrado para evaluación formativa.",
    "PAUSED": "Pausa segura activa. Tu intento quedó guardado tal cual y puedes reanudarlo cuando lo decidas, sin penalización.",
    "SAFE_EXITED": "Salida segura registrada. El intento quedó cerrado, sin penalización, y disponible para revisión docente.",
    "REPLACED": "Intento reemplazado. Empezaste uno nuevo y este quedó cerrado tal como estaba, disponible para revisión docente.",
    "IN_PROGRESS": "Intento en progreso.",
}
_GENERIC_RECOMMENDATION = (
    "Consolida el aprendizaje repitiendo el caso con foco en la ruta institucional y la bitácora reflexiva."
)


class CompletionReportBuilder:
    """Builder del reporte de cierre: arma el reporte paso a paso.

    Cada ``count_*`` / ``add_*`` calcula una parte (conteos, competencias,
    recomendaciones, resumen, línea de tiempo, final) y devuelve el propio
    constructor, de modo que se encadenan. ``build()`` ensambla el diccionario
    final. El orden importa: competencias y recomendaciones leen los conteos.
    """

    def __init__(self, attempt, events):
        self._attempt = attempt
        self._events = events
        self.adequate = self.risky = self.inadequate = self.prohibited = 0
        self.tools_used = self.retries = self.prohibited_retries = 0
        self.reflections_count = 0
        self.visited = []
        self.competencies = []
        self.recommendations = []
        self.summary = ""

    def count_events(self):
        seen = set()
        for ev in self._events:
            if ev.node_id and ev.event_type == "NODE_ENTERED":
                title = ev.node.title
                if title not in seen:
                    seen.add(title)
                    self.visited.append(title)
            if ev.event_type == "TOOL_USED":
                self.tools_used += 1
            if ev.event_type in case_effects.RETRY_EVENT_TYPES:
                # Reconsideración: no se aplicó ni puntúa (se reporta aparte).
                self.retries += 1
                if ev.event_type == "PROHIBITED_DECISION_RETRY_REQUIRED":
                    self.prohibited_retries += 1
                continue
            if ev.decision_option_id is None or ev.event_type not in case_effects.REGISTERED_DECISION_EVENT_TYPES:
                continue
            c = ev.decision_option.classification
            if c == "ADEQUATE":
                self.adequate += 1
            elif c == "RISKY":
                self.risky += 1
            elif c == "INADEQUATE":
                self.inadequate += 1
            if ev.decision_option.prohibited_conduct:
                self.prohibited += 1
        return self

    def count_reflections(self):
        self.reflections_count = ReflectionJournal.objects.filter(attempt_id=self._attempt.id).count()
        return self

    def add_competencies(self):
        if self._attempt.institutional_route_activated:
            self.competencies.append("Articulación con rutas institucionales de protección")
        if self.adequate > 0:
            self.competencies.append("Comunicación ética y contención emocional")
        if self.tools_used > 0:
            self.competencies.append("Uso pertinente de herramientas clínicas")
        if self.reflections_count > 0:
            self.competencies.append("Reflexión clínica documentada")
        return self

    def add_recommendations(self):
        attempt = self._attempt
        recommendations = self.recommendations
        if self.risky > 0 or self.inadequate > 0:
            recommendations.append("Revisa las decisiones riesgosas o inadecuadas con tu docente en sesión de retroalimentación.")
        if self.retries > 0:
            # No son decisiones ni bajan el desempeño, pero el estudiante debe ver que reconsideró algo: el juego le
            # dijo en el momento «no se aplicó, reconsidera» y el cierre no puede callarlo.
            recommendations.append(_reconsidered_recommendation(self.retries))
        if attempt.stress_index >= 70:
            recommendations.append("Practica estrategias de autorregulación antes de escenarios de alta carga emocional.")
        if attempt.revictimization_risk:
            recommendations.append("Repasa los principios de no revictimización y el marco ético de intervención.")
        if attempt.status in ("SAFE_EXITED", "PAUSED"):
            recommendations.append("Retoma el caso con acompañamiento docente cuando te sientas preparado/a.")
        if not recommendations:
            recommendations.append(_GENERIC_RECOMMENDATION)
        return self

    def add_summary(self):
        self.summary = _SUMMARY_BY_STATUS[self._attempt.status]
        return self

    def build(self):
        attempt, events = self._attempt, self._events
        return {
            "attemptId": str(attempt.id),
            "caseTitle": attempt.case_version.simulation_case.title,
            "status": attempt.status,
            "finalScore": attempt.accumulated_score,
            "finalStress": attempt.stress_index,
            "metrics": metrics(attempt),
            "adequateDecisions": self.adequate,
            "riskyDecisions": self.risky,
            "inadequateDecisions": self.inadequate,
            "prohibitedDecisions": self.prohibited,
            "toolsUsed": self.tools_used,
            # Primeras respuestas que el juego no aplicó (regla de reintento); no
            # entran en los conteos de arriba ni en el final.
            "retries": self.retries,
            # De esas, las que eran conducta prohibida (el docente las distingue en su traza).
            "prohibitedRetries": self.prohibited_retries,
            "reflectionsCount": self.reflections_count,
            # Por evento, no por estado: un intento reanudado y completado también
            # registra honestamente que usó la salida segura en el camino.
            "safeExitUsed": any(ev.event_type == "SAFE_EXIT_REQUESTED" for ev in events),
            "visitedNodeTitles": self.visited,
            "competencies": self.competencies,
            "recommendations": self.recommendations,
            "summaryMessage": self.summary,
            "totalDurationSeconds": (
                int((attempt.ended_at - attempt.started_at).total_seconds())
                if attempt.started_at and attempt.ended_at else None
            ),
            "timeline": build_timeline(attempt, events),
            # Efecto mariposa: final canónico (1-4) + flags/métricas acumuladas.
            "ending": case_effects.compute_ending(attempt, events),
        }


def build_completion_report(attempt, events):
    """Director: fija el orden de los pasos del Builder y devuelve el reporte."""
    return (
        CompletionReportBuilder(attempt, events)
        .count_events()
        .count_reflections()
        .add_competencies()
        .add_recommendations()
        .add_summary()
        .build()
    )


def attempt_state(attempt, raw_token, feedback, events=None):
    in_progress = attempt.status == "IN_PROGRESS"
    completion_report = None
    if not in_progress:
        if events is None:
            from apps.simulation.models import AttemptEvent
            events = list(AttemptEvent.objects.filter(attempt_id=attempt.id).order_by("occurred_at", "id"))
        completion_report = build_completion_report(attempt, events)
    return {
        "attemptId": str(attempt.id),
        "attemptToken": raw_token,
        "caseVersionId": attempt.case_version_id,
        "caseTitle": attempt.case_version.simulation_case.title,
        "status": attempt.status,
        "accumulatedScore": attempt.accumulated_score,
        "stressIndex": attempt.stress_index,
        "metrics": metrics(attempt),
        "clinicalState": case_effects.clinical_state(attempt),
        "currentNode": node_state(attempt.current_node, in_progress),
        "feedback": feedback,
        "completionReport": completion_report,
        "supportResources": SAFE_EXIT_RESOURCES if attempt.status in ("SAFE_EXITED", "PAUSED") else [],
    }


def progress_map_node(node):
    # Título completo: recortar es cosa de la vista (la lista «Trazabilidad» hace salto de línea).
    return {
        "key": node.node_key,
        "label": (node.title or "").strip() or "Nodo",
        "start": node.start_node,
        "terminal": node.terminal_node,
    }
