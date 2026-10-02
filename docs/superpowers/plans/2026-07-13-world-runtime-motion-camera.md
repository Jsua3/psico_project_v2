# SIM-VBG-001 World Runtime, Motion and Camera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an atomic, typed Angular–Phaser runtime for `SIM-VBG-001` with precise accelerated movement, foot-centered deterministic collisions, a stable pixel-perfect camera, complete overlay input locking, and a shared actor-presentation contract.

**Architecture:** Angular remains authoritative for profile, session, network and overlays; it assembles one immutable `ScenePackageV1` and communicates with Phaser only through `GameWorldPort` commands/events. Phaser owns frame input, local kinematics, collision resolution, actor-body presentation and camera execution; none of those systems read storage or call an API. Pure TypeScript controllers carry the difficult behavior and metrics so Jest can prove them without booting WebGL, while Playwright verifies the real boundary in Chromium.

**Tech Stack:** Django/DRF and pytest for scene revision/hash, Angular 21 signals, TypeScript 5.9, Phaser 3.90, Jest/jsdom, Playwright/Chromium.

---

## Preconditions and ownership

Execute the character-contract plan first through the creation of these files:

- `frontend/src/app/features/character/character-manifest.model.ts`
- `frontend/src/app/features/character/avatar-render-plan.model.ts`
- `frontend/src/app/features/character/avatar-render-plan.util.ts`
- `frontend/src/app/features/character/actor-render-plan.model.ts`
- `frontend/src/app/features/character/actor-render-plan.util.ts`
- `frontend/src/app/features/character/character-profile.repository.ts`
- `frontend/src/app/core/models/consequence-tone.model.ts`
- `frontend/src/assets/visual/v1/manifest.json`

This plan imports, but never redefines, `AvatarRenderPlan` or `ActorRenderPlan`. `CharacterProfileRepository.renderPlan` is the Angular signal used by the runtime, `CharacterProfileRepository.manifest` is the catalog used to resolve every non-selectable actor, and `ensureLoaded()` is the fail-closed loader. `resolveActorRenderPlan(manifest, actorId)` must resolve every `SceneActorV1`; there is no preset, tint, selectable-character or fractional-scale fallback. The shared `pivot={x:24,y:68}` is frame-local, while `feetHitbox={x:-11,y:-16,width:22,height:16}` is relative to that feet pivot; Phaser treats the container position as the feet pivot and must not add either offset twice. `paletteId` and `paletteHash` remain immutable, opaque provenance metadata: the runtime preserves them and never derives or substitutes a palette.

Tasks 1–8 may begin once the listed character contracts exist and their focused
tests pass. Task 9 may not begin until Task 11 of
`2026-07-13-character-manifest-editor-premium.md` has migrated the editor, lobby
and outcome away from `baked-cast.util`/`lobby-avatar.util`; Task 9 then deletes
those now-unreferenced modules together with the NPC preset catalog. This phase
gate is deliberate: deleting the legacy modules earlier would leave live Angular
imports broken, while leaving them after Task 9 would preserve a second visual
authority.

The character plan also owns the exact four-slot reaction catalog carried by
every `AvatarRenderPlan`/`ActorRenderPlan`. This runtime imports
`ConsequenceTone` and resolves `reactRelief|reactSteady|reactTension|reactRupture`
from that catalog. It never guesses a clinical reaction from free-form emotion.

This plan is the authority for `frontend/src/app/features/simulator/runtime/actor-presentation.model.ts`. The dialogue/HUD plan must import `ActorPresentationState` from that file instead of declaring another speaker/body contract.

The currently verified baseline is:

```text
npm test --prefix frontend -- --runInBand \
  src/app/features/simulator/player-motion.util.spec.ts \
  src/app/features/simulator/character-motion.util.spec.ts \
  src/app/features/simulator/simulation-play.consent-gate.spec.ts

Test Suites: 3 passed, 3 total
Tests:       47 passed, 47 total
```

Do not preserve current whole-sprite scale/offset deformation merely to keep those 47 assertions green. Tasks 6 and 10 intentionally replace those tests with authored-frame presentation.

## Non-negotiable runtime invariants

1. Phaser receives one immutable scene package and an immutable avatar render plan; it never reads `localStorage`, calls `HttpClient`, chooses a character, or decides clinical progression.
2. Angular never reaches into a Phaser scene. It sends typed commands and consumes typed events containing stable IDs.
3. `InputLockState.locked` blocks player motion, NPC motion, doors, interactions and position events together.
4. A body animates from actual resolved displacement. Pressing into a wall produces idle legs and no footstep cue.
5. Collision geometry comes from the authoritative package only. Tiled and authored renderers may paint a room but may not invent gameplay solids.
6. Camera focus, zoom and scroll values are integer world pixels. Conversation framing is a command, not DOM code manipulating Phaser internals.
7. `ActorPresentationState | null` is the shared dialogue/body contract; `null` restores pre-conversation body state.
8. `contentHash` identifies the complete normalized static package, while `sceneInstanceKey` also binds attempt, map and revision; player position is excluded from both content identity calculations.
9. Every player and NPC sprite is produced by the same authored-frame renderer from an immutable render plan at `logicalScale: 1`; legacy preset, tint and fractional-scale branches are forbidden.
10. `ScenePackageV1.actors` is the exact duplicate-free union of backend ambient NPCs and visible `MapObject PERSON` interactions; each id has one premium body and PERSON is never drawn as a generic marker.
11. All eight slice stage keys and ten seeded EXIT records resolve through explicit versioned aliases/topology; no suffix heuristic or same-file target assumption is allowed.
12. A body with `pose:'react'` must carry one valid `ConsequenceTone`; the exact
    render plan must contain its mapped body animation and portrait state. Tone
    missing/unknown or catalog/atlas drift stops presentation visibly; there is
    no `unknown → concerned` fallback.
13. Every successful render publishes a scene-bound typed topology snapshot:
    one body per actor, one target per PERSON and zero generic PERSON markers;
    Playwright consumes public DOM evidence for all eight maps.

## File map

### Backend scene identity

- Modify `backend_django/apps/simulation/services/world_service.py`: emit stable scene revision and SHA-256 content hash, excluding live player/session state.
- Modify `backend_django/apps/simulation/tests/test_world.py`: prove identity shape, stability across movement and change across rooms.
- Modify `frontend/src/app/core/models/simulation.model.ts`: type the backend scene identity.

### Pure runtime contracts and controllers

- Create `frontend/src/app/features/simulator/runtime/actor-presentation.model.ts`: shared speaker/listener/body presentation types and pure conversation session reducer.
- Create `frontend/src/app/features/simulator/runtime/actor-presentation.model.spec.ts`: facing, speaker/listener and restore tests.
- Create `frontend/src/app/features/simulator/runtime/scene-package.model.ts`: immutable normalized runtime DTO.
- Create `frontend/src/app/features/simulator/runtime/scene-package.mapper.ts`: pure `SimulationWorldState + ScenarioConfig -> ScenePackageV1` mapper.
- Create `frontend/src/app/features/simulator/runtime/scene-package.mapper.spec.ts`: authority, immutability and malformed-package tests.
- Create `frontend/src/app/features/simulator/runtime/scene-actor-authoring.ts`: fail-closed initial presentation for the exact 14 actor ids and PERSON feet projection.
- Create `frontend/src/app/features/simulator/runtime/scene-actor-authoring.spec.ts`: ambient/PERSON union, roster and geometry coverage.
- Create `frontend/src/app/features/simulator/runtime/canonical-json-sha256.ts`: stable-key JSON and browser SHA-256 used by the complete static package identity.
- Create `frontend/src/app/features/simulator/runtime/canonical-json-sha256.spec.ts`: canonical-order and digest regressions.
- Create `frontend/src/app/features/simulator/runtime/input-lock.state.ts`: one lock derivation for every modal/attempt source.
- Create `frontend/src/app/features/simulator/runtime/input-lock.state.spec.ts`: table-driven lock-channel tests.
- Create `frontend/src/app/features/simulator/runtime/game-world.port.ts`: synchronous typed command/event port with deterministic startup buffering and immutable actor-topology evidence.
- Create `frontend/src/app/features/simulator/runtime/game-world.port.spec.ts`: buffering, typed topology event and teardown tests.
- Create `frontend/src/app/features/simulator/runtime/actor-topology-evidence.ts`: stable DOM-safe serialization of the typed runtime topology snapshot.
- Create `frontend/src/app/features/simulator/runtime/actor-topology-evidence.spec.ts`: exact ordering and delimiter regression for public E2E evidence.
- Create `frontend/src/app/features/simulator/runtime/player-controller.ts`: accelerated/braked kinematics and stable facing.
- Create `frontend/src/app/features/simulator/runtime/player-controller.spec.ts`: latency, diagonal, stop-distance and delta-clamp tests.
- Create `frontend/src/app/features/simulator/runtime/collision-world.ts`: authoritative bounds/AABB resolver with one-pixel substeps and corner slide.
- Create `frontend/src/app/features/simulator/runtime/collision-world.spec.ts`: tunneling, bounds, slide and 100-run regressions.
- Create `frontend/src/app/features/simulator/runtime/camera-director.ts`: dead zone, look-ahead, integer zoom/focus and conversation shots.
- Create `frontend/src/app/features/simulator/runtime/camera-director.spec.ts`: pixel stability, settle-time and framing tests.
- Create `frontend/src/app/features/simulator/runtime/actor-animation-resolver.ts`: fail-closed pose/`ConsequenceTone` resolution against the exact player/NPC render plan.
- Create `frontend/src/app/features/simulator/runtime/actor-animation-resolver.spec.ts`: ordinary poses, all four tones and missing/unknown/catalog-drift failures.
- Create `frontend/src/app/features/simulator/runtime/gamepad-input.ts`: normalized standard-controller frame through the shared lock.
- Create `frontend/src/app/features/simulator/runtime/gamepad-input.spec.ts`: dead-zone, diagonal and overlay-lock tests.
- Create `frontend/src/app/features/simulator/runtime/input-latency-probe.ts`: test-only bounded first-displacement metrics.
- Create `frontend/src/app/features/simulator/runtime/input-latency-probe.spec.ts`: single-sample and p95 tests.
- Create `frontend/src/app/features/simulator/runtime/input-bindings.ts`: versioned keyboard/XInput bindings and conflict-safe remapping.
- Create `frontend/src/app/features/simulator/runtime/input-bindings.spec.ts`: defaults, conflict and immutable remap tests.
- Create `frontend/src/app/features/simulator/runtime/input-binding.store.ts`: persistent per-user binding repository.
- Create `frontend/src/app/features/simulator/runtime/input-binding.store.spec.ts`: malformed-cache and account-isolation tests.
- Create `frontend/src/app/features/simulator/runtime/game-input-router.service.ts`: sole keyboard/gamepad sampler and semantic UI-action stream.
- Create `frontend/src/app/features/simulator/runtime/game-input-router.service.spec.ts`: edges, typing guard, locks and teardown tests.

### Angular–Phaser integration

- Modify `frontend/src/app/features/simulator/game-world.component.ts`: consume package/plan, own one port instance, adapt ID events to Angular outputs, and delegate kinematics/collision/camera/presentation to the pure controllers.
- Modify `frontend/src/app/features/simulator/simulation-play.component.ts`: load the character plan, assemble packages, derive `InputLockState`, and bind the new component inputs.
- Modify `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`: prove package publication and all-channel locks.
- Modify `frontend/src/app/features/simulator/simulation-hud.component.ts`: accessible control-remapping panel with conflict feedback and reset.
- Create `frontend/src/app/features/simulator/simulation-hud.component.spec.ts`: controlled settings ownership, capture, conflicts, persistence-facing outputs and focus tests.
- Delete `frontend/src/app/features/simulator/player-motion.util.ts`: superseded by `player-controller.ts` and `collision-world.ts`.
- Delete `frontend/src/app/features/simulator/player-motion.util.spec.ts`: superseded by the new controller specs.
- Delete `frontend/src/app/features/simulator/character-motion.util.ts`: forbidden whole-sprite scale/offset deformation.
- Delete `frontend/src/app/features/simulator/character-motion.util.spec.ts`: assertions encode the rejected deformation.
- Delete `frontend/src/app/features/simulator/scene-guide.config.ts`: remove the rejected walking visual guide companion.
- Delete `frontend/src/app/features/simulator/scene-guide.config.spec.ts`: remove its obsolete companion assertions.
- Modify `frontend/e2e/support/siep-flow.ts`: expose stable playable-world entry, runtime coordinates and typed actor-topology assertions.
- Modify `frontend/e2e/full-case.e2e.ts`: prove one body/target and zero generic PERSON markers on all eight slice maps.
- Create `frontend/e2e/world-runtime.e2e.ts`: real held-key/gamepad lock, no position request, movement response, reduced motion, latency and pixel camera checks.

### Task 1: Version the authoritative backend scene source

**Files:**

- Modify: `backend_django/apps/simulation/tests/test_world.py:109-125`
- Modify: `backend_django/apps/simulation/services/world_service.py:1-15,545-586`
- Modify: `frontend/src/app/core/models/simulation.model.ts:158-171`

- [ ] **Step 1: Write the failing backend identity regression**

Append this test after `test_get_world_returns_scene`:

```python
def test_scene_package_identity_is_stable_across_player_motion(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    url = f"/api/simulation/attempts/{attempt_id}/world"

    first = c.get(url, **attempt_headers(token)).data["data"]
    identity = first["scenePackage"]
    assert identity["schemaVersion"] == 1
    assert isinstance(identity["revision"], int)
    assert identity["revision"] >= 0
    assert len(identity["sourceContentHash"]) == 64
    assert all(char in "0123456789abcdef" for char in identity["sourceContentHash"])

    moved = c.patch(
        f"/api/simulation/attempts/{attempt_id}/world-state",
        {
            "attemptToken": token,
            "playerX": 340,
            "playerY": 430,
            "currentMapKey": first["map"]["key"],
        },
        format="json",
    )
    assert moved.status_code == 200
    assert moved.data["data"]["scenePackage"] == identity

    _inspect_familia(c, attempt_id, token, first["map"]["key"])
    _move(c, attempt_id, token, first["map"]["key"], *PATH_TO_DOOR)
    entered = c.post(
        f"/api/simulation/attempts/{attempt_id}/enter-room",
        {
            "attemptToken": token,
            "targetNodeKey": "hospital-sala-escucha",
            "entryX": 160,
            "entryY": 452,
            "doorKey": "puerta-sala-escucha",
        },
        format="json",
    )
    assert entered.status_code == 200
    next_identity = entered.data["data"]["scenePackage"]
    assert next_identity["revision"] == identity["revision"]
    assert next_identity["sourceContentHash"] != identity["sourceContentHash"]
```

- [ ] **Step 2: Run the test and verify the contract is absent**

Run:

```powershell
npm run test:backend -- apps/simulation/tests/test_world.py::test_scene_package_identity_is_stable_across_player_motion -q
```

Expected: `FAILED` with `KeyError: 'scenePackage'`.

- [ ] **Step 3: Add a canonical, player-independent backend source hash**

Add imports at the top of `world_service.py`:

```python
import hashlib
import json
```

Add this helper immediately before `_to_world_state`:

```python
def _scene_package_identity(attempt, map_data, objects, collisions):
    canonical = json.dumps(
        {
            "schemaVersion": 1,
            "caseVersionId": attempt.case_version_id,
            "map": map_data,
            "objects": objects,
            "collisions": collisions,
        },
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return {
        "schemaVersion": 1,
        "revision": attempt.case_version.version,
        "sourceContentHash": hashlib.sha256(canonical).hexdigest(),
    }
```

Replace `_to_world_state` with this complete implementation so the arrays used by the hash are exactly the arrays returned to the client:

```python
def _to_world_state(attempt, state):
    scene_map = state.scene_map
    inventory = _read_string_list(state.inventory_json)
    inventory_set = set(inventory)
    map_data = {
        "id": scene_map.id,
        "key": scene_map.map_key,
        "title": scene_map.title,
        "width": scene_map.width,
        "height": scene_map.height,
        "theme": scene_map.theme,
        "spawnX": scene_map.spawn_x,
        "spawnY": scene_map.spawn_y,
        "ambient": _read_map(scene_map.ambient_json),
    }
    objects = [
        _to_map_object(obj)
        for obj in MapObject.objects.filter(
            scene_map_id=scene_map.id,
            visible=True,
        ).order_by("id")
        if not (
            obj.object_type == "TOOL"
            and obj.tool_code
            and obj.tool_code in inventory_set
        )
    ]
    collisions = [
        _to_collision_zone(zone)
        for zone in CollisionZone.objects.filter(scene_map_id=scene_map.id).order_by("id")
    ]
    return {
        "attemptId": str(attempt.id),
        "status": attempt.status,
        "scenePackage": _scene_package_identity(attempt, map_data, objects, collisions),
        "map": map_data,
        "player": {"x": state.player_x, "y": state.player_y},
        "objects": objects,
        "collisions": collisions,
        "tools": [
            _to_clinical_tool(tool)
            for tool in ClinicalTool.objects.filter(
                case_version_id=attempt.case_version_id,
                active=True,
            ).order_by("id")
        ],
        "inventory": inventory,
        "inspectedObjectKeys": _read_string_list(state.inspected_object_keys_json),
        "viewedDialogueKeys": _read_string_list(state.viewed_dialogue_keys_json),
        "usedToolKeys": _read_string_list(state.used_tool_keys_json),
        "flags": _read_map(state.flags_json),
    }
```

Player coordinates and attempt flags are deliberately outside the backend source hash. Inventory is not hashed directly, but collecting a visible tool changes the returned `objects` array and therefore correctly changes the source hash. This is not yet the runtime `contentHash`: Task 3 combines this source identity with renderer/Tiled/camera policy, normalized solids/interactions, resolved actor render plans and authoritative exits before publishing `ScenePackageV1`.

- [ ] **Step 4: Type the response in Angular**

Insert before `SimulationWorldState` and add the required property:

```typescript
export interface ScenePackageSourceIdentity {
  schemaVersion: 1;
  revision: number;
  sourceContentHash: string;
}

export interface SimulationWorldState {
  attemptId: string;
  status: SimulationAttemptState['status'];
  scenePackage: ScenePackageSourceIdentity;
  map: SceneMapState;
  player: PlayerState;
  objects: MapObjectState[];
  collisions: CollisionZoneState[];
  tools: ClinicalToolState[];
  inventory: string[];
  inspectedObjectKeys: string[];
  viewedDialogueKeys: string[];
  usedToolKeys: string[];
  flags: Record<string, unknown>;
}
```

- [ ] **Step 5: Verify focused backend and frontend compilation**

Run:

```powershell
npm run test:backend -- apps/simulation/tests/test_world.py::test_get_world_returns_scene apps/simulation/tests/test_world.py::test_scene_package_identity_is_stable_across_player_motion -q
npm run build:frontend
```

Expected: `2 passed`; Angular build exits `0` with no missing `scenePackage` type errors.

- [ ] **Step 6: Commit the scene identity**

```powershell
git add backend_django/apps/simulation/services/world_service.py backend_django/apps/simulation/tests/test_world.py frontend/src/app/core/models/simulation.model.ts
git commit -m "feat(game): versionar paquete autoritativo de escena"
```

### Task 2: Define the shared actor-presentation state

**Files:**

- Create: `frontend/src/app/features/simulator/runtime/actor-presentation.model.ts`
- Create: `frontend/src/app/features/simulator/runtime/actor-presentation.model.spec.ts`

- [ ] **Step 1: Write the failing presentation-session tests**

Create the spec:

```typescript
import {
  ActorBodyState,
  ActorPresentationState,
  beginActorPresentation,
  endActorPresentation,
  resolveFacingToward,
} from './actor-presentation.model';

const bodies: Readonly<Record<string, ActorBodyState>> = {
  player: { actorId: 'player', facing: 'right', pose: 'idle', emotion: 'neutral', speaking: false },
  nurse: { actorId: 'nurse', facing: 'down', pose: 'idle', emotion: 'calm', speaking: false },
};

const presentation: ActorPresentationState = {
  dialogueKey: 'triage-1',
  speakerId: 'nurse',
  listenerId: 'player',
  speakerName: 'Enfermera',
  role: 'Enfermera de turno',
  emotion: 'worried',
  facing: 'toward-listener',
  pose: 'talk',
  speaking: true,
  portraitSrc: '/assets/portraits/nurse.png',
  usesPixelFallback: false,
};

describe('actor presentation session', () => {
  it('orients speaker and listener toward each other from authoritative positions', () => {
    const session = beginActorPresentation(bodies, presentation, {
      player: { x: 100, y: 100 },
      nurse: { x: 140, y: 100 },
    });
    expect(session.bodies.nurse).toMatchObject({ facing: 'left', pose: 'talk', speaking: true });
    expect(session.bodies.player).toMatchObject({ facing: 'right', pose: 'idle', speaking: false });
    expect(Object.isFrozen(session.bodies.nurse)).toBe(true);
  });

  it('restores the exact pre-dialogue body state', () => {
    const session = beginActorPresentation(bodies, presentation, {
      player: { x: 100, y: 100 },
      nurse: { x: 140, y: 100 },
    });
    expect(endActorPresentation(session)).toEqual(bodies);
  });

  it('requires one exact consequence tone only for a reaction pose', () => {
    expect(() => beginActorPresentation(bodies, {
      ...presentation, pose: 'react', speaking: false,
    }, { player: { x: 100, y: 100 }, nurse: { x: 140, y: 100 } }))
      .toThrow(/ConsequenceTone required/);
    expect(() => beginActorPresentation(bodies, {
      ...presentation, pose: 'talk', consequenceTone: 'rupture',
    }, { player: { x: 100, y: 100 }, nurse: { x: 140, y: 100 } }))
      .toThrow(/only valid for react/);
    const session = beginActorPresentation(bodies, {
      ...presentation, pose: 'react', speaking: false, consequenceTone: 'rupture',
    }, { player: { x: 100, y: 100 }, nurse: { x: 140, y: 100 } });
    expect(session.bodies.nurse.consequenceTone).toBe('rupture');
    const ordinary = beginActorPresentation(session.bodies, presentation, {
      player: { x: 100, y: 100 }, nurse: { x: 140, y: 100 },
    });
    expect(ordinary.bodies.nurse.consequenceTone).toBeUndefined();
  });

  it('uses the stable axis rule when actors overlap diagonally', () => {
    expect(resolveFacingToward({ x: 0, y: 0 }, { x: 8, y: 8 }, 'up')).toBe('right');
    expect(resolveFacingToward({ x: 0, y: 0 }, { x: 0, y: 0 }, 'up')).toBe('up');
  });

  it('preserves a non-spatial speaker without mutating or throwing', () => {
    const session = beginActorPresentation(bodies, {
      ...presentation,
      dialogueKey: 'registro-turno',
      speakerId: 'object-note',
      listenerId: null,
    }, {});
    expect(session.presentation.dialogueKey).toBe('registro-turno');
    expect(session.bodies).toEqual(bodies);
    expect(endActorPresentation(session)).toEqual(bodies);
  });
});
```

- [ ] **Step 2: Run it and verify the module does not exist**

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/actor-presentation.model.spec.ts
```

Expected: `FAIL` with `Cannot find module './actor-presentation.model'`.

- [ ] **Step 3: Implement the complete shared contract and reducer**

Create `actor-presentation.model.ts`:

```typescript
import type { ConsequenceTone } from '../../../core/models/consequence-tone.model';
import type { CardinalDirection } from '../../character/character-manifest.model';
export type { CardinalDirection } from '../../character/character-manifest.model';

export type ActorFacingIntent = CardinalDirection | 'toward-listener' | 'restore';
export type ActorPresentationPose = 'idle' | 'talk' | 'react';
export type ActorBodyPose = ActorPresentationPose | 'walk' | 'interact';

export interface ActorPresentationState {
  readonly dialogueKey: string;
  readonly speakerId: string;
  readonly listenerId: string | null;
  readonly speakerName: string;
  readonly role: string | null;
  readonly emotion: string;
  readonly consequenceTone?: ConsequenceTone;
  readonly facing: ActorFacingIntent;
  readonly pose: ActorPresentationPose;
  readonly speaking: boolean;
  readonly portraitSrc: string | null;
  readonly usesPixelFallback: boolean;
}

export interface ActorBodyState {
  readonly actorId: string;
  readonly facing: CardinalDirection;
  readonly pose: ActorBodyPose;
  readonly emotion: string;
  readonly consequenceTone?: ConsequenceTone;
  readonly speaking: boolean;
}

export interface ActorPoint {
  x: number;
  y: number;
}

export interface ActorPresentationSession {
  readonly presentation: ActorPresentationState;
  readonly bodies: Readonly<Record<string, ActorBodyState>>;
  readonly restore: Readonly<Record<string, ActorBodyState>>;
}

function freezeBodies(
  bodies: Readonly<Record<string, ActorBodyState>>,
): Readonly<Record<string, ActorBodyState>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(bodies).map(([key, body]) => [key, Object.freeze({ ...body })]),
  ));
}

export function resolveFacingToward(
  from: ActorPoint,
  to: ActorPoint,
  fallback: CardinalDirection,
): CardinalDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

export function beginActorPresentation(
  current: Readonly<Record<string, ActorBodyState>>,
  presentation: ActorPresentationState,
  positions: Readonly<Record<string, ActorPoint>>,
): ActorPresentationSession {
  if (presentation.pose === 'react' && !presentation.consequenceTone) {
    throw new Error('ConsequenceTone required for react pose');
  }
  if (presentation.pose !== 'react' && presentation.consequenceTone !== undefined) {
    throw new Error('ConsequenceTone is only valid for react pose');
  }
  const speaker = current[presentation.speakerId];
  if (!speaker) {
    return {
      presentation,
      bodies: freezeBodies(current),
      restore: freezeBodies(current),
    };
  }
  const listener = presentation.listenerId ? current[presentation.listenerId] : undefined;
  const speakerPoint = positions[presentation.speakerId];
  const listenerPoint = presentation.listenerId ? positions[presentation.listenerId] : undefined;

  const speakerFacing = presentation.facing === 'toward-listener'
    ? (speakerPoint && listenerPoint
        ? resolveFacingToward(speakerPoint, listenerPoint, speaker.facing)
        : speaker.facing)
    : presentation.facing === 'restore'
      ? speaker.facing
      : presentation.facing;
  const next: Record<string, ActorBodyState> = { ...current };
  next[presentation.speakerId] = {
    ...speaker,
    facing: speakerFacing,
    pose: presentation.pose,
    emotion: presentation.emotion,
    consequenceTone: presentation.pose === 'react'
      ? presentation.consequenceTone
      : undefined,
    speaking: presentation.speaking,
  };

  if (listener && presentation.listenerId) {
    next[presentation.listenerId] = {
      ...listener,
      facing: speakerPoint && listenerPoint
        ? resolveFacingToward(listenerPoint, speakerPoint, listener.facing)
        : listener.facing,
      pose: 'idle',
      consequenceTone: undefined,
      speaking: false,
    };
  }

  return {
    presentation,
    bodies: freezeBodies(next),
    restore: freezeBodies(current),
  };
}

export function endActorPresentation(
  session: ActorPresentationSession,
): Readonly<Record<string, ActorBodyState>> {
  return session.restore;
}
```

- [ ] **Step 4: Verify the contract**

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/actor-presentation.model.spec.ts
```

Expected: `1 passed` suite, `5 passed` tests.

- [ ] **Step 5: Commit the shared state**

```powershell
git add frontend/src/app/features/simulator/runtime/actor-presentation.model.ts frontend/src/app/features/simulator/runtime/actor-presentation.model.spec.ts
git commit -m "feat(game): definir presentacion compartida de actores"
```

### Task 3: Normalize one immutable `ScenePackageV1`

**Files:**

- Create: `frontend/src/app/features/simulator/runtime/scene-package.model.ts`
- Create: `frontend/src/app/features/simulator/runtime/scene-package.mapper.ts`
- Create: `frontend/src/app/features/simulator/runtime/scene-package.mapper.spec.ts`
- Create: `frontend/src/app/features/simulator/runtime/scene-actor-authoring.ts`
- Create: `frontend/src/app/features/simulator/runtime/scene-actor-authoring.spec.ts`
- Create: `frontend/src/app/features/simulator/runtime/canonical-json-sha256.ts`
- Create: `frontend/src/app/features/simulator/runtime/canonical-json-sha256.spec.ts`
- Modify: `frontend/src/app/core/models/simulation.model.ts`
- Modify: `frontend/src/app/features/simulator/scenario-config-assets.util.ts`
- Modify: `frontend/src/app/features/simulator/scenario-config-assets.util.spec.ts`
- Modify: `frontend/src/app/features/simulator/scenario-npc-configs.spec.ts`
- Modify: `frontend/src/app/features/simulator/case-pdf-rooms.spec.ts`
- Modify: `backend_django/apps/simulation/tests/test_caso_pdf.py`
- Modify: `frontend/src/assets/game/scenarios/cierre-seguimiento.json`
- Modify: `frontend/src/assets/game/scenarios/comisaria-consultorio.json`
- Modify: `frontend/src/assets/game/scenarios/comisaria-familia.json`
- Modify: `frontend/src/assets/game/scenarios/comisaria-recepcion.json`
- Modify: `frontend/src/assets/game/scenarios/hospital-sala-escucha.json`
- Modify: `frontend/src/assets/game/scenarios/hospital-urgencias.json`
- Modify: `frontend/src/assets/game/scenarios/informe-integral.json`
- Modify: `frontend/src/assets/game/scenarios/proteccion-nna.json`
- Modify: `frontend/src/assets/game/scenarios/ruta-proteccion.json`
- Modify: `frontend/src/assets/game/scenarios/urgencias-crisis.json`

- [ ] **Step 1: Write red mapper tests for authority and immutability**

Create `scene-package.mapper.spec.ts`:

```typescript
import type { ActorRenderPlan } from '../../character/actor-render-plan.model';
import type { CharacterManifestV1 } from '../../character/character-manifest.model';
import * as actorResolver from '../../character/actor-render-plan.util';
import { ScenarioConfig, SimulationWorldState } from '../../../core/models/simulation.model';
import { buildScenePackageV1 } from './scene-package.mapper';

const mockActorPlan = {
  actorId: 'enfermera-urgencias', visualId: 'enfermera-urgencias', selectable: false,
  schemaVersion: 1, manifestVersion: '1.0.0', contentHash: 'e'.repeat(64),
  displayName: 'Enfermera', paletteId: 'siep-master-v1', paletteHash: 'f'.repeat(64),
  logicalFrame: { width: 48, height: 72 }, pivot: { x: 24, y: 68 },
  feetHitbox: { x: -11, y: -16, width: 22, height: 16 },
  shadow: { offsetX: 0, offsetY: -1, width: 26, height: 8 }, logicalScale: 1,
  sheets: {}, animations: {}, portrait: {},
} as unknown as ActorRenderPlan;

beforeEach(() => {
  jest.spyOn(actorResolver, 'resolveActorRenderPlan').mockImplementation(
    (_manifest: CharacterManifestV1, actorId: string) => {
      if (!['enfermera-urgencias', 'familia-crisis'].includes(actorId)) {
        throw new Error(`actorId sin mapping: ${actorId}`);
      }
      return { ...mockActorPlan, actorId };
    },
  );
});

afterEach(() => jest.restoreAllMocks());

const manifest = { schemaVersion: 1, manifestVersion: '1.0.0' } as CharacterManifestV1;

function world(): SimulationWorldState {
  return {
    attemptId: 'attempt-1',
    status: 'IN_PROGRESS',
    scenePackage: { schemaVersion: 1, revision: 7, sourceContentHash: 'a'.repeat(64) },
    map: {
      id: 10, key: 'hospital-urgencias', title: 'Urgencias', width: 960, height: 540,
      theme: 'hospital', spawnX: 480, spawnY: 430,
      ambient: {
        ambientNpcs: [{ key: 'enfermera-urgencias', x: 560, y: 330, interactionRadius: 60 }],
        cameraZoom: 1,
      },
    },
    player: { x: 480, y: 430 },
    objects: [
      {
        key: 'desk', label: 'Desk', type: 'OBJECT', x: 300, y: 200, width: 80, height: 40,
        color: '#fff', icon: '', shortCode: '', collision: true,
        interactionPrompt: '', interactionText: '', decisionOptionId: null,
        toolCode: null, dialogue: null,
      },
      {
        key: 'door-listening', label: 'Sala de escucha', type: 'EXIT',
        x: 880, y: 220, width: 32, height: 64, color: '#fff', icon: '', shortCode: '',
        collision: false, interactionPrompt: 'Entrar', interactionText: '',
        decisionOptionId: null, toolCode: null, dialogue: null,
        metadata: { targetNodeKey: 'hospital-sala-escucha', entryX: 120, entryY: 420 },
      },
      {
        key: 'familia-crisis', label: 'Familia en crisis', type: 'PERSON',
        x: 190, y: 420, width: 48, height: 48, color: '#fff', icon: 'person', shortCode: 'FAM',
        collision: false, interactionPrompt: 'Hablar', interactionText: '',
        decisionOptionId: null, toolCode: null, dialogue: null,
      },
    ],
    collisions: [{ key: 'wall', label: null, x: 0, y: 0, width: 960, height: 24 }],
    tools: [], inventory: [], inspectedObjectKeys: [], viewedDialogueKeys: [],
    usedToolKeys: [], flags: {},
  };
}

const scenario: ScenarioConfig = {
  scenarioKey: 'hospital-urgencias',
  startRoomKey: 'hospital-urgencias',
  rooms: [{
    key: 'hospital-urgencias', tiledMapKey: 'hospital-urgencias', tiledJsonPath: '',
    backendMapKeys: ['hospital-urgencias'],
    displayName: 'Hospital - Urgencias', spawnX: 480, spawnY: 430,
    exits: [{ objectName: 'door-listening', targetRoomKey: 'hospital-sala-escucha', entryX: 120, entryY: 420, returnPolicy: 'required' }],
    exitsByBackendMapKey: {
      'hospital-urgencias': [{ objectName: 'door-listening', targetRoomKey: 'hospital-sala-escucha', entryX: 120, entryY: 420, returnPolicy: 'required' }],
    },
    npcs: [{
      key: 'enfermera-urgencias', npcType: 'colleague', displayName: 'Enfermera', portrait: '',
      x: 999, y: 999, frameIndex: 0,
      dialogue: { lines: [] }, facing: 'down', emotion: 'calm',
      motion: { behavior: 'attentive' },
    }],
  }, {
    key: 'hospital-sala-escucha', tiledMapKey: 'hospital-sala-escucha', tiledJsonPath: '/maps/listening.json',
    backendMapKeys: ['hospital-sala-escucha', 'hospital-sala-escucha-accion', 'hospital-sala-escucha-cierre'],
    displayName: 'Hospital - Escucha', spawnX: 120, spawnY: 420,
    exits: [],
    exitsByBackendMapKey: {
      'hospital-sala-escucha': [],
      'hospital-sala-escucha-accion': [],
      'hospital-sala-escucha-cierre': [],
    },
    npcs: [],
  }],
};

describe('buildScenePackageV1', () => {
  it('uses backend spatial data and an authored ActorRenderPlan, never a preset', async () => {
    const pkg = await buildScenePackageV1(world(), scenario, manifest);
    expect(pkg.actors[0].position).toEqual({ x: 560, y: 330 });
    expect(pkg.actors[0].interactionRadius).toBe(60);
    expect(pkg.actors[0].renderPlan).toMatchObject({ actorId: 'enfermera-urgencias', logicalScale: 1 });
    expect(pkg.actors[0]).not.toHaveProperty('avatarPresetKey');
    expect(pkg.actors[0]).not.toHaveProperty('scale');

    const family = pkg.actors.find(actor => actor.actorId === 'familia-crisis');
    expect(family).toMatchObject({
      source: 'person-interaction', interactionKey: 'familia-crisis',
      position: { x: 214, y: 468 }, interactionRadius: 74,
      interactionRect: { x: 190, y: 420, width: 48, height: 48 },
      renderPlan: { actorId: 'familia-crisis', logicalScale: 1 },
    });
    expect(pkg.actors.map(actor => actor.actorId))
      .toEqual(['enfermera-urgencias', 'familia-crisis']);
    expect(pkg.interactions.filter(item => item.type === 'PERSON').map(item => item.key))
      .toEqual(['familia-crisis']);
  });

  it('combines collision zones and colliding map objects once', async () => {
    const pkg = await buildScenePackageV1(world(), scenario, manifest);
    expect(pkg.solids.map(solid => solid.key)).toEqual(['zone:wall', 'object:desk']);
  });

  it('is deeply immutable and computes a complete static content identity', async () => {
    const sourceWorld = world();
    const pkg = await buildScenePackageV1(sourceWorld, scenario, manifest);
    expect(pkg.revision).toBe(7);
    expect(pkg.sourceContentHash).toBe('a'.repeat(64));
    expect(pkg.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pkg.sceneInstanceKey).toBe(`attempt-1:hospital-urgencias:7:${pkg.contentHash}`);
    expect(Object.isFrozen(pkg)).toBe(true);
    expect(Object.isFrozen(pkg.actors)).toBe(true);
    expect(Object.isFrozen(pkg.actors[0].renderPlan)).toBe(true);
    expect(Object.isFrozen(pkg.actors[0].position)).toBe(true);
    expect(Object.isFrozen(sourceWorld.objects[0])).toBe(false);
    expect(Object.isFrozen(scenario.rooms[0])).toBe(false);
  });

  it('keeps contentHash across player/attempt state but changes sceneInstanceKey', async () => {
    const a = await buildScenePackageV1(world(), scenario, manifest);
    const other = world();
    other.attemptId = 'attempt-2';
    other.player = { x: 700, y: 430 };
    const b = await buildScenePackageV1(other, scenario, manifest);
    expect(b.contentHash).toBe(a.contentHash);
    expect(b.sceneInstanceKey).not.toBe(a.sceneInstanceKey);
  });

  it('changes contentHash when renderer/Tiled policy changes', async () => {
    const a = await buildScenePackageV1(world(), scenario, manifest);
    const changed = structuredClone(scenario);
    changed.rooms[0].tiledJsonPath = '/maps/emergency-v2.json';
    const b = await buildScenePackageV1(world(), changed, manifest);
    expect(b.contentHash).not.toBe(a.contentHash);
    const revised = world();
    revised.scenePackage.revision = 8;
    const c = await buildScenePackageV1(revised, scenario, manifest);
    expect(c.contentHash).not.toBe(a.contentHash);
  });

  it.each([
    'hospital-sala-escucha',
    'hospital-sala-escucha-accion',
    'hospital-sala-escucha-cierre',
  ])('resolves the explicit backend stage alias %s without suffix heuristics', async mapKey => {
    const stage = world();
    stage.map.key = mapKey;
    stage.map.title = mapKey;
    stage.map.ambient = { ambientNpcs: [], cameraZoom: 1 };
    stage.objects = [];
    stage.collisions = [];
    const pkg = await buildScenePackageV1(stage, scenario, manifest);
    expect(pkg.map.key).toBe(mapKey);
    expect(pkg.map.rendererKey).toBe('hospital-sala-escucha');
    expect(pkg.sceneInstanceKey).toContain(`:${mapKey}:`);
  });

  it('fails closed for absent or duplicate backend map aliases', async () => {
    const absent = world();
    absent.map.key = 'hospital-sala-escucha-cierre';
    const withoutAlias = structuredClone(scenario);
    withoutAlias.rooms[1].backendMapKeys = ['hospital-sala-escucha'];
    await expect(buildScenePackageV1(absent, withoutAlias, manifest))
      .rejects.toThrow('No scenario room matches backend map');

    const duplicate = structuredClone(scenario);
    duplicate.rooms[1].backendMapKeys = ['hospital-urgencias'];
    await expect(buildScenePackageV1(world(), duplicate, manifest))
      .rejects.toThrow('Duplicate backend map alias');
  });

  it('publishes an exit only when one backend EXIT interaction matches it', async () => {
    const pkg = await buildScenePackageV1(world(), scenario, manifest);
    expect(pkg.exits).toEqual([{
      interactionKey: 'door-listening', targetRoomKey: 'hospital-sala-escucha',
      entry: { x: 120, y: 420 },
    }]);
    const invalid = world();
    invalid.objects[1].metadata = { targetNodeKey: 'wrong-room' };
    await expect(buildScenePackageV1(invalid, scenario, manifest)).rejects.toThrow('door-listening');
    const movedLanding = world();
    movedLanding.objects[1].metadata = {
      ...movedLanding.objects[1].metadata, entryX: 121, entryY: 420,
    };
    await expect(buildScenePackageV1(movedLanding, scenario, manifest))
      .rejects.toThrow('landing point differs');
    const missingStageTopology = structuredClone(scenario);
    missingStageTopology.rooms[0].exitsByBackendMapKey = {};
    await expect(buildScenePackageV1(world(), missingStageTopology, manifest))
      .rejects.toThrow('has no EXIT topology');
  });

  it('fails closed when an authored NPC lacks the canonical spatial entry', async () => {
    const invalid = world();
    invalid.map.ambient = { ambientNpcs: [] };
    await expect(buildScenePackageV1(invalid, scenario, manifest)).rejects.toThrow('enfermera-urgencias');
  });

  it('fails closed when actor mapping is absent or legacy scale is fractional', async () => {
    const unmappedScenario = structuredClone(scenario);
    unmappedScenario.rooms[0].npcs[0].key = 'unmapped';
    const unmappedWorld = world();
    unmappedWorld.map.ambient = {
      ambientNpcs: [{ key: 'unmapped', x: 560, y: 330, interactionRadius: 60 }],
    };
    await expect(buildScenePackageV1(unmappedWorld, unmappedScenario, manifest))
      .rejects.toThrow('actorId sin mapping: unmapped');

    const scaledScenario = structuredClone(scenario);
    Object.assign(scaledScenario.rooms[0].npcs[0], { scale: 0.8 });
    await expect(buildScenePackageV1(world(), scaledScenario, manifest))
      .rejects.toThrow('forbidden legacy preset/scale fields');
  });

  it('fails closed instead of publishing a room without its scenario contract', async () => {
    await expect(buildScenePackageV1(world(), { ...scenario, rooms: [] }, manifest))
      .rejects.toThrow('hospital-urgencias');
  });
});
```

In `scenario-npc-configs.spec.ts`, delete the
`NPC_AVATAR_PRESETS` import. Replace its first and fourth tests with these exact
tests; the remaining motion and collision tests stay unchanged:

```typescript
it('cada NPC tiene actorId estable y ningún override visual legado', () => {
  const actorInstances = new Set<string>();
  for (const { file, room, npc } of allNpcs()) {
    expect(npc.key.trim()).not.toBe('');
    const instanceKey = `${file}:${room.key}:${npc.key}`;
    expect(actorInstances.has(instanceKey)).toBe(false);
    actorInstances.add(instanceKey);
    expect(Object.prototype.hasOwnProperty.call(npc, 'avatarPresetKey')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(npc, 'scale')).toBe(false);
    expect(typeof npc.frameIndex).toBe('number');
    expect(npc.dialogue.lines.length).toBeGreaterThan(0);
    expect(`${file}:${npc.key}`).toBeTruthy();
  }
});

it('el caso principal tiene al menos cuatro actores y tres behaviors distintos', () => {
  const actors = loadScenario('urgencias-crisis').rooms[0].npcs;
  expect(actors.length).toBeGreaterThanOrEqual(4);
  const behaviors = new Set(actors.map(npc => npc.motion?.behavior).filter(Boolean));
  expect(behaviors.size).toBeGreaterThanOrEqual(3);
});
```

In `case-pdf-rooms.spec.ts`, delete the `NPC_AVATAR_PRESETS` import. Replace the
scenario-data test and the final modular-NPC test with:

```typescript
it('escenarios JSON: actorIds estables, sin overrides, behaviors válidos y diálogo presente', () => {
  const actorInstances = new Set<string>();
  for (const { file, room, npc } of allNpcs()) {
    expect(npc.key.trim()).not.toBe('');
    const instanceKey = `${file}:${room.key}:${npc.key}`;
    expect(actorInstances.has(instanceKey)).toBe(false);
    actorInstances.add(instanceKey);
    expect(Object.prototype.hasOwnProperty.call(npc, 'avatarPresetKey')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(npc, 'scale')).toBe(false);
    expect(typeof npc.frameIndex).toBe('number');
    expect(npc.dialogue.lines.length).toBeGreaterThan(0);
    if (npc.motion) expect(BEHAVIORS).toContain(npc.motion.behavior);
    expect(`${file}:${npc.key}`).toBeTruthy();
  }
});

it('todas las salas tienen actores y urgencias conserva al menos tres', () => {
  for (const file of CASE_SCENARIOS) {
    expect(loadScenario(file).rooms[0].npcs.length).toBeGreaterThan(0);
  }
  const actors = loadScenario('hospital-urgencias').rooms[0].npcs;
  expect(actors.length).toBeGreaterThanOrEqual(3);
  expect(actors.every(npc => BEHAVIORS.includes(npc.motion?.behavior ?? 'idle'))).toBe(true);
});
```

Extend `RoomConfig` in `simulation.model.ts` with transport-compatible optional
fields `backendMapKeys?: string[]` and
`exitsByBackendMapKey?: Record<string, RoomExitConfig[]>`; add optional
`returnPolicy?: 'required' | 'one-way'` to `RoomExitConfig`. Optionality exists
only so unrelated legacy test fixtures still deserialize during migration: the
mapper and shipped-asset validators below require every field and fail closed.
Author them explicitly
in every room of the ten scenario JSON files; never infer an alias by trimming
`-accion`, `-marco`, or `-cierre`. `exitsByBackendMapKey` is the versioned global
topology contract even though each visual config is stored in a separate JSON:
every alias has its own exact EXIT list, and a physical renderer may be reused
without pretending that all of its stages expose the same exits. For the
vertical slice the checked-in asset authority is:

```ts
export const SIM_VBG_001_SCENARIO_ASSET_BY_BACKEND_MAP = Object.freeze({
  'hospital-urgencias': 'hospital-urgencias',
  'hospital-sala-escucha': 'hospital-sala-escucha',
  'hospital-sala-escucha-accion': 'hospital-sala-escucha',
  'hospital-sala-escucha-cierre': 'hospital-sala-escucha',
  'comisaria-recepcion': 'comisaria-recepcion',
  'comisaria-consultorio': 'comisaria-consultorio',
  'comisaria-consultorio-marco': 'comisaria-consultorio',
  'comisaria-consultorio-cierre': 'comisaria-consultorio',
} as const);
```

Author this exact topology in the four slice JSON files and cross-check every
field against the seeded backend `MapObject type=EXIT` objects:

| Backend map key | `objectName` -> target @ entry | Return policy |
|---|---|---|
| `hospital-urgencias` | `puerta-sala-escucha` -> `hospital-sala-escucha` @ `160,452` | `required` |
| `hospital-sala-escucha` | `puerta-urgencias` -> `hospital-urgencias` @ `786,440`; `salida-institucional` -> `comisaria-recepcion` @ `160,452` | `required`; `one-way` |
| `hospital-sala-escucha-accion` | same two exact exits as the base listening room | `required`; `one-way` |
| `hospital-sala-escucha-cierre` | same two exact exits as the base listening room | `required`; `one-way` |
| `comisaria-recepcion` | `puerta-consultorio` -> `comisaria-consultorio` @ `160,452` | `required` |
| `comisaria-consultorio` | `puerta-recepcion` -> `comisaria-recepcion` @ `786,440` | `required` |
| `comisaria-consultorio-marco` | `puerta-recepcion` -> `comisaria-recepcion` @ `786,440` | `required` |
| `comisaria-consultorio-cierre` | no exits; terminal stage | n/a |

The five distinct directed physical edges are therefore Urgencias -> Escucha,
Escucha -> Urgencias, Escucha -> Recepción, Recepción -> Consultorio and
Consultorio -> Recepción. `required` means the global eight-map catalog contains
the reverse physical edge; `one-way` records the intentional institutional time
jump. Never require the target or reverse room to exist inside the currently
loaded single-room `ScenarioConfig`.

Export that catalog from `scenario-config-assets.util.ts` and make the existing
resolver consume it. In `scenario-config-assets.util.spec.ts` and
`case-pdf-rooms.spec.ts`, load the four referenced JSON files and assert that:
the catalog has exactly those eight keys; every key occurs in exactly one
`backendMapKeys` array; every array is non-empty and duplicate-free; the catalog
points to the file that declares it; and all other scenario rooms declare their
own exact backend key. Also flatten `exitsByBackendMapKey`, compare all eight
stage entries and ten concrete EXIT records to the table above, require exact
keys/targets/landing coordinates, prove the four required reverse relationships
globally, and prove that only the institutional edge is one-way. Missing, extra,
duplicate, blank, local-room target assumptions, or heuristically derived
aliases are red tests. Add a backend contract test in
`backend_django/apps/simulation/tests/test_caso_pdf.py` that seeds an isolated
database, reads these four JSON files, and compares every visible backend EXIT
for all eight maps against the same topology byte-for-byte; this prevents the
frontend catalog and seed from drifting independently.

Remove every `"avatarPresetKey": ...` property, including its trailing comma,
from the ten scenario JSON files named in this task. Do not replace it with a
visual id: each existing `npc.key` is the sole actor id and must resolve through
`CharacterManifestV1.actorMappings`. Do not add `scale`; integer scale comes only
from the resolved `ActorRenderPlan.logicalScale === 1`.

- [ ] **Step 2: Run red**

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/scene-package.mapper.spec.ts src/app/features/simulator/scenario-npc-configs.spec.ts src/app/features/simulator/case-pdf-rooms.spec.ts
```

Expected: `FAIL` because the model/mapper do not exist and the checked-in
scenario assets still contain legacy visual overrides.

- [ ] **Step 3: Implement and prove deterministic browser SHA-256**

Create `canonical-json-sha256.spec.ts`:

```typescript
import { webcrypto } from 'node:crypto';
import { canonicalJson, canonicalSha256 } from './canonical-json-sha256';

const jsdomCrypto = globalThis.crypto;

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: jsdomCrypto,
  });
});

it('sorts object keys recursively without reordering arrays', () => {
  expect(canonicalJson({ z: [{ b: 2, a: 1 }], a: true }))
    .toBe('{"a":true,"z":[{"a":1,"b":2}]}');
});

it('returns the known SHA-256 for canonical JSON', async () => {
  await expect(canonicalSha256({ b: 2, a: 1 }))
    .resolves.toBe('43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777');
});
```

Create `canonical-json-sha256.ts`:

```typescript
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('Scene package identity contains a non-finite number');
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export async function canonicalSha256(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable');
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
```

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/canonical-json-sha256.spec.ts
```

Expected: `1 passed` suite, `2 passed` tests.

- [ ] **Step 4: Create the complete runtime DTO**

Create `scene-package.model.ts`:

```typescript
import type { ActorRenderPlan } from '../../character/actor-render-plan.model';
import type { MapObjectState, NpcMotionConfig } from '../../../core/models/simulation.model';
import type { CardinalDirection } from './actor-presentation.model';

export interface RuntimePoint {
  readonly x: number;
  readonly y: number;
}

export interface RuntimeRect extends RuntimePoint {
  readonly width: number;
  readonly height: number;
}

export interface SceneSolidV1 extends RuntimeRect {
  readonly key: string;
}

export interface CameraPolicyV1 {
  readonly mode: 'framed' | 'follow';
  readonly zoom: number;
  readonly deadZone: { readonly width: number; readonly height: number };
  readonly lookAheadPx: number;
  readonly catchUpPxPerSecond: number;
  readonly settleMs: number;
}

export interface SceneActorV1 {
  readonly actorId: string;
  readonly source: 'ambient-npc' | 'person-interaction';
  /** Same authoritative key used for dialogue/interaction; never a visual id. */
  readonly interactionKey: string;
  readonly displayName: string;
  readonly position: RuntimePoint;
  readonly interactionRadius: number;
  readonly interactionRect: RuntimeRect | null;
  readonly renderPlan: ActorRenderPlan;
  readonly facing: CardinalDirection;
  readonly emotion: string;
  readonly motion: NpcMotionConfig;
}

export interface SceneExitV1 {
  readonly interactionKey: string;
  readonly targetRoomKey: string;
  /** Server-authored landing point, cross-checked against the scenario config. */
  readonly entry: RuntimePoint;
}

export interface ScenePackageV1 {
  readonly schemaVersion: 1;
  readonly revision: number;
  /** Hash supplied by Django for its returned map/objects/collisions source. */
  readonly sourceContentHash: string;
  /** SHA-256 of all normalized static scene fields, including revision/source; excluding attempt/player. */
  readonly contentHash: string;
  /** `${attemptId}:${map.key}:${revision}:${contentHash}`; runtime render/dedupe authority. */
  readonly sceneInstanceKey: string;
  readonly attemptId: string;
  readonly map: {
    readonly id: number;
    readonly key: string;
    readonly title: string;
    readonly displayName: string;
    readonly rendererKey: string;
    readonly tiledJsonPath: string;
    readonly bounds: RuntimeRect;
    readonly theme: string;
    readonly ambient: Readonly<Record<string, unknown>>;
    readonly camera: CameraPolicyV1;
  };
  readonly player: { readonly position: RuntimePoint };
  readonly solids: readonly SceneSolidV1[];
  readonly interactions: readonly Readonly<MapObjectState>[];
  readonly actors: readonly SceneActorV1[];
  readonly exits: readonly SceneExitV1[];
}
```

Create `scene-actor-authoring.ts` before the mapper. It is presentation
authoring, not visual selection: `CharacterManifestV1.actorMappings` remains the
only actor-to-art authority. Export a deeply frozen exact-key record for the 14
slice actor ids with `{ facing, emotion, motion }`, a fail-closed
`sceneActorAuthoringFor(actorId)` lookup, plus
`PERSON_INTERACTION_RADIUS_PX = 74` and a pure `personFeetFromRect` that rejects
non-finite/non-positive rectangles and returns bottom-centre feet
`{ x: rect.x + rect.width / 2, y: rect.y + rect.height }`. Author these initial
states and update the scenario JSON values to agree:

| Actor id | Facing | Initial emotion | Motion |
|---|---|---|---|
| `familia-duelo` | `right` | `anxious` | `idle` |
| `familia-crisis` | `right` | `anxious` | `idle` |
| `psicologa-acompanante` | `left` | `calm` | `attentive` |
| `sobreviviente-consulta` | `right` | `closed` | `idle` |
| `sobreviviente-espera` | `right` | `closed` | `idle` |
| `profesional-psicosocial` | `left` | `calm` | `attentive` |
| `apoyo-psicosocial` | `left` | `calm` | `attentive` |
| `funcionaria-recepcion` | `down` | `neutral` | `attentive` |
| `enfermera-urgencias` | `down` | `calm` | `attentive` |
| `medico-guardia` | `down` | `neutral` | `attentive` |
| `psicologa-orientadora` | `left` | `calm` | `attentive` |
| `trabajadora-social` | `down` | `calm` | `attentive` |
| `orientadora-juridica` | `right` | `neutral` | `attentive` |
| `madre-acompanante` | `left` | `worried` | `attentive` |

`scene-actor-authoring.spec.ts` must compare the exact 14 keys with the completed
character manifest's `actorMappings`, scan the four scenario assets plus the
eight seeded maps for every visible ambient/PERSON actor id, and fail if any id
is missing, extra, visually unmapped, or has presentation fields that diverge.
It also proves bottom-centre feet for the real `48x48` PERSON interaction
rectangle created by `seed_caso_pdf.py` (`width=48`, `height=48`) and rejects
zero, negative, NaN, or infinite geometry.

The seeded PERSON matrix is exact: `hospital-urgencias` has
`familia-crisis`; listening base/action have `familia-duelo` and
`psicologa-acompanante`; listening close has `familia-duelo`; reception has
`funcionaria-recepcion`; consultorio base/marco have
`sobreviviente-consulta` and `profesional-psicosocial`; consultorio close has no
PERSON body. The contract test combines this with each map's `ambientNpcs`,
requires exactly one `SceneActorV1` per visible id, and exercises all four
clinical consequence actors across base/action/closing fixtures.

- [ ] **Step 5: Implement the complete pure mapper**

Create `scene-package.mapper.ts`:

```typescript
import {
  MapObjectState,
  NpcConfig,
  RoomConfig,
  ScenarioConfig,
  SimulationWorldState,
} from '../../../core/models/simulation.model';
import type { CharacterManifestV1 } from '../../character/character-manifest.model';
import { resolveActorRenderPlan } from '../../character/actor-render-plan.util';
import { SIM_VBG_001_SCENARIO_ASSET_BY_BACKEND_MAP } from '../scenario-config-assets.util';
import { canonicalSha256 } from './canonical-json-sha256';
import {
  PERSON_INTERACTION_RADIUS_PX,
  personFeetFromRect,
  sceneActorAuthoringFor,
} from './scene-actor-authoring';
import { SceneActorV1, SceneExitV1, ScenePackageV1 } from './scene-package.model';

interface AmbientNpcSpatial {
  key: string;
  x: number;
  y: number;
  interactionRadius: number;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function currentRoom(mapKey: string, scenario: ScenarioConfig): RoomConfig {
  const index = new Map<string, RoomConfig>();
  for (const candidate of scenario.rooms) {
    if (!Array.isArray(candidate.backendMapKeys) || candidate.backendMapKeys.length === 0) {
      throw new Error(`Room ${candidate.key} has no backendMapKeys authority`);
    }
    for (const alias of candidate.backendMapKeys) {
      if (!alias || alias.trim() !== alias) throw new Error(`Invalid backend map alias in ${candidate.key}`);
      if (index.has(alias)) throw new Error(`Duplicate backend map alias ${alias}`);
      index.set(alias, candidate);
    }
  }
  const room = index.get(mapKey);
  if (!room) throw new Error(`No scenario room matches backend map ${mapKey}`);
  return room;
}

function readAmbientNpcs(ambient: Record<string, unknown>): AmbientNpcSpatial[] | null {
  const raw = ambient['ambientNpcs'];
  if (!Array.isArray(raw)) return null;
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`ambientNpcs[${index}] is invalid`);
    const record = entry as Record<string, unknown>;
    const key = typeof record['key'] === 'string' ? record['key'] : '';
    const x = Number(record['x']);
    const y = Number(record['y']);
    const interactionRadius = Number(record['interactionRadius']);
    if (!key || !Number.isFinite(x) || !Number.isFinite(y)
      || !Number.isFinite(interactionRadius) || interactionRadius <= 0) {
      throw new Error(`ambientNpcs[${index}] has invalid spatial fields`);
    }
    return { key, x, y, interactionRadius };
  });
}

function resolveStrictActorPlan(manifest: CharacterManifestV1, actorId: string) {
  const renderPlan = resolveActorRenderPlan(manifest, actorId);
  if (renderPlan.logicalScale !== 1 || renderPlan.actorId !== actorId) {
    throw new Error(`Actor ${actorId} resolved an invalid ActorRenderPlan`);
  }
  return renderPlan;
}

function ambientActorFrom(
  manifest: CharacterManifestV1,
  npc: NpcConfig,
  spatial: AmbientNpcSpatial,
): SceneActorV1 {
  if ('avatarPresetKey' in npc || 'scale' in npc) {
    throw new Error(`NPC ${npc.key} contains forbidden legacy preset/scale fields`);
  }
  const renderPlan = resolveStrictActorPlan(manifest, npc.key);
  const authored = sceneActorAuthoringFor(npc.key);
  const scenarioProjection = {
    facing: npc.facing ?? 'down',
    emotion: npc.emotion ?? 'neutral',
    motion: structuredClone(npc.motion ?? { behavior: 'idle' }),
  };
  if (JSON.stringify(scenarioProjection) !== JSON.stringify(authored)) {
    throw new Error(`NPC ${npc.key} presentation differs from scene actor authoring`);
  }
  return {
    actorId: npc.key,
    source: 'ambient-npc',
    interactionKey: npc.key,
    displayName: npc.displayName,
    position: { x: spatial.x, y: spatial.y },
    interactionRadius: spatial.interactionRadius,
    interactionRect: null,
    renderPlan,
    ...structuredClone(authored),
  };
}

function personActorFrom(
  manifest: CharacterManifestV1,
  object: MapObjectState,
): SceneActorV1 {
  if (object.type !== 'PERSON') throw new Error(`${object.key} is not a PERSON actor`);
  const interactionRect = {
    x: object.x, y: object.y, width: object.width, height: object.height,
  };
  const renderPlan = resolveStrictActorPlan(manifest, object.key);
  const authored = sceneActorAuthoringFor(object.key);
  return {
    actorId: object.key,
    source: 'person-interaction',
    interactionKey: object.key,
    displayName: object.label?.trim() || object.key,
    position: personFeetFromRect(interactionRect),
    interactionRadius: PERSON_INTERACTION_RADIUS_PX,
    interactionRect,
    renderPlan,
    ...structuredClone(authored),
  };
}

function authoritativeExits(
  backendMapKey: string,
  room: RoomConfig,
  scenario: ScenarioConfig,
  interactions: readonly MapObjectState[],
): readonly SceneExitV1[] {
  const backendExits = interactions.filter(item => item.type === 'EXIT');
  const authored = room.exitsByBackendMapKey?.[backendMapKey];
  if (!authored) throw new Error(`Room ${room.key} has no EXIT topology for ${backendMapKey}`);
  if (backendExits.length !== authored.length) {
    throw new Error(`Map ${backendMapKey} has divergent backend/topology EXIT counts`);
  }
  return authored.map(exit => {
    const matches = backendExits.filter(item => item.key === exit.objectName);
    if (matches.length !== 1) throw new Error(`Exit ${exit.objectName} must match exactly one backend EXIT`);
    const isSliceMap = backendMapKey in SIM_VBG_001_SCENARIO_ASSET_BY_BACKEND_MAP;
    const targetIsKnown = isSliceMap
      ? exit.targetRoomKey in SIM_VBG_001_SCENARIO_ASSET_BY_BACKEND_MAP
      : scenario.rooms.some(candidate => candidate.backendMapKeys?.includes(exit.targetRoomKey));
    if (!targetIsKnown) {
      throw new Error(`Exit ${exit.objectName} targets unknown backend map ${exit.targetRoomKey}`);
    }
    const targetNodeKey = matches[0].metadata?.['targetNodeKey'];
    if (targetNodeKey !== exit.targetRoomKey) {
      throw new Error(`Exit ${exit.objectName} target differs between backend and topology`);
    }
    const entryX = Number(matches[0].metadata?.['entryX']);
    const entryY = Number(matches[0].metadata?.['entryY']);
    if (!Number.isFinite(entryX) || !Number.isFinite(entryY)
      || entryX !== exit.entryX || entryY !== exit.entryY) {
      throw new Error(`Exit ${exit.objectName} landing point differs between backend and topology`);
    }
    return {
      interactionKey: matches[0].key,
      targetRoomKey: exit.targetRoomKey,
      entry: { x: entryX, y: entryY },
    };
  });
}

export async function buildScenePackageV1(
  world: SimulationWorldState,
  scenario: ScenarioConfig,
  manifest: CharacterManifestV1,
): Promise<ScenePackageV1> {
  if (world.scenePackage.schemaVersion !== 1) {
    throw new Error(`Unsupported scene package schema: ${world.scenePackage.schemaVersion}`);
  }
  if (!/^[0-9a-f]{64}$/.test(world.scenePackage.sourceContentHash)) {
    throw new Error('Invalid scene package sourceContentHash');
  }

  const room = currentRoom(world.map.key, scenario);
  const spatialNpcs = readAmbientNpcs(world.map.ambient);
  if (room.npcs.length > 0 && !spatialNpcs) {
    throw new Error(`Backend map ${world.map.key} has no authoritative ambientNpcs array`);
  }
  const spatialByKey = new Map(spatialNpcs?.map(npc => [npc.key, npc]) ?? []);
  if (spatialByKey.size !== (spatialNpcs?.length ?? 0)) {
    throw new Error(`Backend map ${world.map.key} has duplicate ambientNpcs`);
  }
  for (const npc of room.npcs) {
    if (!spatialByKey.has(npc.key)) {
      throw new Error(`NPC ${npc.key} has no authoritative ambientNpcs entry`);
    }
  }
  const configuredNpcKeys = new Set(room.npcs.map(npc => npc.key));
  for (const key of spatialByKey.keys()) {
    if (!configuredNpcKeys.has(key)) {
      throw new Error(`Backend ambient NPC ${key} has no visual scenario authoring`);
    }
  }

  const ambientZoom = Number(world.map.ambient['cameraZoom']);
  const zoom = Number.isInteger(ambientZoom) && ambientZoom >= 1 ? ambientZoom : 1;
  const ambientActors = room.npcs.map(npc =>
    ambientActorFrom(manifest, npc, spatialByKey.get(npc.key)!),
  );
  const personActors = world.objects
    .filter(object => object.type === 'PERSON')
    .map(object => personActorFrom(manifest, object));
  const actorIds = [...ambientActors, ...personActors].map(actor => actor.actorId);
  if (new Set(actorIds).size !== actorIds.length) {
    throw new Error(`Map ${world.map.key} contains a duplicate ambient/PERSON actor body`);
  }
  const actors = [...ambientActors, ...personActors];
  const solids = [
    ...world.collisions.map(zone => ({
      key: `zone:${zone.key}`, x: zone.x, y: zone.y,
      width: zone.width, height: zone.height,
    })),
    ...world.objects.filter(object => object.collision).map(object => ({
      key: `object:${object.key}`, x: object.x, y: object.y,
      width: object.width, height: object.height,
    })),
  ];

  const interactions = structuredClone(world.objects);
  const exits = authoritativeExits(world.map.key, room, scenario, interactions);
  const staticPackageWithoutHash = {
    schemaVersion: 1,
    revision: world.scenePackage.revision,
    sourceContentHash: world.scenePackage.sourceContentHash,
    map: {
      id: world.map.id,
      key: world.map.key,
      title: world.map.title,
      displayName: room.displayName,
      rendererKey: room.tiledMapKey,
      tiledJsonPath: room.tiledJsonPath,
      bounds: { x: 0, y: 0, width: world.map.width, height: world.map.height },
      theme: world.map.theme,
      ambient: structuredClone(world.map.ambient),
      camera: {
        mode: zoom === 1 && world.map.width <= 960 && world.map.height <= 540 ? 'framed' : 'follow',
        zoom,
        deadZone: { width: 72, height: 48 },
        lookAheadPx: 24,
        catchUpPxPerSecond: 240,
        settleMs: 220,
      },
    },
    solids,
    interactions,
    actors,
    exits,
  } as const;
  const contentHash = await canonicalSha256(staticPackageWithoutHash);
  const sceneInstanceKey = [
    world.attemptId,
    world.map.key,
    world.scenePackage.revision,
    contentHash,
  ].join(':');

  return deepFreeze({
    ...staticPackageWithoutHash,
    contentHash,
    sceneInstanceKey,
    attemptId: world.attemptId,
    player: { position: { ...world.player } },
  });
}
```

`RoomExitConfig.objectName`, target and `entryX`/`entryY` are selected from
`exitsByBackendMapKey[world.map.key]` and used only to cross-check the actual
backend EXIT interactions. For the eight-key slice the mapper validates targets
against the global catalog and never searches inside the currently loaded
one-room visual config; non-slice multi-room scenarios retain a fail-closed local
`backendMapKeys` target check as a compatibility path. The published and emitted authority is
the server-returned `SceneExitV1.interactionKey`, target and verified `entry`
after the global topology comparison; Tiled object layers may render a doorway
but never create, retarget, move or unlock an exit. The landing point is part of
`contentHash`, so a changed destination cannot reuse a stale scene identity.

`world.map.key` remains the exact backend stage key in `map.key`,
`staticPackageWithoutHash`, `contentHash`, and `sceneInstanceKey`; only
`rendererKey` / `tiledJsonPath` may be shared by an explicit alias. Therefore
base, action, and closing copies can reuse one visual room without sharing a
runtime identity or stale stage content.

- [ ] **Step 6: Verify mapper and canonical identity green**

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/canonical-json-sha256.spec.ts src/app/features/simulator/runtime/scene-actor-authoring.spec.ts src/app/features/simulator/runtime/scene-package.mapper.spec.ts src/app/features/simulator/scenario-config-assets.util.spec.ts src/app/features/simulator/scenario-npc-configs.spec.ts src/app/features/simulator/case-pdf-rooms.spec.ts
node scripts/run-backend-tests.mjs backend_django/apps/simulation/tests/test_caso_pdf.py -q
```

Expected: all six frontend suites and the isolated backend topology contract pass. The same static content in two attempts has one `contentHash` and two `sceneInstanceKey` values; changing renderer/Tiled policy changes `contentHash`; all eight backend stage keys resolve through an explicit unique alias; all ten seeded EXIT records match the global topology; ambient and PERSON actors form one exact body set and every actor is keyed for the manifest with no preset or scale override.

- [ ] **Step 7: Commit the atomic package**

```powershell
git add frontend/src/app/core/models/simulation.model.ts frontend/src/app/features/simulator/scenario-config-assets.util.ts frontend/src/app/features/simulator/scenario-config-assets.util.spec.ts frontend/src/app/features/simulator/runtime/canonical-json-sha256.ts frontend/src/app/features/simulator/runtime/canonical-json-sha256.spec.ts frontend/src/app/features/simulator/runtime/scene-actor-authoring.ts frontend/src/app/features/simulator/runtime/scene-actor-authoring.spec.ts frontend/src/app/features/simulator/runtime/scene-package.model.ts frontend/src/app/features/simulator/runtime/scene-package.mapper.ts frontend/src/app/features/simulator/runtime/scene-package.mapper.spec.ts frontend/src/app/features/simulator/scenario-npc-configs.spec.ts frontend/src/app/features/simulator/case-pdf-rooms.spec.ts backend_django/apps/simulation/tests/test_caso_pdf.py frontend/src/assets/game/scenarios/cierre-seguimiento.json frontend/src/assets/game/scenarios/comisaria-consultorio.json frontend/src/assets/game/scenarios/comisaria-familia.json frontend/src/assets/game/scenarios/comisaria-recepcion.json frontend/src/assets/game/scenarios/hospital-sala-escucha.json frontend/src/assets/game/scenarios/hospital-urgencias.json frontend/src/assets/game/scenarios/informe-integral.json frontend/src/assets/game/scenarios/proteccion-nna.json frontend/src/assets/game/scenarios/ruta-proteccion.json frontend/src/assets/game/scenarios/urgencias-crisis.json
git commit -m "feat(game): normalizar paquete atomico de escena"
```

### Task 4: Derive one all-channel `InputLockState`

**Files:**

- Create: `frontend/src/app/features/simulator/runtime/input-lock.state.ts`
- Create: `frontend/src/app/features/simulator/runtime/input-lock.state.spec.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`
- Modify: `frontend/src/app/features/simulator/simulation-hud.component.ts`
- Create: `frontend/src/app/features/simulator/simulation-hud.component.spec.ts`

- [ ] **Step 1: Write the table-driven red test**

Create `input-lock.state.spec.ts`:

```typescript
import { InputLockSources, resolveInputLockState } from './input-lock.state';

const OPEN: InputLockSources = {
  resumePrompt: false,
  contentWarning: false,
  introVideo: false,
  caseIntro: false,
  dialogue: false,
  journal: false,
  settings: false,
  outcome: false,
  busy: false,
};

describe('resolveInputLockState', () => {
  it.each(Object.keys(OPEN) as Array<keyof InputLockSources>)(
    '%s blocks every gameplay channel',
    source => {
      const lock = resolveInputLockState({ ...OPEN, [source]: true });
      expect(lock.locked).toBe(true);
      expect(lock.reasons).toEqual([source]);
      expect(lock.channels).toEqual({
        player: true,
        npcs: true,
        doors: true,
        interactions: true,
        positionEvents: true,
      });
    },
  );

  it('returns one immutable unlocked state when no source is active', () => {
    const lock = resolveInputLockState(OPEN);
    expect(lock.locked).toBe(false);
    expect(lock.reasons).toEqual([]);
    expect(Object.isFrozen(lock)).toBe(true);
    expect(Object.isFrozen(lock.channels)).toBe(true);
  });
});
```

- [ ] **Step 2: Run red**

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/input-lock.state.spec.ts
```

Expected: `FAIL` because the module does not exist.

- [ ] **Step 3: Implement the complete lock derivation**

Create `input-lock.state.ts`:

```typescript
export interface InputLockSources {
  resumePrompt: boolean;
  contentWarning: boolean;
  introVideo: boolean;
  caseIntro: boolean;
  dialogue: boolean;
  journal: boolean;
  settings: boolean;
  outcome: boolean;
  busy: boolean;
}

export type InputLockReason = keyof InputLockSources;

export interface InputLockState {
  locked: boolean;
  reasons: readonly InputLockReason[];
  channels: {
    player: boolean;
    npcs: boolean;
    doors: boolean;
    interactions: boolean;
    positionEvents: boolean;
  };
}

export function resolveInputLockState(sources: InputLockSources): InputLockState {
  const reasons = (Object.keys(sources) as InputLockReason[]).filter(key => sources[key]);
  const locked = reasons.length > 0;
  return Object.freeze({
    locked,
    reasons: Object.freeze(reasons),
    channels: Object.freeze({
      player: locked,
      npcs: locked,
      doors: locked,
      interactions: locked,
      positionEvents: locked,
    }),
  });
}
```

- [ ] **Step 4: Prove the current Angular boolean is insufficient**

In `simulation-play.consent-gate.spec.ts`, add a red assertion before changing the component:

```typescript
it('publishes a lock that blocks every runtime channel during dialogue', () => {
  setup(makeAttempt());
  component.attempt.set(makeAttempt());
  component.dialogue.set({
    key: 'lock-test', speakerName: 'Test', portraitKey: null,
    emotion: 'neutral', lines: [], choices: [],
  });

  expect(component.inputLockState().channels).toEqual({
    player: true,
    npcs: true,
    doors: true,
    interactions: true,
    positionEvents: true,
  });
});

it('owns settings state above the HUD and locks a held world input', () => {
  setup(makeAttempt());
  component.settingsOpen.set(true);
  expect(component.inputLockState()).toMatchObject({
    locked: true,
    reasons: ['settings'],
    channels: { player: true, npcs: true, doors: true, interactions: true, positionEvents: true },
  });
  expect(component.chromeInert()).toBe(false);
});
```

Create `simulation-hud.component.spec.ts` with the controlled-component regression:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SimulationHudComponent } from './simulation-hud.component';

describe('SimulationHudComponent settings ownership', () => {
  let fixture: ComponentFixture<SimulationHudComponent>;
  let component: SimulationHudComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SimulationHudComponent, NoopAnimationsModule],
    }).compileComponents();
    fixture = TestBed.createComponent(SimulationHudComponent);
    component = fixture.componentInstance;
  });

it('requests settings changes without keeping a private settings authority', () => {
  fixture.componentRef.setInput('settingsOpen', false);
  fixture.detectChanges();
  const changes: boolean[] = [];
  component.settingsOpenChange.subscribe(value => changes.push(value));
  fixture.nativeElement.querySelector('[data-testid="open-settings"]').click();
  expect(changes).toEqual([true]);
  expect(component.settingsOpen()).toBe(false);
});

it('keeps the controlled settings dialog outside every inert subtree', () => {
  fixture.componentRef.setInput('settingsOpen', true);
  fixture.detectChanges();
  const dialog = fixture.nativeElement.querySelector('[aria-labelledby="game-settings-title"]');
  expect(dialog).toBeTruthy();
  expect(dialog.closest('[inert]')).toBeNull();
});
});
```

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/simulation-play.consent-gate.spec.ts src/app/features/simulator/simulation-hud.component.spec.ts -t "settings|publishes a lock"
```

Expected: `FAIL` because `inputLockState`/`settingsOpenChange` do not exist and the HUD currently owns a private settings signal.

- [ ] **Step 5: Replace the boolean source with the typed state**

Import `resolveInputLockState`, add `readonly settingsOpen = signal(false)`, then replace the current `inputBlocked`/`worldMotionPaused` block with:

```typescript
readonly inputLockState = computed(() => resolveInputLockState({
  resumePrompt: this.showResumePrompt(),
  contentWarning: this.showContentWarning(),
  introVideo: this.showIntroVideo(),
  caseIntro: this.showCaseIntro(),
  dialogue: this.dialogue() !== null,
  journal: this.journalOpen(),
  settings: this.settingsOpen(),
  outcome: (this.attempt()?.status ?? 'IN_PROGRESS') !== 'IN_PROGRESS',
  busy: this.busy(),
}));

readonly inputBlocked = computed(() => this.inputLockState().locked);
readonly chromeInert = computed(() => this.inputBlocked() && !this.settingsOpen());
```

Do not keep `worldMotionPaused`; the full state is passed to the world in Task 9.
Replace `[attr.inert]="inputBlocked() ? '' : null"` and its matching
`aria-hidden` condition on the top-bar wrapper with `chromeInert()`. This keeps
the active settings dialog operable while the world remains fully locked; other
modal sources still inert the chrome. Inside the HUD, apply `inert` to the
non-settings action group when `settingsOpen()` is true, never to the settings
dialog itself: inside `.hud-actions`, create a `.hud-actions__controls` wrapper
around the journal, guide, settings and catalog/exit controls; bind its
`[attr.inert]` and `[attr.aria-hidden]` to `settingsOpen()`. Move the complete
`@if (settingsOpen()) { .settings-menu }` block after that wrapper as its sibling.
Give `.hud-actions__controls` the same flex/alignment declarations currently on
`.hud-actions`; retain `.hud-actions { position: relative; }` for menu anchoring.

Make the HUD controlled in this same step. Replace its private `readonly settingsOpen = signal(false)` with:

```typescript
readonly settingsOpen = input(false);
readonly settingsOpenChange = output<boolean>();

requestSettings(open: boolean): void {
  this.settingsOpenChange.emit(open);
}
```

Add `data-testid="open-settings"` to the open button and replace every HUD-side call to `settingsOpen.set(value)` with `requestSettings(value)`. Add these two attributes to the existing `app-simulation-hud` invocation at its only parent call site:

```html
[settingsOpen]="settingsOpen()"
(settingsOpenChange)="settingsOpen.set($event)"
```

The HUD may request open/close, but only `SimulationPlayComponent.settingsOpen` controls the overlay and therefore the lock. Task 13 routes the semantic settings shortcut to this same signal; it must not create another settings flag.

- [ ] **Step 6: Verify both suites**

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/input-lock.state.spec.ts src/app/features/simulator/simulation-play.consent-gate.spec.ts src/app/features/simulator/simulation-hud.component.spec.ts
```

Expected: all three suites pass; settings, dialogue and every other source block the same five channels, and the HUD has no private settings authority.

- [ ] **Step 7: Commit the lock contract**

```powershell
git add frontend/src/app/features/simulator/runtime/input-lock.state.ts frontend/src/app/features/simulator/runtime/input-lock.state.spec.ts frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts frontend/src/app/features/simulator/simulation-hud.component.ts frontend/src/app/features/simulator/simulation-hud.component.spec.ts
git commit -m "feat(game): unificar bloqueo de input"
```

### Task 5: Introduce the typed `GameWorldPort`

**Files:**

- Create: `frontend/src/app/features/simulator/runtime/game-world.port.ts`
- Create: `frontend/src/app/features/simulator/runtime/game-world.port.spec.ts`

- [ ] **Step 1: Write red tests for startup order, transient commands and events**

Create `game-world.port.spec.ts`:

```typescript
import { GameWorldCommand, GameWorldEvent, GameWorldPort } from './game-world.port';
import { ScenePackageV1 } from './scene-package.model';

const scene = { schemaVersion: 1, revision: 3, contentHash: 'b'.repeat(64) } as ScenePackageV1;

describe('GameWorldPort', () => {
  it('flushes the latest stateful commands in deterministic order on attach', () => {
    const port = new GameWorldPort();
    const received: GameWorldCommand[] = [];
    port.send({ type: 'set-input-lock', state: {
      locked: true, reasons: ['dialogue'],
      channels: { player: true, npcs: true, doors: true, interactions: true, positionEvents: true },
    } });
    port.send({ type: 'load-scene', scene });
    port.send({ type: 'set-input-lock', state: {
      locked: false, reasons: [],
      channels: { player: false, npcs: false, doors: false, interactions: false, positionEvents: false },
    } });
    port.send({ type: 'interact' });

    port.attach(command => received.push(command));
    expect(received.map(command => command.type)).toEqual(['load-scene', 'set-input-lock']);
    expect((received[1] as Extract<GameWorldCommand, { type: 'set-input-lock' }>).state.locked).toBe(false);
  });

  it('delivers live commands and typed events exactly once', () => {
    const port = new GameWorldPort();
    const commands: GameWorldCommand[] = [];
    const events: GameWorldEvent[] = [];
    port.attach(command => commands.push(command));
    const unsubscribe = port.onEvent(event => events.push(event));

    port.send({ type: 'interact' });
    port.emit({ type: 'interaction-requested', interactionKey: 'desk' });
    unsubscribe();
    port.emit({ type: 'interaction-requested', interactionKey: 'ignored' });

    expect(commands).toEqual([{ type: 'interact' }]);
    expect(events).toEqual([{ type: 'interaction-requested', interactionKey: 'desk' }]);
  });

  it('detaches the runtime and clears listeners on destroy', () => {
    const port = new GameWorldPort();
    const listener = jest.fn();
    port.attach(jest.fn());
    port.onEvent(listener);
    port.destroy();
    port.emit({
      type: 'ready', mapKey: 'x', revision: 1, contentHash: 'c'.repeat(64),
      sceneInstanceKey: `attempt:x:1:${'c'.repeat(64)}`,
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run red**

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/game-world.port.spec.ts
```

Expected: `FAIL` because `GameWorldPort` does not exist.

- [ ] **Step 3: Implement the complete synchronous port**

Create `game-world.port.ts`:

```typescript
import type { ActorPresentationState } from './actor-presentation.model';
import type { InputLockState } from './input-lock.state';
import type { RuntimePoint, ScenePackageV1 } from './scene-package.model';
import type { CharacterAnimationId } from '../../character/character-manifest.model';

export type GameCameraShot =
  | { kind: 'explore' }
  | { kind: 'conversation'; actorIds: readonly string[]; paddingPx: number };

export interface ActorInstanceCountV1 {
  readonly actorId: string;
  readonly count: number;
}

export interface ActorTopologySnapshotV1 {
  readonly sceneInstanceKey: string;
  readonly actorIds: readonly string[];
  readonly bodyCounts: readonly ActorInstanceCountV1[];
  readonly personActorIds: readonly string[];
  readonly personTargetCounts: readonly ActorInstanceCountV1[];
  readonly genericPersonMarkerIds: readonly string[];
}

export interface RoomTransitionRequestV1 {
  readonly transitionId: string;
  readonly originSceneInstanceKey: string;
  readonly targetRoomKey: string;
  readonly interactionKey: string;
  readonly expectedEntry: RuntimePoint;
}

export type GameWorldCommand =
  | { type: 'load-scene'; scene: ScenePackageV1 }
  | { type: 'set-input-lock'; state: InputLockState }
  | { type: 'set-preferences'; reduceMotion: boolean; sfxMuted: boolean }
  | { type: 'set-selected-interaction'; interactionKey: string | null }
  | { type: 'set-actor-presentation'; state: ActorPresentationState | null }
  | { type: 'set-camera-shot'; shot: GameCameraShot }
  | { type: 'begin-room-transition'; request: RoomTransitionRequestV1 }
  | { type: 'cancel-room-transition'; transitionId: string; reason: 'http' | 'package' | 'timeout' }
  | { type: 'focus-interaction'; interactionKey: string }
  | { type: 'nudge'; direction: 'down' | 'left' | 'right' | 'up' }
  | { type: 'interact' };

export type GameWorldEvent =
  | { type: 'ready'; mapKey: string; revision: number; contentHash: string; sceneInstanceKey: string }
  | { type: 'proximity-changed'; interactionKey: string | null }
  | { type: 'interaction-requested'; interactionKey: string }
  | { type: 'npc-interaction-requested'; actorId: string }
  | {
      type: 'room-exit-requested';
      originSceneInstanceKey: string;
      targetRoomKey: string;
      interactionKey: string;
      expectedEntry: RuntimePoint;
    }
  | { type: 'room-transition-covered'; transitionId: string }
  | { type: 'room-transition-complete'; transitionId: string; sceneInstanceKey: string }
  | { type: 'room-transition-cancelled'; transitionId: string }
  | { type: 'actor-topology-ready'; snapshot: ActorTopologySnapshotV1 }
  | { type: 'scene-render-failed'; sceneInstanceKey: string; message: string }
  | {
      type: 'actor-presentation-ready';
      dialogueKey: string;
      speakerId: string;
      elapsedMs: number;
    }
  | { type: 'player-position-changed'; position: RuntimePoint; atMs: number }
  | {
      type: 'runtime-snapshot';
      position: RuntimePoint;
      inputLocked: boolean;
      camera: { x: number; y: number; zoom: number };
      playerAnimationId: CharacterAnimationId;
    };

type CommandSink = (command: GameWorldCommand) => void;
type EventListener = (event: GameWorldEvent) => void;
type StatefulCommand = Extract<GameWorldCommand, {
  type: 'load-scene' | 'set-input-lock' | 'set-preferences'
    | 'set-selected-interaction' | 'set-actor-presentation' | 'set-camera-shot';
}>;

const FLUSH_ORDER: readonly StatefulCommand['type'][] = [
  'load-scene',
  'set-preferences',
  'set-input-lock',
  'set-selected-interaction',
  'set-actor-presentation',
  'set-camera-shot',
];

function isStateful(command: GameWorldCommand): command is StatefulCommand {
  return FLUSH_ORDER.includes(command.type as StatefulCommand['type']);
}

export class GameWorldPort {
  private sink: CommandSink | null = null;
  private readonly pending = new Map<StatefulCommand['type'], StatefulCommand>();
  private readonly listeners = new Set<EventListener>();

  send(command: GameWorldCommand): void {
    if (this.sink) {
      this.sink(command);
      return;
    }
    if (isStateful(command)) this.pending.set(command.type, command);
  }

  attach(sink: CommandSink): () => void {
    if (this.sink) throw new Error('GameWorldPort already has an attached runtime');
    this.sink = sink;
    for (const type of FLUSH_ORDER) {
      const command = this.pending.get(type);
      if (command) sink(command);
    }
    this.pending.clear();
    return () => {
      if (this.sink === sink) this.sink = null;
    };
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: GameWorldEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  destroy(): void {
    this.sink = null;
    this.pending.clear();
    this.listeners.clear();
  }
}
```

- [ ] **Step 4: Verify the port**

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/game-world.port.spec.ts
```

Expected: `1 passed` suite, `3 passed` tests.

- [ ] **Step 5: Commit the port**

```powershell
git add frontend/src/app/features/simulator/runtime/game-world.port.ts frontend/src/app/features/simulator/runtime/game-world.port.spec.ts
git commit -m "refactor(game): introducir puerto Angular Phaser"
```

### Task 6: Replace constant-speed input with precise acceleration and braking

**Files:**

- Create: `frontend/src/app/features/simulator/runtime/player-controller.ts`
- Create: `frontend/src/app/features/simulator/runtime/player-controller.spec.ts`

- [ ] **Step 1: Write red feel/metric tests**

Create `player-controller.spec.ts`:

```typescript
import {
  DEFAULT_PLAYER_TUNING,
  idlePlayerMotion,
  reconcileBlockedMotion,
  stepPlayerController,
} from './player-controller';

const NONE = { direction: { x: 0, y: 0 } };
const RIGHT = { direction: { x: 1, y: 0 } };
const DOWN_RIGHT = { direction: { x: 1, y: 1 } };

describe('stepPlayerController', () => {
  it('responds in the first 16 ms frame and accelerates to the capped speed', () => {
    let state = idlePlayerMotion('down');
    const first = stepPlayerController(state, RIGHT, 16);
    expect(first.displacement.x).toBeGreaterThan(0);
    expect(first.state.facing).toBe('right');
    state = first.state;
    for (let frame = 0; frame < 30; frame += 1) {
      state = stepPlayerController(state, RIGHT, 16).state;
    }
    expect(Math.hypot(state.velocity.x, state.velocity.y))
      .toBeCloseTo(DEFAULT_PLAYER_TUNING.maxSpeed, 5);
  });

  it('keeps diagonal speed within 3 percent of cardinal speed', () => {
    let cardinal = idlePlayerMotion('right');
    let diagonal = idlePlayerMotion('right');
    for (let frame = 0; frame < 30; frame += 1) {
      cardinal = stepPlayerController(cardinal, RIGHT, 16).state;
      diagonal = stepPlayerController(diagonal, DOWN_RIGHT, 16).state;
    }
    const cardinalSpeed = Math.hypot(cardinal.velocity.x, cardinal.velocity.y);
    const diagonalSpeed = Math.hypot(diagonal.velocity.x, diagonal.velocity.y);
    expect(Math.abs(diagonalSpeed - cardinalSpeed) / cardinalSpeed).toBeLessThanOrEqual(0.03);
  });

  it('preserves analog magnitude below the unit circle', () => {
    let state = idlePlayerMotion('right');
    for (let frame = 0; frame < 40; frame += 1) {
      state = stepPlayerController(state, { direction: { x: 0.5, y: 0 } }, 16).state;
    }
    expect(Math.hypot(state.velocity.x, state.velocity.y))
      .toBeCloseTo(DEFAULT_PLAYER_TUNING.maxSpeed * 0.5, 5);
  });

  it('stops in no more than 35 percent of the 22 px foot width', () => {
    let state = idlePlayerMotion('right');
    for (let frame = 0; frame < 40; frame += 1) {
      state = stepPlayerController(state, RIGHT, 16).state;
    }
    let stoppingDistance = 0;
    for (let frame = 0; frame < 30; frame += 1) {
      const result = stepPlayerController(state, NONE, 16);
      stoppingDistance += Math.hypot(result.displacement.x, result.displacement.y);
      state = result.state;
    }
    expect(stoppingDistance).toBeLessThanOrEqual(22 * 0.35);
    expect(state.moving).toBe(false);
    expect(state.facing).toBe('right');
  });

  it('clamps a resumed-tab delta and zeros a blocked velocity axis', () => {
    const frame = stepPlayerController(idlePlayerMotion('down'), RIGHT, 500);
    expect(frame.deltaMs).toBe(DEFAULT_PLAYER_TUNING.maxDeltaMs);
    expect(reconcileBlockedMotion(frame.state, true, false).velocity.x).toBe(0);
  });
});
```

- [ ] **Step 2: Run red**

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/player-controller.spec.ts
```

Expected: `FAIL` because the controller does not exist.

- [ ] **Step 3: Implement the complete pure controller**

Create `player-controller.ts`:

```typescript
import type { CardinalDirection } from './actor-presentation.model';
import type { RuntimePoint } from './scene-package.model';

export interface PlayerInputFrame {
  /** Analog or digital direction; each axis is finite and clamped to [-1, 1]. */
  direction: RuntimePoint;
}

export interface PlayerMotionTuning {
  maxSpeed: number;
  acceleration: number;
  braking: number;
  maxDeltaMs: number;
  stopEpsilon: number;
}

export const DEFAULT_PLAYER_TUNING: PlayerMotionTuning = Object.freeze({
  maxSpeed: 144,
  acceleration: 1400,
  braking: 1800,
  maxDeltaMs: 34,
  stopEpsilon: 0.25,
});

export interface PlayerMotionState {
  velocity: RuntimePoint;
  facing: CardinalDirection;
  moving: boolean;
}

export interface PlayerMotionFrameResult {
  state: PlayerMotionState;
  displacement: RuntimePoint;
  deltaMs: number;
  inputActive: boolean;
}

export function idlePlayerMotion(facing: CardinalDirection): PlayerMotionState {
  return { velocity: { x: 0, y: 0 }, facing, moving: false };
}

function approachVector(current: RuntimePoint, target: RuntimePoint, maxChange: number): RuntimePoint {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0 || distance <= maxChange) return { ...target };
  const ratio = maxChange / distance;
  return { x: current.x + dx * ratio, y: current.y + dy * ratio };
}

function inputVector(input: PlayerInputFrame): RuntimePoint {
  const x = Number.isFinite(input.direction.x) ? Math.min(1, Math.max(-1, input.direction.x)) : 0;
  const y = Number.isFinite(input.direction.y) ? Math.min(1, Math.max(-1, input.direction.y)) : 0;
  const length = Math.hypot(x, y);
  return length <= 1 ? { x, y } : { x: x / length, y: y / length };
}

function nextFacing(vector: RuntimePoint, previous: CardinalDirection): CardinalDirection {
  if (vector.x === 0 && vector.y === 0) return previous;
  if (previous === 'left' && vector.x < 0) return previous;
  if (previous === 'right' && vector.x > 0) return previous;
  if (previous === 'up' && vector.y < 0) return previous;
  if (previous === 'down' && vector.y > 0) return previous;
  return Math.abs(vector.x) >= Math.abs(vector.y)
    ? (vector.x >= 0 ? 'right' : 'left')
    : (vector.y >= 0 ? 'down' : 'up');
}

export function stepPlayerController(
  previous: PlayerMotionState,
  input: PlayerInputFrame,
  rawDeltaMs: number,
  tuning: PlayerMotionTuning = DEFAULT_PLAYER_TUNING,
): PlayerMotionFrameResult {
  const deltaMs = Math.min(Math.max(rawDeltaMs, 0), tuning.maxDeltaMs);
  const deltaSeconds = deltaMs / 1000;
  const axis = inputVector(input);
  const inputActive = axis.x !== 0 || axis.y !== 0;
  const target = inputActive
    ? { x: axis.x * tuning.maxSpeed, y: axis.y * tuning.maxSpeed }
    : { x: 0, y: 0 };
  let velocity = approachVector(
    previous.velocity,
    target,
    (inputActive ? tuning.acceleration : tuning.braking) * deltaSeconds,
  );
  if (!inputActive && Math.hypot(velocity.x, velocity.y) <= tuning.stopEpsilon) {
    velocity = { x: 0, y: 0 };
  }
  const moving = Math.hypot(velocity.x, velocity.y) > tuning.stopEpsilon;
  return {
    state: {
      velocity,
      facing: inputActive ? nextFacing(axis, previous.facing) : previous.facing,
      moving,
    },
    displacement: { x: velocity.x * deltaSeconds, y: velocity.y * deltaSeconds },
    deltaMs,
    inputActive,
  };
}

export function reconcileBlockedMotion(
  state: PlayerMotionState,
  blockedX: boolean,
  blockedY: boolean,
): PlayerMotionState {
  const velocity = {
    x: blockedX ? 0 : state.velocity.x,
    y: blockedY ? 0 : state.velocity.y,
  };
  return { ...state, velocity, moving: Math.hypot(velocity.x, velocity.y) > DEFAULT_PLAYER_TUNING.stopEpsilon };
}
```

- [ ] **Step 4: Verify feel metrics**

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/player-controller.spec.ts
```

Expected: `1 passed` suite, `5 passed` tests. The stop-distance and analog-magnitude assertions are executable acceptance, not subjective comments.

- [ ] **Step 5: Commit the controller**

```powershell
git add frontend/src/app/features/simulator/runtime/player-controller.ts frontend/src/app/features/simulator/runtime/player-controller.spec.ts
git commit -m "feat(game): afinar control de movimiento"
```

### Task 7: Resolve authoritative foot collisions with one-pixel substeps

**Files:**

- Create: `frontend/src/app/features/simulator/runtime/collision-world.ts`
- Create: `frontend/src/app/features/simulator/runtime/collision-world.spec.ts`

- [ ] **Step 1: Write red collision and repeatability tests**

Create `collision-world.spec.ts`:

```typescript
import { CollisionWorld, rectsOverlap } from './collision-world';

const bounds = { x: 0, y: 0, width: 100, height: 100 };
const feet = { x: -11, y: -16, width: 22, height: 16 };

describe('CollisionWorld', () => {
  it('cannot tunnel through a two-pixel wall with a large frame displacement', () => {
    const wall = { key: 'wall', x: 50, y: 0, width: 2, height: 100 };
    const world = new CollisionWorld(bounds, feet, [wall]);
    const result = world.moveFeet({ x: 30, y: 60 }, { x: 40, y: 0 });
    expect(result.position.x + 11).toBeLessThanOrEqual(wall.x);
    expect(result.blockedX).toBe(true);
    expect(rectsOverlap(world.hitboxAt(result.position), wall)).toBe(false);
  });

  it('slides along a corner instead of snagging both axes', () => {
    const wall = { key: 'desk', x: 50, y: 20, width: 20, height: 60 };
    const world = new CollisionWorld(bounds, feet, [wall]);
    const result = world.moveFeet({ x: 38, y: 90 }, { x: 20, y: -20 });
    expect(result.blockedX).toBe(true);
    expect(result.position.y).toBeLessThan(90);
  });

  it('keeps the full foot rectangle inside map bounds', () => {
    const world = new CollisionWorld(bounds, feet, []);
    const result = world.moveFeet({ x: 20, y: 20 }, { x: -100, y: -100 });
    const box = world.hitboxAt(result.position);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
  });

  it('keeps 100 seeded varied routes free of penetration and corner hardlocks', () => {
    const routeBounds = { x: 0, y: 0, width: 320, height: 240 };
    const solids = [
      { key: 'cabinet', x: 62, y: 30, width: 38, height: 94 },
      { key: 'desk', x: 148, y: 96, width: 82, height: 42 },
      { key: 'door-jamb-left', x: 270, y: 0, width: 8, height: 72 },
      { key: 'door-jamb-right', x: 306, y: 0, width: 8, height: 72 },
    ];
    const world = new CollisionWorld(routeBounds, feet, solids);
    let seed = 0x51e9;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const routes: Array<{ start: { x: number; y: number }; delta: { x: number; y: number } }> = [];
    while (routes.length < 100) {
      const start = {
        x: 12 + Math.floor(random() * 296),
        y: 16 + Math.floor(random() * 208),
      };
      if (solids.some(solid => rectsOverlap(world.hitboxAt(start), solid))) continue;
      const delta = {
        x: Math.round((random() * 2 - 1) * 72) || 1,
        y: Math.round((random() * 2 - 1) * 72) || -1,
      };
      routes.push({ start, delta });
    }

    for (const route of routes) {
      const first = world.moveFeet(route.start, route.delta);
      const repeated = world.moveFeet(route.start, route.delta);
      expect(repeated).toEqual(first);
      const box = world.hitboxAt(first.position);
      expect(box.x).toBeGreaterThanOrEqual(routeBounds.x);
      expect(box.y).toBeGreaterThanOrEqual(routeBounds.y);
      expect(box.x + box.width).toBeLessThanOrEqual(routeBounds.width);
      expect(box.y + box.height).toBeLessThanOrEqual(routeBounds.height);
      expect(solids.some(solid => rectsOverlap(box, solid))).toBe(false);
      if (first.blockedX && first.blockedY) {
        const escape = world.moveFeet(first.position, {
          x: -Math.sign(route.delta.x) * 4,
          y: -Math.sign(route.delta.y) * 4,
        });
        expect(escape.position).not.toEqual(first.position);
      }
    }
  });
});
```

- [ ] **Step 2: Run red**

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/collision-world.spec.ts
```

Expected: `FAIL` because `CollisionWorld` does not exist.

- [ ] **Step 3: Implement the complete deterministic resolver**

Create `collision-world.ts`:

```typescript
import type { RuntimePoint, RuntimeRect, SceneSolidV1 } from './scene-package.model';

export interface CollisionMoveResult {
  position: RuntimePoint;
  actual: RuntimePoint;
  blockedX: boolean;
  blockedY: boolean;
}

export function rectsOverlap(a: RuntimeRect, b: RuntimeRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

export class CollisionWorld {
  constructor(
    private readonly bounds: RuntimeRect,
    private readonly feet: RuntimeRect,
    private readonly solids: readonly SceneSolidV1[],
  ) {}

  hitboxAt(position: RuntimePoint): RuntimeRect {
    return {
      x: position.x + this.feet.x,
      y: position.y + this.feet.y,
      width: this.feet.width,
      height: this.feet.height,
    };
  }

  collides(position: RuntimePoint): boolean {
    const hitbox = this.hitboxAt(position);
    const outside = hitbox.x < this.bounds.x || hitbox.y < this.bounds.y
      || hitbox.x + hitbox.width > this.bounds.x + this.bounds.width
      || hitbox.y + hitbox.height > this.bounds.y + this.bounds.height;
    return outside || this.solids.some(solid => rectsOverlap(hitbox, solid));
  }

  moveFeet(from: RuntimePoint, displacement: RuntimePoint): CollisionMoveResult {
    const steps = Math.max(1, Math.ceil(Math.max(
      Math.abs(displacement.x),
      Math.abs(displacement.y),
    )));
    const step = { x: displacement.x / steps, y: displacement.y / steps };
    let position = { ...from };
    let blockedX = false;
    let blockedY = false;

    for (let index = 0; index < steps; index += 1) {
      const full = { x: position.x + step.x, y: position.y + step.y };
      if (!this.collides(full)) {
        position = full;
        continue;
      }

      if (step.x !== 0) {
        const horizontal = { x: position.x + step.x, y: position.y };
        if (!this.collides(horizontal)) position = horizontal;
        else blockedX = true;
      }
      if (step.y !== 0) {
        const vertical = { x: position.x, y: position.y + step.y };
        if (!this.collides(vertical)) position = vertical;
        else blockedY = true;
      }
    }

    return {
      position,
      actual: { x: position.x - from.x, y: position.y - from.y },
      blockedX,
      blockedY,
    };
  }
}
```

- [ ] **Step 4: Verify deterministic collision**

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/collision-world.spec.ts
```

Expected: `1 passed` suite, `4 passed` tests.

- [ ] **Step 5: Commit the collision world**

```powershell
git add frontend/src/app/features/simulator/runtime/collision-world.ts frontend/src/app/features/simulator/runtime/collision-world.spec.ts
git commit -m "feat(game): resolver colisiones deterministas"
```

### Task 8: Direct a pixel-stable explore and conversation camera

**Files:**

- Create: `frontend/src/app/features/simulator/runtime/camera-director.ts`
- Create: `frontend/src/app/features/simulator/runtime/camera-director.spec.ts`

- [ ] **Step 1: Write red camera-policy tests**

Create `camera-director.spec.ts`:

```typescript
import { CameraDirector } from './camera-director';
import { CameraPolicyV1 } from './scene-package.model';

const policy: CameraPolicyV1 = {
  mode: 'follow', zoom: 2, deadZone: { width: 72, height: 48 },
  lookAheadPx: 24, catchUpPxPerSecond: 240, settleMs: 220,
};

describe('CameraDirector', () => {
  it('returns integer focus and integer zoom with bounded look-ahead', () => {
    const camera = new CameraDirector(policy, { x: 0, y: 0, width: 1400, height: 900 },
      { width: 960, height: 540 }, { x: 500, y: 400 });
    const frame = camera.step({
      player: { x: 700, y: 400 }, facing: 'right', speedRatio: 1,
      deltaMs: 16, actors: {}, reducedMotion: false,
    });
    expect(Number.isInteger(frame.focus.x)).toBe(true);
    expect(Number.isInteger(frame.focus.y)).toBe(true);
    expect(Number.isInteger(frame.zoom)).toBe(true);
    expect(frame.desired.x - 700).toBeLessThanOrEqual(24);
  });

  it('settles the look-ahead within 250 ms after the player stops', () => {
    const camera = new CameraDirector(policy, { x: 0, y: 0, width: 1400, height: 900 },
      { width: 960, height: 540 }, { x: 700, y: 400 });
    let frame = camera.step({ player: { x: 700, y: 400 }, facing: 'right', speedRatio: 1, deltaMs: 16, actors: {}, reducedMotion: false });
    for (let elapsed = 16; elapsed < 240; elapsed += 16) {
      frame = camera.step({ player: { x: 700, y: 400 }, facing: 'right', speedRatio: 1, deltaMs: 16, actors: {}, reducedMotion: false });
    }
    expect(frame.focus.x).toBeGreaterThan(700);
    for (let elapsed = 0; elapsed < 250; elapsed += 16) {
      frame = camera.step({ player: { x: 700, y: 400 }, facing: 'right', speedRatio: 0, deltaMs: 16, actors: {}, reducedMotion: false });
    }
    expect(Math.abs(frame.focus.x - 700)).toBeLessThanOrEqual(1);
  });

  it('frames conversation actors with an integer zoom and restores explore', () => {
    const camera = new CameraDirector(policy, { x: 0, y: 0, width: 1400, height: 900 },
      { width: 960, height: 540 }, { x: 500, y: 400 });
    camera.setShot({ kind: 'conversation', actorIds: ['player', 'nurse'], paddingPx: 96 });
    const shot = camera.step({
      player: { x: 500, y: 400 }, facing: 'right', speedRatio: 0, deltaMs: 220,
      actors: { player: { x: 500, y: 400 }, nurse: { x: 620, y: 400 } }, reducedMotion: false,
    });
    expect(shot.desired).toEqual({ x: 560, y: 400 });
    expect(Number.isInteger(shot.zoom)).toBe(true);
    camera.setShot({ kind: 'explore' });
    expect(camera.currentShot().kind).toBe('explore');
  });

  it('centers a framed room without pixel swimming', () => {
    const camera = new CameraDirector({ ...policy, mode: 'framed', zoom: 1 },
      { x: 0, y: 0, width: 960, height: 540 }, { width: 960, height: 540 }, { x: 10, y: 10 });
    const a = camera.step({ player: { x: 100, y: 100 }, facing: 'down', speedRatio: 1, deltaMs: 16, actors: {}, reducedMotion: false });
    const b = camera.step({ player: { x: 700, y: 400 }, facing: 'up', speedRatio: 1, deltaMs: 16, actors: {}, reducedMotion: false });
    expect(a.focus).toEqual({ x: 480, y: 270 });
    expect(b.focus).toEqual(a.focus);
  });

  it('removes look-ahead and animated settling when reduced motion is effective', () => {
    const camera = new CameraDirector(policy, { x: 0, y: 0, width: 1400, height: 900 },
      { width: 960, height: 540 }, { x: 500, y: 400 });
    const frame = camera.step({
      player: { x: 700, y: 400 }, facing: 'right', speedRatio: 1,
      deltaMs: 16, actors: {}, reducedMotion: true,
    });
    expect(frame.desired).toEqual({ x: 700, y: 400 });
    expect(frame.focus.x).toBe(664);
    expect(Number.isInteger(frame.focus.x)).toBe(true);
  });
});
```

- [ ] **Step 2: Run red**

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/camera-director.spec.ts
```

Expected: `FAIL` because `CameraDirector` does not exist.

- [ ] **Step 3: Implement the complete camera director**

Create `camera-director.ts`:

```typescript
import type { CardinalDirection } from './actor-presentation.model';
import type { GameCameraShot } from './game-world.port';
import type { CameraPolicyV1, RuntimePoint, RuntimeRect } from './scene-package.model';

export interface CameraFrameInput {
  player: RuntimePoint;
  facing: CardinalDirection;
  speedRatio: number;
  deltaMs: number;
  actors: Readonly<Record<string, RuntimePoint>>;
  reducedMotion: boolean;
}

export interface CameraFrame {
  focus: RuntimePoint;
  desired: RuntimePoint;
  zoom: number;
}

function directionVector(direction: CardinalDirection): RuntimePoint {
  if (direction === 'left') return { x: -1, y: 0 };
  if (direction === 'right') return { x: 1, y: 0 };
  if (direction === 'up') return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

function moveToward(from: number, to: number, amount: number): number {
  if (Math.abs(to - from) <= amount) return to;
  return from + Math.sign(to - from) * amount;
}

export class CameraDirector {
  private baseFocus: RuntimePoint;
  private lookAheadOffset: RuntimePoint = { x: 0, y: 0 };
  private shot: GameCameraShot = { kind: 'explore' };

  constructor(
    private readonly policy: CameraPolicyV1,
    private readonly bounds: RuntimeRect,
    private readonly viewport: { width: number; height: number },
    initialFocus: RuntimePoint,
  ) {
    this.baseFocus = this.clampFocus(initialFocus, policy.zoom);
  }

  setShot(shot: GameCameraShot): void {
    this.shot = shot;
  }

  currentShot(): GameCameraShot {
    return this.shot;
  }

  step(input: CameraFrameInput): CameraFrame {
    if (this.policy.mode === 'framed' && this.shot.kind === 'explore') {
      const center = {
        x: this.bounds.x + this.bounds.width / 2,
        y: this.bounds.y + this.bounds.height / 2,
      };
      this.baseFocus = { x: Math.round(center.x), y: Math.round(center.y) };
      this.lookAheadOffset = { x: 0, y: 0 };
      return { focus: this.baseFocus, desired: this.baseFocus, zoom: Math.max(1, Math.round(this.policy.zoom)) };
    }

    const points = this.shot.kind === 'conversation'
      ? this.shot.actorIds.map(id => input.actors[id]).filter((point): point is RuntimePoint => Boolean(point))
      : [];
    const tracked = points.length > 0
      ? {
          x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
          y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        }
      : input.player;
    const direction = directionVector(input.facing);
    const ratio = points.length > 0 || input.reducedMotion
      ? 0
      : Math.min(Math.max(input.speedRatio, 0), 1);
    const targetLookAhead = {
      x: direction.x * this.policy.lookAheadPx * ratio,
      y: direction.y * this.policy.lookAheadPx * ratio,
    };
    const deltaSeconds = Math.min(Math.max(input.deltaMs, 0), 34) / 1000;
    const settleSpeed = this.policy.lookAheadPx / Math.max(0.001, this.policy.settleMs / 1000);
    this.lookAheadOffset = input.reducedMotion
      ? { x: 0, y: 0 }
      : {
          x: moveToward(this.lookAheadOffset.x, targetLookAhead.x, settleSpeed * deltaSeconds),
          y: moveToward(this.lookAheadOffset.y, targetLookAhead.y, settleSpeed * deltaSeconds),
        };
    const desired = {
      x: tracked.x + targetLookAhead.x,
      y: tracked.y + targetLookAhead.y,
    };
    const zoom = points.length > 0 ? this.conversationZoom(points) : Math.max(1, Math.round(this.policy.zoom));
    const halfDeadX = points.length > 0 ? 0 : this.policy.deadZone.width / 2;
    const halfDeadY = points.length > 0 ? 0 : this.policy.deadZone.height / 2;
    const target = {
      x: Math.abs(tracked.x - this.baseFocus.x) <= halfDeadX
        ? this.baseFocus.x
        : tracked.x - Math.sign(tracked.x - this.baseFocus.x) * halfDeadX,
      y: Math.abs(tracked.y - this.baseFocus.y) <= halfDeadY
        ? this.baseFocus.y
        : tracked.y - Math.sign(tracked.y - this.baseFocus.y) * halfDeadY,
    };
    const step = input.reducedMotion
      ? Number.POSITIVE_INFINITY
      : this.policy.catchUpPxPerSecond * deltaSeconds;
    this.baseFocus = this.clampFocus({
      x: moveToward(this.baseFocus.x, target.x, step),
      y: moveToward(this.baseFocus.y, target.y, step),
    }, zoom);
    const focus = this.clampFocus({
      x: this.baseFocus.x + this.lookAheadOffset.x,
      y: this.baseFocus.y + this.lookAheadOffset.y,
    }, zoom);
    return {
      focus: { x: Math.round(focus.x), y: Math.round(focus.y) },
      desired: { x: Math.round(desired.x), y: Math.round(desired.y) },
      zoom,
    };
  }

  private conversationZoom(points: readonly RuntimePoint[]): number {
    const padding = this.shot.kind === 'conversation' ? this.shot.paddingPx : 0;
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const width = Math.max(1, Math.max(...xs) - Math.min(...xs) + padding * 2);
    const height = Math.max(1, Math.max(...ys) - Math.min(...ys) + padding * 2);
    return Math.max(1, Math.min(3, Math.floor(Math.min(
      this.viewport.width / width,
      this.viewport.height / height,
    ))));
  }

  private clampFocus(point: RuntimePoint, zoom: number): RuntimePoint {
    const halfWidth = this.viewport.width / (2 * zoom);
    const halfHeight = this.viewport.height / (2 * zoom);
    const centerX = this.bounds.x + this.bounds.width / 2;
    const centerY = this.bounds.y + this.bounds.height / 2;
    const x = this.bounds.width <= halfWidth * 2
      ? centerX
      : Math.min(Math.max(point.x, this.bounds.x + halfWidth), this.bounds.x + this.bounds.width - halfWidth);
    const y = this.bounds.height <= halfHeight * 2
      ? centerY
      : Math.min(Math.max(point.y, this.bounds.y + halfHeight), this.bounds.y + this.bounds.height - halfHeight);
    return { x: Math.round(x), y: Math.round(y) };
  }
}
```

- [ ] **Step 4: Verify camera policy**

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/camera-director.spec.ts
```

Expected: `1 passed` suite, `5 passed` tests; every returned focus/zoom is integer and reduced motion has no look-ahead or animated settle.

- [ ] **Step 5: Commit the camera director**

```powershell
git add frontend/src/app/features/simulator/runtime/camera-director.ts frontend/src/app/features/simulator/runtime/camera-director.spec.ts
git commit -m "feat(game): dirigir camara pixel perfect"
```

### Task 9: Replace callback/storage coupling with the package and port

**Files:**

- Create: `scripts/runtime-boundary.test.mjs`
- Create: `frontend/src/app/features/simulator/runtime/room-transition.state.ts`
- Create: `frontend/src/app/features/simulator/runtime/room-transition.state.spec.ts`
- Create: `frontend/src/app/features/simulator/runtime/actor-topology-evidence.ts`
- Create: `frontend/src/app/features/simulator/runtime/actor-topology-evidence.spec.ts`
- Modify: `frontend/src/app/features/simulator/runtime/game-world.port.ts`
- Modify: `frontend/src/app/features/simulator/runtime/game-world.port.spec.ts`
- Modify: `frontend/src/app/features/simulator/runtime/scene-package.mapper.spec.ts`
- Modify: `frontend/src/app/features/simulator/scenario-npc-configs.spec.ts`
- Modify: `frontend/src/app/features/simulator/case-pdf-rooms.spec.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Modify: `frontend/src/app/features/simulator/game-world.component.ts`
- Modify: `frontend/src/app/core/models/simulation.model.ts`
- Modify: `frontend/e2e/support/siep-flow.ts`
- Modify: `frontend/e2e/full-case.e2e.ts`
- Modify: the ten `frontend/src/assets/game/scenarios/*.json` files enumerated in Task 3
- Modify: `frontend/src/app/features/character/avatar-config.util.ts`
- Delete: `frontend/src/app/features/simulator/scene-guide.config.ts`
- Delete: `frontend/src/app/features/simulator/scene-guide.config.spec.ts`
- Delete: `frontend/src/app/features/simulator/npc-avatar-presets.ts`
- Delete: `frontend/src/app/features/simulator/npc-avatar-presets.spec.ts`
- Delete: `frontend/src/app/features/simulator/baked-cast.util.ts`
- Delete: `frontend/src/app/features/simulator/baked-cast.util.spec.ts`
- Delete: `frontend/src/app/features/simulator/lobby-avatar.util.ts`
- Delete: `frontend/src/app/features/simulator/lobby-avatar.util.spec.ts`
- Delete: `frontend/src/app/features/simulator/character-motion.util.ts`
- Delete: `frontend/src/app/features/simulator/character-motion.util.spec.ts`
- Delete: `frontend/src/app/features/character/avatar.store.ts`
- Delete: `frontend/src/app/features/character/avatar.store.spec.ts`

- [ ] **Step 1: Write a red architectural boundary test**

Create `scripts/runtime-boundary.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const GAME_WORLD = new URL('../frontend/src/app/features/simulator/game-world.component.ts', import.meta.url);
const SIMULATION_PLAY = new URL('../frontend/src/app/features/simulator/simulation-play.component.ts', import.meta.url);
const RETIRED_VISUAL_FILES = [
  'npc-avatar-presets.ts',
  'npc-avatar-presets.spec.ts',
  'baked-cast.util.ts',
  'baked-cast.util.spec.ts',
  'lobby-avatar.util.ts',
  'lobby-avatar.util.spec.ts',
].map(name => new URL(`../frontend/src/app/features/simulator/${name}`, import.meta.url));
RETIRED_VISUAL_FILES.push(
  new URL('../frontend/src/app/features/character/avatar.store.ts', import.meta.url),
  new URL('../frontend/src/app/features/character/avatar.store.spec.ts', import.meta.url),
);
const LEGACY_AUTHORITY_SOURCES = [
  new URL('../frontend/src/app/core/models/simulation.model.ts', import.meta.url),
  new URL('../frontend/src/app/features/character/avatar-config.util.ts', import.meta.url),
  new URL('../frontend/src/app/features/character/character-editor.component.ts', import.meta.url),
  new URL('../frontend/src/app/features/simulator/game-menu.component.ts', import.meta.url),
  new URL('../frontend/src/app/features/simulator/attempt-outcome.component.ts', import.meta.url),
  GAME_WORLD,
  ...[
    'cierre-seguimiento.json',
    'comisaria-consultorio.json',
    'comisaria-familia.json',
    'comisaria-recepcion.json',
    'hospital-sala-escucha.json',
    'hospital-urgencias.json',
    'informe-integral.json',
    'proteccion-nna.json',
    'ruta-proteccion.json',
    'urgencias-crisis.json',
  ].map(name => new URL(`../frontend/src/assets/game/scenarios/${name}`, import.meta.url)),
];

test('Phaser runtime only receives typed package/plan and port traffic', async () => {
  const source = await readFile(GAME_WORLD, 'utf8');
  assert.match(source, /GameWorldPort/);
  assert.match(source, /ScenePackageV1/);
  assert.match(source, /AvatarRenderPlan/);
  assert.match(source, /ActorRenderPlan/);
  assert.match(source, /this\.scenePackage\?\.sceneInstanceKey/);
  assert.doesNotMatch(source, /this\.scenePackage\?\.contentHash\s*!==/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|HttpClient|SimulationService|matchMedia/);
  assert.doesNotMatch(source, /breathScale|walkBobOffset|livingPose|\.scaleY\s*=/);
  assert.doesNotMatch(source, /SceneGuideEntry|guideContainer|buildGuide|updateGuide/);
  assert.doesNotMatch(source, /avatarPresetKey|NpcAvatarPresetKey|setTint|\.setScale\((?:0\.\d+|1\.\d+)/);
  assert.match(source, /genericRenderableWorldObjects[\s\S]*object\.type !== ['"]PERSON['"]/);
  assert.match(source, /source === ['"]person-interaction['"][\s\S]*interactionKey/);
  assert.match(source, /actorBodyInstanceCounts/);
  assert.match(source, /personInteractionTargetCounts/);
  assert.match(source, /type: ['"]actor-topology-ready['"]/);
  assert.doesNotMatch(source, /renderPersonMarker|createPersonPlaceholder|personPreset/);
});

test('Angular shell does not manipulate Phaser internals', async () => {
  const source = await readFile(SIMULATION_PLAY, 'utf8');
  assert.doesNotMatch(source, /from ['"]phaser['"]|\.scene\.|\.cameras\.|\.textures\./);
  assert.doesNotMatch(source, /getSceneGuide|sceneGuide/);
  assert.match(source, /buildScenePackageV1/);
  assert.match(source, /inputLockState/);
});

test('legacy preset, tint and baked-cast authorities are retired', async () => {
  for (const file of RETIRED_VISUAL_FILES) {
    await assert.rejects(access(file));
  }
  const source = (await Promise.all(
    LEGACY_AUTHORITY_SOURCES.map(file => readFile(file, 'utf8')),
  )).join('\n');
  assert.doesNotMatch(source, /avatarPresetKey|NpcAvatarPresetKey|NPC_AVATAR_PRESETS/);
  assert.doesNotMatch(source, /npc-avatar-presets|baked-cast\.util|lobby-avatar\.util|setTint/);
  assert.doesNotMatch(source, /AvatarStore|AVATAR_STORAGE_KEY|avatar\.store/);
});
```

Run:

```powershell
node --test scripts/runtime-boundary.test.mjs
```

Expected: all three subtests fail against the current callback/localStorage and
legacy preset/baked-cast implementation.

- [ ] **Step 2: Add a red Angular package-publication test and character repository mock**

In `simulation-play.consent-gate.spec.ts`, import `signal`, `WritableSignal`, `ScenarioConfig`, `CharacterProfileRepository`, `CharacterManifestV1` and `AvatarRenderPlan`. Add this mock beside the other suite variables:

```typescript
const renderPlan = {
  schemaVersion: 1,
  manifestVersion: 'test',
  contentHash: 'c'.repeat(64),
  characterId: 'felipe',
  variantId: 'base',
} as AvatarRenderPlan;

const characterManifest = {
  schemaVersion: 1,
  manifestVersion: 'test',
  manifestHash: 'a'.repeat(64),
  actorMappings: {},
  actorVisuals: [],
} as unknown as CharacterManifestV1;

let characters: {
  renderPlan: WritableSignal<AvatarRenderPlan | null>;
  manifest: WritableSignal<CharacterManifestV1 | null>;
  ensureLoaded: jest.Mock;
};
```

Initialize and provide it in `setup`:

```typescript
characters = {
  renderPlan: signal<AvatarRenderPlan | null>(renderPlan),
  manifest: signal<CharacterManifestV1 | null>(characterManifest),
  ensureLoaded: jest.fn(() => of(renderPlan)),
};
```

```typescript
{ provide: CharacterProfileRepository, useValue: characters },
```

Add this complete fixture helper and test:

```typescript
function makeRuntimeWorld(): SimulationWorldState {
  return {
    attemptId: 'attempt-1', status: 'IN_PROGRESS',
    scenePackage: { schemaVersion: 1, revision: 9, sourceContentHash: 'd'.repeat(64) },
    map: {
      id: 1, key: 'hospital-urgencias', title: 'Urgencias', width: 960, height: 540,
      theme: 'hospital', spawnX: 480, spawnY: 430,
      ambient: { ambientNpcs: [] },
    },
    player: { x: 480, y: 430 }, objects: [], collisions: [], tools: [], inventory: [],
    inspectedObjectKeys: [], viewedDialogueKeys: [], usedToolKeys: [], flags: {},
  };
}

it('publishes world and scenario as one immutable scene instance', async () => {
  setup(makeAttempt());
  const config: ScenarioConfig = {
    scenarioKey: 'hospital-urgencias',
    startRoomKey: 'hospital-urgencias',
    rooms: [{
      key: 'hospital-urgencias', tiledMapKey: 'hospital-urgencias', tiledJsonPath: '',
      backendMapKeys: ['hospital-urgencias'],
      displayName: 'Hospital — Urgencias', spawnX: 480, spawnY: 430,
      // Transitional only: Task 9 Step 4 deletes this legacy property from this fixture.
      exits: [],
      exitsByBackendMapKey: { 'hospital-urgencias': [] },
      npcs: [],
    }],
  };
  sim.getScenarioConfig.mockReturnValue(of(config));

  (component as any).sceneBuildGeneration = 1;
  await (component as any).publishScenePackage(makeRuntimeWorld(), config, 1);

  expect(component.scenePackage()).toMatchObject({
    schemaVersion: 1,
    revision: 9,
    sourceContentHash: 'd'.repeat(64),
    contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    sceneInstanceKey: expect.stringMatching(/^attempt-1:hospital-urgencias:9:[a-f0-9]{64}$/),
  });
  expect(Object.isFrozen(component.scenePackage())).toBe(true);
});
```

Create `room-transition.state.spec.ts` so the room change cannot regress into a
local Phaser swap or reveal at an unverified spawn:

```typescript
import {
  IDLE_ROOM_TRANSITION,
  reduceRoomTransition,
} from './room-transition.state';
import type { RoomTransitionRequestV1 } from './game-world.port';
import type { ScenePackageV1 } from './scene-package.model';

const request: RoomTransitionRequestV1 = {
  transitionId: 'scene-a:door-listening:1',
  originSceneInstanceKey: 'attempt:room-a:3:origin',
  targetRoomKey: 'room-b',
  interactionKey: 'door-listening',
  expectedEntry: { x: 120, y: 420 },
};
const target = {
  sceneInstanceKey: 'attempt:room-b:4:target',
  map: { key: 'room-b' },
  player: { position: { x: 120, y: 420 } },
} as ScenePackageV1;

it('covers, accepts only the new authoritative target entry, then reveals', () => {
  const covering = reduceRoomTransition(IDLE_ROOM_TRANSITION, { type: 'begin', request });
  const covered = reduceRoomTransition(covering, {
    type: 'covered', transitionId: request.transitionId,
  });
  expect(() => reduceRoomTransition(covered, {
    type: 'scene-ready', transitionId: request.transitionId,
    scene: { ...target, player: { position: { x: 121, y: 420 } } } as ScenePackageV1,
  })).toThrow('authoritative entry');
  const revealing = reduceRoomTransition(covered, {
    type: 'scene-ready', transitionId: request.transitionId, scene: target,
  });
  expect(revealing).toMatchObject({ phase: 'revealing', request });
  expect(reduceRoomTransition(revealing, {
    type: 'revealed', transitionId: request.transitionId,
  })).toBe(IDLE_ROOM_TRANSITION);
});

it('rejects a second active transition and ignores stale lifecycle events', () => {
  const active = reduceRoomTransition(IDLE_ROOM_TRANSITION, { type: 'begin', request });
  expect(() => reduceRoomTransition(active, { type: 'begin', request }))
    .toThrow('already active');
  expect(reduceRoomTransition(active, { type: 'covered', transitionId: 'stale' }))
    .toBe(active);
});

it('reveals the still-rendered origin after a covered request fails', () => {
  const covering = reduceRoomTransition(IDLE_ROOM_TRANSITION, { type: 'begin', request });
  const covered = reduceRoomTransition(covering, {
    type: 'covered', transitionId: request.transitionId,
  });
  const cancelling = reduceRoomTransition(covered, {
    type: 'cancel', transitionId: request.transitionId,
  });
  expect(cancelling.phase).toBe('cancelling');
  expect(reduceRoomTransition(cancelling, {
    type: 'revealed', transitionId: request.transitionId,
  })).toBe(IDLE_ROOM_TRANSITION);
});
```

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/simulation-play.consent-gate.spec.ts src/app/features/simulator/runtime/room-transition.state.spec.ts -t "one immutable scene instance|room|covers|rejects|reveals"
```

Expected: `FAIL` because `scenePackage` is not yet an Angular signal and the
room-transition reducer does not exist.

- [ ] **Step 3: Make Angular assemble and gate the runtime atomically**

In `SimulationPlayComponent`, add these imports/fields:

```typescript
import { CharacterProfileRepository } from '../character/character-profile.repository';
import { AvatarRenderPlan } from '../character/avatar-render-plan.model';
import { buildScenePackageV1 } from './runtime/scene-package.mapper';
import { ScenePackageV1 } from './runtime/scene-package.model';

private readonly characterProfiles = inject(CharacterProfileRepository);
readonly avatarRenderPlan = this.characterProfiles.renderPlan;
readonly scenePackage = signal<ScenePackageV1 | null>(null);
private sceneBuildGeneration = 0;
```

Replace `ngOnInit` with a fail-closed character gate and move the existing attempt bootstrap into the shown helper. No case/network bootstrap starts before a validated render plan exists:

```typescript
ngOnInit(): void {
  this.characterProfiles.ensureLoaded().subscribe({
    next: () => this.initializeSimulation(),
    error: () => {
      this.error.set('No pudimos validar tu personaje para iniciar el caso.');
      this.loading.set(false);
    },
  });
}

private initializeSimulation(): void {
  this.simulationService.getInterventionRules().subscribe({
    next: raw => { this.interventionRules = parseInterventionRules(raw); },
    error: () => { this.interventionRules = DEFAULT_INTERVENTION_RULES; },
  });
  const id = Number(this.route.snapshot.paramMap.get('caseVersionId'));
  if (!id) {
    this.error.set('Caso no encontrado.');
    this.loading.set(false);
    return;
  }
  this.simulationService.getActiveAttempt(id).subscribe({
    next: active => {
      if (active && (active.status === 'IN_PROGRESS' || active.status === 'PAUSED')) {
        this.pendingActiveAttempt.set(active);
        this.showResumePrompt.set(true);
        this.loading.set(false);
        return;
      }
      this.beginAttempt(id, false);
    },
    error: () => this.beginAttempt(id, false),
  });
}
```

Replace `applyWorldWithScenario` with:

```typescript
private applyWorldWithScenario(world: SimulationWorldState): void {
  const generation = ++this.sceneBuildGeneration;
  this.simulationService.getScenarioConfig(world.map.key)
    .pipe(timeout({ first: 12_000 }))
    .subscribe({
    next: config => { void this.publishScenePackage(world, config, generation); },
    error: () => {
      if (generation !== this.sceneBuildGeneration) return;
      if (this.roomTransitionState().phase !== 'idle') {
        this.cancelActiveRoomTransition('package', 'No pudimos validar la sala de destino.');
        return;
      }
      this.sceneBuildGeneration += 1;
      this.scenePackage.set(null);
      this.error.set('No pudimos validar la configuración visual de esta sala.');
      this.loading.set(false);
      this.busy.set(false);
    },
  });
}

private async publishScenePackage(
  world: SimulationWorldState,
  config: ScenarioConfig,
  generation: number,
): Promise<void> {
  try {
    const manifest = this.characterProfiles.manifest();
    if (!manifest) throw new Error('CharacterManifestV1 no está cargado');
    const scenePackage = await buildScenePackageV1(world, config, manifest);
    if (generation !== this.sceneBuildGeneration) return;
    const transition = this.roomTransitionState();
    if (transition.phase === 'covered') {
      this.roomTransitionState.set(reduceRoomTransition(transition, {
        type: 'scene-ready', transitionId: transition.request.transitionId,
        scene: scenePackage,
      }));
      this.armRoomTransitionWatchdog(1_200);
    } else if (transition.phase !== 'idle') {
      throw new Error(`Unexpected room transition phase ${transition.phase}`);
    }
    this.scenarioConfig.set(config);
    this.scenePackage.set(scenePackage);
    this.applyLoadedWorld(world);
  } catch (error) {
    if (generation !== this.sceneBuildGeneration) return;
    if (this.roomTransitionState().phase !== 'idle') {
      this.cancelActiveRoomTransition('package', 'La sala de destino no superó la validación.');
      return;
    }
    this.sceneBuildGeneration += 1;
    this.scenePackage.set(null);
    this.error.set(`El paquete de escena no es válido: ${String(error)}`);
    this.loading.set(false);
    this.busy.set(false);
  }
}
```

On every terminal *initial* world-loading error, increment `sceneBuildGeneration`
and set `scenePackage` to `null`. During a room transition, preserve the origin
package and cancel/reveal it instead. Do not publish `world` before the
asynchronous SHA-256 and every actor/exit/landing validation succeeds; the
generation check prevents a slower old room hash from replacing a newer room.
Import RxJS `timeout`, the reducer and its state types in this step. In
`applyLoadedWorld`, change the unconditional `busy.set(false)` to
`if (this.roomTransitionState().phase === 'idle') this.busy.set(false)`; only a
matching reveal completion unlocks a successful door transition.

Replace the world template block with the atomic gate:

```html
@if (scenePackage(); as package) {
  @if (avatarRenderPlan(); as avatarPlan) {
    <app-game-world #gameWorld id="game-area" class="game-surface"
      [scenePackage]="package"
      [avatarRenderPlan]="avatarPlan"
      [inputLock]="inputLockState()"
      [roomTransitionRequest]="activeRoomTransitionRequest()"
      [roomTransitionCancellation]="roomTransitionCancellation()"
      [selectedInteractionKey]="selectedInteraction()?.key ?? null"
      [sfxMuted]="sfxMuted()"
      [reduceMotion]="reduceMotion()"
      (proximity)="nearbyInteraction.set($event)"
      (interact)="openInteraction($event)"
      (npcInteract)="openNpcDialogueByKey($event)"
      (renderFailure)="handleRuntimeRenderFailure($event)"
      (roomExit)="requestRoomTransition($event)"
      (roomTransition)="handleRoomTransitionEvent($event)"
      (positionChange)="rememberPosition($event.x, $event.y)" />
  }
} @else {
  <div id="game-area" class="world-skeleton" aria-label="Cargando mapa"></div>
}
```

Delete only the legacy `(enterRoom)` binding. The typed `(roomExit)` edge now
starts the authoritative cover/request/reveal handshake completed in Steps 4
and 5. Add the ID resolver so Phaser never sends an `NpcConfig` object across
the port:

```typescript
openNpcDialogueByKey(actorId: string): void {
  const npc = this.scenarioConfig()?.rooms
    .flatMap(room => room.npcs)
    .find(candidate => candidate.key === actorId);
  if (npc) this.openNpcDialogue(npc);
}
```

Delete legacy `onRoomExit`/`onDoorTrigger`; Tiled and backend exits both become
the same `SceneExitV1` request. `requestRoomTransition` is a new typed method and
must not call `GameWorldComponent.transitionToRoom` or any scene method.

Delete the visual guide companion end-to-end: remove `getSceneGuide`/`SceneGuideEntry` imports, the `sceneGuide` computed and `[guide]` binding in Angular; remove `guideEntry`, `guideContainer`, `guideSprite`, `guideBubble`, guide movement constants, `setGuide`, `buildGuide`, `showGuideBubble`, `updateGuide`, and all guide depth-sorting/build calls in Phaser; then delete `scene-guide.config.ts` and its spec. This is separate from contextual objective text and from the chatbot removal owned by the dialogue/HUD plan.

- [ ] **Step 4: Replace the callback interface with port commands/events**

Create `room-transition.state.ts` as the single transition lifecycle authority:

```typescript
import type { RoomTransitionRequestV1 } from './game-world.port';
import type { ScenePackageV1 } from './scene-package.model';

export type RoomTransitionState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'covering' | 'covered' | 'cancelling'; readonly request: RoomTransitionRequestV1 }
  | {
      readonly phase: 'revealing';
      readonly request: RoomTransitionRequestV1;
      readonly targetSceneInstanceKey: string;
    };

export type RoomTransitionLifecycleEvent =
  | { readonly type: 'begin'; readonly request: RoomTransitionRequestV1 }
  | { readonly type: 'covered'; readonly transitionId: string }
  | {
      readonly type: 'scene-ready'; readonly transitionId: string;
      readonly scene: ScenePackageV1;
    }
  | { readonly type: 'cancel'; readonly transitionId: string }
  | { readonly type: 'revealed'; readonly transitionId: string };

export const IDLE_ROOM_TRANSITION: RoomTransitionState = Object.freeze({ phase: 'idle' });

export function reduceRoomTransition(
  state: RoomTransitionState,
  event: RoomTransitionLifecycleEvent,
): RoomTransitionState {
  if (event.type === 'begin') {
    if (state.phase !== 'idle') throw new Error('Room transition already active');
    return Object.freeze({ phase: 'covering', request: event.request });
  }
  if (state.phase === 'idle' || event.transitionId !== state.request.transitionId) return state;
  if (event.type === 'cancel' && state.phase !== 'cancelling') {
    return Object.freeze({ phase: 'cancelling', request: state.request });
  }
  if (event.type === 'covered' && state.phase === 'covering') {
    return Object.freeze({ phase: 'covered', request: state.request });
  }
  if (event.type === 'scene-ready') {
    if (state.phase !== 'covered') throw new Error('Target scene arrived before transition cover');
    const entry = event.scene.player.position;
    const expected = state.request.expectedEntry;
    if (event.scene.sceneInstanceKey === state.request.originSceneInstanceKey
      || event.scene.map.key !== state.request.targetRoomKey) {
      throw new Error('Room transition received the wrong authoritative scene');
    }
    if (entry.x !== expected.x || entry.y !== expected.y) {
      throw new Error('Room transition received the wrong authoritative entry');
    }
    return Object.freeze({
      phase: 'revealing', request: state.request,
      targetSceneInstanceKey: event.scene.sceneInstanceKey,
    });
  }
  if (event.type === 'revealed'
    && (state.phase === 'revealing' || state.phase === 'cancelling')) {
    return IDLE_ROOM_TRANSITION;
  }
  return state;
}
```

This reducer belongs to `SimulationPlayComponent`, the composition root. Phaser
animates the cover and reports lifecycle edges through `GameWorldPort`; it never
owns room identity, calls HTTP or chooses a landing coordinate.

First retire the second visual authority now that the character plan's Task 11
gate has passed. In `simulation.model.ts`, delete the complete
`NpcAvatarPresetKey` union and delete these two properties from `NpcConfig`:

```typescript
avatarPresetKey?: NpcAvatarPresetKey;
scale?: number;
```

Keep `NpcConfig.key` as the actor id and keep narrative/motion fields; visual
identity and render scale no longer belong to scenario data. In
`avatar-config.util.ts`, replace the comment that names
`simulator/baked-cast.util` with this accurate compatibility boundary:

```typescript
// Legacy parse compatibility only; runtime identity comes from CharacterProfileRepository.
```

Delete `npc-avatar-presets.ts` and its spec, `baked-cast.util.ts` and its spec,
`lobby-avatar.util.ts` and its spec, and the superseded
`features/character/avatar.store.ts` and its spec. Before deleting them, run this
exact character-plan prerequisite check:

```powershell
$characterConsumers = @(
  'frontend/src/app/features/character/character-editor.component.ts',
  'frontend/src/app/features/simulator/game-menu.component.ts',
  'frontend/src/app/features/simulator/attempt-outcome.component.ts'
)
Select-String -Path $characterConsumers -Pattern 'npc-avatar-presets|baked-cast\.util|lobby-avatar\.util|avatar\.store|AvatarStore|AVATAR_STORAGE_KEY'
```

Expected: no output. Any match is a failed prerequisite, not permission to keep
a fallback. Migrate `game-world.component.ts` in the remainder of this step, then
delete the eight files. The `actorFrom` in Task 3 deliberately retains its runtime
`in` checks so stale API/cache objects with either forbidden property fail closed
even though the TypeScript properties no longer exist.

In `game-world.component.ts`, remove `WorldCallbacks`, all storage/avatar-config
imports and `AVATAR_STORAGE_KEY`. Add imports for `AvatarRenderPlan`,
`ActorRenderPlan`, `CharacterAnimationId`, the runtime model and lock. Import
`ActorInstanceCountV1`, `ActorTopologySnapshotV1`, `GameWorldCommand`,
`GameWorldEvent`, `GameWorldPort` and `RoomTransitionRequestV1` from the single
`runtime/game-world.port.ts` authority.

The scene owns these fields and constructor:

```typescript
private scenePackage?: ScenePackageV1;
private inputLock: InputLockState = resolveInputLockState({
  resumePrompt: false, contentWarning: false, introVideo: false, caseIntro: false,
  dialogue: false, journal: false, settings: false, outcome: false, busy: false,
});
private preferences = { reduceMotion: false, sfxMuted: false };
private detachPort: (() => void) | null = null;
private pendingActorPresentation: ActorPresentationState | null = null;
private pendingCameraShot: GameCameraShot | null = null;
private activeRoomTransition: RoomTransitionRequestV1 | null = null;
private roomTransitionCovered = false;

constructor(
  private readonly port: GameWorldPort,
  private readonly avatarPlan: AvatarRenderPlan,
) {
  super('data-driven-world');
  this.detachPort = this.port.attach(command => this.acceptCommand(command));
}
```

Add this exhaustive command handler:

```typescript
private acceptCommand(command: GameWorldCommand): void {
  switch (command.type) {
    case 'load-scene': this.setScenePackage(command.scene); return;
    case 'set-input-lock': this.setInputLock(command.state); return;
    case 'set-preferences':
      this.preferences = { reduceMotion: command.reduceMotion, sfxMuted: command.sfxMuted };
      this.setSfxMuted(command.sfxMuted);
      return;
    case 'set-selected-interaction': this.setSelected(command.interactionKey); return;
    case 'set-actor-presentation': this.pendingActorPresentation = command.state; return;
    case 'set-camera-shot': this.pendingCameraShot = command.shot; return;
    case 'begin-room-transition': this.beginRoomTransition(command.request); return;
    case 'cancel-room-transition':
      this.cancelRoomTransition(command.transitionId);
      return;
    case 'focus-interaction': this.focus(command.interactionKey); return;
    case 'nudge': this.nudge(command.direction); return;
    case 'interact': this.interactNearest(); return;
  }
}
```

Register `this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.detachPort?.())` in `create`.

Replace the old setters with one package setter:

```typescript
private setScenePackage(scenePackage: ScenePackageV1): void {
  const changed = this.scenePackage?.sceneInstanceKey !== scenePackage.sceneInstanceKey;
  this.scenePackage = scenePackage;
  this.nearestKey = null;
  this.port.emit({ type: 'proximity-changed', interactionKey: null });
  if (this.ready && changed) this.queuePackageRender(scenePackage);
}

private setInputLock(state: InputLockState): void {
  this.inputLock = state;
}
```

`queuePackageRender` is implemented in Step 6. Do not call `renderWorld`
directly for a post-boot package: its actor textures and owner-specific
animations may not have existed during the one-time Phaser `preload`/`create`.

Within the scene, make these exact authority substitutions everywhere before compiling:

| Remove | Use |
|---|---|
| `this.world.map` | `this.scenePackage.map` |
| `this.world.player` | `this.scenePackage.player.position` |
| `this.world.objects` | `this.scenePackage.interactions` |
| `this.world.collisions` and hardcoded collision arrays | `this.scenePackage.solids` through `CollisionWorld` |
| `this.scenarioConfig` / `roomForCurrentWorld()` | `this.scenePackage.map`, `.actors`, `.exits` |
| `this.callbacks.reduceMotion` | `this.preferences.reduceMotion` |
| `this.callbacks.sfxMuted` | `this.preferences.sfxMuted` |

Split interaction authority from generic marker rendering:

```typescript
private allWorldInteractions(): readonly Readonly<MapObjectState>[] {
  return this.scenePackage?.interactions ?? [];
}

private genericRenderableWorldObjects(): readonly Readonly<MapObjectState>[] {
  return this.allWorldInteractions().filter(object => object.type !== 'PERSON');
}
```

All proximity, choice and HTTP lookup paths use `allWorldInteractions()`.
Only the legacy geometric marker loop uses `genericRenderableWorldObjects()`.
Every `SceneActorV1` is rendered once through its `ActorRenderPlan`; when
`actor.source === 'person-interaction'`, register its existing
`interactionKey` against that actor body's feet/interaction rectangle for focus
and proximity, without creating a second container, icon, label, hitbox or
placeholder. Ambient NPCs keep their one actor body and canonical radius.
Extend `scripts/runtime-boundary.test.mjs` to fail unless the generic loop has
the explicit `PERSON` exclusion and to fail on any separate PERSON marker
constructor/preset path. The runtime E2E records the actor ids and asserts one
visible body plus one interaction target for every PERSON on all eight maps.

At the single successful end of `renderWorld`, after player, actors,
interactions and collision authority are installed, build one typed topology
snapshot from the actual Phaser registries. Import `ActorInstanceCountV1` and
`ActorTopologySnapshotV1` from `game-world.port.ts` and add:

```typescript
private publishActorTopology(): void {
  if (!this.scenePackage) throw new Error('Cannot publish actor topology without a scene package');
  const sortedIds = (ids: Iterable<string>) => [...ids].sort((a, b) => a.localeCompare(b));
  const counts = (source: ReadonlyMap<string, number>): readonly ActorInstanceCountV1[] =>
    Object.freeze([...source.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([actorId, count]) => Object.freeze({ actorId, count })));
  const sameIds = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length && left.every((value, index) => value === right[index]);

  const actorIds = sortedIds(this.scenePackage.actors.map(actor => actor.actorId));
  const bodyCounts = counts(this.actorBodyInstanceCounts);
  const bodyIds = bodyCounts.map(item => item.actorId);
  const personActors = this.scenePackage.actors
    .filter(actor => actor.source === 'person-interaction');
  const personActorIds = sortedIds(personActors.map(actor => actor.actorId));
  const personTargetCounts = counts(this.personInteractionTargetCounts);
  const personTargetIds = personTargetCounts.map(item => item.actorId);
  const genericPersonMarkerIds = sortedIds(personActors
    .filter(actor => this.markers.has(actor.interactionKey))
    .map(actor => actor.actorId));

  if (!sameIds(actorIds, bodyIds) || bodyCounts.some(item => item.count !== 1)) {
    throw new Error('Rendered actor bodies diverge from ScenePackageV1.actors');
  }
  if (!sameIds(personActorIds, personTargetIds)
    || personTargetCounts.some(item => item.count !== 1)
    || genericPersonMarkerIds.length > 0) {
    throw new Error('PERSON body/target/marker topology is invalid');
  }

  const snapshot: ActorTopologySnapshotV1 = Object.freeze({
    sceneInstanceKey: this.scenePackage.sceneInstanceKey,
    actorIds: Object.freeze(actorIds),
    bodyCounts,
    personActorIds: Object.freeze(personActorIds),
    personTargetCounts,
    genericPersonMarkerIds: Object.freeze(genericPersonMarkerIds),
  });
  this.port.emit({ type: 'actor-topology-ready', snapshot });
}

this.publishActorTopology();
this.ready = true;
this.port.emit({
  type: 'ready',
  mapKey: this.scenePackage.map.key,
  revision: this.scenePackage.revision,
  contentHash: this.scenePackage.contentHash,
  sceneInstanceKey: this.scenePackage.sceneInstanceKey,
});
```

No error/fallback branch may emit `actor-topology-ready` or `ready`. This
snapshot records counts, not only unique map keys, so a duplicate body cannot
be hidden by a later `Map.set` overwrite. Step 6 increments and clears those
count registries at the exact creation/bind sites.

Once `GameWorldComponent` has no scenario-room transition/render read left,
remove the legacy `RoomConfig.exits` property from `simulation.model.ts` and
remove every top-level room `"exits"` array from the ten scenario JSON files.
`exitsByBackendMapKey` is then the sole checked-in topology authority. Update
`scenario-npc-configs.spec.ts` / `case-pdf-rooms.spec.ts` to reject a legacy
`exits` property, while preserving the eight-key/ten-EXIT contract from Task 3.
This retirement happens in Task 9 rather than Task 3 so every intermediate
commit still builds before the old Phaser transition path is deleted.

Migrate the two typed fixtures in this same step; otherwise the final strict
build either rejects the removed property or the Task 3 mapper fails for absent
topology. In `scene-package.mapper.spec.ts`, delete only the two transitional
`exits:` properties from the `scenario` constant (the adjacent
`backendMapKeys` and `exitsByBackendMapKey` values remain). In
`simulation-play.consent-gate.spec.ts`, replace its transitional room with this
final shape:

```typescript
{
  key: 'hospital-urgencias',
  tiledMapKey: 'hospital-urgencias',
  tiledJsonPath: '',
  backendMapKeys: ['hospital-urgencias'],
  displayName: 'Hospital — Urgencias',
  spawnX: 480,
  spawnY: 430,
  exitsByBackendMapKey: { 'hospital-urgencias': [] },
  npcs: [],
}
```

Extend the two asset validators and the consent fixture test with
`expect('exits' in room).toBe(false)`. The mapper fixture must still prove that
an absent `exitsByBackendMapKey['hospital-urgencias']` fails closed; do not make
the new topology optional at runtime.

Every callback becomes one of these typed emissions; do not emit an object reference:

```typescript
this.port.emit({ type: 'proximity-changed', interactionKey: nextKey });
this.port.emit({ type: 'interaction-requested', interactionKey: object.key });
this.port.emit({ type: 'npc-interaction-requested', actorId: npc.actorId });
this.port.emit({
  type: 'player-position-changed',
  position: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
  atMs: this.time.now,
});
this.port.emit({
  type: 'room-exit-requested',
  originSceneInstanceKey: this.scenePackage.sceneInstanceKey,
  targetRoomKey: exit.targetRoomKey,
  interactionKey: exit.interactionKey,
  expectedEntry: exit.entry,
});
```

Add the exact Phaser half of the transition handshake. The cover is fully
opaque before HTTP starts; the target is rendered only from a new package; the
origin remains mounted below the cover until that package passes all checks:

```typescript
private beginRoomTransition(request: RoomTransitionRequestV1): void {
  if (this.activeRoomTransition) throw new Error('Room transition already active in Phaser');
  if (request.originSceneInstanceKey !== this.scenePackage?.sceneInstanceKey) return;
  this.activeRoomTransition = request;
  this.roomTransitionCovered = false;
  const duration = this.preferences.reduceMotion ? 1 : 180;
  this.cameras.main.fadeOut(duration, 7, 10, 18);
  this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    if (this.activeRoomTransition?.transitionId !== request.transitionId) return;
    this.roomTransitionCovered = true;
    this.port.emit({ type: 'room-transition-covered', transitionId: request.transitionId });
  });
}

private revealRoomTransition(scene: ScenePackageV1): void {
  const request = this.activeRoomTransition;
  if (!request || !this.roomTransitionCovered) return;
  if (scene.sceneInstanceKey === request.originSceneInstanceKey
    || scene.map.key !== request.targetRoomKey
    || scene.player.position.x !== request.expectedEntry.x
    || scene.player.position.y !== request.expectedEntry.y) {
    throw new Error('Phaser refused an unverified room transition package');
  }
  const duration = this.preferences.reduceMotion ? 1 : 220;
  this.cameras.main.fadeIn(duration, 7, 10, 18);
  this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
    if (this.activeRoomTransition?.transitionId !== request.transitionId) return;
    this.activeRoomTransition = null;
    this.roomTransitionCovered = false;
    this.port.emit({
      type: 'room-transition-complete', transitionId: request.transitionId,
      sceneInstanceKey: scene.sceneInstanceKey,
    });
  });
}

private cancelRoomTransition(transitionId: string): void {
  const request = this.activeRoomTransition;
  if (!request || request.transitionId !== transitionId) return;
  const duration = this.preferences.reduceMotion ? 1 : 160;
  this.cameras.main.fadeIn(duration, 7, 10, 18);
  this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
    if (this.activeRoomTransition?.transitionId !== transitionId) return;
    this.activeRoomTransition = null;
    this.roomTransitionCovered = false;
    this.port.emit({ type: 'room-transition-cancelled', transitionId });
  });
}
```

At the successful end of `renderWorld`, after emitting `ready`, call
`revealRoomTransition(this.scenePackage)`. Do not reset camera FX while
rendering. Remove `transitionToRoom` completely: Angular obtains the
authoritative next world and sends a new package; Phaser may animate the cover
but may not call HTTP, locally swap rooms or supply coordinates. A second exit
edge while `activeRoomTransition` is non-null is discarded before emission.

- [ ] **Step 5: Make the Angular host a pure port adapter**

First write `actor-topology-evidence.spec.ts`. Use deliberately unordered input
so the public DOM protocol cannot silently depend on registry insertion order:

```typescript
import type { ActorTopologySnapshotV1 } from './game-world.port';
import { serializeActorTopologyEvidence } from './actor-topology-evidence';

describe('serializeActorTopologyEvidence', () => {
  it('sorts ids and emits exact pipe/equal-delimited DOM strings', () => {
    const snapshot: ActorTopologySnapshotV1 = Object.freeze({
      sceneInstanceKey: 'attempt:hospital-urgencias:1:hash',
      actorIds: Object.freeze(['medico-guardia', 'familia-crisis']),
      bodyCounts: Object.freeze([
        Object.freeze({ actorId: 'medico-guardia', count: 1 }),
        Object.freeze({ actorId: 'familia-crisis', count: 1 }),
      ]),
      personActorIds: Object.freeze(['familia-crisis']),
      personTargetCounts: Object.freeze([
        Object.freeze({ actorId: 'familia-crisis', count: 1 }),
      ]),
      genericPersonMarkerIds: Object.freeze([]),
    });

    expect(serializeActorTopologyEvidence(snapshot)).toEqual({
      sceneInstanceKey: 'attempt:hospital-urgencias:1:hash',
      actorIds: 'familia-crisis|medico-guardia',
      bodyCounts: 'familia-crisis=1|medico-guardia=1',
      personActorIds: 'familia-crisis',
      personTargetCounts: 'familia-crisis=1',
      genericPersonMarkerIds: '',
    });
    expect(serializeActorTopologyEvidence(null)).toBeNull();
  });
});
```

Run the focused red gate:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/actor-topology-evidence.spec.ts
```

Expected: `FAIL` because `actor-topology-evidence.ts` does not exist.

Create `actor-topology-evidence.ts` as the single serializer used by the host:

```typescript
import type { ActorTopologySnapshotV1 } from './game-world.port';

export interface ActorTopologyEvidenceStrings {
  readonly sceneInstanceKey: string;
  readonly actorIds: string;
  readonly bodyCounts: string;
  readonly personActorIds: string;
  readonly personTargetCounts: string;
  readonly genericPersonMarkerIds: string;
}

const compareIds = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

const ids = (values: readonly string[]): string =>
  [...values].sort(compareIds).join('|');

const counts = (values: ActorTopologySnapshotV1['bodyCounts']): string =>
  [...values]
    .sort((left, right) => compareIds(left.actorId, right.actorId))
    .map(item => `${item.actorId}=${item.count}`)
    .join('|');

export function serializeActorTopologyEvidence(
  snapshot: ActorTopologySnapshotV1 | null,
): ActorTopologyEvidenceStrings | null {
  if (!snapshot) return null;
  return Object.freeze({
    sceneInstanceKey: snapshot.sceneInstanceKey,
    actorIds: ids(snapshot.actorIds),
    bodyCounts: counts(snapshot.bodyCounts),
    personActorIds: ids(snapshot.personActorIds),
    personTargetCounts: counts(snapshot.personTargetCounts),
    genericPersonMarkerIds: ids(snapshot.genericPersonMarkerIds),
  });
}
```

This serializer never binds arrays or objects to DOM attributes: ids use
`id|id`, counts use `actorId=count|actorId=count`, and an empty set is the empty
string. Re-run the focused test; expected: `1 passed` suite, `1 passed` test.

Import Angular `computed`, the port-owned `ActorTopologySnapshotV1` type and
`serializeActorTopologyEvidence`. Replace the public inputs/outputs and internal
state of `GameWorldComponent` with:

```typescript
readonly scenePackage = input<ScenePackageV1 | null>(null);
readonly avatarRenderPlan = input<AvatarRenderPlan | null>(null);
readonly inputLock = input.required<InputLockState>();
readonly selectedInteractionKey = input<string | null>(null);
readonly actorPresentation = input<ActorPresentationState | null>(null);
readonly roomTransitionRequest = input<RoomTransitionRequestV1 | null>(null);
readonly roomTransitionCancellation = input<{
  transitionId: string; reason: 'http' | 'package' | 'timeout';
} | null>(null);
readonly sfxMuted = input(false);
readonly reduceMotion = input(false);

readonly proximity = output<MapObjectState | null>();
readonly interact = output<MapObjectState>();
readonly positionChange = output<{ x: number; y: number }>();
readonly npcInteract = output<string>();
readonly actorPresentationReady = output<Extract<GameWorldEvent, {
  type: 'actor-presentation-ready';
}>>();
readonly renderFailure = output<Extract<GameWorldEvent, { type: 'scene-render-failed' }>>();
readonly roomExit = output<Extract<GameWorldEvent, { type: 'room-exit-requested' }>>();
readonly roomTransition = output<Extract<GameWorldEvent, {
  type: 'room-transition-covered' | 'room-transition-complete' | 'room-transition-cancelled';
}>>();
readonly renderReady = signal(false);
readonly renderedMapKey = signal<string | null>(null);
readonly renderedScenarioKey = signal<string | null>(null);
readonly runtimePosition = signal({ x: 0, y: 0 });
readonly runtimeCamera = signal({ x: 0, y: 0, zoom: 1 });
readonly runtimePlayerAnimation = signal<CharacterAnimationId>('idle');
readonly actorTopology = signal<ActorTopologySnapshotV1 | null>(null);
readonly actorTopologyEvidence = computed(() =>
  serializeActorTopologyEvidence(this.actorTopology()),
);
readonly roomTransitionPhase = signal<
  'idle' | 'covering' | 'covered' | 'revealing' | 'cancelling'
>('idle');

private readonly port = new GameWorldPort();
private readonly detachEvents = this.port.onEvent(event => this.zone.run(() => this.handlePortEvent(event)));
```

Use this exhaustive adapter:

```typescript
private handlePortEvent(event: GameWorldEvent): void {
  const scene = this.scenePackage();
  switch (event.type) {
    case 'ready':
      this.renderReady.set(true);
      this.renderedMapKey.set(event.mapKey);
      this.renderedScenarioKey.set(event.mapKey);
      if (this.roomTransitionRequest()
        && event.sceneInstanceKey !== this.roomTransitionRequest()!.originSceneInstanceKey
        && event.mapKey === this.roomTransitionRequest()!.targetRoomKey) {
        this.roomTransitionPhase.set('revealing');
      }
      return;
    case 'proximity-changed':
      this.proximity.emit(scene?.interactions.find(item => item.key === event.interactionKey) ?? null);
      return;
    case 'interaction-requested': {
      const interaction = scene?.interactions.find(item => item.key === event.interactionKey);
      if (interaction) this.interact.emit(interaction as MapObjectState);
      return;
    }
    case 'npc-interaction-requested': this.npcInteract.emit(event.actorId); return;
    case 'actor-presentation-ready': this.actorPresentationReady.emit(event); return;
    case 'actor-topology-ready':
      if (event.snapshot.sceneInstanceKey === scene?.sceneInstanceKey) {
        this.actorTopology.set(event.snapshot);
      }
      return;
    case 'scene-render-failed': this.renderFailure.emit(event); return;
    case 'room-exit-requested': this.roomExit.emit(event); return;
    case 'room-transition-covered':
      if (this.roomTransitionPhase() !== 'covering') return;
      this.roomTransitionPhase.set('covered');
      this.roomTransition.emit(event);
      return;
    case 'room-transition-complete':
    case 'room-transition-cancelled':
      this.roomTransitionPhase.set('idle');
      this.roomTransition.emit(event);
      return;
    case 'player-position-changed':
      this.runtimePosition.set(event.position);
      this.positionChange.emit(event.position);
      return;
    case 'runtime-snapshot':
      this.runtimePosition.set(event.position);
      this.runtimeCamera.set(event.camera);
      this.runtimePlayerAnimation.set(event.playerAnimationId);
      return;
  }
}
```

`ngOnChanges` only sends commands:

```typescript
if (changes['scenePackage']) {
  this.renderReady.set(false);
  this.actorTopology.set(null);
  const scene = this.scenePackage();
  if (scene) this.port.send({ type: 'load-scene', scene });
}
if (changes['inputLock']) this.port.send({ type: 'set-input-lock', state: this.inputLock() });
if (changes['selectedInteractionKey']) {
  this.port.send({ type: 'set-selected-interaction', interactionKey: this.selectedInteractionKey() });
}
if (changes['actorPresentation']) {
  this.port.send({ type: 'set-actor-presentation', state: this.actorPresentation() });
}
if (changes['roomTransitionRequest'] && this.roomTransitionRequest()) {
  this.roomTransitionPhase.set('covering');
  this.port.send({ type: 'begin-room-transition', request: this.roomTransitionRequest()! });
}
if (changes['roomTransitionCancellation'] && this.roomTransitionCancellation()) {
  this.roomTransitionPhase.set('cancelling');
  this.port.send({ type: 'cancel-room-transition', ...this.roomTransitionCancellation()! });
}
if (changes['sfxMuted'] || changes['reduceMotion']) {
  this.port.send({
    type: 'set-preferences',
    reduceMotion: this.reduceMotion(),
    sfxMuted: this.sfxMuted(),
  });
}
```

Extend `game-world.port.spec.ts` with a typed forwarding regression so this
evidence cannot silently become an untyped debug object:

```typescript
it('forwards one immutable actor topology snapshot', () => {
  const port = new GameWorldPort();
  const events: GameWorldEvent[] = [];
  port.onEvent(event => events.push(event));
  const snapshot: ActorTopologySnapshotV1 = Object.freeze({
    sceneInstanceKey: 'attempt:hospital-urgencias:1:hash',
    actorIds: Object.freeze(['familia-crisis']),
    bodyCounts: Object.freeze([Object.freeze({ actorId: 'familia-crisis', count: 1 })]),
    personActorIds: Object.freeze(['familia-crisis']),
    personTargetCounts: Object.freeze([Object.freeze({ actorId: 'familia-crisis', count: 1 })]),
    genericPersonMarkerIds: Object.freeze([]),
  });

  port.emit({ type: 'actor-topology-ready', snapshot });

  expect(events).toEqual([{ type: 'actor-topology-ready', snapshot }]);
});
```

Import `ActorTopologySnapshotV1` from the same port module. The adapter code
above ignores snapshots from an old `sceneInstanceKey` and clears all topology
evidence on every `scenePackage` input change.

In `simulation-play.component.ts`, import `GameWorldEvent` and
`RoomTransitionRequestV1` from `runtime/game-world.port.ts` plus
`IDLE_ROOM_TRANSITION`, `reduceRoomTransition` and `RoomTransitionState` from
`runtime/room-transition.state.ts`. At module scope, define the event aliases
and make `SimulationPlayComponent` own the complete transaction:

```typescript
type RoomExitRequested = Extract<GameWorldEvent, { type: 'room-exit-requested' }>;
type SceneRenderFailed = Extract<GameWorldEvent, { type: 'scene-render-failed' }>;
type RoomTransitionEdge = Extract<GameWorldEvent, {
  type: 'room-transition-covered' | 'room-transition-complete' | 'room-transition-cancelled';
}>;

readonly roomTransitionState = signal<RoomTransitionState>(IDLE_ROOM_TRANSITION);
readonly activeRoomTransitionRequest = computed(() => {
  const state = this.roomTransitionState();
  return state.phase === 'idle' ? null : state.request;
});
readonly roomTransitionCancellation = signal<{
  transitionId: string; reason: 'http' | 'package' | 'timeout';
} | null>(null);
private roomTransitionSerial = 0;
private roomTransitionWatchdog: number | null = null;
private roomTransitionFailureMessage = '';

handleRuntimeRenderFailure(event: SceneRenderFailed): void {
  if (event.sceneInstanceKey !== this.scenePackage()?.sceneInstanceKey) return;
  if (this.roomTransitionState().phase !== 'idle') {
    this.cancelActiveRoomTransition(
      'package', 'La sala de destino no pudo cargar sus personajes.',
    );
    return;
  }
  this.sceneBuildGeneration += 1;
  this.scenePackage.set(null);
  this.error.set('No pudimos cargar los recursos visuales de esta sala.');
  this.loading.set(false);
  this.busy.set(false);
}

requestRoomTransition(event: RoomExitRequested): void {
  const attempt = this.attempt();
  const scene = this.scenePackage();
  const world = this.world();
  if (!attempt || attempt.status !== 'IN_PROGRESS' || !scene || !world
    || this.inputBlocked() || this.roomTransitionState().phase !== 'idle'
    || event.originSceneInstanceKey !== scene.sceneInstanceKey) return;
  const exit = scene.exits.find(candidate => candidate.interactionKey === event.interactionKey);
  const door = world.objects.find(candidate => candidate.key === event.interactionKey);
  if (!exit || !door || exit.targetRoomKey !== event.targetRoomKey
    || exit.entry.x !== event.expectedEntry.x || exit.entry.y !== event.expectedEntry.y) return;
  if (!this.validateDoorAccess(door)) return;
  this.withSyncedPosition(() => {
    const request: RoomTransitionRequestV1 = Object.freeze({
      transitionId: `${event.originSceneInstanceKey}:${event.interactionKey}:${++this.roomTransitionSerial}`,
      originSceneInstanceKey: event.originSceneInstanceKey,
      targetRoomKey: event.targetRoomKey,
      interactionKey: event.interactionKey,
      expectedEntry: Object.freeze({ ...event.expectedEntry }),
    });
    this.busy.set(true);
    this.roomTransitionCancellation.set(null);
    this.roomTransitionState.set(reduceRoomTransition(IDLE_ROOM_TRANSITION, {
      type: 'begin', request,
    }));
    this.armRoomTransitionWatchdog(500);
  });
}

handleRoomTransitionEvent(event: RoomTransitionEdge): void {
  const state = this.roomTransitionState();
  if (state.phase === 'idle' || event.transitionId !== state.request.transitionId) return;
  if (event.type === 'room-transition-covered') {
    if (state.phase !== 'covering') return;
    const covered = reduceRoomTransition(state, {
      type: 'covered', transitionId: event.transitionId,
    });
    this.roomTransitionState.set(covered);
    this.armRoomTransitionWatchdog(12_000);
    const attempt = this.attempt();
    if (!attempt) {
      this.cancelActiveRoomTransition('http', 'El intento dejó de estar disponible.');
      return;
    }
    this.simulationService.enterRoom(
      attempt.attemptId, attempt.attemptToken,
      covered.request.targetRoomKey, covered.request.interactionKey,
    ).pipe(timeout({ first: 12_000 })).subscribe({
      next: world => this.applyWorldWithScenario(world),
      error: () => this.cancelActiveRoomTransition(
        'http', 'No pudimos cruzar la puerta; sigues en la sala anterior.',
      ),
    });
    return;
  }
  if (event.type === 'room-transition-complete') {
    if (state.phase !== 'revealing'
      || event.sceneInstanceKey !== state.targetSceneInstanceKey) return;
    this.clearRoomTransitionWatchdog();
    this.roomTransitionState.set(reduceRoomTransition(state, {
      type: 'revealed', transitionId: event.transitionId,
    }));
    this.roomTransitionCancellation.set(null);
    this.busy.set(false);
    const title = this.world()?.map.title;
    if (title) this.announce(`Entraste a ${title}.`);
    return;
  }
  if (state.phase !== 'cancelling') return;
  this.clearRoomTransitionWatchdog();
  this.roomTransitionState.set(reduceRoomTransition(state, {
    type: 'revealed', transitionId: event.transitionId,
  }));
  this.roomTransitionCancellation.set(null);
  this.busy.set(false);
  this.showActionError(this.roomTransitionFailureMessage);
}

private cancelActiveRoomTransition(
  reason: 'http' | 'package' | 'timeout',
  message: string,
): void {
  const state = this.roomTransitionState();
  if (state.phase === 'idle' || state.phase === 'cancelling') return;
  this.clearRoomTransitionWatchdog();
  this.roomTransitionFailureMessage = message;
  this.roomTransitionState.set(reduceRoomTransition(state, {
    type: 'cancel', transitionId: state.request.transitionId,
  }));
  this.roomTransitionCancellation.set({
    transitionId: state.request.transitionId, reason,
  });
  this.armRoomTransitionWatchdog(1_200);
}
```

`validateDoorAccess` is the existing `missingEvidence`/stage/armed gate extracted
from `tryOpenDoor`: it returns `false` after the same localized notice and sound,
and returns `true` only when the server-authorized request may begin. Delete the
old `triggerFade(() => enterRoom(...))` door branch; decisions may keep their
separate scene fade. `armRoomTransitionWatchdog` clears the previous timer. On
expiry during `covering`, `covered` or `revealing`, it calls
`cancelActiveRoomTransition('timeout', ...)`; on a second expiry while
`cancelling`, it clears `busy`, preserves whichever validated package is still
mounted, and exposes the existing visible recoverable-error surface with
`Recargar sala`. It must never leave the five input channels locked forever.
Clear the watchdog in `ngOnDestroy`.

Add component tests with fake timers and mocked `enterRoom` proving all of these
observable boundaries:

1. A valid exit sets `busy`/all five lock channels but makes zero `enterRoom`
   calls before `room-transition-covered`.
2. Two exit edges while active produce one transition id and one HTTP call.
3. A server package for the wrong map or landing point never replaces the
   origin `scenePackage`; it emits cancellation and unlocks only after
   `room-transition-cancelled`.
4. A valid returned package is mounted at exactly `expectedEntry`; `busy` stays
   true through `ready` and becomes false only after the matching
   `room-transition-complete` scene identity.
5. HTTP, cover and reveal timeouts have finite `500`/`12_000`/`1_200` ms paths,
   show a recoverable action and leave no timer after destroy.
6. A late `room-transition-covered` received while `cancelling` is ignored by
   wrapper and composition root and produces zero `enterRoom` calls.

Delete `GameWorldComponent.effectiveReduceMotion()` and every `matchMedia` call
from the Phaser boundary. Angular supplies the final boolean; Task 12 makes its
OS/user derivation explicit and testable.

`boot` must return until host, package and render plan all exist. Send `load-scene`, lock and preferences to the unattached port first; those stateful commands buffer. Then instantiate `DataDrivenWorldScene(this.port, avatarPlan)`, whose constructor attaches and receives the complete package before Phaser calls `preload`. This ordering guarantees that every NPC `ActorRenderPlan` is available for asset loading. `nudge`, `interactNearest` and `focus` send port commands; they never call scene methods. `ngOnDestroy` calls `detachEvents()`, `port.destroy()` and `phaserGame.destroy(true)`.

Expose test evidence on the host without a global debug object:

```html
<div #gameHost class="phaser-host" role="application"
  [attr.data-world-ready]="renderReady()"
  [attr.data-rendered-map-key]="renderedMapKey()"
  [attr.data-rendered-scenario-key]="renderedScenarioKey()"
  [attr.data-scene-revision]="scenePackage()?.revision ?? null"
  [attr.data-scene-hash]="scenePackage()?.contentHash ?? null"
  [attr.data-scene-instance-key]="scenePackage()?.sceneInstanceKey ?? null"
  [attr.data-character-id]="avatarRenderPlan()?.characterId ?? null"
  [attr.data-character-hash]="avatarRenderPlan()?.contentHash ?? null"
  [attr.data-actor-topology-scene]="actorTopologyEvidence()?.sceneInstanceKey ?? null"
  [attr.data-actor-ids]="actorTopologyEvidence()?.actorIds ?? null"
  [attr.data-actor-body-counts]="actorTopologyEvidence()?.bodyCounts ?? null"
  [attr.data-person-actor-ids]="actorTopologyEvidence()?.personActorIds ?? null"
  [attr.data-person-target-counts]="actorTopologyEvidence()?.personTargetCounts ?? null"
  [attr.data-person-marker-ids]="actorTopologyEvidence()?.genericPersonMarkerIds ?? null"
  [attr.data-input-locked]="inputLock().locked"
  [attr.data-player-x]="runtimePosition().x"
  [attr.data-player-y]="runtimePosition().y"
  [attr.data-camera-x]="runtimeCamera().x"
  [attr.data-camera-y]="runtimeCamera().y"
  [attr.data-camera-zoom]="runtimeCamera().zoom"
  [attr.data-player-animation]="runtimePlayerAnimation()"
  [attr.data-room-transition-phase]="roomTransitionPhase()"
  [attr.data-reduced-motion]="reduceMotion()"
  aria-label="Mapa explorable de la simulación. Los controles activos se muestran en el HUD.">
</div>
```

- [ ] **Step 6: Load player and NPC bodies through one authored-plan renderer**

Define `type RuntimeRenderPlan = AvatarRenderPlan | ActorRenderPlan` and
`RuntimeRenderPlanEntry` at module scope; the `private` members in the snippet
belong to `DataDrivenWorldScene`. In
`preload`, remove only the legacy cast/modular character branches. Preserve the
existing tileset, Tiled JSON, furniture/object and still-owned audio loads; this
step must not replace the complete method with a character-only preload. Queue
the selected player and every actor in the initial package through one loader:

```typescript
interface RuntimeRenderPlanEntry {
  readonly ownerId: string;
  readonly plan: RuntimeRenderPlan;
}

private readonly initiallyQueuedTextureKeys = new Set<string>();
private renderLoadQueue: Promise<void> = Promise.resolve();
private renderLoadGeneration = 0;

private plansForPackage(scene: ScenePackageV1): readonly RuntimeRenderPlanEntry[] {
  return [
    { ownerId: 'player', plan: this.avatarPlan },
    ...scene.actors.map(actor => ({ ownerId: actor.actorId, plan: actor.renderPlan })),
  ];
}

private preloadRenderPlan(plan: RuntimeRenderPlan): void {
  for (const sheet of Object.values(plan.sheets)) {
    if (this.initiallyQueuedTextureKeys.has(sheet.textureKey)) continue;
    this.initiallyQueuedTextureKeys.add(sheet.textureKey);
    this.load.spritesheet(sheet.textureKey, sheet.src, {
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
    });
  }
}

// Inside the existing preload(), replace only the legacy avatar/cast/preset
// block; leave every non-character load before and after this block intact.
if (!this.scenePackage) throw new Error('ScenePackageV1 must be buffered before preload');
for (const { plan } of this.plansForPackage(this.scenePackage)) {
  this.preloadRenderPlan(plan);
}
```

`preload` runs only once, while the slice changes from Urgencias to actors that
first appear in Escucha, Recepción and Consultorio. Add an idempotent,
serialized loader for every later `ScenePackageV1`; checking Phaser's texture
manager, rather than a historical “queued” set, makes a failed file retryable:

```typescript
private loadMissingRenderSheets(entries: readonly RuntimeRenderPlanEntry[]): Promise<void> {
  const missing = new Map<string, {
    src: string; frameWidth: number; frameHeight: number;
  }>();
  for (const { plan } of entries) {
    for (const sheet of Object.values(plan.sheets)) {
      if (!this.textures.exists(sheet.textureKey)) {
        missing.set(sheet.textureKey, {
          src: sheet.src, frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight,
        });
      }
    }
  }
  if (missing.size === 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const failed = new Set<string>();
    const onLoadError = (file: Phaser.Loader.File) => {
      if (missing.has(file.key)) failed.add(file.key);
    };
    const cleanup = () => {
      this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onLoadError);
      this.load.off(Phaser.Loader.Events.COMPLETE, onComplete);
    };
    const onComplete = () => {
      cleanup();
      const absent = [...missing.keys()].filter(key => !this.textures.exists(key));
      if (failed.size > 0 || absent.length > 0) {
        reject(new Error(`Actor sheets failed: ${[...new Set([...failed, ...absent])].join(',')}`));
        return;
      }
      resolve();
    };

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onLoadError);
    this.load.once(Phaser.Loader.Events.COMPLETE, onComplete);
    for (const [textureKey, sheet] of missing) {
      this.load.spritesheet(textureKey, sheet.src, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }
    this.load.start();
  });
}

private queuePackageRender(scene: ScenePackageV1): void {
  const generation = ++this.renderLoadGeneration;
  const entries = this.plansForPackage(scene);
  const run = this.renderLoadQueue.then(async () => {
    await this.loadMissingRenderSheets(entries);
    if (generation !== this.renderLoadGeneration
      || this.scenePackage?.sceneInstanceKey !== scene.sceneInstanceKey) return;
    for (const { ownerId, plan } of entries) this.registerRenderPlan(ownerId, plan);
    this.renderWorld();
  });
  this.renderLoadQueue = run.catch(() => undefined);
  void run.catch(error => {
    if (generation !== this.renderLoadGeneration
      || this.scenePackage?.sceneInstanceKey !== scene.sceneInstanceKey) return;
    this.port.emit({
      type: 'scene-render-failed',
      sceneInstanceKey: scene.sceneInstanceKey,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}
```

The queue permits only one post-`create` Phaser Loader cycle at a time. A newer
package invalidates an older generation; an old completion may cache its
content-addressed textures but may neither register bodies nor render. A target
room stays under the opaque transition cover until its missing sheets load,
owner-specific animations register and `renderWorld` emits `ready`. There is no
placeholder actor or reveal-on-load-error path.

In `create`, register every authored animation/direction through one helper:

```typescript
private registerRenderPlan(ownerId: string, plan: RuntimeRenderPlan): void {
  for (const animation of Object.values(plan.animations)) {
    const sheet = plan.sheets[animation.sheetId];
    for (const [direction, frames] of Object.entries(animation.directions)) {
      const key = this.animationKey(ownerId, animation.id, direction as CardinalDirection);
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(sheet.textureKey, { frames: [...frames] }),
        frameRate: animation.fps,
        repeat: animation.loop ? -1 : 0,
      });
    }
  }
}

private animationKey(
  ownerId: string,
  animationId: CharacterAnimationId,
  direction: CardinalDirection,
): string {
  return `actor:${ownerId}:${animationId}:${direction}`;
}
```

During initial `create`, call `registerRenderPlan` for every entry returned by
`plansForPackage(this.scenePackage)` before the first `renderWorld`. For later
packages, `queuePackageRender` performs the same registration only after all
textures exist. The existing `this.anims.exists(key)` check makes registration
idempotent for actors reused by stage aliases. Never flip a direction that has
authored frames. Keep the player method temporarily restricted to locomotion;
Task 11 replaces presentation selection with the total typed resolver:

```typescript
if (!this.scenePackage) throw new Error('Initial ScenePackageV1 is missing in create');
for (const { ownerId, plan } of this.plansForPackage(this.scenePackage)) {
  this.registerRenderPlan(ownerId, plan);
}
this.renderWorld();
```

```typescript
private playerAnimationKey(animationId: CharacterAnimationId, direction: CardinalDirection): string {
  return this.animationKey('player', animationId, direction);
}

private applyPlayerBodyPose(direction: CardinalDirection, pose: ActorBodyPose): void {
  if (!this.playerSprite) return;
  if (pose !== 'walk' && pose !== 'idle') {
    throw new Error(`Presentation pose ${pose} is wired by Task 11`);
  }
  const animationId: CharacterAnimationId = pose;
  const key = this.playerAnimationKey(animationId, direction);
  if (this.preferences.reduceMotion && animationId !== 'walk') {
    const animation = this.avatarPlan.animations[animationId];
    const sheet = this.avatarPlan.sheets[animation.sheetId];
    this.playerSprite.stop().setTexture(sheet.textureKey).setFrame(animation.directions[direction][0]);
    return;
  }
  this.playerSprite.play(key, true);
}
```

Create every NPC at its feet pivot with the same geometry and no preset/tint branch:

```typescript
private readonly npcSprites = new Map<string, Phaser.GameObjects.Sprite>();
private readonly npcRenderPlans = new Map<string, ActorRenderPlan>();
private readonly actorBodyInstanceCounts = new Map<string, number>();
private readonly personInteractionTargetCounts = new Map<string, number>();

private createNpcBody(actor: SceneActorV1): Phaser.GameObjects.Container {
  const plan = actor.renderPlan;
  if (plan.logicalScale !== 1 || plan.actorId !== actor.actorId) {
    throw new Error(`Invalid ActorRenderPlan for ${actor.actorId}`);
  }
  const bodyCount = (this.actorBodyInstanceCounts.get(actor.actorId) ?? 0) + 1;
  this.actorBodyInstanceCounts.set(actor.actorId, bodyCount);
  if (bodyCount !== 1 || this.npcMarkers.has(actor.actorId)) {
    throw new Error(`Actor ${actor.actorId} would receive more than one body`);
  }
  const idle = plan.animations.idle;
  const sheet = plan.sheets[idle.sheetId];
  const sprite = this.add.sprite(0, 0, sheet.textureKey, idle.directions[actor.facing][0])
    .setOrigin(plan.pivot.x / plan.logicalFrame.width, plan.pivot.y / plan.logicalFrame.height)
    .setScale(plan.logicalScale);
  const shadow = this.add.ellipse(
    plan.shadow.offsetX, plan.shadow.offsetY,
    plan.shadow.width, plan.shadow.height,
    0x000000, 0.24,
  );
  const container = this.add.container(actor.position.x, actor.position.y, [shadow, sprite])
    .setDepth(actorDepth(actor.position.y));
  this.npcSprites.set(actor.actorId, sprite);
  this.npcRenderPlans.set(actor.actorId, plan);
  this.npcMarkers.set(actor.actorId, container);
  if (actor.source === 'person-interaction') {
    const matches = this.allWorldInteractions()
      .filter(item => item.type === 'PERSON' && item.key === actor.interactionKey);
    if (matches.length !== 1 || !actor.interactionRect) {
      throw new Error(`PERSON ${actor.actorId} lacks one interaction authority`);
    }
    this.bindActorInteraction(actor, matches[0], container);
  }
  sprite.play(this.animationKey(actor.actorId, 'idle', actor.facing), true);
  return container;
}
```

`bindActorInteraction` stores the existing `MapObjectState` in the same
proximity/selection registry used by `interactNearest`, but points its focus
anchor to the actor container and its hit area to `actor.interactionRect`; it
does not allocate any Phaser display object. Clear that registry together with
`npcMarkers`, `actorBodyInstanceCounts` and `personInteractionTargetCounts` on
every new `sceneInstanceKey`. Its first lines enforce one target per PERSON:

```typescript
const targetCount = (this.personInteractionTargetCounts.get(actor.actorId) ?? 0) + 1;
this.personInteractionTargetCounts.set(actor.actorId, targetCount);
if (targetCount !== 1) {
  throw new Error(`PERSON ${actor.actorId} would receive more than one interaction target`);
}
```

In the existing `renderWorld` teardown, after destroying the previous actor
containers and interaction anchors, clear the evidence registries before
creating anything from the new package:

```typescript
this.npcMarkers.clear();
this.npcSprites.clear();
this.npcRenderPlans.clear();
this.actorBodyInstanceCounts.clear();
this.personInteractionTargetCounts.clear();
```

Add a focused runtime assertion that `familia-crisis` creates one container,
remains interactable through its original key, and sends one interaction
request—not a marker plus an actor. The complete eight-map proof is the typed
snapshot and Playwright path below, not this single-scene regression.

Create the player at the feet pivot with integer scale:

```typescript
private createPlayer(x: number, y: number): void {
  const idle = this.avatarPlan.animations.idle;
  const sheet = this.avatarPlan.sheets[idle.sheetId];
  const sprite = this.add.sprite(0, 0, sheet.textureKey, idle.directions.down[0])
    .setOrigin(
      this.avatarPlan.pivot.x / this.avatarPlan.logicalFrame.width,
      this.avatarPlan.pivot.y / this.avatarPlan.logicalFrame.height,
    )
    .setScale(this.avatarPlan.logicalScale);
  const shadow = this.add.ellipse(
    this.avatarPlan.shadow.offsetX,
    this.avatarPlan.shadow.offsetY,
    this.avatarPlan.shadow.width,
    this.avatarPlan.shadow.height,
    0x000000,
    0.24,
  );
  this.player = this.add.container(x, y, [shadow, sprite]).setDepth(actorDepth(y));
  this.playerSprite = sprite;
  this.applyPlayerBodyPose('down', 'idle');
}
```

Delete `livingActors`, `registerLivingActor`, `updateLivingActors`, imports from `character-motion.util`, all NPC preset/tint constructors and all `AVATAR_DISPLAY_SCALE`/legacy modular/cast player branches. Delete `character-motion.util.ts` and its spec now; authored frames are the only body motion for player and NPCs.

- [ ] **Step 7: Prove eight-map topology, then run boundary, component, build and E2E gates**

Add the following public-DOM assertion to `frontend/e2e/support/siep-flow.ts`.
It consumes only the typed adapter attributes; it never reaches into Phaser or
an Angular signal:

```typescript
export interface ExpectedActorTopology {
  readonly actorIds: readonly string[];
  readonly personActorIds: readonly string[];
}

function evidenceIds(raw: string | null): string[] {
  return raw ? raw.split('|').filter(Boolean).sort((a, b) => a.localeCompare(b)) : [];
}

function evidenceCounts(raw: string | null): Record<string, number> {
  return Object.fromEntries(evidenceIds(raw).map(token => {
    const separator = token.lastIndexOf('=');
    if (separator <= 0) throw new Error(`Conteo de actor inválido: ${token}`);
    const actorId = token.slice(0, separator);
    const count = Number(token.slice(separator + 1));
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`Conteo de actor inválido: ${token}`);
    }
    return [actorId, count];
  }));
}

export async function assertActorTopology(
  page: Page,
  mapKey: string,
  expected: ExpectedActorTopology,
): Promise<void> {
  await waitForWorldReady(page, mapKey);
  const host = page.locator('app-game-world .phaser-host[data-world-ready="true"]');
  const sceneInstanceKey = await host.getAttribute('data-scene-instance-key');
  expect(sceneInstanceKey).toBeTruthy();
  await expect(host).toHaveAttribute(
    'data-actor-topology-scene', sceneInstanceKey!, { timeout: 45_000 },
  );

  const actorIds = evidenceIds(await host.getAttribute('data-actor-ids'));
  const personActorIds = evidenceIds(await host.getAttribute('data-person-actor-ids'));
  const bodyCounts = evidenceCounts(await host.getAttribute('data-actor-body-counts'));
  const targetCounts = evidenceCounts(await host.getAttribute('data-person-target-counts'));
  const genericMarkers = evidenceIds(await host.getAttribute('data-person-marker-ids'));
  const expectedActors = [...expected.actorIds].sort((a, b) => a.localeCompare(b));
  const expectedPersons = [...expected.personActorIds].sort((a, b) => a.localeCompare(b));

  expect(actorIds).toEqual(expectedActors);
  expect(personActorIds).toEqual(expectedPersons);
  expect(bodyCounts).toEqual(Object.fromEntries(expectedActors.map(actorId => [actorId, 1])));
  expect(targetCounts).toEqual(Object.fromEntries(expectedPersons.map(actorId => [actorId, 1])));
  expect(genericMarkers).toEqual([]);
}
```

In `full-case.e2e.ts`, import `assertActorTopology`, add this exact backend-map
matrix, and route every assertion through one helper:

```typescript
const SLICE_ACTOR_TOPOLOGY = {
  'hospital-urgencias': {
    actorIds: ['enfermera-urgencias', 'medico-guardia', 'psicologa-orientadora', 'familia-crisis'],
    personActorIds: ['familia-crisis'],
  },
  'hospital-sala-escucha': {
    actorIds: ['trabajadora-social', 'familia-duelo', 'psicologa-acompanante'],
    personActorIds: ['familia-duelo', 'psicologa-acompanante'],
  },
  'hospital-sala-escucha-accion': {
    actorIds: ['trabajadora-social', 'familia-duelo', 'psicologa-acompanante'],
    personActorIds: ['familia-duelo', 'psicologa-acompanante'],
  },
  'hospital-sala-escucha-cierre': {
    actorIds: ['trabajadora-social', 'familia-duelo'],
    personActorIds: ['familia-duelo'],
  },
  'comisaria-recepcion': {
    actorIds: ['orientadora-juridica', 'sobreviviente-espera', 'madre-acompanante', 'funcionaria-recepcion'],
    personActorIds: ['funcionaria-recepcion'],
  },
  'comisaria-consultorio': {
    actorIds: ['apoyo-psicosocial', 'sobreviviente-consulta', 'profesional-psicosocial'],
    personActorIds: ['sobreviviente-consulta', 'profesional-psicosocial'],
  },
  'comisaria-consultorio-marco': {
    actorIds: ['apoyo-psicosocial', 'sobreviviente-consulta', 'profesional-psicosocial'],
    personActorIds: ['sobreviviente-consulta', 'profesional-psicosocial'],
  },
  'comisaria-consultorio-cierre': {
    actorIds: ['apoyo-psicosocial'],
    personActorIds: [],
  },
} as const;

type SliceMapKey = keyof typeof SLICE_ACTOR_TOPOLOGY;

async function assertSliceActorTopology(page: Page, mapKey: SliceMapKey): Promise<void> {
  await assertActorTopology(page, mapKey, SLICE_ACTOR_TOPOLOGY[mapKey]);
}
```

Exercise the eight keys in the existing public full-case path at these exact
points:

```typescript
// Replace the initial unqualified waitForWorldReady after the Continue click.
await assertSliceActorTopology(page, 'hospital-urgencias');

// Immediately after enterDoor(..., 'hospital-sala-escucha').
await assertSliceActorTopology(page, 'hospital-sala-escucha');

// After H2 supervision closes; replace its unqualified waitForWorldReady.
await assertSliceActorTopology(page, 'hospital-sala-escucha-accion');

// After H3 supervision closes; replace its unqualified waitForWorldReady.
await assertSliceActorTopology(page, 'hospital-sala-escucha-cierre');

// Immediately after enterDoor(..., 'comisaria-recepcion').
await assertSliceActorTopology(page, 'comisaria-recepcion');

// Immediately after enterDoor(..., 'comisaria-consultorio').
await assertSliceActorTopology(page, 'comisaria-consultorio');

// After C2 supervision closes; replace its unqualified waitForWorldReady.
await assertSliceActorTopology(page, 'comisaria-consultorio-marco');

// After the C3 response reports cierre-caso and before asserting the outcome.
await assertSliceActorTopology(page, 'comisaria-consultorio-cierre');
```

Keep the existing base-room waits used by refresh/pause tests; do not count
them as substitutes for a distinct stage. Because the full-case suite already
runs `REQUIRED_VIEWPORTS`, this proves all eight backend maps on desktop and
laptop, including the incremental first appearance of actor textures.

Run:

```powershell
node --test scripts/runtime-boundary.test.mjs
npm test --prefix frontend -- --runInBand src/app/features/simulator/simulation-play.consent-gate.spec.ts src/app/features/simulator/scenario-npc-configs.spec.ts src/app/features/simulator/case-pdf-rooms.spec.ts src/app/features/simulator/runtime
npm run build:frontend
npm run test:e2e -- full-case.e2e.ts --project=chromium --retries=0
```

Expected: boundary has `3 passed`; all selected Jest suites pass; production
build and both required full-case viewport runs exit `0`. The boundary test
proves the eight retired visual/store files are absent,
the scenario/core/runtime sources expose no preset or tint authority, and
`game-world.component.ts` contains no storage, callback, guide or deformation
fallback. The E2E observes exactly eight distinct map keys; every expected
actor has one body, every PERSON has one interaction target, and no PERSON has a
generic marker.

- [ ] **Step 8: Commit the boundary**

```powershell
git add scripts/runtime-boundary.test.mjs frontend/src/app/core/models/simulation.model.ts frontend/src/app/features/character/avatar-config.util.ts frontend/src/app/features/simulator/game-world.component.ts frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts frontend/src/app/features/simulator/runtime/game-world.port.ts frontend/src/app/features/simulator/runtime/game-world.port.spec.ts frontend/src/app/features/simulator/runtime/actor-topology-evidence.ts frontend/src/app/features/simulator/runtime/actor-topology-evidence.spec.ts frontend/src/app/features/simulator/runtime/scene-package.mapper.spec.ts frontend/src/app/features/simulator/runtime/room-transition.state.ts frontend/src/app/features/simulator/runtime/room-transition.state.spec.ts frontend/src/app/features/simulator/scenario-npc-configs.spec.ts frontend/src/app/features/simulator/case-pdf-rooms.spec.ts frontend/e2e/support/siep-flow.ts frontend/e2e/full-case.e2e.ts frontend/src/assets/game/scenarios
git rm frontend/src/app/features/simulator/character-motion.util.ts frontend/src/app/features/simulator/character-motion.util.spec.ts frontend/src/app/features/simulator/scene-guide.config.ts frontend/src/app/features/simulator/scene-guide.config.spec.ts frontend/src/app/features/simulator/npc-avatar-presets.ts frontend/src/app/features/simulator/npc-avatar-presets.spec.ts frontend/src/app/features/simulator/baked-cast.util.ts frontend/src/app/features/simulator/baked-cast.util.spec.ts frontend/src/app/features/simulator/lobby-avatar.util.ts frontend/src/app/features/simulator/lobby-avatar.util.spec.ts frontend/src/app/features/character/avatar.store.ts frontend/src/app/features/character/avatar.store.spec.ts
git commit -m "refactor(game): aislar runtime Angular Phaser"
```

### Task 10: Wire acceleration, collision and the full input lock into the live frame

**Files:**

- Modify: `frontend/src/app/features/simulator/game-world.component.ts`
- Modify: `frontend/src/app/features/simulator/runtime/input-lock.state.ts`
- Modify: `frontend/src/app/features/simulator/runtime/input-lock.state.spec.ts`
- Delete: `frontend/src/app/features/simulator/player-motion.util.ts`
- Delete: `frontend/src/app/features/simulator/player-motion.util.spec.ts`

- [ ] **Step 1: Add a red lock reset assertion to the scene-facing contract**

Extend the `InputLockState` test to prove a held movement vector resolves to no input when locked by adding this exported helper to the intended API:

```typescript
import { lockPlayerInput } from './input-lock.state';

expect(lockPlayerInput(
  { direction: { x: 0.75, y: 0 } },
  resolveInputLockState({ ...OPEN, journal: true }),
)).toEqual({ direction: { x: 0, y: 0 } });
```

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/input-lock.state.spec.ts
```

Expected: `FAIL` because `lockPlayerInput` is not exported.

- [ ] **Step 2: Implement the helper without a second lock rule**

Append to `input-lock.state.ts`:

```typescript
export interface DirectionalInputFrame {
  readonly direction: { readonly x: number; readonly y: number };
}

export function lockPlayerInput(
  input: DirectionalInputFrame,
  state: InputLockState,
): DirectionalInputFrame {
  return state.channels.player
    ? { direction: { x: 0, y: 0 } }
    : input;
}
```

- [ ] **Step 3: Instantiate collision and motion only from the loaded package/plan**

Add scene fields:

```typescript
private playerMotion = idlePlayerMotion('down');
private collisionWorld?: CollisionWorld;
private lastEmittedPosition = { x: Number.NaN, y: Number.NaN };
```

Now replace the minimal Task 9 lock setter with the motion-aware version:

```typescript
private setInputLock(state: InputLockState): void {
  this.inputLock = state;
  if (!state.locked) return;
  this.playerMotion = idlePlayerMotion(this.playerMotion.facing);
  this.applyPlayerBodyPose(this.playerMotion.facing, 'idle');
}
```

At the beginning of `setScenePackage`, validate the client/server foot contract and instantiate the resolver:

```typescript
const feet = this.avatarPlan.feetHitbox;
if (feet.x !== -11 || feet.y !== -16 || feet.width !== 22 || feet.height !== 16) {
  throw new Error('AvatarRenderPlan feetHitbox diverges from the authoritative 22x16 server contract');
}
this.collisionWorld = new CollisionWorld(scenePackage.map.bounds, feet, scenePackage.solids);
this.playerMotion = idlePlayerMotion(this.playerMotion.facing);
```

This fail-closed equality remains until the backend accepts a versioned hitbox in its scene identity. Do not silently use different client geometry.

- [ ] **Step 4: Replace the live `update` method completely**

Use this frame flow; all gameplay branches are after the same lock check:

```typescript
override update(time: number, delta: number): void {
  if (!this.player || !this.cursors || !this.keys || !this.scenePackage || !this.collisionWorld) return;

  const rawInput: PlayerInputFrame = {
    direction: {
      x: Number(this.cursors.right.isDown || this.keys['D'].isDown)
        - Number(this.cursors.left.isDown || this.keys['A'].isDown),
      y: Number(this.cursors.down.isDown || this.keys['S'].isDown)
        - Number(this.cursors.up.isDown || this.keys['W'].isDown),
    },
  };
  const input = lockPlayerInput(rawInput, this.inputLock);

  if (this.inputLock.locked) {
    this.playerMotion = idlePlayerMotion(this.playerMotion.facing);
    this.applyPlayerBodyPose(this.playerMotion.facing, 'idle');
    return;
  }

  const frame = stepPlayerController(this.playerMotion, input, delta);
  const collision = this.collisionWorld.moveFeet(
    { x: this.player.x, y: this.player.y },
    frame.displacement,
  );
  this.playerMotion = reconcileBlockedMotion(frame.state, collision.blockedX, collision.blockedY);
  this.player.setPosition(collision.position.x, collision.position.y);
  const moved = Math.hypot(collision.actual.x, collision.actual.y) > 0.001;
  this.applyPlayerBodyPose(this.playerMotion.facing, moved ? 'walk' : 'idle');

  if (moved) {
    this.emitPlayerPositionIfChanged();
    this.ysort(this.player);
  }

  this.interactionCooldown = Math.max(0, this.interactionCooldown - delta);
  if (!this.inputLock.channels.interactions
    && this.interactionCooldown <= 0
    && (Phaser.Input.Keyboard.JustDown(this.keys['E'])
      || Phaser.Input.Keyboard.JustDown(this.keys['SPACE'])
      || Phaser.Input.Keyboard.JustDown(this.keys['ENTER']))) {
    this.interactionCooldown = this.INTERACTION_COOLDOWN_MS;
    this.interactNearest();
  }

  this.updateNearestInteraction();
  this.updateNpcHints();
  if (!this.inputLock.channels.npcs) {
    this.updateAmbientMovers(time, delta);
    this.updateNpcMovers(time, delta);
  }
  this.checkExitTriggers();
  this.checkDbDoorTriggers();
}
```

Add the position coalescer:

```typescript
private emitPlayerPositionIfChanged(): void {
  if (!this.player || this.inputLock.channels.positionEvents) return;
  const position = { x: Math.round(this.player.x), y: Math.round(this.player.y) };
  if (position.x === this.lastEmittedPosition.x && position.y === this.lastEmittedPosition.y) return;
  this.lastEmittedPosition = position;
  this.port.emit({ type: 'player-position-changed', position, atMs: this.time.now });
}
```

`interactNearest`, `focus`, `checkExitTriggers` and `checkDbDoorTriggers` each begin with their corresponding `InputLockState.channels` guard. Replace `nudge` with the complete controller-driven implementation below; it never changes position without collision resolution:

```typescript
private nudge(direction: CardinalDirection): void {
  if (this.inputLock.channels.player || !this.player || !this.collisionWorld) return;
  const input: PlayerInputFrame = {
    direction: {
      x: direction === 'left' ? -1 : direction === 'right' ? 1 : 0,
      y: direction === 'up' ? -1 : direction === 'down' ? 1 : 0,
    },
  };
  let moved = false;

  for (let index = 0; index < 4; index += 1) {
    const frame = stepPlayerController(this.playerMotion, input, 34);
    const collision = this.collisionWorld.moveFeet(
      { x: this.player.x, y: this.player.y },
      frame.displacement,
    );
    this.playerMotion = reconcileBlockedMotion(frame.state, collision.blockedX, collision.blockedY);
    this.player.setPosition(collision.position.x, collision.position.y);
    const advanced = Math.hypot(collision.actual.x, collision.actual.y) > 0.001;
    moved ||= advanced;
    if (!advanced) break;
  }

  this.applyPlayerBodyPose(this.playerMotion.facing, moved ? 'walk' : 'idle');
  if (moved) {
    this.emitPlayerPositionIfChanged();
    this.ysort(this.player);
  }
  this.updateNearestInteraction();
}
```

Some existing proximity/placement code still needs a yes/no collision query. Add one adapter backed by the same resolver and replace every call to `wouldCollide(x, y)` with `collidesAt(x, y)` before deleting the old method:

```typescript
private collidesAt(x: number, y: number): boolean {
  return this.collisionWorld?.collides({ x, y }) ?? true;
}
```

Delete `wouldCollide`, `movePlayer`, all imports of `caseRoomCollisions`, `AUTHORED_CLINICAL_COLLISIONS`, `HOSPITAL_COLLISIONS`, `COMISARIA_COLLISIONS`, and tile-layer collision lookup. Tiled walls remain visual layers only. Any fallback room without server solids has only map bounds; do not resurrect a client hardcoded collision source.

- [ ] **Step 5: Delete the superseded motion utility and verify all references are gone**

Delete `player-motion.util.ts` and `player-motion.util.spec.ts`. The only valid imports of `PlayerInputFrame`/motion state now come from `runtime/player-controller.ts`; the only valid collision import comes from `runtime/collision-world.ts`.

Run:

```powershell
Get-ChildItem frontend/src/app -Recurse -File -Filter *.ts | Select-String -Pattern 'player-motion.util|character-motion.util|wouldCollide|caseRoomCollisions'
```

Expected: no output.

- [ ] **Step 6: Run controller, package, boundary and build gates**

Run:

```powershell
node --test scripts/runtime-boundary.test.mjs
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime src/app/features/simulator/simulation-play.consent-gate.spec.ts
npm run build:frontend
```

Expected: all commands exit `0`; no test asserts whole-sprite scale/offset deformation.

- [ ] **Step 7: Commit live control/collision integration**

```powershell
git add frontend/src/app/features/simulator/game-world.component.ts frontend/src/app/features/simulator/runtime/input-lock.state.ts frontend/src/app/features/simulator/runtime/input-lock.state.spec.ts frontend/src/app/features/simulator/player-motion.util.ts frontend/src/app/features/simulator/player-motion.util.spec.ts
git commit -m "feat(game): integrar control y colisiones premium"
```

### Task 11: Wire camera and actor presentation into Phaser

**Files:**

- Modify: `frontend/src/app/features/simulator/game-world.component.ts`
- Modify: `frontend/src/app/features/simulator/runtime/actor-presentation.model.spec.ts`
- Create: `frontend/src/app/features/simulator/runtime/actor-animation-resolver.ts`
- Create: `frontend/src/app/features/simulator/runtime/actor-animation-resolver.spec.ts`
- Create: `frontend/src/app/features/simulator/runtime/actor-presentation-timeline.ts`
- Create: `frontend/src/app/features/simulator/runtime/actor-presentation-timeline.spec.ts`
- Create: `frontend/e2e/world-runtime.e2e.ts`
- Modify: `frontend/e2e/support/siep-flow.ts`
- Modify: `frontend/e2e/consent-gate.e2e.ts`
- Modify: `frontend/e2e/full-case.e2e.ts`

- [ ] **Step 1: Add a red actor-restore regression for consecutive dialogue beats**

Extend `actor-presentation.model.spec.ts`:

```typescript
it('rebuilds a second beat from the original restore snapshot', () => {
  const first = beginActorPresentation(bodies, presentation, {
    player: { x: 100, y: 100 }, nurse: { x: 140, y: 100 },
  });
  const second = beginActorPresentation(first.restore, {
    ...presentation,
    speakerId: 'player',
    listenerId: 'nurse',
    speakerName: 'Estudiante',
    pose: 'react',
    consequenceTone: 'tension',
    speaking: false,
  }, {
    player: { x: 100, y: 100 }, nurse: { x: 140, y: 100 },
  });
  expect(second.bodies.player).toMatchObject({ facing: 'right', pose: 'react' });
  expect(endActorPresentation(second)).toEqual(bodies);
});
```

Create `actor-animation-resolver.spec.ts` with the exact four-tone catalog and
fail-closed drift cases:

```typescript
import type { ConsequenceTone } from '../../../core/models/consequence-tone.model';
import type { AvatarRenderPlan } from '../../character/avatar-render-plan.model';
import { defaultCharacterSelection, resolveAvatarRenderPlan } from '../../character/avatar-render-plan.util';
import { resolveActorRenderPlan } from '../../character/actor-render-plan.util';
import { makeCharacterManifestFixture } from '../../character/character-test.fixture';
import { resolveActorAnimation } from './actor-animation-resolver';

const manifest = makeCharacterManifestFixture();
const plan = resolveAvatarRenderPlan(manifest, defaultCharacterSelection(manifest));
const identityPlans = manifest.identities.map(identity => resolveAvatarRenderPlan(
  manifest,
  { ...defaultCharacterSelection(manifest), characterId: identity.characterId },
));
const representativeActorIds = Object.entries(manifest.actorMappings)
  .filter(([, visualId], index, entries) => (
    entries.findIndex(([, candidate]) => candidate === visualId) === index
  ))
  .map(([actorId]) => actorId);
const allRenderPlans = [
  ...identityPlans,
  ...representativeActorIds.map(actorId => resolveActorRenderPlan(manifest, actorId)),
];

it.each([
  ['idle', null, 'idle'],
  ['walk', null, 'walk'],
  ['talk', null, 'talk'],
  ['interact', null, 'interact'],
] as const)('%s resolves without a consequence tone', (pose, tone, animationId) => {
  expect(resolveActorAnimation(plan, pose, tone)).toEqual({ animationId, portraitState: null });
});

const CONSEQUENCE_CASES = [
  ['relief', 'reactRelief'],
  ['steady', 'reactSteady'],
  ['tension', 'reactTension'],
  ['rupture', 'reactRupture'],
] as const;

it('builds exactly ten identity and eleven NPC visual plans', () => {
  expect(identityPlans).toHaveLength(10);
  expect(representativeActorIds).toHaveLength(11);
  expect(allRenderPlans).toHaveLength(21);
});

it.each(allRenderPlans.flatMap(renderPlan => CONSEQUENCE_CASES.map(
  ([tone, animationId]) => [
    'characterId' in renderPlan ? renderPlan.characterId : renderPlan.visualId,
    tone,
    renderPlan,
    animationId,
  ] as const,
)))('%s/%s resolves congruent body and portrait slots', (
  _planId, tone, renderPlan, animationId,
) => {
  expect(resolveActorAnimation(renderPlan, 'react', tone)).toEqual({
    animationId, portraitState: tone,
  });
});

it('rejects missing/unknown tone, tone on a non-reaction and atlas drift', () => {
  expect(() => resolveActorAnimation(plan, 'react', null)).toThrow(/ConsequenceTone required/);
  expect(() => resolveActorAnimation(
    plan, 'react', 'unknown' as ConsequenceTone,
  )).toThrow(/not authored/);
  expect(() => resolveActorAnimation(plan, 'talk', 'steady')).toThrow(/only valid for react/);
  const drift = {
    ...plan,
    animations: { ...plan.animations, reactRupture: undefined },
  } as unknown as AvatarRenderPlan;
  expect(() => resolveActorAnimation(drift, 'react', 'rupture'))
    .toThrow(/reactRupture.*missing/);
});
```

Create `actor-presentation-timeline.spec.ts` to make the pre-speech turn and
pause measurable instead of decorative prose:

```typescript
import { buildActorTurnTimeline } from './actor-presentation-timeline';

it.each([
  ['right', 'down', false, ['down'], 220],
  ['up', 'down', false, ['right', 'down'], 280],
  ['left', 'left', false, [], 120],
  ['up', 'down', true, ['down'], 100],
] as const)('turns %s to %s deterministically', (from, to, reduced, facings, readyAtMs) => {
  const timeline = buildActorTurnTimeline(from, to, reduced);
  expect(timeline.frames.map(frame => frame.facing)).toEqual(facings);
  expect(timeline.readyAtMs).toBe(readyAtMs);
  expect(timeline.readyAtMs).toBeLessThanOrEqual(350);
  expect(timeline.pauseDurationMs).toBe(reduced ? 100 : 120);
  expect(Object.isFrozen(timeline.frames)).toBe(true);
});
```

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/actor-presentation.model.spec.ts src/app/features/simulator/runtime/actor-animation-resolver.spec.ts src/app/features/simulator/runtime/actor-presentation-timeline.spec.ts
```

Expected: the reducer regression passes and both new suites fail because their
implementation modules do not exist.

- [ ] **Step 2: Implement the total typed animation resolver**

Create `actor-animation-resolver.ts`:

```typescript
import type { CharacterAnimationId } from '../../character/character-manifest.model';
import type { PortraitState } from '../../character/character-manifest.model';
import type { AvatarRenderPlan } from '../../character/avatar-render-plan.model';
import type { ConsequenceTone } from '../../../core/models/consequence-tone.model';
import type { ActorBodyPose } from './actor-presentation.model';

export interface ResolvedActorAnimation {
  readonly animationId: CharacterAnimationId;
  readonly portraitState: PortraitState | null;
}

export function resolveActorAnimation(
  plan: Pick<AvatarRenderPlan, 'animations' | 'portrait' | 'consequenceReactions'>,
  pose: ActorBodyPose,
  consequenceTone: ConsequenceTone | null,
): ResolvedActorAnimation {
  if (pose !== 'react') {
    if (consequenceTone !== null) {
      throw new Error('ConsequenceTone is only valid for react pose');
    }
    const animationId: CharacterAnimationId = pose;
    if (!plan.animations[animationId]) {
      throw new Error(`${animationId} animation missing from render plan`);
    }
    return Object.freeze({ animationId, portraitState: null });
  }

  if (consequenceTone === null) {
    throw new Error('ConsequenceTone required for react pose');
  }
  const authored = plan.consequenceReactions[consequenceTone];
  if (!authored) throw new Error(`ConsequenceTone not authored: ${consequenceTone}`);
  if (!plan.animations[authored.animationId]) {
    throw new Error(`${authored.animationId} animation missing from render plan`);
  }
  if (!plan.portrait.states[authored.portraitState]?.length) {
    throw new Error(`${authored.portraitState} portrait state missing from render plan`);
  }
  return Object.freeze({ ...authored });
}
```

Create `actor-presentation-timeline.ts`:

```typescript
import type { CardinalDirection } from '../../character/character-manifest.model';

export interface ActorTurnFrame {
  readonly atMs: number;
  readonly facing: CardinalDirection;
}

export interface ActorTurnTimeline {
  readonly frames: readonly ActorTurnFrame[];
  readonly turnDurationMs: number;
  readonly pauseDurationMs: number;
  readonly readyAtMs: number;
}

const CLOCKWISE: readonly CardinalDirection[] = ['up', 'right', 'down', 'left'];

export function buildActorTurnTimeline(
  from: CardinalDirection,
  to: CardinalDirection,
  reducedMotion: boolean,
): ActorTurnTimeline {
  const fromIndex = CLOCKWISE.indexOf(from);
  const toIndex = CLOCKWISE.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) throw new Error('Invalid cardinal facing');
  if (reducedMotion) {
    const frames = from === to ? [] : [{ atMs: 0, facing: to }];
    return Object.freeze({
      frames: Object.freeze(frames), turnDurationMs: 0,
      pauseDurationMs: 100, readyAtMs: 100,
    });
  }
  const clockwiseSteps = (toIndex - fromIndex + 4) % 4;
  const counterSteps = (fromIndex - toIndex + 4) % 4;
  const step = clockwiseSteps <= counterSteps ? 1 : -1;
  const count = Math.min(clockwiseSteps, counterSteps);
  const frames = Array.from({ length: count }, (_, index) => Object.freeze({
    atMs: count === 2 ? (index + 1) * 80 : 100,
    facing: CLOCKWISE[(fromIndex + step * (index + 1) + 4) % 4],
  }));
  const turnDurationMs = frames.at(-1)?.atMs ?? 0;
  const pauseDurationMs = 120;
  return Object.freeze({
    frames: Object.freeze(frames), turnDurationMs, pauseDurationMs,
    readyAtMs: turnDurationMs + pauseDurationMs,
  });
}
```

Run the same three-suite command again. Expected: all suites pass; `'react'` is
never used as a `CharacterAnimationId`, the `21 × 4 = 84` tone/render-plan cells
select congruent authored body/portrait slots, missing/unknown tone and atlas
drift fail closed, and every turn-plus-pause schedule is deterministic and at
most `350 ms`.

- [ ] **Step 3: Instantiate and update the camera director**

Add scene fields:

```typescript
private cameraDirector?: CameraDirector;
private cameraFrame = { x: 0, y: 0, zoom: 1 };
private lastRuntimeSnapshotAt = Number.NEGATIVE_INFINITY;
private actorPresentationSession: ActorPresentationSession | null = null;
private readonly actorBodies = new Map<string, ActorBodyState>();
private actorPresentationGeneration = 0;
private actorPresentationTimers: Phaser.Time.TimerEvent[] = [];
private playerAnimationId: CharacterAnimationId = 'idle';
```

After rendering the package and creating actors/player:

```typescript
this.cameraDirector = new CameraDirector(
  this.scenePackage.map.camera,
  this.scenePackage.map.bounds,
  { width: 960, height: 540 },
  this.scenePackage.player.position,
);
this.cameras.main.stopFollow();
if (this.pendingCameraShot) this.cameraDirector.setShot(this.pendingCameraShot);
```

Upgrade the camera command branch from Task 9 so it stores commands received before `create`/`renderWorld` and applies later commands immediately:

```typescript
case 'set-camera-shot':
  this.pendingCameraShot = command.shot;
  this.cameraDirector?.setShot(command.shot);
  return;
```

Add these complete helpers:

```typescript
private actorPositions(): Readonly<Record<string, RuntimePoint>> {
  const positions: Record<string, RuntimePoint> = {};
  if (this.player) positions['player'] = { x: this.player.x, y: this.player.y };
  for (const [actorId, container] of this.npcMarkers) {
    positions[actorId] = { x: container.x, y: container.y };
  }
  return positions;
}

private updateCamera(deltaMs: number): void {
  if (!this.player || !this.cameraDirector) return;
  const frame = this.cameraDirector.step({
    player: { x: this.player.x, y: this.player.y },
    facing: this.playerMotion.facing,
    speedRatio: Math.min(1, Math.hypot(
      this.playerMotion.velocity.x,
      this.playerMotion.velocity.y,
    ) / DEFAULT_PLAYER_TUNING.maxSpeed),
    deltaMs,
    actors: this.actorPositions(),
    reducedMotion: this.preferences.reduceMotion,
  });
  this.cameras.main.setZoom(frame.zoom);
  this.cameras.main.centerOn(frame.focus.x, frame.focus.y);
  this.cameraFrame = { x: frame.focus.x, y: frame.focus.y, zoom: frame.zoom };
}

private emitRuntimeSnapshot(): void {
  if (!this.player) return;
  if (this.time.now - this.lastRuntimeSnapshotAt < 100) return;
  this.lastRuntimeSnapshotAt = this.time.now;
  this.port.emit({
    type: 'runtime-snapshot',
    position: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
    inputLocked: this.inputLock.locked,
    camera: this.cameraFrame,
    playerAnimationId: this.playerAnimationId,
  });
}
```

Add `this.updateCamera(delta); this.emitRuntimeSnapshot();` immediately before the locked branch returns in `update`, and add the same two calls at the very end of the unlocked branch after door checks. Runtime snapshots are intentionally capped at 10 Hz so Angular is not re-entered on every Phaser frame; position persistence remains separately coalesced by `emitPlayerPositionIfChanged`.

Do not call `startFollow`; it would add a second, untested interpolation after `CameraDirector` and reintroduce subpixel swimming.

- [ ] **Step 4: Apply and restore the shared actor state**

Register player and each NPC body when created:

```typescript
this.actorBodies.set('player', {
  actorId: 'player', facing: 'down', pose: 'idle', emotion: 'neutral', speaking: false,
});
```

```typescript
this.actorBodies.set(npc.actorId, {
  actorId: npc.actorId,
  facing: npc.facing,
  pose: 'idle',
  emotion: npc.emotion,
  speaking: false,
});
```

Implement the command target:

```typescript
private setActorPresentation(state: ActorPresentationState | null): void {
  this.clearActorPresentationTimeline();
  if (!state) {
    if (this.actorPresentationSession) {
      const restored = endActorPresentation(this.actorPresentationSession);
      for (const body of Object.values(restored)) this.applyActorBodyState(body);
    }
    this.actorPresentationSession = null;
    this.cameraDirector?.setShot({ kind: 'explore' });
    return;
  }

  const baseline = this.actorPresentationSession?.restore ?? Object.fromEntries(this.actorBodies);
  this.actorPresentationSession = beginActorPresentation(baseline, state, this.actorPositions());
  const speakerIsSpatial = this.actorBodies.has(state.speakerId);
  const actorIds = [state.speakerId, state.listenerId]
    .filter((id): id is string => id !== null && this.actorBodies.has(id));
  this.cameraDirector?.setShot(speakerIsSpatial
    ? { kind: 'conversation', actorIds, paddingPx: 96 }
    : { kind: 'explore' });

  const generation = this.actorPresentationGeneration;
  const startedAt = this.time.now;
  const participantIds = new Set([state.speakerId, state.listenerId].filter(
    (id): id is string => id !== null,
  ));
  const finalBodies = Object.values(this.actorPresentationSession.bodies)
    .filter(body => participantIds.has(body.actorId));
  const timelines = finalBodies.map(body => ({
    body,
    timeline: buildActorTurnTimeline(
      this.actorBodies.get(body.actorId)?.facing ?? body.facing,
      body.facing,
      this.preferences.reduceMotion,
    ),
  }));
  for (const { body, timeline } of timelines) {
    const resting = {
      ...body,
      pose: 'idle' as const,
      consequenceTone: undefined,
      speaking: false,
    };
    if (timeline.frames.length === 0) this.applyActorBodyState(resting);
    for (const frame of timeline.frames) {
      const apply = () => {
        if (generation !== this.actorPresentationGeneration) return;
        this.applyActorBodyState({ ...resting, facing: frame.facing });
      };
      if (frame.atMs === 0) apply();
      else this.actorPresentationTimers.push(this.time.delayedCall(frame.atMs, apply));
    }
  }
  const readyAtMs = Math.max(
    this.preferences.reduceMotion ? 100 : 120,
    ...timelines.map(item => item.timeline.readyAtMs),
  );
  this.actorPresentationTimers.push(this.time.delayedCall(readyAtMs, () => {
    if (generation !== this.actorPresentationGeneration) return;
    for (const body of finalBodies) this.applyActorBodyState(body);
    this.port.emit({
      type: 'actor-presentation-ready',
      dialogueKey: state.dialogueKey,
      speakerId: state.speakerId,
      elapsedMs: Math.round(this.time.now - startedAt),
    });
  }));
}

private clearActorPresentationTimeline(): void {
  this.actorPresentationGeneration += 1;
  for (const timer of this.actorPresentationTimers) timer.remove(false);
  this.actorPresentationTimers = [];
}

private applyActorBodyState(body: ActorBodyState): void {
  this.actorBodies.set(body.actorId, body);
  if (body.actorId === 'player') {
    this.playerMotion = { ...this.playerMotion, facing: body.facing };
    this.applyPlayerBodyPose(body.facing, body.pose, body.consequenceTone ?? null);
    return;
  }
  this.applyNpcBodyPose(
    body.actorId,
    body.facing,
    body.pose,
    body.consequenceTone ?? null,
  );
}
```

Call `clearActorPresentationTimeline()` before every `renderWorld` teardown and
from the Phaser shutdown handler. Only speaker/listener bodies turn; ambient
actors keep their authored motion state. The clockwise tie rule makes a 180°
turn visible in two authored cardinal poses (`80` and `160 ms`), then holds the
final idle pose for `120 ms` before talk/react begins. Reduced motion applies the
target pose without interpolation and retains a static `100 ms` human pause.
Non-spatial narrators also wait `100–120 ms` and emit the same typed event. No
DOM timer or dialogue-owned fallback may emit `actor-presentation-ready`.

Replace the temporary Task 9 player pose guard and every legacy NPC walk-boolean
path with the same typed resolver. Import `ConsequenceTone` from its neutral
Plan 1 owner at `core/models/consequence-tone.model.ts`; do not redeclare it in
the runtime:

```typescript
private applyPlayerBodyPose(
  direction: CardinalDirection,
  pose: ActorBodyPose,
  consequenceTone: ConsequenceTone | null = null,
): void {
  if (!this.playerSprite) return;
  const { animationId } = resolveActorAnimation(
    this.avatarPlan,
    pose,
    consequenceTone,
  );
  const animation = this.avatarPlan.animations[animationId];
  const sheet = this.avatarPlan.sheets[animation.sheetId];
  this.playerAnimationId = animationId;
  if (this.preferences.reduceMotion && animationId !== 'walk') {
    this.playerSprite.stop().setTexture(sheet.textureKey)
      .setFrame(animation.directions[direction][0]);
    return;
  }
  this.playerSprite.play(this.animationKey('player', animationId, direction), true);
}

private applyNpcBodyPose(
  actorId: string,
  direction: CardinalDirection,
  pose: ActorBodyPose,
  consequenceTone: ConsequenceTone | null,
): void {
  const sprite = this.npcSprites.get(actorId);
  const plan = this.npcRenderPlans.get(actorId);
  if (!sprite || !plan) throw new Error(`No rendered ActorRenderPlan for ${actorId}`);
  const { animationId } = resolveActorAnimation(plan, pose, consequenceTone);
  const animation = plan.animations[animationId];
  const sheet = plan.sheets[animation.sheetId];
  if (this.preferences.reduceMotion && animationId !== 'walk') {
    sprite.stop().setTexture(sheet.textureKey).setFrame(animation.directions[direction][0]);
    return;
  }
  sprite.play(this.animationKey(actorId, animationId, direction), true);
}
```

Both methods must import and call `resolveActorAnimation`; there is no separate
player/NPC emotion table and no default reaction. The host's
`data-player-animation` comes from `runtime-snapshot`, so each of the four exact
`ConsequenceTone` branches can be asserted without inspecting Phaser internals.
An unmapped, missing or misplaced tone is a blocking contract error, never a
request to guess from clinical copy.

Add this helper and call it from both ambient mover loops with their actor ID,
resolved facing and collision result's `actual` vector:

```typescript
private applyNpcLocomotion(
  actorId: string,
  facing: CardinalDirection,
  actual: RuntimePoint,
): void {
  const current = this.actorBodies.get(actorId);
  if (!current) throw new Error(`Missing ActorBodyState for mover ${actorId}`);
  const pose: ActorBodyPose = Math.hypot(actual.x, actual.y) > 0.001 ? 'walk' : 'idle';
  this.actorBodies.set(actorId, { ...current, facing, pose, consequenceTone: undefined });
  this.applyNpcBodyPose(actorId, facing, pose, null);
}
```

Replace every remaining `applyNpcPose`, `setTint`, preset-frame and boolean-walk
call with this path. An NPC pressing into a solid therefore displays idle feet,
just like the player.

The bodyless reducer path is intentional for documents, scenery observations and system narration: their stable dialogue speaker IDs do not correspond to world actors, so the session still preserves `presentation.dialogueKey` for UI coordination while Phaser restores bodies and keeps explore framing. Authored PERSON/NPC ID mismatches remain caught earlier by the `ScenePackageV1` mapper and end-to-end dialogue coverage.

Upgrade the actor command branch from Task 9 so it is both replayable before world creation and live afterward:

```typescript
case 'set-actor-presentation':
  this.pendingActorPresentation = command.state;
  if (this.player) this.setActorPresentation(command.state);
  return;
```

At the end of `renderWorld`, after the player/NPC body map and `CameraDirector` exist, replay the stored state in command order:

```typescript
if (this.pendingActorPresentation) this.setActorPresentation(this.pendingActorPresentation);
if (this.pendingCameraShot) this.cameraDirector?.setShot(this.pendingCameraShot);
```

The last line preserves the `GameWorldPort` flush order (`set-actor-presentation`, then `set-camera-shot`) when both commands arrived before Phaser became ready.

While `actorPresentationSession` is non-null, the same `InputLockState` already blocks movement/NPC updates. Do not add a dialogue-only pause flag.

- [ ] **Step 5: Export a single reusable E2E world-entry helper**

In `frontend/e2e/support/siep-flow.ts`, add:

```typescript
export async function enterPlayableWorld(page: Page): Promise<Locator> {
  await page.goto('/portal/jugar');
  const consent = await enterCaseAtContentWarning(page);
  const introVideo = await acceptContentWarning(page, consent);
  const caseIntro = await finishCaseIntroduction(page, introVideo);
  await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
  await expect(caseIntro).toBeHidden({ timeout: 30_000 });
  await waitForWorldReady(page);
  return page.locator('app-game-world .phaser-host[data-world-ready="true"]');
}
```

- [ ] **Step 6: Write the real runtime E2E**

Create `frontend/e2e/world-runtime.e2e.ts`:

```typescript
import { expect, test, type Request } from '@playwright/test';
import { enterPlayableWorld, loginStudent } from './support/siep-flow';

test('journal lock freezes held movement and emits no new position request', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await loginStudent(page);
  const host = await enterPlayableWorld(page);
  await page.waitForTimeout(700); // drain the pre-overlay position debounce

  await page.keyboard.press('j');
  await expect(host).toHaveAttribute('data-input-locked', 'true');
  const before = await host.evaluate(element => ({
    x: element.getAttribute('data-player-x'),
    y: element.getAttribute('data-player-y'),
  }));
  let positionRequests = 0;
  const count = (request: { method(): string; url(): string }) => {
    if (request.method() === 'PATCH' && /\/world-state$/.test(new URL(request.url()).pathname)) {
      positionRequests += 1;
    }
  };
  page.on('request', count);
  try {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(900);
    await page.keyboard.up('ArrowRight');
  } finally {
    page.off('request', count);
  }
  const after = await host.evaluate(element => ({
    x: element.getAttribute('data-player-x'),
    y: element.getAttribute('data-player-y'),
  }));
  expect(after).toEqual(before);
  expect(positionRequests).toBe(0);
});

test('live movement responds, camera remains integer and stop is short', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await loginStudent(page);
  const host = await enterPlayableWorld(page);
  await expect(host).toHaveAttribute('data-input-locked', 'false');
  const beforeX = Number(await host.getAttribute('data-player-x'));

  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => Number(await host.getAttribute('data-player-x')))
    .toBeGreaterThan(beforeX);
  await page.waitForTimeout(350);
  await page.keyboard.up('ArrowRight');
  const releasedX = Number(await host.getAttribute('data-player-x'));
  await page.waitForTimeout(250);
  const stoppedX = Number(await host.getAttribute('data-player-x'));
  expect(stoppedX - releasedX).toBeLessThanOrEqual(8);

  for (const name of ['data-camera-x', 'data-camera-y', 'data-camera-zoom']) {
    const value = Number(await host.getAttribute(name));
    expect(Number.isInteger(value), `${name}=${value}`).toBe(true);
  }
});

test('editor and live Phaser host expose the same avatar plan identity', async ({ page }) => {
  await page.goto('/login');
  await loginStudent(page);
  await page.goto('/portal/personaje');
  const preview = page.locator('app-character-editor .ce-stage .viewport');
  await expect(preview).toBeVisible();
  const characterId = await preview.getAttribute('data-character-id');
  const contentHash = await preview.getAttribute('data-content-hash');
  expect(characterId).toBeTruthy();
  expect(contentHash).toMatch(/^[a-f0-9]{64}$/);

  const host = await enterPlayableWorld(page);
  await expect(host).toHaveAttribute('data-character-id', characterId!);
  await expect(host).toHaveAttribute('data-character-hash', contentHash!);
  await expect(host).toHaveAttribute('data-scene-hash', /^[a-f0-9]{64}$/);
  await expect(host).toHaveAttribute(
    'data-scene-instance-key',
    /^[^:]+:[^:]+:\d+:[a-f0-9]{64}$/,
  );
});
```

In `siep-flow.ts`, add `Request` to its existing Playwright type import
(`import type { Locator, Page, Request, Response } from '@playwright/test'`) and add
one shared assertion used by all real overlay routes:

```typescript
export async function assertHeldWorldInputIsInert(
  page: Page,
  host = page.locator('app-game-world .phaser-host'),
): Promise<void> {
  await page.waitForTimeout(700); // drain a legitimate pre-lock debounce
  const mounted = await host.count() > 0;
  const snapshot = async () => mounted ? host.evaluate(element => ({
    x: element.getAttribute('data-player-x'),
    y: element.getAttribute('data-player-y'),
    animation: element.getAttribute('data-player-animation'),
    scene: element.getAttribute('data-scene-instance-key'),
  })) : null;
  const before = await snapshot();
  let patches = 0;
  const count = (request: Request) => {
    if (request.method() === 'PATCH'
      && /\/api\/simulation\/attempts\/[^/]+\/world-state$/.test(new URL(request.url()).pathname)) {
      patches += 1;
    }
  };
  page.on('request', count);
  try {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(900);
    await page.keyboard.up('ArrowRight');
  } finally {
    page.off('request', count);
  }
  if (mounted) {
    await expect(host).toHaveAttribute('data-input-locked', 'true');
    expect(await snapshot()).toEqual(before);
  } else {
    await expect(page.locator('app-game-world .phaser-host[data-world-ready="true"]'))
      .toHaveCount(0);
  }
  expect(patches).toBe(0);
}
```

Use that helper against every concrete `InputLockSources` branch—never by
setting an Angular signal from the test:

- `consent-gate.e2e.ts`: call it while the real resume prompt, content warning,
  intro video and case-introduction dialogs are each visible; assert the same
  dialog remains visible after the held key. Create the resume state through the
  public attempt API, reload, and test before clicking its existing resume
  button.
- `world-runtime.e2e.ts`: replace the inline journal assertion with the helper;
  repeat after opening the real settings dialog and after
  `openFamilyDialogue`. For `busy`, hold the public open-interaction response in
  a Playwright route promise, start `openFamilyDialogue` without awaiting it,
  assert the host locks while the request is pending, run the helper, release
  the response, then await the dialogue. The handler is removed in `finally`.
- `full-case.e2e.ts`: once the existing real completion route displays
  `alertdialog` “Intento finalizado”, call the helper before any retry/link
  action and prove the outcome stays visible.

Together with the table-driven unit test, this covers all nine sources:
`resumePrompt`, `contentWarning`, `introVideo`, `caseIntro`, `dialogue`,
`journal`, `settings`, `outcome`, and `busy`. Each live assertion freezes player
coordinates, animation id, scene identity and world-state PATCH traffic; the
unit table additionally proves NPC, door and interaction channels use the same
lock.

Add a door-transition E2E beside those lock cases, reusing the movement and
`enterDoor` route already exercised by `full-case.e2e.ts`:

1. Record origin `data-scene-instance-key`, player coordinates and the first
   visible EXIT's expected target/entry from its real `enter-room` response.
2. Delay that response `600 ms`. At the instant the POST is observed, assert
   `data-room-transition-phase="covered"`, `data-input-locked="true"`, and that
   exactly one POST exists; the request is forbidden during `covering`.
3. Release it and assert a different scene identity, the returned map key and
   exact server `player.x/y`; then require `revealing → idle`, unlock, and no
   old-room PATCH after the POST.
4. In a fresh attempt, abort the same POST. Assert the origin scene identity and
   position survive, the camera reveals it within `1.2 s`, the phase returns to
   `idle`, the lock clears, and the localized recoverable error is visible.

The test must read only DOM evidence and public network traffic. It may not
reach into Phaser, override Angular signals or manufacture a scene package.

- [ ] **Step 7: Run focused unit, E2E and build gates**

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime
npm run build:frontend
npm run test:e2e -- consent-gate.e2e.ts world-runtime.e2e.ts full-case.e2e.ts --project=chromium --retries=0
```

Expected: all unit suites, build and every selected Playwright test exit `0`.
Evidence covers all nine real lock sources, successful and failed authoritative
door transitions, zero forbidden position PATCH, identical editor/runtime
character identity/hash, every ordinary pose, all four exact consequence tones,
all fail-closed resolver cases, and every actor turn schedule within `350 ms`.

- [ ] **Step 8: Commit camera/actor integration**

```powershell
git add frontend/src/app/features/simulator/game-world.component.ts frontend/src/app/features/simulator/runtime/actor-presentation.model.spec.ts frontend/src/app/features/simulator/runtime/actor-animation-resolver.ts frontend/src/app/features/simulator/runtime/actor-animation-resolver.spec.ts frontend/src/app/features/simulator/runtime/actor-presentation-timeline.ts frontend/src/app/features/simulator/runtime/actor-presentation-timeline.spec.ts frontend/e2e/support/siep-flow.ts frontend/e2e/world-runtime.e2e.ts frontend/e2e/consent-gate.e2e.ts frontend/e2e/full-case.e2e.ts
git commit -m "feat(game): sincronizar camara y actores"
```

### Task 12: Add standard gamepad input, reduced-motion behavior and live latency evidence

**Files:**

- Create: `frontend/src/app/features/simulator/runtime/gamepad-input.ts`
- Create: `frontend/src/app/features/simulator/runtime/gamepad-input.spec.ts`
- Create: `frontend/src/app/features/simulator/runtime/input-latency-probe.ts`
- Create: `frontend/src/app/features/simulator/runtime/input-latency-probe.spec.ts`
- Modify: `frontend/src/app/features/simulator/runtime/game-world.port.ts`
- Modify: `frontend/src/app/features/simulator/runtime/game-world.port.spec.ts`
- Modify: `frontend/src/app/features/simulator/runtime/camera-director.ts`
- Modify: `frontend/src/app/features/simulator/runtime/camera-director.spec.ts`
- Modify: `frontend/src/app/features/simulator/game-world.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`
- Modify: `frontend/e2e/world-runtime.e2e.ts`

- [ ] **Step 1: Write red tests for dead zone, lock, latency and reduced motion**

```typescript
import { gamepadFrame } from './gamepad-input';

const pad = (x: number, y: number, pressed = false) => ({
  connected: true,
  axes: [x, y],
  buttons: [{ pressed }],
});

it('applies a dead zone and normalizes a diagonal gamepad vector', () => {
  expect(gamepadFrame(pad(.12, -.1))).toMatchObject({
    direction: { x: 0, y: 0 }, confirmDown: false,
  });
  const frame = gamepadFrame(pad(.9, -.9));
  expect(Math.hypot(frame.direction.x, frame.direction.y)).toBeCloseTo(1, 5);
});

it('zeros every gamepad action while player and interaction channels are locked', () => {
  expect(gamepadFrame(pad(1, 0, true), {
    player: true, interactions: true,
  })).toMatchObject({ direction: { x: 0, y: 0 }, confirmDown: false });
});
```

```typescript
import { InputLatencyProbe } from './input-latency-probe';

it('records only the first displaced frame and reports p95', () => {
  const probe = new InputLatencyProbe(20);
  [12, 16, 18, 22, 40].forEach((latency, index) => {
    probe.begin(100 * index);
    probe.displaced(100 * index + latency);
    probe.displaced(100 * index + latency + 5);
  });
  expect(probe.snapshot()).toEqual({ samples: 5, p95Ms: 40, longestMs: 40 });
});
```

In `simulation-play.consent-gate.spec.ts`, inject a controllable `MediaQueryList`
and assert these exact states: OS `false` + internal toggle `false` yields
`effectiveReducedMotion() === false`; either source `true` yields `true`; an OS
change to `true` updates the signal and the game-world input without recreating
the component. Also assert `CameraDirector.step` receives the effective boolean;
Task 8 already proves zero look-ahead and immediate bounded settling.

```typescript
const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();
let osReducedMotion = false;
jest.spyOn(window, 'matchMedia').mockImplementation(() => ({
  matches: osReducedMotion,
  media: '(prefers-reduced-motion: reduce)',
  onchange: null,
  addEventListener: (_type, listener) => mediaListeners.add(listener as (event: MediaQueryListEvent) => void),
  removeEventListener: (_type, listener) => mediaListeners.delete(listener as (event: MediaQueryListEvent) => void),
  addListener: jest.fn(), removeListener: jest.fn(), dispatchEvent: jest.fn(),
}) as unknown as MediaQueryList);

component.userReducedMotion.set(true);
expect(component.effectiveReducedMotion()).toBe(true);
component.userReducedMotion.set(false);
osReducedMotion = true;
for (const listener of mediaListeners) listener({ matches: true } as MediaQueryListEvent);
expect(component.effectiveReducedMotion()).toBe(true);
```

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/gamepad-input.spec.ts src/app/features/simulator/runtime/input-latency-probe.spec.ts src/app/features/simulator/runtime/camera-director.spec.ts src/app/features/simulator/simulation-play.consent-gate.spec.ts
```

Expected: FAIL because the two modules and reduced-motion option do not exist.

- [ ] **Step 2: Implement one normalized controller frame and latency probe**

```typescript
export interface RuntimeGamepadFrame {
  direction: { x: number; y: number };
  confirmDown: boolean;
}

export interface RuntimeGamepadSnapshot {
  connected: boolean;
  axes: ReadonlyArray<number>;
  buttons: ReadonlyArray<{ pressed: boolean }>;
}

export function gamepadFrame(
  pad: RuntimeGamepadSnapshot | null,
  lock = { player: false, interactions: false },
  deadZone = .18,
): RuntimeGamepadFrame {
  if (!pad?.connected) return { direction: { x: 0, y: 0 }, confirmDown: false };
  const axisX = pad.axes[0] ?? 0;
  const axisY = pad.axes[1] ?? 0;
  const rawX = Math.abs(axisX) >= deadZone ? axisX : 0;
  const rawY = Math.abs(axisY) >= deadZone ? axisY : 0;
  const length = Math.hypot(rawX, rawY);
  const direction = lock.player || length === 0
    ? { x: 0, y: 0 }
    : { x: rawX / Math.max(1, length), y: rawY / Math.max(1, length) };
  return {
    direction,
    confirmDown: !lock.interactions && Boolean(pad.buttons[0]?.pressed),
  };
}
```

```typescript
export class InputLatencyProbe {
  private pendingAt: number | null = null;
  private readonly samples: number[] = [];
  constructor(private readonly capacity = 120) {}

  begin(at: number): void {
    if (this.pendingAt === null) this.pendingAt = at;
  }

  displaced(at: number): void {
    if (this.pendingAt === null) return;
    this.samples.push(Math.max(0, at - this.pendingAt));
    if (this.samples.length > this.capacity) this.samples.shift();
    this.pendingAt = null;
  }

  cancel(): void { this.pendingAt = null; }

  snapshot() {
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p95 = sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? 0;
    return { samples: sorted.length, p95Ms: p95, longestMs: sorted.at(-1) ?? 0 };
  }
}
```

Replace the component's conflated `reduceMotion` signal with one OS source, one
user source and one effective policy:

```typescript
private readonly reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
readonly systemReducedMotion = signal(this.reducedMotionMedia.matches);
readonly userReducedMotion = signal(false);
readonly effectiveReducedMotion = computed(
  () => this.systemReducedMotion() || this.userReducedMotion(),
);
private readonly onReducedMotionChange = (event: MediaQueryListEvent): void => {
  this.systemReducedMotion.set(event.matches);
};
```

Register `this.reducedMotionMedia.addEventListener('change', this.onReducedMotionChange)`
in `ngOnInit` before character loading, and remove that exact listener in
`ngOnDestroy`. Replace every parent binding that previously passed
`reduceMotion()` to HUD, dialogue and `app-game-world` with
`effectiveReducedMotion()`. `toggleReduceMotion()` toggles only
`userReducedMotion`; if the OS source is active, the effective result remains
`true`. The Phaser scene receives only the boolean command and never calls
`matchMedia` itself. Do not disable player control, authored information or
collision updates.

- [ ] **Step 3: Poll the Gamepad API through the existing input authority**

In the live update, read only `navigator.getGamepads?.()[0]`, merge its normalized
direction with keyboard/touch before `stepPlayerController`, edge-detect button 0
  for the existing confirm/interact command, and pass the same `InputLockState`. Do not let
Phaser register a second gamepad listener. When the lock activates, cancel the
latency probe and zero velocity in the same frame.

On keyboard/gamepad transition from neutral to active call `latency.begin` with
the event/high-resolution timestamp; after the first accepted collision-resolved
displacement call `latency.displaced(performance.now())`. Extend the typed
`runtime-snapshot` event with:

```typescript
inputLatency: { samples: number; p95Ms: number; longestMs: number };
```

Populate it with `latency.snapshot()`. In `GameWorldComponent`, store that value
in a signal and expose only aggregate, non-sensitive evidence on the existing
host as `data-input-samples`, `data-input-p95-ms` and
`data-input-longest-ms`. This avoids a production global test hook and does not
depend on the later checkpoint plan's E2E environment file.

```typescript
// add to the Task 11 runtime-snapshot payload
inputLatency: this.latency.snapshot(),
```

```typescript
readonly inputLatency = signal({ samples: 0, p95Ms: 0, longestMs: 0 });

// inside the existing runtime-snapshot adapter branch
this.inputLatency.set(event.inputLatency);
```

```html
[attr.data-input-samples]="inputLatency().samples"
[attr.data-input-p95-ms]="inputLatency().p95Ms"
[attr.data-input-longest-ms]="inputLatency().longestMs"
```

- [ ] **Step 4: Add browser assertions for gamepad, reduced motion and p95**

In `world-runtime.e2e.ts`, install a deterministic `navigator.getGamepads` stub
with `page.addInitScript` before navigation and a test-only setter on `window`.
Prove: right axis moves; diagonal distance is within 3% of cardinal; button 0
interacts once; holding the axis behind a real dialogue changes neither player
position nor PATCH count. In a separate context use
`page.emulateMedia({ reducedMotion: 'reduce' })` and assert the runtime host
reports `data-reduced-motion="true"`, camera focus has no look-ahead or animated
settle, and normal control/collision still work. Repeat with OS preference
`no-preference`, activate the HUD toggle and assert the same DOM/API behavior.

Use this exact test seam; it exists only inside the Playwright document and does
not add a production global:

```typescript
type FakePadFrame = { axes?: [number, number]; pressed?: number[]; connected?: boolean };

async function installStandardGamepad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let frame = { axes: [0, 0] as [number, number], pressed: [] as number[], connected: true };
    (window as any).__SIEP_SET_GAMEPAD__ = (next: {
      axes?: [number, number]; pressed?: number[]; connected?: boolean;
    }) => { frame = { ...frame, ...next }; };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => frame.connected ? [{
        id: 'SIEP Standard Test Pad', index: 0, connected: true,
        mapping: 'standard', timestamp: performance.now(), axes: [...frame.axes],
        buttons: Array.from({ length: 17 }, (_, index) => ({
          pressed: frame.pressed.includes(index),
          touched: frame.pressed.includes(index),
          value: frame.pressed.includes(index) ? 1 : 0,
        })),
        vibrationActuator: null,
      }] : [],
    });
  });
}

async function setStandardGamepad(page: Page, frame: FakePadFrame): Promise<void> {
  await page.evaluate(value => (window as any).__SIEP_SET_GAMEPAD__(value), frame);
}
```

Call `installStandardGamepad(page)` before the first `goto`. For every button
assertion, publish `pressed:[n]`, wait one RAF-visible edge, then publish
`pressed:[]`; holding a button must never create a second semantic action. The
movement test records `data-player-x/y`, holds `[1,0]` for `500 ms`, neutralizes,
repeats from a fresh identical world with `[1,1]`, and compares Euclidean
distance (`abs(diagonal/cardinal - 1) <= .03`). Count the real interaction POST
to prove button `0` fires exactly once. While a real dialogue is visible, keep
axes `[1,0]` for `900 ms` and assert the shared lock helper's coordinate,
animation and PATCH snapshot remains unchanged before neutralizing in `finally`.

Generate at least 20 neutral-to-keyboard motion samples, then assert:

```typescript
await expect.poll(async () => Number(await host.getAttribute('data-input-samples')))
  .toBeGreaterThanOrEqual(20);
expect(Number(await host.getAttribute('data-input-p95-ms'))).toBeLessThanOrEqual(50);
```

- [ ] **Step 5: Run and commit the complete input gate**

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/gamepad-input.spec.ts src/app/features/simulator/runtime/input-latency-probe.spec.ts src/app/features/simulator/runtime/camera-director.spec.ts src/app/features/simulator/simulation-play.consent-gate.spec.ts
npm run test:e2e -- world-runtime.e2e.ts --project=chromium --retries=0
```

Expected: PASS; standard keyboard, touch and gamepad all use one motion/lock
authority, reduced motion is informative rather than blank, and live p95 is at
most 50 ms.

```powershell
git add frontend/src/app/features/simulator/runtime/gamepad-input.ts frontend/src/app/features/simulator/runtime/gamepad-input.spec.ts frontend/src/app/features/simulator/runtime/input-latency-probe.ts frontend/src/app/features/simulator/runtime/input-latency-probe.spec.ts frontend/src/app/features/simulator/runtime/game-world.port.ts frontend/src/app/features/simulator/runtime/game-world.port.spec.ts frontend/src/app/features/simulator/runtime/camera-director.ts frontend/src/app/features/simulator/runtime/camera-director.spec.ts frontend/src/app/features/simulator/game-world.component.ts frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts frontend/e2e/world-runtime.e2e.ts
git commit -m "feat(game): unificar mando latencia y movimiento reducido"
```

### Task 13: Add persistent conflict-safe remapping and one semantic input router

**Files:**

- Modify: `scripts/runtime-boundary.test.mjs`
- Create: `frontend/src/app/features/simulator/runtime/input-bindings.ts`
- Create: `frontend/src/app/features/simulator/runtime/input-bindings.spec.ts`
- Create: `frontend/src/app/features/simulator/runtime/input-binding.store.ts`
- Create: `frontend/src/app/features/simulator/runtime/input-binding.store.spec.ts`
- Create: `frontend/src/app/features/simulator/runtime/game-input-router.service.ts`
- Create: `frontend/src/app/features/simulator/runtime/game-input-router.service.spec.ts`
- Modify: `frontend/src/app/features/simulator/runtime/gamepad-input.ts`
- Modify: `frontend/src/app/features/simulator/runtime/gamepad-input.spec.ts`
- Modify: `frontend/src/app/features/simulator/game-world.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`
- Modify: `frontend/src/app/features/simulator/simulation-hud.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-hud.component.spec.ts`
- Modify: `frontend/e2e/world-runtime.e2e.ts`

- [ ] **Step 1: Write red tests for defaults, remapping, conflict and isolation**

```typescript
import {
  BindingConflictError,
  DEFAULT_INPUT_BINDINGS,
  rebindInput,
} from './input-bindings';

it('ships WASD, arrows and standard XInput defaults', () => {
  expect(DEFAULT_INPUT_BINDINGS.actions.up).toEqual({
    keyCodes: ['KeyW', 'ArrowUp'],
    gamepadButtons: [12],
  });
  expect(DEFAULT_INPUT_BINDINGS.actions.confirm.gamepadButtons).toEqual([0]);
  expect(DEFAULT_INPUT_BINDINGS.actions.cancel.gamepadButtons).toEqual([1]);
  expect(Object.isFrozen(DEFAULT_INPUT_BINDINGS.actions.up.keyCodes)).toBe(true);
  expect(() => {
    (DEFAULT_INPUT_BINDINGS.actions.up.keyCodes as string[])[0] = 'KeyX';
  }).toThrow(TypeError);
});

it('immutably remaps one slot and preserves its alternate', () => {
  const next = rebindInput(
    DEFAULT_INPUT_BINDINGS, 'confirm', 'keyboard', 0, 'KeyF',
  );
  expect(next.actions.confirm.keyCodes).toEqual(['KeyF', 'Space', 'Enter']);
  expect(DEFAULT_INPUT_BINDINGS.actions.confirm.keyCodes[0]).toBe('KeyE');
});

it('rejects a binding already owned by another semantic action', () => {
  expect(() => rebindInput(
    DEFAULT_INPUT_BINDINGS, 'confirm', 'keyboard', 0, 'Escape',
  )).toThrow(new BindingConflictError('Escape', 'cancel'));
});
```

In `input-binding.store.spec.ts`, connect as `user-a`, remap `confirm`, reconnect
and prove persistence; connect as `user-b` in the same `localStorage` and prove
defaults. Seed malformed JSON and an unsupported `schemaVersion`, then prove a
safe reset with no exception and no reuse across users.

In `game-input-router.service.spec.ts`, use fake document/gamepad/RAF ports and
prove all of these exact behaviors:

- a held key creates one UI edge but a continuous analog-compatible movement vector;
- `KeyboardEvent.repeat` never creates repeated confirm/cancel actions;
- events originating in `input`, `textarea`, `select` or contenteditable are
  ignored unless the HUD has explicitly entered capture mode;
- XInput axis and remapped D-pad normalize diagonals within 3%;
- `sampleMovement` returns `{ direction, confirmPressed, startedAt }`; the same A
  button becomes one world confirm edge or one dialogue semantic confirm based
  on scope, while `InputLockState` zeros locomotion and world interaction;
- the first neutral-to-active keyboard/gamepad timestamp survives unchanged as
  `startedAt` until the collision-resolved frame consumes it;
- `disconnect()` removes listeners, cancels RAF and clears held controls.

- [ ] **Step 2: Run the red gate**

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/input-bindings.spec.ts src/app/features/simulator/runtime/input-binding.store.spec.ts src/app/features/simulator/runtime/game-input-router.service.spec.ts
```

Expected: FAIL because the binding contract, repository and router do not exist.

- [ ] **Step 3: Implement the versioned binding contract and conflict result**

```typescript
export type GameInputAction =
  | 'up' | 'down' | 'left' | 'right'
  | 'confirm' | 'cancel' | 'choice1' | 'choice2' | 'choice3' | 'choice4'
  | 'journal' | 'settings' | 'pause';

export interface ActionBinding {
  readonly keyCodes: readonly string[];
  readonly gamepadButtons: readonly number[];
}

export interface InputBindingsV1 {
  readonly schemaVersion: 1;
  readonly actions: Readonly<Record<GameInputAction, ActionBinding>>;
}

function deepFreezeBindings<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreezeBindings(child);
    }
    Object.freeze(value);
  }
  return value;
}

export const DEFAULT_INPUT_BINDINGS: InputBindingsV1 = deepFreezeBindings({
  schemaVersion: 1,
  actions: {
    up: { keyCodes: ['KeyW', 'ArrowUp'], gamepadButtons: [12] },
    down: { keyCodes: ['KeyS', 'ArrowDown'], gamepadButtons: [13] },
    left: { keyCodes: ['KeyA', 'ArrowLeft'], gamepadButtons: [14] },
    right: { keyCodes: ['KeyD', 'ArrowRight'], gamepadButtons: [15] },
    confirm: { keyCodes: ['KeyE', 'Space', 'Enter'], gamepadButtons: [0] },
    cancel: { keyCodes: ['Escape'], gamepadButtons: [1] },
    choice1: { keyCodes: ['Digit1'], gamepadButtons: [] },
    choice2: { keyCodes: ['Digit2'], gamepadButtons: [] },
    choice3: { keyCodes: ['Digit3'], gamepadButtons: [] },
    choice4: { keyCodes: ['Digit4'], gamepadButtons: [] },
    journal: { keyCodes: ['KeyJ'], gamepadButtons: [3] },
    settings: { keyCodes: ['KeyO'], gamepadButtons: [2] },
    pause: { keyCodes: ['KeyP'], gamepadButtons: [9] },
  },
});

export function formatControlCode(code: string): string {
  const names: Readonly<Record<string, string>> = {
    ArrowUp: 'Flecha arriba', ArrowDown: 'Flecha abajo',
    ArrowLeft: 'Flecha izquierda', ArrowRight: 'Flecha derecha',
    Space: 'Espacio', Enter: 'Enter', Escape: 'Escape',
  };
  const known = names[code];
  if (known) return known;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return code;
}

export class BindingConflictError extends Error {
  constructor(
    readonly value: string | number,
    readonly conflictingAction: GameInputAction,
  ) {
    super(`Control ${String(value)} already belongs to ${conflictingAction}`);
  }
}
```

Implement `rebindInput(bindings, action, device, slot, value)` as a pure
function. Validate `KeyboardEvent.code` as a non-empty string and gamepad button
as an integer from 0 through 16. Search every *other* action on the same device;
throw `BindingConflictError` before changing anything. Replace only the selected
slot, preserve the remaining alternates, de-duplicate the selected action and
return a deep-frozen clone. Add `validateInputBindings` that requires exactly
the thirteen action keys, requires at least one keyboard or gamepad binding per
action (and a primary keyboard binding for movement/confirm/journal/settings),
and rejects missing, extra, duplicate or invalid values.

- [ ] **Step 4: Persist per-user bindings and centralize keyboard/gamepad sampling**

`InputBindingStore` uses exactly
`siep:input-bindings:v1:<authenticated-user-id>` and exposes:

```typescript
readonly bindings: Signal<InputBindingsV1>;
connect(userId: string): void;
rebind(action: GameInputAction, device: 'keyboard' | 'gamepad', slot: number, value: string | number): void;
reset(): void;
disconnect(): void;
```

The stored object contains bindings only—never attempt tokens, email or display
name. `connect` validates before publishing; malformed/old data is removed and
defaults are used. `InputBindingStore.disconnect` clears the in-memory user id
and republishes deeply frozen defaults; `GameInputRouterService.disconnect`
clears held keyboard/gamepad state.

Add `GameInputRouterService` and `InputBindingStore` to
`SimulationPlayComponent.providers`. After `AuthService.currentUser()` is
validated, call `inputBindingStore.connect(String(user.id))` once and then
`inputRouter.connect(inputBindingStore.bindings)`. In `ngOnDestroy`, call
`inputRouter.disconnect()` followed by `inputBindingStore.disconnect()`; an
account change must run the same disconnect/connect sequence before publishing
new bindings.

`GameInputRouterService`, provided once by `SimulationPlayComponent`, is the only
owner of `keydown`, `keyup` and `navigator.getGamepads`. Its public boundary is:

```typescript
export type GameInputScope = 'world' | 'dialogue' | 'overlay';

export interface RoutedInputAction {
  readonly action: GameInputAction;
  readonly source: 'keyboard' | 'gamepad';
  readonly sequence: number;
  readonly startedAt: number;
  readonly scope: GameInputScope;
}

export interface RoutedMovementFrame {
  readonly direction: { readonly x: number; readonly y: number };
  readonly confirmPressed: boolean;
  /** Present once on the neutral-to-active locomotion edge; high-resolution ms. */
  readonly startedAt: number | null;
}

readonly action$: Observable<RoutedInputAction>;
connect(bindings: Signal<InputBindingsV1>): void;
setScope(scope: GameInputScope): void;
sampleMovement(lock: InputLockState): RoutedMovementFrame;
beginCapture(device: 'keyboard' | 'gamepad'): Observable<string | number>;
cancelCapture(): void;
disconnect(): void;
```

Poll one `mapping === 'standard'` pad per RAF. Axes use Task 12's `.18` dead
zone; bound D-pad buttons are digital fallbacks. Emit semantic actions only on a
neutral-to-pressed edge. Capture mode consumes the next valid code/button and
emits no normal action. Keep `pendingMovementStartedAt` and
`pendingWorldConfirm` inside the router. A key event contributes its
`event.timeStamp`; a gamepad neutral-to-active edge contributes
`performance.now()`. `sampleMovement` consumes each pending value once, merges
keyboard, D-pad and axes, normalizes once, and applies
`InputLockState.channels.player` and `.interactions` (plural). It returns this
exact locked frame whenever scope is not `world` or the corresponding channel
is locked:

```typescript
const LOCKED_WORLD_FRAME: RoutedMovementFrame = Object.freeze({
  direction: Object.freeze({ x: 0, y: 0 }),
  confirmPressed: false,
  startedAt: null,
});
```

Successful or cancelled capture clears keyboard/gamepad held state and arms a
neutral latch; no captured control becomes gameplay input until its key/button
has been observed released once. Add that case to the router fake-port spec.

Refactor `gamepad-input.ts` in this task so it exports only
`normalizeGamepadAxes(pad, deadZone): {x:number; y:number}`; remove the temporary
hardcoded button-0 `confirmDown` result from Task 12. Update its spec to prove
dead-zone/diagonal normalization only. The router reads every remapped gamepad
button from `InputBindingsV1`, so no lower-level helper may assign semantic
meaning to a button index.

When locomotion becomes neutral, clear an unconsumed movement timestamp; when
any lock activates, clear both pending edges and held movement for the sampled
frame. The router never calls gameplay services or DOM buttons.

Delete the direct Phaser `createCursorKeys`, `addKeys` and Gamepad API polling
introduced earlier in the plan. Inject the single router into
`GameWorldComponent` and give the scene this callback:

```typescript
private readonly inputRouter = inject(GameInputRouterService);
private readonly readInput = (): RoutedMovementFrame =>
  this.inputRouter.sampleMovement(this.inputLock());
private readonly readConfirmControlLabel = (): string => this.confirmControlLabel();

// DataDrivenWorldScene constructor argument
new DataDrivenWorldScene(
  this.port,
  avatarPlan,
  this.readInput,
  this.readConfirmControlLabel,
)
```

Replace the Task 10 keyboard block in `DataDrivenWorldScene.update` with the
only final consumer. This is the exact world-confirm path; it cannot also be
handled by an Angular button or a Phaser key listener:

```typescript
const routed = this.readInput();
if (routed.startedAt !== null) this.latency.begin(routed.startedAt);
if (routed.direction.x === 0 && routed.direction.y === 0) this.latency.cancel();
const frame = stepPlayerController(
  this.playerMotion,
  { direction: routed.direction },
  delta,
);
const collision = this.collisionWorld.moveFeet(
  { x: this.player.x, y: this.player.y },
  frame.displacement,
);
if (Math.hypot(collision.actual.x, collision.actual.y) > 0.001) {
  this.latency.displaced(performance.now());
}
if (routed.confirmPressed
  && !this.inputLock.channels.interactions
  && this.interactionCooldown <= 0) {
  this.interactionCooldown = this.INTERACTION_COOLDOWN_MS;
  this.interactNearest();
}
```

Delete the direct `JustDown(E/SPACE/ENTER)` block. Preserve the remaining
collision reconciliation, animation, coalesced position and NPC/camera calls
around this replacement.

In `SimulationPlayComponent`, connect the store/router after authentication and
derive router scope from the already-owned signals:

```typescript
effect(() => {
  const scope: GameInputScope = this.dialogue() !== null
    ? 'dialogue'
    : this.inputLockState().locked
      ? 'overlay'
      : 'world';
  this.inputRouter.setScope(scope);
});

this.inputRouter.action$
  .pipe(takeUntilDestroyed(this.destroyRef))
  .subscribe(event => {
    if (event.action === 'cancel' && this.settingsOpen()) {
      this.settingsOpen.set(false);
      return;
    }
    if (event.action === 'cancel' && this.journalOpen()) {
      this.journalOpen.set(false);
      return;
    }
    if (event.action === 'settings'
      && (event.scope === 'world' || this.settingsOpen())) {
      this.settingsOpen.update(open => !open);
      return;
    }
    if (event.action === 'journal'
      && (event.scope === 'world' || this.journalOpen())) {
      this.journalOpen.update(open => !open);
      return;
    }
    if (event.scope !== 'world') return;
    if (event.action === 'pause') this.safeExit();
  });
```

Remove only `SimulationPlayComponent`'s `@HostListener('window:keydown')` and
the world keyboard branches it owned. The dialogue component's legacy listener
still exists at the end of this runtime plan and is removed by the immediately
following dialogue/HUD plan when that plan consumes `action$`; therefore this
phase gate claims one world-runtime listener authority, not a repo-wide listener
elimination.

- [ ] **Step 5: Add an accessible remapping surface with honest conflict feedback**

Inside the existing settings overlay, add a `Controles` section. Render the thirteen
semantic actions, their keyboard slots and gamepad button. Each button name is
`Cambiar <acción>, actual <control>`. When activated, announce
`Pulsa una tecla` or `Pulsa un botón del mando`, call `beginCapture`, and restore
focus to the initiating button after success/cancel. Display a conflict as
`Ese control ya está asignado a <acción>` in `role="alert"`; do not silently
swap or discard another binding. Include `Restablecer controles` with a confirm
step. The settings lock must keep position, animation and world PATCH count
unchanged throughout capture.

Give every capture button a stable test id
`binding-<action>-<keyboard|gamepad>-<slot>` (for example
`binding-confirm-keyboard-0` and `binding-confirm-gamepad-0`), the close control
`settings-close`, and the reset confirmation `bindings-reset-confirm`. These are
ordinary DOM attributes, not state-changing test hooks; the accessible name
remains the user-facing contract.

The HUD emits typed `bindingChange`/`bindingReset` intents; only
`SimulationPlayComponent` calls `InputBindingStore`. Do not write localStorage
from the HUD. The visual labels use familiar key/button names, while the stored
value remains `KeyboardEvent.code` or standard button index.

Replace the generic Task 9 map label with a label computed from the live binding
signal. In `SimulationPlayComponent`:

```typescript
readonly worldControlsLabel = computed(() => {
  const actions = this.inputBindingStore.bindings().actions;
  const movement = (['up', 'left', 'down', 'right'] as const)
    .map(action => formatControlCode(actions[action].keyCodes[0]!))
    .join(', ');
  const confirm = formatControlCode(actions.confirm.keyCodes[0]!);
  const confirmButton = actions.confirm.gamepadButtons[0];
  const gamepad = confirmButton === undefined ? '' : ` o botón ${confirmButton}`;
  return `Mapa explorable de la simulación. Movimiento: ${movement}. Interactuar: ${confirm}${gamepad}.`;
});

readonly primaryControlLabels = computed(() => {
  const actions = this.inputBindingStore.bindings().actions;
  return Object.freeze({
    confirm: formatControlCode(actions.confirm.keyCodes[0]!),
    journal: formatControlCode(actions.journal.keyCodes[0]!),
    movement: (['up', 'left', 'down', 'right'] as const)
      .map(action => formatControlCode(actions[action].keyCodes[0]!))
      .join(' / '),
  });
});
```

Add `[controlsLabel]="worldControlsLabel()"` to the existing `app-game-world`
invocation together with
`[confirmControlLabel]="primaryControlLabels().confirm"`. In
`GameWorldComponent`, add
`readonly controlsLabel = input.required<string>()` and
`readonly confirmControlLabel = input.required<string>()`; bind
`[attr.aria-label]="controlsLabel()"` and
`[attr.data-confirm-control]="confirmControlLabel()"` on `.phaser-host`. In
`simulation-play.consent-gate.spec.ts`, unit-test the initial
`E` label, remap confirm to `F`, and assert the host label changes to
`Interactuar: F` (and the live gamepad button) without recreating Phaser. No source or template may retain a
hardcoded "E para interactuar" label.

Pass `() => this.confirmControlLabel()` as a fourth constructor dependency of
`DataDrivenWorldScene`. Replace every Phaser text literal `▲ E`, `E  <label>`
and every Angular contextual `<kbd>E</kbd>`/`WASD ... E ... J` string with live
values from `confirmControlLabel`/`primaryControlLabels`. Use this scene helper
for text created once during room rendering:

```typescript
private readonly controlHints: Array<{
  text: Phaser.GameObjects.Text;
  render: (confirm: string) => string;
}> = [];
private lastConfirmControlLabel = '';

private registerControlHint(
  text: Phaser.GameObjects.Text,
  render: (confirm: string) => string,
): Phaser.GameObjects.Text {
  this.controlHints.push({ text, render });
  return text;
}

private refreshControlHints(): void {
  const confirm = this.readConfirmControlLabel();
  if (confirm === this.lastConfirmControlLabel) return;
  this.lastConfirmControlLabel = confirm;
  for (const hint of this.controlHints) hint.text.setText(hint.render(confirm));
}
```

Register the two existing hint shapes with these exact formatter callbacks:

```typescript
this.registerControlHint(npcHint, confirm => `▲ ${confirm}`);
this.registerControlHint(objectHint, confirm => `${confirm}  ${object.label} →`);
```

Call `refreshControlHints()` after room render and once per update before
proximity display; it returns immediately when the binding is unchanged. Clear
`controlHints` at the start of every `renderWorld`. The visible HUD, Phaser
canvas and accessible name therefore change atomically after remapping.

- [ ] **Step 6: Prove persistence, conflict detection, gamepad UI edges and locks live**

Append this scoped architectural regression to `scripts/runtime-boundary.test.mjs`:

```javascript
const INPUT_ROUTER = new URL(
  '../frontend/src/app/features/simulator/runtime/game-input-router.service.ts',
  import.meta.url,
);

test('one authority owns world keyboard and gamepad sampling', async () => {
  const [world, shell, router] = await Promise.all([
    readFile(GAME_WORLD, 'utf8'),
    readFile(SIMULATION_PLAY, 'utf8'),
    readFile(INPUT_ROUTER, 'utf8'),
  ]);
  assert.doesNotMatch(world, /createCursorKeys|addKeys|navigator\.getGamepads/);
  assert.doesNotMatch(world, /E para interactuar/);
  assert.doesNotMatch(world, /\u25b2 E|`E  \$\{object\.label\}/);
  assert.doesNotMatch(shell, /@HostListener\(['"]window:keydown/);
  assert.doesNotMatch(shell, /<kbd[^>]*>E<\/kbd>|WASD[^\n]*<kbd>E<\/kbd>/);
  assert.match(router, /addEventListener\(['"]keydown/);
  assert.match(router, /navigator\.getGamepads/);
});
```

This intentionally scopes the assertion to world runtime files; it does not
scan or bless the dialogue component's listener, which the next plan deletes.

Extend `world-runtime.e2e.ts` with a fresh authenticated session at 1366x768:

1. Open settings and remap the primary confirm key from `E` to `F`.
2. Attempt to assign `Escape`; assert the conflict alert names `Cancelar` and
   the old cancel binding remains.
3. Reload, reopen settings and assert `F` persisted.
4. Close settings; prove the host accessible name contains `Interactuar: F`,
   `data-confirm-control="F"`, `E` no longer interacts and `F` interacts once.
5. Reopen settings, hold movement and change the fake standard pad; assert zero
   coordinate/animation/PATCH drift.
6. Remap confirm to standard gamepad button 4, close settings and prove button 0
   no longer confirms while button 4 confirms exactly once; the accessible name
   now contains `botón 4`.

Implement that sequence as one explicit Playwright test, reusing
`installStandardGamepad`/`setStandardGamepad` from Task 12 and the public
`createWorldInputDriver`/`closeDialogue` helpers:

```typescript
test('keyboard and standard-pad remapping persist without duplicate actions', async ({ page }) => {
  test.setTimeout(180_000);
  await installStandardGamepad(page);
  await page.goto('/login');
  await loginStudent(page);
  let host = await enterPlayableWorld(page);
  const input = createWorldInputDriver(page, 'keyboard');
  await input.moveUntilNearby('ArrowLeft', /familia en crisis/i, 30_000);

  await page.getByTestId('open-settings').click();
  const confirmKey = page.getByTestId('binding-confirm-keyboard-0');
  await confirmKey.click();
  await page.keyboard.press('f');
  await expect(confirmKey).toHaveAccessibleName(/actual F/i);

  await confirmKey.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alert')).toHaveText(/ya está asignado a Cancelar/i);
  await expect(page.getByTestId('binding-cancel-keyboard-0'))
    .toHaveAccessibleName(/actual Escape/i);
  await page.getByTestId('settings-close').click();

  const mapKey = await host.getAttribute('data-rendered-map-key');
  await page.reload();
  await reloadAndResumeAttempt(page, 'IN_PROGRESS', mapKey!);
  host = page.locator('app-game-world .phaser-host[data-world-ready="true"]');
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('binding-confirm-keyboard-0'))
    .toHaveAccessibleName(/actual F/i);
  await page.getByTestId('settings-close').click();
  await expect(host).toHaveAttribute('data-confirm-control', 'F');
  await expect(host).toHaveAccessibleName(/Interactuar: F/i);

  let interactions = 0;
  const countInteraction = (request: Request) => {
    if (request.method() === 'POST'
      && /\/interactions\/familia-crisis$/.test(new URL(request.url()).pathname)) interactions += 1;
  };
  page.on('request', countInteraction);
  try {
    await page.keyboard.press('e');
    await page.waitForTimeout(300);
    expect(interactions).toBe(0);
    await page.keyboard.press('f');
    await expect.poll(() => interactions).toBe(1);
    await closeDialogue(page, /abuela de la niña/i);

    await page.getByTestId('open-settings').click();
    const lockedSnapshot = await host.evaluate(element => ({
      x: element.getAttribute('data-player-x'), y: element.getAttribute('data-player-y'),
      animation: element.getAttribute('data-player-animation'),
    }));
    await setStandardGamepad(page, { axes: [1, 0] });
    await page.waitForTimeout(900);
    expect(await host.evaluate(element => ({
      x: element.getAttribute('data-player-x'), y: element.getAttribute('data-player-y'),
      animation: element.getAttribute('data-player-animation'),
    }))).toEqual(lockedSnapshot);
    await setStandardGamepad(page, { axes: [0, 0] });

    const confirmPad = page.getByTestId('binding-confirm-gamepad-0');
    await confirmPad.click();
    await setStandardGamepad(page, { pressed: [4] });
    await expect(confirmPad).toHaveAccessibleName(/actual botón 4/i);
    await setStandardGamepad(page, { pressed: [] });
    await page.getByTestId('settings-close').click();
    await expect(host).toHaveAccessibleName(/botón 4/i);

    await setStandardGamepad(page, { pressed: [0] });
    await page.waitForTimeout(300);
    await setStandardGamepad(page, { pressed: [] });
    expect(interactions).toBe(1);
    await setStandardGamepad(page, { pressed: [4] });
    await expect.poll(() => interactions).toBe(2);
    await page.waitForTimeout(300); // held button cannot repeat
    expect(interactions).toBe(2);
    await setStandardGamepad(page, { pressed: [] });
  } finally {
    page.off('request', countInteraction);
    await setStandardGamepad(page, { axes: [0, 0], pressed: [] });
  }
});
```

Also count `/world-state` PATCH requests during the locked settings subsection
and assert `0`, using the shared request counter from Task 11. Do not replace a
failed locator or response assertion with a timeout increase.

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/input-bindings.spec.ts src/app/features/simulator/runtime/input-binding.store.spec.ts src/app/features/simulator/runtime/game-input-router.service.spec.ts src/app/features/simulator/simulation-play.consent-gate.spec.ts src/app/features/simulator/simulation-hud.component.spec.ts
node --test scripts/runtime-boundary.test.mjs
npm run build:frontend
npm run test:e2e -- world-runtime.e2e.ts --project=chromium --retries=0
```

Expected: PASS; Playwright includes the new remapping case, the accessible map
label changes to `F`, all world locks stay invariant and exactly one
world-runtime keyboard/gamepad authority is present after reload. This gate does
not claim removal of the dialogue component listener; the dialogue/HUD plan owns
that next migration.

- [ ] **Step 7: Commit the complete control-accessibility slice**

```powershell
git add scripts/runtime-boundary.test.mjs frontend/src/app/features/simulator/runtime/input-bindings.ts frontend/src/app/features/simulator/runtime/input-bindings.spec.ts frontend/src/app/features/simulator/runtime/input-binding.store.ts frontend/src/app/features/simulator/runtime/input-binding.store.spec.ts frontend/src/app/features/simulator/runtime/game-input-router.service.ts frontend/src/app/features/simulator/runtime/game-input-router.service.spec.ts frontend/src/app/features/simulator/runtime/gamepad-input.ts frontend/src/app/features/simulator/runtime/gamepad-input.spec.ts frontend/src/app/features/simulator/game-world.component.ts frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts frontend/src/app/features/simulator/simulation-hud.component.ts frontend/src/app/features/simulator/simulation-hud.component.spec.ts frontend/e2e/world-runtime.e2e.ts
git commit -m "feat(game): persistir remapeo accesible de controles"
```

### Task 14: Run the runtime gate and record evidence without inflating the score

**Files:**

- No tracked changes.

- [ ] **Step 1: Run the complete fresh gate in this order**

Run each command separately; do not increase timeouts or enable retries to hide failures:

```powershell
npm run test:scripts
npm run check:backend
npm run test:backend
npm run test:frontend
npm run build:frontend
npm run test:api:e2e
npm run test:e2e
```

Expected: seven exit codes `0`. Playwright remains `retries=0`. The E2E runner leaves no reserved test ports or owned Compose resources.

- [ ] **Step 2: Perform the live desktop acceptance**

Start the isolated local stack and record the actual URL/commit. At `1366×768` and `1600×900`, verify with DevTools closed:

1. player starts from the authoritative package position;
2. first key response is perceptible without a dead frame;
3. diagonal travel does not visibly accelerate;
4. release stops within roughly eight world pixels;
5. pressing into each desk/wall rests the legs and emits no footstep;
6. corners slide without snagging;
7. camera never shimmers or exposes outside the map;
8. holding a direction behind journal, settings, busy, outcome and a real dialogue changes neither position nor network state;
9. each pre-world resume/consent/video/intro gate consumes held world input and emits no position request;
10. a successful door covers before its sole POST, lands at the server entry and reveals the new scene; the automated full-case route proves the exact stage sequences `hospital-sala-escucha` -> `hospital-sala-escucha-accion` -> `hospital-sala-escucha-cierre` and `comisaria-consultorio` -> `comisaria-consultorio-marco` -> `comisaria-consultorio-cierre`, while an aborted POST reveals the unchanged origin;
11. opening controlled settings and remapping confirm changes the host accessible label while position/animation/network remain fixed;
12. keyboard and gamepad remaps survive reload, report conflicts and emit one action per edge;
13. the visible actor turn plus pre-speech pause emits readiness between `100` and `350 ms` before copy appears;
14. closing dialogue restores both actors and explore framing;
15. selected editor character is the `AvatarRenderPlan.characterId` rendered in Phaser;
16. every visible NPC is an integer-scale `ActorRenderPlan` body with no preset/tint fallback;
17. the eight exact map keys (`hospital-urgencias`, `hospital-sala-escucha`,
    `hospital-sala-escucha-accion`, `hospital-sala-escucha-cierre`,
    `comisaria-recepcion`, `comisaria-consultorio`,
    `comisaria-consultorio-marco`, `comisaria-consultorio-cierre`) render only
    assets approved by `PremiumVisualManifestV1`;
18. maps, tilesets, furniture, signs and prompts preserve crisp pixel edges,
    integer scale and the shared palette, with no antialiasing, fractional
    scaling, blur or unreviewed asset silently promoted to approved;
19. every `PERSON` is exactly one duplicate-free `ActorRenderPlan` body, every
    `OBJECT`, `TOOL` and `EXIT` has an authored sprite, and no generic marker,
    Material icon, tint or CSS substitute appears in world or HUD;
20. `relief`, `steady`, `tension` and `rupture` each select their exact authored
    body/portrait pair for every one of the ten identities and eleven NPC
    visuals; a missing or unknown tone fails closed;
21. editor, exploration and `PERSON`/`OBJECT`/`TOOL`/`EXIT` interaction captures
    are legible and compositionally sound at both required desktop viewports;
22. the character, NPC, world-asset and HUD-asset contact sheets contain every
    declared manifest entry and no unexplained visual outlier.

Expected: all twenty-two observations pass. A failure reopens the owning task;
it is not documented as “minor polish.” Existing art starts `unreviewed`; neither
the validator nor this runtime pass may autoapprove visual coherence.

- [ ] **Step 3: Write immutable external evidence**

Create one safe, unique `runId` and write
`.superpowers/evidence/<HEAD>/<runId>/runtime/runtime-manifest.json` containing:

- commit SHA and isolated DB/ports;
- exact test counts and exit codes;
- backend `sourceContentHash` observed in `/world`, plus runtime `contentHash` and
  `sceneInstanceKey` observed in the DOM; record them as distinct identities;
- measured stop distance, diagonal ratio and input-to-first-position samples;
- the nine-source Playwright lock matrix, successful/failed door-transition
  traces, all eight resolved backend map keys, both base/action/closing stage
  sequences, actor-readiness timings and exact request counts;
- screenshots/video paths for both desktop viewports;
- the exact `PremiumVisualManifestV1` and `VisualAssetInventoryV1` repository
  paths/hashes plus the validator exit code;
- SHA-256 entries for the four run-root contact sheets at
  `visual-language/characters.png`, `visual-language/npc.png`,
  `visual-language/world-assets.png` and `visual-language/hud-assets.png`;
- SHA-256 entries for `playwright/visual-captures/1366x768/` and
  `playwright/visual-captures/1600x900/`, each containing
  `editor.png`, `exploration.png`, `interaction-person.png`,
  `interaction-object.png`, `interaction-tool.png` and
  `interaction-exit.png`;
- the complete four-tone resolver matrix across all ten identity plans and all
  eleven NPC render plans, including authored body animation and portrait state;
- scoped boundary result proving one world keyboard/gamepad authority, with an
  explicit note that the dialogue listener is removed by the next plan;
- explicit statement that this proves the runtime/motion/camera slice only.

The directory is gitignored and the manifest records the exact tested HEAD. Do
not assign 9/10 yet. Character art, final dialogue/HUD, NPC consequences, audio,
sustained 20-minute performance and human playtest remain independent blocking
gates.

- [ ] **Step 4: Verify the tested checkout did not change**

```powershell
git status --short
```

Expected: empty. A later final-acceptance plan may index this external artifact,
but it must not create a documentation commit after recording runtime evidence.

## Self-review

### Spec coverage

- Angular/Phaser authority: Tasks 1, 3, 5 and 9 establish backend source identity, complete canonical static hash, per-attempt `sceneInstanceKey`, atomic package, typed port and storage/API prohibition.
- Movement feel: Tasks 6 and 10 enforce acceleration, stable facing, normalized diagonal, short braking and actual-displacement animation.
- Collision: Tasks 3, 7 and 10 use server-authored solids plus colliding objects, one-pixel substeps, bounds and corner slide; hardcoded/Tiled gameplay geometry is removed.
- Input lock: Tasks 4, 9, 10 and 11 prove all five channels and held input behind every one of the nine real lock sources.
- Camera: Tasks 8 and 11 provide framed/follow modes, dead zone, look-ahead, integer zoom/focus, bounded settling and conversation shots.
- Actor presentation: Tasks 2 and 11 define the shared state, visibly orient both actors, enforce a deterministic `100–350 ms` turn/pause readiness event, map every ordinary pose plus the four exact `ConsequenceTone` values to authored body/portrait slots, fail closed on unmapped clinical emotion, drive player/NPC bodies and restore state. The dialogue plan owns portrait/typewriter/HUD rendering and imports this contract.
- Room transitions: Tasks 3, 5, 9 and 11 require a covered-before-HTTP handshake, one server-authoritative target/entry, controlled reveal and origin recovery on failure; Phaser never swaps rooms locally.
- Player/NPC rendering: Tasks 3, 9, 11 and 14 consume immutable
  `AvatarRenderPlan`/`ActorRenderPlan` values, four real directions and authored
  animation frames at integer scale without preset, tint, flip, deformation or
  generic `PERSON` marker. The runtime evidence also covers approved map,
  tileset, furniture, sign, prompt, `OBJECT`, `TOOL`, `EXIT`, icon and HUD-frame
  assets at both desktop viewports.
- Gamepad, reduced motion and measured input latency: Task 12 routes standard
  controller input through the same lock/controller, removes decorative motion
  for the media preference and enforces live p95 ≤50 ms.
- Persistent remapping and conflict detection: Task 13 owns one per-user
  keyboard/XInput binding schema, central semantic router, accessible capture UI
  and live persistence/lock coverage. `RoutedMovementFrame` preserves analog
  direction, one confirm edge and the original latency timestamp.

### Deliberate boundaries

- This plan does not create final pixel assets or their manifests; the character
  plan owns the ten selectable identities, eleven NPC visuals and the complete
  approved world/HUD visual inventory. This plan consumes those immutable
  contracts, refuses generic fallbacks and records live evidence for every
  visible category.
- This plan does not style dialogue/Liquid Glass, remove chatbot UI, or implement typewriter/focus; the presentation plan owns those while importing `ActorPresentationState`. The runtime gate removes all duplicate world listeners, while that next plan removes the still-existing dialogue listener and consumes the same semantic router.
- This plan does not implement NPC relational state, clinical branches, audio mixer or checkpoint recovery; those require subsequent plans and remain publication blockers.
- When the later audio plan adds `ScenePackageV1.audio`, it must add that field to
  Task 3's `staticPackageWithoutHash` before `canonicalSha256` and recompute
  `sceneInstanceKey`; appending audio after hashing would violate this plan's
  complete-content identity.
- Analog stick calibration curves remain a later enhancement; keyboard slots,
  D-pad and actionable XInput buttons are remappable and persistent in Task 13,
  so the approved control-remapping requirement is not deferred.

### Placeholder and type consistency check

- The implementation-task scan has no unresolved markers, shorthand substitutions, implicit error branches or anonymous test targets.
- `ScenePackageV1`, `InputLockState`, `GameWorldCommand`, `GameWorldEvent`,
  `ActorTopologySnapshotV1`, `ActorPresentationState`, `PlayerMotionState`,
  `RoutedMovementFrame`, `InputBindingsV1` and `CameraDirector` each have exactly
  one defining file.
- `AvatarRenderPlan` and `ActorRenderPlan` are intentionally external and have explicit prerequisite APIs; this plan never redeclares either one.
- Django's `sourceContentHash`, the normalized package `contentHash` and the runtime `sceneInstanceKey` have distinct names, construction rules and tests; no dedupe compares `contentHash` alone.
- Red/green commands name the exact test file, and every implementation task ends in a scoped commit.
