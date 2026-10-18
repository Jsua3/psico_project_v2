"""Inventario de superficie del servidor (plan 03, S0-2).

Recorre el ``urlconf`` real y da, por ruta y método HTTP, quién puede llamarla (``exposure``), qué
cuerpo admite (``body``) y los campos que llenan S1-2 (``throttle``) y S4-1 (``audit``), hoy vacíos.
``shared/surface-inventory.json`` es la evidencia versionada de ese recorrido: si aparece una ruta
nueva o cambia una exposición, ``shared/tests/test_surface_inventory.py`` falla hasta que se regenere
con ``python -m shared.surface --write`` (desde ``backend_django/``).

Las rutas públicas y su motivo viven aquí: son la única fuente de ``test_public_routes.py``.
"""
import json
import os
import sys
from pathlib import Path

if __name__ == "__main__":
    # ``python -m shared.surface``: DRF lee sus ajustes al cargarse (``APIView``), así que Django se
    # configura antes de importarlo. Dentro de pytest ya lo configura ``pytest.ini``.
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "psychosim.settings.base")
    import django

    django.setup()

from django.contrib.auth.models import AnonymousUser  # noqa: E402
from django.test import RequestFactory  # noqa: E402
from django.urls import URLPattern, URLResolver, get_resolver  # noqa: E402
from rest_framework.parsers import MultiPartParser  # noqa: E402
from rest_framework.permissions import IsAuthenticated  # noqa: E402
from rest_framework.views import APIView  # noqa: E402

VERSION = 1
HTTP_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")
PUBLIC = "public"
AUTHENTICATED = "authenticated"

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
PUBLIC_ROUTE_REASONS: dict[str, str] = {
    "api/health": "sondeo de salud de la plataforma",
    "api/auth/login": "entrar",
    "api/auth/google": "entrar con una cuenta de Google",
    "api/auth/google/config": "configuración pública del acceso con Google",
    "api/auth/access-request": "pedir una cuenta, que aprueba el ADMIN",
    "schema": "esquema OpenAPI, público hasta el plan 03 (seguridad)",
    "swagger-ui.html": "visor del esquema OpenAPI, público hasta el plan 03 (seguridad)",
    "^(?!api/|schema/|swagger-ui|django-static/).*$": "comodín que sirve la SPA de Angular",
}


def _root_patterns():
    return get_resolver().url_patterns


def _iter_routes(patterns, prefix=""):
    for pattern in patterns:
        if isinstance(pattern, URLResolver):
            yield from _iter_routes(pattern.url_patterns, prefix + str(pattern.pattern))
        elif isinstance(pattern, URLPattern):
            yield prefix + str(pattern.pattern), pattern.callback


def _methods(view_class):
    """Métodos HTTP que implementa la vista. Una vista de función de Django puro admite solo GET."""
    if view_class is None:
        return ("GET",)
    return tuple(method for method in HTTP_METHODS if hasattr(view_class, method.lower()))


def _permissions_for(view_class, method):
    """La vista y los permisos que DRF le aplicaría a ``method`` (``get_permissions`` puede depender de él)."""
    if view_class is None:  # vista de función de Django puro: DRF no le pone permisos
        return None, []
    view = view_class()
    view.setup(RequestFactory().generic(method, "/"))
    return view, view.get_permissions()


def _admits_anonymous(permission, view):
    """¿DRF deja pasar una petición sin sesión por este permiso? Es la misma comprobación que hace DRF."""
    request = RequestFactory().get("/")
    request.user = AnonymousUser()
    return bool(permission.has_permission(request, view))


def _exposure(view, permissions):
    """``public`` si DRF deja pasar una petición anónima por todos los permisos de la vista."""
    if not permissions or all(_admits_anonymous(permission, view) for permission in permissions):
        return PUBLIC
    policy_permissions = [permission for permission in permissions if hasattr(permission, "policy")]
    if not policy_permissions:
        if all(isinstance(permission, IsAuthenticated) for permission in permissions):
            return AUTHENTICATED
        nombres = ", ".join(sorted(type(permission).__name__ for permission in permissions))
        raise ValueError(f"permiso sin clasificar en el inventario de superficie: {nombres}")
    roles = frozenset.intersection(*(frozenset(permission.roles) for permission in policy_permissions))
    if not roles:
        raise ValueError("una vista combina políticas que no tienen ningún rol en común")
    return "role:" + ",".join(sorted(role.upper() for role in roles))


def _has_own_parsers(view_class):
    """¿La vista (o una base suya, antes de ``APIView``) declara ``parser_classes`` propios?"""
    for klass in view_class.__mro__:
        if klass is APIView:
            return False
        if "parser_classes" in vars(klass):
            return True
    return False


def _body(method, view_class):
    if method in ("GET", "DELETE"):
        return "none"
    # Todas las vistas admiten multipart por el ajuste por defecto; es de importación de archivos
    # solo la que lo declara en sus propios ``parser_classes`` (hoy, la importación de grupos).
    if view_class is not None and _has_own_parsers(view_class) and any(
        issubclass(parser, MultiPartParser) for parser in view_class.parser_classes
    ):
        return "multipart-import"
    return "json-small"


def collect_routes(patterns=None):
    """Una fila por ruta (sin barra final) y método HTTP, ordenadas por (ruta, método)."""
    rows = {}
    for raw_route, callback in _iter_routes(_root_patterns() if patterns is None else patterns):
        route = raw_route.rstrip("/")
        view_class = getattr(callback, "cls", None)
        for method in _methods(view_class):
            view, permissions = _permissions_for(view_class, method)
            row = {
                "route": route,
                "method": method,
                "exposure": _exposure(view, permissions),
                "body": _body(method, view_class),
                "throttle": None,  # S1-2 lo llena
                "audit": None,  # S4-1 lo llena
            }
            key = (route, method)
            # ``…/import`` y ``…/import/`` son una sola fila sin barra final: si difieren, es un error.
            previa = rows.get(key)
            if previa is not None and previa != row:
                raise ValueError(f"{method} {route} se clasifica de dos maneras distintas")
            rows[key] = row
    return [rows[key] for key in sorted(rows)]


def public_routes(patterns=None):
    """Las rutas (sin barra final) con alguna fila pública: lo que comparan las pruebas de rutas públicas."""
    return {row["route"] for row in collect_routes(patterns) if row["exposure"] == PUBLIC}


def render_inventory():
    """El inventario como documento determinista: es la evidencia versionada de la superficie."""
    return {"version": VERSION, "routes": collect_routes()}


def _main(argv):
    document = json.dumps(render_inventory(), ensure_ascii=False, indent=2) + "\n"
    if "--write" in argv:
        target = Path(__file__).with_name("surface-inventory.json")
        target.write_text(document, encoding="utf-8", newline="\n")
        print(f"escrito {target}")
    else:
        sys.stdout.write(document)
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
