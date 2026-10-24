"""Pruebas de arte_universidad.py: cada pieza sale con las normas de ESTILO.md."""
import json
import os
import random
import shutil
import sys

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import arte_universidad as au  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UNIVERSIDAD = os.path.join(RAIZ, 'biblioteca', 'escenarios', 'universidad', 'escenario.json')


@pytest.fixture(scope='module')
def generado(tmp_path_factory):
    dir_ = tmp_path_factory.mktemp('universidad')
    shutil.copy(UNIVERSIDAD, dir_ / 'escenario.json')
    au.generar(str(dir_ / 'escenario.json'), factor=2)
    with open(dir_ / 'escenario.json', encoding='utf-8') as f:
        return dir_, json.load(f)


def colores(im):
    rgba = np.array(im.convert('RGBA')).reshape(-1, 4)
    opacos = rgba[rgba[:, 3] > 0][:, :3]
    return len(np.unique(opacos, axis=0))


def test_fondos_960x528_con_32_colores_y_bloques_de_2(generado):
    dir_, esc = generado
    azar = random.Random(5)
    for sala in esc['salas']:
        im = Image.open(dir_ / sala['fondo'])
        assert im.size == (960, 528), sala['id']
        assert im.mode == 'RGB', sala['id']
        assert colores(im) <= 32, sala['id']
        px = np.array(im)
        for _ in range(30):
            bx, by = azar.randrange(480) * 2, azar.randrange(264) * 2
            bloque = px[by:by + 2, bx:bx + 2].reshape(-1, 3)
            assert (bloque == bloque[0]).all(), (sala['id'], bx, by)


def test_muebles_del_ancho_del_catalogo_con_alfa_binario(generado):
    dir_, esc = generado
    for mueble in esc['catalogo']['muebles']:
        im = Image.open(dir_ / mueble['arte'])
        assert im.mode == 'RGBA', mueble['id']
        assert im.width == mueble['ancho'], mueble['id']
        alfas = set(np.unique(np.array(im)[:, :, 3]).tolist())
        assert alfas <= {0, 255}, mueble['id']
        assert colores(im) <= 24, mueble['id']
        assert 255 in alfas, f"{mueble['id']} está vacío"


def test_objetos_y_herramientas_de_32x32(generado):
    dir_, esc = generado
    for pieza in esc['catalogo']['objetos'] + esc['catalogo']['herramientas']:
        im = Image.open(dir_ / pieza['arte'])
        assert im.size == (32, 32), pieza['id']
        assert set(np.unique(np.array(im)[:, :, 3]).tolist()) <= {0, 255}, pieza['id']
        assert colores(im) <= 16, pieza['id']


def test_no_escribe_fuera_de_la_carpeta_del_escenario(tmp_path):
    with open(UNIVERSIDAD, encoding='utf-8') as f:
        esc = json.load(f)
    esc['catalogo']['muebles'][0]['arte'] = '../../escapado.png'
    lugar = tmp_path / 'a' / 'b'
    lugar.mkdir(parents=True)
    (lugar / 'escenario.json').write_text(json.dumps(esc), encoding='utf-8')
    with pytest.raises(SystemExit, match='escapado'):
        au.generar(str(lugar / 'escenario.json'), factor=2, salas=['consultorio'])
    assert not (tmp_path / 'escapado.png').exists()


def test_una_pieza_sin_dibujo_es_error(tmp_path):
    with open(UNIVERSIDAD, encoding='utf-8') as f:
        esc = json.load(f)
    esc['catalogo']['muebles'].append(
        {'id': 'piano', 'nombre': 'Piano', 'arte': 'arte/muebles/piano.png', 'ancho': 80, 'alto': 30, 'colision': True})
    (tmp_path / 'escenario.json').write_text(json.dumps(esc), encoding='utf-8')
    with pytest.raises(SystemExit, match='piano'):
        au.generar(str(tmp_path / 'escenario.json'), factor=2)
