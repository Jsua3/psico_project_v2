"""La ficha del caso (C8, RF-16, CU-07): lo que el estudiante lee **antes** de jugar.

No crea intento. Trae el contexto, los personajes que Psicología marcó para la ficha
(``show_in_brief``) y los objetivos de aprendizaje, más la decisión de acceso del estudiante
(la misma que consultan el catálogo y el inicio). Un estudiante sin el caso asignado no recibe
nada del caso (R8, Review Focus 7): un 403 ``ACCESS_NOT_ASSIGNED`` sin título ni contexto.
"""
from django.db.models import Count, Exists, OuterRef, Q
from rest_framework import status
from rest_framework.exceptions import NotFound

from apps.simulation.models import CaseCharacter, CaseVersion, DecisionOption, SceneMap, SimulationNode
from apps.simulation.services.world_assets import world_asset_url_problem
from shared import policies
from shared.exceptions import ApiError
from shared.jsonutils import read_map, read_string_list


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
        # BK-1 (aditivo): lo que la ficha nueva dice antes del contexto. Ver ``presentacion_de_versiones``.
        **presentacion_de_versiones([version.id])[version.id],
        "temasSensibles": temas_sensibles(version),
        "conRubrica": tiene_rubrica(version.id),
    }


# ─── BK-1 y BK-4 · cómo se presenta un caso antes de abrirlo ──────────────────
def portada_de_mapa(ambient_json, structure):
    """La URL del fondo de una sala de imagen fija, o ``None``.

    Es la regla de ``biblioteca.services.lugares._portada`` aplicada a una sala ya copiada al caso: una sala armada por
    piezas (``structure``) no tiene imagen propia, y un fondo que no pasa ``world_asset_url_problem`` tampoco se ofrece
    (el juego no lo pintaría; S2-6b). Sin portada, la interfaz usa su composición de respaldo.
    """
    if isinstance(structure, dict):
        return None
    fondo = read_map(ambient_json).get("backgroundImage")
    if not isinstance(fondo, str) or not fondo.strip() or world_asset_url_problem(fondo) is not None:
        return None
    return fondo


def presentacion_de_versiones(version_ids):
    """``{id: {escenas, inicio, portada}}`` de cada versión, en tres consultas para cualquier cantidad de versiones.

    - ``escenas``: cuántas escenas (nodos) tiene.
    - ``inicio``: ``{escena, lugar}`` de la escena de inicio (su título y el de su sala), o ``None`` si no hay.
    - ``portada``: el fondo de la sala de la escena de inicio (``portada_de_mapa``), o ``None``.
    """
    ids = list(dict.fromkeys(version_ids))
    result = {vid: {"escenas": 0, "inicio": None, "portada": None} for vid in ids}
    if not ids:
        return result
    for row in (
        SimulationNode.objects.filter(case_version_id__in=ids)
        .values("case_version_id").annotate(n=Count("id")).order_by()
    ):
        result[row["case_version_id"]]["escenas"] = row["n"]
    starts = {}
    # Si una versión rota tuviera dos inicios, manda el primero en el orden del editor (el mismo criterio estable).
    for node in (
        SimulationNode.objects.filter(case_version_id__in=ids, start_node=True)
        .order_by("case_version_id", "display_order", "id").values("id", "case_version_id", "title")
    ):
        starts.setdefault(node["case_version_id"], node)
    maps = {
        m["node_id"]: m
        for m in SceneMap.objects.filter(node_id__in=[n["id"] for n in starts.values()])
        .values("node_id", "title", "ambient_json", "structure")
    }
    for vid, node in starts.items():
        scene_map = maps.get(node["id"])
        result[vid]["inicio"] = {"escena": node["title"], "lugar": scene_map["title"] if scene_map else ""}
        if scene_map:
            result[vid]["portada"] = portada_de_mapa(scene_map["ambient_json"], scene_map["structure"])
    return result


def escenas_con_guion(version_ids):
    """``{id: n}``: cuántas escenas de cada versión ya tienen guion (BK-4: «3 de 5 escenas con guion»).

    Una escena tiene guion cuando su narración no está vacía y, si no es un final, ofrece al menos una respuesta: es el
    mínimo para que el estudiante la lea y pueda seguir. No mide calidad; los avisos detallados viven en el editor.
    """
    ids = list(dict.fromkeys(version_ids))
    counts = dict.fromkeys(ids, 0)
    if not ids:
        return counts
    con_respuestas = Exists(DecisionOption.objects.filter(source_node_id=OuterRef("pk")))
    for row in (
        SimulationNode.objects.filter(case_version_id__in=ids)
        .exclude(narrative__regex=r"^\s*$")
        .annotate(con_respuestas=con_respuestas)
        .filter(Q(terminal_node=True) | Q(con_respuestas=True))
        .values("case_version_id").annotate(n=Count("id")).order_by()
    ):
        counts[row["case_version_id"]] = row["n"]
    return counts


def temas_sensibles(version):
    """Los temas sensibles declarados (``content_warnings``): solo textos no vacíos, sin espacios sobrantes."""
    return [t.strip() for t in read_string_list(version.content_warnings) if isinstance(t, str) and t.strip()]


def tiene_rubrica(case_version_id):
    """¿Se valora esta versión con alguna rúbrica? La misma resolución que la valoración (``rubric_for_case_version``:
    asignada, propia de la versión o predeterminada); falso solo si esa función no encuentra ninguna. Con «hay una
    asignada» la ficha mentiría en los casos que se valoran con la propia o con la predeterminada."""
    from apps.simulation.services.rubric_service import rubric_for_case_version  # perezoso: evita el ciclo

    try:
        rubric_for_case_version(case_version_id)
    except NotFound:
        return False
    return True
