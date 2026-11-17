"""Universidad: muebles al oficio v2 (bloque O1). Los que ya tienen un dibujo equivalente lo reutilizan (con la tela
de la universidad donde cambia); los demás se dibujan aquí, a la densidad de los personajes y con silueta limpia.

    python tools/escenarios/objetos_universidad_muebles.py     # hoja de antes y después en maqueta-visual/objetos/
"""
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import objetos_casa as oca  # noqa: E402
import objetos_comisaria as ocm  # noqa: E402
import objetos_comisaria_b as ocb  # noqa: E402
import objetos_pixel as op  # noqa: E402
from objetos_pixel import Lienzo, Reflejo  # noqa: E402

B = 'escenarios/universidad/arte/muebles/'
ROJO, AZUL, VERDE, AMARILLO = (196, 84, 78), (70, 110, 160), (96, 170, 104), (230, 192, 86)
LOMOS = ((176, 70, 64), (70, 104, 150), (210, 180, 110), (80, 130, 96), (150, 110, 160), (220, 214, 196), (110, 80, 60))


def _reflejos(L):
    return {lado: Reflejo(L.w, L.h) for lado in op.LADOS}


def _igual(fuente, ref, archivo, **cambios):
    """La ficha de otro lugar, con `cambios` y el `reemplaza` de la universidad."""
    ficha = dict(fuente.PIEZAS[ref])
    ficha.update(cambios)
    ficha['reemplaza'] = B + archivo + '.png'
    return ficha


def _libros(L, x0, x1, base, alto, semilla):
    """Una fila de lomos de libros de alto variable, con su sombra al pie."""
    x, k = x0, semilla
    while x < x1 - 2:
        ancho = 2 + (k % 3 == 0)
        a = alto - (k * 7) % 4
        c = LOMOS[k % len(LOMOS)]
        L.rect(x, base - a, x + ancho - 1, base, c, tex=False)
        L.rect(x, base - a, x + ancho - 1, base - a, op.mezcla(c, (255, 255, 255), 0.25), tex=False)
        x += ancho + (1 if k % 5 == 0 else 0)
        k += 1
    L.rect(x0, base, x1, base, (40, 30, 26), tex=False)


def estante_libros(n=0):
    """Estante de oficina de tres repisas con libros, carpetas y una matera pequeña."""
    L = Lienzo(64, 78, semilla=221)
    L.bloque(1, 1, 62, 75, 'roble', tapa=3)
    L.rect(4, 6, 59, 72, 'roble', 5, tex=False)                                     # fondo en sombra
    for y in (27, 49, 72):                                                          # repisas
        L.rect(4, y - 1, 59, y, 'roble', 2, tex=False)
        L.rect(4, y - 1, 59, y - 1, 'roble', 1, tex=False)
    _libros(L, 5, 44, 25, 15, 1)
    L.elipse(47, 17, 56, 25, 'barro', 2)                                            # matera
    L.elipse(47, 11, 56, 19, 'hoja', 1)
    _libros(L, 5, 30, 47, 16, 4)
    for k in range(4):                                                              # carpetas acostadas
        L.rect(34, 44 - k * 3, 57, 46 - k * 3, ('manila', 'tela-azul', 'manila', 'lino-rojo')[k], 1 + k % 2, tex=False)
    _libros(L, 5, 58, 70, 18, 9)
    r = _reflejos(L)
    r['izquierda'].rect(2, 2, 30, 2, 1)
    r['derecha'].rect(32, 2, 61, 2, 1)
    return L, r, None


def archivador(n=0):
    """Archivador metálico de cuatro gavetas; al revisarlo la de arriba se abre con sus carpetas colgantes."""
    abierto = (0, -1, 4, 7, 6)[n]
    L = Lienzo(42, 58, semilla=223)
    L.bloque(1, 1, 40, 55, 'acero', tapa=3)
    for k in (3, 2, 1):                                                             # de abajo hacia arriba
        ocm._cajon(L, 4, 37, 6 + k * 12, 16 + k * 12, 0, contenido=False)
    ocm._cajon(L, 4, 37, 6, 16, abierto)
    L.tex[:, :] = False                                                             # lámina pintada: lisa
    r = _reflejos(L)
    for rr, dx in ((r['izquierda'], -3), (r['derecha'], 3), (r['frente'], 0)):
        for k in range(4):
            rr.rect(20 + dx - 1, 8 + k * 12 + (max(abierto, 0) if k == 0 else 0), 20 + dx + 1, 8 + k * 12 + (max(abierto, 0) if k == 0 else 0), 2)
        rr.rect(2, 2, 39, 2, 1)
    return L, r, None


def pupitre(n=0):
    """Pupitre universitario de brazo, con un cuaderno abierto y un lapicero."""
    L = Lienzo(48, 40, semilla=225)
    L.rect(6, 2, 38, 18, 'plastico-gris', 2)                                        # espaldar
    L.rect(6, 2, 38, 2, 'plastico-gris', 0, tex=False)
    L.rect(6, 17, 38, 18, 'plastico-gris', 4, tex=False)
    L.rect(4, 20, 36, 24, 'plastico-gris', 1)                                       # asiento
    L.rect(4, 24, 36, 25, 'plastico-gris', 3, tex=False)
    L.bloque(26, 12, 46, 20, 'laminado', tapa=4, base=1)                            # brazo-mesa
    L.rect(29, 11, 40, 15, 'papel', 0, tex=False)                                   # cuaderno
    L.rect(34, 11, 34, 15, 'papel', 3, tex=False)
    L.linea(37, 14, 43, 11, AZUL)                                                   # lapicero
    for x in (7, 33):                                                               # patas de tubo
        L.rect(x, 26, x + 1, 37, 'acero', 2)
    L.rect(5, 37, 36, 37, 'acero', 3, tex=False)
    L.rect(43, 21, 44, 37, 'acero', 2)
    r = _reflejos(L)
    r['izquierda'].rect(27, 13, 34, 13, 1)
    r['derecha'].rect(38, 13, 45, 13, 1)
    return L, r, None


def tablero(n=0):
    """Tablero blanco de pie con una clase a medias: un esquema, flechas y la bandeja con los marcadores."""
    L = Lienzo(182, 112, semilla=227)
    for x in (12, 166):                                                             # patas
        L.rect(x, 80, x + 3, 108, 'cromo', 2)
        L.rect(x - 7, 107, x + 10, 109, 'cromo', 4, tex=False)
    L.rect(2, 2, 179, 82, 'cromo', 2)                                               # marco
    L.rect(2, 2, 179, 2, 'cromo', 0, tex=False)
    L.rect(5, 5, 176, 78, 'blanco-clinico', 0)                                      # la superficie blanca
    L.rect(5, 5, 176, 6, 'blanco-clinico', 2, tex=False)
    for x0, y0, c in ((16, 16, AZUL), (72, 16, VERDE), (128, 16, ROJO), (44, 46, AZUL), (100, 46, VERDE)):   # el esquema
        L.rect(x0, y0, x0 + 34, y0 + 16, c, tex=False)
        L.rect(x0 + 2, y0 + 2, x0 + 32, y0 + 14, 'blanco-clinico', 0, tex=False)
        L.rect(x0 + 6, y0 + 6, x0 + 24, y0 + 7, op.mezcla(c, (0, 0, 0), 0.2), tex=False)
        L.rect(x0 + 6, y0 + 10, x0 + 18, y0 + 11, op.mezcla(c, (0, 0, 0), 0.2), tex=False)
    for (xa, ya, xb, yb) in ((50, 24, 72, 24), (106, 24, 128, 24), (60, 32, 60, 46), (116, 32, 116, 46)):   # flechas
        L.rect(min(xa, xb), min(ya, yb), max(xa, xb), max(ya, yb) + (1 if ya == yb else 0), (70, 70, 90), tex=False)
    L.rect(4, 80, 177, 83, 'cromo', 1)                                              # bandeja de marcadores
    for k, c in enumerate((AZUL, ROJO, VERDE)):
        L.rect(30 + k * 8, 79, 35 + k * 8, 80, c, tex=False)
    L.rect(150, 78, 160, 80, 'tela-gris', 2, tex=False)                             # borrador
    r = _reflejos(L)
    r['izquierda'].diagonal(8, 74, 22, 3, 1)
    r['derecha'].diagonal(172, 74, 22, 3, 1, sentido=-1)
    r['frente'].rect(10, 7, 170, 7, 1)
    for rr in r.values():
        rr.rect(3, 3, 178, 3, 2)
    return L, r, None


def mesa_cafeteria(n=0):
    """Mesa redonda de cafetería con un servilletero y dos vasos."""
    L = Lienzo(58, 38, semilla=229)
    L.rect(26, 14, 31, 33, 'cromo', 2)                                              # pata central
    L.elipse(14, 31, 43, 36, 'cromo', 3)
    L.elipse(2, 1, 55, 16, 'formica', 1)                                            # tablero redondo
    L.rect(4, 12, 53, 14, 'formica', 3, tex=False)
    L.elipse(4, 2, 53, 12, 'formica', 0)
    L.rect(22, 2, 30, 8, 'cromo', 2)                                                # servilletero
    L.rect(23, 1, 29, 4, 'papel', 0, tex=False)
    for x in (10, 38):
        L.rect(x, 3, x + 4, 9, 'vidrio', 1, tex=False)
        L.rect(x + 1, 6, x + 3, 8, (196, 120, 70), tex=False)                       # jugo
    r = _reflejos(L)
    r['izquierda'].rect(6, 5, 16, 5, 2)
    r['derecha'].rect(40, 5, 51, 5, 2)
    r['frente'].rect(18, 3, 38, 3, 1)
    return L, r, None


def silla_cafeteria(n=0):
    """Silla de cafetería de plástico rojo con patas de tubo."""
    L = Lienzo(24, 34, semilla=231)
    L.cojin(2, 1, 21, 12, 'lino-rojo', r=2, arriba=0.25, abajo=0.25)                   # espaldar recto
    L.rect(10, 13, 13, 15, 'acero', 3, tex=False)
    L.rect(2, 16, 21, 20, 'lino-rojo', 1)
    L.rect(2, 16, 21, 16, 'lino-rojo', 0, tex=False)
    L.rect(2, 20, 21, 21, 'lino-rojo', 4, tex=False)
    for x in (3, 19):
        L.rect(x, 21, x + 1, 31, 'acero', 2)
    L.rect(5, 26, 18, 26, 'acero', 3, tex=False)
    return L, _reflejos(L), None


def barra_cafeteria(n=0):
    """Barra de la cafetería: vitrina de vidrio con panes y empanadas, caja registradora y la greca del café (vapor)."""
    L = Lienzo(202, 74, semilla=233)
    L.bloque(1, 30, 200, 71, 'laminado', tapa=6)                                    # mueble de la barra, laminado
    L.rect(1, 50, 200, 53, (196, 84, 78), tex=False)                                # franja
    L.rect(10, 6, 90, 31, 'cromo', 2)                                               # vitrina de vidrio
    L.rect(12, 8, 88, 29, 'vidrio', 3, tex=False)
    for k in range(6):                                                              # panes y empanadas
        x = 15 + k * 12
        L.elipse(x, 20, x + 9, 27, (214, 160, 92), tex=False)
        L.rect(x + 2, 21, x + 6, 22, (236, 196, 132), tex=False)
    L.rect(12, 18, 88, 18, 'cromo', 2, tex=False)
    L.rect(110, 16, 132, 31, 'plastico-negro', 2)                                   # caja registradora
    L.rect(113, 18, 129, 22, (96, 140, 196), tex=False)
    L.rect(150, 4, 176, 31, 'cromo', 1)                                             # la greca
    L.rect(150, 4, 176, 5, 'cromo', 0, tex=False)
    L.rect(157, 22, 169, 26, 'plastico-negro', 3, tex=False)
    for k in range(3):                                                              # vapor que sube
        x = 158 + k * 4 + (1 if (n + k) % 4 in (1, 2) else 0)
        y = 1 - ((n + k) % 3)
        if y >= 0:
            L.rect(x, y, x, y + 1, (236, 232, 226), tex=False)
    em = L.caja_mascara(113, 18, 129, 22)
    r = _reflejos(L)
    r['izquierda'].diagonal(14, 28, 18, 2, 2)
    r['derecha'].diagonal(86, 28, 18, 2, 2, sentido=-1)
    r['frente'].rect(14, 9, 86, 9, 1)
    for rr in r.values():
        rr.rect(151, 6, 152, 30, 2)
    return L, r, em


def banca(n=0):
    """Banca de parque universitaria: listones de madera sobre patas de hierro."""
    L = Lienzo(102, 34, semilla=235)
    for y in (1, 5, 9):                                                             # espaldar
        L.rect(6, y, 95, y + 2, 'pino', 2)
        L.rect(6, y, 95, y, 'pino', 1, tex=False)
    for y in (15, 19):                                                              # asiento
        L.rect(2, y, 99, y + 2, 'pino', 1)
        L.rect(2, y + 2, 99, y + 2, 'pino', 3, tex=False)
    for x in (8, 90):                                                               # hierro
        L.rect(x, 1, x + 3, 31, 'plastico-negro', 2)
        L.rect(x - 2, 30, x + 5, 31, 'plastico-negro', 4, tex=False)
    return L, _reflejos(L), None


def camilla(n=0):
    """Camilla de la enfermería de la universidad: colchoneta con el rollo de papel y la escalerilla al lado."""
    L = Lienzo(106, 46, semilla=237)
    L.rect(4, 22, 98, 27, 'cromo', 2)                                               # bastidor
    L.rect(4, 22, 98, 22, 'cromo', 0, tex=False)
    L.cojin(4, 10, 98, 22, 'tela-azul', r=3, arriba=0.3, abajo=0.25)               # colchoneta
    L.cojin(4, 4, 26, 14, 'tela-azul', r=3, arriba=0.3, abajo=0.3)                  # cabecera levantada
    L.rect(30, 10, 92, 19, 'papel', 0)                                              # papel de la camilla
    L.rect(30, 19, 92, 19, 'papel', 2, tex=False)
    L.rect(93, 9, 97, 14, 'papel', 1, tex=False)                                    # el rollo
    for x in (8, 94):                                                               # patas
        L.rect(x, 27, x + 2, 43, 'cromo', 2)
        L.rect(x - 2, 43, x + 4, 44, 'cromo', 4, tex=False)
    L.rect(8, 36, 96, 37, 'cromo', 3, tex=False)
    r = _reflejos(L)
    r['izquierda'].rect(5, 23, 40, 23, 2)
    r['derecha'].rect(60, 23, 97, 23, 2)
    r['frente'].rect(30, 23, 70, 23, 1)
    return L, r, None


def vitrina_medicamentos(n=0):
    """Vitrina blanca de la enfermería con frascos y cajas tras el vidrio, y la cruz verde arriba."""
    L = Lienzo(58, 74, semilla=239)
    L.bloque(1, 1, 56, 71, 'blanco-clinico', tapa=3)
    L.rect(22, 4, 34, 9, (96, 170, 120), tex=False)                                 # cruz verde
    L.rect(26, 2, 30, 11, (96, 170, 120), tex=False)
    L.rect(5, 13, 52, 50, 'blanco-clinico', 4, tex=False)                           # interior
    for y in (25, 38):
        L.rect(5, y, 52, y, 'blanco-clinico', 2, tex=False)
    colores = ((196, 140, 96), (120, 170, 200), (226, 210, 160), (196, 84, 78), (150, 196, 150))
    for fila, y in enumerate((24, 37, 49)):
        for k in range(6):
            x = 7 + k * 7
            c = colores[(k + fila) % len(colores)]
            if (k + fila) % 3:
                L.rect(x, y - 6, x + 4, y - 1, c, tex=False)                        # frascos
                L.rect(x + 1, y - 7, x + 3, y - 7, 'blanco-clinico', 1, tex=False)
            else:
                L.rect(x, y - 5, x + 5, y - 1, 'papel', 1, tex=False)               # cajas
                L.rect(x + 1, y - 4, x + 4, y - 4, c, tex=False)
    L.rect(28, 13, 28, 50, 'cromo', 2, tex=False)                                   # junta de las puertas
    for y0 in (54, 62):                                                             # cajones
        L.rect(5, y0, 52, y0 + 6, 'blanco-clinico', 1)
        L.rect(5, y0 + 6, 52, y0 + 6, 'blanco-clinico', 3, tex=False)
        L.rect(25, y0 + 3, 31, y0 + 3, 'cromo', 2, tex=False)
    vidrio = L.caja_mascara(5, 13, 52, 50)
    r = _reflejos(L)
    r['izquierda'].diagonal(6, 48, 14, 2, 2)
    r['derecha'].diagonal(51, 48, 14, 2, 2, sentido=-1)
    r['frente'].rect(8, 14, 49, 14, 1)
    for rr in r.values():
        rr.m[(rr.m > 0) & ~vidrio] = 0
    return L, r, None


def biombo(n=0):
    """Biombo de tres paneles de tela sobre marco de tubo, con los paneles en zigzag."""
    L = Lienzo(72, 62, semilla=241)
    for k, (x0, prof) in enumerate(((2, 0), (24, 3), (48, 0))):
        x1 = x0 + 21
        L.rect(x0, 2 + prof, x1, 56 - prof, 'cromo', 2)                             # marco
        L.rect(x0 + 2, 4 + prof, x1 - 2, 52 - prof, 'tela-gris' if k != 1 else 'sabana', 1 + (k == 1))
        for x in range(x0 + 4, x1 - 2, 4):                                          # pliegues de la tela
            L.rect(x, 5 + prof, x, 51 - prof, 'tela-gris' if k != 1 else 'sabana', 3, tex=False)
        L.rect(x0 + 1, 56 - prof, x0 + 2, 59 - prof, 'cromo', 3)                    # patas
        L.rect(x1 - 2, 56 - prof, x1 - 1, 59 - prof, 'cromo', 3)
    r = _reflejos(L)
    for rr, xs in ((r['izquierda'], (2, 24, 48)), (r['derecha'], (23, 45, 69)), (r['frente'], (12, 35, 58))):
        for x in xs:
            rr.px(x, 3, 2)
    return L, r, None


def lavamanos(n=0):
    """Lavamanos de pared con llave cromada, jabón y toallas de papel."""
    L = Lienzo(42, 48, semilla=243)
    L.rect(8, 1, 33, 14, 'cromo', 3)                                                # dispensador de toallas
    L.rect(8, 1, 33, 1, 'cromo', 0, tex=False)
    L.rect(14, 14, 27, 16, 'papel', 0, tex=False)
    L.bloque(3, 20, 38, 30, 'ceramica', tapa=4)                                     # el lavamanos
    L.rect(7, 21, 34, 23, 'ceramica', 4, tex=False)
    L.rect(18, 17, 21, 21, 'cromo', 2)                                              # llave
    L.rect(18, 17, 25, 18, 'cromo', 1)
    L.rect(30, 17, 33, 21, (226, 196, 120), tex=False)                              # jabón
    L.rect(17, 31, 24, 44, 'ceramica', 2)                                           # pedestal
    L.rect(17, 31, 17, 44, 'ceramica', 3, tex=False)
    L.rect(14, 44, 27, 45, 'ceramica', 4, tex=False)
    r = _reflejos(L)
    r['izquierda'].rect(18, 17, 18, 20, 2)
    r['derecha'].rect(25, 17, 25, 18, 2)
    r['frente'].rect(19, 17, 23, 17, 2)
    for rr in r.values():
        rr.rect(5, 21, 36, 21, 1)
    return L, r, None


def mesa_estudio(n=0):
    """Mesa larga de la biblioteca con lámparas de lectura, libros abiertos y un portátil."""
    L = Lienzo(132, 48, semilla=245)
    for x in (6, 122):
        L.rect(x, 20, x + 3, 45, 'roble', 3)
        L.rect(x, 44, x + 3, 45, 'roble', 4, tex=False)
    L.bloque(1, 14, 130, 22, 'roble', tapa=6)
    for x in (30, 96):                                                              # lámparas de lectura verdes
        L.rect(x + 4, 6, x + 5, 15, 'laton', 2, tex=False)
        L.rect(x, 3, x + 10, 7, (70, 130, 96), tex=False)
        L.rect(x + 1, 7, x + 9, 7, (255, 236, 176), tex=False)                      # la luz por debajo
    L.rect(10, 13, 24, 18, 'papel', 0, tex=False)                                   # libros abiertos
    L.rect(17, 13, 17, 18, 'papel', 3, tex=False)
    L.rect(52, 6, 72, 16, 'plastico-gris', 2)                                       # portátil
    L.rect(54, 8, 70, 14, (96, 140, 196), tex=False)
    L.rect(50, 16, 74, 18, 'plastico-gris', 1, tex=False)
    L.rect(106, 12, 120, 18, 'papel', 1, tex=False)
    em = L.caja_mascara(54, 8, 70, 14) | L.caja_mascara(31, 7, 39, 7) | L.caja_mascara(97, 7, 105, 7)
    r = _reflejos(L)
    r['izquierda'].rect(2, 15, 28, 15, 2)
    r['derecha'].rect(100, 15, 129, 15, 2)
    r['frente'].rect(30, 19, 100, 19, 1)
    return L, r, em


def estante_biblioteca(n=0):
    """Estante alto de la biblioteca, cinco repisas llenas de lomos y una escalera de mano."""
    L = Lienzo(98, 98, semilla=247)
    L.bloque(1, 1, 96, 95, 'nogal', tapa=3)
    L.rect(4, 6, 93, 92, 'nogal', 5, tex=False)
    for k, y in enumerate((22, 39, 56, 73, 92)):
        L.rect(4, y - 1, 93, y, 'nogal', 2, tex=False)
        _libros(L, 5, 92, y - 2, 14, 3 + k * 5)
    L.linea(70, 94, 84, 10, 'roble', 2)                                             # escalera de mano
    L.linea(78, 94, 92, 10, 'roble', 2)
    for k in range(1, 9):
        y = 94 - k * 10
        L.rect(70 + (94 - y) // 6, y, 78 + (94 - y) // 6, y, 'roble', 3, tex=False)
    r = _reflejos(L)
    r['izquierda'].rect(2, 2, 46, 2, 1)
    r['derecha'].rect(50, 2, 95, 2, 1)
    return L, r, None


LETRAS = {'P': ['###', '#.#', '###', '#..', '#..'], 'O': ['###', '#.#', '#.#', '#.#', '###'],
          'R': ['##.', '#.#', '##.', '#.#', '#.#'], 'T': ['###', '.#.', '.#.', '.#.', '.#.'],
          'E': ['###', '#..', '##.', '#..', '###'], 'I': ['#', '#', '#', '#', '#'], 'A': ['.#.', '#.#', '###', '#.#', '#.#']}


def _texto(L, x, y, texto, color):
    for letra in texto:
        patron = LETRAS[letra]
        for yy, fila in enumerate(patron):
            for xx, ch in enumerate(fila):
                if ch == '#':
                    L.px(x + xx, y + yy, color)
        x += len(patron[0]) + 1
    return x


def porteria(n=0):
    """Caseta de portería de la entrada: techo con alero y letrero, ventanal con la ventanilla de atención y su repisa
    con el libro de visitas, adentro la pantalla de las cámaras y una lámpara; puerta lateral con su farol."""
    L = Lienzo(124, 90, semilla=249)
    muro, marco = 'plastico-crema', 'acero'
    # cuerpo de la caseta
    L.rect(5, 12, 118, 85, muro, 2)
    L.rect(5, 12, 5, 85, muro, 3, tex=False)
    L.rect(118, 12, 118, 85, muro, 4, tex=False)
    L.rect(119, 12, 121, 84, muro, 4, tex=False)                                    # la cara lateral: la caseta tiene fondo
    L.rect(119, 12, 121, 14, muro, 5, tex=False)
    L.rect(5, 11, 118, 13, muro, 5, tex=False)                                      # sombra bajo el alero
    L.rect(5, 70, 118, 73, (176, 70, 64), tex=False)                                # franja de la universidad
    L.rect(5, 70, 118, 70, (206, 104, 96), tex=False)
    L.rect(4, 82, 119, 86, 'mdf-gris', 3)                                           # zócalo
    L.rect(4, 82, 119, 82, 'mdf-gris', 1, tex=False)
    # ventanal con la ventanilla al centro
    L.rect(9, 17, 88, 49, marco, 2, tex=False)
    vidrio = L.caja_mascara(11, 19, 86, 47)
    L.mascara(vidrio, 'vidrio', 4, tex=False)                                       # adentro, en penumbra
    L.rect(11, 38, 86, 47, 'vidrio', 5, tex=False)                                  # el mostrador interior
    L.rect(16, 30, 31, 38, 'plastico-negro', 3, tex=False)                          # pantalla de las cámaras
    L.rect(17, 31, 30, 36, (90, 140, 120), tex=False)
    for x in (17, 24):
        L.rect(x, 31, x + 5, 33, (120, 176, 150), tex=False)                        # cuatro cuadros de cámara
        L.rect(x, 34, x + 5, 36, (70, 120, 104), tex=False)
    L.rect(70, 27, 74, 31, (255, 236, 176), tex=False)                              # lámpara de escritorio encendida
    L.rect(72, 32, 72, 37, marco, 3, tex=False)
    L.rect(58, 33, 64, 35, (52, 62, 92), tex=False)                                 # la gorra del vigilante sobre la mesa
    L.rect(57, 35, 65, 35, (40, 46, 70), tex=False)
    L.px(61, 33, (230, 192, 86))
    for x in (36, 62):                                                              # parteluces
        L.rect(x, 17, x + 1, 49, marco, 2, tex=False)
    L.rect(38, 36, 61, 49, marco, 3, tex=False)                                     # la ventanilla: marco corredizo
    L.rect(40, 38, 59, 47, (40, 36, 44), tex=False)                                 # la ventanilla abierta
    L.rect(36, 49, 64, 52, 'laminado', 1)                                           # repisa de atención
    L.rect(36, 49, 64, 49, 'laminado', 0, tex=False)
    L.rect(36, 52, 64, 53, 'laminado', 4, tex=False)
    L.rect(42, 46, 52, 49, 'papel', 0, tex=False)                                   # libro de visitas abierto
    L.rect(47, 46, 47, 49, 'papel', 3, tex=False)
    L.linea(53, 48, 57, 45, (70, 110, 160))                                         # el bolígrafo
    L.rect(16, 57, 31, 66, 'papel', 1, tex=False)                                   # aviso: «identifíquese»
    L.rect(18, 59, 21, 64, (70, 110, 160), tex=False)                               # escudo
    L.rect(23, 60, 29, 60, (120, 124, 140), tex=False)
    L.rect(23, 63, 28, 63, (120, 124, 140), tex=False)
    # puerta lateral con su ventanita, la manija y el farol
    L.rect(94, 24, 113, 82, marco, 2)
    L.rect(94, 24, 113, 24, marco, 1, tex=False)
    L.rect(97, 28, 110, 40, 'vidrio', 4, tex=False)
    L.rect(108, 52, 110, 54, 'cromo', 1, tex=False)
    L.rect(95, 25, 95, 81, marco, 4, tex=False)
    L.rect(101, 16, 106, 20, 'plastico-negro', 2, tex=False)                        # farol sobre la puerta
    L.rect(102, 18, 105, 20, (255, 226, 150), tex=False)
    # techo con alero y letrero
    L.rect(0, 2, 123, 7, 'mdf-gris', 1)                                             # losa vista desde arriba
    L.rect(0, 2, 123, 2, 'mdf-gris', 0, tex=False)
    L.rect(0, 8, 123, 11, 'mdf-gris', 3, tex=False)                                 # canto del alero
    L.rect(0, 11, 123, 11, 'mdf-gris', 4, tex=False)
    L.rect(36, 0, 87, 9, (52, 62, 92), tex=False)                                   # letrero azul de la portería
    L.rect(36, 0, 87, 0, (80, 92, 128), tex=False)
    _texto(L, 47, 3, 'PORTERIA', (248, 240, 214))                                   # centrado en el letrero (29 px)
    L.px(72, 1, (248, 240, 214))                                                    # la tilde de la Í
    L.tex[:, :] = False                                                             # revoque y lámina lisos: sin motas
    em = L.caja_mascara(17, 31, 30, 36) | L.caja_mascara(70, 27, 74, 31) | L.caja_mascara(102, 18, 105, 20)
    r = _reflejos(L)
    r['izquierda'].diagonal(12, 46, 22, 3, 2)
    r['izquierda'].diagonal(64, 46, 18, 2, 1)
    r['izquierda'].diagonal(98, 39, 8, 2, 2)
    r['derecha'].diagonal(34, 46, 18, 2, 1, sentido=-1)
    r['derecha'].diagonal(85, 46, 22, 3, 2, sentido=-1)
    r['derecha'].diagonal(109, 39, 8, 2, 2, sentido=-1)
    r['frente'].rect(12, 19, 85, 19, 1)
    r['frente'].rect(98, 28, 109, 28, 1)
    vidrios = vidrio | L.caja_mascara(97, 28, 110, 40)
    for rr in r.values():
        rr.m[(rr.m > 0) & ~vidrios] = 0
        rr.px(109, 52, 2)
    return L, r, em


def tapete(n=0):
    """Tapete tejido de la sala de bienestar, con flecos y una greca."""
    L = Lienzo(122, 42, semilla=251)
    L.poli([(8, 4), (113, 4), (119, 37), (2, 37)], 'lino-rojo', 2)                  # en perspectiva: más ancho cerca
    L.poli([(14, 8), (107, 8), (112, 33), (9, 33)], 'crochet', 2)
    L.poli([(22, 13), (99, 13), (103, 28), (18, 28)], 'lino-rojo', 1)
    for x in range(26, 98, 10):                                                     # greca
        L.rect(x, 19, x + 4, 22, 'crochet', 1, tex=False)
    for x in range(3, 119, 3):                                                      # flecos
        L.px(x, 38, 'crochet', 2)
    return L, _reflejos(L), None


def _variante(funcion, **kw):
    return lambda n=0: funcion(n, **kw)


PIEZAS = {
    # Reutilizados: el mismo dibujo del lugar donde nació (las telas cambian donde la universidad las tiene distintas).
    'escritorio': _igual(ocm, 'escritorio-funcionario', archivo='escritorio'),
    'silla-oficina': _igual(ocm, 'silla-giratoria', archivo='silla-oficina'),
    'silla-visitante': _igual(ocm, 'silla-visitante-comisaria', archivo='silla-visitante'),
    'sillon': _igual(oca, 'sillon-casa', archivo='sillon', dibujar=_variante(oca.sillon, tela='tela-gris')),
    'sofa': _igual(oca, 'sofa-casa', archivo='sofa', dibujar=_variante(oca.sofa, tela='tela-azul')),
    'mesa-centro': _igual(oca, 'mesa-centro-casa', archivo='mesa-centro'),
    'planta': _igual(ocm, 'planta-oficina', archivo='planta'),
    'mostrador': _igual(ocm, 'mostrador-recepcion', archivo='mostrador'),
    'sillas-espera': _igual(ocm, 'sillas-espera-comisaria', archivo='sillas-espera'),
    'cartelera': _igual(ocm, 'cartelera-comisaria', archivo='cartelera'),
    'caneca': _igual(ocm, 'caneca-comisaria', archivo='caneca'),
    'dispensador-agua': dict(ocm.PIEZAS['dispensador-agua'], tipo='mueble', reemplaza=B + 'dispensador-agua.png'),
    # Nuevos.
    'estante-libros': dict(nombre='Estante de libros', tipo='mueble', dibujar=estante_libros, cuadros=1,
                           huella=dict(ancho=60, fondo=14, alto=72), material='madera', reemplaza=B + 'estante-libros.png'),
    'archivador': dict(nombre='Archivador', tipo='mueble', dibujar=archivador, cuadros=5,
                       huella=dict(ancho=38, fondo=14, alto=52), material='acero',
                       animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                        revisar=dict(de=1, hasta=4, fps=10, bucle=False, sostener=True)),
                       reemplaza=B + 'archivador.png'),
    'pupitre': dict(nombre='Pupitre', tipo='mueble', dibujar=pupitre, cuadros=1,
                    huella=dict(ancho=40, fondo=12, alto=34), material='plástico y laminado', reemplaza=B + 'pupitre.png'),
    'tablero': dict(nombre='Tablero', tipo='mueble', dibujar=tablero, cuadros=1,
                    huella=dict(ancho=170, fondo=8, alto=104), material='tablero blanco', reemplaza=B + 'tablero.png'),
    'mesa-cafeteria': dict(nombre='Mesa de cafetería', tipo='mueble', dibujar=mesa_cafeteria, cuadros=1,
                           huella=dict(ancho=50, fondo=14, alto=34), material='fórmica y cromo', reemplaza=B + 'mesa-cafeteria.png'),
    'silla-cafeteria': dict(nombre='Silla de cafetería', tipo='mueble', dibujar=silla_cafeteria, cuadros=1,
                            huella=dict(ancho=20, fondo=10, alto=30), material='plástico', reemplaza=B + 'silla-cafeteria.png'),
    'barra-cafeteria': dict(nombre='Barra de la cafetería', tipo='mueble', dibujar=barra_cafeteria, cuadros=4,
                            huella=dict(ancho=196, fondo=16, alto=44), material='madera, vidrio y cromo',
                            animaciones=dict(reposo=dict(de=0, hasta=3, fps=4, bucle=True)), reemplaza=B + 'barra-cafeteria.png'),
    'banca': dict(nombre='Banca', tipo='mueble', dibujar=banca, cuadros=1,
                  huella=dict(ancho=96, fondo=12, alto=30), material='madera y hierro', reemplaza=B + 'banca.png'),
    'camilla': dict(nombre='Camilla de enfermería', tipo='mueble', dibujar=camilla, cuadros=1,
                    huella=dict(ancho=94, fondo=16, alto=40), material='tela y cromo', reemplaza=B + 'camilla.png'),
    'vitrina-medicamentos': dict(nombre='Vitrina de medicamentos', tipo='mueble', dibujar=vitrina_medicamentos, cuadros=1,
                                 huella=dict(ancho=54, fondo=14, alto=70), material='lámina y vidrio',
                                 reemplaza=B + 'vitrina-medicamentos.png'),
    'biombo': dict(nombre='Biombo', tipo='mueble', dibujar=biombo, cuadros=1,
                   huella=dict(ancho=68, fondo=8, alto=56), material='tela y tubo', reemplaza=B + 'biombo.png'),
    'lavamanos': dict(nombre='Lavamanos', tipo='mueble', dibujar=lavamanos, cuadros=1,
                      huella=dict(ancho=36, fondo=10, alto=44), material='cerámica y cromo', reemplaza=B + 'lavamanos.png'),
    'mesa-estudio': dict(nombre='Mesa de estudio', tipo='mueble', dibujar=mesa_estudio, cuadros=1,
                         huella=dict(ancho=126, fondo=16, alto=30), material='madera barnizada', reemplaza=B + 'mesa-estudio.png'),
    'estante-biblioteca': dict(nombre='Estante de la biblioteca', tipo='mueble', dibujar=estante_biblioteca, cuadros=1,
                               huella=dict(ancho=94, fondo=16, alto=92), material='madera', reemplaza=B + 'estante-biblioteca.png'),
    'porteria': dict(nombre='Portería', tipo='mueble', dibujar=porteria, cuadros=1,
                     huella=dict(ancho=118, fondo=20, alto=84), material='acero y vidrio', reemplaza=B + 'porteria.png'),
    'tapete': dict(nombre='Tapete', tipo='mueble', dibujar=tapete, cuadros=1,
                   huella=dict(ancho=116, fondo=34, alto=2), material='tejido', reemplaza=B + 'tapete.png'),
}


if __name__ == '__main__':
    import objetos_hoja
    objetos_hoja.hoja_lugar('universidad_muebles', PIEZAS)
