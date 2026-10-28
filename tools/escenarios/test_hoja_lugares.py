"""Pruebas de hoja_lugares.py: una imagen con la primera sala de cada lugar del índice y sus cifras."""
import json
import os
import shutil
import sys

import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hoja_lugares as hl  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FIXTURE = os.path.join(RAIZ, 'biblioteca', 'scripts', 'fixtures', 'minimo')
KIT = os.path.join(RAIZ, 'biblioteca', 'scripts', 'fixtures', 'kit-minimo')


@pytest.fixture
def escenarios(tmp_path):
    """Dos copias del lugar mínimo: una con arte provisional y otra con arte definitivo."""
    lugares = []
    for id_, provisional in (('provisional', True), ('definitivo', False)):
        shutil.copytree(FIXTURE, tmp_path / id_)
        ruta = tmp_path / id_ / 'escenario.json'
        esc = json.loads(ruta.read_text(encoding='utf-8'))
        esc['id'] = id_
        esc['arteProvisional'] = provisional
        ruta.write_text(json.dumps(esc), encoding='utf-8')
        lugares.append({'id': id_, 'nombre': id_.title(), 'salas': 8, 'completo': True, 'arteProvisional': provisional,
                        'temas': ['prueba'], 'hitos': 2})
    (tmp_path / 'indice.json').write_text(json.dumps({'esquema': 1, 'lugares': lugares}), encoding='utf-8')
    return tmp_path


def test_la_hoja_general_marca_arte_provisional_solo_en_los_lugares_que_lo_tienen(escenarios, tmp_path):
    salida = tmp_path / 'hoja.png'
    info = hl.hoja_lugares(str(escenarios), str(salida), kit_dir=KIT)
    marcas = {l['id']: l['marca'] for l in info['lugares']}
    assert marcas == {'provisional': 'arte provisional', 'definitivo': None}
    im = Image.open(salida)
    assert im.width == hl.ancho_hoja(2)
    assert im.height == hl.alto_hoja(1)


def test_la_hoja_general_lleva_las_cifras_de_cada_lugar(escenarios, tmp_path):
    info = hl.hoja_lugares(str(escenarios), str(tmp_path / 'hoja.png'), kit_dir=KIT)
    cifras = info['lugares'][0]['cifras']
    assert cifras == {'salas': 8, 'muebles': 1, 'objetos': 1, 'herramientas': 1, 'personajes': 1, 'hitos': 2,
                      'riesgo': 'MODERATE'}


def test_un_indice_que_nombra_un_lugar_inexistente_detiene_la_hoja(escenarios, tmp_path):
    indice = json.loads((escenarios / 'indice.json').read_text(encoding='utf-8'))
    indice['lugares'].append({'id': 'hospital', 'nombre': 'Hospital', 'salas': 8, 'completo': True,
                              'arteProvisional': True, 'temas': [], 'hitos': 0})
    (escenarios / 'indice.json').write_text(json.dumps(indice), encoding='utf-8')
    with pytest.raises(SystemExit, match='hospital'):
        hl.hoja_lugares(str(escenarios), str(tmp_path / 'hoja.png'), kit_dir=KIT)
