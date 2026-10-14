"""Instructor simulation API — /api/instructor. Mirrors InstructorSimulationController.

All endpoints PROFESOR/ADMIN.
"""
from rest_framework.views import APIView

from shared.permissions import policy_permission
from shared.response import api_ok

from apps.simulation.serializers.requests import ReplaceAttemptRequest
from apps.simulation.services import instructor_service


class RecentAttemptsView(APIView):
    permission_classes = [policy_permission("attempt", "review")]

    def get(self, request):
        return api_ok(instructor_service.recent_attempts(request.user))


class AttemptTraceView(APIView):
    permission_classes = [policy_permission("attempt", "review")]

    def get(self, request, attempt_id):
        return api_ok(instructor_service.trace(attempt_id, request.user))


class ReplaceAttemptView(APIView):
    """Reemplazo de un intento abierto por acción docente (RN-07)."""

    permission_classes = [policy_permission("attempt", "review")]

    def post(self, request, attempt_id):
        ser = ReplaceAttemptRequest(data=request.data)
        ser.is_valid(raise_exception=True)
        return api_ok(
            instructor_service.replace_attempt(attempt_id, ser.validated_data["reason"], request.user),
            message="Intento reemplazado",
        )


class RubricEvaluationView(APIView):
    permission_classes = [policy_permission("attempt", "review")]

    def get(self, request, attempt_id):
        return api_ok(instructor_service.rubric(attempt_id, request.user))

    def post(self, request, attempt_id):
        return api_ok(
            instructor_service.save_rubric(attempt_id, request.data, request.user),
            message="Rubrica guardada",
        )

    def put(self, request, attempt_id):
        return self.post(request, attempt_id)

    def patch(self, request, attempt_id):
        return self.post(request, attempt_id)
