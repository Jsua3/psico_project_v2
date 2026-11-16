"""Comisaría de familia por piezas: las cuatro salas del capítulo 3 de SIM-VBG-002, al nivel del hospital.

    python tools/escenarios/piezas_comisaria.py      # hojas maqueta-visual/piezas/comisaria-{dia,noche}.png

Recepción, sala de espera, pasillo de atención y consultorio psicosocial, con sus piezas de muro, su luz y los muebles
y objetos que redibujó el bloque O1 (`comisaria/<ref>` en el manifiesto de piezas). Los ids de las salas y de las
puertas son los de la comisaría convertida, así que las otras cinco salas (fachada, orientación jurídica, despacho,
entrevista y archivo) siguen enlazadas: `piezas_convertir.convertir_lugar('comisaria')` pone estas cuatro en su lugar.
Los muebles y objetos usan los ids del catálogo de la biblioteca (`biblioteca/escenarios/comisaria/escenario.json`);
las personas, las recetas del kit.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import piezas_geo as g  # noqa: E402
import piezas_hospital as ph  # noqa: E402
import piezas_sala as sl  # noqa: E402

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
LUGAR_ID = 'comisaria'
COLGADOS = {'camara-seguridad'}   # va en el muro: ni sombra ni choque (el afiche y la cartelera son de pie)

P, PU, N = ph.P, ph.PU, ph.N


def M(ref, x, y, espejo=False):
    return dict(ref=ref, x=x, y=y, espejo=espejo)


def O(ref, x, y, sobre=0):
    """Un objeto: (x, y) es el punto del piso bajo su base; `sobre`, los px que se levanta (encima de un mueble o en el muro)."""
    return dict(ref=ref, x=x, y=y, **({'sobre': sobre} if sobre else {}))


def _sala(id, nombre, ancho, piso, muro, piezas, puertas, muebles, objetos=(), personajes=(), entrada=None, tapetes=(), descripcion=''):
    estructura = dict(ancho=ancho, momento='dia', acabados=dict(piso=piso, variante=f'comisaria-{id}', muro=muro, paleta=f'comisaria-{id}'),
                      piezas=piezas)
    if tapetes:
        estructura['tapetes'] = [sl.ps.tapete_ficha(LUGAR_ID, id, n + 1, ancho, t['caja'], t.get('colores')) for n, t in enumerate(tapetes)]
    return dict(id=id, nombre=nombre, descripcion=descripcion, encuadre='tres-paredes', entrada=dict(x=entrada[0], y=entrada[1]),
                estructura=estructura, puertas=puertas, muebles=muebles, objetos=list(objetos), personajes=list(personajes))


RECEPCION = _sala(
    'recepcion', 'Recepción', 1200, 'baldosa', 'zocalo-alto',
    descripcion='Mostrador de recepción donde se toma el turno y se orienta a quien llega.',
    piezas=[
        P('extintor', 'extintor', 'fondo', 184), P('tubo-1', 'lampara', 'fondo', 280, 'tubo', encendida=True),
        P('ventana', 'ventana', 'fondo', 440, 'alta'), P('reloj', 'reloj', 'fondo', 580), P('senal', 'senal', 'fondo', 624),
        P('tubo-2', 'lampara', 'fondo', 720, 'tubo', encendida=True), P('persiana', 'ventana', 'fondo', 904, 'persiana'),
    ],
    puertas=[
        PU('puerta-fachada', 'fachada', 'puerta-recepcion', 'camara', 480, 'vidrio', 'Salir a la calle'),
        PU('puerta-sala-espera', 'sala-espera', 'puerta-recepcion', 'derecha', 152, 'paso', 'Pasar a la sala de espera'),
        PU('puerta-pasillo', 'pasillo', 'puerta-recepcion', 'fondo', 104, 'paso', 'Ir al pasillo de atención'),
    ],
    muebles=[M('planta-oficina', 196, 300), M('caneca-comisaria', 300, 266), M('cartelera-comisaria', 800, 240),
             M('silla-giratoria', 640, 296), M('mostrador-recepcion', 600, 334), M('sillas-espera-comisaria', 930, 300),
             M('planta-oficina', 1040, 300)],
    objetos=[O('dispensador-turnos', 724, 316), O('afiche-rutas-atencion', 420, 262), O('camara-seguridad', 928, 236, 112)],
    personajes=[N('funcionaria-recepcion', 576, 306), N('sobreviviente', 584, 402, 'arriba'), N('madre-acompanante', 642, 414, 'arriba')],
    entrada=(595, 440))

ESPERA = _sala(
    'sala-espera', 'Sala de espera', 1200, 'baldosa', 'zocalo-alto',
    descripcion='Filas de sillas, agua y un afiche con la ruta de atención.',
    piezas=[
        P('persiana-1', 'ventana', 'fondo', 136, 'persiana'), P('cartelera', 'cartelera', 'fondo', 256),
        P('tubo-1', 'lampara', 'fondo', 360, 'tubo', encendida=True), P('reloj', 'reloj', 'fondo', 560),
        P('tubo-2', 'lampara', 'fondo', 680, 'tubo', encendida=True), P('persiana-2', 'ventana', 'fondo', 816, 'persiana'),
        P('extintor', 'extintor', 'fondo', 904), P('senal', 'senal', 'fondo', 944),
    ],
    puertas=[
        PU('puerta-recepcion', 'recepcion', 'puerta-sala-espera', 'izquierda', 152, 'paso', 'Volver a la recepción'),
        PU('puerta-pasillo', 'pasillo', 'puerta-sala-espera', 'fondo', 480, 'metalica', 'Ir al pasillo de atención'),
    ],
    muebles=[M('planta-oficina', 196, 296), M('sillas-espera-comisaria', 316, 272), M('sillas-espera-comisaria', 452, 272),
             M('sillas-espera-comisaria', 760, 272), M('sillas-espera-comisaria', 896, 272),
             M('sillas-espera-comisaria', 420, 384), M('mesa-baja-nna', 600, 392), M('sillas-espera-comisaria', 780, 384)],
    objetos=[O('dispensador-agua', 1010, 286), O('papelera', 1050, 292), O('afiche-rutas-atencion', 700, 262),
             O('caja-panuelos', 600, 393, 22)],
    personajes=[N('madre-acompanante', 380, 300), N('vecina', 860, 302, 'izquierda')],
    entrada=(600, 440))

PASILLO = _sala(
    'pasillo', 'Pasillo de atención', 1440, 'baldosa', 'zocalo-alto',
    descripcion='Pasillo con las puertas de orientación jurídica, el despacho, el consultorio y la sala de entrevista.',
    piezas=[
        P('senal-1', 'senal', 'fondo', 184), P('tubo-1', 'lampara', 'fondo', 256, 'tubo', encendida=True),
        P('extintor', 'extintor', 'fondo', 440), P('tubo-2', 'lampara', 'fondo', 508, 'tubo', encendida=True),
        P('reloj', 'reloj', 'fondo', 508), P('gel', 'gel', 'fondo', 576), P('ventana', 'ventana', 'fondo', 768, 'alta'),
        P('tubo-3', 'lampara', 'fondo', 1008, 'tubo', encendida=True), P('cartelera', 'cartelera', 'fondo', 1128),
    ],
    puertas=[
        PU('puerta-sala-espera', 'sala-espera', 'puerta-pasillo', 'camara', 584, 'metalica', 'Volver a la sala de espera'),
        PU('puerta-recepcion', 'recepcion', 'puerta-pasillo', 'izquierda', 152, 'paso', 'Volver a la recepción'),
        PU('puerta-orientacion', 'orientacion-juridica', 'puerta-pasillo', 'fondo', 120, 'metalica', 'Entrar a orientación jurídica'),
        PU('puerta-despacho', 'despacho-comisaria', 'puerta-pasillo', 'fondo', 376, 'metalica', 'Entrar al despacho de la comisaria de familia'),
        PU('puerta-consultorio', 'consultorio-psicosocial', 'puerta-pasillo', 'fondo', 640, 'metalica', 'Entrar al consultorio psicosocial'),
        PU('puerta-entrevista', 'sala-entrevista-nna', 'puerta-pasillo', 'fondo', 904, 'metalica', 'Entrar a la sala de entrevista'),
        PU('puerta-archivo', 'archivo', 'puerta-pasillo', 'derecha', 152, 'paso', 'Ir al archivo'),
    ],
    muebles=[M('planta-oficina', 196, 296), M('sillas-espera-comisaria', 644, 272), M('caneca-comisaria', 884, 266),
             M('sillas-espera-comisaria', 1180, 272), M('planta-oficina', 1300, 296)],
    objetos=[O('dispensador-agua', 330, 284), O('camara-seguridad', 1206, 236, 112)],
    personajes=[N('policia-infancia', 760, 376, 'izquierda')],
    entrada=(718, 440))

CONSULTORIO = _sala(
    'consultorio-psicosocial', 'Consultorio psicosocial', 960, 'madera', 'pintura',
    descripcion='Espacio de escucha del equipo psicosocial: dos sillas, una mesa baja y pañuelos a la mano.',
    piezas=[
        P('cuadro', 'cuadro', 'fondo', 56), P('ventana', 'ventana', 'fondo', 232, 'persiana'), P('reloj', 'reloj', 'fondo', 600),
        P('cuadro-2', 'cuadro', 'fondo', 704),
        dict(id='lampara-pie', tipo='lampara', modelo='pie', x=226, y=330),
        dict(id='lampara-mesa', tipo='lampara', modelo='mesa', x=748, y=290, sobre=36),
    ],
    puertas=[PU('puerta-pasillo', 'pasillo', 'puerta-consultorio', 'camara', 384, 'metalica', 'Salir al pasillo')],
    muebles=[M('planta-oficina', 140, 300), M('cartelera-comisaria', 560, 258), M('silla-giratoria', 700, 256),
             M('escritorio-funcionario', 700, 290), M('silla-visitante-comisaria', 300, 340),
             M('silla-visitante-comisaria', 420, 340, True), M('mesa-baja-nna', 360, 362)],
    objetos=[O('afiche-rutas-atencion', 214, 268), O('papelera', 776, 262), O('dispensador-agua', 836, 270),
             O('carpeta-medidas-proteccion', 676, 291, 37), O('caja-panuelos', 378, 363, 24)],
    personajes=[N('profesional-psicosocial', 520, 352, 'izquierda'), N('sobreviviente', 262, 404, 'derecha')],
    tapetes=[dict(caja=[250, 480, 318, 404])],
    entrada=(480, 440))

SALAS = [RECEPCION, ESPERA, PASILLO, CONSULTORIO]
LUGAR = dict(esquema=3, id=LUGAR_ID, nombre='Comisaría de familia', salas=SALAS)

_MANIFIESTO = None


def _ficha(ref):
    """La ficha del mueble u objeto que O1 redibujó para la comisaría, o None."""
    global _MANIFIESTO
    if _MANIFIESTO is None:
        with open(os.path.join(RAIZ, 'biblioteca', 'piezas', 'manifiesto.json'), encoding='utf-8') as f:
            _MANIFIESTO = json.load(f)
    for seccion in ('muebles', 'objetos'):
        ficha = _MANIFIESTO.get(seccion, {}).get(f'{LUGAR_ID}/{ref}')
        if ficha:
            return ficha
    return None


def _de_la_biblioteca(ref, espejo):
    base = os.path.join(RAIZ, 'biblioteca', 'escenarios', LUGAR_ID)
    with open(os.path.join(base, 'escenario.json'), encoding='utf-8') as f:
        cat = json.load(f)['catalogo']
    ficha = next(c for sec in ('muebles', 'objetos') for c in cat[sec] if c['id'] == ref)
    im = Image.open(os.path.join(base, ficha['arte'])).convert('RGBA')
    im = ImageOps.mirror(im) if espejo else im
    return dict(im=im, cuadros=[im], fps=0)


def muebles_de(sala):
    """Muebles, objetos y personas de la sala, listos para componer o exportar: dict(im, cuadros, fps, x, y, z, …) con
    (x, y) el centro de la base del dibujo. Lo que O1 redibujó sale del catálogo nuevo, con su brillo y su emisivo."""
    import piezas_vista as pv
    lista = []
    for clase, cosas in (('mueble', sala.get('muebles', [])), ('objeto', sala.get('objetos', []))):
        for m in cosas:
            ficha = _ficha(m['ref'])
            pieza = pv._pieza_nueva(ficha, m.get('espejo')) if ficha else _de_la_biblioteca(m['ref'], m.get('espejo'))
            sobre, colgado = m.get('sobre', 0), m['ref'] in COLGADOS
            libre = not sobre and not colgado
            lista.append(dict(pieza, x=m['x'], y=m['y'] - sobre, z=m['y'] + (1 if clase == 'objeto' else 0), ref=m['ref'],
                              sombra=libre, choca=libre))
    for p in sala.get('personajes', []):
        cuadros = ph._personaje(p['ref'], p.get('mirando', 'abajo'))
        lista.append(dict(im=cuadros[0], cuadros=cuadros, fps=4, x=p['x'], y=p['y'] + 4, z=p['y'] + 4, ref=p['ref'], persona=True))
    return lista


def componer(sala, momento='dia', abiertas=()):
    extras = [dict(im=m['im'], x=m['x'] - m['im'].width // 2, y=m['y'] - m['im'].height, z=m['z'], sombra=m.get('sombra', True) and not m.get('persona'),
                   mapa=(m.get('mapas') or [None])[0], emisivo=(m.get('emisivos') or [None])[0],
                   pie=(m['x'], m['y']) if m.get('persona') else None) for m in muebles_de(sala)]
    return sl.componer_sala(sala, momento, abiertas, extras=extras)


def hoja_de_salas(momento):
    """Las cuatro salas compuestas, una debajo de otra en dos columnas."""
    imagenes = [(s['nombre'], componer(s, momento)) for s in SALAS]
    columnas = [imagenes[0::2], imagenes[1::2]]
    ancho_col = [max(im.width for _, im in col) for col in columnas]
    alto = max(sum(im.height + 34 for _, im in col) for col in columnas) + 8
    lienzo = Image.new('RGB', (sum(ancho_col) + 36, alto), (24, 26, 34))
    d = ImageDraw.Draw(lienzo)
    x = 12
    for col, w in zip(columnas, ancho_col):
        y = 8
        for nombre, im in col:
            d.text((x, y + 6), nombre + ' · ' + str(im.width) + ' px · ' + ('día' if momento == 'dia' else 'noche'), fill=(206, 200, 188))
            lienzo.paste(im, (x, y + 26))
            y += im.height + 34
        x += w + 12
    return lienzo


if __name__ == '__main__':
    import piezas_convertir as cv
    destino = os.path.join(RAIZ, 'maqueta-visual', 'piezas')
    os.makedirs(destino, exist_ok=True)
    for momento in ('dia', 'noche'):
        hoja_de_salas(momento).save(os.path.join(destino, 'comisaria-' + momento + '.png'))
    for s in SALAS:
        puestas = [dict(tipo='puerta', modelo=p['modelo'], muro=p['muro'], pos=p['pos']) for p in s['puertas']] + \
                  [p for p in s['estructura']['piezas'] if 'muro' in p]
        choques = [(a.get('id', a['modelo']), b.get('id', b['modelo'])) for i, a in enumerate(puestas) for b in puestas[i + 1:] if cv._chocan(a, b)]
        print(s['id'], 'avisos:', sl.capas(s)['avisos'], 'choques:', choques, 'sin arte nuevo:',
              [m['ref'] for m in s['muebles'] + s['objetos'] if not _ficha(m['ref'])])
