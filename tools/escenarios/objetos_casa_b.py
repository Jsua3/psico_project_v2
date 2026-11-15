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


op.material('maleta', (92, 104, 132), op.tex_grano(0.05, claras=0.0), luz=0.42, sombra=0.55)
op.material('barro', (176, 100, 74), op.tex_grano(0.05), luz=0.45)


def maleta(n=0):
    """Maleta abierta en el piso con ropa doblada de prisa. Al revisarla, una manga cae por el borde (el último queda)."""
    L = Lienzo(44, 30, semilla=137)
    L.poli([(4, 2), (40, 2), (38, 11), (6, 11)], 'maleta', 3)                       # tapa abierta, de pie atrás
    L.rect(8, 4, 36, 9, 'maleta', 4, tex=False)                                     # bolsillo de la tapa
    L.bloque(2, 11, 41, 27, 'maleta', tapa=2, base=2)                               # cuerpo
    L.rect(5, 13, 38, 19, 'maleta', 5, tex=False)                                   # adentro, en sombra
    prendas = [(6, 12, 17, 18, 'lino-rojo'), (16, 13, 27, 18, 'crochet'), (26, 12, 37, 18, 'tela-azul')]
    for x0, y0, x1, y1, tela in prendas:                                            # ropa doblada a la carrera
        L.rect(x0, y0, x1, y1, tela, 1)
        L.rect(x0, y0, x1, y0, tela, 0, tex=False)
        L.rect(x0, y1, x1, y1, tela, 3, tex=False)
    L.rect(9, 15, 15, 15, 'lino-rojo', 3, tex=False)                                # un pliegue torcido
    if n >= 1:                                                                      # una manga cae por el borde
        caida = 4 if n == 1 else 6
        L.rect(31, 18, 34, 18 + caida, 'tela-azul', 2)
        L.rect(31, 18 + caida, 34, 18 + caida, 'tela-azul', 3, tex=False)
    L.rect(19, 21, 24, 23, 'cromo', 2, tex=False)                                   # cierre
    L.rect(3, 26, 40, 27, 'maleta', 4, tex=False)
    r = _reflejos(L)
    r['izquierda'].px(19, 21, 2)
    r['derecha'].px(24, 21, 2)
    r['frente'].rect(20, 21, 23, 21, 1)
    return L, r, None


def planta_maceta(n=0):
    """Planta de la casa en maceta de barro, con su platico aún mojado. Las hojas de arriba se mecen (2 cuadros)."""
    L = Lienzo(26, 34, semilla=139)
    L.elipse(3, 29, 22, 33, 'ceramica', 3)                                          # platico
    L.rect(6, 30, 19, 31, (120, 160, 190), tex=False)                               # agua en el plato
    L.poli([(6, 20), (19, 20), (17, 31), (8, 31)], 'barro', 2)                      # maceta
    L.rect(5, 18, 20, 21, 'barro', 1)
    L.rect(5, 18, 20, 18, 'barro', 0, tex=False)
    L.rect(6, 22, 19, 22, 'barro', 4, tex=False)
    L.rect(6, 18, 19, 19, 'tierra', 3)                                              # tierra húmeda, oscura
    meneo = (0, 1)[n]
    hojas = [(12, 1, 6, 8, 0), (5, 5, 6, 6, 1), (19, 5, 6, 6, 1), (9, 9, 6, 6, 2), (16, 9, 6, 6, 2), (12, 11, 5, 5, 3)]
    for cx, cy, rx, ry, capa in hojas:
        dx = meneo if capa < 2 else 0
        L.elipse(cx - rx // 2 + dx, cy, cx + rx // 2 + dx, cy + ry, 'hoja', 1 + (capa // 2))
        L.rect(cx - 1 + dx, cy, cx + dx, cy, 'hoja', 0, tex=False)
    return L, _reflejos(L), None


def papelera_casa(n=0):
    """Papelera de mimbre vacía."""
    L = Lienzo(22, 24, semilla=141)
    L.poli([(3, 4), (18, 4), (16, 22), (5, 22)], 'roble', 2)
    for y in range(6, 22, 3):                                                       # tejido de mimbre
        L.rect(4 + (y - 6) // 8, y, 17 - (y - 6) // 8, y, 'roble', 3, tex=False)
    for x in range(6, 17, 3):
        L.rect(x, 7, x, 20, 'roble', 1, tex=False)
    L.rect(2, 3, 19, 5, 'roble', 1)
    L.rect(2, 3, 19, 3, 'roble', 0, tex=False)
    L.rect(4, 4, 17, 5, 'roble', 5, tex=False)                                      # boca vacía, en sombra
    L.rect(5, 21, 16, 22, 'roble', 4, tex=False)
    return L, _reflejos(L), None


op.material('blanco-nevera', (222, 222, 214), op.tex_grano(0.02), luz=0.35, sombra=0.5)


def cerrojo(n=0):
    """Canto de la puerta con un pasador y una cadena por dentro. Al revisarlo, la cadena se mece (2 cuadros)."""
    L = Lienzo(22, 40, semilla=143)
    L.rect(2, 1, 19, 38, 'nogal', 2)                                                # tramo de la hoja de la puerta
    L.rect(2, 1, 2, 38, 'nogal', 3, tex=False)
    L.rect(19, 1, 19, 38, 'nogal', 4, tex=False)
    L.rect(6, 6, 16, 34, 'nogal', 3)                                                # tablero en relieve
    L.rect(6, 6, 16, 6, 'nogal', 4, tex=False)
    L.rect(6, 34, 16, 34, 'nogal', 1, tex=False)
    L.rect(9, 10, 17, 14, 'laton', 2)                                               # pasador
    L.rect(9, 10, 17, 10, 'laton', 0, tex=False)
    L.rect(11, 11, 19, 12, 'laton', 1, tex=False)
    L.rect(12, 8, 13, 10, 'laton', 3, tex=False)                                    # perilla del pasador
    caida = (0, 1, -1)[n]
    L.rect(13, 18, 16, 20, 'laton', 2)                                              # placa de la cadena
    for k in range(5):                                                              # eslabones gruesos
        x = 14 + (k * caida) // 2
        L.rect(x, 21 + k * 2, x + 1, 22 + k * 2, 'cromo', 2 + (k % 2))
    L.rect(9, 26, 12, 29, 'laton', 1)                                               # chapa
    L.px(10, 28, 'laton', 5)
    r = _reflejos(L)
    r['izquierda'].rect(9, 11, 11, 11, 2)
    r['derecha'].rect(15, 11, 17, 11, 2)
    r['frente'].rect(12, 11, 14, 11, 2)
    for rr in r.values():
        rr.px(10, 27, 1)
    return L, r, None


def nevera_notas(n=0):
    """La puerta de la nevera con imanes: la lista de mercado y la tarjeta de una cita médica. Revisar: la tarjeta se levanta."""
    L = Lienzo(30, 40, semilla=145)
    L.rect(1, 1, 28, 38, 'blanco-nevera', 1)                                        # puerta
    L.rect(1, 1, 28, 1, 'blanco-nevera', 0, tex=False)
    L.rect(1, 38, 28, 38, 'blanco-nevera', 3, tex=False)
    L.rect(25, 8, 27, 26, 'cromo', 3)                                               # manija
    L.rect(4, 5, 15, 26, 'papel', 0)                                                # lista de mercado
    for y in range(9, 25, 3):
        L.rect(6, y, 13 - (y % 2) * 2, y + 1, (110, 120, 150), tex=False)
    L.rect(8, 3, 11, 6, ROJO, tex=False)                                            # imán rojo
    alza = (0, 2, 1)[n]
    L.rect(14, 27 - alza, 24, 34 - alza, (196, 222, 236), tex=False)                # tarjeta de la cita
    L.rect(14, 27 - alza, 24, 28 - alza, (70, 110, 160), tex=False)
    L.rect(16, 31 - alza, 21, 32 - alza, (110, 120, 150), tex=False)
    if alza:
        L.rect(14, 35 - alza, 24, 35, 'blanco-nevera', 3, tex=False)                # sombra bajo la tarjeta levantada
    L.rect(18, 25 - alza, 20, 27 - alza, (230, 192, 86), tex=False)                 # imán amarillo
    L.rect(19, 11, 22, 14, (96, 170, 104), tex=False)                               # un imán de fruta
    r = _reflejos(L)
    r['izquierda'].rect(25, 9, 25, 24, 2)
    r['derecha'].rect(27, 9, 27, 24, 2)
    r['frente'].rect(26, 9, 26, 14, 1)
    return L, r, None


def ventana_lluvia(n=0):
    """Ventana pequeña con la lluvia que cae despacio afuera (4 cuadros)."""
    L = Lienzo(34, 34, semilla=147)
    L.rect(1, 1, 32, 30, 'roble', 2)                                                # marco
    L.rect(1, 1, 32, 1, 'roble', 0, tex=False)
    L.rect(4, 4, 29, 26, (92, 112, 132), tex=False)                                 # cielo nublado
    L.rect(4, 4, 29, 9, (112, 130, 148), tex=False)
    L.rect(4, 20, 29, 26, (70, 86, 96), tex=False)                                  # tejados de enfrente
    L.rect(8, 17, 14, 20, (60, 74, 84), tex=False)
    L.rect(19, 15, 26, 20, (60, 74, 84), tex=False)
    for k in range(7):                                                              # gotas que bajan
        x = 6 + k * 4
        y = 5 + (k * 5 + n * 4) % 20
        L.rect(x, y, x, y + 2, (176, 196, 214), tex=False)
    L.rect(16, 4, 17, 26, 'roble', 2, tex=False)                                    # parteluz
    L.rect(4, 15, 29, 15, 'roble', 2, tex=False)
    L.rect(0, 27, 33, 30, 'roble', 1)                                               # alféizar
    L.rect(0, 27, 33, 27, 'roble', 0, tex=False)
    L.rect(0, 30, 33, 30, 'roble', 4, tex=False)
    vidrio = L.caja_mascara(4, 4, 29, 26)
    r = _reflejos(L)
    r['izquierda'].diagonal(5, 13, 6, 2, 2)
    r['derecha'].diagonal(28, 13, 6, 2, 2, sentido=-1)
    r['frente'].rect(6, 5, 14, 5, 1)
    for rr in r.values():
        rr.m[(rr.m > 0) & ~vidrio] = 0
    return L, r, None


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
