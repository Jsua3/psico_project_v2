"""E3-4 · Texto autorado: plano, sin marcado ni enlaces y con tope (Review Focus 4 del maestro).

``validate_plain_text`` es la única regla de los textos que escribe Psicología o el docente
(objetivos, contexto, pistas, retroalimentación, fundamento, enunciados): devuelve el texto
limpio o un 400 que nombra el campo. No usa base de datos.
"""
import pytest

from apps.simulation.services.text_rules import validate_plain_text
from shared.exceptions import ApiError

pytestmark = [pytest.mark.req("RF-16"), pytest.mark.req("RNF-08")]


def _rejected(value, **kwargs):
    with pytest.raises(ApiError) as caught:
        validate_plain_text(value, 280, "learningObjectives", **kwargs)
    return caught.value


def test_a_clean_text_comes_back_trimmed():
    assert validate_plain_text("  Contiene a la familia.  ", 280, "x") == "Contiene a la familia."


@pytest.mark.parametrize(
    "text",
    [
        "Ley 1257 de 2008 (violencia contra la mujer) y la Resolución 459 de 2012.",
        "¿Qué haría ahora? Años: 22 — niña de 3 años; edad < 18 y > 12.",
        "5 > 3 y 2 < 4",
        "a < b y c > d",  # un «<» que no abre una etiqueta es texto
        "Ñandú, canción, ÁÉÍÓÚ y emoji 🙂",
        "Primera línea.\nSegunda línea.",
        "metadata: dato; datos: sí",
    ],
)
def test_plain_prose_is_accepted(text):
    assert validate_plain_text(text, 500, "x", multiline=True) == text.strip()


@pytest.mark.parametrize(
    "text",
    [
        "<script>alert(1)</script>",
        "<b>negrita</b>",
        "texto con <i>énfasis</i>",
        "</p>",
        "<!-- comentario -->",
        "<?xml version='1.0'?>",
        "<img src=x onerror=alert(1)>",
    ],
)
def test_markup_is_rejected_with_the_field(text):
    error = _rejected(text)

    assert error.status_code == 400
    assert error.api_code == "VALIDATION_ERROR"
    assert error.extra["field"] == "learningObjectives"


@pytest.mark.parametrize(
    "text",
    [
        "Mira https://ejemplo.com ahora",
        "http://x.y",
        "ftp://servidor/archivo",
        "Visita www.ejemplo.org",
        "javascript:alert(1)",
        "JAVASCRIPT:alert(1)",
        "data:text/html;base64,AAAA",
        "mailto:alguien@x.com",
    ],
)
def test_links_are_rejected_with_the_field(text):
    error = _rejected(text)

    assert error.status_code == 400
    assert error.extra["field"] == "learningObjectives"


def test_the_cap_is_inclusive_and_over_it_is_a_400():
    assert validate_plain_text("x" * 280, 280, "x") == "x" * 280

    error = _rejected("x" * 281)

    assert error.extra["field"] == "learningObjectives"


def test_a_blank_text_is_rejected_only_when_required():
    assert validate_plain_text("   ", 280, "context") == ""
    assert validate_plain_text(None, 280, "context") == ""
    with pytest.raises(ApiError) as caught:
        validate_plain_text("   ", 280, "learningObjectives", required=True)
    assert caught.value.extra["field"] == "learningObjectives"


def test_the_index_of_a_list_item_travels_with_the_error():
    with pytest.raises(ApiError) as caught:
        validate_plain_text("<b>x</b>", 280, "learningObjectives", index=2)

    assert caught.value.extra["field"] == "learningObjectives"
    assert caught.value.extra["index"] == 2


@pytest.mark.parametrize("value", [123, ["a"], {"a": 1}, True])
def test_a_non_text_is_a_400_not_a_500(value):
    error = _rejected(value)

    assert error.status_code == 400
    assert error.extra["field"] == "learningObjectives"


def test_control_characters_are_rejected():
    assert _rejected("hola\x00mundo").extra["field"] == "learningObjectives"
    assert _rejected("hola\x1bmundo").extra["field"] == "learningObjectives"


def test_a_single_line_field_rejects_line_breaks():
    assert _rejected("uno\ndos").extra["field"] == "learningObjectives"
    assert validate_plain_text("uno\ndos", 280, "context", multiline=True) == "uno\ndos"
