"""Reglas de los modelos interactivos (ver arte_objetos/__init__.py). Se corre con pytest."""
import json
import os
import sys

import numpy as np
import pytest

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from arte_objetos import TAM  # noqa: E402
from arte_objetos.generar import CATALOGO, acabar, cargar_catalogo  # noqa: E402
from arte_objetos.registro import GRUPOS, MODELOS  # noqa: E402

CATALOGO_DATA = cargar_catalogo(CATALOGO)
POR_ID = {m['id']: m for m in CATALOGO_DATA['modelos']}
IDS = sorted(POR_ID)


def _grupo_de(id_):
    return POR_ID[id_]['lugarSugerido']


def _opacos(arr):
    return arr[arr[:, :, 3] > 0]


@pytest.fixture(scope='module')
def dibujos():
    return {id_: MODELOS[id_]() for id_ in IDS if id_ in MODELOS}


def test_cada_modelo_del_catalogo_tiene_dibujo_en_su_grupo():
    faltan = [id_ for id_ in IDS if id_ not in GRUPOS[_grupo_de(id_)]]
    assert not faltan, f"sin dibujo (o en otro grupo): {', '.join(faltan)}"


def test_ningun_dibujo_sobra():
    sobran = sorted(set(MODELOS) - set(IDS))
    assert not sobran, f"dibujos que no están en el catálogo: {', '.join(sobran)}"


@pytest.mark.parametrize('id_', IDS)
def test_cuadros_y_tamano(id_, dibujos):
    if id_ not in dibujos:
        pytest.skip('sin dibujo todavía')
    cs = dibujos[id_]
    assert len(cs) == 1 + POR_ID[id_]['animacionCerca']['cuadros']
    for c in cs:
        assert c.size == (TAM, TAM)


@pytest.mark.parametrize('id_', IDS)
def test_borde_transparente_y_alfa_binario(id_, dibujos):
    if id_ not in dibujos:
        pytest.skip('sin dibujo todavía')
    for c in dibujos[id_]:
        a = np.array(c)[:, :, 3]
        assert set(np.unique(a)) <= {0, 255}, 'alfa no binario'
        borde = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
        assert not borde.any(), 'el borde de 1 px debe quedar transparente para el contorno'


@pytest.mark.parametrize('id_', IDS)
def test_el_reposo_no_esta_vacio_y_pocos_colores(id_, dibujos):
    if id_ not in dibujos:
        pytest.skip('sin dibujo todavía')
    cs = dibujos[id_]
    assert (np.array(cs[0])[:, :, 3] > 0).sum() >= 40, 'el reposo casi no tiene píxeles'
    colores = {tuple(p[:3]) for c in cs for p in _opacos(np.array(c))}
    assert len(colores) <= 15, f'{len(colores)} colores opacos; máximo 15 antes del contorno'


@pytest.mark.parametrize('id_', IDS)
def test_la_animacion_cambia_entre_cuadros(id_, dibujos):
    if id_ not in dibujos:
        pytest.skip('sin dibujo todavía')
    cs = [np.array(c) for c in dibujos[id_]]
    for i in range(1, len(cs)):
        assert not np.array_equal(cs[i], cs[i - 1]), f'el cuadro {i} es igual al anterior'


@pytest.mark.parametrize('id_', IDS)
def test_acabado_cabe_en_16_colores(id_, dibujos):
    if id_ not in dibujos:
        pytest.skip('sin dibujo todavía')
    reposo, hoja = acabar(dibujos[id_])
    assert reposo.size == (TAM, TAM)
    assert hoja.size == (TAM * POR_ID[id_]['animacionCerca']['cuadros'], TAM)
    colores = {tuple(p[:3]) for im in (reposo, hoja) for p in _opacos(np.array(im))}
    assert len(colores) <= 16


def test_el_catalogo_es_valido_en_lo_basico():
    assert CATALOGO_DATA['esquema'] == 1
    assert len(IDS) == len(CATALOGO_DATA['modelos']), 'ids repetidos'
    for m in CATALOGO_DATA['modelos']:
        assert m['arte'] == f"arte/{m['id']}.png"
        assert m['animacionCerca']['hoja'] == f"arte/{m['id']}-cerca.png"
