"""Vista administrativa de auditoría (E5-7 ⇢ C15: GET /api/admin/audit).

Solo ADMIN (``policy_permission("audit", "read")``). Permite filtrar por ``actorId``,
``action`` (código ``entidad.verbo`` o legado), ``resourceType``, ``from`` y ``to``
(ISO 8601), con paginación y resumen de calidad de revisiones (``CONTENIDO`` vs ``FORMA``).
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from django.conf import settings
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.views import APIView

from apps.simulation.serializers.contracts import AuditListSerializer
from apps.simulation.services import audit_service
from shared.exceptions import ApiError
from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_ok


def _parse_int(request, name, maximum=None):
    raw = request.query_params.get(name)
    if raw is None or raw == "":
        return None
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


def _parse_dt(request, name):
    """Fecha ISO 8601 → hora local del servidor, que es como se guarda la auditoría (``USE_TZ=False``).

    Un instante con zona (``…Z``, ``…-05:00``) se CONVIERTE a ``settings.TIME_ZONE``; quitarle la zona sin
    convertir corría la ventana cinco horas. Una fecha sin zona ya es hora local.
    """
    raw = request.query_params.get(name)
    if raw is None or raw == "":
        return None
    try:
        val = datetime.fromisoformat(raw.strip().replace("Z", "+00:00"))
        if val.tzinfo is not None:
            val = val.astimezone(ZoneInfo(settings.TIME_ZONE)).replace(tzinfo=None)
        return val
    except (TypeError, ValueError, OverflowError) as exc:  # OverflowError: la conversión se sale del calendario
        raise ApiError(
            "INVALID_QUERY_PARAM",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            f"El parámetro '{name}' debe ser una fecha ISO 8601 válida.",
            status.HTTP_400_BAD_REQUEST,
        ) from exc


class AdminAuditListView(APIView):
    permission_classes = [policy_permission("audit", "read")]

    @extend_schema(
        parameters=[
            OpenApiParameter("actorId", int, description="Id del usuario que hizo la acción."),
            OpenApiParameter("action", str, description="Código `entidad.verbo` (o el legado) de la acción."),
            OpenApiParameter("resourceType", str, description="Tipo de recurso: `CASE`, `ATTEMPT`…"),
            OpenApiParameter(
                "from", OpenApiTypes.DATETIME,
                description="Desde (ISO 8601). Con zona se convierte a la hora local del servidor; sin zona ya lo es.",
            ),
            OpenApiParameter("to", OpenApiTypes.DATETIME, description="Hasta (ISO 8601); misma regla de zona que `from`."),
            OpenApiParameter("page", int, description="Página, desde 1 y hasta 1000000 (más allá es un 400)."),
            OpenApiParameter("pageSize", int, description="Filas por página (tope 200)."),
        ],
        responses={200: envelope_of(AuditListSerializer), **error_responses(400, 401, 403)},
    )
    def get(self, request):
        actor_id = _parse_int(request, "actorId")
        action = request.query_params.get("action")
        resource_type = request.query_params.get("resourceType")
        from_dt = _parse_dt(request, "from")
        to_dt = _parse_dt(request, "to")
        page = _parse_int(request, "page", maximum=audit_service.MAX_PAGE) or 1
        page_size = _parse_int(request, "pageSize") or audit_service.DEFAULT_PAGE_SIZE
        return api_ok(
            audit_service.list_audit_logs(
                actor_id=actor_id,
                action=action,
                resource_type=resource_type,
                from_dt=from_dt,
                to_dt=to_dt,
                page=page,
                page_size=page_size,
            )
        )
