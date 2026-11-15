"""Casa: muebles y objetos redibujados al oficio v2 (bloque O1). Primera tanda: la sala de «Sala viva».

Cada función de dibujo recibe el número de cuadro y devuelve (Lienzo, reflejos por lado, máscara de lo que emite luz);
`objetos_comun.armar` los convierte en la pieza terminada (cuadros, máscaras recortadas con la misma caja, ficha).

    python tools/escenarios/objetos_casa.py     # escribe la hoja de antes y después en maqueta-visual/objetos/
"""
import os
import random
import sys

import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from objetos_pixel import Lienzo, Reflejo  # noqa: E402


def _reflejos(L):
    return {lado: Reflejo(L.w, L.h) for lado in ('izquierda', 'frente', 'derecha')}


# ── sofá y sillón ──────────────────────────────────────────────────────────────

def _brazo(L, x0, x1, y0, y1, tela):
    """Brazo enrollado: rollo de arriba con luz, panel delantero y la curva que lo separa."""
    L.cojin(x0, y0, x1, y1, tela, r=4, arriba=0.16, abajo=0.10)
    L.rect(x0 + 1, y0 + 5, x1 - 1, y0 + 5, tela, 3, tex=False)            # debajo del rollo
    L.rect(x0 + 2, y0 + 6, x1 - 2, y0 + 6, tela, 2, tex=False)
    L.rect(x0 + 2, y1 - 3, x1 - 2, y1 - 1, tela, 4, tex=False)            # contacto con el faldón


def _faldon(L, x0, x1, y0, y1, tela, pliegues):
    """Faldón liso con pliegues encontrados (una línea en sombra y su labio con luz) y el dobladillo abajo."""
    L.rect(x0, y0, x1, y1, tela, 3, tex=False)
    L.rect(x0, y0, x1, y0, tela, 4, tex=False)                            # sombra bajo los cojines
    L.rect(x0, y1 - 1, x1, y1, tela, 4, tex=False)
    L.rect(x0, y1 - 2, x1, y1 - 2, tela, 2, tex=False)                    # dobladillo
    for x in pliegues:
        L.rect(x, y0 + 1, x, y1 - 1, tela, 5, tex=False)
        L.rect(x + 1, y0 + 1, x + 1, y1 - 2, tela, 2, tex=False)


def _cojin_asiento(L, x0, x1, y, tela, gastado=False):
    L.rect(x0, y, x1, y + 6, tela, 1)                                     # cara de arriba
    L.rect(x0, y, x1, y, tela, 3, tex=False)                              # se mete bajo el respaldo
    L.rect(x0 + 1, y + 1, x1 - 1, y + 1, tela, 2, tex=False)
    L.rect(x0, y + 7, x1, y + 7, tela, 0, tex=False)                      # ribete del canto
    L.rect(x0, y + 8, x1, y + 12, tela, 2)                                # frente del cojín
    L.rect(x0, y + 12, x1, y + 12, tela, 4, tex=False)
    L.px(x0, y + 7, tela, 2)
    L.px(x1, y + 7, tela, 2)                                              # esquinas redondas
    if gastado:                                                           # donde alguien se sienta siempre
        cx = (x0 + x1) // 2 + 3
        L.rect(cx - 9, y + 4, cx + 7, y + 4, tela, 2, tex=False)
        L.rect(cx - 7, y + 5, cx + 5, y + 5, tela, 3, tex=False)
        L.rect(cx - 6, y + 2, cx + 3, y + 3, tela, 0, tex=True)


def sofa(n=0, tela='pana-verde', cojin='lino-rojo'):
    L = Lienzo(96, 48, semilla=11)
    for x in (9, 85):                                                     # patas de nogal
        L.rect(x, 41, x + 2, 45, 'nogal', 3)
        L.rect(x, 41, x + 2, 41, 'nogal', 1, tex=False)
        L.rect(x + 1, 44, x + 1, 46, 'nogal', 4, tex=False)
    _faldon(L, 5, 90, 36, 41, tela, (28, 47, 67))
    L.cojin(6, 2, 89, 28, tela, r=6, arriba=0.14, abajo=0.08)             # cuerpo del respaldo
    L.cojin(13, 6, 47, 27, tela, r=4, arriba=0.28, abajo=0.30)            # cojines del respaldo
    L.cojin(48, 6, 82, 27, tela, r=4, arriba=0.28, abajo=0.30)
    for cx in (30, 65):                                                   # capitoné
        for dx in (-9, 0, 9):
            L.px(cx + dx, 14, tela, 4)
            L.px(cx + dx + 1, 14, tela, 3)
            L.px(cx + dx, 15, tela, 3)
    _cojin_asiento(L, 12, 47, 24, tela)
    _cojin_asiento(L, 48, 83, 24, tela, gastado=True)
    L.rect(47, 24, 48, 36, tela, 5, tex=False)                            # costura entre cojines
    _brazo(L, 2, 13, 12, 40, tela)
    _brazo(L, 82, 93, 12, 40, tela)
    L.elipse(83, 11, 92, 16, 'crochet', 1)                                # carpeta de crochet en el brazo
    for x in range(83, 93, 2):
        L.px(x, 17, 'crochet', 2)
    L.rect(86, 13, 89, 13, 'crochet', 3, tex=False)
    pts = [(15, 13), (31, 9), (34, 27), (17, 29)]                         # cojín de lino, ladeado
    m = L.poli_mascara(pts)
    L.mascara(m, cojin, 2)
    ys = np.arange(L.h)[:, None]
    L.sombrear(m & (ys <= 13), -1)
    L.sombrear(m & (ys >= 25), 1)
    borde = m & ~np.roll(m, -1, 1) | m & ~np.roll(m, -1, 0)              # canto derecho y de abajo: separa del verde
    L.mascara(borde, cojin, 5, tex=False)
    L.linea(16, 13, 31, 9, cojin, 0)
    L.linea(19, 15, 31, 25, cojin, 4)                                     # pliegue en diagonal
    L.linea(18, 28, 33, 26, cojin, 4)
    for x, y in ((14, 12), (32, 8), (35, 27), (16, 30)):                  # borlas
        L.px(x, y, cojin, 3)
    L.rect(13, 30, 33, 30, tela, 4, tex=False)                            # sombra del cojín sobre el asiento
    r = _reflejos(L)                                                      # la pana no brilla: solo el barniz de las patas
    for x in (9, 85):
        r['izquierda'].px(x, 42, 1)
        r['derecha'].px(x + 2, 42, 1)
        r['frente'].px(x + 1, 41, 1)
    return L, r, None


def sillon(n=0, tela='pana-rosa'):
    L = Lienzo(50, 44, semilla=23)
    for x in (7, 40):
        L.rect(x, 37, x + 2, 41, 'nogal', 3)
        L.rect(x, 37, x + 2, 37, 'nogal', 1, tex=False)
        L.rect(x + 1, 40, x + 1, 42, 'nogal', 4, tex=False)
    _faldon(L, 5, 44, 32, 37, tela, (24,))
    L.cojin(6, 2, 43, 26, tela, r=7, arriba=0.16, abajo=0.08)
    L.cojin(12, 5, 37, 24, tela, r=5, arriba=0.30, abajo=0.28)
    L.px(24, 13, tela, 4)
    L.px(25, 13, tela, 3)
    L.px(24, 14, tela, 3)
    _cojin_asiento(L, 11, 38, 21, tela, gastado=True)
    _brazo(L, 2, 12, 11, 36, tela)
    _brazo(L, 37, 47, 11, 36, tela)
    L.elipse(17, 1, 32, 5, 'crochet', 1)                                  # carpeta en el respaldo
    for x in range(17, 33, 2):
        L.px(x, 6, 'crochet', 2)
    L.rect(20, 3, 29, 3, 'crochet', 3, tex=False)
    r = _reflejos(L)
    for x in (7, 40):
        r['izquierda'].px(x, 38, 1)
        r['derecha'].px(x + 2, 38, 1)
        r['frente'].px(x + 1, 37, 1)
    return L, r, None


# ── mesa de centro y mueble del televisor ──────────────────────────────────────

def mesa_centro(n=0):
    L = Lienzo(54, 32, semilla=31)
    for x in (4, 46):                                                     # patas
        L.rect(x, 9, x + 3, 29, 'roble', 3)
        L.rect(x, 9, x, 29, 'roble', 4, tex=False)
        L.rect(x + 1, 29, x + 2, 29, 'roble', 4, tex=False)
    L.rect(6, 20, 47, 23, 'roble', 2)                                     # repisa de abajo
    L.rect(6, 20, 47, 20, 'roble', 1, tex=False)
    L.rect(6, 23, 47, 23, 'roble', 4, tex=False)
    for x0, x1, y, c, e in ((10, 22, 19, 'papel', 2), (11, 24, 18, 'lino-rojo', 1), (12, 22, 17, 'tela-azul', 1)):
        L.rect(x0, y, x1, y, c, e, tex=False)                             # revistas
    L.rect(28, 18, 33, 19, 'ceramica', 2)
    L.rect(28, 18, 33, 18, 'ceramica', 0, tex=False)                      # canasto
    L.bloque(1, 1, 52, 10, 'roble', tapa=6)                               # tablero barnizado
    L.elipse(19, 1, 34, 5, 'crochet', 1)                                  # carpeta de crochet
    for x in range(20, 34, 2):
        L.px(x, 5, 'crochet', 3)
    r = _reflejos(L)
    r['izquierda'].rect(3, 2, 14, 2, 2)
    r['izquierda'].rect(15, 2, 17, 2, 1)
    r['izquierda'].rect(3, 3, 8, 3, 1)
    r['derecha'].rect(37, 2, 50, 2, 2)
    r['derecha'].rect(35, 2, 36, 2, 1)
    r['derecha'].rect(45, 3, 50, 3, 1)
    r['frente'].rect(8, 4, 17, 4, 1)
    r['frente'].rect(36, 4, 45, 4, 1)
    return L, r, None


def _cajon(L, x0, x1, y0, y1, abierto, contenido=True):
    """Cajón que sale hacia la cámara `abierto` px (negativo: empujado hacia adentro)."""
    if abierto > 0:
        L.rect(x0 + 1, y0, x1 - 1, y0 + abierto - 1, 'nogal', 5, tex=False)          # hueco
        L.rect(x0, y0, x0, y0 + abierto - 1, 'nogal', 3, tex=False)                   # costados
        L.rect(x1, y0, x1, y0 + abierto - 1, 'nogal', 3, tex=False)
        if contenido and abierto >= 2:
            L.rect(x0 + 3, y0 + 1, x0 + 12, y0 + abierto - 1, 'papel', 1, tex=False)  # papeles
            L.rect(x0 + 6, y0, x0 + 15, y0 + abierto - 2, 'papel', 0, tex=False)
            L.rect(x0 + 17, y0 + 1, x0 + 22, y0 + abierto - 1, 'carton', 1, tex=False)  # sobre
            L.rect(x0 + 6, y0 + abierto - 1, x0 + 15, y0 + abierto - 1, 'papel', 2, tex=False)
    y0d, y1d = y0 + max(abierto, 0), y1 + max(abierto, 0)
    if abierto < 0:
        y0d, y1d = y0 - 1, y1 - 1
        L.rect(x0, y1, x1, y1, 'nogal', 5, tex=False)
    L.rect(x0, y0d, x1, y1d, 'nogal', 2)
    L.rect(x0, y0d, x1, y0d, 'nogal', 1, tex=False)
    L.rect(x0, y1d, x1, y1d, 'nogal', 4, tex=False)
    L.rect(x0, y0d, x0, y1d, 'nogal', 3, tex=False)
    L.rect(x1, y0d, x1, y1d, 'nogal', 3, tex=False)
    cx, cy = (x0 + x1) // 2, (y0d + y1d) // 2
    L.rect(cx - 2, cy, cx + 2, cy, 'laton', 2, tex=False)                 # tirador
    L.rect(cx - 1, cy - 1, cx + 1, cy - 1, 'laton', 1, tex=False)
    L.px(cx - 2, cy + 1, 'laton', 4)
    L.px(cx + 2, cy + 1, 'laton', 4)
    return cx, cy


CAJON = (-1, 3, 6, 5)                     # anticipación, sale, se pasa, se asienta


def mueble_tv(n=0):
    """Cuadros: 0-1 reposo (el piloto del decodificador parpadea), 2-5 el cajón de arriba se abre (el 5 queda)."""
    abierto = 0 if n < 2 else CAJON[n - 2]
    L = Lienzo(104, 40, semilla=41)
    for x in (4, 95):                                                     # patas
        L.rect(x, 33, x + 3, 36, 'nogal', 3)
        L.rect(x, 36, x + 3, 36, 'nogal', 4, tex=False)
    L.bloque(1, 2, 101, 33, 'nogal', tapa=6)
    L.rect(1, 31, 101, 33, 'nogal', 4, tex=False)                         # zócalo
    L.rect(1, 30, 101, 30, 'nogal', 3, tex=False)
    L.rect(37, 10, 65, 29, 'nogal', 5, tex=False)                         # nicho del centro
    L.rect(37, 20, 65, 21, 'nogal', 2)                                    # entrepaño
    L.rect(37, 20, 65, 20, 'nogal', 1, tex=False)
    L.bloque(40, 23, 62, 29, 'plastico-negro', tapa=2, base=1)            # decodificador
    L.rect(44, 26, 52, 26, 'plastico-negro', 4, tex=False)
    L.px(58, 26, (110, 230, 140) if n != 1 else (40, 90, 60))
    for k, (c, e) in enumerate((('lino-rojo', 2), ('tela-azul', 2), ('papel', 2), ('plastico-negro', 1), ('tela-azul', 1))):
        L.rect(40 + k * 3, 13, 41 + k * 3, 19, c, e, tex=False)         # cajas de películas
        L.px(40 + k * 3, 13, c, 0)
    L.rect(57, 15, 62, 19, 'ceramica', 2)
    L.rect(57, 15, 62, 15, 'ceramica', 0, tex=False)                      # matera pequeña
    L.rect(58, 12, 61, 14, 'hoja', 2)
    L.px(59, 11, 'hoja', 1)
    L.px(61, 12, 'hoja', 3)
    _cajon(L, 4, 33, 20, 29, 0, contenido=False)                          # el de abajo primero: el de arriba lo tapa
    _cajon(L, 4, 33, 10, 19, abierto)
    L.rect(69, 10, 98, 29, 'nogal', 2)                                    # puerta del gabinete
    L.rect(69, 10, 98, 10, 'nogal', 1, tex=False)
    L.rect(69, 29, 98, 29, 'nogal', 4, tex=False)
    L.rect(73, 13, 94, 26, 'nogal', 3)
    L.rect(73, 13, 94, 13, 'nogal', 4, tex=False)
    L.rect(73, 26, 94, 26, 'nogal', 1, tex=False)
    L.rect(73, 13, 73, 26, 'nogal', 4, tex=False)
    L.rect(94, 13, 94, 26, 'nogal', 1, tex=False)
    L.rect(71, 18, 71, 21, 'laton', 2, tex=False)
    L.px(71, 18, 'laton', 1)
    for x in (36, 66):                                                    # divisiones
        L.rect(x, 9, x, 29, 'nogal', 4, tex=False)
    em = np.zeros((L.h, L.w), bool)
    em[26, 58] = n != 1
    r = _reflejos(L)
    r['izquierda'].rect(3, 3, 30, 3, 2)
    r['izquierda'].rect(31, 3, 44, 3, 1)
    r['izquierda'].rect(3, 4, 18, 4, 1)
    r['derecha'].rect(72, 3, 99, 3, 2)
    r['derecha'].rect(58, 3, 71, 3, 1)
    r['derecha'].rect(84, 4, 99, 4, 1)
    r['frente'].rect(30, 6, 72, 6, 1)
    r['frente'].rect(44, 3, 58, 3, 1)
    ty = 14 + max(abierto, 0) - (1 if abierto < 0 else 0)
    for rr, dx in ((r['izquierda'], -1), (r['derecha'], 1), (r['frente'], 0)):
        rr.px(18 + dx, ty, 2)                                             # tirador de latón
        rr.px(71, 18 + (1 if dx < 0 else 0), 1)
    return L, r, em


# ── televisor ──────────────────────────────────────────────────────────────────

PROG = dict(
    pared=(70, 92, 128), pared2=(54, 72, 104), ventana=(150, 186, 214), piel=(222, 172, 132), piel2=(178, 122, 96),
    pelo=(58, 40, 34), rojo=(196, 84, 78), verde=(96, 150, 104), luz=(240, 236, 206), negro=(18, 24, 34),
    cielo=(132, 176, 214), pasto=(98, 156, 92), casa=(214, 196, 160), techo=(170, 84, 66),
    ruido=((40, 44, 52), (120, 124, 132), (206, 210, 214)))


def _programa(L, x0, y0, x1, y1, n, ruido=None):
    """La imagen de la pantalla. 8 cuadros: plano de dos personas (0-3), primer plano (4-5) y exterior (6-7)."""
    P = PROG
    W, H = x1 - x0 + 1, y1 - y0 + 1
    if ruido is not None:
        rnd = random.Random(ruido)
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                L.px(x, y, P['ruido'][rnd.randrange(3)])
        barra = y0 + (ruido * 3) % H
        L.rect(x0, barra, x1, min(y1, barra + 1), P['ruido'][2], tex=False)
        return
    if n < 4:
        L.rect(x0, y0, x1, y1, P['pared'], tex=False)
        L.rect(x0, y1 - 3, x1, y1, P['pared2'], tex=False)
        L.rect(x0 + 1, y0 + 1, x0 + 4, y0 + 5, P['ventana'], tex=False)
        hl = 1 if n in (1, 2) else 0                                     # habla: la cabeza se mueve
        L.rect(x0 + 2, y0 + 6 + hl, x0 + 5, y1, P['rojo'], tex=False)    # ella
        L.rect(x0 + 3, y0 + 3 + hl, x0 + 5, y0 + 5 + hl, P['piel'], tex=False)
        L.rect(x0 + 2, y0 + 2 + hl, x0 + 5, y0 + 3 + hl, P['pelo'], tex=False)
        L.rect(x0 + 2, y0 + 3 + hl, x0 + 2, y0 + 7 + hl, P['pelo'], tex=False)
        L.rect(x1 - 5, y0 + 6, x1 - 1, y1, P['verde'], tex=False)        # él, de espaldas a medias
        L.rect(x1 - 4, y0 + 3, x1 - 2, y0 + 5, P['piel2'], tex=False)
        L.rect(x1 - 4, y0 + 2, x1 - 2, y0 + 2, P['pelo'], tex=False)
    elif n < 6:
        L.rect(x0, y0, x1, y1, P['pared2'], tex=False)
        cx = x0 + W // 2 - 1 + (n - 4)
        L.rect(cx - 4, y0 + 1, cx + 4, y0 + 3, P['pelo'], tex=False)
        L.rect(cx - 5, y0 + 2, cx - 4, y1 - 1, P['pelo'], tex=False)
        L.rect(cx - 3, y0 + 3, cx + 3, y1 - 3, P['piel'], tex=False)
        L.rect(cx + 2, y0 + 4, cx + 3, y1 - 3, P['piel2'], tex=False)
        L.px(cx - 2, y0 + 6, P['negro'])
        L.px(cx + 1, y0 + 6, P['negro'])
        L.rect(cx - 1, y0 + 9, cx, y0 + 9, P['rojo'], tex=False)
        L.rect(cx - 5, y1 - 2, cx + 5, y1, P['rojo'], tex=False)
    else:
        L.rect(x0, y0, x1, y1, P['cielo'], tex=False)
        L.rect(x0, y1 - 4, x1, y1, P['pasto'], tex=False)
        hx = x0 + 3 + (n - 6) * 2
        L.rect(hx, y1 - 7, hx + 6, y1 - 4, P['casa'], tex=False)
        L.poli([(hx - 1, y1 - 7), (hx + 3, y1 - 10), (hx + 7, y1 - 7)], P['techo'], tex=False)
        L.px(hx + 2, y1 - 6, P['negro'])
        L.rect(x0 + 1, y0 + 1, x0 + 3, y0 + 1, P['luz'], tex=False)
    fila = y0 + (n * 2) % H                                               # una fila más oscura que baja
    for x in range(x0, x1 + 1):
        L.px(x, fila, tuple(int(v * 0.78) for v in L.directo[fila, x]))


TV_RUIDO = (101, 102, 103)                 # tres cuadros de estática al cambiar de canal
# La pantalla usa solo estos tonos (los de PROG, más sus versiones en sombra de la curvatura y del barrido).
PALETA_PANTALLA = np.array([(18, 24, 34), (54, 72, 104), (70, 92, 128), (150, 186, 214), (222, 172, 132),
                            (150, 104, 82), (58, 40, 34), (196, 84, 78), (96, 150, 104), (226, 210, 168),
                            (170, 84, 66), (240, 236, 206), (40, 44, 52), (120, 124, 132), (206, 210, 214)], np.int32)


def _a_paleta(L, x0, y0, x1, y1):
    """Lleva cada píxel directo de la pantalla al tono más cercano de PALETA_PANTALLA (la tira no pasa de 40)."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if L.mat[y, x] == -2:
                c = L.directo[y, x].astype(np.int32)
                k = int(np.argmin(((PALETA_PANTALLA - c) ** 2).sum(1)))
                L.directo[y, x] = PALETA_PANTALLA[k]


def televisor(n=0):
    """Cuadros: 0-7 programa (reposo), 8-10 estática y 11 el canal nuevo (cerca y revisar)."""
    L = Lienzo(36, 40, semilla=53)
    L.elipse(13, 9, 22, 13, 'plastico-negro', 2)                          # antena de conejo
    L.rect(13, 12, 22, 13, 'plastico-negro', 3, tex=False)
    L.px(17, 10, 'plastico-negro', 0)
    L.linea(15, 10, 9, 1, 'cromo', 2)
    L.linea(20, 10, 27, 2, 'cromo', 3)
    L.px(9, 1, 'cromo', 0)
    L.px(27, 2, 'cromo', 0)
    L.px(8, 0, 'cromo', 1)
    L.px(28, 1, 'cromo', 1)
    # tapa de la caja: se ve de arriba y se angosta hacia atrás (el tubo es hondo)
    L.poli([(5, 12), (30, 12), (33, 17), (2, 17)], 'plastico-negro', 1)
    L.rect(6, 12, 29, 12, 'plastico-negro', 2, tex=False)                 # canto de atrás, más lejos
    L.rect(2, 17, 33, 17, 'plastico-negro', 0, tex=False)                 # canto delantero recoge la luz del techo
    for x in range(9, 27, 3):                                             # ranuras de ventilación
        L.rect(x, 14, x + 1, 14, 'plastico-negro', 3, tex=False)
    L.rect(2, 18, 33, 36, 'plastico-negro', 2)                            # frente
    L.rect(2, 18, 33, 18, 'plastico-negro', 3, tex=False)
    L.rect(2, 35, 33, 36, 'plastico-negro', 4, tex=False)
    L.rect(2, 19, 2, 34, 'plastico-negro', 3, tex=False)
    L.rect(33, 19, 33, 34, 'plastico-negro', 3, tex=False)
    L.rect(4, 37, 8, 38, 'plastico-negro', 4, tex=False)                  # patas
    L.rect(27, 37, 31, 38, 'plastico-negro', 4, tex=False)
    L.mascara(L.redondeada_mascara(4, 20, 25, 34, 3), 'plastico-negro', 4, tex=False)   # bisel: sombra arriba
    L.mascara(L.redondeada_mascara(5, 21, 25, 34, 3), 'plastico-negro', 1, tex=False)   # labio con luz abajo
    pantalla = L.redondeada_mascara(5, 21, 24, 33, 3)
    L.mascara(pantalla, 'pantalla', 2, tex=False)
    if 8 <= n <= 10:
        _programa(L, 6, 22, 23, 32, 0, ruido=TV_RUIDO[n - 8])
    else:
        _programa(L, 6, 22, 23, 32, 2 if n == 11 else n)
    for (x, y) in ((6, 22), (23, 22), (6, 32), (23, 32), (7, 22), (6, 23), (22, 22), (23, 23), (6, 31), (7, 32), (22, 32), (23, 31)):
        L.px(x, y, tuple(int(v * 0.55) for v in L.directo[y, x]))       # curvatura del tubo
    _a_paleta(L, 6, 22, 23, 32)
    for cy in (21, 26):                                                   # perillas de cromo
        L.elipse(27, cy, 31, cy + 3, 'cromo', 2)
        L.rect(28, cy, 30, cy, 'cromo', 1, tex=False)
        L.rect(28, cy + 3, 30, cy + 3, 'cromo', 4, tex=False)
        L.px(29, cy + 1, 'cromo', 4)
    for y in range(31, 35):                                               # rejilla del parlante
        L.rect(27, y, 31, y, 'plastico-negro', 4 if y % 2 else 1, tex=False)
    L.px(31, 35, (226, 70, 60) if n % 4 != 3 else (120, 40, 40))         # piloto
    em = np.zeros((L.h, L.w), bool)
    em[22:33, 6:24] = True
    em[35, 31] = True
    r = _reflejos(L)
    r['izquierda'].diagonal(7, 28, 5, 1, 2)
    r['izquierda'].diagonal(7, 31, 3, 1, 1)
    r['izquierda'].px(6, 24, 1)
    r['derecha'].diagonal(22, 28, 5, 1, 2, sentido=-1)
    r['derecha'].diagonal(22, 31, 3, 1, 1, sentido=-1)
    r['derecha'].px(23, 24, 1)
    r['frente'].rect(9, 22, 19, 22, 1)
    r['frente'].rect(11, 22, 15, 22, 2)
    for rr, dx in ((r['izquierda'], -1), (r['derecha'], 1), (r['frente'], 0)):
        rr.px(29 + dx, 22, 2)                                             # perillas
        rr.px(29 + dx, 27, 2)
    r['izquierda'].rect(3, 17, 9, 17, 1)
    r['derecha'].rect(26, 17, 32, 17, 1)
    r['izquierda'].px(9, 1, 1)
    r['derecha'].px(27, 2, 1)
    return L, r, em


# ── portarretrato ──────────────────────────────────────────────────────────────

FOTO = dict(fondo=(150, 158, 170), fondo2=(118, 126, 142), piel=(214, 170, 132), pelo=(62, 44, 36), vestido=(170, 96, 110),
            camisa=(110, 140, 176), nina=(222, 196, 116), carton=(196, 168, 128), rasgado=(240, 236, 222), manga=(70, 76, 96))
INCLINA = (0, 1, 2, -1, 3, 2)              # 0 reposo · 1-2 se inclina (cerca) · 3-5 se echa atrás, se pasa y se asienta (revisar)


def portarretrato(n=0):
    """Cuadros: 0 reposo, 1-2 se inclina hacia quien se acerca, 3-5 se levanta hacia la cámara (el 5 queda)."""
    inclina = INCLINA[n]
    F = FOTO
    alto_foto = 13 + inclina
    L = Lienzo(24, 32, semilla=61)
    yb = 30                                                                # base, sobre el mueble
    y0 = yb - alto_foto - 4
    if inclina <= 0:                                                       # la pata de atrás se ve cuando está echado
        L.linea(18, yb, 15, y0 + 6, 'laton', 4)
    L.rect(3, y0, 20, yb, 'laton', 2)                                      # marco de latón con bisel
    L.rect(3, y0, 20, y0, 'laton', 0, tex=False)
    L.rect(4, y0 + 1, 19, y0 + 1, 'laton', 1, tex=False)
    L.rect(3, yb, 20, yb, 'laton', 4, tex=False)
    L.rect(4, yb - 1, 19, yb - 1, 'laton', 3, tex=False)
    L.rect(3, y0 + 1, 3, yb - 1, 'laton', 3, tex=False)
    L.rect(20, y0 + 1, 20, yb - 1, 'laton', 3, tex=False)
    fx0, fy0, fx1, fy1 = 5, y0 + 2, 18, yb - 2                             # la foto
    L.rect(fx0 - 1, fy0 - 1, fx1 + 1, fy0 - 1, 'laton', 4, tex=False)      # filo interior en sombra
    L.rect(fx0 - 1, fy0, fx0 - 1, fy1, 'laton', 4, tex=False)
    L.rect(fx0, fy0, fx1, fy1, F['fondo'], tex=False)
    L.rect(fx0, fy1 - 4, fx1, fy1, F['fondo2'], tex=False)

    def s(k):                                                              # alto proporcional a la inclinación
        return fy0 + (k * (fy1 - fy0)) // 12
    L.rect(9, s(3), 11, s(5), F['piel'], tex=False)                        # mamá
    L.rect(9, s(2), 11, s(3) - 1, F['pelo'], tex=False)
    L.rect(8, s(2) + 1, 8, s(7), F['pelo'], tex=False)
    L.rect(8, s(6), 12, fy1, F['vestido'], tex=False)
    L.rect(6, s(6), 7, s(8) - 1, F['piel'], tex=False)                     # la niña
    L.rect(6, s(6) - 1, 7, s(6) - 1, F['pelo'], tex=False)
    L.rect(5, s(8), 7, fy1, F['nina'], tex=False)
    L.rect(13, s(5), 14, s(7) - 1, F['piel'], tex=False)                   # el niño
    L.rect(13, s(5) - 1, 14, s(5) - 1, F['pelo'], tex=False)
    L.rect(13, s(7), 14, fy1, F['camisa'], tex=False)
    for y in range(fy0, fy1 + 1):                                          # falta alguien: el lado derecho está arrancado
        corte = 16 + (1 if (y * 5) % 7 < 2 else 0)
        L.rect(corte, y, fx1, y, F['carton'], tex=False)
        L.px(corte - 1, y, F['rasgado'])
    L.rect(15, s(7), 15, fy1, F['manga'], tex=False)                       # lo que quedó de alguien junto al corte
    r = _reflejos(L)
    largo = 4 + max(0, inclina)
    r['izquierda'].diagonal(fx0, fy1 - 3, largo, 1, 2)
    r['izquierda'].diagonal(fx0 + 2, fy1 - 1, largo - 1, 1, 1)
    r['derecha'].diagonal(fx1, fy1 - 3, largo, 1, 2, sentido=-1)
    r['derecha'].diagonal(fx1 - 2, fy1 - 1, largo - 1, 1, 1, sentido=-1)
    r['frente'].rect(fx0 + 1, fy0 + 1, fx1 - 2, fy0 + 1, 1)
    r['frente'].rect(fx0 + 3, fy0 + 1, fx0 + 6, fy0 + 1, 2)
    for rr, x in ((r['izquierda'], 3), (r['derecha'], 20), (r['frente'], 11)):
        rr.px(x, y0, 2)                                                    # canto de latón
        rr.px(x, y0 + (1 if x != 11 else 0), 1)
    return L, r, None


# ── catálogo de la casa ────────────────────────────────────────────────────────

PIEZAS = {
    'televisor': dict(nombre='Televisor encendido', tipo='objeto', dibujar=televisor, cuadros=12, sobre=31,
                      huella=dict(ancho=30, fondo=12, alto=24), material='pantalla',
                      animaciones=dict(reposo=dict(de=0, hasta=7, fps=6, bucle=True),
                                       cerca=dict(de=8, hasta=11, fps=10, bucle=False, luego='reposo'),
                                       revisar=dict(de=8, hasta=11, fps=10, bucle=False, luego='reposo')),
                      emite=dict(forma='pozo', radio=[52, 34], tono='frio', momento='siempre',
                                 niveles=[3, 3, 2, 3, 2, 2, 3, 3, 3, 1, 3, 3]),
                      reemplaza='escenarios/casa/arte/objetos/televisor.png'),
    'portarretrato': dict(nombre='Portarretrato', tipo='objeto', dibujar=portarretrato, cuadros=6, sobre=31,
                          huella=dict(ancho=12, fondo=4, alto=14), material='vidrio',
                          animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                           cerca=dict(de=1, hasta=2, fps=8, bucle=False, sostener=True),
                                           revisar=dict(de=3, hasta=5, fps=8, bucle=False, sostener=True)),
                          reemplaza='escenarios/casa/arte/objetos/portarretrato.png'),
    'mueble-tv': dict(nombre='Mueble del televisor', tipo='mueble', dibujar=mueble_tv, cuadros=6,
                      huella=dict(ancho=100, fondo=14, alto=30), material='madera-barnizada',
                      animaciones=dict(reposo=dict(de=0, hasta=1, fps=1, bucle=True),
                                       revisar=dict(de=2, hasta=5, fps=10, bucle=False, sostener=True)),
                      reemplaza='escenarios/casa/arte/muebles/mueble-tv.png'),
    'sofa-casa': dict(nombre='Sofá de la sala', tipo='mueble', dibujar=sofa, cuadros=1,
                      huella=dict(ancho=90, fondo=16, alto=40), material='tela',
                      reemplaza='escenarios/casa/arte/muebles/sofa-casa.png'),
    'sillon-casa': dict(nombre='Sillón', tipo='mueble', dibujar=sillon, cuadros=1,
                        huella=dict(ancho=46, fondo=14, alto=36), material='tela',
                        reemplaza='escenarios/casa/arte/muebles/sillon-casa.png'),
    'mesa-centro-casa': dict(nombre='Mesa de centro', tipo='mueble', dibujar=mesa_centro, cuadros=1,
                             huella=dict(ancho=52, fondo=12, alto=20), material='madera-barnizada',
                             reemplaza='escenarios/casa/arte/muebles/mesa-centro-casa.png'),
}


import objetos_casa_b as cb  # noqa: E402

PIEZAS.update({
    'telefono-fijo': dict(nombre='Teléfono fijo', tipo='objeto', dibujar=cb.telefono, cuadros=3,
                          huella=dict(ancho=24, fondo=6, alto=12), material='plástico',
                          animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                           cerca=dict(de=1, hasta=2, fps=8, bucle=True)),
                          reemplaza='escenarios/casa/arte/objetos/telefono-fijo.png'),
    'peluche': dict(nombre='Peluche', tipo='objeto', dibujar=cb.peluche, cuadros=3,
                    huella=dict(ancho=18, fondo=6, alto=20), material='peluche',
                    animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                     cerca=dict(de=1, hasta=2, fps=4, bucle=False, luego='reposo')),
                    reemplaza='escenarios/casa/arte/objetos/peluche.png'),
    'cuaderno-escolar': dict(nombre='Cuaderno escolar', tipo='objeto', dibujar=cb.cuaderno, cuadros=3,
                             huella=dict(ancho=30, fondo=8, alto=6), material='papel',
                             animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                              revisar=dict(de=1, hasta=2, fps=8, bucle=False, sostener=True)),
                             reemplaza='escenarios/casa/arte/objetos/cuaderno-escolar.png'),
    'maleta': dict(nombre='Maleta', tipo='objeto', dibujar=cb.maleta, cuadros=3,
                   huella=dict(ancho=40, fondo=12, alto=20), material='tela',
                   animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                    revisar=dict(de=1, hasta=2, fps=8, bucle=False, sostener=True)),
                   reemplaza='escenarios/casa/arte/objetos/maleta.png'),
    'planta-maceta': dict(nombre='Planta en maceta', tipo='objeto', dibujar=cb.planta_maceta, cuadros=2,
                          huella=dict(ancho=18, fondo=8, alto=30), material='hojas y barro',
                          animaciones=dict(reposo=dict(de=0, hasta=1, fps=2, bucle=True)),
                          reemplaza='escenarios/casa/arte/objetos/planta-maceta.png'),
    'papelera': dict(nombre='Papelera de mimbre', tipo='objeto', dibujar=cb.papelera_casa, cuadros=1,
                     huella=dict(ancho=16, fondo=8, alto=20), material='mimbre',
                     reemplaza='escenarios/casa/arte/objetos/papelera.png'),
    'cerrojo-puerta': dict(nombre='Cerrojo de la puerta', tipo='objeto', dibujar=cb.cerrojo, cuadros=3,
                           huella=dict(ancho=18, fondo=4, alto=36), material='madera y latón',
                           animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                            revisar=dict(de=1, hasta=2, fps=6, bucle=False, luego='reposo')),
                           reemplaza='escenarios/casa/arte/objetos/cerrojo-puerta.png'),
    'nevera-notas': dict(nombre='Notas en la nevera', tipo='objeto', dibujar=cb.nevera_notas, cuadros=3,
                         huella=dict(ancho=26, fondo=4, alto=36), material='esmalte y papel',
                         animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                          revisar=dict(de=1, hasta=2, fps=8, bucle=False, sostener=True)),
                         reemplaza='escenarios/casa/arte/objetos/nevera-notas.png'),
    'ventana': dict(nombre='Ventana con lluvia', tipo='objeto', dibujar=cb.ventana_lluvia, cuadros=4,
                    huella=dict(ancho=30, fondo=4, alto=28), material='vidrio y madera',
                    animaciones=dict(reposo=dict(de=0, hasta=3, fps=4, bucle=True)),
                    reemplaza='escenarios/casa/arte/objetos/ventana.png'),
})

import objetos_casa_muebles as cm  # noqa: E402

PIEZAS.update({
    'mesa-comedor': dict(nombre='Mesa del comedor', tipo='mueble', dibujar=cm.mesa_comedor, cuadros=1,
                         huella=dict(ancho=108, fondo=16, alto=30), material='madera barnizada',
                         reemplaza='escenarios/casa/arte/muebles/mesa-comedor.png'),
    'silla-comedor': dict(nombre='Silla del comedor', tipo='mueble', dibujar=cm.silla_comedor, cuadros=1,
                          huella=dict(ancho=20, fondo=10, alto=34), material='madera y esterilla',
                          reemplaza='escenarios/casa/arte/muebles/silla-comedor.png'),
    'vitrina-comedor': dict(nombre='Vitrina del comedor', tipo='mueble', dibujar=cm.vitrina, cuadros=1,
                            huella=dict(ancho=58, fondo=14, alto=74), material='madera y vidrio',
                            reemplaza='escenarios/casa/arte/muebles/vitrina-comedor.png'),
    'nevera': dict(nombre='Nevera', tipo='mueble', dibujar=cm.nevera, cuadros=1,
                   huella=dict(ancho=42, fondo=16, alto=70), material='esmalte y cromo',
                   reemplaza='escenarios/casa/arte/muebles/nevera.png'),
    'estufa': dict(nombre='Estufa', tipo='mueble', dibujar=cm.estufa, cuadros=4,
                   huella=dict(ancho=52, fondo=16, alto=40), material='esmalte y acero',
                   animaciones=dict(reposo=dict(de=0, hasta=3, fps=4, bucle=True)),
                   reemplaza='escenarios/casa/arte/muebles/estufa.png'),
    'meson-cocina': dict(nombre='Mesón de la cocina', tipo='mueble', dibujar=cm.meson, cuadros=1,
                         huella=dict(ancho=118, fondo=16, alto=36), material='fórmica y madera',
                         reemplaza='escenarios/casa/arte/muebles/meson-cocina.png'),
    'lavaplatos': dict(nombre='Lavaplatos', tipo='mueble', dibujar=cm.lavaplatos, cuadros=4,
                       huella=dict(ancho=48, fondo=16, alto=34), material='acero y madera',
                       animaciones=dict(reposo=dict(de=0, hasta=3, fps=3, bucle=True)),
                       reemplaza='escenarios/casa/arte/muebles/lavaplatos.png'),
    'cama-doble': dict(nombre='Cama doble', tipo='mueble', dibujar=cm.cama_doble, cuadros=1,
                       huella=dict(ancho=108, fondo=56, alto=24), material='madera y tela',
                       reemplaza='escenarios/casa/arte/muebles/cama-doble.png'),
    'cama-sencilla': dict(nombre='Cama sencilla', tipo='mueble', dibujar=cm.cama_sencilla, cuadros=1,
                          huella=dict(ancho=58, fondo=46, alto=24), material='madera y tela',
                          reemplaza='escenarios/casa/arte/muebles/cama-sencilla.png'),
    'mesa-noche': dict(nombre='Mesa de noche', tipo='mueble', dibujar=cm.mesa_noche, cuadros=5,
                       huella=dict(ancho=28, fondo=12, alto=40), material='madera barnizada',
                       animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                        revisar=dict(de=1, hasta=4, fps=10, bucle=False, sostener=True)),
                       reemplaza='escenarios/casa/arte/muebles/mesa-noche.png'),
    'armario': dict(nombre='Armario', tipo='mueble', dibujar=cm.armario, cuadros=1,
                    huella=dict(ancho=68, fondo=16, alto=88), material='madera y espejo',
                    reemplaza='escenarios/casa/arte/muebles/armario.png'),
    'escritorio-infantil': dict(nombre='Escritorio infantil', tipo='mueble', dibujar=cm.escritorio_infantil, cuadros=1,
                                huella=dict(ancho=68, fondo=14, alto=36), material='madera',
                                reemplaza='escenarios/casa/arte/muebles/escritorio-infantil.png'),
    'caja-juguetes': dict(nombre='Caja de juguetes', tipo='mueble', dibujar=cm.caja_juguetes, cuadros=1,
                          huella=dict(ancho=38, fondo=12, alto=26), material='madera',
                          reemplaza='escenarios/casa/arte/muebles/caja-juguetes.png'),
})


if __name__ == '__main__':
    import objetos_hoja
    objetos_hoja.hoja_lugar('casa', PIEZAS)
