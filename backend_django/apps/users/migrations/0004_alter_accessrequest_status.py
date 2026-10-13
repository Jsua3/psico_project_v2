"""Alinea los choices de ``AccessRequest.status`` con el modelo (solo metadatos).

Descubierta por ``test_los_modelos_no_tienen_cambios_sin_migrar`` (E0-12): el
modelo usa ``TextChoices`` (etiquetas «Pending», «Reviewed», «Dismissed») y la
migración 0002 guardó las etiquetas en mayúsculas. No cambia el esquema: PostgreSQL
no ve ``choices``. E0-8 regenera todas las migraciones y retira este archivo.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_merge_0002_accessrequest_0002_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='accessrequest',
            name='status',
            field=models.CharField(choices=[('PENDING', 'Pending'), ('REVIEWED', 'Reviewed'), ('DISMISSED', 'Dismissed')], default='PENDING', max_length=20),
        ),
    ]
