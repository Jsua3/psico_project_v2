# Living World (Sub-project B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the playable case (SIM-VBG-001) feel alive — ambient/interactable motion, a colleague "guide" NPC that walks you to the process-appropriate next step, plus menu-screen polish — backed by a tiny additive backend movement passthrough.

**Architecture:** Backend change is one additive DTO change (three fields read from columns that already exist on `map_objects`). Everything else is frontend Phaser work in the Angular `admin-panel`. The deterministic logic (URL predicate, config lookups, motion math) is extracted into pure, Jest-tested modules; the Phaser glue (tweens, sprites, the guide walk, menu art) is thin and verified by TypeScript compile + live screenshots, per the spec's "iterate the feel live" stance.

**Tech Stack:** Backend — Django + DRF, pytest (`--reuse-db --nomigrations` against the real `psychosim` schema). Frontend — Angular 21 standalone + signals, Phaser 3, Jest (`ts-jest`, jsdom), Playwright (installed, no config yet).

**Spec:** `docs/superpowers/specs/2026-06-01-living-world-design.md`

**Resolved design decisions (from the user, 2026-06-02):**
- The guide is a **new frontend-only colleague NPC** defined in `scene-guide.config.ts` (own sprite/spawn/name per node) — *not* a backend `PERSON` object (the seed's only `PERSON` is the patient `escucha-segura`).
- The guide **leads the player to the process tool pickup** (a `TOOL` object: `tool-pap`/`tool-ruta`/`tool-riesgo`/`tool-bitacora`), never to a decision option — this keeps the formative-assessment guardrail safe by construction.

**Ground-truth facts discovered (do not re-derive):**
- `map_key == node_key` for every SIM-VBG-001 scene (V6 seed line ~154). So `attempt().currentNode.key`, `world.map.key`, and the guide-config key are the same string.
- The three columns already exist (V7 migration): `facing` (`VARCHAR(16)`, default `'down'`), `movement_pattern_json` (`TEXT`, default `'{}'`), `metadata_json` (`TEXT`, default `'{}'`). The Django model `apps/simulation/models/world.py` already maps them (`facing`, `movement_pattern_json`, `metadata_json`). The test DB has them.
- Per-node `TOOL` object keys (target candidates), with seeded positions:
  - `urgencias-crisis`: `tool-pap` (230,455), `tool-bitacora` (340,455)
  - `ruta-proteccion`: `tool-riesgo` (230,455), `tool-ruta` (340,455)
  - `informe-integral`: `tool-riesgo` (230,455), `tool-ruta` (340,455)
  - `valoracion-comisaria`: `tool-riesgo` (230,455), `tool-ruta` (340,455)
  - `proteccion-nna`: `tool-ruta` (230,455), `tool-bitacora` (340,455)
  - `cierre-seguimiento`: **no objects** (terminal node) → no guide entry.
- All scenes spawn the player at (145,430).

---

## File Structure

**Backend (`psico_project_v2/backend_django`)**
- Modify: `apps/simulation/services/world_service.py` — `_to_map_object()` gains 3 fields.
- Modify: `apps/simulation/tests/test_world.py` — assert the 3 fields.

**Frontend (`psicologia_proyecto/admin-panel`)**
- Modify: `src/app/core/models/simulation.model.ts` — `MapObjectState` gains 3 optional fields.
- Create: `src/app/shared/layout/game-route.util.ts` — extracted `isGameRoute` (now also matches `/portal/jugar`).
- Modify: `src/app/shared/layout/shell.component.ts` — import the extracted predicate.
- Modify: `src/app/shared/layout/shell.component.spec.ts` — test the extracted predicate incl. `/portal/jugar`.
- Create: `src/app/features/simulator/scene-guide.config.ts` — guide config + `getSceneGuide()` + SIM-VBG-001 seed.
- Create: `src/app/features/simulator/scene-guide.config.spec.ts` — Jest tests.
- Create: `src/app/features/simulator/scene-motion.util.ts` — pure motion helpers.
- Create: `src/app/features/simulator/scene-motion.util.spec.ts` — Jest tests.
- Modify: `src/app/features/simulator/kenney-frames.constants.ts` — supervisor frame already exists; no change needed unless walk frames are wanted (not in this plan).
- Modify: `src/app/features/simulator/game-world.component.ts` — ambient life + interactable juice + scene dust + guide NPC + `guide` input.
- Modify: `src/app/features/simulator/simulation-play.component.ts` — compute + pass the guide entry.
- Modify: `src/app/features/simulator/game-menu.component.ts` — façade/door/avatar art + smoother intro.
- Create: `playwright.config.ts` + `e2e/living-world.smoke.spec.ts` — best-effort smoke (Task 9).

---

## Task 1: Backend — movement passthrough on the world object DTO (TDD)

**Files:**
- Modify: `apps/simulation/services/world_service.py:284-302` (`_to_map_object`)
- Test: `apps/simulation/tests/test_world.py`

All commands run from `D:\Sua_Files\IdeaProjects\psico_project_v2\backend_django`.

- [ ] **Step 1: Write the failing test**

Add to `apps/simulation/tests/test_world.py` (end of file):

```python
def test_world_objects_expose_movement_fields(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = c.get(f"/api/simulation/attempts/{attempt_id}/world?attemptToken={token}").data["data"]
    assert world["objects"], "expected at least one world object in SIM-VBG-001"
    for obj in world["objects"]:
        assert "movementPattern" in obj
        assert "facing" in obj
        assert "metadata" in obj
        assert isinstance(obj["movementPattern"], dict)
        assert isinstance(obj["metadata"], dict)
        assert isinstance(obj["facing"], str)
```

Also extend the existing key tuple in `test_get_world_returns_scene` (around line 65) so the contract test covers the new keys:

```python
    for key in ("key", "label", "type", "x", "y", "color", "shortCode", "collision",
                "dialogue", "movementPattern", "facing", "metadata"):
        assert key in obj
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest apps/simulation/tests/test_world.py -v`
Expected: `test_world_objects_expose_movement_fields` and `test_get_world_returns_scene` FAIL with `KeyError`/`assert ... in obj` (the keys are absent).

- [ ] **Step 3: Implement the passthrough**

In `apps/simulation/services/world_service.py`, edit `_to_map_object` to add the three fields after `"dialogue"`:

```python
def _to_map_object(o):
    return {
        "key": o.object_key,
        "label": o.label,
        "type": o.object_type,
        "x": o.position_x,
        "y": o.position_y,
        "width": o.width,
        "height": o.height,
        "color": o.color_hex,
        "icon": o.icon,
        "shortCode": o.short_code,
        "collision": o.collision,
        "interactionPrompt": o.interaction_prompt,
        "interactionText": o.interaction_text,
        "decisionOptionId": o.decision_option_id,
        "toolCode": o.tool_code,
        "dialogue": _to_dialogue(o),
        # ── B1: additive movement passthrough (authored motion can override the
        #     frontend default later; authoring itself is deferred to sub-project E) ──
        "movementPattern": _read_map(o.movement_pattern_json),
        "facing": o.facing,
        "metadata": _read_map(o.metadata_json),
    }
```

(`_read_map` already exists in this module and returns `{}` for blank/invalid JSON.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest apps/simulation/tests/test_world.py -v`
Expected: all tests PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/simulation/services/world_service.py apps/simulation/tests/test_world.py
git commit -m "feat(world): expose movementPattern/facing/metadata on world object DTO"
```

---

## Task 2: Frontend — extract & extend `isGameRoute` so `/portal/jugar` is full-bleed (TDD)

The menu lives at `/portal/jugar` and is a full-screen game surface, but the shell only hides its chrome for `/portal/simulador/:id`. We extend the predicate. We also extract it to its own module so the unit test exercises the *real* function instead of a drifting copy (the current `shell.component.spec.ts` re-declares it).

**Files:**
- Create: `src/app/shared/layout/game-route.util.ts`
- Modify: `src/app/shared/layout/shell.component.ts:21-24` (remove local def, import) and `:236`
- Modify: `src/app/shared/layout/shell.component.spec.ts` (import the real predicate, add `/portal/jugar`)

All commands run from `D:\Sua_Files\IdeaProjects\psicologia_proyecto\admin-panel`.

- [ ] **Step 1: Rewrite the spec to import the real predicate and assert `/portal/jugar`**

Replace the entire contents of `src/app/shared/layout/shell.component.spec.ts`:

```typescript
import { isGameRoute } from './game-route.util';

describe('isGameRoute', () => {
  it('matches a specific simulador play route', () => {
    expect(isGameRoute('/portal/simulador/42')).toBe(true);
  });

  it('matches the jugar menu world', () => {
    expect(isGameRoute('/portal/jugar')).toBe(true);
  });

  it('does not match the simulador list', () => {
    expect(isGameRoute('/portal/simulador')).toBe(false);
  });

  it('does not match other portal routes', () => {
    expect(isGameRoute('/portal/dashboard')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/app/shared/layout/shell.component.spec.ts`
Expected: FAIL — `Cannot find module './game-route.util'`.

- [ ] **Step 3: Create the extracted, extended predicate**

Create `src/app/shared/layout/game-route.util.ts`:

```typescript
/**
 * True when the URL is a full-screen game surface that should render
 * without the portal shell chrome (sidebar/header). Covers both the
 * in-case simulator (`/portal/simulador/:id`) and the menu world
 * (`/portal/jugar`).
 */
export function isGameRoute(url: string): boolean {
  return /\/portal\/(simulador\/\d+|jugar)/.test(url);
}
```

- [ ] **Step 4: Point the shell at the extracted predicate**

In `src/app/shared/layout/shell.component.ts`:

1. Remove the local definition (lines 21-24):

```typescript
/** Returns true when the given URL is an active simulation play route. */
export function isGameRoute(url: string): boolean {
  return /\/portal\/simulador\/\d+/.test(url);
}
```

2. Add to the import block near the top (after the `APP_BRAND` import on line 11):

```typescript
import { isGameRoute } from './game-route.util';
```

(The existing call site on line 236, `const gameMode = isGameRoute(e.urlAfterRedirects);`, is unchanged.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/app/shared/layout/shell.component.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck the app builds**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/shared/layout/game-route.util.ts src/app/shared/layout/shell.component.ts src/app/shared/layout/shell.component.spec.ts
git commit -m "feat(shell): treat /portal/jugar as a full-bleed game route"
```

---

## Task 3: Frontend — type the new world DTO fields on `MapObjectState`

Pure typing (no runtime test); verified by the TypeScript compiler.

**Files:**
- Modify: `src/app/core/models/simulation.model.ts:145-162`

- [ ] **Step 1: Add the three optional fields**

In `src/app/core/models/simulation.model.ts`, edit the `MapObjectState` interface — add after `dialogue` (line 161):

```typescript
export interface MapObjectState {
  key: string;
  label: string;
  type: 'PERSON' | 'OBJECT' | 'ROUTE' | 'TOOL' | 'WARNING' | 'EXIT';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  icon: string;
  shortCode: string;
  collision: boolean;
  interactionPrompt: string;
  interactionText: string;
  decisionOptionId: number | null;
  toolCode: string | null;
  dialogue: DialogueState | null;
  /** B1 movement passthrough — additive; backend may omit on older payloads. */
  movementPattern?: Record<string, unknown>;
  facing?: string;
  metadata?: Record<string, unknown>;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/models/simulation.model.ts
git commit -m "feat(model): type movementPattern/facing/metadata on MapObjectState"
```

---

## Task 4: Frontend — `scene-guide.config.ts` (guide config + SIM-VBG-001 seed) (TDD)

A sibling of `scene-objectives.config.ts`. Maps `nodeKey → SceneGuideEntry`. Hints are process/wayfinding only — they never name the correct clinical decision.

**Files:**
- Create: `src/app/features/simulator/scene-guide.config.ts`
- Create: `src/app/features/simulator/scene-guide.config.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/features/simulator/scene-guide.config.spec.ts`:

```typescript
import { SCENE_GUIDES, getSceneGuide } from './scene-guide.config';

describe('scene-guide.config', () => {
  it('returns null for unknown / empty node keys', () => {
    expect(getSceneGuide(null)).toBeNull();
    expect(getSceneGuide(undefined)).toBeNull();
    expect(getSceneGuide('does-not-exist')).toBeNull();
  });

  it('provides a guide for each of the 5 playable SIM-VBG-001 nodes', () => {
    for (const nodeKey of [
      'urgencias-crisis', 'ruta-proteccion', 'informe-integral',
      'valoracion-comisaria', 'proteccion-nna',
    ]) {
      const g = getSceneGuide(nodeKey);
      expect(g).not.toBeNull();
      expect(g!.guideKey).toBeTruthy();
      expect(g!.targetKey).toMatch(/^tool-/);   // process pickup, never a decision object
      expect(g!.hint.length).toBeGreaterThan(10);
    }
  });

  it('has no guide for the terminal node (no objects to lead toward)', () => {
    expect(getSceneGuide('cierre-seguimiento')).toBeNull();
  });

  it('never points at a known decision object key', () => {
    const decisionKeys = new Set([
      'escucha-segura', 'cuestionario-prematuro', 'aviso-policial',
      'ruta-vbg', 'mediacion-prohibida', 'psiquiatria-aislada',
      'informe-integral', 'dsm-aislado', 'riesgo-estructurado',
      'contacto-agresor', 'ruta-nna', 'nna-sin-ruta',
    ]);
    for (const entry of Object.values(SCENE_GUIDES)) {
      expect(decisionKeys.has(entry.targetKey)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/app/features/simulator/scene-guide.config.spec.ts`
Expected: FAIL — `Cannot find module './scene-guide.config'`.

- [ ] **Step 3: Create the config**

Create `src/app/features/simulator/scene-guide.config.ts`:

```typescript
/**
 * Guide NPC config (Sub-project B1). A frontend-only "colleague" NPC that,
 * per node, walks to a free spot next to a *process* point (a TOOL pickup)
 * and surfaces a short process hint when the player approaches.
 *
 * Hard guardrail: the hint orients the PROCESS and the WHERE only. It never
 * names which clinical decision option is correct (that would break formative
 * assessment). `targetKey` is therefore always a TOOL object, never a decision
 * object. Authoring this from the editor is deferred to sub-project E.
 *
 * Keyed by node_key, which equals the scene map_key for SIM-VBG-001.
 */
export interface SceneGuideEntry {
  /** Frontend-only identifier for this guide NPC (unique per node). */
  guideKey: string;
  /** Label shown above the NPC sprite. */
  guideName: string;
  /** Spawn position in world pixels (player spawns at 145,430). */
  spawnX: number;
  spawnY: number;
  /** object_key of the process point to lead toward — always a TOOL. */
  targetKey: string;
  /** Short process guidance; must not reveal the correct decision. */
  hint: string;
}

export const SCENE_GUIDES: Record<string, SceneGuideEntry> = {
  'urgencias-crisis': {
    guideKey: 'guide-urgencias',
    guideName: 'Enfermera de turno',
    spawnX: 210, spawnY: 430,
    targetKey: 'tool-pap',
    hint: 'Antes de decidir, equípate y observa con calma. Tus herramientas de contención están aquí; recógelas y valora a la consultante sin apresurarte.',
  },
  'ruta-proteccion': {
    guideKey: 'guide-ruta',
    guideName: 'Trabajadora social',
    spawnX: 210, spawnY: 430,
    targetKey: 'tool-ruta',
    hint: 'Este momento exige articular la ruta institucional. Reúne tus instrumentos de valoración y protección antes de actuar.',
  },
  'informe-integral': {
    guideKey: 'guide-informe',
    guideName: 'Colega de psicología',
    spawnX: 210, spawnY: 430,
    targetKey: 'tool-ruta',
    hint: 'Vas a dejar un registro técnico. Toma tus instrumentos y organiza la información de forma integral y no revictimizante.',
  },
  'valoracion-comisaria': {
    guideKey: 'guide-comisaria',
    guideName: 'Funcionario de derechos',
    spawnX: 210, spawnY: 430,
    targetKey: 'tool-riesgo',
    hint: 'Aquí se valora el riesgo. Acércate a tus herramientas y revisa los factores con cuidado antes de proponer medidas.',
  },
  'proteccion-nna': {
    guideKey: 'guide-nna',
    guideName: 'Defensora de familia',
    spawnX: 210, spawnY: 430,
    targetKey: 'tool-ruta',
    hint: 'Piensa en los niños y niñas. Reúne tus herramientas y considera la protección integral antes de decidir la ruta.',
  },
};

export function getSceneGuide(nodeKey: string | undefined | null): SceneGuideEntry | null {
  if (!nodeKey) return null;
  return SCENE_GUIDES[nodeKey] ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/app/features/simulator/scene-guide.config.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/simulator/scene-guide.config.ts src/app/features/simulator/scene-guide.config.spec.ts
git commit -m "feat(guide): scene-guide config + SIM-VBG-001 seed (process-only hints)"
```

---

## Task 5: Frontend — `scene-motion.util.ts` pure motion helpers (TDD)

The testable core of the movement system: pattern resolution, stepping, wandering, bobbing, and finding a free tile near a target. The Phaser scene (Tasks 6-7) is thin glue over these.

**Files:**
- Create: `src/app/features/simulator/scene-motion.util.ts`
- Create: `src/app/features/simulator/scene-motion.util.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/features/simulator/scene-motion.util.spec.ts`:

```typescript
import {
  bobOffset, defaultPatternForType, freeTileNear, parseMovementPattern,
  pickWanderTarget, reached, resolvePattern, stepToward,
} from './scene-motion.util';

describe('scene-motion.util', () => {
  describe('parseMovementPattern', () => {
    it('returns null for empty/blank/invalid input', () => {
      expect(parseMovementPattern(undefined)).toBeNull();
      expect(parseMovementPattern(null)).toBeNull();
      expect(parseMovementPattern({})).toBeNull();
      expect(parseMovementPattern({ type: 'nope' })).toBeNull();
    });
    it('parses idle/wander/patrol', () => {
      expect(parseMovementPattern({ type: 'idle' })).toEqual({ type: 'idle' });
      expect(parseMovementPattern({ type: 'wander', radius: 50 })).toEqual({ type: 'wander', radius: 50 });
      expect(parseMovementPattern({ type: 'wander' })).toEqual({ type: 'wander', radius: 28 });
      expect(parseMovementPattern({ type: 'patrol', points: [[1, 2], [3, 4]] }))
        .toEqual({ type: 'patrol', points: [[1, 2], [3, 4]] });
    });
    it('rejects malformed patrol points', () => {
      expect(parseMovementPattern({ type: 'patrol', points: 'x' })).toBeNull();
      expect(parseMovementPattern({ type: 'patrol', points: [[1]] })).toBeNull();
    });
  });

  describe('defaultPatternForType / resolvePattern', () => {
    it('PERSON wanders by default; others idle', () => {
      expect(defaultPatternForType('PERSON')).toEqual({ type: 'wander', radius: 28 });
      expect(defaultPatternForType('OBJECT')).toEqual({ type: 'idle' });
    });
    it('an explicit pattern overrides the default', () => {
      expect(resolvePattern({ type: 'PERSON', movementPattern: { type: 'idle' } })).toEqual({ type: 'idle' });
      expect(resolvePattern({ type: 'PERSON' })).toEqual({ type: 'wander', radius: 28 });
    });
  });

  describe('stepToward / reached', () => {
    it('moves partway when far', () => {
      expect(stepToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 4)).toEqual({ x: 4, y: 0 });
    });
    it('snaps to target when within one step', () => {
      expect(stepToward({ x: 0, y: 0 }, { x: 3, y: 0 }, 4)).toEqual({ x: 3, y: 0 });
    });
    it('reached respects epsilon', () => {
      expect(reached({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 1)).toBe(true);
      expect(reached({ x: 0, y: 0 }, { x: 5, y: 0 }, 1)).toBe(false);
    });
  });

  describe('pickWanderTarget', () => {
    it('stays within radius of the origin', () => {
      const t = pickWanderTarget({ x: 100, y: 100 }, 20, () => 0.5);
      expect(Math.hypot(t.x - 100, t.y - 100)).toBeLessThanOrEqual(20 + 1e-9);
    });
  });

  describe('bobOffset', () => {
    it('is zero at t=0 and bounded by amplitude', () => {
      expect(bobOffset(0, 3, 1000)).toBeCloseTo(0);
      expect(Math.abs(bobOffset(250, 3, 1000))).toBeLessThanOrEqual(3 + 1e-9);
    });
  });

  describe('freeTileNear', () => {
    it('returns the target itself when free', () => {
      expect(freeTileNear({ x: 50, y: 50 }, () => false)).toEqual({ x: 50, y: 50 });
    });
    it('returns an adjacent free offset when the target is blocked', () => {
      // Block only the exact target tile.
      const blocked = (x: number, y: number) => x === 50 && y === 50;
      const spot = freeTileNear({ x: 50, y: 50 }, blocked, 24, 3);
      expect(blocked(spot.x, spot.y)).toBe(false);
      expect(spot).not.toEqual({ x: 50, y: 50 });
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/app/features/simulator/scene-motion.util.spec.ts`
Expected: FAIL — `Cannot find module './scene-motion.util'`.

- [ ] **Step 3: Implement the helpers**

Create `src/app/features/simulator/scene-motion.util.ts`:

```typescript
/**
 * Pure, framework-free motion helpers for the living-world scene (B1).
 * Kept independent of Phaser so they are unit-testable; the scene supplies
 * collision checks and timing.
 */

export type MovementPattern =
  | { type: 'idle' }
  | { type: 'wander'; radius: number }
  | { type: 'patrol'; points: Array<[number, number]> };

export const DEFAULT_WANDER_RADIUS = 28;

export function parseMovementPattern(
  raw: Record<string, unknown> | null | undefined,
): MovementPattern | null {
  if (!raw || typeof raw !== 'object') return null;
  const type = (raw as { type?: unknown }).type;
  if (type === 'idle') return { type: 'idle' };
  if (type === 'wander') {
    const r = Number((raw as { radius?: unknown }).radius);
    return { type: 'wander', radius: Number.isFinite(r) && r > 0 ? r : DEFAULT_WANDER_RADIUS };
  }
  if (type === 'patrol') {
    const pts = (raw as { points?: unknown }).points;
    const ok = Array.isArray(pts) && pts.length > 0 && pts.every(
      p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number'),
    );
    return ok ? { type: 'patrol', points: pts as Array<[number, number]> } : null;
  }
  return null;
}

export function defaultPatternForType(type: string): MovementPattern {
  return type === 'PERSON' ? { type: 'wander', radius: DEFAULT_WANDER_RADIUS } : { type: 'idle' };
}

export function resolvePattern(
  object: { type: string; movementPattern?: Record<string, unknown> | null },
): MovementPattern {
  return parseMovementPattern(object.movementPattern) ?? defaultPatternForType(object.type);
}

export function stepToward(
  cur: { x: number; y: number },
  target: { x: number; y: number },
  maxStep: number,
): { x: number; y: number } {
  const dx = target.x - cur.x;
  const dy = target.y - cur.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxStep || dist === 0) return { x: target.x, y: target.y };
  return { x: cur.x + (dx / dist) * maxStep, y: cur.y + (dy / dist) * maxStep };
}

export function reached(
  cur: { x: number; y: number },
  target: { x: number; y: number },
  epsilon = 1,
): boolean {
  return Math.hypot(target.x - cur.x, target.y - cur.y) <= epsilon;
}

export function pickWanderTarget(
  origin: { x: number; y: number },
  radius: number,
  rand: () => number,
): { x: number; y: number } {
  const angle = rand() * Math.PI * 2;
  const r = rand() * radius;
  return { x: origin.x + Math.cos(angle) * r, y: origin.y + Math.sin(angle) * r };
}

export function bobOffset(elapsedMs: number, amplitudePx: number, periodMs: number): number {
  return amplitudePx * Math.sin((2 * Math.PI * elapsedMs) / periodMs);
}

/**
 * Returns the target if it is free; otherwise probes 8 directions across
 * expanding rings and returns the first free offset. Falls back to the
 * target if nothing is free within `rings`.
 */
export function freeTileNear(
  target: { x: number; y: number },
  isBlocked: (x: number, y: number) => boolean,
  step = 24,
  rings = 3,
): { x: number; y: number } {
  if (!isBlocked(target.x, target.y)) return { x: target.x, y: target.y };
  const dirs: Array<[number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  for (let ring = 1; ring <= rings; ring++) {
    for (const [dx, dy] of dirs) {
      const x = target.x + dx * step * ring;
      const y = target.y + dy * step * ring;
      if (!isBlocked(x, y)) return { x, y };
    }
  }
  return { x: target.x, y: target.y };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/app/features/simulator/scene-motion.util.spec.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/simulator/scene-motion.util.ts src/app/features/simulator/scene-motion.util.spec.ts
git commit -m "feat(world): pure motion helpers for ambient life + guide pathing"
```

---

## Task 6: Frontend — ambient life, interactable juice & scene dust in `DataDrivenWorldScene`

Phaser integration over Task 5's helpers. Not TDD-able (canvas) — verified by `tsc` + live screenshots. All motion is gated on `this.callbacks.reduceMotion`.

**Design notes (read before coding):**
- **Interactive objects never wander** — they must stay at their interaction spot. They get a gentle float + the existing glow pulse. ("Interactive" = `EXIT`/`TOOL`/`ROUTE` type, or has `decisionOptionId`/`toolCode`/`dialogue`.) In SIM-VBG-001 *every* current object is interactive (including the `PERSON` `escucha-segura`, which is the decision point), so the visible "ambient NPC motion" here is the float/glow + the walking guide — the wander path exists for future non-interactive actors and `movementPattern` overrides.
- **Non-interactive actors** (future decorative `PERSON`s, or anything with a `wander`/`patrol` `movementPattern`) move in `update()` via the Task 5 helpers, collision-aware through the existing `wouldCollide`.

**Files:**
- Modify: `src/app/features/simulator/game-world.component.ts`

- [ ] **Step 1: Import the helpers**

At the top of `game-world.component.ts`, after the `scene-map-display.util` import block (line 22), add:

```typescript
import {
  MovementPattern, pickWanderTarget, reached, resolvePattern, stepToward,
} from './scene-motion.util';
```

- [ ] **Step 2: Add ambient-mover state fields**

Inside `class DataDrivenWorldScene`, after the `markerData` map declaration (line 45), add:

```typescript
  private readonly ambientMovers = new Map<string, AmbientMover>();
  private readonly AMBIENT_SPEED = 22;        // px/sec — slow, clinical
  private readonly AMBIENT_RETARGET_MS = 2600;
```

And add this interface just above the `class DataDrivenWorldScene` declaration (after the `WorldCallbacks` interface, line 31):

```typescript
interface AmbientMover {
  key: string;
  origin: { x: number; y: number };
  pattern: MovementPattern;
  target: { x: number; y: number } | null;
  retargetAt: number;
  patrolIdx: number;
}
```

- [ ] **Step 3: Clear movers on every (re)render**

In `renderWorld()` add `this.ambientMovers.clear();` next to `this.markers.clear();` (line ~275). In `renderRoom()` add the same next to its `this.markers.clear();` (line ~383).

- [ ] **Step 4: Apply ambient life per marker**

In `createMarker(object)`, just before the closing `}` of the method (after the EXIT `doorHints` block, line ~792), add:

```typescript
    this.applyAmbientLife(marker, object);
```

Then add these methods to the class (place them right after `createMarker`, before `buildGeomMarker`):

```typescript
  private isInteractive(o: MapObjectState): boolean {
    return o.type === 'EXIT' || o.type === 'TOOL' || o.type === 'ROUTE'
      || o.decisionOptionId != null
      || (o.toolCode != null && o.toolCode !== '')
      || o.dialogue != null;
  }

  /**
   * Per-object ambient behavior (B1). Interactive markers get a gentle float
   * (they must stay put for interaction); non-interactive actors wander/patrol
   * via the motion helpers, collision-aware. Static when reduced motion.
   */
  private applyAmbientLife(marker: Phaser.GameObjects.Container, object: MapObjectState) {
    if (this.callbacks.reduceMotion) return;

    if (this.isInteractive(object)) {
      // Interactable juice: subtle float on top of the existing glow pulse.
      this.tweens.add({
        targets: marker, y: object.y - 3, duration: 1400,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      return;
    }

    const pattern = resolvePattern(object);
    if (pattern.type === 'idle') {
      this.tweens.add({
        targets: marker, y: object.y - 2, duration: 1700,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      return;
    }
    this.ambientMovers.set(object.key, {
      key: object.key,
      origin: { x: object.x, y: object.y },
      pattern,
      target: null,
      retargetAt: 0,
      patrolIdx: 0,
    });
  }

  private updateAmbientMovers(time: number, delta: number) {
    if (this.callbacks.reduceMotion || this.ambientMovers.size === 0) return;
    const step = this.AMBIENT_SPEED * (delta / 1000);
    for (const mover of this.ambientMovers.values()) {
      const marker = this.markers.get(mover.key);
      if (!marker) continue;
      if (!mover.target || reached(marker, mover.target, 2) || time >= mover.retargetAt) {
        mover.target = this.nextAmbientTarget(mover);
        mover.retargetAt = time + this.AMBIENT_RETARGET_MS;
      }
      if (!mover.target) continue;
      const next = stepToward(marker, mover.target, step);
      if (!this.wouldCollide(next.x, next.y)) {
        marker.setPosition(next.x, next.y);
      } else {
        mover.target = null;   // blocked → re-pick next frame
      }
    }
  }

  private nextAmbientTarget(mover: AmbientMover): { x: number; y: number } | null {
    if (mover.pattern.type === 'wander') {
      return pickWanderTarget(mover.origin, mover.pattern.radius, Math.random);
    }
    if (mover.pattern.type === 'patrol' && mover.pattern.points.length) {
      mover.patrolIdx = (mover.patrolIdx + 1) % mover.pattern.points.length;
      const [x, y] = mover.pattern.points[mover.patrolIdx];
      return { x, y };
    }
    return null;
  }
```

- [ ] **Step 5: Drive movers from the update loop**

In `override update(_time: number, delta: number)`, the signature ignores time — rename to use it. Change line 128 from:

```typescript
  override update(_time: number, delta: number) {
```
to:
```typescript
  override update(time: number, delta: number) {
```

Then, just before `this.checkExitTriggers();` (line ~187), add:

```typescript
    this.updateAmbientMovers(time, delta);
```

- [ ] **Step 6: Add the subtle scene-level ambient touch (dust motes)**

Add this method to the class (after `nextAmbientTarget`):

```typescript
  /** One tasteful scene-level effect: faint, slow-rising dust motes. */
  private spawnAmbientDust(w: number, h: number) {
    if (this.callbacks.reduceMotion) return;
    for (let i = 0; i < 5; i++) {
      const mote = this.add.circle(
        Phaser.Math.Between(60, w - 60), Phaser.Math.Between(80, h - 120),
        1.5, 0x9dc0e8, 0.18,
      ).setDepth(2.5);
      this.tweens.add({
        targets: mote,
        y: mote.y - Phaser.Math.Between(20, 48),
        x: mote.x + Phaser.Math.Between(-16, 16),
        alpha: 0,
        duration: Phaser.Math.Between(4200, 7200),
        delay: Phaser.Math.Between(0, 2600),
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }
```

Call it in `renderWorld()` right after the `mergedObjects.forEach(obj => this.createMarker(obj));` line (line ~360):

```typescript
    this.spawnAmbientDust(mapW, mapH);
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 8: Build**

Run: `npx ng build --configuration development`
Expected: build succeeds.

- [ ] **Step 9: Live screenshot verification**

Start the dev servers if not already running (frontend `npm start` → http://localhost:4200; the Django backend must be serving the seeded `psychosim` DB — the serve proxies `/api`). Log in as the seeded student `estudiante@psychosim.edu.co` / `Estudiante123!`, open SIM-VBG-001, and use the `webapp-testing` skill (Playwright) or Claude Preview to capture a screenshot of the in-case world.
Confirm visually:
- Interactive markers gently float and glow (no jitter, no drift off-spot).
- Faint dust motes drift in the scene.
- With OS "reduce motion" on, everything is static (toggle and re-screenshot).

- [ ] **Step 10: Commit**

```bash
git add src/app/features/simulator/game-world.component.ts
git commit -m "feat(world): ambient life, interactable float/glow, and scene dust"
```

---

## Task 7: Frontend — the guide NPC (the "leads you" mechanic)

A frontend-only colleague NPC that walks to a free spot next to the node's `targetKey` tool and shows its process hint when the player is near. Reuses Task 5's helpers and the existing `wouldCollide` collision slide.

**Files:**
- Modify: `src/app/features/simulator/game-world.component.ts` (scene + component input)
- Modify: `src/app/features/simulator/simulation-play.component.ts` (compute + pass the entry)

- [ ] **Step 1: Import the guide type/helpers in the scene file**

In `game-world.component.ts`, extend the `scene-motion.util` import (from Task 6) to also import `freeTileNear`:

```typescript
import {
  freeTileNear, MovementPattern, pickWanderTarget, reached, resolvePattern, stepToward,
} from './scene-motion.util';
```

And add a new import:

```typescript
import { SceneGuideEntry } from './scene-guide.config';
```

- [ ] **Step 2: Add guide state fields**

Inside `class DataDrivenWorldScene`, after the `ambientMovers` fields (from Task 6), add:

```typescript
  private guideEntry: SceneGuideEntry | null = null;
  private guideContainer?: Phaser.GameObjects.Container;
  private guideSprite?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
  private guideBubble?: Phaser.GameObjects.Container;
  private guideTarget: { x: number; y: number } | null = null;
  private guideArrived = false;
  private readonly GUIDE_SPEED = 70;        // px/sec
  private readonly GUIDE_HINT_RANGE = 92;   // px
```

- [ ] **Step 3: Add the public `setGuide` + builders**

Add these methods to the class (place after `setSelected`, around line 220):

```typescript
  setGuide(entry: SceneGuideEntry | null) {
    this.guideEntry = entry;
    if (this.ready && this.world) this.buildGuide();
  }

  /** Builds (or rebuilds) the guide NPC for the current node + markers. */
  private buildGuide() {
    this.guideContainer?.destroy();
    this.guideContainer = undefined;
    this.guideBubble = undefined;
    this.guideSprite = undefined;
    this.guideTarget = null;
    this.guideArrived = false;

    const entry = this.guideEntry;
    if (!entry) return;

    // Resolve the target tool's on-screen position from its marker (already
    // merged with any Tiled position); fall back to the raw object data.
    const targetMarker = this.markers.get(entry.targetKey);
    const targetData = this.markerData.get(entry.targetKey);
    const targetPos = targetMarker
      ? { x: targetMarker.x, y: targetMarker.y }
      : targetData ? { x: targetData.x, y: targetData.y } : null;

    const shadow = this.add.ellipse(0, 13, 15, 5, 0x000000, 0.2);
    let sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
    if (this.assetsLoaded && this.textures.exists('characters')) {
      sprite = this.add.sprite(0, 0, 'characters', KenneyCharFrames.NPC_SUPERVISOR_IDLE).setScale(1.5);
    } else {
      sprite = this.add.circle(0, -6, 9, 0x8a6cff, 1).setStrokeStyle(2, 0xffffff, 0.9);
    }
    const name = this.add.text(0, -26, entry.guideName, {
      fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#cdd9ff',
      backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 }, align: 'center',
    }).setOrigin(0.5, 1);

    this.guideContainer = this.add.container(entry.spawnX, entry.spawnY, [shadow, sprite, name]).setDepth(16);
    this.guideSprite = sprite;
    this.guideBubble = this.buildGuideBubble(entry.hint);

    this.guideTarget = targetPos
      ? freeTileNear(targetPos, (x, y) => this.wouldCollide(x, y), 26, 3)
      : null;

    if (this.callbacks.reduceMotion) {
      // No walking — place beside the target and show the hint statically.
      if (this.guideTarget) this.guideContainer.setPosition(this.guideTarget.x, this.guideTarget.y);
      this.guideArrived = true;
      this.showGuideBubble(true);
    }
  }

  private buildGuideBubble(hint: string): Phaser.GameObjects.Container {
    const text = this.add.text(0, 0, hint, {
      fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#eef3ff',
      align: 'center', wordWrap: { width: 168 }, padding: { x: 8, y: 6 },
    }).setOrigin(0.5, 1);
    const b = text.getBounds();
    const bg = this.add.rectangle(0, 0, b.width + 16, b.height + 12, 0x141b2e, 0.94)
      .setStrokeStyle(1, 0x6f7cff, 0.6).setOrigin(0.5, 1);
    return this.add.container(0, 0, [bg, text]).setDepth(26).setVisible(false);
  }

  private showGuideBubble(show: boolean) {
    if (!this.guideBubble || !this.guideContainer) return;
    if (show) {
      this.guideBubble.setPosition(this.guideContainer.x, this.guideContainer.y - 30).setVisible(true);
    } else {
      this.guideBubble.setVisible(false);
    }
  }

  private updateGuide(delta: number) {
    if (!this.guideContainer || !this.guideEntry) return;

    if (!this.callbacks.reduceMotion && !this.guideArrived && this.guideTarget) {
      const step = this.GUIDE_SPEED * (delta / 1000);
      const next = stepToward(this.guideContainer, this.guideTarget, step);
      const goingLeft = next.x < this.guideContainer.x;
      // Straight-line move with collision slide (consistent with player movement).
      if (!this.wouldCollide(next.x, next.y)) {
        this.guideContainer.setPosition(next.x, next.y);
      } else if (!this.wouldCollide(next.x, this.guideContainer.y)) {
        this.guideContainer.setPosition(next.x, this.guideContainer.y);
      } else if (!this.wouldCollide(this.guideContainer.x, next.y)) {
        this.guideContainer.setPosition(this.guideContainer.x, next.y);
      } else {
        this.guideArrived = true;   // fully blocked — stop at the nearest free spot
      }
      if (this.guideSprite instanceof Phaser.GameObjects.Sprite) {
        this.guideSprite.setFlipX(goingLeft);
      }
      if (reached(this.guideContainer, this.guideTarget, 3)) this.guideArrived = true;
    }

    if (this.player && !this.callbacks.reduceMotion) {
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this.guideContainer.x, this.guideContainer.y,
      );
      this.showGuideBubble(d <= this.GUIDE_HINT_RANGE);
    }
  }
```

- [ ] **Step 4: Rebuild the guide on each world render & drive it in update()**

In `renderWorld()`, at the very end of the method (after `this.updateNearestInteraction(true);`, line ~373), add:

```typescript
    this.buildGuide();
```

In `renderRoom()`, at the very end (after its `this.updateNearestInteraction(true);`, line ~465), add the same:

```typescript
    this.buildGuide();
```

In `override update(time, delta)`, just after the `this.updateAmbientMovers(time, delta);` line (from Task 6), add:

```typescript
    this.updateGuide(delta);
```

- [ ] **Step 5: Expose a `guide` input on `GameWorldComponent`**

In the same file, on `class GameWorldComponent`, add the import-side type if not already imported (it is, from Step 1). Add a new input after `nearbyInteraction` (line ~955):

```typescript
  readonly guide = input<SceneGuideEntry | null>(null);
```

In `ngOnChanges(changes)` (line ~973), add a branch:

```typescript
    if (changes['guide']) this.scene?.setGuide(this.guide());
```

In `boot()`, the final `window.setTimeout(...)` (line ~1014) currently re-applies the world. Extend it to also apply the guide:

```typescript
    window.setTimeout(() => {
      if (this.world()) this.scene?.setWorld(this.world()!);
      this.scene?.setGuide(this.guide());
    }, 0);
```

- [ ] **Step 6: Compute + pass the guide entry from the play component**

In `simulation-play.component.ts`:

1. Add the import (after the `scene-objectives`-adjacent imports, near line 32):

```typescript
import { getSceneGuide, SceneGuideEntry } from './scene-guide.config';
```

2. Add a computed signal (next to the other `computed(...)` signals, e.g. after `visitedNodeKeys`, line ~432):

```typescript
  readonly guideEntry = computed<SceneGuideEntry | null>(
    () => getSceneGuide(this.attempt()?.currentNode.key),
  );
```

3. In the template, add the `[guide]` binding to `<app-game-world>` (line ~88-93):

```html
          <app-game-world #gameWorld class="game-layer" [world]="w"
            [nearbyInteraction]="nearbyInteraction()" [selectedInteractionKey]="selectedInteraction()?.key ?? null"
            [guide]="guideEntry()"
            (proximity)="nearbyInteraction.set($event)" (interact)="openInteraction($event)"
            (positionChange)="rememberPosition($event.x, $event.y)"
            (roomExit)="onRoomExit($event)"
            (npcInteract)="onNpcInteract($event)" />
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 8: Run the full Jest suite (no regressions)**

Run: `npx jest`
Expected: all suites PASS (the new config/util/shell specs included).

- [ ] **Step 9: Build**

Run: `npx ng build --configuration development`
Expected: build succeeds.

- [ ] **Step 10: Live screenshot verification**

With the dev servers running and logged in as the seeded student, open SIM-VBG-001 and verify, capturing screenshots between decisions:
- On scene load the colleague NPC walks from spawn (~210,430) to a free spot beside the node's tool (`tool-pap` on node 1).
- Approaching the guide surfaces its process hint bubble; moving away hides it.
- After making a decision (the world reloads for the next node), the guide reappears and walks to the *new* node's tool.
- The hint never states which clinical option to pick.
- With OS "reduce motion" on: the guide does not walk — it appears beside the tool with the hint shown statically.

- [ ] **Step 11: Commit**

```bash
git add src/app/features/simulator/game-world.component.ts src/app/features/simulator/simulation-play.component.ts
git commit -m "feat(guide): colleague NPC that walks to the process step and hints"
```

---

## Task 8: Frontend — menu polish (`game-menu.component.ts`)

Better clinic art via Phaser primitives (no new assets), clearer doors, a nicer avatar, and a smoother "Entrando al caso" intro. Verified by `tsc` + screenshots. (The sidebar-overlap fix already landed in Task 2.)

**Files:**
- Modify: `src/app/features/simulator/game-menu.component.ts`

- [ ] **Step 1: Layered clinic façade + sign + floor mat**

In `ClinicMenuScene.create()`, replace the three background rectangles + title (lines 34-39) with a layered façade:

```typescript
    // ── Layered clinic façade ────────────────────────────────────────────────
    this.add.rectangle(0, 0, W, H, 0x0e141a).setOrigin(0, 0);                 // sky/base
    this.add.rectangle(0, 96, W, 168, 0x1c2a3a).setOrigin(0, 0);              // building band
    this.add.rectangle(0, 96, W, 6, 0x2f4763).setOrigin(0, 0);               // cornice
    this.add.rectangle(0, this.floorY, W, H - this.floorY, 0x1b2733).setOrigin(0, 0); // floor
    this.add.rectangle(0, this.floorY, W, 4, 0x2f4763).setOrigin(0, 0);       // floor edge
    // Entrance mat in front of the doors
    this.add.rectangle(0, this.doorY + 6, W, 26, 0x223247, 0.6).setOrigin(0, 0);

    // Backlit clinic sign
    const sign = this.add.rectangle(24, 132, 250, 40, 0x12202f, 0.92).setOrigin(0, 0.5)
      .setStrokeStyle(2, 0x4f7cac, 0.5);
    this.add.text(sign.x + 14, 132, 'CLÍNICA · SIEP', {
      fontFamily: 'monospace', fontSize: '22px', color: '#9dc0e8',
    }).setOrigin(0, 0.5);
```

- [ ] **Step 2: Doors that read as doors (frame + handle + lock/glow)**

Replace the per-item door block in `create()` (lines 42-58) with:

```typescript
    this.doors = [];
    this.items.forEach((item, i) => {
      const x = 220 + i * this.spacing;
      const open = item.unlocked;
      const fill = item.completed ? 0x2f7476 : open ? 0x33506f : 0x2a2e35;

      // Frame, leaf, and handle
      this.add.rectangle(x, this.doorY, 108, 152, 0x12202f).setOrigin(0.5, 1)
        .setStrokeStyle(3, open ? 0x9dc0e8 : 0x555a63);
      const leaf = this.add.rectangle(x, this.doorY - 6, 88, 134, fill).setOrigin(0.5, 1)
        .setStrokeStyle(2, open ? 0x6f97c4 : 0x44484f);
      this.add.rectangle(x + 26, this.doorY - 74, 6, 12, 0xdfe8f2, open ? 0.9 : 0.4); // handle

      // Available doors glow; locked doors show a lock icon
      if (open && !item.completed) {
        this.tweens.add({
          targets: leaf, alpha: 0.78, duration: 1200,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      }
      if (!open) {
        this.add.text(x, this.doorY - 74, '🔒', { fontSize: '20px' }).setOrigin(0.5);
      }

      this.add.text(x, this.doorY - 168, item.title, {
        fontFamily: 'sans-serif', fontSize: '15px', color: open ? '#e8f0f4' : '#7a808a',
        align: 'center', wordWrap: { width: 180 },
      }).setOrigin(0.5, 1);
      const badge = item.completed ? '✓ Resuelto' : open ? '▶ Disponible' : '🔒 Bloqueado';
      this.add.text(x, this.doorY - 150, badge, {
        fontFamily: 'monospace', fontSize: '12px',
        color: item.completed ? '#8cbfa6' : open ? '#9dc0e8' : '#7a808a',
      }).setOrigin(0.5, 1);
      this.doors.push({ item, x });
    });
```

- [ ] **Step 3: A slightly nicer player avatar**

Replace the avatar block in `create()` (lines 60-62) with:

```typescript
    const shadow = this.add.ellipse(0, 18, 22, 6, 0x000000, 0.25);
    const body = this.add.rectangle(0, 0, 22, 34, 0x8a6cff).setStrokeStyle(2, 0xffffff);
    const coat = this.add.rectangle(0, 4, 22, 16, 0xb9a8ff, 0.9);   // lab-coat hem
    const head = this.add.circle(0, -24, 9, 0xf2c9a0).setStrokeStyle(2, 0xffffff, 0.85);
    this.player = this.add.container(220, this.floorY - 17, [shadow, body, coat, head]);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
```

- [ ] **Step 4: Smoother intro (fade + door-opening feel)**

In the component's `styles`, replace the `.enter-card` + `@keyframes fadein` rules (lines 155-161) with a scale/fade that reads like a door opening:

```css
    .enter-card {
      position: absolute; inset: 0; z-index: 40; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 6px; text-align: center;
      background: rgba(8,12,18,.96); color: #e8f0f4;
      animation: enter-open 360ms cubic-bezier(.2,.7,.2,1) both;
    }
    .enter-card .psy-eyebrow { letter-spacing: .14em; }
    .enter-card h2 {
      margin: 0; font-family: 'Poppins', system-ui, sans-serif; font-size: 1.8rem;
      animation: enter-rise 420ms cubic-bezier(.2,.7,.2,1) 80ms both;
    }
    @keyframes enter-open { from { opacity: 0; transform: scale(1.06); } to { opacity: 1; transform: scale(1); } }
    @keyframes enter-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @media (prefers-reduced-motion: reduce) {
      .enter-card, .enter-card h2 { animation: none; }
    }
```

- [ ] **Step 5: Typecheck & build**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Then: `npx ng build --configuration development`
Expected: both succeed.

- [ ] **Step 6: Live screenshot verification**

With dev servers running and logged in as the student, visit `/portal/jugar`. Capture a screenshot and confirm:
- The shell sidebar/header do NOT overlap the canvas (Task 2 fix); the menu is full-bleed.
- The façade, sign, entrance mat, framed doors (handle + lock on locked, glow on available), and the lab-coat avatar render.
- Pressing **E** on an available door plays the smoother "Entrando al caso" intro, then routes into the case.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/simulator/game-menu.component.ts
git commit -m "feat(menu): layered clinic art, clearer doors, nicer avatar, smoother intro"
```

---

## Task 9: Verification — Playwright smoke + full test sweep

The hard automated gates are Jest + pytest (Tasks 1-7). This task adds a best-effort Playwright smoke for the two deterministic DOM facts the spec calls out, and runs the whole sweep. The smoke requires the dev stack running and the seeded student; if standing up authenticated e2e proves flaky on this machine, treat the live screenshot checks in Tasks 6-8 (via the `webapp-testing` skill) as the source of truth and keep the smoke spec as documentation.

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/living-world.smoke.spec.ts`

- [ ] **Step 1: Add a minimal Playwright config**

Create `playwright.config.ts` at the `admin-panel` root:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 2: Write the smoke spec**

Create `e2e/living-world.smoke.spec.ts`. (Auth: the app stores its session via `AuthService`. The most robust smoke logs in through the UI; adjust the selectors to the real login form. Credentials: `estudiante@psychosim.edu.co` / `Estudiante123!`.)

```typescript
import { test, expect, Page } from '@playwright/test';

const EMAIL = 'estudiante@psychosim.edu.co';
const PASSWORD = 'Estudiante123!';

async function login(page: Page) {
  await page.goto('/');
  // Adjust these selectors to the real login form if they differ.
  await page.getByLabel(/correo|email/i).fill(EMAIL);
  await page.getByLabel(/contraseña|password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /ingresar|entrar|iniciar/i }).click();
  await page.waitForURL(/\/portal\//);
}

test('menu world renders full-bleed with no shell sidebar', async ({ page }) => {
  await login(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible();
  // The portal shell sidenav must not overlap the menu canvas on this route.
  await expect(page.locator('app-shell .portal-sidenav')).toHaveCount(0);
});

test('in-case world loads with the HUD', async ({ page }) => {
  await login(page);
  await page.goto('/portal/jugar');
  // Enter the first available case via the accessible door button.
  await page.locator('ul.sr-only button:not([disabled])').first().click();
  await page.waitForURL(/\/portal\/simulador\/\d+/);
  await expect(page.locator('app-game-world canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('app-simulation-hud')).toBeVisible();
});
```

- [ ] **Step 3: Run the smoke (best-effort, against the running stack)**

Ensure frontend (`npm start`) + backend are up and the `psychosim` DB is seeded. Then:
Run: `npx playwright test`
Expected: both smoke tests PASS. If login selectors differ, fix them to match the real form; if the authenticated stack can't be stood up reliably here, record that and rely on the Task 6-8 screenshots.

- [ ] **Step 4: Full regression sweep**

Frontend (from `admin-panel`): `npx jest` → all PASS.
Frontend build: `npx ng build` → succeeds.
Backend (from `backend_django`): `python -m pytest apps/simulation/tests/test_world.py -v` → all PASS. (Optionally the whole suite: `python -m pytest -q`.)

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e/living-world.smoke.spec.ts
git commit -m "test(e2e): living-world smoke (menu full-bleed + in-case world loads)"
```

---

## Self-Review (completed against the spec)

**Spec coverage:**
- §3.1 backend passthrough (`movementPattern`/`facing`/`metadata`, `_read_map`, additive, T15 test) → **Task 1**.
- §3.2 ambient NPC motion (default idle-bob + bounded wander, `movementPattern` override, `idle`/`wander`/`patrol` shapes, `facing`), interactable juice, scene touch, reduced-motion, isolated `applyAmbientLife` → **Tasks 5 + 6**. (`facing` is typed/passed through; consuming it for initial sprite orientation is a small live-iteration follow-up — noted in the handoff below.)
- §3.3 guide NPC (config `nodeKey → {guideKey,targetKey,hint}`, SIM-VBG-001 seed, walks beside target, surfaces hint, frontend-only, reuses movement system, reduced-motion static, never reveals the decision) → **Tasks 4 + 7**.
- §3.4 menu polish (`isGameRoute` + `/portal/jugar`, spec update, façade/doors/avatar, smoother intro) → **Tasks 2 + 8**.
- §3.5 integration (additive only; frontend `MapObjectState` gains 3 optional fields) → **Task 3**.
- §4 testing (pytest assertions; Playwright smoke for canvas + HUD + sidebar-absent; live feel via screenshots) → **Tasks 1, 9, and the screenshot steps in 6-8**.

**Type consistency:** `SceneGuideEntry` (config) is the single shape used by `getSceneGuide`, the `guide` input, `setGuide`, and `buildGuide`. `MovementPattern` + helper signatures in `scene-motion.util.ts` match their consumers in `applyAmbientLife`/`updateAmbientMovers`/`buildGuide`. `isGameRoute` lives in one module imported by both the shell and its spec.

**Open follow-ups (out of B1's hard scope; iterate live):** using `facing` to set initial sprite orientation; tuning wander radius/cadence and guide speed/positions; optional walk-cycle frames for the guide (Char 6 rows 15-17 exist in the spritesheet). None block the tasks above.

## Deviation from the spec, with rationale

The spec (§3.3) assumed the guide would be "an existing `PERSON` object (e.g. the nurse/colleague)." The SIM-VBG-001 seed has exactly one `PERSON` object — the patient `escucha-segura`, on one node — and it is itself the correct-decision point. Per the user's decision (2026-06-02), the guide is instead a **new frontend-only colleague NPC** defined in `scene-guide.config.ts`, and it leads to the **process tool pickup** (never a decision object). This delivers the "leads you" mechanic across all five playable nodes while keeping the formative-assessment guardrail safe by construction.
