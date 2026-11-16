"""Hojas para mirar los objetos v2 (bloque O1): antes y después a escala real y a ×3, y todos sus cuadros.

    python tools/escenarios/objetos_casa.py      # llama a hoja_lugar('casa', PIEZAS)
"""
import os
import sys

from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import objetos_comun as oc  # noqa: E402

SALIDA = os.path.join(RAIZ, 'maqueta-visual', 'objetos')
PISO = (118, 92, 72)              # un piso de madera medio, para juzgar contra un fondo de sala
PISO2 = (108, 84, 66)
TEXTO = (232, 224, 208)


def _fondo(w, h):
    im = Image.new('RGBA', (w, h), PISO + (255,))
    d = ImageDraw.Draw(im)
    for y in range(0, h, 12):
        d.rectangle([0, y + 6, w, y + 11], fill=PISO2 + (255,))
    return im


def hoja_antes_despues(piezas, modulo):
    """Una fila por pieza: el dibujo de hoy, el nuevo y todos los cuadros del nuevo. Escala 1."""
    filas = []
    for ref, ficha in piezas.items():
        p = oc.armar(modulo, ref)
        viejo = None
        if ficha.get('reemplaza'):
            ruta = os.path.join(RAIZ, 'biblioteca', ficha['reemplaza'])
            if os.path.exists(ruta):
                viejo = Image.open(ruta).convert('RGBA')
        filas.append((ref, viejo, p['cuadros']))
    alto = sum(max((v.height if v else 0), c[0].height) + 22 for _, v, c in filas) + 8
    ancho = max(150 + (c[0].width + 6) * len(c) + 8 for _, _, c in filas) + 40
    lienzo = _fondo(ancho, alto)
    d = ImageDraw.Draw(lienzo)
    y = 6
    for ref, viejo, cuadros in filas:
        h = max((viejo.height if viejo else 0), cuadros[0].height)
        d.text((4, y), ref, fill=TEXTO)
        if viejo:
            lienzo.alpha_composite(viejo, (4, y + 12 + h - viejo.height))
        x = 150
        for c in cuadros:
            lienzo.alpha_composite(c, (x, y + 12 + h - c.height))
            x += c.width + 6
        y += h + 22
    return lienzo


def guardar(im, nombre, factor=3):
    os.makedirs(SALIDA, exist_ok=True)
    ruta1 = os.path.join(SALIDA, nombre + '.png')
    im.convert('RGB').save(ruta1)
    if factor > 1:
        im.convert('RGB').resize((im.width * factor, im.height * factor), Image.Resampling.NEAREST).save(
            os.path.join(SALIDA, nombre + f'-x{factor}.png'))
    return ruta1


def hoja_lugar(lugar, piezas):
    print(guardar(hoja_antes_despues(piezas, f'objetos_{lugar}'), f'antes-despues-{lugar}'))
