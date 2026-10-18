"""Capa de forma del documento: el intérprete del JSON Schema del taller, portado (R3 de E4).

Valida un documento contra la parte de JSON Schema (draft 2020-12) que usa ``dsl-casos.schema.json``.
Cada error lleva la regla del dominio que el esquema anota con ``x-regla`` en el punto donde la hace
cumplir: así se sabe qué es de la forma (``rule is None`` o ``INV-xx``) y qué lo evalúa una regla
``OCL`` (las funciones de ``rules_ocl``). Es el mismo intérprete del validador del taller
(``docs/diseno/dsl/validador/validar_dsl.py``, Fase 4; autores Juan José Sua Gómez y Emerson Ángel
Gómez), solo con la biblioteca estándar: misma atribución, mismo veredicto. Palabras clave: ``$ref``,
``type``, ``const``, ``enum``, ``pattern``, ``minLength``, ``minimum``, ``minItems``, ``uniqueItems``,
``items``, ``contains``, ``required``, ``properties``, ``additionalProperties`` (``false``), ``allOf``,
``oneOf``, ``not`` e ``if/then/else``; las demás y las anotaciones se ignoran.
"""
import json
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class FormError:
    #: Ruta al valor dentro del documento, p. ej. ``("escenas", 1, "decision")``.
    path: tuple
    #: Palabra clave del esquema que falló (``type``, ``required``, ``minItems``…).
    keyword: str
    message: str
    #: La regla del dominio (``OCL-02``, ``INV-12``…) que el esquema hace cumplir ahí, o ``None``.
    rule: str | None


def _same(a, b):
    if isinstance(a, bool) != isinstance(b, bool):
        return False
    return a == b


def _freeze(value):
    """Un valor hashable que es igual a otro cuando lo son los valores (``==`` de Python, también dentro)."""
    if isinstance(value, list):
        return ("l", tuple(_freeze(item) for item in value))
    if isinstance(value, dict):
        return ("d", frozenset((key, _freeze(item)) for key, item in value.items()))
    try:
        hash(value)
    except TypeError:  # no es JSON: nunca llega de un documento, pero tampoco debe tumbar al validador
        return ("x", repr(value))
    return value


def _identity(item):
    """La clave de ``uniqueItems`` de un elemento: dos son repetidos si y solo si ``_same`` lo dice."""
    return (True, item) if isinstance(item, bool) else (False, _freeze(item))


def _is_type(value, kind):
    if kind == "object":
        return isinstance(value, dict)
    if kind == "array":
        return isinstance(value, list)
    if kind == "string":
        return isinstance(value, str)
    if kind == "boolean":
        return isinstance(value, bool)
    if kind == "null":
        return value is None
    if kind == "integer":
        return (isinstance(value, int) and not isinstance(value, bool)) or (
            isinstance(value, float) and value.is_integer()
        )
    if kind == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    return False


_TYPE_NAME = {"object": "un objeto", "array": "una lista", "string": "un texto", "boolean": "un booleano",
              "integer": "un entero", "number": "un número", "null": "nulo"}


def _type_of(value):
    for kind in ("null", "boolean", "integer", "number", "string", "array", "object"):
        if _is_type(value, kind):
            return _TYPE_NAME[kind]
    return type(value).__name__


class _Interpreter:
    def __init__(self, schema):
        self.root = schema

    def errors(self, instance):
        out = []
        self._validate(instance, self.root, (), None, None, out)
        return out

    def _resolve(self, ref):
        prefix = "#/$defs/"
        if ref == "#":
            return self.root
        if not ref.startswith(prefix):
            raise ValueError(f"$ref no soportada: {ref}")
        return self.root["$defs"][ref[len(prefix):]]

    def _validate(self, inst, node, route, inherited, fixed, out):
        if not isinstance(node, dict):
            return
        own = node.get("x-regla")
        applicable = own or fixed or inherited

        def error(keyword, message, rule=None):
            out.append(FormError(route, keyword, message, rule or applicable))

        if "$ref" in node:
            self._validate(inst, self._resolve(node["$ref"]), route, applicable, fixed, out)

        if "type" in node:
            kinds = node["type"] if isinstance(node["type"], list) else [node["type"]]
            if not any(_is_type(inst, kind) for kind in kinds):
                expected = " o ".join(_TYPE_NAME.get(kind, kind) for kind in kinds)
                error("type", f"se esperaba {expected} y se encontró {_type_of(inst)}")
        if "const" in node and not _same(inst, node["const"]):
            error("const", f"el valor debe ser «{json.dumps(node['const'], ensure_ascii=False)}»")
        if "enum" in node and not any(_same(inst, value) for value in node["enum"]):
            possible = ", ".join(str(value) for value in node["enum"])
            error("enum", f"el valor «{inst}» no está permitido; valores posibles: {possible}")

        if isinstance(inst, str):
            if "minLength" in node and len(inst) < node["minLength"]:
                error("minLength", "el texto no puede estar vacío")
            if "pattern" in node and not re.search(node["pattern"], inst):
                if node["pattern"] == "\\S":
                    error("pattern", "el texto está vacío o solo tiene espacios")
                else:
                    visible = node["pattern"].replace("(?![\\s\\S])", "$")  # el esquema escribe así el fin del texto
                    error("pattern", f"«{inst}» no tiene el formato esperado ({visible})")
        if isinstance(inst, (int, float)) and not isinstance(inst, bool):
            if "minimum" in node and inst < node["minimum"]:
                error("minimum", f"el valor {inst} es menor que el mínimo {node['minimum']}")

        if isinstance(inst, list):
            if "minItems" in node and len(inst) < node["minItems"]:
                error("minItems", f"la lista tiene {len(inst)} elemento(s); se exigen al menos {node['minItems']}")
            if node.get("uniqueItems"):
                seen = set()  # una sola pasada: comparar cada elemento con todos los anteriores era cuadrático
                for item in inst:
                    identity = _identity(item)
                    if identity in seen:
                        error("uniqueItems", "la lista tiene elementos repetidos")
                        break
                    seen.add(identity)
            if "items" in node:
                for position, item in enumerate(inst):
                    self._validate(item, node["items"], route + (position,), None, fixed, out)
            if "contains" in node:
                found = False
                for item in inst:
                    previous = []
                    self._validate(item, node["contains"], route, None, None, previous)
                    if not previous:
                        found = True
                        break
                if not found:
                    error("contains", "ningún elemento de la lista cumple la condición exigida")

        if isinstance(inst, dict):
            properties = node.get("properties", {})
            for key in node.get("required", []):
                if key not in inst:
                    prop = properties.get(key)
                    key_rule = prop.get("x-regla") if isinstance(prop, dict) else None
                    error("required", f"falta la clave obligatoria «{key}»", key_rule)
            for key, value in inst.items():
                if key in properties:
                    self._validate(value, properties[key], route + (key,), None, fixed, out)
            if node.get("additionalProperties") is False:
                extra = [key for key in inst if key not in properties]
                if extra:
                    error("additionalProperties",
                          "clave(s) no admitida(s) en el DSL: " + ", ".join(f"«{key}»" for key in extra))

        for sub in node.get("allOf", []):
            self._validate(inst, sub, route, applicable, fixed, out)
        if "oneOf" in node:
            valid = 0
            for sub in node["oneOf"]:
                previous = []
                self._validate(inst, sub, route, applicable, fixed, previous)
                valid += not previous
            if valid != 1:
                error("oneOf", f"debe cumplir exactamente una de las alternativas y cumple {valid}")
        if "not" in node:
            previous = []
            self._validate(inst, node["not"], route, None, None, previous)
            if not previous:
                error("not", "contiene algo que en este estado no se admite")
        if "if" in node:
            previous = []
            self._validate(inst, node["if"], route, None, None, previous)
            branch = node.get("else") if previous else node.get("then")
            if branch is not None:
                self._validate(inst, branch, route, applicable, own or fixed, out)


def errors(schema, document):
    """Los errores de forma de ``document`` contra ``schema`` (lista vacía si cumple)."""
    return _Interpreter(schema).errors(document)
