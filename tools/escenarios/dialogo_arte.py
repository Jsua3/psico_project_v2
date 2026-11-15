"""Arte de la interfaz de diálogo: marcos, tramas, teclas, pulso, cola de burbuja y parpadeo del retrato.

Todo es pixel art dibujado por código, a la densidad del mundo (un píxel de marco = un píxel de sala) y con la luz
de la sala: el canto de arriba y de la izquierda toma el color de la fuente del `momento` (lámpara de noche, sol de día).

    marco(nombre, momento)   -> imagen de 12 x 12 para `border-image` con corte de 4
    trama(nombre, momento)   -> mosaico de 8 x 8 para el relleno
    tinta_de(nombre, momento)-> color del texto que va sobre esa trama
    pulso(estado)            -> tira de 4 cuadros de 16 x 8 (CALM, TENSE, CRISIS)
    parpadeo(retrato)        -> el retrato de 32 x 32 con los ojos cerrados

    python tools/escenarios/dialogo_arte.py     # escribe maqueta-visual/dialogo/lamina-arte.png
"""
import math
import os

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))

MOMENTOS = ('noche', 'dia')
TINTA = (21, 19, 29)                       # el contorno de los personajes del kit
LUZ = {'noche': (255, 205, 130), 'dia': (255, 243, 205)}   # lámpara cálida; sol por la ventana
CLARO = (242, 236, 223)                    # texto sobre penumbra
OSCURO = (27, 21, 48)                      # texto sobre una superficie encendida
PAPEL = (36, 27, 44)                       # texto de la burbuja


def mezcla(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def _materiales(momento):
    """nombre -> (relleno, canto de luz, canto de sombra, mota clara, mota oscura)."""
    luz = LUZ[momento]
    penumbra, pizarra, alzada, hundida = (27, 24, 38), (40, 36, 60), (48, 43, 70), (33, 30, 50)
    encendida = mezcla((250, 240, 214), luz, 0.35)
    papel = (240, 234, 220)
    tecla = (58, 52, 84)
    return {
        'placa': (penumbra, mezcla(penumbra, luz, 0.30), (17, 15, 24), (33, 30, 46), (23, 20, 33)),
        'rotulo': (penumbra, mezcla(penumbra, luz, 0.30), (17, 15, 24), (33, 30, 46), (23, 20, 33)),
        'ficha': (pizarra, mezcla(pizarra, luz, 0.22), (26, 23, 40), (47, 43, 69), (35, 31, 53)),
        'ficha-sobre': (alzada, luz, (26, 23, 40), (56, 51, 80), (42, 38, 62)),
        'ficha-foco': (alzada, luz, (26, 23, 40), (56, 51, 80), (42, 38, 62)),
        'ficha-pulsada': (hundida, (20, 18, 31), mezcla(hundida, luz, 0.14), (38, 35, 57), (29, 26, 44)),
        'ficha-elegida': (encendida, mezcla(encendida, (255, 255, 255), 0.6), mezcla(encendida, (120, 84, 40), 0.3),
                          mezcla(encendida, (255, 255, 255), 0.35), mezcla(encendida, (120, 84, 40), 0.1)),
        'burbuja': (papel, (255, 252, 244), (198, 190, 178), (247, 243, 232), (231, 224, 208)),
        'tecla': (tecla, mezcla(tecla, luz, 0.28), (30, 27, 46), tecla, tecla),
        'tecla-encendida': (luz, mezcla(luz, (255, 255, 255), 0.55), mezcla(luz, (120, 70, 30), 0.3), luz, luz),
        'tecla-hundida': (hundida, (20, 18, 31), (20, 18, 31), hundida, hundida),
    }


MARCOS = ('placa', 'rotulo', 'ficha', 'ficha-sobre', 'ficha-foco', 'ficha-pulsada', 'ficha-elegida', 'burbuja',
          'tecla', 'tecla-encendida', 'tecla-hundida')
TRAMAS = ('placa', 'ficha', 'ficha-sobre', 'ficha-pulsada', 'ficha-elegida', 'burbuja')
_TINTAS = {'ficha-elegida': OSCURO, 'burbuja': PAPEL, 'tecla-encendida': OSCURO}


def tinta_de(nombre, momento='noche'):
    return _TINTAS.get(nombre, CLARO)


def marco(nombre, momento='noche'):
    """12 x 12 con corte de 4: contorno de 1, canto de 1 y dos píxeles de relleno; esquinas en chaflán de 2."""
    relleno, luz, sombra, _, _ = _materiales(momento)[nombre]
    contorno = (40, 28, 24) if nombre == 'burbuja' else TINTA
    n = 12
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    px = im.load()

    def dentro(x, y):
        return min(x, n - 1 - x) + min(y, n - 1 - y) >= 2

    for y in range(n):
        for x in range(n):
            if not dentro(x, y):
                continue
            borde = (x in (0, n - 1) or y in (0, n - 1)
                     or not all(dentro(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))))
            if borde:
                color = contorno
            elif y == 1 or x == 1:
                color = luz
            elif y == n - 2 or x == n - 2:
                color = sombra
            else:
                color = relleno
            px[x, y] = color + (255,)
    if nombre == 'ficha-foco':               # el foco enciende dos filas, no una
        for x in range(2, n - 2):
            px[x, 2] = mezcla(relleno, luz, 0.55) + (255,)
    if nombre == 'rotulo':                   # la pestaña se funde con la placa: sin borde abajo
        for y in range(n - 4, n):
            for x in range(n):
                px[x, y] = (contorno if x in (0, n - 1) else luz if x == 1 else sombra if x == n - 2 else relleno) + (255,)
        for x, y in ((0, n - 1), (n - 1, n - 1)):
            px[x, y] = (0, 0, 0, 0)
    if nombre.startswith('tecla') and nombre != 'tecla-hundida':   # el canto de la tecla: una fila más de grosor
        lado = mezcla(relleno, TINTA, 0.55)
        for x in range(2, n - 2):
            px[x, n - 3], px[x, n - 2] = sombra + (255,), lado + (255,)
    return im


def trama(nombre, momento='noche'):
    """Mosaico de 8 x 8: el relleno con motas claras y oscuras, para que ninguna superficie quede plana."""
    relleno, _, _, clara, oscura = _materiales(momento)[nombre]
    im = Image.new('RGBA', (8, 8), relleno + (255,))
    for x, y in ((1, 1), (5, 3), (3, 6), (7, 5)):
        im.putpixel((x, y), clara + (255,))
    for x, y in ((4, 0), (0, 4), (6, 7), (2, 3)):
        im.putpixel((x, y), oscura + (255,))
    return im


def sombra_de_contacto():
    """Mosaico de 2 x 2 en damero: la sombra por escalones que deja la placa sobre la sala."""
    im = Image.new('RGBA', (2, 2), (0, 0, 0, 0))
    im.putpixel((0, 0), (8, 6, 18, 255))
    im.putpixel((1, 1), (8, 6, 18, 255))
    return im


def _figura(filas, tintas):
    im = Image.new('RGBA', (len(filas[0]), len(filas)), (0, 0, 0, 0))
    for y, fila in enumerate(filas):
        for x, ch in enumerate(fila):
            if ch != '.':
                im.putpixel((x, y), tintas[ch] + (255,))
    return im


def cola_burbuja():
    """La punta de la burbuja; su primera fila tapa el borde inferior de la burbuja."""
    return _figura(['#bbbbb#', '.#bbb#.', '..#b#..', '...#...'], {'#': (40, 28, 24), 'b': (240, 234, 220)})


def cursor(momento='noche'):
    """▶ que señala la ficha con foco."""
    return _figura(['##....', '#l#...', '#ll#..', '#lll#.', '#ll#..', '#l#...', '##....'], {'#': TINTA, 'l': LUZ[momento]})


def seguir(momento='noche'):
    """▼ de «hay más»: la línea terminó y se puede seguir."""
    return _figura(['#######', '#lllll#', '.#lll#.', '..#l#..', '...#...'], {'#': TINTA, 'l': LUZ[momento]})


# Las letras de las fichas se dibujan aquí: son el nombre de la respuesta (el estudiante las dice y las pulsa) y a
# este tamaño una fuente de píxel confunde la C con el 0 y la B con el 8. Trazo de 2 px, 7 x 9, cada una con su rasgo:
# la A tiene pico y travesaño, la B cintura, la C queda abierta a la derecha y la D es recta a la izquierda y curva a la derecha.
LETRAS = {
    'A': ['..###..', '.##.##.', '##...##', '##...##', '#######', '#######', '##...##', '##...##', '##...##'],
    'B': ['######.', '##..###', '##...##', '##..##.', '#####..', '##..##.', '##...##', '##..###', '######.'],
    'C': ['.#####.', '###..##', '##.....', '##.....', '##.....', '##.....', '##.....', '###..##', '.#####.'],
    'D': ['#####..', '##.###.', '##..###', '##...##', '##...##', '##...##', '##..###', '##.###.', '#####..'],
}


def letra(ch, tinta=CLARO):
    """La letra de una ficha, de 7 x 9, en un solo color."""
    return _figura(LETRAS[ch], {'#': tuple(tinta)})


PULSOS = ('CALM', 'TENSE', 'CRISIS')
_COLOR_PULSO = {'CALM': (143, 207, 154), 'TENSE': (240, 196, 110), 'CRISIS': (236, 150, 132)}


def _onda(estado, x):
    if estado == 'CALM':                      # respiración larga
        return 4 + round(1.6 * math.sin(2 * math.pi * x / 16))
    if estado == 'TENSE':                     # respiración corta
        return 4 + round(2.2 * math.sin(2 * math.pi * x / 8))
    return 1 + abs((x % 6) - 3) * 2           # quebrada, en diente de sierra


def pulso(estado):
    """Tira de 4 cuadros de 16 x 8: la onda de la respiración, que avanza 4 px por cuadro (2 en la quebrada)."""
    tira = Image.new('RGBA', (64, 8), (0, 0, 0, 0))
    paso = 2 if estado == 'CRISIS' else 4
    for n in range(4):
        antes = None
        for x in range(16):
            y = max(0, min(7, _onda(estado, x + n * paso)))
            y0, y1 = (min(antes, y), max(antes, y)) if antes is not None else (y, y)
            for yy in range(y0, y1 + 1):
                tira.putpixel((n * 16 + x, yy), _COLOR_PULSO[estado] + (255,))
            antes = y
    return tira


def parpadeo(retrato):
    """El retrato con los ojos cerrados. Un ojo es el brillo blanco y lo oscuro pegado a él; la ceja no se toca.
    Una cara sin brillo (los ojos ya cerrados de «alegre») queda igual."""
    im = retrato.copy()
    px = im.load()
    blanco = (255, 255, 255, 255)
    vistos = set()
    for y0 in range(8, 21):
        for x0 in range(6, 26):
            if px[x0, y0] != blanco or (x0, y0) in vistos:
                continue
            oscuro = min((px[x0 + dx, y0 + dy] for dx, dy in ((1, 0), (0, 1), (-1, 0), (1, 1)) if px[x0 + dx, y0 + dy][3]),
                         key=lambda c: sum(c[:3]))
            ojo, cola = set(), [(x0, y0)]
            while cola:
                x, y = cola.pop()
                if (x, y) in ojo or not (6 <= x < 26 and 8 <= y <= 20) or px[x, y] not in (blanco, oscuro):
                    continue
                ojo.add((x, y))
                cola += [(x + 1, y), (x - 1, y), (x, y + 1)]      # hacia abajo y a los lados: la ceja queda arriba
            vistos |= ojo
            xs, ys = [p[0] for p in ojo], [p[1] for p in ojo]
            piel = px[min(xs) - 1, min(ys)]
            for x, y in ojo:
                px[x, y] = oscuro if y == max(ys) else piel
    return im


def lamina(momento='noche', escala=6):
    """Todos los marcos, tramas y dibujos sobre el tono de la sala, para mirarlos."""
    fondo = (58, 52, 66) if momento == 'noche' else (150, 140, 128)
    piezas = [marco(n, momento) for n in MARCOS] + [trama(n, momento) for n in TRAMAS]
    piezas += [cola_burbuja(), cursor(momento), seguir(momento)] + [pulso(e) for e in PULSOS]
    ancho = sum(p.width + 4 for p in piezas) + 4
    hoja = Image.new('RGBA', (ancho, 20), fondo + (255,))
    x = 4
    for p in piezas:
        hoja.alpha_composite(p, (x, 4))
        x += p.width + 4
    return hoja.resize((hoja.width * escala, hoja.height * escala), Image.NEAREST)


if __name__ == '__main__':
    destino = os.path.join(RAIZ, 'maqueta-visual', 'dialogo')
    os.makedirs(destino, exist_ok=True)
    noche, dia = lamina('noche'), lamina('dia')
    hoja = Image.new('RGBA', (noche.width, noche.height * 2))
    hoja.paste(noche, (0, 0))
    hoja.paste(dia, (0, noche.height))
    hoja.save(os.path.join(destino, 'lamina-arte.png'))
    print(os.path.join(destino, 'lamina-arte.png'), hoja.size)
