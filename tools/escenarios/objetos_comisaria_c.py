"""Comisaría, cuarta tanda (bloque O1): lo de la biblioteca que no sale en SIM-VBG-002 (archivo, despacho, sala de
entrevista con niñas y niños, fachada). A la densidad de los personajes y con silueta limpia.
Se suman a `objetos_comisaria.PIEZAS` desde ese módulo.
"""
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import objetos_casa_b  # noqa: E402,F401  (registra peluche)
import objetos_pixel as op  # noqa: E402
from objetos_pixel import Lienzo, Reflejo  # noqa: E402

ROJO, AZUL, VERDE, AMARILLO, MORADO = (196, 84, 78), (70, 110, 160), (96, 170, 104), (230, 192, 86), (124, 86, 150)
AZ_AR = ((70, 104, 150), (176, 70, 64), (80, 130, 96), (124, 86, 150), (210, 180, 110))       # lomos de AZ


def _reflejos(L):
    return {lado: Reflejo(L.w, L.h) for lado in op.LADOS}


def archivador_metalico(n=0):
    """El mismo archivador de cuatro gavetas de la universidad (la de arriba se abre con sus carpetas colgantes)."""
    return __import__('objetos_universidad_muebles').archivador(n)


def estante_expedientes(n=0):
    """Estante metálico de expedientes: AZ de colores con su rótulo, cajas y un rimero de carpetas sueltas."""
    L = Lienzo(98, 98, semilla=301)
    for x in (2, 94):                                                               # parales
        L.rect(x, 1, x + 2, 95, 'acero', 2)
        L.rect(x, 1, x, 95, 'acero', 1, tex=False)
    for k, y in enumerate((24, 47, 70, 93)):
        L.rect(4, y - 1, 93, y + 1, 'acero', 1)                                     # bandejas
        L.rect(4, y + 1, 93, y + 1, 'acero', 4, tex=False)
        x = 6
        while x < 88:                                                               # AZ de pie
            c = AZ_AR[(x // 7 + k) % len(AZ_AR)]
            alto = 19 - (x * 3 + k) % 3
            if (x // 7 + k) % 6 == 5:                                               # una caja de archivo cada tanto
                L.rect(x, y - 15, x + 11, y - 2, 'carton', 1)
                L.rect(x + 3, y - 10, x + 8, y - 8, 'papel', 0, tex=False)
                x += 13
                continue
            L.rect(x, y - alto, x + 5, y - 2, c, tex=False)
            L.rect(x, y - alto, x + 5, y - alto, op.mezcla(c, (255, 255, 255), 0.3), tex=False)
            L.rect(x + 1, y - alto + 4, x + 4, y - alto + 7, 'papel', 0, tex=False)   # rótulo
            L.rect(x + 2, y - 6, x + 3, y - 4, op.mezcla(c, (0, 0, 0), 0.35), tex=False)   # el hueco del dedo
            x += 7
    L.tex[:, :] = False
    r = _reflejos(L)
    for rr, xs in ((r['izquierda'], (2,)), (r['derecha'], (96,)), (r['frente'], (3, 95))):
        for x in xs:
            rr.rect(x, 2, x, 94, 1)
    return L, r, None


def caja_archivo(n=0):
    """Dos cajas de archivo de cartón apiladas, con su ficha y las asas troqueladas."""
    L = Lienzo(42, 42, semilla=303)
    for y0, x0 in ((20, 2), (2, 6)):
        L.bloque(x0, y0, x0 + 33, y0 + 19, 'carton', tapa=4, base=1)
        L.rect(x0 + 4, y0 + 8, x0 + 8, y0 + 9, 'carton', 5, tex=False)              # asa
        L.rect(x0 + 25, y0 + 8, x0 + 29, y0 + 9, 'carton', 5, tex=False)
        L.rect(x0 + 12, y0 + 7, x0 + 21, y0 + 14, 'papel', 0)                       # ficha
        L.rect(x0 + 13, y0 + 9, x0 + 19, y0 + 10, (120, 124, 140), tex=False)
        L.rect(x0 + 13, y0 + 12, x0 + 17, y0 + 12, (120, 124, 140), tex=False)
    return L, _reflejos(L), None


def mesa_reunion(n=0):
    """Mesa de reuniones del despacho, con carpetas, una jarra de agua y vasos."""
    L = Lienzo(122, 62, semilla=305)
    for x in (8, 108):
        L.rect(x, 26, x + 4, 58, 'laminado', 3)
        L.rect(x, 57, x + 4, 58, 'laminado', 4, tex=False)
    L.bloque(1, 4, 120, 28, 'laminado', tapa=18)                                    # tablero grande visto de arriba
    for x, c in ((18, MORADO), (60, AZUL)):                                          # carpetas
        L.rect(x, 9, x + 18, 17, 'manila', 1)
        L.rect(x, 9, x + 3, 17, c, tex=False)
    L.rect(88, 4, 94, 15, 'vidrio', 1, tex=False)                                   # jarra
    L.rect(88, 8, 94, 15, 'agua', 2, tex=False)
    for x in (98, 104):
        L.rect(x, 10, x + 3, 15, 'vidrio', 1, tex=False)
    vidrio = L.caja_mascara(88, 4, 106, 15)
    r = _reflejos(L)
    r['izquierda'].rect(3, 6, 40, 6, 2)
    r['derecha'].rect(82, 6, 118, 6, 2)
    r['frente'].rect(30, 20, 90, 20, 1)
    for rr, x in ((r['izquierda'], 88), (r['derecha'], 94), (r['frente'], 91)):
        rr.rect(x, 5, x, 14, 2)
        rr.m[(rr.m > 0) & ~vidrio & (L.caja_mascara(85, 0, 110, 20))] = 0
    return L, r, None


def silla_pequena(n=0):
    """Silla pequeña de colores para niñas y niños."""
    L = Lienzo(22, 30, semilla=307)
    L.cojin(3, 1, 18, 11, 'menta', r=3, arriba=0.3, abajo=0.25)
    L.rect(2, 14, 19, 17, (230, 192, 86), tex=False)                                # asiento amarillo
    L.rect(2, 14, 19, 14, op.mezcla(AMARILLO, (255, 255, 255), 0.3), tex=False)
    L.rect(2, 17, 19, 18, op.mezcla(AMARILLO, (0, 0, 0), 0.3), tex=False)
    for x in (3, 16):
        L.rect(x, 18, x + 2, 27, 'pino', 3)
    L.rect(9, 11, 12, 13, 'pino', 3, tex=False)
    return L, _reflejos(L), None


def tapete_juegos(n=0):
    """Tapete de foamy en cuadros de colores encajados, para jugar en el piso."""
    L = Lienzo(92, 62, semilla=311)
    colores = (ROJO, AZUL, AMARILLO, VERDE)
    for fila in range(3):
        for col in range(4):
            x0 = 3 + col * 21 - fila                                                # el tapete se abre hacia la cámara
            y0 = 3 + fila * 18
            c = colores[(fila + col) % 4]
            L.rect(x0, y0, x0 + 20 + fila // 2, y0 + 17, c, tex=False)
            L.rect(x0, y0, x0 + 20 + fila // 2, y0, op.mezcla(c, (255, 255, 255), 0.3), tex=False)
            for k in range(4, 17, 6):                                               # los dientes del encaje
                L.rect(x0 + 20 + fila // 2, y0 + k, x0 + 21 + fila // 2, y0 + k + 2, c, tex=False)
            L.rect(x0, y0 + 17, x0 + 20 + fila // 2, y0 + 17, op.mezcla(c, (0, 0, 0), 0.3), tex=False)
    return L, _reflejos(L), None


def bandera_asta(n=0):
    """Asta con la bandera de Colombia, que se mece apenas (3 cuadros), sobre su base."""
    L = Lienzo(30, 92, semilla=313)
    L.rect(4, 2, 5, 86, 'laton', 2)                                                 # asta
    L.rect(4, 2, 4, 86, 'laton', 1, tex=False)
    L.elipse(2, 0, 7, 4, 'laton', 1)                                                # remate
    L.bloque(0, 84, 10, 90, 'nogal', tapa=2, base=1)                                # base
    ondas = ((0, 1, 2, 2, 1, 0), (1, 2, 2, 1, 0, 0), (0, 0, 1, 2, 2, 1))[n]
    for k in range(6):                                                              # tela por columnas de 3 px
        x = 6 + k * 4
        dy = ondas[k]
        L.rect(x, 8 + dy, x + 3, 15 + dy, (230, 192, 60), tex=False)                # amarillo
        L.rect(x, 16 + dy, x + 3, 19 + dy, (52, 82, 160), tex=False)                # azul
        L.rect(x, 20 + dy, x + 3, 23 + dy, (196, 52, 52), tex=False)                # rojo
    r = _reflejos(L)
    r['izquierda'].rect(4, 6, 4, 80, 2)
    r['derecha'].rect(5, 6, 5, 80, 2)
    r['frente'].rect(4, 1, 5, 2, 2)
    return L, r, None


def banca_exterior(n=0):
    """Banca de concreto de la fachada, con una bolsa olvidada encima."""
    L = Lienzo(102, 36, semilla=315)
    L.bloque(2, 8, 99, 20, 'ceramica', tapa=6)                                      # tabla de concreto
    for x in (10, 84):                                                              # apoyos
        L.bloque(x, 20, x + 8, 33, 'ceramica', tapa=2, base=1)
    L.tex[:, :] = False
    L.cojin(64, 1, 80, 12, 'tela-azul', r=3, arriba=0.3, abajo=0.3)                 # bolsa olvidada
    L.rect(69, 0, 75, 1, 'tela-azul', 3, tex=False)
    return L, _reflejos(L), None


SELLO = (0, -2, 1, 0)                 # 0 quieto · 1 se levanta · 2 golpea · 3 queda y aparece la marca


def sello_tinta(n=0):
    """Sello de la comisaría con su almohadilla; al revisarlo, se levanta, golpea el papel y deja la marca."""
    L = Lienzo(34, 24, semilla=317)
    L.rect(2, 14, 31, 21, 'papel', 0)                                               # hoja
    L.rect(2, 21, 31, 21, 'papel', 2, tex=False)
    L.bloque(3, 15, 13, 20, 'plastico-negro', tapa=2, base=1)                       # almohadilla
    L.rect(4, 16, 12, 17, (110, 70, 140), tex=False)
    if n == 3:
        L.elipse(18, 15, 27, 20, (150, 96, 170), tex=False)                         # la marca morada
        L.elipse(20, 16, 25, 19, 'papel', 0)
    dy = SELLO[n]
    x0 = 19
    L.rect(x0, 11 + dy, x0 + 8, 14 + dy, 'nogal', 2)                                # cuerpo del sello
    L.rect(x0 + 2, 3 + dy, x0 + 6, 10 + dy, 'nogal', 1)                             # mango
    L.elipse(x0 + 1, max(0, dy), x0 + 7, 5 + dy, 'nogal', 1)                        # pomo
    return L, _reflejos(L), None


def boligrafo_formularios(n=0):
    """Formularios de denuncia en blanco con un bolígrafo atado a su cadena."""
    L = Lienzo(36, 22, semilla=319)
    for k in range(3):                                                              # pila de formularios
        L.rect(2 + k, 6 - k * 2, 27 + k, 19 - k * 2, 'papel', 1 if k < 2 else 0)
    L.rect(6, 4, 22, 5, (70, 90, 130), tex=False)                                   # encabezado
    for y in (8, 11, 14):
        L.rect(6, y, 25, y, (150, 156, 170), tex=False)
    L.linea(18, 17, 31, 6, AZUL)                                                    # bolígrafo
    L.linea(19, 17, 32, 6, (40, 60, 110))
    L.px(18, 18, (30, 30, 40))
    L.linea(31, 6, 34, 17, 'cromo', 3)                                              # cadena
    return L, _reflejos(L), None


def cartel_155(n=0):
    """Cartel de la línea 155 en su soporte: el número grande y la bocina, morado de la campaña."""
    L = Lienzo(40, 54, semilla=321)
    L.rect(18, 36, 21, 50, 'acero', 2)                                              # soporte
    L.elipse(10, 48, 29, 52, 'acero', 3)
    L.rect(2, 2, 37, 38, MORADO, tex=False)                                         # cartel
    L.rect(2, 2, 37, 3, op.mezcla(MORADO, (255, 255, 255), 0.3), tex=False)
    L.rect(2, 37, 37, 38, op.mezcla(MORADO, (0, 0, 0), 0.3), tex=False)
    patron = {'1': ['.##.', '###.', '.##.', '.##.', '.##.', '####'], '5': ['####', '##..', '####', '..##', '..##', '####']}
    for k, d in enumerate('155'):                                                   # 1 5 5, cifras de 4 × 6
        for yy, fila in enumerate(patron[d]):
            for xx, ch in enumerate(fila):
                if ch == '#':
                    L.px(7 + k * 9 + xx, 8 + yy, (248, 240, 214))
    L.rect(9, 20, 17, 27, (248, 240, 214), tex=False)                               # la bocina del teléfono
    L.rect(11, 22, 15, 25, MORADO, tex=False)
    L.rect(20, 21, 32, 22, (210, 196, 226), tex=False)                              # dos renglones gruesos
    L.rect(20, 25, 29, 26, (210, 196, 226), tex=False)
    L.rect(6, 31, 33, 33, (230, 192, 86), tex=False)                                # franja: gratuita, 24 horas
    return L, _reflejos(L), None


def estante_juguetes(n=0):
    """Estante bajo con canastas de juguetes: bloques, un muñeco, libros de cuentos y una pelota."""
    L = Lienzo(62, 44, semilla=309)
    L.bloque(1, 1, 60, 41, 'pino', tapa=3)
    L.rect(4, 6, 57, 38, 'pino', 5, tex=False)
    L.rect(4, 21, 57, 22, 'pino', 2, tex=False)
    for k, (x, c) in enumerate(((6, ROJO), (24, AZUL), (42, VERDE))):               # canastas de colores
        L.rect(x, 26, x + 14, 37, c, tex=False)
        L.rect(x, 26, x + 14, 27, op.mezcla(c, (255, 255, 255), 0.3), tex=False)
        L.rect(x + 2, 24, x + 5, 26, (230, 192, 86) if k else (236, 220, 200), tex=False)   # lo que asoma
    for k in range(4):                                                              # cuentos de pie
        c = (ROJO, AMARILLO, AZUL, VERDE)[k]
        L.rect(7 + k * 4, 9, 9 + k * 4, 20, c, tex=False)
    L.elipse(28, 12, 35, 19, 'peluche', 2)                                          # un muñeco sentado
    L.elipse(29, 8, 34, 13, 'peluche', 1)
    L.elipse(44, 13, 52, 20, ROJO, tex=False)                                       # pelota
    L.rect(46, 14, 48, 15, (236, 160, 150), tex=False)
    return L, _reflejos(L), None
