# HUD liquid-glass morado SIEP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Volver el shell del juego (paneles, HUD, dock) a la identidad SIEP liquid-glass oscura morada de los mockups, con estrés en corazones y marca SIEP, sin tocar backend ni el portal claro.

**Architecture:** Una util pura (`stress-hearts.util.ts`) testeada por Jest; el resto es restyle SCSS scoped (tema `.game-container` + `pixel-*` en `simulation-play`, acentos+corazones en `simulation-hud`, badges en `tool-inventory`).

**Tech Stack:** Angular 21 (componentes standalone, estilos inline), TypeScript, Jest.

**Spec:** `docs/superpowers/specs/2026-06-05-game-hud-liquid-glass-design.md`

**Verificación:** solo la util es testeable por unidad. El restyle se verifica con `ng build` + smoke en vivo (comparación visual contra mockups).

---

### Task 1: Util `stress-hearts.util.ts` (TDD)

**Files:**
- Create: `frontend/src/app/features/simulator/stress-hearts.util.ts`
- Test: `frontend/src/app/features/simulator/stress-hearts.util.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/features/simulator/stress-hearts.util.spec.ts`:

```ts
import { stressToHearts } from './stress-hearts.util';

describe('stressToHearts', () => {
  it('full hearts when stress is 0 (max calm)', () => {
    expect(stressToHearts(0)).toEqual(['full','full','full','full','full']);
  });

  it('empty hearts when stress is 100', () => {
    expect(stressToHearts(100)).toEqual(['empty','empty','empty','empty','empty']);
  });

  it('half heart at the midpoint (calma 50 → 2.5 hearts)', () => {
    expect(stressToHearts(50)).toEqual(['full','full','half','empty','empty']);
  });

  it('clamps out-of-range input', () => {
    expect(stressToHearts(-10)).toEqual(['full','full','full','full','full']);
    expect(stressToHearts(130)).toEqual(['empty','empty','empty','empty','empty']);
  });

  it('honours a custom total', () => {
    expect(stressToHearts(0, 3)).toEqual(['full','full','full']);
    expect(stressToHearts(100, 3)).toEqual(['empty','empty','empty']);
  });

  it('treats non-finite input as max stress (all empty, safe default)', () => {
    expect(stressToHearts(NaN)).toEqual(['empty','empty','empty','empty','empty']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx jest stress-hearts.util.spec -i`
Expected: FAIL — `Cannot find module './stress-hearts.util'`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/app/features/simulator/stress-hearts.util.ts`:

```ts
export type Heart = 'full' | 'half' | 'empty';

/**
 * Convierte stressIndex (0..100) en una fila de `total` corazones que representan
 * la CALMA restante (100 - stress): stress 0 → todos llenos; stress 100 → vacíos.
 * Medio corazón para el tramo intermedio. Entradas no finitas → todos vacíos.
 */
export function stressToHearts(stressIndex: number, total = 5): Heart[] {
  const stress = Number.isFinite(stressIndex)
    ? Math.min(100, Math.max(0, stressIndex))
    : 100;
  const calm = 100 - stress;
  const step = 100 / total;
  const full = Math.floor(calm / step);
  const rem = calm - full * step;
  const half = rem >= step / 2 ? 1 : 0;
  const hearts: Heart[] = [];
  for (let i = 0; i < total; i++) {
    if (i < full) hearts.push('full');
    else if (i === full && half) hearts.push('half');
    else hearts.push('empty');
  }
  return hearts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx jest stress-hearts.util.spec -i`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/simulator/stress-hearts.util.ts frontend/src/app/features/simulator/stress-hearts.util.spec.ts
git commit -m "feat(game): pure stress-to-hearts util for HUD

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Tema scoped oscuro-glass morado en `simulation-play`

**Files:**
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts` (bloque `styles`)

- [ ] **Step 1: Repuntar las variables y el fondo de `.game-container`**

Reemplazar el bloque de vars + background actual:

```css
    .game-container {
      --sim-blue: #005282;
      --sim-blue-deep: #003b63;
      --sim-purple: #6750a4;
      --sim-green: #4a7c59;
      --sim-orange: #b86b1e;
      --sim-border: rgba(0, 82, 130, 0.16);
      --sim-pixel-shadow: 6px 6px 0 rgba(0, 82, 130, 0.08);
      position: fixed;
      inset: 0;
      overflow: hidden;
      color: #101820;
      background:
        linear-gradient(90deg, rgba(0,82,130,.05) 1px, transparent 1px) 0 0 / 24px 24px,
        linear-gradient(rgba(0,82,130,.05) 1px, transparent 1px) 0 0 / 24px 24px,
        linear-gradient(180deg, #f8fbfd 0%, #edf4f8 100%);
    }
```

por:

```css
    .game-container {
      --sim-purple: #7C4DFF;
      --sim-lavender: #B69CFF;
      --sim-blue: #6CC0C7;
      --sim-blue-deep: #B69CFF;
      --sim-green: #6EC67A;
      --sim-orange: #F5B84B;
      --sim-red: #E25A4F;
      --sim-ink: #F4F7FB;
      --sim-ink-soft: rgba(244,247,251,.74);
      --sim-ink-mute: rgba(244,247,251,.5);
      --sim-surface: rgba(27,33,51,.72);
      --sim-surface-2: rgba(18,24,42,.6);
      --sim-border: rgba(182,156,255,.22);
      --sim-glow: 0 18px 48px -28px rgba(124,77,255,.6);
      --sim-pixel-shadow: 0 18px 48px -30px rgba(124,77,255,.5);
      position: fixed;
      inset: 0;
      overflow: hidden;
      color: var(--sim-ink);
      background:
        linear-gradient(90deg, rgba(124,77,255,.06) 1px, transparent 1px) 0 0 / 24px 24px,
        linear-gradient(rgba(124,77,255,.06) 1px, transparent 1px) 0 0 / 24px 24px,
        linear-gradient(180deg, #111827 0%, #0e1322 100%);
    }
```

- [ ] **Step 2: Panel base, títulos y textos**

Reemplazar `.pixel-panel`:

```css
    .pixel-panel {
      background: rgba(255,255,255,.94);
      border: 2px solid var(--sim-border);
      border-radius: 20px;
      box-shadow: var(--sim-pixel-shadow);
    }
```

por:

```css
    .pixel-panel {
      background: var(--sim-surface);
      backdrop-filter: blur(18px) saturate(125%);
      border: 1px solid var(--sim-border);
      border-radius: 20px;
      box-shadow: var(--sim-glow);
    }
```

Reemplazar el color de `.pixel-kicker, .pixel-section-title` (`color: var(--sim-blue-deep);` dentro de ese selector) por `color: var(--sim-lavender);`.

Reemplazar `.simulator-hero h1` `color: var(--sim-blue-deep);` por `color: var(--sim-ink);`.

Reemplazar el bloque de párrafo del hero:

```css
    .simulator-hero p:not(.pixel-kicker):not(.progress-label) {
      margin: 0;
      color: #596b78;
      font-size: .88rem;
      line-height: 1.45;
    }
```

por (solo cambia el color):

```css
    .simulator-hero p:not(.pixel-kicker):not(.progress-label) {
      margin: 0;
      color: var(--sim-ink-soft);
      font-size: .88rem;
      line-height: 1.45;
    }
```

- [ ] **Step 3: Badges, chips y marca**

Reemplazar el bloque base `.pixel-badge, .pixel-chip`:

```css
    .pixel-badge,
    .pixel-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 30px;
      padding: 5px 10px;
      border: 1px solid var(--sim-border);
      border-radius: 999px;
      background: #fff;
      color: var(--sim-blue-deep);
      font-size: .74rem;
      font-weight: 800;
      line-height: 1.2;
    }
```

por (cambia `background` y `color`):

```css
    .pixel-badge,
    .pixel-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 30px;
      padding: 5px 10px;
      border: 1px solid var(--sim-border);
      border-radius: 999px;
      background: var(--sim-surface-2);
      color: var(--sim-lavender);
      font-size: .74rem;
      font-weight: 800;
      line-height: 1.2;
    }
```

Reemplazar las variantes:

```css
    .pixel-badge--purple { color: var(--sim-purple); border-color: rgba(103,80,164,.24); background: rgba(103,80,164,.08); }
    .pixel-badge--blue { color: var(--sim-blue); border-color: rgba(0,82,130,.18); background: rgba(0,82,130,.07); }
    .pixel-badge--green,
    .pixel-chip--green { color: var(--sim-green); border-color: rgba(74,124,89,.24); background: rgba(74,124,89,.09); }
    .pixel-badge--neutral { color: #647480; background: #f4f7f9; }
    .pixel-chip--orange { color: var(--sim-orange); border-color: rgba(184,107,30,.28); background: rgba(184,107,30,.1); }
```

por:

```css
    .pixel-badge--purple { color: #d6c6ff; border-color: rgba(124,77,255,.45); background: rgba(124,77,255,.16); }
    .pixel-badge--blue { color: #bfeef1; border-color: rgba(108,192,199,.4); background: rgba(108,192,199,.14); }
    .pixel-badge--green,
    .pixel-chip--green { color: #b7ecc0; border-color: rgba(110,198,122,.4); background: rgba(110,198,122,.14); }
    .pixel-badge--neutral { color: var(--sim-ink-soft); border-color: var(--sim-border); background: var(--sim-surface-2); }
    .pixel-chip--orange { color: #f7d79a; border-color: rgba(245,184,75,.42); background: rgba(245,184,75,.15); }
```

- [ ] **Step 4: Botones, progreso, game-layer**

Reemplazar `.pixel-button` (cambia border/background/color/box-shadow):

```css
    .pixel-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-height: 40px;
      padding: 8px 13px;
      border: 2px solid rgba(0,82,130,.2);
      border-radius: 12px;
      background: #fff;
      color: var(--sim-blue-deep);
      font-weight: 900;
      box-shadow: 4px 4px 0 rgba(0,82,130,.08);
      cursor: pointer;
    }
```

por:

```css
    .pixel-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-height: 40px;
      padding: 8px 13px;
      border: 1px solid rgba(182,156,255,.4);
      border-radius: 12px;
      background: rgba(124,77,255,.16);
      color: #e7ddff;
      font-weight: 900;
      box-shadow: var(--sim-glow);
      cursor: pointer;
    }
```

Reemplazar `.pixel-icon-button` (border/background/color):

```css
    .pixel-icon-button {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border: 2px solid rgba(0,82,130,.16);
      border-radius: 10px;
      background: #fff;
      color: var(--sim-blue-deep);
      cursor: pointer;
    }
```

por:

```css
    .pixel-icon-button {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(182,156,255,.35);
      border-radius: 10px;
      background: rgba(124,77,255,.14);
      color: var(--sim-lavender);
      cursor: pointer;
    }
```

Reemplazar `.progress-segment` base y `.progress-label` color:

```css
    .progress-segment {
      height: 8px;
      border-radius: 3px;
      background: #dce8ef;
      border: 1px solid rgba(0,82,130,.1);
    }
```

por:

```css
    .progress-segment {
      height: 8px;
      border-radius: 3px;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(182,156,255,.16);
    }
```

`.progress-segment--filled` ya usa `var(--sim-purple), var(--sim-green)` → con la nueva paleta queda morado→verde (OK). Cambiar `.progress-label` `color: #60717d;` por `color: var(--sim-ink-mute);`.

Reemplazar `.game-layer` (`border` y `background`) y `.world-skeleton` (`background`):

```css
      border: 2px solid rgba(0,82,130,.12);
      border-radius: 20px;
      box-shadow: var(--sim-pixel-shadow);
      background: #dfeaf0;
```
(dentro de `.game-layer`) por:
```css
      border: 1px solid rgba(182,156,255,.18);
      border-radius: 20px;
      box-shadow: var(--sim-glow);
      background: #0e1322;
```
y en `.world-skeleton` cambiar `background: #dfeaf0;` por `background: #0e1322;`.

- [ ] **Step 5: Paneles de cuerpo y notas (texto + superficies)**

Reemplazar el bloque de textos de panel:

```css
    .scenario-panel p:not(.pixel-section-title),
    .reflection-box p,
    .timeline-empty,
    .support-resources li {
      margin: 0;
      color: #536673;
      font-size: .84rem;
      line-height: 1.55;
    }
```
por (solo color):
```css
    .scenario-panel p:not(.pixel-section-title),
    .reflection-box p,
    .timeline-empty,
    .support-resources li {
      margin: 0;
      color: var(--sim-ink-soft);
      font-size: .84rem;
      line-height: 1.55;
    }
```

Cambiar `.scenario-panel h2` `color: var(--sim-blue-deep);` por `color: var(--sim-ink);`.
Cambiar `.case-timeline li` `color: #394d5b;` por `color: var(--sim-ink-soft);`.

Reemplazar el bloque `.ethic-note, .reflection-box, .simulator-empty` (superficie ámbar clara) por glass:

```css
    .ethic-note,
    .reflection-box,
    .simulator-empty {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 10px;
      padding: 12px;
      border: 1px solid rgba(184,107,30,.22);
      border-radius: 14px;
      background: rgba(184,107,30,.08);
    }
```
por:
```css
    .ethic-note,
    .reflection-box,
    .simulator-empty {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 10px;
      padding: 12px;
      border: 1px solid rgba(245,184,75,.3);
      border-radius: 14px;
      background: rgba(245,184,75,.1);
    }
```

Cambiar `.note-mark` (`color: var(--sim-orange); background: rgba(255,255,255,.34);`) → `color: var(--sim-orange); background: rgba(255,255,255,.08);`.
Cambiar `.ethic-note strong, .reflection-box strong` `color: #253847;` → `color: var(--sim-ink);`.
Cambiar `.ethic-note p` `color: #5f4a36;` → `color: #f0d9a8;`.
Reemplazar `.reflection-box { ... border-color: rgba(103,80,164,.22); background: rgba(103,80,164,.07); }` por `border-color: rgba(124,77,255,.32); background: rgba(124,77,255,.12);`.
Reemplazar `.simulator-empty--compact { ... border-color: rgba(0,82,130,.16); background: #f5f9fb; }` por `border-color: var(--sim-border); background: var(--sim-surface-2);`.

- [ ] **Step 6: Alinear acentos teal→lavanda en overlays ya oscuros**

En los selectores siguientes, reemplazar el teal por lavanda/morado (mismo alpha):
- `.proximity-hint` `border: 1px solid rgba(79,163,165,.3);` → `rgba(182,156,255,.3)`; `.proximity-hint__body strong { color: #9dc0e8; }` → `color: #cdbcff;`; `.proximity-hint__action { color: rgba(79,163,165,.85); }` → `color: rgba(182,156,255,.9);`; `.proximity-hint kbd` teal → `rgba(124,77,255,.22)/.35` y `color: #c9b8ff;`.
- `.journal-toggle` borde/color teal → lavanda; `.journal-toggle--active` → lavanda.
- `.end-state-overlay mat-icon { background: rgba(79,163,165,.14); color: #4fa3a5; }` → `background: rgba(124,77,255,.16); color: var(--sim-lavender);`.
- `.report-grid span { color: #4fa3a5; }` → `color: var(--sim-lavender);`.

(Los rojos de `.safe-exit-btn`/`.action-toast`/`.stress-vignette` se mantienen — son semánticos de riesgo.)

- [ ] **Step 7: Verify build**

Run: `cd frontend && npm run build`
Expected: build OK.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/features/simulator/simulation-play.component.ts
git commit -m "feat(game): dark liquid-glass purple SIEP theme for game shell

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Corazones de estrés + marca SIEP en `simulation-hud`

**Files:**
- Modify: `frontend/src/app/features/simulator/simulation-hud.component.ts`

- [ ] **Step 1: Import util + computed**

Tras los imports existentes añadir:
```ts
import { Heart, stressToHearts } from './stress-hearts.util';
```
En la clase, tras `stressTier`, añadir:
```ts
  readonly hearts = computed<Heart[]>(() => stressToHearts(this.attempt()?.stressIndex ?? 0));
```

- [ ] **Step 2: Marca SIEP en el strip (template)**

En el template, justo después de `<div class="hud-strip">`, antes de `<div class="hud-zone hud-zone--vitals">`, insertar:

```html
          <div class="hud-brand" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="brand-glyph" width="20" height="20">
              <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1.8 5.4A3 3 0 0 0 6 17a3 3 0 0 0 3 3V3z" fill="currentColor" opacity=".85"/>
              <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1.8 5.4A3 3 0 0 1 18 17a3 3 0 0 1-3 3V3z" fill="currentColor" opacity=".55"/>
              <circle cx="9" cy="9" r="1.1" fill="#0e1322"/>
              <circle cx="12" cy="13" r="1.1" fill="#0e1322"/>
              <circle cx="15" cy="9" r="1.1" fill="#0e1322"/>
            </svg>
            <span class="brand-word">SIEP</span>
          </div>
```

- [ ] **Step 3: Reemplazar la barra de estrés por corazones (template)**

Reemplazar el bloque `.hud-stress` actual:

```html
            <div class="hud-stress"
              [class.hud-stress--pulse]="stressPulse()"
              role="meter"
              [attr.aria-valuenow]="game.stressIndex" aria-valuemin="0" aria-valuemax="100"
              [attr.aria-label]="'Estado de estrés del caso: ' + game.stressIndex + '%. ' + stressLabel()">
              <span class="stress-pct" [style.color]="stressColor()">{{ game.stressIndex }}%</span>
              <div class="stress-track" aria-hidden="true">
                <span [style.width.%]="game.stressIndex" [style.background]="stressMeterGradient()"></span>
              </div>
            </div>
```

por:

```html
            <div class="hud-stress"
              [class.hud-stress--pulse]="stressPulse()"
              role="meter"
              [attr.aria-valuenow]="game.stressIndex" aria-valuemin="0" aria-valuemax="100"
              [attr.aria-label]="'Estado de estrés del caso: ' + game.stressIndex + '%. ' + stressLabel()">
              <div class="hud-hearts" aria-hidden="true" [style.color]="stressColor()">
                @for (h of hearts(); track $index) {
                  <mat-icon class="heart heart--{{ h }}">{{ h === 'empty' ? 'favorite_border' : 'favorite' }}</mat-icon>
                }
              </div>
              <span class="stress-pct" [style.color]="stressColor()" aria-hidden="true">{{ game.stressIndex }}%</span>
            </div>
```

- [ ] **Step 4: Estilos de marca y corazones**

En el bloque `styles`, tras `.hud-stress--pulse { animation: stress-pulse .6s ease-out; }`, añadir:

```css
    .hud-brand { display: flex; align-items: center; gap: 6px; flex-shrink: 0; padding-right: 4px; margin-right: 2px; border-right: 1px solid rgba(182,156,255,.18); }
    .brand-glyph { color: #B69CFF; flex-shrink: 0; }
    .brand-word { font-family: 'Poppins', system-ui, sans-serif; font-weight: 900; font-size: .82rem; letter-spacing: .12em; color: #E7DDFF; }
    .hud-hearts { display: inline-flex; align-items: center; gap: 1px; }
    .hud-hearts .heart { font-size: 15px; width: 15px; height: 15px; }
    .heart--empty { opacity: .42; }
    .heart--half { opacity: .7; }
    @media (max-width: 640px) { .brand-word { display: none; } }
```

- [ ] **Step 5: Acento HUD teal→lavanda**

En el bloque `styles`, reemplazar las referencias de acento teal por lavanda:
- `.hud-score mat-icon { color: var(--siep-blue-soft); ... }` → `color: #B69CFF;`
- `.hud-scene mat-icon { color: var(--siep-blue-soft); ... }` → `color: #B69CFF;`
- `.hud-objective-line mat-icon { color: var(--siep-blue-soft); ... }` → `color: #B69CFF;`
- `.hud-objective-line strong { color: rgba(157,192,232,.9); ... }` → `color: #cdbcff;`
- `.hud-shell { ... border: 1px solid rgba(79,163,165,.18); ... }` → `border: 1px solid rgba(182,156,255,.2);`
- `.hud-objective-line { ... border-top: 1px solid rgba(79,163,165,.14); background: rgba(79,163,165,.06); }` → `border-top: 1px solid rgba(182,156,255,.16); background: rgba(124,77,255,.08);`
- `.hud-status--live .status-dot { background: var(--siep-blue-soft); ... }` → `background: #B69CFF;`

- [ ] **Step 6: Verify build**

Run: `cd frontend && npm run build`
Expected: OK.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/simulator/simulation-hud.component.ts
git commit -m "feat(game): stress hearts + SIEP brand mark in HUD, lavender accent

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Dock de herramientas — badge numérico + glass morado

**Files:**
- Modify: `frontend/src/app/features/simulator/tool-inventory.component.ts`

- [ ] **Step 1: Índice + badge (template)**

Cambiar `@for (tool of tools(); track tool.code) {` por `@for (tool of tools(); track tool.code; let i = $index) {`.
Dentro del `<button>`, tras `<mat-icon ...>`, añadir:
```html
          <span class="tool-key" aria-hidden="true">{{ i + 1 }}</span>
```

- [ ] **Step 2: Estilos glass morado + badge**

Reemplazar los acentos teal del bloque `styles`:
- `.tool-btn { ... border: 1px solid rgba(79,163,165,.28); ... color: rgba(79,163,165,.55); ... }` → `border: 1px solid rgba(182,156,255,.28);` y `color: rgba(182,156,255,.6);`
- `.tool-btn--owned { border-color: rgba(79,163,165,.5); color: #4fa3a5; }` → `border-color: rgba(182,156,255,.55); color: #B69CFF;`
- `.tool-btn--owned:hover { border-color: rgba(79,163,165,.85); background: rgba(79,163,165,.14); box-shadow: 0 0 12px -4px rgba(79,163,165,.35); }` → `border-color: rgba(182,156,255,.9); background: rgba(124,77,255,.18); box-shadow: 0 0 14px -4px rgba(124,77,255,.5);`
- `:focus-visible { outline: 2px solid rgba(79,163,165,.7); ... }` → `outline: 2px solid rgba(182,156,255,.7);`

Tras `.tool-code { ... }` añadir:
```css
    .tool-key {
      position: absolute;
      top: 2px;
      left: 4px;
      font-size: .56rem;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 900;
      color: #cdbcff;
      opacity: .85;
      pointer-events: none;
    }
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/simulator/tool-inventory.component.ts
git commit -m "feat(game): tool dock number badges + purple glass accent

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Verificación final + smoke

- [ ] **Step 1: Full jest suite**

Run: `cd frontend && npm test`
Expected: verde, incluida `stress-hearts.util.spec`.

- [ ] **Step 2: Production build**

Run: `cd frontend && npm run build`
Expected: OK.

- [ ] **Step 3: Smoke en vivo (Brave)**

1. Stack arriba (db/django/ng serve). Login estudiante; abrir `/portal/simulador/1`; continuar intento.
2. Capturar: paneles oscuro-glass morados, corazones de estrés, marca SIEP, dock con badges numéricos.
3. Comparar contra `docs/iimagen_todo_.png` (§5/§9/§22) y verificar legibilidad (contraste).
4. Navegar a `/portal/dashboard` y confirmar que el **portal claro NO cambió** (el tema es scoped al juego).

- [ ] **Step 4: Final commit (si hubo ajustes del smoke)**

```bash
git add -A
git commit -m "chore(game): HUD liquid-glass verified vs mockups

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Luego: `superpowers:finishing-a-development-branch` (merge a master).
