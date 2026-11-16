"""Motor de arte v2 (experimento del 2026-11-12): fondo con más oficio y luz por capas para
cualquier sala de la biblioteca. Generaliza lo que `vivo.py` probó en una sola sala.

No toca el arte validado: lee los escenarios y las paletas de hoy y escribe en
`maqueta-visual/lugares/`:

- <lugar>/<sala>-fondo.png, <sala>-ambiente.png (se multiplica) y <sala>-brillo.png (se suma)
- <lugar>-despues.png   hoja de contacto con todo colocado y la luz aplicada
  (el «antes» es biblioteca/escenarios/<lugar>/hoja-contacto.png)

    python tools/escenarios/arte_vivo.py [lugar ...]
"""
import importlib
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import arte_comun as ac  # noqa: E402
import hoja_contacto as hc  # noqa: E402
from pixelar_sala import fundir_parecidos  # noqa: E402

ANCHO, ALTO, SEAM = ac.ANCHO, ac.ALTO, ac.SEAM
SALIDA = os.path.join(RAIZ, 'maqueta-visual', 'lugares')
LUGARES = {'universidad': 'arte_universidad', 'casa': 'arte_casa', 'comisaria': 'arte_comisaria'}
ESTILO_PARED = {'casa': 'flores', 'universidad': 'liso', 'comisaria': 'liso'}
MAX_COLORES = 40
PISO_DE_HOY = ac.piso
CLARO = (255, 240, 210)

# Contenido extra por sala (sale del experimento, no del catálogo): tapete y lámpara de pie.
TAPETES = {('casa', 'sala'): (236, 548, 318, 420)}
LAMPARAS = {('casa', 'sala'): [(236, 326)]}


def azar(*claves):
    """Entero estable a partir de las claves: el arte sale igual en cada corrida."""
    x = 2166136261
    for v in claves:
        x = ((x ^ (int(v) & 0xFFFFFFFF)) * 16777619) & 0xFFFFFFFF
    x ^= x >> 13
    x = (x * 0x5BD1E995) & 0xFFFFFFFF
    return x ^ (x >> 15)


def color(c):
    return np.array(c, dtype=np.uint8)


def paredes(sala):
    enc = sala['encuadre']
    return enc in ('tres-paredes', 'dos-paredes-izquierda'), enc in ('tres-paredes', 'dos-paredes-derecha')


# ── pisos ──────────────────────────────────────────────────────────────────────

def _filas(alto_base):
    y, i = SEAM, 0
    while y < ALTO:
        h = alto_base + 2 * i
        yield y, min(y + h, ALTO), h, i
        y, i = y + h, i + 1


def piso_madera(d, p):
    A, B = p['pisoA'], p['pisoB']
    C = p.get('pisoC', A)
    junta = p.get('junta', ac.osc(A, 0.78))
    tonos = [ac.mezcla(A, CLARO, 0.10), A, B, C, ac.osc(C, 0.95)]
    filo, veta, largo = ac.mezcla(A, CLARO, 0.26), ac.mezcla(C, junta, 0.5), 148
    for y, y2, h, i in _filas(10):
        bx, j = -400 + (i * 61) % largo, 0
        while bx < ANCHO + 400:
            k = azar(i, j, 11)
            xa, xb, xa2, xb2 = ac.esp(bx, y), ac.esp(bx + largo, y), ac.esp(bx, y2), ac.esp(bx + largo, y2)
            d.polygon([(xa, y), (xb, y), (xb2, y2), (xa2, y2)], fill=tonos[(1, 1, 2, 2, 3, 0, 1, 1, 2, 3, 2, 4, 1, 2, 0, 2)[k % 16]])
            if k % 3 != 1:
                d.line([(xa + 2, y), (xb - 2, y)], fill=filo)
            if h >= 14:
                for n in range(2 + k % 2):
                    kk = azar(i, j, 31 + n)
                    vy = y + 3 + kk % max(1, h - 6)
                    vx = xa + 6 + (kk >> 8) % int(max(8, xb - xa - 44))
                    d.line([(vx, vy), (min(vx + 10 + (kk >> 16) % 26, xb - 4), vy)], fill=veta)
                if k % 7 == 0:
                    nx, ny = xa + 14 + (k >> 6) % int(max(8, xb - xa - 30)), y + h // 2
                    d.ellipse([nx - 2, ny - 1, nx + 2, ny + 1], fill=junta)
                    d.point((nx, ny), fill=veta)
            d.line([(xa, y), (xa2, y2)], fill=junta)
            bx, j = bx + largo, j + 1
        d.line([(0, y2 - 1), (ANCHO, y2 - 1)], fill=junta)


def piso_piezas(d, p):
    """Baldosa, damero y adoquín: cada pieza con un tono propio, junta de un píxel, filo de luz y motas."""
    tipo = p['piso']
    A, B = p['pisoA'], p['pisoB']
    C = p.get('pisoC', A)
    junta = p.get('junta', ac.osc(A, 0.78))
    col = {'damero': 48, 'baldosa': 64, 'adoquin': 40}[tipo]
    for y, y2, h, i in _filas(14):
        desfase = col // 2 if (tipo == 'adoquin' and i % 2) else 0
        for j, bx in enumerate(range(-320 + desfase, ANCHO + 320, col)):
            k = azar(i, j, 5)
            base = (A, B, C)[(i * 2 + j) % 3] if tipo == 'adoquin' else (A if (i + j) % 2 == 0 else B)
            tono = (base, base, base, ac.mezcla(base, CLARO, 0.07), ac.osc(base, 0.95), base)[k % 6]
            xa, xb, xa2, xb2 = ac.esp(bx, y), ac.esp(bx + col, y), ac.esp(bx, y2), ac.esp(bx + col, y2)
            d.polygon([(xa, y), (xb, y), (xb2, y2), (xa2, y2)], fill=tono)
            if tipo != 'damero':
                if k % 4 == 0:
                    d.line([(xa + 2, y), (xb - 2, y)], fill=ac.mezcla(base, CLARO, 0.16))
                d.line([(xa, y), (xa2, y2)], fill=junta)
            if h >= 18 and tipo != 'adoquin':
                for n in range(k % 3):
                    kk = azar(i, j, 71 + n)
                    d.point((xa + 4 + kk % int(max(4, xb - xa - 8)), y + 3 + (kk >> 9) % (h - 6)), fill=ac.osc(base, 0.88))
            if tipo == 'adoquin' and k % 9 == 0:
                d.rectangle([xa + 5, y + 3, xa + 8, y + 4], fill=ac.osc(base, 0.84))
        if tipo != 'damero':
            d.line([(0, y2 - 1), (ANCHO, y2 - 1)], fill=junta)


def piso_v2(d, p, x0=-300, x1=1260):
    if p['piso'] == 'madera':
        piso_madera(d, p)
    elif p['piso'] in ('baldosa', 'damero', 'adoquin'):
        piso_piezas(d, p)
    else:
        return PISO_DE_HOY(d, p, x0, x1)
    d.rectangle([0, SEAM, ANCHO, SEAM + 2], fill=ac.osc(p['pisoA'], 0.6))


TAPETE = dict(oscuro=(84, 40, 40), borde=(112, 52, 48), ribete=(214, 190, 140), campo=(146, 72, 60), motivo=(206, 150, 96))


def tapete(d, bx0, bx1, ya, yb, c=TAPETE):
    def cuadro(m, tinta):
        d.polygon([(ac.esp(bx0 + m, ya + m), ya + m), (ac.esp(bx1 - m, ya + m), ya + m),
                   (ac.esp(bx1 - m, yb - m), yb - m), (ac.esp(bx0 + m, yb - m), yb - m)], fill=tinta)
    for y in range(ya + 1, yb, 3):
        d.line([(ac.esp(bx0, y) - 4, y), (ac.esp(bx0, y), y)], fill=c['ribete'])
        d.line([(ac.esp(bx1, y), y), (ac.esp(bx1, y) + 4, y)], fill=c['ribete'])
    for m, nombre in ((0, 'oscuro'), (1, 'borde'), (6, 'ribete'), (7, 'campo')):
        cuadro(m, c[nombre])
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
    for rx, ry, nombre in ((30, 13, 'ribete'), (22, 9, 'borde'), (10, 4, 'motivo')):
        d.polygon([(mx, my - ry), (mx + rx, my), (mx, my + ry), (mx - rx, my)], fill=c[nombre])


# ── paredes ────────────────────────────────────────────────────────────────────

def vestir(im, sala, p, estilo):
    """Relieve sobre los colores planos: sombra bajo el techo con tramado, sombra arrojada por lo que cuelga,
    papel de flores (casa), tablas en la parte baja, filo de luz en el zócalo y trama en la alfombra."""
    arr = np.array(im)
    izq, der = paredes(sala)
    xl, xr, top = (96 if izq else 0), (864 if der else ANCHO), p.get('top', 84)
    ys, xs = np.mgrid[0:ALTO, 0:ANCHO]
    dentro = (xs >= xl) & (xs < xr) & (ys >= top) & (ys < SEAM)
    es_pared = (arr == color(p['pared'])).all(-1) & dentro
    alto_baja = p['baja'][0] if p.get('baja') else 0
    liso = not (p.get('ladrillo') or p.get('vetas'))

    cosa = dentro & ~es_pared & (ys > top + 8) & (ys < SEAM - alto_baja - 4)
    sombra = np.zeros_like(cosa)
    sombra[3:, 3:] = cosa[:-3, :-3]
    if estilo == 'flores' and liso and not p.get('cielo'):
        flor = np.zeros((ALTO, ANCHO), bool)
        for fila, gy in enumerate(range(top + 34, SEAM - alto_baja - 10, 16)):
            for gx in range(xl + 12 + (fila % 2) * 12, xr - 8, 24):
                flor[gy, gx] = flor[gy - 1, gx] = flor[gy + 1, gx] = flor[gy, gx - 1] = flor[gy, gx + 1] = True
        arr[es_pared & flor] = color(ac.mezcla(p['pared'], (255, 244, 220), 0.10))
    if liso:
        banda = (ys < top + 20) | ((ys < top + 26) & ((xs + ys) % 2 == 0))
        arr[es_pared & banda] = color(ac.osc(p['pared'], 0.88))
    arr[es_pared & sombra] = color(ac.osc(p['pared'], 0.76))
    if alto_baja and not (p.get('azulejo') or p.get('paneles')):
        base = p['baja'][1]
        es_baja = (arr == color(base)).all(-1) & dentro & (ys >= SEAM - alto_baja + 5) & (ys < SEAM - 8)
        arr[es_baja & ((xs - xl) % 26 == 0)] = color(ac.osc(base, 0.80))
        arr[es_baja & ((xs - xl) % 26 == 1)] = color(ac.mezcla(base, (255, 240, 214), 0.14))
    es_zocalo = (arr == color(p['zocalo'])).all(-1) & dentro & (ys == SEAM - 7)
    arr[es_zocalo] = color(ac.mezcla(p['zocalo'], (255, 235, 205), 0.24))
    if p['piso'] == 'alfombra':
        trama = (arr == color(p['pisoA'])).all(-1) & (ys > SEAM + 3)
        ruido = (xs * 7 + ys * 13 + (xs * ys) % 11) % 17
        arr[trama & (ruido == 0)] = color(ac.osc(p['pisoA'], 0.93))
        arr[trama & (ruido == 5)] = color(ac.mezcla(p['pisoA'], CLARO, 0.06))
    return Image.fromarray(arr, 'RGB')


def fondo_v2(lugar, sala, p, dibujar_propio=None, destinos=None):
    caja = TAPETES.get((lugar, sala['id']))

    def piso(d, pp, x0=-300, x1=1260):
        piso_v2(d, pp, x0, x1)
        if caja:
            tapete(d, *caja)

    ac.piso = piso
    try:
        im = ac.fondo_sala(sala, p, dibujar_propio=dibujar_propio, destinos=destinos)
    finally:
        ac.piso = PISO_DE_HOY
    im = vestir(im, sala, p, ESTILO_PARED.get(lugar, 'liso'))
    antes = len(im.getcolors(maxcolors=100000))
    if antes > MAX_COLORES:
        im = fundir_parecidos(im, MAX_COLORES)
    return im, antes


# ── luz ────────────────────────────────────────────────────────────────────────

BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=float) / 16.0
PENUMBRA, PASO, NIVELES = 0.79, 0.07, 8


def mapas_de_luz(sala, p, lamparas=()):
    """(ambiente RGB para multiplicar, brillo RGB para sumar). En escalones con tramado ordenado."""
    izq, der = paredes(sala)
    xl, xr, top = (96 if izq else 0), (864 if der else ANCHO), p.get('top', 84)
    exterior = bool(p.get('cielo'))
    ys, xs = np.mgrid[0:ALTO, 0:ANCHO].astype(float)
    en_piso = ys >= SEAM
    t = np.clip((ys - SEAM) / (ALTO - SEAM), 0, 1)
    j_izq = 96 - (ys - SEAM) * 72 / (ALTO - SEAM)
    j_der = 864 + (ys - SEAM) * 72 / (ALTO - SEAM)
    piso = en_piso & ((xs >= j_izq) | (not izq)) & ((xs <= j_der) | (not der))
    muro = (~en_piso) & (ys >= top) & (xs >= xl) & (xs < xr)
    base = 0.93 if exterior else PENUMBRA
    L = np.full((ALTO, ANCHO), base)
    calido = np.zeros((ALTO, ANCHO))

    if exterior:
        # Luz de día: el muro echa una sombra corta sobre el suelo y el alero sobre el muro.
        L = np.where(piso & (ys - SEAM < 34), np.minimum(L, 0.72 + 0.21 * np.clip((ys - SEAM - 14) / 20.0, 0, 1)), L)
        L = np.where(muro & (ys < top + 18), 0.79, L)
    else:
        ventanas = [d[1:] for d in p.get('deco', []) if d[0] in ('ventana', 'persiana')]
        for (x, y0, w, h) in ventanas:
            esc = 1 + 0.25 * t
            xi = 480 + (x - 8 - 480) * esc + 170 * t
            xd = 480 + (x + w + 8 - 480) * esc + 250 * t
            dentro = np.minimum.reduce([xs - xi, xd - xs, (t - 0.015) * 700, (0.74 - t) * 500])
            luz = np.clip(dentro / 16.0, 0, 1) * piso
            luz = np.where(np.abs(xs - (xi + xd) / 2) < 3 + 5 * t, luz * 0.35, luz)
            L = np.maximum(L, base + 0.21 * luz)
            calido = np.maximum(calido, luz)
            dx = np.maximum(np.maximum(x - xs, xs - (x + w)), 0)
            dy = np.maximum(np.maximum(y0 - ys, ys - (y0 + h)), 0)
            halo = np.clip(1 - np.hypot(dx, dy) / 46.0, 0, 1) * muro
            L = np.maximum(L, base + 0.14 * halo)
            calido = np.maximum(calido, halo * 0.5)
        focos = [(lx, ly, 1.0) for lx, ly in lamparas] + [(lx, ly, 0.6) for lx, ly in p.get('luces', [])]
        for lx, ly, fuerza in focos:
            pozo = np.clip(1 - np.hypot((xs - lx) / 124.0, (ys - ly) / 48.0), 0, 1) ** 0.7 * piso
            L = np.maximum(L, base + 0.21 * fuerza * pozo)
            calido = np.maximum(calido, pozo * 0.9 * fuerza)

    d_fondo = ys - SEAM
    L = L * np.where(piso & (d_fondo < 18), 0.80 + 0.20 * d_fondo / 18.0, 1.0)
    if izq:
        dist = xs - j_izq
        L = L * np.where(piso & (dist < 16), 0.82 + 0.18 * np.clip(dist, 0, 16) / 16.0, 1.0)
    if der:
        dist = j_der - xs
        L = L * np.where(piso & (dist < 16), 0.82 + 0.18 * np.clip(dist, 0, 16) / 16.0, 1.0)
    fuerza_vineta = 0.10 if exterior else 0.20
    L = L * (1 - fuerza_vineta * np.clip((np.hypot((xs - 480) / 600.0, (ys - 310) / 360.0) - 0.62) / 0.5, 0, 1))

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


# ── hoja de contacto ───────────────────────────────────────────────────────────

def lugar_vivo(lugar):
    modulo = importlib.import_module(LUGARES[lugar])
    base = os.path.join(RAIZ, 'biblioteca', 'escenarios', lugar)
    with open(os.path.join(base, 'escenario.json'), encoding='utf-8') as f:
        escenario = json.load(f)
    destino = os.path.join(SALIDA, lugar)
    os.makedirs(destino, exist_ok=True)
    propio = getattr(modulo, 'dibujar_propio', None)
    salas = escenario['salas']
    columnas = min(hc.COLUMNAS, len(salas))
    hoja = Image.new('RGB', (hc.ancho_hoja(columnas), hc.alto_hoja(math.ceil(len(salas) / columnas))), hc.FONDO_HOJA)
    d = ImageDraw.Draw(hoja)
    fuente = hc._fuente(20)
    resumen = []
    for i, sala in enumerate(salas):
        p = modulo.SALAS[sala['id']]
        fondo, colores = fondo_v2(lugar, sala, p, propio, getattr(modulo, 'DESTINO_PUERTA', None))
        ambiente, brillo = mapas_de_luz(sala, p, LAMPARAS.get((lugar, sala['id']), ()))
        for nombre, im in (('fondo', fondo), ('ambiente', ambiente), ('brillo', brillo)):
            im.save(os.path.join(destino, sala['id'] + '-' + nombre + '.png'))
        relativa = os.path.relpath(os.path.join(destino, sala['id'] + '-fondo.png'), base).replace(os.sep, '/')
        compuesta = hc.componer_sala(base, dict(sala, fondo=relativa), escenario, hc.KIT_POR_DEFECTO)
        compuesta = ImageChops.add(ImageChops.multiply(compuesta, ambiente), brillo)
        x0, y0 = hc.origen_celda(i, columnas)
        hoja.paste(compuesta, (x0, y0))
        d.text((x0, y0 - hc.ROTULO + 8), sala['nombre'] + ' · ' + hc.ENCUADRE_LEGIBLE[sala['encuadre']], fill=hc.TINTA, font=fuente)
        resumen.append((sala['id'], colores))
    hoja.save(os.path.join(SALIDA, lugar + '-despues.png'))
    return resumen


if __name__ == '__main__':
    for nombre in (sys.argv[1:] or list(LUGARES)):
        filas = lugar_vivo(nombre)
        print(nombre + ':', ', '.join(s + ' ' + str(c) for s, c in filas))
