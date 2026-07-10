"""Quita un fondo blanco plano por flood-fill desde los bordes.

Solo borra el blanco CONECTADO al exterior: los blancos interiores (papeles,
sabanas, brillos) sobreviven. Suficiente para los raws de z_image ("plain flat
white background") sin esperar al remove_background de Higgsfield; el downscale
posterior del pixelado se traga el halo de anti-alias.

    python local_bgremove.py <src> <out> [tol=42]
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage


def remove_white_bg(src, out, tol=42):
    im = Image.open(src).convert("RGBA")
    a = np.array(im).astype(int)
    dist = np.abs(a[:, :, :3] - 255).sum(axis=2)
    whiteish = dist <= tol * 3
    lbl, _ = ndimage.label(whiteish)
    border = np.unique(np.concatenate([lbl[0, :], lbl[-1, :], lbl[:, 0], lbl[:, -1]]))
    border = border[border != 0]
    bg = np.isin(lbl, border)
    arr = np.array(im)
    arr[:, :, 3] = np.where(bg, 0, arr[:, :, 3])
    Image.fromarray(arr, "RGBA").save(out)
    print(f"{out}  bg={bg.mean():.0%}")


if __name__ == "__main__":
    tol = int(sys.argv[3]) if len(sys.argv) > 3 else 42
    remove_white_bg(sys.argv[1], sys.argv[2], tol)
