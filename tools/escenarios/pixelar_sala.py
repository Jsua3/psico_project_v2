"""Fondo de sala a pixel art de 960x528.

Recorta la imagen a la proporción 960:528 (centrado), la reduce a 960/factor x 528/factor
con LANCZOS, la cuantiza a `colores` con la paleta adaptativa de Pillow y sin tramado, y la
amplía con vecino más cercano a 960x528 en RGB opaco. Mismo patrón que
tools/furniture-assets/pixelate_furniture.py.

    python tools/escenarios/pixelar_sala.py <src> <out.png> [factor] [colores]

Los valores por defecto (factor 2, 32 colores) son los de biblioteca/escenarios/ESTILO.md.
"""
import sys

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


def pixelar_sala(src, out, factor=FACTOR_POR_DEFECTO, colores=COLORES_POR_DEFECTO):
    factor, colores = int(factor), int(colores)
    if factor < 1 or ANCHO % factor or ALTO % factor:
        raise ValueError(f'El factor {factor} no divide 960x528 (sirven 1, 2, 3, 4, 6, 8, 12, 16, 24 o 48).')
    if not 2 <= colores <= 256:
        raise ValueError(f'Los colores deben ir de 2 a 256 (llegó {colores}).')
    im = Image.open(src).convert('RGB')
    im = recortar_a_proporcion(im)
    chica = im.resize((ANCHO // factor, ALTO // factor), Image.LANCZOS)
    cuantizada = chica.convert('P', palette=Image.Palette.ADAPTIVE, colors=colores, dither=Image.Dither.NONE)
    final = cuantizada.convert('RGB').resize((ANCHO, ALTO), Image.NEAREST)
    final.save(out)
    return final


if __name__ == '__main__':
    if len(sys.argv) < 3:
        raise SystemExit('Uso: python tools/escenarios/pixelar_sala.py <src> <out.png> [factor] [colores]')
    factor = int(sys.argv[3]) if len(sys.argv) > 3 else FACTOR_POR_DEFECTO
    colores = int(sys.argv[4]) if len(sys.argv) > 4 else COLORES_POR_DEFECTO
    hecho = pixelar_sala(sys.argv[1], sys.argv[2], factor, colores)
    print(f'{sys.argv[2]}  {hecho.size[0]}x{hecho.size[1]}  colores={len(hecho.getcolors(100000))}')
