"""Instrucciones puras sobre el aspecto de cada sala."""
from apps.simulation.services.authoring.generation import prompts


def test_el_esqueleto_pide_el_aspecto_de_cada_sala():
    texto = " ".join(prompts.SYSTEM_GENERATE.split())
    for fragmento in ("aspecto", "hora del día", "luz", "ventanas", "sobran o faltan"):
        assert fragmento in texto


def test_la_escena_usa_el_aspecto_del_esqueleto():
    texto = " ".join(prompts.SYSTEM_GENERATE.split())
    # La etapa de escena lee el aspecto que el esqueleto le puso a su escena (12b) y devuelve solo lo que cambia (12c).
    assert "En el esqueleto, cada escena lleva aspecto" in texto
    assert "Si el aspecto de esta escena dice cómo se ve la sala, devuelve solo esos cambios" in texto
    assert "Si la petición de la docente dice cómo se ve la sala" not in texto
