"""Authoring endpoints — mirrors Spring SimulationAuthoringController.

Autoría con propiedad (E2-4): los puede usar el PROFESOR sobre **sus** casos y el ADMIN sobre
todos; cada ruta de un caso comprueba la propiedad antes de tocar nada (404 al leer un caso
ajeno, 403 al modificarlo) y publicar es solo del ADMIN. Mutations return
ApiResponse.ok(message, CaseEditorView); GET/validate return ApiResponse.ok(view). Mounted at
/api/authoring/cases (canónico) y /api/admin/cases (alias).
"""
from rest_framework.views import APIView

from shared.permissions import policy_permission
from shared.response import api_ok

from ..services import authoring_service as svc
from ..services.authoring import guards, lifecycle


def _opt_long(value):
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class _AuthoringView(APIView):
    """Base de las rutas de autoría: puerta de rol por política y propiedad del caso."""

    permission_classes = [policy_permission("case", "author")]

    def version_for(self, request, case_version_id, *, mutate, action="author"):
        """La versión del caso si el actor puede ``action`` sobre él (404 al leer, 403 al mutar)."""
        return guards.authorize_case_version(
            request.user, case_version_id, mutate=mutate, action=action
        )


# ─── Editor / publish / clone ────────────────────────────────────────────────
class AdminCaseListCreateView(_AuthoringView):
    def get(self, request):
        return api_ok(svc.list_authoring_cases(request.user))

    def post(self, request):
        return api_ok(svc.create_case(request.data, request.user), "Caso creado")


class EditorView(_AuthoringView):
    def get(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=False)
        return api_ok(svc.editor(case_version_id))


class PublishView(_AuthoringView):
    permission_classes = [policy_permission("case", "publish")]

    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True, action="publish")
        return api_ok(svc.publish(case_version_id, request.user, request.data), "Caso publicado")


class LifecycleView(_AuthoringView):
    """C4 · ``CaseLifecycle``: el estado de la versión y sus transiciones (E2-5)."""

    def get(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=False)
        return api_ok(svc.lifecycle_of(case_version_id, request.user))

    def post(self, request, case_version_id):
        policy_action = lifecycle.POLICY_ACTION.get(request.data.get("action"), "author")
        self.version_for(request, case_version_id, mutate=True, action=policy_action)
        return api_ok(
            svc.transition_case(case_version_id, request.user, request.data), "Ciclo de vida actualizado"
        )


class CloneVersionView(_AuthoringView):
    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.clone_version(case_version_id, request.user), "Version clonada")


# ─── Node CRUD ────────────────────────────────────────────────────────────────
class NodeListView(_AuthoringView):
    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.create_node(case_version_id, request.data), "Nodo creado")


class NodeDetailView(_AuthoringView):
    def put(self, request, case_version_id, node_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.update_node(case_version_id, node_id, request.data), "Nodo actualizado")

    def delete(self, request, case_version_id, node_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.delete_node(case_version_id, node_id), "Nodo eliminado")


# ─── Decision CRUD ──────────────────────────────────────────────────────────
class DecisionListView(_AuthoringView):
    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.create_decision(case_version_id, request.data), "Decision creada")


class DecisionDetailView(_AuthoringView):
    def put(self, request, case_version_id, decision_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.update_decision(case_version_id, decision_id, request.data), "Decision actualizada")

    def delete(self, request, case_version_id, decision_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.delete_decision(case_version_id, decision_id), "Decision eliminada")


# ─── Map CRUD ────────────────────────────────────────────────────────────────
class MapListView(_AuthoringView):
    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.create_map(case_version_id, request.data), "Mapa creado")


class MapDetailView(_AuthoringView):
    def put(self, request, case_version_id, map_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.update_map(case_version_id, map_id, request.data), "Mapa actualizado")

    def delete(self, request, case_version_id, map_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.delete_map(case_version_id, map_id), "Mapa eliminado")


# ─── Map Object CRUD ─────────────────────────────────────────────────────────
class ObjectListView(_AuthoringView):
    def post(self, request, case_version_id, map_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.create_object(case_version_id, map_id, request.data), "Objeto creado")


class ObjectDetailView(_AuthoringView):
    def put(self, request, case_version_id, object_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.update_object(case_version_id, object_id, request.data), "Objeto actualizado")

    def delete(self, request, case_version_id, object_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.delete_object(case_version_id, object_id), "Objeto eliminado")


# ─── Dialogue CRUD ────────────────────────────────────────────────────────────
class DialogueListView(_AuthoringView):
    def post(self, request, case_version_id, map_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.create_dialogue(case_version_id, map_id, request.data), "Dialogo creado")


class DialogueDetailView(_AuthoringView):
    def put(self, request, case_version_id, tree_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.update_dialogue(case_version_id, tree_id, request.data), "Dialogo actualizado")

    def delete(self, request, case_version_id, tree_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.delete_dialogue(case_version_id, tree_id), "Dialogo eliminado")


# ─── Tool CRUD ──────────────────────────────────────────────────────────────
class ToolListView(_AuthoringView):
    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.create_tool(case_version_id, request.data), "Herramienta creada")


class ToolDetailView(_AuthoringView):
    def put(self, request, case_version_id, tool_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.update_tool(case_version_id, tool_id, request.data), "Herramienta actualizada")

    def delete(self, request, case_version_id, tool_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.delete_tool(case_version_id, tool_id), "Herramienta eliminada")


# ─── Checklist ──────────────────────────────────────────────────────────────
class ChecklistView(_AuthoringView):
    def put(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(
            svc.update_checklist(case_version_id, request.data, request.user),
            "Checklist actualizado",
        )


# ─── WorldDefinition v2 ───────────────────────────────────────────────────────
class WorldEditorView(_AuthoringView):
    def get(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=False)
        node_id = _opt_long(request.query_params.get("nodeId"))
        return api_ok(svc.world_editor(case_version_id, node_id))


class WorldSaveView(_AuthoringView):
    def put(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        node_id = _opt_long(request.query_params.get("nodeId"))
        return api_ok(svc.save_world(case_version_id, node_id, request.data), "Mundo guardado")


class WorldValidateView(_AuthoringView):
    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=False)
        return api_ok(svc.validate_world(case_version_id))


class WorldPreviewView(_AuthoringView):
    def get(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=False)
        node_id = _opt_long(request.query_params.get("nodeId"))
        return api_ok(svc.world_preview(case_version_id, node_id))
