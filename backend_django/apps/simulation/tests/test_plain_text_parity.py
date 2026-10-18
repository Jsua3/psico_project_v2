"""S1-3 (B.6) · la copia de la regla de texto plano para el registro (``shared/plain_text.py``) dice lo mismo que
la del paquete ``casedef`` (``apps/simulation/casedef/text.py``), que es la original y no se toca."""
import pytest

from apps.simulation.casedef import text as casedef_text
from shared import plain_text

pytestmark = [pytest.mark.req("D-14"), pytest.mark.security]

#: (texto, tope, multiline, código esperado o None si el texto es válido)
CASOS = [
    ("María José", 100, False, None),
    ("", 100, False, None),
    ("   ", 100, False, None),
    ("<b>Ana</b>", 100, False, "MARKUP"),
    ("Ana <!-- oculto -->", 100, False, "MARKUP"),
    ("edad < 18", 100, False, None),
    ("a <b", 100, False, "MARKUP"),
    ("https://x.test", 100, False, "LINK"),
    ("ftp://x.test/archivo", 100, False, "LINK"),
    ("www.x.test", 100, False, "LINK"),
    ("javascript:alert(1)", 100, False, "LINK"),
    ("uno\ndos", 100, False, "MULTILINE"),
    ("uno\ndos", 100, True, None),
    ("uno\x07dos", 100, False, "CONTROL"),
    ("x" * 101, 100, False, "TOO_LONG"),
    ("x" * 100, 100, False, None),
    (12345, 100, False, "NOT_TEXT"),
]


def _codigo(resultado):
    return None if resultado is None else resultado[0]


@pytest.mark.parametrize(("texto", "tope", "multiline", "esperado"), CASOS)
def test_la_copia_y_el_original_dicen_lo_mismo(texto, tope, multiline, esperado):
    original = casedef_text.plain_text_problem(texto, tope, multiline=multiline)
    copia = plain_text.plain_text_problem(texto, tope, multiline=multiline)

    assert copia == original
    assert _codigo(copia) == esperado


def test_la_tabla_cubre_al_menos_quince_casos():
    assert len(CASOS) >= 15
