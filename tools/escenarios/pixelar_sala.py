"""Fondo de sala a pixel art de 960x528.

Recorta la imagen a la proporción 960:528 (centrado), la reduce a 960/factor x 528/factor
con LANCZOS, la cuantiza a `colores` con la paleta adaptativa de Pillow y sin tramado, y la
amplía con vecino más cercano a 960x528 en RGB opaco. Mismo patrón que
tools/furniture-assets/pixelate_furniture.py.

    python tools/escenarios/pixelar_sala.py <src> <out.png> [factor] [colores]

Los valores por defecto (factor 2, 32 colores) son los de biblioteca/escenarios/ESTILO.md.
"""
import sys

import numpy as np
from PIL import Image

ANCHO, ALTO = 960, 528
FACTOR_POR_DEFECTO = 2
COLORES_POR_DEFECTO = 32


def recortar_a_proporcion(im):
    """Recorte centrado a la proporción del lienzo, sin deformar."""
    w, h = im.size
    if w * ALTO > h * ANCHO:  # sobra ancho
        nuevo_w = round(h * ANCHO / ALTO)
        x0 = (w - nuevo_w) // 2
        return im.crop((x0, 0, x0 + nuevo_w, h))
    nuevo_h = round(w * ALTO / ANCHO)
    y0 = (h - nuevo_h) // 2
    return im.crop((0, y0, w, y0 + nuevo_h))


def fundir_parecidos(im, colores):
    """Para imágenes de pocos colores (arte dibujado): junta repetidamente los dos colores más
    parecidos (el menos usado toma el color del más usado) hasta quedar en `colores`. A diferencia
    de la paleta adaptativa, un detalle pequeño pero distinto (una ventana) no desaparece."""
    cuenta = {c: n for n, c in im.getcolors(maxcolors=256)}
    destino = {c: c for c in cuenta}
    vivos = list(cuenta)
    while len(vivos) > colores:
        arr = np.array(vivos, dtype=float)
        dist = ((arr[:, None, :] - arr[None, :, :]) ** 2).sum(-1)
        np.fill_diagonal(dist, np.inf)
        i, j = np.unravel_index(np.argmin(dist), dist.shape)
        gana, pierde = (vivos[i], vivos[j]) if cuenta[vivos[i]] >= cuenta[vivos[j]] else (vivos[j], vivos[i])
        cuenta[gana] += cuenta.pop(pierde)
        for c, d in destino.items():
            if d == pierde:
                destino[c] = gana
        vivos.remove(pierde)
    pix = np.array(im)
    salida = pix.copy()
    for c, d in destino.items():
        if c != d:
            salida[(pix == c).all(-1)] = d
    return Image.fromarray(salida, 'RGB')


def pixelar_sala(src, out, factor=FACTOR_POR_DEFECTO, colores=COLORES_POR_DEFECTO, remuestreo='lanczos'):
    """`remuestreo`: 'lanczos' para fotos e imágenes generadas; 'cercano' para arte dibujado,
    que así no gana colores de borde al achicarse. Si la imagen ya tiene a lo sumo `colores`
    colores, se conservan exactos."""
    factor, colores = int(factor), int(colores)
    if factor < 1 or ANCHO % factor or ALTO % factor:
        raise ValueError(f'El factor {factor} no divide 960x528 (sirven 1, 2, 3, 4, 6, 8, 12, 16, 24 o 48).')
    if not 2 <= colores <= 256:
        raise ValueError(f'Los colores deben ir de 2 a 256 (llegó {colores}).')
    filtros = {'lanczos': Image.LANCZOS, 'cercano': Image.NEAREST}
    if remuestreo not in filtros:
        raise ValueError(f'Remuestreo desconocido: {remuestreo} (sirven lanczos o cercano).')
    im = Image.open(src)
    if im.mode in ('RGBA', 'LA', 'PA') or 'transparency' in im.info:
        # Un fondo de sala es opaco: lo transparente se pinta de negro y no conserva su color escondido.
        rgba = im.convert('RGBA')
        im = Image.alpha_composite(Image.new('RGBA', rgba.size, (0, 0, 0, 255)), rgba)
    im = recortar_a_proporcion(im.convert('RGB'))
    chica = im.resize((ANCHO // factor, ALTO // factor), filtros[remuestreo])
    if chica.getcolors(maxcolors=colores) is None:
        if chica.getcolors(maxcolors=256) is not None:
            chica = fundir_parecidos(chica, colores)
        else:
            chica = chica.convert('P', palette=Image.Palette.ADAPTIVE, colors=colores, dither=Image.Dither.NONE).convert('RGB')
    final = chica.resize((ANCHO, ALTO), Image.NEAREST)
    final.save(out)
    return final


if __name__ == '__main__':
    if len(sys.argv) < 3:
        raise SystemExit('Uso: python tools/escenarios/pixelar_sala.py <src> <out.png> [factor] [colores]')
    try:
        factor = int(sys.argv[3]) if len(sys.argv) > 3 else FACTOR_POR_DEFECTO
        colores = int(sys.argv[4]) if len(sys.argv) > 4 else COLORES_POR_DEFECTO
        hecho = pixelar_sala(sys.argv[1], sys.argv[2], factor, colores)
    except ValueError as causa:
        mensaje = str(causa) if 'factor' in str(causa) or 'colores' in str(causa).lower() else (
            'El factor y los colores deben ser números enteros (por ejemplo: 2 32).')
        raise SystemExit(mensaje)
    print(f'{sys.argv[2]}  {hecho.size[0]}x{hecho.size[1]}  colores={len(hecho.getcolors(100000))}')
