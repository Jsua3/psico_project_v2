"""Comisaría, tercera tanda (bloque O1): cartelera, dispensador de agua y afiche de rutas de atención.

Se suman a `objetos_comisaria.PIEZAS` desde ese módulo; aquí solo viven los dibujos.
"""
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import objetos_pixel as op  # noqa: E402
from objetos_pixel import Lienzo, Reflejo  # noqa: E402

op.material('corcho', (176, 132, 86), op.tex_grano(0.22, claras=0.5), luz=0.4, sombra=0.5)
MORADO, ROJO, AZUL, VERDE, AMARILLO = (124, 86, 150), (204, 84, 72), (70, 110, 160), (96, 170, 104), (230, 192, 86)
LINEA = (150, 156, 170)
CLARO = (248, 240, 214)


def _reflejos(L):
    return {lado: Reflejo(L.w, L.h) for lado in op.LADOS}


def cartelera(n=0):
    """Cartelera de corcho en su pie: avisos clavados con chinches y el cartel morado de la línea 155."""
    L = Lienzo(84, 78, semilla=111)
    for x in (10, 71):                                                              # patas
        L.rect(x, 54, x + 2, 73, 'acero', 2)
        L.rect(x, 54, x, 73, 'acero', 1, tex=False)
        L.rect(x - 6, 73, x + 8, 75, 'acero', 3)
        L.rect(x - 6, 75, x + 8, 75, 'acero', 4, tex=False)
    L.rect(2, 2, 81, 55, 'laminado', 2)                                             # marco
    L.rect(2, 2, 81, 2, 'laminado', 0, tex=False)
    L.rect(2, 55, 81, 55, 'laminado', 4, tex=False)
    L.rect(5, 5, 78, 52, 'corcho', 2)
    L.rect(5, 5, 78, 5, 'corcho', 4, tex=False)                                     # sombra del marco sobre el corcho
    L.rect(5, 5, 5, 52, 'corcho', 4, tex=False)
    avisos = [(9, 9, 27, 30, ROJO), (31, 8, 50, 22, AZUL), (54, 10, 74, 28, VERDE), (30, 26, 48, 47, AMARILLO), (54, 32, 74, 48, ROJO)]
    for x0, y0, x1, y1, chinche in avisos:
        L.rect(x0 + 1, y0 + 1, x1 + 1, y1 + 1, 'corcho', 5, tex=False)              # sombra del papel
        L.rect(x0, y0, x1, y1, 'papel', 0)
        for y in range(y0 + 4, y1 - 1, 2):
            L.rect(x0 + 2, y, x1 - 2 - (y % 3), y, LINEA, tex=False)
        L.px((x0 + x1) // 2, y0 + 1, chinche)
        L.px((x0 + x1) // 2, y0, op.mezcla(chinche, (255, 255, 255), 0.4))
    L.rect(9, 33, 26, 49, MORADO, tex=False)                                        # cartel de la línea 155
    L.rect(9, 33, 26, 35, op.mezcla(MORADO, (0, 0, 0), 0.25), tex=False)
    patron = {'1': ['.#.', '##.', '.#.', '.#.', '###'], '5': ['###', '#..', '###', '..#', '###']}
    for k, d in enumerate('155'):                                                   # 1 5 5 en cifras de 3 × 5
        for yy, fila in enumerate(patron[d]):
            for xx, ch in enumerate(fila):
                if ch == '#':
                    L.px(11 + k * 5 + xx, 38 + yy, CLARO)
    L.rect(11, 45, 24, 45, CLARO, tex=False)
    L.px(17, 32, AMARILLO)
    r = _reflejos(L)
    r['izquierda'].rect(3, 3, 30, 3, 1)
    r['derecha'].rect(54, 3, 80, 3, 1)
    for rr, dx in ((r['izquierda'], 0), (r['derecha'], 2), (r['frente'], 1)):
        rr.px(10 + dx, 56, 1)
        rr.px(71 + dx, 56, 1)
    return L, r, None


BURBUJA = (None, 30, 24, 18, 12, None, None)   # 0 quieto · 1-4 una burbuja sube (cerca) · 5-6 se llena un vaso (revisar)


def dispensador_agua(n=0):
    """Dispensador con botellón: al acercarse sube una burbuja; al revisarlo se llena un vasito."""
    L = Lienzo(30, 68, semilla=113)
    bot = L.redondeada_mascara(7, 2, 22, 26, 5)                                     # botellón de agua
    L.mascara(bot, 'agua', 2, tex=False)
    L.rect(8, 2, 21, 7, 'vidrio', 1, tex=False)                                     # aire arriba
    L.rect(8, 8, 21, 8, 'agua', 0, tex=False)                                       # nivel del agua
    L.rect(11, 9, 11, 24, 'agua', 1, tex=False)                                     # pliegues del plástico
    L.rect(18, 9, 18, 24, 'agua', 3, tex=False)
    L.rect(7, 16, 22, 16, 'agua', 3, tex=False)
    yb = BURBUJA[n]
    if yb:
        L.rect(14, yb, 15, yb + 1, 'vidrio', 0, tex=False)                          # burbuja grande y su compañera
        L.px(13, yb, 'agua', 1)
        L.px(17, yb + 4, 'vidrio', 0)
    L.rect(12, 26, 17, 29, 'agua', 3, tex=False)                                    # cuello
    L.bloque(4, 29, 25, 64, 'blanco-clinico', tapa=3, base=1)                       # cuerpo
    L.rect(7, 36, 22, 46, 'blanco-clinico', 4, tex=False)                           # nicho
    L.rect(10, 36, 11, 39, AZUL, tex=False)                                         # grifos fría y caliente
    L.rect(18, 36, 19, 39, ROJO, tex=False)
    L.rect(7, 46, 22, 47, 'acero', 2, tex=False)                                    # rejilla del goteo
    if n >= 5:                                                                      # vasito que se llena
        L.rect(9, 41, 12, 45, 'papel', 0, tex=False)
        L.rect(10, 44 - (n - 5), 11, 45, 'agua', 1, tex=False)
    L.rect(23, 32, 25, 50, 'papel', 1, tex=False)                                   # pila de vasitos al costado
    for y in range(33, 50, 2):
        L.px(24, y, 'papel', 3)
    L.rect(5, 63, 24, 64, 'blanco-clinico', 4, tex=False)
    vidrio = bot | L.caja_mascara(12, 26, 17, 29)
    r = _reflejos(L)
    r['izquierda'].rect(8, 9, 8, 22, 2)
    r['izquierda'].rect(9, 4, 9, 7, 1)
    r['derecha'].rect(21, 9, 21, 22, 2)
    r['derecha'].rect(20, 4, 20, 7, 1)
    r['frente'].rect(12, 3, 17, 3, 2)
    r['frente'].rect(14, 10, 15, 14, 1)
    for rr in r.values():
        rr.m[(rr.m > 0) & ~vidrio] = 0
    return L, r, None


def afiche_rutas(n=0):
    """Afiche de la ruta de atención en un caballete: cuatro pasos unidos por flechas."""
    L = Lienzo(36, 48, semilla=115)
    L.linea(9, 46, 13, 14, 'laminado', 3)                                           # caballete
    L.linea(10, 46, 14, 14, 'laminado', 2)
    L.linea(26, 46, 22, 14, 'laminado', 3)
    L.linea(25, 46, 21, 14, 'laminado', 2)
    L.rect(4, 2, 31, 37, 'papel', 0)                                                # afiche
    L.rect(4, 2, 31, 7, MORADO, tex=False)                                          # encabezado
    L.rect(7, 4, 20, 4, CLARO, tex=False)
    L.rect(7, 6, 15, 6, (210, 196, 226), tex=False)
    for x, y, c in ((7, 10, AZUL), (19, 10, VERDE), (7, 22, AMARILLO), (19, 22, ROJO)):   # cuatro pasos
        L.rect(x, y, x + 8, y + 8, c, tex=False)
        L.rect(x + 2, y + 3, x + 6, y + 3, CLARO, tex=False)
        L.rect(x + 2, y + 5, x + 5, y + 5, CLARO, tex=False)
    flecha = (90, 84, 100)
    L.rect(16, 13, 18, 13, flecha, tex=False)                                       # flechas
    L.px(18, 12, flecha)
    L.px(18, 14, flecha)
    L.rect(23, 19, 23, 21, flecha, tex=False)
    L.rect(16, 25, 18, 25, flecha, tex=False)
    L.px(16, 24, flecha)
    L.px(16, 26, flecha)
    L.rect(7, 33, 28, 33, LINEA, tex=False)
    L.rect(4, 37, 31, 37, 'papel', 3, tex=False)
    L.rect(3, 37, 32, 39, 'laminado', 2)                                            # repisa del caballete
    L.rect(3, 39, 32, 39, 'laminado', 4, tex=False)
    return L, _reflejos(L), None
