"""Mensajes llanos de los hallazgos (R19 de E4): se nombra por título, nunca por un id de DSL.

Las reglas del taller (E4-2a) hablan con ids —«la decisión D01 de la escena E02»—, que se asignan por
posición al exportar y que quien autora no conoce. ``names_of`` recorre el documento y apunta el nombre
de cada elemento que trae id; ``plain_message`` reemplaza cada id por su nombre entre «» y antepone el
elemento cuando el mensaje no lo nombra; ``locate`` dice dónde cae una ruta («escena «Inicio», objeto
«Laura»») para los hallazgos de ``x-siep`` y de los textos.
"""
import re

#: Un id de DSL de la base (los del taller: E01, D01, OP01, P01, H01, R01, RUB-01, CR01), con o sin «».
ID = re.compile(r"«?\b(RUB-\d{2,6}|CR\d{2,6}|OP\d{2,6}|E\d{2,6}|D\d{2,6}|P\d{2,6}|H\d{2,6}|R\d{2,6})\b»?")
#: La etiqueta de regla con que el taller abre algunos mensajes: «[INV-09] falta la clave…».
RULE_TAG = re.compile(r"^\[(?:INV|OCL|PROP|RN)-\d+\]\s*")
SNIPPET = 60

#: Elementos cuyo mensaje ya dice de qué habla: no se les antepone el elemento.
_SELF_NAMING = ("Caso ", "Documento")

# BORRADOR: los nombres de elemento son textos nuevos del servidor, pendientes de Psicología (VD-23).
#: clave de la lista → (sustantivo, claves que nombran al elemento).
_KINDS = {
    "escenas": ("escena", ("titulo",)),
    "opciones": ("opción", ("texto",)),
    "personajes": ("personaje", ("nombre",)),
    "herramientas": ("herramienta", ("nombre", "etiqueta")),
    "rubricas": ("rúbrica", ("nombre",)),
    "criterios": ("criterio", ("titulo",)),
    "retroalimentacion": ("retroalimentación", ()),
    "objetos": ("objeto", ("etiqueta",)),
    "dialogos": ("diálogo", ("hablante",)),
    "lineas": ("línea del diálogo", ()),
    "elecciones": ("elección", ("texto",)),
    "colisiones": ("zona de colisión", ("etiqueta",)),
}


def route_text(route):
    """``('escenas', 1, 'decision')`` → ``'escenas[1].decision'``; la ruta vacía es ``'(raíz)'``."""
    text = ""
    for step in route:
        if isinstance(step, int):
            text += f"[{step}]"
        else:
            text += ("." if text else "") + str(step)
    return text or "(raíz)"


def _clip(value):
    if not isinstance(value, str):
        return ""
    text = " ".join(value.split())
    return text if len(text) <= SNIPPET else text[: SNIPPET - 1] + "…"


def _dicts(value):
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def names_of(document):
    """``{id de DSL: nombre}`` de cada elemento de la base que tiene id y algo con qué nombrarlo."""
    names = {}
    if not isinstance(document, dict):
        return names

    def put(obj, *keys):
        ident = obj.get("id")
        if isinstance(ident, str):
            for key in keys:
                if _clip(obj.get(key)):
                    names[ident] = _clip(obj[key])
                    return

    for scene in _dicts(document.get("escenas")):
        put(scene, "titulo")
        decision = scene.get("decision")
        if isinstance(decision, dict):
            title = _clip(scene.get("titulo"))
            if isinstance(decision.get("id"), str) and title:
                names[decision["id"]] = title
            for option in _dicts(decision.get("opciones")):
                put(option, "texto")
    for character in _dicts(document.get("personajes")):
        put(character, "nombre")
    for tool in _dicts(document.get("herramientas")):
        put(tool, "nombre")
    for rubric in _dicts(document.get("rubricas")):
        put(rubric, "nombre")
        for criterion in _dicts(rubric.get("criterios")):
            put(criterion, "titulo")
    for feedback in _dicts(document.get("retroalimentacion")):
        target = names.get(feedback.get("opcion")) or names.get(feedback.get("decision"))
        if isinstance(feedback.get("id"), str) and target:
            names[feedback["id"]] = target
    return names


def translate(text, names):
    """``text`` con cada id de DSL reemplazado por «nombre»; un id sin nombre se deja como está."""

    def replace(match):
        name = names.get(match.group(1))
        return f"«{name}»" if name else match.group(0)

    return ID.sub(replace, text)


def plain_message(finding, names):
    """El mensaje de un hallazgo del taller, por título; antepone el elemento si el mensaje no lo nombra."""
    message = RULE_TAG.sub("", translate(finding.message, names), count=1)
    subject = translate(finding.element, names)
    named = re.findall(r"«([^»]+)»", subject)
    if subject.startswith(_SELF_NAMING) or any(f"«{name}»" in message for name in named):
        text = message
    else:
        text = f"{subject}: {message}"
    return text[:1].upper() + text[1:]


def _name_of(node, keys, names):
    for key in keys:
        if _clip(node.get(key)):
            return _clip(node[key])
    return _clip(names.get(node.get("id"))) or _clip(node.get("clave")) or _clip(node.get("codigo"))


def locate(document, route, names):
    """Dónde cae ``route``: «escena «Inicio», objeto «Laura»»; vacío si no está dentro de ningún elemento."""
    parts, node, key = [], document, None
    for step in route:
        try:
            node = node[step]
        except (KeyError, IndexError, TypeError):
            break
        if isinstance(step, str):
            key = step
        elif key in _KINDS:
            noun, name_keys = _KINDS[key]
            name = _name_of(node, name_keys, names) if isinstance(node, dict) else ""
            parts.append(f"{noun} «{name}»" if name else f"{noun} {step + 1}")
    return ", ".join(parts)
