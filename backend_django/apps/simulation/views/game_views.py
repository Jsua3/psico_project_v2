"""Student simulation API — /api/simulation. Mirrors SimulationGameController."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from shared.permissions import IsEstudianteOrAdmin
from shared.response import api_ok

from apps.simulation.serializers.requests import (
    ReflectionRequest,
    ResumeAttemptRequest,
    SafeExitRequest,
    SelectDecisionRequest,
    StartAttemptRequest,
)
from apps.simulation.services import game_service, world_service

ATTEMPT_TOKEN_HEADER = "X-SIEP-Attempt-Token"


def _attempt_token(request):
    return request.headers.get(ATTEMPT_TOKEN_HEADER)


def _private_ok(data):
    response = api_ok(data)
    response["Cache-Control"] = "no-store"
    return response


class CasesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return api_ok(game_service.list_published_cases(request.user))


class StartAttemptView(APIView):
    permission_classes = [IsEstudianteOrAdmin]

    def post(self, request):
        ser = StartAttemptRequest(data=request.data)
        ser.is_valid(raise_exception=True)
        state = game_service.start_attempt(
            ser.validated_data["caseVersionId"], request.user, ser.validated_data["forceNew"]
        )
        return api_ok(state, message="Intento iniciado")


class ActiveAttemptView(APIView):
    permission_classes = [IsEstudianteOrAdmin]

    def get(self, request, case_version_id):
        state = game_service.find_active_attempt(case_version_id, request.user)
        if state is None:
            return Response(status=204)
        return api_ok(state)


class AttemptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, attempt_id):
        return _private_ok(game_service.get_attempt(
            attempt_id, _attempt_token(request), request.user,
        ))


class CompletionReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, attempt_id):
        return _private_ok(game_service.get_completion_report(
            attempt_id, _attempt_token(request), request.user,
        ))


class AttemptHistoryView(APIView):
    permission_classes = [IsEstudianteOrAdmin]

    def get(self, request):
        return api_ok(game_service.list_attempt_history(request.user))


class StudentReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, attempt_id):
        return api_ok(game_service.get_student_report(attempt_id, request.user))


class ProgressMapView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, attempt_id):
        return _private_ok(game_service.get_progress_map(
            attempt_id, _attempt_token(request), request.user,
        ))


class DecisionsView(APIView):
    permission_classes = [IsEstudianteOrAdmin]

    def post(self, request, attempt_id):
        ser = SelectDecisionRequest(data=request.data)
        ser.is_valid(raise_exception=True)
        state = game_service.choose_decision(
            attempt_id, ser.validated_data["attemptToken"],
            ser.validated_data["decisionOptionId"], request.user,
            evidence_override=ser.validated_data["evidenceOverride"],
            missing_evidence=ser.validated_data["missingEvidence"],
        )
        return api_ok(state, message="Decision procesada")


class ReflectionsView(APIView):
    permission_classes = [IsEstudianteOrAdmin]

    def post(self, request, attempt_id):
        ser = ReflectionRequest(data=request.data)
        ser.is_valid(raise_exception=True)
        saved = game_service.save_reflection(
            attempt_id, ser.validated_data["attemptToken"],
            ser.validated_data["nodeId"], ser.validated_data["text"], request.user,
        )
        return api_ok(saved, message="Bitacora guardada")


class SafeExitView(APIView):
    permission_classes = [IsEstudianteOrAdmin]

    def post(self, request, attempt_id):
        ser = SafeExitRequest(data=request.data)
        ser.is_valid(raise_exception=True)
        state = game_service.safe_exit(
            attempt_id, ser.validated_data["attemptToken"],
            ser.validated_data["reason"], request.user,
        )
        return api_ok(state, message="Pausa segura registrada")


class ResumeAttemptView(APIView):
    permission_classes = [IsEstudianteOrAdmin]

    def post(self, request, attempt_id):
        ser = ResumeAttemptRequest(data=request.data)
        ser.is_valid(raise_exception=True)
        state = game_service.resume_attempt(
            attempt_id, ser.validated_data["attemptToken"], request.user,
        )
        return api_ok(state, message="Intento reanudado")


# ─── Explorable world (SimulationWorldService) ───────────────────────────────
class WorldView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, attempt_id):
        return _private_ok(world_service.get_world(
            attempt_id, _attempt_token(request), request.user,
        ))


class WorldStateView(APIView):
    permission_classes = [IsEstudianteOrAdmin]

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
    permission_classes = [IsEstudianteOrAdmin]

    def post(self, request, attempt_id, interaction_key):
        result = world_service.open_interaction(
            attempt_id, request.data.get("attemptToken"), interaction_key, request.user
        )
        return api_ok(result, message="Interaccion registrada")


class ToolUseView(APIView):
    permission_classes = [IsEstudianteOrAdmin]

    def post(self, request, attempt_id):
        result = world_service.use_tool(
            attempt_id,
            request.data.get("attemptToken"),
            request.data.get("toolCode"),
            request.data.get("targetInteractionKey"),
            request.user,
        )
        return api_ok(result, message="Herramienta usada")


class NpcInteractionView(APIView):
    permission_classes = [IsEstudianteOrAdmin]

    def post(self, request, attempt_id, npc_key):
        result = world_service.record_npc_interaction(
            attempt_id, request.data.get("attemptToken"), npc_key, request.user,
        )
        return api_ok(result, message="Interaccion con NPC registrada")


class EnterRoomView(APIView):
    permission_classes = [IsEstudianteOrAdmin]

    def post(self, request, attempt_id):
        result = world_service.enter_room(
            attempt_id,
            request.data.get("attemptToken"),
            request.data.get("targetNodeKey"),
            request.user,
            door_key=request.data.get("doorKey"),
        )
        return api_ok(result, message="Sala cambiada")


class CatalogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.progression.catalog import build_catalog
        return api_ok(build_catalog(request.user))
