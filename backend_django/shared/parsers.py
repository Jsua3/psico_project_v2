"""Analizadores de cuerpo propios de la API."""
from rest_framework.exceptions import ParseError
from rest_framework.parsers import JSONParser

from shared.text_guard import contiene_nul, nul_rechazado


class ObjectJSONParser(JSONParser):
    """Un cuerpo JSON debe ser un objeto, de profundidad razonable y sin NUL: si no, es un 400.

    Casi toda vista hace ``request.data.get(...)``; con ``[]`` o ``7`` eso era un
    ``AttributeError`` (500). Ningún endpoint de la API recibe una lista en la raíz.
    S7-1a: un JSON anidado a miles de niveles agotaba la pila de ``json`` (``RecursionError``, que no es un
    ``ValueError``) y respondía 500; un ``\\u0000`` dentro de un texto que el servicio lee sin serializador llegaba a
    PostgreSQL, que lo rechaza (también 500).
    """

    def parse(self, stream, media_type=None, parser_context=None):
        try:
            data = super().parse(stream, media_type, parser_context)
        except RecursionError:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise ParseError("El cuerpo de la petición tiene demasiados niveles de anidación.") from None
        if not isinstance(data, dict):
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise ParseError("El cuerpo de la petición debe ser un objeto JSON.")
        if contiene_nul(data):
            raise nul_rechazado()
        return data
