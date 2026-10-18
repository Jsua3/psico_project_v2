"""Texto autorado: plano, sin marcado ni enlaces y con tope (Review Focus 4 del maestro).

Todo texto que escribe Psicología o el docente (objetivos, contexto, pistas, retroalimentación,
fundamento, enunciados) pasa por ``validate_plain_text``: devuelve el texto limpio o un 400 que
nombra el campo. Lo que el estudiante lee nunca trae etiquetas ni enlaces, aunque el cliente lo
pinte con ``innerHTML``; el tope evita que un campo enorme degrade las vistas y los reportes.

La regla en sí es pura y vive en ``casedef.text`` (E4-0): el documento del caso la usa sin DRF.
"""
from rest_framework import status

from apps.simulation.casedef.text import plain_text_problem
from shared.exceptions import ApiError


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
    if isinstance(value, str) and not value.strip():
        if required:
            raise _refuse("No puede estar vacío.", field, index)
        return ""
    problem = plain_text_problem(value, max_length, multiline=multiline)
    if problem is not None:
        raise _refuse(problem[1], field, index)
    return value.strip()
