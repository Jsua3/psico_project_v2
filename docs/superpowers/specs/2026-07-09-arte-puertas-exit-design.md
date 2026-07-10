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

## No-objetivos

- No se toca el mobiliario Kenney (lote futuro).
- No se toca backend/esquema ni el seed: el mapeo vive en el frontend, keyed por `object_key` ya existente.
- No se anima la puerta (abrir/cerrar). Sprite estático, como los demás objetos.
