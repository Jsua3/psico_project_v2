import django.db.models.deletion
import django.db.models.functions.datetime
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """``case_assignments`` (E3-1, C7): asignación de un caso a un grupo o a un estudiante.

    Solo crea la tabla nueva (expand). La copia de ``grupo_case_version`` va en ``0004`` y su
    retiro en ``0005``.
    """

    dependencies = [
        ('grupos', '0002_membership_status'),
        ('simulation', '0014_case_version_last_editor'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CaseAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('opens_at', models.DateTimeField(blank=True, null=True)),
                ('closes_at', models.DateTimeField(blank=True, null=True)),
                ('sort_order', models.IntegerField(db_default=0, default=0)),
                ('assigned_at', models.DateTimeField(db_default=django.db.models.functions.datetime.Now(), null=True)),
                ('active', models.BooleanField(db_default=True, default=True)),
                ('assigned_by', models.ForeignKey(blank=True, db_column='assigned_by', null=True, on_delete=django.db.models.deletion.DB_SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('case_version', models.ForeignKey(db_column='case_version_id', on_delete=django.db.models.deletion.DB_CASCADE, related_name='assignments', to='simulation.caseversion')),
                ('estudiante', models.ForeignKey(blank=True, db_column='estudiante_id', null=True, on_delete=django.db.models.deletion.DB_CASCADE, related_name='direct_assignments', to=settings.AUTH_USER_MODEL)),
                ('grupo', models.ForeignKey(blank=True, db_column='grupo_id', null=True, on_delete=django.db.models.deletion.DB_CASCADE, related_name='assignments', to='grupos.grupo')),
            ],
            options={
                'db_table': 'case_assignments',
            },
        ),
        migrations.AddIndex(
            model_name='caseassignment',
            index=models.Index(fields=['grupo', 'active'], name='idx_case_assign_group'),
        ),
        migrations.AddIndex(
            model_name='caseassignment',
            index=models.Index(fields=['estudiante', 'active'], name='idx_case_assign_student'),
        ),
        migrations.AddIndex(
            model_name='caseassignment',
            index=models.Index(fields=['case_version'], name='idx_case_assign_version'),
        ),
        migrations.AddConstraint(
            model_name='caseassignment',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('estudiante__isnull', True), ('grupo__isnull', False)), models.Q(('estudiante__isnull', False), ('grupo__isnull', True)), _connector='OR'), name='case_assignments_target_check'),
        ),
        migrations.AddConstraint(
            model_name='caseassignment',
            constraint=models.CheckConstraint(condition=models.Q(('opens_at__isnull', True), ('closes_at__isnull', True), ('closes_at__gt', models.F('opens_at')), _connector='OR'), name='case_assignments_window_check'),
        ),
        migrations.AddConstraint(
            model_name='caseassignment',
            constraint=models.UniqueConstraint(condition=models.Q(('grupo__isnull', False)), fields=('grupo', 'case_version'), name='uq_case_assignments_group_version'),
        ),
        migrations.AddConstraint(
            model_name='caseassignment',
            constraint=models.UniqueConstraint(condition=models.Q(('estudiante__isnull', False)), fields=('estudiante', 'case_version'), name='uq_case_assignments_student_version'),
        ),
    ]
