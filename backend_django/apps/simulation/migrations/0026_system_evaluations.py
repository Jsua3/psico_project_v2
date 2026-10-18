"""E6-1c · La evaluación automática del sistema no tiene docente y es única por intento y rúbrica (RQ-NEG-005).

Al cerrar un intento el sistema crea su propia evaluación (``origin = SISTEMA``): no la hizo ningún docente, así que
``instructor_id`` admite NULL, un CHECK exige que sea nulo si y solo si el origen es el sistema, y un único parcial
impide que el cierre la cree dos veces para el mismo intento y la misma rúbrica. Lo existente es todo ``DOCENTE`` con
docente: cumple el CHECK sin tocar una fila.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('simulation', '0025_case_version_reuse_ratio'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='rubricevaluation',
            name='instructor',
            field=models.ForeignKey(blank=True, db_column='instructor_id', null=True, on_delete=django.db.models.deletion.DO_NOTHING, to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddConstraint(
            model_name='rubricevaluation',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('instructor__isnull', True), ('origin', 'SISTEMA')), models.Q(('instructor__isnull', False), ('origin', 'DOCENTE')), _connector='OR'), name='rubric_evaluations_origin_instructor_check'),
        ),
        migrations.AddConstraint(
            model_name='rubricevaluation',
            constraint=models.UniqueConstraint(condition=models.Q(('origin', 'SISTEMA')), fields=('attempt', 'rubric'), name='uq_rubric_evaluations_system_attempt_rubric'),
        ),
    ]
