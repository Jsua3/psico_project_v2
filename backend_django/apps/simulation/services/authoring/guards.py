"""Guardas de la autoría: qué versión y qué entidades se pueden tocar.

Mapeo de errores (decisión del mantenedor — códigos semánticos):
- la versión o la entidad no existe                  -> NotFound (404)
- la entidad no pertenece a la versión               -> ValidationError (400)
- la versión no es un borrador (``ensure_draft``)    -> ValidationError (400)
"""
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from shared import policies
from apps.simulation.models import (
    CaseVersion,
    ClinicalTool,
    DecisionOption,
    DialogueTree,
    MapObject,
    SceneMap,
    SimulationNode,
)


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
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise PermissionDenied("Solo quien autora el caso puede modificarlo")
    raise NotFound("Version de caso no encontrada")


def ensure_draft(case_version_id):
    version = require_version(case_version_id)
    if version.status != "DRAFT":
        raise ValidationError(
            "Solo se puede modificar una versión en estado DRAFT. "
            f"Estado actual: {version.status}. "
            "Use 'Clonar versión' para crear una copia editable."
        )
    return version


def require_node_in_version(node_id, case_version_id):
    node = SimulationNode.objects.filter(pk=node_id).first()
    if not node:
        raise NotFound(f"Nodo no encontrado: {node_id}")
    if node.case_version_id != case_version_id:
        raise ValidationError(f"El nodo {node_id} no pertenece a la versión {case_version_id}")
    return node


def require_decision_in_version(decision_id, case_version_id):
    decision = DecisionOption.objects.filter(pk=decision_id).first()
    if not decision:
        raise NotFound(f"Decision no encontrada: {decision_id}")
    if decision.case_version_id != case_version_id:
        raise ValidationError(f"La decisión {decision_id} no pertenece a la versión {case_version_id}")
    return decision


def require_map_in_version(map_id, case_version_id):
    scene_map = SceneMap.objects.filter(pk=map_id).first()
    if not scene_map:
        raise NotFound(f"Mapa no encontrado: {map_id}")
    if scene_map.case_version_id != case_version_id:
        raise ValidationError(f"El mapa {map_id} no pertenece a la versión {case_version_id}")
    return scene_map


def require_object_in_version(object_id, case_version_id):
    obj = MapObject.objects.filter(pk=object_id).select_related("scene_map").first()
    if not obj:
        raise NotFound(f"Objeto no encontrado: {object_id}")
    if obj.scene_map.case_version_id != case_version_id:
        raise ValidationError(f"El objeto {object_id} no pertenece a la versión {case_version_id}")
    return obj


def require_tool_in_version(tool_id, case_version_id):
    tool = ClinicalTool.objects.filter(pk=tool_id).first()
    if not tool:
        raise NotFound(f"Herramienta no encontrada: {tool_id}")
    if tool.case_version_id != case_version_id:
        raise ValidationError(f"La herramienta {tool_id} no pertenece a la versión {case_version_id}")
    return tool


def require_dialogue_in_version(tree_id, case_version_id):
    tree = DialogueTree.objects.filter(pk=tree_id).select_related("scene_map").first()
    if not tree:
        raise NotFound(f"Diálogo no encontrado: {tree_id}")
    if tree.scene_map.case_version_id != case_version_id:
        raise ValidationError(f"El diálogo {tree_id} no pertenece a la versión {case_version_id}")
    return tree
