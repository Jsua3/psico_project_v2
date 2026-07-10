"""Deriva la puerta en 3/4 a partir de la frontal, con una transformacion de perspectiva.

Una puerta es una losa plana, asi que rotarla contra un muro lateral es exactamente
una proyeccion de un punto de fuga: los bordes vertical izquierdo y derecho siguen
verticales, y los bordes superior e inferior convergen hacia el punto de fuga.

Se hace geometricamente y no con un modelo generativo por tres razones:
  * identidad exacta con la puerta frontal ya commiteada (misma cruz, misma placa),
  * el angulo es un numero, no una suplica en un prompt,
  * la puerta del muro derecho es el espejo pixel-perfecto de esta (flipX en Phaser).

Convencion: la salida mira a la DERECHA (puerta del muro izquierdo). El borde
izquierdo es el cercano (alto completo); el derecho se aleja y encoge.

    python sidify_door.py <front_cutout.png> <out_side_fullres.png>
"""
import sys
import numpy as np
from PIL import Image

ALPHA_CUT = 110
SQUASH = 0.62     # ancho aparente del borde lejano respecto al frontal
FAR_HEIGHT = 0.80  # alto del borde lejano respecto al cercano


def find_coeffs(dst, src):
    """Coeficientes que PIL usa para mapear cada pixel del DESTINO a su origen."""
    m = []
    for (dx, dy), (sx, sy) in zip(dst, src):
        m.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        m.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
    A = np.array(m, dtype=float)
    B = np.array(src, dtype=float).reshape(8)
    return np.linalg.lstsq(A, B, rcond=None)[0]


def trim_thin_columns(im, min_frac=0.20):
    """Recorta apendices delgados laterales (p. ej. una placa de pared suelta).

    La deformacion de perspectiva los proyecta lejos del cuerpo y quedan como
    motas. Se conserva la franja contigua de columnas mas ancha cuyo alto de
    contenido supere min_frac del alto total: eso es la puerta, no el apendice.
    Solo columnas: el cartel de SALIDA vive encima de la puerta, dentro de sus
    columnas, asi que recortar filas lo mutilaria.
    """
    a = np.array(im)[:, :, 3] >= ALPHA_CUT
    h = a.shape[0]
    solid = a.sum(axis=0) >= h * min_frac
    if not solid.any():
        return im
    best = cur = None
    for x, s in enumerate(np.append(solid, False)):
        if s and cur is None:
            cur = x
        elif not s and cur is not None:
            if best is None or x - cur > best[1] - best[0]:
                best = (cur, x)
            cur = None
    ys = np.nonzero(a[:, best[0]:best[1]].any(axis=1))[0]
    return im.crop((best[0], ys.min(), best[1], ys.max() + 1))


def sidify(src_path, out_path, squash=SQUASH, far_height=FAR_HEIGHT):
    im = trim_thin_columns(Image.open(src_path).convert("RGBA"))
    w, h = im.size

    out_w, out_h = max(1, int(round(w * squash))), h
    dy = (1 - far_height) / 2 * h

    # Esquinas del destino (borde derecho encogido) <- esquinas del origen.
    dst = [(0, 0), (out_w, dy), (out_w, out_h - dy), (0, out_h)]
    src = [(0, 0), (w, 0), (w, h), (0, h)]

    warped = im.transform((out_w, out_h), Image.PERSPECTIVE,
                          find_coeffs(dst, src), Image.BICUBIC)
    warped.save(out_path)
    print(f"{out_path}  {w}x{h} -> {out_w}x{out_h}")


if __name__ == "__main__":
    sidify(sys.argv[1], sys.argv[2])
