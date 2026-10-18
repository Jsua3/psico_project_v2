"""Reglas de arquitectura del backend (E0-4, §2.2 y §3.2 del plan estructural).

Lee el código con ``ast`` (sin importarlo, sin Django) y devuelve violaciones con
un identificador estable ``ruta|detalle`` (sin números de línea) para que el
baseline sobreviva a ediciones que no tocan la violación.

Reglas (``Violation.rule``):

- ``casedef-puro``: ``apps/simulation/casedef/**`` no importa Django, DRF ni otras apps.
- ``runtime-sin-authoring``: ``apps/simulation/runtime/**`` no importa autoría.
- ``reportes-solo-lee``: ``apps/reportes/**`` no escribe (ORM, querysets guardados ni SQL crudo).
- ``policies-sin-servicios``: ``shared/policies.py`` no importa servicios ni vistas.
- ``dto-sin-servicios``: los ``*dtos*.py`` de ``serializers/`` no importan servicios.
- ``sql-sin-interpolacion``: sin ``.raw(``, ``.extra(``, ``RawSQL(`` y con ``execute*`` solo con SQL literal.
- ``serializers-sin-all``: sin ``fields = "__all__"`` ni ``exclude`` en serializadores.
- ``allowany-solo-publicas``: ``AllowAny`` (o ``permission_classes`` vacío) solo en ``PUBLIC_VIEWS``.
- ``uniones-por-orm``: sin SQL sobre ``grupo_estudiante`` ni ``case_assignments`` (E0-8, E3-1).
- ``permisos-por-politica``: en las vistas, ``permission_classes`` y ``get_permissions`` solo
  nombran ``policy_permission(...)`` (o una variable asignada de él) y ``AllowAny`` de las
  públicas; ninguna clase de rol suelta (E2-4: «ninguna vista decide por su cuenta»).
- ``publicacion-unica``: solo la compuerta (``services/authoring/gate.py``) escribe el estado
  ``PUBLISHED`` de una versión (E4-4: «lo que se ejecuta es lo que se validó»); leerlo o escribir
  otro estado no cuenta.
- ``ip-reenviada-solo-client-ip``: la cabecera ``X-Forwarded-For`` solo la lee ``shared/client_ip.py``
  (S1-1: la IP sale de contar los saltos de confianza; de la cabecera la falsifica el cliente).

Las evasiones que la revisión de la fase E0 encontró (imports relativos, alias y
atributos de ``AllowAny``, SQL en una variable, querysets guardados) están
cubiertas con una prueba sintética cada una en ``test_architecture.py``.
"""
from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[3]  # backend_django/
SCAN_ROOTS = ("apps", "shared")
#: Las únicas vistas que pueden declarar AllowAny (E2-1 las convierte en una tabla ejecutable).
PUBLIC_VIEWS = {
    "apps/users/views.py": {
        "LoginView",
        "GoogleConfigView",
        "GoogleLoginView",
        "AccessRequestCreateView",
    },
    # S2-3a · el informe de violaciones de la CSP lo envía el navegador sin sesión (RNF-002).
    "apps/security/csp_report.py": {"CspReportView"},
}
ORM_WRITES = {
    "save",
    "create",
    "delete",
    "bulk_create",
    "bulk_update",
    "get_or_create",
    "update_or_create",
}
QUERYSET_HINTS = {"objects", "filter", "exclude", "all", "get"}
WRITE_VERBS = ("INSERT", "UPDATE", "DELETE", "ALTER", "DROP", "TRUNCATE", "CREATE")
EXECUTE_NAMES = {"execute", "executemany"}
JOIN_TABLES = ("grupo_estudiante", "case_assignments")
#: El único módulo que escribe el estado ``PUBLISHED`` de una versión (E4-4).
PUBLISHING_GATE = "apps/simulation/services/authoring/gate.py"
#: Llamadas que escriben una fila: un ``status=PUBLISHED`` en ellas publica.
STATUS_WRITES = {"update", "create", "get_or_create", "update_or_create", "CaseVersion"}
#: Clases de rol que ya no se declaran en una vista: la puerta sale de ``policy_permission``.
ROLE_PERMISSION_CLASSES = {
    "IsAuthenticated", "IsAdminUser", "IsAdmin", "IsProfesor", "IsProfesorOrAdmin",
    "IsEstudianteOrAdmin", "IsEstudiante",
}


@dataclass(frozen=True)
class Violation:
    rule: str
    path: str
    detail: str

    @property
    def key(self) -> str:
        return f"{self.path}|{self.detail}"


def _source_files(root: Path):
    for scan_root in SCAN_ROOTS:
        base = root / scan_root
        if not base.exists():
            continue
        for path in sorted(base.rglob("*.py")):
            rel = path.relative_to(root).as_posix()
            if "/tests/" in rel or "/migrations/" in rel or rel.endswith("conftest.py"):
                continue
            yield rel, ast.parse(path.read_text(encoding="utf-8"), filename=rel)


def _package_of(rel: str) -> list[str]:
    parts = rel[: -len(".py")].split("/")
    return parts if parts[-1] == "__init__" and parts.pop() else parts[:-1]


def _imports(tree, rel):
    """Destinos importados, ya absolutos: ``from a.b import c`` es ``a.b.c`` (uno por alias)."""
    package = _package_of(rel)
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                base = package[: len(package) - (node.level - 1)] if node.level > 1 else list(package)
                module = ".".join(base + ([node.module] if node.module else []))
            else:
                module = node.module or ""
            if not module:
                continue
            for alias in node.names:
                found.add(module if alias.name == "*" else f"{module}.{alias.name}")
    return found


def _is_service_or_view(module: str) -> bool:
    parts = module.split(".")
    return len(parts) >= 3 and parts[0] == "apps" and parts[2] in {"services", "views"}


def _is_service(module: str) -> bool:
    parts = module.split(".")
    return len(parts) >= 3 and parts[0] == "apps" and parts[2] == "services"


def _import_rule(rel, tree, applies, rule, forbidden):
    if not applies(rel):
        return []
    return [
        Violation(rule, rel, f"importa {module}")
        for module in sorted(_imports(tree, rel))
        if forbidden(module)
    ]


def _receiver_names(node):
    names = []
    while isinstance(node, (ast.Attribute, ast.Call)):
        if isinstance(node, ast.Call):
            node = node.func
            continue
        names.append(node.attr)
        node = node.value
    return names


def _scopes(tree):
    """Módulo y cada función: los ámbitos en los que una variable guarda un queryset."""
    yield tree
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            yield node


def _walk_scope(scope):
    """Los nodos del ámbito, sin entrar en las funciones anidadas (tienen su propio ámbito)."""
    stack = list(ast.iter_child_nodes(scope))
    while stack:
        node = stack.pop()
        yield node
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            stack.extend(ast.iter_child_nodes(node))


def _first_sql_argument(call):
    if call.args:
        return call.args[0]
    for keyword in call.keywords:
        if keyword.arg == "sql":
            return keyword.value
    return None


def _call_name(call):
    func = call.func
    return func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")


def _reportes_solo_lee(rel, tree):
    if not rel.startswith("apps/reportes/"):
        return []
    found = set()
    for scope in _scopes(tree):
        queryset_names = set()
        nodes = list(_walk_scope(scope))
        for node in nodes:
            if isinstance(node, ast.Assign) and isinstance(node.value, (ast.Attribute, ast.Call)):
                if set(_receiver_names(node.value)) & QUERYSET_HINTS:
                    queryset_names.update(t.id for t in node.targets if isinstance(t, ast.Name))
        for node in nodes:
            if not isinstance(node, ast.Call):
                continue
            name = _call_name(node)
            if isinstance(node.func, ast.Attribute):
                receiver = node.func.value
                chain = set(_receiver_names(receiver))
                saved = isinstance(receiver, ast.Name) and receiver.id in queryset_names
                if name in ORM_WRITES or (name == "update" and (chain & QUERYSET_HINTS or saved)):
                    found.add(Violation("reportes-solo-lee", rel, f"escribe con .{name}("))
            if name in EXECUTE_NAMES:
                sql = _first_sql_argument(node)
                if isinstance(sql, ast.Constant) and isinstance(sql.value, str):
                    verb = sql.value.lstrip().split(None, 1)[0].upper() if sql.value.strip() else ""
                    if verb in WRITE_VERBS:
                        found.add(Violation("reportes-solo-lee", rel, f"escribe con SQL ({verb})"))
    return sorted(found, key=lambda v: v.detail)


def _sql_sin_interpolacion(rel, tree):
    found = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = _call_name(node)
        if name in {"raw", "extra", "RawSQL"}:
            found.append(Violation("sql-sin-interpolacion", rel, f"usa {name}("))
        elif name in EXECUTE_NAMES:
            sql = _first_sql_argument(node)
            literal = isinstance(sql, ast.Constant) and isinstance(sql.value, str)
            if sql is not None and not literal:
                found.append(Violation("sql-sin-interpolacion", rel, f"{name}( con SQL que no es un literal"))
    return found


def _is_all(value):
    if isinstance(value, ast.Constant):
        return value.value == "__all__"
    if isinstance(value, (ast.List, ast.Tuple)):
        return any(isinstance(e, ast.Constant) and e.value == "__all__" for e in value.elts)
    return False


def _serializers_sin_all(rel, tree):
    if "/serializers" not in rel:
        return []
    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            targets, value = node.targets, node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            targets, value = [node.target], node.value
        else:
            continue
        for target in targets:
            if not isinstance(target, ast.Name):
                continue
            if target.id == "exclude":
                found.append(Violation("serializers-sin-all", rel, "usa exclude"))
            if target.id == "fields" and _is_all(value):
                found.append(Violation("serializers-sin-all", rel, 'usa fields = "__all__"'))
    return found


def _allowany_aliases(tree):
    names = {"AllowAny"}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                if alias.name == "AllowAny":
                    names.add(alias.asname or alias.name)
    return names


def _mentions_allowany(node, names):
    return any(
        (isinstance(n, ast.Name) and n.id in names)
        or (isinstance(n, ast.Attribute) and n.attr == "AllowAny")
        for n in ast.walk(node)
    )


def _declares_empty_permissions(cls):
    for stmt in cls.body:
        value = None
        if isinstance(stmt, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "permission_classes" for t in stmt.targets
        ):
            value = stmt.value
        elif (
            isinstance(stmt, ast.AnnAssign)
            and isinstance(stmt.target, ast.Name)
            and stmt.target.id == "permission_classes"
        ):
            value = stmt.value
        if isinstance(value, (ast.List, ast.Tuple)) and not value.elts:
            return True
    return False


def _allowany_solo_publicas(rel, tree):
    allowed = PUBLIC_VIEWS.get(rel, set())
    names = _allowany_aliases(tree)
    found = []
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            continue
        if isinstance(node, ast.ClassDef):
            if node.name in allowed:
                continue
            if _mentions_allowany(node, names):
                found.append(Violation("allowany-solo-publicas", rel, f"{node.name} declara AllowAny"))
            elif _declares_empty_permissions(node):
                found.append(
                    Violation("allowany-solo-publicas", rel, f"{node.name} declara permission_classes vacío")
                )
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if _mentions_allowany(node, names):
                found.append(Violation("allowany-solo-publicas", rel, f"{node.name} usa AllowAny"))
        elif _mentions_allowany(node, names):
            found.append(Violation("allowany-solo-publicas", rel, "usa AllowAny a nivel de módulo"))
    return found


def _uniones_por_orm(rel, tree):
    """Las tablas de unión tienen modelo (``GrupoEstudiante``, ``CaseAssignment``): no se tocan con SQL."""
    if "/models" in rel:
        return []
    found = {
        Violation("uniones-por-orm", rel, f"SQL sobre {table}")
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
        for table in JOIN_TABLES
        # Solo cuenta como SQL «FROM/INTO/JOIN/UPDATE/TABLE <tabla>»: el nombre de una migración
        # (p. ej. 0002_grupo_case_version) contiene el de la tabla y no es una consulta.
        if re.search(rf"\b(from|into|join|update|table)\s+{table}\b", node.value, re.IGNORECASE)
    }
    return sorted(found, key=lambda v: v.detail)


def _is_view_module(rel: str) -> bool:
    return bool(re.fullmatch(r"apps/[^/]+/(views\.py|views/[^/]+\.py)", rel))


def _policy_variables(tree) -> set[str]:
    """Nombres de módulo asignados de ``policy_permission(...)`` (p. ej. ``_CAN_READ``)."""
    names: set[str] = set()
    for node in tree.body:
        if (
            isinstance(node, ast.Assign)
            and isinstance(node.value, ast.Call)
            and _call_name(node.value) == "policy_permission"
        ):
            names.update(t.id for t in node.targets if isinstance(t, ast.Name))
    return names


def _is_policy_class_ref(node, policy_names: set[str]) -> bool:
    """¿``node`` es una clase de permiso válida? ``policy_permission(...)``, su variable o AllowAny."""
    if isinstance(node, ast.Call) and _call_name(node) == "policy_permission":
        return True
    if isinstance(node, ast.IfExp):  # (_CAN_READ if GET else _CAN_EDIT)
        return _is_policy_class_ref(node.body, policy_names) and _is_policy_class_ref(node.orelse, policy_names)
    if isinstance(node, ast.Name):
        return node.id in policy_names or node.id == "AllowAny"
    return isinstance(node, ast.Attribute) and node.attr == "AllowAny"


def _is_policy_instance(node, policy_names: set[str]) -> bool:
    """Una instancia devuelta por ``get_permissions``: ``_CAN()`` o ``policy_permission(...)()``."""
    return isinstance(node, ast.Call) and _is_policy_class_ref(node.func, policy_names)


def _permisos_por_politica(rel, tree):
    if not _is_view_module(rel):
        return []
    policy_names = _policy_variables(tree)
    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            found += [
                Violation("permisos-por-politica", rel, f"importa {alias.name}")
                for alias in node.names
                if alias.name in ROLE_PERMISSION_CLASSES
            ]
    for cls in (n for n in ast.walk(tree) if isinstance(n, ast.ClassDef)):
        for stmt in cls.body:
            targets = []
            value = None
            if isinstance(stmt, ast.Assign):
                targets, value = stmt.targets, stmt.value
            elif isinstance(stmt, ast.AnnAssign) and stmt.value is not None:
                targets, value = [stmt.target], stmt.value
            if any(isinstance(t, ast.Name) and t.id == "permission_classes" for t in targets):
                elements = value.elts if isinstance(value, (ast.List, ast.Tuple)) else []
                if any(not _is_policy_class_ref(el, policy_names) for el in elements):
                    found.append(Violation(
                        "permisos-por-politica", rel, f"{cls.name} declara permission_classes sin policy_permission",
                    ))
            if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)) and stmt.name == "get_permissions":
                for ret in (n for n in ast.walk(stmt) if isinstance(n, ast.Return)):
                    elements = ret.value.elts if isinstance(ret.value, (ast.List, ast.Tuple)) else [ret.value]
                    if any(not _is_policy_instance(el, policy_names) for el in elements):
                        found.append(Violation(
                            "permisos-por-politica", rel, f"{cls.name}.get_permissions devuelve algo ajeno a la política",
                        ))
    return found


def _is_published(node):
    """¿El nodo es la constante ``PUBLISHED``, el literal ``"PUBLISHED"`` o un atributo ``….PUBLISHED``?"""
    if isinstance(node, ast.Constant):
        return node.value == "PUBLISHED"
    if isinstance(node, ast.Name):
        return node.id == "PUBLISHED"
    return isinstance(node, ast.Attribute) and node.attr == "PUBLISHED"


def _status_in_dict(node):
    return isinstance(node, ast.Dict) and any(
        isinstance(key, ast.Constant) and key.value == "status" and _is_published(value)
        for key, value in zip(node.keys, node.values)
    )


def _publicacion_unica(rel, tree):
    if rel == PUBLISHING_GATE:
        return []
    detail = "escribe el estado PUBLISHED (solo la compuerta publica)"
    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            targets, value = node.targets, node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            targets, value = [node.target], node.value
        elif isinstance(node, ast.Call):
            name = _call_name(node)
            writes = name in STATUS_WRITES and any(
                (keyword.arg == "status" and _is_published(keyword.value))
                or (keyword.arg == "defaults" and _status_in_dict(keyword.value))
                for keyword in node.keywords
            )
            if writes or (name == "_set_status" and any(_is_published(arg) for arg in node.args)):
                found.append(Violation("publicacion-unica", rel, detail))
            continue
        else:
            continue
        if _is_published(value) and any(isinstance(t, ast.Attribute) and t.attr == "status" for t in targets):
            found.append(Violation("publicacion-unica", rel, detail))
    return found


#: La única pieza que lee la cabecera ``X-Forwarded-For``: cuenta los saltos de confianza (S1-1).
CLIENT_IP_MODULE = "shared/client_ip.py"
FORWARDED_META_KEY = "HTTP_X_FORWARDED_FOR"


def _cabecera_ip_solo_en_client_ip(rel, tree):
    """Ningún módulo salvo ``shared/client_ip.py`` nombra la cabecera de IP reenviada: leerla sin contar los
    saltos deja que el cliente escriba su propia IP en la auditoría y en los límites por IP."""
    if rel == CLIENT_IP_MODULE:
        return []
    found = {
        Violation("ip-reenviada-solo-client-ip", rel, "lee X-Forwarded-For (usa shared.client_ip.client_ip)")
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
        and (FORWARDED_META_KEY in node.value or node.value.lower() == "x-forwarded-for")
    }
    return sorted(found, key=lambda v: v.detail)


def check_architecture(root: Path) -> list[Violation]:
    violations: list[Violation] = []
    for rel, tree in _source_files(root):
        violations += _import_rule(
            rel,
            tree,
            lambda r: r.startswith("apps/simulation/casedef/"),
            "casedef-puro",
            lambda m: m.split(".")[0] in {"django", "rest_framework"}
            or (m.startswith("apps.") and not m.startswith("apps.simulation.casedef")),
        )
        violations += _import_rule(
            rel,
            tree,
            lambda r: r.startswith("apps/simulation/runtime/"),
            "runtime-sin-authoring",
            lambda m: m.startswith(("apps.simulation.authoring", "apps.simulation.services.authoring")),
        )
        violations += _reportes_solo_lee(rel, tree)
        violations += _import_rule(
            rel, tree, lambda r: r == "shared/policies.py", "policies-sin-servicios", _is_service_or_view
        )
        violations += _import_rule(
            rel,
            tree,
            lambda r: "/serializers/" in r and "dtos" in r.rsplit("/", 1)[-1],
            "dto-sin-servicios",
            _is_service,
        )
        violations += _sql_sin_interpolacion(rel, tree)
        violations += _serializers_sin_all(rel, tree)
        violations += _allowany_solo_publicas(rel, tree)
        violations += _uniones_por_orm(rel, tree)
        violations += _permisos_por_politica(rel, tree)
        violations += _publicacion_unica(rel, tree)
        violations += _cabecera_ip_solo_en_client_ip(rel, tree)
    return violations
