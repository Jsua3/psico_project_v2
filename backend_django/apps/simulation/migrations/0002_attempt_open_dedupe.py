"""E1-1 · Antes del índice único parcial: un solo intento abierto por estudiante y caso.

Una base que ya tiene dos intentos ``IN_PROGRESS``/``PAUSED`` del mismo estudiante y
caso (la política anterior los permitía por carrera) no admite el índice único de la
migración siguiente. Aquí se deja el más reciente de cada par y se cierran los demás
como ``REPLACED``, igual que lo haría un reemplazo. Es una migración de datos aparte
de la de restricciones: cada una corre en su propia transacción.
"""
from django.db import migrations
from django.utils import timezone

OPEN_STATUSES = ("IN_PROGRESS", "PAUSED")


def superseded_attempt_ids(rows):
    """Ids a reemplazar: de cada (estudiante, caso) todos los abiertos salvo el más reciente.

    ``rows`` son tuplas ``(id, student_id, case_version_id, started_at)``; el desempate
    por id mantiene estable el resultado cuando dos intentos comparten ``started_at``.
    """
    newest = {}
    for attempt_id, student_id, case_version_id, started_at in rows:
        key = (student_id, case_version_id)
        candidate = (started_at, str(attempt_id), attempt_id)
        if key not in newest or candidate[:2] > newest[key][:2]:
            newest[key] = candidate
    keep = {value[2] for value in newest.values()}
    return [row[0] for row in rows if row[0] not in keep]


def dedupe_open_attempts(apps, schema_editor):
    Attempt = apps.get_model("simulation", "SimulationAttempt")
    Reflection = apps.get_model("simulation", "ReflectionJournal")
    rows = list(
        Attempt.objects.filter(status__in=OPEN_STATUSES).values_list(
            "id", "student_id", "case_version_id", "started_at"
        )
    )
    ids = superseded_attempt_ids(rows)
    if not ids:
        return
    now = timezone.now()
    Attempt.objects.filter(pk__in=ids).update(status="REPLACED", ended_at=now, locked_at=now)
    Reflection.objects.filter(attempt_id__in=ids).update(locked=True)


class Migration(migrations.Migration):

    dependencies = [
        ("simulation", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(dedupe_open_attempts, migrations.RunPython.noop),
    ]
