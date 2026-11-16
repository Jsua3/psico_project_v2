# Luz de las salas por piezas: referencia congelada

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
