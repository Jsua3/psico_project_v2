"""E1-5 · Rellena el acumulador de tiempo activo de los intentos que ya existen.

El cálculo es el de antes de E1-5 (``attempt_duration.active_duration_seconds``):
suma los intervalos entre marcas consecutivas (inicio, eventos, fin), acota cada una a
300 s y descarta el que sigue a una salida segura. Va copiado aquí a propósito: una
migración no importa código de la aplicación, que puede cambiar después. Para un
intento sin terminar, el «fin» es su última marca.
"""
from django.db import migrations

IDLE_CAP_SECONDS = 300
PAUSE_EVENT = "SAFE_EXIT_REQUESTED"


def compute_active_seconds(started_at, end_at, marks, idle_cap=IDLE_CAP_SECONDS):
    """Segundos activos (con fracción) de ``started_at`` a ``end_at`` según las marcas."""
    sequence = [("START", started_at), *marks, ("END", end_at)]
    total = 0.0
    for (previous_type, previous_at), (_, current_at) in zip(sequence, sequence[1:]):
        if previous_type == PAUSE_EVENT:
            continue
        gap = (current_at - previous_at).total_seconds()
        if gap > 0:
            total += min(gap, idle_cap)
    return total


def backfill_active_time(apps, schema_editor):
    Attempt = apps.get_model("simulation", "SimulationAttempt")
    Event = apps.get_model("simulation", "AttemptEvent")
    for attempt in Attempt.objects.all().iterator(chunk_size=500):
        marks = list(
            Event.objects.filter(attempt_id=attempt.id)
            .order_by("occurred_at", "id")
            .values_list("event_type", "occurred_at")
        )
        last_mark = marks[-1][1] if marks else attempt.started_at
        end_at = attempt.ended_at or last_mark
        attempt.active_seconds = compute_active_seconds(attempt.started_at, end_at, marks)
        attempt.last_activity_at = end_at
        attempt.save(update_fields=["active_seconds", "last_activity_at"])


class Migration(migrations.Migration):

    dependencies = [
        ("simulation", "0006_attempt_active_time"),
    ]

    operations = [
        migrations.RunPython(backfill_active_time, migrations.RunPython.noop),
    ]
