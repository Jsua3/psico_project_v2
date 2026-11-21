"""Bloque BK · temas sensibles de la ficha y fecha de la última edición de una versión (solo agrega).

- ``content_warnings``: lista JSON en texto con ``[]`` por defecto en la base (``db_default``), así las filas viejas y
  cualquier ``INSERT`` que no la nombre quedan con «sin temas declarados».
- ``updated_at``: nula. No se rellena: una fecha inventada diría «editado hace un momento» de casos que nadie tocó.

Ojo al juntar con el checkout principal: allí hay una ``0037_reporting_views.py`` sin seguimiento. Si entra, hará falta
una migración de mezcla (riesgo R15 de ``DISENO.md``); las dos solo agregan y no se pisan.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('simulation', '0036_scene_map_structure'),
    ]

    operations = [
        migrations.AddField(
            model_name='caseversion',
            name='content_warnings',
            field=models.TextField(db_default='[]', default='[]'),
        ),
        migrations.AddField(
            model_name='caseversion',
            name='updated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
