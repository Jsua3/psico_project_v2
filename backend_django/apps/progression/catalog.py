"""El catálogo de casos por actor, con su estado de acceso (E1-11, E3-2).

El estudiante ve solo los casos que tiene asignados por sus grupos activos o directamente
(RF-15, RN-04) y publicados; en el orden de su secuencia (``sort_order`` de la asignación, luego
caso y versión). Cada elemento trae ``access`` —la decisión de ``progression.access``— y
``unlocked``/``locked`` siguen diciendo si puede iniciarlo (la interfaz actual lee solo eso):
una ventana que aún no abre o ya cerró también deja el caso «bloqueado» para ella.

PROFESOR y ADMIN ven todo desbloqueado. El servidor aplica la misma decisión al iniciar un
intento (``access.access_decision``); ``is_case_unlocked`` queda como atajo de lectura.
"""
from apps.simulation.models import CaseVersion

from .access import access_map, is_staff, sequence_of


def _item(version, order, *, unlocked, completed, access):
    return {
        "caseVersionId": version.id,
        "code": version.simulation_case.code,
        "title": version.simulation_case.title,
        "description": version.simulation_case.description,
        "order": order,
        "unlocked": unlocked,
        "completed": completed,
        "locked": not unlocked,
        "access": access,
    }


def unlock_states(actor, now=None):
    """Los casos publicados del actor, en orden de secuencia, con su estado de acceso."""
    if is_staff(actor):
        versions = (
            CaseVersion.objects.filter(status="PUBLISHED", simulation_case__active=True)
            .select_related("simulation_case")
            .order_by("simulation_case_id", "id")
        )
        return [
            _item(v, order, unlocked=True, completed=False, access={"allowed": True})
            for order, v in enumerate(versions)
        ]
    return [
        _item(
            item.version, item.order, unlocked=item.decision.allowed,
            completed=item.completed, access=item.decision.as_dict(),
        )
        for item in sequence_of(actor, now)
    ]


def build_catalog(actor):
    """El catálogo del actor: ``unlock_states`` más cómo se presenta cada caso (BK-1, aditivo).

    ``portada`` (el fondo de la sala donde empieza, o nulo) y ``escenas`` (cuántas tiene) salen de
    ``case_brief.presentacion_de_versiones``, en las mismas tres consultas para todo el catálogo. Solo los suma el
    catálogo: ``is_case_unlocked`` sigue leyendo ``unlock_states`` sin ese costo.
    """
    from apps.simulation.services.case_brief import presentacion_de_versiones  # perezoso, como ``CasesView``

    items = unlock_states(actor)
    presentacion = presentacion_de_versiones([item["caseVersionId"] for item in items])
    for item in items:
        extra = presentacion[item["caseVersionId"]]
        item["portada"] = extra["portada"]
        item["escenas"] = extra["escenas"]
    return items


def is_case_unlocked(actor, case_version_id):
    """¿Puede este actor iniciar esa versión? (SIEP-RF-12 y la ventana de la asignación).

    Un caso que no está en su secuencia (no asignado, no publicado o dado de baja) no cuenta
    como desbloqueado: quien llama decide qué error corresponde a cada razón.
    """
    for item in unlock_states(actor):
        if item["caseVersionId"] == case_version_id:
            return item["unlocked"]
    return False


__all__ = ["access_map", "build_catalog", "is_case_unlocked", "unlock_states"]
