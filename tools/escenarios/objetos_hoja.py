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


def _faltantes():
    """Lo que la biblioteca de hoy tiene y todavía no tiene dibujo nuevo (para mostrarlo como pendiente, no esconderlo)."""
    import json
    import objetos_catalogo as cat
    hechos = set()
    for modulo, _ in cat.MODULOS:
        for ficha in __import__(modulo).PIEZAS.values():
            if ficha.get('reemplaza'):
                hechos.add(os.path.normpath(ficha['reemplaza']).replace('\\', '/'))
    faltan = []
    for lugar in ('casa', 'comisaria', 'universidad'):
        with open(os.path.join(RAIZ, 'biblioteca', 'escenarios', lugar, 'escenario.json'), encoding='utf-8') as f:
            cat_lugar = json.load(f)['catalogo']
        for seccion in ('muebles', 'objetos', 'herramientas'):
            for ficha in cat_lugar[seccion]:
                ruta = f'escenarios/{lugar}/' + ficha['arte']
                if seccion == 'herramientas' and ficha['id'] in __import__('objetos_herramientas').BIBLIOTECA:
                    continue                                         # una sola ficha de biblioteca sirve en los tres lugares
                if ruta not in hechos:
                    faltan.append((f'{lugar}/{ficha["id"]}', ruta))
    return faltan


def hoja_biblioteca(columnas=4):
    """Toda la biblioteca: por pieza, el dibujo de hoy y el nuevo, en una cuadrícula; al final lo que falta."""
    import objetos_catalogo as cat
    celdas = []
    for modulo, lugar in cat.MODULOS:
        for ref, ficha in __import__(modulo).PIEZAS.items():
            viejo = None
            if ficha.get('reemplaza'):
                ruta = os.path.normpath(os.path.join(RAIZ, 'biblioteca', ficha['reemplaza']))
                if os.path.exists(ruta):
                    viejo = Image.open(ruta).convert('RGBA')
            celdas.append((f'{lugar}/{ref}', viejo, oc.armar(modulo, ref)['cuadros'][0]))
    faltan = _faltantes()
    for nombre, ruta in faltan:
        celdas.append((nombre + ' · PENDIENTE', Image.open(os.path.join(RAIZ, 'biblioteca', ruta)).convert('RGBA'), None))
    ancho_celda = max((v.width if v else 0) + (n.width if n else 0) for _, v, n in celdas) + 24
    alto_celda = max(max(v.height if v else 0, n.height if n else 0) for _, v, n in celdas) + 26
    filas = (len(celdas) + columnas - 1) // columnas
    lienzo = _fondo(ancho_celda * columnas + 8, alto_celda * filas + 8)
    d = ImageDraw.Draw(lienzo)
    for k, (nombre, viejo, nuevo) in enumerate(celdas):
        x0, y0 = 4 + (k % columnas) * ancho_celda, 4 + (k // columnas) * alto_celda
        base = y0 + alto_celda - 16                                  # el par abajo de la celda y su nombre debajo
        d.text((x0 + 2, base + 2), nombre, fill=TEXTO)
        x = x0 + 4
        if viejo:
            lienzo.alpha_composite(viejo, (x, base - viejo.height))
            x += viejo.width + 10
        if nuevo:
            lienzo.alpha_composite(nuevo, (x, base - nuevo.height))
    return lienzo, len(celdas) - len(faltan), faltan
