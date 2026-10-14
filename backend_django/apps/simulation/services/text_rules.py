"""Texto autorado: plano, sin marcado ni enlaces y con tope (Review Focus 4 del maestro).

Todo texto que escribe Psicología o el docente (objetivos, contexto, pistas, retroalimentación,
fundamento, enunciados) pasa por ``validate_plain_text``: devuelve el texto limpio o un 400 que
nombra el campo. Lo que el estudiante lee nunca trae etiquetas ni enlaces, aunque el cliente lo
pinte con ``innerHTML``; el tope evita que un campo enorme degrade las vistas y los reportes.
"""
import re

from rest_framework import status

from shared.exceptions import ApiError

#: Una etiqueta o un comentario HTML: ``<b>``, ``</p>``, ``<script``, ``<!--``, ``<?xml``. Un
#: ``<`` que no abre nada («edad < 18», «a < b») es texto y se acepta.
_TAG = re.compile(r"<(?:/?[A-Za-z]|[!?])")
#: Un enlace: ``https://…``, ``ftp://…``, ``www.…`` o un esquema que ejecuta o abre algo.
_LINK = re.compile(
    r"(?:\b[A-Za-z][A-Za-z0-9+.-]{1,15}://|\bwww\.|\b(?:javascript|vbscript|data|mailto)\s*:)",
    re.IGNORECASE,
)
#: Caracteres de control salvo salto de línea, retorno y tabulación.
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_BREAK = re.compile(r"[\r\n]")


def _refuse(message, field, index):
    extra = {"field": field}
    if index is not None:
        extra["index"] = index
    return ApiError("VALIDATION_ERROR", message, status.HTTP_400_BAD_REQUEST, **extra)


def validate_plain_text(value, max_length, field, *, required=False, multiline=False, index=None):
    """El texto sin espacios sobrantes, o ``ApiError`` 400 con ``field`` (y ``index`` en listas).

    ``None`` es el texto vacío (un campo opcional). ``required`` rechaza el vacío. ``multiline``
    permite saltos de línea (un párrafo largo); sin él, el texto es de una sola línea.
    """
    # BORRADOR: los textos de error son nuevos del servidor, pendientes de Psicología (VD-23).
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise _refuse("Debe ser un texto.", field, index)
    text = value.strip()
    if not text:
        if required:
            raise _refuse("No puede estar vacío.", field, index)
        return ""
    if len(text) > max_length:
        raise _refuse(f"No puede superar los {max_length} caracteres.", field, index)
    if _CONTROL.search(text):
        raise _refuse("Contiene caracteres que no se admiten.", field, index)
    if not multiline and _BREAK.search(text):
        raise _refuse("Debe escribirse en una sola línea.", field, index)
    if _TAG.search(text):
        raise _refuse("Debe ser texto plano, sin etiquetas ni formato.", field, index)
    if _LINK.search(text):
        raise _refuse("Debe ser texto plano, sin enlaces.", field, index)
    return text
