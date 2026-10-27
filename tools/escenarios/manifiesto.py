"""Manifiesto de arte de la biblioteca: lista cada PNG que el juego puede cargar, con sus medidas.

    python tools/escenarios/manifiesto.py              # escribe biblioteca/manifiesto.json
    python tools/escenarios/manifiesto.py --verificar  # sale con 1 si el archivo versionado no es el que se generaría

El juego lo lee en `/assets/biblioteca/manifiesto.json` (angular.json publica `biblioteca/` con ese prefijo), así que las
claves son rutas relativas a `biblioteca/` (= a `assets/biblioteca/` en el navegador). Forma:

    {"esquema": 1, "sprites": {"<ruta>": {"ancho", "alto", "cuadros"?, "fps"?, "origen": "modelo"|"lugar"|"existente"}}}

- `ancho` es el de UN cuadro: en una hoja de cercanía (`<id>-cerca.png`) la imagen mide `cuadros × ancho`, y `ancho` es el
  del reposo, para cargarla con `load.spritesheet(frameWidth = ancho)`. Quien no anima omite `cuadros` y `fps`.
- Los cuadros y los fps salen de lo que declaran los catálogos (`animacionCerca`) de los lugares, de los modelos y de los
  existentes; sin `fps` valen 6. Una hoja `-cerca.png` que ningún catálogo declara es un error, como una declarada que no
  existe o que no mide `cuadros × ancho del reposo`.
- No entran las hojas de contacto (`hoja-contacto*.png`, `hoja-lugares.png`), los fixtures de pruebas ni las dependencias:
  no son arte del juego.
- El archivo es generado y versionado (claves ordenadas, LF); una prueba falla si alguien lo edita a mano.
"""
import argparse
import json
import os
import sys

from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BIBLIOTECA = os.path.join(RAIZ, 'biblioteca')
NOMBRE = 'manifiesto.json'
FPS_POR_DEFECTO = 6
SUFIJO_HOJA = '-cerca.png'
CARPETAS_OMITIDAS = {'node_modules', 'fuentes'}


def _omitido(relativa, nombre):
    """True si el PNG no es arte del juego (hojas de contacto, fixtures de pruebas, imágenes sin procesar)."""
    partes = relativa.split('/')
    if CARPETAS_OMITIDAS & set(partes):
        return True
    if relativa.startswith('scripts/fixtures/'):
        return True
    return nombre == 'hoja-lugares.png' or (nombre.startswith('hoja-contacto') and nombre.endswith('.png'))


def _origen(ruta):
    if ruta.startswith('modelos/existentes/'):
        return 'existente'
    if ruta.startswith('modelos/'):
        return 'modelo'
    if ruta.startswith('escenarios/'):
        return 'lugar'
    raise SystemExit(f'{ruta}: no sé de qué origen es (debe estar bajo escenarios/ o modelos/)')


def _catalogos(biblioteca):
    """(archivo, carpeta base) de cada catálogo que puede declarar `animacionCerca`."""
    encontrados = []
    escenarios = os.path.join(biblioteca, 'escenarios')
    if os.path.isdir(escenarios):
        for lugar in sorted(os.listdir(escenarios)):
            archivo = os.path.join(escenarios, lugar, 'escenario.json')
            if os.path.isfile(archivo):
                encontrados.append(archivo)
    for archivo in (os.path.join(biblioteca, 'modelos', 'catalogo.json'),
                    os.path.join(biblioteca, 'modelos', 'existentes', 'catalogo.json')):
        if os.path.isfile(archivo):
            encontrados.append(archivo)
    return [(a, os.path.dirname(a)) for a in encontrados]


def _con_animacion(nodo):
    """Cada diccionario del catálogo que trae `animacionCerca` (un objeto, una herramienta, un modelo, un sprite)."""
    if isinstance(nodo, dict):
        if isinstance(nodo.get('animacionCerca'), dict):
            yield nodo
        for valor in nodo.values():
            yield from _con_animacion(valor)
    elif isinstance(nodo, list):
        for valor in nodo:
            yield from _con_animacion(valor)


def _declaraciones(biblioteca):
    """{ruta de la hoja: (cuadros, fps, origen del reposo o None)} según los catálogos."""
    hojas = {}
    for archivo, base in _catalogos(biblioteca):
        with open(archivo, encoding='utf-8') as f:
            datos = json.load(f)
        for item in _con_animacion(datos):
            anim = item['animacionCerca']
            hoja = anim.get('hoja')
            cuadros = anim.get('cuadros')
            fps = anim.get('fps', FPS_POR_DEFECTO)
            if not isinstance(hoja, str) or not isinstance(cuadros, int) or isinstance(cuadros, bool) or cuadros < 1:
                raise SystemExit(f'{os.path.relpath(archivo, biblioteca)}: animacionCerca de {item.get("id")!r} necesita `hoja` y `cuadros` (entero ≥ 1)')
            if not isinstance(fps, int) or isinstance(fps, bool) or fps < 1:
                raise SystemExit(f'{os.path.relpath(archivo, biblioteca)}: los fps de {item.get("id")!r} deben ser un entero ≥ 1')
            ruta = os.path.normpath(os.path.join(base, hoja))
            relativa = os.path.relpath(ruta, biblioteca).replace(os.sep, '/')
            if relativa.startswith('../'):
                raise SystemExit(f'{relativa}: la hoja de {item.get("id")!r} queda fuera de la biblioteca')
            origen_reposo = item.get('origen') if isinstance(item.get('origen'), str) else None
            previa = hojas.get(relativa)
            if previa and previa[:2] != (cuadros, fps):
                raise SystemExit(f'{relativa}: dos catálogos la declaran con cuadros o fps distintos')
            hojas[relativa] = (cuadros, fps, origen_reposo)
    return hojas


def _medir(archivo, ruta):
    try:
        with Image.open(archivo) as im:
            im.verify()
        with Image.open(archivo) as im:
            if im.format != 'PNG':
                raise ValueError('no es PNG')
            return im.size
    except Exception as error:  # PIL lanza tipos distintos según el daño
        raise SystemExit(f'{ruta}: no se puede leer como PNG ({error})')


def _ancho_del_reposo(biblioteca, ruta, medidas, origen_reposo):
    """Ancho y alto del reposo de una hoja: el PNG hermano sin `-cerca` o, en un existente, el de su `origen` en el juego."""
    hermano = ruta[:-len(SUFIJO_HOJA)] + '.png'
    if hermano in medidas:
        return medidas[hermano]
    if origen_reposo:
        archivo = os.path.join(os.path.dirname(biblioteca), *origen_reposo.split('/'))
        if os.path.isfile(archivo):
            return _medir(archivo, origen_reposo)
    return None


def generar(biblioteca=BIBLIOTECA):
    """El manifiesto completo (diccionario) de la biblioteca; falla con SystemExit si algún arte no cuadra."""
    medidas = {}
    for carpeta, subcarpetas, archivos in os.walk(biblioteca):
        subcarpetas[:] = sorted(d for d in subcarpetas if d not in CARPETAS_OMITIDAS)
        relativa = os.path.relpath(carpeta, biblioteca).replace(os.sep, '/')
        relativa = '' if relativa == '.' else relativa
        for nombre in sorted(archivos):
            if not nombre.lower().endswith('.png'):
                continue
            ruta = f'{relativa}/{nombre}' if relativa else nombre
            if _omitido(ruta, nombre):
                continue
            medidas[ruta] = _medir(os.path.join(carpeta, nombre), ruta)

    hojas = _declaraciones(biblioteca)
    for ruta in sorted(hojas):
        if ruta not in medidas:
            raise SystemExit(f'{ruta}: la hoja de cercanía que declara un catálogo no existe')
    for ruta in medidas:
        if ruta.endswith(SUFIJO_HOJA) and ruta not in hojas:
            raise SystemExit(f'{ruta}: es una hoja de cercanía y ningún catálogo la declara en animacionCerca (faltan sus cuadros)')

    sprites = {}
    for ruta, (ancho_total, alto) in medidas.items():
        entrada = {'alto': alto, 'origen': _origen(ruta)}
        if ruta in hojas:
            cuadros, fps, origen_reposo = hojas[ruta]
            reposo = _ancho_del_reposo(biblioteca, ruta, medidas, origen_reposo)
            if reposo is not None:
                ancho = reposo[0]
                if ancho_total != cuadros * ancho:
                    raise SystemExit(f'{ruta}: la hoja mide {ancho_total} px de ancho y el reposo {ancho} px; con {cuadros} cuadros debería medir {cuadros * ancho} px')
                if alto != reposo[1]:
                    raise SystemExit(f'{ruta}: la hoja mide {alto} px de alto y el reposo {reposo[1]} px; el alto debe ser el mismo')
            else:
                if ancho_total % cuadros:
                    raise SystemExit(f'{ruta}: la hoja mide {ancho_total} px de ancho, que no es múltiplo de sus {cuadros} cuadros')
                ancho = ancho_total // cuadros
            entrada.update({'ancho': ancho, 'cuadros': cuadros, 'fps': fps})
        else:
            entrada['ancho'] = ancho_total
        sprites[ruta] = entrada
    return {'esquema': 1, 'sprites': dict(sorted(sprites.items()))}


def serializar(datos):
    """Texto del archivo: claves ordenadas, sangría de 2, UTF-8 y LF al final."""
    return json.dumps(datos, ensure_ascii=False, indent=2, sort_keys=True) + '\n'


def cargar(archivo):
    with open(archivo, encoding='utf-8') as f:
        return json.load(f)


def escribir(biblioteca=BIBLIOTECA):
    """Genera y escribe `manifiesto.json` junto a `escenarios/` y `modelos/`; devuelve la ruta."""
    destino = os.path.join(biblioteca, NOMBRE)
    with open(destino, 'w', encoding='utf-8', newline='\n') as f:
        f.write(serializar(generar(biblioteca)))
    return destino


def verificar(biblioteca=BIBLIOTECA):
    """True si el archivo versionado es byte a byte el que se generaría ahora."""
    destino = os.path.join(biblioteca, NOMBRE)
    if not os.path.isfile(destino):
        return False
    with open(destino, 'rb') as f:
        return f.read() == serializar(generar(biblioteca)).encode('utf-8')


def main(argv=None):
    p = argparse.ArgumentParser(description='Genera biblioteca/manifiesto.json')
    p.add_argument('--verificar', action='store_true', help='no escribe: sale con 1 si el archivo no coincide')
    p.add_argument('--biblioteca', default=BIBLIOTECA)
    a = p.parse_args(argv)
    if a.verificar:
        if verificar(a.biblioteca):
            print('manifiesto.json al día')
            return 0
        print('manifiesto.json desactualizado: corre `python tools/escenarios/manifiesto.py`', file=sys.stderr)
        return 1
    destino = escribir(a.biblioteca)
    print(f'{destino} ({len(cargar(destino)["sprites"])} sprites)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
