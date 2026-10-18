"""E4-2a · La capa de forma del documento: el intérprete del taller portado (R3 de E4).

Sin base de datos. ``casedef.form.errors`` valida la **base** del DSL contra el esquema del taller con
el mismo intérprete del taller (solo biblioteca estándar), de modo que cada error lleve la regla del
dominio que el esquema anota con ``x-regla`` (la atribución que decide qué es de la forma y qué lo
evalúa una regla ``OCL``). Las atribuciones esperadas las dio el propio intérprete del taller; la
comprobación cruzada exige que, además, ``jsonschema`` coincida (ruta, palabra clave) en los escenarios
del taller y en 100 alteraciones al azar.
"""
import collections
import copy

import jsonschema
import pytest

from apps.simulation.casedef import form
from apps.simulation.tests import dsl_support

pytestmark = [pytest.mark.req("RF-12"), pytest.mark.req("RNF-07")]

SCHEMA = dsl_support.schema()


def _example():
    return dsl_support.example(with_execution=False)


def _errors(document):
    return [(dsl_support.route_text(e.path), e.keyword, e.rule) for e in form.errors(SCHEMA, document)]


def test_the_workshop_documents_have_no_form_errors():
    assert form.errors(SCHEMA, _example()) == []
    assert form.errors(SCHEMA, dsl_support.example(with_execution=True)) == []
    valid = next(document for _, expected, document in dsl_support.scenarios() if expected == "valido")
    assert form.errors(SCHEMA, valid) == []


@pytest.mark.parametrize(
    ("name", "alteration", "expected"),
    [
        ("sin escenas", lambda d: d.__setitem__("escenas", []),
         [("escenas", "minItems", "OCL-01"), ("escenas", "contains", "OCL-08")]),
        ("título en blanco", lambda d: d["caso"].__setitem__("titulo", "  "), [("caso.titulo", "pattern", "OCL-07")]),
        ("sin descripción", lambda d: d["caso"].pop("descripcion"), [("caso", "required", "OCL-07")]),
        ("una sola opción", lambda d: d["escenas"][0]["decision"]["opciones"].pop(),
         [("escenas[0].decision.opciones", "minItems", "OCL-02")]),
        ("destino mal formado",
         lambda d: d["escenas"][0]["decision"]["opciones"][0].__setitem__("siguienteEscena", "ESCENA1"),
         [("escenas[0].decision.opciones[0].siguienteEscena", "pattern", "OCL-03")]),
        ("sin destino", lambda d: d["escenas"][0]["decision"]["opciones"][0].pop("siguienteEscena"),
         [("escenas[0].decision.opciones[0]", "required", "OCL-03")]),
        ("prohibida sin motivo",
         lambda d: d["escenas"][0]["decision"]["opciones"][1].__setitem__("conductaProhibida", True),
         [("escenas[0].decision.opciones[1]", "required", "INV-12")]),
        ("retroalimentación con dos destinos", lambda d: d["retroalimentacion"][0].__setitem__("opcion", "OP01"),
         [("retroalimentacion[0]", "oneOf", "OCL-06")]),
        ("estado inválido", lambda d: d["caso"].__setitem__("estado", "OTRO"), [("caso.estado", "enum", None)]),
        ("clave desconocida", lambda d: d.__setitem__("sobra", 1), [("(raíz)", "additionalProperties", None)]),
        ("sin escena inicial", lambda d: d["caso"].pop("escenaInicial"), [("caso", "required", "INV-09")]),
        ("decisión nula", lambda d: d["escenas"][0].__setitem__("decision", None),
         [("escenas[0].decision", "type", None), ("escenas", "contains", "OCL-08")]),
        ("sin escenas en la raíz", lambda d: d.pop("escenas"), [("(raíz)", "required", None)]),
    ],
)
def test_each_form_error_carries_the_rule_the_schema_annotates(name, alteration, expected):
    document = _example()
    alteration(document)
    assert _errors(document) == expected, name


def test_a_document_that_is_not_an_object_is_a_form_error():
    errors = form.errors(SCHEMA, [])
    assert [(e.keyword, e.rule) for e in errors] == [("type", None)]


def _multiset_of_interpreter(document):
    return collections.Counter((dsl_support.route_text(e.path), e.keyword) for e in form.errors(SCHEMA, document))


def _multiset_of_jsonschema(document):
    validator = jsonschema.Draft202012Validator(SCHEMA)
    return collections.Counter(
        (dsl_support.route_text(tuple(e.absolute_path)), e.validator) for e in validator.iter_errors(document)
    )


def test_the_interpreter_and_jsonschema_agree_on_the_workshop_documents_and_100_alterations():
    documents = [document for _, _, document in dsl_support.scenarios()] + dsl_support.mutated(100)
    disagreements = [
        index for index, document in enumerate(documents)
        if _multiset_of_interpreter(copy.deepcopy(document)) != _multiset_of_jsonschema(copy.deepcopy(document))
    ]
    assert disagreements == []
