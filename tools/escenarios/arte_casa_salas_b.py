"""Arte de la casa, segunda parte: pasillo, habitacion-principal, habitacion-ninos y patio.

Aquí quedan las paletas de esas cuatro salas (SALAS, las que consume arte_comun.fondo_sala) y lo
propio de cada una dibujado sobre la pared del fondo (PROPIOS: funcion(d, sala, p)).

Reglas de biblioteca/escenarios/ESTILO.md, sección «Casa»: paleta cálida y apagada de valor
medio-oscuro (la pared más oscura que el piso), un solo acento por sala, nada de texto legible ni
de personas con rostro, y nada de violencia (sin objetos rotos, manchas, armas ni botellas). Los
muebles grandes (armario, cama, escritorio, caja de juguetes, tendedero, materas) van aparte y
se dibujan en arte_casa_muebles.py: aquí no se pinta nada donde ellos se apoyan.

Los fondos se reducen a la mitad con vecino más cercano (pixelar_sala, factor 2), que toma el
píxel impar de cada bloque de 2x2: por eso todo rectángulo se ajusta a la rejilla par (r()).
Las piezas de las cuatro salas comparten una paleta corta de colores para no pasar de 32.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from arte_comun import osc  # noqa: E402


# ── primitivas ajustadas a la rejilla de 2x2 ──────────────────────────────────

def r(d, x0, y0, x1, y1, c):
    """Rectángulo (extremos incluidos) ampliado a bloques completos de 2x2."""
    d.rectangle([int(x0) & ~1, int(y0) & ~1, int(x1) | 1, int(y1) | 1], fill=c)


# ── colores compartidos de las cuatro salas ───────────────────────────────────

MARCO = (84, 60, 44)          # marcos de fotos y cuadros
PASPARTU = (214, 206, 188)
SILUETA = (78, 66, 72)
MADERA_M = (112, 80, 56)
MADERA_C = (140, 100, 70)
TELA = (190, 174, 150)
TELA_S = (160, 144, 122)
CREMA = (222, 214, 194)
CORAL = (190, 110, 96)
AMARILLO = (222, 194, 112)
VERDE = (96, 150, 92)
VERDE_O = (62, 110, 64)
VERDE_C = (118, 168, 102)
TERRACOTA = (176, 96, 72)
TERRACOTA_S = (140, 74, 56)
METAL = (150, 156, 160)
METAL_S = (112, 118, 124)
CIELO_V = (118, 146, 164)     # vidrio de las ventanas
CIELO_VC = (164, 190, 204)
MARCO_V = (196, 186, 166)


def ventana_b(d, x, y0, w, h):
    """Ventana de dos tonos de vidrio, un reflejo y un cruce de madera (sin degradado)."""
    r(d, x - w // 2 - 4, y0 - 4, x + w // 2 + 3, y0 + h + 3, MARCO_V)
    r(d, x - w // 2, y0, x + w // 2 - 1, y0 + h - 1, CIELO_V)
    r(d, x - w // 2, y0, x + w // 2 - 1, y0 + h // 2 - 1, CIELO_VC)
    d.polygon([(x - w // 2 + 8, y0 + h - 2), (x - w // 2 + 8 + h // 2, y0), (x - w // 2 + 20 + h // 2, y0),
               (x - w // 2 + 20, y0 + h - 2)], fill=CIELO_VC)
    r(d, x - 2, y0, x + 1, y0 + h, MARCO_V)
    r(d, x - w // 2, y0 + h // 2 - 2, x + w // 2 - 1, y0 + h // 2 + 1, MARCO_V)
    r(d, x - w // 2 - 8, y0 + h + 4, x + w // 2 + 7, y0 + h + 9, TELA_S)                 # alféizar


def silueta(d, cx, base, alto):
    """Silueta sin rostro: cabeza redonda y hombros. `base` es el borde inferior."""
    rc = max(3, alto // 6)
    ancho = rc * 2 + 1
    ytop = base - alto + 2 * rc + 2
    d.polygon([(cx - ancho, base), (cx - ancho, ytop + 6), (cx - ancho + 4, ytop + 1), (cx - rc + 1, ytop),
               (cx + rc - 1, ytop), (cx + ancho - 4, ytop + 1), (cx + ancho, ytop + 6), (cx + ancho, base)], fill=SILUETA)
    d.ellipse([cx - rc, base - alto, cx + rc, base - alto + 2 * rc], fill=SILUETA)


def foto(d, x, y0, w, h, fondo, personas):
    """Retrato enmarcado: marco, paspartú y un fondo liso con siluetas. `personas` = [(dx, alto)]."""
    r(d, x - w // 2 - 4, y0 - 4, x + w // 2 + 3, y0 + h + 3, MARCO)
    r(d, x - w // 2, y0, x + w // 2 - 1, y0 + h - 1, PASPARTU)
    ix0, iy0, ix1, iy1 = x - w // 2 + 4, y0 + 4, x + w // 2 - 5, y0 + h - 5
    r(d, ix0, iy0, ix1, iy1, fondo)
    for dx, alto in personas:
        silueta(d, x + dx, iy1 + 1, min(alto, iy1 - iy0 - 2))


def cuadro_b(d, x, y0, w, h, fondo, redondo, rect):
    """Cuadro abstracto (un círculo y un bloque de color) con el marco compartido."""
    r(d, x - w // 2 - 4, y0 - 4, x + w // 2 + 3, y0 + h + 3, MARCO)
    r(d, x - w // 2, y0, x + w // 2 - 1, y0 + h - 1, fondo)
    d.ellipse([x - w // 2 + 6, y0 + 6, x + 4, y0 + h - 8], fill=redondo)
    r(d, x - 2, y0 + h // 3, x + w // 2 - 7, y0 + h - 7, rect)


def reloj_b(d, x, y):
    d.ellipse([x - 13, y - 13, x + 12, y + 12], fill=MARCO)
    d.ellipse([x - 10, y - 10, x + 9, y + 9], fill=PASPARTU)
    r(d, x - 1, y - 8, x, y, SILUETA)
    r(d, x, y - 1, x + 6, y, SILUETA)


def cortina(d, x0, x1, y0, y1):
    """Hoja de cortina con pliegues y un amarre a media altura."""
    r(d, x0, y0, x1, y1, TELA)
    for x in range(x0 + 6, x1 - 2, 10):
        r(d, x, y0 + 2, x + 1, y1 - 2, TELA_S)
    r(d, x0, y1 - 4, x1, y1, TELA_S)
    ya = y0 + (y1 - y0) * 6 // 10
    r(d, x0, ya, x1, ya + 3, MADERA_M)


def lampara(d, x, y, top):
    """Lámpara colgante de pantalla de tela."""
    r(d, x - 1, top, x, y - 12, MARCO)
    d.polygon([(x - 18, y), (x - 9, y - 12), (x + 9, y - 12), (x + 18, y)], fill=TELA)
    r(d, x - 18, y, x + 17, y + 3, TELA_S)
    d.ellipse([x - 5, y, x + 5, y + 7], fill=CREMA)


def maceta_colgante(d, x, y, largo):
    """Maceta colgada de la pared con enredadera que cae por los lados. `y` es la boca de la maceta."""
    d.line([(x - 12, y - 24), (x - 10, y)], fill=METAL_S, width=2)
    d.line([(x + 12, y - 24), (x + 10, y)], fill=METAL_S, width=2)
    r(d, x - 2, y - 28, x + 2, y - 24, METAL_S)                                          # clavo
    d.polygon([(x - 14, y), (x + 14, y), (x + 10, y + 20), (x - 10, y + 20)], fill=TERRACOTA)
    r(d, x - 15, y - 2, x + 14, y + 3, TERRACOTA_S)
    for dx, dy, rx, ry, c in ((0, -8, 20, 11, VERDE_O), (-10, -10, 11, 8, VERDE), (11, -9, 11, 8, VERDE),
                              (0, -14, 9, 6, VERDE_C), (-12, -4, 5, 4, VERDE_C)):
        d.ellipse([x + dx - rx, y + dy - ry, x + dx + rx, y + dy + ry], fill=c)
    # Enredaderas: un tallo fino con hojas alternas que cuelga de la boca de la maceta.
    for dx, dl in ((-19, largo), (-26, largo * 2 // 3), (20, largo * 3 // 4), (27, largo)):
        r(d, x + dx, y, x + dx + 1, y + dl, VERDE_O)
        for k, yy in enumerate(range(y + 6, y + dl, 8)):
            lx = x + dx + (-4 if k % 2 else 4)
            d.ellipse([lx - 4, yy - 3, lx + 4, yy + 3], fill=VERDE if k % 2 else VERDE_C)


def estrella(d, x, y, s, c):
    t = max(2, s // 2)
    d.polygon([(x, y - s), (x + t, y - t), (x + s, y), (x + t, y + t), (x, y + s), (x - t, y + t), (x - s, y), (x - t, y - t)], fill=c)


# ── pasillo ───────────────────────────────────────────────────────────────────

def propio_pasillo(d, sala, p):
    # Ventana al fondo del pasillo, a la izquierda de la puerta de la habitación principal.
    ventana_b(d, 150, 102, 76, 54)
    # Lámpara colgante y, debajo, las fotos de la familia: solo siluetas, sin rostros.
    lampara(d, 480, 112, p.get('top', 84))
    foto(d, 400, 134, 30, 36, (150, 168, 172), [(-5, 26), (6, 18)])
    foto(d, 480, 142, 44, 28, (196, 168, 128), [(-10, 22), (2, 22), (14, 15)])
    foto(d, 560, 134, 30, 36, (150, 168, 172), [(0, 28)])
    # Un retrato pequeño entre la segunda puerta y el armario, y un reloj al final.
    foto(d, 736, 142, 22, 30, (196, 168, 128), [(0, 20)])
    reloj_b(d, 904, 124)


# ── habitación principal ──────────────────────────────────────────────────────

def propio_principal(d, sala, p):
    # Ventana con cortinas a los lados y su barra (la cortina tapa los bordes del marco).
    vx, vy, vw, vh = 560, 104, 96, 56
    ventana_b(d, vx, vy, vw, vh)
    r(d, vx - vw // 2 - 30, 94, vx + vw // 2 + 30, 97, MADERA_M)                         # barra
    r(d, vx - vw // 2 - 34, 92, vx - vw // 2 - 29, 99, MADERA_C)
    r(d, vx + vw // 2 + 28, 92, vx + vw // 2 + 33, 99, MADERA_C)
    cortina(d, vx - vw // 2 - 26, vx - vw // 2 + 6, 98, 176)
    cortina(d, vx + vw // 2 - 6, vx + vw // 2 + 26, 98, 176)
    # Cuadro sobre la cabecera de la cama (x≈300).
    cuadro_b(d, 300, 106, 68, 42, PASPARTU, (150, 124, 130), VERDE)
    # Aplique junto a la mesa de noche (x≈400).
    r(d, 398, 138, 401, 150, MADERA_M)
    d.polygon([(386, 138), (392, 126), (408, 126), (414, 138)], fill=TELA)
    r(d, 386, 138, 413, 140, TELA_S)
    # Perchero de pared con una chaqueta, una bufanda y un bolso (casa ordenada a medias).
    r(d, 786, 116, 840, 121, MADERA_C)
    r(d, 786, 122, 840, 125, MADERA_M)
    for hx in (796, 814, 830):
        r(d, hx - 1, 126, hx + 1, 130, METAL_S)
    r(d, 788, 132, 804, 170, CIELO_V)                                                    # chaqueta
    r(d, 788, 132, 804, 136, CIELO_VC)
    r(d, 795, 136, 796, 168, SILUETA)
    r(d, 811, 132, 817, 160, TELA)                                                       # bufanda
    r(d, 811, 146, 817, 149, TELA_S)
    r(d, 826, 132, 828, 142, MADERA_M)                                                   # bolso
    r(d, 820, 142, 836, 162, SILUETA)
    r(d, 820, 142, 836, 145, TELA_S)


# ── habitación de los niños ───────────────────────────────────────────────────

def dibujo_casa(d, x, y0, w, h):
    """Dibujo infantil pegado con cinta: sol, casa y flores. Solo formas."""
    gx0, gx1 = x - w // 2, x + w // 2
    r(d, gx0, y0, gx1, y0 + h, CREMA)
    r(d, gx0, y0 + h - 8, gx1, y0 + h, VERDE_C)                                          # pasto
    d.ellipse([gx0 + 8, y0 + 8, gx0 + 26, y0 + 26], fill=AMARILLO)                       # sol
    for ax, ay in ((gx0 + 17, y0 + 3), (gx0 + 17, y0 + 31), (gx0 + 3, y0 + 16), (gx0 + 31, y0 + 16)):
        r(d, ax - 2, ay - 2, ax + 2, ay + 2, AMARILLO)
    cx = x + 8
    r(d, cx - 16, y0 + 30, cx + 16, y0 + h - 8, TELA)                                    # casa
    d.polygon([(cx - 21, y0 + 30), (cx, y0 + 12), (cx + 21, y0 + 30)], fill=CORAL)       # techo
    r(d, cx - 5, y0 + 38, cx + 4, y0 + h - 8, MADERA_M)                                  # puerta
    r(d, cx + 8, y0 + 36, cx + 13, y0 + 42, CIELO_V)                                     # ventana
    for fx, c in ((gx1 - 8, CORAL), (gx1 - 20, AMARILLO)):                               # flores
        r(d, fx - 1, y0 + h - 26, fx, y0 + h - 8, VERDE_O)
        d.ellipse([fx - 5, y0 + h - 33, fx + 5, y0 + h - 23], fill=c)
    for tx in (gx0 + 2, gx1 - 6):                                                        # cinta
        r(d, tx, y0 - 2, tx + 6, y0 + 3, TELA)


def arcoiris(d, x, y, w, h):
    r(d, x - w // 2, y, x + w // 2, y + h, CREMA)
    for k, c in enumerate((CORAL, AMARILLO, VERDE)):
        rr = w // 2 - 4 - k * 6
        d.pieslice([x - rr, y + h - 6 - rr, x + rr, y + h - 6 + rr], 180, 360, fill=c)
    d.pieslice([x - 6, y + h - 12, x + 6, y + h], 180, 360, fill=CREMA)
    r(d, x - w // 2, y + h - 6, x + w // 2, y + h, CREMA)
    for tx in (x - w // 2 + 2, x + w // 2 - 6):
        r(d, tx, y - 2, tx + 5, y + 3, TELA)


def propio_ninos(d, sala, p):
    dibujo_casa(d, 372, 100, 88, 58)
    arcoiris(d, 290, 110, 44, 44)
    # Guirnalda de banderines sin letras sobre el escritorio y la caja de juguetes.
    x0, x1, yb, caida = 430, 852, 96, 16
    n = 17
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append((x0 + (x1 - x0) * t, yb + caida * (1 - (2 * t - 1) ** 2)))
    d.line(pts, fill=osc(p['pared'], 0.7), width=2)
    colores = (CORAL, CREMA, AMARILLO, VERDE)
    for i in range(n + 1):
        px, py = pts[i]
        d.polygon([(px - 8, py + 1), (px + 8, py + 1), (px, py + 17)], fill=colores[i % 4])
    # Estrellas pegadas sobre la cama.
    for ex, ey, s in ((136, 126, 9), (206, 156, 7), (166, 184, 8), (252, 122, 6), (112, 168, 6)):
        estrella(d, ex, ey, s, AMARILLO)
    # Repisa con juguetes: cubos de colores, una pelota y un vaso con crayones.
    r(d, 590, 176, 704, 181, MADERA_C)
    r(d, 590, 182, 704, 184, MADERA_M)
    for bx in (602, 692):
        r(d, bx, 184, bx + 3, 194, MADERA_M)
    r(d, 600, 158, 617, 175, CORAL)
    r(d, 618, 164, 633, 175, AMARILLO)
    r(d, 604, 146, 615, 157, VERDE)
    d.ellipse([642, 158, 660, 176], fill=CREMA)
    d.pieslice([642, 158, 660, 176], 200, 340, fill=CORAL)
    r(d, 670, 160, 688, 175, CIELO_V)
    for k, c in enumerate((CORAL, AMARILLO, VERDE)):
        r(d, 672 + k * 5, 152 - k % 2 * 4, 674 + k * 5, 160, c)
    # Ventana a la derecha, bajo la guirnalda.
    ventana_b(d, 790, 140, 70, 42)


# ── patio ─────────────────────────────────────────────────────────────────────

def hiedra(d, x, y_base, y_tope):
    for k, y in enumerate(range(y_base, y_tope, -10)):
        cx = x + (7 if k % 2 else -7) + (k % 3) * 2
        d.ellipse([cx - 7, y - 6, cx + 7, y + 6], fill=VERDE_O if k % 2 else VERDE)
        d.ellipse([cx + 1, y - 8, cx + 9, y - 1], fill=VERDE_C)


def propio_patio(d, sala, p):
    top = p['top']
    # Copas de un árbol vecino que asoman sobre el muro.
    for cx, cy, rr, c in ((870, 16, 18, VERDE_O), (906, 22, 14, VERDE), (846, 24, 12, VERDE), (924, 6, 12, VERDE_O)):
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=c)
    # Remate de cemento del muro.
    r(d, 0, top - 6, 959, top - 1, (176, 168, 152))
    r(d, 0, top, 959, top + 5, (132, 124, 112))
    # Hiedra en los rincones.
    hiedra(d, 52, 222, 104)
    hiedra(d, 940, 222, 130)
    # Plantas colgantes del muro.
    for x, y, largo in ((128, 98, 36), (224, 108, 22), (450, 100, 32), (600, 92, 26), (690, 106, 38)):
        maceta_colgante(d, x, y, largo)
    # Lavadero de cemento pegado al muro, a la derecha: pileta, tabla de lavar y un grifo.
    x0, x1 = 766, 910
    cem, cem_o, cem_c = (150, 146, 134), (122, 118, 108), (172, 166, 152)
    r(d, x0, 178, x1, 229, cem)                                                          # cuerpo
    r(d, x0, 178, x0 + 3, 229, cem_c)
    r(d, x1 - 3, 190, x1, 229, cem_o)
    r(d, x0 - 4, 168, x1 + 4, 177, cem_c)                                                # borde superior
    r(d, x0 - 4, 178, x1 + 4, 181, cem_o)
    r(d, x0 + 8, 170, x0 + 66, 177, (100, 130, 140))                                     # pileta con agua
    r(d, x0 + 8, 170, x0 + 66, 172, (140, 168, 176))
    for k in range(6):                                                                   # tabla de lavar
        r(d, x0 + 78, 170 + k * 2, x1 - 8, 171 + k * 2, cem_o if k % 2 == 0 else cem)
    r(d, x0 + 10, 192, x0 + 66, 224, cem_o)                                              # huecos de abajo
    r(d, x0 + 78, 192, x1 - 12, 224, cem_o)
    r(d, x0 + 12, 194, x0 + 64, 197, cem)
    r(d, x0 + 80, 194, x1 - 14, 197, cem)
    # Grifo que sale del muro sobre la pileta.
    r(d, x0 + 34, 128, x0 + 37, 152, METAL)
    r(d, x0 + 34, 148, x0 + 50, 152, METAL)
    r(d, x0 + 48, 148, x0 + 51, 160, METAL_S)
    r(d, x0 + 28, 126, x0 + 41, 131, METAL_S)


# ── paletas ───────────────────────────────────────────────────────────────────

SALAS = {
    'pasillo': dict(
        pared=(118, 100, 114), lado=(100, 84, 96), canto=(128, 110, 122), baja=(46, (98, 82, 94)), moldura=(128, 110, 122),
        zocalo=(62, 46, 52), piso='madera', pisoA=(150, 108, 72), pisoB=(138, 98, 64), pisoC=(128, 90, 58),
        junta=(112, 78, 52), puerta=(132, 92, 64), marco=(70, 52, 42), vidrio=CIELO_V, vidrio_claro=CIELO_VC,
        deco=[], luces=[]),
    'habitacion-principal': dict(
        pared=(124, 100, 116), lado=(106, 84, 100), canto=(156, 134, 148), baja=(36, (104, 82, 98)), moldura=(130, 108, 122),
        zocalo=(64, 46, 52), piso='madera', pisoA=(150, 108, 72), pisoB=(138, 98, 64), pisoC=(128, 90, 58),
        junta=(112, 78, 52), puerta=(118, 84, 60), marco=(70, 52, 42), vidrio=CIELO_V, vidrio_claro=CIELO_VC,
        deco=[], luces=[]),
    'habitacion-ninos': dict(
        pared=(98, 118, 134), lado=(80, 98, 112), canto=(140, 158, 170), zocalo=(56, 70, 80),
        piso='alfombra', pisoA=(122, 132, 108), pisoB=(110, 122, 98),
        puerta=(118, 84, 60), marco=(70, 52, 42), vidrio=CIELO_V, vidrio_claro=CIELO_VC,
        deco=[], luces=[]),
    'patio': dict(
        top=36, cielo=(150, 170, 184), cielo_claro=(184, 200, 208),
        pared=(112, 94, 82), lado=(100, 84, 74), canto=(176, 168, 152), ladrillo=((136, 90, 70), (126, 82, 64)),
        baja=(18, (128, 118, 104)), moldura=(150, 140, 124), zocalo=(84, 72, 64),
        piso='baldosa', pisoA=(134, 130, 120), pisoB=(124, 120, 110), junta=(108, 104, 96),
        deco=[], luces=[]),
}

PROPIOS = {
    'pasillo': propio_pasillo,
    'habitacion-principal': propio_principal,
    'habitacion-ninos': propio_ninos,
    'patio': propio_patio,
}
