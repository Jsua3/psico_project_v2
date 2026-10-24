"""Modelos de la universidad. Ver __init__.py para la API y las reglas."""
import math

from arte_objetos import E, L, P, POL, R, cuadros, lienzo, tonos  # noqa: F401

MODELOS = {}


def _vacio(d, x, y):
    """Deja un píxel transparente (esquinas redondeadas)."""
    d.point((x, y), fill=(0, 0, 0, 0))


def _hueco(d, x0, y0, x1, y1):
    """Abre un hueco elíptico transparente (el ojo de un asa, por ejemplo)."""
    d.ellipse([x0, y0, x1, y1], fill=(0, 0, 0, 0))


def _modelo(id_):
    def registrar(fn):
        MODELOS[id_] = fn
        return fn
    return registrar


# ---------------------------------------------------------------------------------------------
# 1. Carné estudiantil: plástico con cordón, foto, franja azul. Un brillo diagonal lo recorre.
# ---------------------------------------------------------------------------------------------
@_modelo('carne-estudiantil')
def carne_estudiantil():
    pla = tonos((228, 232, 238))                      # claro, base, oscuro, sombra
    pla_s = (184, 192, 206)
    azul = tonos((40, 84, 160))
    piel = (226, 176, 140)
    blanco = (255, 255, 255)
    # a cada color, el siguiente más claro: el brillo solo "sube" un escalón
    luz = {pla[0]: blanco, pla[1]: blanco, pla_s: pla[1], pla[2]: pla_s,
           azul[1]: azul[0], azul[2]: azul[1], azul[3]: azul[2]}

    def dibujar(k):
        im, d = lienzo()
        # cordón: dos tiras de 2 px que bajan en V hasta el gancho
        for dx in (0, 1):
            L(d, 9 + dx, 1, 14 + dx, 8, azul[2])
            L(d, 22 - dx, 1, 17 - dx, 8, azul[2])
        R(d, 14, 8, 17, 10, pla[2])
        R(d, 15, 9, 16, 9, azul[3])
        # tarjeta
        R(d, 9, 11, 22, 30, pla[1])
        R(d, 9, 11, 22, 11, pla[0]); R(d, 9, 11, 9, 30, pla[0])
        R(d, 22, 12, 22, 30, pla_s); R(d, 10, 30, 22, 30, pla_s)
        for x, y in ((9, 11), (22, 11), (9, 30), (22, 30)):
            _vacio(d, x, y)
        # franja institucional
        R(d, 10, 12, 21, 16, azul[1])
        R(d, 10, 16, 21, 16, azul[2])
        R(d, 11, 13, 12, 14, pla[0])
        R(d, 14, 13, 20, 13, pla[0]); R(d, 14, 15, 18, 15, azul[0])
        # foto
        R(d, 11, 18, 16, 26, azul[0])
        R(d, 12, 20, 15, 20, azul[3])
        P(d, 12, 21, azul[3]); R(d, 13, 21, 14, 21, piel); P(d, 15, 21, azul[3])
        R(d, 12, 22, 15, 23, piel); R(d, 13, 24, 14, 24, piel)
        R(d, 11, 25, 16, 26, azul[2])
        # datos y código de barras
        R(d, 18, 19, 21, 19, pla[2]); R(d, 18, 21, 21, 21, pla[2]); R(d, 18, 23, 20, 23, pla[2])
        for yy in (28, 29):
            for x in range(11, 22):
                if x not in (14, 17, 19):
                    P(d, x, yy, azul[3] if yy == 28 else pla[2])
        if k:
            s = (4, 9, 14)[k - 1]                     # el brillo avanza de izquierda a derecha
            px = im.load()
            for yy in range(11, 31):
                for xx in range(9, 23):
                    if (xx - (30 - yy) // 2) in (s, s + 1) and px[xx, yy][3]:
                        r, g, b, _a = px[xx, yy]
                        if (r, g, b) in luz:
                            px[xx, yy] = luz[(r, g, b)] + (255,)
        return im
    return cuadros(3, dibujar)


# ---------------------------------------------------------------------------------------------
# 2. Taza de café sobre su plato. Dos hilos de vapor cambian de forma en cuatro pasos.
# ---------------------------------------------------------------------------------------------
@_modelo('taza-cafe')
def taza_cafe():
    ce = tonos((230, 226, 216))
    cafe_o, cafe, cafe_l = (50, 30, 22), (88, 54, 34), (150, 100, 64)
    vapor = ce[0]

    onda = (0, 1, 1, 1, 0, -1, -1, -1)                   # el hilo serpentea con este vaivén

    def hilo(d, x0, tramos, fase):
        """Hilo de vapor de 2 px; cada tramo es (desde, hasta) en filas contadas desde el borde de la taza."""
        for desde, hasta in tramos:
            for i in range(desde, hasta + 1):
                x = x0 + onda[(i + fase) % 8]
                R(d, x, 10 - i, x + 1, 10 - i, vapor)

    def dibujar(k):
        im, d = lienzo()
        # plato
        E(d, 3, 26, 28, 30, ce[2]); E(d, 3, 25, 28, 29, ce[1])
        E(d, 8, 26, 23, 28, ce[2])
        # asa (detrás del cuerpo)
        E(d, 21, 18, 28, 26, ce[2]); E(d, 21, 17, 28, 25, ce[1]); _hueco(d, 23, 19, 26, 23)
        # cuerpo con tres tonos: luz a la izquierda, sombra a la derecha
        for y in range(16, 28):
            izq = 7 + round((y - 16) * 2 / 11)
            der = 22 - round((y - 16) * 2 / 11)
            for x in range(izq, der + 1):
                P(d, x, y, ce[0] if x <= izq + 1 else ce[2] if x >= der - 2 else ce[1])
        # boca y café
        E(d, 7, 12, 22, 19, ce[0])
        E(d, 8, 13, 21, 18, ce[2])
        E(d, 9, 14, 20, 18, cafe_o)
        E(d, 9, 14, 19, 17, cafe)
        R(d, 11, 15, 13, 15, cafe_l); P(d, 14, 14, cafe_l)
        # vapor: sube, se estira y al final se corta en dos
        if k:
            tramos = (((0, 2),), ((0, 4),), ((0, 6),), ((0, 2), (5, 7)))[k - 1]
            fase = (0, 2, 4, 6)[k - 1]
            hilo(d, 10, tramos, fase)
            hilo(d, 18, tramos, fase + 1)
        return im
    return cuadros(4, dibujar)


# ---------------------------------------------------------------------------------------------
# 3. Libro abierto de frente. Una hoja se levanta, cruza el lomo y cae sobre la otra página.
# ---------------------------------------------------------------------------------------------
@_modelo('libro-abierto')
def libro_abierto():
    cub = tonos((128, 54, 48))
    pag, pag_s, canto = (244, 240, 226), (214, 207, 186), (176, 166, 140)
    tinta, amar = (92, 98, 122), (246, 206, 70)
    lineas = ((3, 11), (3, 10), (3, 11), (3, 9), (3, 11))     # (u0, u1) de cada renglón

    def u_de(x):                                  # distancia al lomo
        return 15 - x if x <= 15 else x - 16

    def arriba(u):                                # las páginas se hunden hacia el lomo
        return 12 + round(2 * (13 - u) / 13)

    def pagina(d, x, dy=0, subrayado=False, sombra=False):
        u = u_de(x)
        t = arriba(u) + dy
        R(d, x, t, x, t + 12, pag_s if u <= 1 or sombra else pag)
        for i, (u0, u1) in enumerate(lineas):
            if u0 <= u <= u1:
                P(d, x, t + 3 + 2 * i, tinta)
                if subrayado and i == 2:
                    P(d, x, t + 8, amar)

    def base(d, sombreadas=()):
        for x in range(2, 30):
            u = u_de(x)
            t = arriba(u)
            if u == 13:
                R(d, x, t + 1, x, t + 16, cub[0] if x < 15 else cub[2])
                continue
            P(d, x, t + 13, pag_s); P(d, x, t + 14, canto)
            P(d, x, t + 15, cub[1]); P(d, x, t + 16, cub[2])
            pagina(d, x, subrayado=x <= 15, sombra=x in sombreadas)

    def hoja_derecha(d, ancho, alza):
        for j in range(ancho + 1):
            x = 16 + j
            t = 14 - round(alza * j / ancho)
            R(d, x, t, x, t + 12, canto if j == ancho else pag_s if j <= 1 else pag)
            if j > 1:
                P(d, x, t + 12, canto)            # canto de abajo
            if 2 <= j < ancho:
                for i in range(5):
                    if i < 4 or j <= ancho - 3:
                        P(d, x, t + 3 + 2 * i, tinta)

    def hoja_izquierda(d, ancho, alza):
        for x in range(15, 15 - ancho - 1, -1):
            dy = -round(alza * (15 - x) / ancho)
            t = arriba(u_de(x)) + dy
            P(d, x, t + 13, pag_s)                # sombra de la hoja sobre la página
            pagina(d, x, dy, subrayado=True)
            if x == 15 - ancho:
                R(d, x, t, x, t + 12, canto)

    def dibujar(k):
        im, d = lienzo()
        base(d, range(17, 27) if k == 1 else ())
        if k == 1:
            hoja_derecha(d, 9, 4)
        elif k == 2:
            for y in range(9, 22):
                x0 = 16 if y <= 12 else 15
                P(d, x0, y, pag); P(d, x0 + 1, y, canto)
        elif k == 3:
            hoja_izquierda(d, 10, 2)
        return im
    return cuadros(3, dibujar)


# ---------------------------------------------------------------------------------------------
# 4. Computador de la oficina: pantalla azul con candado. La pantalla parpadea.
# ---------------------------------------------------------------------------------------------
@_modelo('computador-oficina')
def computador_oficina():
    cas = tonos((176, 178, 186))
    pan = tonos((44, 96, 190))
    oro_l, oro, oro_s = (255, 232, 140), (240, 196, 70), (176, 128, 40)
    verde = (96, 214, 120)
    # por cuadro: fondo, cuerpo del candado, arco, ojo de la cerradura, luz de encendido
    estados = (
        (pan[1], oro, oro_s, pan[3], verde),
        (pan[0], oro_l, oro, pan[2], verde),
        (pan[3], oro_s, oro_s, pan[3], cas[2]),
        (pan[2], oro, oro_s, pan[3], verde),
    )

    def dibujar(k):
        im, d = lienzo()
        fondo, cuerpo, arco, ojo, led = estados[k]
        # monitor
        R(d, 3, 2, 28, 20, cas[1])
        R(d, 3, 2, 28, 2, cas[0]); R(d, 3, 2, 3, 20, cas[0])
        R(d, 4, 20, 28, 20, cas[2]); R(d, 28, 3, 28, 20, cas[2])
        for x, y in ((3, 2), (28, 2), (3, 20), (28, 20)):
            _vacio(d, x, y)
        R(d, 5, 4, 26, 17, cas[2])
        R(d, 6, 5, 25, 16, fondo)
        if k in (0, 3):
            R(d, 7, 6, 8, 6, pan[0]); P(d, 7, 7, pan[0])        # reflejo
        P(d, 24, 19, led); R(d, 15, 19, 16, 19, cas[2])
        # candado
        R(d, 14, 7, 17, 7, arco)
        R(d, 13, 8, 14, 9, arco); R(d, 17, 8, 18, 9, arco)
        R(d, 12, 10, 19, 14, cuerpo)
        R(d, 15, 11, 16, 13, ojo)
        # cuello y base
        R(d, 13, 21, 18, 23, cas[1]); R(d, 13, 21, 13, 23, cas[0]); R(d, 18, 21, 18, 23, cas[2])
        R(d, 9, 24, 22, 24, cas[0]); R(d, 9, 25, 22, 25, cas[2])
        # teclado en perspectiva
        POL(d, [(6, 27), (25, 27), (28, 30), (3, 30)], cas[1])
        R(d, 3, 30, 28, 30, cas[2])
        for x in range(7, 25, 2):
            P(d, x, 27, cas[0])
        for x in range(5, 27, 2):
            if x % 4 == 1:
                P(d, x, 28, cas[0])
        R(d, 10, 29, 21, 29, cas[0])
        for x in (5, 8, 23, 26):
            P(d, x, 29, cas[0])
        return im
    return cuadros(3, dibujar)


# ---------------------------------------------------------------------------------------------
# 5. Buzón de Bienestar, de pared: la ranura se ilumina y el sobre entra 1 px.
# ---------------------------------------------------------------------------------------------
@_modelo('buzon-bienestar')
def buzon_bienestar():
    te = tonos((52, 150, 150))
    sob, sob_s = (244, 240, 226), (200, 192, 170)
    rojo = (206, 66, 58)
    ranura = (te[3], (250, 222, 110), (255, 246, 190), (226, 170, 60))
    corazon = ('.XX..XX.', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...')

    def dibujar(k):
        im, d = lienzo()
        # cuerpo con la tapa redondeada
        R(d, 9, 4, 22, 4, te[0])
        R(d, 7, 5, 24, 5, te[0])
        R(d, 6, 6, 25, 27, te[1])
        R(d, 7, 28, 24, 28, te[3])
        R(d, 6, 6, 7, 27, te[0]); R(d, 6, 6, 6, 27, te[0])
        R(d, 24, 6, 25, 27, te[2]); R(d, 7, 27, 24, 27, te[2])
        # placa de la ranura
        R(d, 9, 10, 22, 15, te[2])
        R(d, 9, 15, 22, 15, te[3])
        R(d, 11, 12, 20, 13, ranura[k])
        # sobre asomando: la parte de abajo queda dentro de la ranura (hasta la fila 12)
        desp = 1 if k == 2 else 0
        arriba = 7 + desp
        for y in range(arriba, 13):
            R(d, 12, y, 19, y, sob)
        for i in range(4):                                 # solapa en V
            for x, y in ((12 + i, arriba + 1 + i), (19 - i, arriba + 1 + i)):
                if y <= 12:
                    P(d, x, y, sob_s)
        for y in (arriba + 4, arriba + 5):
            if y <= 12:
                R(d, 18, y, 19, y, rojo)
        # corazón de Bienestar y rótulo
        for j, fila in enumerate(corazon):
            for i, c in enumerate(fila):
                if c == 'X':
                    P(d, 12 + i, 18 + j, sob)
        R(d, 11, 25, 20, 25, sob_s)
        return im
    return cuadros(3, dibujar)


# ---------------------------------------------------------------------------------------------
# 6. Cartelera de horarios: marco de madera, fieltro y una hoja con franjas que se iluminan.
# ---------------------------------------------------------------------------------------------
@_modelo('cartelera-horarios')
def cartelera_horarios():
    mad = tonos((150, 100, 56))
    fie = tonos((62, 118, 98))
    papel, papel_s = (246, 242, 230), (222, 216, 198)
    azul, tinta, amar, rojo = (56, 92, 168), (104, 108, 128), (255, 236, 140), (214, 60, 56)
    textos = ((5, 7), (4, 6), (5, 6), (3, 7))             # largo de la etiqueta y de la hora, por franja

    def dibujar(k):
        im, d = lienzo()
        R(d, 2, 4, 29, 27, mad[1])
        R(d, 2, 4, 29, 4, mad[0]); R(d, 2, 4, 2, 27, mad[0])
        R(d, 3, 27, 29, 27, mad[2]); R(d, 29, 5, 29, 27, mad[2])
        for x, y in ((2, 4), (29, 4), (2, 27), (29, 27)):
            _vacio(d, x, y)
        R(d, 4, 6, 27, 25, fie[1])
        R(d, 4, 6, 27, 6, fie[2]); R(d, 4, 6, 4, 25, fie[2])
        # hoja, con su sombra
        R(d, 8, 9, 25, 24, fie[2])
        R(d, 7, 8, 24, 23, papel)
        R(d, 7, 8, 24, 10, azul)
        R(d, 9, 9, 16, 9, papel); R(d, 9, 10, 13, 10, papel_s)
        for b in range(4):
            y = 11 + 3 * b
            R(d, 7, y, 24, y + 2, amar if k == b + 1 and b < 3 else papel if b % 2 == 0 else papel_s)
            largo_a, largo_b = textos[b]
            R(d, 9, y + 1, 8 + largo_a, y + 1, tinta)
            R(d, 23 - largo_b, y + 1, 22, y + 1, tinta)
        # chincheta
        R(d, 15, 6, 16, 7, rojo)
        return im
    return cuadros(3, dibujar)


# ---------------------------------------------------------------------------------------------
# 7. Botiquín blanco de pared con cruz roja. La cruz pulsa: crece 1 px y cambia de tono.
# ---------------------------------------------------------------------------------------------
@_modelo('botiquin')
def botiquin():
    bl = tonos((236, 238, 242))
    gris, gris_o = (150, 158, 172), (96, 104, 120)
    rojo_s, rojo, rojo_l, rojo_ll = (140, 26, 40), (206, 44, 52), (232, 78, 76), (250, 126, 108)
    # por cuadro: color de la cruz y si está agrandada
    pulso = ((rojo, False), (rojo_l, True), (rojo_ll, True), (rojo_l, False))

    def cruz(d, color, grande, dx=0, dy=0):
        if grande:
            R(d, 13 + dx, 12 + dy, 18 + dx, 25 + dy, color)
            R(d, 9 + dx, 16 + dy, 22 + dx, 21 + dy, color)
        else:
            R(d, 14 + dx, 13 + dy, 17 + dx, 24 + dy, color)
            R(d, 10 + dx, 17 + dy, 21 + dx, 20 + dy, color)

    def dibujar(k):
        im, d = lienzo()
        # asa
        R(d, 12, 2, 19, 2, gris); R(d, 12, 3, 13, 4, gris); R(d, 18, 3, 19, 4, gris)
        # caja
        R(d, 4, 5, 27, 28, bl[1])
        R(d, 4, 5, 27, 5, bl[0]); R(d, 4, 5, 4, 28, bl[0])
        R(d, 26, 6, 27, 28, bl[2]); R(d, 5, 28, 27, 28, bl[2])
        R(d, 4, 9, 27, 9, bl[2])
        for x, y in ((4, 5), (27, 5), (4, 28), (27, 28)):
            _vacio(d, x, y)
        R(d, 14, 8, 17, 10, gris_o); R(d, 15, 9, 16, 9, bl[0])
        # cruz con sombra
        color, grande = pulso[k]
        cruz(d, rojo_s, grande, 1, 1)
        cruz(d, color, grande)
        return im
    return cuadros(3, dibujar)
