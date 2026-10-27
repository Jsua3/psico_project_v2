"""Pruebas de arte_comun.py: lo compartido por los lugares dibujados por código."""
import filecmp
import json
import os
import shutil
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import arte_comun as ac  # noqa: E402
import arte_universidad as au  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UNIVERSIDAD = os.path.join(RAIZ, 'biblioteca', 'escenarios', 'universidad')


def test_generar_lugar_sobre_la_universidad_produce_png_identicos_a_los_de_head(tmp_path):
    """Regresión del traslado: el arte de la universidad no cambia ni un byte."""
    shutil.copy(os.path.join(UNIVERSIDAD, 'escenario.json'), tmp_path / 'escenario.json')
    hechos = ac.generar_lugar(str(tmp_path / 'escenario.json'), au.SALAS, au.MUEBLES, au.ICONOS, factor=2,
                              destinos=au.DESTINO_PUERTA)
    assert len(hechos) == 48
    distintos = [r for r in hechos
                 if not filecmp.cmp(tmp_path / r, os.path.join(UNIVERSIDAD, *r.split('/')), shallow=False)]
    assert distintos == []


def _sala(encuadre):
    return {'id': 'x', 'encuadre': encuadre, 'puertas': []}


PALETA = dict(pared=(100, 110, 120), lado=(80, 90, 100), canto=(150, 150, 150), zocalo=(40, 40, 40),
              piso='baldosa', pisoA=(130, 120, 110), pisoB=(120, 110, 100), junta=(90, 85, 80))


@pytest.mark.parametrize('encuadre, izquierda, derecha', [
    ('tres-paredes', True, True),
    ('dos-paredes-izquierda', True, False),
    ('dos-paredes-derecha', False, True),
    ('una-pared', False, False),
])
def test_fondo_sala_pinta_o_deja_vacia_la_banda_lateral_segun_el_encuadre(encuadre, izquierda, derecha):
    im = ac.fondo_sala(_sala(encuadre), PALETA)
    assert im.size == (960, 528)
    px = np.array(im)
    vacio = np.array(ac.FONDO_VACIO)
    # Por fuera de una pared lateral no hay sala (color vacío); sin pared, el piso sigue hasta el borde.
    assert (px[400, 8] == vacio).all() == izquierda
    assert (px[400, 951] == vacio).all() == derecha
    assert (px[400, 480] != vacio).any()


def test_fondo_sala_llama_a_dibujar_propio_con_el_lienzo():
    marcas = []

    def propio(d, sala, p):
        marcas.append(sala['id'])
        d.rectangle([400, 100, 560, 200], fill=(255, 0, 255))

    im = ac.fondo_sala(_sala('una-pared'), PALETA, dibujar_propio=propio)
    assert marcas == ['x']
    assert tuple(np.array(im)[150, 480]) == (255, 0, 255)


def test_generar_lugar_exige_un_dibujo_por_pieza(tmp_path):
    with open(os.path.join(UNIVERSIDAD, 'escenario.json'), encoding='utf-8') as f:
        esc = json.load(f)
    esc['salas'] = esc['salas'][:1]
    esc['salas'][0]['id'] = 'azotea'
    (tmp_path / 'escenario.json').write_text(json.dumps(esc), encoding='utf-8')
    with pytest.raises(SystemExit, match='azotea'):
        ac.generar_lugar(str(tmp_path / 'escenario.json'), au.SALAS, au.MUEBLES, au.ICONOS)
