"""E4-7 · Cuánto del original conserva un clon al publicarse (RQ-NEG-007, N13).

``reuse_ratio`` es una razón entre 0 y 1 con cuatro decimales que escribe la compuerta de publicación
(``authoring.gate``) cuando la versión es un clon; queda vacía en un original y en lo publicado antes de E4.
"""

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('simulation', '0024_case_version_seal'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='caseversion',
            name='reuse_ratio',
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=5, null=True),
        ),
        migrations.AddConstraint(
            model_name='caseversion',
            constraint=models.CheckConstraint(condition=models.Q(('reuse_ratio__isnull', True), models.Q(('reuse_ratio__gte', 0), ('reuse_ratio__lte', 1)), _connector='OR'), name='case_versions_reuse_ratio_check'),
        ),
    ]
