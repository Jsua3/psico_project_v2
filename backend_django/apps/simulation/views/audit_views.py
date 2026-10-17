"""Vista administrativa de auditoría (E5-7 ⇢ C15: GET /api/admin/audit).

Solo ADMIN (``policy_permission("audit", "read")``). Permite filtrar por ``actorId``,
``action`` (código ``entidad.verbo`` o legado), ``resourceType``, ``from`` y ``to``
(ISO 8601), con paginación y resumen de calidad de revisiones (``CONTENIDO`` vs ``FORMA``).
"""
from datetime import datetime

from rest_framework import status
from rest_framework.views import APIView

from apps.simulation.services import audit_service
from shared.exceptions import ApiError
from shared.permissions import policy_permission
from shared.response import api_ok


def _parse_int(request, name):
    raw = request.query_params.get(name)
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise ApiError(
            "INVALID_QUERY_PARAM",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            f"El parámetro '{name}' debe ser un número entero.",
            status.HTTP_400_BAD_REQUEST,
        ) from exc


def _parse_dt(request, name):
    raw = request.query_params.get(name)
    if raw is None or raw == "":
        return None
    try:
        val = datetime.fromisoformat(raw.strip().replace("Z", "+00:00"))
        return val.replace(tzinfo=None) if val.tzinfo is not None else val
    except (TypeError, ValueError) as exc:
        raise ApiError(
            "INVALID_QUERY_PARAM",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            f"El parámetro '{name}' debe ser una fecha ISO 8601 válida.",
            status.HTTP_400_BAD_REQUEST,
        ) from exc


class AdminAuditListView(APIView):
    permission_classes = [policy_permission("audit", "read")]

    def get(self, request):
        actor_id = _parse_int(request, "actorId")
        action = request.query_params.get("action")
        resource_type = request.query_params.get("resourceType")
        from_dt = _parse_dt(request, "from")
        to_dt = _parse_dt(request, "to")
        page = _parse_int(request, "page") or 1
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
