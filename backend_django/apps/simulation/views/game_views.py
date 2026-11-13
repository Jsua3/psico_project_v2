"""Student simulation API — /api/simulation. Mirrors SimulationGameController."""
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from shared.idempotency import normalize_request_id
from shared.openapi import ApiEnvelopeSerializer, envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_created, api_ok

from apps.simulation.serializers.contracts import (
    AttemptStateSerializer,
    CaseBriefSerializer,
    HintStateSerializer,
    SurveyRequestSerializer,
    SurveyStateSerializer,
    WorldPatchAckSerializer,
)
from apps.simulation.serializers.requests import (
    ReflectionRequest,
    ResumeAttemptRequest,
    SafeExitRequest,
    SelectDecisionRequest,
    StartAttemptRequest,
)
from apps.simulation.services import (
    attempt_survey,
    case_brief,
    game_service,
    hints as hint_service,
    rubric_service,
    world_service,
)

ATTEMPT_TOKEN_HEADER = "X-SIEP-Attempt-Token"

#: La puerta de rol de las rutas que juegan un intento por su token: el estudiante (``play``) y la docente que ensaya su
#: borrador (``rehearse``, bloque A2). A quién pertenece el intento lo decide ``game_service._require_attempt``.
_CAN_PLAY_OR_REHEARSE = policy_permission("attempt", "play", also=("attempt", "rehearse"))


def _attempt_token(request):
    return request.headers.get(ATTEMPT_TOKEN_HEADER)


def _private_ok(data):
    response = api_ok(data)
    response["Cache-Control"] = "no-store"
    return response


class CasesView(APIView):
    permission_classes = [policy_permission("catalog", "read")]

    def get(self, request):
        cases = game_service.list_published_cases(request.user)
        # La decisión de acceso es de progresión (asignación, ventana y secuencia): el servicio
        # del juego no la conoce, la vista la suma a cada caso (``access``, aditivo).
        from apps.progression.access import access_map

        decisions = access_map(request.user, [case["caseVersionId"] for case in cases])
        for case in cases:
            case["access"] = decisions[case["caseVersionId"]].as_dict()
        return api_ok(cases)


class CaseBriefView(APIView):
    """C8 · La ficha del caso antes de jugar: contexto, personajes y objetivos, sin crear intento."""

    permission_classes = [policy_permission("catalog", "read")]

    @extend_schema(responses={200: envelope_of(CaseBriefSerializer), **error_responses(401, 403, 404)})
    def get(self, request, case_version_id):
        return api_ok(case_brief.brief_for(request.user, case_version_id))


class StartAttemptView(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    def post(self, request):
        ser = StartAttemptRequest(data=request.data)
        ser.is_valid(raise_exception=True)
        normalize_request_id(ser.validated_data.get("requestId"))  # 400 si el formato no vale
        state = game_service.start_attempt(
            ser.validated_data["caseVersionId"], request.user, ser.validated_data["forceNew"]
        )
        return api_ok(state, message="Intento iniciado")


class ActiveAttemptView(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    @extend_schema(
        responses={
            200: ApiEnvelopeSerializer,
            204: OpenApiResponse(description="No hay un intento abierto de esa versión: la respuesta no lleva cuerpo."),
        }
    )
    def get(self, request, case_version_id):
        state = game_service.find_active_attempt(case_version_id, request.user)
        if state is None:
            return Response(status=204)
        return api_ok(state)


class AttemptView(APIView):
    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    @extend_schema(
        parameters=[OpenApiParameter(ATTEMPT_TOKEN_HEADER, str, OpenApiParameter.HEADER, required=True)],
        responses={200: envelope_of(AttemptStateSerializer), **error_responses(400, 401, 403, 404)},
    )
    def get(self, request, attempt_id):
        return _private_ok(game_service.get_attempt(
            attempt_id, _attempt_token(request), request.user,
        ))


class HintStateView(APIView):
    """C9 · Las pistas de la escena actual: las que el intento ya pidió y cuántas quedan."""

    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    @extend_schema(
        parameters=[OpenApiParameter(ATTEMPT_TOKEN_HEADER, str, OpenApiParameter.HEADER, required=True)],
        responses={200: envelope_of(HintStateSerializer), **error_responses(400, 401, 403, 404)},
    )
    def get(self, request, attempt_id):
        return _private_ok(hint_service.get_hint_state(
            attempt_id, _attempt_token(request), request.user,
        ))


class NextHintView(APIView):
    """C9 · Pedir la siguiente pista de la escena (sin costo, una sola vez por ``requestId``)."""

    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    @extend_schema(responses={200: envelope_of(HintStateSerializer), **error_responses(400, 401, 403, 404, 409)})
    def post(self, request, attempt_id):
        token = request.data.get("attemptToken") or _attempt_token(request)
        return _private_ok(hint_service.reveal_next_hint(
            attempt_id, token, request.user, request_id=request.data.get("requestId"),
        ))


class AttemptSurveyView(APIView):
    """C14 · La encuesta breve opcional de un intento completado (apagada por defecto: 404)."""

    permission_classes = [policy_permission("attempt", "play")]

    @extend_schema(responses={200: envelope_of(SurveyStateSerializer), **error_responses(401, 403, 404)})
    def get(self, request, attempt_id):
        return _private_ok(attempt_survey.read(attempt_id, request.user))

    @extend_schema(
        request=SurveyRequestSerializer,
        responses={201: envelope_of(SurveyStateSerializer), **error_responses(400, 401, 403, 404, 409)},
    )
    def post(self, request, attempt_id):
        response = api_created(attempt_survey.submit(attempt_id, request.data, request.user))
        response["Cache-Control"] = "no-store"
        return response


class CompletionReportView(APIView):
    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    def get(self, request, attempt_id):
        return _private_ok(game_service.get_completion_report(
            attempt_id, _attempt_token(request), request.user,
        ))


class AttemptReportView(APIView):
    """El reporte congelado de un intento completado (C2); 409 ``ATTEMPT_NOT_COMPLETED`` si no."""

    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    def get(self, request, attempt_id):
        return _private_ok(game_service.get_attempt_report(
            attempt_id, _attempt_token(request), request.user,
        ))


class AttemptEvaluationView(APIView):
    """La evaluación del docente para el dueño del intento: comentario y niveles, sin números."""

    permission_classes = [policy_permission("attempt", "play")]

    def get(self, request, attempt_id):
        return api_ok(rubric_service.owner_evaluation_view(attempt_id, request.user))


class AttemptHistoryView(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    def get(self, request):
        return api_ok(game_service.list_attempt_history(request.user))


class StudentReportView(APIView):
    permission_classes = [policy_permission("attempt", "report")]

    def get(self, request, attempt_id):
        return api_ok(game_service.get_student_report(attempt_id, request.user))


class ProgressMapView(APIView):
    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    def get(self, request, attempt_id):
        return _private_ok(game_service.get_progress_map(
            attempt_id, _attempt_token(request), request.user,
        ))


class DecisionsView(APIView):
    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    def post(self, request, attempt_id):
        ser = SelectDecisionRequest(data=request.data)
        ser.is_valid(raise_exception=True)
        state = game_service.choose_decision(
            attempt_id, ser.validated_data["attemptToken"],
            ser.validated_data["decisionOptionId"], request.user,
            evidence_override=ser.validated_data["evidenceOverride"],
            missing_evidence=ser.validated_data["missingEvidence"],
            request_id=ser.validated_data.get("requestId"),
        )
        return api_ok(state, message="Decision procesada")


class ReflectionsView(APIView):
    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    def post(self, request, attempt_id):
        ser = ReflectionRequest(data=request.data)
        ser.is_valid(raise_exception=True)
        saved = game_service.save_reflection(
            attempt_id, ser.validated_data["attemptToken"],
            ser.validated_data["nodeId"], ser.validated_data["text"], request.user,
            request_id=ser.validated_data.get("requestId"),
        )
        return api_ok(saved, message="Bitacora guardada")


class SafeExitView(APIView):
    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    def post(self, request, attempt_id):
        ser = SafeExitRequest(data=request.data)
        ser.is_valid(raise_exception=True)
        state = game_service.safe_exit(
            attempt_id, ser.validated_data["attemptToken"],
            ser.validated_data["reason"], request.user,
        )
        return api_ok(state, message="Pausa segura registrada")


class ResumeAttemptView(APIView):
    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    def post(self, request, attempt_id):
        ser = ResumeAttemptRequest(data=request.data)
        ser.is_valid(raise_exception=True)
        state = game_service.resume_attempt(
            attempt_id, ser.validated_data["attemptToken"], request.user,
        )
        return api_ok(state, message="Intento reanudado")


# ─── Explorable world (SimulationWorldService) ───────────────────────────────
class WorldView(APIView):
    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    def get(self, request, attempt_id):
        return _private_ok(world_service.get_world(
            attempt_id, _attempt_token(request), request.user,
        ))


class WorldStateView(APIView):
    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    @extend_schema(responses={200: envelope_of(WorldPatchAckSerializer), **error_responses(400, 401, 403, 404)})
    def patch(self, request, attempt_id):
        # Valores crudos a propósito: la validación estricta (entero finito,
        # límites, plausibilidad, colisión) es autoridad del servicio (GAME-01).
        state = world_service.update_position(
            attempt_id,
            request.data.get("attemptToken"),
            request.data.get("playerX"),
            request.data.get("playerY"),
            request.user,
            current_map_key=request.data.get("currentMapKey"),
        )
        return api_ok(state, message="Estado de mundo actualizado")


class InteractionView(APIView):
    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    def post(self, request, attempt_id, interaction_key):
        result = world_service.open_interaction(
            attempt_id, request.data.get("attemptToken"), interaction_key, request.user
        )
        return api_ok(result, message="Interaccion registrada")


class ToolUseView(APIView):
    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    def post(self, request, attempt_id):
        result = world_service.use_tool(
            attempt_id,
            request.data.get("attemptToken"),
            request.data.get("toolCode"),
            request.data.get("targetInteractionKey"),
            request.user,
            request_id=request.data.get("requestId"),
        )
        return api_ok(result, message="Herramienta usada")


class NpcInteractionView(APIView):
    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    def post(self, request, attempt_id, npc_key):
        result = world_service.record_npc_interaction(
            attempt_id, request.data.get("attemptToken"), npc_key, request.user,
        )
        return api_ok(result, message="Interaccion con NPC registrada")


class EnterRoomView(APIView):
    permission_classes = [_CAN_PLAY_OR_REHEARSE]

    def post(self, request, attempt_id):
        result = world_service.enter_room(
            attempt_id,
            request.data.get("attemptToken"),
            request.data.get("targetNodeKey"),
            request.user,
            door_key=request.data.get("doorKey"),
            request_id=request.data.get("requestId"),
        )
        return api_ok(result, message="Sala cambiada")


class CatalogView(APIView):
    permission_classes = [policy_permission("catalog", "read")]

    def get(self, request):
        from apps.progression.catalog import build_catalog
        return api_ok(build_catalog(request.user))
