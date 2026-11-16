"""Página jugable de los objetos v2 (bloque O1): la Casa · Sala de P1 con sus objetos nuevos, de día y de noche.

    python tools/escenarios/objetos_vista.py     # escribe maqueta-visual/objetos/vista.html (todo incrustado)

La página compone como el juego: sala sin luz → sombras de contacto → muebles, objetos y personas por profundidad →
multiplicar ambiente → sumar brillo → lo que emite vuelve a su color → reflejos (se suman) → resplandor del
televisor → destello en lo que falta por revisar. Valentina camina con flechas, WASD o un toque; E, Enter o un toque
sobre el objeto lo revisa.
"""
import base64
import hashlib
import io
import json
import os
import sys

import numpy as np
from PIL import Image, ImageOps

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import objetos_comun as oc  # noqa: E402
import objetos_pixel as op  # noqa: E402
import objetos_reflejo as orf  # noqa: E402
import objetos_sala as os_  # noqa: E402
import piezas_geo as g  # noqa: E402
import piezas_luz as pl  # noqa: E402
import piezas_sala as sl  # noqa: E402

SALIDA = os.path.join(RAIZ, 'maqueta-visual', 'objetos', 'vista.html')
PLANTILLA = os.path.join(AQUI, 'objetos_vista.html')
MARCA = '/*__DATOS__*/'
QUIETA = dict(receta='sobreviviente', x=560, y=360, vista='left')
ALUMNA = dict(receta='valentina', x=470, y=372, vista='right')
INTERACTIVOS = {
    'televisor': dict(nombre='Televisor encendido', accion='Mirar', texto='Nadie lo está viendo.'),
    'portarretrato': dict(nombre='Portarretrato', accion='Mirar', texto='Una foto familiar. Falta alguien en el marco.'),
    'mueble-tv': dict(nombre='Mueble del televisor', accion='Abrir el cajón', texto='Papeles doblados y un sobre sin abrir.'),
}


def _png(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


class Imagenes:
    def __init__(self):
        self.todas = {}

    def __call__(self, im):
        clave = 'i' + hashlib.md5(im.tobytes() + str(im.size).encode() + im.mode.encode()).hexdigest()[:10]
        self.todas.setdefault(clave, _png(im))
        return clave


def _solo(im, mascara):
    """El sprite solo donde la máscara es blanca (lo que emite luz propia)."""
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), mascara.getchannel('A'))
    return out


def exportar():
    img = Imagenes()
    cosas = os_.colocadas()
    sala = os_.SALA
    emisores = [(c, c['pieza']['ficha']['emite']) for c in cosas if c['pieza']['ficha'].get('emite')]
    datos = dict(ancho=sala['estructura']['ancho'], alto=g.ALTO, zona=list(g.zona_caminable(sala['encuadre'], sala['estructura']['ancho'])),
                 momentos={}, cosas=[], quieta={}, alumna={}, destello=img(op.tira(oc.destello())))
    for momento in ('dia', 'noche'):
        base = sl.componer_sala(sala, momento, con_luz=False).convert('RGBA')
        base = Image.alpha_composite(base, os_.sombras_de_contacto(base.size, cosas, [QUIETA]))
        ambiente, brillo = pl.calcular_luz(sala, momento, (), os_.cuerpos(cosas, [QUIETA]))
        datos['momentos'][momento] = dict(base=img(base.convert('RGB')), ambiente=img(ambiente), brillo=img(brillo))
    for c in cosas:
        p, ficha = c['pieza'], c['pieza']['ficha']
        cuadros = [ImageOps.mirror(q) if c['espejo'] else q for q in p['cuadros']]
        d = dict(ref=c['ref'], x=c['x'], y=c['y'], x0=c['x0'], y0=c['y0'], w=p['ancho'], h=p['alto'], z=c['y'] + (1 if c['sobre'] else 0),
                 n=len(cuadros), tira=img(op.tira(cuadros)), anim=ficha.get('animaciones') or dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True)))
        h = ficha.get('huella')
        if h and not c['sobre']:
            d['caja'] = [c['x'] - h['ancho'] // 2, c['y'] - h['fondo'] - 2, c['x'] + h['ancho'] // 2, c['y'] + 2]
        if p['emisivo']:
            em = [ImageOps.mirror(m) if c['espejo'] else m for m in p['emisivo']]
            d['emisivo'] = img(op.tira([_solo(q, m) for q, m in zip(cuadros, em)]))
        if p['reflejo']:
            d['reflejo'] = {}
            for momento in ('dia', 'noche'):
                capas = []
                for n in range(len(cuadros)):
                    extra = [orf.fuente_de_objeto(e, 3, q['x'], q['y']) for q, e in emisores if q is not c]
                    for f in extra:
                        f['encima'] = c['ref'] == 'mueble-tv'
                    capa = orf.capa_reflejo(p, n, c['x'], c['y'], sala, momento, c['espejo'], extra)
                    capas.append((capa or Image.new('RGB', (p['ancho'], p['alto']))).convert('RGBA'))
                tira = op.tira(capas)
                if np.array(tira)[..., :3].any():
                    d['reflejo'][momento] = img(tira)
        if ficha.get('emite'):
            e = ficha['emite']
            capas = {}
            for nivel in sorted(set(e['niveles'])):
                capa = orf.capa_emision(e, nivel, c['x'], c['y'] + 1, datos['ancho'], datos['alto'], 'noche', y_fuente=c['y0'] + p['alto'] // 2)
                tapa = Image.new('L', capa.size, 255)
                tapa.paste(0, (c['x0'], c['y0']), cuadros[0].getchannel('A'))
                capa = Image.composite(capa, Image.new('RGB', capa.size), tapa)
                caja = capa.getbbox()
                if caja:
                    capas[str(nivel)] = dict(img=img(capa.crop(caja)), x=caja[0], y=caja[1])
            d['emite'] = dict(niveles=e['niveles'], capas=capas)
        if c['ref'] in INTERACTIVOS:
            d['interactivo'] = INTERACTIVOS[c['ref']]
        datos['cosas'].append(d)
    for clave, q in (('quieta', QUIETA), ('alumna', ALUMNA)):
        hoja = dict(x=q['x'], y=q['y'], vista=q['vista'], idle=img(Image.open(os.path.join(os_.KIT, q['receta'], 'idle.png')).convert('RGBA')))
        if clave == 'alumna':
            hoja['walk'] = img(Image.open(os.path.join(os_.KIT, q['receta'], 'walk.png')).convert('RGBA'))
        datos[clave] = hoja
    datos['imagenes'] = img.todas
    return datos


def main():
    datos = exportar()
    with open(PLANTILLA, encoding='utf-8') as f:
        html = f.read()
    html = html.replace(MARCA, 'const DATOS = ' + json.dumps(datos, ensure_ascii=False) + ';')
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print(SALIDA, round(len(html) / 1e6, 2), 'MB')


if __name__ == '__main__':
    main()
