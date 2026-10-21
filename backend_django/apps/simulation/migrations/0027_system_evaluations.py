"""E6-1c · La evaluación automática del sistema no tiene docente y es única por intento y rúbrica (RQ-NEG-005).

Al cerrar un intento el sistema crea su propia evaluación (``origin = SISTEMA``): no la hizo ningún docente, así que
``instructor_id`` admite NULL, un CHECK exige que sea nulo si y solo si el origen es el sistema, y un único parcial
impide que el cierre la cree dos veces para el mismo intento y la misma rúbrica. Lo existente es todo ``DOCENTE`` con
docente: cumple el CHECK sin tocar una fila.

Reversible aunque ya haya evaluaciones del sistema (M-4 de la revisión de E6): son DERIVADAS (las crea el cierre del
intento y las repone ``backfill_attempt_reports``) y no tienen docente, así que al revertir se borran —con sus criterios,
en cascada de la base— antes de devolver ``instructor_id`` a NOT NULL. Las evaluaciones del docente no se tocan.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def delete_system_evaluations(apps, schema_editor):
    """Reversa: sin esto, ``instructor_id`` NOT NULL no se puede restaurar con una sola fila del sistema."""
    apps.get_model('simulation', 'RubricEvaluation').objects.filter(origin='SISTEMA').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('simulation', '0026_audit_logs_append_only'),
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
        # Al FINAL a propósito: Django revierte en orden inverso, así que su reversa corre PRIMERO (antes de quitar los
        # constraints y de volver a NOT NULL). Hacia adelante no hace nada.
        migrations.RunPython(migrations.RunPython.noop, delete_system_evaluations),
    ]
