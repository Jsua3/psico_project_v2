"""Borra la sombra de piso que el modelo dibujo pese al "no shadow" del prompt.

Segunda pasada sobre un recorte ya sin fondo: elimina los pixeles CLAROS y poco
saturados que (a) viven en la banda inferior del contenido y (b) estan conectados
a la transparencia. Los blancos legitimos de la parte alta (papeles, panuelos,
sabanas) quedan fuera de la banda y sobreviven.

    python drop_ground_shadow.py <cutout.png> <out.png> [band=0.45]
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage


def drop_shadow(src, out, band=0.45):
    im = Image.open(src).convert("RGBA")
    arr = np.array(im)
    a = arr[:, :, 3].copy()
    ys, xs = np.nonzero(a > 0)
    y0, y1 = ys.min(), ys.max()
    cut = int(y1 - (y1 - y0) * band)

    rgb = arr[:, :, :3].astype(int)
    light = rgb.min(axis=2) > 148
    flat = (rgb.max(axis=2) - rgb.min(axis=2)) < 46   # poco saturado = gris
    candidate = light & flat & (a > 0)
    candidate[:cut, :] = False

    # Solo lo conectado a la transparencia (la sombra toca el borde del recorte).
    transparent = a == 0
    lbl, n = ndimage.label(candidate | transparent)
    if n:
        touch = np.unique(lbl[transparent])
        kill = candidate & np.isin(lbl, touch)
        arr[:, :, 3] = np.where(kill, 0, a)
    Image.fromarray(arr, "RGBA").save(out)
    print(f"{out}  borrado={int((a - arr[:, :, 3]).astype(bool).sum())}px")


if __name__ == "__main__":
    band = float(sys.argv[3]) if len(sys.argv) > 3 else 0.45
    drop_shadow(sys.argv[1], sys.argv[2], band)
