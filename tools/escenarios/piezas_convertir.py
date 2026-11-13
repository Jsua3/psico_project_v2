"""Convierte las 28 salas de la biblioteca (una imagen fija por sala) a `estructura` (salas por piezas).

Lee `biblioteca/escenarios/<lugar>/escenario.json` y la paleta de cada sala (`arte_<lugar>.SALAS`) y deduce:

- acabados: el piso del catálogo más parecido (la alfombra, que no está, queda como vinilo con un tapete grande),
  el acabado del muro (ladrillo, azulejo, paneles, zócalo alto o pintura) y la paleta del lugar;
- piezas: ventanas, cuadros, relojes, cruces, tableros, espejos y lámparas, a partir de la decoración pintada;
- puertas: muro, posición y modelo de cada puerta. Si una salida daba a un costado sin muro, la sala gana ese
  muro (toda puerta es parte de un muro) y la salida pasa a ser un paso abierto;
- lo que no se pudo convertir queda escrito en `perdido` (lo propio de la sala: escalera, mesón, reja…).

Las piezas que caerían encima de una puerta o de otra pieza se corren a lo largo del muro; si no caben, se quitan.

    python tools/escenarios/piezas_convertir.py   # escribe biblioteca/piezas/lugares/<lugar>.json y
                                                  # maqueta-visual/piezas/antes-despues-<lugar>.png
"""
import copy
import importlib
import json
import os
import sys

from PIL import Image, ImageChops, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import hoja_contacto as hc  # noqa: E402
import piezas_catalogo as pc  # noqa: E402
import piezas_geo as g  # noqa: E402
import piezas_luz as pl  # noqa: E402
import piezas_muro as pm  # noqa: E402
import piezas_puertas as pp  # noqa: E402
import piezas_sala as sl  # noqa: E402
import piezas_superficies as ps  # noqa: E402

LUGARES = {'universidad': 'arte_universidad', 'casa': 'arte_casa', 'comisaria': 'arte_comisaria'}
PUERTA = {'casa': 'madera', 'universidad': 'madera-ventanilla', 'comisaria': 'metalica'}
LAMPARA = {'casa': 'colgante', 'universidad': 'tubo', 'comisaria': 'tubo'}
ENCUADRE = {v: k for k, v in g.ENCUADRES.items()}
ANCHO = 960
SALIDA = os.path.join(RAIZ, 'maqueta-visual', 'piezas')


def _rejilla(v):
    return int(round(v / g.REJILLA)) * g.REJILLA


def _distancia(a, b):
    return sum((a[i] - b[i]) ** 2 for i in range(3))


def _muro_de(puerta):
    if puerta['y'] <= g.SEAM + 10:
        return 'fondo'
    if puerta['y'] >= 480:
        return 'camara'
    return 'izquierda' if puerta['x'] < ANCHO / 2 else 'derecha'


def _franja(tipo, modelo):
    if tipo == 'puerta':
        return 0, pp.apoyo(modelo, 'frente')[1]
    cuadro, punto = pm.cuadros(tipo, modelo)[0], pm.apoyo(tipo, modelo)
    return punto[1] - cuadro.height, punto[1]


def _ocupa(tipo, modelo):
    return pp.MODELOS[modelo]['ocupa'] if tipo == 'puerta' else pm.PIEZAS[(tipo, modelo)]['ocupa']


def _chocan(a, b):
    if a['muro'] != b['muro']:
        return False
    fa, fb = _franja(a['tipo'], a['modelo']), _franja(b['tipo'], b['modelo'])
    if fa[1] <= fb[0] or fb[1] <= fa[0]:
        return False
    holgura = 8 if 'puerta' in (a['tipo'], b['tipo']) else 0
    return abs(a['pos'] - b['pos']) < (_ocupa(a['tipo'], a['modelo']) + _ocupa(b['tipo'], b['modelo'])) / 2 + holgura


def _acomodar(pieza, puestas, largo):
    """Corre la pieza por el muro hasta que no estorbe; None si no cabe."""
    medio = _ocupa(pieza['tipo'], pieza['modelo']) // 2
    for paso in range(0, 240, g.REJILLA):
        for pos in ((pieza['pos'],) if paso == 0 else (pieza['pos'] + paso, pieza['pos'] - paso)):
            if not medio <= pos <= largo - medio:
                continue
            candidata = dict(pieza, pos=pos)
            if not any(_chocan(candidata, otra) for otra in puestas):
                return candidata
    return None


def _ventana(lugar, tipo, ancho, alto):
    if tipo == 'persiana':
        return 'persiana'
    if ancho >= 130:
        return 'ventanal'
    if alto <= 40:
        return 'alta'
    return 'corrediza' if lugar == 'casa' else 'persiana'


def _acabados(lugar, p):
    perdido = []
    tipo = p['piso']
    if tipo not in ps.PISOS:
        perdido.append(f'piso de {tipo}: queda como vinilo con un tapete')
        tipo = 'vinilo'
    # La variante se elige por tono (qué tan gris o qué tan vivo) y por claridad, no por distancia cruda de color.
    tono = lambda c: (2 * (max(c) - min(c)), sum(c) // 3)  # noqa: E731
    variante = min(ps.PISOS[tipo], key=lambda v: sum(abs(x - y) for x, y in zip(tono(ps.PISOS[tipo][v]['A']), tono(p['pisoA']))))
    muro = ('ladrillo' if p.get('ladrillo') else 'azulejo' if p.get('azulejo') else 'paneles' if p.get('paneles')
            else 'zocalo-alto' if p.get('baja') else 'pintura')
    for clave, nombre in (('franja', 'franja de color en el muro'), ('vetas', 'vetas del muro'), ('pared_alta', 'franja alta del muro')):
        if p.get(clave):
            perdido.append(nombre)
    # La paleta es la del catálogo cuyo muro más se parece al de la sala: casi siempre la de su lugar, pero una
    # cafetería de muros cálidos dentro de la universidad conserva su carácter.
    paleta = min(ps.PALETAS, key=lambda n: _distancia(ps.PALETAS[n]['pared'], p['pared']) - (900 if n == lugar else 0))
    return dict(piso=tipo, variante=variante, muro=muro, paleta=paleta), perdido


def convertir_lugar(lugar):
    """El lugar en esquema 3: cada sala con `estructura` y sus puertas con muro, pos y modelo."""
    modulo = importlib.import_module(LUGARES[lugar])
    with open(os.path.join(RAIZ, 'biblioteca', 'escenarios', lugar, 'escenario.json'), encoding='utf-8') as f:
        escenario = json.load(f)
    paletas = modulo.SALAS
    propios = getattr(modulo, 'PROPIOS', {}) or {}
    salas = {s['id']: s for s in escenario['salas']}

    # Primera pasada: qué muros necesita cada sala y de qué modelo es cada par de puertas.
    encuadres, abiertos = {}, set()
    for s in escenario['salas']:
        izq, der = g.laterales(s['encuadre'])
        for q in s['puertas']:
            muro = _muro_de(q)
            if (muro == 'izquierda' and not izq) or (muro == 'derecha' and not der):
                abiertos.add(frozenset((s['id'], q['hacia'])))
            izq, der = izq or muro == 'izquierda', der or muro == 'derecha'
        encuadres[s['id']] = ENCUADRE[(izq, der)]

    def modelo_de(a, b):
        par = frozenset((a, b))
        if par in abiertos:
            return 'paso'
        pa, pb = paletas[a], paletas.get(b, {})
        if pa.get('puerta_vidrio') or pb.get('puerta_vidrio'):
            return 'vidrio'
        if (pa.get('cielo') or pb.get('cielo')) and lugar != 'casa':
            return 'vidrio'
        return PUERTA[lugar]

    convertidas = []
    for s in escenario['salas']:
        p = paletas[s['id']]
        encuadre = encuadres[s['id']]
        xl, xr = g.limites(encuadre, ANCHO)
        acabados, perdido = _acabados(lugar, p)
        if encuadre != s['encuadre']:
            perdido.append(f'encuadre {s["encuadre"]}: pasa a {encuadre} para que la salida lateral tenga muro')
        if propios.get(s['id']):
            perdido.append('lo propio de la sala queda como una capa fija: no se puede mover ni cambia con la paleta')

        puertas, puestas = [], []
        for q in s['puertas']:
            muro = _muro_de(q)
            modelo = modelo_de(s['id'], q['hacia'])
            largo, medio = g.largo_muro(muro, encuadre, ANCHO), pp.MODELOS[modelo]['ocupa'] // 2
            if muro == 'fondo':
                pos = q['x'] - xl
            elif muro == 'camara':
                pos = ANCHO / 2 + (q['x'] - ANCHO / 2) * 16 / 19 - xl
            else:
                pos = q['y'] - g.SEAM
            pos = min(max(_rejilla(pos), _rejilla(medio + 8)), _rejilla(largo - medio - 8))
            vuelta = next((r for r in salas.get(q['hacia'], {}).get('puertas', []) if r['hacia'] == s['id']), None)
            puerta = dict(id=q['id'], hacia=q['hacia'], muro=muro, pos=pos, modelo=modelo, etiqueta=q.get('etiqueta', ''))
            if vuelta:
                puerta['par'] = vuelta['id']
            else:
                puerta['sentidoUnico'] = True
            puertas.append(puerta)
            puestas.append(dict(tipo='puerta', modelo=modelo, muro=muro, pos=pos))

        crudas = []
        for n, deco in enumerate(p.get('deco', [])):
            tipo, x = deco[0], deco[1]
            if tipo in ('ventana', 'persiana'):
                crudas.append(dict(tipo='ventana', modelo=_ventana(lugar, tipo, deco[3], deco[4]), x=x))
            elif tipo in ('cuadro', 'reloj', 'cruz', 'espejo'):
                crudas.append(dict(tipo=tipo, modelo=tipo, x=x))
            elif tipo == 'menu':
                crudas.append(dict(tipo='tablero', modelo='tablero', x=x))
            elif tipo == 'placa':
                crudas.append(dict(tipo='senal', modelo='senal', x=x))
            elif tipo == 'colgante':
                crudas.append(dict(tipo='lampara', modelo='colgante', x=x))
        if not p.get('cielo'):
            luces = [x for x, _ in p.get('luces', [])] or [ANCHO // 2]
            if not any(c['tipo'] == 'lampara' for c in crudas):
                crudas += [dict(tipo='lampara', modelo=LAMPARA[lugar], x=x) for x in luces]
        crudas.sort(key=lambda c: (c['tipo'] != 'ventana', c['tipo'] == 'lampara'))
        piezas, cuenta = [], {}
        largo = g.largo_muro('fondo', encuadre, ANCHO)
        for c in crudas:
            pieza = _acomodar(dict(tipo=c['tipo'], modelo=c['modelo'], muro='fondo', pos=_rejilla(c['x'] - xl)), puestas, largo)
            if pieza is None:
                perdido.append(f'{pm.PIEZAS[(c["tipo"], c["modelo"])]["nombre"]}: no cabe en el muro del fondo')
                continue
            cuenta[c['modelo']] = cuenta.get(c['modelo'], 0) + 1
            pieza['id'] = c['modelo'] + '-' + str(cuenta[c['modelo']])
            piezas.append(pieza)
            puestas.append(pieza)

        estructura = dict(ancho=ANCHO, momento='dia', acabados=acabados, piezas=piezas)
        if p.get('cielo'):
            estructura['exterior'] = True
        if propios.get(s['id']):
            estructura['propios'] = [dict(ref=f'{lugar}/{s["id"]}', ruta=f'piezas/propios/{lugar}-{s["id"]}.png')]
        if p['piso'] not in ps.PISOS:
            x0, y0, w, h = g.zona_caminable(encuadre, ANCHO)
            estructura['tapetes'] = [dict(caja=[x0 + 70, x0 + w - 70, y0 + 34, y0 + h - 30],
                                          colores=dict(oscuro=ps.osc(p['pisoA'], 0.62), borde=ps.osc(p['pisoA'], 0.78), ribete=p.get('pisoB', p['pisoA']),
                                                       campo=p['pisoA'], motivo=ps.mezcla(p['pisoA'], (255, 244, 220), 0.22)))]
        sala = {k: v for k, v in s.items() if k not in ('fondo', 'puertas', 'encuadre')}
        sala.update(encuadre=encuadre, estructura=estructura, puertas=puertas, convertidaDe=f'escenarios/{lugar}/escenario.json')
        if perdido:
            sala['perdido'] = perdido
        convertidas.append(sala)
    return dict(esquema=3, id=escenario['id'], nombre=escenario['nombre'], descripcion=escenario.get('descripcion', ''), salas=convertidas)


def capas_propias(lugar):
    """{ruta: imagen RGBA de 960 × 528} con lo que cada sala del lugar dibuja a mano (escalera, mesón, reja…)."""
    modulo = importlib.import_module(LUGARES[lugar])
    with open(os.path.join(RAIZ, 'biblioteca', 'escenarios', lugar, 'escenario.json'), encoding='utf-8') as f:
        escenario = json.load(f)
    capas = {}
    for s in escenario['salas']:
        propio = (getattr(modulo, 'PROPIOS', {}) or {}).get(s['id'])
        if propio:
            im = Image.new('RGBA', (ANCHO, g.ALTO), (0, 0, 0, 0))
            propio(ImageDraw.Draw(im), s, modulo.SALAS[s['id']])
            capas[f'piezas/propios/{lugar}-{s["id"]}.png'] = g.terminar(im, 256, contorno=False)
    return capas


def _json(datos):
    """Las tuplas de color pasan a listas, como quedarán al leer el archivo."""
    return json.loads(pc.serializar(datos))


def antes_y_despues(lugar, convertido):
    """Hoja de contacto: a la izquierda la sala de hoy, a la derecha la misma armada por piezas, con su luz de día."""
    base = os.path.join(RAIZ, 'biblioteca', 'escenarios', lugar)
    with open(os.path.join(base, 'escenario.json'), encoding='utf-8') as f:
        escenario = json.load(f)
    temporal = os.path.join(SALIDA, 'convertidas', lugar)
    os.makedirs(temporal, exist_ok=True)
    originales = {s['id']: s for s in escenario['salas']}
    hoja = Image.new('RGB', (2 * ANCHO + 36, len(convertido['salas']) * (g.ALTO + 30) + 8), (24, 26, 34))
    d = ImageDraw.Draw(hoja)
    for n, sala in enumerate(convertido['salas']):
        original = originales[sala['id']]
        y = 8 + n * (g.ALTO + 30)
        antes = hc.componer_sala(base, original, escenario, hc.KIT_POR_DEFECTO).convert('RGB')
        fondo = sl.componer_sala(sala, 'dia', con_luz=False)
        ruta = os.path.join(temporal, sala['id'] + '-fondo.png')
        fondo.save(ruta)
        relativa = os.path.relpath(ruta, base).replace(os.sep, '/')
        despues = hc.componer_sala(base, dict(original, fondo=relativa), escenario, hc.KIT_POR_DEFECTO).convert('RGB')
        ambiente, brillo = pl.calcular_luz(sala, 'dia')
        despues = ImageChops.add(ImageChops.multiply(despues, ambiente), brillo)
        d.text((12, y + 6), f'{sala["nombre"]} · antes ({original["encuadre"]})', fill=(206, 200, 188))
        d.text((ANCHO + 24, y + 6), f'{sala["nombre"]} · por piezas ({sala["encuadre"]})', fill=(206, 200, 188))
        hoja.paste(antes, (12, y + 24))
        hoja.paste(despues, (ANCHO + 24, y + 24))
    return hoja


def escribir():
    resumen = {}
    carpeta = os.path.join(RAIZ, 'biblioteca', 'piezas', 'lugares')
    os.makedirs(carpeta, exist_ok=True)
    os.makedirs(SALIDA, exist_ok=True)
    for lugar in LUGARES:
        for ruta, im in capas_propias(lugar).items():
            archivo = os.path.join(RAIZ, 'biblioteca', *ruta.split('/'))
            os.makedirs(os.path.dirname(archivo), exist_ok=True)
            im.save(archivo, 'PNG', optimize=True)
        convertido = _json(convertir_lugar(lugar))
        with open(os.path.join(carpeta, lugar + '.json'), 'w', encoding='utf-8', newline='') as f:
            f.write(pc.serializar(convertido))
        antes_y_despues(lugar, copy.deepcopy(convertido)).save(os.path.join(SALIDA, f'antes-despues-{lugar}.png'))
        resumen[lugar] = {s['id']: s.get('perdido', []) for s in convertido['salas']}
    pc.escribir()
    return resumen


if __name__ == '__main__':
    for lugar, salas in escribir().items():
        print(lugar + ':', len(salas), 'salas')
        for sala, perdido in salas.items():
            if perdido:
                print('  ', sala + ':', '; '.join(perdido))
