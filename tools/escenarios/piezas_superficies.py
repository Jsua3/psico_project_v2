"""Pisos y muros maestros de las «salas por piezas».

- `piso_maestro(tipo, variante)`: 1920 × 298, con el punto de fuga en su centro. El piso de una sala de
  cualquier ancho es su recorte central (`piso(tipo, variante, ancho)`): nada se repite.
- `muro_maestro(acabado, paleta)`: 1920 × 152 (6 px de canto del muro cortado y 146 de muro). El muro del
  fondo de una sala es un recorte (`muro_fondo(acabado, paleta, encuadre, ancho)`).
- `muro_lado(acabado, paleta, ancho, lado)`: el muro lateral en perspectiva, uno por ancho de sala, con el
  vacío de afuera incluido. El derecho es el espejo del izquierdo, un punto más oscuro.
- `tapete(d, ancho, bx0, bx1, y0, y1)`: tapete en perspectiva sobre el piso.

    python tools/escenarios/piezas_superficies.py   # escribe maqueta-visual/piezas/superficies.png
"""
import functools
import importlib
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageOps

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import piezas_geo as g  # noqa: E402

M = 1920                    # ancho de las maestras
CENTRO = M // 2
ALTO_MAESTRA_MURO = g.ALTO_MURO + 6
MAX_COLORES = 40
CLARO = (255, 240, 210)
VACIO = (14, 16, 22)

PISOS = {
    'madera': {'a': dict(A=(160, 118, 82), B=(148, 106, 72), C=(138, 98, 66), junta=(104, 70, 48)),
               'b': dict(A=(126, 94, 74), B=(116, 86, 68), C=(106, 78, 62), junta=(74, 54, 46))},
    'baldosa': {'a': dict(A=(162, 112, 80), B=(150, 102, 72), C=(156, 108, 76), junta=(112, 76, 54)),
                'b': dict(A=(150, 150, 144), B=(140, 140, 136), C=(146, 146, 140), junta=(104, 104, 104))},
    'damero': {'a': dict(A=(188, 182, 162), B=(110, 130, 124), C=(188, 182, 162), junta=(96, 104, 100)),
               'b': dict(A=(182, 176, 166), B=(96, 92, 100), C=(182, 176, 166), junta=(80, 78, 86))},
    'adoquin': {'a': dict(A=(130, 126, 122), B=(118, 114, 112), C=(106, 104, 104), junta=(80, 78, 80)),
                'b': dict(A=(152, 118, 92), B=(140, 106, 84), C=(126, 96, 76), junta=(94, 70, 56))},
    'vinilo': {'a': dict(A=(142, 160, 160), B=(132, 150, 152), C=(156, 172, 170), junta=(114, 132, 136), guia=((78, 142, 128), (80, 112, 156))),
               'b': dict(A=(174, 164, 146), B=(164, 154, 138), C=(186, 176, 158), junta=(142, 132, 118), guia=((150, 112, 98), (100, 134, 126)))},
    'cemento': {'a': dict(A=(138, 136, 132), B=(130, 128, 126), C=(122, 120, 118), junta=(96, 94, 94)),
                'b': dict(A=(108, 110, 118), B=(100, 102, 110), C=(94, 96, 104), junta=(72, 74, 82))},
}
NOMBRE_PISO = {'madera': 'Madera', 'baldosa': 'Baldosa', 'damero': 'Damero', 'adoquin': 'Adoquín',
               'vinilo': 'Vinilo de hospital', 'cemento': 'Cemento'}

# Paletas de muro por lugar. `baja` es el tono de la parte baja (zócalo alto, azulejo, paneles).
PALETAS = {
    'casa': dict(pared=(130, 110, 82), lado=(110, 92, 68), canto=(172, 150, 118), baja=(124, 92, 66), moldura=(150, 116, 84),
                 zocalo=(70, 50, 38), azulejo=((176, 186, 176), (134, 146, 138)), acento=(96, 132, 124),
                 ladrillo=((150, 92, 72), (138, 82, 66), (120, 74, 60)), mortero=(104, 88, 76), papel=True),
    'universidad': dict(pared=(104, 122, 118), lado=(88, 104, 102), canto=(160, 174, 168), baja=(92, 106, 110), moldura=(138, 150, 146),
                        zocalo=(54, 64, 68), azulejo=((170, 182, 178), (126, 140, 138)), acento=(84, 112, 150),
                        ladrillo=((146, 100, 80), (134, 90, 74), (118, 80, 66)), mortero=(110, 100, 92), papel=False),
    'comisaria': dict(pared=(108, 118, 136), lado=(90, 100, 116), canto=(164, 172, 184), baja=(86, 96, 116), moldura=(140, 148, 162),
                      zocalo=(52, 58, 72), azulejo=((172, 178, 186), (128, 136, 148)), acento=(96, 126, 104),
                      ladrillo=((138, 104, 92), (126, 94, 84), (112, 84, 76)), mortero=(108, 102, 100), papel=False),
    'hospital': dict(pared=(118, 144, 146), lado=(98, 122, 126), canto=(176, 192, 190), baja=(88, 120, 126), moldura=(184, 194, 192),
                     zocalo=(56, 76, 84), azulejo=((182, 196, 194), (134, 154, 156)), acento=(84, 150, 132),
                     ladrillo=((150, 128, 116), (138, 118, 108), (124, 106, 98)), mortero=(116, 112, 108), papel=False),
}
ACABADOS = ('pintura', 'zocalo-alto', 'azulejo', 'ladrillo', 'paneles')
NOMBRE_ACABADO = {'pintura': 'Pintura', 'zocalo-alto': 'Zócalo alto', 'azulejo': 'Azulejo', 'ladrillo': 'Ladrillo', 'paneles': 'Paneles'}
ALTO_BAJA = {'pintura': 0, 'zocalo-alto': 40, 'azulejo': 54, 'ladrillo': 0, 'paneles': 60}


def mezcla(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def osc(c, f=0.8):
    return tuple(int(v * f) for v in c)


def azar(*claves):
    """Entero estable a partir de las claves: el arte sale igual en cada corrida."""
    x = 2166136261
    for v in claves:
        x = ((x ^ (int(v) & 0xFFFFFFFF)) * 16777619) & 0xFFFFFFFF
    x ^= x >> 13
    x = (x * 0x5BD1E995) & 0xFFFFFFFF
    return x ^ (x >> 15)


def _limitar(im, maximo=MAX_COLORES):
    arr = np.array(im.convert('RGB'))
    return Image.fromarray(g.limitar_colores(arr, np.ones(arr.shape[:2], bool), maximo), 'RGB')


# ── pisos ──────────────────────────────────────────────────────────────────────

def _x(bx, y):
    """x en la maestra, a la profundidad y (0 = pie del muro del fondo), de la línea que nace en bx."""
    return CENTRO + (bx - CENTRO) * (1 + g.K * y / g.FONDO)


def _filas(alto_base):
    y, i = 0, 0
    while y < g.FONDO:
        h = alto_base + 2 * i
        yield y, min(y + h, g.FONDO), h, i
        y, i = y + h, i + 1


def _madera(d, p, s):
    A, B, C, junta = p['A'], p['B'], p['C'], p['junta']
    tonos = [mezcla(A, CLARO, 0.10), A, B, C, osc(C, 0.95)]
    filo, veta = mezcla(A, CLARO, 0.26), mezcla(C, junta, 0.5)
    for y, y2, h, i in _filas(10):
        bx, j = -700 + azar(i, s) % 150, 0
        while bx < M + 700:
            k = azar(i, j, 11 + s)
            largo = 112 + (k >> 20) % 5 * 22
            xa, xb, xa2, xb2 = _x(bx, y), _x(bx + largo, y), _x(bx, y2), _x(bx + largo, y2)
            d.polygon([(xa, y), (xb, y), (xb2, y2), (xa2, y2)], fill=tonos[(1, 1, 2, 2, 3, 0, 1, 1, 2, 3, 2, 4, 1, 2, 0, 2)[k % 16]])
            if k % 3 != 1:
                d.line([(xa + 2, y), (xb - 2, y)], fill=filo)
            if h >= 14:
                for n in range(2 + k % 2):
                    kk = azar(i, j, 31 + n + s)
                    vy = y + 3 + kk % max(1, h - 6)
                    vx = xa + 6 + (kk >> 8) % int(max(8, xb - xa - 44))
                    d.line([(vx, vy), (min(vx + 10 + (kk >> 16) % 26, xb - 4), vy)], fill=veta)
                if k % 7 == 0:
                    nx, ny = xa + 14 + (k >> 6) % int(max(8, xb - xa - 30)), y + h // 2
                    d.ellipse([nx - 2, ny - 1, nx + 2, ny + 1], fill=junta)
                    d.point((nx, ny), fill=veta)
            d.line([(xa, y), (xa2, y2)], fill=junta)
            bx, j = bx + largo, j + 1
        d.line([(0, y2 - 1), (M, y2 - 1)], fill=junta)


def _losas(d, p, s, tipo):
    """Baldosa, damero y adoquín: cada pieza con un tono propio, junta de un píxel, filo de luz y motas."""
    A, B, C, junta = p['A'], p['B'], p['C'], p['junta']
    col = {'damero': 48, 'baldosa': 64, 'adoquin': 40}[tipo]
    for y, y2, h, i in _filas(14):
        desfase = col // 2 if (tipo == 'adoquin' and i % 2) else 0
        for j, bx in enumerate(range(-720 + desfase, M + 720, col)):
            k = azar(i, j, 5 + s)
            base = (A, B, C)[(i * 2 + j + k % 2) % 3] if tipo == 'adoquin' else (A if (i + j) % 2 == 0 else B)
            tono = (base, base, base, mezcla(base, CLARO, 0.07), osc(base, 0.95), base, osc(base, 0.97))[k % 7]
            xa, xb, xa2, xb2 = _x(bx, y), _x(bx + col, y), _x(bx, y2), _x(bx + col, y2)
            d.polygon([(xa, y), (xb, y), (xb2, y2), (xa2, y2)], fill=tono)
            if tipo != 'damero':
                if k % 4 == 0:
                    d.line([(xa + 2, y), (xb - 2, y)], fill=mezcla(base, CLARO, 0.16))
                d.line([(xa, y), (xa2, y2)], fill=junta)
            if h >= 18 and tipo != 'adoquin':
                for n in range(k % 3):
                    kk = azar(i, j, 71 + n + s)
                    d.point((xa + 4 + kk % int(max(4, xb - xa - 8)), y + 3 + (kk >> 9) % (h - 6)), fill=osc(base, 0.88))
            if tipo == 'adoquin' and k % 9 == 0:
                d.rectangle([xa + 5, y + 3, xa + 8, y + 4], fill=osc(base, 0.84))
            if tipo == 'baldosa' and k % 23 == 0 and h >= 20:      # una esquina desportillada de vez en cuando
                d.polygon([(xb - 1, y2 - 2), (xb - 7, y2 - 2), (xb - 1, y2 - 7)], fill=junta)
        if tipo != 'damero':
            d.line([(0, y2 - 1), (M, y2 - 1)], fill=junta)


def _motas(d, p, s, paso=10, tonos=None):
    tonos = tonos or (p['B'], p['C'], p['B'])
    for y, y2, h, i in _filas(8):
        for j, x in enumerate(range(0, M, paso)):
            k = azar(i, j, 3 + s)
            if k % 3 == 0:
                d.point((x + (k >> 4) % paso, y + (k >> 9) % max(1, y2 - y)), fill=tonos[(k >> 14) % 3])


def _vinilo(d, p, s):
    """Vinilo en rollos: liso, moteado, con el brillo del encerado y una soldadura cada 240 px."""
    d.rectangle([0, 0, M, g.FONDO], fill=p['A'])
    _motas(d, p, s, paso=9)
    for y, y2, h, i in _filas(12):                       # brillos cortos del encerado
        for j, x in enumerate(range(-40, M, 96)):
            k = azar(i, j, 17 + s)
            if k % 5 == 0:
                x0 = x + (k >> 5) % 80
                d.line([(x0, y + (k >> 12) % max(1, h)), (x0 + 8 + (k >> 16) % 22, y + (k >> 12) % max(1, h))], fill=p['C'])
    for bx in range(-720, M + 720, 240):
        d.line([(_x(bx, 0), 0), (_x(bx, g.FONDO), g.FONDO)], fill=p['junta'])
    # Líneas de orientación incrustadas en el piso, como las que guían por un hospital: corren paralelas al muro del fondo.
    for y0, alto, tinta in (((92, 6, p['guia'][0]), (101, 3, p['guia'][1])) if p.get('guia') else ()):
        d.rectangle([0, y0, M, y0 + alto - 1], fill=tinta)
        d.line([(0, y0), (M, y0)], fill=mezcla(tinta, (255, 255, 255), 0.22))


def _cemento(d, p, s):
    """Placas de cemento con juntas de dilatación, manchas, grietas y poros."""
    A, B, C, junta = p['A'], p['B'], p['C'], p['junta']
    cortes = (0, 62, 148, g.FONDO)
    for f in range(3):
        for j, bx in enumerate(range(-960, M + 960, 320)):
            k = azar(f, j, 9 + s)
            y, y2 = cortes[f], cortes[f + 1]
            d.polygon([(_x(bx, y), y), (_x(bx + 320, y), y), (_x(bx + 320, y2), y2), (_x(bx, y2), y2)], fill=(A, A, B, A, C, B)[k % 6])
    for n in range(70):                                   # manchas: racimos de trazos cortos
        k = azar(n, 41 + s)
        cx, cy, tono = k % M, 6 + (k >> 11) % (g.FONDO - 12), osc(A, 0.93 if n % 3 else 0.9)
        for m in range(5 + (k >> 20) % 7):
            kk = azar(n, m, 43 + s)
            dx, dy = (kk % 37) - 18, ((kk >> 6) % 11) - 5
            d.rectangle([cx + dx, cy + dy, cx + dx + 3 + (kk >> 10) % 8, cy + dy + (kk >> 14) % 2], fill=tono)
    _motas(d, p, s, paso=13, tonos=(osc(A, 0.9), mezcla(A, CLARO, 0.1), osc(A, 0.86)))
    for n in range(9):                                    # grietas
        k = azar(n, 59 + s)
        x, y, sentido = 60 + k % (M - 120), 10 + (k >> 11) % (g.FONDO - 30), 1 if k & 1 else -1
        for m in range(10 + (k >> 20) % 14):
            kk = azar(n, m, 61 + s)
            nx, ny = x + sentido * (2 + kk % 4), y + ((kk >> 3) % 3) - 1 + (1 if kk % 5 == 0 else 0)
            d.line([(x, y), (nx, ny)], fill=junta)
            x, y = nx, ny
    for f in range(1, 3):
        d.line([(0, cortes[f]), (M, cortes[f])], fill=junta)
        d.line([(0, cortes[f] + 1), (M, cortes[f] + 1)], fill=mezcla(A, CLARO, 0.12))
    for bx in range(-960, M + 960, 320):
        d.line([(_x(bx, 0), 0), (_x(bx, g.FONDO), g.FONDO)], fill=junta)


@functools.lru_cache(maxsize=None)
def piso_maestro(tipo, variante='a'):
    if tipo not in PISOS or variante not in PISOS[tipo]:
        raise KeyError(f'piso {tipo!r} variante {variante!r} fuera del catálogo')
    p = PISOS[tipo][variante]
    im = Image.new('RGB', (M, g.FONDO), p['A'])
    d = ImageDraw.Draw(im)
    s = {'a': 0, 'b': 7}.get(variante, 3 + sum(map(ord, variante)) % 89)     # cada variante, su propio azar
    if tipo == 'madera':
        _madera(d, p, s)
    elif tipo == 'vinilo':
        _vinilo(d, p, s)
    elif tipo == 'cemento':
        _cemento(d, p, s)
    else:
        _losas(d, p, s, tipo)
    d.rectangle([0, 0, M, 2], fill=osc(p['A'], 0.6))        # sombra al pie del muro del fondo
    return _limitar(im)


def recorte(ancho):
    """(x0, x1) del recorte central de una maestra para una sala de ese ancho."""
    g.comprobar_ancho(ancho)
    return CENTRO - ancho // 2, CENTRO + ancho // 2


def piso(tipo, variante='a', ancho=960):
    x0, x1 = recorte(ancho)
    return piso_maestro(tipo, variante).crop((x0, 0, x1, g.FONDO))


def tapete(d, ancho, bx0, bx1, ya, yb, c=None):
    """Tapete en perspectiva: flecos en los extremos, cenefa, rombos y medallón. Coordenadas de sala."""
    c = c or dict(oscuro=(84, 40, 40), borde=(112, 52, 48), ribete=(214, 190, 140), campo=(146, 72, 60), motivo=(206, 150, 96))
    c = {k: tuple(v) for k, v in c.items()}            # del JSON llegan como listas
    e = lambda bx, y: g.esp(ancho, bx, y)  # noqa: E731

    def cuadro(m, tinta):
        d.polygon([(e(bx0 + m, ya + m), ya + m), (e(bx1 - m, ya + m), ya + m), (e(bx1 - m, yb - m), yb - m), (e(bx0 + m, yb - m), yb - m)], fill=tinta)
    for y in range(ya + 1, yb, 3):
        d.line([(e(bx0, y) - 4, y), (e(bx0, y), y)], fill=c['ribete'])
        d.line([(e(bx1, y), y), (e(bx1, y) + 4, y)], fill=c['ribete'])
    for m, nombre in ((0, 'oscuro'), (1, 'borde'), (6, 'ribete'), (7, 'campo')):
        cuadro(m, c[nombre])
    for bx in range(bx0 + 10, bx1 - 8, 8):
        for yy in (ya + 3, yb - 4):
            x = e(bx, yy)
            d.rectangle([x, yy, x + 1, yy + 1], fill=c['motivo'])
    for fila, cy in enumerate(range(ya + 18, yb - 12, 14)):
        for bx in range(bx0 + 24 + (fila % 2) * 12, bx1 - 18, 24):
            cx = e(bx, cy)
            d.polygon([(cx, cy - 4), (cx + 5, cy), (cx, cy + 4), (cx - 5, cy)], fill=c['motivo'])
            d.point((cx, cy), fill=c['borde'])
    my = (ya + yb) // 2
    mx = e((bx0 + bx1) / 2, my)
    for rx, ry, nombre in ((30, 13, 'ribete'), (22, 9, 'borde'), (10, 4, 'motivo')):
        d.polygon([(mx, my - ry), (mx + rx, my), (mx, my + ry), (mx - rx, my)], fill=c[nombre])


def tapete_imagen(ancho, caja, colores=None):
    """El tapete como lo carga el juego: (imagen RGBA recortada, x, y de su esquina en la sala). Alfa binario."""
    lienzo = Image.new('RGBA', (ancho, g.ALTO), (0, 0, 0, 0))
    tapete(ImageDraw.Draw(lienzo), ancho, *caja, colores)
    x0, y0, x1, y1 = lienzo.getbbox()
    return lienzo.crop((x0, y0, x1, y1)), x0, y0


def tapete_ficha(lugar, sala, n, ancho, caja, colores=None):
    """La entrada de `estructura.tapetes`: la caja y los colores con que se dibuja, y la imagen ya hecha con su sitio."""
    _, x, y = tapete_imagen(ancho, caja, colores)
    ficha = dict(caja=list(caja), ruta=f'piezas/tapetes/{lugar}-{sala}-{n}.png', x=x, y=y)
    if colores:
        ficha['colores'] = colores
    return ficha


def imagenes_de_tapetes(lugar):
    """{ruta: imagen} de todos los tapetes de un lugar en esquema 3."""
    return {t['ruta']: tapete_imagen(s['estructura']['ancho'], t['caja'], t.get('colores'))[0]
            for s in lugar['salas'] for t in s['estructura'].get('tapetes', [])}


# ── muro del fondo ─────────────────────────────────────────────────────────────

def _baja_tablas(d, P, y0, y1):
    base = P['baja']
    d.rectangle([0, y0, M, y1], fill=base)
    for n, x in enumerate(range(0, M, 26)):
        k = azar(n, 23)
        if k % 5 == 0:
            d.rectangle([x + 2, y0, x + 25, y1], fill=osc(base, 0.96))
        elif k % 7 == 0:
            d.rectangle([x + 2, y0, x + 25, y1], fill=mezcla(base, CLARO, 0.05))
        d.line([(x, y0), (x, y1)], fill=osc(base, 0.80))
        d.line([(x + 1, y0), (x + 1, y1)], fill=mezcla(base, (255, 240, 214), 0.14))
        if k % 9 == 0:
            d.point((x + 8 + (k >> 5) % 12, y0 + 6 + (k >> 9) % max(1, y1 - y0 - 14)), fill=osc(base, 0.78))


def _baja_azulejo(d, P, y0, y1):
    loza, junta = P['azulejo']
    d.rectangle([0, y0, M, y1], fill=loza)
    for f, y in enumerate(range(y1, y0, -12)):
        for n, x in enumerate(range(-(f % 2) * 9, M, 18)):
            k = azar(f, n, 29)
            arriba = max(y - 11, y0 + 5)                  # la hilada de arriba queda cortada por el listelo
            if k % 6 == 0 and arriba < y:
                d.rectangle([x + 1, arriba, x + 17, y - 1], fill=osc(loza, 0.95))
            elif k % 11 == 0 and arriba < y:
                d.rectangle([x + 1, arriba, x + 17, y - 1], fill=mezcla(loza, (255, 255, 255), 0.12))
            if k % 4 == 1 and y - 10 >= y0 + 5:
                d.line([(x + 2, y - 10), (x + 6, y - 10)], fill=mezcla(loza, (255, 255, 255), 0.3))
            d.line([(x, max(y - 12, y0)), (x, y)], fill=junta)
        d.line([(0, y), (M, y)], fill=junta)
    d.rectangle([0, y0, M, y0 + 4], fill=P['acento'])                    # listelo de remate
    d.line([(0, y0), (M, y0)], fill=mezcla(P['acento'], (255, 255, 255), 0.3))
    d.line([(0, y0 + 4), (M, y0 + 4)], fill=osc(P['acento'], 0.7))


def _baja_paneles(d, P, y0, y1):
    base = P['baja']
    d.rectangle([0, y0, M, y1], fill=base)
    for n, x in enumerate(range(6, M, 56)):
        k = azar(n, 37)
        a, b, c, e = x, y0 + 9, x + 46, y1 - 12
        tablero = tuple(P['panel']) if P.get('panel') else osc(base, 0.93)
        d.rectangle([a, b, c, e], fill=tablero if k % 4 else osc(tablero, 0.96))
        d.line([(a, b), (c, b)], fill=osc(base, 0.72))
        d.line([(a, b), (a, e)], fill=osc(base, 0.72))
        d.line([(a, e), (c, e)], fill=mezcla(base, (255, 240, 214), 0.18))
        d.line([(c, b), (c, e)], fill=mezcla(base, (255, 240, 214), 0.18))


def _ladrillo(d, P, y0, y1):
    tonos, mortero = P['ladrillo'], P['mortero']
    d.rectangle([0, y0, M, y1], fill=mortero)
    for f, y in enumerate(range(y1 - 9, y0 - 10, -10)):
        for n, x in enumerate(range(-(f % 2) * 20, M, 40)):
            k = azar(f, n, 53)
            tono = (tonos[0], tonos[1], tonos[0], tonos[1], tonos[2], tonos[0], mezcla(tonos[0], CLARO, 0.08))[k % 7]
            d.rectangle([x, y, x + 36, y + 7], fill=tono)
            d.line([(x, y), (x + 36, y)], fill=mezcla(tono, CLARO, 0.14))
            d.line([(x, y + 7), (x + 36, y + 7)], fill=osc(tono, 0.86))
            if k % 13 == 0:
                d.rectangle([x + 6 + (k >> 5) % 20, y + 2, x + 9 + (k >> 5) % 20, y + 4], fill=osc(tono, 0.82))


def _pintura(d, P, y0, y1):
    """Pintura lisa con las huellas del uso; en la casa, papel con florecitas."""
    pared = P['pared']
    if P.get('pared_alta'):
        d.rectangle([0, y0, M, y0 + P['pared_alta'][0]], fill=tuple(P['pared_alta'][1]))
    if P.get('vetas'):
        for x in range(40, M, 80):
            d.rectangle([x, y0 + 10, x + 1, y1 - 20], fill=osc(pared, 0.9))
    if P.get('papel'):
        flor = mezcla(pared, (255, 244, 220), 0.10)
        for fila, gy in enumerate(range(y0 + 34, y1 - 10, 16)):
            for gx in range(12 + (fila % 2) * 12, M - 8, 24):
                d.line([(gx - 1, gy), (gx + 1, gy)], fill=flor)
                d.line([(gx, gy - 1), (gx, gy + 1)], fill=flor)
    else:
        for n in range(260):
            k = azar(n, 67)
            x, y = k % M, y0 + 28 + (k >> 11) % max(1, y1 - y0 - 34)
            d.line([(x, y), (x + 1 + (k >> 20) % 3, y)], fill=osc(pared, 0.955) if k % 3 else mezcla(pared, CLARO, 0.06))


@functools.lru_cache(maxsize=None)
def muro_maestro(acabado, paleta):
    if acabado not in ACABADOS or paleta not in PALETAS:
        raise KeyError(f'muro {acabado!r} con paleta {paleta!r} fuera del catálogo')
    P = PALETAS[paleta]
    alto = ALTO_MAESTRA_MURO
    tope, pie = 6, alto                     # y local del borde superior del muro y de la línea del piso
    im = Image.new('RGB', (M, alto), P['pared'])
    d = ImageDraw.Draw(im)
    baja = ALTO_BAJA[acabado]
    if acabado == 'ladrillo':
        _ladrillo(d, P, tope, pie - 1)
    else:
        _pintura(d, P, tope, pie - baja - 1)
        if baja:
            y0 = pie - baja
            {'zocalo-alto': _baja_tablas, 'azulejo': _baja_azulejo, 'paneles': _baja_paneles}[acabado](d, P, y0, pie - 1)
            if acabado != 'azulejo':
                d.rectangle([0, y0 - 3, M, y0 + 1], fill=P['moldura'])
                d.line([(0, y0 - 3), (M, y0 - 3)], fill=mezcla(P['moldura'], (255, 244, 224), 0.3))
                d.line([(0, y0 + 1), (M, y0 + 1)], fill=osc(P['moldura'], 0.74))
    if P.get('franja'):                      # franja de color de la sala, a la altura que tenía
        yf = P['franja'][0] - (g.TOP - 6)
        d.rectangle([0, yf, M, yf + 8], fill=tuple(P['franja'][1]))
    # Sombra bajo el techo: 6 px densos, 14 de media sombra y 6 de tramado (damero) que la disuelven.
    arr = np.array(im).astype(np.int32)
    ys, xs = np.mgrid[0:alto, 0:M]
    arr[(ys >= tope) & (ys < tope + 6)] = arr[(ys >= tope) & (ys < tope + 6)] * 72 // 100
    media = ((ys >= tope + 6) & (ys < tope + 20)) | ((ys >= tope + 20) & (ys < tope + 26) & ((xs + ys) % 2 == 0))
    arr[media] = arr[media] * 88 // 100
    im = Image.fromarray(arr.astype(np.uint8), 'RGB')
    d = ImageDraw.Draw(im)
    d.rectangle([0, pie - 7, M, pie - 1], fill=P['zocalo'])
    d.line([(0, pie - 7), (M, pie - 7)], fill=mezcla(P['zocalo'], (255, 235, 205), 0.24))
    d.rectangle([0, 0, M, tope - 1], fill=P['canto'])
    d.line([(0, 0), (M, 0)], fill=mezcla(P['canto'], (255, 255, 255), 0.18))
    d.line([(0, tope - 1), (M, tope - 1)], fill=osc(P['canto'], 0.78))
    return _limitar(im)


def muro_fondo(acabado, paleta, encuadre, ancho):
    """(imagen, x) del muro del fondo de una sala: el recorte de la maestra y dónde se pega (y = TOP − 6)."""
    xl, xr = g.limites(encuadre, ancho)
    x0, _ = recorte(ancho)
    return muro_maestro(acabado, paleta).crop((x0 + xl, 0, x0 + xr, ALTO_MAESTRA_MURO)), xl


# ── muro lateral ───────────────────────────────────────────────────────────────

@functools.lru_cache(maxsize=None)
def muro_lado(acabado, paleta, ancho, lado='izquierda'):
    """Muro lateral de una sala de ese ancho: RGBA de borde(ancho) × 528 que se pega en x = 0 (o ancho − borde)."""
    if acabado not in ACABADOS or paleta not in PALETAS:
        raise KeyError(f'muro {acabado!r} con paleta {paleta!r} fuera del catálogo')
    P, b = PALETAS[paleta], g.borde(ancho)
    f = 1.0 if lado == 'izquierda' else 0.9          # el muro derecho queda a contraluz
    L = lambda c: osc(c, f * P['lado'][0] / P['pared'][0])  # noqa: E731  tono del muro lateral a partir del del fondo
    im = Image.new('RGBA', (b, g.ALTO), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    tope_camara = g.tope_lado(g.ALTO)
    d.polygon([(0, 0), (b, 0), (b, g.TOP), (g.MARGEN, tope_camara), (g.MARGEN, g.ALTO), (0, g.ALTO)], fill=VACIO + (255,))
    pl = g.Lado(d, b, g.SEAM, ancho, g.FONDO)
    alto, largo, baja = g.ALTO_MURO, g.FONDO, ALTO_BAJA[acabado]
    pl.q(0, 0, largo, alto, L(P['pared']))
    if acabado == 'ladrillo':
        pl.q(0, 0, largo, alto, L(P['mortero']))
        for k, v in enumerate(range(0, alto - 6, 10)):
            pl.q(0, v + 1, largo, v + 8, L(P['ladrillo'][k % 2]))
            for u in range((k % 2) * 20, largo, 40):
                pl.q(u, v + 1, u + 2, v + 8, L(P['mortero']))
    elif baja:
        pl.q(0, 0, largo, baja, L(P['baja']))
        if acabado == 'zocalo-alto':
            for u in range(8, largo, 26):
                pl.q(u, 7, u + 1, baja - 2, L(osc(P['baja'], 0.80)))
        elif acabado == 'azulejo':
            pl.q(0, 0, largo, baja, L(P['azulejo'][0]))
            for v in range(0, baja, 12):
                pl.q(0, v, largo, v + 1, L(P['azulejo'][1]))
            for u in range(6, largo, 18):
                pl.q(u, 0, u + 1, baja, L(P['azulejo'][1]))
            pl.q(0, baja - 4, largo, baja, L(P['acento']))
        elif acabado == 'paneles':
            for u in range(6, largo - 40, 56):
                pl.q(u, 12, u + 46, baja - 9, L(osc(P['baja'], 0.9)))
        if acabado != 'azulejo':
            pl.q(0, baja - 1, largo, baja + 3, L(P['moldura']))
    if P.get('pared_alta'):
        pl.q(0, alto - P['pared_alta'][0], largo, alto, L(P['pared_alta'][1]))
    if P.get('franja'):
        v = g.SEAM - P['franja'][0] - 8
        pl.q(0, v, largo, v + 8, L(P['franja'][1]))
    pl.q(0, alto - 20, largo, alto, L(osc(P['pared'], 0.88)) if acabado != 'ladrillo' else L(osc(P['mortero'], 0.8)))
    pl.q(0, alto - 6, largo, alto, L(osc(P['pared'], 0.72)))
    pl.q(0, 0, 8, alto, L(osc(P['pared'], 0.85)))             # rincón con el muro del fondo
    pl.q(0, 0, largo, 7, L(P['zocalo']))
    pl.q(0, 6, largo, 7, L(mezcla(P['zocalo'], (255, 235, 205), 0.24)))
    pl.q(0, alto, largo, alto + 6, P['canto'] if lado == 'izquierda' else osc(P['canto'], 0.92))
    d.polygon([(0, g.ALTO - 1), (g.MARGEN, g.ALTO - 1), (g.MARGEN, tope_camara - 8), (0, tope_camara - 8)], fill=VACIO + (255,))
    return im if lado == 'izquierda' else ImageOps.mirror(im)


# ── la paleta propia de cada sala de la biblioteca ─────────────────────────────

PALETAS_BASE = tuple(PALETAS)
LUGARES_CON_ARTE = {'universidad': 'arte_universidad', 'casa': 'arte_casa', 'comisaria': 'arte_comisaria'}


def paleta_de_sala(lugar, p):
    """La paleta con que una sala de la biblioteca conserva su color: sale de su paleta de arte (`arte_<lugar>.SALAS`).
    Lleva además `acabado`, el del catálogo que le corresponde, y lo que la distinguía (franja, vetas, franja alta)."""
    base, pared = PALETAS[lugar], tuple(p['pared'])
    acabado = ('ladrillo' if p.get('ladrillo') else 'azulejo' if p.get('azulejo') else 'paneles' if p.get('paneles')
               else 'zocalo-alto' if p.get('baja') else 'pintura')
    baja = tuple(p['baja'][1]) if p.get('baja') else osc(pared, 0.9)
    # Una sala sin muros laterales no declara `lado` ni, a veces, `canto`: se deducen del muro del fondo.
    lado = tuple(p['lado']) if p.get('lado') else osc(pared, 0.85)
    canto = tuple(p['canto']) if p.get('canto') else mezcla(pared, (255, 255, 255), 0.3)
    zocalo = tuple(p['zocalo']) if p.get('zocalo') else osc(pared, 0.55)
    P = dict(acabado=acabado, pared=pared, lado=lado, canto=canto, zocalo=zocalo, baja=baja,
             moldura=tuple(p['moldura']) if p.get('moldura') else mezcla(baja, (255, 240, 214), 0.18),
             azulejo=(baja, tuple(p['azulejo'])) if p.get('azulejo') else base['azulejo'],
             acento=tuple(p['franja'][1]) if p.get('franja') else base['acento'],
             ladrillo=tuple(tuple(c) for c in p['ladrillo']) + (osc(p['ladrillo'][1], 0.86),) if p.get('ladrillo') else base['ladrillo'],
             mortero=pared if p.get('ladrillo') else base['mortero'],
             papel=lugar == 'casa' and not (p.get('ladrillo') or p.get('vetas') or p.get('cielo')))
    if p.get('franja'):
        P['franja'] = (p['franja'][0], tuple(p['franja'][1]))
    if p.get('pared_alta'):
        P['pared_alta'] = (p['pared_alta'][0], tuple(p['pared_alta'][1]))
    if p.get('vetas'):
        P['vetas'] = True
    if p.get('paneles'):
        P['panel'] = tuple(p['paneles'])
    return P


def _paletas_de_salas():
    extra = {}
    for lugar, modulo in LUGARES_CON_ARTE.items():
        for sala, p in importlib.import_module(modulo).SALAS.items():
            extra[f'{lugar}-{sala}'] = paleta_de_sala(lugar, p)
    return extra


PALETAS.update(_paletas_de_salas())


def _pisos_de_salas():
    """El piso de cada sala de la biblioteca como variante propia (`<lugar>-<sala>`) de su tipo, con sus colores.
    La alfombra, que no está en el catálogo, queda como vinilo liso del color de la alfombra."""
    for lugar, modulo in LUGARES_CON_ARTE.items():
        for sala, p in importlib.import_module(modulo).SALAS.items():
            A = tuple(p['pisoA'])
            if p['piso'] in PISOS:
                colores = dict(A=A, B=tuple(p.get('pisoB', A)), C=tuple(p.get('pisoC', A)), junta=tuple(p.get('junta', osc(A, 0.78))))
                PISOS[p['piso']][f'{lugar}-{sala}'] = colores
            else:
                PISOS['vinilo'][f'{lugar}-{sala}'] = dict(A=A, B=osc(A, 0.93), C=mezcla(A, CLARO, 0.06), junta=osc(A, 0.9))


VARIANTES_BASE = ('a', 'b')
_pisos_de_salas()


def muros_del_catalogo():
    """Los pares (acabado, paleta) que se exportan: las cuatro paletas de lugar en los cinco acabados, y la paleta
    propia de cada sala solo en su acabado."""
    return ([(a, n) for a in ACABADOS for n in PALETAS_BASE]
            + [(P['acabado'], n) for n, P in PALETAS.items() if n not in PALETAS_BASE])


# ── hoja de contacto ───────────────────────────────────────────────────────────

def hoja_de_contacto():
    """Los 12 pisos (recorte de 960 de cada maestra) y los muros de cada acabado en dos paletas."""
    papel, tinta = (24, 26, 34), (206, 200, 188)
    celdas = [(NOMBRE_PISO[t] + ' ' + v, piso(t, v, 960).crop((0, 0, 960, 200))) for t in PISOS for v in ('a', 'b')]
    for acabado in ACABADOS:
        for paleta in ('casa', 'hospital'):
            celdas.append((NOMBRE_ACABADO[acabado] + ' · ' + paleta, muro_maestro(acabado, paleta).crop((480, 0, 1440, ALTO_MAESTRA_MURO))))
    columnas = 2
    alto = sum(max(c.height for _, c in celdas[i:i + columnas]) + 30 for i in range(0, len(celdas), columnas)) + 8
    lienzo = Image.new('RGB', (columnas * 972 + 12, alto), papel)
    d = ImageDraw.Draw(lienzo)
    y = 6
    for i in range(0, len(celdas), columnas):
        fila = celdas[i:i + columnas]
        for n, (nombre, im) in enumerate(fila):
            d.text((8 + n * 972, y + 4), nombre, fill=tinta)
            lienzo.paste(im, (8 + n * 972, y + 22))
        y += max(c.height for _, c in fila) + 30
    return lienzo


if __name__ == '__main__':
    destino = os.path.join(RAIZ, 'maqueta-visual', 'piezas')
    os.makedirs(destino, exist_ok=True)
    hoja_de_contacto().save(os.path.join(destino, 'superficies.png'))
    for t in PISOS:
        print(t, [len(piso_maestro(t, v).getcolors(maxcolors=100000)) for v in ('a', 'b')])
    for a in ACABADOS:
        print(a, [len(muro_maestro(a, p).getcolors(maxcolors=100000)) for p in PALETAS])
