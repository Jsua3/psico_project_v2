"""Modelo de respuesta · Contracción: se retiran las columnas y los CHECK del modelo antiguo de métricas.

Tercer paso de expandir, migrar, contraer (la ``0029`` expandió; la ``0030`` convirtió los datos). Nada del motor lee ya
estas columnas, así que aquí se quitan, en este orden:

1. **Datos**: toda opción que aún no tenga ``response_class`` la recibe de ``casedef.vocabulary.legacy_class`` con lo
   que decían sus columnas antiguas (``classification``, la severidad de sus ``effects`` y ``prohibited_conduct``). Es lo
   último que esas columnas hacen. Solo toca filas con la clase vacía, así que es idempotente.
2. ``decision_options.response_class`` pasa a ``NOT NULL`` (su CHECK se conserva).
3. Se quitan los CHECK ``ck_attempts_stress_range``, ``ck_attempts_victim_risk_range``,
   ``ck_attempts_user_trust_range`` y ``decision_options_classification_check``.
4. Se quitan las columnas: de ``simulation_attempts_v2`` ``accumulated_score``, ``stress_index``, ``victim_risk``,
   ``user_trust``, ``institutional_route_activated`` y ``revictimization_risk``; de ``attempt_events`` ``score_delta`` y
   ``stress_delta``; de ``decision_options`` ``classification``, ``score_delta``, ``stress_delta``,
   ``prohibited_penalty`` y ``prohibited_conduct``.

**No tiene reversa de datos.** Django sabe deshacer cada operación de esquema (devuelve las columnas con su valor por
defecto), pero lo que había en ellas no se puede reconstruir. Para que la reversa tampoco falle con filas en la tabla,
``classification`` (``NOT NULL`` y sin valor por defecto) recibe uno justo antes de quitarse (``ADEQUATE``, solo en el
estado de la migración: la base no cambia al avanzar); al retroceder, todas las opciones quedan con él. Para volver atrás
de verdad se restaura la copia de la base de datos que se toma antes de empezar el modelo de métricas.
"""
import json

from django.db import migrations, models

from apps.simulation.casedef.vocabulary import legacy_class

BATCH = 500


def _severity(text):
    """La severidad que dejó escrita el modelo antiguo en los ``effects`` de la opción, o ``None``."""
    try:
        raw = json.loads(text) if text else {}
    except (TypeError, ValueError):
        return None
    return raw.get("severity") if isinstance(raw, dict) else None


def fill_response_class(apps, schema_editor):
    """La clase de las opciones que no la tienen, con la tabla de ``legacy_class``."""
    DecisionOption = apps.get_model("simulation", "DecisionOption")
    ids_by_class = {}
    empty = DecisionOption.objects.filter(response_class__isnull=True)
    for option in empty.only("id", "classification", "prohibited_conduct", "effects").iterator(chunk_size=BATCH):
        response_class = legacy_class(option.classification, _severity(option.effects), option.prohibited_conduct)
        ids_by_class.setdefault(response_class.value, []).append(option.id)
    for value, ids in ids_by_class.items():
        for start in range(0, len(ids), BATCH):
            DecisionOption.objects.filter(id__in=ids[start:start + BATCH]).update(response_class=value)


class Migration(migrations.Migration):

    dependencies = [
        ("simulation", "0030_metrics_model_data"),
    ]

    operations = [
        migrations.RunPython(fill_response_class, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="decisionoption",
            name="response_class",
            field=models.CharField(max_length=24),
        ),
        migrations.RemoveConstraint(model_name="simulationattempt", name="ck_attempts_stress_range"),
        migrations.RemoveConstraint(model_name="simulationattempt", name="ck_attempts_victim_risk_range"),
        migrations.RemoveConstraint(model_name="simulationattempt", name="ck_attempts_user_trust_range"),
        migrations.RemoveConstraint(model_name="decisionoption", name="decision_options_classification_check"),
        migrations.RemoveField(model_name="simulationattempt", name="accumulated_score"),
        migrations.RemoveField(model_name="simulationattempt", name="stress_index"),
        migrations.RemoveField(model_name="simulationattempt", name="victim_risk"),
        migrations.RemoveField(model_name="simulationattempt", name="user_trust"),
        migrations.RemoveField(model_name="simulationattempt", name="institutional_route_activated"),
        migrations.RemoveField(model_name="simulationattempt", name="revictimization_risk"),
        migrations.RemoveField(model_name="attemptevent", name="score_delta"),
        migrations.RemoveField(model_name="attemptevent", name="stress_delta"),
        migrations.AlterField(
            model_name="decisionoption",
            name="classification",
            field=models.CharField(default="ADEQUATE", max_length=24),
        ),
        migrations.RemoveField(model_name="decisionoption", name="classification"),
        migrations.RemoveField(model_name="decisionoption", name="score_delta"),
        migrations.RemoveField(model_name="decisionoption", name="stress_delta"),
        migrations.RemoveField(model_name="decisionoption", name="prohibited_penalty"),
        migrations.RemoveField(model_name="decisionoption", name="prohibited_conduct"),
    ]
