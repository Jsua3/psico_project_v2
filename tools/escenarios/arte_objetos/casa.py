"""Modelos de la casa. Ver __init__.py para la API y las reglas."""
from PIL import Image

from arte_objetos import E, L, P, POL, R, cuadros, lienzo, tonos  # noqa: F401

MODELOS = {}


def _modelo(id_):
    def registrar(fn):
        MODELOS[id_] = fn
        return fn
    return registrar


@_modelo('televisor')
def televisor():
    """Televisor pequeño de marco oscuro con patas; la imagen de la pantalla cambia como ruido suave."""
    marco = tonos((62, 64, 78))
    barras = [(238, 236, 226), (242, 202, 72), (80, 198, 210), (96, 192, 100), (208, 86, 178), (214, 80, 72)]

    def dibujar(k):
        im, d = lienzo()
        L(d, 15, 5, 10, 1, marco[0]); L(d, 16, 5, 21, 1, marco[0])      # antena en V
        POL(d, [(5, 26), (8, 26), (7, 30), (4, 30)], marco[2])          # patas
        POL(d, [(23, 26), (26, 26), (27, 30), (24, 30)], marco[2])
        R(d, 14, 5, 17, 5, marco[2])
        R(d, 2, 6, 29, 25, marco[1])                                     # cuerpo
        R(d, 2, 6, 29, 6, marco[0]); R(d, 2, 6, 2, 25, marco[0])
        R(d, 2, 25, 29, 25, marco[2]); R(d, 29, 6, 29, 25, marco[2])
        R(d, 4, 8, 23, 23, marco[3])                                     # bisel hundido
        for i in range(6):                                               # franjas: arriba y abajo corren al revés
            x = 5 + 3 * i
            R(d, x, 9, x + 2, 19, barras[(i + k) % 6])
            R(d, x, 20, x + 2, 22, barras[(5 - i - k) % 6])
        if k:                                                            # una línea de ruido que baja
            xs = 5 + (k * 5) % 10
            R(d, xs, 9 + 3 * (k - 1), xs + 7, 9 + 3 * (k - 1), barras[0])
        R(d, 25, 8, 28, 23, marco[2])                                    # panel lateral
        R(d, 26, 10, 27, 11, marco[0]); R(d, 26, 14, 27, 15, marco[0])
        for yy in (18, 20, 22):
            R(d, 25, yy, 28, yy, marco[3])
        return im
    return cuadros(4, dibujar)


@_modelo('portarretrato')
def portarretrato():
    """Marco de madera con una foto de dos siluetas y un hueco a la derecha; un brillo recorre el vidrio."""
    mad = tonos((156, 102, 56))
    papel, pared, adulto, nino, brillo = (238, 232, 216), (178, 204, 216), (60, 68, 92), (96, 106, 134), (252, 252, 248)

    def dibujar(k):
        im, d = lienzo()
        R(d, 2, 29, 29, 30, mad[3]); R(d, 2, 29, 29, 29, mad[2])         # pie del marco
        R(d, 3, 4, 28, 28, mad[1])
        R(d, 3, 4, 28, 4, mad[0]); R(d, 3, 4, 3, 28, mad[0])
        R(d, 3, 28, 28, 28, mad[2]); R(d, 28, 4, 28, 28, mad[2])
        R(d, 5, 6, 26, 26, mad[2])                                       # labio interior
        R(d, 6, 7, 25, 25, papel)                                        # paspartú
        R(d, 8, 9, 23, 22, pared)                                        # la foto
        E(d, 9, 11, 13, 15, adulto)                                      # adulto
        POL(d, [(8, 22), (8, 19), (10, 16), (12, 16), (14, 19), (14, 22)], adulto)
        E(d, 15, 15, 18, 18, nino)                                       # niña o niño
        POL(d, [(14, 22), (15, 19), (18, 19), (19, 22)], nino)
        if k:                                                            # brillo en diagonal que cruza el vidrio
            s = (22, 31, 40)[k - 1]
            for x in range(8, 24):
                for y in range(9, 23):
                    if s <= x + y <= s + 1:
                        P(d, x, y, brillo)
        return im
    return cuadros(3, dibujar)


@_modelo('telefono-fijo')
def telefono_fijo():
    """Teléfono beige de mesa con auricular encima y cable rizado; al acercarse vibra y suena."""
    be = tonos((222, 200, 156))
    sonido = (232, 170, 56)

    def arcos(d, dy, interior, exterior):
        # sonido a cada lado del auricular: arcos de 3 y de 5 px que no siguen el temblor
        y = 13 + dy
        for lado, xi, xe in ((-1, 3, 1), (1, 28, 30)):
            for x, grande in ((xi, False), (xe, True)):
                if (grande and not exterior) or (not grande and not interior):
                    continue
                a = 1 if lado < 0 else -1                      # hacia dónde se cierra el arco
                P(d, x, y, sonido); P(d, x + a, y - 1, sonido); P(d, x + a, y + 1, sonido)
                if grande:
                    P(d, x + a, y - 2, sonido); P(d, x + a, y + 2, sonido)
                    P(d, x, y - 1, sonido); P(d, x, y + 1, sonido)

    def dibujar(k):
        im, d = lienzo()
        dx, dy = ((0, 0), (1, -1), (-1, -1), (0, -1))[k]
        # cable rizado, de la base hacia la izquierda
        for y in range(19, 29, 2):
            R(d, 2, y, 4, y, be[2]); P(d, 1, y + 1, be[2]); P(d, 5, y + 1, be[2])
        # base
        POL(d, [(8, 18), (23, 18), (28, 30), (3, 30)], be[1])
        POL(d, [(8, 18), (23, 18), (24, 21), (7, 21)], be[0])             # cara superior inclinada
        R(d, 3, 29, 28, 30, be[2])
        for fila in (0, 1):                                                # teclado: 3 x 2 teclas
            for col in range(3):
                R(d, 12 + 4 * col, 23 + 3 * fila, 13 + 4 * col, 24 + 3 * fila, be[3])
        # auricular: dos copas unidas por una barra
        R(d, 11 + dx, 13 + dy, 20 + dx, 15 + dy, be[1]); R(d, 11 + dx, 13 + dy, 20 + dx, 13 + dy, be[0])
        for x0 in (6, 21):
            R(d, x0 + dx, 11 + dy, x0 + 4 + dx, 17 + dy, be[1])
            R(d, x0 + dx, 11 + dy, x0 + 4 + dx, 11 + dy, be[0]); R(d, x0 + dx, 11 + dy, x0 + dx, 17 + dy, be[0])
            R(d, x0 + dx, 17 + dy, x0 + 4 + dx, 17 + dy, be[2]); R(d, x0 + 4 + dx, 11 + dy, x0 + 4 + dx, 17 + dy, be[2])
        if k:
            arcos(d, dy, k in (1, 2), k in (2, 3))
        return im
    return cuadros(3, dibujar)


@_modelo('cerrojo-puerta')
def cerrojo_puerta():
    """Pasador metálico sobre un trozo de puerta de madera; al acercarse el pasador tiembla."""
    mad = tonos((168, 114, 64))
    ac = tonos((150, 158, 168))

    def dibujar(k):
        im, d = lienzo()
        dx = (0, -1, 1, -1)[k]
        R(d, 3, 3, 28, 29, mad[1])                                         # puerta de tablones
        for x in (9, 16, 23):
            R(d, x, 3, x, 29, mad[3]); R(d, x + 1, 3, x + 1, 29, mad[0])
        for x, y in ((5, 6), (5, 22), (12, 9), (12, 25), (19, 5), (19, 24), (26, 12), (26, 21)):
            R(d, x, y, x, y + 2, mad[2])                                   # vetas
        R(d, 3, 3, 3, 29, mad[0]); R(d, 28, 3, 28, 29, mad[2]); R(d, 3, 29, 28, 29, mad[2])
        R(d, 21, 10, 26, 20, ac[2]); R(d, 21, 10, 26, 10, ac[1]); R(d, 26, 10, 26, 20, ac[3])   # cierre del marco
        R(d, 22, 13, 25, 17, ac[3]); P(d, 23, 11, ac[3]); P(d, 23, 19, ac[3])
        R(d, 5, 10, 10, 20, ac[1]); R(d, 5, 10, 10, 10, ac[0]); R(d, 5, 10, 5, 20, ac[0])   # placa
        R(d, 5, 20, 10, 20, ac[2]); R(d, 10, 10, 10, 20, ac[2])
        P(d, 7, 12, ac[3]); P(d, 7, 18, ac[3])                             # tornillos
        for x in (12, 18):                                                 # argollas por donde corre la barra
            R(d, x, 12, x + 1, 18, ac[2]); R(d, x, 12, x + 1, 12, ac[0]); R(d, x, 13, x, 18, ac[1])
        R(d, 11 + dx, 14, 24 + dx, 16, ac[1])                              # la barra
        R(d, 11 + dx, 14, 24 + dx, 14, ac[0]); R(d, 11 + dx, 16, 24 + dx, 16, ac[2])
        R(d, 15 + dx, 10, 16 + dx, 13, ac[1]); R(d, 15 + dx, 10, 16 + dx, 10, ac[0])   # perilla
        P(d, 16 + dx, 11, ac[2]); P(d, 16 + dx, 12, ac[2]); P(d, 16 + dx, 13, ac[2])
        return im
    return cuadros(3, dibujar)


@_modelo('peluche')
def peluche():
    """Oso de peluche café, sentado en el piso; al acercarse se mece de lado a lado."""
    cafe = tonos((150, 98, 56))
    crema, mono, mono2 = (232, 208, 168), (200, 62, 70), (150, 40, 52)

    def dibujar(k):
        im, d = lienzo()
        t = (0, -1, 0, 1)[k]                       # inclinación de cabeza, brazos y moño
        h = 0 if k != 2 else -1                    # en el centro del vaivén sube 1 px
        # patas delanteras, abiertas
        for x0 in (5, 18):
            E(d, x0, 24, x0 + 8, 30, cafe[1]); E(d, x0 + 2, 26, x0 + 6, 29, crema)
        # cuerpo
        E(d, 8, 15, 23, 29, cafe[1]); E(d, 12, 19, 19, 27, crema)
        # brazos
        for x0 in (4, 22):
            E(d, x0 + t, 17 + h, x0 + 5 + t, 24 + h, cafe[1])
        P(d, 5 + t, 19 + h, cafe[0])
        # orejas
        for cx in (8, 23):
            E(d, cx - 3 + t, 2 + h, cx + 3 + t, 8 + h, cafe[1])
        R(d, 7 + t, 4 + h, 8 + t, 5 + h, cafe[2]); R(d, 23 + t, 4 + h, 24 + t, 5 + h, cafe[2])
        # cabeza
        E(d, 8 + t, 3 + h, 23 + t, 18 + h, cafe[1])
        R(d, 11 + t, 5 + h, 13 + t, 5 + h, cafe[0]); P(d, 10 + t, 6 + h, cafe[0])
        # hocico, nariz, ojos
        E(d, 12 + t, 10 + h, 19 + t, 16 + h, crema)
        R(d, 14 + t, 11 + h, 17 + t, 12 + h, cafe[3]); R(d, 15 + t, 13 + h, 16 + t, 13 + h, cafe[3])
        R(d, 11 + t, 8 + h, 12 + t, 9 + h, cafe[3]); R(d, 19 + t, 8 + h, 20 + t, 9 + h, cafe[3])
        # moño
        POL(d, [(15 + t, 19 + h), (11 + t, 17 + h), (11 + t, 21 + h)], mono); POL(d, [(16 + t, 19 + h), (20 + t, 17 + h), (20 + t, 21 + h)], mono)
        R(d, 15 + t, 18 + h, 16 + t, 20 + h, mono2)
        return im
    return cuadros(3, dibujar)


@_modelo('cuaderno-escolar')
def cuaderno_escolar():
    """Cuaderno de espiral abierto, con tareas a medias y un lápiz encima; al acercarse pasa una hoja."""
    azul = tonos((58, 104, 176))
    papel, sombra, renglon, tinta, espiral = (240, 236, 222), (212, 206, 188), (158, 184, 216), (70, 76, 96), (112, 118, 130)
    amarillo, amarillo2, goma, madera = (240, 200, 60), (196, 150, 36), (226, 120, 140), (222, 184, 130)
    borde = (252, 250, 242)
    renglones = (8, 11, 14, 17, 20, 23)

    def hoja(d, x_libre, alto):
        """Hoja que gira alrededor del lomo (x=15..16): x_libre es su borde libre y alto cuánto sube ese borde."""
        der = x_libre > 16
        a = 16 if der else 15
        sx = 1 if der else -1
        # sombra que proyecta sobre la hoja de abajo
        POL(d, [(a, 6), (x_libre + sx, 6 - alto // 2), (x_libre + sx, 25 - alto // 2), (a, 25)], sombra)
        POL(d, [(a, 6), (x_libre, 6 - alto), (x_libre, 24 - alto), (a, 24)], papel)
        for y in renglones:                                           # renglones inclinados junto con la hoja
            L(d, a + sx, y, x_libre - sx, y - alto, renglon)
        L(d, x_libre, 6 - alto, x_libre, 24 - alto, borde)             # canto libre, iluminado
        L(d, a, 6, x_libre, 6 - alto, borde)

    def dibujar(k):
        im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
        base, d = lienzo()
        R(d, 2, 5, 29, 27, azul[1]); R(d, 2, 5, 29, 5, azul[0]); R(d, 2, 5, 2, 27, azul[0])      # tapas
        R(d, 2, 26, 29, 27, azul[2]); R(d, 29, 5, 29, 27, azul[2])
        R(d, 3, 6, 14, 24, papel)                                                                # página izquierda
        for y in renglones:
            R(d, 4, y, 13, y, renglon)
        for y, xs in ((7, ((4, 8), (10, 12))), (10, ((4, 6), (8, 12))), (13, ((4, 9),))):        # tarea a medias
            for a, b in xs:
                R(d, a, y, b, y, tinta)
        R(d, 17, 6, 28, 24, papel)                                                               # página derecha
        for y in renglones:
            R(d, 18, y, 27, y, renglon)
        if k:
            hoja(d, (0, 25, 19, 8)[k], (0, 3, 5, 3)[k])
        R(d, 14, 6, 17, 24, sombra)                                                              # lomo
        for y in (7, 10, 13, 16, 19, 22):
            R(d, 14, y, 17, y + 1, espiral); P(d, 14, y, sombra); P(d, 17, y + 1, sombra)       # argollas
        # lápiz diagonal, encima de las páginas
        pts = [(18, 24), (19, 23), (20, 22), (21, 21), (22, 20), (23, 19), (24, 18), (25, 17), (26, 16), (27, 15)]
        cols = [tinta, madera, madera, amarillo, amarillo, amarillo, amarillo, espiral, goma, goma]
        for (x, y), c in zip(pts, cols):
            P(d, x, y, c)
            if c is amarillo:
                P(d, x + 1, y, amarillo2)
            elif c is madera:
                P(d, x + 1, y, amarillo2)
            elif c in (espiral, goma):
                P(d, x + 1, y, c)
        im.alpha_composite(base, (0, 2))                                                         # apoyado abajo
        return im
    return cuadros(3, dibujar)


@_modelo('nevera-notas')
def nevera_notas():
    """Parte de la puerta de una nevera blanca con notas e imanes; al acercarse un imán se mueve y una nota se levanta."""
    bl = tonos((232, 236, 240))
    ac = tonos((140, 146, 156))
    amar, rosa, menta = (246, 220, 96), (244, 164, 184), (176, 224, 184)
    rojo, azul, verde = (214, 64, 60), (66, 110, 214), (62, 168, 92)

    def nota(d, x0, y0, x1, y1, c, lineas, alza=0):
        # la sombra sobre la puerta crece cuando la nota se levanta
        R(d, x0 + 1, y0 + 1 - alza, x1 + 1 + alza, y1 + 1, bl[2])
        R(d, x0, y0 - alza, x1, y1 - alza, c)
        for yy, largo in lineas:
            R(d, x0 + 1, y0 + yy - alza, x0 + largo, y0 + yy - alza, ac[2])

    def iman(d, cx, cy, c):
        R(d, cx - 1, cy - 1, cx + 1, cy + 1, c)
        P(d, cx - 1, cy - 1, bl[0]); P(d, cx + 1, cy + 1, ac[3])

    def dibujar(k):
        im, d = lienzo()
        R(d, 3, 2, 28, 30, bl[1])                                          # puerta
        R(d, 3, 2, 28, 2, bl[0]); R(d, 3, 2, 3, 30, bl[0])
        R(d, 28, 2, 28, 30, bl[2]); R(d, 3, 29, 28, 30, bl[2]); R(d, 4, 30, 27, 30, ac[3])
        R(d, 5, 8, 6, 20, ac[1]); R(d, 5, 8, 5, 20, ac[0]); R(d, 6, 8, 6, 20, ac[2])     # manija
        R(d, 5, 8, 6, 8, ac[0]); R(d, 5, 20, 6, 20, ac[2])
        alza_a = 1 if k in (1, 2) else 0
        alza_b = 1 if k == 3 else 0
        nota(d, 9, 5, 17, 14, amar, ((3, 6), (5, 7), (7, 5)), alza_a)
        nota(d, 19, 8, 26, 16, rosa, ((3, 5), (5, 6), (7, 4)), alza_b)
        nota(d, 11, 19, 20, 28, menta, ((3, 7), (5, 6), (7, 8)))
        iman(d, 13 + (0, 1, 1, 1)[k], 6 - alza_a + (1 if k == 2 else 0), rojo)   # el imán rojo se corre sobre su nota
        iman(d, 22, 9 - alza_b, azul)
        iman(d, 15, 20, verde)
        return im
    return cuadros(3, dibujar)


@_modelo('maleta')
def maleta():
    """Maleta de viaje baja y ancha, abierta a medias con ropa doblada en capas; al acercarse la tapa sube y asoma más ropa."""
    cas = tonos((50, 126, 138))
    forro, forro2, hueco = (126, 120, 158), (92, 86, 124), (46, 42, 64)
    azul, roja, mostaza, crema = (74, 104, 190), (212, 82, 76), (232, 184, 72), (238, 234, 224)
    metal, metal2 = (206, 214, 228), (112, 122, 142)                                          # herrajes: claro y sombra

    def quitar(d, x, y):
        d.point((x, y), fill=(0, 0, 0, 0))

    def prenda(d, x0, x1, y0, c):
        """Ropa doblada en capas: pliegue crema arriba, dos filas de tela y una rendija oscura entre capas."""
        R(d, x0, y0, x1, 21, c)
        R(d, x0, y0, x1, y0, crema)
        for y in range(y0 + 3, 22, 3):
            R(d, x0, y, x1, y, hueco)

    def dibujar(k):
        im, d = lienzo()
        alza = (0, 1, 2, 1)[k]
        top = 8 - alza
        # tapa abierta hacia atrás: casco redondeado por fuera, forro acolchado por dentro
        POL(d, [(6, top), (25, top), (26, top + 1), (29, 17), (2, 17), (5, top + 1)], cas[1])
        POL(d, [(7, top + 2), (24, top + 2), (25, top + 3), (28, 17), (3, 17), (6, top + 3)], forro)
        R(d, 6, top, 25, top, cas[0]); R(d, 2, 17, 29, 17, cas[2])
        for x in (8, 23):                                                                    # correas elásticas del forro
            R(d, x, top + 3, x, 16, forro2); R(d, x, 13, x, 14, mostaza)
        R(d, 11, top + 3, 20, top + 5, forro2); R(d, 11, top + 3, 20, top + 3, metal)         # bolsillo con cierre
        R(d, 19, top + 4, 20, top + 4, metal)
        # asa rígida en el canto superior de la tapa: arco de 2 px
        R(d, 13, top - 3, 18, top - 3, metal2); R(d, 13, top - 3, 15, top - 3, metal)
        R(d, 12, top - 2, 13, top - 2, metal2); R(d, 18, top - 2, 19, top - 2, metal2)
        R(d, 11, top - 1, 12, top - 1, metal2); R(d, 19, top - 1, 20, top - 1, metal2)
        # hueco de la base y la ropa doblada que asoma, por capas
        R(d, 2, 17, 29, 21, hueco)
        b = 1 if k else 0
        m = 15 - (1 if k >= 2 else 0)
        prenda(d, 4, 15, 16 - b, azul)
        prenda(d, 18, 27, m, mostaza)
        prenda(d, 10, 21, 18, roja)
        # frente de la base, con esquinas protectoras redondeadas
        R(d, 2, 22, 29, 27, cas[1])
        R(d, 2, 22, 29, 22, cas[0]); R(d, 2, 22, 2, 27, cas[0])
        R(d, 2, 27, 29, 27, cas[2]); R(d, 29, 22, 29, 27, cas[2])
        for x in (12, 19):                                                                   # nervios del casco
            R(d, x, 24, x, 26, cas[2])
        for x0, x1 in ((2, 5), (26, 29)):                                                    # esquinas de metal
            R(d, x0, 24, x1, 27, metal2)
        P(d, 3, 24, metal); P(d, 27, 24, metal)
        for x in (2, 29):
            quitar(d, x, 27)
        for x in (6, 22):                                                                    # broches metálicos claros
            R(d, x, 22, x + 3, 25, metal); R(d, x, 25, x + 3, 25, metal2)
            R(d, x + 1, 23, x + 2, 23, hueco)
        for x in (4, 25):                                                                    # ruedecitas
            R(d, x, 28, x + 2, 30, hueco); quitar(d, x, 30); quitar(d, x + 2, 30); P(d, x + 1, 29, metal2)
        if k >= 2:                                                                           # una manga cuelga por el frente
            R(d, 14, 22, 16, 23 + (3 if k == 2 else 1), roja); R(d, 14, 24 + (2 if k == 2 else 0), 16, 24 + (2 if k == 2 else 0), crema)
        return im
    return cuadros(3, dibujar)
