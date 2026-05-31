"""Mirrors Spring InstructorSimulationService 1:1 (application/InstructorSimulationService.java).

Instructor review of student attempts: recent list, full trace (timeline +
DECRYPTED reflections for authorized review + rubric summaries, with anonymized
student alias), and rubric evaluation read/save.
"""
import json

from django.db import transaction
from rest_framework.exceptions import NotFound

from apps.simulation.serializers import game_dtos as dto

from ..models import (
    AttemptEvent,
    CriterionScore,
    ReflectionJournal,
    Rubric,
    RubricCriterion,
    RubricEvaluation,
    SimulationAttempt,
)
from . import crypto_service, world_service


def _dt(value):
    return value.isoformat() if value else None


def _anonymize(attempt):
    return f"Estudiante-{attempt.student_id if attempt.student_id is not None else 0}"


def _read_map(raw):
    if not raw or not str(raw).strip():
        return {}
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}
    except (ValueError, TypeError):
        return {}


def _require_attempt(attempt_id):
    attempt = (
        SimulationAttempt.objects.filter(pk=attempt_id)
        .select_related("case_version__simulation_case", "current_node", "student")
        .first()
    )
    if not attempt:
        raise NotFound("Intento no encontrado")
    return attempt


def recent_attempts():
    attempts = (
        SimulationAttempt.objects.select_related("case_version__simulation_case", "student")
        .order_by("-started_at")[:20]
    )
    return [
        {
            "attemptId": str(a.id),
            "studentAlias": _anonymize(a),
            "caseTitle": a.case_version.simulation_case.title,
            "status": a.status,
            "accumulatedScore": a.accumulated_score,
            "stressIndex": a.stress_index,
            "startedAt": _dt(a.started_at),
        }
        for a in attempts
    ]


@transaction.atomic
def trace(attempt_id):
    attempt = _require_attempt(attempt_id)
    events = list(
        AttemptEvent.objects.filter(attempt_id=attempt_id)
        .select_related("node", "decision_option")
        .order_by("occurred_at", "id")
    )
    report = dto.build_completion_report(attempt, events)
    return {
        "attemptId": str(attempt.id),
        "studentAlias": _anonymize(attempt),
        "caseTitle": attempt.case_version.simulation_case.title,
        "status": attempt.status,
        "accumulatedScore": attempt.accumulated_score,
        "stressIndex": attempt.stress_index,
        "metrics": dto.metrics(attempt),
        "startedAt": _dt(attempt.started_at),
        "endedAt": _dt(attempt.ended_at),
        "adequateDecisions": report["adequateDecisions"],
        "riskyDecisions": report["riskyDecisions"],
        "inadequateDecisions": report["inadequateDecisions"],
        "prohibitedDecisions": report["prohibitedDecisions"],
        "safeExitUsed": report["safeExitUsed"],
        "events": [_to_trace_event(e) for e in events],
        "world": world_service.world_for_attempt(attempt),
        "reflections": [
            {
                "nodeId": r.node_id,
                "nodeTitle": r.node.title,
                "text": crypto_service.decrypt(r.encrypted_text),
                "locked": r.locked,
            }
            for r in ReflectionJournal.objects.filter(attempt_id=attempt_id).select_related("node")
        ],
        "rubricEvaluations": [
            {
                "id": ev.id,
                "rubricName": ev.rubric.name,
                "totalScore": float(ev.total_score),
                "comment": ev.comment,
                "evaluatedAt": _dt(ev.evaluated_at),
            }
            for ev in RubricEvaluation.objects.filter(attempt_id=attempt_id)
            .select_related("rubric")
            .order_by("-evaluated_at")
        ],
    }


def rubric(attempt_id):
    attempt = _require_attempt(attempt_id)
    rubric_obj = (
        Rubric.objects.filter(case_version_id=attempt.case_version_id, active=True)
        .order_by("id")
        .first()
    )
    if not rubric_obj:
        raise NotFound("Rubrica no encontrada")
    return _rubric_view(rubric_obj, [], None, None)


@transaction.atomic
def save_rubric(attempt_id, request, instructor):
    attempt = _require_attempt(attempt_id)
    rubric_obj = Rubric.objects.filter(pk=request.get("rubricId")).first()
    if not rubric_obj:
        raise NotFound("Rubrica no encontrada")

    evaluation = RubricEvaluation.objects.filter(
        attempt_id=attempt_id, rubric_id=rubric_obj.id, instructor_id=instructor.id
    ).first()
    if not evaluation:
        evaluation = RubricEvaluation()
    evaluation.attempt = attempt
    evaluation.rubric = rubric_obj
    evaluation.instructor = instructor
    evaluation.comment = request.get("comment")

    scores_input = request.get("scores") or []
    total = sum(float(s.get("score") or 0) for s in scores_input)
    evaluation.total_score = total
    evaluation.save()

    CriterionScore.objects.filter(rubric_evaluation_id=evaluation.id).delete()
    for s in scores_input:
        criterion = RubricCriterion.objects.filter(pk=s.get("criterionId")).first()
        if not criterion:
            raise NotFound("Criterio no encontrado")
        CriterionScore.objects.create(
            rubric_evaluation=evaluation,
            rubric_criterion=criterion,
            score=float(s.get("score") or 0),
            comment=s.get("comment"),
            evidence_json="{}",
        )

    scores = list(
        CriterionScore.objects.filter(rubric_evaluation_id=evaluation.id)
        .select_related("rubric_criterion")
        .order_by("id")
    )
    return _rubric_view(rubric_obj, scores, total, evaluation.comment)


# ─── DTO builders ─────────────────────────────────────────────────────────────
def _to_trace_event(event):
    classification = event.decision_option.classification if event.decision_option_id else None
    return {
        "type": event.event_type,
        "classification": classification,
        "nodeTitle": event.node.title if event.node_id else None,
        "decisionText": event.decision_option.text if event.decision_option_id else None,
        "scoreDelta": event.score_delta,
        "stressDelta": event.stress_delta,
        "detail": event.detail,
        "occurredAt": _dt(event.occurred_at),
    }


def _criterion_view(criterion):
    return {
        "id": criterion.id,
        "competency": criterion.competency,
        "title": criterion.title,
        "description": criterion.description,
        "maxScore": criterion.max_score,
        "displayOrder": criterion.display_order,
    }


def _score_view(score):
    return {
        "criterionId": score.rubric_criterion_id,
        "score": float(score.score),
        "comment": score.comment,
        "evidence": _read_map(score.evidence_json),
    }


def _rubric_view(rubric_obj, scores, total_score, comment):
    return {
        "rubricId": rubric_obj.id,
        "rubricName": rubric_obj.name,
        "description": rubric_obj.description,
        "criteria": [
            _criterion_view(c)
            for c in RubricCriterion.objects.filter(rubric_id=rubric_obj.id).order_by("display_order")
        ],
        "scores": [_score_view(s) for s in scores],
        "totalScore": total_score,
        "comment": comment,
    }
