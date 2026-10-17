"""Límites de tamaño del documento (R18 de E4): hasta dónde lee el validador.

Un documento que llega de fuera no puede agotar la memoria ni la pila de quien lo lee. Los límites
**duros** (contenedores y profundidad) se miden con un recorrido iterativo y, si se superan, el
validador no mira nada más: informa y se detiene. Los **blandos** (escenas, opciones, personajes y
herramientas) son los topes de contenido del caso y conviven con los demás hallazgos. Los de la lectura
de bytes (tamaño, codificación, claves repetidas) son de ``parse``/el importador.
"""
from .report import ERROR, Issue

CODE = "DSL.LIMIT_EXCEEDED"
MAX_DEPTH = 20
MAX_CONTAINERS = 20_000
MAX_SCENES = 200
MAX_OPTIONS_PER_DECISION = 50
MAX_CHARACTERS = 100
MAX_TOOLS = 100


def measure(document):
    """``(contenedores, profundidad)`` del documento; se detiene en cuanto un tope se supera."""
    containers, depth = 0, 0
    pending = [(document, 1)]
    while pending:
        node, level = pending.pop()
        if isinstance(node, dict):
            children = node.values()
        elif isinstance(node, list):
            children = node
        else:
            continue
        containers += 1
        depth = max(depth, level)
        if containers > MAX_CONTAINERS or depth > MAX_DEPTH:
            break
        pending.extend((child, level + 1) for child in children if isinstance(child, (dict, list)))
    return containers, depth


def _issue(path, message):
    return Issue(CODE, ERROR, path, message)


def hard(document):
    """Los hallazgos de los límites duros; si hay alguno, el documento no se mira más."""
    containers, depth = measure(document)
    issues = []
    # BORRADOR: textos nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).
    if containers > MAX_CONTAINERS:
        issues.append(_issue("", f"El documento es demasiado grande: admite hasta {MAX_CONTAINERS} elementos anidados."))
    if depth > MAX_DEPTH:
        issues.append(_issue("", f"El documento está anidado a demasiada profundidad: admite hasta {MAX_DEPTH} niveles."))
    return issues


def _list(value):
    return value if isinstance(value, list) else []


def soft(document):
    """Los topes de contenido: escenas, opciones por decisión, personajes y herramientas."""
    if not isinstance(document, dict):
        return []
    issues = []
    # BORRADOR: textos nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).
    scenes = _list(document.get("escenas"))
    if len(scenes) > MAX_SCENES:
        issues.append(_issue("escenas", f"El caso tiene {len(scenes)} escenas: admite hasta {MAX_SCENES}."))
    for position, scene in enumerate(scenes[:MAX_SCENES + 1]):
        decision = scene.get("decision") if isinstance(scene, dict) else None
        options = _list(decision.get("opciones")) if isinstance(decision, dict) else []
        if len(options) > MAX_OPTIONS_PER_DECISION:
            issues.append(_issue(
                f"escenas[{position}].decision.opciones",
                f"Una decisión tiene {len(options)} opciones: admite hasta {MAX_OPTIONS_PER_DECISION}.",
            ))
    for key, noun, maximum in (("personajes", "personajes", MAX_CHARACTERS), ("herramientas", "herramientas", MAX_TOOLS)):
        found = _list(document.get(key))
        if len(found) > maximum:
            issues.append(_issue(key, f"El caso tiene {len(found)} {noun}: admite hasta {maximum}."))
    return issues
