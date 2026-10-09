# Personajes unificados — Plan 1: el kit y el arte (F1-F3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un único kit de pixel art por código —motor en TypeScript, paquete `kit.json`, validador en CI y todo el arte de la fase 1 (complexiones A y B, unas 30 piezas, 12 jugables y 14 NPC con retratos)— sin tocar todavía nada que el juego consuma.

**Architecture:** La autoría vive en `frontend/character-kit/` como datos de texto (grillas de píxel). `scripts/character-kit/bundle.mjs` la compila a `kit.json`; `kit-engine.ts` (puro, sin imports) viste, ilumina y compone hojas y retratos; `build.mjs` escribe los PNG y el manifiesto; `check.mjs` valida el contrato de la biblia enmendada; `laminas.mjs` genera las láminas de las paradas de aprobación. Este es el primero de tres planes: el 2 (integración, F4-F7) y el 3 (escala del mundo, F8) se escriben al terminar este, con las interfaces reales de `kit.json`.

**Tech Stack:** Node 24 (*type stripping* de `.ts`, `node --test`), TypeScript 5.9 (`tsc` con `erasableSyntaxOnly`), pngjs 7, Chromium de Playwright (solo para capturar láminas), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-02-personajes-unificados-design.md` (aprobado el 2026-10-03). Léelo antes de empezar; este plan lo implementa en sus fases F1-F3.

## Global Constraints

- Rama `feat/personajes-unificados`, worktree `.worktrees/personajes-unificados`. Nada de push, merge ni PR sin preguntar al usuario.
- No se toca `frontend/e2e/**` ni ningún consumidor del juego (game-world, lobby, editores, diálogo, `assets/characters/{cast,modular,portraits,v1}`): eso es el plan 2. Este plan no cambia nada visible en la app.
- Node 24. Todo script del kit corre con `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON` (`frontend/package.json` no declara `type`; está verificado que Node 24.16 importa `.ts` así).
- `kit-engine.ts`: sin imports, sintaxis borrable (sin `enum`, `namespace`, propiedades de parámetro ni decoradores), acceso con corchetes a índices (`noPropertyAccessFromIndexSignature`). Debe pasar `npm run kit:types`.
- Contrato de hoja: cuadro 48×72, pivote (24,68), filas `down/left/right/up`; `idle` 4 cuadros a 4 fps (192×288); `walk` 6 cuadros a 10 fps (288×288), contactos en 0 y 3; retrato 96×96; contorno exterior de 1 px `#15131d`; alfa binario; borde del cuadro vacío; luz desde arriba-izquierda.
- Geometría (biblia §1 enmendada, spec §6.3), medida sobre la silueta opaca: altura 60-66 px; el cuerpo termina entre y = 66 y 68; cabeza (filas 0-17 desde el tope, ancho del tramo contiguo que cruza x = 24) de 18-21 px durante 6 filas seguidas u 8 en total, o 18-25 px si el peinado es `volume`; hombros (filas 18-27) de 20-27 px de frente y de espalda, fondo del torso de 10-16 px en perfil, durante 3 filas seguidas o 4 en total; una sola silueta por cuadro; la derecha no es el espejo exacto de la izquierda; en perfil los dos pies pisan y = 66 en los contactos 0 y 3; respiración de 1 px exacto; bob de 1 px como máximo.
- Paleta: `frontend/character-kit/palette.v2.json` = `palette.v1.json` + `#c18c6c #a0654a #7a4634 #512d23`. Todo color publicado sale de ella. El único color fuera de paleta permitido es `#ff00ff` en las capas de retoque, donde significa «borrar», y nunca se publica.
- Pieles `piel-1` … `piel-6` con las rampas exactas del spec §4.5.
- Arte: pixel art auténtico (bloques duros, sin antialias ni degradados), autorado como grillas de texto. Nada de IA generativa. La referencia aprobada de lenguaje es Valentina (`76e6171`, lámina `docs/visual/kit-personajes/prueba-valentina/lamina-valentina-x4.png`).
- Las **PARADAS** esperan la respuesta del usuario en el chat antes de seguir. La aprobación vale para el HEAD exacto que muestra la lámina; si después cambia el arte, se vuelve a mostrar.
- Commits en español, estilo `feat(personajes): …` / `test(personajes): …` / `docs(personajes): …`, terminados con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `--no-verify`.
- Todos los comandos, incluidos los de git, se ejecutan desde `frontend/` del worktree; las rutas fuera de `frontend/` se escriben con `../` (p. ej. `../docs/…`). En Git Bash de Windows, con barras normales.
- Los scripts nuevos de `frontend/package.json` se añaden al objeto `scripts`, después de `test:character-assets`, separados por comas.

## Review Focus

Entradas o condiciones que el spec implica, que ninguna prueba de tarea ejercitaba y que más probablemente le muerdan a quien use el kit. Cada una tiene ahora su prueba en la tarea dueña:

1. **Receta a la que le falta el color de una ranura que usa una pieza** (p. ej. se añade la bata y la receta no trae `layer`): debe fallar al componer, nombrando receta, ranura y pieza, no con un error opaco del pintor. → Tarea 1, prueba «errores de receta con nombre y clave».
2. **Grillas con finales de línea CRLF** (Windows con `autocrlf`): `parseGrid` las normaliza y el resultado no cambia. → Tarea 1, prueba de `parseGrid`.
3. **Archivo de receta cuyo nombre no coincide con su `id`**, o borradores `_*.json` en la carpeta: lo primero falla con mensaje claro y lo segundo no se publica. → Tarea 1, prueba de `loadRecipes`.
4. **Salida obsoleta tras retirar una receta** (carpeta de personaje huérfana o PNG de más en `assets/characters/kit/`): el build la borra y el validador la señala. → Tareas 2 y 3.
5. **Retoque guardado sobre una base que después cambió**: el validador avisa (no falla) para que se revise la lámina. → Tarea 5.

## Estructura de archivos

```
frontend/
  character-kit/                         autoría (no se publica)
    README.md                            cómo trabajar con el kit
    palette.v2.json                      paleta maestra (v1 + 6.ª piel)
    ramps.mjs                            rampas con nombre + literales por defecto
    raster.mjs                           utilidades para autorar grillas (ya existe)
    mannequins/complexion-a.mjs          ya existe
    mannequins/complexion-b.mjs          F2 (tarea 6)
    mannequins/index.mjs                 registro de complexiones
    busts/bust-a.mjs                     (movido desde portraits/)
    busts/bust-b.mjs                     F2 (tarea 6)
    busts/index.mjs                      registro de bustos
    pieces/index.mjs                     registro explícito de piezas
    pieces/<tipo>/<id>.mjs               una pieza; <id>.portrait.mjs si su retrato es largo
    recipes/<id>.json                    un personaje fijo por archivo
    catalog.json                         F3 (tarea 15)
    retouch/<id>/<hoja>.png|.json        retoques a mano (tarea 5)
  scripts/character-kit/
    mannequin-raster.mjs                 maniquí → mapas de etiquetas por vista y cuadro
    bundle.mjs                           autoría → paquete (kit.json), validación de piezas
    build.mjs                            npm run kit:build
    measure.mjs                          reglas geométricas y de animación
    muestras.mjs                         cada pieza sobre una receta base, en A y B
    check.mjs                            npm run kit:check
    laminas.mjs                          npm run kit:laminas
    retouch-lib.mjs, retoque.mjs         capa de retoques y su CLI
    coverage-sources.mjs, coverage.mjs   F3: claves que el juego referencia y su cobertura
    kit-png.mjs                          E/S de PNG (ya existe; se amplía)
    fixtures/valentina-prueba.json       hashes dorados de la prueba aprobada
    *.test.mjs                           node --test
  src/app/features/character/kit/kit-engine.ts   motor puro compartido (navegador y Node)
  src/assets/characters/kit/                       SALIDA del build (kit.json, manifest.json, <id>/*.png)
  tsconfig.kit.json                                chequeo de tipos del motor
```

Se borran (sustituidos): `scripts/character-kit/{kit-core,kit-dress,build-mannequin,generate,preview-mannequin}.mjs` y `character-kit/portraits/`.

---

# Fase F1 — Motor, paquete, build, validador, láminas y retoques

### Task 1: Motor en TypeScript y paquete, con Valentina idéntica a la prueba

Porta el núcleo de la prueba (`kit-core.mjs` + `kit-dress.mjs`) a un único `kit-engine.ts`, reorganiza la autoría con la forma del spec y añade el compilador del paquete. La guarda es dorada: Valentina debe salir con los mismos hashes de píxeles que la prueba aprobada.

**Files:**
- Create: `frontend/scripts/character-kit/fixtures/valentina-prueba.json`
- Create: `frontend/src/app/features/character/kit/kit-engine.ts`
- Create: `frontend/scripts/character-kit/mannequin-raster.mjs` (sustituye a `build-mannequin.mjs`)
- Create: `frontend/scripts/character-kit/bundle.mjs`
- Create: `frontend/scripts/character-kit/kit.test.mjs`
- Create: `frontend/character-kit/{mannequins,busts,pieces}/index.mjs`, `frontend/character-kit/palette.v2.json`
- Create: `frontend/tsconfig.kit.json`
- Move: `character-kit/portraits/bust-a.mjs` → `character-kit/busts/bust-a.mjs`; `character-kit/pieces/*.mjs` y `pieces/portrait/*.mjs` → `pieces/<tipo>/<id>.mjs` y `pieces/<tipo>/<id>.portrait.mjs`
- Modify: `frontend/character-kit/ramps.mjs`, `frontend/character-kit/recipes/valentina.json`, `frontend/package.json`
- Delete: `frontend/scripts/character-kit/{kit-core,kit-dress,build-mannequin,generate,preview-mannequin}.mjs`

**Interfaces:**
- Consumes: la autoría de la prueba (`76e6171`) y los PNG de `src/assets/characters/kit/valentina/`.
- Produces (motor, `kit-engine.ts`): tipos `ViewId`, `ViewKind`, `SheetId`, `PieceKind`, `PortraitState`, `Frame`, `Motion`, `CellSpec`, `Overlay`, `EdgeRule`, `Piece`, `Ramp`, `Recipe`, `RecipePieces`, `EncodedFrame`, `BundleView`, `BundleBust`, `KitBundle`, `RgbaImage`, `ComposedCharacter`, `LightRules`; constantes `FRAME`, `PORTRAIT_FRAME`, `SHEETS`, `SHEET_IDS`, `VIEW_ROWS`, `PORTRAIT_STATES`, `OUTLINE`, `TONE`, `LABEL_Z`, `FAR_LABELS`, `KIND_ORDER`, `MAT_LAYER`, `LIGHT_RULES`, `PORTRAIT_LIGHT_RULES`; funciones `parseGrid`, `encodeRle`, `decodeRle`, `gridRows`, `createFrame`, `cloneFrame`, `mirrorFrame`, `labelZ`, `encodeLabelFrame`, `decodeLabelFrame`, `computeTones`, `renderFrame`, `blitFrame`, `overlaysFor`, `portraitOverlays`, `targetRows`, `sortPieces`, `dressFrame`, `paintFrame`, `resolvePieces`, `requiredSlots`, `resolveMaterials`, `composePortrait`, `composeCharacter(bundle, recipe, { keepDressed? }) → ComposedCharacter`.
- Produces (Node, `bundle.mjs`): `FRONTEND_ROOT`, `KIT_ROOT`, `compileGrid(text, where)`, `compilePiece(piece)`, `loadRecipes(dir?)`, `buildBundle() → KitBundle`, `stringifyBundle(bundle) → string` (JSON canónico + `\n`).
- Produces (Node, `mannequin-raster.mjs`): `rasterizeMannequin(def) → { [ViewId]: { idle: Frame[], walk: Frame[] } }`.

- [ ] **Step 1: Fija la referencia dorada antes de tocar nada**

Los hashes son el SHA-256 del RGBA decodificado de los PNG de la prueba. Compruébalos y guárdalos:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON -e "
import('./scripts/character-kit/kit-png.mjs').then(async ({ readPng }) => {
  const { createHash } = await import('node:crypto');
  for (const f of ['idle', 'walk', 'portrait-neutral']) {
    const { rgba } = readPng('src/assets/characters/kit/valentina/' + f + '.png');
    console.log(f, createHash('sha256').update(rgba).digest('hex'));
  }
});"
```

Expected:
```
idle 6fef71e199e544ddc2b0988007f608a534c4c31321365d21c2bf24a15d88ce4d
walk 8ed695fc79b0694930f5668c4bd4785b1ecc3cd93ff636e14f34f3be6d64ca30
portrait-neutral 2f9b4dcb289c62eabebbfdd2908c0dbf959a94bd6b3f33f570ec7872adcf093b
```

Crea `frontend/scripts/character-kit/fixtures/valentina-prueba.json`:

```json
{
  "idle": "6fef71e199e544ddc2b0988007f608a534c4c31321365d21c2bf24a15d88ce4d",
  "walk": "8ed695fc79b0694930f5668c4bd4785b1ecc3cd93ff636e14f34f3be6d64ca30",
  "portrait-neutral": "2f9b4dcb289c62eabebbfdd2908c0dbf959a94bd6b3f33f570ec7872adcf093b"
}
```

- [ ] **Step 2: Escribe las pruebas del motor y del paquete**

Crea `frontend/scripts/character-kit/kit.test.mjs`:

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  FRAME,
  TONE,
  composeCharacter,
  computeTones,
  createFrame,
  decodeRle,
  encodeRle,
  parseGrid,
  targetRows,
} from '../../src/app/features/character/kit/kit-engine.ts';
import { buildBundle, compilePiece, loadRecipes, stringifyBundle } from './bundle.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const golden = JSON.parse(readFileSync(new URL('./fixtures/valentina-prueba.json', import.meta.url), 'utf8'));
const MAGENTA = '#ff00ff';

/** Color `#rrggbb` del píxel (x, y) del cuadro (col, row) de una hoja. */
function pixel(image, col, row, x, y, fw = FRAME.width, fh = FRAME.height) {
  const i = ((row * fh + y) * image.width + col * fw + x) * 4;
  return `#${[0, 1, 2].map(k => image.rgba[i + k].toString(16).padStart(2, '0')).join('')}`;
}

/** Copia del paquete con piezas extra (ya compiladas) y una receta derivada de Valentina. */
function withPieces(extraPieces, patch = {}) {
  const bundle = buildBundle();
  for (const piece of extraPieces) bundle.pieces[`${piece.kind}:${piece.id}`] = compilePiece(piece);
  const base = bundle.recipes.valentina;
  const recipe = {
    ...base,
    ...patch,
    pieces: { ...base.pieces, ...(patch.pieces ?? {}) },
    colors: { ...base.colors, ...(patch.colors ?? {}) },
  };
  return { bundle, recipe };
}

test('Valentina sale idéntica a la prueba aprobada (76e6171)', () => {
  const bundle = buildBundle();
  const out = composeCharacter(bundle, bundle.recipes.valentina);
  assert.equal(sha(out.idle.rgba), golden.idle);
  assert.equal(sha(out.walk.rgba), golden.walk);
  assert.equal(sha(out.portraits.neutral.rgba), golden['portrait-neutral']);
});

test('el paquete sobrevive a JSON sin cambiar un píxel', () => {
  const bundle = buildBundle();
  const viaJson = JSON.parse(JSON.stringify(bundle));
  const a = composeCharacter(bundle, bundle.recipes.valentina);
  const b = composeCharacter(viaJson, viaJson.recipes.valentina);
  assert.equal(sha(b.walk.rgba), sha(a.walk.rgba));
  assert.equal(sha(b.portraits.neutral.rgba), sha(a.portraits.neutral.rgba));
});

test('componer dos veces da los mismos bytes', () => {
  const bundle = buildBundle();
  const a = composeCharacter(bundle, bundle.recipes.valentina);
  const b = composeCharacter(bundle, bundle.recipes.valentina);
  assert.deepEqual(b.idle.rgba, a.idle.rgba);
});

test('RLE: ida y vuelta; rechaza dígitos y basura', () => {
  const text = '....HHH\nHH..\n.';
  assert.equal(encodeRle(text), '4.3H1\n2H2.1\n1.');
  assert.equal(decodeRle(encodeRle(text)), text);
  assert.throws(() => encodeRle('a1'), /dígito/);
  assert.throws(() => decodeRle('3H?'), /RLE inválido/);
});

test('parseGrid quita la indentación común, los \\r y las líneas vacías del borde', () => {
  assert.deepEqual(parseGrid('\r\n    ab\r\n     c\r\n'), ['ab', ' c']);
  assert.deepEqual(parseGrid('\n  x.\n  .yy\n'), ['x..', '.yy']);
});

test('luz: un bloque de 3×3 se ilumina arriba-izquierda y se sombrea abajo-derecha', () => {
  const frame = createFrame(5, 5);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) { frame.part[y * 5 + x] = 'X'; frame.mat[y * 5 + x] = 'm'; }
  const tones = computeTones(frame);
  const row = y => [1, 2, 3].map(x => tones[y * 5 + x]);
  assert.deepEqual(row(1), [TONE.HI, TONE.HI, TONE.SHADE]);
  assert.deepEqual(row(2), [TONE.HI, TONE.BASE, TONE.SHADE]);
  assert.deepEqual(row(3), [TONE.SHADE, TONE.SHADE, TONE.SHADE]);
});

test('targetRows: la cabeza sigue a upper, el torso se parte en la cintura y la pelvis sigue a bob', () => {
  const frame = createFrame(4, 4);
  assert.deepEqual(targetRows(frame, 'H', 10), [10]);
  frame.motion = { upper: -1, bob: 0, waistY: 33 };
  assert.deepEqual(targetRows(frame, 'H', 10), [9]);
  assert.deepEqual(targetRows(frame, 'T', 20), [19]);
  assert.deepEqual(targetRows(frame, 'T', 33), [32, 33]);
  assert.deepEqual(targetRows(frame, 'T', 35), [35]);
  assert.deepEqual(targetRows(frame, 'P', 40), [40]);
});

test('la derecha no es el espejo exacto de la izquierda: la luz se recalcula después del espejo', () => {
  const bundle = buildBundle();
  const { walk } = composeCharacter(bundle, bundle.recipes.valentina);
  for (let col = 0; col < 6; col++) {
    for (const axis of [FRAME.width - 1, FRAME.width]) {
      let same = true;
      for (let y = 0; y < FRAME.height && same; y++) {
        for (let x = 0; x < FRAME.width && same; x++) {
          const mx = axis - x;
          if (mx < 0 || mx >= FRAME.width) continue;
          if (pixel(walk, col, 1, x, y) !== pixel(walk, col, 2, mx, y)) same = false;
        }
      }
      assert.equal(same, false, `cuadro ${col}, eje ${axis}`);
    }
  }
});

test('filtros de superposición: complexions, sheets y frames', () => {
  const marca = (id, extra) => ({
    id, kind: 'accessory', views: {
      down: [{ anchor: 'T', at: [24, 30], mode: 'paint', legend: { m: { literal: MAGENTA } }, grid: 'm', ...extra }],
    },
  });
  const { bundle, recipe } = withPieces(
    [marca('solo-walk-0', { sheets: ['walk'], frames: [0] }), marca('solo-b', { complexions: ['b'] })],
    { pieces: { accessories: ['solo-walk-0', 'solo-b'] } },
  );
  const out = composeCharacter(bundle, recipe);
  // walk 0 tiene bob 1: la fila 30 del torso (encima de la cintura) baja a 31.
  assert.equal(pixel(out.walk, 0, 0, 24, 31), MAGENTA);
  assert.notEqual(pixel(out.walk, 1, 0, 24, 31), MAGENTA);
  assert.notEqual(pixel(out.walk, 1, 0, 24, 30), MAGENTA);
  assert.notEqual(pixel(out.idle, 0, 0, 24, 30), MAGENTA);
});

test('repaint borra los tonos fijos de otras piezas; paint los conserva', () => {
  const capa = (id, mode) => ({
    id, kind: 'layer', coverage: { T: 'layer' }, views: {
      down: [{ anchor: 'T', at: [17, 23], mode, legend: { L: { mat: 'layer' } }, grid: Array(15).fill('L'.repeat(15)).join('\n') }],
    },
  });
  const azul = ['#69a2c8', '#3d78a8', '#2c5884', '#203d61'];
  const run = (mode) => {
    const { bundle, recipe } = withPieces([capa(`capa-${mode}`, mode)], { pieces: { layer: `capa-${mode}` }, colors: { layer: 'azul' } });
    return composeCharacter(bundle, recipe).idle;
  };
  // (22,27) es el borde «x» de la abertura de la chaqueta: tono fijo 3.
  assert.equal(pixel(run('paint'), 0, 0, 22, 27), azul[3]);
  assert.notEqual(pixel(run('repaint'), 0, 0, 22, 27), azul[3]);
});

test('la capa (layer) se aplica después de la parte de arriba', () => {
  const bata = { id: 'bata-prueba', kind: 'layer', coverage: { T: 'layer', a: 'layer', b: 'layer', A: 'layer', B: 'layer' }, views: {} };
  const { bundle, recipe } = withPieces([bata], { pieces: { layer: 'bata-prueba' }, colors: { layer: 'blanco' } });
  const out = composeCharacter(bundle, recipe);
  const blanco = new Set(['#ffffff', '#f1f2f4', '#d5d9dd', '#a3abb5']);
  // (18,30): torso a la izquierda de la abertura, fuera de toda superposición de la chaqueta.
  assert.ok(blanco.has(pixel(out.idle, 0, 0, 18, 30)));
});

test('un rostro usa la expresión del estado en el retrato', () => {
  const { bundle, recipe: base } = withPieces([]);
  const faceKey = `face:${base.pieces.face}`;
  bundle.pieces[faceKey] = compilePiece({
    ...bundle.pieces[faceKey],
    views: {},
    portrait: [],
    expressions: { triste: [{ anchor: 'H', at: [47, 40], mode: 'paint', legend: { m: { literal: MAGENTA } }, grid: 'm' }] },
  });
  const out = composeCharacter(bundle, { ...base, portraits: ['neutral', 'triste'] });
  assert.equal(pixel(out.portraits.triste, 0, 0, 47, 40, 96, 96), MAGENTA);
  assert.notEqual(pixel(out.portraits.neutral, 0, 0, 47, 40, 96, 96), MAGENTA);
});

test('errores de receta con nombre y clave', () => {
  const bundle = buildBundle();
  const base = bundle.recipes.valentina;
  assert.throws(() => composeCharacter(bundle, { ...base, pieces: { ...base.pieces, top: 'no-existe' } }), /receta valentina: pieza desconocida top:no-existe/);
  assert.throws(() => composeCharacter(bundle, { ...base, colors: { ...base.colors, top: 'no-existe' } }), /rampa desconocida no-existe \(ranura top\)/);
  assert.throws(() => composeCharacter(bundle, { ...base, complexion: 'z' }), /complexión desconocida z/);
  const { accent, ...sinAcento } = base.colors;
  assert.ok(accent);
  assert.throws(() => composeCharacter(bundle, { ...base, colors: sinAcento }), /receta valentina: falta el color de la ranura «accent» \(la usa top:chaqueta-capucha\)/);
});

test('loadRecipes exige que el id coincida con el nombre del archivo', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'recetas-'));
  try {
    writeFileSync(path.join(dir, 'ana.json'), JSON.stringify({ id: 'otra' }));
    assert.throws(() => loadRecipes(dir), /receta ana.json: el id debe coincidir con el nombre del archivo/);
    writeFileSync(path.join(dir, 'ana.json'), JSON.stringify({ id: 'ana' }));
    writeFileSync(path.join(dir, '_borrador.json'), '{}');
    assert.deepEqual(Object.keys(loadRecipes(dir)), ['ana']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('compilePiece rechaza piezas mal formadas', () => {
  const overlay = { anchor: 'T', at: [17, 23], mode: 'paint', legend: { a: { mat: 'top' } }, grid: 'a' };
  const base = { id: 'x', kind: 'top', views: { down: [overlay] } };
  const conOverlay = patch => ({ ...base, views: { down: [{ ...overlay, ...patch }] } });
  assert.doesNotThrow(() => compilePiece(base));
  assert.throws(() => compilePiece({ ...base, kind: 'sombrero' }), /tipo desconocido/);
  assert.throws(() => compilePiece(conOverlay({ grid: 'ab' })), /símbolo «b» sin leyenda/);
  assert.throws(() => compilePiece(conOverlay({ grid: 'a1' })), /dígitos/);
  assert.throws(() => compilePiece(conOverlay({ mode: 'cover', legend: { a: { tone: 2 } } })), /necesita mat o literal/);
  assert.throws(() => compilePiece(conOverlay({ mode: 'pintar' })), /modo desconocido/);
  assert.throws(() => compilePiece(conOverlay({ sheets: ['run'] })), /hoja desconocida/);
  assert.throws(() => compilePiece({ ...base, asymmetric: true, views: { left: [overlay] } }), /asimétrica/);
  assert.throws(() => compilePiece({ ...base, expressions: { furiosa: [] } }), /estado de retrato desconocido/);
});

test('el paquete serializado es canónico y estable', () => {
  const a = stringifyBundle(buildBundle());
  assert.equal(stringifyBundle(buildBundle()), a);
  assert.ok(a.endsWith('\n'));
  assert.deepEqual(Object.keys(JSON.parse(a)), ['busts', 'complexions', 'literals', 'pieces', 'ramps', 'recipes', 'schemaVersion']);
});
```

Añade a `frontend/package.json`:

```json
    "test:kit": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test \"scripts/character-kit/*.test.mjs\"",
    "kit:types": "tsc -p tsconfig.kit.json"
```

- [ ] **Step 3: Ejecuta las pruebas y confirma que fallan**

Run: `npm run test:kit`
Expected: FAIL — `Cannot find module '…/kit-engine.ts'` (o `./bundle.mjs`).

- [ ] **Step 4: Reorganiza la autoría con la forma del spec**

Desde `frontend/`:

```bash
cd character-kit
mkdir -p busts pieces/hair pieces/face pieces/top pieces/bottom pieces/shoes
git mv portraits/bust-a.mjs busts/bust-a.mjs
git mv pieces/hair-bob-flequillo.mjs pieces/hair/bob-flequillo.mjs
git mv pieces/portrait/hair-bob-flequillo.portrait.mjs pieces/hair/bob-flequillo.portrait.mjs
git mv pieces/face-neutral.mjs pieces/face/sereno.mjs
git mv pieces/portrait/face-neutral.portrait.mjs pieces/face/sereno.portrait.mjs
git mv pieces/top-chaqueta-capucha.mjs pieces/top/chaqueta-capucha.mjs
git mv pieces/portrait/top-chaqueta-capucha.portrait.mjs pieces/top/chaqueta-capucha.portrait.mjs
git mv pieces/bottom-jean.mjs pieces/bottom/jean.mjs
git mv pieces/shoes-tenis.mjs pieces/shoes/tenis.mjs
sed -i "s#from './portrait/hair-bob-flequillo.portrait.mjs'#from './bob-flequillo.portrait.mjs'#; s#^  kind: 'hair',#  kind: 'hair',\n  asymmetric: true,#" pieces/hair/bob-flequillo.mjs
sed -i "s#import { FACE_NEUTRAL_PORTRAIT } from './portrait/face-neutral.portrait.mjs';#import { SERENO_PORTRAIT } from './sereno.portrait.mjs';#; s#portrait: FACE_NEUTRAL_PORTRAIT,#portrait: SERENO_PORTRAIT,#; s#^  id: 'neutral',#  id: 'sereno',#; s#^ \* Rostro neutro:# * Rostro sereno:#" pieces/face/sereno.mjs
sed -i "s#export const FACE_NEUTRAL_PORTRAIT#export const SERENO_PORTRAIT#; s#^ \* Rostro neutro — versión retrato# * Rostro sereno — versión retrato#" pieces/face/sereno.portrait.mjs
sed -i "s#from './portrait/top-chaqueta-capucha.portrait.mjs'#from './chaqueta-capucha.portrait.mjs'#" pieces/top/chaqueta-capucha.mjs
rmdir portraits pieces/portrait 2>/dev/null || true
cd ..
```

Verifica: `grep -rn "portrait/\|FACE_NEUTRAL\|id: 'neutral'" character-kit` no devuelve nada, `character-kit/pieces/hair/bob-flequillo.mjs` tiene `asymmetric: true,` debajo de `kind: 'hair',` y ya no existen `character-kit/portraits/` ni `character-kit/pieces/portrait/`.

Crea los tres registros explícitos.

`frontend/character-kit/mannequins/index.mjs`:

```js
/** Complexiones del kit por id. Registro explícito: el build no descubre archivos. */
import { COMPLEXION_A } from './complexion-a.mjs';

export const COMPLEXIONS = Object.freeze({ a: COMPLEXION_A });
```

`frontend/character-kit/busts/index.mjs`:

```js
/** Bustos de retrato por complexión. Registro explícito: el build no descubre archivos. */
import { BUST_A } from './bust-a.mjs';

export const BUSTS = Object.freeze({ a: BUST_A });
```

`frontend/character-kit/pieces/index.mjs`:

```js
/** Todas las piezas del kit. Registro explícito: el build no descubre archivos. */
import jean from './bottom/jean.mjs';
import sereno from './face/sereno.mjs';
import bobFlequillo from './hair/bob-flequillo.mjs';
import tenis from './shoes/tenis.mjs';
import chaquetaCapucha from './top/chaqueta-capucha.mjs';

export const PIECES = Object.freeze([
  // pelo
  bobFlequillo,
  // rostro
  sereno,
  // arriba
  chaquetaCapucha,
  // abajo
  jean,
  // calzado
  tenis,
]);
```

Crea `frontend/character-kit/palette.v2.json` desde la v1 (inserta la piel nueva después de `#623326`):

```bash
node -e "
const v1 = require('./src/assets/characters/v1/palette.v1.json');
const colors = [...v1.masterColors];
colors.splice(colors.indexOf('#623326') + 1, 0, '#c18c6c', '#a0654a', '#7a4634', '#512d23');
const out = { schemaVersion: 1, paletteId: 'siep-master-v2', outline: v1.outline, masterColors: colors };
require('fs').writeFileSync('character-kit/palette.v2.json', JSON.stringify(out, null, 2) + '\n');
console.log(colors.length);"
```

Expected: `77`.

Reemplaza `frontend/character-kit/ramps.mjs` (renumera las pieles según el spec §4.5 y añade los literales por defecto):

```js
/**
 * Rampas con nombre (luz → base → sombra → profunda), todas sacadas de
 * `palette.v2.json`. El validador comprueba que cada color esté en la paleta
 * y que la luminancia baje de la luz a la profunda.
 */
export const RAMPS = {
  'piel-1': ['#f7dfcc', '#e9bea0', '#cf8f6f', '#a8614c'],
  'piel-2': ['#f0c7a5', '#d99a76', '#b86f52', '#824735'],
  'piel-3': ['#d6a17f', '#b97656', '#92513b', '#623326'],
  'piel-4': ['#c18c6c', '#a0654a', '#7a4634', '#512d23'],
  'piel-5': ['#ad7758', '#87543d', '#623b2d', '#40271f'],
  'piel-6': ['#774a35', '#563223', '#38231d', '#241817'],

  'castano-oscuro': ['#87543d', '#623b2d', '#40271f', '#241817'],

  verde: ['#85b294', '#5b8d70', '#3d6a55', '#29483d'],
  azul: ['#69a2c8', '#3d78a8', '#2c5884', '#203d61'],
  blanco: ['#ffffff', '#f1f2f4', '#d5d9dd', '#a3abb5'],
  marino: ['#2c5884', '#203d61', '#2d2852', '#211e2b'],
  carbon: ['#6c6376', '#494255', '#302a3b', '#211e2b'],
  'gris-claro': ['#d2d2d4', '#adaeb5', '#858690', '#62636c'],
};

/** Colores literales por defecto (ojos, rubor); una receta puede cambiarlos con `literals`. */
export const LITERAL_DEFAULTS = {
  eye: '#211e2b',
  blush: '#efb0b8',
  eyeWhite: '#f1f2f4',
  iris: '#623b2d',
  shine: '#ffffff',
};
```

Reemplaza `frontend/character-kit/recipes/valentina.json` (formato del spec §4.4; los literales salen ahora de `LITERAL_DEFAULTS`, con los mismos valores):

```json
{
  "id": "valentina",
  "displayName": "Valentina",
  "kind": "jugable",
  "complexion": "a",
  "pieces": {
    "hair": "bob-flequillo",
    "face": "sereno",
    "top": "chaqueta-capucha",
    "bottom": "jean",
    "shoes": "tenis",
    "accessories": []
  },
  "colors": {
    "skin": "piel-1",
    "hair": "castano-oscuro",
    "top": "verde",
    "accent": "azul",
    "inner": "blanco",
    "bottom": "marino",
    "shoes": "carbon",
    "sole": "gris-claro"
  },
  "portraits": ["neutral"],
  "provenance": { "source": "Kit SIEP", "license": "SIEP-INTERNAL" }
}
```

- [ ] **Step 5: Crea el motor**

Crea `frontend/src/app/features/character/kit/kit-engine.ts`. Es el núcleo de la prueba sin cambios de comportamiento, más: RLE, mapas de etiquetas codificados, filtros de superposición (`complexions`, `sheets`, `frames`), el modo `repaint`, los tipos `layer` y `accessory` con `KIND_ORDER`, expresiones de retrato, `requiredSlots` y la composición desde el paquete.

```ts
/**
 * Motor del kit de personajes SIEP (método A: kit por código).
 *
 * Funciones puras, sin imports y con sintaxis borrable (sin `enum`, sin
 * `namespace`, sin propiedades de parámetro): lo importan la app Angular y los
 * scripts de Node 24 (type stripping), así el navegador y el CI producen los
 * mismos píxeles.
 *
 * Modelo:
 *   - Un CUADRO es una grilla W×H de celdas. Cada celda lleva la parte que la
 *     ocupa (`part`), la ranura de material de la receta (`mat`), la
 *     profundidad (`z`) y si es un miembro lejano en perfil (`far`).
 *   - La LUZ se calcula después de componer (y después de reflejar), siempre
 *     desde arriba-izquierda en pantalla. Por eso la vista derecha puede salir
 *     del espejo de la izquierda sin heredar una luz al revés.
 *   - Los DETALLES (ojos, mechones, cremallera) se pintan con tono explícito y
 *     el CONTORNO de 1 px se añade al final por fuera de la silueta.
 */

// ── Contrato de hojas ─────────────────────────────────────────────────────────

export type ViewId = 'down' | 'left' | 'right' | 'up';
export type ViewKind = 'front' | 'back' | 'side';
export type SheetId = 'idle' | 'walk';
export type PieceKind = 'hair' | 'face' | 'top' | 'layer' | 'bottom' | 'shoes' | 'accessory';
export type PortraitState = 'neutral' | 'preocupada' | 'triste' | 'alegre';

export const FRAME = Object.freeze({ width: 48, height: 72, pivotX: 24, pivotY: 68 });
export const PORTRAIT_FRAME = Object.freeze({ width: 96, height: 96 });
export const SHEETS: Readonly<Record<SheetId, { readonly frames: number; readonly fps: number }>> = Object.freeze({
  idle: Object.freeze({ frames: 4, fps: 4 }),
  walk: Object.freeze({ frames: 6, fps: 10 }),
});
export const SHEET_IDS: readonly SheetId[] = Object.freeze(['idle', 'walk']);
export const VIEW_ROWS: readonly ViewId[] = Object.freeze(['down', 'left', 'right', 'up']);
export const PORTRAIT_STATES: readonly PortraitState[] = Object.freeze(['neutral', 'preocupada', 'triste', 'alegre']);
export const OUTLINE = '#15131d';
export const TONE = Object.freeze({ HI: 0, BASE: 1, SHADE: 2, DEEP: 3 });

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface Motion {
  upper: number;
  bob: number;
  waistY: number;
}

export interface Frame {
  width: number;
  height: number;
  part: (string | null)[];
  mat: (string | null)[];
  z: Float32Array;
  far: Uint8Array;
  /** Tono fijado a mano (detalles); -1 = lo decide la luz. */
  fixedTone: Int8Array;
  /** Color literal (`#rrggbb`) o clave de literal de la receta; null = rampa del material. */
  literal: (string | null)[];
  motion?: Motion;
}

export interface CellSpec {
  mat?: string;
  tone?: number;
  literal?: string;
}

export type OverlayMode = 'paint' | 'cover' | 'repaint';

export interface Overlay {
  anchor: string;
  at: [number, number];
  mode: OverlayMode;
  parts?: string[];
  complexions?: string[];
  sheets?: SheetId[];
  frames?: number[];
  legend: Record<string, CellSpec>;
  /** En el paquete: grilla normalizada (filas unidas con \n) codificada en RLE. */
  grid: string;
}

export interface EdgeRule {
  labels: string[];
  edge: 'bottom';
  mat?: string;
  tone?: number;
}

export interface Piece {
  id: string;
  kind: PieceKind;
  slots?: string[];
  part?: string;
  z?: number;
  volume?: boolean;
  asymmetric?: boolean;
  coverage?: Record<string, string>;
  edges?: EdgeRule[];
  views: Partial<Record<ViewId, Overlay[]>>;
  portrait?: Overlay[];
  expressions?: Partial<Record<PortraitState, Overlay[]>>;
}

export type Ramp = readonly [string, string, string, string];

export interface RecipePieces {
  hair: string;
  face: string;
  top: string;
  layer?: string;
  bottom: string;
  shoes: string;
  accessories?: string[];
}

export interface Recipe {
  id?: string;
  displayName?: string;
  kind?: 'jugable' | 'npc' | 'figurante';
  complexion: string;
  pieces: RecipePieces;
  colors: Record<string, string>;
  literals?: Record<string, string>;
  portraits?: PortraitState[];
  provenance?: { source: string; license: string };
}

export interface EncodedFrame {
  labels: string;
  motion: Motion;
}

export interface BundleView {
  kind: ViewKind;
  idle: EncodedFrame[];
  walk: EncodedFrame[];
}

export interface BundleBust {
  grid: string;
  z: Record<string, number>;
}

export interface KitBundle {
  schemaVersion: 1;
  complexions: Record<string, Record<ViewId, BundleView>>;
  busts: Record<string, BundleBust>;
  pieces: Record<string, Piece>;
  ramps: Record<string, Ramp>;
  literals: Record<string, string>;
  recipes: Record<string, Recipe>;
}

export interface RgbaImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export interface ComposedCharacter {
  idle: RgbaImage;
  walk: RgbaImage;
  portraits: Partial<Record<PortraitState, RgbaImage>>;
  /** Solo con `keepDressed`: cuadros vestidos por hoja, vista y cuadro (para el validador). */
  dressed?: Record<SheetId, Record<ViewId, Frame[]>>;
}

export interface LightRules {
  group?: (part: string) => string;
  shadeWidth?: (part: string, mat: string | null) => number;
  castDepth?: (part: string, mat: string | null) => number;
  highlight?: (part: string, mat: string | null) => boolean;
}

// ── Grillas de texto y RLE ────────────────────────────────────────────────────

/**
 * Convierte una grilla de texto en filas de caracteres. Ignora la indentación
 * común, los \r y las líneas vacías del borde; '.' y ' ' son celdas vacías.
 */
export function parseGrid(text: string): string[] {
  const lines = text.replace(/\r/g, '').split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const indent = Math.min(...lines.filter(l => l.trim()).map(l => (l.match(/^ */) ?? [''])[0].length));
  const rows = lines.map(l => l.slice(indent).replace(/\s+$/, ''));
  const width = Math.max(...rows.map(r => r.length));
  return rows.map(r => r.padEnd(width, '.'));
}

export function isEmptyChar(ch: string | undefined): boolean {
  return ch === '.' || ch === ' ' || ch === undefined;
}

/** RLE: `<cuenta><carácter>` por tramo. Los caracteres no pueden ser dígitos. */
export function encodeRle(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch >= '0' && ch <= '9') throw new Error(`RLE: dígito «${ch}» en la posición ${i}`);
    let j = i + 1;
    while (j < text.length && text[j] === ch) j++;
    out += `${j - i}${ch}`;
    i = j;
  }
  return out;
}

export function decodeRle(rle: string): string {
  const re = /(\d+)(\D)/g;
  let out = '';
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rle)) !== null) {
    if (m.index !== consumed) throw new Error(`RLE inválido en la posición ${consumed}`);
    out += m[2].repeat(Number(m[1]));
    consumed = re.lastIndex;
  }
  if (consumed !== rle.length) throw new Error(`RLE inválido en la posición ${consumed}`);
  return out;
}

/** Filas de una grilla del paquete (RLE de filas unidas con \n). */
export function gridRows(encoded: string): string[] {
  return decodeRle(encoded).split('\n');
}

// ── Cuadro ────────────────────────────────────────────────────────────────────

export function createFrame(width: number, height: number): Frame {
  const n = width * height;
  return {
    width,
    height,
    part: new Array<string | null>(n).fill(null),
    mat: new Array<string | null>(n).fill(null),
    z: new Float32Array(n),
    far: new Uint8Array(n),
    fixedTone: new Int8Array(n).fill(-1),
    literal: new Array<string | null>(n).fill(null),
  };
}

export function cloneFrame(frame: Frame): Frame {
  return {
    width: frame.width,
    height: frame.height,
    motion: frame.motion,
    part: frame.part.slice(),
    mat: frame.mat.slice(),
    z: frame.z.slice(),
    far: frame.far.slice(),
    fixedTone: frame.fixedTone.slice(),
    literal: frame.literal.slice(),
  };
}

export function inside(frame: Frame, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < frame.width && y < frame.height;
}

/** Espejo horizontal alrededor de la columna del pivote (x ↔ 2·pivotX − x). */
export function mirrorFrame(frame: Frame, pivotX: number): Frame {
  const out = createFrame(frame.width, frame.height);
  out.motion = frame.motion;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const mx = 2 * pivotX - x;
      if (mx < 0 || mx >= frame.width) continue;
      const src = y * frame.width + x;
      const dst = y * frame.width + mx;
      out.part[dst] = frame.part[src];
      out.mat[dst] = frame.mat[src];
      out.z[dst] = frame.z[src];
      out.far[dst] = frame.far[src];
      out.fixedTone[dst] = frame.fixedTone[src];
      out.literal[dst] = frame.literal[src];
    }
  }
  return out;
}

// ── Mapas de etiquetas del maniquí ────────────────────────────────────────────

/** Profundidad por etiqueta (sombras proyectadas). Las vistas de espalda usan `front`. */
export const LABEL_Z: Readonly<Record<'front' | 'side', Readonly<Record<string, number>>>> = Object.freeze({
  // La pelvis comparte profundidad con los muslos: la unión no es un borde.
  front: Object.freeze({ H: 5, e: 5, E: 5, N: 2.5, T: 3, P: 1, a: 4, b: 4, c: 4.2, A: 4, B: 4, C: 4.2, l: 1, m: 1, o: 0.9, L: 1, M: 1, O: 0.9 }),
  // Perfil: todo lo lejano queda detrás de lo cercano (brazo lejano el más al fondo).
  side: Object.freeze({ H: 5, e: 5.1, N: 2.5, T: 3, P: 1, a: 4, b: 4, c: 4.2, A: 0.5, B: 0.5, C: 0.55, l: 1, m: 1, o: 0.9, L: 0.7, M: 0.7, O: 0.65 }),
});

/** Miembros lejanos en perfil: un tono más oscuro. */
export const FAR_LABELS: ReadonlySet<string> = new Set(['A', 'B', 'C', 'L', 'M', 'O']);

export function labelZ(kind: ViewKind, label: string): number {
  return LABEL_Z[kind === 'side' ? 'side' : 'front'][label] ?? 0;
}

export function encodeLabelFrame(frame: Frame): EncodedFrame {
  if (!frame.motion) throw new Error('cuadro del maniquí sin movimiento');
  return { labels: encodeRle(frame.part.map(p => p ?? '.').join('')), motion: frame.motion };
}

export function decodeLabelFrame(encoded: EncodedFrame, kind: ViewKind, width: number, height: number): Frame {
  const labels = decodeRle(encoded.labels);
  if (labels.length !== width * height) throw new Error(`mapa de etiquetas de ${labels.length} celdas; se esperaban ${width * height}`);
  const frame = createFrame(width, height);
  frame.motion = { ...encoded.motion };
  for (let i = 0; i < labels.length; i++) {
    const ch = labels[i];
    if (ch === '.') continue;
    frame.part[i] = ch;
    frame.z[i] = labelZ(kind, ch);
    frame.far[i] = kind === 'side' && FAR_LABELS.has(ch) ? 1 : 0;
  }
  return frame;
}

// ── Luz desde arriba-izquierda ────────────────────────────────────────────────

/**
 * Calcula el tono de cada celda ocupada.
 *
 *   1. Base en todo el cuerpo.
 *   2. Borde derecho → sombra (banda de `shadeWidth` px según la parte).
 *   3. Borde inferior → sombra.
 *   4. Borde izquierdo (y superior, si no es borde derecho) → luz.
 *   5. Sombra proyectada: si la celda de arriba o la de arriba-izquierda
 *      pertenece a algo que está DELANTE (más z), la celda queda en sombra;
 *      si además es el mismo material, en sombra profunda.
 *   6. Miembros lejanos (perfil): un tono más oscuro.
 *   7. Tonos fijados por detalles: mandan siempre.
 */
export function computeTones(frame: Frame, rules: LightRules = {}): Int8Array {
  const { width, height } = frame;
  const tones = new Int8Array(width * height).fill(-1);
  const shadeWidth = rules.shadeWidth ?? (() => 1);
  const castDepth = rules.castDepth ?? (() => 1);
  const highlight = rules.highlight ?? (() => true);
  // Grupo de luz: segmentos del mismo miembro se iluminan como un solo volumen
  // si comparten material.
  const group = rules.group ?? ((part: string) => part);
  const region = (i: number): string | null => {
    const part = frame.part[i];
    return part === null ? null : `${group(part)}|${frame.mat[i]}`;
  };
  const at = (x: number, y: number): number => (inside(frame, x, y) ? y * width + x : -1);
  // Un vecino es BORDE de la forma si está vacío o detrás (menos z). Lo que
  // tapa por delante no corta el volumen: el torso sigue detrás del brazo.
  const isEdge = (i: number, x: number, y: number): boolean => {
    const j = at(x, y);
    if (j < 0 || frame.part[j] === null) return true;
    if (region(j) === region(i)) return false;
    return frame.z[j] < frame.z[i];
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const part = frame.part[i];
      if (part === null) continue;
      const mat = frame.mat[i];
      const me = region(i);
      let tone: number = TONE.BASE;

      const sw = shadeWidth(part, mat);
      let rightEdge = false;
      for (let k = 1; k <= sw; k++) {
        if (isEdge(i, x + k, y)) { rightEdge = true; break; }
      }
      const bottomEdge = isEdge(i, x, y + 1);
      const leftEdge = isEdge(i, x - 1, y);
      const topEdge = isEdge(i, x, y - 1);

      if (rightEdge || bottomEdge) tone = TONE.SHADE;
      else if (highlight(part, mat) && (leftEdge || topEdge)) tone = TONE.HI;

      const depth = castDepth(part, mat);
      cast: for (let k = 1; k <= depth; k++) {
        for (const [dx, dy] of [[0, -k], [-k, -k]]) {
          const j = at(x + dx, y + dy);
          if (j < 0 || frame.part[j] === null) continue;
          if (region(j) === me) continue;
          if (frame.z[j] > frame.z[i]) {
            const sameMat = frame.mat[j] === frame.mat[i];
            tone = Math.max(tone, sameMat && k === 1 ? TONE.DEEP : TONE.SHADE);
            break cast;
          }
        }
      }

      if (frame.far[i]) tone = Math.min(TONE.DEEP, tone + 1);
      if (frame.fixedTone[i] >= 0) tone = frame.fixedTone[i];
      tones[i] = tone;
    }
  }
  return tones;
}

// ── Color, contorno y salida RGBA ─────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * Pinta el cuadro: rampa del material según tono, contorno de 1 px por fuera
 * (vecindad 4) y alfa binario. Los literales ya deben venir resueltos a `#rrggbb`.
 */
export function renderFrame(frame: Frame, tones: Int8Array, materials: Record<string, Ramp>, outlineHex: string): Uint8Array {
  const { width, height } = frame;
  const rgba = new Uint8Array(width * height * 4);
  const outline = hexToRgb(outlineHex);
  for (let i = 0; i < width * height; i++) {
    if (frame.part[i] === null) continue;
    let hex = frame.literal[i];
    if (!hex) {
      const mat = frame.mat[i];
      const ramp = mat === null ? undefined : materials[mat];
      if (!ramp) throw new Error(`material sin rampa: ${mat} (parte ${frame.part[i]})`);
      hex = ramp[Math.max(0, Math.min(ramp.length - 1, tones[i]))];
    }
    const [r, g, b] = hexToRgb(hex);
    rgba.set([r, g, b, 255], i * 4);
  }
  const filled = (x: number, y: number): boolean => inside(frame, x, y) && frame.part[y * width + x] !== null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (filled(x, y)) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        rgba.set([...outline, 255], (y * width + x) * 4);
      }
    }
  }
  return rgba;
}

/** Copia un cuadro RGBA dentro de una hoja en la celda (col, row). */
export function blitFrame(sheet: Uint8Array, sheetWidth: number, frameRgba: Uint8Array, frameWidth: number, frameHeight: number, col: number, row: number): void {
  for (let y = 0; y < frameHeight; y++) {
    const src = y * frameWidth * 4;
    const dst = ((row * frameHeight + y) * sheetWidth + col * frameWidth) * 4;
    sheet.set(frameRgba.subarray(src, src + frameWidth * 4), dst);
  }
}

// ── Vestir ────────────────────────────────────────────────────────────────────

/** Partes que son piel salvo que una pieza las cubra. */
export const SKIN_LABELS: readonly string[] = Object.freeze(['H', 'e', 'E', 'N', 'c', 'C']);

/** Orden de aplicación: cobertura, bordes y superposiciones van en este orden. */
export const KIND_ORDER: readonly PieceKind[] = Object.freeze(['bottom', 'shoes', 'top', 'layer', 'face', 'accessory', 'hair']);

/** Capa de cada material: lo de más arriba proyecta sombra sobre lo de abajo. */
export const MAT_LAYER: Readonly<Record<string, number>> = Object.freeze({
  skin: 0, sole: 0.03, shoes: 0.04, inner: 0.05, bottom: 0.1, top: 0.2, accent: 0.25, layer: 0.3, hair: 0,
});

const LIGHT_GROUP: Readonly<Record<string, string>> = Object.freeze({
  a: 'armL', b: 'armL', A: 'armR', B: 'armR', l: 'legL', m: 'legL', L: 'legR', M: 'legR', T: 'trunk', P: 'trunk',
});

export const LIGHT_RULES: LightRules = Object.freeze({
  group: (part: string) => LIGHT_GROUP[part] ?? part,
  shadeWidth: (part: string) => (part === 'H' || part === 'T' || part === 'P' || part === 'hair' ? 2 : 1),
});

/** Luz del retrato: formas grandes, bandas de sombra más anchas y sombra del mentón. */
const PORTRAIT_SHADE: Readonly<Record<string, number>> = Object.freeze({ H: 4, hair: 4, T: 5, N: 3 });
const PORTRAIT_CAST: Readonly<Record<string, number>> = Object.freeze({ N: 4, H: 2, T: 2 });
export const PORTRAIT_LIGHT_RULES: LightRules = Object.freeze({
  group: (part: string) => part,
  shadeWidth: (part: string) => PORTRAIT_SHADE[part] ?? 1,
  castDepth: (part: string) => PORTRAIT_CAST[part] ?? 1,
});

/** Superposición lista para aplicar: filas decodificadas y, si viene de un espejo, su eje. */
export interface ResolvedOverlay {
  anchor: string;
  at: [number, number];
  mode: OverlayMode;
  parts?: string[];
  legend: Record<string, CellSpec>;
  rows: string[];
  mirrored: boolean;
  pivotX: number;
}

export interface OverlayContext {
  pivotX: number;
  complexion: string;
  sheet: SheetId;
  frame: number;
}

function overlayApplies(o: Overlay, complexion: string, sheet: SheetId | null, frame: number | null): boolean {
  if (o.complexions && !o.complexions.includes(complexion)) return false;
  if (sheet !== null && o.sheets && !o.sheets.includes(sheet)) return false;
  if (frame !== null && o.frames && !o.frames.includes(frame)) return false;
  return true;
}

function resolveOverlay(o: Overlay, mirrored: boolean, pivotX: number): ResolvedOverlay {
  return { anchor: o.anchor, at: o.at, mode: o.mode, parts: o.parts, legend: o.legend, rows: gridRows(o.grid), mirrored, pivotX };
}

/** Superposiciones de una pieza para una vista; `right` sin dibujo propio = espejo de `left`. */
export function overlaysFor(piece: Piece, view: ViewId, ctx: OverlayContext): ResolvedOverlay[] {
  const own = piece.views[view];
  const mirrored = !own && view === 'right';
  const list = own ?? (mirrored ? piece.views.left : undefined) ?? [];
  return list
    .filter(o => overlayApplies(o, ctx.complexion, ctx.sheet, ctx.frame))
    .map(o => resolveOverlay(o, mirrored, ctx.pivotX));
}

/** Superposiciones del retrato de una pieza; un rostro usa la expresión del estado si la tiene. */
export function portraitOverlays(piece: Piece, complexion: string, state: PortraitState): ResolvedOverlay[] {
  const list = (piece.kind === 'face' ? piece.expressions?.[state] : undefined) ?? piece.portrait ?? [];
  return list.filter(o => overlayApplies(o, complexion, null, null)).map(o => resolveOverlay(o, false, 0));
}

/**
 * Filas de destino de una fila de reposo, según cómo se movió su ancla en este
 * cuadro (`frame.motion`):
 *   - cabeza y lo que cuelga de ella: `upper` (bob + respiración);
 *   - torso: por encima de la cintura `upper`, desde la cintura `bob`; si la
 *     respiración abrió un hueco, la fila de la cintura se repite;
 *   - pelvis y el resto: `bob`.
 * Sin `motion` (retrato) no hay desplazamiento.
 */
export function targetRows(frame: Frame, anchor: string, restY: number): number[] {
  const m = frame.motion;
  if (!m) return [restY];
  if (anchor === 'H') return [restY + m.upper];
  if (anchor === 'T') {
    if (restY < m.waistY) return [restY + m.upper];
    if (restY === m.waistY && m.bob - m.upper === 1) return [restY + m.upper, restY + m.bob];
    return [restY + m.bob];
  }
  return [restY + m.bob];
}

function applyEdges(frame: Frame, rule: EdgeRule): void {
  for (const label of rule.labels) {
    for (let x = 0; x < frame.width; x++) {
      for (let y = frame.height - 1; y >= 0; y--) {
        const i = y * frame.width + x;
        if (frame.part[i] !== label) continue;
        if (rule.mat) frame.mat[i] = rule.mat;
        if (rule.tone !== undefined) frame.fixedTone[i] = rule.tone;
        break;
      }
    }
  }
}

function zOfPart(frame: Frame, label: string): number {
  const i = frame.part.indexOf(label);
  return i < 0 ? 0 : frame.z[i];
}

function paintCell(frame: Frame, x: number, y: number, spec: CellSpec, overlay: ResolvedOverlay, allowed: ReadonlySet<string>, coverZ: number, piece: Piece): void {
  if (!inside(frame, x, y)) return;
  const i = y * frame.width + x;
  if (overlay.mode === 'cover') {
    // Crea o reemplaza la celda con la identidad de la pieza.
    frame.part[i] = piece.part ?? overlay.anchor;
    frame.z[i] = coverZ;
    frame.far[i] = 0;
    frame.fixedTone[i] = -1;
    frame.literal[i] = null;
  } else {
    const part = frame.part[i];
    if (part === null || !allowed.has(part)) return;
    if (overlay.mode === 'repaint') {
      frame.fixedTone[i] = -1;
      frame.literal[i] = null;
    }
  }
  if (spec.mat) frame.mat[i] = spec.mat;
  if (spec.tone !== undefined) frame.fixedTone[i] = spec.tone;
  if (spec.literal) frame.literal[i] = spec.literal;
}

function applyOverlay(frame: Frame, overlay: ResolvedOverlay, piece: Piece): void {
  const [ax, ay] = overlay.at;
  const allowed = new Set(overlay.parts ?? [overlay.anchor]);
  // Lo que se crea en modo cover hereda la profundidad del ancla (o la de la pieza).
  const coverZ = piece.z ?? zOfPart(frame, overlay.anchor);
  overlay.rows.forEach((row, r) => {
    const ys = targetRows(frame, overlay.anchor, ay + r);
    [...row].forEach((ch, c) => {
      if (isEmptyChar(ch)) return;
      const spec = overlay.legend[ch];
      if (!spec) throw new Error(`pieza ${piece.kind}:${piece.id}: símbolo sin leyenda «${ch}»`);
      let x = ax + c;
      if (overlay.mirrored) x = 2 * overlay.pivotX - x;
      for (const y of ys) paintCell(frame, x, y, spec, overlay, allowed, coverZ, piece);
    });
  });
}

/** Ordena las piezas por `KIND_ORDER` (estable dentro del mismo tipo). */
export function sortPieces(pieces: Piece[]): Piece[] {
  return pieces
    .map((piece, index) => ({ piece, index }))
    .sort((p, q) => KIND_ORDER.indexOf(p.piece.kind) - KIND_ORDER.indexOf(q.piece.kind) || p.index - q.index)
    .map(({ piece }) => piece);
}

/**
 * Viste un cuadro etiquetado: cobertura por región, bordes (puños, suelas),
 * superposiciones ancladas y capa de material. Las piezas se aplican en
 * `KIND_ORDER`; las superposiciones se autoran sobre el cuadro de reposo y se
 * desplazan con `frame.motion`.
 */
export function dressFrame(labelFrame: Frame, pieces: Piece[], overlaysOf: (piece: Piece) => ResolvedOverlay[]): Frame {
  const frame = cloneFrame(labelFrame);
  const ordered = sortPieces(pieces);

  const coverage: Record<string, string> = {};
  for (const label of SKIN_LABELS) coverage[label] = 'skin';
  for (const piece of ordered) Object.assign(coverage, piece.coverage ?? {});
  for (let i = 0; i < frame.part.length; i++) {
    const label = frame.part[i];
    if (label === null) continue;
    const mat = coverage[label];
    if (!mat) throw new Error(`región «${label}» sin material`);
    frame.mat[i] = mat;
  }

  for (const piece of ordered) for (const rule of piece.edges ?? []) applyEdges(frame, rule);

  for (const piece of ordered) {
    for (const overlay of overlaysOf(piece)) applyOverlay(frame, overlay, piece);
  }

  for (let i = 0; i < frame.part.length; i++) {
    const mat = frame.mat[i];
    if (frame.part[i] !== null && mat !== null) frame.z[i] += MAT_LAYER[mat] ?? 0;
  }
  return frame;
}

/** Cuadro vestido → RGBA con luz, rampas, literales y contorno. */
export function paintFrame(dressed: Frame, materials: Record<string, Ramp>, literals: Record<string, string>, rules: LightRules = LIGHT_RULES): Uint8Array {
  const tones = computeTones(dressed, rules);
  const resolved = cloneFrame(dressed);
  for (let i = 0; i < resolved.literal.length; i++) {
    const key = resolved.literal[i];
    if (key && !key.startsWith('#')) {
      const hex = literals[key];
      if (!hex) throw new Error(`color literal sin definir: ${key}`);
      resolved.literal[i] = hex;
    }
  }
  return renderFrame(resolved, tones, materials, OUTLINE);
}

// ── Componer un personaje desde el paquete ────────────────────────────────────

const RECIPE_KINDS: readonly (keyof RecipePieces)[] = ['hair', 'face', 'top', 'layer', 'bottom', 'shoes'];

function recipeLabel(recipe: Recipe): string {
  return recipe.id ? `receta ${recipe.id}` : 'avatar';
}

/** Piezas de la receta, ya ordenadas por `KIND_ORDER`. */
export function resolvePieces(bundle: KitBundle, recipe: Recipe): Piece[] {
  const keys: string[] = [];
  for (const kind of RECIPE_KINDS) {
    const id = recipe.pieces[kind];
    if (typeof id === 'string') keys.push(`${kind}:${id}`);
  }
  for (const id of recipe.pieces.accessories ?? []) keys.push(`accessory:${id}`);
  return sortPieces(keys.map(key => {
    const piece = bundle.pieces[key];
    if (!piece) throw new Error(`${recipeLabel(recipe)}: pieza desconocida ${key}`);
    return piece;
  }));
}

/**
 * Ranuras de color que usan las piezas (más la piel), con la primera pieza que
 * usa cada una. Sirve para fallar pronto y con nombre cuando a una receta le
 * falta un color.
 */
export function requiredSlots(pieces: Piece[]): Map<string, string> {
  const slots = new Map<string, string>([['skin', 'cuerpo']]);
  const add = (mat: string | undefined, owner: string): void => {
    if (mat && !slots.has(mat)) slots.set(mat, owner);
  };
  for (const piece of pieces) {
    const owner = `${piece.kind}:${piece.id}`;
    for (const mat of Object.values(piece.coverage ?? {})) add(mat, owner);
    for (const rule of piece.edges ?? []) add(rule.mat, owner);
    const lists = [...Object.values(piece.views), piece.portrait, ...Object.values(piece.expressions ?? {})];
    for (const list of lists) {
      for (const overlay of list ?? []) for (const spec of Object.values(overlay.legend)) add(spec.mat, owner);
    }
  }
  return slots;
}

export function resolveMaterials(bundle: KitBundle, recipe: Recipe): Record<string, Ramp> {
  const out: Record<string, Ramp> = {};
  for (const [slot, rampId] of Object.entries(recipe.colors)) {
    const ramp = bundle.ramps[rampId];
    if (!ramp) throw new Error(`${recipeLabel(recipe)}: rampa desconocida ${rampId} (ranura ${slot})`);
    out[slot] = ramp;
  }
  return out;
}

function composeSheet(bundle: KitBundle, recipe: Recipe, pieces: Piece[], materials: Record<string, Ramp>, literals: Record<string, string>, sheet: SheetId, keep: Record<ViewId, Frame[]> | null): RgbaImage {
  const views = bundle.complexions[recipe.complexion];
  const frames = SHEETS[sheet].frames;
  const width = frames * FRAME.width;
  const height = VIEW_ROWS.length * FRAME.height;
  const rgba = new Uint8Array(width * height * 4);
  VIEW_ROWS.forEach((view, row) => {
    const bundleView = views[view];
    const encoded = bundleView[sheet];
    if (encoded.length !== frames) throw new Error(`complexión ${recipe.complexion}: ${view}/${sheet} tiene ${encoded.length} cuadros; se esperaban ${frames}`);
    encoded.forEach((enc, col) => {
      const labels = decodeLabelFrame(enc, bundleView.kind, FRAME.width, FRAME.height);
      const ctx: OverlayContext = { pivotX: FRAME.pivotX, complexion: recipe.complexion, sheet, frame: col };
      const dressed = dressFrame(labels, pieces, piece => overlaysFor(piece, view, ctx));
      const painted = paintFrame(dressed, materials, literals, LIGHT_RULES);
      blitFrame(rgba, width, painted, FRAME.width, FRAME.height, col, row);
      if (keep) keep[view].push(dressed);
    });
  });
  return { width, height, rgba };
}

/** Retrato 96×96 con el mismo método: busto etiquetado + piezas + luz del retrato. */
export function composePortrait(bundle: KitBundle, recipe: Recipe, state: PortraitState): RgbaImage {
  const bust = bundle.busts[recipe.complexion];
  if (!bust) throw new Error(`${recipeLabel(recipe)}: complexión sin busto ${recipe.complexion}`);
  const { width, height } = PORTRAIT_FRAME;
  const frame = createFrame(width, height);
  gridRows(bust.grid).forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (isEmptyChar(ch)) return;
      const i = y * width + x;
      frame.part[i] = ch;
      frame.z[i] = bust.z[ch] ?? 0;
    });
  });
  const pieces = resolvePieces(bundle, recipe);
  const dressed = dressFrame(frame, pieces, piece => portraitOverlays(piece, recipe.complexion, state));
  const literals = { ...bundle.literals, ...(recipe.literals ?? {}) };
  return { width, height, rgba: paintFrame(dressed, resolveMaterials(bundle, recipe), literals, PORTRAIT_LIGHT_RULES) };
}

/**
 * Hojas `idle` (192×288) y `walk` (288×288), filas abajo/izquierda/derecha/arriba,
 * y los retratos de `recipe.portraits` (por defecto, solo el neutral).
 */
export function composeCharacter(bundle: KitBundle, recipe: Recipe, options: { keepDressed?: boolean } = {}): ComposedCharacter {
  if (!bundle.complexions[recipe.complexion]) throw new Error(`${recipeLabel(recipe)}: complexión desconocida ${recipe.complexion}`);
  const pieces = resolvePieces(bundle, recipe);
  const materials = resolveMaterials(bundle, recipe);
  for (const [slot, owner] of requiredSlots(pieces)) {
    if (!materials[slot]) throw new Error(`${recipeLabel(recipe)}: falta el color de la ranura «${slot}» (la usa ${owner})`);
  }
  const literals = { ...bundle.literals, ...(recipe.literals ?? {}) };
  const keepFor = (): Record<ViewId, Frame[]> | null => (options.keepDressed ? { down: [], left: [], right: [], up: [] } : null);
  const keepIdle = keepFor();
  const keepWalk = keepFor();
  const result: ComposedCharacter = {
    idle: composeSheet(bundle, recipe, pieces, materials, literals, 'idle', keepIdle),
    walk: composeSheet(bundle, recipe, pieces, materials, literals, 'walk', keepWalk),
    portraits: {},
  };
  for (const state of recipe.portraits ?? ['neutral']) {
    result.portraits[state] = composePortrait(bundle, recipe, state);
  }
  if (keepIdle && keepWalk) result.dressed = { idle: keepIdle, walk: keepWalk };
  return result;
}
```

Crea `frontend/tsconfig.kit.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "erasableSyntaxOnly": true,
    "lib": ["ES2022"],
    "types": []
  },
  "files": ["src/app/features/character/kit/kit-engine.ts"]
}
```

- [ ] **Step 6: Crea el rasterizador del maniquí y el compilador del paquete**

`frontend/scripts/character-kit/mannequin-raster.mjs` es `build-mannequin.mjs` con tres cambios: importa del motor, usa `labelZ`/`FAR_LABELS` del motor en vez de sus tablas propias y exporta `rasterizeMannequin`. Contenido completo:

```js
/**
 * Construye los cuadros etiquetados del maniquí (por vista y por cuadro) a
 * partir de su definición: grillas fijas + rig por cuadro.
 *
 * Salida: { [vista]: { idle: Frame[], walk: Frame[] } } con `part` = etiqueta
 * de la parte del cuerpo, `z` = profundidad y `far` = miembro lejano. Los
 * materiales (`mat`) los pone después la receta (vestir).
 */

import { FAR_LABELS, createFrame, inside, isEmptyChar, labelZ, mirrorFrame, parseGrid } from '../../src/app/features/character/kit/kit-engine.ts';

function stampGrid(frame, gridSpec, dx, dy, kind, opts = {}) {
  const rows = parseGrid(gridSpec.grid);
  const [ax, ay] = gridSpec.at;
  rows.forEach((row, r) => {
    let rowDy = dy;
    if (opts.lowerDy !== undefined && r >= opts.stretchRow) rowDy = opts.lowerDy;
    [...row].forEach((ch, c) => {
      if (isEmptyChar(ch)) return;
      put(frame, ax + c + dx, ay + r + rowDy, ch, kind);
    });
  });
  // Relleno del estiramiento (respiración): repite la fila de la cintura.
  if (opts.lowerDy !== undefined && opts.lowerDy - dy === 1) {
    const row = rows[opts.stretchRow];
    [...row].forEach((ch, c) => {
      if (!isEmptyChar(ch)) put(frame, ax + c + dx, ay + opts.stretchRow + dy, ch, kind);
    });
  }
}

function stampSprite(frame, sprite, left, top, label, kind, flipX = false) {
  const rows = parseGrid(sprite.grid);
  const w = rows[0].length;
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (!isEmptyChar(ch)) put(frame, left + (flipX ? w - 1 - c : c), top + r, label, kind);
    });
  });
}

/** Ancho de un sprite de grilla. */
function spriteWidth(sprite) {
  return parseGrid(sprite.grid)[0].length;
}

function put(frame, x, y, label, kind) {
  if (!inside(frame, x, y)) return;
  const i = y * frame.width + x;
  const z = labelZ(kind, label);
  // Gana lo que está delante: así el orden de estampado no importa.
  if (frame.part[i] !== null && frame.z[i] > z) return;
  frame.part[i] = label;
  frame.z[i] = z;
  frame.far[i] = kind === 'side' && FAR_LABELS.has(label) ? 1 : 0;
}

/** Izquierda del tramo de ancho `w` centrado en `cx` (en índices de píxel). */
function spanLeft(cx, w) {
  return Math.round(cx - (w - 1) / 2);
}

/**
 * Rasteriza un segmento por filas: en cada fila entre las dos articulaciones
 * pinta un tramo horizontal interpolando centro y ancho. Devuelve el tramo de
 * la última fila (para anclar mano o pie).
 */
function rasterSegment(frame, p0, p1, w0, w1, label, kind) {
  const [x0, y0] = p0;
  const [x1, y1] = p1;
  const ys = Math.round(y0);
  const ye = Math.round(y1);
  let last = null;
  for (let y = ys; y <= ye; y++) {
    const t = ye === ys ? 1 : (y - ys) / (ye - ys);
    const cx = x0 + (x1 - x0) * t;
    const w = Math.max(1, Math.round(w0 + (w1 - w0) * t));
    const left = spanLeft(cx, w);
    for (let x = left; x < left + w; x++) put(frame, x, y, label, kind);
    last = { left, right: left + w - 1, y };
  }
  return last;
}

/**
 * Miembro de dos segmentos + sprite final (mano o pie). Con `mirrored` el
 * sprite se refleja y se ancla por el borde derecho del tramo (lado derecho de
 * la pantalla en las vistas de frente/espalda).
 */
function limb(frame, joints, widths, labels, sprite, kind, spriteLabel, mirrored = false) {
  const [w0, w1] = widths[0];
  const [w2, w3] = widths[1];
  rasterSegment(frame, joints[0], joints[1], w0, w1, labels[0], kind);
  const end = rasterSegment(frame, joints[1], joints[2], w2, w3, labels[1], kind);
  if (!sprite || !end) return;
  const top = end.y + sprite.anchor[1];
  if (mirrored) {
    const left = end.right - (spriteWidth(sprite) - 1) - sprite.anchor[0];
    stampSprite(frame, sprite, left, top, spriteLabel, kind, true);
  } else {
    stampSprite(frame, sprite, end.left + sprite.anchor[0], top, spriteLabel, kind);
  }
}

const add = (p, dx, dy) => [p[0] + dx, p[1] + dy];
const mirrorX = (p, pivotX) => [2 * pivotX - p[0], p[1]];

function buildFrontFrame(m, view, sheet, f) {
  const { width, height, pivotX } = m.frame;
  const frame = createFrame(width, height);
  const kind = 'front';
  const walk = sheet === 'walk';
  const bob = walk ? m.sheets.walk.bob[f] : 0;
  const breath = walk ? 0 : m.sheets.idle.breath[f];
  const upper = bob + breath;

  stampGrid(frame, view.head, 0, upper, kind);
  stampGrid(frame, view.neck, 0, upper, kind);
  stampGrid(frame, view.torso, 0, upper, kind, { stretchRow: view.torso.stretchRow, lowerDy: bob });
  stampGrid(frame, view.pelvis, 0, bob, kind);

  const n = view.legPhases.length;
  for (const side of ['left', 'right']) {
    const isLeft = side === 'left';
    const phaseIndex = walk ? (isLeft ? f : (f + n / 2) % n) : 2;
    const leg = view.legPhases[phaseIndex];
    const armDy = walk ? view.armPhases[phaseIndex] : 0;
    const flip = (p) => (isLeft ? p : mirrorX(p, pivotX));

    const rest = view.armRest;
    const arm = [
      flip(add(rest.shoulder, 0, upper)),
      flip(add(rest.elbow, 0, upper)),
      flip(add(rest.wrist, 0, upper + armDy)),
    ];
    const armLabels = isLeft ? ['a', 'b'] : ['A', 'B'];
    limb(frame, arm, [m.widths.upperArm, m.widths.forearm], armLabels, view.hand, kind, isLeft ? 'c' : 'C', !isLeft);

    const hip = flip([view.hip[0], view.hip[1] + bob]);
    const knee = flip(leg.knee);
    const ankle = flip(leg.ankle);
    const foot = view.feet[leg.foot];
    const legLabels = isLeft ? ['l', 'm'] : ['L', 'M'];
    limb(frame, [hip, knee, ankle], [m.widths.thighFront, m.widths.shinFront], legLabels, foot, kind, isLeft ? 'o' : 'O', !isLeft);
  }
  frame.motion = { upper, bob, waistY: view.torso.at[1] + view.torso.stretchRow };
  return frame;
}

function buildSideFrame(m, view, sheet, f) {
  const { width, height } = m.frame;
  const frame = createFrame(width, height);
  const kind = 'side';
  const walk = sheet === 'walk';
  const bob = walk ? m.sheets.walk.bob[f] : 0;
  const breath = walk ? 0 : m.sheets.idle.breath[f];
  const upper = bob + breath;

  stampGrid(frame, view.head, 0, upper, kind);
  stampGrid(frame, view.ear, 0, upper, kind);
  stampGrid(frame, view.neck, 0, upper, kind);
  stampGrid(frame, view.torso, 0, upper, kind, { stretchRow: view.torso.stretchRow, lowerDy: bob });
  stampGrid(frame, view.pelvis, 0, bob, kind);

  const n = view.legPhases.length;
  for (const near of [true, false]) {
    const phaseIndex = walk ? (near ? f : (f + n / 2) % n) : 2;
    const dx = near ? 0 : view.farOffset;

    const armPhase = view.armPhases[phaseIndex];
    const shoulder = add(view.armRest.shoulder, dx, upper);
    const arm = [shoulder, add(shoulder, ...armPhase.elbow), add(shoulder, ...armPhase.wrist)];
    limb(frame, arm, [m.widths.upperArm, m.widths.forearm], near ? ['a', 'b'] : ['A', 'B'], view.hand, kind, near ? 'c' : 'C');

    const leg = view.legPhases[phaseIndex];
    const hip = [view.hip[0] + dx, view.hip[1] + bob];
    const ankle = [leg.ankle[0] + dx, leg.ankle[1]];
    // Rodilla: punto medio empujado hacia delante (−x) según la flexión.
    const knee = [(hip[0] + ankle[0]) / 2 - leg.bend, (hip[1] + ankle[1]) / 2];
    const foot = view.feet[leg.foot];
    limb(frame, [hip, knee, ankle], [m.widths.thighSide, m.widths.shinSide], near ? ['l', 'm'] : ['L', 'M'], foot, kind, near ? 'o' : 'O');
  }
  frame.motion = { upper, bob, waistY: view.torso.at[1] + view.torso.stretchRow };
  return frame;
}

/**
 * Cuadros etiquetados del maniquí para las 4 vistas. `right` es el espejo de
 * `left` (la luz se calcula más tarde, ya reflejada).
 */
export function rasterizeMannequin(m) {
  const out = {};
  for (const [name, view] of Object.entries(m.views)) {
    const build = view.kind === 'side' ? buildSideFrame : buildFrontFrame;
    out[name] = {};
    for (const [sheet, spec] of Object.entries(m.sheets)) {
      out[name][sheet] = Array.from({ length: spec.frames }, (_, f) => build(m, view, sheet, f));
    }
  }
  out.right = {};
  for (const [sheet, frames] of Object.entries(out.left)) {
    out.right[sheet] = frames.map(fr => mirrorFrame(fr, m.frame.pivotX));
  }
  return out;
}
```

Crea `frontend/scripts/character-kit/bundle.mjs`:

```js
/**
 * Paquete del kit (`kit.json`): compila la autoría (maniquíes, bustos, piezas,
 * rampas y recetas) al formato que consume el motor. Puro y determinista: no
 * escribe archivos (eso lo hace `build.mjs`).
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUSTS } from '../../character-kit/busts/index.mjs';
import { COMPLEXIONS } from '../../character-kit/mannequins/index.mjs';
import { PIECES } from '../../character-kit/pieces/index.mjs';
import { LITERAL_DEFAULTS, RAMPS } from '../../character-kit/ramps.mjs';
import {
  PORTRAIT_STATES,
  SHEET_IDS,
  VIEW_ROWS,
  encodeLabelFrame,
  encodeRle,
  parseGrid,
} from '../../src/app/features/character/kit/kit-engine.ts';
import { rasterizeMannequin } from './mannequin-raster.mjs';

export const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const KIT_ROOT = path.join(FRONTEND_ROOT, 'character-kit');

const PIECE_KINDS = new Set(['hair', 'face', 'top', 'layer', 'bottom', 'shoes', 'accessory']);
const MODES = new Set(['paint', 'repaint', 'cover']);
const VIEW_KIND = Object.freeze({ down: 'front', up: 'back', left: 'side', right: 'side' });

/** Grilla de autoría → RLE de las filas normalizadas (unidas con \n). */
export function compileGrid(text, where) {
  const rows = parseGrid(text);
  const joined = rows.join('\n');
  if (/\d/.test(joined)) throw new Error(`${where}: la grilla no puede contener dígitos`);
  return { rows, encoded: encodeRle(joined) };
}

function compileOverlay(overlay, where) {
  if (!MODES.has(overlay.mode)) throw new Error(`${where}: modo desconocido «${overlay.mode}»`);
  for (const sheet of overlay.sheets ?? []) {
    if (!SHEET_IDS.includes(sheet)) throw new Error(`${where}: hoja desconocida «${sheet}»`);
  }
  const { rows, encoded } = compileGrid(overlay.grid, where);
  for (const row of rows) {
    for (const ch of row) {
      if (ch === '.' || ch === ' ') continue;
      const spec = overlay.legend[ch];
      if (!spec) throw new Error(`${where}: símbolo «${ch}» sin leyenda`);
      if (overlay.mode === 'cover' && !spec.mat && !spec.literal) {
        throw new Error(`${where}: en modo cover «${ch}» necesita mat o literal`);
      }
    }
  }
  return { ...overlay, grid: encoded };
}

const compileList = (list, where) => list.map((o, i) => compileOverlay(o, `${where}[${i}]`));

/** Valida una pieza de autoría y codifica sus grillas. */
export function compilePiece(piece) {
  const key = `${piece.kind}:${piece.id}`;
  if (!PIECE_KINDS.has(piece.kind)) throw new Error(`pieza ${key}: tipo desconocido`);
  if (piece.asymmetric && !piece.views?.right) throw new Error(`pieza ${key}: es asimétrica y le falta la vista right`);
  const views = {};
  for (const [view, list] of Object.entries(piece.views ?? {})) {
    if (!VIEW_ROWS.includes(view)) throw new Error(`pieza ${key}: vista desconocida «${view}»`);
    views[view] = compileList(list, `pieza ${key} ${view}`);
  }
  const out = { ...piece, views };
  if (piece.portrait) out.portrait = compileList(piece.portrait, `pieza ${key} retrato`);
  if (piece.expressions) {
    out.expressions = {};
    for (const [state, list] of Object.entries(piece.expressions)) {
      if (!PORTRAIT_STATES.includes(state)) throw new Error(`pieza ${key}: estado de retrato desconocido «${state}»`);
      out.expressions[state] = compileList(list, `pieza ${key} ${state}`);
    }
  }
  return out;
}

/** Recetas fijas: `recipes/<id>.json` (las que empiezan por `_` no se publican). */
export function loadRecipes(dir = path.join(KIT_ROOT, 'recipes')) {
  const out = {};
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_')).sort()) {
    const recipe = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    if (`${recipe.id}.json` !== file) throw new Error(`receta ${file}: el id debe coincidir con el nombre del archivo`);
    out[recipe.id] = recipe;
  }
  return out;
}

export function buildBundle() {
  const complexions = {};
  for (const [id, def] of Object.entries(COMPLEXIONS)) {
    const frames = rasterizeMannequin(def);
    complexions[id] = Object.fromEntries(VIEW_ROWS.map(view => [view, {
      kind: VIEW_KIND[view],
      idle: frames[view].idle.map(encodeLabelFrame),
      walk: frames[view].walk.map(encodeLabelFrame),
    }]));
  }
  const busts = {};
  for (const [id, bust] of Object.entries(BUSTS)) {
    busts[id] = { grid: compileGrid(bust.grid, `busto ${id}`).encoded, z: bust.z };
  }
  const pieces = {};
  for (const piece of PIECES) {
    const key = `${piece.kind}:${piece.id}`;
    if (pieces[key]) throw new Error(`pieza duplicada ${key}`);
    pieces[key] = compilePiece(piece);
  }
  return { schemaVersion: 1, complexions, busts, pieces, ramps: RAMPS, literals: LITERAL_DEFAULTS, recipes: loadRecipes() };
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, sortKeys(value[k])]));
  }
  return value;
}

/** JSON canónico del paquete: claves ordenadas, sin espacios y con salto final. */
export function stringifyBundle(bundle) {
  return `${JSON.stringify(sortKeys(bundle))}\n`;
}
```

Borra lo sustituido:

```bash
git rm scripts/character-kit/kit-core.mjs scripts/character-kit/kit-dress.mjs scripts/character-kit/build-mannequin.mjs scripts/character-kit/generate.mjs scripts/character-kit/preview-mannequin.mjs
```

- [ ] **Step 7: Ejecuta las pruebas y el chequeo de tipos**

Run: `npm run test:kit`
Expected: PASS, `ℹ pass 16`, `ℹ fail 0` (incluida «Valentina sale idéntica a la prueba aprobada (76e6171)»).

Run: `npm run kit:types`
Expected: sin salida, código 0.

- [ ] **Step 8: Commit**

```bash
git add -A character-kit scripts/character-kit src/app/features/character/kit tsconfig.kit.json package.json
git commit -m "feat(personajes): motor del kit en TypeScript y paquete, con Valentina idéntica a la prueba

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `npm run kit:build` — paquete, hojas y manifiesto en disco

**Files:**
- Modify: `frontend/scripts/character-kit/kit-png.mjs` (añade `encodePng` y `decodePng`)
- Create: `frontend/scripts/character-kit/build.mjs`
- Create: `frontend/scripts/character-kit/build.test.mjs`
- Modify: `frontend/package.json`
- Generated: `frontend/src/assets/characters/kit/{kit.json,manifest.json,valentina/*.png}`

**Interfaces:**
- Consumes: `buildBundle`, `stringifyBundle`, `FRONTEND_ROOT` (tarea 1); `composeCharacter` (motor).
- Produces: `kit-png.mjs` → `encodePng(width, height, rgba) → Buffer`, `decodePng(bytes) → RgbaImage`, `readPng(file)`, `writePng(file, w, h, rgba)`, `scaleNearest(rgba, w, h, k)`. `build.mjs` → `DEFAULT_OUT`, `sha256(data) → hex`, `publishedImages(composed) → { idle, walk, 'portrait-<estado>' }`, `buildOutputs() → { bundle, files: Map<rutaRelativa, Buffer>, manifest }`, `writeOutputs(files, outDir)`.
- Manifiesto: `{ schemaVersion: 1, kitSha256, characters: { [id]: { displayName, kind, complexion, provenance, files: { [nombre]: { path, width, height, pixelSha256 } } } } }`.

- [ ] **Step 1: Escribe las pruebas**

Crea `frontend/scripts/character-kit/build.test.mjs`:

```js
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildOutputs, writeOutputs } from './build.mjs';

const golden = JSON.parse(readFileSync(new URL('./fixtures/valentina-prueba.json', import.meta.url), 'utf8'));

test('el build es determinista: dos ejecuciones, mismos bytes', () => {
  const a = buildOutputs().files;
  const b = buildOutputs().files;
  assert.deepEqual([...a.keys()].sort(), [...b.keys()].sort());
  for (const [rel, bytes] of a) assert.ok(bytes.equals(b.get(rel)), rel);
});

test('el manifiesto registra los hashes de píxeles de Valentina', () => {
  const { manifest, files } = buildOutputs();
  const v = manifest.characters.valentina;
  assert.equal(v.files.idle.pixelSha256, golden.idle);
  assert.equal(v.files.walk.pixelSha256, golden.walk);
  assert.equal(v.files['portrait-neutral'].pixelSha256, golden['portrait-neutral']);
  assert.deepEqual(v.provenance, { source: 'Kit SIEP', license: 'SIEP-INTERNAL' });
  assert.ok(files.has('kit.json') && files.has('manifest.json') && files.has('valentina/idle.png'));
});

test('writeOutputs escribe todo y borra carpetas de personajes que ya no existen', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'kit-'));
  try {
    mkdirSync(path.join(out, 'retirado'));
    writeFileSync(path.join(out, 'retirado', 'idle.png'), 'x');
    const { files } = buildOutputs();
    writeOutputs(files, out);
    assert.ok(!existsSync(path.join(out, 'retirado')));
    for (const rel of files.keys()) assert.ok(existsSync(path.join(out, rel)), rel);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Ejecuta y confirma que fallan**

Run: `npm run test:kit`
Expected: FAIL en `build.test.mjs` — `Cannot find module './build.mjs'`.

- [ ] **Step 3: Implementa**

Reemplaza `frontend/scripts/character-kit/kit-png.mjs`:

```js
/** E/S de PNG para el kit (Node). El motor trabaja con RGBA crudo. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { PNG } from 'pngjs';

/** RGBA → bytes PNG (RGBA de 8 bits). Determinista. */
export function encodePng(width, height, rgba) {
  const png = new PNG({ width, height, colorType: 6 });
  png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  return PNG.sync.write(png, { colorType: 6 });
}

export function decodePng(bytes) {
  const png = PNG.sync.read(bytes);
  return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
}

export function writePng(filePath, width, height, rgba) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, encodePng(width, height, rgba));
}

export function readPng(filePath) {
  return decodePng(readFileSync(filePath));
}

/** Escala entera por vecino más cercano. */
export function scaleNearest(rgba, width, height, k) {
  const out = new Uint8Array(width * k * height * k * 4);
  for (let y = 0; y < height * k; y++) {
    for (let x = 0; x < width * k; x++) {
      const s = ((Math.floor(y / k) * width) + Math.floor(x / k)) * 4;
      out.set(rgba.subarray(s, s + 4), (y * width * k + x) * 4);
    }
  }
  return out;
}
```

Crea `frontend/scripts/character-kit/build.mjs`:

```js
#!/usr/bin/env node
/**
 * npm run kit:build — escribe el paquete del kit (`kit.json`), las hojas y los
 * retratos de cada receta fija y el manifiesto. Determinista: dos ejecuciones
 * seguidas dan los mismos bytes.
 *
 *   node scripts/character-kit/build.mjs [--out <carpeta>]
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeCharacter } from '../../src/app/features/character/kit/kit-engine.ts';
import { FRONTEND_ROOT, buildBundle, stringifyBundle } from './bundle.mjs';
import { encodePng } from './kit-png.mjs';

export const DEFAULT_OUT = path.join(FRONTEND_ROOT, 'src', 'assets', 'characters', 'kit');

export const sha256 = data => createHash('sha256').update(data).digest('hex');

/** Imágenes publicadas de un personaje compuesto: `idle`, `walk` y `portrait-<estado>`. */
export function publishedImages(composed) {
  const images = { idle: composed.idle, walk: composed.walk };
  for (const [state, image] of Object.entries(composed.portraits)) images[`portrait-${state}`] = image;
  return images;
}

/**
 * Todo lo que el build escribe, en memoria. `files` mapea la ruta relativa a
 * `--out` con sus bytes; el validador lo reutiliza para comparar con el disco.
 */
export function buildOutputs() {
  const bundle = buildBundle();
  const kitJson = stringifyBundle(bundle);
  const files = new Map([['kit.json', Buffer.from(kitJson)]]);
  const characters = {};
  for (const [id, recipe] of Object.entries(bundle.recipes)) {
    const composed = composeCharacter(bundle, recipe);
    const entry = {
      displayName: recipe.displayName,
      kind: recipe.kind,
      complexion: recipe.complexion,
      provenance: recipe.provenance,
      files: {},
    };
    for (const [name, image] of Object.entries(publishedImages(composed))) {
      const rel = `${id}/${name}.png`;
      files.set(rel, encodePng(image.width, image.height, image.rgba));
      entry.files[name] = { path: rel, width: image.width, height: image.height, pixelSha256: sha256(image.rgba) };
    }
    characters[id] = entry;
  }
  const manifest = { schemaVersion: 1, kitSha256: sha256(kitJson), characters };
  files.set('manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  return { bundle, files, manifest };
}

/**
 * Escribe `files` en `outDir` y borra las carpetas de personajes que ya no
 * existen. La carpeta `kit/` es solo del build: nada más debe vivir en ella.
 */
export function writeOutputs(files, outDir) {
  const keepDirs = new Set([...files.keys()].filter(rel => rel.includes('/')).map(rel => rel.split('/')[0]));
  mkdirSync(outDir, { recursive: true });
  for (const entry of readdirSync(outDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !keepDirs.has(entry.name)) rmSync(path.join(outDir, entry.name), { recursive: true });
  }
  for (const [rel, bytes] of files) {
    const file = path.join(outDir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
}

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : DEFAULT_OUT;
  const { files, manifest } = buildOutputs();
  writeOutputs(files, outDir);
  const kitBytes = files.get('kit.json').length;
  process.stdout.write(`kit.json: ${(kitBytes / 1024).toFixed(1)} KB · ${Object.keys(manifest.characters).length} personajes · ${files.size} archivos en ${outDir}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
```

Añade a `frontend/package.json`:

```json
    "kit:build": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/character-kit/build.mjs",
```

- [ ] **Step 4: Ejecuta pruebas y build**

Run: `npm run test:kit`
Expected: PASS (`ℹ pass 19`).

Run: `npm run kit:build`
Expected: `kit.json: 33.2 KB · 1 personajes · 5 archivos en …/src/assets/characters/kit`.

Run: `git status --short src/assets/characters/kit`
Expected: solo `?? src/assets/characters/kit/kit.json` y `?? …/manifest.json`. Los tres PNG de Valentina no cambian (el build reproduce los mismos bytes de la prueba).

- [ ] **Step 5: Commit**

```bash
git add scripts/character-kit package.json src/assets/characters/kit
git commit -m "feat(personajes): npm run kit:build escribe el paquete, las hojas y el manifiesto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Validador `npm run kit:check` en CI

**Files:**
- Create: `frontend/scripts/character-kit/measure.mjs`, `measure.test.mjs`
- Create: `frontend/scripts/character-kit/muestras.mjs`
- Create: `frontend/scripts/character-kit/check.mjs`, `check.test.mjs`
- Modify: `frontend/scripts/character-kit/build.mjs` (geometría en el manifiesto)
- Modify: `frontend/package.json`, `.github/workflows/ci.yml`
- Modify: `docs/visual/premium-visual-bible-v1.md` (enmienda del §1)

**Interfaces:**
- Consumes: `buildOutputs`, `DEFAULT_OUT` (tarea 2); `composeCharacter`, `OUTLINE`, `decodeRle`, `SHEET_IDS` (motor).
- Produces: `measure.mjs` → `RULES`, `cell`, `checkImageContract`, `components`, `centralWidth`, `checkSpriteFrame`, `checkAnimation`, `checkMirror`, `geometry(composed) → { [vista]: { opaqueHeight, headWidth, shoulderWidth | torsoDepth } }`, `checkCharacter(composed, { name, palette, outline, volume }) → string[]`, `checkSharedHead(bundle) → string[]`. `muestras.mjs` → `SAMPLE_BASE`, `sampleRecipe(pieceKey, complexion)`, `sampleRecipes(bundle)`. `check.mjs` → `loadPalette() → Set`, `checkColors(bundle, palette)`, `checkUpToDate(files, outDir)`, `runCheck({ outDir }) → { errors: string[], warnings: string[] }`.

- [ ] **Step 1: Escribe las pruebas de las medidas y del validador**

Crea `frontend/scripts/character-kit/measure.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { FRAME, OUTLINE, composeCharacter, decodeRle, encodeRle } from '../../src/app/features/character/kit/kit-engine.ts';
import { buildBundle } from './bundle.mjs';
import { checkCharacter, checkMirror, checkSharedHead, geometry } from './measure.mjs';

const palette = new Set(JSON.parse(readFileSync(new URL('../../character-kit/palette.v2.json', import.meta.url), 'utf8')).masterColors);
const bundle = buildBundle();
const valentina = () => composeCharacter(bundle, bundle.recipes.valentina, { keepDressed: true });
const check = (composed, extra = {}) => checkCharacter(composed, { name: 'v', palette, outline: OUTLINE, ...extra });

/** Copia de una hoja con el píxel (x, y) del cuadro (col, row) cambiado. */
function withPixel(image, col, row, x, y, rgba) {
  const copy = { ...image, rgba: image.rgba.slice() };
  copy.rgba.set(rgba, ((row * FRAME.height + y) * image.width + col * FRAME.width + x) * 4);
  return copy;
}

test('Valentina cumple todo el contrato', () => {
  assert.deepEqual(check(valentina()), []);
});

test('geometría de Valentina para el manifiesto', () => {
  assert.deepEqual(geometry(valentina()), {
    down: { opaqueHeight: 64, headWidth: 21, shoulderWidth: 23 },
    left: { opaqueHeight: 64, headWidth: 20, torsoDepth: 14 },
    right: { opaqueHeight: 64, headWidth: 19, torsoDepth: 14 },
    up: { opaqueHeight: 64, headWidth: 21, shoulderWidth: 23 },
  });
});

test('detecta un píxel opaco en el borde del cuadro', () => {
  const v = valentina();
  const errors = check({ ...v, idle: withPixel(v.idle, 0, 0, 0, 0, [0x15, 0x13, 0x1d, 255]) });
  assert.ok(errors.some(e => e.includes('píxel opaco en el borde (0,0)')), errors.join('\n'));
});

test('detecta alfa no binario y colores fuera de la paleta', () => {
  const v = valentina();
  const semi = check({ ...v, idle: withPixel(v.idle, 0, 0, 24, 30, [0x3d, 0x6a, 0x55, 128]) });
  assert.ok(semi.some(e => e.includes('alfa 128')), semi.join('\n'));
  const fuera = check({ ...v, idle: withPixel(v.idle, 0, 0, 24, 30, [1, 2, 3, 255]) });
  assert.ok(fuera.some(e => e.includes('color #010203 fuera de la paleta')), fuera.join('\n'));
});

test('detecta una pieza suelta (dos siluetas)', () => {
  const v = valentina();
  const errors = check({ ...v, idle: withPixel(v.idle, 0, 0, 3, 3, [0x15, 0x13, 0x1d, 255]) });
  assert.ok(errors.some(e => e.includes('2 componentes opacos')), errors.join('\n'));
});

test('detecta la derecha como espejo exacto de la izquierda', () => {
  const { walk } = valentina();
  const copy = { ...walk, rgba: walk.rgba.slice() };
  for (let col = 0; col < 6; col++) {
    for (let y = 0; y < FRAME.height; y++) {
      for (let x = 0; x < FRAME.width; x++) {
        const src = ((FRAME.height + y) * walk.width + col * FRAME.width + x) * 4;
        const dst = ((2 * FRAME.height + y) * walk.width + col * FRAME.width + (FRAME.width - 1 - x)) * 4;
        copy.rgba.set(walk.rgba.subarray(src, src + 4), dst);
      }
    }
  }
  assert.equal(checkMirror(copy, 'v', 'walk').length, 6);
});

test('el pelo de volumen admite una cabeza de hasta 25 px', () => {
  const v = valentina();
  // Ensancha la cabeza de frente a 25 px (x 12-36) en las filas 6-19 del cuadro 0 de reposo.
  let idle = v.idle;
  for (let y = 6; y <= 19; y++) {
    for (let x = 12; x <= 36; x++) idle = withPixel(idle, 0, 0, x, y, [0x15, 0x13, 0x1d, 255]);
  }
  const ancho = { ...v, idle };
  const sinVolumen = check(ancho).filter(e => e.includes('idle down [0] cabeza'));
  const conVolumen = check(ancho, { volume: true }).filter(e => e.includes('idle down [0] cabeza'));
  assert.equal(sinVolumen.length, 1, sinVolumen.join('\n'));
  assert.deepEqual(conVolumen, []);
});

test('cráneo compartido: una complexión con otra cabeza falla', () => {
  assert.deepEqual(checkSharedHead(bundle), []);
  // Copia «b» idéntica a A salvo una celda de la cabeza.
  const otra = structuredClone(bundle);
  otra.complexions.b = structuredClone(otra.complexions.a);
  const enc = otra.complexions.b.down.idle[0];
  const cells = [...decodeRle(enc.labels)];
  cells[cells.indexOf('H')] = '.';
  otra.complexions.b.down.idle[0] = { ...enc, labels: encodeRle(cells.join('')) };
  const errors = checkSharedHead(otra);
  assert.equal(errors.length, 1, errors.join('\n'));
  assert.match(errors[0], /complexión b down\/idle \[0\]: la cabeza no coincide/);
});
```

Crea `frontend/scripts/character-kit/check.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildBundle } from './bundle.mjs';
import { buildOutputs, writeOutputs } from './build.mjs';
import { checkColors, checkUpToDate, loadPalette, runCheck } from './check.mjs';
import { decodePng, encodePng } from './kit-png.mjs';

function freshOut() {
  const out = mkdtempSync(path.join(tmpdir(), 'kit-check-'));
  writeOutputs(buildOutputs().files, out);
  return out;
}

test('un kit recién construido pasa el validador completo', () => {
  const out = freshOut();
  try {
    assert.deepEqual(runCheck({ outDir: out }), { errors: [], warnings: [] });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('detecta hojas desactualizadas y archivos que sobran', () => {
  const out = freshOut();
  try {
    const { files } = buildOutputs();
    const idle = decodePng(files.get('valentina/idle.png'));
    idle.rgba[(30 * idle.width + 24) * 4] ^= 0xff;
    writeFileSync(path.join(out, 'valentina', 'idle.png'), encodePng(idle.width, idle.height, idle.rgba));
    writeFileSync(path.join(out, 'valentina', 'viejo.png'), 'x');
    const errors = checkUpToDate(files, out);
    assert.ok(errors.includes('valentina/idle.png está desactualizado: ejecuta npm run kit:build'), errors.join('\n'));
    assert.ok(errors.includes('valentina/viejo.png sobra: el build no lo genera (ejecuta npm run kit:build)'), errors.join('\n'));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('rampas fuera de la paleta o que no oscurecen', () => {
  const bundle = buildBundle();
  bundle.ramps.mala = ['#010203', '#5b8d70', '#85b294', '#29483d'];
  const errors = checkColors(bundle, loadPalette());
  assert.ok(errors.includes('rampa mala: #010203 no está en palette.v2.json'), errors.join('\n'));
  assert.ok(errors.includes('rampa mala: #85b294 no es más oscuro que #5b8d70'), errors.join('\n'));
});

test('el manifiesto lleva la geometría por vista', () => {
  const { manifest } = buildOutputs();
  assert.deepEqual(manifest.characters.valentina.geometry.down, { opaqueHeight: 64, headWidth: 21, shoulderWidth: 23 });
});
```

- [ ] **Step 2: Ejecuta y confirma que fallan**

Run: `npm run test:kit`
Expected: FAIL — `Cannot find module './measure.mjs'` y `./check.mjs`.

- [ ] **Step 3: Implementa las medidas**

Crea `frontend/scripts/character-kit/measure.mjs`:

```js
/**
 * Medidas del contrato de personajes (biblia v1 §1, enmendada por el spec de
 * personajes unificados §6 y §11). Funciones puras sobre RGBA y cuadros
 * vestidos; devuelven listas de errores legibles (vacía = cumple).
 */

import { FRAME, SHEETS, SHEET_IDS, VIEW_ROWS, decodeRle } from '../../src/app/features/character/kit/kit-engine.ts';

export const RULES = Object.freeze({
  axisX: 24,
  bodyBottom: [66, 68],
  opaqueHeight: [60, 66],
  /** Primeras 18 filas del cuerpo: ancho del tramo que cruza x = 24. */
  head: { from: 0, to: 17, width: [18, 21], volumeWidth: [18, 25], consecutive: 6, total: 8 },
  /** Diez filas siguientes: hombros de frente/espalda, fondo del torso en perfil. */
  shoulders: { from: 18, to: 27, front: [20, 27], side: [10, 16], consecutive: 3, total: 4 },
  /** Cráneo (etiqueta H) con contorno, de frente: el de la complexión A. */
  skullWidth: 17,
  stanceTolerance: 6,
  soleY: 66,
});

const SIDE_VIEWS = new Set(['left', 'right']);

function hex(rgba, i) {
  return `#${[rgba[i], rgba[i + 1], rgba[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Acceso a un cuadro (col, row) de una imagen; fuera del cuadro = transparente. */
export function cell(image, col, row, fw = FRAME.width, fh = FRAME.height) {
  const ox = col * fw;
  const oy = row * fh;
  const index = (x, y) => ((oy + y) * image.width + ox + x) * 4;
  const alpha = (x, y) => (x < 0 || y < 0 || x >= fw || y >= fh ? 0 : image.rgba[index(x, y) + 3]);
  return { fw, fh, index, alpha, color: (x, y) => hex(image.rgba, index(x, y)) };
}

/**
 * Tamaño, alfa binario, paleta, borde del cuadro vacío y contorno exterior
 * `#15131d` en cada cuadro de la imagen.
 */
export function checkImageContract(image, { name, fw, fh, cols, rows, palette, outline }) {
  const errors = [];
  if (image.width !== cols * fw || image.height !== rows * fh) {
    return [`${name}: mide ${image.width}×${image.height}; debe medir ${cols * fw}×${rows * fh}`];
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const c = cell(image, col, row, fw, fh);
      const where = `${name} [${col},${row}]`;
      let opaque = 0;
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          const a = c.alpha(x, y);
          if (a !== 0 && a !== 255) { errors.push(`${where}: alfa ${a} en (${x},${y}); solo 0 o 255`); continue; }
          if (a === 0) continue;
          opaque++;
          if (x === 0 || y === 0 || x === fw - 1 || y === fh - 1) errors.push(`${where}: píxel opaco en el borde (${x},${y})`);
          const color = c.color(x, y);
          if (!palette.has(color)) errors.push(`${where}: color ${color} fuera de la paleta en (${x},${y})`);
          const exterior = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => c.alpha(nx, ny) === 0);
          if (exterior && color !== outline) errors.push(`${where}: borde exterior ${color} en (${x},${y}); debe ser ${outline}`);
        }
      }
      if (opaque === 0) errors.push(`${where}: cuadro vacío`);
    }
  }
  return errors;
}

/** Componentes 4-conexos opacos de un cuadro. */
export function components(c) {
  const seen = new Set();
  const out = [];
  for (let y = 0; y < c.fh; y++) {
    for (let x = 0; x < c.fw; x++) {
      const key = y * c.fw + x;
      if (c.alpha(x, y) !== 255 || seen.has(key)) continue;
      const pixels = new Set([key]);
      const stack = [[x, y]];
      seen.add(key);
      let top = y;
      let bottom = y;
      while (stack.length) {
        const [px, py] = stack.pop();
        top = Math.min(top, py);
        bottom = Math.max(bottom, py);
        for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
          const nk = ny * c.fw + nx;
          if (c.alpha(nx, ny) !== 255 || seen.has(nk)) continue;
          seen.add(nk);
          pixels.add(nk);
          stack.push([nx, ny]);
        }
      }
      out.push({ pixels, top, bottom });
    }
  }
  return out;
}

/** Ancho del tramo opaco contiguo que cruza x = 24 en la fila y (0 si no cruza). */
export function centralWidth(body, fw, y) {
  const at = x => body.pixels.has(y * fw + x);
  if (!at(RULES.axisX)) return 0;
  let left = RULES.axisX;
  let right = RULES.axisX;
  while (left - 1 >= 0 && at(left - 1)) left--;
  while (right + 1 < fw && at(right + 1)) right++;
  return right - left + 1;
}

function bandErrors(body, fw, band, [min, max], label) {
  let total = 0;
  let run = 0;
  let longest = 0;
  const widths = [];
  for (let y = body.top + band.from; y <= body.top + band.to; y++) {
    const w = centralWidth(body, fw, y);
    widths.push(w);
    if (w >= min && w <= max) { total++; run++; longest = Math.max(longest, run); } else run = 0;
  }
  if (longest >= band.consecutive || total >= band.total) return [];
  return [`${label}: ${total} filas en ${min}-${max} px (${longest} seguidas); requiere ${band.consecutive} seguidas o ${band.total} en total. Anchos: ${widths.join(',')}`];
}

/** Extremos x de los pies (etiquetas o/O) y su fila más baja. */
function feet(dressed) {
  const out = { minX: Infinity, maxX: -Infinity, o: -1, O: -1 };
  for (let y = 0; y < dressed.height; y++) {
    for (let x = 0; x < dressed.width; x++) {
      const p = dressed.part[y * dressed.width + x];
      if (p !== 'o' && p !== 'O') continue;
      out.minX = Math.min(out.minX, x);
      out.maxX = Math.max(out.maxX, x);
      out[p] = Math.max(out[p], y);
    }
  }
  return out;
}

/** Reglas por cuadro de cuerpo: un componente, pies, altura, cabeza, hombros, apoyo. */
export function checkSpriteFrame(image, col, row, { name, view, dressed, volume = false }) {
  const errors = [];
  const where = `${name} ${view} [${col}]`;
  const c = cell(image, col, row);
  const parts = components(c);
  if (parts.length !== 1) return [`${where}: ${parts.length} componentes opacos; el personaje debe ser una sola silueta`];
  const body = parts[0];
  const [b0, b1] = RULES.bodyBottom;
  if (body.bottom < b0 || body.bottom > b1) errors.push(`${where}: el cuerpo termina en y=${body.bottom}; debe terminar entre ${b0} y ${b1}`);
  const height = body.bottom - body.top + 1;
  const [h0, h1] = RULES.opaqueHeight;
  if (height < h0 || height > h1) errors.push(`${where}: altura opaca ${height}; debe estar entre ${h0} y ${h1}`);
  errors.push(...bandErrors(body, c.fw, RULES.head, volume ? RULES.head.volumeWidth : RULES.head.width, `${where} cabeza`));
  const side = SIDE_VIEWS.has(view);
  errors.push(...bandErrors(body, c.fw, RULES.shoulders, side ? RULES.shoulders.side : RULES.shoulders.front, `${where} ${side ? 'fondo del torso' : 'hombros'}`));
  if (dressed) {
    const f = feet(dressed);
    const center = (f.minX + f.maxX) / 2;
    if (!Number.isFinite(center) || Math.abs(center - RULES.axisX) > RULES.stanceTolerance) {
      errors.push(`${where}: centro del apoyo en x=${center}; debe quedar a ±${RULES.stanceTolerance} de ${RULES.axisX}`);
    }
  }
  return errors;
}

function bodyTop(image, col, row) {
  const parts = components(cell(image, col, row));
  return parts.length ? Math.min(...parts.map(p => p.top)) : null;
}

/** Respiración de 1 px en reposo, bob ≤ 1 px en caminata y apoyo doble en los contactos. */
export function checkAnimation(composed, name) {
  const errors = [];
  VIEW_ROWS.forEach((view, row) => {
    const idleTops = Array.from({ length: SHEETS.idle.frames }, (_, f) => bodyTop(composed.idle, f, row));
    const breath = Math.max(...idleTops) - Math.min(...idleTops);
    if (breath !== 1) errors.push(`${name} idle ${view}: respiración de ${breath} px (topes ${idleTops.join(',')}); debe ser 1`);
    const walkTops = Array.from({ length: SHEETS.walk.frames }, (_, f) => bodyTop(composed.walk, f, row));
    const bob = Math.max(...walkTops) - Math.min(...walkTops);
    if (bob > 1) errors.push(`${name} walk ${view}: bob de ${bob} px (topes ${walkTops.join(',')}); máximo 1`);
    if (SIDE_VIEWS.has(view) && composed.dressed) {
      for (const f of [0, 3]) {
        const ft = feet(composed.dressed.walk[view][f]);
        if (ft.o !== RULES.soleY || ft.O !== RULES.soleY) {
          errors.push(`${name} walk ${view} [${f}]: contacto con los pies en y=${ft.o} y y=${ft.O}; los dos deben pisar y=${RULES.soleY}`);
        }
      }
    }
  });
  return errors;
}

function isMirror(image, col, leftRow, rightRow, shift) {
  const l = cell(image, col, leftRow);
  const r = cell(image, col, rightRow);
  for (let y = 0; y < l.fh; y++) {
    for (let x = 0; x < l.fw; x++) {
      const mx = shift - x;
      const la = l.alpha(x, y);
      const ra = r.alpha(mx, y);
      if (la !== ra) return false;
      if (la && l.color(x, y) !== r.color(mx, y)) return false;
    }
  }
  return true;
}

/** La derecha no puede ser el espejo exacto de la izquierda (ni con eje 47−x ni 48−x). */
export function checkMirror(image, name, sheet) {
  const errors = [];
  const cols = image.width / FRAME.width;
  for (let col = 0; col < cols; col++) {
    for (const shift of [FRAME.width - 1, FRAME.width]) {
      if (isMirror(image, col, 1, 2, shift)) errors.push(`${name} ${sheet} [${col}]: la derecha es el espejo exacto de la izquierda`);
    }
  }
  return errors;
}

/** Resumen geométrico por vista (reposo, cuadro 0) para el manifiesto. */
export function geometry(composed) {
  const out = {};
  VIEW_ROWS.forEach((view, row) => {
    const c = cell(composed.idle, 0, row);
    const [body] = components(c);
    const widest = (from, to) => Math.max(...Array.from({ length: to - from + 1 }, (_, k) => centralWidth(body, c.fw, body.top + from + k)));
    out[view] = {
      opaqueHeight: body.bottom - body.top + 1,
      headWidth: widest(RULES.head.from, RULES.head.to),
      [SIDE_VIEWS.has(view) ? 'torsoDepth' : 'shoulderWidth']: widest(RULES.shoulders.from, RULES.shoulders.to),
    };
  });
  return out;
}

/** Todas las reglas de un personaje compuesto (con `keepDressed`). */
export function checkCharacter(composed, { name, palette, outline, volume = false }) {
  const errors = [];
  for (const sheet of ['idle', 'walk']) {
    const image = composed[sheet];
    const cols = SHEETS[sheet].frames;
    errors.push(...checkImageContract(image, { name: `${name} ${sheet}`, fw: FRAME.width, fh: FRAME.height, cols, rows: VIEW_ROWS.length, palette, outline }));
    VIEW_ROWS.forEach((view, row) => {
      for (let col = 0; col < cols; col++) {
        errors.push(...checkSpriteFrame(image, col, row, { name: `${name} ${sheet}`, view, dressed: composed.dressed?.[sheet][view][col], volume }));
      }
    });
    errors.push(...checkMirror(image, name, sheet));
  }
  errors.push(...checkAnimation(composed, name));
  for (const [state, image] of Object.entries(composed.portraits)) {
    errors.push(...checkImageContract(image, { name: `${name} retrato ${state}`, fw: 96, fh: 96, cols: 1, rows: 1, palette, outline }));
  }
  return errors;
}

const HEAD_LABELS = new Set(['H', 'e', 'E']);

/**
 * Cráneo compartido: toda complexión tiene exactamente la cabeza de A (H, e, E
 * en las mismas celdas de cada vista y cuadro), y de frente mide 17 px con
 * contorno. Así el pelo sirve en todas las complexiones.
 */
export function checkSharedHead(bundle) {
  const errors = [];
  const ref = bundle.complexions.a;
  if (!ref) return ['falta la complexión a (referencia de la cabeza)'];
  const labels = decodeRle(ref.down.idle[0].labels);
  let skull = 0;
  for (let y = 0; y < FRAME.height; y++) {
    let run = 0;
    for (let x = 0; x < FRAME.width; x++) run = labels[y * FRAME.width + x] === 'H' ? run + 1 : run;
    skull = Math.max(skull, run ? run + 2 : 0);
  }
  if (skull !== RULES.skullWidth) errors.push(`complexión a: cráneo de ${skull} px con contorno; debe medir ${RULES.skullWidth}`);
  for (const [id, views] of Object.entries(bundle.complexions)) {
    if (id === 'a') continue;
    for (const view of VIEW_ROWS) {
      for (const sheet of SHEET_IDS) {
        views[view][sheet].forEach((enc, f) => {
          const a = decodeRle(ref[view][sheet][f].labels);
          const b = decodeRle(enc.labels);
          for (let i = 0; i < a.length; i++) {
            if ((HEAD_LABELS.has(a[i]) || HEAD_LABELS.has(b[i])) && a[i] !== b[i]) {
              errors.push(`complexión ${id} ${view}/${sheet} [${f}]: la cabeza no coincide con la de A en (${i % FRAME.width},${Math.floor(i / FRAME.width)})`);
              break;
            }
          }
        });
      }
    }
  }
  return errors;
}
```

Crea `frontend/scripts/character-kit/muestras.mjs`:

```js
/**
 * Muestras: cada pieza del kit puesta sobre una receta base, en cada
 * complexión. El validador y las láminas las usan para probar piezas que
 * todavía no lleva ninguna receta fija («toda pieza funciona en A y en B»).
 */

/** Receta base de las muestras: la ropa de Valentina con colores neutros. */
export const SAMPLE_BASE = Object.freeze({
  pieces: { hair: 'bob-flequillo', face: 'sereno', top: 'chaqueta-capucha', bottom: 'jean', shoes: 'tenis', accessories: [] },
  colors: {
    skin: 'piel-3', hair: 'castano-oscuro', top: 'verde', accent: 'azul', inner: 'blanco',
    layer: 'blanco', bottom: 'marino', shoes: 'carbon', sole: 'gris-claro',
  },
});

/** Receta de muestra de una pieza (`kind:id`) en una complexión. */
export function sampleRecipe(pieceKey, complexion) {
  const [kind, id] = pieceKey.split(':');
  const recipe = structuredClone({ ...SAMPLE_BASE, complexion });
  recipe.id = `muestra-${kind}-${id}-${complexion}`;
  if (kind === 'accessory') recipe.pieces.accessories = [id];
  else recipe.pieces[kind] = id;
  if (kind === 'face') recipe.portraits = ['neutral', 'preocupada', 'triste', 'alegre'];
  return recipe;
}

/** Todas las muestras del paquete: piezas × complexiones, en orden estable. */
export function sampleRecipes(bundle) {
  const out = [];
  for (const key of Object.keys(bundle.pieces).sort()) {
    for (const complexion of Object.keys(bundle.complexions).sort()) out.push(sampleRecipe(key, complexion));
  }
  return out;
}
```

- [ ] **Step 4: Implementa el validador y la geometría del manifiesto**

Crea `frontend/scripts/character-kit/check.mjs`:

```js
#!/usr/bin/env node
/**
 * npm run kit:check — falla si el kit no está al día o rompe el contrato de
 * personajes (spec «personajes unificados» §6). Reúne todos los errores antes
 * de salir, para arreglarlos de una vez.
 *
 *   node scripts/character-kit/check.mjs [--out <carpeta>]
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { OUTLINE, composeCharacter } from '../../src/app/features/character/kit/kit-engine.ts';
import { KIT_ROOT } from './bundle.mjs';
import { DEFAULT_OUT, buildOutputs } from './build.mjs';
import { decodePng } from './kit-png.mjs';
import { checkCharacter, checkSharedHead } from './measure.mjs';
import { sampleRecipes } from './muestras.mjs';

export function loadPalette() {
  const palette = JSON.parse(readFileSync(path.join(KIT_ROOT, 'palette.v2.json'), 'utf8'));
  return new Set(palette.masterColors);
}

function luminance(hex) {
  const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Rampas y literales dentro de la paleta; cada rampa oscurece de la luz a la profunda. */
export function checkColors(bundle, palette) {
  const errors = [];
  for (const [id, ramp] of Object.entries(bundle.ramps)) {
    if (ramp.length !== 4) errors.push(`rampa ${id}: tiene ${ramp.length} colores; deben ser 4`);
    for (const hex of ramp) if (!palette.has(hex)) errors.push(`rampa ${id}: ${hex} no está en palette.v2.json`);
    for (let k = 1; k < ramp.length; k++) {
      if (luminance(ramp[k]) >= luminance(ramp[k - 1])) errors.push(`rampa ${id}: ${ramp[k]} no es más oscuro que ${ramp[k - 1]}`);
    }
  }
  for (const [key, hex] of Object.entries(bundle.literals)) {
    if (!palette.has(hex)) errors.push(`literal ${key}: ${hex} no está en palette.v2.json`);
  }
  for (const recipe of Object.values(bundle.recipes)) {
    for (const [key, hex] of Object.entries(recipe.literals ?? {})) {
      if (!palette.has(hex)) errors.push(`receta ${recipe.id}: literal ${key} ${hex} no está en palette.v2.json`);
    }
  }
  return errors;
}

/** Lo publicado en `outDir` es exactamente lo que genera el build (píxeles, no bytes). */
export function checkUpToDate(files, outDir) {
  const errors = [];
  const stale = rel => `${rel} está desactualizado: ejecuta npm run kit:build`;
  for (const [rel, expected] of files) {
    const file = path.join(outDir, rel);
    if (!existsSync(file)) { errors.push(`falta ${rel}: ejecuta npm run kit:build`); continue; }
    const actual = readFileSync(file);
    if (!rel.endsWith('.png')) { if (!actual.equals(expected)) errors.push(stale(rel)); continue; }
    const a = decodePng(actual);
    const b = decodePng(expected);
    if (a.width !== b.width || a.height !== b.height || !Buffer.from(a.rgba).equals(Buffer.from(b.rgba))) errors.push(stale(rel));
  }
  if (existsSync(outDir)) {
    for (const entry of readdirSync(outDir, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile()) continue;
      const rel = path.relative(outDir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
      if (!files.has(rel)) errors.push(`${rel} sobra: el build no lo genera (ejecuta npm run kit:build)`);
    }
  }
  return errors;
}

const isVolume = (bundle, recipe) => bundle.pieces[`hair:${recipe.pieces.hair}`]?.volume === true;

export function runCheck({ outDir = DEFAULT_OUT } = {}) {
  const errors = [];
  const warnings = [];
  const { bundle, files } = buildOutputs();
  const palette = loadPalette();
  errors.push(...checkUpToDate(files, outDir));
  errors.push(...checkColors(bundle, palette));
  errors.push(...checkSharedHead(bundle));
  for (const recipe of [...Object.values(bundle.recipes), ...sampleRecipes(bundle)]) {
    const composed = composeCharacter(bundle, recipe, { keepDressed: true });
    errors.push(...checkCharacter(composed, { name: recipe.id, palette, outline: OUTLINE, volume: isVolume(bundle, recipe) }));
  }
  return { errors, warnings };
}

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : DEFAULT_OUT;
  const { errors, warnings } = runCheck({ outDir });
  if (warnings.length) process.stdout.write(`${warnings.map(w => `aviso: ${w}`).join('\n')}\n`);
  if (errors.length) {
    process.stderr.write(`${errors.join('\n')}\n\nkit:check: ${errors.length} errores\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('kit:check: 0 errores\n');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
```

En `frontend/scripts/character-kit/build.mjs`, importa la geometría y regístrala en el manifiesto:

```js
import { encodePng } from './kit-png.mjs';
import { geometry } from './measure.mjs';
```

```js
      provenance: recipe.provenance,
      geometry: geometry(composed),
      files: {},
```

Añade a `frontend/package.json`:

```json
    "kit:check": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/character-kit/check.mjs && tsc -p tsconfig.kit.json",
```

- [ ] **Step 5: Ejecuta pruebas, build y validador**

Run: `npm run test:kit`
Expected: PASS (`ℹ pass 31`).

Run: `npm run kit:build && npm run kit:check`
Expected: el build reescribe `manifest.json` (ahora con `geometry`) y el validador imprime `kit:check: 0 errores`.

- [ ] **Step 6: CI y enmienda de la biblia**

En `../.github/workflows/ci.yml`, job `frontend`, después de `- run: npm run test:character-assets --prefix frontend`:

```yaml
      - run: npm run test:kit --prefix frontend
      - run: npm run kit:check --prefix frontend
```

En `../docs/visual/premium-visual-bible-v1.md` §1, después de la viñeta que empieza «La silueta adulta opaca mide», añade:

```markdown
- *Enmienda 2026-10 (spec «personajes unificados» §11):* en las vistas de perfil la banda de hombros mide el fondo del torso, 10–16 px; los peinados marcados como `volume` admiten una cabeza de 18–25 px; el cuerpo es una sola silueta (sin componentes secundarios); la derecha puede nacer del espejo de la izquierda con la luz recalculada y las piezas asimétricas dibujadas por lado, y el validador comprueba que no sea un espejo exacto. La autoridad de color de los personajes es `frontend/character-kit/palette.v2.json` y su compuerta es `npm run kit:check`.
```

- [ ] **Step 7: Commit**

```bash
git add scripts/character-kit package.json src/assets/characters/kit/manifest.json ../.github/workflows/ci.yml ../docs/visual/premium-visual-bible-v1.md
git commit -m "feat(personajes): validador kit:check con la geometría de la biblia, en CI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Láminas de revisión `npm run kit:laminas`

**Files:**
- Create: `frontend/scripts/character-kit/laminas.mjs`, `laminas.test.mjs`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: `buildBundle`, `compilePiece`, `FRONTEND_ROOT`; `sampleRecipe`; `encodePng`; motor.
- Produces: `LAMINAS_DIR` (`docs/visual/kit-personajes/`), `frameUri`, `characterSection`, `compactRow`, `pageHtml`, `buildLamina(args) → { name, html }`, `parseArgs(argv)`. CLI: `--receta <ids> | --piezas <claves> | --elenco | --maniqui`, `--escala k`, `--salida png`, `--titulo texto`. La lámina lleva en el subtítulo el HEAD (y si hay cambios sin commit en `character-kit`), porque la aprobación vale para ese HEAD.

- [ ] **Step 1: Escribe las pruebas (sin abrir el navegador)**

Crea `frontend/scripts/character-kit/laminas.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildLamina, parseArgs } from './laminas.mjs';

const images = html => (html.match(/<img /g) ?? []).length;

test('parseArgs entiende modos, escala y salida', () => {
  assert.deepEqual(parseArgs(['--piezas', 'hair:afro', '--escala', '3', '--salida', 'x.png']), { piezas: 'hair:afro', escala: 3, salida: 'x.png' });
  assert.deepEqual(parseArgs(['--elenco']), { elenco: true });
});

test('ficha de receta: 4 vistas, retratos, 16 cuadros de reposo y 24 de caminata', () => {
  const { name, html } = buildLamina({ receta: 'valentina' });
  assert.equal(name, 'receta-valentina');
  assert.equal(images(html), 4 + 1 + 16 + 24);
  assert.match(html, /image-rendering: pixelated/);
});

test('lámina de piezas: una fila por complexión con vistas, caminata de perfil y retrato', () => {
  const { name, html } = buildLamina({ piezas: 'hair:bob-flequillo' });
  assert.equal(name, 'piezas-hair-bob-flequillo');
  assert.equal(images(html), 4 + 6 + 1);
});

test('las escalas de las imágenes son enteras', () => {
  const { html } = buildLamina({ elenco: true });
  for (const [, w, h] of html.matchAll(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/g)) {
    assert.ok(Number.isInteger(Number(w)) && Number.isInteger(Number(h)), `${w}×${h}`);
  }
});

test('modo desconocido o pieza inexistente fallan con un mensaje claro', () => {
  assert.throws(() => buildLamina({}), /uso: laminas.mjs/);
  assert.throws(() => buildLamina({ piezas: 'hair:no-existe' }), /pieza desconocida: hair:no-existe/);
});
```

- [ ] **Step 2: Ejecuta y confirma que fallan**

Run: `npm run test:kit`
Expected: FAIL — `Cannot find module './laminas.mjs'`.

- [ ] **Step 3: Implementa**

Crea `frontend/scripts/character-kit/laminas.mjs`:

```js
#!/usr/bin/env node
/**
 * npm run kit:laminas — láminas de revisión a escala entera (vecino más
 * cercano) para las paradas de aprobación. Se arman como HTML y se capturan
 * con el Chromium de Playwright.
 *
 *   node scripts/character-kit/laminas.mjs --receta valentina[,andres]
 *   node scripts/character-kit/laminas.mjs --piezas hair:rapado,hair:afro
 *   node scripts/character-kit/laminas.mjs --elenco
 *   node scripts/character-kit/laminas.mjs --maniqui
 *   opciones: --escala <k> (4; 3 en --elenco) · --salida <png> · --titulo <texto>
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FRAME, PORTRAIT_FRAME, SHEETS, VIEW_ROWS, composeCharacter } from '../../src/app/features/character/kit/kit-engine.ts';
import { FRONTEND_ROOT, buildBundle, compilePiece } from './bundle.mjs';
import { encodePng } from './kit-png.mjs';
import { sampleRecipe } from './muestras.mjs';

const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
export const LAMINAS_DIR = path.join(REPO_ROOT, 'docs', 'visual', 'kit-personajes');
const VIEW_NAMES = { down: 'Frente', left: 'Izquierda', right: 'Derecha', up: 'Espalda' };

/** Recorta el cuadro (col, row) de una hoja y lo devuelve como data URI PNG. */
export function frameUri(image, col, row, fw = FRAME.width, fh = FRAME.height) {
  const out = new Uint8Array(fw * fh * 4);
  for (let y = 0; y < fh; y++) {
    const src = ((row * fh + y) * image.width + col * fw) * 4;
    out.set(image.rgba.subarray(src, src + fw * 4), y * fw * 4);
  }
  return `data:image/png;base64,${encodePng(fw, fh, out).toString('base64')}`;
}

const esc = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function img(uri, w, h, k, label = '') {
  return `<figure><img src="${uri}" width="${w * k}" height="${h * k}" alt="${esc(label)}">${label ? `<figcaption>${esc(label)}</figcaption>` : ''}</figure>`;
}

const sprite = (image, col, row, k, label) => img(frameUri(image, col, row), FRAME.width, FRAME.height, k, label);
const portrait = (image, k, label) => img(frameUri(image, 0, 0, PORTRAIT_FRAME.width, PORTRAIT_FRAME.height), PORTRAIT_FRAME.width, PORTRAIT_FRAME.height, k, label);

/** Ficha completa de un personaje: vistas, retratos, reposo y caminata cuadro a cuadro. */
export function characterSection(title, composed, k) {
  const views = VIEW_ROWS.map((v, row) => sprite(composed.idle, 0, row, k, VIEW_NAMES[v])).join('');
  const portraits = Object.entries(composed.portraits).map(([state, image]) => portrait(image, Math.max(1, Math.floor(k / 2)), state)).join('');
  const sheetRows = sheet => VIEW_ROWS.map((v, row) => `<div class="row"><span class="tag">${VIEW_NAMES[v]}</span>${
    Array.from({ length: SHEETS[sheet].frames }, (_, col) => sprite(composed[sheet], col, row, k, String(col))).join('')}</div>`).join('');
  return `<section><h2>${esc(title)}</h2>
    <h3>Vistas (reposo, cuadro 0)</h3><div class="row ground">${views}</div>
    <h3>Retratos 96×96</h3><div class="row">${portraits}</div>
    <h3>Reposo (4 cuadros, 4 fps)</h3>${sheetRows('idle')}
    <h3>Caminata (6 cuadros, 10 fps; contactos en 0 y 3)</h3>${sheetRows('walk')}</section>`;
}

/** Fila compacta: 4 vistas, la caminata de perfil y los retratos (piezas y elenco). */
export function compactRow(label, composed, k) {
  const views = VIEW_ROWS.map((v, row) => sprite(composed.idle, 0, row, k, VIEW_NAMES[v])).join('');
  const walk = Array.from({ length: SHEETS.walk.frames }, (_, col) => sprite(composed.walk, col, 1, k, `cam. ${col}`)).join('');
  const portraits = Object.entries(composed.portraits).map(([state, image]) => portrait(image, Math.max(1, Math.floor(k / 2)), state)).join('');
  return `<div class="row ground"><span class="tag">${esc(label)}</span>${views}<span class="gap"></span>${walk}<span class="gap"></span>${portraits}</div>`;
}

export function pageHtml(title, subtitle, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    body { margin: 0; padding: 28px 32px; background: #c9c7cf; color: #15131d; font: 15px/1.35 system-ui, sans-serif; }
    h1 { font-size: 26px; margin: 0 0 4px; } h2 { font-size: 20px; margin: 28px 0 6px; } h3 { font-size: 15px; margin: 14px 0 6px; }
    p.sub { margin: 0 0 12px; color: #494255; }
    .row { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; margin: 4px 0; }
    .ground figure { border-bottom: 2px solid #948a9b; }
    figure { margin: 0; display: flex; flex-direction: column; align-items: center; }
    figcaption { font-size: 12px; color: #494255; }
    img { image-rendering: pixelated; display: block; }
    .tag { width: 150px; font-weight: 600; align-self: center; } .gap { width: 18px; }
  </style></head><body><h1>${esc(title)}</h1><p class="sub">${esc(subtitle)}</p>${body}</body></html>`;
}

function headLabel() {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'frontend/character-kit'], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return `HEAD ${head}${dirty ? ' + cambios sin commit en character-kit' : ''}`;
  } catch {
    return 'HEAD desconocido';
  }
}

/** Piezas del maniquí desnudo: cada región con un material neutro y sin pelo ni rostro. */
function mannequinBundle() {
  const bundle = buildBundle();
  const extra = [
    { id: 'maniqui', kind: 'top', coverage: { T: 'top', a: 'top', b: 'top', A: 'top', B: 'top' }, views: {} },
    { id: 'maniqui', kind: 'bottom', coverage: { P: 'bottom', l: 'bottom', m: 'bottom', L: 'bottom', M: 'bottom' }, views: {} },
    { id: 'maniqui', kind: 'shoes', coverage: { o: 'shoes', O: 'shoes' }, views: {} },
    { id: 'ninguno', kind: 'hair', views: {} },
    { id: 'ninguno', kind: 'face', views: {} },
  ];
  for (const piece of extra) bundle.pieces[`${piece.kind}:${piece.id}`] = compilePiece(piece);
  return bundle;
}

export function buildLamina(args) {
  const k = args.escala ?? (args.elenco ? 3 : 4);
  const sub = mode => `${mode} · escala ×${k}, vecino más cercano · cuadro 48×72, pies en (24,68) · ${headLabel()}`;
  if (args.receta) {
    const bundle = buildBundle();
    const ids = args.receta.split(',');
    const body = ids.map(id => {
      const recipe = bundle.recipes[id];
      if (!recipe) throw new Error(`receta desconocida: ${id}`);
      return characterSection(recipe.displayName ?? id, composeCharacter(bundle, recipe), k);
    }).join('');
    return { name: `receta-${ids.join('-')}`, html: pageHtml(args.titulo ?? `Ficha: ${ids.join(', ')}`, sub('Recetas'), body) };
  }
  if (args.piezas) {
    const bundle = buildBundle();
    const keys = args.piezas.split(',');
    const body = keys.map(key => {
      if (!bundle.pieces[key]) throw new Error(`pieza desconocida: ${key}`);
      const rows = Object.keys(bundle.complexions).sort()
        .map(c => compactRow(`${key} · ${c.toUpperCase()}`, composeCharacter(bundle, sampleRecipe(key, c)), k)).join('');
      return `<section><h2>${esc(key)}</h2>${rows}</section>`;
    }).join('');
    return { name: `piezas-${keys.map(key => key.replace(':', '-')).join('_')}`, html: pageHtml(args.titulo ?? 'Piezas del kit', sub('Muestras en cada complexión'), body) };
  }
  if (args.elenco) {
    const bundle = buildBundle();
    const body = Object.values(bundle.recipes)
      .map(r => compactRow(`${r.displayName ?? r.id} (${r.kind ?? '—'})`, composeCharacter(bundle, r), k)).join('');
    return { name: 'elenco', html: pageHtml(args.titulo ?? 'Elenco del kit', sub(`${Object.keys(bundle.recipes).length} recetas`), body) };
  }
  if (args.maniqui) {
    const bundle = mannequinBundle();
    const colors = { skin: 'piel-1', top: 'gris-claro', bottom: 'gris-claro', shoes: 'carbon' };
    const body = Object.keys(bundle.complexions).sort().map(c => characterSection(`Complexión ${c.toUpperCase()}`, composeCharacter(bundle, {
      id: `maniqui-${c}`, complexion: c, colors,
      pieces: { hair: 'ninguno', face: 'ninguno', top: 'maniqui', bottom: 'maniqui', shoes: 'maniqui' },
    }), k)).join('');
    return { name: 'maniqui', html: pageHtml(args.titulo ?? 'Maniquíes del kit', sub('Maniquí con la luz del kit'), body) };
  }
  throw new Error('uso: laminas.mjs --receta <ids> | --piezas <claves> | --elenco | --maniqui [--escala k] [--salida png] [--titulo texto]');
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (['elenco', 'maniqui'].includes(key)) args[key] = true;
    else if (key === 'escala') args.escala = Number(argv[++i]);
    else args[key] = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { name, html } = buildLamina(args);
  const out = path.resolve(args.salida ?? path.join(LAMINAS_DIR, `${name}.png`));
  mkdirSync(path.dirname(out), { recursive: true });
  const { chromium } = createRequire(import.meta.url)('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 2200, height: 1000 } });
    await page.setContent(html);
    await page.screenshot({ path: out, fullPage: true });
  } finally {
    await browser.close();
  }
  process.stdout.write(`lámina ${out}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
```

Añade a `frontend/package.json`:

```json
    "kit:laminas": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/character-kit/laminas.mjs",
```

- [ ] **Step 4: Ejecuta pruebas y genera las láminas de base**

Run: `npm run test:kit`
Expected: PASS (`ℹ pass 36`).

Run: `npm run kit:laminas -- --maniqui && npm run kit:laminas -- --receta valentina`
Expected: `lámina …/docs/visual/kit-personajes/maniqui.png` y `…/receta-valentina.png`. Ábrelas con la herramienta de lectura de imágenes: el maniquí gris con luz arriba-izquierda en 4 vistas, reposo y caminata; la ficha de Valentina igual a la prueba aprobada.

- [ ] **Step 5: Commit**

```bash
git add scripts/character-kit package.json ../docs/visual/kit-personajes/maniqui.png ../docs/visual/kit-personajes/receta-valentina.png
git commit -m "feat(personajes): láminas de revisión del kit con npm run kit:laminas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Retoques a mano como capa del kit

**Files:**
- Create: `frontend/scripts/character-kit/retouch-lib.mjs`, `retoque.mjs`, `retouch.test.mjs`
- Modify: `frontend/scripts/character-kit/build.mjs`, `check.mjs`
- Modify: `frontend/package.json`, `.gitignore`
- Modify: `frontend/character-kit/README.md`

**Interfaces:**
- Consumes: `publishedImages`, `sha256`, `buildOutputs` (tarea 2); `runCheck` (tarea 3).
- Produces: `retouch-lib.mjs` → `RETOUCH_ROOT`, `ERASE_HEX` (`#ff00ff`), `retouchPaths(id, hoja, root?)`, `loadRetouch(id, hoja, root?) → { layer, baseSha256 } | null`, `applyRetouch(image, layer)`, `diffRetouch(base, edited)`, `checkRetouchLayer(layer, { name, palette })`. `build.mjs` → `finishCharacter(id, composed, retouchRoot?) → { composed, images, applied }` y `buildOutputs({ retouchRoot })`; el manifiesto gana `retouched: string[]`. `check.mjs` → `runCheck({ outDir, retouchRoot })`. CLI `npm run kit:retoque -- <id> <hoja> [--guardar | --quitar]`.

- [ ] **Step 1: Escribe las pruebas**

Crea `frontend/scripts/character-kit/retouch.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildOutputs, writeOutputs } from './build.mjs';
import { loadPalette, runCheck } from './check.mjs';
import { readPng, writePng } from './kit-png.mjs';
import { applyRetouch, checkRetouchLayer, diffRetouch } from './retouch-lib.mjs';
import { retouchCommand } from './retoque.mjs';

const image = (w, h, pixels) => {
  const rgba = new Uint8Array(w * h * 4);
  pixels.forEach(([x, y, c]) => rgba.set(c, (y * w + x) * 4));
  return { width: w, height: h, rgba };
};
const VERDE = [0x5b, 0x8d, 0x70, 255];
const NEGRO = [0x15, 0x13, 0x1d, 255];

test('applyRetouch pinta lo opaco y el magenta borra', () => {
  const base = image(2, 1, [[0, 0, VERDE], [1, 0, VERDE]]);
  const layer = image(2, 1, [[0, 0, NEGRO], [1, 0, [255, 0, 255, 255]]]);
  const out = applyRetouch(base, layer);
  assert.deepEqual([...out.rgba], [...NEGRO, 0, 0, 0, 0]);
  assert.deepEqual([...base.rgba], [...VERDE, ...VERDE], 'no muta la base');
});

test('diffRetouch guarda solo lo que cambió y aplicarlo reproduce la edición', () => {
  const base = image(3, 1, [[0, 0, VERDE], [1, 0, VERDE]]);
  const edited = image(3, 1, [[0, 0, VERDE], [2, 0, NEGRO]]);
  const layer = diffRetouch(base, edited);
  assert.deepEqual([...layer.rgba.slice(0, 4)], [0, 0, 0, 0]);
  assert.deepEqual([...layer.rgba.slice(4, 8)], [255, 0, 255, 255]);
  assert.deepEqual([...applyRetouch(base, layer).rgba], [...edited.rgba]);
});

test('la capa solo admite la paleta, el magenta y alfa binario', () => {
  const layer = image(3, 1, [[0, 0, [1, 2, 3, 255]], [1, 0, [0x5b, 0x8d, 0x70, 128]], [2, 0, [255, 0, 255, 255]]]);
  const errors = checkRetouchLayer(layer, { name: 'r', palette: loadPalette() });
  assert.deepEqual(errors, ['r: color #010203 fuera de la paleta en (0,0)', 'r: alfa 128 en (1,0); solo 0 o 255']);
});

test('flujo completo: exportar, editar, guardar, construir y validar', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'retouch-'));
  const out = mkdtempSync(path.join(tmpdir(), 'kit-out-'));
  try {
    retouchCommand(['valentina', 'idle'], root);
    const editFile = path.join(root, 'valentina', 'idle.edit.png');
    const edit = readPng(editFile);
    // Oscurece un píxel del torso (24,30) del cuadro 0 con un color de la paleta.
    edit.rgba.set([0x3d, 0x6a, 0x55, 255], (30 * edit.width + 24) * 4);
    writePng(editFile, edit.width, edit.height, edit.rgba);
    assert.match(retouchCommand(['valentina', 'idle', '--guardar'], root), /1 píxeles/);
    const { files, manifest } = buildOutputs({ retouchRoot: root });
    assert.deepEqual(manifest.characters.valentina.retouched, ['idle']);
    writeOutputs(files, out);
    assert.deepEqual(runCheck({ outDir: out, retouchRoot: root }), { errors: [], warnings: [] });
    // Si la base cambia debajo del retoque, el validador avisa (no falla).
    writeFileSync(path.join(root, 'valentina', 'idle.json'), '{ "baseSha256": "otra" }\n');
    const { errors, warnings } = runCheck({ outDir: out, retouchRoot: root });
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, ['retoque valentina/idle: la base cambió debajo del retoque; revisa la lámina y vuelve a guardarlo con npm run kit:retoque']);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Ejecuta y confirma que fallan**

Run: `npm run test:kit`
Expected: FAIL — `Cannot find module './retouch-lib.mjs'`.

- [ ] **Step 3: Implementa la capa y la CLI**

Crea `frontend/scripts/character-kit/retouch-lib.mjs`:

```js
/**
 * Retoques a mano (spec §4.6): una capa PNG por hoja de un personaje fijo,
 * transparente salvo los píxeles retocados. El build compone la hoja y pega
 * encima los píxeles opacos de la capa; un píxel magenta `#ff00ff` borra.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { KIT_ROOT } from './bundle.mjs';
import { decodePng } from './kit-png.mjs';

export const RETOUCH_ROOT = path.join(KIT_ROOT, 'retouch');
export const ERASE_HEX = '#ff00ff';
const ERASE = [255, 0, 255];

export function retouchPaths(id, sheet, root = RETOUCH_ROOT) {
  const dir = path.join(root, id);
  return {
    dir,
    layer: path.join(dir, `${sheet}.png`),
    meta: path.join(dir, `${sheet}.json`),
    edit: path.join(dir, `${sheet}.edit.png`),
  };
}

/** Capa guardada de una hoja, o null. `baseSha256` es la base sobre la que se retocó. */
export function loadRetouch(id, sheet, root = RETOUCH_ROOT) {
  const paths = retouchPaths(id, sheet, root);
  if (!existsSync(paths.layer)) return null;
  const meta = existsSync(paths.meta) ? JSON.parse(readFileSync(paths.meta, 'utf8')) : {};
  return { layer: decodePng(readFileSync(paths.layer)), baseSha256: meta.baseSha256 ?? null };
}

const isErase = (rgba, i) => rgba[i] === ERASE[0] && rgba[i + 1] === ERASE[1] && rgba[i + 2] === ERASE[2];

/** Hoja + capa → hoja retocada (copia). */
export function applyRetouch(image, layer) {
  if (layer.width !== image.width || layer.height !== image.height) {
    throw new Error(`retoque de ${layer.width}×${layer.height} sobre una hoja de ${image.width}×${image.height}`);
  }
  const rgba = image.rgba.slice();
  for (let i = 0; i < rgba.length; i += 4) {
    if (layer.rgba[i + 3] !== 255) continue;
    if (isErase(layer.rgba, i)) rgba.set([0, 0, 0, 0], i);
    else rgba.set(layer.rgba.subarray(i, i + 4), i);
  }
  return { width: image.width, height: image.height, rgba };
}

/** Diferencia entre la base y la hoja editada → capa de retoque. */
export function diffRetouch(base, edited) {
  if (base.width !== edited.width || base.height !== edited.height) throw new Error('la hoja editada cambió de tamaño');
  const rgba = new Uint8Array(base.rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = base.rgba.subarray(i, i + 4);
    const b = edited.rgba.subarray(i, i + 4);
    if (a[3] === 0 && b[3] === 0) continue;
    if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]) continue;
    rgba.set(b[3] === 0 ? [...ERASE, 255] : b, i);
  }
  return { width: base.width, height: base.height, rgba };
}

/** Paleta y alfa binario de la capa. */
export function checkRetouchLayer(layer, { name, palette }) {
  const errors = [];
  for (let i = 0; i < layer.rgba.length; i += 4) {
    const a = layer.rgba[i + 3];
    const x = (i / 4) % layer.width;
    const y = Math.floor(i / 4 / layer.width);
    if (a !== 0 && a !== 255) { errors.push(`${name}: alfa ${a} en (${x},${y}); solo 0 o 255`); continue; }
    if (a === 0) continue;
    const hex = `#${[0, 1, 2].map(k => layer.rgba[i + k].toString(16).padStart(2, '0')).join('')}`;
    if (hex !== ERASE_HEX && !palette.has(hex)) errors.push(`${name}: color ${hex} fuera de la paleta en (${x},${y})`);
  }
  return errors;
}
```

Crea `frontend/scripts/character-kit/retoque.mjs`:

```js
#!/usr/bin/env node
/**
 * npm run kit:retoque — flujo de retoques a mano con LibreSprite o Pixelorama.
 *
 *   node scripts/character-kit/retoque.mjs <id> <hoja>            exporta <hoja>.edit.png para editar
 *   node scripts/character-kit/retoque.mjs <id> <hoja> --guardar  guarda solo los píxeles que cambiaron
 *   node scripts/character-kit/retoque.mjs <id> <hoja> --quitar   borra el retoque de esa hoja
 *
 * <hoja> es idle, walk o portrait-<estado>. El archivo de edición vive en
 * character-kit/retouch/<id>/ y git lo ignora.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeCharacter } from '../../src/app/features/character/kit/kit-engine.ts';
import { buildBundle } from './bundle.mjs';
import { publishedImages, sha256 } from './build.mjs';
import { readPng, writePng } from './kit-png.mjs';
import { RETOUCH_ROOT, applyRetouch, diffRetouch, loadRetouch, retouchPaths } from './retouch-lib.mjs';

export function retouchCommand([id, sheet, flag], root = RETOUCH_ROOT) {
  if (!id || !sheet) throw new Error('uso: retoque.mjs <id> <hoja> [--guardar | --quitar]');
  const bundle = buildBundle();
  const recipe = bundle.recipes[id];
  if (!recipe) throw new Error(`receta desconocida: ${id}`);
  const base = publishedImages(composeCharacter(bundle, recipe))[sheet];
  if (!base) throw new Error(`hoja desconocida: ${sheet} (idle, walk o portrait-<estado> de la receta)`);
  const paths = retouchPaths(id, sheet, root);
  if (flag === '--quitar') {
    rmSync(paths.layer, { force: true });
    rmSync(paths.meta, { force: true });
    return `retoque de ${id}/${sheet} borrado`;
  }
  if (flag === '--guardar') {
    if (!existsSync(paths.edit)) throw new Error(`no existe ${paths.edit}: expórtalo primero sin --guardar`);
    const layer = diffRetouch(base, readPng(paths.edit));
    const changed = layer.rgba.filter((_, i) => i % 4 === 3 && layer.rgba[i] === 255).length;
    mkdirSync(paths.dir, { recursive: true });
    writePng(paths.layer, layer.width, layer.height, layer.rgba);
    writeFileSync(paths.meta, `${JSON.stringify({ baseSha256: sha256(base.rgba) }, null, 2)}\n`);
    rmSync(paths.edit);
    return `retoque de ${id}/${sheet} guardado: ${changed} píxeles. Ejecuta npm run kit:build`;
  }
  const current = loadRetouch(id, sheet, root);
  const edit = current ? applyRetouch(base, current.layer) : base;
  writePng(paths.edit, edit.width, edit.height, edit.rgba);
  return `edita ${paths.edit} y guarda con: npm run kit:retoque -- ${id} ${sheet} --guardar`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${retouchCommand(process.argv.slice(2))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 4: Aplica los retoques en el build y valídalos**

En `frontend/scripts/character-kit/build.mjs`:

1. Import:

```js
import { geometry } from './measure.mjs';
import { RETOUCH_ROOT, applyRetouch, loadRetouch } from './retouch-lib.mjs';
```

2. Inserta `finishCharacter` justo antes del comentario de `buildOutputs` y cambia su firma:

```js
/**
 * Personaje fijo listo para publicar: sus imágenes con los retoques aplicados.
 * `applied` lista cada retoque con la base sobre la que se pegó (para el validador).
 */
export function finishCharacter(id, composed, retouchRoot = RETOUCH_ROOT) {
  const images = publishedImages(composed);
  const applied = [];
  for (const [name, base] of Object.entries(images)) {
    const retouch = loadRetouch(id, name, retouchRoot);
    if (!retouch) continue;
    images[name] = applyRetouch(base, retouch.layer);
    applied.push({ name, base, ...retouch });
  }
  const portraits = Object.fromEntries(Object.keys(composed.portraits).map(state => [state, images[`portrait-${state}`]]));
  return { composed: { ...composed, idle: images.idle, walk: images.walk, portraits }, images, applied };
}

/**
 * Todo lo que el build escribe, en memoria. `files` mapea la ruta relativa a
 * `--out` con sus bytes; el validador lo reutiliza para comparar con el disco.
 */
export function buildOutputs({ retouchRoot = RETOUCH_ROOT } = {}) {
```

3. Dentro del bucle de recetas, compón con retoques y registra cuáles se aplicaron:

```js
    const { composed, images, applied } = finishCharacter(id, composeCharacter(bundle, recipe), retouchRoot);
    const entry = {
      displayName: recipe.displayName,
      kind: recipe.kind,
      complexion: recipe.complexion,
      provenance: recipe.provenance,
      geometry: geometry(composed),
      retouched: applied.map(r => r.name),
      files: {},
    };
    for (const [name, image] of Object.entries(images)) {
```

En `frontend/scripts/character-kit/check.mjs`:

```js
import { DEFAULT_OUT, buildOutputs, finishCharacter, sha256 } from './build.mjs';
import { decodePng } from './kit-png.mjs';
import { checkCharacter, checkSharedHead } from './measure.mjs';
import { RETOUCH_ROOT, checkRetouchLayer } from './retouch-lib.mjs';
```

y reemplaza la cabecera de `runCheck` y el bucle de personajes:

```js
export function runCheck({ outDir = DEFAULT_OUT, retouchRoot = RETOUCH_ROOT } = {}) {
  const errors = [];
  const warnings = [];
  const { bundle, files } = buildOutputs({ retouchRoot });
```

```js
  for (const recipe of Object.values(bundle.recipes)) {
    const { composed, applied } = finishCharacter(recipe.id, composeCharacter(bundle, recipe, { keepDressed: true }), retouchRoot);
    for (const retouch of applied) {
      const name = `retoque ${recipe.id}/${retouch.name}`;
      errors.push(...checkRetouchLayer(retouch.layer, { name, palette }));
      if (retouch.baseSha256 !== sha256(retouch.base.rgba)) {
        warnings.push(`${name}: la base cambió debajo del retoque; revisa la lámina y vuelve a guardarlo con npm run kit:retoque`);
      }
    }
    errors.push(...checkCharacter(composed, { name: recipe.id, palette, outline: OUTLINE, volume: isVolume(bundle, recipe) }));
  }
  for (const recipe of sampleRecipes(bundle)) {
    const composed = composeCharacter(bundle, recipe, { keepDressed: true });
    errors.push(...checkCharacter(composed, { name: recipe.id, palette, outline: OUTLINE, volume: isVolume(bundle, recipe) }));
  }
  return { errors, warnings };
}
```

Añade a `frontend/package.json`:

```json
    "kit:retoque": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/character-kit/retoque.mjs",
```

Añade al final de `../.gitignore` (el de la raíz del repo):

```
# Hojas exportadas para retocar a mano (kit de personajes)
frontend/character-kit/retouch/**/*.edit.png
```

- [ ] **Step 5: Ejecuta pruebas, build y validador**

Run: `npm run test:kit`
Expected: PASS (`ℹ pass 40`).

Run: `npm run kit:build && npm run kit:check`
Expected: `kit:check: 0 errores` (el manifiesto gana `"retouched": []`).

- [ ] **Step 6: README del kit**

Reemplaza `frontend/character-kit/README.md`:

```markdown
# Kit de personajes SIEP

Todos los personajes del juego salen de este kit: maniquí etiquetado + piezas +
recetas + motor determinista. Spec: `docs/superpowers/specs/2026-10-02-personajes-unificados-design.md`.
Esta carpeta es autoría y no se publica; la salida vive en `src/assets/characters/kit/`.

| Qué | Dónde |
|---|---|
| Maniquíes (grillas por vista + rig por cuadro) | `mannequins/complexion-*.mjs`, registro en `mannequins/index.mjs` |
| Bustos de retrato 96×96 | `busts/bust-*.mjs`, registro en `busts/index.mjs` |
| Piezas (pelo, rostro, arriba, capa, abajo, calzado, accesorios) | `pieces/<tipo>/<id>.mjs`, registro en `pieces/index.mjs` |
| Paleta maestra y rampas con nombre | `palette.v2.json`, `ramps.mjs` |
| Recetas (un personaje fijo por archivo) | `recipes/<id>.json` (`_*.json` = borrador, no se publica) |
| Retoques a mano | `retouch/<id>/<hoja>.png` + `.json` |

El motor es `src/app/features/character/kit/kit-engine.ts` (sin imports: lo usan el
navegador y Node). Los scripts viven en `scripts/character-kit/`.

## Comandos (desde `frontend/`)

| Comando | Para qué |
|---|---|
| `npm run kit:build` | Escribe `kit.json`, las hojas y retratos de cada receta y `manifest.json`. |
| `npm run kit:check` | Falla si la salida no está al día o rompe el contrato (geometría, paleta, animación, cobertura). Corre en CI. |
| `npm run test:kit` | Pruebas del motor y los scripts. |
| `npm run kit:laminas -- --receta <ids> \| --piezas <claves> \| --elenco \| --maniqui` | Láminas ×4 para revisar y aprobar. |
| `npm run kit:retoque -- <id> <hoja> [--guardar \| --quitar]` | Retoque a mano con LibreSprite o Pixelorama. |

## Retocar a mano

1. `npm run kit:retoque -- valentina idle` exporta `retouch/valentina/idle.edit.png`.
2. Edítalo (solo colores de `palette.v2.json`; magenta `#ff00ff` borra un píxel) y guárdalo.
3. `npm run kit:retoque -- valentina idle --guardar` deja en la capa solo lo que cambió.
4. `npm run kit:build && npm run kit:check`.

Una corrección que deba valer para todos los personajes se hace en la pieza (texto), no en un retoque.
```

- [ ] **Step 7: Commit**

```bash
git add scripts/character-kit package.json ../.gitignore character-kit/README.md src/assets/characters/kit/manifest.json
git commit -m "feat(personajes): retoques a mano como capa del kit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Guía de autoría de piezas (rige F2 y F3)

Antes de dibujar, lee las piezas de la prueba: `pieces/hair/bob-flequillo.mjs` (cover anclado a la cabeza, vistas por lado), `pieces/top/chaqueta-capucha.mjs` (cobertura por región + superposiciones `paint` ancladas al torso y a la pelvis), `pieces/face/sereno.mjs` (paint sobre `H`, perfil derecho por espejo) y sus `.portrait.mjs` (formas grandes con `raster.mjs`).

**Coordenadas.** Absolutas en el cuadro de reposo (idle 0) de la complexión A. El motor desplaza cada superposición según su ancla: `H` con `upper` (bob + respiración); `T` con `upper` por encima de la cintura (y = 33) y con `bob` desde ella; `P` y cualquier otra con `bob`.

**Referencias de A en reposo** (ver `mannequins/complexion-a.mjs`):

| Parte | Frente/espalda (`down`/`up`) | Perfil (`left`) |
|---|---|---|
| Tope del pelo de la prueba | y = 5 (contorno en 4) | y = 5 |
| Cabeza `H` | x 17-31, y 6-20; orejas `e`/`E` en x 16 y 32, y 12-14 | x 16-31, y 6-20; oreja `e` x 25-26, y 12-15 |
| Cuello `N` | x 22-26, y 21-22 | x 23-28, y 19-22 |
| Torso `T` | x 17-31, y 23-37; cintura en y = 33 | x 18-29, y 23-37 |
| Pelvis `P` | x 17-31, y 38-43 | x 20-30, y 38-43 |
| Pies `o`/`O` | suela en y = 66 | suela en y = 66 |

**Leyenda.** Cada símbolo de la grilla → `{ mat?, tone?, literal? }`. `tone`: 0 luz, 1 base, 2 sombra, 3 profunda; sin `tone`, la luz decide. `literal`: una clave de `LITERAL_DEFAULTS` (`ramps.mjs`) o un `#rrggbb` de la paleta. Si una pieza necesita un literal nuevo (gafas, gafete), añádelo a `LITERAL_DEFAULTS` con un color de `palette.v2.json`.

**Modos.** `paint` recolorea celdas del ancla (o de `parts`); `repaint` igual, pero borra los tonos fijos y literales de piezas anteriores (capas sobre la ropa); `cover` crea o tapa celdas (pelo, faldas, bultos) con `part` = `piece.part` o el ancla. Filtros opcionales por superposición: `complexions: ['b']`, `sheets: ['walk']`, `frames: [0, 3]`.

**Ranuras por tipo.** `hair` → `hair`. `face` → `skin`, `hair` (cejas) y literales. `top` → `top`, `accent`, `inner`. `layer` → `layer` (y `top`/`inner` en las aberturas). `bottom` → `bottom`. `shoes` → `shoes`, `sole`. `accessory` → literales o ranuras existentes. El orden de aplicación es `bottom, shoes, top, layer, face, accessory, hair`.

**Reglas.**
1. Toda pieza funciona en A y en B. Las superposiciones del torso o la pelvis que no encajen en las dos se dibujan por complexión (`complexions`).
2. Las piezas asimétricas (raya, trenza a un lado, gafete) declaran `asymmetric: true` y dibujan `right`; las simétricas no la dibujan (sale del espejo de `left` con la luz recalculada).
3. Solo los peinados que lo necesiten llevan `volume: true` (el afro seguro); el validador les admite una cabeza de hasta 25 px.
4. El pelo que cae sobre hombros o espalda es una superposición `cover` anclada a `T` (sigue al torso), además de la anclada a `H`.
5. Cada pieza trae su versión de retrato 96×96 (`portrait`, sobre el busto de cada complexión), con la misma forma que en el sprite.

**Ciclo por pieza.** Escribe la pieza → regístrala en `pieces/index.mjs` → `npm run kit:check` (las muestras la prueban en A y B) → lámina → autorrevisión → commit.

**Autorrevisión de cada lámina** (léela con la herramienta de imágenes, a ×4):
- **Silueta sin color:** la pieza cambia la silueta de forma reconocible.
- **Mismo lenguaje que Valentina:** contorno solo por fuera, detalles con tonos de la rampa, mechones y pliegues de 1 px, sin sombreado almohadillado ni colores sueltos.
- **Perfiles de verdad:** en `left`/`right` la pieza tiene volumen de perfil, no es la de frente aplastada.
- **Caminata:** en los 6 cuadros de perfil la pieza acompaña al cuerpo sin cortes, huecos ni partes flotando.
- **A y B:** encaja en las dos complexiones, sin columnas de otra prenda asomando.
- **Retrato:** la versión 96×96 es la misma pieza (forma, raya, cuello) que el sprite.

Si algo falla, corrige la pieza y vuelve a generar la lámina antes de la parada.

---

# Fase F2 — Complexión B y catálogo de piezas

### Task 6: Complexión B y busto B — PARADA 1

**Files:**
- Create: `frontend/character-kit/mannequins/complexion-b.mjs`, `frontend/character-kit/busts/bust-b.mjs`
- Modify: `frontend/character-kit/mannequins/index.mjs`, `frontend/character-kit/busts/index.mjs`
- Modify: `frontend/character-kit/pieces/top/chaqueta-capucha.mjs` (+ `.portrait.mjs`) y demás piezas de la prueba que no encajen en B
- Modify: `frontend/scripts/character-kit/kit.test.mjs`
- Generated: `docs/visual/kit-personajes/f2-1-complexiones.png`, `docs/visual/kit-personajes/f2-1-piezas-prueba-en-b.png`

**Interfaces:**
- Consumes: `COMPLEXION_A` (sus `views.*.head/neck/ear` y `sheets`), `BUST_A` y `headHalfWidth` de `bust-a.mjs`.
- Produces: `COMPLEXION_B` (misma forma que `COMPLEXION_A`, `id: 'b'`) y `BUST_B` (misma forma que `BUST_A`); `COMPLEXIONS = { a, b }`, `BUSTS = { a, b }`.

**Qué es B** (spec §4.2): misma altura (64 px) y **misma cabeza** que A (reutiliza `COMPLEXION_A.views.<vista>.head`, `.neck`, `.ear` y `COMPLEXION_A.sheets`, así respiración y bob son idénticos); hombros de 25-27 px con contorno; torso recto sin cintura; manos y pies 1 px más grandes; perfil 1 px más profundo. Ninguna complexión es «de mujer» o «de hombre». El busto B tiene la cabeza de A (`headHalfWidth`) y hombros más anchos.

- [ ] **Step 1: Escribe las pruebas de B**

Añade al final de `frontend/scripts/character-kit/kit.test.mjs` (y a sus imports `import { geometry } from './measure.mjs';`, `import { sampleRecipe } from './muestras.mjs';` y `decodeRle` del motor):

```js
test('la complexión B: misma altura y cabeza que A, hombros 25-27, perfil 1 px más profundo', () => {
  const bundle = buildBundle();
  const geo = c => geometry(composeCharacter(bundle, sampleRecipe('top:chaqueta-capucha', c)));
  const a = geo('a');
  const b = geo('b');
  for (const view of ['down', 'left', 'right', 'up']) assert.equal(b[view].opaqueHeight, a[view].opaqueHeight, view);
  for (const view of ['down', 'up']) assert.ok(b[view].shoulderWidth >= 25 && b[view].shoulderWidth <= 27, `${view}: ${b[view].shoulderWidth}`);
  for (const view of ['left', 'right']) assert.equal(b[view].torsoDepth, a[view].torsoDepth + 1, view);
});

test('el busto B tiene exactamente la cabeza del busto A', () => {
  const bundle = buildBundle();
  const head = new Set(['H', 'e', 'E']);
  const a = decodeRle(bundle.busts.a.grid);
  const b = decodeRle(bundle.busts.b.grid);
  for (let i = 0; i < a.length; i++) {
    if (head.has(a[i]) || head.has(b[i])) assert.equal(b[i], a[i], `celda ${i}`);
  }
});
```

- [ ] **Step 2: Ejecuta y confirma que fallan**

Run: `npm run test:kit`
Expected: FAIL en las dos pruebas nuevas (`Cannot read properties of undefined` sobre `bundle.busts.b` o complexión desconocida `b`).

- [ ] **Step 3: Dibuja el maniquí y el busto B**

Crea `complexion-b.mjs` con la misma estructura que `complexion-a.mjs`: `FRAME` y cabeza, cuello y oreja tomados de A; torso de frente de 17 px de ancho sin cintura (los brazos quedan a 1 px más afuera para que los hombros midan 25-27 con contorno); torso de perfil 13 px de fondo; pelvis acorde; `HAND_*` de 4 px; pies 1 px más largos; `widths` de brazo y pierna 1 px más anchos donde haga falta. Las fases de pierna y brazo pueden ser las de A desplazadas; los contactos 0 y 3 deben seguir pisando y = 66 en perfil. Crea `bust-b.mjs` importando `headHalfWidth` de `bust-a.mjs` y con `SHOULDER_LEFT` más ancho. Regístralos en los dos `index.mjs`.

- [ ] **Step 4: Adapta las piezas de la prueba a B**

Ejecuta `npm run kit:check`. Las muestras `muestra-*-b` señalarán lo que no encaja; además, genera la lámina y busca columnas de otra prenda (el bajo de la chaqueta mide 15 px y la pelvis de B, 17). Dibuja las superposiciones de B con `complexions: ['b']` (y marca las de A con `complexions: ['a']`) en `chaqueta-capucha` y en su retrato sobre el busto B.

Run: `npm run test:kit && npm run kit:build && npm run kit:check`
Expected: todas las pruebas PASS y `kit:check: 0 errores`. Valentina (A) conserva sus hashes dorados.

- [ ] **Step 5: Láminas**

```bash
npm run kit:laminas -- --maniqui --salida ../docs/visual/kit-personajes/f2-1-complexiones.png --titulo "Complexiones A y B"
npm run kit:laminas -- --piezas hair:bob-flequillo,face:sereno,top:chaqueta-capucha,bottom:jean,shoes:tenis --salida ../docs/visual/kit-personajes/f2-1-piezas-prueba-en-b.png --titulo "Piezas de la prueba en A y B"
```

Haz la autorrevisión de la guía sobre las dos láminas y corrige lo que falle.

- [ ] **Step 6: Commit**

```bash
git add character-kit scripts/character-kit/kit.test.mjs src/assets/characters/kit ../docs/visual/kit-personajes/f2-1-*.png
git commit -m "feat(personajes): complexión B y busto B con la cabeza de A

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: PARADA 1 — aprobación de las complexiones**

Muestra al usuario las dos láminas (enlaces a `docs/visual/kit-personajes/f2-1-*.png`) y el HEAD. Pregunta si aprueba la complexión B. Si pide cambios, aplícalos, regenera las láminas, vuelve a commitear y vuelve a preguntar. No sigas sin un «sí».

---

### Task 7: Peinados cortos y de volumen

**Files:**
- Create: `frontend/character-kit/pieces/hair/{rapado,corto-liso,corto-rizado,afro}.mjs` (+ `.portrait.mjs` si el retrato es largo)
- Modify: `frontend/character-kit/pieces/index.mjs`
- Generated: `docs/visual/kit-personajes/f2-2-peinados-cortos.png`

| Pieza | Rasgos | Referencias de identidad | Notas |
|---|---|---|---|
| `hair:rapado` | pelo al ras que deja ver la forma del cráneo; línea de nacimiento marcada | `src/assets/characters/cast/samuel.png` | puede ir solo en `paint` sobre `H` (sin cover) |
| `hair:corto-liso` | corto con volumen arriba, patillas, nuca limpia | `cast/andres.png`, `cast/david.png`, `v1/andres/base/idle.png` | lo llevan también jorge y supervisor-clinico (canoso) |
| `hair:corto-rizado` | rizo corto: borde de la silueta irregular, puntos de luz sueltos | `cast/felipe.png`, `cast/mateo.png`, `cast/luisa.png` | debe leerse distinto del liso sin color |
| `hair:afro` | volumen redondo alrededor de la cabeza | — (nuevo; lo ofrece el editor) | `volume: true`; cabeza con pelo de hasta 25 px |

- [ ] **Step 1:** Dibuja las cuatro piezas siguiendo la guía de autoría (4 vistas; `right` propia solo si es asimétrica; retrato).
- [ ] **Step 2:** Regístralas en `pieces/index.mjs` (bloque `// pelo`, orden alfabético).
- [ ] **Step 3:** Run: `npm run test:kit && npm run kit:build && npm run kit:check` — Expected: PASS y `kit:check: 0 errores`.
- [ ] **Step 4:** Lámina: `npm run kit:laminas -- --piezas hair:rapado,hair:corto-liso,hair:corto-rizado,hair:afro --salida ../docs/visual/kit-personajes/f2-2-peinados-cortos.png --titulo "Peinados cortos y de volumen"`. Haz la autorrevisión y corrige.
- [ ] **Step 5: Commit**

```bash
git add character-kit src/assets/characters/kit ../docs/visual/kit-personajes/f2-2-peinados-cortos.png
git commit -m "feat(personajes): peinados rapado, corto liso, corto rizado y afro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Peinados largos y recogidos — PARADA 2

**Files:**
- Create: `frontend/character-kit/pieces/hair/{media-melena,largo-suelto,cola-caballo,mono,trenza}.mjs` (+ `.portrait.mjs`)
- Modify: `frontend/character-kit/pieces/index.mjs`
- Generated: `docs/visual/kit-personajes/f2-3-peinados-largos.png`, `docs/visual/kit-personajes/f2-3-peinados-todos.png`

| Pieza | Rasgos | Referencias | Notas |
|---|---|---|---|
| `hair:media-melena` | a los hombros, sin flequillo, raya al medio | `cast/npc_madre-vbg.png`, `cast/npc_funcionaria-recepcion.png`, `cast/npc_adolescente-nna.png` | parte sobre los hombros anclada a `T` |
| `hair:largo-suelto` | largo por la espalda | `cast/camila.png`, `cast/paula.png`, `v1/camila/base/idle.png`, `cast/npc_paciente-vbg.png` | `cover` anclado a `H` y a `T`; de espalda tapa los omóplatos |
| `hair:cola-caballo` | recogido atrás con flequillo | `cast/daniela.png`, `v1/daniela/base/idle.png`, `cast/npc_colega-clinica.png` | la cola se ve en perfil y de espalda |
| `hair:mono` | moño en la coronilla o la nuca | `cast/npc_psicologa-hospitalaria.png` | lo llevan la abuela (canoso), la psicóloga y la orientadora; `volume` solo si la cabeza pasa de 21 px |
| `hair:trenza` | trenza que cae sobre un hombro | `cast/mariana.png` | si cae a un lado es asimétrica: `asymmetric: true` y `right` propia |

- [ ] **Step 1:** Dibuja las cinco piezas siguiendo la guía de autoría.
- [ ] **Step 2:** Regístralas en `pieces/index.mjs`.
- [ ] **Step 3:** Run: `npm run test:kit && npm run kit:build && npm run kit:check` — Expected: PASS y `kit:check: 0 errores`.
- [ ] **Step 4:** Láminas:

```bash
npm run kit:laminas -- --piezas hair:media-melena,hair:largo-suelto,hair:cola-caballo,hair:mono,hair:trenza --salida ../docs/visual/kit-personajes/f2-3-peinados-largos.png --titulo "Peinados largos y recogidos"
npm run kit:laminas -- --piezas hair:afro,hair:bob-flequillo,hair:cola-caballo,hair:corto-liso,hair:corto-rizado,hair:largo-suelto,hair:media-melena,hair:mono,hair:rapado,hair:trenza --escala 2 --salida ../docs/visual/kit-personajes/f2-3-peinados-todos.png --titulo "Los 10 peinados"
```

Autorrevisión: además de la de la guía, comprueba en la lámina de los 10 que cada peinado se distingue de los demás sin color.

- [ ] **Step 5: Commit**

```bash
git add character-kit src/assets/characters/kit ../docs/visual/kit-personajes/f2-3-*.png
git commit -m "feat(personajes): peinados media melena, largo suelto, cola de caballo, moño y trenza

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: PARADA 2 — aprobación de los 10 peinados.** Muestra `f2-2-peinados-cortos.png`, `f2-3-peinados-largos.png` y `f2-3-peinados-todos.png` con el HEAD. Itera hasta un «sí».

---

### Task 9: Rostros y expresiones de retrato — PARADA 3

**Files:**
- Create: `frontend/character-kit/pieces/face/maduro.mjs` (+ `.portrait.mjs`)
- Modify: `frontend/character-kit/pieces/face/sereno.mjs` (añade `expressions`), `frontend/character-kit/pieces/index.mjs`
- Generated: `docs/visual/kit-personajes/f2-4-rostros.png`

| Pieza | Sprite (48×72) | Retrato (96×96) |
|---|---|---|
| `face:sereno` | el de la prueba, sin cambios (Valentina conserva sus hashes) | `portrait` = neutral (el de la prueba); nuevas `expressions`: `preocupada` (cejas que suben hacia el centro, boca recta y tensa), `triste` (párpado caído, comisuras abajo), `alegre` (ojos entrecerrados por la sonrisa, boca abierta con dientes en `eyeWhite`) |
| `face:maduro` | mismos rasgos que sereno + 1-2 px de líneas de expresión (tono profundo de la piel) junto a ojos y boca | neutral + las mismas 3 expresiones, con líneas de expresión y algo de flacidez en mejillas |

Las expresiones solo cambian el retrato (fase 1); el sprite usa siempre el rostro de la receta. Cada expresión es la superposición completa del rostro de retrato en ese estado (sustituye a `portrait`).

- [ ] **Step 1:** Escribe las expresiones de `sereno` y la pieza `maduro` (con `portrait` y `expressions`).
- [ ] **Step 2:** Regístrala; run: `npm run test:kit && npm run kit:build && npm run kit:check` — Expected: PASS, `kit:check: 0 errores` y Valentina sin cambios (la prueba dorada sigue en verde).
- [ ] **Step 3:** Lámina: `npm run kit:laminas -- --piezas face:sereno,face:maduro --salida ../docs/visual/kit-personajes/f2-4-rostros.png --titulo "Rostros y expresiones de retrato"`. Las muestras de rostro traen los 4 estados. Autorrevisión: cada estado se lee a 96 px sin texto, y el mismo estado se reconoce igual en sereno y en maduro.
- [ ] **Step 4: Commit**

```bash
git add character-kit src/assets/characters/kit ../docs/visual/kit-personajes/f2-4-rostros.png
git commit -m "feat(personajes): rostro maduro y expresiones de retrato

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: PARADA 3 — aprobación de rostros y expresiones.** Muestra la lámina con el HEAD; itera hasta un «sí».

---

### Task 10: Partes de arriba casuales

**Files:**
- Create: `frontend/character-kit/pieces/top/{camiseta,sudadera,polo,chaqueta-jean,sueter,cardigan}.mjs` (+ `.portrait.mjs`)
- Modify: `frontend/character-kit/pieces/index.mjs`
- Generated: `docs/visual/kit-personajes/f2-5-arriba-casual.png`

| Pieza | Ranuras | Rasgos | Referencias |
|---|---|---|---|
| `top:camiseta` | `top` | cuello redondo, manga corta (antebrazo `b`/`B` en piel: no lo cubras) | `cast/npc_adolescente-nna.png` |
| `top:sudadera` | `top`, `accent` | capucha a la espalda, bolsillo canguro, puños | `cast/mateo.png` |
| `top:polo` | `top`, `inner` | cuello de polo con 2 botones (`inner` = botones), manga corta | `cast/samuel.png` |
| `top:chaqueta-jean` | `top`, `inner` | chaqueta abierta con costuras y bolsillos de pecho; `inner` = camiseta | `cast/felipe.png`, `v1/felipe/base/idle.png` |
| `top:sueter` | `top`, `inner` | suéter liso con cuello que deja ver el de la camisa (`inner`) | `cast/david.png`, `v1/david/base/idle.png`, `cast/jorge.png`, `cast/npc_paciente-vbg.png` |
| `top:cardigan` | `top`, `inner` | abierto, con botones; `inner` = blusa o camiseta | `cast/luisa.png`, `v1/luisa/base/idle.png` |

- [ ] **Step 1:** Dibuja las seis piezas (4 vistas, A y B, retrato) siguiendo la guía.
- [ ] **Step 2:** Regístralas; run: `npm run test:kit && npm run kit:build && npm run kit:check` — Expected: PASS y `kit:check: 0 errores`.
- [ ] **Step 3:** Lámina: `npm run kit:laminas -- --piezas top:camiseta,top:sudadera,top:polo,top:chaqueta-jean,top:sueter,top:cardigan --salida ../docs/visual/kit-personajes/f2-5-arriba-casual.png --titulo "Partes de arriba casuales"`. Autorrevisión.
- [ ] **Step 4: Commit**

```bash
git add character-kit src/assets/characters/kit ../docs/visual/kit-personajes/f2-5-arriba-casual.png
git commit -m "feat(personajes): camiseta, sudadera, polo, chaqueta de jean, suéter y cárdigan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Ropa formal, uniformes, bata y accesorios — PARADA 4

**Files:**
- Create: `frontend/character-kit/pieces/top/{camisa,blusa,blazer,uniforme-clinico,camisa-seguridad}.mjs`, `frontend/character-kit/pieces/layer/bata.mjs`, `frontend/character-kit/pieces/accessory/{gafas,gafete}.mjs` (+ `.portrait.mjs`)
- Modify: `frontend/character-kit/pieces/index.mjs`, `frontend/character-kit/ramps.mjs` (literales nuevos)
- Generated: `docs/visual/kit-personajes/f2-6-formal-uniformes.png`, `docs/visual/kit-personajes/f2-6-arriba-todo.png`

| Pieza | Ranuras | Rasgos | Referencias |
|---|---|---|---|
| `top:camisa` | `top` | cuello de camisa, botonadura de 1 px, puños | `cast/andres.png`, `v1/andres/base/idle.png` |
| `top:blusa` | `top` | escote suave, sin botonadura marcada | `cast/camila.png`, `cast/daniela.png` |
| `top:blazer` | `top`, `inner` | solapas, abierto sobre camisa (`inner`) | `cast/npc_funcionaria-recepcion.png` |
| `top:uniforme-clinico` | `top` | casaca de pijama clínico, escote en V, bolsillo de pecho, manga corta | `cast/npc_colega-clinica.png` |
| `top:camisa-seguridad` | `top`, `accent` | camisa de uniforme con charreteras y parche en el hombro (`accent`) | `cast/npc_seguridad.png` |
| `layer:bata` | `layer` (+ `top`, `inner` en la abertura) | bata blanca abierta hasta medio muslo; cubre el torso con `repaint` y baja con `cover` anclado a `P`; bolsillos | `cast/npc_supervisor-clinico.png` |
| `accessory:gafas` | literal `gafas` | montura de 1 px a la altura de los ojos; en perfil, patilla hasta la oreja | `cast/david.png` |
| `accessory:gafete` | literales `gafete`, `gafeteCinta` | tarjeta en el pecho colgada de una cinta | — |

Añade a `LITERAL_DEFAULTS` en `ramps.mjs`: `gafas: '#302a3b'`, `gafete: '#f1f2f4'`, `gafeteCinta: '#3d78a8'` (los tres están en la paleta). El gafete va a un lado del pecho: `asymmetric: true` con `right` propia. Las muestras de `layer` y `accessory` las añade `sampleRecipe` sobre la receta base (que ya trae color para `layer`).

- [ ] **Step 1:** Dibuja las ocho piezas siguiendo la guía.
- [ ] **Step 2:** Regístralas (bloques `// capas` y `// accesorios` nuevos en `pieces/index.mjs`); run: `npm run test:kit && npm run kit:build && npm run kit:check` — Expected: PASS y `kit:check: 0 errores`.
- [ ] **Step 3:** Láminas:

```bash
npm run kit:laminas -- --piezas top:camisa,top:blusa,top:blazer,top:uniforme-clinico,top:camisa-seguridad,layer:bata,accessory:gafas,accessory:gafete --salida ../docs/visual/kit-personajes/f2-6-formal-uniformes.png --titulo "Ropa formal, uniformes, bata y accesorios"
npm run kit:laminas -- --piezas top:blazer,top:blusa,top:camisa,top:camisa-seguridad,top:camiseta,top:cardigan,top:chaqueta-capucha,top:chaqueta-jean,top:polo,top:sudadera,top:sueter,top:uniforme-clinico,layer:bata --escala 2 --salida ../docs/visual/kit-personajes/f2-6-arriba-todo.png --titulo "Todas las partes de arriba"
```

Autorrevisión, más: cada parte de arriba se distingue de las demás por la masa y el cuello, no solo por el color.

- [ ] **Step 4: Commit**

```bash
git add character-kit src/assets/characters/kit ../docs/visual/kit-personajes/f2-6-*.png
git commit -m "feat(personajes): camisa, blusa, blazer, uniformes, bata, gafas y gafete

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: PARADA 4 — aprobación de la ropa de arriba, la bata y los accesorios.** Muestra `f2-5-arriba-casual.png`, `f2-6-formal-uniformes.png` y `f2-6-arriba-todo.png` con el HEAD; itera hasta un «sí».

---

### Task 12: Partes de abajo y calzado — PARADA 5

**Files:**
- Create: `frontend/character-kit/pieces/bottom/{pantalon,falda-rodilla,falda-larga,pantalon-uniforme}.mjs`, `frontend/character-kit/pieces/shoes/{zapatos,botines}.mjs`
- Modify: `frontend/character-kit/pieces/index.mjs`
- Generated: `docs/visual/kit-personajes/f2-7-abajo-calzado.png`

| Pieza | Ranuras | Rasgos | Referencias |
|---|---|---|---|
| `bottom:pantalon` | `bottom` | pantalón de tela con raya, más recto que el jean, sin costuras de jean | `cast/andres.png`, `cast/david.png` |
| `bottom:falda-rodilla` | `bottom` | falda recta a la rodilla; pierna en piel debajo (no cubras `m`/`M`) | `cast/npc_funcionaria-recepcion.png` |
| `bottom:falda-larga` | `bottom` | falda hasta media pantorrilla; en la caminata de perfil se abre con la zancada | — (abuela) |
| `bottom:pantalon-uniforme` | `bottom` | pantalón de pijama clínico, holgado, bajo recto | `cast/npc_colega-clinica.png`, `cast/npc_seguridad.png` |
| `shoes:zapatos` | `shoes`, `sole` | zapato de cuero bajo, suela fina | `cast/andres.png` |
| `shoes:botines` | `shoes`, `sole` | caña al tobillo que cubre el bajo de la pierna | `cast/camila.png`, `cast/npc_seguridad.png` |

Las faldas son superposiciones `cover` ancladas a `P`. La larga necesita forma propia por cuadro en la caminata de perfil (`sheets: ['walk'], frames: [k]`) para no dejar piernas atravesadas, más una forma de reposo (`sheets: ['idle']`).

- [ ] **Step 1:** Dibuja las seis piezas siguiendo la guía.
- [ ] **Step 2:** Regístralas; run: `npm run test:kit && npm run kit:build && npm run kit:check` — Expected: PASS y `kit:check: 0 errores` (incluido el doble apoyo de los contactos en perfil con las faldas puestas).
- [ ] **Step 3:** Lámina: `npm run kit:laminas -- --piezas bottom:pantalon,bottom:falda-rodilla,bottom:falda-larga,bottom:pantalon-uniforme,shoes:zapatos,shoes:botines --salida ../docs/visual/kit-personajes/f2-7-abajo-calzado.png --titulo "Partes de abajo y calzado"`. Autorrevisión, con atención a los 6 cuadros de caminata de las faldas.
- [ ] **Step 4: Commit**

```bash
git add character-kit src/assets/characters/kit ../docs/visual/kit-personajes/f2-7-abajo-calzado.png
git commit -m "feat(personajes): pantalón, faldas, pantalón de uniforme, zapatos y botines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: PARADA 5 — aprobación de abajo y calzado.** Muestra la lámina con el HEAD; itera hasta un «sí».

---

# Fase F3 — Recetas del elenco, catálogo y cobertura

### Task 13: Rampas del elenco y los 12 jugables

**Files:**
- Modify: `frontend/character-kit/ramps.mjs`
- Create: `frontend/character-kit/recipes/{andres,camila,daniela,david,felipe,jorge,luisa,mariana,mateo,paula,samuel}.json`
- Generated: `frontend/src/assets/characters/kit/<id>/{idle,walk,portrait-neutral}.png`, `docs/visual/kit-personajes/f3-1-jugables.png`

**Interfaces:**
- Produces: rampas con nombre que usan recetas y catálogo; 12 recetas `kind: "jugable"`, `portraits: ["neutral"]`, `provenance: { "source": "Kit SIEP", "license": "SIEP-INTERNAL" }`.

- [ ] **Step 1: Añade las rampas del elenco a `ramps.mjs`** (verificadas: todos los colores están en `palette.v2.json` y oscurecen de la luz a la profunda; `checkColors` las valida):

```js
  // pelo
  negro: ['#594957', '#3d3543', '#2a2630', '#211e2b'],
  castano: ['#a06a40', '#7b4a30', '#5c3928', '#40271f'],
  cobrizo: ['#d06c49', '#a84e36', '#79372d', '#552b26'],
  rubio: ['#f0d17a', '#d7a957', '#b7783e', '#8a542f'],
  canoso: ['#d2d2d4', '#adaeb5', '#858690', '#62636c'],

  // ropa
  gris: ['#a3abb5', '#737d8b', '#505866', '#353a46'],
  'gris-oscuro': ['#737d8b', '#505866', '#353a46', '#211e2b'],
  celeste: ['#a2cbe1', '#69a2c8', '#3d78a8', '#2c5884'],
  morado: ['#8a70d3', '#6350a6', '#433878', '#2d2852'],
  coral: ['#d06c49', '#a84e36', '#79372d', '#552b26'],
  mostaza: ['#d7a957', '#b7783e', '#8a542f', '#5c3928'],
  vinotinto: ['#a95366', '#7b3b4c', '#562d3a', '#302a3b'],
  rosa: ['#efb0b8', '#d47b8b', '#a95366', '#7b3b4c'],
  caqui: ['#c08a55', '#a06a40', '#7b4a30', '#5c3928'],
  menta: ['#bad2be', '#85b294', '#5b8d70', '#3d6a55'],
  'verde-azulado': ['#69a2c8', '#5b8d70', '#3d6a55', '#29483d'],
```

- [ ] **Step 2: Escribe las 11 recetas nuevas** con la forma de `valentina.json`. Piezas y colores (spec §7.1):

| Receta | `displayName` | Compl. | Piel | Pelo (pieza, color) | Rostro | Arriba (ranuras) | Abajo | Calzado (`shoes`, `sole`) | Accesorios |
|---|---|---|---|---|---|---|---|---|---|
| `andres` | Andrés | b | piel-2 | corto-liso, negro | sereno | camisa (`top` celeste) | pantalon, gris | zapatos (carbon, gris-oscuro) | — |
| `camila` | Camila | a | piel-2 | largo-suelto, cobrizo | sereno | blusa (`top` morado) | jean, marino | botines (castano, carbon) | — |
| `daniela` | Daniela | a | piel-1 | cola-caballo, negro | sereno | blusa (`top` coral) | pantalon, marino | zapatos (carbon, gris-oscuro) | — |
| `david` | David | b | piel-2 | corto-liso, castano | sereno | sueter (`top` marino, `inner` blanco) | pantalon, gris | zapatos (carbon, gris-oscuro) | gafas |
| `felipe` | Felipe | b | piel-2 | corto-rizado, negro | sereno | chaqueta-jean (`top` azul, `inner` blanco) | jean, marino | tenis (carbon, gris-claro) | — |
| `jorge` | Jorge | b | piel-4 | corto-liso, canoso | maduro | sueter (`top` verde, `inner` blanco) | pantalon, gris-oscuro | zapatos (carbon, gris-oscuro) | — |
| `luisa` | Luisa | a | piel-6 | corto-rizado, negro | sereno | cardigan (`top` mostaza, `inner` blanco) | pantalon, carbon | zapatos (carbon, gris-oscuro) | — |
| `mariana` | Mariana | a | piel-3 | trenza, negro | sereno | sueter (`top` morado, `inner` blanco) | jean, marino | tenis (carbon, gris-claro) | — |
| `mateo` | Mateo | b | piel-1 | corto-rizado, castano | sereno | sudadera (`top` gris, `accent` gris-oscuro) | jean, marino | tenis (carbon, gris-claro) | — |
| `paula` | Paula | a | piel-1 | largo-suelto, rubio | sereno | chaqueta-capucha (`top` rosa, `accent` vinotinto, `inner` blanco) | pantalon, gris-oscuro | tenis (carbon, gris-claro) | — |
| `samuel` | Samuel | b | piel-5 | rapado, negro | sereno | polo (`top` vinotinto, `inner` blanco) | pantalon, caqui | zapatos (carbon, gris-oscuro) | — |

Ejemplo completo (`andres.json`):

```json
{
  "id": "andres",
  "displayName": "Andrés",
  "kind": "jugable",
  "complexion": "b",
  "pieces": {
    "hair": "corto-liso",
    "face": "sereno",
    "top": "camisa",
    "bottom": "pantalon",
    "shoes": "zapatos",
    "accessories": []
  },
  "colors": {
    "skin": "piel-2",
    "hair": "negro",
    "top": "celeste",
    "bottom": "gris",
    "shoes": "carbon",
    "sole": "gris-oscuro"
  },
  "portraits": ["neutral"],
  "provenance": { "source": "Kit SIEP", "license": "SIEP-INTERNAL" }
}
```

Si una pieza usa una ranura que la tabla no nombra, `composeCharacter` falla con `falta el color de la ranura «…» (la usa …)`: añade el color que corresponda a la identidad de referencia (`cast/<id>.png`).

- [ ] **Step 3:** Run: `npm run kit:build && npm run kit:check && npm run test:kit` — Expected: 12 personajes, `kit:check: 0 errores`, pruebas PASS.
- [ ] **Step 4:** Lámina: `npm run kit:laminas -- --elenco --salida ../docs/visual/kit-personajes/f3-1-jugables.png --titulo "Los 12 jugables"`. Autorrevisión: compara cada uno con su `cast/<id>.png` (y `v1/<id>/base/idle.png` si existe): la identidad se reconoce (peinado, masa de ropa, colores principales); ningún par de jugables se confunde sin color.
- [ ] **Step 5: Commit**

```bash
git add character-kit src/assets/characters/kit ../docs/visual/kit-personajes/f3-1-jugables.png
git commit -m "feat(personajes): recetas de los 12 jugables y rampas del elenco

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Las 14 recetas de NPC con sus retratos

**Files:**
- Create: `frontend/character-kit/recipes/{abuela-familia,madre-acompanante,sobreviviente,psicologa-hospitalaria,profesional-psicosocial,trabajadora-social,funcionaria-recepcion,orientadora-juridica,enfermera-urgencias,medico-guardia,supervisor-clinico,seguridad,adolescente,paciente-espera}.json`
- Generated: `frontend/src/assets/characters/kit/<id>/…`, `docs/visual/kit-personajes/f3-2-npc.png`

Todas llevan `"kind": "npc"` (salvo `paciente-espera`, `"kind": "figurante"`) y `provenance` del kit. Retratos: las 13 primeras, `["neutral", "preocupada", "triste", "alegre"]`; `paciente-espera`, `["neutral"]`.

| Receta | `displayName` | Compl. | Piel | Pelo | Rostro | Arriba | Capa | Abajo | Calzado | Accesorios |
|---|---|---|---|---|---|---|---|---|---|---|
| `abuela-familia` | Abuela de la niña | a | piel-3 | mono, canoso | maduro | cardigan (vinotinto; inner blanco) | — | falda-larga, carbon | zapatos (carbon, gris-oscuro) | — |
| `madre-acompanante` | Madre acompañante | a | piel-3 | media-melena, castano-oscuro | sereno | blusa (vinotinto) | — | pantalon, carbon | zapatos | — |
| `sobreviviente` | Sobreviviente | a | piel-2 | largo-suelto, castano | sereno | sueter (gris; inner blanco) | — | jean, marino | tenis (carbon, gris-claro) | — |
| `psicologa-hospitalaria` | Psicóloga hospitalaria | a | piel-3 | mono, castano | sereno | blusa (menta) | — | pantalon, carbon | zapatos | gafete |
| `profesional-psicosocial` | Profesional psicosocial | a | piel-6 | bob-flequillo, negro | sereno | blusa (morado) | — | pantalon, carbon | zapatos | gafete |
| `trabajadora-social` | Trabajadora social | a | piel-4 | corto-rizado, castano | sereno | cardigan (verde-azulado; inner blanco) | — | pantalon, gris-oscuro | zapatos | gafete |
| `funcionaria-recepcion` | Funcionaria de recepción | a | piel-1 | media-melena, cobrizo | sereno | camisa (celeste) | — | falda-rodilla, marino | zapatos | — |
| `orientadora-juridica` | Orientadora jurídica | a | piel-5 | mono, negro | sereno | blazer (gris; inner blanco) | — | pantalon, gris-oscuro | zapatos | gafas |
| `enfermera-urgencias` | Enfermera de urgencias | a | piel-3 | cola-caballo, castano | sereno | uniforme-clinico (verde-azulado) | — | pantalon-uniforme, verde-azulado | tenis (blanco, gris-claro) | — |
| `medico-guardia` | Médico de guardia | b | piel-2 | corto-liso, negro | sereno | camisa (celeste) | bata (blanco) | pantalon, gris-oscuro | zapatos | — |
| `supervisor-clinico` | Supervisor clínico | b | piel-4 | corto-liso, canoso | maduro | sueter (gris; inner celeste) | — | pantalon, carbon | zapatos | — |
| `seguridad` | Seguridad | b | piel-6 | rapado, negro | sereno | camisa-seguridad (gris-oscuro; accent marino) | — | pantalon-uniforme, gris-oscuro | botines (carbon, gris-oscuro) | — |
| `adolescente` | Adolescente | a | piel-2 | media-melena, cobrizo | sereno | camiseta (morado) | — | jean, marino | tenis (carbon, gris-claro) | — |
| `paciente-espera` | Paciente en espera | b | piel-3 | corto-liso, castano | sereno | sueter (azul; inner blanco) | — | pantalon, gris | zapatos | — |

«zapatos» sin colores = `shoes: carbon`, `sole: gris-oscuro`. Con capa, la receta lleva `"layer": "bata"` en `pieces` y `"layer": "blanco"` en `colors`.

- [ ] **Step 1:** Escribe las 14 recetas.
- [ ] **Step 2:** Run: `npm run kit:build && npm run kit:check && npm run test:kit` — Expected: 26 personajes, `kit:check: 0 errores`, PASS.
- [ ] **Step 3:** Lámina: `npm run kit:laminas -- --elenco --salida ../docs/visual/kit-personajes/f3-2-npc.png --titulo "Elenco completo: jugables y NPC"`. Autorrevisión: compara con los `cast/npc_*.png` cuyo rol se conserva; la abuela se ve mayor (spec §13.3), y la trabajadora social y la orientadora tienen aspecto propio; ningún NPC se confunde con un jugable sin color; los 4 retratos de cada hablante se distinguen entre sí.
- [ ] **Step 4: Commit**

```bash
git add character-kit/recipes src/assets/characters/kit ../docs/visual/kit-personajes/f3-2-npc.png
git commit -m "feat(personajes): recetas de los 14 NPC con retratos de cuatro estados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Catálogo, cobertura y opciones del editor — PARADA F3

**Files:**
- Create: `frontend/character-kit/catalog.json`
- Create: `frontend/scripts/character-kit/coverage-sources.mjs`, `coverage.mjs`, `coverage.test.mjs`
- Modify: `frontend/src/app/features/character/kit/kit-engine.ts` (tipo `Catalog` en `KitBundle`)
- Modify: `frontend/scripts/character-kit/bundle.mjs` (carga el catálogo), `check.mjs` (cobertura y muestras del editor), `kit.test.mjs` (claves del paquete)
- Generated: `frontend/src/assets/characters/kit/kit.json`, `docs/visual/kit-personajes/f3-3-elenco.png`

**Interfaces:**
- Produces (motor): `Outfit`, `OutfitVariant`, `EditorOptions`, `Catalog` y `KitBundle.catalog: Catalog`. El plan 2 los usa para el resolver, el editor de personaje y la migración de avatares.
- Produces (Node): `COVERAGE_SOURCES`, `referencedKeys(repoRoot)`; `REPO_ROOT`, `checkCatalogKeys(catalog, refs)`, `checkCatalogRecipes(bundle)`, `editorSamples(bundle)`.
- Las fuentes de `COVERAGE_SOURCES` son archivos que el plan 2 retira o cambia; al hacerlo, ese plan debe actualizar `coverage-sources.mjs` para leer `recipeId` de los escenarios.

- [ ] **Step 1: Escribe las pruebas de cobertura**

Crea `frontend/scripts/character-kit/coverage.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildBundle } from './bundle.mjs';
import { REPO_ROOT, checkCatalogKeys, checkCatalogRecipes, editorSamples } from './coverage.mjs';
import { referencedKeys } from './coverage-sources.mjs';

test('las fuentes del juego se leen: escenarios, actores, guías, hablantes y plantillas', () => {
  const refs = referencedKeys(REPO_ROOT);
  assert.equal(refs.scenarioNpcs.size, 20);
  assert.ok(refs.scenarioNpcs.has('supervisor-cierre'));
  assert.ok(refs.actors.has('familia-crisis') && refs.actors.has('sobreviviente-espera'));
  assert.ok(refs.guides.has('Funcionario de derechos'));
  assert.ok(refs.speakers.has('Sobreviviente (22 años)') && refs.speakers.has('Protocolo clínico'));
  assert.deepEqual([...refs.templates].sort(), ['adolescente', 'hombre-adulto', 'mujer-adulta', 'profesional']);
});

test('el catálogo cubre todas las claves que el juego referencia', () => {
  assert.deepEqual(checkCatalogKeys(buildBundle().catalog, referencedKeys(REPO_ROOT)), []);
});

test('una clave nueva sin receta se detecta', () => {
  const refs = referencedKeys(REPO_ROOT);
  refs.guides.add('Guía nueva');
  refs.speakers.add('Voz nueva');
  assert.deepEqual(checkCatalogKeys(buildBundle().catalog, refs), [
    'catálogo: falta el guía «Guía nueva»',
    'catálogo: el hablante «Voz nueva» no es receta ni voz sin cuerpo',
  ]);
});

test('todo lo que el catálogo nombra existe', () => {
  assert.deepEqual(checkCatalogRecipes(buildBundle()), []);
  const bundle = buildBundle();
  bundle.catalog.guides['Enfermera de turno'] = 'no-existe';
  bundle.catalog.editor.hair.push('cresta');
  assert.deepEqual(checkCatalogRecipes(bundle), [
    'catálogo: guides.Enfermera de turno apunta a la receta inexistente «no-existe»',
    'editor: peinado inexistente cresta',
  ]);
});

test('muestras del editor: cada conjunto y variante en cada complexión', () => {
  const samples = editorSamples(buildBundle());
  assert.equal(samples.length, 6 * 5 * 2);
  assert.ok(samples.every(r => r.pieces.face === 'sereno'));
});
```

- [ ] **Step 2: Ejecuta y confirma que fallan**

Run: `npm run test:kit`
Expected: FAIL — `Cannot find module './coverage.mjs'`.

- [ ] **Step 3: Escribe el catálogo**

Crea `frontend/character-kit/catalog.json`. Las correspondencias son las del spec §7.2 con sus asignaciones de 2026-10-03; el bloque `editor` es el kit compacto del §4.7, con las 5 variantes por conjunto que exige la migración del §9.3:

```json
{
  "schemaVersion": 1,
  "defaultRecipe": "valentina",
  "playables": ["valentina", "andres", "camila", "daniela", "david", "felipe", "jorge", "luisa", "mariana", "mateo", "paula", "samuel"],
  "actors": {
    "apoyo-psicosocial": "profesional-psicosocial",
    "enfermera-urgencias": "enfermera-urgencias",
    "escucha-segura": "sobreviviente",
    "familia-crisis": "abuela-familia",
    "familia-duelo": "abuela-familia",
    "funcionaria-recepcion": "funcionaria-recepcion",
    "madre-acompanante": "madre-acompanante",
    "medico-guardia": "medico-guardia",
    "orientadora-juridica": "orientadora-juridica",
    "profesional-psicosocial": "profesional-psicosocial",
    "psicologa-acompanante": "psicologa-hospitalaria",
    "psicologa-orientadora": "psicologa-hospitalaria",
    "sobreviviente-consulta": "sobreviviente",
    "sobreviviente-espera": "sobreviviente",
    "trabajadora-social": "trabajadora-social"
  },
  "scenarioNpcs": {
    "adolescente-nna": "adolescente",
    "apoyo-psicosocial": "profesional-psicosocial",
    "colega-comisaria": "enfermera-urgencias",
    "colega-guardia": "enfermera-urgencias",
    "defensor-familia": "supervisor-clinico",
    "enfermera-urgencias": "enfermera-urgencias",
    "familiar-comisaria": "madre-acompanante",
    "madre-acompanante": "madre-acompanante",
    "madre-familiar": "madre-acompanante",
    "medico-guardia": "medico-guardia",
    "orientadora-juridica": "orientadora-juridica",
    "paciente-comisaria": "sobreviviente",
    "psicologa-orientadora": "psicologa-hospitalaria",
    "seguridad-entrada": "seguridad",
    "sobreviviente-espera": "sobreviviente",
    "supervisor-cierre": "supervisor-clinico",
    "supervisor-comisaria": "supervisor-clinico",
    "supervisor-informe": "supervisor-clinico",
    "supervisor-ruta": "supervisor-clinico",
    "trabajadora-social": "trabajadora-social"
  },
  "speakers": {
    "Abuela de la niña": "abuela-familia",
    "Consultante": "sobreviviente",
    "Funcionaria de recepción": "funcionaria-recepcion",
    "Profesional psicosocial": "profesional-psicosocial",
    "Psicóloga hospitalaria": "psicologa-hospitalaria",
    "Sobreviviente (22 años)": "sobreviviente"
  },
  "voices": ["Criterio profesional", "Herramienta profesional", "Marco normativo y técnico", "Protocolo clínico", "Protocolo de protección", "Supervisión clínica"],
  "portraitKeys": {
    "escucha-segura": "sobreviviente",
    "sobreviviente-consulta": "sobreviviente"
  },
  "guides": {
    "Apoyo psicosocial": "profesional-psicosocial",
    "Colega de psicología": "psicologa-hospitalaria",
    "Defensora de familia": "orientadora-juridica",
    "Enfermera de turno": "enfermera-urgencias",
    "Funcionario de derechos": "supervisor-clinico",
    "Orientadora juridica": "orientadora-juridica",
    "Psicologa hospitalaria": "psicologa-hospitalaria",
    "Trabajadora social": "trabajadora-social"
  },
  "templates": {
    "adolescente": "adolescente",
    "hombre-adulto": "paciente-espera",
    "mujer-adulta": "madre-acompanante",
    "profesional": "profesional-psicosocial"
  },
  "extras": "paciente-espera",
  "emotionToPortrait": {
    "neutral": "neutral",
    "vulnerable": "preocupada",
    "concerned": "preocupada",
    "danger": "triste",
    "positive": "alegre"
  },
  "editor": {
    "complexions": ["a", "b"],
    "skins": ["piel-1", "piel-2", "piel-3", "piel-4", "piel-5", "piel-6"],
    "hair": ["rapado", "corto-liso", "corto-rizado", "bob-flequillo", "media-melena", "largo-suelto", "cola-caballo", "mono", "trenza", "afro"],
    "hairColors": ["negro", "castano-oscuro", "castano", "cobrizo", "rubio", "canoso"],
    "face": "sereno",
    "accessories": ["gafas", "gafete"],
    "outfits": [
      {
        "id": "casual", "label": "Casual", "top": "chaqueta-capucha", "bottom": "jean", "shoes": "tenis",
        "variants": [
          { "id": "morado", "colors": { "top": "morado", "accent": "gris-claro", "inner": "blanco", "bottom": "marino", "shoes": "carbon", "sole": "gris-claro" } },
          { "id": "azul", "colors": { "top": "azul", "accent": "gris-claro", "inner": "blanco", "bottom": "marino", "shoes": "carbon", "sole": "gris-claro" } },
          { "id": "verde", "colors": { "top": "verde", "accent": "azul", "inner": "blanco", "bottom": "marino", "shoes": "carbon", "sole": "gris-claro" } },
          { "id": "vinotinto", "colors": { "top": "vinotinto", "accent": "gris-claro", "inner": "blanco", "bottom": "marino", "shoes": "carbon", "sole": "gris-claro" } },
          { "id": "gris", "colors": { "top": "gris", "accent": "azul", "inner": "blanco", "bottom": "marino", "shoes": "carbon", "sole": "gris-claro" } }
        ]
      },
      {
        "id": "formal", "label": "Formal", "top": "camisa", "bottom": "pantalon", "shoes": "zapatos",
        "variants": [
          { "id": "morado", "colors": { "top": "morado", "bottom": "gris-oscuro", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "azul", "colors": { "top": "celeste", "bottom": "gris-oscuro", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "verde", "colors": { "top": "menta", "bottom": "gris-oscuro", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "vinotinto", "colors": { "top": "vinotinto", "bottom": "gris-oscuro", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "gris", "colors": { "top": "gris", "bottom": "carbon", "shoes": "carbon", "sole": "gris-oscuro" } }
        ]
      },
      {
        "id": "sueter", "label": "Suéter", "top": "sueter", "bottom": "pantalon", "shoes": "zapatos",
        "variants": [
          { "id": "morado", "colors": { "top": "morado", "inner": "blanco", "bottom": "gris", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "azul", "colors": { "top": "azul", "inner": "blanco", "bottom": "gris", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "verde", "colors": { "top": "verde", "inner": "blanco", "bottom": "gris", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "vinotinto", "colors": { "top": "vinotinto", "inner": "blanco", "bottom": "gris", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "gris", "colors": { "top": "gris", "inner": "celeste", "bottom": "carbon", "shoes": "carbon", "sole": "gris-oscuro" } }
        ]
      },
      {
        "id": "blusa-falda", "label": "Blusa y falda", "top": "blusa", "bottom": "falda-rodilla", "shoes": "zapatos",
        "variants": [
          { "id": "morado", "colors": { "top": "morado", "bottom": "carbon", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "azul", "colors": { "top": "celeste", "bottom": "marino", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "verde", "colors": { "top": "menta", "bottom": "carbon", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "vinotinto", "colors": { "top": "vinotinto", "bottom": "carbon", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "gris", "colors": { "top": "gris", "bottom": "marino", "shoes": "carbon", "sole": "gris-oscuro" } }
        ]
      },
      {
        "id": "cardigan", "label": "Cárdigan", "top": "cardigan", "bottom": "pantalon", "shoes": "zapatos",
        "variants": [
          { "id": "morado", "colors": { "top": "morado", "inner": "blanco", "bottom": "carbon", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "azul", "colors": { "top": "azul", "inner": "blanco", "bottom": "carbon", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "verde", "colors": { "top": "verde-azulado", "inner": "blanco", "bottom": "carbon", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "vinotinto", "colors": { "top": "vinotinto", "inner": "blanco", "bottom": "carbon", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "gris", "colors": { "top": "gris", "inner": "blanco", "bottom": "carbon", "shoes": "carbon", "sole": "gris-oscuro" } }
        ]
      },
      {
        "id": "bata", "label": "Bata clínica", "top": "camisa", "layer": "bata", "bottom": "pantalon", "shoes": "zapatos",
        "variants": [
          { "id": "morado", "colors": { "layer": "blanco", "top": "morado", "bottom": "gris-oscuro", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "azul", "colors": { "layer": "blanco", "top": "celeste", "bottom": "gris-oscuro", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "verde", "colors": { "layer": "blanco", "top": "menta", "bottom": "gris-oscuro", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "vinotinto", "colors": { "layer": "blanco", "top": "vinotinto", "bottom": "gris-oscuro", "shoes": "carbon", "sole": "gris-oscuro" } },
          { "id": "gris", "colors": { "layer": "blanco", "top": "gris", "bottom": "gris-oscuro", "shoes": "carbon", "sole": "gris-oscuro" } }
        ]
      }
    ]
  }
}
```

Si una variante necesita una ranura más (p. ej. `accent` de la camisa), `check` lo dirá con `falta el color de la ranura`; añádela a esa variante.

- [ ] **Step 4: El tipo `Catalog` en el motor y el catálogo en el paquete**

En `kit-engine.ts`, antes de `export interface KitBundle`:

```ts
export interface OutfitVariant {
  id: string;
  colors: Record<string, string>;
}

export interface Outfit {
  id: string;
  label: string;
  top: string;
  layer?: string;
  bottom: string;
  shoes: string;
  variants: OutfitVariant[];
}

export interface EditorOptions {
  complexions: string[];
  skins: string[];
  hair: string[];
  hairColors: string[];
  face: string;
  accessories: string[];
  outfits: Outfit[];
}

/** Correspondencias de todo el juego → receta, y opciones del editor (`character-kit/catalog.json`). */
export interface Catalog {
  schemaVersion: 1;
  defaultRecipe: string;
  playables: string[];
  actors: Record<string, string>;
  scenarioNpcs: Record<string, string>;
  speakers: Record<string, string>;
  voices: string[];
  portraitKeys: Record<string, string>;
  guides: Record<string, string>;
  templates: Record<string, string>;
  extras: string;
  emotionToPortrait: Record<string, PortraitState>;
  editor: EditorOptions;
}
```

y añade `catalog: Catalog;` al final de `KitBundle`.

En `bundle.mjs`, en `buildBundle`, añade el catálogo al paquete:

```js
  const catalog = JSON.parse(readFileSync(path.join(KIT_ROOT, 'catalog.json'), 'utf8'));
  return { schemaVersion: 1, complexions, busts, pieces, ramps: RAMPS, literals: LITERAL_DEFAULTS, recipes: loadRecipes(), catalog };
```

En `kit.test.mjs`, la prueba «el paquete serializado es canónico y estable» pasa a esperar `['busts', 'catalog', 'complexions', 'literals', 'pieces', 'ramps', 'recipes', 'schemaVersion']`.

- [ ] **Step 5: Implementa la cobertura**

Crea `frontend/scripts/character-kit/coverage-sources.mjs`:

```js
/**
 * Claves de personaje que el juego referencia hoy, leídas de sus fuentes.
 * El chequeo de cobertura exige que cada una resuelva a una receta (o a una
 * voz sin cuerpo). Si una fuente cambia de sitio, se actualiza aquí.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const COVERAGE_SOURCES = Object.freeze({
  scenarios: 'frontend/src/assets/game/scenarios',
  mapObjectPresets: 'frontend/src/app/features/simulator/npc-avatar-presets.ts',
  actorRoster: 'frontend/src/assets/characters/v1/actor-roster.v1.json',
  guides: 'frontend/src/app/features/simulator/scene-guide.config.ts',
  seed: 'backend_django/apps/simulation/management/commands/seed_caso_pdf.py',
  speakerLiterals: [
    'frontend/src/app/features/simulator/risky-interaction.config.ts',
    'frontend/src/app/features/simulator/simulation-play.component.ts',
  ],
  portraitResolver: 'frontend/src/app/features/simulator/portrait-resolver.util.ts',
  templates: 'frontend/src/app/features/simulator/authoring-catalog.config.ts',
});

const read = (root, rel) => readFileSync(path.join(root, rel), 'utf8');
const all = (text, re) => [...text.matchAll(re)].map(m => m[1]);

/** Texto entre `start` y el primer `end` que le sigue. */
function block(text, start, end) {
  const i = text.indexOf(start);
  if (i < 0) throw new Error(`cobertura: no encuentro «${start}»`);
  return text.slice(i, text.indexOf(end, i));
}

function scenarioNpcIds(root) {
  const dir = path.join(root, COVERAGE_SOURCES.scenarios);
  const ids = new Set();
  const walk = node => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if ('avatarPresetKey' in node && typeof node.key === 'string') ids.add(node.key);
    Object.values(node).forEach(walk);
  };
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    walk(JSON.parse(readFileSync(path.join(dir, file), 'utf8')));
  }
  return ids;
}

export function referencedKeys(root) {
  const presets = read(root, COVERAGE_SOURCES.mapObjectPresets);
  const roster = JSON.parse(read(root, COVERAGE_SOURCES.actorRoster));
  const resolver = read(root, COVERAGE_SOURCES.portraitResolver);
  const speakers = new Set([
    ...all(read(root, COVERAGE_SOURCES.seed), /"dialogue":\s*\("([^"]+)"/g),
    ...COVERAGE_SOURCES.speakerLiterals.flatMap(rel => all(read(root, rel), /speakerName: '([^']+)'/g)),
    ...all(block(resolver, 'const SPEAKER_NAME_TO_SLUG', '};'), /'([^']+)':/g),
  ]);
  return {
    scenarioNpcs: scenarioNpcIds(root),
    actors: new Set([
      ...all(block(presets, 'export const MAP_OBJECT_PRESETS', '};'), /'([^']+)':/g),
      ...roster.mappings.map(m => m.actorId),
    ]),
    guides: new Set(all(read(root, COVERAGE_SOURCES.guides), /guideName: '([^']+)'/g)),
    speakers,
    portraitKeys: new Set(all(block(resolver, 'const PORTRAIT_KEY_TO_SLUG', '};'), /'([^']+)':/g)),
    templates: new Set(all(block(read(root, COVERAGE_SOURCES.templates), 'export const AUTHORING_NPC_TEMPLATES', '];'), /^\s+id: '([^']+)'/gm)),
  };
}
```

Crea `frontend/scripts/character-kit/coverage.mjs`:

```js
/**
 * Cobertura (spec §6.6): toda clave de personaje que el juego referencia
 * resuelve a una receta (o a una voz sin cuerpo), y todo lo que nombra el
 * catálogo existe en el paquete.
 */

import path from 'node:path';

import { PORTRAIT_STATES } from '../../src/app/features/character/kit/kit-engine.ts';
import { FRONTEND_ROOT } from './bundle.mjs';

export const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const EMOTIONS = ['neutral', 'vulnerable', 'concerned', 'danger', 'positive'];
/** Variantes de color de cada conjunto: las que necesita la migración de avatares v1 (spec §9.3). */
export const OUTFIT_VARIANTS = Object.freeze(['morado', 'azul', 'verde', 'vinotinto', 'gris']);
const MAPS = Object.freeze([
  ['scenarioNpcs', 'el NPC de escenario'],
  ['actors', 'el actor'],
  ['guides', 'el guía'],
  ['portraitKeys', 'la clave de retrato'],
  ['templates', 'la plantilla'],
]);

/** Cada clave referenciada por el juego está en el catálogo. */
export function checkCatalogKeys(catalog, refs) {
  const errors = [];
  for (const [map, what] of MAPS) {
    for (const key of [...refs[map]].sort()) {
      if (!(key in catalog[map])) errors.push(`catálogo: falta ${what} «${key}»`);
    }
  }
  for (const name of [...refs.speakers].sort()) {
    if (!(name in catalog.speakers) && !catalog.voices.includes(name)) {
      errors.push(`catálogo: el hablante «${name}» no es receta ni voz sin cuerpo`);
    }
  }
  return errors;
}

/** Todo lo que el catálogo nombra (recetas, piezas, rampas, estados) existe. */
export function checkCatalogRecipes(bundle) {
  const { catalog, recipes, pieces, ramps, complexions } = bundle;
  const errors = [];
  const recipe = (id, where) => {
    if (!recipes[id]) errors.push(`catálogo: ${where} apunta a la receta inexistente «${id}»`);
    return recipes[id];
  };
  const playables = new Set(catalog.playables);
  for (const id of catalog.playables) {
    const r = recipe(id, 'playables');
    if (r && r.kind !== 'jugable') errors.push(`receta ${id}: está en playables y no es jugable`);
  }
  for (const r of Object.values(recipes)) {
    if (r.kind === 'jugable' && !playables.has(r.id)) errors.push(`receta ${r.id}: es jugable y no está en playables`);
  }
  if (!playables.has(catalog.defaultRecipe)) errors.push(`catálogo: defaultRecipe «${catalog.defaultRecipe}» no es jugable`);
  for (const [map] of [...MAPS, ['speakers']]) {
    for (const [key, id] of Object.entries(catalog[map])) recipe(id, `${map}.${key}`);
  }
  recipe(catalog.extras, 'extras');
  for (const [name, id] of Object.entries(catalog.speakers)) {
    const missing = PORTRAIT_STATES.filter(state => !(recipes[id]?.portraits ?? []).includes(state));
    if (recipes[id] && missing.length) errors.push(`receta ${id}: habla («${name}») y le faltan los retratos ${missing.join(', ')}`);
  }
  for (const emotion of EMOTIONS) {
    if (!PORTRAIT_STATES.includes(catalog.emotionToPortrait[emotion])) errors.push(`catálogo: la emoción ${emotion} no proyecta a un estado de retrato`);
  }
  const ed = catalog.editor;
  for (const c of ed.complexions) if (!complexions[c]) errors.push(`editor: complexión inexistente ${c}`);
  for (const s of ed.skins) if (!ramps[s]) errors.push(`editor: piel sin rampa ${s}`);
  for (const h of ed.hair) if (!pieces[`hair:${h}`]) errors.push(`editor: peinado inexistente ${h}`);
  for (const h of ed.hairColors) if (!ramps[h]) errors.push(`editor: color de pelo sin rampa ${h}`);
  for (const a of ed.accessories) if (!pieces[`accessory:${a}`]) errors.push(`editor: accesorio inexistente ${a}`);
  if (!pieces[`face:${ed.face}`]) errors.push(`editor: rostro inexistente ${ed.face}`);
  for (const outfit of ed.outfits) {
    for (const kind of ['top', 'layer', 'bottom', 'shoes']) {
      if (outfit[kind] && !pieces[`${kind}:${outfit[kind]}`]) errors.push(`editor: el conjunto ${outfit.id} usa ${kind}:${outfit[kind]}, que no existe`);
    }
    if (outfit.variants.map(v => v.id).join() !== OUTFIT_VARIANTS.join()) {
      errors.push(`editor: el conjunto ${outfit.id} debe tener las variantes ${OUTFIT_VARIANTS.join(', ')} en ese orden`);
    }
    for (const variant of outfit.variants) {
      for (const [slot, ramp] of Object.entries(variant.colors)) {
        if (!ramps[ramp]) errors.push(`editor: ${outfit.id}/${variant.id}, ranura ${slot}: rampa inexistente ${ramp}`);
      }
    }
  }
  return errors;
}

/** Un avatar de muestra por conjunto, variante y complexión (pelo y piel por defecto del editor). */
export function editorSamples(bundle) {
  const ed = bundle.catalog.editor;
  const out = [];
  for (const complexion of ed.complexions) {
    for (const outfit of ed.outfits) {
      for (const variant of outfit.variants) {
        out.push({
          id: `editor-${outfit.id}-${variant.id}-${complexion}`,
          complexion,
          pieces: { hair: ed.hair[0], face: ed.face, top: outfit.top, ...(outfit.layer ? { layer: outfit.layer } : {}), bottom: outfit.bottom, shoes: outfit.shoes, accessories: [] },
          colors: { skin: ed.skins[0], hair: ed.hairColors[0], ...variant.colors },
        });
      }
    }
  }
  return out;
}
```

En `check.mjs`, importa y añade la cobertura y las muestras del editor a `runCheck`, después del bucle de muestras de piezas:

```js
import { REPO_ROOT, checkCatalogKeys, checkCatalogRecipes, editorSamples } from './coverage.mjs';
import { referencedKeys } from './coverage-sources.mjs';
```

```js
  errors.push(...checkCatalogKeys(bundle.catalog, referencedKeys(REPO_ROOT)));
  errors.push(...checkCatalogRecipes(bundle));
  for (const recipe of editorSamples(bundle)) {
    const composed = composeCharacter(bundle, recipe, { keepDressed: true });
    errors.push(...checkCharacter(composed, { name: recipe.id, palette, outline: OUTLINE }));
  }
```

- [ ] **Step 6:** Run: `npm run test:kit && npm run kit:types && npm run kit:build && npm run kit:check` — Expected: todas PASS, sin errores de tipos, `kit:check: 0 errores`.
- [ ] **Step 7:** Lámina del elenco completo: `npm run kit:laminas -- --elenco --salida ../docs/visual/kit-personajes/f3-3-elenco.png --titulo "Elenco del kit: 12 jugables, 14 NPC"`. Autorrevisión final del elenco con los criterios de las tareas 13 y 14.
- [ ] **Step 8: Commit**

```bash
git add character-kit/catalog.json scripts/character-kit src/app/features/character/kit/kit-engine.ts src/assets/characters/kit ../docs/visual/kit-personajes/f3-3-elenco.png
git commit -m "feat(personajes): catálogo único, cobertura de claves y opciones del editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: PARADA F3 — aprobación del elenco.** Muestra al usuario `f3-1-jugables.png`, `f3-2-npc.png` y `f3-3-elenco.png` con el HEAD, y recuerda las asignaciones de guías y NPC de escenarios archivados del spec §7.2 (están en `catalog.json`). Itera hasta un «sí». Con eso termina el plan 1.

---

## Después de este plan

- Con el elenco aprobado, se escribe el **plan 2 (integración, F4-F7)** con las interfaces reales: resolver único, render a escala entera (zoom de cámara entero, DPR, luz debajo, sin `character-motion` ni tintes, icono del estado de la paciente), migración de pantallas, migración de avatares, borrado del legado (incluida la actualización de `coverage-sources.mjs`) y e2e del lobby con aviso. Después, el **plan 3 (F8)**: muebles y puertas a la altura nueva. La rama no se integra en `master` hasta terminar la F8.
- Hasta entonces, el juego sigue usando sus sistemas actuales: este plan solo añade el kit y su salida.
