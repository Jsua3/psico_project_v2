"""Herramientas de dibujo de los objetos v2 (bloque O1): material, volumen, textura y contorno, píxel a píxel.

Un objeto se pinta como un mapa de (material, escalón de luz) y se convierte en color al final:

    L = Lienzo(40, 30)
    L.bloque(2, 4, 37, 27, 'nogal', tapa=4)        # tapa clara, frente medio, base en sombra
    L.cojin(4, 6, 20, 14, 'pana-verde')            # volumen redondo por escalones
    im = L.imagen()                                # RGBA, alfa binario, contorno selectivo de 1 px

- Cada material es una rampa de 6 tonos (0 = luz, 5 = sombra honda) con giro de matiz: las luces van hacia el
  amarillo y las sombras hacia el azul, como se pinta a mano. El escalón 2 es el tono base.
- La textura (veta, trama, cuero, grano) suma -1, 0 o +1 al escalón: el volumen se lee y la superficie no queda plana.
- La luz horneada es solo de forma y cenital (tapa clara, base oscura, bordes curvos más oscuros a ambos lados).
  Nada de brillos laterales: el brillo que depende de la ventana o la lámpara va en la capa de reflejo (`Reflejo`).
- Sin degradados ni suavizado: todo es un escalón de una rampa o un color directo.
"""
import colorsys
import random

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

CONTORNO_BASE = (40, 28, 24)        # el contorno de la casa (arte_comun.CONTORNO); el selectivo se mezcla con él
MAX_COLORES = 40


# ── color ──────────────────────────────────────────────────────────────────────

def _hacia(h, objetivo, cantidad):
    d = (objetivo - h + 0.5) % 1.0 - 0.5
    paso = min(abs(d), cantidad)
    return (h + (paso if d >= 0 else -paso)) % 1.0


def rampa(base, n=6, centro=2, luz=0.55, sombra=0.62, giro=1.0):
    """n tonos de luz a sombra alrededor de `base` (en el índice `centro`), con giro de matiz."""
    h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in base))
    tonos = []
    for i in range(n):
        k = i - centro
        if k < 0:
            t = -k / centro
            hh, ss, vv = _hacia(h, 1 / 6, 0.05 * t * giro), s * (1 - 0.28 * t), min(1.0, v + (1 - v) * luz * t + 0.05 * t)
        elif k > 0:
            t = k / (n - 1 - centro)
            hh, ss, vv = _hacia(h, 0.68, 0.09 * t * giro), min(1.0, s * (1 + 0.22 * t) + 0.05 * t), v * (1 - sombra * t)
        else:
            hh, ss, vv = h, s, v
        tonos.append(tuple(int(round(c * 255)) for c in colorsys.hsv_to_rgb(hh, ss, vv)))
    return tonos


def mezcla(a, b, t):
    return tuple(int(round(x + (y - x) * t)) for x, y in zip(a, b))


# ── texturas: devuelven un mapa de -1/0/+1 del tamaño del lienzo ───────────────

def tex_ninguna(h, w, semilla):
    return np.zeros((h, w), np.int8)


def tex_veta(densidad=0.10, largo=(4, 13), nudos=0.0, claras=0.35):
    """Veta de madera: trazos horizontales más oscuros, algunos claros, y nudos ocasionales."""
    def f(h, w, semilla):
        r = random.Random(semilla)
        m = np.zeros((h, w), np.int8)
        for y in range(h):
            x = r.randrange(-6, 4)
            while x < w:
                if r.random() < densidad * 3:
                    n = r.randint(*largo)
                    m[y, max(0, x):max(0, min(w, x + n))] = -1 if r.random() < claras else 1
                    x += n + r.randint(2, 9)
                else:
                    x += r.randint(3, 10)
        for _ in range(int(nudos * w * h / 400)):
            cx, cy = r.randrange(2, max(3, w - 2)), r.randrange(1, max(2, h - 1))
            m[cy, max(0, cx - 2):cx + 3] = 1
            m[max(0, cy - 1), max(0, cx - 1):cx + 2] = 1
            m[cy, cx] = 0
        return m
    return f


def tex_trama(paso=4, fila=2, fuerza=1):
    """Tejido en sarga: diagonales finas de un escalón más oscuro."""
    def f(h, w, semilla):
        ys, xs = np.mgrid[0:h, 0:w]
        return (((xs + ys * fila) % paso) == 0).astype(np.int8) * fuerza
    return f


def tex_grano(densidad=0.08, claras=0.5):
    """Grano suelto (cuero, plástico gastado, tierra): píxeles aislados un escalón arriba o abajo."""
    def f(h, w, semilla):
        r = np.random.default_rng(semilla)
        u = r.random((h, w))
        m = np.zeros((h, w), np.int8)
        m[u < densidad * claras] = -1
        m[(u >= densidad * claras) & (u < densidad)] = 1
        return m
    return f


def tex_tejido_punto(paso=3):
    """Punto grueso (lana, crochet): cuadrícula alterna."""
    def f(h, w, semilla):
        ys, xs = np.mgrid[0:h, 0:w]
        return (((xs + ys * 2) % paso) == 0).astype(np.int8) - (((xs + ys) % (paso * 2)) == 1).astype(np.int8)
    return f


# ── materiales ─────────────────────────────────────────────────────────────────

MATERIALES = {}


def material(nombre, base, textura=tex_ninguna, **kw_rampa):
    MATERIALES[nombre] = dict(rampa=rampa(base, **kw_rampa), textura=textura)
    return MATERIALES[nombre]


# Maderas
material('nogal', (122, 78, 50), tex_veta(0.055, largo=(5, 16), nudos=0.15, claras=0.2))
material('roble', (168, 120, 78), tex_veta(0.05, largo=(5, 16), nudos=0.15, claras=0.25))
material('pino', (190, 150, 100), tex_veta(0.08, nudos=0.6))
material('caoba', (128, 60, 44), tex_veta(0.12))
material('mdf-gris', (128, 124, 120), tex_grano(0.05))
material('formica', (196, 186, 166), tex_grano(0.03))
# Telas
material('pana-verde', (66, 128, 112), tex_grano(0.05, claras=0.0), luz=0.42, sombra=0.55)
material('lino-rojo', (178, 82, 62), tex_trama(3, 1))
material('pana-rosa', (170, 110, 120), tex_grano(0.05, claras=0.0), luz=0.42, sombra=0.55)
material('tela-azul', (78, 106, 150), tex_grano(0.05, claras=0.0), luz=0.42, sombra=0.55)
material('tela-gris', (120, 126, 136), tex_grano(0.05, claras=0.0), luz=0.42, sombra=0.55)
material('crochet', (226, 216, 190), tex_tejido_punto(3), luz=0.4)
# Plásticos, metal, vidrio
material('plastico-negro', (58, 56, 62), tex_grano(0.04), luz=0.35)
material('plastico-gris', (150, 152, 156), tex_grano(0.03), luz=0.4)
material('plastico-crema', (214, 206, 186), tex_grano(0.03), luz=0.35)
material('metal', (150, 158, 168), luz=0.5, sombra=0.6)
material('cromo', (176, 184, 194), luz=0.6, sombra=0.7)
material('laton', (190, 152, 82), luz=0.5)
material('vidrio', (150, 184, 196), luz=0.5, sombra=0.55)
material('pantalla', (34, 46, 58), luz=0.4, sombra=0.5)
material('papel', (226, 222, 206), tex_grano(0.02), luz=0.4, sombra=0.45)
material('carton', (186, 150, 104), tex_grano(0.05))
material('cuero-negro', (60, 52, 56), tex_grano(0.07), luz=0.35)
material('ceramica', (206, 198, 186), luz=0.45)
material('hoja', (82, 142, 72), tex_grano(0.10))
material('tierra', (96, 70, 52), tex_grano(0.18))


# ── lienzo ─────────────────────────────────────────────────────────────────────

class Lienzo:
    """Mapa de (material, escalón) con colores directos donde hace falta. Coordenadas enteras inclusivas."""

    def __init__(self, w, h, semilla=1):
        self.w, self.h, self.semilla = w, h, semilla
        self.mat = np.full((h, w), -1, np.int16)          # -1 vacío, -2 color directo, k = índice en self.nombres
        self.esc = np.zeros((h, w), np.int8)
        self.tex = np.ones((h, w), bool)                  # False: sin textura (costuras, bordes, letras)
        self.directo = np.zeros((h, w, 3), np.uint8)
        self.nombres = []

    # — utilidades —
    def _m(self, nombre):
        if nombre not in self.nombres:
            if nombre not in MATERIALES:
                raise KeyError(f'material {nombre!r} sin definir')
            self.nombres.append(nombre)
        return self.nombres.index(nombre)

    def _aplicar(self, mascara, mat, esc, tex=True):
        if mat is None:
            self.mat[mascara] = -1
            return
        if isinstance(mat, tuple):
            self.mat[mascara] = -2
            self.directo[mascara] = mat
        else:
            self.mat[mascara] = self._m(mat)
            self.esc[mascara] = esc
        self.tex[mascara] = tex

    def caja_mascara(self, x0, y0, x1, y1):
        m = np.zeros((self.h, self.w), bool)
        x0, x1 = sorted((x0, x1))
        y0, y1 = sorted((y0, y1))
        m[max(0, y0):max(0, min(self.h, y1 + 1)), max(0, x0):max(0, min(self.w, x1 + 1))] = True
        return m

    def poli_mascara(self, pts):
        im = Image.new('L', (self.w, self.h), 0)
        ImageDraw.Draw(im).polygon([tuple(p) for p in pts], fill=255, outline=255)
        return np.array(im) > 0

    def elipse_mascara(self, x0, y0, x1, y1):
        im = Image.new('L', (self.w, self.h), 0)
        ImageDraw.Draw(im).ellipse([x0, y0, x1, y1], fill=255, outline=255)
        return np.array(im) > 0

    def redondeada_mascara(self, x0, y0, x1, y1, r):
        im = Image.new('L', (self.w, self.h), 0)
        ImageDraw.Draw(im).rounded_rectangle([x0, y0, x1, y1], r, fill=255, outline=255)
        return np.array(im) > 0

    def opaco(self):
        return self.mat != -1

    # — pintar —
    def px(self, x, y, mat, esc=2, tex=False):
        if 0 <= x < self.w and 0 <= y < self.h:
            m = np.zeros((self.h, self.w), bool)
            m[y, x] = True
            self._aplicar(m, mat, esc, tex)

    def rect(self, x0, y0, x1, y1, mat, esc=2, tex=True):
        self._aplicar(self.caja_mascara(x0, y0, x1, y1), mat, esc, tex)

    def poli(self, pts, mat, esc=2, tex=True):
        self._aplicar(self.poli_mascara(pts), mat, esc, tex)

    def elipse(self, x0, y0, x1, y1, mat, esc=2, tex=True):
        self._aplicar(self.elipse_mascara(x0, y0, x1, y1), mat, esc, tex)

    def linea(self, x0, y0, x1, y1, mat, esc=2, tex=False):
        im = Image.new('L', (self.w, self.h), 0)
        ImageDraw.Draw(im).line([(x0, y0), (x1, y1)], fill=255, width=1)
        self._aplicar(np.array(im) > 0, mat, esc, tex)

    def mascara(self, m, mat, esc=2, tex=True):
        self._aplicar(m, mat, esc, tex)

    def sombrear(self, m, delta):
        """Suma `delta` escalones donde `m` y hay material (oclusión, pliegues)."""
        sel = m & (self.mat >= 0)
        self.esc[sel] = np.clip(self.esc[sel] + delta, 0, 5)

    # — volúmenes con luz cenital —
    def bloque(self, x0, y0, x1, y1, mat, tapa=4, canto=True, base=2, frente=2):
        """Caja vista de frente y desde arriba: tapa (luz), canto delantero (luz alta), frente y base en sombra."""
        self.rect(x0, y0, x1, y0 + tapa - 1, mat, 1)
        if canto:
            self.rect(x0, y0 + tapa - 1, x1, y0 + tapa - 1, mat, 0, tex=False)
        self.rect(x0, y0 + tapa, x1, y1, mat, frente)
        self.rect(x0, y0 + tapa, x1, y0 + tapa, mat, frente + 1, tex=False)    # sombra bajo el canto
        self.rect(x0, y1 - base + 1, x1, y1, mat, 4)
        self.rect(x0, y0 + tapa + 1, x0, y1 - base, mat, frente + 1, tex=False)
        self.rect(x1, y0 + tapa + 1, x1, y1 - base, mat, frente + 1, tex=False)

    def cojin(self, x0, y0, x1, y1, mat, r=3, arriba=0.3, abajo=0.25, borde=True):
        """Volumen blando: arriba claro, centro base, abajo en sombra, costados curvos un escalón más oscuros."""
        m = self.redondeada_mascara(x0, y0, x1, y1, r)
        alto = y1 - y0 + 1
        ys = np.arange(self.h)[:, None] - y0
        esc = np.full((self.h, self.w), 2, np.int8)
        esc = np.where(ys < alto * arriba, 1, esc)
        esc = np.where(ys >= alto * (1 - abajo), 3, esc)
        esc = np.where(ys >= alto - 1, 4, esc)
        xs = np.arange(self.w)[None, :]
        lados = ((xs <= x0 + 1) | (xs >= x1 - 1)) & (ys > 0)
        esc = np.where(lados & m, np.minimum(esc + 1, 5), esc).astype(np.int8)
        k = self._m(mat)
        self.mat[m] = k
        self.esc[m] = esc[m]
        self.tex[m] = True
        if borde:                                      # el borde de arriba recoge la luz del techo
            fila = np.zeros_like(m)
            fila[y0, x0 + r:x1 - r + 1] = True
            self.esc[fila & m] = 0
            self.tex[fila & m] = False
        return m

    # — salida —
    def colores_rgb(self):
        h, w = self.h, self.w
        rgb = np.zeros((h, w, 3), np.uint8)
        for k, nombre in enumerate(self.nombres):
            sel = self.mat == k
            if not sel.any():
                continue
            ficha = MATERIALES[nombre]
            off = ficha['textura'](h, w, self.semilla + 7 * k)
            esc = np.where(self.tex, self.esc + off, self.esc)
            esc = np.clip(esc, 0, len(ficha['rampa']) - 1)
            paleta = np.array(ficha['rampa'], np.uint8)
            rgb[sel] = paleta[esc[sel]]
        d = self.mat == -2
        rgb[d] = self.directo[d]
        return rgb

    def imagen(self, contorno=True):
        rgb = self.colores_rgb()
        opaco = self.mat != -1
        arr = np.zeros((self.h, self.w, 4), np.uint8)
        arr[opaco, :3] = rgb[opaco]
        arr[opaco, 3] = 255
        im = Image.fromarray(arr, 'RGBA')
        return contornear(im) if contorno else im


def contornear(im, fuerza=0.42):
    """Contorno selectivo de 1 px hacia afuera: el color del vecino más oscuro, oscurecido y llevado al marrón de la casa."""
    arr = np.array(im.convert('RGBA'))
    opaco = arr[:, :, 3] >= 128
    borde = ndimage.binary_dilation(opaco) & ~opaco
    lum = arr[:, :, :3].astype(np.int64) @ np.array([3, 6, 1])
    lum[~opaco] = 1 << 40
    h, w = opaco.shape
    salida = arr.copy()
    for y, x in zip(*np.nonzero(borde)):
        mejor = None
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and opaco[yy, xx]:
                if mejor is None or lum[yy, xx] < lum[mejor]:
                    mejor = (yy, xx)
        c = tuple(int(v) for v in arr[mejor][:3])
        oscuro = tuple(int(v * fuerza) for v in c)
        salida[y, x, :3] = mezcla(oscuro, CONTORNO_BASE, 0.5)
        salida[y, x, 3] = 255
    fuera = ~(opaco | borde)
    salida[fuera] = 0
    return Image.fromarray(salida, 'RGBA')


# ── tiras y medidas ────────────────────────────────────────────────────────────

def tira(cuadros):
    w, h = cuadros[0].size
    assert all(c.size == (w, h) for c in cuadros), 'todos los cuadros deben medir lo mismo'
    out = Image.new('RGBA', (w * len(cuadros), h), (0, 0, 0, 0))
    for n, c in enumerate(cuadros):
        out.paste(c, (n * w, 0))
    return out


def rejilla(filas):
    """Varias tiras del mismo ancho, una debajo de otra (máscaras de reflejo: una fila por lado)."""
    w = max(f.width for f in filas)
    out = Image.new('RGBA', (w, sum(f.height for f in filas)), (0, 0, 0, 0))
    y = 0
    for f in filas:
        out.paste(f, (0, y))
        y += f.height
    return out


def colores(im):
    arr = np.array(im.convert('RGBA'))
    sel = arr[:, :, 3] > 0
    return len(np.unique(arr[sel][:, :3], axis=0)) if sel.any() else 0


def recortar_comun(cuadros):
    """Recorta todos los cuadros con la misma caja (la unión de lo opaco): la base queda en la última fila."""
    cajas = [c.getbbox() for c in cuadros if c.getbbox()]
    x0 = min(b[0] for b in cajas)
    y0 = min(b[1] for b in cajas)
    x1 = max(b[2] for b in cajas)
    y1 = max(b[3] for b in cajas)
    return [c.crop((x0, y0, x1, y1)) for c in cuadros], (x0, y0)


# ── reflejos ───────────────────────────────────────────────────────────────────

FUERTE, SUAVE = (255, 255, 255, 255), (128, 128, 128, 255)
LADOS = ('izquierda', 'frente', 'derecha')


class Reflejo:
    """Máscara de brillo de un cuadro: 2 = fuerte, 1 = suave. Se pinta una por lado de la fuente de luz."""

    def __init__(self, w, h):
        self.m = np.zeros((h, w), np.uint8)
        self.w, self.h = w, h

    def rect(self, x0, y0, x1, y1, nivel=2):
        self.m[max(0, y0):y1 + 1, max(0, x0):x1 + 1] = nivel

    def px(self, x, y, nivel=2):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.m[y, x] = nivel

    def diagonal(self, x, y, largo, ancho=1, nivel=2, sentido=1):
        """Trazo a 45° hacia arriba (sentido 1: hacia la derecha) de `largo` píxeles."""
        for i in range(largo):
            for a in range(ancho):
                self.px(x + a + i * sentido, y - i, nivel)

    def recortar_a(self, opaco):
        self.m[~opaco] = 0

    def imagen(self):
        arr = np.zeros((self.h, self.w, 4), np.uint8)
        arr[self.m == 2] = FUERTE
        arr[self.m == 1] = SUAVE
        return Image.fromarray(arr, 'RGBA')
