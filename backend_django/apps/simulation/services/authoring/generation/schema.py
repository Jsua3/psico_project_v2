"""Los dos esquemas JSON de la generación por etapas: el esqueleto del caso y una escena.

Planos, con todo campo obligatorio y ``additionalProperties: false``. Sin ``minimum``/``maximum``/``minItems``/``maxItems``
(la API de Anthropic no los admite) y **sin ninguna unión**: lo opcional es ``""`` o ``[]``, y las condiciones viajan como
texto con el JSON de la gramática de ``casedef.conditions`` (``""`` es sin condición), como el ``when`` del asistente.
Los topes los mide ``checks.py`` en Python: el modelo nunca es la autoridad.

``SKELETON`` es el caso en grande (título, escenas en salas distintas con su persona, hitos, finales); ``SCENE`` es lo que se
escribe dentro de una escena (narración, líneas, opciones, pistas, comentarios). ``escenas[].sala`` es el id de la sala y
hace de clave de la escena; ``persona`` es la clave de objeto de la PERSON a atender en esa sala; los ``personaje`` son claves
de personaje de la biblioteca.
"""
from apps.simulation.casedef.vocabulary import EXPRESSIONS, GESTURES, Intensity, ResponseClass
from apps.simulation.services.authoring.rules import ENDING_TONES

MIN_SCENES = 4
MAX_SCENES = 6
MIN_OPTIONS = 3
MAX_OPTIONS = 4
MAX_COMMENTS = 6
MAX_HINTS = 3
MAX_LINES = 8

_TEXT = {"type": "string"}
_BOOL = {"type": "boolean"}
#: El efecto de una respuesta sobre la persona consultante: -1, 0 o 1 (un entero con enum, no una unión).
_STEP = {"type": "integer", "enum": [-1, 0, 1]}


def _obj(properties: dict) -> dict:
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


def _enum(values) -> dict:
    return {"type": "string", "enum": list(values)}


def _list(item: dict) -> dict:
    return {"type": "array", "items": item}


SKELETON = _obj({
    "titulo": _TEXT,
    "contexto": _TEXT,
    "objetivosAprendizaje": _list(_TEXT),
    "escenas": _list(_obj({
        "sala": _TEXT,
        "titulo": _TEXT,
        "objetivo": _TEXT,
        "persona": _TEXT,
        "intensidad": _enum(member.value for member in Intensity),
        "advertencia": _TEXT,
        "final": _BOOL,
        "siguientes": _list(_TEXT),
    })),
    "hitos": _list(_TEXT),
    "finales": _list(_obj({
        "clave": _TEXT,
        "titulo": _TEXT,
        "mensaje": _TEXT,
        "tono": _enum(ENDING_TONES),
        "cuando": _TEXT,
    })),
})

SCENE = _obj({
    "narracion": _TEXT,
    "lineas": _list(_obj({
        "personaje": _TEXT,
        "texto": _TEXT,
        "emocion": _enum(EXPRESSIONS),
    })),
    "opciones": _list(_obj({
        "clave": _TEXT,
        "texto": _TEXT,
        "clase": _enum(member.value for member in ResponseClass),
        "retroalimentacion": _TEXT,
        "razonProhibicion": _TEXT,
        "destino": _TEXT,
        "efectoVinculo": _STEP,
        "efectoActivacion": _STEP,
        "hitos": _list(_TEXT),
        "competencias": _list(_TEXT),
        "requiere": _TEXT,
        "reaccionLinea": _TEXT,
        "reaccionEmocion": _enum(("", *EXPRESSIONS)),
        "reaccionGesto": _enum(("", *GESTURES)),
    })),
    "pistas": _list(_TEXT),
    "comentarios": _list(_obj({
        "personaje": _TEXT,
        "linea": _TEXT,
        "cuando": _TEXT,
        "emocion": _enum(("", *EXPRESSIONS)),
        "gesto": _enum(("", *GESTURES)),
    })),
})
