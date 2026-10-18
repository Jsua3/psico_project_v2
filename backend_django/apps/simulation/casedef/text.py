"""Texto autorado: plano, sin marcado ni enlaces y con tope (Review Focus 4 del maestro).

Es el núcleo **puro** de la regla de texto plano: ``plain_text_problem`` dice qué le pasa a un
texto (o ``None``) sin lanzar nada, para que la use quien no puede depender de DRF (el validador
del documento, ``casedef``) y para que ``services/text_rules.validate_plain_text`` la envuelva en
un ``ApiError`` 400. ``has_foreign_link`` es la regla más laxa de los textos del mundo (R18 de
E4): un ``https`` se admite, cualquier otro esquema no.
"""
import re

NOT_TEXT = "NOT_TEXT"
TOO_LONG = "TOO_LONG"
CONTROL = "CONTROL"
MULTILINE = "MULTILINE"
MARKUP = "MARKUP"
LINK = "LINK"

#: Una etiqueta o un comentario HTML: ``<b>``, ``</p>``, ``<script``, ``<!--``, ``<?xml``. Un
#: ``<`` que no abre nada («edad < 18», «a < b») es texto y se acepta.
TAG = re.compile(r"<(?:/?[A-Za-z]|[!?])")
#: Un enlace: ``https://…``, ``ftp://…``, ``www.…`` o un esquema que ejecuta o abre algo.
LINK_PATTERN = re.compile(
    r"(?:\b[A-Za-z][A-Za-z0-9+.-]{1,15}://|\bwww\.|\b(?:javascript|vbscript|data|mailto)\s*:)",
    re.IGNORECASE,
)
#: Caracteres de control salvo salto de línea, retorno y tabulación.
CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
LINE_BREAK = re.compile(r"[\r\n]")

#: ``esquema://…`` con cualquier esquema, y los esquemas sin ``//`` que ejecutan o abren algo.
_URL = re.compile(r"\b([A-Za-z][A-Za-z0-9+.-]{1,15})://")
_ACTIVE_SCHEME = re.compile(r"\b(?:javascript|vbscript|data|mailto|file|blob)\s*:", re.IGNORECASE)

# BORRADOR: los textos de error son nuevos del servidor, pendientes de Psicología (VD-23).
MESSAGES = {
    NOT_TEXT: "Debe ser un texto.",
    CONTROL: "Contiene caracteres que no se admiten.",
    MULTILINE: "Debe escribirse en una sola línea.",
    MARKUP: "Debe ser texto plano, sin etiquetas ni formato.",
    LINK: "Debe ser texto plano, sin enlaces.",
}


def too_long_message(max_length):
    # BORRADOR: texto nuevo del servidor, pendiente de Psicología (VD-23).
    return f"No puede superar los {max_length} caracteres."


def plain_text_problem(value, max_length, *, multiline=False):
    """``(código, mensaje)`` del primer problema del texto, o ``None`` si es texto plano válido.

    Un texto vacío no es un problema aquí (que sea obligatorio lo decide quien llama). El orden es
    el de siempre: tipo, tope, caracteres de control, saltos de línea, etiquetas y enlaces.
    """
    if not isinstance(value, str):
        return NOT_TEXT, MESSAGES[NOT_TEXT]
    text = value.strip()
    if not text:
        return None
    if len(text) > max_length:
        return TOO_LONG, too_long_message(max_length)
    if CONTROL_CHARS.search(text):
        return CONTROL, MESSAGES[CONTROL]
    if not multiline and LINE_BREAK.search(text):
        return MULTILINE, MESSAGES[MULTILINE]
    if TAG.search(text):
        return MARKUP, MESSAGES[MARKUP]
    if LINK_PATTERN.search(text):
        return LINK, MESSAGES[LINK]
    return None


def has_markup(text):
    """¿Trae una etiqueta o un comentario HTML?"""
    return isinstance(text, str) and TAG.search(text) is not None


def has_foreign_link(text):
    """¿Trae un enlace con un esquema distinto de ``https``? (``https://…`` se admite.)"""
    if not isinstance(text, str):
        return False
    if any(match.group(1).lower() != "https" for match in _URL.finditer(text)):
        return True
    return _ACTIVE_SCHEME.search(text) is not None
