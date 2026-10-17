"""E4-4 · El sello de una versión publicada: cuándo se validó y la huella de su documento.

``validated_at`` y ``definition_hash`` (``sha256:`` + 64 hex) quedan vacíos en lo ya publicado hasta que
``manage.py seal_published_versions`` lo valida y lo sella; la restricción exige los dos o ninguno.
"""

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('simulation', '0023_link_rubric_competencies'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='caseversion',
            name='definition_hash',
            field=models.CharField(blank=True, max_length=71, null=True),
        ),
        migrations.AddField(
            model_name='caseversion',
            name='validated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddConstraint(
            model_name='caseversion',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('definition_hash__isnull', True), ('validated_at__isnull', True)), models.Q(('definition_hash__isnull', False), ('validated_at__isnull', False)), _connector='OR'), name='case_versions_seal_check'),
        ),
    ]
