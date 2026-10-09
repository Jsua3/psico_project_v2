# Personajes unificados — Plan 3: escala del mundo (F8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el mundo del juego esté a la escala de sus personajes:
- muebles, puertas y objetos recogibles a unos 39 px/m, dibujados a escala 1 con el tamaño exacto de su PNG;
- las puertas del lobby a la altura de los personajes;
- el umbral del zoom entero decidido con datos;
- todo verificado con capturas dentro del juego y aprobado por el usuario.

**Architecture:** Una tabla única (`WORLD_SPRITES`, en `world-scale.util.ts`) fija el tamaño de cada sprite del mundo. El arte sale de un reescalado determinista de los originales archivados (sin IA generativa), y un contrato (`npm run test:world-art`) hace cumplir tamaños, alfa binario, recorte y paleta. El renderer de las salas, el mundo, la intro y el lobby leen esa tabla en vez de calcular escalas fraccionarias; un PNG viejo en la caché del navegador se fuerza al tamaño de la tabla.

**Tech Stack:** Angular 21 (signals, componentes standalone), Phaser 3.90, Jest 30 + jsdom (sin canvas), Node 24 (`node --test` para los scripts; los `.mjs` importan `.ts` con *type stripping*), `pngjs`, Playwright (solo para las capturas de las PARADAS B y C, con aviso).

**Spec:** `docs/superpowers/specs/2026-10-02-personajes-unificados-design.md` (aprobado el 2026-10-03; decisión 12, §8.3, §13.1 y §14). Este plan implementa su fase F8. Los planes 1 y 2 (`docs/superpowers/plans/2026-10-03-personajes-unificados-1-kit-y-arte.md` y `…-2-integracion.md`) dejaron el kit y la integración. HEAD de partida: `7e6e3c5` en `feat/personajes-unificados`.

## Global Constraints

- **Rama y remoto.** Rama `feat/personajes-unificados`, worktree `.worktrees/personajes-unificados`. Nada de push, merge ni PR sin preguntar. La rama no va a `master` hasta terminar la F8 (este plan); integrarla con `master` es un plan aparte.
- **`frontend/e2e/**`.** Este plan no lo edita (spec §8.4). Si un e2e existente falla por la F8, se informa y se pregunta antes de tocar nada.
- **Escala (spec §13.1, decisión 12).** «Se recalibra a unos 39 px/m y se dibuja a ×1 exacto.» Muebles, puertas y objetos recogibles van a escala 1, con el tamaño exacto de su PNG; ningún sprite del mundo lleva `setScale` fraccionario. El zoom entero lo pone la cámara. Los 39 px/m salen del personaje: su cuerpo mide 64 px y representa 1,65 m.
- **Fuente única.** `WORLD_SPRITES` (`world-scale.util.ts`) manda sobre los tamaños: el renderer, el mundo, el generador de arte y sus pruebas la leen. La intro del caso (HTML) repite tres tamaños y una prueba los ata a la tabla.
- **Arte.** Sin IA generativa (decisión 7). El arte es el de antes, reescalado: alfa binario, solo colores del original, recortado al cuerpo opaco, a lo sumo 40 colores. Del mobiliario solo entra su escala, no un rediseño (spec §14).
- **Zoom entero (spec §8.3).** k = mayor entero ≥ 1 con `anchoFísico / k ≥ 0,8 · anchoSala` y `altoFísico / k ≥ 0,8 · altoSala`. La fracción de 0,8 solo cambia si el usuario lo decide en la PARADA B.
- **Nada deforma un sprite.** Un marcador con sprite de pixel art (persona del kit, puerta, herramienta, objeto) no se escala al acercarse ni al enfocarlo (spec §1.1.2 y §8.3). Solo se aclara.
- **Mensajes y commits.**
  - Textos de la interfaz en español.
  - Commits en español con el estilo `feat(escala-mundo): …`, `test(escala-mundo): …`, `docs(escala-mundo): …` o `fix(escala-mundo): …`, terminados con la línea `Co-Authored-By` de la atribución de la sesión que ejecuta (hoy: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`).
  - Nunca `--no-verify`.
- **Comandos.**
  - Todos se ejecutan desde `frontend/` del worktree (Git Bash, barras normales); las rutas fuera de `frontend/` se escriben con `../`.
  - Jest: `npm test -- --runInBand <patrón>`.
  - Scripts del arte: `npm run test:world-art`, `npm run world-art:build`, `npm run world-art:laminas`.
  - Tipos de la tabla (reglas del kit): `npm run kit:types`.
  - App: `npm run build`.
- **Tipos.** `jest.config.js` corre ts-jest con `diagnostics: false`, así que **jest no detecta errores de tipos**. Toda tarea que toque código de la app termina con `npm run build`, que sí los detecta (pero solo compila lo alcanzable desde `main.ts`).
- **Cierre de cada tarea.**
  - Siempre: jest completo (`npm test -- --runInBand`).
  - Si la tarea tocó `scripts/world-art/` o el arte: además `npm run test:world-art` y `npm run test:visual-assets`.
  - Si tocó la app: además `npm run build`.
  - Todo verde antes del commit.
- **Paradas.** Las PARADAS A, B y C esperan la respuesta del usuario en el chat. La aprobación vale para el HEAD que muestran las láminas o capturas.

## Review Focus

Estas son las condiciones que el spec implica y que más probablemente afecten a quien juega o enseña. Cada una tiene su prueba en la tarea dueña:

1. **PNG viejo en la caché del navegador tras un despliegue.**
   - Caso: la textura que llega mide otra cosa que la tabla (la calibración anterior).
   - Lo esperado: se fuerza al tamaño de la tabla; nunca un mueble o una puerta enormes.
   - Prueba: tarea 1 (`staleSpriteSize`), tarea 4 (muebles) y tarea 5 (puertas, herramientas y objetos, vía `atWorldScale`).
2. **Marcador con sprite de pixel art que se acerca o se enfoca** (acercarse, seleccionar, pulso).
   - Lo esperado: se aclara pero no se escala; el pulso va a su anillo.
   - Prueba: tarea 6.
3. **Mueble dentro de su huella de colisión.**
   - Lo esperado: el sprite nuevo, más chico, cabe en la huella, que no cambia; el mueble queda asentado sobre ella.
   - Prueba: tarea 4.
4. **Sala sin texturas** (la carga de los PNG falló).
   - Lo esperado: cada sala cae al cuerpo vectorial de su mueble; no lanza ni deja imágenes sueltas.
   - Prueba: tarea 4.
5. **Lobby con un caso, con varios y con un título largo.**
   - Lo esperado: la insignia queda sobre el marco; el título crece hacia arriba desde la insignia y no se sale de la sala; la manija y el candado caen dentro del marco.
   - Prueba: tarea 9.

## Estructura de archivos

```
frontend/src/app/features/simulator/
  world-scale.util.ts            NUEVO  tabla WORLD_SPRITES, colocación de muebles, textura vieja, aviso de puerta (tarea 1)
  case-pdf-rooms.renderer.ts     se migra: muebles a escala 1 (tarea 4)
  game-world.component.ts        se migra: puertas, herramientas, objetos, marcadores, respaldos de Kenney (tareas 5-7)
  world-characters.util.ts       markerEmphasis con pixelSprite (tarea 6)
  case-intro-scene.component.ts  imágenes con el tamaño de la tabla (tarea 8)
  lobby-door-layout.util.ts      NUEVO  geometría de las puertas del lobby (tarea 9)
  game-menu.component.ts         puertas del lobby (tarea 9)
  pixel-scale.util.ts            umbral del zoom, si el usuario lo decide (tarea 10)
frontend/scripts/world-art/
  rescale.mjs                    NUEVO  reescalado determinista (tarea 2)
  build.mjs                      NUEVO  genera los PNG y sincroniza el inventario (tarea 3)
  laminas.mjs                    NUEVO  láminas de revisión (tarea 3)
  world-art.test.mjs             NUEVO  contrato del arte (tarea 3)
  world-scale-code.test.mjs      NUEVO  validador de escalas enteras en el código (tarea 7)
frontend/world-art/originals/{furniture,doors,objects}/   NUEVO  los 30 PNG de antes de la F8 (tarea 3)
frontend/world-art/README.md                              NUEVO  (tarea 12)
frontend/src/assets/game/{furniture,doors,objects}/       se regeneran (tarea 3)
frontend/src/assets/visual/v1/inventory.v1.json           expectedDimensions de los 30 sprites (tarea 3)
frontend/.capturas-f4/  (excluida de git)                 capturas de las PARADAS B y C (tareas 10 y 11)
docs/visual/world-art/                                    láminas de revisión (tarea 3)
docs/visual/premium-visual-bible-v1.md, el spec, tools/*/README.md, .github/workflows/ci.yml   (tareas 10 y 12)
```

## Antes de empezar

1. **Workspace del plan** (fuera de git: `.superpowers/` está excluido). En la raíz del worktree crea `.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo/` (en adelante `<ledger>`) con:
   - `tools/edits.cjs`: el aplicador de ediciones a prueba de CRLF (texto abajo);
   - `edits/`: las especificaciones de edición de cada tarea;
   - `progress.md`: el ledger, con una línea por tarea hecha (SHA del commit) y las líneas `Ruling:` y `Deferred minor:`.
2. **Aplicar una edición.** Desde `frontend/`, con `W` apuntando al workspace:

   ```bash
   W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
   node $W/tools/edits.cjs $W/edits/<nombre>.cjs
   ```

   Cada entrada es `{ file, find, replace }` (reemplazo literal y único) o `{ file, start, end, replace }`. El aplicador falla en voz alta si el texto no está o aparece dos veces; en ese caso mira el archivo, no fuerces el cambio.
3. **Los fuentes son CRLF o LF según el archivo.** Edita con `edits.cjs` (respeta el final de línea de cada archivo) o con una sola línea del Edit. Si `git` avisa de LF→CRLF, no es un error.
4. **Heredocs y `node -e` de Bash pierden las barras invertidas.** Crea con la herramienta Write cualquier archivo que lleve expresiones regulares o `\"`.
5. **Jest recoge todo `**/*.spec.ts`,** también las carpetas locales sin versionar: los specs de Playwright locales se llaman `*.e2e.ts`.
6. **Docker Desktop encendido** para las capturas y los e2e (`docker info` responde; tarda varios minutos en arrancar). Si el puerto 5544 está ocupado, `SIEP_TEST_DB_PORT=5561`. Si Playwright pide un Chromium que no está descargado, `E2E_CHROMIUM_PATH` apunta a uno de `~/AppData/Local/ms-playwright/`. Escribir en `frontend/src` mientras corre una captura recarga `ng serve` y rompe la corrida: no edites durante ellas. Lánzalas desde PowerShell para que el cierre mate los procesos.
7. **Punto de partida.** HEAD `7e6e3c5` (o posterior) de `feat/personajes-unificados` y `git status` sin cambios, salvo este plan si aún no está commiteado (en ese caso, commitéalo primero: `docs(escala-mundo): plan 3 (F8, escala del mundo)`). Anota el HEAD en el ledger.

El aplicador de ediciones (`tools/edits.cjs`):

```js
// node edits.cjs <edits.cjs|json>
//   { file, find, replace, all? }            reemplazo literal (único salvo all)
//   { file, start, end, replace }            reemplaza desde `start` hasta el final de `end` (ambos incluidos, únicos)
// Trabaja con \n y respeta el CRLF del archivo.
const fs = require('fs');
const path = require('path');
const spec = process.argv[2];
const edits = spec.endsWith('.cjs') ? require(path.resolve(spec)) : JSON.parse(fs.readFileSync(spec, 'utf8'));
const once = (text, needle, file) => {
  const i = text.indexOf(needle);
  if (i < 0) throw new Error(`${file}: no encuentro\n${needle}`);
  if (text.indexOf(needle, i + 1) >= 0) throw new Error(`${file}: aparece más de una vez\n${needle}`);
  return i;
};
for (const e of edits) {
  const raw = fs.readFileSync(e.file, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.replace(/\r\n/g, '\n');
  if (e.start !== undefined) {
    const a = once(text, e.start, e.file);
    const b = text.indexOf(e.end, a);
    if (b < 0) throw new Error(`${e.file}: no encuentro el final\n${e.end}`);
    text = text.slice(0, a) + e.replace + text.slice(b + e.end.length);
  } else if (e.all) {
    if (!text.includes(e.find)) throw new Error(`${e.file}: no encuentro\n${e.find}`);
    text = text.split(e.find).join(e.replace);
  } else {
    const i = once(text, e.find, e.file);
    text = text.slice(0, i) + e.replace + text.slice(i + e.find.length);
  }
  fs.writeFileSync(e.file, crlf ? text.replace(/\n/g, '\r\n') : text);
  console.log('editado', e.file);
}
```

---

### Task 1: La tabla única de tamaños del mundo (`world-scale.util.ts`)

**Files:**
- Create: `frontend/src/app/features/simulator/world-scale.util.ts`
- Create: `frontend/src/app/features/simulator/world-scale.util.spec.ts`
- Modify: `frontend/tsconfig.kit.json`

**Interfaces:**
- Consumes: nada.
- Produces (todo exportado por `world-scale.util.ts`, sin imports y con sintaxis borrable, para que Node lo importe desde los scripts del arte):
  - constantes `PX_PER_M = 39`, `PREVIOUS_PX_PER_M = 46`, `CHARACTER_HEIGHT_PX = 64`, `DOOR_SPRITE_FEET_Y = 16`, `DOOR_HINT_GAP = 13` y `DOOR_FALLBACK_HEIGHT = 48`;
  - tipos `WorldSpriteGroup = 'furniture' | 'doors' | 'objects'`, `WorldSpriteSpec { group; name; width; height; shadowHeight? }` y `FurniturePlacement`;
  - `WORLD_SPRITES: readonly WorldSpriteSpec[]` (30 filas: 10 muebles, 10 puertas y 10 objetos recogibles);
  - funciones `worldSprite(group, name): WorldSpriteSpec` (lanza si no existe), `worldSpriteForTexture(textureKey): WorldSpriteSpec | null`, `metersOf(px): number`, `furniturePlacement(name, cx, feetY): FurniturePlacement`, `staleSpriteSize(spec, textureWidth, textureHeight): { width; height } | null` y `doorHintY(objectY, doorHeight): number`.

**Ruling (se registra en el ledger):** el spec dice «unos 39 px/m», pero no da tamaños. Cada tamaño sale de lo que se veía en el juego (cuerpo opaco del PNG por la escala fraccionaria de entonces) × 39/46, y la prueba lo exige con ±1 px. Los objetos recogibles son iconos de lectura, no objetos a escala: se reducen 2:1 exactos (el 64×64 original pasa a su cuerpo / 2).
- Costo si está mal: cambiar una fila de la tabla y regenerar el arte (`npm run world-art:build`).

- [ ] **Step 1: Escribe la prueba que falla**

Crea `frontend/src/app/features/simulator/world-scale.util.spec.ts`:

```ts
import {
  CHARACTER_HEIGHT_PX,
  DOOR_FALLBACK_HEIGHT,
  DOOR_HINT_GAP,
  DOOR_SPRITE_FEET_Y,
  PREVIOUS_PX_PER_M,
  PX_PER_M,
  WORLD_SPRITES,
  doorHintY,
  furniturePlacement,
  metersOf,
  staleSpriteSize,
  worldSprite,
  worldSpriteForTexture,
} from './world-scale.util';

/**
 * Lo que medía cada sprite en el juego antes de la F8: el cuerpo opaco del PNG por la escala
 * fraccionaria con que se dibujaba (muebles: min(ancho de la huella / ancho, tope de alto / alto);
 * puertas: DOOR_SPRITE_SCALE = 1,45). [grupo, nombre, ancho, alto, escala de entonces]
 */
const BEFORE: ReadonlyArray<readonly [string, string, number, number, number]> = [
  ['furniture', 'counter', 236, 73, 0.9041],
  ['furniture', 'gurney', 122, 46, 1],
  ['furniture', 'waiting_chairs', 155, 56, 0.7097],
  ['furniture', 'plant', 48, 64, 0.875],
  ['furniture', 'sofa', 146, 74, 0.7027],
  ['furniture', 'coffee_table', 96, 60, 0.4333],
  ['furniture', 'shelf', 124, 148, 0.5867],
  ['furniture', 'chair', 27, 42, 0.9565],
  ['furniture', 'file_cabinet', 130, 97, 0.6186],
  ['furniture', 'desk', 224, 106, 0.6415],
  ['doors', 'door_urgencias', 44, 48, 1.45],
  ['doors', 'door_urgencias_side', 30, 60, 1.45],
  ['doors', 'door_salida_institucional', 36, 60, 1.45],
  ['doors', 'door_salida_institucional_side', 22, 58, 1.45],
  ['doors', 'door_recepcion', 36, 60, 1.45],
  ['doors', 'door_recepcion_side', 22, 58, 1.45],
  ['doors', 'door_sala_escucha', 30, 60, 1.45],
  ['doors', 'door_sala_escucha_side', 18, 58, 1.45],
  ['doors', 'door_consultorio', 32, 60, 1.45],
  ['doors', 'door_consultorio_side', 20, 58, 1.45],
];

/** Cuerpo opaco de los iconos recogibles (el PNG es de 64×64): pasan a 2:1 exactos. */
const PICKUPS: ReadonlyArray<readonly [string, number, number]> = [
  ['tool_pap', 56, 42],
  ['tool_spikes', 46, 56],
  ['tool_reflection_journal', 44, 56],
  ['tool_safety_route', 52, 56],
  ['tool_risk_meter', 55, 51],
  ['object_expediente', 56, 44],
  ['object_marco_normativo', 44, 56],
  ['object_registro', 56, 50],
  ['object_acceso_restringido', 30, 56],
  ['object_cierre', 51, 56],
];

/** Altura plausible de cada mueble, en metros: [mínimo, máximo]. */
const PLAUSIBLE_METERS: Readonly<Record<string, readonly [number, number]>> = {
  counter: [1.2, 1.6],
  gurney: [0.8, 1.2],
  waiting_chairs: [0.75, 1.1],
  plant: [1.0, 1.5],
  sofa: [0.8, 1.2],
  coffee_table: [0.4, 0.7],
  shelf: [1.6, 2.1],
  chair: [0.75, 1.1],
  file_cabinet: [1.0, 1.6],
  desk: [1.2, 1.7],
};

describe('world-scale.util — la tabla de tamaños del mundo (spec §13.1, decisión 12)', () => {
  it('39 px/m: el cuerpo del personaje (64 px) es un adulto de 1,6 a 1,7 m', () => {
    expect(PX_PER_M).toBe(39);
    expect(metersOf(CHARACTER_HEIGHT_PX)).toBeGreaterThan(1.6);
    expect(metersOf(CHARACTER_HEIGHT_PX)).toBeLessThan(1.7);
  });

  it('hay 30 sprites (10 muebles, 10 puertas, 10 objetos) y ninguno se repite', () => {
    expect(WORLD_SPRITES).toHaveLength(30);
    for (const group of ['furniture', 'doors', 'objects']) {
      expect(WORLD_SPRITES.filter(spec => spec.group === group)).toHaveLength(10);
    }
    expect(new Set(WORLD_SPRITES.map(spec => `${spec.group}/${spec.name}`)).size).toBe(30);
  });

  it('todo tamaño es un entero positivo', () => {
    for (const spec of WORLD_SPRITES) {
      expect(Number.isInteger(spec.width) && spec.width > 0).toBe(true);
      expect(Number.isInteger(spec.height) && spec.height > 0).toBe(true);
    }
  });

  it.each(BEFORE)('%s/%s mide lo de antes por 39/46 (±1 px)', (group, name, width, height, scale) => {
    const spec = worldSprite(group as 'furniture' | 'doors', name);
    const k = PX_PER_M / PREVIOUS_PX_PER_M;
    expect(Math.abs(spec.width - width * scale * k)).toBeLessThanOrEqual(1);
    expect(Math.abs(spec.height - height * scale * k)).toBeLessThanOrEqual(1);
  });

  it.each(PICKUPS)('%s: el icono recogible es el cuerpo del 64×64 a la mitad', (name, width, height) => {
    const spec = worldSprite('objects', name);
    expect([spec.width, spec.height]).toEqual([Math.round(width / 2), Math.round(height / 2)]);
    expect(spec.width).toBeLessThanOrEqual(32);
    expect(spec.height).toBeLessThanOrEqual(32);
  });

  it.each(Object.entries(PLAUSIBLE_METERS))('el mueble %s mide una altura plausible', (name, [min, max]) => {
    const meters = metersOf(worldSprite('furniture', name).height);
    expect(meters).toBeGreaterThanOrEqual(min);
    expect(meters).toBeLessThanOrEqual(max);
  });

  it('las puertas superan al personaje, salvo la doble puerta baja de urgencias (arte original, sin rediseño)', () => {
    for (const spec of WORLD_SPRITES.filter(entry => entry.group === 'doors' && entry.name !== 'door_urgencias')) {
      expect(spec.height).toBeGreaterThanOrEqual(CHARACTER_HEIGHT_PX + 6);
    }
    expect(worldSprite('doors', 'door_recepcion').height).toBe(74);
  });

  it('un mueble de sombra: ancho del sprite + 8, a escala 1, con la base apenas bajo los pies', () => {
    expect(furniturePlacement('counter', 490, 300)).toEqual({
      image: { x: 400, y: 303 },
      shadow: { x: 490, y: 300, width: 189, height: 19 },
    });
    // las coordenadas siempre son enteras, aunque los pies vengan de una escala fraccionaria de la planta
    const plant = furniturePlacement('plant', 822, 388 + 18 * 1.05);
    expect([plant.image.x, plant.image.y, plant.shadow.y].every(Number.isInteger)).toBe(true);
    expect(() => furniturePlacement('no-existe', 0, 0)).toThrow('sprite del mundo desconocido');
  });

  it('una textura con otro tamaño que la tabla (PNG viejo en caché) se fuerza al de la tabla', () => {
    const sofa = worldSprite('furniture', 'sofa');
    expect(staleSpriteSize(sofa, 87, 44)).toBeNull();
    expect(staleSpriteSize(sofa, 146, 74)).toEqual({ width: 87, height: 44 });
  });

  it('cada textura de Phaser encuentra su ficha', () => {
    expect(worldSpriteForTexture('furniture-sofa')).toBe(worldSprite('furniture', 'sofa'));
    expect(worldSpriteForTexture('door-door_urgencias_side')).toBe(worldSprite('doors', 'door_urgencias_side'));
    expect(worldSpriteForTexture('object-tool_pap')).toBe(worldSprite('objects', 'tool_pap'));
    expect(worldSpriteForTexture('dungeon-tiles')).toBeNull();
  });

  it('el aviso de una puerta flota 13 px sobre su borde alto', () => {
    expect(DOOR_SPRITE_FEET_Y).toBe(16);
    expect(DOOR_HINT_GAP).toBe(13);
    // puerta de 74 px con el marcador en y=440: base en 456, borde alto en 382, aviso centrado en 369
    expect(doorHintY(440, 74)).toBe(369);
    expect(doorHintY(440, 59)).toBe(384);
    // una puerta de respaldo (sin arte propio) mide 48 px
    expect(DOOR_FALLBACK_HEIGHT).toBe(48);
    expect(doorHintY(440, DOOR_FALLBACK_HEIGHT)).toBe(395);
  });
});
```

- [ ] **Step 2: Córrela y comprueba que falla**

Run: `npm test -- --runInBand world-scale.util`
Expected: FAIL con `Cannot find module './world-scale.util'`.

- [ ] **Step 3: Implementa la tabla**

Crea `frontend/src/app/features/simulator/world-scale.util.ts`:

```ts
/**
 * Escala del mundo (spec §13.1, decisión 12): muebles, puertas y objetos recogibles se dibujan a
 * ESCALA 1, con el tamaño exacto de su PNG, a la misma densidad de píxel que los personajes del
 * kit (cuerpo de 64 px ≈ 1,65 m ⇒ 39 px/m). Esta tabla es la fuente única de esos tamaños: la
 * leen el renderer de las salas, el mundo, el generador de arte (scripts/world-art) y sus pruebas.
 *
 * Sin imports y con sintaxis borrable: Node 24 la importa tal cual desde los scripts.
 */

/** Píxeles de mundo por metro: el cuerpo de un personaje del kit mide 64 px y representa 1,65 m. */
export const PX_PER_M = 39;
/** Calibración anterior de muebles y puertas (spec §13.1): ~46 px/m para un personaje de ~82 px. */
export const PREVIOUS_PX_PER_M = 46;
/** Alto del cuerpo opaco de un personaje del kit (spec §4.2). */
export const CHARACTER_HEIGHT_PX = 64;

export type WorldSpriteGroup = 'furniture' | 'doors' | 'objects';

export interface WorldSpriteSpec {
  readonly group: WorldSpriteGroup;
  /** Nombre del PNG sin extensión: `/assets/game/<group>/<name>.png`. */
  readonly name: string;
  /** Tamaño exacto del PNG recortado al cuerpo opaco, en píxeles de mundo. */
  readonly width: number;
  readonly height: number;
  /** Alto de la sombra de contacto de un mueble (el ancho es el del sprite más 8 px). */
  readonly shadowHeight?: number;
}

const furniture = (name: string, width: number, height: number, shadowHeight: number): WorldSpriteSpec =>
  ({ group: 'furniture', name, width, height, shadowHeight });
const door = (name: string, width: number, height: number): WorldSpriteSpec => ({ group: 'doors', name, width, height });
const pickup = (name: string, width: number, height: number): WorldSpriteSpec => ({ group: 'objects', name, width, height });

/**
 * Tamaños = el que se veía en el juego (arte × escala fraccionaria de antes) × 39/46 para muebles
 * y puertas. Los objetos recogibles son iconos de lectura, no objetos a escala: se reducen 2:1
 * exactos (el 64×64 original pasa a 32×32), que es el reescalado más limpio y queda a un 5 % de la
 * calibración.
 */
export const WORLD_SPRITES: readonly WorldSpriteSpec[] = Object.freeze([
  furniture('counter', 181, 56, 19),
  furniture('gurney', 103, 39, 14),
  furniture('waiting_chairs', 93, 34, 14),
  furniture('plant', 36, 47, 10),
  furniture('sofa', 87, 44, 19),
  furniture('coffee_table', 35, 22, 12),
  furniture('shelf', 62, 74, 12),
  furniture('chair', 22, 34, 8),
  furniture('file_cabinet', 68, 51, 14),
  furniture('desk', 122, 58, 20),

  door('door_urgencias', 54, 59),
  door('door_urgencias_side', 37, 74),
  door('door_salida_institucional', 44, 74),
  door('door_salida_institucional_side', 27, 71),
  door('door_recepcion', 44, 74),
  door('door_recepcion_side', 27, 71),
  door('door_sala_escucha', 37, 74),
  door('door_sala_escucha_side', 22, 71),
  door('door_consultorio', 39, 74),
  door('door_consultorio_side', 25, 71),

  pickup('tool_pap', 28, 21),
  pickup('tool_spikes', 23, 28),
  pickup('tool_reflection_journal', 22, 28),
  pickup('tool_safety_route', 26, 28),
  pickup('tool_risk_meter', 28, 26),
  pickup('object_expediente', 28, 22),
  pickup('object_marco_normativo', 22, 28),
  pickup('object_registro', 28, 25),
  pickup('object_acceso_restringido', 15, 28),
  pickup('object_cierre', 26, 28),
]);

/** La ficha de un sprite del mundo; lanza si el nombre no está en la tabla. */
export function worldSprite(group: WorldSpriteGroup, name: string): WorldSpriteSpec {
  const spec = WORLD_SPRITES.find(entry => entry.group === group && entry.name === name);
  if (!spec) throw new Error(`sprite del mundo desconocido: ${group}/${name}`);
  return spec;
}

/** Prefijo de la clave de textura de Phaser de cada grupo (furniture-sofa, door-door_urgencias, object-tool_pap). */
const TEXTURE_PREFIX = { furniture: 'furniture-', doors: 'door-', objects: 'object-' } as const;

/** La ficha del sprite que carga una textura de Phaser, o `null` si la textura no es del mundo. */
export function worldSpriteForTexture(textureKey: string): WorldSpriteSpec | null {
  return WORLD_SPRITES.find(spec => textureKey === `${TEXTURE_PREFIX[spec.group]}${spec.name}`) ?? null;
}

/** Metros que representa una altura en píxeles de mundo. */
export function metersOf(px: number): number {
  return px / PX_PER_M;
}

export interface FurniturePlacement {
  /** Esquina inferior izquierda de la imagen (origen 0, 1), en píxeles enteros. */
  readonly image: { readonly x: number; readonly y: number };
  /** Sombra de contacto: elipse centrada en los pies del mueble. */
  readonly shadow: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/**
 * Dónde se dibuja un mueble de centro `cx` y pies en `feetY`: la imagen a escala 1 con la base
 * apenas bajo los pies (15 % del alto de la sombra) y la sombra de contacto sobre ellos.
 */
export function furniturePlacement(name: string, cx: number, feetY: number): FurniturePlacement {
  const spec = worldSprite('furniture', name);
  const shadowHeight = spec.shadowHeight ?? 10;
  const feet = Math.round(feetY);
  return {
    image: { x: Math.round(cx - spec.width / 2), y: feet + Math.round(shadowHeight * 0.15) },
    shadow: { x: Math.round(cx), y: feet, width: spec.width + 8, height: shadowHeight },
  };
}

/**
 * Tamaño al que forzar una textura que no mide lo que dice la tabla (un PNG viejo en la caché del
 * navegador tras un despliegue); `null` si coincide y se dibuja a escala 1.
 */
export function staleSpriteSize(
  spec: WorldSpriteSpec,
  textureWidth: number,
  textureHeight: number,
): { width: number; height: number } | null {
  return textureWidth === spec.width && textureHeight === spec.height ? null : { width: spec.width, height: spec.height };
}

/** Base de una puerta: asentada en la sombra de contacto de su marcador (y + 16). */
export const DOOR_SPRITE_FEET_Y = 16;
/** El aviso de puerta flota con su centro a esta distancia sobre el borde alto de la puerta. */
export const DOOR_HINT_GAP = 13;
/** Alto de las puertas de respaldo (la hoja dibujada de la sala de autoría y el tile de Kenney a ×3). */
export const DOOR_FALLBACK_HEIGHT = 48;

/** Y (en mundo) del centro del aviso de una puerta de alto `doorHeight` cuyo marcador está en `objectY`. */
export function doorHintY(objectY: number, doorHeight: number): number {
  return objectY + DOOR_SPRITE_FEET_Y - doorHeight - DOOR_HINT_GAP;
}
```

- [ ] **Step 4: Córrela y comprueba que pasa**

Run: `npm test -- --runInBand world-scale.util`
Expected: PASS, 48 pruebas (la derivación ±1 px de los 20 muebles y puertas, los 10 iconos 2:1, las 10 alturas plausibles y las ocho de reglas).

- [ ] **Step 5: Que `tsc` con las reglas del kit también la revise**

Node importa este archivo con *type stripping*: solo admite sintaxis borrable. Crea `<ledger>/edits/t1-kit-types.cjs` (herramienta Write):

```js
// Tarea 1: tsc con las reglas del kit también revisa la tabla del mundo (rutas relativas a frontend/).
module.exports = [
  {
    file: 'tsconfig.kit.json',
    find: '  "files": ["src/app/features/character/kit/kit-engine.ts"]',
    replace: [
      '  "files": [',
      '    "src/app/features/character/kit/kit-engine.ts",',
      '    "src/app/features/simulator/world-scale.util.ts"',
      '  ]',
    ].join('\n'),
  },
];
```

Aplícalo y corre los tipos:

```bash
W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
node $W/tools/edits.cjs $W/edits/t1-kit-types.cjs
npm run kit:types
```

Expected: `editado tsconfig.kit.json`; `tsc` termina sin salida y con código 0.

- [ ] **Step 6: Cierre y commit**

Run: `npm test -- --runInBand` (todo verde). Anota el `Ruling:` en el ledger.

```bash
git add src/app/features/simulator/world-scale.util.ts src/app/features/simulator/world-scale.util.spec.ts tsconfig.kit.json
git commit -m "feat(escala-mundo): tabla única de tamaños del mundo a 39 px/m

WORLD_SPRITES fija el tamaño exacto de 10 muebles, 10 puertas y 10 objetos
recogibles; el resto del plan la lee. Sin imports y con sintaxis borrable,
para que Node la importe desde los scripts del arte.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: El reescalador determinista (`rescale.mjs`)

**Files:**
- Create: `frontend/scripts/world-art/rescale.mjs`
- Create: `frontend/scripts/world-art/rescale.test.mjs`
- Modify: `frontend/package.json` (script `test:world-art`)

**Interfaces:**
- Consumes: nada. Una imagen es `{ width, height, data }`, con `data` RGBA (`Uint8Array` o `Buffer`).
- Produces (de `rescale.mjs`):
  - `boundsOf(image): { x, y, width, height } | null` (caja de los píxeles con alfa > 0);
  - `cropTo(image, bounds): image`;
  - `resample(image, width, height): image` (el reescalado: color dominante por área, alfa binario);
  - `removeIsolatedPixels(image): image`;
  - `rescaleSprite(image, width, height): image` (recorta al cuerpo opaco, reescala y limpia; lanza si la imagen no tiene píxeles opacos);
  - `paletteOf(image): Set<number>` (colores opacos como `0xRRGGBB`);
  - constantes `LINE_LUMINANCE = 70`, `LINE_BIAS = 1.5` y `MIN_COVERAGE = 0.5`.

**Por qué este método (sin IA).** El arte del mundo ya existe; solo hay que llevarlo a otro tamaño sin perder su lenguaje (spec §14: de los muebles entra su escala, no un rediseño). Cada píxel de destino cubre una región del original, con fracciones de píxel:
- es opaco si al menos el 50 % de esa región es opaca (alfa binario);
- toma el color que más área ocupa en la región (solo colores del original, sin mezclas);
- los colores oscuros (luminancia ≤ 70, los contornos) valen 1,5×, así una línea de 1 px sobrevive a una reducción;
- en un empate gana el color de menor valor RGB (determinista);
- al final se quitan los píxeles opacos sin ningún vecino.

- [ ] **Step 1: El script de pruebas**

Crea `<ledger>/edits/t2-package.cjs` (herramienta Write):

```js
// Tarea 2: el script de pruebas del arte del mundo (rutas relativas a frontend/).
module.exports = [
  {
    file: 'package.json',
    find: '    "kit:types": "tsc -p tsconfig.kit.json",\n',
    replace: [
      '    "test:world-art": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test \\"scripts/world-art/*.test.mjs\\"",',
      '    "kit:types": "tsc -p tsconfig.kit.json",',
      '',
    ].join('\n'),
  },
];
```

Aplícalo:

```bash
W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
node $W/tools/edits.cjs $W/edits/t2-package.cjs
```

Expected: `editado package.json`.

- [ ] **Step 2: Escribe la prueba que falla**

Crea `frontend/scripts/world-art/rescale.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { boundsOf, cropTo, paletteOf, removeIsolatedPixels, rescaleSprite, resample } from './rescale.mjs';

const RED = [200, 40, 40];
const DARK = [20, 16, 28];
const SKY = [160, 200, 230];

/** Imagen desde un dibujo: cada carácter es un píxel ('.' transparente; r, d, s = rojo, oscuro, celeste). */
function image(rows) {
  const colors = { r: RED, d: DARK, s: SKY };
  const width = rows[0].length;
  const data = new Uint8Array(width * rows.length * 4);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    data.set([...colors[ch], 255], (y * width + x) * 4);
  }));
  return { width, height: rows.length, data };
}

/** Dibujo de una imagen (inverso de image()). */
function drawing(img) {
  const names = { [RED.join()]: 'r', [DARK.join()]: 'd', [SKY.join()]: 's' };
  const rows = [];
  for (let y = 0; y < img.height; y++) {
    let row = '';
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      row += img.data[i + 3] === 0 ? '.' : names[[img.data[i], img.data[i + 1], img.data[i + 2]].join()] ?? '?';
    }
    rows.push(row);
  }
  return rows;
}

test('al mismo tamaño devuelve los mismos píxeles', () => {
  const src = image(['rrdd', 'ss..', '.rrs']);
  assert.deepEqual(drawing(resample(src, 4, 3)), ['rrdd', 'ss..', '.rrs']);
});

test('2:1 elige el color que más área ocupa; en un empate, el contorno oscuro o el de menor RGB', () => {
  const src = image([
    'rrss',
    'rrss',
    'rsdd',
    'rsrr',
  ]);
  // arriba: bloques de un solo color; abajo izquierda: empate 2-2 entre rojo y celeste → gana el de menor RGB (celeste);
  // abajo derecha: empate 2-2 entre oscuro y rojo → el oscuro pesa 1,5× por ser contorno.
  assert.deepEqual(drawing(resample(src, 2, 2)), ['rs', 'sd']);
});

test('3→2: gana el color mayoritario de la región fraccionaria', () => {
  const src = image(['rrs']);
  // cada destino cubre 1,5 píxeles de origen: el primero ve r(1) + r(0,5) y el segundo r(0,5) + s(1)
  assert.deepEqual(drawing(resample(src, 2, 1)), ['rs']);
});

test('una línea oscura de 1 px sobrevive a una reducción 4→3', () => {
  for (let column = 0; column < 4; column++) {
    const rows = ['ssss', 'ssss', 'ssss', 'ssss'].map(row => row.slice(0, column) + 'd' + row.slice(column + 1));
    const out = drawing(resample(image(rows), 3, 4));
    assert.ok(out.every(row => row.includes('d')), `la línea de la columna ${column} se perdió: ${out.join('|')}`);
    assert.ok(out.every(row => [...row].filter(ch => ch === 'd').length === 1), `la línea de la columna ${column} se ensanchó: ${out.join('|')}`);
  }
});

test('la cobertura mínima decide la transparencia: 2 de 4 opacos es opaco, 1 de 4 no', () => {
  assert.deepEqual(drawing(resample(image(['rr', '..']), 1, 1)), ['r']);
  assert.deepEqual(drawing(resample(image(['r.', '..']), 1, 1)), ['.']);
});

test('nunca inventa colores y el alfa es binario', () => {
  const src = image(['rsdr.', 'sdrs.', 'drsd.', 'rsdr.']);
  const out = resample(src, 3, 3);
  const palette = paletteOf(src);
  for (const color of paletteOf(out)) assert.ok(palette.has(color));
  for (let i = 3; i < out.data.length; i += 4) assert.ok(out.data[i] === 0 || out.data[i] === 255);
});

test('ampliar 1,25× da el tamaño exacto, sin perder la línea', () => {
  const src = image(['ssdss', 'ssdss', 'ssdss', 'ssdss']);
  const out = resample(src, 6, 5);
  assert.equal(out.width, 6);
  assert.equal(out.height, 5);
  assert.ok(drawing(out).every(row => row.includes('d')));
});

test('es determinista', () => {
  const src = image(['rsdr', 'sdrs', 'drsd', 'rsdr', 'sdrs']);
  assert.deepEqual(resample(src, 3, 3).data, resample(src, 3, 3).data);
});

test('boundsOf y cropTo: la caja del cuerpo opaco', () => {
  const src = image(['....', '.rs.', '.dr.', '....']);
  assert.deepEqual(boundsOf(src), { x: 1, y: 1, width: 2, height: 2 });
  assert.deepEqual(drawing(cropTo(src, boundsOf(src))), ['rs', 'dr']);
  assert.equal(boundsOf(image(['..', '..'])), null);
});

test('removeIsolatedPixels quita solo las motas sin vecinos', () => {
  const src = image(['r.....', '..rr..', '..rr..', '.....s']);
  assert.deepEqual(drawing(removeIsolatedPixels(src)), ['......', '..rr..', '..rr..', '......']);
});

test('rescaleSprite recorta, reescala al tamaño exacto y rechaza imágenes vacías', () => {
  const src = image(['......', '.rrrr.', '.rssr.', '.rrrr.', '......']);
  const out = rescaleSprite(src, 2, 2);
  assert.equal(out.width, 2);
  assert.equal(out.height, 2);
  assert.ok(drawing(out).every(row => !row.includes('.')));
  assert.throws(() => rescaleSprite(image(['..']), 1, 1), /no tiene píxeles opacos/);
});
```

- [ ] **Step 3: Córrela y comprueba que falla**

Run: `npm run test:world-art`
Expected: FAIL con `Cannot find module` de `./rescale.mjs`.

- [ ] **Step 4: Implementa el reescalador**

Crea `frontend/scripts/world-art/rescale.mjs`:

```js
/**
 * Reescalado determinista de pixel art a un tamaño exacto (F8, spec §13.1).
 *
 * Trabaja con imágenes `{ width, height, data }` (RGBA, `data` es un Uint8Array/Buffer) y no
 * toca disco: la lectura y la escritura de PNG viven en build.mjs. El resultado usa solo
 * colores de la imagen de origen y alfa binario (0 o 255), como el resto del arte del mundo.
 */

/** Los colores con luminancia hasta este valor se tratan como contorno y pesan más al elegir. */
export const LINE_LUMINANCE = 70;
/** Peso extra de los contornos: así una línea de 1 px sobrevive a un reescalado por fracciones. */
export const LINE_BIAS = 1.5;
/** Fracción mínima de píxeles opacos del origen para que el píxel de destino sea opaco. */
export const MIN_COVERAGE = 0.5;

const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Caja que contiene todos los píxeles con alfa > 0, o null si la imagen está vacía. */
export function boundsOf(image) {
  let x0 = image.width;
  let y0 = image.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

export function cropTo(image, bounds) {
  const data = new Uint8Array(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y++) {
    const from = ((bounds.y + y) * image.width + bounds.x) * 4;
    data.set(image.data.subarray(from, from + bounds.width * 4), y * bounds.width * 4);
  }
  return { width: bounds.width, height: bounds.height, data };
}

/**
 * Cada píxel de destino cubre una región del origen (con fracciones de píxel). Es opaco si al
 * menos MIN_COVERAGE de esa región es opaca, y toma el color dominante por área: los contornos
 * oscuros valen LINE_BIAS veces más. Empate: el color de menor valor RGB (determinista).
 */
export function resample(image, width, height) {
  const out = new Uint8Array(width * height * 4);
  const stepX = image.width / width;
  const stepY = image.height / height;
  const area = stepX * stepY;
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const x0 = tx * stepX;
      const x1 = x0 + stepX;
      const y0 = ty * stepY;
      const y1 = y0 + stepY;
      const weights = new Map();
      let opaque = 0;
      for (let y = Math.floor(y0); y < Math.min(image.height, Math.ceil(y1)); y++) {
        const overlapY = Math.min(y1, y + 1) - Math.max(y0, y);
        for (let x = Math.floor(x0); x < Math.min(image.width, Math.ceil(x1)); x++) {
          const i = (y * image.width + x) * 4;
          if (image.data[i + 3] === 0) continue;
          const weight = (Math.min(x1, x + 1) - Math.max(x0, x)) * overlapY;
          opaque += weight;
          const color = (image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2];
          weights.set(color, (weights.get(color) ?? 0) + weight);
        }
      }
      if (Math.round((opaque / area) * 1e6) < MIN_COVERAGE * 1e6) continue;
      let best = -1;
      let bestWeight = -1;
      for (const [color, weight] of weights) {
        const isLine = luminance(color >> 16, (color >> 8) & 255, color & 255) <= LINE_LUMINANCE;
        const effective = Math.round(weight * (isLine ? LINE_BIAS : 1) * 1e6);
        if (effective > bestWeight || (effective === bestWeight && color < best)) {
          best = color;
          bestWeight = effective;
        }
      }
      const o = (ty * width + tx) * 4;
      out[o] = best >> 16;
      out[o + 1] = (best >> 8) & 255;
      out[o + 2] = best & 255;
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/** Quita los píxeles opacos sin ningún vecino opaco (las 8 direcciones): motas del reescalado. */
export function removeIsolatedPixels(image) {
  const data = new Uint8Array(image.data);
  const opaqueAt = (x, y) => x >= 0 && y >= 0 && x < image.width && y < image.height && image.data[(y * image.width + x) * 4 + 3] !== 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (!opaqueAt(x, y)) continue;
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && opaqueAt(x + dx, y + dy)) neighbors++;
      if (neighbors === 0) data.fill(0, (y * image.width + x) * 4, (y * image.width + x) * 4 + 4);
    }
  }
  return { width: image.width, height: image.height, data };
}

/** Recorta al cuerpo opaco, lo reescala al tamaño exacto y limpia las motas. */
export function rescaleSprite(image, width, height) {
  const bounds = boundsOf(image);
  if (!bounds) throw new Error('la imagen no tiene píxeles opacos');
  return removeIsolatedPixels(resample(cropTo(image, bounds), width, height));
}

/** Colores opacos distintos de una imagen, como enteros 0xRRGGBB. */
export function paletteOf(image) {
  const colors = new Set();
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] !== 0) colors.add((image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2]);
  }
  return colors;
}
```

- [ ] **Step 5: Córrela y comprueba que pasa**

Run: `npm run test:world-art`
Expected: el resumen dice `tests 11`, `pass 11` y `fail 0`.

- [ ] **Step 6: Cierre y commit**

Run: `npm test -- --runInBand` (todo verde; no cambió código de la app).

```bash
git add scripts/world-art/rescale.mjs scripts/world-art/rescale.test.mjs package.json
git commit -m "feat(escala-mundo): reescalador determinista de pixel art

Color dominante por área con ventaja para el contorno, alfa binario, recorte
al cuerpo opaco y limpieza de motas. Solo usa colores del original.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: El arte del mundo a su tamaño — originales, build, contrato y láminas — PARADA A

**Files:**
- Create: `frontend/scripts/world-art/build.mjs`, `build.test.mjs`, `world-art.test.mjs`, `laminas.mjs`
- Create: `frontend/world-art/originals/{furniture,doors,objects}/*.png` (30 copias de los PNG de antes de la F8)
- Modify: `frontend/src/assets/game/{furniture,doors,objects}/*.png` (30, regenerados)
- Modify: `frontend/src/assets/visual/v1/inventory.v1.json` (`expectedDimensions` de los 30)
- Modify: `frontend/package.json` (scripts `world-art:build` y `world-art:laminas`)
- Create: `docs/visual/world-art/escala-muebles.png`, `escala-puertas.png`, `escala-objetos.png`

**Interfaces:**
- Consumes: `WORLD_SPRITES` (tarea 1) y `rescaleSprite`, `paletteOf`, `boundsOf`, `cropTo` (tarea 2).
- Produces:
  - de `build.mjs`: `FRONTEND_ROOT`, `ORIGINALS_DIR`, `OUTPUT_DIR`, `INVENTORY_FILE`, `readPng(file)`, `writePng(file, image)`, `buildWorldArt({ originals?, output?, sprites? }): Array<{ spec, from, to, colors }>` y `syncInventory({ file?, sprites? })`; ejecutado como script, hace las dos cosas;
  - de `world-art.test.mjs`: `MAX_COLORS = 40` y `worldArtFindings(root?, sprites?): string[]`;
  - de `laminas.mjs`: `writeSheets(outDir)`.

**Cómo se mantiene honesto.** El build lee solo `world-art/originals/` (nunca su propia salida), así repetirlo no acumula pérdida. El contrato no compara bytes contra el build: exige tamaños, alfa binario, recorte, a lo sumo 40 colores, ningún PNG que sobre y un inventario que diga la verdad. Eso deja espacio a un retoque a mano si el usuario lo pide.

- [ ] **Step 1: Los scripts**

Crea `<ledger>/edits/t3-package.cjs` (herramienta Write):

```js
// Tarea 3: los scripts que generan el arte del mundo y sus láminas (rutas relativas a frontend/).
module.exports = [
  {
    file: 'package.json',
    find: '    "kit:types": "tsc -p tsconfig.kit.json",\n',
    replace: [
      '    "world-art:build": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/world-art/build.mjs",',
      '    "world-art:laminas": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/world-art/laminas.mjs",',
      '    "kit:types": "tsc -p tsconfig.kit.json",',
      '',
    ].join('\n'),
  },
];
```

Aplícalo:

```bash
W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
node $W/tools/edits.cjs $W/edits/t3-package.cjs
```

Expected: `editado package.json`.

- [ ] **Step 2: Escribe la prueba del build, que falla**

Crea `frontend/scripts/world-art/build.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildWorldArt, readPng, syncInventory, writePng } from './build.mjs';

const SPRITES = [{ group: 'furniture', name: 'mesa', width: 2, height: 2 }];

/** Imagen de `width`×`height` con un cuerpo rojo de `body`×`body` en el centro y margen transparente. */
function withMargin(width, height, body) {
  const data = new Uint8Array(width * height * 4);
  const left = Math.floor((width - body) / 2);
  const top = Math.floor((height - body) / 2);
  for (let y = top; y < top + body; y++) for (let x = left; x < left + body; x++) data.set([200, 40, 40, 255], (y * width + x) * 4);
  return { width, height, data };
}

function sandbox(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'world-art-'));
  try {
    run({ originals: path.join(root, 'originals'), output: path.join(root, 'out'), root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('buildWorldArt recorta el original al cuerpo y escribe el PNG al tamaño exacto', () => {
  sandbox(({ originals, output }) => {
    writePng(path.join(originals, 'furniture', 'mesa.png'), withMargin(8, 8, 4));
    const [result] = buildWorldArt({ originals, output, sprites: SPRITES });
    assert.equal(result.from, '8×8');
    assert.equal(result.to, '2×2');
    const image = readPng(path.join(output, 'furniture', 'mesa.png'));
    assert.deepEqual([image.width, image.height], [2, 2]);
    for (let i = 0; i < image.data.length; i += 4) assert.deepEqual([...image.data.subarray(i, i + 4)], [200, 40, 40, 255]);
  });
});

test('lee solo los originales: repetirlo, o una salida previa distinta, no cambia el resultado', () => {
  sandbox(({ originals, output }) => {
    writePng(path.join(originals, 'furniture', 'mesa.png'), withMargin(8, 8, 4));
    writePng(path.join(output, 'furniture', 'mesa.png'), withMargin(5, 5, 1));
    buildWorldArt({ originals, output, sprites: SPRITES });
    const first = readPng(path.join(output, 'furniture', 'mesa.png'));
    buildWorldArt({ originals, output, sprites: SPRITES });
    assert.deepEqual(readPng(path.join(output, 'furniture', 'mesa.png')).data, first.data);
    assert.equal(first.width, 2);
  });
});

const ENTRY = (name, width, height) => [
  '    {',
  `      "assetId": "furniture-${name}",`,
  `      "src": "game/furniture/${name}.png",`,
  `      "expectedDimensions": { "width": ${width}, "height": ${height} },`,
  '      "logicalScale": 1',
  '    }',
].join('\r\n');

test('syncInventory cambia solo los números de la entrada y conserva el formato y los finales de línea', () => {
  sandbox(({ root }) => {
    const file = path.join(root, 'inventory.json');
    const before = `{\r\n  "assets": [\r\n${ENTRY('mesa', 96, 60)},\r\n${ENTRY('otra', 10, 10)}\r\n  ]\r\n}\r\n`;
    mkdirSync(root, { recursive: true });
    writeFileSync(file, before);
    syncInventory({ file, sprites: [{ group: 'furniture', name: 'mesa', width: 35, height: 22 }] });
    assert.equal(readFileSync(file, 'utf8'), before.replace('"width": 96, "height": 60', '"width": 35, "height": 22'));
  });
});

test('syncInventory falla si el sprite no está en el inventario', () => {
  sandbox(({ root }) => {
    const file = path.join(root, 'inventory.json');
    writeFileSync(file, `{ "assets": [\n${ENTRY('otra', 10, 10)}\n] }`);
    assert.throws(() => syncInventory({ file, sprites: SPRITES }), /no encuentro furniture\/mesa\.png/);
  });
});
```

Run: `npm run test:world-art`
Expected: FAIL: `build.test.mjs` no encuentra `./build.mjs` (las 11 pruebas del reescalador siguen verdes).

- [ ] **Step 3: Implementa el build**

Crea `frontend/scripts/world-art/build.mjs`:

```js
#!/usr/bin/env node
/**
 * Genera los PNG del mundo (muebles, puertas y objetos) a su tamaño exacto (F8, spec §13.1).
 *
 * Lee los originales de `world-art/originals/<grupo>/<nombre>.png` (nunca la salida: repetirlo no
 * acumula pérdida), recorta al cuerpo opaco, reescala por color dominante (rescale.mjs) al tamaño de
 * WORLD_SPRITES y escribe `src/assets/game/<grupo>/<nombre>.png`.
 *
 *   npm run world-art:build
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { WORLD_SPRITES } from '../../src/app/features/simulator/world-scale.util.ts';
import { paletteOf, rescaleSprite } from './rescale.mjs';

export const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ORIGINALS_DIR = path.join(FRONTEND_ROOT, 'world-art', 'originals');
export const OUTPUT_DIR = path.join(FRONTEND_ROOT, 'src', 'assets', 'game');
export const INVENTORY_FILE = path.join(FRONTEND_ROOT, 'src', 'assets', 'visual', 'v1', 'inventory.v1.json');

export function readPng(file) {
  const png = PNG.sync.read(readFileSync(file));
  return { width: png.width, height: png.height, data: png.data };
}

export function writePng(file, image) {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, PNG.sync.write(png));
}

/** Reescala cada sprite de la tabla; devuelve de qué tamaño parte, a cuál llega y cuántos colores usa. */
export function buildWorldArt({ originals = ORIGINALS_DIR, output = OUTPUT_DIR, sprites = WORLD_SPRITES } = {}) {
  return sprites.map(spec => {
    const source = readPng(path.join(originals, spec.group, `${spec.name}.png`));
    const image = rescaleSprite(source, spec.width, spec.height);
    writePng(path.join(output, spec.group, `${spec.name}.png`), image);
    return { spec, from: `${source.width}×${source.height}`, to: `${image.width}×${image.height}`, colors: paletteOf(image).size };
  });
}

/**
 * Pone en el inventario del arte del mundo el tamaño real de cada sprite. Reemplaza solo los números
 * (el archivo tiene un formato a mano y finales de línea propios que no hay que tocar).
 */
export function syncInventory({ file = INVENTORY_FILE, sprites = WORLD_SPRITES } = {}) {
  let text = readFileSync(file, 'utf8');
  for (const { group, name, width, height } of sprites) {
    const entry = new RegExp(`("src": "game/${group}/${name}\\.png"[\\s\\S]*?"expectedDimensions": \\{ "width": )\\d+(, "height": )\\d+( \\})`);
    if (!entry.test(text)) throw new Error(`inventario: no encuentro ${group}/${name}.png`);
    text = text.replace(entry, (_all, head, middle, tail) => `${head}${width}${middle}${height}${tail}`);
  }
  writeFileSync(file, text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const { spec, from, to, colors } of buildWorldArt()) {
    process.stdout.write(`${spec.group}/${spec.name}.png  ${from} → ${to}  (${colors} colores)\n`);
  }
  syncInventory();
  process.stdout.write('inventario sincronizado (src/assets/visual/v1/inventory.v1.json)\n');
}
```

Run: `npm run test:world-art`
Expected: el resumen dice `tests 15` y `pass 15`.

- [ ] **Step 4: Escribe el contrato del arte, que falla contra el arte de hoy**

Crea `frontend/scripts/world-art/world-art.test.mjs`:

```js
/**
 * Arte del mundo a su tamaño exacto (F8, spec §13.1): los PNG de muebles, puertas y objetos miden lo
 * que dice WORLD_SPRITES, están recortados al cuerpo opaco, tienen alfa binario y pocos colores, no
 * sobra ninguno y el inventario cuenta la verdad. Así se dibujan a escala 1 sin mezclar píxeles.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { WORLD_SPRITES } from '../../src/app/features/simulator/world-scale.util.ts';
import { FRONTEND_ROOT, readPng, writePng } from './build.mjs';
import { boundsOf, paletteOf } from './rescale.mjs';

/** El arte original usa 14-26 colores por sprite; más de 40 es un reescalado que mezcló píxeles. */
export const MAX_COLORS = 40;
const GROUPS = ['furniture', 'doors', 'objects'];

export function worldArtFindings(root = FRONTEND_ROOT, sprites = WORLD_SPRITES) {
  const findings = [];
  const assets = path.join(root, 'src', 'assets', 'game');
  for (const spec of sprites) {
    const label = `${spec.group}/${spec.name}.png`;
    if (!existsSync(path.join(root, 'world-art', 'originals', spec.group, `${spec.name}.png`))) {
      findings.push(`${label}: falta el original en world-art/originals`);
    }
    const file = path.join(assets, spec.group, `${spec.name}.png`);
    if (!existsSync(file)) {
      findings.push(`${label}: no existe`);
      continue;
    }
    const image = readPng(file);
    if (image.width !== spec.width || image.height !== spec.height) {
      findings.push(`${label}: mide ${image.width}×${image.height} y la tabla dice ${spec.width}×${spec.height}`);
    }
    let binary = true;
    for (let i = 3; i < image.data.length; i += 4) if (image.data[i] !== 0 && image.data[i] !== 255) binary = false;
    if (!binary) findings.push(`${label}: el alfa no es binario`);
    const bounds = boundsOf(image);
    if (!bounds || bounds.width !== image.width || bounds.height !== image.height) findings.push(`${label}: no está recortado al cuerpo opaco`);
    const colors = paletteOf(image).size;
    if (colors > MAX_COLORS) findings.push(`${label}: usa ${colors} colores (máximo ${MAX_COLORS})`);
  }
  for (const group of GROUPS) {
    const dir = path.join(assets, group);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(name => name.endsWith('.png'))) {
      if (!sprites.some(spec => spec.group === group && `${spec.name}.png` === file)) findings.push(`${group}/${file}: no está en WORLD_SPRITES`);
    }
  }
  const inventoryFile = path.join(root, 'src', 'assets', 'visual', 'v1', 'inventory.v1.json');
  if (existsSync(inventoryFile)) {
    const inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'));
    for (const spec of sprites) {
      const entry = inventory.assets.find(asset => asset.src === `game/${spec.group}/${spec.name}.png`);
      if (!entry) {
        findings.push(`inventario: no lista ${spec.group}/${spec.name}.png`);
        continue;
      }
      const { width, height } = entry.expectedDimensions ?? {};
      if (width !== spec.width || height !== spec.height) {
        findings.push(`inventario: ${entry.assetId} dice ${width}×${height} y la tabla ${spec.width}×${spec.height}`);
      }
      if (entry.logicalScale !== 1) findings.push(`inventario: ${entry.assetId} no está a escala lógica 1`);
    }
  }
  return findings;
}

test('el arte del mundo está a su tamaño exacto (spec §13.1, decisión 12)', () => {
  assert.deepEqual(worldArtFindings(), []);
});

test('el detector ve un PNG de otro tamaño, con alfa parcial y sin recortar, un huérfano y un inventario falso', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'world-art-contrato-'));
  try {
    const spec = { group: 'furniture', name: 'mesa', width: 2, height: 2 };
    const original = { width: 2, height: 2, data: new Uint8Array(16).fill(255) };
    writePng(path.join(root, 'world-art', 'originals', 'furniture', 'mesa.png'), original);
    // 3×3 con un píxel semitransparente y la última fila vacía
    const bad = { width: 3, height: 3, data: new Uint8Array(36) };
    bad.data.set([200, 40, 40, 255, 200, 40, 40, 128, 200, 40, 40, 255], 0);
    writePng(path.join(root, 'src', 'assets', 'game', 'furniture', 'mesa.png'), bad);
    writePng(path.join(root, 'src', 'assets', 'game', 'furniture', 'sobra.png'), original);
    const inventory = path.join(root, 'src', 'assets', 'visual', 'v1');
    mkdirSync(inventory, { recursive: true });
    writeFileSync(path.join(inventory, 'inventory.v1.json'), JSON.stringify({
      assets: [{ assetId: 'furniture-mesa', src: 'game/furniture/mesa.png', expectedDimensions: { width: 9, height: 9 }, logicalScale: 2 }],
    }));
    assert.deepEqual(worldArtFindings(root, [spec]), [
      'furniture/mesa.png: mide 3×3 y la tabla dice 2×2',
      'furniture/mesa.png: el alfa no es binario',
      'furniture/mesa.png: no está recortado al cuerpo opaco',
      'furniture/sobra.png: no está en WORLD_SPRITES',
      'inventario: furniture-mesa dice 9×9 y la tabla 2×2',
      'inventario: furniture-mesa no está a escala lógica 1',
    ]);
    rmSync(path.join(root, 'world-art'), { recursive: true });
    assert.ok(worldArtFindings(root, [spec]).includes('furniture/mesa.png: falta el original en world-art/originals'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

Run: `npm run test:world-art`
Expected: FAIL solo en `el arte del mundo está a su tamaño exacto`. La lista de hallazgos trae 30 líneas `falta el original en world-art/originals` y los tamaños de antes (por ejemplo `furniture/counter.png: mide 236×73 y la tabla dice 181×56`). La prueba del detector pasa.

- [ ] **Step 5: Archiva los originales (antes de generar nada)**

Los PNG de hoy son el arte de antes de la F8 y pasan a ser los originales. Si lo generas primero, los pierdes: comprueba que están intactos y cópialos.

```bash
git diff --stat -- src/assets/game
mkdir -p world-art/originals/furniture world-art/originals/doors world-art/originals/objects
cp src/assets/game/furniture/*.png world-art/originals/furniture/
cp src/assets/game/doors/*.png world-art/originals/doors/
cp src/assets/game/objects/*.png world-art/originals/objects/
ls world-art/originals/furniture | wc -l; ls world-art/originals/doors | wc -l; ls world-art/originals/objects | wc -l
```

Expected: el `git diff --stat` no imprime nada (los PNG siguen como en HEAD) y los tres `wc -l` dan `10`.

- [ ] **Step 6: Genera el arte**

Run: `npm run world-art:build`

Expected (el original → el tamaño de la tabla, y los colores que usa cada pieza):

```
furniture/counter.png  236×73 → 181×56  (23 colores)
furniture/gurney.png  122×46 → 103×39  (19 colores)
furniture/waiting_chairs.png  156×62 → 93×34  (21 colores)
furniture/plant.png  49×64 → 36×47  (18 colores)
furniture/sofa.png  146×74 → 87×44  (23 colores)
furniture/coffee_table.png  96×60 → 35×22  (15 colores)
furniture/shelf.png  142×150 → 62×74  (26 colores)
furniture/chair.png  27×46 → 22×34  (19 colores)
furniture/file_cabinet.png  130×97 → 68×51  (24 colores)
furniture/desk.png  224×106 → 122×58  (16 colores)
doors/door_urgencias.png  48×64 → 54×59  (18 colores)
doors/door_urgencias_side.png  48×64 → 37×74  (19 colores)
doors/door_salida_institucional.png  48×64 → 44×74  (21 colores)
doors/door_salida_institucional_side.png  48×64 → 27×71  (17 colores)
doors/door_recepcion.png  48×64 → 44×74  (23 colores)
doors/door_recepcion_side.png  48×64 → 27×71  (18 colores)
doors/door_sala_escucha.png  48×64 → 37×74  (18 colores)
doors/door_sala_escucha_side.png  48×64 → 22×71  (17 colores)
doors/door_consultorio.png  48×64 → 39×74  (19 colores)
doors/door_consultorio_side.png  48×64 → 25×71  (16 colores)
objects/tool_pap.png  64×64 → 28×21  (16 colores)
objects/tool_spikes.png  64×64 → 23×28  (18 colores)
objects/tool_reflection_journal.png  64×64 → 22×28  (16 colores)
objects/tool_safety_route.png  64×64 → 26×28  (14 colores)
objects/tool_risk_meter.png  64×64 → 28×26  (20 colores)
objects/object_expediente.png  64×64 → 28×22  (15 colores)
objects/object_marco_normativo.png  64×64 → 22×28  (20 colores)
objects/object_registro.png  64×64 → 28×25  (18 colores)
objects/object_acceso_restringido.png  64×64 → 15×28  (15 colores)
objects/object_cierre.png  64×64 → 26×28  (16 colores)
inventario sincronizado (src/assets/visual/v1/inventory.v1.json)
```

El build también sincroniza `expectedDimensions` en `inventory.v1.json`.

- [ ] **Step 7: Comprueba que el contrato pasa y que el inventario cuadra**

Run: `npm run test:world-art`
Expected: el resumen dice `tests 17` y `pass 17`.

Run: `npm run test:visual-assets`
Expected: verde (el inventario ya dice los tamaños nuevos).

- [ ] **Step 8: Escribe las láminas de revisión**

Crea `frontend/scripts/world-art/laminas.mjs`:

```js
#!/usr/bin/env node
/**
 * Láminas de revisión de la escala del mundo (F8): cada pieza nueva a ×3, de pie junto a Valentina
 * (cuadro de reposo de frente del kit) para juzgar la proporción, y el original al lado.
 *
 *   npm run world-art:laminas [-- --out <carpeta>]   (por defecto docs/visual/world-art/)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { WORLD_SPRITES } from '../../src/app/features/simulator/world-scale.util.ts';
import { FRONTEND_ROOT, ORIGINALS_DIR, OUTPUT_DIR, readPng } from './build.mjs';
import { boundsOf, cropTo } from './rescale.mjs';

const ZOOM = 3;
const PAD = 12;
const GROUPS = { furniture: 'muebles', doors: 'puertas', objects: 'objetos' };
const BACKGROUND = [38, 42, 52];
const GUIDE = [58, 64, 80];

/** Valentina de frente, recortada: la vara de medir de 64 px. */
function reference() {
  const idle = readPng(path.join(FRONTEND_ROOT, 'src', 'assets', 'characters', 'kit', 'valentina', 'idle.png'));
  const frame = cropTo({ width: 192, height: 72, data: idle.data.subarray(0, 192 * 72 * 4) }, { x: 0, y: 0, width: 48, height: 72 });
  return cropTo({ ...frame, width: 48, height: 72 }, boundsOf(frame));
}

function blit(canvas, image, left, baseline, zoom) {
  const top = baseline - image.height * zoom;
  for (let y = 0; y < image.height * zoom; y++) {
    for (let x = 0; x < image.width * zoom; x++) {
      const s = (Math.floor(y / zoom) * image.width + Math.floor(x / zoom)) * 4;
      if (image.data[s + 3] === 0) continue;
      const d = ((top + y) * canvas.width + left + x) * 4;
      canvas.data[d] = image.data[s];
      canvas.data[d + 1] = image.data[s + 1];
      canvas.data[d + 2] = image.data[s + 2];
    }
  }
}

function sheet(group, person) {
  const sprites = WORLD_SPRITES.filter(spec => spec.group === group);
  const items = sprites.map(spec => ({
    spec,
    original: readPng(path.join(ORIGINALS_DIR, group, `${spec.name}.png`)),
    current: readPng(path.join(OUTPUT_DIR, group, `${spec.name}.png`)),
  }));
  const rowHeight = (Math.max(person.height, ...items.map(i => i.current.height), ...items.map(i => i.original.height)) * ZOOM) + PAD * 2;
  const rowWidth = (person.width + Math.max(...items.map(i => i.current.width)) + Math.max(...items.map(i => i.original.width))) * ZOOM + PAD * 5;
  const png = new PNG({ width: rowWidth, height: rowHeight * items.length });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([...BACKGROUND, 255], i);
  items.forEach((item, row) => {
    const baseline = row * rowHeight + rowHeight - PAD;
    for (let x = 0; x < rowWidth; x++) png.data.set([...GUIDE, 255], (baseline * png.width + x) * 4); // suelo
    let left = PAD;
    blit(png, person, left, baseline, ZOOM);
    left += person.width * ZOOM + PAD;
    blit(png, item.current, left, baseline, ZOOM);
    left += Math.max(...items.map(i => i.current.width)) * ZOOM + PAD * 2;
    blit(png, item.original, left, baseline, ZOOM);
  });
  return png;
}

export function writeSheets(outDir) {
  mkdirSync(outDir, { recursive: true });
  const person = reference();
  for (const [group, label] of Object.entries(GROUPS)) {
    const file = path.join(outDir, `escala-${label}.png`);
    writeFileSync(file, PNG.sync.write(sheet(group, person)));
    process.stdout.write(`lámina ${file}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv.indexOf('--out');
  writeSheets(out >= 0 ? path.resolve(process.argv[out + 1]) : path.join(FRONTEND_ROOT, '..', 'docs', 'visual', 'world-art'));
}
```

Run: `npm run world-art:laminas`
Expected: tres líneas `lámina …/docs/visual/world-art/escala-muebles.png`, `…escala-puertas.png` y `…escala-objetos.png`.

Cada fila de una lámina es una pieza a ×3: Valentina de frente (la vara de medir de 64 px), la pieza nueva y, a la derecha, el original. Míralas con la herramienta Read y comprueba:
- los bordes son nítidos: sin píxeles sueltos ni contornos cortados;
- ningún mueble parece de otra escala que Valentina: la estantería (74 px) la supera, la mesa de centro (22 px) le llega a la rodilla y el resto queda entre ambos;
- las puertas superan a Valentina en 6 px o más, salvo la doble puerta de urgencias (`door_urgencias`, 59 px): es el arte original, una puerta baja, y el spec (§14) no pide rediseñarlo;
- los iconos recogibles siguen leyéndose (botiquín, bitácora, medidor de riesgo, señal de ruta…).

Si algo falla, repara el reescalador o la fila de la tabla antes de seguir (con TDD) y regenera.

- [ ] **Step 9: Cierre y commit**

Run: `npm test -- --runInBand` (verde). Anota en el ledger el `Ruling:` de los tamaños (tarea 1) si aún no lo hiciste.

```bash
git add scripts/world-art world-art src/assets/game src/assets/visual/v1/inventory.v1.json package.json ../docs/visual/world-art
git commit -m "feat(escala-mundo): el arte del mundo a 39 px/m, reescalado de los originales

Los 30 PNG de muebles, puertas y objetos recogibles se generan con
npm run world-art:build desde world-art/originals y miden lo que dice
WORLD_SPRITES. El contrato npm run test:world-art exige tamaños, alfa
binario, recorte, paleta y un inventario honesto. Láminas de revisión en
docs/visual/world-art.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 10: PARADA A — láminas del arte del mundo**

Muestra al usuario las tres láminas con `SendUserFile` (`display: 'render'`) y pregunta, citando el HEAD (`git rev-parse --short HEAD`):

> «Estas láminas muestran muebles, puertas y objetos a 39 px/m junto a Valentina, con el original al lado. ¿Apruebas los tamaños y las piezas, o cambio algo? (La doble puerta de urgencias queda más baja que Valentina porque su arte original lo es; no la rediseñé.)»

**No empieces la tarea 4 hasta tener respuesta.** La aprobación vale para ese HEAD.
- Si pide otro tamaño para una pieza: cambia su fila en `WORLD_SPRITES` y su caso en `world-scale.util.spec.ts` (`BEFORE` o `PICKUPS`), corre `npm run world-art:build` y `npm run world-art:laminas`, vuelve a mostrar y registra un `Ruling:`.
- Si pide un retoque a mano de una pieza: se retoca el original en `world-art/originals/` y se vuelve a correr el build (el contrato admite el resultado mientras cumpla tamaño, alfa, recorte y paleta).

---

### Task 4: Los muebles de las salas a escala 1

**Files:**
- Modify: `frontend/src/app/features/simulator/case-pdf-rooms.renderer.ts`
- Create: `frontend/src/app/features/simulator/case-pdf-rooms.furniture.spec.ts`

**Interfaces:**
- Consumes: `furniturePlacement`, `staleSpriteSize` y `worldSprite` (tarea 1); los PNG regenerados (tarea 3).
- Produces: `paintFurnitureSprite(scene, key, cx, feetY, shadowAlpha = 0.3): boolean` (privada del renderer). Dibuja la sombra de contacto y el mueble a escala 1, anclado por la esquina inferior izquierda (`setOrigin(0, 1)`), con coordenadas enteras y a la profundidad `actorDepth(feetY)`; devuelve `false` si no hay textura (entonces el `paintX` de la sala cae a su cuerpo vectorial).

**Qué cambia y qué no.** Hoy el renderer calcula una escala fraccionaria por mueble (`FURNITURE_MAX_H`, ancho de la huella / ancho del PNG). Con la tabla, el PNG ya mide lo que debe: no hay escala que calcular. **Las huellas de colisión no cambian** (`case-pdf-rooms.geometry.ts`): el sprite, más chico, queda dentro de ellas y deja un margen invisible; ajustar las huellas cambiaría los caminos del jugador y de los e2e, y no es parte de la F8.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `frontend/src/app/features/simulator/case-pdf-rooms.furniture.spec.ts`. Usa una escena falsa que anota cada imagen que se dibuja (posición, ancla, si se escaló y si se forzó su tamaño); las cuatro salas se renderizan con ella.

```ts
import { CASE_ROOM_FURNITURE } from './case-pdf-rooms.geometry';
import { CASE_PDF_ROOM_RENDERERS } from './case-pdf-rooms.renderer';
import { furnitureTextureKey } from './furniture-sprite.util';
import { WORLD_SPRITES, worldSprite } from './world-scale.util';

interface DrawnImage {
  key: string;
  x: number;
  y: number;
  origin: [number, number];
  scaled: boolean;
  displaySize: [number, number] | null;
}

type TextureSize = (textureKey: string) => { width: number; height: number };

/** El PNG mide lo que dice la tabla. */
const exactSize: TextureSize = key => {
  const spec = WORLD_SPRITES.find(entry => furnitureTextureKey(entry.name) === key)!;
  return { width: spec.width, height: spec.height };
};

/** Escena falsa: anota cada imagen (posición, ancla, escala y tamaño forzado). Sin `hasTextures`, la carga de texturas falló. */
function furnitureScene(textureSize: TextureSize, hasTextures = true): { scene: never; images: DrawnImage[] } {
  const images: DrawnImage[] = [];
  const chain: unknown = new Proxy(function noop() { /* cadena */ }, {
    get(_target, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === Symbol.iterator) return function* empty() { /* nada */ };
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && ['x', 'y', 'width', 'height', 'alpha', 'scale', 'displayWidth', 'displayHeight', 'length'].includes(prop)) return 0;
      return chain;
    },
    apply: () => chain,
  });
  const scene = {
    textures: { exists: () => hasTextures },
    add: new Proxy({}, {
      get: (_target, prop) => {
        if (prop !== 'image') return () => chain;
        return (x: number, y: number, key: string) => {
          const drawn: DrawnImage = { key, x, y, origin: [0.5, 0.5], scaled: false, displaySize: null };
          images.push(drawn);
          const image: Record<string, unknown> = {
            ...textureSize(key),
            setOrigin: (ox: number, oy: number) => { drawn.origin = [ox, oy]; return image; },
            setScale: () => { drawn.scaled = true; return image; },
            setDisplaySize: (width: number, height: number) => { drawn.displaySize = [width, height]; return image; },
            setDepth: () => image,
          };
          return image;
        };
      },
    }),
  };
  return { scene: scene as never, images };
}

const OPTIONS = { width: 960, height: 528, reduceMotion: false, ambientTone: 'calm' } as const;

/** Muebles que dibuja cada sala, en orden; el mismo orden que sus huellas de colisión. */
const EXPECTED: Readonly<Record<string, readonly string[]>> = {
  'hospital-urgencias': ['counter', 'waiting_chairs', 'gurney', 'plant'],
  'hospital-sala-escucha': ['sofa', 'coffee_table', 'shelf', 'chair'],
  'comisaria-recepcion': ['counter', 'file_cabinet', 'waiting_chairs'],
  'comisaria-consultorio': ['desk', 'file_cabinet', 'chair', 'chair', 'plant'],
};

const ROOMS = CASE_PDF_ROOM_RENDERERS.map(renderer => [renderer.key.replace('case-pdf-', ''), renderer] as const);

describe('muebles de las salas del caso: escala 1 y tamaño de la tabla (spec §13.1)', () => {
  it.each(ROOMS)('%s dibuja sus muebles a escala 1, anclados por la esquina inferior izquierda', (kind, renderer) => {
    const { scene, images } = furnitureScene(exactSize);
    renderer.render(scene, OPTIONS);
    expect(images.map(image => image.key)).toEqual(EXPECTED[kind].map(furnitureTextureKey));
    for (const image of images) {
      expect(image.scaled).toBe(false);
      expect(image.displaySize).toBeNull();
      expect(image.origin).toEqual([0, 1]);
      expect(Number.isInteger(image.x) && Number.isInteger(image.y)).toBe(true);
    }
  });

  it.each(ROOMS)('%s: cada mueble queda dentro de su huella de colisión y asentado sobre ella', (kind, renderer) => {
    const { scene, images } = furnitureScene(exactSize);
    renderer.render(scene, OPTIONS);
    const footprints = CASE_ROOM_FURNITURE[kind];
    expect(images).toHaveLength(footprints.length);
    images.forEach((image, index) => {
      const footprint = footprints[index];
      const spec = WORLD_SPRITES.find(entry => furnitureTextureKey(entry.name) === image.key)!;
      expect(image.x).toBeGreaterThanOrEqual(footprint.x);
      expect(image.x + spec.width).toBeLessThanOrEqual(footprint.x + footprint.width);
      expect(image.y).toBeGreaterThanOrEqual(footprint.y);
      expect(image.y).toBeLessThanOrEqual(footprint.y + footprint.height + 12);
    });
  });

  it.each(ROOMS)('%s sin texturas (la carga falló) no lanza ni dibuja imágenes: cae al cuerpo vectorial', (_kind, renderer) => {
    const { scene, images } = furnitureScene(exactSize, false);
    expect(() => renderer.render(scene, OPTIONS)).not.toThrow();
    expect(images).toEqual([]);
  });

  it('un PNG con otro tamaño que la tabla (caché vieja tras un despliegue) se fuerza al tamaño de la tabla', () => {
    const sofa = worldSprite('furniture', 'sofa');
    const stale: TextureSize = key => (key === furnitureTextureKey('sofa') ? { width: 146, height: 74 } : exactSize(key));
    const { scene, images } = furnitureScene(stale);
    CASE_PDF_ROOM_RENDERERS.find(renderer => renderer.key === 'case-pdf-hospital-sala-escucha')!.render(scene, OPTIONS);
    expect(images.find(image => image.key === furnitureTextureKey('sofa'))!.displaySize).toEqual([sofa.width, sofa.height]);
    expect(images.filter(image => image.displaySize !== null)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Córrela y comprueba que falla**

Run: `npm test -- --runInBand case-pdf-rooms.furniture`
Expected: `Tests: 9 failed, 4 passed, 13 total`. Fallan las pruebas de escala 1 y de huella de las cuatro salas (el renderer de hoy llama a `setScale` y ancla por el centro) y la de la textura vieja (no fuerza el tamaño). Las cuatro «sin texturas» ya pasan: fijan lo que hoy se cumple.

- [ ] **Step 3: Cambia el renderer**

Crea `<ledger>/edits/t4-renderer.cjs` (herramienta Write). Sustituye `FURNITURE_MAX_H` y la función por la versión de la tabla, importa las utilidades y quita los tres argumentos de tamaño de las diez llamadas:

```js
// Cambios de la tarea 4 en case-pdf-rooms.renderer.ts (rutas relativas a frontend/).
const FILE = 'src/app/features/simulator/case-pdf-rooms.renderer.ts';

module.exports = [
  {
    file: FILE,
    find: "import { FurnitureKey, resolveFurnitureTextureKey } from './furniture-sprite.util';",
    replace: "import { FurnitureKey, resolveFurnitureTextureKey } from './furniture-sprite.util';\nimport { furniturePlacement, staleSpriteSize, worldSprite } from './world-scale.util';",
  },
  {
    file: FILE,
    start: '/**\n * Altura MÁXIMA en pantalla de cada mueble',
    end: '  return true;\n}\n',
    replace: [
      '/**',
      ' * Dibuja un mueble como sprite pixel-art a ESCALA 1 (spec §13.1, decisión 12), o devuelve `false`',
      ' * si no hay textura (→ el `paintX` cae a su cuerpo vectorial).',
      ' *',
      ' * El PNG mide lo que dice WORLD_SPRITES: aquí no hay escala que calcular. Conserva la sombra de',
      ' * contacto y la profundidad `actorDepth(feetY)` que usaba el vector, así el mueble queda asentado',
      ' * y ordenado igual respecto al jugador. Un PNG viejo en la caché del navegador (otro tamaño que',
      ' * el de la tabla) se fuerza al tamaño de la tabla en vez de dibujarse enorme.',
      ' */',
      'function paintFurnitureSprite(',
      '  scene: Phaser.Scene, key: FurnitureKey, cx: number, feetY: number, shadowAlpha = 0.3,',
      '): boolean {',
      '  const texKey = resolveFurnitureTextureKey(key);',
      '  if (!texKey || !scene.textures.exists(texKey)) return false;',
      '  const place = furniturePlacement(key, cx, feetY);',
      '  const depth = actorDepth(feetY);',
      '  const g = scene.add.graphics().setDepth(depth);',
      '  contactShadow(g, place.shadow.x, place.shadow.y, place.shadow.width, place.shadow.height, shadowAlpha);',
      '  const image = scene.add.image(place.image.x, place.image.y, texKey).setOrigin(0, 1).setDepth(depth);',
      "  const stale = staleSpriteSize(worldSprite('furniture', key), image.width, image.height);",
      '  if (stale) image.setDisplaySize(stale.width, stale.height);',
      '  return true;',
      '}',
      '',
    ].join('\n'),
  },
  { file: FILE, find: "paintFurnitureSprite(scene, 'counter', cx, cy + 32, w + 16, w + 24, 22, 0.3)", replace: "paintFurnitureSprite(scene, 'counter', cx, cy + 32, 0.3)" },
  { file: FILE, find: "paintFurnitureSprite(scene, 'waiting_chairs', cx, cy + 22, 156, 160, 16, 0.26)", replace: "paintFurnitureSprite(scene, 'waiting_chairs', cx, cy + 22, 0.26)" },
  { file: FILE, find: "paintFurnitureSprite(scene, 'file_cabinet', cx, cy + 32, w, w + 16, 16, 0.28)", replace: "paintFurnitureSprite(scene, 'file_cabinet', cx, cy + 32, 0.28)" },
  { file: FILE, find: "paintFurnitureSprite(scene, 'plant', x, y + 18 * s, 48 * s, 44 * s, 12 * s, 0.3)", replace: "paintFurnitureSprite(scene, 'plant', x, y + 18 * s, 0.3)" },
  { file: FILE, find: "paintFurnitureSprite(scene, 'desk', x, y + 42, w + 24, w + 60, 24, 0.32)", replace: "paintFurnitureSprite(scene, 'desk', x, y + 42, 0.32)" },
  { file: FILE, find: "paintFurnitureSprite(scene, 'chair', x, y + 14, 40, 40, 10, 0.24)", replace: "paintFurnitureSprite(scene, 'chair', x, y + 14, 0.24)" },
  { file: FILE, find: "paintFurnitureSprite(scene, 'sofa', x, y + 40, 146, 150, 22, 0.3)", replace: "paintFurnitureSprite(scene, 'sofa', x, y + 40, 0.3)" },
  { file: FILE, find: "paintFurnitureSprite(scene, 'coffee_table', x, y + 16, 96, 100, 14, 0.26)", replace: "paintFurnitureSprite(scene, 'coffee_table', x, y + 16, 0.26)" },
  { file: FILE, find: "paintFurnitureSprite(scene, 'gurney', x, y + 28, 122, 120, 16, 0.28)", replace: "paintFurnitureSprite(scene, 'gurney', x, y + 28, 0.28)" },
  { file: FILE, find: "paintFurnitureSprite(scene, 'shelf', x, y + 24, w, w + 14, 14, 0.26)", replace: "paintFurnitureSprite(scene, 'shelf', x, y + 24, 0.26)" },
];
```

```bash
W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
node $W/tools/edits.cjs $W/edits/t4-renderer.cjs
```

Expected: `editado src/app/features/simulator/case-pdf-rooms.renderer.ts` doce veces.

- [ ] **Step 4: Córrela y comprueba que pasa**

Run: `npm test -- --runInBand case-pdf-rooms`
Expected: PASS: 2 suites y 23 pruebas (las 13 nuevas y las 10 que ya existían de las salas).

- [ ] **Step 5: Cierre y commit**

Run: `npm test -- --runInBand` (todo verde) y `npm run build` (sin errores de tipos).

```bash
git add src/app/features/simulator/case-pdf-rooms.renderer.ts src/app/features/simulator/case-pdf-rooms.furniture.spec.ts
git commit -m "feat(escala-mundo): los muebles de las salas a escala 1

paintFurnitureSprite deja de calcular una escala fraccionaria por mueble:
el PNG ya mide lo que dice WORLD_SPRITES y se ancla por su esquina inferior
izquierda en coordenadas enteras. Una textura vieja en la caché se fuerza
al tamaño de la tabla. Las huellas de colisión no cambian.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Las puertas del mundo a escala 1

**Files:**
- Modify: `frontend/src/app/features/simulator/game-world.component.ts`
- Create: `frontend/src/app/features/simulator/game-world.world-scale.contract.spec.ts`

**Interfaces:**
- Consumes: `DOOR_FALLBACK_HEIGHT`, `DOOR_SPRITE_FEET_Y`, `doorHintY`, `staleSpriteSize` y `worldSpriteForTexture` (tarea 1).
- Produces (dentro de `GameWorldScene`):
  - `private atWorldScale<T extends Phaser.GameObjects.Image>(image: T): T`: deja la imagen a escala 1 y, si su textura no mide lo que dice la tabla (un PNG viejo en la caché), le fuerza el tamaño de la tabla con `setDisplaySize`; las texturas que no son del mundo (Kenney) no se tocan;
  - `buildDoorSprite` sin `setScale`, anclada por la base (`setOrigin(0.5, 1)`);
  - el aviso de la puerta (`E`) flota sobre su borde alto: `doorHintY(object.y, doorSprite?.displayHeight ?? DOOR_FALLBACK_HEIGHT)`.

**Por qué el aviso cambia.** Antes flotaba en `object.y - 90`, calculado para una puerta de 93 px (`DOOR_SPRITE_SCALE = 1,45`). Las puertas nuevas miden 59-74 px y la de respaldo 48: con un `-90` fijo el aviso quedaría lejos de la puerta. La puerta de respaldo (sala de autoría, sin PNG) mide 48 px y el aviso va 13 px sobre su borde alto.

- [ ] **Step 1: Escribe el contrato que falla**

El contrato lee el fuente de la escena (como los demás `*.contract.spec.ts` del simulador). Crea `frontend/src/app/features/simulator/game-world.world-scale.contract.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

// Fin de línea normalizado: el checkout de Windows trae CRLF y `body()` busca el cierre con \n.
const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8').replace(/\r\n/g, '\n');

/** Cuerpo de un método de la escena (hasta su llave de cierre a 2 espacios). */
function body(signature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`no encuentro ${signature}`);
  return source.slice(start, source.indexOf('\n  }\n', start));
}

describe('game-world: puertas, herramientas y objetos a escala 1 (spec §13.1, decisión 12)', () => {
  it('la puerta no se escala: se ancla por la base y solo se fuerza el tamaño si el PNG es viejo', () => {
    const door = body('private buildDoorSprite(object: MapObjectState): Phaser.GameObjects.Image | null {');
    expect(door).toContain('.setOrigin(0.5, 1)');
    expect(door).toContain('return this.atWorldScale(image);');
    expect(door).not.toMatch(/setScale/);
    expect(source).not.toContain('DOOR_SPRITE_SCALE');
  });

  it('un PNG con otro tamaño que la tabla (caché vieja tras un despliegue) se fuerza al tamaño de la tabla', () => {
    const guard = body('private atWorldScale<T extends Phaser.GameObjects.Image>(image: T): T {');
    expect(guard).toContain('worldSpriteForTexture(image.texture.key)');
    expect(guard).toContain('staleSpriteSize(spec, image.width, image.height)');
    expect(guard).toContain('image.setDisplaySize(stale.width, stale.height)');
  });

  it('el aviso de la puerta flota sobre su borde alto, sea cual sea su alto', () => {
    expect(source).toContain('doorHintY(object.y, doorSprite?.displayHeight ?? DOOR_FALLBACK_HEIGHT)');
    expect(source).not.toContain('object.y - 90');
  });
});
```

- [ ] **Step 2: Córrelo y comprueba que falla**

Run: `npm test -- --runInBand game-world.world-scale`
Expected: `Tests: 3 failed, 3 total`: la escena aún usa `DOOR_SPRITE_SCALE`, no tiene `atWorldScale` ni `doorHintY`, y el aviso sigue en `object.y - 90` (la segunda prueba falla con `no encuentro private atWorldScale…`).

- [ ] **Step 3: Cambia la escena**

Crea `<ledger>/edits/t5-doors.cjs` (herramienta Write):

```js
// Tarea 5 (puertas): cambios en game-world.component.ts (rutas relativas a frontend/).
const FILE = 'src/app/features/simulator/game-world.component.ts';

module.exports = [
  {
    file: FILE,
    find: "import { PATIENT_ICON_KINDS, patientIconImage, patientIconKey, patientIconKind, patientIconView } from './patient-state-icon.util';",
    replace: [
      "import { PATIENT_ICON_KINDS, patientIconImage, patientIconKey, patientIconKind, patientIconView } from './patient-state-icon.util';",
      "import { DOOR_FALLBACK_HEIGHT, DOOR_SPRITE_FEET_Y, doorHintY, staleSpriteSize, worldSpriteForTexture } from './world-scale.util';",
    ].join('\n'),
  },
  {
    file: FILE,
    start: '/**\n * Escala de render de las puertas',
    end: 'const DOOR_SPRITE_FEET_Y = 16;\n',
    replace: '',
  },
  {
    file: FILE,
    find: [
      '    return this.add.image(0, DOOR_SPRITE_FEET_Y, key)',
      '      .setOrigin(0.5, 1)',
      '      .setScale(DOOR_SPRITE_SCALE)',
      "      .setFlipX(sideKey != null && facing === 'left');",
      '  }',
    ].join('\n'),
    replace: [
      '    const image = this.add.image(0, DOOR_SPRITE_FEET_Y, key)',
      '      .setOrigin(0.5, 1)',
      "      .setFlipX(sideKey != null && facing === 'left');",
      '    return this.atWorldScale(image);',
      '  }',
      '',
      '  /** A escala 1; un PNG viejo en la caché del navegador (otro tamaño que la tabla) se fuerza al de la tabla. */',
      '  private atWorldScale<T extends Phaser.GameObjects.Image>(image: T): T {',
      '    const spec = worldSpriteForTexture(image.texture.key);',
      '    const stale = spec ? staleSpriteSize(spec, image.width, image.height) : null;',
      '    if (stale) image.setDisplaySize(stale.width, stale.height);',
      '    return image;',
      '  }',
    ].join('\n'),
  },
  {
    file: FILE,
    find: [
      '    let personVisual: CharacterVisual | null = null;',
      '',
      '    if (this.assetsLoaded) {',
      '      const doorSprite = isExit ? this.buildDoorSprite(object) : null;',
    ].join('\n'),
    replace: [
      '    let personVisual: CharacterVisual | null = null;',
      '    let doorSprite: Phaser.GameObjects.Image | null = null;',
      '',
      '    if (this.assetsLoaded) {',
      '      doorSprite = isExit ? this.buildDoorSprite(object) : null;',
    ].join('\n'),
  },
  {
    file: FILE,
    find: [
      '      // A -90 para librar la puerta a escala real (93 px de alto, base en y+16).',
      '      const hint = this.add.container(object.x, object.y - 90, [hintBg, hintTx]).setDepth(DEPTH.UI).setVisible(false);',
    ].join('\n'),
    replace: [
      '      // Sobre el borde alto de la puerta: su alto sale del arte, ya no hay una escala que adivinar.',
      '      const hintY = doorHintY(object.y, doorSprite?.displayHeight ?? DOOR_FALLBACK_HEIGHT);',
      '      const hint = this.add.container(object.x, hintY, [hintBg, hintTx]).setDepth(DEPTH.UI).setVisible(false);',
    ].join('\n'),
  },
];
```

```bash
W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
node $W/tools/edits.cjs $W/edits/t5-doors.cjs
```

Expected: `editado src/app/features/simulator/game-world.component.ts` cinco veces.

- [ ] **Step 4: Córrelo y comprueba que pasa**

Run: `npm test -- --runInBand game-world`
Expected: PASS (9 suites: el contrato nuevo y los de la escena que ya existían).

- [ ] **Step 5: Cierre y commit**

Run: `npm test -- --runInBand` (todo verde) y `npm run build` (compila la escena: confirma los tipos de `atWorldScale` y de `doorSprite`).

```bash
git add src/app/features/simulator/game-world.component.ts src/app/features/simulator/game-world.world-scale.contract.spec.ts
git commit -m "feat(escala-mundo): las puertas del mundo a escala 1

buildDoorSprite deja de usar DOOR_SPRITE_SCALE: la puerta mide lo que dice
la tabla y se ancla por la base. atWorldScale fuerza el tamaño de la tabla
a una textura vieja en la caché. El aviso de la puerta flota sobre su borde
alto, sea cual sea su alto.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Herramientas, objetos y marcadores con sprite de pixel art: nada se escala

**Files:**
- Modify: `frontend/src/app/features/simulator/game-world.component.ts`
- Modify: `frontend/src/app/features/simulator/world-characters.util.ts`
- Modify: `frontend/src/app/features/simulator/world-characters.util.spec.ts`
- Modify: `frontend/src/app/features/simulator/game-world.kit.contract.spec.ts`
- Modify: `frontend/src/app/features/simulator/game-world.world-scale.contract.spec.ts` (tarea 5)

**Interfaces:**
- Consumes: `atWorldScale` (tarea 5) y `worldSpriteForTexture` (tarea 1).
- Produces:
  - `markerEmphasis(state: { selected: boolean; near: boolean; kitSprite: boolean; pixelSprite: boolean }): { scale: number; alpha: number }`: con `pixelSprite` el marcador se aclara pero su escala es siempre 1; con `kitSprite` (persona del kit) sigue siendo escala 1 y alfa 1;
  - en la escena: `bag['__pixelSprite']` (verdadero para la puerta con sprite propio, la puerta de Kenney, la herramienta, el objeto de escenario y el tile de respaldo por tipo), usado por `refreshMarkerStates` y por `focus()` (el pulso va al anillo `bag['__pulse']`);
  - sin `TOOL_SPRITE_SCALE`: la herramienta y el objeto de escenario se dibujan con `atWorldScale(this.add.image(0, -6, textura))`.

**Por qué.** Hoy un marcador que se acerca se dibuja a ×1,08 y uno enfocado a ×1,12; el pulso de `focus()` también escala. A ×1,08 los píxeles de un sprite salen desiguales, y con la cámara a ×2 se nota. El spec (§1.1.2) lo prohíbe para todo sprite de pixel art, no solo para las personas del kit, que ya estaban cubiertas desde el plan 2.

- [ ] **Step 1: Escribe las pruebas que fallan**

Las pruebas de `markerEmphasis` y del contrato del kit pasan a pedir `pixelSprite`, y el contrato de escala suma dos pruebas (herramientas y objetos sin escala; marcador con sprite de pixel art sin escalar). Crea los dos archivos de edición con la herramienta Write y aplícalos.

`<ledger>/edits/t6-specs.cjs` (los dos specs que ya existían):

```js
// Tarea 6: ajustes a los specs existentes (rutas relativas a frontend/).
const KIT_CONTRACT = 'src/app/features/simulator/game-world.kit.contract.spec.ts';
const CHARACTERS_SPEC = 'src/app/features/simulator/world-characters.util.spec.ts';

module.exports = [
  {
    file: KIT_CONTRACT,
    find: "    expect(refresh).toContain(\"markerEmphasis({ selected: sel, near, kitSprite: bag['__kitSprite'] === true })\");",
    replace: "    expect(refresh).toContain(\"markerEmphasis({ selected: sel, near, kitSprite: bag['__kitSprite'] === true, pixelSprite: bag['__pixelSprite'] === true })\");",
  },
  {
    file: KIT_CONTRACT,
    find: "    expect(focus).toContain(\"bag['__kitSprite'] === true ? bag['__pulse'] : m\");",
    replace: "    expect(focus).toContain(\"bag['__kitSprite'] === true || bag['__pixelSprite'] === true ? bag['__pulse'] : m\");",
  },
  {
    file: CHARACTERS_SPEC,
    start: "describe('world-characters.util — énfasis de los marcadores', () => {",
    end: '        expect(markerEmphasis({ selected, near, kitSprite: true })).toEqual({ scale: 1, alpha: 1 });\n      }\n    }\n  });\n});\n',
    replace: [
      "describe('world-characters.util — énfasis de los marcadores', () => {",
      '  const vector = { kitSprite: false, pixelSprite: false };',
      '',
      "  it('un marcador vectorial crece y se aclara al acercarse o seleccionarlo', () => {",
      '    expect(markerEmphasis({ selected: false, near: false, ...vector })).toEqual({ scale: 1, alpha: 0.88 });',
      '    expect(markerEmphasis({ selected: false, near: true, ...vector })).toEqual({ scale: 1.08, alpha: 1 });',
      '    expect(markerEmphasis({ selected: true, near: true, ...vector })).toEqual({ scale: 1.12, alpha: 1 });',
      '  });',
      '',
      "  it('un marcador con sprite de pixel art (puerta, herramienta, objeto) se aclara pero nunca se escala (spec §1.1.2)', () => {",
      '    const sprite = { kitSprite: false, pixelSprite: true };',
      '    expect(markerEmphasis({ selected: false, near: false, ...sprite })).toEqual({ scale: 1, alpha: 0.88 });',
      '    expect(markerEmphasis({ selected: false, near: true, ...sprite })).toEqual({ scale: 1, alpha: 1 });',
      '    expect(markerEmphasis({ selected: true, near: true, ...sprite })).toEqual({ scale: 1, alpha: 1 });',
      '  });',
      '',
      "  it('una persona del kit nunca se escala ni se atenúa (spec §8.2: sprites a escala 1, sin deformar)', () => {",
      '    for (const selected of [false, true]) {',
      '      for (const near of [false, true]) {',
      '        expect(markerEmphasis({ selected, near, kitSprite: true, pixelSprite: false })).toEqual({ scale: 1, alpha: 1 });',
      '      }',
      '    }',
      '  });',
      '});',
      '',
    ].join('\n'),
  },
];
```

`<ledger>/edits/t6-contract.cjs` (las dos pruebas nuevas del contrato de la tarea 5):

```js
// Tarea 6: dos pruebas más en el contrato de escala del mundo (rutas relativas a frontend/).
const FILE = 'src/app/features/simulator/game-world.world-scale.contract.spec.ts';

module.exports = [
  {
    file: FILE,
    find: "    expect(source).not.toContain('object.y - 90');\n  });\n",
    replace: [
      "    expect(source).not.toContain('object.y - 90');",
      '  });',
      '',
      "  it('las herramientas y los objetos de escenario no llevan escala', () => {",
      "    expect(source).not.toContain('TOOL_SPRITE_SCALE');",
      "    expect(source).toContain('main = this.atWorldScale(this.add.image(0, -6, toolTex));');",
      "    expect(source).toContain('main = this.atWorldScale(this.add.image(0, -6, resolveObjectTextureKey(object.shortCode)!));');",
      '  });',
      '',
      "  it('un marcador con sprite de pixel art no se escala al acercarse ni al enfocarlo: el pulso va a su anillo', () => {",
      '    expect(source).toContain("bag[\'__pixelSprite\'] = pixelSprite;");',
      '    expect(body(\'private refreshMarkerStates() {\')).toContain("pixelSprite: bag[\'__pixelSprite\'] === true");',
      '    expect(body(\'focus(key: string) {\')).toContain("bag[\'__kitSprite\'] === true || bag[\'__pixelSprite\'] === true ? bag[\'__pulse\'] : m");',
      '  });',
      '',
    ].join('\n'),
  },
];
```

```bash
W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
node $W/tools/edits.cjs $W/edits/t6-specs.cjs
node $W/tools/edits.cjs $W/edits/t6-contract.cjs
```

Expected: `editado` tres veces para `t6-specs.cjs` y una para `t6-contract.cjs`.

- [ ] **Step 2: Córrelas y comprueba que fallan**

Run: `npm test -- --runInBand world-characters game-world`
Expected: `Tests: 4 failed`. `markerEmphasis` ignora `pixelSprite` (escala 1,08 y 1,12 donde ahora se espera 1), el contrato del kit pide `pixelSprite` en `refreshMarkerStates` y `focus()`, y la escena todavía usa `TOOL_SPRITE_SCALE` y no escribe `__pixelSprite`.

- [ ] **Step 3: Cambia la utilidad y la escena**

Crea `<ledger>/edits/t6-pickups.cjs` (herramienta Write). Hace tres cosas: `markerEmphasis` con `pixelSprite`, la escena sin `TOOL_SPRITE_SCALE` y el bloque de creación del marcador con la bandera `pixelSprite`, que se guarda en `bag['__pixelSprite']`, se lee en `refreshMarkerStates` y manda el pulso de `focus()` al anillo.

```js
// Tarea 6 (objetos recogibles y marcadores con sprite): cambios en game-world.component.ts y
// world-characters.util.ts (rutas relativas a frontend/).
const GAME_WORLD = 'src/app/features/simulator/game-world.component.ts';
const CHARACTERS = 'src/app/features/simulator/world-characters.util.ts';

module.exports = [
  {
    file: CHARACTERS,
    find: [
      'export function markerEmphasis(state: { selected: boolean; near: boolean; kitSprite: boolean }): { scale: number; alpha: number } {',
      '  if (state.kitSprite) return { scale: 1, alpha: 1 };',
      '  return { scale: state.selected ? 1.12 : state.near ? 1.08 : 1, alpha: state.selected || state.near ? 1 : 0.88 };',
      '}',
    ].join('\n'),
    replace: [
      'export function markerEmphasis(',
      '  state: { selected: boolean; near: boolean; kitSprite: boolean; pixelSprite: boolean },',
      '): { scale: number; alpha: number } {',
      '  if (state.kitSprite) return { scale: 1, alpha: 1 };',
      '  // Un marcador con sprite de pixel art (puerta, herramienta, objeto) se aclara pero no se escala:',
      '  // a ×1,08 sus píxeles saldrían desiguales (spec §1.1.2).',
      '  const scale = state.pixelSprite ? 1 : state.selected ? 1.12 : state.near ? 1.08 : 1;',
      '  return { scale, alpha: state.selected || state.near ? 1 : 0.88 };',
      '}',
    ].join('\n'),
  },
  {
    file: CHARACTERS,
    find: [
      ' * Énfasis de un marcador según la cercanía y la selección. Una persona dibujada con el kit',
      ' * nunca se escala ni se atenúa (spec §8.2: sprites a escala 1, nada los deforma); su señal',
      ' * es el nombre y el anillo.',
    ].join('\n'),
    replace: [
      ' * Énfasis de un marcador según la cercanía y la selección. Una persona dibujada con el kit',
      ' * nunca se escala ni se atenúa (spec §8.2: sprites a escala 1, nada los deforma); su señal',
      ' * es el nombre y el anillo. Los marcadores con otro sprite de pixel art tampoco se escalan.',
    ].join('\n'),
  },
  {
    file: GAME_WORLD,
    find: '/** Escala de render de los sprites de herramienta (asset ~64px → ~40px en marcador). */\nconst TOOL_SPRITE_SCALE = 0.62;\n\n',
    replace: '',
  },
  {
    file: GAME_WORLD,
    start: '    if (this.assetsLoaded) {\n      doorSprite = isExit ? this.buildDoorSprite(object) : null;',
    end: '    } else {\n      main = this.buildGeomMarker(color);\n    }\n',
    replace: [
      '    // Un marcador con sprite de pixel art nunca se escala (markerEmphasis, focus): spec §1.1.2.',
      '    let pixelSprite = false;',
      '    if (this.assetsLoaded) {',
      '      doorSprite = isExit ? this.buildDoorSprite(object) : null;',
      '      if (doorSprite) {',
      '        // Puerta de arte propio: gana en ambos contextos (sala de autoría y salas',
      '        // Kenney), unificando el lenguaje visual. Al no ser un tile de Kenney, no',
      '        // rompe la regla de la sala premium. Si el asset falta, caen las ramas de abajo.',
      '        main = doorSprite;',
      '        pixelSprite = true;',
      '      } else if (isExit && this.authoredRoomActive) {',
      '        // Puerta dibujada (la sala premium no mezcla tiles Kenney): marco + hoja + pomo.',
      '        const doorFrame = this.add.rectangle(0, -10, 34, 46, 0x1a1530, 0.92).setStrokeStyle(2, 0xb69cff, 0.8);',
      '        const doorPanel = this.add.rectangle(0, -10, 24, 36, 0x2a2348, 1);',
      '        const doorKnob = this.add.circle(7, -8, 2.5, 0xb69cff, 1);',
      '        main = this.add.container(0, 0, [doorFrame, doorPanel, doorKnob]);',
      "      } else if (isExit && this.textures.exists('dungeon-tiles')) {",
      "        main = this.add.image(0, 0, 'dungeon-tiles', KenneyDungeonFrames.DOOR).setScale(2.5);",
      '        pixelSprite = true;',
      "      } else if (object.type === 'TOOL') {",
      '        const toolTex = resolveToolTextureKey(object.toolCode);',
      '        if (toolTex && this.textures.exists(toolTex)) {',
      '          main = this.atWorldScale(this.add.image(0, -6, toolTex));',
      '          pixelSprite = true;',
      '        } else {',
      '          main = this.buildToolMarker(color, object.shortCode || object.toolCode || object.label);',
      '        }',
      "      } else if (object.type === 'OBJECT' && this.loadedTexture(resolveObjectTextureKey(object.shortCode))) {",
      '        main = this.atWorldScale(this.add.image(0, -6, resolveObjectTextureKey(object.shortCode)!));',
      '        pixelSprite = true;',
      "      } else if (object.type === 'PERSON') {",
      '        personVisual = this.callbacks.kit ? this.actorVisual(personCharacterRef(this.callbacks.kit, object)) : null;',
      '        if (personVisual) {',
      '          // Pies del arte sobre la sombra del marcador (y = 16), de frente y respirando.',
      "          const personSprite = this.add.sprite(0, 16, kitSheetKey(personVisual, 'idle'), kitFrameIndex('idle', 'down'))",
      '            .setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y);',
      "          playKitPose(personSprite, personVisual, 'down', false, this.callbacks.reduceMotion);",
      '          main = personSprite;',
      '        } else {',
      '          main = this.buildGeomMarker(color);',
      '        }',
      "      } else if (this.textures.exists('dungeon-tiles')) {",
      "        main = this.add.image(0, 0, 'dungeon-tiles', this.frameForType(object.type)).setScale(2);",
      '        pixelSprite = true;',
      '      } else {',
      '        main = this.buildGeomMarker(color);',
      '      }',
      '    } else {',
      '      main = this.buildGeomMarker(color);',
      '    }',
      '',
    ].join('\n'),
  },
  {
    file: GAME_WORLD,
    find: "    bag['__kitSprite'] = personVisual !== null;\n",
    replace: "    bag['__kitSprite'] = personVisual !== null;\n    bag['__pixelSprite'] = pixelSprite;\n",
  },
  {
    file: GAME_WORLD,
    find: "      const emphasis = markerEmphasis({ selected: sel, near, kitSprite: bag['__kitSprite'] === true });",
    replace: "      const emphasis = markerEmphasis({ selected: sel, near, kitSprite: bag['__kitSprite'] === true, pixelSprite: bag['__pixelSprite'] === true });",
  },
  {
    file: GAME_WORLD,
    find: [
      '    // Una persona del kit no se escala: el pulso va a su anillo.',
      '    const bag = m as unknown as Record<string, unknown>;',
      "    const target = bag['__kitSprite'] === true ? bag['__pulse'] : m;",
    ].join('\n'),
    replace: [
      '    // Un marcador con sprite de pixel art (una persona del kit, una puerta, una herramienta) no se',
      '    // escala: el pulso va a su anillo.',
      '    const bag = m as unknown as Record<string, unknown>;',
      "    const target = bag['__kitSprite'] === true || bag['__pixelSprite'] === true ? bag['__pulse'] : m;",
    ].join('\n'),
  },
];
```

```bash
W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
node $W/tools/edits.cjs $W/edits/t6-pickups.cjs
```

Expected: `editado` siete veces (dos en `world-characters.util.ts`, cinco en `game-world.component.ts`).

- [ ] **Step 4: Córrelas y comprueba que pasan**

Run: `npm test -- --runInBand world-characters game-world`
Expected: PASS (10 suites).

- [ ] **Step 5: Cierre y commit**

Run: `npm test -- --runInBand` (todo verde) y `npm run build` (sin errores de tipos).

```bash
git add src/app/features/simulator/game-world.component.ts src/app/features/simulator/world-characters.util.ts src/app/features/simulator/world-characters.util.spec.ts src/app/features/simulator/game-world.kit.contract.spec.ts src/app/features/simulator/game-world.world-scale.contract.spec.ts
git commit -m "feat(escala-mundo): herramientas y objetos a escala 1; ningún sprite de marcador se escala

Las herramientas y los objetos de escenario miden lo que dice la tabla
(adiós TOOL_SPRITE_SCALE). markerEmphasis aclara pero no escala un marcador
con sprite de pixel art, y el pulso de focus() va a su anillo.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: El validador de escalas enteras y los respaldos de Kenney

**Files:**
- Create: `frontend/scripts/world-art/world-scale-code.test.mjs`
- Modify: `frontend/src/app/features/simulator/game-world.component.ts` (dos escalas de respaldo)

**Interfaces:**
- Consumes: nada de las tareas anteriores (lee el código de `src/app`).
- Produces: `SCALE_PATTERNS` y `scaleFindings(root?): string[]` en `world-scale-code.test.mjs`. Marca, en el código de la app que no es spec, (a) las constantes de la calibración anterior `FURNITURE_MAX_H`, `DOOR_SPRITE_SCALE` y `TOOL_SPRITE_SCALE` y (b) cualquier `.setScale(` con una escala decimal. Los specs quedan fuera: los contratos citan lo prohibido para negarlo.

**Para qué.** Que nadie vuelva a escalar un sprite del mundo a una fracción sin que CI lo note (spec §1.1.2: cada píxel mide un número entero de píxeles físicos). Las dos escalas decimales que quedan son respaldos de Kenney para cuando falta el arte propio: el escritorio de la sala premium (`2.2`) y la puerta (`2.5`); pasan a `2` y `3`.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `frontend/scripts/world-art/world-scale-code.test.mjs`:

```js
/**
 * Escalas enteras en el código del mundo (F8, spec §1.1.2): ningún sprite se dibuja con una escala
 * fraccionaria ni con las constantes de la calibración anterior (~46 px/m). Los specs quedan fuera:
 * los contratos citan lo prohibido para negarlo.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { FRONTEND_ROOT } from './build.mjs';

export const SCALE_PATTERNS = Object.freeze([
  [/\b(FURNITURE_MAX_H|DOOR_SPRITE_SCALE|TOOL_SPRITE_SCALE)\b/, 'constante de la calibración anterior (~46 px/m)'],
  [/\.setScale\(\s*\d+\.\d+/, 'escala fraccionaria en un sprite'],
]);

function appSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...appSources(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

export function scaleFindings(root = FRONTEND_ROOT) {
  const findings = [];
  const app = path.join(root, 'src', 'app');
  if (!existsSync(app)) return findings;
  for (const file of appSources(app)) {
    readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
      for (const [pattern, what] of SCALE_PATTERNS) {
        if (pattern.test(line)) findings.push(`${path.relative(root, file).replace(/\\/g, '/')}:${index + 1}: ${what}`);
      }
    });
  }
  return findings;
}

test('el código del mundo no escala sprites a fracciones ni usa la calibración anterior', () => {
  assert.deepEqual(scaleFindings(), []);
});

test('el detector ve una escala fraccionaria y una constante vieja, y no mira los specs', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'world-scale-code-'));
  try {
    const app = path.join(root, 'src', 'app');
    mkdirSync(app, { recursive: true });
    writeFileSync(path.join(app, 'x.ts'), 'const a = 1;\nsprite.setScale(2.5);\nconst k = DOOR_SPRITE_SCALE;\nimage.setScale(2);\n');
    writeFileSync(path.join(app, 'x.spec.ts'), "expect(source).not.toContain('.setScale(2.5)');\n");
    assert.deepEqual(scaleFindings(root), [
      'src/app/x.ts:2: escala fraccionaria en un sprite',
      'src/app/x.ts:3: constante de la calibración anterior (~46 px/m)',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Córrela y comprueba que falla**

Run: `npm run test:world-art`
Expected: FAIL solo en `el código del mundo no escala sprites a fracciones…`, con dos hallazgos de `game-world.component.ts` (`escala fraccionaria en un sprite`: el escritorio de Kenney a 2,2 y la puerta de Kenney a 2,5). La prueba del detector pasa.

- [ ] **Step 3: Pasa los respaldos de Kenney a escalas enteras**

Crea `<ledger>/edits/t7-kenney.cjs` (herramienta Write):

```js
// Tarea 7: los respaldos de Kenney a escala entera (rutas relativas a frontend/).
const WORLD = 'src/app/features/simulator/game-world.component.ts';

module.exports = [
  {
    file: WORLD,
    find: "      this.add.image(560, 160, 'dungeon-tiles', KenneyDungeonFrames.DESK).setScale(2.2).setDepth(7);",
    replace: "      this.add.image(560, 160, 'dungeon-tiles', KenneyDungeonFrames.DESK).setScale(2).setDepth(7);",
  },
  {
    file: WORLD,
    find: "        main = this.add.image(0, 0, 'dungeon-tiles', KenneyDungeonFrames.DOOR).setScale(2.5);",
    replace: "        main = this.add.image(0, 0, 'dungeon-tiles', KenneyDungeonFrames.DOOR).setScale(3);",
  },
];
```

```bash
W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
node $W/tools/edits.cjs $W/edits/t7-kenney.cjs
```

Expected: `editado src/app/features/simulator/game-world.component.ts` dos veces.

- [ ] **Step 4: Córrela y comprueba que pasa**

Run: `npm run test:world-art`
Expected: el resumen dice `tests 19` y `pass 19`.

- [ ] **Step 5: Cierre y commit**

Run: `npm test -- --runInBand` (todo verde), `npm run test:visual-assets` y `npm run build`.

```bash
git add scripts/world-art/world-scale-code.test.mjs src/app/features/simulator/game-world.component.ts
git commit -m "test(escala-mundo): ningún sprite del mundo se escala a una fracción

El validador marca en src/app las constantes de la calibración anterior y
cualquier setScale decimal. Los respaldos de Kenney (escritorio y puerta)
pasan a escalas enteras.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: La intro del caso con los tamaños de la tabla

**Files:**
- Modify: `frontend/src/app/features/simulator/case-intro-scene.component.ts`
- Create: `frontend/src/app/features/simulator/case-intro-scene.world-scale.spec.ts`

**Interfaces:**
- Consumes: `worldSprite` (tarea 1).
- Produces: nada que otras tareas usen. La escena de la intro (DOM/CSS a 384×216, escalada por enteros) declara en su HTML el tamaño de tres imágenes: la puerta de urgencias, la silla y la planta.

**Por qué.** La intro pinta esos PNG con `<img width height>` a su tamaño nativo. Con el arte nuevo, las medidas viejas (48×64, 27×46 y 49×64) los estirarían o los recortarían. Los tamaños nuevos son los de la tabla y las **bases quedan donde estaban** (y = 128 la puerta, 138 la silla, 140 la planta), así el personaje sigue pisando el mismo suelo.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `frontend/src/app/features/simulator/case-intro-scene.world-scale.spec.ts`. Ata los tres tamaños del HTML a la tabla y comprueba que las bases no se movieron:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

import { worldSprite } from './world-scale.util';

// Fin de línea normalizado: el checkout de Windows trae CRLF.
const source = readFileSync(join(__dirname, 'case-intro-scene.component.ts'), 'utf-8').replace(/\r\n/g, '\n');

/** Ancho y alto declarados en el HTML de la imagen del escenario que carga `src`. */
function declaredSize(src: string): [number, number] {
  const line = source.split('\n').find(candidate => candidate.includes(`src="${src}"`));
  if (!line) throw new Error(`la intro no usa ${src}`);
  const size = line.match(/width="(\d+)" height="(\d+)"/);
  if (!size) throw new Error(`${src} no declara su tamaño`);
  return [Number(size[1]), Number(size[2])];
}

/** `top` del CSS de una pieza del escenario (`.intro-stage__door { left: …px; top: …px; }`). */
function declaredTop(piece: string): number {
  const rule = source.match(new RegExp(`\\.intro-stage__${piece} \\{ left: \\d+px; top: (\\d+)px; \\}`));
  if (!rule) throw new Error(`no encuentro la regla de .intro-stage__${piece}`);
  return Number(rule[1]);
}

describe('intro del caso: las piezas del escenario miden lo que dice la tabla del mundo (spec §13.1)', () => {
  it.each([
    ['/assets/game/doors/door_urgencias.png', 'doors', 'door_urgencias'],
    ['/assets/game/furniture/chair.png', 'furniture', 'chair'],
    ['/assets/game/furniture/plant.png', 'furniture', 'plant'],
  ] as const)('%s se declara con el tamaño de su PNG', (src, group, name) => {
    const spec = worldSprite(group, name);
    expect(declaredSize(src)).toEqual([spec.width, spec.height]);
  });

  it('las bases de la puerta, la silla y la planta quedan donde estaban (y = 128, 138 y 140 del escenario de 384×216)', () => {
    expect(declaredTop('door') + worldSprite('doors', 'door_urgencias').height).toBe(128);
    expect(declaredTop('chair') + worldSprite('furniture', 'chair').height).toBe(138);
    expect(declaredTop('plant') + worldSprite('furniture', 'plant').height).toBe(140);
  });
});
```

- [ ] **Step 2: Córrela y comprueba que falla**

Run: `npm test -- --runInBand case-intro-scene.world-scale`
Expected: FAIL en las cuatro pruebas: la puerta se declara 48×64 (la tabla dice 54×59), la silla 27×46 (22×34) y la planta 49×64 (36×47), y la base de la puerta suma 123 en vez de 128.

- [ ] **Step 3: Cambia la intro**

Crea `<ledger>/edits/t8-intro.cjs` (herramienta Write):

```js
// Tarea 8: la intro con los sprites nuevos, a su tamaño exacto y con la base donde estaba (rutas relativas a frontend/).
const INTRO = 'src/app/features/simulator/case-intro-scene.component.ts';

module.exports = [
  {
    file: INTRO,
    find: '<img class="intro-stage__door" src="/assets/game/doors/door_urgencias.png" alt="" width="48" height="64">',
    replace: '<img class="intro-stage__door" src="/assets/game/doors/door_urgencias.png" alt="" width="54" height="59">',
  },
  {
    file: INTRO,
    find: '<img class="intro-stage__chair" src="/assets/game/furniture/chair.png" alt="" width="27" height="46">',
    replace: '<img class="intro-stage__chair" src="/assets/game/furniture/chair.png" alt="" width="22" height="34">',
  },
  {
    file: INTRO,
    find: '<img class="intro-stage__plant" src="/assets/game/furniture/plant.png" alt="" width="49" height="64">',
    replace: '<img class="intro-stage__plant" src="/assets/game/furniture/plant.png" alt="" width="36" height="47">',
  },
  { file: INTRO, find: '    .intro-stage__door { left: 300px; top: 64px; }', replace: '    .intro-stage__door { left: 297px; top: 69px; }' },
  { file: INTRO, find: '    .intro-stage__chair { left: 104px; top: 96px; }', replace: '    .intro-stage__chair { left: 106px; top: 104px; }' },
  { file: INTRO, find: '    .intro-stage__plant { left: 250px; top: 76px; }', replace: '    .intro-stage__plant { left: 257px; top: 93px; }' },
];
```

```bash
W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
node $W/tools/edits.cjs $W/edits/t8-intro.cjs
```

Expected: `editado src/app/features/simulator/case-intro-scene.component.ts` seis veces.

- [ ] **Step 4: Córrela y comprueba que pasa**

Run: `npm test -- --runInBand case-intro-scene`
Expected: PASS (2 suites: la prueba nueva y la de la intro que ya existía).

- [ ] **Step 5: Cierre y commit**

Run: `npm test -- --runInBand` (todo verde) y `npm run build`.

```bash
git add src/app/features/simulator/case-intro-scene.component.ts src/app/features/simulator/case-intro-scene.world-scale.spec.ts
git commit -m "feat(escala-mundo): la intro del caso con los tamaños de la tabla

La puerta, la silla y la planta del escenario de la intro se declaran con el
tamaño de su PNG nuevo y conservan sus bases (128, 138 y 140). Una prueba ata
esos tamaños a WORLD_SPRITES.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Las puertas del lobby a la altura de los personajes

**Files:**
- Create: `frontend/src/app/features/simulator/lobby-door-layout.util.ts`
- Create: `frontend/src/app/features/simulator/lobby-door-layout.util.spec.ts`
- Create: `frontend/src/app/features/simulator/game-menu.world-scale.contract.spec.ts`
- Modify: `frontend/src/app/features/simulator/game-menu.component.ts`

**Interfaces:**
- Consumes: `PX_PER_M` (tarea 1).
- Produces (de `lobby-door-layout.util.ts`, geometría pura sin Phaser):
  - constantes `LOBBY_DOOR_HEIGHT_M = 2.15`, `LOBBY_BADGE_HEIGHT = 14` y `LOBBY_DOOR_Y = 320`;
  - `lobbyDoorLayout(): LobbyDoorLayout` con `frame { width: 48, height: 84 }`, `leaf { width, height, bottomInset }`, `handle { dx, dy, width, height }`, `lockDy`, `badgeDy` y `titleDy`. Todas las medidas salen de la base de la puerta `(x, doorY)`: `dx` crece a la derecha y `dy` hacia abajo, así que lo que queda sobre la base es negativo.

**Qué cambia.** Las puertas del lobby («CLÍNICA · SIEP») eran portales de 108×152 px (≈ 3,9 m a 39 px/m) junto a un avatar de 64 px. Una puerta de 2,15 m mide 84 px. Es una **decisión de diseño que el usuario puede vetar** en la PARADA C: no sale del spec, sale de la regla «a la altura de los personajes». El lobby no usa los PNG de puertas: las dibuja con rectángulos.

**Ruling (se registra en el ledger):** puerta del lobby de 2,15 m (84 px) y 48 px de ancho; la hoja de 38×76, la manija de 4×8 y el candado a 14 px.
- Costo si está mal: cambiar `LOBBY_DOOR_HEIGHT_M` o las anchuras de `lobbyDoorLayout()`.

- [ ] **Step 1: Escribe la prueba de la geometría, que falla**

Crea `frontend/src/app/features/simulator/lobby-door-layout.util.spec.ts`. Cubre el marco (84 px, 16 px más alto que el personaje), que la hoja, la manija y el candado caigan dentro, que la insignia quede sobre el marco, el título sobre la insignia y **que un título de hasta 6 líneas crezca hacia arriba sin salirse de la sala**:

```ts
import { LOBBY_BADGE_HEIGHT, LOBBY_DOOR_HEIGHT_M, LOBBY_DOOR_Y, lobbyDoorLayout } from './lobby-door-layout.util';
import { CHARACTER_HEIGHT_PX, metersOf } from './world-scale.util';

/** Interlineado del título del caso: fuente de 15 px (game-menu.component.ts). */
const TITLE_LINE_HEIGHT = 18;

describe('lobby-door-layout — las puertas del lobby a la altura de los personajes (spec §13.1)', () => {
  const layout = lobbyDoorLayout();

  it('el marco es una puerta de 2,15 m a 39 px/m y supera al personaje en 16 px o más', () => {
    expect(layout.frame).toEqual({ width: 48, height: 84 });
    expect(metersOf(layout.frame.height)).toBeCloseTo(LOBBY_DOOR_HEIGHT_M, 1);
    expect(layout.frame.height - CHARACTER_HEIGHT_PX).toBeGreaterThanOrEqual(16);
  });

  it('la hoja, la manija y el candado caen dentro del marco', () => {
    expect(layout.leaf.width).toBeLessThan(layout.frame.width);
    expect(layout.leaf.height + layout.leaf.bottomInset).toBeLessThan(layout.frame.height);
    expect(layout.handle.dx + layout.handle.width / 2).toBeLessThan(layout.leaf.width / 2);
    expect(-layout.handle.dy).toBeGreaterThan(layout.leaf.bottomInset);
    expect(-layout.handle.dy + layout.handle.height / 2).toBeLessThan(layout.leaf.height);
    expect(-layout.lockDy).toBeGreaterThan(0);
    expect(-layout.lockDy).toBeLessThan(layout.frame.height);
  });

  it('la insignia queda sobre el marco y el título sobre la insignia, sin tocarse', () => {
    expect(layout.badgeDy).toBeLessThanOrEqual(-(layout.frame.height + 2));
    expect(layout.titleDy).toBeLessThanOrEqual(layout.badgeDy - LOBBY_BADGE_HEIGHT - 2);
  });

  it('un título largo (hasta 6 líneas) crece hacia arriba desde su base y no se sale de la sala', () => {
    const titleBase = LOBBY_DOOR_Y + layout.titleDy;
    expect(titleBase - 6 * TITLE_LINE_HEIGHT).toBeGreaterThanOrEqual(0);
  });
});
```

Run: `npm test -- --runInBand lobby-door-layout`
Expected: FAIL con `Cannot find module './lobby-door-layout.util'`.

- [ ] **Step 2: Implementa la geometría**

Crea `frontend/src/app/features/simulator/lobby-door-layout.util.ts`:

```ts
/**
 * Puertas del lobby «CLÍNICA · SIEP» a la altura de los personajes (spec §13.1, decisión 12): una
 * puerta de 2,15 m a 39 px/m mide 84 px. Antes eran portales de 152 px (≈ 3,9 m) junto a un avatar
 * de 64 px. Geometría pura, sin Phaser: todas las medidas salen de la base de la puerta (x, doorY);
 * `dx` crece hacia la derecha y `dy` hacia abajo, así que lo que queda sobre la base es negativo.
 */
import { PX_PER_M } from './world-scale.util';

export interface LobbyDoorLayout {
  readonly frame: { readonly width: number; readonly height: number };
  /** La hoja se apoya `bottomInset` px sobre la base del marco. */
  readonly leaf: { readonly width: number; readonly height: number; readonly bottomInset: number };
  readonly handle: { readonly dx: number; readonly dy: number; readonly width: number; readonly height: number };
  /** Centro del candado de las puertas bloqueadas. */
  readonly lockDy: number;
  /** Base (origen 0.5, 1) de la insignia de estado, justo sobre el marco. */
  readonly badgeDy: number;
  /** Base (origen 0.5, 1) del título del caso, sobre la insignia. */
  readonly titleDy: number;
}

/** Alto de la puerta del lobby en metros: una puerta, no un portal. */
export const LOBBY_DOOR_HEIGHT_M = 2.15;
/** Alto de la insignia de estado («▶ Disponible», monoespaciada de 12 px) con su interlineado. */
export const LOBBY_BADGE_HEIGHT = 14;
/** Y de la base de las puertas; el piso del pasillo (y = 380) queda 60 px más abajo. */
export const LOBBY_DOOR_Y = 320;

export function lobbyDoorLayout(): LobbyDoorLayout {
  const height = Math.round(LOBBY_DOOR_HEIGHT_M * PX_PER_M);
  const badgeDy = -(height + 4);
  return {
    frame: { width: 48, height },
    leaf: { width: 38, height: height - 8, bottomInset: 3 },
    handle: { dx: 11, dy: 2 - Math.round(height / 2), width: 4, height: 8 },
    lockDy: -Math.round(height / 2),
    badgeDy,
    titleDy: badgeDy - LOBBY_BADGE_HEIGHT - 4,
  };
}
```

Run: `npm test -- --runInBand lobby-door-layout`
Expected: PASS, 4 pruebas.

- [ ] **Step 3: Escribe el contrato del lobby, que falla**

Crea `frontend/src/app/features/simulator/game-menu.world-scale.contract.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

// Fin de línea normalizado: el checkout de Windows trae CRLF.
const source = readFileSync(join(__dirname, 'game-menu.component.ts'), 'utf-8').replace(/\r\n/g, '\n');

describe('game-menu: las puertas del lobby salen de lobbyDoorLayout (spec §13.1, decisión 12)', () => {
  it('el marco, la hoja, la manija, el candado, la insignia y el título usan la geometría pura', () => {
    expect(source).toContain('const door = lobbyDoorLayout();');
    expect(source).toContain('this.add.rectangle(x, this.doorY, door.frame.width, door.frame.height, 0x12202f)');
    expect(source).toContain('this.doorY - door.leaf.bottomInset, door.leaf.width, door.leaf.height, fill');
    expect(source).toContain('this.doorY + door.handle.dy, door.handle.width, door.handle.height');
    expect(source).toContain('this.doorY + door.lockDy');
    expect(source).toContain('this.doorY + door.titleDy');
    expect(source).toContain('this.doorY + door.badgeDy');
  });

  it('no quedan las medidas del portal de antes (108×152 y 88×134) ni sus posiciones', () => {
    expect(source).not.toContain('108, 152');
    expect(source).not.toContain('88, 134');
    expect(source).not.toContain('this.doorY - 176');
    expect(source).not.toContain('this.doorY - 150');
  });

  it('la base de las puertas es la constante que comparte la prueba de la geometría', () => {
    expect(source).toContain('private readonly doorY = LOBBY_DOOR_Y;');
  });
});
```

Run: `npm test -- --runInBand game-menu.world-scale`
Expected: FAIL: el lobby aún dibuja el marco de 108×152 con posiciones fijas.

- [ ] **Step 4: Cambia el lobby**

Crea `<ledger>/edits/t9-lobby.cjs` (herramienta Write):

```js
// Tarea 9 (lobby): cambios en game-menu.component.ts (rutas relativas a frontend/).
const FILE = 'src/app/features/simulator/game-menu.component.ts';

module.exports = [
  {
    file: FILE,
    find: "import { LOBBY_BLEED, LOBBY_DOOR_RANGE, LOBBY_ROOM, lobbyFacadeBand, lobbyPose, nearestLobbyDoor } from './lobby-avatar.util';",
    replace: [
      "import { LOBBY_BLEED, LOBBY_DOOR_RANGE, LOBBY_ROOM, lobbyFacadeBand, lobbyPose, nearestLobbyDoor } from './lobby-avatar.util';",
      "import { LOBBY_DOOR_Y, lobbyDoorLayout } from './lobby-door-layout.util';",
    ].join('\n'),
  },
  { file: FILE, find: '  private readonly doorY = 320;', replace: '  private readonly doorY = LOBBY_DOOR_Y;' },
  {
    file: FILE,
    find: '    this.doors = [];\n    this.items.forEach((item, i) => {',
    replace: '    this.doors = [];\n    const door = lobbyDoorLayout(); // las puertas a la altura de los personajes (spec §13.1)\n    this.items.forEach((item, i) => {',
  },
  {
    file: FILE,
    find: '      // Frame, leaf, and handle\n      this.add.rectangle(x, this.doorY, 108, 152, 0x12202f).setOrigin(0.5, 1)',
    replace: '      // Marco, hoja y manija\n      this.add.rectangle(x, this.doorY, door.frame.width, door.frame.height, 0x12202f).setOrigin(0.5, 1)',
  },
  {
    file: FILE,
    find: '      const leaf = this.add.rectangle(x, this.doorY - 6, 88, 134, fill).setOrigin(0.5, 1)',
    replace: '      const leaf = this.add.rectangle(x, this.doorY - door.leaf.bottomInset, door.leaf.width, door.leaf.height, fill).setOrigin(0.5, 1)',
  },
  {
    file: FILE,
    find: '      this.add.rectangle(x + 26, this.doorY - 74, 6, 12, 0xdfe8f2, open ? 0.9 : 0.4); // handle',
    replace: '      this.add.rectangle(x + door.handle.dx, this.doorY + door.handle.dy, door.handle.width, door.handle.height, 0xdfe8f2, open ? 0.9 : 0.4); // manija',
  },
  {
    file: FILE,
    find: "        this.add.text(x, this.doorY - 74, '🔒', { fontSize: '20px' }).setOrigin(0.5);",
    replace: "        this.add.text(x, this.doorY + door.lockDy, '🔒', { fontSize: '14px' }).setOrigin(0.5);",
  },
  {
    file: FILE,
    find: '      this.add.text(x, this.doorY - 176, item.title, {',
    replace: '      this.add.text(x, this.doorY + door.titleDy, item.title, {',
  },
  {
    file: FILE,
    find: '      this.add.text(x, this.doorY - 150, badge, {',
    replace: '      this.add.text(x, this.doorY + door.badgeDy, badge, {',
  },
];
```

```bash
W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
node $W/tools/edits.cjs $W/edits/t9-lobby.cjs
```

Expected: `editado src/app/features/simulator/game-menu.component.ts` nueve veces.

Run: `npm test -- --runInBand game-menu lobby`
Expected: PASS (5 suites: el contrato nuevo, la geometría y las pruebas del lobby que ya existían).

- [ ] **Step 5: Cierre y commit**

Run: `npm test -- --runInBand` (todo verde) y `npm run build`. Anota el `Ruling:` en el ledger.

```bash
git add src/app/features/simulator/lobby-door-layout.util.ts src/app/features/simulator/lobby-door-layout.util.spec.ts src/app/features/simulator/game-menu.world-scale.contract.spec.ts src/app/features/simulator/game-menu.component.ts
git commit -m "feat(escala-mundo): las puertas del lobby a la altura de los personajes

Eran portales de 108×152 px (≈ 3,9 m a 39 px/m) junto a un avatar de 64 px.
Ahora son puertas de 2,15 m (84 px) cuya geometría sale de lobbyDoorLayout();
la insignia y el título quedan sobre el marco y un título largo crece hacia
arriba sin salirse de la sala.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: El umbral del zoom entero, decidido con datos — PARADA B

**Files:**
- Modify: `frontend/src/app/features/simulator/pixel-scale.util.ts`
- Modify: `frontend/src/app/features/simulator/pixel-scale.util.spec.ts`
- Modify: `docs/superpowers/specs/2026-10-02-personajes-unificados-design.md` (§8.3)
- Create (excluidos de git): `frontend/.capturas-f4/capturas.config.ts`, `capturas.e2e.ts` y `zoom-tabla.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: `MIN_ROOM_FRACTION` con el valor que decida el usuario (la propuesta es `0.75`). `integerZoom`, `physicalSize` y `cameraBounds` no cambian de firma.

**De dónde viene la pregunta.** En la revisión final del plan 2 quedó una decisión sin cerrar (ledger del plan 2, «importante 5»): el zoom ×2 que el usuario aprobó en la PARADA F4 se capturó con un viewport de 1920×1080 sin barras. Con Chrome maximizado en una pantalla de 1080p, el viewport mide unos 945 px de alto y el lienzo del juego 819 px; `integerZoom` pide `819 / 2 ≥ 0,8 · 528`, o sea 845 px, y da **×1**: la sala sale pequeña entre márgenes, en una configuración muy corriente (un monitor o portátil de 1080p con el navegador maximizado). Con 0,75 pide 792 px y da ×2.

Es una decisión de producto del usuario, no mía: el spec (§8.3) dice 0,8. Este plan la prepara con datos y espera su respuesta (PARADA B).

- [ ] **Step 1: Comprueba que `.capturas-f4/` no se versiona**

Run (desde `frontend/`): `git check-ignore .capturas-f4/capturas.e2e.ts`
Expected: imprime `.capturas-f4/capturas.e2e.ts` (la carpeta está en `.git/info/exclude`). Si no imprime nada, añádela: `echo "frontend/.capturas-f4/" >> "$(git rev-parse --git-common-dir)/info/exclude"`.

- [ ] **Step 2: Crea el material de las capturas**

Los specs de Playwright de las capturas viven en `frontend/.capturas-f4/`, no en `frontend/e2e/` (spec §8.4). Se llaman `*.e2e.ts` para que jest no los recoja. El runner de `scripts/test-e2e.mjs` levanta el stack aislado (BD desechable, API 8093, web 4315) y ejecuta cualquier config que le pases.

`frontend/.capturas-f4/capturas.config.ts`:

```ts
import { join, resolve } from 'node:path';

import base from '../playwright.config';

/** Capturas del lobby, la intro y la primera sala (no se versiona: carpeta excluida en .git/info/exclude). */
export default {
  ...base,
  testDir: __dirname,
  testMatch: 'capturas.e2e.ts',
  outputDir: join(process.env['CAPTURAS_OUT'] ?? resolve(__dirname, 'salida'), 'playwright-capturas'),
};
```

`frontend/.capturas-f4/capturas.e2e.ts` (lobby, intro y primera sala en cuatro viewports; comprueba que el lienzo mide su tamaño CSS × `devicePixelRatio`):

```ts
import { resolve } from 'node:path';

import { Page, expect, test } from '@playwright/test';

import {
  acceptContentWarning,
  enterCaseAtContentWarning,
  finishCaseIntroduction,
  loginStudent,
  waitForWorldReady,
} from '../e2e/support/siep-flow';

const OUT = process.env['CAPTURAS_OUT'] ?? resolve(__dirname, 'salida');

/** Lienzo en píxeles físicos: su tamaño interno = su tamaño CSS × dpr (±1 px de redondeo). */
async function canvasCheck(page: Page, selector: string) {
  return page.locator(selector).evaluate((canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    return {
      width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height, dpr,
      physical: Math.abs(canvas.width - Math.round(rect.width * dpr)) <= 1 && Math.abs(canvas.height - Math.round(rect.height * dpr)) <= 1,
    };
  });
}

for (const vp of [{ w: 1366, h: 768, dpr: 1 }, { w: 1920, h: 1080, dpr: 1 }, { w: 1536, h: 864, dpr: 1.25 }, { w: 1920, h: 945, dpr: 1 }]) {
  test.describe(`${vp.w}x${vp.h}@${vp.dpr}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr });

    test('lobby, intro y sala del caso', async ({ page }) => {
      test.setTimeout(240_000);
      const tag = `${vp.w}x${vp.h}@${vp.dpr}`;
      await loginStudent(page);
      await page.goto('/portal/jugar');
      await expect(page.locator('app-game-menu canvas')).toBeVisible();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/lobby-${tag}.png` });
      const lobby = await canvasCheck(page, 'app-game-menu canvas');

      const consent = await enterCaseAtContentWarning(page);
      const introVideo = await acceptContentWarning(page, consent);
      // La escena de la intro: el personaje entra caminando y reposa de frente.
      await page.waitForTimeout(4500);
      await page.screenshot({ path: `${OUT}/intro-${tag}.png` });
      const caseIntro = await finishCaseIntroduction(page, introVideo);
      await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
      await waitForWorldReady(page);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/sala-${tag}.png` });
      const world = await canvasCheck(page, 'app-game-world canvas');
      console.log(JSON.stringify({ tag, lobby, world }));
      expect(lobby.physical).toBe(true);
      expect(world.physical).toBe(true);
    });
  });
}
```

`frontend/.capturas-f4/zoom-tabla.mjs` (la tabla de la decisión: usa la fórmula de `integerZoom` con la fracción como parámetro):

```js
#!/usr/bin/env node
/**
 * Tabla de la decisión del umbral del zoom entero (spec §8.3): para cada pantalla, el zoom k y la
 * parte de la sala que se ve con 0,8 (hoy), 0,75 y 0,7.
 *
 * El contenedor del juego mide el viewport menos (26, 126) px CSS: los cuatro viewports que se
 * capturaron (1366×768, 1536×864@1,25, 1920×945 y 1920×1080) dieron exactamente ese margen.
 * La fórmula es la de `integerZoom` (pixel-scale.util.ts) con la fracción como parámetro.
 *
 *   node .capturas-f4/zoom-tabla.mjs
 */
const ROOM = { width: 960, height: 528 };
const FRACTIONS = [0.8, 0.75, 0.7];
const MARGIN = { width: 26, height: 126 };

const SCREENS = [
  ['1280×720', 1280, 720, 1],
  ['1366×768 (portátil)', 1366, 768, 1],
  ['1440×900', 1440, 900, 1],
  ['1536×864 a 125 %', 1536, 864, 1.25],
  ['1600×900 (viewport desktop-1600 de los e2e)', 1600, 900, 1],
  ['1920×945 (1080p con el navegador maximizado)', 1920, 945, 1],
  ['1920×1080 (pantalla completa)', 1920, 1080, 1],
  ['2560×1305 (1440p con el navegador maximizado)', 2560, 1305, 1],
];

const zoom = (width, height, fraction) =>
  Math.max(1, Math.min(Math.floor(width / (fraction * ROOM.width)), Math.floor(height / (fraction * ROOM.height))));
const percent = value => `${Math.round(Math.min(1, value) * 100)} %`;

process.stdout.write(`sala ${ROOM.width}×${ROOM.height}; contenedor = viewport − (${MARGIN.width}, ${MARGIN.height}) px CSS\n\n`);
process.stdout.write(['pantalla'.padEnd(48), 'contenedor físico'.padEnd(18), ...FRACTIONS.map(f => `con ${f}`.padEnd(22))].join('') + '\n');
for (const [name, viewportWidth, viewportHeight, dpr] of SCREENS) {
  const width = Math.round((viewportWidth - MARGIN.width) * dpr);
  const height = Math.round((viewportHeight - MARGIN.height) * dpr);
  const cells = FRACTIONS.map(fraction => {
    const k = zoom(width, height, fraction);
    return `×${k} (ve ${percent(width / k / ROOM.width)} × ${percent(height / k / ROOM.height)})`.padEnd(22);
  });
  process.stdout.write([name.padEnd(48), `${width}×${height}`.padEnd(18), ...cells].join('') + '\n');
}
```

- [ ] **Step 3: Mira los datos**

Run: `node .capturas-f4/zoom-tabla.mjs`
Expected:

```
sala 960×528; contenedor = viewport − (26, 126) px CSS

pantalla                                        contenedor físico con 0.8               con 0.75              con 0.7
1280×720                                        1254×594          ×1 (ve 100 % × 100 %) ×1 (ve 100 % × 100 %) ×1 (ve 100 % × 100 %)
1366×768 (portátil)                             1340×642          ×1 (ve 100 % × 100 %) ×1 (ve 100 % × 100 %) ×1 (ve 100 % × 100 %)
1440×900                                        1414×774          ×1 (ve 100 % × 100 %) ×1 (ve 100 % × 100 %) ×2 (ve 74 % × 73 %)
1536×864 a 125 %                                1888×923          ×2 (ve 98 % × 87 %)   ×2 (ve 98 % × 87 %)   ×2 (ve 98 % × 87 %)
1600×900 (viewport desktop-1600 de los e2e)     1574×774          ×1 (ve 100 % × 100 %) ×1 (ve 100 % × 100 %) ×2 (ve 82 % × 73 %)
1920×945 (1080p con el navegador maximizado)    1894×819          ×1 (ve 100 % × 100 %) ×2 (ve 99 % × 78 %)   ×2 (ve 99 % × 78 %)
1920×1080 (pantalla completa)                   1894×954          ×2 (ve 99 % × 90 %)   ×2 (ve 99 % × 90 %)   ×2 (ve 99 % × 90 %)
2560×1305 (1440p con el navegador maximizado)   2534×1179         ×2 (ve 100 % × 100 %) ×2 (ve 100 % × 100 %) ×3 (ve 88 % × 74 %)
```

Con 0,75 cambia **una sola** fila de las comunes: Chrome maximizado en 1080p pasa de ×1 a ×2 y ve el 99 % del ancho y el 78 % del alto de la sala. Con 0,7 también pasan a ×2 el 1440×900 y el viewport `desktop-1600` de los e2e, pero ven solo el 73 % del alto: demasiado recortado. Con 0,75 los viewports de los e2e no cambian (1366×768 y 1600×900 siguen en ×1; los móviles, también).

- [ ] **Step 4: Captura el «antes» (umbral 0,8) a 1920×945**

Docker Desktop debe estar encendido. Desde PowerShell, en `frontend/`, con la carpeta de salida en tu scratchpad (`<capturas>`):

```powershell
$env:CAPTURAS_OUT = '<capturas>/antes'
node ../scripts/test-e2e.mjs --config=.capturas-f4/capturas.config.ts --grep "1920x945"
```

Expected: 1 prueba verde y una línea JSON con `"world":{"width":1894,"height":819,…,"physical":true}`. En `<capturas>/antes/` quedan `lobby-1920x945@1.png`, `intro-1920x945@1.png` y `sala-1920x945@1.png`; en la sala, Valentina mide 64 px (×1) y la sala flota pequeña entre márgenes.

- [ ] **Step 5: Escribe las pruebas con el umbral nuevo, que fallan**

Crea `<ledger>/edits/t10-zoom-spec.cjs` (herramienta Write). Añade los casos medidos (1894×954, 1894×819, 1340×642, 1414×774 y 1536×864 a 125 %) y una prueba que fija el umbral:

```js
// Tarea 10, paso RED: el spec del zoom con el umbral nuevo (rutas relativas a frontend/).
const SPEC = 'src/app/features/simulator/pixel-scale.util.spec.ts';

module.exports = [
  {
    file: SPEC,
    find: "import { cameraBounds, integerZoom, physicalSize } from './pixel-scale.util';",
    replace: "import { MIN_ROOM_FRACTION, cameraBounds, integerZoom, physicalSize } from './pixel-scale.util';",
  },
  {
    file: SPEC,
    find: "    ['móvil en vertical', 390, 700, 3, 1],\n",
    replace: [
      "    ['móvil en vertical', 390, 700, 3, 1],",
      "    ['1920×1080 en pantalla completa (contenedor 1894×954)', 1894, 954, 1, 2],",
      "    ['1920×1080 con el navegador maximizado (contenedor 1894×819)', 1894, 819, 1, 2],",
      "    ['1366×768 (contenedor 1340×642)', 1340, 642, 1, 1],",
      "    ['1440×900 (contenedor 1414×774): aún ×1', 1414, 774, 1, 1],",
      "    ['1536×864 a 125 % (contenedor 1510×738 CSS)', 1510.390625, 737.59375, 1.25, 2],",
      '',
    ].join('\n'),
  },
  {
    file: SPEC,
    start: "  it('el zoom deja ver al menos el 80 % de la sala en los dos ejes', () => {",
    end: '        expect(h / k).toBeGreaterThanOrEqual(0.8 * ROOM.h);\n      }\n    }\n  });\n',
    replace: [
      "  it('el umbral es el 75 % de la sala (decisión del usuario, plan 3 tarea 10)', () => {",
      '    expect(MIN_ROOM_FRACTION).toBe(0.75);',
      '  });',
      '',
      "  it('el zoom deja ver al menos el 75 % de la sala en los dos ejes', () => {",
      '    for (const [w, h] of [[1700, 950], [3392, 1908], [2560, 1300], [800, 2000], [1894, 819]]) {',
      '      const k = integerZoom(w, h, ROOM.w, ROOM.h);',
      '      expect(Number.isInteger(k)).toBe(true);',
      '      if (k > 1) {',
      '        expect(w / k).toBeGreaterThanOrEqual(MIN_ROOM_FRACTION * ROOM.w);',
      '        expect(h / k).toBeGreaterThanOrEqual(MIN_ROOM_FRACTION * ROOM.h);',
      '      }',
      '    }',
      '  });',
      '',
    ].join('\n'),
  },
];
```

```bash
W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
node $W/tools/edits.cjs $W/edits/t10-zoom-spec.cjs
npm test -- --runInBand pixel-scale
```

Expected: `editado` tres veces y FAIL en dos pruebas: `1920×1080 con el navegador maximizado (contenedor 1894×819)` da 1 en vez de 2, y `el umbral es el 75 %` recibe 0,8.

- [ ] **Step 6: Cambia el umbral**

Crea `<ledger>/edits/t10-zoom-util.cjs` (herramienta Write). Cambia `MIN_ROOM_FRACTION` y su comentario, y enmienda el spec §8.3 con la fórmula nueva y el ejemplo del navegador maximizado:

```js
// Tarea 10, paso GREEN: el umbral del zoom entero y su doc en el spec §8.3 (rutas relativas a frontend/).
const UTIL = 'src/app/features/simulator/pixel-scale.util.ts';
const DESIGN = '../docs/superpowers/specs/2026-10-02-personajes-unificados-design.md';

module.exports = [
  { file: UTIL, find: 'export const MIN_ROOM_FRACTION = 0.8;', replace: 'export const MIN_ROOM_FRACTION = 0.75;' },
  {
    file: UTIL,
    find: '/** k = mayor entero ≥ 1 con anchoFísico/k ≥ 0,8·anchoSala y altoFísico/k ≥ 0,8·altoSala. */',
    replace: '/** k = mayor entero ≥ 1 con anchoFísico/k ≥ 0,75·anchoSala y altoFísico/k ≥ 0,75·altoSala. */',
  },
  {
    file: DESIGN,
    find: 'k = mayor entero ≥ 1 con (anchoFísico / k ≥ 0,8 · anchoSala) y (altoFísico / k ≥ 0,8 · altoSala)',
    replace: 'k = mayor entero ≥ 1 con (anchoFísico / k ≥ 0,75 · anchoSala) y (altoFísico / k ≥ 0,75 · altoSala)',
  },
  {
    file: DESIGN,
    find: '- A 1366×768 da ×1: la sala entra entera.\n',
    replace: [
      '- A 1920×1080 con el navegador maximizado (contenedor de unos 1894×819) da ×2: se ve el 99 % del ancho y el 78 % del alto de la sala. Con el umbral de 0,8 daba ×1 y la sala quedaba pequeña entre márgenes (enmienda del 2026-10-08, plan 3 tarea 10).',
      '- A 1366×768 da ×1: la sala entra entera.',
      '',
    ].join('\n'),
  },
];
```

```bash
W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
node $W/tools/edits.cjs $W/edits/t10-zoom-util.cjs
npm test -- --runInBand pixel-scale
```

Expected: `editado` cuatro veces y PASS.

- [ ] **Step 7: Captura el «después» (umbral 0,75)**

No edites `frontend/src` mientras corre.

```powershell
$env:CAPTURAS_OUT = '<capturas>/despues'
node ../scripts/test-e2e.mjs --config=.capturas-f4/capturas.config.ts --grep "1920x945"
```

Expected: 1 prueba verde; el mismo lienzo de 1894×819. En `<capturas>/despues/sala-1920x945@1.png` Valentina mide 128 px (×2) y la sala llena el lienzo. Revisa que la cámara siga a la jugadora y que no se vea el borde de la sala por los lados.

- [ ] **Step 8: PARADA B — la decisión del usuario**

Muestra con `SendUserFile` la sala «antes» y «después» a 1920×945 y pega la tabla del paso 3. Luego pregunta con `AskUserQuestion` (la primera opción, recomendada):
1. **0,75** — Chrome maximizado en 1080p pasa a ×2 (ve el 99 % del ancho y el 78 % del alto); el resto de pantallas comunes y los e2e no cambian.
2. **0,8 (como está)** — en ese caso queda ×1 y la sala pequeña entre márgenes.
3. **0,7** — ×2 también en 1440×900 y 1600×900, viendo solo el 73 % del alto de la sala.

Registra la respuesta en el ledger como `Ruling: umbral del zoom = <valor> (decisión del usuario, <fecha>)`.
- **0,75:** sigue al paso 9.
- **0,8:** descarta lo hecho: `git checkout -- src/app/features/simulator/pixel-scale.util.ts src/app/features/simulator/pixel-scale.util.spec.ts ../docs/superpowers/specs/2026-10-02-personajes-unificados-design.md`, salta el paso 9 (no hay commit) y sigue con la tarea 11.
- **0,7 u otro valor X:** sustituye el `0.75`, el `0,75` y el «75 %» por X en `t10-zoom-spec.cjs` y `t10-zoom-util.cjs` (y el 78 % del ejemplo del §8.3 por lo que diga la tabla), revierte los tres archivos como en la opción anterior y repite desde el paso 5.

- [ ] **Step 9: Cierre y commit (solo con 0,75 u otro valor aprobado)**

Run: `npm test -- --runInBand` (todo verde) y `npm run build`.

```bash
git add src/app/features/simulator/pixel-scale.util.ts src/app/features/simulator/pixel-scale.util.spec.ts ../docs/superpowers/specs/2026-10-02-personajes-unificados-design.md
git commit -m "feat(escala-mundo): el zoom entero llega a ×2 con el navegador maximizado a 1080p

El umbral de la sala visible baja de 0,8 a 0,75 por decisión del usuario:
con un lienzo de 1894×819 (Chrome maximizado en 1080p) daba ×1 y la sala
quedaba pequeña entre márgenes; ahora da ×2 y ve el 99 % del ancho y el 78 %
del alto. 1366×768 y los viewports de los e2e siguen en ×1. Spec §8.3
enmendado.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Las capturas dentro del juego — PARADA C

**Files:**
- Create (excluidos de git): `frontend/.capturas-f4/recorrido.config.ts` y `frontend/.capturas-f4/recorrido.e2e.ts`
- Reusa de la tarea 10: `capturas.config.ts` y `capturas.e2e.ts`

**Interfaces:**
- Consumes: todo lo anterior. No cambia código.
- Produces: las capturas que el usuario juzga y su aprobación del HEAD (spec §12: la F8 tiene «parada de aprobación: capturas dentro del juego»).

**Por qué dos corridas.** `capturas.e2e.ts` fotografía el lobby, la intro y la primera sala en cuatro viewports. Pero la F8 toca muebles, puertas y objetos de **cuatro mapas** (urgencias, sala de escucha, recepción de la comisaría y consultorio), y a las tres últimas solo se llega jugando. El recorrido (`recorrido.e2e.ts`) es una copia del e2e `@full-case` que fotografía cada mapa la primera vez que se pinta (`data-rendered-map-key`). **No edita `frontend/e2e/**`:** trabaja sobre la copia, que vive en la carpeta excluida.

- [ ] **Step 1: Prepara el recorrido**

`frontend/.capturas-f4/recorrido.config.ts`:

```ts
import { join, resolve } from 'node:path';

import base from '../playwright.config';

/** Recorrido del caso con una captura por sala (no se versiona: carpeta excluida en .git/info/exclude). */
export default {
  ...base,
  testDir: __dirname,
  testMatch: 'recorrido.e2e.ts',
  outputDir: join(process.env['CAPTURAS_OUT'] ?? resolve(__dirname, 'salida'), 'playwright-recorrido'),
};
```

Copia el e2e real y derívalo con una edición. Cambia los imports a `../e2e/support/…`, deja solo los dos escritorios con los que se juzga la F8 (1920×945, Chrome maximizado en 1080p, y 1366×768), añade el fotógrafo de salas y lo envuelve en la prueba. Crea `<ledger>/edits/t11-recorrido.cjs` (herramienta Write):

```js
// Deriva .capturas-f4/recorrido.e2e.ts de una copia de e2e/full-case.e2e.ts (rutas relativas a frontend/).
// Si el recorrido real cambió y algún `find` ya no existe, edits.cjs lo dice y se ajusta aquí.
const FILE = '.capturas-f4/recorrido.e2e.ts';

module.exports = [
  {
    file: FILE,
    find: "import { assertQualityState } from './support/quality-gates';\nimport { REQUIRED_VIEWPORTS } from './support/required-viewports';\n",
    replace: "import { resolve } from 'node:path';\n\nimport { assertQualityState } from '../e2e/support/quality-gates';\n",
  },
  {
    file: FILE,
    find: "} from './support/siep-flow';\nimport { scaled } from './support/time-scale';\n\ntype RequiredViewport = (typeof REQUIRED_VIEWPORTS)[number];\n",
    replace: [
      "} from '../e2e/support/siep-flow';",
      "import { scaled } from '../e2e/support/time-scale';",
      '',
      '/** Los dos escritorios con los que se juzga la F8: Chrome maximizado en 1080p y un portátil. */',
      'const REQUIRED_VIEWPORTS = [',
      "  { name: 'hd-1920x945', width: 1920, height: 945, inputMode: 'keyboard' },",
      "  { name: 'laptop-1366x768', width: 1366, height: 768, inputMode: 'keyboard' },",
      '] as const;',
      '',
      'type RequiredViewport = (typeof REQUIRED_VIEWPORTS)[number];',
      '',
      "const OUT = process.env['CAPTURAS_OUT'] ?? resolve(__dirname, 'salida');",
      '',
      '/** Foto de cada sala la primera vez que se pinta (data-rendered-map-key); corre en paralelo al recorrido. */',
      'function captureRooms(page: Page, tag: string): () => void {',
      '  let running = true;',
      '  const seen = new Set<string>();',
      '  void (async () => {',
      '    while (running) {',
      '      try {',
      "        const host = page.locator('app-game-world .phaser-host[data-world-ready=\"true\"]');",
      "        const key = await host.getAttribute('data-rendered-map-key', { timeout: 500 });",
      '        if (key && !seen.has(key)) {',
      '          seen.add(key);',
      '          await page.waitForTimeout(1200);',
      '          await page.screenshot({ path: `${OUT}/recorrido-${key}-${tag}.png` });',
      '          // La segunda foto, ya sin la transición de «quince días después» ni el diálogo de entrada.',
      '          await page.waitForTimeout(5000);',
      '          await page.screenshot({ path: `${OUT}/recorrido-${key}-${tag}-tarde.png` });',
      '        }',
      '        await page.waitForTimeout(400);',
      '      } catch { /* la página cambia de pantalla o ya se cerró: se reintenta o se termina */ }',
      '    }',
      '  })();',
      '  return () => { running = false; };',
      '}',
      '',
    ].join('\n'),
  },
  {
    file: FILE,
    find: [
      '    test(`@full-case completes all six recommended decisions (${viewport.name})`, async ({ page }, testInfo) =>',
      '      completeFullCase(page, testInfo, viewport));',
    ].join('\n'),
    replace: [
      '    test(`recorrido con capturas de cada sala (${viewport.name})`, async ({ page }, testInfo) => {',
      '      const stop = captureRooms(page, viewport.name);',
      '      try { await completeFullCase(page, testInfo, viewport); } finally { stop(); }',
      '    });',
    ].join('\n'),
  },
];
```

```bash
W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
cp e2e/full-case.e2e.ts .capturas-f4/recorrido.e2e.ts
node $W/tools/edits.cjs $W/edits/t11-recorrido.cjs
```

Expected: `editado .capturas-f4/recorrido.e2e.ts` tres veces. Si algún `find` ya no existe porque el e2e real cambió, ajusta la edición a lo que dice el archivo.

- [ ] **Step 2: Captura el lobby, la intro y la primera sala**

Con Docker Desktop encendido, desde PowerShell, en `frontend/`; la salida va a tu scratchpad (`<capturas>`). **No edites `frontend/src` mientras corre.**

```powershell
$env:CAPTURAS_OUT = '<capturas>/final'
node ../scripts/test-e2e.mjs --config=.capturas-f4/capturas.config.ts
```

Expected: 4 pruebas verdes (≈ 1 min) y cuatro líneas JSON (`1366x768@1`, `1920x1080@1`, `1536x864@1.25` y `1920x945@1`) con `"physical":true` en `lobby` y en `world`. En `<capturas>/final/`: `lobby-…png`, `intro-…png` y `sala-…png` por viewport.

- [ ] **Step 3: Captura el recorrido del caso**

```powershell
$env:CAPTURAS_OUT = '<capturas>/final'
node ../scripts/test-e2e.mjs --config=.capturas-f4/recorrido.config.ts
```

Expected: 2 pruebas verdes (≈ 2-3 min cada una en local). En `<capturas>/final/` queda una pareja `recorrido-<mapa>-<viewport>.png` y `recorrido-<mapa>-<viewport>-tarde.png` por cada mapa que se pinta: `hospital-urgencias`, `hospital-sala-escucha` (y sus variantes `-accion` y `-cierre`), `comisaria-recepcion` y `comisaria-consultorio` (y su variante `-marco`). La segunda foto sale 5 s después de la primera, ya sin la transición «quince días después» de la recepción: úsala si la primera sale oscura.

El recorrido puede fallar de forma intermitente en `pauseWithPendingPosition`: el e2e espera `['position', 'pause']` y recibe una posición de más, porque el debounce guardó antes del clic. Es una carrera de tiempos del e2e, sensible a la carga de la máquina. Al probar este plan falló una vez a 1920×945 y pasó en la corrida siguiente, igual que en la línea base. Si te pasa, repite con `--retries=2`; las fotos que ya salieron se conservan y las nuevas las reemplazan. Si falla dos veces seguidas en el mismo paso, no lo des por un flake: compáralo con la línea base (`git switch --detach 7e6e3c5` con el árbol limpio, como en la tarea 13) y regístralo como `Ruling:` con la salida del error.

- [ ] **Step 4: Revisa las capturas antes de mostrarlas**

Ábrelas con la herramienta Read y comprueba:
- **Muebles.** Sus píxeles son nítidos y miden lo mismo que los de Valentina (×1 o ×2: nada de píxeles de dos tamaños); asentados sobre su sombra; ninguno cortado por la sala; el jugador no queda tapado por uno que está delante.
- **Puertas.** Más altas que el personaje (salvo la doble puerta de urgencias), con la base sobre su sombra y sin recortes.
- **Objetos recogibles.** Legibles y a escala 1; ninguno se ve más grande que los muebles junto a los que está.
- **Lobby.** Puertas de 84 px (×k) con la insignia y el título encima, sin textos montados ni cortados por arriba.
- **Intro.** La puerta, la silla y la planta en su sitio; el personaje pisa el suelo; la planta no tapa la puerta.
- **Sala a ×2** (si se aprobó el 0,75): Valentina mide 128 px; la luz queda debajo de los actores; la cámara sigue a la jugadora y no deja ver el borde de la sala.
- **Lienzo.** Las cuatro líneas JSON del paso 2 dicen `"physical":true`.

Si algo falla, corrígelo con TDD (tarea afectada), vuelve a capturar y revisa de nuevo.

- [ ] **Step 5: PARADA C — aprobación de la F8**

Anota el HEAD (`git rev-parse --short HEAD`) y muestra con `SendUserFile` (`display: 'render'`), con un pie que diga qué mirar:
- `lobby`, `intro` y `sala` a 1920×945 y a 1366×768;
- una captura por mapa del recorrido: `recorrido-hospital-sala-escucha-hd-1920x945.png`, `recorrido-comisaria-recepcion-hd-1920x945-tarde.png` y `recorrido-comisaria-consultorio-hd-1920x945.png`.

Pregunta, citando el HEAD:

> «Estas capturas son el juego con la F8 aplicada: muebles, puertas y objetos a escala 1 y a 39 px/m, el lobby con puertas de 2,15 m y el zoom ×2 en Chrome maximizado a 1080p. ¿Apruebas la F8, o ajusto algo? Dos cosas son decisiones de diseño tuyas: las puertas del lobby (84 px de alto) y que las huellas de colisión no cambiaron (los muebles más chicos dejan un margen invisible a su alrededor).»

**No sigas hasta tener respuesta.** La aprobación vale para ese HEAD; si cambias algo después, vuelve a mostrar.

---

### Task 12: Documentación y CI

**Files:**
- Create: `frontend/world-art/README.md`
- Modify: `docs/visual/premium-visual-bible-v1.md` (§6)
- Modify: `docs/superpowers/specs/2026-10-02-personajes-unificados-design.md` (cabecera, §12 y §13.1)
- Modify: `tools/furniture-assets/README.md` y `tools/door-assets/README.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la documentación que explica el arte del mundo a quien llegue después, y la compuerta en CI: `npm run test:world-art` corre en el job de `frontend` junto a las del kit.

- [ ] **Step 1: El README del arte del mundo**

Crea `frontend/world-art/README.md`:

```markdown
# Arte del mundo a escala 1 (F8)

Los muebles, las puertas y los objetos recogibles del juego se dibujan a **escala 1**, con el
tamaño exacto de su PNG y a la misma densidad de píxel que los personajes del kit: el cuerpo de
64 px representa 1,65 m, así que el mundo va a **39 px/m** (decisión 12 del spec de personajes
unificados, §13.1).

| Qué | Dónde |
|---|---|
| Tabla de tamaños (fuente única) | `frontend/src/app/features/simulator/world-scale.util.ts` → `WORLD_SPRITES` |
| Originales archivados (el arte de antes de la F8) | `frontend/world-art/originals/{furniture,doors,objects}/` |
| PNG que carga el juego (generados) | `frontend/src/assets/game/{furniture,doors,objects}/` |
| Inventario del arte | `frontend/src/assets/visual/v1/inventory.v1.json` (el build sincroniza `expectedDimensions`) |
| Láminas de revisión | `docs/visual/world-art/` |

## Comandos (desde `frontend/`)

- `npm run world-art:build` — reescala cada original al tamaño de la tabla (recorta al cuerpo
  opaco, toma el color dominante por área, da ventaja al contorno oscuro y deja el alfa binario)
  y sincroniza el inventario. Lee solo los originales: repetirlo no acumula pérdida.
- `npm run world-art:laminas` — láminas de revisión: cada pieza a ×3 junto a Valentina, con el
  original al lado.
- `npm run test:world-art` — el contrato: tamaños, alfa binario, recorte, a lo sumo 40 colores,
  ningún PNG huérfano, inventario honesto y código sin escalas fraccionarias.

## Cambiar un tamaño

1. Edita la fila en `WORLD_SPRITES` y su caso en `world-scale.util.spec.ts`.
2. `npm run world-art:build` y `npm run world-art:laminas`; mira las láminas.
3. Si cambias el alto de una puerta, revisa dónde queda su aviso (`doorHintY`) y la intro del caso
   (`case-intro-scene.component.ts`, que fija el tamaño de sus imágenes en el HTML).

## Cambiar el arte

Los originales de muebles y puertas salen de los pipelines de `tools/furniture-assets/` y
`tools/door-assets/`; los iconos recogibles (herramientas y objetos de escenario) son PNG de
64×64 que ya estaban en el repo (commits `99ce3d0` y `f68d6db`) y no tienen pipeline propio. Un
original nuevo reemplaza al archivo de `world-art/originals/` y se corre el build. No se retoca a
mano la salida, porque el build la pisaría: si hace falta un retoque, se hace sobre el original.
```

- [ ] **Step 2: Las enmiendas a la biblia, al spec y a los READMEs de los pipelines**

Crea `<ledger>/edits/t12-docs.cjs` (herramienta Write). Añade a la biblia (§6) la regla del mundo a escala 1, actualiza la cabecera, el §13.1 y el §12 del spec, y avisa en los READMEs de `tools/` de que esos pipelines ahora producen los originales:

```js
// Tarea 12: documentación de la F8 (rutas relativas a frontend/).
const BIBLE = '../docs/visual/premium-visual-bible-v1.md';
const DESIGN = '../docs/superpowers/specs/2026-10-02-personajes-unificados-design.md';
const FURNITURE_README = '../tools/furniture-assets/README.md';
const DOOR_README = '../tools/door-assets/README.md';

module.exports = [
  {
    file: BIBLE,
    find: '- Los retratos del diálogo son de 32×32 y se muestran a ×3 o ×6 (decisión 15 del spec); el estado clínico de la paciente es un icono sobre su cabeza (decisión 13).\n',
    replace: [
      '- Los retratos del diálogo son de 32×32 y se muestran a ×3 o ×6 (decisión 15 del spec); el estado clínico de la paciente es un icono sobre su cabeza (decisión 13).',
      '- **Mundo (F8, decisión 12 del spec):** muebles, puertas y objetos recogibles se dibujan a escala 1 con el tamaño exacto de su PNG, a la densidad de los personajes: 39 px/m (el cuerpo de 64 px es 1,65 m). La tabla `WORLD_SPRITES` (`frontend/src/app/features/simulator/world-scale.util.ts`) es la fuente única de esos tamaños y `npm run test:world-art` la hace cumplir; el arte sale de `npm run world-art:build` a partir de `frontend/world-art/originals/`. Un marcador con sprite de pixel art (puerta, herramienta, objeto) no se escala al acercarse ni al enfocarlo.',
      '',
    ].join('\n'),
  },
  {
    file: DESIGN,
    find: 'plan 2 (F4-F7) ejecutado en `feat/personajes-unificados`',
    replace: 'plan 2 (F4-F7) y plan 3 (F8) ejecutados en `feat/personajes-unificados`',
  },
  {
    file: DESIGN,
    find: 'se dibuja a ×1 exacto en la F8, dentro de esta rama.',
    replace: 'se dibuja a ×1 exacto en la F8, dentro de esta rama. **Hecho (plan 3, 2026-10-08):** la tabla `WORLD_SPRITES` fija el tamaño de cada mueble, puerta y objeto recogible; el arte se reescala de los originales archivados en `frontend/world-art/originals/`; las puertas del lobby pasan a 2,15 m (84 px).',
  },
  {
    file: DESIGN,
    find: 'La rama no se integra en `master` hasta terminar la F8.',
    replace: 'La rama no se integra en `master` hasta terminar la F8. La F8 es el plan 3 (`docs/superpowers/plans/2026-10-08-personajes-unificados-3-escala-del-mundo.md`); integrar la rama con `master`, que siguió avanzando, es un plan aparte.',
  },
  {
    file: FURNITURE_README,
    find: 'Genera `frontend/src/assets/game/furniture/*.png` (RGBA, aspect natural, lado largo a footprint).\n',
    replace: [
      'Genera `frontend/src/assets/game/furniture/*.png` (RGBA, aspect natural, lado largo a footprint).',
      '',
      '> **Desde la F8 (2026-10) este pipeline produce los ORIGINALES**, que se archivan en',
      '> `frontend/world-art/originals/furniture/`. Los PNG que carga el juego salen de',
      '> `npm run world-art:build` (reescalado determinista al tamaño exacto de `WORLD_SPRITES`,',
      '> dibujados a escala 1). Ver `frontend/world-art/README.md`. `mock_rooms.py` replica el',
      '> `paintFurnitureSprite` de antes (escala por ancho) y ya no refleja el render.',
      '',
    ].join('\n'),
  },
  {
    file: DOOR_README,
    find: 'Genera `frontend/src/assets/game/doors/*.png` (48×64 RGBA).\n',
    replace: [
      'Genera `frontend/src/assets/game/doors/*.png` (48×64 RGBA).',
      '',
      '> **Desde la F8 (2026-10) este pipeline produce los ORIGINALES**, que se archivan en',
      '> `frontend/world-art/originals/doors/`. Los PNG que carga el juego salen de',
      '> `npm run world-art:build` (reescalado determinista al tamaño exacto de `WORLD_SPRITES`,',
      '> dibujados a escala 1, sin `DOOR_SPRITE_SCALE`). Ver `frontend/world-art/README.md`.',
      '',
    ].join('\n'),
  },
];
```

```bash
W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
node $W/tools/edits.cjs $W/edits/t12-docs.cjs
```

Expected: `editado` seis veces (una la biblia, tres el spec y una cada README de `tools/`).

- [ ] **Step 3: La compuerta en CI**

Crea `<ledger>/edits/t12-ci.cjs` (herramienta Write):

```js
// Tarea 12: el CI corre las pruebas del arte del mundo (rutas relativas a frontend/).
module.exports = [
  {
    file: '../.github/workflows/ci.yml',
    find: '      - run: npm run kit:check --prefix frontend\n',
    replace: '      - run: npm run kit:check --prefix frontend\n      - run: npm run test:world-art --prefix frontend\n',
  },
];
```

```bash
W=../.superpowers/sdd/2026-10-08-personajes-unificados-3-escala-del-mundo
node $W/tools/edits.cjs $W/edits/t12-ci.cjs
git diff --stat
```

Expected: `editado ../.github/workflows/ci.yml`; el `git diff --stat` lista solo la biblia, el spec, los dos READMEs de `tools/` y `ci.yml`.

- [ ] **Step 4: Cierre y commit**

Run: `npm test -- --runInBand` y `npm run test:world-art` (verdes).

```bash
git add world-art/README.md ../docs/visual/premium-visual-bible-v1.md ../docs/superpowers/specs/2026-10-02-personajes-unificados-design.md ../tools/furniture-assets/README.md ../tools/door-assets/README.md ../.github/workflows/ci.yml
git commit -m "docs(escala-mundo): README del arte del mundo, biblia y spec enmendados, test:world-art en CI

La biblia (§6) y el spec (§12 y §13.1) dicen que el mundo va a 39 px/m y a
escala 1. Los READMEs de tools/ avisan de que sus pipelines producen ahora
los originales de world-art/originals. El job de frontend corre
npm run test:world-art.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Verificación final y revisión de la rama completa

**Files:** ninguno (solo correcciones que salgan de la revisión).

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la rama lista para integrarse, con el informe «Rulings I made» y «Deferred minors».

- [ ] **Step 1: Verificación completa**

Desde `frontend/`:

```bash
npm test -- --runInBand
npm run test:kit
npm run kit:check
npm run test:visual-assets
npm run test:world-art
npm run build
```

Expected: todo verde.
- jest: sin pruebas rojas. Al llegar a esta tarea son 1005 pruebas en 126 suites (el plan 2 dejó 921 en 120); los arreglos de la revisión pueden sumar más.
- `test:world-art`: 19 pruebas.
- `kit:check`: 0 errores (y `tsc` con las reglas del kit revisa también `world-scale.util.ts`).
- `npm run build`: sin errores de tipos.

- [ ] **Step 2: Los e2e del CI**

La F8 cambia lo que se ve, no por dónde se camina (las huellas de colisión no cambiaron), pero toca la escena que los e2e recorren. Desde PowerShell, en `frontend/` y con Docker Desktop encendido:

```powershell
node ../scripts/test-e2e.mjs --grep-invert "@full-case"
```

Expected: 20 pruebas verdes en 6 archivos (las que corre el CI de los PR). El recorrido completo (`@full-case`, 4 pruebas) ya corrió, con capturas, en la tarea 11.

Al probar este plan, `vertical-quality › desktop-1600` falló una vez: Axe marcó el contraste de color del botón «Siguiente» del diálogo (midió un fondo `#f7f7f7` que no es el del diálogo, un instante transitorio) y pasó al repetirla con `--grep "Axe and geometry.*1600x900"`.

Si algo falla: repite solo esa prueba (`--grep "<nombre>"`) dos veces. Si sigue roja, compárala con la línea base en la misma sesión (en esta máquina hay pruebas `@orientation` que fallan por navegación lenta incluso sin cambios). Con el árbol limpio (todo commiteado), `git switch --detach 7e6e3c5`, corre la misma prueba y vuelve con `git switch feat/personajes-unificados`: así reusas `node_modules` y el entorno de Python, que un worktree nuevo no trae. Una prueba que también falla en la línea base no es de la F8: regístrala en el ledger como `Deferred minor:` con la salida. Una que solo falla aquí sí lo es: arréglala con TDD (**sin tocar `frontend/e2e/**` sin el visto bueno del usuario**; si el arreglo está en el e2e, pregunta antes).

- [ ] **Step 3: Revisión de la rama completa**

Sigue el procedimiento de superpowers:executing-plans (o el de subagent-driven-development, según cómo se ejecutó este plan):
- usa `review-package` sobre el rango `7e6e3c5..HEAD`;
- el revisor es de contexto limpio y usa el modelo más capaz;
- pásale este plan, el spec (decisión 12, §8.3 y §13.1), el Review Focus de arriba y las líneas `Ruling:` del ledger.

- [ ] **Step 4: Arregla los hallazgos**

Los críticos e importantes se arreglan en una sola pasada, cada uno con TDD (RED → GREEN) y la suite entera verde; cada arreglo, su commit `fix(escala-mundo): …`. Los menores van al ledger como `Deferred minor:`.

- [ ] **Step 5: Verificación final y cierre**

Repite el paso 1 (y el paso 2 si el arreglo tocó la escena). Después:
- **Sin push ni merge.** La rama sigue abierta.
- Informa al usuario con el resumen de lo hecho, los «Rulings I made» y los «Deferred minors», y dile qué quedó fuera (sección siguiente).
- Ofrece escribir el plan de integración con `master`.
- Pregunta si borra el workspace del plan 2 (`.superpowers/sdd/2026-10-03-personajes-unificados-2-integracion/`): ya no hace falta, porque este plan trae sus propias herramientas.

---

## Después de este plan

- **Integrar la rama con `master` (plan aparte, recomendado).** `master` siguió avanzando mientras esta rama se construía. Medido el 2026-10-08 (antes de este plan):
  - `master` (`f39ab96`) tiene 132 commits que la rama no tiene, y la rama tiene 45 que `master` no tiene (base común `51d1409`);
  - `master` usa Angular 22.2, TypeScript 6.0, Vitest 5 (en vez de Jest), Phaser 4.2, Playwright 1.63 y Django 6.1;
  - una fusión de prueba (`git merge-tree --write-tree --name-only HEAD master`) da conflictos en 11 archivos: `package.json`, `game-world.component.ts`, `game-menu.component.ts` y su spec, `dialogue-panel.component.ts` y su spec, `attempt-outcome.component.ts`, `character-editor.component.ts`, `portrait-resolver.util.ts` y su spec, y `avatar-figure.component.ts` (borrado aquí, modificado allá).
  - Hay que portar las pruebas de Jest a Vitest, adaptar el código de Phaser a la API de Phaser 4 y revisar las reglas de TypeScript 6: es trabajo con riesgo propio y conviene un plan con su propia revisión.
- **Pendientes que este plan deja anotados:**
  - Las huellas de colisión de los muebles no cambiaron: alrededor de cada sprite más chico queda un margen invisible. Ajustarlas cambiaría los caminos del jugador y de los e2e.
  - `tools/furniture-assets/mock_rooms.py` replica el `paintFurnitureSprite` de antes (escala por ancho) y ya no refleja el render.
  - La doble puerta de urgencias (`door_urgencias`, 59 px) mide menos que el personaje: es el arte original, no se rediseñó (spec §14).
  - Las salas de casos archivados dibujadas en vectores y las de autoría (Tiled) quedan fuera: solo se llevaron a escalas enteras sus respaldos de Kenney.
  - `ambient.cameraZoom` sigue en los datos de autoría (pendiente del plan 2): ya no controla el render.
