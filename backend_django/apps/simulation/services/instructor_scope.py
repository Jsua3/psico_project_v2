"""Alcance de un docente: los estudiantes de sus grupos activos.

Lo comparten la revisión de intentos (`instructor_service`), el reporte de un intento
(`game_service`) y los reportes de `apps.reportes`, para que todos limiten al profesor a
**sus** estudiantes (RF-25). Vive aparte para que ninguno de ellos dependa de otro.
"""
from django.db import connection


def student_ids_for_instructor(instructor):
    """Ids de los estudiantes de los grupos activos del profesor.

    Devuelve ``None`` para el ADMIN: sin restricción. Un usuario que no es profesor de
    ningún grupo obtiene una lista vacía.
    """
    if getattr(instructor, "role", None) == "ADMIN":
        return None
    with connection.cursor() as cur:
        cur.execute(
            "SELECT DISTINCT ge.estudiante_id "
            "FROM grupo_estudiante ge "
            "JOIN grupos g ON g.id = ge.grupo_id "
            "WHERE g.profesor_id = %s AND g.activo = TRUE",
            [instructor.id],
        )
        return [row[0] for row in cur.fetchall()]
