"""Hospital, tercera tanda (bloque O1): lo que SIM-VBG-002 todavía dibujaba con un marcador.

Puerta de la sala de escucha cerrada (caballete con candado y la hoja pegada), cartelera del pasillo y sillas de la
sala de escucha. Volumen por sombra y bloques gruesos, a la densidad de los personajes: nada de renglones de 1 px.
Se suman a `objetos_hospital.PIEZAS` desde ese módulo.
"""
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import objetos_pixel as op  # noqa: E402
from objetos_pixel import Lienzo, Reflejo  # noqa: E402

op.material('aviso-amarillo', (226, 186, 72), op.tex_grano(0.03), luz=0.4, sombra=0.55)
op.material('tela-calida', (176, 112, 82), op.tex_grano(0.05, claras=0.0), luz=0.42, sombra=0.55)
ROJO, AMARILLO, AZUL, VERDE_H = (204, 84, 72), (230, 192, 86), (70, 110, 160), (82, 150, 120)
TINTA, GRIS, CLARO = (90, 84, 100), (120, 124, 140), (248, 240, 214)


def _reflejos(L):
    return {lado: Reflejo(L.w, L.h) for lado in op.LADOS}


def puerta_cerrada(n=0):
    """Caballete de aviso ante la sala de escucha cerrada: candado y una hoja pegada con cinta (pedir la llave).
    Al acercarse el candado se mece (2 cuadros)."""
    L = Lienzo(30, 40, semilla=129)
    L.poli([(6, 4), (23, 4), (27, 37), (2, 37)], 'aviso-amarillo', 2)               # caballete
    L.rect(6, 4, 23, 5, 'aviso-amarillo', 0, tex=False)
    L.rect(2, 36, 27, 37, 'aviso-amarillo', 4, tex=False)
    L.rect(4, 31, 25, 34, 'aviso-amarillo', 3, tex=False)                           # franja baja en sombra
    L.rect(7, 9, 22, 22, 'papel', 0)                                                # la hoja pegada
    L.rect(7, 22, 22, 22, 'papel', 2, tex=False)
    L.rect(6, 8, 9, 9, 'papel', 3, tex=False)                                       # cinta
    L.rect(20, 8, 23, 9, 'papel', 3, tex=False)
    L.rect(9, 12, 19, 13, TINTA, tex=False)                                         # dos renglones gruesos
    L.rect(9, 16, 16, 17, TINTA, tex=False)
    meneo = (0, 1, -1)[n]
    L.rect(13 + meneo, 24, 16 + meneo, 25, 'laton', 3, tex=False)                   # arco del candado
    L.rect(12 + meneo, 26, 17 + meneo, 30, 'laton', 1)                              # cuerpo del candado
    L.rect(12 + meneo, 30, 17 + meneo, 30, 'laton', 4, tex=False)
    L.px(14 + meneo, 28, 'laton', 5)
    r = _reflejos(L)
    r['izquierda'].px(12 + meneo, 26, 2)
    r['derecha'].px(17 + meneo, 26, 2)
    r['frente'].rect(13 + meneo, 26, 16 + meneo, 26, 1)
    return L, r, None


def cartelera_pasillo(n=0):
    """Tablero blanco del pasillo en su pie: horario de visitas, capilla, cafetería y la extensión de trabajo social."""
    L = Lienzo(70, 68, semilla=131)
    for x in (9, 58):                                                               # patas
        L.rect(x, 46, x + 2, 64, 'cromo', 2)
        L.rect(x - 5, 64, x + 7, 65, 'cromo', 4)
    L.rect(2, 2, 67, 47, 'cromo', 2)                                                # marco
    L.rect(2, 2, 67, 2, 'cromo', 0, tex=False)
    L.rect(4, 4, 65, 45, 'blanco-clinico', 1)
    L.rect(4, 4, 65, 9, VERDE_H, tex=False)                                         # franja verde del hospital
    L.rect(7, 5, 9, 8, CLARO, tex=False)                                            # la cruz
    L.rect(6, 6, 10, 7, CLARO, tex=False)
    L.rect(7, 12, 33, 30, 'papel', 0)                                               # horario de visitas: cuadrícula gruesa
    for x in range(10, 33, 6):
        L.rect(x, 15, x + 3, 17, VERDE_H if x < 24 else GRIS, tex=False)
        L.rect(x, 21, x + 3, 23, GRIS, tex=False)
        L.rect(x, 26, x + 3, 28, VERDE_H if x > 15 else GRIS, tex=False)
    for x, y, c in ((38, 12, AMARILLO), (38, 22, (150, 104, 76)), (38, 32, AZUL)):  # capilla, cafetería, teléfono
        L.rect(x, y, x + 24, y + 8, 'papel', 1)
        L.rect(x + 2, y + 2, x + 6, y + 6, c, tex=False)
        L.rect(x + 9, y + 3, x + 20, y + 4, GRIS, tex=False)
    L.rect(40, 13, 40, 17, CLARO, tex=False)                                        # cruz de la capilla
    L.rect(39, 14, 41, 14, CLARO, tex=False)
    L.rect(7, 33, 33, 42, 'papel', 1)                                               # aviso de la extensión
    L.rect(9, 36, 22, 37, GRIS, tex=False)
    L.rect(25, 35, 31, 39, ROJO, tex=False)
    r = _reflejos(L)
    r['izquierda'].rect(3, 3, 24, 3, 2)
    r['derecha'].rect(45, 3, 66, 3, 2)
    r['frente'].rect(25, 3, 44, 3, 1)
    for rr, dx in ((r['izquierda'], 0), (r['derecha'], 2), (r['frente'], 1)):
        rr.rect(9 + dx, 48, 9 + dx, 62, 1)
        rr.rect(58 + dx, 48, 58 + dx, 62, 1)
    return L, r, None


def _silla_calida(L, x0, y0):
    L.cojin(x0 + 1, y0, x0 + 15, y0 + 12, 'tela-calida', r=3, arriba=0.25, abajo=0.2)
    L.rect(x0, y0 + 13, x0 + 16, y0 + 16, 'tela-calida', 1)
    L.rect(x0, y0 + 13, x0 + 16, y0 + 13, 'tela-calida', 0, tex=False)
    L.rect(x0, y0 + 17, x0 + 16, y0 + 18, 'tela-calida', 3, tex=False)
    for x in (x0 + 1, x0 + 14):
        L.rect(x, y0 + 19, x + 1, y0 + 24, 'roble', 3)


def sillas_escucha(n=0):
    """Tres sillas tapizadas en media luna, como para una familia: ninguna queda de espaldas."""
    L = Lienzo(62, 36, semilla=133)
    _silla_calida(L, 23, 0)                                                         # la del fondo
    _silla_calida(L, 3, 9)                                                          # las de los lados, más cerca
    _silla_calida(L, 42, 9)
    return L, _reflejos(L), None
