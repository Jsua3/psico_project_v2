"""Catálogo de los objetos v2 (bloque O1) en el formato del manifiesto de piezas de P1.

    python tools/escenarios/objetos_catalogo.py              # escribe los PNG y biblioteca/piezas/objetos/manifiesto-o1.json
    python tools/escenarios/objetos_catalogo.py --verificar  # sale con 1 si lo versionado no es lo que se generaría

`entradas(escribir=False)` devuelve las secciones que P1 suma a `biblioteca/piezas/manifiesto.json`:

    {"muebles": {"casa/sofa-casa": {...}, ...}, "objetos": {"casa/televisor": {...}, ...}, "herramientas": {"PAP": {...}, ...}}

Cada ficha tiene la forma de `muebles` de P1 (ruta relativa a `biblioteca/`, ancho y alto de UN cuadro, cuadros, fps,
huella, punto de apoyo en el centro del borde inferior) y, cuando corresponde:

- `brillo`, `brilloIzquierda`, `brilloDerecha`: mapas de brillo de P1 (gris 255 vidrio y pantalla, 170 metal, 85 barniz),
  misma tira que el dibujo. `brillo` vale como «frente»; los de lado son la extensión opcional que P1 aceptó.
- `emisivo`: los píxeles que emiten luz propia en su color final; se pintan encima de la luz.
- `resplandor`: la luz que el objeto echa a su alrededor ya dibujada por escalones (tira de 3: escalón 1, 2 y 3),
  `x`, `y` de su esquina desde el punto de apoyo, `tono`, `momento` y `parpadeo` (escalón por cuadro del dibujo, 0 = nada).
- `animaciones`: rangos con nombre (`reposo`, `cerca`, `revisar`, `gesto`, …) con `de`, `hasta`, `fps`, `bucle` y
  `sostener` (se queda en el último) o `luego` (vuelve a otra). Con movimiento reducido se muestra `hasta` de una vez.
- `sobre`: px por encima del piso donde se apoya cuando va sobre su mueble (el televisor sobre el mueble del TV).
- `reemplaza`: el dibujo de hoy al que sustituye (ruta relativa a `biblioteca/`).
"""
import importlib
import json
import os
import sys

import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
BIB = os.path.join(RAIZ, 'biblioteca')
sys.path.insert(0, AQUI)
import objetos_comun as oc  # noqa: E402
import objetos_pixel as op  # noqa: E402
import objetos_reflejo as orf  # noqa: E402

MODULOS = (('objetos_casa', 'casa'), ('objetos_comisaria', 'comisaria'), ('objetos_hospital', 'hospital'), ('objetos_universidad', 'universidad'),
           ('objetos_herramientas', 'herramientas'))
SIDECAR = os.path.join(BIB, 'piezas', 'objetos', 'manifiesto-o1.json')
SECCION = {'mueble': 'muebles', 'objeto': 'objetos', 'herramienta': 'herramientas'}


def _resplandor(pieza, emite):
    """Tira de 3 escalones del resplandor, recortada; (imagen, x, y) desde el punto de apoyo."""
    w, h = pieza['ancho'], pieza['alto']
    sobre = pieza['ficha'].get('sobre', 0)
    rx, ry = emite['radio']
    ancho, alto = 2 * rx + 8, h + sobre + ry + int(ry * 1.2) + 8
    ax, ay = ancho // 2, h + int(ry * 1.2)                                      # apoyo dentro del lienzo
    capas = []
    for nivel in (1, 2, 3):
        capa = orf.capa_emision(emite, nivel, ax, ay + sobre + 1, ancho, alto, 'noche', y_fuente=ay - h // 2)
        tapa = Image.new('L', capa.size, 255)
        tapa.paste(0, (ax - w // 2, ay - h), pieza['cuadros'][0].getchannel('A'))
        capas.append(Image.composite(capa, Image.new('RGB', capa.size), tapa))
    caja = None
    for c in capas:
        b = c.getbbox()
        if b:
            caja = b if caja is None else (min(caja[0], b[0]), min(caja[1], b[1]), max(caja[2], b[2]), max(caja[3], b[3]))
    if caja is None:
        return None
    cuadros = []
    for c in capas:
        rgb = np.array(c.crop(caja))
        arr = np.zeros(rgb.shape[:2] + (4,), np.uint8)
        arr[..., :3] = rgb
        arr[..., 3] = np.where(rgb.any(2), 255, 0)
        cuadros.append(Image.fromarray(arr, 'RGBA'))
    return op.tira(cuadros), caja[0] - ax, caja[1] - ay


def _piezas():
    for modulo, lugar in MODULOS:
        for ref, ficha in importlib.import_module(modulo).PIEZAS.items():
            yield modulo, lugar, ref, ficha


def generar():
    """([(ruta relativa a biblioteca/, Image)], secciones del manifiesto)."""
    archivos, secciones = [], {'muebles': {}, 'objetos': {}, 'herramientas': {}}
    for modulo, lugar, ref, ficha in _piezas():
        p = oc.armar(modulo, ref)
        tipo = ficha['tipo']
        carpeta = SECCION[tipo]
        base = f'piezas/{carpeta}/{ref}' if tipo == 'herramienta' else f'piezas/{carpeta}/{lugar}/{ref}'
        archivos.append((base + '.png', op.tira(p['cuadros'])))
        n = len(p['cuadros'])
        entrada = dict(nombre=ficha['nombre'], ruta=base + '.png', ancho=p['ancho'], alto=p['alto'], cuadros=n,
                       apoyo=[p['ancho'] // 2, p['alto']], huella=ficha['huella'])
        anim = ficha.get('animaciones')
        if anim:
            entrada['animaciones'] = anim
            if n > 1:
                entrada['fps'] = anim['reposo']['fps']
        for campo in ('sobre', 'estados', 'codigo'):
            if ficha.get(campo) is not None:
                entrada[campo] = ficha[campo]
        if ficha.get('reemplaza'):
            entrada['reemplaza'] = os.path.normpath(ficha['reemplaza']).replace('\\', '/')
        for lado, clave, sufijo in (('frente', 'brillo', '-brillo'), ('izquierda', 'brilloIzquierda', '-brillo-izquierda'),
                                    ('derecha', 'brilloDerecha', '-brillo-derecha')):
            b = oc.tira_brillo(p, lado)
            if b is not None:
                archivos.append((base + sufijo + '.png', b))
                entrada[clave] = base + sufijo + '.png'
        em = oc.tira_emisivo_color(p)
        if em is not None:
            archivos.append((base + '-emisivo.png', em))
            entrada['emisivo'] = base + '-emisivo.png'
        if ficha.get('emite'):
            r = _resplandor(p, ficha['emite'])
            if r:
                im, x, y = r
                archivos.append((base + '-resplandor.png', im))
                e = ficha['emite']
                entrada['resplandor'] = dict(ruta=base + '-resplandor.png', x=x, y=y, ancho=im.width // 3, alto=im.height, cuadros=3,
                                             tono=e['tono'], momento=e['momento'], parpadeo=e['niveles'])
        clave = ficha['codigo'] if tipo == 'herramienta' else f'{lugar}/{ref}'
        secciones[SECCION[tipo]][clave] = entrada
    archivos.append(('piezas/objetos/comun/destello.png', op.tira(oc.destello())))
    secciones['objetos']['comun/destello'] = dict(nombre='Destello: falta por revisar', ruta='piezas/objetos/comun/destello.png',
                                                  ancho=9, alto=9, cuadros=8, fps=9,
                                                  animaciones=dict(reposo=dict(de=0, hasta=7, fps=9, bucle=True)))
    return archivos, secciones


def entradas(escribir=False):
    """Las secciones `muebles`, `objetos` y `herramientas` para el manifiesto de P1; con `escribir`, también los PNG."""
    archivos, secciones = generar()
    if escribir:
        for ruta, im in archivos:
            destino = os.path.join(BIB, ruta)
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            im.save(destino, optimize=True)
    return secciones


def _json(secciones):
    return json.dumps(dict(esquema=2, fuente='tools/escenarios/objetos_catalogo.py', **secciones), ensure_ascii=False, indent=1,
                      sort_keys=True) + '\n'


def verificar():
    archivos, secciones = generar()
    malos = []
    for ruta, im in archivos:
        destino = os.path.join(BIB, ruta)
        if not os.path.exists(destino) or not np.array_equal(np.array(Image.open(destino).convert('RGBA')), np.array(im.convert('RGBA'))):
            malos.append(ruta)
    if not os.path.exists(SIDECAR) or open(SIDECAR, encoding='utf-8').read() != _json(secciones):
        malos.append(os.path.relpath(SIDECAR, BIB))
    return malos


if __name__ == '__main__':
    if '--verificar' in sys.argv:
        malos = verificar()
        print('\n'.join(malos) or 'al día')
        sys.exit(1 if malos else 0)
    secciones = entradas(escribir=True)
    os.makedirs(os.path.dirname(SIDECAR), exist_ok=True)
    with open(SIDECAR, 'w', encoding='utf-8', newline='\n') as f:
        f.write(_json(secciones))
    print({k: len(v) for k, v in secciones.items()}, SIDECAR)
