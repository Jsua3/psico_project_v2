"""Casa (P4), primera mitad: fachada, sala, comedor, cocina y escalera.

Paletas (SALAS) y dibujo propio (PROPIOS) de cada sala; lo compartido (piso, pared, ventana, puertas,
paredes laterales) lo pinta arte_comun.fondo_sala. Cada función propia recibe (d, sala, p) y dibuja
sobre la pared del fondo, después de la lista `deco` de la paleta y antes de las paredes laterales y
las puertas. Paleta cálida y apagada de biblioteca/escenarios/ESTILO.md, sección 7.

Nada de violencia: ni personas, ni objetos rotos, manchas, armas o cuchillos, botellas ni texto.
Todo lo dibujado aquí va en rectángulos de coordenadas pares y 2 px o más de ancho, para que el
factor 2 de pixelar_sala no se coma ni un detalle.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from arte_comun import SEAM, osc  # noqa: E402

# Maderas y metales que se repiten en varias salas (pocos colores por sala).
PAPEL = (214, 204, 180)
VERDE = (110, 128, 100)
OCRE = (186, 150, 108)
MADERA_CLARA = (172, 128, 92)
MADERA = (124, 86, 60)
MADERA_OSC = (88, 60, 42)
HIERRO = (54, 48, 46)
METAL = (150, 156, 152)
METAL_OSC = (98, 104, 102)
CORTINA = (178, 156, 116)
PUERTA_CASA = dict(puerta=(132, 92, 64), marco=(62, 48, 40))


def R(d, x0, y0, x1, y1, c):
    """Rectángulo con el extremo (x1, y1) EXCLUIDO, para razonar en medidas y no en índices."""
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=c)


def cortinas(d, cx, y0, ancho, alto, color):
    """Barra y dos paños a los lados de una ventana (deco 'ventana' de cx, y0, ancho, alto)."""
    mitad = ancho // 2
    R(d, cx - mitad - 22, y0 - 8, cx + mitad + 22, y0 - 4, MADERA_OSC)
    for x0 in (cx - mitad - 22, cx + mitad + 6):
        R(d, x0, y0 - 4, x0 + 16, y0 + alto + 16, color)
        for fx in range(x0 + 4, x0 + 16, 6):
            R(d, fx, y0 - 4, fx + 2, y0 + alto + 16, osc(color, 0.84))


def repisa(d, x0, x1, y):
    """Tabla de repisa con dos ménsulas; `y` es la cara de arriba, donde se apoyan las cosas."""
    R(d, x0, y, x1, y + 6, MADERA_CLARA)
    R(d, x0, y + 6, x1, y + 8, MADERA_OSC)
    for bx in (x0 + 8, x1 - 16):
        R(d, bx, y + 8, bx + 8, y + 14, MADERA_OSC)


def marco_pared(d, x0, y0, ancho, alto, fondo, forma, acento):
    """Cuadro pequeño y abstracto (colinas y un sol): nunca un rostro ni una figura humana."""
    R(d, x0, y0, x0 + ancho, y0 + alto, MADERA)
    R(d, x0 + 4, y0 + 4, x0 + ancho - 4, y0 + alto - 4, fondo)
    base = y0 + alto - 4
    d.polygon([(x0 + 4, base), (x0 + ancho // 2, y0 + alto // 2 + 2), (x0 + ancho - 4, base)], fill=forma)
    R(d, x0 + ancho - 14, y0 + 8, x0 + ancho - 8, y0 + 14, acento)


# ── fachada ────────────────────────────────────────────────────────────────────

TEJA = (148, 88, 68)
TEJA_OSC = (118, 68, 54)
LADRILLOS = ((128, 84, 66), (114, 74, 60))


def _fachada(d, sala, p):
    pared = p['pared']
    # alero de tejas arriba, con su sombra sobre el revoque
    R(d, 0, 36, 960, 56, TEJA)
    for x in range(0, 960, 24):
        R(d, x, 36, x + 2, 56, TEJA_OSC)
    R(d, 0, 56, 960, 60, TEJA_OSC)
    R(d, 0, 60, 960, 68, osc(pared, 0.86))
    # zócalo de ladrillo (sobre el color de mortero de `baja`)
    for k in range(5):
        y = 172 + 10 * k
        for x in range(-20 + 20 * (k % 2), 960, 40):
            R(d, x, y, x + 36, y + 8, LADRILLOS[(k + x // 40) % 2])
    # rejas de barrotes sobre las dos ventanas
    for cx in (230, 730):
        for dx in (-48, -32, -16, 0, 16, 32, 44):
            R(d, cx + dx, 92, cx + dx + 4, 148, HIERRO)
        R(d, cx - 48, 92, cx + 48, 96, HIERRO)
        R(d, cx - 48, 118, cx + 48, 122, HIERRO)
        R(d, cx - 48, 144, cx + 48, 148, HIERRO)
    # marquesina sobre la puerta y timbre sin número a su lado
    R(d, 436, 120, 524, 128, TEJA)
    R(d, 436, 128, 524, 134, TEJA_OSC)
    R(d, 428, 164, 442, 186, (176, 170, 156))
    R(d, 432, 168, 438, 174, HIERRO)
    R(d, 432, 180, 438, 182, METAL_OSC)
    # bajantes de agua
    for x in (60, 898):
        R(d, x, 68, x + 8, 224, (138, 134, 124))
        for y in (100, 150, 196):
            R(d, x - 2, y, x + 10, y + 4, METAL_OSC)


# ── sala ───────────────────────────────────────────────────────────────────────

LIBROS = ((120, 86, 70), (78, 98, 120), (166, 148, 108), (96, 120, 92))


def _sala(d, sala, p):
    cortinas(d, 400, 100, 96, 60, CORTINA)
    # repisa con libros, un portarretrato de paisaje y una pila de libros acostados
    y = 148
    repisa(d, 560, 700, y)
    x = 568
    for k, (ancho, alto) in enumerate(((6, 22), (6, 18), (4, 24), (6, 20), (6, 16), (4, 22))):
        R(d, x, y - alto, x + ancho, y, LIBROS[k % 4])
        x += ancho
    R(d, 612, y - 34, 640, y, MADERA)
    R(d, 616, y - 30, 636, y - 4, PAPEL)
    d.polygon([(616, y - 4), (626, y - 18), (636, y - 4)], fill=VERDE)
    R(d, 628, y - 26, 634, y - 20, OCRE)
    for k, (x0, x1, c) in enumerate(((652, 692, LIBROS[1]), (656, 688, LIBROS[2]), (654, 684, LIBROS[0]))):
        R(d, x0, y - 6 * (k + 1), x1, y - 6 * k, c)


# ── comedor ────────────────────────────────────────────────────────────────────

def _comedor(d, sala, p):
    cortinas(d, 780, 98, 88, 60, CORTINA)
    # espejo ovalado de marco de madera sobre la pared, a la izquierda de la mesa
    x, y0, w, h = 420, 96, 56, 84
    d.ellipse([x - w // 2 - 6, y0 - 6, x + w // 2 + 6, y0 + h + 6], fill=MADERA)
    d.ellipse([x - w // 2 - 2, y0 - 2, x + w // 2 + 2, y0 + h + 2], fill=MADERA_CLARA)
    d.ellipse([x - w // 2, y0, x + w // 2, y0 + h], fill=(148, 172, 176))
    d.polygon([(x - 18, y0 + h - 24), (x - 12, y0 + h - 30), (x + 4, y0 + 16), (x - 2, y0 + 12)], fill=(196, 214, 214))


# ── cocina ─────────────────────────────────────────────────────────────────────

def _cocina(d, sala, p):
    # alacena de madera a la izquierda
    R(d, 200, 98, 316, 154, MADERA_OSC)
    for x0 in (204, 260):
        R(d, x0, 102, x0 + 52, 150, (138, 108, 78))
        R(d, x0 + 4, 106, x0 + 48, 146, MADERA)
    R(d, 250, 122, 254, 134, PAPEL)
    R(d, 262, 122, 266, 134, PAPEL)
    R(d, 200, 154, 316, 160, osc(p['pared'], 0.8))
    # repisa con dos ollas y tres frascos
    y = 140
    repisa(d, 336, 464, y)
    R(d, 348, y - 24, 376, y, (92, 116, 132))
    R(d, 346, y - 28, 378, y - 24, (70, 88, 100))
    R(d, 358, y - 32, 366, y - 28, HIERRO)
    R(d, 342, y - 18, 348, y - 12, (70, 88, 100))
    R(d, 376, y - 18, 382, y - 12, (70, 88, 100))
    R(d, 386, y - 16, 406, y, (156, 152, 142))
    R(d, 384, y - 20, 408, y - 16, METAL_OSC)
    R(d, 392, y - 24, 398, y - 20, HIERRO)
    for k, fx in enumerate((418, 432, 446)):
        R(d, fx, y - 18, fx + 10, y, (180, 198, 190))
        R(d, fx, y - 22, fx + 10, y - 18, MADERA)
        R(d, fx + 2, y - 10, fx + 8, y - 2, ((200, 184, 140), (156, 174, 126), (200, 184, 140))[k])
    # campana de metal sobre la estufa (x = 520) con su ducto hasta el techo
    R(d, 508, 90, 532, 120, (138, 144, 140))
    d.polygon([(500, 120), (540, 120), (560, 152), (480, 152)], fill=(176, 182, 178))
    R(d, 480, 152, 560, 158, METAL_OSC)
    # trapo de cocina colgado de un riel entre la estufa y el lavaplatos
    R(d, 566, 164, 600, 168, METAL_OSC)
    R(d, 574, 168, 592, 208, (176, 98, 80))
    for yy in (176, 188):
        R(d, 574, yy, 592, yy + 4, PAPEL)


# ── escalera ───────────────────────────────────────────────────────────────────

CUERPO_ESC = (104, 72, 50)
TABLA_ESC = (84, 58, 42)
PELDANO = (180, 136, 96)
BARANDA = (78, 52, 38)


def _escalera(d, sala, p):
    x0, n, dx, dy = 420, 12, 32, 8
    cima = SEAM - n * dy                     # y de la última huella (134)
    x_cima = x0 + n * dx                     # x donde termina el tramo (804)

    def y_huella(i):
        return SEAM - dy * (i + 1)

    # cuerpo del tramo en dientes de sierra, con su tablado vertical (el hueco de abajo, cerrado)
    pts = [(x0, SEAM)]
    for i in range(n):
        pts += [(x0 + dx * i, y_huella(i)), (x0 + dx * (i + 1), y_huella(i))]
    pts += [(x_cima, SEAM)]
    d.polygon(pts, fill=CUERPO_ESC)
    for x in range(x0 + 4, x_cima - 2, 16):
        i = min((x - x0) // dx, n - 1)
        if y_huella(i) + 8 < SEAM - 4:
            R(d, x, y_huella(i) + 8, x + 2, SEAM - 4, TABLA_ESC)
    # huellas con su nariz, y la sombra de cada contrahuella
    for i in range(n):
        xi, yi = x0 + dx * i, y_huella(i)
        R(d, xi - 2, yi, xi + dx + 2, yi + 4, PELDANO)
        R(d, xi, yi + 4, xi + dx, yi + 6, TABLA_ESC)
    # descanso arriba: losa de madera que sigue hasta el borde derecho, con su baranda
    R(d, x_cima, cima, 960, cima + 4, PELDANO)
    R(d, x_cima, cima + 4, 960, cima + 14, TABLA_ESC)
    R(d, x_cima, 100, 960, 104, BARANDA)
    for x in range(x_cima + 12, 960, 24):
        R(d, x, 104, x + 2, cima, BARANDA)
    R(d, 892, cima + 14, 904, SEAM - 6, MADERA)
    R(d, 888, SEAM - 10, 908, SEAM - 6, MADERA_OSC)
    # pasamanos en diagonal con sus barrotes y los dos postes
    pasa = [(x0 + 4, 196), (x_cima, 100), (x_cima, 106), (x0 + 4, 202)]
    d.polygon(pasa, fill=BARANDA)
    for i in range(n):
        bx = x0 + dx * i + 8
        borde_sup = 196 - (bx - x0 - 4) * 96 // (x_cima - x0 - 4) + 6
        R(d, bx, borde_sup, bx + 2, y_huella(i), BARANDA)
    R(d, x0 - 4, 176, x0 + 6, SEAM, MADERA)
    R(d, x0 - 6, 172, x0 + 8, 176, MADERA_OSC)
    R(d, x_cima - 4, 92, x_cima + 6, cima, MADERA)
    R(d, x_cima - 6, 88, x_cima + 8, 92, MADERA_OSC)
    # tres cuadros abstractos que suben junto al pasamanos
    for k, cx in enumerate((482, 546, 610)):
        y_pasa = 196 - (cx - x0 - 4) * 96 // (x_cima - x0 - 4)
        marco_pared(d, cx, y_pasa - 44, 24, 30, PAPEL if k != 1 else (170, 190, 188),
                    VERDE, OCRE)


# ── paletas ────────────────────────────────────────────────────────────────────

SALAS = {
    'fachada': dict(
        top=36, cielo=(150, 170, 184), cielo_claro=(178, 194, 202), pared=(154, 136, 110), canto=(176, 160, 134),
        baja=(60, (96, 70, 58)), moldura=(176, 160, 134), zocalo=(78, 60, 50),
        piso='adoquin', pisoA=(124, 118, 108), pisoB=(112, 106, 98), pisoC=(132, 126, 116), junta=(88, 84, 78),
        marco_ventana=(196, 184, 160), vidrio=(70, 90, 104), vidrio_claro=(104, 128, 142), **PUERTA_CASA,
        deco=[('ventana', 230, 92, 96, 56), ('ventana', 730, 92, 96, 56)],
        luces=[]),
    'sala': dict(
        pared=(130, 110, 82), lado=(110, 92, 68), canto=(172, 150, 118), baja=(40, (124, 92, 66)),
        moldura=(150, 116, 84), zocalo=(70, 50, 38),
        piso='madera', pisoA=(160, 118, 82), pisoB=(148, 106, 72), pisoC=(138, 98, 66), junta=(104, 70, 48),
        marco_ventana=(196, 184, 160), vidrio=(112, 140, 156), vidrio_claro=(160, 184, 192), **PUERTA_CASA,
        deco=[('ventana', 400, 100, 96, 60),
              ('cuadro', 296, 112, 40, 30, (PAPEL, VERDE, OCRE)),
              ],
        luces=[(470, 360)], luz=(255, 226, 180)),
    'comedor': dict(
        pared=(126, 108, 82), lado=(106, 90, 68), canto=(168, 148, 116), baja=(46, (122, 88, 62)), paneles=(112, 80, 56),
        moldura=(150, 116, 84), zocalo=(74, 54, 40),
        piso='baldosa', pisoA=(162, 112, 80), pisoB=(150, 102, 72), junta=(112, 76, 54),
        marco_ventana=(196, 184, 160), vidrio=(112, 140, 156), vidrio_claro=(160, 184, 192), **PUERTA_CASA,
        deco=[('ventana', 780, 98, 88, 60),
              ('cuadro', 640, 110, 70, 44, (PAPEL, VERDE, OCRE)),
              ('colgante', 480, 150, (112, 84, 62))],
        luces=[(480, 380)], luz=(255, 226, 180)),
    'cocina': dict(
        pared=(112, 128, 112), lado=(92, 108, 94), canto=(150, 164, 148),
        baja=(70, (172, 184, 172)), azulejo=(146, 160, 148), moldura=(92, 110, 96), zocalo=(66, 76, 66),
        piso='baldosa', pisoA=(146, 140, 126), pisoB=(134, 128, 114), junta=(106, 100, 88),
        marco_ventana=(206, 202, 188), vidrio=(112, 140, 156), vidrio_claro=(160, 184, 192), **PUERTA_CASA,
        deco=[('ventana', 640, 92, 88, 52)],
        luces=[]),
    'escalera': dict(
        pared=(130, 110, 84), lado=(110, 92, 68), canto=(168, 146, 114), moldura=(150, 116, 84), zocalo=(70, 50, 36),
        piso='madera', pisoA=(156, 114, 76), pisoB=(146, 104, 68), pisoC=(136, 96, 62), junta=(100, 68, 46),
        marco_ventana=(196, 184, 160), vidrio=(112, 140, 156), vidrio_claro=(160, 184, 192), **PUERTA_CASA,
        deco=[('ventana', 180, 100, 70, 56)],
        luces=[]),
}

PROPIOS = {
    'fachada': _fachada,
    'sala': _sala,
    'comedor': _comedor,
    'cocina': _cocina,
    'escalera': _escalera,
}
