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


B = 'escenarios/universidad/arte/'
PIEZAS = {
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
