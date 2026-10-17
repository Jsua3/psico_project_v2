"""Los textos del documento (R18 de E4): se rechazan, nunca se limpian en silencio.

Un documento que entra por la importación no pasa por los formularios del editor, así que cada texto
suyo pasa por la regla de texto plano de E3 (``text``) aquí:

- los campos que E3 rige —objetivos, contexto, descripción del caso, pistas, enunciados, consecuencia,
  mensaje y fundamento, nombres de los personajes— conservan su regla **estricta**: tope de caracteres,
  una sola línea donde corresponde, sin etiquetas y sin enlaces de ningún tipo;
- los demás textos (narrativa, líneas de diálogo, textos de objetos…) no pueden llevar caracteres de
  control, etiquetas ni enlaces que no sean ``https``.

No se quita nada: un texto con marcado o con un enlace ajeno es un hallazgo con su ruta y la persona
decide. Los textos con caracteres de control tampoco pasarían a la base de datos (PostgreSQL no admite
el NUL).
"""
from . import messages, text
from .report import ERROR, PREFIX, Issue

#: ruta con ``*`` por cada posición de lista → (tope de caracteres, ¿admite varias líneas?).
GOVERNED = {
    ("caso", "descripcion"): (4000, True),
    ("caso", "objetivosAprendizaje", "*"): (280, False),
    ("personajes", "*", "nombre"): (255, False),
    ("personajes", "*", "rol"): (255, False),
    ("escenas", "*", "decision", "pregunta"): (1200, True),
    ("escenas", "*", "decision", "pistas", "*"): (280, False),
    ("escenas", "*", "decision", "opciones", "*", "consecuencia"): (1200, True),
    ("retroalimentacion", "*", "mensaje"): (1200, True),
    ("retroalimentacion", "*", "fundamentoTeorico"): (1200, True),
    ("x-siep", "contexto"): (4000, True),
    ("x-siep", "personajes", "*", "nombre"): (255, False),
    ("x-siep", "personajes", "*", "rol"): (255, False),
    ("x-siep", "personajes", "*", "retrato"): (120, False),
    ("x-siep", "escenas", "*", "pregunta"): (1200, True),
    ("x-siep", "escenas", "*", "pistas", "*"): (280, False),
    ("x-siep", "escenas", "*", "opciones", "*", "consecuencia"): (1200, True),
    ("x-siep", "escenas", "*", "opciones", "*", "mensaje"): (1200, True),
    ("x-siep", "escenas", "*", "opciones", "*", "fundamento"): (1200, True),
}

# BORRADOR: textos nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).
LAX_LINK = "No puede llevar enlaces que no sean https."
#: campo del documento → cómo se nombra en el mensaje.
LABELS = {
    "descripcion": "descripción", "titulo": "título", "nombre": "nombre", "rol": "rol", "texto": "texto",
    "pregunta": "pregunta", "pistas": "pista", "consecuencia": "consecuencia", "mensaje": "mensaje",
    "fundamentoTeorico": "fundamento teórico", "fundamento": "fundamento", "advertencia": "advertencia",
    "motivoProhibicion": "motivo de la prohibición", "motivo": "motivo", "objetivosAprendizaje": "objetivo",
    "contexto": "contexto del caso", "etiqueta": "etiqueta", "indicacion": "indicación",
    "hablante": "hablante", "retroalimentacionInmediata": "retroalimentación inmediata",
    "retrato": "retrato", "apoyo": "recurso de apoyo",
}


def strings(document):
    """``(ruta, texto)`` de cada cadena del documento (no de sus claves), con un recorrido iterativo."""
    pending = [((), document)]
    while pending:
        route, node = pending.pop()
        if isinstance(node, str):
            yield route, node
        elif isinstance(node, dict):
            pending.extend((route + (key,), value) for key, value in node.items())
        elif isinstance(node, list):
            pending.extend((route + (position,), value) for position, value in enumerate(node))


def _shape(route):
    return tuple("*" if isinstance(step, int) else step for step in route)


def _lax_problem(value):
    if text.CONTROL_CHARS.search(value):
        return text.CONTROL, text.MESSAGES[text.CONTROL]
    if text.has_markup(value):
        return text.MARKUP, text.MESSAGES[text.MARKUP]
    if text.has_foreign_link(value):
        return text.LINK, LAX_LINK
    return None


def _where(document, route, names):
    located = messages.locate(document, route, names)
    field = next((step for step in reversed(route) if isinstance(step, str)), "")
    label = LABELS.get(field, field)
    if not located and route and route[0] == "caso":
        located = "caso"
    return ", ".join(part for part in (located, label) if part)


def check(document, names=None):
    """Los hallazgos de texto del documento: ``DSL.TEXT_*``, una vez por ruta y código."""
    if not isinstance(document, (dict, list)):
        return []
    names = names if names is not None else messages.names_of(document)
    issues, seen = [], set()
    for route, value in strings(document):
        governed = GOVERNED.get(_shape(route))
        problem = (
            text.plain_text_problem(value, governed[0], multiline=governed[1]) if governed else _lax_problem(value)
        )
        if problem is None:
            continue
        code = f"{PREFIX}TEXT_{problem[0]}"
        path = messages.route_text(route)
        if (code, path) in seen:
            continue
        seen.add((code, path))
        reason = f"{_where(document, route, names)}: {problem[1]}"
        issues.append(Issue(code, ERROR, path, reason[:1].upper() + reason[1:]))
    return issues

