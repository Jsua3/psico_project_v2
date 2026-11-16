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
def _de_muebles(muebles):
    """Cuerpos con la silueta de cada mueble y de cada persona, apoyados en (x, y), el centro de su base."""
    return [pl.cuerpo_de(m['im'], m['x'] - m['im'].width // 2, m['y'] - m['im'].height, pie=(m['x'], m['y']) if m.get('persona') else None)
            for m in muebles if m.get('sombra', True)]


def _personas(*lista):
    return [dict(im=ph._personaje(receta, mira)[0], x=x, y=y, persona=True) for receta, x, y, mira in lista]


# La sala ancha: muebles del hospital y de la casa, una persona y dos cajas sin dibujo (las que no traen silueta
# arrojan la de su huella: también es una entrada válida).
CUERPOS_ANCHA = (_de_muebles([dict(im=ph.mueble(ref)[0], x=x, y=y) for ref, x, y in
                              (('camilla', 520, 330), ('portasuero', 1000, 300), ('sillas-espera', 1620, 420))]
                             + _personas(('sobreviviente', 760, 400, 'abajo')))
                 + [pl.cuerpo(1300, 330, 50, 22), pl.cuerpo(300, 400, 46, 40)])


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
    cuerpos_sala = _de_muebles(pv.muebles_de_biblioteca('casa', 'sala')
                               + _personas(('sobreviviente', 560, 360, 'izquierda'), ('valentina', 470, 372, 'derecha')))
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
                pulidos=list(pl.PULIDOS), reflejo=pl.REFLEJO, luna=pl.LUNA, vidriadas=dict(pl.VIDRIADAS), contacto=pl.CONTACTO, tablaAmbienteNoche=pl.TABLA_AMBIENTE_NOCHE.tolist(),
                tablaReflejo={t: [list(c) for c in v] for t, v in pl.TABLA_REFLEJO.items()}, umbralReflejo=pl.UMBRAL_REFLEJO,
                enSombra=dict(pl.EN_SOMBRA), sombraPropia=pl.SOMBRA_PROPIA, sombraAlSol=pl.SOMBRA_AL_SOL, alturaTubo=pl.ALTURA_TUBO,
                topeSombra=dict(pl.TOPE_SOMBRA), umbralDominio=pl.UMBRAL_DOMINIO, cenital=list(pl.CENITAL),
                matrizHaz={k: list(v) for k, v in pl.MATRIZ_HAZ.items()}, senosHaz={k: list(v) for k, v in pl.SENOS_HAZ.items()},
                direcciones=[list(d) for d in pl.DIRECCIONES], sombraMaxima=pl.SOMBRA_MAXIMA,
                bayer=pl.BAYER.tolist(), tablaAmbiente=pl.TABLA_AMBIENTE.tolist(), tablaCalida=pl.TABLA_CALIDA.tolist(),
                tablaFria=pl.TABLA_FRIA.tolist())


def generar():
    """(datos de casos.json, {ruta relativa a biblioteca/: imagen RGB})."""
    lista, imagenes = casos(), {}
    for caso in lista:
        # Los cuerpos van completos (con su máscara) y se calculan desde los mismos datos que se escriben.
        caso['cuerpos'] = [pl.cuerpo_a_json(c) for c in caso['cuerpos']]
        cuerpos = [pl.cuerpo_de_json(c) for c in caso['cuerpos']]
        caso['salidas'] = {}
        for momento in MOMENTOS:
            ambiente, brillo = pl.calcular_luz(caso['sala'], momento, caso['abiertas'], cuerpos)
            rutas = {capa: f'{CARPETA}/referencia/{caso["id"]}-{momento}-{capa}.png' for capa in ('ambiente', 'brillo')}
            imagenes[rutas['ambiente']], imagenes[rutas['brillo']] = ambiente, brillo
            caso['salidas'][momento] = rutas
        # Brillo del vidrio y el metal: en cada punto de muestra, (k, tono) de día y de noche.
        ancho = caso['sala']['estructura']['ancho']
        puntos = [[x, y] for y in (254, 330, 420) for x in range(ancho // 8, ancho, ancho // 4)]
        caso['matrices'] = dict(puntos=puntos, **{m: [list(x) for x in pl.matrices_de_sombra(caso['sala'], m, puntos, abiertas=caso['abiertas'])]
                                                  for m in MOMENTOS})
        caso['reflejos'] = dict(puntos=puntos, **{m: [list(r) for r in pl.reflejos(caso['sala'], m, caso['abiertas'], cuerpos, puntos)]
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
- `cuerpos`: muebles y personas sobre el piso. Cada uno trae su **silueta**: `mascara` (filas de texto del tamaño
  del dibujo, `#` opaco y `.` transparente: el alfa del sprite desde 128), su apoyo dentro del dibujo (`px`, `py`:
  columna del apoyo y fila siguiente a la última opaca) y en la sala (`x`, `y`), su `alto` (de la primera fila opaca
  al apoyo) y su huella `{x0, x1, y0, y1}`, que solo sirve para la sombra de contacto y para saber si una lámpara
  está encima. Se arma con `cuerpo_de(dibujo, x, y, pie)` (dibujo con su esquina en (x, y); `pie`, el punto donde
  pisa una persona). Huella de un mueble de `ancho × alto` apoyado en (cx, cy): `fondo = max(8, min(16, ancho // 5))`,
  `x0 = cx − ancho // 2 + 2`, `x1 = cx + ancho // 2 − 2`, `y0 = cy − fondo`, `y1 = cy`; de una persona,
  `x ± 9`, `y − 10 … y`.

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
   - Luna: de noche, cada ventana (haz del fondo o lateral) que no esté `encendida: false` emite con la misma
     forma de su haz, `fuerza = luna` (22) y tono `frio`, sea cual sea su tono de día. Arroja las mismas sombras.
   - Piso pulido (`_reflejo_piso`): el piso suma brillo, sin subir L, bajo cada ventana del fondo que emite
     (largo 110), bajo cada tubo o colgante del fondo (ancho ±26 o ±14, largo 90), bajo cada puerta ABIERTA del
     fondo (largo 60, fuerza 100, cálido) y bajo cada puerta CERRADA del fondo cuyo modelo esté en `vidriadas`
     (`ancho // 2 − 6` a cada lado de su centro, largo 70, fuerza `vidriadas[modelo]`, tono frío, de día y de
     noche): `tono = max(tono, mancha * fuerza // 100 * reflejo // 1024)` con `reflejo` 900. Los bordes laterales
     de la franja se deshacen en 10 px: `clip(dentro * 96 + 192, 0, 1024) * caida // 1024`.
3. Sombras de los cuerpos (`_sombras`): cada cuerpo arroja su **silueta** tendida sobre el piso (ver «La sombra
   proyectada», abajo). Donde cae alguna, la luz es la de `combinar(a_la_sombra=True)`: cada fuente que un cuerpo
   puede tapar (haz, pozo, tubo) entra con su mancha menos `mancha * enSombra[clase] // 1024` (768 el haz y el pozo,
   384 el tubo); los halos del muro, la franja del tubo, la cuña de la puerta y los reflejos del piso entran
   iguales; y al final el piso baja `sombraPropia` escalones (1; al sol, `sombraAlSol` = 2): `L − paso * escalones`.
   Fuera de las sombras, la luz es la de `combinar(False)`. Los dos acumuladores de tono se eligen igual.
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

## La sombra proyectada: la silueta de quien la arroja

Un píxel del dibujo en la columna `col` y la fila `fila` está a `u = col − px` px a la derecha del apoyo y a
`h = py − 1 − fila` px de altura. Su sombra cae en el piso en `(x + (a·u + b·h) // 64, y + (c·u + d·h) // 64)`, con
la matriz `(a, b, c, d)` de la fuente que manda. Para pintarla sin agujeros se recorre al revés: para cada píxel
(X, Y) del piso cerca del cuerpo, `ex = X − x`, `ey = Y − y`, `det = a·d − b·c`,
`u = (d·ex − b·ey) * 64 // det`, `h = (a·ey − c·ex) * 64 // det`; está en sombra si `h ≥ 0` y el píxel
(`px + u`, `py − 1 − h`) del dibujo existe y es opaco. División entera hacia abajo, también con negativos.

1. **Quién manda.** En el apoyo (x, y) de cada cuerpo (recortado a la sala y a `y ≥ 230`), cada fuente que puede
   tapar da `fuerza * mancha[y][x]` (la mancha sin sombras, de 0 a 1024). Manda la que más da, si llega a
   `umbralDominio` (12800); en un empate, la primera en el orden de las piezas. Se salta la lámpara que está encima del
   cuerpo (su punto cae en la huella agrandada 8 px). Al aire libre y de día manda siempre el sol.
2. **La matriz.**
   - Haz de una ventana del fondo, o el sol: `matrizHaz.fondo` (60, 28, −11, 40). Ventana del muro izquierdo:
     `matrizHaz.izquierda` (36, 48, −27, 16); del derecho, `matrizHaz.derecha` (36, −48, 27, 16).
   - Pozo o tubo en (lx, ly) a `altura` px del piso (pozo: `luz.altura + sobre`; tubo: `alturaTubo` = 360, puesto
     en `y = 230 + 120`): `dx = x − lx`, `dy = y − ly`, `n = floor(sqrt(dx² + dy²))`. Si `n < 4`, la cenital.
     Dirección `i = direccion(dx, 2·dy)` (una de 16, ver abajo) y largo en octavos del alto
     `k8 = min(max(n * 8 // max(altura − alto, 16), 2), tope)`, con
     `tope = max(2, min(topeSombra[clase], sombraMaxima * 8 // alto))` (`topeSombra`: pozo 12, tubo 3: bajo un tubo
     la sombra es corta y queda casi debajo). Con `[Dx, Dy, Px, Py] = direcciones[i]`, la matriz es
     `(Px, Dx * k8 // 8, Py, Dy * k8 // 8)`.
   - Ninguna fuente manda: la cenital, `i, k8 = cenital` (4, 3): corta y hacia la cámara.
3. **El ancho visto desde la fuente.** La silueta es el dibujo visto de frente; si la luz llega de lado, se ve el
   fondo del cuerpo y no su ancho. Con `ancho = max(x1 − x0, 1)` y `fondo = y1 − y0` de la huella,
   `s = min(max((ancho * seno + 2 * fondo * coseno) // ancho, 8), 64)` y la matriz final es
   `(a * s // 64, b, c * s // 64, d)`. `(seno, coseno)`: del haz, `senosHaz`; de una lámpara, `(2·|Dy|, |Dx|)`.
4. **`direccion(dx, dy)`**, sin divisiones: `ax = |dx|`, `ay = |dy|`; `q` = 0 si `ay·256 ≤ ax·51`, 1 si
   `≤ ax·171`, 2 si `≤ ax·383`, 3 si `≤ ax·1287` y 4 si no. Si `dy ≥ 0`: `i = q` si `dx ≥ 0`, si no `8 − q`.
   Si `dy < 0`: `i = (16 − q) % 16` si `dx ≥ 0`, si no `8 + q`. Las 16 direcciones van de 22,5° en 22,5°: la sombra
   no tiembla al moverse, solo salta cuando el cuerpo cruza el borde de un sector o cambia la fuente que manda.
5. **El borde.** La unión de las siluetas se agranda 1 px (4 vecinos) solo donde `bayer[y % 4][x % 4] < 8`: el
   borde queda tramado al 50 %. Luego se recorta al piso (la sombra se corta donde empieza el muro) y se le quitan
   los píxeles que tapa el dibujo de cada cuerpo (con su máscara puesta en `(x − px, y − py)`).
6. **La sombra de contacto** (regla 4 de «El cálculo») sigue debajo, pequeña y a los pies.

`casos.json` trae en `matrices` la matriz de una persona de alto 64 en doce puntos por caso, de día y de noche: la
prueba más corta de los pasos 1 a 4.

## La sombra de quien camina

La luz de la sala (con los muebles y las personas quietas como cuerpos) se calcula una vez al entrar y al cambiar
algo. `calcular_luz(..., todo_en_sombra=True)` da además las dos capas como quedan DENTRO de una sombra en todo el
piso (`combinar(a_la_sombra=True)` en cada píxel del piso, sin cuerpos). Para quien camina, en cada cuadro:

1. Su silueta es el alfa (≥ 128) del **cuadro de animación que se está viendo**; `px` = la columna de sus pies en
   el cuadro (24 en las hojas de 48 × 72) y `py` = la fila siguiente a la última opaca. Así su sombra camina con él.
2. Su apoyo en la sala es `(x, y − 68 + py)` con (x, y) donde pisa; su `alto`, de la primera fila opaca a `py`.
3. La matriz se calcula con los pasos 1 a 3 en ese apoyo, con su huella `x ± 9`, `y − 10 … y`. Solo cambia
   cuando cruza un sector de dirección o la zona de otra fuente (con la mancha de cada fuente guardada al entrar).
4. Se tiende la silueta (paso 5 incluido) en una máscara del tamaño de su caja y, dentro de ella, se muestran las
   capas «en sombra» en lugar de las normales. Lo que se dibuja delante tapa la sombra (cada sprite borra su
   silueta de la máscara, en el mismo orden en que se pinta), y fuera del piso las dos capas coinciden.

La vista previa (`maqueta-visual/piezas/vista.html`) hace esto mismo con la matriz precalculada en una rejilla de
16 px; el juego debe calcularla en el píxel donde pisa.
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
