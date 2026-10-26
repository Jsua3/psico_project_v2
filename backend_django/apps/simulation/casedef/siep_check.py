"""``x-siep`` del documento (E4-2b, R17): esquema, enlaces, claves repetidas, condiciones y métricas o hitos.

``x-siep`` lleva lo que el DSL del taller no puede expresar (``siep``). Aquí se valida con cinco
pasadas, todas defensivas —un documento que llega de fuera puede traer cualquier forma—:

1. **esquema** (``x-siep.schema.json``, ``jsonschema``): claves desconocidas, tipos, patrones y topes;
2. **enlaces**: cada ``id`` de DSL que ``x-siep`` nombra existe en la base, y cada clave del producto
   (opción, personaje, herramienta, escena, objeto) que el mundo nombra existe en ``x-siep``;
3. **claves repetidas**: las claves son únicas por caso (escena, opción, personaje, herramienta, mapa) o
   por mapa (objeto, zona de colisión, diálogo) o por diálogo (elección);
4. **condiciones** de los finales: solo el vocabulario de ``conditions``, sin ``eval`` ni ``exec``;
5. **métricas** (documento 1.0): las condiciones y los efectos de las opciones solo mueven métricas que el caso declara;
   **hitos** (documento 2.0): los finales y las opciones solo nombran hitos que ``reglas.milestones`` declara, y las
   condiciones solo usan ``all/any/not/milestone/count/persona`` (sin ``metric``, ``flag`` ni conteos por severidad).

La versión de ``x-siep`` elige el esquema: la ``2.0`` es la vigente y la ``1.0`` se sigue leyendo (el importador la
convierte, ``casedef.legacy``); cualquier otra es un error del esquema vigente («debe ser 2.0»).

Las referencias de las puertas (``targetNodeKey``, ``requires*``) no se miran aquí: son de la validación
del mundo, que corre sobre la versión ya guardada.
"""
import functools
import itertools
import json
from pathlib import Path

import jsonschema

from . import conditions, legacy, messages, text
from .report import ERROR, PREFIX, Issue

SIEP_KEY = "x-siep"
SCHEMA_NAME = "x-siep.schema.json"
LEGACY_SCHEMA_NAME = "x-siep.v1.schema.json"
LEGACY_VERSION = "1.0"
SCHEMA, REF, DUPLICATE = PREFIX + "SIEP_SCHEMA", PREFIX + "SIEP_REF", PREFIX + "SIEP_DUPLICATE"
CONDITION, METRIC = PREFIX + "SIEP_CONDITION", PREFIX + "SIEP_METRIC"
MILESTONE = PREFIX + "SIEP_MILESTONE"
LIMIT, TOO_LONG = PREFIX + "LIMIT_EXCEEDED", PREFIX + "TEXT_TOO_LONG"
MAX_SCHEMA_ERRORS = 50

#: Las métricas que un caso sin ``reglas.metrics`` conserva: las siete del caso PDF. Es una copia de
#: ``services.case_effects.CASE_METRIC_KEYS`` (este paquete no importa Django); una prueba las compara.
DEFAULT_METRICS = (
    "confianza", "crisis_emocional", "riesgo_victima", "rigor_tecnico", "etica_profesional",
    "ruta_institucional", "calidad_duelo",
)

# BORRADOR: los textos de los hallazgos son nuevos del servidor, pendientes de Psicología (VD-23).
_TYPE_NAMES = {
    "object": "un objeto", "array": "una lista", "string": "un texto", "boolean": "verdadero o falso",
    "integer": "un número entero", "number": "un número", "null": "nulo",
}


@functools.lru_cache(maxsize=2)
def _validator(name=SCHEMA_NAME):
    schema = json.loads((Path(__file__).parent / "schema" / name).read_text(encoding="utf-8"))
    return jsonschema.Draft202012Validator(schema)


def is_legacy(siep):
    """¿``x-siep`` es de la versión 1.0 (puntaje, estrés, métricas y banderas), que el importador aún convierte?"""
    return isinstance(siep, dict) and siep.get("version") == LEGACY_VERSION


def _items(value):
    """``[(posición, elemento)]`` de los objetos de una lista; lo que no es una lista de objetos, nada."""
    return [(position, item) for position, item in enumerate(value) if isinstance(item, dict)] if isinstance(value, list) else []


def _shown(value):
    if isinstance(value, str):
        return f"«{value if len(value) <= 60 else value[:59] + '…'}»"
    return json.dumps(value, ensure_ascii=False)[:60]


def _sentence(where, reason):
    full = f"{where}: {reason}" if where else reason
    return full[:1].upper() + full[1:]


# ─── 1. esquema ───────────────────────────────────────────────────────────────────────────────
def _reason(error):
    """``(código, motivo)`` de un error del esquema, en castellano."""
    keyword, expected = error.validator, error.validator_value
    if keyword == "required" and isinstance(error.instance, dict):
        missing = [f"«{key}»" for key in expected if key not in error.instance]
        return SCHEMA, f"falta {'la clave' if len(missing) == 1 else 'las claves'} {', '.join(missing)}."
    if keyword == "additionalProperties" and isinstance(error.instance, dict):
        known = error.schema.get("properties", {})
        extra = [f"«{key}»" for key in sorted(k for k in error.instance if k not in known)]
        plural = len(extra) != 1
        return SCHEMA, f"{'las claves' if plural else 'la clave'} {', '.join(extra)} no {'se admiten' if plural else 'se admite'}."
    if keyword == "type":
        kinds = [expected] if isinstance(expected, str) else expected
        return SCHEMA, f"debe ser {' o '.join(_TYPE_NAMES.get(kind, kind) for kind in kinds)}."
    if keyword == "enum":
        return SCHEMA, f"el valor {_shown(error.instance)} no está permitido; los posibles son: {', '.join(_shown(v) for v in expected)}."
    if keyword == "const":
        return SCHEMA, f"debe ser {_shown(expected)}."
    if keyword == "pattern":
        return SCHEMA, f"{_shown(error.instance)} no tiene el formato esperado."
    if keyword == "minimum":
        return SCHEMA, f"no puede ser menor que {expected}."
    if keyword == "maximum":
        return SCHEMA, f"no puede ser mayor que {expected}."
    if keyword == "minLength":
        return SCHEMA, "no puede estar vacío." if expected == 1 else f"debe tener al menos {expected} caracteres."
    if keyword == "maxLength":
        return TOO_LONG, text.too_long_message(expected).lower()
    if keyword == "minItems":
        return SCHEMA, f"necesita al menos {expected} elementos."
    if keyword == "maxItems":
        return LIMIT, f"admite hasta {expected} elementos."
    if keyword == "maxProperties":
        return LIMIT, f"admite hasta {expected} entradas."
    return SCHEMA, error.message


def _schema_issues(document, siep, names):
    validator = _validator(LEGACY_SCHEMA_NAME if is_legacy(siep) else SCHEMA_NAME)
    errors = list(itertools.islice(validator.iter_errors(siep), MAX_SCHEMA_ERRORS))
    errors.sort(key=lambda error: [str(step) for step in error.absolute_path])
    issues = []
    for error in errors:
        route = (SIEP_KEY,) + tuple(error.absolute_path)
        code, reason = _reason(error)
        issues.append(Issue(code, ERROR, messages.route_text(route), _sentence(messages.locate(document, route, names), reason)))
    return issues


# ─── 2 y 3. enlaces y claves repetidas ────────────────────────────────────────────────────────
class _Collector:
    """Junta los hallazgos de enlaces y de claves repetidas con su ruta y su lugar en el documento."""

    def __init__(self, document, names):
        self.document, self.names, self.issues = document, names, []

    def add(self, code, route, reason):
        where = messages.locate(self.document, route[:-1], self.names)
        self.issues.append(Issue(code, ERROR, messages.route_text(route), _sentence(where, reason)))

    def missing(self, route, noun, value):
        self.add(REF, route, f"{noun} {_shown(value)} no existe en el caso.")

    def unique(self, seen, route, noun, key, scope):
        if key in seen:
            self.add(DUPLICATE, route, f"{noun} {_shown(key)} está repetida: la clave debe ser única {scope}.")
        seen.add(key)


def _strings(items, field):
    return [(position, item[field]) for position, item in items if isinstance(item.get(field), str)]


def _scene_links(base, siep, found):
    """Cada entrada de ``x-siep.escenas`` con ``id`` enlaza con una escena de la base, una sola vez."""
    entries = _items(siep.get("escenas"))
    linked = set()
    for position, ident in _strings(entries, "id"):
        route = (SIEP_KEY, "escenas", position, "id")
        if ident not in base:
            found.add(REF, route, f"enlaza con la escena {_shown(ident)}, que el documento no tiene.")
        elif ident in linked:
            found.add(DUPLICATE, route, f"la escena {_shown(found.names.get(ident, ident))} está enlazada dos veces.")
        linked.add(ident)
    if isinstance(siep.get("escenas"), list):
        for ident in base:
            if ident not in linked:
                found.add(REF, (SIEP_KEY, "escenas"), f"en x-siep falta la escena {_shown(found.names.get(ident, ident))} del documento.")
    return entries


def _register(found, siep, list_name, field, noun):
    """Las claves de ``x-siep.<lista>`` (y sus ``id``), avisando de las repetidas; devuelve las claves."""
    keys, ids = set(), set()
    for position, item in _items(siep.get(list_name)):
        if isinstance(item.get(field), str):
            found.unique(keys, (SIEP_KEY, list_name, position, field), noun, item[field], "en el caso")
        if isinstance(item.get("id"), str):
            found.unique(ids, (SIEP_KEY, list_name, position, "id"), "el enlace", item["id"], "en el caso")
    return keys


def _ids_of(items):
    return {item["id"] for _, item in _items(items) if isinstance(item.get("id"), str)}


def _linked_ids(found, siep, document):
    """Cada ``id`` de DSL que una entrada de ``x-siep`` nombra existe en la base: el personaje, la herramienta,
    la rúbrica, el criterio y la opción (esta, dentro de la escena a la que la entrada está enlazada)."""

    def check(route_prefix, entries, known, noun):
        for position, ident in _strings(_items(entries), "id"):
            if ident not in known:
                found.add(REF, route_prefix + (position, "id"), f"enlaza con {noun} {_shown(ident)}, que el documento no tiene.")

    check((SIEP_KEY, "personajes"), siep.get("personajes"), _ids_of(document.get("personajes")), "el personaje")
    check((SIEP_KEY, "herramientas"), siep.get("herramientas"), _ids_of(document.get("herramientas")), "la herramienta")
    check((SIEP_KEY, "rubricas"), siep.get("rubricas"), _ids_of(document.get("rubricas")), "la rúbrica")
    criteria = {c for _, r in _items(document.get("rubricas")) for c in _ids_of(r.get("criterios"))}
    for position, rubric in _items(siep.get("rubricas")):
        check((SIEP_KEY, "rubricas", position, "criterios"), rubric.get("criterios"), criteria, "el criterio")
    options = {}
    for _, scene in _items(document.get("escenas")):
        decision = scene.get("decision") if isinstance(scene.get("decision"), dict) else {}
        if isinstance(scene.get("id"), str):
            options[scene["id"]] = _ids_of(decision.get("opciones"))
    for position, entry in _items(siep.get("escenas")):
        scene_id = entry.get("id")
        known = options.get(scene_id, set()) if isinstance(scene_id, str) else set()
        check((SIEP_KEY, "escenas", position, "opciones"), entry.get("opciones"), known, "la opción")


def _unlisted(found, siep, document):
    """Lo que la base trae y la lista de ``x-siep`` no nombra se rechaza: el importador solo lee las entradas de
    ``x-siep`` cuando la lista existe, y un personaje, una herramienta, una rúbrica o un criterio sin entrada
    se perdería sin avisar."""
    for list_name, noun in (("personajes", "el personaje"), ("herramientas", "la herramienta"), ("rubricas", "la rúbrica")):
        if not isinstance(siep.get(list_name), list):
            continue
        listed = _ids_of(siep[list_name])
        for _, item in _items(document.get(list_name)):
            ident = item.get("id")
            if isinstance(ident, str) and ident not in listed:
                found.add(REF, (SIEP_KEY, list_name), f"en x-siep falta {noun} {_shown(found.names.get(ident, ident))} del documento.")
    base = {rubric["id"]: rubric for _, rubric in _items(document.get("rubricas")) if isinstance(rubric.get("id"), str)}
    for position, entry in _items(siep.get("rubricas")):
        rubric = base.get(entry["id"]) if isinstance(entry.get("id"), str) else None
        if rubric is None or not isinstance(entry.get("criterios"), list):
            continue
        listed = _ids_of(entry["criterios"])
        for _, criterion in _items(rubric.get("criterios")):
            ident = criterion.get("id")
            if isinstance(ident, str) and ident not in listed:
                found.add(
                    REF, (SIEP_KEY, "rubricas", position, "criterios"),
                    f"en x-siep falta el criterio {_shown(found.names.get(ident, ident))} de la rúbrica.",
                )


def _links(document, siep, names):
    found = _Collector(document, names)
    base = {
        item["id"]: item for _, item in _items(document.get("escenas")) if isinstance(item.get("id"), str)
    }
    entries = _scene_links(base, siep, found)
    _linked_ids(found, siep, document)
    _unlisted(found, siep, document)
    characters = _register(found, siep, "personajes", "clave", "la clave del personaje")
    tools = _register(found, siep, "herramientas", "codigo", "el código de la herramienta")

    # Primero todas las claves del caso: una opción puede nombrar una escena que viene después.
    scene_keys, option_keys, option_ids, map_keys = set(), set(), set(), set()
    for position, entry in entries:
        scene = (SIEP_KEY, "escenas", position)
        if isinstance(entry.get("clave"), str):
            found.unique(scene_keys, scene + ("clave",), "la clave de la escena", entry["clave"], "en el caso")
        for o_position, option in _items(entry.get("opciones")):
            if isinstance(option.get("clave"), str):
                found.unique(option_keys, scene + ("opciones", o_position, "clave"), "la clave de la opción", option["clave"], "en el caso")
            if isinstance(option.get("id"), str):
                found.unique(option_ids, scene + ("opciones", o_position, "id"), "el enlace", option["id"], "en el caso")
        mapa = entry.get("mapa")
        if isinstance(mapa, dict) and isinstance(mapa.get("clave"), str):
            found.unique(map_keys, scene + ("mapa", "clave"), "la clave del mapa", mapa["clave"], "en el caso")

    for position, entry in entries:
        scene = (SIEP_KEY, "escenas", position)
        for o_position, option in _items(entry.get("opciones")):
            if isinstance(option.get("destino"), str) and option["destino"] not in scene_keys:
                found.missing(scene + ("opciones", o_position, "destino"), "la escena", option["destino"])
        if isinstance(entry.get("herramientasRequeridas"), list):
            for t_position, code in enumerate(entry["herramientasRequeridas"]):
                if isinstance(code, str) and code not in tools:
                    found.missing(scene + ("herramientasRequeridas", t_position), "la herramienta", code)
        if isinstance(entry.get("mapa"), dict):
            _map_links(found, scene + ("mapa",), entry["mapa"], option_keys, characters, tools)
    _rubric_ids(found, siep)
    return found.issues


def _rubric_ids(found, siep):
    rubric_ids, criterion_ids = set(), set()
    for position, rubric in _items(siep.get("rubricas")):
        if isinstance(rubric.get("id"), str):
            found.unique(rubric_ids, (SIEP_KEY, "rubricas", position, "id"), "el enlace", rubric["id"], "en el caso")
        for c_position, criterion in _items(rubric.get("criterios")):
            if isinstance(criterion.get("id"), str):
                found.unique(criterion_ids, (SIEP_KEY, "rubricas", position, "criterios", c_position, "id"), "el enlace", criterion["id"], "en el caso")


def _map_links(found, route, mapa, option_keys, characters, tools):
    object_keys, zone_keys, dialogue_keys = set(), set(), set()
    for position, item in _items(mapa.get("colisiones")):
        if isinstance(item.get("clave"), str):
            found.unique(zone_keys, route + ("colisiones", position, "clave"), "la clave de la zona de colisión", item["clave"], "en su mapa")
    for position, item in _items(mapa.get("objetos")):
        here = route + ("objetos", position)
        if isinstance(item.get("clave"), str):
            found.unique(object_keys, here + ("clave",), "la clave del objeto", item["clave"], "en su mapa")
        for field, known, noun in (("opcion", option_keys, "la opción"), ("personaje", characters, "el personaje"), ("herramienta", tools, "la herramienta")):
            if isinstance(item.get(field), str) and item[field] not in known:
                found.missing(here + (field,), noun, item[field])
    for position, tree in _items(mapa.get("dialogos")):
        here = route + ("dialogos", position)
        if isinstance(tree.get("clave"), str):
            found.unique(dialogue_keys, here + ("clave",), "la clave del diálogo", tree["clave"], "en su mapa")
        if isinstance(tree.get("objeto"), str) and tree["objeto"] not in object_keys:
            found.missing(here + ("objeto",), "el objeto", tree["objeto"])
        orders = set()
        for l_position, line in _items(tree.get("lineas")):
            if isinstance(line.get("orden"), int) and not isinstance(line["orden"], bool):
                found.unique(
                    orders, here + ("lineas", l_position, "orden"), "el orden de la línea", line["orden"], "en su diálogo"
                )
        choice_keys = set()
        for c_position, choice in _items(tree.get("elecciones")):
            there = here + ("elecciones", c_position)
            if isinstance(choice.get("clave"), str):
                found.unique(choice_keys, there + ("clave",), "la clave de la elección", choice["clave"], "en su diálogo")
            if isinstance(choice.get("opcion"), str) and choice["opcion"] not in option_keys:
                found.missing(there + ("opcion",), "la opción", choice["opcion"])
            if isinstance(choice.get("herramientaRequerida"), str) and choice["herramientaRequerida"] not in tools:
                found.missing(there + ("herramientaRequerida",), "la herramienta", choice["herramientaRequerida"])


# ─── 4 y 5. condiciones, y métricas (1.0) o hitos (2.0) ───────────────────────────────────────
def _metrics_in(condition):
    """Los nombres de métrica que nombra una condición válida (recorrido sin recursión)."""
    found, pending = [], [condition]
    while pending:
        node = pending.pop()
        if not isinstance(node, dict):
            continue
        if isinstance(node.get("metric"), str):
            found.append(node["metric"])
        for group in ("all", "any"):
            if isinstance(node.get(group), list):
                pending.extend(node[group])
        pending.append(node.get("not"))
    return found


def _declared_metrics(rules):
    declared = {item["key"] for _, item in _items(rules.get("metrics")) if isinstance(item.get("key"), str)}
    return declared or set(DEFAULT_METRICS)


def _rules_issues(document, siep, names):
    rules = siep.get("reglas") if isinstance(siep.get("reglas"), dict) else {}
    declared = _declared_metrics(rules)
    collector = _Collector(document, names)

    def undeclared(route, metric, subject):
        collector.add(METRIC, route, f"{subject} la métrica {_shown(metric)}, que el caso no declara.")

    for position, ending in _items(rules.get("endings")):
        route = (SIEP_KEY, "reglas", "endings", position, "when")
        if "when" not in ending:
            continue
        if not conditions.is_valid(ending["when"]):
            collector.add(
                CONDITION, route,
                "la condición del final no es válida: solo admite all, any, not, flag, metric y count, "
                f"con números como límite y hasta {conditions.MAX_DEPTH} niveles.",
            )
            continue
        for metric in dict.fromkeys(_metrics_in(ending["when"])):
            if metric not in declared:
                undeclared(route, metric, "la condición del final usa")
    for position, entry in _items(siep.get("escenas")):
        for o_position, option in _items(entry.get("opciones")):
            effects = option.get("efectos")
            moved = effects.get("metrics") if isinstance(effects, dict) else None
            if isinstance(moved, dict):
                route = (SIEP_KEY, "escenas", position, "opciones", o_position, "efectos", "metrics")
                for metric in moved:
                    if metric not in declared:
                        undeclared(route, metric, "la opción mueve")
    return collector.issues


def _milestones_in(condition):
    """Los hitos que nombra una condición válida (recorrido sin recursión)."""
    found, pending = [], [condition]
    while pending:
        node = pending.pop()
        if not isinstance(node, dict):
            continue
        if isinstance(node.get("milestone"), str):
            found.append(node["milestone"])
        for group in ("all", "any"):
            if isinstance(node.get(group), list):
                pending.extend(node[group])
        pending.append(node.get("not"))
    return found


def _declared_milestones(rules):
    return {item["key"] for _, item in _items(rules.get("milestones")) if isinstance(item.get("key"), str)}


def _milestone_issues(document, siep, names):
    """El documento 2.0: las condiciones de los finales usan solo el vocabulario nuevo y todo hito nombrado existe."""
    rules = siep.get("reglas") if isinstance(siep.get("reglas"), dict) else {}
    declared = _declared_milestones(rules)
    collector = _Collector(document, names)

    def undeclared(route, key, subject):
        collector.add(MILESTONE, route, f"{subject} el hito {_shown(key)}, que el caso no declara en reglas.milestones.")

    for position, ending in _items(rules.get("endings")):
        route = (SIEP_KEY, "reglas", "endings", position, "when")
        if "when" not in ending:
            continue
        if not conditions.is_valid(ending["when"]) or legacy.uses_legacy_condition(ending["when"]):
            collector.add(
                CONDITION, route,
                "la condición del final no es válida: solo admite all, any, not, milestone, count (por clase) y persona, "
                f"con números como límite y hasta {conditions.MAX_DEPTH} niveles.",
            )
            continue
        for key in dict.fromkeys(_milestones_in(ending["when"])):
            if key not in declared:
                undeclared(route, key, "la condición del final usa")
    for position, entry in _items(siep.get("escenas")):
        for o_position, option in _items(entry.get("opciones")):
            effects = option.get("efectos")
            marked = effects.get("milestones") if isinstance(effects, dict) else None
            if isinstance(marked, list):
                for m_position, key in enumerate(marked):
                    if isinstance(key, str) and key not in declared:
                        route = (SIEP_KEY, "escenas", position, "opciones", o_position, "efectos", "milestones", m_position)
                        undeclared(route, key, "la opción marca")
    return collector.issues


def check(document, names=None):
    """Los hallazgos de ``x-siep``: ``DSL.SIEP_*`` (más los topes y textos largos que marca el esquema)."""
    if not isinstance(document, dict) or SIEP_KEY not in document:
        return []
    siep = document[SIEP_KEY]
    names = names if names is not None else messages.names_of(document)
    issues = _schema_issues(document, siep, names)
    if isinstance(siep, dict):
        issues += _links(document, siep, names)
        issues += _rules_issues(document, siep, names) if is_legacy(siep) else _milestone_issues(document, siep, names)
    return issues
