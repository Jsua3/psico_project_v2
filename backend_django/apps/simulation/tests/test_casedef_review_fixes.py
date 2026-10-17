"""E4 · Regresiones de la revisión de fase (C1, C2, I1, I2 e I3): un documento hostil no cuesta tiempo
cuadrático ni tumba al validador, y lo que se importa es lo que se validó.

Sin base de datos. Cada prueba lleva el hallazgo de la revisión que la originó.
"""
import copy
import dataclasses
import json
import random
import time
from pathlib import Path

import pytest

from apps.simulation.casedef import export, form, import_, limits, validate
from apps.simulation.casedef.export import to_document
from apps.simulation.casedef.validate import validate_document
from apps.simulation.services.authoring import cases
from apps.simulation.tests import dsl_support
from apps.simulation.tests.definition_samples import sample_definition

pytestmark = [pytest.mark.req("RF-12"), pytest.mark.req("LS-14"), pytest.mark.req("LS-16")]

#: Margen amplio: lo lineal tarda milésimas de segundo; lo cuadrático, segundos.
BUDGET = 1.0
SEEDED = Path(__file__).resolve().parents[1] / "data" / "cases" / "SIM-VBG-001.dsl.json"


def _document():
    return copy.deepcopy(to_document(sample_definition()))


def _errors(document):
    return [issue for issue in validate_document(document) if issue.severity == "error"]


# ─── C1 · el pre-escaneo de profundidad es lineal ─────────────────────────────────────────────
HOSTILE_STRINGS = {
    "una comilla y comillas escapadas": lambda n: '"' + '\\"' * n,
    "una cadena sin cerrar dentro de un objeto": lambda n: '{"a": "' + '\\"' * n,
}


@pytest.mark.parametrize("shape", HOSTILE_STRINGS)
def test_an_unterminated_string_is_read_in_linear_time(shape):
    """C1: ``"`` seguido de ``\\"`` repetido (una cadena sin cerrar) costaba tiempo cuadrático."""
    raw = HOSTILE_STRINGS[shape](24_000).encode("utf-8")
    started = time.perf_counter()
    with pytest.raises(import_.ImportRejected) as rejected:
        import_.read_document(raw)
    assert time.perf_counter() - started < BUDGET
    assert [issue.code for issue in rejected.value.issues] == [import_.FORMA]


def test_a_megabyte_of_unterminated_string_is_rejected_fast():
    raw = ('"' + '\\"' * (limits_bytes() // 2)).encode("utf-8")
    started = time.perf_counter()
    with pytest.raises(import_.ImportRejected):
        import_.read_document(raw)
    assert time.perf_counter() - started < BUDGET


def limits_bytes():
    return import_.MAX_BYTES - 16


@pytest.mark.parametrize("depth, accepted", [(20, True), (21, False)])
def test_depth_ignores_brackets_inside_strings_even_with_escaped_quotes(depth, accepted):
    """El escáner nuevo sigue contando solo los corchetes y llaves que no están dentro de una cadena."""
    inner = '"[[[{{{ \\" ]]] \\\\"'  # corchetes dentro de una cadena que además trae una comilla escapada
    lists = depth - 1  # la raíz es un objeto: cuenta como el primer nivel
    raw = b'{"a": ' + ("[" * lists + inner + "]" * lists).encode("utf-8") + b"}"
    if accepted:
        assert import_.read_document(raw)
    else:
        with pytest.raises(import_.ImportRejected) as rejected:
            import_.read_document(raw)
        assert [issue.code for issue in rejected.value.issues] == [import_.LIMIT]


# ─── C2 · uniqueItems es lineal y conserva la igualdad del taller ─────────────────────────────
def test_a_long_list_of_unique_items_is_checked_in_linear_time():
    """C2: ``uniqueItems`` comparaba cada elemento con todos los anteriores (8 000 textos ≈ 5 s)."""
    document = _document()
    document["caso"]["objetivosAprendizaje"] = [f"Objetivo {n}" for n in range(8_000)]
    started = time.perf_counter()
    validate_document(document)
    assert time.perf_counter() - started < BUDGET


@pytest.mark.parametrize("items, repeated", [
    ([1, 1.0], True), ([True, 1], False), ([1, True], False), ([0, False], False), ([[1], [True]], True),
    ([{"a": 1}, {"a": 1.0}], True), ([{"a": 1}, {"a": 2}], False), (["a", "b", "a"], True),
    ([None, None], True), ([[], []], True), ([{"a": 1, "b": 2}, {"b": 2, "a": 1}], True), (["1", 1], False),
    ([[1, 2], [2, 1]], False), ([{"a": [1]}, {"a": [1.0]}], True), ([], False), (["x"], False),
])
def test_unique_items_keeps_the_workshop_equality(items, repeated):
    errors = form.errors({"type": "array", "uniqueItems": True}, items)
    assert [e.keyword for e in errors] == (["uniqueItems"] if repeated else [])


def test_the_importer_applies_the_editor_cap_of_learning_objectives():
    """El editor admite hasta 12 objetivos; la importación no puede saltarse ese tope."""
    assert limits.MAX_OBJECTIVES == cases.MAX_OBJECTIVES
    document = _document()
    document["caso"]["objetivosAprendizaje"] = [f"Objetivo {n}" for n in range(limits.MAX_OBJECTIVES + 1)]
    found = [i for i in validate_document(document) if i.code == limits.CODE]
    assert [(i.path, i.severity) for i in found] == [("caso.objetivosAprendizaje", "error")]
    document["caso"]["objetivosAprendizaje"].pop()
    assert [i for i in validate_document(document) if i.code == limits.CODE] == []


# ─── I1 · un documento ajeno no tumba al validador ────────────────────────────────────────────
def _feedback_with_list_option(document):
    document["retroalimentacion"] = [{"id": "R01", "opcion": ["OP01"], "mensaje": "m", "fundamentoTeorico": "f"}]


def _feedback_with_object_decision(document):
    document["retroalimentacion"] = [{"id": "R01", "decision": {}, "mensaje": "m", "fundamentoTeorico": "f"}]


def _siep_scene_with_list_id(document):
    document["x-siep"]["escenas"][0]["id"] = ["E01"]


def _siep_option_with_object_id_under_a_schema_error(document):
    document["escenas"][0]["decision"]["opciones"][0]["id"] = {"a": 1}
    document["x-siep"]["escenas"][0]["opciones"][0]["extra"] = 1


HOSTILE_IDS = [
    _feedback_with_list_option, _feedback_with_object_decision, _siep_scene_with_list_id,
    _siep_option_with_object_id_under_a_schema_error,
]


@pytest.mark.parametrize("hostile", HOSTILE_IDS, ids=lambda f: f.__name__)
def test_an_id_that_is_a_list_or_an_object_is_an_error_not_an_exception(hostile):
    """I1: ``names.get(<lista>)`` lanzaba ``TypeError`` (500 en la importación)."""
    document = _document()
    hostile(document)
    validate.validate_unguarded(document)  # sin la red de seguridad: ningún paso lanza
    assert _errors(document)


def test_a_failing_pass_is_an_error_not_an_exception(monkeypatch):
    """La red de seguridad: si un paso falla por algo que nadie previó, el documento se rechaza con un error."""
    def explode(document, names=None):
        raise RuntimeError("un caso que nadie previó")

    monkeypatch.setattr(validate.siep_check, "check", explode)
    issues = validate_document(_document())
    assert [(i.code, i.severity) for i in issues] == [("DSL.FORMA", "error")]
    assert "no se pudo revisar" in issues[0].message


LEAVES = [
    None, True, False, 0, 7, -1, 2.5, "", "x", "E01", "OP01", "P01", [], {}, ["E01"], [None], {"a": 1},
    {"id": ["x"]}, ["a", "a"], "<b>x</b>", "https://x.org", "\u0000",
]


def _mutants(document, count, seed):
    rnd = random.Random(seed)
    for _ in range(count):
        mutant = copy.deepcopy(document)
        for _ in range(rnd.choice([1, 1, 2, 3])):
            routes = [r for r in dsl_support._paths(mutant) if r]
            route = rnd.choice(routes)
            parent = mutant
            for step in route[:-1]:
                parent = parent[step]
            if rnd.random() < 0.15 and isinstance(parent, dict):
                del parent[route[-1]]
            else:
                parent[route[-1]] = copy.deepcopy(rnd.choice(LEAVES))
        yield mutant


@pytest.mark.parametrize("label, base, count", [
    ("la muestra", _document, 300),
    ("el caso sembrado", lambda: json.loads(SEEDED.read_text(encoding="utf-8")), 40),
])
def test_no_pass_raises_on_documents_with_the_wrong_types(label, base, count):
    """I1: ningún paso del validador ni de la conversión lanza con valores de otro tipo (semilla fija)."""
    for mutant in _mutants(base(), count, seed=20261016):
        issues = validate.validate_unguarded(mutant) + import_.import_issues(mutant)
        if not [i for i in issues if i.severity == "error"]:
            import_.to_definition(mutant)


# ─── I2 · lo que la base trae y x-siep no lista se rechaza, no se descarta ────────────────────
def _add_character(document):
    document["personajes"].append({"id": "P99", "nombre": "Nuevo personaje", "rol": "Testigo"})


def _add_tool(document):
    document["herramientas"].append({"id": "H99", "nombre": "Herramienta nueva", "descripcion": "Sirve para algo."})


def _add_rubric(document):
    document["rubricas"].append({
        "id": "RUB-09", "nombre": "Otra rúbrica", "version": "1.0", "activa": False,
        "criterios": [{"id": "CR99", "competencia": "X", "titulo": "Criterio", "orden": 1}],
    })


def _add_criterion(document):
    document["rubricas"][0]["criterios"].append(
        {"id": "CR98", "competencia": "X", "titulo": "Criterio extra", "orden": 98}
    )


@pytest.mark.parametrize("add, path, name", [
    (_add_character, "x-siep.personajes", "Nuevo personaje"),
    (_add_tool, "x-siep.herramientas", "Herramienta nueva"),
    (_add_rubric, "x-siep.rubricas", "Otra rúbrica"),
    (_add_criterion, "x-siep.rubricas[0].criterios", "Criterio extra"),
], ids=lambda value: value.__name__ if callable(value) else None)
def test_an_entity_of_the_base_that_x_siep_does_not_list_is_an_error(add, path, name):
    """I2: se importaba sin avisar y el borrador no tenía el personaje, la herramienta, la rúbrica o el criterio."""
    document = _document()
    assert _errors(document) == []
    add(document)
    found = [i for i in _errors(document) if i.code == "DSL.SIEP_REF"]
    assert [(i.path, name in i.message) for i in found] == [(path, True)], [(i.code, i.path, i.message) for i in validate_document(document)]


def test_a_document_without_x_siep_still_imports_every_entity_of_the_base():
    document = _document()
    del document["x-siep"]
    _add_character(document)
    _add_tool(document)
    assert _errors(document) == []
    definition = import_.to_definition(document)
    assert "P99" in [c.key for c in definition.characters] and "H99" in [t.code for t in definition.tools]


# ─── I3 · la marca «derivada» no se come el texto real del autor ──────────────────────────────
def _derived_prompt_entry(document):
    entry = next(e for e in document["x-siep"]["escenas"] if e.get("preguntaDerivada"))
    scene = next(s for s in document["escenas"] if s["id"] == entry["id"])
    return entry, scene


def _imported_prompt(document, entry):
    return next(s for s in import_.to_definition(document).scenes if s.key == entry["clave"]).prompt


def test_a_real_question_written_over_a_derived_one_is_imported():
    """I3: el autor reescribe la pregunta neutra del export y la marca ``preguntaDerivada`` la descartaba."""
    document = _document()
    entry, scene = _derived_prompt_entry(document)
    assert scene["decision"]["pregunta"] == export.DERIVED_PROMPT
    scene["decision"]["pregunta"] = "¿Cómo acompañarías a la sobreviviente?"
    assert _errors(document) == []
    assert _imported_prompt(document, entry) == "¿Cómo acompañarías a la sobreviviente?"


def test_the_derived_question_itself_is_still_not_stored():
    document = _document()
    entry, _ = _derived_prompt_entry(document)
    assert _imported_prompt(document, entry) == ""


def _document_with_derived_description():
    document = to_document(dataclasses.replace(sample_definition(), description=""))
    assert document["x-siep"]["descripcionDerivada"] is True
    assert document["caso"]["descripcion"] == document["x-siep"]["contexto"]
    return copy.deepcopy(document)


def test_a_real_description_written_over_the_derived_one_is_imported():
    document = _document_with_derived_description()
    document["caso"]["descripcion"] = "Una descripción propia del caso."
    assert import_.to_definition(document).description == "Una descripción propia del caso."


def test_the_derived_description_itself_is_still_not_stored():
    assert import_.to_definition(_document_with_derived_description()).description == ""
