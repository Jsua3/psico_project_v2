"""Herramientas del caso (bloque O1): cada una con su ilustración, sus estados y un gesto breve al usarla.

Tira de 12 cuadros por herramienta:
    0        disponible
    1-4      nueva: un brillo recorre la tapa en diagonal y la herramienta se levanta un píxel
    5        usada: tapa apagada y una cinta verde con su marca
    6-11     gesto: se hunde un poco (anticipación), la tapa se abre, se pasa y se asienta abierta mostrando lo suyo

    python tools/escenarios/objetos_herramientas.py     # hoja en maqueta-visual/objetos/
"""
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import objetos_comisaria  # noqa: E402,F401
import objetos_pixel as op  # noqa: E402
from objetos_pixel import Lienzo, Reflejo  # noqa: E402

op.material('tapa-pap', (176, 82, 96), luz=0.45)
op.material('tapa-epicee', (70, 110, 160), luz=0.45)
op.material('tapa-riesgo', (178, 120, 52), luz=0.45)
op.material('tapa-ruta', (62, 132, 116), luz=0.45)
op.material('tapa-bitacora', (92, 76, 120), op.tex_grano(0.04), luz=0.45)
TINTA = (64, 60, 76)
VERDE, AMARILLO, ROJO = (96, 170, 104), (230, 192, 86), (204, 84, 72)
AZUL, GRIS = (70, 110, 160), (176, 180, 190)
CLARO = (248, 240, 214)


def _simbolo(L, codigo, x, y, e=0):
    """Símbolo de la tapa, de 11 × 9, con la esquina de arriba a la izquierda en (x, y)."""
    claro = op.mezcla(CLARO, (0, 0, 0), 0.12 * e)
    if codigo == 'PAP':                                                             # manos que sostienen un corazón
        L.elipse(x + 2, y, x + 5, y + 3, ROJO, tex=False)
        L.elipse(x + 5, y, x + 8, y + 3, ROJO, tex=False)
        L.poli([(x + 2, y + 2), (x + 8, y + 2), (x + 5, y + 6)], ROJO, tex=False)
        L.rect(x, y + 6, x + 3, y + 7, claro, tex=False)
        L.rect(x + 7, y + 6, x + 10, y + 7, claro, tex=False)
        L.rect(x + 3, y + 8, x + 7, y + 8, claro, tex=False)
    elif codigo == 'SPIKES':                                                        # globo de diálogo con escalones
        L.rect(x, y, x + 10, y + 6, claro, tex=False)
        L.poli([(x + 2, y + 6), (x + 5, y + 6), (x + 2, y + 9)], claro, tex=False)
        for k in range(3):
            L.rect(x + 2 + k * 2, y + 4 - k, x + 3 + k * 2, y + 5, AZUL, tex=False)
    elif codigo == 'RISK_METER':                                                    # medidor de tres tramos y su aguja
        for k, c in enumerate((VERDE, AMARILLO, ROJO)):
            L.rect(x + k * 4, y + 2 - (1 if k == 1 else 0), x + k * 4 + 2, y + 5, c, tex=False)
        L.rect(x, y + 6, x + 10, y + 6, claro, tex=False)
        L.linea(x + 5, y + 6, x + 8, y + 1, claro)
        L.px(x + 5, y + 6, TINTA)
    elif codigo == 'SAFETY_ROUTE':                                                  # camino con un punto de llegada
        L.linea(x, y + 8, x + 3, y + 5, claro)
        L.linea(x + 3, y + 5, x + 7, y + 6, claro)
        L.linea(x + 7, y + 6, x + 9, y + 3, claro)
        L.elipse(x + 7, y - 1, x + 10, y + 2, ROJO, tex=False)
        L.px(x + 8, y + 3, ROJO)
    else:                                                                           # bitácora: renglones y un lápiz
        for k in range(3):
            L.rect(x, y + 2 + k * 2, x + 6 - (k % 2) * 2, y + 2 + k * 2, claro, tex=False)
        L.linea(x + 5, y + 8, x + 10, y + 1, AMARILLO)
        L.px(x + 5, y + 8, TINTA)
        L.px(x + 10, y + 1, ROJO)


def _contenido(L, codigo, x0, y0, x1, y1, k):
    """Lo que muestra la herramienta abierta (página derecha). `k` mueve el detalle vivo del gesto."""
    if codigo == 'PAP':                                                             # escuchar · proteger · conectar
        for j, c in enumerate((VERDE, AZUL, ROJO)):
            if j <= k:
                L.elipse(x0 + 1, y0 + 1 + j * 4, x0 + 3, y0 + 3 + j * 4, c, tex=False)
                L.rect(x0 + 5, y0 + 2 + j * 4, x1 - 1 - (j % 2) * 2, y0 + 2 + j * 4, TINTA, tex=False)
    elif codigo == 'SPIKES':                                                        # seis pasos que se marcan
        for j in range(6):
            c = AZUL if j <= k else GRIS
            L.rect(x0 + 1, y0 + 1 + j * 2, x0 + 2, y0 + 1 + j * 2, c, tex=False)
            L.rect(x0 + 4, y0 + 1 + j * 2, x1 - 1 - (j % 3), y0 + 1 + j * 2, TINTA if j <= k else GRIS, tex=False)
    elif codigo == 'RISK_METER':                                                    # la aguja oscila y se asienta
        cx, cy = (x0 + x1) // 2, y1 - 3
        for j, c in enumerate((VERDE, AMARILLO, ROJO)):
            L.rect(x0 + 1 + j * 4, y0 + 3 - (j == 1), x0 + 3 + j * 4, y0 + 6, c, tex=False)
        ang = (-2, -1, 1, 3, 2, 2)[min(k, 5)]
        L.linea(cx, cy, cx + ang, y0 + 7, TINTA)
        L.rect(cx - 1, cy, cx + 1, cy, TINTA, tex=False)
    elif codigo == 'SAFETY_ROUTE':                                                  # el camino se traza tramo a tramo
        puntos = [(x0 + 1, y1 - 1), (x0 + 3, y0 + 7), (x0 + 6, y0 + 9), (x1 - 2, y0 + 4), (x1 - 1, y0 + 2)]
        for a, b in list(zip(puntos, puntos[1:]))[:max(1, k)]:
            L.linea(a[0], a[1], b[0], b[1], (62, 132, 116))
        L.px(x1 - 1, y0 + 1, ROJO)
    else:                                                                           # se escribe un renglón
        for j in range(4):
            largo = (x1 - x0 - 2) if j < 2 else min(x1 - x0 - 2, k * 3)
            if largo > 0:
                L.rect(x0 + 1, y0 + 2 + j * 3, x0 + largo, y0 + 2 + j * 3, TINTA, tex=False)


TAPAS = {'PAP': 'tapa-pap', 'SPIKES': 'tapa-epicee', 'RISK_METER': 'tapa-riesgo', 'SAFETY_ROUTE': 'tapa-ruta',
         'REFLECTION_JOURNAL': 'tapa-bitacora'}


def herramienta(codigo, n=0, tapa=None):
    tapa = tapa or TAPAS[codigo]
    L = Lienzo(36, 30, semilla=101)
    usada = n == 5
    lift = 1 if n in (2, 3) else 0
    hunde = 1 if n == 6 else 0
    gesto = n - 6 if n >= 6 else -1
    yb = 27                                                                         # base del cuaderno (la anticipación aplasta la tapa, no la base)
    if gesto < 1:                                                                   # cerrado
        y0 = 9 - lift + hunde
        L.rect(5, y0 + 13, 30, yb, 'papel', 2)                                      # canto de las hojas
        for y in range(y0 + 14, yb, 2):
            L.rect(6, y, 29, y, 'papel', 3, tex=False)
        L.poli([(7, y0), (31, y0), (30, y0 + 13), (4, y0 + 13)], tapa, 3 if usada else 1)   # tapa vista desde arriba
        L.rect(7, y0, 31, y0, tapa, 2 if usada else 0, tex=False)
        L.rect(4, y0 + 13, 30, y0 + 13, tapa, 4, tex=False)
        L.rect(5, y0 + 1, 7, y0 + 12, tapa, 3, tex=False)                           # lomo
        _simbolo(L, codigo, 13, y0 + 2, e=2 if usada else 0)
        if usada:                                                                   # cinta verde con la marca
            L.rect(25, y0 - 3, 28, y0 + 4, VERDE, tex=False)
            L.poli([(25, y0 + 4), (28, y0 + 4), (26, y0 + 6)], VERDE, tex=False)
            L.px(26, y0, CLARO)
            L.px(27, y0 - 1, CLARO)
        if 1 <= n <= 4:                                                             # franja de brillo que cruza la tapa
            base = 4 + (n - 1) * 7
            for r in range(1, 13):
                x = base + (12 - r) // 2
                for i in range(2):
                    if 6 <= x + i <= 30 and L.mat[y0 + r, x + i] >= 0:
                        L.px(x + i, y0 + r, (255, 246, 216) if i == 0 else op.mezcla((255, 246, 216), (200, 190, 170), 0.4))
    else:                                                                           # abierto
        abre = (0, 6, 15, 13, 13, 13)[gesto]
        L.rect(2, 16, 33, yb, 'papel', 2)                                           # hojas
        L.rect(2, yb, 33, yb, 'papel', 4, tex=False)
        L.rect(2, 9, 17, 23, 'papel', 0)                                            # página izquierda
        L.rect(18, 9, 33, 23, 'papel', 1)                                           # página derecha
        L.rect(17, 9, 18, yb, 'papel', 4, tex=False)                                # lomo
        L.rect(1, 9, 1, yb, tapa, 3, tex=False)                                     # tapa debajo
        L.rect(34, 9, 34, yb, tapa, 3, tex=False)
        for y in (12, 15, 18):
            L.rect(4, y, 14 - (y % 2) * 3, y, GRIS, tex=False)
        _contenido(L, codigo, 19, 9, 32, 22, gesto)
        if abre < 13:                                                               # la tapa todavía en el aire
            L.poli([(18, 9), (33, 9), (33 - abre // 2, 9 - abre), (18, 9 - abre // 2)], tapa, 1)
    return L, {lado: Reflejo(L.w, L.h) for lado in op.LADOS}, None


HERRAMIENTAS = {'PAP': 'Primeros Auxilios Psicológicos', 'SPIKES': 'Protocolo EPICEE/SPIKES', 'RISK_METER': 'Valoración de riesgo',
                'SAFETY_ROUTE': 'Ruta de protección', 'REFLECTION_JOURNAL': 'Bitácora reflexiva'}
VIEJO = {'PAP': 'tool_pap', 'SPIKES': 'tool_spikes', 'RISK_METER': 'tool_risk_meter', 'SAFETY_ROUTE': 'tool_safety_route',
         'REFLECTION_JOURNAL': 'tool_reflection_journal'}


def _dibujar(codigo):
    return lambda n=0: herramienta(codigo, n)


PIEZAS = {
    codigo.lower().replace('_', '-'): dict(
        nombre=nombre, tipo='herramienta', codigo=codigo, dibujar=_dibujar(codigo), cuadros=12,
        huella=dict(ancho=28, fondo=6, alto=12), material='cuaderno',
        estados=dict(disponible=0, nueva=[1, 4], usada=5),
        animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True), nueva=dict(de=1, hasta=4, fps=8, bucle=True),
                         usada=dict(de=5, hasta=5, fps=1, bucle=True), gesto=dict(de=6, hasta=11, fps=10, bucle=False, sostener=True)),
        reemplaza=f'../frontend/src/assets/game/objects/{VIEJO[codigo]}.png')
    for codigo, nombre in HERRAMIENTAS.items()
}



# Herramientas de la biblioteca (fichas y guías de cada lugar): el mismo cuaderno, con la tapa y el contenido que les toca.
op.material('tapa-plan', (150, 96, 70), luz=0.45)
op.material('tapa-contacto', (86, 140, 150), luz=0.45)
BIBLIOTECA = {
    # id: (nombre, contenido del cuaderno, tapa, dibujo de hoy al que reemplaza)
    'ficha-riesgo': ('Ficha de riesgo', 'RISK_METER', 'tapa-riesgo', 'escenarios/casa/arte/herramientas/ficha-riesgo.png'),
    'directorio-rutas': ('Directorio de rutas', 'SAFETY_ROUTE', 'tapa-ruta', 'escenarios/casa/arte/herramientas/directorio-rutas.png'),
    'guia-primeros-auxilios': ('Guía de primeros auxilios psicológicos', 'PAP', 'tapa-pap',
                               'escenarios/casa/arte/herramientas/guia-primeros-auxilios.png'),
    'protocolo-bienestar': ('Protocolo de bienestar', 'SPIKES', 'tapa-epicee', 'escenarios/universidad/arte/herramientas/protocolo-bienestar.png'),
    'ficha-plan-seguridad': ('Ficha del plan de seguridad', 'SAFETY_ROUTE', 'tapa-plan',
                             'escenarios/casa/arte/herramientas/ficha-plan-seguridad.png'),
    'tarjeta-contacto-bienestar': ('Tarjeta de contacto de bienestar', 'PAP', 'tapa-contacto',
                                   'escenarios/comisaria/arte/herramientas/tarjeta-contacto-bienestar.png'),
    'acta-registro': ('Acta de registro', 'REFLECTION_JOURNAL', 'tapa-bitacora', 'escenarios/comisaria/arte/herramientas/acta-registro.png'),
}


def _dibujar_biblioteca(contenido, tapa):
    return lambda n=0: herramienta(contenido, n, tapa=tapa)


for _id, (_nombre, _base, _tapa, _viejo) in BIBLIOTECA.items():
    PIEZAS[_id] = dict(PIEZAS[_base.lower().replace('_', '-')], nombre=_nombre, codigo='biblioteca/' + _id,
                       dibujar=_dibujar_biblioteca(_base, _tapa), reemplaza=_viejo)

if __name__ == '__main__':
    import objetos_hoja
    objetos_hoja.hoja_lugar('herramientas', PIEZAS)
