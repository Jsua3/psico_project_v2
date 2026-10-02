# Personaje jugable con arte v1 (idle + walk) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el personaje del jugador se renderice con el arte v1 coherente (caminata de 6 frames, 4 direcciones reales) en vez del modular crudo, cableando las hojas v1 ya existentes por la vía baked probada.

**Architecture:** Utilidad pura nueva (`v1-avatar.util.ts`) que define el contrato v1 (geometría 48×72, mapas de frames, claves, rutas) y un resolver `resolvePlayerVisual(config)` con cadena v1→cast→modular. Un helper Phaser (`createV1WalkAnimations`) registra las 4 animaciones. `game-world.component.ts` gana una rama v1 en preload/create/createPlayer/playWalk/setIdle. `defaultAvatar()` pasa a traer `castId: 'valentina'` para que nadie caiga al modular crudo por omisión.

**Tech Stack:** Angular 21 + Phaser 3 · TypeScript · Jest (ts-jest) · `ng build`.

## Global Constraints

- **Rama de trabajo:** `feat/personaje-v1-idle-walk` (worktree `.worktrees/personaje-v1-idle-walk`, base `codex/calidad-9-10` `4e9f8fe`). Todos los comandos se corren desde `frontend/` dentro de ese worktree.
- **Núcleo = idle + walk del JUGADOR.** No se tocan NPCs, ni las hojas talk/interact/turn/react/portrait, ni el resolver `resolveAvatarRenderPlan`/`CharacterManifestV1`.
- **Solo frontend/assets.** Cero cambios de esquema BD o contrato API (RNF-010).
- **Identidades v1 completas (7):** `valentina, andres, camila, daniela, david, felipe, jorge`. `luisa`/`mariana`/`mateo`/`paula`/`samuel` NO tienen v1 → caen a cast por el fallback.
- **Contrato v1 (biblia `docs/visual/premium-visual-bible-v1.md`):** frame 48×72; `idle` 4×4, `walk` 6×4; filas `down/left/right/up`; izquierda/derecha dibujadas independientes → **flipX = false siempre**; contactos de walk en frames 0 y 3; pivote de pies (24,68).
- **Degradación elegante:** si una hoja v1 no carga, el jugador cae a cast; si no hay cast, a modular. Nunca pantalla rota.
- **Regla de oro:** la escala de render v1 se calibra contra **captura del juego real** (altura del personaje en pantalla ~54px), nunca contra el footprint ni el asset viejo.

---

## Prerequisites: dependencias del worktree

El worktree nuevo no tiene `node_modules`.

- [ ] **Instalar dependencias**

Run (desde `.worktrees/personaje-v1-idle-walk/frontend`):
```bash
npm ci
```
Expected: instala sin errores; existe `node_modules/.bin/jest`.

---

### Task 1: Contrato v1 (utilidad pura)

**Files:**
- Create: `frontend/src/app/features/simulator/v1-avatar.util.ts`
- Test: `frontend/src/app/features/simulator/v1-avatar.util.spec.ts`

**Interfaces:**
- Consumes: `PlayerDirection` de `./player-motion.util`.
- Produces: `V1_ROSTER`, `hasV1(castId)`, `V1_FRAME_WIDTH=48`, `V1_FRAME_HEIGHT=72`, `V1_IDLE_COLS=4`, `V1_WALK_COLS=6`, `V1_DIR_ROW`, `v1WalkFrames(dir): number[]`, `v1IdleFrame(dir): number`, `V1_WALK_FPS=10`, `V1_IDLE_FPS=4`, `v1SheetPath(id,sheet)`, `v1SheetKey(id,sheet)`, `v1WalkAnimKey(id,dir)`, `V1_AVATAR_SCALE`, `V1_FEET_ORIGIN_Y`.

- [ ] **Step 1: Write the failing test**

```ts
// v1-avatar.util.spec.ts
import {
  V1_ROSTER, hasV1, V1_FRAME_WIDTH, V1_FRAME_HEIGHT,
  v1WalkFrames, v1IdleFrame, v1SheetPath, v1SheetKey, v1WalkAnimKey,
} from './v1-avatar.util';

describe('v1-avatar.util', () => {
  it('roster: valentina (default) está; mariana no', () => {
    expect(hasV1('valentina')).toBe(true);
    expect(hasV1('mariana')).toBe(false);
    expect(hasV1(null)).toBe(false);
    expect(V1_ROSTER).toContain('valentina');
  });

  it('frame es 48×72', () => {
    expect(V1_FRAME_WIDTH).toBe(48);
    expect(V1_FRAME_HEIGHT).toBe(72);
  });

  it('walk: 6 frames por fila, filas down/left/right/up', () => {
    expect(v1WalkFrames('down')).toEqual([0, 1, 2, 3, 4, 5]);
    expect(v1WalkFrames('left')).toEqual([6, 7, 8, 9, 10, 11]);
    expect(v1WalkFrames('right')).toEqual([12, 13, 14, 15, 16, 17]);
    expect(v1WalkFrames('up')).toEqual([18, 19, 20, 21, 22, 23]);
  });

  it('idle: col 0 de la fila de la dirección', () => {
    expect(v1IdleFrame('down')).toBe(0);
    expect(v1IdleFrame('left')).toBe(4);
    expect(v1IdleFrame('right')).toBe(8);
    expect(v1IdleFrame('up')).toBe(12);
  });

  it('rutas y claves', () => {
    expect(v1SheetPath('valentina', 'walk')).toBe('/assets/characters/v1/valentina/base/walk.png');
    expect(v1SheetKey('valentina', 'idle')).toBe('v1-valentina-idle');
    expect(v1WalkAnimKey('valentina', 'down')).toBe('v1-valentina-walk-down');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest v1-avatar.util --runInBand`
Expected: FAIL — `Cannot find module './v1-avatar.util'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// v1-avatar.util.ts
import { PlayerDirection } from './player-motion.util';

/** Identidades con hojas v1 completas (48×72, 4 direcciones). El resto cae a cast. */
export const V1_ROSTER: readonly string[] = [
  'valentina', 'andres', 'camila', 'daniela', 'david', 'felipe', 'jorge',
];

export function hasV1(castId: string | null | undefined): castId is string {
  return !!castId && V1_ROSTER.includes(castId);
}

export const V1_FRAME_WIDTH = 48;
export const V1_FRAME_HEIGHT = 72;
export const V1_IDLE_COLS = 4;
export const V1_WALK_COLS = 6;

/** Orden de filas de las hojas v1 (biblia visual): down/left/right/up. */
export const V1_DIR_ROW: Readonly<Record<PlayerDirection, number>> = {
  down: 0, left: 1, right: 2, up: 3,
};

/** 6 frames de caminata de la fila de la dirección (contactos autorales en 0 y 3). */
export function v1WalkFrames(dir: PlayerDirection): number[] {
  const base = V1_DIR_ROW[dir] * V1_WALK_COLS;
  return [0, 1, 2, 3, 4, 5].map(col => base + col);
}

/** Frame de reposo (col 0 de la fila de la dirección) de la hoja idle. */
export function v1IdleFrame(dir: PlayerDirection): number {
  return V1_DIR_ROW[dir] * V1_IDLE_COLS;
}

export const V1_WALK_FPS = 10;
export const V1_IDLE_FPS = 4;

export type V1Sheet = 'idle' | 'walk';

export function v1SheetPath(id: string, sheet: V1Sheet): string {
  return `/assets/characters/v1/${id}/base/${sheet}.png`;
}
export function v1SheetKey(id: string, sheet: V1Sheet): string {
  return `v1-${id}-${sheet}`;
}
export function v1WalkAnimKey(id: string, dir: PlayerDirection): string {
  return `v1-${id}-walk-${dir}`;
}

/**
 * Escala de render del avatar v1 en el mundo. v1 es 48×72 nativo (pixel-art
 * auténtico). Valor CALIBRADO contra captura real del juego (regla de oro:
 * escalar contra la altura del personaje en pantalla ~54px). Inicia en 1 y se
 * ajusta en el smoke (Task 6).
 */
export const V1_AVATAR_SCALE = 1;

/** Origen vertical de pies del frame v1 (pivote (24,68) sobre 72px de alto). */
export const V1_FEET_ORIGIN_Y = 68 / 72;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest v1-avatar.util --runInBand`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/simulator/v1-avatar.util.ts frontend/src/app/features/simulator/v1-avatar.util.spec.ts
git commit -m "feat(simulator): contrato v1 del avatar (geometría 48×72, idle+walk)"
```

---

### Task 2: Resolver de visual del jugador (v1 → cast → modular)

**Files:**
- Modify: `frontend/src/app/features/simulator/v1-avatar.util.ts` (añadir `resolvePlayerVisual`)
- Test: `frontend/src/app/features/simulator/v1-avatar.util.spec.ts` (añadir bloque)

**Interfaces:**
- Consumes: `resolveCastId` de `./baked-cast.util`; `AvatarConfig` de `../character/avatar.model`; `hasV1` (Task 1).
- Produces: `type PlayerVisual = { kind:'v1'; id:string } | { kind:'cast'; id:string } | { kind:'modular' }`; `resolvePlayerVisual(config: AvatarConfig): PlayerVisual`.

- [ ] **Step 1: Write the failing test**

```ts
// añadir al describe existente en v1-avatar.util.spec.ts
import { resolvePlayerVisual } from './v1-avatar.util';
import { defaultAvatar } from '../character/avatar-config.util';

describe('resolvePlayerVisual', () => {
  it('identidad con v1 → kind v1', () => {
    expect(resolvePlayerVisual({ ...defaultAvatar(), castId: 'valentina' }))
      .toEqual({ kind: 'v1', id: 'valentina' });
  });
  it('cast sin v1 (mariana) → kind cast', () => {
    expect(resolvePlayerVisual({ ...defaultAvatar(), castId: 'mariana' }))
      .toEqual({ kind: 'cast', id: 'mariana' });
  });
  it('castId inválido → modular', () => {
    expect(resolvePlayerVisual({ ...defaultAvatar(), castId: 'no-existe' }))
      .toEqual({ kind: 'modular' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest v1-avatar.util --runInBand`
Expected: FAIL — `resolvePlayerVisual is not a function`.

- [ ] **Step 3: Write minimal implementation**

Añadir a `v1-avatar.util.ts` (imports arriba + código):
```ts
import { AvatarConfig } from '../character/avatar.model';
import { resolveCastId } from './baked-cast.util';

export type PlayerVisual =
  | { kind: 'v1'; id: string }
  | { kind: 'cast'; id: string }
  | { kind: 'modular' };

/**
 * Cómo dibujar al jugador, por prioridad: v1 (premium) → cast (horneado) →
 * modular. Puro y testeable; game-world materializa las texturas.
 */
export function resolvePlayerVisual(config: AvatarConfig): PlayerVisual {
  const castId = resolveCastId(config.castId ?? null);
  if (castId && hasV1(castId)) return { kind: 'v1', id: castId };
  if (castId) return { kind: 'cast', id: castId };
  return { kind: 'modular' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest v1-avatar.util --runInBand`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/simulator/v1-avatar.util.ts frontend/src/app/features/simulator/v1-avatar.util.spec.ts
git commit -m "feat(simulator): resolver de visual del jugador (v1→cast→modular)"
```

---

### Task 3: Default del avatar = valentina (nunca modular crudo)

**Files:**
- Modify: `frontend/src/app/features/character/avatar-config.util.ts:56-69` (`defaultAvatar`)
- Modify (fix fixture): `frontend/src/app/features/simulator/lobby-avatar.util.spec.ts:22-31`
- Test: `frontend/src/app/features/character/avatar-config.util.spec.ts` (añadir asserción)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `defaultAvatar()` ahora incluye `castId: 'valentina'`.

- [ ] **Step 1: Write the failing test**

Añadir a `avatar-config.util.spec.ts`:
```ts
it('el avatar por defecto trae la identidad v1 valentina (no modular crudo)', () => {
  expect(defaultAvatar().castId).toBe('valentina');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest avatar-config.util --runInBand`
Expected: FAIL — recibido `undefined`, esperado `'valentina'`.

- [ ] **Step 3: Write minimal implementation**

En `avatar-config.util.ts`, dentro del objeto que retorna `defaultAvatar()`, añadir la línea:
```ts
    castId: 'valentina',
```
(justo antes de `gender: 'female',`).

- [ ] **Step 4: Arreglar el fixture "sin castId" del lobby**

En `lobby-avatar.util.spec.ts`, los dos casos que usaban `defaultAvatar()` como avatar sin castId deben forzar `castId: undefined` para conservar su intención:
```ts
    it('castId inválido → fallback modular', () => {
      const plan = lobbyAvatarPlan({ ...defaultAvatar(), castId: 'no-existe' });
      expect(plan.kind).toBe('modular');
      expect(plan.modularSpecs.length).toBeGreaterThan(0);
    });

    it('sin castId → fallback modular (avatar clásico)', () => {
      const plan = lobbyAvatarPlan({ ...defaultAvatar(), castId: undefined });
      expect(plan.kind).toBe('modular');
    });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest avatar-config.util lobby-avatar.util --runInBand`
Expected: PASS ambos suites.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/character/avatar-config.util.ts frontend/src/app/features/character/avatar-config.util.spec.ts frontend/src/app/features/simulator/lobby-avatar.util.spec.ts
git commit -m "feat(character): default del avatar usa identidad v1 valentina"
```

---

### Task 4: Helper Phaser — animaciones de caminata v1

**Files:**
- Modify: `frontend/src/app/features/simulator/phaser-avatar-renderer.ts` (añadir `createV1WalkAnimations` al final)

**Interfaces:**
- Consumes: `v1SheetKey`, `v1WalkAnimKey`, `v1WalkFrames`, `V1_WALK_FPS` (Task 1); `PlayerDirection`.
- Produces: `createV1WalkAnimations(scene: Phaser.Scene, id: string): void`.

- [ ] **Step 1: Añadir el helper**

Al final de `phaser-avatar-renderer.ts`:
```ts
import { V1_WALK_FPS, v1SheetKey, v1WalkAnimKey, v1WalkFrames } from './v1-avatar.util';

/**
 * (Re)crea las 4 animaciones de caminata v1 (down/left/right/up) desde la hoja
 * `walk` (6 frames por fila). Izquierda y derecha son filas reales → sin flip.
 */
export function createV1WalkAnimations(scene: Phaser.Scene, id: string): void {
  const textureKey = v1SheetKey(id, 'walk');
  for (const dir of ['down', 'left', 'right', 'up'] as const) {
    const key = v1WalkAnimKey(id, dir);
    if (scene.anims.exists(key)) scene.anims.remove(key);
    scene.anims.create({
      key,
      frames: v1WalkFrames(dir).map(frame => ({ key: textureKey, frame })),
      frameRate: V1_WALK_FPS,
      repeat: -1,
    });
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.app.json` (o `npx ng build` en Task 5)
Expected: sin errores de tipo en el helper.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/simulator/phaser-avatar-renderer.ts
git commit -m "feat(simulator): helper Phaser de animaciones de caminata v1"
```

---

### Task 5: Cableado en game-world (preload / create / player / walk / idle)

**Files:**
- Modify: `frontend/src/app/features/simulator/game-world.component.ts`
  - imports (zona ~55-76)
  - campo nuevo (zona ~138-140)
  - preload (después de `:229`)
  - create (`:324-332`)
  - createPlayer (`:1614-1626`)
  - playWalkAnimation (`:1685-1698`)
  - setIdleFrame (`:1701-1718`)

**Interfaces:**
- Consumes: `resolvePlayerVisual`, `v1SheetKey`, `v1SheetPath`, `v1IdleFrame`, `V1_FRAME_WIDTH`, `V1_FRAME_HEIGHT`, `V1_AVATAR_SCALE`, `V1_FEET_ORIGIN_Y`, `v1WalkAnimKey` (Task 1); `createV1WalkAnimations` (Task 4).
- Produces: rama v1 del render del jugador. Campo `private playerV1Id: string | null = null`.

- [ ] **Step 1: Imports y campo**

Añadir a los imports de v1 (junto al import de `baked-cast.util`):
```ts
import {
  resolvePlayerVisual, v1SheetKey, v1SheetPath, v1IdleFrame, v1WalkAnimKey,
  V1_FRAME_WIDTH, V1_FRAME_HEIGHT, V1_AVATAR_SCALE, V1_FEET_ORIGIN_Y,
} from './v1-avatar.util';
import { createV1WalkAnimations } from './phaser-avatar-renderer';
```
Junto a `private playerCastId` (~:138), añadir:
```ts
  private playerV1Id: string | null = null;
```

- [ ] **Step 2: preload — cargar hojas v1**

Reemplazar la línea `:229` (`this.playerCastId = resolveCastId(avatarConfig.castId);`) por:
```ts
    this.playerCastId = resolveCastId(avatarConfig.castId);
    const playerVisual = resolvePlayerVisual(avatarConfig);
    if (playerVisual.kind === 'v1') {
      this.playerV1Id = playerVisual.id;
      for (const sheet of ['idle', 'walk'] as const) {
        this.load.spritesheet(v1SheetKey(playerVisual.id, sheet), v1SheetPath(playerVisual.id, sheet),
          { frameWidth: V1_FRAME_WIDTH, frameHeight: V1_FRAME_HEIGHT });
      }
    }
```

- [ ] **Step 3: create — registrar anims y elegir textura v1 primero**

Reemplazar el bloque `:324-332` por (rama v1 delante):
```ts
    if (this.playerV1Id && this.textures.exists(v1SheetKey(this.playerV1Id, 'walk'))) {
      createV1WalkAnimations(this, this.playerV1Id);
      this.playerTextureKey = v1SheetKey(this.playerV1Id, 'walk');
      this.avatarReady = true;
    } else if (this.playerCastId && this.textures.exists(castTextureKey(this.playerCastId))) {
      this.playerV1Id = null;
      this.playerTextureKey = castTextureKey(this.playerCastId);
      createAvatarAnimationsFor(this, this.playerTextureKey, AVATAR_ANIM_KEYS);
      this.avatarReady = true;
    } else {
      this.playerV1Id = null;
      this.playerTextureKey = AVATAR_TEXTURE_KEY;
      this.avatarReady = composeAvatarTexture(this, this.avatarSpecs);
      if (this.avatarReady) createAvatarAnimations(this);
    }
```
(El `playerV1Id = null` en las ramas de fallback cubre el caso de que la hoja v1 no cargara.)

- [ ] **Step 4: createPlayer — sprite v1 con origen de pies**

Dentro del bloque `if (this.avatarReady && this.textures.exists(this.playerTextureKey))` (`:1614`), sustituir la creación del `sprite` (líneas 1620-1621) por una que ramifique v1:
```ts
      const sprite = this.playerV1Id
        ? this.add.sprite(0, 0, v1SheetKey(this.playerV1Id, 'idle'), v1IdleFrame('down'))
            .setOrigin(0.5, V1_FEET_ORIGIN_Y).setScale(V1_AVATAR_SCALE)
        : this.add.sprite(0, PLAYER_SPRITE_OFFSET_Y, this.playerTextureKey, AVATAR_IDLE_FRAMES.down)
            .setScale(AVATAR_DISPLAY_SCALE);
```

- [ ] **Step 5: playWalkAnimation — rama v1 (4 direcciones, sin flip)**

Al inicio de `playWalkAnimation` (`:1686`, tras el guard `if (!this.playerSprite) return;`), insertar:
```ts
    if (this.playerV1Id) {
      this.playerSprite.setFlipX(false);
      if (this.callbacks.reduceMotion) { this.setIdleFrame(direction); return; }
      this.playerSprite.play(v1WalkAnimKey(this.playerV1Id, direction), true);
      return;
    }
```

- [ ] **Step 6: setIdleFrame — rama v1 (cambia a la hoja idle)**

Al inicio de `setIdleFrame` (`:1702`, tras `this.playerSprite.stop();`), insertar:
```ts
    if (this.playerV1Id) {
      this.playerSprite.setFlipX(false);
      this.playerSprite.setTexture(v1SheetKey(this.playerV1Id, 'idle'), v1IdleFrame(direction));
      return;
    }
```

- [ ] **Step 7: Build de producción limpio**

Run: `npx ng build`
Expected: `Application bundle generation complete`, sin errores ni ampliación de presupuestos.

- [ ] **Step 8: No regresión de la suite**

Run: `npx jest --runInBand`
Expected: todas las suites verdes (incluidas v1-avatar.util, avatar-config, lobby-avatar, baked-cast).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/features/simulator/game-world.component.ts
git commit -m "feat(simulator): cablear arte v1 (idle+walk, 4 direcciones) al jugador"
```

---

### Task 6: Smoke en vivo + calibración de escala/pies (regla de oro)

**Files:**
- Modify (si la captura lo exige): `frontend/src/app/features/simulator/v1-avatar.util.ts` (`V1_AVATAR_SCALE` y/o `V1_FEET_ORIGIN_Y`)
- Create: `docs/audits/2026-07-20-personaje-v1-idle-walk/` (capturas + notas)

**Interfaces:** ninguna nueva.

- [ ] **Step 1: Levantar el dev server**

Usar la app real (preview) y entrar al juego con el avatar por defecto (valentina → v1). Login demo `admin@psychosim.edu.co / Admin123!`.

- [ ] **Step 2: Capturar al jugador caminando en las 4 direcciones**

Mover con WASD arriba/abajo/izquierda/derecha en una sala del caso y capturar cada dirección + un NPC en el mismo encuadre.

- [ ] **Step 3: Evaluar contra los 3 criterios del riesgo E**

1. **Fin del "flotar":** la caminata de 6 frames alterna contacto/paso (no desliza).
2. **Coherencia de cara:** la misma cara en las 4 direcciones (izq/der reales, sin espejo raro).
3. **Densidad de píxel jugador-vs-NPC:** ¿el jugador v1 (48×72) se ve del mismo tamaño/resolución aparente que los NPCs legacy de la sala?

- [ ] **Step 4: Calibrar si hace falta**

Si el jugador queda más alto/bajo que los NPCs o los pies no asientan, ajustar `V1_AVATAR_SCALE` (altura en pantalla ~54px de silueta) y/o `V1_FEET_ORIGIN_Y`. **Escalar contra la altura del personaje en pantalla, verificado con esta captura** — nunca contra el asset viejo. Re-capturar tras ajustar.

- [ ] **Step 5: Guardar evidencia y decidir sobre el fast-follow**

Guardar capturas en `docs/audits/2026-07-20-personaje-v1-idle-walk/` con una nota corta del veredicto. Si el choque de densidad (criterio 3) es inaceptable, registrar el fast-follow: migrar los NPCs del caso a v1 (alcance completo, plan aparte).

- [ ] **Step 6: Commit de la calibración + evidencia**

```bash
git add frontend/src/app/features/simulator/v1-avatar.util.ts docs/audits/2026-07-20-personaje-v1-idle-walk/
git commit -m "test(simulator): smoke en vivo del avatar v1 + calibración de escala"
```

---

## Notas de cierre

- **node_modules del worktree:** cubierto por Prerequisites (`npm ci`).
- **Idle y walk son PNGs separados en v1** (a diferencia de modular/cast que son una sola hoja de 9 frames): por eso el sprite alterna de textura (`setTexture` a la hoja idle al pararse; la animación de caminata usa la hoja walk). Manejado en Tasks 5.4–5.6.
- **Fuera de alcance confirmado:** NPCs, talk/interact/turn/react/portrait, resolver con manifest. El retrato de 8 estados y la migración de NPCs quedan para el alcance "completo".
