"""Da animación de cercanía a un sprite que ya existe, sin redibujarlo.

    python tools/escenarios/animar_existente.py <reposo.png> <salida-cerca.png> [--efecto brillo|flotar|pulso] [--cuadros 3] [--colores 16]

Efectos (todos vuelven al reposo sin salto):
- brillo: una franja diagonal de luz recorre el sprite de izquierda a derecha.
- flotar: el sprite sube 1, 2, 1 px (necesita aire transparente arriba).
- pulso:  el sprite se aclara un poco y vuelve.

La tira completa (reposo + cuadros) se cuantiza junta a `colores` tonos, con el alfa del
original (binario), para que el objeto no cambie de color al animarse.
"""
import argparse

import numpy as np
from PIL import Image

EFECTOS = ('brillo', 'flotar', 'pulso')


def _mezcla_blanco(rgb, t):
    return np.clip(rgb * (1 - t) + 255 * t, 0, 255)


def cuadro(reposo, efecto, k, n):
    """Cuadro k (1..n) del efecto sobre la imagen RGBA `reposo`."""
    arr = np.array(reposo.convert('RGBA')).astype(np.float32)
    alto, ancho = arr.shape[:2]
    mascara = arr[:, :, 3] >= 128
    salida = arr.copy()
    if efecto == 'brillo':
        ys, xs = np.mgrid[0:alto, 0:ancho]
        diag = xs + (alto - 1 - ys) * 0.5
        total = ancho + alto * 0.5
        centro = total * k / (n + 1)
        franja = (np.abs(diag - centro) <= max(1.5, ancho / 12)) & mascara
        salida[franja, :3] = _mezcla_blanco(arr[franja, :3], 0.45)
    elif efecto == 'pulso':
        t = (0.10, 0.22, 0.10, 0.05)[(k - 1) % 4] if n != 2 else (0.18, 0.09)[k - 1]
        salida[mascara, :3] = _mezcla_blanco(arr[mascara, :3], t)
    elif efecto == 'flotar':
        desplazamientos = {2: (1, 2), 3: (1, 2, 1), 4: (1, 2, 2, 1)}[n]
        dy = desplazamientos[k - 1]
        if arr[:dy, :, 3].max() >= 128:
            raise SystemExit('flotar necesita aire transparente arriba del sprite; usa brillo o pulso')
        salida = np.zeros_like(arr)
        salida[:alto - dy] = arr[dy:]
    else:
        raise SystemExit(f'efecto desconocido: {efecto}')
    return Image.fromarray(salida.astype(np.uint8), 'RGBA')


def animar(reposo, efecto='brillo', cuadros=3, colores=16):
    """Devuelve la hoja horizontal (cuadros × ancho) ya cuantizada, sin tocar el reposo."""
    if not 2 <= cuadros <= 4:
        raise SystemExit('cuadros debe estar entre 2 y 4')
    reposo = reposo.convert('RGBA')
    w, h = reposo.size
    frames = [cuadro(reposo, efecto, k, cuadros) for k in range(1, cuadros + 1)]
    tira = Image.new('RGBA', (w * (cuadros + 1), h), (0, 0, 0, 0))
    tira.paste(reposo, (0, 0))
    for i, f in enumerate(frames):
        tira.paste(f, ((i + 1) * w, 0))
    arr = np.array(tira)
    mascara = arr[:, :, 3] >= 128
    rgb = Image.fromarray(arr[:, :, :3], 'RGB')
    usados = np.unique(arr[:, :, :3][mascara], axis=0)
    if len(usados) > colores:
        rgb = rgb.convert('P', palette=Image.Palette.ADAPTIVE, colors=colores, dither=Image.Dither.NONE).convert('RGB')
    salida = np.zeros_like(arr)
    salida[mascara, :3] = np.array(rgb)[mascara]
    salida[mascara, 3] = 255
    return Image.fromarray(salida, 'RGBA').crop((w, 0, w * (cuadros + 1), h))


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument('reposo')
    p.add_argument('salida')
    p.add_argument('--efecto', choices=EFECTOS, default='brillo')
    p.add_argument('--cuadros', type=int, default=3)
    p.add_argument('--colores', type=int, default=16)
    a = p.parse_args(argv)
    animar(Image.open(a.reposo), a.efecto, a.cuadros, a.colores).save(a.salida)
    print(a.salida)


if __name__ == '__main__':
    main()
