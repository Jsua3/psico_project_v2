"""Permisos de DRF: la puerta de rol de cada vista sale de la matriz de políticas.

``policy_permission(recurso, acción)`` genera la clase a partir de ``shared.policies.MATRIX``:
una vista nunca decide por su cuenta quién entra. Las decisiones sobre un objeto concreto
(el dueño, el alcance) las toma el servicio con ``shared.policies.can``.

La regla de arquitectura ``permisos-por-politica`` prohíbe declarar en una vista una clase
de rol suelta: toda puerta sale de aquí.
"""
from rest_framework.permissions import BasePermission

from . import policies


class _PolicyPermission(BasePermission):
    policy: tuple[str, str] = ("", "")
    roles: frozenset = frozenset()

    def has_permission(self, request, view):
        return policies.has_role(request.user, *self.roles)


def policy_permission(resource: str, action: str, *, also: tuple[str, str] | None = None):
    """Clase de permiso que admite a los roles con algún alcance sobre ``(resource, action)``.

    ``also`` suma los roles de una segunda política: la puerta de las rutas que sirven a dos políticas del mismo recurso (el
    juego de un intento lo usan su estudiante, por ``("attempt", "play")``, y la docente que ensaya su borrador, por
    ``("attempt", "rehearse")``). Es solo la puerta de rol: quién entra a cuál intento lo decide el servicio con
    ``shared.policies.can``.
    """
    roles = policies.allowed_roles(resource, action)
    if also is not None:
        roles = roles | policies.allowed_roles(*also)
    return type(
        f"Policy[{resource}.{action}{'+' + '.'.join(also) if also else ''}]",
        (_PolicyPermission,),
        {"policy": (resource, action), "also": also, "roles": roles},
    )
