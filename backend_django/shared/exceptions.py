"""DRF exception handler replicating Spring's ``GlobalExceptionHandler``.

Spring maps:
    EntityNotFoundException        -> 404, ex.message
    BadCredentialsException        -> 401, "Credenciales inválidas"
    AccessDeniedException          -> 403, "No tiene permisos para realizar esta acción"
    IllegalArgumentException       -> 400, ex.message
    MethodArgumentNotValidException-> 400, "field: msg, field2: msg2"
    Exception (uncaught)           -> 500, "Error interno del servidor"

All bodies use the ``{"success": false, "code": ..., "message": ...}`` envelope.
``code`` is stable (the client decides by it, never by the text); a domain error can
add its own fields at the root (``existingAttemptId``…), see ``ApiError``.
"""
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    MethodNotAllowed,
    NotAuthenticated,
    NotFound,
    PermissionDenied,
    Throttled,
    ValidationError,
)
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


class Conflict(APIException):
    """HTTP 409 — optimistic-lock / state conflict (Spring ResponseStatusException)."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "Conflicto"
    default_code = "conflict"
    api_code = "CONFLICT"


class ApiError(APIException):
    """Error de dominio con ``code`` estable (§2.7 del plan estructural).

    El cuerpo es ``{success: false, code, message, **extra}``: los campos extra
    (``existingAttemptId``, ``field``, ``nodeId``…) viajan en la raíz junto a
    ``message``. El estado HTTP por defecto es 400.
    """

    def __init__(self, code, message, status_code=status.HTTP_400_BAD_REQUEST, **extra):
        super().__init__(detail=message, code=code)
        self.status_code = status_code
        self.api_code = code
        self.extra = extra


def _code_for(exc):
    """Código estable del error: el declarado por el dominio o el que le toca a su clase."""
    explicit = getattr(exc, "api_code", None)
    if explicit:
        return explicit
    if isinstance(exc, ValidationError):
        return "VALIDATION_ERROR"
    if isinstance(exc, (PermissionDenied, DjangoPermissionDenied)):
        return "FORBIDDEN"
    if isinstance(exc, NotAuthenticated):
        return "UNAUTHENTICATED"
    if isinstance(exc, AuthenticationFailed):
        return "TOKEN_INVALID" if exc.get_codes() == "token_not_valid" else "INVALID_CREDENTIALS"
    if isinstance(exc, (NotFound, Http404)):
        return "NOT_FOUND"
    if isinstance(exc, Throttled):
        return "THROTTLED"
    if isinstance(exc, MethodNotAllowed):
        return "METHOD_NOT_ALLOWED"
    return str(getattr(exc, "default_code", "error")).upper()


def _flatten(detail, prefix=""):
    parts = []
    if isinstance(detail, dict):
        for field, value in detail.items():
            key = f"{prefix}{field}"
            if isinstance(value, (list, tuple)):
                for item in value:
                    if isinstance(item, (dict, list)):
                        parts.extend(_flatten(item, f"{key}."))
                    else:
                        parts.append(f"{key}: {item}")
            elif isinstance(value, dict):
                parts.extend(_flatten(value, f"{key}."))
            else:
                parts.append(f"{key}: {value}")
    elif isinstance(detail, (list, tuple)):
        for item in detail:
            parts.append(str(item))
    else:
        parts.append(str(detail))
    return parts


def custom_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)

    # Uncaught -> 500 "Error interno del servidor" (Spring handleGeneric).
    if response is None:
        return Response(
            {"success": False, "code": "INTERNAL_ERROR", "message": "Error interno del servidor"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Segundos que hay que esperar antes de reintentar (S1-2): el 429 siempre trae una espera de al menos uno.
    espera = int(exc.wait or 1) if isinstance(exc, Throttled) else None

    if isinstance(exc, ValidationError):
        message = ", ".join(_flatten(exc.detail))
    elif isinstance(exc, (PermissionDenied, DjangoPermissionDenied)):
        message = "No tiene permisos para realizar esta acción"
    elif isinstance(exc, AuthenticationFailed):
        message = "Credenciales inválidas"
    elif isinstance(exc, NotAuthenticated):
        message = "No autenticado"
    elif isinstance(exc, Http404):
        message = "Recurso no encontrado"
    elif isinstance(exc, Throttled):
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        message = f"Demasiados intentos. Espera {espera} s e inténtalo de nuevo."
    else:
        detail = None
        if isinstance(response.data, dict):
            detail = response.data.get("detail")
        message = str(detail) if detail is not None else str(exc)

    body = {"success": False, "code": _code_for(exc), "message": message}
    if isinstance(exc, ValidationError) and isinstance(exc.detail, dict) and exc.detail:
        # El primer campo que falló: el cliente lleva el foco ahí (§2.7, ``field?``).
        body["field"] = str(next(iter(exc.detail)))
    body.update(getattr(exc, "extra", None) or {})
    if espera is not None:
        body["retryAfter"] = espera
        response["Retry-After"] = str(espera)
    response.data = body
    return response
