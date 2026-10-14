"""Efecto mariposa del caso: consecuencias acumulativas como DATOS del caso (E3-8, RNF-008).

Capa de consecuencias por ENCIMA del motor genérico del DAG (decision_effects sigue gobernando
score/estrés/confianza/riesgo legacy). Antes vivía en un registro de código por ``option_key``
del caso PDF; ahora es de la versión:

- cada opción lleva sus ``effects`` (``decision_options.effects``): su severidad pedagógica
  (recommended | acceptable | risky | critical), las banderas clínicas que enciende y cuánto
  mueve las métricas del caso;
- las métricas del caso y sus finales viven en ``case_versions.rules`` (``metrics`` y
  ``endings``, ver ``case_rules``); la condición de cada final la resuelve ``conditions``;
- flags y métricas de **un intento** viven en AttemptWorldState.flags_json bajo "caseFlags" y
  "caseMetrics" (no hay columnas nuevas);
- al completar el intento, ``compute_ending`` resuelve el final del caso.

Compatibilidad (R10): una opción sin ``effects`` toma la severidad de su clasificación y no mueve
nada, así otros casos siguen funcionando sin registro propio; un caso que declara las siete
métricas del caso PDF pero no ``rules.endings`` usa ``DEFAULT_ENDINGS``; y un dato malformado en
la base nunca rompe una partida: se descarta y la partida sigue (Review Focus 5).
"""
from apps.simulation.models import AttemptStatus, AttemptWorldState
from shared.jsonutils import (
    clamp as _clamp,
    read_map as _read_map,
    write_map as _write_map,
)

from . import case_rules
from .case_rules import (  # noqa: F401  (reexportados: los importan el DTO y las pruebas)
    SEVERITY_ACCEPTABLE,
    SEVERITY_CRITICAL,
    SEVERITY_RECOMMENDED,
    SEVERITY_RISKY,
)
from .conditions import evaluate
from .world_state import ensure_world_state

#: Eventos de decisión REGISTRADA: los únicos que cuentan en el reporte y en el
#: final. La primera respuesta riesgosa/inadecuada de una escena no se aplica
#: (regla de reintento) y queda como evento *_RETRY_REQUIRED, que se reporta
#: aparte: contarla contradiría lo que el juego le promete a la persona.
REGISTERED_DECISION_EVENT_TYPES = ("DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED")
RETRY_EVENT_TYPES = ("DECISION_RETRY_REQUIRED", "PROHIBITED_DECISION_RETRY_REQUIRED")

#: Métricas del HUD clínico (0-100, inician en 50): las que lee ``clinical_state`` y las que
#: declara el caso PDF. Un caso sin ``rules.metrics`` conserva estas siete.
CASE_METRIC_KEYS = (
    "confianza",
    "crisis_emocional",
    "riesgo_victima",
    "rigor_tecnico",
    "etica_profesional",
    "ruta_institucional",
    "calidad_duelo",
)
#: Valor con el que parte cada métrica del caso mientras ninguna opción la haya movido.
CASE_METRIC_INITIAL = 50

#: Las métricas por defecto del caso (``rules.metrics``): las siete, a 50.
DEFAULT_METRICS = [{"key": key, "initial": CASE_METRIC_INITIAL} for key in CASE_METRIC_KEYS]

_PROTECCION_COMPLETA = [
    {"flag": "riesgo_feminicidio_valorado"},
    {"flag": "medidas_proteccion_activadas"},
    {"flag": "asesoria_derechos_realizada"},
]

#: Los finales por defecto, en orden de evaluación (R10): crítico → integral → riesgo persistente
#: → brechas (el último no trae ``when``: es el valor por defecto). Es el dato que escribe la
#: semilla y el que usa un caso con las siete métricas y sin ``rules.endings``.
DEFAULT_ENDINGS = [
    {
        "key": "critico",
        "title": "Final 4 — Intervención Crítica / Revictimizante",
        "message": (
            "La intervención aumentó el riesgo de revictimización y falló en "
            "activar medidas de protección básicas. Se requiere supervisión y "
            "corrección inmediata."
        ),
        "tone": "critical",
        # Dos o más críticas, o mediación con el agresor como ruta sin protección que la compense.
        "when": {"any": [
            {"count": "critical", "gte": 2},
            {"all": [
                {"flag": "mediacion_agresor_intentada"},
                {"not": {"all": _PROTECCION_COMPLETA}},
            ]},
        ]},
    },
    {
        "key": "integral",
        "title": "Final 1 — Intervención Protectora Integral",
        "message": (
            "Lograste una intervención protectora, ética e interdisciplinaria. "
            "La ruta institucional queda activada y la sobreviviente recibe "
            "orientación integral."
        ),
        "tone": "positive",
        # Sin críticas, a lo sumo una riesgosa, hitos clínicos completos.
        "when": {"all": [
            {"count": "critical", "eq": 0},
            {"count": "risky", "lte": 1},
            {"count": "recommended", "gte": 4},
            {"flag": "pap_aplicado"},
            {"flag": "marco_hospital_correcto"},
            *_PROTECCION_COMPLETA,
        ]},
    },
    {
        "key": "riesgo",
        "title": "Final 3 — Riesgo Persistente",
        "message": (
            "El acompañamiento redujo parte de la crisis, pero el riesgo "
            "institucional y psicosocial permanece alto por omisiones críticas."
        ),
        "tone": "warning",
        # Omisiones de valoración, protección o derechos, o acumulación de decisiones parciales.
        "when": {"any": [
            {"not": {"flag": "riesgo_feminicidio_valorado"}},
            {"not": {"flag": "medidas_proteccion_activadas"}},
            {"not": {"flag": "asesoria_derechos_realizada"}},
            {"count": "risky", "gte": 3},
        ]},
    },
    {
        "key": "brechas",
        "title": "Final 2 — Intervención Adecuada con Brechas",
        "message": (
            "La intervención contiene elementos adecuados, pero dejó brechas en la "
            "valoración o articulación institucional que deben corregirse."
        ),
        "tone": "neutral",
    },
]

#: Severidad por clasificación legacy (opciones sin ``effects`` propios).
_SEVERITY_BY_CLASSIFICATION = {
    "ADEQUATE": SEVERITY_RECOMMENDED,
    "RISKY": SEVERITY_RISKY,
    "INADEQUATE": SEVERITY_CRITICAL,
}


def _rules_of(attempt):
    version = getattr(attempt, "case_version", None)
    return case_rules.rules_of(version) if version is not None else case_rules.CaseRules()


def _metric_initials(rules):
    """``{clave: valor inicial}`` de las métricas del caso: las declaradas o las del HUD."""
    if rules.metrics:
        return dict(rules.metrics)
    return {key: CASE_METRIC_INITIAL for key in CASE_METRIC_KEYS}


def option_effects(decision, rules=None):
    """Los efectos de una opción: ``{severity, flags, metrics}``.

    Salen de sus datos (``decision_options.effects``) y, donde faltan o están rotos, de la
    clasificación: la severidad por conducta prohibida o clasificación y ningún cambio.
    """
    entry = case_rules.effects_of(decision)
    severity = entry.get("severity")
    if severity is None:
        if getattr(decision, "prohibited_conduct", False):
            severity = SEVERITY_CRITICAL
        else:
            severity = _SEVERITY_BY_CLASSIFICATION.get(
                getattr(decision, "classification", None), SEVERITY_RISKY
            )
    return {"severity": severity, "flags": entry.get("flags", {}), "metrics": entry.get("metrics", {})}


def option_severity(decision):
    """Severidad pedagógica de una opción (sus datos o su clasificación)."""
    return option_effects(decision)["severity"]


def _load_state(attempt):
    return AttemptWorldState.objects.filter(attempt_id=attempt.id).first()


def _case_state_of(raw, initials):
    flags = raw.get("caseFlags") if isinstance(raw.get("caseFlags"), dict) else {}
    metrics_raw = raw.get("caseMetrics") if isinstance(raw.get("caseMetrics"), dict) else {}
    metrics = {}
    for key, initial in initials.items():
        value = metrics_raw.get(key, initial)
        metrics[key] = value if isinstance(value, int) and not isinstance(value, bool) else initial
    return flags, metrics


def read_case_state(attempt):
    """(flags, metrics) del caso para el intento — métricas con sus valores iniciales por defecto."""
    state = _load_state(attempt)
    raw = _read_map(state.flags_json) if state else {}
    return _case_state_of(raw, _metric_initials(_rules_of(attempt)))


def clinical_state(attempt):
    """Clinical HUD projection derived only from persisted attempt world state."""
    flags, metrics = read_case_state(attempt)
    trust = metrics.get("confianza", CASE_METRIC_INITIAL)
    return {
        "papApplied": bool(flags.get("pap_aplicado")),
        "patient": {
            "emotionalState": metrics.get("calidad_duelo", CASE_METRIC_INITIAL),
            "trustLevel": trust,
            "openness": trust,
            "crisisLevel": metrics.get("crisis_emocional", CASE_METRIC_INITIAL),
        },
    }


def apply_case_effects(attempt, decision):
    """Aplica flags + métricas de la opción al estado del mundo del intento.

    No-op silencioso si la opción no trae efectos o si el intento aún no tiene world state
    (p. ej. tests del motor genérico sin mundo).
    """
    entry = case_rules.effects_of(decision)
    if not entry:
        return
    state = _load_state(attempt)
    if state is None:
        # Desde E1-6 leer el mundo ya no lo guarda: una decisión tomada antes de cualquier orden
        # que lo mute lo crea aquí para no perder los efectos del caso. Un nodo sin escena
        # (motor genérico sin mundo) sigue siendo un no-op.
        state = ensure_world_state(attempt)
    if state is None:
        return
    initials = _metric_initials(_rules_of(attempt))
    raw = _read_map(state.flags_json)
    flags, metrics = _case_state_of(raw, initials)

    flags.update(entry.get("flags", {}))
    for key, delta in entry.get("metrics", {}).items():
        # Una métrica fuera de las declaradas también parte de su valor inicial por defecto.
        metrics[key] = _clamp(metrics.get(key, CASE_METRIC_INITIAL) + delta)

    raw["caseFlags"] = flags
    raw["caseMetrics"] = metrics
    state.flags_json = _write_map(raw)
    state.save(update_fields=["flags_json", "updated_at"])


def severity_counts(decisions):
    counts = {SEVERITY_RECOMMENDED: 0, SEVERITY_ACCEPTABLE: 0,
              SEVERITY_RISKY: 0, SEVERITY_CRITICAL: 0}
    for decision in decisions:
        counts[option_severity(decision)] += 1
    return counts


def _endings_of(rules):
    """Los finales que aplican a la versión, en orden: los suyos, los de por defecto o ninguno."""
    if rules.endings:
        return rules.endings
    declared = {key for key, _ in rules.metrics}
    if declared.issuperset(CASE_METRIC_KEYS):
        return tuple(DEFAULT_ENDINGS)
    return ()


def compute_ending(attempt, events):
    """Resuelve el final del caso con los finales de su versión (datos, ``rules.endings``).

    Solo aplica a intentos COMPLETED; en otros estados devuelve None. Recorre los finales en
    orden y gana el primero cuya condición se cumple; el que no trae ``when`` es el valor por
    defecto. Un caso sin finales (ni propios ni las siete métricas del caso PDF) no tiene final.
    """
    if attempt.status != AttemptStatus.COMPLETED:
        return None

    decisions = [
        ev.decision_option for ev in events
        if ev.decision_option_id and ev.event_type in REGISTERED_DECISION_EVENT_TYPES
    ]
    if not decisions:
        return None
    endings = _endings_of(_rules_of(attempt))
    if not endings:
        return None
    counts = severity_counts(decisions)
    flags, metrics = read_case_state(attempt)
    context = {"flags": flags, "metrics": metrics, "counts": counts}

    for ending in endings:
        if "when" in ending and not evaluate(ending["when"], context):
            continue
        return {
            "key": ending["key"],
            "title": ending["title"],
            "message": ending["message"],
            "tone": ending["tone"],
            "severityCounts": counts,
            "caseFlags": flags,
            "caseMetrics": metrics,
        }
    return None
