from django.db import migrations


class Migration(migrations.Migration):
    """Retira ``grupo_case_version`` (contract): ya vive en ``case_assignments`` (E3-1, R2)."""

    dependencies = [
        ('grupos', '0004_copy_group_case_versions'),
    ]

    operations = [
        migrations.DeleteModel(
            name='GrupoCaseVersion',
        ),
    ]
