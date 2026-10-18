"""Audit trail — Django equivalent of Spring's @Auditable AOP aspect
(infrastructure/audit/{Auditable,SimulationAuditAspect,AuditLogAdapter}).

Spring intercepts @Auditable service methods and, AFTER the method returns
successfully, writes an audit_logs row with actor (SecurityContext), resource id
(method arg), and IP/User-Agent (request). Here the same is done with:
  * a thread-local bound to the current request by ``AuditContextMiddleware``
    (DRF writes the authenticated user back onto the Django request, so by the
    time a service runs ``request.user`` is the actor);
  * an ``@auditable`` decorator placed OUTSIDE ``@transaction.atomic`` so the
    audit write happens after the business transaction (≈ Spring REQUIRES_NEW).

Audit must NEVER break the business operation: every failure here is caught and
logged. Retention is configurable via ``settings.AUDIT_RETENTION_DAYS`` with a
minimum of 12 months (360 days, E5-7 / RNF-007).
"""
import functools
import json
import logging
import threading
from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone

from shared.client_ip import client_ip

from ..models import AuditLog, CaseReview

logger = logging.getLogger(__name__)

MIN_RETENTION_DAYS = 360  # Spring: RETENTION_MONTHS(12) * 30 days (≥ 12 meses, RNF-007)
RETENTION_DAYS = MIN_RETENTION_DAYS
MAX_USER_AGENT_LEN = 500
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
MAX_PAGE = 1_000_000  # más allá, el OFFSET se sale del rango de la base y el listado cae con un 500

#: Taxonomía canónica ``entidad.verbo`` (E5-7, §A16, C15).
AUDIT_TAXONOMY: dict[str, str] = {
    "ATTEMPT_STARTED": "intento.iniciar",
    "DECISION_SELECTED": "intento.decidir",
    "REFLECTION_SAVED": "intento.reflexionar",
    "SAFE_EXIT_REQUESTED": "intento.pausar",
    "ATTEMPT_RESUMED": "intento.reanudar",
    "ATTEMPT_REPLACED": "intento.reemplazar",
    "AI_ASSISTANT_QUERY": "asistente.consultar",
    "TRACE_VIEWED": "traza.leer",
    "RUBRIC_SAVED": "rubrica.evaluar",
    "ANALYTICS_VIEWED": "analitica.ver",
    "CASE_CREATED": "caso.crear",
    "CASE_IMPORTED": "caso.importar",
    "CASE_SUBMITTED": "caso.enviar_revision",
    "CASE_APPROVED": "caso.aprobar",
    "CASE_REJECTED": "caso.rechazar",
    "CASE_ARCHIVED": "caso.archivar",
    "CASE_CLONED": "caso.clonar",
    "ADMIN_PUBLISH_CASE": "caso.publicar",
    "ADMIN_CLONE_VERSION": "caso.clonar",
    "ADMIN_CHECKLIST_UPDATE": "caso.actualizar_checklist",
    "ADMIN_UPDATE_BRIEF": "caso.actualizar_ficha",
    "ADMIN_SAVE_WORLD": "mundo.guardar",
    "ADMIN_CREATE_NODE": "nodo.crear",
    "ADMIN_REORDER_NODES": "nodo.reordenar",
    "ADMIN_UPDATE_NODE": "nodo.actualizar",
    "ADMIN_DELETE_NODE": "nodo.eliminar",
    "ADMIN_CREATE_DECISION": "decision.crear",
    "ADMIN_UPDATE_DECISION": "decision.actualizar",
    "ADMIN_DELETE_DECISION": "decision.eliminar",
    "ADMIN_CREATE_MAP": "mapa.crear",
    "ADMIN_UPDATE_MAP": "mapa.actualizar",
    "ADMIN_DELETE_MAP": "mapa.eliminar",
    "ADMIN_CREATE_OBJECT": "objeto.crear",
    "ADMIN_UPDATE_OBJECT": "objeto.actualizar",
    "ADMIN_DELETE_OBJECT": "objeto.eliminar",
    "ADMIN_CREATE_DIALOGUE": "dialogo.crear",
    "ADMIN_UPDATE_DIALOGUE": "dialogo.actualizar",
    "ADMIN_DELETE_DIALOGUE": "dialogo.eliminar",
    "ADMIN_CREATE_TOOL": "herramienta.crear",
    "ADMIN_UPDATE_TOOL": "herramienta.actualizar",
    "ADMIN_DELETE_TOOL": "herramienta.eliminar",
    "ADMIN_CREATE_HINT": "pista.crear",
    "ADMIN_UPDATE_HINT": "pista.actualizar",
    "ADMIN_DELETE_HINT": "pista.eliminar",
    "ADMIN_CREATE_CHARACTER": "personaje.crear",
    "ADMIN_UPDATE_CHARACTER": "personaje.actualizar",
    "ADMIN_DELETE_CHARACTER": "personaje.eliminar",
    "MEMBERSHIP_INVITED": "grupo.invitar",
    "MEMBERSHIP_ACCEPTED": "grupo.aceptar",
    "MEMBERSHIP_DECLINED": "grupo.rechazar",
    "MEMBERSHIP_LEFT": "grupo.salir",
    "MEMBERSHIP_REMOVED": "grupo.retirar",
    "STUDENTS_IMPORTED": "grupo.importar",
    "GROUP_CREATED": "grupo.crear",
    "GROUP_UPDATED": "grupo.actualizar",
    "GROUP_DELETED": "grupo.eliminar",
    "ASSIGNMENT_CREATED": "asignacion.crear",
    "ASSIGNMENT_UPDATED": "asignacion.actualizar",
    "ASSIGNMENT_REMOVED": "asignacion.eliminar",
    "USER_APPROVED": "usuario.aprobar",
    "PASSWORD_CHANGED": "usuario.cambiar_clave",
    "SESSIONS_REVOKED": "sesion.revocar",
}

_local = threading.local()


def retention_days() -> int:
    """Días de retención de auditoría (mínimo 360 días = 12 meses, RNF-007)."""
    configured = getattr(settings, "AUDIT_RETENTION_DAYS", MIN_RETENTION_DAYS)
    try:
        return max(MIN_RETENTION_DAYS, int(configured))
    except (TypeError, ValueError):
        return MIN_RETENTION_DAYS


def canonical_action(action: str | None) -> str:
    """Devuelve la etiqueta canónica ``entidad.verbo`` para una acción de auditoría."""
    if not action:
        return "sistema.desconocido"
    if "." in action:
        return action
    return AUDIT_TAXONOMY.get(action, action.lower().replace("_", "."))


def matching_actions(action_filter: str) -> list[str]:
    """Expande un filtro de acción (``entidad.verbo`` o código legado) a todas sus variantes."""
    candidates = {action_filter}
    if action_filter in AUDIT_TAXONOMY:
        candidates.add(AUDIT_TAXONOMY[action_filter])
    for raw_code, taxonomy_code in AUDIT_TAXONOMY.items():
        if taxonomy_code == action_filter:
            candidates.add(raw_code)
    return sorted(candidates)


# ─── request binding (set by AuditContextMiddleware) ─────────────────────────
def bind_request(request):
    _local.request = request


def clear_request():
    _local.request = None


def _current_request():
    return getattr(_local, "request", None)


# ─── actor / http context resolution ─────────────────────────────────────────
def _resolve_actor():
    request = _current_request()
    user = getattr(request, "user", None) if request is not None else None
    if user is not None and getattr(user, "is_authenticated", False):
        actor_id = str(user.id) if getattr(user, "id", None) is not None else None
        actor_role = getattr(user, "role", None) or "SYSTEM"
        return actor_id, actor_role
    return None, "ANONYMOUS"


def current_actor_id():
    """El id (entero) de quien hace la petición en curso, o ``None`` fuera de una petición."""
    actor_id, _ = _resolve_actor()
    try:
        return int(actor_id) if actor_id is not None else None
    except (TypeError, ValueError):
        return None


def _client_ip(request):
    # None (NULL en ``ip_address``) cuando no hay IP: la cadena vacía no es una dirección.
    return client_ip(request) or None


# ─── persistence (Spring AuditLogAdapter.append) ─────────────────────────────
def append(actor_id, actor_role, action, resource_type, resource_id,
           context, ip_address, user_agent, occurred_at):
    try:
        actor_fk = None
        if actor_id is not None:
            try:
                actor_fk = int(actor_id)
            except (TypeError, ValueError):
                actor_fk = None  # e.g. a UUID actor — keep FK null
        occurred = occurred_at or timezone.now()
        payload = dict(context) if isinstance(context, dict) else {}
        payload.setdefault("taxonomy", canonical_action(action))
        AuditLog.objects.create(
            actor_id=actor_fk,
            actor_role=actor_role,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            context_json=json.dumps(payload),
            ip_address=ip_address,
            user_agent=user_agent[:MAX_USER_AGENT_LEN] if user_agent else None,
            occurred_at=occurred,
            retention_until=occurred + timedelta(days=retention_days()),
        )
    except Exception as ex:  # pragma: no cover - audit must never propagate
        logger.warning("Audit persistence failed [action=%s]: %s", action, ex)


# ─── @auditable decorator (Spring SimulationAuditAspect) ─────────────────────
def arg(args, kwargs, index, name):
    """El argumento ``name`` de una llamada, venga posicional (``index``) o por nombre."""
    if name in kwargs:
        return kwargs[name]
    return args[index] if index < len(args) else None


def auditable(action, resource_type="", resource_id_param_index=0, context=None):
    """Registra ``action`` DESPUÉS de que la operación termine bien.

    ``context`` (opcional) es ``(args, kwargs, result) -> dict``: lo que devuelve se suma al
    contexto de la fila (p. ej. los ids de las cuentas aprobadas en un lote). Si falla, la fila se
    escribe sin esos datos: la auditoría nunca rompe la operación.
    """

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            result = func(*args, **kwargs)  # always run the operation first
            try:
                extra = None
                if context is not None:
                    try:
                        extra = context(args, kwargs, result)
                    except Exception as ex:  # noqa: BLE001
                        logger.warning("Audit context error [action=%s]: %s", action, ex)
                _write_audit(func, action, resource_type, resource_id_param_index, args, extra)
            except Exception as ex:  # audit errors never reach the caller
                logger.warning("Audit aspect error [action=%s]: %s", action, ex)
            return result

        return wrapper

    return decorator


def _write_audit(func, action, resource_type, idx, args, extra=None):
    actor_id, actor_role = _resolve_actor()

    resource_id = None
    if idx >= 0 and args and idx < len(args) and args[idx] is not None:
        resource_id = str(args[idx])

    request = _current_request()
    ip_address = _client_ip(request) if request is not None else None
    user_agent = request.META.get("HTTP_USER_AGENT") if request is not None else None

    context = {
        "method": func.__name__,
        "class": func.__module__.rsplit(".", 1)[-1],
        "taxonomy": canonical_action(action),
    }
    if extra:
        context.update(extra)

    append(
        actor_id,
        actor_role,
        action,
        resource_type or None,
        resource_id,
        context,
        ip_address,
        user_agent,
        timezone.now(),
    )


# ─── Consulta de auditoría y alarma del sello (E5-7 ⇢ C15) ────────────────────
def review_quality_summary() -> dict:
    """Visibilidad para el ADMIN de devoluciones por CONTENIDO frente a FORMA (consejo §9.1-B).

    Si tras al menos 5 revisiones decididas ninguna devolución es por ``CONTENIDO`` (o tras 30
    revisiones con devoluciones más del 30 % del total sigue sin participación sustantiva de
    contenido), se activa ``rubberStampAlarm = True``.
    """
    decided = CaseReview.objects.filter(decision__isnull=False)
    decided_count = decided.count()
    approved_count = decided.filter(decision="APPROVED").count()
    rejected = decided.filter(decision="REJECTED")
    rejected_total = rejected.count()
    rejected_content = rejected.filter(reason="CONTENIDO").count()
    rejected_form = rejected.filter(reason="FORMA").count()

    content_rate = round(rejected_content / decided_count, 4) if decided_count else 0.0
    form_rate = round(rejected_form / decided_count, 4) if decided_count else 0.0
    alarm = bool(
        (decided_count >= 5 and rejected_content == 0)
        or (decided_count >= 30 and rejected_total > 0 and (rejected_content / rejected_total) < 0.30)
    )
    return {
        "decidedReviews": decided_count,
        "approved": approved_count,
        "rejectedTotal": rejected_total,
        "rejectedByContent": rejected_content,
        "rejectedByForm": rejected_form,
        "contentRejectionRate": content_rate,
        "formRejectionRate": form_rate,
        "rubberStampAlarm": alarm,
    }


#: Claves del contexto que son texto libre escrito por una persona. El asistente de IA ya no las guarda, pero las
#: filas anteriores pueden traerlas: la lectura de la auditoría nunca las devuelve.
HIDDEN_CONTEXT_KEYS = frozenset({"question"})


def _parse_context(raw_json: str | None) -> dict:
    if not raw_json:
        return {}
    try:
        parsed = json.loads(raw_json)
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def list_audit_logs(
    *,
    actor_id: int | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    from_dt: datetime | None = None,
    to_dt: datetime | None = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> dict:
    """Consulta paginada y filtrada de ``audit_logs`` para el ADMIN (C15, SIEP-RNF-02, RNF-007)."""
    qs = AuditLog.objects.all()
    if actor_id is not None:
        qs = qs.filter(actor_id=actor_id)
    if action:
        qs = qs.filter(action__in=matching_actions(action.strip()))
    if resource_type:
        qs = qs.filter(resource_type=resource_type.strip())
    if from_dt is not None:
        qs = qs.filter(occurred_at__gte=from_dt)
    if to_dt is not None:
        qs = qs.filter(occurred_at__lte=to_dt)

    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    total = qs.count()
    offset = (page - 1) * page_size
    rows = list(qs.order_by("-occurred_at", "-id")[offset : offset + page_size])

    items = []
    for row in rows:
        ctx = {k: v for k, v in _parse_context(row.context_json).items() if k not in HIDDEN_CONTEXT_KEYS}
        items.append({
            "id": row.id,
            "actorId": row.actor_id,
            "actorRole": row.actor_role,
            "action": row.action,
            "taxonomy": ctx.get("taxonomy") or canonical_action(row.action),
            "resourceType": row.resource_type,
            "resourceId": row.resource_id,
            "context": ctx,
            "ipAddress": row.ip_address,
            "userAgent": row.user_agent,
            "occurredAt": row.occurred_at.isoformat() if row.occurred_at else None,
            "retentionUntil": row.retention_until.isoformat() if row.retention_until else None,
        })

    return {
        "items": items,
        "page": page,
        "pageSize": page_size,
        "coverage": {"shown": len(items), "total": total},
        "retentionDays": retention_days(),
        "reviewQuality": review_quality_summary(),
    }
