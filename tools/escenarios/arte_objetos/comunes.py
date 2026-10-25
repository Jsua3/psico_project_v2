"""Modelos comunes a todos los lugares. Ver __init__.py para la API y las reglas."""
from arte_objetos import E, L, P, POL, R, cuadros, lienzo, tonos  # noqa: F401

MODELOS = {}


def _modelo(id_):
    def registrar(fn):
        MODELOS[id_] = fn
        return fn
    return registrar


def _q(x, y):
    return (int(round(x)), int(round(y)))


# ── planta-maceta ──────────────────────────────────────────────────────────────

def _hoja(d, cx, cy, ancho, alto, verde):
    """Hoja ovalada con la luz arriba a la izquierda: sombra abajo a la derecha."""
    x0, y0 = cx - ancho // 2, cy - alto // 2
    E(d, x0, y0, x0 + ancho - 1, y0 + alto - 1, verde[2])
    E(d, x0, y0, x0 + ancho - 2, y0 + alto - 2, verde[1])
    P(d, x0 + 1, y0 + 1, verde[0])
    P(d, x0 + 2, y0 + 1, verde[0])


@_modelo('planta-maceta')
def planta_maceta():
    barro = tonos((204, 116, 74))
    verde = tonos((84, 170, 88))
    tierra = barro[3]
    hojas = (  # centro, tamaño; la de arriba es la más alta
        (8, 15, 7, 5), (24, 15, 7, 5), (10, 9, 7, 6), (22, 8, 7, 6), (16, 5, 6, 7),
    )

    def dibujar(k):
        dx = (0, -1, 0, 1)[k]  # las hojas se mecen 1 px: izquierda, centro, derecha; la maceta no se mueve
        im, d = lienzo()
        # maceta: borde ancho arriba y cuerpo que se angosta
        POL(d, [(10, 24), (21, 24), (20, 30), (11, 30)], barro[1])
        POL(d, [(18, 24), (21, 24), (20, 30), (17, 30)], barro[2])
        L(d, 12, 25, 12, 29, barro[0])
        R(d, 11, 29, 20, 30, barro[2])
        R(d, 9, 21, 22, 23, barro[1])
        R(d, 9, 21, 22, 21, barro[0])
        R(d, 9, 23, 22, 23, barro[2])
        R(d, 21, 22, 22, 23, barro[2])
        R(d, 9, 22, 10, 22, barro[0])
        # tierra
        R(d, 12, 19, 19, 19, tierra)
        R(d, 10, 20, 21, 20, tierra)
        # tallos y hojas, las de atrás primero
        for (cx, cy, w, h) in hojas:
            L(d, 16, 19, cx + dx, cy, verde[2])
        for (cx, cy, w, h) in (hojas[2], hojas[3], hojas[4], hojas[0], hojas[1]):
            _hoja(d, cx + dx, cy, w, h, verde)
        return im

    return cuadros(3, dibujar)


# ── ventana ────────────────────────────────────────────────────────────────────

@_modelo('ventana')
def ventana():
    marco = tonos((232, 224, 204))
    vidrio = tonos((138, 174, 208))
    tela = tonos((214, 108, 122))
    gota = (242, 249, 255)

    def dibujar(k):
        s = (0, 1, 2, 1)[k]  # cuánto se corre el borde de la cortina abajo
        im, d = lienzo()
        # marco y vidrio
        R(d, 5, 5, 26, 26, marco[1])
        R(d, 5, 5, 26, 5, marco[0]); R(d, 5, 5, 5, 26, marco[0])
        R(d, 5, 26, 26, 26, marco[2]); R(d, 26, 5, 26, 26, marco[2])
        for (x0, y0, x1, y1, c) in ((7, 7, 14, 14, vidrio[1]), (17, 7, 24, 14, vidrio[1]),
                                    (7, 17, 14, 24, vidrio[2]), (17, 17, 24, 24, vidrio[2])):
            R(d, x0, y0, x1, y1, c)
            L(d, x0 + 1, y0 + 3, x0 + 3, y0 + 1, vidrio[0])
        R(d, 15, 7, 15, 24, marco[0]); R(d, 7, 15, 24, 15, marco[0])
        # lluvia quieta en el vidrio
        for (x, y) in ((22, 18), (19, 21), (12, 19), (23, 10)):
            P(d, x, y, vidrio[0]); P(d, x + 1, y + 1, vidrio[0])
        # la gota que cae por el vidrio de arriba a la derecha
        if k < 3:
            y = (8, 10, 12)[k]
            P(d, 20, y - 1, vidrio[0]); P(d, 20, y, gota); P(d, 20, y + 1, gota)
        else:
            P(d, 19, 14, vidrio[0]); P(d, 21, 14, vidrio[0]); P(d, 20, 14, gota)
        # alféizar
        R(d, 3, 27, 28, 28, marco[1]); R(d, 3, 27, 28, 27, marco[0])
        R(d, 4, 29, 27, 29, marco[2])
        # barra y cortina
        R(d, 2, 3, 29, 3, marco[2]); R(d, 2, 2, 3, 4, marco[1]); R(d, 28, 2, 29, 4, marco[1])
        patron = (tela[0], tela[1], tela[1], tela[2])
        for y in range(4, 26):
            desp = s * (y - 4) / 21
            xr = 10 + int(round(desp))
            for x in range(3, xr + 1):
                P(d, x, y, patron[(x - 3) % 4])
            P(d, xr, y, tela[2])
        R(d, 3, 25, 10 + s, 25, tela[2])
        return im

    return cuadros(3, dibujar)


# ── dispensador-agua ───────────────────────────────────────────────────────────

@_modelo('dispensador-agua')
def dispensador_agua():
    azul = tonos((72, 144, 222))
    blanco = tonos((236, 238, 244))
    aire = tuple(int(round(v + (255 - v) * 0.6)) for v in azul[0])   # el aire de arriba, más pálido que el agua
    rojo = (208, 70, 70)
    rojo_claro = (236, 128, 120)
    rojo_oscuro = (140, 40, 44)

    def dibujar(k):
        bx, by = ((15, 14), (16, 12), (15, 10), (16, 8), (15, 6))[k]  # la burbuja sube por el botellón
        im, d = lienzo()
        # botellón boca abajo: cuerpo alto, hombros rectos que se estrechan y cuello con tapón en la base
        R(d, 12, 1, 19, 1, aire); R(d, 11, 2, 20, 2, aire)
        R(d, 10, 3, 21, 4, aire)                                  # el aire que queda arriba
        P(d, 20, 2, azul[0]); R(d, 20, 3, 21, 4, azul[0])         # canto derecho del aire
        R(d, 10, 5, 21, 12, azul[1])                              # el agua
        R(d, 11, 5, 20, 5, azul[0])                               # línea de nivel
        for (y, x0, x1) in ((13, 11, 20), (14, 12, 19), (15, 13, 18)):
            R(d, x0, y, x1, y, azul[1])                           # hombros rectos
        R(d, 20, 6, 21, 12, azul[2])                              # sombra a la derecha
        for (y, x0, x1) in ((13, 19, 20), (14, 18, 19), (15, 17, 18)):
            R(d, x0, y, x1, y, azul[2])
        L(d, 11, 7, 11, 12, azul[0]); L(d, 12, 7, 12, 10, azul[0])  # reflejo vertical claro
        P(d, 12, 13, azul[0]); P(d, 13, 14, azul[0])              # y baja por el hombro
        # cuello con tapón, entra en la base
        R(d, 14, 16, 17, 16, azul[1]); P(d, 17, 16, azul[2])
        R(d, 13, 17, 18, 18, azul[2]); R(d, 13, 17, 14, 17, azul[1]); P(d, 13, 18, azul[1])  # tapón
        # burbuja
        R(d, bx, by, bx + 1, by + 1, blanco[0])
        # base blanca
        R(d, 8, 18, 23, 30, blanco[1])
        R(d, 8, 18, 23, 18, blanco[0])
        R(d, 8, 18, 9, 30, blanco[0])
        R(d, 22, 18, 23, 30, blanco[2])
        R(d, 11, 18, 20, 18, blanco[3])                           # boca donde entra el cuello
        # grifos: perillas arriba, picos que salen hacia el hueco del vaso
        R(d, 10, 22, 21, 26, blanco[3])
        R(d, 10, 22, 21, 22, blanco[2])
        R(d, 11, 20, 14, 21, azul[1]); R(d, 11, 20, 14, 20, azul[0]); R(d, 14, 21, 14, 21, azul[2])
        R(d, 17, 20, 20, 21, rojo); R(d, 17, 20, 20, 20, rojo_claro); R(d, 20, 21, 20, 21, rojo_oscuro)
        R(d, 12, 22, 13, 24, azul[1]); R(d, 12, 22, 12, 24, azul[0]); P(d, 13, 24, azul[2])
        R(d, 18, 22, 19, 24, rojo); R(d, 18, 22, 18, 24, rojo_claro); P(d, 19, 24, rojo_oscuro)
        # bandeja
        R(d, 9, 27, 22, 27, blanco[0])
        R(d, 9, 28, 22, 29, blanco[2])
        for x in range(11, 21, 2):
            R(d, x, 28, x, 29, blanco[3])
        R(d, 9, 30, 22, 30, blanco[3])
        return im

    return cuadros(4, dibujar)


# ── caja-panuelos ──────────────────────────────────────────────────────────────

@_modelo('caja-panuelos')
def caja_panuelos():
    carton = tonos((202, 158, 104))
    tela = tonos((244, 246, 252))
    cielo = (148, 198, 232)
    puntos = (196, 206, 224)

    def dibujar(k):
        alto, lean = ((5, 0), (7, 0), (8, 1), (6, -1))[k]  # el pañuelo asoma más y se mece
        im, d = lienzo()
        # caja vista desde arriba a la derecha
        POL(d, [(24, 20), (28, 15), (28, 25), (24, 30)], carton[2])
        R(d, 4, 20, 24, 30, carton[1])
        R(d, 4, 30, 24, 30, carton[2])
        L(d, 4, 21, 4, 29, carton[0])
        POL(d, [(4, 20), (24, 20), (28, 15), (8, 15)], carton[0])
        POL(d, [(8, 19), (21, 19), (24, 16), (11, 16)], carton[3])
        # pañuelo que sale de la ranura
        cx = 16 + lean
        top = 17 - alto
        POL(d, [(12, 18), (13, top + 3), (cx - 1, top + 1), (cx + 1, top), (cx + 3, top + 2), (19, 18)], tela[1])
        POL(d, [(cx + 1, top), (cx + 3, top + 2), (19, 18), (17, 18)], tela[0])
        L(d, cx + 1, top + 1, 16, 18, puntos)
        P(d, cx - 1, top + 1, tela[0]); P(d, cx, top, tela[0])
        # etiqueta del frente
        R(d, 8, 23, 20, 27, cielo)
        R(d, 8, 23, 20, 23, tela[1])
        for (x, y) in ((10, 25), (14, 26), (17, 25)):
            P(d, x, y, tela[1])
        return im

    return cuadros(3, dibujar)


# ── cartel-linea-155 ───────────────────────────────────────────────────────────

_UNO = ('.##.', '###.', '.##.', '.##.', '.##.', '.##.', '.##.', '.##.', '####')
_CINCO = ('######', '##....', '##....', '#####.', '######', '....##', '....##', '##..##', '.####.')


_TELEFONO = ('..########..', '.###....###.', '.##......##.', '############', '##.##.##.###', '############')


def _dibujo(d, x, y, filas, c):
    for j, fila in enumerate(filas):
        for i, ch in enumerate(fila):
            if ch == '#':
                P(d, x + i, y + j, c)


@_modelo('cartel-linea-155')
def cartel_linea_155():
    lila = tonos((130, 90, 198))
    crema = (252, 248, 234)
    amarillo = (255, 214, 96)
    brillo = (208, 186, 248)

    def dibujar(k):
        im, d = lienzo()
        R(d, 4, 3, 27, 28, lila[1])
        R(d, 4, 3, 27, 3, lila[0]); R(d, 4, 3, 4, 28, lila[0])
        R(d, 4, 28, 27, 28, lila[2]); R(d, 27, 3, 27, 28, lila[2])
        # brillo en diagonal que cruza el cartel de izquierda a derecha
        if k:
            s = (17, 27, 37, 47)[k - 1]
            for y in range(3, 29):
                for x in (s - y, s - y + 1):
                    if 4 <= x <= 27:
                        P(d, x, y, brillo)
        # teléfono con el auricular arriba
        _dibujo(d, 10, 4, _TELEFONO, amarillo)
        # 155 con sombra
        for (x, f) in ((7, _UNO), (12, _CINCO), (19, _CINCO)):
            _dibujo(d, x + 1, 13, f, lila[3])
        for (x, f) in ((7, _UNO), (12, _CINCO), (19, _CINCO)):
            _dibujo(d, x, 12, f, crema)
        # renglones de texto y cinta en las esquinas de arriba
        R(d, 8, 23, 23, 23, lila[0]); R(d, 10, 25, 21, 25, lila[2])
        R(d, 5, 4, 7, 4, crema); R(d, 24, 4, 26, 4, crema)
        return im

    return cuadros(4, dibujar)


# ── tablero-avisos ─────────────────────────────────────────────────────────────

@_modelo('tablero-avisos')
def tablero_avisos():
    madera = tonos((146, 98, 60))
    corcho = (208, 158, 98)
    mota = (178, 126, 76)
    marfil = (246, 242, 228)
    reverso = (212, 206, 188)
    amarillo = (250, 226, 122)
    celeste = (164, 204, 238)
    rosa = (242, 172, 184)
    tinta = (124, 116, 112)
    chinche = (212, 62, 60)

    hojas = [  # x0, y0, x1, y1, color
        (7, 8, 14, 17, marfil),
        (17, 8, 25, 14, amarillo),
        (7, 19, 13, 24, celeste),
        (16, 17, 24, 24, rosa),
    ]

    def dibujar(k):
        c = (0, 2, 4, 2)[k]  # cuánto se levanta la esquina de la primera hoja
        im, d = lienzo()
        R(d, 3, 4, 28, 27, madera[1])
        R(d, 3, 4, 28, 4, madera[0]); R(d, 3, 4, 3, 27, madera[0])
        R(d, 3, 27, 28, 27, madera[2]); R(d, 28, 4, 28, 27, madera[2])
        R(d, 5, 6, 26, 25, corcho)
        for y in range(6, 26):
            for x in range(5, 27):
                if (x * 5 + y * 3) % 9 == 0:
                    P(d, x, y, mota)
        R(d, 5, 6, 26, 6, mota); R(d, 5, 6, 5, 25, mota)
        for (x0, y0, x1, y1, col) in hojas:  # sombras
            R(d, x0 + 1, y1 + 1, x1 + 1, y1 + 1, mota); R(d, x1 + 1, y0 + 1, x1 + 1, y1 + 1, mota)
        for i, (x0, y0, x1, y1, col) in enumerate(hojas):
            R(d, x0, y0, x1, y1, col)
            for n, yy in enumerate(range(y0 + 3, y1, 2)):
                R(d, x0 + 1, yy, x1 - 1 - (n % 2) * 2, yy, tinta)
            P(d, (x0 + x1) // 2, y0 + 1, chinche)
            if i == 0 and c:
                for dy in range(c):
                    for dx in range(c):
                        if dx + dy < c:
                            P(d, x1 - dx, y1 - dy, corcho)
                for dy in range(c):
                    for dx in range(c):
                        if dx + dy >= c:
                            P(d, x1 - dx, y1 - dy, reverso)
        return im

    return cuadros(3, dibujar)


# ── papelera ───────────────────────────────────────────────────────────────────

@_modelo('papelera')
def papelera():
    metal = tonos((152, 160, 172))

    def dibujar(k):
        alza, inclina = ((0, 0), (1, 1), (1, 2))[k]  # la tapa se entreabre del lado derecho
        im, d = lienzo()
        # cuerpo que se angosta hacia abajo
        for y in range(13, 31):
            r = int(round((y - 13) * 2 / 17))
            x0, x1 = 8 + r, 23 - r
            R(d, x0, y, x1, y, metal[1])
            R(d, x0 + 1, y, x0 + 2, y, metal[0])
            R(d, x1 - 2, y, x1, y, metal[2])
            for x in (12, 16, 20):
                if x0 + 3 <= x <= x1 - 3 and 17 <= y <= 27:
                    P(d, x, y, metal[2])
        R(d, 8, 13, 23, 13, metal[0])
        R(d, 10, 29, 21, 30, metal[2])
        # interior que se ve por la rendija
        R(d, 7, 11, 24, 12, metal[3])
        # tapa
        for x in range(6, 26):
            desp = alza + int(round(inclina * (x - 6) / 19))
            arriba = 8 if 8 <= x <= 23 else 9
            R(d, x, arriba - desp, x, 12 - desp, metal[1])
            P(d, x, arriba - desp, metal[0])
            P(d, x, 12 - desp, metal[2])
            if 14 <= x <= 17:
                R(d, x, 6 - desp, x, 7 - desp, metal[2] if x in (14, 17) else metal[0])
        return im

    return cuadros(2, dibujar)


# ── lampara-escritorio ─────────────────────────────────────────────────────────

def _haz(d, a, b, lejos_a, lejos_b, t, c, de=0.0, hasta=1.0):
    """Cono de luz: de a-b (la boca de la pantalla) hacia lejos_a-lejos_b, recortado a la fracción t."""
    def punto(p, q, f):
        return (p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f)
    a0, b0 = punto(a, b, de), punto(a, b, hasta)
    la, lb = punto(lejos_a, lejos_b, de), punto(lejos_a, lejos_b, hasta)
    fa, fb = punto(a0, la, t), punto(b0, lb, t)
    POL(d, [_q(*a0), _q(*b0), _q(*fb), _q(*fa)], c)


@_modelo('lampara-escritorio')
def lampara_escritorio():
    metal = tonos((76, 82, 100))
    pantalla = tonos((60, 134, 112))
    tenue, media, fuerte = (255, 222, 108), (255, 238, 150), (255, 252, 208)

    def dibujar(k):
        # la luz titila: hasta dónde llega el halo y su núcleo, y de qué tono es cada uno
        fuera, dentro, c_fuera, c_dentro = ((0.80, 0.50, tenue, media), (0.60, 0.35, tenue, media),
                                            (1.00, 0.75, media, fuerte), (0.85, 0.60, tenue, fuerte))[k]
        im, d = lienzo()
        boca_a, boca_b = (10, 8), (20, 15)
        lejos_a, lejos_b = (1, 20), (16, 28)
        _haz(d, boca_a, boca_b, lejos_a, lejos_b, fuera, c_fuera)
        _haz(d, boca_a, boca_b, lejos_a, lejos_b, dentro, c_dentro, 0.25, 0.75)
        # base y brazos: la lámpara se agarra a la derecha
        R(d, 19, 28, 29, 30, metal[1]); R(d, 20, 27, 28, 27, metal[0]); R(d, 19, 30, 29, 30, metal[2])
        L(d, 24, 27, 24, 14, metal[1], 2)
        L(d, 24, 14, 21, 6, metal[1], 2)
        E(d, 22, 12, 26, 16, metal[0])
        # pantalla inclinada hacia abajo y a la izquierda
        POL(d, [(18, 3), (22, 6), (20, 15), (10, 8)], pantalla[1])
        L(d, 18, 3, 10, 8, pantalla[0])
        L(d, 22, 6, 20, 15, pantalla[2])
        L(d, 10, 8, 20, 15, pantalla[2])
        E(d, 13, 9, 16, 12, fuerte)
        return im

    return cuadros(3, dibujar)
