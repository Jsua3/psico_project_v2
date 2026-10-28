"""Muebles de la comisaría de familia (P4) dibujados por código, a escala 1 y de frente un poco desde arriba.

Cada función sin argumentos devuelve un sprite RGBA cuyo ANCHO es exactamente el del catálogo
(`biblioteca/escenarios/comisaria/escenario.json`); el alto suele ser mayor que la caja de choque,
porque el mueble se ve de frente. El borde inferior del dibujo es el punto de apoyo en el piso.
Deja 1 px transparente en el borde para que el acabado (`terminar_sprite`) pueda poner el contorno.

Paleta institucional y fría (ESTILO.md, «Comisaría de familia»): gris azulado, metal y plástico.
Nada de violencia: sin celdas, esposas ni armas, sin texto legible y sin escudos.

    MUEBLES          {id: función -> Image RGBA}, los 18 muebles
    ICONOS_PROPIOS   {'acta-registro': función -> Image RGBA 32x32}
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from arte_comun import (  # noqa: E402
    BLANCO, HOJA, LOMOS, MADERA, MADERA_CLARA, METAL, NEGRO, PAPEL,
    R, caja, lienzo, sillas_espera,
)

GRIS = ((158, 168, 184), (126, 138, 158), (96, 108, 130), (68, 78, 98))   # gris azulado institucional
PANTALLA = (40, 46, 58)                                                    # monitor apagado
CARTON = ((200, 172, 126), (172, 144, 100), (132, 106, 72))
CONCRETO = ((152, 152, 148), (122, 122, 120), (94, 94, 94))
SALVIA = ((164, 204, 184), (130, 172, 150), (98, 136, 118))
CELESTE_S = ((148, 184, 208), (116, 152, 180), (88, 120, 148))
CORAL_S = ((214, 152, 130), (184, 120, 102), (146, 92, 78))
ARENA = ((222, 204, 160), (190, 170, 124))
CARPETAS = [(150, 84, 78), (76, 104, 142), (176, 156, 100), (92, 128, 104), (120, 104, 140), (178, 180, 174)]


def poli(d, puntos, c):
    d.polygon(puntos, fill=tuple(c) + (255,))


def elipse(d, caja_, c):
    d.ellipse(caja_, fill=tuple(c) + (255,))


def redondo(d, caja_, r, c):
    d.rounded_rectangle(caja_, r, fill=tuple(c) + (255,))


# ── recepción y oficinas ───────────────────────────────────────────────────────

def mostrador_recepcion():
    w, h = 180, 64
    im, d = lienzo(w, h)
    # computador apagado
    R(d, 26, 1, 54, 12, NEGRO[1]); R(d, 28, 3, 52, 10, PANTALLA); R(d, 28, 3, 40, 4, NEGRO[2])
    R(d, 38, 12, 42, 14, NEGRO[2])
    # bandeja con hojas
    R(d, 118, 12, 144, 14, METAL[2])
    R(d, 120, 8, 142, 12, PAPEL[0]); R(d, 120, 11, 142, 12, PAPEL[1])
    # tablero: tapa clara y frente institucional
    R(d, 1, 14, w - 2, 20, BLANCO[1]); R(d, 1, 14, w - 2, 15, BLANCO[0]); R(d, 1, 20, w - 2, 21, BLANCO[2])
    R(d, 1, 22, w - 2, h - 2, GRIS[1]); R(d, 1, 22, w - 2, 24, GRIS[2])
    for x in range(10, w - 12, 42):
        R(d, x, 29, x + 32, h - 9, GRIS[0]); R(d, x, h - 10, x + 32, h - 9, GRIS[2])
        R(d, x + 31, 29, x + 32, h - 9, GRIS[2])
    R(d, 1, h - 5, w - 2, h - 2, GRIS[3])
    return im


def silla_giratoria():
    w, h = 26, 40
    im, d = lienzo(w, h)
    redondo(d, [4, 1, w - 5, 20], 4, GRIS[2])
    R(d, 6, 3, w - 7, 6, GRIS[1])
    R(d, 2, 20, w - 3, 26, GRIS[1]); R(d, 2, 20, w - 3, 21, GRIS[0]); R(d, 2, 25, w - 3, 26, GRIS[3])
    R(d, w // 2 - 1, 27, w // 2 + 1, 32, METAL[2])
    R(d, 3, 33, w - 4, 35, METAL[1])
    for x in (3, w // 2 - 1, w - 6):
        R(d, x, 36, x + 2, 38, NEGRO[3])
    return im


def sillas_espera_comisaria():
    return sillas_espera(120, 36, tela=GRIS)


def escritorio_funcionario():
    w, h = 122, 62
    im, d = lienzo(w, h)
    # computador apagado
    R(d, 66, 1, 94, 12, NEGRO[1]); R(d, 68, 3, 92, 10, PANTALLA); R(d, 68, 3, 80, 4, NEGRO[2])
    R(d, 78, 12, 82, 14, NEGRO[2]); R(d, 72, 14, 90, 15, NEGRO[1])
    # carpetas apiladas
    R(d, 14, 8, 38, 14, CARPETAS[1]); R(d, 14, 8, 38, 9, GRIS[0])
    R(d, 18, 4, 40, 9, CARPETAS[2]); R(d, 18, 4, 40, 5, PAPEL[0])
    R(d, 100, 10, 112, 14, PAPEL[0]); R(d, 100, 13, 112, 14, PAPEL[1])
    # tablero y cuerpo
    R(d, 1, 14, w - 2, 20, GRIS[0]); R(d, 1, 14, w - 2, 15, BLANCO[1]); R(d, 1, 20, w - 2, 21, GRIS[2])
    R(d, 1, 22, w - 2, 24, GRIS[2])
    R(d, 4, 25, 42, h - 2, GRIS[1]); R(d, 4, h - 4, 42, h - 2, GRIS[2])
    for yy in (30, 42, 54):
        R(d, 6, yy, 40, yy + 1, GRIS[2]); R(d, 19, yy + 3, 27, yy + 4, METAL[0])
    R(d, 43, 25, w - 6, 46, GRIS[3]); R(d, 43, 25, w - 6, 26, GRIS[2])
    R(d, w - 10, 25, w - 4, h - 2, GRIS[1]); R(d, w - 10, 25, w - 9, h - 2, GRIS[2])
    return im


def silla_visitante_comisaria():
    w, h = 24, 34
    im, d = lienzo(w, h)
    R(d, 3, 1, w - 4, 3, GRIS[0]); R(d, 3, 1, 5, 18, GRIS[2]); R(d, w - 6, 1, w - 4, 18, GRIS[2])
    R(d, 6, 4, w - 7, 14, GRIS[1]); R(d, 6, 4, w - 7, 5, GRIS[0])
    R(d, 2, 17, w - 3, 22, GRIS[0]); R(d, 2, 21, w - 3, 22, GRIS[2])
    for x in (3, w - 6):
        R(d, x, 23, x + 2, h - 2, METAL[2])
    R(d, 5, 23, w - 6, 24, METAL[3])
    return im


def archivador_metalico():
    w, h = 40, 52
    im, d = lienzo(w, h)
    caja(d, 1, 1, w - 2, h - 2, GRIS, tapa=3)
    for k in range(3):
        y0 = 7 + k * 14
        R(d, 4, y0, w - 5, y0 + 11, GRIS[0]); R(d, 4, y0 + 11, w - 5, y0 + 12, GRIS[3])
        R(d, w // 2 - 5, y0 + 2, w // 2 + 4, y0 + 4, PAPEL[1])
        R(d, w // 2 - 4, y0 + 6, w // 2 + 3, y0 + 7, METAL[2])
    return im


def estante_expedientes():
    w, h = 96, 96
    im, d = lienzo(w, h)
    R(d, 1, 1, w - 2, h - 2, GRIS[3])
    R(d, 1, 1, w - 2, 3, GRIS[0])
    R(d, 1, 1, 3, h - 2, GRIS[2]); R(d, w - 4, 1, w - 2, h - 2, GRIS[2])
    R(d, 1, h - 6, w - 2, h - 2, GRIS[2])
    paso = (h - 10) // 4
    for k in range(4):
        base = 4 + paso * (k + 1) - 3
        x, j = 5, k * 5 + 2
        while x < w - 8:
            ancho = 5 + (j * 3) % 3
            alto = paso - 6 - (j * 5) % 3
            if (j + k) % 9 == 4:                                # un hueco entre carpetas
                x += 6; j += 1; continue
            c = CARPETAS[j % len(CARPETAS)]
            R(d, x, base - alto, min(x + ancho - 1, w - 7), base, c)
            R(d, x + 1, base - alto + 3, min(x + ancho - 2, w - 7), base - alto + 5, PAPEL[0])
            x += ancho + 1; j += 1
        R(d, 4, base + 1, w - 5, base + 3, GRIS[1])
        R(d, 4, base + 1, w - 5, base + 1, GRIS[0])
    return im


def bandera_asta():
    w, h = 24, 90
    im, d = lienzo(w, h)
    # base y asta
    redondo(d, [3, h - 6, w - 4, h - 2], 2, NEGRO[2]); R(d, 5, h - 6, w - 6, h - 5, NEGRO[1])
    R(d, 10, h - 9, 13, h - 6, METAL[2])
    R(d, 11, 4, 12, h - 9, METAL[0]); R(d, 12, 4, 12, h - 9, METAL[1])
    elipse(d, [9, 1, 14, 5], METAL[0])
    # bandera de tres franjas horizontales, caída con pliegues; sin escudo
    franjas = (((186, 160, 88), (150, 126, 66)), ((64, 92, 138), (46, 70, 108)), ((152, 66, 62), (118, 48, 46)))
    alto = (12, 7, 7)
    y = 6
    for (c, sombra), a in zip(franjas, alto):
        R(d, 13, y, 23, y + a - 1, c)
        for xx in (16, 20):
            R(d, xx, y, xx, y + a - 1, sombra)
        y += a
    cola = franjas[2]
    R(d, 13, y, 23, y, cola[1])
    R(d, 15, y + 1, 18, y + 1, cola[0]); R(d, 21, y + 1, 23, y + 1, cola[0])
    return im


# ── sala de reunión y atención a niñas y niños ─────────────────────────────────

def mesa_reunion():
    w, h = 120, 60
    im, d = lienzo(w, h)
    # respaldos de las sillas del lado de atrás
    for x0 in (14, 49, 84):
        redondo(d, [x0, 1, x0 + 22, 20], 4, GRIS[2])
        R(d, x0 + 3, 4, x0 + 19, 7, GRIS[1])
    # tablero
    R(d, 1, 16, w - 2, 30, MADERA_CLARA[0]); R(d, 1, 16, w - 2, 17, MADERA_CLARA[1])
    R(d, 1, 31, w - 2, 36, MADERA_CLARA[1]); R(d, 1, 31, w - 2, 32, MADERA_CLARA[2]); R(d, 1, 35, w - 2, 36, MADERA_CLARA[3])
    # asientos metidos bajo el tablero (las sillas del lado de acá)
    for x0 in (20, 50, 80):
        R(d, x0, 38, x0 + 19, 43, GRIS[1]); R(d, x0, 42, x0 + 19, 43, GRIS[3])
    for x in (5, w - 9):
        R(d, x, 37, x + 3, h - 2, MADERA_CLARA[2]); R(d, x, 37, x, h - 2, MADERA_CLARA[1])
        R(d, x - 2, h - 3, x + 5, h - 2, MADERA_CLARA[3])
    return im


def mesa_baja_nna():
    w, h = 60, 34
    im, d = lienzo(w, h)
    redondo(d, [1, 7, w - 2, 21], 6, SALVIA[2])
    redondo(d, [1, 2, w - 2, 17], 6, SALVIA[1])
    redondo(d, [4, 4, w - 5, 14], 4, SALVIA[0])
    for x in (6, w - 10):
        R(d, x, 21, x + 3, h - 2, ARENA[1]); R(d, x, 21, x, h - 2, ARENA[0])
    # una pieza de colores sobre la mesa
    R(d, 16, 4, 21, 9, CORAL_S[1]); R(d, 16, 4, 21, 5, CORAL_S[0])
    R(d, 24, 5, 29, 10, CELESTE_S[1]); R(d, 24, 5, 29, 6, CELESTE_S[0])
    return im


def silla_pequena():
    w, h = 20, 28
    im, d = lienzo(w, h)
    redondo(d, [3, 1, w - 4, 11], 3, CELESTE_S[1])
    R(d, 5, 3, w - 6, 4, CELESTE_S[0])
    R(d, 2, 12, w - 3, 16, CELESTE_S[0]); R(d, 2, 15, w - 3, 16, CELESTE_S[2])
    for x in (3, w - 5):
        R(d, x, 17, x + 1, h - 2, ARENA[1])
    return im


def tapete_juegos():
    w, h = 90, 60
    im, d = lienzo(w, h)
    # cuadrilátero en perspectiva: más angosto atrás, más ancho adelante
    arriba = (12, 78, 3)
    abajo = (1, 88, 57)

    def punto(u, v, margen=0):
        y = arriba[2] + (abajo[2] - arriba[2]) * v
        x0 = arriba[0] + (abajo[0] - arriba[0]) * v
        x1 = arriba[1] + (abajo[1] - arriba[1]) * v
        return (x0 + (x1 - x0) * u, y)

    poli(d, [punto(0, 0), punto(1, 0), punto(1, 1), punto(0, 1)], GRIS[2])
    colores = [SALVIA[0], CELESTE_S[0], ARENA[0], CORAL_S[0]]
    n_u, n_v = 5, 4
    m = 0.05
    for i in range(n_u):
        for j in range(n_v):
            u0, u1 = m + (1 - 2 * m) * i / n_u, m + (1 - 2 * m) * (i + 1) / n_u
            v0, v1 = m * 1.6 + (1 - 3.2 * m) * j / n_v, m * 1.6 + (1 - 3.2 * m) * (j + 1) / n_v
            poli(d, [punto(u0, v0), punto(u1, v0), punto(u1, v1), punto(u0, v1)], colores[(i + j * 2) % 4])
    return im


def estante_juguetes():
    w, h = 60, 42
    im, d = lienzo(w, h)
    # sobre el estante: cubos, una pelota y un libro
    R(d, 4, 4, 13, 12, CORAL_S[1]); R(d, 4, 4, 13, 5, CORAL_S[0])
    R(d, 7, 0, 14, 5, SALVIA[1]); R(d, 7, 0, 14, 1, SALVIA[0])
    elipse(d, [28, 3, 38, 13], CELESTE_S[1]); R(d, 30, 5, 32, 6, CELESTE_S[0])
    R(d, 43, 8, 56, 12, LOMOS[1]); R(d, 43, 8, 56, 9, PAPEL[0]); R(d, 43, 11, 56, 12, PAPEL[1])
    # cuerpo
    caja(d, 1, 12, w - 2, h - 2, MADERA_CLARA, tapa=4)
    for k in range(3):
        x0 = 4 + k * 18
        R(d, x0, 19, x0 + 15, h - 6, MADERA_CLARA[3]); R(d, x0, 19, x0 + 15, 20, MADERA_CLARA[2])
    # cubos dentro
    R(d, 6, 28, 13, h - 6, SALVIA[1]); R(d, 6, 28, 13, 29, SALVIA[0])
    R(d, 24, 30, 31, h - 6, CORAL_S[1]); R(d, 24, 30, 31, 31, CORAL_S[0])
    R(d, 40, 26, 47, h - 6, ARENA[1]); R(d, 40, 26, 47, 27, ARENA[0])
    R(d, 48, 32, 53, h - 6, CELESTE_S[1]); R(d, 48, 32, 53, 33, CELESTE_S[0])
    R(d, 4, h - 5, w - 5, h - 3, MADERA_CLARA[2])
    return im


# ── espacio exterior y apoyo ───────────────────────────────────────────────────

def banca_exterior():
    w, h = 100, 34
    im, d = lienzo(w, h)
    # respaldo de dos tablones metálicos
    for k, yy in enumerate((1, 6)):
        R(d, 3, yy, w - 4, yy + 3, GRIS[0 if k == 0 else 1]); R(d, 3, yy + 3, w - 4, yy + 3, GRIS[3])
    R(d, 9, 9, 11, 15, GRIS[3]); R(d, w - 12, 9, w - 10, 15, GRIS[3])
    # asiento
    for k, yy in enumerate((14, 18, 22)):
        R(d, 1, yy, w - 2, yy + 2, GRIS[0 if k % 2 == 0 else 1])
    R(d, 1, 25, w - 2, 25, GRIS[3])
    # apoyos de concreto en los extremos
    for x0 in (6, w - 17):
        R(d, x0, 26, x0 + 10, h - 2, CONCRETO[1]); R(d, x0, 26, x0 + 10, 27, CONCRETO[0])
        R(d, x0 + 8, 28, x0 + 10, h - 2, CONCRETO[2])
    return im


def caneca_comisaria():
    w, h = 26, 32
    im, d = lienzo(w, h)
    R(d, 2, 1, w - 3, 6, GRIS[3]); R(d, 2, 1, w - 3, 2, GRIS[2])
    R(d, 7, 3, w - 8, 4, NEGRO[3])
    R(d, 3, 7, w - 4, h - 2, GRIS[1]); R(d, 3, 7, 5, h - 2, GRIS[0]); R(d, w - 6, 7, w - 4, h - 2, GRIS[2])
    R(d, 6, 14, w - 7, 19, BLANCO[1]); R(d, 6, 14, w - 7, 14, BLANCO[0])
    R(d, 3, h - 4, w - 4, h - 2, GRIS[3])
    return im


def planta_oficina():
    w, h = 36, 48
    im, d = lienzo(w, h)
    for (cx, cy, r, c) in ((18, 18, 13, HOJA[2]), (11, 22, 9, HOJA[1]), (25, 21, 9, HOJA[1]), (18, 11, 9, HOJA[1]),
                           (14, 9, 5, HOJA[0]), (23, 15, 5, HOJA[0]), (9, 19, 4, HOJA[0])):
        elipse(d, [cx - r, cy - r, cx + r, cy + r], c)
    poli(d, [(7, 31), (w - 8, 31), (w - 11, h - 2), (10, h - 2)], GRIS[1])
    R(d, 6, 30, w - 7, 34, GRIS[0]); R(d, 10, h - 4, w - 11, h - 2, GRIS[3])
    return im


def cartelera_comisaria():
    w, h = 90, 100
    im, d = lienzo(w, h)
    R(d, 1, 1, w - 2, 56, GRIS[3]); R(d, 4, 4, w - 5, 53, (92, 114, 140))
    hojas = ((10, 9, 32, 30, PAPEL[0], (70, 104, 150)), (38, 8, 58, 24, (226, 214, 170), (152, 66, 62)),
             (62, 12, 82, 36, (176, 204, 184), (64, 92, 138)), (16, 34, 40, 50, (214, 220, 226), (152, 66, 62)),
             (46, 30, 64, 48, PAPEL[1], (70, 104, 150)))
    for (x0, y0, x1, y1, c, pin) in hojas:
        R(d, x0, y0, x1, y1, c)
        R(d, x0 + 2, y0 + 2, x1 - 2, y0 + 3, pin)
        R(d, (x0 + x1) // 2, y0 - 1, (x0 + x1) // 2 + 1, y0, pin)
        for yy in range(y0 + 7, y1 - 2, 4):
            R(d, x0 + 3, yy, x1 - 4, yy, GRIS[0])
    return im


def caja_archivo():
    w, h = 40, 40
    im, d = lienzo(w, h)
    # caja de abajo
    R(d, 1, 22, w - 2, 26, CARTON[0]); R(d, 1, 27, w - 2, h - 2, CARTON[1]); R(d, 1, 27, w - 2, 28, CARTON[2])
    R(d, 1, h - 3, w - 2, h - 2, CARTON[2])
    R(d, 12, 30, 27, 34, PAPEL[0]); redondo(d, [15, 36, 24, 37], 0, CARTON[2])
    # caja de arriba, más angosta
    R(d, 5, 5, 34, 9, CARTON[0]); R(d, 5, 10, 34, 21, CARTON[1]); R(d, 5, 10, 34, 11, CARTON[2])
    R(d, 5, 20, 34, 21, CARTON[2])
    R(d, 14, 13, 25, 17, PAPEL[1]); R(d, 15, 6, 24, 7, CARTON[2])
    return im


# ── tapete y catálogo ──────────────────────────────────────────────────────────

MUEBLES = {
    'mostrador-recepcion': mostrador_recepcion,
    'silla-giratoria': silla_giratoria,
    'sillas-espera-comisaria': sillas_espera_comisaria,
    'escritorio-funcionario': escritorio_funcionario,
    'silla-visitante-comisaria': silla_visitante_comisaria,
    'archivador-metalico': archivador_metalico,
    'estante-expedientes': estante_expedientes,
    'bandera-asta': bandera_asta,
    'mesa-reunion': mesa_reunion,
    'mesa-baja-nna': mesa_baja_nna,
    'silla-pequena': silla_pequena,
    'tapete-juegos': tapete_juegos,
    'estante-juguetes': estante_juguetes,
    'banca-exterior': banca_exterior,
    'caneca-comisaria': caneca_comisaria,
    'planta-oficina': planta_oficina,
    'cartelera-comisaria': cartelera_comisaria,
    'caja-archivo': caja_archivo,
}


# ── herramienta propia (32x32) ─────────────────────────────────────────────────

def acta_registro():
    """Acta de registro de la atención: una hoja con líneas y un sello redondo con una marca de visto."""
    im, d = lienzo(32, 32)
    R(d, 5, 2, 24, 29, PAPEL[1]); R(d, 6, 3, 23, 28, PAPEL[0])
    R(d, 6, 3, 23, 7, (84, 120, 166))
    for yy in (11, 15, 19):
        R(d, 9, yy, 20, yy, (150, 150, 146))
    R(d, 9, 23, 15, 23, (150, 150, 146))
    # sello redondo con visto
    elipse(d, [15, 17, 28, 30], (60, 112, 104)); elipse(d, [17, 19, 26, 28], (86, 148, 136))
    d.line([(18, 24), (20, 26), (25, 20)], fill=(236, 240, 232, 255), width=2)
    return im


ICONOS_PROPIOS = {'acta-registro': acta_registro}
