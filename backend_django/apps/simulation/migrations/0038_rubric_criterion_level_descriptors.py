"""Bloque R0 · RK-2: descriptores por nivel en cada criterio de una rúbrica (solo agrega).

``level_descriptors_json`` es texto con JSON y ``{}`` por defecto en la base (``db_default``): las filas de antes y
cualquier ``INSERT`` que no la nombre quedan «sin descriptores propios», que se leen con los descriptores generales del
nivel. Revertir quita la columna y la rúbrica vuelve a ser la escala de hoy, sin pérdida de nada más.

Depende de la ``0037`` del bloque BK (temas sensibles de la ficha). Ojo al juntar con el checkout principal: allí hay una
``0037_reporting_views.py`` sin seguimiento; si entra, hará falta una migración de mezcla (riesgo R15 de ``DISENO.md``).
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('simulation', '0037_case_version_content_warnings'),
    ]

    operations = [
        migrations.AddField(
            model_name='rubriccriterion',
            name='level_descriptors_json',
            field=models.TextField(db_default='{}', default='{}'),
        ),
    ]
