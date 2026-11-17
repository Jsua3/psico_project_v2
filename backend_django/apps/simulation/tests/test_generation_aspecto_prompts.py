"""Instrucciones puras sobre el aspecto de cada sala."""
from apps.simulation.services.authoring.generation import prompts


def test_el_esqueleto_pide_el_aspecto_de_cada_sala():
    texto = " ".join(prompts.SYSTEM_GENERATE.split())
    for fragmento in ("aspecto", "hora del día", "luz", "ventanas", "sobran o faltan"):
        assert fragmento in texto


def test_la_escena_usa_el_aspecto_del_esqueleto():
    texto = " ".join(prompts.SYSTEM_GENERATE.split())
    assert "el aspecto de esta escena en el esqueleto" in texto
    assert "Si la petición de la docente dice cómo se ve la sala" not in texto
