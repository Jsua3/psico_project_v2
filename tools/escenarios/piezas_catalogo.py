"""Escribe el catálogo de piezas en `biblioteca/piezas/` y su manifiesto (esquema 2, sección `piezas`).

    python tools/escenarios/piezas_catalogo.py              # escribe los PNG, hospital.json y manifiesto.json
    python tools/escenarios/piezas_catalogo.py --verificar  # sale con 1 si el manifiesto versionado no es el que se generaría

El manifiesto general (`biblioteca/manifiesto.json`, esquema 1) no cambia: el juego de hoy rechaza cualquier
otro esquema (`frontend/scripts/world-art/build.mjs`). Este vive aparte hasta que el juego sepa leerlo.

    {"esquema": 2,
     "geometria": {"alto", "piso", "tope", "k", "anchos", "borde": {ancho: px}},
     "luz": {"unidad", "minimo", "paso", "niveles", "penumbra", "bayer", "tablaAmbiente", "tablaCalida", "tablaFria"},
     "piezas": {"<tipo>/<modelo>": {"nombre", "ocupa", "muros", "cuadros", "franja", "estados"?, "fps"?, "luz"?,
                                    "vistas": {"frente": V, "camara"?: V, "suelo"?: V, "lado"?: {ancho: V}}}},
     "pisos": {"<tipo>-<variante>": {"ruta", "ancho", "alto"}},
     "muros": {"<acabado>/<paleta>": {"fondo": {...}, "lado": {ancho: {"izquierda": {...}, "derecha": {...}}}}},
     "muebles": {"hospital/<ref>": {"ruta", "ancho", "alto", "cuadros", "fps"?, "huella": {"ancho", "fondo", "alto"}}},
     "lugares": ["piezas/lugares/hospital.json", …],
     "propios": ["piezas/propios/casa-escalera.png", …]}   capas fijas de 960 × 528 de las salas convertidas

    V = {"ruta", "ancho", "alto", "apoyo": [x, y]}

- `ancho` y `alto` son los de UN cuadro; la imagen es una tira horizontal de `cuadros`.
- `apoyo` es el punto del cuadro que va sobre la línea del piso (de frente), sobre la unión del muro con el piso
  (de lado) o sobre el borde inferior de la sala (cámara). En las piezas que cuelgan cae por debajo de la imagen.
- `ocupa` es el ancho en px que la pieza toma a lo largo del muro; `franja` es [de, hasta] en px de altura sobre el
  piso: dos piezas solo se estorban si se cruzan a lo largo del muro Y en la franja (un tubo de techo no choca con una puerta).
- La vista `lado` es la del muro izquierdo; la del derecho es su espejo (el apoyo pasa a `ancho − x`).
- `huella` de un mueble: el rectángulo que ocupa en el piso (centrado en su apoyo, `fondo` px hacia atrás) y su altura;
  con eso se dibuja su sombra de contacto y se proyecta la que arroja (ver `piezas/luz/LEEME.md`).
- `luz` dice cómo emite: `forma` (haz, pozo o tubo), `momento` (dia o noche), `tono` (calido o frio) y sus medidas.
"""
import argparse
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import piezas_geo as g  # noqa: E402
import piezas_hospital as ph  # noqa: E402
import piezas_luz as pl  # noqa: E402
import piezas_muro as pm  # noqa: E402
import piezas_puertas as pp  # noqa: E402
import piezas_superficies as ps  # noqa: E402

BIBLIOTECA = os.path.join(RAIZ, 'biblioteca')
CARPETA = {'ventana': 'ventanas', 'lampara': 'lamparas'}
ESTADOS = {'ventana': ['dia', 'noche'], 'lampara': ['apagada', 'encendida']}


def _vista(cuadros, punto, ruta, imagenes):
    imagenes[ruta] = g.tira(cuadros)
    return dict(ruta=ruta, ancho=cuadros[0].width, alto=cuadros[0].height, apoyo=[int(round(punto[0])), int(round(punto[1]))])


def generar():
    """(manifiesto, {ruta relativa a biblioteca/: imagen})."""
    imagenes, piezas = {}, {}
    for modelo, M in pp.MODELOS.items():
        base = f'piezas/puertas/{modelo}'
        vistas = dict(frente=_vista(pp.cuadros(modelo, 'frente'), pp.apoyo(modelo, 'frente'), base + '-frente.png', imagenes),
                      camara=_vista(pp.cuadros(modelo, 'camara'), pp.apoyo(modelo, 'camara'), base + '-camara.png', imagenes),
                      lado={str(a): _vista(pp.cuadros(modelo, 'lado', a), pp.apoyo(modelo, 'lado', a), f'{base}-lado-{a}.png', imagenes)
                            for a in g.ANCHOS})
        piezas['puerta/' + modelo] = dict(nombre=M['nombre'], ocupa=M['ocupa'], ancho=M['ancho'], alto=M['alto'], muros=list(g.MUROS), cuadros=pp.CUADROS,
                                          franja=[0, vistas['frente']['apoyo'][1]], hojas=M['hojas'], vistas=vistas)
    for (tipo, modelo), F in pm.PIEZAS.items():
        base = f'piezas/{CARPETA.get(tipo, "muro")}/{modelo}'
        if 'suelo' in F['muros']:
            vistas = dict(suelo=_vista(pm.cuadros(tipo, modelo), pm.apoyo(tipo, modelo), base + '.png', imagenes))
            franja = [0, vistas['suelo']['alto']]
        else:
            vistas = dict(frente=_vista(pm.cuadros(tipo, modelo), pm.apoyo(tipo, modelo), base + '-frente.png', imagenes),
                          lado={str(a): _vista(pm.cuadros(tipo, modelo, 'lado', a), pm.apoyo(tipo, modelo, 'lado', a), f'{base}-lado-{a}.png', imagenes)
                                for a in g.ANCHOS})
            frente = vistas['frente']
            franja = [frente['apoyo'][1] - frente['alto'], frente['apoyo'][1]]
        ficha = dict(nombre=F['nombre'], ocupa=F['ocupa'], muros=list(F['muros']), cuadros=F['cuadros'], franja=franja, vistas=vistas)
        if tipo in ESTADOS:
            ficha['estados'] = ESTADOS[tipo]
        if F.get('fps'):
            ficha['fps'] = F['fps']
        if F.get('luz'):
            # La ventana lleva además su antepecho y su alto: la luz los usa para el halo en el muro.
            ficha['luz'] = dict(F['luz'], **{k: F[k] for k in ('antepecho', 'alto') if k in F})
        piezas[f'{tipo}/{modelo}'] = ficha

    pisos = {}
    for tipo in ps.PISOS:
        for variante in ps.PISOS[tipo]:
            ruta = f'piezas/pisos/{tipo}-{variante}.png'
            imagenes[ruta] = ps.piso_maestro(tipo, variante)
            pisos[f'{tipo}-{variante}'] = dict(ruta=ruta, ancho=ps.M, alto=g.FONDO, nombre=ps.NOMBRE_PISO[tipo])
    muros = {}
    for acabado in ps.ACABADOS:
        for paleta in ps.PALETAS:
            base = f'piezas/muros/{acabado}-{paleta}'
            imagenes[base + '-fondo.png'] = ps.muro_maestro(acabado, paleta)
            lado = {}
            for a in g.ANCHOS:
                lado[str(a)] = {}
                for nombre in ('izquierda', 'derecha'):
                    im = ps.muro_lado(acabado, paleta, a, nombre)
                    imagenes[f'{base}-lado-{a}-{nombre}.png'] = im
                    lado[str(a)][nombre] = dict(ruta=f'{base}-lado-{a}-{nombre}.png', ancho=im.width, alto=im.height)
            muros[f'{acabado}/{paleta}'] = dict(nombre=ps.NOMBRE_ACABADO[acabado], fondo=dict(ruta=base + '-fondo.png', ancho=ps.M, alto=ps.ALTO_MAESTRA_MURO),
                                                lado=lado)
    muebles = {}
    for ref, F in ph.MUEBLES.items():
        cuadros = ph.mueble(ref)
        ruta = f'piezas/muebles/hospital/{ref}.png'
        imagenes[ruta] = g.tira(cuadros)
        c = pl.cuerpo(0, 0, cuadros[0].width, cuadros[0].height)
        muebles['hospital/' + ref] = dict(nombre=F['nombre'], ruta=ruta, ancho=cuadros[0].width, alto=cuadros[0].height, cuadros=len(cuadros),
                                          huella=dict(ancho=c['x1'] - c['x0'], fondo=c['y1'] - c['y0'], alto=c['alto']))
        if F.get('fps'):
            muebles['hospital/' + ref]['fps'] = F['fps']
    geometria = dict(alto=g.ALTO, piso=g.SEAM, tope=g.TOP, k=[3, 16], anchos=list(g.ANCHOS), rejilla=g.REJILLA,
                     borde={str(a): g.borde(a) for a in g.ANCHOS})
    luz = dict(unidad=pl.U, minimo=pl.MINIMO, paso=pl.PASO, niveles=pl.NIVELES, uno=pl.UNO,
               penumbra=dict(dia=pl.PENUMBRA, noche=pl.PENUMBRA_NOCHE, exteriorDia=pl.EXTERIOR, exteriorNoche=pl.EXTERIOR_NOCHE),
               bayer=pl.BAYER.tolist(), tablaAmbiente=pl.TABLA_AMBIENTE.tolist(), tablaCalida=pl.TABLA_CALIDA.tolist(),
               tablaFria=pl.TABLA_FRIA.tolist(), enSombra=pl.EN_SOMBRA, hazFondo=list(pl.HAZ_FONDO), hazLado=list(pl.HAZ_LADO),
               sombraMaxima=pl.SOMBRA_MAXIMA, referencia='piezas/luz/LEEME.md', casos='piezas/luz/casos.json')
    return dict(esquema=2, geometria=geometria, luz=luz, piezas=piezas, pisos=pisos, muros=muros, muebles=muebles, lugares=[]), imagenes


def serializar(datos):
    return json.dumps(datos, ensure_ascii=False, indent=2, sort_keys=True) + '\n'


def _listar(biblioteca, nombre, extension):
    carpeta = os.path.join(biblioteca, 'piezas', nombre)
    return sorted(f'piezas/{nombre}/' + n for n in os.listdir(carpeta) if n.endswith(extension)) if os.path.isdir(carpeta) else []


def _completar(datos, biblioteca):
    """Lo que no dibuja este módulo sino la conversión: los lugares y las capas propias de sus salas."""
    datos['lugares'] = _listar(biblioteca, 'lugares', '.json')
    datos['propios'] = _listar(biblioteca, 'propios', '.png')
    return datos


def escribir(biblioteca=BIBLIOTECA):
    datos, imagenes = generar()
    for ruta, im in imagenes.items():
        archivo = os.path.join(biblioteca, *ruta.split('/'))
        os.makedirs(os.path.dirname(archivo), exist_ok=True)
        im.save(archivo, 'PNG', optimize=True)
    lugares = os.path.join(biblioteca, 'piezas', 'lugares')
    os.makedirs(lugares, exist_ok=True)
    with open(os.path.join(lugares, 'hospital.json'), 'w', encoding='utf-8', newline='') as f:
        f.write(serializar(ph.LUGAR))
    _completar(datos, biblioteca)
    with open(os.path.join(biblioteca, 'piezas', 'manifiesto.json'), 'w', encoding='utf-8', newline='') as f:
        f.write(serializar(datos))
    return datos, len(imagenes)


def verificar(biblioteca=BIBLIOTECA):
    """Lista de diferencias entre lo versionado y lo que se generaría (vacía si todo coincide)."""
    datos, imagenes = generar()
    _completar(datos, biblioteca)
    archivo = os.path.join(biblioteca, 'piezas', 'manifiesto.json')
    if not os.path.exists(archivo):
        return ['falta biblioteca/piezas/manifiesto.json']
    with open(archivo, encoding='utf-8') as f:
        difiere = [] if f.read() == serializar(datos) else ['biblioteca/piezas/manifiesto.json no es el que se generaría']
    return difiere + [ruta + ' no existe' for ruta in imagenes if not os.path.exists(os.path.join(biblioteca, *ruta.split('/')))]


def main(argv=None):
    opciones = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    opciones.add_argument('--verificar', action='store_true')
    args = opciones.parse_args(argv)
    if args.verificar:
        fallas = verificar()
        for falla in fallas:
            print(falla)
        return 1 if fallas else 0
    datos, cuantas = escribir()
    print(f'{cuantas} imágenes · {len(datos["piezas"])} piezas · {len(datos["pisos"])} pisos · {len(datos["muros"])} muros · '
          f'{len(datos["muebles"])} muebles · {len(datos["lugares"])} lugares')
    return 0


if __name__ == '__main__':
    sys.exit(main())
