"""Leer un documento que llega de fuera y volverlo un modelo (E4-5, R16 y R17).

Dos pasos, siempre en este orden:

1. ``read_document(bytes)`` —**lectura segura**— lo vuelve un ``dict`` o lo rechaza con
   ``ImportRejected``: a lo sumo 1 MiB, UTF-8 (con o sin marca de orden de bytes), solo JSON, anidado a lo
   sumo 20 niveles (se mide **antes** de interpretar nada, para que un millón de corchetes no agote la
   pila), sin claves repetidas, sin ``NaN``/``Infinity`` ni números que no caben, y un objeto en la raíz.
2. ``to_definition(documento)`` —**conversión**— es lo contrario de ``export.to_document``: las claves del
   producto vuelven de ``x-siep`` (o, sin él, son los ids de DSL), lo que la base no trae se completa con
   valores neutros y, sin ``x-siep`` en una escena, se le genera su sala mínima (``scaffold``). Solo se
   llama con un documento que ya pasó el validador: no revalida, pero tampoco confía a ciegas.

``import_issues`` junta lo que el importador añade al validador: el rechazo de ``ejecucion`` (los intentos
viven en la base de datos, no en la definición) y los avisos de lo que no se guarda.
"""
import json
import math
import re

from . import export, scaffold
from .limits import MAX_DEPTH
from .model import (
    CaseDefinition,
    Character,
    CollisionZone,
    Criterion,
    DialogueChoice,
    DialogueLine,
    DialogueTree,
    Option,
    Rubric,
    Scene,
    Tool,
    World,
    WorldObject,
)
from .report import ERROR, PREFIX, WARNING, Issue

MAX_BYTES = 1024 * 1024
SIEP_KEY = "x-siep"
FORMA, LIMIT = PREFIX + "FORMA", PREFIX + "LIMIT_EXCEEDED"
EXECUTION = PREFIX + "EXECUTION_NOT_IMPORTABLE"
FEEDBACK_IGNORED = PREFIX + "FEEDBACK_ON_DECISION_IGNORED"
FIELD_IGNORED = PREFIX + "FIELD_IGNORED"

#: Campos de la base que el producto no guarda (no tienen columna): se avisa de cada uno.
IGNORED_FIELDS = {("caso", "tematica"): "temática"}
#: Lo contrario de ``export.CLASSIFICATION``.
CLASSIFICATION = {value: key for key, value in export.CLASSIFICATION.items()}
#: Cuadrícula de las escenas de un documento que no trae su posición en el editor del grafo.
GRID_COLUMNS, GRID_X, GRID_Y, GRID_STEP_X, GRID_STEP_Y = 4, 180, 180, 240, 180
#: Criterios de una rúbrica que el documento no pondera: el mismo tope que la rúbrica base del producto.
DEFAULT_MAX_SCORE = 20
DEFAULT_WEIGHT = "0.00"

# BORRADOR: los textos de los avisos son nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).
_TOKEN = re.compile(r'"(?:[^"\\]|\\.)*"|[\[\]{}]')


class ImportRejected(Exception):
    """El documento no se puede ni leer: lleva los ``Issue`` que lo explican."""

    def __init__(self, issues):
        super().__init__("; ".join(issue.message for issue in issues))
        self.issues = list(issues)


def _reject(code, message):
    raise ImportRejected([Issue(code, ERROR, "", message)])


# ─── 1. lectura segura ────────────────────────────────────────────────────────────────────────
def _check_depth(text):
    """Rechaza un anidamiento de más de ``MAX_DEPTH`` niveles sin interpretar el texto (ni recursión)."""
    depth = 0
    for token in _TOKEN.finditer(text):
        char = token.group()
        if char in "[{":
            depth += 1
            if depth > MAX_DEPTH:
                _reject(LIMIT, f"El documento está anidado a demasiada profundidad: admite hasta {MAX_DEPTH} niveles.")
        elif char in "]}":
            depth -= 1


def _pairs(pairs):
    found = {}
    for key, value in pairs:
        if key in found:
            _reject(FORMA, f"La clave «{key[:60]}» está repetida en un mismo objeto: el documento es ambiguo.")
        found[key] = value
    return found


def _constant(name):
    _reject(FORMA, f"«{name}» no es un número JSON: el documento no puede llevarlo.")


def _finite(text):
    value = float(text)
    if not math.isfinite(value):
        _reject(FORMA, "El documento trae un número que no cabe (demasiado grande).")
    return value


def read_document(raw):
    """El documento como ``dict``, o ``ImportRejected`` con el primer problema de la lectura."""
    if not isinstance(raw, (bytes, bytearray)):
        _reject(FORMA, "El documento debe llegar como bytes JSON.")
    if len(raw) > MAX_BYTES:
        _reject(LIMIT, f"El documento pesa más de {MAX_BYTES // (1024 * 1024)} MB.")
    try:
        text = bytes(raw).decode("utf-8-sig")
    except UnicodeDecodeError:
        _reject(FORMA, "El documento no está codificado en UTF-8.")
    _check_depth(text)
    try:
        document = json.loads(text, object_pairs_hook=_pairs, parse_constant=_constant, parse_float=_finite)
    except json.JSONDecodeError as error:
        _reject(FORMA, f"El documento no es JSON válido ({error.msg}, línea {error.lineno}, columna {error.colno}).")
    except ValueError:  # p. ej. un entero de más de 4300 cifras
        _reject(FORMA, "El documento trae un número que no cabe (demasiado grande).")
    if not isinstance(document, dict):
        _reject(FORMA, "El documento DSL debe ser un objeto JSON.")
    return document


# ─── lo que el importador añade al validador ──────────────────────────────────────────────────
def _dicts(value):
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def import_issues(document):
    """Rechazos y avisos propios de la importación (``EXECUTION_NOT_IMPORTABLE``, ``FEEDBACK_…``, ``FIELD_…``)."""
    issues = []
    if "ejecucion" in document:
        issues.append(Issue(
            EXECUTION, ERROR, "ejecucion",
            "El documento trae intentos, bitácoras o evaluaciones (ejecucion): esos datos viven en la base de "
            "datos y no se importan. Quita esa sección y vuelve a importar.",
        ))
    for position, item in enumerate(document.get("retroalimentacion") if isinstance(document.get("retroalimentacion"), list) else []):
        if isinstance(item, dict) and "decision" in item and "opcion" not in item:
            issues.append(Issue(
                FEEDBACK_IGNORED, WARNING, f"retroalimentacion[{position}]",
                "Una retroalimentación asociada a una decisión no se guarda: SIEP retroalimenta cada opción.",
            ))
    for route, label in IGNORED_FIELDS.items():
        node = document
        for step in route:
            node = node.get(step) if isinstance(node, dict) else None
        if node is not None:
            issues.append(Issue(FIELD_IGNORED, WARNING, ".".join(route), f"El campo «{label}» no se guarda en SIEP."))
    return issues


# ─── 2. conversión ────────────────────────────────────────────────────────────────────────────
def _text(value):
    return value if isinstance(value, str) else ""


def _by_id(items):
    return {item["id"]: item for item in _dicts(items) if isinstance(item.get("id"), str)}


class _Keys:
    """Las claves del producto de cada entidad con id de DSL: las de ``x-siep``, o el propio id."""

    def __init__(self, document, siep):
        self.scene = {e["id"]: e["clave"] for e in _dicts(siep.get("escenas")) if "id" in e}
        self.option = {
            o["id"]: o["clave"] for e in _dicts(siep.get("escenas")) for o in _dicts(e.get("opciones")) if "id" in o
        }
        self.character = {p["id"]: p["clave"] for p in _dicts(siep.get("personajes")) if "id" in p}
        self.tool = {t["id"]: t["codigo"] for t in _dicts(siep.get("herramientas")) if "id" in t}

    def of_scene(self, ident):
        return self.scene.get(ident, ident)

    def of_option(self, ident):
        return self.option.get(ident, ident)

    def of_character(self, ident):
        return self.character.get(ident, ident)

    def of_tool(self, ident):
        return self.tool.get(ident, ident)


def _characters(document, siep):
    base = _by_id(document.get("personajes"))
    if "personajes" not in siep:
        return tuple(
            Character(key=ident, display_name=_text(p.get("nombre")), role_label=_text(p.get("rol")), display_order=n)
            for n, (ident, p) in enumerate(base.items())
        )
    characters = []
    for entry in _dicts(siep["personajes"]):
        source = base.get(entry.get("id"), entry)
        characters.append(Character(
            key=entry["clave"], display_name=_text(source.get("nombre")), role_label=_text(source.get("rol")),
            portrait_key=entry["retrato"], show_in_brief=entry["enFicha"], display_order=entry["orden"],
        ))
    return tuple(characters)


def _tools(document, siep):
    base = _by_id(document.get("herramientas"))
    if "herramientas" not in siep:
        return tuple(
            Tool(code=ident, label=_text(t.get("nombre")), category=_text(t.get("categoria")),
                 description=_text(t.get("descripcion")))
            for ident, t in base.items()
        )
    tools = []
    for entry in _dicts(siep["herramientas"]):
        if "id" in entry:
            source = base.get(entry["id"], {})
            label, description, category = source.get("nombre"), source.get("descripcion"), source.get("categoria")
        else:
            label, description, category = entry["etiqueta"], entry["descripcion"], entry["categoria"]
        tools.append(Tool(
            code=entry["codigo"], label=_text(label), icon=entry["icono"], category=_text(category),
            description=_text(description), active=entry["activa"],
        ))
    return tuple(tools)


def _criteria(base_rubric, entry):
    """Los criterios de una rúbrica: con ``x-siep`` los de su lista (en su orden); sin él, los de la base."""
    base = _by_id(base_rubric.get("criterios") if base_rubric else None)
    if entry is None:
        return tuple(
            Criterion(
                competency=_text(c.get("competencia")), title=_text(c.get("titulo")),
                description=_text(c.get("descripcion")), max_score=DEFAULT_MAX_SCORE, weight=DEFAULT_WEIGHT,
            )
            for c in _dicts(base_rubric.get("criterios") if base_rubric else None)
        )
    criteria = []
    for item in _dicts(entry["criterios"]):
        source = base.get(item.get("id"), item)
        criteria.append(Criterion(
            competency=_text(source.get("competencia")), title=_text(source.get("titulo")),
            description=_text(source.get("descripcion")), max_score=item["puntajeMaximo"],
            weight=item["peso"], active=item["activo"], competency_code=item.get("competenciaCodigo"),
        ))
    return tuple(criteria)


def _rubrics(document, siep):
    base = _by_id(document.get("rubricas"))
    if "rubricas" not in siep:
        return tuple(
            Rubric(
                name=_text(r.get("nombre")), description=_text(r.get("descripcion")),
                version=_text(r.get("version")) or "1.0", active=bool(r.get("activa", True)),
                criteria=_criteria(r, None),
            )
            for r in base.values()
        )
    rubrics = []
    for entry in _dicts(siep["rubricas"]):
        source = base.get(entry.get("id"), entry)
        rubrics.append(Rubric(
            name=_text(source.get("nombre")), description=_text(source.get("descripcion")),
            version=_text(source.get("version")) or "1.0", active=bool(source.get("activa", True)),
            criteria=_criteria(base.get(entry.get("id")), entry),
        ))
    return tuple(rubrics)


def _world(mapa):
    return World(
        key=mapa["clave"], title=mapa["titulo"], width=mapa["ancho"], height=mapa["alto"], theme=mapa["tema"],
        spawn_x=mapa["aparicion"]["x"], spawn_y=mapa["aparicion"]["y"], ambient=mapa["ambiente"],
        collisions=tuple(
            CollisionZone(key=z["clave"], label=z["etiqueta"], x=z["x"], y=z["y"], width=z["ancho"], height=z["alto"])
            for z in _dicts(mapa["colisiones"])
        ),
        objects=tuple(
            WorldObject(
                key=o["clave"], label=o["etiqueta"], type=o["tipo"], x=o["x"], y=o["y"], width=o["ancho"],
                height=o["alto"], z_index=o["z"], facing=o["orientacion"], color_hex=o["color"], icon=o["icono"],
                short_code=o["codigoCorto"], collision=o["colision"], visible=o["visible"],
                interaction_prompt=o["indicacion"], interaction_text=o["texto"], option=o["opcion"],
                character=o["personaje"], tool_code=o["herramienta"], unlock_condition=o["desbloqueo"],
                movement_pattern=o["movimiento"], metadata=o["metadatos"],
            )
            for o in _dicts(mapa["objetos"])
        ),
        dialogues=tuple(
            DialogueTree(
                key=d["clave"], speaker=d["hablante"], portrait_key=d["retrato"], emotion=d["emocion"],
                object_key=d["objeto"],
                lines=tuple(
                    DialogueLine(order=line["orden"], speaker=line["hablante"], text=line["texto"], emotion=line["emocion"])
                    for line in _dicts(d["lineas"])
                ),
                choices=tuple(
                    DialogueChoice(
                        key=c["clave"], text=c["texto"], option=c["opcion"], required_tool=c["herramientaRequerida"],
                        effect=c["efecto"], order=c["orden"],
                    )
                    for c in _dicts(d["elecciones"])
                ),
            )
            for d in _dicts(mapa["dialogos"])
        ),
    )


def _feedback(document):
    """``{id de la opción: (mensaje, fundamento)}``: la retroalimentación de la base asociada a una opción."""
    found = {}
    for item in _dicts(document.get("retroalimentacion")):
        if isinstance(item.get("opcion"), str):
            found[item["opcion"]] = (_text(item.get("mensaje")), _text(item.get("fundamentoTeorico")))
    return found


def _base_options(base_scene, entry, keys, feedback):
    extras = _by_id(entry.get("opciones") if entry else None)
    options = []
    for item in _dicts((base_scene.get("decision") or {}).get("opciones")):
        extra = extras.get(item["id"], {})
        message, basis = feedback.get(item["id"], (_text(extra.get("mensaje")), _text(extra.get("fundamento"))))
        options.append(Option(
            key=extra.get("clave", item["id"]), text=_text(item.get("texto")),
            target=keys.of_scene(item.get("siguienteEscena", "")),
            classification=CLASSIFICATION.get(item.get("clasificacion"), "ADEQUATE"),
            prohibited=bool(item.get("conductaProhibida", False)), reason=_text(item.get("motivoProhibicion")),
            consequence=_text(item.get("consecuencia")),
            immediate_feedback=_text(extra.get("retroalimentacionInmediata")), feedback_text=message,
            theory_basis=basis, score=extra.get("puntaje", 0), stress=extra.get("estres", 0),
            penalty=extra.get("penalizacion", 0), effects=extra.get("efectos", {}),
        ))
    return options


def _entry_options(entry):
    return [
        Option(
            key=o["clave"], text=o["texto"], target=o["destino"], classification=o["clasificacion"],
            prohibited=o["prohibida"], reason=o["motivo"], consequence=o["consecuencia"],
            immediate_feedback=o["retroalimentacionInmediata"], feedback_text=o["mensaje"],
            theory_basis=o["fundamento"], score=o["puntaje"], stress=o["estres"], penalty=o["penalizacion"],
            effects=o["efectos"],
        )
        for o in _dicts(entry.get("opciones"))
    ]


def _position(entry, index):
    if entry is not None:
        return entry["posicion"]["x"], entry["posicion"]["y"]
    return GRID_X + GRID_STEP_X * (index % GRID_COLUMNS), GRID_Y + GRID_STEP_Y * (index // GRID_COLUMNS)


def _participants(base_scene, keys, characters):
    """Las personas de la escena como pares ``(clave, nombre)`` de los personajes que el documento define."""
    by_key = {character.key: character for character in characters}
    ids = base_scene.get("participantes")
    found = []
    for ident in ids if isinstance(ids, list) else ():
        character = by_key.get(keys.of_character(ident))
        if character is not None:
            found.append((character.key, character.display_name))
    return found


def _scene(index, entry, base_scene, document, keys, feedback, characters):
    """Una escena: de la base (con los extras de su entrada de ``x-siep``) o completa desde su entrada."""
    in_base = base_scene is not None
    key = entry["clave"] if entry is not None else base_scene["id"]
    if in_base:
        decision = base_scene.get("decision") or {}
        options = _base_options(base_scene, entry, keys, feedback)
        title, narrative = _text(base_scene.get("titulo")), _text(base_scene.get("descripcion"))
        sensitive, warning = bool(base_scene.get("contenidoSensible", False)), _text(base_scene.get("advertencia"))
        prompt = "" if entry and entry.get("preguntaDerivada") else _text(decision.get("pregunta"))
        hints = tuple(_text(h) for h in decision.get("pistas", ())) or tuple(entry.get("pistas", ()) if entry else ())
    else:
        options = _entry_options(entry)
        title, narrative = entry["titulo"], entry["descripcion"]
        sensitive, warning, prompt = entry["sensible"], entry["advertencia"], entry["pregunta"]
        hints = tuple(entry["pistas"])
    if entry is not None:
        start, terminal = entry["inicial"], entry["terminal"]
        support, required = tuple(entry["apoyo"]), tuple(entry["herramientasRequeridas"])
        safe_exit = entry["salidaSeguraObligatoria"]
    else:
        start = _text(document["caso"].get("escenaInicial")) == base_scene["id"]
        terminal, support, required, safe_exit = not options, (), (), False
    x, y = _position(entry, index)
    if entry is not None and entry.get("mapa"):
        world = _world(entry["mapa"])
    elif entry is None or hints:  # sin x-siep no hay sala: se genera; unas pistas sin mapa no tendrían dónde vivir
        present = _participants(base_scene, keys, characters) if in_base else []
        world = scaffold.default_world(key, title, prompt or narrative or title, options, present)
    else:
        world = None
    return Scene(
        key=key, title=title, narrative=narrative, sensitive=sensitive, warning=warning, start=start,
        terminal=terminal, support=support, required_tools=required, safe_exit_required=safe_exit, x=x, y=y,
        prompt=prompt, hints=hints, options=tuple(options), world=world,
    )


def _context(caso, siep):
    if "contexto" in siep:
        return _text(siep["contexto"])
    # Un documento del taller no tiene contexto aparte: su descripción es lo que el estudiante lee.
    return "" if siep else _text(caso.get("descripcion"))


def to_definition(document):
    """La ``CaseDefinition`` de un documento que ya pasó el validador (lo contrario de ``export``)."""
    caso = document["caso"]
    siep = document.get(SIEP_KEY) if isinstance(document.get(SIEP_KEY), dict) else {}
    keys = _Keys(document, siep)
    feedback = _feedback(document)
    characters = _characters(document, siep)
    base_scenes = _by_id(document.get("escenas"))
    if "escenas" in siep:
        specs = [(entry, base_scenes.get(entry.get("id"))) for entry in _dicts(siep["escenas"])]
    else:
        specs = [(None, scene) for scene in base_scenes.values()]
    scenes = tuple(
        _scene(index, entry, base, document, keys, feedback, characters) for index, (entry, base) in enumerate(specs)
    )
    return CaseDefinition(
        code=caso["id"], title=_text(caso.get("titulo")),
        description="" if siep.get("descripcionDerivada") else _text(caso.get("descripcion")),
        semantic_version=_text(caso.get("version")), status="DRAFT", context=_context(caso, siep),
        objectives=tuple(o for o in caso.get("objetivosAprendizaje", ()) if isinstance(o, str)),
        rules=siep.get("reglas", {}), world_schema_version=siep.get("mundoVersion", 2),
        characters=characters, tools=_tools(document, siep), scenes=scenes, rubrics=_rubrics(document, siep),
    )
