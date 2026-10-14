"""Permisos de DRF: la puerta de rol de cada vista sale de la matriz de políticas.

``policy_permission(recurso, acción)`` genera la clase a partir de ``shared.policies.MATRIX``:
una vista nunca decide por su cuenta quién entra. Las decisiones sobre un objeto concreto
(el dueño, el alcance) las toma el servicio con ``shared.policies.can``.

Las clases ``IsAdmin``, ``IsProfesor`` e ``IsProfesorOrAdmin`` son las de rol que aún usan
las vistas de autoría; E2-4 las reemplaza por política y añade la regla de arquitectura que
prohíbe volver a declararlas.
"""
from rest_framework.permissions import BasePermission

from . import policies


class _PolicyPermission(BasePermission):
    policy: tuple[str, str] = ("", "")
    roles: frozenset = frozenset()

    def has_permission(self, request, view):
        return policies.has_role(request.user, *self.roles)


def policy_permission(resource: str, action: str):
    """Clase de permiso que admite a los roles con algún alcance sobre ``(resource, action)``."""
    return type(
        f"Policy[{resource}.{action}]",
        (_PolicyPermission,),
        {"policy": (resource, action), "roles": policies.allowed_roles(resource, action)},
    )


def _has_role(request, *roles):
    return policies.has_role(request.user, *roles)


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return _has_role(request, "ADMIN")


class IsProfesor(BasePermission):
    def has_permission(self, request, view):
        return _has_role(request, "PROFESOR")


class IsProfesorOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return _has_role(request, "PROFESOR", "ADMIN")

