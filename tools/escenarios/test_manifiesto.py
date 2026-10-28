"""Pruebas de manifiesto.py: el manifiesto de arte de la biblioteca lista todo PNG del juego con sus medidas."""
import json
import os
import sys

import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import manifiesto  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BIBLIOTECA = os.path.join(RAIZ, 'biblioteca')
ARCHIVO = os.path.join(BIBLIOTECA, 'manifiesto.json')


def _png(ruta, ancho, alto, color=(200, 60, 60, 255)):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    Image.new('RGBA', (ancho, alto), color).save(ruta)


def _json(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(datos, f, ensure_ascii=False)


def _biblioteca_minima(tmp_path):
    """Una biblioteca con un modelo animado, un existente, un lugar y los archivos que NO son arte del juego."""
    b = tmp_path / 'biblioteca'
    _json(b / 'modelos' / 'catalogo.json', {'esquema': 1, 'modelos': [
        {'id': 'taza', 'arte': 'arte/taza.png', 'animacionCerca': {'hoja': 'arte/taza-cerca.png', 'cuadros': 3, 'fps': 6}},
    ]})
    _png(str(b / 'modelos' / 'arte' / 'taza.png'), 10, 12)
    _png(str(b / 'modelos' / 'arte' / 'taza-cerca.png'), 30, 12)
    _json(b / 'modelos' / 'existentes' / 'catalogo.json', {'esquema': 1, 'sprites': [
        {'id': 'pap', 'origen': 'frontend/src/assets/game/objects/tool_pap.png',
         'animacionCerca': {'hoja': 'arte/tool_pap-cerca.png', 'cuadros': 2, 'fps': 8}},
    ]})
    _png(str(b / 'modelos' / 'existentes' / 'arte' / 'tool_pap-cerca.png'), 40, 20)
    _json(b / 'escenarios' / 'casa' / 'escenario.json', {'esquema': 2, 'catalogo': {
        'muebles': [{'id': 'mesa', 'arte': 'arte/muebles/mesa.png'}],
        'objetos': [{'id': 'folleto', 'arte': 'arte/objetos/folleto.png',
                     'animacionCerca': {'hoja': 'arte/objetos/folleto-cerca.png', 'cuadros': 4}}],
        'herramientas': [],
    }})
    _png(str(b / 'escenarios' / 'casa' / 'arte' / 'salas' / 'sala.png'), 960, 528)
    _png(str(b / 'escenarios' / 'casa' / 'arte' / 'muebles' / 'mesa.png'), 50, 30)
    _png(str(b / 'escenarios' / 'casa' / 'arte' / 'objetos' / 'folleto.png'), 16, 16)
    _png(str(b / 'escenarios' / 'casa' / 'arte' / 'objetos' / 'folleto-cerca.png'), 64, 16)
    # Lo que no es arte del juego: hojas de contacto, fixtures de pruebas y dependencias.
    _png(str(b / 'hoja-lugares.png'), 100, 100)
    _png(str(b / 'modelos' / 'hoja-contacto.png'), 100, 100)
    _png(str(b / 'escenarios' / 'casa' / 'hoja-contacto.png'), 100, 100)
    _png(str(b / 'scripts' / 'fixtures' / 'minimo' / 'arte' / 'salas' / 'x.png'), 960, 528)
    _png(str(b / 'node_modules' / 'paquete' / 'icono.png'), 8, 8)
    return b


def test_el_manifiesto_lista_todo_png_bajo_biblioteca_con_sus_medidas():
    sprites = manifiesto.cargar(ARCHIVO)['sprites']
    esperados = {}
    for carpeta, _, archivos in os.walk(BIBLIOTECA):
        relativa = os.path.relpath(carpeta, BIBLIOTECA).replace(os.sep, '/')
        if 'node_modules' in relativa.split('/') or relativa.startswith('scripts/fixtures'):
            continue
        for nombre in archivos:
            if nombre.endswith('.png') and not nombre.startswith('hoja-'):
                esperados[(relativa + '/' + nombre)] = os.path.join(carpeta, nombre)
    assert set(sprites) == set(esperados)
    for ruta, entrada in sprites.items():
        with Image.open(esperados[ruta]) as im:
            real = im.size
        cuadros = entrada.get('cuadros', 1)
        assert (entrada['ancho'] * cuadros, entrada['alto']) == real, ruta
        assert ('cuadros' in entrada) == ('fps' in entrada), ruta
        assert entrada['origen'] in {'modelo', 'lugar', 'existente'}


def test_cubre_los_30_modelos_los_10_existentes_y_el_arte_de_los_tres_lugares():
    sprites = manifiesto.cargar(ARCHIVO)['sprites']
    por_origen = {'modelo': 0, 'existente': 0, 'lugar': 0}
    for entrada in sprites.values():
        por_origen[entrada['origen']] += 1
    assert por_origen['modelo'] >= 60   # 30 modelos: el reposo y la hoja de cercanía de cada uno
    assert por_origen['existente'] >= 10  # las hojas de los 10 sprites existentes del juego
    assert por_origen['lugar'] >= 188
    for lugar in ('universidad', 'casa', 'comisaria'):
        assert any(r.startswith(f'escenarios/{lugar}/arte/salas/') for r in sprites)
        assert any(r.startswith(f'escenarios/{lugar}/arte/muebles/') for r in sprites)
    assert all(r.startswith(('escenarios/', 'modelos/')) for r in sprites)


def test_una_hoja_declara_sus_cuadros_y_su_ancho_es_el_de_un_cuadro():
    sprites = manifiesto.cargar(ARCHIVO)['sprites']
    hoja = sprites['escenarios/universidad/arte/objetos/folleto-rutas-cerca.png']
    reposo = sprites['escenarios/universidad/arte/objetos/folleto-rutas.png']
    assert hoja['cuadros'] == 3 and hoja['fps'] == 6
    assert hoja['ancho'] == reposo['ancho'] and hoja['alto'] == reposo['alto']
    assert 'cuadros' not in reposo and 'fps' not in reposo
    assert sprites['modelos/existentes/arte/tool_pap-cerca.png']['origen'] == 'existente'


def test_el_manifiesto_versionado_es_el_que_generaria_el_script():
    with open(ARCHIVO, 'rb') as f:
        versionado = f.read()
    assert versionado == manifiesto.serializar(manifiesto.generar(BIBLIOTECA)).encode('utf-8'), (
        'biblioteca/manifiesto.json está desactualizado o editado a mano: corre `python tools/escenarios/manifiesto.py`')
    assert b'\r' not in versionado and versionado.endswith(b'\n')


def test_genera_en_una_biblioteca_pequena_con_los_tres_origenes(tmp_path):
    b = _biblioteca_minima(tmp_path)
    datos = manifiesto.generar(str(b))
    assert datos['esquema'] == 1
    assert datos['sprites'] == {
        'escenarios/casa/arte/muebles/mesa.png': {'alto': 30, 'ancho': 50, 'origen': 'lugar'},
        'escenarios/casa/arte/objetos/folleto-cerca.png': {'alto': 16, 'ancho': 16, 'cuadros': 4, 'fps': 6, 'origen': 'lugar'},
        'escenarios/casa/arte/objetos/folleto.png': {'alto': 16, 'ancho': 16, 'origen': 'lugar'},
        'escenarios/casa/arte/salas/sala.png': {'alto': 528, 'ancho': 960, 'origen': 'lugar'},
        'modelos/arte/taza-cerca.png': {'alto': 12, 'ancho': 10, 'cuadros': 3, 'fps': 6, 'origen': 'modelo'},
        'modelos/arte/taza.png': {'alto': 12, 'ancho': 10, 'origen': 'modelo'},
        'modelos/existentes/arte/tool_pap-cerca.png': {'alto': 20, 'ancho': 20, 'cuadros': 2, 'fps': 8, 'origen': 'existente'},
    }


def test_no_lista_hojas_de_contacto_fixtures_ni_dependencias(tmp_path):
    b = _biblioteca_minima(tmp_path)
    claves = manifiesto.generar(str(b))['sprites']
    assert not [r for r in claves if 'hoja-' in r or 'fixtures' in r or 'node_modules' in r]


def test_es_determinista_ordenado_y_con_lf(tmp_path):
    b = _biblioteca_minima(tmp_path)
    primero = manifiesto.serializar(manifiesto.generar(str(b)))
    segundo = manifiesto.serializar(manifiesto.generar(str(b)))
    assert primero == segundo
    assert '\r' not in primero and primero.endswith('\n')
    claves = list(json.loads(primero)['sprites'])
    assert claves == sorted(claves)
    manifiesto.escribir(str(b))
    with open(b / 'manifiesto.json', 'rb') as f:
        assert f.read() == primero.encode('utf-8')


def test_una_hoja_cuyo_ancho_no_es_multiplo_del_reposo_es_error(tmp_path):
    b = _biblioteca_minima(tmp_path)
    _png(str(b / 'modelos' / 'arte' / 'taza-cerca.png'), 31, 12)  # el reposo mide 10: 3 cuadros serían 30
    with pytest.raises(SystemExit, match=r'taza-cerca\.png.*30'):
        manifiesto.generar(str(b))


def test_una_hoja_de_otro_alto_que_el_reposo_es_error(tmp_path):
    b = _biblioteca_minima(tmp_path)
    _png(str(b / 'modelos' / 'arte' / 'taza-cerca.png'), 30, 14)
    with pytest.raises(SystemExit, match=r'taza-cerca\.png.*alto'):
        manifiesto.generar(str(b))


def test_una_hoja_de_existente_se_mide_contra_su_reposo_en_el_juego(tmp_path):
    b = _biblioteca_minima(tmp_path)
    _png(str(tmp_path / 'frontend' / 'src' / 'assets' / 'game' / 'objects' / 'tool_pap.png'), 25, 20)
    with pytest.raises(SystemExit, match=r'tool_pap-cerca\.png.*50'):  # 2 cuadros de 25 serían 50, no 40
        manifiesto.generar(str(b))


def test_una_hoja_cerca_sin_declarar_sus_cuadros_es_error(tmp_path):
    b = _biblioteca_minima(tmp_path)
    _png(str(b / 'escenarios' / 'casa' / 'arte' / 'objetos' / 'huerfana-cerca.png'), 32, 16)
    with pytest.raises(SystemExit, match=r'huerfana-cerca\.png.*animacionCerca'):
        manifiesto.generar(str(b))


def test_una_hoja_declarada_que_no_existe_es_error(tmp_path):
    b = _biblioteca_minima(tmp_path)
    os.remove(b / 'modelos' / 'arte' / 'taza-cerca.png')
    with pytest.raises(SystemExit, match=r'taza-cerca\.png.*no existe'):
        manifiesto.generar(str(b))


def test_un_png_que_no_es_png_es_error(tmp_path):
    b = _biblioteca_minima(tmp_path)
    (b / 'escenarios' / 'casa' / 'arte' / 'muebles' / 'roto.png').write_bytes(b'no soy una imagen')
    with pytest.raises(SystemExit, match=r'roto\.png'):
        manifiesto.generar(str(b))


def test_verificar_ve_un_manifiesto_editado_a_mano_o_ausente(tmp_path):
    b = _biblioteca_minima(tmp_path)
    assert manifiesto.verificar(str(b)) is False  # todavía no hay archivo
    manifiesto.escribir(str(b))
    assert manifiesto.verificar(str(b)) is True
    datos = json.loads((b / 'manifiesto.json').read_text(encoding='utf-8'))
    datos['sprites']['escenarios/casa/arte/muebles/mesa.png']['ancho'] = 51
    (b / 'manifiesto.json').write_text(json.dumps(datos, indent=2), encoding='utf-8')
    assert manifiesto.verificar(str(b)) is False
