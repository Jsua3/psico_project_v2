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
- `encendida` en la pieza: `nunca` no emite; `siempre` emite también fuera de su momento, al 60 % de su fuerza.
- `sala.estructura.exterior`: sala al aire libre.
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
   - Haz de una ventana lateral (`_haz_lado`).
   - Pozo de una lámpara (`_pozo`, color 9/10) más un halo en el muro (peso 1/2, color 4/10).
   - Tubo: el mismo pozo más una franja en el muro (peso 8/10, color 1/2).
   - Cuña de la puerta abierta del fondo (peso 2/3 de día y 4/10 de noche, color 4/10).
3. Sombras de los cuerpos (`_sombra`): antes de combinar, la mancha de un haz o de un pozo pierde 3/4
   (`enSombra` 768/1024) donde un cuerpo tapa la luz: `mancha − mancha * sombra * 768 // 1024`.
   - Ventana del fondo: dirección `hazFondo` (45, 64) y largo `alto * 5 // 8`.
   - Ventana lateral: dirección (64, 22) desde el muro izquierdo o (−64, 22) desde el derecho, largo `alto * 3 // 4`.
   - Lámpara (`_sombra_de_lampara`): por cada cuerpo, dirección del centro de la lámpara al centro de su huella,
     normalizada a 64avos con divisiones enteras; largo `min(alto * n // max(altura − alto, 16), sombraMaxima)`.
     Se salta el cuerpo que tiene la lámpara encima. El tubo no arroja sombra.
   - Al aire libre y de día, la sombra del sol baja la luz dos escalones (`L − 2 * paso`).
4. Sombras de rincón al pie del muro del fondo y de los laterales, y viñeta (multiplican L).
5. Cuantización con Bayer 4×4: `q = clip(L − minimo, 0, paso * niveles)`,
   `nivel = clip(q // paso + ((q % paso) * 16 > bayer[y % 4][x % 4] * paso), 0, niveles)`.
   `ambiente = tablaAmbiente[nivel]`. Para cada tono: `a = tono * 3`,
   `escalon = clip(a // 1024 + ((a % 1024) * 16 > bayer * 1024), 0, 3)`;
   `brillo = min(255, tablaCalida[escalonCalido] + tablaFria[escalonFrio])` por canal.

## Para el juego

La luz de la sala (con los muebles como cuerpos) se calcula una vez al entrar y al cambiar algo. La sombra de un
personaje que camina no hace falta recalcularla con toda la sala: es la misma regla aplicada a un solo cuerpo, y
se puede dibujar aparte como un polígono (la huella barrida en la dirección de la luz) solo donde hay haz o pozo.
