# Guía de arte de los escenarios

Cómo se hace el arte de un lugar de la biblioteca para que todas las salas se vean del mismo
juego que el simulador: pixel art auténtico, la misma cámara y la misma paleta apagada.

El arte de hoy es **provisional**. El de la universidad está **dibujado por código**
(`tools/escenarios/arte_universidad.py`): el 2026-10-24 la cuenta de Higgsfield no tenía
créditos y el usuario eligió dibujarlo así. Las plantillas de IA de la sección 4 quedan para
los lugares siguientes o por si se compran créditos. Cuando lleguen las fotos propias se
reemplazan **solo los PNG**, con el mismo nombre de archivo: el `escenario.json` no cambia.

## 1. Cámara y encuadre

Vista **frontal-superior**: la cámara mira de frente a la pared del fondo, un poco desde
arriba, como en las salas actuales del juego. Nada de vista isométrica ni cenital pura.

El lienzo mide **960 × 528 px**. Las bandas que usa el juego para los choques son:

| Banda | Qué es |
|---|---|
| y = 0–236 | pared del fondo (en el dibujo, la unión con el piso cae hacia y ≈ 220–236) |
| y = 236–486 | piso caminable |
| y = 486–528 | borde delantero (piso fuera de juego, sin muebles) |
| x = 0–96 | pared lateral izquierda, si el encuadre la tiene |
| x = 864–960 | pared lateral derecha, si el encuadre la tiene |

Qué paredes se ven según el encuadre:

| Encuadre | Paredes visibles | Suelo caminable |
|---|---|---|
| `tres-paredes` | fondo, izquierda y derecha (sala cerrada) | x 96–864 |
| `dos-paredes-izquierda` | fondo e izquierda (esquina; el lado derecho sigue abierto) | x 96–936 |
| `dos-paredes-derecha` | fondo y derecha (esquina; el lado izquierdo sigue abierto) | x 24–864 |
| `una-pared` | solo el fondo (fachada, pasillo largo, fondo de un parque) | x 24–936 |

Las paredes laterales se dibujan **en perspectiva**: se juntan con la pared del fondo cerca de
x = 96 (o 864) a la altura del piso y se abren hacia el borde del lienzo hacia abajo, como en
la carcasa de `case-pdf-rooms.renderer.ts`.

El fondo de sala lleva **solo la arquitectura y lo que está fijo en la pared** (ventanas,
tablero, cuadros sin texto, repisas empotradas). Los muebles que se pueden mover van aparte,
como piezas del catálogo, para que el docente los pueda mover o quitar.

## 2. Paleta

Medida sobre dos carcasas actuales, `hospital-urgencias` y `comisaria-consultorio`
(paredes, piso, uniones y luces de `case-pdf-rooms.renderer.ts`): **30 colores cada una**.
Los muebles actuales (`frontend/src/assets/game/furniture/`) usan **entre 15 y 26 colores**
cada uno, y el contrato del arte del mundo pone el techo en 40.

Reglas:

- **Fondo de sala: como máximo 32 colores** (el valor por defecto de `pixelar_sala.py`).
- **Mueble: como máximo 24 colores**; objeto y herramienta: como máximo 16.
- Tonos **apagados y de valor medio-oscuro**: paredes frías poco saturadas (azul petróleo,
  verde gris, malva gris) y pisos cálidos (madera, baldosa beige). La pared del fondo es más
  oscura que el piso, para que los personajes, que son más claros, resalten encima.
- Un solo acento de color por sala (una planta, un cojín, un cartel sin texto). El ámbar
  queda reservado a la interfaz de «Salida segura»: no se usa como acento grande.
- Sin degradados largos ni brillos: luz plana con, a lo sumo, una mancha de luz suave en el piso.

Valores de referencia de las salas actuales (hex), para orientar a la IA o retocar:

| Sala actual | Pared fondo | Pared lateral | Piso A / B | Acento |
|---|---|---|---|---|
| Urgencias | #1d3142 | #16242f | #3e5666 / #3a505f | #65d4c8 |
| Sala de escucha | #3a2c44 | #2d2236 | #5c4a52 / #56454d | #e8b46a |
| Recepción comisaría | #2a3344 | #202734 | #4d5260 / #484d5a | #7fa8e0 |
| Consultorio comisaría | #293a34 | #1f2b27 | #55483c / #4f4338 | #9ad08f |

## 3. Escala de píxel

Medido en el juego: los muebles se dibujan a **escala 1** (`world-scale.util.ts`, por ejemplo
el escritorio `desk.png` mide 122 × 58 y ocupa 122 × 58 px de sala). El cuerpo de un personaje
del kit mide 64 px y representa 1,65 m, así que el mundo va a **39 px por metro**.

- **Muebles, objetos y herramientas: factor 1.** El PNG se dibuja tal cual. El lado largo de
  un mueble sale de los muebles actuales, que son la referencia de tamaño: escritorio 122 × 58,
  mostrador 181 × 56, sofá 87 × 44, silla 22 × 34, planta 36 × 47, estante 62 × 74,
  archivador 68 × 51 (px).
  Objetos y herramientas son iconos de lectura de **32 × 32 px**, como los recogibles del juego.
- **Fondos de sala: factor 2** (valor por defecto de `pixelar_sala.py`). El fondo se trabaja a
  480 × 264 y se amplía ×2 sin suavizado. Con factor 1 una imagen generada conserva textura
  fina y se lee como pintura, no como pixel art; con factor 2 los bloques ya son duros y
  siguen cerca de la densidad de los personajes. El usuario aprobó el estilo del consultorio
  con factor 2 el 2026-10-24 (con arte dibujado, factor 1 y 2 casi no se distinguen).

### Punto de apoyo y piezas colgadas

- Un PNG de mueble se apoya por su **borde inferior** en el punto `x, y` de la sala (centro
  inferior). Lo que cuelga de la pared (tablero, cartelera) deja **aire transparente abajo**
  en su PNG y se coloca con `y = 236`, sin choque: así queda pegado a la pared del fondo.
- Las **puertas** no tienen PNG propio: se pintan en el fondo, en la posición que dice el
  `escenario.json` (en la pared del fondo, de canto en una pared lateral con un tapete en el
  piso, como tapete al borde delantero o como paso abierto con flechas en un lado sin pared).
  Si se mueve una puerta, se vuelve a dibujar el fondo.

## 4. Plantillas de prompt (Higgsfield)

Reglas comunes a todas: **sin personas, sin texto legible, sin logotipos ni marcas**, sin
marcos ni bordes, sin firma. Los nombres de lugar inventados. Se escriben en inglés porque
los modelos de imagen responden mejor así.

### 4.1 Fondo de sala

Parte común:

```
pixel art game background, 16-bit style, front-facing view of an empty room seen slightly
from above, camera looking straight at the back wall, flat shading, limited muted palette,
{DESCRIPCION_DEL_LUGAR}, only architecture and fixtures on the walls, no furniture on the
floor, empty floor, no people, no text, no letters, no logos, no signs with words, wide 16:9
```

Según el encuadre se añade:

- `tres-paredes`: `closed room, back wall and both side walls visible in perspective, the
  side walls converge toward the back wall, floor fills the lower half`
- `dos-paredes-izquierda`: `corner of a room, back wall and the left side wall visible in
  perspective, the right side is open and continues out of frame, floor fills the lower half`
- `dos-paredes-derecha`: `corner of a room, back wall and the right side wall visible in
  perspective, the left side is open and continues out of frame, floor fills the lower half`
- `una-pared`: `single back wall seen from the front, no side walls, the floor continues
  out of frame on both sides, floor fills the lower half`

`{DESCRIPCION_DEL_LUGAR}` es una frase concreta en inglés: materiales de pared y piso,
ventanas, luz (por ejemplo: `university counseling office, pale sage green walls, warm
wooden floor, one window with blinds, a cork board without papers`).

### 4.2 Mueble aislado

```
pixel art game sprite of a single {MUEBLE}, front elevation view seen slightly from above,
the same camera as a front-facing room, ONLY the furniture, no floor, no ground line,
everything solid and fully opaque, plain flat white background, no shadow, limited muted
palette, no text, no logos
```

### 4.3 Objeto pequeño o herramienta

```
pixel art game icon of a {OBJETO}, centered, simple readable silhouette, plain flat white
background, no shadow, limited palette, no text, no letters, no logos
```

## 5. Proceso por pieza

1. **Generar** con la plantilla. Guardar la imagen tal cual en `fuentes/` del lugar
   (`fuentes/salas/<id>.png`, `fuentes/muebles/<id>.png`, …).
2. **Quitar el fondo** (muebles, objetos y herramientas):
   `python tools/furniture-assets/local_bgremove.py <fuente> <recorte.png> [tolerancia]`.
3. **Pixelar**:
   - muebles: `python tools/furniture-assets/pixelate_furniture.py <recorte> <salida> <vista-previa> <lado-largo>`
     con el lado largo = tamaño real × 39 px/m;
   - objetos y herramientas: el mismo script con lado largo 32;
   - fondos: `python tools/escenarios/pixelar_sala.py <fuente> <salida.png> [factor] [colores]`.
4. **Sombra residual** (muebles): `python tools/furniture-assets/drop_ground_shadow.py <cutout> <salida>`.
   Va entre el paso 2 y el 3 si la IA dejó sombra en el piso.
5. **Colocar y validar**: copiar el PNG a `arte/…` con el nombre del marcador, ajustar
   posición en `escenario.json` si hace falta, y correr
   `npm run validar -- escenarios/<lugar>` desde `biblioteca/`.
   La hoja de contacto (`tools/escenarios/hoja_contacto.py`) muestra todas las salas juntas
   para revisar coherencia.

Mientras no hay arte, `python tools/escenarios/marcadores.py <escenario.json>` crea un PNG
provisional por cada imagen que falte, para que el validador pase.

### Arte dibujado por código (universidad)

`python tools/escenarios/arte_universidad.py biblioteca/escenarios/universidad/escenario.json`
redibuja todas las piezas (`--salas a,b` para algunas salas, `--factor N` para otro factor).
Cada sala, mueble, objeto y herramienta tiene su función de dibujo; una pieza nueva del
catálogo sin dibujo detiene el script con su nombre. Los fondos pasan por
`pixelar_sala(..., remuestreo='cercano')`: sin suavizado al achicar y, si sobran colores, se
juntan los dos más parecidos (no desaparece una ventana pequeña). Después:
`python tools/escenarios/hoja_contacto.py <escenario.json> <hoja.png>`.

## 6. Cuando lleguen las fotos

- Se reemplazan los PNG de `arte/` por la versión pixelada de la foto, **con el mismo nombre**.
- Fotos de sala: una de frente a la pared del fondo a la altura de los ojos; se recorta y se
  pixela con `pixelar_sala.py` igual que un fondo generado.
- Si una foto muestra un encuadre distinto al de la sala (por ejemplo, se ve una sola pared
  donde el escenario dice `tres-paredes`), se cambia el campo `encuadre` y se vuelve a validar:
  es el único caso en que el `escenario.json` se toca.
