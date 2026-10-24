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


def test_un_dibujo_con_pocos_colores_los_conserva_exactos(tmp_path, salida):
    """Arte dibujado por código: sin suavizado al achicar, ni un color nuevo ni uno perdido."""
    dibujo = Image.new('RGB', (960, 528), (116, 96, 110))
    dibujo.paste((150, 178, 196), (271, 103, 421, 179))   # una ventana pequeña y de otro color
    dibujo.paste((90, 64, 48), (0, 230, 960, 528))
    ruta = tmp_path / 'dibujo.png'
    dibujo.save(ruta)
    pixelar_sala(str(ruta), salida, 2, COLORES, remuestreo='cercano')
    assert sorted(c for _, c in Image.open(salida).getcolors()) == sorted([(116, 96, 110), (150, 178, 196), (90, 64, 48)])


def test_al_recortar_colores_se_funden_los_parecidos_y_no_los_pequenos(tmp_path, salida):
    """Con pocos colores de sobra se juntan tonos casi iguales; un detalle pequeño y distinto sigue."""
    dibujo = Image.new('RGB', (960, 528), (100, 100, 100))
    for k in range(40):  # 40 franjas grises casi iguales de a pares
        gris = 100 + (k // 2) * 6 + (k % 2)
        dibujo.paste((gris, gris, gris), (0, 228 + k * 6, 960, 234 + k * 6))
    dibujo.paste((40, 160, 220), (300, 100, 304, 104))  # ventana diminuta, azul
    ruta = tmp_path / 'dibujo.png'
    dibujo.save(ruta)
    pixelar_sala(str(ruta), salida, 2, COLORES, remuestreo='cercano')
    colores_finales = [c for _, c in Image.open(salida).getcolors()]
    assert len(colores_finales) <= COLORES
    assert (40, 160, 220) in colores_finales


def test_lo_transparente_no_conserva_su_color_escondido(tmp_path, salida):
    """Un PNG con transparencia: los píxeles invisibles no deben aparecer con su color."""
    im = Image.new('RGBA', (960, 528), (90, 90, 96, 255))
    im.paste((255, 0, 0, 0), (0, 0, 480, 528))  # rojo totalmente transparente
    ruta = tmp_path / 'transparente.png'
    im.save(ruta)
    pixelar_sala(str(ruta), salida, 2, COLORES, remuestreo='cercano')
    assert (255, 0, 0) not in [c for _, c in Image.open(salida).getcolors()]


def test_el_comando_con_un_factor_que_no_es_numero_explica_el_error(tmp_path, salida):
    import subprocess
    ruta = imagen_sintetica(400, 220, tmp_path / 'f.png')
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pixelar_sala.py')
    r = subprocess.run([sys.executable, script, str(ruta), salida, 'dos'], capture_output=True, text=True)
    assert r.returncode != 0
    assert 'Traceback' not in r.stderr
    assert 'factor' in (r.stderr + r.stdout)


def test_un_factor_que_no_divide_el_lienzo_es_error(tmp_path, salida):
    with pytest.raises(ValueError):
        pixelar_sala(imagen_sintetica(1600, 900, tmp_path / 'f.png'), salida, 7, COLORES)
