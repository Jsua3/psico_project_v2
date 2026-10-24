"""Hoja de contacto de un escenario: todas sus salas en una imagen para revisarlas.

Cada celda muestra el fondo de la sala a tamaño real (960x528), los muebles, personajes y
objetos en su punto de apoyo (centro inferior) y, encima, el nombre y el encuadre.

    python tools/escenarios/hoja_contacto.py <escenario.json> <out.png> [--salas a,b] [--kit <dir>]
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ANCHO_SALA, ALTO_SALA = 960, 528
ROTULO = 40
MARGEN = 16
COLUMNAS = 2
FONDO_HOJA = (27, 27, 34)
TINTA = (230, 230, 236)
SOMBRA = (5, 7, 13)
CUADRO_KIT = (48, 72)  # idle.png: 4 columnas x 4 filas (frente, izquierda, derecha, espalda)
FILA_KIT = {'izquierda': 1, 'derecha': 2}

ENCUADRE_LEGIBLE = {
    'tres-paredes': 'sala cerrada (3 paredes)',
    'dos-paredes-izquierda': 'esquina (fondo e izquierda)',
    'dos-paredes-derecha': 'esquina (fondo y derecha)',
    'una-pared': 'solo la pared del fondo',
}

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KIT_POR_DEFECTO = os.path.join(RAIZ, 'frontend', 'src', 'assets', 'characters', 'kit')


def ancho_hoja(columnas):
    return MARGEN + columnas * (ANCHO_SALA + MARGEN)


def alto_hoja(filas):
    return MARGEN + filas * (ROTULO + ALTO_SALA + MARGEN)


def origen_celda(indice, columnas=COLUMNAS):
    """Esquina superior izquierda del dibujo de la sala (debajo de su rótulo)."""
    fila, col = divmod(indice, columnas)
    return MARGEN + col * (ANCHO_SALA + MARGEN), MARGEN + fila * (ROTULO + ALTO_SALA + MARGEN) + ROTULO


def _fuente(tamano):
    """Fuente con tildes y eñes: la de Pillow por defecto no las trae."""
    for nombre in ('DejaVuSans.ttf', 'segoeui.ttf', 'arial.ttf'):
        try:
            return ImageFont.truetype(nombre, tamano)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=tamano)
    except TypeError:
        return ImageFont.load_default()


def _abrir(ruta):
    return Image.open(ruta).convert('RGBA')


def _sombra(capa, cx, base_y, ancho, alto=10, alfa=0.3):
    d = ImageDraw.Draw(capa)
    for factor, a in ((1.0, alfa * 0.55), (0.68, alfa)):
        w, h = ancho * factor / 2, alto * factor / 2
        d.ellipse([cx - w, base_y - h, cx + w, base_y + h], fill=SOMBRA + (int(255 * a),))


def _cuadro_personaje(kit_dir, receta, mirando):
    ruta = os.path.join(kit_dir, receta, 'idle.png')
    if not os.path.exists(ruta):
        silueta = Image.new('RGBA', CUADRO_KIT, (0, 0, 0, 0))
        d = ImageDraw.Draw(silueta)
        d.ellipse([16, 4, 32, 20], fill=(200, 200, 210, 255))
        d.rectangle([14, 22, 34, 70], fill=(200, 200, 210, 255))
        return silueta, CUADRO_KIT[1] - 1
    hoja = _abrir(ruta)
    w, h = CUADRO_KIT
    fila = FILA_KIT[mirando]
    cuadro = hoja.crop((0, fila * h, w, (fila + 1) * h))
    caja = cuadro.getbbox()
    return cuadro, (caja[3] - 1) if caja else h - 1


def componer_sala(base, sala, escenario, kit_dir):
    """Dibujo de una sala con todo lo colocado, en un lienzo de 960x528."""
    fondo = _abrir(os.path.join(base, *sala['fondo'].split('/')))
    if fondo.size != (ANCHO_SALA, ALTO_SALA):
        fondo = fondo.resize((ANCHO_SALA, ALTO_SALA), Image.NEAREST)
    lienzo = fondo.copy()
    muebles = {m['id']: m for m in escenario['catalogo']['muebles']}
    objetos = {o['id']: o for o in escenario['catalogo']['objetos']}
    recetas = {p['id']: p['recipeId'] for p in escenario['personajes']}

    piezas = []  # (y, orden, función que dibuja)
    for colocado in sala['muebles']:
        mueble = muebles.get(colocado['ref'])
        if not mueble:
            continue
        sprite = _abrir(os.path.join(base, *mueble['arte'].split('/')))
        if colocado.get('espejo'):
            sprite = sprite.transpose(Image.FLIP_LEFT_RIGHT)
        piezas.append((colocado['y'], 0, colocado, sprite, mueble['colision'], sprite.height - 1))
    for colocado in sala['personajes']:
        receta = recetas.get(colocado['ref'])
        if not receta:
            continue
        cuadro, pie = _cuadro_personaje(kit_dir, receta, colocado['mirando'])
        piezas.append((colocado['y'], 1, colocado, cuadro, True, pie))
    piezas.sort(key=lambda p: (p[0], p[1]))

    for y, _, colocado, sprite, con_sombra, pie in piezas:
        if con_sombra:
            capa = Image.new('RGBA', lienzo.size, (0, 0, 0, 0))
            _sombra(capa, colocado['x'], y, sprite.width + 8 if sprite.width > CUADRO_KIT[0] else 30)
            lienzo = Image.alpha_composite(lienzo, capa)
        x0 = colocado['x'] - sprite.width // 2
        y0 = y - pie
        lienzo.alpha_composite(sprite, (max(0, x0), max(0, y0)), (max(0, -x0), max(0, -y0)))

    for colocado in sala['objetos']:  # encima de todo: son lo que se recoge o se mira
        objeto = objetos.get(colocado['ref'])
        if not objeto:
            continue
        icono = _abrir(os.path.join(base, *objeto['arte'].split('/')))
        lienzo.alpha_composite(icono, (colocado['x'] - icono.width // 2, colocado['y'] - icono.height + 1))
    return lienzo.convert('RGB')


def hoja_contacto(ruta_escenario, out, kit_dir=None, salas=None):
    base = os.path.dirname(os.path.abspath(ruta_escenario))
    with open(ruta_escenario, encoding='utf-8') as f:
        escenario = json.load(f)
    elegidas = [s for s in escenario['salas'] if not salas or s['id'] in salas]
    if not elegidas:
        raise SystemExit('Ninguna sala coincide con las pedidas.')
    columnas = min(COLUMNAS, len(elegidas))
    filas = math.ceil(len(elegidas) / columnas)
    hoja = Image.new('RGB', (ancho_hoja(columnas), alto_hoja(filas)), FONDO_HOJA)
    d = ImageDraw.Draw(hoja)
    fuente = _fuente(20)
    for i, sala in enumerate(elegidas):
        x0, y0 = origen_celda(i, columnas)
        hoja.paste(componer_sala(base, sala, escenario, kit_dir or KIT_POR_DEFECTO), (x0, y0))
        d.text((x0, y0 - ROTULO + 8), f"{sala['nombre']} · {ENCUADRE_LEGIBLE[sala['encuadre']]}", fill=TINTA, font=fuente)
    hoja.save(out)
    return {'celdas': len(elegidas)}


if __name__ == '__main__':
    args = sys.argv[1:]
    opciones = {}
    for clave in ('--salas', '--kit'):
        if clave in args:
            i = args.index(clave)
            opciones[clave] = args[i + 1]
            del args[i:i + 2]
    if len(args) != 2:
        raise SystemExit('Uso: python tools/escenarios/hoja_contacto.py <escenario.json> <out.png> [--salas a,b] [--kit <dir>]')
    info = hoja_contacto(args[0], args[1], kit_dir=opciones.get('--kit'),
                         salas=opciones['--salas'].split(',') if '--salas' in opciones else None)
    print(f"{args[1]}: {info['celdas']} celda(s)")
