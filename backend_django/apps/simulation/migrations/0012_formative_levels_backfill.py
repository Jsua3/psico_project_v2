"""E1-9 (revisión de E1) · Las calificaciones anteriores a los niveles reciben el suyo.

0011 añadió ``criterion_scores.level`` vacío: una evaluación guardada antes de E1-9 con
``score`` 1.0–5.0 quedaba sin niveles y, con ``RUBRIC_NUMERIC_TOTAL`` apagada, sin ningún
resumen visible. Aquí se deriva el nivel de cada ``score`` con la misma regla que usa el
servicio al guardar con la escala heredada: ``round(1 + (score − 1) × 3 / 4)`` acotado a 1–4
(copiada aquí a propósito: una migración no importa código de la aplicación).
"""
from decimal import ROUND_HALF_UP, Decimal

from django.db import migrations

_LEVEL_BY_INDEX = {1: "EN_INICIO", 2: "EN_PROCESO", 3: "LOGRADO", 4: "DESTACADO"}


def level_for_score(score):
    """El nivel formativo que corresponde a un ``score`` heredado de 1.0–5.0."""
    value = Decimal("1") + (Decimal(score) - Decimal("1")) * Decimal("3") / Decimal("4")
    index = int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return _LEVEL_BY_INDEX[max(1, min(4, index))]


def backfill_levels(apps, schema_editor):
    CriterionScore = apps.get_model("simulation", "CriterionScore")
    for row in CriterionScore.objects.filter(level__isnull=True).iterator(chunk_size=500):
        CriterionScore.objects.filter(pk=row.pk).update(level=level_for_score(row.score))


class Migration(migrations.Migration):

    dependencies = [
        ("simulation", "0011_formative_levels"),
    ]

    operations = [
        migrations.RunPython(backfill_levels, migrations.RunPython.noop),
    ]
