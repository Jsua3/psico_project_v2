# Diseño: arte de las puertas (EXIT)

**Fecha:** 2026-07-09
**Estado:** Aprobado (brainstorming). Rama: `feat/arte-objetos-herramientas`.

## Objetivo

Reemplazar las dos representaciones actuales de puerta —un rectángulo morado dibujado a mano en las salas de autoría, y el tile `DOOR` de Kenney en el resto— por **sprites pixel-art propios**, uno por puerta, alineados con el lenguaje visual de las herramientas y los objetos de escenario.

## Contexto verificado

En `game-world.component.ts` `createMarker()` las puertas se dibujan hoy por dos ramas:

- `isExit && this.authoredRoomActive` → puerta dibujada: `rectangle` (marco) + `rectangle` (hoja) + `circle` (pomo), en morado `#b69cff`. El comentario justifica la rama: *"la sala premium no mezcla tiles Kenney"*.
- `isExit && textures.exists('dungeon-tiles')` → `add.image('dungeon-tiles', KenneyDungeonFrames.DOOR).setScale(2.5)` (tile de 16 px → 40 px).

Alrededor de ambas van pulso, sombra de contacto (`y=16`) y un **door hint** de texto (`E  <label> →`) que ya nombra el destino. Las puertas no llevan label propio.

Hay **5 puertas distintas** (10 instancias). Todas tienen `short_code = "EXIT"` (el seed no les define `short`), así que el resolver **debe ir por `object.key`**, no por `shortCode` como TOOL/OBJECT.

| `object_key` | Usos | Destino | Sprite |
|---|---|---|---|
| `puerta-urgencias` | 3 | Sala de urgencias (hospital) | puerta batiente clínica, cruz roja |
| `salida-institucional` | 3 | Comisaría de Familia | salida institucional: vidrio + señal SALIDA |
| `puerta-recepcion` | 2 | Recepción (comisaría) | puerta con ventanilla de recepción |
| `puerta-sala-escucha` | 1 | Sala de escucha familiar | puerta de madera cálida |
| `puerta-consultorio` | 1 | Consultorio (comisaría) | puerta de oficina con placa |

El sprite **no** carga el nombre del destino: eso ya lo dice el door hint. Su trabajo es decir "esto es una puerta" y dar la pista de qué tipo de espacio hay detrás.

## Alcance

### 1. Arte (Higgsfield)

`z_image` (gratis) con prompt consistente por puerta → `remove_background` → pixelado.

**Las puertas son verticales**, no cuadradas. `pixelate_object.py` cuadra el contenido con padding, lo que dejaría la puerta pequeña y flotando. Se escribe `pixelate_door.py`, que:

- recorta a contenido,
- rellena a proporción **retrato 3:4** y baja a **48×64**,
- cuantiza la paleta y binariza el alfa (igual que los objetos),
- escribe el preview ×5 a una **ruta explícita en el scratchpad** — nunca junto al output (bug conocido: `_prev.png` se coló en `assets/` y hubo que hacer `git rm`).

### 2. Assets

`frontend/src/assets/game/doors/door_{urgencias,salida_institucional,recepcion,sala_escucha,consultorio}.png` (PNG RGBA 48×64).

Carpeta propia `doors/` — no `objects/` — porque tienen otra geometría (retrato) y otra escala de render.

### 3. Integración

- `door-sprite.util.ts` (nuevo, junto a `object-sprite.util.ts`):
  - `DOOR_SPRITE: Record<objectKey, assetName>` con las 5 puertas.
  - `resolveDoorTextureKey(objectKey): string | null`.
  - `doorSpriteSpecs(): { textureKey, assetPath }[]` para la precarga.
  - Clave de textura: `door-<assetName>`.
- `game-world.component.ts`:
  - precargar `doorSpriteSpecs()` junto a `objectSpriteSpecs()`;
  - en `createMarker()`, **unificar las dos ramas EXIT**: si el sprite de esa puerta cargó, se usa `add.image` en ambos contextos (sala de autoría y Kenney). Es arte propio, así que no viola la regla de "la sala premium no mezcla tiles Kenney" — al contrario, unifica el lenguaje visual.
  - **Fallback en cascada** si el asset falta: sala de autoría → puerta dibujada; resto → tile Kenney. Es decir, el comportamiento de hoy.
  - Constante `DOOR_SPRITE_SCALE = 0.85` → 41×54 px en pantalla, comparable al tamaño actual (Kenney 40 px; dibujada 34×46). Centro en `y = -11` para que la base de la puerta se asiente en la sombra de contacto (`y = 16`).
- Pulso, sombra, door hint y la detección de tránsito (`checkDbDoorTriggers`) quedan **intactos**: solo cambia el `main` del marker.

### 4. Verificación

- Montaje visual de las 5 puertas antes de cablear.
- `jest` verde: `door-sprite.util.spec.ts` (5 claves mapeadas, clave desconocida → `null`, `doorSpriteSpecs()` con 5 entradas).
- `ng build` OK · los 5 assets servidos (200).
- Smoke: la puerta se ve como puerta pixel-art, el hint sigue apareciendo al acercarse y el tránsito entre salas sigue funcionando.

## Adenda: puertas laterales en 3/4

Las **10 instancias de puerta del seed están contra un muro lateral** (`x = 122` o `x = 838`, con `ROOM_W = 960` y las bandas de pared en 0–96 y 864–960). Ninguna está en el muro del fondo. Como `case-pdf-rooms.renderer` pinta la sala como una caja de un punto de fuga —muro del fondo de frente, laterales como triángulos que fugan hacia atrás— una puerta lateral dibujada de frente rompe la perspectiva.

### Orientación derivada de los datos

`doorFacing(x, mapWidth)` decide el muro por posición, sin metadata nueva ni tocar el seed:

- `x / mapWidth ≤ 0.35` → muro izquierdo → la cara mira a la **derecha**.
- `x / mapWidth ≥ 0.65` → muro derecho → **espejo** (`setFlipX`).
- En medio → `null` → se dibuja la variante frontal (muro del fondo).

Solo hacen falta **5 assets laterales**, no 10: la puerta del muro derecho es el espejo pixel-perfecto de la del izquierdo.

### El arte se deriva geométricamente, no se regenera

Dos intentos generativos fallaron y quedan documentados para no repetirlos:

1. **`z_image` desde cero** ("three-quarter perspective…"): metió piso, zócalo y esquinas de habitación pese a pedir lo contrario, y el ángulo salió inconsistente entre las cinco — con espejo habrían quedado incoherentes.
2. **`flux_kontext` rotando la frontal**: conservó la identidad, pero apenas rotó (varias quedaron casi de frente) y `enhance_prompt` reescribió las instrucciones, devolviendo sombras y piso.

Una puerta es una losa plana: rotarla contra un muro lateral **es** una proyección de un punto de fuga. `sidify_door.py` la aplica sobre el recorte frontal de plena resolución:

- recorta apéndices delgados laterales (columnas con menos del 20 % de alto de contenido) — si no, la deformación los proyecta lejos del cuerpo y quedan como motas;
- deforma con `Image.PERSPECTIVE`: bordes izquierdo y derecho verticales, superior e inferior convergiendo a la derecha (`SQUASH = 0.62`, `FAR_HEIGHT = 0.80`);
- el resultado pasa por el mismo `pixelate_door.py`.

Ventajas sobre lo generativo: identidad exacta con la frontal ya commiteada, el ángulo es un número y no una súplica en un prompt, y el espejo es exacto.

**Verificación de dirección** (no a ojo): en cada asset lateral, el alto de contenido a 3 px del borde izquierdo debe superar al del borde derecho — el borde cercano es más alto. Las 5 lo cumplen.

### Assets

`door_{...}_side.png` (48×64) junto a las frontales. `doorSpriteSpecs()` precarga las 10.

## No-objetivos

- No se toca el mobiliario Kenney (lote futuro).
- No se toca backend/esquema ni el seed: el mapeo vive en el frontend, keyed por `object_key` ya existente.
- No se anima la puerta (abrir/cerrar). Sprite estático, como los demás objetos.
- La variante en 3/4 no revela la profundidad del marco (jamba): a 41 px de ancho es invisible.
