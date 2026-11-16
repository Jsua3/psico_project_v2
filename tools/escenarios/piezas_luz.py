"""Luz de una sala por piezas, calculada desde su estructura con aritmética entera.

    calcular_luz(sala, momento=None, abiertas=(), cuerpos=()) -> (ambiente, brillo)

`ambiente` se MULTIPLICA y `brillo` se SUMA, como en la renovación visual. Parámetros heredados de
`arte_vivo.mapas_de_luz`: 8 escalones de 0,07 entre 0,44 y 1,00, penumbra 0,79, tramado Bayer 4×4 y
tono cálido al 15 %.

- De día cada ventana proyecta un haz sobre el piso (y un halo en su muro). De noche las ventanas no
  emiten: la penumbra baja a 0,58 y la luz sale de las lámparas (pozos cálidos; el tubo, fría y pareja).
- Varias luces se combinan con el máximo ANTES de cuantizar: al cruzarse no rompen los escalones.
- `cuerpos` son los muebles y las personas que hay en el piso (`cuerpo_de(dibujo, x, y)`): cada uno arroja su SILUETA,
  tendida en el piso lejos de la fuente que más luz le da: la ventana, en la dirección de su haz; la lámpara, lejos de
  sí misma y más larga cuanto más baja esté; el tubo de techo, corta y casi debajo. Dentro de la sombra cada fuente
  pierde su parte (3/4; el tubo, 3/8) y el piso baja un escalón más. La dirección es una de 19 matrices enteras.
- Todo es entero (la luz va en diezmilésimas; las mezclas, en 1/1024): el cliente puede repetir las mismas
  operaciones y sacar los mismos píxeles. La única raíz es `floor(sqrt(n))` con n < 2^31, que es exacta en
  doble precisión (numpy y JavaScript dan lo mismo). `TABLA_AMBIENTE`, `TABLA_CALIDA` y `TABLA_FRIA` son
  las tablas que el cliente debe copiar.
"""
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import piezas_geo as g  # noqa: E402
import piezas_muro as pm  # noqa: E402
import piezas_puertas as pp  # noqa: E402

U = 10000                              # 1,00 de luz
MINIMO, PASO, NIVELES = 4400, 700, 8   # 0,44 … 1,00 en escalones de 0,07
PENUMBRA, PENUMBRA_NOCHE = 7900, 5800
EXTERIOR, EXTERIOR_NOCHE = 9300, 5100
UNO = 1024                             # 1,0 en las mezclas
EN_SOMBRA = {'haz': 768, 'pozo': 768, 'tubo': 384}   # de la luz de cada fuente, lo que se pierde dentro de una sombra (3/4; del tubo, 3/8)
SOMBRA_PROPIA, SOMBRA_AL_SOL = 1, 2       # escalones que además baja la luz dentro de una sombra (bajo techo; al sol)
ALTURA_TUBO = 360                         # px del piso al tubo de techo: su sombra es corta y cae casi debajo
TOPE_SOMBRA = {'pozo': 12, 'tubo': 3}     # largo máximo de la sombra de una lámpara, en octavos del alto del cuerpo
UMBRAL_DOMINIO = 12800                    # fuerza × mancha que una fuente debe dar en el apoyo de un cuerpo para mandar su sombra
CENITAL = (4, 3)                          # sin fuente que mande: sombra corta hacia la cámara (dirección 4, 3/8 del alto)
# La sombra es la SILUETA del cuerpo tendida en el piso. Un píxel de la silueta a `u` px a la derecha del apoyo y a
# `h` px de altura cae en (x + (a·u + b·h) / 64, y + (c·u + d·h) / 64): (b, d) es hacia dónde y cuánto se tiende por
# cada px de altura, (a, c) cómo queda el ancho del cuerpo, girado con la sombra y aplastado por la vista.
MATRIZ_HAZ = {'fondo': (60, 28, -11, 40), 'izquierda': (36, 48, -27, 16), 'derecha': (36, -48, 27, 16)}   # (a, b, c, d)
SENOS_HAZ = {'fondo': (60, 21), 'izquierda': (36, 53), 'derecha': (36, 53)}   # (seno, coseno) de cada haz sobre el piso, en 64avos
# Las 16 direcciones de las lámparas, de 22,5° en 22,5° desde la derecha y girando hacia la cámara: (Dx, Dy, Px, Py)
# en 64avos, con el piso aplastado a la mitad en vertical. La matriz es (Px, Dx·k8 // 8, Py, Dy·k8 // 8).
DIRECCIONES = ((64, 0, 0, 32), (59, 12, 24, -30), (45, 23, 45, -23), (24, 30, 59, -12), (0, 32, 64, 0), (-24, 30, 59, 12),
               (-45, 23, 45, 23), (-59, 12, 24, 30), (-64, 0, 0, 32), (-59, -12, 24, -30), (-45, -23, 45, -23), (-24, -30, 59, -12),
               (0, -32, 64, 0), (24, -30, 59, 12), (45, -23, 45, 23), (59, -12, 24, 30))
PULIDOS = ('vinilo', 'baldosa', 'damero')   # pisos que devuelven la luz
LUNA = 22                                 # fuerza (de 100) con que una ventana deja entrar la luna de noche, fría
REFLEJO = 900                             # de la luz de una fuente, lo que el piso pulido devuelve al brillo
VIDRIADAS = {'corrediza': 80, 'vidrio': 70, 'urgencias': 40, 'madera-ventanilla': 30}   # fuerza con que el vidrio de una puerta cerrada del fondo se refleja en el piso pulido
CONTACTO = 2                              # escalones que baja la luz en el centro de una sombra de contacto
PARTELUZ_SIMPLE = {'verticales': [512]}   # la ventana que no declara su forma: un parteluz al medio
SOMBRA_MAXIMA = 72                        # px que mide como mucho la sombra que arroja una lámpara
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.int64)


def _tabla_ambiente(noche=False):
    """Sombras frías y luces neutras: (r, v, a) por escalón, redondeado. De noche la sombra es más azul: el día y la
    noche se distinguen por el tono general, no solo por lo que está encendido."""
    filas = []
    for n in range(NIVELES + 1):
        v = MINIMO + PASO * n
        if noche:
            r = (255 * v * (64 + 2 * n) + 400000) // 800000
            ve = (255 * v * (704 + 12 * n) + 4000000) // 8000000
            a = min(255, (255 * v * (928 - 16 * n) + 4000000) // 8000000)
        else:
            r = (255 * v * (72 + n) + 400000) // 800000
            ve = (255 * v * (744 + 7 * n) + 4000000) // 8000000
            a = min(255, (255 * v * (88 - n) + 400000) // 800000)
        filas.append((r, ve, a))
    return np.array(filas, dtype=np.uint8)


def _tabla_brillo(color):
    return np.array([[(c * 5 * n + 50) // 100 for c in color] for n in range(4)], dtype=np.int64)


TABLA_AMBIENTE = _tabla_ambiente()
TABLA_AMBIENTE_NOCHE = _tabla_ambiente(noche=True)
TABLA_CALIDA = _tabla_brillo((255, 206, 140))
TABLA_FRIA = _tabla_brillo((150, 200, 255))


def _raiz(n):
    return np.sqrt(n.astype(np.float64)).astype(np.int64)


def _suave(p):
    """Caída del pozo de luz: p·(3 − p)/2, la versión entera de p^0,7."""
    return p * (3 * UNO - p) // (2 * UNO)


class _Sala:
    """La geometría de la sala como matrices enteras."""

    def __init__(self, sala):
        est = sala['estructura']
        self.w = g.comprobar_ancho(est['ancho'])
        self.encuadre = sala['encuadre']
        self.izq, self.der = g.laterales(self.encuadre)
        self.b = g.borde(self.w)
        self.xl, self.xr = g.limites(self.encuadre, self.w)
        self.cx = self.w // 2
        self.ys, self.xs = np.mgrid[0:g.ALTO, 0:self.w].astype(np.int64)
        self.n = np.clip(self.ys - g.SEAM, 0, g.FONDO)            # profundidad sobre el piso
        self.jl = self.b - self.n * (self.b - g.MARGEN) // g.FONDO
        self.jr = self.w - self.jl
        en_piso = self.ys >= g.SEAM
        self.piso = en_piso & ((self.xs >= self.jl) if self.izq else True) & ((self.xs <= self.jr) if self.der else True)
        self.muro = (self.ys >= g.TOP) & (self.ys < g.SEAM) & (self.xs >= self.xl) & (self.xs < self.xr)


def _haz_fondo(S, x0, ancho, y0, alto, forma):
    """Ventana del muro del fondo: (luz sobre el piso, halo sobre el muro), de 0 a 1024. El haz lleva la forma de la
    ventana: cada parteluz vertical es una línea a lo largo del haz, cada travesaño una línea que lo cruza y las
    lamas de la persiana, rayas en el tramo que cubren. Las fracciones van de 0 a 1024."""
    n = S.n
    esc = 16 * g.FONDO + 3 * n
    xi = S.cx + (x0 - 8 - S.cx) * esc // (16 * g.FONDO) + 170 * n // g.FONDO
    xd = S.cx + (x0 + ancho + 8 - S.cx) * esc // (16 * g.FONDO) + 250 * n // g.FONDO
    t = n * 1000 // g.FONDO
    dentro = np.minimum(np.minimum(S.xs - xi, xd - S.xs), np.minimum((t - 15) * 700 // 1000, (740 - t) * 500 // 1000))
    luz = np.clip(dentro * 64, 0, UNO) * S.piso
    n0, n1 = 15 * g.FONDO // 1000, 740 * g.FONDO // 1000          # px de profundidad donde empieza y termina el haz
    for f in forma.get('verticales', ()):
        luz = np.where(np.abs(S.xs - (xi + (xd - xi) * f // UNO)) * 2 < 6 + 10 * t // 1000, luz * 35 // 100, luz)
    for f in forma.get('horizontales', ()):
        luz = np.where(np.abs(n - (n0 + (n1 - n0) * f // UNO)) * 2 < 5 + 4 * t // 1000, luz * 35 // 100, luz)
    if forma.get('lamas'):
        desde, hasta, paso = forma['lamas']
        na, nb = n0 + (n1 - n0) * desde // UNO, n0 + (n1 - n0) * hasta // UNO
        luz = np.where((n >= na) & (n <= nb) & ((n - na) % paso < paso // 2), luz * 35 // 100, luz)
    dx = np.maximum(np.maximum(x0 - S.xs, S.xs - (x0 + ancho)), 0)
    dy = np.maximum(np.maximum(y0 - S.ys, S.ys - (y0 + alto)), 0)
    halo = np.clip(UNO - _raiz(dx * dx + dy * dy) * UNO // 46, 0, UNO) * S.muro
    return luz, halo


def _haz_lado(S, lado, yc, ancho, forma):
    """Ventana de un muro lateral: la luz cruza el piso y baja hacia la cámara mientras se aleja del muro."""
    dist = (S.xs - S.jl) if lado == 'izquierda' else (S.jr - S.xs)
    centro = yc + dist * 35 // 100
    medio = ancho // 2 + 4
    dentro = np.minimum(medio - np.abs(S.ys - centro), dist)
    alcance = np.clip((460 - dist) * UNO // 180, 0, UNO)
    luz = np.clip(dentro * 64, 0, UNO) * alcance // UNO * S.piso
    a = S.ys - (centro - medio)                                   # posición a lo ancho del haz
    for f in forma.get('verticales', ()):
        luz = np.where(np.abs(a - 2 * medio * f // UNO) * 2 < 5, luz * 35 // 100, luz)
    for f in forma.get('horizontales', ()):
        luz = np.where(np.abs(dist - (40 + 300 * f // UNO)) * 2 < 7, luz * 35 // 100, luz)
    if forma.get('lamas'):
        desde, hasta, paso = forma['lamas']
        da, db = 40 + 300 * desde // UNO, 40 + 300 * hasta // UNO
        luz = np.where((dist >= da) & (dist <= db) & ((dist - da) % paso < paso // 2), luz * 35 // 100, luz)
    return luz


def _reflejo_piso(S, xa, xb, largo):
    """Franja que un piso pulido devuelve bajo algo del muro del fondo que da luz (entre xa y xb): nace al pie del
    muro, sigue la perspectiva del piso y se apaga a los `largo` px."""
    esc = 16 * g.FONDO + 3 * S.n
    xi = S.cx + (xa - S.cx) * esc // (16 * g.FONDO)
    xd = S.cx + (xb - S.cx) * esc // (16 * g.FONDO)
    dentro = np.minimum(S.xs - xi, xd - S.xs)
    caida = np.clip((largo - S.n) * UNO // largo, 0, UNO)
    return np.clip(dentro * 96 + 192, 0, UNO) * caida // UNO * (S.piso & (S.n >= 3))      # bordes deshechos en 10 px


def _contacto(S, c):
    """Sombra de contacto de un cuerpo: una elipse baja a sus pies, plena en el centro y deshecha en el borde."""
    cx, cy = (c['x0'] + c['x1']) // 2, c['y1'] - 2
    rx, ry = (c['x1'] - c['x0']) // 2 + 5, max(4, (c['y1'] - c['y0']) // 2 + 3)
    ex, ey = np.abs(S.xs - cx) * UNO // rx, np.abs(S.ys - cy) * UNO // ry
    return np.minimum(np.clip(UNO - _raiz(ex * ex + ey * ey), 0, UNO) * 2, UNO) * S.piso


def _pozo(S, x, y, rx, ry):
    ex, ey = np.abs(S.xs - x) * UNO // rx, np.abs(S.ys - y) * UNO // ry
    return _suave(np.clip(UNO - _raiz(ex * ex + ey * ey), 0, UNO)) * S.piso


def _halo_muro(S, x, y, radio):
    dx, dy = np.abs(S.xs - x), np.abs(S.ys - y)
    return np.clip(UNO - _raiz(dx * dx + dy * dy) * UNO // radio, 0, UNO) * S.muro


def cuerpo(x, y, ancho, alto, persona=False, mascara=None, apoyo=None):
    """Huella en el piso y altura de algo apoyado en (x, y), el centro de su base, a partir del tamaño de su sprite.
    Con `mascara` (matriz booleana del dibujo: True donde es opaco) y `apoyo` (columna del apoyo, fila siguiente a la
    última opaca) arroja su silueta; sin ella, la de una caja con el ancho de su huella y su alto."""
    if persona:
        c = dict(x0=x - 9, x1=x + 9, y0=y - 10, y1=y, alto=60)
    else:
        fondo = max(8, min(16, ancho // 5))
        c = dict(x0=x - ancho // 2 + 2, x1=x + ancho // 2 - 2, y0=y - fondo, y1=y, alto=max(8, alto - fondo // 2))
    if mascara is not None:
        px, py = apoyo if apoyo else (mascara.shape[1] // 2, mascara.shape[0])
        c.update(x=x, y=y, mascara=mascara, px=px, py=py)
    return c


def cuerpo_de(im, x, y, pie=None):
    """El cuerpo de un dibujo RGBA puesto con su esquina en (x, y): su silueta es su alfa (opaco desde 128). `pie` es
    el punto del piso donde se apoya una persona; un mueble se apoya en el centro de su base. El apoyo de la sombra
    queda en la fila siguiente a la última opaca: la sombra nace pegada a los pies."""
    w, h = im.size
    alfa = np.array(im.getchannel('A')) >= 128
    filas = np.nonzero(alfa.any(axis=1))[0]
    c = cuerpo(pie[0], pie[1], w, h, persona=True) if pie else cuerpo(x + w // 2, y + h, w, h)
    if len(filas):
        px, py = (pie[0] - x if pie else w // 2), int(filas[-1]) + 1
        c.update(x=x + px, y=y + py, mascara=alfa, px=px, py=py, alto=py - int(filas[0]))
    return c


def _completo(c):
    """El cuerpo con todo lo que pide la sombra: el que no trae silueta arroja la de su caja."""
    if 'mascara' in c:
        return c
    ancho = max(c['x1'] - c['x0'], 1)
    return dict(c, x=(c['x0'] + c['x1']) // 2, y=c['y1'], mascara=np.ones((c['alto'], ancho), dtype=bool), px=ancho // 2, py=c['alto'])


def cuerpo_a_json(c):
    """El cuerpo completo como datos: la máscara va como filas de texto, '#' opaco y '.' transparente."""
    c = _completo(c)
    datos = {k: int(c[k]) for k in ('x0', 'x1', 'y0', 'y1', 'alto', 'x', 'y', 'px', 'py')}
    datos['mascara'] = [''.join('#' if v else '.' for v in fila) for fila in c['mascara']]
    return datos


def cuerpo_de_json(datos):
    return dict(datos, mascara=np.array([[ch == '#' for ch in fila] for fila in datos['mascara']], dtype=bool))


def direccion(dx, dy):
    """Índice (0 a 15) de la dirección (dx, dy) del piso, de 22,5° en 22,5° desde la derecha y girando hacia la cámara.
    Solo compara enteros: las tangentes de 11,25°, 33,75°, 56,25° y 78,75° van en 256avos (51, 171, 383, 1287)."""
    ax, ay = abs(dx), abs(dy)
    q = 0 if ay * 256 <= ax * 51 else 1 if ay * 256 <= ax * 171 else 2 if ay * 256 <= ax * 383 else 3 if ay * 256 <= ax * 1287 else 4
    if dy >= 0:
        return q if dx >= 0 else 8 - q
    return (16 - q) % 16 if dx >= 0 else 8 + q


def matriz_de(i, k8):
    """Matriz (a, b, c, d) de la dirección i con una sombra de k8 octavos del alto del cuerpo."""
    dx, dy, px, py = DIRECCIONES[i]
    return (px, dx * k8 // 8, py, dy * k8 // 8)


def _silueta(S, c, m):
    """La silueta del cuerpo tendida en el piso con la matriz m: por cada píxel de la sala se pregunta de qué píxel
    del dibujo vendría (la matriz al revés, con división entera hacia abajo) y si ese píxel es opaco."""
    a, b, cc, d = m
    masc, px, py = c['mascara'], c['px'], c['py']
    alto_m, ancho_m = masc.shape
    det = a * d - b * cc
    total = np.zeros(S.xs.shape, dtype=bool)
    xs = [(a * u + b * h) // 64 for u in (-px, ancho_m - px) for h in (0, py)]
    ys = [(cc * u + d * h) // 64 for u in (-px, ancho_m - px) for h in (0, py)]
    x0, x1 = max(c['x'] + min(xs) - 2, 0), min(c['x'] + max(xs) + 3, S.w)
    y0, y1 = max(c['y'] + min(ys) - 2, g.SEAM), min(c['y'] + max(ys) + 3, g.ALTO)
    if det == 0 or x0 >= x1 or y0 >= y1:
        return total
    dy, dx = np.mgrid[y0:y1, x0:x1].astype(np.int64)
    dx, dy = dx - c['x'], dy - c['y']
    u = (d * dx - b * dy) * 64 // det
    h = (a * dy - cc * dx) * 64 // det
    col, fila = px + u, py - 1 - h
    dentro = (h >= 0) & (fila >= 0) & (fila < alto_m) & (col >= 0) & (col < ancho_m)
    total[y0:y1, x0:x1] = dentro & masc[np.clip(fila, 0, alto_m - 1), np.clip(col, 0, ancho_m - 1)]
    return total


def _dibujo(S, c):
    """Los píxeles de la sala que tapa el propio dibujo del cuerpo: ahí su sombra no se ve."""
    total = np.zeros(S.xs.shape, dtype=bool)
    masc = c['mascara']
    x, y = c['x'] - c['px'], c['y'] - c['py']
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + masc.shape[1], S.w), min(y + masc.shape[0], g.ALTO)
    if x0 < x1 and y0 < y1:
        total[y0:y1, x0:x1] = masc[y0 - y:y1 - y, x0 - x:x1 - x]
    return total


def _emisores(sala, momento):
    """(pieza, ficha de luz, fuerza de 0 a 100) de cada pieza que emite en ese momento."""
    for pz in sala['estructura'].get('piezas', []):
        ficha = pm.PIEZAS.get((pz.get('tipo'), pz.get('modelo')))
        luz = ficha.get('luz') if ficha else None
        modo = pz.get('encendida')            # booleano opcional: True la fuerza encendida y False apagada
        if not luz or modo is False:
            continue
        if luz['forma'] == 'haz' and momento == 'noche':
            # De noche la ventana deja entrar la luna: poca luz y fría, con la misma forma del haz. Así el piso lejos
            # de las lámparas no queda parejo.
            yield pz, ficha, dict(luz, tono='frio'), LUNA
            continue
        propia = luz['momento'] == momento
        if not propia and modo is not True:
            continue
        yield pz, ficha, luz, luz.get('fuerza', 100) * (100 if propia else 60) // 100


def _fuentes(S, sala, momento, abiertas=()):
    """Lo que alumbra la sala, sin sombras: `fuentes` (lo que un cuerpo puede tapar: haces, pozos y tubos, cada uno con
    su mancha sobre el piso), `fijas` (halos, franjas y cuñas: nadie las tapa) y `brillos` (reflejos del piso pulido)."""
    exterior = bool(sala['estructura'].get('exterior'))
    fuentes, fijas, brillos = [], [], []
    for pz, ficha, luz, fuerza in _emisores(sala, momento):
        muro, tono = pz.get('muro'), luz['tono']
        if luz['forma'] == 'haz':
            if exterior:
                continue
            forma = luz.get('parteluces') or PARTELUZ_SIMPLE
            if muro == 'fondo':
                x0 = S.xl + pz['pos'] - ficha['ancho'] // 2
                piso, halo = _haz_fondo(S, x0, ficha['ancho'], g.SEAM - ficha['antepecho'] - ficha['alto'], ficha['alto'], forma)
                fuentes.append(dict(clase='haz', mancha=piso, fuerza=fuerza, tono=tono, color=UNO, muro='fondo'))
                fijas.append((halo, fuerza, tono, UNO * 2 // 3, UNO // 2))
                brillos.append((_reflejo_piso(S, x0, x0 + ficha['ancho'], 110), fuerza, tono))
            elif muro in ('izquierda', 'derecha') and (S.izq if muro == 'izquierda' else S.der):
                haz = _haz_lado(S, muro, g.SEAM + pz['pos'], ficha['ancho'], forma)
                fuentes.append(dict(clase='haz', mancha=haz, fuerza=fuerza, tono=tono, color=UNO, muro=muro))
            continue
        tubo = luz['forma'] == 'tubo'
        if 'x' in pz:
            x, y = pz['x'], pz['y']
        elif muro == 'fondo':
            x, y = S.xl + pz['pos'], g.SEAM + (120 if tubo else 64)
        else:
            continue
        rx, ry = luz['radio']
        altura = ALTURA_TUBO if tubo else luz.get('altura', 150) + pz.get('sobre', 0)
        fuentes.append(dict(clase='tubo' if tubo else 'pozo', mancha=_pozo(S, x, y, rx, ry), fuerza=fuerza, tono=tono, color=UNO * 9 // 10,
                            punto=(x, y, altura)))
        if muro == 'fondo' and 'x' not in pz:
            medio = 26 if tubo else 14
            brillos.append((_reflejo_piso(S, x - medio, x + medio, 90), fuerza, tono))
        if tubo:
            fijas.append((np.clip(UNO - np.abs(S.xs - x) * UNO // 190, 0, UNO) * S.muro, fuerza, tono, UNO * 8 // 10, UNO // 2))
        else:
            fijas.append((_halo_muro(S, x, g.SEAM - 36, 96), fuerza, tono, UNO // 2, UNO * 4 // 10))
    for puerta in sala.get('puertas', []):
        modelo = pp.MODELOS.get(puerta.get('modelo'))
        if puerta.get('muro') != 'fondo' or not modelo:
            continue                          # un modelo que no existe se avisa en capas(); la luz lo ignora
        vano = modelo['ancho'] // 2 - 6
        if puerta['id'] not in abiertas:
            # Cerrada, su vidrio deja pasar algo de la luz de la sala vecina: el piso pulido la devuelve al pie.
            vidrio = VIDRIADAS.get(puerta['modelo'])
            if vidrio:
                brillos.append((_reflejo_piso(S, S.xl + puerta['pos'] - vano, S.xl + puerta['pos'] + vano, 70), vidrio, 'frio'))
            continue
        # La puerta abierta deja caer en el piso una cuña de la luz de la sala vecina.
        medio = vano + S.n * 30 // 100
        dentro = np.minimum(medio - np.abs(S.xs - (S.xl + puerta['pos']) - S.n * 12 // 100), 54 - S.n)
        fijas.append((np.clip(dentro * 64, 0, UNO) * S.piso, 100, 'calido', UNO * 2 // 3 if momento == 'dia' else UNO * 4 // 10, UNO * 4 // 10))
        brillos.append((_reflejo_piso(S, S.xl + puerta['pos'] - vano, S.xl + puerta['pos'] + vano, 60), 100, 'calido'))
    return fuentes, fijas, brillos


def _vista_desde(c, m, seno, coseno):
    """La matriz con el ancho del cuerpo como se ve desde la fuente: de frente se ve su ancho; de lado, su fondo. El
    ancho de la silueta se encoge a (ancho·seno + 2·fondo·coseno) / ancho de la huella, entre 8/64 y 1."""
    ancho = max(c['x1'] - c['x0'], 1)
    s = min(max((ancho * seno + 2 * (c['y1'] - c['y0']) * coseno) // ancho, 8), 64)
    return (m[0] * s // 64, m[1], m[2] * s // 64, m[3])


def _matriz_del_cuerpo(S, fuentes, c, sol=False):
    """La matriz de la sombra de un cuerpo: la de la fuente que más luz le da en su apoyo (fuerza × mancha). Al sol
    manda el sol; si ninguna llega al umbral, la sombra es la cenital: corta y hacia la cámara."""
    if sol:
        return _vista_desde(c, MATRIZ_HAZ['fondo'], *SENOS_HAZ['fondo'])
    x, y = min(max(c['x'], 0), S.w - 1), min(max(c['y'], g.SEAM), g.ALTO - 1)
    mejor, manda = UMBRAL_DOMINIO - 1, None
    for f in fuentes:
        if f['clase'] != 'haz':
            lx, ly, _ = f['punto']
            if c['x0'] - 8 <= lx <= c['x1'] + 8 and c['y0'] - 8 <= ly <= c['y1'] + 8:
                continue                      # la lámpara está encima de ese mueble
        aporte = f['fuerza'] * int(f['mancha'][y, x])
        if aporte > mejor:
            mejor, manda = aporte, f
    i, k8 = CENITAL
    if manda is not None and manda['clase'] == 'haz':
        return _vista_desde(c, MATRIZ_HAZ[manda['muro']], *SENOS_HAZ[manda['muro']])
    if manda is not None:
        lx, ly, altura = manda['punto']
        dx, dy = c['x'] - lx, c['y'] - ly
        n = math.isqrt(dx * dx + dy * dy)
        if n >= 4:
            tope = max(2, min(TOPE_SOMBRA[manda['clase']], SOMBRA_MAXIMA * 8 // max(c['alto'], 1)))
            i, k8 = direccion(dx, 2 * dy), min(max(n * 8 // max(altura - c['alto'], 16), 2), tope)
    return _vista_desde(c, matriz_de(i, k8), 2 * abs(DIRECCIONES[i][1]), abs(DIRECCIONES[i][0]))


def matrices_de_sombra(sala, momento=None, puntos=(), alto=64, abiertas=()):
    """La matriz (a, b, c, d) de la sombra de una persona de `alto` px apoyada en cada punto (x, y) del piso: lo que el
    juego necesita para tender la silueta de quien camina sin recalcular la sala."""
    momento = momento or sala['estructura'].get('momento', 'dia')
    S = _Sala(sala)
    sol = bool(sala['estructura'].get('exterior')) and momento == 'dia'
    fuentes = _fuentes(S, sala, momento, abiertas)[0]
    return [_matriz_del_cuerpo(S, fuentes, dict(cuerpo(x, y, 48, 72, persona=True), x=x, y=y, alto=alto), sol) for x, y in puntos]


def sombras(sala, momento=None, abiertas=(), cuerpos=()):
    """Máscara booleana de la sala: los píxeles del piso que quedan a la sombra de algún cuerpo. Cada cuerpo tiende su
    silueta con la matriz de la fuente que manda en su apoyo; el borde se deshace con el tramado (un anillo de 1 px al
    50 %) y ningún dibujo queda tapado por una sombra."""
    momento = momento or sala['estructura'].get('momento', 'dia')
    S = _Sala(sala)
    sol = bool(sala['estructura'].get('exterior')) and momento == 'dia'
    return _sombras(S, _fuentes(S, sala, momento, abiertas)[0], [_completo(c) for c in cuerpos], sol)


def _sombras(S, fuentes, cuerpos, sol):
    sombra = np.zeros(S.xs.shape, dtype=bool)
    tapado = np.zeros(S.xs.shape, dtype=bool)
    for c in cuerpos:
        sombra |= _silueta(S, c, _matriz_del_cuerpo(S, fuentes, c, sol))
        tapado |= _dibujo(S, c)
    if not sombra.any():
        return sombra
    borde = np.zeros_like(sombra)
    borde[1:] |= sombra[:-1]
    borde[:-1] |= sombra[1:]
    borde[:, 1:] |= sombra[:, :-1]
    borde[:, :-1] |= sombra[:, 1:]
    return (sombra | (borde & (BAYER[S.ys % 4, S.xs % 4] < 8))) & S.piso & ~tapado


def niveles(sala, momento=None, abiertas=(), cuerpos=(), todo_en_sombra=False, crudo=False):
    """(escalón de ambiente 0–8, escalón cálido 0–3, escalón frío 0–3) por píxel."""
    est = sala['estructura']
    momento = momento or est.get('momento', 'dia')
    S = _Sala(sala)
    exterior = bool(est.get('exterior'))
    sol = exterior and momento == 'dia'
    if exterior:
        base = EXTERIOR if momento == 'dia' else EXTERIOR_NOCHE
    else:
        base = PENUMBRA if momento == 'dia' else PENUMBRA_NOCHE
    ganancia = U - base
    pulido = est.get('acabados', {}).get('piso') in PULIDOS
    cuerpos = [_completo(c) for c in cuerpos]
    fuentes, fijas, brillos = _fuentes(S, sala, momento, abiertas)

    def combinar(a_la_sombra):
        """La luz de la sala sin cuerpos. `a_la_sombra` da la que queda DENTRO de una sombra: cada fuente pierde su
        parte y el piso baja un escalón más (dos al sol)."""
        L = np.full((g.ALTO, S.w), base, dtype=np.int64)
        tonos = {'calido': np.zeros((g.ALTO, S.w), np.int64), 'frio': np.zeros((g.ALTO, S.w), np.int64)}
        if sol:
            # Luz de día: el muro echa una sombra corta sobre el suelo y el alero sobre el muro.
            corta = S.piso & (S.n < 34)
            L = np.where(corta, np.minimum(L, 7200 + 2100 * np.clip(S.n - 14, 0, 20) // 20), L)
            L = np.where(S.muro & (S.ys < g.TOP + 18), 7900, L)
        for f in fuentes:
            mancha = f['mancha']
            if a_la_sombra:
                mancha = mancha - mancha * EN_SOMBRA[f['clase']] // UNO
            L = np.maximum(L, base + ganancia * f['fuerza'] // 100 * mancha // UNO)
            tonos[f['tono']] = np.maximum(tonos[f['tono']], mancha * f['fuerza'] // 100 * f['color'] // UNO)
        for mancha, fuerza, tono, peso, color in fijas:
            L = np.maximum(L, base + ganancia * fuerza // 100 * peso // UNO * mancha // UNO)
            tonos[tono] = np.maximum(tonos[tono], mancha * fuerza // 100 * color // UNO)
        if pulido:
            for mancha, fuerza, tono in brillos:
                tonos[tono] = np.maximum(tonos[tono], mancha * fuerza // 100 * REFLEJO // UNO)
        if a_la_sombra:
            L = np.where(S.piso, L - PASO * (SOMBRA_AL_SOL if sol else SOMBRA_PROPIA), L)
        return L, tonos['calido'], tonos['frio']

    # `todo_en_sombra` da la luz que queda dentro de una sombra en todo el piso: con ella el juego pinta la sombra de
    # quien camina sin recalcular la sala (ver LEEME de la referencia).
    sombra = S.piso if todo_en_sombra else _sombras(S, fuentes, cuerpos, sol)
    L, calido, frio = combinar(False)
    if sombra.any():
        Ls, cs, fs = combinar(True)
        L, calido, frio = np.where(sombra, Ls, L), np.where(sombra, cs, calido), np.where(sombra, fs, frio)

    if crudo:
        return L, calido, frio
    for c in cuerpos:
        L = L - CONTACTO * PASO * _contacto(S, c) // UNO

    # Sombras de rincón al pie de los muros y viñeta.
    L = np.where(S.piso & (S.n < 18), L * (800 + 200 * S.n // 18) // 1000, L)
    if S.izq:
        dist = np.clip(S.xs - S.jl, 0, 16)
        L = np.where(S.piso & (S.xs - S.jl < 16), L * (820 + 180 * dist // 16) // 1000, L)
    if S.der:
        dist = np.clip(S.jr - S.xs, 0, 16)
        L = np.where(S.piso & (S.jr - S.xs < 16), L * (820 + 180 * dist // 16) // 1000, L)
    ex = np.abs(S.xs - S.cx) * 1000 // (600 * S.w // 960)
    ey = np.abs(S.ys - 310) * 1000 // 360
    vineta = np.clip((_raiz(ex * ex + ey * ey) - 620) * 2, 0, 1000)
    L = L * (1000 - (100 if exterior else 200) * vineta // 1000) // 1000

    umbral = BAYER[S.ys % 4, S.xs % 4]
    q = np.clip(L - MINIMO, 0, PASO * NIVELES)
    nivel = np.clip(q // PASO + ((q % PASO) * 16 > umbral * PASO), 0, NIVELES)
    escalones = []
    for a in (calido * 3, frio * 3):
        escalones.append(np.clip(a // UNO + ((a % UNO) * 16 > umbral * UNO), 0, 3))
    return nivel, escalones[0], escalones[1]


def calcular_luz(sala, momento=None, abiertas=(), cuerpos=(), todo_en_sombra=False):
    """(ambiente RGB para multiplicar, brillo RGB para sumar)."""
    momento = momento or sala['estructura'].get('momento', 'dia')
    nivel, calido, frio = niveles(sala, momento, abiertas, cuerpos, todo_en_sombra)
    ambiente = (TABLA_AMBIENTE_NOCHE if momento == 'noche' else TABLA_AMBIENTE)[nivel]
    brillo = np.clip(TABLA_CALIDA[calido] + TABLA_FRIA[frio], 0, 255).astype(np.uint8)
    return Image.fromarray(ambiente, 'RGB'), Image.fromarray(brillo, 'RGB')


# ── brillo del vidrio, el metal y el barniz ────────────────────────────────────

# Color que SUMA un píxel brillante según la luz que le llega: [tono][escalón de 0 a 3].
TABLA_REFLEJO = {'neutro': ((0, 0, 0), (24, 24, 22), (48, 48, 44), (76, 76, 70)),
                 'calido': ((0, 0, 0), (28, 23, 14), (54, 45, 28), (86, 72, 44)),
                 'frio': ((0, 0, 0), (16, 23, 30), (32, 46, 58), (52, 72, 92))}
UMBRAL_REFLEJO = 4          # escalones de luz por debajo de los cuales nada brilla


def reflejos(sala, momento=None, abiertas=(), cuerpos=(), puntos=()):
    """Por cada punto (x, y) del piso, (k, tono): cuánta luz le llega ahí a lo que brilla (k de 0 a 3) y de qué tono
    (neutro, calido o frio). Se mide sobre la luz de las fuentes, antes de las sombras de contacto y de rincón y sin
    tramado: k = clip((L − minimo) // paso − 4, 0, 3). De día en penumbra da 1; en un haz o bajo una lámpara, 3; de
    noche sin lámpara, 0: el brillo se apaga con la luz."""
    L, calido, frio = niveles(sala, momento, abiertas, cuerpos, crudo=True)
    alto, ancho = L.shape
    lista = []
    for x, y in puntos:
        x, y = min(max(int(x), 0), ancho - 1), min(max(int(y), 0), alto - 1)
        k = int(min(max((int(L[y, x]) - MINIMO) // PASO - UMBRAL_REFLEJO, 0), 3))
        c, f = int(calido[y, x]), int(frio[y, x])
        lista.append((k, 'frio' if f > c and f >= 128 else 'calido' if c >= 128 else 'neutro'))
    return lista


def color_de_reflejo(k, tono, gris):
    """Lo que suma un píxel del mapa de brillo (gris 255 vidrio, 170 metal, 85 barniz) con la luz (k, tono): el vidrio
    brilla con cualquier luz, el metal necesita un escalón más y el barniz dos."""
    return TABLA_REFLEJO[tono][min(max(k - (3 - gris // 85), 0), 3)]
