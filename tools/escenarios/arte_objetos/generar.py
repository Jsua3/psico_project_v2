"""Genera el arte de biblioteca/modelos: reposo (<id>.png) y hoja de cercanía (<id>-cerca.png).

    python tools/escenarios/arte_objetos/generar.py [--grupo comunes] [--solo id,id]

Reposo y animación se acaban JUNTOS (terminar_sprite de arte_universidad) para que compartan
la misma paleta de a lo sumo 16 colores; luego la tira se parte en reposo y hoja horizontal.
"""
import argparse
import json
import os
import sys

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(AQUI))
from arte_universidad import terminar_sprite  # noqa: E402
from arte_objetos import TAM  # noqa: E402
from arte_objetos.registro import GRUPOS, MODELOS  # noqa: E402
from marcadores import dentro_de  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(AQUI)))
CATALOGO = os.path.join(RAIZ, 'biblioteca', 'modelos', 'catalogo.json')


def cargar_catalogo(ruta=CATALOGO):
    with open(ruta, encoding='utf-8') as f:
        return json.load(f)


def tira(cuadros_):
    """Pega los cuadros en una tira horizontal."""
    im = Image.new('RGBA', (TAM * len(cuadros_), TAM), (0, 0, 0, 0))
    for i, c in enumerate(cuadros_):
        im.paste(c, (i * TAM, 0))
    return im


def acabar(cuadros_, max_colores=16):
    """Devuelve (reposo, hoja) acabados con una sola paleta."""
    todo = terminar_sprite(tira(cuadros_), max_colores)
    reposo = todo.crop((0, 0, TAM, TAM))
    hoja = todo.crop((TAM, 0, todo.width, TAM))
    return reposo, hoja


def generar(modelos, base):
    hechos = []
    for m in modelos:
        if m['id'] not in MODELOS:
            raise SystemExit(f"No hay dibujo para el modelo {m['id']}")
        cuadros_ = MODELOS[m['id']]()
        esperados = 1 + m['animacionCerca']['cuadros']
        if len(cuadros_) != esperados:
            raise SystemExit(f"{m['id']}: el dibujo devuelve {len(cuadros_)} cuadros y el catálogo espera {esperados}")
        for c in cuadros_:
            if c.size != (TAM, TAM):
                raise SystemExit(f"{m['id']}: un cuadro mide {c.size}, debe medir {TAM}x{TAM}")
        reposo, hoja = acabar(cuadros_)
        for relativa, im in ((m['arte'], reposo), (m['animacionCerca']['hoja'], hoja)):
            ruta = dentro_de(base, relativa)
            os.makedirs(os.path.dirname(ruta), exist_ok=True)
            im.save(ruta)
            hechos.append(relativa)
    return hechos


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument('--grupo', choices=sorted(GRUPOS))
    p.add_argument('--solo', help='ids separados por coma')
    a = p.parse_args(argv)
    cat = cargar_catalogo()
    modelos = cat['modelos']
    if a.grupo:
        modelos = [m for m in modelos if m['lugarSugerido'] == a.grupo]
    if a.solo:
        ids = set(a.solo.split(','))
        modelos = [m for m in modelos if m['id'] in ids]
    hechos = generar(modelos, os.path.dirname(CATALOGO))
    print(f"{len(hechos)} imágenes escritas ({len(modelos)} modelos)")


if __name__ == '__main__':
    main()
