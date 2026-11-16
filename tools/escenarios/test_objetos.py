"""Contrato de los objetos v2 (bloque O1): tamaño, punto de apoyo, colores, cuadros, huella, animaciones y reflejos."""
import importlib
import os
import sys

import numpy as np
import pytest
from PIL import ImageOps

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import objetos_comun as oc  # noqa: E402
import objetos_pixel as op  # noqa: E402
import objetos_reflejo as orf  # noqa: E402

MODULOS = ['objetos_casa', 'objetos_comisaria', 'objetos_hospital', 'objetos_universidad', 'objetos_herramientas']
TODAS = [(m, ref) for m in MODULOS for ref in importlib.import_module(m).PIEZAS]


@pytest.mark.parametrize('modulo,ref', TODAS)
def test_tiras_bien_formadas(modulo, ref):
    p = oc.armar(modulo, ref)
    ficha = p['ficha']
    assert len(p['cuadros']) == ficha.get('cuadros', 1)
    w, h = p['cuadros'][0].size
    for c in p['cuadros']:
        assert c.size == (w, h)
        a = np.array(c)[:, :, 3]
        assert set(np.unique(a)) <= {0, 255}, 'alfa binario'
        assert a.any(), 'ningún cuadro vacío'
        assert a[-1].any(), 'la fila de abajo apoya: el punto de apoyo es el centro del borde inferior'
    tira = op.tira(p['cuadros'])
    assert tira.size == (w * len(p['cuadros']), h)


@pytest.mark.parametrize('modulo,ref', TODAS)
def test_colores_por_imagen(modulo, ref):
    p = oc.armar(modulo, ref)
    assert op.colores(op.tira(p['cuadros'])) <= op.MAX_COLORES


@pytest.mark.parametrize('modulo,ref', TODAS)
def test_huella_dentro_del_sprite(modulo, ref):
    p = oc.armar(modulo, ref)
    h = p['ficha']['huella']
    assert 0 < h['ancho'] <= p['ancho'] and 0 < h['fondo'] <= p['alto'] and 0 < h['alto'] <= p['alto']


@pytest.mark.parametrize('modulo,ref', TODAS)
def test_estado_final_existe(modulo, ref):
    """Cada animación cae dentro de la tira; las de un tiro tienen su último cuadro propio (movimiento reducido)."""
    p = oc.armar(modulo, ref)
    for nombre, a in p['ficha'].get('animaciones', {}).items():
        assert 0 <= a['de'] <= a['hasta'] < len(p['cuadros']), nombre
        assert a['fps'] > 0
        if not a['bucle']:
            assert a.get('sostener') or a.get('luego') in p['ficha']['animaciones'], nombre


@pytest.mark.parametrize('modulo,ref', TODAS)
def test_reflejo_solo_sobre_el_objeto(modulo, ref):
    p = oc.armar(modulo, ref)
    if not p['reflejo']:
        return
    for c, lados in zip(p['cuadros'], p['reflejo']):
        opaco = np.array(c)[:, :, 3] > 0
        for lado, m in lados.items():
            v = np.array(m)[:, :, 0]
            assert set(np.unique(v)) <= {0, 128, 255}, lado
            assert not (v[~opaco] > 0).any(), lado


SALA_VENTANA_IZQ = dict(id='prueba', encuadre='tres-paredes', estructura=dict(
    ancho=960, momento='dia', piezas=[dict(id='v', tipo='ventana', modelo='corrediza', muro='fondo', pos=100)]))
SALA_LAMPARA_APAGADA = dict(id='prueba', encuadre='tres-paredes', estructura=dict(
    ancho=960, momento='noche', piezas=[dict(id='l', tipo='lampara', modelo='pie', x=300, y=320, encendida=False)]))


def test_sin_fuente_sin_reflejo():
    tv = oc.armar('objetos_casa', 'televisor')
    assert orf.capa_reflejo(tv, 0, 600, 300, SALA_LAMPARA_APAGADA, 'noche') is None


def _centro_de_masa(capa):
    v = np.array(capa).sum(2)
    ys, xs = np.nonzero(v)
    return xs.mean(), capa.width / 2


def test_reflejo_tras_espejo():
    """La ventana está a la izquierda: el brillo cae a la izquierda del objeto, esté espejado o no."""
    porta = oc.armar('objetos_casa', 'portarretrato')
    for espejo in (False, True):
        capa = orf.capa_reflejo(porta, 0, 700, 300, SALA_VENTANA_IZQ, 'dia', espejo=espejo)
        assert capa is not None
        x, medio = _centro_de_masa(capa)
        assert x < medio, f'espejo={espejo}'


def test_reflejo_cambia_dia_noche():
    sala = dict(id='prueba', encuadre='tres-paredes', estructura=dict(ancho=960, momento='dia', piezas=[
        dict(id='v', tipo='ventana', modelo='corrediza', muro='fondo', pos=100),
        dict(id='l', tipo='lampara', modelo='pie', x=760, y=320)]))
    tv = oc.armar('objetos_casa', 'televisor')
    dia = orf.capa_reflejo(tv, 0, 650, 300, sala, 'dia')
    noche = orf.capa_reflejo(tv, 0, 650, 300, sala, 'noche')
    assert dia is not None and noche is not None
    assert _centro_de_masa(dia)[0] < _centro_de_masa(noche)[0], 'de día la ventana (izquierda), de noche la lámpara (derecha)'
    assert np.array(dia)[..., 2].sum() != np.array(noche)[..., 2].sum(), 'cambia el tono'


def test_destello():
    cuadros = oc.destello()
    assert len(cuadros) == 8 and all(c.size == (9, 9) for c in cuadros)
    assert not np.array(cuadros[-1])[:, :, 3].any(), 'el último es la pausa'


def test_catalogo_en_formato_de_p1():
    """Brillo en los grises de P1, misma tira que el dibujo; emisivo y resplandor bien formados; lo versionado al día."""
    import objetos_catalogo as cat
    archivos, secciones = cat.generar()
    imagenes = dict(archivos)
    assert set(secciones) == {'muebles', 'objetos', 'herramientas'}
    assert set(secciones['herramientas']) == {'PAP', 'SPIKES', 'RISK_METER', 'SAFETY_ROUTE', 'REFLECTION_JOURNAL'}
    for seccion in secciones.values():
        for clave, e in seccion.items():
            tira = imagenes[e['ruta']]
            assert tira.size == (e['ancho'] * e['cuadros'], e['alto']), clave
            for k in ('brillo', 'brilloIzquierda', 'brilloDerecha', 'emisivo'):
                if k in e:
                    assert imagenes[e[k]].size == tira.size, (clave, k)
            for k in ('brillo', 'brilloIzquierda', 'brilloDerecha'):
                if k in e:
                    v = np.array(imagenes[e[k]])
                    assert set(np.unique(v[..., 0])) <= {0, 85, 170, 255}, (clave, k)
            if 'resplandor' in e:
                r = e['resplandor']
                assert imagenes[r['ruta']].size == (r['ancho'] * 3, r['alto'])
                assert len(r['parpadeo']) == e['cuadros'] and max(r['parpadeo']) <= 3
    assert cat.verificar() == [], 'correr python tools/escenarios/objetos_catalogo.py'


@pytest.mark.parametrize('modulo,ref', TODAS)
def test_silueta_limpia(modulo, ref):
    """La sombra ahora sale del alfa: la silueta es una sola pieza (o piezas grandes), sin píxeles sueltos en el borde."""
    from scipy import ndimage
    p = oc.armar(modulo, ref)
    siluetas = p['silueta'] or [np.array(c)[:, :, 3] > 0 for c in p['cuadros']]
    for k, s in enumerate(siluetas):
        etiquetas, n = ndimage.label(s, structure=np.ones((3, 3)))
        tamanos = ndimage.sum(s, etiquetas, range(1, n + 1)) if n else []
        assert all(t > oc.EFECTO_MAXIMO for t in tamanos), f'cuadro {k}: piezas sueltas de {sorted(tamanos)} px'
        vecinos = ndimage.convolve(s.astype(int), np.ones((3, 3), int), mode='constant') - s
        assert not (s & (vecinos <= 1)).any(), f'cuadro {k}: un píxel colgado del borde'


def test_espejo_no_cambia_colores():
    p = oc.armar('objetos_casa', 'sillon-casa')
    assert op.colores(ImageOps.mirror(p['cuadros'][0])) == op.colores(p['cuadros'][0])
