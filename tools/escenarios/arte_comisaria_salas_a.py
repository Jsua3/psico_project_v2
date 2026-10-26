"""Comisaría de familia (P4), salas A: fachada, recepción, sala de espera, pasillo y archivo.

Paletas para fondo_sala() de arte_comun.py y lo propio de cada sala (PROPIOS), pintado sobre la
pared del fondo. Paleta institucional, fría y apagada (ESTILO.md, sección 8). Sin personas, sin
texto legible y sin escudos reales: el escudo de la fachada es una forma genérica.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from arte_comun import *  # noqa: E402,F401,F403  (fondo_sala, primitivas, SEAM, mezcla, osc)

AZUL_INST = (62, 84, 118)       # color institucional de la fachada
OSCURO = (34, 38, 48)
PUERTA_CLARA = dict(puerta=(112, 124, 128), marco=(50, 58, 70))

SALAS = {
    # Exterior: bloque gris con franja institucional, cielo arriba, puerta de vidrio al centro.
    'fachada': dict(
        top=36, cielo=(150, 166, 184), cielo_claro=(150, 166, 184),
        pared=(124, 128, 136), canto=(150, 154, 162), lado=(110, 114, 122),
        pared_alta=(10, (96, 100, 110)),
        ladrillo=((120, 124, 132), (130, 134, 142)),
        franja=(132, AZUL_INST),
        baja=(34, (100, 104, 112)), moldura=(150, 154, 162), zocalo=(100, 104, 112),
        piso='adoquin', pisoA=(118, 118, 116), pisoB=(108, 108, 106), pisoC=(113, 113, 111), junta=(86, 86, 86),
        marco=(52, 58, 70), vidrio=(78, 104, 126), vidrio_claro=(128, 154, 172), puerta_vidrio=True,
        marco_ventana=(176, 180, 186),
        deco=[('ventana', 160, 60, 96, 40), ('ventana', 310, 60, 96, 40),
              ('ventana', 650, 60, 96, 40), ('ventana', 800, 60, 96, 40)],
        luces=[]),
    # Azul gris con zócalo y una franja azul; una pantalla de turnos apagada sobre el mostrador.
    'recepcion': dict(
        pared=(84, 98, 120), lado=(68, 80, 100), canto=(132, 142, 158),
        baja=(40, (64, 76, 96)), moldura=(132, 142, 158), zocalo=(64, 76, 96),
        franja=(150, (58, 82, 118)),
        piso='baldosa', pisoA=(124, 128, 136), pisoB=(114, 118, 126), junta=(92, 96, 108),
        deco=[('reloj', 560, 114)],
        luces=[], **PUERTA_CLARA),
    # Sala de espera: franja de color a media pared, ventana alta y un cartel con pictograma.
    'sala-espera': dict(
        pared=(88, 100, 118), lado=(70, 82, 98), canto=(134, 144, 158),
        baja=(34, (68, 80, 98)), moldura=(134, 144, 158), zocalo=(68, 80, 98),
        franja=(172, (66, 100, 120)),
        piso='baldosa', pisoA=(124, 128, 136), pisoB=(114, 118, 126), junta=(92, 96, 108),
        marco_ventana=(176, 180, 186),
        deco=[('ventana', 220, 96, 120, 56)],
        luces=[], **PUERTA_CLARA),
    # Pasillo de atención: pared gris verdosa con zócalo y una franja guía a lo largo.
    'pasillo': dict(
        pared=(104, 114, 112), canto=(146, 156, 154), lado=(88, 98, 96),
        baja=(40, (76, 86, 84)), moldura=(146, 156, 154), zocalo=(76, 86, 84),
        franja=(112, (70, 104, 118)),
        piso='baldosa', pisoA=(128, 130, 128), pisoB=(118, 120, 118), junta=(96, 98, 96),
        deco=[('reloj', 672, 108)],
        luces=[], **PUERTA_CLARA),
    # Archivo: gris frío, baldosa, una ventana alta pequeña y una rejilla de ventilación.
    'archivo': dict(
        pared=(96, 100, 108), lado=(80, 84, 92), canto=(138, 142, 150),
        baja=(30, (74, 78, 86)), moldura=(138, 142, 150), zocalo=(74, 78, 86),
        piso='baldosa', pisoA=(118, 120, 124), pisoB=(108, 110, 114), junta=(88, 90, 96),
        marco_ventana=(164, 168, 174),
        deco=[('ventana', 800, 100, 80, 34)],
        luces=[(480, 380)], luz=(224, 236, 255), **PUERTA_CLARA),
}


# ── lo propio de cada sala ─────────────────────────────────────────────────────

def _escudo(d, cx, y):
    """Escudo GENÉRICO sin letras: forma de escudo, franja y un círculo."""
    borde, azul, claro = (196, 200, 206), AZUL_INST, (150, 164, 188)
    d.polygon([(cx - 26, y), (cx + 26, y), (cx + 26, y + 32), (cx, y + 58), (cx - 26, y + 32)], fill=borde)
    d.polygon([(cx - 21, y + 5), (cx + 21, y + 5), (cx + 21, y + 31), (cx, y + 51), (cx - 21, y + 31)], fill=azul)
    d.rectangle([cx - 21, y + 19, cx + 21, y + 26], fill=claro)           # franja
    d.ellipse([cx - 7, y + 28, cx + 7, y + 42], fill=borde)               # círculo
    d.rectangle([cx - 2, y + 5, cx + 2, y + 18], fill=borde)


def propio_fachada(d, sala, p):
    _escudo(d, 480, 54)
    piedra, sombra = (150, 152, 156), (134, 136, 140)
    # escalones de acceso bajo la puerta
    d.rectangle([410, 231, 550, 238], fill=piedra)
    d.rectangle([398, 239, 562, 248], fill=sombra)
    # rampa con baranda a la derecha: cuña de piedra arrimada al muro
    d.polygon([(596, 250), (792, 222), (792, 250)], fill=piedra)
    d.polygon([(596, 250), (792, 222), (792, 226), (596, 254)], fill=sombra)
    riel = p['marco']
    d.line([(596, 232), (792, 204)], fill=riel, width=3)
    for x in (600, 696, 790):
        y = 232 - round((x - 596) * 28 / 196)
        d.rectangle([x - 1, y, x + 1, y + 20 + (x - 596) // 7], fill=riel)


def propio_recepcion(d, sala, p):
    """Pantalla de turnos apagada colgada sobre el mostrador."""
    x, y0, w, h = 420, 98, 124, 30
    d.rectangle([x - w // 2 - 3, y0 - 3, x + w // 2 + 3, y0 + h + 3], fill=OSCURO)
    d.rectangle([x - w // 2, y0, x + w // 2, y0 + h], fill=(22, 28, 38))
    for k in range(3):       # reflejos tenues de una pantalla apagada
        d.rectangle([x - w // 2 + 8 + k * 38, y0 + 6, x - w // 2 + 30 + k * 38, y0 + 10], fill=(40, 52, 70))
    d.rectangle([x - w // 2 + 8, y0 + 18, x + w // 2 - 8, y0 + 20], fill=(40, 52, 70))
    d.rectangle([x - 1, y0 - 12, x + 1, y0 - 3], fill=OSCURO)           # soporte


def propio_sala_espera(d, sala, p):
    """Cartel con pictograma (silla) sin texto; el tablero de avisos va aparte, es la cartelera."""
    x, y0, w, h = 740, 96, 70, 50
    d.rectangle([x - w // 2 - 3, y0 - 3, x + w // 2 + 3, y0 + h + 3], fill=p['zocalo'])
    d.rectangle([x - w // 2, y0, x + w // 2, y0 + h], fill=(214, 208, 190))
    azul = (66, 100, 120)
    d.rectangle([x - 12, y0 + 8, x - 8, y0 + 28], fill=azul)            # respaldo
    d.rectangle([x - 12, y0 + 24, x + 12, y0 + 30], fill=azul)          # asiento
    d.rectangle([x + 8, y0 + 30, x + 12, y0 + 42], fill=azul)           # patas
    d.rectangle([x - 12, y0 + 30, x - 8, y0 + 42], fill=azul)
    d.polygon([(x + 14, y0 + 12), (x + 26, y0 + 20), (x + 14, y0 + 28)], fill=azul)   # flecha


def propio_pasillo(d, sala, p):
    """Extintor pequeño con su señal, entre las puertas 330 y 560."""
    x = 450
    d.rectangle([x - 11, 172, x + 11, 176], fill=(60, 66, 66))                   # soporte de pared
    d.rectangle([x - 10, 150, x + 10, 168], fill=(200, 204, 206))                # señal
    d.rectangle([x - 6, 154, x + 6, 164], fill=(168, 70, 64))
    d.rectangle([x - 5, 186, x + 5, 224], fill=(168, 70, 64))                    # cuerpo
    d.rectangle([x - 5, 186, x - 3, 224], fill=(196, 96, 88))
    d.rectangle([x - 5, 198, x + 5, 202], fill=(214, 210, 200))                  # etiqueta lisa
    d.rectangle([x - 3, 180, x + 3, 186], fill=OSCURO)                           # cuello
    d.rectangle([x - 6, 176, x + 6, 180], fill=OSCURO)                           # válvula
    d.line([(x + 6, 178), (x + 10, 192), (x + 8, 206)], fill=OSCURO, width=2)    # manguera
    d.rectangle([x - 6, 224, x + 6, 226], fill=(70, 74, 76))


def propio_archivo(d, sala, p):
    """Rejilla de ventilación en la pared, entre los estantes y los archivadores."""
    x, y0, w, h = 520, 100, 56, 22
    d.rectangle([x - w // 2 - 2, y0 - 2, x + w // 2 + 2, y0 + h + 2], fill=(70, 74, 82))
    d.rectangle([x - w // 2, y0, x + w // 2, y0 + h], fill=(44, 48, 56))
    for yy in range(y0 + 3, y0 + h - 1, 5):
        d.rectangle([x - w // 2 + 2, yy, x + w // 2 - 2, yy + 1], fill=(104, 108, 116))


PROPIOS = {
    'fachada': propio_fachada,
    'recepcion': propio_recepcion,
    'sala-espera': propio_sala_espera,
    'pasillo': propio_pasillo,
    'archivo': propio_archivo,
}
