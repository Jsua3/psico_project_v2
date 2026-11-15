"""Casa: muebles del comedor, la cocina, las habitaciones y el patio redibujados al oficio v2 (bloque O1).

Volumen por sombra y bloques a la densidad de los personajes. Se suman a `objetos_casa.PIEZAS` desde ese módulo.
"""
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import objetos_pixel as op  # noqa: E402
from objetos_pixel import Lienzo, Reflejo  # noqa: E402

ROJO = (196, 84, 78)


def _reflejos(L):
    return {lado: Reflejo(L.w, L.h) for lado in op.LADOS}


def mesa_comedor(n=0):
    """Mesa de comedor de madera con un camino de mesa tejido y un frutero."""
    L = Lienzo(112, 46, semilla=151)
    for x in (6, 100):                                                              # patas torneadas
        L.rect(x, 16, x + 4, 43, 'roble', 3)
        L.rect(x, 16, x, 43, 'roble', 4, tex=False)
        L.rect(x - 1, 26, x + 5, 27, 'roble', 2, tex=False)
        L.rect(x, 42, x + 4, 43, 'roble', 4, tex=False)
    L.bloque(1, 2, 110, 17, 'roble', tapa=10)                                       # tablero visto desde arriba
    L.rect(4, 17, 107, 19, 'roble', 4, tex=False)                                   # faldón en sombra
    L.rect(30, 3, 80, 10, 'crochet', 1)                                             # camino de mesa
    L.rect(30, 10, 80, 10, 'crochet', 3, tex=False)
    L.elipse(48, 1, 62, 8, 'ceramica', 1)                                           # frutero con frutas
    L.rect(49, 6, 61, 8, 'ceramica', 3, tex=False)
    for x, c in ((50, (230, 192, 86)), (54, ROJO), (58, (110, 170, 90))):
        L.elipse(x, 1, x + 4, 5, c, tex=False)
    r = _reflejos(L)
    r['izquierda'].rect(3, 3, 28, 3, 2)
    r['izquierda'].rect(3, 4, 14, 4, 1)
    r['derecha'].rect(82, 3, 108, 3, 2)
    r['derecha'].rect(96, 4, 108, 4, 1)
    r['frente'].rect(12, 10, 28, 10, 1)
    r['frente'].rect(82, 10, 98, 10, 1)
    return L, r, None


def silla_comedor(n=0):
    """Silla de comedor de madera con asiento de esterilla."""
    L = Lienzo(24, 38, semilla=153)
    L.rect(3, 1, 20, 3, 'roble', 1)                                                 # copete
    L.rect(3, 1, 20, 1, 'roble', 0, tex=False)
    for x in (3, 18):                                                               # largueros del respaldo
        L.rect(x, 3, x + 2, 35, 'roble', 2)
        L.rect(x, 3, x, 35, 'roble', 3, tex=False)
    for y in (8, 13):                                                               # travesaños
        L.rect(5, y, 18, y + 1, 'roble', 2, tex=False)
    L.rect(2, 18, 21, 22, 'pino', 1)                                                # asiento de esterilla
    for x in range(3, 21, 2):
        L.rect(x, 19, x, 21, 'pino', 3, tex=False)
    L.rect(2, 22, 21, 23, 'roble', 4, tex=False)
    L.rect(5, 29, 18, 29, 'roble', 3, tex=False)                                    # travesaño bajo
    L.rect(3, 35, 5, 36, 'roble', 4, tex=False)
    L.rect(18, 35, 20, 36, 'roble', 4, tex=False)
    r = _reflejos(L)
    r['izquierda'].rect(3, 2, 9, 2, 1)
    r['derecha'].rect(14, 2, 20, 2, 1)
    return L, r, None


def vitrina(n=0):
    """Vitrina del comedor: puertas de vidrio con la vajilla de las visitas y cajones abajo."""
    L = Lienzo(62, 80, semilla=155)
    L.bloque(1, 1, 60, 76, 'nogal', tapa=3)
    L.rect(1, 74, 60, 77, 'nogal', 4, tex=False)                                    # zócalo
    for x0 in (5, 32):                                                              # dos puertas de vidrio
        L.rect(x0, 6, x0 + 24, 50, 'nogal', 3, tex=False)
        L.rect(x0 + 2, 8, x0 + 22, 48, 'nogal', 5, tex=False)                       # fondo de la vitrina, en sombra
        for y in (21, 35):                                                          # entrepaños
            L.rect(x0 + 2, y, x0 + 22, y, 'nogal', 2, tex=False)
        for k, y in enumerate((14, 28, 42)):                                        # platos y tazas
            for j in range(3):
                x = x0 + 4 + j * 6
                if (k + j) % 3 == 2:
                    L.rect(x, y + 1, x + 3, y + 5, 'ceramica', 1)
                    L.rect(x + 4, y + 2, x + 4, y + 3, 'ceramica', 3, tex=False)
                else:                                                               # plato de pie: disco de 4 × 4
                    L.rect(x + 1, y, x + 2, y, 'ceramica', 0, tex=False)
                    L.rect(x, y + 1, x + 3, y + 2, 'ceramica', 1, tex=False)
                    L.rect(x + 1, y + 3, x + 2, y + 3, 'ceramica', 3, tex=False)
                    L.rect(x + 1, y + 1, x + 2, y + 2, 'ceramica', 2, tex=False)
        L.rect(x0 + 21, 26, x0 + 21, 30, 'laton', 2, tex=False)                     # tirador
    for y0 in (54, 63):                                                             # cajones
        L.rect(5, y0, 56, y0 + 7, 'nogal', 2)
        L.rect(5, y0, 56, y0, 'nogal', 1, tex=False)
        L.rect(5, y0 + 7, 56, y0 + 7, 'nogal', 4, tex=False)
        L.rect(28, y0 + 3, 33, y0 + 4, 'laton', 2, tex=False)
    vidrio = L.caja_mascara(7, 8, 27, 48) | L.caja_mascara(34, 8, 54, 48)
    r = _reflejos(L)
    r['izquierda'].diagonal(8, 46, 12, 2, 2)
    r['izquierda'].diagonal(35, 46, 12, 2, 1)
    r['derecha'].diagonal(26, 46, 12, 2, 1, sentido=-1)
    r['derecha'].diagonal(53, 46, 12, 2, 2, sentido=-1)
    r['frente'].rect(9, 9, 25, 9, 1)
    r['frente'].rect(36, 9, 52, 9, 1)
    for rr in r.values():
        rr.m[(rr.m > 0) & ~vidrio] = 0
        rr.rect(2, 2, 59, 2, 1)                                                     # barniz de la tapa
        rr.px(26, 26, 2)
        rr.px(53, 26, 2)
    return L, r, None


# ── cocina ─────────────────────────────────────────────────────────────────────

op.material('esmalte', (226, 224, 214), op.tex_grano(0.02), luz=0.35, sombra=0.5)
op.material('baldosin', (176, 196, 190), luz=0.4, sombra=0.5)


def nevera(n=0):
    """Nevera de dos puertas, esmaltada, con imanes y la manija cromada."""
    L = Lienzo(46, 76, semilla=161)
    L.bloque(1, 1, 44, 73, 'esmalte', tapa=3)
    L.rect(2, 26, 43, 27, 'esmalte', 4, tex=False)                                  # junta entre las puertas
    L.rect(2, 27, 43, 27, 'esmalte', 1, tex=False)
    for y0, y1 in ((8, 20), (33, 60)):                                              # manijas
        L.rect(38, y0, 40, y1, 'cromo', 2)
        L.rect(38, y0, 38, y1, 'cromo', 1, tex=False)
        L.rect(40, y0, 40, y1, 'cromo', 4, tex=False)
    for x, y, c in ((10, 34, ROJO), (20, 38, (230, 192, 86)), (14, 46, (96, 170, 104))):   # imanes
        L.rect(x, y, x + 3, y + 3, c, tex=False)
    L.rect(4, 70, 41, 73, 'plastico-negro', 3, tex=False)                           # rejilla de abajo
    r = _reflejos(L)
    r['izquierda'].rect(38, 9, 38, 19, 2)
    r['izquierda'].rect(38, 34, 38, 59, 2)
    r['derecha'].rect(40, 9, 40, 19, 2)
    r['derecha'].rect(40, 34, 40, 59, 2)
    r['frente'].rect(39, 9, 39, 12, 1)
    r['frente'].rect(39, 34, 39, 38, 1)
    return L, r, None


VAPOR = ((0, 0), (1, -1), (0, -2), (-1, -1))


def estufa(n=0):
    """Estufa de cuatro puestos con una olla al fuego: el vapor sube (4 cuadros) y la llama azul titila."""
    L = Lienzo(58, 64, semilla=163)
    L.bloque(2, 22, 55, 61, 'esmalte', tapa=10)                                     # cuerpo con la parrilla arriba
    L.rect(4, 23, 53, 30, 'plastico-negro', 3, tex=False)                           # parrilla
    for x in (14, 40):
        L.elipse(x - 6, 24, x + 6, 29, 'plastico-negro', 4, tex=False)
    L.rect(6, 34, 51, 39, 'plastico-negro', 2, tex=False)                           # panel de perillas
    for x in range(10, 50, 9):
        L.rect(x, 35, x + 3, 38, 'cromo', 1, tex=False)
    L.rect(8, 42, 49, 58, 'plastico-negro', 4, tex=False)                           # puerta del horno
    L.rect(12, 46, 45, 52, (60, 54, 60), tex=False)
    L.rect(14, 41, 43, 42, 'cromo', 2, tex=False)                                   # manija del horno
    L.rect(8, 9, 22, 25, 'cromo', 2)                                                # olla
    L.rect(8, 9, 22, 10, 'cromo', 0, tex=False)
    L.rect(8, 23, 22, 25, 'cromo', 4, tex=False)
    L.rect(6, 13, 7, 15, 'cromo', 3, tex=False)
    L.rect(23, 13, 24, 15, 'cromo', 3, tex=False)
    llama = (70, 130, 226) if n % 2 == 0 else (110, 170, 240)
    L.rect(10, 26, 20, 26, llama, tex=False)                                        # llama bajo la olla
    for k in range(3):                                                              # vapor que sube
        dx, dy = VAPOR[(n + k) % 4]
        x, y = 11 + k * 3 + dx, 6 - k * 2 + dy
        L.rect(x, y, x + 1, y + 1, (236, 232, 226), tex=False)
    em = L.caja_mascara(10, 26, 20, 26)
    r = _reflejos(L)
    r['izquierda'].rect(8, 11, 8, 22, 2)
    r['derecha'].rect(22, 11, 22, 22, 2)
    r['frente'].rect(10, 10, 20, 10, 1)
    for rr in r.values():
        rr.rect(14, 41, 43, 41, 1)
    return L, r, em


def meson(n=0):
    """Mesón de cocina con salpicadero de baldosín, un tarro de café, la tabla de picar y un racimo de plátanos."""
    L = Lienzo(122, 58, semilla=165)
    L.rect(2, 1, 119, 18, 'baldosin', 1, tex=False)                                 # salpicadero de baldosín
    for x in range(2, 120, 8):
        L.rect(x, 1, x, 18, 'baldosin', 3, tex=False)
    for y in (6, 12):
        L.rect(2, y, 119, y, 'baldosin', 3, tex=False)
    L.bloque(1, 18, 120, 26, 'formica', tapa=6)                                     # mesón
    L.rect(10, 12, 18, 21, 'ceramica', 1)                                           # tarro de café
    L.rect(10, 12, 18, 13, ROJO, tex=False)
    L.rect(26, 18, 46, 21, 'pino', 1)                                               # tabla de picar
    L.rect(26, 21, 46, 21, 'pino', 3, tex=False)
    for k in range(3):                                                              # racimo de plátanos
        L.rect(60 + k * 3, 14 + k, 64 + k * 3, 18 + k % 2, (230, 192, 86), tex=False)
    L.rect(2, 27, 119, 54, 'pino', 2)                                               # puertas de abajo
    for x in range(2, 120, 30):
        L.rect(x, 27, x, 54, 'pino', 4, tex=False)
        L.rect(x + 1, 30, x + 28, 51, 'pino', 3, tex=False)
        L.rect(x + 24, 39, x + 25, 43, 'cromo', 2, tex=False)
    L.rect(2, 53, 119, 55, 'pino', 4, tex=False)
    r = _reflejos(L)
    r['izquierda'].rect(3, 19, 40, 19, 1)
    r['derecha'].rect(80, 19, 118, 19, 1)
    r['frente'].rect(40, 23, 80, 23, 1)
    return L, r, None


GOTA = (None, 30, 34, 38)


def lavaplatos(n=0):
    """Lavaplatos de acero con la llave que gotea (4 cuadros) y platos escurriendo."""
    L = Lienzo(52, 54, semilla=167)
    L.bloque(1, 18, 50, 51, 'pino', tapa=8)                                         # mueble
    L.rect(4, 19, 47, 25, 'cromo', 3)                                               # poceta de acero
    L.rect(6, 20, 45, 24, 'cromo', 5, tex=False)
    L.rect(22, 5, 25, 9, 'cromo', 2)                                                # llave
    L.rect(22, 5, 32, 7, 'cromo', 1)
    L.rect(31, 7, 32, 10, 'cromo', 2, tex=False)
    L.rect(20, 9, 27, 18, 'cromo', 3, tex=False)
    g = GOTA[n]
    if g:
        L.px(31, 11 + (g - 30) // 2, (150, 196, 226))
    for k in range(3):                                                              # platos escurriendo a un lado
        L.rect(36 + k * 3, 9 + k, 38 + k * 3, 18, 'ceramica', 1)
        L.px(37 + k * 3, 9 + k, 'ceramica', 0)
    L.rect(6, 29, 45, 48, 'pino', 3, tex=False)                                     # puertas
    L.rect(25, 29, 25, 48, 'pino', 4, tex=False)
    L.rect(21, 37, 22, 41, 'cromo', 2, tex=False)
    L.rect(28, 37, 29, 41, 'cromo', 2, tex=False)
    r = _reflejos(L)
    r['izquierda'].rect(5, 19, 20, 19, 2)
    r['izquierda'].rect(22, 5, 22, 8, 2)
    r['derecha'].rect(30, 19, 46, 19, 2)
    r['derecha'].rect(32, 5, 32, 8, 2)
    r['frente'].rect(14, 19, 34, 19, 1)
    r['frente'].rect(24, 5, 30, 5, 2)
    return L, r, None
