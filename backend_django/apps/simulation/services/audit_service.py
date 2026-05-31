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
logged. Retention is 12 months (occurred_at + 360 days), matching Spring.
"""
import functools
import json
import logging
import threading
from datetime import timedelta

from django.utils import timezone

from ..models import AuditLog

logger = logging.getLogger(__name__)

RETENTION_DAYS = 360  # Spring: RETENTION_MONTHS(12) * 30 days
MAX_USER_AGENT_LEN = 500

_local = threading.local()


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


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded and forwarded.strip():
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


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
        AuditLog.objects.create(
            actor_id=actor_fk,
            actor_role=actor_role,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            context_json=json.dumps(context if context is not None else {}),
            ip_address=ip_address,
            user_agent=user_agent[:MAX_USER_AGENT_LEN] if user_agent else None,
            occurred_at=occurred,
            retention_until=occurred + timedelta(days=RETENTION_DAYS),
        )
    except Exception as ex:  # pragma: no cover - audit must never propagate
        logger.warning("Audit persistence failed [action=%s]: %s", action, ex)


# ─── @auditable decorator (Spring SimulationAuditAspect) ─────────────────────
def auditable(action, resource_type="", resource_id_param_index=0):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            result = func(*args, **kwargs)  # always run the operation first
            try:
                _write_audit(func, action, resource_type, resource_id_param_index, args)
            except Exception as ex:  # audit errors never reach the caller
                logger.warning("Audit aspect error [action=%s]: %s", action, ex)
            return result

        return wrapper

    return decorator


def _write_audit(func, action, resource_type, idx, args):
    actor_id, actor_role = _resolve_actor()

    resource_id = None
    if idx >= 0 and args and idx < len(args) and args[idx] is not None:
        resource_id = str(args[idx])

    request = _current_request()
    ip_address = _client_ip(request) if request is not None else None
    user_agent = request.META.get("HTTP_USER_AGENT") if request is not None else None

    context = {"method": func.__name__, "class": func.__module__.rsplit(".", 1)[-1]}

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
