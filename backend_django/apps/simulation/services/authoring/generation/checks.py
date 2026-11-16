"""C1 · Python revisa el esqueleto y cada escena que escribió el modelo antes de guardarlos.

Piezas puras: reciben datos (la salida del modelo y el contexto de ``context.del_lugar``) y no hacen consultas. El modelo
nunca es la autoridad: el esquema JSON de la API acota la forma, pero aquí se vuelve a comprobar todo (tipos estrictos,
topes, referencias a lo que el lugar ofrece, vocabularios, grafo del recorrido, filtro de contenido).

``validate_skeleton`` y ``validate_scene`` juntan **todos** los motivos y lanzan ``GenerationInvalid`` una sola vez, para que
la reparación reciba la lista completa. Los motivos son textos fijos (``FIXED_MOTIVOS``, con ``«»`` donde va un nombre
nuestro: la etiqueta de un campo o un número de escena): nunca citan lo que dijo el modelo.

Los borradores validados (``SkeletonDraft``, ``SceneDraft``) son datos inmutables y de forma limpia: textos recortados,
condiciones ya como ``dict`` y claves vacías quitadas en los comentarios. ``as_json``/``from_json`` los llevan a
``skeleton_json`` y ``scenes_json`` y de vuelta.
"""
import json
import re
from dataclasses import asdict, dataclass

from apps.simulation.casedef import conditions
from apps.simulation.casedef.text import CONTROL, LINK, MARKUP, MULTILINE, NOT_TEXT, TOO_LONG, plain_text_problem
from apps.simulation.casedef.vocabulary import (
    EXPRESSIONS,
    GESTURES,
    GOAL_MAX,
    REACTION_LINE_MAX,
    REQUIRES_MAX_CHARS,
    Intensity,
    ResponseClass,
)
from apps.simulation.services import case_rules
from apps.simulation.services.authoring.assistant import prompts as assistant_prompts
from apps.simulation.services.authoring.rules import ENDING_TONES, MAX_ENDINGS

from . import schema

# Topes de texto (los mismos del editor: ``cases``, ``graph``, ``hints``).
MAX_TITLE = 255
MAX_CONTEXT = 4000
MAX_OBJECTIVE = 280
MAX_OBJECTIVES = 12
MAX_WARNING = 400
MAX_ENDING_MESSAGE = 2000
MAX_NARRATION = 2000
MAX_LINE = 600
MAX_OPTION_TEXT = 1200
MAX_FEEDBACK = 1200
MAX_HINT = 280
MIN_ENDINGS = 2
MAX_ENDINGS_GENERATED = min(4, MAX_ENDINGS)
_OPTION_KEY = re.compile(r"[a-z0-9-]{1,40}")
#: Las únicas hojas que admiten un requisito y la condición de un comentario (lista blanca); cualquier otra se rechaza.
_LEAF_KINDS = ("talked", "inspected", "milestone")

#: Todos los motivos posibles (``«»`` marca dónde va un nombre nuestro). ``is_fixed_motivo`` lo comprueba.
_FIXED: set[str] = set()


def _fixed(text: str) -> str:
    _FIXED.add(text)
    return text


def _named(template: str, name: str) -> str:
    """El motivo con ``«»`` llenado con un nombre nuestro (la etiqueta de un campo o un número), nunca del modelo."""
    return template.replace("«»", f"«{name}»")


# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (todos los motivos fijos de este módulo).
# Forma, texto y vocabulario.
SHAPE = _fixed("El campo «» no tiene la forma esperada.")
VOCAB = _fixed("El campo «» trae un valor fuera de la lista permitida.")
EMPTY = _fixed("El texto «» no puede quedar vacío.")
TOO_LONG_TEXT = _fixed("El texto «» supera el largo permitido.")
CONTROL_TEXT = _fixed("El texto «» trae caracteres que no se admiten.")
ONE_LINE = _fixed("El texto «» debe ir en una sola línea.")
MARKUP_TEXT = _fixed("El texto «» debe ser texto plano, sin etiquetas ni enlaces.")
_TEXT_PROBLEMS = {TOO_LONG: TOO_LONG_TEXT, CONTROL: CONTROL_TEXT, MULTILINE: ONE_LINE, MARKUP: MARKUP_TEXT, LINK: MARKUP_TEXT}
GRAPHIC = _fixed(assistant_prompts.GRAPHIC_REASON)
REVICTIMIZING = _fixed(assistant_prompts.REVICTIMIZING_REASON)
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
PERSONAL_DATA_MOTIVO = _fixed(
    "La descripción parece traer datos reales de una persona (correo, teléfono o número de documento). "
    "Cuéntala sin datos que identifiquen a nadie."
)

# Esqueleto.
SCENE_COUNT = _fixed(f"El caso necesita de {schema.MIN_SCENES} a {schema.MAX_SCENES} escenas.")
OBJECTIVE_COUNT = _fixed(f"El caso necesita de 1 a {MAX_OBJECTIVES} objetivos de aprendizaje.")
SAME_ROOM = _fixed("Dos escenas ocupan la misma sala.")
NO_ROOM = _fixed("La escena «» está en una sala que el lugar no tiene.")
NO_PERSON = _fixed("La escena «» atiende a alguien que no está en su sala.")
HIGH_NEEDS_WARNING = _fixed("Una escena de intensidad alta necesita su aviso.")
FINAL_HAS_NEXT = _fixed("Una escena final no puede tener escenas siguientes.")
NEXT_COUNT = _fixed("Una escena que no es final sigue a una o dos escenas.")
NEXT_UNKNOWN = _fixed("Una escena sigue a otra que el esqueleto no tiene.")
NEXT_REPEATED = _fixed("Una escena repite el mismo camino.")
CYCLE = _fixed("El recorrido vuelve sobre una escena ya vista.")
UNREACHABLE = _fixed("Una escena no se alcanza desde la primera.")
NO_BRANCH = _fixed("El recorrido necesita al menos una escena con dos caminos.")
NO_FINAL_SCENE = _fixed("El recorrido necesita al menos una escena final.")
MILESTONES_COUNT = _fixed("El esqueleto necesita al menos un hito.")
UNKNOWN_MILESTONE = _fixed("El esqueleto usa un hito que el lugar no tiene.")
ENDINGS_COUNT = _fixed(f"El caso necesita de {MIN_ENDINGS} a {MAX_ENDINGS_GENERATED} finales.")
ENDING_KEY = _fixed("La clave de un final no es válida o está repetida.")
ENDING_LAST = _fixed("El último final debe ser el final por defecto, sin condición.")
ENDING_NEEDS_WHEN = _fixed("Solo el último final puede quedar sin condición.")
ENDING_FORM = _fixed("La condición de un final solo puede usar hitos, conteos o la persona.")
ENDING_MILESTONE = _fixed("La condición de un final nombra un hito que el esqueleto no usa.")

# Escena.
SCENE_NOT_IN_SKELETON = _fixed("La escena no está en el esqueleto del caso.")
LINES_COUNT = _fixed(f"Una escena lleva de 1 a {schema.MAX_LINES} líneas de diálogo.")
LINE_SPEAKER = _fixed("Una línea la dice alguien que no está en la sala.")
FINAL_WITH_OPTIONS = _fixed("Una escena final no lleva respuestas.")
OPTIONS_MIN = _fixed(f"Una decisión necesita de {schema.MIN_OPTIONS} a {schema.MAX_OPTIONS} respuestas.")
OPTIONS_MAX = _fixed(f"Una decisión admite hasta {schema.MAX_OPTIONS} respuestas.")
OPTION_KEY = _fixed("La clave de una respuesta no es válida o está repetida.")
NO_RECOMMENDED = _fixed("La escena necesita al menos una respuesta recomendada.")
ONLY_RECOMMENDED = _fixed("La escena necesita al menos una respuesta que no sea la recomendada.")
REASON_MISSING = _fixed("Una respuesta contraindicada necesita su razón.")
REASON_EXTRA = _fixed("Solo una respuesta contraindicada lleva razón de prohibición.")
DESTINATION = _fixed("Una respuesta lleva a una escena que no sigue a esta.")
NO_OPTION_TO = _fixed("Un camino del recorrido no tiene ninguna respuesta que lleve a él.")
EFFECT = _fixed("El efecto de una respuesta sobre la persona debe ser -1, 0 o 1.")
OPTION_MILESTONE = _fixed("Una respuesta cumple un hito que el esqueleto no usa.")
COMPETENCY = _fixed("Una respuesta toca una competencia que la rúbrica no tiene.")
ALL_REQUIRE = _fixed("Toda decisión necesita al menos una respuesta sin requisito.")
HINTS_MAX = _fixed(f"Una escena admite hasta {schema.MAX_HINTS} pistas.")
COMMENTS_MAX = _fixed(f"Una escena admite hasta {schema.MAX_COMMENTS} comentarios.")
COMMENT_SPEAKER = _fixed("Un comentario lo dice alguien que no está en la sala.")

#: Los motivos de un requisito (``requiere``) y de la condición de un comentario (``cuando``), por tipo de problema.
_CONDITION_MOTIVOS = {
    "requisito": {
        "form": _fixed("Un requisito no tiene la forma esperada."),
        "long": _fixed("Un requisito supera el largo permitido."),
        "tool": _fixed("Un requisito usa algo que no se puede conseguir en este caso."),
        "person": _fixed("Un requisito nombra a alguien que no está en la sala."),
        "object": _fixed("Un requisito nombra un objeto que no está en la sala."),
        "milestone": _fixed("Un requisito usa un hito que el caso no declara."),
    },
    "comentario": {
        "form": _fixed("La condición de un comentario no tiene la forma esperada."),
        "long": _fixed("La condición de un comentario supera el largo permitido."),
        "tool": _fixed("Un comentario depende de algo que no se puede conseguir en este caso."),
        "person": _fixed("Un comentario depende de algo que no está en la sala."),
        "object": _fixed("Un comentario depende de algo que no está en la sala."),
        "milestone": _fixed("Un comentario usa un hito que el caso no declara."),
    },
}

#: Los motivos de ``FIXED_MOTIVOS`` ya están todos registrados cuando termina el módulo de constantes.
FIXED_MOTIVOS = frozenset(_FIXED)
_FIELD_NAME = re.compile(r"«[^»]*»")


def is_fixed_motivo(motivo: str) -> bool:
    """¿``motivo`` es uno de los textos fijos de ``FIXED_MOTIVOS`` (con el nombre de nuestro campo llenado)?"""
    return _FIELD_NAME.sub("«»", motivo) in FIXED_MOTIVOS


class GenerationInvalid(Exception):
    """La salida del modelo no se puede usar. ``motivos`` son textos fijos; ``escena`` es la sala de la escena (o ``None``)."""

    def __init__(self, motivos: list[str], escena: str | None = None):
        super().__init__("; ".join(motivos))
        self.motivos = list(motivos)
        self.escena = escena


# --- La descripción de la docente: nada que identifique a una persona real ------------------------------------------------
# Expresiones acotadas, sin dependencias. Solo dicen el TIPO de dato hallado; nunca devuelven el dato ni un fragmento.
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PHONE = (
    # Número internacional: «+» y 8 o más dígitos.
    re.compile(r"\+\s?\d(?:[\s.\-()]?\d){7,}"),
    # Móvil de Colombia: 10 dígitos que empiezan por 3, con o sin 57 / +57.
    re.compile(r"(?<!\d)(?:\+?57[\s.\-]?)?3\d{2}[\s.\-]?\d{3}[\s.\-]?\d{4}(?!\d)"),
    # Fijo con indicativo (601 a 608), con o sin paréntesis.
    re.compile(r"(?<!\d)\(?60[1-8]\)?[\s.\-]?\d{3}[\s.\-]?\d{4}(?!\d)"),
)
_DOCUMENT_KEYWORD = (
    r"(?:(?i:c[eé]dula|documento|pasaporte|identificaci[oó]n)|C\.\s?C\.?|CC|T\.\s?I\.?|TI|NIT|nit)"
)
_DOCUMENT_AFTER_KEYWORD = re.compile(
    rf"(?<![\w.]){_DOCUMENT_KEYWORD}(?![^\W\d])"
    r"(?:\s+de\s+(?i:ciudadan[ií]a|extranjer[ií]a|identidad))?"
    r"(?:[\s:#.]*(?i:n\.?\s?[º°o]\.?|no\.?|n[uú]mero|num\.?))*"
    r"[\s:#.]*(\d[\d. ]*\d)(?!\d)"
)
_BARE_NUMBER = re.compile(r"(?<![\d.])(?:\d{8,10}|\d{1,3}(?:\.\d{3}){2,3})(?![\d])")
_PERSONAL_DATA_KINDS = ("email", "phone", "document")


def _blank(texto: str, patrones) -> str:
    for patron in patrones:
        texto = patron.sub(" ", texto)
    return texto


def personal_data_kinds(texto: str) -> tuple[str, ...]:
    """Los tipos de dato personal que trae ``texto``, en orden fijo (``email``, ``phone``, ``document``); vacío si no hay.

    Un hallazgo se borra antes de buscar el siguiente tipo, para que un celular no cuente además como documento.
    """
    texto = str(texto)
    halladas = set()
    if _EMAIL.search(texto):
        halladas.add("email")
    texto = _blank(texto, (_EMAIL,))
    if any(patron.search(texto) for patron in _PHONE):
        halladas.add("phone")
    texto = _blank(texto, _PHONE)
    por_palabra = any(5 <= sum(c.isdigit() for c in m.group(1)) <= 12 for m in _DOCUMENT_AFTER_KEYWORD.finditer(texto))
    sueltos = any(8 <= sum(c.isdigit() for c in m.group(0)) <= 10 for m in _BARE_NUMBER.finditer(texto))
    if por_palabra or sueltos:
        halladas.add("document")
    return tuple(tipo for tipo in _PERSONAL_DATA_KINDS if tipo in halladas)


def check_description(texto: str) -> None:
    """Lanza ``GenerationInvalid([PERSONAL_DATA_MOTIVO])`` si la descripción trae un correo, un teléfono o un documento."""
    if personal_data_kinds(texto):
        raise GenerationInvalid([PERSONAL_DATA_MOTIVO], escena=None)


@dataclass(frozen=True)
class SceneOutline:
    sala: str
    titulo: str
    objetivo: str
    persona: str
    intensidad: str
    advertencia: str
    final: bool
    siguientes: tuple[str, ...]


@dataclass(frozen=True)
class SkeletonDraft:
    titulo: str
    contexto: str
    objetivos: tuple[str, ...]
    escenas: tuple[SceneOutline, ...]
    hitos: tuple[str, ...]
    #: ``{key, title, message, tone, when?}``; ``when`` ya es un ``dict`` y falta en el final por defecto.
    finales: tuple[dict, ...]


@dataclass(frozen=True)
class SceneDraft:
    narracion: str
    #: ``{personaje, texto, emocion}``.
    lineas: tuple[dict, ...]
    #: ``{clave, texto, clase, retroalimentacion, razonProhibicion, destino, efectoVinculo, efectoActivacion, hitos,
    #: competencias, requiere, reaccionLinea, reaccionEmocion, reaccionGesto}``; ``requiere`` es un ``dict`` (``{}`` si no hay).
    opciones: tuple[dict, ...]
    pistas: tuple[str, ...]
    #: ``{personaje, linea}`` y, solo si no están vacíos, ``cuando`` (``dict``), ``emocion`` y ``gesto``.
    comentarios: tuple[dict, ...]


def as_json(draft) -> dict:
    """El borrador como datos JSON puros (listas y diccionarios), listo para ``skeleton_json`` o ``scenes_json``."""
    return json.loads(json.dumps(asdict(draft), ensure_ascii=False))


def from_json(cls, data: dict):
    """Lo inverso de ``as_json``: ``cls`` es ``SkeletonDraft`` o ``SceneDraft``; los datos los guardó este módulo."""
    if cls is SkeletonDraft:
        return SkeletonDraft(
            titulo=data["titulo"], contexto=data["contexto"], objetivos=tuple(data["objetivos"]),
            escenas=tuple(
                SceneOutline(**{**escena, "siguientes": tuple(escena["siguientes"])}) for escena in data["escenas"]
            ),
            hitos=tuple(data["hitos"]), finales=tuple(dict(final) for final in data["finales"]),
        )
    if cls is SceneDraft:
        return SceneDraft(
            narracion=data["narracion"], lineas=tuple(dict(x) for x in data["lineas"]),
            opciones=tuple(dict(x) for x in data["opciones"]), pistas=tuple(data["pistas"]),
            comentarios=tuple(dict(x) for x in data["comentarios"]),
        )
    raise TypeError("from_json solo conoce SkeletonDraft y SceneDraft")


class _Collector:
    """Junta los motivos (sin repetir, en orden) y trae los lectores estrictos de cada tipo de dato."""

    def __init__(self):
        self.motivos: list[str] = []

    def add(self, motivo: str) -> None:
        if motivo not in self.motivos:
            self.motivos.append(motivo)

    def shape(self, field: str) -> None:
        self.add(_named(SHAPE, field))

    def raise_if_any(self, escena: str | None = None) -> None:
        if self.motivos:
            raise GenerationInvalid(self.motivos, escena)

    def obj(self, value, keys, field: str) -> bool:
        """¿Es un diccionario con todas esas claves? Si no, anota la forma de ``field``."""
        if isinstance(value, dict) and all(key in value for key in keys):
            return True
        self.shape(field)
        return False

    def items(self, value, field: str) -> list:
        """La lista de ``value`` (``[]`` y la forma anotada si no es lista)."""
        if isinstance(value, list):
            return value
        self.shape(field)
        return []

    def strings(self, value, field: str) -> list[str]:
        """Una lista de cadenas; lo que no sea cadena anota la forma de ``field`` y se descarta."""
        out = []
        for item in self.items(value, field):
            if isinstance(item, str):
                out.append(item)
            else:
                self.shape(field)
        return out

    def text(self, value, maximum: int, label: str, *, required=False, multiline=False, revictimizing=False) -> str:
        """El texto plano recortado; anota el motivo fijo del primer problema (tipo, tope, forma, filtro de contenido)."""
        if not isinstance(value, str):
            self.shape(label)
            return ""
        if not value.strip():
            if required:
                self.add(_named(EMPTY, label))
            return ""
        problem = plain_text_problem(value, maximum, multiline=multiline)
        if problem is not None:
            self.add(_named(_TEXT_PROBLEMS.get(problem[0], SHAPE) if problem[0] != NOT_TEXT else SHAPE, label))
            return ""
        reason = assistant_prompts.check_text(value, allow_revictimizing=revictimizing)
        if reason is not None:
            self.add(reason)
            return ""
        return value.strip()

    def enum(self, value, allowed, field: str) -> str:
        if isinstance(value, str) and value in allowed:
            return value
        self.add(_named(VOCAB, field))
        return ""


def _hojas(cond) -> list[tuple[str, object]]:
    """Cada hoja ``(tipo, valor)`` de una condición ya validada (dentro de ``all``, ``any`` y ``not``)."""
    for group in ("all", "any"):
        if group in cond:
            return [leaf for item in cond[group] for leaf in _hojas(item)]
    if "not" in cond:
        return _hojas(cond["not"])
    for kind in _LEAF_KINDS:
        if len(cond) == 1 and kind in cond:
            return [(kind, cond[kind])]
    return [("otra", cond)]  # un conteo, la persona, un hecho de herramienta...: no es una hoja admitida


def _hitos_de(cond) -> list[str]:
    return [value for kind, value in _hojas(cond) if kind == "milestone"]


def _parse_condition(c: _Collector, value, maximum: int, field: str, motivo_forma: str, motivo_largo: str):
    """El ``dict`` de una condición escrita como texto JSON; ``None`` si falta (``""``) o si no sirve (el motivo ya se anotó)."""
    if not isinstance(value, str):
        c.shape(field)
        return None
    if not value.strip():
        return None
    if len(value) > maximum:
        c.add(motivo_largo)
        return None
    try:
        cond = json.loads(value)
    except (ValueError, RecursionError):
        c.add(motivo_forma)
        return None
    return cond if isinstance(cond, dict) else _bad(c, motivo_forma)


def _bad(c: _Collector, motivo: str):
    c.add(motivo)
    return None


def _requirement(c: _Collector, value, kind: str, room: dict, hitos: set[str], field: str) -> dict:
    """El ``requiere`` de una opción (``kind="requisito"``) o el ``cuando`` de un comentario (``"comentario"``).

    Solo ``talked`` (una persona de la sala), ``inspected`` (un objeto de la sala), ``milestone`` (un hito del esqueleto) y sus
    combinaciones ``all``, ``any`` y ``not``. ``{}`` si no hay condición o si no sirve (el motivo ya se anotó).
    """
    motivos = _CONDITION_MOTIVOS[kind]
    cond = _parse_condition(c, value, REQUIRES_MAX_CHARS, field, motivos["form"], motivos["long"])
    if cond is None:
        return {}
    if not conditions.is_valid(cond, facts=True):
        c.add(motivos["form"])
        return {}
    people = {p["clave"] for p in room["personas"]}
    objects = {o["clave"] for o in room["objetos"]}
    for leaf_kind, leaf in _hojas(cond):
        if leaf_kind not in _LEAF_KINDS:
            c.add(motivos["tool"])
        elif leaf_kind == "talked" and leaf not in people:
            c.add(motivos["person"])
        elif leaf_kind == "inspected" and leaf not in objects:
            c.add(motivos["object"])
        elif leaf_kind == "milestone" and leaf not in hitos:
            c.add(motivos["milestone"])
    return cond


def _rooms(ctx: dict) -> dict:
    return {room["id"]: room for room in ctx.get("salas", [])}


def _speakers(room: dict) -> set[str]:
    """Quienes pueden hablar en una sala: el personaje de la biblioteca de cada PERSON (lo que el documento llama ``personaje``)."""
    return {p["personaje"] for p in room["personas"]}


# --------------------------------------------------------------------------------------------------------------------
# Esqueleto


def _outline(c: _Collector, raw, position: int, ctx_rooms: dict) -> SceneOutline | None:
    if not c.obj(raw, schema.SKELETON["properties"]["escenas"]["items"]["required"], "escenas"):
        return None
    name = str(position)
    sala = raw["sala"]
    if not isinstance(sala, str):
        c.shape("escenas")
        return None
    room = ctx_rooms.get(sala)
    if room is None:
        c.add(_named(NO_ROOM, name))
    persona = raw["persona"]
    if not isinstance(persona, str):
        c.shape("escenas")
    elif room is not None and persona not in {p["clave"] for p in room["personas"]}:
        c.add(_named(NO_PERSON, name))
    intensidad = c.enum(raw["intensidad"], tuple(member.value for member in Intensity), "intensidad")
    advertencia = c.text(raw["advertencia"], MAX_WARNING, "advertencia")
    if intensidad == Intensity.HIGH.value and not advertencia:
        c.add(HIGH_NEEDS_WARNING)
    if not isinstance(raw["final"], bool):
        c.shape("escenas")
    siguientes = c.strings(raw["siguientes"], "escenas")
    return SceneOutline(
        sala=sala,
        titulo=c.text(raw["titulo"], MAX_TITLE, "título de la escena", required=True),
        objetivo=c.text(raw["objetivo"], GOAL_MAX, "objetivo de la escena", required=True),
        persona=persona if isinstance(persona, str) else "",
        intensidad=intensidad, advertencia=advertencia,
        final=raw["final"] is True, siguientes=tuple(siguientes),
    )


def _graph(c: _Collector, outlines: list[SceneOutline]) -> None:
    """Las reglas del recorrido: salas únicas, siguientes que existen, acíclico, todo alcanzable, bifurcación y un final."""
    rooms = [o.sala for o in outlines]
    if len(set(rooms)) != len(rooms):
        c.add(SAME_ROOM)
    known = set(rooms)
    for outline in outlines:
        if outline.final:
            if outline.siguientes:
                c.add(FINAL_HAS_NEXT)
        elif not 1 <= len(outline.siguientes) <= 2:
            c.add(NEXT_COUNT)
        if len(set(outline.siguientes)) != len(outline.siguientes):
            c.add(NEXT_REPEATED)
        if any(nxt not in known for nxt in outline.siguientes):
            c.add(NEXT_UNKNOWN)
    edges = {o.sala: [n for n in dict.fromkeys(o.siguientes) if n in known] for o in outlines}
    if _has_cycle(edges):
        c.add(CYCLE)
    if outlines and set(_reachable(edges, outlines[0].sala)) != known:
        c.add(UNREACHABLE)
    if not any(len(set(o.siguientes)) == 2 for o in outlines):
        c.add(NO_BRANCH)
    if not any(o.final for o in outlines):
        c.add(NO_FINAL_SCENE)


def _has_cycle(edges: dict[str, list[str]]) -> bool:
    state: dict[str, int] = {}  # 1 = en la pila, 2 = terminado

    def visit(node: str) -> bool:
        state[node] = 1
        for nxt in edges.get(node, ()):
            if state.get(nxt) == 1 or (nxt not in state and visit(nxt)):
                return True
        state[node] = 2
        return False

    return any(node not in state and visit(node) for node in edges)


def _reachable(edges: dict[str, list[str]], start: str) -> list[str]:
    seen, queue = [start], [start]
    while queue:
        for nxt in edges.get(queue.pop(), ()):
            if nxt not in seen:
                seen.append(nxt)
                queue.append(nxt)
    return seen


def _endings(c: _Collector, raw, milestones: set[str]) -> list[dict]:
    items = c.items(raw, "finales")
    if not MIN_ENDINGS <= len(items) <= MAX_ENDINGS_GENERATED:
        c.add(ENDINGS_COUNT)
    keys: list[str] = []
    endings = []
    for position, item in enumerate(items):
        if not c.obj(item, schema.SKELETON["properties"]["finales"]["items"]["required"], "finales"):
            continue
        is_last = position == len(items) - 1
        key = item["clave"]
        if not isinstance(key, str) or not case_rules.NAME.fullmatch(key) or key in keys:
            c.add(ENDING_KEY)
        else:
            keys.append(key)
        ending = {
            "key": key if isinstance(key, str) else "",
            "title": c.text(item["titulo"], MAX_TITLE, "título del final", required=True),
            "message": c.text(item["mensaje"], MAX_ENDING_MESSAGE, "mensaje del final", required=True, multiline=True),
            "tone": c.enum(item["tono"], ENDING_TONES, "tono"),
        }
        when = item["cuando"]
        if not isinstance(when, str):
            c.shape("finales")
        elif when.strip():
            if is_last:
                c.add(ENDING_LAST)
            cond = _parse_condition(c, when, REQUIRES_MAX_CHARS, "finales", ENDING_FORM, ENDING_FORM)
            if cond is not None:
                if not conditions.is_valid(cond):  # los finales no admiten hechos de exploración
                    c.add(ENDING_FORM)
                else:
                    if any(key_ not in milestones for key_ in _hitos_de(cond)):
                        c.add(ENDING_MILESTONE)
                    ending["when"] = cond
        elif not is_last:
            c.add(ENDING_NEEDS_WHEN)
        endings.append(ending)
    return endings


def validate_skeleton(raw: dict, ctx: dict) -> SkeletonDraft:
    """El esqueleto del modelo como ``SkeletonDraft``, o ``GenerationInvalid`` con todos los motivos."""
    c = _Collector()
    if not c.obj(raw, schema.SKELETON["required"], "esqueleto"):
        c.raise_if_any()
    rooms = _rooms(ctx)
    titulo = c.text(raw["titulo"], MAX_TITLE, "título", required=True)
    contexto = c.text(raw["contexto"], MAX_CONTEXT, "contexto", required=True, multiline=True)
    objectives_raw = c.items(raw["objetivosAprendizaje"], "objetivosAprendizaje")
    if not 1 <= len(objectives_raw) <= MAX_OBJECTIVES:
        c.add(OBJECTIVE_COUNT)
    objetivos = [
        c.text(item, MAX_OBJECTIVE, "objetivo de aprendizaje", required=True) for item in objectives_raw[:MAX_OBJECTIVES + 1]
    ]

    scenes_raw = c.items(raw["escenas"], "escenas")
    if not schema.MIN_SCENES <= len(scenes_raw) <= schema.MAX_SCENES:
        c.add(SCENE_COUNT)
    outlines = [
        outline for position, item in enumerate(scenes_raw[:schema.MAX_SCENES + 1], 1)
        if (outline := _outline(c, item, position, rooms)) is not None
    ]
    _graph(c, outlines)

    place_milestones = {hito["clave"] for hito in ctx.get("hitos", [])}
    hitos = c.strings(raw["hitos"], "hitos")
    if not hitos:
        c.add(MILESTONES_COUNT)
    if any(hito not in place_milestones for hito in hitos):
        c.add(UNKNOWN_MILESTONE)
    endings = _endings(c, raw["finales"], set(hitos))

    c.raise_if_any()
    return SkeletonDraft(
        titulo=titulo, contexto=contexto, objetivos=tuple(objetivos), escenas=tuple(outlines),
        hitos=tuple(dict.fromkeys(hitos)), finales=tuple(endings),
    )


# --------------------------------------------------------------------------------------------------------------------
# Escena


def _lines(c: _Collector, raw, room: dict) -> list[dict]:
    items = c.items(raw, "lineas")
    if not 1 <= len(items) <= schema.MAX_LINES:
        c.add(LINES_COUNT)
    speakers = _speakers(room)
    lines = []
    for item in items[:schema.MAX_LINES + 1]:
        if not c.obj(item, schema.SCENE["properties"]["lineas"]["items"]["required"], "lineas"):
            continue
        if not isinstance(item["personaje"], str) or item["personaje"] not in speakers:
            c.add(LINE_SPEAKER)
        lines.append({
            "personaje": item["personaje"] if isinstance(item["personaje"], str) else "",
            "texto": c.text(item["texto"], MAX_LINE, "línea", required=True),
            "emocion": c.enum(item["emocion"], EXPRESSIONS, "emocion"),
        })
    return lines


def _effect(c: _Collector, value) -> int:
    if isinstance(value, int) and not isinstance(value, bool) and value in (-1, 0, 1):
        return value
    c.add(EFFECT)
    return 0


def _option(c: _Collector, raw, room: dict, sk: SkeletonDraft, competencies: set[str]) -> dict | None:
    if not c.obj(raw, schema.SCENE["properties"]["opciones"]["items"]["required"], "opciones"):
        return None
    clase = c.enum(raw["clase"], tuple(member.value for member in ResponseClass), "clase")
    contraindicated = clase == ResponseClass.CONTRAINDICATED.value
    reason = c.text(raw["razonProhibicion"], MAX_FEEDBACK, "razón de la respuesta contraindicada", revictimizing=True)
    if contraindicated and not reason:
        c.add(REASON_MISSING)
    elif reason and clase and not contraindicated:
        c.add(REASON_EXTRA)
    free = contraindicated and bool(reason)  # lo revictimizante solo va en una contraindicada con su razón
    hitos = c.strings(raw["hitos"], "hitos")
    if any(h not in sk.hitos for h in hitos):
        c.add(OPTION_MILESTONE)
    comps = c.strings(raw["competencias"], "competencias")
    if any(code not in competencies for code in comps):
        c.add(COMPETENCY)
    key = raw["clave"]
    if not isinstance(key, str):
        c.shape("opciones")
    destination = raw["destino"]
    if not isinstance(destination, str):
        c.shape("opciones")
    return {
        "clave": key if isinstance(key, str) else "",
        "texto": c.text(raw["texto"], MAX_OPTION_TEXT, "respuesta", required=True, multiline=True, revictimizing=free),
        "clase": clase,
        "retroalimentacion": c.text(
            raw["retroalimentacion"], MAX_FEEDBACK, "retroalimentación", required=True, multiline=True, revictimizing=free,
        ),
        "razonProhibicion": reason,
        "destino": destination if isinstance(destination, str) else "",
        "efectoVinculo": _effect(c, raw["efectoVinculo"]),
        "efectoActivacion": _effect(c, raw["efectoActivacion"]),
        "hitos": hitos,
        "competencias": comps,
        "requiere": _requirement(c, raw["requiere"], "requisito", room, set(sk.hitos), "requiere"),
        "reaccionLinea": c.text(raw["reaccionLinea"], REACTION_LINE_MAX, "reacción", revictimizing=free),
        "reaccionEmocion": c.enum(raw["reaccionEmocion"], ("", *EXPRESSIONS), "reaccionEmocion"),
        "reaccionGesto": c.enum(raw["reaccionGesto"], ("", *GESTURES), "reaccionGesto"),
    }


def _options(c: _Collector, raw, outline: SceneOutline, room: dict, sk: SkeletonDraft, competencies: set[str]) -> list[dict]:
    items = c.items(raw, "opciones")
    if outline.final:
        if items:
            c.add(FINAL_WITH_OPTIONS)
        return []
    if len(items) < schema.MIN_OPTIONS:
        c.add(OPTIONS_MIN)
    if len(items) > schema.MAX_OPTIONS:
        c.add(OPTIONS_MAX)
    options = [
        option for item in items[:schema.MAX_OPTIONS + 1] if (option := _option(c, item, room, sk, competencies)) is not None
    ]
    keys = [o["clave"] for o in options]
    if any(not _OPTION_KEY.fullmatch(key) for key in keys) or len(set(keys)) != len(keys):
        c.add(OPTION_KEY)
    classes = [o["clase"] for o in options if o["clase"]]
    if ResponseClass.RECOMMENDED.value not in classes:
        c.add(NO_RECOMMENDED)
    if classes and all(clase == ResponseClass.RECOMMENDED.value for clase in classes):
        c.add(ONLY_RECOMMENDED)
    if options and all(o["requiere"] for o in options):
        c.add(ALL_REQUIRE)
    if any(o["destino"] not in outline.siguientes for o in options):
        c.add(DESTINATION)
    if any(nxt not in {o["destino"] for o in options} for nxt in outline.siguientes):
        c.add(NO_OPTION_TO)
    return options


def _comments(c: _Collector, raw, room: dict, hitos: set[str]) -> list[dict]:
    items = c.items(raw, "comentarios")
    if len(items) > schema.MAX_COMMENTS:
        c.add(COMMENTS_MAX)
    speakers = _speakers(room)
    comments = []
    for item in items[:schema.MAX_COMMENTS + 1]:
        if not c.obj(item, schema.SCENE["properties"]["comentarios"]["items"]["required"], "comentarios"):
            continue
        if not isinstance(item["personaje"], str) or item["personaje"] not in speakers:
            c.add(COMMENT_SPEAKER)
        comment = {
            "personaje": item["personaje"] if isinstance(item["personaje"], str) else "",
            "linea": c.text(item["linea"], REACTION_LINE_MAX, "comentario", required=True),
        }
        when = _requirement(c, item["cuando"], "comentario", room, hitos, "comentarios")
        emotion = c.enum(item["emocion"], ("", *EXPRESSIONS), "emocion")
        gesture = c.enum(item["gesto"], ("", *GESTURES), "gesto")
        for key, value in (("cuando", when), ("emocion", emotion), ("gesto", gesture)):
            if value:
                comment[key] = value
        comments.append(comment)
    return comments


def validate_scene(raw: dict, sk: SkeletonDraft, clave: str, ctx: dict) -> SceneDraft:
    """La escena de la sala ``clave`` como ``SceneDraft``, o ``GenerationInvalid`` (con ``escena=clave``) con todos los motivos."""
    c = _Collector()
    outline = next((o for o in sk.escenas if o.sala == clave), None)
    room = _rooms(ctx).get(clave)
    if outline is None or room is None:
        c.add(SCENE_NOT_IN_SKELETON)
        c.raise_if_any(clave)
    if not c.obj(raw, schema.SCENE["required"], "escena"):
        c.raise_if_any(clave)
    competencies = {comp["codigo"] for comp in ctx.get("competencias", [])}

    narracion = c.text(raw["narracion"], MAX_NARRATION, "narración", required=True, multiline=True)
    lines = _lines(c, raw["lineas"], room)
    options = _options(c, raw["opciones"], outline, room, sk, competencies)
    hints = c.strings(raw["pistas"], "pistas")
    if len(hints) > schema.MAX_HINTS:
        c.add(HINTS_MAX)
    hints = [c.text(hint, MAX_HINT, "pista", required=True) for hint in hints[:schema.MAX_HINTS + 1]]
    comments = _comments(c, raw["comentarios"], room, set(sk.hitos))

    c.raise_if_any(clave)
    return SceneDraft(
        narracion=narracion, lineas=tuple(lines), opciones=tuple(options), pistas=tuple(hints), comentarios=tuple(comments),
    )
