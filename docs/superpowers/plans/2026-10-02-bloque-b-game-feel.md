# Bloque B — Game feel que reacciona al caso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cumplir el «Criterio de Done» del bloque B del PLAN MAESTRO TOTAL: viñeta oscura en los bordes, que pulsa en rojo-violeta con estrés > 85, destello al cambiar de sala y sacudida suave en decisiones de alto impacto.

**Architecture:** `master` ya pinta una viñeta procedural estática por tono del mapa (`applyLightingOverlay`, Graphics sin shader) y hace fundidos al cambiar de sala. En lugar del `PostFXPipeline` WebGL que proponía el plan de junio (duplicaría esa viñeta y no existe en modo Canvas), se añade una **segunda capa Graphics de crisis**, cuya opacidad la decide el estrés del intento. El destello y la sacudida usan los efectos de cámara de Phaser. Las decisiones (qué opacidad, si pulsa, si hay destello o sacudida) viven en una utilidad pura con spec; la escena solo las aplica. Con movimiento reducido no hay pulso, ni destello, ni sacudida.

**Tech Stack:** Angular 21 (signals, `input()`), Phaser 3, Jest (ts-jest sin render de plantillas).

**Spec:** [`docs/PLAN_MAESTRO_TOTAL.md`](../../PLAN_MAESTRO_TOTAL.md), sección «BLOQUE B — WebGL Pipeline + GameFeelSystem», y la hoja de ruta [`docs/audits/2026-10-02-brechas-plan-maestro-total.md`](../../audits/2026-10-02-brechas-plan-maestro-total.md).

## Global Constraints

- REGLA-009: Phaser sigue con `pixelArt: true`, `roundPixels: true` y zoom 2×; no se toca la configuración de `new Phaser.Game`.
- REGLA-010: no se añade CSS global; todo ocurre dentro de la escena Phaser.
- Sin dependencias nuevas.
- Movimiento reducido (`callbacks.reduceMotion`): sin pulso, sin destello y sin sacudida. La viñeta estática sí se muestra.
- Un solo destello por cambio de sala (WCAG 2.3.1: nunca más de tres destellos por segundo).
- Cada reconstrucción de sala hace `this.tweens.killAll(); this.children.removeAll(true);`; `game-world.frame-budget.spec.ts` exige que sigan siendo exactamente 2 y protegidas. No añadir otra.
- Comentarios y textos en español, con el tono del archivo. Los `.ts` del frontend usan CRLF; el editor debe conservarlo.
- Verificación final: `npm run test:frontend` y `npm run build:frontend` desde la raíz del repo.

## Review Focus

1. **Movimiento reducido a mitad de partida** mientras la viñeta pulsa: el pulso debe pararse y quedar la opacidad estática (Task 2, contrato `setReduceMotion` reaplica el estado).
2. **Re-render de la misma sala** (al persistir la posición se repinta sin cambiar de sala): no debe destellar (Task 1, `roomEntryFlash` con la misma clave).
3. **El estrés llega antes de que Phaser cree la escena** (boot): debe aplicarse en el primer render (Task 2, contrato del boot + `setStressLevel` seguro sin escena lista).
4. **Cambios de estrés seguidos** (decisión + herramienta en segundos): nunca dos pulsos vivos a la vez (Task 2, contrato: `applyCrisisState` detiene el pulso anterior).
5. **Estrés fuera de rango o no numérico** desde la API: sin excepción y sin viñeta de crisis (Task 1).
6. **Salas premium con capa de luz pintada** (`paintedLayers` incluye `lighting`): se omite la viñeta genérica, pero la de crisis sí debe aparecer (Task 2, contrato: dos llamadas a `applyCrisisVignette` fuera del `if`).

---

### Task 1: Utilidad pura de game feel

**Files:**
- Create: `frontend/src/app/features/simulator/game-feel.util.ts`
- Test: `frontend/src/app/features/simulator/game-feel.util.spec.ts`

**Interfaces:**
- Consumes: `SimulationFeedback` de `frontend/src/app/core/models/simulation.model.ts` (campos `classification: 'ADEQUATE' | 'RISKY' | 'INADEQUATE'` y `prohibitedConduct: boolean`).
- Produces:
  - `CRISIS_VIGNETTE_TINT: number` (0x4a0f2e), `CRISIS_VIGNETTE_START = 50`, `CRISIS_PULSE_THRESHOLD = 85`
  - `interface CrisisVignetteState { alpha: number; pulse: { from: number; to: number; durationMs: number } | null }`
  - `crisisVignetteState(stress: number, reduceMotion: boolean): CrisisVignetteState`
  - `interface CameraShake { durationMs: number; intensity: number }`
  - `decisionShake(feedback: Pick<SimulationFeedback, 'classification' | 'prohibitedConduct'> | null | undefined, reduceMotion: boolean): CameraShake | null`
  - `interface CameraFlash { durationMs: number; rgb: [number, number, number] }`
  - `roomEntryFlash(previousKey: string | null, nextKey: string, reduceMotion: boolean): CameraFlash | null`

- [ ] **Step 1: Write the failing test**

```typescript
import {
  CRISIS_PULSE_THRESHOLD,
  CRISIS_VIGNETTE_START,
  crisisVignetteState,
  decisionShake,
  roomEntryFlash,
} from './game-feel.util';

describe('game-feel.util', () => {
  describe('crisisVignetteState', () => {
    it('no se ve con estrés bajo ni con valores que no son números', () => {
      expect(crisisVignetteState(0, false)).toEqual({ alpha: 0, pulse: null });
      expect(crisisVignetteState(CRISIS_VIGNETTE_START, false)).toEqual({ alpha: 0, pulse: null });
      expect(crisisVignetteState(Number.NaN, false)).toEqual({ alpha: 0, pulse: null });
      expect(crisisVignetteState(-30, false)).toEqual({ alpha: 0, pulse: null });
    });

    it('crece con el estrés hasta el umbral, sin pulso', () => {
      const mid = crisisVignetteState(67.5, false);
      expect(mid.pulse).toBeNull();
      expect(mid.alpha).toBeCloseTo(0.28, 2);
      expect(crisisVignetteState(CRISIS_PULSE_THRESHOLD, false)).toEqual({ alpha: 0.55, pulse: null });
    });

    it('pulsa por encima de 85 y se limita a 100', () => {
      const crisis = { alpha: 0.55, pulse: { from: 0.55, to: 0.85, durationMs: 800 } };
      expect(crisisVignetteState(86, false)).toEqual(crisis);
      expect(crisisVignetteState(250, false)).toEqual(crisis);
    });

    it('con movimiento reducido la crisis se ve fija, sin pulso', () => {
      expect(crisisVignetteState(95, true)).toEqual({ alpha: 0.7, pulse: null });
      expect(crisisVignetteState(70, true).pulse).toBeNull();
    });
  });

  describe('decisionShake', () => {
    it('sacude más fuerte una conducta prohibida que una riesgosa o inadecuada', () => {
      expect(decisionShake({ classification: 'RISKY', prohibitedConduct: true }, false))
        .toEqual({ durationMs: 260, intensity: 0.006 });
      expect(decisionShake({ classification: 'RISKY', prohibitedConduct: false }, false))
        .toEqual({ durationMs: 200, intensity: 0.003 });
      expect(decisionShake({ classification: 'INADEQUATE', prohibitedConduct: false }, false))
        .toEqual({ durationMs: 200, intensity: 0.003 });
    });

    it('no sacude una decisión adecuada, sin feedback ni con movimiento reducido', () => {
      expect(decisionShake({ classification: 'ADEQUATE', prohibitedConduct: false }, false)).toBeNull();
      expect(decisionShake(null, false)).toBeNull();
      expect(decisionShake(undefined, false)).toBeNull();
      expect(decisionShake({ classification: 'RISKY', prohibitedConduct: true }, true)).toBeNull();
    });
  });

  describe('roomEntryFlash', () => {
    it('destella al pasar a otra sala', () => {
      expect(roomEntryFlash('hospital-urgencias', 'hospital-sala-escucha', false))
        .toEqual({ durationMs: 120, rgb: [214, 222, 236] });
    });

    it('no destella en la primera escena, al repintar la misma sala ni con movimiento reducido', () => {
      expect(roomEntryFlash(null, 'hospital-urgencias', false)).toBeNull();
      expect(roomEntryFlash('hospital-urgencias', 'hospital-urgencias', false)).toBeNull();
      expect(roomEntryFlash('hospital-urgencias', 'comisaria-recepcion', true)).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `frontend/`): `npx jest --runInBand src/app/features/simulator/game-feel.util.spec.ts`
Expected: FAIL — `Cannot find module './game-feel.util'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { SimulationFeedback } from '../../core/models/simulation.model';

/** Tinte rojo-violeta de la viñeta de crisis; no depende del tono del mapa. */
export const CRISIS_VIGNETTE_TINT = 0x4a0f2e;
/** Hasta este estrés la viñeta de crisis no se ve. */
export const CRISIS_VIGNETTE_START = 50;
/** Por encima de este estrés la viñeta pulsa (Criterio de Done del bloque B). */
export const CRISIS_PULSE_THRESHOLD = 85;

export interface CrisisVignetteState {
  /** Opacidad de la capa de crisis (0 = invisible). */
  alpha: number;
  /** Pulso de ida y vuelta; null = fija. */
  pulse: { from: number; to: number; durationMs: number } | null;
}

export interface CameraShake { durationMs: number; intensity: number; }
export interface CameraFlash { durationMs: number; rgb: [number, number, number]; }

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Cuánto se ve la viñeta de crisis según el stressIndex (0-100) del intento.
 * Un valor que no es un número no dibuja nada: un efecto visual no debe asustar
 * por un dato roto.
 */
export function crisisVignetteState(stress: number, reduceMotion: boolean): CrisisVignetteState {
  const s = Number.isFinite(stress) ? Math.min(100, Math.max(0, stress)) : 0;
  if (s <= CRISIS_VIGNETTE_START) return { alpha: 0, pulse: null };
  if (s <= CRISIS_PULSE_THRESHOLD) {
    const t = (s - CRISIS_VIGNETTE_START) / (CRISIS_PULSE_THRESHOLD - CRISIS_VIGNETTE_START);
    return { alpha: round2(0.55 * t), pulse: null };
  }
  if (reduceMotion) return { alpha: 0.7, pulse: null };
  return { alpha: 0.55, pulse: { from: 0.55, to: 0.85, durationMs: 800 } };
}

/** Sacudida de cámara por una decisión de alto impacto; null si no corresponde. */
export function decisionShake(
  feedback: Pick<SimulationFeedback, 'classification' | 'prohibitedConduct'> | null | undefined,
  reduceMotion: boolean,
): CameraShake | null {
  if (!feedback || reduceMotion) return null;
  if (feedback.prohibitedConduct) return { durationMs: 260, intensity: 0.006 };
  if (feedback.classification === 'RISKY' || feedback.classification === 'INADEQUATE') {
    return { durationMs: 200, intensity: 0.003 };
  }
  return null;
}

/**
 * Destello suave al pasar a otra sala. Nunca en la primera escena (ahí va el
 * fundido de entrada) ni al repintar la misma sala.
 */
export function roomEntryFlash(
  previousKey: string | null,
  nextKey: string,
  reduceMotion: boolean,
): CameraFlash | null {
  if (reduceMotion || !previousKey || previousKey === nextKey) return null;
  return { durationMs: 120, rgb: [214, 222, 236] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `frontend/`): `npx jest --runInBand src/app/features/simulator/game-feel.util.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/simulator/game-feel.util.ts frontend/src/app/features/simulator/game-feel.util.spec.ts
git commit -m "feat(game): utilidad de game feel (viñeta de crisis, destello y sacudida)"
```

---

### Task 2: Viñeta de crisis y destello de sala en la escena

**Files:**
- Modify: `frontend/src/app/features/simulator/game-world.component.ts` (clase `DataDrivenWorldScene` y `GameWorldComponent`)
- Test: `frontend/src/app/features/simulator/game-world.game-feel.contract.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `crisisVignetteState`, `roomEntryFlash`, `CRISIS_VIGNETTE_TINT` (Task 1); `DEPTH.LIGHTING` de `depth-sort.util.ts`.
- Produces:
  - Escena: `setStressLevel(level: number): void` (seguro antes de `create()`).
  - Componente: `readonly stressLevel = input(0)`, reenviado a la escena en el boot y en `ngOnChanges`.

- [ ] **Step 1: Write the failing test**

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

describe('game-world: game feel del bloque B', () => {
  it('el componente recibe el estrés y lo pasa a la escena en el arranque y en cada cambio', () => {
    expect(source).toContain('readonly stressLevel = input(0);');
    expect(source).toContain("if (changes['stressLevel']) this.scene?.setStressLevel(this.stressLevel());");
    expect(source).toMatch(/this\.scene = new DataDrivenWorldScene\(\{[\s\S]*?\}\);\s*this\.scene\.setStressLevel\(this\.stressLevel\(\)\);/);
  });

  it('las dos rutas de render pintan la viñeta de crisis y el destello pendiente, también en salas con luz pintada', () => {
    expect(source.match(/\n {4}this\.applyCrisisVignette\(\);/g) ?? []).toHaveLength(2);
    expect(source.match(/\n {4}this\.playPendingRoomFlash\(\);/g) ?? []).toHaveLength(2);
  });

  it('el destello se decide solo donde se cambia de sala de verdad', () => {
    // setWorld: otro mapa (decisión o puerta). Un refresco del mismo mapa no borra uno pendiente.
    expect(source).toMatch(/setWorld\(world: SimulationWorldState\) \{\s*this\.pendingRoomFlash = roomEntryFlash\(this\.world\?\.map\.key \?\? null, world\.map\.key, this\.callbacks\.reduceMotion\)\s*\?\? this\.pendingRoomFlash;/);
    // transitionToRoom: el jugador cruza una salida del ScenarioConfig.
    expect(source).toMatch(/if \(!roomConfig\) return;\s*this\.pendingRoomFlash = roomEntryFlash\(this\.currentRoomKey \|\| null, targetRoomKey, this\.callbacks\.reduceMotion\)\s*\?\? this\.pendingRoomFlash;/);
  });

  it('la crisis la decide la utilidad pura y nunca deja dos pulsos vivos', () => {
    expect(source).toMatch(/private applyCrisisState\(\): void \{[\s\S]*?this\.crisisPulse\?\.stop\(\);[\s\S]*?crisisVignetteState\(this\.stressLevel, this\.callbacks\.reduceMotion\)/);
    expect(source).toMatch(/this\.crisisPulse = this\.tweens\.add\(\{[\s\S]*?yoyo: true,[\s\S]*?repeat: -1/);
    expect(source).toContain('setDepth(DEPTH.LIGHTING + 1)');
  });

  it('activar movimiento reducido reaplica la crisis y el destello pendiente se consume una sola vez', () => {
    expect(source).toMatch(/setReduceMotion\(reduced: boolean\) \{\s*this\.callbacks\.reduceMotion = reduced;\s*this\.applyCrisisState\(\);\s*\}/);
    expect(source).toMatch(/private playPendingRoomFlash\(\): void \{\s*const flash = this\.pendingRoomFlash;\s*this\.pendingRoomFlash = null;/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `frontend/`): `npx jest --runInBand src/app/features/simulator/game-world.game-feel.contract.spec.ts`
Expected: FAIL — las cinco pruebas, porque nada de esto existe aún.

- [ ] **Step 3: Write minimal implementation**

3a. Importar la utilidad junto a los demás imports de `./*.util` del archivo:

```typescript
import { CameraFlash, CRISIS_VIGNETTE_TINT, crisisVignetteState, roomEntryFlash } from './game-feel.util';
```

3b. Campos nuevos en `DataDrivenWorldScene`, junto a `private firstSceneFadeDone = false;`:

```typescript
  /** stressIndex del intento (0-100); lo fija Angular y sobrevive a los re-render. */
  private stressLevel = 0;
  /** Capa de crisis sobre la viñeta de tono; se recrea en cada render. */
  private crisisVignette?: Phaser.GameObjects.Graphics;
  private crisisPulse?: Phaser.Tweens.Tween;
  /** Destello decidido al cambiar de sala; se dispara al terminar el render. */
  private pendingRoomFlash: CameraFlash | null = null;
```

3c. El destello se decide solo donde se cambia de sala de verdad. No usar `currentRoomKey` como memoria: `renderWorld()` lo vacía en cada render del modo sin ScenarioConfig.

Primera línea de `setWorld(world: SimulationWorldState) {`, antes del comentario «Cambio de mapa…»:

```typescript
    this.pendingRoomFlash = roomEntryFlash(this.world?.map.key ?? null, world.map.key, this.callbacks.reduceMotion)
      ?? this.pendingRoomFlash;
```

En `transitionToRoom(...)`, justo después de `if (!roomConfig) return;`:

```typescript
    this.pendingRoomFlash = roomEntryFlash(this.currentRoomKey || null, targetRoomKey, this.callbacks.reduceMotion)
      ?? this.pendingRoomFlash;
```

(La primera hidratación tiene `this.world` sin definir y la primera sala tiene `currentRoomKey` vacío: `roomEntryFlash` devuelve null y ahí manda el fundido de entrada.)

3d. Reemplazar `setReduceMotion` por:

```typescript
  setReduceMotion(reduced: boolean) {
    this.callbacks.reduceMotion = reduced;
    this.applyCrisisState();
  }

  /** Seguro antes de `create()`: la capa se pinta con este valor en el primer render. */
  setStressLevel(level: number) {
    this.stressLevel = level;
    this.applyCrisisState();
  }
```

3e. Junto a `applyLightingOverlay()`, añadir:

```typescript
  /**
   * Viñeta de crisis: la misma banda que la de tono pero rojo-violeta, y con su
   * opacidad atada al estrés del intento. Se pinta también en salas con luz
   * pintada, porque es estado del caso y no decoración.
   */
  private applyCrisisVignette(): void {
    this.crisisPulse = undefined; // el killAll() del re-render ya lo detuvo
    const cam = this.cameras.main;
    const w = cam.width, h = cam.height;
    const g = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.LIGHTING + 1);
    const band = Math.round(Math.min(w, h) * 0.18);
    for (let i = 0; i < band; i++) {
      g.lineStyle(1, CRISIS_VIGNETTE_TINT, (1 - i / band) ** 2);
      g.strokeRect(i, i, w - i * 2, h - i * 2);
    }
    this.crisisVignette = g;
    this.applyCrisisState();
  }

  private applyCrisisState(): void {
    const g = this.crisisVignette;
    if (!g || !g.scene) return;
    this.crisisPulse?.stop();
    this.crisisPulse = undefined;
    const state = crisisVignetteState(this.stressLevel, this.callbacks.reduceMotion);
    g.setAlpha(state.alpha);
    if (state.pulse) {
      this.crisisPulse = this.tweens.add({
        targets: g,
        alpha: { from: state.pulse.from, to: state.pulse.to },
        duration: state.pulse.durationMs,
        ease: 'Sine.InOut',
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private playPendingRoomFlash(): void {
    const flash = this.pendingRoomFlash;
    this.pendingRoomFlash = null;
    if (flash) this.cameras.main.flash(flash.durationMs, ...flash.rgb);
  }
```

3f. Final de `renderWorld()` (ruta sin ScenarioConfig). Debe quedar:

```typescript
    this.buildGuide();
    this.applyLightingOverlay();
    this.applyCrisisVignette();
    this.playPendingRoomFlash();
    this.playIntroFade();
    this.callbacks.onReady();
```

3g. Final de `renderRoom()`. Debe quedar (la crisis va **fuera** del `if` de luz pintada):

```typescript
    if (!sceneMetadata?.paintedLayers.includes('lighting')) this.applyLightingOverlay();
    this.applyCrisisVignette();
    this.playPendingRoomFlash();
    this.playIntroFade();
    this.callbacks.onReady();
```

3h. En `GameWorldComponent`, junto a `readonly reduceMotion = input<boolean | null>(null);`:

```typescript
  /** stressIndex del intento (0-100): mueve la viñeta de crisis. */
  readonly stressLevel = input(0);
```

En `ngOnChanges`, tras la línea de `reduceMotion`:

```typescript
    if (changes['stressLevel']) this.scene?.setStressLevel(this.stressLevel());
```

En `boot()`, justo después del cierre `});` de `this.scene = new DataDrivenWorldScene({ ... });`:

```typescript
      this.scene.setStressLevel(this.stressLevel());
```

- [ ] **Step 4: Run tests to verify they pass**

Run (desde `frontend/`): `npx jest --runInBand src/app/features/simulator/game-world.game-feel.contract.spec.ts src/app/features/simulator/game-world.frame-budget.spec.ts`
Expected: PASS. `frame-budget` sigue viendo exactamente 2 `this.children.removeAll(true);` protegidos.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/simulator/game-world.component.ts frontend/src/app/features/simulator/game-world.game-feel.contract.spec.ts
git commit -m "feat(game): viñeta de crisis atada al estrés y destello al cambiar de sala"
```

---

### Task 3: Sacudida por decisión de alto impacto y cableado en la partida

**Files:**
- Modify: `frontend/src/app/features/simulator/game-world.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts` (plantilla de `<app-game-world>` y `chooseDecision`)
- Test: `frontend/src/app/features/simulator/game-world.game-feel.contract.spec.ts` (ampliar)
- Test: `frontend/src/app/features/simulator/simulation-play.game-feel.contract.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `decisionShake` (Task 1); `stressLevel` input y `setStressLevel` (Task 2); `SimulationFeedback` del modelo.
- Produces: `GameWorldComponent.playDecisionImpact(feedback: SimulationFeedback | null): void`.

- [ ] **Step 1: Write the failing tests**

Añadir al `describe` de `game-world.game-feel.contract.spec.ts`:

```typescript
  it('la sacudida por decisión la decide decisionShake y solo con la escena lista', () => {
    expect(source).toMatch(/playDecisionImpact\(feedback: Pick<SimulationFeedback, 'classification' \| 'prohibitedConduct'> \| null\): void \{\s*const shake = decisionShake\(feedback, this\.callbacks\.reduceMotion\);\s*if \(shake && this\.ready\) this\.cameras\.main\.shake\(shake\.durationMs, shake\.intensity\);/);
    expect(source).toMatch(/\n  playDecisionImpact\(feedback: SimulationFeedback \| null\) \{ this\.scene\?\.playDecisionImpact\(feedback\); \}/);
  });
```

Crear `simulation-play.game-feel.contract.spec.ts`:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

describe('simulation-play: game feel del bloque B', () => {
  it('el mundo recibe el estrés del intento', () => {
    expect(source).toContain('[stressLevel]="attempt()?.stressIndex ?? 0"');
  });

  it('la decisión sacude la cámara cuando llega la supervisión', () => {
    expect(source).toMatch(/window\.setTimeout\(\(\) => \{\s*this\.gameWorld\?\.playDecisionImpact\(updated\.feedback!\);\s*this\.dialogue\.set\(this\.buildSupervisionDialogue\(updated\.feedback!\)\);\s*\}, 400\);/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (desde `frontend/`): `npx jest --runInBand src/app/features/simulator/game-world.game-feel.contract.spec.ts src/app/features/simulator/simulation-play.game-feel.contract.spec.ts`
Expected: FAIL — la prueba nueva de la escena y las dos de la partida.

- [ ] **Step 3: Write minimal implementation**

3a. En `game-world.component.ts`, añadir `decisionShake` al import de Task 2:

```typescript
import { CameraFlash, CRISIS_VIGNETTE_TINT, crisisVignetteState, decisionShake, roomEntryFlash } from './game-feel.util';
```

y `SimulationFeedback` al import existente desde `'../../core/models/simulation.model'` (añadir el nombre a la lista ya existente de ese import).

3b. En `DataDrivenWorldScene`, junto a `setStressLevel`:

```typescript
  /** Sacudida de cámara por una decisión de alto impacto (nada con movimiento reducido). */
  playDecisionImpact(feedback: Pick<SimulationFeedback, 'classification' | 'prohibitedConduct'> | null): void {
    const shake = decisionShake(feedback, this.callbacks.reduceMotion);
    if (shake && this.ready) this.cameras.main.shake(shake.durationMs, shake.intensity);
  }
```

3c. En `GameWorldComponent`, junto a `transitionToRoom(...)`:

```typescript
  playDecisionImpact(feedback: SimulationFeedback | null) { this.scene?.playDecisionImpact(feedback); }
```

3d. En `simulation-play.component.ts`, en la etiqueta `<app-game-world ...>`, tras `[reduceMotion]="reduceMotion()"`:

```html
                [stressLevel]="attempt()?.stressIndex ?? 0"
```

3e. En `chooseDecision`, reemplazar:

```typescript
          if (updated.feedback) {
            window.setTimeout(() => this.dialogue.set(this.buildSupervisionDialogue(updated.feedback!)), 400);
          }
```

por:

```typescript
          if (updated.feedback) {
            window.setTimeout(() => {
              this.gameWorld?.playDecisionImpact(updated.feedback!);
              this.dialogue.set(this.buildSupervisionDialogue(updated.feedback!));
            }, 400);
          }
```

- [ ] **Step 4: Run tests to verify they pass**

Run (desde `frontend/`): `npx jest --runInBand src/app/features/simulator/game-world.game-feel.contract.spec.ts src/app/features/simulator/simulation-play.game-feel.contract.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/simulator/game-world.component.ts frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/game-world.game-feel.contract.spec.ts frontend/src/app/features/simulator/simulation-play.game-feel.contract.spec.ts
git commit -m "feat(game): sacudida en decisiones de alto impacto y estrés al mundo"
```

---

### Task 4: Verificación completa y cierre del bloque en la hoja de ruta

**Files:**
- Modify: `docs/audits/2026-10-02-brechas-plan-maestro-total.md` (fila del bloque B)

- [ ] **Step 1: Suites completas**

Run (desde la raíz): `npm run test:frontend` y `npm run build:frontend`
Expected: todas las suites en verde y build sin errores ni advertencias nuevas.

- [ ] **Step 2: Verificación en el navegador**

Con backend y frontend levantados (ver memoria del proyecto sobre `launch.json` del worktree), entrar como estudiante demo, abrir una partida y, en la consola del Browser pane (modo dev):

```javascript
const host = document.querySelector('app-game-world');
const world = window.ng.getComponent(host);
const scene = world.scene;
scene.setStressLevel(70);
const fija = { alpha: scene.crisisVignette.alpha, pulso: !!scene.crisisPulse };
scene.setStressLevel(92);
const crisis = { alpha: scene.crisisVignette.alpha, pulso: !!scene.crisisPulse?.isPlaying() };
scene.setReduceMotion(true);
const reducida = { alpha: scene.crisisVignette.alpha, pulso: !!scene.crisisPulse };
({ fija, crisis, reducida })
```

Expected: `fija` ≈ `{ alpha: 0.31, pulso: false }`, `crisis.pulso === true`, `reducida` = `{ alpha: 0.7, pulso: false }`. Si la escena no llega a `create()` con el panel oculto (limitación conocida del Browser pane), dejarlo anotado y apoyarse en las specs.

- [ ] **Step 3: Marcar el bloque B como hecho**

En la tabla de bloques de código de `docs/audits/2026-10-02-brechas-plan-maestro-total.md`, cambiar la fila de **B** a:

```markdown
| **B** WebGL Pipeline + GameFeel | ✅ Hecho (2026-10-02) | Viñeta de tono (`applyLightingOverlay`) + viñeta de crisis atada al estrés que pulsa > 85 (`applyCrisisVignette`), destello al cambiar de sala (`playPendingRoomFlash`), sacudida en decisiones de alto impacto (`playDecisionImpact`); reglas en `game-feel.util.ts` | — | Se usó Graphics en vez de `PostFXPipeline`: funciona también en Canvas y no duplica la viñeta existente |
```

- [ ] **Step 4: Commit**

```bash
git add docs/audits/2026-10-02-brechas-plan-maestro-total.md
git commit -m "docs(plan-maestro): bloque B cerrado en la hoja de ruta"
```
