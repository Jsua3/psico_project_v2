"""Analizadores de cuerpo propios de la API."""
from rest_framework.exceptions import ParseError
from rest_framework.parsers import JSONParser


class ObjectJSONParser(JSONParser):
    """Un cuerpo JSON debe ser un objeto: una lista, un texto o un número es un 400.

    Casi toda vista hace ``request.data.get(...)``; con ``[]`` o ``7`` eso era un
    ``AttributeError`` (500). Ningún endpoint de la API recibe una lista en la raíz.
    """

    def parse(self, stream, media_type=None, parser_context=None):
        data = super().parse(stream, media_type, parser_context)
        if not isinstance(data, dict):
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise ParseError("El cuerpo de la petición debe ser un objeto JSON.")
        return data
