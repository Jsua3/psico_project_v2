"""API mínima de dibujo para los modelos interactivos de la biblioteca (pixel art de 32×32).

Cada modelo es una función sin argumentos que devuelve una lista de cuadros RGBA de 32×32:
el cuadro 0 es el reposo y los siguientes (2 a 4) son la animación que se ve al acercarse.
Reglas que revisa test_arte_objetos.py:

- 32×32 por cuadro, con el borde de 1 px transparente (el contorno se agrega después).
- A lo sumo 15 colores opacos por modelo (el acabado agrega el contorno y llega a 16).
- Alfa binario: o 255 o 0. Nada de semitransparencias.
- Los cuadros de la animación cambian de verdad: ninguno es idéntico al anterior.
- El objeto se apoya en el borde inferior del icono (y ≈ 30) salvo lo que cuelga de la pared.
"""
from PIL import Image, ImageDraw

TAM = 32


def lienzo():
    im = Image.new('RGBA', (TAM, TAM), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def _c(c):
    return tuple(int(v) for v in c[:3]) + (255,)


def R(d, x0, y0, x1, y1, c):
    """Rectángulo relleno, bordes incluidos."""
    d.rectangle([x0, y0, x1, y1], fill=_c(c))


def P(d, x, y, c):
    """Un píxel."""
    d.point((x, y), fill=_c(c))


def L(d, x0, y0, x1, y1, c, w=1):
    d.line([(x0, y0), (x1, y1)], fill=_c(c), width=w)


def E(d, x0, y0, x1, y1, c):
    d.ellipse([x0, y0, x1, y1], fill=_c(c))


def POL(d, puntos, c):
    d.polygon(puntos, fill=_c(c))


def mezcla(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def tonos(base):
    """Cuatro tonos a partir de un color: (claro, base, oscuro, sombra)."""
    return (mezcla(base, (255, 255, 255), 0.35), tuple(base), mezcla(base, (0, 0, 0), 0.3), mezcla(base, (0, 0, 0), 0.55))


def cuadros(n, dibujar):
    """Llama dibujar(k) para k = 0..n (reposo + n cuadros) y devuelve las imágenes."""
    return [dibujar(k) for k in range(n + 1)]
