from django.db import migrations

BATCH = 500


def copy_forward(apps, schema_editor):
    """Cada ``grupo_case_version`` pasa a ``case_assignments`` como asignación de grupo.

    ``sort_order = 0`` y ``active = true``: el orden de la secuencia (por caso y versión) y el
    acceso de hoy no cambian. ``assigned_at`` se conserva.
    """
    GrupoCaseVersion = apps.get_model("grupos", "GrupoCaseVersion")
    CaseAssignment = apps.get_model("grupos", "CaseAssignment")
    batch = []
    for row in GrupoCaseVersion.objects.all().iterator():
        batch.append(
            CaseAssignment(
                grupo_id=row.grupo_id,
                case_version_id=row.case_version_id,
                assigned_at=row.assigned_at,
                sort_order=0,
                active=True,
            )
        )
        if len(batch) >= BATCH:
            CaseAssignment.objects.bulk_create(batch, ignore_conflicts=True)
            batch = []
    if batch:
        CaseAssignment.objects.bulk_create(batch, ignore_conflicts=True)


def copy_backward(apps, schema_editor):
    """Revertir devuelve las asignaciones de GRUPO a ``grupo_case_version`` (las de estudiante,
    que la tabla vieja no puede guardar, se pierden: el destino estudiante no existía antes)."""
    GrupoCaseVersion = apps.get_model("grupos", "GrupoCaseVersion")
    CaseAssignment = apps.get_model("grupos", "CaseAssignment")
    rows = [
        GrupoCaseVersion(
            grupo_id=a.grupo_id, case_version_id=a.case_version_id, assigned_at=a.assigned_at
        )
        for a in CaseAssignment.objects.filter(grupo__isnull=False).iterator()
    ]
    GrupoCaseVersion.objects.bulk_create(rows, ignore_conflicts=True)


class Migration(migrations.Migration):
    """Copia de datos (migrate) de ``grupo_case_version`` a ``case_assignments`` (E3-1, R2)."""

    dependencies = [
        ('grupos', '0003_case_assignments'),
    ]

    operations = [
        migrations.RunPython(copy_forward, copy_backward),
    ]
