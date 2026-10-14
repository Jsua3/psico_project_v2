"""Guardas de la autoría: qué versión y qué entidades se pueden tocar.

Mapeo de errores (decisión del mantenedor — códigos semánticos):
- la versión o la entidad no existe                  -> NotFound (404)
- la entidad no pertenece a la versión               -> ValidationError (400)
- la versión no es un borrador (``ensure_draft``)    -> ValidationError (400)
- la ``revision`` vencida (``check_revision``)       -> ApiError ``REVISION_CONFLICT`` (409)

**Toda** búsqueda del editor pasa por ``in_version`` (E2-6): una referencia a un nodo, mapa,
objeto, decisión, herramienta o diálogo solo se admite si es de la versión que se edita.
"""
from django.conf import settings
from django.db.models import BigIntegerField, Case, F, When
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError

from apps.simulation.models import (
    CaseCharacter,
    CaseVersion,
    ClinicalTool,
    DecisionOption,
    DialogueTree,
    MapObject,
    SceneMap,
    SimulationNode,
)
from apps.simulation.services.audit_service import current_actor_id
from shared import policies
from shared.exceptions import ApiError

#: modelo → (mensaje de «no existe», mensaje de «es de otra versión», ruta hasta la versión).
#: Los textos son los que fijan las pruebas de contrato de la autoría (P-05b).
_REFERENCES = {
    SimulationNode: ("Nodo no encontrado: {id}", "El nodo {id} no pertenece a la versión {version}",
                     "case_version_id", None),
    DecisionOption: ("Decision no encontrada: {id}", "La decisión {id} no pertenece a la versión {version}",
                     "case_version_id", None),
    SceneMap: ("Mapa no encontrado: {id}", "El mapa {id} no pertenece a la versión {version}",
               "case_version_id", None),
    MapObject: ("Objeto no encontrado: {id}", "El objeto {id} no pertenece a la versión {version}",
                "scene_map__case_version_id", "scene_map"),
    ClinicalTool: ("Herramienta no encontrada: {id}", "La herramienta {id} no pertenece a la versión {version}",
                   "case_version_id", None),
    DialogueTree: ("Diálogo no encontrado: {id}", "El diálogo {id} no pertenece a la versión {version}",
                   "scene_map__case_version_id", "scene_map"),
    CaseCharacter: ("Personaje no encontrado: {id}", "El personaje {id} no pertenece a la versión {version}",
                    "case_version_id", None),
}


def require_version(case_version_id):
    version = CaseVersion.objects.filter(pk=case_version_id).first()
    if not version:
        raise NotFound("Version de caso no encontrada")
    return version


def authorize_case_version(actor, case_version_id, *, mutate, action="author"):
    """La versión, si el actor puede ``action`` sobre su caso; si no, 404 al leer y 403 al mutar.

    El dueño del caso es ``simulation_cases.created_by``; el ADMIN puede todo (matriz de
    políticas, ``case.<acción>``). Leer lo ajeno no confirma que exista (404); mutarlo es
    403 (E2-4, R3 del plan). Una versión que no existe es 404 para todos.
    """
    version = (
        CaseVersion.objects.select_related("simulation_case").filter(pk=case_version_id).first()
    )
    if not version:
        raise NotFound("Version de caso no encontrada")
    if policies.can(actor, "case", action, owner_id=version.simulation_case.created_by_id):
        return version
    if mutate:
        # Dos razones distintas, dos códigos: el rol podría hacerlo pero el caso no es suyo, o el
        # rol nunca puede hacerlo (p. ej. un profesor que intenta aprobar).
        if getattr(actor, "role", None) in policies.allowed_roles("case", action):
            raise ApiError(
                "CASE_NOT_OWNED",
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                "Solo quien autora el caso puede modificarlo.",
                status.HTTP_403_FORBIDDEN,
            )
        raise ApiError(
            "CASE_ACTION_FORBIDDEN",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Tu rol no puede hacer esto con el caso.",
            status.HTTP_403_FORBIDDEN,
        )
    raise NotFound("Version de caso no encontrada")


# ─── Revisión optimista (E2-6) ───────────────────────────────────────────────────────────
def _same_editing_run(version, requested, actor_id):
    """¿``requested`` es una revisión vencida pero **de la misma tanda de quien edita**?

    Una tanda es la racha de ediciones seguidas de una misma persona: empieza en la revisión que
    esa persona vio antes de su primera edición (``edited_alone_since``) y llega hasta la actual.
    Si nadie más editó en ese tramo, quien reenvía una revisión de la tanda (otra pestaña, un
    guardado cuya respuesta se canceló, un autoguardado que no esperó al anterior) no está
    pisando a nadie. Si otra persona editó después, no cabe: conflicto.
    """
    return (
        actor_id is not None
        and version.last_edited_by_id == actor_id
        and version.edited_alone_since <= requested <= version.version
    )


def check_revision(version, revision, actor_id=None):
    """409 ``REVISION_CONFLICT`` si ``revision`` está vencida; 400 si falta y es obligatoria.

    Sin ``REVISION_REQUIRED`` la revisión es opcional pero **se compara cuando viene**: un
    cliente que la manda está pidiendo la protección. Una revisión vencida de la misma persona
    que editó por última vez (y sin ediciones ajenas desde entonces) se acepta (R15).
    """
    if actor_id is None:
        actor_id = current_actor_id()
    if revision is None or revision == "":
        if settings.REVISION_REQUIRED:
            raise ApiError(
                "REVISION_REQUIRED",
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                "Falta la revisión del caso: recarga el editor para obtenerla.",
                status.HTTP_400_BAD_REQUEST,
                field="revision",
            )
        return
    try:
        requested = int(revision)
    except (TypeError, ValueError):
        raise ApiError(
            "VALIDATION_ERROR",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "La revisión debe ser un número entero.",
            status.HTTP_400_BAD_REQUEST,
            field="revision",
        ) from None
    if requested != version.version and not _same_editing_run(version, requested, actor_id):
        from .editor_view import editor  # perezoso: editor_view importa este módulo

        raise ApiError(
            "REVISION_CONFLICT",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Este caso fue modificado en otra sesión. Recarga el editor para continuar.",
            status.HTTP_409_CONFLICT,
            revision=version.version,
            current=editor(version.id),
        )


def revision_bump(actor_id=None):
    """Los campos de un ``UPDATE`` que avanza la revisión y registra quién edita.

    Todo en una sola sentencia (las expresiones ven la fila de antes): si quien edita es otra
    persona, la tanda nueva empieza en la revisión que existía antes de esta edición.
    """
    if actor_id is None:
        actor_id = current_actor_id()
    return {
        "version": F("version") + 1,
        "edited_alone_since": Case(
            When(last_edited_by_id=actor_id, then=F("edited_alone_since")),
            default=F("version"),
            output_field=BigIntegerField(),
        ),
        "last_edited_by_id": actor_id,
    }


def bump_revision(case_version_id, actor_id=None):
    """Avanza la revisión del caso (versión optimista): una escritura atómica sin leer."""
    CaseVersion.objects.filter(pk=case_version_id).update(**revision_bump(actor_id))


def ensure_draft(case_version_id, revision=None):
    """La versión como borrador, bajo ``FOR UPDATE`` y con su revisión comprobada.

    Debe llamarse dentro de una transacción: el cerrojo serializa dos guardados del mismo caso
    (el segundo espera, relee la revisión y, si es vieja, recibe el 409).
    """
    version = CaseVersion.objects.select_for_update().filter(pk=case_version_id).first()
    if not version:
        raise NotFound("Version de caso no encontrada")
    if version.status != "DRAFT":
        raise ValidationError(
            "Solo se puede modificar una versión en estado DRAFT. "
            f"Estado actual: {version.status}. "
            "Use 'Clonar versión' para crear una copia editable."
        )
    check_revision(version, revision)
    return version


# ─── Referencias acotadas a la versión ───────────────────────────────────────────────────
def in_version(model, pk, case_version_id, *, not_found=None):
    """La instancia de ``model`` con ese ``pk`` **si es de la versión**.

    404 si no existe (con su mensaje de siempre, o ``not_found``) y 400 «… no pertenece a la
    versión …» si existe pero es de otra: nunca se acepta una referencia a otro caso.
    """
    not_found_message, other_version_message, version_path, related = _REFERENCES[model]
    queryset = model.objects.filter(pk=pk)
    if related:
        queryset = queryset.select_related(related)
    instance = queryset.first()
    if instance is None:
        raise NotFound(not_found or not_found_message.format(id=pk))
    actual = instance
    for part in version_path.split("__"):
        actual = getattr(actual, part)
    if actual != case_version_id:
        raise ValidationError(other_version_message.format(id=pk, version=case_version_id))
    return instance


def require_node_in_version(node_id, case_version_id):
    return in_version(SimulationNode, node_id, case_version_id)


def require_decision_in_version(decision_id, case_version_id):
    return in_version(DecisionOption, decision_id, case_version_id)


def require_map_in_version(map_id, case_version_id):
    return in_version(SceneMap, map_id, case_version_id)


def require_object_in_version(object_id, case_version_id):
    return in_version(MapObject, object_id, case_version_id)


def require_tool_in_version(tool_id, case_version_id):
    return in_version(ClinicalTool, tool_id, case_version_id)


def require_dialogue_in_version(tree_id, case_version_id):
    return in_version(DialogueTree, tree_id, case_version_id)


def decision_link(decision_option_id, case_version_id):
    """La decisión que un objeto o una opción de diálogo enlaza, o ``None`` si ya no existe.

    Una decisión borrada en otra sesión no rompe el guardado (el enlace queda vacío), pero
    una que existe y es de **otra versión** nunca se acepta (400).
    """
    if decision_option_id is None:
        return None
    try:
        return in_version(DecisionOption, decision_option_id, case_version_id)
    except NotFound:
        return None


def character_link(character_id, case_version_id):
    """El personaje que un objeto enlaza, o ``None`` si se quita o ya no existe.

    Como ``decision_link``: un personaje borrado en otra sesión no rompe el guardado (el objeto
    queda sin personaje, que es lo que la base ya hizo), pero uno que existe y es de **otra
    versión** nunca se acepta (400).
    """
    if character_id is None:
        return None
    try:
        return in_version(CaseCharacter, character_id, case_version_id)
    except NotFound:
        return None
