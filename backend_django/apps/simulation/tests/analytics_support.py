"""Datos de prueba de la analítica de aprendizaje (E6): intentos COMPLETADOS con su reporte congelado v2, evaluaciones,
el evento «vio su retroalimentación» y la encuesta.

Lo comparten las pruebas de la lectura (``test_assessment_analytics_load``), del endpoint C13
(``apps/reportes/tests/test_analiticas``), del contrato OpenAPI y de la cohorte sintética: un solo lugar sabe cómo se
arma un intento cerrado sin jugarlo. Las filas se crean directo con el ORM (como las dejaría el cierre real).
"""
import json
import uuid
from datetime import datetime, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.simulation.assessment import definitions
from apps.simulation.models import (
    AttemptEvent,
    AttemptFeedback,
    AttemptReport,
    RubricEvaluation,
    SimulationAttempt,
    SimulationNode,
)

User = get_user_model()

#: Instante de referencia: los intentos de las pruebas empiezan días después de él.
T0 = datetime(2026, 10, 1, 9, 0, 0)
FEEDBACK_VIEWED_KEY = "sistema/retroalimentacion-vista"


def make_user(role, label="u"):
    return User.objects.create_user(
        email=f"an_{label}_{uuid.uuid4().hex[:8]}@x.com", password="x", nombre="N", apellido="A", role=role
    )


def make_student(label="e"):
    return make_user("ESTUDIANTE", label)


def v2_report(levels=("LOGRADO",), non_recommended=0, covered=True, key=True, definition="ANY"):
    """El reporte congelado v2 con solo lo que la analítica lee (un nivel por competencia, en el orden dado)."""
    return {
        "schemaVersion": 2,
        "competencyLevels": [
            {"code": f"C{i}", "name": f"Competencia {i}", "level": level, "basis": "DEFAULT"}
            for i, level in enumerate(levels)
        ],
        "profileRules": definitions.PROFILE_RULES,
        "nonRecommendedCount": non_recommended,
        "reflectionCoverage": {"definition": definition, "reflections": 1, "decisionScenes": 1, "covered": covered},
        "keyLearningEvidence": key,
    }


def completed_attempt(student, version, ordinal=1, *, report=None, schema_version=2, started_at=None, status="COMPLETED"):
    """Un intento con su reporte (un ``dict`` se guarda como JSON; un ``str``, tal cual; ``None``, sin reporte)."""
    node = (
        SimulationNode.objects.filter(case_version=version, start_node=True).first()
        or SimulationNode.objects.filter(start_node=True).first()
    )
    attempt = SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex, student=student, case_version=version, current_node=node, status=status,
        ended_at=timezone.now() if status == "COMPLETED" else None,
    )
    if started_at is not None:  # ``started_at`` es auto_now_add: solo se fija con un UPDATE
        SimulationAttempt.objects.filter(pk=attempt.pk).update(started_at=started_at)
    if report is not None:
        AttemptReport.objects.create(
            attempt=attempt, report_json=report if isinstance(report, str) else json.dumps(report),
            report_schema_version=schema_version, definition_hash="a" * 64, attempt_ordinal=ordinal,
        )
    return attempt


def add_viewed(attempt, at):
    """El evento ``FEEDBACK_VIEWED`` de ese intento, ocurrido en ``at``."""
    event = AttemptEvent.objects.create(attempt=attempt, event_type="FEEDBACK_VIEWED", request_id=FEEDBACK_VIEWED_KEY)
    AttemptEvent.objects.filter(pk=event.pk).update(occurred_at=at)


def add_evaluation(attempt, rubric, *, origin, teacher=None, status="EVALUATED", comment=None):
    return RubricEvaluation.objects.create(
        attempt=attempt, rubric=rubric, origin=origin, status=status, comment=comment,
        instructor=None if origin == "SISTEMA" else teacher,
    )


def add_rating(attempt, rating, comment=""):
    return AttemptFeedback.objects.create(attempt=attempt, rating=rating, comment=comment)


def seed_student_pair(student, version, rubric, teacher, *, first, second, rating=None, viewed_between=True, commented=True):
    """Dos intentos cerrados de un estudiante: el 2.º empieza dos días después del 1.º.

    ``first`` y ``second`` son dicts para ``v2_report``. Ambos tienen evaluación automática completa; el 1.º tiene la
    del docente con comentario (si ``commented``), el evento de retroalimentación vista una hora ANTES de que empiece el
    2.º (si ``viewed_between``) y, si ``rating``, una respuesta de la encuesta.
    """
    one = completed_attempt(student, version, 1, report=v2_report(**first), started_at=T0 + timedelta(days=1))
    two = completed_attempt(student, version, 2, report=v2_report(**second), started_at=T0 + timedelta(days=3))
    for attempt in (one, two):
        add_evaluation(attempt, rubric, origin="SISTEMA")
    if commented:
        add_evaluation(one, rubric, origin="DOCENTE", teacher=teacher, comment="Buen trabajo")
    if viewed_between:
        add_viewed(one, T0 + timedelta(days=3) - timedelta(hours=1))
    if rating is not None:
        add_rating(one, rating, comment="texto privado del estudiante")
    return one, two
