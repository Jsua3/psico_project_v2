"""Luz de una sala por piezas, calculada desde su estructura con aritmética entera.

    calcular_luz(sala, momento=None, abiertas=(), cuerpos=()) -> (ambiente, brillo)

`ambiente` se MULTIPLICA y `brillo` se SUMA, como en la renovación visual. Parámetros heredados de
`arte_vivo.mapas_de_luz`: 8 escalones de 0,07 entre 0,44 y 1,00, penumbra 0,79, tramado Bayer 4×4 y
tono cálido al 15 %.

- De día cada ventana proyecta un haz sobre el piso (y un halo en su muro). De noche las ventanas no
  emiten: la penumbra baja a 0,58 y la luz sale de las lámparas (pozos cálidos; el tubo, fría y pareja).
- Varias luces se combinan con el máximo ANTES de cuantizar: al cruzarse no rompen los escalones.
- `cuerpos` son los muebles y las personas que hay en el piso (`cuerpo(x, y, ancho, alto)`): cada uno le tapa la luz
  a lo que tiene detrás. La ventana arroja la sombra en la dirección de su haz; la lámpara, lejos de sí misma y más
  larga cuanto más baja esté. En la sombra queda un cuarto de la luz de esa fuente. El tubo de techo no arroja sombra.
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
EN_SOMBRA = 768                           # de la luz de una fuente, lo que se pierde a su sombra (3/4)
HAZ_FONDO, HAZ_LADO = (45, 64), (64, 22)  # dirección en que viaja la luz de una ventana, en 64avos de px
SOMBRA_MAXIMA = 72                        # px que mide como mucho la sombra que arroja una lámpara
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.int64)


def _tabla_ambiente():
    """Sombras frías y luces neutras: (r, v, a) por escalón, redondeado."""
    filas = []
    for n in range(NIVELES + 1):
        v = MINIMO + PASO * n
        r = (255 * v * (72 + n) + 400000) // 800000
        ve = (255 * v * (744 + 7 * n) + 4000000) // 8000000
        a = min(255, (255 * v * (88 - n) + 400000) // 800000)
        filas.append((r, ve, a))
    return np.array(filas, dtype=np.uint8)


def _tabla_brillo(color):
    return np.array([[(c * 5 * n + 50) // 100 for c in color] for n in range(4)], dtype=np.int64)


TABLA_AMBIENTE = _tabla_ambiente()
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


def _haz_fondo(S, x0, ancho, y0, alto):
    """Ventana del muro del fondo: (luz sobre el piso, halo sobre el muro), de 0 a 1024."""
    n = S.n
    esc = 16 * g.FONDO + 3 * n
    xi = S.cx + (x0 - 8 - S.cx) * esc // (16 * g.FONDO) + 170 * n // g.FONDO
    xd = S.cx + (x0 + ancho + 8 - S.cx) * esc // (16 * g.FONDO) + 250 * n // g.FONDO
    t = n * 1000 // g.FONDO
    dentro = np.minimum(np.minimum(S.xs - xi, xd - S.xs), np.minimum((t - 15) * 700 // 1000, (740 - t) * 500 // 1000))
    luz = np.clip(dentro * 64, 0, UNO) * S.piso
    parteluz = np.abs(2 * S.xs - (xi + xd)) < 6 + 10 * t // 1000
    luz = np.where(parteluz, luz * 35 // 100, luz)
    dx = np.maximum(np.maximum(x0 - S.xs, S.xs - (x0 + ancho)), 0)
    dy = np.maximum(np.maximum(y0 - S.ys, S.ys - (y0 + alto)), 0)
    halo = np.clip(UNO - _raiz(dx * dx + dy * dy) * UNO // 46, 0, UNO) * S.muro
    return luz, halo


def _haz_lado(S, lado, yc, ancho):
    """Ventana de un muro lateral: la luz cruza el piso y baja hacia la cámara mientras se aleja del muro."""
    dist = (S.xs - S.jl) if lado == 'izquierda' else (S.jr - S.xs)
    centro = yc + dist * 35 // 100
    dentro = np.minimum(ancho // 2 + 4 - np.abs(S.ys - centro), dist)
    alcance = np.clip((460 - dist) * UNO // 180, 0, UNO)
    return np.clip(dentro * 64, 0, UNO) * alcance // UNO * S.piso


def _pozo(S, x, y, rx, ry):
    ex, ey = np.abs(S.xs - x) * UNO // rx, np.abs(S.ys - y) * UNO // ry
    return _suave(np.clip(UNO - _raiz(ex * ex + ey * ey), 0, UNO)) * S.piso


def _halo_muro(S, x, y, radio):
    dx, dy = np.abs(S.xs - x), np.abs(S.ys - y)
    return np.clip(UNO - _raiz(dx * dx + dy * dy) * UNO // radio, 0, UNO) * S.muro


def cuerpo(x, y, ancho, alto, persona=False):
    """Huella en el piso y altura de algo apoyado en (x, y), el centro de su base, a partir del tamaño de su sprite."""
    if persona:
        return dict(x0=x - 9, x1=x + 9, y0=y - 10, y1=y, alto=60)
    fondo = max(8, min(16, ancho // 5))
    return dict(x0=x - ancho // 2 + 2, x1=x + ancho // 2 - 2, y0=y - fondo, y1=y, alto=max(8, alto - fondo // 2))


def _sombra(S, cuerpos, dx, dy, largos):
    """True donde algún cuerpo tapa la luz que viaja en la dirección (dx, dy)/64. Un punto p queda a la sombra de un
    cuerpo si p − t·(dx, dy)/64 cae en su huella para algún t entre 0 y su largo de sombra. Todo se compara
    multiplicado por |dx|·|dy|, así no hay ninguna división."""
    total = np.zeros(S.xs.shape, dtype=bool)
    ax, ay = abs(dx) or 1, abs(dy) or 1
    for c, largo in zip(cuerpos, largos):
        if largo <= 0:
            continue
        lo = np.zeros(S.xs.shape, dtype=np.int64)
        hi = np.full(S.xs.shape, largo * ax * ay, dtype=np.int64)
        dentro = np.ones(S.xs.shape, dtype=bool)
        if dx > 0:
            lo, hi = np.maximum(lo, 64 * (S.xs - c['x1']) * ay), np.minimum(hi, 64 * (S.xs - c['x0']) * ay)
        elif dx < 0:
            lo, hi = np.maximum(lo, 64 * (c['x0'] - S.xs) * ay), np.minimum(hi, 64 * (c['x1'] - S.xs) * ay)
        else:
            dentro &= (S.xs >= c['x0']) & (S.xs <= c['x1'])
        if dy > 0:
            lo, hi = np.maximum(lo, 64 * (S.ys - c['y1']) * ax), np.minimum(hi, 64 * (S.ys - c['y0']) * ax)
        elif dy < 0:
            lo, hi = np.maximum(lo, 64 * (c['y0'] - S.ys) * ax), np.minimum(hi, 64 * (c['y1'] - S.ys) * ax)
        else:
            dentro &= (S.ys >= c['y0']) & (S.ys <= c['y1'])
        total |= dentro & (lo <= hi)
    return total & S.piso


def _sombra_de_lampara(S, cuerpos, x, y, altura):
    """Sombras que arroja una lámpara puesta en (x, y) a `altura` px del piso: cada cuerpo, lejos de ella."""
    total = np.zeros(S.xs.shape, dtype=bool)
    for c in cuerpos:
        if c['x0'] - 8 <= x <= c['x1'] + 8 and c['y0'] - 8 <= y <= c['y1'] + 8:
            continue                      # la lámpara está encima de ese mueble
        ddx, ddy = (c['x0'] + c['x1']) // 2 - x, (c['y0'] + c['y1']) // 2 - y
        n = math.isqrt(ddx * ddx + ddy * ddy)
        if n < 4:
            continue
        largo = min(c['alto'] * n // max(altura - c['alto'], 16), SOMBRA_MAXIMA)
        total |= _sombra(S, [c], ddx * 64 // n, ddy * 64 // n, [largo])
    return total


def _a_la_sombra(mancha, sombra):
    return mancha - mancha * sombra * EN_SOMBRA // UNO


def _emisores(sala, momento):
    """(pieza, ficha de luz, fuerza de 0 a 100) de cada pieza que emite en ese momento."""
    for pz in sala['estructura'].get('piezas', []):
        ficha = pm.PIEZAS.get((pz.get('tipo'), pz.get('modelo')))
        luz = ficha.get('luz') if ficha else None
        modo = pz.get('encendida', 'auto')
        if not luz or modo == 'nunca':
            continue
        propia = luz['momento'] == momento
        if not propia and modo != 'siempre':
            continue
        yield pz, ficha, luz, luz.get('fuerza', 100) * (100 if propia else 60) // 100


def niveles(sala, momento=None, abiertas=(), cuerpos=()):
    """(escalón de ambiente 0–8, escalón cálido 0–3, escalón frío 0–3) por píxel."""
    est = sala['estructura']
    momento = momento or est.get('momento', 'dia')
    S = _Sala(sala)
    exterior = bool(est.get('exterior'))
    if exterior:
        base = EXTERIOR if momento == 'dia' else EXTERIOR_NOCHE
    else:
        base = PENUMBRA if momento == 'dia' else PENUMBRA_NOCHE
    ganancia = U - base
    L = np.full((g.ALTO, S.w), base, dtype=np.int64)
    tonos = {'calido': np.zeros((g.ALTO, S.w), np.int64), 'frio': np.zeros((g.ALTO, S.w), np.int64)}

    def sumar(mancha, fuerza, tono, peso=UNO, color=UNO):
        nonlocal L
        L = np.maximum(L, base + ganancia * fuerza // 100 * peso // UNO * mancha // UNO)
        tonos[tono] = np.maximum(tonos[tono], mancha * fuerza // 100 * color // UNO)

    if exterior and momento == 'dia':
        # Luz de día: el muro echa una sombra corta sobre el suelo y el alero sobre el muro.
        corta = S.piso & (S.n < 34)
        L = np.where(corta, np.minimum(L, 7200 + 2100 * np.clip(S.n - 14, 0, 20) // 20), L)
        L = np.where(S.muro & (S.ys < g.TOP + 18), 7900, L)
        sol = _sombra(S, cuerpos, HAZ_FONDO[0], HAZ_FONDO[1], [c['alto'] * 5 // 8 for c in cuerpos])
        L = np.where(sol, L - 2 * PASO, L)
    for pz, ficha, luz, fuerza in _emisores(sala, momento):
        muro, tono = pz.get('muro'), luz['tono']
        if luz['forma'] == 'haz':
            if exterior:
                continue
            if muro == 'fondo':
                x0 = S.xl + pz['pos'] - ficha['ancho'] // 2
                piso, halo = _haz_fondo(S, x0, ficha['ancho'], g.SEAM - ficha['antepecho'] - ficha['alto'], ficha['alto'])
                piso = _a_la_sombra(piso, _sombra(S, cuerpos, HAZ_FONDO[0], HAZ_FONDO[1], [c['alto'] * 5 // 8 for c in cuerpos]))
                sumar(piso, fuerza, tono)
                sumar(halo, fuerza, tono, peso=UNO * 2 // 3, color=UNO // 2)
            elif muro in ('izquierda', 'derecha') and (S.izq if muro == 'izquierda' else S.der):
                sentido = HAZ_LADO[0] if muro == 'izquierda' else -HAZ_LADO[0]
                tapada = _sombra(S, cuerpos, sentido, HAZ_LADO[1], [c['alto'] * 3 // 4 for c in cuerpos])
                sumar(_a_la_sombra(_haz_lado(S, muro, g.SEAM + pz['pos'], ficha['ancho']), tapada), fuerza, tono)
            continue
        if 'x' in pz:
            x, y = pz['x'], pz['y']
        elif muro == 'fondo':
            x, y = S.xl + pz['pos'], g.SEAM + (120 if luz['forma'] == 'tubo' else 64)
        else:
            continue
        rx, ry = luz['radio']
        pozo = _pozo(S, x, y, rx, ry)
        if luz['forma'] == 'pozo':
            pozo = _a_la_sombra(pozo, _sombra_de_lampara(S, cuerpos, x, y, luz.get('altura', 150) + pz.get('sobre', 0)))
        sumar(pozo, fuerza, tono, color=UNO * 9 // 10)
        if luz['forma'] == 'tubo':
            ancho = np.clip(UNO - np.abs(S.xs - x) * UNO // 190, 0, UNO) * S.muro
            sumar(ancho, fuerza, tono, peso=UNO * 8 // 10, color=UNO // 2)
        else:
            sumar(_halo_muro(S, x, g.SEAM - 36, 96), fuerza, tono, peso=UNO // 2, color=UNO * 4 // 10)
    for puerta in sala.get('puertas', []):
        # La puerta abierta deja caer en el piso una cuña de la luz de la sala vecina.
        if puerta['id'] not in abiertas or puerta.get('muro') != 'fondo':
            continue
        medio = pp.MODELOS[puerta['modelo']]['ancho'] // 2 - 6 + S.n * 30 // 100
        dentro = np.minimum(medio - np.abs(S.xs - (S.xl + puerta['pos']) - S.n * 12 // 100), 54 - S.n)
        cuna = np.clip(dentro * 64, 0, UNO) * S.piso
        sumar(cuna, 100, 'calido', peso=UNO * 2 // 3 if momento == 'dia' else UNO * 4 // 10, color=UNO * 4 // 10)

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
    for tono in ('calido', 'frio'):
        a = tonos[tono] * 3
        escalones.append(np.clip(a // UNO + ((a % UNO) * 16 > umbral * UNO), 0, 3))
    return nivel, escalones[0], escalones[1]


def calcular_luz(sala, momento=None, abiertas=(), cuerpos=()):
    """(ambiente RGB para multiplicar, brillo RGB para sumar)."""
    nivel, calido, frio = niveles(sala, momento, abiertas, cuerpos)
    ambiente = TABLA_AMBIENTE[nivel]
    brillo = np.clip(TABLA_CALIDA[calido] + TABLA_FRIA[frio], 0, 255).astype(np.uint8)
    return Image.fromarray(ambiente, 'RGB'), Image.fromarray(brillo, 'RGB')
