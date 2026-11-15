"""Retrato fino: 96 x 96, con el mismo tamaño de píxel que la sala, para la interfaz de diálogo (camino A).

El retrato del kit mide 32 x 32 y cada píxel suyo se ve tres veces más grande que el de la sala. Este parte del mismo
busto (así conserva el peinado, la piel y la ropa de cada receta) y rehace lo que el estudiante tiene que aprender a
leer, la cara:

  1. del busto del kit se quitan los rasgos y el contorno, y se amplía a 96 redondeando las formas (filtro de mayoría);
  2. la cabeza se redibuja: mandíbula redonda en vez de la punta que deja la ampliación, sombreado con la luz arriba a la
     izquierda, sombra del pelo en la frente y de la barbilla en el cuello, y contorno de un píxel;
  3. ojos (12 px, con iris, pupila, brillo y párpados), cejas, nariz y boca se dibujan por expresión; la edad se lee en
     ojeras, surcos y frente.

    retrato_fino(receta, estado, cerrado=False) -> imagen de 96 x 96
    rasgos(imagen, receta)                      -> lo que se mide en la cara (lo usa la prueba para «leer» la expresión)
    hoja(receta)                                -> 6 estados x 2 filas (ojos abiertos y cerrados)

    python tools/escenarios/dialogo_retrato.py [receta]     # escribe maqueta-visual/dialogo/retrato-fino.png
"""
import functools
import json
import math
import os
import sys

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
KIT = os.path.join(RAIZ, 'frontend', 'src', 'assets', 'characters', 'kit')
ESTADOS = ('neutral', 'preocupada', 'triste', 'alegre', 'cautelosa', 'en-crisis')
N = 96
VACIO = (0, 0, 0, 0)
CONTORNO = (21, 19, 29, 255)
BRILLO = (255, 255, 255, 255)

# Geometría de la cara en el lienzo de 96 (la del busto del kit, x3).
CX = 47.5                      # eje de la cara
OJOS = (35, 60)                # centro de cada ojo (el izquierdo y el derecho en pantalla)
OJO_Y = 49
CEJA_Y = 38
BOCA_Y = 65
MANDIBULA = (54, 73)           # de dónde a dónde baja la curva de la mandíbula

# Cada expresión, en lo que se ve: cejas (de afuera hacia adentro; negativo = sube), párpados, iris y boca.
EXPRESION = {
    'neutral':    dict(ceja=(2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), alto=0, parpado=0, bajo=0, abre=0, mira=0, boca='recta', frente=0, rubor=1),
    'preocupada': dict(ceja=(3, 3, 2, 2, 2, 1, 1, 0, 0, -1, -1, -2, -2), alto=0, parpado=0, bajo=0, abre=0, mira=0, boca='apretada', frente=1, rubor=0),
    'triste':     dict(ceja=(4, 4, 3, 3, 2, 2, 1, 0, 0, -1, -2, -2, -3), alto=1, parpado=2, bajo=0, abre=0, mira=0, boca='caida', frente=1, rubor=0),
    'alegre':     dict(ceja=(2, 1, 0, -1, -1, -2, -2, -2, -2, -1, -1, 0, 0), alto=-2, parpado=9, bajo=0, abre=0, mira=0, boca='sonrisa', frente=0, rubor=2),
    'cautelosa':  dict(ceja=(-1, -1, -1, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2), alto=2, parpado=1, bajo=1, abre=0, mira=2, boca='ladeada', frente=0, rubor=0),
    'en-crisis':  dict(ceja=(1, 1, 0, 0, -1, -1, -2, -2, -3, -3, -3, -4, -4), alto=-1, parpado=0, bajo=0, abre=1, mira=0, boca='abierta', frente=2, rubor=0),
}


def _hex(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


def _mezcla(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3)) + (255,)


@functools.lru_cache(maxsize=1)
def _kit():
    with open(os.path.join(KIT, 'kit.json'), encoding='utf-8') as f:
        return json.load(f)


@functools.lru_cache(maxsize=None)
def colores_de(receta):
    """La paleta de la receta: piel (luz, base, sombra, honda), pelo, y los literales de la cara."""
    k = _kit()
    r = k['recipes'][receta]
    piel = [_hex(h) for h in k['ramps'][r['colors']['skin']]]
    pelo = [_hex(h) for h in k['ramps'][r['colors']['hair']]]
    lit = k['literals']
    return dict(luz=piel[0], piel=piel[1], sombra=piel[2], honda=piel[3], pieles=tuple(piel), pelo=tuple(pelo),
                ojo=_hex(lit['eye']), blanco=_hex(lit['eyeWhite']), iris=_hex(lit['iris']), rubor=_hex(lit['blush']),
                gafas=_hex(lit['gafas']), madura=r['pieces'].get('face') == 'maduro',
                con_gafas='gafas' in (r['pieces'].get('accessories') or []))


# ── 1. el busto del kit, sin rasgos ni contorno, ampliado y redondeado ─────────────────────────────────────────────

def _busto_limpio(receta):
    c = colores_de(receta)
    im = Image.open(os.path.join(KIT, receta, 'portrait-neutral.png')).convert('RGBA')
    px = im.load()
    pieles, pelo = set(c['pieles']), set(c['pelo'])
    rasgo = {c['ojo'], c['blanco'], c['rubor'], c['gafas'], BRILLO}
    for y in range(32):
        for x in range(32):
            if px[x, y] in pieles:
                px[x, y] = c['piel']
    for y in range(9, 24):                        # ojos, rubor, gafas y cejas (pelo con piel encima) vuelven a ser piel
        for x in range(8, 24):
            v = px[x, y]
            if v in rasgo or (v in pelo and px[x, y - 1] == c['piel']):
                px[x, y] = c['piel']
    for _ in range(3):                            # el contorno toma el color de lo que rodea; lo de afuera se pinta después
        cambios = []
        for y in range(32):
            for x in range(32):
                if px[x, y] != CONTORNO:
                    continue
                vecinos = [px[xx, yy] for xx, yy in ((x, y - 1), (x - 1, y), (x + 1, y), (x, y + 1), (x - 1, y - 1), (x + 1, y - 1),
                                                      (x - 1, y + 1), (x + 1, y + 1)) if 0 <= xx < 32 and 0 <= yy < 32]
                llenos = [v for v in vecinos if v[3] and v != CONTORNO]
                if llenos:
                    cambios.append((x, y, max(set(llenos), key=llenos.count)))
        for x, y, v in cambios:
            px[x, y] = v
    for y in range(32):
        for x in range(32):
            if px[x, y] == CONTORNO:
                px[x, y] = VACIO
    return im


_DISCO = [(dx, dy) for dx in range(-2, 3) for dy in range(-2, 3) if dx * dx + dy * dy <= 5]


def _ampliar(im):
    """x3 con vecino más cercano y dos pasadas de mayoría en un disco: las esquinas se redondean, las líneas quedan."""
    g = im.resize((N, N), Image.NEAREST)
    for _ in range(2):
        px = g.load()
        nuevo = g.copy()
        nx = nuevo.load()
        for y in range(N):
            for x in range(N):
                cuenta = {}
                for dx, dy in _DISCO:
                    xx, yy = x + dx, y + dy
                    v = px[xx, yy] if 0 <= xx < N and 0 <= yy < N else VACIO
                    cuenta[v] = cuenta.get(v, 0) + 1
                mejor = max(cuenta.values())
                if cuenta.get(px[x, y], 0) < mejor:
                    nx[x, y] = next(v for v, n in cuenta.items() if n == mejor)
        g = nuevo
    return g


# ── 1b. el pelo, dibujado a 96 px (no ampliado del kit) ───────────────────────────────────────────────────────────
#
# Cada peinado conserva la silueta y el color del que camina por la sala, pero se dibuja de nuevo: volumen por tonos con
# la luz arriba a la izquierda, mechones que siguen la dirección del peinado, raíces en la línea del pelo, una banda de
# brillo y pelos sueltos que rompen el borde. El brillo de la lámpara de la sala lo pone la interfaz sobre el canto.

def _craneo(y):
    """Medio ancho del cráneo sobre los pómulos: una elipse que cierra arriba en y = 14."""
    if y >= 40:
        return 24.0
    t = (40 - y) / 26.0
    return 24.0 * math.sqrt(max(0.0, 1 - t * t))


def _trazo(px, puntos, color, solo=None):
    """Una línea de un píxel entre puntos consecutivos; con `solo`, únicamente sobre esos colores."""
    for (x0, y0), (x1, y1) in zip(puntos, puntos[1:]):
        pasos = int(max(abs(x1 - x0), abs(y1 - y0))) or 1
        for i in range(pasos + 1):
            x, y = int(round(x0 + (x1 - x0) * i / pasos)), int(round(y0 + (y1 - y0) * i / pasos))
            if 0 <= x < N and 0 <= y < N and (solo is None or px[x, y] in solo):
                px[x, y] = color


def _pelo_mono(px, c):
    """Recogido hacia atrás con un moño arriba (la abuela): el pelo va pegado al cráneo y sube hacia el moño."""
    luz, base, sombra, hondo = c['pelo']
    tonos = (luz, base, sombra, hondo)

    def linea(x):                                  # la línea del pelo en la frente: alta al centro, baja a las sienes
        d = abs(x - CX) / 23.0
        return 24 + 15 * d ** 2.3

    def casquete(x, y):                            # hasta dónde llega el pelo por fuera del cráneo
        if y > 45:
            return False
        if y >= 38:
            return abs(x - CX) <= 27.5 - (y - 38) * 0.45
        t = (38 - y) / 28.0
        return t <= 1 and abs(x - CX) <= 27.5 * math.sqrt(1 - t * t)

    pelo = set()
    for y in range(8, 46):
        for x in range(N):
            if casquete(x, y) and (y < linea(x) or abs(x - CX) > 22.5):
                pelo.add((x, y))
    for x, y in pelo:                              # volumen: de la luz (arriba a la izquierda) a la sombra
        v = 0.5 * (x - (CX - 14)) / 28.0 + 0.8 * (y - 12) / 30.0
        borde = any((x + dx, y + dy) not in pelo and not (y + dy >= linea(x + dx) and abs(x + dx - CX) <= 22.5)
                    for dx, dy in ((2, 0), (0, -1)))
        tono = 0 if v < 0.2 else 1 if v < 0.62 else 2 if v < 0.98 else 3
        px[x, y] = tonos[min(3, tono + (1 if borde and x > CX else 0))]
    for x, y in pelo:                              # banda de brillo: un arco claro en el hombro izquierdo del casquete
        r = math.hypot((x - (CX + 4)) / 27.0, (y - 40) / 27.0)
        if 0.66 <= r <= 0.76 and x < CX + 6 and y < linea(x) - 3 and px[x, y] == base:
            px[x, y] = luz
    # Mechones: del nacimiento del pelo hacia el moño, alternando hebras oscuras y claras.
    for n, xh in enumerate(range(22, 74, 4)):
        yh = linea(xh) - 1
        fin = (CX + (xh - CX) * 0.3, 15)
        medio = ((xh + fin[0]) / 2 + (xh - CX) * 0.12, (yh + fin[1]) / 2 - 2)
        actual = {tonos[0]: tonos[1], tonos[1]: tonos[2], tonos[2]: tonos[3]} if n % 2 == 0 else {tonos[1]: tonos[0], tonos[2]: tonos[1], tonos[3]: tonos[2]}
        for (x0, y0), (x1, y1) in (((xh, yh), medio), (medio, fin)):
            pasos = int(max(abs(x1 - x0), abs(y1 - y0))) or 1
            for i in range(pasos + 1):
                x, y = int(round(x0 + (x1 - x0) * i / pasos)), int(round(y0 + (y1 - y0) * i / pasos))
                if (x, y) in pelo and px[x, y] in actual and (i + n) % 7 != 0:
                    px[x, y] = actual[px[x, y]]
    for x in range(22, 74):                        # raíces: el nacimiento del pelo es más oscuro, e irregular
        y = int(linea(x)) - 1
        if (x, y) in pelo:
            px[x, y] = hondo if x % 3 else sombra
        if x % 5 == 1 and (x, y + 1) not in pelo and 26 <= x <= 69:
            px[x, y + 1] = sombra                  # un pelito que baja sobre la frente
    for lado in (-1, 1):                           # mechón suelto en la sien, delante de la oreja
        xs = CX + lado * 25.5
        _trazo(px, [(xs, 43), (xs - lado * 0.6, 48)], sombra)
    # El moño: una bola arriba, con la luz en su hombro izquierdo, la vuelta del pelo y la sombra donde se apoya.
    mx, my, rx, ry = CX + 1, 9.0, 12.0, 7.5
    bola = {(x, y) for y in range(0, 20) for x in range(N) if ((x - mx) / rx) ** 2 + ((y - my) / ry) ** 2 <= 1}
    for x, y in bola:
        v = 0.55 * (x - (mx - 6)) / rx + 0.9 * (y - (my - 3)) / ry
        px[x, y] = tonos[0 if v < 0.22 else 1 if v < 0.8 else 2 if v < 1.2 else 3]
    for dx, dy in ((-7, 1), (-5, -2), (-2, -4), (2, -4), (5, -2)):         # la vuelta del pelo en el moño
        _trazo(px, [(mx + dx, my + dy), (mx + dx + 3, my + dy + 4), (mx + dx + 4, my + dy + 7)], sombra, solo={luz, base})
    for x in range(int(mx - rx) + 2, int(mx + rx) - 1):                    # sombra del moño sobre la cabeza
        for y in range(15, 19):
            if (x, y) in pelo and (x, y) not in bola and (x, y - 2) in bola:
                px[x, y] = hondo if y < 17 else sombra
    for x, y in ((mx - 13, 6), (mx + 13, 11), (mx + 12, 5)):               # pelos que se escapan del moño
        px[int(x), int(y)] = sombra


PEINADOS = {'mono': _pelo_mono}


def _repeinar(g, c, peinado):
    """Quita el pelo ampliado del kit, completa el cráneo que tapaba y dibuja el peinado a 96 px."""
    px = g.load()
    pelo = set(c['pelo'])
    for y in range(N):
        for x in range(N):
            if px[x, y] in pelo and y < 76:
                px[x, y] = VACIO
    for y in range(14, MANDIBULA[0]):
        for x in range(N):
            if px[x, y][3] == 0 and abs(x - CX) <= _craneo(y):
                px[x, y] = c['piel']
    PEINADOS[peinado](px, c)
    return g


# ── 2. la cabeza ───────────────────────────────────────────────────────────────────────────────────────────────────

def _medio_ancho(y):
    """Medio ancho de la cara a la altura y: recta hasta los pómulos y luego una superelipse que cierra en la barbilla."""
    y0, y1 = MANDIBULA
    if y <= y0:
        return 24.0
    if y >= y1:
        return 0.0
    t = (y - y0) / (y1 - y0)
    return max(0.0, 24.0 * (1 - t ** 2.5) ** (1 / 2.5))


def _en_cara(x, y):
    return abs(x - CX) <= _medio_ancho(y)


def _cabeza(g, c, mechones=True):
    px = g.load()
    piel = c['piel']
    pelo = set(c['pelo'])

    def es_piel(x, y):
        return 0 <= x < N and 0 <= y < N and px[x, y] == piel

    # Las orejas del kit, al ampliarse, son dos bultos que ensanchan la cabeza: se dejan asomar 5 px, no 9.
    for y in range(MANDIBULA[0] + 8):
        for x in range(N):
            if px[x, y] == piel and abs(x - CX) > 29.5:
                px[x, y] = VACIO
    # La mandíbula redonda: por delante del pelo que cae a los lados, por debajo del flequillo (que queda arriba de los ojos).
    for y in range(MANDIBULA[0], MANDIBULA[1]):
        for x in range(N):
            if _en_cara(x, y) and (px[x, y][3] == 0 or px[x, y] in pelo):
                px[x, y] = piel
    cabeza = {(x, y) for y in range(N) for x in range(N) if px[x, y] == piel and (y < MANDIBULA[0] or _en_cara(x, y))}
    cuello = {(x, y) for y in range(MANDIBULA[0], N) for x in range(N) if px[x, y] == piel and (x, y) not in cabeza}

    sombras, luces = set(), set()
    for x, y in cabeza:
        if any(not es_piel(x + d, y) for d in range(1, 6)) or any((x, y + d) not in cabeza for d in range(1, 4)):
            sombras.add((x, y))                                   # el lado contrario a la luz y debajo de la mandíbula
        elif any(0 <= y - d and px[x, y - d] in pelo for d in range(1, 4)):
            sombras.add((x, y))                                   # la sombra del pelo en la frente
        elif 34 <= y <= 62 and any(not es_piel(x - d, y) for d in range(1, 4)):
            luces.add((x, y))
    for x, y in sombras:
        px[x, y] = c['sombra']
    for x, y in luces:
        px[x, y] = c['luz']
    for x, y in cuello:                                           # la barbilla le da sombra al cuello
        arriba = next((d for d in range(1, 9) if (x, y - d) in cabeza), None)
        if arriba == 1:
            px[x, y] = c['honda']
        elif arriba is not None:
            px[x, y] = c['sombra']

    oscuro = c['pelo'][2]
    for y in range(4, N if mechones else 0):                      # mechones del pelo ampliado del kit (el dibujado trae los suyos)
        for x in range(N):
            if px[x, y] == c['pelo'][1] and (x * 3 + y * 5) % 19 == 0:
                for d in range(4):
                    if y + d < N and px[x, y + d] == c['pelo'][1]:
                        px[x, y + d] = oscuro
    borde = [(x, y) for y in range(N) for x in range(N) if px[x, y][3] and any(
        not (0 <= xx < N and 0 <= yy < N) or px[xx, yy][3] == 0 for xx, yy in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))]
    for x, y in borde:
        px[x, y] = CONTORNO
    return g


# ── 3. los rasgos ──────────────────────────────────────────────────────────────────────────────────────────────────

_GLOBO = {-3: (3, 8), -2: (1, 10), -1: (0, 11), 0: (0, 11), 1: (1, 10), 2: (3, 8)}
_GLOBO_ABIERTO = {-4: (3, 8), -3: (1, 10), -2: (0, 11), -1: (0, 11), 0: (0, 11), 1: (0, 11), 2: (1, 10), 3: (3, 8)}


def _ojo(px, cx, lado, e, c, cerrado):
    """Un ojo de 12 px de ancho. `lado` -1 es el izquierdo en pantalla; el derecho es su espejo (n = 0 es el rabillo)."""
    x0 = cx - 6

    def col(n):
        return x0 + (n if lado < 0 else 11 - n)

    tinta = c['ojo']
    if cerrado or e['parpado'] >= 9:
        arco = (1, 1, 0, 0, -1, -1, -1, -1, 0, 0, 1, 1)           # parpadeo: el párpado baja; risa: el ojo se arquea
        signo = 1 if cerrado else -1
        base = OJO_Y + (1 if cerrado else -1)
        for n, dy in enumerate(arco):
            px[col(n), base - signo * dy] = tinta
            if 2 <= n <= 9:
                px[col(n), base - signo * dy + (1 if cerrado else -1) * 0 + 1] = tinta if not cerrado and 4 <= n <= 7 else px[col(n), base - signo * dy + 1]
        if cerrado:
            for n in (1, 3):                                      # pestañas del rabillo
                px[col(n), base + 2] = c['sombra']
        return
    globo = _GLOBO_ABIERTO if e['abre'] else _GLOBO
    arriba = min(globo) + max(0, e['parpado'])
    abajo = max(globo) - max(0, e['bajo'])
    radio = 2.1 if e['abre'] else 2.9
    ix = 5.5 + (e['mira'] if lado < 0 else -e['mira'])            # los dos ojos miran al mismo lado de la pantalla
    iy = -0.5 + (0.5 if e['parpado'] else 0)
    oscuro, claro = _mezcla(c['iris'], tinta, 0.45), _mezcla(c['iris'], (255, 255, 255), 0.22)
    velo = _mezcla(c['blanco'], c['sombra'], 0.28)                # el párpado le da sombra al blanco
    for fila, (a, b) in globo.items():
        if not arriba <= fila <= abajo:
            continue
        for n in range(a, b + 1):
            d = math.hypot(n - ix, fila - iy)
            color = velo if fila == arriba else c['blanco']
            if d <= radio:
                color = tinta if d <= radio * 0.45 else (oscuro if d > radio - 0.9 else claro)
            px[col(n), OJO_Y + fila] = color
    hx = int(round(ix - 1))
    px[col(hx), OJO_Y + int(math.floor(iy)) - 1] = BRILLO         # el brillo: el ojo está vivo
    px[col(hx + (1 if lado < 0 else -1) * 0), OJO_Y + int(math.floor(iy))] = BRILLO
    a, b = globo[arriba]
    cae = 1 if e['parpado'] >= 2 else 0                           # en la tristeza el párpado cae hacia el rabillo
    for n in range(12):                                           # párpado de arriba: línea de dos píxeles, lo que más define
        tope = min((f for f, (p, q) in globo.items() if p <= n <= q and f >= arriba), default=None)
        if tope is None:
            continue
        y = OJO_Y + tope - 1 + (cae if n <= 3 else 0)
        px[col(n), y] = tinta
        if 2 <= n <= 9:
            px[col(n), y - 1] = _mezcla(c['sombra'], tinta, 0.35)
    px[col(0), OJO_Y + min(f for f, (p, q) in globo.items() if p == 0 and f >= arriba)] = tinta
    for n in range(12):                                           # párpado de abajo, suave
        fondo = max((f for f, (p, q) in globo.items() if p <= n <= q and f <= abajo), default=None)
        if fondo is not None and 1 <= n <= 10:
            px[col(n), OJO_Y + fondo + 1] = c['sombra']
    if e['parpado'] > 0:                                          # el párpado visible sobre el ojo entornado
        for fila in range(min(globo), arriba):
            a, b = globo[fila]
            for n in range(a, b + 1):
                px[col(n), OJO_Y + fila - 1 + (cae if n <= 3 else 0)] = c['sombra'] if fila == arriba - 1 else c['piel']


def _ceja(px, cx, lado, e, c):
    color = c['pelo'][3]
    suave = _mezcla(color, c['piel'], 0.5)
    y0 = CEJA_Y + e['alto']
    for n, dy in enumerate(e['ceja']):            # n = 0 afuera … 12 adentro
        x = cx - 6 + (n if lado < 0 else 12 - n) - (1 if lado < 0 else 0)
        px[x, y0 + dy] = color if n >= 1 else suave
        px[x, y0 + dy + 1] = color if 2 <= n <= 11 else suave
        if 5 <= n <= 10:
            px[x, y0 + dy + 2] = suave


def _boca(px, c, tipo):
    cx = 47
    labio = _mezcla(c['honda'], (158, 62, 70, 255), 0.4)
    carne = _mezcla(c['sombra'], (196, 96, 98, 255), 0.45)
    y = BOCA_Y
    if tipo == 'abierta':                         # boca abierta: borde, dientes arriba y hueco oscuro
        hueco = (54, 24, 32, 255)
        filas = {-2: (-3, 4), -1: (-5, 6), 0: (-5, 6), 1: (-5, 6), 2: (-5, 6), 3: (-4, 5), 4: (-2, 3)}
        for dy, (a, b) in filas.items():
            for dx in range(a, b + 1):
                borde = dx in (a, b) or dy in (-2, 4)
                px[cx + dx, y + dy] = labio if borde else ((236, 232, 224, 255) if dy == -1 else hueco)
        for dx in range(-2, 4):
            px[cx + dx, y + 6] = c['sombra']
        return
    formas = {
        'recta':    [(dx, 0) for dx in range(-6, 8)],
        'apretada': [(-4, 1)] + [(dx, 0) for dx in range(-3, 5)] + [(5, 1)],
        'caida':    [(-6, 3), (-5, 2), (-4, 1)] + [(dx, 0) for dx in range(-3, 5)] + [(5, 1), (6, 2), (7, 3)],
        'sonrisa':  [(-7, -3), (-6, -2), (-5, -1), (-4, 0)] + [(dx, 1) for dx in range(-3, 5)] + [(5, 0), (6, -1), (7, -2), (8, -3)],
        'ladeada':  [(dx, 0) for dx in range(-2, 6)] + [(6, -1), (7, -1), (-3, 1)],
    }
    for dx, dy in formas[tipo]:
        px[cx + dx, y + dy] = labio
    bajo = {'recta': (range(-3, 5), 1), 'caida': (range(-2, 4), 1), 'sonrisa': (range(-2, 4), 2), 'ladeada': (range(0, 4), 1),
            'apretada': (range(0, 0), 1)}[tipo]
    for dx in bajo[0]:                            # el labio de abajo
        px[cx + dx, y + bajo[1]] = carne
    for dx in range(-2, 4):                       # y su sombra
        px[cx + dx, y + bajo[1] + 2] = c['sombra']
    if tipo == 'recta':
        px[cx - 7, y], px[cx + 8, y] = c['sombra'], c['sombra']


def _cara(g, estado, cerrado, c):
    px = g.load()
    e = EXPRESION[estado]
    for lado, cx in zip((-1, 1), OJOS):
        _ojo(px, cx, lado, e, c, cerrado)
        _ceja(px, cx, lado, e, c)
    for x, y in ((50, 52), (50, 53), (50, 54), (50, 55), (50, 56), (51, 57), (51, 58), (46, 59), (47, 60), (48, 60), (49, 60), (50, 59)):
        px[x, y] = c['sombra']                    # la nariz: su lado en sombra y la base
    px[51, 59], px[45, 58] = c['honda'], c['sombra']
    for y in (53, 54, 55, 56):
        px[47, y] = c['luz']                      # y el puente a la luz
    _boca(px, c, e['boca'])
    if e['rubor']:
        tono = _mezcla(c['piel'], c['rubor'], 0.3 * e['rubor'])
        for bx in (28, 62):
            for dx in range(6):
                for dy in range(2 + (e['rubor'] > 1)):
                    if px[bx + dx, 58 + dy] in (c['piel'], c['luz']):
                        px[bx + dx, 58 + dy] = tono
    if c['madura']:                               # la edad: ojeras, surcos junto a la boca y patas de gallo
        for cx in OJOS:
            for dx in range(-4, 5):
                px[cx + dx, OJO_Y + 6 + (0 if abs(dx) < 3 else -1)] = c['sombra']
        for dx, dy in ((0, 0), (-1, 1), (-2, 2), (-3, 3), (-3, 4), (-3, 5)):
            px[41 + dx, 59 + dy] = c['sombra']
            px[54 - dx, 59 + dy] = c['sombra']
        for lado, cx in zip((-1, 1), OJOS):
            px[cx + lado * 8, OJO_Y + 1], px[cx + lado * 9, OJO_Y + 2] = c['sombra'], c['sombra']
    # La frente se arruga con la preocupación: líneas cortas y centradas, que no se confundan con una ceja. Con los años
    # queda una, tenue, aunque la cara esté serena.
    lineas = [(43, 53, 33)] if c['madura'] and not e['frente'] else [(41, 55, 34 - n * 3) for n in range(e['frente'])]
    for x0, x1, y in lineas:
        for x in range(x0, x1):
            if px[x, y] == c['piel'] and (x - x0) % 6 != 5:
                px[x, y] = c['sombra']
    return g


@functools.lru_cache(maxsize=None)
def _base(receta):
    c = colores_de(receta)
    g = _ampliar(_busto_limpio(receta))
    peinado = _kit()['recipes'][receta]['pieces'].get('hair')
    if peinado in PEINADOS:
        return _cabeza(_repeinar(g, c, peinado), c, mechones=False)
    return _cabeza(g, c)


def retrato_fino(receta, estado='neutral', cerrado=False):
    return _cara(_base(receta).copy(), estado, cerrado, colores_de(receta))


def rasgos(im, receta):
    """Lo que se puede medir mirando la cara, sin saber qué expresión es: con esto la prueba la «lee»."""
    c = colores_de(receta)
    px = im.load()
    caja = [(x, y) for cx in OJOS for x in range(cx - 7, cx + 7) for y in range(OJO_Y - 6, OJO_Y + 6)]
    blancos = [p for p in caja if px[p] == c['blanco']]
    filas = len({y for _, y in blancos})
    iris = [x for x, y in caja if x < CX and px[x, y] == c['ojo'] and OJO_Y - 1 <= y <= OJO_Y + 1 and abs(x - OJOS[0]) < 6]
    mirada = (sum(iris) / len(iris) - (OJOS[0] - 0.5)) if iris and blancos else 0.0
    ceja = c['pelo'][3]
    pieles = set(c['pieles'])
    # Una ceja tiene piel encima; las raíces del pelo (del mismo color) tienen pelo encima y no cuentan.
    izq = [(x, y) for x in range(OJOS[0] - 8, OJOS[0] + 7) for y in range(CEJA_Y - 6, CEJA_Y + 7)
           if px[x, y] == ceja and any(px[x, y - d] in pieles for d in (1, 2, 3))]
    afuera = [y for x, y in izq if x < OJOS[0] - 2]
    adentro = [y for x, y in izq if x > OJOS[0] + 2]
    pendiente = (sum(afuera) / len(afuera) - sum(adentro) / len(adentro)) if afuera and adentro else 0.0
    labio = _mezcla(c['honda'], (158, 62, 70, 255), 0.4)
    boca = [(x, y) for x in range(36, 60) for y in range(BOCA_Y - 5, BOCA_Y + 7) if px[x, y] == labio]
    centro = [y for x, y in boca if 45 <= x <= 50]
    puntas = [y for x, y in boca if x <= 42 or x >= 54]
    curva = (sum(puntas) / len(puntas) - sum(centro) / len(centro)) if centro and puntas else 0.0
    abierta = any(px[x, y] == (54, 24, 32, 255) for x in range(40, 56) for y in range(BOCA_Y - 3, BOCA_Y + 5))
    return dict(blanco=len(blancos), filas=filas, mirada=mirada, pendiente=pendiente, curva=curva, abierta=abierta,
                ancho_boca=(max(x for x, _ in boca) - min(x for x, _ in boca) + 1) if boca else 0)


def hoja(receta):
    tira = Image.new('RGBA', (N * len(ESTADOS), N * 2), VACIO)
    for n, estado in enumerate(ESTADOS):
        tira.alpha_composite(retrato_fino(receta, estado), (n * N, 0))
        tira.alpha_composite(retrato_fino(receta, estado, cerrado=True), (n * N, N))
    return tira


def lamina(receta, escala=2):
    """Para mirar: arriba el retrato del kit (x3), en medio los seis finos y abajo el parpadeo, sobre el tono de la placa."""
    hoja_fina = hoja(receta)
    hoja_kit = Image.new('RGBA', (N * 6, N), VACIO)
    for n, estado in enumerate(ESTADOS):
        ruta = os.path.join(KIT, receta, f'portrait-{estado}.png')
        if os.path.exists(ruta):
            hoja_kit.alpha_composite(Image.open(ruta).convert('RGBA').resize((N, N), Image.NEAREST), (n * N, 0))
    im = Image.new('RGBA', (N * 6, N * 3), (38, 34, 56, 255))
    im.alpha_composite(hoja_kit, (0, 0))
    im.alpha_composite(hoja_fina, (0, N))
    return im.resize((im.width * escala, im.height * escala), Image.NEAREST)


if __name__ == '__main__':
    receta = sys.argv[1] if len(sys.argv) > 1 else 'abuela-familia'
    destino = os.path.join(RAIZ, 'maqueta-visual', 'dialogo', 'retrato-fino.png')
    lamina(receta).save(destino)
    print(destino)
