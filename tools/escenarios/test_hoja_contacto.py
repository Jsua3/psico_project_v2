"""Pruebas de hoja_contacto.py: una celda por sala y muebles en su punto de apoyo."""
import json
import os
import shutil
import sys

import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hoja_contacto as hc  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FIXTURE = os.path.join(RAIZ, 'biblioteca', 'scripts', 'fixtures', 'minimo')
KIT = os.path.join(RAIZ, 'biblioteca', 'scripts', 'fixtures', 'kit-minimo')


@pytest.fixture
def escenario(tmp_path):
    destino = tmp_path / 'minimo'
    shutil.copytree(FIXTURE, destino)
    return destino


def test_una_celda_por_sala(escenario, tmp_path):
    salida = tmp_path / 'hoja.png'
    info = hc.hoja_contacto(str(escenario / 'escenario.json'), str(salida), kit_dir=KIT)
    assert info['celdas'] == 8
    filas = 4  # 8 salas en 2 columnas
    assert Image.open(salida).size == (hc.ancho_hoja(2), hc.alto_hoja(filas))


def test_solo_las_salas_pedidas(escenario, tmp_path):
    salida = tmp_path / 'hoja.png'
    info = hc.hoja_contacto(str(escenario / 'escenario.json'), str(salida), kit_dir=KIT, salas=['sala-3'])
    assert info['celdas'] == 1
    assert Image.open(salida).size == (hc.ancho_hoja(1), hc.alto_hoja(1))


def test_el_mueble_se_apoya_en_su_punto(escenario, tmp_path):
    Image.new('RGB', (960, 528), (255, 255, 255)).save(escenario / 'arte' / 'salas' / 'sala-1.png')
    Image.new('RGBA', (20, 10), (255, 0, 0, 255)).save(escenario / 'arte' / 'muebles' / 'mesa.png')
    datos = json.loads((escenario / 'escenario.json').read_text(encoding='utf-8'))
    sala = datos['salas'][0]
    sala['objetos'] = []
    sala['personajes'] = []
    mueble = sala['muebles'][0]
    (escenario / 'escenario.json').write_text(json.dumps(datos), encoding='utf-8')

    salida = tmp_path / 'hoja.png'
    hc.hoja_contacto(str(escenario / 'escenario.json'), str(salida), kit_dir=KIT, salas=['sala-1'])
    hoja = Image.open(salida).convert('RGB')
    x0, y0 = hc.origen_celda(0)
    # Justo encima del punto de apoyo: rojo. Justo debajo: el fondo (o la sombra), nunca rojo.
    assert hoja.getpixel((x0 + mueble['x'], y0 + mueble['y'] - 2)) == (255, 0, 0)
    assert hoja.getpixel((x0 + mueble['x'], y0 + mueble['y'] + 2)) != (255, 0, 0)
    # A 11 px del centro ya no hay mueble (mide 20 de ancho).
    assert hoja.getpixel((x0 + mueble['x'] + 11, y0 + mueble['y'] - 2)) != (255, 0, 0)
