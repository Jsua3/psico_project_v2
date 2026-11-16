"""Hospital: los objetos de SIM-VBG-002 que hoy no tienen arte de biblioteca (bloque O1). Los muebles son de P1.

Cada uno se para en el piso de la sala (el caso los pone en x, y del piso) y reacciona al estudiante.

    python tools/escenarios/objetos_hospital.py     # hoja en maqueta-visual/objetos/
"""
import os
import sys

import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import objetos_comisaria  # noqa: E402,F401  (registra acero, laminado, manila y morado)
import objetos_pixel as op  # noqa: E402
from objetos_pixel import Lienzo, Reflejo  # noqa: E402

op.material('blanco-clinico', (214, 220, 222), op.tex_grano(0.02), luz=0.35, sombra=0.5)
op.material('agua', (120, 176, 214), luz=0.5, sombra=0.5)


def _reflejos(L):
    return {lado: Reflejo(L.w, L.h) for lado in op.LADOS}


HOJA = (0, 1, 2, 3)                   # 0 reposo · 1 la hoja de encima se levanta · 2 se pasa · 3 queda la de abajo


def hoja_ingreso(n=0):
    """Tabla con pinza en un atril de enfermería. Revisar: se pasa la hoja de encima (3 cuadros, el último queda)."""
    L = Lienzo(28, 42, semilla=91)
    L.rect(13, 22, 14, 37, 'acero', 2)                                             # tubo del atril
    L.rect(13, 22, 13, 37, 'acero', 1, tex=False)
    L.elipse(5, 36, 22, 40, 'acero', 3)                                            # base
    L.rect(6, 37, 21, 37, 'acero', 1, tex=False)
    L.poli([(3, 6), (24, 6), (25, 22), (2, 22)], 'laminado', 2)                    # tabla, inclinada hacia quien lee
    L.rect(2, 22, 25, 23, 'laminado', 4, tex=False)
    fase = HOJA[n]
    L.rect(5, 8, 22, 21, 'papel', 1)                                               # hoja de abajo
    for y in range(10, 21, 2):
        L.rect(7, y, 19 - (y % 4), y, (150, 156, 170), tex=False)
    if fase < 3:
        lev = (0, 3, 9)[fase]
        L.poli([(5, 8 - lev // 3), (22, 8 - lev // 3), (22, 21 - lev), (5, 21 - lev)], 'papel', 0)   # hoja de encima
        if lev < 9:
            L.rect(7, 10, 15, 10, (70, 90, 130), tex=False)                         # encabezado
            for y in range(12, 20 - lev, 2):
                L.rect(7, y, 20, y, (150, 156, 170), tex=False)
            L.rect(17, 16 - lev, 20, 19 - lev, (200, 90, 80), tex=False)            # sello de urgencias
        L.rect(5, 21 - lev, 22, 21 - lev, 'papel', 2, tex=False)
    L.rect(10, 4, 17, 8, 'cromo', 2)                                               # pinza
    L.rect(10, 4, 17, 4, 'cromo', 0, tex=False)
    L.rect(12, 6, 15, 6, 'cromo', 4, tex=False)
    r = _reflejos(L)
    r['izquierda'].px(10, 4, 2)
    r['izquierda'].rect(11, 5, 12, 5, 1)
    r['derecha'].px(17, 4, 2)
    r['derecha'].rect(15, 5, 16, 5, 1)
    r['frente'].rect(12, 4, 15, 4, 2)
    r['izquierda'].rect(13, 24, 13, 34, 1)
    r['derecha'].rect(14, 24, 14, 34, 1)
    return L, r, None


TIMBRE = (0, 1, 0, 2, 3, 3)          # 0 apagado · 1 el piloto titila (cerca) · 2 se oprime · 3 encendido (queda)


def timbre(n=0):
    """Pulsador de llamado colgado de su base junto a la cama. Revisar: se oprime y la luz de llamado queda encendida."""
    L = Lienzo(22, 44, semilla=93)
    L.rect(9, 6, 12, 39, 'blanco-clinico', 2)                                       # columna de la base
    L.rect(9, 6, 9, 39, 'blanco-clinico', 1, tex=False)
    L.rect(12, 6, 12, 39, 'blanco-clinico', 3, tex=False)
    L.elipse(3, 38, 18, 42, 'blanco-clinico', 3)
    L.rect(4, 39, 17, 39, 'blanco-clinico', 1, tex=False)
    L.bloque(5, 1, 16, 10, 'blanco-clinico', tapa=2, base=1)                        # caja con la luz de llamado
    fase = TIMBRE[n]
    luz = {0: (110, 60, 60), 1: (226, 96, 80), 2: (150, 70, 66), 3: (255, 120, 96)}[fase]
    L.rect(8, 4, 13, 7, luz, tex=False)
    if fase == 3:
        L.rect(9, 4, 12, 4, (255, 200, 170), tex=False)
    L.linea(12, 11, 16, 18, 'plastico-gris', 3)                                     # cordón
    L.linea(16, 18, 15, 24, 'plastico-gris', 3)
    dy = 1 if fase == 2 else 0
    L.elipse(12, 24 + dy, 18, 31 + dy, 'blanco-clinico', 1)                         # pera
    L.elipse(14, 25 + dy, 17, 28 + dy, (196, 72, 66) if fase != 2 else (150, 56, 52), tex=False)
    em = np.zeros((L.h, L.w), bool)
    if fase in (1, 3):
        em[4:8, 8:14] = True
    return L, _reflejos(L), em


def marco_normativo(n=0):
    """Pila de códigos y leyes en una mesita. Revisar: el libro de encima se abre (2 cuadros, el último queda)."""
    L = Lienzo(34, 34, semilla=95)
    L.bloque(3, 20, 30, 31, 'laminado', tapa=3, base=1)                            # mesita
    lomos = (((150, 64, 60), 4), ((60, 92, 140), 3), ((80, 120, 90), 3), ((176, 140, 70), 3))
    y = 20
    for k, (c, alto) in enumerate(lomos):                                           # libros acostados
        x0, x1 = 6 + (k % 2), 27 - (k % 3)
        L.rect(x0, y - alto, x1, y - 1, c, tex=False)
        L.rect(x0, y - alto, x1, y - alto, op.mezcla(c, (255, 255, 255), 0.25), tex=False)
        L.rect(x1 - 2, y - alto + 1, x1 - 1, y - 2, (230, 224, 206), tex=False)     # hojas
        L.rect(x0 + 3, y - alto + 1, x0 + 7, y - alto + 1, (226, 196, 120), tex=False)   # letras doradas
        y -= alto
    if n == 1:                                                                      # la tapa se levanta
        L.rect(7, y - 3, 16, y - 1, 'papel', 1, tex=False)
        L.rect(7, y - 3, 16, y - 3, 'papel', 0, tex=False)
        L.poli([(16, y - 1), (25, y - 1), (22, y - 7), (16, y - 6)], (150, 64, 60), tex=False)
        L.linea(16, y - 6, 16, y - 1, (96, 40, 40))
    elif n == 2:                                                                    # abierto y plano sobre la pila
        for x0, x1, e in ((6, 15, 0), (17, 26, 1)):
            L.rect(x0, y - 4, x1, y - 1, 'papel', e, tex=False)
            L.rect(x0, y - 1, x1, y - 1, 'papel', 2, tex=False)
            for k in (y - 3, y - 2):
                L.rect(x0 + 1, k, x1 - 2, k, (150, 156, 170), tex=False)
        L.rect(16, y - 4, 16, y - 1, (110, 104, 96), tex=False)                     # el lomo al centro
        L.px(6, y - 4, 'papel', 1)
        L.px(26, y - 4, 'papel', 2)
        L.rect(6, y, 26, y, (150, 64, 60), tex=False)                               # la tapa roja debajo
    r = _reflejos(L)
    r['izquierda'].rect(4, 21, 14, 21, 1)
    r['derecha'].rect(19, 21, 29, 21, 1)
    return L, r, None


AGUA = (0, 1, 2, 1, 3)               # 0 quieto · 1-3 el agua tiembla (cerca) · 4 un vaso servido (revisar, queda)


def agua_panuelos(n=0):
    """Bandeja con jarra de agua, dos vasos y una caja de pañuelos, sobre una mesita auxiliar."""
    L = Lienzo(44, 40, semilla=97)
    for x in (5, 36):                                                               # mesita
        L.rect(x, 22, x + 2, 37, 'laminado', 3)
        L.rect(x, 36, x + 2, 37, 'laminado', 4, tex=False)
    L.bloque(2, 17, 41, 24, 'laminado', tapa=4, base=1)
    L.rect(4, 15, 39, 18, 'acero', 1)                                               # bandeja
    L.rect(4, 18, 39, 18, 'acero', 3, tex=False)
    fase = AGUA[n]
    ola = {0: 0, 1: 1, 2: -1, 3: 0}[fase]
    ys = np.arange(L.h)[:, None]
    jarra = L.poli_mascara([(7, 4), (17, 4), (18, 16), (6, 16)])                    # jarra de vidrio
    L.mascara(jarra, 'vidrio', 1, tex=False)
    L.mascara(jarra & (ys >= 8), 'agua', 2, tex=False)
    L.rect(7, 8, 17, 8, 'agua', 0, tex=False)
    if ola:
        L.px(11 if ola > 0 else 14, 8, 'agua', 3)
        L.px(14 if ola > 0 else 10, 8, 'agua', 3)
    L.rect(17, 7, 20, 8, 'vidrio', 2, tex=False)                                    # asa
    L.rect(19, 8, 20, 12, 'vidrio', 2, tex=False)
    L.rect(6, 4, 18, 4, 'vidrio', 0, tex=False)
    vidrio = jarra.copy()
    vasos = ((22, 8), (28, 8)) if fase != 3 else ((22, 8), (27, 9))
    for k, (vx, vy) in enumerate(vasos):                                            # vasos
        m = L.caja_mascara(vx, vy, vx + 4, vy + 6)
        L.mascara(m, 'vidrio', 1, tex=False)
        if fase == 3 and k == 1:
            L.rect(vx + 1, vy + 2, vx + 3, vy + 5, 'agua', 2, tex=False)
            L.rect(vx + 1, vy + 2, vx + 3, vy + 2, 'agua', 0, tex=False)
        L.rect(vx, vy + 6, vx + 4, vy + 6, 'vidrio', 4, tex=False)
        vidrio |= m
    L.bloque(32, 9, 40, 16, 'carton', tapa=2, base=1)                               # pañuelos
    L.rect(32, 13, 40, 14, (96, 140, 180), tex=False)
    L.poli([(34, 9), (38, 9), (37, 5), (35, 4)], 'papel', 0)
    r = _reflejos(L)
    r['izquierda'].rect(7, 5, 7, 14, 2)
    r['izquierda'].rect(8, 5, 8, 9, 1)
    r['derecha'].rect(17, 5, 17, 14, 2)
    r['derecha'].rect(16, 5, 16, 9, 1)
    r['frente'].rect(10, 5, 13, 5, 2)
    for vx, vy in vasos:
        r['izquierda'].rect(vx, vy + 1, vx, vy + 5, 2)
        r['derecha'].rect(vx + 4, vy + 1, vx + 4, vy + 5, 2)
        r['frente'].rect(vx + 1, vy, vx + 3, vy, 1)
    bandeja = L.caja_mascara(4, 15, 39, 15)
    r['izquierda'].rect(5, 15, 18, 15, 1)
    r['derecha'].rect(26, 15, 38, 15, 1)
    for rr in r.values():
        rr.m[(rr.m > 0) & ~(vidrio | bandeja)] = 0
    return L, r, None


G = '../frontend/src/assets/game/objects/'
PIEZAS = {
    'hoja-ingreso': dict(nombre='Hoja de ingreso', tipo='objeto', dibujar=hoja_ingreso, cuadros=4,
                         huella=dict(ancho=16, fondo=6, alto=36), material='papel y cromo',
                         animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                          revisar=dict(de=1, hasta=3, fps=8, bucle=False, sostener=True)),
                         reemplaza=G + 'object_registro.png'),
    'timbre-llamado': dict(nombre='Timbre de llamado', tipo='objeto', dibujar=timbre, cuadros=6,
                           huella=dict(ancho=14, fondo=6, alto=40), material='plástico clínico',
                           animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                            cerca=dict(de=1, hasta=2, fps=3, bucle=True),
                                            revisar=dict(de=3, hasta=5, fps=8, bucle=False, sostener=True)),
                           emite=dict(forma='pozo', radio=[20, 10], tono='calido', momento='siempre', niveles=[0, 1, 0, 0, 2, 2])),
    'marco-normativo': dict(nombre='Marco normativo', tipo='objeto', dibujar=marco_normativo, cuadros=3,
                            huella=dict(ancho=28, fondo=8, alto=26), material='libros y madera',
                            animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                             revisar=dict(de=1, hasta=2, fps=8, bucle=False, sostener=True)),
                            reemplaza=G + 'object_marco_normativo.png'),
    'agua-panuelos': dict(nombre='Agua y pañuelos', tipo='objeto', dibujar=agua_panuelos, cuadros=5,
                          huella=dict(ancho=38, fondo=10, alto=30), material='vidrio y agua',
                          animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                           cerca=dict(de=1, hasta=3, fps=6, bucle=False, luego='reposo'),
                                           revisar=dict(de=4, hasta=4, fps=8, bucle=False, sostener=True))),
}


if __name__ == '__main__':
    import objetos_hoja
    objetos_hoja.hoja_lugar('hospital', PIEZAS)
