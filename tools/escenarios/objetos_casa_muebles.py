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
