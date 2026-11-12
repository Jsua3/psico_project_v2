"""Maqueta visual (experimento del 2026-11-12): la sala de la casa, renovada.

No toca el arte validado de la biblioteca. Lee el escenario y el arte de hoy y escribe todo en
`maqueta-visual/` (raíz del repositorio):

- fondo-v2.png     fondo a densidad 1: tablas con variación, tapete, papel de pared y zócalo con relieve
- ambiente.png     mapa de luz que se MULTIPLICA: penumbra fría, luz de ventana, sombras de rincón y viñeta
- brillo.png       mapa de luz que se SUMA: el tono cálido de la ventana y de la lámpara
- brillo-tv.png    resplandor azul del televisor (parpadea en la página)
- emotes.png       6 globos de emoción de 16x16
- lampara-pie.png  mueble nuevo
- antes.png, despues.png, despues-cerca.png   la misma escena con el arte de hoy y con el nuevo
- maqueta.html     página jugable (canvas 2D) con todo incrustado

    python tools/escenarios/vivo.py
"""
import base64
import io
import json
import os
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import arte_comun as ac  # noqa: E402
import arte_casa  # noqa: E402

ANCHO, ALTO, SEAM = ac.ANCHO, ac.ALTO, ac.SEAM
LUGAR = os.path.join(RAIZ, 'biblioteca', 'escenarios', 'casa')
KIT = os.path.join(RAIZ, 'frontend', 'src', 'assets', 'characters', 'kit')
SALIDA = os.path.join(RAIZ, 'maqueta-visual')
SALA_ID = 'sala'
LAMPARA = (236, 326)        # punto de apoyo de la lámpara de pie, junto al sofá
TAPETE_CAJA = (236, 548, 318, 420)   # bx0, bx1, y0, y1 del tapete (en coordenadas del fondo)
MARCO = (48, 72, 24, 68)    # cuadro del kit: ancho, alto, pivote x, pivote y
VISTAS = ('down', 'left', 'right', 'up')


def azar(*claves):
    """Entero estable a partir de las claves: el arte sale igual en cada corrida."""
    x = 2166136261
    for v in claves:
        x = ((x ^ (int(v) & 0xFFFFFFFF)) * 16777619) & 0xFFFFFFFF
    x ^= x >> 13
    x = (x * 0x5BD1E995) & 0xFFFFFFFF
    return x ^ (x >> 15)


# ── fondo ──────────────────────────────────────────────────────────────────────

def piso_madera(d, p, x0=-300, x1=1260):
    """Tablas con cinco tonos repartidos al azar, vetas, nudos y un filo de luz en el canto."""
    if p['piso'] != 'madera':
        return PISO_DE_HOY(d, p, x0, x1)
    A, B = p['pisoA'], p['pisoB']
    C = p.get('pisoC', A)
    junta = p.get('junta', ac.osc(A, 0.78))
    tonos = [ac.mezcla(A, (255, 236, 200), 0.12), A, B, C, ac.osc(C, 0.90)]
    filo = ac.mezcla(A, (255, 240, 210), 0.26)
    veta = ac.mezcla(C, junta, 0.5)
    largo = 148
    y, i = SEAM, 0
    while y < ALTO:
        h = 10 + 2 * i
        y2 = min(y + h, ALTO)
        bx, j = -400 + (i * 61) % largo, 0
        while bx < ANCHO + 400:
            k = azar(i, j, 11)
            tono = tonos[(1, 1, 2, 2, 3, 0, 4, 1, 2, 3, 1, 2)[k % 12]]
            xa, xb = ac.esp(bx, y), ac.esp(bx + largo, y)
            xa2, xb2 = ac.esp(bx, y2), ac.esp(bx + largo, y2)
            d.polygon([(xa, y), (xb, y), (xb2, y2), (xa2, y2)], fill=tono)
            if k % 3 != 1:
                d.line([(xa + 2, y), (xb - 2, y)], fill=filo)
            if h >= 14:
                for n in range(2 + k % 2):
                    kk = azar(i, j, 31 + n)
                    vy = y + 3 + kk % max(1, h - 6)
                    vx = xa + 6 + (kk >> 8) % int(max(8, xb - xa - 44))
                    d.line([(vx, vy), (min(vx + 10 + (kk >> 16) % 26, xb - 4), vy)], fill=veta)
                if k % 7 == 0:
                    nx = xa + 14 + (k >> 6) % int(max(8, xb - xa - 30))
                    ny = y + h // 2
                    d.ellipse([nx - 2, ny - 1, nx + 2, ny + 1], fill=junta)
                    d.point((nx, ny), fill=veta)
            d.line([(xa, y), (xa2, y2)], fill=junta)
            bx += largo
            j += 1
        d.line([(0, y2 - 1), (ANCHO, y2 - 1)], fill=junta)
        y, i = y2, i + 1
    d.rectangle([0, SEAM, ANCHO, SEAM + 2], fill=ac.osc(A, 0.6))


TAPETE = dict(oscuro=(84, 40, 40), borde=(112, 52, 48), ribete=(214, 190, 140), campo=(146, 72, 60), motivo=(206, 150, 96))


def tapete(d, bx0, bx1, ya, yb, c=TAPETE):
    """Tapete en perspectiva: flecos en los extremos, cenefa, rombos y medallón."""
    def cuadro(m, color):
        d.polygon([(ac.esp(bx0 + m, ya + m), ya + m), (ac.esp(bx1 - m, ya + m), ya + m),
                   (ac.esp(bx1 - m, yb - m), yb - m), (ac.esp(bx0 + m, yb - m), yb - m)], fill=color)
    for y in range(ya + 1, yb, 3):
        d.line([(ac.esp(bx0, y) - 4, y), (ac.esp(bx0, y), y)], fill=c['ribete'])
        d.line([(ac.esp(bx1, y), y), (ac.esp(bx1, y) + 4, y)], fill=c['ribete'])
    cuadro(0, c['oscuro'])
    cuadro(1, c['borde'])
    cuadro(6, c['ribete'])
    cuadro(7, c['campo'])
    for bx in range(bx0 + 10, bx1 - 8, 8):
        for yy in (ya + 3, yb - 4):
            x = ac.esp(bx, yy)
            d.rectangle([x, yy, x + 1, yy + 1], fill=c['motivo'])
    for fila, cy in enumerate(range(ya + 18, yb - 12, 14)):
        for bx in range(bx0 + 24 + (fila % 2) * 12, bx1 - 18, 24):
            cx = ac.esp(bx, cy)
            d.polygon([(cx, cy - 4), (cx + 5, cy), (cx, cy + 4), (cx - 5, cy)], fill=c['motivo'])
            d.point((cx, cy), fill=c['borde'])
    my = (ya + yb) // 2
    mx = ac.esp((bx0 + bx1) / 2, my)
    for (rx, ry, color) in ((30, 13, c['ribete']), (22, 9, c['borde']), (10, 4, c['motivo'])):
        d.polygon([(mx, my - ry), (mx + rx, my), (mx, my + ry), (mx - rx, my)], fill=color)


def vestir_pared(im, p, xl, xr, top):
    """Relieve sobre los colores planos de la pared: papel con florecitas, sombra bajo el techo con tramado,
    sombra que arrojan ventanas, cuadros y repisas, tablas en la parte baja y filo de luz en el zócalo."""
    arr = np.array(im)
    ys, xs = np.mgrid[0:ALTO, 0:ANCHO]
    dentro = (xs >= xl) & (xs < xr) & (ys >= top) & (ys < SEAM)
    color = lambda c: np.array(c, dtype=np.uint8)  # noqa: E731
    es_pared = (arr == color(p['pared'])).all(-1) & dentro
    alto_baja = p['baja'][0] if p.get('baja') else 0

    flor = np.zeros((ALTO, ANCHO), bool)
    for fila, gy in enumerate(range(top + 34, SEAM - alto_baja - 10, 16)):
        for gx in range(xl + 12 + (fila % 2) * 12, xr - 8, 24):
            flor[gy, gx] = flor[gy - 1, gx] = flor[gy + 1, gx] = flor[gy, gx - 1] = flor[gy, gx + 1] = True
    banda = (ys < top + 20) | ((ys < top + 26) & ((xs + ys) % 2 == 0))
    cosa = dentro & ~es_pared & (ys > top + 8) & (ys < SEAM - alto_baja - 4)
    sombra = np.zeros_like(cosa)
    sombra[3:, 3:] = cosa[:-3, :-3]

    arr[es_pared & flor] = color(ac.mezcla(p['pared'], (255, 244, 220), 0.10))
    arr[es_pared & banda] = color(ac.osc(p['pared'], 0.88))
    arr[es_pared & sombra] = color(ac.osc(p['pared'], 0.76))
    if alto_baja:
        base = p['baja'][1]
        es_baja = (arr == color(base)).all(-1) & dentro & (ys >= SEAM - alto_baja + 5) & (ys < SEAM - 8)
        arr[es_baja & ((xs - xl) % 26 == 0)] = color(ac.osc(base, 0.80))
        arr[es_baja & ((xs - xl) % 26 == 1)] = color(ac.mezcla(base, (255, 240, 214), 0.14))
    es_zocalo = (arr == color(p['zocalo'])).all(-1) & dentro & (ys == SEAM - 7)
    arr[es_zocalo] = color(ac.mezcla(p['zocalo'], (255, 235, 205), 0.24))
    return Image.fromarray(arr, 'RGB')


def fondo_v2(sala, p):
    global PISO_DE_HOY
    PISO_DE_HOY = ac.piso

    def piso_y_tapete(d, pp, x0=-300, x1=1260):
        piso_madera(d, pp, x0, x1)
        tapete(d, *TAPETE_CAJA)

    ac.piso = piso_y_tapete
    try:
        im = ac.fondo_sala(sala, p, dibujar_propio=arte_casa.dibujar_propio, destinos=arte_casa.DESTINO_PUERTA)
    finally:
        ac.piso = PISO_DE_HOY
    enc = sala['encuadre']
    xl = 96 if enc in ('tres-paredes', 'dos-paredes-izquierda') else 0
    xr = 864 if enc in ('tres-paredes', 'dos-paredes-derecha') else ANCHO
    return vestir_pared(im, p, xl, xr, p.get('top', 84))


# ── luz ────────────────────────────────────────────────────────────────────────

BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=float) / 16.0
PENUMBRA, PASO, NIVELES = 0.79, 0.07, 8      # 0,44 … 1,00 en pasos de 0,07


def poligono_ventana(x, w, t0=0.015, t1=0.74):
    """Los cuatro vértices de la mancha de luz que una ventana del fondo echa sobre el piso."""
    def borde(t, bx, corrimiento):
        return 480 + (bx - 480) * (1 + 0.25 * t) + corrimiento * t
    pts = []
    for t in (t0, t1):
        y = SEAM + t * (ALTO - SEAM)
        pts.append(((borde(t, x - 8, 170), y), (borde(t, x + w + 8, 250), y)))
    return [pts[0][0], pts[0][1], pts[1][1], pts[1][0]]


def mapas_de_luz(p, sala, ventanas, lamparas):
    """(ambiente RGB para multiplicar, brillo RGB para sumar). Todo en escalones con tramado ordenado:
    la luz también es pixel art."""
    enc = sala['encuadre']
    top = p.get('top', 84)
    ys, xs = np.mgrid[0:ALTO, 0:ANCHO].astype(float)
    en_piso = ys >= SEAM
    t = np.clip((ys - SEAM) / (ALTO - SEAM), 0, 1)
    L = np.full((ALTO, ANCHO), PENUMBRA)
    calido = np.zeros((ALTO, ANCHO))

    for (x, y0, w, h) in ventanas:
        esc = 1 + 0.25 * t
        xi = 480 + (x - 8 - 480) * esc + 170 * t
        xd = 480 + (x + w + 8 - 480) * esc + 250 * t
        dentro = np.minimum.reduce([xs - xi, xd - xs, (t - 0.015) * 700, (0.74 - t) * 500])
        luz = np.clip(dentro / 16.0, 0, 1) * en_piso
        cruz = np.abs(xs - (xi + xd) / 2) < 3 + 5 * t      # el parteluz vertical de la ventana
        luz = np.where(cruz, luz * 0.35, luz)
        L = np.maximum(L, PENUMBRA + 0.30 * luz)
        calido = np.maximum(calido, luz)
        dx = np.maximum(np.maximum(x - xs, xs - (x + w)), 0)
        dy = np.maximum(np.maximum(y0 - ys, ys - (y0 + h)), 0)
        halo = np.clip(1 - np.hypot(dx, dy) / 46.0, 0, 1) * (~en_piso) * (ys > top)
        L = np.maximum(L, PENUMBRA + 0.20 * halo)
        calido = np.maximum(calido, halo * 0.5)

    for (lx, ly) in lamparas:
        pozo = np.clip(1 - np.hypot((xs - lx) / 124.0, (ys - ly) / 48.0), 0, 1) ** 0.7 * en_piso
        L = np.maximum(L, PENUMBRA + 0.28 * pozo)
        calido = np.maximum(calido, pozo * 0.9)

    d_fondo = ys - SEAM
    L = L * np.where((d_fondo >= 0) & (d_fondo < 18), 0.80 + 0.20 * d_fondo / 18.0, 1.0)
    if enc in ('tres-paredes', 'dos-paredes-izquierda'):
        dist = xs - (96 - (ys - SEAM) * 72 / (ALTO - SEAM))
        L = L * np.where(en_piso & (dist >= 0) & (dist < 16), 0.82 + 0.18 * dist / 16.0, 1.0)
    if enc in ('tres-paredes', 'dos-paredes-derecha'):
        dist = (864 + (ys - SEAM) * 72 / (ALTO - SEAM)) - xs
        L = L * np.where(en_piso & (dist >= 0) & (dist < 16), 0.82 + 0.18 * dist / 16.0, 1.0)
    L = L * (1 - 0.20 * np.clip((np.hypot((xs - 480) / 600.0, (ys - 310) / 360.0) - 0.62) / 0.5, 0, 1))

    umbral = BAYER[ys.astype(int) % 4, xs.astype(int) % 4]
    minimo = 1.0 - PASO * NIVELES
    q = np.clip((L - minimo) / PASO, 0, NIVELES)
    v = minimo + PASO * np.clip(np.floor(q) + ((q - np.floor(q)) > umbral), 0, NIVELES)
    k = (v - minimo) / (1 - minimo)
    ambiente = np.stack([v * (0.90 + 0.10 * k), v * (0.93 + 0.07 * k), np.minimum(1.0, v * (1.10 - 0.10 * k))], -1)

    qa = calido * 0.15 / 0.05
    a = (np.floor(qa) + ((qa - np.floor(qa)) > umbral)) * 0.05
    brillo = np.stack([255 * a, 206 * a, 140 * a], -1)
    a8 = lambda m: Image.fromarray(np.clip(np.round(m), 0, 255).astype(np.uint8), 'RGB')  # noqa: E731
    return a8(ambiente * 255), a8(brillo)


def brillo_tv(x, y):
    """Resplandor azul del televisor sobre el piso y la pared cercana."""
    ys, xs = np.mgrid[0:ALTO, 0:ANCHO].astype(float)
    r = np.hypot((xs - x) / 86.0, (ys - (y + 26)) / 40.0)
    qa = np.clip(1 - r, 0, 1) ** 0.8 * 0.15 / 0.055
    a = (np.floor(qa) + ((qa - np.floor(qa)) > BAYER[ys.astype(int) % 4, xs.astype(int) % 4])) * 0.055
    return Image.fromarray(np.clip(np.stack([120 * a, 170 * a, 255 * a], -1), 0, 255).astype(np.uint8), 'RGB')


# ── sprites nuevos ─────────────────────────────────────────────────────────────

def lampara_pie():
    w, h = 22, 64
    im, d = ac.lienzo(w, h)
    pantalla = ((246, 226, 170), (228, 198, 132), (198, 160, 100))
    d.polygon([(6, 2), (15, 2), (19, 17), (2, 17)], fill=pantalla[1] + (255,))
    d.polygon([(6, 2), (10, 2), (8, 17), (2, 17)], fill=pantalla[0] + (255,))
    ac.R(d, 2, 15, 19, 17, pantalla[2])
    ac.R(d, 9, 18, 12, 19, (255, 244, 200))
    ac.R(d, 10, 20, 11, h - 7, ac.METAL[2])
    ac.R(d, 10, 20, 10, h - 7, ac.METAL[1])
    d.ellipse([4, h - 8, 17, h - 2], fill=ac.METAL[2] + (255,))
    d.ellipse([5, h - 8, 16, h - 4], fill=ac.METAL[1] + (255,))
    return ac.terminar_sprite(im, 24)


GLOBO = [
    '................',
    '..############..',
    '.#wwwwwwwwwwww#.',
    '#wwwwwwwwwwwwww#',
    '#wwwwwwwwwwwwww#',
    '#wwwwwwwwwwwwww#',
    '#wwwwwwwwwwwwww#',
    '#wwwwwwwwwwwwww#',
    '#wwwwwwwwwwwwww#',
    '#wwwwwwwwwwwwww#',
    '.#ssssssssssss#.',
    '..####sss#####..',
    '......#ss#......',
    '.......#s#......',
    '........#.......',
    '................',
]
# Símbolos de 12x7 que van dentro del globo (columna 2, fila 3).
SIMBOLOS = {
    'duda': ['............', '............', '............', '.aa..aa..aa.', '.aa..aa..aa.', '............', '............'],
    'alerta': ['.....rr.....', '.....rr.....', '.....rr.....', '.....rr.....', '............', '.....rr.....', '............'],
    'apuro': ['.....bb.....', '....bbbb....', '....bcbb....', '...bbcbbb...', '...bbbbbb...', '....bbbb....', '............'],
    'pena': ['....ggg.....', '..ggggggg...', '.ggggggggg..', '..ggggggg...', '...b..b..b..', '....b..b....', '............'],
    'crisis': ['..d...d...d.', '.d.d.d.d.d..', 'd...d...d...', '..d...d...d.', '.d.d.d.d.d..', 'd...d...d...', '............'],
    'brote': ['...vv..vv...', '..vVvvvVvv..', '...vvvvvv...', '.....vv.....', '.....vv.....', '....tttt....', '............'],
}
ORDEN_EMOTES = ('duda', 'alerta', 'apuro', 'pena', 'crisis', 'brote')
TINTA = {'#': (40, 28, 24), 'w': (248, 244, 232), 's': (214, 208, 196), 'a': (84, 80, 96), 'r': (204, 72, 64),
         'b': (86, 146, 214), 'c': (176, 212, 244), 'g': (132, 136, 152), 'd': (72, 52, 96),
         'v': (86, 158, 92), 'V': (160, 212, 132), 't': (124, 84, 56)}


def emotes():
    """Tira de 6 globos de 16x16, en el orden de ORDEN_EMOTES."""
    tira = Image.new('RGBA', (16 * len(ORDEN_EMOTES), 16), (0, 0, 0, 0))
    for n, nombre in enumerate(ORDEN_EMOTES):
        for y, fila in enumerate(GLOBO):
            for x, ch in enumerate(fila):
                if ch != '.':
                    tira.putpixel((n * 16 + x, y), TINTA[ch] + (255,))
        for y, fila in enumerate(SIMBOLOS[nombre]):
            for x, ch in enumerate(fila):
                if ch != '.':
                    tira.putpixel((n * 16 + 2 + x, 3 + y), TINTA[ch] + (255,))
    return tira


# ── escena ─────────────────────────────────────────────────────────────────────

def leer_escena():
    with open(os.path.join(LUGAR, 'escenario.json'), encoding='utf-8') as f:
        lugar = json.load(f)
    sala = next(s for s in lugar['salas'] if s['id'] == SALA_ID)
    cat = lugar['catalogo']
    muebles = []
    for m in sala['muebles']:
        ficha = next(c for c in cat['muebles'] if c['id'] == m['ref'])
        muebles.append(dict(id=m['ref'], x=m['x'], y=m['y'], espejo=m.get('espejo', False), ancho=ficha['ancho'],
                            alto=ficha['alto'], arte=os.path.join(LUGAR, ficha['arte'])))
    objetos = []
    for o in sala['objetos']:
        ficha = next(c for c in cat['objetos'] if c['id'] == o['ref'])
        anim = ficha['animacionCerca']
        objetos.append(dict(id=o['ref'], x=o['x'], y=o['y'], nombre=ficha['nombre'], accion=ficha['textoInteraccion'],
                            texto=ficha['alRevisar'], cuadros=anim['cuadros'], fps=anim['fps'],
                            arte=os.path.join(LUGAR, ficha['arte']), hoja=os.path.join(LUGAR, anim['hoja'])))
    return lugar, sala, muebles, objetos


def cuadro_kit(receta, hoja, vista, n=0):
    w, h = MARCO[0], MARCO[1]
    im = Image.open(os.path.join(KIT, receta, hoja + '.png')).convert('RGBA')
    fila = VISTAS.index(vista)
    return im.crop((n * w, fila * h, n * w + w, fila * h + h))


def componer(fondo, muebles, objetos, personas, ambiente=None, brillo=None, extra_brillo=None, sombras=False, emote=None):
    """La escena como la pintaría el juego: fondo, sombras, piezas por orden de y, luz y, encima, los globos."""
    escena = fondo.convert('RGBA')
    piezas = []
    for m in muebles:
        im = Image.open(m['arte']).convert('RGBA') if isinstance(m['arte'], str) else m['arte']
        if m.get('espejo'):
            im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        piezas.append((m['y'], im, m['x'] - im.width // 2, m['y'] - im.height, m))
    for o in objetos:
        im = Image.open(o['arte']).convert('RGBA')
        piezas.append((o['y'] + 30, im, o['x'] - im.width // 2, o['y'] - im.height, None))
    for per in personas:
        piezas.append((per['y'], cuadro_kit(per['receta'], 'idle', per['vista']), per['x'] - MARCO[2], per['y'] - MARCO[3], per))
    if sombras:
        capa = Image.new('RGBA', escena.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(capa)
        for _, _, _, _, dato in piezas:
            if dato is None:
                continue
            if 'receta' in dato:
                d.ellipse([dato['x'] - 11, dato['y'] - 4, dato['x'] + 11, dato['y'] + 3], fill=(8, 6, 18, 86))
            else:
                rx, ry = dato['ancho'] / 2 + 3, dato['alto'] / 2 + 2
                cx, cy = dato['x'] + 3, dato['y'] - dato['alto'] / 2 + 2
                d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(8, 6, 18, 78))
        escena = Image.alpha_composite(escena, capa)
    for _, im, x, y, _ in sorted(piezas, key=lambda q: q[0]):
        escena.alpha_composite(im, (int(x), int(y)))
    rgb = escena.convert('RGB')
    if ambiente is not None:
        rgb = ImageChops.multiply(rgb, ambiente)
    for capa in (brillo, extra_brillo):
        if capa is not None:
            rgb = ImageChops.add(rgb, capa)
    if emote is not None:
        tira, nombre, (ex, ey) = emote
        n = ORDEN_EMOTES.index(nombre)
        rgb = rgb.convert('RGBA')
        rgb.alpha_composite(tira.crop((n * 16, 0, n * 16 + 16, 16)), (ex - 8, ey - 16))
        rgb = rgb.convert('RGB')
    return rgb


def ampliar(im, factor):
    return im.resize((im.width * factor, im.height * factor), Image.Resampling.NEAREST)


def uri(im_o_ruta):
    if isinstance(im_o_ruta, str):
        with open(im_o_ruta, 'rb') as f:
            datos = f.read()
    else:
        buf = io.BytesIO()
        im_o_ruta.save(buf, 'PNG', optimize=True)
        datos = buf.getvalue()
    return 'data:image/png;base64,' + base64.b64encode(datos).decode('ascii')


def construir_maqueta(datos):
    with open(os.path.join(AQUI, 'vivo_maqueta.html'), encoding='utf-8') as f:
        plantilla = f.read()
    marca = '/*__DATOS__*/'
    if marca not in plantilla:
        raise SystemExit('La plantilla no tiene la marca ' + marca)
    with open(os.path.join(SALIDA, 'maqueta.html'), 'w', encoding='utf-8', newline='') as f:
        f.write(plantilla.replace(marca, json.dumps(datos, ensure_ascii=False)))


def main():
    os.makedirs(SALIDA, exist_ok=True)
    lugar, sala, muebles, objetos = leer_escena()
    p = arte_casa.SALAS[SALA_ID]
    ventanas = [d[1:] for d in p.get('deco', []) if d[0] in ('ventana', 'persiana')]
    tv = next(o for o in objetos if o['id'] == 'televisor')

    fondo_hoy = Image.open(os.path.join(LUGAR, sala['fondo'])).convert('RGB')
    fondo = fondo_v2(sala, p)
    ambiente, brillo = mapas_de_luz(p, sala, ventanas, [LAMPARA])
    tele = brillo_tv(tv['x'], tv['y'])
    tira = emotes()
    lampara = lampara_pie()
    guardar = {'fondo-v2': fondo, 'ambiente': ambiente, 'brillo': brillo, 'brillo-tv': tele, 'emotes': tira, 'lampara-pie': lampara}
    for nombre, im in guardar.items():
        im.save(os.path.join(SALIDA, nombre + '.png'))

    persona = dict(receta='sobreviviente', x=560, y=360, vista='left')
    jugadora = dict(receta='valentina', x=470, y=372, vista='right')
    muebles_v2 = muebles + [dict(id='lampara-pie', x=LAMPARA[0], y=LAMPARA[1], espejo=False, ancho=14, alto=8, arte=lampara)]

    antes = componer(fondo_hoy, muebles, objetos, [persona, jugadora])
    despues = componer(fondo, muebles_v2, objetos, [persona, jugadora], ambiente, brillo, tele, sombras=True,
                       emote=(tira, 'duda', (persona['x'], persona['y'] - 66)))
    ampliar(antes, 2).save(os.path.join(SALIDA, 'antes.png'))
    ampliar(despues, 2).save(os.path.join(SALIDA, 'despues.png'))
    ampliar(despues.crop((330, 214, 730, 434)), 4).save(os.path.join(SALIDA, 'despues-cerca.png'))
    ampliar(antes.crop((330, 214, 730, 434)), 4).save(os.path.join(SALIDA, 'antes-cerca.png'))
    colores = len(fondo.getcolors(maxcolors=100000))
    print('fondo-v2:', colores, 'colores · ambiente:', len(ambiente.getcolors(maxcolors=100000)), 'tonos')

    retratos = {e: uri(os.path.join(KIT, 'sobreviviente', 'portrait-' + e + '.png'))
                for e in ('neutral', 'alegre', 'preocupada', 'triste', 'cautelosa', 'en-crisis')}
    imgs = {'fondoHoy': uri(fondo_hoy), 'fondo': uri(fondo), 'ambiente': uri(ambiente), 'brillo': uri(brillo),
            'brilloTv': uri(tele), 'emotes': uri(tira),
            'jugadorIdle': uri(os.path.join(KIT, 'valentina', 'idle.png')), 'jugadorWalk': uri(os.path.join(KIT, 'valentina', 'walk.png')),
            'personaIdle': uri(os.path.join(KIT, 'sobreviviente', 'idle.png'))}
    lista_muebles = []
    for m in muebles_v2:
        imgs['m-' + m['id']] = uri(m['arte'])
        lista_muebles.append(dict(id=m['id'], img='m-' + m['id'], x=m['x'], y=m['y'], ancho=m['ancho'], alto=m['alto'],
                                  espejo=m['espejo'], nuevo=m['id'] == 'lampara-pie'))
    lista_objetos = []
    for o in objetos:
        imgs['o-' + o['id']] = uri(o['arte'])
        imgs['h-' + o['id']] = uri(o['hoja'])
        lista_objetos.append(dict(id=o['id'], img='o-' + o['id'], hoja='h-' + o['id'], x=o['x'], y=o['y'], nombre=o['nombre'],
                                  accion=o['accion'], texto=o['texto'], cuadros=o['cuadros'], fps=o['fps']))
    datos = dict(
        sala=dict(w=ANCHO, h=ALTO, seam=SEAM, nombre=lugar['nombre'] + ' · ' + sala['nombre']),
        imgs=imgs, muebles=lista_muebles, objetos=lista_objetos, emotes=list(ORDEN_EMOTES),
        jugador=dict(x=sala['entrada']['x'], y=sala['entrada']['y']),
        persona=dict(x=persona['x'], y=persona['y'], nombre='Persona usuaria', retratos=retratos),
        luz=dict(ventana=[[round(x), round(y)] for x, y in poligono_ventana(ventanas[0][0], ventanas[0][2])]),
    )
    construir_maqueta(datos)
    print('maqueta.html:', os.path.getsize(os.path.join(SALIDA, 'maqueta.html')) // 1024, 'KB')


PISO_DE_HOY = ac.piso

if __name__ == '__main__':
    main()
