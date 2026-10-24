"""Arte provisional de la universidad, dibujado por código en pixel art.

Decisión del usuario (2026-10-24): sin créditos de IA, el arte provisional se dibuja aquí con
la cámara y la paleta de biblioteca/escenarios/ESTILO.md. Cuando lleguen las fotos se
reemplazan los PNG con el mismo nombre y el escenario.json no cambia.

- Fondos: se dibujan a 960x528 y pasan por pixelar_sala.py (factor 2 por defecto, 32 colores).
- Muebles: a escala 1, ancho = el del catálogo, alfa binario, contorno de 1 px, <= 24 colores.
- Objetos y herramientas: iconos de 32x32, <= 16 colores.

    python tools/escenarios/arte_universidad.py <escenario.json> [--factor N] [--salas a,b]
"""
import json
import os
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from marcadores import dentro_de  # noqa: E402
from pixelar_sala import pixelar_sala  # noqa: E402

ANCHO, ALTO = 960, 528
SEAM = 230          # unión de la pared del fondo con el piso
SOMBRA = (5, 7, 13)
CONTORNO = (40, 28, 24)
FONDO_VACIO = (14, 16, 22)


# ── utilidades ─────────────────────────────────────────────────────────────────

def mezcla(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def osc(c, f=0.8):
    return tuple(int(v * f) for v in c)


def esp(bx, y):
    """x en pantalla de una línea del piso que en el fondo está en bx (perspectiva)."""
    return 480 + (bx - 480) * (1 + 0.25 * (y - SEAM) / (ALTO - SEAM))


def junta_izq(y):
    return 96 - (y - SEAM) * 72 / (ALTO - SEAM)


def junta_der(y):
    return ANCHO - junta_izq(y)


def tope_lado(top, x_desde_borde):
    """Borde superior de una pared lateral a x_desde_borde px de su arista (0 = arista con el fondo)."""
    return top + (345 - top) * (x_desde_borde / 72) if x_desde_borde <= 72 else 345


def capa_alfa(base, dibujar):
    capa = Image.new('RGBA', base.size, (0, 0, 0, 0))
    dibujar(ImageDraw.Draw(capa))
    return Image.alpha_composite(base, capa)


def rgba(c, a=1.0):
    return tuple(c) + (int(round(255 * a)),)


# ── fondos de sala ─────────────────────────────────────────────────────────────

def piso(d, p, x0=-300, x1=1260):
    tipo = p['piso']
    A, B = p['pisoA'], p['pisoB']
    C = p.get('pisoC', A)
    junta = p.get('junta', osc(A, 0.78))
    y, i = SEAM, 0
    filas = []
    while y < ALTO:
        h = (10 if tipo == 'madera' else 14) + 2 * i
        filas.append((y, min(y + h, ALTO), i))
        y += h
        i += 1
    for y, y2, i in filas:
        if tipo in ('damero', 'baldosa', 'adoquin'):
            col = {'damero': 48, 'baldosa': 64, 'adoquin': 40}[tipo]
            desfase = col // 2 if (tipo == 'adoquin' and i % 2) else 0
            for j, bx in enumerate(range(x0 + desfase, x1, col)):
                if tipo == 'adoquin':
                    color = (A, B, C)[(i * 2 + j) % 3]
                else:
                    color = A if (i + j) % 2 == 0 else B
                d.polygon([(esp(bx, y), y), (esp(bx + col, y), y), (esp(bx + col, y2), y2), (esp(bx, y2), y2)], fill=color)
                if tipo != 'damero':
                    d.line([(esp(bx, y), y), (esp(bx, y2), y2)], fill=junta, width=2)
            if tipo != 'damero':
                d.line([(0, y2 - 1), (ANCHO, y2 - 1)], fill=junta, width=2)
        elif tipo == 'madera':
            d.rectangle([0, y, ANCHO, y2], fill=(A, B, C)[i % 3])
            d.line([(0, y2 - 1), (ANCHO, y2 - 1)], fill=junta, width=2)
            for bx in range(x0 + (i * 53) % 160, x1, 160):
                x = esp(bx, (y + y2) / 2)
                d.line([(x, y), (x, y2)], fill=junta, width=2)
        elif tipo == 'alfombra':
            d.rectangle([0, y, ANCHO, y2], fill=A)
            if i % 2:
                for bx in range(x0, x1, 48):
                    x = esp(bx, (y + y2) / 2)
                    d.rectangle([x - 3, (y + y2) / 2 - 1, x + 3, (y + y2) / 2 + 1], fill=B)
    d.rectangle([0, SEAM, ANCHO, SEAM + 3], fill=osc(A, 0.6))  # sombra al pie de la pared


def ventana(d, x, y0, w, h, p, persianas=False):
    marco = p.get('marco_ventana', (186, 184, 172))
    d.rectangle([x - w // 2 - 4, y0 - 4, x + w // 2 + 4, y0 + h + 4], fill=marco)
    claro, cielo = p.get('vidrio_claro', (168, 196, 210)), p.get('vidrio', (122, 156, 178))
    for k in range(4):
        d.rectangle([x - w // 2, y0 + k * h // 4, x + w // 2, y0 + (k + 1) * h // 4], fill=mezcla(claro, cielo, k / 3))
    d.polygon([(x - w // 2 + 6, y0 + h), (x - w // 2 + 6 + h // 2, y0), (x - w // 2 + 18 + h // 2, y0), (x - w // 2 + 18, y0 + h)],
              fill=mezcla(claro, (255, 255, 255), 0.35))  # reflejo
    if persianas:
        for yy in range(y0, y0 + h * 2 // 5, 8):
            d.rectangle([x - w // 2, yy, x + w // 2, yy + 3], fill=p.get('persiana', (200, 192, 172)))
        d.rectangle([x - w // 2, y0 + h * 2 // 5, x + w // 2, y0 + h * 2 // 5 + 3], fill=osc(p.get('persiana', (200, 192, 172)), 0.8))
    d.rectangle([x - 2, y0, x + 1, y0 + h], fill=marco)
    d.rectangle([x - w // 2, y0 + h // 2 - 1, x + w // 2, y0 + h // 2 + 1], fill=marco)
    d.rectangle([x - w // 2 - 8, y0 + h + 4, x + w // 2 + 8, y0 + h + 10], fill=osc(marco, 0.85))  # alféizar


def cuadro(d, x, y0, w, h, colores):
    d.rectangle([x - w // 2 - 4, y0 - 4, x + w // 2 + 4, y0 + h + 4], fill=(70, 50, 38))
    d.rectangle([x - w // 2, y0, x + w // 2, y0 + h], fill=colores[0])
    d.ellipse([x - w // 2 + 6, y0 + 6, x + 4, y0 + h - 8], fill=colores[1])
    d.rectangle([x - 2, y0 + h // 3, x + w // 2 - 6, y0 + h - 6], fill=colores[2])
    d.polygon([(x - w // 2, y0 + h), (x - w // 6, y0 + h * 2 // 3), (x + w // 4, y0 + h)], fill=osc(colores[1], 0.75))


def reloj(d, x, y):
    d.ellipse([x - 13, y - 13, x + 13, y + 13], fill=(52, 50, 56))
    d.ellipse([x - 10, y - 10, x + 10, y + 10], fill=(222, 218, 206))
    d.rectangle([x - 1, y - 8, x + 1, y], fill=(40, 40, 46))
    d.rectangle([x, y - 1, x + 6, y + 1], fill=(40, 40, 46))


def cruz_verde(d, x, y):
    d.rectangle([x - 18, y - 18, x + 18, y + 18], fill=(228, 230, 226))
    d.rectangle([x - 5, y - 13, x + 5, y + 13], fill=(70, 150, 96))
    d.rectangle([x - 13, y - 5, x + 13, y + 5], fill=(70, 150, 96))


def pizarra_menu(d, x, y0, w, h):
    d.rectangle([x - w // 2 - 5, y0 - 5, x + w // 2 + 5, y0 + h + 5], fill=(92, 64, 44))
    d.rectangle([x - w // 2, y0, x + w // 2, y0 + h], fill=(44, 58, 52))
    colores = [(214, 210, 196), (226, 170, 120), (150, 200, 170), (214, 210, 196)]
    for k, yy in enumerate(range(y0 + 12, y0 + h - 8, 14)):
        largo = (w - 40) * (0.5 + 0.12 * ((k * 3) % 4))
        d.rectangle([x - w // 2 + 12, yy, x - w // 2 + 12 + largo, yy + 3], fill=colores[k % 4])
        d.rectangle([x + w // 2 - 30, yy, x + w // 2 - 14, yy + 3], fill=colores[(k + 1) % 4])


def lampara_colgante(d, x, y, color, top=84):
    d.rectangle([x - 1, top, x + 1, y - 10], fill=(40, 36, 34))
    d.polygon([(x - 16, y), (x - 8, y - 12), (x + 8, y - 12), (x + 16, y)], fill=color)
    d.rectangle([x - 16, y, x + 16, y + 2], fill=osc(color, 0.7))
    d.ellipse([x - 5, y - 1, x + 5, y + 5], fill=(255, 236, 190))


def espejo(d, x, y0, w, h):
    d.rectangle([x - w // 2 - 3, y0 - 3, x + w // 2 + 3, y0 + h + 3], fill=(150, 156, 160))
    d.rectangle([x - w // 2, y0, x + w // 2, y0 + h], fill=(150, 178, 186))
    d.line([(x - w // 2 + 4, y0 + h - 6), (x + w // 2 - 10, y0 + 4)], fill=(196, 216, 220), width=3)


def placa(d, x, y, picto=None):
    """Placa junto a una puerta, con un dibujo sin texto que dice a dónde lleva."""
    d.rectangle([x - 13, y - 11, x + 13, y + 11], fill=(70, 62, 56))
    d.rectangle([x - 11, y - 9, x + 11, y + 9], fill=(214, 208, 190))
    tinta = (70, 96, 120)
    if picto == 'pizarra':
        d.rectangle([x - 8, y - 6, x + 8, y + 4], fill=(60, 96, 80)); d.rectangle([x - 6, y + 4, x + 6, y + 6], fill=tinta)
    elif picto == 'maletin':
        d.rectangle([x - 8, y - 3, x + 8, y + 7], fill=(120, 80, 54)); d.rectangle([x - 3, y - 7, x + 3, y - 3], fill=(120, 80, 54))
    elif picto == 'corazon':
        d.ellipse([x - 8, y - 6, x, y + 2], fill=(200, 100, 110)); d.ellipse([x, y - 6, x + 8, y + 2], fill=(200, 100, 110))
        d.polygon([(x - 8, y - 1), (x + 8, y - 1), (x, y + 8)], fill=(200, 100, 110))
    elif picto == 'libro':
        d.rectangle([x - 8, y - 6, x - 1, y + 6], fill=tinta); d.rectangle([x + 1, y - 6, x + 8, y + 6], fill=tinta)
    elif picto == 'cruz':
        d.rectangle([x - 2, y - 7, x + 2, y + 7], fill=(70, 150, 96)); d.rectangle([x - 7, y - 2, x + 7, y + 2], fill=(70, 150, 96))
    else:
        d.rectangle([x - 6, y - 2, x + 6, y - 1], fill=(120, 116, 104))
        d.rectangle([x - 6, y + 2, x + 3, y + 3], fill=(120, 116, 104))


# A dónde lleva cada puerta: color de la hoja y dibujo de su placa (sin texto).
DESTINO_PUERTA = {
    'aula': ((112, 80, 58), 'pizarra'),
    'oficina-docente': ((88, 62, 48), 'maletin'),
    'sala-espera': ((72, 108, 112), 'corazon'),
    'bienestar': ((72, 108, 112), 'corazon'),
    'consultorio': ((96, 76, 98), 'corazon'),
    'biblioteca': ((132, 98, 62), 'libro'),
    'enfermeria': ((84, 120, 100), 'cruz'),
}


def puerta_fondo(d, x, p, ancho=46, alto=88, hacia=None):
    marco = p.get('marco', (62, 56, 52))
    hoja, picto = DESTINO_PUERTA.get(hacia, (p.get('puerta', (112, 80, 58)), None))
    placa(d, x + ancho // 2 + 22, SEAM - alto // 2 - 12, picto)
    d.rectangle([x - ancho // 2 - 5, SEAM - alto - 5, x + ancho // 2 + 5, SEAM], fill=marco)
    d.rectangle([x - ancho // 2, SEAM - alto, x + ancho // 2, SEAM - 1], fill=hoja)
    d.rectangle([x - ancho // 2 + 5, SEAM - alto + 6, x + ancho // 2 - 5, SEAM - alto + 30], fill=p.get('vidrio', (120, 150, 166)))
    d.rectangle([x - ancho // 2 + 5, SEAM - alto + 38, x + ancho // 2 - 5, SEAM - 8], fill=osc(hoja, 0.86))
    d.rectangle([x + ancho // 2 - 9, SEAM - alto // 2 - 2, x + ancho // 2 - 4, SEAM - alto // 2 + 2], fill=(206, 200, 180))


def chevrones(d, cx, cy, direccion, color, n=3, paso=10):
    """Flechas sin texto que señalan una salida. direccion: 'abajo', 'izquierda' o 'derecha'."""
    for k in range(n):
        if direccion == 'abajo':
            y = cy - paso + k * paso
            d.polygon([(cx - 9, y - 3), (cx, y + 4), (cx + 9, y - 3), (cx + 9, y + 1), (cx, y + 8), (cx - 9, y + 1)], fill=color)
        else:
            s = -1 if direccion == 'izquierda' else 1
            x = cx + s * (k * paso - paso)
            d.polygon([(x - 3 * s, cy - 9), (x + 4 * s, cy), (x - 3 * s, cy + 9), (x + 1 * s, cy + 9), (x + 8 * s, cy), (x + 1 * s, cy - 9)],
                      fill=color)


def color_tapete(p):
    """Tapete de salida: bien distinto del piso (más oscuro) con flechas claras."""
    return osc(p['pisoA'], 0.5), mezcla(p['pisoA'], (255, 255, 255), 0.55)


def puerta_vidrio(d, x, p):
    marco, vidrio, claro = p.get('marco', (60, 64, 72)), p['vidrio'], p['vidrio_claro']
    d.rectangle([x - 70, SEAM - 112, x + 70, SEAM - 100], fill=osc(marco, 0.9))   # marquesina
    d.rectangle([x - 50, SEAM - 100, x + 50, SEAM], fill=marco)
    for x0 in (x - 46, x + 2):
        d.rectangle([x0, SEAM - 96, x0 + 44, SEAM - 2], fill=vidrio)
        d.polygon([(x0 + 4, SEAM - 2), (x0 + 30, SEAM - 96), (x0 + 40, SEAM - 96), (x0 + 14, SEAM - 2)], fill=claro)
        d.rectangle([x0 + 20, SEAM - 52, x0 + 24, SEAM - 40], fill=(200, 200, 196))


def puerta_lado(d, lado, y, p):
    marco, hoja = p.get('marco', (62, 56, 52)), osc(p.get('puerta', (112, 80, 58)), 0.88)
    junta = junta_izq if lado == 'izquierda' else junta_der

    def quad(a, b, alto):
        xa, xb = junta(a), junta(b)
        return [(xa, a - alto), (xb, b - alto), (xb, b), (xa, a)]
    d.polygon(quad(y - 30, y + 30, 100), fill=p.get('canto', marco))
    d.polygon(quad(y - 26, y + 26, 96), fill=marco)
    d.polygon(quad(y - 21, y + 21, 90), fill=hoja)
    d.polygon(quad(y - 15, y + 15, 84)[:2] + [(junta(y + 15), y + 15 - 58), (junta(y - 15), y - 15 - 58)],
              fill=p.get('vidrio', (120, 150, 166)))
    # Tapete con flechas en el piso junto a la puerta: la pared lateral es angosta y la puerta
    # se ve de canto, así que el tapete es lo que dice «por aquí se sale».
    s = 1 if lado == 'izquierda' else -1
    fondo, flecha = color_tapete(p)
    d.polygon([(junta(y - 24) + 4 * s, y - 24), (junta(y - 24) + 52 * s, y - 24),
               (junta(y + 24) + 52 * s, y + 24), (junta(y + 24) + 4 * s, y + 24)], fill=fondo)
    chevrones(d, junta(y) + 28 * s, y, 'izquierda' if lado == 'izquierda' else 'derecha', flecha, n=2, paso=11)


def tapete_puerta(d, x, p):
    fondo, flecha = color_tapete(p)
    d.rectangle([x - 42, 492, x + 42, 527], fill=fondo)
    chevrones(d, x, 506, 'abajo', flecha, n=2, paso=10)


def paso_abierto(d, lado, y, p):
    claro = mezcla(p['pisoA'], (255, 255, 255), 0.18)
    flecha = mezcla(p['pisoA'], (255, 255, 255), 0.4)
    x0, x1 = (0, 90) if lado == 'izquierda' else (870, ANCHO)
    d.rectangle([x0, y - 20, x1, y + 20], fill=claro)
    for k in range(3):
        cx = (20 + 22 * k) if lado == 'izquierda' else (ANCHO - 20 - 22 * k)
        s = -1 if lado == 'izquierda' else 1
        d.polygon([(cx + 6 * s, y), (cx - 4 * s, y - 9), (cx - 8 * s, y - 9), (cx + 2 * s, y),
                   (cx - 8 * s, y + 9), (cx - 4 * s, y + 9)], fill=flecha)


def fondo_sala(sala, p):
    enc = sala['encuadre']
    izq = enc in ('tres-paredes', 'dos-paredes-izquierda')
    der = enc in ('tres-paredes', 'dos-paredes-derecha')
    top = p.get('top', 84)
    xl, xr = (96 if izq else 0), (864 if der else ANCHO)

    im = Image.new('RGB', (ANCHO, ALTO), p.get('vacio', FONDO_VACIO))
    d = ImageDraw.Draw(im)
    if p.get('cielo'):
        for k in range(4):
            d.rectangle([0, k * top // 4, ANCHO, (k + 1) * top // 4], fill=mezcla(p['cielo_claro'], p['cielo'], k / 3))

    piso(d, p)

    # pared del fondo
    d.rectangle([xl, top, xr, SEAM - 1], fill=p['pared'])
    if p.get('pared_alta'):
        d.rectangle([xl, top, xr, top + p['pared_alta'][0]], fill=p['pared_alta'][1])
    if p.get('vetas'):
        for x in range(xl + 40, xr, 80):
            d.rectangle([x, top + 10, x + 1, SEAM - 60], fill=osc(p['pared'], 0.9))
    if p.get('ladrillo'):
        for k, yy in enumerate(range(top + 6, SEAM - 6, 10)):
            for x in range(xl - (k % 2) * 20, xr, 40):
                d.rectangle([x, yy, x + 36, yy + 7], fill=p['ladrillo'][(k + x // 40) % 2])
    if p.get('baja'):
        alto, color = p['baja']
        d.rectangle([xl, SEAM - alto, xr, SEAM - 1], fill=color)
        if p.get('azulejo'):
            for yy in range(SEAM - alto, SEAM, 12):
                d.line([(xl, yy), (xr, yy)], fill=p['azulejo'], width=2)
            for x in range(xl, xr, 16):
                d.line([(x, SEAM - alto), (x, SEAM)], fill=p['azulejo'], width=2)
        if p.get('paneles'):
            for x in range(xl + 8, xr - 40, 56):
                d.rectangle([x, SEAM - alto + 8, x + 46, SEAM - 12], fill=p['paneles'])
        d.rectangle([xl, SEAM - alto - 3, xr, SEAM - alto + 1], fill=p.get('moldura', osc(color, 1.15)))
    if p.get('franja'):
        y0, color = p['franja']
        d.rectangle([xl, y0, xr, y0 + 8], fill=color)
    d.rectangle([xl, top, xr, top + 6], fill=osc(p['pared'], 0.72))       # sombra bajo el techo
    d.rectangle([xl, SEAM - 7, xr, SEAM - 1], fill=p['zocalo'])

    for deco in p.get('deco', []):
        tipo, args = deco[0], deco[1:]
        {'ventana': lambda *a: ventana(d, *a, p), 'persiana': lambda *a: ventana(d, *a, p, persianas=True),
         'cuadro': lambda *a: cuadro(d, *a), 'reloj': lambda *a: reloj(d, *a), 'cruz': lambda *a: cruz_verde(d, *a),
         'menu': lambda *a: pizarra_menu(d, *a), 'espejo': lambda *a: espejo(d, *a), 'placa': lambda *a: placa(d, *a),
         'colgante': lambda *a: None}[tipo](*args)

    # paredes laterales en perspectiva; por fuera de ellas no hay sala
    vacio = p.get('vacio', FONDO_VACIO)
    if izq:
        d.polygon([(0, 0), (96, 0), (96, top), (24, tope_lado(top, 72)), (24, ALTO), (0, ALTO)], fill=vacio)
    if der:
        d.polygon([(ANCHO, 0), (864, 0), (864, top), (936, tope_lado(top, 72)), (936, ALTO), (ANCHO, ALTO)], fill=vacio)
    if izq:
        d.polygon([(96, top), (96, SEAM), (24, ALTO), (24, tope_lado(top, 72))], fill=p['lado'])
        d.line([(96, SEAM), (24, ALTO)], fill=p['zocalo'], width=5)
        d.line([(96, top), (24, tope_lado(top, 72))], fill=p['canto'], width=6)
        d.rectangle([90, top, 96, SEAM], fill=osc(p['lado'], 0.85))
    if der:
        d.polygon([(864, top), (864, SEAM), (936, ALTO), (936, tope_lado(top, 72))], fill=osc(p['lado'], 0.9))
        d.line([(864, SEAM), (936, ALTO)], fill=p['zocalo'], width=5)
        d.line([(864, top), (936, tope_lado(top, 72))], fill=p['canto'], width=6)
        d.rectangle([864, top, 870, SEAM], fill=osc(p['lado'], 0.8))
    if not p.get('cielo'):
        d.rectangle([xl, top - 6, xr, top - 1], fill=p['canto'])          # canto del muro cortado

    for puerta in sala['puertas']:
        x, y = puerta['x'], puerta['y']
        if y <= SEAM + 10:
            if p.get('puerta_vidrio'):
                puerta_vidrio(d, x, p)
            else:
                puerta_fondo(d, x, p, hacia=puerta['hacia'])
        elif y >= 480:
            tapete_puerta(d, x, p)
        elif izq and x <= 100:
            puerta_lado(d, 'izquierda', y, p)
        elif der and x >= 860:
            puerta_lado(d, 'derecha', y, p)
        else:
            paso_abierto(d, 'izquierda' if x < 480 else 'derecha', y, p)

    for deco in p.get('deco', []):
        if deco[0] == 'colgante':
            lampara_colgante(d, *deco[1:])

    base = im.convert('RGBA')
    luz = p.get('luz', (255, 236, 200))
    # Una sola mancha de luz por foco: cada capa de mezcla duplica los colores de lo que toca.
    for (lx, ly) in p.get('luces', []):
        base = capa_alfa(base, lambda dd, lx=lx, ly=ly: dd.ellipse([lx - 130, ly - 48, lx + 130, ly + 48], fill=rgba(luz, 0.05)))
    return base.convert('RGB')


MADERA_PUERTA = dict(puerta=(112, 80, 58), marco=(62, 56, 52))

SALAS = {
    'entrada': dict(
        top=36, cielo=(118, 146, 170), cielo_claro=(160, 182, 196), pared=(146, 128, 110), canto=(170, 156, 136),
        ladrillo=((122, 82, 68), (112, 76, 62)), baja=(70, (104, 70, 58)), moldura=(176, 164, 144), zocalo=(70, 58, 52),
        piso='adoquin', pisoA=(124, 120, 112), pisoB=(112, 108, 102), pisoC=(132, 126, 116), junta=(88, 84, 80),
        marco=(58, 62, 70), vidrio=(84, 112, 132), vidrio_claro=(132, 160, 176), puerta_vidrio=True, tapete=(96, 70, 60),
        deco=[('ventana', 160, 60, 96, 40), ('ventana', 300, 60, 96, 40), ('ventana', 660, 60, 96, 40),
              ('ventana', 800, 60, 96, 40), ('placa', 480, 62)],
        luces=[]),
    'pasillo': dict(
        pared=(98, 114, 118), canto=(150, 160, 160), baja=(58, (72, 88, 96)), moldura=(132, 146, 150), zocalo=(42, 50, 56),
        piso='baldosa', pisoA=(128, 122, 112), pisoB=(118, 112, 104), junta=(94, 90, 84), vetas=True,
        tapete=(84, 92, 104), **MADERA_PUERTA,
        deco=[('reloj', 880, 130)],
        luces=[(260, 330), (700, 330)], luz=(224, 236, 255)),
    'aula': dict(
        pared=(98, 116, 100), lado=(80, 98, 84), canto=(150, 160, 146), baja=(50, (80, 96, 82)), moldura=(130, 144, 124),
        zocalo=(44, 52, 46), piso='baldosa', pisoA=(136, 124, 104), pisoB=(126, 114, 96), junta=(100, 92, 78),
        tapete=(84, 92, 104), **MADERA_PUERTA,
        deco=[('ventana', 210, 112, 120, 70), ('ventana', 750, 112, 120, 70), ('reloj', 650, 106)],
        luces=[(300, 380), (660, 380)]),
    'oficina-docente': dict(
        pared=(106, 86, 70), lado=(90, 72, 60), canto=(156, 136, 116), zocalo=(60, 44, 34),
        piso='madera', pisoA=(130, 90, 64), pisoB=(120, 82, 58), pisoC=(112, 76, 54), junta=(86, 58, 42),
        tapete=(96, 70, 60), **MADERA_PUERTA,
        deco=[('persiana', 640, 108, 130, 74), ('cuadro', 400, 118, 46, 36, ((214, 208, 190), (120, 150, 170), (190, 160, 110))),
              ('cuadro', 840, 126, 40, 30, ((208, 204, 186), (150, 120, 100), (110, 140, 120)))],
        luces=[(470, 360)]),
    'sala-espera': dict(
        pared=(80, 108, 114), lado=(64, 88, 94), canto=(140, 160, 160), franja=(176, (140, 172, 160)), zocalo=(36, 48, 52),
        piso='baldosa', pisoA=(132, 128, 120), pisoB=(122, 118, 110), junta=(98, 94, 88), tapete=(84, 92, 104), **MADERA_PUERTA,
        deco=[('ventana', 190, 104, 140, 64), ('cuadro', 520, 110, 90, 54, ((206, 200, 180), (110, 150, 140), (200, 150, 110))),
              ('reloj', 720, 120)],
        luces=[(330, 360), (620, 380)]),
    'bienestar': dict(
        pared=(104, 124, 106), lado=(86, 104, 90), canto=(156, 168, 150), franja=(196, (150, 178, 130)), zocalo=(44, 54, 46),
        piso='baldosa', pisoA=(136, 126, 110), pisoB=(126, 116, 102), junta=(102, 94, 82), tapete=(84, 92, 104), **MADERA_PUERTA,
        deco=[('ventana', 250, 104, 110, 64), ('cuadro', 420, 112, 60, 40, ((226, 222, 206), (110, 160, 120), (120, 140, 180)))],
        luces=[(420, 380), (700, 380)]),
    'consultorio': dict(
        pared=(102, 82, 96), lado=(86, 68, 80), canto=(156, 138, 148), zocalo=(60, 44, 54),
        piso='madera', pisoA=(134, 98, 72), pisoB=(124, 90, 66), pisoC=(116, 84, 62), junta=(90, 64, 48),
        tapete=(96, 70, 60), persiana=(204, 196, 178), **MADERA_PUERTA,
        deco=[('persiana', 330, 102, 140, 76), ('cuadro', 560, 118, 70, 46, ((214, 206, 188), (150, 120, 160), (120, 160, 140))),
              ('reloj', 800, 122)],
        luces=[(370, 360), (680, 330)], luz=(255, 226, 180)),
    'enfermeria': dict(
        pared=(84, 108, 104), lado=(70, 92, 88), canto=(150, 166, 162), baja=(70, (118, 136, 132)), azulejo=(102, 120, 116),
        moldura=(110, 128, 124), zocalo=(52, 64, 62), piso='baldosa', pisoA=(142, 148, 146), pisoB=(132, 138, 136),
        junta=(110, 116, 114), tapete=(84, 100, 104), **MADERA_PUERTA,
        deco=[('espejo', 420, 128, 34, 44), ('cruz', 560, 120), ('ventana', 740, 104, 110, 62)],
        luces=[(560, 370)], luz=(232, 244, 255)),
    'cafeteria': dict(
        pared=(140, 102, 78), lado=(118, 86, 66), canto=(180, 150, 124), baja=(54, (112, 80, 62)), moldura=(160, 120, 92),
        zocalo=(64, 44, 34), piso='damero', pisoA=(146, 136, 122), pisoB=(118, 110, 100), tapete=(96, 70, 60), **MADERA_PUERTA,
        deco=[('menu', 300, 100, 170, 70), ('ventana', 620, 104, 120, 62), ('ventana', 820, 104, 110, 62),
              ('colgante', 515, 150, (70, 110, 96)), ('colgante', 722, 140, (70, 110, 96))],
        luces=[(560, 380), (780, 350)], luz=(255, 226, 180)),
    'biblioteca': dict(
        pared=(106, 96, 82), lado=(88, 78, 66), canto=(150, 138, 120), baja=(80, (88, 62, 44)), paneles=(100, 72, 52),
        moldura=(120, 88, 64), zocalo=(54, 38, 28), piso='alfombra', pisoA=(76, 96, 82), pisoB=(66, 84, 72),
        tapete=(96, 70, 60), **MADERA_PUERTA,
        deco=[('ventana', 480, 98, 150, 60), ('ventana', 255, 98, 30, 40), ('ventana', 705, 98, 30, 40)],
        luces=[(480, 380)], luz=(255, 232, 190)),
}


# ── muebles (escala 1) ─────────────────────────────────────────────────────────

MADERA = ((160, 106, 70), (124, 80, 52), (94, 59, 40), (70, 44, 30))
MADERA_CLARA = ((196, 156, 108), (164, 126, 86), (130, 98, 66), (98, 72, 48))
METAL = ((176, 184, 192), (136, 144, 156), (100, 106, 118), (72, 76, 86))
BLANCO = ((222, 224, 220), (192, 196, 196), (156, 162, 164), (116, 122, 126))
AZUL = ((100, 132, 176), (78, 104, 146), (60, 80, 114), (44, 58, 84))
VERDE_TELA = ((100, 150, 130), (76, 120, 104), (56, 90, 80), (40, 66, 58))
MALVA = ((156, 108, 128), (126, 84, 104), (98, 64, 80), (72, 48, 60))
TERRACOTA = ((190, 104, 78), (156, 80, 62), (118, 60, 48), (84, 44, 36))
HOJA = ((112, 176, 98), (74, 134, 70), (48, 96, 50), (32, 66, 36))
NEGRO = ((76, 80, 88), (56, 60, 66), (40, 42, 48), (28, 30, 34))
PAPEL = ((230, 226, 212), (200, 196, 182))


def lienzo(w, h):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def R(d, x0, y0, x1, y1, c):
    d.rectangle([x0, y0, x1, y1], fill=tuple(c) + (255,))


def caja(d, x0, y0, x1, y1, m, tapa=6):
    """Bloque visto de frente y un poco desde arriba: tapa clara y frente."""
    R(d, x0, y0, x1, y0 + tapa, m[0])
    R(d, x0, y0 + tapa + 1, x1, y1, m[1])
    R(d, x0, y0 + tapa + 1, x1, y0 + tapa + 2, m[2])
    R(d, x0, y1 - 2, x1, y1, m[2])


def escritorio(w=122, h=58):
    im, d = lienzo(w, h)
    R(d, 26, 2, 40, 6, PAPEL[0]); R(d, 30, 3, 44, 7, PAPEL[1])
    R(d, 70, 4, 96, 8, NEGRO[1]); R(d, 72, 4, 94, 5, NEGRO[0])
    caja(d, 1, 8, w - 2, 16, MADERA, tapa=5)
    R(d, 4, 17, 42, h - 2, MADERA[1]); R(d, 4, h - 4, 42, h - 2, MADERA[2])
    for yy in (24, 34, 44):
        R(d, 6, yy, 40, yy + 1, MADERA[2]); R(d, 20, yy + 3, 26, yy + 4, METAL[0])
    R(d, 43, 17, w - 6, 40, MADERA[2]); R(d, 43, 17, w - 6, 19, MADERA[3])
    R(d, w - 10, 17, w - 4, h - 2, MADERA[1]); R(d, w - 10, 17, w - 9, h - 2, MADERA[2])
    return im


def silla_oficina(w=26, h=40):
    im, d = lienzo(w, h)
    d.rounded_rectangle([4, 1, w - 5, 20], 4, fill=NEGRO[1] + (255,))
    R(d, 6, 3, w - 7, 6, NEGRO[0])
    R(d, 2, 20, w - 3, 26, NEGRO[0]); R(d, 2, 25, w - 3, 26, NEGRO[2])
    R(d, w // 2 - 1, 27, w // 2 + 1, 32, METAL[2])
    R(d, 3, 33, w - 4, 35, METAL[1])
    for x in (3, w // 2 - 1, w - 6):
        R(d, x, 36, x + 2, 38, NEGRO[3])
    return im


def silla_visitante(w=24, h=34, m=MADERA, tela=AZUL):
    im, d = lienzo(w, h)
    R(d, 3, 1, w - 4, 3, m[0]); R(d, 3, 1, 5, 18, m[1]); R(d, w - 6, 1, w - 4, 18, m[1])
    R(d, 6, 4, w - 7, 14, tela[1]); R(d, 6, 4, w - 7, 5, tela[0])
    R(d, 2, 17, w - 3, 22, tela[0]); R(d, 2, 21, w - 3, 22, tela[2])
    for x in (3, w - 6):
        R(d, x, 23, x + 2, h - 2, m[2])
    R(d, 5, 23, w - 6, 24, m[3])
    return im


def sillon(w=46, h=40, tela=VERDE_TELA):
    im, d = lienzo(w, h)
    d.rounded_rectangle([5, 1, w - 6, 22], 5, fill=tela[1] + (255,))
    R(d, 8, 3, w - 9, 6, tela[0])
    R(d, 1, 12, 9, 33, tela[2]); R(d, w - 10, 12, w - 2, 33, tela[1]); R(d, 1, 12, 9, 14, tela[0]); R(d, w - 10, 12, w - 2, 14, tela[0])
    R(d, 10, 20, w - 11, 27, tela[0]); R(d, 10, 26, w - 11, 27, tela[2])
    R(d, 1, 28, w - 2, 34, tela[2]); R(d, 1, 33, w - 2, 34, tela[3])
    for x in (3, w - 6):
        R(d, x, 35, x + 2, h - 2, MADERA[3])
    return im


def sofa(w=88, h=44, tela=AZUL):
    im, d = lienzo(w, h)
    d.rounded_rectangle([5, 1, w - 6, 24], 5, fill=tela[1] + (255,))
    R(d, 8, 3, w - 9, 6, tela[0])
    R(d, w // 2, 6, w // 2 + 1, 22, tela[2])
    R(d, 1, 14, 10, 37, tela[2]); R(d, w - 11, 14, w - 2, 37, tela[1]); R(d, 1, 14, 10, 16, tela[0]); R(d, w - 11, 14, w - 2, 16, tela[0])
    for x0, x1 in ((11, w // 2 - 1), (w // 2 + 1, w - 12)):
        R(d, x0, 22, x1, 30, tela[0]); R(d, x0, 29, x1, 30, tela[2])
    R(d, 1, 31, w - 2, 38, tela[2]); R(d, 1, 37, w - 2, 38, tela[3])
    for x in (4, w - 7):
        R(d, x, 39, x + 2, h - 2, MADERA[3])
    return im


def mesa_centro(w=50, h=22):
    im, d = lienzo(w, h)
    caja(d, 1, 1, w - 2, 9, MADERA_CLARA, tapa=4)
    for x in (4, w - 8):
        R(d, x, 10, x + 3, h - 2, MADERA_CLARA[2])
    R(d, 8, 10, w - 9, 11, MADERA_CLARA[3])
    return im


LOMOS = [(176, 70, 64), (70, 104, 150), (210, 180, 110), (80, 130, 96), (150, 110, 160), (220, 214, 196), (110, 80, 60)]


def libros(d, x0, x1, base, alto, semilla):
    x, k = x0, semilla
    while x < x1 - 2:
        ancho = 3 + (k * 7) % 4
        a = alto - (k * 5) % 6
        c = LOMOS[k % len(LOMOS)]
        R(d, x, base - a, min(x + ancho - 1, x1), base, c)
        R(d, x, base - a, min(x + ancho - 1, x1), base - a + 1, mezcla(c, (255, 255, 255), 0.3))
        x += ancho + (1 if k % 5 == 0 else 0)
        k += 1


def estante(w, h, m=MADERA, repisas=3):
    im, d = lienzo(w, h)
    R(d, 1, 1, w - 2, h - 2, m[1]); R(d, 1, 1, w - 2, 4, m[0])
    R(d, 5, 6, w - 6, h - 6, m[3])
    paso = (h - 12) // repisas
    for k in range(repisas):
        base = 6 + paso * (k + 1) - 3
        libros(d, 6, w - 7, base, paso - 6, k * 3 + w)
        R(d, 5, base + 1, w - 6, base + 3, m[2])
    R(d, 1, h - 5, w - 2, h - 2, m[2])
    return im


def archivador(w=40, h=52):
    im, d = lienzo(w, h)
    caja(d, 1, 1, w - 2, h - 2, METAL, tapa=3)
    for k in range(3):
        y0 = 7 + k * 14
        R(d, 4, y0, w - 5, y0 + 11, METAL[1]); R(d, 4, y0 + 11, w - 5, y0 + 12, METAL[3])
        R(d, w // 2 - 5, y0 + 4, w // 2 + 4, y0 + 6, METAL[0])
    return im


def planta(w=36, h=48):
    im, d = lienzo(w, h)
    for (cx, cy, r, c) in ((18, 18, 13, HOJA[2]), (11, 22, 9, HOJA[1]), (25, 21, 9, HOJA[1]), (18, 11, 9, HOJA[1]),
                           (14, 9, 5, HOJA[0]), (23, 15, 5, HOJA[0]), (9, 19, 4, HOJA[0])):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c + (255,))
    d.polygon([(7, 31), (w - 8, 31), (w - 11, h - 2), (10, h - 2)], fill=TERRACOTA[1] + (255,))
    R(d, 6, 30, w - 7, 34, TERRACOTA[0]); R(d, 10, h - 4, w - 11, h - 2, TERRACOTA[2])
    return im


def mostrador(w=180, h=64):
    im, d = lienzo(w, h)
    R(d, 26, 0, 54, 12, NEGRO[1]); R(d, 28, 2, 52, 10, (110, 150, 170)); R(d, 38, 12, 42, 14, NEGRO[2])
    R(d, 120, 8, 140, 13, PAPEL[0])
    caja(d, 1, 14, w - 2, 22, MADERA_CLARA, tapa=5)
    R(d, 1, 23, w - 2, h - 2, (88, 122, 110)); R(d, 1, 23, w - 2, 25, (64, 92, 82))
    for x in range(14, w - 10, 38):
        R(d, x, 30, x + 28, h - 8, (100, 138, 124)); R(d, x, h - 9, x + 28, h - 8, (70, 100, 88))
    R(d, 1, h - 4, w - 2, h - 2, (60, 84, 74))
    return im


def sillas_espera(w=120, h=36, tela=AZUL):
    im, d = lienzo(w, h)
    for k in range(4):
        x0 = 2 + k * 29
        d.rounded_rectangle([x0 + 2, 1, x0 + 24, 15], 3, fill=tela[1] + (255,))
        R(d, x0 + 4, 3, x0 + 22, 5, tela[0])
        R(d, x0, 15, x0 + 26, 20, tela[0]); R(d, x0, 19, x0 + 26, 20, tela[2])
    R(d, 2, 21, w - 3, 24, METAL[2])
    for x in (6, w - 9):
        R(d, x, 25, x + 2, h - 3, METAL[1]); R(d, x - 3, h - 3, x + 5, h - 2, METAL[3])
    return im


def pupitre(w=46, h=36):
    im, d = lienzo(w, h)
    d.rounded_rectangle([26, 1, 43, 16], 3, fill=AZUL[1] + (255,)); R(d, 28, 3, 41, 5, AZUL[0])
    R(d, 18, 16, 44, 20, AZUL[0]); R(d, 18, 19, 44, 20, AZUL[2])
    caja(d, 1, 9, 30, 14, MADERA_CLARA, tapa=3)
    for x in (4, 26, 40):
        R(d, x, 21 if x > 20 else 15, x + 1, h - 2, METAL[2])
    R(d, 4, h - 3, 41, h - 2, METAL[3])
    return im


def tablero(w=180, h=110):
    im, d = lienzo(w, h)
    R(d, 1, 1, w - 2, 66, METAL[1]); R(d, 4, 4, w - 5, 63, BLANCO[0])
    d.line([(20, 20), (60, 20)], fill=(70, 104, 150, 255), width=2)
    d.line([(20, 30), (80, 30)], fill=(70, 104, 150, 255), width=2)
    d.ellipse([110, 16, 140, 44], outline=(176, 70, 64, 255), width=2)
    d.line([(90, 44), (106, 32)], fill=(176, 70, 64, 255), width=2)
    d.line([(20, 46), (70, 46)], fill=(80, 130, 96, 255), width=2)
    R(d, 30, 66, w - 31, 70, METAL[2]); R(d, 60, 64, 72, 66, (70, 104, 150))
    return im


def cartelera(w=90, h=100):
    im, d = lienzo(w, h)
    R(d, 1, 1, w - 2, 56, MADERA[1]); R(d, 4, 4, w - 5, 53, (178, 138, 94))
    for (x0, y0, x1, y1, c) in ((10, 9, 32, 30, PAPEL[0]), (38, 8, 58, 24, (230, 214, 150)), (62, 12, 82, 36, (170, 206, 214)),
                                 (16, 34, 40, 50, (216, 186, 196)), (46, 30, 64, 48, PAPEL[1])):
        R(d, x0, y0, x1, y1, c)
        R(d, (x0 + x1) // 2, y0 + 1, (x0 + x1) // 2 + 1, y0 + 2, (176, 70, 64))
        for yy in range(y0 + 5, y1 - 2, 4):
            R(d, x0 + 3, yy, x1 - 4, yy, osc(c, 0.75))
    return im


def mesa_cafeteria(w=56, h=34):
    im, d = lienzo(w, h)
    d.ellipse([1, 1, w - 2, 13], fill=BLANCO[1] + (255,)); d.ellipse([3, 1, w - 4, 10], fill=BLANCO[0] + (255,))
    R(d, w // 2 - 2, 13, w // 2 + 1, h - 6, METAL[2])
    d.ellipse([w // 2 - 12, h - 7, w // 2 + 11, h - 2], fill=METAL[3] + (255,))
    return im


def silla_cafeteria(w=22, h=32):
    im, d = lienzo(w, h)
    R(d, 3, 1, w - 4, 12, TERRACOTA[1]); R(d, 3, 1, w - 4, 3, TERRACOTA[0])
    R(d, 2, 14, w - 3, 18, TERRACOTA[0]); R(d, 2, 17, w - 3, 18, TERRACOTA[2])
    for x in (3, w - 5):
        R(d, x, 12, x + 1, 14, METAL[2]); R(d, x, 19, x + 1, h - 2, METAL[2])
    return im


def barra_cafeteria(w=200, h=70):
    im, d = lienzo(w, h)
    R(d, 20, 2, 96, 20, (150, 186, 196)); R(d, 22, 4, 94, 6, (196, 222, 226))
    for k, x in enumerate(range(28, 90, 14)):
        d.ellipse([x, 12, x + 9, 18], fill=((210, 160, 100), (186, 120, 80), (230, 200, 140))[k % 3] + (255,))
    R(d, 140, 0, 170, 20, METAL[1]); R(d, 142, 2, 168, 8, NEGRO[1]); R(d, 152, 12, 158, 16, NEGRO[2])
    R(d, 176, 10, 186, 20, BLANCO[0])
    caja(d, 1, 20, w - 2, 28, MADERA_CLARA, tapa=5)
    R(d, 1, 29, w - 2, h - 2, MADERA[2])
    for x in range(6, w - 6, 12):
        R(d, x, 32, x + 7, h - 6, MADERA[1]); R(d, x + 7, 32, x + 8, h - 6, MADERA[3])
    R(d, 1, h - 4, w - 2, h - 2, MADERA[3])
    return im


def camilla(w=104, h=42):
    im, d = lienzo(w, h)
    R(d, 4, 3, 30, 12, BLANCO[0]); R(d, 4, 10, 30, 12, BLANCO[2])
    R(d, 2, 10, w - 3, 18, BLANCO[1]); R(d, 2, 10, w - 3, 11, BLANCO[0])
    R(d, 36, 11, w - 6, 17, (160, 200, 180)); R(d, 36, 16, w - 6, 17, (120, 160, 140))
    R(d, 1, 19, w - 2, 22, METAL[1])
    for x in (6, w - 9):
        R(d, x, 23, x + 2, h - 6, METAL[2]); d.ellipse([x - 2, h - 6, x + 4, h - 2], fill=NEGRO[2] + (255,))
    R(d, 6, 30, w - 7, 31, METAL[3])
    return im


def vitrina(w=56, h=70):
    im, d = lienzo(w, h)
    caja(d, 1, 1, w - 2, h - 2, BLANCO, tapa=3)
    R(d, 5, 7, w - 6, 40, (150, 184, 192)); R(d, w // 2, 7, w // 2, 40, BLANCO[2])
    for k, yy in enumerate((19, 31)):
        R(d, 5, yy, w - 6, yy + 1, BLANCO[2])
        for j, x in enumerate(range(8, w - 10, 7)):
            c = ((176, 70, 64), (220, 200, 120), (90, 140, 180), (230, 230, 226))[(j + k) % 4]
            R(d, x, yy - 7, x + 3, yy - 1, c)
    R(d, 5, 44, w - 6, h - 6, BLANCO[1]); R(d, w // 2, 44, w // 2, h - 6, BLANCO[3])
    R(d, w // 2 - 4, 54, w // 2 - 2, 57, METAL[2]); R(d, w // 2 + 2, 54, w // 2 + 4, 57, METAL[2])
    return im


def biombo(w=70, h=60):
    im, d = lienzo(w, h)
    for k in range(3):
        x0 = 1 + k * 23
        R(d, x0, 1, x0 + 22, h - 7, METAL[2])
        R(d, x0 + 2, 3, x0 + 20, h - 9, (196, 220, 206) if k % 2 == 0 else (172, 200, 186))
        for yy in range(8, h - 12, 8):
            R(d, x0 + 2, yy, x0 + 20, yy, (150, 180, 166))
    for x in (2, 24, 46, 67):
        R(d, x, h - 6, x + 1, h - 2, METAL[3])
    return im


def lavamanos(w=40, h=46):
    im, d = lienzo(w, h)
    R(d, 18, 2, 21, 10, METAL[1]); R(d, 18, 2, 27, 4, METAL[0])
    d.ellipse([1, 9, w - 2, 21], fill=BLANCO[1] + (255,)); d.ellipse([5, 10, w - 6, 16], fill=BLANCO[3] + (255,))
    R(d, 14, 21, w - 15, h - 2, BLANCO[1]); R(d, 14, 21, 16, h - 2, BLANCO[0])
    return im


def mesa_estudio(w=130, h=44):
    im, d = lienzo(w, h)
    for x in (24, w - 30):
        R(d, x - 2, 6, x + 1, 10, MADERA[3])
        d.polygon([(x - 9, 6), (x - 5, 0), (x + 4, 0), (x + 8, 6)], fill=(60, 120, 80, 255))
        R(d, x - 9, 6, x + 8, 7, (40, 86, 56))
    R(d, 50, 6, 66, 9, PAPEL[0]); R(d, 70, 7, 80, 9, LOMOS[1])
    caja(d, 1, 10, w - 2, 18, MADERA, tapa=5)
    for x in (4, w - 8):
        R(d, x, 19, x + 3, h - 2, MADERA[2])
    R(d, 8, 19, w - 9, 22, MADERA[3])
    return im


def banca(w=100, h=30):
    im, d = lienzo(w, h)
    for k, yy in enumerate((1, 5)):
        R(d, 3, yy, w - 4, yy + 2, MADERA_CLARA[1 if k else 0])
    R(d, 8, 4, 10, 10, NEGRO[2]); R(d, w - 11, 4, w - 9, 10, NEGRO[2])
    for k, yy in enumerate((10, 13, 16)):
        R(d, 1, yy, w - 2, yy + 2, MADERA_CLARA[k % 2])
    for x in (6, w - 10):
        R(d, x, 19, x + 3, h - 2, NEGRO[1])
    return im


def caneca(w=26, h=34):
    im, d = lienzo(w, h)
    R(d, 2, 1, w - 3, 6, (50, 96, 74)); R(d, 2, 1, w - 3, 2, (70, 126, 98))
    R(d, 3, 7, w - 4, h - 2, (70, 126, 98)); R(d, 3, 7, 5, h - 2, (90, 150, 118))
    d.polygon([(w // 2, 13), (w // 2 - 6, 24), (w // 2 + 6, 24)], outline=(220, 230, 220, 255))
    return im


def dispensador(w=26, h=52):
    im, d = lienzo(w, h)
    d.rounded_rectangle([5, 1, w - 6, 16], 4, fill=(120, 170, 210, 255)); R(d, 7, 3, 9, 13, (180, 214, 236))
    caja(d, 2, 16, w - 3, h - 2, BLANCO, tapa=3)
    R(d, 7, 24, 10, 28, (70, 120, 180)); R(d, 15, 24, 18, 28, (176, 70, 64))
    R(d, 6, 32, w - 7, 34, BLANCO[3])
    return im


def porteria(w=120, h=86):
    im, d = lienzo(w, h)
    R(d, 1, 8, w - 2, 18, NEGRO[1]); R(d, 1, 8, w - 2, 10, NEGRO[0])
    R(d, 6, 19, w - 7, h - 2, (200, 192, 172)); R(d, 6, 19, 8, h - 2, (220, 214, 196))
    R(d, 14, 28, w - 15, 54, (60, 64, 70)); R(d, 16, 30, w - 17, 52, (110, 146, 166))
    d.polygon([(22, 52), (40, 30), (48, 30), (30, 52)], fill=(160, 190, 204, 255))
    R(d, w // 2, 30, w // 2 + 1, 52, (60, 64, 70))
    R(d, 10, 56, w - 11, 60, (170, 160, 140))
    R(d, 6, h - 6, w - 7, h - 2, (150, 140, 124))
    return im


def tapete(w=120, h=40):
    im, d = lienzo(w, h)
    d.polygon([(10, 1), (w - 11, 1), (w - 2, h - 2), (1, h - 2)], fill=MALVA[2] + (255,))
    d.polygon([(15, 4), (w - 16, 4), (w - 8, h - 5), (7, h - 5)], fill=MALVA[1] + (255,))
    d.polygon([(w // 2, 8), (w // 2 + 24, h // 2), (w // 2, h - 9), (w // 2 - 24, h // 2)], fill=MALVA[0] + (255,))
    d.polygon([(w // 2, 14), (w // 2 + 10, h // 2), (w // 2, h - 15), (w // 2 - 10, h // 2)], fill=(214, 186, 150, 255))
    return im


MUEBLES = {
    'escritorio': escritorio, 'silla-oficina': silla_oficina, 'silla-visitante': silla_visitante,
    'sillon': sillon, 'sofa': sofa, 'mesa-centro': mesa_centro,
    'estante-libros': lambda: estante(62, 74, MADERA, 3), 'archivador': archivador, 'planta': planta,
    'mostrador': mostrador, 'sillas-espera': sillas_espera, 'pupitre': pupitre, 'tablero': tablero,
    'cartelera': cartelera, 'mesa-cafeteria': mesa_cafeteria, 'silla-cafeteria': silla_cafeteria,
    'barra-cafeteria': barra_cafeteria, 'camilla': camilla, 'vitrina-medicamentos': vitrina, 'biombo': biombo,
    'lavamanos': lavamanos, 'mesa-estudio': mesa_estudio,
    'estante-biblioteca': lambda: estante(96, 96, ((134, 92, 62), (100, 66, 44), (78, 52, 36), (56, 38, 26)), 4),
    'banca': banca, 'caneca': caneca, 'dispensador-agua': dispensador, 'porteria': porteria, 'tapete': tapete,
}


# ── objetos y herramientas (32x32) ─────────────────────────────────────────────

def folleto():
    im, d = lienzo(32, 32)
    for k, (x0, c) in enumerate(((3, (226, 222, 208)), (12, (210, 206, 192)), (21, (226, 222, 208)))):
        d.polygon([(x0, 6 + (k % 2) * 2), (x0 + 9, 6 + ((k + 1) % 2) * 2), (x0 + 9, 28 - ((k + 1) % 2) * 2), (x0, 28 - (k % 2) * 2)],
                  fill=c + (255,))
        R(d, x0 + 1, 9, x0 + 7, 11, (70, 140, 130))
        for yy in (15, 18, 21):
            R(d, x0 + 1, yy, x0 + 6, yy, (150, 150, 146))
    return im


def afiche():
    """Afiche en un caballete, de pie en el piso: el objeto vive en el suelo de la sala."""
    im, d = lienzo(32, 32)
    d.line([(9, 30), (13, 6)], fill=MADERA[2] + (255,), width=2)
    d.line([(22, 30), (18, 6)], fill=MADERA[2] + (255,), width=2)
    R(d, 6, 3, 25, 22, (230, 226, 212)); R(d, 6, 3, 25, 7, (100, 160, 130))
    d.ellipse([9, 10, 16, 16], fill=(200, 100, 110, 255)); d.ellipse([15, 10, 22, 16], fill=(200, 100, 110, 255))
    d.polygon([(9, 14), (22, 14), (15, 21)], fill=(200, 100, 110, 255))
    return im


def portapapeles(marca):
    im, d = lienzo(32, 32)
    R(d, 5, 3, 26, 30, MADERA[1]); R(d, 7, 6, 24, 28, (232, 228, 214))
    R(d, 11, 2, 20, 6, METAL[2]); R(d, 13, 1, 18, 2, METAL[1])
    marca(d)
    return im


def planilla():
    def marca(d):
        for yy in (10, 15, 20, 25):
            R(d, 9, yy, 12, yy + 2, (120, 120, 116)); R(d, 14, yy + 1, 22, yy + 1, (150, 150, 146))
    return portapapeles(marca)


def ficha_riesgo():
    def marca(d):
        for k, (yy, c) in enumerate(((10, (100, 170, 110)), (16, (220, 190, 90)), (22, (200, 90, 80)))):
            R(d, 9, yy, 12, yy + 3, c); R(d, 15, yy + 1, 22, yy + 2, (150, 150, 146))
        d.line([(9, 12), (10, 13), (13, 9)], fill=(40, 40, 46, 255), width=1)
    return portapapeles(marca)


def vaso():
    """Vaso pequeño (a escala de una mesa), apoyado en el borde inferior del icono."""
    im, d = lienzo(32, 32)
    d.polygon([(12, 16), (20, 16), (19, 30), (13, 30)], fill=(196, 222, 230, 255))
    d.polygon([(12, 21), (20, 21), (19, 29), (13, 29)], fill=(120, 176, 210, 255))
    R(d, 14, 18, 14, 27, (236, 246, 250))
    return im


def celular():
    """Celular acostado sobre la mesa, con la pantalla encendida."""
    im, d = lienzo(32, 32)
    d.polygon([(8, 26), (22, 22), (26, 26), (12, 30)], fill=NEGRO[2] + (255,))
    d.polygon([(10, 26), (21, 23), (24, 26), (13, 29)], fill=(110, 160, 214, 255))
    d.ellipse([20, 22, 24, 25], fill=(220, 90, 80, 255))
    return im


def mochila():
    im, d = lienzo(32, 32)
    d.rounded_rectangle([7, 4, 24, 29], 5, fill=AZUL[1] + (255,))
    R(d, 9, 6, 22, 9, AZUL[0]); d.rounded_rectangle([10, 17, 21, 27], 2, fill=AZUL[2] + (255,))
    R(d, 12, 18, 19, 19, (220, 190, 110)); d.arc([11, 0, 20, 8], 180, 360, fill=AZUL[3] + (255,), width=2)
    return im


def libro(color, simbolo):
    im, d = lienzo(32, 32)
    R(d, 6, 3, 25, 29, color[2]); R(d, 8, 3, 25, 27, color[1]); R(d, 8, 3, 25, 5, color[0])
    R(d, 9, 27, 25, 29, (230, 226, 212))
    simbolo(d)
    return im


def directorio():
    def s(d):
        d.ellipse([12, 9, 21, 18], fill=(230, 226, 212, 255)); d.ellipse([15, 12, 18, 15], fill=(176, 70, 64, 255))
        d.polygon([(13, 16), (20, 16), (16, 23)], fill=(230, 226, 212, 255))
    return libro(((100, 160, 150), (70, 130, 120), (50, 96, 90)), s)


def guia_pap():
    def s(d):
        d.ellipse([10, 10, 16, 16], fill=(220, 110, 120, 255)); d.ellipse([16, 10, 22, 16], fill=(220, 110, 120, 255))
        d.polygon([(10, 14), (22, 14), (16, 22)], fill=(220, 110, 120, 255)); R(d, 15, 11, 16, 17, (240, 236, 226))
        R(d, 13, 13, 18, 14, (240, 236, 226))
    return libro(((110, 130, 180), (84, 104, 150), (60, 78, 116)), s)


def protocolo():
    im, d = lienzo(32, 32)
    R(d, 4, 6, 14, 9, (70, 104, 150)); R(d, 4, 8, 27, 28, (84, 120, 166)); R(d, 4, 8, 27, 10, (110, 146, 190))
    R(d, 8, 4, 25, 12, (232, 228, 214))
    d.ellipse([13, 14, 23, 24], fill=(214, 200, 140, 255)); d.ellipse([15, 16, 21, 22], fill=(190, 170, 100, 255))
    d.polygon([(14, 22), (17, 22), (15, 28)], fill=(176, 70, 64, 255)); d.polygon([(19, 22), (22, 22), (21, 28)], fill=(176, 70, 64, 255))
    return im


ICONOS = {
    'folleto-rutas': folleto, 'afiche-bienestar': afiche, 'planilla-turnos': planilla, 'vaso-agua': vaso,
    'celular': celular, 'mochila': mochila, 'ficha-riesgo': ficha_riesgo, 'directorio-rutas': directorio,
    'guia-primeros-auxilios': guia_pap, 'protocolo-bienestar': protocolo,
}


# ── acabado ────────────────────────────────────────────────────────────────────

def terminar_sprite(im, max_colores):
    """Alfa binario, a lo sumo max_colores (contando el contorno) y contorno de 1 px."""
    arr = np.array(im.convert('RGBA'))
    mascara = arr[:, :, 3] >= 128
    rgb = Image.fromarray(arr[:, :, :3], 'RGB')
    cuant = np.array(rgb.convert('P', palette=Image.Palette.ADAPTIVE, colors=max_colores - 1, dither=Image.Dither.NONE).convert('RGB'))
    usados = np.unique(arr[:, :, :3][mascara], axis=0)
    if len(usados) <= max_colores - 1:
        cuant = arr[:, :, :3]
    borde = ndimage.binary_dilation(mascara) & ~mascara
    salida = np.zeros_like(arr)
    salida[mascara, :3] = cuant[mascara]
    salida[mascara, 3] = 255
    salida[borde, :3] = CONTORNO
    salida[borde, 3] = 255
    return Image.fromarray(salida, 'RGBA')


def generar(ruta_escenario, factor=2, salas=None):
    base = os.path.dirname(os.path.abspath(ruta_escenario))
    with open(ruta_escenario, encoding='utf-8') as f:
        esc = json.load(f)
    faltan = ([s['id'] for s in esc['salas'] if s['id'] not in SALAS]
              + [m['id'] for m in esc['catalogo']['muebles'] if m['id'] not in MUEBLES]
              + [o['id'] for o in esc['catalogo']['objetos'] + esc['catalogo']['herramientas'] if o['id'] not in ICONOS])
    if faltan:
        raise SystemExit(f"No hay dibujo para: {', '.join(faltan)}")

    rutas = ([s['fondo'] for s in esc['salas']] + [m['arte'] for m in esc['catalogo']['muebles']]
             + [o['arte'] for o in esc['catalogo']['objetos'] + esc['catalogo']['herramientas']])
    for relativa in rutas:  # antes de dibujar nada: ninguna imagen se escribe fuera del escenario
        dentro_de(base, relativa)

    def destino(relativa):
        ruta = dentro_de(base, relativa)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        return ruta

    hechos = []
    with tempfile.TemporaryDirectory() as tmp:
        for sala in esc['salas']:
            if salas and sala['id'] not in salas:
                continue
            crudo = os.path.join(tmp, f"{sala['id']}.png")
            fondo_sala(sala, SALAS[sala['id']]).save(crudo)
            pixelar_sala(crudo, destino(sala['fondo']), factor, 32, remuestreo='cercano')
            hechos.append(sala['fondo'])
    for mueble in esc['catalogo']['muebles']:
        im = MUEBLES[mueble['id']]()
        if im.width != mueble['ancho']:
            raise SystemExit(f"El dibujo de {mueble['id']} mide {im.width} de ancho y el catálogo dice {mueble['ancho']}")
        terminar_sprite(im, 24).save(destino(mueble['arte']))
        hechos.append(mueble['arte'])
    for pieza in esc['catalogo']['objetos'] + esc['catalogo']['herramientas']:
        terminar_sprite(ICONOS[pieza['id']](), 16).save(destino(pieza['arte']))
        hechos.append(pieza['arte'])
    return hechos


if __name__ == '__main__':
    args = sys.argv[1:]
    opciones = {}
    for clave in ('--factor', '--salas'):
        if clave in args:
            i = args.index(clave)
            opciones[clave] = args[i + 1]
            del args[i:i + 2]
    if len(args) != 1:
        raise SystemExit('Uso: python tools/escenarios/arte_universidad.py <escenario.json> [--factor N] [--salas a,b]')
    hechos = generar(args[0], factor=int(opciones.get('--factor', 2)),
                     salas=opciones['--salas'].split(',') if '--salas' in opciones else None)
    print(f'{len(hechos)} pieza(s) dibujada(s)')
