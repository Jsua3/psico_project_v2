"""E4-2b · El validador del documento completo: base + ``x-siep`` + textos + límites (R17–R20).

Sin base de datos. ``validate_document`` junta lo que ya hacía ``run_rules`` (forma y las 16 reglas del
taller) con la validación de ``x-siep`` (esquema, enlaces, claves repetidas, condiciones y métricas), la
de los textos (marcado y enlaces se **rechazan**, nunca se limpian) y los límites de tamaño, y devuelve
hallazgos con ``code`` (``DSL.*``), ``severity`` y un mensaje en lenguaje llano que nombra por título y no
lleva ids de DSL.
"""
import copy
import json
import re
from pathlib import Path

import pytest

from apps.simulation.casedef.export import to_document
from apps.simulation.casedef.report import ERROR
from apps.simulation.casedef.validate import validate_document
from apps.simulation.tests.definition_samples import sample_definition

#: El documento sembrado en su forma 1.0 (antes de la Tarea 12): el importador aún lo lee y lo convierte.
LEGACY = Path(__file__).resolve().parent / "fixtures" / "SIM-VBG-001.v1.dsl.json"

pytestmark = [pytest.mark.req("RF-12"), pytest.mark.req("RN-05"), pytest.mark.req("LS-14"), pytest.mark.req("LS-15")]


def _document():
    return copy.deepcopy(to_document(sample_definition()))


def _issues(document):
    return validate_document(document)


def _codes(document):
    return sorted({issue.code for issue in _issues(document)})


def _one(document, code):
    found = [issue for issue in _issues(document) if issue.code == code]
    assert len(found) == 1, [(i.code, i.path, i.message) for i in _issues(document)]
    return found[0]


def text_route(route):
    path = ""
    for step in route:
        path += f"[{step}]" if isinstance(step, int) else ("." if path else "") + step
    return path


def _scene_entry(document, key):
    return next(e for e in document["x-siep"]["escenas"] if e["clave"] == key)


# ─── línea base ───────────────────────────────────────────────────────────────────────────────
def test_the_sample_document_has_no_issues():
    assert [(i.code, i.path) for i in _issues(_document())] == []


def test_a_document_without_x_siep_is_valid_when_the_base_is():
    document = _document()
    del document["x-siep"]
    assert _issues(document) == []


# ─── el taller: forma y reglas, con su código y su gravedad ───────────────────────────────────
def test_a_workshop_rule_violation_carries_its_dsl_code_and_names_the_scene_by_its_title():
    document = _document()
    document["escenas"][1]["decision"]["opciones"].pop()
    issue = _one(document, "DSL.OCL-02")
    assert issue.severity == "error"
    assert issue.path == "escenas[1].decision.opciones"
    assert "«Mapa de actores»" in issue.message
    assert not re.search(r"\b(?:E|D|OP|P|H|R|CR)\d{2,}\b", issue.message), issue.message


def test_a_form_error_is_reported_as_dsl_forma():
    document = _document()
    document["caso"]["estado"] = "OTRO"
    issue = _one(document, "DSL.FORMA")
    assert issue.path == "caso.estado"


def test_an_unreachable_scene_is_a_warning_and_a_missing_initial_scene_an_error():
    document = _document()
    document["escenas"].append({"id": "E04", "titulo": "Suelta", "descripcion": "Nadie llega aquí."})
    issue = _one(document, "DSL.PROP-02")
    assert issue.severity == "warning" and issue.path == "escenas[3]"

    document = _document()
    document["caso"]["escenaInicial"] = "E09"
    issue = _one(document, "DSL.PROP-02")
    assert issue.severity == "error" and issue.path == "caso.escenaInicial"


# ─── x-siep: esquema ──────────────────────────────────────────────────────────────────────────
def test_a_stray_key_in_x_siep_is_a_schema_error_with_its_path():
    document = _document()
    document["x-siep"]["escenas"][0]["mapa"]["objetos"][0]["sobra"] = True
    issue = _one(document, "DSL.SIEP_SCHEMA")
    assert issue.path == "x-siep.escenas[0].mapa.objetos[0]"
    assert "sobra" in issue.message


def test_a_missing_required_key_names_the_key():
    document = _document()
    del document["x-siep"]["escenas"][0]["clave"]
    issue = _one(document, "DSL.SIEP_SCHEMA")
    assert "clave" in issue.message and issue.path == "x-siep.escenas[0]"


def test_x_siep_that_is_not_an_object_is_a_schema_error():
    document = _document()
    document["x-siep"] = ["no soy un objeto"]
    assert _one(document, "DSL.SIEP_SCHEMA").path == "x-siep"


def test_an_unsupported_x_siep_version_is_rejected():
    document = _document()
    document["x-siep"]["version"] = "9.0"
    assert _one(document, "DSL.SIEP_SCHEMA").path == "x-siep.version"


# ─── x-siep: enlaces y claves ─────────────────────────────────────────────────────────────────
def test_an_object_that_offers_an_unknown_option_is_a_reference_error():
    document = _document()
    document["x-siep"]["escenas"][0]["mapa"]["objetos"][2]["opcion"] = "no-existe"
    assert _one(document, "DSL.SIEP_REF").path == "x-siep.escenas[0].mapa.objetos[2].opcion"


def test_an_object_that_represents_an_unknown_character_is_a_reference_error():
    document = _document()
    document["x-siep"]["escenas"][0]["mapa"]["objetos"][0]["personaje"] = "fantasma"
    assert _one(document, "DSL.SIEP_REF").path == "x-siep.escenas[0].mapa.objetos[0].personaje"


def test_a_dialogue_that_hangs_from_an_unknown_object_is_a_reference_error():
    document = _document()
    document["x-siep"]["escenas"][0]["mapa"]["dialogos"][0]["objeto"] = "fantasma"
    assert _one(document, "DSL.SIEP_REF").path == "x-siep.escenas[0].mapa.dialogos[0].objeto"


def test_a_choice_that_offers_an_unknown_option_is_a_reference_error():
    document = _document()
    document["x-siep"]["escenas"][0]["mapa"]["dialogos"][0]["elecciones"][0]["opcion"] = "fantasma"
    assert _one(document, "DSL.SIEP_REF").path.endswith(".elecciones[0].opcion")


def test_an_option_of_a_scene_outside_the_base_that_points_to_an_unknown_scene_is_a_reference_error():
    document = _document()
    _scene_entry(document, "recepcion")["opciones"][0]["destino"] = "no-existe"
    assert _one(document, "DSL.SIEP_REF").path.endswith(".opciones[0].destino")


def test_x_siep_that_links_to_an_id_the_base_does_not_have_is_a_reference_error():
    document = _document()
    document["x-siep"]["escenas"][0]["id"] = "E09"
    codes = _codes(document)
    assert "DSL.SIEP_REF" in codes


def test_two_x_siep_entries_cannot_link_to_the_same_id():
    document = _document()
    document["x-siep"]["escenas"][1]["id"] = "E01"
    assert "DSL.SIEP_DUPLICATE" in _codes(document)


def test_when_x_siep_lists_the_scenes_it_must_list_every_scene_of_the_base():
    document = _document()
    document["x-siep"]["escenas"].pop(1)
    issue = _one(document, "DSL.SIEP_REF")
    assert "«Mapa de actores»" in issue.message


@pytest.mark.parametrize(
    ("path", "mutate"),
    [
        ("x-siep.personajes[0].id", lambda d: d["x-siep"]["personajes"][0].__setitem__("id", "P09")),
        ("x-siep.herramientas[0].id", lambda d: d["x-siep"]["herramientas"][0].__setitem__("id", "H09")),
        ("x-siep.escenas[0].opciones[0].id", lambda d: d["x-siep"]["escenas"][0]["opciones"][0].__setitem__("id", "OP09")),
        # existe en la base, pero es de la decisión de otra escena
        ("x-siep.escenas[1].opciones[0].id", lambda d: d["x-siep"]["escenas"][1]["opciones"][0].__setitem__("id", "OP01")),
        ("x-siep.rubricas[0].id", lambda d: d["x-siep"]["rubricas"][0].__setitem__("id", "RUB-09")),
        ("x-siep.rubricas[0].criterios[0].id", lambda d: d["x-siep"]["rubricas"][0]["criterios"][0].__setitem__("id", "CR09")),
    ],
)
def test_an_x_siep_entry_that_links_to_an_id_the_base_lacks_is_a_reference_error(path, mutate):
    document = _document()
    mutate(document)
    assert path in {issue.path for issue in _issues(document) if issue.code == "DSL.SIEP_REF"}


@pytest.mark.parametrize(
    ("where", "mutate"),
    [
        ("escena", lambda d: d["x-siep"]["escenas"][1].__setitem__("clave", "inicio")),
        ("opción", lambda d: d["x-siep"]["escenas"][1]["opciones"][0].__setitem__("clave", "analizar")),
        ("personaje", lambda d: d["x-siep"]["personajes"][1].__setitem__("clave", "laura")),
        ("herramienta", lambda d: d["x-siep"]["herramientas"][1].__setitem__("codigo", "MAPA")),
        ("objeto en el mismo mapa", lambda d: d["x-siep"]["escenas"][0]["mapa"]["objetos"][1].__setitem__("clave", "laura")),
    ],
)
def test_a_repeated_key_is_a_duplicate_error(where, mutate):
    document = _document()
    mutate(document)
    assert "DSL.SIEP_DUPLICATE" in _codes(document), where


def test_the_same_object_key_in_two_different_rooms_is_fine():
    document = _document()
    document["x-siep"]["escenas"][1]["mapa"]["objetos"] = [copy.deepcopy(document["x-siep"]["escenas"][0]["mapa"]["objetos"][0])]
    assert "DSL.SIEP_DUPLICATE" not in _codes(document)


# ─── x-siep: reglas del caso ──────────────────────────────────────────────────────────────────
def test_an_ending_condition_outside_the_vocabulary_is_rejected_not_evaluated():
    document = _document()
    document["x-siep"]["reglas"]["endings"][0]["when"] = {"eval": "__import__('os').system('x')"}
    issue = _one(document, "DSL.SIEP_CONDITION")
    assert issue.path == "x-siep.reglas.endings[0].when"


def test_a_condition_nested_beyond_the_depth_limit_is_rejected():
    deep = {"flag": "x"}
    for _ in range(14):
        deep = {"not": deep}
    document = _document()
    document["x-siep"]["reglas"]["endings"][0]["when"] = deep
    assert _one(document, "DSL.SIEP_CONDITION").path == "x-siep.reglas.endings[0].when"


def test_a_condition_on_an_undeclared_milestone_is_an_error():
    document = _document()
    document["x-siep"]["reglas"]["endings"][0]["when"] = {"milestone": "fantasma"}
    issue = _one(document, "DSL.SIEP_MILESTONE")
    assert "fantasma" in issue.message and issue.path == "x-siep.reglas.endings[0].when"


def test_an_option_that_marks_an_undeclared_milestone_is_an_error():
    document = _document()
    document["x-siep"]["escenas"][0]["opciones"][0]["efectos"]["milestones"] = ["fantasma"]
    issue = _one(document, "DSL.SIEP_MILESTONE")
    assert issue.path == "x-siep.escenas[0].opciones[0].efectos.milestones[0]"


@pytest.mark.parametrize("when", [
    {"metric": "confianza", "gte": 1},
    {"flag": "analizo"},
    {"count": "critical", "eq": 0},
    {"all": [{"milestone": "analizo"}, {"not": {"flag": "analizo"}}]},
])
def test_the_old_condition_vocabulary_is_rejected_in_a_2_0_document(when):
    document = _document()
    document["x-siep"]["reglas"]["endings"][0]["when"] = when
    assert _one(document, "DSL.SIEP_CONDITION").path == "x-siep.reglas.endings[0].when"


@pytest.mark.parametrize("old", [{"puntaje": 5}, {"estres": 1}, {"penalizacion": 0}])
def test_the_retired_option_fields_are_rejected_in_a_2_0_document(old):
    document = _document()
    document["x-siep"]["escenas"][0]["opciones"][0].update(old)
    assert _one(document, "DSL.SIEP_SCHEMA").path == "x-siep.escenas[0].opciones[0]"


@pytest.mark.parametrize("effect", [{"metrics": {"confianza": 5}}, {"flags": {"analizo": True}}, {"severity": "risky"}])
def test_the_retired_effects_are_rejected_in_a_2_0_document(effect):
    document = _document()
    document["x-siep"]["escenas"][0]["opciones"][0]["efectos"].update(effect)
    assert _one(document, "DSL.SIEP_SCHEMA").path == "x-siep.escenas[0].opciones[0].efectos"


def test_metrics_are_rejected_in_the_rules_of_a_2_0_document():
    document = _document()
    document["x-siep"]["reglas"]["metrics"] = [{"key": "confianza", "initial": 50}]
    assert _one(document, "DSL.SIEP_SCHEMA").path == "x-siep.reglas"


@pytest.mark.parametrize("version", ["3.0", "1.1", 2, None])
def test_another_x_siep_version_is_a_form_error(version):
    document = _document()
    document["x-siep"]["version"] = version
    assert _one(document, "DSL.SIEP_SCHEMA").path == "x-siep.version"


def test_a_2_0_option_needs_its_class_and_a_scene_its_intensity():
    document = _document()
    del document["x-siep"]["escenas"][0]["opciones"][0]["clase"]
    del document["x-siep"]["escenas"][1]["intensidad"]
    paths = sorted(i.path for i in _issues(document) if i.code == "DSL.SIEP_SCHEMA")
    assert paths == ["x-siep.escenas[0].opciones[0]", "x-siep.escenas[1]"]


def test_a_class_or_an_intensity_outside_the_vocabulary_is_rejected():
    document = _document()
    document["x-siep"]["escenas"][0]["opciones"][0]["clase"] = "ADEQUATE"
    document["x-siep"]["escenas"][1]["intensidad"] = "EXTREME"
    paths = sorted(i.path for i in _issues(document) if i.code == "DSL.SIEP_SCHEMA")
    assert paths == ["x-siep.escenas[0].opciones[0].clase", "x-siep.escenas[1].intensidad"]


# ─── el documento 1.0 se sigue validando (el importador lo convierte) ─────────────────────────
def _legacy():
    return json.loads(LEGACY.read_text(encoding="utf-8"))


def test_the_1_0_seeded_document_is_still_valid():
    assert [i for i in _issues(_legacy()) if i.severity == ERROR] == []


def test_a_condition_on_an_undeclared_metric_is_an_error_in_a_1_0_document():
    document = _legacy()
    document["x-siep"]["reglas"]["endings"][0]["when"] = {"metric": "fantasma", "gte": 1}
    issue = _one(document, "DSL.SIEP_METRIC")
    assert "fantasma" in issue.message


def test_an_option_effect_on_an_undeclared_metric_is_an_error_in_a_1_0_document():
    document = _legacy()
    document["x-siep"]["escenas"][0]["opciones"][0]["efectos"]["metrics"] = {"fantasma": 5}
    issue = _one(document, "DSL.SIEP_METRIC")
    assert issue.path == "x-siep.escenas[0].opciones[0].efectos.metrics"


# ─── textos: se rechazan, no se limpian ───────────────────────────────────────────────────────
def test_html_markup_in_a_scene_text_is_rejected_with_its_path():
    document = _document()
    document["escenas"][0]["descripcion"] = "Mira <img src=x onerror=alert(1)> esto"
    issue = _one(document, "DSL.TEXT_MARKUP")
    assert issue.path == "escenas[0].descripcion"
    assert document["escenas"][0]["descripcion"].startswith("Mira <img")  # no se limpió en silencio


def test_a_javascript_link_in_a_dialogue_line_is_rejected():
    document = _document()
    line = document["x-siep"]["escenas"][0]["mapa"]["dialogos"][0]["lineas"][0]
    line["texto"] = "Pulsa javascript:alert(1) ya"
    issue = _one(document, "DSL.TEXT_LINK")
    assert issue.path == "x-siep.escenas[0].mapa.dialogos[0].lineas[0].texto"


def test_an_https_link_is_fine_in_a_world_text_but_not_in_a_governed_field():
    document = _document()
    document["x-siep"]["escenas"][0]["mapa"]["dialogos"][0]["lineas"][0]["texto"] = "Guía: https://ejemplo.org/guia"
    assert "DSL.TEXT_LINK" not in _codes(document)
    document["escenas"][0]["decision"]["pistas"][0] = "Consulta https://ejemplo.org/guia"
    assert _one(document, "DSL.TEXT_LINK").path == "escenas[0].decision.pistas[0]"


def test_other_schemes_are_rejected_everywhere():
    for text in ("ftp://servidor/archivo", "http://inseguro.org", "data:text/html,x"):
        document = _document()
        document["x-siep"]["escenas"][0]["mapa"]["objetos"][0]["texto"] = text
        assert "DSL.TEXT_LINK" in _codes(document), text


def test_governed_fields_keep_their_limits():
    document = _document()
    document["caso"]["objetivosAprendizaje"] = ["x" * 281]
    assert _one(document, "DSL.TEXT_TOO_LONG").path == "caso.objetivosAprendizaje[0]"
    document = _document()
    document["x-siep"]["contexto"] = "x" * 4001
    assert _one(document, "DSL.TEXT_TOO_LONG").path == "x-siep.contexto"
    document = _document()
    document["escenas"][0]["decision"]["pistas"][0] = "x" * 281
    assert _one(document, "DSL.TEXT_TOO_LONG").path == "escenas[0].decision.pistas[0]"


def test_control_characters_in_a_governed_field_are_rejected():
    document = _document()
    document["escenas"][0]["decision"]["pregunta"] = "¿Qué\x00haces?"
    assert _one(document, "DSL.TEXT_CONTROL").path == "escenas[0].decision.pregunta"


def test_a_long_paragraph_with_line_breaks_is_fine_in_the_context():
    document = _document()
    document["x-siep"]["contexto"] = "Primer párrafo.\n\nSegundo párrafo con edad < 18."
    assert _issues(document) == []


def test_a_lone_surrogate_is_rejected_like_a_control_character():
    """Un sustituto suelto no se puede escribir en UTF-8: ni en la base ni en la huella."""
    document = _document()
    document["escenas"][0]["descripcion"] = "Hola \ud800"
    assert _one(document, "DSL.TEXT_CONTROL").path == "escenas[0].descripcion"


def test_a_control_character_in_the_key_of_a_free_object_is_rejected():
    document = _document()
    document["x-siep"]["escenas"][0]["mapa"]["objetos"][0]["metadatos"] = {"mala\x00clave": 1}
    issue = _one(document, "DSL.TEXT_CONTROL")
    assert issue.path == "x-siep.escenas[0].mapa.objetos[0].metadatos"


@pytest.mark.parametrize(
    ("route", "limit"),
    [
        (("caso", "titulo"), 255),
        (("caso", "version"), 32),
        (("escenas", 0, "titulo"), 255),
        (("herramientas", 0, "nombre"), 255),
        (("herramientas", 0, "categoria"), 80),
        (("rubricas", 0, "nombre"), 255),
        (("rubricas", 0, "version"), 30),
        (("rubricas", 0, "criterios", 0, "competencia"), 100),
        (("rubricas", 0, "criterios", 0, "titulo"), 255),
    ],
)
def test_fields_that_land_in_fixed_size_columns_keep_their_size(route, limit):
    document = _document()
    node = document
    for step in route[:-1]:
        node = node[step]
    node[route[-1]] = "x" * (limit + 1)
    assert "DSL.TEXT_TOO_LONG" in {issue.code for issue in _issues(document) if issue.path == text_route(route)}


def test_two_lines_of_a_dialogue_cannot_share_an_order():
    document = _document()
    lines = document["x-siep"]["escenas"][0]["mapa"]["dialogos"][0]["lineas"]
    lines.append(copy.deepcopy(lines[0]))
    issue = _one(document, "DSL.SIEP_DUPLICATE")
    assert issue.path.endswith(".lineas[1].orden")


# ─── límites ──────────────────────────────────────────────────────────────────────────────────
def test_too_many_scenes_exceed_the_limit():
    document = _document()
    document["escenas"] = [
        {"id": f"E{n:03d}", "titulo": f"Escena {n}", "descripcion": "Texto."} for n in range(1, 202)
    ]
    document["caso"]["escenaInicial"] = "E001"
    issue = _one(document, "DSL.LIMIT_EXCEEDED")
    assert issue.path == "escenas"


def test_too_many_options_in_one_decision_exceed_the_limit():
    document = _document()
    template = document["escenas"][0]["decision"]["opciones"][0]
    document["escenas"][0]["decision"]["opciones"] = [
        {**template, "id": f"OP{n:03d}"} for n in range(1, 52)
    ]
    assert "DSL.LIMIT_EXCEEDED" in _codes(document)


def test_too_many_characters_or_tools_exceed_the_limit():
    document = _document()
    document["personajes"] = [{"id": f"P{n:03d}", "nombre": f"P{n}", "rol": "Rol"} for n in range(1, 102)]
    assert "DSL.LIMIT_EXCEEDED" in _codes(document)
    document = _document()
    document["herramientas"] = [{"id": f"H{n:03d}", "nombre": f"H{n}", "descripcion": "D"} for n in range(1, 102)]
    assert "DSL.LIMIT_EXCEEDED" in _codes(document)


def test_a_document_nested_beyond_the_depth_limit_is_refused_without_being_read():
    deep = current = {}
    for _ in range(60):
        current["x"] = {}
        current = current["x"]
    document = _document()
    document["x-siep"]["reglas"]["extra"] = deep

    issues = validate_document(document)

    assert [(issue.code, issue.path) for issue in issues] == [("DSL.LIMIT_EXCEEDED", "")]


def test_a_document_with_too_many_containers_is_refused_without_being_read():
    document = _document()
    document["x-siep"]["reglas"]["extra"] = [{} for _ in range(20_001)]

    issues = validate_document(document)

    assert [(issue.code, issue.path) for issue in issues] == [("DSL.LIMIT_EXCEEDED", "")]


# ─── el documento hostil no tumba al validador ────────────────────────────────────────────────
@pytest.mark.parametrize("junk", [None, [], "texto", 5, {"x-siep": 5}, {"escenas": 7, "x-siep": {"escenas": 3}}])
def test_a_junk_document_is_reported_not_raised(junk):
    issues = validate_document(junk)
    assert issues and all(issue.code.startswith("DSL.") for issue in issues)
