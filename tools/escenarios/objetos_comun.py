"""Lo común a todos los objetos v2 (bloque O1): armar la pieza terminada y el destello de «falta por revisar».

    pieza = armar('objetos_casa', 'televisor')
    pieza['cuadros']               # [Image RGBA], todos del mismo tamaño; apoyo = centro del borde inferior
    pieza['reflejo']               # [{lado: Image}] por cuadro (blanco = fuerte, gris = suave) o None
    pieza['emisivo']               # [Image] por cuadro (blanco = emite luz propia) o None
"""
import functools
import importlib
import os
import sys

import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import objetos_pixel as op  # noqa: E402


def _mascara_img(m):
    arr = np.zeros(m.shape + (4,), np.uint8)
    arr[m] = (255, 255, 255, 255)
    return Image.fromarray(arr, 'RGBA')


@functools.lru_cache(maxsize=None)
def armar(modulo, ref):
    """La pieza `ref` del módulo `objetos_<lugar>` terminada y recortada con una sola caja para todos sus cuadros."""
    ficha = importlib.import_module(modulo).PIEZAS[ref]
    crudos = [ficha['dibujar'](n) for n in range(ficha.get('cuadros', 1))]
    imagenes = [L.imagen() for L, _, _ in crudos]
    cajas = [im.getbbox() for im in imagenes]
    caja = (min(b[0] for b in cajas), min(b[1] for b in cajas), max(b[2] for b in cajas), max(b[3] for b in cajas))
    cuadros = [im.crop(caja) for im in imagenes]
    tira = op.tira(cuadros)
    if op.colores(tira) > op.MAX_COLORES:                    # funde los más parecidos (la regla de P1) en toda la tira
        import piezas_geo
        arr = np.array(tira)
        arr = piezas_geo.limitar_colores(arr, arr[:, :, 3] > 0, op.MAX_COLORES)
        tira = Image.fromarray(arr, 'RGBA')
        w = cuadros[0].width
        cuadros = [tira.crop((k * w, 0, (k + 1) * w, tira.height)) for k in range(len(cuadros))]
    reflejo, emisivo = [], []
    hay_reflejo = hay_emisivo = False
    for L, refl, em in crudos:
        dentro = L.opaco()
        lados = {}
        for lado in op.LADOS:
            r = refl.get(lado) if refl else None
            m = r.m.copy() if r is not None else np.zeros((L.h, L.w), np.uint8)
            m[~dentro] = 0
            hay_reflejo |= bool(m.any())
            arr = np.zeros((L.h, L.w, 4), np.uint8)
            arr[m == 2] = op.FUERTE
            arr[m == 1] = op.SUAVE
            lados[lado] = Image.fromarray(arr, 'RGBA').crop(caja)
        reflejo.append(lados)
        e = em if em is not None else np.zeros((L.h, L.w), bool)
        hay_emisivo |= bool(e.any())
        emisivo.append(_mascara_img(e & dentro).crop(caja))
    w, h = cuadros[0].size
    return dict(ref=ref, modulo=modulo, cuadros=cuadros, ancho=w, alto=h, reflejo=reflejo if hay_reflejo else None,
                emisivo=emisivo if hay_emisivo else None, ficha=ficha)


def tira_reflejo(pieza):
    """Rejilla de máscaras de reflejo: columnas = cuadros, filas = izquierda, frente, derecha."""
    if not pieza['reflejo']:
        return None
    return op.rejilla([op.tira([c[lado] for c in pieza['reflejo']]) for lado in op.LADOS])


def tira_emisivo(pieza):
    return op.tira(pieza['emisivo']) if pieza['emisivo'] else None


# ── destello: lo que falta por revisar ─────────────────────────────────────────

DESTELLO_TINTA = {'w': (255, 250, 228), 'y': (255, 222, 132), 'o': (226, 168, 76)}
DESTELLO = [
    ['.........', '.........', '.........', '.........', '....w....', '.........', '.........', '.........', '.........'],
    ['.........', '.........', '.........', '....y....', '...ywy...', '....y....', '.........', '.........', '.........'],
    ['.........', '....o....', '....y....', '...yyy...', '.oyywyyo.', '...yyy...', '....y....', '....o....', '.........'],
    ['....o....', '....y....', '..o.y.o..', '...yyy...', 'oyyywyyyo', '...yyy...', '..o.y.o..', '....y....', '....o....'],
    ['.........', '....o....', '....y....', '...ywy...', '.oywwwyo.', '...ywy...', '....y....', '....o....', '.........'],
    ['.........', '.........', '.........', '....y....', '...ywy...', '....y....', '.........', '.........', '.........'],
    ['.........', '.........', '.........', '.........', '....y....', '.........', '.........', '.........', '.........'],
    ['.........'] * 9,
]


def destello():
    """Tira de 8 cuadros de 9 × 9: una chispa que nace, se abre en cruz y se apaga (el 7 vacío: pausa)."""
    cuadros = []
    for patron in DESTELLO:
        im = Image.new('RGBA', (9, 9), (0, 0, 0, 0))
        for y, fila in enumerate(patron):
            for x, ch in enumerate(fila):
                if ch != '.':
                    im.putpixel((x, y), DESTELLO_TINTA[ch] + (255,))
        cuadros.append(im)
    return cuadros
