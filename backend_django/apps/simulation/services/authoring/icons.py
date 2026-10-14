"""Nombres de icono válidos de la autoría (E2-6, R14; petición F1-3 del visual).

La lista es la de la fuente de iconos del cliente (``frontend/scripts/ui/material-symbols-
rounded.icons.json``, copiada a ``apps/simulation/data/material_icons.json`` con una prueba
de deriva): un icono fuera de ella se pintaría como texto. Un valor **ya guardado** se acepta
aunque no esté en la lista: guardar el mundo reenvía todos los objetos y no debe bloquearse
por datos anteriores.
"""
import json
from functools import lru_cache
from pathlib import Path

from rest_framework import status

from shared.exceptions import ApiError

_DATA = Path(__file__).resolve().parents[2] / "data" / "material_icons.json"


@lru_cache(maxsize=1)
def known_icons():
    return frozenset(json.loads(_DATA.read_text(encoding="utf-8")))


def validate_icon(value, current=None, field="icon"):
    """400 con el campo si ``value`` no es un icono conocido ni el que ya tenía el objeto."""
    if value is None or value == "" or value == current:
        return
    if value not in known_icons():
        raise ApiError(
            "VALIDATION_ERROR",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            f"El icono «{value}» no está en la lista de iconos disponibles.",
            status.HTTP_400_BAD_REQUEST,
            field=field,
        )
