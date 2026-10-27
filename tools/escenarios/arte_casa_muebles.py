"""Muebles de la casa (P4) dibujados por código, a escala 1 y de frente un poco desde arriba.

Cada función sin argumentos devuelve un sprite RGBA cuyo ANCHO es exactamente el del catálogo
(`biblioteca/escenarios/casa/escenario.json`); el alto suele ser mayor que la caja de choque,
porque el mueble se ve de frente. El borde inferior del dibujo es el punto de apoyo en el piso.
Deja 1 px transparente en el borde para que el acabado (`terminar_sprite`) pueda poner el contorno.

Paleta cálida y apagada (ESTILO.md, «Casa»). Nada de violencia ni de objetos rotos: sin cuchillos
(en el mesón solo hay una olla, una tabla y frutas), sin botellas, sin texto legible.

    MUEBLES          {id: función -> Image RGBA}, los 20 muebles
    ICONOS_PROPIOS   {'ficha-plan-seguridad': función -> Image RGBA 32x32}
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from arte_comun import (  # noqa: E402
    HOJA, MADERA, MADERA_CLARA, MALVA, METAL, NEGRO, PAPEL, TERRACOTA, VERDE_TELA,
    R, caja, lienzo, portapapeles,
)

CREMA = ((232, 224, 204), (204, 196, 176), (166, 158, 140), (122, 116, 102))
CELESTE = ((150, 186, 214), (116, 156, 190), (86, 120, 152), (60, 88, 112))
PINO = ((214, 178, 122), (184, 146, 94), (148, 112, 70), (108, 78, 48))
LATON = (206, 170, 96)
AMARILLO = (232, 200, 100)
NARANJA = (224, 148, 62)
ROJO = (192, 76, 64)
LIMA = (150, 186, 84)


def poli(d, puntos, c):
    d.polygon(puntos, fill=tuple(c) + (255,))


def elipse(d, caja_, c):
    d.ellipse(caja_, fill=tuple(c) + (255,))


# ── sala ───────────────────────────────────────────────────────────────────────

def sofa_casa():
    w, h = 90, 40
    im, d = lienzo(w, h)
    T = VERDE_TELA
    d.rounded_rectangle([4, 1, w - 5, 24], 5, fill=T[1] + (255,))
    R(d, 8, 3, w - 9, 6, T[0])
    R(d, w // 2, 7, w // 2, 22, T[2])
    R(d, 1, 13, 10, 35, T[2]); R(d, w - 11, 13, w - 2, 35, T[1])
    R(d, 1, 13, 10, 15, T[0]); R(d, w - 11, 13, w - 2, 15, T[0])
    for x0, x1 in ((11, w // 2 - 1), (w // 2 + 1, w - 12)):
        R(d, x0, 22, x1, 30, T[0]); R(d, x0, 29, x1, 30, T[2])
    R(d, 1, 31, w - 2, 36, T[2]); R(d, 1, 35, w - 2, 36, T[3])
    for x in (4, w - 7):
        R(d, x, 37, x + 2, h - 2, MADERA[3])
    # cojín terracota (el acento de la sala) y una manta doblada en el brazo
    poli(d, [(14, 11), (27, 10), (28, 24), (13, 25)], TERRACOTA[1])
    R(d, 14, 11, 27, 12, TERRACOTA[0]); R(d, 13, 24, 28, 25, TERRACOTA[2])
    R(d, w - 11, 11, w - 3, 15, CREMA[1]); R(d, w - 11, 11, w - 3, 12, CREMA[0]); R(d, w - 11, 14, w - 3, 15, CREMA[2])
    return im


def sillon_casa():
    w, h = 46, 38
    im, d = lienzo(w, h)
    T = MALVA
    d.rounded_rectangle([5, 1, w - 6, 22], 5, fill=T[1] + (255,))
    R(d, 8, 3, w - 9, 6, T[0])
    R(d, 1, 12, 9, 32, T[2]); R(d, w - 10, 12, w - 2, 32, T[1])
    R(d, 1, 12, 9, 14, T[0]); R(d, w - 10, 12, w - 2, 14, T[0])
    R(d, 10, 20, w - 11, 27, T[0]); R(d, 10, 26, w - 11, 27, T[2])
    R(d, 1, 28, w - 2, 33, T[2]); R(d, 1, 32, w - 2, 33, T[3])
    for x in (3, w - 6):
        R(d, x, 34, x + 2, h - 2, MADERA[3])
    return im


def mesa_centro_casa():
    w, h = 50, 28
    im, d = lienzo(w, h)
    M = MADERA_CLARA
    # una revista y una taza sobre la tapa
    R(d, 8, 1, 21, 4, CELESTE[1]); R(d, 8, 1, 21, 1, CELESTE[0]); R(d, 8, 4, 21, 5, CREMA[1])
    R(d, 32, 1, 38, 6, CREMA[0]); R(d, 32, 1, 38, 2, CREMA[1]); R(d, 39, 3, 40, 4, CREMA[2])
    caja(d, 1, 6, w - 2, 14, M, tapa=4)
    for x in (4, w - 8):
        R(d, x, 15, x + 3, h - 2, M[2]); R(d, x, 15, x, h - 2, M[1])
    R(d, 8, 22, w - 9, 24, M[1]); R(d, 8, 24, w - 9, 24, M[3])
    return im


def mueble_tv():
    w, h = 100, 30
    im, d = lienzo(w, h)
    M = MADERA
    caja(d, 1, 1, w - 2, 6, M, tapa=3)
    R(d, 1, 8, w - 2, h - 5, M[1]); R(d, 1, h - 5, w - 2, h - 4, M[3])
    # dos puertas con marco y un hueco abierto al centro con el decodificador
    for x0, x1 in ((4, 30), (w - 31, w - 5)):
        R(d, x0, 10, x1, h - 8, M[0]); R(d, x0 + 2, 12, x1 - 2, h - 10, M[2])
        R(d, x0 + 2, 12, x1 - 2, 12, M[3])
        R(d, x1 - 6 if x0 < 50 else x0 + 4, 17, x1 - 5 if x0 < 50 else x0 + 5, 21, LATON)
    R(d, 33, 10, w - 34, h - 8, M[3]); R(d, 33, 10, w - 34, 11, (60, 40, 28))
    R(d, 38, 17, w - 39, 24, NEGRO[1]); R(d, 38, 17, w - 39, 18, NEGRO[0]); R(d, w - 46, 21, w - 43, 22, (110, 190, 130))
    for x in (4, w - 7):
        R(d, x, h - 3, x + 2, h - 2, M[3])
    return im


# ── comedor ────────────────────────────────────────────────────────────────────

def mesa_comedor():
    w, h = 110, 42
    im, d = lienzo(w, h)
    M = MADERA_CLARA
    # patas traseras (más cortas y oscuras) y delanteras
    R(d, 11, 18, 13, 30, M[3]); R(d, w - 14, 18, w - 12, 30, M[3])
    R(d, 3, 22, 6, h - 2, M[2]); R(d, 3, 22, 3, h - 2, M[1])
    R(d, w - 7, 22, w - 4, h - 2, M[2]); R(d, w - 7, 22, w - 7, h - 2, M[1])
    # tapa en perspectiva
    poli(d, [(9, 2), (w - 10, 2), (w - 2, 16), (1, 16)], M[0])
    for y, xi in ((6, 7), (10, 5), (13, 3)):
        R(d, xi, y, w - 1 - xi, y, M[1])
    R(d, 1, 17, w - 2, 20, M[1]); R(d, 1, 20, w - 2, 21, M[2])
    # camino de mesa terracota, dos platos y el frutero
    poli(d, [(30, 3), (w - 31, 3), (w - 26, 15), (25, 15)], TERRACOTA[1])
    R(d, 30, 3, w - 31, 3, TERRACOTA[0])
    for cx in (21, w - 22):
        elipse(d, [cx - 8, 6, cx + 8, 13], CREMA[0]); elipse(d, [cx - 5, 8, cx + 5, 11], CREMA[1])
    elipse(d, [47, 1, 54, 8], NARANJA); elipse(d, [52, 0, 59, 7], ROJO); elipse(d, [57, 1, 64, 8], AMARILLO)
    poli(d, [(44, 6), (66, 6), (62, 13), (48, 13)], CELESTE[1])
    R(d, 44, 6, 66, 6, CELESTE[0]); R(d, 48, 13, 62, 13, CELESTE[2])
    return im


def silla_comedor():
    w, h = 22, 36
    im, d = lienzo(w, h)
    M = MADERA
    R(d, 3, 1, 5, 17, M[1]); R(d, w - 6, 1, w - 4, 17, M[1])
    R(d, 3, 1, w - 4, 3, M[0])
    for x in (8, 11, 14):
        R(d, x, 4, x, 15, M[2])
    R(d, 6, 14, w - 7, 15, M[2])
    R(d, 2, 17, w - 3, 22, TERRACOTA[0]); R(d, 2, 21, w - 3, 22, TERRACOTA[2])
    for x in (3, w - 5):
        R(d, x, 23, x + 1, h - 2, M[2])
    R(d, 5, 27, w - 6, 27, M[3])
    return im


def vitrina_comedor():
    w, h = 60, 76
    im, d = lienzo(w, h)
    M = MADERA
    R(d, 1, 1, w - 2, 4, M[0]); R(d, 1, 5, w - 2, h - 2, M[1]); R(d, 1, 5, w - 2, 6, M[3])
    # cuerpo alto con vidrio: fondo oscuro, dos baldas y su vajilla
    R(d, 5, 8, w - 6, 44, M[3])
    for yy in (21, 33, 44):
        R(d, 5, yy, w - 6, yy + 1, M[2])
    for k, x in enumerate(range(8, w - 12, 8)):  # platos de canto, tazas y vasos
        R(d, x, 11, x + 4, 20, CREMA[0] if k % 2 == 0 else CELESTE[0]); R(d, x + 4, 11, x + 4, 20, CREMA[2])
    for k, x in enumerate(range(8, w - 12, 9)):
        R(d, x, 25, x + 4, 32, (214, 226, 230) if k % 2 == 0 else TERRACOTA[0])
        R(d, x, 25, x + 4, 25, CREMA[0])
    for x in (9, 19, 33, 41):
        R(d, x, 36, x + 3, 43, CELESTE[0] if x % 2 else CREMA[1])
    # brillo del vidrio: un destello corto por hoja
    for x0 in (6, 33):
        R(d, x0, 9, x0, 14, (196, 214, 218)); R(d, x0 + 1, 9, x0 + 1, 10, (196, 214, 218))
    R(d, w // 2, 8, w // 2, 44, M[1])
    # puertas bajas
    R(d, 5, 49, w - 6, h - 8, M[0]); R(d, 8, 52, w // 2 - 2, h - 11, M[1]); R(d, w // 2 + 2, 52, w - 9, h - 11, M[1])
    R(d, w // 2 - 5, 58, w // 2 - 4, 63, LATON); R(d, w // 2 + 4, 58, w // 2 + 5, 63, LATON)
    R(d, 1, h - 7, w - 2, h - 4, M[2]); R(d, 3, h - 3, 6, h - 2, M[3]); R(d, w - 7, h - 3, w - 4, h - 2, M[3])
    return im


# ── cocina ─────────────────────────────────────────────────────────────────────

def nevera():
    w, h = 44, 72
    im, d = lienzo(w, h)
    C = CREMA
    d.rounded_rectangle([2, 1, w - 3, h - 4], 4, fill=C[1] + (255,))
    R(d, 4, 3, 6, h - 7, C[0]); R(d, w - 8, 4, w - 4, h - 7, C[2])
    R(d, 3, 24, w - 4, 25, C[3]); R(d, 3, 26, w - 4, 26, C[2])
    R(d, w - 10, 11, w - 9, 20, METAL[2]); R(d, w - 10, 30, w - 9, 46, METAL[2])
    R(d, w - 10, 11, w - 10, 20, METAL[0]); R(d, w - 10, 30, w - 10, 46, METAL[0])
    R(d, 5, h - 4, 9, h - 2, NEGRO[2]); R(d, w - 10, h - 4, w - 6, h - 2, NEGRO[2])
    return im


def estufa():
    w, h = 56, 56
    im, d = lienzo(w, h)
    C = CREMA
    # una olla con tapa sobre el quemador trasero izquierdo
    R(d, 10, 3, 24, 10, METAL[1]); R(d, 10, 3, 24, 4, METAL[0]); R(d, 10, 10, 24, 10, METAL[3])
    R(d, 15, 1, 19, 2, NEGRO[1]); R(d, 7, 6, 9, 7, NEGRO[2]); R(d, 25, 6, 27, 7, NEGRO[2])
    # plancha con cuatro quemadores
    poli(d, [(4, 11), (w - 5, 11), (w - 2, 23), (1, 23)], NEGRO[2])
    for (x0, y0) in ((9, 12), (33, 12), (6, 18), (36, 18)):
        elipse(d, [x0, y0, x0 + 13, y0 + 4], NEGRO[1]); elipse(d, [x0 + 3, y0 + 1, x0 + 10, y0 + 3], NEGRO[3])
    # frente: panel de perillas y puerta del horno con ventana
    R(d, 1, 24, w - 2, h - 5, C[1]); R(d, 1, 24, w - 2, 25, C[0])
    for x in (8, 18, 38, 48):
        R(d, x, 27, x + 3, 30, NEGRO[1]); R(d, x, 27, x + 3, 27, NEGRO[0])
    R(d, 5, 33, w - 6, h - 8, C[2]); R(d, 6, 34, w - 7, h - 9, C[1])
    R(d, 11, 39, w - 12, h - 12, NEGRO[2]); R(d, 11, 39, w - 12, 40, NEGRO[1])
    R(d, 9, 35, w - 10, 35, METAL[1]); R(d, 9, 36, w - 10, 36, METAL[3])
    R(d, 3, h - 4, 8, h - 2, NEGRO[2]); R(d, w - 9, h - 4, w - 4, h - 2, NEGRO[2])
    return im


def meson_cocina():
    w, h = 120, 54
    im, d = lienzo(w, h)
    M = MADERA
    # encima: olla, tabla con limas y un frutero (sin cuchillos)
    R(d, 8, 4, 26, 15, METAL[1]); R(d, 8, 4, 26, 5, METAL[0]); R(d, 8, 15, 26, 15, METAL[3])
    R(d, 15, 2, 19, 3, NEGRO[1]); R(d, 5, 8, 7, 9, NEGRO[2]); R(d, 27, 8, 29, 9, NEGRO[2])
    R(d, 46, 10, 72, 16, PINO[1]); R(d, 46, 10, 72, 11, PINO[0]); R(d, 46, 16, 72, 16, PINO[3])
    elipse(d, [52, 6, 58, 11], LIMA); elipse(d, [60, 7, 66, 12], AMARILLO)
    elipse(d, [90, 5, 97, 12], NARANJA); elipse(d, [96, 3, 103, 10], ROJO); elipse(d, [101, 6, 108, 13], LIMA)
    poli(d, [(87, 10), (111, 10), (107, 16), (91, 16)], TERRACOTA[2])
    R(d, 87, 10, 111, 10, TERRACOTA[0])
    # mesón con gabinetes
    R(d, 1, 17, w - 2, 20, CREMA[0]); R(d, 1, 21, w - 2, 23, CREMA[2])
    R(d, 1, 24, w - 2, h - 6, M[1]); R(d, 1, 24, w - 2, 25, M[3])
    for k in range(5):
        x0 = 4 + k * 23
        R(d, x0, 27, x0 + 20, h - 9, M[0]); R(d, x0 + 2, 29, x0 + 18, h - 11, M[1])
        R(d, x0 + 2, 29, x0 + 18, 29, M[2])
        R(d, x0 + 17, 33, x0 + 17, 38, LATON)
    R(d, 1, h - 5, w - 2, h - 2, M[3])
    return im


def lavaplatos():
    w, h = 50, 50
    im, d = lienzo(w, h)
    M = MADERA
    # grifo y un vaso boca abajo
    R(d, 24, 3, 26, 12, METAL[1]); R(d, 24, 3, 24, 12, METAL[0]); R(d, 20, 2, 27, 4, METAL[0]); R(d, 20, 4, 21, 7, METAL[2])
    R(d, 38, 7, 43, 14, CREMA[0]); R(d, 38, 7, 43, 7, CREMA[2]); R(d, 41, 8, 41, 13, CELESTE[0])
    # tapa con la poceta metálica
    R(d, 1, 12, w - 2, 15, CREMA[0]); R(d, 1, 16, w - 2, 17, CREMA[2])
    poli(d, [(7, 12), (w - 8, 12), (w - 10, 17), (9, 17)], METAL[2])
    R(d, 9, 13, w - 10, 14, METAL[3])
    # gabinete con dos puertas y un trapo coral en la manija
    R(d, 1, 18, w - 2, h - 6, M[1]); R(d, 1, 18, w - 2, 19, M[3])
    for x0, x1 in ((4, 23), (26, 45)):
        R(d, x0, 21, x1, h - 9, M[0]); R(d, x0 + 2, 23, x1 - 2, h - 11, M[1]); R(d, x0 + 2, 23, x1 - 2, 23, M[2])
    R(d, 21, 28, 21, 33, LATON); R(d, 28, 28, 28, 33, LATON)
    R(d, 29, 26, 35, 38, (222, 112, 92)); R(d, 29, 26, 35, 27, (240, 150, 124))
    for yy in (30, 34):
        R(d, 29, yy, 35, yy, (250, 226, 200))
    R(d, 1, h - 5, w - 2, h - 2, M[3])
    return im


# ── dormitorios ────────────────────────────────────────────────────────────────

def cama_doble():
    w, h = 110, 66
    im, d = lienzo(w, h)
    M = MADERA
    # cabecera con paneles
    R(d, 6, 1, w - 7, 18, M[1]); R(d, 6, 1, w - 7, 3, M[0])
    for x0, x1 in ((10, 52), (57, 99)):
        R(d, x0, 6, x1, 16, M[2]); R(d, x0, 6, x1, 7, M[3])
    # dos almohadas
    for x0, x1 in ((14, 52), (57, 95)):
        d.rounded_rectangle([x0, 11, x1, 25], 4, fill=CREMA[0] + (255,))
        R(d, x0 + 3, 12, x1 - 3, 13, (250, 246, 234)); R(d, x0 + 3, 24, x1 - 3, 25, CREMA[2])
    # sábana doblada y colcha verde azulada con rombos
    poli(d, [(7, 26), (w - 8, 26), (w - 6, 34), (5, 34)], CELESTE[0])
    poli(d, [(5, 34), (w - 6, 34), (w - 2, 56), (1, 56)], VERDE_TELA[1])
    R(d, 5, 34, w - 6, 35, CREMA[1])
    for y, xs in ((42, range(14, w - 14, 16)), (50, range(6, w - 10, 16))):
        for x in xs:
            poli(d, [(x, y), (x + 5, y - 4), (x + 10, y), (x + 5, y + 4)], VERDE_TELA[0])
    R(d, 1, 55, w - 2, 57, VERDE_TELA[3])
    # pie de cama y patas
    R(d, 4, 58, w - 5, 61, M[1]); R(d, 4, 58, w - 5, 58, M[0])
    for x in (5, w - 9):
        R(d, x, 62, x + 3, h - 2, M[3])
    return im


def mesa_noche():
    w, h = 30, 38
    im, d = lienzo(w, h)
    M = MADERA
    # lámpara de mesa
    poli(d, [(9, 8), (20, 8), (23, 1), (6, 1)], CREMA[0]); R(d, 6, 1, 23, 1, CREMA[1]); R(d, 9, 8, 20, 8, CREMA[2])
    R(d, 14, 9, 15, 14, METAL[2]); R(d, 11, 13, 18, 14, METAL[1])
    caja(d, 1, 15, w - 2, 19, M, tapa=3)
    R(d, 2, 22, w - 3, h - 6, M[1]); R(d, 2, 22, w - 3, 22, M[3])
    R(d, 5, 25, w - 6, h - 9, M[0]); R(d, 7, 27, w - 8, h - 11, M[1])
    R(d, w // 2 - 1, 29, w // 2, 30, LATON)
    for x in (3, w - 6):
        R(d, x, h - 5, x + 2, h - 2, M[3])
    return im


def armario():
    w, h = 70, 92
    im, d = lienzo(w, h)
    M = MADERA
    R(d, 1, 1, w - 2, 6, M[0]); R(d, 1, 7, w - 2, 8, M[3])
    R(d, 2, 9, w - 3, h - 8, M[1])
    for x0, x1 in ((5, 33), (36, 64)):
        R(d, x0, 12, x1, h - 11, M[0]); R(d, x0 + 3, 15, x1 - 3, h - 14, M[1])
        R(d, x0 + 3, 15, x1 - 3, 16, M[2]); R(d, x0 + 3, 15, x0 + 3, h - 14, M[2])
        R(d, x0 + 3, 44, x1 - 3, 44, M[2])
    R(d, 33, 12, 35, h - 11, M[3])
    R(d, 30, 44, 31, 54, LATON); R(d, 38, 44, 39, 54, LATON)
    R(d, 1, h - 10, w - 2, h - 5, M[2]); R(d, 1, h - 10, w - 2, h - 10, M[0])
    R(d, 4, h - 4, 8, h - 2, M[3]); R(d, w - 9, h - 4, w - 5, h - 2, M[3])
    return im


def cama_sencilla():
    w, h = 60, 58
    im, d = lienzo(w, h)
    M = PINO
    # cabecera con arco
    d.rounded_rectangle([5, 1, w - 6, 18], 6, fill=M[1] + (255,))
    R(d, 8, 4, w - 9, 5, M[0]); R(d, 8, 12, w - 9, 13, M[2])
    # almohada
    d.rounded_rectangle([12, 9, w - 13, 21], 4, fill=CREMA[0] + (255,))
    R(d, 15, 10, w - 16, 11, (250, 246, 234)); R(d, 15, 20, w - 16, 21, CREMA[2])
    # colcha infantil celeste con una franja coral y estrellitas amarillas
    poli(d, [(7, 22), (w - 8, 22), (w - 3, 49), (2, 49)], CELESTE[1])
    R(d, 7, 22, w - 8, 24, CREMA[0])
    poli(d, [(5, 36), (w - 6, 36), (w - 5, 40), (4, 40)], (222, 118, 98))
    for (x, y) in ((16, 29), (36, 30), (26, 45), (46, 44), (10, 44)):
        R(d, x, y, x + 2, y, AMARILLO); R(d, x + 1, y - 1, x + 1, y + 1, AMARILLO)
    R(d, 2, 48, w - 3, 50, CELESTE[3])
    R(d, 3, 51, w - 4, 52, M[1])
    for x in (4, w - 8):
        R(d, x, 53, x + 3, h - 2, M[3])
    return im


def escritorio_infantil():
    w, h = 70, 46
    im, d = lienzo(w, h)
    M = PINO
    # vaso con lápices y un cuaderno cerrado
    R(d, 8, 5, 14, 11, TERRACOTA[1]); R(d, 8, 5, 14, 5, TERRACOTA[0]); R(d, 8, 11, 14, 11, TERRACOTA[2])
    for x, c in ((9, AMARILLO), (11, ROJO), (13, CELESTE[1])):
        R(d, x, 0, x, 5, c)
    R(d, 30, 5, 52, 10, CELESTE[1]); R(d, 30, 5, 52, 6, CELESTE[0]); R(d, 30, 10, 52, 10, CELESTE[3])
    R(d, 33, 7, 40, 8, CREMA[0])
    caja(d, 1, 10, w - 2, 18, M, tapa=5)
    # cajón a la izquierda, hueco para las piernas a la derecha
    R(d, 4, 19, 26, h - 2, M[1]); R(d, 4, 19, 26, 20, M[3]); R(d, 4, h - 4, 26, h - 2, M[3])
    R(d, 6, 22, 24, 30, M[0]); R(d, 6, 30, 24, 30, M[2])
    R(d, 13, 25, 17, 26, LATON)
    R(d, 6, 33, 24, 40, M[0]); R(d, 6, 40, 24, 40, M[2]); R(d, 13, 36, 17, 37, LATON)
    R(d, 27, 19, w - 7, 26, M[2]); R(d, 27, 19, w - 7, 20, M[3])
    R(d, w - 9, 19, w - 4, h - 2, M[1]); R(d, w - 9, 19, w - 9, h - 2, M[2])
    R(d, w - 9, h - 4, w - 4, h - 2, M[3])
    return im


def caja_juguetes():
    w, h = 40, 32
    im, d = lienzo(w, h)
    # un bloque y una pelota asoman por la boca de la caja
    R(d, 7, 2, 17, 12, CELESTE[1]); R(d, 7, 2, 17, 3, CELESTE[0]); R(d, 16, 3, 17, 12, CELESTE[2]); R(d, 11, 6, 13, 8, AMARILLO)
    elipse(d, [21, 0, 33, 12], AMARILLO); R(d, 22, 6, 32, 7, ROJO); R(d, 24, 2, 26, 3, (250, 232, 170))
    # boca de la caja, frente con tablones y asa
    R(d, 2, 10, w - 3, 14, TERRACOTA[2]); R(d, 4, 12, w - 5, 14, (84, 52, 40))
    R(d, 2, 15, w - 3, 28, OCRE_CAJA[1]); R(d, 2, 15, w - 3, 16, OCRE_CAJA[0])
    R(d, 2, 21, w - 3, 22, OCRE_CAJA[2]); R(d, 2, 27, w - 3, 28, OCRE_CAJA[2])
    R(d, 15, 17, 24, 19, OCRE_CAJA[3])
    R(d, 4, 29, 7, h - 2, OCRE_CAJA[3]); R(d, w - 8, 29, w - 5, h - 2, OCRE_CAJA[3])
    return im


OCRE_CAJA = ((222, 168, 96), (190, 132, 74), (150, 98, 56), (104, 66, 40))


# ── patio ──────────────────────────────────────────────────────────────────────

def tendedero():
    w, h = 90, 62
    im, d = lienzo(w, h)
    M = MADERA
    for x in (3, w - 6):
        R(d, x, 3, x + 2, h - 4, M[1]); R(d, x, 3, x, h - 4, M[0])
        R(d, x - 3, h - 3, x + 5, h - 2, M[3])
    R(d, 1, 2, w - 2, 4, M[0]); R(d, 1, 4, w - 2, 4, M[2])
    cuerda = (222, 214, 190)
    d.line([(5, 7), (45, 9), (w - 5, 7)], fill=cuerda + (255,), width=1)
    d.line([(5, 7), (45, 9), (w - 5, 7)], fill=cuerda + (255,), width=1)
    # camisa azul (cuelga de la cuerda), toalla a rayas y un pañuelo
    poli(d, [(14, 9), (22, 11), (30, 9), (36, 14), (33, 18), (30, 16), (30, 30), (14, 30), (14, 16), (11, 18), (8, 14)], CELESTE[1])
    R(d, 20, 9, 24, 10, CELESTE[3]); R(d, 14, 29, 30, 30, CELESTE[2]); R(d, 22, 12, 22, 29, CELESTE[2])
    R(d, 14, 8, 15, 9, M[3]); R(d, 29, 8, 30, 9, M[3])
    R(d, 44, 9, 66, 40, CREMA[0]); R(d, 44, 9, 66, 10, CREMA[2])
    for yy in (16, 18, 32, 34):
        R(d, 44, yy, 66, yy, TERRACOTA[0])
    R(d, 44, 39, 66, 40, CREMA[2])
    R(d, 44, 8, 45, 9, M[3]); R(d, 65, 8, 66, 9, M[3])
    poli(d, [(72, 9), (82, 9), (82, 21), (77, 24), (72, 21)], (222, 128, 104))
    R(d, 72, 9, 82, 10, (240, 160, 130)); R(d, 72, 8, 73, 9, M[3]); R(d, 81, 8, 82, 9, M[3])
    return im


def materas():
    w, h = 60, 40
    im, d = lienzo(w, h)
    # izquierda: planta grande de hojas
    for (cx, cy, r, c) in ((12, 11, 9, HOJA[2]), (7, 15, 6, HOJA[1]), (17, 14, 6, HOJA[1]), (12, 6, 6, HOJA[1]), (10, 8, 3, HOJA[0]), (16, 11, 3, HOJA[0])):
        elipse(d, [cx - r, cy - r, cx + r, cy + r], c)
    poli(d, [(4, 24), (20, 24), (18, h - 2), (6, h - 2)], TERRACOTA[1])
    R(d, 3, 23, 21, 26, TERRACOTA[0]); R(d, 6, h - 4, 18, h - 2, TERRACOTA[2])
    # centro: matera chica con flores
    R(d, 29, 22, 29, 30, HOJA[2]); R(d, 33, 20, 33, 30, HOJA[2]); R(d, 37, 23, 37, 30, HOJA[2])
    for (x, y, c) in ((29, 21, (226, 120, 150)), (33, 18, AMARILLO), (37, 22, (226, 120, 150)), (31, 25, AMARILLO), (35, 26, (240, 236, 226))):
        R(d, x - 1, y - 1, x + 1, y + 1, c)
    elipse(d, [26, 27, 40, 32], HOJA[1])
    poli(d, [(26, 30), (40, 30), (38, h - 2), (28, h - 2)], TERRACOTA[1])
    R(d, 25, 29, 41, 31, TERRACOTA[0]); R(d, 28, h - 4, 38, h - 2, TERRACOTA[2])
    # derecha: helecho
    for (x0, y0, x1, y1) in ((44, 20, 40, 12), (47, 20, 47, 8), (50, 20, 54, 12), (46, 20, 43, 15), (49, 20, 52, 15)):
        d.line([(x0, y0), (x1, y1)], fill=HOJA[1] + (255,), width=3)
    for (cx, cy) in ((41, 12), (47, 8), (54, 12)):
        elipse(d, [cx - 3, cy - 3, cx + 3, cy + 3], HOJA[0])
    poli(d, [(42, 25), (55, 25), (53, h - 2), (44, h - 2)], TERRACOTA[2])
    R(d, 41, 24, 56, 27, TERRACOTA[1]); R(d, 41, 24, 56, 24, TERRACOTA[0]); R(d, 44, h - 4, 52, h - 2, TERRACOTA[3])
    return im


def banco_patio():
    w, h = 80, 36
    im, d = lienzo(w, h)
    M = MADERA_CLARA
    # respaldo de tres tablas, asiento de tres tablas y patas
    for x in (4, w - 7):
        R(d, x, 1, x + 2, 17, M[2]); R(d, x, 1, x, 17, M[1])
    for yy in (3, 8, 13):
        R(d, 3, yy, w - 4, yy + 3, M[0]); R(d, 3, yy + 3, w - 4, yy + 3, M[2])
    for k, yy in enumerate((18, 22, 26)):
        R(d, 1, yy, w - 2, yy + 2, M[0] if k != 2 else M[1]); R(d, 1, yy + 2, w - 2, yy + 3, M[2])
    for x in (5, w - 9):
        R(d, x, 30, x + 3, h - 2, M[3]); R(d, x, 30, x, h - 2, M[2])
    R(d, 9, 31, w - 10, 32, M[3])
    return im


MUEBLES = {
    'sofa-casa': sofa_casa,
    'sillon-casa': sillon_casa,
    'mesa-centro-casa': mesa_centro_casa,
    'mueble-tv': mueble_tv,
    'mesa-comedor': mesa_comedor,
    'silla-comedor': silla_comedor,
    'vitrina-comedor': vitrina_comedor,
    'nevera': nevera,
    'estufa': estufa,
    'meson-cocina': meson_cocina,
    'lavaplatos': lavaplatos,
    'cama-doble': cama_doble,
    'mesa-noche': mesa_noche,
    'armario': armario,
    'cama-sencilla': cama_sencilla,
    'escritorio-infantil': escritorio_infantil,
    'caja-juguetes': caja_juguetes,
    'tendedero': tendedero,
    'materas': materas,
    'banco-patio': banco_patio,
}


# ── herramienta propia (32x32) ─────────────────────────────────────────────────

def ficha_plan_seguridad():
    """Hoja en un portapapeles con una casita y una flecha de salida (sin texto)."""
    def marca(d):
        poli(d, [(8, 16), (14, 10), (20, 16)], TERRACOTA[0])
        R(d, 9, 16, 19, 23, PAPEL[1]); R(d, 9, 16, 9, 23, (170, 164, 150))
        R(d, 12, 19, 15, 23, TERRACOTA[3])
        R(d, 17, 19, 18, 20, (230, 210, 120))
        d.line([(17, 25), (22, 25)], fill=(70, 150, 100, 255), width=2)
        poli(d, [(21, 22), (24, 25), (21, 28)], (70, 150, 100))
        R(d, 9, 8, 22, 8, (150, 150, 146))
    return portapapeles(marca)


ICONOS_PROPIOS = {'ficha-plan-seguridad': ficha_plan_seguridad}
