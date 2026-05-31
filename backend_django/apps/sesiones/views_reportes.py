"""Reportes endpoints — mirrors Spring ReporteController.

Whole controller is ``@PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")``. The
CSV export returns raw bytes (Content-Disposition attachment), NOT the JSON
envelope, so it uses a plain Django ``HttpResponse``.
"""
from django.http import HttpResponse
from rest_framework.views import APIView

from shared.permissions import IsProfesorOrAdmin
from shared.response import api_ok

from . import services_reportes


def _long(value):
    """Parse an optional ``Long`` query param (``@RequestParam(required=false)``)."""
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class DashboardView(APIView):
    permission_classes = [IsProfesorOrAdmin]

    def get(self, request):
        return api_ok(services_reportes.get_dashboard())


class ReporteGrupoView(APIView):
    permission_classes = [IsProfesorOrAdmin]

    def get(self, request, grupo_id):
        caso_id = _long(request.query_params.get("casoId"))
        case_version_id = _long(request.query_params.get("caseVersionId"))
        return api_ok(
            services_reportes.generar_reporte_grupo(grupo_id, caso_id, case_version_id)
        )


class ReporteGrupoExportView(APIView):
    permission_classes = [IsProfesorOrAdmin]

    def get(self, request, grupo_id):
        caso_id = _long(request.query_params.get("casoId"))
        case_version_id = _long(request.query_params.get("caseVersionId"))
        csv = services_reportes.exportar_csv(grupo_id, caso_id, case_version_id)
        response = HttpResponse(
            csv.encode("utf-8"), content_type="text/csv;charset=UTF-8"
        )
        response["Content-Disposition"] = (
            f'attachment; filename="reporte-grupo-{grupo_id}.csv"'
        )
        return response
