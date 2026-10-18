"""Los agregados de aprendizaje (E6-2a, RQ-NEG-001 a 005; mesa §A20; contrato C13).

Las metas medibles del equipo se calculan solas con lo que el sistema ya guarda al cerrar un intento: el reporte
congelado v2 (perfil por competencia, no recomendadas, reflexión), la evaluación del sistema, el evento
``FEEDBACK_VIEWED`` y la encuesta. Dos mitades:

- ``compute(rows, …)`` es PURO: recibe un ``AttemptRow`` por intento COMPLETADO y devuelve la forma de C13. No toca la
  base ni el reloj; todo promedio es exacto (``Fraction``) y se redondea una sola vez, mitad hacia arriba.
- ``load_rows(student_ids, case_version_id)`` lee esas filas con un número CONSTANTE de consultas (cuatro) y nunca trae
  texto libre: ni el comentario de la encuesta ni las reflexiones.

**Celda mínima.** Un bloque que se alimenta de menos de ``min_cell`` estudiantes DISTINTOS se omite, y con una cohorte
de menos de ``min_cell`` solo viajan ``cohort`` y ``definitions``. La cifra de un bloque omitido no se filtra por
ningún otro lado. Las series son ``(estudiante, caso)``: las versiones de un mismo caso se juntan.

**El índice 1–4 no es una nota** (RN-09): EN_INICIO 1, EN_PROCESO 2, LOGRADO 3, DESTACADO 4 es la escala sobre la que
se promedia; se devuelve solo agregado, a docentes y administradores. Todas las definiciones son BORRADOR hasta que
Psicología las confirme (ver ``definitions``) y están descritas en ``docs/operacion/analitica-de-aprendizaje.md``.
"""
import json
import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from fractions import Fraction

from django.db.models import BooleanField, Case, Value, When

from apps.simulation.models import (
    LEVEL_INDEX,
    AttemptEvent,
    AttemptFeedback,
    AttemptStatus,
    EvaluationOrigin,
    FormativeLevel,
    RubricEvaluation,
    SimulationAttempt,
)
from apps.simulation.services.attempt_report import FEEDBACK_VIEWED

from .definitions import DEFINITIONS_STATUS

logger = logging.getLogger(__name__)

#: Índice interno de cada nivel (1–4). NO es una nota: es la escala sobre la que se promedia.
_INDEX = {level.value: index for level, index in LEVEL_INDEX.items()}
#: Distancia máxima entre dos índices (de 1 a 4): la mejora se expresa como porcentaje de ese recorrido.
_SPAN = max(_INDEX.values()) - min(_INDEX.values())
#: Una calificación de la encuesta desde este valor cuenta como «satisfecha» (de 1 a 5).
SATISFIED_FROM = 4
#: Orden de una serie para un intento sin ordinal (sin reporte): al final.
_NO_ORDINAL = 10**9


@dataclass(frozen=True)
class AttemptRow:
    """Un intento COMPLETADO, reducido a lo que la analítica necesita (nunca texto libre).

    ``schema_version`` es 0 si el intento no tiene un reporte legible, 1 si es anterior a E6 y 2 si trae el perfil por
    competencia. Un reporte v1 (o ilegible) cuenta en la cohorte y en «evaluadas» y en nada más: lo cerrado no se
    reescribe y no hay niveles que inventarle.
    """

    attempt_id: str
    student_id: int
    case_id: int
    started_at: datetime
    ordinal: int | None = None  # n.º de intento del estudiante en el caso (del reporte congelado)
    schema_version: int = 0
    levels: tuple[str, ...] = ()  # nombres de nivel de las competencias CON nivel (las sin evidencia no están)
    non_recommended: int | None = None  # decisiones registradas no recomendadas (v2)
    reflection_definition: str | None = None  # la definición con la que se congeló ``reflection_covered`` (v2)
    profile_rules: str | None = None  # la versión de la regla con la que se calculó su perfil por competencia (v2)
    reflection_covered: bool | None = None
    key_evidence: bool | None = None
    system_evaluated: bool = False  # tiene una evaluación del sistema completa (todos sus criterios con nivel)
    teacher_commented: bool = False  # tiene una evaluación del docente con comentario
    feedback_viewed_at: datetime | None = None  # primera vez que su dueño abrió el reporte
    rating: int | None = None  # calificación de la encuesta (el comentario nunca llega aquí)


# ─── utilidades puras ─────────────────────────────────────────────────────────────────────────
def round_half_up(value, places):
    """``value`` redondeado a ``places`` decimales, mitad hacia arriba (en valor absoluto), como ``float``.

    Aritmética exacta con enteros: ni el redondeo bancario de ``round`` ni los errores binarios de ``float`` (6,25 → 6,3;
    2,675 → 2,68).
    """
    exact = Fraction(value)
    scale = 10**places
    rounded = int(abs(exact) * scale + Fraction(1, 2))
    return float(Fraction(-rounded if exact < 0 else rounded, scale))


def _pct(part, whole):
    return round_half_up(Fraction(part * 100, whole), 1)


def _index(row):
    """El índice del intento: el promedio de sus competencias con nivel, o ``None`` si no tiene ninguna."""
    indices = [_INDEX[level] for level in row.levels if level in _INDEX]
    return Fraction(sum(indices), len(indices)) if indices else None


def _series(rows):
    """Las series ``(estudiante, caso)`` de intentos, cada una por orden de intento (determinista)."""
    grouped = defaultdict(list)
    for row in rows:
        grouped[(row.student_id, row.case_id)].append(row)

    def order(row):
        return row.ordinal if row.ordinal is not None else _NO_ORDINAL, row.started_at, row.attempt_id

    return [sorted(group, key=order) for _, group in sorted(grouped.items())]


def _indexed(series):
    """``[(fila, índice)]`` de una serie, solo los intentos con al menos una competencia con nivel."""
    return [(row, index) for row in series if (index := _index(row)) is not None]


def _mean(values):
    return sum(values, Fraction(0)) / len(values)


# ─── los bloques ──────────────────────────────────────────────────────────────────────────────
def _improvement(series, k):
    """RQ-NEG-001 · primer frente al último intento (con índice) de cada serie de al menos dos."""
    pairs = []
    for group in series:
        indexed = _indexed(group)
        if len(indexed) >= 2:
            pairs.append((indexed[0][0].student_id, indexed[0][1], indexed[-1][1]))
    students = {student for student, _, _ in pairs}
    if len(students) < k:
        return None
    pre, post = _mean([p for _, p, _ in pairs]), _mean([q for _, _, q in pairs])
    return {
        "students": len(students),
        "series": len(pairs),
        "pre": round_half_up(pre, 2),
        "post": round_half_up(post, 2),
        "deltaPct": round_half_up((post - pre) * 100 / _SPAN, 1),
    }


def _first_vs_second(series, k):
    """RQ-NEG-003 · las no recomendadas del primer y del segundo intento v2 de cada serie de al menos dos."""
    firsts, seconds, students = [], [], set()
    for group in series:
        measured = [row for row in group if row.non_recommended is not None]
        if len(measured) >= 2:
            firsts.append(measured[0].non_recommended)
            seconds.append(measured[1].non_recommended)
            students.add(measured[0].student_id)
    if len(students) < k:
        return None
    first, second = _mean(firsts), _mean(seconds)
    if first == 0:  # sin no recomendadas en el primer intento no hay cambio relativo que calcular
        return None
    return {
        "students": len(students),
        "series": len(firsts),
        "firstMean": round_half_up(first, 2),
        "secondMean": round_half_up(second, 2),
        "nonRecommendedDeltaPct": round_half_up((second - first) * 100 / first, 1),
    }


def _acceptable(rows, k, level):
    """RQ-NEG-002 · estudiantes con algún intento cuyas competencias con nivel están TODAS en el nivel aceptable o más."""
    threshold = _INDEX[level]
    achieved = {}
    for row in rows:
        indices = [_INDEX[name] for name in row.levels if name in _INDEX]
        if indices:
            achieved[row.student_id] = achieved.get(row.student_id, False) or min(indices) >= threshold
    if len(achieved) < k:
        return None
    met = sum(achieved.values())
    return {"students": len(achieved), "achieved": met, "pct": _pct(met, len(achieved)), "levelThreshold": level}


def _under_rules(rows, profile_rules):
    """Los intentos cuyo perfil se calculó con la regla VIGENTE: lo cerrado no se recalcula y mezclar reglas distintas
    daría una «mejora» sin significado (hallazgo I-3 de la revisión de E6)."""
    return [row for row in rows if row.profile_rules == profile_rules]


def _closed_under(rows, definition):
    """Los intentos v2 cuyo reporte se congeló con la definición de reflexión VIGENTE (lo cerrado no se recalcula)."""
    return [row for row in rows if row.reflection_definition == definition and row.reflection_covered is not None]


def _reflection(rows, k, definition):
    """RQ-NEG-003 · porcentaje de intentos con reflexión según la definición vigente."""
    population = _closed_under(rows, definition)
    if len({row.student_id for row in population}) < k:
        return None
    covered = sum(1 for row in population if row.reflection_covered)
    return {"definition": definition, "attempts": len(population), "covered": covered,
            "pct": _pct(covered, len(population))}


def _key_evidence(rows, k, definition):
    """RQ-NEG-004 · porcentaje de intentos que son evidencia clave de aprendizaje."""
    population = _closed_under(rows, definition)
    if len({row.student_id for row in population}) < k:
        return None
    key = sum(1 for row in population if row.key_evidence)
    return {"attempts": len(population), "keyEvidence": key, "pct": _pct(key, len(population))}


def _evaluated(rows):
    """RQ-NEG-005 · porcentaje de intentos con evaluación automática completa y con comentario del docente."""
    total = len(rows)
    if not total:
        return None
    system = sum(1 for row in rows if row.system_evaluated)
    commented = sum(1 for row in rows if row.teacher_commented)
    return {"attempts": total, "systemPct": _pct(system, total), "commentedPct": _pct(commented, total)}


def _satisfaction(rows, k):
    """RQ-NEG-004 · porcentaje de respuestas de la encuesta con 4 o 5 (solo si hay ``k`` estudiantes que respondieron)."""
    rated = [row for row in rows if row.rating is not None]
    if len({row.student_id for row in rated}) < k:
        return None
    satisfied = sum(1 for row in rated if row.rating >= SATISFIED_FROM)
    return {"responses": len(rated), "satisfiedPct": _pct(satisfied, len(rated))}


def _improvement_after_feedback(series, k):
    """RQ-NEG-005 · la mejora entre dos intentos consecutivos cuando la persona vio la retroalimentación del primero
    ANTES de que empezara el siguiente."""
    pairs = []
    for group in series:
        indexed = _indexed(group)
        for (before, pre), (after, post) in zip(indexed, indexed[1:]):
            if before.feedback_viewed_at is not None and before.feedback_viewed_at < after.started_at:
                pairs.append((before.student_id, pre, post))
    students = {student for student, _, _ in pairs}
    if len(students) < k:
        return None
    pre, post = _mean([p for _, p, _ in pairs]), _mean([q for _, _, q in pairs])
    return {"students": len(students), "pairs": len(pairs), "deltaPct": round_half_up((post - pre) * 100 / _SPAN, 1)}


def compute(rows, *, min_cell, acceptable_level, reflection_definition, profile_rules, survey_enabled):
    """La forma de C13 para estas filas: ``cohort``, los bloques que alcanzan la celda mínima y ``definitions``.

    Puro y determinista: el mismo conjunto de filas, en cualquier orden, da el mismo resultado. Los bloques que leen
    NIVELES (mejora, aceptable, mejora tras la retroalimentación) cuentan solo los intentos calculados con la regla
    ``profile_rules``; los que leen la reflexión, solo los cerrados con la ``reflection_definition`` vigente.
    """
    rows = list(rows)
    k = max(1, min_cell)  # el piso de privacidad lo pone ``definitions.min_cell_size``; aquí solo se evita dividir por cero
    level = FormativeLevel(acceptable_level).value
    students = {row.student_id for row in rows}
    suppressed = len(students) < k
    result = {"cohort": {"students": len(students), "attempts": len(rows), "suppressed": suppressed}}
    if not suppressed:
        series = _series(rows)
        current = _under_rules(rows, profile_rules)
        series_current = _series(current)
        blocks = {
            "improvement": _improvement(series_current, k),
            "firstVsSecond": _first_vs_second(series, k),
            "acceptable": _acceptable(current, k, level),
            "reflectionCoverage": _reflection(rows, k, reflection_definition),
            "keyEvidence": _key_evidence(rows, k, reflection_definition),
            "evaluated": _evaluated(rows),
            "satisfaction": _satisfaction(rows, k) if survey_enabled else None,
            "improvementAfterFeedback": _improvement_after_feedback(series_current, k),
        }
        result.update({name: block for name, block in blocks.items() if block is not None})
    result["definitions"] = {
        "status": DEFINITIONS_STATUS,
        "acceptableLevel": level,
        "minCell": k,
        "reflectionDefinition": reflection_definition,
        "profileRules": profile_rules,
    }
    return result


# ─── la lectura ───────────────────────────────────────────────────────────────────────────────
def _parse_report(raw, attempt_id):
    """El reporte congelado como diccionario, o ``None`` si no se puede leer (un reporte roto no tumba el agregado)."""
    try:
        report = json.loads(raw)
    except (TypeError, ValueError):
        report = None
    if not isinstance(report, dict):
        logger.warning("Reporte ilegible en la analítica de aprendizaje: intento %s", attempt_id)
        return None
    return report


def _v2_fields(report):
    """Lo que la analítica lee del reporte v2; cada clave se valida (un valor de otro tipo es «sin dato»)."""
    entries = report.get("competencyLevels")
    coverage = report.get("reflectionCoverage")
    coverage = coverage if isinstance(coverage, dict) else {}
    non_recommended = report.get("nonRecommendedCount")
    definition, covered, rules = coverage.get("definition"), coverage.get("covered"), report.get("profileRules")
    return {
        "levels": tuple(
            entry["level"] for entry in entries
            if isinstance(entry, dict) and isinstance(entry.get("level"), str) and entry["level"] in _INDEX
        ) if isinstance(entries, list) else (),
        "profile_rules": rules if isinstance(rules, str) else None,
        "non_recommended": non_recommended if type(non_recommended) is int else None,
        "reflection_definition": definition if isinstance(definition, str) else None,
        "reflection_covered": covered if isinstance(covered, bool) else None,
        "key_evidence": report.get("keyLearningEvidence") is True,
    }


def load_rows(student_ids, case_version_id=None):
    """Una fila por intento COMPLETADO del alcance, con cuatro consultas sin importar cuántos estudiantes haya.

    ``student_ids`` es el alcance de quien consulta (``None`` = todos los estudiantes, el ADMIN) y ``case_version_id``
    limita a una versión. Los intentos sin reporte (anteriores a E1-8 y sin relleno) entran con ``schema_version 0``.
    """
    attempts = SimulationAttempt.objects.filter(status=AttemptStatus.COMPLETED)
    if student_ids is not None:
        attempts = attempts.filter(student_id__in=student_ids)
    if case_version_id is not None:
        attempts = attempts.filter(case_version_id=case_version_id)

    base = list(attempts.values_list(
        "id", "student_id", "case_version__simulation_case_id", "started_at",
        "report__attempt_ordinal", "report__report_schema_version", "report__report_json",
    ))
    if not base:
        return []
    viewed = dict(
        AttemptEvent.objects.filter(attempt__in=attempts, event_type=FEEDBACK_VIEWED)
        .values_list("attempt_id", "occurred_at")
    )
    system_done, teacher_commented = set(), set()
    # El texto del comentario no sale de la base: solo si tiene algún carácter que no sea espacio.
    has_comment = Case(When(comment__regex=r"\S", then=Value(True)), default=Value(False), output_field=BooleanField())
    for attempt_id, origin, status, commented in (
        RubricEvaluation.objects.filter(attempt__in=attempts).annotate(has_comment=has_comment)
        .values_list("attempt_id", "origin", "status", "has_comment")
    ):
        if origin == EvaluationOrigin.SISTEMA and status == "EVALUATED":
            system_done.add(attempt_id)
        elif origin == EvaluationOrigin.DOCENTE and status == "EVALUATED" and commented:  # un borrador no es una evaluación
            teacher_commented.add(attempt_id)
    ratings = dict(AttemptFeedback.objects.filter(attempt__in=attempts).values_list("attempt_id", "rating"))

    rows = []
    for attempt_id, student_id, case_id, started_at, ordinal, version, raw in base:
        report = _parse_report(raw, attempt_id) if raw is not None else None
        version = version if report is not None else 0
        rows.append(AttemptRow(
            attempt_id=str(attempt_id),
            student_id=student_id,
            case_id=case_id,
            started_at=started_at,
            ordinal=ordinal,
            schema_version=version,
            system_evaluated=attempt_id in system_done,
            teacher_commented=attempt_id in teacher_commented,
            feedback_viewed_at=viewed.get(attempt_id),
            rating=ratings.get(attempt_id),
            **(_v2_fields(report) if version >= 2 else {}),
        ))
    return rows
