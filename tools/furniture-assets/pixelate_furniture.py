"""Pixel-art de un mueble: recorte a contenido, aspect natural, downscale al lado
largo objetivo, cuantizacion, alfa binarizado y limpieza de motas.

A diferencia de pixelate_object.py (cuadra) y pixelate_door.py (fuerza 3:4), aqui
se CONSERVA la proporcion del mueble: un mostrador es ancho, una planta es alta.

    python pixelate_furniture.py <src> <out.png> <preview.png> <long_side> [min_frac=0.02]

min_frac=1.0 conserva solo el cuerpo principal; <1 conserva piezas separadas grandes.
"""
import sys
from PIL import Image
import numpy as np
from scipy import ndimage

ALPHA_CUT = 110


def clean_mask(mask, min_frac):
    """Quita motas del alfa binarizado, rompiendo antes puentes de 1 px (ver puertas)."""
    core = ndimage.binary_erosion(mask)
    lbl, n = ndimage.label(core)
    if n == 0:
        return mask
    areas = ndimage.sum(core, lbl, range(1, n + 1))
    keep = np.isin(lbl, 1 + np.nonzero(areas >= areas.max() * min_frac)[0])
    return ndimage.binary_dilation(keep) & mask


def pixelate_furniture(src, out, preview, long_side, colors=28, min_frac=0.02):
    im = Image.open(src).convert("RGBA")
    a = np.array(im)[:, :, 3]
    ys, xs = np.nonzero(a >= ALPHA_CUT)
    if not len(xs):
        raise SystemExit(f"{src}: imagen totalmente transparente")
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    w, h = im.size

    if w >= h:
        tw, th = long_side, max(1, round(long_side * h / w))
    else:
        th, tw = long_side, max(1, round(long_side * w / h))

    small = im.resize((tw, th), Image.LANCZOS)
    r, g, b, al = small.split()
    rgb = (Image.merge("RGB", (r, g, b))
           .quantize(colors=colors, method=Image.FASTOCTREE, dither=Image.Dither.NONE)
           .convert("RGB"))
    mask = clean_mask(np.array(al) >= ALPHA_CUT, min_frac)
    alpha = Image.fromarray((mask * 255).astype(np.uint8), "L")
    final = Image.merge("RGBA", (*rgb.split(), alpha))
    final.save(out)
    scale = max(1, 320 // max(tw, th))
    final.resize((tw * scale, th * scale), Image.NEAREST).save(preview)
    print(f"{out}  {tw}x{th}  componentes={ndimage.label(mask)[1]}")


if __name__ == "__main__":
    long_side = int(sys.argv[4])
    min_frac = float(sys.argv[5]) if len(sys.argv) > 5 else 0.02
    pixelate_furniture(sys.argv[1], sys.argv[2], sys.argv[3], long_side, min_frac=min_frac)
