"""Casos compartidos: los hallazgos siempre los producen las reglas del servidor."""
import json
from copy import deepcopy
from pathlib import Path

from apps.biblioteca.services.catalogo_piezas import Catalogo, PiezaCatalogo
from apps.simulation.casedef import catalogo as registro, rules_estructura as reglas

RAIZ = Path(__file__).resolve().parents[4]
JSON = RAIZ / 'biblioteca/esquema/reglas-salas-casos.json'
TS = RAIZ / 'frontend/src/app/features/autoria/modelo/reglas-salas-casos.fixture.ts'


def catalogo():
    return {'anchos': [960, 1200, 1440, 1680, 1920], 'piezas': {
        'cuadro/a': {'muros': ['fondo'], 'ocupa': 100, 'franja': [20, 100]},
        'tubo/a': {'muros': ['fondo'], 'ocupa': 100, 'franja': [200, 240]},
        'tubo/alto': {'muros': ['fondo'], 'ocupa': 100, 'franja': [210, 240]},
        'suelo/a': {'muros': ['suelo'], 'ocupa': 20, 'franja': [0, 20]},
        'puerta/a': {'muros': ['fondo', 'izquierda', 'derecha'], 'ocupa': 100, 'franja': [0, 200]},
    }, 'clavesDePisos': ['vinilo-a'], 'muros': ['liso/blanco'], 'propios': ['propio.png'], 'tapetes': ['tapete.png']}


def casos():
    def sala(clave='a', ancho=1440, encuadre='tres-paredes'):
        return {'clave': clave, 'mapa': {'clave': clave, 'ancho': ancho, 'alto': 528,
            'aparicion': {'x': 400, 'y': 300}, 'ambiente': {'encuadre': encuadre},
            'estructura': {'ancho': ancho, 'acabados': {'piso': 'vinilo', 'muro': 'liso', 'paleta': 'blanco'}, 'piezas': []},
            'colisiones': [], 'objetos': []}}
    def pieza(pos, modelo='a', tipo='cuadro', muro='fondo'):
        return {'tipo': tipo, 'modelo': modelo, 'muro': muro, 'pos': pos}
    def puerta(destino='b', **meta):
        return {'clave': 'puerta', 'tipo': 'EXIT', 'x': 400, 'y': 300,
                'metadatos': {'modelo': 'a', 'muro': 'fondo', 'pos': 400, 'targetNodeKey': destino, **meta}}
    resultado = []
    def agregar(nombre, escenas, **extras):
        resultado.append({'nombre': nombre, 'documento': {'x-siep': {'escenas': deepcopy(escenas)}}, **extras})
    base = sala()
    agregar('sala válida', [base])
    for nombre, p in [('borde exacto', pieza(50)), ('borde fuera', pieza(49)),
                      ('modelo en muro no admitido', pieza(100, muro='izquierda')),
                      ('suelo fuera', {'tipo': 'suelo', 'modelo': 'a', 'x': 0, 'y': 0}),
                      ('piezas se tocan', [pieza(100), pieza(200)]),
                      ('piezas chocan', [pieza(100), pieza(199)])]:
        s = sala(); s['mapa']['estructura']['piezas'] = p if isinstance(p, list) else [p]; agregar(nombre, [s])
    s = sala(ancho=960, encuadre='una-pared'); s['mapa']['estructura']['piezas'] = [pieza(100, muro='izquierda')]; agregar('muro ausente', [s])
    s = sala(); p = puerta(sentidoUnico=True); del p['metadatos']['muro']; s['mapa']['objetos'] = [p]; agregar('puerta sin muro', [s, sala('b')])
    for nombre, pos, tipo in [('holgura de puerta', 508, 'cuadro'), ('holgura insuficiente', 507, 'cuadro'), ('tubo toca franja', 400, 'tubo')]:
        s = sala(); s['mapa']['estructura']['piezas'] = [pieza(pos, tipo=tipo)]; s['mapa']['objetos'] = [puerta(sentidoUnico=True)]; agregar(nombre, [s, sala('b')])
    s = sala(); s['mapa']['estructura']['piezas'] = [pieza(400, modelo='alto', tipo='tubo')]; s['mapa']['objetos'] = [puerta(sentidoUnico=True)]; agregar('tubo separado de puerta', [s, sala('b')])
    for nombre, destino, meta, regreso in [('destino ausente', 'no', {}, None), ('sin regreso', 'b', {}, None),
            ('sentido único', 'b', {'sentidoUnico': True}, None), ('par ausente', 'b', {'par': 'otra'}, None),
            ('par no vuelve', 'b', {'par': 'puerta'}, puerta('b', sentidoUnico=True)),
            ('regreso misma sala', 'b', {}, puerta('c', sentidoUnico=True))]:
        a = sala(); b = sala('b'); c = sala('c'); a['mapa']['ambiente']['salaId'] = 's'; c['mapa']['ambiente']['salaId'] = 's'
        a['mapa']['objetos'] = [puerta(destino, **meta)]; b['mapa']['objetos'] = [regreso] if regreso else []
        agregar(nombre, [a, b, c])
    for nombre, x, mueble in [('llegada libre', 400, False), ('llegada sobre mueble', 400, True), ('pie fuera', 5, False)]:
        a = sala(); b = sala('b'); a['mapa']['objetos'] = [puerta(entryX=x, entryY=300, sentidoUnico=True)]
        if mueble: b['mapa']['objetos'] = [{'tipo': 'PROP', 'colision': True, 'x': 390, 'y': 280, 'ancho': 30, 'alto': 30}]
        agregar(nombre, [a, b])
    for nombre, colisiones, objetos in [('persona accesible', [], [{'tipo': 'PERSON', 'x': 500, 'y': 300}]),
            ('persona tras muebles', [{'x': 700, 'y': 0, 'ancho': 30, 'alto': 528}], [{'tipo': 'PERSON', 'x': 1000, 'y': 300}]),
            ('aparición sobre pared', [{'x': 390, 'y': 280, 'ancho': 30, 'alto': 30}], [])]:
        s = sala(); s['mapa']['colisiones'] = colisiones; s['mapa']['objetos'] = objetos; agregar(nombre, [s])
    s = sala(ancho=1920); s['mapa']['objetos'] = [{'tipo': 'PERSON', 'x': 1800, 'y': 300}]; agregar('sala ancha accesible', [s])
    s = sala(); s['mapa']['estructura']['ancho'] = 1000; s['mapa']['estructura']['acabados'] = {'piso': 'otro', 'variante': 'z', 'muro': 'otro', 'paleta': 'z'}; s['mapa']['objetos'] = [puerta(modelo='desconocida', sentidoUnico=True)]; agregar('catálogo desconocido', [s, sala('b')])
    agregar('sin catálogo', [base], sinCatalogo=True)
    # OCL-19: el trayecto de una persona (con la zona caminable de 1440: x 134…1306, pies en y 252…486).
    def persona(x=300, y=300, puntos=((600, 300), (600, 400)), modo='circuito', apoyo='pies'):
        meta = {'movimiento': {'tipo': 'ruta', 'modo': modo, 'puntos': [{'x': px, 'y': py} for px, py in puntos]}}
        if apoyo:
            meta['apoyo'] = apoyo
        return {'clave': 'caminante', 'etiqueta': 'Caminante', 'tipo': 'PERSON', 'x': x, 'y': y, 'metadatos': meta}
    mueble = {'x': 440, 'y': 250, 'ancho': 30, 'alto': 100}
    en_diagonal = {'x': 440, 'y': 365, 'ancho': 20, 'alto': 20}
    bajo_la_linea = {'x': 440, 'y': 302, 'ancho': 30, 'alto': 8}
    pausa_larga = persona()
    pausa_larga['metadatos']['movimiento']['pausaMs'] = 10001
    for nombre, objetos, colisiones in [
            ('trayecto libre', [persona()], []),
            ('trayecto atraviesa mueble', [persona()], [mueble]),
            ('punto sobre mueble', [persona(puntos=((455, 300), (600, 400)))], [mueble]),
            ('trayecto tapa puerta', [persona(), puerta('a', sentidoUnico=True)], []),
            ('regreso del circuito choca', [persona(puntos=((600, 300), (600, 450)))], [en_diagonal]),
            ('ida y vuelta sin regreso', [persona(puntos=((600, 300), (600, 450)), modo='ida-y-vuelta')], [en_diagonal]),
            ('otra persona en medio', [persona(), {'clave': 'otra', 'tipo': 'PERSON', 'x': 450, 'y': 300, 'metadatos': {'apoyo': 'pies'}}], []),
            ('partida fuera de la zona', [persona(y=200)], []),
            ('apoyo en los pies', [persona()], [bajo_la_linea]),
            ('apoyo de antes', [persona(apoyo=None)], [bajo_la_linea]),
            ('trayecto mal formado', [persona(puntos=((600, 300),))], []),
            ('pausa fuera de rango', [pausa_larga], []),
            ('trayecto sin posición', [persona(x=None)], [])]:
        s = sala(); s['mapa']['objetos'] = objetos; s['mapa']['colisiones'] = colisiones; agregar(nombre, [s])
    s = sala(); del s['mapa']['estructura']; s['mapa']['objetos'] = [persona()]; s['mapa']['colisiones'] = [mueble]
    agregar('trayecto en sala sin estructura', [s])
    return resultado


def generar():
    datos = catalogo()
    cat = Catalogo(tuple(datos['anchos']), {}, {k: PiezaCatalogo(k, frozenset(v['muros']), v['ocupa'], tuple(v['franja'])) for k, v in datos['piezas'].items()}, frozenset({'vinilo'}), frozenset(datos['clavesDePisos']), frozenset(datos['muros']), frozenset(datos['propios']), frozenset(datos['tapetes']))
    funciones = [reglas.ocl_13_piezas_sobre_un_muro_existente, reglas.ocl_14_piezas_sin_solaparse, reglas.ocl_15_puertas_con_regreso, reglas.ocl_16_llegada_caminable, reglas.ocl_17_todo_se_alcanza, reglas.ocl_18_todo_del_catalogo, reglas.ocl_19_trayectos_caminables]
    anterior = registro._proveedor
    try:
        resultado = casos()
        for caso in resultado:
            registro.registrar(lambda: None if caso.get('sinCatalogo') else cat)
            caso['hallazgos'] = [{'regla': f'OCL-{i}', 'ruta': h.path, 'mensaje': h.message} for i, f in enumerate(funciones, 13) for h in f(caso['documento']).hallazgos]
        return {'catalogo': datos, 'casos': resultado}
    finally:
        registro.registrar(anterior)


def escribir():
    contenido = json.dumps(generar(), ensure_ascii=False, indent=1, sort_keys=True)
    JSON.write_text(contenido + '\n', encoding='utf-8')
    TS.write_text('// NO SE EDITA A MANO: generado por reglas_de_sala_casos.py.\nexport const CASOS_DE_REGLAS_DE_SALA = ' + contenido + ' as const;\n', encoding='utf-8')
