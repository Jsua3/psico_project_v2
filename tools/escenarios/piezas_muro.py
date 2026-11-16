"""Ventanas, piezas de muro y lámparas de las «salas por piezas».

Cada pieza se dibuja en el plano de su muro (u a lo largo, v = altura sobre el piso) y `piezas_geo` la
proyecta de frente o de lado. Las lámparas de pie y de mesa van sobre el piso (vista `suelo`).

    PIEZAS[(tipo, modelo)]                      ficha: nombre, ancho, ocupa, muros, cuadros, luz…
    cuadros(tipo, modelo, vista, ancho_sala)    lista de cuadros RGBA
    apoyo(tipo, modelo, vista, ancho_sala)      punto de apoyo dentro de un cuadro (puede quedar bajo la imagen:
                                                la pieza cuelga y el apoyo es su pie sobre la línea del piso)

Qué significa cada cuadro: ventana = [día, noche]; lámpara = [apagada, encendida]; reloj = 12 pasos del
segundero; las demás tienen un solo cuadro.
"""
import functools
import math
import os
import sys

from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import piezas_geo as g  # noqa: E402
from piezas_superficies import azar, mezcla, osc  # noqa: E402

BLANCO = (255, 255, 255)
MARCO_CREMA = ((216, 206, 184), (196, 184, 160), (150, 140, 122))
MARCO_GRIS = ((206, 204, 194), (186, 184, 172), (138, 136, 130))
MARCO_ALU = ((196, 202, 206), (156, 164, 174), (112, 120, 132))
MARCO_OSCURO = ((124, 132, 146), (92, 100, 114), (64, 70, 84))
MADERA = ((150, 110, 78), (122, 86, 60), (92, 64, 46), (70, 48, 36))
DIA = ((170, 194, 202), (152, 178, 190), (134, 162, 176), (118, 146, 162))
NOCHE = ((22, 26, 48), (26, 32, 56), (32, 38, 64), (40, 46, 72))
PAPEL = ((230, 226, 212), (200, 196, 182), (150, 150, 146))
LOMOS = ((176, 70, 64), (70, 104, 150), (206, 180, 116), (80, 130, 96), (150, 110, 160), (220, 214, 196), (110, 80, 60))
TELA = ((228, 214, 172), (206, 190, 148), (176, 160, 122))
PANTALLA = ((246, 232, 184), (228, 204, 142), (196, 164, 106))
FOCO = ((214, 210, 196), (255, 246, 210))
METAL = ((176, 184, 192), (136, 144, 156), (100, 106, 118), (72, 76, 86))
ROJO = ((214, 92, 80), (186, 62, 56), (140, 44, 44))


# Lo que emite luz propia: el cielo de día y las luces lejanas de noche que se ven por la ventana, y el foco, el tubo
# y la pantalla de una lámpara encendida.
EMISIVOS = tuple(DIA) + (mezcla(DIA[0], BLANCO, 0.42), mezcla(DIA[0], BLANCO, 0.2), mezcla(DIA[0], BLANCO, 0.3), mezcla(DIA[0], BLANCO, 0.5),
                         (128, 150, 166), mezcla((128, 150, 166), BLANCO, 0.14), (226, 222, 196), (150, 172, 204), (198, 206, 224),
                         (226, 226, 208), FOCO[1], (244, 250, 250), (214, 232, 240), PANTALLA[0], PANTALLA[1])

# Lo que brilla en una pieza: el reflejo del espejo y del frasco (apagados en el dibujo) y los filos de metal y barniz.
# El reflejo de las ventanas de día no va aquí: es el cielo que se ve por ellas y de noche no existe.
BRILLOS = {(198, 218, 222): ('vidrio', (160, 186, 194)), (176, 200, 206): ('vidrio', (156, 182, 190)), (232, 240, 246): ('vidrio', (150, 190, 224)),
           MARCO_ALU[0]: ('metal', None), METAL[0]: ('metal', None), ROJO[0]: ('metal', None), MADERA[0]: ('barniz', None)}


# ── utilidades de dibujo ───────────────────────────────────────────────────────

def marco_rect(pl, u0, v0, u1, v1, m):
    pl.q(u0, v0, u1, v1, m[1])
    pl.q(u0, v1 - 1, u1, v1, m[0])
    pl.q(u0, v0, u0 + 1, v1, m[0])
    pl.q(u0, v0, u1, v0 + 1, m[2])
    pl.q(u1 - 1, v0, u1, v1, m[2])


def escalones(pl, u0, v0, pasos, du, dv, ancho, c):
    for i in range(pasos):
        pl.q(u0 + i * du, v0 + i * dv, u0 + i * du + ancho, v0 + (i + 1) * dv, c)


def trazo(pl, u0, v0, u1, v1, c):
    n = int(max(abs(u1 - u0), abs(v1 - v0)))
    for i in range(n + 1):
        u, v = int(round(u0 + (u1 - u0) * i / max(1, n))), int(round(v0 + (v1 - v0) * i / max(1, n)))
        pl.q(u, v, u + 1, v + 1, c)


def disco(pl, cu, cv, r, c):
    for dv in range(-r, r):
        medio = int(math.sqrt(r * r - (dv + 0.5) ** 2) + 0.5)
        pl.q(cu - medio, cv + dv, cu + medio, cv + dv + 1, c)


def cielo(pl, u0, v0, u1, v1, noche, semilla=0, luna=False, reflejo=True, lejos=True):
    """Vidrio en cuatro franjas (sin degradado). De noche, estrellas; de día, un reflejo en diagonal."""
    tonos = NOCHE if noche else DIA
    alto = v1 - v0
    cortes = [v1 - alto * k // 4 for k in range(5)]
    for k in range(4):
        pl.q(u0, cortes[k + 1], u1, cortes[k], tonos[k])
    if lejos:                                   # por la ventana se ve algo: techos a lo lejos, una nube, luces de noche
        tono, u = ((30, 34, 58) if noche else (128, 150, 166)), u0
        for i in range(24):
            k = azar(i, semilla, 61)
            tramo, altura = 7 + k % 10, 4 + (k >> 5) % max(3, alto // 4)
            if u >= u1:
                break
            pl.q(u, v0, min(u + tramo, u1), v0 + altura, tono)
            if noche and k % 3 == 0 and u + 3 < u1:
                pl.q(u + 2, v0 + altura - 3, u + 3, v0 + altura - 1, (226, 222, 196))
            elif not noche:
                pl.q(u, v0 + altura - 1, min(u + tramo, u1), v0 + altura, mezcla(tono, BLANCO, 0.14))
            u += tramo
        if not noche and u1 - u0 >= 30:
            nube, cu, cv = mezcla(DIA[0], BLANCO, 0.5), u0 + (u1 - u0) * 3 // 5, v1 - max(6, alto // 3)
            pl.q(cu, cv, min(cu + 14, u1), cv + 2, nube)
            pl.q(cu + 3, cv + 2, min(cu + 11, u1), cv + 4, nube)
    if noche:
        for i in range(max(2, (u1 - u0) * alto // 300)):
            k = azar(i, semilla, 5)
            u, v = u0 + 2 + k % (u1 - u0 - 4), v0 + alto // 3 + (k >> 9) % (alto * 2 // 3 - 2)
            pl.q(u, v, u + 1, v + 1, (198, 206, 224))
        if luna:
            pl.q(u1 - 16, v1 - 14, u1 - 10, v1 - 8, (226, 226, 208))
            pl.q(u1 - 14, v1 - 12, u1 - 10, v1 - 8, NOCHE[0])
    elif reflejo:
        pasos = max(2, alto // 12)
        escalones(pl, u0 + 5, v0 + 3, pasos, 4, (alto - 6) // pasos, 5, mezcla(DIA[0], BLANCO, 0.42))
        escalones(pl, u0 + 13, v0 + 3, pasos, 4, (alto - 6) // pasos, 2, mezcla(DIA[0], BLANCO, 0.2))


def cortina(pl, u0, v0, u1, v1):
    pl.q(u0, v0, u1, v1, TELA[1])
    for n, u in enumerate(range(u0, u1, 3)):
        pl.q(u, v0, u + 1, v1, TELA[0] if n % 2 == 0 else TELA[2])
    pl.q(u0, v0, u1, v0 + 2, TELA[2])


# ── ventanas ───────────────────────────────────────────────────────────────────

def _corrediza(pl, n):
    w, v0, h, m = 96, 70, 60, MARCO_CREMA
    marco_rect(pl, -4, v0 - 4, w + 4, v0 + h + 4, m)
    cielo(pl, 0, v0, w, v0 + h, n, semilla=1, luna=True)
    pl.q(w // 2 - 2, v0, w // 2 + 2, v0 + h, m[1])
    pl.q(w // 2 + 1, v0, w // 2 + 2, v0 + h, m[2])
    pl.q(0, v0 + h // 2 - 1, w, v0 + h // 2 + 2, m[1])
    pl.q(0, v0 + h // 2 - 1, w, v0 + h // 2, m[2])
    pl.q(0, v0 + h - 2, w, v0 + h, osc(DIA[3] if not n else NOCHE[0], 0.8))      # sombra del marco sobre el vidrio
    pl.q(-8, v0 - 10, w + 8, v0 - 4, m[1])
    pl.q(-8, v0 - 5, w + 8, v0 - 4, m[0])
    pl.q(-8, v0 - 10, w + 8, v0 - 9, m[2])
    cortina(pl, -12, v0 - 8, 4, v0 + h + 5)
    cortina(pl, w - 4, v0 - 8, w + 12, v0 + h + 5)
    pl.q(-14, v0 + h + 5, w + 14, v0 + h + 8, MADERA[2])
    pl.q(-14, v0 + h + 7, w + 14, v0 + h + 8, MADERA[0])


def _persiana(pl, n):
    w, v0, h, m = 88, 70, 60, MARCO_GRIS
    marco_rect(pl, -4, v0 - 4, w + 4, v0 + h + 4, m)
    cielo(pl, 0, v0, w, v0 + h, n, semilla=2)
    pl.q(w // 2 - 1, v0, w // 2 + 1, v0 + h, m[1])
    lama = (206, 198, 178)
    for v in range(v0 + h - 4, v0 + h * 2 // 5, -5):
        pl.q(0, v, w, v + 3, lama)
        pl.q(0, v, w, v + 1, osc(lama, 0.78))
    pl.q(0, v0 + h * 2 // 5 - 2, w, v0 + h * 2 // 5 + 2, osc(lama, 0.7))
    pl.q(0, v0 + h - 3, w, v0 + h, osc(lama, 0.86))
    pl.q(w - 8, v0 + 6, w - 7, v0 + h * 2 // 5, (120, 116, 108))
    pl.q(-8, v0 - 10, w + 8, v0 - 4, m[1])
    pl.q(-8, v0 - 5, w + 8, v0 - 4, m[0])
    pl.q(-8, v0 - 10, w + 8, v0 - 9, m[2])


def _alta(pl, n):
    w, v0, h, m = 120, 100, 32, MARCO_ALU
    marco_rect(pl, -3, v0 - 3, w + 3, v0 + h + 3, m)
    for k in range(3):
        cielo(pl, k * 40 + (2 if k else 0), v0, k * 40 + (40 if k == 2 else 38), v0 + h, n, semilla=10 + k)
    for u in (38, 78):
        pl.q(u, v0, u + 4, v0 + h, m[1])
        pl.q(u + 3, v0, u + 4, v0 + h, m[2])
    pl.q(56, v0 + 1, 64, v0 + 3, m[2])
    pl.q(-5, v0 - 6, w + 5, v0 - 3, m[1])
    pl.q(-5, v0 - 4, w + 5, v0 - 3, m[0])


def _ventanal(pl, n):
    w, v0, h, m = 168, 42, 88, MARCO_OSCURO
    marco_rect(pl, -4, v0 - 4, w + 4, v0 + h + 4, m)
    cielo(pl, 0, v0, w, v0 + h, n, semilla=3, luna=True, reflejo=False, lejos=False)
    lejos = (30, 34, 58) if n else (128, 150, 166)
    u = 0
    for i in range(40):                                   # la ciudad a lo lejos
        k = azar(i, 77)
        ancho, alto = 8 + k % 14, 10 + (k >> 6) % 30
        if u >= w:
            break
        pl.q(u, v0, min(u + ancho, w), v0 + alto, lejos)
        if n:
            for j in range((k >> 12) % 4):
                kk = azar(i, j, 79)
                uu, vv = u + 2 + kk % max(1, ancho - 3), v0 + 3 + (kk >> 7) % max(1, alto - 5)
                if uu < w - 1:
                    pl.q(uu, vv, uu + 1, vv + 2, (226, 222, 196) if kk % 3 else (150, 172, 204))
        else:
            pl.q(u, v0 + alto - 1, min(u + ancho, w), v0 + alto, mezcla(lejos, BLANCO, 0.14))
        u += ancho
    if not n:
        escalones(pl, 10, v0 + 30, 5, 5, 10, 6, mezcla(DIA[0], BLANCO, 0.42))
        escalones(pl, 96, v0 + 30, 5, 5, 10, 3, mezcla(DIA[0], BLANCO, 0.3))
    for u in (40, 82, 124):
        pl.q(u, v0, u + 4, v0 + h, m[1])
        pl.q(u + 3, v0, u + 4, v0 + h, m[2])
    pl.q(0, v0 + 56, w, v0 + 60, m[1])
    pl.q(0, v0 + 56, w, v0 + 57, m[2])
    pl.q(-7, v0 - 9, w + 7, v0 - 4, m[1])
    pl.q(-7, v0 - 5, w + 7, v0 - 4, m[0])


# ── piezas de muro ─────────────────────────────────────────────────────────────

def _cuadro(pl, n):
    w, v0, h = 40, 86, 32
    marco_rect(pl, -4, v0 - 4, w + 4, v0 + h + 4, (MADERA[1], MADERA[2], MADERA[3]))
    pl.q(0, v0, w, v0 + h, PAPEL[0])
    pl.q(2, v0 + 2, w - 2, v0 + h - 2, (204, 212, 204))
    disco(pl, 28, v0 + 21, 5, (198, 150, 112))
    for k, (a, b) in enumerate(((2, 38), (4, 30), (7, 24), (10, 19))):
        pl.q(a, v0 + 2 + k * 3, b, v0 + 5 + k * 3, (92, 126, 100))
    for k, (a, b) in enumerate(((20, 38), (24, 38), (29, 38))):
        pl.q(a, v0 + 2 + k * 3, b, v0 + 5 + k * 3, (70, 102, 86))
    pl.q(0, v0 + h - 1, w, v0 + h, PAPEL[2])


def _reloj(pl, n):
    cu, cv = 13, 113
    disco(pl, cu, cv, 13, (52, 50, 58))
    disco(pl, cu, cv, 11, (228, 224, 212))
    for du, dv in ((0, 9), (9, 0), (0, -9), (-9, 0)):
        pl.q(cu + du - 1, cv + dv - 1, cu + du + 1, cv + dv + 1, (96, 94, 100))
    trazo(pl, cu, cv, cu - 4, cv + 4, (40, 40, 48))
    trazo(pl, cu, cv, cu + 5, cv + 6, (40, 40, 48))
    a = math.radians(n * 30)
    trazo(pl, cu, cv, cu + round(9 * math.sin(a)), cv + round(9 * math.cos(a)), ROJO[1])
    pl.q(cu - 1, cv - 1, cu + 1, cv + 1, (40, 40, 48))


def _cartelera(pl, n):
    w, v0, h = 72, 68, 46
    marco_rect(pl, -3, v0 - 3, w + 3, v0 + h + 3, (MADERA[0], MADERA[1], MADERA[3]))
    corcho = (170, 138, 106)
    pl.q(0, v0, w, v0 + h, corcho)
    for i in range(46):
        k = azar(i, 83)
        u, v = k % (w - 1), v0 + (k >> 8) % (h - 1)
        pl.q(u, v, u + 1, v + 1, osc(corcho, 0.86) if k % 3 else mezcla(corcho, BLANCO, 0.16))
    hojas = ((5, 22, 22, 42, PAPEL[0]), (26, 26, 44, 43, (150, 184, 200)), (48, 20, 66, 42, PAPEL[0]),
             (8, 4, 30, 18, (166, 198, 164)), (36, 5, 52, 21, PAPEL[1]), (56, 4, 68, 16, (222, 190, 190)))
    for a, b, c, e, tinta in hojas:
        pl.q(a + 1, v0 + b - 1, c + 1, v0 + e - 1, osc(corcho, 0.74))
        pl.q(a, v0 + b, c, v0 + e, tinta)
        for v in range(v0 + e - 4, v0 + b + 2, -3):
            pl.q(a + 2, v, c - 2 - (v % 4), v + 1, osc(tinta, 0.72))
        pl.q((a + c) // 2, v0 + e - 2, (a + c) // 2 + 2, v0 + e, ROJO[1] if (a + b) % 2 else (70, 104, 150))


def _tablero(pl, n):
    w, v0, h = 120, 62, 56
    marco_rect(pl, -3, v0 - 3, w + 3, v0 + h + 3, MARCO_ALU)
    pl.q(0, v0, w, v0 + h, (232, 234, 230))
    pl.q(0, v0 + h - 2, w, v0 + h, (206, 210, 208))
    for u0, v, largo, tinta in ((8, 44, 42, (84, 116, 168)), (8, 38, 30, (84, 116, 168)), (8, 32, 36, (84, 116, 168)),
                                (64, 44, 26, (84, 140, 100)), (64, 38, 40, (84, 140, 100)), (10, 16, 22, ROJO[1])):
        pl.q(u0, v0 + v, u0 + largo, v0 + v + 2, tinta)
    for u0, vv, u1, v1 in ((70, 10, 86, 26), (86, 26, 106, 14)):
        trazo(pl, u0, v0 + vv, u1, v0 + v1, (84, 116, 168))
    disco(pl, 96, v0 + 20, 4, (214, 220, 226))
    pl.q(8, v0 - 8, w - 8, v0 - 3, MARCO_ALU[1])
    pl.q(8, v0 - 4, w - 8, v0 - 3, MARCO_ALU[0])
    for u, tinta in ((16, (84, 116, 168)), (30, ROJO[1]), (44, (84, 140, 100))):
        pl.q(u, v0 - 6, u + 10, v0 - 4, tinta)
    pl.q(84, v0 - 7, 100, v0 - 4, (70, 72, 82))


def _espejo(pl, n):
    w, v0, h = 30, 70, 46
    marco_rect(pl, -3, v0 - 3, w + 3, v0 + h + 3, MARCO_ALU)
    pl.q(0, v0, w, v0 + h, (150, 178, 186))
    pl.q(0, v0, w, v0 + 14, (128, 158, 170))
    escalones(pl, 4, v0 + 6, 5, 4, 7, 4, (198, 218, 222))
    escalones(pl, 12, v0 + 6, 4, 4, 7, 2, (176, 200, 206))


def _senal(pl, n):
    w, v0, h = 32, 110, 18
    marco_rect(pl, -1, v0 - 1, w + 1, v0 + h + 1, ((226, 230, 232), (226, 230, 232), (170, 178, 186)))
    pl.q(1, v0 + 1, w - 1, v0 + h - 1, (64, 110, 162))
    pl.q(6, v0 + 8, 20, v0 + 10, (232, 236, 236))
    for k in range(5):
        pl.q(18 + k, v0 + 4 + k, 20 + k, v0 + 14 - k, (232, 236, 236))
    pl.q(4, v0 + 13, 8, v0 + 15, (150, 184, 220))


def _cruz(pl, n):
    w, v0 = 36, 96
    marco_rect(pl, 0, v0, w, v0 + w, ((240, 242, 238), (228, 230, 226), (172, 178, 176)))
    verde = (70, 150, 96)
    pl.q(13, v0 + 5, 23, v0 + 31, verde)
    pl.q(5, v0 + 13, 31, v0 + 23, verde)
    pl.q(13, v0 + 30, 23, v0 + 31, mezcla(verde, BLANCO, 0.3))
    pl.q(5, v0 + 22, 13, v0 + 23, mezcla(verde, BLANCO, 0.3))
    pl.q(23, v0 + 22, 31, v0 + 23, mezcla(verde, BLANCO, 0.3))
    pl.q(5, v0 + 13, 31, v0 + 14, osc(verde, 0.75))


def _extintor(pl, n):
    v0 = 30
    marco_rect(pl, 1, v0 + 44, 17, v0 + 58, ((240, 240, 236), ROJO[1], ROJO[2]))
    pl.q(7, v0 + 47, 11, v0 + 55, (240, 240, 236))
    pl.q(5, v0 + 53, 13, v0 + 55, (240, 240, 236))
    pl.q(1, v0 + 10, 17, v0 + 13, METAL[2])                       # abrazadera
    pl.q(4, v0, 14, v0 + 30, ROJO[1])
    pl.q(5, v0 + 30, 13, v0 + 32, ROJO[1])
    pl.q(4, v0, 6, v0 + 30, ROJO[0])
    pl.q(12, v0, 14, v0 + 30, ROJO[2])
    pl.q(4, v0, 14, v0 + 2, ROJO[2])
    pl.q(6, v0 + 14, 12, v0 + 22, PAPEL[0])
    pl.q(7, v0 + 16, 11, v0 + 17, PAPEL[2])
    pl.q(7, v0 + 19, 10, v0 + 20, PAPEL[2])
    pl.q(7, v0 + 32, 11, v0 + 36, METAL[1])
    pl.q(5, v0 + 36, 14, v0 + 38, (40, 40, 46))
    pl.q(14, v0 + 22, 16, v0 + 37, (40, 40, 46))                  # manguera
    pl.q(13, v0 + 20, 16, v0 + 22, (40, 40, 46))


def _gel(pl, n):
    v0 = 62
    blanco = ((240, 242, 240), (224, 228, 226), (176, 184, 184))
    marco_rect(pl, 0, v0 + 4, 14, v0 + 26, blanco)
    pl.q(3, v0 + 12, 11, v0 + 22, (104, 152, 198))
    pl.q(3, v0 + 20, 11, v0 + 22, (150, 190, 224))
    pl.q(5, v0 + 15, 9, v0 + 18, (232, 240, 246))
    pl.q(2, v0 + 6, 12, v0 + 9, METAL[1])
    pl.q(6, v0 + 1, 8, v0 + 4, METAL[2])
    pl.q(1, v0 - 2, 13, v0, blanco[2])


def _repisa(pl, n):
    w, v0 = 140, 82
    for u in (12, w - 16):
        pl.q(u, v0 - 8, u + 4, v0, MADERA[3])
    u = 8
    for i in range(9):                                            # libros de pie
        k = azar(i, 91)
        ancho, alto, lomo = 3 + k % 3, 16 + (k >> 4) % 7, LOMOS[(k >> 9) % len(LOMOS)]
        pl.q(u, v0 + 4, u + ancho, v0 + 4 + alto, osc(lomo, 0.8))
        pl.q(u, v0 + 4, u + ancho - 1, v0 + 4 + alto, lomo)
        pl.q(u, v0 + alto, u + ancho - 1, v0 + alto + 1, mezcla(lomo, BLANCO, 0.35))
        u += ancho
    marco_rect(pl, 56, v0 + 4, 82, v0 + 32, (MADERA[0], MADERA[1], MADERA[3]))     # retrato
    pl.q(59, v0 + 7, 79, v0 + 29, PAPEL[0])
    pl.q(61, v0 + 9, 77, v0 + 27, (176, 196, 190))
    for k, (a, b) in enumerate(((62, 76), (64, 74), (66, 72), (68, 70))):
        pl.q(a, v0 + 9 + k * 3, b, v0 + 12 + k * 3, (96, 130, 104))
    pl.q(72, v0 + 21, 76, v0 + 25, (206, 170, 130))
    for k, (a, b, lomo) in enumerate(((96, 130, LOMOS[1]), (98, 126, LOMOS[5]), (97, 128, LOMOS[6]), (100, 124, LOMOS[0]))):   # libros acostados
        pl.q(a, v0 + 4 + k * 4, b, v0 + 8 + k * 4, lomo)
        pl.q(a, v0 + 7 + k * 4, b, v0 + 8 + k * 4, mezcla(lomo, BLANCO, 0.3))
        pl.q(b - 2, v0 + 4 + k * 4, b, v0 + 8 + k * 4, PAPEL[0])
    pl.q(0, v0, w, v0 + 4, MADERA[1])
    pl.q(0, v0 + 3, w, v0 + 4, MADERA[0])
    pl.q(0, v0, w, v0 + 1, MADERA[3])


# ── lámparas ───────────────────────────────────────────────────────────────────

def _tubo(pl, n):
    w, v0 = 88, 132
    for u in (10, w - 14):
        pl.q(u, v0 + 6, u + 4, v0 + 14, METAL[2])
    pl.q(0, v0 + 3, w, v0 + 8, METAL[0])
    pl.q(0, v0 + 7, w, v0 + 8, BLANCO)
    pl.q(0, v0 + 3, w, v0 + 4, METAL[2])
    pl.q(3, v0, w - 3, v0 + 3, (244, 250, 250) if n else (206, 212, 212))
    pl.q(3, v0, w - 3, v0 + 1, (214, 232, 240) if n else (176, 182, 184))
    pl.q(0, v0, 3, v0 + 3, METAL[3])
    pl.q(w - 3, v0, w, v0 + 3, METAL[3])


def _colgante(pl, n):
    w, v0 = 34, 94
    pantalla = ((120, 150, 146), (92, 122, 120), (66, 90, 92))
    pl.q(16, v0 + 16, 18, v0 + 52, (44, 40, 40))
    pl.q(12, v0 + 50, 22, v0 + 52, METAL[2])
    for k, medio in enumerate((17, 15, 13, 11, 9, 7)):
        pl.q(17 - medio, v0 + 4 + k * 2, 17 + medio, v0 + 6 + k * 2, pantalla[1])
        pl.q(17 - medio, v0 + 4 + k * 2, 17 - medio + 3, v0 + 6 + k * 2, pantalla[0])
    pl.q(0, v0 + 2, w, v0 + 4, pantalla[2])
    pl.q(12, v0 - 2, 22, v0 + 2, FOCO[n])
    pl.q(14, v0 - 3, 20, v0 - 2, FOCO[n])


def _pie(n):
    im = Image.new('RGBA', (22, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    p = PANTALLA if n else (osc(PANTALLA[0], 0.9), osc(PANTALLA[1], 0.9), PANTALLA[2])
    d.polygon([(6, 2), (15, 2), (19, 17), (2, 17)], fill=p[1] + (255,))
    d.polygon([(6, 2), (10, 2), (8, 17), (2, 17)], fill=p[0] + (255,))
    d.rectangle([2, 15, 19, 17], fill=p[2] + (255,))
    d.rectangle([9, 18, 12, 19], fill=FOCO[n] + (255,))
    d.rectangle([10, 20, 11, 57], fill=METAL[2] + (255,))
    d.rectangle([10, 20, 10, 57], fill=METAL[1] + (255,))
    d.ellipse([4, 56, 17, 62], fill=METAL[2] + (255,))
    d.ellipse([5, 56, 16, 60], fill=METAL[1] + (255,))
    return im, (11, 61)


def _mesa(n):
    im = Image.new('RGBA', (18, 26), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    p = PANTALLA if n else (osc(PANTALLA[0], 0.9), osc(PANTALLA[1], 0.9), PANTALLA[2])
    d.polygon([(5, 1), (12, 1), (16, 12), (1, 12)], fill=p[1] + (255,))
    d.polygon([(5, 1), (8, 1), (6, 12), (1, 12)], fill=p[0] + (255,))
    d.rectangle([1, 11, 16, 12], fill=p[2] + (255,))
    d.rectangle([7, 13, 10, 14], fill=FOCO[n] + (255,))
    d.rectangle([8, 15, 9, 20], fill=(92, 122, 120, 255))
    d.rectangle([5, 21, 12, 24], fill=(66, 90, 92, 255))
    d.rectangle([5, 21, 12, 21], fill=(120, 150, 146, 255))
    return im, (9, 24)


# ── catálogo ───────────────────────────────────────────────────────────────────

TRES = ('fondo', 'izquierda', 'derecha')


def _ficha(nombre, ancho, ocupa, dibujar, cuadros=1, muros=TRES, colores=24, margen=16, **extra):
    return dict(nombre=nombre, ancho=ancho, ocupa=ocupa, dibujar=dibujar, cuadros=cuadros, muros=muros, colores=colores,
                margen=margen, **extra)


PIEZAS = {
    ('ventana', 'corrediza'): _ficha('Ventana corrediza', 96, 128, _corrediza, 2, colores=32, antepecho=70, alto=60,
                                     luz=dict(forma='haz', ancho=96, momento='dia', tono='calido', parteluces=dict(verticales=[512], horizontales=[512]))),
    ('ventana', 'persiana'): _ficha('Ventana con persiana', 88, 104, _persiana, 2, colores=32, antepecho=70, alto=60,
                                    luz=dict(forma='haz', ancho=88, momento='dia', tono='calido', fuerza=60, parteluces=dict(verticales=[512], lamas=[410, 1024, 8]))),
    ('ventana', 'alta'): _ficha('Ventana alta de hospital', 120, 136, _alta, 2, colores=32, antepecho=100, alto=32,
                                luz=dict(forma='haz', ancho=120, momento='dia', tono='calido', fuerza=70, parteluces=dict(verticales=[341, 683]))),
    ('ventana', 'ventanal'): _ficha('Ventanal', 168, 184, _ventanal, 2, colores=32, antepecho=42, alto=88,
                                    luz=dict(forma='haz', ancho=168, momento='dia', tono='calido', parteluces=dict(verticales=[244, 500, 756], horizontales=[652]))),
    ('cuadro', 'cuadro'): _ficha('Cuadro', 40, 56, _cuadro),
    ('reloj', 'reloj'): _ficha('Reloj con segundero', 26, 32, _reloj, 12, fps=1),
    ('cartelera', 'cartelera'): _ficha('Cartelera', 72, 80, _cartelera),
    ('tablero', 'tablero'): _ficha('Tablero', 120, 128, _tablero),
    ('espejo', 'espejo'): _ficha('Espejo', 30, 40, _espejo),
    ('senal', 'senal'): _ficha('Señal', 32, 40, _senal),
    ('cruz', 'cruz'): _ficha('Cruz verde', 36, 40, _cruz),
    ('extintor', 'extintor'): _ficha('Extintor', 18, 24, _extintor),
    ('gel', 'gel'): _ficha('Dispensador de gel', 14, 24, _gel),
    ('repisa', 'repisa'): _ficha('Repisa con libros', 140, 144, _repisa),
    ('lampara', 'tubo'): _ficha('Tubo de techo', 88, 96, _tubo, 2,
                                luz=dict(forma='tubo', radio=[250, 120], momento='noche', tono='frio')),
    ('lampara', 'colgante'): _ficha('Lámpara colgante', 34, 40, _colgante, 2,
                                    luz=dict(forma='pozo', radio=[150, 58], altura=150, momento='noche', tono='calido')),
    ('lampara', 'pie'): _ficha('Lámpara de pie', 22, 24, _pie, 2, muros=('suelo',),
                               luz=dict(forma='pozo', radio=[124, 48], altura=58, momento='noche', tono='calido')),
    ('lampara', 'mesa'): _ficha('Lámpara de mesa', 18, 24, _mesa, 2, muros=('suelo',),
                                luz=dict(forma='pozo', radio=[92, 38], altura=24, momento='noche', tono='calido')),
}


@functools.lru_cache(maxsize=None)
def _cuadros(tipo, modelo, vista, ancho_sala):
    if (tipo, modelo) not in PIEZAS:
        raise KeyError(f'pieza {tipo}/{modelo} fuera del catálogo')
    F = PIEZAS[(tipo, modelo)]
    w = F['ancho']
    crudos = []
    for n in range(F['cuadros']):
        if 'suelo' in F['muros']:
            crudos.append(F['dibujar'](n))
            continue
        if vista == 'frente':
            im = Image.new('RGBA', (w + 80, 240), (0, 0, 0, 0))
            F['dibujar'](g.Frente(ImageDraw.Draw(im), 40, 200), n)
            crudos.append((im, (40 + w // 2, 200)))
        elif vista == 'lado':
            im = Image.new('RGBA', (w + 160, w + 300), (0, 0, 0, 0))
            pl = g.Lado(ImageDraw.Draw(im), w + 90, 220, g.comprobar_ancho(ancho_sala), w)
            F['dibujar'](pl, n)
            crudos.append((im, pl.punto_suelo(w / 2, 0)))
        else:
            raise KeyError(f'vista {vista!r} desconocida')
    partes = [g.mapa_de_brillo(g.terminar(im, 256), BRILLOS) for im, _ in crudos]
    listos, punto, mapas = g.recortar_con([c for c, _ in partes], crudos[0][1], [m for _, m in partes])
    emisivos = g.recortar_con([c for c, _ in partes], crudos[0][1], [g.mapa_emisivo(c, EMISIVOS) for c, _ in partes])[2]
    limitada = g.terminar(g.tira(listos), F['colores'], contorno=False)
    ancho = listos[0].width
    return tuple(limitada.crop((n * ancho, 0, n * ancho + ancho, limitada.height)) for n in range(len(listos))), punto, tuple(mapas), tuple(emisivos)


def _clave(tipo, modelo, vista, ancho_sala):
    suelo = 'suelo' in PIEZAS[(tipo, modelo)]['muros'] if (tipo, modelo) in PIEZAS else False
    return tipo, modelo, ('suelo' if suelo else vista), (ancho_sala if (vista == 'lado' and not suelo) else 960)


def cuadros(tipo, modelo, vista='frente', ancho_sala=960):
    return list(_cuadros(*_clave(tipo, modelo, vista, ancho_sala))[0])


def apoyo(tipo, modelo, vista='frente', ancho_sala=960):
    return _cuadros(*_clave(tipo, modelo, vista, ancho_sala))[1]


def brillo(tipo, modelo, vista='frente', ancho_sala=960):
    """Los mapas de brillo de cada cuadro, o None si la pieza no tiene nada que brille."""
    mapas = _cuadros(*_clave(tipo, modelo, vista, ancho_sala))[2]
    return list(mapas) if any(m.getbbox() for m in mapas) else None


def emisivo(tipo, modelo, vista='frente', ancho_sala=960):
    """Las máscaras de lo que emite luz propia en cada cuadro (va encima de la luz, sin multiplicar), o None."""
    mapas = _cuadros(*_clave(tipo, modelo, vista, ancho_sala))[3]
    return list(mapas) if any(m.getbbox() for m in mapas) else None


def hoja(tipo, modelo, vista='frente', ancho_sala=960):
    return g.tira(cuadros(tipo, modelo, vista, ancho_sala))


def cuadro_de(tipo, modelo, momento, vista='frente', ancho_sala=960, encendida=None):
    """El cuadro que corresponde al momento: la ventana cambia de cielo y la lámpara se enciende de noche."""
    lista = cuadros(tipo, modelo, vista, ancho_sala)
    if tipo == 'ventana':
        return lista[1 if momento == 'noche' else 0]
    if tipo == 'lampara':
        return lista[1 if (momento == 'noche' if encendida is None else encendida) else 0]
    return lista[0]


def hoja_de_contacto(factor=2):
    """Todas las piezas de frente sobre un muro de muestra (ventanas y lámparas, con sus dos estados) y de lado."""
    pared, papel, tinta = (130, 110, 82), (24, 26, 34), (206, 200, 188)
    celdas = []
    for (tipo, modelo), F in PIEZAS.items():
        suelo = 'suelo' in F['muros']
        lista = cuadros(tipo, modelo)[:2 if F['cuadros'] <= 2 else 3]
        ax, ay = apoyo(tipo, modelo)
        for c in lista:
            w = c.width + 20
            im = Image.new('RGBA', (w, 176), pared + (255,))
            d = ImageDraw.Draw(im)
            d.rectangle([0, 152, w, 176], fill=(160, 118, 82))
            d.rectangle([0, 145, w, 151], fill=(70, 50, 38))
            im.alpha_composite(c, (w // 2 - ax, (166 if suelo else 152) - ay))
            celdas.append((F['nombre'], im))
        if not suelo:
            c = cuadros(tipo, modelo, 'lado', 1440)[0]
            im = Image.new('RGBA', (c.width + 16, 176), (110, 92, 68, 255))
            im.alpha_composite(c, (8, max(0, 170 - c.height)))
            celdas.append(('', im))
    ancho, x, y, filas = 1560, 8, 8, [[]]
    for nombre, im in celdas:
        if x + im.width + 6 > ancho:
            x, y = 8, y + 206
        filas[-1].append((nombre, im, x, y))
        x += im.width + 6
    lienzo = Image.new('RGB', (ancho, y + 206), papel)
    d = ImageDraw.Draw(lienzo)
    ultimo = None
    for nombre, im, x, y in filas[0]:
        if nombre and nombre != ultimo:
            d.text((x, y + 4), nombre[:max(6, im.width // 6)], fill=tinta)
            ultimo = nombre
        lienzo.paste(im.convert('RGB'), (x, y + 22))
    return lienzo.resize((lienzo.width * factor, lienzo.height * factor), Image.Resampling.NEAREST) if factor != 1 else lienzo


if __name__ == '__main__':
    destino = os.path.join(RAIZ, 'maqueta-visual', 'piezas')
    os.makedirs(destino, exist_ok=True)
    hoja_de_contacto(1).save(os.path.join(destino, 'catalogo.png'))
    for clave in PIEZAS:
        print(clave, hoja(*clave).size, apoyo(*clave))
