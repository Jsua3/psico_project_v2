"""E6-3 · La encuesta breve opcional de un intento completado (RQ-NEG-004; contrato C14).

``attempt_feedback`` guarda, como mucho una vez por intento, la calificación (1 a 5, con un CHECK) y el comentario
opcional del estudiante. Solo la usa la encuesta, que está apagada hasta que Psicología la apruebe; la tabla es nueva y
no toca ninguna fila existente.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('simulation', '0027_system_evaluations'),
    ]

    operations = [
        migrations.CreateModel(
            name='AttemptFeedback',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rating', models.SmallIntegerField()),
                ('comment', models.TextField(db_default='', default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('attempt', models.OneToOneField(db_column='attempt_id', on_delete=django.db.models.deletion.DB_CASCADE, related_name='survey_response', to='simulation.simulationattempt')),
            ],
            options={
                'db_table': 'attempt_feedback',
                'constraints': [models.CheckConstraint(condition=models.Q(('rating__gte', 1), ('rating__lte', 5)), name='attempt_feedback_rating_check')],
            },
        ),
    ]
