# 07 — La vista previa del editor muestra al personaje elegido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Estado:** TODO
- **Commit base:** `470a0a2` (rama `feat/personaje-v1-idle-walk`)
- **Severidad:** MEDIA (la primera pantalla del estudiante contradice su elección)
- **Categoría:** Usabilidad / cohesión pixel art
- **Alcance estimado:** 1 util nuevo + spec, 1 componente editado + spec de fuente

**Goal:** Que al elegir un personaje del elenco (por ejemplo Valentina) la vista previa grande del editor muestre a ese personaje, igual que el juego, y que el resumen describa esa elección.

**Architecture:** Hoy la figura grande (`<app-avatar-figure>`) solo sabe dibujar el avatar modular «clásico» y no lee `castId`. Como `defaultAvatar()` trae `castId: 'valentina'`, todo estudiante nuevo ve una figura que no corresponde a su selección. Se añade una función pura, `editorPreview(config, view)`, que reutiliza `resolvePlayerVisual` (la misma que usa el juego) y devuelve qué hoja de sprites y qué cuadro mostrar. Los cuadros se dibujan en DOM con `background-position` en píxeles exactos y a escala entera (v1: 48×72 × 4 = 192×288 px; elenco: 128×192 × 1). Es un puente: el plan `2026-07-13-character-manifest-editor-premium.md` (sin ejecutar) prevé un `character-sprite-preview.component` completo que lo reemplazará.

**Tech Stack:** Angular 21 (signals, `NgStyle`), Jest 30.

**Spec:** Auditoría estética y técnica del 2026-09-29, tabla «Simulador», fila del editor de personaje (verificado en vivo: Valentina seleccionada, vista previa con otro personaje). Este plan es autocontenido.

## Global Constraints

- Todas las rutas son relativas a la raíz del repo.
- No añadir dependencias.
- No tocar `frontend/src/app/features/simulator/game-world.component.ts`, `player-motion.util.ts` ni `player-motion.util.spec.ts`.
- No modificar `v1-avatar.util.ts` ni `baked-cast.util.ts`: solo importarlos.
- Escalas de pixel art siempre enteras; `image-rendering: pixelated`.
- Si un fragmento «Actual» no coincide con el archivo, DETENERSE y reportar.
- Textos visibles en español con tildes. Mensajes de commit en español con formato `tipo(ámbito): descripción`.

## Review Focus

- Personajes con hojas v1 (`valentina`, `andres`, `camila`, `daniela`, `david`, `felipe`, `jorge`, `luisa`): frontal, lateral izquierda y lateral derecha son filas reales de la hoja; no se espeja.
- Personajes del elenco sin v1 (`mariana`, `mateo`, `paula`, `samuel`): la hoja horneada solo tiene lado derecho; la vista izquierda se espeja.
- Opción «Clásico» (sin `castId`): sigue mostrando la figura modular como hoy.
- Un `castId` desconocido guardado en `localStorage`: `resolvePlayerVisual` lo descarta y se ve la figura modular.
- Los cuadros no muestran una franja del cuadro vecino: posiciones en píxeles enteros, no porcentajes.

## Problema

`frontend/src/app/features/character/character-editor.component.ts:116-119` (actual):

```html
        <section class="ce-stage glass" aria-label="Vista previa del avatar">
          <div class="ce-halo"></div>
          <app-avatar-figure class="ce-figure" [config]="avatar()" [pose]="pose()" [flipX]="flipX()" />
```

`avatar-figure.component.ts` no contiene ninguna referencia a `castId`. El resumen (`character-editor.component.ts:145-152`) siempre lista los campos del modo clásico (Género, Ropa, Cabello, Expresión) aunque haya un personaje del elenco elegido, y tiene faltas de ortografía:

```html
            <li><span>Genero</span><strong>{{ labelOf(genderOptions, avatar().gender) }}</strong></li>
            <li><span>Ropa</span><strong>{{ labelOf(clothingColors, avatar().clothingColor) }}</strong></li>
            <li><span>Cabello</span><strong>{{ labelOf(hairStyles, avatar().hairStyle) }} {{ hairColorLabel() }}</strong></li>
            <li><span>Expresion</span><strong>{{ labelOf(mouths, avatar().mouth) }}</strong></li>
```

Otras faltas: `:66` `aria-label="Genero"`, `:106` `<p class="ce-section">Expresion</p>`, `:107` `aria-label="Expresion"`, `:140` `Proximamente`, y `avatarSummary` (`:263-264`) dice `expresion`.

Datos de las hojas (verificados):
- v1: `/assets/characters/v1/<id>/base/idle.png`, 192×288, cuadros de 48×72, 4 columnas × 4 filas; filas `down=0, left=1, right=2, up=3` (`V1_DIR_ROW` en `frontend/src/app/features/simulator/v1-avatar.util.ts`).
- Elenco horneado: `/assets/characters/cast/<id>.png` (`castAssetPath`), 384×576, cuadros de 128×192, 3 × 3; fila 0 frente, fila 1 lado derecho, fila 2 espalda (comentario de `baked-cast.util.ts:1-11`).

## Objetivo

- `frontend/src/app/features/character/editor-preview.util.ts` con `editorPreview(config, view)` y `sheetFrameStyle(preview)`.
- La etapa del editor muestra un `<span class="ce-sheet" role="img">` con el cuadro correcto cuando hay personaje del elenco, y `<app-avatar-figure>` en modo clásico.
- El resumen muestra «Personaje: <nombre>» cuando hay elenco; los campos clásicos solo en modo clásico. Ortografía corregida.

## Convenciones del repo

- Utilidades puras con spec junto al componente: `frontend/src/app/features/character/avatar-config.util.ts` + `avatar-config.util.spec.ts`.
- Configuración por defecto: `defaultAvatar()` en `avatar-config.util.ts:56`.
- Jest: `npm test --prefix frontend -- --runInBand <ruta del spec>`.

---

### Task 1: Función pura de vista previa

**Files:**
- Create: `frontend/src/app/features/character/editor-preview.util.ts`
- Create: `frontend/src/app/features/character/editor-preview.util.spec.ts`

**Interfaces:**
- Produces:
  - `type EditorView = 'front' | 'left' | 'right'`
  - `type SheetPreview = { kind: 'sheet'; url: string; cols: number; rows: number; col: number; row: number; frameWidth: number; frameHeight: number; scale: number; flipX: boolean }`
  - `type EditorPreview = { kind: 'modular' } | SheetPreview`
  - `editorPreview(config: AvatarConfig, view: EditorView): EditorPreview`
  - `sheetFrameStyle(preview: SheetPreview): Record<string, string>`

- [ ] **Step 1: Escribir las pruebas**

```ts
import { defaultAvatar } from './avatar-config.util';
import { editorPreview, sheetFrameStyle, SheetPreview } from './editor-preview.util';

function withCast(castId: string | undefined) {
  return { ...defaultAvatar(), castId };
}

describe('editorPreview', () => {
  it('sin personaje del elenco usa la figura modular', () => {
    expect(editorPreview(withCast(undefined), 'front')).toEqual({ kind: 'modular' });
  });

  it('un castId desconocido cae a la figura modular', () => {
    expect(editorPreview(withCast('no-existe'), 'front')).toEqual({ kind: 'modular' });
  });

  it('un personaje v1 usa su hoja idle a escala 4 y filas reales por dirección', () => {
    const front = editorPreview(withCast('valentina'), 'front') as SheetPreview;
    expect(front).toMatchObject({
      kind: 'sheet', url: '/assets/characters/v1/valentina/base/idle.png',
      cols: 4, rows: 4, col: 0, row: 0, frameWidth: 48, frameHeight: 72, scale: 4, flipX: false,
    });
    expect((editorPreview(withCast('valentina'), 'left') as SheetPreview).row).toBe(1);
    expect((editorPreview(withCast('valentina'), 'right') as SheetPreview).row).toBe(2);
    expect((editorPreview(withCast('valentina'), 'left') as SheetPreview).flipX).toBe(false);
  });

  it('un personaje horneado sin v1 usa su hoja a escala 1 y espeja la izquierda', () => {
    const front = editorPreview(withCast('samuel'), 'front') as SheetPreview;
    expect(front).toMatchObject({
      kind: 'sheet', url: '/assets/characters/cast/samuel.png',
      cols: 3, rows: 3, col: 0, row: 0, frameWidth: 128, frameHeight: 192, scale: 1, flipX: false,
    });
    expect(editorPreview(withCast('samuel'), 'left')).toMatchObject({ row: 1, flipX: true });
    expect(editorPreview(withCast('samuel'), 'right')).toMatchObject({ row: 1, flipX: false });
  });
});

describe('sheetFrameStyle', () => {
  it('posiciona el cuadro en píxeles enteros', () => {
    const left = editorPreview(withCast('valentina'), 'left') as SheetPreview;
    expect(sheetFrameStyle(left)).toEqual({
      width: '192px',
      height: '288px',
      'background-image': "url('/assets/characters/v1/valentina/base/idle.png')",
      'background-size': '768px 1152px',
      'background-position': '0px -288px',
      transform: 'none',
    });
  });

  it('espeja con scaleX cuando corresponde', () => {
    const left = editorPreview(withCast('samuel'), 'left') as SheetPreview;
    expect(sheetFrameStyle(left)['transform']).toBe('scaleX(-1)');
    expect(sheetFrameStyle(left)['background-position']).toBe('0px -192px');
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/features/character/editor-preview.util.spec.ts`
Expected: FAIL (`Cannot find module './editor-preview.util'`).

- [ ] **Step 2: Implementar**

`frontend/src/app/features/character/editor-preview.util.ts`:

```ts
import { AvatarConfig } from './avatar.model';
import { castAssetPath } from '../simulator/baked-cast.util';
import {
  V1_DIR_ROW,
  V1_FRAME_HEIGHT,
  V1_FRAME_WIDTH,
  V1_IDLE_COLS,
  resolvePlayerVisual,
  v1SheetPath,
} from '../simulator/v1-avatar.util';

export type EditorView = 'front' | 'left' | 'right';

export interface SheetPreview {
  kind: 'sheet';
  url: string;
  cols: number;
  rows: number;
  col: number;
  row: number;
  frameWidth: number;
  frameHeight: number;
  /** Escala entera de pixel art. */
  scale: number;
  flipX: boolean;
}

export type EditorPreview = { kind: 'modular' } | SheetPreview;

const V1_IDLE_ROWS = 4;
const V1_PREVIEW_SCALE = 4;
/** Hoja horneada: 3×3 cuadros de 128×192; fila 0 frente, fila 1 lado derecho. */
const CAST_COLS = 3;
const CAST_ROWS = 3;
const CAST_FRAME_WIDTH = 128;
const CAST_FRAME_HEIGHT = 192;

/**
 * Qué dibujar en la vista previa del editor. Usa la misma prioridad que el
 * juego (v1 → elenco horneado → modular) para que la vista previa y el mapa
 * muestren al mismo personaje.
 */
export function editorPreview(config: AvatarConfig, view: EditorView): EditorPreview {
  const visual = resolvePlayerVisual(config);
  if (visual.kind === 'v1') {
    const direction = view === 'front' ? 'down' : view;
    return {
      kind: 'sheet',
      url: v1SheetPath(visual.id, 'idle'),
      cols: V1_IDLE_COLS,
      rows: V1_IDLE_ROWS,
      col: 0,
      row: V1_DIR_ROW[direction],
      frameWidth: V1_FRAME_WIDTH,
      frameHeight: V1_FRAME_HEIGHT,
      scale: V1_PREVIEW_SCALE,
      flipX: false,
    };
  }
  if (visual.kind === 'cast') {
    return {
      kind: 'sheet',
      url: castAssetPath(visual.id),
      cols: CAST_COLS,
      rows: CAST_ROWS,
      col: 0,
      row: view === 'front' ? 0 : 1,
      frameWidth: CAST_FRAME_WIDTH,
      frameHeight: CAST_FRAME_HEIGHT,
      scale: 1,
      flipX: view === 'left',
    };
  }
  return { kind: 'modular' };
}

/** Estilo de un cuadro de la hoja, en píxeles enteros para no mostrar franjas vecinas. */
export function sheetFrameStyle(preview: SheetPreview): Record<string, string> {
  const width = preview.frameWidth * preview.scale;
  const height = preview.frameHeight * preview.scale;
  return {
    width: `${width}px`,
    height: `${height}px`,
    'background-image': `url('${preview.url}')`,
    'background-size': `${preview.cols * width}px ${preview.rows * height}px`,
    'background-position': `${-preview.col * width}px ${-preview.row * height}px`,
    transform: preview.flipX ? 'scaleX(-1)' : 'none',
  };
}
```

Nota: `-0` se imprime como `0` en un template string (`${-0}` → `"0"`), así que el cuadro de la columna 0 da `0px`.

- [ ] **Step 3: Ejecutar y confirmar que pasa**

Run: `npm test --prefix frontend -- --runInBand src/app/features/character/editor-preview.util.spec.ts`
Expected: PASS (6 pruebas).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/character/editor-preview.util.ts frontend/src/app/features/character/editor-preview.util.spec.ts
git commit -m "feat(character): resolver la vista previa del editor igual que el juego"
```

---

### Task 2: Usar la vista previa en el editor

**Files:**
- Modify: `frontend/src/app/features/character/character-editor.component.ts`
- Create: `frontend/src/app/features/character/character-editor.preview.spec.ts`

- [ ] **Step 1: Escribir la prueba de fuente**

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'character-editor.component.ts'), 'utf-8');

describe('editor de personaje: vista previa y resumen', () => {
  it('la etapa dibuja la hoja del personaje elegido y cae a la figura clásica', () => {
    expect(source).toContain('@if (previewStyle(); as frame) {');
    expect(source).toContain('<span class="ce-sheet" role="img" [attr.aria-label]="\'Vista previa de \' + castLabel()" [ngStyle]="frame"></span>');
    expect(source).toContain('readonly preview = computed(() => editorPreview(this.avatar(), this.view()));');
  });

  it('el resumen describe la elección real', () => {
    expect(source).toContain('<li><span>Personaje</span><strong>{{ castLabel() }}</strong></li>');
  });

  it('sin faltas de ortografía en las etiquetas', () => {
    for (const wrong of ['>Genero<', '"Genero"', '>Expresion<', '"Expresion"', '>Proximamente<', 'expresion ${']) {
      expect(source).not.toContain(wrong);
    }
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/features/character/character-editor.preview.spec.ts`
Expected: FAIL.

- [ ] **Step 2: Imports y estado**

Añadir el import:

```ts
import { editorPreview, sheetFrameStyle } from './editor-preview.util';
```

En la clase, debajo de `readonly flipX = computed(() => this.view() === 'left');`, añadir:

```ts
  readonly preview = computed(() => editorPreview(this.avatar(), this.view()));
  readonly previewStyle = computed(() => {
    const preview = this.preview();
    return preview.kind === 'sheet' ? sheetFrameStyle(preview) : null;
  });
  readonly castLabel = computed(() =>
    this.playableCast.find(member => member.id === this.avatar().castId)?.label ?? '');
```

(`CommonModule`, que ya está en `imports`, aporta `NgStyle`.)

- [ ] **Step 3: Etapa**

Reemplazar la línea 118:

```html
          <app-avatar-figure class="ce-figure" [config]="avatar()" [pose]="pose()" [flipX]="flipX()" />
```

por:

```html
          @if (previewStyle(); as frame) {
            <span class="ce-sheet" role="img" [attr.aria-label]="'Vista previa de ' + castLabel()" [ngStyle]="frame"></span>
          } @else {
            <app-avatar-figure class="ce-figure" [config]="avatar()" [pose]="pose()" [flipX]="flipX()" />
          }
```

En los estilos, debajo de la regla `.ce-figure { … }` (línea 202), añadir:

```css
    .ce-sheet { position: relative; display: block; flex: none; background-repeat: no-repeat; image-rendering: pixelated; }
```

- [ ] **Step 4: Resumen según la elección**

Reemplazar las cuatro líneas del resumen (Género, Ropa, Cabello, Expresión, `:148-151`) por:

```html
            @if (avatar().castId && castLabel()) {
              <li><span>Personaje</span><strong>{{ castLabel() }}</strong></li>
            } @else {
              <li><span>Género</span><strong>{{ labelOf(genderOptions, avatar().gender) }}</strong></li>
              <li><span>Ropa</span><strong>{{ labelOf(clothingColors, avatar().clothingColor) }}</strong></li>
              <li><span>Cabello</span><strong>{{ labelOf(hairStyles, avatar().hairStyle) }} {{ hairColorLabel() }}</strong></li>
              <li><span>Expresión</span><strong>{{ labelOf(mouths, avatar().mouth) }}</strong></li>
            }
```

(La línea `Rol` que va antes se queda igual.)

- [ ] **Step 5: Ortografía**

- `:66` `aria-label="Genero"` → `aria-label="Género"`
- `:106` `<p class="ce-section">Expresion</p>` → `<p class="ce-section">Expresión</p>`
- `:107` `aria-label="Expresion"` → `aria-label="Expresión"`
- `:140` `<small class="ce-soon">Proximamente</small>` → `<small class="ce-soon">Próximamente</small>`
- `avatarSummary` (`:264`): `expresion ${` → `expresión ${`

- [ ] **Step 6: Pruebas, build y commit**

Run: `npm test --prefix frontend -- --runInBand src/app/features/character`
Expected: PASS (incluye `avatar-figure.component.spec.ts`, `avatar.store.spec.ts` y los dos nuevos).

Run: `npm run build:frontend`
Expected: build OK.

```bash
git add frontend/src/app/features/character
git commit -m "fix(character): la vista previa y el resumen muestran al personaje elegido"
```

## Límites

- NO cambiar las miniaturas del selector (`castThumb`) ni las figuras de «Uniforme».
- NO animar la vista previa (sin ciclo idle): eso corresponde al componente de preview del plan premium.
- NO tocar `avatar-figure.component.ts`.

## Verificación

- **Mecánica:** `npm test --prefix frontend -- --runInBand src/app/features/character` y `npm run build:frontend` en verde.
- **Revisión visual** (`npm run up`, http://localhost:4200, «Usar demo» de estudiante, menú «Mi personaje»):
  - Con Valentina seleccionada, la vista previa grande muestra a Valentina (pelo castaño largo, ropa teal), la misma que aparece en el lobby.
  - «Frontal», «Lateral izq.» y «Lateral der.» cambian el cuadro; el personaje v1 no se ve espejado ni cortado.
  - Elegir Samuel (sin v1): frontal y lateral derecha; la izquierda es la derecha espejada.
  - Elegir «Clásico»: vuelve la figura por capas y el resumen lista Género, Ropa, Cabello y Expresión.
  - Con zoom del navegador al 100 %, los píxeles de la vista previa se ven cuadrados y del mismo tamaño (escala entera).
- **Hecho cuando:** la vista previa del editor y el sprite del lobby muestran al mismo personaje para todo el elenco.
