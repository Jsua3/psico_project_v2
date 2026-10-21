"""La evaluación automática del sistema (E6-1e, RQ-NEG-005, RF-22; R6 de la fase).

Al cerrar un intento el sistema crea SU evaluación (``origin = SISTEMA``, sin docente): un nivel por criterio de la rúbrica
del caso, el de la competencia a la que el criterio apunta, tomado del perfil que el reporte congelado ya guardó (no se
recalcula: lo cerrado no cambia). Es única por intento y rúbrica (índice único parcial), la crea ``freeze_report`` en la
misma transacción que cierra el intento —así el relleno de reportes viejos también la crea— y es idempotente.

No toca la rúbrica: los pesos se leen tal cual (una rúbrica sellada no se reescribe al evaluar) y el total es la media
ponderada del índice interno 1–4, que nunca se muestra como nota (RN-09). El docente no la ve en su formulario ni en su
lista de evaluaciones: la traza la trae aparte (``systemEvaluation``).
"""
from decimal import ROUND_HALF_UP, Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.simulation.models import (
    LEVEL_INDEX,
    CriterionScore,
    EvaluationOrigin,
    FormativeLevel,
    RubricEvaluation,
)
from apps.simulation.services import rubric_service

from . import competencies

#: Comentario de toda evaluación del sistema. BORRADOR: texto nuevo del servidor, pendiente de la aprobación de
#: Psicología (VD-23).
SYSTEM_COMMENT = (
    "Evaluación automática del sistema a partir de las decisiones del intento "
    "(borrador, pendiente de la confirmación de Psicología)."
)


def system_evaluation_of(attempt_id, rubric_id):
    """La evaluación del sistema de ese intento con esa rúbrica, o ``None``."""
    return RubricEvaluation.objects.filter(
        attempt_id=attempt_id, rubric_id=rubric_id, origin=EvaluationOrigin.SISTEMA
    ).first()


def _weighted_total(scored, criteria):
    """Media ponderada del índice de los criterios con nivel, sobre el peso de TODOS los criterios activos."""
    weights = {criterion.id: rubric_service.criterion_weight(criterion) for criterion in criteria}
    total_weight = sum(weights.values(), Decimal("0"))
    if total_weight <= 0:  # una rúbrica sin ponderaciones: todos los criterios pesan igual
        weights = {criterion.id: Decimal("1") for criterion in criteria}
        total_weight = Decimal(len(criteria))
    weighted = sum(
        (Decimal(LEVEL_INDEX[FormativeLevel(level)]) * weights[criterion.id] for criterion, level in scored),
        Decimal("0"),
    )
    return (weighted / total_weight).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def record_system_evaluation(attempt, report):
    """Crea (una vez) la evaluación del sistema del intento a partir de su reporte; devuelve la fila o ``None``.

    ``None`` si el reporte no trae perfil por competencia (un caso sin rúbrica, o un reporte v1) o si el caso no
    tiene rúbrica: sin criterios no hay qué evaluar. ``EVALUATED`` si todos los criterios activos reciben nivel;
    ``PENDING`` si alguna competencia quedó sin evidencia (su criterio no puntúa).
    """
    levels = {
        entry["code"]: entry["level"]
        for entry in report.get("competencyLevels") or []
        if entry.get("level") is not None
    }
    if not levels:
        return None
    rubric = competencies.rubric_of(attempt.case_version_id)
    if rubric is None:
        return None
    existing = system_evaluation_of(attempt.id, rubric.id)
    if existing is not None:
        return existing

    criteria = competencies.active_criteria(rubric)
    scored = [
        (criterion, levels[code]) for criterion in criteria
        if (code := competencies.competency_code_of(criterion)) in levels
    ]
    now = timezone.now()
    try:
        with transaction.atomic():  # punto de guardado: un duplicado simultáneo no aborta la transacción del cierre
            evaluation = RubricEvaluation.objects.create(
                attempt=attempt,
                rubric=rubric,
                instructor=None,
                origin=EvaluationOrigin.SISTEMA,
                total_score=_weighted_total(scored, criteria),
                comment=SYSTEM_COMMENT,
                status="EVALUATED" if len(scored) == len(criteria) else "PENDING",
                snapshot_json=rubric_service.rubric_snapshot(rubric, criteria),
                created_at=now,
                updated_at=now,
            )
            CriterionScore.objects.bulk_create([
                CriterionScore(
                    rubric_evaluation=evaluation, rubric_criterion=criterion,
                    score=Decimal(LEVEL_INDEX[FormativeLevel(level)]), level=level, comment="", evidence_json="{}",
                )
                for criterion, level in scored
            ])
    except IntegrityError:
        existing = system_evaluation_of(attempt.id, rubric.id)
        if existing is None:
            raise
        return existing
    return evaluation
