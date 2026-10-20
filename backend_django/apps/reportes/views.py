"""Reportes endpoints (solo-simulador). Todo el controller es PROFESOR/ADMIN.
El export CSV devuelve bytes crudos (attachment), NO el envoltorio JSON."""
from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.views import APIView

from apps.simulation.services import audit_service
from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_ok

from . import services
from .contracts import StudentReportSerializer


def _long(value):
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# S4-1 · Cada lectura de datos de otras personas deja su fila DESPUÉS de salir bien (una negada no deja nada) y solo con
# ids: nunca nombres ni el contenido del reporte (``audit_service.CONTEXT_WHITELIST``).
class DashboardView(APIView):
    permission_classes = [policy_permission("analytics", "read")]

    def get(self, request):
        datos = services.get_dashboard(request.user)  # trae nombres de estudiantes
        audit_service.record("ANALYTICS_VIEWED", "DASHBOARD")
        return api_ok(datos)


class ReporteEstudianteView(APIView):
    """Reporte de un estudiante (C3): sus intentos con tiempos y cobertura «X de N»."""

    permission_classes = [policy_permission("analytics", "read")]

    @extend_schema(
        parameters=[
            OpenApiParameter("caseVersionId", int, description="Solo los intentos de esta versión de caso."),
            OpenApiParameter("limit", int, description="Cuántos intentos trae, los más recientes primero."),
        ],
        responses={200: envelope_of(StudentReportSerializer), **error_responses(401, 403, 404)},
    )
    def get(self, request, estudiante_id):
        case_version_id = _long(request.query_params.get("caseVersionId"))
        limit = _long(request.query_params.get("limit"))
        datos = services.generar_reporte_estudiante(estudiante_id, case_version_id, limit, request.user)
        audit_service.record(
            "REPORT_VIEWED", "USER", estudiante_id, {"studentId": estudiante_id, "caseVersionId": case_version_id}
        )
        return api_ok(datos)


class ReporteGrupoView(APIView):
    permission_classes = [policy_permission("analytics", "read")]

    def get(self, request, grupo_id):
        case_version_id = _long(request.query_params.get("caseVersionId"))
        datos = services.generar_reporte_grupo(grupo_id, case_version_id, request.user)
        audit_service.record(
            "REPORT_VIEWED", "GRUPO", grupo_id, {"groupId": grupo_id, "caseVersionId": case_version_id}
        )
        return api_ok(datos)


class ReporteGrupoExportView(APIView):
    permission_classes = [policy_permission("analytics", "read")]

    @extend_schema(
        parameters=[OpenApiParameter("caseVersionId", int, description="Solo los intentos de esta versión de caso.")],
        responses={(200, "text/csv"): OpenApiTypes.STR},
    )
    def get(self, request, grupo_id):
        case_version_id = _long(request.query_params.get("caseVersionId"))
        csv = services.exportar_csv(grupo_id, case_version_id, request.user)
        # La exportación es SU evento (``reporte.exportar``): no se anota, además, como lectura del reporte en pantalla.
        audit_service.record(
            "REPORT_EXPORTED", "GRUPO", grupo_id, {"groupId": grupo_id, "caseVersionId": case_version_id}
        )
        response = HttpResponse(csv.encode("utf-8"), content_type="text/csv;charset=UTF-8")
        response["Content-Disposition"] = (
            f'attachment; filename="reporte-grupo-{grupo_id}.csv"'
        )
        return response
