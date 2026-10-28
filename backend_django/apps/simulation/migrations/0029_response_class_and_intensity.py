"""Modelo de respuesta · Expansión: la clase de cada respuesta y la intensidad de cada escena.

Dos columnas nuevas, sin tocar ninguna existente (expandir, migrar, contraer):

- ``decision_options.response_class``: ``RECOMMENDED`` | ``ACCEPTABLE`` | ``RISKY`` | ``CONTRAINDICATED``; nula
  mientras la opción no la declara (la rellena la ``0030``), con un CHECK que solo admite nulo o una clase.
- ``simulation_nodes.intensity``: ``LOW`` | ``MEDIUM`` | ``HIGH``, ``MEDIUM`` por defecto (también en la base,
  ``db_default``), con un CHECK sobre los tres valores.

Las columnas viejas (``classification``, ``score_delta``, ``stress_delta``, ``prohibited_penalty``) siguen donde están:
se retiran en la fase de contracción.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('simulation', '0028_attempt_feedback'),
    ]

    operations = [
        migrations.AddField(
            model_name='decisionoption',
            name='response_class',
            field=models.CharField(blank=True, max_length=24, null=True),
        ),
        migrations.AddField(
            model_name='simulationnode',
            name='intensity',
            field=models.CharField(db_default='MEDIUM', default='MEDIUM', max_length=8),
        ),
        migrations.AddConstraint(
            model_name='decisionoption',
            constraint=models.CheckConstraint(condition=models.Q(('response_class__isnull', True), ('response_class__in', ['RECOMMENDED', 'ACCEPTABLE', 'RISKY', 'CONTRAINDICATED']), _connector='OR'), name='decision_options_response_class_check'),
        ),
        migrations.AddConstraint(
            model_name='simulationnode',
            constraint=models.CheckConstraint(condition=models.Q(('intensity__in', ['LOW', 'MEDIUM', 'HIGH'])), name='simulation_nodes_intensity_check'),
        ),
    ]
