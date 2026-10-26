"""Arte provisional de la universidad, dibujado por código en pixel art.

Decisión del usuario (2026-10-24): sin créditos de IA, el arte provisional se dibuja aquí con
la cámara y la paleta de biblioteca/escenarios/ESTILO.md. Cuando lleguen las fotos se
reemplazan los PNG con el mismo nombre y el escenario.json no cambia.

Lo compartido (fondos, muebles, iconos, acabado y generar_lugar) vive en arte_comun.py; aquí
quedan solo las paletas de las SALAS, los MUEBLES y los ICONOS propios y los destinos de las puertas.

    python tools/escenarios/arte_universidad.py <escenario.json> [--factor N] [--salas a,b]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from arte_comun import *  # noqa: E402,F401,F403  (fondos, muebles, iconos, acabado y generar_lugar)



# A dónde lleva cada puerta: color de la hoja y dibujo de su placa (sin texto).
DESTINO_PUERTA = {
    'aula': ((112, 80, 58), 'pizarra'),
    'oficina-docente': ((88, 62, 48), 'maletin'),
    'sala-espera': ((72, 108, 112), 'corazon'),
    'bienestar': ((72, 108, 112), 'corazon'),
    'consultorio': ((96, 76, 98), 'corazon'),
    'biblioteca': ((132, 98, 62), 'libro'),
    'enfermeria': ((84, 120, 100), 'cruz'),
}


MADERA_PUERTA = dict(puerta=(112, 80, 58), marco=(62, 56, 52))

SALAS = {
    'entrada': dict(
        top=36, cielo=(118, 146, 170), cielo_claro=(160, 182, 196), pared=(146, 128, 110), canto=(170, 156, 136),
        ladrillo=((122, 82, 68), (112, 76, 62)), baja=(70, (104, 70, 58)), moldura=(176, 164, 144), zocalo=(70, 58, 52),
        piso='adoquin', pisoA=(124, 120, 112), pisoB=(112, 108, 102), pisoC=(132, 126, 116), junta=(88, 84, 80),
        marco=(58, 62, 70), vidrio=(84, 112, 132), vidrio_claro=(132, 160, 176), puerta_vidrio=True, tapete=(96, 70, 60),
        deco=[('ventana', 160, 60, 96, 40), ('ventana', 300, 60, 96, 40), ('ventana', 660, 60, 96, 40),
              ('ventana', 800, 60, 96, 40), ('placa', 480, 62)],
        luces=[]),
    'pasillo': dict(
        pared=(98, 114, 118), canto=(150, 160, 160), baja=(58, (72, 88, 96)), moldura=(132, 146, 150), zocalo=(42, 50, 56),
        piso='baldosa', pisoA=(128, 122, 112), pisoB=(118, 112, 104), junta=(94, 90, 84), vetas=True,
        tapete=(84, 92, 104), **MADERA_PUERTA,
        deco=[('reloj', 880, 130)],
        luces=[(260, 330), (700, 330)], luz=(224, 236, 255)),
    'aula': dict(
        pared=(98, 116, 100), lado=(80, 98, 84), canto=(150, 160, 146), baja=(50, (80, 96, 82)), moldura=(130, 144, 124),
        zocalo=(44, 52, 46), piso='baldosa', pisoA=(136, 124, 104), pisoB=(126, 114, 96), junta=(100, 92, 78),
        tapete=(84, 92, 104), **MADERA_PUERTA,
        deco=[('ventana', 210, 112, 120, 70), ('ventana', 750, 112, 120, 70), ('reloj', 650, 106)],
        luces=[(300, 380), (660, 380)]),
    'oficina-docente': dict(
        pared=(106, 86, 70), lado=(90, 72, 60), canto=(156, 136, 116), zocalo=(60, 44, 34),
        piso='madera', pisoA=(130, 90, 64), pisoB=(120, 82, 58), pisoC=(112, 76, 54), junta=(86, 58, 42),
        tapete=(96, 70, 60), **MADERA_PUERTA,
        deco=[('persiana', 640, 108, 130, 74), ('cuadro', 400, 118, 46, 36, ((214, 208, 190), (120, 150, 170), (190, 160, 110))),
              ('cuadro', 840, 126, 40, 30, ((208, 204, 186), (150, 120, 100), (110, 140, 120)))],
        luces=[(470, 360)]),
    'sala-espera': dict(
        pared=(80, 108, 114), lado=(64, 88, 94), canto=(140, 160, 160), franja=(176, (140, 172, 160)), zocalo=(36, 48, 52),
        piso='baldosa', pisoA=(132, 128, 120), pisoB=(122, 118, 110), junta=(98, 94, 88), tapete=(84, 92, 104), **MADERA_PUERTA,
        deco=[('ventana', 190, 104, 140, 64), ('cuadro', 520, 110, 90, 54, ((206, 200, 180), (110, 150, 140), (200, 150, 110))),
              ('reloj', 720, 120)],
        luces=[(330, 360), (620, 380)]),
    'bienestar': dict(
        pared=(104, 124, 106), lado=(86, 104, 90), canto=(156, 168, 150), franja=(196, (150, 178, 130)), zocalo=(44, 54, 46),
        piso='baldosa', pisoA=(136, 126, 110), pisoB=(126, 116, 102), junta=(102, 94, 82), tapete=(84, 92, 104), **MADERA_PUERTA,
        deco=[('ventana', 250, 104, 110, 64), ('cuadro', 420, 112, 60, 40, ((226, 222, 206), (110, 160, 120), (120, 140, 180)))],
        luces=[(420, 380), (700, 380)]),
    'consultorio': dict(
        pared=(102, 82, 96), lado=(86, 68, 80), canto=(156, 138, 148), zocalo=(60, 44, 54),
        piso='madera', pisoA=(134, 98, 72), pisoB=(124, 90, 66), pisoC=(116, 84, 62), junta=(90, 64, 48),
        tapete=(96, 70, 60), persiana=(204, 196, 178), **MADERA_PUERTA,
        deco=[('persiana', 330, 102, 140, 76), ('cuadro', 560, 118, 70, 46, ((214, 206, 188), (150, 120, 160), (120, 160, 140))),
              ('reloj', 800, 122)],
        luces=[(370, 360), (680, 330)], luz=(255, 226, 180)),
    'enfermeria': dict(
        pared=(84, 108, 104), lado=(70, 92, 88), canto=(150, 166, 162), baja=(70, (118, 136, 132)), azulejo=(102, 120, 116),
        moldura=(110, 128, 124), zocalo=(52, 64, 62), piso='baldosa', pisoA=(142, 148, 146), pisoB=(132, 138, 136),
        junta=(110, 116, 114), tapete=(84, 100, 104), **MADERA_PUERTA,
        deco=[('espejo', 420, 128, 34, 44), ('cruz', 560, 120), ('ventana', 740, 104, 110, 62)],
        luces=[(560, 370)], luz=(232, 244, 255)),
    'cafeteria': dict(
        pared=(140, 102, 78), lado=(118, 86, 66), canto=(180, 150, 124), baja=(54, (112, 80, 62)), moldura=(160, 120, 92),
        zocalo=(64, 44, 34), piso='damero', pisoA=(146, 136, 122), pisoB=(118, 110, 100), tapete=(96, 70, 60), **MADERA_PUERTA,
        deco=[('menu', 300, 100, 170, 70), ('ventana', 620, 104, 120, 62), ('ventana', 820, 104, 110, 62),
              ('colgante', 515, 150, (70, 110, 96)), ('colgante', 722, 140, (70, 110, 96))],
        luces=[(560, 380), (780, 350)], luz=(255, 226, 180)),
    'biblioteca': dict(
        pared=(106, 96, 82), lado=(88, 78, 66), canto=(150, 138, 120), baja=(80, (88, 62, 44)), paneles=(100, 72, 52),
        moldura=(120, 88, 64), zocalo=(54, 38, 28), piso='alfombra', pisoA=(76, 96, 82), pisoB=(66, 84, 72),
        tapete=(96, 70, 60), **MADERA_PUERTA,
        deco=[('ventana', 480, 98, 150, 60), ('ventana', 255, 98, 30, 40), ('ventana', 705, 98, 30, 40)],
        luces=[(480, 380)], luz=(255, 232, 190)),
}


MUEBLES = {
    'escritorio': escritorio, 'silla-oficina': silla_oficina, 'silla-visitante': silla_visitante,
    'sillon': sillon, 'sofa': sofa, 'mesa-centro': mesa_centro,
    'estante-libros': lambda: estante(62, 74, MADERA, 3), 'archivador': archivador, 'planta': planta,
    'mostrador': mostrador, 'sillas-espera': sillas_espera, 'pupitre': pupitre, 'tablero': tablero,
    'cartelera': cartelera, 'mesa-cafeteria': mesa_cafeteria, 'silla-cafeteria': silla_cafeteria,
    'barra-cafeteria': barra_cafeteria, 'camilla': camilla, 'vitrina-medicamentos': vitrina, 'biombo': biombo,
    'lavamanos': lavamanos, 'mesa-estudio': mesa_estudio,
    'estante-biblioteca': lambda: estante(96, 96, ((134, 92, 62), (100, 66, 44), (78, 52, 36), (56, 38, 26)), 4),
    'banca': banca, 'caneca': caneca, 'dispensador-agua': dispensador, 'porteria': porteria, 'tapete': tapete,
}


ICONOS = {
    'folleto-rutas': folleto, 'afiche-bienestar': afiche, 'planilla-turnos': planilla, 'vaso-agua': vaso,
    'celular': celular, 'mochila': mochila, 'ficha-riesgo': ficha_riesgo, 'directorio-rutas': directorio,
    'guia-primeros-auxilios': guia_pap, 'protocolo-bienestar': protocolo,
}


def generar(ruta_escenario, factor=2, salas=None):
    return generar_lugar(ruta_escenario, SALAS, MUEBLES, ICONOS, factor=factor, salas=salas, destinos=DESTINO_PUERTA)


if __name__ == '__main__':
    principal('arte_universidad.py', SALAS, MUEBLES, ICONOS, destinos=DESTINO_PUERTA)
