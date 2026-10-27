"""Fondos de las salas de atención de la comisaría de familia (segundo grupo): orientación
jurídica, despacho de la comisaria, consultorio psicosocial y sala de entrevista (cámara de Gesell).

Paleta institucional fría y apagada de biblioteca/escenarios/ESTILO.md (sección 8), un acento por
sala, sin texto legible, personas, escudos ni nada violento. Cada sala exporta su paleta en
SALAS y, cuando necesita algo propio sobre la pared del fondo, una función en PROPIOS que
fondo_sala llama después de la lista `deco` y antes de las paredes laterales y las puertas.

Pared del fondo: x 96..864 (tres paredes) o 96..960 (esquina izquierda), y 84..229.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from arte_comun import SEAM, cuadro, mezcla, osc, reloj  # noqa: E402

BLANCO = (255, 255, 255)
MARCO_PUERTA = dict(puerta=(96, 84, 74), marco=(58, 56, 56))


def _caja(d, x0, y0, x1, y1, relleno, borde=None):
    d.rectangle([x0, y0, x1, y1], fill=borde or osc(relleno, 0.7))
    d.rectangle([x0 + 2, y0 + 2, x1 - 2, y1 - 2], fill=relleno)


def _estrella(d, cx, cy, r, color):
    import math
    pts = []
    for k in range(10):
        ang = -math.pi / 2 + k * math.pi / 5
        rr = r if k % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    d.polygon(pts, fill=color)


def _nube(d, cx, cy, color):
    d.ellipse([cx - 14, cy - 3, cx + 2, cy + 9], fill=color)
    d.ellipse([cx - 6, cy - 9, cx + 10, cy + 7], fill=color)
    d.ellipse([cx + 2, cy - 4, cx + 16, cy + 9], fill=color)
    d.rectangle([cx - 8, cy + 2, cx + 10, cy + 9], fill=color)


def _repisa(d, x0, x1, y, madera=(92, 72, 54)):
    d.rectangle([x0, y, x1, y + 5], fill=madera)
    d.rectangle([x0, y + 5, x1, y + 6], fill=osc(madera, 0.62))
    for x in (x0 + 10, x1 - 10):
        d.polygon([(x - 3, y + 6), (x + 3, y + 6), (x, y + 16)], fill=osc(madera, 0.72))


def _lomos(d, x0, x1, base, colores, alto=26):
    """Tiras verticales de libros apoyadas en `base`; los colores se repiten en orden."""
    x, k = x0, 0
    while x < x1 - 3:
        ancho = 7 + (k * 3) % 4
        a = alto - (k * 5) % 7
        c = colores[k % len(colores)]
        d.rectangle([x, base - a, min(x + ancho - 1, x1), base], fill=c)
        d.rectangle([x, base - a, min(x + ancho - 1, x1), base - a + 1], fill=mezcla(c, BLANCO, 0.28))
        x += ancho + (1 if k % 4 == 0 else 0)
        k += 1


# ── orientación jurídica ───────────────────────────────────────────────────────

VINOTINTO, AZUL_COD, VERDE_COD = (112, 46, 56), (50, 74, 118), (54, 98, 74)


def propio_orientacion(d, sala, p):
    # repisa alta con los códigos: lomos vinotinto, azul y verde (el acento de la sala)
    _repisa(d, 300, 660, 158)
    _lomos(d, 308, 652, 158, [VINOTINTO, AZUL_COD, VERDE_COD, VINOTINTO, AZUL_COD, VERDE_COD, AZUL_COD], alto=38)
    # un cuadro enmarcado sin texto: marco y paspartú claro con un óvalo suave
    cx, y0, w, h = 752, 106, 76, 56
    d.rectangle([cx - w // 2 - 5, y0 - 5, cx + w // 2 + 5, y0 + h + 5], fill=(66, 54, 46))
    d.rectangle([cx - w // 2, y0, cx + w // 2, y0 + h], fill=(200, 194, 180))
    d.rectangle([cx - w // 2 + 8, y0 + 8, cx + w // 2 - 8, y0 + h - 8], fill=(86, 104, 122))
    d.ellipse([cx - 14, y0 + 14, cx + 14, y0 + h - 14], fill=(122, 144, 160))
    # reloj de pared a la izquierda, sobre el estante
    reloj(d, 150, 124)


# ── despacho de la comisaria ───────────────────────────────────────────────────

def propio_despacho(d, sala, p):
    # diploma enmarcado sin texto: papel claro, marco oscuro, sello y cinta (el acento es la bandera)
    cx, y0, w, h = 596, 104, 84, 60
    d.rectangle([cx - w // 2 - 5, y0 - 5, cx + w // 2 + 5, y0 + h + 5], fill=(48, 36, 30))
    d.rectangle([cx - w // 2, y0, cx + w // 2, y0 + h], fill=(206, 200, 184))
    d.rectangle([cx - w // 2 + 6, y0 + 6, cx + w // 2 - 6, y0 + h - 6], fill=(220, 216, 200))
    for yy in (y0 + 14, y0 + 22):
        d.rectangle([cx - 24, yy, cx + 24, yy + 1], fill=(150, 148, 140))
    d.ellipse([cx - 7, y0 + 32, cx + 7, y0 + 46], fill=(150, 62, 60))
    d.polygon([(cx - 5, y0 + 44), (cx - 1, y0 + 44), (cx - 4, y0 + 52)], fill=(150, 62, 60))
    d.polygon([(cx + 1, y0 + 44), (cx + 5, y0 + 44), (cx + 4, y0 + 52)], fill=(150, 62, 60))
    # cuadro apaisado a la derecha, claro y sin dibujo reconocible
    cuadro(d, 700, 114, 52, 38, ((184, 188, 190), (96, 120, 140), (140, 156, 150)))


# ── consultorio psicosocial ────────────────────────────────────────────────────

def propio_consultorio(d, sala, p):
    # repisa a la derecha con una planta pequeña y una caja (sin textos)
    x0, x1, y = 740, 860, 150
    _repisa(d, x0, x1, y, madera=(112, 84, 62))
    # maceta
    d.polygon([(776, y - 14), (800, y - 14), (797, y), (779, y)], fill=(170, 100, 76))
    d.rectangle([774, y - 17, 802, y - 13], fill=(194, 122, 92))
    # hojas
    for (hx, hy, r, c) in ((788, y - 34, 11, (86, 150, 92)), (777, y - 26, 8, (110, 172, 110)),
                           (800, y - 27, 8, (110, 172, 110)), (788, y - 42, 6, (134, 190, 126))):
        d.ellipse([hx - r, hy - r, hx + r, hy + r], fill=c)
    # caja de pañuelos / archivo pequeño, lisa
    d.rectangle([826, y - 16, 850, y], fill=(176, 186, 180))
    d.rectangle([826, y - 16, 850, y - 14], fill=(206, 214, 208))
    # cuadro suave de colores calmados
    cuadro(d, 560, 114, 70, 48, ((206, 210, 200), (150, 176, 170), (190, 168, 128)))


# ── sala de entrevista: cámara de Gesell ───────────────────────────────────────

def propio_entrevista(d, sala, p):
    # espejo grande de observación en el centro de la pared: vidrio oscuro con reflejo suave
    cx, y0, w, h = 590, 98, 264, 82
    x0, x1, y1 = cx - w // 2, cx + w // 2, y0 + h
    d.rectangle([x0 - 7, y0 - 7, x1 + 7, y1 + 7], fill=(40, 48, 58))
    d.rectangle([x0 - 4, y0 - 4, x1 + 4, y1 + 4], fill=(86, 96, 108))
    d.rectangle([x0 - 1, y0 - 1, x1 + 1, y1 + 1], fill=(40, 48, 58))
    d.rectangle([x0, y0, x1, y1], fill=(44, 62, 80))
    d.rectangle([x0, y0 + h // 2, x1, y1], fill=(36, 52, 68))
    for s, bw, c in ((34, 26, (66, 92, 114)), (84, 10, (66, 92, 114)), (178, 14, (66, 92, 114))):
        d.polygon([(x0 + s, y1), (x0 + s + bw, y1), (x0 + s + bw + 46, y0), (x0 + s + 46, y0)], fill=c)
    d.rectangle([x0, y0, x1, y0 + 2], fill=(60, 82, 104))   # borde de luz arriba
    # repisa fina bajo el espejo
    d.rectangle([x0 - 12, y1 + 9, x1 + 12, y1 + 12], fill=(72, 82, 94))

    # friso infantil bajo: banda clara con figuras geométricas suaves
    base = p['pared']
    banda = mezcla(base, BLANCO, 0.16)
    d.rectangle([96, 198, 960, 222], fill=banda)
    d.rectangle([96, 196, 960, 198], fill=mezcla(base, BLANCO, 0.3))
    d.rectangle([96, 222, 960, 223], fill=osc(base, 0.8))
    colores = [(214, 190, 120), (206, 130, 122), (126, 180, 140), (162, 142, 192)]
    k = 0
    for x in range(124, 940, 52):
        c = colores[k % 4]
        f = k % 4
        if f == 0:
            d.ellipse([x - 8, 202, x + 8, 218], fill=c)
        elif f == 1:
            _estrella(d, x, 210, 10, c)
        elif f == 2:
            _nube(d, x, 210, mezcla(c, BLANCO, 0.25))
        else:
            d.polygon([(x - 9, 218), (x + 9, 218), (x, 202)], fill=c)
        k += 1
    # reloj y un cuadro infantil de formas
    reloj(d, 852, 128)
    cuadro(d, 292, 116, 64, 44, ((208, 206, 196), (212, 176, 120), (130, 176, 150)))


SALAS = {
    'orientacion-juridica': dict(
        pared=(110, 106, 98), lado=(92, 88, 82), canto=(150, 144, 132), zocalo=(62, 58, 54),
        baja=(40, (96, 92, 84)), moldura=(130, 124, 112),
        piso='baldosa', pisoA=(132, 126, 114), pisoB=(122, 116, 106), junta=(98, 92, 84),
        tapete=(84, 82, 80), **MARCO_PUERTA,
        deco=[],
        luces=[(480, 380)], luz=(244, 238, 222)),
    'despacho-comisaria': dict(
        pared=(70, 92, 104), lado=(58, 76, 88), canto=(124, 144, 154), zocalo=(44, 34, 28),
        baja=(46, (96, 74, 56)), paneles=(108, 82, 60), moldura=(140, 110, 80),
        piso='madera', pisoA=(126, 94, 68), pisoB=(116, 86, 62), pisoC=(108, 80, 58), junta=(84, 60, 44),
        tapete=(74, 72, 70), persiana=(176, 188, 192), **MARCO_PUERTA,
        deco=[('persiana', 412, 106, 128, 66)]),
    'consultorio-psicosocial': dict(
        pared=(82, 106, 98), lado=(66, 86, 80), canto=(132, 156, 148), zocalo=(54, 44, 38),
        piso='madera', pisoA=(132, 98, 72), pisoB=(122, 90, 66), pisoC=(114, 84, 62), junta=(88, 62, 46),
        tapete=(76, 74, 72), persiana=(190, 200, 190), **MARCO_PUERTA,
        deco=[('persiana', 330, 108, 136, 68)]),
    'sala-entrevista-nna': dict(
        pared=(96, 120, 134), lado=(80, 100, 114), canto=(140, 158, 168), zocalo=(58, 74, 86),
        piso='alfombra', pisoA=(112, 130, 114), pisoB=(102, 118, 104),
        tapete=(76, 94, 90), **MARCO_PUERTA,
        deco=[],
        luces=[(480, 390)], luz=(240, 240, 226)),
}

PROPIOS = {
    'orientacion-juridica': propio_orientacion,
    'despacho-comisaria': propio_despacho,
    'consultorio-psicosocial': propio_consultorio,
    'sala-entrevista-nna': propio_entrevista,
}
