"""La ficha del caso (C8, RF-16, CU-07): lo que el estudiante lee **antes** de jugar.

No crea intento. Trae el contexto, los personajes que Psicología marcó para la ficha
(``show_in_brief``) y los objetivos de aprendizaje, más la decisión de acceso del estudiante
(la misma que consultan el catálogo y el inicio). Un estudiante sin el caso asignado no recibe
nada del caso (R8, Review Focus 7): un 403 ``ACCESS_NOT_ASSIGNED`` sin título ni contexto.
"""
from rest_framework import status
from rest_framework.exceptions import NotFound

from apps.simulation.models import CaseCharacter, CaseVersion, SimulationNode
from shared import policies
from shared.exceptions import ApiError
from shared.jsonutils import read_string_list


def _is_staff(actor):
    return getattr(actor, "role", None) in ("PROFESOR", "ADMIN")


def _readable_version(actor, case_version_id):
    """La versión cuya ficha ``actor`` puede leer; 404 si no existe o no es suya para ver.

    A un estudiante solo se le sirve lo publicado y activo. El personal ve lo publicado y, de lo
    que no lo está, lo que puede autorar (su borrador; el ADMIN, todo).
    """
    version = (
        CaseVersion.objects.select_related("simulation_case").filter(pk=case_version_id).first()
    )
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    not_found = NotFound("Caso no encontrado")
    if version is None:
        raise not_found
    published = version.status == "PUBLISHED"
    if _is_staff(actor):
        owner_id = version.simulation_case.created_by_id
        if published or policies.can(actor, "case", "author", owner_id=owner_id):
            return version
        raise not_found
    if published and version.simulation_case.active:
        return version
    raise not_found


def brief_for(actor, case_version_id):
    """La ficha C8 de la versión para ``actor`` (404 / 403 ``ACCESS_NOT_ASSIGNED`` / la ficha)."""
    # Perezoso: progresión importa los modelos del simulador (como ``CasesView``).
    from apps.grupos.access import NOT_ASSIGNED
    from apps.progression.access import access_decision

    version = _readable_version(actor, case_version_id)
    decision = access_decision(actor, version.id)
    if not decision.allowed and decision.reason == NOT_ASSIGNED:
        raise ApiError(
            "ACCESS_NOT_ASSIGNED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Este caso no está asignado a tu cuenta.",
            status.HTTP_403_FORBIDDEN,
        )
    return build_brief(version, decision)


def build_brief(version, decision):
    """El ``CaseBrief`` de ``version`` con la ``decision`` de acceso ya resuelta."""
    characters = CaseCharacter.objects.filter(
        case_version_id=version.id, show_in_brief=True
    ).order_by("display_order", "id")
    return {
        "caseVersionId": version.id,
        "title": version.simulation_case.title,
        "context": version.narrative_context or "",
        "characters": [
            {
                "id": c.id,
                "displayName": c.display_name,
                "roleLabel": c.role_label,
                "portraitKey": c.portrait_key,
            }
            for c in characters
        ],
        "learningObjectives": read_string_list(version.learning_objectives),
        "hasSensitiveContent": SimulationNode.objects.filter(
            case_version_id=version.id, sensitive_content=True
        ).exists(),
        "access": decision.as_dict(),
    }
