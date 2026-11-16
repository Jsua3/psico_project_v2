"""Vista previa jugable de las «salas por piezas»: una página (canvas 2D, sin dependencias) con todo incrustado.

Exporta de cada sala lo que el juego necesitará: el fondo (piso y muros), las piezas como tiras de cuadros con
su posición, las puertas con su destino y su punto de llegada, y las dos capas de luz de día y de noche.

    python tools/escenarios/piezas_vista.py     # escribe maqueta-visual/piezas/vista.html
"""
import base64
import copy
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
import piezas_geo as g  # noqa: E402
import piezas_sala as sl  # noqa: E402

KIT = os.path.join(RAIZ, 'frontend', 'src', 'assets', 'characters', 'kit')
SALIDA = os.path.join(RAIZ, 'maqueta-visual', 'piezas', 'vista.html')
MARCA = '/*__DATOS__*/'


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


def _clave(prefijo, im):
    return prefijo + hashlib.md5(im.tobytes() + str(im.size).encode()).hexdigest()[:12]


_REEMPLAZOS = None


def _reemplazos():
    """Los muebles y objetos que el bloque O1 redibujó, por el arte de la biblioteca de hoy que reemplazan."""
    global _REEMPLAZOS
    if _REEMPLAZOS is None:
        with open(os.path.join(RAIZ, 'biblioteca', 'piezas', 'manifiesto.json'), encoding='utf-8') as f:
            datos = json.load(f)
        _REEMPLAZOS = {v['reemplaza']: v for seccion in ('muebles', 'objetos') for v in datos.get(seccion, {}).values() if v.get('reemplaza')}
    return _REEMPLAZOS


def _cuadros_de(ruta, ancho, n):
    tira = Image.open(os.path.join(RAIZ, 'biblioteca', *ruta.split('/'))).convert('RGBA')
    return [tira.crop((i * ancho, 0, i * ancho + ancho, tira.height)) for i in range(n)]


def _pieza_nueva(nueva, espejo):
    """Un mueble u objeto de O1 listo para colocar: sus cuadros de reposo, su brillo, su emisivo y su resplandor."""
    n, ancho = nueva.get('cuadros', 1), nueva['ancho']
    reposo = nueva.get('animaciones', {}).get('reposo')
    de, hasta = (reposo['de'], reposo['hasta'] + 1) if reposo else (0, n)

    def tira(clave):
        if not nueva.get(clave):
            return None
        lista = _cuadros_de(nueva[clave], ancho, n)[de:hasta]
        return [ImageOps.mirror(c) for c in lista] if espejo else lista
    cuadros = tira('ruta')
    datos = dict(im=cuadros[0], cuadros=cuadros, fps=(reposo or nueva).get('fps', 4) if len(cuadros) > 1 else 0, mapas=tira('brillo'),
                 emisivos=tira('emisivo'))
    if nueva.get('resplandor'):
        r = nueva['resplandor']
        datos['resplandor'] = dict(tira=Image.open(os.path.join(RAIZ, 'biblioteca', *r['ruta'].split('/'))).convert('RGBA'), w=r['ancho'],
                                   h=r['alto'], n=r['cuadros'], x=r['x'], y=r['y'], seq=r.get('parpadeo') or [r['cuadros']])
    return datos


def muebles_de_biblioteca(lugar, sala_id, dx=0):
    """Muebles y objetos de una sala de la biblioteca, corridos dx px (para salas más anchas). Lo que el bloque O1 ya
    redibujó sale del catálogo nuevo, con su brillo y su emisivo; lo demás, del arte de hoy."""
    base = os.path.join(RAIZ, 'biblioteca', 'escenarios', lugar)
    with open(os.path.join(base, 'escenario.json'), encoding='utf-8') as f:
        esc = json.load(f)
    sala = next(s for s in esc['salas'] if s['id'] == sala_id)
    cat = esc['catalogo']
    lista = []
    for seccion, extra in (('muebles', {}), ('objetos', dict(sombra=False, choca=False))):
        for m in sala[seccion]:
            ficha = next(c for c in cat[seccion] if c['id'] == m['ref'])
            nueva = _reemplazos().get(f'escenarios/{lugar}/{ficha["arte"]}')
            if nueva:
                pieza = _pieza_nueva(nueva, m.get('espejo'))
            else:
                im = Image.open(os.path.join(base, ficha['arte'])).convert('RGBA')
                pieza = dict(im=ImageOps.mirror(im) if m.get('espejo') else im)
            z = dict(z=m['y'] + 30) if seccion == 'objetos' else {}
            lista.append(dict(pieza, x=m['x'] + dx, y=m['y'], ref=m['ref'], **z, **extra))
    return lista


def _tira_de(cuadros, guardar, prefijo):
    if not cuadros or not any(c.getbbox() for c in cuadros):
        return None
    tira = g.tira(cuadros)
    return guardar(_clave(prefijo, tira), tira)


def _resplandor(r, guardar):
    return dict(img=guardar(_clave('g-', r['tira']), r['tira']), w=r['w'], h=r['h'], n=r['n'], x=r['x'], y=r['y'], seq=r['seq']) if r else None


def _brillo(mapas, reflejo, guardar):
    """Tira con el brillo de un sprite ya teñido para la luz que le llega; None si con esa luz no brilla."""
    vacio = Image.new('RGBA', mapas[0].size, (0, 0, 0, 0))
    cuadros = [sl.tenir(m, *reflejo) or vacio for m in mapas]
    if all(c is vacio for c in cuadros):
        return None
    tira = g.tira(cuadros)
    return guardar(_clave('r-', tira), tira)


def _en_sombra(sala, momento, cuerpos, sid, guardar):
    """Las dos capas de luz con todas las fuentes tapadas: lo que se ve dentro de la sombra de quien camina."""
    ambiente, brillo = sl.pl.calcular_luz(sala, momento, (), cuerpos, todo_en_sombra=True)
    return [guardar(f'as-{sid}-{momento}', ambiente), guardar(f'bs-{sid}-{momento}', brillo)]


ABC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+,-.:;<=>?@^_~'


def _rejilla(sala, momento, paso=16):
    """Para la sombra de quien camina: la matriz que manda en cada celda del piso (rejilla de `paso` px), como una
    lista de matrices sin repetir y una letra por celda. El juego la calcula exacta en el píxel donde pisa (LEEME de
    la referencia de luz); a la página le basta la rejilla."""
    ancho = sala['estructura']['ancho']
    cols, filas = -(-ancho // paso), -(-(g.ALTO - g.SEAM) // paso)
    puntos = [(min(cx * paso + paso // 2, ancho - 1), min(g.SEAM + cy * paso + paso // 2, g.ALTO - 1)) for cy in range(filas) for cx in range(cols)]
    matrices, celdas = [], []
    for m in sl.pl.matrices_de_sombra(sala, momento, puntos):
        if list(m) not in matrices:
            matrices.append(list(m))
        celdas.append(ABC[matrices.index(list(m))])
    return dict(paso=paso, y0=g.SEAM, cols=cols, filas=filas, m=matrices, celdas=''.join(celdas), abc=ABC)


def _sombra_de_pie():
    """Sombra de contacto de quien camina: una elipse deshecha con el tramado de la casa, sin transparencias."""
    bayer = sl.pl.BAYER
    im = Image.new('RGBA', (26, 10), (0, 0, 0, 0))
    for y in range(10):
        for x in range(26):
            r2 = ((x - 12.5) / 13) ** 2 + ((y - 4.5) / 5) ** 2
            if r2 < 1 and (1 - r2) * 22 > bayer[y % 4, x % 4]:
                im.putpixel((x, y), (22, 24, 44, 255))
    return im


def _entrada(sala, por_defecto):
    e = sala.get('entrada') or por_defecto
    return [e['x'], e['y']] if isinstance(e, dict) else list(e)


def exportar(sala, lugar, imgs, muebles=()):
    """La sala como datos para la página; las imágenes van a `imgs` sin repetirse."""
    cuerpos = [sl.pl.cuerpo_de(m['im'], m['x'] - m['im'].width // 2, m['y'] - m['im'].height, pie=(m['x'], m['y']) if m.get('persona') else None)
               for m in muebles if m.get('sombra', True)]
    dia, noche = sl.capas(sala, 'dia', cuerpos), sl.capas(sala, 'noche', cuerpos)
    sid = sala['id']

    def guardar(clave, im):
        if clave not in imgs:
            imgs[clave] = uri(im)
        return clave

    x0, y0, w, h = dia['zona']
    datos = dict(nombre=sala['nombre'], lugar=lugar, ancho=dia['ancho'], zona=[x0, y0, w, h],
                 fondo=guardar('f-' + sid, dia['fondo'].convert('RGB')),
                 luz={m: [guardar(f'a-{sid}-{m}', c['ambiente']), guardar(f'b-{sid}-{m}', c['brillo'])] + _en_sombra(sala, m, cuerpos, sid, guardar)
                      for m, c in (('dia', dia), ('noche', noche))},
                 sombras={m: _rejilla(sala, m) for m in ('dia', 'noche')},
                 sprites=[], muebles=[], entrada=_entrada(sala, (x0 + w // 2, y0 + h * 2 // 3)), avisos=dia['avisos'])
    puertas = {p['id']: p for p in sala.get('puertas', [])}
    for sd, sn in zip(dia['sprites'], noche['sprites']):
        tira = g.tira(sd['cuadros'])
        s = dict(id=sd['id'], capa=sd['capa'], x=sd['x'], y=sd['y'], w=sd['cuadros'][0].width, h=sd['cuadros'][0].height,
                 hoja=guardar(_clave('h-', tira), tira), n=len(sd['cuadros']), cuadro=dict(dia=sd['cuadro'], noche=sn['cuadro']), z=sd['z'])
        if sd.get('fps'):
            s['fps'] = sd['fps']
        if sd.get('mapas'):
            s['brillo'] = {m: _brillo(c['mapas'], c['reflejo'], guardar) for m, c in (('dia', sd), ('noche', sn))}
        if sd.get('emisivos'):
            s['emisivo'] = {m: _tira_de(c['emisivos'], guardar, 'e-') for m, c in (('dia', sd), ('noche', sn))}
        if sd['tipo'] == 'puerta':
            pu = puertas[sd['id']]
            s['puerta'] = dict(hacia=pu.get('hacia'), par=pu.get('par'), etiqueta=pu.get('etiqueta', 'Pasar'), muro=sd['muro'], llegada=list(sd['llegada']))
        datos['sprites'].append(s)
    puntos = [(m['x'], m['y'] - 1) for m in muebles]
    luces = {mo: sl.pl.reflejos(sala, mo, (), cuerpos, puntos) for mo in ('dia', 'noche')}
    for n_mueble, m in enumerate(muebles):
        im = m['im']
        mw, mh = im.size
        x, y = m['x'] - mw // 2, m['y'] - mh
        tira = g.tira(m['cuadros']) if len(m.get('cuadros', ())) > 1 else im
        if m.get('persona'):
            caja = [m['x'] - 10, m['y'] - 16, m['x'] + 10, m['y'] - 2]
        else:
            caja = [x + 2, m['y'] - min(mh, 20), x + mw - 2, m['y'] + 2] if m.get('choca', True) else None
        datos['muebles'].append(dict(img=guardar(_clave('m-', tira), tira), x=x, y=y, w=mw, h=mh, z=m.get('z', m['y']),
                                     n=len(m.get('cuadros', ())) or 1, fps=m.get('fps', 0), caja=caja,
                                     brillo={mo: _brillo(m['mapas'], luces[mo][n_mueble], guardar) for mo in luces} if m.get('mapas') else None,
                                     emisivo=_tira_de(m.get('emisivos'), guardar, 'e-'), resplandor=_resplandor(m.get('resplandor'), guardar)))
    return datos


# ── lugar de muestra: la sala de la casa, un comedor de 1200 y un pasillo de 1680 con las siete puertas ─────────

def _sala_casa():
    sala = copy.deepcopy(sl.CASA_SALA)
    sala['entrada'] = (480, 440)
    destinos = {'puerta-comedor': ('comedor', 'p-sala', 'Pasar al comedor'), 'puerta-escalera': ('galeria', 'p-sala', 'Pasar a la galería'),
                'puerta-fachada': ('galeria', 'p-camara', 'Salir a la galería')}
    for p in sala['puertas']:
        p['hacia'], p['par'], p['etiqueta'] = destinos[p['id']]
    return sala


COMEDOR = {
    'id': 'comedor', 'nombre': 'Comedor', 'encuadre': 'tres-paredes', 'entrada': (600, 430),
    'estructura': {
        'ancho': 1200, 'momento': 'dia',
        'acabados': {'piso': 'baldosa', 'variante': 'a', 'muro': 'paneles', 'paleta': 'casa'},
        'piezas': [
            {'id': 'ventana', 'tipo': 'ventana', 'modelo': 'persiana', 'muro': 'fondo', 'pos': 740},
            {'id': 'ventana-lado', 'tipo': 'ventana', 'modelo': 'corrediza', 'muro': 'izquierda', 'pos': 150},
            {'id': 'cuadro', 'tipo': 'cuadro', 'modelo': 'cuadro', 'muro': 'fondo', 'pos': 330},
            {'id': 'espejo', 'tipo': 'espejo', 'modelo': 'espejo', 'muro': 'fondo', 'pos': 250},
            {'id': 'colgante', 'tipo': 'lampara', 'modelo': 'colgante', 'muro': 'fondo', 'pos': 500},
            {'id': 'reloj', 'tipo': 'reloj', 'modelo': 'reloj', 'muro': 'fondo', 'pos': 600},
        ],
    },
    'puertas': [
        {'id': 'p-sala', 'hacia': 'sala', 'par': 'puerta-comedor', 'muro': 'derecha', 'pos': 150, 'modelo': 'madera-ventanilla', 'etiqueta': 'Volver a la sala'},
        {'id': 'p-pasillo', 'hacia': 'galeria', 'par': 'p-comedor', 'muro': 'fondo', 'pos': 130, 'modelo': 'vidrio', 'etiqueta': 'Salir a la galería'},
    ],
}

PASILLO = {
    'id': 'galeria', 'nombre': 'Galería de las siete puertas', 'encuadre': 'tres-paredes', 'entrada': (840, 400),
    'estructura': {
        'ancho': 1680, 'momento': 'dia',
        'acabados': {'piso': 'damero', 'variante': 'a', 'muro': 'azulejo', 'paleta': 'universidad'},
        'piezas': [
            {'id': 'reloj', 'tipo': 'reloj', 'modelo': 'reloj', 'muro': 'fondo', 'pos': 650},
            {'id': 'gel', 'tipo': 'gel', 'modelo': 'gel', 'muro': 'fondo', 'pos': 1240},
            {'id': 'senal', 'tipo': 'senal', 'modelo': 'senal', 'muro': 'fondo', 'pos': 1280},
            {'id': 'extintor', 'tipo': 'extintor', 'modelo': 'extintor', 'muro': 'fondo', 'pos': 1330},
            {'id': 'tubo-1', 'tipo': 'lampara', 'modelo': 'tubo', 'muro': 'fondo', 'pos': 320},
            {'id': 'tubo-2', 'tipo': 'lampara', 'modelo': 'tubo', 'muro': 'fondo', 'pos': 850},
            {'id': 'tubo-3', 'tipo': 'lampara', 'modelo': 'tubo', 'muro': 'fondo', 'pos': 1100},
        ],
    },
    'puertas': [
        {'id': 'p-sala', 'hacia': 'sala', 'par': 'puerta-escalera', 'muro': 'fondo', 'pos': 80, 'modelo': 'madera', 'etiqueta': 'Pasar a la sala'},
        {'id': 'p-comedor', 'hacia': 'comedor', 'par': 'p-pasillo', 'muro': 'fondo', 'pos': 240, 'modelo': 'madera-ventanilla', 'etiqueta': 'Pasar al comedor'},
        {'id': 'g-vidrio', 'hacia': 'sala', 'par': 'puerta-comedor', 'muro': 'fondo', 'pos': 400, 'modelo': 'vidrio', 'etiqueta': 'Pasar a la sala'},
        {'id': 'g-metalica', 'hacia': 'comedor', 'par': 'p-sala', 'muro': 'fondo', 'pos': 560, 'modelo': 'metalica', 'etiqueta': 'Pasar al comedor'},
        {'id': 'g-urgencias', 'hacia': 'sala', 'par': 'puerta-escalera', 'muro': 'fondo', 'pos': 740, 'modelo': 'urgencias', 'etiqueta': 'Pasar a la sala'},
        {'id': 'g-corrediza', 'hacia': 'comedor', 'par': 'p-pasillo', 'muro': 'fondo', 'pos': 960, 'modelo': 'corrediza', 'etiqueta': 'Pasar al comedor'},
        {'id': 'g-paso', 'hacia': 'sala', 'par': 'puerta-fachada', 'muro': 'fondo', 'pos': 1180, 'modelo': 'paso', 'etiqueta': 'Pasar a la sala'},
        {'id': 'l-vidrio', 'hacia': 'comedor', 'par': 'p-sala', 'muro': 'izquierda', 'pos': 150, 'modelo': 'vidrio', 'etiqueta': 'Pasar al comedor'},
        {'id': 'l-metalica', 'hacia': 'sala', 'par': 'puerta-comedor', 'muro': 'derecha', 'pos': 150, 'modelo': 'metalica', 'etiqueta': 'Pasar a la sala'},
        {'id': 'p-camara', 'hacia': 'sala', 'par': 'puerta-fachada', 'muro': 'camara', 'pos': 687, 'modelo': 'urgencias', 'etiqueta': 'Pasar a la sala'},
    ],
}


def lugares():
    """[(nombre del lugar, [(sala, muebles)])]. El hospital entra cuando existe `piezas_hospital`."""
    lista = [('Muestra', [(_sala_casa(), muebles_de_biblioteca('casa', 'sala')),
                          (COMEDOR, muebles_de_biblioteca('casa', 'comedor', dx=120)),
                          (PASILLO, [])])]
    try:
        import piezas_hospital as ph
    except ImportError:
        return lista
    return [('Hospital', [(s, ph.muebles_de(s)) for s in ph.SALAS])] + lista


def construir(destino=SALIDA):
    imgs, salas, orden, avisos = {}, {}, [], []
    for nombre, lista in lugares():
        for sala, muebles in lista:
            salas[sala['id']] = exportar(sala, nombre, imgs, muebles)
            orden.append(sala['id'])
            avisos += [sala['id'] + ': ' + a for a in salas[sala['id']].pop('avisos')]
    for sid, s in salas.items():          # toda puerta lleva a una sala que existe y a una puerta de regreso
        for sp in s['sprites']:
            p = sp.get('puerta')
            if p and (p['hacia'] not in salas or not any(o['id'] == p['par'] and o.get('puerta') for o in salas[p['hacia']]['sprites'])):
                avisos.append(f'{sid}/{sp["id"]}: lleva a {p["hacia"]}/{p["par"]}, que no existe')
    imgs['j-idle'] = uri(os.path.join(KIT, 'valentina', 'idle.png'))
    imgs['j-walk'] = uri(os.path.join(KIT, 'valentina', 'walk.png'))
    imgs['j-sombra'] = uri(_sombra_de_pie())
    datos = dict(inicio=orden[0], orden=orden, salas=salas, imgs=imgs, jugador=dict(idle='j-idle', walk='j-walk'))
    with open(os.path.join(AQUI, 'piezas_vista.html'), encoding='utf-8') as f:
        plantilla = f.read()
    if MARCA not in plantilla:
        raise SystemExit('La plantilla no tiene la marca ' + MARCA)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, 'w', encoding='utf-8', newline='') as f:
        f.write(plantilla.replace(MARCA, json.dumps(datos, ensure_ascii=False, separators=(',', ':'))))
    return dict(salas=len(salas), imagenes=len(imgs), kb=os.path.getsize(destino) // 1024, avisos=avisos)


if __name__ == '__main__':
    print(construir())
