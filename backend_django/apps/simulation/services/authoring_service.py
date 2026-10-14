"""Fachada del subsistema de autoría de casos (P-05b): la única puerta que usan las vistas.

Mirrors Spring SimulationAuthoringService 1:1 (application/SimulationAuthoringService.java).

Admin case editor: CRUD over nodes/decisions/maps/objects/dialogues/tools,
checklist, publish (gated by checklist=100% + world validation), clone-version
(deep copy to a new DRAFT), and the WorldDefinition v2 editor/save/validate/preview.

Error mapping (maintainer decision — semantic codes):
- requireVersion / requireXInVersion missing  -> NotFound (404)
- ownership / argument errors (IllegalArgument) -> ValidationError (400)
- ensureDraft + publish guards (IllegalState)  -> ValidationError (400)
- saveWorld revision mismatch (ResponseStatus) -> Conflict (409)

Mutations run inside transactions; each mutator returns the full CaseEditorView.

Qué hace este módulo y qué no. La implementación vive en el paquete
``services/authoring/`` (un módulo por responsabilidad, ver su ``__init__``); aquí
queda lo propio de una fachada: la lista de operaciones que se ofrecen y la auditoría
de cada mutación. La auditoría se aplica en la fachada, fuera de la transacción de
negocio, para que el registro se escriba después de ella; ``@auditable`` toma de la
función que decora el nombre y el módulo que guarda en el contexto del registro
(``{"method": ..., "class": "authoring_service"}``), por eso cada operación se declara
aquí como función propia y no se re-exporta desde el paquete.
``resource_id_param_index`` replica las anotaciones de Java.
"""
from .audit_service import auditable
from .authoring import (
    cases,
    editor_view,
    graph,
    publication,
    scenes,
    tools,
    world_definition,
)


# ─── Cases ───────────────────────────────────────────────────────────────────
def list_authoring_cases(actor):
    return cases.list_authoring_cases(actor)


@auditable("CASE_CREATED", "CASE_VERSION", -1)
def create_case(request, actor):
    return cases.create_case(request, actor)


def editor(case_version_id):
    return editor_view.editor(case_version_id)


# ─── Nodes and decisions ─────────────────────────────────────────────────────
@auditable("ADMIN_CREATE_NODE", "CASE_VERSION")
def create_node(case_version_id, request):
    return graph.create_node(case_version_id, request)


@auditable("ADMIN_UPDATE_NODE", "NODE", 1)
def update_node(case_version_id, node_id, request):
    return graph.update_node(case_version_id, node_id, request)


@auditable("ADMIN_DELETE_NODE", "NODE", 1)
def delete_node(case_version_id, node_id):
    return graph.delete_node(case_version_id, node_id)


@auditable("ADMIN_CREATE_DECISION", "CASE_VERSION")
def create_decision(case_version_id, request):
    return graph.create_decision(case_version_id, request)


@auditable("ADMIN_UPDATE_DECISION", "DECISION", 1)
def update_decision(case_version_id, decision_id, request):
    return graph.update_decision(case_version_id, decision_id, request)


@auditable("ADMIN_DELETE_DECISION", "DECISION", 1)
def delete_decision(case_version_id, decision_id):
    return graph.delete_decision(case_version_id, decision_id)


# ─── Maps, objects and dialogues ─────────────────────────────────────────────
@auditable("ADMIN_CREATE_MAP", "CASE_VERSION")
def create_map(case_version_id, request):
    return scenes.create_map(case_version_id, request)


@auditable("ADMIN_UPDATE_MAP", "MAP", 1)
def update_map(case_version_id, map_id, request):
    return scenes.update_map(case_version_id, map_id, request)


@auditable("ADMIN_DELETE_MAP", "MAP", 1)
def delete_map(case_version_id, map_id):
    return scenes.delete_map(case_version_id, map_id)


@auditable("ADMIN_CREATE_OBJECT", "MAP", 1)
def create_object(case_version_id, map_id, request):
    return scenes.create_object(case_version_id, map_id, request)


@auditable("ADMIN_UPDATE_OBJECT", "OBJECT", 1)
def update_object(case_version_id, object_id, request):
    return scenes.update_object(case_version_id, object_id, request)


@auditable("ADMIN_DELETE_OBJECT", "OBJECT", 1)
def delete_object(case_version_id, object_id):
    return scenes.delete_object(case_version_id, object_id)


@auditable("ADMIN_CREATE_DIALOGUE", "MAP", 1)
def create_dialogue(case_version_id, map_id, request):
    return scenes.create_dialogue(case_version_id, map_id, request)


@auditable("ADMIN_UPDATE_DIALOGUE", "DIALOGUE", 1)
def update_dialogue(case_version_id, tree_id, request):
    return scenes.update_dialogue(case_version_id, tree_id, request)


@auditable("ADMIN_DELETE_DIALOGUE", "DIALOGUE", 1)
def delete_dialogue(case_version_id, tree_id):
    return scenes.delete_dialogue(case_version_id, tree_id)


# ─── Clinical tools ──────────────────────────────────────────────────────────
@auditable("ADMIN_CREATE_TOOL", "CASE_VERSION")
def create_tool(case_version_id, request):
    return tools.create_tool(case_version_id, request)


@auditable("ADMIN_UPDATE_TOOL", "TOOL", 1)
def update_tool(case_version_id, tool_id, request):
    return tools.update_tool(case_version_id, tool_id, request)


@auditable("ADMIN_DELETE_TOOL", "TOOL", 1)
def delete_tool(case_version_id, tool_id):
    return tools.delete_tool(case_version_id, tool_id)


# ─── Checklist, publish and clone ────────────────────────────────────────────
@auditable("ADMIN_CHECKLIST_UPDATE", "CASE_VERSION")
def update_checklist(case_version_id, request, actor):
    return publication.update_checklist(case_version_id, request, actor)


@auditable("ADMIN_PUBLISH_CASE", "CASE_VERSION")
def publish(case_version_id):
    return publication.publish(case_version_id)


@auditable("ADMIN_CLONE_VERSION", "CASE_VERSION")
def clone_version(case_version_id, actor):
    return publication.clone_version(case_version_id, actor)


# ─── WorldDefinition v2 ──────────────────────────────────────────────────────
def world_editor(case_version_id, node_id):
    return world_definition.world_editor(case_version_id, node_id)


def world_preview(case_version_id, node_id):
    return world_definition.world_preview(case_version_id, node_id)


def validate_world(case_version_id):
    return world_definition.validate_world(case_version_id)


@auditable("ADMIN_SAVE_WORLD", "CASE_VERSION")
def save_world(case_version_id, node_id, request):
    return world_definition.save_world(case_version_id, node_id, request)
