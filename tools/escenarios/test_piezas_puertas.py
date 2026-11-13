"""Contratos de piezas_geo.py (geometría por ancho) y piezas_puertas.py (7 puertas, 3 vistas, 4 cuadros)."""
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import piezas_geo as g  # noqa: E402
import piezas_puertas as pp  # noqa: E402


# ── geometría ──────────────────────────────────────────────────────────────────

def test_el_borde_del_muro_lateral_crece_con_el_ancho():
    assert [g.borde(a) for a in g.ANCHOS] == [96, 115, 134, 153, 172]


def test_un_ancho_fuera_del_catalogo_se_rechaza_con_su_valor():
    with pytest.raises(ValueError, match='1000'):
        g.borde(1000)


@pytest.mark.parametrize('ancho', g.ANCHOS)
def test_la_linea_del_piso_es_paralela_a_la_base_del_muro_lateral(ancho):
    """Lo que hace posible recortar la maestra: la línea del piso que nace en el borde ES la unión con el muro."""
    for y in (g.SEAM, 300, 400, g.ALTO):
        assert abs(g.esp(ancho, g.borde(ancho), y) - g.junta(ancho, 'izquierda', y)) <= 1
        assert abs(g.esp(ancho, ancho - g.borde(ancho), y) - g.junta(ancho, 'derecha', y)) <= 1
    assert abs(g.junta(ancho, 'izquierda', g.ALTO) - g.MARGEN) < 0.01


def test_la_zona_caminable_a_960_es_la_tabla_de_hoy():
    assert g.zona_caminable('tres-paredes', 960) == (96, 236, 768, 250)
    assert g.zona_caminable('dos-paredes-izquierda', 960) == (96, 236, 840, 250)
    assert g.zona_caminable('dos-paredes-derecha', 960) == (24, 236, 840, 250)
    assert g.zona_caminable('una-pared', 960) == (24, 236, 912, 250)


def test_la_zona_caminable_sigue_al_ancho():
    assert g.zona_caminable('tres-paredes', 1680) == (153, 236, 1374, 250)
    assert g.zona_caminable('una-pared', 1920) == (24, 236, 1872, 250)


def test_una_pieza_se_ubica_por_muro_y_posicion():
    assert g.en_pantalla('fondo', 200, 'tres-paredes', 960) == (296, 230)
    assert g.en_pantalla('izquierda', 0, 'tres-paredes', 960) == (96, 230)
    assert g.en_pantalla('izquierda', 298, 'tres-paredes', 960) == (24, 528)
    assert g.en_pantalla('derecha', 149, 'tres-paredes', 960) == (900, 379)
    assert g.en_pantalla('camara', 384, 'tres-paredes', 960) == (480, 528)
    assert g.largo_muro('fondo', 'tres-paredes', 1440) == 1440 - 2 * 134
    assert g.largo_muro('izquierda', 'una-pared', 960) == 0


def test_el_punto_de_llegada_de_una_puerta_cae_en_la_zona_caminable():
    for encuadre in g.ENCUADRES:
        for ancho in g.ANCHOS:
            x0, y0, w, h = g.zona_caminable(encuadre, ancho)
            for muro in g.MUROS:
                largo = g.largo_muro(muro, encuadre, ancho)
                if not largo:
                    continue
                for pos in (48, largo // 2, largo - 48):
                    x, y = g.llegada(muro, pos, encuadre, ancho)
                    assert x0 <= x <= x0 + w and y0 <= y <= y0 + h, (encuadre, ancho, muro, pos)


# ── puertas ────────────────────────────────────────────────────────────────────

VISTAS = [('frente', 960), ('camara', 960)] + [('lado', a) for a in g.ANCHOS]
CASOS = [(m, v, a) for m in pp.MODELOS for v, a in VISTAS]


def test_el_catalogo_tiene_las_siete_puertas():
    assert list(pp.MODELOS) == ['madera', 'madera-ventanilla', 'vidrio', 'corrediza', 'urgencias', 'metalica', 'paso']


@pytest.mark.parametrize('modelo, vista, ancho', CASOS)
def test_cada_hoja_cumple_el_contrato(modelo, vista, ancho):
    hoja = pp.hoja(modelo, vista, ancho)
    cuadros = pp.cuadros(modelo, vista, ancho)
    assert len(cuadros) == 4
    assert hoja.size == (4 * cuadros[0].width, cuadros[0].height)
    px = np.array(hoja)
    assert set(np.unique(px[:, :, 3])) <= {0, 255}, 'alfa binario'
    visibles = px[px[:, :, 3] == 255][:, :3]
    assert len(np.unique(visibles, axis=0)) <= pp.MAX_COLORES
    ax, ay = pp.apoyo(modelo, vista, ancho)
    assert 0 <= ax <= cuadros[0].width and 0 <= ay <= cuadros[0].height


@pytest.mark.parametrize('modelo', pp.MODELOS)
def test_de_frente_el_apoyo_es_el_centro_de_la_base(modelo):
    cuadro = pp.cuadros(modelo, 'frente')[0]
    ax, ay = pp.apoyo(modelo, 'frente')
    assert abs(ax - cuadro.width / 2) <= 1
    # Bajo la línea del piso solo quedan el umbral y el contorno.
    assert 0 < cuadro.height - ay <= 5
    assert cuadro.width <= pp.MODELOS[modelo]['ocupa'] + 2


@pytest.mark.parametrize('modelo', pp.MODELOS)
def test_del_lado_de_la_camara_el_apoyo_es_el_borde_inferior(modelo):
    cuadro = pp.cuadros(modelo, 'camara')[0]
    ax, ay = pp.apoyo(modelo, 'camara')
    assert ay == cuadro.height and abs(ax - cuadro.width / 2) <= 4


def _vano(cuadro):
    px = np.array(cuadro)
    oscuros = np.zeros(px.shape[:2], bool)
    for tono in pp.VANO[2:]:
        oscuros |= (px[:, :, :3] == np.array(tono, dtype=np.uint8)).all(-1) & (px[:, :, 3] == 255)
    return int(oscuros.sum())


@pytest.mark.parametrize('modelo', [m for m in pp.MODELOS if m != 'paso'])
@pytest.mark.parametrize('vista, ancho', [('frente', 960), ('lado', 960), ('lado', 1920)])
def test_la_puerta_se_abre_cuadro_a_cuadro(modelo, vista, ancho):
    vanos = [_vano(c) for c in pp.cuadros(modelo, vista, ancho)]
    assert vanos[0] == 0
    assert vanos[0] < vanos[1] < vanos[2] < vanos[3]


def test_el_paso_abierto_no_cambia_entre_cuadros():
    cuadros = pp.cuadros('paso', 'frente')
    assert all(np.array_equal(np.array(cuadros[0]), np.array(c)) for c in cuadros[1:])


def test_la_vista_lateral_se_ensancha_con_la_sala():
    assert pp.cuadros('madera', 'lado', 1920)[0].width > pp.cuadros('madera', 'lado', 960)[0].width


def test_el_espejo_refleja_el_cuadro_y_su_apoyo():
    cuadro, punto = pp.cuadros('madera', 'lado', 960)[0], pp.apoyo('madera', 'lado', 960)
    reflejado, otro = pp.espejo(cuadro, punto)
    assert reflejado.size == cuadro.size and otro == (cuadro.width - punto[0], punto[1])
    assert np.array_equal(np.array(reflejado)[:, ::-1], np.array(cuadro))


def test_ninguna_puerta_usa_el_ambar_de_la_salida_segura():
    """El ámbar queda para la interfaz: ningún tono de puerta es amarillo-anaranjado saturado."""
    for modelo in pp.MODELOS:
        px = np.array(pp.hoja(modelo, 'frente')).astype(int)
        r, v, a = px[:, :, 0], px[:, :, 1], px[:, :, 2]
        ambar = (px[:, :, 3] == 255) & (r > 200) & (v > 130) & (v < 200) & (a < 90)
        assert not ambar.any(), modelo
