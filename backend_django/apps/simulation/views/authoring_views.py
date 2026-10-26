"""Authoring endpoints — mirrors Spring SimulationAuthoringController.

Autoría con propiedad (E2-4): los puede usar el PROFESOR sobre **sus** casos y el ADMIN sobre
todos; cada ruta de un caso comprueba la propiedad antes de tocar nada (404 al leer un caso
ajeno, 403 al modificarlo) y publicar es solo del ADMIN. Mutations return
ApiResponse.ok(message, CaseEditorView); GET/validate return ApiResponse.ok(view). Mounted at
/api/authoring/cases (canónico) y /api/admin/cases (alias).

Cada mutación valida su cuerpo con un serializador de entrada (E2-6: un campo ausente es un
400 que lo nombra, no un 500) y lleva la ``revision`` del caso —en el cuerpo, en
``?revision=`` o en la cabecera ``X-Case-Revision``— para el bloqueo optimista.
"""
from django.core.exceptions import RequestDataTooBig
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.views import APIView

from apps.security.throttling import HeavyUserThrottle, ImportUserThrottle
from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_created, api_ok

from ..casedef import import_
from ..serializers import authoring as inputs
from ..serializers.contracts import (
    CaseConflictEnvelopeSerializer,
    CaseDefinitionSerializer,
    CaseImportedSerializer,
    CaseLifecycleSerializer,
    CaseValidationSerializer,
    ImportRejectedEnvelopeSerializer,
)
from ..services import authoring_service as svc
from ..services.authoring import guards, importing, lifecycle

REVISION_HEADER = "X-Case-Revision"


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

    def revision(self, request):
        """La ``revision`` que el cliente vio: cuerpo, ``?revision=`` o cabecera; ``None`` si no vino."""
        body = request.data if hasattr(request.data, "get") else {}
        for raw in (
            body.get("revision"),
            request.query_params.get("revision"),
            request.headers.get(REVISION_HEADER),
        ):
            if raw not in (None, ""):
                return raw
        return None

    def payload(self, request, serializer_class=None):
        """El cuerpo para el servicio: validado (``validated_data``) y con la revisión incluida.

        Con ``serializer_class=None`` solo se valida la forma (el cuerpo original pasa tal cual:
        el guardado del mundo conserva campos que ningún serializador declara).
        """
        serializer = None
        if serializer_class is not None:
            serializer = serializer_class(data=request.data)
            serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data) if serializer else {}
        revision = self.revision(request)
        if revision is not None:
            data["revision"] = revision
        return data


# ─── Editor / publish / clone ────────────────────────────────────────────────
class AdminCaseListCreateView(_AuthoringView):
    def get(self, request):
        return api_ok(svc.list_authoring_cases(request.user))

    def post(self, request):
        return api_ok(svc.create_case(request.data, request.user), "Caso creado")


class CaseImportView(_AuthoringView):
    """E4-5 · ``POST …/cases/import``: el documento del caso en el cuerpo (``application/json``).

    Lee los bytes crudos —el lector de DRF mezclaría claves repetidas y aceptaría ``NaN``—, valida el
    documento y crea un borrador a nombre de quien importa. 201 ``{caseVersionId, caseId, issues}``.
    """

    throttle_classes = [ImportUserThrottle]

    @extend_schema(
        responses={
            201: envelope_of(CaseImportedSerializer),
            400: OpenApiResponse(
                ImportRejectedEnvelopeSerializer, description="El documento no se puede importar: los hallazgos van en `issues`."
            ),
            **error_responses(401, 403, 409),
        }
    )
    def post(self, request):
        # La cabecera llega cruda (``application/json; charset=utf-8``): solo cuenta el tipo de medio.
        if (request.content_type or "").split(";", 1)[0].strip().lower() != "application/json":
            raise importing.reject(import_.FORMA, "Solo se admite JSON (application/json).")
        try:
            raw = request.body
        except RequestDataTooBig:
            raise importing.reject(import_.LIMIT, "El documento es demasiado grande.") from None
        return api_created(svc.import_case(raw, request.user), "Caso importado")


class CaseDefinitionView(_AuthoringView):
    """E4-7 · ``GET …/cases/{id}/definition``: el documento de la versión (borrador o publicada)."""

    throttle_classes = [HeavyUserThrottle]

    @extend_schema(responses={200: envelope_of(CaseDefinitionSerializer), **error_responses(401, 403, 404)})
    def get(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=False)
        return api_ok(svc.definition_of(case_version_id))


class EditorView(_AuthoringView):
    def get(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=False)
        return api_ok(svc.editor(case_version_id))


class PublishView(_AuthoringView):
    permission_classes = [policy_permission("case", "publish")]

    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True, action="publish")
        payload = self.payload(request, inputs.PublishRequest)
        return api_ok(svc.publish(case_version_id, request.user, payload), "Caso publicado")


class LifecycleView(_AuthoringView):
    """C4 · ``CaseLifecycle``: el estado de la versión y sus transiciones (E2-5)."""

    throttle_classes = [HeavyUserThrottle]

    @extend_schema(responses={200: envelope_of(CaseLifecycleSerializer), **error_responses(401, 403, 404)})
    def get(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=False)
        return api_ok(svc.lifecycle_of(case_version_id, request.user))

    @extend_schema(
        responses={
            200: envelope_of(CaseLifecycleSerializer),
            409: OpenApiResponse(CaseConflictEnvelopeSerializer, description="Choca con el estado actual del caso."),
            **error_responses(400, 401, 403, 404),
        }
    )
    def post(self, request, case_version_id):
        # La autorización va primero y depende de la acción; la acción solo cuenta si es un texto.
        action = request.data.get("action") if hasattr(request.data, "get") else None
        policy_action = lifecycle.POLICY_ACTION.get(action, "author") if isinstance(action, str) else "author"
        self.version_for(request, case_version_id, mutate=True, action=policy_action)
        payload = self.payload(request, inputs.LifecycleRequest)
        return api_ok(
            svc.transition_case(case_version_id, request.user, payload), "Ciclo de vida actualizado"
        )


class CloneVersionView(_AuthoringView):
    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(svc.clone_version(case_version_id, request.user), "Version clonada")


# ─── Node CRUD ────────────────────────────────────────────────────────────────
class NodeListView(_AuthoringView):
    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.NodeRequest)
        return api_ok(svc.create_node(case_version_id, body), "Nodo creado")


class NodeReorderView(_AuthoringView):
    """``PATCH …/nodes/reorder``: el orden informativo de todos los nodos (E3-6, RF-08)."""

    def patch(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.NodeReorderRequest)
        return api_ok(svc.reorder_nodes(case_version_id, body), "Orden de los nodos actualizado")


class NodeDetailView(_AuthoringView):
    def put(self, request, case_version_id, node_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.NodeRequest)
        return api_ok(svc.update_node(case_version_id, node_id, body), "Nodo actualizado")

    def delete(self, request, case_version_id, node_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(
            svc.delete_node(case_version_id, node_id, self.revision(request)), "Nodo eliminado"
        )


# ─── Decision CRUD ──────────────────────────────────────────────────────────
class DecisionListView(_AuthoringView):
    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.DecisionRequest)
        return api_ok(svc.create_decision(case_version_id, body), "Decision creada")


class DecisionDetailView(_AuthoringView):
    def put(self, request, case_version_id, decision_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.DecisionRequest)
        return api_ok(svc.update_decision(case_version_id, decision_id, body), "Decision actualizada")

    def delete(self, request, case_version_id, decision_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(
            svc.delete_decision(case_version_id, decision_id, self.revision(request)), "Decision eliminada"
        )


# ─── Reglas del modelo: hitos, riesgo y finales ──────────────────────────────
class RulesMilestonesView(_AuthoringView):
    def put(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.MilestonesRequest)
        return api_ok(
            svc.update_milestones(case_version_id, body["milestones"], body.get("revision")), "Hitos actualizados"
        )


class RulesRiskView(_AuthoringView):
    def put(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.RiskRequest)
        return api_ok(
            svc.update_risk(case_version_id, body["riskLevel"], body.get("revision")), "Nivel de riesgo actualizado"
        )


class RulesEndingsView(_AuthoringView):
    def put(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.EndingsRequest)
        return api_ok(
            svc.update_endings(case_version_id, body["endings"], body.get("revision")), "Finales actualizados"
        )


# ─── Map CRUD ────────────────────────────────────────────────────────────────
class MapListView(_AuthoringView):
    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.MapRequest)
        return api_ok(svc.create_map(case_version_id, body), "Mapa creado")


class MapDetailView(_AuthoringView):
    def put(self, request, case_version_id, map_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.MapUpdateRequest)
        return api_ok(svc.update_map(case_version_id, map_id, body), "Mapa actualizado")

    def delete(self, request, case_version_id, map_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(
            svc.delete_map(case_version_id, map_id, self.revision(request)), "Mapa eliminado"
        )


# ─── Map Object CRUD ─────────────────────────────────────────────────────────
class ObjectListView(_AuthoringView):
    def post(self, request, case_version_id, map_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.ObjectRequest)
        return api_ok(svc.create_object(case_version_id, map_id, body), "Objeto creado")


class ObjectDetailView(_AuthoringView):
    def put(self, request, case_version_id, object_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.ObjectRequest)
        return api_ok(svc.update_object(case_version_id, object_id, body), "Objeto actualizado")

    def delete(self, request, case_version_id, object_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(
            svc.delete_object(case_version_id, object_id, self.revision(request)), "Objeto eliminado"
        )


# ─── Dialogue CRUD ────────────────────────────────────────────────────────────
class DialogueListView(_AuthoringView):
    def post(self, request, case_version_id, map_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.DialogueRequest)
        return api_ok(svc.create_dialogue(case_version_id, map_id, body), "Dialogo creado")


class DialogueDetailView(_AuthoringView):
    def put(self, request, case_version_id, tree_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.DialogueRequest)
        return api_ok(svc.update_dialogue(case_version_id, tree_id, body), "Dialogo actualizado")

    def delete(self, request, case_version_id, tree_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(
            svc.delete_dialogue(case_version_id, tree_id, self.revision(request)), "Dialogo eliminado"
        )


# ─── Tool CRUD ──────────────────────────────────────────────────────────────
class ToolListView(_AuthoringView):
    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.ToolRequest)
        return api_ok(svc.create_tool(case_version_id, body), "Herramienta creada")


class ToolDetailView(_AuthoringView):
    def put(self, request, case_version_id, tool_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.ToolRequest)
        return api_ok(svc.update_tool(case_version_id, tool_id, body), "Herramienta actualizada")

    def delete(self, request, case_version_id, tool_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(
            svc.delete_tool(case_version_id, tool_id, self.revision(request)), "Herramienta eliminada"
        )


# ─── Hint CRUD (E3-5) ───────────────────────────────────────────────────────
class HintListView(_AuthoringView):
    def post(self, request, case_version_id, map_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.HintRequest)
        return api_ok(svc.create_hint(case_version_id, map_id, body), "Pista creada")


class HintDetailView(_AuthoringView):
    def put(self, request, case_version_id, hint_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.HintRequest)
        return api_ok(svc.update_hint(case_version_id, hint_id, body), "Pista actualizada")

    def delete(self, request, case_version_id, hint_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(
            svc.delete_hint(case_version_id, hint_id, self.revision(request)), "Pista eliminada"
        )


# ─── Ficha del caso (E3-4) ──────────────────────────────────────────────────
class BriefView(_AuthoringView):
    def put(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.BriefRequest)
        return api_ok(svc.update_brief(case_version_id, body), "Ficha del caso actualizada")


# ─── Character CRUD (E3-3) ──────────────────────────────────────────────────
class CharacterListView(_AuthoringView):
    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.CharacterRequest)
        return api_ok(svc.create_character(case_version_id, body), "Personaje creado")


class CharacterDetailView(_AuthoringView):
    def put(self, request, case_version_id, character_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.CharacterRequest)
        return api_ok(
            svc.update_character(case_version_id, character_id, body), "Personaje actualizado"
        )

    def delete(self, request, case_version_id, character_id):
        self.version_for(request, case_version_id, mutate=True)
        return api_ok(
            svc.delete_character(case_version_id, character_id, self.revision(request)),
            "Personaje eliminado",
        )


# ─── Checklist ──────────────────────────────────────────────────────────────
class ChecklistView(_AuthoringView):
    def put(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=True)
        body = self.payload(request, inputs.ChecklistRequest)
        return api_ok(
            svc.update_checklist(case_version_id, body, request.user),
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
        # Se valida la forma del cuerpo; el servicio lee el cuerpo original (conserva todo campo).
        serializer = inputs.WorldSaveRequest(data=request.data)
        serializer.is_valid(raise_exception=True)
        body = dict(request.data)
        revision = self.revision(request)
        if revision is not None:
            body["revision"] = revision
        node_id = _opt_long(request.query_params.get("nodeId"))
        return api_ok(svc.save_world(case_version_id, node_id, body), "Mundo guardado")


class WorldValidateView(_AuthoringView):
    throttle_classes = [HeavyUserThrottle]

    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=False)
        return api_ok(svc.validate_world(case_version_id))


class CaseValidateView(_AuthoringView):
    """C6 · ``{issues: ValidationIssue[], canPublish}`` (E2-8)."""

    throttle_classes = [HeavyUserThrottle]

    @extend_schema(responses={200: envelope_of(CaseValidationSerializer), **error_responses(401, 403, 404)})
    def post(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=False)
        return api_ok(svc.validate_case(case_version_id))


class WorldPreviewView(_AuthoringView):
    def get(self, request, case_version_id):
        self.version_for(request, case_version_id, mutate=False)
        node_id = _opt_long(request.query_params.get("nodeId"))
        return api_ok(svc.world_preview(case_version_id, node_id))
