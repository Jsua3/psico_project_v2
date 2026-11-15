"""Maqueta viva de la interfaz de diálogo: una página (lienzo 2D + DOM, sin dependencias) con todo incrustado.

La sala es la «Sala de escucha» del hospital por piezas (rama de P1); el texto es el del caso SIM-VBG-002, escenas
E06 y E07, tal cual está en el documento. El arte de la interfaz sale de `dialogo_arte`.

    python tools/escenarios/dialogo_maqueta.py [--p1 RUTA] [--caso RUTA]     # escribe maqueta-visual/dialogo/maqueta.html

`--p1` es el worktree con `tools/escenarios/piezas_*.py` y `biblioteca/piezas/` (por defecto, el hermano `../p1`).
`--caso` es el documento del caso (por defecto, el del worktree hermano `../k1`).
"""
import argparse
import base64
import io
import json
import os
import sys

import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import dialogo_arte as da  # noqa: E402

KIT = os.path.join(RAIZ, 'frontend', 'src', 'assets', 'characters', 'kit')
PLANTILLA = os.path.join(AQUI, 'dialogo_maqueta.html')
SALIDA = os.path.join(RAIZ, 'maqueta-visual', 'dialogo', 'maqueta.html')
MARCA = '/*__DATOS__*/'
CASO = os.path.join('backend_django', 'apps', 'simulation', 'data', 'cases', 'SIM-VBG-002.dsl.json')
ESTADOS = ('neutral', 'preocupada', 'triste', 'alegre', 'cautelosa', 'en-crisis')
JUGADORA = 'valentina'

# Dónde está cada quien en la sala de escucha de P1 (el documento trae posiciones del mapa heredado).
REPARTO = {
    'E06': {'hablante': 'psicologa-hospital', 'entrada': (486, 452), 'personas': {
        'abuela': (372, 386, 'right'), 'hermano-mayor': (318, 406, 'right'), 'hermano-menor': (300, 348, 'down'),
        'psicologa-hospital': (606, 390, 'left')}},
    'E07': {'hablante': 'abuela', 'entrada': (486, 452), 'personas': {
        'abuela': (372, 386, 'right'), 'hermano-mayor': (318, 406, 'right'), 'hermano-menor': (338, 366, 'right'),
        'medico-guardia': (566, 404, 'left')}},
}
BOND, ACTIVATION = ('WITHDRAWN', 'GUARDED', 'OPEN'), ('CALM', 'TENSE', 'CRISIS')
PERSONA_INICIAL = ('GUARDED', 'TENSE')
VINCULO = {'WITHDRAWN': 'retraída', 'GUARDED': 'cautelosa', 'OPEN': 'abierta'}
ACTIVACION = {'CALM': 'serena', 'TENSE': 'tensa', 'CRISIS': 'en crisis'}


def _png(im):
    """PNG sin pérdida; con paleta si la imagen RGB tiene 256 colores o menos."""
    buf = io.BytesIO()
    if im.mode == 'RGB':
        arr = np.array(im)
        colores, indices = np.unique(arr.reshape(-1, 3), axis=0, return_inverse=True)
        if len(colores) <= 256:
            im = Image.fromarray(indices.reshape(arr.shape[:2]).astype(np.uint8), 'P')
            im.putpalette(colores.astype(np.uint8).tobytes())
    im.save(buf, 'PNG', optimize=True)
    return buf.getvalue()


def uri(im_o_ruta):
    if isinstance(im_o_ruta, str):
        with open(im_o_ruta, 'rb') as f:
            datos = f.read()
    else:
        datos = _png(im_o_ruta)
    return 'data:image/png;base64,' + base64.b64encode(datos).decode('ascii')


def etiqueta_persona(bond, activation):
    """La frase del juego: «se muestra cautelosa y tensa» (`case_state.persona_label`)."""
    return f'se muestra {VINCULO[bond]} y {ACTIVACION[activation]}'


def paso_persona(persona, efecto):
    bond = BOND[max(0, min(2, BOND.index(persona[0]) + efecto.get('bond', 0)))]
    activation = ACTIVATION[max(0, min(2, ACTIVATION.index(persona[1]) + efecto.get('activation', 0)))]
    return bond, activation


def retratos(receta):
    """Hoja de 6 x 2 retratos de 32 x 32: arriba los ojos abiertos, abajo cerrados."""
    hoja = Image.new('RGBA', (32 * len(ESTADOS), 64), (0, 0, 0, 0))
    for n, estado in enumerate(ESTADOS):
        ruta = os.path.join(KIT, receta, f'portrait-{estado}.png')
        if not os.path.exists(ruta):
            ruta = os.path.join(KIT, receta, 'portrait-neutral.png')
        abierto = Image.open(ruta).convert('RGBA')
        hoja.alpha_composite(abierto, (n * 32, 0))
        hoja.alpha_composite(da.parpadeo(abierto), (n * 32, 32))
    return hoja


def leer_escena(doc, eid, cara_de):
    """La escena tal cual está en el documento: líneas, opciones (texto corto y largo), reacciones, notas y comentarios."""
    base = next(e for e in doc['escenas'] if e['id'] == eid)
    x = next(e for e in doc['x-siep']['escenas'] if e.get('id') == eid)
    reparto = REPARTO[eid]
    objetos = {o['clave']: o for o in x['mapa']['objetos']}
    largas = {o['id']: o['texto'] for o in base['decision']['opciones']}
    xop = {o['clave']: o for o in x['opciones']}
    personas = []
    for clave, (px, py, mira) in reparto['personas'].items():
        o = objetos[clave]
        personas.append(dict(clave=clave, nombre=o['etiqueta'], receta=o['metadatos']['recipeId'], x=px, y=py, dir=mira,
                             expresion=o['metadatos'].get('expresion', 'neutral')))
    dialogos = {}
    for g in x['mapa']['dialogos']:
        if g['clave'] not in reparto['personas']:
            continue
        opciones = []
        for n, e in enumerate(sorted(g['elecciones'], key=lambda q: q['orden'])):
            if not e.get('opcion'):
                continue
            o = xop[e['opcion']]
            r = o.get('reaccion') or {}
            opciones.append(dict(letra='ABCD'[len(opciones)], corto=e['texto'], largo=largas[o['id']],
                                 reaccion=dict(personaje=r.get('personaje') or reparto['hablante'], emocion=r.get('emocion', 'neutral'),
                                               gesto=r.get('gesto', ''), linea=r.get('linea', '')),
                                 nota=o.get('retroalimentacionInmediata', ''), efecto=o['efectos'].get('persona', {})))
        dialogos[g['clave']] = dict(hablante=g['hablante'], opciones=opciones,
                                    lineas=[dict(emocion=cara_de.get(li['emocion'], 'neutral'), texto=li['texto'])
                                            for li in sorted(g['lineas'], key=lambda q: q['orden'])])
    comentarios = [dict(personaje=c['personaje'], linea=c['linea'], emocion=c.get('emocion', 'neutral'), gesto=c.get('gesto', ''))
                   for c in x.get('comentarios', []) if 'cuando' not in c and c['personaje'] in reparto['personas']]
    return dict(id=eid, titulo=base['titulo'], objetivo=x.get('objetivo', ''), hablante=reparto['hablante'],
                entrada=list(reparto['entrada']), personas=personas, dialogos=dialogos, comentarios=comentarios)


def construir(p1, caso, destino=SALIDA):
    sys.path.insert(0, os.path.join(p1, 'tools', 'escenarios'))
    import piezas_geo as g
    import piezas_hospital as ph
    import piezas_sala as sl
    import vivo

    with open(caso, encoding='utf-8') as f:
        doc = json.load(f)
    with open(os.path.join(KIT, 'kit.json'), encoding='utf-8') as f:
        cara_de = json.load(f)['catalog']['emotionToPortrait']
    escenas = [leer_escena(doc, eid, cara_de) for eid in ('E06', 'E07')]

    sala = next(s for s in ph.SALAS if s['id'] == 'sala-escucha')
    muebles = ph.muebles_de(sala)
    imgs = {}

    def guardar(clave, im):
        if clave not in imgs:
            imgs[clave] = uri(im)
        return clave

    cuerpos_muebles = [sl.pl.cuerpo(m['x'], m['y'], m['im'].width, m['im'].height) for m in muebles]
    luz, capas = {}, None
    for esc in escenas:
        cuerpos = cuerpos_muebles + [sl.pl.cuerpo(p['x'], p['y'], 48, 72, persona=True) for p in esc['personas']]
        luz[esc['id']] = {}
        for momento in da.MOMENTOS:
            capas = sl.capas(sala, momento, cuerpos)
            luz[esc['id']][momento] = [guardar(f'a-{esc["id"]}-{momento}', capas['ambiente']),
                                       guardar(f'b-{esc["id"]}-{momento}', capas['brillo'])]
    dia, noche = sl.capas(sala, 'dia'), sl.capas(sala, 'noche')
    guardar('fondo', dia['fondo'].convert('RGB'))
    sprites = []
    for sd, sn in zip(dia['sprites'], noche['sprites']):
        tira = g.tira(sd['cuadros'])
        s = dict(img=guardar('s-' + sd['id'], tira), capa=sd['capa'], x=sd['x'], y=sd['y'], w=sd['cuadros'][0].width,
                 h=sd['cuadros'][0].height, n=len(sd['cuadros']), cuadro=dict(dia=sd['cuadro'], noche=sn['cuadro']), z=sd['z'])
        if sd.get('fps'):
            s['fps'] = sd['fps']
        sprites.append(s)
    lista_muebles = []
    for n, m in enumerate(muebles):
        mw, mh = m['im'].size
        lista_muebles.append(dict(img=guardar(f'm-{m["ref"]}-{n}', m['im']), x=m['x'] - mw // 2, y=m['y'] - mh, w=mw, h=mh, z=m['y'],
                                  s=[m['x'] + 1, m['y'] - 3, mw / 2 + 3, max(3, min(9, mw // 7))],
                                  caja=[m['x'] - mw // 2 + 2, m['y'] - min(mh, 20), m['x'] + mw // 2 - 2, m['y'] + 2]))

    recetas = sorted({p['receta'] for e in escenas for p in e['personas']})
    for receta in recetas + [JUGADORA, 'supervisor-clinico']:
        imgs['idle-' + receta] = uri(os.path.join(KIT, receta, 'idle.png'))
        guardar('cara-' + receta, retratos(receta))
    imgs['walk-' + JUGADORA] = uri(os.path.join(KIT, JUGADORA, 'walk.png'))
    guardar('emotes', vivo.emotes())
    for momento in da.MOMENTOS:
        for nombre in da.MARCOS:
            guardar(f'marco-{nombre}-{momento}', da.marco(nombre, momento))
        for nombre in da.TRAMAS:
            guardar(f'trama-{nombre}-{momento}', da.trama(nombre, momento))
        guardar(f'cursor-{momento}', da.cursor(momento))
        guardar(f'seguir-{momento}', da.seguir(momento))
    guardar('cola', da.cola_burbuja())
    guardar('sombra', da.sombra_de_contacto())
    for estado in da.PULSOS:
        guardar('pulso-' + estado, da.pulso(estado))

    etiquetas = {f'{b}/{a}': etiqueta_persona(b, a) for b in BOND for a in ACTIVATION}
    x0, y0, w, h = noche['zona']
    datos = dict(
        caso=dict(id=doc['caso']['id'], titulo=doc['caso']['titulo']),
        sala=dict(nombre='Hospital · ' + sala['nombre'], w=noche['ancho'], h=noche['alto'], zona=[x0, y0, w, h]),
        imgs=imgs, luz=luz, sprites=sprites, muebles=lista_muebles, escenas=escenas, estados=list(ESTADOS),
        emotes=list(vivo.ORDEN_EMOTES), jugadora=JUGADORA,
        persona=dict(inicial=list(PERSONA_INICIAL), etiquetas=etiquetas, bond=list(BOND), activation=list(ACTIVATION)),
        luzColor={m: '#%02x%02x%02x' % da.LUZ[m] for m in da.MOMENTOS})
    with open(PLANTILLA, encoding='utf-8') as f:
        plantilla = f.read()
    if MARCA not in plantilla:
        raise SystemExit('La plantilla no tiene la marca ' + MARCA)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, 'w', encoding='utf-8', newline='') as f:
        f.write(plantilla.replace(MARCA, json.dumps(datos, ensure_ascii=False, separators=(',', ':'))))
    return dict(imagenes=len(imgs), kb=os.path.getsize(destino) // 1024, avisos=capas['avisos'],
                opciones={e['id']: [len(d['opciones']) for d in e['dialogos'].values() if d['opciones']] for e in escenas})


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--p1', default=os.path.normpath(os.path.join(RAIZ, '..', 'p1')))
    ap.add_argument('--caso', default=os.path.normpath(os.path.join(RAIZ, '..', 'k1', CASO)))
    ap.add_argument('--destino', default=SALIDA)
    a = ap.parse_args()
    print(construir(a.p1, a.caso, a.destino))
