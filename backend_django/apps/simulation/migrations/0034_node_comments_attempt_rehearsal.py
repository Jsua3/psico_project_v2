"""Bloque A2 · los comentarios de cada escena y la marca de ensayo del intento."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('simulation', '0033_option_requires_reaction_node_goal'),
    ]

    operations = [
        migrations.AddField(
            model_name='simulationnode',
            name='comments_json',
            field=models.TextField(db_default='[]', default='[]'),
        ),
        migrations.AddField(
            model_name='simulationattempt',
            name='is_rehearsal',
            field=models.BooleanField(db_default=False, default=False),
        ),
        migrations.RemoveConstraint(
            model_name='simulationattempt',
            name='uq_attempts_open_per_student_case',
        ),
        migrations.AddConstraint(
            model_name='simulationattempt',
            constraint=models.UniqueConstraint(condition=models.Q(('is_rehearsal', False), ('status__in', ('IN_PROGRESS', 'PAUSED'))), fields=('student', 'case_version'), name='uq_attempts_open_per_student_case'),
        ),
        migrations.AddConstraint(
            model_name='simulationattempt',
            constraint=models.UniqueConstraint(condition=models.Q(('is_rehearsal', True), ('status__in', ('IN_PROGRESS', 'PAUSED'))), fields=('student', 'case_version'), name='uq_rehearsal_open_per_author_case'),
        ),
    ]
