"""Casa, segunda tanda (bloque O1): teléfono fijo, peluche y cuaderno escolar.

Se suman a `objetos_casa.PIEZAS` desde ese módulo; aquí solo viven los dibujos.
"""
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import objetos_pixel as op  # noqa: E402
from objetos_pixel import Lienzo, Reflejo  # noqa: E402

op.material('peluche', (150, 108, 76), op.tex_grano(0.18, claras=0.4), luz=0.45, sombra=0.55)
LINEA, ROJO = (150, 156, 170), (204, 84, 72)


def _reflejos(L):
    return {lado: Reflejo(L.w, L.h) for lado in op.LADOS}


def telefono(n=0):
    """Teléfono fijo de teclas. 0 quieto · 1-2 timbra (el auricular salta y salen las rayas del timbre)."""
    L = Lienzo(30, 22, semilla=131)
    salta = 1 if n == 1 else 0
    L.bloque(3, 9, 26, 19, 'plastico-crema', tapa=3, base=1)                        # cuerpo
    for y in (13, 15, 17):                                                          # teclado
        for x in (8, 11, 14):
            L.px(x, y, 'plastico-gris', 3)
    L.rect(18, 13, 23, 17, 'plastico-crema', 3, tex=False)                          # tarjeta de números
    L.rect(19, 14, 22, 14, LINEA, tex=False)
    L.rect(19, 16, 21, 16, LINEA, tex=False)
    y0 = 5 - salta                                                                  # auricular
    L.rect(4, y0 + 2, 25, y0 + 4, 'plastico-crema', 1)
    L.rect(2, y0, 7, y0 + 4, 'plastico-crema', 2)
    L.rect(22, y0, 27, y0 + 4, 'plastico-crema', 2)
    L.rect(4, y0 + 2, 25, y0 + 2, 'plastico-crema', 0, tex=False)
    L.linea(26, 19, 28, 21, 'plastico-gris', 3)                                     # cordón en espiral
    L.px(27, 21, 'plastico-gris', 2)
    if n in (1, 2):                                                                 # rayas del timbre
        d = 0 if n == 1 else 1
        L.linea(0, 2 + d, 1, d, (236, 226, 196))
        L.linea(28, d, 29, 2 + d, (236, 226, 196))
    r = _reflejos(L)
    r['izquierda'].rect(4, y0 + 2, 10, y0 + 2, 1)
    r['derecha'].rect(19, y0 + 2, 25, y0 + 2, 1)
    r['frente'].rect(10, y0 + 2, 19, y0 + 2, 1)
    return L, r, None


def peluche(n=0):
    """Oso de peluche sentado, con una oreja descosida. Al acercarse ladea la cabeza (2 cuadros)."""
    L = Lienzo(24, 26, semilla=133)
    lado = (0, 1, 0)[n]
    L.elipse(5, 11, 18, 24, 'peluche', 2)                                           # cuerpo
    L.elipse(8, 15, 15, 22, 'peluche', 1)                                           # panza clara
    L.elipse(2, 18, 8, 24, 'peluche', 3)                                            # patas
    L.elipse(15, 18, 21, 24, 'peluche', 3)
    L.elipse(3, 13, 7, 18, 'peluche', 3)                                            # brazos
    L.elipse(16, 13, 20, 18, 'peluche', 3)
    hx = 6 + lado
    L.elipse(hx, 2, hx + 11, 13, 'peluche', 1)                                      # cabeza
    L.elipse(hx - 1, 0, hx + 3, 4, 'peluche', 2)                                    # orejas
    L.elipse(hx + 8, 0, hx + 12, 4, 'peluche', 2)
    L.px(hx + 10, 0, 'peluche', 4)                                                  # la oreja descosida
    L.px(hx + 12, 1, (226, 216, 190))
    L.elipse(hx + 3, 7, hx + 8, 11, 'peluche', 0)                                   # hocico
    L.px(hx + 5, 8, (40, 30, 30))
    L.px(hx + 3, 5, (30, 24, 24))
    L.px(hx + 8, 5, (30, 24, 24))
    L.rect(hx + 2, 12, hx + 9, 13, ROJO, tex=False)                                 # cinta al cuello
    return L, _reflejos(L), None


def cuaderno(n=0):
    """Cuaderno escolar abierto con la tarea a medias y un lápiz. Revisar: se pasa la hoja (el último queda)."""
    L = Lienzo(34, 18, semilla=135)
    L.poli([(3, 3), (31, 3), (33, 15), (1, 15)], 'tela-azul', 2)                     # tapa debajo
    L.rect(4, 2, 16, 14, 'papel', 0)                                                # página izquierda
    L.rect(18, 2, 30, 14, 'papel', 1)                                               # página derecha
    L.rect(17, 2, 17, 14, 'papel', 4, tex=False)                                    # espiral
    for y in range(3, 14, 2):
        L.px(17, y, 'cromo', 2)
    for y in range(4, 14, 2):                                                       # renglones
        L.rect(5, y, 15, y, (176, 196, 220), tex=False)
        L.rect(19, y, 29, y, (176, 196, 220), tex=False)
    if n == 0:
        for y, largo in ((4, 9), (6, 7), (8, 4)):                                   # la tarea a medias
            L.rect(6, y - 1, 6 + largo, y - 1, (70, 70, 90), tex=False)
        L.rect(20, 5, 23, 7, ROJO, tex=False)                                       # un dibujo
    elif n == 1:
        L.poli([(17, 2), (25, 0), (25, 12), (17, 14)], 'papel', 0)                  # la hoja en el aire
    else:
        L.rect(6, 3, 12, 3, (70, 70, 90), tex=False)
        L.rect(6, 5, 9, 5, (70, 70, 90), tex=False)
    L.linea(22, 15, 31, 10, (230, 192, 86))                                         # lápiz
    L.px(22, 15, (60, 50, 50))
    L.px(31, 10, (226, 150, 150))
    return L, _reflejos(L), None
