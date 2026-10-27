"""Pruebas de arte_comisaria.py: cada pieza del catálogo de la comisaría sale con las normas de ESTILO.md."""
import json
import os
import random
import shutil
import sys

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import arte_comisaria as ac  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COMISARIA = os.path.join(RAIZ, 'biblioteca', 'escenarios', 'comisaria', 'escenario.json')


def cargar():
    with open(COMISARIA, encoding='utf-8') as f:
        return json.load(f)


def propias(esc):
    """Objetos y herramientas que se dibujan aquí (las que vienen de un modelo no)."""
    return [o for o in esc['catalogo']['objetos'] + esc['catalogo']['herramientas'] if not o.get('desdeModelo')]


@pytest.fixture(scope='module')
def generado(tmp_path_factory):
    dir_ = tmp_path_factory.mktemp('comisaria')
    shutil.copy(COMISARIA, dir_ / 'escenario.json')
    ac.generar(str(dir_ / 'escenario.json'), factor=2)
    return dir_, cargar()


def colores(im):
    rgba = np.array(im.convert('RGBA')).reshape(-1, 4)
    opacos = rgba[rgba[:, 3] > 0][:, :3]
    return len(np.unique(opacos, axis=0))


def test_cada_sala_mueble_e_icono_del_catalogo_tiene_dibujo():
    esc = cargar()
    faltan = ([s['id'] for s in esc['salas'] if s['id'] not in ac.SALAS]
              + [m['id'] for m in esc['catalogo']['muebles'] if m['id'] not in ac.MUEBLES]
              + [o['id'] for o in propias(esc) if o['id'] not in ac.ICONOS])
    assert faltan == []
    assert len(esc['salas']) == 9
    assert len(esc['catalogo']['muebles']) == 18


def test_cada_mueble_mide_el_ancho_del_catalogo_con_alfa_binario(generado):
    dir_, esc = generado
    for mueble in esc['catalogo']['muebles']:
        im = Image.open(dir_ / mueble['arte'])
        assert im.mode == 'RGBA', mueble['id']
        assert im.width == mueble['ancho'], mueble['id']
        assert im.height >= mueble['alto'], mueble['id']
        alfas = set(np.unique(np.array(im)[:, :, 3]).tolist())
        assert alfas <= {0, 255}, mueble['id']
        assert 255 in alfas, f"{mueble['id']} está vacío"


def test_ningun_png_supera_los_colores_permitidos(generado):
    dir_, esc = generado
    azar = random.Random(7)
    for sala in esc['salas']:
        im = Image.open(dir_ / sala['fondo'])
        assert im.size == (960, 528), sala['id']
        assert colores(im) <= 32, sala['id']
        px = np.array(im.convert('RGB'))
        for _ in range(30):  # bloques de 2x2 uniformes: factor 2
            bx, by = azar.randrange(480) * 2, azar.randrange(264) * 2
            bloque = px[by:by + 2, bx:bx + 2].reshape(-1, 3)
            assert (bloque == bloque[0]).all(), (sala['id'], bx, by)
    for mueble in esc['catalogo']['muebles']:
        assert colores(Image.open(dir_ / mueble['arte'])) <= 24, mueble['id']
    for pieza in propias(esc):
        im = Image.open(dir_ / pieza['arte'])
        assert im.size == (32, 32), pieza['id']
        assert colores(im) <= 16, pieza['id']


def test_la_comisaria_no_tiene_muebles_contra_paredes_que_el_encuadre_no_tiene():
    """Review Focus 4: las salas de una pared (fachada, pasillo) con la comisaría real."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from marcadores import ZONAS
    esc = cargar()
    muebles = {m['id']: m for m in esc['catalogo']['muebles']}
    for sala in esc['salas']:
        if sala['encuadre'] != 'una-pared':
            continue
        x, y, ancho, alto = ZONAS['una-pared']
        for colocado in sala['muebles']:
            m = muebles[colocado['ref']]
            x0 = colocado['x'] - m['ancho'] / 2
            assert x <= x0 and x0 + m['ancho'] <= x + ancho, (sala['id'], colocado['ref'])
            assert y <= colocado['y'] <= y + alto, (sala['id'], colocado['ref'])
