"""Hospital: cuarto lugar de la biblioteca, hecho solo con salas por piezas.

- 12 muebles nuevos (camilla, cama de recuperación, monitor, portasuero, silla de ruedas, cortina, mostrador
  de enfermería, carro de curaciones, sillas de espera, máquina de café, dispensador de agua y archivador
  clínico). El monitor, la cortina y la máquina de café tienen movimiento propio (4 cuadros).
- 8 salas descritas como `estructura`: todas dan al pasillo de 1680 px, que tiene una puerta por sala (cuatro
  en el fondo, una en cada muro lateral y una del lado de la cámara). La entrada de urgencias y la sala de
  espera se comunican además por la corrediza automática.

    SALAS                  las 8 salas (esquema 3)
    MUEBLES[ref]           ficha: nombre, función que dibuja, cuadros y fps
    mueble(ref)            lista de cuadros RGBA
    muebles_de(sala)       muebles y personajes de la sala, listos para `componer_sala(extras=…)` o la vista previa
    python tools/escenarios/piezas_hospital.py   # escribe maqueta-visual/piezas/hospital-*.png
"""
import functools
import os
import sys

from PIL import Image, ImageDraw, ImageOps

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import arte_comun as ac  # noqa: E402
import piezas_sala as sl  # noqa: E402

KIT = os.path.join(RAIZ, 'frontend', 'src', 'assets', 'characters', 'kit')
R, METAL, BLANCO, NEGRO, AZUL = ac.R, ac.METAL, ac.BLANCO, ac.NEGRO, ac.AZUL
SALUD = ((146, 176, 168), (114, 146, 142), (86, 114, 116), (62, 84, 90))
SABANA = ((238, 240, 236), (212, 218, 218), (174, 184, 188))
COLCHON = ((178, 198, 210), (148, 170, 186), (116, 138, 156))
TELA = ((176, 204, 196), (150, 182, 176), (122, 154, 152))
MAQUINA = ((98, 92, 100), (70, 66, 74), (50, 46, 54), (34, 32, 38))
VERDE, CIAN, ROJO = (110, 220, 140), (120, 200, 230), (214, 92, 80)
MANILA = (222, 206, 170)
FICHAS = ((176, 70, 64), (70, 104, 150), (80, 130, 96), (150, 110, 160), (206, 180, 116), (86, 150, 150))


def _t(c):
    return tuple(c) + (255,)


def _rueda(d, x, y, r=4):
    d.ellipse([x - r, y - r, x + r, y + r], fill=_t(NEGRO[2]))
    d.ellipse([x - r + 2, y - r + 2, x + r - 2, y + r - 2], fill=_t(METAL[1]))


# ── muebles ────────────────────────────────────────────────────────────────────

def camilla(n=0):
    im, d = ac.lienzo(98, 48)
    R(d, 1, 9, 3, 23, METAL[2]); R(d, 94, 15, 96, 23, METAL[2])                      # manijas
    R(d, 36, 5, 86, 6, METAL[0])                                                      # baranda
    for x in (36, 52, 69, 85):
        R(d, x, 5, x + 1, 13, METAL[1])
    R(d, 5, 13, 92, 20, COLCHON[0]); R(d, 5, 19, 92, 22, COLCHON[1]); R(d, 5, 22, 92, 23, COLCHON[2])
    R(d, 32, 12, 90, 18, SABANA[0]); R(d, 32, 17, 90, 18, SABANA[1]); R(d, 32, 12, 34, 18, SABANA[1])
    d.rounded_rectangle([7, 7, 29, 15], 3, fill=_t(SABANA[0]))
    R(d, 9, 13, 27, 14, SABANA[1])
    R(d, 3, 23, 94, 26, METAL[1]); R(d, 3, 23, 94, 23, METAL[0]); R(d, 3, 26, 94, 26, METAL[3])
    for a, b in ((14, 40), (58, 84)):
        d.line([(a, 27), (b, 39)], fill=_t(METAL[2]), width=2)
        d.line([(b, 27), (a, 39)], fill=_t(METAL[1]), width=2)
    R(d, 11, 39, 87, 40, METAL[2])
    for x in (11, 35, 61, 87):
        _rueda(d, x, 43)
    return im


def cama_recuperacion(n=0):
    im, d = ac.lienzo(110, 62)
    R(d, 2, 6, 9, 46, BLANCO[1]); R(d, 2, 6, 9, 8, BLANCO[0]); R(d, 3, 14, 8, 19, SALUD[1]); R(d, 8, 6, 9, 46, BLANCO[2])      # cabecero
    R(d, 100, 22, 107, 46, BLANCO[1]); R(d, 100, 22, 107, 24, BLANCO[0]); R(d, 100, 22, 101, 46, BLANCO[2])                    # piecero
    R(d, 10, 27, 99, 36, SABANA[0]); R(d, 10, 36, 99, 40, COLCHON[1]); R(d, 10, 40, 99, 41, COLCHON[2])
    d.polygon([(10, 28), (38, 13), (45, 17), (45, 28)], fill=_t(COLCHON[0]))                                                    # respaldo levantado
    d.polygon([(10, 28), (38, 13), (40, 14), (12, 29)], fill=_t(SABANA[0]))
    d.polygon([(15, 22), (33, 12), (39, 15), (21, 26)], fill=_t(SABANA[0]))                                                     # almohada
    d.polygon([(17, 23), (33, 14), (35, 15), (19, 24)], fill=_t(SABANA[1]))
    R(d, 46, 25, 98, 36, SALUD[1]); R(d, 46, 25, 98, 27, SALUD[0]); R(d, 46, 35, 98, 36, SALUD[2])                             # cobija
    R(d, 46, 22, 62, 26, SABANA[0]); R(d, 46, 26, 62, 26, SABANA[1])
    for x in (70, 84):
        R(d, x, 28, x, 35, SALUD[2])
    R(d, 52, 16, 94, 17, METAL[0])                                                                                             # baranda
    for x in (52, 66, 80, 93):
        R(d, x, 16, x + 1, 25, METAL[1])
    R(d, 4, 41, 105, 45, METAL[1]); R(d, 4, 41, 105, 41, METAL[0]); R(d, 4, 45, 105, 45, METAL[3])
    R(d, 20, 44, 30, 51, BLANCO[1]); R(d, 22, 46, 24, 47, VERDE); R(d, 26, 46, 28, 47, METAL[2])                               # mando
    R(d, 12, 50, 98, 51, METAL[2])
    for x in (8, 100):
        R(d, x, 46, x + 2, 54, METAL[2])
        _rueda(d, x + 1, 57)
    return im


def monitor(n=0):
    im, d = ac.lienzo(32, 66)
    R(d, 1, 1, 30, 25, MAQUINA[0]); R(d, 1, 1, 30, 2, (132, 126, 134)); R(d, 1, 24, 30, 25, MAQUINA[2])
    R(d, 3, 4, 28, 19, (14, 26, 30))
    base, pico = 10, 5 + (n * 5) % 16                                                 # el latido recorre la pantalla
    for x in range(4, 21):
        dy = {0: -4, 1: 3, 2: -1}.get(x - pico, 0)
        R(d, x, base + dy, x, base + dy, VERDE)
        if x - pico == 0:
            R(d, x, base - 4, x, base, VERDE)
    for x in range(4, 21):
        R(d, x, 15 + ((x + n) // 3) % 2, x, 15 + ((x + n) // 3) % 2, CIAN)
    R(d, 23, 6, 27, 9, VERDE); R(d, 23, 12, 27, 14, CIAN); R(d, 23, 16, 27, 17, ROJO if n % 2 == 0 else (90, 40, 40))
    R(d, 4, 21, 6, 22, ROJO if n % 2 == 0 else (90, 40, 40)); R(d, 9, 21, 12, 22, METAL[1]); R(d, 14, 21, 17, 22, METAL[1])
    R(d, 15, 26, 17, 54, METAL[1]); R(d, 15, 26, 15, 54, METAL[0])
    R(d, 9, 35, 23, 41, METAL[2]); R(d, 9, 35, 23, 35, METAL[0]); R(d, 11, 37, 21, 39, BLANCO[1])
    R(d, 5, 54, 27, 57, METAL[2]); R(d, 5, 54, 27, 54, METAL[0])
    _rueda(d, 7, 60, 3); _rueda(d, 25, 60, 3)
    return im


def portasuero(n=0):
    im, d = ac.lienzo(26, 74)
    R(d, 12, 8, 13, 66, METAL[1]); R(d, 12, 8, 12, 66, METAL[0])
    R(d, 5, 6, 20, 7, METAL[1]); R(d, 5, 6, 5, 9, METAL[1]); R(d, 20, 6, 20, 9, METAL[1])
    R(d, 2, 10, 9, 25, (210, 226, 234)); R(d, 3, 16, 8, 24, (150, 196, 220)); R(d, 4, 12, 7, 13, SABANA[0]); R(d, 2, 10, 9, 10, SABANA[0])
    R(d, 5, 26, 6, 30, (210, 226, 234))
    d.line([(5, 31), (5, 40), (8, 46), (8, 54)], fill=_t((176, 198, 210)))
    R(d, 9, 34, 17, 43, BLANCO[1]); R(d, 9, 34, 17, 35, BLANCO[0]); R(d, 11, 37, 12, 38, VERDE); R(d, 14, 37, 15, 38, METAL[2])
    R(d, 3, 66, 22, 68, METAL[2]); R(d, 3, 66, 22, 66, METAL[0])
    _rueda(d, 4, 70, 3); _rueda(d, 21, 70, 3); _rueda(d, 12, 71, 2)
    return im


def silla_ruedas(n=0):
    im, d = ac.lienzo(42, 48)
    R(d, 5, 5, 10, 6, NEGRO[2]); R(d, 9, 6, 12, 25, AZUL[2]); R(d, 9, 6, 12, 7, AZUL[0])
    R(d, 11, 23, 31, 26, AZUL[1]); R(d, 11, 23, 31, 23, AZUL[0])
    R(d, 12, 15, 27, 16, NEGRO[1]); R(d, 26, 16, 27, 23, METAL[2])
    R(d, 11, 27, 31, 28, METAL[1])
    d.line([(31, 25), (35, 39)], fill=_t(METAL[1]), width=2)
    R(d, 33, 39, 39, 40, METAL[2])
    d.ellipse([2, 18, 28, 44], outline=_t(NEGRO[2]), width=2)
    d.ellipse([5, 21, 25, 41], outline=_t(METAL[1]), width=1)
    for x1, y1 in ((15, 19), (27, 31), (15, 43), (3, 31), (24, 22), (6, 22), (24, 40), (6, 40)):
        d.line([(15, 31), (x1, y1)], fill=_t(METAL[2]))
    d.ellipse([12, 28, 18, 34], fill=_t(METAL[1]))
    _rueda(d, 34, 42, 4)
    return im


def cortina(n=0):
    im, d = ac.lienzo(90, 98)
    R(d, 1, 2, 88, 4, METAL[1]); R(d, 1, 2, 88, 2, METAL[0])
    for x in (2, 86):
        R(d, x, 4, x + 1, 93, METAL[2])
        R(d, x - 1, 93, x + 4, 95, METAL[3])
    for i, x in enumerate(range(5, 85, 5)):                                           # pliegues: se mecen de un cuadro al otro
        fase = (i + (n if i % 2 else (n + 2))) % 4
        tono = (TELA[0], TELA[1], TELA[2], TELA[1])[fase]
        largo = 86 + (1 if fase in (0, 1) else 0)
        R(d, x, 6, x + 4, largo, tono)
        R(d, x, 6, x, largo, TELA[2] if fase != 2 else TELA[1])
        R(d, x + 2, 4, x + 2, 5, METAL[2])
    R(d, 5, 30, 84, 31, (112, 146, 150))
    return im


def mostrador_enfermeria(n=0):
    im, d = ac.lienzo(186, 64)
    R(d, 142, 1, 168, 17, MAQUINA[1]); R(d, 144, 3, 166, 14, (104, 150, 170)); R(d, 146, 5, 158, 6, (190, 220, 230)); R(d, 153, 17, 157, 20, MAQUINA[2])
    R(d, 28, 3, 44, 9, SABANA[0]); R(d, 30, 5, 42, 5, METAL[2]); R(d, 30, 7, 39, 7, METAL[2])           # historias
    R(d, 60, 2, 72, 9, (150, 110, 80)); R(d, 62, 4, 70, 9, SABANA[0]); R(d, 64, 2, 68, 3, METAL[1])     # tabla con pinza
    R(d, 98, 5, 110, 9, MAQUINA[2]); R(d, 100, 4, 104, 5, MAQUINA[1])                                    # teléfono
    R(d, 2, 9, 132, 14, (212, 196, 168)); R(d, 2, 9, 132, 10, (232, 220, 196)); R(d, 2, 14, 132, 15, (160, 144, 120))
    R(d, 132, 20, 183, 24, (212, 196, 168)); R(d, 132, 20, 183, 21, (232, 220, 196))
    R(d, 2, 15, 183, 59, BLANCO[0]); R(d, 132, 15, 183, 19, BLANCO[0])
    R(d, 132, 24, 183, 25, BLANCO[2])
    R(d, 2, 32, 183, 38, SALUD[1]); R(d, 2, 32, 183, 33, SALUD[0]); R(d, 2, 38, 183, 38, SALUD[2])
    for x in (47, 93, 139):
        R(d, x, 16, x, 55, BLANCO[2])
    R(d, 16, 18, 32, 30, SABANA[0]); R(d, 22, 20, 26, 28, (70, 150, 96)); R(d, 18, 22, 30, 26, (70, 150, 96))
    R(d, 2, 55, 183, 59, (120, 128, 134)); R(d, 2, 55, 183, 55, (150, 158, 162))
    return im


def carro_curaciones(n=0):
    im, d = ac.lienzo(48, 56)
    R(d, 9, 1, 13, 9, SABANA[0]); R(d, 9, 1, 13, 2, (80, 120, 190))
    R(d, 16, 3, 20, 9, (150, 110, 90)); R(d, 16, 3, 20, 4, SABANA[0])
    R(d, 25, 4, 37, 9, SABANA[0]); R(d, 30, 5, 32, 8, (70, 150, 96)); R(d, 29, 6, 33, 7, (70, 150, 96))
    R(d, 4, 6, 4, 9, METAL[1]); R(d, 43, 6, 43, 9, METAL[1]); R(d, 4, 6, 43, 6, METAL[0])
    R(d, 3, 9, 44, 12, METAL[0]); R(d, 3, 12, 44, 12, METAL[2])
    R(d, 5, 13, 42, 45, BLANCO[1])
    for k, tinta in enumerate(((86, 150, 150), (80, 120, 190), ROJO)):
        R(d, 7, 15 + k * 10, 40, 23 + k * 10, BLANCO[0]); R(d, 7, 23 + k * 10, 40, 23 + k * 10, BLANCO[2])
        R(d, 19, 18 + k * 10, 28, 19 + k * 10, tinta)
    R(d, 44, 18, 46, 34, (196, 84, 76)); R(d, 44, 18, 46, 19, (226, 120, 108))
    for x in (6, 39):
        R(d, x, 45, x + 2, 50, METAL[2])
        _rueda(d, x + 1, 52, 3)
    return im


def sillas_espera(n=0):
    im, d = ac.lienzo(90, 44)
    for k in range(3):
        x0 = 5 + k * 27
        d.rounded_rectangle([x0, 2, x0 + 22, 21], 4, fill=_t(SALUD[1]))
        R(d, x0 + 3, 4, x0 + 19, 6, SALUD[0]); R(d, x0 + 3, 18, x0 + 19, 19, SALUD[2])
        R(d, x0 + 9, 21, x0 + 13, 22, METAL[2])
        R(d, x0 - 1, 23, x0 + 23, 28, SALUD[0]); R(d, x0 - 1, 28, x0 + 23, 30, SALUD[2])
    R(d, 2, 31, 87, 33, METAL[2]); R(d, 2, 31, 87, 31, METAL[0])
    R(d, 1, 16, 3, 30, METAL[1]); R(d, 86, 16, 88, 30, METAL[1])
    for x in (9, 78):
        R(d, x, 33, x + 2, 40, METAL[2])
        R(d, x - 4, 40, x + 6, 41, METAL[3])
    return im


def maquina_cafe(n=0):
    im, d = ac.lienzo(44, 80)
    R(d, 1, 1, 42, 75, MAQUINA[1]); R(d, 1, 1, 42, 2, MAQUINA[0]); R(d, 1, 1, 2, 75, MAQUINA[0]); R(d, 41, 1, 42, 75, MAQUINA[2])
    R(d, 4, 5, 28, 31, (112, 80, 62)); R(d, 4, 5, 28, 6, (146, 108, 84))               # cartel de la taza
    R(d, 11, 16, 21, 26, SABANA[0]); R(d, 21, 18, 23, 22, SABANA[0]); R(d, 12, 17, 20, 18, (150, 104, 76)); R(d, 9, 27, 23, 27, SABANA[1])
    for k, x in enumerate((13, 16, 19)):                                              # vapor que sube
        y = 13 - (n + k) % 4
        R(d, x, y, x, y + 1, (226, 214, 202))
    for k in range(5):
        R(d, 32, 6 + k * 5, 38, 8 + k * 5, VERDE if k == n else (176, 182, 188))
    R(d, 31, 33, 39, 37, (24, 52, 44)); R(d, 33, 35, 33 + n, 35, VERDE)
    R(d, 34, 41, 36, 47, METAL[1]); R(d, 35, 42, 35, 46, MAQUINA[3])
    R(d, 7, 40, 27, 59, MAQUINA[3]); R(d, 7, 58, 27, 59, MAQUINA[2])
    R(d, 14, 51, 20, 58, SABANA[0]); R(d, 14, 51, 20, 51, SABANA[1])
    if n in (1, 2):
        R(d, 17, 41, 17, 51, (150, 108, 80))
    R(d, 4, 63, 39, 71, MAQUINA[2]); R(d, 4, 63, 39, 63, MAQUINA[0]); R(d, 18, 66, 25, 67, MAQUINA[3])
    R(d, 3, 76, 7, 78, MAQUINA[3]); R(d, 36, 76, 40, 78, MAQUINA[3])
    return im


def dispensador_agua(n=0):
    im, d = ac.lienzo(28, 64)
    d.rounded_rectangle([6, 1, 21, 23], 4, fill=_t((150, 196, 226)))
    R(d, 6, 11, 21, 23, (118, 170, 208)); R(d, 8, 4, 10, 19, (208, 232, 244)); R(d, 6, 11, 21, 11, (176, 214, 236))
    R(d, 10, 23, 17, 26, (118, 170, 208))
    R(d, 3, 26, 24, 59, BLANCO[1]); R(d, 3, 26, 24, 28, BLANCO[0]); R(d, 23, 26, 24, 59, BLANCO[2])
    R(d, 8, 32, 11, 35, (80, 120, 190)); R(d, 16, 32, 19, 35, ROJO)
    R(d, 6, 37, 21, 45, BLANCO[3]); R(d, 6, 45, 21, 46, METAL[1])
    R(d, 3, 48, 24, 48, BLANCO[2])
    R(d, 4, 59, 7, 61, METAL[3]); R(d, 20, 59, 23, 61, METAL[3])
    return im


def archivador_clinico(n=0):
    im, d = ac.lienzo(52, 74)
    R(d, 1, 1, 50, 71, BLANCO[1]); R(d, 1, 1, 50, 3, BLANCO[0]); R(d, 49, 1, 50, 71, BLANCO[2])
    for y0 in (5, 25):
        R(d, 4, y0, 47, y0 + 17, BLANCO[3])
        for i, x in enumerate(range(5, 46, 3)):
            alto = 12 + (i * 5 + y0) % 4
            R(d, x, y0 + 17 - alto, x + 1, y0 + 17, MANILA)
            R(d, x, y0 + 17 - alto, x + 1, y0 + 19 - alto, FICHAS[(i * 3 + y0) % len(FICHAS)])
        R(d, 4, y0 + 17, 47, y0 + 18, BLANCO[2])
    for y0 in (46, 59):
        R(d, 4, y0, 47, y0 + 10, BLANCO[0]); R(d, 4, y0 + 10, 47, y0 + 10, BLANCO[2])
        R(d, 20, y0 + 6, 31, y0 + 7, METAL[2]); R(d, 19, y0 + 2, 32, y0 + 4, SABANA[0])
    return im


def _de_arte_comun(funcion, *args, **kwargs):
    return lambda n=0: funcion(*args, **kwargs)


MUEBLES = {
    'camilla': dict(nombre='Camilla', dibujar=camilla),
    'cama-recuperacion': dict(nombre='Cama de recuperación', dibujar=cama_recuperacion),
    'monitor': dict(nombre='Monitor de signos', dibujar=monitor, cuadros=4, fps=4),
    'portasuero': dict(nombre='Portasuero', dibujar=portasuero),
    'silla-ruedas': dict(nombre='Silla de ruedas', dibujar=silla_ruedas),
    'cortina': dict(nombre='Cortina', dibujar=cortina, cuadros=4, fps=2),
    'mostrador-enfermeria': dict(nombre='Mostrador de enfermería', dibujar=mostrador_enfermeria),
    'carro-curaciones': dict(nombre='Carro de curaciones', dibujar=carro_curaciones),
    'sillas-espera': dict(nombre='Sillas de espera', dibujar=sillas_espera),
    'maquina-cafe': dict(nombre='Máquina de café', dibujar=maquina_cafe, cuadros=4, fps=3),
    'dispensador-agua': dict(nombre='Dispensador de agua', dibujar=dispensador_agua),
    'archivador-clinico': dict(nombre='Archivador clínico', dibujar=archivador_clinico),
    # Muebles que ya existían en arte_comun.py y el hospital reutiliza.
    'escritorio': dict(nombre='Escritorio', dibujar=_de_arte_comun(ac.escritorio), existente=True),
    'silla-oficina': dict(nombre='Silla de oficina', dibujar=_de_arte_comun(ac.silla_oficina), existente=True),
    'silla-visitante': dict(nombre='Silla de visitante', dibujar=_de_arte_comun(ac.silla_visitante), existente=True),
    'sillon': dict(nombre='Sillón', dibujar=_de_arte_comun(ac.sillon), existente=True),
    'mesa-centro': dict(nombre='Mesa de centro', dibujar=_de_arte_comun(ac.mesa_centro), existente=True),
    'estante': dict(nombre='Estante', dibujar=_de_arte_comun(ac.estante, 62, 74), existente=True),
    'planta': dict(nombre='Planta', dibujar=_de_arte_comun(ac.planta), existente=True),
    'lavamanos': dict(nombre='Lavamanos', dibujar=_de_arte_comun(ac.lavamanos), existente=True),
    'caneca': dict(nombre='Caneca', dibujar=_de_arte_comun(ac.caneca), existente=True),
}
NUEVOS = [ref for ref, ficha in MUEBLES.items() if not ficha.get('existente')]


@functools.lru_cache(maxsize=None)
def _mueble(ref):
    if ref not in MUEBLES:
        raise KeyError(f'mueble {ref!r} fuera del catálogo del hospital')
    ficha = MUEBLES[ref]
    cuadros = [ac.terminar_sprite(ficha['dibujar'](n), 24) for n in range(ficha.get('cuadros', 1))]
    return tuple(sl.g.recortar_juntos(cuadros, (0, 0))[0])          # sin filas vacías: la base del sprite es su pie


def mueble(ref):
    return list(_mueble(ref))


# ── salas ──────────────────────────────────────────────────────────────────────

def P(id, tipo, muro, pos, modelo=None, **mas):
    return dict(id=id, tipo=tipo, modelo=modelo or tipo, muro=muro, pos=pos, **mas)


def PU(id, hacia, par, muro, pos, modelo, etiqueta):
    return dict(id=id, hacia=hacia, par=par, muro=muro, pos=pos, modelo=modelo, etiqueta=etiqueta)


def M(ref, x, y, espejo=False):
    return dict(ref=ref, x=x, y=y, espejo=espejo)


def N(ref, x, y, mirando='abajo'):
    return dict(ref=ref, x=x, y=y, mirando=mirando)


def _sala(id, nombre, ancho, piso, variante, muro, piezas, puertas, muebles, personajes=(), entrada=None, tapetes=(), descripcion=''):
    estructura = dict(ancho=ancho, momento='noche', acabados=dict(piso=piso, variante=variante, muro=muro, paleta='hospital'), piezas=piezas)
    if tapetes:
        estructura['tapetes'] = list(tapetes)
    return dict(id=id, nombre=nombre, descripcion=descripcion, encuadre='tres-paredes', entrada=entrada, estructura=estructura,
                puertas=puertas, muebles=muebles, personajes=list(personajes))


PASILLO = _sala(
    'pasillo', 'Pasillo', 1680, 'vinilo', 'a', 'zocalo-alto',
    descripcion='Pasillo de urgencias: todas las salas del hospital dan a él.',
    piezas=[
        P('tubo-1', 'lampara', 'fondo', 325, 'tubo'), P('tubo-2', 'lampara', 'fondo', 615, 'tubo'),
        P('tubo-3', 'lampara', 'fondo', 905, 'tubo'), P('tubo-4', 'lampara', 'fondo', 1170, 'tubo'),
        P('gel-1', 'gel', 'fondo', 250), P('cartelera', 'cartelera', 'fondo', 325), P('reloj', 'reloj', 'fondo', 560),
        P('senal', 'senal', 'fondo', 660), P('extintor', 'extintor', 'fondo', 880), P('cuadro', 'cuadro', 'fondo', 940),
        P('gel-2', 'gel', 'fondo', 1130), P('ventana', 'ventana', 'fondo', 1294, 'alta'),
        P('cruz', 'cruz', 'izquierda', 60), P('senal-lado', 'senal', 'derecha', 60),
    ],
    puertas=[
        PU('a-triaje', 'triaje', 'a-pasillo', 'fondo', 180, 'vidrio', 'Pasar a triaje'),
        PU('a-escucha', 'sala-escucha', 'a-pasillo', 'fondo', 470, 'madera', 'Pasar a la sala de escucha'),
        PU('a-trabajo-social', 'trabajo-social', 'a-pasillo', 'fondo', 760, 'metalica', 'Pasar a trabajo social'),
        PU('a-habitacion', 'habitacion-recuperacion', 'a-pasillo', 'fondo', 1050, 'madera-ventanilla', 'Pasar a la habitación de recuperación'),
        PU('a-enfermeria', 'estacion-enfermeria', 'a-pasillo', 'izquierda', 160, 'paso', 'Pasar a la estación de enfermería'),
        PU('a-entrada', 'entrada-urgencias', 'a-pasillo', 'derecha', 160, 'urgencias', 'Salir a la entrada de urgencias'),
        PU('a-espera', 'sala-espera', 'a-pasillo', 'camara', 687, 'vidrio', 'Volver a la sala de espera'),
    ],
    muebles=[M('sillas-espera', 478, 260), M('dispensador-agua', 772, 260), M('planta', 1060, 262), M('camilla', 1404, 300),
             M('portasuero', 1330, 292), M('silla-ruedas', 330, 424), M('carro-curaciones', 1290, 440)],
    personajes=[N('enfermera-urgencias', 900, 336), N('medico-guardia', 560, 350, 'derecha')],
    entrada=(840, 420))

ENTRADA = _sala(
    'entrada-urgencias', 'Entrada de urgencias', 1200, 'baldosa', 'b', 'azulejo',
    descripcion='Vestíbulo de urgencias: por la corrediza se llega a la sala de espera; las camillas pasan por la doble batiente.',
    piezas=[
        P('tubo-1', 'lampara', 'fondo', 250, 'tubo'), P('tubo-2', 'lampara', 'fondo', 690, 'tubo'),
        P('cruz', 'cruz', 'fondo', 326), P('reloj', 'reloj', 'fondo', 378), P('gel', 'gel', 'fondo', 600), P('senal', 'senal', 'fondo', 640),
        P('extintor', 'extintor', 'fondo', 700), P('ventana', 'ventana', 'fondo', 808, 'alta'),
        P('ventanal', 'ventana', 'derecha', 150, 'ventanal'),
    ],
    puertas=[
        PU('a-espera', 'sala-espera', 'a-entrada', 'fondo', 485, 'corrediza', 'Pasar a la sala de espera'),
        PU('a-pasillo', 'pasillo', 'a-entrada', 'izquierda', 160, 'urgencias', 'Pasar al pasillo'),
    ],
    muebles=[M('camilla', 300, 300), M('silla-ruedas', 900, 296), M('silla-ruedas', 944, 304), M('planta', 1040, 262),
             M('caneca', 760, 262), M('portasuero', 236, 290)],
    personajes=[N('seguridad', 700, 300), N('madre-acompanante', 860, 420, 'izquierda')],
    entrada=(600, 440))

ESPERA = _sala(
    'sala-espera', 'Sala de espera', 1440, 'vinilo', 'b', 'zocalo-alto',
    descripcion='Sala de espera de urgencias, con máquina de café y dispensador de agua.',
    piezas=[
        P('tubo-1', 'lampara', 'fondo', 440, 'tubo'), P('tubo-2', 'lampara', 'fondo', 720, 'tubo'), P('tubo-3', 'lampara', 'fondo', 1084, 'tubo'),
        P('ventanal-1', 'ventana', 'fondo', 260, 'ventanal'), P('cartelera', 'cartelera', 'fondo', 430), P('reloj', 'reloj', 'fondo', 506),
        P('gel', 'gel', 'fondo', 650), P('cuadro', 'cuadro', 'fondo', 710), P('ventanal-2', 'ventana', 'fondo', 890, 'ventanal'),
        P('senal', 'senal', 'fondo', 1040), P('extintor', 'extintor', 'fondo', 1136),
    ],
    puertas=[
        PU('a-pasillo', 'pasillo', 'a-espera', 'fondo', 586, 'vidrio', 'Pasar al pasillo'),
        PU('a-entrada', 'entrada-urgencias', 'a-espera', 'camara', 586, 'corrediza', 'Salir a la entrada de urgencias'),
    ],
    muebles=[M('planta', 250, 262), M('sillas-espera', 350, 260), M('sillas-espera', 444, 260), M('sillas-espera', 980, 260),
             M('sillas-espera', 1074, 260), M('maquina-cafe', 1196, 258), M('dispensador-agua', 1240, 260), M('caneca', 1280, 262),
             M('sillas-espera', 520, 410), M('mesa-centro', 720, 400), M('sillas-espera', 920, 410)],
    personajes=[N('abuela-familia', 640, 330), N('paciente-espera', 1030, 300), N('madre-acompanante', 480, 318, 'derecha')],
    entrada=(720, 440))

TRIAJE = _sala(
    'triaje', 'Triaje', 960, 'vinilo', 'a', 'azulejo',
    descripcion='Consultorio de triaje: camilla, monitor y escritorio de la enfermera.',
    piezas=[
        P('tubo', 'lampara', 'fondo', 384, 'tubo'), P('cruz', 'cruz', 'fondo', 120), P('cartelera', 'cartelera', 'fondo', 240),
        P('reloj', 'reloj', 'fondo', 400), P('ventana', 'ventana', 'fondo', 560, 'alta'), P('gel', 'gel', 'fondo', 700),
    ],
    puertas=[PU('a-pasillo', 'pasillo', 'a-triaje', 'camara', 384, 'vidrio', 'Volver al pasillo')],
    muebles=[M('lavamanos', 150, 262), M('escritorio', 300, 304), M('silla-oficina', 300, 276), M('silla-visitante', 400, 330),
             M('archivador-clinico', 470, 262), M('cortina', 548, 306), M('camilla', 660, 300), M('monitor', 740, 286),
             M('portasuero', 600, 290), M('carro-curaciones', 820, 304)],
    personajes=[N('enfermera-urgencias', 340, 380, 'derecha')],
    entrada=(480, 430))

ENFERMERIA = _sala(
    'estacion-enfermeria', 'Estación de enfermería', 1200, 'vinilo', 'a', 'paneles',
    descripcion='Estación de enfermería: mostrador, historias clínicas y tablero de turnos.',
    piezas=[
        P('tubo-1', 'lampara', 'fondo', 300, 'tubo'), P('tubo-2', 'lampara', 'fondo', 760, 'tubo'),
        P('tablero', 'tablero', 'fondo', 300), P('reloj', 'reloj', 'fondo', 420), P('cruz', 'cruz', 'fondo', 480),
        P('ventana', 'ventana', 'fondo', 620, 'alta'), P('cartelera', 'cartelera', 'fondo', 800), P('gel', 'gel', 'fondo', 900),
    ],
    puertas=[PU('a-pasillo', 'pasillo', 'a-enfermeria', 'derecha', 160, 'paso', 'Volver al pasillo')],
    muebles=[M('archivador-clinico', 200, 264), M('archivador-clinico', 256, 264), M('planta', 330, 262), M('mostrador-enfermeria', 560, 372),
             M('silla-oficina', 520, 336), M('carro-curaciones', 860, 296), M('monitor', 780, 284), M('dispensador-agua', 990, 262),
             M('silla-ruedas', 240, 420)],
    personajes=[N('enfermera-urgencias', 600, 338), N('medico-guardia', 800, 410, 'izquierda')],
    entrada=(700, 440))

ESCUCHA = _sala(
    'sala-escucha', 'Sala de escucha', 960, 'madera', 'a', 'pintura',
    descripcion='Sala de escucha: un lugar tranquilo para hablar, con luz cálida.',
    piezas=[
        P('reloj', 'reloj', 'fondo', 110), P('cuadro-1', 'cuadro', 'fondo', 200), P('ventana', 'ventana', 'fondo', 384, 'corrediza'),
        P('repisa', 'repisa', 'fondo', 620),
        dict(id='lampara-pie', tipo='lampara', modelo='pie', x=250, y=312),
        dict(id='lampara-mesa', tipo='lampara', modelo='mesa', x=716, y=324, sobre=18),
    ],
    puertas=[PU('a-pasillo', 'pasillo', 'a-escucha', 'camara', 384, 'madera', 'Volver al pasillo')],
    muebles=[M('estante', 160, 262), M('sillon', 400, 336), M('sillon', 560, 336, True), M('mesa-centro', 480, 384),
             M('mesa-centro', 716, 322), M('planta', 810, 264), M('silla-visitante', 640, 400)],
    tapetes=[dict(caja=[300, 660, 300, 424])],
    entrada=(480, 440))

TRABAJO_SOCIAL = _sala(
    'trabajo-social', 'Oficina de trabajo social', 960, 'vinilo', 'b', 'paneles',
    descripcion='Oficina de trabajo social: escritorio, archivo y sillas para la familia.',
    piezas=[
        P('tubo', 'lampara', 'fondo', 384, 'tubo'), P('cartelera', 'cartelera', 'fondo', 200), P('reloj', 'reloj', 'fondo', 300),
        P('ventana', 'ventana', 'fondo', 560, 'persiana'), P('cuadro', 'cuadro', 'fondo', 690),
        dict(id='lampara-mesa', tipo='lampara', modelo='mesa', x=436, y=312, sobre=42),
    ],
    puertas=[PU('a-pasillo', 'pasillo', 'a-trabajo-social', 'camara', 384, 'metalica', 'Volver al pasillo')],
    muebles=[M('archivador-clinico', 150, 264), M('estante', 800, 262), M('silla-oficina', 480, 282), M('escritorio', 480, 312),
             M('silla-visitante', 440, 366), M('silla-visitante', 524, 366), M('planta', 300, 264), M('dispensador-agua', 720, 262)],
    personajes=[N('trabajadora-social', 480, 290)],
    entrada=(480, 440))

HABITACION = _sala(
    'habitacion-recuperacion', 'Habitación de recuperación', 1200, 'vinilo', 'b', 'zocalo-alto',
    descripcion='Habitación de recuperación con dos camas separadas por una cortina.',
    piezas=[
        P('tubo-1', 'lampara', 'fondo', 300, 'tubo'), P('tubo-2', 'lampara', 'fondo', 874, 'tubo'),
        P('gel', 'gel', 'fondo', 120), P('reloj', 'reloj', 'fondo', 470), P('cuadro', 'cuadro', 'fondo', 540),
        P('ventana', 'ventana', 'fondo', 700, 'corrediza'), P('espejo', 'espejo', 'fondo', 880),
    ],
    puertas=[PU('a-pasillo', 'pasillo', 'a-habitacion', 'camara', 485, 'madera-ventanilla', 'Volver al pasillo')],
    muebles=[M('lavamanos', 190, 262), M('portasuero', 270, 300), M('cama-recuperacion', 350, 324), M('monitor', 440, 290),
             M('cortina', 560, 344), M('cama-recuperacion', 740, 324), M('portasuero', 826, 298), M('sillon', 960, 330, True),
             M('mesa-centro', 1040, 300)],
    personajes=[N('medico-guardia', 480, 400, 'izquierda')],
    entrada=(600, 440))

SALAS = [ENTRADA, ESPERA, PASILLO, TRIAJE, ENFERMERIA, ESCUCHA, TRABAJO_SOCIAL, HABITACION]
LUGAR = dict(esquema=3, id='hospital', nombre='Hospital', descripcion='Urgencias de un hospital: de la entrada a la habitación de recuperación.',
             salas=SALAS)
FILA = {'abajo': 0, 'izquierda': 1, 'derecha': 2, 'arriba': 3}


def _personaje(ref, mirando):
    hoja = Image.open(os.path.join(KIT, ref, 'idle.png')).convert('RGBA')
    fila = FILA[mirando]
    return [hoja.crop((n * 48, fila * 72, n * 48 + 48, fila * 72 + 72)) for n in range(4)]


def muebles_de(sala):
    """Muebles y personajes de la sala: dict(im, cuadros, fps, x, y) con (x, y) = centro de la base."""
    lista = []
    for m in sala.get('muebles', []):
        cuadros = mueble(m['ref'])
        if m.get('espejo'):
            cuadros = [ImageOps.mirror(c) for c in cuadros]
        lista.append(dict(im=cuadros[0], cuadros=cuadros, fps=MUEBLES[m['ref']].get('fps', 0), x=m['x'], y=m['y'], ref=m['ref']))
    for p in sala.get('personajes', []):
        ruta = os.path.join(KIT, p['ref'], 'idle.png')
        if os.path.exists(ruta):
            cuadros = _personaje(p['ref'], p.get('mirando', 'abajo'))
            lista.append(dict(im=cuadros[0], cuadros=cuadros, fps=4, x=p['x'], y=p['y'] + 4, ref=p['ref'], persona=True))
    return lista


def componer(sala, momento='noche', abiertas=()):
    extras = [dict(im=m['im'], x=m['x'] - m['im'].width // 2, y=m['y'] - m['im'].height, z=m['y'], sombra=not m.get('persona'),
                   pie=(m['x'], m['y']) if m.get('persona') else None) for m in muebles_de(sala)]
    return sl.componer_sala(sala, momento, abiertas, extras=extras)


def hoja_de_muebles(factor=3):
    """Los 12 muebles nuevos (los animados, con sus 4 cuadros) sobre un piso de muestra."""
    celdas = []
    for ref in NUEVOS:
        for c in mueble(ref):
            celdas.append(c)
    ancho = sum(c.width + 10 for c in celdas) + 10
    lienzo = Image.new('RGBA', (ancho // 2 + 60, 2 * 112), (142, 160, 160, 255))
    x, y = 10, 104
    for c in celdas:
        if x + c.width + 10 > lienzo.width:
            x, y = 10, y + 112
        ImageDraw.Draw(lienzo).ellipse([x - 2, y - 8, x + c.width + 2, y + 4], fill=(110, 128, 130, 255))
        lienzo.alpha_composite(c, (x, y - c.height))
        x += c.width + 10
    lienzo = lienzo.convert('RGB')
    return lienzo.resize((lienzo.width * factor, lienzo.height * factor), Image.Resampling.NEAREST)


def hoja_de_salas(momento):
    """Las 8 salas compuestas, una debajo de otra en dos columnas."""
    imagenes = [(s['nombre'], componer(s, momento)) for s in SALAS]
    columnas = [imagenes[0::2], imagenes[1::2]]
    ancho_col = [max(im.width for _, im in col) for col in columnas]
    alto = max(sum(im.height + 34 for _, im in col) for col in columnas) + 8
    lienzo = Image.new('RGB', (sum(ancho_col) + 36, alto), (24, 26, 34))
    d = ImageDraw.Draw(lienzo)
    x = 12
    for col, w in zip(columnas, ancho_col):
        y = 8
        for nombre, im in col:
            d.text((x, y + 6), nombre + ' · ' + str(im.width) + ' px · ' + ('día' if momento == 'dia' else 'noche'), fill=(206, 200, 188))
            lienzo.paste(im, (x, y + 26))
            y += im.height + 34
        x += w + 12
    return lienzo


if __name__ == '__main__':
    destino = os.path.join(RAIZ, 'maqueta-visual', 'piezas')
    os.makedirs(destino, exist_ok=True)
    hoja_de_muebles().save(os.path.join(destino, 'hospital-muebles.png'))
    for momento in ('dia', 'noche'):
        hoja_de_salas(momento).save(os.path.join(destino, 'hospital-' + momento + '.png'))
    for s in SALAS:
        print(s['id'], sl.capas(s)['avisos'])
