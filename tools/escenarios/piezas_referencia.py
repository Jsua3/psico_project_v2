"""Referencia para el cliente del juego: lo que el motor en TypeScript de `frontend/src/app/features/simulator/sala/`
debe reproducir, valor por valor y píxel a píxel.

    python tools/escenarios/piezas_referencia.py                       # escribe frontend/scripts/world-art/fixtures/salas-referencia.json
    python tools/escenarios/piezas_referencia.py --verificar           # sale con 1 si el archivo versionado no es el que se generaría
    python tools/escenarios/piezas_referencia.py --volcar <caso> <carpeta>   # PNG de un caso (p. ej. hospital/pasillo@noche), para depurar

El JSON lleva cuatro secciones, y las pruebas `frontend/scripts/world-art/salas-*.test.mjs` comparan contra ellas:

- `geometria`: `piezas_geo` en cada encuadre y ancho. De `en_pantalla` y `llegada` va la huella de todas las posiciones enteras
  de cada muro y una muestra para ubicar una diferencia.
- `tablas`: las tablas y constantes de `piezas_luz` (la luz de cada pieza y el vano de cada puerta van en el manifiesto).
- `luz`: huella SHA-256 de `ambiente` y de `brillo` (bytes RGB) por sala y momento, y una muestra de los escalones cada 48 × 33 px.
- `composicion`: lo que `piezas_sala.capas` coloca (sprites y su sitio) y la huella de la sala pintada, sin luz y con luz.

Las imágenes no se guardan: pesarían decenas de MB. Una huella igual es una imagen igual.
"""
import copy
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import piezas_geo as g  # noqa: E402
import piezas_luz as pl  # noqa: E402
import piezas_muro as pm  # noqa: E402
import piezas_sala as sl  # noqa: E402
import piezas_superficies as ps  # noqa: E402

DESTINO = os.path.join(RAIZ, 'frontend', 'scripts', 'world-art', 'fixtures', 'salas-referencia.json')
LUGARES = os.path.join(RAIZ, 'biblioteca', 'piezas', 'lugares')
PASO_X, PASO_Y = 48, 33

# Una sala que ninguna del catálogo cubre: 1920 px, ventanas en los dos muros laterales, lámparas forzadas y las cinco vistas de puerta.
SINTETICAS = {
    'ancha': {
        'id': 'ancha', 'nombre': 'Sala sintética de 1920 px', 'encuadre': 'tres-paredes',
        'estructura': {
            'ancho': 1920, 'momento': 'dia',
            'acabados': {'piso': 'damero', 'variante': 'a', 'muro': 'ladrillo', 'paleta': 'universidad'},
            'piezas': [
                {'id': 'v-izq', 'tipo': 'ventana', 'modelo': 'ventanal', 'muro': 'izquierda', 'pos': 150},
                {'id': 'v-der', 'tipo': 'ventana', 'modelo': 'persiana', 'muro': 'derecha', 'pos': 120},
                {'id': 'v-fondo', 'tipo': 'ventana', 'modelo': 'corrediza', 'muro': 'fondo', 'pos': 400},
                {'id': 'colgante', 'tipo': 'lampara', 'modelo': 'colgante', 'muro': 'fondo', 'pos': 900},
                {'id': 'apagada', 'tipo': 'lampara', 'modelo': 'colgante', 'muro': 'fondo', 'pos': 1100, 'encendida': False},
                {'id': 'tubo', 'tipo': 'lampara', 'modelo': 'tubo', 'muro': 'fondo', 'pos': 1300},
                {'id': 'tubo-lado', 'tipo': 'lampara', 'modelo': 'tubo', 'muro': 'izquierda', 'pos': 240},
                {'id': 'pie', 'tipo': 'lampara', 'modelo': 'pie', 'x': 600, 'y': 380, 'encendida': True},
                {'id': 'mesa', 'tipo': 'lampara', 'modelo': 'mesa', 'x': 1500, 'y': 330, 'sobre': 22},
                {'id': 'reloj', 'tipo': 'reloj', 'modelo': 'reloj', 'muro': 'derecha', 'pos': 220},
                {'id': 'cartelera', 'tipo': 'cartelera', 'modelo': 'cartelera', 'muro': 'fondo', 'pos': 700},
            ],
        },
        'puertas': [
            {'id': 'p-fondo', 'hacia': 'otra', 'par': 'p-vuelta', 'muro': 'fondo', 'pos': 200, 'modelo': 'corrediza', 'etiqueta': 'Pasar a la otra sala'},
            {'id': 'p-fondo-2', 'hacia': 'otra', 'par': 'p-vuelta', 'muro': 'fondo', 'pos': 1500, 'modelo': 'urgencias', 'etiqueta': 'Pasar a urgencias'},
            {'id': 'p-izq', 'hacia': 'otra', 'par': 'p-vuelta', 'muro': 'izquierda', 'pos': 60, 'modelo': 'metalica', 'etiqueta': 'Pasar al archivo'},
            {'id': 'p-der', 'hacia': 'otra', 'par': 'p-vuelta', 'muro': 'derecha', 'pos': 240, 'modelo': 'paso', 'etiqueta': 'Pasar al pasillo'},
            {'id': 'p-cam', 'hacia': 'otra', 'par': 'p-vuelta', 'muro': 'camara', 'pos': 687, 'modelo': 'vidrio', 'etiqueta': 'Salir'},
        ],
    },
}

SALAS = ('hospital/entrada-urgencias', 'hospital/sala-espera', 'hospital/pasillo', 'hospital/triaje', 'hospital/estacion-enfermeria',
         'hospital/sala-escucha', 'hospital/trabajo-social', 'hospital/habitacion-recuperacion',
         'casa/fachada', 'casa/escalera', 'universidad/sala-espera', 'universidad/pasillo', 'sintetica/ancha')
# (sala, momento, puertas abiertas) además de cada sala de día y de noche con todo cerrado.
ABIERTAS = (('hospital/entrada-urgencias', 'dia', ('a-espera',)),
            ('hospital/pasillo', 'noche', None),          # None = todas las puertas de la sala
            ('sintetica/ancha', 'dia', None))


def sala_de(clave):
    lugar, sid = clave.split('/')
    if lugar == 'sintetica':
        return copy.deepcopy(SINTETICAS[sid])
    with open(os.path.join(LUGARES, lugar + '.json'), encoding='utf-8') as f:
        return copy.deepcopy(next(s for s in json.load(f)['salas'] if s['id'] == sid))


def casos():
    lista = [(clave, momento, ()) for clave in SALAS for momento in ('dia', 'noche')]
    for clave, momento, abiertas in ABIERTAS:
        if abiertas is None:
            abiertas = tuple(p['id'] for p in sala_de(clave).get('puertas', []))
        lista.append((clave, momento, tuple(abiertas)))
    return lista


def nombre_del_caso(clave, momento, abiertas):
    return f'{clave}@{momento}' + ('+abiertas' if abiertas else '')


def huella(im):
    return hashlib.sha256(np.asarray(im.convert('RGB')).tobytes()).hexdigest()


# ── geometría ──────────────────────────────────────────────────────────────────

def geometria():
    lista = []
    for encuadre in g.ENCUADRES:
        for ancho in g.ANCHOS:
            muros = {}
            for muro in g.MUROS:
                largo = g.largo_muro(muro, encuadre, ancho)
                if not largo:
                    muros[muro] = dict(largo=0)
                    continue
                texto, muestra = [], []
                for pos in range(largo + 1):
                    x, y = g.en_pantalla(muro, pos, encuadre, ancho)
                    lx, ly = g.llegada(muro, pos, encuadre, ancho)
                    texto.append(f'{x},{y},{lx},{ly};')
                    if pos % 37 == 0 or pos == largo:
                        muestra.append([pos, x, y, lx, ly])
                muros[muro] = dict(largo=largo, huella=hashlib.sha256(''.join(texto).encode('ascii')).hexdigest(), muestra=muestra)
            lista.append(dict(encuadre=encuadre, ancho=ancho, borde=g.borde(ancho), limites=list(g.limites(encuadre, ancho)),
                              laterales=list(g.laterales(encuadre)), zona=list(g.zona_caminable(encuadre, ancho)),
                              recorte=list(ps.recorte(ancho)), muros=muros))
    return dict(constantes=dict(alto=g.ALTO, piso=g.SEAM, tope=g.TOP, fondo=g.FONDO, altoMuro=g.ALTO_MURO, margen=g.MARGEN,
                                rejilla=g.REJILLA, anchos=list(g.ANCHOS), maestra=ps.M, altoMaestraMuro=ps.ALTO_MAESTRA_MURO,
                                vacio=list(ps.VACIO), noche=[list(c) for c in pm.NOCHE]),
                casos=lista)


# ── tablas ─────────────────────────────────────────────────────────────────────

def tablas():
    """Las tablas y constantes de `piezas_luz`. La luz de cada pieza y el vano de cada puerta ya van en el manifiesto."""
    return dict(ambiente=pl.TABLA_AMBIENTE.tolist(), calida=pl.TABLA_CALIDA.tolist(), fria=pl.TABLA_FRIA.tolist(),
                constantes=dict(u=pl.U, minimo=pl.MINIMO, paso=pl.PASO, niveles=pl.NIVELES, penumbra=pl.PENUMBRA,
                                penumbraNoche=pl.PENUMBRA_NOCHE, exterior=pl.EXTERIOR, exteriorNoche=pl.EXTERIOR_NOCHE,
                                uno=pl.UNO, bayer=pl.BAYER.tolist(), enSombra=pl.EN_SOMBRA, hazFondo=list(pl.HAZ_FONDO),
                                hazLado=list(pl.HAZ_LADO), sombraMaxima=pl.SOMBRA_MAXIMA))


# ── luz ────────────────────────────────────────────────────────────────────────

def luz_de(clave, momento, abiertas):
    sala = sala_de(clave)
    ambiente, brillo = pl.calcular_luz(sala, momento, abiertas)
    nivel, calido, frio = pl.niveles(sala, momento, abiertas)
    ancho = sala['estructura']['ancho']
    muestra = ''.join(f'{int(nivel[y, x]):x}{int(calido[y, x]) * 4 + int(frio[y, x]):x}'
                      for y in range(0, g.ALTO, PASO_Y) for x in range(0, ancho, PASO_X))
    return dict(id=nombre_del_caso(clave, momento, abiertas), sala=clave, momento=momento, abiertas=list(abiertas), ancho=ancho,
                ambiente=huella(ambiente), brillo=huella(brillo), muestra=muestra)


# ── composición ────────────────────────────────────────────────────────────────

def sala_sin_tapetes(clave):
    """El cliente pinta el tapete desde su imagen (`ruta`, que P1 exporta con `tapete_imagen`); Python lo dibuja con polígonos
    y da los mismos píxeles. Un tapete sin imagen el cliente no lo puede pintar: la referencia se compara sin él."""
    sala = sala_de(clave)
    tapetes = sala['estructura'].get('tapetes', [])
    con_imagen = [t for t in tapetes if t.get('ruta') and os.path.exists(os.path.join(RAIZ, 'biblioteca', *t['ruta'].split('/')))]
    if len(con_imagen) == len(tapetes):
        return sala, False
    if con_imagen:
        sala['estructura']['tapetes'] = con_imagen
    else:
        sala['estructura'].pop('tapetes')
    return sala, True


def composicion_de(clave, momento, abiertas):
    sala, sin_tapetes = sala_sin_tapetes(clave)
    c = sl.capas(sala, momento)
    sprites = []
    for s in c['sprites']:
        cuadro = s['cuadros'][0]
        fila = dict(id=s['id'], tipo=s['tipo'], modelo=s['modelo'], capa=s['capa'], x=s['x'], y=s['y'], w=cuadro.width, h=cuadro.height,
                    cuadros=len(s['cuadros']), cuadro=s['cuadro'], z=s['z'])
        if s.get('fps'):
            fila['fps'] = s['fps']
        if s['tipo'] == 'puerta':
            fila['llegada'] = list(s['llegada'])
        sprites.append(fila)
    return dict(id=nombre_del_caso(clave, momento, abiertas), sala=clave, momento=momento, abiertas=list(abiertas), sinTapetes=sin_tapetes,
                ancho=c['ancho'], zona=list(c['zona']), avisos=c['avisos'], sprites=sprites, fondo=huella(c['fondo']),
                sinLuz=huella(sl.componer_sala(sala, momento, abiertas, con_luz=False)),
                conLuz=huella(sl.componer_sala(sala, momento, abiertas)))


# ── archivo ────────────────────────────────────────────────────────────────────

def generar():
    lista = casos()
    return dict(geometria=geometria(), tablas=tablas(), sinteticas=SINTETICAS,
                luz=[luz_de(*caso) for caso in lista], composicion=[composicion_de(*caso) for caso in lista])


def _compacto(valor):
    return json.dumps(valor, ensure_ascii=False, separators=(',', ':'), sort_keys=True)


def serializar(datos):
    """JSON con un caso por línea: el archivo es generado, pero un cambio se lee en el diff."""
    partes = []
    for clave in sorted(datos):
        valor = datos[clave]
        if isinstance(valor, list):
            cuerpo = '[\n' + ',\n'.join(_compacto(v) for v in valor) + '\n]'
        elif clave == 'geometria':
            cuerpo = ('{"casos":[\n' + ',\n'.join(_compacto(v) for v in valor['casos']) + '\n],"constantes":'
                      + _compacto(valor['constantes']) + '}')
        else:
            cuerpo = _compacto(valor)
        partes.append(f'{json.dumps(clave)}:{cuerpo}')
    return ('{\n' + ',\n'.join(partes) + '\n}\n').encode('utf-8')


def escribir(destino=DESTINO):
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, 'wb') as f:
        f.write(serializar(generar()))
    return destino


def verificar(destino=DESTINO):
    if not os.path.exists(destino):
        return False
    with open(destino, 'rb') as f:
        return f.read() == serializar(generar())


def volcar(caso, carpeta):
    """Las imágenes de un caso, para mirar dónde difiere el cliente."""
    clave, _, resto = caso.partition('@')
    momento, _, con_abiertas = resto.partition('+')
    abiertas = next((a for c, m, a in casos() if c == clave and m == momento and bool(a) == bool(con_abiertas)), ())
    os.makedirs(carpeta, exist_ok=True)
    sala, _ = sala_sin_tapetes(clave)
    ambiente, brillo = pl.calcular_luz(sala_de(clave), momento, abiertas)
    base = os.path.join(carpeta, caso.replace('/', '-').replace('@', '-').replace('+', '-'))
    for nombre, im in (('ambiente', ambiente), ('brillo', brillo), ('fondo', sl.capas(sala, momento)['fondo'].convert('RGB')),
                       ('sin-luz', sl.componer_sala(sala, momento, abiertas, con_luz=False)),
                       ('con-luz', sl.componer_sala(sala, momento, abiertas))):
        im.save(f'{base}-{nombre}.png')
    return base


if __name__ == '__main__':
    Image.MAX_IMAGE_PIXELS = None
    if '--verificar' in sys.argv:
        if not verificar():
            print('frontend/scripts/world-art/fixtures/salas-referencia.json no es el que se generaría: '
                  'corre python tools/escenarios/piezas_referencia.py')
            sys.exit(1)
        print('referencia al día')
    elif '--volcar' in sys.argv:
        n = sys.argv.index('--volcar')
        print(volcar(sys.argv[n + 1], sys.argv[n + 2]))
    else:
        print(os.path.relpath(escribir(), RAIZ))
