"""Instructor simulation API — /api/instructor. Mirrors InstructorSimulationController.

All endpoints PROFESOR/ADMIN.
"""
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.views import APIView

from apps.simulation.models import AttemptStatus
from shared.exceptions import ApiError
from shared.openapi import InstructorAttemptsListSchemaSerializer
from shared.permissions import policy_permission
from shared.response import api_ok

from apps.simulation.serializers.requests import ReplaceAttemptRequest
from apps.simulation.services import instructor_service


def _int_param(request, *names):
    for name in names:
        raw = request.query_params.get(name)
        if raw is not None and raw != "":
            try:
                return int(raw)
            except (TypeError, ValueError) as exc:
                raise ApiError(
                    "INVALID_QUERY_PARAM",
                    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                    f"El parámetro '{name}' debe ser un número entero.",
                    status.HTTP_400_BAD_REQUEST,
                ) from exc
    return None


def _status_param(request):
    """``estado`` (o ``status``): un estado conocido del intento. Uno mal escrito no es «sin resultados»."""
    raw = request.query_params.get("estado") or request.query_params.get("status")
    if not raw:
        return None
    if raw not in AttemptStatus.values:
        raise ApiError(
            "INVALID_QUERY_PARAM",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            f"El parámetro 'estado' debe ser uno de: {', '.join(AttemptStatus.values)}.",
            status.HTTP_400_BAD_REQUEST,
        )
    return raw


class InstructorAttemptsView(APIView):
    permission_classes = [policy_permission("attempt", "review")]

    @extend_schema(responses=InstructorAttemptsListSchemaSerializer)
    def get(self, request):
        grupo_id = _int_param(request, "grupoId", "groupId")
        estudiante_id = _int_param(request, "estudianteId", "studentId")
        case_version_id = _int_param(request, "caseVersionId")
        estado = _status_param(request)
        page = _int_param(request, "page") or 1
        page_size = _int_param(request, "pageSize", "limit") or instructor_service.DEFAULT_PAGE_SIZE
        return api_ok(
            instructor_service.list_attempts(
                request.user,
                grupo_id=grupo_id,
                estudiante_id=estudiante_id,
                case_version_id=case_version_id,
                estado=estado,
                page=page,
                page_size=page_size,
            )
        )


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
