"""P6 · Revisión final · Geometría de las salas por encuadre (una sola tabla en cuatro lugares).

La zona caminable de cada encuadre vive en el generador de la biblioteca (``biblioteca/scripts/geometria.mjs``), en el editor
(``features/autoria/modelo/geometria.ts``) y aquí (``apps.biblioteca.services.geometria``), de donde sale la copia al caso. Si
una cambia y las otras no, el editor mostraría una zona que el servidor no hace valer: estas pruebas fallan antes.
"""
import re
from pathlib import Path

import pytest

from apps.biblioteca.services import geometria

REPO_ROOT = Path(__file__).resolve().parents[4]
GEOMETRIA_MJS = REPO_ROOT / "biblioteca" / "scripts" / "geometria.mjs"
GEOMETRIA_TS = REPO_ROOT / "frontend" / "src" / "app" / "features" / "autoria" / "modelo" / "geometria.ts"
CUADRICULA = 4


def _zonas_de(fuente):
    """Las zonas de un archivo ``geometria.*``: ``'encuadre': { x: 96, y: 236, ancho: 768, alto: 250 }``."""
    patron = re.compile(
        r"'([a-z-]+)':\s*\{\s*x:\s*(\d+),\s*y:\s*(\d+),\s*ancho:\s*(\d+),\s*alto:\s*(\d+)\s*\}"
    )
    return {m[0]: tuple(int(n) for n in m[1:]) for m in patron.findall(fuente.read_text(encoding="utf-8"))}


def test_la_zona_caminable_coincide_con_la_del_generador_de_la_biblioteca():
    del_generador = _zonas_de(GEOMETRIA_MJS)
    assert set(del_generador) == set(geometria.ZONAS), "el generador y el servidor no hablan de los mismos encuadres"
    assert del_generador == geometria.ZONAS


def test_la_zona_caminable_coincide_con_la_del_editor():
    del_editor = _zonas_de(GEOMETRIA_TS)
    assert set(del_editor) == set(geometria.ZONAS), "el editor y el servidor no hablan de los mismos encuadres"
    assert del_editor == geometria.ZONAS


def test_el_lienzo_coincide_con_el_del_editor_y_el_generador():
    for archivo in (GEOMETRIA_MJS, GEOMETRIA_TS):
        fuente = archivo.read_text(encoding="utf-8")
        ancho = int(re.search(r"ANCHO_SALA = (\d+)", fuente).group(1))
        alto = int(re.search(r"ALTO_SALA = (\d+)", fuente).group(1))
        assert (ancho, alto) == (geometria.ANCHO_SALA, geometria.ALTO_SALA), archivo.name


def test_todos_los_encuadres_del_esquema_tienen_zona():
    esquema = (REPO_ROOT / "biblioteca" / "esquema" / "escenario.schema.json").read_text(encoding="utf-8")
    nombres = set(re.findall(r'"(tres-paredes|dos-paredes-izquierda|dos-paredes-derecha|una-pared)"', esquema))
    assert nombres == set(geometria.ZONAS)


@pytest.mark.parametrize("encuadre", sorted(geometria.ZONAS))
def test_las_paredes_son_justo_lo_que_queda_fuera_de_la_zona(encuadre):
    """Cada punto de la sala está en la zona caminable o dentro de alguna pared, y nunca en las dos."""
    zona = geometria.zona_caminable(encuadre)
    paredes = geometria.paredes(encuadre)
    for x in range(0, geometria.ANCHO_SALA, CUADRICULA):
        for y in range(0, geometria.ALTO_SALA, CUADRICULA):
            en_zona = zona[0] <= x < zona[0] + zona[2] and zona[1] <= y < zona[1] + zona[3]
            en_pared = any(p.x <= x < p.x + p.ancho and p.y <= y < p.y + p.alto for p in paredes)
            assert en_zona != en_pared, (encuadre, x, y)


@pytest.mark.parametrize("encuadre", sorted(geometria.ZONAS))
def test_las_paredes_caben_en_la_sala_y_tienen_nombre_unico(encuadre):
    paredes = geometria.paredes(encuadre)
    assert len({p.clave for p in paredes}) == len(paredes)
    for p in paredes:
        assert p.ancho > 0 and p.alto > 0 and p.etiqueta
        assert 0 <= p.x and p.x + p.ancho <= geometria.ANCHO_SALA
        assert 0 <= p.y and p.y + p.alto <= geometria.ALTO_SALA


def test_las_paredes_laterales_solo_estan_donde_el_encuadre_las_tiene():
    claves = {e: {p.clave for p in geometria.paredes(e)} for e in geometria.ZONAS}
    assert {"pared-fondo", "pared-izquierda", "pared-derecha"} <= claves["tres-paredes"]
    assert "pared-izquierda" in claves["dos-paredes-izquierda"] and "pared-derecha" not in claves["dos-paredes-izquierda"]
    assert "pared-derecha" in claves["dos-paredes-derecha"] and "pared-izquierda" not in claves["dos-paredes-derecha"]
    assert not {"pared-izquierda", "pared-derecha"} & claves["una-pared"]
    for conjunto in claves.values():
        assert "pared-fondo" in conjunto


def test_un_encuadre_desconocido_se_rechaza():
    with pytest.raises(KeyError):
        geometria.zona_caminable("circular")
