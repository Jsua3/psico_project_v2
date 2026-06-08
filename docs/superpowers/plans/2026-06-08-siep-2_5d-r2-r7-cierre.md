# SIEP 2.5D — Cierre Rebanadas R2→R7 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar las 7 rebanadas de la iniciativa 2.5D verificando R2-R5 (ya implementadas), conectando los NPC character sprites reales al runtime Phaser (R6), y verificando el cierre de R7 (diálogo expresivo, mapa social, caja de tensión verbal) con build limpio y suite verde.

**Architecture:** Todo en `frontend/`. La única implementación nueva es R6 NPC sprites: una constante de ids de personaje a nivel de módulo en `game-world.component.ts`, preload de 4 sprite sheets (128×180px, 18 frames), helper `createNpcCharacterAnimations()` idempotente, y una rama extra en `spawnNpcs()` que usa el sprite real cuando el NpcConfig trae `characterId`. Los demás cambios son verificación, corrección de gaps y commit de cierre.

**Tech Stack:** Angular 21, Phaser 3, TypeScript, Jest.

**Specs:**
- R2: `docs/superpowers/specs/2026-06-05-game-hud-liquid-glass-design.md`
- R3: `docs/superpowers/specs/2026-06-05-character-editor-design.md`
- R4: `docs/superpowers/specs/2026-06-05-game-outcome-screen-design.md`
- R5: `docs/superpowers/specs/2026-06-05-game-dialogue-panel-design.md`
- R6: `docs/superpowers/specs/2026-06-08-game-r6-npc-sprites-gamefeel-design.md`
- R7: `docs/superpowers/specs/2026-06-08-game-r7-dialogue-social-tension-design.md`

---

## File Map

| Acción | Archivo |
|---|---|
| Create | `frontend/src/app/features/simulator/avatar-animation-layout.ts` |
| Modify | `frontend/src/app/core/models/simulation.model.ts` (línea ~709) |
| Modify | `frontend/src/app/features/simulator/game-world.component.ts` (preload, create, spawnNpcs) |
| Verify only | `frontend/src/app/features/simulator/stress-hearts.util.spec.ts` |
| Verify only | `frontend/src/app/features/simulator/outcome.util.spec.ts` |
| Verify only | `frontend/src/app/features/simulator/dialogue-keys.util.spec.ts` |
| Verify only | `frontend/src/app/features/simulator/depth-sort.util.spec.ts` |

---

## Task 1: Verificar que R2-R5 pasan los criterios de aceptación (tests)

**Files:** ninguno (verificación).

- [ ] **Step 1: Correr la suite completa**

```bash
cd frontend && npx jest --watchAll=false
```

Resultado esperado: `Tests: 98 passed, 98 total` (o más si hay nuevos tests).
Si algún test falla → identificar y corregir antes de continuar.

- [ ] **Step 2: Verificar que los utils de R2-R5 están presentes**

Confirmar que existen estos archivos:
- `frontend/src/app/features/simulator/stress-hearts.util.ts` (R2)
- `frontend/src/app/features/simulator/stress-hearts.util.spec.ts` (R2)
- `frontend/src/app/features/simulator/outcome.util.ts` (R4)
- `frontend/src/app/features/simulator/outcome.util.spec.ts` (R4)
- `frontend/src/app/features/simulator/dialogue-keys.util.ts` (R5)
- `frontend/src/app/features/simulator/dialogue-keys.util.spec.ts` (R5)
- `frontend/src/app/features/simulator/depth-sort.util.ts` (R1)
- `frontend/src/app/features/simulator/depth-sort.util.spec.ts` (R1)

```bash
ls frontend/src/app/features/simulator/*.spec.ts
```

Si alguno falta, consultar el spec correspondiente y crearlo según lo documentado allí.

---

## Task 2: Copiar `avatar-animation-layout.ts` al frontend

**Files:**
- Create: `frontend/src/app/features/simulator/avatar-animation-layout.ts`

- [ ] **Step 1: Crear el archivo**

Crear `frontend/src/app/features/simulator/avatar-animation-layout.ts` con este contenido exacto:

```typescript
// SIEP Avatar Runtime Layout — v5.1 patch
// Matches the actual 18-frame runtime sheets generated from v5 character references.

export type AvatarAnimationKey =
  | 'IDLE_FRONT'
  | 'WALK_DOWN'
  | 'WALK_LEFT'
  | 'WALK_RIGHT'
  | 'WALK_UP';

export interface AvatarAnimationSpec {
  frames: number[];
  fps: number;
  loop: boolean;
}

export interface AvatarSpriteLayout {
  frameWidth: number;
  frameHeight: number;
  totalFrames: number;
  sheetColumns: number;
  sheetRows: number;
  animations: Record<AvatarAnimationKey, AvatarAnimationSpec>;
}

export const AVATAR_SPRITE_LAYOUT_18: AvatarSpriteLayout = {
  frameWidth: 128,
  frameHeight: 180,
  totalFrames: 18,
  sheetColumns: 18,
  sheetRows: 1,
  animations: {
    IDLE_FRONT: { frames: [0, 1],          fps: 2, loop: true },
    WALK_DOWN:  { frames: [2, 3, 4, 5],    fps: 8, loop: true },
    WALK_LEFT:  { frames: [6, 7, 8, 9],    fps: 8, loop: true },
    WALK_RIGHT: { frames: [10, 11, 12, 13], fps: 8, loop: true },
    WALK_UP:    { frames: [14, 15, 16, 17], fps: 8, loop: true },
  },
};

export function getAvatarFrameIndex(
  animation: AvatarAnimationKey,
  elapsedMs: number,
  layout: AvatarSpriteLayout = AVATAR_SPRITE_LAYOUT_18,
): number {
  const spec = layout.animations[animation];
  if (!spec || spec.frames.length === 0) return 0;
  const frameDurationMs = 1000 / spec.fps;
  const rawIndex = Math.floor(elapsedMs / frameDurationMs);
  const localIndex = spec.loop
    ? rawIndex % spec.frames.length
    : Math.min(rawIndex, spec.frames.length - 1);
  return spec.frames[localIndex];
}

export function getAvatarFrameRect(
  frameIndex: number,
  layout: AvatarSpriteLayout = AVATAR_SPRITE_LAYOUT_18,
) {
  if (frameIndex < 0 || frameIndex >= layout.totalFrames) {
    throw new Error(`Invalid avatar frame index ${frameIndex}. Expected 0-${layout.totalFrames - 1}.`);
  }
  return {
    sx: frameIndex * layout.frameWidth,
    sy: 0,
    sw: layout.frameWidth,
    sh: layout.frameHeight,
  };
}

export function getAvatarAnimationFromDirection(
  direction: 'down' | 'left' | 'right' | 'up' | 'front',
  moving: boolean,
): AvatarAnimationKey {
  if (!moving) return 'IDLE_FRONT';
  switch (direction) {
    case 'down':
    case 'front':  return 'WALK_DOWN';
    case 'left':   return 'WALK_LEFT';
    case 'right':  return 'WALK_RIGHT';
    case 'up':     return 'WALK_UP';
    default:       return 'IDLE_FRONT';
  }
}
```

- [ ] **Step 2: Verificar build**

```bash
cd frontend && npx ng build --configuration development 2>&1 | tail -5
```

Resultado esperado: `Application bundle generation complete.`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/simulator/avatar-animation-layout.ts
git commit -m "feat(r6): add avatar-animation-layout.ts (v5.1 18-frame layout definition)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Extender `NpcConfig` con `characterId`

**Files:**
- Modify: `frontend/src/app/core/models/simulation.model.ts` (alrededor de línea 700)

- [ ] **Step 1: Leer el bloque actual de NpcConfig**

Abrir `frontend/src/app/core/models/simulation.model.ts`. Buscar:

```typescript
export interface NpcConfig {
  key: string;
  npcType: 'supervisor' | 'colleague' | 'family' | 'witness';
  displayName: string;
  /** Emoji used as portrait in dialogue panel */
  portrait: string;
  x: number;
  y: number;
  /** Phaser frame index in the 'characters' spritesheet */
  frameIndex: number;
  dialogue: NpcDialogue;
}
```

- [ ] **Step 2: Añadir `characterId` opcional**

Reemplazar el bloque anterior por:

```typescript
export interface NpcConfig {
  key: string;
  npcType: 'supervisor' | 'colleague' | 'family' | 'witness';
  displayName: string;
  /** Emoji used as portrait in dialogue panel */
  portrait: string;
  x: number;
  y: number;
  /** Phaser frame index in the 'characters' spritesheet (Kenney fallback) */
  frameIndex: number;
  /**
   * Optional: id del sprite sheet real del personaje (v5.1).
   * Valores válidos: 'doctor-male-labcoat' | 'orientadora-casual-female' |
   *   'orientadora-female-labcoat' | 'staff-male-glasses-beard'.
   * Si está presente y el sprite cargó, se usa el personaje real en vez de Kenney.
   */
  characterId?: string;
  dialogue: NpcDialogue;
}
```

- [ ] **Step 3: Verificar build**

```bash
cd frontend && npx ng build --configuration development 2>&1 | tail -5
```

Resultado esperado: `Application bundle generation complete.`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/core/models/simulation.model.ts
git commit -m "feat(r6): extend NpcConfig with optional characterId for real sprite sheets

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Preload de NPC character sprites en `DataDrivenWorldScene`

**Files:**
- Modify: `frontend/src/app/features/simulator/game-world.component.ts`

**Contexto:** El método `preload()` empieza en línea ~105. La constante de ids se declara a nivel de módulo (fuera de la clase) para ser usada tanto en `preload()` como en `createNpcCharacterAnimations()`.

- [ ] **Step 1: Añadir la constante de ids justo antes de `class DataDrivenWorldScene`**

En `game-world.component.ts`, buscar la línea:
```typescript
class DataDrivenWorldScene extends Phaser.Scene {
```

Justo antes de esa línea, insertar:

```typescript
/** Ids de los NPC character sprite sheets (v5.1 — 128×180 px, 18 frames). */
const NPC_CHAR_IDS = [
  'doctor-male-labcoat',
  'orientadora-casual-female',
  'orientadora-female-labcoat',
  'staff-male-glasses-beard',
] as const;
type NpcCharId = typeof NPC_CHAR_IDS[number];

```

- [ ] **Step 2: Añadir el preload de character sprites al final de `preload()`**

En `preload()`, justo antes de la línea:
```typescript
    this.load.once('complete', () => { this.assetsLoaded = true; });
```

Insertar:

```typescript
    // ── NPC character sprite sheets (v5.1 — 128×180 px, 18 frames) ───────────
    // Copiados desde docs/assets_5.1_solucionado. Fallos silenciosos via loaderror.
    const charFrameOpts = { frameWidth: 128, frameHeight: 180 };
    for (const id of NPC_CHAR_IDS) {
      this.load.spritesheet(`npc_${id}`, `assets/characters/sprite-sheets/${id}.png`, charFrameOpts);
    }
    // ─────────────────────────────────────────────────────────────────────────
```

- [ ] **Step 3: Verificar build**

```bash
cd frontend && npx ng build --configuration development 2>&1 | tail -5
```

Resultado esperado: `Application bundle generation complete.`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/simulator/game-world.component.ts
git commit -m "feat(r6): preload NPC character sprite sheets (128x180, 18 frames) in DataDrivenWorldScene

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Crear animaciones Phaser para NPC characters

**Files:**
- Modify: `frontend/src/app/features/simulator/game-world.component.ts`

**Contexto:** `create()` llama a `this.createAnimations()` en línea ~187. Añadiremos la llamada a `createNpcCharacterAnimations()` inmediatamente después. El método es idempotente (verifica `this.anims.exists` antes de crear).

- [ ] **Step 1: Añadir llamada en `create()`**

En `create()`, buscar:
```typescript
    this.createAnimations();
    this.renderWorld();
```

Cambiar a:
```typescript
    this.createAnimations();
    this.createNpcCharacterAnimations();
    this.renderWorld();
```

- [ ] **Step 2: Añadir el método `createNpcCharacterAnimations()`**

Justo antes del método `private createAnimations()` (alrededor de línea 473), insertar:

```typescript
  /**
   * Registra las animaciones Phaser para los NPC character sprite sheets (v5.1).
   * Idempotente: salta silenciosamente si la textura no cargó o la anim ya existe.
   * Layout: IDLE_FRONT [0-1] 2fps · WALK_DOWN [2-5] · WALK_LEFT [6-9] ·
   *         WALK_RIGHT [10-13] · WALK_UP [14-17] (todos 8 fps, loop:-1).
   */
  private createNpcCharacterAnimations(): void {
    const defs: Array<{ suffix: string; frames: number[]; fps: number }> = [
      { suffix: 'idle_front', frames: [0, 1],           fps: 2 },
      { suffix: 'walk_down',  frames: [2, 3, 4, 5],     fps: 8 },
      { suffix: 'walk_left',  frames: [6, 7, 8, 9],     fps: 8 },
      { suffix: 'walk_right', frames: [10, 11, 12, 13], fps: 8 },
      { suffix: 'walk_up',    frames: [14, 15, 16, 17], fps: 8 },
    ];
    for (const id of NPC_CHAR_IDS) {
      const texKey = `npc_${id}`;
      if (!this.textures.exists(texKey)) continue;
      for (const d of defs) {
        const animKey = `${texKey}_${d.suffix}`;
        if (this.anims.exists(animKey)) continue;
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(texKey, { frames: d.frames }),
          frameRate: d.fps,
          repeat: -1,
        });
      }
    }
  }

```

- [ ] **Step 3: Verificar build**

```bash
cd frontend && npx ng build --configuration development 2>&1 | tail -5
```

Resultado esperado: `Application bundle generation complete.`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/simulator/game-world.component.ts
git commit -m "feat(r6): createNpcCharacterAnimations() — idle_front + 4 walks per character

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Conectar NPC character sprites en `spawnNpcs`

**Files:**
- Modify: `frontend/src/app/features/simulator/game-world.component.ts` (línea ~785)

**Contexto:** `spawnNpcs()` actualmente crea el sprite con:
```typescript
let sprite: Phaser.GameObjects.GameObject;
if (this.assetsLoaded && this.textures.exists('characters')) {
  sprite = this.add.sprite(0, 0, 'characters', npc.frameIndex).setScale(1.5);
} else {
  sprite = this.add.circle(0, -8, 10, 0x4fa3a5, 1);
}
```

- [ ] **Step 1: Reemplazar el bloque de creación del sprite**

Buscar exactamente ese bloque de 5 líneas en `spawnNpcs()` y reemplazarlo por:

```typescript
      let sprite: Phaser.GameObjects.GameObject;
      const charTexKey = npc.characterId ? `npc_${npc.characterId}` : null;
      if (charTexKey && this.textures.exists(charTexKey)) {
        // NPC con sprite real v5.1 (128×180 px, escala 0.55 → ~70px en mapa)
        sprite = (this.add.sprite(0, -16, charTexKey) as Phaser.GameObjects.Sprite)
          .setScale(0.55)
          .play(`${charTexKey}_idle_front`);
      } else if (this.assetsLoaded && this.textures.exists('characters')) {
        sprite = this.add.sprite(0, 0, 'characters', npc.frameIndex).setScale(1.5);
      } else {
        sprite = this.add.circle(0, -8, 10, 0x4fa3a5, 1);
      }
```

El offset Y de -16 centra verticalmente el sprite de 180px escalado (~99px) sobre el punto del container.

- [ ] **Step 2: Verificar build**

```bash
cd frontend && npx ng build --configuration development 2>&1 | tail -5
```

Resultado esperado: `Application bundle generation complete.`

- [ ] **Step 3: Verificar suite jest**

```bash
cd frontend && npx jest --watchAll=false 2>&1 | tail -6
```

Resultado esperado: todos los tests siguen pasando (`Tests: X passed, X total`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/simulator/game-world.component.ts
git commit -m "feat(r6): spawnNpcs uses real character sprite when NpcConfig.characterId is set

Falls back to Kenney sprite or circle when characterId absent or texture missing.
Scale 0.55 maps 128px → ~70px on the game map.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Asignar `characterId` a un NPC real en la configuración de escenario

**Files:**
- Modify: cualquier config de escenario que tenga NPCs (e.g. `frontend/src/app/features/simulator/comisaria-map.config.ts` o similar)

**Propósito:** Probar el flujo completo asignando `characterId` a un NPC existente.

- [ ] **Step 1: Leer la config del escenario para encontrar un NPC**

```bash
grep -n "displayName\|characterId\|npcType" frontend/src/app/features/simulator/comisaria-map.config.ts | head -20
```

Identificar el `key` de un NPC (ej. `"orientadora"` o `"doctor"`).

- [ ] **Step 2: Asignar `characterId` a ese NPC**

En el objeto NpcConfig correspondiente, añadir el campo `characterId` con el id correcto:

Ejemplo — si existe un NPC de tipo `supervisor`:
```typescript
{
  key: 'npc-supervisor',
  npcType: 'supervisor',
  displayName: 'Dr. Martínez',
  portrait: '👨‍⚕️',
  x: 180,
  y: 160,
  frameIndex: KenneyCharFrames.NPC_SUPERVISOR_IDLE,
  characterId: 'doctor-male-labcoat',   // ← añadir esta línea
  dialogue: { ... }
}
```

Usa el id que corresponda visualmente al personaje:
- `'doctor-male-labcoat'` — doctor masculino
- `'orientadora-casual-female'` — orientadora sin bata
- `'orientadora-female-labcoat'` — orientadora con bata
- `'staff-male-glasses-beard'` — profesional masculino con gafas

- [ ] **Step 3: Verificar build**

```bash
cd frontend && npx ng build --configuration development 2>&1 | tail -5
```

Resultado esperado: `Application bundle generation complete.`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/simulator/comisaria-map.config.ts
git commit -m "feat(r6): assign characterId to NPC in comisaria scenario for real sprite test

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Verificación final R7 — build + tests + commit de cierre

**Files:** ninguno nuevo (verificación + commit).

- [ ] **Step 1: Build de producción limpio**

```bash
cd frontend && npx ng build --configuration development 2>&1 | tail -8
```

Resultado esperado: `Application bundle generation complete.` sin líneas de `error TS`.

Si hay errores de compilación: leerlos, corregir el archivo afectado, re-correr.

- [ ] **Step 2: Suite jest completa**

```bash
cd frontend && npx jest --watchAll=false 2>&1 | tail -6
```

Resultado esperado: `Tests: X passed, X total` con 0 failures.
Los tests que deben estar presentes y pasar:

| Spec | Rebanada |
|---|---|
| `depth-sort.util.spec` | R1 |
| `stress-hearts.util.spec` | R2 |
| `outcome.util.spec` | R4 |
| `dialogue-keys.util.spec` | R5 |

Si `hud-dock.util.spec` existe → también debe pasar.
Si algún spec falta → es un gap de esa rebanada; crearlo según la spec correspondiente.

- [ ] **Step 3: Verificar que los archivos clave de R6/R7 existen**

```bash
ls frontend/src/app/features/simulator/avatar-animation-layout.ts
ls frontend/src/app/features/simulator/effects/game-feel.service.ts
ls frontend/src/app/features/simulator/effects/vignette-pipeline.ts
ls frontend/src/app/features/simulator/social-map/social-map.component.ts
ls frontend/src/app/features/simulator/verbal-tension.component.ts
```

Todos deben existir.

- [ ] **Step 4: Commit de cierre de la iniciativa 2.5D**

```bash
git add -A
git commit -m "chore(2.5d): cierre iniciativa R1→R7 — build y tests verdes

Rebanadas completadas:
  R1 — Motor Y-sort + capas Tiled + vignette procedural
  R2 — HUD liquid-glass morado + corazones de estrés + marca SIEP
  R3 — Editor de personaje (avatar SVG por capas, localStorage)
  R4 — Pantalla de resultados liquid-glass + outcome.util
  R5 — Panel de diálogo morado + opciones numeradas + teclado 1-9
  R6 — NPC character sprites v5.1 (128x180, 18 frames) + GameFeel WebGL
  R7 — Diálogo expresivo + QTE + Mapa Social + Caja de Tensión Verbal

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Notas de implementación

**Sobre la escala de los NPC sprites:**
Los sprites son 128×180 px. Con `setScale(0.55)` quedan ~70×99 px en pantalla — tamaño razonable para un mapa Phaser 960×540. Si en el smoke se ven demasiado grandes o pequeños, ajustar la escala en `spawnNpcs` y volver a verificar.

**Sobre `NPC_CHAR_IDS` como `const` a nivel de módulo:**
Se declara fuera de la clase para ser accesible en `preload()` y `createNpcCharacterAnimations()` sin repetición. TypeScript la infiere como `readonly string[]` con `as const`.

**Sobre retrocompatibilidad:**
- `characterId` es opcional en `NpcConfig` → todos los NPCs existentes sin ese campo siguen usando Kenney o circle fallback.
- `createNpcCharacterAnimations()` es no-op si las texturas no cargan → el juego funciona sin los PNGs.
- El `loaderror` handler existente silencia fallos de carga → no hay crash si los archivos faltasen.

**Sobre R7 (no hay implementación nueva):**
Los 3 subsistemas de R7 (DialogueEmotion, SocialMap, VerbalTensionBox) ya tienen commits de implementación y fixes. Esta tarea solo verifica que compilan y funcionan. Si se encuentran bugs durante el smoke, corregirlos en sus respectivos archivos antes del commit de cierre.
