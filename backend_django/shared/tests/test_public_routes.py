"""Las rutas públicas de la API son exactamente las declaradas (E2-1, RNF-002, LS-6).

Se recorre el ``urlconf`` real: una vista que se declare ``AllowAny`` (o sin permisos) y no
esté en esta lista hace fallar la prueba. La regla de arquitectura de E0 (``allowany-solo-
publicas``) vigila el código; esta vigila el resultado enrutado.
"""
import pytest
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.permissions import AllowAny

pytestmark = pytest.mark.req("RNF-002")

#: Cuatro rutas de autenticación pública + la salud del servicio (C11, E0-3).
PUBLIC_API_ROUTES = {
    "api/health",
    "api/auth/login",
    "api/auth/google",
    "api/auth/google/config",
    "api/auth/access-request",
}


def _routes(patterns, prefix=""):
    for pattern in patterns:
        if isinstance(pattern, URLResolver):
            yield from _routes(pattern.url_patterns, prefix + str(pattern.pattern))
        elif isinstance(pattern, URLPattern):
            yield prefix + str(pattern.pattern), pattern.callback


def _is_public(callback):
    view_class = getattr(callback, "cls", None)
    if view_class is None:  # vista de función de Django puro (p. ej. /api/health)
        return True
    permissions = list(getattr(view_class, "permission_classes", []))
    return not permissions or any(issubclass(p, AllowAny) for p in permissions)


def test_public_api_routes_are_exactly_the_declared_ones():
    public = {
        route.rstrip("/") for route, callback in _routes(get_resolver().url_patterns)
        if route.startswith("api/") and _is_public(callback)
    }
    assert public == PUBLIC_API_ROUTES


def test_every_private_route_requires_authentication_by_default():
    """Toda ruta de ``api/`` que no es pública hereda o declara una clase que exige sesión."""
    for route, callback in _routes(get_resolver().url_patterns):
        if not route.startswith("api/") or _is_public(callback):
            continue
        assert callback.cls.permission_classes, route
