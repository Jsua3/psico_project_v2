"""Contratos de piezas_superficies.py (pisos y muros maestros) y piezas_muro.py (ventanas, piezas de muro y lámparas)."""
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import piezas_geo as g  # noqa: E402
import piezas_muro as pm  # noqa: E402
import piezas_superficies as ps  # noqa: E402

PISOS = [(t, v) for t in ps.PISOS for v in ps.PISOS[t]]
MUROS = ps.muros_del_catalogo()


def _colores(im):
    return len(im.convert('RGB').getcolors(maxcolors=1 << 20))


# ── pisos ──────────────────────────────────────────────────────────────────────

def test_hay_seis_pisos_en_dos_variantes():
    assert sorted(ps.PISOS) == ['adoquin', 'baldosa', 'cemento', 'damero', 'madera', 'vinilo']
    assert all({'a', 'b'} <= set(v) for v in ps.PISOS.values())
    assert sum(len(v) for v in ps.PISOS.values()) == 12 + 28, 'más el piso propio de cada sala de la biblioteca'
    assert ps.PISOS['damero']['universidad-cafeteria']['A'] == (146, 136, 122)


@pytest.mark.parametrize('tipo, variante', PISOS)
def test_cada_piso_maestro_mide_1920_y_no_pasa_de_40_colores(tipo, variante):
    im = ps.piso_maestro(tipo, variante)
    assert im.size == (1920, g.FONDO) and im.mode == 'RGB'
    assert _colores(im) <= ps.MAX_COLORES


@pytest.mark.parametrize('tipo, variante', PISOS)
def test_el_piso_maestro_no_repite_tramos(tipo, variante):
    """Cero repetición visible: ningún tramo de 240 px es igual a otro."""
    px = np.array(ps.piso_maestro(tipo, variante))
    tramos = [px[:, x:x + 240].tobytes() for x in range(0, 1920, 240)]
    assert len(set(tramos)) == len(tramos)


@pytest.mark.parametrize('ancho', g.ANCHOS)
def test_el_piso_de_una_sala_es_el_recorte_central_de_la_maestra(ancho):
    maestra, sala = ps.piso_maestro('madera', 'a'), ps.piso('madera', 'a', ancho)
    x0 = (1920 - ancho) // 2
    assert sala.size == (ancho, g.FONDO)
    assert np.array_equal(np.array(sala), np.array(maestra)[:, x0:x0 + ancho])


def test_un_piso_fuera_del_catalogo_se_rechaza():
    with pytest.raises(KeyError, match='alfombra'):
        ps.piso_maestro('alfombra', 'a')
    with pytest.raises(ValueError, match='1000'):
        ps.piso('madera', 'a', 1000)


# ── muros ──────────────────────────────────────────────────────────────────────

def test_hay_cinco_acabados_y_la_paleta_de_cada_lugar():
    assert list(ps.ACABADOS) == ['pintura', 'zocalo-alto', 'azulejo', 'ladrillo', 'paneles']
    assert sorted(ps.PALETAS_BASE) == ['casa', 'comisaria', 'hospital', 'universidad']


def test_cada_sala_de_la_biblioteca_conserva_su_color_de_muro():
    import arte_casa
    import arte_universidad
    assert len(ps.PALETAS) == 4 + 28 and len(ps.muros_del_catalogo()) == 20 + 28
    for modulo, lugar, sala in ((arte_universidad, 'universidad', 'cafeteria'), (arte_casa, 'casa', 'cocina')):
        P = ps.PALETAS[f'{lugar}-{sala}']
        assert P['pared'] == tuple(modulo.SALAS[sala]['pared'])
        px = np.array(ps.muro_maestro(P['acabado'], f'{lugar}-{sala}'))
        assert (px[40:60] == np.array(P['pared'], dtype=np.uint8)).all(-1).mean() > 0.8, 'el muro es del color de la sala'
    assert ps.PALETAS['comisaria-recepcion']['franja'][0] > 84, 'y conserva su franja de color'


@pytest.mark.parametrize('acabado, paleta', MUROS)
def test_cada_muro_maestro_mide_1920_y_no_pasa_de_40_colores(acabado, paleta):
    im = ps.muro_maestro(acabado, paleta)
    assert im.size == (1920, g.ALTO_MURO + 6)
    assert _colores(im) <= ps.MAX_COLORES
    px = np.array(im)
    # Arriba, el canto del muro cortado; abajo, el zócalo, de lado a lado.
    assert (px[2] == np.array(ps.PALETAS[paleta]['canto'], dtype=np.uint8)).all()
    assert (px[-2] == np.array(ps.PALETAS[paleta]['zocalo'], dtype=np.uint8)).all()


@pytest.mark.parametrize('encuadre', g.ENCUADRES)
@pytest.mark.parametrize('ancho', g.ANCHOS)
def test_el_muro_del_fondo_cubre_exactamente_su_largo(encuadre, ancho):
    im, x = ps.muro_fondo('zocalo-alto', 'casa', encuadre, ancho)
    xl, xr = g.limites(encuadre, ancho)
    assert x == xl and im.size == (xr - xl, g.ALTO_MURO + 6)


@pytest.mark.parametrize('acabado', ps.ACABADOS)
@pytest.mark.parametrize('ancho', g.ANCHOS)
def test_el_muro_lateral_sigue_la_perspectiva_de_su_ancho(acabado, ancho):
    izq = ps.muro_lado(acabado, 'hospital', ancho, 'izquierda')
    der = ps.muro_lado(acabado, 'hospital', ancho, 'derecha')
    b = g.borde(ancho)
    assert izq.size == der.size == (b, g.ALTO)
    alfa = np.array(izq)[:, :, 3]
    assert set(np.unique(alfa)) <= {0, 255}
    # Al pie del muro del fondo el muro lateral llega hasta el borde; junto a la cámara solo quedan 24 px de vacío.
    assert alfa[g.SEAM - 2, b - 2] == 255 and alfa[g.ALTO - 2, g.MARGEN + 6] == 0 and alfa[g.ALTO - 2, 4] == 255
    # El piso entre la unión y el borde se deja ver.
    assert alfa[g.SEAM + 150, b - 4] == 0
    assert np.array_equal(np.array(der)[:, ::-1, 3], alfa)


# ── ventanas, piezas de muro y lámparas ────────────────────────────────────────

CLAVES = list(pm.PIEZAS)
DE_MURO = [c for c in CLAVES if 'suelo' not in pm.PIEZAS[c]['muros']]


def test_el_catalogo_trae_lo_que_pide_el_diseno():
    assert [m for t, m in CLAVES if t == 'ventana'] == ['corrediza', 'persiana', 'alta', 'ventanal']
    assert [m for t, m in CLAVES if t == 'lampara'] == ['tubo', 'colgante', 'pie', 'mesa']
    assert {t for t, _ in CLAVES} >= {'cuadro', 'reloj', 'cartelera', 'tablero', 'espejo', 'senal', 'cruz', 'extintor', 'gel'}


@pytest.mark.parametrize('tipo, modelo', CLAVES)
def test_cada_pieza_cumple_el_contrato(tipo, modelo):
    F = pm.PIEZAS[(tipo, modelo)]
    cuadros = pm.cuadros(tipo, modelo)
    assert len(cuadros) == F['cuadros']
    hoja = np.array(pm.hoja(tipo, modelo))
    assert hoja.shape[1] == F['cuadros'] * cuadros[0].width
    assert set(np.unique(hoja[:, :, 3])) <= {0, 255}, 'alfa binario'
    assert len(np.unique(hoja[hoja[:, :, 3] == 255][:, :3], axis=0)) <= F['colores']
    assert cuadros[0].width <= F['ocupa'] + 2, 'la pieza no se sale del ancho que declara ocupar'
    assert F['ocupa'] % g.REJILLA == 0


@pytest.mark.parametrize('tipo, modelo', DE_MURO)
def test_el_apoyo_de_una_pieza_de_muro_es_su_pie_sobre_el_piso(tipo, modelo):
    cuadro = pm.cuadros(tipo, modelo)[0]
    ax, ay = pm.apoyo(tipo, modelo)
    assert abs(ax - cuadro.width / 2) <= 1
    assert cuadro.height <= ay <= g.ALTO_MURO + 2, 'cabe entre el piso y el techo'


@pytest.mark.parametrize('tipo, modelo', DE_MURO)
@pytest.mark.parametrize('ancho', (960, 1920))
def test_cada_pieza_de_muro_tiene_vista_lateral(tipo, modelo, ancho):
    cuadros = pm.cuadros(tipo, modelo, 'lado', ancho)
    assert len(cuadros) == pm.PIEZAS[(tipo, modelo)]['cuadros']
    assert set(np.unique(np.array(cuadros[0])[:, :, 3])) <= {0, 255}
    assert cuadros[0].width < pm.cuadros(tipo, modelo)[0].width + 8, 'de lado se ve más angosta'


@pytest.mark.parametrize('modelo', ['corrediza', 'persiana', 'alta', 'ventanal'])
def test_la_ventana_cambia_entre_el_dia_y_la_noche(modelo):
    dia, noche = pm.cuadro_de('ventana', modelo, 'dia'), pm.cuadro_de('ventana', modelo, 'noche')
    assert dia.size == noche.size
    assert np.array(dia)[:, :, :3].astype(int).sum() > np.array(noche)[:, :, :3].astype(int).sum()
    assert pm.PIEZAS[('ventana', modelo)]['luz']['momento'] == 'dia'


@pytest.mark.parametrize('modelo', ['tubo', 'colgante', 'pie', 'mesa'])
def test_la_lampara_se_enciende_de_noche(modelo):
    apagada, encendida = pm.cuadro_de('lampara', modelo, 'dia'), pm.cuadro_de('lampara', modelo, 'noche')
    assert not np.array_equal(np.array(apagada), np.array(encendida))
    assert pm.cuadro_de('lampara', modelo, 'dia', encendida=True) is encendida
    luz = pm.PIEZAS[('lampara', modelo)]['luz']
    assert luz['momento'] == 'noche' and luz['tono'] == ('frio' if modelo == 'tubo' else 'calido')


def test_el_reloj_tiene_doce_pasos_de_segundero():
    cuadros = pm.cuadros('reloj', 'reloj')
    assert len(cuadros) == 12 and pm.PIEZAS[('reloj', 'reloj')]['fps'] == 1
    assert len({np.array(c).tobytes() for c in cuadros}) == 12


def test_una_pieza_fuera_del_catalogo_se_rechaza():
    with pytest.raises(KeyError, match='acuario'):
        pm.cuadros('acuario', 'grande')
