"""Ayudantes de prueba de contrato: compara una respuesta REAL con el documento OpenAPI (E5-9, reparación).

Un esquema que nadie contrasta con el servidor acaba describiendo otra cosa: el de E5 prometía ``status`` donde
el servidor responde ``success`` y envolvía en una lista lo que es un objeto. ``assert_matches`` valida el cuerpo
que recibe el cliente contra el esquema del documento generado (el mismo que ve el cliente), de forma recursiva:
claves requeridas, claves que el esquema no declara, tipos básicos, nulos, enumeraciones y los formatos
``uuid``, ``date`` y ``date-time``.

Lo que no modela, a propósito: ``oneOf``/``anyOf`` y los ``allOf`` de varias partes (drf-spectacular solo emite
un ``allOf`` de una parte, para un anidado que admite ``null``).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Iterator


def response_schema(document: dict, path: str, method: str, status: str = "200") -> dict:
    """El esquema que el documento promete para la respuesta ``status`` de ``method path``."""
    operation = document["paths"][path][method.lower()]
    return operation["responses"][str(status)]["content"]["application/json"]["schema"]


def typed_operations(document: dict) -> set[tuple[str, str]]:
    """Las operaciones ``(ruta, MÉTODO)`` cuya respuesta de éxito es un sobre con ``data`` tipada.

    El sobre genérico (``data`` sin forma) no cuenta: es lo que llevan los endpoints que aún no se tipan.
    """
    components = document.get("components", {}).get("schemas", {})
    typed = set()
    for path, operations in document.get("paths", {}).items():
        for method, operation in operations.items():
            for status, response in operation.get("responses", {}).items():
                schema = response.get("content", {}).get("application/json", {}).get("schema")
                if not str(status).startswith("2") or schema is None:
                    continue
                data = _resolve(schema, components).get("properties", {}).get("data")
                if data and data.keys() & {"$ref", "type", "allOf", "oneOf", "enum"}:
                    typed.add((path, method.upper()))
    return typed


def assert_matches(data: Any, schema: dict, document: dict, *, allow_extra: bool = False) -> None:
    """Falla, con la ruta de cada diferencia, si ``data`` no es lo que ``schema`` promete.

    ``allow_extra=True`` admite claves que el esquema no declara (en cualquier nivel): para una respuesta que es
    un superconjunto documentado de la que describe el esquema.
    """
    components = document.get("components", {}).get("schemas", {})
    problems = list(_problems(data, schema, components, "$", allow_extra))
    assert not problems, "La respuesta no coincide con el esquema OpenAPI:\n  " + "\n  ".join(problems)


def _resolve(node: dict, components: dict) -> dict:
    while "$ref" in node:
        node = components[node["$ref"].rsplit("/", 1)[-1]]
    return node


def _wrong_type(where: str, expected: str, value: Any) -> str:
    return f"{where}: se esperaba {expected}, llegó {type(value).__name__}"


def _problems(value: Any, node: dict, components: dict, where: str, allow_extra: bool) -> Iterator[str]:
    node = _resolve(node, components)
    if value is None:
        if node.get("nullable") or not (node.keys() & {"type", "enum", "allOf"}):
            return
        yield f"{where}: es null y el esquema no lo permite"
        return
    for part in node.get("allOf", ()):
        yield from _problems(value, part, components, where, allow_extra)
    if "enum" in node and value not in node["enum"]:
        yield f"{where}: {value!r} no está en {node['enum']}"
        return
    kind = node.get("type")
    if kind == "string":
        yield from _string_problems(value, node, where)
    elif kind == "integer":
        if isinstance(value, bool) or not isinstance(value, int):
            yield _wrong_type(where, "integer", value)
    elif kind == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            yield _wrong_type(where, "number", value)
    elif kind == "boolean":
        if not isinstance(value, bool):
            yield _wrong_type(where, "boolean", value)
    elif kind == "array":
        if not isinstance(value, list):
            yield _wrong_type(where, "array", value)
            return
        for index, item in enumerate(value):
            yield from _problems(item, node.get("items", {}), components, f"{where}[{index}]", allow_extra)
    elif kind == "object" or "properties" in node:
        if not isinstance(value, dict):
            yield _wrong_type(where, "object", value)
            return
        yield from _object_problems(value, node, components, where, allow_extra)


def _string_problems(value: Any, node: dict, where: str) -> Iterator[str]:
    if not isinstance(value, str):
        yield _wrong_type(where, "string", value)
        return
    kind = node.get("format")
    try:
        if kind == "uuid":
            uuid.UUID(value)
        elif kind == "date-time":
            datetime.fromisoformat(value)
        elif kind == "date":
            date.fromisoformat(value)
    except ValueError:
        yield f"{where}: no es un {kind} ({value!r})"


def _object_problems(value: dict, node: dict, components: dict, where: str, allow_extra: bool) -> Iterator[str]:
    properties = node.get("properties", {})
    for name in node.get("required", ()):
        if name not in value:
            yield f"{where}.{name}: falta (es requerida)"
    additional = node.get("additionalProperties")
    free_form = not properties and additional is None
    for name, item in value.items():
        if name in properties:
            yield from _problems(item, properties[name], components, f"{where}.{name}", allow_extra)
        elif isinstance(additional, dict):
            yield from _problems(item, additional, components, f"{where}.{name}", allow_extra)
        elif not (free_form or additional is True or allow_extra):
            yield f"{where}.{name}: no está en el esquema"
