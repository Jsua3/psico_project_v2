"""Referencia congelada de la luz: seis salas, de día y de noche, como datos de entrada y como imagen.

El cliente escribe su `calcularLuz` y su prueba exige igualdad píxel a píxel contra estas imágenes.

    python tools/escenarios/piezas_luz_referencia.py              # escribe biblioteca/piezas/luz/
    python tools/escenarios/piezas_luz_referencia.py --verificar  # sale con 1 si lo versionado ya no es lo que se calcula

Escribe en `biblioteca/piezas/luz/`:

- `casos.json`: los seis casos (sala, puertas abiertas y cuerpos), el trozo de catálogo que usan y las constantes;
- `referencia/<caso>-<momento>-ambiente.png` y `-brillo.png`: lo que debe salir;
- `LEEME.md`: las reglas para portar el cálculo sin perder un píxel.

«Congelada» quiere decir que una prueba compara lo versionado con lo que hoy calcula `piezas_luz.py`: si alguien
cambia la luz, la prueba falla hasta que regenere la referencia a propósito (y el cliente se entera).
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
sys.path.insert(0, AQUI)
import piezas_hospital as ph  # noqa: E402
import piezas_luz as pl  # noqa: E402
import piezas_muro as pm  # noqa: E402
import piezas_puertas as pp  # noqa: E402
import piezas_sala as sl  # noqa: E402
import piezas_vista as pv  # noqa: E402

BIBLIOTECA = os.path.join(RAIZ, 'biblioteca')
CARPETA = 'piezas/luz'
MOMENTOS = ('dia', 'noche')

ANCHA = {
    'encuadre': 'dos-paredes-izquierda',
    'estructura': {'ancho': 1920, 'acabados': {'piso': 'damero'}, 'piezas': [
        {'id': 'ventanal', 'tipo': 'ventana', 'modelo': 'ventanal', 'muro': 'fondo', 'pos': 400},
        {'id': 'persiana', 'tipo': 'ventana', 'modelo': 'persiana', 'muro': 'fondo', 'pos': 1200},
        {'id': 'lateral', 'tipo': 'ventana', 'modelo': 'corrediza', 'muro': 'izquierda', 'pos': 150},
        {'id': 'colgante', 'tipo': 'lampara', 'modelo': 'colgante', 'muro': 'fondo', 'pos': 900},
        {'id': 'tubo', 'tipo': 'lampara', 'modelo': 'tubo', 'muro': 'fondo', 'pos': 1500},
        {'id': 'pie', 'tipo': 'lampara', 'modelo': 'pie', 'x': 700, 'y': 380},
        {'id': 'mesa', 'tipo': 'lampara', 'modelo': 'mesa', 'x': 1300, 'y': 332, 'sobre': 18, 'encendida': True},
    ]},
    'puertas': [{'id': 'p-fondo', 'muro': 'fondo', 'pos': 700, 'modelo': 'madera'},
                {'id': 'p-camara', 'muro': 'camara', 'pos': 900, 'modelo': 'urgencias'}],
}
CUERPOS_ANCHA = [pl.cuerpo(520, 330, 88, 44), pl.cuerpo(760, 400, 48, 72, persona=True), pl.cuerpo(1300, 330, 50, 22),
                 pl.cuerpo(1000, 300, 26, 74), pl.cuerpo(300, 400, 46, 40), pl.cuerpo(1620, 420, 98, 48)]


def _de_muebles(muebles):
    return [pl.cuerpo(m['x'], m['y'], m['im'].width, m['im'].height, persona=bool(m.get('persona'))) for m in muebles if m.get('sombra', True)]


def _solo_luz(sala):
    """De la sala, solo lo que la luz mira: así el caso se entiende y no cambia si cambia un mueble."""
    est = sala['estructura']
    estructura = {'ancho': est['ancho'], 'piezas': [dict(p) for p in est.get('piezas', []) if (p.get('tipo'), p.get('modelo')) in pm.PIEZAS
                                                    and pm.PIEZAS[(p['tipo'], p['modelo'])].get('luz')]}
    if est.get('exterior'):
        estructura['exterior'] = True
    if est.get('acabados', {}).get('piso'):
        estructura['acabados'] = {'piso': est['acabados']['piso']}
    return {'encuadre': sala['encuadre'], 'estructura': estructura,
            'puertas': [dict(id=p['id'], muro=p['muro'], pos=p['pos'], modelo=p['modelo']) for p in sala.get('puertas', [])]}


def casos():
    import vivo
    _, _, muebles_sala, _ = vivo.leer_escena()
    cuerpos_sala = ([pl.cuerpo(m['x'], m['y'], m['ancho'], m['alto']) for m in muebles_sala]
                    + [pl.cuerpo(560, 360, 48, 72, persona=True), pl.cuerpo(470, 372, 48, 72, persona=True)])
    with open(os.path.join(BIBLIOTECA, 'piezas', 'lugares', 'casa.json'), encoding='utf-8') as f:
        fachada = next(s for s in json.load(f)['salas'] if s['id'] == 'fachada')
    return [
        dict(id='casa-sala', descripcion='Sala de 960 con tres muros: ventana al fondo, lámpara de pie siempre encendida y una puerta abierta.',
             sala=_solo_luz(sl.CASA_SALA), abiertas=['puerta-comedor'], cuerpos=cuerpos_sala),
        dict(id='hospital-pasillo', descripcion='Pasillo de 1680: cuatro tubos fríos, una ventana alta y una puerta abierta.',
             sala=_solo_luz(ph.PASILLO), abiertas=['a-escucha'], cuerpos=_de_muebles(ph.muebles_de(ph.PASILLO))),
        dict(id='hospital-sala-escucha', descripcion='Sala de 960 con luz cálida: lámpara de pie y lámpara de mesa sobre una mesa.',
             sala=_solo_luz(ph.ESCUCHA), abiertas=[], cuerpos=_de_muebles(ph.muebles_de(ph.ESCUCHA))),
        dict(id='hospital-entrada', descripcion='Entrada de 1200: ventanal en el muro derecho, ventana alta al fondo y dos tubos.',
             sala=_solo_luz(ph.ENTRADA), abiertas=['a-espera'], cuerpos=_de_muebles(ph.muebles_de(ph.ENTRADA))),
        dict(id='casa-fachada', descripcion='Exterior de 960 con un solo muro: luz de día, sombras del sol y noche sin lámparas.',
             sala=_solo_luz(fachada), abiertas=[], cuerpos=_de_muebles(pv.muebles_de_biblioteca('casa', 'fachada'))),
        dict(id='ancha-1920', descripcion='Sala de 1920 sin muro derecho: ventanas al fondo y a la izquierda, las cuatro lámparas y una puerta abierta.',
             sala=ANCHA, abiertas=['p-fondo'], cuerpos=CUERPOS_ANCHA),
    ]


def catalogo(lista):
    """Las fichas del manifiesto que usan los casos: de cada pieza, su `luz`; de cada puerta, el ancho del vano."""
    fichas = {}
    for caso in lista:
        for p in caso['sala']['estructura']['piezas']:
            F = pm.PIEZAS[(p['tipo'], p['modelo'])]
            fichas[f'{p["tipo"]}/{p["modelo"]}'] = {'luz': dict(F['luz'], **{k: F[k] for k in ('antepecho', 'alto') if k in F})}
        for p in caso['sala']['puertas']:
            fichas['puerta/' + p['modelo']] = {'ancho': pp.MODELOS[p['modelo']]['ancho']}
    return dict(sorted(fichas.items()))


def constantes():
    return dict(unidad=pl.U, minimo=pl.MINIMO, paso=pl.PASO, niveles=pl.NIVELES, uno=pl.UNO,
                penumbra=dict(dia=pl.PENUMBRA, noche=pl.PENUMBRA_NOCHE, exteriorDia=pl.EXTERIOR, exteriorNoche=pl.EXTERIOR_NOCHE),
                pulidos=list(pl.PULIDOS), reflejo=pl.REFLEJO, contacto=pl.CONTACTO, tablaAmbienteNoche=pl.TABLA_AMBIENTE_NOCHE.tolist(),
                tablaReflejo={t: [list(c) for c in v] for t, v in pl.TABLA_REFLEJO.items()}, umbralReflejo=pl.UMBRAL_REFLEJO,
                enSombra=pl.EN_SOMBRA, hazFondo=list(pl.HAZ_FONDO), hazLado=list(pl.HAZ_LADO), sombraMaxima=pl.SOMBRA_MAXIMA,
                bayer=pl.BAYER.tolist(), tablaAmbiente=pl.TABLA_AMBIENTE.tolist(), tablaCalida=pl.TABLA_CALIDA.tolist(),
                tablaFria=pl.TABLA_FRIA.tolist())


def generar():
    """(datos de casos.json, {ruta relativa a biblioteca/: imagen RGB})."""
    lista, imagenes = casos(), {}
    for caso in lista:
        caso['salidas'] = {}
        for momento in MOMENTOS:
            ambiente, brillo = pl.calcular_luz(caso['sala'], momento, caso['abiertas'], caso['cuerpos'])
            rutas = {capa: f'{CARPETA}/referencia/{caso["id"]}-{momento}-{capa}.png' for capa in ('ambiente', 'brillo')}
            imagenes[rutas['ambiente']], imagenes[rutas['brillo']] = ambiente, brillo
            caso['salidas'][momento] = rutas
        # Brillo del vidrio y el metal: en cada punto de muestra, (k, tono) de día y de noche.
        ancho = caso['sala']['estructura']['ancho']
        puntos = [[x, y] for y in (254, 330, 420) for x in range(ancho // 8, ancho, ancho // 4)]
        caso['reflejos'] = dict(puntos=puntos, **{m: [list(r) for r in pl.reflejos(caso['sala'], m, caso['abiertas'], caso['cuerpos'], puntos)]
                                                  for m in MOMENTOS})
    return dict(version=1, constantes=constantes(), catalogo=catalogo(lista), casos=lista), imagenes


def _serializar(datos):
    return json.dumps(datos, ensure_ascii=False, indent=1, sort_keys=True) + '\n'


def escribir(biblioteca=BIBLIOTECA):
    datos, imagenes = generar()
    for ruta, im in imagenes.items():
        archivo = os.path.join(biblioteca, *ruta.split('/'))
        os.makedirs(os.path.dirname(archivo), exist_ok=True)
        with open(archivo, 'wb') as f:
            f.write(pv._png(im))
    for nombre, texto in (('casos.json', _serializar(datos)), ('LEEME.md', LEEME)):
        with open(os.path.join(biblioteca, *CARPETA.split('/'), nombre), 'w', encoding='utf-8', newline='') as f:
            f.write(texto)
    return datos, len(imagenes)


def verificar(biblioteca=BIBLIOTECA):
    """Diferencias entre la referencia versionada y lo que hoy se calcula (lista vacía = sigue congelada)."""
    datos, imagenes = generar()
    fallas = []
    archivo = os.path.join(biblioteca, *CARPETA.split('/'), 'casos.json')
    if not os.path.exists(archivo):
        return ['falta ' + CARPETA + '/casos.json']
    with open(archivo, encoding='utf-8') as f:
        if f.read() != _serializar(datos):
            fallas.append(CARPETA + '/casos.json cambió')
    for ruta, im in imagenes.items():
        en_disco = os.path.join(biblioteca, *ruta.split('/'))
        if not os.path.exists(en_disco):
            fallas.append(ruta + ' no existe')
        elif not np.array_equal(np.array(Image.open(en_disco).convert('RGB')), np.array(im)):
            fallas.append(ruta + ' ya no es lo que calcula piezas_luz.py')
    return fallas


LEEME = """# Luz de las salas por piezas: referencia congelada

`casos.json` trae seis salas con todo lo que la luz necesita y `referencia/` trae lo que debe salir de cada una,
de día y de noche: `<caso>-<momento>-ambiente.png` (se MULTIPLICA sobre la escena) y `-brillo.png` (se SUMA).
La prueba del cliente debe dar esas imágenes píxel a píxel. La fuente es `tools/escenarios/piezas_luz.py`
(`niveles` y `calcular_luz`); este archivo dice cómo leerla sin perder un píxel.

## Entradas

- `sala.encuadre` y `sala.estructura.ancho` dan la geometría (ver `geometria` en `piezas/manifiesto.json`).
- `sala.estructura.piezas`: solo las que emiten. Cada una busca su ficha en `catalogo["<tipo>/<modelo>"].luz`
  (es la misma `luz` del manifiesto): `forma` (haz, pozo, tubo), `momento` en que emite, `tono` (calido, frio),
  `fuerza` (0 a 100, por defecto 100) y sus medidas (`ancho`, `antepecho` y `alto` en el haz; `radio` y `altura` en la lámpara).
- `encendida` en la pieza (booleano opcional): `false` no emite; `true` emite también fuera de su momento, al 60 % de su fuerza.
- `sala.estructura.exterior`: sala al aire libre.
- `sala.estructura.acabados.piso`: si es uno de `pulidos` (vinilo, baldosa, damero), el piso devuelve la luz.
- `luz.parteluces` de cada ventana: la forma del haz, en fracciones de 0 a 1024. `verticales`: parteluces a lo ancho
  del haz; `horizontales`: travesaños a lo largo (0 = junto al muro); `lamas`: `[desde, hasta, paso]`, el tramo que
  cubre la persiana y cada cuántos px se repite una lama. Sin `parteluces` vale `{verticales: [512]}`.
- `abiertas`: ids de puertas abiertas (solo las del muro del fondo dejan la cuña de luz; su ancho es `catalogo["puerta/<modelo>"].ancho`).
- `cuerpos`: muebles y personas sobre el piso, como `{x0, x1, y0, y1, alto}` (huella en px de sala y altura). Se
  construyen con `cuerpo(x, y, ancho, alto, persona)` a partir del sprite: para un mueble apoyado en (x, y),
  `fondo = max(8, min(16, ancho // 5))`, `x0 = x − ancho // 2 + 2`, `x1 = x + ancho // 2 − 2`, `y0 = y − fondo`,
  `y1 = y`, `alto = max(8, alto − fondo // 2)`; para una persona, `x ± 9`, `y − 10 … y`, alto 60.

## Reglas de aritmética (las que hacen posible la igualdad)

1. Todo es entero. La luz va en diezmilésimas (`unidad` 10000 = 1,00) y las mezclas en 1/1024 (`uno`).
2. **Toda división es entera y redondea hacia abajo, también con negativos**: en JavaScript, `Math.floor(a / b)`,
   nunca `Math.trunc` ni `| 0`. Hay operandos negativos (por ejemplo los píxeles a la izquierda de un haz).
3. La única raíz es `Math.floor(Math.sqrt(n))` con n entero menor que 2^31.
4. `np.clip(v, a, b)` es `Math.min(Math.max(v, a), b)`. Una máscara booleana multiplica como 0 o 1.
5. El orden de las operaciones es el del código: `a * b // c * d // e` se evalúa de izquierda a derecha.

## El cálculo, en orden

1. Base: `penumbra.dia` o `.noche` (o las de exterior). `ganancia = unidad − base`.
2. Cada emisor activo produce una mancha de 0 a 1024 por píxel y se combina con
   `L = max(L, base + ganancia * fuerza // 100 * peso // 1024 * mancha // 1024)` y
   `tono = max(tono, mancha * fuerza // 100 * color // 1024)` (dos acumuladores: cálido y frío).
   - Haz de una ventana del fondo (`_haz_fondo`): mancha sobre el piso y halo sobre el muro (peso 2/3, color 1/2).
     Cada parteluz, travesaño o lama deja la mancha al 35 % (`luz * 35 // 100`) en su línea.
   - Haz de una ventana lateral (`_haz_lado`).
   - Pozo de una lámpara (`_pozo`, color 9/10) más un halo en el muro (peso 1/2, color 4/10).
   - Tubo: el mismo pozo más una franja en el muro (peso 8/10, color 1/2).
   - Cuña de la puerta abierta del fondo (peso 2/3 de día y 4/10 de noche, color 4/10).
   - Piso pulido (`_reflejo_piso`): bajo cada ventana del fondo que emite (largo 90), bajo cada tubo o colgante del
     fondo (ancho ±26 o ±14, largo 70) y bajo cada puerta abierta del fondo (largo 60) el piso suma brillo, sin
     subir L: `tono = max(tono, mancha * fuerza // 100 * reflejo // 1024)` con `reflejo` 600.
3. Sombras de los cuerpos (`_sombra`): antes de combinar, la mancha de un haz o de un pozo pierde 3/4
   (`enSombra` 768/1024) donde un cuerpo tapa la luz: `mancha − mancha * sombra * 768 // 1024`.
   - Ventana del fondo: dirección `hazFondo` (45, 64) y largo `alto * 5 // 8`.
   - Ventana lateral: dirección (64, 22) desde el muro izquierdo o (−64, 22) desde el derecho, largo `alto * 3 // 4`.
   - Lámpara (`_sombra_de_lampara`): por cada cuerpo, dirección del centro de la lámpara al centro de su huella,
     normalizada a 64avos con divisiones enteras; largo `min(alto * n // max(altura − alto, 16), sombraMaxima)`.
     Se salta el cuerpo que tiene la lámpara encima. El tubo no arroja sombra.
   - Al aire libre y de día, la sombra del sol baja la luz dos escalones (`L − 2 * paso`).
4. Sombra de contacto (`_contacto`): por cada cuerpo, una elipse a sus pies (centro en el medio de la huella y
   `y1 − 2`; radios `ancho_huella // 2 + 5` y `max(4, fondo_huella // 2 + 3)`): `L −= contacto * paso * m // 1024`,
   con `m = min(2 * clip(1024 − r, 0, 1024), 1024)` y r la distancia normalizada. Va después de las fuentes.
   Luego las sombras de rincón al pie del muro del fondo y de los laterales, y la viñeta (multiplican L).
5. Cuantización con Bayer 4×4: `q = clip(L − minimo, 0, paso * niveles)`,
   `nivel = clip(q // paso + ((q % paso) * 16 > bayer[y % 4][x % 4] * paso), 0, niveles)`.
   `ambiente = tablaAmbiente[nivel]` de día y `tablaAmbienteNoche[nivel]` de noche. Para cada tono: `a = tono * 3`,
   `escalon = clip(a // 1024 + ((a % 1024) * 16 > bayer * 1024), 0, 3)`;
   `brillo = min(255, tablaCalida[escalonCalido] + tablaFria[escalonFrio])` por canal.

## Brillo: vidrio, metal y barniz

Nada trae pintado un reflejo propio: lo que brilla va en el **mapa de brillo** del sprite (`brillo` en el manifiesto),
una tira igual a la del dibujo con solo esos píxeles (gris 255 vidrio, 170 metal, 85 barniz), y se enciende con la
luz de la sala.

1. `reflejos(sala, momento, abiertas, cuerpos, puntos)` da para cada punto `(k, tono)`: sobre la luz de las fuentes
   (antes de la sombra de contacto, las de rincón, la viñeta y el tramado), `k = clip((L − minimo) // paso − umbralReflejo, 0, 3)`
   y `tono` = `frio` si el acumulador frío supera al cálido y vale 128 o más; si no, `calido` si el cálido vale 128 o
   más; si no, `neutro`. `casos.json` trae en `reflejos` doce puntos por caso con su resultado de día y de noche.
2. Dónde se mide: pieza del muro del fondo, 24 px delante de su ancla (`y = 254`); de un muro lateral, 24 px hacia
   la sala; del lado de la cámara, en `y = 498`; mueble o lámpara de piso, en el centro de su base, 1 px arriba.
3. Cada píxel del mapa suma `tablaReflejo[tono][clip(k − (3 − gris // 85), 0, 3)]`: el vidrio brilla con cualquier
   luz, el metal pide un escalón más y el barniz dos.
4. Lo que está delante tapa el brillo de lo de atrás: se pinta en una capa aparte, en el mismo orden que los
   sprites (cada sprite borra su silueta y luego suma su mapa), y esa capa se suma al final, después de `brillo`.

## La sombra de quien camina

`calcular_luz(..., todo_en_sombra=True)` da las dos capas como quedarían si algo tapara cada ventana, cada lámpara
y el sol en todo el piso. La sombra de un personaje es mostrar esas capas dentro del polígono que barre su huella
(`x ± 9`, `y − 10 … y`, alto 60) en la dirección de cada fuente, con el largo de la regla 3 de «El cálculo».

## Para el juego

La luz de la sala (con los muebles como cuerpos) se calcula una vez al entrar y al cambiar algo. La sombra de un
personaje que camina no hace falta recalcularla con toda la sala: es la misma regla aplicada a un solo cuerpo, y
se puede dibujar aparte como un polígono (la huella barrida en la dirección de la luz) solo donde hay haz o pozo.
"""


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
    print(f'{len(datos["casos"])} casos, {cuantas} imagenes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
