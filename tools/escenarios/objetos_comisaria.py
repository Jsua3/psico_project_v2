"""Comisaría: los muebles y objetos que usa SIM-VBG-002 (capítulo 3), redibujados al oficio v2 (bloque O1).

    python tools/escenarios/objetos_comisaria.py     # hoja de antes y después en maqueta-visual/objetos/
"""
import os
import sys

import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import objetos_pixel as op  # noqa: E402
from objetos_pixel import Lienzo, Reflejo  # noqa: E402

op.material('acero', (118, 130, 150), op.tex_grano(0.03), luz=0.5, sombra=0.6)          # lámina pintada de oficina
op.material('laminado', (176, 146, 112), op.tex_veta(0.04, largo=(8, 20), claras=0.3), luz=0.45)
op.material('menta', (138, 196, 176), op.tex_grano(0.02), luz=0.45)
op.material('manila', (222, 194, 132), op.tex_grano(0.02), luz=0.4)
op.material('morado', (124, 86, 150), luz=0.4)
op.material('hoja-oscura', (58, 116, 66), op.tex_grano(0.08))
op.material('maceta', (176, 100, 74), op.tex_grano(0.05), luz=0.45)


def _reflejos(L):
    return {lado: Reflejo(L.w, L.h) for lado in op.LADOS}


def _cajon(L, x0, x1, y0, y1, abierto, mat='acero', contenido=True):
    """Cajón que sale hacia la cámara `abierto` px (negativo: empujado hacia adentro)."""
    if abierto > 0:
        L.rect(x0 + 1, y0, x1 - 1, y0 + abierto - 1, mat, 5, tex=False)
        L.rect(x0, y0, x0, y0 + abierto - 1, mat, 3, tex=False)
        L.rect(x1, y0, x1, y0 + abierto - 1, mat, 3, tex=False)
        if contenido and abierto >= 2:
            for k, x in enumerate(range(x0 + 3, x1 - 3, 3)):                      # carpetas colgantes
                L.rect(x, y0, x + 1, y0 + abierto - 1, 'manila', 1 + (k % 2), tex=False)
                if k % 3 == 1:
                    L.px(x, y0, 'morado', 1)
    if abierto > 0:
        y0d, y1d = y0 + abierto, y1 + abierto
    elif abierto < 0:
        y0d, y1d = y0 - 1, y1 - 1
        L.rect(x0, y1, x1, y1, mat, 5, tex=False)
    else:
        y0d, y1d = y0, y1
    L.rect(x0, y0d, x1, y1d, mat, 2)
    L.rect(x0, y0d, x1, y0d, mat, 1, tex=False)
    L.rect(x0, y1d, x1, y1d, mat, 4, tex=False)
    L.rect(x0, y0d, x0, y1d, mat, 3, tex=False)
    L.rect(x1, y0d, x1, y1d, mat, 3, tex=False)
    cx = (x0 + x1) // 2
    L.rect(cx - 5, y0d + 2, cx + 5, y0d + 2, 'cromo', 1, tex=False)                # tirador corrido
    L.rect(cx - 5, y0d + 3, cx + 5, y0d + 3, 'cromo', 4, tex=False)
    return cx, y0d + 2


CAJON = (-1, 3, 6, 5)


def escritorio(n=0):
    """0-1 reposo (el cursor del formulario parpadea), 2-5 el cajón de arriba se abre (el 5 queda)."""
    abierto = 0 if n < 2 else CAJON[n - 2]
    L = Lienzo(126, 70, semilla=71)
    L.rect(70, 1, 99, 19, 'plastico-negro', 2)                                       # monitor
    L.rect(70, 1, 99, 1, 'plastico-negro', 0, tex=False)
    L.rect(72, 3, 97, 17, (64, 104, 150), tex=False)
    L.rect(72, 3, 97, 4, (40, 70, 116), tex=False)                                  # barra de la ventana
    L.rect(75, 6, 94, 16, (226, 232, 238), tex=False)                               # formulario
    for y in (8, 11, 14):
        L.rect(77, y, 86, y, (150, 160, 176), tex=False)
        L.rect(88, y, 92, y, (196, 206, 216), tex=False)
    if n != 1:
        L.rect(89, 11, 89, 12, (30, 40, 60), tex=False)                              # cursor
    L.rect(82, 19, 87, 22, 'plastico-negro', 3)
    L.rect(78, 22, 91, 23, 'plastico-negro', 2)
    L.rect(64, 23, 92, 25, 'plastico-gris', 1)                                       # teclado
    for x in range(65, 92, 2):
        L.px(x, 24, 'plastico-gris', 3)
    L.rect(14, 10, 38, 12, 'manila', 2)                                             # carpetas apiladas
    L.rect(15, 8, 37, 10, 'papel', 1)
    L.rect(13, 13, 39, 15, 'manila', 1)
    L.rect(13, 13, 15, 15, 'morado', 2, tex=False)
    L.rect(16, 6, 36, 7, 'manila', 0)
    L.rect(106, 14, 111, 22, 'plastico-negro', 2)                                    # vaso de lápices
    L.rect(106, 14, 111, 14, 'plastico-negro', 0, tex=False)
    for x, c in ((107, (196, 84, 78)), (109, (70, 104, 160)), (110, (226, 196, 90))):
        L.rect(x, 10, x, 13, c, tex=False)
    L.bloque(1, 22, 123, 31, 'laminado', tapa=7)                                     # tablero
    L.rect(1, 31, 123, 32, 'acero', 4, tex=False)
    L.rect(4, 33, 44, 66, 'acero', 2, tex=False)                                    # pedestal de cajones
    L.rect(4, 33, 44, 33, 'acero', 4, tex=False)
    L.rect(45, 33, 112, 50, 'acero', 4, tex=False)                                  # faldón en sombra
    L.rect(45, 33, 112, 34, 'acero', 5, tex=False)
    L.rect(45, 50, 112, 50, 'acero', 3, tex=False)
    L.rect(113, 33, 122, 66, 'acero', 2, tex=False)                                 # pata panel
    L.rect(113, 33, 113, 66, 'acero', 3, tex=False)
    L.rect(122, 33, 122, 66, 'acero', 4, tex=False)
    L.rect(4, 65, 44, 66, 'acero', 4, tex=False)
    L.rect(113, 65, 122, 66, 'acero', 4, tex=False)
    _cajon(L, 5, 43, 46, 55, 0, contenido=False)
    _cajon(L, 5, 43, 56, 64, 0, contenido=False)
    _cajon(L, 5, 43, 35, 45, abierto)
    ye = 37 + max(abierto, 0) - (1 if abierto < 0 else 0)
    L.rect(7, ye, 12, ye + 1, 'papel', 1, tex=False)                                 # etiqueta del cajón
    em = np.zeros((L.h, L.w), bool)
    em[3:18, 72:98] = True
    r = _reflejos(L)
    r['izquierda'].diagonal(74, 15, 6, 1, 2)
    r['izquierda'].diagonal(78, 16, 4, 1, 1)
    r['derecha'].diagonal(95, 15, 6, 1, 2, sentido=-1)
    r['derecha'].diagonal(91, 16, 4, 1, 1, sentido=-1)
    r['frente'].rect(76, 3, 92, 3, 1)
    r['izquierda'].rect(3, 23, 30, 23, 2)
    r['izquierda'].rect(31, 23, 50, 23, 1)
    r['derecha'].rect(94, 23, 121, 23, 2)
    r['derecha'].rect(76, 23, 93, 23, 1)
    r['frente'].rect(40, 27, 84, 27, 1)
    ty = 37 + max(abierto, 0) - (1 if abierto < 0 else 0)
    for rr, dx in ((r['izquierda'], -4), (r['derecha'], 4), (r['frente'], 0)):
        rr.rect(24 + dx - 1, ty, 24 + dx + 1, ty, 2)
        rr.px(24 + dx, 48, 1)
        rr.px(24 + dx, 58, 1)
    return L, r, em


def silla_visitante(n=0, tela='tela-azul'):
    L = Lienzo(28, 40, semilla=73)
    for x in (4, 22):                                                               # patas de tubo
        L.rect(x, 6, x + 1, 37, 'acero', 2)
        L.rect(x, 6, x, 37, 'acero', 1, tex=False)
    L.cojin(5, 2, 22, 18, tela, r=3, arriba=0.25, abajo=0.2)                        # respaldo
    L.rect(7, 2, 20, 2, tela, 0, tex=False)
    L.rect(3, 20, 24, 23, tela, 1)                                                  # asiento
    L.rect(3, 20, 24, 20, tela, 0, tex=False)
    L.rect(3, 24, 24, 26, tela, 3)
    L.rect(3, 26, 24, 26, tela, 4, tex=False)
    L.rect(5, 27, 22, 27, 'acero', 4, tex=False)
    L.rect(5, 33, 22, 33, 'acero', 3, tex=False)                                    # travesaño
    for x in (4, 22):
        L.rect(x - 1, 37, x + 2, 38, 'plastico-negro', 3, tex=False)
    r = _reflejos(L)
    r['izquierda'].rect(4, 8, 4, 18, 1)
    r['derecha'].rect(23, 8, 23, 18, 1)
    r['frente'].rect(4, 28, 4, 30, 1)
    r['frente'].rect(23, 28, 23, 30, 1)
    return L, r, None


def silla_giratoria(n=0):
    L = Lienzo(30, 44, semilla=75)
    L.cojin(5, 1, 24, 20, 'plastico-negro', r=4, arriba=0.2, abajo=0.15)           # respaldo de malla
    for y in range(4, 19, 2):
        for x in range(7 + (y // 2) % 2, 23, 2):
            L.px(x, y, 'plastico-negro', 3)
    L.rect(13, 21, 16, 23, 'plastico-negro', 4, tex=False)
    L.rect(3, 23, 26, 26, 'plastico-negro', 1)                                      # asiento
    L.rect(3, 23, 26, 23, 'plastico-negro', 0, tex=False)
    L.rect(3, 27, 26, 28, 'plastico-negro', 3, tex=False)
    L.rect(1, 18, 3, 26, 'plastico-negro', 2)                                       # brazos
    L.rect(26, 18, 28, 26, 'plastico-negro', 2)
    L.rect(1, 18, 3, 18, 'plastico-negro', 0, tex=False)
    L.rect(26, 18, 28, 18, 'plastico-negro', 0, tex=False)
    L.rect(13, 29, 16, 35, 'cromo', 2)                                              # pistón
    L.rect(13, 29, 13, 35, 'cromo', 1, tex=False)
    L.rect(16, 29, 16, 35, 'cromo', 4, tex=False)
    L.linea(14, 36, 3, 39, 'plastico-negro', 2)                                     # base de cinco patas
    L.linea(15, 36, 26, 39, 'plastico-negro', 2)
    L.linea(14, 36, 9, 41, 'plastico-negro', 3)
    L.linea(15, 36, 20, 41, 'plastico-negro', 3)
    L.rect(13, 36, 16, 37, 'plastico-negro', 1, tex=False)
    for x, y in ((3, 40), (26, 40), (9, 42), (20, 42)):
        L.rect(x - 1, y - 1, x + 1, y, 'plastico-negro', 4, tex=False)
    r = _reflejos(L)
    r['izquierda'].rect(13, 30, 13, 34, 2)
    r['derecha'].rect(16, 30, 16, 34, 2)
    r['frente'].rect(14, 30, 15, 31, 2)
    return L, r, None


def planta(n=0):
    """4 cuadros: las hojas de arriba se mecen un píxel (aire del ventilador)."""
    L = Lienzo(40, 54, semilla=77)
    L.poli([(10, 36), (30, 36), (27, 52), (13, 52)], 'maceta', 2)                   # matera de barro
    L.rect(9, 34, 31, 37, 'maceta', 1)
    L.rect(9, 34, 31, 34, 'maceta', 0, tex=False)
    L.rect(10, 38, 30, 38, 'maceta', 4, tex=False)
    L.rect(13, 51, 27, 52, 'maceta', 4, tex=False)
    L.rect(11, 33, 29, 34, 'tierra', 2)
    meneo = (0, 1, 0, -1)[n]
    for x0, x1 in ((19, 19), (15, 17), (22, 24)):                                   # tallos
        L.linea(x0, 33, x1, 26, 'hoja', 4)
    hojas = [(19, 1, 9, 9, 0), (9, 6, 12, 7, 1), (29, 6, 12, 7, 1), (4, 14, 10, 6, 2), (34, 14, 10, 6, 2),
             (13, 11, 11, 8, 0), (25, 11, 11, 8, 0), (19, 16, 10, 8, 3), (9, 21, 10, 6, 3), (29, 21, 10, 6, 3), (19, 24, 9, 6, 2)]
    ys = np.arange(L.h)[:, None]
    for cx, cy, rx, ry, capa in hojas:                                              # de atrás hacia adelante
        dx = meneo if capa < 2 else 0
        m = L.elipse_mascara(cx - rx // 2 + dx, cy, cx + rx // 2 + dx, cy + ry)
        L.mascara(m, 'hoja' if capa % 2 == 0 else 'hoja-oscura', 1 + (capa // 2))
        L.sombrear(m & (ys > cy + ry - 3), 1)
        L.linea(cx - rx // 2 + 2 + dx, cy + ry // 2, cx + rx // 2 - 1 + dx, cy + ry // 2 - (1 if cx < 19 else -1), 'hoja', 3)   # nervio
        L.rect(cx - 1 + dx, cy, cx + 1 + dx, cy, 'hoja', 0, tex=False)
    return L, _reflejos(L), None


def mesa_nna(n=0):
    L = Lienzo(64, 38, semilla=79)
    for x in (6, 54):
        L.rect(x, 12, x + 3, 35, 'pino', 2)
        L.rect(x, 12, x, 35, 'pino', 3, tex=False)
        L.rect(x, 34, x + 3, 35, 'pino', 4, tex=False)
    m = L.redondeada_mascara(1, 3, 62, 13, 5)                                       # tablero redondeado
    L.mascara(m, 'menta', 1)
    ys = np.arange(L.h)[:, None]
    L.sombrear(m & (ys >= 10), 1)
    L.sombrear(m & (ys >= 12), 1)
    L.rect(6, 3, 57, 3, 'menta', 0, tex=False)
    L.rect(14, 4, 30, 9, 'papel', 0)                                                # un dibujo a medio hacer
    L.rect(14, 9, 30, 9, 'papel', 2, tex=False)
    L.rect(17, 5, 20, 7, (226, 196, 90), tex=False)                                 # un sol
    L.linea(21, 8, 28, 5, (196, 84, 78), tex=False)
    L.px(23, 6, (70, 104, 160))
    for k, c in enumerate(((196, 84, 78), (70, 104, 160), (82, 150, 90), (226, 196, 90))):   # crayolas
        L.rect(38 + k * 4, 6, 40 + k * 4, 6, c, tex=False)
        L.px(41 + k * 4, 6, op.mezcla(c, (0, 0, 0), 0.4))
    r = _reflejos(L)
    r['izquierda'].rect(3, 4, 12, 4, 1)
    r['derecha'].rect(50, 4, 60, 4, 1)
    return L, r, None


def papelera(n=0):
    L = Lienzo(24, 30, semilla=81)
    L.poli([(3, 6), (20, 6), (18, 28), (5, 28)], 'acero', 2)
    for x in range(5, 19, 2):                                                       # malla
        L.linea(x, 9, x, 26, 'acero', 4)
    L.rect(2, 5, 21, 7, 'acero', 1)
    L.rect(2, 5, 21, 5, 'acero', 0, tex=False)
    L.rect(4, 27, 19, 28, 'acero', 4, tex=False)
    L.elipse(6, 1, 12, 6, 'papel', 1)                                               # papeles arrugados
    L.elipse(11, 2, 17, 6, 'papel', 2)
    L.px(8, 3, 'papel', 3)
    L.px(14, 4, 'papel', 3)
    r = _reflejos(L)
    r['izquierda'].rect(3, 6, 6, 6, 2)
    r['derecha'].rect(17, 6, 20, 6, 2)
    r['frente'].rect(9, 6, 14, 6, 1)
    return L, r, None


PANUELO = (0, 1, 2, 1, 3, 4)          # 0 reposo · 1-3 se mece con el aire (cerca) · 4-5 alguien lo saca un poco (revisar)


def caja_panuelos(n=0):
    L = Lienzo(26, 22, semilla=83)
    L.bloque(2, 8, 23, 20, 'carton', tapa=4, base=1)
    L.rect(2, 14, 23, 16, (96, 140, 180), tex=False)                                 # franja estampada
    for x in range(4, 23, 4):
        L.px(x, 15, (226, 232, 238))
    L.rect(8, 9, 17, 10, 'carton', 5, tex=False)                                     # ranura
    fase = PANUELO[n]
    if fase in (0, 1, 2):
        pico = {0: 0, 1: 1, 2: -1}[fase]
        L.poli([(9, 9), (16, 9), (14 + pico, 3), (11 + pico, 1)], 'papel', 0)
        L.linea(12 + pico, 3, 13, 8, 'papel', 2)
    else:
        alto = 5 if fase == 3 else 7
        L.poli([(9, 9), (16, 9), (15, 9 - alto), (10, 8 - alto)], 'papel', 0)
        L.linea(12, 9 - alto + 2, 12, 8, 'papel', 2)
        L.px(10, 8 - alto, 'papel', 1)
    return L, _reflejos(L), None


CARPETA = (0, 1, 2, 3)                # 0 cerrada · 1 se levanta la tapa · 2 se pasa · 3 abierta (queda)


def carpeta(n=0):
    L = Lienzo(30, 26, semilla=85)
    fase = CARPETA[n]
    if fase == 0:
        L.bloque(2, 8, 25, 23, 'manila', tapa=2, base=1)
        L.rect(2, 11, 25, 13, 'morado', 2, tex=False)                               # banda
        L.rect(19, 15, 23, 18, 'papel', 1, tex=False)                               # etiqueta
        L.rect(20, 16, 22, 16, (120, 124, 140), tex=False)
        for y in (6, 7):                                                            # hojas que asoman
            L.rect(4, y, 23, y, 'papel', 1 + (y % 2), tex=False)
    else:
        abre = {1: 6, 2: 15, 3: 13}[fase]
        L.rect(2, 11, 13, 23, 'manila', 2)
        L.rect(14, 11, 27, 23, 'papel', 0)                                          # formulario
        for y in range(13, 22, 2):
            L.rect(16, y, 25, y, (150, 156, 170), tex=False)
        L.rect(16, 13, 20, 13, (70, 90, 130), tex=False)
        L.elipse(21, 18, 26, 22, (150, 96, 170), tex=False)                          # sello
        L.elipse(22, 19, 25, 21, 'papel', 0)
        L.poli([(2, 11), (13, 11), (13 - abre // 3, 11 - abre // 2), (2 - abre // 6, 11 - abre // 2 + 1)], 'manila', 1)   # tapa
        L.rect(1, 23, 27, 23, 'manila', 4, tex=False)
    return L, _reflejos(L), None


def sillas_espera(n=0, tela='tela-azul'):
    L = Lienzo(124, 40, semilla=87)
    L.rect(2, 30, 121, 32, 'acero', 2)                                              # viga
    L.rect(2, 30, 121, 30, 'acero', 1, tex=False)
    L.rect(2, 32, 121, 32, 'acero', 4, tex=False)
    for x in (10, 112):                                                             # patas en T
        L.rect(x, 33, x + 2, 37, 'acero', 3)
        L.rect(x - 5, 37, x + 7, 38, 'acero', 4, tex=False)
    for k in range(4):
        x0 = 4 + k * 29
        L.cojin(x0 + 2, 1, x0 + 24, 18, tela, r=4, arriba=0.25, abajo=0.2)
        L.rect(x0 + 5, 1, x0 + 21, 1, tela, 0, tex=False)
        L.rect(x0 + 1, 20, x0 + 25, 23, tela, 1)
        L.rect(x0 + 1, 20, x0 + 25, 20, tela, 0, tex=False)
        L.rect(x0 + 1, 24, x0 + 25, 26, tela, 3)
        L.rect(x0 + 1, 26, x0 + 25, 26, tela, 4, tex=False)
        L.rect(x0 + 12, 27, x0 + 14, 29, 'acero', 3, tex=False)
    r = _reflejos(L)
    r['izquierda'].rect(3, 31, 40, 31, 1)
    r['derecha'].rect(84, 31, 120, 31, 1)
    r['frente'].rect(40, 31, 84, 31, 1)
    return L, r, None


def mostrador(n=0):
    """Mostrador de recepción: frente de lámina, tablero laminado, vidrio de atención y el dispensador de turnos encima."""
    L = Lienzo(184, 68, semilla=89)
    L.rect(4, 2, 70, 3, 'acero', 1)                                                 # marco del vidrio
    L.rect(4, 2, 5, 22, 'acero', 2)
    L.rect(69, 2, 70, 22, 'acero', 2)
    vidrio = L.caja_mascara(6, 4, 68, 22)
    L.mascara(vidrio, 'vidrio', 3, tex=False)                                       # arriba, transparente: se ve oscuro
    L.rect(6, 4, 68, 4, 'vidrio', 4, tex=False)                                     # sombra bajo el marco
    L.rect(6, 14, 68, 22, 'vidrio', 1)                                              # abajo, esmerilado
    L.rect(6, 14, 68, 14, 'vidrio', 0, tex=False)
    L.rect(37, 4, 37, 22, 'acero', 2, tex=False)                                    # junta de los dos paños
    for x in range(14, 23, 2):                                                      # rejilla para hablar
        for y in (8, 10):
            L.px(x + (y // 2) % 2, y, 'vidrio', 5)
    L.rect(26, 19, 48, 22, 'vidrio', 5, tex=False)                                  # ventanilla
    L.rect(26, 19, 48, 19, 'acero', 2, tex=False)
    L.rect(96, 12, 120, 22, 'papel', 1)                                             # formularios y libro de registro
    L.rect(96, 12, 120, 12, 'papel', 0, tex=False)
    for y in (15, 18):
        L.rect(98, y, 117, y, (150, 156, 170), tex=False)
    L.rect(108, 12, 108, 22, 'papel', 3, tex=False)
    L.rect(132, 14, 146, 22, 'plastico-negro', 2)                                   # teléfono
    L.rect(133, 13, 145, 15, 'plastico-negro', 1)
    L.bloque(1, 22, 181, 30, 'laminado', tapa=6)                                    # tablero
    L.rect(2, 31, 180, 64, 'acero', 2, tex=False)                                   # frente
    L.rect(2, 31, 180, 32, 'acero', 4, tex=False)
    for x in range(30, 180, 30):                                                    # paneles
        L.rect(x, 33, x, 62, 'acero', 4, tex=False)
        L.rect(x + 1, 33, x + 1, 62, 'acero', 1, tex=False)
    L.rect(2, 44, 180, 47, 'morado', 2, tex=False)                                  # franja institucional
    L.rect(2, 44, 180, 44, 'morado', 1, tex=False)
    L.rect(2, 62, 180, 64, 'acero', 4, tex=False)                                   # zócalo
    r = _reflejos(L)
    r['izquierda'].diagonal(8, 20, 9, 2, 2)
    r['izquierda'].diagonal(18, 20, 6, 1, 1)
    r['derecha'].diagonal(66, 20, 9, 2, 2, sentido=-1)
    r['derecha'].diagonal(56, 20, 6, 1, 1, sentido=-1)
    r['frente'].rect(10, 5, 62, 5, 1)
    r['frente'].rect(28, 5, 40, 5, 2)
    r['izquierda'].rect(3, 23, 50, 23, 2)
    r['derecha'].rect(130, 23, 179, 23, 2)
    r['frente'].rect(60, 27, 120, 27, 1)
    return L, r, None


def caneca(n=0):
    L = Lienzo(28, 34, semilla=91)
    L.poli([(4, 6), (23, 6), (21, 31), (6, 31)], 'plastico-gris', 2)
    L.rect(3, 4, 24, 7, 'plastico-gris', 1)
    L.rect(3, 4, 24, 4, 'plastico-gris', 0, tex=False)
    L.rect(4, 8, 23, 8, 'plastico-gris', 4, tex=False)
    L.rect(9, 0, 18, 3, 'plastico-gris', 2)                                         # tapa abatible
    L.rect(9, 0, 18, 0, 'plastico-gris', 0, tex=False)
    L.rect(8, 14, 19, 19, (82, 150, 96), tex=False)                                 # etiqueta de reciclaje
    L.rect(12, 15, 15, 18, (226, 232, 238), tex=False)
    L.rect(6, 30, 21, 31, 'plastico-gris', 4, tex=False)
    r = _reflejos(L)
    r['izquierda'].rect(5, 9, 5, 26, 1)
    r['derecha'].rect(22, 9, 22, 26, 1)
    r['frente'].rect(8, 4, 19, 4, 1)
    return L, r, None


def camara(n=0):
    """Cámara de seguridad en su brazo: el piloto rojo parpadea (2 cuadros)."""
    L = Lienzo(30, 22, semilla=93)
    L.rect(2, 2, 6, 12, 'plastico-crema', 2)                                        # base en la pared
    L.rect(2, 2, 6, 2, 'plastico-crema', 0, tex=False)
    L.linea(6, 7, 11, 9, 'plastico-crema', 3)                                       # brazo
    L.poli([(10, 6), (25, 9), (26, 16), (11, 13)], 'plastico-crema', 1)             # cuerpo inclinado hacia abajo
    L.linea(11, 13, 26, 16, 'plastico-crema', 3)
    L.elipse(22, 11, 27, 17, 'plastico-negro', 3)                                   # lente
    L.elipse(23, 12, 26, 15, 'vidrio', 4, tex=False)
    L.px(12, 8, (226, 64, 56) if n == 0 else (96, 40, 40))
    em = np.zeros((L.h, L.w), bool)
    em[8, 12] = n == 0
    r = _reflejos(L)
    for rr in r.values():
        rr.px(24, 13, 2)
    return L, r, em


def dispensador_turnos(n=0):
    """Dispensador de turnos con su pantalla: el número cambia (12 → 13) y sale un papelito al revisarlo."""
    L = Lienzo(24, 44, semilla=95)
    L.rect(10, 22, 13, 40, 'acero', 2)                                              # pedestal
    L.rect(10, 22, 10, 40, 'acero', 1, tex=False)
    L.elipse(4, 38, 19, 42, 'acero', 3)
    L.bloque(3, 1, 20, 22, 'plastico-crema', tapa=2, base=1)                        # caja
    L.rect(5, 4, 18, 10, 'plastico-negro', 4, tex=False)                            # pantalla
    digitos = {0: ('1', '2'), 1: ('1', '2'), 2: ('1', '3'), 3: ('1', '3')}[n]
    patron = {'1': ['.#', '##', '.#', '.#', '.#'], '2': ['##', '.#', '##', '#.', '##'], '3': ['##', '.#', '##', '.#', '##']}
    for k, d in enumerate(digitos):
        for yy, fila in enumerate(patron[d]):
            for xx, ch in enumerate(fila):
                if ch == '#':
                    L.px(8 + k * 4 + xx, 5 + yy, (240, 110, 80))
    L.rect(8, 13, 15, 14, 'plastico-negro', 3, tex=False)                           # ranura del papel
    if n >= 3:
        L.rect(9, 14, 14, 19, 'papel', 0, tex=False)
        L.rect(10, 16, 13, 16, (150, 156, 170), tex=False)
    L.rect(6, 17, 7, 18, (196, 84, 78), tex=False)                                  # botón
    em = np.zeros((L.h, L.w), bool)
    em[5:10, 8:16] = True
    r = _reflejos(L)
    r['izquierda'].rect(5, 4, 5, 9, 1)
    r['derecha'].rect(18, 4, 18, 9, 1)
    r['frente'].rect(6, 4, 17, 4, 1)
    return L, r, em


B = 'escenarios/comisaria/arte/'
PIEZAS = {
    'mostrador-recepcion': dict(nombre='Mostrador de recepción', tipo='mueble', dibujar=mostrador, cuadros=1,
                                huella=dict(ancho=178, fondo=16, alto=44), material='acero, laminado y vidrio',
                                reemplaza=B + 'muebles/mostrador-recepcion.png'),
    'caneca-comisaria': dict(nombre='Caneca', tipo='mueble', dibujar=caneca, cuadros=1,
                             huella=dict(ancho=22, fondo=10, alto=30), material='plástico',
                             reemplaza=B + 'muebles/caneca-comisaria.png'),
    'camara-seguridad': dict(nombre='Cámara de seguridad', tipo='objeto', dibujar=camara, cuadros=2,
                             huella=dict(ancho=20, fondo=4, alto=14), material='plástico y vidrio',
                             animaciones=dict(reposo=dict(de=0, hasta=1, fps=1, bucle=True)),
                             reemplaza=B + 'objetos/camara-seguridad.png'),
    'dispensador-turnos': dict(nombre='Dispensador de turnos', tipo='objeto', dibujar=dispensador_turnos, cuadros=4,
                               huella=dict(ancho=16, fondo=6, alto=40), material='plástico',
                               animaciones=dict(reposo=dict(de=0, hasta=1, fps=1, bucle=True),
                                                revisar=dict(de=2, hasta=3, fps=4, bucle=False, sostener=True)),
                               reemplaza=B + 'objetos/dispensador-turnos.png'),
    'escritorio-funcionario': dict(nombre='Escritorio', tipo='mueble', dibujar=escritorio, cuadros=6,
                                   huella=dict(ancho=120, fondo=16, alto=40), material='metal y laminado',
                                   animaciones=dict(reposo=dict(de=0, hasta=1, fps=2, bucle=True),
                                                    revisar=dict(de=2, hasta=5, fps=10, bucle=False, sostener=True)),
                                   reemplaza=B + 'muebles/escritorio-funcionario.png'),
    'silla-visitante-comisaria': dict(nombre='Silla para visitante', tipo='mueble', dibujar=silla_visitante, cuadros=1,
                                      huella=dict(ancho=22, fondo=12, alto=30), material='tela y tubo',
                                      reemplaza=B + 'muebles/silla-visitante-comisaria.png'),
    'silla-giratoria': dict(nombre='Silla giratoria', tipo='mueble', dibujar=silla_giratoria, cuadros=1,
                            huella=dict(ancho=24, fondo=12, alto=36), material='malla y cromo',
                            reemplaza=B + 'muebles/silla-giratoria.png'),
    'planta-oficina': dict(nombre='Planta de oficina', tipo='mueble', dibujar=planta, cuadros=4,
                           huella=dict(ancho=22, fondo=10, alto=46), material='hojas',
                           animaciones=dict(reposo=dict(de=0, hasta=3, fps=2, bucle=True)),
                           reemplaza=B + 'muebles/planta-oficina.png'),
    'mesa-baja-nna': dict(nombre='Mesa baja para niñas y niños', tipo='mueble', dibujar=mesa_nna, cuadros=1,
                          huella=dict(ancho=60, fondo=12, alto=20), material='madera pintada',
                          reemplaza=B + 'muebles/mesa-baja-nna.png'),
    'sillas-espera-comisaria': dict(nombre='Fila de sillas de espera', tipo='mueble', dibujar=sillas_espera, cuadros=1,
                                    huella=dict(ancho=118, fondo=14, alto=32), material='tela y acero',
                                    reemplaza=B + 'muebles/sillas-espera-comisaria.png'),
    'papelera': dict(nombre='Papelera', tipo='objeto', dibujar=papelera, cuadros=1,
                     huella=dict(ancho=18, fondo=8, alto=24), material='malla de acero',
                     reemplaza=B + 'objetos/papelera.png'),
    'caja-panuelos': dict(nombre='Caja de pañuelos', tipo='objeto', dibujar=caja_panuelos, cuadros=6, sobre=20,
                          huella=dict(ancho=22, fondo=6, alto=12), material='cartón',
                          animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                           cerca=dict(de=1, hasta=3, fps=6, bucle=False, luego='reposo'),
                                           revisar=dict(de=4, hasta=5, fps=8, bucle=False, sostener=True)),
                          reemplaza=B + 'objetos/caja-panuelos.png'),
    'carpeta-medidas-proteccion': dict(nombre='Carpeta de medidas de protección', tipo='objeto', dibujar=carpeta, cuadros=4, sobre=24,
                                       huella=dict(ancho=24, fondo=6, alto=14), material='cartulina',
                                       animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                                        revisar=dict(de=1, hasta=3, fps=8, bucle=False, sostener=True)),
                                       reemplaza=B + 'objetos/carpeta-medidas-proteccion.png'),
}


if __name__ == '__main__':
    import objetos_hoja
    objetos_hoja.hoja_lugar('comisaria', PIEZAS)
