"""Universidad: objetos redibujados al oficio v2 (bloque O1), a la densidad de los personajes.

    python tools/escenarios/objetos_universidad.py     # hoja de antes y después en maqueta-visual/objetos/
"""
import os
import sys

import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import objetos_comisaria as ocm  # noqa: E402  (registra acero, laminado, manila)
import objetos_casa_b as ocb  # noqa: E402
import objetos_herramientas  # noqa: E402,F401  (registra las tapas)
import objetos_pixel as op  # noqa: E402
from objetos_pixel import Lienzo, Reflejo  # noqa: E402

op.material('mochila', (70, 104, 150), op.tex_grano(0.05, claras=0.0), luz=0.42, sombra=0.55)
ROJO, AMARILLO = (204, 84, 72), (230, 192, 86)


def _reflejos(L):
    return {lado: Reflejo(L.w, L.h) for lado in op.LADOS}


CELULAR = (0, 1, 1, 2)                 # 0 apagado · 1 llega un mensaje (la pantalla se enciende) · 2 vibra


def celular(n=0):
    """Celular boca arriba sobre la mesa. Al acercarse llega un mensaje: la pantalla se enciende y vibra."""
    L = Lienzo(22, 14, semilla=191)
    fase = CELULAR[n]
    dx = 1 if fase == 2 else 0
    L.poli([(3 + dx, 2), (17 + dx, 1), (20 + dx, 10), (5 + dx, 12)], 'plastico-negro', 2)   # el teléfono acostado
    L.rect(5 + dx, 11, 20 + dx, 12, 'plastico-negro', 4, tex=False)
    pantalla = L.poli_mascara([(5 + dx, 3), (16 + dx, 2), (18 + dx, 9), (6 + dx, 10)])
    if fase == 0:
        L.mascara(pantalla, 'pantalla', 3, tex=False)
    else:
        L.mascara(pantalla, (96, 140, 196), tex=False)
        L.rect(8 + dx, 4, 14 + dx, 6, (236, 240, 244), tex=False)                   # el globo del mensaje
        L.px(9 + dx, 5, (120, 130, 150))
        L.px(11 + dx, 5, (120, 130, 150))
    em = pantalla.copy() if fase else np.zeros_like(pantalla)
    r = _reflejos(L)
    for rr, (x, y) in ((r['izquierda'], (6, 4)), (r['derecha'], (16, 3)), (r['frente'], (11, 3))):
        rr.px(x + dx, y, 2)
        rr.px(x + dx + 1, y, 1)
    return L, r, em


def mochila(n=0):
    """Mochila de estudiante recostada en el piso, con el bolsillo de adelante y un llavero."""
    L = Lienzo(28, 32, semilla=193)
    L.rect(9, 1, 18, 3, 'mochila', 3, tex=False)                                    # asa
    L.cojin(3, 3, 24, 29, 'mochila', r=6, arriba=0.2, abajo=0.15)
    L.cojin(6, 15, 21, 27, 'mochila', r=3, arriba=0.25, abajo=0.3)                  # bolsillo
    L.rect(7, 15, 20, 15, 'cromo', 3, tex=False)                                    # cremallera
    L.rect(19, 16, 19, 19, AMARILLO, tex=False)                                     # llavero
    L.rect(18, 19, 20, 20, ROJO, tex=False)
    L.rect(1, 8, 3, 24, 'mochila', 4, tex=False)                                    # tirante
    return L, _reflejos(L), None


def taza_cafe(n=0):
    """Taza de café humeante (4 cuadros de vapor)."""
    L = Lienzo(18, 20, semilla=195)
    L.rect(3, 8, 12, 18, 'ceramica', 1)
    L.rect(3, 8, 12, 9, 'ceramica', 0, tex=False)
    L.rect(4, 9, 11, 10, (96, 62, 44), tex=False)                                   # el café
    L.rect(12, 11, 15, 15, 'ceramica', 2, tex=False)                                # oreja
    L.rect(13, 12, 14, 14, 'ceramica', 5, tex=False)
    L.rect(3, 17, 12, 18, 'ceramica', 3, tex=False)
    L.rect(5, 13, 10, 14, ROJO, tex=False)                                          # el logo de la universidad
    for k in range(2):                                                              # vapor que sube y se mece
        x = 5 + k * 3 + (1 if (n + k) % 4 in (1, 2) else 0)
        y = 5 - ((n + k * 2) % 4)
        L.rect(x, y, x, y + 1, (236, 232, 226), tex=False)
    r = _reflejos(L)
    r['izquierda'].rect(3, 10, 3, 16, 1)
    r['derecha'].rect(12, 10, 12, 16, 1)
    r['frente'].rect(4, 8, 11, 8, 1)
    return L, r, None


def vaso_agua(n=0):
    """Vaso de vidrio con agua, servido sobre la mesa."""
    L = Lienzo(12, 18, semilla=197)
    L.poli([(2, 1), (9, 1), (8, 16), (3, 16)], 'vidrio', 1, tex=False)
    L.poli([(2, 6), (9, 6), (8, 16), (3, 16)], 'agua', 2, tex=False)
    L.rect(2, 6, 9, 6, 'agua', 0, tex=False)
    L.rect(3, 16, 8, 16, 'vidrio', 4, tex=False)
    r = _reflejos(L)
    r['izquierda'].rect(3, 2, 3, 14, 2)
    r['derecha'].rect(8, 2, 8, 14, 2)
    r['frente'].rect(4, 2, 7, 2, 1)
    r['frente'].rect(5, 7, 6, 12, 1)
    return L, r, None


def computador(n=0):
    """Computador de oficina: monitor con una ventana abierta (el cursor parpadea), teclado y ratón."""
    L = Lienzo(36, 30, semilla=199)
    L.rect(4, 1, 31, 18, 'plastico-gris', 2)                                        # monitor
    L.rect(4, 1, 31, 1, 'plastico-gris', 0, tex=False)
    pantalla = L.caja_mascara(6, 3, 29, 16)
    L.mascara(pantalla, (70, 110, 160), tex=False)
    L.rect(6, 3, 29, 4, (40, 70, 116), tex=False)
    L.rect(9, 6, 25, 14, (226, 232, 238), tex=False)                                # documento
    L.rect(11, 8, 20, 9, (150, 160, 176), tex=False)
    L.rect(11, 11, 17, 12, (150, 160, 176), tex=False)
    if n == 0:
        L.rect(18, 11, 18, 12, (30, 40, 60), tex=False)                             # cursor
    L.rect(15, 19, 20, 21, 'plastico-gris', 3, tex=False)                           # pie
    L.rect(11, 21, 24, 22, 'plastico-gris', 2, tex=False)
    L.rect(4, 24, 27, 27, 'plastico-gris', 1)                                       # teclado
    for x in range(5, 27, 2):
        L.px(x, 25, 'plastico-gris', 3)
    L.rect(30, 24, 33, 27, 'plastico-gris', 1)                                      # ratón
    em = pantalla.copy()
    r = _reflejos(L)
    r['izquierda'].diagonal(7, 15, 5, 1, 2)
    r['derecha'].diagonal(28, 15, 5, 1, 2, sentido=-1)
    r['frente'].rect(8, 3, 26, 3, 1)
    return L, r, em


def lampara_escritorio(n=0):
    """Lámpara de escritorio articulada, encendida: la pantalla brilla por dentro."""
    L = Lienzo(24, 30, semilla=201)
    L.elipse(3, 25, 18, 29, 'metal', 3)                                             # base
    L.rect(4, 26, 17, 26, 'metal', 1, tex=False)
    L.linea(10, 26, 6, 15, 'metal', 2)                                              # brazos
    L.linea(6, 15, 14, 6, 'metal', 2)
    L.elipse(5, 14, 7, 16, 'metal', 4, tex=False)                                   # articulación
    L.poli([(12, 3), (21, 6), (19, 11), (11, 8)], 'metal', 1)                       # pantalla
    L.rect(13, 9, 19, 11, (255, 236, 176), tex=False)                               # la bombilla encendida
    em = L.caja_mascara(13, 9, 19, 11)
    r = _reflejos(L)
    r['izquierda'].rect(12, 4, 14, 4, 2)
    r['derecha'].rect(18, 5, 20, 5, 2)
    r['frente'].rect(14, 4, 18, 4, 1)
    for rr in r.values():
        rr.px(5, 15, 1)
    return L, r, em


BOTIQUIN = (0, 2, 5, 4)                # 0 cerrado · 1-3 la tapa se abre, se pasa y se asienta (revisar)


def botiquin(n=0):
    """Botiquín blanco de pared con la cruz roja. Al revisarlo, la puerta se abre y se ven vendas y frascos."""
    L = Lienzo(30, 28, semilla=203)
    L.bloque(2, 2, 27, 25, 'blanco-clinico', tapa=2, base=1)
    abre = BOTIQUIN[n]
    if abre:
        L.rect(4, 5, 25, 23, 'blanco-clinico', 4, tex=False)                        # interior
        L.rect(4, 13, 25, 13, 'blanco-clinico', 2, tex=False)                       # repisa
        L.rect(6, 8, 10, 12, 'papel', 0, tex=False)                                 # vendas
        L.rect(13, 7, 15, 12, (196, 140, 96), tex=False)                            # frascos
        L.rect(17, 8, 19, 12, (120, 170, 200), tex=False)
        L.rect(7, 16, 18, 21, (230, 220, 200), tex=False)                           # caja de gasas
        L.rect(25, 4, 25 + abre, 24, 'blanco-clinico', 1)                           # la puerta abierta, de canto
    else:
        L.rect(11, 8, 18, 19, ROJO, tex=False)                                      # la cruz
        L.rect(8, 11, 21, 16, ROJO, tex=False)
        L.rect(24, 12, 25, 15, 'cromo', 2, tex=False)                               # cierre
    return L, _reflejos(L), None


HOJA_LIBRO = (0, 1, 2)


def libro_abierto(n=0):
    """Libro de consulta abierto sobre la mesa. Al revisarlo, pasa una hoja (el último queda)."""
    L = Lienzo(32, 18, semilla=205)
    L.poli([(2, 4), (30, 4), (31, 15), (1, 15)], (60, 92, 140), tex=False)          # tapas
    L.rect(3, 2, 15, 14, 'papel', 0)                                                # páginas
    L.rect(17, 2, 29, 14, 'papel', 1)
    L.rect(16, 2, 16, 14, 'papel', 4, tex=False)
    for y in range(4, 13, 2):
        L.rect(5, y, 13, y, (150, 156, 170), tex=False)
        L.rect(19, y, 27 - (y % 4), y, (150, 156, 170), tex=False)
    if n == 1:
        L.poli([(16, 2), (24, 0), (24, 12), (16, 14)], 'papel', 0)                  # la hoja en el aire
    L.rect(5, 7, 9, 9, (230, 192, 86), tex=False)                                   # un subrayado
    return L, _reflejos(L), None


def buzon(n=0):
    """Buzón de bienestar en su pedestal, con la ranura y una hoja doblada a medio entrar (al acercarse termina de entrar)."""
    L = Lienzo(24, 44, semilla=207)
    L.rect(10, 22, 13, 40, 'acero', 2)
    L.elipse(4, 38, 19, 42, 'acero', 3)
    L.bloque(3, 4, 20, 23, 'tapa-bitacora', tapa=3)
    L.rect(7, 9, 16, 10, 'plastico-negro', 5, tex=False)                            # ranura
    if n == 0:
        L.rect(9, 5, 14, 9, 'papel', 0, tex=False)                                  # la hoja a medio entrar
    L.rect(7, 14, 16, 19, 'papel', 1, tex=False)                                    # la etiqueta
    L.rect(9, 16, 14, 17, (96, 170, 104), tex=False)
    return L, _reflejos(L), None


def carne(n=0):
    """Carné estudiantil en su cordón, olvidado sobre la mesa."""
    L = Lienzo(26, 18, semilla=209)
    L.linea(2, 4, 10, 2, (70, 110, 160))                                             # cordón
    L.linea(10, 2, 16, 5, (70, 110, 160))
    L.linea(2, 5, 9, 3, (50, 80, 120))
    L.rect(9, 6, 23, 16, 'plastico-crema', 1)                                       # la tarjeta
    L.rect(9, 6, 23, 8, (176, 70, 64), tex=False)                                   # franja de la universidad
    L.rect(11, 10, 14, 14, (176, 140, 110), tex=False)                              # la foto
    L.rect(16, 10, 21, 11, (120, 124, 140), tex=False)
    L.rect(16, 13, 20, 14, (120, 124, 140), tex=False)
    r = _reflejos(L)
    r['izquierda'].rect(10, 9, 10, 15, 1)
    r['derecha'].rect(22, 9, 22, 15, 1)
    r['frente'].rect(11, 9, 21, 9, 1)
    return L, r, None


def folletos(n=0):
    """Exhibidor de acrílico con folletos de la ruta de atención, plegados en tres."""
    L = Lienzo(28, 30, semilla=211)
    L.bloque(2, 14, 25, 27, 'vidrio', tapa=2, base=1)                               # base de acrílico
    for k, c in enumerate(((96, 170, 104), (70, 110, 160), (204, 84, 72))):          # tres folletos de pie
        x = 4 + k * 7
        L.rect(x, 3 + k, x + 5, 16, 'papel', 0)
        L.rect(x, 3 + k, x + 5, 6 + k, c, tex=False)
        L.rect(x + 1, 9 + k, x + 4, 9 + k, (120, 124, 140), tex=False)
        L.rect(x + 3, 4 + k, x + 3, 16, 'papel', 2, tex=False)                      # el pliegue
    vidrio = L.caja_mascara(2, 14, 25, 27)
    r = _reflejos(L)
    r['izquierda'].rect(3, 16, 3, 25, 2)
    r['derecha'].rect(24, 16, 24, 25, 2)
    r['frente'].rect(5, 15, 22, 15, 1)
    for rr in r.values():
        rr.m[(rr.m > 0) & ~vidrio] = 0
    return L, r, None


def planilla(n=0):
    """Planilla de turnos en su tabla con pinza, colgada de un clavo."""
    L = Lienzo(24, 32, semilla=213)
    L.rect(3, 4, 20, 30, 'laminado', 2)
    L.rect(5, 7, 18, 28, 'papel', 0)
    for y in range(10, 27, 3):                                                      # filas de turnos
        L.rect(6, y, 8, y + 1, (96, 170, 104) if y % 2 else (70, 110, 160), tex=False)
        L.rect(10, y, 17, y + 1, (150, 156, 170), tex=False)
    L.rect(8, 2, 15, 7, 'cromo', 2)                                                 # pinza
    L.rect(8, 2, 15, 2, 'cromo', 0, tex=False)
    L.px(11, 0, 'cromo', 3)
    r = _reflejos(L)
    r['izquierda'].px(8, 3, 2)
    r['derecha'].px(15, 3, 2)
    r['frente'].rect(10, 2, 13, 2, 2)
    return L, r, None


B = 'escenarios/universidad/arte/'
PIEZAS = {
    'buzon-bienestar': dict(nombre='Buzón de bienestar', tipo='objeto', dibujar=buzon, cuadros=2,
                            huella=dict(ancho=18, fondo=8, alto=38), material='lámina',
                            animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                             cerca=dict(de=1, hasta=1, fps=4, bucle=False, sostener=True)),
                            reemplaza=B + 'objetos/buzon-bienestar.png'),
    'carne-estudiantil': dict(nombre='Carné estudiantil', tipo='objeto', dibujar=carne, cuadros=1, sobre=24,
                              huella=dict(ancho=20, fondo=6, alto=4), material='plástico',
                              reemplaza=B + 'objetos/carne-estudiantil.png'),
    'folleto-rutas': dict(nombre='Folletos de la ruta de atención', tipo='objeto', dibujar=folletos, cuadros=1, sobre=24,
                          huella=dict(ancho=22, fondo=8, alto=24), material='acrílico y papel',
                          reemplaza=B + 'objetos/folleto-rutas.png'),
    'planilla-turnos': dict(nombre='Planilla de turnos', tipo='objeto', dibujar=planilla, cuadros=1,
                            huella=dict(ancho=18, fondo=4, alto=28), material='papel',
                            reemplaza=B + 'objetos/planilla-turnos.png'),
    'afiche-bienestar': dict(ocm.PIEZAS['afiche-rutas-atencion'], nombre='Afiche de bienestar', reemplaza=B + 'objetos/afiche-bienestar.png'),
    'cartelera-horarios': dict(nombre='Cartelera de horarios', tipo='objeto', dibujar=__import__('objetos_hospital_c').cartelera_pasillo,
                               cuadros=1, huella=dict(ancho=56, fondo=8, alto=60), material='tablero y cromo',
                               reemplaza=B + 'objetos/cartelera-horarios.png'),
    'tablero-avisos': dict(nombre='Tablero de avisos', tipo='objeto', dibujar=__import__('objetos_comisaria_b').cartelera,
                           cuadros=1, huella=dict(ancho=70, fondo=8, alto=70), material='corcho',
                           reemplaza=B + 'objetos/tablero-avisos.png'),
    'computador-oficina': dict(nombre='Computador de oficina', tipo='objeto', dibujar=computador, cuadros=2, sobre=24,
                               huella=dict(ancho=30, fondo=8, alto=22), material='plástico y pantalla',
                               animaciones=dict(reposo=dict(de=0, hasta=1, fps=2, bucle=True)),
                               reemplaza=B + 'objetos/computador-oficina.png'),
    'lampara-escritorio': dict(nombre='Lámpara de escritorio', tipo='objeto', dibujar=lampara_escritorio, cuadros=1, sobre=24,
                               huella=dict(ancho=16, fondo=6, alto=26), material='metal',
                               emite=dict(forma='pozo', radio=[26, 12], tono='calido', momento='siempre', niveles=[2]),
                               reemplaza=B + 'objetos/lampara-escritorio.png'),
    'botiquin': dict(nombre='Botiquín', tipo='objeto', dibujar=botiquin, cuadros=4,
                     huella=dict(ancho=24, fondo=4, alto=22), material='lámina esmaltada',
                     animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                      revisar=dict(de=1, hasta=3, fps=10, bucle=False, sostener=True)),
                     reemplaza=B + 'objetos/botiquin.png'),
    'libro-abierto': dict(nombre='Libro abierto', tipo='objeto', dibujar=libro_abierto, cuadros=3, sobre=24,
                          huella=dict(ancho=28, fondo=8, alto=6), material='papel',
                          animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                           revisar=dict(de=1, hasta=2, fps=8, bucle=False, sostener=True)),
                          reemplaza=B + 'objetos/libro-abierto.png'),
    'celular': dict(nombre='Celular', tipo='objeto', dibujar=celular, cuadros=4, sobre=24,
                    huella=dict(ancho=18, fondo=6, alto=4), material='pantalla',
                    animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                     cerca=dict(de=1, hasta=3, fps=6, bucle=False, sostener=True)),
                    reemplaza=B + 'objetos/celular.png'),
    'mochila': dict(nombre='Mochila', tipo='objeto', dibujar=mochila, cuadros=1,
                    huella=dict(ancho=22, fondo=8, alto=26), material='tela',
                    reemplaza=B + 'objetos/mochila.png'),
    'taza-cafe': dict(nombre='Taza de café', tipo='objeto', dibujar=taza_cafe, cuadros=4, sobre=24,
                      huella=dict(ancho=12, fondo=4, alto=10), material='cerámica',
                      animaciones=dict(reposo=dict(de=0, hasta=3, fps=4, bucle=True)),
                      reemplaza=B + 'objetos/taza-cafe.png'),
    'vaso-agua': dict(nombre='Vaso de agua', tipo='objeto', dibujar=vaso_agua, cuadros=1, sobre=24,
                      huella=dict(ancho=8, fondo=4, alto=14), material='vidrio y agua',
                      reemplaza=B + 'objetos/vaso-agua.png'),
    'caja-panuelos': dict(ocm.PIEZAS['caja-panuelos'], reemplaza=B + 'objetos/caja-panuelos.png'),
    'planta-maceta': dict(nombre='Planta en maceta', tipo='objeto', dibujar=ocb.planta_maceta, cuadros=2,
                          huella=dict(ancho=18, fondo=8, alto=30), material='hojas y barro',
                          animaciones=dict(reposo=dict(de=0, hasta=1, fps=2, bucle=True)),
                          reemplaza=B + 'objetos/planta-maceta.png'),
}


if __name__ == '__main__':
    import objetos_hoja
    objetos_hoja.hoja_lugar('universidad', PIEZAS)
