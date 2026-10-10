"""Lectura de los cuerpos de petición del editor de autoría."""
import json


def flag(request, key):
    return bool(request.get(key))


def write_string_list(value):
    return json.dumps(value) if value is not None else "[]"
