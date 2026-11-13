"""Arma una sala a partir de su estructura (sección 4.5 del diseño): piso, muros, piezas y luz.

    capas(sala, momento=None)            -> lo que el juego necesita: fondo, sprites, luz y avisos
    componer_sala(sala, momento=None, abiertas=(), con_luz=True, extras=()) -> imagen RGB

`sala` es la sala de la biblioteca en esquema 3:

    {"encuadre": "tres-paredes",
     "estructura": {"ancho": 960, "momento": "dia",
                    "acabados": {"piso": "madera", "variante": "a", "muro": "zocalo-alto", "paleta": "casa"},
                    "piezas": [{"id": "v1", "tipo": "ventana", "modelo": "corrediza", "muro": "fondo", "pos": 304}],
                    "tapetes": [{"caja": [236, 548, 318, 420]}]},
     "puertas": [{"id": "p1", "hacia": "comedor", "muro": "fondo", "pos": 104, "modelo": "madera", "etiqueta": "…"}]}

Extensiones propias sobre el diseño: `variante` del piso (a o b), `tapetes`, `exterior`, y las lámparas de
pie y de mesa, que no van en un muro sino en el piso (`x`, `y`) y aceptan `encendida`: auto, siempre o nunca.

    python tools/escenarios/piezas_sala.py     # escribe maqueta-visual/piezas/casa-sala*.png
"""
import os
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import piezas_geo as g  # noqa: E402
import piezas_luz as pl  # noqa: E402
import piezas_muro as pm  # noqa: E402
import piezas_puertas as pp  # noqa: E402
import piezas_superficies as ps  # noqa: E402

SOMBRA_MURO = 76          # lo que cuelga del muro le echa una sombra de 3 px al 76 %


def pegar(destino, im, x, y):
    """alpha_composite que tolera piezas que se salen del lienzo."""
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(destino.width, x + im.width), min(destino.height, y + im.height)
    if x1 > x0 and y1 > y0:
        destino.alpha_composite(im.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))


def _vista(muro):
    return {'fondo': 'frente', 'izquierda': 'lado', 'derecha': 'lado', 'camara': 'camara'}[muro]


def _colocar(cuadros, punto, muro, pos, encuadre, ancho):
    """(cuadros ya orientados, x, y de su esquina en pantalla)."""
    if muro == 'derecha':
        reflejados = [pp.espejo(c, punto) for c in cuadros]
        cuadros, punto = [r[0] for r in reflejados], reflejados[0][1]
    px, py = g.en_pantalla(muro, pos, encuadre, ancho)
    return cuadros, int(round(px - punto[0])), int(round(py - punto[1]))


def capas(sala, momento=None):
    est = sala['estructura']
    ancho, encuadre = g.comprobar_ancho(est['ancho']), sala['encuadre']
    momento = momento or est.get('momento', 'dia')
    acabados = est['acabados']
    izq, der = g.laterales(encuadre)
    xl, xr = g.limites(encuadre, ancho)
    avisos, sprites = [], []

    fondo = Image.new('RGB', (ancho, g.ALTO), ps.VACIO)
    fondo.paste(ps.piso(acabados['piso'], acabados.get('variante', 'a'), ancho), (0, g.SEAM))
    d = ImageDraw.Draw(fondo)
    if est.get('exterior'):            # al aire libre, sobre el muro se ve el cielo en vez del vacío
        cielo = pm.NOCHE if momento == 'noche' else ((196, 214, 224), (182, 204, 218), (168, 194, 212), (154, 184, 206))
        for k in range(4):
            d.rectangle([0, k * (g.TOP - 6) // 4, ancho, (k + 1) * (g.TOP - 6) // 4], fill=cielo[k])
    for t in est.get('tapetes', []):
        ps.tapete(d, ancho, *t['caja'], t.get('colores'))
    muro, x = ps.muro_fondo(acabados['muro'], acabados['paleta'], encuadre, ancho)
    fondo.paste(muro, (x, g.TOP - 6))
    fondo = fondo.convert('RGBA')
    for capa in est.get('propios', []):
        # Lo propio de una sala convertida (una escalera, un mesón): capa fija ya dibujada, sobre el piso y el muro del fondo.
        ruta = os.path.join(RAIZ, 'biblioteca', *capa['ruta'].split('/'))
        if os.path.exists(ruta):
            pegar(fondo, Image.open(ruta).convert('RGBA'), 0, 0)
        else:
            avisos.append(f'falta la capa propia {capa["ruta"]}')
    b = g.borde(ancho)
    if izq:
        fondo.alpha_composite(ps.muro_lado(acabados['muro'], acabados['paleta'], ancho, 'izquierda'), (0, 0))
    if der:
        fondo.alpha_composite(ps.muro_lado(acabados['muro'], acabados['paleta'], ancho, 'derecha'), (ancho - b, 0))

    def valida(pieza, nombre):
        muro = pieza.get('muro')
        if muro not in g.MUROS or not g.largo_muro(muro, encuadre, ancho):
            avisos.append(f'{nombre}: el encuadre {encuadre} no tiene muro {muro!r}')
            return False
        if not 0 <= pieza.get('pos', -1) <= g.largo_muro(muro, encuadre, ancho):
            avisos.append(f'{nombre}: pos {pieza.get("pos")} fuera del muro {muro}')
            return False
        return True

    for pz in est.get('piezas', []):
        clave = (pz.get('tipo'), pz.get('modelo'))
        nombre = pz.get('id', '/'.join(map(str, clave)))
        if clave not in pm.PIEZAS:
            avisos.append(f'{nombre}: {clave[0]}/{clave[1]} no está en el catálogo')
            continue
        F = pm.PIEZAS[clave]
        if 'suelo' in F['muros']:
            if 'x' not in pz:
                avisos.append(f'{nombre}: una lámpara de piso se ubica con x e y')
                continue
            encendida = {'siempre': True, 'nunca': False}.get(pz.get('encendida'))
            im = pm.cuadro_de(clave[0], clave[1], momento, encendida=encendida)
            ax, ay = pm.apoyo(*clave)
            # `sobre`: px por encima del piso, para la lámpara que va encima de una mesa.
            sprites.append(dict(id=nombre, tipo=clave[0], modelo=clave[1], capa='piso', x=pz['x'] - ax, y=pz['y'] - ay - pz.get('sobre', 0),
                                z=pz['y'], cuadros=[im], cuadro=0, pie=(pz['x'], pz['y'])))
            continue
        if not valida(pz, nombre) or pz['muro'] not in F['muros']:
            if pz.get('muro') in g.MUROS and pz['muro'] not in F['muros']:
                avisos.append(f'{nombre}: {F["nombre"]} no va en el muro {pz["muro"]}')
            continue
        vista = _vista(pz['muro'])
        encendida = {'siempre': True, 'nunca': False}.get(pz.get('encendida'))
        lista = pm.cuadros(clave[0], clave[1], vista, ancho)
        indice = lista.index(pm.cuadro_de(clave[0], clave[1], momento, vista, ancho, encendida)) if F['cuadros'] <= 2 else 0
        lista, x, y = _colocar(lista, pm.apoyo(clave[0], clave[1], vista, ancho), pz['muro'], pz['pos'], encuadre, ancho)
        sprites.append(dict(id=nombre, tipo=clave[0], modelo=clave[1], capa='muro', muro=pz['muro'], pos=pz['pos'], x=x, y=y, z=0,
                            cuadros=lista, cuadro=indice, fps=F.get('fps')))

    for pu in sala.get('puertas', []):
        nombre = pu.get('id', 'puerta')
        if pu.get('modelo') not in pp.MODELOS:
            avisos.append(f'{nombre}: la puerta {pu.get("modelo")!r} no está en el catálogo')
            continue
        if not valida(pu, nombre):
            continue
        vista = _vista(pu['muro'])
        lista, x, y = _colocar(pp.cuadros(pu['modelo'], vista, ancho), pp.apoyo(pu['modelo'], vista, ancho), pu['muro'], pu['pos'],
                               encuadre, ancho)
        sprites.append(dict(id=nombre, tipo='puerta', modelo=pu['modelo'], capa='frente' if pu['muro'] == 'camara' else 'muro',
                            muro=pu['muro'], pos=pu['pos'], x=x, y=y, z=g.ALTO if pu['muro'] == 'camara' else 0, cuadros=lista, cuadro=0,
                            hacia=pu.get('hacia'), etiqueta=pu.get('etiqueta', ''), llegada=g.llegada(pu['muro'], pu['pos'], encuadre, ancho)))

    # Sombra que arroja sobre el muro del fondo lo que cuelga de él (3 px abajo y a la derecha).
    cosa = Image.new('L', (ancho, g.ALTO), 0)
    for s in sprites:
        if s['capa'] == 'muro' and s.get('muro') == 'fondo':
            alfa = s['cuadros'][s['cuadro']].getchannel('A')
            cosa.paste(255, (s['x'], s['y']), alfa)
    cosa = np.array(cosa) > 0
    sombra = np.zeros_like(cosa)
    sombra[3:, 3:] = cosa[:-3, :-3]
    ys, xs = np.mgrid[0:g.ALTO, 0:ancho]
    sombra &= ~cosa & (ys >= g.TOP + 6) & (ys < g.SEAM - 7) & (xs >= xl) & (xs < xr)
    arr = np.array(fondo)
    arr[sombra, :3] = (arr[sombra, :3].astype(np.int32) * SOMBRA_MURO // 100).astype(np.uint8)
    fondo = Image.fromarray(arr, 'RGBA')

    ambiente, brillo = pl.calcular_luz(sala, momento)
    return dict(ancho=ancho, alto=g.ALTO, momento=momento, fondo=fondo, sprites=sprites, ambiente=ambiente, brillo=brillo,
                avisos=avisos, zona=g.zona_caminable(encuadre, ancho))


def componer_sala(sala, momento=None, abiertas=(), con_luz=True, extras=()):
    """La sala como la pintaría el juego. `extras` son muebles o personajes: dict(im, x, y, z) con (x, y) = esquina;
    `sombra=False` les quita la sombra y `pie=(x, y)` la cambia por la de una persona, a sus pies."""
    c = capas(sala, momento)
    escena = c['fondo'].copy()
    orden = {'muro': 0, 'piso': 1, 'frente': 2}
    cosas = [(orden[s['capa']], s['z'], s['cuadros'][3 if s['id'] in abiertas and s['tipo'] == 'puerta' else s['cuadro']], s['x'], s['y'])
             for s in c['sprites']]
    cosas += [(1, e['z'], e['im'], e['x'], e['y']) for e in extras]
    cosas.sort(key=lambda q: (q[0], q[1]))
    for _, _, im, x, y in [q for q in cosas if q[0] == 0]:
        pegar(escena, im, x, y)
    sombras = Image.new('RGBA', escena.size, (0, 0, 0, 0))
    ds = ImageDraw.Draw(sombras)
    for e in extras:
        if e.get('pie'):
            ds.ellipse([e['pie'][0] - 11, e['pie'][1] - 8, e['pie'][0] + 11, e['pie'][1] - 1], fill=(8, 6, 18, 86))
        elif e.get('sombra', True):
            w, h = e['im'].size                      # sombra de contacto: una elipse baja al pie del mueble
            ry = max(3, min(9, w // 7))
            ds.ellipse([e['x'] - 2, e['y'] + h - ry - 3, e['x'] + w + 4, e['y'] + h + ry - 2], fill=(8, 6, 18, 84))
    escena = Image.alpha_composite(escena, sombras)
    for _, _, im, x, y in [q for q in cosas if q[0] > 0]:
        pegar(escena, im, x, y)
    rgb = escena.convert('RGB')
    if con_luz:
        if abiertas:
            c['ambiente'], c['brillo'] = pl.calcular_luz(sala, c['momento'], abiertas)
        rgb = ImageChops.add(ImageChops.multiply(rgb, c['ambiente']), c['brillo'])
    return rgb


# ── sala de muestra: Casa · Sala, la misma de maqueta-visual/despues.png ───────

CASA_SALA = {
    'id': 'sala', 'nombre': 'Sala', 'encuadre': 'tres-paredes',
    'estructura': {
        'ancho': 960, 'momento': 'dia',
        'acabados': {'piso': 'madera', 'variante': 'a', 'muro': 'zocalo-alto', 'paleta': 'casa'},
        'piezas': [
            {'id': 'ventana', 'tipo': 'ventana', 'modelo': 'corrediza', 'muro': 'fondo', 'pos': 304},
            {'id': 'cuadro', 'tipo': 'cuadro', 'modelo': 'cuadro', 'muro': 'fondo', 'pos': 198},
            {'id': 'repisa', 'tipo': 'repisa', 'modelo': 'repisa', 'muro': 'fondo', 'pos': 534},
            {'id': 'reloj', 'tipo': 'reloj', 'modelo': 'reloj', 'muro': 'fondo', 'pos': 420},
            {'id': 'lampara', 'tipo': 'lampara', 'modelo': 'pie', 'x': 236, 'y': 326, 'encendida': 'siempre'},
        ],
        'tapetes': [{'caja': [236, 548, 318, 420]}],
    },
    'puertas': [
        {'id': 'puerta-comedor', 'hacia': 'comedor', 'muro': 'fondo', 'pos': 104, 'modelo': 'madera-ventanilla', 'etiqueta': 'Pasar al comedor'},
        {'id': 'puerta-escalera', 'hacia': 'escalera', 'muro': 'fondo', 'pos': 664, 'modelo': 'madera', 'etiqueta': 'Ir a la escalera'},
        {'id': 'puerta-fachada', 'hacia': 'fachada', 'muro': 'camara', 'pos': 384, 'modelo': 'madera', 'etiqueta': 'Salir a la calle'},
    ],
}


def casa_sala(momento='dia', abiertas=()):
    """Casa · Sala por piezas, con los muebles, los objetos y las dos personas de la maqueta."""
    import vivo
    lugar, sala, muebles, objetos = vivo.leer_escena()
    base = componer_sala(CASA_SALA, momento, abiertas, con_luz=False)
    ambiente, brillo = pl.calcular_luz(CASA_SALA, momento, abiertas)
    tv = next(o for o in objetos if o['id'] == 'televisor')
    personas = [dict(receta='sobreviviente', x=560, y=360, vista='left'), dict(receta='valentina', x=470, y=372, vista='right')]
    return vivo.componer(base, muebles, objetos, personas, ambiente, brillo, vivo.brillo_tv(tv['x'], tv['y']), sombras=True,
                         emote=(vivo.emotes(), 'duda', (560, 360 - 66)))


if __name__ == '__main__':
    destino = os.path.join(RAIZ, 'maqueta-visual', 'piezas')
    os.makedirs(destino, exist_ok=True)
    for nombre, im in (('casa-sala', casa_sala('dia')), ('casa-sala-noche', casa_sala('noche')),
                       ('casa-sala-abierta', casa_sala('dia', ('puerta-comedor', 'puerta-escalera', 'puerta-fachada')))):
        im.resize((im.width * 2, im.height * 2), Image.Resampling.NEAREST).save(os.path.join(destino, nombre + '.png'))
    print(capas(CASA_SALA)['avisos'])
