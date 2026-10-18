"""E4-0 · El paquete puro ``casedef``, el taller copiado y los módulos que se mueven.

``casedef`` es Python sin Django (regla ``casedef-puro``); aquí viven las condiciones de los
finales y la regla de texto plano, que los servicios reexportan. El taller de DSL se copia a
``tests/taller_dsl/`` porque la consolidación de ``docs/`` retira ``docs/diseno/dsl/`` y una prueba
que dependa de esa ruta se rompería el día que se commitee. Sin base de datos.
"""
import hashlib
import subprocess
import sys
from pathlib import Path

import pytest

from apps.simulation.casedef import conditions as pure_conditions
from apps.simulation.casedef import text as pure_text
from apps.simulation.services import conditions as service_conditions
from apps.simulation.services.text_rules import validate_plain_text
from shared.exceptions import ApiError

pytestmark = [pytest.mark.req("RF-12"), pytest.mark.req("RNF-07")]

TESTS = Path(__file__).resolve().parent
TALLER = TESTS / "taller_dsl"
CASEDEF = TESTS.parent / "casedef"

#: SHA-256 de los archivos del taller tal como estaban en el commit dc8e537 (``git show``).
TALLER_SHA256 = {
    "validar_dsl.py": "6a59f535c75ff7e1974afe1300d68d6f83c2158e48ed9b6b5661d8b74e873c8e",
    "dsl-casos.schema.json": "9e272e72df721098fa7366cc16866ce5e5691cd1fd38fd0273dbc6de8e671d7d",
    "simulador_psicologia_social.json": "4fa1a1cc6c3db10b1d21c613ac7ac7424bdb4705134e0a5c4406789862cb370d",
    "ejemplo-minimo.json": "20b5923941b9609f8210160e3da7ae5542ddd0bd53d58186b20a07d8420f536e",
}


# ─── los módulos que se mueven a casedef ──────────────────────────────────────────────────────
def test_the_services_reexport_the_pure_conditions():
    assert service_conditions.evaluate is pure_conditions.evaluate
    assert service_conditions.is_valid is pure_conditions.is_valid
    assert service_conditions.COMPARATORS == pure_conditions.COMPARATORS
    assert service_conditions.MAX_DEPTH == pure_conditions.MAX_DEPTH


@pytest.mark.parametrize(
    ("value", "expected_code"),
    [
        ("Contiene a la familia.", None),
        ("Ley 1257 de 2008 y edad < 18.", None),
        (5, "NOT_TEXT"),
        ("x" * 3001, "TOO_LONG"),
        ("a\x00b", "CONTROL"),
        ("una línea\notra línea", "MULTILINE"),
        ("un <b>texto</b> con formato", "MARKUP"),
        ("mira https://ejemplo.org/guia", "LINK"),
    ],
)
def test_the_pure_text_rule_names_the_problem(value, expected_code):
    problem = pure_text.plain_text_problem(value, 3000, multiline=False)
    assert (problem[0] if problem else None) == expected_code


def test_multiline_allows_line_breaks_in_the_pure_rule():
    assert pure_text.plain_text_problem("primer párrafo\n\nsegundo párrafo", 3000, multiline=True) is None


@pytest.mark.parametrize(
    ("text", "foreign"),
    [
        ("https://ejemplo.org/guia", False),
        ("sin enlaces aquí", False),
        ("javascript:alert(1)", True),
        ("ftp://servidor/archivo", True),
        ("data:text/html,<b>x</b>", True),
        ("mailto:alguien@ejemplo.org", True),
        ("http://inseguro.org", True),
    ],
)
def test_foreign_links_are_the_ones_that_are_not_https(text, foreign):
    assert pure_text.has_foreign_link(text) is foreign


def test_the_service_text_rule_keeps_its_messages_and_codes():
    with pytest.raises(ApiError) as caught:
        validate_plain_text("hola <b>x</b>", 280, "learningObjectives")
    assert caught.value.api_code == "VALIDATION_ERROR"
    assert caught.value.extra["field"] == "learningObjectives"
    assert str(caught.value.detail).startswith("Debe ser texto plano, sin etiquetas")


# ─── el taller copiado ────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("name", sorted(TALLER_SHA256))
def test_the_workshop_files_are_the_ones_of_the_origin_commit(name):
    digest = hashlib.sha256((TALLER / name).read_bytes()).hexdigest()
    assert digest == TALLER_SHA256[name]


def test_the_workshop_validator_runs_on_its_own_scenarios():
    done = subprocess.run(
        [sys.executable, "-I", "-B", "validar_dsl.py", "simulador_psicologia_social.json"],
        cwd=TALLER, capture_output=True, timeout=120,
    )
    assert done.returncode == 0, done.stdout.decode("utf-8", "replace")[-800:]


def test_the_readme_of_the_copy_names_origin_and_hashes():
    readme = (TALLER / "README.md").read_text(encoding="utf-8")
    assert "dc8e537" in readme
    for digest in TALLER_SHA256.values():
        assert digest in readme


def test_the_casedef_base_schema_is_the_workshop_schema_untouched():
    assert (CASEDEF / "schema" / "dsl-casos.schema.json").read_bytes() == (
        TALLER / "dsl-casos.schema.json"
    ).read_bytes()
