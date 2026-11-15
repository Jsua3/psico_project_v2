"""Geometría de las salas por encuadre y por ancho (contrato ``x-siep-2.2.md``, sección 1).

La definición vive en el servidor (``apps.biblioteca.services.geometria``, la fuente), en el editor
(``features/autoria/modelo/geometria.ts``, que también lee el juego) y en el validador de la biblioteca
(``biblioteca/scripts/geometria.mjs``). Las tres reproducen la tabla dorada ``biblioteca/esquema/geometria-salas.json``,
que sale de aquí: si una copia cambia y las otras no, el editor mostraría una zona que el servidor no hace valer.
Aquí se comprueba la fuente contra la tabla y que la tabla de la copia en TS es la misma; ``geometria.spec.ts`` y
``geometria.test.mjs`` comprueban sus funciones contra ella.
"""
import json
import re
from pathlib import Path

import pytest

from apps.biblioteca.services import geometria

REPO_ROOT = Path(__file__).resolve().parents[4]
GEOMETRIA_MJS = REPO_ROOT / "biblioteca" / "scripts" / "geometria.mjs"
GEOMETRIA_TS = REPO_ROOT / "frontend" / "src" / "app" / "features" / "autoria" / "modelo" / "geometria.ts"
TABLA_JSON = REPO_ROOT / "biblioteca" / "esquema" / "geometria-salas.json"
TABLA_TS = REPO_ROOT / "frontend" / "src" / "app" / "features" / "autoria" / "modelo" / "geometria-salas.fixture.ts"
CUADRICULA = 4
ENCUADRES = sorted(geometria.LATERALES)


def test_la_zona_a_960_es_la_tabla_de_siempre():
    assert {e: geometria.zona_caminable(e) for e in ENCUADRES} == {
        "tres-paredes": (96, 236, 768, 250),
        "dos-paredes-izquierda": (96, 236, 840, 250),
        "dos-paredes-derecha": (24, 236, 840, 250),
        "una-pared": (24, 236, 912, 250),
    }
    assert geometria.ZONAS == {e: geometria.zona_caminable(e, 960) for e in ENCUADRES}


@pytest.mark.parametrize("ancho, borde, tres, una", [
    (960, 96, (96, 236, 768, 250), (24, 236, 912, 250)),
    (1200, 115, (115, 236, 970, 250), (24, 236, 1152, 250)),
    (1440, 134, (134, 236, 1172, 250), (24, 236, 1392, 250)),
    (1680, 153, (153, 236, 1374, 250), (24, 236, 1632, 250)),
    (1920, 172, (172, 236, 1576, 250), (24, 236, 1872, 250)),
])
def test_zona_por_ancho(ancho, borde, tres, una):
    assert geometria.borde(ancho) == borde
    assert geometria.zona_caminable("tres-paredes", ancho) == tres
    assert geometria.zona_caminable("una-pared", ancho) == una
    assert geometria.zona_caminable("dos-paredes-izquierda", ancho) == (borde, 236, ancho - borde - 24, 250)
    assert geometria.zona_caminable("dos-paredes-derecha", ancho) == (24, 236, ancho - borde - 24, 250)


def test_un_ancho_fuera_del_catalogo_se_rechaza():
    with pytest.raises(ValueError):
        geometria.borde(1000)


@pytest.mark.parametrize("muro, pos, ancho, ancla, llegada", [
    # Ejemplo 1 del contrato (sala de 1440, tres paredes).
    ("izquierda", 176, 1440, (69, 406), (150, 406)),
    ("fondo", 1136, 1440, (1270, 230), (1270, 260)),
    ("camara", 584, 1440, (718, 528), (718, 476)),
    # Ejemplo 2 (pasillo de 1680, tres paredes).
    ("fondo", 160, 1680, (313, 230), (313, 260)),
    ("fondo", 1120, 1680, (1273, 230), (1273, 260)),
    ("izquierda", 160, 1680, (84, 390), (169, 390)),
    ("derecha", 160, 1680, (1596, 390), (1511, 390)),
    ("camara", 344, 1680, (433, 528), (433, 476)),
    ("camara", 1032, 1680, (1250, 528), (1250, 476)),
    # Puertas de regreso supuestas en el contrato.
    ("camara", 384, 960, (480, 528), (480, 476)),
    ("camara", 488, 1200, (604, 528), (604, 476)),
    ("fondo", 485, 1200, (600, 230), (600, 260)),
    ("fondo", 488, 1200, (603, 230), (603, 260)),
    ("izquierda", 160, 1200, (66, 390), (131, 390)),
])
def test_ancla_y_llegada_del_contrato(muro, pos, ancho, ancla, llegada):
    assert geometria.ancla(muro, pos, "tres-paredes", ancho) == ancla
    assert geometria.llegada(muro, pos, "tres-paredes", ancho) == llegada


def test_redondear_lleva_las_mitades_hacia_arriba():
    assert geometria.redondear(8, 16) == 1  # 0,5
    assert geometria.redondear(-8, 16) == 0  # -0,5
    assert geometria.redondear(24, 16) == 2  # 1,5
    assert geometria.redondear(-24, 16) == -1  # -1,5
    assert geometria.redondear(7, 16) == 0


@pytest.mark.parametrize("ancho", geometria.ANCHOS)
@pytest.mark.parametrize("encuadre", ENCUADRES)
def test_la_llegada_es_caminable_en_todo_el_muro(encuadre, ancho):
    """El pie del jugador (22 × 16, anclado 16 px arriba del punto) en la llegada no toca ninguna pared."""
    for muro in geometria.MUROS:
        largo = geometria.largo_muro(muro, encuadre, ancho)
        for pos in range(0, largo + 1, 8):
            x, y = geometria.llegada(muro, pos, encuadre, ancho)
            pie = (x - 11, y - 16, 22, 16)
            for pared in geometria.paredes(encuadre, ancho):
                assert not (pie[0] < pared.x + pared.ancho and pared.x < pie[0] + pie[2]
                            and pie[1] < pared.y + pared.alto and pared.y < pie[1] + pie[3]), (muro, pos, pared)
            # La caja del objeto de la puerta (24 × 40 desde el umbral) cabe en la sala.
            assert x + 24 <= ancho and y + 40 <= geometria.ALTO_SALA


@pytest.mark.parametrize("ancho", geometria.ANCHOS)
@pytest.mark.parametrize("encuadre", ENCUADRES)
def test_las_paredes_son_justo_lo_que_queda_fuera_de_la_zona(encuadre, ancho):
    """Cada punto de la sala está en la zona caminable o dentro de alguna pared, y nunca en las dos."""
    zona = geometria.zona_caminable(encuadre, ancho)
    paredes = geometria.paredes(encuadre, ancho)
    for x in range(0, ancho, CUADRICULA):
        for y in range(0, geometria.ALTO_SALA, CUADRICULA):
            en_zona = zona[0] <= x < zona[0] + zona[2] and zona[1] <= y < zona[1] + zona[3]
            en_pared = any(p.x <= x < p.x + p.ancho and p.y <= y < p.y + p.alto for p in paredes)
            assert en_zona != en_pared, (encuadre, ancho, x, y)


@pytest.mark.parametrize("ancho", geometria.ANCHOS)
@pytest.mark.parametrize("encuadre", ENCUADRES)
def test_las_paredes_caben_en_la_sala_y_tienen_nombre_unico(encuadre, ancho):
    paredes = geometria.paredes(encuadre, ancho)
    assert len({p.clave for p in paredes}) == len(paredes)
    for p in paredes:
        assert p.ancho > 0 and p.alto > 0 and p.etiqueta
        assert 0 <= p.x and p.x + p.ancho <= ancho
        assert 0 <= p.y and p.y + p.alto <= geometria.ALTO_SALA


def test_las_paredes_laterales_solo_estan_donde_el_encuadre_las_tiene():
    claves = {e: {p.clave for p in geometria.paredes(e)} for e in ENCUADRES}
    assert {"pared-fondo", "pared-izquierda", "pared-derecha"} <= claves["tres-paredes"]
    assert "pared-izquierda" in claves["dos-paredes-izquierda"] and "pared-derecha" not in claves["dos-paredes-izquierda"]
    assert "pared-derecha" in claves["dos-paredes-derecha"] and "pared-izquierda" not in claves["dos-paredes-derecha"]
    assert not {"pared-izquierda", "pared-derecha"} & claves["una-pared"]
    for conjunto in claves.values():
        assert "pared-fondo" in conjunto


def test_el_largo_de_los_muros():
    assert geometria.largo_muro("fondo", "tres-paredes", 1680) == 1374
    assert geometria.largo_muro("camara", "una-pared", 960) == 960
    assert geometria.largo_muro("izquierda", "tres-paredes", 1440) == 298
    assert geometria.largo_muro("derecha", "dos-paredes-izquierda", 1440) == 0


def test_un_encuadre_desconocido_se_rechaza():
    with pytest.raises(KeyError):
        geometria.zona_caminable("circular")


def test_la_tabla_dorada_esta_al_dia():
    """Se regenera con ``python -c "from apps.biblioteca.services import geometria; geometria.escribir_tabla_dorada()"``."""
    assert json.loads(TABLA_JSON.read_text(encoding="utf-8")) == geometria.tabla_dorada()


def test_la_copia_ts_trae_la_tabla_dorada():
    fuente = TABLA_TS.read_text(encoding="utf-8")
    cuerpo = re.search(r"export const GEOMETRIA_SALAS = (\{.*\}) as const;", fuente, re.S)
    assert cuerpo, "geometria-salas.fixture.ts no tiene la forma esperada"
    assert json.loads(cuerpo.group(1)) == geometria.tabla_dorada()


@pytest.mark.parametrize("archivo", [GEOMETRIA_MJS, GEOMETRIA_TS])
def test_las_copias_declaran_las_mismas_constantes(archivo):
    fuente = archivo.read_text(encoding="utf-8")
    assert int(re.search(r"ALTO_SALA = (\d+)", fuente).group(1)) == geometria.ALTO_SALA
    assert int(re.search(r"ANCHO_SALA = (\d+)", fuente).group(1)) == geometria.ANCHO_SALA
    anchos = [int(n) for n in re.search(r"ANCHOS = (?:Object\.freeze\()?\[([\d, ]+)\]", fuente).group(1).split(",")]
    assert tuple(anchos) == geometria.ANCHOS


def test_todos_los_encuadres_del_esquema_tienen_zona():
    esquema = (REPO_ROOT / "biblioteca" / "esquema" / "escenario.schema.json").read_text(encoding="utf-8")
    nombres = set(re.findall(r'"(tres-paredes|dos-paredes-izquierda|dos-paredes-derecha|una-pared)"', esquema))
    assert nombres == set(geometria.LATERALES)
