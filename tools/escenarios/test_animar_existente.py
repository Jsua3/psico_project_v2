import os
import sys

import numpy as np
import pytest
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from animar_existente import EFECTOS, animar  # noqa: E402


def _sprite(w=28, h=24, aire=3):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([2, aire, w - 3, h - 1], fill=(120, 80, 200, 255))
    d.rectangle([5, aire + 3, w - 6, h - 4], fill=(230, 220, 90, 255))
    d.rectangle([8, aire + 6, 12, aire + 9], fill=(40, 40, 60, 255))
    return im


@pytest.mark.parametrize('efecto', EFECTOS)
def test_hoja_mide_cuadros_por_ancho(efecto):
    hoja = animar(_sprite(), efecto, 3)
    assert hoja.size == (28 * 3, 24)


@pytest.mark.parametrize('efecto', EFECTOS)
def test_alfa_binario_y_misma_silueta_salvo_flotar(efecto):
    base = _sprite()
    hoja = np.array(animar(base, efecto, 3))
    assert set(np.unique(hoja[:, :, 3])) <= {0, 255}
    if efecto != 'flotar':
        m0 = np.array(base)[:, :, 3] >= 128
        for i in range(3):
            assert np.array_equal(hoja[:, i * 28:(i + 1) * 28, 3] >= 128, m0)


@pytest.mark.parametrize('efecto', EFECTOS)
def test_los_cuadros_cambian_entre_si(efecto):
    hoja = np.array(animar(_sprite(), efecto, 3))
    c = [hoja[:, i * 28:(i + 1) * 28] for i in range(3)]
    assert not np.array_equal(c[0], c[1]) and not np.array_equal(c[1], c[2])


def test_respeta_el_tope_de_colores():
    hoja = np.array(animar(_sprite(), 'brillo', 4, colores=6))
    colores = {tuple(p[:3]) for p in hoja[hoja[:, :, 3] > 0]}
    assert len(colores) <= 6


def test_flotar_sin_aire_arriba_se_niega():
    with pytest.raises(SystemExit):
        animar(_sprite(aire=0), 'flotar', 3)


def test_cuadros_fuera_de_rango_se_niega():
    with pytest.raises(SystemExit):
        animar(_sprite(), 'brillo', 5)
