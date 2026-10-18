"""Texto plano para los campos que ve otra persona (S1-3): COPIA de ``apps/simulation/casedef/text.py``.

``plain_text_problem`` dice qué le pasa a un texto (o ``None``) sin lanzar nada. Esta copia solo usa ``re``, para que
el registro no dependa de Django ni de DRF. ``apps/simulation/tests/test_plain_text_parity.py`` vigila que siga
diciendo lo mismo que la original: si la regla cambia allí, cambia aquí. No se edita ``casedef`` desde aquí.
"""
import re

NOT_TEXT = "NOT_TEXT"
TOO_LONG = "TOO_LONG"
CONTROL = "CONTROL"
MULTILINE = "MULTILINE"
MARKUP = "MARKUP"
LINK = "LINK"

#: Una etiqueta o un comentario HTML: ``<b>``, ``</p>``, ``<script``, ``<!--``, ``<?xml``. Un ``<`` que no abre
#: nada («edad < 18», «a < b») es texto y se acepta.
TAG = re.compile(r"<(?:/?[A-Za-z]|[!?])")
#: Un enlace: ``https://…``, ``ftp://…``, ``www.…`` o un esquema que ejecuta o abre algo.
LINK_PATTERN = re.compile(
    r"(?:\b[A-Za-z][A-Za-z0-9+.-]{1,15}://|\bwww\.|\b(?:javascript|vbscript|data|mailto)\s*:)",
    re.IGNORECASE,
)
#: Caracteres de control salvo salto de línea, retorno y tabulación.
CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
LINE_BREAK = re.compile(r"[\r\n]")

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

    Un texto vacío no es un problema aquí (que sea obligatorio lo decide quien llama). El orden es el de siempre:
    tipo, tope, caracteres de control, saltos de línea, etiquetas y enlaces.
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
