"""x-siep 2.1 · el requisito y la reacción de cada opción y el objetivo de cada escena."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('simulation', '0032_ai_suggested'),
    ]

    operations = [
        migrations.AddField(
            model_name='decisionoption',
            name='requires_json',
            field=models.TextField(db_default='{}', default='{}'),
        ),
        migrations.AddField(
            model_name='decisionoption',
            name='reaction_json',
            field=models.TextField(db_default='{}', default='{}'),
        ),
        migrations.AddField(
            model_name='simulationnode',
            name='goal',
            field=models.TextField(db_default='', default=''),
        ),
    ]
