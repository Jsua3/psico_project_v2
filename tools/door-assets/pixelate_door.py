"""Pixel-art de una puerta: lienzo RETRATO 3:4, downscale + cuantizacion, alfa, limpieza.

A diferencia de pixelate_object.py (que cuadra el contenido), aqui se conserva la
proporcion vertical: una puerta debe llenar el alto del lienzo, no flotar en un
cuadrado. El preview x5 se escribe a una ruta EXPLICITA (nunca junto al output,
para no colar *_prev.png dentro de assets/).

    python pixelate_door.py <src> <out.png> <preview.png> [min_frac=0.02]

min_frac=1.0 conserva solo el cuerpo principal (puertas sin piezas sueltas).
Valores <1 conservan ademas las piezas separadas grandes — p. ej. el cartel de
SALIDA de la puerta institucional, que es un componente propio sobre la hoja.
"""
import sys
from PIL import Image
import numpy as np
from scipy import ndimage

# Un unico corte de alfa para todo: recorte, binarizado y componentes. Si se
# etiquetan componentes con un umbral mas bajo que el del binarizado, un puente de
# alfa casi invisible cuenta como conexion y salva una mota que luego, al binarizar,
# queda flotando suelta.
ALPHA_CUT = 110


def clean_mask(mask, min_frac):
    """Quita motas del alfa YA binarizado, rompiendo antes los puentes de 1 px.

    Se hace a la resolucion final: ahi un puente mide un pixel y la erosion lo
    corta, cosa imposible en el original (donde el mismo puente son decenas de px).
    La erosion solo sirve para *decidir* que es cuerpo; la forma devuelta es la
    original, no la erosionada.
    """
    core = ndimage.binary_erosion(mask)
    lbl, n = ndimage.label(core)
    if n == 0:
        return mask
    areas = ndimage.sum(core, lbl, range(1, n + 1))
    keep_core = np.isin(lbl, 1 + np.nonzero(areas >= areas.max() * min_frac)[0])
    # Devuelve el borde exacto que se erosiono (1 px), ni uno mas: dilatar de mas
    # vuelve a cruzar el puente cortado y recupera la mota que acabamos de descartar.
    return ndimage.binary_dilation(keep_core) & mask


def pixelate_door(src, out, preview, tw=48, th=64, colors=24, pad_frac=0.04, min_frac=0.02):
    im = Image.open(src).convert("RGBA")
    a = np.array(im)[:, :, 3]
    ys, xs = np.nonzero(a >= ALPHA_CUT)
    if not len(xs):
        raise SystemExit(f"{src}: imagen totalmente transparente")
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    w, h = im.size

    # Lienzo con la proporcion destino (tw:th), lo bastante grande para contener
    # el recorte + un pad. El contenido se centra: nunca se recorta ni se estira.
    target_ar = tw / th
    pw, ph = int(w * (1 + pad_frac * 2)), int(h * (1 + pad_frac * 2))
    if pw / ph > target_ar:
        cw, ch = pw, int(round(pw / target_ar))   # demasiado ancho -> crece el alto
    else:
        cw, ch = int(round(ph * target_ar)), ph   # demasiado alto  -> crece el ancho
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((cw - w) // 2, (ch - h) // 2))

    small = canvas.resize((tw, th), Image.LANCZOS)
    r, g, b, al = small.split()
    rgb = (Image.merge("RGB", (r, g, b))
           .quantize(colors=colors, method=Image.FASTOCTREE, dither=Image.Dither.NONE)
           .convert("RGB"))
    mask = clean_mask(np.array(al) >= ALPHA_CUT, min_frac)
    alpha = Image.fromarray((mask * 255).astype(np.uint8), "L")

    final = Image.merge("RGBA", (*rgb.split(), alpha))
    final.save(out)
    final.resize((tw * 5, th * 5), Image.NEAREST).save(preview)
    print(f"{out} {tw}x{th}  componentes={ndimage.label(mask)[1]}")


if __name__ == "__main__":
    min_frac = float(sys.argv[4]) if len(sys.argv) > 4 else 0.02
    pixelate_door(sys.argv[1], sys.argv[2], sys.argv[3], min_frac=min_frac)
