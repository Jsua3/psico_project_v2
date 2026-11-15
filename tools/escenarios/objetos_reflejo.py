"""Reflejos y luz propia de los objetos v2 (bloque O1): el brillo sale de la fuente de luz de la sala.

- `fuente_dominante(sala, momento, x, y)` elige la fuente que manda sobre un objeto: de día la ventana más cercana
  (si no hay, una lámpara encendida a toda hora); de noche la lámpara o el tubo encendido más cercano. Sin fuente
  activa, no hay reflejo.
- `lado_de(fuente, x)`: `izquierda`, `frente` (enfrente o desde el techo) o `derecha`, según dónde está la fuente.
- `capa_reflejo(pieza, cuadro, x, y, sala, momento, espejo)` es la capa que se SUMA sobre el objeto ya iluminado:
  la máscara del lado (fuerte o suave) teñida con el tono de la fuente. Con `espejo`, el lado se elige en la pantalla
  y se toma la máscara del lado contrario del dibujo, ya espejada: el brillo sigue del lado de la luz.

Las fichas `luz` de ventanas y lámparas son las de P1 (`biblioteca/piezas/manifiesto.json`); aquí solo se leen.
"""
import functools
import json
import os
import sys

import numpy as np
from PIL import Image, ImageOps

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import piezas_geo as g  # noqa: E402

TONO = {'dia': (255, 236, 204), 'calido': (255, 206, 144), 'frio': (196, 222, 255)}
FUERZA = {'fuerte': 0.42, 'suave': 0.20}          # fracción del tono que suma cada nivel de la máscara
FRENTE = 28                                       # px: una fuente casi enfrente da el brillo de frente
OPUESTO = {'izquierda': 'derecha', 'derecha': 'izquierda', 'frente': 'frente'}


@functools.lru_cache(maxsize=1)
def _manifiesto():
    with open(os.path.join(RAIZ, 'biblioteca', 'piezas', 'manifiesto.json'), encoding='utf-8') as f:
        return json.load(f)


def _ficha(pieza):
    return _manifiesto()['piezas'].get(f"{pieza['tipo']}/{pieza.get('modelo', pieza['tipo'])}")


def fuentes(sala, momento):
    """Fuentes activas de la sala en ese momento: dict(x, y, tono, forma, radio, fuerza, muro)."""
    est = sala['estructura']
    ancho = est['ancho']
    xl, _ = g.limites(sala['encuadre'], ancho)
    lista = []
    for p in est.get('piezas', []):
        ficha = _ficha(p)
        if not ficha or 'luz' not in ficha:
            continue
        luz = ficha['luz']
        encendida = p.get('encendida')
        if encendida is False:
            continue
        propio = luz['momento'] == momento
        if not propio and encendida is not True:
            continue
        fuerza = (luz.get('fuerza', 100) / 100) * (1.0 if propio else 0.6)
        muro = p.get('muro', 'suelo')
        if 'x' in p:
            x, y = p['x'], p['y']
        elif muro == 'fondo':
            x, y = xl + p['pos'], g.SEAM
        elif muro == 'izquierda':
            x, y = 0, g.SEAM + p['pos']
        elif muro == 'derecha':
            x, y = ancho, g.SEAM + p['pos']
        else:
            continue
        tono = 'dia' if luz['forma'] == 'haz' else luz['tono']
        lista.append(dict(x=x, y=y, tono=tono, forma=luz['forma'], radio=luz.get('radio', [9999, 9999]), fuerza=fuerza,
                          muro=muro))
    return lista


def fuente_dominante(sala, momento, x, y, extra=()):
    """La fuente que manda en (x, y). `extra`: fuentes de objetos que alumbran (el televisor), solo de noche."""
    activas = fuentes(sala, momento) + (list(extra) if momento == 'noche' else [])
    if momento == 'dia':
        activas = [f for f in activas if f['forma'] == 'haz'] or activas
    if not activas:
        return None
    return min(activas, key=lambda f: (f['x'] - x) ** 2 + (2 * (f['y'] - y)) ** 2)


def lado_de(fuente, x):
    if fuente['forma'] == 'tubo' or fuente.get('encima'):
        return 'frente'
    if fuente['muro'] in ('izquierda', 'derecha'):
        return fuente['muro']
    dx = fuente['x'] - x
    if abs(dx) <= FRENTE:
        return 'frente'
    return 'izquierda' if dx < 0 else 'derecha'


def capa_reflejo(pieza, cuadro, x, y, sala, momento, espejo=False, extra=()):
    """(capa RGB del tamaño del cuadro para SUMAR, o None). (x, y) = apoyo del objeto en la sala."""
    if not pieza.get('reflejo'):
        return None
    f = fuente_dominante(sala, momento, x, y, extra)
    if f is None:
        return None
    lado = lado_de(f, x)
    mascara = pieza['reflejo'][cuadro][OPUESTO[lado] if espejo else lado]
    if espejo:
        mascara = ImageOps.mirror(mascara)
    m = np.array(mascara)[:, :, 0]
    fuerte, suave = m == 255, m == 128
    if f['forma'] == 'pozo':                      # lejos del pozo de la lámpara solo queda lo suave; más lejos, nada
        rx, ry = f['radio']
        d = ((x - f['x']) / rx) ** 2 + ((y - f['y']) / ry) ** 2
        if d > 4:
            return None
        if d > 1:
            suave, fuerte = suave | fuerte, np.zeros_like(fuerte)
    tono = np.array(TONO[f['tono']], np.float64) * f['fuerza']
    capa = np.zeros(m.shape + (3,), np.float64)
    capa[fuerte] = tono * FUERZA['fuerte']
    capa[suave] = tono * FUERZA['suave']
    return Image.fromarray(np.clip(capa, 0, 255).astype(np.uint8), 'RGB')


BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
PASO_EMISION = {'frio': (10, 16, 28), 'calido': (18, 13, 6)}


def fuente_de_objeto(emite, nivel, x, y, encima_de=None):
    """Un objeto que alumbra visto como fuente para los reflejos de sus vecinos (solo de noche)."""
    return dict(x=x, y=y, tono=emite['tono'], forma='pozo', radio=[emite['radio'][0] + 20, emite['radio'][1] + 20],
                fuerza=0.35 * nivel, muro='suelo', encima=encima_de)


def capa_emision(emite, nivel, x, y_piso, ancho, alto, momento, y_fuente=None):
    """Resplandor de un objeto que alumbra (el televisor), por escalones con tramado Bayer: un abanico en el piso que
    nace en `y_piso` (el frente del mueble) y se abre hacia la cámara, y un halo pequeño en el muro alrededor de
    `y_fuente`. `nivel` es el de su cuadro (0 a 3). De día la ventana manda y no se ve."""
    if momento != 'noche':
        return Image.new('RGB', (ancho, alto), (0, 0, 0))
    rx, ry = emite['radio']
    ys, xs = np.mgrid[0:alto, 0:ancho].astype(np.float64)
    dy = ys - y_piso
    abre = 0.55 + 0.45 * np.clip(dy / ry, 0, 1)                    # el abanico se ensancha al alejarse
    r = np.sqrt(((xs - x) / (rx * abre)) ** 2 + (dy / ry) ** 2)
    q = np.where(dy >= 0, np.clip(1 - r, 0, 1), 0) * nivel
    if y_fuente is not None:
        rh = np.sqrt(((xs - x) / (rx * 0.6)) ** 2 + ((ys - y_fuente) / (ry * 1.1)) ** 2)
        q = np.maximum(q, np.where(dy < 0, np.clip(1 - rh, 0, 1) * nivel * 0.5, 0))
    pasos = np.floor(q) + ((q - np.floor(q)) > BAYER[ys.astype(int) % 4, xs.astype(int) % 4])
    paso = np.array(PASO_EMISION[emite['tono']], np.float64)
    return Image.fromarray(np.clip(pasos[:, :, None] * paso, 0, 255).astype(np.uint8), 'RGB')
