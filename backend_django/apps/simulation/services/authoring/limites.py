"""Topes de columna del guardado del mundo (S2-6b).

El guardado del mundo lee el cuerpo que manda el editor sin serializador de campos, así que los topes de texto de las
columnas se comprueban aquí, antes de escribir la fila: un texto que no cabe en su columna es un 400 que nombra su
ruta (``objects.shortCode``) y el tope, en vez de un 500 de PostgreSQL. El tope lo lee el propio modelo
(``Model._meta.get_field(campo).max_length``), no una cifra copiada. El guardado es atómico: un 400 a mitad no deja
nada a medias. El equivalente de los enteros, ``_columna()``, está en ``serializers/authoring.py``.
"""
from rest_framework import status

from shared.exceptions import ApiError


def _texto(modelo, campo, valor, ruta):
    """``valor`` si cabe en la columna ``campo`` de ``modelo``; si no, un 400 que nombra ``ruta`` y el tope."""
    if valor is None:
        return valor
    tope = modelo._meta.get_field(campo).max_length
    texto = valor if isinstance(valor, str) else str(valor)
    if tope is not None and len(texto) > tope:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise ApiError(
            "VALIDATION_ERROR",
            f"El texto de {ruta} no puede superar los {tope} caracteres.",
            status.HTTP_400_BAD_REQUEST,
            field=ruta,
        )
    return valor
