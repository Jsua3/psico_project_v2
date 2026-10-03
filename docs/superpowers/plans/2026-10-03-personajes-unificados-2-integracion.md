# Personajes unificados — Plan 2: integración (F4-F7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el juego entero dibuje a sus personajes con el kit:
- un solo punto de resolución;
- render a escala entera: zoom entero de cámara, píxeles físicos, luz debajo de los actores, sin deformaciones ni tintes;
- todas las pantallas migradas;
- el avatar guardado en formato 2;
- el legado borrado, con el validador «sin legado» en CI.

**Architecture:** El navegador carga `kit.json` una sola vez (`KitService`). `character-visual.resolver.ts` convierte cualquier referencia en un `CharacterVisual`:
- las referencias pueden ser el jugador, una receta o un NPC autorado;
- para las recetas, el `CharacterVisual` trae las URLs de los PNG publicados;
- para el avatar personalizado, trae las hojas compuestas en memoria por el mismo motor del build.

Phaser registra esas hojas con `kit-phaser.ts`, y las vistas CSS las pintan con `app-kit-figure`. Los lienzos de Phaser trabajan en píxeles físicos, y la cámara usa el zoom entero que calcula `pixel-scale.util.ts`.

**Tech Stack:** Angular 21 (signals, componentes standalone), Phaser 3.90, Jest 30 + jsdom (sin canvas), Node 24 (`node --test` para los scripts del kit), Playwright (solo para las capturas de la PARADA F4 y la tarea 16, con aviso).

**Spec:** `docs/superpowers/specs/2026-10-02-personajes-unificados-design.md` (aprobado el 2026-10-03; decisiones 1-19). Este plan implementa sus fases F4-F7. El plan 1 (`docs/superpowers/plans/2026-10-03-personajes-unificados-1-kit-y-arte.md`) dejó el kit, el arte y el catálogo; el plan 3 (F8, escala del mundo) se escribe al terminar este.

## Global Constraints

- **Rama y remoto.** Rama `feat/personajes-unificados`, worktree `.worktrees/personajes-unificados`. Nada de push, merge ni PR sin preguntar. La rama no va a `master` hasta terminar la F8 (plan 3).
- **`frontend/e2e/**`.** Solo se toca en la tarea 16 y después del visto bueno del usuario en el chat (spec §8.4).
- **Contrato de hoja.** Sale del motor y nunca se copia a mano: `FRAME` (48×72, pivote 24,68), `SHEETS` (`idle` 4 cuadros a 4 fps; `walk` 6 a 10 fps), `VIEW_ROWS` (`down`, `left`, `right`, `up`) y `PORTRAIT_FRAME` (32×32), todos de `kit-engine.ts`.
- **Escala.**
  - En el mundo y en el lobby, los sprites van siempre a escala 1; el zoom entero lo pone la cámara.
  - En CSS, los sprites van a ×1, ×2 o ×4 y los retratos a ×3 o ×6, con `image-rendering: pixelated` y una caja del tamaño exacto.
  - Nunca `object-fit` sobre un sprite ni un retrato.
- **Zoom entero.**
  - k = el mayor entero ≥ 1 con `anchoFísico / k ≥ 0,8 · anchoSala` y `altoFísico / k ≥ 0,8 · altoSala`.
  - El lienzo mide el tamaño CSS del contenedor × `devicePixelRatio`, con `scale.zoom = 1/dpr`.
  - La cámara sigue a la jugadora con `roundPixels`; si la vista es mayor que la sala, la centra.
  - `ambient.cameraZoom` deja de controlar el render.
- **Luz.**
  - Focos, viñetas de tono, motas y la capa Tiled `lighting` van a `DEPTH.LIGHTING_FLOOR` (= `DEPTH.ENVIRONMENT + 0.5`), debajo de los actores.
  - Única capa por encima: la viñeta de crisis (`DEPTH.LIGHTING + 1`), que es la excepción documentada.
- **Nada deforma ni tiñe a un personaje.**
  - Fuera `character-motion`, fuera `setTint` sobre actores, y ningún `setFlipX` en un personaje: las 4 filas son reales.
  - El estado clínico de la paciente se muestra con un icono de pixel art sobre la cabeza (decisión 13), en colores de `palette.v2.json` y a escala 1.
- **Avatar.**
  - Va en la clave `psychosim_avatar`, en formato 2.
  - Al migrar un v1, el texto original se copia a `psychosim_avatar_v1`.
  - Por defecto: `{ schemaVersion: 2, mode: 'elenco', recipeId: 'valentina', bata: false }`.
  - La bata es un único interruptor del jugador, en los dos modos (decisión 17).
- **Fuente única.** `catalog.json` es la única tabla de correspondencias. Las listas de `avatar-v2.ts` son un espejo de `catalog.editor` y `catalog.playables`; una prueba exige que coincidan.
- **Mensajes y commits.**
  - Textos de la interfaz en español.
  - Commits en español con el estilo `feat(personajes): …`, `test(personajes): …`, `fix(personajes): …` o `docs(personajes): …`, terminados con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Nunca `--no-verify`.
- **Comandos.**
  - Todos se ejecutan desde `frontend/` del worktree (Git Bash, barras normales); las rutas fuera de `frontend/` se escriben con `../`.
  - Jest: `npm test -- --runInBand <patrón>`.
  - Scripts del kit: `npm run test:kit`, `npm run kit:check`, `npm run kit:build`.
  - App: `npm run build`.
- **Tipos.** `jest.config.js` corre ts-jest con `diagnostics: false`, así que **jest no detecta errores de tipos**. Toda tarea que toque código de la app termina con `npm run build`, que sí los detecta.
- **Cierre de cada tarea.**
  - Siempre: jest completo (`npm test -- --runInBand`).
  - Si la tarea tocó el kit o `src/assets/characters/kit/`: además `npm run test:kit` y `npm run kit:check`.
  - Si la tarea tocó la app: además `npm run build`.
  - Todo verde antes del commit.
- **Paradas.** Las PARADAS esperan la respuesta del usuario en el chat. La aprobación vale para el HEAD que muestran las capturas.

## Review Focus

Estas son las entradas o condiciones que el spec implica y que más probablemente afecten a quien juega o enseña. Cada una tiene su prueba en la tarea dueña:

1. **Avatar guardado corrupto o de otra versión.**
   - Casos: JSON roto, `schemaVersion: 3`, campos con tipos raros, `recipeId` de un NPC.
   - Lo esperado: se carga el valor por defecto, o el valor por defecto de ese campo; nunca se rompe el lobby ni el mundo.
   - Prueba: tarea 1 (tabla de coerción) y tarea 13 (almacén).
2. **El contenedor del juego cambia de tamaño, o cambia el `devicePixelRatio`, con el mundo abierto.**
   - Casos: panel lateral, rotación, mover la ventana a otro monitor, zoom del navegador.
   - Lo esperado: el lienzo vuelve a píxeles físicos y el zoom se recalcula; nunca queda un zoom fraccionario.
   - Prueba: tarea 3 (dpr 1,25 y 1,5, contenedor de 0 px, `fitGameToHost`) y tarea 4 (contrato del oyente `resize`).
3. **Falla `kit.json` o una hoja del kit (404, red lenta).**
   - Lo esperado: el mundo y el lobby igual arrancan; el actor sin hoja cae al marcador geométrico, y `KitService` reintenta en el siguiente `load()`.
   - Prueba: tarea 2 (reintento) y tarea 5 (contrato: sin hoja, marcador geométrico; sin `kit.json`, el juego arranca con `kit: null`).
4. **Un NPC del escenario se llama igual que una voz sin cuerpo** («Supervisión clínica»).
   - Lo esperado: su diálogo muestra el retrato de su receta, y la voz de supervisión sigue sin retrato.
   - Prueba: tarea 11.
5. **NPC autorado por un docente con datos raros.**
   - Casos: `metadata.avatar` en v1, `metadata.npcTemplateId` de una plantilla vieja, o basura.
   - Lo esperado: resuelve a la receta de la plantilla, al avatar migrado o al figurante; nunca rompe la sala.
   - Prueba: tarea 7 (`personCharacterRef`) y tarea 12.

## Estructura de archivos

```
frontend/src/app/features/character/kit/
  kit-engine.ts                  (existe) motor; pierde Catalog.scenarioNpcs (tarea 6)
  avatar-v2.ts                   NUEVO  formato 2 del avatar, coerción y migración v1 (tarea 1)
  character-visual.resolver.ts   NUEVO  CharacterRef → CharacterVisual; resolveRecipeId (tarea 2)
  kit.service.ts                 NUEVO  carga única de kit.json (tarea 2)
  kit-raster.ts                  NUEVO  RgbaImage → lienzo / data URL (tarea 2)
  kit-phaser.ts                  NUEVO  hojas, animaciones y poses del kit en Phaser (tarea 5)
  kit-figure.component.ts        NUEVO  sprite o retrato del kit en CSS (tarea 8)
  kit-figure.util.ts             NUEVO  estilo de un cuadro (tarea 8)
  testing/kit-testing.ts         NUEVO  paquete real desde disco y KitService falso, solo para specs
frontend/src/app/features/simulator/
  pixel-scale.util.ts            NUEVO  tamaño físico, zoom entero y límites de cámara (tarea 3)
  pixel-canvas.ts                NUEVO  lienzo de Phaser en píxeles físicos (tarea 3)
  world-characters.util.ts       NUEVO  referencias del jugador, NPC, PERSON, guía y figurantes (tareas 5 y 7)
  patient-state-icon.util.ts     NUEVO  icono del estado clínico (tarea 7)
  game-world.component.ts        se migra (tareas 4, 5 y 7)
  game-menu.component.ts, lobby-avatar.util.ts            lobby (tarea 9)
  case-intro-scene.component.ts, intro-scene.util.ts      intro (tarea 10)
  dialogue-panel.component.ts, portrait-resolver.util.ts  diálogo (tarea 11)
  attempt-outcome.component.ts                            resultado (tarea 11)
  world-editor/world-editor.component.ts                  editor de mundo (tarea 12)
frontend/src/app/features/character/
  avatar.store.ts                se pasa a formato 2 (tarea 13)
  character-editor.component.ts  se reescribe (tarea 13)
frontend/src/assets/game/scenarios/*.json   NPC con recipeId (tarea 6)
frontend/scripts/character-kit/legacy.test.mjs   NUEVO  «sin legado» (tarea 14)
```

Se borran en la tarea 14 (spec §10):
- `assets/characters/{cast,modular,modular-legacy,portraits}` y `assets/characters/v1/`; `palette.v1.json` se mueve a `assets/visual/v1/`, porque la sigue usando el arte del mundo;
- `baked-cast.util`, `phaser-avatar-renderer`, `npc-avatar-presets`, `v1-avatar.util`, `character-motion.util`;
- `avatar-render-plan.*`, `actor-render-plan.*`, `character-manifest.model`, `clinical-emotion-portrait.util`;
- `avatar.model`, `avatar-config.util`, `avatar-figure.component`, `editor-preview.util`;
- los cuadros de personaje de `kenney-frames.constants` y las plantillas de NPC de `authoring-catalog.config`;
- `tools/cast-assets`, `tools/character-assets`, `scripts/character-manifest-lib*`, `validate-character-manifest.mjs` y `render-premium-contact-sheets.mjs`.

---

### Task 1: Avatar en formato 2 (`avatar-v2.ts`)

**Files:**
- Create: `frontend/src/app/features/character/kit/avatar-v2.ts`
- Test: `frontend/src/app/features/character/kit/avatar-v2.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - tipos `AvatarV2 = AvatarElenco | AvatarPersonalizado`, `PlayableId`, `Complexion`, `SkinId`, `HairId`, `HairColorId` y `AccessoryId`;
  - constantes `PLAYABLE_IDS`, `COMPLEXIONS`, `SKINS`, `HAIRS`, `HAIR_COLORS`, `ACCESSORIES`, `OUTFIT_IDS = { sinBata: 'uniforme', conBata: 'uniforme-bata' }` y `AVATAR_LABELS`;
  - funciones `defaultAvatarV2(): AvatarElenco`, `defaultPersonalizado(): AvatarPersonalizado`, `coerceAvatarV2(x: unknown): AvatarV2`, `migrateAvatarV1(x: unknown): AvatarV2`, `toAvatarV2(x: unknown): AvatarV2`, `parseStoredAvatar(raw: string | null): { avatar: AvatarV2; legacyRaw: string | null }`, `serializeAvatarV2(a: AvatarV2): string` y `avatarFingerprint(a: AvatarV2): string` (8 dígitos hex).

**Ruling (se registra en el ledger):** el §9.1 del spec guardaba `outfit` y `outfitColor`.
- Por qué cambia: con las decisiones 17-18 queda una sola elección binaria (uniforme o uniforme con bata, sin color).
- Qué se hace: el formato guarda `bata: boolean` en los dos modos; el modo elenco también lo lleva, porque el jugador elige la bata.
- Costo si está mal: añadir un campo y una regla de migración.

- [ ] **Step 1: Escribe la prueba que falla**

```ts
// frontend/src/app/features/character/kit/avatar-v2.spec.ts
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  ACCESSORIES,
  AvatarV2,
  COMPLEXIONS,
  HAIRS,
  HAIR_COLORS,
  OUTFIT_IDS,
  PLAYABLE_IDS,
  SKINS,
  avatarFingerprint,
  coerceAvatarV2,
  defaultAvatarV2,
  migrateAvatarV1,
  parseStoredAvatar,
  serializeAvatarV2,
  toAvatarV2,
} from './avatar-v2';

const kit = JSON.parse(readFileSync(join(__dirname, '../../../../assets/characters/kit/kit.json'), 'utf8'));
const P = { schemaVersion: 2, mode: 'personalizado' } as const;
const BASE = { ...P, complexion: 'a', skin: 'piel-2', hair: 'corto-liso', hairColor: 'negro', accessories: [], bata: false };

describe('avatar v2', () => {
  it('las listas del avatar son el espejo de catalog.editor y catalog.playables', () => {
    const ed = kit.catalog.editor;
    expect([...PLAYABLE_IDS]).toEqual(kit.catalog.playables);
    expect([...COMPLEXIONS]).toEqual(ed.complexions);
    expect([...SKINS]).toEqual(ed.skins);
    expect([...HAIRS]).toEqual(ed.hair);
    expect([...HAIR_COLORS]).toEqual(ed.hairColors);
    expect([...ACCESSORIES]).toEqual(ed.accessories);
    expect(Object.values(OUTFIT_IDS).sort()).toEqual(ed.outfits.map((o: { id: string }) => o.id).sort());
  });

  it('por defecto: Valentina sin bata', () => {
    expect(defaultAvatarV2()).toEqual({ schemaVersion: 2, mode: 'elenco', recipeId: 'valentina', bata: false });
  });

  it.each([
    ['castId del elenco', { castId: 'david' }, { schemaVersion: 2, mode: 'elenco', recipeId: 'david', bata: false }],
    ['castId del elenco con bata', { castId: 'paula', uniform: 'con-bata' }, { schemaVersion: 2, mode: 'elenco', recipeId: 'paula', bata: true }],
    ['sin castId: lo que v1 tenía por defecto', {}, BASE],
    ['castId inválido: personalizado con lo demás traducido',
      { castId: 'no-existe', gender: 'male', skinTone: 'morena', hairStyle: 'medio', fringe: true, hairColor: 'rojizo', accessory: 'pin', uniform: 'con-bata', clothingColor: 'green', mouth: 'happy' },
      { ...P, complexion: 'b', skin: 'piel-5', hair: 'bob-flequillo', hairColor: 'cobrizo', accessories: ['gafete'], bata: true }],
    ['medio sin flequillo es media melena; gris es canoso; oscura es piel-6',
      { hairStyle: 'medio', hairColor: 'gris', skinTone: 'oscura', accessory: 'gafas' },
      { ...BASE, skin: 'piel-6', hair: 'media-melena', hairColor: 'canoso', accessories: ['gafas'] }],
    ['porcelana, largo, rubio', { skinTone: 'porcelana', hairStyle: 'largo', hairColor: 'rubio' }, { ...BASE, skin: 'piel-1', hair: 'largo-suelto', hairColor: 'rubio' }],
    ['media, recogido, castaño', { skinTone: 'media', hairStyle: 'recogido', hairColor: 'castano' }, { ...BASE, skin: 'piel-3', hair: 'mono', hairColor: 'castano' }],
    ['sin cabello es rapado', { hairStyle: 'ninguno' }, { ...BASE, hair: 'rapado' }],
    ['tipos raros caen al valor por defecto', { gender: 7, skinTone: null, hairStyle: ['x'], accessory: {}, uniform: true }, BASE],
  ])('migrateAvatarV1: %s', (_name, v1, v2) => {
    expect(migrateAvatarV1(v1)).toEqual(v2);
  });

  it('coerceAvatarV2 valida campo por campo', () => {
    expect(coerceAvatarV2({ schemaVersion: 2, mode: 'elenco', recipeId: 'abuela-familia', bata: 'si' })).toEqual(defaultAvatarV2());
    expect(coerceAvatarV2({
      schemaVersion: 2, mode: 'personalizado', complexion: 'c', skin: 'piel-4', hair: 'afro', hairColor: 'verde',
      accessories: ['gafete', 'gafas', 'gafas', 'sombrero'], bata: true,
    })).toEqual({ ...P, complexion: 'a', skin: 'piel-4', hair: 'afro', hairColor: 'negro', accessories: ['gafas', 'gafete'], bata: true });
    expect(coerceAvatarV2({ schemaVersion: 2, mode: 'otro' })).toEqual(defaultAvatarV2());
    expect(coerceAvatarV2('texto')).toEqual(defaultAvatarV2());
  });

  it('toAvatarV2 acepta v1 o v2, descarta versiones desconocidas y es idempotente', () => {
    expect(toAvatarV2({ schemaVersion: 3, mode: 'elenco', recipeId: 'luisa' })).toEqual(defaultAvatarV2());
    const samples: unknown[] = [
      { castId: 'david', uniform: 'con-bata' }, { hairStyle: 'medio', fringe: true }, defaultAvatarV2(),
      { schemaVersion: 2, mode: 'personalizado', hair: 'trenza' }, null, 42, [],
    ];
    for (const sample of samples) {
      const once = toAvatarV2(sample);
      expect(toAvatarV2(once)).toEqual(once);
      expect(toAvatarV2(JSON.parse(serializeAvatarV2(once)))).toEqual(once);
    }
  });

  it('parseStoredAvatar: vacío, roto, v2, v1 (con el texto original para la copia) y versión futura', () => {
    expect(parseStoredAvatar(null)).toEqual({ avatar: defaultAvatarV2(), legacyRaw: null });
    expect(parseStoredAvatar('{no es json')).toEqual({ avatar: defaultAvatarV2(), legacyRaw: null });
    const v2 = serializeAvatarV2({ schemaVersion: 2, mode: 'elenco', recipeId: 'luisa', bata: true });
    expect(parseStoredAvatar(v2)).toEqual({ avatar: { schemaVersion: 2, mode: 'elenco', recipeId: 'luisa', bata: true }, legacyRaw: null });
    const v1 = JSON.stringify({ castId: 'mateo', uniform: 'sin-bata' });
    expect(parseStoredAvatar(v1)).toEqual({ avatar: { schemaVersion: 2, mode: 'elenco', recipeId: 'mateo', bata: false }, legacyRaw: v1 });
    expect(parseStoredAvatar('{"schemaVersion":3}')).toEqual({ avatar: defaultAvatarV2(), legacyRaw: null });
  });

  it('avatarFingerprint: igual para lo mismo, distinta si cambia algo que se ve', () => {
    const a: AvatarV2 = { ...P, complexion: 'b', skin: 'piel-3', hair: 'afro', hairColor: 'negro', accessories: ['gafas', 'gafete'], bata: false };
    expect(avatarFingerprint(a)).toMatch(/^[0-9a-f]{8}$/);
    expect(avatarFingerprint(a)).toBe(avatarFingerprint({ ...a, accessories: ['gafete', 'gafas'] }));
    expect(avatarFingerprint(a)).not.toBe(avatarFingerprint({ ...a, bata: true }));
    expect(avatarFingerprint(a)).not.toBe(avatarFingerprint({ ...a, hair: 'trenza' }));
  });
});
```

- [ ] **Step 2: Córrela y mira que falle**

Run: `npm test -- --runInBand avatar-v2`
Expected: FAIL con «Cannot find module './avatar-v2'».

- [ ] **Step 3: Escribe `avatar-v2.ts`**

```ts
// frontend/src/app/features/character/kit/avatar-v2.ts
/**
 * Avatar del estudiante, formato 2 (spec §9). Vive en `localStorage['psychosim_avatar']`.
 *
 * Dos modos: un jugable del elenco (`recipeId`) o un avatar personalizado con las
 * opciones del editor (spec §4.7). En los dos, la bata es un interruptor del
 * jugador (decisión 17). El uniforme no tiene color que elegir (decisión 18): por
 * eso el formato no guarda conjunto ni variante; la bata elige el conjunto.
 *
 * Las listas son el espejo de `catalog.editor` y `catalog.playables` de kit.json:
 * el almacén valida al cargar, antes de que llegue el paquete. avatar-v2.spec.ts
 * exige que coincidan.
 */

export const PLAYABLE_IDS = ['valentina', 'andres', 'camila', 'daniela', 'david', 'felipe', 'jorge', 'luisa', 'mariana', 'mateo', 'paula', 'samuel'] as const;
export const COMPLEXIONS = ['a', 'b'] as const;
export const SKINS = ['piel-1', 'piel-2', 'piel-3', 'piel-4', 'piel-5', 'piel-6'] as const;
export const HAIRS = ['rapado', 'corto-liso', 'corto-rizado', 'bob-flequillo', 'media-melena', 'largo-suelto', 'cola-caballo', 'mono', 'trenza', 'afro'] as const;
export const HAIR_COLORS = ['negro', 'castano-oscuro', 'castano', 'cobrizo', 'rubio', 'canoso'] as const;
export const ACCESSORIES = ['gafas', 'gafete'] as const;
/** Conjunto del editor según la bata (decisión 18). */
export const OUTFIT_IDS = Object.freeze({ sinBata: 'uniforme', conBata: 'uniforme-bata' });

export type PlayableId = (typeof PLAYABLE_IDS)[number];
export type Complexion = (typeof COMPLEXIONS)[number];
export type SkinId = (typeof SKINS)[number];
export type HairId = (typeof HAIRS)[number];
export type HairColorId = (typeof HAIR_COLORS)[number];
export type AccessoryId = (typeof ACCESSORIES)[number];

export interface AvatarElenco {
  schemaVersion: 2;
  mode: 'elenco';
  recipeId: PlayableId;
  bata: boolean;
}

export interface AvatarPersonalizado {
  schemaVersion: 2;
  mode: 'personalizado';
  complexion: Complexion;
  skin: SkinId;
  hair: HairId;
  hairColor: HairColorId;
  accessories: AccessoryId[];
  bata: boolean;
}

export type AvatarV2 = AvatarElenco | AvatarPersonalizado;

/** Etiquetas del editor, en el orden de las listas. */
export const AVATAR_LABELS = Object.freeze({
  complexion: { a: 'Complexión A', b: 'Complexión B' } as Record<Complexion, string>,
  hair: {
    rapado: 'Rapado', 'corto-liso': 'Corto liso', 'corto-rizado': 'Corto rizado', 'bob-flequillo': 'Bob con flequillo',
    'media-melena': 'Media melena', 'largo-suelto': 'Largo suelto', 'cola-caballo': 'Cola de caballo', mono: 'Moño',
    trenza: 'Trenza', afro: 'Afro',
  } as Record<HairId, string>,
  hairColor: {
    negro: 'Negro', 'castano-oscuro': 'Castaño oscuro', castano: 'Castaño', cobrizo: 'Cobrizo', rubio: 'Rubio', canoso: 'Canoso',
  } as Record<HairColorId, string>,
  accessory: { gafas: 'Gafas', gafete: 'Gafete' } as Record<AccessoryId, string>,
});

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

const asRecord = (x: unknown): Record<string, unknown> | null =>
  x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;

const pick = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => (isOneOf(list, value) ? value : fallback);

/** Accesorios válidos, sin repetir y en el orden del editor. */
function accessoriesFrom(value: unknown): AccessoryId[] {
  const given: unknown[] = Array.isArray(value) ? value : [];
  return ACCESSORIES.filter(id => given.includes(id));
}

export function defaultAvatarV2(): AvatarElenco {
  return { schemaVersion: 2, mode: 'elenco', recipeId: 'valentina', bata: false };
}

export function defaultPersonalizado(): AvatarPersonalizado {
  return { schemaVersion: 2, mode: 'personalizado', complexion: 'a', skin: 'piel-2', hair: 'corto-liso', hairColor: 'negro', accessories: [], bata: false };
}

/** Un objeto que dice ser v2: cada campo inválido toma su valor por defecto (spec §9.1). */
export function coerceAvatarV2(x: unknown): AvatarV2 {
  const a = asRecord(x);
  if (!a || a['schemaVersion'] !== 2) return defaultAvatarV2();
  const bata = a['bata'] === true;
  if (a['mode'] === 'elenco') {
    return { schemaVersion: 2, mode: 'elenco', recipeId: pick(PLAYABLE_IDS, a['recipeId'], 'valentina'), bata };
  }
  if (a['mode'] === 'personalizado') {
    const d = defaultPersonalizado();
    return {
      schemaVersion: 2,
      mode: 'personalizado',
      complexion: pick(COMPLEXIONS, a['complexion'], d.complexion),
      skin: pick(SKINS, a['skin'], d.skin),
      hair: pick(HAIRS, a['hair'], d.hair),
      hairColor: pick(HAIR_COLORS, a['hairColor'], d.hairColor),
      accessories: accessoriesFrom(a['accessories']),
      bata,
    };
  }
  return defaultAvatarV2();
}

// Equivalencias v1 → v2 (spec §9.3).
const SKIN_FROM_V1: Record<string, SkinId> = { porcelana: 'piel-1', clara: 'piel-2', media: 'piel-3', morena: 'piel-5', oscura: 'piel-6' };
const HAIR_FROM_V1: Record<string, HairId> = { corto: 'corto-liso', medio: 'media-melena', largo: 'largo-suelto', recogido: 'mono', ninguno: 'rapado' };
const HAIR_COLOR_FROM_V1: Record<string, HairColorId> = { negro: 'negro', castano: 'castano', rubio: 'rubio', rojizo: 'cobrizo', gris: 'canoso' };
const ACCESSORY_FROM_V1: Record<string, AccessoryId[]> = { gafas: ['gafas'], pin: ['gafete'] };

function fromTable<T>(table: Record<string, T>, value: unknown): T | undefined {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(table, value) ? table[value] : undefined;
}

/**
 * Un `AvatarConfig` v1 (o lo que haya quedado de él) en formato 2. Pura e
 * idempotente: aplicada a su propia salida devuelve lo mismo (vía toAvatarV2).
 * Rasgos, ojos, cejas, boca y color de ropa se descartan (spec §9.3).
 */
export function migrateAvatarV1(x: unknown): AvatarV2 {
  const a = asRecord(x);
  if (!a) return defaultAvatarV2();
  const bata = a['uniform'] === 'con-bata';
  if (isOneOf(PLAYABLE_IDS, a['castId'])) return { schemaVersion: 2, mode: 'elenco', recipeId: a['castId'], bata };
  const d = defaultPersonalizado();
  const hair = a['hairStyle'] === 'medio' && a['fringe'] === true ? 'bob-flequillo' : fromTable(HAIR_FROM_V1, a['hairStyle']) ?? d.hair;
  return {
    schemaVersion: 2,
    mode: 'personalizado',
    complexion: a['gender'] === 'male' ? 'b' : 'a',
    skin: fromTable(SKIN_FROM_V1, a['skinTone']) ?? d.skin,
    hair,
    hairColor: fromTable(HAIR_COLOR_FROM_V1, a['hairColor']) ?? d.hairColor,
    accessories: [...(fromTable(ACCESSORY_FROM_V1, a['accessory']) ?? [])],
    bata,
  };
}

/** Punto de entrada único: acepta v1 o v2; una versión desconocida cae al valor por defecto. */
export function toAvatarV2(x: unknown): AvatarV2 {
  const a = asRecord(x);
  if (!a) return defaultAvatarV2();
  if (a['schemaVersion'] === undefined) return migrateAvatarV1(a);
  return coerceAvatarV2(a);
}

export interface StoredAvatar {
  avatar: AvatarV2;
  /** Texto v1 original cuando hubo que migrarlo (para la copia `psychosim_avatar_v1`). */
  legacyRaw: string | null;
}

export function parseStoredAvatar(raw: string | null): StoredAvatar {
  if (!raw) return { avatar: defaultAvatarV2(), legacyRaw: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { avatar: defaultAvatarV2(), legacyRaw: null };
  }
  const record = asRecord(parsed);
  const legacy = record !== null && record['schemaVersion'] === undefined;
  return { avatar: toAvatarV2(parsed), legacyRaw: legacy ? raw : null };
}

export function serializeAvatarV2(avatar: AvatarV2): string {
  return JSON.stringify(avatar);
}

/** Huella corta (FNV-1a de 32 bits) de lo que se ve: clave de textura y de caché del avatar compuesto. */
export function avatarFingerprint(avatar: AvatarV2): string {
  const canonical = avatar.mode === 'elenco'
    ? `e|${avatar.recipeId}|${avatar.bata ? 1 : 0}`
    : `p|${avatar.complexion}|${avatar.skin}|${avatar.hair}|${avatar.hairColor}|${[...avatar.accessories].sort().join('+')}|${avatar.bata ? 1 : 0}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
```

- [ ] **Step 4: Córrela y mira que pase**

Run: `npm test -- --runInBand avatar-v2`
Expected: PASS, 15 pruebas (9 de la tabla y 6 más).

- [ ] **Step 5: Cierre y commit**

Run:
- `npm test -- --runInBand`
- `npm run build`

Expected: todo verde.

```bash
git add src/app/features/character/kit/avatar-v2.ts src/app/features/character/kit/avatar-v2.spec.ts
git commit -m "feat(personajes): avatar en formato 2 con migración pura desde v1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Punto único de resolución, carga del paquete y rasterizado

**Files:**
- Create: `frontend/src/app/features/character/kit/character-visual.resolver.ts`
- Create: `frontend/src/app/features/character/kit/kit.service.ts`
- Create: `frontend/src/app/features/character/kit/kit-raster.ts`
- Create: `frontend/src/app/features/character/kit/testing/kit-testing.ts`
- Test: `frontend/src/app/features/character/kit/character-visual.resolver.spec.ts`, `kit.service.spec.ts`, `kit-raster.spec.ts`

**Interfaces:**
- Consumes:
  - de la tarea 1: `AvatarV2`, `AvatarPersonalizado`, `OUTFIT_IDS`, `avatarFingerprint` y `toAvatarV2`;
  - del motor: `KitBundle`, `Recipe`, `RgbaImage`, `PortraitState`, `PORTRAIT_STATES` y `composeCharacter`.
- Produces:
  - `KIT_ASSETS = '/assets/characters/kit'` y `BATA_VARIANT = 'bata'`;
  - tipo `CharacterRef = { kind: 'jugador'; avatar: AvatarV2 } | { kind: 'receta'; recipeId: string; variant?: string | null } | { kind: 'autorado'; avatar: unknown }`;
  - tipo `SheetSource = { kind: 'url'; url: string } | { kind: 'rgba'; image: RgbaImage }`;
  - `interface CharacterVisual { key: string; recipeId: string | null; idle: SheetSource; walk: SheetSource; portraits: Partial<Record<PortraitState, SheetSource>> }`;
  - funciones `resolveCharacter(bundle, ref): CharacterVisual`, `avatarRecipe(bundle, avatar: AvatarPersonalizado): Recipe`, `resolveRecipeId(bundle, lookup: CharacterLookup): string | null`, `portraitStateFor(bundle, emotion): PortraitState` y `visualPortrait(visual, state): SheetSource | null`;
  - de `kit.service.ts`: `KIT_BUNDLE_URL` y `class KitService { bundle: Signal<KitBundle | null>; load(): Promise<KitBundle> }`;
  - de `kit-raster.ts`: `rgbaToCanvas(image, doc?): HTMLCanvasElement | null` y `sheetSourceUrl(source): string | null`;
  - de `testing/kit-testing.ts` (solo specs): `testKitBundle(): KitBundle` y `fakeKitService(bundle?)`.

**Ruling:** el §8.1 del spec describía `portrait(state)` como método de `CharacterVisual`.
- Qué se hace: el visual queda como datos planos (`portraits`) y la búsqueda pasa a una función, `visualPortrait`.
- Por qué: los datos planos se copian y se comparan bien en signals y en pruebas.
- Costo si está mal: ninguno funcional.

**Ruling:** el avatar compuesto llega a CSS como data URL (`canvas.toDataURL`) y no como URL de objeto.
- Por qué: es síncrono y no hay que revocarlo.
- Costo: unos KB de memoria por avatar visible.

- [ ] **Step 1: Escribe el ayudante de pruebas**

Este ayudante no es una prueba; solo lo importan los specs.

```ts
// frontend/src/app/features/character/kit/testing/kit-testing.ts
/** Solo para specs: el paquete real del kit leído de disco y un KitService que ya lo tiene. */
import { signal } from '@angular/core';
import { readFileSync } from 'fs';
import { join } from 'path';

import type { KitBundle } from '../kit-engine';
import type { KitService } from '../kit.service';

let cached: KitBundle | null = null;

export function testKitBundle(): KitBundle {
  cached ??= JSON.parse(readFileSync(join(__dirname, '../../../../../assets/characters/kit/kit.json'), 'utf8')) as KitBundle;
  return cached;
}

export function fakeKitService(bundle: KitBundle = testKitBundle()): KitService {
  return { bundle: signal(bundle).asReadonly(), load: () => Promise.resolve(bundle) } as unknown as KitService;
}
```

- [ ] **Step 2: Escribe las pruebas que fallan**

```ts
// frontend/src/app/features/character/kit/character-visual.resolver.spec.ts
import { AvatarPersonalizado } from './avatar-v2';
import {
  avatarRecipe,
  portraitStateFor,
  resolveCharacter,
  resolveRecipeId,
  visualPortrait,
} from './character-visual.resolver';
import { testKitBundle } from './testing/kit-testing';

const bundle = testKitBundle();
const url = (path: string) => ({ kind: 'url', url: `/assets/characters/kit/${path}` });
const custom: AvatarPersonalizado = {
  schemaVersion: 2, mode: 'personalizado', complexion: 'b', skin: 'piel-4', hair: 'afro', hairColor: 'negro', accessories: ['gafas'], bata: false,
};

describe('resolveCharacter', () => {
  it('una receta publicada se dibuja con sus PNG', () => {
    expect(resolveCharacter(bundle, { kind: 'receta', recipeId: 'valentina' })).toEqual({
      key: 'kit-valentina',
      recipeId: 'valentina',
      idle: url('valentina/idle.png'),
      walk: url('valentina/walk.png'),
      portraits: { neutral: url('valentina/portrait-neutral.png') },
    });
  });

  it('la variante con bata solo existe para los jugables', () => {
    const conBata = resolveCharacter(bundle, { kind: 'receta', recipeId: 'valentina', variant: 'bata' });
    expect(conBata.key).toBe('kit-valentina-bata');
    expect(conBata.idle).toEqual(url('valentina/bata/idle.png'));
    const npc = resolveCharacter(bundle, { kind: 'receta', recipeId: 'abuela-familia', variant: 'bata' });
    expect(npc.key).toBe('kit-abuela-familia');
    expect(Object.keys(npc.portraits).sort()).toEqual(['alegre', 'neutral', 'preocupada', 'triste']);
  });

  it('una receta desconocida cae a la receta por defecto', () => {
    expect(resolveCharacter(bundle, { kind: 'receta', recipeId: 'no-existe' }).key).toBe('kit-valentina');
  });

  it('el jugador del elenco usa los PNG de su receta, con o sin bata', () => {
    expect(resolveCharacter(bundle, { kind: 'jugador', avatar: { schemaVersion: 2, mode: 'elenco', recipeId: 'samuel', bata: true } }).walk)
      .toEqual(url('samuel/bata/walk.png'));
  });

  it('el avatar personalizado se compone en memoria y se cachea por su huella', () => {
    const visual = resolveCharacter(bundle, { kind: 'jugador', avatar: custom });
    expect(visual.recipeId).toBeNull();
    expect(visual.key).toMatch(/^kit-avatar-[0-9a-f]{8}$/);
    if (visual.idle.kind !== 'rgba' || visual.walk.kind !== 'rgba') throw new Error('se esperaban hojas compuestas');
    expect([visual.idle.image.width, visual.idle.image.height]).toEqual([192, 288]);
    expect([visual.walk.image.width, visual.walk.image.height]).toEqual([288, 288]);
    const portrait = visual.portraits.neutral;
    expect(portrait?.kind === 'rgba' && [portrait.image.width, portrait.image.height]).toEqual([32, 32]);
    expect(resolveCharacter(bundle, { kind: 'jugador', avatar: { ...custom } })).toBe(visual);
    expect(resolveCharacter(bundle, { kind: 'jugador', avatar: { ...custom, hair: 'trenza' } }).key).not.toBe(visual.key);
  });

  it('un NPC autorado en v1 se migra; la basura cae a la receta por defecto', () => {
    expect(resolveCharacter(bundle, { kind: 'autorado', avatar: { castId: 'david', uniform: 'con-bata' } }).key).toBe('kit-david-bata');
    expect(resolveCharacter(bundle, { kind: 'autorado', avatar: 'basura' }).key).toBe('kit-valentina');
  });
});

describe('avatarRecipe', () => {
  it('viste el uniforme y, con bata, la bata de Psicología', () => {
    const sin = avatarRecipe(bundle, custom);
    expect(sin.pieces).toEqual({ hair: 'afro', face: 'sereno', top: 'uniforme-psicologia', bottom: 'jogger', shoes: 'tenis', accessories: ['gafas'] });
    expect(sin.colors['skin']).toBe('piel-4');
    expect(sin.colors['hair']).toBe('negro');
    const con = avatarRecipe(bundle, { ...custom, bata: true });
    expect(con.pieces.layer).toBe('bata-psicologia');
    expect(con.colors['layer']).toBe('blanco');
  });
});

describe('resolveRecipeId', () => {
  it.each([
    [{ actor: 'familia-crisis' }, 'abuela-familia'],
    [{ actor: 'escucha-segura' }, 'sobreviviente'],
    [{ template: 'mujer-adulta' }, 'madre-acompanante'],
    [{ guide: 'Enfermera de turno' }, 'enfermera-urgencias'],
    [{ speaker: 'Abuela de la niña' }, 'abuela-familia'],
    [{ speaker: 'Supervisión clínica' }, null],
    [{ recipeId: 'supervisor-clinico', speaker: 'Supervisión clínica' }, 'supervisor-clinico'],
    [{ recipeId: 'no-existe', speaker: 'Consultante' }, 'sobreviviente'],
    [{ speaker: 'Nadie' }, null],
    [{}, null],
  ])('%j → %s', (lookup, expected) => {
    expect(resolveRecipeId(bundle, lookup)).toBe(expected);
  });
});

describe('retratos', () => {
  it('las emociones del diálogo se proyectan a los 4 estados', () => {
    expect(portraitStateFor(bundle, 'vulnerable')).toBe('preocupada');
    expect(portraitStateFor(bundle, ' Danger ')).toBe('triste');
    expect(portraitStateFor(bundle, 'positive')).toBe('alegre');
    expect(portraitStateFor(bundle, 'alerta')).toBe('neutral');
    expect(portraitStateFor(bundle, null)).toBe('neutral');
  });

  it('un jugable sin el estado pedido muestra su retrato neutral', () => {
    const visual = resolveCharacter(bundle, { kind: 'receta', recipeId: 'andres' });
    expect(visualPortrait(visual, 'triste')).toEqual(url('andres/portrait-neutral.png'));
  });
});
```

```ts
// frontend/src/app/features/character/kit/kit.service.spec.ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { KIT_BUNDLE_URL, KitService } from './kit.service';
import { testKitBundle } from './testing/kit-testing';

describe('KitService', () => {
  let service: KitService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(KitService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide kit.json una sola vez y publica el paquete en la señal', async () => {
    const first = service.load();
    const second = service.load();
    http.expectOne(KIT_BUNDLE_URL).flush(testKitBundle());
    const bundle = await first;
    expect(await second).toBe(bundle);
    expect(service.bundle()).toBe(bundle);
    expect(await service.load()).toBe(bundle);
  });

  it('si la carga falla, el siguiente load vuelve a intentarlo', async () => {
    const failed = service.load();
    http.expectOne(KIT_BUNDLE_URL).flush('caído', { status: 500, statusText: 'Error' });
    await expect(failed).rejects.toBeTruthy();
    expect(service.bundle()).toBeNull();
    const retry = service.load();
    http.expectOne(KIT_BUNDLE_URL).flush(testKitBundle());
    await expect(retry).resolves.toBeTruthy();
  });
});
```

```ts
// frontend/src/app/features/character/kit/kit-raster.spec.ts
import { sheetSourceUrl } from './kit-raster';

describe('kit-raster', () => {
  afterEach(() => jest.restoreAllMocks());

  it('una URL pasa tal cual', () => {
    expect(sheetSourceUrl({ kind: 'url', url: '/assets/x.png' })).toBe('/assets/x.png');
  });

  it('una hoja compuesta pasa a data URL una sola vez', () => {
    const putImageData = jest.fn();
    const context = { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData };
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    const toDataURL = jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAA');
    const image = { width: 2, height: 1, rgba: new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]) };
    expect(sheetSourceUrl({ kind: 'rgba', image })).toBe('data:image/png;base64,AAA');
    expect(sheetSourceUrl({ kind: 'rgba', image })).toBe('data:image/png;base64,AAA');
    expect(toDataURL).toHaveBeenCalledTimes(1);
    expect(putImageData).toHaveBeenCalledTimes(1);
  });

  it('sin contexto 2D (jsdom sin canvas) devuelve null en vez de romper', () => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(sheetSourceUrl({ kind: 'rgba', image: { width: 1, height: 1, rgba: new Uint8Array(4) } })).toBeNull();
  });
});
```

- [ ] **Step 3: Córrelas y mira que fallen**

Run: `npm test -- --runInBand "character-visual|kit.service|kit-raster"`
Expected: FAIL; los tres suites no encuentran sus módulos.

- [ ] **Step 4: Escribe los tres módulos**

```ts
// frontend/src/app/features/character/kit/character-visual.resolver.ts
/**
 * Punto único de resolución de personajes (spec §8.1): cualquier personaje del
 * juego (el jugador, una receta, un NPC autorado) pasa a un CharacterVisual.
 *
 * Las recetas fijas se dibujan con los PNG que publica `npm run kit:build`; el
 * avatar personalizado se compone aquí con el mismo motor del build (mismos
 * píxeles en el navegador y en CI) y se guarda en una caché pequeña por su huella.
 */
import { AvatarPersonalizado, AvatarV2, OUTFIT_IDS, avatarFingerprint, toAvatarV2 } from './avatar-v2';
import {
  KitBundle,
  PORTRAIT_STATES,
  PortraitState,
  Recipe,
  RgbaImage,
  composeCharacter,
} from './kit-engine';

export const KIT_ASSETS = '/assets/characters/kit';
/** Variante de los jugables con la bata de Psicología (decisión 17). */
export const BATA_VARIANT = 'bata';

export type CharacterRef =
  | { kind: 'jugador'; avatar: AvatarV2 }
  | { kind: 'receta'; recipeId: string; variant?: string | null }
  | { kind: 'autorado'; avatar: unknown };

export type SheetSource =
  | { kind: 'url'; url: string }
  | { kind: 'rgba'; image: RgbaImage };

export interface CharacterVisual {
  /** Prefijo de texturas y animaciones: 'kit-valentina', 'kit-valentina-bata' o 'kit-avatar-1a2b3c4d'. */
  key: string;
  /** Receta publicada que lo dibuja; null para el avatar personalizado. */
  recipeId: string | null;
  idle: SheetSource;
  walk: SheetSource;
  portraits: Partial<Record<PortraitState, SheetSource>>;
}

export function resolveCharacter(bundle: KitBundle, ref: CharacterRef): CharacterVisual {
  if (ref.kind === 'receta') return recipeVisual(bundle, ref.recipeId, ref.variant ?? null);
  const avatar = ref.kind === 'jugador' ? ref.avatar : toAvatarV2(ref.avatar);
  if (avatar.mode === 'elenco') return recipeVisual(bundle, avatar.recipeId, avatar.bata ? BATA_VARIANT : null);
  return composedVisual(bundle, avatar);
}

function recipeVisual(bundle: KitBundle, recipeId: string, variant: string | null): CharacterVisual {
  const id = bundle.recipes[recipeId] ? recipeId : bundle.catalog.defaultRecipe;
  const recipe = bundle.recipes[id]!;
  const useVariant = variant !== null && recipe.kind === 'jugable' && bundle.catalog.playableVariants[variant] !== undefined;
  const base = useVariant ? `${KIT_ASSETS}/${id}/${variant}` : `${KIT_ASSETS}/${id}`;
  const png = (name: string): SheetSource => ({ kind: 'url', url: `${base}/${name}.png` });
  const portraits: CharacterVisual['portraits'] = {};
  for (const state of recipe.portraits ?? ['neutral']) portraits[state] = png(`portrait-${state}`);
  return { key: useVariant ? `kit-${id}-${variant}` : `kit-${id}`, recipeId: id, idle: png('idle'), walk: png('walk'), portraits };
}

/** Pocas entradas: en una sesión se ven el avatar propio y, en el editor de mundo, algún NPC. */
const COMPOSED_CACHE_LIMIT = 8;
const composedCaches = new WeakMap<KitBundle, Map<string, CharacterVisual>>();

function composedVisual(bundle: KitBundle, avatar: AvatarPersonalizado): CharacterVisual {
  let cache = composedCaches.get(bundle);
  if (!cache) {
    cache = new Map();
    composedCaches.set(bundle, cache);
  }
  const key = `kit-avatar-${avatarFingerprint(avatar)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const composed = composeCharacter(bundle, avatarRecipe(bundle, avatar));
  const portraits: CharacterVisual['portraits'] = {};
  for (const state of PORTRAIT_STATES) {
    const image = composed.portraits[state];
    if (image) portraits[state] = { kind: 'rgba', image };
  }
  const visual: CharacterVisual = {
    key,
    recipeId: null,
    idle: { kind: 'rgba', image: composed.idle },
    walk: { kind: 'rgba', image: composed.walk },
    portraits,
  };
  cache.set(key, visual);
  if (cache.size > COMPOSED_CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return visual;
}

/** Receta del avatar personalizado: sus rasgos con el uniforme (y la bata, si la lleva). */
export function avatarRecipe(bundle: KitBundle, avatar: AvatarPersonalizado): Recipe {
  const editor = bundle.catalog.editor;
  const outfitId = avatar.bata ? OUTFIT_IDS.conBata : OUTFIT_IDS.sinBata;
  const outfit = editor.outfits.find(o => o.id === outfitId) ?? editor.outfits[0]!;
  return {
    id: `avatar-${avatarFingerprint(avatar)}`,
    displayName: 'Avatar personalizado',
    complexion: avatar.complexion,
    pieces: {
      hair: avatar.hair,
      face: editor.face,
      top: outfit.top,
      ...(outfit.layer ? { layer: outfit.layer } : {}),
      bottom: outfit.bottom,
      shoes: outfit.shoes,
      accessories: [...avatar.accessories],
    },
    colors: { skin: avatar.skin, hair: avatar.hairColor, ...(outfit.variants[0]?.colors ?? {}) },
    portraits: ['neutral'],
  };
}

/** Claves con las que el juego nombra a un personaje, de la más precisa a la menos. */
export interface CharacterLookup {
  recipeId?: string | null;
  /** Clave de un objeto PERSON del mundo o `portraitKey` de un diálogo. */
  actor?: string | null;
  template?: string | null;
  guide?: string | null;
  speaker?: string | null;
}

/** Receta del personaje, o null si es una voz sin cuerpo (spec §7.2) o no tiene receta. */
export function resolveRecipeId(bundle: KitBundle, lookup: CharacterLookup): string | null {
  const { catalog, recipes } = bundle;
  const known = (id: string | null | undefined): string | null => (id && recipes[id] ? id : null);
  return known(lookup.recipeId)
    ?? known(lookup.actor ? catalog.actors[lookup.actor] ?? catalog.portraitKeys[lookup.actor] : null)
    ?? known(lookup.template ? catalog.templates[lookup.template] : null)
    ?? known(lookup.guide ? catalog.guides[lookup.guide] : null)
    ?? (lookup.speaker && !catalog.voices.includes(lookup.speaker) ? known(catalog.speakers[lookup.speaker]) : null);
}

/** Emoción del diálogo → estado de retrato (spec §7.3); lo desconocido es neutral. */
export function portraitStateFor(bundle: KitBundle, emotion: string | null | undefined): PortraitState {
  const state = emotion ? bundle.catalog.emotionToPortrait[emotion.trim().toLowerCase()] : undefined;
  return state && PORTRAIT_STATES.includes(state) ? state : 'neutral';
}

/** Retrato del estado pedido o, si la receta no lo tiene, el neutral. */
export function visualPortrait(visual: CharacterVisual, state: PortraitState): SheetSource | null {
  return visual.portraits[state] ?? visual.portraits.neutral ?? null;
}
```

```ts
// frontend/src/app/features/character/kit/kit.service.ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { KitBundle } from './kit-engine';

export const KIT_BUNDLE_URL = '/assets/characters/kit/kit.json';

/**
 * Paquete del kit (spec §5.3), pedido una sola vez por sesión. Si la carga falla,
 * el siguiente `load()` vuelve a intentarlo; mientras tanto `bundle()` es null y
 * cada pantalla muestra su respaldo.
 */
@Injectable({ providedIn: 'root' })
export class KitService {
  private readonly http = inject(HttpClient);
  private readonly state = signal<KitBundle | null>(null);
  readonly bundle = this.state.asReadonly();
  private request: Promise<KitBundle> | null = null;

  load(): Promise<KitBundle> {
    const ready = this.state();
    if (ready) return Promise.resolve(ready);
    this.request ??= firstValueFrom(this.http.get<KitBundle>(KIT_BUNDLE_URL)).then(
      bundle => {
        this.state.set(bundle);
        return bundle;
      },
      error => {
        this.request = null;
        throw error;
      },
    );
    return this.request;
  }
}
```

```ts
// frontend/src/app/features/character/kit/kit-raster.ts
/** RgbaImage del motor → lienzo (Phaser) o data URL (CSS). Sin contexto 2D, null. */
import type { SheetSource } from './character-visual.resolver';
import type { RgbaImage } from './kit-engine';

export function rgbaToCanvas(
  image: RgbaImage,
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined,
): HTMLCanvasElement | null {
  if (!doc) return null;
  const canvas = doc.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const data = context.createImageData(image.width, image.height);
  data.data.set(image.rgba);
  context.putImageData(data, 0, 0);
  return canvas;
}

const dataUrls = new WeakMap<RgbaImage, string>();

/** URL que puede usar el CSS: la del PNG publicado, o la data URL (cacheada) de la hoja compuesta. */
export function sheetSourceUrl(source: SheetSource): string | null {
  if (source.kind === 'url') return source.url;
  const cached = dataUrls.get(source.image);
  if (cached) return cached;
  const canvas = rgbaToCanvas(source.image);
  if (!canvas) return null;
  const url = canvas.toDataURL('image/png');
  dataUrls.set(source.image, url);
  return url;
}
```

- [ ] **Step 5: Córrelas y mira que pasen**

Run: `npm test -- --runInBand "character-visual|kit.service|kit-raster"`
Expected: PASS (resolver, 19 pruebas; servicio, 2; rasterizado, 3).

- [ ] **Step 6: Cierre y commit**

Run:
- `npm test -- --runInBand`
- `npm run build`

Expected: todo verde.

```bash
git add src/app/features/character/kit/character-visual.resolver.ts src/app/features/character/kit/kit.service.ts \
  src/app/features/character/kit/kit-raster.ts src/app/features/character/kit/testing/kit-testing.ts \
  src/app/features/character/kit/character-visual.resolver.spec.ts src/app/features/character/kit/kit.service.spec.ts \
  src/app/features/character/kit/kit-raster.spec.ts
git commit -m "feat(personajes): punto único de resolución, carga de kit.json y rasterizado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Escala entera — cálculo y lienzo en píxeles físicos

**Files:**
- Create: `frontend/src/app/features/simulator/pixel-scale.util.ts`
- Create: `frontend/src/app/features/simulator/pixel-canvas.ts`
- Test: `frontend/src/app/features/simulator/pixel-scale.util.spec.ts`, `pixel-canvas.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `MIN_ROOM_FRACTION = 0.8`;
  - `interface PhysicalSize { width: number; height: number; dpr: number }`;
  - `interface Bounds { x: number; y: number; width: number; height: number }`;
  - `physicalSize(cssW, cssH, dpr): PhysicalSize`;
  - `integerZoom(physW, physH, roomW, roomH): number`;
  - `cameraBounds(roomW, roomH, viewW, viewH): Bounds`;
  - de `pixel-canvas.ts`: `hostPhysicalSize(host)`, `pixelScaleConfig(host): Phaser.Types.Core.ScaleConfig`, `fitGameToHost(game, host): boolean` y `watchHostSize(game, host): () => void`.

**Ruling:** el spec dice que en 4K «da ×3».
- Qué se hace: manda la fórmula del propio spec, que para un contenedor de 3392×1908 px físicos (4K a dpr 2) da ×4. La prueba fija ×4.
- Costo si está mal: en 4K se ve el 88 % de la sala en vez del 100 %.

- [ ] **Step 1: Escribe las pruebas que fallan**

```ts
// frontend/src/app/features/simulator/pixel-scale.util.spec.ts
import { cameraBounds, integerZoom, physicalSize } from './pixel-scale.util';

const ROOM = { w: 960, h: 528 };

describe('pixel-scale.util', () => {
  it.each([
    ['1920×1080 (contenedor 1696×954, dpr 1)', 1696, 954, 1, 2],
    ['1366×768 (contenedor 1200×650, dpr 1)', 1200, 650, 1, 1],
    ['portátil a 125 % (contenedor 1360×760 CSS)', 1360, 760, 1.25, 2],
    ['4K a dpr 2 (contenedor 1696×954 CSS)', 1696, 954, 2, 4],
    ['móvil en vertical', 390, 700, 3, 1],
  ])('zoom entero: %s', (_name, cssW, cssH, dpr, expected) => {
    const size = physicalSize(cssW, cssH, dpr);
    expect(integerZoom(size.width, size.height, ROOM.w, ROOM.h)).toBe(expected);
  });

  it('el zoom deja ver al menos el 80 % de la sala en los dos ejes', () => {
    for (const [w, h] of [[1700, 950], [3392, 1908], [2560, 1300], [800, 2000]]) {
      const k = integerZoom(w, h, ROOM.w, ROOM.h);
      expect(Number.isInteger(k)).toBe(true);
      if (k > 1) {
        expect(w / k).toBeGreaterThanOrEqual(0.8 * ROOM.w);
        expect(h / k).toBeGreaterThanOrEqual(0.8 * ROOM.h);
      }
    }
  });

  it('tamaño físico: redondea, nunca baja de 1 px y tolera dpr inválidos', () => {
    expect(physicalSize(1360, 760, 1.25)).toEqual({ width: 1700, height: 950, dpr: 1.25 });
    expect(physicalSize(0, 0, 1)).toEqual({ width: 1, height: 1, dpr: 1 });
    expect(physicalSize(800, 450, Number.NaN)).toEqual({ width: 800, height: 450, dpr: 1 });
    expect(physicalSize(-5, 10, 0)).toEqual({ width: 1, height: 10, dpr: 1 });
    expect(integerZoom(1, 1, ROOM.w, ROOM.h)).toBe(1);
    expect(integerZoom(1000, 1000, 0, 0)).toBe(1);
  });

  it('límites de cámara: los de la sala; si la vista es mayor, centrados', () => {
    expect(cameraBounds(960, 528, 848, 477)).toEqual({ x: 0, y: 0, width: 960, height: 528 });
    expect(cameraBounds(960, 528, 1280, 720)).toEqual({ x: -160, y: -96, width: 1280, height: 720 });
    expect(cameraBounds(960, 528, 1281, 400)).toEqual({ x: -161, y: 0, width: 1281, height: 528 });
  });
});
```

```ts
// frontend/src/app/features/simulator/pixel-canvas.spec.ts
jest.mock('phaser', () => ({ __esModule: true, default: { Scale: { NONE: 0 } } }));

import type Phaser from 'phaser';

import { fitGameToHost, pixelScaleConfig } from './pixel-canvas';

function host(width: number, height: number): HTMLElement {
  return { getBoundingClientRect: () => ({ width, height }) } as unknown as HTMLElement;
}

function fakeGame(width: number, height: number, zoom: number) {
  const scale = {
    width, height, zoom,
    resize: jest.fn((w: number, h: number) => { scale.width = w; scale.height = h; }),
    setZoom: jest.fn((z: number) => { scale.zoom = z; }),
  };
  return { game: { scale } as unknown as Phaser.Game, scale };
}

function setDpr(value: number): void {
  Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true });
}

describe('pixel-canvas', () => {
  afterEach(() => setDpr(1));

  it('la config pide el lienzo en píxeles físicos con el CSS al tamaño del contenedor', () => {
    setDpr(1.5);
    expect(pixelScaleConfig(host(800, 450))).toEqual({ mode: 0, width: 1200, height: 675, zoom: 1 / 1.5 });
  });

  it('si cambia el contenedor o el dpr ajusta tamaño y zoom; si no cambió nada, no toca nada', () => {
    setDpr(1);
    const { game, scale } = fakeGame(800, 450, 1);
    expect(fitGameToHost(game, host(800, 450))).toBe(false);
    expect(scale.resize).not.toHaveBeenCalled();
    expect(fitGameToHost(game, host(1000, 500))).toBe(true);
    expect(scale.resize).toHaveBeenCalledWith(1000, 500);
    setDpr(2);
    expect(fitGameToHost(game, host(1000, 500))).toBe(true);
    expect(scale.resize).toHaveBeenLastCalledWith(2000, 1000);
    expect(scale.setZoom).toHaveBeenLastCalledWith(0.5);
  });
});
```

- [ ] **Step 2: Córrelas y mira que fallen**

Run: `npm test -- --runInBand "pixel-scale|pixel-canvas"`
Expected: FAIL; no encuentran los módulos.

- [ ] **Step 3: Escribe los dos módulos**

```ts
// frontend/src/app/features/simulator/pixel-scale.util.ts
/**
 * Escala entera (spec §8.3): el lienzo trabaja en píxeles físicos y la cámara usa
 * un zoom entero, así cada píxel de un sprite mide un número entero de píxeles
 * físicos. Lógica pura; el pegamento con Phaser vive en pixel-canvas.ts.
 */

/** Fracción mínima de la sala que debe verse con el zoom elegido. */
export const MIN_ROOM_FRACTION = 0.8;

export interface PhysicalSize {
  width: number;
  height: number;
  dpr: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tamaño CSS × devicePixelRatio, redondeado y nunca menor que 1 px. */
export function physicalSize(cssWidth: number, cssHeight: number, devicePixelRatio: number): PhysicalSize {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const px = (css: number) => Math.max(1, Math.round((Number.isFinite(css) ? Math.max(0, css) : 0) * dpr));
  return { width: px(cssWidth), height: px(cssHeight), dpr };
}

/** k = mayor entero ≥ 1 con anchoFísico/k ≥ 0,8·anchoSala y altoFísico/k ≥ 0,8·altoSala. */
export function integerZoom(physicalWidth: number, physicalHeight: number, roomWidth: number, roomHeight: number): number {
  if (!(roomWidth > 0) || !(roomHeight > 0)) return 1;
  const k = Math.min(
    Math.floor(physicalWidth / (MIN_ROOM_FRACTION * roomWidth)),
    Math.floor(physicalHeight / (MIN_ROOM_FRACTION * roomHeight)),
  );
  return Math.max(1, k);
}

/**
 * Límites de cámara: los de la sala; en el eje en que la vista es mayor, se ensanchan
 * y se centran (Phaser alinea a la izquierda una sala más chica que la vista).
 */
export function cameraBounds(roomWidth: number, roomHeight: number, viewWidth: number, viewHeight: number): Bounds {
  const width = Math.max(roomWidth, viewWidth);
  const height = Math.max(roomHeight, viewHeight);
  return { x: Math.floor((roomWidth - width) / 2), y: Math.floor((roomHeight - height) / 2), width, height };
}
```

```ts
// frontend/src/app/features/simulator/pixel-canvas.ts
/**
 * Lienzo de Phaser en píxeles físicos (spec §8.3): el juego mide el contenedor ×
 * devicePixelRatio y `scale.zoom = 1/dpr` lo devuelve al tamaño CSS del contenedor.
 * Sustituye a Scale.FIT, que estiraba el lienzo de 960×540 a escalas fraccionarias.
 */
import Phaser from 'phaser';

import { PhysicalSize, physicalSize } from './pixel-scale.util';

export function hostPhysicalSize(host: HTMLElement): PhysicalSize {
  const rect = host.getBoundingClientRect();
  return physicalSize(rect.width, rect.height, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
}

export function pixelScaleConfig(host: HTMLElement): Phaser.Types.Core.ScaleConfig {
  const size = hostPhysicalSize(host);
  return { mode: Phaser.Scale.NONE, width: size.width, height: size.height, zoom: 1 / size.dpr };
}

/** Reajusta el lienzo al contenedor; true si algo cambió (Phaser emite `resize` y la escena recalcula el zoom). */
export function fitGameToHost(game: Phaser.Game, host: HTMLElement): boolean {
  const size = hostPhysicalSize(host);
  let changed = false;
  if (game.scale.width !== size.width || game.scale.height !== size.height) {
    game.scale.resize(size.width, size.height);
    changed = true;
  }
  if (Math.abs(game.scale.zoom - 1 / size.dpr) > 1e-6) {
    game.scale.setZoom(1 / size.dpr);
    changed = true;
  }
  return changed;
}

/**
 * Sigue el tamaño del contenedor (panel lateral, rotación) y el devicePixelRatio (zoom
 * del navegador, cambio de monitor: ambos disparan `resize` en window). Devuelve la
 * función que deja de observar.
 */
export function watchHostSize(game: Phaser.Game, host: HTMLElement): () => void {
  const refit = () => { fitGameToHost(game, host); };
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refit) : null;
  observer?.observe(host);
  window.addEventListener('resize', refit);
  return () => {
    observer?.disconnect();
    window.removeEventListener('resize', refit);
  };
}
```

- [ ] **Step 4: Córrelas y mira que pasen**

Run: `npm test -- --runInBand "pixel-scale|pixel-canvas"`
Expected: PASS (escala, 8 pruebas; lienzo, 2).

- [ ] **Step 5: Cierre y commit**

Run:
- `npm test -- --runInBand`
- `npm run build`

Expected: todo verde.

```bash
git add src/app/features/simulator/pixel-scale.util.ts src/app/features/simulator/pixel-canvas.ts \
  src/app/features/simulator/pixel-scale.util.spec.ts src/app/features/simulator/pixel-canvas.spec.ts
git commit -m "feat(personajes): zoom entero de cámara y lienzo en píxeles físicos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: El mundo a escala entera y con la luz debajo de los actores

**Files:**
- Modify: `frontend/src/app/features/simulator/depth-sort.util.ts` (banda `LIGHTING_FLOOR`; capa Tiled `lighting`)
- Modify: `frontend/src/app/features/simulator/case-pdf-rooms.renderer.ts:284` (`paintLighting`)
- Modify: `frontend/src/app/features/simulator/premium-clinical-room.renderer.ts:604,636` (`paintLighting` y motas)
- Modify: `frontend/src/app/features/simulator/game-world.component.ts`. Cambian `create`, `renderWorld`, `renderRoom`, `applyLightingOverlay`, `boot` y los estilos del lienzo; se suman métodos de cámara nuevos.
- Test: `frontend/src/app/features/simulator/room-lighting.spec.ts` (nuevo), `game-world.render.contract.spec.ts` (nuevo), `depth-sort.util.spec.ts:23`

**Interfaces:**
- Consumes de la tarea 3: `integerZoom`, `cameraBounds`, `pixelScaleConfig` y `watchHostSize`.
- Produces:
  - `DEPTH.LIGHTING_FLOOR = 4.5`;
  - en `DataDrivenWorldScene`: `private applyPixelCamera(roomWidth: number, roomHeight: number): void` y `private refitCamera(): void`;
  - en `GameWorldComponent`: `private detachHostWatch?: () => void`, que reemplaza a `hostResizeObserver`.

- [ ] **Step 1: Escribe las pruebas que fallan**

```ts
// frontend/src/app/features/simulator/room-lighting.spec.ts
import { CASE_PDF_ROOM_RENDERERS } from './case-pdf-rooms.renderer';
import { DEPTH, tiledLayerDepth } from './depth-sort.util';
import { premiumClinicalRoomRenderer } from './premium-clinical-room.renderer';
import { SceneRenderer } from './scene-layer.types';

/** Escena falsa: toda llamada devuelve la misma cadena y solo se anotan las profundidades. */
function recordingScene(): { scene: never; depths: number[] } {
  const depths: number[] = [];
  const chain: unknown = new Proxy(function noop() { /* cadena */ }, {
    get(_target, prop) {
      if (prop === 'setDepth') return (depth: number) => { depths.push(depth); return chain; };
      if (prop === 'exists') return () => false;
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === Symbol.iterator) return function* empty() { /* nada */ };
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && ['x', 'y', 'width', 'height', 'alpha', 'scale', 'displayWidth', 'displayHeight', 'length'].includes(prop)) return 0;
      return chain;
    },
    apply: () => chain,
  });
  return { scene: chain as never, depths };
}

const RENDERERS: SceneRenderer[] = [premiumClinicalRoomRenderer, ...CASE_PDF_ROOM_RENDERERS];

describe('la luz de las salas va debajo de los actores (spec §8.3)', () => {
  it.each(RENDERERS.map(renderer => [renderer.key, renderer] as const))('%s no pinta nada por encima de los actores', (_key, renderer) => {
    const { scene, depths } = recordingScene();
    renderer.render(scene, { width: 960, height: 528, reduceMotion: false, ambientTone: 'calm' });
    expect(depths.filter(depth => depth >= DEPTH.LIGHTING)).toEqual([]);
    expect(depths).toContain(DEPTH.LIGHTING_FLOOR);
  });

  it('la capa Tiled «lighting» también va al suelo', () => {
    expect(tiledLayerDepth('lighting')).toBe(DEPTH.LIGHTING_FLOOR);
    expect(DEPTH.LIGHTING_FLOOR).toBeGreaterThan(DEPTH.ENVIRONMENT);
    expect(DEPTH.LIGHTING_FLOOR).toBeLessThan(DEPTH.ACTORS_BASE);
  });
});
```

`SceneRendererOptions` (en `scene-layer.types.ts`) podría pedir más campos que `width`, `height`, `reduceMotion` y `ambientTone`. Si es así, complétalos con valores neutros.

```ts
// frontend/src/app/features/simulator/game-world.render.contract.spec.ts
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

describe('game-world: render a escala entera (spec §8.3)', () => {
  it('el lienzo trabaja en píxeles físicos y sigue al contenedor', () => {
    expect(source).toContain('scale: pixelScaleConfig(this.gameHost!.nativeElement)');
    expect(source).toContain('this.detachHostWatch = watchHostSize(this.phaserGame, this.gameHost!.nativeElement);');
    expect(source).not.toMatch(/Phaser\.Scale\.FIT|hostResizeObserver/);
  });

  it('la cámara usa el zoom entero y se recalcula al cambiar el lienzo', () => {
    expect(source).toMatch(/private applyPixelCamera\(roomWidth: number, roomHeight: number\): void \{[\s\S]*?integerZoom\(cam\.width, cam\.height, roomWidth, roomHeight\)[\s\S]*?cameraBounds\(/);
    expect(source).toContain("this.scale.on('resize', () => this.refitCamera());");
    expect(source).not.toMatch(/cameraZoom/);
    expect(source.match(/\.setZoom\(/g) ?? []).toHaveLength(1);
  });

  it('la viñeta de tono va al suelo; solo la de crisis queda por encima', () => {
    expect(source).toContain('setScrollFactor(0).setDepth(DEPTH.LIGHTING_FLOOR)');
    expect(source.match(/DEPTH\.LIGHTING\b/g) ?? []).toHaveLength(1);
    expect(source).toContain('setDepth(DEPTH.LIGHTING + 1)');
  });
});
```

En `depth-sort.util.spec.ts`, la línea 23 pasa a esperar el suelo:

```ts
    expect(tiledLayerDepth('lighting')).toBe(DEPTH.LIGHTING_FLOOR);
```

- [ ] **Step 2: Córrelas y mira que fallen**

Run: `npm test -- --runInBand "room-lighting|game-world.render|depth-sort"`

Expected: FAIL, por cuatro motivos:
- `DEPTH.LIGHTING_FLOOR` es `undefined`;
- la sala premium pinta en `DEPTH.LIGHTING - 2`;
- las salas del caso PDF pintan en `DEPTH.LIGHTING`;
- el contrato no encuentra `pixelScaleConfig`.

- [ ] **Step 3: La luz al suelo**

En `depth-sort.util.ts`, añade la banda después de `ENVIRONMENT`:

```ts
  ENVIRONMENT: 4,
  /** Focos, viñetas y motas de las salas: debajo de los actores (spec §8.3, biblia §2-3). */
  LIGHTING_FLOOR: 4.5,
```

y en `LAYER_BANDS` cambia `['lighting', DEPTH.LIGHTING]` por `['lighting', DEPTH.LIGHTING_FLOOR]`.

En `case-pdf-rooms.renderer.ts`, dentro de `paintLighting`, la capa pasa a:

```ts
  const g = scene.add.graphics().setDepth(DEPTH.LIGHTING_FLOOR);
```

En `premium-clinical-room.renderer.ts`, la capa de `paintLighting` pasa a `setDepth(DEPTH.LIGHTING_FLOOR)` y las motas a `.setDepth(DEPTH.LIGHTING_FLOOR)`.

- [ ] **Step 4: El mundo en píxeles físicos y con zoom entero**

Todos estos cambios van en `game-world.component.ts`.

1. Imports, junto a los demás:

```ts
import { cameraBounds, integerZoom } from './pixel-scale.util';
import { pixelScaleConfig, watchHostSize } from './pixel-canvas';
```

2. Campos nuevos en `DataDrivenWorldScene`, junto a `crisisVignette`:

```ts
  /** Sala que encuadra la cámara: el zoom entero se recalcula con ella al cambiar el lienzo. */
  private roomSize = { width: AUTHORED_ROOM_WIDTH, height: AUTHORED_ROOM_HEIGHT };
  /** Viñeta de tono de la sala actual (se redibuja al rectángulo visible si cambia el lienzo). */
  private toneVignette?: Phaser.GameObjects.Graphics;
```

3. En `create()`, justo antes de `this.renderWorld();`:

```ts
    this.scale.on('resize', () => this.refitCamera());
```

4. En los dos bloques de limpieza (el de `renderWorld` y el de `renderRoom`), añade `this.toneVignette = undefined;` después de `this.tiledExits.clear();`.

5. En `renderWorld`, rama de sala autoría, reemplaza

```ts
      const cam = this.cameras.main;
      cam.setZoom(1);
      cam.setBounds(0, 0, metadata.bounds.width, metadata.bounds.height);
      cam.centerOn(metadata.bounds.width / 2, metadata.bounds.height / 2);
```

por

```ts
      this.applyPixelCamera(metadata.bounds.width, metadata.bounds.height);
```

6. En `renderWorld`, rama clásica, reemplaza todo el bloque que va desde `// ── Camera: 2× zoom, smooth follow, clamp to map bounds ────────────────` hasta el comentario `// lerp 0.12 = Undertale-style "slightly behind" smooth follow.` por

```ts
    // ── Cámara: zoom entero (spec §8.3); sigue a la jugadora dentro de la sala ──
    this.applyPixelCamera(mapW, mapH);
```

7. En `renderRoom`, borra

```ts
    const cam = this.cameras.main;
    cam.setZoom(authoredClinicalRoom ? 1 : 2);
    cam.setBounds(0, 0, actualMapW, actualMapH);
```

y reemplaza

```ts
    this.createPlayer(spawn.x, spawn.y);
    if (authoredClinicalRoom) {
      cam.centerOn(actualMapW / 2, actualMapH / 2);
    } else {
      cam.startFollow(this.player!, true, 0.12, 0.12);
    }
```

por

```ts
    this.createPlayer(spawn.x, spawn.y);
    this.applyPixelCamera(actualMapW, actualMapH);
```

8. En `applyLightingOverlay`, la viñeta de tono baja al suelo y queda guardada:

```ts
    const g = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.LIGHTING_FLOOR);
    // Borde oscuro suave en los 4 lados — viñeta barata sin shaders.
    // Banda corta y alpha bajo: enmarca sin leerse como overlay técnico.
    this.strokeVignetteBand(g, tint, 0.12, 0.3);
    this.toneVignette = g;
```

9. Métodos nuevos, debajo de `playIntroFade()`:

```ts
  /**
   * Zoom entero de cámara (spec §8.3): el mayor k que deja ver el 80 % de la sala. La
   * cámara sigue a la jugadora y se limita a la sala; si la vista es mayor, la centra.
   */
  private applyPixelCamera(roomWidth: number, roomHeight: number): void {
    this.roomSize = { width: roomWidth, height: roomHeight };
    const cam = this.cameras.main;
    const k = integerZoom(cam.width, cam.height, roomWidth, roomHeight);
    cam.setZoom(k);
    const bounds = cameraBounds(roomWidth, roomHeight, cam.width / k, cam.height / k);
    cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    if (this.player) {
      cam.startFollow(this.player, true, 0.12, 0.12);
      cam.centerOn(this.player.x, this.player.y);
    }
  }

  /** El lienzo cambió de tamaño o de dpr: nuevo zoom entero y viñetas al nuevo rectángulo visible. */
  private refitCamera(): void {
    if (!this.ready || !this.player) return;
    this.applyPixelCamera(this.roomSize.width, this.roomSize.height);
    if (this.toneVignette) {
      this.toneVignette.destroy();
      this.applyLightingOverlay();
    }
    this.crisisVignette?.destroy();
    this.applyCrisisVignette();
  }
```

10. En `GameWorldComponent`:
   - Cambia `private hostResizeObserver?: ResizeObserver;` por `/** Deja de seguir el tamaño del contenedor y el devicePixelRatio. */ private detachHostWatch?: () => void;`.
   - En `ngOnDestroy()` y en `retryLoad()`, cambia `this.hostResizeObserver?.disconnect();` por `this.detachHostWatch?.(); this.detachHostWatch = undefined;`.
   - En `boot()`, la configuración del juego pasa a:

```ts
      this.phaserGame = new Phaser.Game({
        type: Phaser.AUTO,
        parent: this.gameHost!.nativeElement,
        backgroundColor: '#0e141a',
        pixelArt: true,    // vecino más cercano: el pixel art no se suaviza
        roundPixels: true, // 2.5D: evita el temblor sub-píxel con el y-sort y el seguimiento
        scale: pixelScaleConfig(this.gameHost!.nativeElement),
        scene: this.scene
      });
```

   - Más abajo, el bloque `if (typeof ResizeObserver !== 'undefined') { … }` se reemplaza por:

```ts
      // Lienzo en píxeles físicos: sigue al contenedor (panel derecho, rotación, bottom
      // sheet) y al devicePixelRatio (zoom del navegador, cambio de monitor).
      this.detachHostWatch = watchHostSize(this.phaserGame, this.gameHost!.nativeElement);
```

11. En los estilos, reemplaza la regla del lienzo y su comentario por:

```css
    /* El lienzo mide el contenedor × devicePixelRatio y Phaser lo devuelve al tamaño
       CSS del contenedor (scale.zoom = 1/dpr): nada lo estira a escalas fraccionarias. */
    :host ::ng-deep .phaser-host canvas { display: block; }
```

- [ ] **Step 5: Córrelas y mira que pasen**

Run: `npm test -- --runInBand "room-lighting|game-world|depth-sort"`

Expected: PASS. Los contratos que ya existían (`game-world.game-feel.contract.spec.ts`) siguen verdes:
- el renderizado autoría conserva la secuencia `buildGuide → applyCrisisVignette → playIntroFade → onReady → return`;
- `setReduceMotion` no cambia.

- [ ] **Step 6: Cierre y commit**

Run: `npm test -- --runInBand` y `npm run build`
Expected: todo verde.

```bash
git add src/app/features/simulator/depth-sort.util.ts src/app/features/simulator/depth-sort.util.spec.ts \
  src/app/features/simulator/case-pdf-rooms.renderer.ts src/app/features/simulator/premium-clinical-room.renderer.ts \
  src/app/features/simulator/game-world.component.ts src/app/features/simulator/room-lighting.spec.ts \
  src/app/features/simulator/game-world.render.contract.spec.ts
git commit -m "feat(personajes): el mundo a escala entera y con la luz debajo de los actores

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: El jugador del mundo sale del kit

**Files:**
- Create: `frontend/src/app/features/character/kit/kit-phaser.ts`
- Create: `frontend/src/app/features/simulator/world-characters.util.ts`
- Modify: `frontend/src/app/features/simulator/game-world.component.ts` (`WorldCallbacks`, campos del jugador, `preload`, `create`, `createPlayer`, poses y `boot`)
- Test: `frontend/src/app/features/character/kit/kit-phaser.spec.ts`, `frontend/src/app/features/simulator/world-characters.util.spec.ts` y `frontend/src/app/features/simulator/game-world.kit.contract.spec.ts` (todos nuevos)

**Interfaces:**
- Consumes:
  - de la tarea 2: `resolveCharacter`, `CharacterVisual`, `CharacterRef` y `KitService`;
  - de la tarea 1: `parseStoredAvatar`.
- Produces en `kit-phaser.ts`:
  - `KIT_ORIGIN_X` (0,5) y `KIT_ORIGIN_Y` (68/72);
  - `kitSheetKey(visual, sheet)`, `kitAnimKey(visual, sheet, view)` y `kitFrameIndex(sheet, view, col = 0)`;
  - `addComposedSheets(scene, visual, toCanvas?)` y `queueCharacterSheets(scene, visual, toCanvas?)`;
  - `addRgbaTexture(scene, key, image, toCanvas?, frames?)`;
  - `ensureCharacterAnims(scene, visual): boolean` y `playKitPose(sprite, visual, view, walking, reduceMotion)`.
- Produces en `world-characters.util.ts`:
  - `KIT_BODY_HEIGHT = 64`, `KIT_LABEL_OFFSET_Y = -68`, `KIT_HINT_OFFSET_Y = -82` y `KIT_ICON_OFFSET_Y = -66`;
  - `playerCharacterRef(stored: string | null): CharacterRef`.
- Produces en `game-world.component.ts`: `WorldCallbacks.kit: KitBundle | null`.

- [ ] **Step 1: Escribe las pruebas que fallan**

```ts
// frontend/src/app/features/character/kit/kit-phaser.spec.ts
import { resolveCharacter } from './character-visual.resolver';
import {
  addRgbaTexture,
  ensureCharacterAnims,
  kitFrameIndex,
  playKitPose,
  queueCharacterSheets,
} from './kit-phaser';
import { testKitBundle } from './testing/kit-testing';

interface AnimConfig { key: string; frames: { start: number; end: number }; frameRate: number; repeat: number }

/** Escena mínima: cargar una hoja la deja disponible al instante. */
function fakeScene() {
  const textures = new Set<string>();
  const anims = new Map<string, AnimConfig>();
  const raw = {
    textures: {
      exists: (key: string) => textures.has(key),
      addSpriteSheet: jest.fn((key: string) => { textures.add(key); }),
      addCanvas: jest.fn((key: string) => { textures.add(key); }),
    },
    load: { spritesheet: jest.fn((key: string) => { textures.add(key); }) },
    anims: {
      exists: (key: string) => anims.has(key),
      create: jest.fn((config: AnimConfig) => { anims.set(config.key, config); }),
      generateFrameNumbers: (_key: string, range: { start: number; end: number }) => range,
    },
  };
  return { scene: raw as never, raw, anims };
}

const bundle = testKitBundle();
const valentina = resolveCharacter(bundle, { kind: 'receta', recipeId: 'valentina' });
const custom = resolveCharacter(bundle, {
  kind: 'jugador',
  avatar: { schemaVersion: 2, mode: 'personalizado', complexion: 'a', skin: 'piel-1', hair: 'mono', hairColor: 'rubio', accessories: [], bata: true },
});
const canvas = () => ({}) as HTMLCanvasElement;

describe('kit-phaser', () => {
  it('una receta publicada se pide por URL, en cuadros de 48×72', () => {
    const { scene, raw } = fakeScene();
    queueCharacterSheets(scene, valentina, canvas);
    expect(raw.load.spritesheet).toHaveBeenCalledWith('kit-valentina-idle', '/assets/characters/kit/valentina/idle.png', { frameWidth: 48, frameHeight: 72 });
    expect(raw.load.spritesheet).toHaveBeenCalledWith('kit-valentina-walk', '/assets/characters/kit/valentina/walk.png', { frameWidth: 48, frameHeight: 72 });
    expect(raw.textures.addSpriteSheet).not.toHaveBeenCalled();
  });

  it('el avatar compuesto se registra desde el lienzo, sin red', () => {
    const { scene, raw } = fakeScene();
    queueCharacterSheets(scene, custom, canvas);
    expect(raw.load.spritesheet).not.toHaveBeenCalled();
    expect(raw.textures.addSpriteSheet).toHaveBeenCalledTimes(2);
  });

  it('sin lienzo (sin contexto 2D) no registra nada y las animaciones no quedan listas', () => {
    const { scene } = fakeScene();
    queueCharacterSheets(scene, custom, () => null);
    expect(ensureCharacterAnims(scene, custom)).toBe(false);
    expect(addRgbaTexture(scene, 'icono', { width: 1, height: 1, rgba: new Uint8Array(4) }, () => null)).toBe(false);
  });

  it('reposo de 4 cuadros a 4 fps y caminata de 6 a 10 fps, en la fila de cada vista', () => {
    const { scene, anims } = fakeScene();
    queueCharacterSheets(scene, valentina, canvas);
    expect(ensureCharacterAnims(scene, valentina)).toBe(true);
    expect(anims.size).toBe(8);
    expect(anims.get('kit-valentina-walk-right')).toMatchObject({ frames: { start: 12, end: 17 }, frameRate: 10, repeat: -1 });
    expect(anims.get('kit-valentina-idle-up')).toMatchObject({ frames: { start: 12, end: 15 }, frameRate: 4, repeat: -1 });
    expect(kitFrameIndex('walk', 'left', 3)).toBe(9);
  });

  it('no repite texturas ni animaciones', () => {
    const { scene, raw } = fakeScene();
    queueCharacterSheets(scene, valentina, canvas);
    queueCharacterSheets(scene, valentina, canvas);
    ensureCharacterAnims(scene, valentina);
    ensureCharacterAnims(scene, valentina);
    expect(raw.load.spritesheet).toHaveBeenCalledTimes(2);
    expect(raw.anims.create).toHaveBeenCalledTimes(8);
  });

  it('la pose: caminata o reposo de la vista; con movimiento reducido, cuadro fijo', () => {
    const sprite = { play: jest.fn(), setTexture: jest.fn(), anims: { stop: jest.fn() } };
    playKitPose(sprite as never, valentina, 'left', true, false);
    expect(sprite.play).toHaveBeenLastCalledWith('kit-valentina-walk-left', true);
    playKitPose(sprite as never, valentina, 'down', false, false);
    expect(sprite.play).toHaveBeenLastCalledWith('kit-valentina-idle-down', true);
    playKitPose(sprite as never, valentina, 'up', true, true);
    expect(sprite.anims.stop).toHaveBeenCalled();
    expect(sprite.setTexture).toHaveBeenLastCalledWith('kit-valentina-idle', 12);
  });
});
```

```ts
// frontend/src/app/features/simulator/world-characters.util.spec.ts
import { KIT_BODY_HEIGHT, KIT_HINT_OFFSET_Y, KIT_ICON_OFFSET_Y, KIT_LABEL_OFFSET_Y, playerCharacterRef } from './world-characters.util';

describe('world-characters.util — jugador', () => {
  it('sin nada guardado, Valentina sin bata', () => {
    expect(playerCharacterRef(null)).toEqual({ kind: 'jugador', avatar: { schemaVersion: 2, mode: 'elenco', recipeId: 'valentina', bata: false } });
  });

  it('un v1 guardado se migra al vuelo (el almacén lo reescribe en la tarea 13)', () => {
    expect(playerCharacterRef(JSON.stringify({ castId: 'david', uniform: 'con-bata' })))
      .toEqual({ kind: 'jugador', avatar: { schemaVersion: 2, mode: 'elenco', recipeId: 'david', bata: true } });
  });

  it('nombre, aviso e icono quedan sobre la cabeza más alta que admite la biblia (66 px)', () => {
    expect(KIT_BODY_HEIGHT).toBe(64);
    expect(-KIT_LABEL_OFFSET_Y).toBeGreaterThan(66);
    expect(KIT_HINT_OFFSET_Y).toBeLessThan(KIT_LABEL_OFFSET_Y);
    expect(-KIT_ICON_OFFSET_Y).toBeGreaterThanOrEqual(66);
  });
});
```

```ts
// frontend/src/app/features/simulator/game-world.kit.contract.spec.ts
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

/** Cuerpo de un método de la escena (hasta su llave de cierre a 2 espacios). */
function body(signature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`no encuentro ${signature}`);
  return source.slice(start, source.indexOf('\n  }\n', start));
}

describe('game-world: el jugador sale del kit (spec §8.2)', () => {
  it('se resuelve con el punto único y su hoja se pide en preload', () => {
    expect(source).toContain('this.playerVisual = resolveCharacter(kit, playerCharacterRef(stored));');
    expect(source).toContain('queueCharacterSheets(this, this.playerVisual);');
    expect(source).not.toMatch(/resolvePlayerVisual|v1SheetKey|playerCastId|AVATAR_TEXTURE_KEY|avatarSpecs/);
  });

  it('el sprite va a escala 1, con los pies en (24,68) y sin espejo', () => {
    const create = body('private createPlayer(x: number, y: number) {');
    expect(create).toContain('.setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y)');
    expect(create).not.toMatch(/setScale|setFlipX|registerLivingActor/);
  });

  it('la pose del jugador la pone el kit (4 filas reales)', () => {
    expect(body('private applyPlayerPose(')).toContain('playKitPose(this.playerSprite, this.playerVisual, direction, walking, this.callbacks.reduceMotion)');
    expect(source).not.toMatch(/playWalkAnimation|setIdleFrame|createAnimations\(/);
  });

  it('el paquete del kit llega antes que Phaser, y sin él el juego arranca igual', () => {
    expect(source).toMatch(/this\.kit\.load\(\)\.then\(bundle => bundle, \(\) => null\)\.then\(bundle => \{[\s\S]*?this\.startGame\(bundle\)/);
    expect(source).toMatch(/new DataDrivenWorldScene\(\{\s*reduceMotion,\s*kit,/);
  });
});
```

- [ ] **Step 2: Córrelas y mira que fallen**

Run: `npm test -- --runInBand "kit-phaser|world-characters|game-world.kit"`
Expected: FAIL. Faltan los módulos, y el contrato no encuentra `playerCharacterRef`.

- [ ] **Step 3: Escribe `kit-phaser.ts` y `world-characters.util.ts`**

```ts
// frontend/src/app/features/character/kit/kit-phaser.ts
/**
 * Hojas del kit en Phaser: texturas, animaciones de reposo y caminata por vista y la
 * pose de un actor. Sin escalas ni espejos: las 4 filas son reales y el zoom entero
 * lo pone la cámara (spec §8.2-8.3).
 */
import type Phaser from 'phaser';

import type { CharacterVisual } from './character-visual.resolver';
import { FRAME, RgbaImage, SHEETS, SHEET_IDS, SheetId, VIEW_ROWS, ViewId } from './kit-engine';
import { rgbaToCanvas } from './kit-raster';

/** Pies del cuadro del kit: (24, 68) de 48×72. */
export const KIT_ORIGIN_X = FRAME.pivotX / FRAME.width;
export const KIT_ORIGIN_Y = FRAME.pivotY / FRAME.height;

type ToCanvas = (image: RgbaImage) => HTMLCanvasElement | null;
type Textures = Pick<Phaser.Scene, 'textures'>;

export function kitSheetKey(visual: CharacterVisual, sheet: SheetId): string {
  return `${visual.key}-${sheet}`;
}

export function kitAnimKey(visual: CharacterVisual, sheet: SheetId, view: ViewId): string {
  return `${visual.key}-${sheet}-${view}`;
}

/** Índice del cuadro `col` de la fila de `view` en una hoja. */
export function kitFrameIndex(sheet: SheetId, view: ViewId, col = 0): number {
  return VIEW_ROWS.indexOf(view) * SHEETS[sheet].frames + col;
}

/** Textura desde una RgbaImage: hoja de cuadros si se da `frames`, imagen suelta si no. false si no hay lienzo. */
export function addRgbaTexture(
  scene: Textures,
  key: string,
  image: RgbaImage,
  toCanvas: ToCanvas = rgbaToCanvas,
  frames?: { frameWidth: number; frameHeight: number },
): boolean {
  if (scene.textures.exists(key)) return true;
  const canvas = toCanvas(image);
  if (!canvas) return false;
  if (frames) scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, frames);
  else scene.textures.addCanvas(key, canvas);
  return true;
}

/** Registra ya las hojas compuestas (avatar personalizado o autorado); las URL no se tocan. */
export function addComposedSheets(scene: Textures, visual: CharacterVisual, toCanvas: ToCanvas = rgbaToCanvas): void {
  for (const sheet of SHEET_IDS) {
    const source = visual[sheet];
    if (source.kind === 'rgba') {
      addRgbaTexture(scene, kitSheetKey(visual, sheet), source.image, toCanvas, { frameWidth: FRAME.width, frameHeight: FRAME.height });
    }
  }
}

/** En preload: pide por URL las hojas publicadas y registra las compuestas. */
export function queueCharacterSheets(scene: Pick<Phaser.Scene, 'load' | 'textures'>, visual: CharacterVisual, toCanvas: ToCanvas = rgbaToCanvas): void {
  addComposedSheets(scene, visual, toCanvas);
  for (const sheet of SHEET_IDS) {
    const source = visual[sheet];
    const key = kitSheetKey(visual, sheet);
    if (source.kind === 'url' && !scene.textures.exists(key)) {
      scene.load.spritesheet(key, source.url, { frameWidth: FRAME.width, frameHeight: FRAME.height });
    }
  }
}

/** Tras la carga: reposo y caminata de cada vista. false si falta alguna hoja (→ respaldo del actor). */
export function ensureCharacterAnims(scene: Pick<Phaser.Scene, 'textures' | 'anims'>, visual: CharacterVisual): boolean {
  if (!SHEET_IDS.every(sheet => scene.textures.exists(kitSheetKey(visual, sheet)))) return false;
  for (const sheet of SHEET_IDS) {
    for (const view of VIEW_ROWS) {
      const key = kitAnimKey(visual, sheet, view);
      if (scene.anims.exists(key)) continue;
      const start = kitFrameIndex(sheet, view);
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(kitSheetKey(visual, sheet), { start, end: start + SHEETS[sheet].frames - 1 }),
        frameRate: SHEETS[sheet].fps,
        repeat: -1,
      });
    }
  }
  return true;
}

/** Pose de un actor: reposo (respira) o caminata en la vista. Con movimiento reducido, cuadro fijo de reposo. */
export function playKitPose(sprite: Phaser.GameObjects.Sprite, visual: CharacterVisual, view: ViewId, walking: boolean, reduceMotion: boolean): void {
  if (reduceMotion) {
    sprite.anims.stop();
    sprite.setTexture(kitSheetKey(visual, 'idle'), kitFrameIndex('idle', view));
    return;
  }
  sprite.play(kitAnimKey(visual, walking ? 'walk' : 'idle', view), true);
}
```

```ts
// frontend/src/app/features/simulator/world-characters.util.ts
/**
 * Quién es cada personaje del mundo (spec §8.2): el jugador, los NPC de escenario,
 * las personas del caso, el guía y los figurantes, como CharacterRef del kit.
 * Lógica pura; game-world solo dibuja lo que esto resuelve.
 */
import { parseStoredAvatar } from '../character/kit/avatar-v2';
import type { CharacterRef } from '../character/kit/character-visual.resolver';

/** Alto del cuerpo sobre los pies en el cuadro del kit (pies en y = 68; tope de la cabeza en y ≈ 4). */
export const KIT_BODY_HEIGHT = 64;
/** Nombre y aviso «E» sobre la cabeza, e icono del estado clínico justo encima de ella. */
export const KIT_LABEL_OFFSET_Y = -(KIT_BODY_HEIGHT + 4);
export const KIT_HINT_OFFSET_Y = KIT_LABEL_OFFSET_Y - 14;
export const KIT_ICON_OFFSET_Y = -(KIT_BODY_HEIGHT + 2);

/** El jugador según lo guardado (v1 o v2; lo inválido cae al valor por defecto). */
export function playerCharacterRef(stored: string | null): CharacterRef {
  return { kind: 'jugador', avatar: parseStoredAvatar(stored).avatar };
}
```

- [ ] **Step 4: El jugador del mundo con el kit**

Todos estos cambios van en `game-world.component.ts`.

1. Imports. Añade:

```ts
import type { KitBundle } from '../character/kit/kit-engine';
import { CharacterVisual, resolveCharacter } from '../character/kit/character-visual.resolver';
import { KIT_ORIGIN_X, KIT_ORIGIN_Y, ensureCharacterAnims, kitFrameIndex, kitSheetKey, playKitPose, queueCharacterSheets } from '../character/kit/kit-phaser';
import { KitService } from '../character/kit/kit.service';
import { playerCharacterRef } from './world-characters.util';
```

Y quita los que el jugador ya no usa:
- todo el import de `./v1-avatar.util` y `createV1WalkAnimations`;
- de `./phaser-avatar-renderer`: `AVATAR_ANIM_KEYS`, `AVATAR_DISPLAY_SCALE`, `AVATAR_TEXTURE_KEY`, `composeAvatarTexture`, `createAvatarAnimations` y `AvatarLayerSpec`;
- `resolveCastId` (de `./baked-cast.util`) y `parseAvatar`.

Los imports que todavía usan los NPC se quedan hasta la tarea 7.

2. `WorldCallbacks` gana un campo:

```ts
  /** Paquete del kit (null si no cargó: los actores caen a su marcador). */
  kit: KitBundle | null;
```

3. Campos de `DataDrivenWorldScene`:
   - Borra `avatarSpecs`, `playerCastId`, `playerV1Id`, `playerTextureKey` y `avatarReady`.
   - Añade:

```ts
  /** Visual del jugador en el kit (null si no hay paquete). */
  private playerVisual: CharacterVisual | null = null;
  /** Las hojas y animaciones del jugador están listas (si no, marcador geométrico). */
  private playerKitReady = false;
```

   - `lastPose` pasa a incluir el movimiento reducido:

```ts
  /** Última pose aplicada — la animación solo cambia si dirección, caminar o movimiento reducido cambiaron. */
  private lastPose: { direction: PlayerDirection | null; walking: boolean; reduce: boolean } = { direction: null, walking: false, reduce: false };
```

4. En `preload()`, reemplaza el bloque `// ── Avatar modular del estudiante …` (desde `const avatarConfig = parseAvatar(` hasta el final del `for (const spec of this.avatarSpecs)`) por:

```ts
    // ── Jugador del kit (spec §8.2): receta publicada (PNG) o avatar compuesto (lienzo) ──
    const kit = this.callbacks.kit;
    if (kit) {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(AVATAR_STORAGE_KEY) : null;
      this.playerVisual = resolveCharacter(kit, playerCharacterRef(stored));
      queueCharacterSheets(this, this.playerVisual);
    }
```

5. En `create()`:
   - Borra `this.createAnimations();` y el bloque `// Elenco horneado primero…` hasta su `}`. En su lugar va:

```ts
    this.playerKitReady = this.playerVisual !== null && ensureCharacterAnims(this, this.playerVisual);
```

   - Borra también el método `createAnimations()`. Sus animaciones Kenney `walk-*` solo las usaba el respaldo del jugador.

6. `createPlayer` se reemplaza entero:

```ts
  private createPlayer(x: number, y: number) {
    this.lastPose = { direction: null, walking: false, reduce: this.callbacks.reduceMotion };
    const visual = this.playerVisual;
    if (visual && this.playerKitReady) {
      // Contrato de pies (player-motion.util): (x, y) del contenedor = pies; el cuadro del
      // kit trae los pies en (24, 68). Sombra en dos pasos bajo los pies, a escala 1.
      const shadowSoft = this.add.ellipse(0, 0, 30, 9, 0x000000, .15);
      const shadow = this.add.ellipse(0, 0, 20, 6, 0x000000, .27);
      const sprite = this.add.sprite(0, 0, kitSheetKey(visual, 'idle'), kitFrameIndex('idle', 'down'))
        .setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y);
      this.player = this.add.container(x, y, [shadowSoft, shadow, sprite]).setDepth(actorDepth(y));
      this.playerSprite = sprite;
      playKitPose(sprite, visual, 'down', false, this.callbacks.reduceMotion);
      return;
    }
    // Sin hoja del kit (no cargó): marcador geométrico con el mismo contrato de pies.
    const shadow = this.add.ellipse(0, 0, 16, 5, 0x000000, .22);
    const body = this.add.rectangle(0, -14, 24, 32, 0x4f7cac, 1).setStrokeStyle(2, 0xffffff, .9);
    const head = this.add.circle(0, -36, 12, 0xf4c6a8, 1).setStrokeStyle(2, 0xffffff, .85);
    const badge = this.add.rectangle(0, -10, 12, 7, 0xffffff, .9);
    this.player = this.add.container(x, y, [shadow, body, head, badge]).setDepth(actorDepth(y));
    this.playerSprite = undefined;
  }
```

7. Poses:
   - Borra `playWalkAnimation` y `setIdleFrame`. Búscalos con `grep -n "playWalkAnimation\|setIdleFrame"`: no debe quedar ninguna llamada.
   - `applyPlayerPose` se reemplaza:

```ts
  /**
   * Aplica la pose SOLO si cambió (dirección, caminar o movimiento reducido): la animación no
   * se reinicia en cada update y el reposo es inmediato al soltar teclas o chocar con una pared.
   */
  private applyPlayerPose(direction: PlayerDirection, walking: boolean): void {
    const reduce = this.callbacks.reduceMotion;
    if (this.lastPose.direction === direction && this.lastPose.walking === walking && this.lastPose.reduce === reduce) return;
    this.lastPose = { direction, walking, reduce };
    if (this.playerSprite && this.playerVisual && this.playerKitReady) {
      playKitPose(this.playerSprite, this.playerVisual, direction, walking, this.callbacks.reduceMotion);
    }
  }
```

8. `GameWorldComponent`:
   - Añade los campos:

```ts
  private readonly kit = inject(KitService);
  /** El componente se destruyó mientras llegaba el paquete del kit. */
  private destroyed = false;
  private booting = false;
```

   - Agrega `inject` al import de `@angular/core`.
   - La primera línea de `ngOnDestroy()` pasa a ser `this.destroyed = true;`.
   - `boot()` ahora espera el paquete del kit. Su cuerpo anterior se mueve íntegro a `startGame(kit)` y le pasa `kit` a la escena:

```ts
  private boot() {
    if (!this.gameHost || this.phaserGame || this.booting) return;
    this.booting = true;
    // El paquete del kit llega antes que Phaser; si falla, el juego arranca igual y los
    // actores caen a su marcador (KitService lo reintenta en el próximo boot).
    this.kit.load().then(bundle => bundle, () => null).then(bundle => {
      this.booting = false;
      if (!this.destroyed && this.gameHost && !this.phaserGame) this.startGame(bundle);
    });
  }

  private startGame(kit: KitBundle | null) {
    const reduceMotion = this.effectiveReduceMotion();
    this.zone.runOutsideAngular(() => {
      this.scene = new DataDrivenWorldScene({
        reduceMotion,
        kit,
        onReady:       () => this.zone.run(() => {
          // … (el resto de callbacks y el cuerpo del boot() anterior, sin cambios)
```

   - El `window.setTimeout(() => { this.scene?.setScenarioConfig(…) … }, 0);` del final queda dentro de `startGame`.

9. Specs. Busca los que creen `GameWorldComponent` o un padre que lo renderice: `grep -rln "GameWorldComponent" src/app --include=*.spec.ts`. En su TestBed, agrega `{ provide: KitService, useValue: fakeKitService() }`, importado de `../character/kit/testing/kit-testing`.

- [ ] **Step 5: Córrelas y mira que pasen**

Run: `npm test -- --runInBand "kit-phaser|world-characters|game-world"`

Expected: PASS: kit-phaser, 6 pruebas; world-characters, 3; el contrato, 4. Los contratos de game feel y de render siguen verdes.

- [ ] **Step 6: Cierre y commit**

Run: `npm test -- --runInBand` y `npm run build`
Expected: todo verde.

```bash
git add src/app/features/character/kit/kit-phaser.ts src/app/features/character/kit/kit-phaser.spec.ts \
  src/app/features/simulator/world-characters.util.ts src/app/features/simulator/world-characters.util.spec.ts \
  src/app/features/simulator/game-world.component.ts src/app/features/simulator/game-world.kit.contract.spec.ts
git commit -m "feat(personajes): el jugador del mundo sale del kit, a escala 1 y en 4 vistas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Los NPC de escenario nombran su receta (`recipeId`)

**Files:**
- Modify: `frontend/src/assets/game/scenarios/*.json` (con un script de un solo uso)
- Modify: `frontend/src/app/core/models/simulation.model.ts:790-808` (`NpcConfig`)
- Modify: `frontend/character-kit/catalog.json` (sale `scenarioNpcs`)
- Modify: `frontend/src/app/features/character/kit/kit-engine.ts:195` (`Catalog` pierde `scenarioNpcs`)
- Modify: `frontend/scripts/character-kit/coverage-sources.mjs`, `coverage.mjs`, `check.mjs:108` y `coverage.test.mjs`
- Modify: `frontend/src/app/features/simulator/scenario-npc-configs.spec.ts` y `case-pdf-rooms.spec.ts`
- Regenera: `frontend/src/assets/characters/kit/` (`npm run kit:build`, porque cambia el catálogo)

**Interfaces:**
- Consumes: `testKitBundle` (tarea 2).
- Produces:
  - `NpcConfig.recipeId: string`. `avatarPresetKey` y `frameIndex` quedan opcionales y marcados `@deprecated`; se borran en la tarea 7.
  - `checkScenarioRecipes(recipes, refs): string[]` en `coverage.mjs`.
  - `referencedKeys(root).scenarioNpcs` pasa a ser un `Map<string, string | null>`: NPC → receta.

**Ruling:** el spec §8.1 dice que el par `avatarPresetKey`/`frameIndex` «pasa a ser `recipeId`».
- Decisión: el `recipeId` vive en cada NPC del escenario y se borra `catalog.scenarioNpcs`. Dejar los dos sería tener dos fuentes de la misma correspondencia.
- Qué lo protege: la cobertura exige que cada NPC nombre una receta existente.
- Costo si está mal: volver a poner el mapa en el catálogo.

- [ ] **Step 1: Escribe las pruebas que fallan**

En `scripts/character-kit/coverage.test.mjs`, importa `checkScenarioRecipes` de `./coverage.mjs` y añade:

```js
test('cada NPC de escenario nombra una receta que existe', () => {
  const bundle = buildBundle();
  const refs = referencedKeys(REPO_ROOT);
  assert.deepEqual(checkScenarioRecipes(bundle.recipes, refs), []);
  refs.scenarioNpcs.set('npc-nuevo', null);
  refs.scenarioNpcs.set('npc-raro', 'no-existe');
  assert.deepEqual(checkScenarioRecipes(bundle.recipes, refs), [
    'escenario: el NPC «npc-nuevo» no tiene recipeId',
    'escenario: el NPC «npc-raro» usa la receta inexistente «no-existe»',
  ]);
  assert.equal(bundle.catalog.scenarioNpcs, undefined);
});
```

En `src/app/features/simulator/scenario-npc-configs.spec.ts`:
- cambia `import { NPC_AVATAR_PRESETS } from './npc-avatar-presets';` por `import { testKitBundle } from '../character/kit/testing/kit-testing';`;
- reemplaza la prueba `'todo avatarPresetKey referencia un preset real'` por esta:

```ts
  it('cada NPC nombra una receta del kit (spec §8.1)', () => {
    const recipes = testKitBundle().recipes;
    for (const { file, npc } of allNpcs()) {
      expect(`${file}:${npc.key}:${recipes[npc.recipeId] ? 'ok' : npc.recipeId}`).toBe(`${file}:${npc.key}:ok`);
      expect('avatarPresetKey' in npc || 'frameIndex' in npc).toBe(false);
      expect(npc.dialogue.lines.length).toBeGreaterThan(0);
    }
  });
```

- en `'el caso principal tiene ≥4 NPCs modulares…'`, cambia `urgencias.filter(n => n.avatarPresetKey)` por `urgencias.filter(n => n.recipeId)`.

En `src/app/features/simulator/case-pdf-rooms.spec.ts`:
- cambia el import de `NPC_AVATAR_PRESETS` por el de `testKitBundle`, igual que arriba;
- el cuerpo de `'escenarios JSON: presets reales, behaviors válidos y diálogo presente'` pasa a ser:

```ts
    const recipes = testKitBundle().recipes;
    for (const { file, npc } of allNpcs()) {
      expect(`${file}:${npc.key}:${recipes[npc.recipeId] ? 'ok' : npc.recipeId}`).toBe(`${file}:${npc.key}:ok`);
      expect(npc.dialogue.lines.length).toBeGreaterThan(0);
      if (npc.motion) expect(BEHAVIORS).toContain(npc.motion.behavior);
    }
```

- en `'todas las salas tienen NPCs modulares…'`, los dos `n.avatarPresetKey` pasan a `n.recipeId`.

- [ ] **Step 2: Córrelas y mira que fallen**

Run: `npm run test:kit` y `npm test -- --runInBand "scenario-npc-configs|case-pdf-rooms"`
Expected: FAIL. `checkScenarioRecipes` no existe, y los NPC todavía tienen `avatarPresetKey` y les falta `recipeId`.

- [ ] **Step 3: Reescribe los escenarios con un script de un solo uso**

Los JSON de escenario no son canónicos: tienen arreglos en línea y fines de línea CRLF. Por eso el script cambia línea por línea y después verifica el resultado. Guárdalo en el scratchpad y córrelo desde `frontend/`.

```js
// <scratchpad>/npc-recipe-id.cjs — node <scratchpad>/npc-recipe-id.cjs (desde frontend/)
const fs = require('fs');
const catalog = JSON.parse(fs.readFileSync('character-kit/catalog.json', 'utf8'));
const dir = 'src/assets/game/scenarios';
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const path = `${dir}/${file}`;
  const original = fs.readFileSync(path, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const out = [];
  let lastKey = null;
  for (const line of original.split(eol)) {
    const key = line.match(/^\s*"key":\s*"([^"]+)"/);
    if (key) lastKey = key[1];
    const frame = line.match(/^(\s*)"frameIndex":\s*\d+(,?)\s*$/);
    if (frame) {
      const recipeId = catalog.scenarioNpcs[lastKey];
      if (!recipeId) throw new Error(`${file}: el NPC ${lastKey} no está en catalog.scenarioNpcs`);
      out.push(`${frame[1]}"recipeId": "${recipeId}"${frame[2]}`);
      continue;
    }
    if (/^\s*"avatarPresetKey":\s*"[^"]+",?\s*$/.test(line)) continue;
    out.push(line);
  }
  // Si avatarPresetKey era la última propiedad, la anterior quedó con una coma colgando.
  const text = out.join(eol).replace(/,(\s*\r?\n\s*[}\]])/g, '$1');
  const json = JSON.parse(text);
  for (const room of json.rooms ?? []) {
    for (const npc of room.npcs ?? []) {
      if ('avatarPresetKey' in npc || 'frameIndex' in npc) throw new Error(`${file}: ${npc.key} quedó a medias`);
      if (npc.recipeId !== catalog.scenarioNpcs[npc.key]) throw new Error(`${file}: ${npc.key} con receta equivocada`);
    }
  }
  if (text !== original) {
    fs.writeFileSync(path, text);
    console.log('reescrito', file);
  }
}
```

Expected: 10 archivos reescritos (todos menos `intervention-rules.json`). Revisa `git diff --stat src/assets/game/scenarios`: solo deben cambiar las líneas `frameIndex` y `avatarPresetKey`.

- [ ] **Step 4: Modelo, catálogo y cobertura**

1. En `NpcConfig` (`simulation.model.ts`), reemplaza `frameIndex`, `avatarPresetKey` y `scale` por:

```ts
  /** Receta del kit que lo dibuja (spec §8.1; antes avatarPresetKey + frameIndex). */
  recipeId: string;
  /** @deprecated Ya no se lee; se borra en la tarea 7 del plan 2. */
  avatarPresetKey?: NpcAvatarPresetKey;
  /** @deprecated Ya no se lee; se borra en la tarea 7 del plan 2. */
  frameIndex?: number;
```

2. En `character-kit/catalog.json`, borra el bloque `"scenarioNpcs": { … },` entero.
3. En `kit-engine.ts`, borra `scenarioNpcs: Record<string, string>;` de `Catalog`.
4. En `coverage-sources.mjs`, reemplaza `scenarioNpcIds` por la función de abajo, y en `referencedKeys` escribe `scenarioNpcs: scenarioNpcRecipes(root),`.

```js
/** NPC de los escenarios → su receta (null si le falta `recipeId`). */
function scenarioNpcRecipes(root) {
  const dir = path.join(root, COVERAGE_SOURCES.scenarios);
  const recipes = new Map();
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const json = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    for (const room of json.rooms ?? []) {
      for (const npc of room.npcs ?? []) recipes.set(npc.key, typeof npc.recipeId === 'string' ? npc.recipeId : null);
    }
  }
  return recipes;
}
```

5. En `coverage.mjs`, saca `['scenarioNpcs', 'el NPC de escenario'],` de `MAPS` y añade:

```js
/** Cada NPC de escenario nombra una receta que existe (spec §8.1: el par preset/frameIndex pasó a `recipeId`). */
export function checkScenarioRecipes(recipes, refs) {
  const errors = [];
  for (const [key, recipeId] of [...refs.scenarioNpcs].sort(([a], [b]) => a.localeCompare(b))) {
    if (!recipeId) errors.push(`escenario: el NPC «${key}» no tiene recipeId`);
    else if (!recipes[recipeId]) errors.push(`escenario: el NPC «${key}» usa la receta inexistente «${recipeId}»`);
  }
  return errors;
}
```

6. En `check.mjs`, importa `checkScenarioRecipes` y reemplaza la línea 108 por:

```js
  const refs = referencedKeys(REPO_ROOT);
  errors.push(...checkCatalogKeys(bundle.catalog, refs));
  errors.push(...checkScenarioRecipes(bundle.recipes, refs));
```

7. Run: `npm run kit:build`. Hace falta porque `kit.json` lleva el catálogo.

- [ ] **Step 5: Córrelas y mira que pasen**

Run: `npm run test:kit`, `npm run kit:check` y `npm test -- --runInBand "scenario-npc-configs|case-pdf-rooms"`
Expected: las pruebas del kit, todas verdes (una más que antes); `kit:check` con «0 errores»; jest, PASS.

- [ ] **Step 6: Cierre y commit**

Run: `npm test -- --runInBand` y `npm run build`
Expected: todo verde. Hasta la tarea 7, los NPC de escenario se dibujan con el respaldo viejo: todavía nadie lee su receta.

```bash
git add src/assets/game/scenarios src/app/core/models/simulation.model.ts character-kit/catalog.json \
  src/app/features/character/kit/kit-engine.ts scripts/character-kit src/assets/characters/kit \
  src/app/features/simulator/scenario-npc-configs.spec.ts src/app/features/simulator/case-pdf-rooms.spec.ts
git commit -m "feat(personajes): los NPC de escenario nombran su receta del kit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: NPC, personas, guía y figurantes del kit; sin tintes ni deformaciones — PARADA F4

**Files:**
- Create: `frontend/src/app/features/simulator/patient-state-icon.util.ts`
- Modify: `frontend/src/app/features/simulator/world-characters.util.ts` (referencias de NPC, PERSON, guía y figurantes)
- Modify: `frontend/src/app/features/simulator/game-world.component.ts`
- Modify: `frontend/src/app/core/models/simulation.model.ts` (`NpcConfig` pierde los campos `@deprecated`)
- Test: `frontend/src/app/features/simulator/patient-state-icon.util.spec.ts` (nuevo), `world-characters.util.spec.ts`, `game-world.kit.contract.spec.ts`

**Interfaces:**
- Consumes:
  - de la tarea 5: todo `kit-phaser.ts` y los desplazamientos de `world-characters.util.ts`;
  - de la tarea 2: `resolveRecipeId` y `resolveCharacter`.
- Produces:
  - en `world-characters.util.ts`: `npcCharacterRef(npc)`, `personCharacterRef(bundle, object)`, `guideCharacterRef(bundle, guideName)`, `extrasCharacterRef(bundle)` y `PATIENT_RECIPE_ID = 'sobreviviente'`;
  - en `patient-state-icon.util.ts`: `PatientIconKind`, `PATIENT_ICON_KINDS`, `PATIENT_ICON_GRIDS`, `patientIconKind(state)`, `patientIconImage(kind): RgbaImage` y `patientIconKey(kind)`.

**Ruling:** el icono del estado clínico va en todo actor, NPC o PERSON, que se dibuje con la receta `sobreviviente`.
- Antes, el tinte se elegía por el prefijo de clave `paciente-` más una lista fija de presets.
- Resultado: el mismo conjunto de actores, más `sobreviviente-espera`.
- Costo si está mal: cambiar una condición.

**Ruling:** las personas del caso (PERSON) ya no flotan.
- Su vida es la respiración de la hoja de reposo.
- El vaivén de 3 px se queda en herramientas y objetos.
- Costo si está mal: una línea en `applyAmbientLife`.

- [ ] **Step 1: Escribe las pruebas que fallan**

```ts
// frontend/src/app/features/simulator/patient-state-icon.util.spec.ts
import { readFileSync } from 'fs';
import { join } from 'path';

import { PATIENT_ICON_KINDS, patientIconImage, patientIconKey, patientIconKind } from './patient-state-icon.util';

const palette = new Set<string>(JSON.parse(readFileSync(join(__dirname, '../../../../character-kit/palette.v2.json'), 'utf8')).masterColors);
const hex = (rgba: Uint8Array, i: number) => `#${[0, 1, 2].map(k => rgba[i + k]!.toString(16).padStart(2, '0')).join('')}`;

describe('icono del estado clínico (decisión 13)', () => {
  it.each([
    [{ crisisLevel: 70, trustLevel: 90, emotionalState: 90 }, 'crisis'],
    [{ crisisLevel: 10, trustLevel: 60, emotionalState: 60 }, 'confianza'],
    [{ crisisLevel: 10, trustLevel: 20, emotionalState: 25 }, 'decaida'],
    [{ crisisLevel: 69, trustLevel: 59, emotionalState: 40 }, null],
  ])('%j → %s (los umbrales del antiguo tinte)', (state, expected) => {
    expect(patientIconKind(state)).toBe(expected);
  });

  it('pixel art del kit: alfa binario, colores de palette.v2 y mismo tamaño', () => {
    const images = PATIENT_ICON_KINDS.map(patientIconImage);
    for (const image of images) {
      expect([image.width, image.height]).toEqual([7, 8]);
      for (let i = 0; i < image.rgba.length; i += 4) {
        expect([0, 255]).toContain(image.rgba[i + 3]);
        if (image.rgba[i + 3]) expect(palette.has(hex(image.rgba, i))).toBe(true);
      }
    }
    expect(new Set(images.map(image => image.rgba.join(','))).size).toBe(3);
    expect(patientIconKey('crisis')).toBe('patient-icon-crisis');
  });
});
```

En `world-characters.util.spec.ts`, amplía el import con `extrasCharacterRef`, `guideCharacterRef`, `npcCharacterRef` y `personCharacterRef`, más `testKitBundle` (de `../character/kit/testing/kit-testing`). Después añade:

```ts
describe('world-characters.util — NPC, personas, guía y figurantes', () => {
  const bundle = testKitBundle();
  const recipe = (recipeId: string) => ({ kind: 'receta', recipeId });

  it('un NPC de escenario es su receta', () => {
    expect(npcCharacterRef({ recipeId: 'seguridad' })).toEqual(recipe('seguridad'));
  });

  it.each([
    ['la receta del actor', { key: 'familia-crisis' }, recipe('abuela-familia')],
    ['la receta que eligió el docente', { key: 'npc-1', metadata: { recipeId: 'seguridad' } }, recipe('seguridad')],
    ['la plantilla vieja gana a su avatar copiado', { key: 'npc-2', metadata: { npcTemplateId: 'hombre-adulto', avatar: { gender: 'male' } } }, recipe('paciente-espera')],
    ['un avatar autorado', { key: 'npc-3', metadata: { avatar: { gender: 'male', hairStyle: 'largo' } } }, { kind: 'autorado', avatar: { gender: 'male', hairStyle: 'largo' } }],
    ['una receta inexistente cae al figurante', { key: 'npc-4', metadata: { recipeId: 'no-existe' } }, recipe('paciente-espera')],
    ['basura en metadata cae al figurante', { key: 'npc-5', metadata: 'basura' as never }, recipe('paciente-espera')],
    ['avatar null cae al figurante', { key: 'npc-6', metadata: { avatar: null } }, recipe('paciente-espera')],
  ])('persona del caso: %s', (_name, object, expected) => {
    expect(personCharacterRef(bundle, object)).toEqual(expected);
  });

  it('el guía usa la receta de su rol; uno sin receta, el figurante', () => {
    expect(guideCharacterRef(bundle, 'Colega de psicología')).toEqual(recipe('psicologa-hospitalaria'));
    expect(guideCharacterRef(bundle, 'Guía sin receta')).toEqual(recipe('paciente-espera'));
    expect(extrasCharacterRef(bundle)).toEqual(recipe('paciente-espera'));
  });
});
```

En `game-world.kit.contract.spec.ts`, añade:

```ts
describe('game-world: NPC, personas, guía y figurantes del kit; nada los deforma ni tiñe', () => {
  it('nada tiñe ni deforma a un actor', () => {
    expect(source).not.toMatch(/setTint\(|clearTint\(|character-motion|LivingActor|livingActors|registerLivingActor/);
  });

  it('sin personajes de Kenney ni del sistema viejo', () => {
    expect(source).not.toMatch(/KenneyCharFrames|'characters'|npc-avatar-presets|baked-cast|phaser-avatar-renderer|v1-avatar|avatar-config\.util|authoring-catalog|avatarPresetKey|frameIndex/);
  });

  it('el único espejo que queda es el de las puertas laterales', () => {
    expect(source.match(/setFlipX\(/g) ?? []).toHaveLength(1);
    expect(body('private buildDoorSprite(')).toContain('.setFlipX(');
  });

  it('NPC, personas, guía y figurantes se resuelven con el punto único', () => {
    expect(source).toContain('this.actorVisual(npcCharacterRef(npc))');
    expect(source).toContain('personCharacterRef(this.callbacks.kit, object)');
    expect(source).toContain('guideCharacterRef(kit, entry.guideName)');
    expect(source).toContain('extrasCharacterRef(kit)');
  });

  it('el estado de la paciente es un icono sobre la cabeza', () => {
    const update = body('updatePatientVisualState(state:');
    expect(update).toContain('patientIconKind(state)');
    expect(update).toContain('icon.setTexture(patientIconKey(kind))');
  });
});
```

- [ ] **Step 2: Córrelas y mira que fallen**

Run: `npm test -- --runInBand "patient-state-icon|world-characters|game-world.kit"`

Expected: FAIL.
- Faltan `patient-state-icon.util` y las referencias nuevas.
- El contrato encuentra restos del sistema viejo, como `setTint(` y `KenneyCharFrames`.

- [ ] **Step 3: Escribe el icono y las referencias**

```ts
// frontend/src/app/features/simulator/patient-state-icon.util.ts
/**
 * Estado clínico de la paciente como icono de pixel art sobre su cabeza (decisión 13):
 * reemplaza al tinte rojo/verde/azul, que cambiaba los píxeles del sprite.
 */
import type { RgbaImage } from '../character/kit/kit-engine';
import type { PatientState } from '../../core/models/simulation.model';

export type PatientIconKind = 'crisis' | 'confianza' | 'decaida';
export const PATIENT_ICON_KINDS: readonly PatientIconKind[] = ['crisis', 'confianza', 'decaida'];

/** Los mismos umbrales que tenía el tinte; la crisis manda. */
export function patientIconKind(state: Pick<PatientState, 'crisisLevel' | 'trustLevel' | 'emotionalState'>): PatientIconKind | null {
  if (state.crisisLevel >= 70) return 'crisis';
  if (state.trustLevel >= 60 && state.emotionalState >= 60) return 'confianza';
  if (state.emotionalState <= 25) return 'decaida';
  return null;
}

/** Colores de palette.v2.json: contorno del kit, blanco, coral profundo, verde y azul. */
const ICON_COLORS: Record<string, string> = { o: '#15131d', w: '#ffffff', r: '#a95366', g: '#5b8d70', b: '#3d78a8' };

/** Globo de 7×8 con una marca blanca: «!» de crisis, corazón de confianza, gota de ánimo decaído. */
export const PATIENT_ICON_GRIDS: Readonly<Record<PatientIconKind, readonly string[]>> = Object.freeze({
  crisis: ['.ooooo.', 'orrwrro', 'orrwrro', 'orrwrro', 'orrrrro', 'orrwrro', '.ooooo.', '...o...'],
  confianza: ['.ooooo.', 'ogwgwgo', 'owwwwwo', 'owwwwwo', 'ogwwwgo', 'oggwggo', '.ooooo.', '...o...'],
  decaida: ['.ooooo.', 'obbwbbo', 'obwwwbo', 'owwwwwo', 'obwwwbo', 'obbbbbo', '.ooooo.', '...o...'],
});

export function patientIconImage(kind: PatientIconKind): RgbaImage {
  const grid = PATIENT_ICON_GRIDS[kind];
  const width = grid[0]!.length;
  const height = grid.length;
  const rgba = new Uint8Array(width * height * 4);
  grid.forEach((row, y) => [...row].forEach((ch, x) => {
    const color = ICON_COLORS[ch];
    if (!color) return;
    const i = (y * width + x) * 4;
    rgba[i] = parseInt(color.slice(1, 3), 16);
    rgba[i + 1] = parseInt(color.slice(3, 5), 16);
    rgba[i + 2] = parseInt(color.slice(5, 7), 16);
    rgba[i + 3] = 255;
  }));
  return { width, height, rgba };
}

export function patientIconKey(kind: PatientIconKind): string {
  return `patient-icon-${kind}`;
}
```

Añade en `world-characters.util.ts`:

```ts
import type { KitBundle } from '../character/kit/kit-engine';
import { resolveRecipeId } from '../character/kit/character-visual.resolver';
import type { MapObjectState, NpcConfig } from '../../core/models/simulation.model';

/** Receta de la paciente del caso: sus actores llevan el icono del estado clínico. */
export const PATIENT_RECIPE_ID = 'sobreviviente';

export function npcCharacterRef(npc: Pick<NpcConfig, 'recipeId'>): CharacterRef {
  return { kind: 'receta', recipeId: npc.recipeId };
}

/** Figurantes de los mapas legados y respaldo de todo actor sin receta (spec §7.2). */
export function extrasCharacterRef(bundle: KitBundle): CharacterRef {
  return { kind: 'receta', recipeId: bundle.catalog.extras };
}

/** El guía usa la receta de su rol según `guideName` (spec §7.2). */
export function guideCharacterRef(bundle: KitBundle, guideName: string): CharacterRef {
  return { kind: 'receta', recipeId: resolveRecipeId(bundle, { guide: guideName }) ?? bundle.catalog.extras };
}

/**
 * Persona del caso (marker PERSON): la receta que eligió el docente, su plantilla vieja,
 * su avatar autorado (v1 o v2) o la receta del actor por su clave; si nada, el figurante.
 */
export function personCharacterRef(bundle: KitBundle, object: Pick<MapObjectState, 'key' | 'metadata'>): CharacterRef {
  const meta = (object.metadata ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  const chosen = resolveRecipeId(bundle, { recipeId: text(meta['recipeId']), template: text(meta['npcTemplateId']) });
  if (chosen) return { kind: 'receta', recipeId: chosen };
  if (meta['avatar'] !== undefined && meta['avatar'] !== null) return { kind: 'autorado', avatar: meta['avatar'] };
  return { kind: 'receta', recipeId: resolveRecipeId(bundle, { actor: object.key }) ?? bundle.catalog.extras };
}
```

- [ ] **Step 4: Migra los actores de `game-world.component.ts`**

1. **Imports.**
   - Añade `addComposedSheets` y `addRgbaTexture` al import de `kit-phaser`, y `CharacterRef` al del resolver.
   - Añade estos dos:

     ```ts
     import {
       KIT_HINT_OFFSET_Y, KIT_ICON_OFFSET_Y, KIT_LABEL_OFFSET_Y, PATIENT_RECIPE_ID,
       extrasCharacterRef, guideCharacterRef, npcCharacterRef, personCharacterRef, playerCharacterRef,
     } from './world-characters.util';
     import { PATIENT_ICON_KINDS, patientIconImage, patientIconKey, patientIconKind } from './patient-state-icon.util';
     ```

   - Quita lo que queda del sistema viejo:
     - `KenneyCharFrames` (deja `KenneyDungeonFrames`);
     - todo `./phaser-avatar-renderer`, `./npc-avatar-presets`, `./baked-cast.util` y `./character-motion.util`;
     - `coerceAvatar`, `defaultAvatar`, `hairVariantPatch` y los imports de `avatar.model`;
     - `AUTHORING_HAIR_VARIANTS` y `AUTHORING_NPC_TEMPLATES`;
     - `NpcAvatarPresetKey` del import de `simulation.model`.

2. **Campos.**
   - `NpcMover` pierde `presetKey`.
   - Borra `npcCompositesReady`, `npcBakedTexture` y `livingActors`.
   - Añade:

     ```ts
     /** Visual del guía actual y su última pose (null = marcador geométrico). */
     private guideVisual: CharacterVisual | null = null;
     private guidePose: { direction: PlayerDirection | null; walking: boolean } = { direction: null, walking: false };
     private guideDirection: PlayerDirection = 'down';
     ```

3. **`preload()`.**
   - Borra la carga `this.load.spritesheet('characters', …)`, el bucle del elenco horneado (`castSheetIds()`) y los bucles de capas modulares (`NPC_PRESET_RENDER`, `AUTHORING_NPC_TEMPLATES`, `AUTHORING_HAIR_VARIANTS`, `EXPRESSIONS` y `GENDER_OPTIONS × CLOTHING_COLORS`).
   - Dentro del `if (kit) { … }` de la tarea 5, después del jugador, añade:

     ```ts
           // NPC, personas, guía y figurantes: todas las recetas que no son jugables (unos 14 personajes).
           for (const [recipeId, recipe] of Object.entries(kit.recipes)) {
             if (recipe.kind !== 'jugable') queueCharacterSheets(this, resolveCharacter(kit, { kind: 'receta', recipeId }));
           }
     ```

4. **`create()`.** Después de `this.playerKitReady = …;`:

   ```ts
       for (const kind of PATIENT_ICON_KINDS) addRgbaTexture(this, patientIconKey(kind), patientIconImage(kind));
   ```

5. **Limpieza y `update()`.** En los dos bloques de limpieza, borra `this.livingActors.clear();`. En `update()`, borra `this.updateLivingActors(time);`.

6. **Métodos que se borran:** `ensureNpcComposite`, `npcTextureKey`, `objectAvatarTextureKey`, `objectAvatarConfig`, `ensureObjectAvatarComposite`, `registerLivingActor` y `updateLivingActors`.

7. **Ayudantes nuevos**, debajo de `loadedTexture()`:

   ```ts
     /** Visual del kit con sus animaciones listas; si sus hojas no están, el figurante; si tampoco, null (→ marcador). */
     private actorVisual(ref: CharacterRef): CharacterVisual | null {
       const kit = this.callbacks.kit;
       if (!kit || !this.assetsLoaded) return null;
       for (const candidate of [ref, extrasCharacterRef(kit)]) {
         const visual = resolveCharacter(kit, candidate);
         addComposedSheets(this, visual); // un avatar autorado se compone aquí; las recetas vienen del preload
         if (ensureCharacterAnims(this, visual)) return visual;
       }
       return null;
     }

     /** Icono del estado clínico (oculto hasta que haya estado), con los pies del actor en `feetY`. */
     private patientIcon(feetY: number): Phaser.GameObjects.Image | null {
       if (!this.textures.exists(patientIconKey('crisis'))) return null;
       return this.add.image(0, feetY + KIT_ICON_OFFSET_Y, patientIconKey('crisis')).setOrigin(0.5, 1).setVisible(false);
     }

     /** Figurante de los mapas legados (spec §7.2): de frente, a escala 1, pies en `feetY`. */
     private addExtra(x: number, feetY: number): void {
       const kit = this.callbacks.kit;
       const visual = kit ? this.actorVisual(extrasCharacterRef(kit)) : null;
       if (!visual) return;
       const sprite = this.add.sprite(x, feetY, kitSheetKey(visual, 'idle'), kitFrameIndex('idle', 'down'))
         .setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y)
         .setDepth(actorDepth(feetY));
       playKitPose(sprite, visual, 'down', false, this.callbacks.reduceMotion);
     }
   ```

8. **`registerNpcMover`** pierde el parámetro `presetKey` (`private registerNpcMover(npc: NpcConfig, pos: { x: number; y: number }): void {`), y del objeto que guarda se borra `presetKey`.

9. **Poses del NPC.** `applyNpcPose` y `applyNpcFacing` se reemplazan por:

   ```ts
     /** Pose del NPC (dirección + caminando) solo si cambió — como el jugador. */
     private applyNpcPose(mover: NpcMover, container: Phaser.GameObjects.Container, direction: PlayerDirection, walking: boolean): void {
       if (mover.lastPose.direction === direction && mover.lastPose.walking === walking) return;
       mover.lastPose = { direction, walking };
       this.playNpc(container, direction, walking);
     }

     /** Reposo del NPC mirando a `direction` (las 4 filas del kit son reales). */
     private applyNpcFacing(container: Phaser.GameObjects.Container, direction: PlayerDirection): void {
       this.playNpc(container, direction, false);
     }

     private playNpc(container: Phaser.GameObjects.Container, direction: PlayerDirection, walking: boolean): void {
       const bag = container as unknown as Record<string, unknown>;
       const sprite = bag['__npcSprite'] as Phaser.GameObjects.Sprite | undefined;
       const visual = bag['__npcVisual'] as CharacterVisual | undefined;
       if (sprite && visual) playKitPose(sprite, visual, direction, walking, this.callbacks.reduceMotion);
     }
   ```

10. **`spawnNpcs`** se reemplaza entero:

    ```ts
      private spawnNpcs(npcs: NpcConfig[]) {
        const labelStyle = {
          fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#e8f0f4',
          backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 }, align: 'center',
        };
        for (const npc of npcs) {
          // Red de seguridad: si la coord del JSON cae en colisión, buscar piso libre.
          const pos = this.wouldCollide(npc.x, npc.y)
            ? freeTileNear({ x: npc.x, y: npc.y }, (x, y) => this.wouldCollide(x, y), 18, 3)
            : { x: npc.x, y: npc.y };
          const visual = this.actorVisual(npcCharacterRef(npc));
          // Sombra de contacto en dos pasos: asienta al NPC en el piso.
          const shadowSoft = this.add.ellipse(0, 0, 30, 9, 0x000000, .15);
          const shadow = this.add.ellipse(0, 0, 20, 6, 0x000000, .27);
          const figure: Phaser.GameObjects.GameObject = visual
            ? this.add.sprite(0, 0, kitSheetKey(visual, 'idle'), kitFrameIndex('idle', npc.facing ?? 'down')).setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y)
            : this.add.circle(0, -20, 10, 0x4fa3a5, 1);
          // Nombre oculto hasta estar en rango (updateNpcHints lo muestra junto al aviso E).
          const label = this.add.text(0, KIT_LABEL_OFFSET_Y, npc.displayName, labelStyle).setOrigin(0.5, 1).setAlpha(0);
          const hint = this.add.text(0, KIT_HINT_OFFSET_Y, '▲ E', {
            fontFamily: 'Arial, sans-serif', fontSize: '8px', color: '#4fa3a5', align: 'center',
          }).setOrigin(0.5, 1).setAlpha(0);
          const parts: Phaser.GameObjects.GameObject[] = [shadowSoft, shadow, figure, label, hint];
          const icon = visual?.recipeId === PATIENT_RECIPE_ID ? this.patientIcon(0) : null;
          if (icon) parts.push(icon);
          const container = this.add.container(pos.x, pos.y, parts);
          this.setFeetOffset(container, 0);   // pies = origen del contenedor
          this.npcMarkers.set(npc.key, container);
          const bag = container as unknown as Record<string, unknown>;
          bag['__npcConfig'] = npc;
          bag['__hintSprite'] = hint;
          bag['__labelSprite'] = label;
          bag['__patientIcon'] = icon;
          if (visual && figure instanceof Phaser.GameObjects.Sprite) {
            bag['__npcSprite'] = figure;
            bag['__npcVisual'] = visual;
          }
          this.applyNpcFacing(container, npc.facing ?? 'down');
          this.registerNpcMover(npc, pos);
        }
      }
    ```

11. **`createMarker`, personas.**
    - Antes de `if (this.assetsLoaded) {`, declara `let personVisual: CharacterVisual | null = null;`.
    - Las tres ramas PERSON se reemplazan por una sola. Son la de `this.objectAvatarConfig(object)`, la de `MAP_OBJECT_PRESETS` y la de Kenney `'characters'`:

      ```ts
            } else if (object.type === 'PERSON') {
              personVisual = this.callbacks.kit ? this.actorVisual(personCharacterRef(this.callbacks.kit, object)) : null;
              if (personVisual) {
                // Pies del arte sobre la sombra del marcador (y = 16), de frente y respirando.
                const personSprite = this.add.sprite(0, 16, kitSheetKey(personVisual, 'idle'), kitFrameIndex('idle', 'down'))
                  .setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y);
                playKitPose(personSprite, personVisual, 'down', false, this.callbacks.reduceMotion);
                main = personSprite;
              } else {
                main = this.buildGeomMarker(color);
              }
      ```

    - Después de `this.markerData.set(object.key, object);`:

      ```ts
          if (personVisual?.recipeId === PATIENT_RECIPE_ID) {
            const icon = this.patientIcon(16);
            if (icon) {
              marker.add(icon);
              (marker as unknown as Record<string, unknown>)['__patientIcon'] = icon;
            }
          }
      ```

12. **`applyAmbientLife`: las personas no flotan.**
    - Después de `if (this.callbacks.reduceMotion) return;`, añade:

      ```ts
          // Las personas ya respiran con su hoja de reposo; el vaivén queda para herramientas y objetos.
          if (object.type === 'PERSON' && this.isInteractive(object)) return;
      ```

    - En la rama `if (pattern.type === 'idle') { … }`, envuelve el tween en `if (object.type !== 'PERSON') { … }`.

13. **El guía.**
    - En `buildGuide`, la limpieza del principio suma `this.guideVisual = null;`.
    - En el mismo método, todo lo que va de `const guideScale = …` hasta el `registerLivingActor('guide', …)` (incluido) se reemplaza por:

      ```ts
          const kit = this.callbacks.kit;
          const visual = kit ? this.actorVisual(guideCharacterRef(kit, entry.guideName)) : null;
          const shadow = this.add.ellipse(0, 0, 20, 6, 0x000000, 0.2);
          let sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
          if (visual) {
            sprite = this.add.sprite(0, 0, kitSheetKey(visual, 'idle'), kitFrameIndex('idle', 'down')).setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y);
          } else {
            sprite = this.add.circle(0, -20, 9, 0x8a6cff, 1).setStrokeStyle(2, 0xffffff, 0.9);
          }
          const name = this.add.text(0, KIT_LABEL_OFFSET_Y, entry.guideName, {
            fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#cdd9ff',
            backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 }, align: 'center',
          }).setOrigin(0.5, 1);

          this.guideContainer = this.add.container(entry.spawnX, entry.spawnY, [shadow, sprite, name]);
          this.setFeetOffset(this.guideContainer, 0);
          this.guideSprite = sprite;
          this.guideVisual = visual;
          this.guidePose = { direction: null, walking: false };
          this.guideDirection = 'down';
          this.applyGuidePose('down', false);
      ```

    - Añade el método:

      ```ts
        /** Pose del guía (camina hacia la herramienta, reposa de frente al llegar), solo si cambió. */
        private applyGuidePose(direction: PlayerDirection, walking: boolean): void {
          if (this.guidePose.direction === direction && this.guidePose.walking === walking) return;
          this.guidePose = { direction, walking };
          if (this.guideVisual && this.guideSprite instanceof Phaser.GameObjects.Sprite) {
            playKitPose(this.guideSprite, this.guideVisual, direction, walking, this.callbacks.reduceMotion);
          }
        }
      ```

    - En `updateGuide`:
      - `const goingLeft = next.x < this.guideContainer.x;` pasa a:

        ```ts
            this.guideDirection = resolveDirection(next.x - this.guideContainer.x, next.y - this.guideContainer.y, this.guideDirection);
        ```

      - Se borra el bloque `if (this.guideSprite instanceof Phaser.GameObjects.Sprite) { this.guideSprite.setFlipX(goingLeft); }`.
      - Después de `if (reached(this.guideContainer, this.guideTarget, 3)) this.guideArrived = true;`, añade:

        ```ts
            this.applyGuidePose(this.guideArrived ? 'down' : this.guideDirection, !this.guideArrived);
        ```

    - En `showGuideBubble`, la burbuja sube sobre la cabeza: `this.guideContainer.y - 30` pasa a `this.guideContainer.y + KIT_LABEL_OFFSET_Y - 4`.

14. **Figurantes de los mapas legados.**
    - En `renderHospitalEnvironment`, el bloque `if (this.assetsLoaded && this.textures.exists('characters')) { … }` se reemplaza por lo de abajo. Los rótulos no cambian:

      ```ts
          // Figurantes (spec §7.2): la receta de figurantes, con los pies donde antes terminaba el sprite.
          this.addExtra(150, 264);
          this.add.text(150, 276, 'Abuela', {
            fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#e8c4b8',
            backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
          }).setOrigin(0.5, 0).setDepth(8);
          this.addExtra(230, 284);
          this.add.text(230, 294, 'Hermano', {
            fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#b8d4ff',
            backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
          }).setOrigin(0.5, 0).setDepth(8);
          this.addExtra(110, 446);
          this.add.text(110, 458, 'Seguridad', {
            fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#9dc0e8',
            backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
          }).setOrigin(0.5, 0).setDepth(8);
      ```

    - En `renderComisariaEnvironment`, igual, sin el `setTint`. Cada figurante va seguido de su rótulo de siempre:

      | Llamada | Rótulo |
      |---|---|
      | `addExtra(180, 236)` | «Sobreviviente» |
      | `addExtra(280, 215)` | «Psicóloga social» |
      | `addExtra(760, 106)` | «Funcionario de derechos» |
      | `addExtra(760, 415)` | «Trabajadora social» |

15. **Estado de la paciente.** `updatePatientVisualState` se reemplaza por:

    ```ts
      /**
       * Estado clínico de la paciente (decisión 13): un icono de pixel art sobre la cabeza de cada
       * actor dibujado con su receta; el sprite no se toca. La crisis, además, sacude 2 px.
       */
      updatePatientVisualState(state: import('../../core/models/simulation.model').PatientState) {
        const kind = patientIconKind(state);
        for (const container of [...this.npcMarkers.values(), ...this.markers.values()]) {
          const icon = (container as unknown as Record<string, unknown>)['__patientIcon'] as Phaser.GameObjects.Image | null | undefined;
          if (!icon) continue;
          icon.setVisible(kind !== null);
          if (kind) icon.setTexture(patientIconKey(kind));
          if (kind === 'crisis' && !this.callbacks.reduceMotion) {
            this.tweens.add({ targets: container, x: container.x + 2, duration: 60, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
          }
        }
      }
    ```

16. **Modelo.** En `NpcConfig`, borra los dos campos `@deprecated` (`avatarPresetKey` y `frameIndex`). `NpcAvatarPresetKey` queda en el modelo hasta la tarea 14, porque todavía la importa `npc-avatar-presets.ts`.

- [ ] **Step 5: Córrelas y mira que pasen**

Run: `npm test -- --runInBand "patient-state-icon|world-characters|game-world"`
Expected: PASS. El contrato del kit pasa entero (9 pruebas), y los de game feel y render siguen verdes.

- [ ] **Step 6: Cierre y commit**

Run: `npm test -- --runInBand` y `npm run build`
Expected: todo verde.

```bash
git add src/app/features/simulator/patient-state-icon.util.ts src/app/features/simulator/patient-state-icon.util.spec.ts \
  src/app/features/simulator/world-characters.util.ts src/app/features/simulator/world-characters.util.spec.ts \
  src/app/features/simulator/game-world.component.ts src/app/features/simulator/game-world.kit.contract.spec.ts \
  src/app/core/models/simulation.model.ts
git commit -m "feat(personajes): NPC, personas, guía y figurantes del kit, sin tintes ni deformación

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: PARADA F4 — capturas dentro del juego**

El Browser pane no sirve para capturar el juego (memoria `siep-browser-pane-webgl-screenshots`). Por eso las capturas se sacan con Playwright contra el stack aislado de `scripts/test-e2e.mjs`. El spec y su config viven en el scratchpad, **no** en `frontend/e2e/`.

```ts
// <scratchpad>/capturas/capturas.config.ts
import base from 'D:/Sua_Files/IdeaProjects/psico_project_v3/.worktrees/personajes-unificados/frontend/playwright.config';

export default {
  ...base,
  testDir: 'C:/Users/Predator/AppData/Local/Temp/claude/D--Sua-Files-IdeaProjects-psico-project-v3/82906872-35e8-421f-a97f-96633188a3aa/scratchpad/capturas',
  testMatch: 'capturas.spec.ts',
};
```

```ts
// <scratchpad>/capturas/capturas.spec.ts
import { Page, expect, test } from '@playwright/test';

const OUT = 'C:/Users/Predator/AppData/Local/Temp/claude/D--Sua-Files-IdeaProjects-psico-project-v3/82906872-35e8-421f-a97f-96633188a3aa/scratchpad/capturas';
const EMAIL = process.env['E2E_STUDENT_EMAIL'] ?? 'estudiante@psychosim.edu.co';
const PASSWORD = process.env['E2E_STUDENT_PASSWORD'] ?? 'Estudiante123!';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').last().fill(EMAIL);
  await page.locator('input[type="password"]').last().fill(PASSWORD);
  await page.getByRole('button', { name: /^ingresar$/i }).click();
  await page.waitForURL(/\/portal\//);
}

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

for (const vp of [{ w: 1366, h: 768, dpr: 1 }, { w: 1920, h: 1080, dpr: 1 }, { w: 1536, h: 864, dpr: 1.25 }]) {
  test.describe(`${vp.w}x${vp.h}@${vp.dpr}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr });

    test('lobby, intro y sala del caso', async ({ page }) => {
      test.setTimeout(180_000);
      await login(page);
      await page.goto('/portal/jugar');
      await expect(page.locator('app-game-menu canvas')).toBeVisible();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/lobby-${vp.w}x${vp.h}@${vp.dpr}.png` });
      await page.getByRole('button', { name: /entrar al caso/i }).click();
      await page.waitForURL(/\/portal\/simulador\/\d+/);
      const consent = page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
      const resume = page.getByRole('button', { name: /continuar intento en progreso|reanudar intento en pausa/i });
      await expect(consent.or(resume).first()).toBeVisible({ timeout: 15_000 });
      if (await resume.count()) await resume.click();
      await consent.getByRole('button', { name: /^continuar$/i }).click();
      const caseIntro = page.getByRole('dialog').filter({ hasText: 'Contexto inicial del caso' });
      await expect(caseIntro).toBeVisible({ timeout: 15_000 });
      await page.screenshot({ path: `${OUT}/intro-${vp.w}x${vp.h}@${vp.dpr}.png` });
      await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
      await expect(page.locator('app-game-world .phaser-host[data-world-ready="true"]')).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/sala-${vp.w}x${vp.h}@${vp.dpr}.png` });
      const world = await canvasCheck(page, 'app-game-world canvas');
      console.log(JSON.stringify({ vp, world }));
      expect(world.physical).toBe(true);
    });
  });
}
```

Run (desde `frontend/`): `node ../scripts/test-e2e.mjs --config=<scratchpad>/capturas/capturas.config.ts`

Expected:
- 3 pruebas verdes;
- 9 PNG en `<scratchpad>/capturas/`;
- una línea JSON por viewport con `physical: true`.

Si el runner pide la config de otra forma, ajústalo y regístralo como `Ruling:` en el ledger.

Antes de mostrar las capturas, revísalas:
- Valentina mide 64 px × k, y sus píxeles miden todos lo mismo.
- La luz no vela a los actores.
- Los NPC miran en las 4 direcciones.
- El guía aparece en urgencias.

Muestra al usuario las capturas del lobby y de la sala a 1366×768 y a 1920×1080, con `SendUserFile`, y espera su respuesta. **La aprobación vale para el HEAD de esas capturas.**

---

### Task 8: Figura del kit en CSS (`app-kit-figure`)

**Files:**
- Create: `frontend/src/app/features/character/kit/kit-figure.util.ts`
- Create: `frontend/src/app/features/character/kit/kit-figure.component.ts`
- Test: `frontend/src/app/features/character/kit/kit-figure.util.spec.ts`

**Interfaces:**
- Consumes de la tarea 2: `CharacterVisual`, `visualPortrait` y `sheetSourceUrl`.
- Produces:
  - `integerScale(scale): number` y `figureStyle(visual, options: FigureOptions, urlOf?): Record<string, string>`;
  - `<app-kit-figure>`, con las entradas `visual`, `view = 'down'`, `sheet = 'idle'`, `scale = 2`, `animated = false`, `portrait: PortraitState | null = null` y `label = ''`.

- [ ] **Step 1: Escribe la prueba que falla**

```ts
// frontend/src/app/features/character/kit/kit-figure.util.spec.ts
import { resolveCharacter } from './character-visual.resolver';
import { figureStyle, integerScale } from './kit-figure.util';
import { testKitBundle } from './testing/kit-testing';

const bundle = testKitBundle();
const valentina = resolveCharacter(bundle, { kind: 'receta', recipeId: 'valentina' });
const base = { view: 'down', sheet: 'idle', col: 0, scale: 2, portrait: null } as const;

describe('figureStyle', () => {
  it('reposo de frente a ×2: caja exacta y hoja entera escalada', () => {
    expect(figureStyle(valentina, base)).toEqual({
      width: '96px', height: '144px',
      'background-image': 'url("/assets/characters/kit/valentina/idle.png")',
      'background-size': '384px 576px',
      'background-position': '0px 0px',
    });
  });

  it('caminata a la derecha, cuadro 3, a ×4', () => {
    expect(figureStyle(valentina, { ...base, sheet: 'walk', view: 'right', col: 3, scale: 4 })).toMatchObject({
      width: '192px', height: '288px', 'background-size': '1152px 1152px', 'background-position': '-576px -576px',
    });
  });

  it('la escala siempre es entera', () => {
    expect(integerScale(2.6)).toBe(3);
    expect(integerScale(0)).toBe(1);
    expect(integerScale(Number.NaN)).toBe(1);
  });

  it('retrato a ×3; si la receta no tiene el estado, el neutral', () => {
    expect(figureStyle(valentina, { ...base, portrait: 'triste', scale: 3 })).toEqual({
      width: '96px', height: '96px',
      'background-image': 'url("/assets/characters/kit/valentina/portrait-neutral.png")',
      'background-size': '96px 96px',
    });
  });

  it('sin visual o sin URL (jsdom sin canvas) queda solo la caja', () => {
    expect(figureStyle(null, base)).toEqual({ width: '96px', height: '144px' });
    const custom = resolveCharacter(bundle, {
      kind: 'jugador',
      avatar: { schemaVersion: 2, mode: 'personalizado', complexion: 'b', skin: 'piel-6', hair: 'afro', hairColor: 'negro', accessories: [], bata: false },
    });
    expect(figureStyle(custom, base, () => null)).toEqual({ width: '96px', height: '144px' });
  });
});
```

- [ ] **Step 2: Córrela y mira que falle**

Run: `npm test -- --runInBand kit-figure`
Expected: FAIL; no encuentra `./kit-figure.util`.

- [ ] **Step 3: Escribe el util y el componente**

```ts
// frontend/src/app/features/character/kit/kit-figure.util.ts
/** Estilo CSS de un cuadro del kit a escala entera, en una caja del tamaño exacto (spec §8.3). */
import { CharacterVisual, visualPortrait } from './character-visual.resolver';
import { FRAME, PORTRAIT_FRAME, PortraitState, SHEETS, SheetId, VIEW_ROWS, ViewId } from './kit-engine';
import { sheetSourceUrl } from './kit-raster';

export interface FigureOptions {
  view: ViewId;
  sheet: SheetId;
  col: number;
  scale: number;
  /** Si se da, se dibuja el retrato de ese estado en vez del sprite. */
  portrait: PortraitState | null;
}

/** Nunca fraccionaria ni menor que 1. */
export function integerScale(scale: number): number {
  return Number.isFinite(scale) ? Math.max(1, Math.round(scale)) : 1;
}

export function figureStyle(
  visual: CharacterVisual | null,
  options: FigureOptions,
  urlOf: typeof sheetSourceUrl = sheetSourceUrl,
): Record<string, string> {
  const k = integerScale(options.scale);
  if (options.portrait) {
    const width = `${PORTRAIT_FRAME.width * k}px`;
    const height = `${PORTRAIT_FRAME.height * k}px`;
    const source = visual ? visualPortrait(visual, options.portrait) : null;
    const url = source ? urlOf(source) : null;
    return url ? { width, height, 'background-image': `url("${url}")`, 'background-size': `${width} ${height}` } : { width, height };
  }
  const w = FRAME.width * k;
  const h = FRAME.height * k;
  const size = { width: `${w}px`, height: `${h}px` };
  const url = visual ? urlOf(visual[options.sheet]) : null;
  if (!url) return size;
  return {
    ...size,
    'background-image': `url("${url}")`,
    'background-size': `${SHEETS[options.sheet].frames * w}px ${VIEW_ROWS.length * h}px`,
    'background-position': `${-options.col * w}px ${-VIEW_ROWS.indexOf(options.view) * h}px`,
  };
}
```

```ts
// frontend/src/app/features/character/kit/kit-figure.component.ts
import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

import { CharacterVisual } from './character-visual.resolver';
import { PortraitState, SHEETS, SheetId, ViewId } from './kit-engine';
import { figureStyle } from './kit-figure.util';

/**
 * Sprite o retrato del kit en CSS (lobby, editores, resultado, diálogo): a escala entera,
 * con `image-rendering: pixelated` y una caja del tamaño exacto del cuadro.
 */
@Component({
  selector: 'app-kit-figure',
  standalone: true,
  imports: [NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="kit-figure" [ngStyle]="style()" [attr.role]="label() ? 'img' : null"
    [attr.aria-label]="label() || null" [attr.aria-hidden]="label() ? null : 'true'"></span>`,
  styles: [`
    :host { display: inline-block; line-height: 0; }
    .kit-figure { display: block; background-repeat: no-repeat; image-rendering: pixelated; }
  `],
})
export class KitFigureComponent {
  readonly visual = input<CharacterVisual | null>(null);
  readonly view = input<ViewId>('down');
  readonly sheet = input<SheetId>('idle');
  /** ×1, ×2 o ×4 para el sprite; ×3 o ×6 para el retrato. */
  readonly scale = input(2);
  readonly animated = input(false);
  readonly portrait = input<PortraitState | null>(null);
  readonly label = input('');

  private readonly col = signal(0);
  private readonly reduceMotion = typeof window !== 'undefined'
    && (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false);

  readonly style = computed(() => figureStyle(this.visual(), {
    view: this.view(), sheet: this.sheet(), col: this.col(), scale: this.scale(), portrait: this.portrait(),
  }));

  constructor() {
    // Reposo o caminata en bucle a su fps; con movimiento reducido, el cuadro 0.
    effect(onCleanup => {
      const sheet = this.sheet();
      this.col.set(0);
      if (!this.animated() || this.reduceMotion || this.portrait() || !this.visual()) return;
      const { frames, fps } = SHEETS[sheet];
      const timer = setInterval(() => this.col.update(col => (col + 1) % frames), 1000 / fps);
      onCleanup(() => clearInterval(timer));
    });
  }
}
```

- [ ] **Step 4: Córrela y mira que pase**

Run: `npm test -- --runInBand kit-figure`
Expected: PASS, 5 pruebas.

- [ ] **Step 5: Cierre y commit**

Run:
- `npm test -- --runInBand`
- `npm run build` (compila el componente aunque todavía nadie lo use)

Expected: todo verde.

```bash
git add src/app/features/character/kit/kit-figure.util.ts src/app/features/character/kit/kit-figure.util.spec.ts \
  src/app/features/character/kit/kit-figure.component.ts
git commit -m "feat(personajes): figura del kit en CSS a escala entera

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: El lobby con el kit y el mismo zoom entero que el mundo

**Files:**
- Modify: `frontend/src/app/features/simulator/lobby-avatar.util.ts` (se reescribe)
- Modify: `frontend/src/app/features/simulator/game-menu.component.ts`
- Test: `frontend/src/app/features/simulator/lobby-avatar.util.spec.ts` (se reescribe), `game-menu.kit.contract.spec.ts` (nuevo), `game-menu.component.spec.ts` (se le da el KitService falso)

**Interfaces:**
- Consumes:
  - de las tareas 1, 2, 3 y 5: `toAvatarV2`, `resolveCharacter`, `KitService`, `kit-phaser`, `integerZoom`, `cameraBounds`, `pixelScaleConfig` y `watchHostSize`.
- Produces:
  - `LOBBY_DOOR_RANGE` (no cambia);
  - `LOBBY_ROOM = { width: 960, height: 540 }`;
  - `lobbyPose(vx): { view: 'left' | 'right' | null; walking: boolean }`;
  - `nearestLobbyDoor` (no cambia).

**Ruling:**
- Qué: el cartel «CLÍNICA · SIEP» y la ayuda de teclas pasan del lienzo al DOM.
- Por qué: con zoom de cámara > 1, un objeto `setScrollFactor(0)` en Phaser se escala desde el centro y se sale de la vista.
- Costo si está mal: ninguno visual; el texto es el mismo.

- [ ] **Step 1: Escribe las pruebas que fallan**

```ts
// frontend/src/app/features/simulator/lobby-avatar.util.spec.ts (reemplaza el archivo)
import { LOBBY_ROOM, lobbyPose, nearestLobbyDoor } from './lobby-avatar.util';

describe('lobby-avatar.util', () => {
  it('camina mirando hacia su lado; quieto conserva la vista', () => {
    expect(lobbyPose(-0.3)).toEqual({ view: 'left', walking: true });
    expect(lobbyPose(0.3)).toEqual({ view: 'right', walking: true });
    expect(lobbyPose(0)).toEqual({ view: null, walking: false });
  });

  it('la puerta más cercana dentro del radio, o ninguna', () => {
    const doors = [{ x: 220 }, { x: 480 }, { x: 740 }];
    expect(nearestLobbyDoor(doors, 250)).toBe(doors[0]);
    expect(nearestLobbyDoor(doors, 470)).toBe(doors[1]);
    expect(nearestLobbyDoor(doors, 350)).toBeNull();
    expect(nearestLobbyDoor(doors, 350, 200)).toBe(doors[0]);
    expect(nearestLobbyDoor([], 0)).toBeNull();
  });

  it('la fachada del lobby mide 960×540 para el zoom entero', () => {
    expect(LOBBY_ROOM).toEqual({ width: 960, height: 540 });
  });
});
```

```ts
// frontend/src/app/features/simulator/game-menu.kit.contract.spec.ts
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-menu.component.ts'), 'utf-8');

describe('lobby: kit, píxeles físicos y zoom entero (spec §8.2-8.3)', () => {
  it('el avatar del lobby es el del kit, a escala 1 y sin espejo', () => {
    expect(source).toContain("resolveCharacter(bundle, { kind: 'jugador', avatar })");
    expect(source).toContain('queueCharacterSheets(this, this.visual)');
    expect(source).toContain('.setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y)');
    expect(source).not.toMatch(/setScale\(|setFlipX\(|phaser-avatar-renderer|LOBBY_AVATAR_SCALE|lobbyAvatarPlan/);
  });

  it('el lienzo en píxeles físicos y el zoom entero, como en el mundo', () => {
    expect(source).toContain('scale: pixelScaleConfig(this.host!.nativeElement)');
    expect(source).toContain('integerZoom(cam.width, cam.height, LOBBY_ROOM.width, LOBBY_ROOM.height)');
    expect(source).not.toContain('Phaser.Scale.FIT');
  });

  it('los rótulos fijos viven en el DOM (el zoom de cámara no los saca de la vista)', () => {
    expect(source).not.toMatch(/setScrollFactor\(0\)/);
    expect(source).toContain('<div class="lobby-sign" aria-hidden="true">CLÍNICA · SIEP</div>');
  });
});
```

En `game-menu.component.spec.ts`, el TestBed suma `{ provide: KitService, useValue: fakeKitService() }` (importa `KitService` y `fakeKitService`).

- [ ] **Step 2: Córrelas y mira que fallen**

Run: `npm test -- --runInBand "lobby-avatar|game-menu"`
Expected: FAIL:
- `LOBBY_ROOM` no existe;
- `lobbyPose` todavía devuelve `flipX`;
- el contrato encuentra `setScale(` y `Phaser.Scale.FIT`.

- [ ] **Step 3: Reescribe `lobby-avatar.util.ts`**

```ts
// frontend/src/app/features/simulator/lobby-avatar.util.ts
/**
 * Lobby «CLÍNICA · SIEP»: la misma identidad que el editor, el mundo y el resultado,
 * dibujada con las hojas del kit (spec §8.2). Lógica pura separada de Phaser.
 */

/** Radio de proximidad a una puerta del lobby. */
export const LOBBY_DOOR_RANGE = 70;
/** Sala del lobby para el zoom entero: la vista base de 960 y la fachada de 540 px de alto. */
export const LOBBY_ROOM = Object.freeze({ width: 960, height: 540 });

export interface LobbyPose {
  /** Vista a la que mira al caminar; null = quieto (conserva la que tenía). */
  view: 'left' | 'right' | null;
  walking: boolean;
}

/** El lobby solo se mueve en horizontal; el kit trae las dos vistas laterales reales. */
export function lobbyPose(vx: number): LobbyPose {
  return { view: vx < 0 ? 'left' : vx > 0 ? 'right' : null, walking: vx !== 0 };
}

export interface LobbyDoorLike {
  x: number;
}

/** Puerta más cercana dentro del radio, o `null` si todas quedan lejos. */
export function nearestLobbyDoor<T extends LobbyDoorLike>(
  doors: readonly T[],
  playerX: number,
  range: number = LOBBY_DOOR_RANGE,
): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const door of doors) {
    const distance = Math.abs(door.x - playerX);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = door;
    }
  }
  return best !== null && bestDistance <= range ? best : null;
}
```

- [ ] **Step 4: Migra `game-menu.component.ts`**

1. **Imports.**
   - Fuera: los de `./lobby-avatar.util` que ya no existen y todo `./phaser-avatar-renderer`.
   - Entran:

     ```ts
     import { toAvatarV2 } from '../character/kit/avatar-v2';
     import { CharacterVisual, resolveCharacter } from '../character/kit/character-visual.resolver';
     import { KIT_ORIGIN_X, KIT_ORIGIN_Y, ensureCharacterAnims, kitFrameIndex, kitSheetKey, playKitPose, queueCharacterSheets } from '../character/kit/kit-phaser';
     import { KitService } from '../character/kit/kit.service';
     import { LOBBY_DOOR_RANGE, LOBBY_ROOM, lobbyPose, nearestLobbyDoor } from './lobby-avatar.util';
     import { cameraBounds, integerZoom } from './pixel-scale.util';
     import { pixelScaleConfig, watchHostSize } from './pixel-canvas';
     ```

2. **`ClinicMenuScene`.**
   - El constructor recibe `private readonly visual: CharacterVisual | null` en lugar de `avatarPlan`.
   - Campos nuevos: `private view: 'left' | 'right' = 'right';` y `private walking = false;`.
   - `preload()` queda en:

     ```ts
       preload() {
         // La hoja del kit del jugador: PNG publicado o avatar compuesto en el navegador.
         if (this.visual) queueCharacterSheets(this, this.visual);
       }
     ```

   - Borra `resolvePlayerTextureKey()`.
   - En `create()`:
     - borra el cartel (`const sign = …` y su texto) y el texto de ayuda `'← → / A D  mover · E entrar'`;
     - reemplaza el bloque del jugador, desde `const shadow = this.add.ellipse(0, 3, 30, 8, …` hasta `this.cameras.main.startFollow(this.player, true, 0.1, 0.1);`, por:

     ```ts
         // La identidad del editor llega al lobby con las hojas del kit; el marcador
         // geométrico queda como último recurso si la hoja no cargó.
         const shadow = this.add.ellipse(0, 0, 24, 7, 0x000000, 0.25);
         const parts: Phaser.GameObjects.GameObject[] = [shadow];
         if (this.visual && ensureCharacterAnims(this, this.visual)) {
           this.playerSprite = this.add.sprite(0, 0, kitSheetKey(this.visual, 'idle'), kitFrameIndex('idle', 'right'))
             .setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y);
           playKitPose(this.playerSprite, this.visual, 'right', false, this.reduceMotion);
           parts.push(this.playerSprite);
         } else {
           const body = this.add.rectangle(0, -17, 22, 34, 0x8a6cff).setStrokeStyle(2, 0xffffff);
           const coat = this.add.rectangle(0, -13, 22, 16, 0xb9a8ff, 0.9);   // bajo de la bata
           const head = this.add.circle(0, -41, 9, 0xf2c9a0).setStrokeStyle(2, 0xffffff, 0.85);
           parts.push(body, coat, head);
         }
         this.player = this.add.container(220, this.floorY + 2, parts);
         this.applyCamera();
         this.scale.on('resize', () => this.applyCamera());
     ```

     - borra `this.cameras.main.setBounds(0, 0, W, H);` al principio de `create()`, porque ahora lo hace `applyCamera`.
   - Método nuevo:

     ```ts
       /** Zoom entero (spec §8.3) con la fachada de 960×540 como sala; sigue al jugador en horizontal. */
       private applyCamera(): void {
         const cam = this.cameras.main;
         const k = integerZoom(cam.width, cam.height, LOBBY_ROOM.width, LOBBY_ROOM.height);
         cam.setZoom(k);
         const bounds = cameraBounds(this.worldW, LOBBY_ROOM.height, cam.width / k, cam.height / k);
         cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
         if (this.player) {
           cam.startFollow(this.player, true, 0.1, 0.1);
           cam.centerOn(this.player.x, this.player.y);
         }
       }
     ```

   - En `update()`, el bloque de la pose (`const pose = lobbyPose(vx, this.reduceMotion); if (this.playerSprite) { … }`) pasa a:

     ```ts
         const pose = lobbyPose(vx);
         const view = pose.view ?? this.view;
         if (this.playerSprite && this.visual && (view !== this.view || pose.walking !== this.walking)) {
           playKitPose(this.playerSprite, this.visual, view, pose.walking, this.reduceMotion);
         }
         this.view = view;
         this.walking = pose.walking;
     ```

3. **Plantilla.** Antes del `<div #host class="phaser-host" …>`:

   ```html
         <p class="lobby-help" aria-hidden="true">← → / A D  mover · E entrar</p>
         <div class="lobby-sign" aria-hidden="true">CLÍNICA · SIEP</div>
   ```

4. **Estilos.**
   - `:host ::ng-deep .phaser-host canvas { … }` pasa a `{ display: block; }`.
   - Se añaden:

     ```css
         .lobby-help { position: absolute; top: 8px; left: 12px; z-index: 10; margin: 0; color: rgba(232,240,244,.5); font: 13px/1.2 monospace; pointer-events: none; }
         .lobby-sign { position: absolute; top: 36px; left: 24px; z-index: 10; padding: 8px 14px; border-radius: 4px; background: rgba(18,32,47,.92); border: 2px solid rgba(79,124,172,.5); color: #9dc0e8; font: 20px/1 monospace; pointer-events: none; }
     ```

5. **`GameMenuComponent`.**
   - Campos nuevos:

     ```ts
     private readonly kit = inject(KitService);
     private detachHostWatch?: () => void;
     private booting = false;
     private destroyed = false;
     ```

   - `boot` se reemplaza por:

     ```ts
       private boot(items: CatalogItem[]) {
         if (!this.host || this.game || this.booting) return;
         this.booting = true;
         // Identidad del jugador: mismo almacén que editor, mundo y resultado; el visual sale del kit.
         this.avatarStore.loadSaved();
         const avatar = toAvatarV2(this.avatarStore.avatar());
         const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
         this.kit.load()
           .then(bundle => resolveCharacter(bundle, { kind: 'jugador', avatar }), () => null)
           .then(visual => {
             this.booting = false;
             if (this.destroyed || !this.host || this.game) return;
             this.zone.runOutsideAngular(() => {
               const scene = new ClinicMenuScene(items, visual, reduceMotion, {
                 onEnter: id => this.zone.run(() => this.enter(id)),
                 onFocus: item => this.zone.run(() => this.focused.set(item)),
               });
               this.game = new Phaser.Game({
                 type: Phaser.AUTO,
                 parent: this.host!.nativeElement,
                 backgroundColor: '#0e141a',
                 pixelArt: true,
                 roundPixels: true,
                 scale: pixelScaleConfig(this.host!.nativeElement),
                 scene,
               });
               this.detachHostWatch = watchHostSize(this.game, this.host!.nativeElement);
               // Sin la captura de Phaser, flechas y Espacio desplazarían la página. Se arma DESPUÉS de
               // crear el juego: Phaser descarta los `keydown` ya cancelados.
               this.detachScrollKeyGuard = attachScrollKeyGuard(this.zone);
             });
             // Foco inicial explícito: los controles de teclado quedan activos sin un click previo (GAME-09).
             window.setTimeout(() => this.focusCanvas(), 0);
           });
       }
     ```

   - En `ngOnDestroy()`: `this.destroyed = true;` y `this.detachHostWatch?.();` antes de destruir el juego.

- [ ] **Step 5: Córrelas y mira que pasen**

Run: `npm test -- --runInBand "lobby-avatar|game-menu"`
Expected: PASS (util, 3 pruebas; contrato, 3; las pruebas GAME-09 de `game-menu.component.spec.ts` siguen verdes).

- [ ] **Step 6: Cierre y commit**

Run: `npm test -- --runInBand` y `npm run build`
Expected: todo verde.

```bash
git add src/app/features/simulator/lobby-avatar.util.ts src/app/features/simulator/lobby-avatar.util.spec.ts \
  src/app/features/simulator/game-menu.component.ts src/app/features/simulator/game-menu.component.spec.ts \
  src/app/features/simulator/game-menu.kit.contract.spec.ts
git commit -m "feat(personajes): el lobby con el kit y el mismo zoom entero que el mundo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: La intro del caso con las hojas del kit

**Files:**
- Modify: `frontend/src/app/features/simulator/intro-scene.util.ts` (se reescribe la parte del actor)
- Modify: `frontend/src/app/features/simulator/case-intro-scene.component.ts`
- Test: `frontend/src/app/features/simulator/intro-scene.util.spec.ts`, `case-intro-scene.component.spec.ts`

**Interfaces:**
- Consumes: `CharacterVisual`, `SheetSource`, `resolveCharacter`, `sheetSourceUrl`, `KitService` y `toAvatarV2`.
- Produces:
  - `interface IntroActorPhase { source: SheetSource; sheetWidth; sheetHeight; frames: IntroFrame[]; fps }`;
  - `interface IntroActor { walk; idle }` (sin `pixelated`);
  - `introActor(visual: CharacterVisual): IntroActor`;
  - `frameAt`, `stageLayout`, `INTRO_STAGE_*` e `INTRO_FRAME_*` no cambian.

- [ ] **Step 1: Escribe la prueba que falla**

En `intro-scene.util.spec.ts`:
- Borra las pruebas de `introActor` que hablan de v1, cast o capas modulares y sus imports (`defaultAvatar` y los de `v1-avatar.util`).
- Deja las de `frameAt` y `stageLayout` como están.
- Añade:

```ts
import { resolveCharacter } from '../character/kit/character-visual.resolver';
import { testKitBundle } from '../character/kit/testing/kit-testing';
import { introActor } from './intro-scene.util';

describe('introActor (kit)', () => {
  const bundle = testKitBundle();

  it('entra caminando hacia la derecha (6 cuadros a 10 fps) y reposa de frente (4 a 4 fps)', () => {
    const actor = introActor(resolveCharacter(bundle, { kind: 'receta', recipeId: 'valentina' }));
    expect(actor.walk).toEqual({
      source: { kind: 'url', url: '/assets/characters/kit/valentina/walk.png' },
      sheetWidth: 288, sheetHeight: 288, fps: 10,
      frames: [0, 48, 96, 144, 192, 240].map(x => ({ x, y: 144 })),
    });
    expect(actor.idle).toEqual({
      source: { kind: 'url', url: '/assets/characters/kit/valentina/idle.png' },
      sheetWidth: 192, sheetHeight: 288, fps: 4,
      frames: [0, 48, 96, 144].map(x => ({ x, y: 0 })),
    });
  });

  it('el avatar personalizado entra con sus hojas compuestas', () => {
    const actor = introActor(resolveCharacter(bundle, {
      kind: 'jugador',
      avatar: { schemaVersion: 2, mode: 'personalizado', complexion: 'a', skin: 'piel-3', hair: 'trenza', hairColor: 'negro', accessories: ['gafete'], bata: true },
    }));
    expect(actor.walk.source.kind).toBe('rgba');
    expect(actor.idle.source.kind).toBe('rgba');
  });
});
```

En `case-intro-scene.component.spec.ts`, el TestBed suma `{ provide: KitService, useValue: fakeKitService() }`.

- [ ] **Step 2: Córrela y mira que falle**

Run: `npm test -- --runInBand "intro-scene|case-intro-scene"`
Expected: FAIL. `introActor` todavía espera un `AvatarConfig` y devuelve `layers`.

- [ ] **Step 3: Reescribe el actor de `intro-scene.util.ts`**

- Borra:
  - los imports de `avatar.model`, `baked-cast.util`, `phaser-avatar-renderer` y `v1-avatar.util`;
  - las constantes `V1_ROWS` y `SHEET3_*`, más `INTRO_MAX_SCALE` si deja de usarse (no la borres si `stageLayout` la usa);
  - `rowFrames`, `sheet3Phase` y `modularLayers`.
- Las interfaces y `introActor` pasan a:

```ts
import type { CharacterVisual, SheetSource } from '../character/kit/character-visual.resolver';
import { FRAME, SHEETS, SheetId, VIEW_ROWS, ViewId } from '../character/kit/kit-engine';

/** Cuadro del personaje en la escena: el del kit. */
export const INTRO_FRAME_WIDTH = FRAME.width;
export const INTRO_FRAME_HEIGHT = FRAME.height;

export interface IntroActorPhase {
  /** Hoja del kit (PNG publicado o avatar compuesto). */
  source: SheetSource;
  /** Tamaño de la hoja completa a 1×. */
  sheetWidth: number;
  sheetHeight: number;
  /** Desplazamiento (px, positivo) de cada cuadro de la animación, en orden. */
  frames: IntroFrame[];
  fps: number;
}

export interface IntroActor {
  walk: IntroActorPhase;
  idle: IntroActorPhase;
}

function phase(source: SheetSource, sheet: SheetId, view: ViewId): IntroActorPhase {
  const { frames, fps } = SHEETS[sheet];
  const y = VIEW_ROWS.indexOf(view) * FRAME.height;
  return {
    source,
    sheetWidth: frames * FRAME.width,
    sheetHeight: VIEW_ROWS.length * FRAME.height,
    frames: Array.from({ length: frames }, (_, col) => ({ x: col * FRAME.width, y })),
    fps,
  };
}

/** El personaje entra caminando hacia la derecha y luego reposa de frente (spec §8.2). */
export function introActor(visual: CharacterVisual): IntroActor {
  return { walk: phase(visual.walk, 'walk', 'right'), idle: phase(visual.idle, 'idle', 'down') };
}
```

- [ ] **Step 4: Migra `case-intro-scene.component.ts`**

1. **Inyecciones e imports.** Inyecta `KitService` (`private readonly kit = inject(KitService);`) e importa `toAvatarV2`, `resolveCharacter` y `sheetSourceUrl`.

2. **Computados.** Reemplaza `actor`, `phaseSheet` y añade `layerUrl` y `layerSize`:

```ts
  readonly actor = computed(() => {
    const bundle = this.kit.bundle();
    return bundle ? introActor(resolveCharacter(bundle, { kind: 'jugador', avatar: toAvatarV2(this.store.avatar()) })) : null;
  });
  readonly phaseSheet = computed(() => {
    const actor = this.actor();
    return actor ? (this.phase() === 'walk' ? actor.walk : actor.idle) : null;
  });
  readonly layerUrl = computed(() => {
    const sheet = this.phaseSheet();
    const url = sheet ? sheetSourceUrl(sheet.source) : null;
    return url ? `url("${url}")` : 'none';
  });
  readonly layerSize = computed(() => {
    const sheet = this.phaseSheet();
    return sheet ? `${sheet.sheetWidth}px ${sheet.sheetHeight}px` : 'auto';
  });
```

3. **`ngOnInit`.** Queda así:

```ts
  ngOnInit(): void {
    if (this.reduceMotion()) this.phase.set('idle');
    // Mientras camina se baja la hoja de reposo: sin esto, al cambiar de hoja el personaje
    // desaparece hasta que llega la imagen (se nota con la caché fría o una red lenta).
    this.kit.load().then(() => {
      const actor = this.actor();
      const url = actor ? sheetSourceUrl(actor.idle.source) : null;
      if (url && !this.reduceMotion()) new Image().src = url;
    }, () => undefined);
  }
```

4. **`tick` y `applyFrame`** toleran que la hoja aún no esté:
   - en `tick`: `const sheet = this.phaseSheet(); if (sheet) { const frame = frameAt(…); if (frame !== this.lastFrame) this.applyFrame(frame); }` antes de pedir el siguiente cuadro;
   - en `applyFrame`: `const frame = this.phaseSheet()?.frames[index] ?? { x: 0, y: 0 };`.

5. **Plantilla.**
   - Quita `[class.intro-actor--pixel]="actor().pixelated"` y el `@for` de capas.
   - Pon una sola capa:

```html
            <span class="intro-actor__layer" [style.background-image]="layerUrl()" [style.background-size]="layerSize()"></span>
```

6. **Estilos.**
   - `.intro-actor__layer` cambia `image-rendering: auto;` por `image-rendering: pixelated;`.
   - Borra la regla `.intro-actor--pixel .intro-actor__layer`.
   - El comentario de los pies pasa a «Pies en y=184 (pivote del kit 68/72)».

- [ ] **Step 5: Córrelas y mira que pasen**

Run: `npm test -- --runInBand "intro-scene|case-intro-scene|simulation-play.intro"`
Expected: PASS.

- [ ] **Step 6: Cierre y commit**

Run: `npm test -- --runInBand` y `npm run build`
Expected: todo verde.

```bash
git add src/app/features/simulator/intro-scene.util.ts src/app/features/simulator/intro-scene.util.spec.ts \
  src/app/features/simulator/case-intro-scene.component.ts src/app/features/simulator/case-intro-scene.component.spec.ts
git commit -m "feat(personajes): la intro del caso con las hojas del kit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Retratos del diálogo y del resultado del intento

**Files:**
- Modify: `frontend/src/app/features/simulator/portrait-resolver.util.ts` (se reescribe)
- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.ts`
- Modify: `frontend/src/app/core/models/simulation.model.ts` (`DialogueState.recipeId?`)
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts` (`showNpcDialogue`)
- Modify: `frontend/src/app/features/simulator/attempt-outcome.component.ts`
- Test: `frontend/src/app/features/simulator/portrait-resolver.util.spec.ts` (se reescribe), `portraits.contract.spec.ts` (nuevo), `dialogue-panel.component.spec.ts`, `attempt-outcome.component.spec.ts`

**Interfaces:**
- Consumes de la tarea 2: `resolveRecipeId`, `resolveCharacter`, `portraitStateFor`, `visualPortrait`, `sheetSourceUrl` y `KitService`.
- Produces:
  - `resolvePortraitAsset(bundle: KitBundle | null, keys: { recipeId?; portraitKey?; speakerName?; emotion? }): string | null`;
  - `DialogueState.recipeId?: string | null`.

Este es el punto 4 del Review Focus y un menor diferido del plan 1. El retrato se resuelve primero por la receta del NPC y por su clave, y solo después por el nombre del hablante. Las voces sin cuerpo nunca tienen retrato.

- [ ] **Step 1: Escribe las pruebas que fallan**

```ts
// frontend/src/app/features/simulator/portrait-resolver.util.spec.ts (reemplaza el archivo)
import { testKitBundle } from '../character/kit/testing/kit-testing';
import { resolvePortraitAsset } from './portrait-resolver.util';

const bundle = testKitBundle();
const png = (path: string) => `/assets/characters/kit/${path}.png`;

describe('resolvePortraitAsset (kit)', () => {
  it.each([
    ['hablante del seed', { speakerName: 'Abuela de la niña', emotion: 'neutral' }, png('abuela-familia/portrait-neutral')],
    ['la emoción vulnerable es preocupada', { speakerName: 'Sobreviviente (22 años)', emotion: 'vulnerable' }, png('sobreviviente/portrait-preocupada')],
    ['un portraitKey legado', { portraitKey: 'escucha-segura', emotion: 'danger' }, png('sobreviviente/portrait-triste')],
    ['una voz sin cuerpo no tiene retrato', { speakerName: 'Supervisión clínica', emotion: 'danger' }, null],
    ['un NPC de escenario que se llama como una voz', { recipeId: 'supervisor-clinico', speakerName: 'Supervisión clínica', emotion: 'positive' }, png('supervisor-clinico/portrait-alegre')],
    ['un hablante desconocido', { speakerName: 'Nadie' }, null],
  ])('%s', (_name, keys, expected) => {
    expect(resolvePortraitAsset(bundle, keys)).toBe(expected);
  });

  it('sin paquete del kit todavía, la silueta', () => {
    expect(resolvePortraitAsset(null, { speakerName: 'Abuela de la niña' })).toBeNull();
  });
});
```

```ts
// frontend/src/app/features/simulator/portraits.contract.spec.ts
import { readFileSync } from 'fs';
import { join } from 'path';

const dialogue = readFileSync(join(__dirname, 'dialogue-panel.component.ts'), 'utf-8');
const outcome = readFileSync(join(__dirname, 'attempt-outcome.component.ts'), 'utf-8');
const play = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

describe('retratos a escala entera (spec §8.2-8.3)', () => {
  it('el diálogo muestra el retrato a ×3 (96 px) sin object-fit que lo encoja', () => {
    expect(dialogue).toContain('<img class="portrait-img" [src]="src" alt="" width="96" height="96"');
    expect(dialogue).not.toMatch(/object-fit/);
    expect(dialogue).toContain('resolvePortraitAsset(this.kit.bundle(), {');
  });

  it('el diálogo de un NPC de escenario lleva su receta', () => {
    expect(play).toMatch(/key: `npc-\$\{npc\.key\}`,[\s\S]{0,80}recipeId: npc\.recipeId,/);
  });

  it('el resultado muestra el retrato neutral del jugador a ×3', () => {
    expect(outcome).toContain('<app-kit-figure [visual]="playerVisual()" portrait="neutral" [scale]="3" />');
    expect(outcome).not.toMatch(/app-avatar-figure|AvatarFigureComponent/);
  });
});
```

- [ ] **Step 2: Córrelas y mira que fallen**

Run: `npm test -- --runInBand "portrait-resolver|portraits.contract"`
Expected: FAIL: la firma vieja devuelve rutas de `characters/portraits/`, y los contratos no encuentran el retrato del kit.

- [ ] **Step 3: Reescribe `portrait-resolver.util.ts`**

```ts
// frontend/src/app/features/simulator/portrait-resolver.util.ts
/**
 * Retrato del diálogo (spec §7.3, §8.2): el de la receta del hablante, buscado primero por
 * la receta del NPC y su clave y después por su nombre. Una voz sin cuerpo («Supervisión
 * clínica», «Protocolo clínico»…) no tiene retrato: el panel muestra su silueta.
 */
import {
  portraitStateFor,
  resolveCharacter,
  resolveRecipeId,
  visualPortrait,
} from '../character/kit/character-visual.resolver';
import type { KitBundle } from '../character/kit/kit-engine';
import { sheetSourceUrl } from '../character/kit/kit-raster';

export interface DialoguePortraitKeys {
  recipeId?: string | null;
  portraitKey?: string | null;
  speakerName?: string | null;
  emotion?: string | null;
}

export function resolvePortraitAsset(bundle: KitBundle | null, keys: DialoguePortraitKeys): string | null {
  if (!bundle) return null;
  const recipeId = resolveRecipeId(bundle, { recipeId: keys.recipeId, actor: keys.portraitKey, speaker: keys.speakerName });
  if (!recipeId) return null;
  const visual = resolveCharacter(bundle, { kind: 'receta', recipeId });
  const source = visualPortrait(visual, portraitStateFor(bundle, keys.emotion));
  return source ? sheetSourceUrl(source) : null;
}
```

- [ ] **Step 4: Diálogo, modelo, `simulation-play` y resultado**

**1. Modelo.** En `DialogueState` (`simulation.model.ts`), añade:

```ts
  /** Receta del kit del NPC que habla (solo en el cliente: diálogos de NPC de escenario). */
  recipeId?: string | null;
```

**2. `simulation-play.component.ts`.** En `showNpcDialogue`, justo después de `key: \`npc-${npc.key}\`,`:

```ts
      recipeId: npc.recipeId,
```

**3. `dialogue-panel.component.ts`.**
- Inyecta `private readonly kit = inject(KitService);` y, en el constructor, `this.kit.load().catch(() => undefined);`.
- `portraitSrc` pasa a:

```ts
  /**
   * Retrato pixel-art de la línea actual (spec §8.2), o `null` si no hay retrato (voz sin
   * cuerpo, kit sin cargar o imagen fallida) → el panel muestra la silueta SVG.
   */
  portraitSrc(d: DialogueState): string | null {
    const line = this.activeLine();
    const lineSpeaker = line?.speakerName?.trim() || null;
    const treeSpeaker = d.speakerName?.trim() || null;
    // La receta y la clave del árbol valen para sus propias líneas, no para las de otro hablante.
    const sameSpeaker = !lineSpeaker || lineSpeaker === treeSpeaker;
    const asset = resolvePortraitAsset(this.kit.bundle(), {
      recipeId: sameSpeaker ? d.recipeId ?? null : null,
      portraitKey: sameSpeaker ? d.portraitKey : null,
      speakerName: lineSpeaker || treeSpeaker,
      emotion: line?.emotion?.trim() || d.emotion?.trim() || 'neutral',
    });
    return asset && this.failedPortrait() !== asset ? asset : null;
  }
```

- Plantilla: el `<img>` pasa a `<img class="portrait-img" [src]="src" alt="" width="96" height="96" (error)="onPortraitError(src)" />`.
- Estilos:
  - `.portrait { … width: 112px; … }`;
  - `.portrait-img { width: 96px; height: 96px; image-rendering: pixelated; }`, sin `object-fit`, `object-position`, `height: 100%` ni `min-height: 0`;
  - en `@media (max-width: 560px)`, `.portrait { width: 104px; min-height: 180px; }`;
  - `.dialogue-strip--side .portrait-img { width: 96px; height: 96px; }`.

**4. `attempt-outcome.component.ts`.**
- Imports: cambia `AvatarFigureComponent` por `KitFigureComponent` en `imports` y en el import.
- Inyecta `KitService` y añade:

```ts
  private readonly kit = inject(KitService);
  /** Retrato neutral del jugador (spec §8.2: ×3, 96 px). */
  readonly playerVisual = computed(() => {
    const bundle = this.kit.bundle();
    return bundle ? resolveCharacter(bundle, { kind: 'jugador', avatar: toAvatarV2(this.avatarStore.avatar()) }) : null;
  });
```

  y en el constructor (créalo si no existe): `this.kit.load().catch(() => undefined);`.
- Plantilla: `<app-avatar-figure [config]="avatar()" [portrait]="true" />` pasa a `<app-kit-figure [visual]="playerVisual()" portrait="neutral" [scale]="3" />`.
- Estilos:
  - `.oc-avatar { width: 96px; height: 96px; flex: 0 0 auto; border-radius: 16px; overflow: hidden; background: rgba(124,77,255,.14); border: 1px solid rgba(182,156,255,.4); display: grid; place-items: center; }`;
  - borra `.oc-avatar app-avatar-figure { … }`.
- Si `avatar` ya no se usa en la plantilla, borra `readonly avatar = …`.

**5. Specs.** `dialogue-panel.component.spec.ts` y `attempt-outcome.component.spec.ts` reciben `{ provide: KitService, useValue: fakeKitService() }`. Toda expectativa que nombre `/assets/characters/portraits/…` pasa a la ruta del kit de la misma persona (`/assets/characters/kit/<receta>/portrait-<estado>.png`), según `catalog.speakers` y la tabla de estados del spec §7.3.

- [ ] **Step 5: Córrelas y mira que pasen**

Run: `npm test -- --runInBand "portrait-resolver|portraits.contract|dialogue-panel|attempt-outcome"`
Expected: PASS.

- [ ] **Step 6: Cierre y commit**

Run: `npm test -- --runInBand` y `npm run build`
Expected: todo verde.

```bash
git add src/app/features/simulator/portrait-resolver.util.ts src/app/features/simulator/portrait-resolver.util.spec.ts \
  src/app/features/simulator/portraits.contract.spec.ts src/app/features/simulator/dialogue-panel.component.ts \
  src/app/features/simulator/dialogue-panel.component.spec.ts src/app/core/models/simulation.model.ts \
  src/app/features/simulator/simulation-play.component.ts src/app/features/simulator/attempt-outcome.component.ts \
  src/app/features/simulator/attempt-outcome.component.spec.ts
git commit -m "feat(personajes): retratos del kit en el diálogo y el resultado, a ×3

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: NPC del editor de mundo — plantilla = receta u opciones del kit

**Files:**
- Create: `frontend/src/app/features/simulator/world-editor/npc-metadata.util.ts`
- Modify: `frontend/src/app/features/simulator/world-editor/world-editor.component.ts`
- Test: `frontend/src/app/features/simulator/world-editor/npc-metadata.util.spec.ts`

**Interfaces:**
- Consumes:
  - de la tarea 7: `personCharacterRef`;
  - de la tarea 1: `toAvatarV2`, `coerceAvatarV2`, `defaultPersonalizado`, `AvatarPersonalizado`, las listas y `AVATAR_LABELS`;
  - de la tarea 2: `resolveCharacter` y `KitService`;
  - de la tarea 8: `KitFigureComponent`.
- Produces:
  - `npcCustomAvatar(metadata: unknown): AvatarPersonalizado`;
  - `npcMetadataForRecipe(metadata: unknown, recipeId: string): Record<string, unknown>`;
  - `npcMetadataForCustom(metadata: unknown, avatar: AvatarPersonalizado): Record<string, unknown>`.

Esto implementa el spec §9.2: al editar, el editor de mundo guarda el avatar en v2, o `metadata.recipeId` si el docente eligió una receta.

- [ ] **Step 1: Escribe la prueba que falla**

```ts
// frontend/src/app/features/simulator/world-editor/npc-metadata.util.spec.ts
import { defaultPersonalizado } from '../../character/kit/avatar-v2';
import { npcCustomAvatar, npcMetadataForCustom, npcMetadataForRecipe } from './npc-metadata.util';

describe('metadata de NPC del editor de mundo (spec §9.2)', () => {
  it('el avatar personalizado sale de metadata.avatar (v1 o v2); si no hay, el de por defecto', () => {
    expect(npcCustomAvatar({ avatar: { gender: 'male', hairStyle: 'largo', hairColor: 'rubio' } }))
      .toEqual({ ...defaultPersonalizado(), complexion: 'b', hair: 'largo-suelto', hairColor: 'rubio' });
    expect(npcCustomAvatar({ avatar: { castId: 'david' } })).toEqual(defaultPersonalizado());
    expect(npcCustomAvatar(undefined)).toEqual(defaultPersonalizado());
  });

  it('elegir una receta guarda recipeId y limpia la plantilla vieja y el avatar, sin tocar lo demás', () => {
    expect(npcMetadataForRecipe({ scale: 0.8, npcTemplateId: 'mujer-adulta', avatar: { gender: 'female' } }, 'seguridad'))
      .toEqual({ scale: 0.8, recipeId: 'seguridad', npcTemplateId: '', avatar: null });
  });

  it('personalizar guarda el avatar en v2, ya validado, sin receta ni plantilla', () => {
    const avatar = { ...defaultPersonalizado(), hair: 'afro' as const, accessories: ['gafete', 'sombrero'] as never };
    expect(npcMetadataForCustom({ recipeId: 'seguridad', label: 'x' }, avatar))
      .toEqual({ label: 'x', recipeId: '', npcTemplateId: '', avatar: { ...defaultPersonalizado(), hair: 'afro', accessories: ['gafete'] } });
  });
});
```

- [ ] **Step 2: Córrela y mira que falle**

Run: `npm test -- --runInBand npc-metadata`
Expected: FAIL; no encuentra el módulo.

- [ ] **Step 3: Escribe `npc-metadata.util.ts`**

```ts
// frontend/src/app/features/simulator/world-editor/npc-metadata.util.ts
/**
 * Metadata de un NPC autorado (PERSON) en el editor de mundo (spec §9.2). Se lee con la
 * misma migración que el avatar del estudiante y se guarda en formato 2; elegir una receta
 * guarda `metadata.recipeId`. Las demás claves de metadata se conservan.
 */
import { AvatarPersonalizado, coerceAvatarV2, defaultPersonalizado, toAvatarV2 } from '../../character/kit/avatar-v2';

const asRecord = (x: unknown): Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {};

export function npcCustomAvatar(metadata: unknown): AvatarPersonalizado {
  const avatar = toAvatarV2(asRecord(metadata)['avatar']);
  return avatar.mode === 'personalizado' ? avatar : defaultPersonalizado();
}

export function npcMetadataForRecipe(metadata: unknown, recipeId: string): Record<string, unknown> {
  return { ...asRecord(metadata), recipeId, npcTemplateId: '', avatar: null };
}

export function npcMetadataForCustom(metadata: unknown, avatar: AvatarPersonalizado): Record<string, unknown> {
  return { ...asRecord(metadata), recipeId: '', npcTemplateId: '', avatar: coerceAvatarV2(avatar) };
}
```

- [ ] **Step 4: Migra el panel del NPC en `world-editor.component.ts`**

1. **Imports.**
   - Fuera: `avatar.model`, `avatar-config.util` y `AvatarFigureComponent`, y `AUTHORING_HAIR_VARIANTS` y `AUTHORING_NPC_TEMPLATES`.
   - Entran:

   ```ts
   import { AVATAR_LABELS, AvatarPersonalizado, COMPLEXIONS, HAIRS, HAIR_COLORS, SKINS } from '../../character/kit/avatar-v2';
   import { resolveCharacter } from '../../character/kit/character-visual.resolver';
   import { KitFigureComponent } from '../../character/kit/kit-figure.component';
   import { KitService } from '../../character/kit/kit.service';
   import { personCharacterRef } from '../world-characters.util';
   import { npcCustomAvatar, npcMetadataForCustom, npcMetadataForRecipe } from './npc-metadata.util';
   ```

   - En `imports` del componente, `AvatarFigureComponent` pasa a `KitFigureComponent`.

2. **Plantilla.** Reemplaza el bloque `@if (obj.type === 'PERSON') { … }` entero por:

```html
              @if (obj.type === 'PERSON') {
                <div class="we-npc-kit">
                  <div class="we-npc-head">
                    <h4>NPC</h4>
                    <div class="we-npc-preview" aria-hidden="true">
                      <app-kit-figure [visual]="npcVisual(obj)" view="down" [scale]="1" />
                      <app-kit-figure [visual]="npcVisual(obj)" view="left" [scale]="1" />
                    </div>
                  </div>
                  <label><span>Personaje</span>
                    <select [ngModel]="npcRecipeChoice(obj)" (ngModelChange)="setNpcRecipe(obj.key, $event)">
                      <option value="">Personalizado</option>
                      @for (recipe of npcRecipes(); track recipe.id) {
                        <option [value]="recipe.id">{{ recipe.label }}</option>
                      }
                    </select>
                  </label>
                  @if (!npcRecipeChoice(obj)) {
                    <div class="we-form-row">
                      <label><span>Complexión</span>
                        <select [ngModel]="npcCustom(obj).complexion" (ngModelChange)="setNpcCustom(obj.key, { complexion: $event })">
                          @for (id of complexions; track id) { <option [value]="id">{{ labels.complexion[id] }}</option> }
                        </select>
                      </label>
                      <label><span>Piel</span>
                        <select [ngModel]="npcCustom(obj).skin" (ngModelChange)="setNpcCustom(obj.key, { skin: $event })">
                          @for (id of skins; track id; let i = $index) { <option [value]="id">Tono {{ i + 1 }}</option> }
                        </select>
                      </label>
                    </div>
                    <div class="we-form-row">
                      <label><span>Pelo</span>
                        <select [ngModel]="npcCustom(obj).hair" (ngModelChange)="setNpcCustom(obj.key, { hair: $event })">
                          @for (id of hairs; track id) { <option [value]="id">{{ labels.hair[id] }}</option> }
                        </select>
                      </label>
                      <label><span>Color</span>
                        <select [ngModel]="npcCustom(obj).hairColor" (ngModelChange)="setNpcCustom(obj.key, { hairColor: $event })">
                          @for (id of hairColors; track id) { <option [value]="id">{{ labels.hairColor[id] }}</option> }
                        </select>
                      </label>
                    </div>
                  }
                </div>
              }
```

3. **Estilos.** `.we-npc-preview app-avatar-figure { width: 36px; height: 54px; }` pasa a `.we-npc-preview { display: flex; gap: 6px; align-items: flex-end; }`.

4. **Clase.**
   - Fuera: `genderOptions`, `clothingColors`, `npcTemplates`, `hairVariants`, `mouthOptions` y `eyeOptions`, más los métodos `npcAvatar`, `npcGender`, `npcTemplateId`, `npcHairVariant`, `setNpcGender`, `applyNpcTemplate`, `setNpcHair` y `setNpcAvatarField`. Busca con `grep -n` que no quede ningún uso.
   - Entra:

```ts
  private readonly kit = inject(KitService);
  readonly complexions = COMPLEXIONS;
  readonly skins = SKINS;
  readonly hairs = HAIRS;
  readonly hairColors = HAIR_COLORS;
  readonly labels = AVATAR_LABELS;
  /** Recetas que un docente puede asignar a un NPC: todas menos los jugables, por nombre. */
  readonly npcRecipes = computed(() => {
    const bundle = this.kit.bundle();
    if (!bundle) return [];
    return Object.entries(bundle.recipes)
      .filter(([, recipe]) => recipe.kind !== 'jugable')
      .map(([id, recipe]) => ({ id, label: recipe.displayName ?? id }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  });

  /** Lo mismo que dibuja el mundo (personCharacterRef), para la vista previa. */
  npcVisual(obj: WorldObject) {
    const bundle = this.kit.bundle();
    return bundle ? resolveCharacter(bundle, personCharacterRef(bundle, obj)) : null;
  }

  /** Receta elegida, o '' si el NPC es personalizado (avatar autorado). */
  npcRecipeChoice(obj: WorldObject): string {
    const bundle = this.kit.bundle();
    if (!bundle) return '';
    const ref = personCharacterRef(bundle, obj);
    return ref.kind === 'receta' ? ref.recipeId : '';
  }

  npcCustom(obj: WorldObject): AvatarPersonalizado {
    return npcCustomAvatar(obj.metadata);
  }

  setNpcRecipe(key: string, recipeId: string): void {
    const obj = this.store.selectedObject();
    if (!obj) return;
    this.updateNpcMetadataTo(key, recipeId
      ? npcMetadataForRecipe(obj.metadata, recipeId)
      : npcMetadataForCustom(obj.metadata, npcCustomAvatar(obj.metadata)));
  }

  setNpcCustom(key: string, patch: Partial<AvatarPersonalizado>): void {
    const obj = this.store.selectedObject();
    if (!obj) return;
    this.updateNpcMetadataTo(key, npcMetadataForCustom(obj.metadata, { ...npcCustomAvatar(obj.metadata), ...patch }));
  }

  private updateNpcMetadataTo(key: string, metadata: Record<string, unknown>): void {
    this.store.execute(new UpdateInspectorCommand(key, { metadata }));
  }
```

   - En el constructor, o en `ngOnInit` si ya existe: `this.kit.load().catch(() => undefined);`.
   - `updateNpcMetadata(...)` también se borra si ya nadie lo usa.
   - Agrega `computed` e `inject` al import de `@angular/core` si faltan.

- [ ] **Step 5: Córrelas y mira que pasen**

Run: `npm test -- --runInBand "npc-metadata|world-editor"`
Expected: PASS (`npc-metadata`, 3 pruebas; los specs que ya existían del editor siguen verdes).

- [ ] **Step 6: Cierre y commit**

Run: `npm test -- --runInBand` y `npm run build`
Expected: todo verde.

```bash
git add src/app/features/simulator/world-editor/npc-metadata.util.ts src/app/features/simulator/world-editor/npc-metadata.util.spec.ts \
  src/app/features/simulator/world-editor/world-editor.component.ts
git commit -m "feat(personajes): NPC del editor de mundo con recetas u opciones del kit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: El avatar del estudiante en formato 2 y el editor de personaje del kit

**Files:**
- Modify: `frontend/src/app/features/character/avatar.store.ts` (formato 2, migración y copia v1)
- Create: `frontend/src/app/features/character/character-editor.util.ts`
- Modify: `frontend/src/app/features/character/character-editor.component.ts` (se reescribe)
- Test: `frontend/src/app/features/character/avatar.store.spec.ts` (se reescribe), `character-editor.util.spec.ts` (nuevo); se borra `character-editor.preview.spec.ts`

**Interfaces:**
- Consumes de la tarea 1: todo `avatar-v2.ts`; de la tarea 2, `resolveCharacter`, `BATA_VARIANT` y `KitService`; de la tarea 8, `KitFigureComponent`.
- Produces:
  - `AVATAR_STORAGE_KEY` (no cambia) y `AVATAR_V1_BACKUP_KEY = 'psychosim_avatar_v1'`;
  - `AvatarStore { avatar: Signal<AvatarV2>; loadSaved(); set(avatar: AvatarV2); save(); reset() }`. Desaparece `update(patch)`.
  - `character-editor.util.ts`: `chooseElenco(current, recipeId)`, `choosePersonalizado(current, lastCustom)`, `withBata(current, bata)`, `withCustom(current, patch)`, `toggleAccessory(current, id)` y `avatarSummary(avatar, labelOf)`.

- [ ] **Step 1: Escribe las pruebas que fallan**

```ts
// frontend/src/app/features/character/avatar.store.spec.ts (reemplaza el archivo)
import { AVATAR_STORAGE_KEY, AVATAR_V1_BACKUP_KEY, AvatarStore } from './avatar.store';
import { defaultAvatarV2, serializeAvatarV2 } from './kit/avatar-v2';

function mockStorage(initial: Record<string, string> = {}): Storage {
  const m = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => m.has(k) ? m.get(k)! : null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

describe('AvatarStore (formato 2)', () => {
  it('sin nada guardado, el valor por defecto', () => {
    expect(new AvatarStore(mockStorage()).avatar()).toEqual(defaultAvatarV2());
  });

  it('se puede construir sin Storage (camino de DI) sin lanzar', () => {
    expect(() => new AvatarStore()).not.toThrow();
  });

  it('un v1 guardado se migra, se reescribe en v2 y su texto original queda en la copia', () => {
    const v1 = JSON.stringify({ castId: 'mateo', uniform: 'con-bata', hairStyle: 'largo' });
    const storage = mockStorage({ [AVATAR_STORAGE_KEY]: v1 });
    const store = new AvatarStore(storage);
    expect(store.avatar()).toEqual({ schemaVersion: 2, mode: 'elenco', recipeId: 'mateo', bata: true });
    expect(storage.getItem(AVATAR_V1_BACKUP_KEY)).toBe(v1);
    expect(JSON.parse(storage.getItem(AVATAR_STORAGE_KEY)!)).toEqual(store.avatar());
  });

  it('la copia v1 se guarda una sola vez (no la pisa una segunda migración)', () => {
    const storage = mockStorage({ [AVATAR_STORAGE_KEY]: JSON.stringify({ castId: 'david' }), [AVATAR_V1_BACKUP_KEY]: 'original' });
    new AvatarStore(storage);
    expect(storage.getItem(AVATAR_V1_BACKUP_KEY)).toBe('original');
  });

  it('un v2 corrupto o de otra versión carga el valor por defecto y no toca lo guardado', () => {
    const storage = mockStorage({ [AVATAR_STORAGE_KEY]: '{"schemaVersion":3,"mode":"elenco"}' });
    expect(new AvatarStore(storage).avatar()).toEqual(defaultAvatarV2());
    expect(storage.getItem(AVATAR_STORAGE_KEY)).toBe('{"schemaVersion":3,"mode":"elenco"}');
    expect(storage.getItem(AVATAR_V1_BACKUP_KEY)).toBeNull();
  });

  it('set no guarda hasta save; reset vuelve al valor por defecto sin borrar lo guardado', () => {
    const storage = mockStorage();
    const store = new AvatarStore(storage);
    const luisa = { schemaVersion: 2, mode: 'elenco', recipeId: 'luisa', bata: true } as const;
    store.set(luisa);
    expect(storage.getItem(AVATAR_STORAGE_KEY)).toBeNull();
    store.save();
    expect(storage.getItem(AVATAR_STORAGE_KEY)).toBe(serializeAvatarV2(luisa));
    store.reset();
    expect(store.avatar()).toEqual(defaultAvatarV2());
    expect(storage.getItem(AVATAR_STORAGE_KEY)).toBe(serializeAvatarV2(luisa));
  });

  it('si el almacenamiento falla (cuota, modo privado), no rompe', () => {
    const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cuota'); } } as unknown as Storage;
    const store = new AvatarStore(broken);
    expect(store.avatar()).toEqual(defaultAvatarV2());
    expect(() => store.save()).not.toThrow();
  });
});
```

```ts
// frontend/src/app/features/character/character-editor.util.spec.ts
import { AvatarPersonalizado, defaultAvatarV2, defaultPersonalizado } from './kit/avatar-v2';
import { avatarSummary, chooseElenco, choosePersonalizado, toggleAccessory, withBata, withCustom } from './character-editor.util';

const custom: AvatarPersonalizado = { ...defaultPersonalizado(), hair: 'trenza', skin: 'piel-5' };

describe('character-editor.util', () => {
  it('la bata es un solo interruptor que sobrevive al cambio de modo (decisión 17)', () => {
    const conBata = withBata(defaultAvatarV2(), true);
    expect(chooseElenco(conBata, 'jorge')).toEqual({ schemaVersion: 2, mode: 'elenco', recipeId: 'jorge', bata: true });
    expect(choosePersonalizado(conBata, null)).toEqual({ ...defaultPersonalizado(), bata: true });
    expect(choosePersonalizado(withBata(defaultAvatarV2(), false), custom)).toEqual({ ...custom, bata: false });
  });

  it('pasar al personalizado estando en él no cambia nada', () => {
    expect(choosePersonalizado(custom, null)).toBe(custom);
  });

  it('los cambios del personalizado se validan', () => {
    expect(withCustom(custom, { hair: 'afro' }).hair).toBe('afro');
    expect(withCustom(custom, { hair: 'cresta' as never }).hair).toBe('corto-liso');
  });

  it('accesorios: se agregan y se quitan, en el orden del editor', () => {
    const conGafete = toggleAccessory(custom, 'gafete');
    expect(conGafete.accessories).toEqual(['gafete']);
    expect(toggleAccessory(conGafete, 'gafas').accessories).toEqual(['gafas', 'gafete']);
    expect(toggleAccessory(conGafete, 'gafete').accessories).toEqual([]);
  });

  it('resumen para lectores de pantalla', () => {
    const label = (id: string) => ({ jorge: 'Jorge' } as Record<string, string>)[id] ?? id;
    expect(avatarSummary({ schemaVersion: 2, mode: 'elenco', recipeId: 'jorge', bata: true }, label)).toBe('Jorge, del elenco, con bata.');
    expect(avatarSummary({ ...custom, bata: false }, label)).toBe('Avatar personalizado: complexión A, tono 5, trenza negro, sin bata.');
  });
});
```

Borra `src/app/features/character/character-editor.preview.spec.ts`: probaba la vista previa del sistema viejo.

- [ ] **Step 2: Córrelas y mira que fallen**

Run: `npm test -- --runInBand "avatar.store|character-editor"`
Expected: FAIL. `AVATAR_V1_BACKUP_KEY` no existe, el almacén guarda `AvatarConfig` v1 y falta `character-editor.util`.

- [ ] **Step 3: El almacén en formato 2**

```ts
// frontend/src/app/features/character/avatar.store.ts (reemplaza el archivo)
import { Injectable, Optional, signal } from '@angular/core';

import { AvatarV2, defaultAvatarV2, parseStoredAvatar, serializeAvatarV2 } from './kit/avatar-v2';

/** Clave compartida de persistencia del avatar (la lee también el runtime Phaser). */
export const AVATAR_STORAGE_KEY = 'psychosim_avatar';
/** Copia del texto v1 original, guardada una sola vez al migrar (spec §9.1). */
export const AVATAR_V1_BACKUP_KEY = 'psychosim_avatar_v1';

@Injectable({ providedIn: 'root' })
export class AvatarStore {
  private readonly store: Storage | null;
  private readonly _avatar = signal<AvatarV2>(defaultAvatarV2());
  readonly avatar = this._avatar.asReadonly();

  /**
   * `storage` es opcional y solo lo usan las pruebas. Bajo la DI de Angular no hay proveedor de
   * `Storage`: `@Optional()` hace que el inyector pase `null` y se usa `window.localStorage`.
   */
  constructor(@Optional() storage?: Storage) {
    this.store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    this.loadSaved();
  }

  /** Lee lo guardado; un v1 se migra, se reescribe en v2 y su texto original queda en la copia. */
  loadSaved(): void {
    const { avatar, legacyRaw } = parseStoredAvatar(this.safeGet(AVATAR_STORAGE_KEY));
    this._avatar.set(avatar);
    if (legacyRaw === null) return;
    if (this.safeGet(AVATAR_V1_BACKUP_KEY) === null) this.safeSet(AVATAR_V1_BACKUP_KEY, legacyRaw);
    this.safeSet(AVATAR_STORAGE_KEY, serializeAvatarV2(avatar));
  }

  set(avatar: AvatarV2): void {
    this._avatar.set(avatar);
  }

  save(): void {
    this.safeSet(AVATAR_STORAGE_KEY, serializeAvatarV2(this._avatar()));
  }

  reset(): void {
    this._avatar.set(defaultAvatarV2());
  }

  private safeGet(key: string): string | null {
    try { return this.store?.getItem(key) ?? null; } catch { return null; }
  }

  private safeSet(key: string, value: string): void {
    try { this.store?.setItem(key, value); } catch { /* cuota o modo privado: no-op */ }
  }
}
```

- [ ] **Step 4: El util del editor**

```ts
// frontend/src/app/features/character/character-editor.util.ts
/** Cambios del editor de personaje sobre el avatar v2 (spec §4.7; decisiones 17-18). Puros. */
import {
  AVATAR_LABELS,
  AccessoryId,
  AvatarPersonalizado,
  AvatarV2,
  PlayableId,
  SKINS,
  coerceAvatarV2,
  defaultPersonalizado,
} from './kit/avatar-v2';

export function chooseElenco(current: AvatarV2, recipeId: PlayableId): AvatarV2 {
  return { schemaVersion: 2, mode: 'elenco', recipeId, bata: current.bata };
}

/** Al personalizado, con el último personalizado que hubo (o el de por defecto) y la bata actual. */
export function choosePersonalizado(current: AvatarV2, lastCustom: AvatarPersonalizado | null): AvatarPersonalizado {
  if (current.mode === 'personalizado') return current;
  return { ...(lastCustom ?? defaultPersonalizado()), bata: current.bata };
}

export function withBata(current: AvatarV2, bata: boolean): AvatarV2 {
  return { ...current, bata };
}

export function withCustom(current: AvatarPersonalizado, patch: Partial<AvatarPersonalizado>): AvatarPersonalizado {
  return coerceAvatarV2({ ...current, ...patch, mode: 'personalizado', schemaVersion: 2 }) as AvatarPersonalizado;
}

export function toggleAccessory(current: AvatarPersonalizado, id: AccessoryId): AvatarPersonalizado {
  const has = current.accessories.includes(id);
  return withCustom(current, { accessories: has ? current.accessories.filter(a => a !== id) : [...current.accessories, id] });
}

/** Resumen para lectores de pantalla; `labelOf` da el nombre de un jugable. */
export function avatarSummary(avatar: AvatarV2, labelOf: (recipeId: string) => string): string {
  const bata = avatar.bata ? 'con bata' : 'sin bata';
  if (avatar.mode === 'elenco') return `${labelOf(avatar.recipeId)}, del elenco, ${bata}.`;
  const tone = SKINS.indexOf(avatar.skin) + 1;
  return `Avatar personalizado: complexión ${avatar.complexion.toUpperCase()}, tono ${tone}, `
    + `${AVATAR_LABELS.hair[avatar.hair].toLowerCase()} ${AVATAR_LABELS.hairColor[avatar.hairColor].toLowerCase()}, ${bata}.`;
}
```

- [ ] **Step 5: Reescribe el editor de personaje**

`character-editor.component.ts` se reescribe.
- **Se queda igual:** el encabezado, el pie (Restablecer, Guardar personaje y Continuar), los textos del rol y los estilos `.ce-*` que siguen en uso.
- **Se borran:** `.ce-figure`, `.ce-sheet`, `.ce-cast-thumb*`, `.ce-soon` y `.ce-uniform-fig`.
- **Se añaden:** las reglas del final de este paso.
- Imports de la clase: `AvatarStore`, `KitService`, `KitFigureComponent`, `resolveCharacter`, `BATA_VARIANT`, `avatar-v2` (listas y `AVATAR_LABELS`) y `character-editor.util`.

Plantilla, entre el `<header>` y el `<footer>` que ya existen:

```html
      @if (!bundle()) {
        <section class="ce-loading glass" role="status">
          @if (loadError()) {
            <span>No pudimos cargar los personajes.</span>
            <button type="button" class="ce-btn" (click)="loadKit()">Reintentar</button>
          } @else {
            <span>Cargando personajes…</span>
          }
        </section>
      } @else {
        <div class="ce-grid">
          <section class="ce-panel glass" aria-label="Personaje">
            <p class="ce-section">Elenco</p>
            <div class="ce-cast" role="radiogroup" aria-label="Personaje del elenco">
              @for (member of cast(); track member.id) {
                <button type="button" class="ce-cast-card" [class.sel]="isElenco(member.id)"
                  role="radio" [attr.aria-checked]="isElenco(member.id)" (click)="selectElenco(member.id)">
                  <app-kit-figure [visual]="member.visual" [scale]="2" />
                  <span>{{ member.label }}</span>
                </button>
              }
              <button type="button" class="ce-cast-card" [class.sel]="!!custom()"
                role="radio" [attr.aria-checked]="!!custom()" (click)="selectPersonalizado()">
                <app-kit-figure [visual]="customVisual()" [scale]="2" />
                <span>Personalizado</span>
              </button>
            </div>

            @if (custom(); as c) {
              <p class="ce-section">Complexión</p>
              <div class="ce-opts" role="radiogroup" aria-label="Complexión">
                @for (id of complexions; track id) {
                  <button type="button" class="ce-opt" [class.sel]="c.complexion === id" role="radio"
                    [attr.aria-checked]="c.complexion === id" (click)="setCustom({ complexion: id })">{{ labels.complexion[id] }}</button>
                }
              </div>
              <p class="ce-section">Piel</p>
              <div class="ce-swatches" role="radiogroup" aria-label="Tono de piel">
                @for (id of skins; track id; let i = $index) {
                  <button type="button" class="ce-swatch" [class.sel]="c.skin === id" [style.background]="swatch(id)"
                    [title]="'Tono ' + (i + 1)" [attr.aria-label]="'Tono ' + (i + 1)" role="radio"
                    [attr.aria-checked]="c.skin === id" (click)="setCustom({ skin: id })"></button>
                }
              </div>
              <p class="ce-section">Peinado</p>
              <div class="ce-opts" role="radiogroup" aria-label="Peinado">
                @for (id of hairs; track id) {
                  <button type="button" class="ce-opt" [class.sel]="c.hair === id" role="radio"
                    [attr.aria-checked]="c.hair === id" (click)="setCustom({ hair: id })">{{ labels.hair[id] }}</button>
                }
              </div>
              <p class="ce-section">Color de pelo</p>
              <div class="ce-swatches" role="radiogroup" aria-label="Color de pelo">
                @for (id of hairColors; track id) {
                  <button type="button" class="ce-swatch" [class.sel]="c.hairColor === id" [style.background]="swatch(id)"
                    [title]="labels.hairColor[id]" [attr.aria-label]="labels.hairColor[id]" role="radio"
                    [attr.aria-checked]="c.hairColor === id" (click)="setCustom({ hairColor: id })"></button>
                }
              </div>
              <p class="ce-section">Accesorios</p>
              <div class="ce-opts">
                @for (id of accessories; track id) {
                  <label class="ce-check">
                    <input type="checkbox" [checked]="c.accessories.includes(id)" (change)="toggleAccessory(id)" />
                    <span>{{ labels.accessory[id] }}</span>
                  </label>
                }
              </div>
            }
          </section>

          <section class="ce-stage glass" aria-label="Vista previa del avatar">
            <div class="ce-halo"></div>
            <div class="ce-views">
              @for (view of views; track view.id) {
                <figure class="ce-view">
                  <app-kit-figure [visual]="visual()" [view]="view.id" [sheet]="motion()" [scale]="4" [animated]="true" />
                  <figcaption>{{ view.label }}</figcaption>
                </figure>
              }
            </div>
            <div class="ce-pose" role="radiogroup" aria-label="Animación">
              <button type="button" class="ce-opt" [class.sel]="motion() === 'idle'" role="radio"
                [attr.aria-checked]="motion() === 'idle'" (click)="motion.set('idle')">Reposo</button>
              <button type="button" class="ce-opt" [class.sel]="motion() === 'walk'" role="radio"
                [attr.aria-checked]="motion() === 'walk'" (click)="motion.set('walk')">Caminata</button>
            </div>
            <p class="sr-only">{{ summary() }}</p>
          </section>

          <section class="ce-panel glass" aria-label="Uniforme y resumen">
            <p class="ce-section">Uniforme de Psicología</p>
            <div class="ce-uniforms" role="radiogroup" aria-label="Bata">
              @for (option of bataOptions(); track option.bata) {
                <button type="button" class="ce-uniform" [class.sel]="avatar().bata === option.bata" role="radio"
                  [attr.aria-checked]="avatar().bata === option.bata" (click)="setBata(option.bata)">
                  <app-kit-figure [visual]="option.visual" [scale]="2" />
                  <span>{{ option.label }}</span>
                </button>
              }
            </div>
            <p class="ce-section">Resumen</p>
            <ul class="ce-summary">
              <li><span>Rol</span><strong>{{ roleLabel() }}</strong></li>
              <li><span>Personaje</span><strong>{{ characterLabel() }}</strong></li>
              <li><span>Bata</span><strong>{{ avatar().bata ? 'Con bata' : 'Sin bata' }}</strong></li>
            </ul>
          </section>
        </div>
      }
```

Clase:

```ts
export class CharacterEditorComponent {
  readonly store = inject(AvatarStore);
  private readonly kit = inject(KitService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  readonly avatar = this.store.avatar;
  readonly bundle = this.kit.bundle;
  readonly loadError = signal(false);
  readonly motion = signal<'idle' | 'walk'>('idle');
  /** Último personalizado visto, para volver a él después de probar el elenco. */
  private readonly lastCustom = signal<AvatarPersonalizado | null>(null);

  readonly complexions = COMPLEXIONS;
  readonly skins = SKINS;
  readonly hairs = HAIRS;
  readonly hairColors = HAIR_COLORS;
  readonly accessories = ACCESSORIES;
  readonly labels = AVATAR_LABELS;
  readonly views = [
    { id: 'down', label: 'Frente' }, { id: 'left', label: 'Izquierda' },
    { id: 'right', label: 'Derecha' }, { id: 'up', label: 'Espalda' },
  ] as const;

  readonly custom = computed(() => {
    const avatar = this.avatar();
    return avatar.mode === 'personalizado' ? avatar : null;
  });

  readonly visual = computed(() => {
    const bundle = this.bundle();
    return bundle ? resolveCharacter(bundle, { kind: 'jugador', avatar: this.avatar() }) : null;
  });

  /** Tarjetas del elenco, con o sin bata según el interruptor (cuadro 0 a ×2, spec §8.2). */
  readonly cast = computed(() => {
    const bundle = this.bundle();
    if (!bundle) return [];
    const variant = this.avatar().bata ? BATA_VARIANT : null;
    return PLAYABLE_IDS.map(id => ({
      id,
      label: bundle.recipes[id]?.displayName ?? id,
      visual: resolveCharacter(bundle, { kind: 'receta', recipeId: id, variant }),
    }));
  });

  readonly customVisual = computed(() => {
    const bundle = this.bundle();
    return bundle ? resolveCharacter(bundle, { kind: 'jugador', avatar: choosePersonalizado(this.avatar(), this.lastCustom()) }) : null;
  });

  readonly bataOptions = computed(() => {
    const bundle = this.bundle();
    return [false, true].map(bata => ({
      bata,
      label: bata ? 'Con bata' : 'Sin bata',
      visual: bundle ? resolveCharacter(bundle, { kind: 'jugador', avatar: withBata(this.avatar(), bata) }) : null,
    }));
  });

  readonly roleLabel = computed(() => {
    const role = this.auth.currentUser()?.role;
    return role === 'PROFESOR' ? 'Docente' : role === 'ADMIN' ? 'Administrador' : 'Estudiante';
  });

  readonly characterLabel = computed(() => {
    const avatar = this.avatar();
    return avatar.mode === 'elenco' ? this.recipeLabel(avatar.recipeId) : 'Personalizado';
  });

  readonly summary = computed(() => avatarSummary(this.avatar(), id => this.recipeLabel(id)));

  constructor() {
    this.loadKit();
  }

  loadKit(): void {
    this.loadError.set(false);
    this.kit.load().catch(() => this.loadError.set(true));
  }

  isElenco(id: string): boolean {
    const avatar = this.avatar();
    return avatar.mode === 'elenco' && avatar.recipeId === id;
  }

  selectElenco(id: PlayableId): void {
    const custom = this.custom();
    if (custom) this.lastCustom.set(custom);
    this.store.set(chooseElenco(this.avatar(), id));
  }

  selectPersonalizado(): void {
    this.store.set(choosePersonalizado(this.avatar(), this.lastCustom()));
  }

  setCustom(patch: Partial<AvatarPersonalizado>): void {
    const custom = this.custom();
    if (custom) this.store.set(withCustom(custom, patch));
  }

  toggleAccessory(id: AccessoryId): void {
    const custom = this.custom();
    if (custom) this.store.set(toggleAccessory(custom, id));
  }

  setBata(bata: boolean): void {
    this.store.set(withBata(this.avatar(), bata));
  }

  /** Color base de la rampa (piel o pelo) para la muestra. */
  swatch(rampId: string): string {
    const ramp = this.bundle()?.ramps[rampId];
    return ramp ? ramp[1] : 'transparent';
  }

  private recipeLabel(id: string): string {
    return this.bundle()?.recipes[id]?.displayName ?? id;
  }

  guardar(): void {
    this.store.save();
    this.notify.success('Personaje guardado.');
  }

  restablecer(): void {
    this.store.reset();
  }

  continuar(): void {
    this.store.save();
    this.router.navigate(['/portal/simulador']);
  }
}
```

Estilos nuevos (los demás `.ce-*` se quedan):

```css
    .ce-loading { display: flex; align-items: center; justify-content: center; gap: 12px; min-height: 240px; padding: 24px; color: var(--ink-soft); }
    .ce-cast { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; }
    .ce-views { position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
    .ce-view { margin: 0; display: grid; justify-items: center; gap: 6px; color: var(--ink-soft); font-size: .76rem; font-weight: 800; }
    .ce-check { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); color: var(--ink-soft); font-size: .78rem; font-weight: 700; cursor: pointer; }
```

El cuadro 0 del sprite a ×2 mide 96×144. El mínimo de 112 px de la grilla deja margen para el borde de la tarjeta.

- [ ] **Step 6: Córrelas y mira que pasen**

Run: `npm test -- --runInBand "avatar.store|character-editor"`
Expected: PASS (almacén, 7 pruebas; util, 5).

- [ ] **Step 7: Cierre y commit**

Run:
- `npm test -- --runInBand`
- `npm run build`

Expected: todo verde.
- Lobby, intro, resultado y mundo ya leían con `toAvatarV2`/`parseStoredAvatar`, que acepta v2, así que no cambian.
- Si `ng build` marca usos de `store.update(…)` en otro lugar, cámbialos por `store.set(…)`.

```bash
git add src/app/features/character/avatar.store.ts src/app/features/character/avatar.store.spec.ts \
  src/app/features/character/character-editor.util.ts src/app/features/character/character-editor.util.spec.ts \
  src/app/features/character/character-editor.component.ts
git rm src/app/features/character/character-editor.preview.spec.ts
git commit -m "feat(personajes): avatar en formato 2 con copia v1 y editor de personaje del kit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Borrar el legado y el validador «sin legado»

**Files:**
- Create: `frontend/scripts/character-kit/legacy.test.mjs`
- Move: `frontend/src/assets/characters/v1/palette.v1.json` → `frontend/src/assets/visual/v1/palette.v1.json`
- Delete (spec §10): ver el paso 3
- Modify:
  - `frontend/src/app/features/simulator/kenney-frames.constants.ts`, `authoring-catalog.config.ts`
  - `frontend/src/app/core/models/simulation.model.ts` (`NpcAvatarPresetKey`)
  - `frontend/package.json`, `../.github/workflows/ci.yml`
  - `frontend/scripts/validate-premium-visual-assets.mjs:34`, `frontend/scripts/visual-asset-manifest-lib.test.mjs`
  - `frontend/scripts/character-kit/coverage-sources.mjs`, `coverage.test.mjs`, `check.mjs`

**Interfaces:**
- Consumes: todo lo anterior. Ya nada de la app importa el sistema viejo.
- Produces:
  - `legacyFindings(root?): string[]`, `LEGACY_PATHS` y `LEGACY_PATTERNS`;
  - `SOURCE_MINIMUMS` y `checkSourceMinimums(refs)`;
  - el script `test:visual-assets`, que reemplaza a `test:character-assets`.

**Ruling:** `palette.v1.json` no se borra; se mueve a `assets/visual/v1/`.
- Por qué: la usa el arte del mundo (74 entradas de `inventory.v1.json` con `paletteId: siep-master-v1`).
- Qué cambia: los personajes ya usan `palette.v2.json` del kit (spec §10).
- Costo si está mal: mover un archivo.

- [ ] **Step 1: Escribe la prueba que falla**

```js
// frontend/scripts/character-kit/legacy.test.mjs
/**
 * «Sin legado» (spec §6.7): lo que el spec §10 borra no puede volver. Falla si existen
 * las carpetas o módulos viejos, o si el código de la app usa rutas viejas, cuadros de
 * personaje de Kenney, deformación de sprites o tintes en tiempo de ejecución.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { FRONTEND_ROOT } from './bundle.mjs';

export const LEGACY_PATHS = Object.freeze([
  'src/assets/characters/cast',
  'src/assets/characters/modular',
  'src/assets/characters/modular-legacy',
  'src/assets/characters/portraits',
  'src/assets/characters/v1',
  'src/app/features/simulator/baked-cast.util.ts',
  'src/app/features/simulator/phaser-avatar-renderer.ts',
  'src/app/features/simulator/npc-avatar-presets.ts',
  'src/app/features/simulator/v1-avatar.util.ts',
  'src/app/features/simulator/character-motion.util.ts',
  'src/app/features/character/avatar-render-plan.util.ts',
  'src/app/features/character/avatar-render-plan.model.ts',
  'src/app/features/character/actor-render-plan.util.ts',
  'src/app/features/character/actor-render-plan.model.ts',
  'src/app/features/character/character-manifest.model.ts',
  'src/app/features/character/clinical-emotion-portrait.util.ts',
  'src/app/features/character/avatar.model.ts',
  'src/app/features/character/avatar-config.util.ts',
  'src/app/features/character/avatar-figure.component.ts',
  'src/app/features/character/editor-preview.util.ts',
  'scripts/character-manifest-lib.mjs',
  'scripts/validate-character-manifest.mjs',
  'scripts/render-premium-contact-sheets.mjs',
  '../tools/cast-assets',
  '../tools/character-assets',
]);

export const LEGACY_PATTERNS = Object.freeze([
  [/characters\/(cast|modular|modular-legacy|portraits|v1)\//, 'ruta de personajes vieja'],
  [/KenneyCharFrames/, 'cuadros de personaje de Kenney'],
  [/character-motion/, 'deformación de sprites (character-motion)'],
  [/\.setTint\(/, 'tinte en tiempo de ejecución'],
  [/baked-cast|phaser-avatar-renderer|npc-avatar-presets|v1-avatar\.util|avatar-config\.util|avatar\.model|avatar-figure\.component/, 'módulo de personajes borrado'],
]);

/** Código de la app (sin specs: los contratos citan los patrones prohibidos para negarlos). */
function appSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...appSources(full));
    else if (/\.(ts|html|scss)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

export function legacyFindings(root = FRONTEND_ROOT) {
  const findings = [];
  for (const rel of LEGACY_PATHS) if (existsSync(path.join(root, rel))) findings.push(`existe ${rel}`);
  const app = path.join(root, 'src', 'app');
  if (existsSync(app)) {
    for (const file of appSources(app)) {
      const text = readFileSync(file, 'utf8');
      for (const [pattern, what] of LEGACY_PATTERNS) {
        if (pattern.test(text)) findings.push(`${path.relative(root, file).replace(/\\/g, '/')}: ${what}`);
      }
    }
  }
  return findings;
}

test('sin legado de personajes (spec §6.7, §10)', () => {
  assert.deepEqual(legacyFindings(), []);
});

test('el detector ve una carpeta borrada, una ruta vieja y un tinte', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'legado-'));
  try {
    mkdirSync(path.join(root, 'src', 'assets', 'characters', 'v1'), { recursive: true });
    mkdirSync(path.join(root, 'src', 'app'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'app', 'x.ts'), "const a = '/assets/characters/cast/x.png'; sprite.setTint(0xff0000);");
    writeFileSync(path.join(root, 'src', 'app', 'x.spec.ts'), "expect(source).not.toContain('.setTint(');");
    assert.deepEqual(legacyFindings(root), [
      'existe src/assets/characters/v1',
      'src/app/x.ts: ruta de personajes vieja',
      'src/app/x.ts: tinte en tiempo de ejecución',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Córrela y mira que falle**

Run: `npm run test:kit`
Expected: FAIL en «sin legado de personajes». La lista trae `existe src/assets/characters/cast`, el resto de las carpetas y módulos, y algún patrón en `authoring-catalog.config.ts` y `kenney-frames.constants.ts`. «El detector ve…» pasa.

- [ ] **Step 3: Mueve la paleta del mundo y borra el legado**

```bash
mkdir -p src/assets/visual/v1
git mv src/assets/characters/v1/palette.v1.json src/assets/visual/v1/palette.v1.json
git rm -r -q src/assets/characters/cast src/assets/characters/modular src/assets/characters/modular-legacy \
  src/assets/characters/portraits src/assets/characters/v1
git rm -q src/app/features/simulator/baked-cast.util.ts src/app/features/simulator/baked-cast.util.spec.ts \
  src/app/features/simulator/phaser-avatar-renderer.ts src/app/features/simulator/phaser-avatar-renderer.spec.ts \
  src/app/features/simulator/npc-avatar-presets.ts src/app/features/simulator/npc-avatar-presets.spec.ts \
  src/app/features/simulator/v1-avatar.util.ts src/app/features/simulator/v1-avatar.util.spec.ts \
  src/app/features/simulator/character-motion.util.ts src/app/features/simulator/character-motion.util.spec.ts
git rm -q src/app/features/character/avatar-render-plan.util.ts src/app/features/character/avatar-render-plan.util.spec.ts \
  src/app/features/character/avatar-render-plan.model.ts src/app/features/character/actor-render-plan.util.ts \
  src/app/features/character/actor-render-plan.model.ts src/app/features/character/character-manifest.model.ts \
  src/app/features/character/clinical-emotion-portrait.util.ts src/app/features/character/avatar.model.ts \
  src/app/features/character/avatar-config.util.ts src/app/features/character/avatar-config.util.spec.ts \
  src/app/features/character/avatar-figure.component.ts src/app/features/character/avatar-figure.component.spec.ts \
  src/app/features/character/editor-preview.util.ts src/app/features/character/editor-preview.util.spec.ts
git rm -r -q ../tools/cast-assets ../tools/character-assets
git rm -q scripts/character-manifest-lib.mjs scripts/character-manifest-lib.test.mjs \
  scripts/validate-character-manifest.mjs scripts/render-premium-contact-sheets.mjs
```

Si algún archivo de la lista ya no existe, `git rm` lo dice. Quítalo de la línea y sigue. Algunos specs pueden haberse borrado en tareas anteriores.

- [ ] **Step 4: Ajusta lo que sigue vivo**

1. **`kenney-frames.constants.ts`.** Borra `export const KenneyCharFrames = { … } as const;` y, del comentario de cabecera, las líneas que describen los personajes del RPG Urban Pack. Deja `KenneyTownFrames` y `KenneyDungeonFrames`.
2. **`authoring-catalog.config.ts`.**
   - Borra:
     - `AuthoringNpcTemplate`;
     - `AUTHORING_NPC_TEMPLATES`;
     - `AUTHORING_HAIR_VARIANTS`;
     - los imports de `avatar.model` y `avatar-config.util`.
   - Si `authoring-catalog.config.spec.ts` prueba esas plantillas, borra esas pruebas.
3. **`simulation.model.ts`.** Borra el tipo `NpcAvatarPresetKey`.
4. **`package.json`.** Cambia el script `"test:character-assets": "node --test scripts/character-manifest-lib.test.mjs scripts/visual-asset-manifest-lib.test.mjs",` por:

   ```json
       "test:visual-assets": "node --test scripts/visual-asset-manifest-lib.test.mjs",
   ```

5. **`../.github/workflows/ci.yml`.** El paso `- run: npm run test:character-assets --prefix frontend` pasa a `- run: npm run test:visual-assets --prefix frontend`.
6. **`scripts/validate-premium-visual-assets.mjs`.**
   - Borra `const characterRoot = …`.
   - La paleta se lee de `visualRoot`:

   ```js
     const palettes = [readJson(path.join(visualRoot, 'palette.v1.json'), 'world palette')];
   ```

7. **`scripts/visual-asset-manifest-lib.test.mjs`.**
   - `productionPalettePath` pasa a `new URL('../src/assets/visual/v1/palette.v1.json', import.meta.url)`.
   - Borra el import de `renderPremiumContactSheets`, que es la línea 23.
   - Borra todo desde `function testCanonicalize(value) {` hasta el final del archivo. Son los ayudantes y las pruebas de las hojas de contacto, que dependían del manifiesto de personajes v1. Antes de borrar, confirma con `grep -n "testCanonicalize\|testCanonicalHash\|testBytesHash\|contactDirections\|writeContactVariant" scripts/visual-asset-manifest-lib.test.mjs` que ninguno de esos ayudantes se usa antes de esa línea.
8. **Cobertura.** Las fuentes viejas ya no existen: los presets, `actor-roster.v1.json`, `portrait-resolver` y las plantillas. `coverage-sources.mjs` se reemplaza por:

```js
/**
 * Claves de personaje que el juego referencia, leídas de sus fuentes. La cobertura exige que
 * cada una resuelva a una receta (o a una voz sin cuerpo). Si una fuente se mueve, se
 * actualiza aquí; SOURCE_MINIMUMS evita que una fuente perdida pase como «cero claves».
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const COVERAGE_SOURCES = Object.freeze({
  scenarios: 'frontend/src/assets/game/scenarios',
  guides: 'frontend/src/app/features/simulator/scene-guide.config.ts',
  seed: 'backend_django/apps/simulation/management/commands/seed_caso_pdf.py',
  speakerLiterals: [
    'frontend/src/app/features/simulator/risky-interaction.config.ts',
    'frontend/src/app/features/simulator/simulation-play.component.ts',
  ],
});

/** Claves que da hoy cada fuente (2026-10); menos es una fuente que dejó de leerse. */
export const SOURCE_MINIMUMS = Object.freeze({ scenarioNpcs: 20, actors: 6, guides: 8, speakers: 6 });

const read = (root, rel) => readFileSync(path.join(root, rel), 'utf8');
const all = (text, re) => [...text.matchAll(re)].map(m => m[1]);

/** NPC de los escenarios → su receta (null si le falta `recipeId`). */
function scenarioNpcRecipes(root) {
  const dir = path.join(root, COVERAGE_SOURCES.scenarios);
  const recipes = new Map();
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const json = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    for (const room of json.rooms ?? []) {
      for (const npc of room.npcs ?? []) recipes.set(npc.key, typeof npc.recipeId === 'string' ? npc.recipeId : null);
    }
  }
  return recipes;
}

export function referencedKeys(root) {
  const seed = read(root, COVERAGE_SOURCES.seed);
  return {
    scenarioNpcs: scenarioNpcRecipes(root),
    // Personas del caso sembradas por el backend (markers PERSON).
    actors: new Set(all(seed, /"key":\s*"([^"]+)",\s*"label":\s*"[^"]*",\s*"type":\s*"PERSON"/g)),
    guides: new Set(all(read(root, COVERAGE_SOURCES.guides), /guideName: '([^']+)'/g)),
    speakers: new Set([
      ...all(seed, /"dialogue":\s*\("([^"]+)"/g),
      ...COVERAGE_SOURCES.speakerLiterals.flatMap(rel => all(read(root, rel), /speakerName: '([^']+)'/g)),
    ]),
    // Sin fuente viva: el catálogo los conserva para datos ya guardados (portraitKey de árboles
    // autorados, npcTemplateId de casos viejos) y checkCatalogRecipes valida sus recetas.
    portraitKeys: new Set(),
    templates: new Set(),
  };
}

/** Fuentes que dieron menos claves que su mínimo. */
export function checkSourceMinimums(refs) {
  return Object.entries(SOURCE_MINIMUMS)
    .filter(([source, min]) => refs[source].size < min)
    .map(([source, min]) => `cobertura: la fuente ${source} dio ${refs[source].size} claves (mínimo ${min}); ¿se movió de sitio?`);
}
```

En `check.mjs`, junto a `checkScenarioRecipes`, añade `errors.push(...checkSourceMinimums(refs));`, importado de `./coverage-sources.mjs`.

En `coverage.test.mjs`:
- La primera prueba pasa a:

```js
test('las fuentes del juego se leen: escenarios, personas del seed, guías y hablantes', () => {
  const refs = referencedKeys(REPO_ROOT);
  assert.equal(refs.scenarioNpcs.size, 20);
  assert.ok(refs.scenarioNpcs.has('supervisor-cierre'));
  assert.ok(refs.actors.has('familia-crisis') && refs.actors.has('funcionaria-recepcion'));
  assert.ok(refs.guides.has('Funcionario de derechos'));
  assert.ok(refs.speakers.has('Sobreviviente (22 años)') && refs.speakers.has('Protocolo clínico'));
});
```

- Añade:

```js
test('una fuente que deja de leerse falla en vez de cubrir cero', () => {
  const refs = referencedKeys(REPO_ROOT);
  assert.deepEqual(checkSourceMinimums(refs), []);
  refs.guides.clear();
  assert.deepEqual(checkSourceMinimums(refs), ['cobertura: la fuente guides dio 0 claves (mínimo 8); ¿se movió de sitio?']);
});
```

Si hoy alguna fuente da menos que su mínimo (corre `node -e` sobre `referencedKeys` para ver los tamaños), baja ese mínimo al valor real y regístralo como `Ruling:`.

9. **Restos.** Busca:

```bash
grep -rn "characters/\(cast\|modular\|portraits\|v1\)\|roster\.v1\|actor-roster\|clinical-emotion-map\|characters/v1/palette" src scripts ../.github ../scripts --include=*.ts --include=*.mjs --include=*.json --include=*.yml --include=*.html
```

Expected: nada. Fuera de `assets/visual/v1/`, solo `src/assets/characters/kit/` queda bajo `characters/`.

- [ ] **Step 5: Córrelas y mira que pasen**

Run:
- `npm run test:kit`
- `npm run kit:check`
- `npm run test:visual-assets`
- `npm test -- --runInBand`
- `npm run build`

Expected:
- `test:kit`: todas verdes, incluidas las 2 de legado y la de mínimos;
- `kit:check`: «0 errores»;
- `test:visual-assets`: verde;
- jest: verde, con menos suites por los specs borrados;
- `build`: verde.

- [ ] **Step 6: Commit**

```bash
git add -A src scripts package.json ../.github/workflows/ci.yml ../tools
git commit -m "feat(personajes): fuera el legado de personajes; validador «sin legado» en CI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Documentación — biblia enmendada y README del kit

**Files:**
- Modify: `docs/visual/premium-visual-bible-v1.md`
- Modify: `frontend/character-kit/README.md`
- Modify: `docs/superpowers/specs/2026-10-02-personajes-unificados-design.md` (§10, estado)

- [ ] **Step 1: Enmienda la biblia (spec §11)**

En `docs/visual/premium-visual-bible-v1.md`, §4 «Autoridades y trazabilidad»:
- el punto de `palette.v1.json` pasa a: «`palette.v2.json` del kit (`frontend/character-kit/`) es la paleta maestra de personajes; `palette.v1.json`, ahora en `assets/visual/v1/`, la del arte del mundo».
- el punto de `roster.v1.json` y los demás mapas pasa a: «`frontend/character-kit/catalog.json` es la única tabla de correspondencias de personajes (jugables, actores, hablantes, guías, plantillas y opciones del editor)».

Al final del archivo, añade:

```markdown
## 6. Enmiendas (2026-10, personajes unificados)

Fuente: `docs/superpowers/specs/2026-10-02-personajes-unificados-design.md` §11.

- **§1:** la cabeza con pelo sigue en 18-21 px, salvo los peinados de `volumen`, que llegan a 25 px con el cráneo en 17 px. Los hombros (20-27 px) aplican solo de frente y de espalda; en perfil, el fondo del torso es de 10-16 px. La regla «la derecha no es espejo exacto» se cumple con la luz recalculada y las piezas asimétricas, y el validador la comprueba.
- **§2-3:** la luz y las viñetas ambientales van debajo de los actores (`DEPTH.LIGHTING_FLOOR`); la viñeta de crisis es la única excepción. La presentación es a escala entera en píxeles físicos: el lienzo mide el contenedor × devicePixelRatio y la cámara usa un zoom entero.
- **§4:** la autoridad pasa a `palette.v2.json` y a `catalog.json`, en lugar de `roster` y `actor-roster`.
- **§5:** la compuerta de aceptación es `npm run kit:check`, más la aprobación humana sobre láminas o capturas generadas en un HEAD concreto.
- Los retratos del diálogo son de 32×32 y se muestran a ×3 o ×6 (decisión 15 del spec); el estado clínico de la paciente es un icono sobre su cabeza (decisión 13).
```

- [ ] **Step 2: README del kit**

En `frontend/character-kit/README.md`, después de la tabla de comandos, añade:

```markdown
## Cómo lo usa el juego

| Qué | Dónde |
|---|---|
| Formato 2 del avatar y migración desde v1 | `src/app/features/character/kit/avatar-v2.ts` |
| Punto único de resolución (`CharacterRef` → `CharacterVisual`) | `src/app/features/character/kit/character-visual.resolver.ts` |
| Carga de `kit.json` | `src/app/features/character/kit/kit.service.ts` |
| Hojas, animaciones y poses en Phaser | `src/app/features/character/kit/kit-phaser.ts` |
| Sprite o retrato en CSS | `<app-kit-figure>` (`kit-figure.component.ts`) |
| Zoom entero y lienzo en píxeles físicos | `src/app/features/simulator/pixel-scale.util.ts`, `pixel-canvas.ts` |

Las recetas fijas se dibujan con los PNG de `src/assets/characters/kit/`; el avatar personalizado se compone en el navegador con el mismo motor. Un NPC de escenario nombra su receta en el JSON (`recipeId`).
```

- [ ] **Step 3: Nota en el spec**

En §10, debajo de la línea de `palette.v1.json`, añade:

> *(2026-10, plan 2)* `palette.v1.json` se movió a `assets/visual/v1/`: la usan las 74 entradas del arte del mundo (`inventory.v1.json`).

En la cabecera, `- **Estado:**` suma «; plan 2 (F4-F7) ejecutado en `feat/personajes-unificados`».

- [ ] **Step 4: Commit**

```bash
git add ../docs/visual/premium-visual-bible-v1.md character-kit/README.md ../docs/superpowers/specs/2026-10-02-personajes-unificados-design.md
git commit -m "docs(personajes): biblia enmendada, README del kit y nota del spec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: e2e del lobby con el kit — AVISO por `frontend/e2e/**`

**Files:**
- Modify: `frontend/e2e/lobby.e2e.ts` (solo con el visto bueno del usuario)

- [ ] **Step 1: Pide permiso**

Esta tarea toca `frontend/e2e/**`, que el spec (§8.4) reserva al visto bueno del usuario. Antes de editar, pregunta en el chat con tres opciones:
- reescribir las dos pruebas del lobby y fijar el foco de la prueba de la tecla E (recomendado);
- dejar `lobby.e2e.ts` como está;
- otra.

**No edites hasta tener un «sí» explícito.** Si el usuario dice que no, registra `Ruling: lobby.e2e.ts sin cambios por decisión del usuario — las dos pruebas fallarán contra la rama — costo: e2e rojo hasta que se reescriban` y salta a la revisión final.

- [ ] **Step 2: Reescribe las pruebas (con permiso)**

Reemplaza las dos primeras pruebas de `lobby.e2e.ts` por:

```ts
test('el lobby carga las hojas del kit del personaje elegido, sin errores', async ({ page }) => {
  const kitRequests: string[] = [];
  const legacyRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', request => {
    if (/assets\/characters\/kit\//.test(request.url())) kitRequests.push(request.url());
    if (/assets\/characters\/(cast|modular|portraits|v1)\//.test(request.url())) legacyRequests.push(request.url());
  });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await login(page);
  // Personaje elegido en el editor (formato 2): el lobby muestra la MISMA identidad.
  await page.evaluate(() => {
    localStorage.setItem('psychosim_avatar', JSON.stringify({ schemaVersion: 2, mode: 'elenco', recipeId: 'david', bata: false }));
  });
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible();

  await expect.poll(() => kitRequests.some(url => url.includes('/kit/david/idle.png')), { timeout: scaled(10_000) }).toBe(true);
  expect(legacyRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('un avatar inválido resuelve a la receta por defecto, sin errores de consola', async ({ page }) => {
  const kitRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', request => {
    if (/assets\/characters\/kit\//.test(request.url())) kitRequests.push(request.url());
  });
  page.on('pageerror', error => consoleErrors.push(String(error)));

  await login(page);
  await page.evaluate(() => {
    localStorage.setItem('psychosim_avatar', JSON.stringify({ schemaVersion: 2, mode: 'elenco', recipeId: 'no-existe' }));
  });
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible();
  await expect.poll(() => kitRequests.some(url => url.includes('/kit/valentina/idle.png')), { timeout: scaled(10_000) }).toBe(true);
  expect(consoleErrors).toEqual([]);
});
```

En `'la tecla E con el canvas enfocado entra al caso'`, el clic con posición fija (calculada para el `Scale.FIT` viejo) pasa a dar el foco sin caminar:

```ts
  // El foco inicial es programático; si se perdió, se recupera sin hacer clic en el suelo
  // (un clic camina hacia ese punto y, con el zoom entero, la posición del jugador en
  // pantalla depende de la pantalla).
  await page.locator('.phaser-host').focus();
  await page.keyboard.press('e');
```

- [ ] **Step 3: Córrelas**

Run (desde `frontend/`): `node ../scripts/test-e2e.mjs --grep "lobby|tecla E|avatar inválido"`
Expected: verde. Si el stack e2e no levanta en esta máquina, dilo en el informe con la salida y deja la prueba para el CI del PR, cuando el usuario lo pida.

- [ ] **Step 4: Commit**

```bash
git add e2e/lobby.e2e.ts
git commit -m "test(personajes): e2e del lobby con las hojas del kit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Revisión final y cierre

1. **Revisión de la rama completa.** Sigue el procedimiento de superpowers:executing-plans:
   - usa `review-package` sobre el rango `540a0ce..HEAD`;
   - el revisor es de contexto limpio, con el modelo más capaz;
   - pásale este plan, el spec, el Review Focus de arriba y las líneas `Ruling:` del ledger.
2. **Hallazgos.** Los críticos e importantes se arreglan en una sola pasada, cada uno con TDD (RED→GREEN) y la suite entera verde. Los menores van al ledger como diferidos.
3. **Verificación final.** Corre:
   - `npm test -- --runInBand`
   - `npm run test:kit`
   - `npm run kit:check`
   - `npm run test:visual-assets`
   - `npm run build`
4. **Sin push ni merge.** La rama sigue abierta hasta la F8. Informa al usuario con los «Rulings I made» y los «Deferred minors», y ofrece escribir el plan 3 (F8, escala del mundo).

## Después de este plan

- **Plan 3 (F8).** Recalibrar muebles y puertas a la altura nueva (unos 39 px/m) y dibujarlos a ×1 exacto, con capturas dentro del juego (decisión 12). Hasta entonces, `DOOR_SPRITE_SCALE`, `TOOL_SPRITE_SCALE` y el mobiliario siguen a escalas fraccionarias.
- **Pendientes que este plan deja anotados:**
  - Los PNG del kit pesan unos 44 KB por personaje (idle + walk): `kit-png.mjs` no optimiza el deflate.
  - `ambient.cameraZoom` sigue en los datos de autoría y en las plantillas de escena del editor de mundo, pero ya no controla el render.
  - El lienzo en píxeles físicos tiene más píxeles que el de 960×540. En el runner sin GPU, los e2e pueden ir más lentos; `E2E_TIME_SCALE` ya lo contempla (memoria `siep-e2e-open-loop-movement`).
