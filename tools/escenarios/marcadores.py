"""Marcadores provisionales para el arte de un escenario de la biblioteca.

Escribe un PNG por cada `arte` del escenario que todavía no existe en disco, así el
validador pasa antes de tener el arte real. Nunca pisa un archivo que ya existe.

- Fondo de sala: 960x528 con la zona caminable del encuadre en gris claro, las paredes
  en gris medio y el nombre de la sala.
- Mueble: un rectángulo de ancho x alto (su caja del catálogo) con su nombre.
- Objeto y herramienta: un cuadro de 32x32 con su inicial.

    python tools/escenarios/marcadores.py <escenario.json>
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ANCHO_SALA, ALTO_SALA = 960, 528
LADO_ICONO = 32

# Mismos valores que biblioteca/scripts/geometria.mjs.
ZONAS = {
    'tres-paredes': (96, 236, 768, 250),
    'dos-paredes-izquierda': (96, 236, 840, 250),
    'dos-paredes-derecha': (24, 236, 840, 250),
    'una-pared': (24, 236, 912, 250),
}

ENCUADRE_LEGIBLE = {
    'tres-paredes': 'sala cerrada (3 paredes)',
    'dos-paredes-izquierda': 'esquina (pared del fondo e izquierda)',
    'dos-paredes-derecha': 'esquina (pared del fondo y derecha)',
    'una-pared': 'solo la pared del fondo',
}

FUERA = (96, 96, 104)
PARED = (150, 150, 158)
SUELO = (214, 214, 220)
TINTA = (40, 40, 48)
BORDE = (70, 70, 80)


def fuente(tamano):
    try:
        return ImageFont.load_default(size=tamano)
    except TypeError:  # Pillow sin FreeType
        return ImageFont.load_default()


def texto_centrado(draw, caja, texto, tamano):
    x0, y0, x1, y1 = caja
    f = fuente(tamano)
    izq, arr, der, aba = draw.textbbox((0, 0), texto, font=f)
    draw.text(((x0 + x1 - (der - izq)) / 2 - izq, (y0 + y1 - (aba - arr)) / 2 - arr), texto, fill=TINTA, font=f)


def marcador_sala(sala):
    x, y, ancho, alto = ZONAS[sala['encuadre']]
    im = Image.new('RGB', (ANCHO_SALA, ALTO_SALA), FUERA)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, ANCHO_SALA - 1, y - 1], fill=PARED)               # pared del fondo
    if x >= 96:
        d.rectangle([0, 0, 95, ALTO_SALA - 1], fill=PARED)               # pared izquierda
    if x + ancho <= 864:
        d.rectangle([864, 0, ANCHO_SALA - 1, ALTO_SALA - 1], fill=PARED)  # pared derecha
    d.rectangle([x, y, x + ancho - 1, y + alto - 1], fill=SUELO)
    texto_centrado(d, (0, 60, ANCHO_SALA, 140), sala['nombre'], 28)
    texto_centrado(d, (0, 140, ANCHO_SALA, 190), f"Arte provisional · {ENCUADRE_LEGIBLE[sala['encuadre']]}", 18)
    return im


def marcador_rect(ancho, alto, nombre):
    im = Image.new('RGBA', (ancho, alto), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, ancho - 1, alto - 1], fill=SUELO + (255,), outline=BORDE + (255,), width=2 if min(ancho, alto) > 8 else 1)
    texto = nombre if ancho >= 8 * len(nombre) and alto >= 16 else nombre[:1].upper()
    texto_centrado(d, (0, 0, ancho, alto), texto, 12 if texto != nombre else 12)
    return im


def piezas(escenario):
    """(ruta relativa, función que crea el marcador) por cada arte del escenario."""
    for sala in escenario['salas']:
        yield sala['fondo'], lambda s=sala: marcador_sala(s)
    for m in escenario['catalogo']['muebles']:
        yield m['arte'], lambda m=m: marcador_rect(m['ancho'], m['alto'], m['nombre'])
    for o in escenario['catalogo']['objetos'] + escenario['catalogo']['herramientas']:
        yield o['arte'], lambda o=o: marcador_rect(LADO_ICONO, LADO_ICONO, o['nombre'])


def crear_marcadores(ruta_escenario):
    base = os.path.dirname(os.path.abspath(ruta_escenario))
    with open(ruta_escenario, encoding='utf-8') as f:
        escenario = json.load(f)
    creados = []
    for relativa, crear in piezas(escenario):
        destino = os.path.join(base, *relativa.split('/'))
        if os.path.exists(destino):
            continue
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        crear().save(destino)
        creados.append(relativa)
    return creados


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Uso: python tools/escenarios/marcadores.py <escenario.json>')
    hechos = crear_marcadores(sys.argv[1])
    for r in hechos:
        print(f'marcador: {r}')
    print(f'{len(hechos)} marcador(es) nuevo(s)')
