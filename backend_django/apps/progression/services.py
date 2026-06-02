"""Records case completions. Best-effort: must NEVER break gameplay."""
import logging

from django.db import IntegrityError
from django.utils import timezone

from .models import StudentCaseCompletion

logger = logging.getLogger(__name__)


def record_case_completion(student_id, simulation_case_id):
    """Mark a case completed for a student (idempotent, never raises)."""
    try:
        StudentCaseCompletion.objects.get_or_create(
            student_id=student_id,
            simulation_case_id=simulation_case_id,
            defaults={"first_completed_at": timezone.now()},
        )
    except IntegrityError:
        pass  # concurrent insert — already recorded
    except Exception as ex:  # pragma: no cover - must not break gameplay
        logger.warning(
            "record_case_completion failed (student=%s case=%s): %s",
            student_id, simulation_case_id, ex,
        )
