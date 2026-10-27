"""Asistente de IA de autoría (P5) · Expansión: el consumo diario del asistente, una fila por persona y día."""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('simulation', '0031_drop_legacy_metrics'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AuthoringAssistantUsage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('day', models.DateField()),
                ('count', models.PositiveIntegerField(default=0)),
                ('user', models.ForeignKey(db_column='user_id', on_delete=django.db.models.deletion.CASCADE, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'authoring_assistant_usage',
                'constraints': [models.UniqueConstraint(fields=('user', 'day'), name='uq_authoring_assistant_usage_user_day')],
            },
        ),
        migrations.AddField(
            model_name='simulationnode',
            name='ai_suggested',
            field=models.BooleanField(db_default=False, default=False),
        ),
        migrations.AddField(
            model_name='decisionoption',
            name='ai_suggested',
            field=models.BooleanField(db_default=False, default=False),
        ),
        migrations.AddField(
            model_name='mapobject',
            name='ai_suggested',
            field=models.BooleanField(db_default=False, default=False),
        ),
        migrations.AddField(
            model_name='dialogueline',
            name='ai_suggested',
            field=models.BooleanField(db_default=False, default=False),
        ),
    ]
