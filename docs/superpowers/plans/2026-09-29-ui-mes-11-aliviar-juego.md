# 11 — Aliviar el trabajo por cuadro del juego — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Estado:** TODO
- **Commit base:** `02bbfe9` (rama `feat/ui-mes`, que sale de `feat/ui-semana` e incluye los arreglos de movimiento del PR #10)
- **Severidad:** ALTA (tirones al caminar y batería en portátiles; el costo crece con cada cambio de sala)
- **Categoría:** Rendimiento
- **Alcance estimado:** 3 utils nuevos, 6 archivos modificados; 6 specs nuevos

**Goal:** Que caminar por el mundo no fuerce a Angular a revisar toda la app 60 veces por segundo, que los cambios de sala no acumulen animaciones huérfanas, y que el audio, las partículas y los paneles del juego no gasten cuadros en trabajo invisible.

**Architecture:** La app usa zone.js (`angular.json` → `"polyfills": ["zone.js"]`): cualquier temporizador, `requestAnimationFrame` o `zone.run()` dispara la detección de cambios de toda la aplicación. Hay cinco fuentes de trabajo por cuadro que no aportan nada:
1. **Tweens huérfanos:** la escena Phaser reconstruye la sala con `this.children.removeAll(true)`, pero los tweens `repeat: -1` (pulsos de marcadores, brillos de puertas) siguen vivos sobre objetos destruidos y se suman en cada re-render.
2. **Posición por cuadro:** mientras el jugador camina, `update()` llama a `onPosition` en **cada** cuadro y el componente lo envuelve en `zone.run()`. Son 60 detecciones de cambios por segundo para alimentar dos cosas: un guardado con *debounce* de 550 ms y los atributos `data-player-x/y` que lee el e2e.
   - El arreglo separa las dos salidas. `data-player-x/y` se escribe **en cada cuadro directo en el DOM**, fuera de Angular: el e2e (`moveBy` en `e2e/support/siep-flow.ts`) lo lee justo al soltar la tecla, con 4 px de tolerancia.
   - El aviso a Angular (`positionChange`) baja a 8 por segundo y siempre cierra con la posición final exacta.
3. **Fundido de música eterno:** `AudioDirectorService` arranca un `setInterval` de 33 ms dentro de la zona y nunca lo detiene. Son 30 detecciones de cambios por segundo durante toda la partida, aunque el volumen ya haya llegado a su objetivo.
4. **Partículas de la portada y el login:** el bucle `requestAnimationFrame` corre dentro de la zona, lee `clientWidth` (fuerza *layout*) varias veces por cuadro, sigue animando con el héroe fuera de pantalla y avanza por cuadro en vez de por tiempo (va el doble de rápido en pantallas de 120 Hz).
5. **Desenfoques caros:** seis paneles casi opacos (alfa ≥ 0,84) usan `backdrop-filter: blur(...)` encima del lienzo del juego, que cambia cada cuadro. El navegador recalcula el desenfoque en cada cuadro, pero apenas se ve.

**Tech Stack:** Angular 21, Phaser 3.90, Howler 2, Jest 30 (ts-jest, jsdom, sin zone.js en las pruebas).

**Spec:** Auditoría del 2026-09-29, sección «Rendimiento del juego» y prioridad del mes n.º 11 («Aliviar el trabajo del juego por cuadro»). Este plan es autocontenido.

## Global Constraints

- Todas las rutas son relativas a la raíz del repo.
- No añadir dependencias.
- **Coordinación con otra sesión:** la base ya incluye el trabajo de la otra sesión en `game-world.component.ts` (PR #10, `9b9b8ec`): sub-pasos con `splitFrameDelta` en `update()` y la señal `playerPosition` que expone `data-player-x/y` al e2e. Esa sesión puede seguir cambiando el archivo. Antes de empezar la tarea 1, ejecutar `git fetch -q origin && git log --oneline 9b9b8ec..origin/feat/personaje-v1-idle-walk -- frontend/src/app/features/simulator/game-world.component.ts`. Si muestra algún commit, DETENERSE: el controlador debe fusionar esa rama en `feat/ui-mes` antes de seguir.
- **Contrato del e2e:** el host de Phaser (`.phaser-host`) conserva `data-player-x` y `data-player-y` con los pies del jugador en píxeles enteros. Se fijan al terminar cada render (`onReady`) y se actualizan en cada cuadro en que el jugador se mueve. No editar `frontend/e2e/**`.
- No cambiar la firma de `WorldCallbacks.onPosition` ni el output `positionChange` de `GameWorldComponent`.
- La música sigue sonando igual: mismo `FADE_SPEED` (0.02), mismo tick (33 ms), mismos objetivos por nivel de estrés. Solo cambia cuándo corre el bucle.
- Con `prefers-reduced-motion: reduce`, la capa de partículas sigue dibujando un cuadro estático y no anima.
- Si un fragmento «Actual» no coincide con el archivo (drift), DETENERSE y reportar.
- Comentarios y textos en español. Commits en español `tipo(ámbito): descripción`.
- El árbol de trabajo usa CRLF (git `autocrlf=true`): en las regex de los specs de contrato, usar `\s*` o `\s+` entre líneas, nunca `\n` literal.

## Review Focus

- Caminar y soltar la tecla: la posición que se guarda en el backend es la final exacta, no una intermedia retenida por la limitación de frecuencia. Y `data-player-x/y` ya muestra esa posición en el cuadro siguiente al de soltar, que es cuando el e2e la lee.
- Entrar y salir de la misma sala diez veces: los pulsos de los marcadores no se aceleran ni se multiplican.
- Subir el estrés en plena partida sigue fundiendo la música, y silenciarla la corta al instante.
- En la portada, bajar hasta que el héroe salga de pantalla detiene las partículas; al volver, se reanudan sin salto.
- Sin desenfoque, el texto del HUD, del objetivo y del diálogo sigue igual de legible sobre escenas claras.

## Problema

`frontend/src/app/features/simulator/game-world.component.ts`, `renderWorld()` (~línea 709) y `renderRoom()` (~línea 871), actual:

```ts
    this.cameras.main.stopFollow();   // clear stale follow target before destroying children
    this.children.removeAll(true);
```

```ts
    this.cameras.main.stopFollow();
    this.children.removeAll(true);
```

Hay ocho `this.tweens.add({ ... repeat: -1 ... })` en el archivo (líneas ~1848, ~1890, ~1899, ~1960, ~1970, ~1987, más los de los renderers). Nadie los detiene.

Mismo archivo, `update()` (~línea 369) y `nudge()` (~línea 614), actual:

```ts
      if (moved) {
        this.callbacks.onPosition(Math.round(this.player.x), Math.round(this.player.y));
        this.applyPlayerPose(step.direction, true);
```

```ts
    if (moved) {
      this.callbacks.onPosition(Math.round(this.player.x), Math.round(this.player.y));
      this.ysort(this.player);
    }
```

y en `GameWorldComponent` (~líneas 2152-2153, 2207 y 2263-2275):

```html
      [attr.data-player-x]="playerPosition()?.x"
      [attr.data-player-y]="playerPosition()?.y"
```

```ts
  /** Pies del jugador expuestos como data-player-x/y: contrato de navegación del e2e. */
  readonly playerPosition = signal<{ x: number; y: number } | null>(null);
```

```ts
        onReady:       () => this.zone.run(() => {
          this.renderedMapKey.set(this.world()?.map.key ?? null);
          this.renderedScenarioKey.set(this.scenarioConfig()?.startRoomKey ?? null);
          this.playerPosition.set(this.scene?.playerPosition() ?? null);
          this.renderReady.set(true);
        }),
        …
        onPosition:    (x, y) => this.zone.run(() => {
          this.playerPosition.set({ x, y });
          this.positionChange.emit({ x, y });
        }),
```

Además de los atributos, el único consumidor es `SimulationPlayComponent.rememberPosition()` (`simulation-play.component.ts` ~línea 1660). Reprograma un `setTimeout` de 550 ms y revisa si el jugador se alejó 72 px de una puerta.

`frontend/src/app/features/simulator/audio-director.service.ts`, actual:

```ts
  private startFadeLoop(): void {
    const FADE_SPEED = 0.02;
    this.fadeInterval = window.setInterval(() => {
      this.stems.forEach(stem => {
        const diff = stem.targetVolume - stem.volume;
        if (Math.abs(diff) > 0.001) {
          stem.volume += diff * FADE_SPEED;
          stem.howl.volume(Math.max(0, Math.min(1, stem.volume)));
        }
      });
    }, 33);
  }
```

`init()` lo arranca (línea 85). `stopAll()` lo limpia con `clearInterval` pero deja el id en `fadeInterval`.

`frontend/src/app/shared/ui/siep-particle-layer.component.ts`: `animate()` llama a `requestAnimationFrame` dentro de la zona. `update()` y `draw()` leen `this.host.nativeElement.clientWidth/clientHeight` en cada cuadro. Las velocidades se suman por cuadro, sin delta. La usan `login.component.html:2` y `landing.component.html:37`.

`backdrop-filter` sobre fondos casi opacos:

| Archivo | Selector | Fondo | Filtro |
| --- | --- | --- | --- |
| `simulation-play.component.ts` ~427 | `.objective-card` | `rgba(8,12,18,.88)` | `blur(10px)` |
| `simulation-play.component.ts` ~700 | `.case-intro-overlay` | `… rgba(5,8,14,.9)` | `blur(8px)` |
| `dialogue-panel.component.ts` ~122 | `.dialogue-strip` | `rgba(8,12,18,.95)` | `blur(16px) saturate(110%)` |
| `journal-panel.component.ts` ~121 | `.journal-modal` | `rgba(13,18,32,.96)` | `blur(20px) saturate(115%)` |
| `simulation-hud.component.ts` ~167 | `.hud-shell` | gradiente `.9 → .84` | `blur(18px) saturate(120%)` |
| `simulation-hud.component.ts` ~301 | `.settings-menu` | `rgba(13,18,30,.96)` | `blur(18px) saturate(130%)` |

Se conservan `.right-panel` (`rgba(27,33,51,.72)`) y `.overlay-backdrop` (`rgba(8,12,18,.62)`, `blur(3px)`), que son translúcidos a propósito. `.intro-video-overlay` también se deja: el plan 13 elimina esa regla entera.

---

### Task 1: Matar los tweens antes de reconstruir la sala

**Files:**
- Modify: `frontend/src/app/features/simulator/game-world.component.ts` (~709-710 y ~871-872)
- Create: `frontend/src/app/features/simulator/game-world.frame-budget.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `game-world.frame-budget.spec.ts`, al que la tarea 2 añade un `it`.

- [ ] **Step 1: Comprobar que no hay deriva con la otra sesión**

Run: `git fetch -q origin && git log --oneline 9b9b8ec..origin/feat/personaje-v1-idle-walk -- frontend/src/app/features/simulator/game-world.component.ts`
Expected: salida vacía. Si hay commits, DETENERSE y reportar.

- [ ] **Step 2: Escribir el spec que falla**

Crear `frontend/src/app/features/simulator/game-world.frame-budget.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

describe('game-world: trabajo por cuadro', () => {
  it('cada reconstrucción de sala mata los tweens antes de destruir los objetos', () => {
    const rebuilds = source.match(/this\.children\.removeAll\(true\);/g) ?? [];
    const guarded = source.match(/this\.tweens\.killAll\(\);\s*this\.children\.removeAll\(true\);/g) ?? [];
    expect(rebuilds.length).toBe(2);
    expect(guarded.length).toBe(rebuilds.length);
  });
});
```

- [ ] **Step 3: Ejecutar el spec y verlo fallar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/game-world.frame-budget.spec.ts`
Expected: FAIL (`Expected: 2, Received: 0`).

- [ ] **Step 4: Implementar**

En `renderWorld()`, reemplazar:

```ts
    this.cameras.main.stopFollow();   // clear stale follow target before destroying children
    this.children.removeAll(true);
```

por:

```ts
    this.cameras.main.stopFollow();   // clear stale follow target before destroying children
    // Los pulsos repeat:-1 sobreviven a removeAll y se acumulaban en cada re-render.
    this.tweens.killAll();
    this.children.removeAll(true);
```

En `renderRoom()`, reemplazar:

```ts
    this.cameras.main.stopFollow();
    this.children.removeAll(true);
```

por:

```ts
    this.cameras.main.stopFollow();
    this.tweens.killAll();
    this.children.removeAll(true);
```

`transitionToRoom()` usa `cameras.main.fadeOut/fadeIn`, que son efectos de cámara y no tweens: `killAll()` no los corta.

- [ ] **Step 5: Ejecutar el spec y verlo pasar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/game-world.frame-budget.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/simulator/game-world.component.ts frontend/src/app/features/simulator/game-world.frame-budget.spec.ts
git commit -m "perf(juego): matar los tweens al reconstruir la sala"
```

---

### Task 2: Notificar la posición del jugador a lo sumo 8 veces por segundo

**Files:**
- Create: `frontend/src/app/features/simulator/position-emit.util.ts`
- Create: `frontend/src/app/features/simulator/position-emit.util.spec.ts`
- Modify: `frontend/src/app/features/simulator/game-world.component.ts` (import ~línea 50; interfaz `WorldCallbacks` ~línea 96; campos ~línea 199; métodos nuevos justo antes de `override update(`; `update()` ~369-397; `nudge()` ~620; plantilla ~2152-2153; señal ~2207; callbacks de `boot()` ~2263-2275)
- Modify: `frontend/src/app/features/simulator/game-world.frame-budget.spec.ts`

**Interfaces:**
- Consumes: `game-world.frame-budget.spec.ts` de la tarea 1.
- Produces:
  - `POSITION_EMIT_INTERVAL_MS = 125`, `interface EmittedPosition { x: number; y: number; at: number }` y `shouldEmitPosition(last: EmittedPosition | null, x: number, y: number, now: number): boolean`.
  - En `WorldCallbacks`: `onPositionFrame: (x: number, y: number) => void` (sin limitar y fuera de Angular).
  - En la escena: `private emitPosition(force = false): void` y `private flushPosition(): void`.
  - En `GameWorldComponent`: `private writePlayerPosition(position: { x: number; y: number } | null): void`. Desaparece la señal pública `playerPosition` del componente; el método `playerPosition()` de la escena se conserva.

- [ ] **Step 1: Escribir el spec del util que falla**

Crear `frontend/src/app/features/simulator/position-emit.util.spec.ts`:

```ts
import { POSITION_EMIT_INTERVAL_MS, shouldEmitPosition } from './position-emit.util';

describe('shouldEmitPosition', () => {
  const last = { x: 100, y: 100, at: 1000 };

  it('usa un intervalo de 125 ms (≈ 8 avisos por segundo al caminar)', () => {
    expect(POSITION_EMIT_INTERVAL_MS).toBe(125);
  });

  it('emite la primera posición conocida', () => {
    expect(shouldEmitPosition(null, 5, 5, 0)).toBe(true);
  });

  it('no emite si la posición no cambió, pase el tiempo que pase', () => {
    expect(shouldEmitPosition(last, 100, 100, 60_000)).toBe(false);
  });

  it('retiene los pasos dentro del intervalo', () => {
    expect(shouldEmitPosition(last, 118, 100, 1000 + POSITION_EMIT_INTERVAL_MS - 1)).toBe(false);
  });

  it('emite en cuanto vence el intervalo', () => {
    expect(shouldEmitPosition(last, 101, 100, 1000 + POSITION_EMIT_INTERVAL_MS)).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar el spec y verlo fallar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/position-emit.util.spec.ts`
Expected: FAIL (`Cannot find module './position-emit.util'`).

- [ ] **Step 3: Crear el util**

Crear `frontend/src/app/features/simulator/position-emit.util.ts`:

```ts
/**
 * Cada aviso de posición entra a la zona de Angular y dispara la detección de
 * cambios de toda la app. Su único consumidor guarda con debounce de 550 ms y
 * compara distancias de 72 px: 8 avisos por segundo sobran (≈ 19 px a 150 px/s).
 */
export const POSITION_EMIT_INTERVAL_MS = 125;

export interface EmittedPosition {
  x: number;
  y: number;
  /** Reloj de la escena (ms) en que se emitió. */
  at: number;
}

/** Decide si una posición nueva, en píxeles enteros, merece avisar a Angular. */
export function shouldEmitPosition(
  last: EmittedPosition | null,
  x: number,
  y: number,
  now: number,
): boolean {
  if (!last) return true;
  if (last.x === x && last.y === y) return false;
  return now - last.at >= POSITION_EMIT_INTERVAL_MS;
}
```

- [ ] **Step 4: Ejecutar el spec del util y verlo pasar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/position-emit.util.spec.ts`
Expected: PASS (5 pruebas).

- [ ] **Step 5: Añadir el contrato de la escena (falla)**

En `frontend/src/app/features/simulator/game-world.frame-budget.spec.ts`, añadir dentro del `describe`, después del primer `it`:

```ts
  it('la posición sale por un único punto limitado y se vacía al detenerse', () => {
    expect(source.match(/this\.callbacks\.onPosition\(/g) ?? []).toHaveLength(1);
    expect(source).toMatch(/private emitPosition\(force = false\): void \{[\s\S]*?this\.callbacks\.onPosition\(x, y\);/);
    expect(source).toMatch(/private flushPosition\(\): void \{\s*if \(this\.positionDirty\) this\.emitPosition\(true\);\s*\}/);
    // Bloqueado contra una pared y quieto: ambas ramas vacían la posición pendiente.
    expect(source).toMatch(/this\.flushPosition\(\);\s*this\.applyPlayerPose\(step\.direction, false\);/);
    expect(source).toMatch(/this\.flushPosition\(\);\s*this\.applyPlayerPose\(this\.lastDirection, false\);/);
  });

  it('data-player-x/y (contrato del e2e) se escribe en cada cuadro, directo en el DOM y sin Angular', () => {
    // La escena manda la posición del cuadro ANTES de decidir si avisa a Angular.
    expect(source).toMatch(/private emitPosition\(force = false\): void \{[\s\S]*?this\.callbacks\.onPositionFrame\(x, y\);[\s\S]*?shouldEmitPosition\(/);
    expect(source).toMatch(/onPositionFrame:\s*\(x: number, y: number\) => void;/);
    expect(source).toContain('onPositionFrame: (x, y) => this.writePlayerPosition({ x, y }),');
    expect(source).toContain("host.setAttribute('data-player-x', String(position.x));");
    expect(source).toContain("host.setAttribute('data-player-y', String(position.y));");
    // Ni binding de plantilla ni señal: cada cambio dispararía detección de cambios.
    expect(source).not.toContain('[attr.data-player-x]');
    expect(source).not.toMatch(/readonly playerPosition = signal/);
    expect(source).toContain('this.writePlayerPosition(this.scene?.playerPosition() ?? null);');
  });
```

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/game-world.frame-budget.spec.ts`
Expected: FAIL en los dos `it` nuevos (hay 2 llamadas a `onPosition`; no existe `onPositionFrame`).

- [ ] **Step 6: Importar el util en la escena**

En `game-world.component.ts`, después del bloque `import { ... } from './player-motion.util';` (termina ~línea 53), añadir:

```ts
import { EmittedPosition, shouldEmitPosition } from './position-emit.util';
```

- [ ] **Step 7: Añadir los campos**

Después de la línea:

```ts
  private readonly STEP_INTERVAL = 280; // ms — natural walking cadence (~215 steps/min)
```

añadir:

```ts
  /** Última posición avisada a Angular (ver position-emit.util). */
  private lastEmittedPosition: EmittedPosition | null = null;
  /** Hay movimiento que la limitación de frecuencia todavía no avisó. */
  private positionDirty = false;
```

- [ ] **Step 8: Añadir los métodos**

Justo antes de la línea `  override update(time: number, delta: number) {`, añadir:

```ts
  /** Publica la posición: al DOM en cada cuadro (contrato del e2e) y a Angular como
   *  mucho cada POSITION_EMIT_INTERVAL_MS. `force` salta el intervalo (fin de un
   *  movimiento, nudge táctil). */
  private emitPosition(force = false): void {
    if (!this.player) return;
    const x = Math.round(this.player.x);
    const y = Math.round(this.player.y);
    this.callbacks.onPositionFrame(x, y);
    const last = this.lastEmittedPosition;
    if (last && last.x === x && last.y === y) {
      this.positionDirty = false;
      return;
    }
    const now = this.time.now;
    if (!force && !shouldEmitPosition(last, x, y, now)) {
      this.positionDirty = true;
      return;
    }
    this.positionDirty = false;
    this.lastEmittedPosition = { x, y, at: now };
    this.callbacks.onPosition(x, y);
  }

  /** Al dejar de avanzar, la última posición se avisa exacta: es la que se persiste. */
  private flushPosition(): void {
    if (this.positionDirty) this.emitPosition(true);
  }

```

- [ ] **Step 9: Usarlos en `update()`**

Reemplazar:

```ts
      if (moved) {
        this.callbacks.onPosition(Math.round(this.player.x), Math.round(this.player.y));
        this.applyPlayerPose(step.direction, true);
```

por:

```ts
      if (moved) {
        this.emitPosition();
        this.applyPlayerPose(step.direction, true);
```

Reemplazar:

```ts
        // Bloqueado del todo contra pared/mueble: sin avance real no debe
        // correr la animación de caminata (ni sonar pasos).
        this.applyPlayerPose(step.direction, false);
```

por:

```ts
        // Bloqueado del todo contra pared/mueble: sin avance real no debe
        // correr la animación de caminata (ni sonar pasos).
        this.flushPosition();
        this.applyPlayerPose(step.direction, false);
```

Reemplazar:

```ts
      this.stepTimer = this.STEP_INTERVAL; // prime timer: first step fires on frame 1 of movement, not after a full interval
      this.applyPlayerPose(this.lastDirection, false);
```

por:

```ts
      this.stepTimer = this.STEP_INTERVAL; // prime timer: first step fires on frame 1 of movement, not after a full interval
      this.flushPosition();
      this.applyPlayerPose(this.lastDirection, false);
```

- [ ] **Step 10: Usarlos en `nudge()`**

Reemplazar:

```ts
    if (moved) {
      this.callbacks.onPosition(Math.round(this.player.x), Math.round(this.player.y));
      this.ysort(this.player);
    }
```

por:

```ts
    if (moved) {
      // Cada toque es un paso discreto: se avisa siempre, sin esperar el intervalo.
      this.emitPosition(true);
      this.ysort(this.player);
    }
```

- [ ] **Step 11: Separar las dos salidas en `WorldCallbacks` y en el componente**

En la interfaz `WorldCallbacks`, después de la línea `  onPosition:    (x: number, y: number) => void;`, añadir:

```ts
  /** Posición de cada cuadro con movimiento, sin limitar; se llama fuera de Angular. */
  onPositionFrame: (x: number, y: number) => void;
```

En la plantilla de `GameWorldComponent`, borrar estas dos líneas del `div #gameHost`:

```html
      [attr.data-player-x]="playerPosition()?.x"
      [attr.data-player-y]="playerPosition()?.y"
```

Borrar estas dos líneas de la clase `GameWorldComponent`:

```ts
  /** Pies del jugador expuestos como data-player-x/y: contrato de navegación del e2e. */
  readonly playerPosition = signal<{ x: number; y: number } | null>(null);
```

Justo después del método `nudge(direction: 'up' | 'down' | 'left' | 'right') { this.scene?.nudge(direction); }` del componente, añadir:

```ts

  /** Pies del jugador como data-player-x/y en el host de Phaser (contrato de navegación
   *  del e2e). Se escriben directo en el DOM: cambian en cada cuadro de caminata y una
   *  señal o un binding dispararían la detección de cambios de toda la app. */
  private writePlayerPosition(position: { x: number; y: number } | null): void {
    const host = this.gameHost?.nativeElement;
    if (!host || !position) return;
    host.setAttribute('data-player-x', String(position.x));
    host.setAttribute('data-player-y', String(position.y));
  }
```

En `boot()`, reemplazar:

```ts
          this.playerPosition.set(this.scene?.playerPosition() ?? null);
```

por:

```ts
          this.writePlayerPosition(this.scene?.playerPosition() ?? null);
```

y reemplazar:

```ts
        onPosition:    (x, y) => this.zone.run(() => {
          this.playerPosition.set({ x, y });
          this.positionChange.emit({ x, y });
        }),
```

por:

```ts
        onPosition:    (x, y) => this.zone.run(() => this.positionChange.emit({ x, y })),
        onPositionFrame: (x, y) => this.writePlayerPosition({ x, y }),
```

- [ ] **Step 12: Ejecutar los specs y los e2e que navegan por posición**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/game-world.frame-budget.spec.ts src/app/features/simulator/position-emit.util.spec.ts src/app/features/simulator/player-motion.util.spec.ts`
Expected: PASS.

Run: `npm run build:frontend`
Expected: sin errores (TypeScript exige `onPositionFrame` en el único `new DataDrivenWorldScene({ … })`).

Run: `npm run test:e2e -- living-world vertical-quality full-case`
Expected: PASS en local. `moveBy` lee `data-player-x/y` justo al soltar la tecla; si alguno falla con «No se alcanzó la interacción … (jugador en x=…, y=…)», comparar con la misma corrida en el commit anterior antes de culpar a este cambio. Hoy `full-case` falla en el CI de GitHub también sin este plan (PR #10).

- [ ] **Step 13: Commit**

```bash
git add frontend/src/app/features/simulator/position-emit.util.ts frontend/src/app/features/simulator/position-emit.util.spec.ts frontend/src/app/features/simulator/game-world.component.ts frontend/src/app/features/simulator/game-world.frame-budget.spec.ts
git commit -m "perf(juego): avisar la posición del jugador a lo sumo 8 veces por segundo"
```

---

### Task 3: El fundido de música corre fuera de Angular y solo mientras hace falta

**Files:**
- Create: `frontend/src/app/features/simulator/audio-fade.util.ts`
- Create: `frontend/src/app/features/simulator/audio-director.service.spec.ts`
- Modify: `frontend/src/app/features/simulator/audio-director.service.ts` (import línea 1; campo nuevo; `init()` línea 85; `stopAll()` 208-212; `setTargetVolume()` 225-228; `startFadeLoop()` 230-241)

**Interfaces:**
- Consumes: nada.
- Produces: `FADE_TICK_MS = 33`, `FADE_SPEED = 0.02`, `FADE_EPSILON = 0.001`, `fadeStep(current: number, target: number): number`. La API pública de `AudioDirectorService` no cambia.

- [ ] **Step 1: Escribir el spec que falla**

Crear `frontend/src/app/features/simulator/audio-director.service.spec.ts`:

```ts
import { NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Howl } from 'howler';
import { AudioDirectorService } from './audio-director.service';
import { FADE_EPSILON, FADE_SPEED, fadeStep } from './audio-fade.util';

jest.mock('howler', () => ({
  Howl: jest.fn().mockImplementation(() => ({
    volume: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    unload: jest.fn(),
    mute: jest.fn(),
    playing: jest.fn(() => false),
  })),
  Howler: { volume: jest.fn() },
}));

describe('fadeStep', () => {
  it('recorre una fracción fija de la distancia al objetivo', () => {
    expect(fadeStep(0, 1)).toBeCloseTo(FADE_SPEED);
    expect(fadeStep(1, 0)).toBeCloseTo(1 - FADE_SPEED);
  });

  it('fija el objetivo cuando ya está a menos de FADE_EPSILON', () => {
    expect(fadeStep(0.5, 0.5 + FADE_EPSILON / 2)).toBe(0.5 + FADE_EPSILON / 2);
    expect(fadeStep(0.3, 0.3)).toBe(0.3);
  });
});

describe('AudioDirectorService: bucle de fundido', () => {
  let service: AudioDirectorService;
  /** El primer Howl que crea init() es el stem 'ambient'. */
  const ambientHowl = () => (Howl as unknown as jest.Mock).mock.results[0].value;

  beforeAll(() => {
    // jsdom no implementa matchMedia; el servicio lo lee al construirse.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
  });

  beforeEach(() => {
    jest.useFakeTimers();
    (Howl as unknown as jest.Mock).mockClear();
    TestBed.resetTestingModule();
    service = TestBed.inject(AudioDirectorService);
    service.init();
  });

  afterEach(() => {
    service.dispose();
    jest.useRealTimers();
  });

  it('init no deja ningún temporizador corriendo', () => {
    expect(jest.getTimerCount()).toBe(0);
  });

  it('arranca fuera de la zona de Angular al fijar un objetivo', () => {
    const outside = jest.spyOn(TestBed.inject(NgZone), 'runOutsideAngular');
    service.setStressLevel(10);
    expect(outside).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(1);
  });

  it('se detiene solo al llegar al volumen objetivo', () => {
    service.setStressLevel(10);
    jest.advanceTimersByTime(20_000);
    expect(jest.getTimerCount()).toBe(0);
    expect(ambientHowl().volume).toHaveBeenLastCalledWith(0.42);
  });

  it('vuelve a arrancar después de stopAll', () => {
    service.setStressLevel(10);
    service.stopAll();
    expect(jest.getTimerCount()).toBe(0);
    service.setStressLevel(70);
    expect(jest.getTimerCount()).toBe(1);
  });

  it('silenciar la música corta el volumen y termina el fundido', () => {
    service.setStressLevel(10);
    jest.advanceTimersByTime(1_000);
    service.setMusicMuted(true);
    jest.advanceTimersByTime(100);
    expect(jest.getTimerCount()).toBe(0);
    expect(ambientHowl().volume).toHaveBeenLastCalledWith(0);
  });
});
```

- [ ] **Step 2: Ejecutar el spec y verlo fallar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/audio-director.service.spec.ts`
Expected: FAIL (`Cannot find module './audio-fade.util'`).

- [ ] **Step 3: Crear el util**

Crear `frontend/src/app/features/simulator/audio-fade.util.ts`:

```ts
/** Cada cuánto avanza el fundido de música (ms). */
export const FADE_TICK_MS = 33;
/** Fracción de la distancia al objetivo que se recorre en cada tick. */
export const FADE_SPEED = 0.02;
/** Por debajo de esta diferencia el volumen se fija en el objetivo y el fundido termina. */
export const FADE_EPSILON = 0.001;

/** Siguiente volumen de un fundido exponencial hacia `target`. */
export function fadeStep(current: number, target: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= FADE_EPSILON) return target;
  return current + diff * FADE_SPEED;
}
```

- [ ] **Step 4: Cambiar el servicio**

En `audio-director.service.ts`:

1. Reemplazar la línea 1 `import { Injectable } from '@angular/core';` por:

```ts
import { Injectable, NgZone, inject } from '@angular/core';
```

   y después de `import { Howl, Howler } from 'howler';` añadir:

```ts
import { FADE_TICK_MS, fadeStep } from './audio-fade.util';
```

2. Después de `  private stems = new Map<MusicLayer, StemTrack>();` añadir:

```ts
  private readonly zone = inject(NgZone);
```

3. En `init()`, borrar la línea `    this.startFadeLoop();` (y la línea en blanco que la precede, si queda doble).

4. En `stopAll()`, reemplazar `    if (this.fadeInterval) clearInterval(this.fadeInterval);` por:

```ts
    this.stopFadeLoop();
```

5. Reemplazar `setTargetVolume()` y `startFadeLoop()` completos:

```ts
  private setTargetVolume(layer: MusicLayer, vol: number): void {
    const stem = this.stems.get(layer);
    if (stem) stem.targetVolume = this.musicMuted ? 0 : vol * this.musicVolume;
  }

  private startFadeLoop(): void {
    const FADE_SPEED = 0.02;
    this.fadeInterval = window.setInterval(() => {
      this.stems.forEach(stem => {
        const diff = stem.targetVolume - stem.volume;
        if (Math.abs(diff) > 0.001) {
          stem.volume += diff * FADE_SPEED;
          stem.howl.volume(Math.max(0, Math.min(1, stem.volume)));
        }
      });
    }, 33);
  }
```

por:

```ts
  private setTargetVolume(layer: MusicLayer, vol: number): void {
    const stem = this.stems.get(layer);
    if (!stem) return;
    stem.targetVolume = this.musicMuted ? 0 : vol * this.musicVolume;
    this.ensureFadeLoop();
  }

  /** Fuera de la zona: un setInterval dentro de ella dispararía la detección
   *  de cambios de toda la app 30 veces por segundo. */
  private ensureFadeLoop(): void {
    if (this.fadeInterval !== undefined) return;
    this.zone.runOutsideAngular(() => {
      this.fadeInterval = window.setInterval(() => this.fadeTick(), FADE_TICK_MS);
    });
  }

  private fadeTick(): void {
    let fading = false;
    this.stems.forEach(stem => {
      const next = fadeStep(stem.volume, stem.targetVolume);
      if (next !== stem.volume) {
        stem.volume = next;
        stem.howl.volume(Math.max(0, Math.min(1, next)));
      }
      if (next !== stem.targetVolume) fading = true;
    });
    if (!fading) this.stopFadeLoop();
  }

  private stopFadeLoop(): void {
    if (this.fadeInterval === undefined) return;
    window.clearInterval(this.fadeInterval);
    this.fadeInterval = undefined;
  }
```

- [ ] **Step 5: Ejecutar el spec y verlo pasar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/audio-director.service.spec.ts`
Expected: PASS (7 pruebas).

- [ ] **Step 6: Ejecutar los specs que usan el servicio**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/dialogue-panel.component.spec.ts src/app/features/simulator/simulation-play.consent-gate.spec.ts`
Expected: PASS (ambos lo sustituyen con un doble; no deben cambiar).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/simulator/audio-fade.util.ts frontend/src/app/features/simulator/audio-director.service.spec.ts frontend/src/app/features/simulator/audio-director.service.ts
git commit -m "perf(audio): el fundido de música corre fuera de Angular y se detiene al llegar"
```

---

### Task 4: Partículas de la portada y el login fuera de la zona, por tiempo y solo si se ven

**Files:**
- Create: `frontend/src/app/shared/ui/particle-field.util.ts`
- Create: `frontend/src/app/shared/ui/particle-field.util.spec.ts`
- Create: `frontend/src/app/shared/ui/siep-particle-layer.contract.spec.ts`
- Modify (reescritura completa): `frontend/src/app/shared/ui/siep-particle-layer.component.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `interface Particle`, `interface ParticleBounds`, `interface ParticlePointer`, `REFERENCE_FRAME_MS`, `MAX_FRAME_MS = 50`, `frameScale(deltaMs: number): number`, `stepParticles(particles: Particle[], scale: number, bounds: ParticleBounds, pointer: ParticlePointer | null): void`. Los `@Input` del componente (`density`, `interactive`, `mode`) no cambian.

- [ ] **Step 1: Escribir los specs que fallan**

Crear `frontend/src/app/shared/ui/particle-field.util.spec.ts`:

```ts
import { MAX_FRAME_MS, Particle, REFERENCE_FRAME_MS, frameScale, stepParticles } from './particle-field.util';

const particle = (over: Partial<Particle> = {}): Particle => ({
  x: 50, y: 50, vx: 1, vy: 0.5, radius: 2, alpha: 0.3, ...over,
});
const bounds = { width: 200, height: 100 };

describe('frameScale', () => {
  it('vale 1 para un cuadro de 60 fps y 0,5 para uno de 120 fps', () => {
    expect(frameScale(REFERENCE_FRAME_MS)).toBeCloseTo(1);
    expect(frameScale(REFERENCE_FRAME_MS / 2)).toBeCloseTo(0.5);
  });

  it('limita los saltos largos (pestaña en segundo plano) y los deltas negativos', () => {
    expect(frameScale(5_000)).toBeCloseTo(MAX_FRAME_MS / REFERENCE_FRAME_MS);
    expect(frameScale(-10)).toBe(0);
  });
});

describe('stepParticles', () => {
  it('avanza en proporción al tiempo transcurrido', () => {
    const p = particle();
    stepParticles([p], 2, bounds, null);
    expect(p.x).toBeCloseTo(52);
    expect(p.y).toBeCloseTo(51);
  });

  it('amortigua según el tiempo transcurrido', () => {
    const p = particle();
    stepParticles([p], 2, bounds, null);
    expect(p.vx).toBeCloseTo(Math.pow(0.995, 2));
  });

  it('rebota al salir del área', () => {
    const p = particle({ x: 199.5, vx: 1 });
    stepParticles([p], 1, bounds, null);
    expect(p.vx).toBeLessThan(0);
  });

  it('el puntero cercano empuja la partícula y el lejano no', () => {
    const near = particle({ x: 110, y: 50, vx: 0, vy: 0 });
    const far = particle({ x: 110, y: 50, vx: 0, vy: 0 });
    stepParticles([near], 1, bounds, { x: 100, y: 50 });
    stepParticles([far], 1, bounds, { x: -1000, y: -1000 });
    expect(near.vx).toBeGreaterThan(0);
    expect(far.vx).toBe(0);
  });
});
```

Crear `frontend/src/app/shared/ui/siep-particle-layer.contract.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'siep-particle-layer.component.ts'), 'utf-8');

describe('capa de partículas: trabajo por cuadro', () => {
  it('anima fuera de la zona de Angular', () => {
    expect(source).toMatch(/this\.zone\.runOutsideAngular\(\(\) => \{\s*this\.frameId = requestAnimationFrame/);
  });

  it('no fuerza layout en cada cuadro: el tamaño se lee solo al redimensionar', () => {
    expect(source).not.toMatch(/nativeElement\.clientWidth/);
    expect(source).not.toMatch(/nativeElement\.clientHeight/);
  });

  it('se pausa cuando sale de la pantalla', () => {
    expect(source).toContain('new IntersectionObserver(');
  });

  it('avanza por tiempo con el helper puro', () => {
    expect(source).toContain('stepParticles(this.particles, scale');
  });
});
```

- [ ] **Step 2: Ejecutar los specs y verlos fallar**

Run: `npm test --prefix frontend -- --runInBand src/app/shared/ui/particle-field.util.spec.ts src/app/shared/ui/siep-particle-layer.contract.spec.ts`
Expected: FAIL (módulo inexistente; el contrato falla en los cuatro `it`).

- [ ] **Step 3: Crear el util**

Crear `frontend/src/app/shared/ui/particle-field.util.ts`:

```ts
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

export interface ParticleBounds {
  width: number;
  height: number;
}

export interface ParticlePointer {
  x: number;
  y: number;
}

/** Las velocidades están calibradas a un cuadro de 60 fps. */
export const REFERENCE_FRAME_MS = 1000 / 60;
/** Tope del delta: al volver de segundo plano las partículas no saltan. */
export const MAX_FRAME_MS = 50;

const POINTER_RADIUS = 120;
const POINTER_FORCE = 0.04;
const DAMPING_PER_FRAME = 0.995;

/** Cuántos cuadros de referencia representa `deltaMs`. */
export function frameScale(deltaMs: number): number {
  return Math.min(Math.max(deltaMs, 0), MAX_FRAME_MS) / REFERENCE_FRAME_MS;
}

/** Avanza el campo de partículas `scale` cuadros de referencia (muta en el sitio). */
export function stepParticles(
  particles: Particle[],
  scale: number,
  bounds: ParticleBounds,
  pointer: ParticlePointer | null,
): void {
  const damping = Math.pow(DAMPING_PER_FRAME, scale);
  for (const particle of particles) {
    particle.x += particle.vx * scale;
    particle.y += particle.vy * scale;

    if (particle.x < 0 || particle.x > bounds.width) {
      particle.vx *= -1;
    }
    if (particle.y < 0 || particle.y > bounds.height) {
      particle.vy *= -1;
    }

    if (pointer) {
      const dx = particle.x - pointer.x;
      const dy = particle.y - pointer.y;
      const dist = Math.hypot(dx, dy);
      if (dist < POINTER_RADIUS && dist > 0) {
        const force = (POINTER_RADIUS - dist) / POINTER_RADIUS;
        particle.vx += (dx / dist) * force * POINTER_FORCE * scale;
        particle.vy += (dy / dist) * force * POINTER_FORCE * scale;
      }
    }

    particle.vx *= damping;
    particle.vy *= damping;
  }
}
```

- [ ] **Step 4: Reescribir el componente**

Reemplazar el contenido completo de `frontend/src/app/shared/ui/siep-particle-layer.component.ts` por:

```ts
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { Particle, frameScale, stepParticles } from './particle-field.util';

type ParticleDensity = 'low' | 'medium' | 'high';

@Component({
  selector: 'app-siep-particle-layer',
  standalone: true,
  template: `<canvas #canvas class="siep-particle-layer__canvas" aria-hidden="true"></canvas>`,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: block;
      overflow: hidden;
      pointer-events: none;
      z-index: 0;
    }

    .siep-particle-layer__canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
  `,
})
export class SiepParticleLayerComponent implements AfterViewInit, OnDestroy {
  @Input() density: ParticleDensity = 'medium';
  @Input() interactive = false;
  @Input() mode: 'background' | 'foreground' = 'background';

  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private ctx: CanvasRenderingContext2D | null = null;
  private particles: Particle[] = [];
  private frameId = 0;
  private lastFrameAt: number | null = null;
  /** Tamaño del host en px CSS; se lee solo al redimensionar, nunca por cuadro. */
  private width = 0;
  private height = 0;
  private visible = true;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private mouseX = -1000;
  private mouseY = -1000;
  private reducedMotion = false;
  private boundPointerMove = (event: PointerEvent) => this.onPointerMove(event);

  ngAfterViewInit(): void {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) {
      return;
    }

    // Observadores y puntero fuera de la zona: ninguno cambia estado de Angular.
    this.zone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.host.nativeElement);

      if (typeof IntersectionObserver !== 'undefined') {
        this.intersectionObserver = new IntersectionObserver(([entry]) => {
          this.visible = entry?.isIntersecting ?? true;
          if (this.visible) {
            this.start();
          } else {
            this.stop();
          }
        });
        this.intersectionObserver.observe(this.host.nativeElement);
      }

      if (this.interactive && !this.reducedMotion) {
        this.host.nativeElement.closest('.landing-hero')?.addEventListener('pointermove', this.boundPointerMove);
      }
    });
    this.resize();

    if (this.reducedMotion) {
      this.drawStatic();
    } else {
      this.start();
    }
  }

  ngOnDestroy(): void {
    this.stop();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.host.nativeElement.closest('.landing-hero')?.removeEventListener('pointermove', this.boundPointerMove);
  }

  private particleCount(): number {
    const area = this.width * this.height;
    const densityFactor = this.density === 'low' ? 0.00004 : this.density === 'high' ? 0.0001 : 0.00007;
    return Math.max(18, Math.min(90, Math.round(area * densityFactor)));
  }

  private resize(): void {
    const canvas = this.canvasRef.nativeElement;
    const { clientWidth, clientHeight } = this.host.nativeElement;
    this.width = clientWidth;
    this.height = clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
    canvas.style.width = `${clientWidth}px`;
    canvas.style.height = `${clientHeight}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.seedParticles();
    if (this.reducedMotion) {
      this.drawStatic();
    }
  }

  private seedParticles(): void {
    const count = this.particleCount();
    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      radius: 1 + Math.random() * 2.2,
      alpha: 0.18 + Math.random() * 0.42,
    }));
  }

  private onPointerMove(event: PointerEvent): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.mouseX = event.clientX - rect.left;
    this.mouseY = event.clientY - rect.top;
  }

  private start(): void {
    if (this.frameId || this.reducedMotion || !this.visible || !this.ctx) {
      return;
    }
    // Sin delta previo: el primer cuadro tras reanudar avanza uno de referencia, sin salto.
    this.lastFrameAt = null;
    this.zone.runOutsideAngular(() => {
      this.frameId = requestAnimationFrame(now => this.frame(now));
    });
  }

  private stop(): void {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  private frame(now: number): void {
    const scale = this.lastFrameAt === null ? 1 : frameScale(now - this.lastFrameAt);
    this.lastFrameAt = now;
    const pointer = this.interactive ? { x: this.mouseX, y: this.mouseY } : null;
    stepParticles(this.particles, scale, { width: this.width, height: this.height }, pointer);
    this.draw();
    this.frameId = requestAnimationFrame(next => this.frame(next));
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, this.width, this.height);

    for (const particle of this.particles) {
      ctx.beginPath();
      ctx.fillStyle = this.mode === 'foreground'
        ? `rgba(196, 181, 253, ${particle.alpha})`
        : `rgba(167, 139, 250, ${particle.alpha})`;
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawStatic(): void {
    this.draw();
  }
}
```

- [ ] **Step 5: Ejecutar los specs y verlos pasar**

Run: `npm test --prefix frontend -- --runInBand src/app/shared/ui/particle-field.util.spec.ts src/app/shared/ui/siep-particle-layer.contract.spec.ts src/app/features/login`
Expected: PASS (los specs del login montan el componente; en jsdom `getContext` devuelve `null` y el componente sale temprano, igual que antes).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/shared/ui/particle-field.util.ts frontend/src/app/shared/ui/particle-field.util.spec.ts frontend/src/app/shared/ui/siep-particle-layer.contract.spec.ts frontend/src/app/shared/ui/siep-particle-layer.component.ts
git commit -m "perf(portada): partículas fuera de Angular, por tiempo y en pausa fuera de pantalla"
```

---

### Task 5: Quitar el desenfoque de los paneles casi opacos del juego

**Files:**
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts` (`.objective-card` ~427; `.case-intro-overlay` ~700)
- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.ts` (`.dialogue-strip` ~122)
- Modify: `frontend/src/app/features/simulator/journal-panel.component.ts` (`.journal-modal` ~121)
- Modify: `frontend/src/app/features/simulator/simulation-hud.component.ts` (`.hud-shell` ~166-167; `.settings-menu` ~301)
- Create: `frontend/src/app/features/simulator/overlay-blur.contract.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Escribir el spec que falla**

Crear `frontend/src/app/features/simulator/overlay-blur.contract.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (file: string) => readFileSync(join(__dirname, file), 'utf-8');

/** Cuerpo de la PRIMERA regla cuyo selector es exactamente `selector`. */
function ruleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`No se encontró la regla ${selector}`);
  return match[2];
}

describe('paneles del juego sin desenfoque caro', () => {
  const opaque: Array<[string, string]> = [
    ['simulation-play.component.ts', '.objective-card'],
    ['simulation-play.component.ts', '.case-intro-overlay'],
    ['dialogue-panel.component.ts', '.dialogue-strip'],
    ['journal-panel.component.ts', '.journal-modal'],
    ['simulation-hud.component.ts', '.hud-shell'],
    ['simulation-hud.component.ts', '.settings-menu'],
  ];

  it.each(opaque)('%s %s no desenfoca lo que tiene detrás', (file, selector) => {
    expect(ruleBody(read(file), selector)).not.toMatch(/backdrop-filter/);
  });

  it('el HUD compensa con un fondo algo más opaco', () => {
    expect(ruleBody(read('simulation-hud.component.ts'), '.hud-shell'))
      .toContain('background: linear-gradient(180deg, rgba(22,18,42,.92), rgba(8,12,18,.9));');
  });

  it('se conservan los vidrios translúcidos a propósito', () => {
    const play = read('simulation-play.component.ts');
    expect(ruleBody(play, '.right-panel')).toContain('backdrop-filter: blur(18px) saturate(120%);');
    expect(ruleBody(play, '.overlay-backdrop')).toContain('backdrop-filter: blur(3px);');
  });
});
```

- [ ] **Step 2: Ejecutar el spec y verlo fallar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/overlay-blur.contract.spec.ts`
Expected: FAIL (6 casos de `it.each` y el del HUD).

- [ ] **Step 3: Quitar los filtros**

En `simulation-play.component.ts`, dentro de `.objective-card` (la primera regla, ~línea 414), borrar la línea:

```css
      backdrop-filter: blur(10px);
```

En `simulation-play.component.ts`, dentro de `.case-intro-overlay` (~línea 690), borrar la línea:

```css
      backdrop-filter: blur(8px);
```

No tocar la regla `.intro-video-overlay` (~línea 606): el plan 13 la elimina entera.

En `dialogue-panel.component.ts`, dentro de `.dialogue-strip` (~línea 113), borrar la línea:

```css
      backdrop-filter: blur(16px) saturate(110%);
```

(`.dialogue-strip--side` conserva su `backdrop-filter: none;`, que ahora es redundante pero inofensivo; no tocarlo.)

En `journal-panel.component.ts`, dentro de `.journal-modal` (~línea 108), borrar la línea:

```css
      backdrop-filter: blur(20px) saturate(115%);
```

En `simulation-hud.component.ts`, dentro de `.hud-shell` (~línea 163), reemplazar:

```css
      background: linear-gradient(180deg, rgba(22,18,42,.9), rgba(8,12,18,.84));
      backdrop-filter: blur(18px) saturate(120%);
```

por:

```css
      background: linear-gradient(180deg, rgba(22,18,42,.92), rgba(8,12,18,.9));
```

En `simulation-hud.component.ts`, dentro de `.settings-menu` (~línea 288), borrar la línea:

```css
      backdrop-filter: blur(18px) saturate(130%);
```

- [ ] **Step 4: Ejecutar el spec y verlo pasar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/overlay-blur.contract.spec.ts src/app/features/simulator/dialogue-panel.motion.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/dialogue-panel.component.ts frontend/src/app/features/simulator/journal-panel.component.ts frontend/src/app/features/simulator/simulation-hud.component.ts frontend/src/app/features/simulator/overlay-blur.contract.spec.ts
git commit -m "perf(juego): quitar el desenfoque de los paneles casi opacos"
```

---

## Verificación final

- [ ] `npm run test:frontend` → todo en verde.
- [ ] `npm run build:frontend` → sin errores ni avisos nuevos de presupuesto.
- [ ] `npm run test:e2e -- living-world full-case` → en verde. Estos e2e cruzan salas (tarea 1) y dependen de la posición persistida (tarea 2).
- [ ] **Comprobación a mano, en Chrome con DevTools → Performance, CPU sin limitar:**
  1. Grabar 10 s caminando en una sala. Antes del plan, la pista *Main* muestra una tarea de Angular (`ApplicationRef.tick`) por cuadro. Después, a lo sumo unas 8 por segundo mientras se camina y ninguna periódica con el jugador quieto.
  2. Con el jugador quieto y la música ya estable, no debe aparecer ningún `setInterval` cada 33 ms.
  3. Entrar y salir de la misma sala diez veces: los pulsos de los marcadores laten al mismo ritmo que la primera vez.
  4. En la portada, bajar hasta que el héroe salga de pantalla: la pista *Main* queda en reposo. Al subir, las partículas siguen donde estaban, sin salto.
  5. Mirar el HUD, la tarjeta de objetivo, el diálogo y el diario sobre la sala más clara: el texto se lee igual que antes.
