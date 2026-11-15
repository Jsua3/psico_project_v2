"""Puertas de las «salas por piezas»: 7 modelos, 3 vistas y 4 cuadros de apertura.

Cada puerta se dibuja una sola vez en el plano de su muro y un proyector de `piezas_geo` la lleva a la
vista de frente (muro del fondo) o a la lateral en tres cuartos (el muro derecho es el espejo del
izquierdo). El fragmento del lado de la cámara se dibuja aparte: jambas cortadas, umbral, la hoja vista
desde arriba girando como en un plano, y un tapete con la flecha de salida.

    hoja(modelo, vista, ancho_sala=960)   -> tira RGBA de 4 cuadros
    apoyo(modelo, vista, ancho_sala=960)  -> (x, y) del punto de apoyo dentro de un cuadro
    python tools/escenarios/piezas_puertas.py   # escribe maqueta-visual/piezas/puertas.png

Punto de apoyo: de frente, el centro del vano sobre la línea del piso; de lado, el centro del vano sobre
la unión del muro con el piso; del lado de la cámara, el centro del vano en el borde inferior de la sala.
"""
import functools
import math
import os
import sys

from PIL import Image, ImageDraw, ImageOps

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import piezas_geo as g  # noqa: E402

CUADROS = 4
MAX_COLORES = 32
VISTAS = ('frente', 'lado', 'camara')
ANGULOS = (0, 35, 65, 90)       # giro de la hoja en el fragmento del lado de la cámara

# Tonos: luz, base, sombra, hondo (y veta o tablero en quinto lugar).
MARCO_MADERA = ((112, 80, 58), (84, 58, 44), (60, 42, 34), (44, 30, 26))
MARCO_ACERO = ((122, 130, 144), (90, 98, 112), (64, 70, 84), (46, 50, 62))
MARCO_ALUMINIO = ((190, 196, 200), (150, 158, 168), (110, 118, 130), (76, 82, 94))
MARCO_YESO = ((182, 174, 160), (154, 146, 134), (120, 112, 104), (90, 84, 80))
MADERA = ((170, 124, 86), (140, 100, 70), (112, 78, 56), (86, 58, 44), (126, 90, 62))
MADERA_ROJA = ((160, 108, 80), (130, 86, 64), (102, 66, 50), (78, 50, 40), (116, 76, 58))
ACERO = ((144, 156, 172), (112, 124, 142), (84, 94, 110), (60, 68, 82), (100, 110, 128))
SALUD = ((146, 176, 168), (114, 146, 142), (86, 114, 116), (62, 84, 90), (102, 132, 130))
INOX = ((208, 212, 214), (172, 178, 184), (130, 138, 148), (92, 98, 110))
VIDRIO = ((192, 214, 220), (142, 172, 186), (104, 136, 154), (76, 104, 124))
VANO = ((78, 72, 72), (56, 52, 58), (36, 38, 50), (18, 20, 28), (10, 11, 17))
GOMA = (38, 40, 46)
TAPETE = ((66, 58, 60), (44, 38, 42), (208, 202, 188))      # campo, borde, flecha
VETAS = ((5, 12, 58, 0), (10, 34, 88, 0), (16, 4, 42, 0), (21, 52, 90, 1), (26, 14, 72, 0), (32, 38, 86, 0),
         (37, 6, 32, 0), (41, 60, 90, 0), (13, 64, 84, 1), (29, 8, 28, 1), (35, 44, 58, 1))


# Lo que brilla en una puerta: el reflejo del vidrio (que en el dibujo queda apagado) y los filos de metal y de barniz.
BRILLOS = {VIDRIO[0]: ('vidrio', VIDRIO[1]), INOX[0]: ('metal', None), MARCO_ALUMINIO[0]: ('metal', None), MARCO_ACERO[0]: ('metal', None),
           ACERO[0]: ('metal', None), MADERA[0]: ('barniz', None), MADERA_ROJA[0]: ('barniz', None), MARCO_MADERA[0]: ('barniz', None)}


class Hoja:
    """Hoja que gira hacia la otra sala. Coordenadas locales: `a` de la bisagra al canto libre, v desde el piso.
    Al abrirse se estrecha, su canto libre sube (se aleja) y se oscurece."""
    FACTOR = (1.0, 0.80, 0.50, 0.16)
    TONO = (1.0, 1.0, 0.86, 0.74)

    def __init__(self, pl, bisagra, sentido, ancho, alto, f):
        self.pl, self.b, self.s, self.ancho, self.alto = pl, bisagra, sentido, ancho, alto
        self.fac, self.sube, self.k = self.FACTOR[f], pl.sube[f], self.TONO[f]

    def q(self, a0, v0, a1, v1, c):
        ua, ub = self.b + self.s * a0 * self.fac, self.b + self.s * a1 * self.fac
        da, db = self.sube * a0 / self.ancho, self.sube * a1 / self.ancho
        if ua > ub:
            ua, ub, da, db = ub, ua, db, da
        tope = self.alto
        self.pl.quad(ua, v0 + da, min(v1 + da, tope), ub, v0 + db, min(v1 + db, tope), tuple(int(x * self.k) for x in c))

    def canto(self, c):
        """El grosor de la hoja, que se ve en el canto libre cuando está abierta."""
        if self.fac < 1:
            uf = self.b + self.s * self.ancho * self.fac
            a, b = (uf, uf + 2) if self.s > 0 else (uf - 2, uf)
            self.pl.quad(a, self.sube, self.alto, b, self.sube, self.alto, c)


# ── partes comunes ─────────────────────────────────────────────────────────────

def vano(pl, u0, u1, alto, rico=False):
    """Lo que se ve por la puerta abierta: la otra sala a oscuras, con su piso asomando en el umbral."""
    pl.q(u0, 0, u1, alto, VANO[3])
    if rico:
        pl.q(u0, 16, u1, 60, VANO[2])
        pl.q(u0, 16, u1, 19, VANO[3])
    pl.q(u0, 0, u1, 16 if rico else 10, VANO[1])
    pl.q(u0, 0, u1, 5, VANO[0])
    pl.q(u0, alto - 6, u1, alto, VANO[4])
    pl.q(u0, 0, u0 + 3, alto, VANO[4])


def marco(pl, w, alto, c, m, plinto=True, cornisa=True, cabeza=None):
    """Marco con bisel, dintel con cornisa y plintos que reciben el zócalo del muro."""
    cabeza = c if cabeza is None else cabeza
    for a, b in ((0, c), (w - c, w)):
        pl.q(a, 0, b, alto + cabeza, m[1])
        pl.q(a, 0, a + 1, alto + cabeza, m[0])
        pl.q(b - 1, 0, b, alto + cabeza, m[2])
    pl.q(0, alto, w, alto + cabeza, m[1])
    pl.q(c - 1, alto, w - c + 1, alto + 1, m[3])
    pl.q(0, alto + cabeza - 1, w, alto + cabeza, m[0])
    pl.q(0, 0, 1, alto + cabeza, m[0])
    pl.q(w - 1, 0, w, alto + cabeza, m[2])
    if cornisa:
        pl.q(-2, alto + cabeza, w + 2, alto + cabeza + 2, m[0])
        pl.q(-2, alto + cabeza, w + 2, alto + cabeza + 1, m[2])
    if plinto:
        for a, b in ((-1, c + 1), (w - c - 1, w + 1)):
            pl.q(a, 0, b, 10, m[2])
            pl.q(a, 9, b, 10, m[0])
            pl.q(a, 0, b, 1, m[3])


def umbral(pl, a, b, m=INOX, fondo=3):
    pl.suelo(a, b, 0, fondo, m[2])
    pl.suelo(a, b, 0, 1, m[0])


def bisel(h, t):
    h.q(0, 0, 1, h.alto, t[0])
    h.q(0, h.alto - 1, h.ancho, h.alto, t[0])
    h.q(h.ancho - 1, 0, h.ancho, h.alto, t[2])
    h.q(0, 0, h.ancho, 1, t[3])


def tablero(h, a0, v0, a1, v1, t):
    """Tablero hundido: sombra arriba y a la izquierda, luz abajo y a la derecha."""
    h.q(a0, v0, a1, v1, t[4])
    h.q(a0, v1 - 1, a1, v1, t[3])
    h.q(a0, v0, a0 + 1, v1, t[3])
    h.q(a0, v0, a1, v0 + 1, t[0])
    h.q(a1 - 1, v0, a1, v1, t[0])


def manija(h, a, v):
    h.q(a - 1, v - 6, a + 3, v + 7, INOX[2])
    h.q(a - 1, v + 6, a + 3, v + 7, INOX[0])
    h.q(a - 7, v, a + 3, v + 2, INOX[0])
    h.q(a - 7, v - 1, a + 3, v, INOX[3])


def reflejo(pintar, a0, v0, pasos, da, dv, ancho, c):
    """Reflejo en diagonal hecho de escalones: sin degradado."""
    for i in range(pasos):
        pintar(a0 + i * da, v0 + i * dv, a0 + i * da + ancho, v0 + (i + 1) * dv, c)


def lunares(pintar, a0, a1, v, c=INOX[0]):
    """Banda de seguridad del vidrio: cuadritos a la altura de los ojos."""
    for a in range(a0, a1 - 2, 6):
        pintar(a, v, a + 3, v + 2, c)


# ── hojas ──────────────────────────────────────────────────────────────────────

def hoja_madera(h, t, ventanilla):
    alto, w = h.alto, h.ancho
    h.q(0, 0, w, alto, t[1])
    for a, v0, v1, clara in VETAS:
        h.q(a, v0, a + 1, v1, t[0] if clara else t[4])
    if ventanilla:
        tablero(h, 7, 8, w - 7, 40, t)
        h.q(12, 47, 34, 85, t[3])
        h.q(13, 48, 33, 84, t[2])
        h.q(15, 50, 31, 82, VIDRIO[2])
        h.q(15, 50, 31, 62, VIDRIO[3])
        reflejo(h.q, 17, 58, 4, 3, 6, 3, VIDRIO[0])
        h.q(15, 81, 31, 82, VIDRIO[3])
    else:
        h.q(28, 72, 31, 73, t[3])
        h.q(12, 22, 14, 23, t[3])
    bisel(h, t)
    manija(h, w - 9, 44)
    h.canto(t[0])


def hoja_vidrio(h, m):
    alto, w = h.alto, h.ancho
    h.q(0, 0, w, alto, m[1])
    h.q(4, 12, w - 4, alto - 4, VIDRIO[2])
    h.q(4, 12, w - 4, 36, VIDRIO[3])
    reflejo(h.q, 8, 46, 5, 4, 8, 4, VIDRIO[0])
    reflejo(h.q, 17, 50, 4, 4, 8, 2, VIDRIO[1])
    lunares(h.q, 7, w - 6, 62)
    h.q(4, 40, w - 4, 43, m[0])
    h.q(4, 39, w - 4, 40, m[3])
    h.q(4, 11, w - 4, 12, m[0])
    bisel(h, m)
    h.canto(m[0])


def hoja_urgencias(h, t):
    alto, w = h.alto, h.ancho
    h.q(0, 0, w, alto, t[1])
    bisel(h, t)
    h.q(10, 53, 28, 81, t[3])
    h.q(9, 55, 29, 79, t[3])
    h.q(11, 55, 27, 79, VIDRIO[2])
    h.q(12, 54, 26, 80, VIDRIO[2])
    h.q(12, 55, 26, 64, VIDRIO[3])
    reflejo(h.q, 14, 60, 3, 3, 6, 3, VIDRIO[0])
    h.q(w - 10, 34, w - 3, 52, INOX[1])
    h.q(w - 10, 51, w - 3, 52, INOX[0])
    h.q(w - 10, 34, w - 3, 35, INOX[3])
    h.q(0, 0, w, 17, INOX[1])
    h.q(0, 16, w, 17, INOX[0])
    h.q(0, 0, w, 2, INOX[3])
    h.q(3, 12, 5, 14, INOX[3])
    h.q(w - 6, 12, w - 4, 14, INOX[3])
    h.q(w - 1, 0, w, alto, GOMA)
    h.canto(t[0])


def hoja_metalica(h, t):
    alto, w = h.alto, h.ancho
    h.q(0, 0, w, alto, t[1])
    tablero(h, 6, 52, w - 6, 86, t)
    tablero(h, 6, 24, w - 13, 46, t)
    h.q(8, 6, w - 8, 19, t[3])
    for k in range(4):
        h.q(9, 7 + k * 3, w - 9, 8 + k * 3, t[0])
    h.q(15, 66, 31, 73, (216, 214, 202))
    h.q(15, 66, 31, 67, (168, 166, 158))
    h.q(18, 69, 28, 70, (120, 122, 126))
    bisel(h, t)
    manija(h, w - 9, 40)
    h.q(w - 9, 28, w - 7, 31, t[3])
    for v in (10, 44, 78):
        h.q(0, v, 2, v + 7, INOX[1])
        h.q(0, v + 6, 2, v + 7, INOX[0])
    h.canto(t[0])


def panel_vidrio(pl, u0, u1, alto, m):
    """Paño de vidrio con marco de aluminio (fijo o corredizo)."""
    pl.q(u0, 0, u1, alto, m[1])
    pl.q(u0 + 3, 10, u1 - 3, alto - 3, VIDRIO[2])
    pl.q(u0 + 3, 10, u1 - 3, 34, VIDRIO[3])
    reflejo(pl.q, u0 + 6, 46, 4, 4, 9, 3, VIDRIO[0])
    lunares(pl.q, u0 + 6, u1 - 5, 40)
    pl.q(u0, 0, u0 + 1, alto, m[0])
    pl.q(u1 - 1, 0, u1, alto, m[2])
    pl.q(u0 + 3, 9, u1 - 3, 10, m[0])


# ── modelos ────────────────────────────────────────────────────────────────────

def _batiente(pl, f, M):
    w, alto, c = M['ancho'], M['alto'], M['marco']
    if f:
        vano(pl, c, w - c, alto, rico=True)
    M['pintar'](Hoja(pl, c, 1, w - 2 * c, alto, f))
    marco(pl, w, alto, c, M['tono_marco'], plinto=M.get('plinto', True), cornisa=M.get('cornisa', True))
    umbral(pl, c - 1, w - c + 1, M.get('umbral', INOX))


def _doble(pl, f, M):
    w, alto, c = M['ancho'], M['alto'], M['marco']
    medio = w // 2
    if f:
        vano(pl, c, w - c, alto, rico=True)
    else:
        pl.q(medio - 1, 0, medio + 1, alto, GOMA)
    M['pintar'](Hoja(pl, c, 1, medio - c, alto, f))
    M['pintar'](Hoja(pl, w - c, -1, medio - c, alto, f))
    marco(pl, w, alto, c, M['tono_marco'], plinto=False, cornisa=False, cabeza=7)
    pl.q(c, alto + 2, w - c, alto + 4, M['tono_marco'][3])
    umbral(pl, c - 1, w - c + 1)


def _corrediza(pl, f, M):
    w, alto, c = M['ancho'], M['alto'], M['marco']
    m, medio, corre = M['tono_marco'], w // 2, (0, 9, 19, 28)[f]
    if f:
        vano(pl, 32, w - 32, alto, rico=True)
    panel_vidrio(pl, 32 - corre, medio - corre, alto, m)
    panel_vidrio(pl, medio + corre, w - 32 + corre, alto, m)
    panel_vidrio(pl, c, 32, alto, m)
    panel_vidrio(pl, w - 32, w - c, alto, m)
    marco(pl, w, alto, c, m, plinto=False, cornisa=False, cabeza=12)
    pl.q(1, alto + 2, w - 1, alto + 10, m[2])
    pl.q(1, alto + 9, w - 1, alto + 10, m[3])
    pl.q(medio - 5, alto + 3, medio + 5, alto + 8, (30, 32, 40))
    pl.q(medio - 1, alto + 5, medio + 1, alto + 6, (104, 204, 136))
    pl.suelo(c, w - c, 0, 2, INOX[3])
    pl.suelo(c, w - c, 0, 1, INOX[1])


def _paso(pl, f, M):
    w, alto, c = M['ancho'], M['alto'], M['marco']
    vano(pl, c, w - c, alto, rico=True)
    marco(pl, w, alto, c, M['tono_marco'], plinto=False, cornisa=False)
    pl.suelo(c, w - c, 0, 2, MARCO_YESO[2])


MODELOS = {
    'madera': dict(nombre='Madera lisa', ancho=56, alto=92, marco=5, ocupa=64, hojas='una', dibujar=_batiente,
                   pintar=lambda h: hoja_madera(h, MADERA, False), tono_marco=MARCO_MADERA, tono_hoja=MADERA,
                   umbral=(MADERA[1], MADERA[2], MADERA[3])),
    'madera-ventanilla': dict(nombre='Madera con ventanilla', ancho=56, alto=92, marco=5, ocupa=64, hojas='una',
                              dibujar=_batiente, pintar=lambda h: hoja_madera(h, MADERA_ROJA, True),
                              tono_marco=MARCO_MADERA, tono_hoja=MADERA_ROJA, umbral=(MADERA[1], MADERA[2], MADERA[3])),
    'vidrio': dict(nombre='Vidrio', ancho=56, alto=92, marco=5, ocupa=64, hojas='una', dibujar=_batiente,
                   pintar=lambda h: hoja_vidrio(h, MARCO_ALUMINIO), tono_marco=MARCO_ACERO, tono_hoja=MARCO_ALUMINIO,
                   plinto=False, cornisa=False),
    'corrediza': dict(nombre='Corrediza automática de vidrio', ancho=136, alto=96, marco=4, ocupa=144, hojas='corrediza',
                      dibujar=_corrediza, tono_marco=MARCO_ALUMINIO, tono_hoja=MARCO_ALUMINIO),
    'urgencias': dict(nombre='Doble batiente de urgencias', ancho=86, alto=94, marco=5, ocupa=96, hojas='doble',
                      dibujar=_doble, pintar=lambda h: hoja_urgencias(h, SALUD), tono_marco=MARCO_ACERO, tono_hoja=SALUD),
    'metalica': dict(nombre='Metálica institucional', ancho=58, alto=92, marco=6, ocupa=64, hojas='una', dibujar=_batiente,
                     pintar=lambda h: hoja_metalica(h, ACERO), tono_marco=MARCO_ACERO, tono_hoja=ACERO,
                     plinto=False, cornisa=False),
    'paso': dict(nombre='Paso abierto', ancho=72, alto=96, marco=6, ocupa=80, hojas='ninguna', dibujar=_paso,
                 tono_marco=MARCO_YESO, tono_hoja=MARCO_YESO),
}


# ── vistas ─────────────────────────────────────────────────────────────────────

def _lienzo(w, h):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def _frente(modelo, f):
    M = MODELOS[modelo]
    im, d = _lienzo(M['ancho'] + 80, M['alto'] + 80)
    M['dibujar'](g.Frente(d, 40, M['alto'] + 40), f, M)
    return im, (40 + M['ancho'] // 2, M['alto'] + 40)


def _chevrones_suelo(d, punto, u, dist, c):
    """Dos flechas sobre el piso que señalan el muro (dist decrece hacia él)."""
    for k in (0, 1):
        x = dist - k * 9
        pts = [(x + 3, -8), (x - 4, 0), (x + 3, 8), (x - 1, 8), (x - 8, 0), (x - 1, -8)]
        d.polygon([punto(u + du, dd) for dd, du in pts], fill=g._t(c))


def _lado(modelo, f, ancho_sala):
    M = MODELOS[modelo]
    w = M['ancho']
    im, d = _lienzo(w + 160, w + M['alto'] + 120)
    pl = g.Lado(d, w + 60, M['alto'] + 70, ancho_sala, w)
    # Tapete con flechas: el muro lateral se ve de canto y el piso es lo que dice «por aquí se sale».
    pl.suelo(5, w - 5, 4, 38, TAPETE[1])
    pl.suelo(7, w - 7, 6, 36, TAPETE[0])
    _chevrones_suelo(d, pl.punto_suelo, w / 2, 26, TAPETE[2])
    M['dibujar'](pl, f, M)
    return im, pl.punto_suelo(w / 2, 0)


def _hoja_camara(d, hx, yt, largo, sentido, angulo, claro, base, alto=9):
    r = math.radians(angulo)
    ex, ey = int(round(hx + sentido * largo * math.cos(r))), int(round(yt - largo * math.sin(r) * 0.62))
    d.polygon([(hx, yt + 2), (ex, ey + 2), (ex, ey + 2 + alto), (hx, yt + 2 + alto)], fill=g._t(base))
    if abs(ex - hx) < 3:
        d.rectangle([hx - 1, ey + 2, hx + 1, yt + 2 + alto], fill=g._t(base))
    d.line([(hx, yt), (ex, ey)], fill=g._t(claro), width=3)


def _camara(modelo, f):
    M = MODELOS[modelo]
    w, c, m, t = M['ancho'], M['marco'], M['tono_marco'], M['tono_hoja']
    im, d = _lienzo(w + 80, 96)
    cx, piso = (w + 80) // 2, 96
    a, b, yt = cx - w // 2, cx + w // 2, piso - 14
    d.polygon([(a - 3, piso - 40), (b + 2, piso - 40), (b + 8, piso - 1), (a - 9, piso - 1)], fill=g._t(TAPETE[1]))
    d.polygon([(a, piso - 37), (b - 1, piso - 37), (b + 4, piso - 1), (a - 5, piso - 1)], fill=g._t(TAPETE[0]))
    for k in (0, 1):
        y = piso - 31 + k * 9
        d.polygon([(cx - 9, y - 3), (cx, y + 4), (cx + 9, y - 3), (cx + 9, y + 1), (cx, y + 8), (cx - 9, y + 1)], fill=g._t(TAPETE[2]))
    d.rectangle([a + c, piso - 3, b - c - 1, piso - 1], fill=g._t(INOX[2]))
    d.line([(a + c, piso - 3), (b - c - 1, piso - 3)], fill=g._t(INOX[0]))
    hojas = M['hojas']
    if hojas == 'una':
        _hoja_camara(d, a + c, yt, w - 2 * c, 1, ANGULOS[f], t[0], t[1])
    elif hojas == 'doble':
        _hoja_camara(d, a + c, yt, w // 2 - c, 1, ANGULOS[f], t[0], t[1])
        _hoja_camara(d, b - c - 1, yt, w // 2 - c, -1, ANGULOS[f], t[0], t[1])
    elif hojas == 'corrediza':
        corre = (0, 9, 19, 28)[f]
        for x0, x1, y in ((cx - 36 - corre, cx - corre, yt - 3), (cx + corre, cx + 36 + corre, yt - 3),
                          (a + c, a + 32, yt), (b - 32, b - c, yt)):
            d.rectangle([x0, y + 2, x1 - 1, y + 11], fill=g._t(VIDRIO[2]))
            d.rectangle([x0, y, x1 - 1, y + 1], fill=g._t(VIDRIO[0]))
            d.rectangle([x0, y, x0 + 1, y + 11], fill=g._t(t[1]))
            d.rectangle([x1 - 2, y, x1 - 1, y + 11], fill=g._t(t[1]))
    for x in (a, b - c):
        d.rectangle([x, piso - 11, x + c - 1, piso - 1], fill=g._t(m[2]))
        d.rectangle([x, piso - 14, x + c - 1, piso - 12], fill=g._t(m[0]))
    return im, (cx, piso)


@functools.lru_cache(maxsize=None)
def _cuadros(modelo, vista, ancho_sala):
    if modelo not in MODELOS:
        raise KeyError(f'puerta {modelo!r} fuera del catálogo')
    if vista == 'frente':
        crudos = [_frente(modelo, f) for f in range(CUADROS)]
    elif vista == 'lado':
        crudos = [_lado(modelo, f, g.comprobar_ancho(ancho_sala)) for f in range(CUADROS)]
    elif vista == 'camara':
        crudos = [_camara(modelo, f) for f in range(CUADROS)]
    else:
        raise KeyError(f'vista {vista!r} desconocida')
    partes = [g.mapa_de_brillo(g.terminar(im, 256), BRILLOS) for im, _ in crudos]
    listos, punto, mapas = g.recortar_con([c for c, _ in partes], crudos[0][1], [m for _, m in partes])
    limitada = g.terminar(g.tira(listos), MAX_COLORES, contorno=False)
    w = listos[0].width
    return tuple(limitada.crop((n * w, 0, n * w + w, limitada.height)) for n in range(CUADROS)), punto, tuple(mapas)


def cuadros(modelo, vista, ancho_sala=960):
    return list(_cuadros(modelo, vista, ancho_sala if vista == 'lado' else 960)[0])


def apoyo(modelo, vista, ancho_sala=960):
    return _cuadros(modelo, vista, ancho_sala if vista == 'lado' else 960)[1]


def brillo(modelo, vista, ancho_sala=960):
    """Los mapas de brillo de cada cuadro (vidrio, metal y barniz), o None si la puerta no tiene nada que brille."""
    mapas = _cuadros(modelo, vista, ancho_sala if vista == 'lado' else 960)[2]
    return list(mapas) if any(m.getbbox() for m in mapas) else None


def hoja(modelo, vista, ancho_sala=960):
    return g.tira(cuadros(modelo, vista, ancho_sala))


def espejo(cuadro, punto):
    """La misma pieza para el muro derecho: (cuadro reflejado, su punto de apoyo)."""
    return ImageOps.mirror(cuadro), (cuadro.width - punto[0], punto[1])


# ── hoja de contacto ───────────────────────────────────────────────────────────

MUESTRA = dict(pared=(130, 110, 82), lado=(110, 92, 68), baja=(124, 92, 66), moldura=(150, 116, 84), zocalo=(70, 50, 38),
               piso=(160, 118, 82), junta=(104, 70, 48), vacio=(14, 16, 22), papel=(24, 26, 34), tinta=(206, 200, 188))


def _celda_frente(cuadro, punto):
    w, h = cuadro.width + 24, 160
    im = Image.new('RGBA', (w, h), MUESTRA['pared'] + (255,))
    d = ImageDraw.Draw(im)
    base = 136
    d.rectangle([0, base - 40, w, base], fill=MUESTRA['baja'])
    d.rectangle([0, base - 43, w, base - 40], fill=MUESTRA['moldura'])
    d.rectangle([0, base - 7, w, base - 1], fill=MUESTRA['zocalo'])
    d.rectangle([0, base, w, h], fill=MUESTRA['piso'])
    d.line([(0, base + 12), (w, base + 12)], fill=MUESTRA['junta'])
    im.alpha_composite(cuadro, (w // 2 - punto[0], base - punto[1]))
    return im


def _celda_lado(cuadro, punto, ancho_sala, alto):
    w = cuadro.width + 56
    im = Image.new('RGBA', (w, alto), MUESTRA['vacio'] + (255,))
    d = ImageDraw.Draw(im)
    m = g.pendiente(ancho_sala)
    ax, ay = 36 + punto[0], 20 + punto[1]
    x = lambda y: ax - (y - ay) * m  # noqa: E731
    d.polygon([(x(-200), -200), (w + 400, -200), (w + 400, alto + 200), (x(alto + 200), alto + 200)], fill=MUESTRA['piso'])
    muro = 146 * 1.09
    d.polygon([(x(-200), -200 - muro), (x(-200), -200), (x(alto + 200), alto + 200), (x(alto + 200), alto + 200 - muro)], fill=MUESTRA['lado'])
    d.line([(x(-200), -202), (x(alto + 200), alto + 198)], fill=MUESTRA['zocalo'], width=5)
    im.alpha_composite(cuadro, (36, 20))
    return im


def _celda_camara(cuadro, punto):
    w, h = cuadro.width + 16, 76
    im = Image.new('RGBA', (w, h), MUESTRA['piso'] + (255,))
    ImageDraw.Draw(im).line([(0, 22), (w, 22)], fill=MUESTRA['junta'])
    im.alpha_composite(cuadro, (w // 2 - punto[0], h - punto[1]))
    return im


def hoja_de_contacto(factor=2):
    """Todas las puertas: de frente, de lado (sala de 960 y de 1920) y del lado de la cámara, con sus 4 cuadros."""
    filas = []
    for modelo in MODELOS:
        celdas = [_celda_frente(c, apoyo(modelo, 'frente')) for c in cuadros(modelo, 'frente')]
        alto_lado = max(cuadros(modelo, 'lado', a)[0].height for a in (960, 1920)) + 40
        for ancho_sala, cuales in ((960, range(CUADROS)), (1920, (0, 3))):
            celdas += [_celda_lado(cuadros(modelo, 'lado', ancho_sala)[f], apoyo(modelo, 'lado', ancho_sala), ancho_sala, alto_lado)
                       for f in cuales]
        celdas += [_celda_camara(c, apoyo(modelo, 'camara')) for c in cuadros(modelo, 'camara')]
        filas.append((MODELOS[modelo]['nombre'], celdas))
    ancho = max(sum(c.width + 6 for c in celdas) for _, celdas in filas) + 12
    alto = sum(max(c.height for c in celdas) + 30 for _, celdas in filas) + 8
    lienzo = Image.new('RGB', (ancho, alto), MUESTRA['papel'])
    d = ImageDraw.Draw(lienzo)
    y = 6
    for nombre, celdas in filas:
        d.text((8, y + 4), nombre, fill=MUESTRA['tinta'])
        x, alto_fila = 8, max(c.height for c in celdas)
        for c in celdas:
            lienzo.paste(c.convert('RGB'), (x, y + 22 + alto_fila - c.height))
            x += c.width + 6
        y += alto_fila + 30
    return lienzo.resize((ancho * factor, alto * factor), Image.Resampling.NEAREST)


if __name__ == '__main__':
    destino = os.path.join(RAIZ, 'maqueta-visual', 'piezas')
    os.makedirs(destino, exist_ok=True)
    hoja_de_contacto().save(os.path.join(destino, 'puertas.png'))
    for nombre in MODELOS:
        print(nombre, {v: (hoja(nombre, v).size, len(hoja(nombre, v).getcolors(maxcolors=100000)) - 1) for v in VISTAS})
