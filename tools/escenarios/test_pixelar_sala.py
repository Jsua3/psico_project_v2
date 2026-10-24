"""Pruebas de pixelar_sala.py: tamaño, colores y bloques duros."""
import os
import random
import sys

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixelar_sala import pixelar_sala  # noqa: E402

FACTOR = 2
COLORES = 32


def imagen_sintetica(ancho, alto, ruta):
    """Degradado con ruido: cientos de miles de colores, como una foto o una IA."""
    rng = np.random.default_rng(7)
    yy, xx = np.mgrid[0:alto, 0:ancho]
    base = np.stack([xx * 255 / ancho, yy * 255 / alto, (xx + yy) * 127 / (ancho + alto)], axis=-1)
    ruido = rng.integers(-40, 40, size=base.shape)
    Image.fromarray(np.clip(base + ruido, 0, 255).astype(np.uint8), 'RGB').save(ruta)
    return ruta


@pytest.fixture
def salida(tmp_path):
    return str(tmp_path / 'sala.png')


def test_salida_mide_960x528(tmp_path, salida):
    pixelar_sala(imagen_sintetica(1600, 900, tmp_path / 'f.png'), salida, FACTOR, COLORES)
    im = Image.open(salida)
    assert im.size == (960, 528)
    assert im.mode == 'RGB'


def test_respeta_maximo_de_colores(tmp_path, salida):
    pixelar_sala(imagen_sintetica(1600, 900, tmp_path / 'f.png'), salida, FACTOR, COLORES)
    assert len(Image.open(salida).getcolors(maxcolors=100000)) <= COLORES


def test_bloques_de_factor_px(tmp_path, salida):
    factor = 4
    pixelar_sala(imagen_sintetica(1600, 900, tmp_path / 'f.png'), salida, factor, COLORES)
    pixeles = np.array(Image.open(salida))
    azar = random.Random(1234)
    for _ in range(50):
        bx = azar.randrange(960 // factor) * factor
        by = azar.randrange(528 // factor) * factor
        bloque = pixeles[by:by + factor, bx:bx + factor].reshape(-1, 3)
        assert (bloque == bloque[0]).all(), f'bloque en ({bx}, {by}) con más de un color'


def test_imagen_vertical_se_recorta_sin_deformar(tmp_path, salida):
    pixelar_sala(imagen_sintetica(900, 1600, tmp_path / 'f.png'), salida, FACTOR, COLORES)
    assert Image.open(salida).size == (960, 528)


def test_un_factor_que_no_divide_el_lienzo_es_error(tmp_path, salida):
    with pytest.raises(ValueError):
        pixelar_sala(imagen_sintetica(1600, 900, tmp_path / 'f.png'), salida, 7, COLORES)
