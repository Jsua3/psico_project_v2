"""Hospital, segunda tanda (bloque O1): expediente, libro de registro, zona restringida y cierre del caso.

Se suman a `objetos_hospital.PIEZAS` desde ese módulo; aquí solo viven los dibujos.
"""
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import objetos_pixel as op  # noqa: E402
from objetos_pixel import Lienzo, Reflejo  # noqa: E402

ROJO, AMARILLO, VERDE, AZUL = (204, 84, 72), (230, 192, 86), (96, 170, 104), (70, 110, 160)
LINEA, CLARO, BLANCO = (150, 156, 170), (248, 240, 214), (236, 230, 220)


def _reflejos(L):
    return {lado: Reflejo(L.w, L.h) for lado in op.LADOS}


def expediente(n=0):
    """Expediente clínico grueso en una mesita, con pestañas de colores. Revisar: la tapa se abre (el último queda)."""
    L = Lienzo(36, 34, semilla=121)
    for x in (5, 28):
        L.rect(x, 20, x + 2, 31, 'laminado', 3)
        L.rect(x, 31, x + 2, 31, 'laminado', 4, tex=False)
    L.bloque(2, 16, 33, 22, 'laminado', tapa=3, base=1)
    L.rect(6, 10, 29, 16, 'papel', 2)                                               # canto de las hojas
    for y in range(11, 16):
        L.rect(6, y, 29, y, 'papel', 1 + (y % 2), tex=False)
    for k, c in enumerate((ROJO, AMARILLO, VERDE, AZUL)):                           # pestañas
        L.rect(30, 10 + k, 31, 10 + k, c, tex=False)
    if n == 0:
        L.poli([(7, 4), (30, 4), (29, 10), (5, 10)], 'manila', 1)                   # tapa
        L.rect(7, 4, 30, 4, 'manila', 0, tex=False)
        L.rect(14, 6, 22, 8, 'papel', 0, tex=False)                                 # etiqueta
        L.rect(15, 7, 21, 7, LINEA, tex=False)
        L.rect(23, 5, 25, 9, ROJO, tex=False)                                       # banda de confidencial
    else:
        abre = 6 if n == 1 else 4
        L.rect(6, 6, 29, 10, 'papel', 0)                                            # primera hoja
        for y in (7, 9):
            L.rect(8, y, 26 - (y % 3), y, LINEA, tex=False)
        L.poli([(6, 6), (6, 10), (2, 10 - abre), (3, 6 - abre)], 'manila', 2)        # tapa vuelta hacia atrás
    r = _reflejos(L)
    r['izquierda'].rect(3, 17, 14, 17, 1)
    r['derecha'].rect(22, 17, 32, 17, 1)
    return L, r, None


def registro(n=0):
    """Libro de registro abierto en su atril, con un bolígrafo de cadena. Revisar: la página pasa (el último queda)."""
    L = Lienzo(40, 40, semilla=123)
    L.rect(18, 22, 21, 36, 'acero', 2)                                              # pie
    L.rect(18, 22, 18, 36, 'acero', 1, tex=False)
    L.elipse(10, 35, 29, 39, 'acero', 3)
    L.poli([(4, 10), (35, 10), (37, 23), (2, 23)], 'laminado', 2)                   # atril inclinado
    L.rect(2, 23, 37, 24, 'laminado', 4, tex=False)
    L.rect(5, 6, 18, 21, 'papel', 0)                                                # página izquierda
    L.rect(21, 6, 34, 21, 'papel', 1)                                               # página derecha
    L.rect(19, 6, 20, 21, 'papel', 4, tex=False)                                    # lomo
    for y in range(8, 21, 2):                                                       # renglones de firmas
        L.rect(6, y, 17, y, LINEA, tex=False)
        if n == 0 or y < 14:
            L.rect(22, y, 33 - (y % 4), y, LINEA, tex=False)
    L.rect(7, 9, 12, 9, AZUL, tex=False)                                            # una firma
    if n == 1:                                                                      # la hoja va en el aire
        L.poli([(20, 6), (31, 2), (31, 17), (20, 21)], 'papel', 0)
        L.linea(20, 6, 31, 2, 'papel', 2)
    L.linea(35, 18, 38, 30, 'cromo', 3)                                             # cadena
    L.linea(30, 14, 36, 10, AZUL)                                                   # bolígrafo
    L.px(30, 14, (40, 40, 52))
    r = _reflejos(L)
    r['izquierda'].rect(18, 23, 18, 34, 1)
    r['derecha'].rect(21, 23, 21, 34, 1)
    r['frente'].rect(14, 36, 25, 36, 1)
    return L, r, None


def zona_restringida(n=0):
    """Dos postes con cinta extensible y el letrero de acceso restringido colgado al medio."""
    L = Lienzo(48, 40, semilla=125)
    for x in (4, 40):                                                               # postes
        L.rect(x, 6, x + 3, 33, 'cromo', 2)
        L.rect(x, 6, x, 33, 'cromo', 1, tex=False)
        L.rect(x + 3, 6, x + 3, 33, 'cromo', 4, tex=False)
        L.rect(x - 1, 4, x + 4, 6, 'plastico-negro', 2)                             # cabezal
        L.elipse(x - 4, 33, x + 7, 37, 'plastico-negro', 3)                         # base
    L.rect(8, 7, 39, 9, ROJO, tex=False)                                            # cinta roja
    for x in range(10, 39, 4):
        L.rect(x, 7, x + 1, 9, BLANCO, tex=False)
    L.rect(15, 10, 32, 24, BLANCO, tex=False)                                       # letrero
    L.rect(15, 10, 32, 10, (200, 194, 186), tex=False)
    L.rect(15, 24, 32, 24, (170, 164, 156), tex=False)
    L.elipse(18, 11, 29, 22, ROJO, tex=False)                                       # círculo de prohibido
    L.elipse(20, 13, 27, 20, BLANCO, tex=False)
    L.linea(20, 19, 27, 13, ROJO)
    L.linea(21, 19, 27, 14, ROJO)
    L.rect(23, 15, 24, 18, (64, 60, 76), tex=False)                                 # mano levantada
    r = _reflejos(L)
    r['izquierda'].rect(4, 8, 4, 30, 2)
    r['izquierda'].rect(40, 8, 40, 30, 2)
    r['derecha'].rect(7, 8, 7, 30, 2)
    r['derecha'].rect(43, 8, 43, 30, 2)
    r['frente'].rect(5, 8, 6, 12, 1)
    r['frente'].rect(41, 8, 42, 12, 1)
    return L, r, None


def cierre(n=0):
    """Sobre del cierre del caso con su sello verde, en una bandeja. Revisar: el sobre se abre y asoma el resumen."""
    L = Lienzo(36, 28, semilla=127)
    L.bloque(2, 16, 33, 25, 'acero', tapa=3, base=1)                                # bandeja
    L.rect(4, 19, 31, 19, 'acero', 4, tex=False)
    if n >= 1:                                                                      # el resumen asoma
        alto = 4 if n == 1 else 7
        L.rect(9, 12 - alto, 26, 15, 'papel', 0)
        for y in range(14 - alto, 15, 2):
            L.rect(11, y, 24 - (y % 3), y, LINEA, tex=False)
        L.px(24, 13 - alto, VERDE)
    L.rect(6, 9, 29, 18, 'manila', 1)                                               # sobre
    L.linea(6, 9, 17, 15, 'manila', 3)
    L.linea(29, 9, 18, 15, 'manila', 3)
    if n == 0:
        L.poli([(6, 9), (29, 9), (17, 15)], 'manila', 0)                            # solapa cerrada
    L.elipse(14, 13, 21, 18, VERDE, tex=False)                                      # sello verde
    L.linea(16, 16, 17, 17, CLARO)
    L.linea(17, 17, 19, 14, CLARO)
    r = _reflejos(L)
    r['izquierda'].rect(3, 17, 14, 17, 1)
    r['derecha'].rect(22, 17, 32, 17, 1)
    r['frente'].rect(10, 17, 26, 17, 1)
    return L, r, None
