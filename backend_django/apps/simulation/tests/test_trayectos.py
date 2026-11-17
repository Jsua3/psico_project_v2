"""Trayectos de personas: OCL-19 (tramos rectos caminables, sin tapar puertas) y la cercanía del servidor por tramos.

Sin base de datos: la regla lee el documento y la cercanía recibe objetos simples con lo que mira.
"""
import json
from types import SimpleNamespace

import pytest
from rest_framework.exceptions import ValidationError

from apps.simulation.casedef import rules_estructura
from apps.simulation.services import world_service


def documento(puntos, colisiones=(), estructura=False, modo="circuito", puertas=()):
    persona = {"tipo": "PERSON", "x": 80, "y": 160, "metadatos": {"apoyo": "pies", "movimiento": {"tipo": "ruta", "modo": modo, "puntos": puntos}}}
    mapa = {"ancho": 400, "alto": 300, "colisiones": list(colisiones), "objetos": [persona, *puertas]}
    if estructura:
        mapa.update(ancho=960, alto=528, estructura={"ancho": 960}, ambiente={"encuadre": "una-pared"})
        persona.update(x=100, y=300)
    return {"x-siep": {"escenas": [{"clave": "sala", "mapa": mapa}]}}


def hallazgos(doc):
    return rules_estructura.ocl_19_trayectos_caminables(doc).hallazgos


@pytest.mark.parametrize("estructura,puntos", [(False, [{"x": 120, "y": 160}, {"x": 200, "y": 160}]), (True, [{"x": 160, "y": 300}, {"x": 200, "y": 300}])])
def test_ruta_valida(estructura, puntos):
    assert not hallazgos(documento(puntos, estructura=estructura))


def test_cantidad():
    assert hallazgos(documento([{"x": 120, "y": 160}]))
    assert hallazgos(documento([{"x": 120, "y": 160}] * 9))


def test_fuera_y_colision():
    # Dentro del mapa pero en el margen de 24 px de la sala que el juego no deja pisar.
    assert hallazgos(documento([{"x": 20, "y": 160}, {"x": 200, "y": 160}]))
    assert hallazgos(documento([{"x": 120, "y": 160}, {"x": 200, "y": 160}], [{"x": 190, "y": 140, "ancho": 30, "alto": 30}]))
    assert hallazgos(documento([{"x": 160, "y": 220}, {"x": 200, "y": 300}], estructura=True))


def test_tramo_que_atraviesa_un_mueble_aunque_los_puntos_esten_libres():
    """El juego camina en línea recta: un muro entre dos puntos libres es un tramo imposible."""
    muro = [{"x": 200, "y": 0, "ancho": 24, "alto": 300}]
    encontrados = hallazgos(documento([{"x": 120, "y": 160}, {"x": 300, "y": 160}], muro, modo="ida-y-vuelta"))
    assert [h.path.rsplit(".", 1)[-1] for h in encontrados] == ["puntos[1]"]
    assert "línea recta" in encontrados[0].message


def test_un_punto_intermedio_rodea_el_mueble():
    mueble = [{"x": 180, "y": 140, "ancho": 20, "alto": 40}]
    rodeo = [{"x": 140, "y": 100}, {"x": 240, "y": 100}, {"x": 280, "y": 160}]
    assert not hallazgos(documento(rodeo, mueble, modo="ida-y-vuelta"))
    # En circuito el regreso recto de (280, 160) a la partida (80, 160) cruza el mueble.
    regreso = hallazgos(documento(rodeo, mueble, modo="circuito"))
    assert len(regreso) == 1 and "regreso a la partida" in regreso[0].message


def test_no_tapa_una_puerta():
    puerta = {"tipo": "EXIT", "clave": "salida", "etiqueta": "Salida", "x": 300, "y": 160}
    cerca = hallazgos(documento([{"x": 200, "y": 160}, {"x": 260, "y": 160}], modo="ida-y-vuelta", puertas=[puerta]))
    assert len(cerca) == 1 and "«Salida»" in cerca[0].message
    # A más de 56 px de la puerta en todo el trayecto, nada que decir.
    assert not hallazgos(documento([{"x": 200, "y": 160}, {"x": 240, "y": 100}], modo="ida-y-vuelta", puertas=[puerta]))


def test_partida_sobre_un_mueble():
    encontrados = hallazgos(documento([{"x": 200, "y": 160}, {"x": 240, "y": 160}], [{"x": 70, "y": 150, "ancho": 20, "alto": 20}]))
    assert len(encontrados) == 1 and "partida" in encontrados[0].message


def _persona(puntos, modo="ida-y-vuelta"):
    mapa = SimpleNamespace(width=400, height=500)
    return SimpleNamespace(object_type="PERSON", position_x=80, position_y=160, width=20, height=20, scene_map=mapa,
                           metadata_json=json.dumps({"movimiento": {"tipo": "ruta", "modo": modo, "puntos": puntos}}))


def test_servidor_mide_la_cercania_contra_los_tramos_y_no_contra_el_rectangulo_envolvente():
    persona = _persona([{"x": 300, "y": 160}, {"x": 300, "y": 420}])
    # Junto al primer tramo, lejos de la partida: cerca.
    world_service._require_nearby(SimpleNamespace(player_x=200, player_y=250), persona)
    # Dentro del rectángulo envolvente (80…320 × 160…440) pero a más de 120 px de todo tramo: lejos.
    with pytest.raises(ValidationError):
        world_service._require_nearby(SimpleNamespace(player_x=100, player_y=400), persona)


def test_servidor_cuenta_el_regreso_del_circuito():
    puntos = [{"x": 300, "y": 160}, {"x": 300, "y": 420}]
    # Junto a la diagonal de regreso (300, 420) → (80, 160) y a más de 120 px de los otros dos tramos.
    jugador = SimpleNamespace(player_x=170, player_y=320)
    world_service._require_nearby(jugador, _persona(puntos, "circuito"))
    with pytest.raises(ValidationError):
        world_service._require_nearby(jugador, _persona(puntos, "ida-y-vuelta"))


def test_servidor_descarta_una_ruta_mal_formada():
    persona = _persona([])
    assert world_service._interaction_rect(persona) == (80, 160, 20, 20)


def test_no_atraviesa_a_otra_persona():
    """Las personas no chocan entre sí en el juego: el trayecto no puede pasar por donde otra está de pie."""
    otra = {"tipo": "PERSON", "clave": "abuela", "x": 200, "y": 160, "metadatos": {"apoyo": "pies"}}
    encontrados = hallazgos(documento([{"x": 300, "y": 160}, {"x": 300, "y": 220}], modo="ida-y-vuelta", puertas=[otra]))
    assert len(encontrados) == 1 and "otra persona" in encontrados[0].message
    assert not hallazgos(documento([{"x": 140, "y": 220}, {"x": 300, "y": 220}], modo="ida-y-vuelta", puertas=[otra]))
