"""Retrato fino de MUESTRA: 96 x 96, para que el retrato del diálogo tenga el mismo tamaño de píxel que la sala.

Hoy el retrato es el del kit (32 x 32) ampliado: cada píxel suyo mide tres veces el de la sala. Esta muestra parte del
mismo busto del kit (así conserva peinado, piel y ropa de la receta), lo amplía a 96 con Scale3x, adelgaza el contorno
a un píxel y dibuja de nuevo lo que el estudiante tiene que aprender a leer: ojos, cejas, boca y las marcas de la cara,
con seis expresiones y el parpadeo. Es una evaluación, no el kit: solo se usa en la maqueta.

    retrato_fino(receta, estado, cerrado=False) -> imagen de 96 x 96
    hoja(receta)                                -> 6 estados x 2 filas (ojos abiertos y cerrados)

    python tools/escenarios/dialogo_retrato.py     # escribe maqueta-visual/dialogo/retrato-fino.png
"""
import os

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
KIT = os.path.join(RAIZ, 'frontend', 'src', 'assets', 'characters', 'kit')
ESTADOS = ('neutral', 'preocupada', 'triste', 'alegre', 'cautelosa', 'en-crisis')
VACIO = (0, 0, 0, 0)
CONTORNO = (21, 19, 29, 255)
TINTA = (33, 30, 43, 255)
BLANCO = (240, 234, 224, 255)

# Cada expresión: cejas (alto y forma), párpados (cuánto cubren arriba y abajo), pupila y boca.
# `ceja`: desplazamiento por columna, del extremo de afuera al de adentro (negativo = sube).
EXPRESION = {
    'neutral':    dict(ceja=(1, 0, 0, 0, 0, 0, 0, 0, 0, 0), alto=0, parpado=0, bajo=0, pupila=0, mira=0, boca='recta', frente=0),
    'preocupada': dict(ceja=(2, 2, 1, 1, 0, 0, -1, -1, -2, -2), alto=-1, parpado=0, bajo=0, pupila=0, mira=0, boca='apretada', frente=1),
    'triste':     dict(ceja=(3, 3, 2, 2, 1, 0, -1, -2, -2, -3), alto=0, parpado=2, bajo=0, pupila=0, mira=0, boca='caida', frente=1),
    'alegre':     dict(ceja=(1, 0, -1, -1, -1, -1, -1, 0, 0, 1), alto=-1, parpado=9, bajo=0, pupila=0, mira=0, boca='sonrisa', frente=0),
    'cautelosa':  dict(ceja=(-1, -1, 0, 0, 0, 0, 1, 1, 1, 2), alto=1, parpado=1, bajo=1, pupila=0, mira=1, boca='ladeada', frente=0),
    'en-crisis':  dict(ceja=(1, 1, 0, 0, -1, -1, -2, -2, -3, -3), alto=-3, parpado=-1, bajo=-1, pupila=1, mira=0, boca='abierta', frente=2),
}


def _scale3x(im):
    w, h = im.size
    s = im.load()
    out = Image.new('RGBA', (w * 3, h * 3), VACIO)
    o = out.load()

    def p(x, y):
        return s[min(w - 1, max(0, x)), min(h - 1, max(0, y))]

    for y in range(h):
        for x in range(w):
            a, b, c = p(x - 1, y - 1), p(x, y - 1), p(x + 1, y - 1)
            d, e, f = p(x - 1, y), p(x, y), p(x + 1, y)
            g, hh, i = p(x - 1, y + 1), p(x, y + 1), p(x + 1, y + 1)
            celda = [e] * 9
            if b != hh and d != f:
                celda[0] = d if d == b else e
                celda[1] = b if (d == b and e != c) or (b == f and e != a) else e
                celda[2] = f if b == f else e
                celda[3] = d if (d == b and e != g) or (d == hh and e != a) else e
                celda[5] = f if (b == f and e != i) or (hh == f and e != c) else e
                celda[6] = d if d == hh else e
                celda[7] = hh if (d == hh and e != i) or (hh == f and e != g) else e
                celda[8] = f if hh == f else e
            for n, color in enumerate(celda):
                o[x * 3 + n % 3, y * 3 + n // 3] = color
    return out


def _adelgazar(im):
    """El contorno del kit queda de 3 px al ampliar: se deja de 1, como el de la sala."""
    w, h = im.size
    for _ in range(2):
        px = im.load()
        cambios = []
        for y in range(h):
            for x in range(w):
                if px[x, y] != CONTORNO:
                    continue
                vecinos = [px[xx, yy] for xx in (x - 1, x, x + 1) for yy in (y - 1, y, y + 1) if 0 <= xx < w and 0 <= yy < h]
                if len(vecinos) < 9 or any(v[3] == 0 for v in vecinos):
                    continue                      # toca el vacío: es el borde de afuera y se queda
                relleno = [v for v in vecinos if v != CONTORNO]
                if relleno:
                    cambios.append((x, y, max(set(relleno), key=relleno.count)))
        for x, y, color in cambios:
            px[x, y] = color
    return im


def _limpio(retrato):
    """El busto de 32 px sin ojos, cejas, boca ni marcas: queda la piel lisa para dibujar la cara de nuevo."""
    im = retrato.copy()
    px = im.load()
    piel, sombra = px[12, 12], px[9, 12]
    for y in range(13, 22):
        for x in range(10, 22):
            if px[x, y] not in (piel, sombra) or (px[x, y] == sombra and 11 <= x <= 20):
                px[x, y] = piel
    return im, dict(piel=piel, sombra=sombra, luz=retrato.getpixel((7, 16)), honda=retrato.getpixel((14, 20)), ceja=retrato.getpixel((11, 13)))


def _mezcla(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3)) + (255,)


def _ojo(px, cx, cy, lado, e, c, cerrado):
    """Un ojo de 10 x 7 con centro en (cx, cy). `lado` = -1 el izquierdo en pantalla, 1 el derecho (refleja la forma)."""
    iris, iris_luz = _mezcla(c['honda'], TINTA, 0.35), _mezcla(c['honda'], c['piel'], 0.25)
    forma = {-3: (2, 7), -2: (1, 8), -1: (0, 9), 0: (0, 9), 1: (1, 8), 2: (2, 7)}       # fila -> columnas del globo
    arriba, abajo = -3 + max(0, e['parpado']), 2 - max(0, e['bajo'])
    if e['parpado'] < 0:                                                                 # ojos muy abiertos: un renglón más
        forma = {-4: (2, 7), -3: (1, 8), -2: (0, 9), -1: (0, 9), 0: (0, 9), 1: (0, 9), 2: (1, 8), 3: (2, 7)}
        arriba, abajo = -4, 3
    x0 = cx - 5

    def col(n):                                   # el ojo derecho es el espejo del izquierdo
        return x0 + (n if lado < 0 else 9 - n)

    if cerrado or e['parpado'] >= 9:              # párpado cerrado, o el arco de la risa
        curva = (1, 0, 0, -1, -1, -1, -1, 0, 0, 1) if not cerrado else (0, 1, 1, 2, 2, 2, 2, 1, 1, 0)
        for n, dy in enumerate(curva):
            px[col(n), cy + dy - (1 if cerrado else 0)] = TINTA
        if cerrado:
            for n in (2, 4, 6):
                px[col(n), cy + 2] = c['sombra']
        return
    r = 1 if e['pupila'] else 2                   # iris pequeño = susto
    ix = 4.5 + e['mira'] * 1.5 * (1 if lado < 0 else -1) * -1
    for fila, (a, b) in forma.items():
        if not arriba <= fila <= abajo:
            continue
        for n in range(a, b + 1):
            d2 = (n - ix) ** 2 + (fila + 0.5) ** 2
            color = BLANCO
            if d2 <= (r + 0.6) ** 2:
                color = iris if d2 > (r - 0.7) ** 2 and r > 1 else TINTA
            px[col(n), cy + fila] = color
    px[col(int(ix - 1)), cy - 1] = (255, 255, 255, 255)                                  # brillo: el ojo está vivo
    if r > 1:
        px[col(int(ix + 1)), cy + 1] = iris_luz
    a, b = forma[arriba]
    for n in range(a - 1, b + 2):                                                        # línea del párpado de arriba
        if 0 <= n <= 9:
            sube = 1 if n in (a - 1, b + 1) else 0
            px[col(n), cy + arriba - 1 + sube + (1 if e['parpado'] >= 2 and n > 5 else 0)] = TINTA
    px[col(9), cy + arriba] = TINTA                                                      # pestaña de afuera
    a, b = forma[abajo]
    for n in range(a, b + 1):                                                            # párpado de abajo, más suave
        px[col(n), cy + abajo + 1] = c['sombra']


def _ceja(px, cx, cy, lado, e, c):
    y0 = cy - 9 + e['alto']
    for n, dy in enumerate(e['ceja']):            # n = 0 afuera … 9 adentro
        x = cx - 5 + (n if lado < 0 else 9 - n) + (1 if lado < 0 else -1)
        px[x, y0 + dy] = c['ceja']
        px[x, y0 + dy + 1] = c['ceja'] if 1 <= n <= 8 else _mezcla(c['ceja'], c['piel'], 0.45)


def _boca(px, c, tipo):
    cx, y = 47, 64
    labio, bajo = _mezcla(c['honda'], (150, 60, 66), 0.35), c['sombra']
    formas = {
        'recta':    [(-5, 0), (-4, 0), (-3, 0), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (3, 0), (4, 0), (5, 0)],
        'apretada': [(-4, 1), (-3, 0), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (3, 0), (4, 1)],
        'caida':    [(-5, 2), (-4, 1), (-3, 0), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (3, 0), (4, 1), (5, 2)],
        'sonrisa':  [(-6, -2), (-5, -1), (-4, 0), (-3, 1), (-2, 1), (-1, 1), (0, 1), (1, 1), (2, 1), (3, 1), (4, 0), (5, -1), (6, -2)],
        'ladeada':  [(-3, 0), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (3, 0), (4, -1), (5, -1)],
    }
    if tipo == 'abierta':                         # boca abierta: borde, hueco oscuro y dientes
        hueco = (58, 26, 34, 255)
        for dy, (a, b) in {-1: (-3, 3), 0: (-4, 4), 1: (-4, 4), 2: (-4, 4), 3: (-3, 3)}.items():
            for dx in range(a, b + 1):
                borde = dx in (a, b) or dy in (-1, 3)
                px[cx + dx, y + dy] = labio if borde else (BLANCO if dy == 0 else hueco)
        for dx in range(-2, 3):
            px[cx + dx, y + 5] = bajo
        return
    for dx, dy in formas[tipo]:
        px[cx + dx, y + dy] = labio
    for dx in range(-2, 3):                       # sombra bajo el labio
        px[cx + dx, y + (4 if tipo == 'sonrisa' else 3)] = bajo
    if tipo == 'sonrisa':                         # mejillas
        rubor = _mezcla(c['piel'], (232, 150, 150), 0.5)
        for bx in (30, 61):
            for dx in range(5):
                for dy in range(2):
                    px[bx + dx, 59 + dy] = rubor


def _cara(im, estado, cerrado, madura):
    px = im.load()
    e = EXPRESION[estado]
    for lado, cx in ((-1, 36), (1, 59)):
        _ojo(px, cx, 49, lado, e, C, cerrado)
        _ceja(px, cx, 49, lado, e, C)
    for x, y in ((49, 52), (49, 53), (49, 54), (49, 55), (50, 56), (46, 57), (47, 58), (48, 58), (49, 57), (50, 57)):   # nariz
        px[x, y] = C['sombra']
    px[45, 55] = C['luz']
    px[45, 56] = C['luz']
    _boca(px, C, e['boca'])
    if madura:                                    # ojeras y surcos: la edad también se lee
        for lado, cx in ((-1, 36), (1, 59)):
            for dx in range(-3, 4):
                px[cx + dx, 55 + (1 if abs(dx) < 3 else 0)] = C['sombra']
        for n, (dx, dy) in enumerate(((0, 0), (-1, 1), (-2, 2), (-2, 3), (-2, 4))):
            px[41 + dx, 58 + dy] = C['sombra']
            px[54 - dx, 58 + dy] = C['sombra']
    for n in range(e['frente']):                  # la frente se arruga con la preocupación
        for x in range(41, 55):
            if (x + n) % 7:
                px[x, 33 + n * 3] = C['sombra']
    return im


C = {}


def retrato_fino(receta, estado='neutral', cerrado=False):
    global C
    base = Image.open(os.path.join(KIT, receta, 'portrait-neutral.png')).convert('RGBA')
    limpio, colores = _limpio(base)
    C = colores
    im = _adelgazar(_scale3x(limpio))
    px = im.load()
    pelo = {base.getpixel((13, 5)), base.getpixel((13, 4))}
    oscuro = base.getpixel((8, 8))
    for y in range(6, 30):                        # mechones: el pelo no es una mancha lisa
        for x in range(96):
            if px[x, y] in pelo and (x * 3 + y * 5) % 17 == 0:
                for dy in range(3):
                    if px[x, y + dy] in pelo:
                        px[x, y + dy] = oscuro
    with open(os.path.join(KIT, 'kit.json'), encoding='utf-8') as f:
        import json
        madura = json.load(f)['recipes'][receta]['pieces'].get('face') == 'maduro'
    return _cara(im, estado, cerrado, madura)


def hoja(receta):
    tira = Image.new('RGBA', (96 * len(ESTADOS), 192), VACIO)
    for n, estado in enumerate(ESTADOS):
        tira.alpha_composite(retrato_fino(receta, estado), (n * 96, 0))
        tira.alpha_composite(retrato_fino(receta, estado, cerrado=True), (n * 96, 96))
    return tira


if __name__ == '__main__':
    destino = os.path.join(RAIZ, 'maqueta-visual', 'dialogo', 'retrato-fino.png')
    fila = hoja('abuela-familia').crop((0, 0, 96 * 6, 96))
    kit = Image.new('RGBA', (96 * 6, 96), VACIO)
    for n, estado in enumerate(ESTADOS):
        kit.alpha_composite(Image.open(os.path.join(KIT, 'abuela-familia', f'portrait-{estado}.png')).convert('RGBA').resize((96, 96), Image.NEAREST), (n * 96, 0))
    lamina = Image.new('RGBA', (96 * 6, 96 * 3), (44, 40, 62, 255))
    lamina.alpha_composite(kit, (0, 0))
    lamina.alpha_composite(fila, (0, 96))
    lamina.alpha_composite(hoja('abuela-familia').crop((0, 96, 96 * 6, 192)), (0, 192))
    lamina.resize((lamina.width * 2, lamina.height * 2), Image.NEAREST).save(destino)
    print(destino)
