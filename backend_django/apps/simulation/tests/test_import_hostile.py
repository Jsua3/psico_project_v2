"""E4-5 · Una importación hostil se rechaza entera, con su ``ValidationIssue``, sin filas (Review Focus 4).

Cada fila de la tabla es un cuerpo que alguien podría mandar a ``POST …/cases/import``: demasiado grande,
mal codificado, con claves repetidas, ``NaN``, anidado de más, con muchas escenas, con claves que no
existen, con ids repetidos o referencias rotas, con marcado o enlaces, con números gigantes, con
caracteres que la base de datos no admite o con una condición que intenta ejecutar algo. Todas dan
400 ``DSL_INVALID`` con el código del hallazgo y **ninguna** deja filas.
"""
import copy
import json

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, DecisionOption, SimulationCase, SimulationNode
from apps.simulation.services.authoring import definition_io
from apps.simulation.tests import dsl_support

pytestmark = [pytest.mark.req("RF-12"), pytest.mark.req("LS-14"), pytest.mark.req("LS-16")]

User = get_user_model()
IMPORT = "/api/authoring/cases/import"
MEGABYTE = 1024 * 1024


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="hos_admin@x.com", password="pass1234", nombre="Ad", apellido="Min", role="ADMIN"
    )


@pytest.fixture
def base():
    """Un documento válido del taller, sin ``ejecucion``."""
    _, _, document = next(s for s in dsl_support.scenarios() if s[1] == "valido")
    document = copy.deepcopy(document)
    document.pop("ejecucion", None)
    document["caso"]["id"] = "HOSTIL-001"
    return document


@pytest.fixture
def full(db):
    """El documento completo (con ``x-siep``) del caso sembrado, con otro código de caso."""
    seeded = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    document = copy.deepcopy(definition_io.export_definition(seeded.id))
    document["caso"]["id"] = "HOSTIL-002"
    return document


def dumps(document):
    return json.dumps(document, ensure_ascii=False).encode("utf-8")


def _counts():
    return (
        SimulationCase.objects.count(), CaseVersion.objects.count(), SimulationNode.objects.count(),
        DecisionOption.objects.count(),
    )


def _send(admin, raw, content_type="application/json"):
    return cl(admin).generic("POST", IMPORT, data=raw, content_type=content_type)


def _expect_rejected(admin, raw, code, content_type="application/json"):
    before = _counts()
    response = _send(admin, raw, content_type)
    assert response.status_code == 400, (response.status_code, getattr(response, "data", None))
    assert response.data["code"] == "DSL_INVALID"
    codes = {issue["code"] for issue in response.data["issues"]}
    assert code in codes, codes
    for issue in response.data["issues"]:
        assert set(issue) >= {"code", "severity", "message"}
    assert _counts() == before
    return response


# ─── la lectura de los bytes ──────────────────────────────────────────────────────────────────
def test_a_body_over_one_megabyte_is_refused(admin, base):
    raw = dumps(base) + b" " * MEGABYTE
    _expect_rejected(admin, raw, "DSL.LIMIT_EXCEEDED")


def test_one_megabyte_of_text_in_a_single_field_is_refused(admin, base):
    base["escenas"][0]["descripcion"] = "x" * (MEGABYTE + 1)
    _expect_rejected(admin, dumps(base), "DSL.LIMIT_EXCEEDED")


@pytest.mark.parametrize(
    "raw",
    [b"\xff\xfe{\x00}\x00", b'{"caso": "\xe9"}', b"\x80\x81\x82"],
    ids=["utf16-bom", "latin1-e-acute", "bytes-sueltos"],
)
def test_bytes_that_are_not_utf8_are_refused(admin, raw):
    _expect_rejected(admin, raw, "DSL.FORMA")


def test_a_utf8_byte_order_mark_is_tolerated(admin, base):
    response = _send(admin, b"\xef\xbb\xbf" + dumps(base))
    assert response.status_code == 201, response.data


@pytest.mark.parametrize(
    "raw",
    [b"", b"   ", b"caso: algo\nescenas: []", b"{'caso': 1}", b'{"caso": ', b"[]", b'"texto"', b"null", b"7"],
    ids=["vacio", "espacios", "yaml", "comillas-simples", "truncado", "lista", "texto", "nulo", "numero"],
)
def test_what_is_not_a_json_object_is_refused(admin, raw):
    _expect_rejected(admin, raw, "DSL.FORMA")


def test_only_json_is_accepted(admin, base):
    _expect_rejected(admin, dumps(base), "DSL.FORMA", content_type="text/plain")


@pytest.mark.parametrize(
    "raw",
    [
        b'{"versionDsl": "1.0", "versionDsl": "1.0"}',
        b'{"caso": {"id": "A", "id": "B"}}',
        b'{"escenas": [{"id": "E01", "id": "E02"}]}',
    ],
    ids=["raiz", "caso", "escena"],
)
def test_repeated_keys_are_refused_instead_of_silently_merged(admin, raw):
    _expect_rejected(admin, raw, "DSL.FORMA")


def _with_number(full, token):
    """El documento con ``token`` como valor dentro de un objeto libre (que ningún esquema tipa)."""
    full["x-siep"]["escenas"][0]["mapa"]["ambiente"] = {"numero": "__NUMERO__"}
    raw = dumps(full).replace(b'"__NUMERO__"', token, 1)
    assert token in raw
    return raw


def test_a_repeated_key_is_refused_even_when_merging_it_would_leave_a_valid_document(admin, base):
    """Quien manda una clave dos veces no sabe cuál vale: aunque el resultado fusionado fuera válido, se rechaza."""
    raw = dumps(base)
    assert raw.endswith(b"}")
    _expect_rejected(admin, raw[:-1] + b', "versionDsl": "1.0"}', "DSL.FORMA")
    nested = raw.replace(b'"caso": {', b'"caso": {"id": "HOSTIL-001", ', 1)
    assert nested != raw
    _expect_rejected(admin, nested, "DSL.FORMA")


@pytest.mark.parametrize("token", [b"NaN", b"Infinity", b"-Infinity", b"1e999", b"-1e999"])
def test_non_finite_numbers_are_refused(admin, full, token):
    _expect_rejected(admin, _with_number(full, token), "DSL.FORMA")


def test_a_gigantic_integer_is_refused(admin, full):
    _expect_rejected(admin, _with_number(full, b"1" + b"0" * 5000), "DSL.FORMA")


def test_an_ordinary_number_in_a_free_object_is_fine(admin, full):
    response = _send(admin, _with_number(full, b"12.5"))
    assert response.status_code == 201, response.data


def test_nesting_deeper_than_twenty_levels_is_refused_without_parsing_it(admin):
    raw = b"[" * 21 + b"]" * 21
    _expect_rejected(admin, raw, "DSL.LIMIT_EXCEEDED")


def test_a_hundred_thousand_open_brackets_do_not_exhaust_the_stack(admin):
    _expect_rejected(admin, b"[" * 100_000, "DSL.LIMIT_EXCEEDED")


def test_twenty_levels_of_nesting_are_still_allowed_by_the_reader(admin, base):
    nested = current = {}
    for _ in range(16):  # el documento ya ocupa algunos niveles: este cuelga de ``x-siep.reglas``
        current["x"] = {}
        current = current["x"]
    base["x-siep"] = {"version": "1.0", "reglas": {}}
    base["x-siep"]["reglas"]["extra"] = nested
    response = _send(admin, dumps(base))
    # lo rechaza la validación de ``x-siep`` (clave desconocida), no el lector
    assert response.status_code == 400
    assert "DSL.LIMIT_EXCEEDED" not in {issue["code"] for issue in response.data["issues"]}


# ─── el contenido ─────────────────────────────────────────────────────────────────────────────
def test_more_than_two_hundred_scenes_are_refused(admin, base):
    template = base["escenas"][-1]
    base["escenas"] = [{**template, "id": f"E{n:03d}", "orden": n} for n in range(1, 202)]
    base["caso"]["escenaInicial"] = "E001"
    _expect_rejected(admin, dumps(base), "DSL.LIMIT_EXCEEDED")


def test_more_than_fifty_options_in_a_decision_are_refused(admin, base):
    decision = base["escenas"][0]["decision"]
    decision["opciones"] = [{**decision["opciones"][0], "id": f"OP{n:03d}"} for n in range(1, 52)]
    _expect_rejected(admin, dumps(base), "DSL.LIMIT_EXCEEDED")


def test_an_unknown_key_at_the_root_is_refused(admin, base):
    base["clave_rara"] = 1
    _expect_rejected(admin, dumps(base), "DSL.FORMA")


def test_an_unknown_key_in_a_scene_is_refused(admin, base):
    base["escenas"][0]["sobra"] = True
    _expect_rejected(admin, dumps(base), "DSL.FORMA")


def test_an_unknown_key_inside_x_siep_is_refused(admin, full):
    full["x-siep"]["escenas"][0]["sobra"] = True
    _expect_rejected(admin, dumps(full), "DSL.SIEP_SCHEMA")


def test_repeated_dsl_ids_are_refused(admin, base):
    base["escenas"][1]["id"] = base["escenas"][0]["id"]
    _expect_rejected(admin, dumps(base), "DSL.PROP-01")


def test_an_option_that_leads_to_a_missing_scene_is_refused(admin, base):
    base["escenas"][0]["decision"]["opciones"][0]["siguienteEscena"] = "E99"
    _expect_rejected(admin, dumps(base), "DSL.OCL-03")


def test_an_x_siep_condition_that_tries_to_run_code_is_refused(admin, full):
    full["x-siep"]["reglas"]["endings"][0]["when"] = {"eval": "__import__('os').system('x')"}
    _expect_rejected(admin, dumps(full), "DSL.SIEP_CONDITION")


# ─── textos ───────────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("text", "code"),
    [
        ("Mira <img src=x onerror=alert(1)>", "DSL.TEXT_MARKUP"),
        ("<script>alert(1)</script>", "DSL.TEXT_MARKUP"),
        ("<!-- oculto -->", "DSL.TEXT_MARKUP"),
        ("Pulsa javascript:alert(1)", "DSL.TEXT_LINK"),
        ("Abre data:text/html,x", "DSL.TEXT_LINK"),
        ("Descarga ftp://servidor/archivo", "DSL.TEXT_LINK"),
        ("Con un NUL \x00 dentro", "DSL.TEXT_CONTROL"),
        ("Un sustituto suelto \ud800", "DSL.TEXT_CONTROL"),
    ],
    ids=["img", "script", "comentario", "javascript", "data", "ftp", "nul", "sustituto"],
)
def test_hostile_text_is_refused_in_a_scene_narrative(admin, base, text, code):
    base["escenas"][0]["descripcion"] = text
    _expect_rejected(admin, json.dumps(base, ensure_ascii=True).encode("ascii"), code)


@pytest.mark.parametrize(
    ("where", "text", "code"),
    [
        ("hint", "Mira https://ejemplo.org", "DSL.TEXT_LINK"),
        ("hint", "<b>negrita</b>", "DSL.TEXT_MARKUP"),
        ("objective", "x" * 281, "DSL.TEXT_TOO_LONG"),
    ],
)
def test_governed_fields_keep_their_strict_rule_on_import(admin, base, where, text, code):
    if where == "hint":
        base["escenas"][0]["decision"]["pistas"] = [text]
    else:
        base["caso"]["objetivosAprendizaje"] = [text]
    _expect_rejected(admin, dumps(base), code)


def test_a_dialogue_line_with_a_javascript_link_is_refused(admin, full):
    entry = next(e for e in full["x-siep"]["escenas"] if e.get("mapa") and e["mapa"]["dialogos"])
    entry["mapa"]["dialogos"][0]["lineas"][0]["texto"] = "Pulsa javascript:alert(1)"
    _expect_rejected(admin, dumps(full), "DSL.TEXT_LINK")


def test_an_https_link_in_a_dialogue_line_is_accepted(admin, full):
    entry = next(e for e in full["x-siep"]["escenas"] if e.get("mapa") and e["mapa"]["dialogos"])
    entry["mapa"]["dialogos"][0]["lineas"][0]["texto"] = "Guía en https://ejemplo.org/guia"
    response = _send(admin, dumps(full))
    assert response.status_code == 201, response.data


def test_a_title_longer_than_its_column_is_refused_before_the_database_sees_it(admin, base):
    base["caso"]["titulo"] = "T" * 256
    _expect_rejected(admin, dumps(base), "DSL.TEXT_TOO_LONG")


def test_two_dialogue_lines_with_the_same_order_are_refused(admin, full):
    entry = next(e for e in full["x-siep"]["escenas"] if e.get("mapa") and e["mapa"]["dialogos"])
    dialogue = entry["mapa"]["dialogos"][0]
    dialogue["lineas"].append({**dialogue["lineas"][0]})
    _expect_rejected(admin, dumps(full), "DSL.SIEP_DUPLICATE")


def test_a_code_the_column_cannot_hold_is_refused(admin, full):
    full["x-siep"]["herramientas"][0]["codigo"] = "T" * 100  # la columna admite 80
    _expect_rejected(admin, dumps(full), "DSL.TEXT_TOO_LONG")
