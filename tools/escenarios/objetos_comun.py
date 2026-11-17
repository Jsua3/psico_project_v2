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
    reflejo, emisivo, material = [], [], []
    hay_reflejo = hay_emisivo = False
    for L, refl, em in crudos:
        gris = np.zeros((L.h, L.w), np.uint8)               # el gris de brillo de P1 según el material de cada píxel
        for k, nombre in enumerate(L.nombres):
            gris[L.mat == k] = gris_de_material(nombre)
        gris[L.mat == -2] = 255                              # lo pintado directo bajo vidrio o en pantalla
        material.append(gris[caja[1]:caja[3], caja[0]:caja[2]])
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
    siluetas = [silueta(c) for c in cuadros]
    distinta = any(not np.array_equal(s, np.array(c)[:, :, 3] > 0) for s, c in zip(siluetas, cuadros))
    return dict(ref=ref, modulo=modulo, cuadros=cuadros, ancho=w, alto=h, reflejo=reflejo if hay_reflejo else None,
                emisivo=emisivo if hay_emisivo else None, material=material, ficha=ficha,
                silueta=siluetas if distinta else None)


EFECTO_MAXIMO = 14          # px: lo que flota suelto y es así de chico es un efecto (vapor, rayas del timbre), no cuerpo


def silueta(cuadro):
    """Lo que proyecta sombra: el alfa del dibujo sin los efectos sueltos (componentes chicos separados del cuerpo)."""
    from scipy import ndimage
    opaco = np.array(cuadro)[:, :, 3] > 0
    etiquetas, n = ndimage.label(opaco, structure=np.ones((3, 3)))
    if n <= 1:
        return opaco
    tamanos = ndimage.sum(opaco, etiquetas, range(1, n + 1))
    mayor = int(np.argmax(tamanos)) + 1
    queda = np.zeros_like(opaco)
    for k, t in enumerate(tamanos, start=1):
        if k == mayor or t > EFECTO_MAXIMO:
            queda |= etiquetas == k
    return queda


def tira_silueta(pieza):
    """Formato para la sombra por alfa de P1: blanco donde el objeto proyecta sombra. None si es igual al alfa."""
    if not pieza.get('silueta'):
        return None
    return op.tira([_mascara_img(s) for s in pieza['silueta']])


# Formato de brillo de P1: gris por material (255 vidrio y pantalla, 170 metal, 85 barniz).
GRIS = {'vidrio': 255, 'pantalla': 255, 'agua': 255, 'cromo': 170, 'metal': 170, 'acero': 170, 'laton': 170,
        'plastico-negro': 170, 'plastico-gris': 170, 'plastico-crema': 170, 'blanco-clinico': 170}


def gris_de_material(nombre):
    return GRIS.get(nombre, 85)


def tira_brillo(pieza, lado='frente'):
    """Tira en el formato de P1 para un lado: el gris del material donde mi máscara es fuerte, y un escalón menos
    (mínimo 85) donde es suave. None si el objeto no brilla de ese lado."""
    if not pieza['reflejo']:
        return None
    cuadros = []
    for lados, gris in zip(pieza['reflejo'], pieza['material']):
        m = np.array(lados[lado])[:, :, 0]
        g = np.where(m == 255, gris, np.where(m == 128, np.maximum(85, gris.astype(int) - 85), 0)).astype(np.uint8)
        g[(m > 0) & (g == 0)] = 85
        arr = np.zeros(m.shape + (4,), np.uint8)
        arr[..., 0] = arr[..., 1] = arr[..., 2] = g
        arr[..., 3] = np.where(g > 0, 255, 0)
        cuadros.append(Image.fromarray(arr, 'RGBA'))
    tira = op.tira(cuadros)
    return tira if np.array(tira)[..., 3].any() else None


def tira_emisivo_color(pieza):
    """Formato de P1: los píxeles que emiten, en su color final, el resto transparente."""
    if not pieza['emisivo']:
        return None
    out = []
    for c, m in zip(pieza['cuadros'], pieza['emisivo']):
        q = Image.new('RGBA', c.size, (0, 0, 0, 0))
        q.paste(c, (0, 0), m.getchannel('A'))
        out.append(q)
    return op.tira(out)


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
