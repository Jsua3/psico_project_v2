"""Asignación de casos a estudiantes por sus grupos (RN-04, RF-15).

Un estudiante accede a una versión de caso si es miembro de un grupo **activo** al que
se le asignó esa versión. Es la política de acceso provisional de E1: E2-10 le añade la
membresía ``ACTIVE`` y E3 las ventanas de apertura y cierre (``access_decision``).
Vive en ``grupos`` —de quien son ambas tablas de unión— para que el simulador y la
progresión lo usen sin depender el uno del otro.
"""
from django.db.models import Exists

from .models import GrupoCaseVersion


def assigned_case_version_ids(student_id):
    """Versiones de caso asignadas al estudiante por sus grupos activos (RN-04)."""
    return list(
        GrupoCaseVersion.objects.filter(
            grupo__activo=True, grupo__grupoestudiante__estudiante_id=student_id
        )
        .values_list("case_version_id", flat=True)
        .distinct()
    )


def student_has_assignment(student_id, case_version_id):
    """¿El estudiante tiene esa versión asignada por un grupo activo suyo?"""
    return GrupoCaseVersion.objects.filter(
        case_version_id=case_version_id,
        grupo__activo=True,
        grupo__grupoestudiante__estudiante_id=student_id,
    ).exists()


def assignment_exists(student_ref, case_version_ref):
    """``Exists`` para anotar una consulta con la misma regla sin una consulta aparte.

    ``student_ref`` y ``case_version_ref`` son ``OuterRef`` (o valores) del estudiante y de la
    versión: así revalidar el acceso al cargar un intento no añade un viaje a la base.
    """
    return Exists(
        GrupoCaseVersion.objects.filter(
            case_version_id=case_version_ref,
            grupo__activo=True,
            grupo__grupoestudiante__estudiante_id=student_ref,
        )
    )
