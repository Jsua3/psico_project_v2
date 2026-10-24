"""Modelos de la comisaría de familia. Ver __init__.py para la API y las reglas."""
from arte_objetos import E, L, P, POL, R, cuadros, lienzo, tonos  # noqa: F401

MODELOS = {}


def _mapa(d, x0, y0, filas, paleta):
    """Dibuja un mapa de bits: cada carácter de `filas` que esté en `paleta` es un píxel."""
    for j, fila in enumerate(filas):
        for i, ch in enumerate(fila):
            if ch in paleta:
                P(d, x0 + i, y0 + j, paleta[ch])


# ── dispensador de turnos ──────────────────────────────────────────────────────

def dispensador_turnos():
    """Dispensador rojo de pared con rollo, pantalla y un tiquete asomando por la ranura."""
    rojo = tonos((206, 54, 52))
    papel, papel_s = (244, 240, 226), (200, 194, 176)
    negro, ambar = (36, 32, 42), (250, 190, 62)
    tres = ('XXX', '..X', 'XXX', '..X', 'XXX')
    siete = ('XXX', '..X', '.X.', '.X.', '.X.')

    def dibujar(k):
        im, d = lienzo()
        sale = (0, 1, 2, 1)[k]          # cuánto ha bajado el tiquete
        # cuerpo con el bisel arriba-izquierda
        R(d, 8, 3, 23, 3, rojo[0]); R(d, 7, 4, 24, 23, rojo[1]); R(d, 8, 24, 23, 24, rojo[2])
        R(d, 7, 4, 7, 22, rojo[0]); R(d, 24, 4, 24, 23, rojo[2])
        # ventana con el rollo de papel visto de lado
        R(d, 9, 5, 22, 11, rojo[3])
        R(d, 13, 6, 21, 10, papel); R(d, 13, 10, 21, 10, papel_s)
        E(d, 10, 5, 16, 11, papel_s); E(d, 10, 5, 15, 10, papel); R(d, 12, 7, 13, 9, negro)
        # pantalla con el número
        R(d, 9, 13, 22, 19, negro)
        _mapa(d, 12, 14, tres, {'X': ambar}); _mapa(d, 17, 14, siete, {'X': ambar})
        # ranura y tornillos
        R(d, 10, 21, 21, 22, negro)
        P(d, 9, 4, rojo[3]); P(d, 22, 4, rojo[3])
        # tiquete que asoma
        fin = 27 + sale
        R(d, 12, 22, 19, fin, papel); R(d, 19, 22, 19, fin, papel_s)
        for x in (12, 14, 16, 18):
            P(d, x, fin + 1, papel)
        if k == 2:                      # sale el número: marca oscura
            R(d, 13, fin - 2, 18, fin - 1, negro); R(d, 14, fin - 4, 17, fin - 4, negro)
        else:
            R(d, 14, fin - 2, 17, fin - 2, papel_s)
        return im
    return cuadros(3, dibujar)


# ── sello y tinta ──────────────────────────────────────────────────────────────

def sello_tinta():
    """Sello de madera sobre una caja de tinta abierta; baja a la almohadilla y vuelve."""
    madera = tonos((176, 118, 66))
    azul = tonos((44, 88, 196))
    lata = tonos((122, 128, 142))
    goma = (56, 42, 46)

    def dibujar(k):
        im, d = lienzo()
        dy = (0, 2, 5, 2)[k]
        # caja de lata abierta con la almohadilla de tinta
        R(d, 3, 20, 28, 30, lata[1]); R(d, 3, 20, 28, 20, lata[0]); R(d, 3, 21, 4, 26, lata[0])
        R(d, 27, 21, 28, 26, lata[2]); R(d, 3, 26, 28, 26, lata[0]); R(d, 3, 29, 28, 30, lata[2])
        R(d, 5, 21, 26, 25, azul[1]); R(d, 5, 21, 26, 21, azul[0]); R(d, 5, 25, 26, 25, azul[2])
        for x, y in ((8, 23), (12, 22), (16, 24), (20, 23), (24, 22), (14, 23), (22, 24)):
            P(d, x, y, azul[2])
        # sello de madera
        E(d, 12, 1 + dy, 19, 6 + dy, madera[1])
        R(d, 13, 2 + dy, 14, 3 + dy, madera[0]); R(d, 18, 5 + dy, 19, 5 + dy, madera[2])
        R(d, 14, 7 + dy, 17, 9 + dy, madera[2]); R(d, 14, 7 + dy, 15, 9 + dy, madera[1])
        R(d, 9, 10 + dy, 22, 15 + dy, madera[1]); R(d, 9, 10 + dy, 22, 10 + dy, madera[0])
        R(d, 9, 11 + dy, 9, 14 + dy, madera[0]); R(d, 22, 11 + dy, 22, 15 + dy, madera[2])
        R(d, 9, 15 + dy, 22, 15 + dy, madera[2])
        R(d, 10, 16 + dy, 21, 17 + dy, goma)
        if k in (2, 3):                 # la goma sale entintada
            R(d, 10, 17 + dy, 21, 17 + dy, azul[2])
        return im
    return cuadros(3, dibujar)


# ── carpeta de medidas de protección ───────────────────────────────────────────

def carpeta_medidas_proteccion():
    """Carpeta manila gruesa con pestaña y franja morada; un destello cruza la pestaña."""
    manila = tonos((226, 188, 112))
    morado = tonos((124, 76, 168))
    papel = (246, 242, 228)
    brillo = (255, 255, 255)
    escudo = ('XXXXX', 'XXXXX', 'XXXXX', '.XXX.', '..X..')

    def dibujar(k):
        im, d = lienzo()
        sube = (0, 1, 1, 0)[k]          # la tapa se levanta 1 px
        y = 9 - sube                    # borde de arriba de la tapa
        # grosor: tapa trasera y hojas que asoman a la derecha y abajo
        R(d, 7, 12, 28, 29, manila[2])
        R(d, 6, 11, 26, 28, papel); R(d, 6, 11, 26, 11, manila[0])
        # tapa delantera
        R(d, 4, y, 25, y + 17, manila[1]); R(d, 4, y, 25, y, manila[0]); R(d, 4, y, 4, y + 17, manila[0])
        R(d, 25, y, 25, y + 17, manila[2]); R(d, 4, y + 17, 25, y + 17, manila[2])
        # pestaña y franja de color
        R(d, 7, y - 5, 16, y, morado[1]); R(d, 7, y - 5, 16, y - 5, morado[0]); R(d, 16, y - 4, 16, y, morado[2])
        R(d, 4, y + 6, 25, y + 9, morado[1]); R(d, 4, y + 6, 25, y + 6, morado[0]); R(d, 4, y + 9, 25, y + 9, morado[2])
        # etiqueta con renglones y escudo
        R(d, 7, y + 11, 16, y + 16, papel)
        R(d, 8, y + 12, 15, y + 12, manila[2]); R(d, 8, y + 14, 13, y + 14, manila[2])
        _mapa(d, 18, y + 11, escudo, {'X': morado[1]})
        P(d, 19, y + 12, morado[0]); P(d, 20, y + 12, morado[0])
        # destello en diagonal que recorre la pestaña de izquierda a derecha
        if k:
            cx = (0, 9, 11, 13)[k]
            for j in range(4):
                P(d, cx + 2 - j, y - 4 + j, brillo)
                P(d, cx + 3 - j, y - 4 + j, morado[0])
        return im
    return cuadros(3, dibujar)


# ── cámara de seguridad ────────────────────────────────────────────────────────

def camara_seguridad():
    """Cámara tipo bala en un soporte de pared; la luz roja parpadea."""
    gris = tonos((206, 210, 220))
    metal = tonos((104, 110, 126))
    negro, vidrio = (30, 32, 44), (44, 78, 140)
    rojo, halo, apagado = (244, 52, 46), (250, 160, 150), (120, 40, 44)
    desde = 2                           # baja todo el dibujo para centrarlo

    def dibujar(k):
        im, d = lienzo()

        def r(x0, y0, x1, y1, c):
            R(d, x0, y0 + desde, x1, y1 + desde, c)

        def p(x, y, c):
            P(d, x, y + desde, c)
        # soporte de pared
        r(27, 6, 29, 22, metal[1]); r(27, 6, 27, 22, metal[0]); r(29, 6, 29, 22, metal[2])
        p(28, 8, metal[3]); p(28, 20, metal[3])
        r(22, 12, 27, 15, metal[1]); r(22, 12, 27, 12, metal[0]); r(22, 15, 27, 15, metal[2])
        E(d, 19, 9 + desde, 24, 18 + desde, metal[2]); E(d, 19, 9 + desde, 23, 17 + desde, metal[1])
        p(20, 11, metal[0])
        # cuerpo con visera
        r(5, 9, 21, 18, gris[1]); r(5, 9, 21, 9, gris[0])
        r(5, 16, 21, 17, gris[2]); r(5, 18, 21, 18, gris[3])
        r(3, 6, 21, 7, gris[0]); r(3, 8, 21, 8, gris[2]); r(21, 6, 21, 8, gris[3])
        # lente
        r(2, 9, 5, 18, negro); r(3, 11, 4, 16, vidrio); p(3, 11, gris[0]); p(3, 12, gris[0])
        r(7, 10, 7, 17, gris[2])
        # luz roja: encendida (0), apagada (1) y destello (2)
        if k == 1:
            r(13, 11, 14, 13, apagado)
        else:
            halos = [(12, 11), (15, 11), (12, 13), (15, 13), (13, 10), (14, 10), (13, 14), (14, 14)]
            if k == 2:
                halos += [(12, 10), (15, 10), (12, 14), (15, 14), (11, 12), (16, 12)]
            for x, y in halos:
                p(x, y, halo)
            r(13, 11, 14, 13, rojo)
        return im
    return cuadros(2, dibujar)


# ── afiche de rutas de atención ────────────────────────────────────────────────

def afiche_rutas_atencion():
    """Afiche con encabezado y cuatro pasos numerados unidos por flechas; el brillo baja iluminándolos."""
    papel, papel_s = (246, 244, 234), (206, 202, 188)
    teal = tonos((38, 128, 138))
    flecha = (96, 106, 120)
    oro, oro_c = (250, 204, 70), (255, 238, 170)
    blanco = (255, 255, 255)
    digitos = {
        1: ('.X.', 'XX.', '.X.', '.X.', 'XXX'),
        2: ('XXX', '..X', 'XXX', 'X..', 'XXX'),
        3: ('XXX', '..X', 'XXX', '..X', 'XXX'),
        4: ('X.X', 'X.X', 'XXX', '..X', '..X'),
    }

    def paso(d, n, cx, cy, encendido):
        E(d, cx - 3, cy - 3, cx + 3, cy + 3, oro if encendido else teal[1])
        _mapa(d, cx - 1, cy - 2, digitos[n], {'X': teal[3] if encendido else blanco})

    def dibujar(k):
        im, d = lienzo()
        # k: 1 encabezado, 2 fila de arriba, 3 flecha central, 4 fila de abajo
        R(d, 4, 2, 27, 29, papel); R(d, 27, 3, 27, 29, papel_s); R(d, 5, 29, 27, 29, papel_s)
        P(d, 15, 1, flecha); P(d, 16, 1, flecha)                       # chinche
        # encabezado
        R(d, 4, 2, 26, 7, oro_c if k == 1 else teal[1])
        R(d, 4, 2, 26, 2, blanco if k == 1 else teal[0]); R(d, 4, 7, 26, 7, oro if k == 1 else teal[2])
        R(d, 8, 4, 23, 4, teal[2] if k == 1 else blanco); R(d, 8, 6, 17, 6, teal[2] if k == 1 else blanco)
        # pasos en zigzag: 1 arriba-izquierda, 2 arriba-derecha, 3 abajo-derecha, 4 abajo-izquierda
        fila1, fila2 = k == 2, k == 4
        paso(d, 1, 9, 12, fila1); paso(d, 2, 22, 12, fila1)
        paso(d, 3, 22, 24, fila2); paso(d, 4, 9, 24, fila2)
        a1 = oro if fila1 else flecha                                   # flecha hacia la derecha
        R(d, 13, 12, 16, 12, a1); R(d, 16, 11, 16, 13, a1); P(d, 17, 12, a1)
        a2 = oro if k == 3 else flecha                                  # flecha hacia abajo
        R(d, 22, 16, 22, 18, a2); R(d, 21, 18, 23, 18, a2); P(d, 22, 19, a2)
        a3 = oro if fila2 else flecha                                   # flecha hacia la izquierda
        R(d, 15, 24, 18, 24, a3); R(d, 15, 23, 15, 25, a3); P(d, 14, 24, a3)
        return im
    return cuadros(4, dibujar)


# ── bolígrafo sobre formularios ────────────────────────────────────────────────

def boligrafo_formularios():
    """Pila de formularios con casillas y un bolígrafo azul encima que rueda un poco."""
    papel, papel_s = (246, 244, 234), (208, 204, 190)
    tinta, renglon = (76, 86, 112), (176, 180, 188)
    azul = tonos((40, 96, 214))
    acero, acero_s, punta = (200, 204, 212), (128, 134, 150), (46, 48, 58)

    def dibujar(k):
        im, d = lienzo()
        dy = (0, 1, 1, 0)[k]            # el bolígrafo rueda y se desplaza
        clip = (-1, 0, 1, 0)[k]         # fila (relativa) donde se ve el clip
        # pila de hojas
        for i in (3, 2, 1):
            R(d, 4 + i, 4 + i, 24 + i, 24 + i, papel_s if i % 2 else papel)
            R(d, 24 + i, 5 + i, 24 + i, 24 + i, papel_s); R(d, 5 + i, 24 + i, 24 + i, 24 + i, papel_s)
        R(d, 4, 4, 24, 24, papel)
        # formulario: encabezado, casillas y renglones
        R(d, 6, 6, 21, 8, tinta)
        for fila, y in enumerate((11, 15, 19)):
            R(d, 6, y, 8, y + 2, tinta); P(d, 7, y + 1, azul[1] if fila == 1 else papel)
            R(d, 11, y + 1, 20 - fila * 2, y + 1, renglon)
        # bolígrafo en pendiente 2:1 (punta abajo-izquierda)
        for x in range(5, 28):
            yc = 25 - (x - 5) // 2 + dy
            if x <= 6:
                P(d, x, yc, punta)
            elif x <= 8:
                R(d, x, yc, x, yc + (1 if x == 8 else 0), acero_s)
            elif x <= 10:
                R(d, x, yc - 1, x, yc + 1, acero_s)
                P(d, x, yc - 1, acero)
            elif x <= 20:
                P(d, x, yc - 1, azul[0]); P(d, x, yc, azul[1]); P(d, x, yc + 1, azul[2])
            else:
                P(d, x, yc - 1, azul[1]); P(d, x, yc, azul[2]); P(d, x, yc + 1, azul[3])
                if x <= 26:
                    P(d, x, yc + clip, acero)
        return im
    return cuadros(3, dibujar)


# ── tarjeta de contacto de Bienestar ───────────────────────────────────────────

def tarjeta_contacto_bienestar():
    """Tarjeta blanca con franja verde azulada y un teléfono; brilla y se eleva."""
    blanca, borde = (248, 248, 242), (190, 198, 202)
    teal = tonos((34, 150, 150))
    texto, fino = (70, 80, 94), (170, 176, 182)
    oro, brillo = (255, 214, 82), (255, 255, 255)
    auricular = ('.XXXXXXX.', 'XXXXXXXXX', 'XXX...XXX', 'XX.....XX')

    def estrella(d, cx, cy, largo):
        P(d, cx, cy, brillo)
        for i in range(1, largo + 1):
            for dx, dy in ((i, 0), (-i, 0), (0, i), (0, -i)):
                P(d, cx + dx, cy + dy, brillo if i == 1 else oro)

    def dibujar(k):
        im, d = lienzo()
        sube = (0, 1, 1, 0)[k]          # la tarjeta se eleva 1 px
        y = 10 - sube
        # canto de la tarjeta (más grueso cuando se eleva) y cara
        t = 1 + sube
        R(d, 3 + t, y + t, 27 + t, y + 15 + t, borde); R(d, 3, y, 27, y + 15, blanca)
        # franja verde azulada con el título
        R(d, 3, y, 27, y + 4, teal[1]); R(d, 3, y, 27, y, teal[0]); R(d, 3, y + 4, 27, y + 4, teal[2])
        R(d, 5, y + 2, 13, y + 2, blanca)
        # teléfono y texto simulado
        _mapa(d, 4, y + 7, auricular, {'X': teal[1]})
        R(d, 16, y + 7, 25, y + 8, texto); R(d, 16, y + 10, 24, y + 10, fino)
        R(d, 16, y + 12, 22, y + 12, fino)
        # destello en diagonal: solo se ve sobre lo que tiene color
        if k:
            cx = (0, 8, 16, 24)[k]
            for fila in range(16):
                for x in (cx - fila, cx - fila + 1):
                    if 3 <= x <= 27 and im.getpixel((x, y + fila))[:3] != blanca:
                        P(d, x, y + fila, brillo)
        # chispa de herramienta recogible, en la esquina
        estrella(d, 27, y - 1, 2 if k in (0, 2) else 1)
        return im
    return cuadros(3, dibujar)


MODELOS.update({
    'dispensador-turnos': dispensador_turnos,
    'sello-tinta': sello_tinta,
    'carpeta-medidas-proteccion': carpeta_medidas_proteccion,
    'camara-seguridad': camara_seguridad,
    'afiche-rutas-atencion': afiche_rutas_atencion,
    'boligrafo-formularios': boligrafo_formularios,
    'tarjeta-contacto-bienestar': tarjeta_contacto_bienestar,
})
