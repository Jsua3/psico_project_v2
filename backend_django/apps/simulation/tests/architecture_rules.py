"""Reglas de arquitectura del backend (E0-4, §2.2 y §3.2 del plan estructural).

Lee el código con ``ast`` (sin importarlo, sin Django) y devuelve violaciones con
un identificador estable ``ruta|detalle`` (sin números de línea) para que el
baseline sobreviva a ediciones que no tocan la violación.

Reglas (``Violation.rule``):

- ``casedef-puro``: ``apps/simulation/casedef/**`` no importa Django, DRF ni otras apps.
- ``runtime-sin-authoring``: ``apps/simulation/runtime/**`` no importa autoría.
- ``reportes-solo-lee``: ``apps/reportes/**`` no escribe.
- ``policies-sin-servicios``: ``shared/policies.py`` no importa servicios ni vistas.
- ``dto-sin-servicios``: los ``*dtos*.py`` de ``serializers/`` no importan servicios.
- ``sql-sin-interpolacion``: sin ``.raw(``, ``.extra(``, ``RawSQL(`` ni ``execute(`` con SQL interpolado.
- ``serializers-sin-all``: sin ``fields = "__all__"`` ni ``exclude`` en serializadores.
- ``allowany-solo-publicas``: ``AllowAny`` solo en las vistas públicas de ``PUBLIC_VIEWS``.
- ``uniones-por-orm``: sin SQL sobre ``grupo_estudiante`` ni ``grupo_case_version`` (E0-8).
"""
from __future__ import annotations

import ast
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


def _imports(tree):
    """Destinos importados: ``from a.b import c`` es ``a.b.c`` (uno por alias)."""
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            for alias in node.names:
                found.add(node.module if alias.name == "*" else f"{node.module}.{alias.name}")
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
        for module in sorted(_imports(tree))
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


def _reportes_solo_lee(rel, tree):
    if not rel.startswith("apps/reportes/"):
        return []
    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            attr = node.func.attr
            chain = set(_receiver_names(node.func.value))
            if attr in ORM_WRITES or (attr == "update" and chain & QUERYSET_HINTS):
                found.append(Violation("reportes-solo-lee", rel, f"escribe con .{attr}("))
    return found


def _interpolated(arg):
    if isinstance(arg, ast.JoinedStr):
        return True
    if isinstance(arg, ast.BinOp) and isinstance(arg.op, (ast.Mod, ast.Add)):
        return True
    return (
        isinstance(arg, ast.Call)
        and isinstance(arg.func, ast.Attribute)
        and arg.func.attr == "format"
    )


def _sql_sin_interpolacion(rel, tree):
    found = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = node.func.attr if isinstance(node.func, ast.Attribute) else getattr(node.func, "id", "")
        if name in {"raw", "extra", "RawSQL"}:
            found.append(Violation("sql-sin-interpolacion", rel, f"usa {name}("))
        elif name == "execute" and node.args and _interpolated(node.args[0]):
            found.append(Violation("sql-sin-interpolacion", rel, "execute( con SQL interpolado"))
    return found


def _serializers_sin_all(rel, tree):
    if "/serializers" not in rel:
        return []
    found = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if not isinstance(target, ast.Name):
                continue
            if target.id == "exclude":
                found.append(Violation("serializers-sin-all", rel, "usa exclude"))
            if (
                target.id == "fields"
                and isinstance(node.value, ast.Constant)
                and node.value.value == "__all__"
            ):
                found.append(Violation("serializers-sin-all", rel, 'usa fields = "__all__"'))
    return found


def _allowany_solo_publicas(rel, tree):
    allowed = PUBLIC_VIEWS.get(rel, set())
    found = []
    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        uses = any(isinstance(n, ast.Name) and n.id == "AllowAny" for n in ast.walk(node))
        if uses and node.name not in allowed:
            found.append(Violation("allowany-solo-publicas", rel, f"{node.name} declara AllowAny"))
    return found


JOIN_TABLES = ("grupo_estudiante", "grupo_case_version")


def _uniones_por_orm(rel, tree):
    """Las tablas de unión tienen modelo (``GrupoEstudiante``, ``GrupoCaseVersion``): no se tocan con SQL."""
    if "/models" in rel:
        return []
    found = {
        Violation("uniones-por-orm", rel, f"SQL sobre {table}")
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
        for table in JOIN_TABLES
        if table in node.value
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
    return violations
