"""Pruebas de marcadores.py: marcadores dentro del escenario y zonas iguales a las del validador."""
import json
import os
import shutil
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import marcadores  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FIXTURE = os.path.join(RAIZ, 'biblioteca', 'scripts', 'fixtures', 'minimo')
GEOMETRIA = os.path.join(RAIZ, 'biblioteca', 'scripts', 'geometria.mjs')


def test_crea_un_marcador_por_cada_arte_que_falta(tmp_path):
    destino = tmp_path / 'minimo'
    shutil.copytree(FIXTURE, destino)
    shutil.rmtree(destino / 'arte')
    hechos = marcadores.crear_marcadores(str(destino / 'escenario.json'))
    assert len(hechos) == 11
    assert all((destino / r).exists() for r in hechos)


def test_no_escribe_fuera_de_la_carpeta_del_escenario(tmp_path):
    destino = tmp_path / 'lugar'
    shutil.copytree(FIXTURE, destino)
    datos = json.loads((destino / 'escenario.json').read_text(encoding='utf-8'))
    datos['salas'][0]['fondo'] = '../escapado.png'
    (destino / 'escenario.json').write_text(json.dumps(datos), encoding='utf-8')
    with pytest.raises(SystemExit, match='escapado'):
        marcadores.crear_marcadores(str(destino / 'escenario.json'))
    assert not (tmp_path / 'escapado.png').exists()


def test_las_zonas_son_las_del_validador():
    url = 'file:///' + GEOMETRIA.replace(os.sep, '/')
    codigo = (f"import('{url}').then(g => console.log(JSON.stringify(Object.fromEntries("
              "g.ENCUADRES.map(e => { const z = g.zonaCaminable(e); return [e, [z.x, z.y, z.ancho, z.alto]]; })))))")
    salida = subprocess.run(['node', '-e', codigo], capture_output=True, text=True, check=True).stdout
    assert {k: tuple(v) for k, v in json.loads(salida).items()} == marcadores.ZONAS
