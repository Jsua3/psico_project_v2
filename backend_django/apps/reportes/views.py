"""Reportes endpoints (solo-simulador). Todo el controller es PROFESOR/ADMIN.
El export CSV devuelve bytes crudos (attachment), NO el envoltorio JSON."""
from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.views import APIView

from shared.exceptions import ApiError
from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_ok

from . import services
from .contracts import LearningAnalyticsSerializer

#: El mayor id que cabe en una columna entera de la base: uno más grande no puede existir.
MAX_ID = 2**31 - 1


def _long(value):
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _strict_id(request, name):
    """Un id de la consulta: entero positivo o ausente. Uno mal escrito no se ignora (ampliaría el alcance sin avisar)."""
    raw = request.query_params.get(name)
    if raw is None or raw == "":
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = None
    if value is None or not 0 < value <= MAX_ID:
        raise ApiError(
            "INVALID_QUERY_PARAM",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            f"El parámetro '{name}' debe ser un número entero válido.",
            status.HTTP_400_BAD_REQUEST,
        )
    return value


class DashboardView(APIView):
    permission_classes = [policy_permission("analytics", "read")]

    def get(self, request):
        return api_ok(services.get_dashboard(request.user))


class ReporteEstudianteView(APIView):
    """Reporte de un estudiante (C3): sus intentos con tiempos y cobertura «X de N»."""

    permission_classes = [policy_permission("analytics", "read")]

    def get(self, request, estudiante_id):
        case_version_id = _long(request.query_params.get("caseVersionId"))
        limit = _long(request.query_params.get("limit"))
        return api_ok(
            services.generar_reporte_estudiante(estudiante_id, case_version_id, limit, request.user)
        )


class AnaliticasView(APIView):
    """C13 · Los agregados de aprendizaje de los grupos del docente (o de todos, para el ADMIN), con celda mínima."""

    permission_classes = [policy_permission("analytics", "read")]

    @extend_schema(
        parameters=[
            OpenApiParameter("grupoId", int, description="Solo los estudiantes de este grupo (debe ser del docente y estar activo)."),
            OpenApiParameter("caseVersionId", int, description="Solo los intentos de esta versión de caso."),
        ],
        responses={200: envelope_of(LearningAnalyticsSerializer), **error_responses(400, 401, 403, 404)},
    )
    def get(self, request):
        return api_ok(services.generar_analitica(
            _strict_id(request, "grupoId"), _strict_id(request, "caseVersionId"), request.user
        ))


class ReporteGrupoView(APIView):
    permission_classes = [policy_permission("analytics", "read")]

    def get(self, request, grupo_id):
        case_version_id = _long(request.query_params.get("caseVersionId"))
        return api_ok(services.generar_reporte_grupo(grupo_id, case_version_id, request.user))


class ReporteGrupoExportView(APIView):
    permission_classes = [policy_permission("analytics", "read")]

    @extend_schema(
        parameters=[OpenApiParameter("caseVersionId", int, description="Solo los intentos de esta versión de caso.")],
        responses={(200, "text/csv"): OpenApiTypes.STR},
    )
    def get(self, request, grupo_id):
        case_version_id = _long(request.query_params.get("caseVersionId"))
        csv = services.exportar_csv(grupo_id, case_version_id, request.user)
        response = HttpResponse(csv.encode("utf-8"), content_type="text/csv;charset=UTF-8")
        response["Content-Disposition"] = (
            f'attachment; filename="reporte-grupo-{grupo_id}.csv"'
        )
        return response
