# 12 — Fallos de flujo del juego — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Estado:** DONE
- **Commit base:** `02bbfe9` (rama `feat/ui-mes`). Ejecutar después del plan 11: ambos tocan `game-world.component.ts`.
- **Severidad:** ALTA (Esc pausa la partida sin querer; en tabletas no se puede caminar; la carga es una pantalla negra muda)
- **Categoría:** Flujo / accesibilidad / estados de carga
- **Alcance estimado:** 2 utils nuevos, 2 componentes; 5 specs nuevos

**Goal:** Que Esc cierre lo que el jugador tiene abierto en vez de sacarlo de la partida, que los controles táctiles aparezcan en cualquier pantalla táctil y permitan caminar manteniendo pulsado, y que la carga de la escena muestre su progreso real y ofrezca reintentar si falla algo esencial.

**Architecture:** Son tres arreglos independientes:
1. **Esc con Ajustes abierto:** el menú de Ajustes vive en `SimulationHudComponent` (señal interna `settingsOpen`). El manejador global `window:keydown` de `SimulationPlayComponent` no sabe que el menú existe. Con Ajustes abierto, Esc pasa de largo y llega a `safeExit()`, que pausa el intento en el backend. El manejador global ya respeta las teclas consumidas (`if (event.defaultPrevented) return;`), así que basta con que el HUD escuche Esc en `document` (que recibe el evento antes que `window`), cierre el menú y consuma la tecla. De paso: clic o toque fuera cierra el menú, el foco vuelve al engranaje y el botón anuncia `aria-expanded`.
2. **Controles táctiles:** hoy se muestran por ancho (`max-width: 900px`), así que aparecen en ventanas de escritorio estrechas y faltan en tabletas en horizontal. Además, cada toque da un paso de ~20 px, y cruzar una sala exige decenas de toques. Se muestran por tipo de puntero (`pointer: coarse`). Al tocar, el jugador da el mismo paso de ~20 px de siempre. Si sigue apretando más de 200 ms, camina de forma continua con el mismo código de movimiento que WASD hasta soltar.
3. **Carga de la escena:** Phaser precarga cientos de archivos (tilesets, mapas, hojas de personajes, audio) y durante ese tiempo el lienzo queda en negro. `preload()` descarta todos los errores. La escena informa ahora su progreso y los fallos esenciales (mapas Tiled y tilesets, que existen en disco y sin los cuales la sala cae a paneles planos). `GameWorldComponent` muestra una capa de carga con porcentaje, que aparece solo si la carga pasa de 300 ms. Si falla algo esencial, muestra un aviso no bloqueante con «Reintentar», que reinicia Phaser, y «Seguir así».

**Tech Stack:** Angular 21 (signals, `viewChild`, `HostListener`), Phaser 3.90, Jest 30 (jsdom, sin zone.js), Playwright.

**Spec:** Auditoría del 2026-09-29, tabla «Juego» (Esc con Ajustes, controles táctiles por ancho, carga muda) y prioridad del mes n.º 12. Este plan es autocontenido.

## Global Constraints

- Todas las rutas son relativas a la raíz del repo.
- No añadir dependencias.
- **Coordinación con otra sesión:** la base ya incluye el trabajo de la otra sesión en `game-world.component.ts` (PR #10, `9b9b8ec`: sub-pasos en `update()` y `data-player-x/y` para el e2e), y esa sesión puede seguir cambiándolo. Antes de las tareas 2 y 3, ejecutar `git fetch -q origin && git log --oneline 9b9b8ec..origin/feat/personaje-v1-idle-walk -- frontend/src/app/features/simulator/game-world.component.ts`. Si muestra algún commit, DETENERSE: el controlador debe fusionar esa rama en `feat/ui-mes` antes de seguir.
- El paso de un toque sigue siendo exactamente un `nudge()` (4 sub-pasos, ~20 px): `moveBy` en `e2e/support/siep-flow.ts` toca y relee `data-player-x/y` hasta quedar a 10 px del objetivo, y cuenta como bloqueo tres toques seguidos sin avance.
- Los atributos `data-world-ready`, `data-rendered-map-key` y `data-rendered-scenario-key` del host de Phaser no cambian: son el contrato del e2e.
- No cambiar el comportamiento de Esc cuando no hay nada abierto: con el juego libre, Esc sigue pidiendo la salida segura.
- Si un fragmento «Actual» no coincide con el archivo (drift), DETENERSE y reportar.
- Textos visibles en español con tildes. Commits en español `tipo(ámbito): descripción`.
- El árbol de trabajo usa CRLF (git `autocrlf=true`): en las regex de los specs de contrato, usar `\s*` o `\s+` entre líneas, nunca `\n` literal.

## Review Focus

- Con Ajustes abierto, un solo Esc cierra el menú, devuelve el foco al engranaje y la partida sigue en curso. Un segundo Esc, ya con todo cerrado, sí pide la salida segura.
- En una tableta en horizontal (≥ 1024 px, táctil), aparecen los controles. En una ventana de escritorio de 800 px con ratón, no.
- Mantener apretada una flecha camina de forma continua y se detiene al levantar el dedo, también si el dedo se desliza fuera del botón. Si se abre un diálogo mientras se aprieta, el jugador no sigue caminando detrás del diálogo.
- Con la caché caliente, la capa de carga no parpadea: si la escena carga en menos de 300 ms, no llega a verse.
- Si un mapa no carga, la sala se ve con paneles planos y aparece el aviso con «Reintentar». Reintentar vuelve a cargar sin recargar la página ni perder el intento.

## Problema

`frontend/src/app/features/simulator/simulation-hud.component.ts` (líneas 112-151), actual:

```html
              <button type="button" class="hud-action" [class.hud-action--active]="settingsOpen()"
                (click)="settingsOpen.set(!settingsOpen())"
                aria-label="Abrir ajustes del juego" title="Ajustes">
                <mat-icon aria-hidden="true">settings</mat-icon>
              </button>
              @if (settingsOpen()) {
                <div class="settings-menu" role="dialog" aria-modal="false" aria-labelledby="game-settings-title">
                  <div class="settings-menu__header">
                    <strong id="game-settings-title">Ajustes</strong>
                    <button type="button" aria-label="Cerrar ajustes" (click)="settingsOpen.set(false)">
```

No hay manejo de teclado ni de clic fuera. `simulation-play.component.ts` (~líneas 1155-1193):

```ts
  @HostListener('window:keydown', ['$event'])
  handleGlobalInteraction(event: KeyboardEvent) {
    // Si otro handler ya consumió la tecla (p. ej. el panel de diálogo cierra
    // con Escape en document:keydown), no reinterpretarla aquí: sin esta
    // guarda, un solo Escape cerraba el diálogo Y disparaba la salida segura.
    if (event.defaultPrevented) return;
    …
    if (event.key === 'Escape') {
      if (this.journalOpen()) { event.preventDefault(); this.journalOpen.set(false); return; }
      if (this.dialogue())    { event.preventDefault(); this.closeDialogue(); return; }
      const g = this.attempt();
      if (g?.status === 'IN_PROGRESS' && !this.busy()) { event.preventDefault(); this.safeExit(); }
      return;
    }
```

`frontend/src/app/features/simulator/game-world.component.ts`, plantilla (~2143-2149) y estilos (~2158-2171):

```html
    <div class="touch-controls" aria-label="Controles táctiles">
      <button type="button" class="psy-icon-button touch-btn" aria-label="Mover arriba"    (click)="nudge('up')"><mat-icon>keyboard_arrow_up</mat-icon></button>
      …
    </div>
```

```css
    @media (max-width: 900px) { .touch-controls { display: grid; } }
```

Mismo archivo, `preload()` (~207-211 y ~327):

```ts
    this.load.on('loaderror', (_file: Phaser.Loader.File) => {
      // Missing asset — fallback rendering used
    });
    …
    this.load.once('complete', () => { this.assetsLoaded = true; });
```

Mientras tanto, `simulation-play.component.ts` solo muestra una barra indeterminada arriba (`loading-overlay`, línea ~68), ligada a las llamadas al backend y no a Phaser.

---

### Task 1: Esc y clic fuera cierran Ajustes sin sacar al jugador de la partida

**Files:**
- Modify: `frontend/src/app/features/simulator/simulation-hud.component.ts` (import línea 2; plantilla 112-121; clase ~409-414)
- Create: `frontend/src/app/features/simulator/simulation-hud.settings.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: en `SimulationHudComponent`, `closeSettings(restoreFocus = true): void`, `onDocumentKeydown(event: KeyboardEvent): void` y `onDocumentPointerDown(event: Event): void`. Sin cambios en inputs ni outputs.

- [ ] **Step 1: Escribir el spec que falla**

Crear `frontend/src/app/features/simulator/simulation-hud.settings.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SimulationHudComponent } from './simulation-hud.component';

const hudSource = readFileSync(join(__dirname, 'simulation-hud.component.ts'), 'utf-8');
const playSource = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

function pressEscape(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

describe('HUD: menú de Ajustes', () => {
  let fixture: ComponentFixture<SimulationHudComponent>;
  let hud: SimulationHudComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SimulationHudComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(SimulationHudComponent);
    fixture.detectChanges();
    hud = fixture.componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('Esc cierra Ajustes y consume la tecla para que no dispare la salida segura', () => {
    hud.settingsOpen.set(true);
    const event = pressEscape();
    expect(hud.settingsOpen()).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it('con Ajustes cerrado, Esc queda libre para el juego', () => {
    const event = pressEscape();
    expect(event.defaultPrevented).toBe(false);
  });

  it('un toque dentro del HUD no cierra Ajustes; uno fuera sí', () => {
    hud.settingsOpen.set(true);
    (fixture.nativeElement as HTMLElement).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(hud.settingsOpen()).toBe(true);
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(hud.settingsOpen()).toBe(false);
  });

  it('el engranaje anuncia si el menú está abierto y recibe el foco al cerrar', () => {
    expect(hudSource).toContain('#settingsTrigger');
    expect(hudSource).toContain('[attr.aria-expanded]="settingsOpen()"');
    expect(hudSource).toContain('[attr.aria-controls]="settingsOpen() ? \'game-settings-menu\' : null"');
    expect(hudSource).toContain('id="game-settings-menu"');
    expect(hudSource).toContain('aria-label="Cerrar ajustes" (click)="closeSettings()"');
    expect(hudSource).toMatch(/if \(restoreFocus\) this\.settingsTrigger\(\)\?\.nativeElement\.focus\(\);/);
  });

  it('el manejador global de la partida respeta las teclas ya consumidas', () => {
    expect(playSource).toMatch(/handleGlobalInteraction\(event: KeyboardEvent\) \{[\s\S]{0,400}?if \(event\.defaultPrevented\) return;/);
  });
});
```

- [ ] **Step 2: Ejecutar el spec y verlo fallar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/simulation-hud.settings.spec.ts`
Expected: FAIL en los cuatro primeros `it` (el quinto ya pasa: es la guarda que este plan aprovecha).

- [ ] **Step 3: Importar lo necesario**

En `simulation-hud.component.ts`, reemplazar la línea 2:

```ts
import { Component, computed, input, output, signal } from '@angular/core';
```

por:

```ts
import { Component, ElementRef, HostListener, computed, inject, input, output, signal, viewChild } from '@angular/core';
```

- [ ] **Step 4: Cambiar la plantilla**

Reemplazar:

```html
              <button type="button" class="hud-action" [class.hud-action--active]="settingsOpen()"
                (click)="settingsOpen.set(!settingsOpen())"
                aria-label="Abrir ajustes del juego" title="Ajustes">
                <mat-icon aria-hidden="true">settings</mat-icon>
              </button>
              @if (settingsOpen()) {
                <div class="settings-menu" role="dialog" aria-modal="false" aria-labelledby="game-settings-title">
                  <div class="settings-menu__header">
                    <strong id="game-settings-title">Ajustes</strong>
                    <button type="button" aria-label="Cerrar ajustes" (click)="settingsOpen.set(false)">
```

por:

```html
              <button #settingsTrigger type="button" class="hud-action" [class.hud-action--active]="settingsOpen()"
                (click)="settingsOpen.set(!settingsOpen())"
                aria-label="Abrir ajustes del juego" title="Ajustes"
                [attr.aria-expanded]="settingsOpen()"
                [attr.aria-controls]="settingsOpen() ? 'game-settings-menu' : null">
                <mat-icon aria-hidden="true">settings</mat-icon>
              </button>
              @if (settingsOpen()) {
                <div id="game-settings-menu" class="settings-menu" role="dialog" aria-modal="false" aria-labelledby="game-settings-title">
                  <div class="settings-menu__header">
                    <strong id="game-settings-title">Ajustes</strong>
                    <button type="button" aria-label="Cerrar ajustes" (click)="closeSettings()">
```

(`aria-controls` solo existe con el menú abierto: si apuntara a un id ausente, axe lo marcaría como referencia rota.)

- [ ] **Step 5: Añadir la lógica**

Después de la línea `  readonly toggleReduceMotion = output<void>();`, añadir:

```ts

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly settingsTrigger = viewChild<ElementRef<HTMLButtonElement>>('settingsTrigger');

  /** Cierra Ajustes; por defecto devuelve el foco al engranaje (el botón «x» desaparece). */
  closeSettings(restoreFocus = true): void {
    if (!this.settingsOpen()) return;
    this.settingsOpen.set(false);
    if (restoreFocus) this.settingsTrigger()?.nativeElement.focus();
  }

  /** `document` recibe la tecla antes que el `window:keydown` de la partida. Consumirla
   *  evita que ese manejador la tome como «salida segura» y pause el intento. */
  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.defaultPrevented || !this.settingsOpen()) return;
    event.preventDefault();
    this.closeSettings();
  }

  /** Un toque o clic fuera del HUD cierra el menú sin robar el foco. */
  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: Event): void {
    if (!this.settingsOpen()) return;
    if (this.host.nativeElement.contains(event.target as Node | null)) return;
    this.closeSettings(false);
  }
```

- [ ] **Step 6: Ejecutar el spec y verlo pasar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/simulation-hud.settings.spec.ts src/app/features/simulator/simulation-play.consent-gate.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/simulator/simulation-hud.component.ts frontend/src/app/features/simulator/simulation-hud.settings.spec.ts
git commit -m "fix(juego): Esc y clic fuera cierran Ajustes sin pausar la partida"
```

---

### Task 2: Controles táctiles por tipo de puntero, con mantener pulsado para caminar

**Files:**
- Create: `frontend/src/app/features/simulator/touch-hold.util.ts`
- Create: `frontend/src/app/features/simulator/touch-hold.util.spec.ts`
- Create: `frontend/src/app/features/simulator/game-world.touch.contract.spec.ts`
- Modify: `frontend/src/app/features/simulator/game-world.component.ts` (import; campos de la escena; `setMotionPaused` ~442; `update()` ~357-363; plantilla ~2143-2149; estilos ~2169-2171; métodos del componente ~2231)

**Interfaces:**
- Consumes: `PlayerDirection` y `PlayerMotionInput` de `player-motion.util.ts` (sin tocar ese archivo).
- Produces: `TOUCH_HOLD_DELAY_MS = 200`, `heldInput(input: PlayerMotionInput, held: PlayerDirection | null, heldForMs: number): PlayerMotionInput`. En la escena: `setHeldDirection(direction: PlayerDirection | null): void`. En `GameWorldComponent`: `holdDirection(event: PointerEvent, direction: PlayerDirection): void`, `releaseDirection(): void`, `keyboardNudge(event: MouseEvent, direction: PlayerDirection): void`.

- [ ] **Step 1: Comprobar que no hay deriva con la otra sesión**

Run: `git fetch -q origin && git log --oneline 9b9b8ec..origin/feat/personaje-v1-idle-walk -- frontend/src/app/features/simulator/game-world.component.ts`
Expected: salida vacía. Si hay commits, DETENERSE y reportar.

- [ ] **Step 2: Escribir los specs que fallan**

Crear `frontend/src/app/features/simulator/touch-hold.util.spec.ts`:

```ts
import { PlayerMotionInput } from './player-motion.util';
import { TOUCH_HOLD_DELAY_MS, heldInput } from './touch-hold.util';

const idle: PlayerMotionInput = { left: false, right: false, up: false, down: false };

describe('heldInput', () => {
  it('espera 200 ms antes de caminar: un toque es solo el paso inicial', () => {
    expect(TOUCH_HOLD_DELAY_MS).toBe(200);
    expect(heldInput(idle, 'up', TOUCH_HOLD_DELAY_MS - 1)).toEqual(idle);
  });

  it('pasado el retardo, la dirección mantenida cuenta como tecla apretada', () => {
    expect(heldInput(idle, 'left', TOUCH_HOLD_DELAY_MS)).toEqual({ ...idle, left: true });
  });

  it('se suma al teclado sin anularlo', () => {
    const keyboard = { ...idle, down: true };
    expect(heldInput(keyboard, 'right', 1000)).toEqual({ ...idle, down: true, right: true });
  });

  it('sin dirección mantenida devuelve la entrada tal cual y nunca la muta', () => {
    const keyboard = { ...idle, up: true };
    expect(heldInput(keyboard, null, 5000)).toBe(keyboard);
    heldInput(keyboard, 'left', 5000);
    expect(keyboard).toEqual({ ...idle, up: true });
  });
});
```

Crear `frontend/src/app/features/simulator/game-world.touch.contract.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

describe('game-world: controles táctiles', () => {
  it('aparecen por tipo de puntero, no por ancho de ventana', () => {
    expect(source).toContain('@media (pointer: coarse) { .touch-controls { display: grid; } }');
    expect(source).not.toContain('@media (max-width: 900px) { .touch-controls');
  });

  it('cada flecha camina mientras se mantiene y el teclado conserva el paso único', () => {
    for (const dir of ['up', 'left', 'right', 'down']) {
      expect(source).toContain(`(pointerdown)="holdDirection($event, '${dir}')"`);
      expect(source).toContain(`(click)="keyboardNudge($event, '${dir}')"`);
    }
    expect(source.match(/\(pointerup\)="releaseDirection\(\)"/g) ?? []).toHaveLength(4);
    expect(source.match(/\(pointercancel\)="releaseDirection\(\)"/g) ?? []).toHaveLength(4);
    expect(source.match(/\(lostpointercapture\)="releaseDirection\(\)"/g) ?? []).toHaveLength(4);
  });

  it('la escena suma la dirección mantenida a la entrada de movimiento', () => {
    expect(source).toMatch(/const input: PlayerMotionInput = heldInput\(\{/);
    expect(source).toMatch(/\}, this\.heldDirection, this\.time\.now - this\.heldSince\);/);
  });

  it('un overlay que congela el mundo suelta la dirección mantenida', () => {
    expect(source).toMatch(/setMotionPaused\(paused: boolean\) \{\s*this\.motionPaused = paused;\s*if \(paused\) this\.setHeldDirection\(null\);/);
  });
});
```

- [ ] **Step 3: Ejecutar los specs y verlos fallar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/touch-hold.util.spec.ts src/app/features/simulator/game-world.touch.contract.spec.ts`
Expected: FAIL (módulo inexistente; contrato en rojo).

- [ ] **Step 4: Crear el util**

Crear `frontend/src/app/features/simulator/touch-hold.util.ts`:

```ts
import { PlayerDirection, PlayerMotionInput } from './player-motion.util';

/**
 * Tiempo que hay que mantener una flecha táctil para pasar del paso único
 * (nudge al tocar) a caminar de forma continua. Un toque normal dura menos.
 */
export const TOUCH_HOLD_DELAY_MS = 200;

/** Suma la flecha táctil mantenida a la entrada de teclado, sin mutarla. */
export function heldInput(
  input: PlayerMotionInput,
  held: PlayerDirection | null,
  heldForMs: number,
): PlayerMotionInput {
  if (!held || heldForMs < TOUCH_HOLD_DELAY_MS) return input;
  return { ...input, [held]: true };
}
```

- [ ] **Step 5: Conectar la escena**

En `game-world.component.ts`:

1. Después del bloque `import { ... } from './player-motion.util';`, añadir (si el plan 11 ya añadió el import de `position-emit.util`, ponerlo debajo):

```ts
import { heldInput } from './touch-hold.util';
```

2. Después de la línea `  private readonly INTERACTION_COOLDOWN_MS = 260;`, añadir:

```ts
  /** Flecha táctil apretada (null si no hay ninguna) y desde cuándo (reloj de la escena). */
  private heldDirection: PlayerDirection | null = null;
  private heldSince = 0;
```

3. Reemplazar:

```ts
  setMotionPaused(paused: boolean) { this.motionPaused = paused; }
```

por:

```ts
  setMotionPaused(paused: boolean) {
    this.motionPaused = paused;
    if (paused) this.setHeldDirection(null); // un overlay tapa los controles: no seguir caminando detrás
  }

  /** Flecha táctil apretada o soltada (null). La entrada de `update()` la suma pasado TOUCH_HOLD_DELAY_MS. */
  setHeldDirection(direction: PlayerDirection | null) {
    this.heldDirection = direction;
    // `boot()` y `ngOnChanges` pueden pausar antes de que Phaser arranque la escena (sin reloj aún).
    this.heldSince = direction && this.time ? this.time.now : 0;
  }
```

4. En `update()`, reemplazar:

```ts
    const input: PlayerMotionInput = {
      left:  this.cursors.left.isDown  || this.keys['A'].isDown,
      right: this.cursors.right.isDown || this.keys['D'].isDown,
      up:    this.cursors.up.isDown    || this.keys['W'].isDown,
      down:  this.cursors.down.isDown  || this.keys['S'].isDown,
    };
```

por:

```ts
    const input: PlayerMotionInput = heldInput({
      left:  this.cursors.left.isDown  || this.keys['A'].isDown,
      right: this.cursors.right.isDown || this.keys['D'].isDown,
      up:    this.cursors.up.isDown    || this.keys['W'].isDown,
      down:  this.cursors.down.isDown  || this.keys['S'].isDown,
    }, this.heldDirection, this.time.now - this.heldSince);
```

(Se envuelve el literal en vez de crear otra variable: cualquier código de `update()` que lea `input`, incluidos los sub-pasos de la otra sesión, verá la flecha mantenida.)

- [ ] **Step 6: Cambiar la plantilla y los estilos**

Reemplazar el bloque `touch-controls` completo:

```html
    <div class="touch-controls" aria-label="Controles táctiles">
      <button type="button" class="psy-icon-button touch-btn" aria-label="Mover arriba"    (click)="nudge('up')"><mat-icon>keyboard_arrow_up</mat-icon></button>
      <button type="button" class="psy-icon-button touch-btn" aria-label="Mover izquierda" (click)="nudge('left')"><mat-icon>keyboard_arrow_left</mat-icon></button>
      <button type="button" class="psy-button psy-button--glass touch-interact"            (click)="interactNearest()"><mat-icon>touch_app</mat-icon>Interactuar</button>
      <button type="button" class="psy-icon-button touch-btn" aria-label="Mover derecha"   (click)="nudge('right')"><mat-icon>keyboard_arrow_right</mat-icon></button>
      <button type="button" class="psy-icon-button touch-btn" aria-label="Mover abajo"     (click)="nudge('down')"><mat-icon>keyboard_arrow_down</mat-icon></button>
    </div>
```

por:

```html
    <div class="touch-controls" role="group" aria-label="Controles táctiles">
      <button type="button" class="psy-icon-button touch-btn" aria-label="Mover arriba"
        (pointerdown)="holdDirection($event, 'up')" (pointerup)="releaseDirection()"
        (pointercancel)="releaseDirection()" (lostpointercapture)="releaseDirection()"
        (contextmenu)="$event.preventDefault()"
        (click)="keyboardNudge($event, 'up')"><mat-icon>keyboard_arrow_up</mat-icon></button>
      <button type="button" class="psy-icon-button touch-btn" aria-label="Mover izquierda"
        (pointerdown)="holdDirection($event, 'left')" (pointerup)="releaseDirection()"
        (pointercancel)="releaseDirection()" (lostpointercapture)="releaseDirection()"
        (contextmenu)="$event.preventDefault()"
        (click)="keyboardNudge($event, 'left')"><mat-icon>keyboard_arrow_left</mat-icon></button>
      <button type="button" class="psy-button psy-button--glass touch-interact" (click)="interactNearest()"><mat-icon>touch_app</mat-icon>Interactuar</button>
      <button type="button" class="psy-icon-button touch-btn" aria-label="Mover derecha"
        (pointerdown)="holdDirection($event, 'right')" (pointerup)="releaseDirection()"
        (pointercancel)="releaseDirection()" (lostpointercapture)="releaseDirection()"
        (contextmenu)="$event.preventDefault()"
        (click)="keyboardNudge($event, 'right')"><mat-icon>keyboard_arrow_right</mat-icon></button>
      <button type="button" class="psy-icon-button touch-btn" aria-label="Mover abajo"
        (pointerdown)="holdDirection($event, 'down')" (pointerup)="releaseDirection()"
        (pointercancel)="releaseDirection()" (lostpointercapture)="releaseDirection()"
        (contextmenu)="$event.preventDefault()"
        (click)="keyboardNudge($event, 'down')"><mat-icon>keyboard_arrow_down</mat-icon></button>
    </div>
```

En los estilos, reemplazar:

```css
    .touch-btn { background: rgba(8,12,18,.7); border-color: rgba(79,163,165,.3); color: #4fa3a5; }
    .touch-interact { font-size: .82rem; }
    @media (max-width: 900px) { .touch-controls { display: grid; } }
```

por:

```css
    .touch-btn {
      background: rgba(8,12,18,.7); border-color: rgba(79,163,165,.3); color: #4fa3a5;
      /* Mantener pulsado no debe hacer scroll, zoom, seleccionar texto ni abrir el menú largo. */
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }
    .touch-interact { font-size: .82rem; }
    /* Por tipo de puntero: tabletas en horizontal sí; ventanas de escritorio estrechas no. */
    @media (pointer: coarse) { .touch-controls { display: grid; } }
```

- [ ] **Step 7: Añadir los métodos del componente**

En `GameWorldComponent`, reemplazar:

```ts
  nudge(direction: 'up' | 'down' | 'left' | 'right') { this.scene?.nudge(direction); }
```

por:

```ts
  nudge(direction: 'up' | 'down' | 'left' | 'right') { this.scene?.nudge(direction); }

  /** Toque: el paso de siempre al instante; si se mantiene, la escena camina hasta soltar. */
  holdDirection(event: PointerEvent, direction: PlayerDirection) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // Captura: si el dedo se desliza fuera del botón, el pointerup igual llega aquí.
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    this.scene?.nudge(direction);
    this.scene?.setHeldDirection(direction);
  }

  releaseDirection() { this.scene?.setHeldDirection(null); }

  /** Enter/Espacio sobre la flecha (click sin puntero, `detail === 0`): un paso. Los clics de
   *  puntero ya dieron su paso en pointerdown y no deben duplicarlo. */
  keyboardNudge(event: MouseEvent, direction: PlayerDirection) {
    if (event.detail === 0) this.nudge(direction);
  }
```

`PlayerDirection` ya está importado desde `./player-motion.util` en este archivo.

- [ ] **Step 8: Ejecutar los specs y verlos pasar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/touch-hold.util.spec.ts src/app/features/simulator/game-world.touch.contract.spec.ts src/app/features/simulator/player-motion.util.spec.ts`
Expected: PASS.

- [ ] **Step 9: Ejecutar los e2e táctiles**

Run: `npm run test:e2e -- vertical-quality full-case`
Expected: PASS en `mobile-390` y `mobile-412` (Playwright con `hasTouch: true` emula un puntero *coarse* en Chromium) y en los escritorios. Si en móvil falla porque no aparecen los controles («Mover arriba» no visible), DETENERSE y reportar: no volver a la regla por ancho.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/app/features/simulator/touch-hold.util.ts frontend/src/app/features/simulator/touch-hold.util.spec.ts frontend/src/app/features/simulator/game-world.touch.contract.spec.ts frontend/src/app/features/simulator/game-world.component.ts
git commit -m "feat(juego): controles táctiles en toda pantalla táctil y caminar manteniendo pulsado"
```

---

### Task 3: Carga de la escena con progreso real y reintento

**Files:**
- Create: `frontend/src/app/features/simulator/asset-criticality.util.ts`
- Create: `frontend/src/app/features/simulator/asset-criticality.util.spec.ts`
- Create: `frontend/src/app/features/simulator/game-world.loading.contract.spec.ts`
- Modify: `frontend/src/app/features/simulator/game-world.component.ts` (interfaz `WorldCallbacks` ~92-102; `preload()` ~207-211 y ~327; plantilla; estilos; señales y `boot()` del componente)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `CRITICAL_TILESET_KEYS`, `isCriticalAsset(key: string): boolean`. En `WorldCallbacks`: `onLoadProgress: (percent: number) => void` y `onLoadComplete: (criticalFailures: string[]) => void`. En `GameWorldComponent`: señales `loadPercent`, `assetsReady`, `criticalLoadFailed` y métodos `retryLoad(): void`, `dismissLoadWarning(): void`.

- [ ] **Step 1: Escribir los specs que fallan**

Crear `frontend/src/app/features/simulator/asset-criticality.util.spec.ts`:

```ts
import { CRITICAL_TILESET_KEYS, isCriticalAsset } from './asset-criticality.util';

describe('isCriticalAsset', () => {
  it('los mapas Tiled y los tres tilesets de Kenney son esenciales', () => {
    expect(isCriticalAsset('map-comisaria-sala-espera')).toBe(true);
    expect(CRITICAL_TILESET_KEYS).toEqual(['dungeon-img', 'town-img', 'rpg-img']);
    for (const key of CRITICAL_TILESET_KEYS) expect(isCriticalAsset(key)).toBe(true);
  });

  it('lo decorativo tiene respaldo y no es esencial', () => {
    for (const key of ['step0', 'proximity-blip', 'characters', 'dungeon-tiles', 'cast-paula', 'avatar-body-a']) {
      expect(isCriticalAsset(key)).toBe(false);
    }
  });
});
```

Crear `frontend/src/app/features/simulator/game-world.loading.contract.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

describe('game-world: carga de la escena', () => {
  it('la escena informa el progreso y los fallos esenciales de la precarga', () => {
    expect(source).toMatch(/onLoadProgress:\s*\(percent: number\) => void;/);
    expect(source).toMatch(/onLoadComplete:\s*\(criticalFailures: string\[\]\) => void;/);
    expect(source).toContain("this.load.on('progress', (value: number) => {");
    expect(source).toMatch(/if \(!this\.assetsLoaded && isCriticalAsset\(file\.key\)\) criticalFailures\.push\(file\.key\);/);
    expect(source).toMatch(/this\.assetsLoaded = true;\s*this\.callbacks\.onLoadComplete\(criticalFailures\);/);
  });

  it('la capa de carga muestra el porcentaje real', () => {
    expect(source).toContain('@if (!assetsReady()) {');
    expect(source).toContain('[attr.aria-valuenow]="loadPercent()"');
    expect(source).toContain("[style.transform]=\"'scaleX(' + loadPercent() / 100 + ')'\"");
  });

  it('un fallo esencial ofrece reintentar o seguir', () => {
    expect(source).toContain('@if (criticalLoadFailed()) {');
    expect(source).toContain('(click)="retryLoad()"');
    expect(source).toContain('(click)="dismissLoadWarning()"');
  });

  it('reintentar reinicia Phaser desde cero sin recargar la página', () => {
    expect(source).toMatch(/retryLoad\(\): void \{[\s\S]*?this\.phaserGame\?\.destroy\(true\);[\s\S]*?this\.phaserGame = undefined;[\s\S]*?this\.boot\(\);/);
    expect(source).not.toContain('location.reload()');
  });
});
```

- [ ] **Step 2: Ejecutar los specs y verlos fallar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/asset-criticality.util.spec.ts src/app/features/simulator/game-world.loading.contract.spec.ts`
Expected: FAIL (módulo inexistente; contrato en rojo).

- [ ] **Step 3: Crear el util**

Crear `frontend/src/app/features/simulator/asset-criticality.util.ts`:

```ts
/** Tilesets de Kenney sobre los que se dibujan las salas Tiled. */
export const CRITICAL_TILESET_KEYS = ['dungeon-img', 'town-img', 'rpg-img'] as const;

/**
 * Recursos cuya falta degrada la sala a paneles planos (mapas Tiled y sus
 * tilesets). Todos existen en disco: si fallan, es la red y vale la pena
 * reintentar. El resto (personajes, objetos, audio) tiene respaldo propio.
 */
export function isCriticalAsset(key: string): boolean {
  return key.startsWith('map-') || (CRITICAL_TILESET_KEYS as readonly string[]).includes(key);
}
```

- [ ] **Step 4: Ampliar `WorldCallbacks`**

En `game-world.component.ts`, en la interfaz `WorldCallbacks`, después de la línea `  onNpcInteract: (npc: NpcConfig) => void;`, añadir:

```ts
  /** Progreso de la precarga, 0-100 (solo la carga inicial). */
  onLoadProgress: (percent: number) => void;
  /** Fin de la precarga; lista las claves esenciales que fallaron (vacía si todo cargó). */
  onLoadComplete: (criticalFailures: string[]) => void;
```

Y junto a los demás imports locales del archivo, añadir:

```ts
import { isCriticalAsset } from './asset-criticality.util';
```

- [ ] **Step 5: Informar desde `preload()`**

Reemplazar:

```ts
    this.load.on('loaderror', (_file: Phaser.Loader.File) => {
      // Missing asset — fallback rendering used
    });
```

por:

```ts
    // Cargas posteriores (hojas bajo demanda) no deben reabrir la capa de carga:
    // por eso ambos oyentes ignoran lo que llega después de la carga inicial.
    const criticalFailures: string[] = [];
    let lastPercent = -1;
    this.load.on('progress', (value: number) => {
      if (this.assetsLoaded) return;
      const percent = Math.round(value * 100);
      if (percent === lastPercent) return;
      lastPercent = percent;
      this.callbacks.onLoadProgress(percent);
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      // Lo decorativo cae a su respaldo; un mapa o tileset deja la sala en paneles planos.
      if (!this.assetsLoaded && isCriticalAsset(file.key)) criticalFailures.push(file.key);
    });
```

Y reemplazar:

```ts
    this.load.once('complete', () => { this.assetsLoaded = true; });
```

por:

```ts
    this.load.once('complete', () => {
      this.assetsLoaded = true;
      this.callbacks.onLoadComplete(criticalFailures);
    });
```

- [ ] **Step 6: Señales, callbacks y reintento en el componente**

En `GameWorldComponent`, después de la línea `  readonly renderedScenarioKey = signal<string | null>(null);`, añadir:

```ts
  /** Progreso real de la precarga de Phaser (0-100). */
  readonly loadPercent = signal(0);
  /** true cuando terminó la precarga inicial (con o sin fallos). */
  readonly assetsReady = signal(false);
  /** Faltó un mapa o tileset: la sala se ve en paneles planos. */
  readonly criticalLoadFailed = signal(false);
```

En `boot()`, dentro del objeto que se pasa a `new DataDrivenWorldScene({ ... })`, después de la línea `        onNpcInteract: npc => this.zone.run(() => this.npcInteract.emit(npc)),`, añadir:

```ts
        onLoadProgress: percent => this.zone.run(() => this.loadPercent.set(percent)),
        onLoadComplete: failures => this.zone.run(() => {
          this.loadPercent.set(100);
          this.assetsReady.set(true);
          this.criticalLoadFailed.set(failures.length > 0);
          if (failures.length > 0) console.warn('[GameWorld] Recursos esenciales sin cargar:', failures);
        }),
```

Después del método `interactNearest() { this.scene?.interactNearest(); }`, añadir:

```ts

  /** Reinicia Phaser desde cero: vuelve a pedir lo que falló (lo demás sale de la caché
   *  del navegador) sin recargar la página ni perder el intento. */
  retryLoad(): void {
    this.hostResizeObserver?.disconnect();
    this.phaserGame?.destroy(true);
    this.phaserGame = undefined;
    this.scene = undefined;
    this.renderReady.set(false);
    this.renderedMapKey.set(null);
    this.renderedScenarioKey.set(null);
    this.assetsReady.set(false);
    this.loadPercent.set(0);
    this.criticalLoadFailed.set(false);
    this.boot();
  }

  dismissLoadWarning(): void { this.criticalLoadFailed.set(false); }
```

(`boot()` sale temprano si `this.phaserGame` existe; por eso se anula antes de llamarlo. Crea su propio `ResizeObserver` y vuelve a aplicar mundo, guía y ajustes con su `setTimeout` final.)

- [ ] **Step 7: Plantilla y estilos**

En la plantilla, justo después del cierre `</div>` del `div #gameHost` (antes de `<div class="touch-controls"`), añadir:

```html
    @if (!assetsReady()) {
      <div class="world-loading">
        <p class="world-loading__label" role="status">Preparando la escena…</p>
        <div class="world-loading__track" role="progressbar" aria-label="Carga de la escena"
          aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="loadPercent()">
          <span class="world-loading__fill" [style.transform]="'scaleX(' + loadPercent() / 100 + ')'"></span>
        </div>
        <p class="world-loading__percent" aria-hidden="true">{{ loadPercent() }}&nbsp;%</p>
      </div>
    }
    @if (criticalLoadFailed()) {
      <div class="world-load-warning" role="alert">
        <p>Parte del mapa no cargó y la sala se ve simplificada.</p>
        <div class="world-load-warning__actions">
          <button type="button" class="psy-button" (click)="retryLoad()">Reintentar</button>
          <button type="button" class="psy-button psy-button--ghost" (click)="dismissLoadWarning()">Seguir así</button>
        </div>
      </div>
    }
```

En los estilos, después de la regla `.touch-interact { font-size: .82rem; }`, añadir:

```css
    /* Aparece solo si la carga pasa de 300 ms: con caché caliente no parpadea. */
    .world-loading {
      position: absolute;
      inset: 0;
      z-index: 50;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 10px;
      background: #0e1322;
      color: #e8f0f4;
      animation: world-loading-in 200ms var(--psy-ease-out) 300ms both;
    }
    .world-loading__label { margin: 0; font-size: .95rem; }
    .world-loading__track {
      width: min(280px, 70vw);
      height: 6px;
      border-radius: 999px;
      background: rgba(182,156,255,.18);
      overflow: hidden;
    }
    .world-loading__fill {
      display: block;
      height: 100%;
      background: #b69cff;
      transform-origin: left center;
      transition: transform 160ms linear;
    }
    .world-loading__percent {
      margin: 0;
      font: 600 .8rem/1 'JetBrains Mono', ui-monospace, monospace;
      font-variant-numeric: tabular-nums;
      color: rgba(232,240,244,.72);
    }
    .world-load-warning {
      position: absolute;
      left: 50%;
      top: 16px;
      z-index: 51;
      transform: translateX(-50%);
      width: min(420px, calc(100% - 32px));
      display: grid;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid rgba(245,184,75,.45);
      border-radius: 10px;
      background: rgba(8,12,18,.94);
      color: #e8f0f4;
      text-align: center;
    }
    .world-load-warning p { margin: 0; }
    .world-load-warning__actions { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
    @keyframes world-loading-in { from { opacity: 0; } to { opacity: 1; } }
```

- [ ] **Step 8: Ejecutar los specs y verlos pasar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/asset-criticality.util.spec.ts src/app/features/simulator/game-world.loading.contract.spec.ts src/app/features/simulator/game-world.touch.contract.spec.ts`
Expected: PASS.

- [ ] **Step 9: Build y e2e**

Run: `npm run build:frontend`
Expected: sin errores (el presupuesto de estilos por componente no debe saltar; si salta, reportar la cifra).

Run: `npm run test:e2e -- living-world vertical-quality`
Expected: PASS. La capa de carga desaparece antes de `data-world-ready="true"`, así que las comprobaciones de axe y geometría no la ven.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/app/features/simulator/asset-criticality.util.ts frontend/src/app/features/simulator/asset-criticality.util.spec.ts frontend/src/app/features/simulator/game-world.loading.contract.spec.ts frontend/src/app/features/simulator/game-world.component.ts
git commit -m "feat(juego): carga de la escena con progreso real y reintento"
```

---

## Verificación final

- [ ] `npm run test:frontend` → todo en verde.
- [ ] `npm run build:frontend` → sin errores.
- [ ] `npm run test:e2e` → la suite completa en verde (incluye axe y geometría en 4 tamaños).
- [ ] **Comprobación a mano** (Chrome, `npm start --prefix frontend`):
  1. Abrir Ajustes, pulsar Esc: el menú se cierra, el foco queda en el engranaje y la partida sigue. Pulsar Esc otra vez: aparece la salida segura.
  2. Abrir Ajustes y tocar el mapa: el menú se cierra.
  3. DevTools → *Toggle device toolbar* → «iPad Pro» en horizontal (1366×1024, táctil): los controles aparecen. Mantener «Mover derecha» 1 s: el jugador camina y se detiene al soltar. Tocar una vez: un paso corto.
  4. Sin emulación, ventana de escritorio a 800 px de ancho: no hay controles táctiles.
  5. DevTools → Network → *Slow 3G*, recargar la simulación: la capa «Preparando la escena…» avanza hasta 100 % y desaparece.
  6. DevTools → Network → bloquear `*/assets/game/maps/*`, recargar: la sala sale en paneles planos y aparece el aviso. Desbloquear y pulsar «Reintentar»: la sala se redibuja con sus tiles sin recargar la página.
