"""Bloque P3 · la sala armada por piezas (``SceneMap.structure``, contrato x-siep 2.2).

Depende de la ``0034`` porque la ``0035`` (C1, generación con IA) aún no está en ``master``. Si C1 entra antes, esta
dependencia pasa a ``0035_authoring_generations`` y nada más cambia: las dos solo agregan.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('simulation', '0035_authoring_generations'),
    ]

    operations = [
        migrations.AddField(
            model_name='scenemap',
            name='structure',
            field=models.JSONField(blank=True, default=None, null=True),
        ),
    ]
