"""El esquema JSON de una propuesta del asistente (lo que se le pide al proveedor) y el vocabulario cerrado.

``PROPOSAL`` es ``{message, changes[]}``; cada cambio es uno de diez, con ``additionalProperties: false`` y todos sus
campos obligatorios (lo opcional es ``null`` o ``""``). Sin recursión ni límites numéricos: eso lo revisa
``proposals.validate`` en Python, que nunca confía en lo que devuelve el modelo.

Ids: un número es el id de una fila de ESTA versión del caso; una escena nueva se declara con ``add-scene`` y un id
temporal ``nueva-N`` que los cambios siguientes pueden usar donde se pide una escena (``nodeId``, ``targetNodeId``,
``afterNodeId``).

Operación → endpoint de autoría con que el cliente la aplica (``/api/authoring/cases/{id}/…``, siempre sobre un
borrador y con la revisión vigente):

- ``add-scene``           → ``POST nodes`` (``nodeKey`` derivado del id, ``title``, ``narrative``, ``intensity``,
  ``warningMessage``) y ``POST maps`` con el ``nodeId`` creado; si trae ``afterNodeId``, la escena se coloca a su lado.
- ``add-line``            → ``POST maps/{mapId}/dialogues`` (si la escena aún no tiene diálogo) o ``PUT dialogues/{treeId}``
  agregando la línea al final (``speakerName`` = nombre del personaje, ``emotion`` = ``expression``).
- ``add-response``        → ``POST decisions`` (``sourceNodeId``=``nodeId``, ``targetNodeId``, ``text``, ``responseClass``,
  ``feedbackText``, ``prohibitionReason``; con CONTRAINDICATED ``prohibitedConduct=true``).
- ``place-character``     → ``POST maps/{mapId}/objects`` (``objectType`` PERSON, ``characterId``, ``x``, ``y``).
- ``move``                → ``PUT objects/{objectId}`` con la nueva ``x``/``y`` y el resto del objeto como está.
- ``add-ending``          → ``PUT rules/endings`` con los finales actuales más este (``when`` ya viene en la gramática
  de ``casedef.conditions``).
- ``set-response-class``  → ``PUT decisions/{decisionId}`` (``responseClass``, ``prohibitionReason``).
- ``set-persona-effect``  → ``PUT decisions/{decisionId}`` mezclando ``effects.persona`` (``bond``/``activation``).
- ``mark-milestone``      → ``PUT decisions/{decisionId}`` agregando la clave a ``effects.milestones``.
- ``set-intensity``       → ``PUT nodes/{nodeId}`` (``intensity``, ``warningMessage``).

La condición ``when`` de ``add-ending`` viaja en una forma plana de un solo nivel (``kind``) que ``proposals.validate``
traduce a la gramática de las condiciones (``{all|any|not|milestone|count|persona}``).
"""
from apps.simulation.casedef.vocabulary import Activation, Bond, Intensity, ResponseClass
from apps.simulation.services.authoring.rules import ENDING_TONES

RESPONSE_CLASSES = tuple(member.value for member in ResponseClass)
#: Las seis expresiones del kit de personajes.
EXPRESSIONS = ("neutral", "alegre", "preocupada", "triste", "cautelosa", "en-crisis")
INTENSITIES = tuple(member.value for member in Intensity)
BONDS = tuple(member.value for member in Bond)
ACTIVATIONS = tuple(member.value for member in Activation)
TONES = tuple(ENDING_TONES)
COMPARATORS = ("gte", "gt", "lte", "lt", "eq")
CONDITION_KINDS = ("milestone", "count", "persona", "all", "any", "not")
MAX_CHANGES = 12

_TEXT = {"type": "string"}
_INT = {"type": "integer"}


def _obj(properties: dict) -> dict:
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


def _enum(values) -> dict:
    return {"type": "string", "enum": list(values)}


def _nullable(inner: dict) -> dict:
    return {"anyOf": [inner, {"type": "null"}]}


#: Una escena: el id de una existente (número) o un id temporal ``nueva-N``.
_NODE_REF = {"anyOf": [_INT, _TEXT]}

_LEAF_CONDITIONS = [
    _obj({"kind": _enum(["milestone"]), "milestone": _TEXT}),
    _obj({"kind": _enum(["count"]), "responseClass": _enum(RESPONSE_CLASSES), "comparator": _enum(COMPARATORS), "value": _INT}),
    _obj({"kind": _enum(["persona"]), "bond": _nullable(_enum(BONDS)), "activation": _nullable(_enum(ACTIVATIONS))}),
]
_LEAF = {"anyOf": _LEAF_CONDITIONS}
_WHEN = _nullable({
    "anyOf": [
        *_LEAF_CONDITIONS,
        _obj({"kind": _enum(["all"]), "items": {"type": "array", "items": _LEAF}}),
        _obj({"kind": _enum(["any"]), "items": {"type": "array", "items": _LEAF}}),
        _obj({"kind": _enum(["not"]), "item": _LEAF}),
    ]
})

#: Los campos de cada operación (sin ``op``).
OPERATIONS: dict[str, dict] = {
    "add-scene": {"id": _TEXT, "title": _TEXT, "narrative": _TEXT, "intensity": _enum(INTENSITIES),
                  "warningMessage": _TEXT, "afterNodeId": _nullable(_NODE_REF)},
    "add-line": {"nodeId": _NODE_REF, "characterId": _INT, "text": _TEXT, "expression": _enum(EXPRESSIONS)},
    "add-response": {"nodeId": _NODE_REF, "text": _TEXT, "responseClass": _enum(RESPONSE_CLASSES),
                     "feedbackText": _TEXT, "prohibitionReason": _TEXT, "targetNodeId": _NODE_REF},
    "place-character": {"mapId": _INT, "characterId": _INT, "x": _INT, "y": _INT, "expression": _enum(EXPRESSIONS)},
    "move": {"objectId": _INT, "x": _INT, "y": _INT},
    "add-ending": {"key": _TEXT, "title": _TEXT, "message": _TEXT, "tone": _enum(TONES), "when": _WHEN},
    "set-response-class": {"decisionId": _INT, "responseClass": _enum(RESPONSE_CLASSES), "prohibitionReason": _TEXT},
    "set-persona-effect": {"decisionId": _INT, "bond": _nullable(_INT), "activation": _nullable(_INT)},
    "mark-milestone": {"decisionId": _INT, "milestoneKey": _TEXT},
    "set-intensity": {"nodeId": _NODE_REF, "intensity": _enum(INTENSITIES), "warningMessage": _TEXT},
}

#: Los nombres de campo que acepta cada operación, ``op`` incluido.
FIELDS: dict[str, frozenset] = {op: frozenset({"op", *fields}) for op, fields in OPERATIONS.items()}

PROPOSAL = _obj({
    "message": _TEXT,
    "changes": {
        "type": "array",
        "items": {"anyOf": [_obj({"op": _enum([op]), **fields}) for op, fields in OPERATIONS.items()]},
    },
})

#: Modos en que el editor muestra la acción elegida por la guía.
GUIDE_MODES = ("resaltar", "foco", "recorrido")

#: La respuesta de la guía: ``accionId`` es el id de una acción del catálogo que manda el cliente, o ``null``.
GUIDE = _obj({
    "accionId": {"type": ["string", "null"]},
    "modo": _enum(GUIDE_MODES),
    "mensaje": _TEXT,
})
