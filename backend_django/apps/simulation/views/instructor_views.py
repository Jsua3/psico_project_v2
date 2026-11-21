"""Instructor simulation API — /api/instructor. Mirrors InstructorSimulationController.

All endpoints PROFESOR/ADMIN.
"""
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.views import APIView

from apps.simulation.models import AttemptStatus
from apps.simulation.serializers.contracts import InstructorAttemptsListSerializer, RecentAttemptSerializer
from shared.exceptions import ApiError
from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_ok

from apps.simulation.serializers.requests import ReplaceAttemptRequest
from apps.simulation.services import instructor_service


def _int_param(request, *names, maximum=None):
    for name in names:
        raw = request.query_params.get(name)
        if raw is not None and raw != "":
            try:
                value = int(raw)
            except (TypeError, ValueError) as exc:
                raise ApiError(
                    "INVALID_QUERY_PARAM",
                    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                    f"El parámetro '{name}' debe ser un número entero.",
                    status.HTTP_400_BAD_REQUEST,
                ) from exc
            if maximum is not None and value > maximum:
                raise ApiError(
                    "INVALID_QUERY_PARAM",
                    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                    f"El parámetro '{name}' no puede pasar de {maximum}.",
                    status.HTTP_400_BAD_REQUEST,
                )
            return value
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


def _evaluation_param(request):
    """``evaluacion`` (BK-3): ``pendiente`` o ``aplicada``. Una palabra desconocida es un 400, no «sin resultados»."""
    raw = request.query_params.get("evaluacion")
    if not raw:
        return None
    if raw not in instructor_service.EVALUATION_FILTERS:
        raise ApiError(
            "INVALID_QUERY_PARAM",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            f"El parámetro 'evaluacion' debe ser uno de: {', '.join(instructor_service.EVALUATION_FILTERS)}.",
            status.HTTP_400_BAD_REQUEST,
        )
    return raw


class InstructorAttemptsView(APIView):
    permission_classes = [policy_permission("attempt", "review")]

    @extend_schema(
        parameters=[
            OpenApiParameter("grupoId", int, description="Solo los estudiantes de este grupo (el docente debe serlo)."),
            OpenApiParameter("estudianteId", int, description="Solo los intentos de este estudiante, dentro del alcance."),
            OpenApiParameter("caseVersionId", int, description="Solo los intentos de esta versión de caso."),
            OpenApiParameter("estado", str, enum=AttemptStatus.values, description="Solo los intentos en este estado."),
            OpenApiParameter(
                "evaluacion", str, enum=list(instructor_service.EVALUATION_FILTERS),
                description="`pendiente`: los terminados que esperan la valoración del docente (una guardada a medias "
                "sigue pendiente). `aplicada`: los que ya tienen una valoración del docente concluida.",
            ),
            OpenApiParameter("page", int, description="Página, desde 1 y hasta 1000000 (más allá es un 400)."),
            OpenApiParameter("pageSize", int, description="Intentos por página (tope 200)."),
        ],
        responses={200: envelope_of(InstructorAttemptsListSerializer), **error_responses(400, 401, 403, 404)},
    )
    def get(self, request):
        grupo_id = _int_param(request, "grupoId", "groupId")
        estudiante_id = _int_param(request, "estudianteId", "studentId")
        case_version_id = _int_param(request, "caseVersionId")
        estado = _status_param(request)
        evaluacion = _evaluation_param(request)
        page = _int_param(request, "page", maximum=instructor_service.MAX_PAGE) or 1
        page_size = _int_param(request, "pageSize", "limit") or instructor_service.DEFAULT_PAGE_SIZE
        return api_ok(
            instructor_service.list_attempts(
                request.user,
                grupo_id=grupo_id,
                estudiante_id=estudiante_id,
                case_version_id=case_version_id,
                estado=estado,
                evaluacion=evaluacion,
                page=page,
                page_size=page_size,
            )
        )


class RecentAttemptsView(APIView):
    permission_classes = [policy_permission("attempt", "review")]

    @extend_schema(responses={200: envelope_of(RecentAttemptSerializer, many=True), **error_responses(401, 403)})
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
