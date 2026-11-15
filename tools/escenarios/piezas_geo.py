"""Geometría de las «salas por piezas»: una sola proyección para el piso, los muros y las piezas.

La sala mide 528 px de alto y su ancho es uno de ANCHOS. Todo converge a un punto de fuga en el centro
de la sala con K = 3/16: así las líneas del piso son paralelas a la base del muro lateral y el piso de
cualquier ancho es el recorte central de la maestra de 1920 px.

Una pieza de muro se ubica con (muro, pos): `pos` es la distancia en px a lo largo del muro, desde la
izquierda en `fondo` y `camara`, y desde el fondo hacia la cámara en `izquierda` y `derecha`.

Las piezas se dibujan en el plano de su muro (u a lo largo, v hacia arriba desde el piso) y un proyector
(`Frente` o `Lado`) las lleva a la pantalla: el mismo dibujo da la vista de frente y la lateral.
"""
import numpy as np
from PIL import Image

ANCHOS = (960, 1200, 1440, 1680, 1920)
ALTO, SEAM, TOP = 528, 230, 84
FONDO = ALTO - SEAM          # 298 px de piso, del muro del fondo al borde de la cámara
ALTO_MURO = SEAM - TOP       # 146 px de muro
K = 3 / 16                   # cuánto crece la escala del fondo a la cámara
MARGEN = 24                  # px de lienzo que quedan por fuera de un muro lateral, abajo
REJILLA = 8
MUROS = ('fondo', 'izquierda', 'derecha', 'camara')
ENCUADRES = {
    'tres-paredes': (True, True),
    'dos-paredes-izquierda': (True, False),
    'dos-paredes-derecha': (False, True),
    'una-pared': (False, False),
}
CONTORNO = (40, 28, 24)


def comprobar_ancho(ancho):
    if ancho not in ANCHOS:
        raise ValueError(f'ancho {ancho} fuera del catálogo {ANCHOS}')
    return ancho


def borde(ancho):
    """x donde un muro lateral se junta con el del fondo: 96 a 960 px, 172 a 1920 px."""
    return 96 + 19 * (comprobar_ancho(ancho) - 960) // 240


def laterales(encuadre):
    """(¿hay muro a la izquierda?, ¿a la derecha?)."""
    return ENCUADRES[encuadre]


def limites(encuadre, ancho):
    """(x izquierda, x derecha) del muro del fondo."""
    izq, der = laterales(encuadre)
    b = borde(ancho)
    return (b if izq else 0), (ancho - b if der else ancho)


def escala(y):
    return 1 + K * (y - SEAM) / FONDO


def esp(ancho, bx, y):
    """x en pantalla, a la altura y, de la línea del piso que en el fondo está en bx."""
    cx = ancho / 2
    return cx + (bx - cx) * escala(y)


def pendiente(ancho):
    """px que la base del muro lateral se corre en x por cada px que baja."""
    return (borde(ancho) - MARGEN) / FONDO


def junta(ancho, lado, y):
    """x de la unión del muro lateral con el piso a la altura y."""
    x = borde(ancho) - (y - SEAM) * pendiente(ancho)
    return x if lado == 'izquierda' else ancho - x


def tope_lado(y):
    """y del borde superior del muro lateral sobre el punto de su base que está a la altura y."""
    return y - ALTO_MURO * escala(y)


def zona_caminable(encuadre, ancho):
    """(x, y, ancho, alto) de la zona caminable: la tabla fija de hoy, ahora función del encuadre y del ancho."""
    izq, der = laterales(encuadre)
    b = borde(ancho)
    x0, x1 = (b if izq else MARGEN), (ancho - b if der else ancho - MARGEN)
    return x0, 236, x1 - x0, 250


def largo_muro(muro, encuadre, ancho):
    izq, der = laterales(encuadre)
    if muro in ('fondo', 'camara'):
        xl, xr = limites(encuadre, ancho)
        return xr - xl
    return FONDO if (izq if muro == 'izquierda' else der) else 0


def redondear(n, d):
    """Entero más cercano a n/d con las mitades hacia arriba: el redondeo del contrato x-siep 2.2 (nada de round())."""
    return (2 * n + d) // (2 * d)


def en_pantalla(muro, pos, encuadre, ancho):
    """Punto de apoyo en pantalla de una pieza puesta en (muro, pos): el `ancla` del contrato x-siep 2.2."""
    xl, _ = limites(encuadre, ancho)
    if muro == 'fondo':
        return xl + pos, SEAM
    if muro == 'camara':
        cx = ancho // 2
        return cx + redondear((xl + pos - cx) * 19, 16), ALTO
    b = borde(ancho)
    x = b - redondear(pos * (b - MARGEN), FONDO)
    return (x if muro == 'izquierda' else ancho - x), SEAM + pos


def llegada(muro, pos, encuadre, ancho):
    """Umbral de la puerta que está en (muro, pos) y punto donde queda el personaje al cruzarla: su ancla traída
    a la zona caminable con los márgenes del contrato (16 px a los lados; y entre 260 y 476)."""
    x, y = en_pantalla(muro, pos, encuadre, ancho)
    x0, y0, w, h = zona_caminable(encuadre, ancho)
    return min(max(x, x0 + 16), x0 + w - 16), min(max(y, y0 + 24), y0 + h - 10)


# ── proyectores ────────────────────────────────────────────────────────────────

def _t(c):
    return tuple(c) + (255,)


class Frente:
    """Muro visto de frente. (ox, base) es la pantalla de (u=0, v=0); los rectángulos son semiabiertos."""
    sube = (0, 3, 6, 8)      # cuánto sube el canto libre de una hoja que gira hacia la otra sala

    def __init__(self, d, ox, base):
        self.d, self.ox, self.base = d, ox, base

    def quad(self, u0, va0, va1, u1, vb0, vb1, c):
        """Cuadrilátero con el lado izquierdo en u0 (de va0 a va1) y el derecho en u1 (de vb0 a vb1)."""
        x0, x1 = self.ox + int(round(u0)), self.ox + int(round(u1)) - 1
        if x1 < x0:
            return
        y = lambda v: self.base - int(round(v))  # noqa: E731
        self.d.polygon([(x0, y(va1)), (x1, y(vb1)), (x1, y(vb0) - 1), (x0, y(va0) - 1)], fill=_t(c))

    def q(self, u0, v0, u1, v1, c):
        self.d.rectangle([self.ox + u0, self.base - v1, self.ox + u1 - 1, self.base - v0 - 1], fill=_t(c))

    def suelo(self, u0, u1, d0, d1, c):
        """Franja sobre el piso, pegada al muro: de d0 a d1 px hacia la sala."""
        self.d.rectangle([self.ox + u0, self.base + d0, self.ox + u1 - 1, self.base + d1 - 1], fill=_t(c))

    def punto_suelo(self, u, dist):
        return self.ox + u, self.base + dist


class Lado:
    """Muro izquierdo visto en tres cuartos (el derecho es su espejo). (ox, oy) es la pantalla de (u=0, v=0);
    u crece del fondo hacia la cámara. La pieza se dibuja a la escala de la mitad del muro."""
    sube = (0, 0, 0, 0)

    def __init__(self, d, ox, oy, ancho_sala, largo):
        self.d, self.ox, self.oy, self.m, self.largo = d, ox, oy, pendiente(ancho_sala), largo

    def p(self, u, v):
        s = 1 + K * 0.5 + K * (u - self.largo / 2) / FONDO
        return int(round(self.ox - u * self.m)), int(round(self.oy + u - v * s))

    def quad(self, u0, va0, va1, u1, vb0, vb1, c):
        self.d.polygon([self.p(u0, va1), self.p(u1, vb1), self.p(u1, vb0), self.p(u0, va0)], fill=_t(c))

    def q(self, u0, v0, u1, v1, c):
        self.quad(u0, v0, v1, u1, v0, v1, c)

    def punto_suelo(self, u, dist):
        return int(round(self.ox - u * self.m + dist)), int(round(self.oy + u))

    def suelo(self, u0, u1, d0, d1, c):
        s = self.punto_suelo
        self.d.polygon([s(u0, d0), s(u0, d1), s(u1, d1), s(u1, d0)], fill=_t(c))


# ── acabado de un sprite ───────────────────────────────────────────────────────

def limitar_colores(arr, mascara, maximo):
    """Funde los colores más parecidos (el menos usado en el más usado) hasta dejar `maximo`."""
    px = arr[mascara][:, :3]
    colores, cuenta = np.unique(px, axis=0, return_counts=True)
    colores = [tuple(int(v) for v in c) for c in colores]
    cuenta = list(cuenta)
    cambio = {}
    while len(colores) > maximo:
        c = np.array(colores, dtype=int)
        dist = ((c[:, None, :] - c[None, :, :]) ** 2).sum(-1)
        dist[np.arange(len(c)), np.arange(len(c))] = 10 ** 9
        i, j = np.unravel_index(dist.argmin(), dist.shape)
        if cuenta[i] < cuenta[j]:
            i, j = j, i
        cambio[colores[j]] = colores[i]
        cuenta[i] += cuenta[j]
        del colores[j], cuenta[j]
    if cambio:
        def final(c):
            while c in cambio:
                c = cambio[c]
            return c
        clave = (arr[:, :, 0].astype(int) << 16) | (arr[:, :, 1].astype(int) << 8) | arr[:, :, 2]
        for viejo in cambio:
            donde = mascara & (clave == ((viejo[0] << 16) | (viejo[1] << 8) | viejo[2]))
            arr[donde, :3] = final(viejo)
    return arr


def terminar(im, maximo, contorno=True):
    """Alfa binario, a lo sumo `maximo` colores (contando el contorno) y contorno de 1 px."""
    arr = np.array(im.convert('RGBA'))
    mascara = arr[:, :, 3] >= 128
    arr = limitar_colores(arr, mascara, maximo - (1 if contorno else 0))
    arr[~mascara] = 0
    arr[mascara, 3] = 255
    if contorno:
        vecino = np.zeros_like(mascara)
        vecino[1:, :] |= mascara[:-1, :]
        vecino[:-1, :] |= mascara[1:, :]
        vecino[:, 1:] |= mascara[:, :-1]
        vecino[:, :-1] |= mascara[:, 1:]
        filo = vecino & ~mascara
        arr[filo, :3] = CONTORNO
        arr[filo, 3] = 255
    return Image.fromarray(arr, 'RGBA')


def recortar_juntos(cuadros, apoyo):
    """Recorta varios cuadros a la caja que los contiene a todos; devuelve (cuadros, apoyo en el recorte)."""
    cajas = [c.getbbox() for c in cuadros if c.getbbox()]
    x0, y0 = min(c[0] for c in cajas), min(c[1] for c in cajas)
    x1, y1 = max(c[2] for c in cajas), max(c[3] for c in cajas)
    return [c.crop((x0, y0, x1, y1)) for c in cuadros], (apoyo[0] - x0, apoyo[1] - y0)


FUERZA_BRILLO = {'vidrio': 3, 'metal': 2, 'barniz': 1}     # en el mapa de brillo el gris vale fuerza × 85


def mapa_de_brillo(cuadro, colores):
    """Separa de un cuadro lo que brilla. `colores` = {rgb: (material, rgb apagado o None)}: cada píxel de esos colores
    pasa al mapa (RGBA; gris = fuerza del material × 85) y, si tiene color apagado, en el cuadro queda con ese:
    así el vidrio no trae pintado un reflejo que la luz de la sala no da. Devuelve (cuadro, mapa)."""
    arr = np.array(cuadro.convert('RGBA'))
    mapa = np.zeros_like(arr)
    for rgb, (material, apagado) in colores.items():
        donde = (arr[:, :, :3] == np.array(rgb, dtype=np.uint8)).all(-1) & (arr[:, :, 3] == 255)
        if donde.any():
            gris = FUERZA_BRILLO[material] * 85
            mapa[donde] = (gris, gris, gris, 255)
            if apagado:
                arr[donde, :3] = apagado
    return Image.fromarray(arr, 'RGBA'), Image.fromarray(mapa, 'RGBA')


def recortar_con(cuadros, apoyo, mapas):
    """Como recortar_juntos, pero recorta igual los mapas que acompañan a cada cuadro."""
    cajas = [c.getbbox() for c in cuadros if c.getbbox()]
    caja = (min(c[0] for c in cajas), min(c[1] for c in cajas), max(c[2] for c in cajas), max(c[3] for c in cajas))
    return [c.crop(caja) for c in cuadros], (apoyo[0] - caja[0], apoyo[1] - caja[1]), [m.crop(caja) for m in mapas]


def tira(cuadros):
    w, h = cuadros[0].size
    hoja = Image.new('RGBA', (w * len(cuadros), h), (0, 0, 0, 0))
    for n, c in enumerate(cuadros):
        hoja.paste(c, (n * w, 0))
    return hoja
