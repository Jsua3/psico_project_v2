"""Los objetos v2 dentro de una sala de P1 (bloque O1), de día y de noche, con luz, sombras, reflejos y luz propia.

    python tools/escenarios/objetos_sala.py     # escribe maqueta-visual/objetos/sala-{dia,noche}{,-x3}.png

El orden es el del juego (piezas_sala.componer_sala de P1): fondo y piezas de muro → sombras de contacto → muebles,
objetos y personas por profundidad → luz de la sala (multiplicar ambiente, sumar brillo) → lo que emite luz propia
vuelve a su color → reflejos (se suman, teñidos con la fuente dominante) → resplandor del televisor.
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageOps

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import objetos_comun as oc  # noqa: E402
import objetos_reflejo as orf  # noqa: E402
import piezas_luz as pl  # noqa: E402
import piezas_sala as sl  # noqa: E402

KIT = os.path.join(RAIZ, 'frontend', 'src', 'assets', 'characters', 'kit')
SALIDA = os.path.join(RAIZ, 'maqueta-visual', 'objetos')
SOMBRA = (8, 6, 18, 84)                       # la sombra de contacto de P1: rgba(8, 6, 18, 0.33)

# «Sala viva»: la Casa · Sala de P1 con los muebles y objetos de la biblioteca en su sitio.
SALA = sl.CASA_SALA
COSAS = [
    # (módulo, ref, x, y del piso, sobre: px por encima del piso donde se apoya, espejo)
    ('objetos_casa', 'sofa-casa', 300, 330, 0, False),
    ('objetos_casa', 'sillon-casa', 470, 300, 0, True),
    ('objetos_casa', 'mesa-centro-casa', 330, 392, 0, False),
    ('objetos_casa', 'mueble-tv', 660, 262, 0, False),
    ('objetos_casa', 'televisor', 648, 263, 31, False),
    ('objetos_casa', 'portarretrato', 694, 263, 31, False),
]
PERSONAS = [dict(receta='sobreviviente', x=560, y=360, vista='left'), dict(receta='valentina', x=470, y=372, vista='right')]


def _sala_de_p1(lugar, sala_id):
    import json
    with open(os.path.join(RAIZ, 'biblioteca', 'piezas', 'lugares', lugar + '.json'), encoding='utf-8') as f:
        return next(s for s in json.load(f)['salas'] if s['id'] == sala_id)


# Comisaría · consultorio psicosocial de P1 (persiana y tubo), con lo que pone SIM-VBG-002 en el capítulo 3.
SALA_COMISARIA = _sala_de_p1('comisaria', 'consultorio-psicosocial')
COSAS_COMISARIA = [
    ('objetos_comisaria', 'afiche-rutas-atencion', 214, 268, 0, False),
    ('objetos_comisaria', 'cartelera-comisaria', 560, 258, 0, False),
    ('objetos_comisaria', 'silla-giratoria', 700, 256, 0, False),
    ('objetos_comisaria', 'papelera', 776, 262, 0, False),
    ('objetos_comisaria', 'dispensador-agua', 836, 270, 0, False),
    ('objetos_comisaria', 'escritorio-funcionario', 700, 290, 0, False),
    ('objetos_comisaria', 'carpeta-medidas-proteccion', 676, 291, 37, False),
    ('objetos_comisaria', 'planta-oficina', 140, 300, 0, False),
    ('objetos_comisaria', 'silla-visitante-comisaria', 300, 340, 0, False),
    ('objetos_comisaria', 'silla-visitante-comisaria', 420, 340, 0, True),
    ('objetos_comisaria', 'mesa-baja-nna', 360, 362, 0, False),
    ('objetos_comisaria', 'caja-panuelos', 378, 363, 24, False),
]
PERSONAS_COMISARIA = [dict(receta='profesional-psicosocial', x=520, y=350, vista='left'),
                      dict(receta='abuela-familia', x=262, y=410, vista='right')]
VISTAS = ('down', 'left', 'right', 'up')


def cuadro_kit(receta, vista, n=0):
    hoja = Image.open(os.path.join(KIT, receta, 'idle.png')).convert('RGBA')
    fila = VISTAS.index(vista)
    return hoja.crop((n * 48, fila * 72, n * 48 + 48, fila * 72 + 72))


def colocadas(cuadros=None, cosas=COSAS):
    """Cada cosa armada y con su posición en la sala: dict(pieza, im, x0, y0, x, y, sobre, espejo, n)."""
    cuadros = cuadros or {}
    lista = []
    for modulo, ref, x, y, sobre, espejo in cosas:
        p = oc.armar(modulo, ref)
        n = cuadros.get(ref, 0)
        im = p['cuadros'][n]
        if espejo:
            im = ImageOps.mirror(im)
        lista.append(dict(pieza=p, ref=ref, im=im, n=n, x=x, y=y, sobre=sobre, espejo=espejo,
                          x0=x - im.width // 2, y0=y - sobre - im.height))
    return lista


def cuerpos(cosas, personas):
    """La regla de P1 (sombra por silueta): cada cosa apoyada en el piso arroja su alfa (o su `silueta`, sin vapor ni
    rayas sueltas); lo que va encima de un mueble no arroja. Las personas, su cuadro del kit con el pie en (x, y)."""
    out = []
    for c in cosas:
        if c['sobre']:
            continue
        im = c['im']
        sil = c['pieza'].get('silueta')
        if sil:
            m = sil[c['n']]
            if c['espejo']:
                m = m[:, ::-1]
            im = im.copy()
            im.putalpha(Image.fromarray((m * 255).astype('uint8')))
        out.append(pl.cuerpo_de(im, c['x0'], c['y0']))
    for q in personas:
        out.append(pl.cuerpo_de(cuadro_kit(q['receta'], q['vista']), q['x'] - 24, q['y'] - 68, pie=(q['x'], q['y'])))
    return out


def sombras_de_contacto(tam, cosas, personas):
    sombras = Image.new('RGBA', tam, (0, 0, 0, 0))
    d = ImageDraw.Draw(sombras)
    for c in cosas:
        w = c['im'].width
        if c['sobre']:                                           # lo que va encima de un mueble: línea de contacto
            yb = c['y'] - c['sobre']
            d.ellipse([c['x'] - w // 2 - 1, yb - 3, c['x'] + w // 2 + 1, yb + 1], fill=SOMBRA)
        else:
            ry = max(3, min(9, w // 7))
            d.ellipse([c['x'] - w // 2 - 3, c['y'] - 3 - ry, c['x'] + w // 2 + 3, c['y'] - 3 + ry], fill=SOMBRA)
    for q in personas:
        d.ellipse([q['x'] - 11, q['y'] - 4, q['x'] + 11, q['y'] + 3], fill=SOMBRA)
    return sombras


def escena(momento, cuadros=None, personas=PERSONAS, sala=SALA, cosas=COSAS):
    cosas = colocadas(cuadros, cosas)
    base = sl.componer_sala(sala, momento, con_luz=False).convert('RGBA')
    # La sombra de contacto ya la pone la luz de P1 (`contacto` en calcular_luz) a partir de los cuerpos: sin óvalos.
    orden = [(c['y'] + (1 if c['sobre'] else 0), 'cosa', c) for c in cosas]
    orden += [(q['y'], 'persona', q) for q in personas]
    for _, tipo, c in sorted(orden, key=lambda t: t[0]):
        if tipo == 'cosa':
            base.alpha_composite(c['im'], (c['x0'], c['y0']))
        else:
            base.alpha_composite(cuadro_kit(c['receta'], c['vista']), (c['x'] - 24, c['y'] - 68))
    ambiente, brillo = pl.calcular_luz(sala, momento, (), cuerpos(cosas, personas))
    rgb = ImageChops.add(ImageChops.multiply(base.convert('RGB'), ambiente), brillo)
    for c in cosas:                                              # lo que emite vuelve a su color
        em = c['pieza']['emisivo']
        if em:
            m = em[c['n']]
            if c['espejo']:
                m = ImageOps.mirror(m)
            rgb.paste(c['im'].convert('RGB'), (c['x0'], c['y0']), m.getchannel('A'))
    emisores = [(c, c['pieza']['ficha']['emite']) for c in cosas if c['pieza']['ficha'].get('emite')]
    for c in cosas:                                              # reflejos: también de la luz del televisor
        extra = [orf.fuente_de_objeto(e, e['niveles'][q['n']], q['x'], q['y'], encima_de=(q['sobre'] and c['ref']))
                 for q, e in emisores if q is not c]
        for f in extra:                                          # el mueble que lo sostiene lo recibe de frente
            f['encima'] = bool(f['encima']) and abs(f['x'] - c['x']) < c['im'].width // 2 and c['sobre'] == 0
        capa = orf.capa_reflejo(c['pieza'], c['n'], c['x'], c['y'], sala, momento, c['espejo'], extra)
        if capa is not None:
            caja = (c['x0'], c['y0'], c['x0'] + capa.width, c['y0'] + capa.height)
            rgb.paste(ImageChops.add(rgb.crop(caja), capa), caja[:2])
    for c in cosas:                                              # luz propia que cae al piso
        emite = c['pieza']['ficha'].get('emite')
        if emite:
            nivel = emite['niveles'][c['n']]
            capa = orf.capa_emision(emite, nivel, c['x'], c['y'] + 1, rgb.width, rgb.height, momento,
                                    y_fuente=c['y0'] + c['im'].height // 2)
            tapa = Image.new('L', rgb.size, 255)                 # el halo no tiñe al propio televisor
            tapa.paste(0, (c['x0'], c['y0']), c['im'].getchannel('A'))
            rgb = ImageChops.add(rgb, Image.composite(capa, Image.new('RGB', rgb.size), tapa))
    return rgb


if __name__ == '__main__':
    os.makedirs(SALIDA, exist_ok=True)
    for momento in ('dia', 'noche'):
        im = escena(momento)
        im.save(os.path.join(SALIDA, f'sala-{momento}.png'))
        im.resize((im.width * 3, im.height * 3), Image.Resampling.NEAREST).save(os.path.join(SALIDA, f'sala-{momento}-x3.png'))
        print(os.path.join(SALIDA, f'sala-{momento}.png'))
