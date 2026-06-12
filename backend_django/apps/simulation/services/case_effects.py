"""Efecto mariposa del caso PDF (Violencia Familiar y Tentativa de Feminicidio).

Capa de consecuencias acumulativas por ENCIMA del motor genérico del DAG
(decision_effects sigue gobernando score/estrés/confianza/riesgo legacy):

- cada opción canónica tiene una severidad pedagógica
  (recommended | acceptable | risky | critical);
- cada opción puede activar flags clínicos (pap_aplicado, mediacion_agresor_
  intentada, ...) y mover métricas del caso (confianza, crisis_emocional, ...);
- flags y métricas viven en AttemptWorldState.flags_json bajo "caseFlags" y
  "caseMetrics" (no hay columnas nuevas: el esquema Flyway está congelado);
- al completar el intento, compute_ending() resuelve uno de los 4 finales.

Las opciones se identifican por option_key (estables, definidas por el seed
seed_caso_pdf). Para opciones fuera del registro la severidad se deriva de la
clasificación legacy, así otros casos siguen funcionando sin registro propio.
"""
from apps.simulation.models import AttemptWorldState
from shared.jsonutils import read_map as _read_map, write_map as _write_map

SEVERITY_RECOMMENDED = "recommended"
SEVERITY_ACCEPTABLE = "acceptable"
SEVERITY_RISKY = "risky"
SEVERITY_CRITICAL = "critical"

#: Métricas del caso (0-100, inician en 50).
CASE_METRIC_KEYS = (
    "confianza",
    "crisis_emocional",
    "riesgo_victima",
    "rigor_tecnico",
    "etica_profesional",
    "ruta_institucional",
    "calidad_duelo",
)

#: Registro canónico de consecuencias por option_key (caso PDF).
OPTION_EFFECTS = {
    # ── Hospital 1 — Foco inmediato ──────────────────────────────────────────
    "h1-noticia-sin-protocolo": {
        "severity": SEVERITY_CRITICAL,
        "flags": {"noticia_muerte_mal_manejada": True},
        "metrics": {"calidad_duelo": -25, "crisis_emocional": 25, "confianza": -15,
                    "etica_profesional": -15, "rigor_tecnico": -10},
    },
    "h1-pap-contencion": {
        "severity": SEVERITY_RECOMMENDED,
        "flags": {"pap_aplicado": True, "familia_contenida": True},
        "metrics": {"confianza": 15, "crisis_emocional": -20, "calidad_duelo": 15,
                    "rigor_tecnico": 10, "etica_profesional": 10, "riesgo_victima": -5},
    },
    "h1-interrogar-victima": {
        "severity": SEVERITY_CRITICAL,
        "flags": {"interrogatorio_prematuro": True},
        "metrics": {"etica_profesional": -25, "riesgo_victima": 15, "confianza": -20,
                    "crisis_emocional": 15, "rigor_tecnico": -10},
    },
    # ── Hospital 2 — Marco normativo ─────────────────────────────────────────
    "h2-solo-459": {
        "severity": SEVERITY_ACCEPTABLE,
        "flags": {},
        "metrics": {"ruta_institucional": 5, "rigor_tecnico": 2},
    },
    "h2-459-1257": {
        "severity": SEVERITY_RECOMMENDED,
        "flags": {"marco_hospital_correcto": True},
        "metrics": {"ruta_institucional": 15, "rigor_tecnico": 10, "etica_profesional": 5},
    },
    "h2-459-1448": {
        "severity": SEVERITY_RISKY,
        "flags": {},
        "metrics": {"ruta_institucional": -10, "rigor_tecnico": -8},
    },
    # ── Hospital 3 — Acción técnica y ética ──────────────────────────────────
    "h3-parcial-disonancia": {
        "severity": SEVERITY_RISKY,
        "flags": {},
        "metrics": {"rigor_tecnico": -5, "calidad_duelo": -5, "crisis_emocional": 5},
    },
    "h3-pap-epicee": {
        "severity": SEVERITY_ACCEPTABLE,
        "flags": {"epicee_aplicado": True},
        "metrics": {"rigor_tecnico": 8, "calidad_duelo": 8, "crisis_emocional": -5},
    },
    "h3-epicee-ciclo": {
        "severity": SEVERITY_ACCEPTABLE,
        "flags": {"epicee_aplicado": True},
        "metrics": {"rigor_tecnico": 10, "calidad_duelo": 8, "crisis_emocional": -5},
    },
    "h3-integral-psicosocial": {
        "severity": SEVERITY_RECOMMENDED,
        "flags": {"epicee_aplicado": True, "duelo_acompanado": True},
        "metrics": {"rigor_tecnico": 15, "calidad_duelo": 15, "etica_profesional": 10,
                    "confianza": 10, "crisis_emocional": -10},
    },
    # ── Comisaría 1 — Prioridad psicosocial ──────────────────────────────────
    "c1-mediacion-perdon": {
        "severity": SEVERITY_CRITICAL,
        "flags": {"mediacion_agresor_intentada": True},
        "metrics": {"riesgo_victima": 30, "etica_profesional": -25, "confianza": -20,
                    "ruta_institucional": -15, "crisis_emocional": 15},
    },
    "c1-riesgo-proteccion-derechos": {
        "severity": SEVERITY_RECOMMENDED,
        "flags": {"riesgo_feminicidio_valorado": True, "medidas_proteccion_activadas": True,
                  "asesoria_derechos_realizada": True},
        "metrics": {"riesgo_victima": -25, "ruta_institucional": 20, "confianza": 10,
                    "etica_profesional": 10, "rigor_tecnico": 10},
    },
    "c1-patrones-infancia": {
        "severity": SEVERITY_RISKY,
        "flags": {},
        "metrics": {"riesgo_victima": 10, "rigor_tecnico": -10, "ruta_institucional": -10},
    },
    # ── Comisaría 2 — Marco normativo ────────────────────────────────────────
    "c2-2126-1098-1257": {
        "severity": SEVERITY_RECOMMENDED,
        "flags": {"marco_comisaria_correcto": True},
        "metrics": {"ruta_institucional": 15, "rigor_tecnico": 10},
    },
    "c2-1098-1257": {
        "severity": SEVERITY_ACCEPTABLE,
        "flags": {},
        "metrics": {"ruta_institucional": 5, "rigor_tecnico": 3},
    },
    "c2-eje-1448": {
        "severity": SEVERITY_RISKY,
        "flags": {},
        "metrics": {"ruta_institucional": -8, "rigor_tecnico": -8},
    },
    # ── Comisaría 3 — Acción técnica y ética ─────────────────────────────────
    "c3-parcial-clinica": {
        "severity": SEVERITY_RISKY,
        "flags": {"riesgo_feminicidio_valorado": True},
        "metrics": {"rigor_tecnico": 3, "riesgo_victima": -3},
    },
    "c3-valoracion-dependientes": {
        "severity": SEVERITY_ACCEPTABLE,
        "flags": {"valoracion_dependientes_realizada": True,
                  "derivacion_salud_mental_activada": True},
        "metrics": {"riesgo_victima": -8, "rigor_tecnico": 8, "ruta_institucional": 5},
    },
    "c3-integral-derechos": {
        "severity": SEVERITY_RECOMMENDED,
        "flags": {"valoracion_dependientes_realizada": True,
                  "riesgo_feminicidio_valorado": True,
                  "derivacion_salud_mental_activada": True},
        "metrics": {"riesgo_victima": -15, "rigor_tecnico": 15, "etica_profesional": 10,
                    "ruta_institucional": 10},
    },
}

#: Severidad por clasificación legacy (opciones sin registro propio).
_SEVERITY_BY_CLASSIFICATION = {
    "ADEQUATE": SEVERITY_RECOMMENDED,
    "RISKY": SEVERITY_RISKY,
    "INADEQUATE": SEVERITY_CRITICAL,
}

ENDINGS = {
    "integral": {
        "key": "integral",
        "title": "Final 1 — Intervención Protectora Integral",
        "message": (
            "Lograste una intervención protectora, ética e interdisciplinaria. "
            "La ruta institucional queda activada y la sobreviviente recibe "
            "orientación integral."
        ),
        "tone": "positive",
    },
    "brechas": {
        "key": "brechas",
        "title": "Final 2 — Intervención Adecuada con Brechas",
        "message": (
            "La intervención contiene elementos adecuados, pero dejó brechas en la "
            "valoración o articulación institucional que deben corregirse."
        ),
        "tone": "neutral",
    },
    "riesgo": {
        "key": "riesgo",
        "title": "Final 3 — Riesgo Persistente",
        "message": (
            "El acompañamiento redujo parte de la crisis, pero el riesgo "
            "institucional y psicosocial permanece alto por omisiones críticas."
        ),
        "tone": "warning",
    },
    "critico": {
        "key": "critico",
        "title": "Final 4 — Intervención Crítica / Revictimizante",
        "message": (
            "La intervención aumentó el riesgo de revictimización y falló en "
            "activar medidas de protección básicas. Se requiere supervisión y "
            "corrección inmediata."
        ),
        "tone": "critical",
    },
}


def _clamp(value, lo=0, hi=100):
    return max(lo, min(hi, value))


def option_severity(decision):
    """Severidad pedagógica de una opción (registro canónico o clasificación)."""
    entry = OPTION_EFFECTS.get(decision.option_key)
    if entry:
        return entry["severity"]
    if decision.prohibited_conduct:
        return SEVERITY_CRITICAL
    return _SEVERITY_BY_CLASSIFICATION.get(decision.classification, SEVERITY_RISKY)


def _load_state(attempt):
    return AttemptWorldState.objects.filter(attempt_id=attempt.id).first()


def read_case_state(attempt):
    """(flags, metrics) del caso para el intento — métricas con defaults en 50."""
    state = _load_state(attempt)
    raw = _read_map(state.flags_json) if state else {}
    flags = raw.get("caseFlags") if isinstance(raw.get("caseFlags"), dict) else {}
    metrics_raw = raw.get("caseMetrics") if isinstance(raw.get("caseMetrics"), dict) else {}
    metrics = {key: int(metrics_raw.get(key, 50)) for key in CASE_METRIC_KEYS}
    return flags, metrics


def apply_case_effects(attempt, decision):
    """Aplica flags + métricas de la opción al estado del mundo del intento.

    No-op silencioso si la opción no está en el registro o si el intento aún
    no tiene world state (p. ej. tests del motor genérico sin mundo).
    """
    entry = OPTION_EFFECTS.get(decision.option_key)
    if not entry:
        return
    state = _load_state(attempt)
    if state is None:
        return
    raw = _read_map(state.flags_json)
    flags = raw.get("caseFlags") if isinstance(raw.get("caseFlags"), dict) else {}
    metrics_raw = raw.get("caseMetrics") if isinstance(raw.get("caseMetrics"), dict) else {}
    metrics = {key: int(metrics_raw.get(key, 50)) for key in CASE_METRIC_KEYS}

    flags.update(entry["flags"])
    for key, delta in entry["metrics"].items():
        metrics[key] = _clamp(metrics.get(key, 50) + delta)

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


def compute_ending(attempt, events):
    """Resuelve el final del caso (4 finales canónicos del prompt maestro).

    Solo aplica a intentos COMPLETED; en otros estados devuelve None.
    Reglas (en orden): crítico → integral → riesgo persistente → brechas.
    """
    if attempt.status != "COMPLETED":
        return None

    decisions = [ev.decision_option for ev in events if ev.decision_option_id]
    if not decisions:
        return None
    counts = severity_counts(decisions)
    flags, metrics = read_case_state(attempt)

    criticals = counts[SEVERITY_CRITICAL]
    riskies = counts[SEVERITY_RISKY]
    recommended = counts[SEVERITY_RECOMMENDED]

    proteccion_completa = (
        flags.get("riesgo_feminicidio_valorado")
        and flags.get("medidas_proteccion_activadas")
        and flags.get("asesoria_derechos_realizada")
    )

    # Final 4 — crítico/revictimizante: dos o más críticas, o mediación con el
    # agresor como ruta (sin protección que la compense — que la excluye).
    if criticals >= 2 or (flags.get("mediacion_agresor_intentada") and not proteccion_completa):
        ending = ENDINGS["critico"]
    # Final 1 — integral: sin críticas, máx. una risky, hitos clínicos completos.
    elif (
        criticals == 0
        and riskies <= 1
        and recommended >= 4
        and flags.get("pap_aplicado")
        and flags.get("marco_hospital_correcto")
        and proteccion_completa
    ):
        ending = ENDINGS["integral"]
    # Final 3 — riesgo persistente: omisiones de valoración/protección/derechos
    # o acumulación de decisiones parciales.
    elif (
        not flags.get("riesgo_feminicidio_valorado")
        or not flags.get("medidas_proteccion_activadas")
        or not flags.get("asesoria_derechos_realizada")
        or riskies >= 3
    ):
        ending = ENDINGS["riesgo"]
    else:
        ending = ENDINGS["brechas"]

    return {
        **ending,
        "severityCounts": counts,
        "caseFlags": flags,
        "caseMetrics": metrics,
    }
