import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """Quién editó por última vez cada versión del caso (R15 de la revisión de fase de E2).

    Aditiva y sin reescritura: una columna que admite NULL y otra con valor por defecto en la
    base. La revisión (``case_versions.version``) ya existía.
    """

    dependencies = [
        ('simulation', '0013_case_reviews'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='caseversion',
            name='last_edited_by',
            field=models.ForeignKey(blank=True, db_column='last_edited_by', null=True, on_delete=django.db.models.deletion.DB_SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='caseversion',
            name='edited_alone_since',
            field=models.BigIntegerField(db_default=0, default=0),
        ),
    ]
