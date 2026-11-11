"""Response DTO builders for the student simulation flow — field names match
Spring SimulationDtos exactly (camelCase JSON)."""
import re

from shared.jsonutils import read_string_list

from apps.simulation.casedef.vocabulary import Intensity, ResponseClass
from apps.simulation.models import (
    RETRY_EVENT_TYPES,
    AttemptStatus,
    ClinicalTool,
    DecisionOption,
    MapObject,
    ReflectionJournal,
)
from apps.simulation.services import endings

SAFE_EXIT_RESOURCES = [
    "Puedes pausar el intento y retomarlo con acompañamiento docente.",
    "Si el contenido activa malestar, contacta al Centro Integral de Psicología o a Bienestar Universitario.",
    "En riesgo inmediato, prioriza líneas locales de emergencia y rutas institucionales de protección.",
]


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
    # La clase de la respuesta y la conducta prohibida viajan únicamente en el reporte de cierre.
    return {
        "id": option.id,
        "text": option.text,
    }


def node_state(node, include_options, options=None):
    """La escena para el jugador. ``options`` es la lista ya filtrada por disponibilidad (``option_availability``); sin
    ella se consultan todas las opciones de la escena."""
    if include_options and not node.terminal_node:
        rows = options if options is not None else DecisionOption.objects.filter(source_node_id=node.id).order_by("id")
        options = [decision_option_state(o) for o in rows]
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
        # Cuánta carga emocional trae la escena (LOW | MEDIUM | HIGH); MEDIUM si la columna viene vacía.
        "intensity": node.intensity or Intensity.MEDIUM.value,
        "terminal": node.terminal_node,
        "decisionPrompt": node.decision_prompt,
        "goal": node.goal,
        "displayOrder": node.display_order,
        "options": options,
    }


def consequence_dto(decision):
    """La consecuencia narrativa de una decisión registrada (C2, RN-08).

    El texto propio de la opción (``consequence_text``) o, si no lo tiene, la narrativa del
    nodo al que lleva: ``source`` dice cuál (``OPTION`` | ``NODE``). No es retroalimentación:
    no dice si estuvo bien o mal.
    """
    text = (decision.consequence_text or "").strip()
    if text:
        return {"text": text, "source": "OPTION"}
    return {"text": decision.target_node.narrative or "", "source": "NODE"}


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


def build_timeline(attempt, events, class_of=None):
    """Línea de tiempo de decisiones/acciones clave para el reporte del estudiante.

    Sin cifras: cada entrada dice cuándo, qué tipo de evento y, si fue una decisión, de qué clase (``class``).
    ``class_of`` es la función que da la clase de una opción (``case_state.response_class_of``): los DTO no
    importan servicios, así que la pasa quien llama; sin ella la clase queda en ``None``.
    """
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
        response_class = class_of(decision) if decision is not None and class_of is not None else None
        timeline.append({
            "atSeconds": seconds,
            "time": _format_mmss(seconds),
            "type": ev.event_type,
            "class": response_class.value if response_class else None,
            "prohibited": response_class == ResponseClass.CONTRAINDICATED,
            "label": (
                decision.text if decision
                else _tool_event_label(ev.detail, tool_labels, object_labels) if ev.event_type == "TOOL_USED"
                else ev.detail
            ) or "",
        })
    return timeline


def _reconsidered_recommendation(retries):
    if retries == 1:
        return "Reconsideraste 1 respuesta antes de decidir; revísala con tu docente."
    return f"Reconsideraste {retries} respuestas antes de decidir; revísalas con tu docente."


_SUMMARY_BY_STATUS = {
    AttemptStatus.COMPLETED: "Intento finalizado. Tu recorrido quedó registrado para evaluación formativa.",
    AttemptStatus.PAUSED: "Pausa segura activa. Tu intento quedó guardado tal cual y puedes reanudarlo cuando lo decidas, sin penalización.",
    AttemptStatus.SAFE_EXITED: "Salida segura registrada. El intento quedó cerrado, sin penalización, y disponible para revisión docente.",
    AttemptStatus.REPLACED: "Intento reemplazado. Empezaste uno nuevo y este quedó cerrado tal como estaba, disponible para revisión docente.",
    AttemptStatus.IN_PROGRESS: "Intento en progreso.",
}

#: Estados en los que el intento ofrece los recursos de apoyo y recomienda retomar con acompañamiento.
_SUPPORT_STATUSES = (AttemptStatus.SAFE_EXITED, AttemptStatus.PAUSED)
# BORRADOR: texto del servidor, pendiente de la aprobación de Psicología (VD-23).
_SUPPORT_RECOMMENDATION = "Retoma el caso con acompañamiento docente cuando te sientas preparado/a."


class CompletionReportBuilder:
    """Builder del reporte de cierre: arma el reporte paso a paso.

    Cada ``count_*`` / ``add_*`` calcula una parte (conteos de hechos, recomendaciones, resumen) y devuelve el propio
    constructor, de modo que se encadenan. ``build()`` ensambla el reporte de cierre y ``build_summary()`` el resumen
    sin evaluación de un intento que no se completó. Aquí no hay clases de respuesta, hitos ni competencias: eso lo
    añade ``attempt_report.build_report_payload`` (los DTO no importan servicios). Solo se cuentan hechos.
    """

    def __init__(self, attempt, events, class_of=None):
        self._attempt = attempt
        self._events = events
        self._class_of = class_of
        self.tools_used = self.retries = self.prohibited_retries = 0
        self.reflections_count = 0
        self.visited = []
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
            if ev.event_type in RETRY_EVENT_TYPES:
                # Reconsideración: no se aplicó (se reporta aparte de las decisiones).
                self.retries += 1
                if ev.event_type == "PROHIBITED_DECISION_RETRY_REQUIRED":
                    self.prohibited_retries += 1
        return self

    def count_reflections(self):
        self.reflections_count = ReflectionJournal.objects.filter(attempt_id=self._attempt.id).count()
        return self

    def add_recommendations(self):
        """Solo las de hechos: lo reconsiderado y retomar con acompañamiento tras una pausa o salida segura.

        Las que salen de hitos faltantes y de competencias en inicio las antepone ``build_report_payload``.
        """
        if self.retries > 0:
            # No son decisiones, pero el estudiante debe ver que reconsideró algo: el juego le dijo en el momento
            # «no se aplicó, reconsidera» y el cierre no puede callarlo.
            self.recommendations.append(_reconsidered_recommendation(self.retries))
        if self._attempt.status in _SUPPORT_STATUSES:
            self.recommendations.append(_SUPPORT_RECOMMENDATION)
        return self

    def add_summary(self):
        self.summary = _SUMMARY_BY_STATUS[self._attempt.status]
        return self

    def _clock_seconds(self):
        attempt = self._attempt
        return (
            int((attempt.ended_at - attempt.started_at).total_seconds())
            if attempt.started_at and attempt.ended_at else None
        )

    def _facts(self):
        """Lo que comparten el reporte de cierre y el resumen: hechos y duraciones, sin evaluación."""
        attempt = self._attempt
        clock_seconds = self._clock_seconds()
        return {
            "attemptId": str(attempt.id),
            "caseTitle": attempt.case_version.simulation_case.title,
            "status": attempt.status,
            "toolsUsed": self.tools_used,
            # Primeras respuestas que el juego no aplicó (regla de reintento); no entran en los conteos por clase.
            "retries": self.retries,
            "reflectionsCount": self.reflections_count,
            # Por evento, no por estado: un intento reanudado y completado también
            # registra honestamente que usó la salida segura en el camino.
            "safeExitUsed": any(ev.event_type == "SAFE_EXIT_REQUESTED" for ev in self._events),
            "visitedNodeTitles": self.visited,
            "summaryMessage": self.summary,
            "totalDurationSeconds": clock_seconds,
            # Tiempo activo (acumulador del intento, E1-5) y de reloj: no es lo mismo, y el reporte
            # no debe ofrecer uno por el otro.
            "activeSeconds": int(round(attempt.active_seconds or 0)),
            "clockSeconds": clock_seconds,
        }

    def build(self):
        attempt, events = self._attempt, self._events
        report = self._facts()
        report.update({
            # De esas, las que eran conducta prohibida (el docente las distingue en su traza).
            "prohibitedRetries": self.prohibited_retries,
            "recommendations": self.recommendations,
            "timeline": build_timeline(attempt, events, self._class_of),
            # El final por hitos y clases de respuesta (los propios del caso o la plantilla), con su razón en palabras.
            "ending": endings.compute_ending(attempt, events),
        })
        return report

    def build_summary(self):
        """El resumen de un intento que no se completó: hechos y duraciones, sin evaluación.

        Sin decisiones, clases, hitos, final ni línea de tiempo: antes de cerrar no llega al estudiante nada que
        califique su recorrido. Las recomendaciones se limitan a retomar con acompañamiento.
        """
        report = self._facts()
        report["recommendations"] = (
            [_SUPPORT_RECOMMENDATION] if self._attempt.status in _SUPPORT_STATUSES else []
        )
        return report


def build_completion_report(attempt, events, class_of=None):
    """Director: fija el orden de los pasos del Builder y devuelve el reporte de cierre (sin clases ni hitos).

    ``class_of`` da la clase de una opción para la línea de tiempo (``case_state.response_class_of``).
    """
    return (
        CompletionReportBuilder(attempt, events, class_of)
        .count_events()
        .count_reflections()
        .add_recommendations()
        .add_summary()
        .build()
    )


def build_student_summary(attempt, events):
    """El resumen del intento que no se completó (pausado, con salida segura o reemplazado)."""
    return (
        CompletionReportBuilder(attempt, events)
        .count_events()
        .count_reflections()
        .add_summary()
        .build_summary()
    )


def attempt_state(attempt, raw_token, persona, completion_report=None, options=None):
    """El estado del intento. ``persona`` es la persona consultante ya en palabras
    (``{"bond", "activation", "label"}``): la lee quien llama del estado guardado del mundo, porque
    los DTO no importan servicios. ``completion_report`` es el reporte congelado de un intento completado
    (E1-8); un intento que no está completado va con ``completionReport: null``: lo evaluativo (clases,
    conteos, línea de tiempo) llega al cerrar y no se arma en vivo para el estudiante.

    ``options`` son las opciones ofrecidas de la escena actual (ya filtradas por disponibilidad); sin ellas se listan todas.

    No lleva retroalimentación de la última decisión: esa respuesta es solo su consecuencia."""
    in_progress = attempt.status == AttemptStatus.IN_PROGRESS
    return {
        "attemptId": str(attempt.id),
        "attemptToken": raw_token,
        "caseVersionId": attempt.case_version_id,
        "caseTitle": attempt.case_version.simulation_case.title,
        "status": attempt.status,
        "persona": persona,
        "currentNode": node_state(attempt.current_node, in_progress, options),
        "completionReport": completion_report,
        "supportResources": SAFE_EXIT_RESOURCES if attempt.status in _SUPPORT_STATUSES else [],
    }


def progress_map_node(node):
    # Título completo: recortar es cosa de la vista (la lista «Trazabilidad» hace salto de línea).
    return {
        "key": node.node_key,
        "label": (node.title or "").strip() or "Nodo",
        "start": node.start_node,
        "terminal": node.terminal_node,
    }
