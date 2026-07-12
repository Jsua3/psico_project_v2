# GAME-SPATIAL-02b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the full player feet hitbox and ambient-NPC proximity authoritative on the server, and only credit NPC evidence after the server accepts it.

**Architecture:** The Django world service remains the source of truth for coordinates. It will turn the `(playerX, playerY)` feet point into the same 22x16 rectangle used by the renderer, reject any overlap with authored collision rectangles, and derive every ambient NPC position/radius from `SceneMap.ambient_json`. The Angular client may show an NPC dialogue only after the 2xx world response supplies the authoritative `viewedNpcKeys` flag.

**Tech Stack:** Django/pytest/DRF, Angular/TypeScript/Jest, seeded `SIM-VBG-001` fixtures.

---

## File map

- `backend_django/apps/simulation/services/world_service.py`: pure rectangle helpers, full-hitbox collision check, and fail-closed spatial validation for ambient NPCs.
- `backend_django/apps/simulation/management/commands/seed_caso_pdf.py`: canonical `ambientNpcs` entries (`key`, `x`, `y`, `interactionRadius`) for every map in the vertical slice.
- `backend_django/apps/simulation/tests/test_world_authority.py`: endpoint regressions proving partial hitbox overlap and remote NPC requests are rejected without state/event mutation.
- `backend_django/apps/simulation/tests/test_world.py`: happy-path NPC proof after moving into the server-authored radius.
- `frontend/src/app/features/simulator/simulation-play.component.ts`: delay local NPC evidence and dialogue opening until the accepted world response.
- `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`: response-order regression for client-side evidence.
- `docs/audits/2026-07-11-calidad-9-10-evidencia.md`: immutable evidence summary for this completed sub-slice.

### Task 1: Validate the entire player feet hitbox in Django

**Files:**
- Modify: `backend_django/apps/simulation/tests/test_world_authority.py:87-153`
- Modify: `backend_django/apps/simulation/services/world_service.py:43-98,144-152`

- [ ] **Step 1: Write the failing boundary-overlap regression**

```python
def test_full_player_hitbox_cannot_clip_the_collision_zone(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)

    # (370, 300) as a point is outside the triage desk (x=380), but a
    # 22x16 feet hitbox overlaps its left edge.
    resp = c.patch(
        STATE.format(attempt_id),
        {"attemptToken": token, "playerX": 370, "playerY": 300,
         "currentMapKey": world["map"]["key"]},
        format="json",
    )

    assert resp.status_code == 400
    assert _player(attempt_id) == (480, 430)
```

- [ ] **Step 2: Run it and confirm it fails because point-only validation accepts the move**

Run: `npm run test:backend -- apps/simulation/tests/test_world_authority.py::test_full_player_hitbox_cannot_clip_the_collision_zone -q`

Expected: `FAILED` with HTTP 200 before the implementation.

- [ ] **Step 3: Add the explicit shared feet-rectangle semantics**

```python
PLAYER_HITBOX_WIDTH = 22
PLAYER_HITBOX_HEIGHT = 16

def _player_hitbox(x, y):
    return (x - PLAYER_HITBOX_WIDTH // 2, y - PLAYER_HITBOX_HEIGHT,
            PLAYER_HITBOX_WIDTH, PLAYER_HITBOX_HEIGHT)

def _rectangles_intersect(a_x, a_y, a_w, a_h, b_x, b_y, b_w, b_h):
    return a_x < b_x + b_w and a_x + a_w > b_x and a_y < b_y + b_h and a_y + a_h > b_y
```

Replace point containment in `_position_blocked` with `_rectangles_intersect(*_player_hitbox(x, y), ...)` for both `CollisionZone` and colliding `MapObject` rectangles. In `update_position`, reject a feet rectangle that extends outside `0..map_w` or `0..map_h` before persisting it.

- [ ] **Step 4: Re-run the focused regression**

Run: `npm run test:backend -- apps/simulation/tests/test_world_authority.py::test_full_player_hitbox_cannot_clip_the_collision_zone -q`

Expected: `1 passed`.

- [ ] **Step 5: Commit the hitbox contract**

```bash
git add backend_django/apps/simulation/services/world_service.py backend_django/apps/simulation/tests/test_world_authority.py
git commit -m "fix(game): validar hitbox completo en servidor"
```

### Task 2: Give every seeded ambient NPC server-owned position and radius

**Files:**
- Modify: `backend_django/apps/simulation/tests/test_world_authority.py:189-222`
- Modify: `backend_django/apps/simulation/tests/test_world.py:241-255`
- Modify: `backend_django/apps/simulation/management/commands/seed_caso_pdf.py:561-648`
- Modify: `backend_django/apps/simulation/services/world_service.py:286-318`

- [ ] **Step 1: Write red tests for a remote NPC and an in-range NPC**

```python
def test_npc_remoto_rechazado_sin_evidencia_ni_evento(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)  # spawn (480, 430), nurse is at (560, 330)

    resp = c.post(f"/api/simulation/attempts/{attempt_id}/npcs/enfermera-urgencias",
                  {"attemptToken": token}, format="json")

    assert resp.status_code == 400
    assert _events(attempt_id, "NPC_DIALOGUE_VIEWED") == 0
    assert _world(c, attempt_id, token)["flags"].get("viewedNpcKeys") in (None, [])
```

Update the existing happy-path test to call `_move(..., 560, 380)` before posting and assert the 2xx response contains `enfermera-urgencias`.

- [ ] **Step 2: Run the red tests**

Run: `npm run test:backend -- apps/simulation/tests/test_world_authority.py::test_npc_remoto_rechazado_sin_evidencia_ni_evento apps/simulation/tests/test_world.py::test_record_npc_interaction_persists_in_world_flags -q`

Expected: the remote case initially returns 200, proving the missing spatial authority.

- [ ] **Step 3: Seed explicit spatial NPC contracts**

Replace each `ambientNpcKeys` list in `MAPS` with an `ambientNpcs` list preserving the same keys and adding the matching initial ScenarioConfig coordinates plus `interactionRadius: 60`. Keep `ambientNpcKeys` derived from those entries only where legacy consumers still read it; do not maintain two independent key lists.

For the initial vertical room the canonical entry is:

```python
{"key": "enfermera-urgencias", "x": 560, "y": 330, "interactionRadius": 60}
```

All existing seeded ambient keys must receive exactly one valid entry. The `/world` `map.ambient` DTO already exposes this persisted contract.

- [ ] **Step 4: Enforce server proximity fail-closed**

```python
def _require_nearby_ambient_npc(world_state, npc_key):
    ambient_npcs = _read_map(world_state.scene_map.ambient_json).get("ambientNpcs")
    if not isinstance(ambient_npcs, list):
        raise ValidationError("La sala no autoró NPCs ambientales con posición")
    for npc in ambient_npcs:
        if isinstance(npc, dict) and npc.get("key") == npc_key:
            x = _require_finite_int(npc.get("x"), "posición X del NPC")
            y = _require_finite_int(npc.get("y"), "posición Y del NPC")
            radius = _require_finite_int(npc.get("interactionRadius"), "radio del NPC")
            if radius <= 0 or math.hypot(world_state.player_x - x, world_state.player_y - y) > radius:
                raise ValidationError("Estás demasiado lejos del NPC para interactuar")
            return
    raise NotFound("El NPC no existe en la sala actual")
```

Call it before mutating `viewedNpcKeys`. Retain `PERSON` map-object support by looking up its canonical rectangle and calling `_require_nearby`; never accept a key merely because it was supplied by the browser.

- [ ] **Step 5: Re-run the focused backend suite**

Run: `npm run test:backend -- apps/simulation/tests/test_world.py apps/simulation/tests/test_world_authority.py apps/simulation/tests/test_caso_pdf.py -q`

Expected: all selected tests pass, including remote rejection and moved-near acceptance.

- [ ] **Step 6: Commit the NPC authority contract**

```bash
git add backend_django/apps/simulation/management/commands/seed_caso_pdf.py backend_django/apps/simulation/services/world_service.py backend_django/apps/simulation/tests/test_world.py backend_django/apps/simulation/tests/test_world_authority.py
git commit -m "fix(game): validar proximidad de NPC ambiental"
```

### Task 3: Credit NPC evidence only after the accepted response

**Files:**
- Modify: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts:15-92,268-290`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts:1571-1600`

- [ ] **Step 1: Write the failing response-order spec**

```typescript
it('acredita y abre el diálogo del NPC solo después del 2xx autoritativo', () => {
  setup(makeAttempt());
  component.attempt.set(makeAttempt());
  const response$ = new Subject<SimulationWorldState>();
  sim.recordNpcInteraction.mockReturnValue(response$);
  const npc = { key: 'enfermera-urgencias', displayName: 'Enfermera', dialogue: { lines: [{ text: 'Acércate.' }] } } as NpcConfig;

  component.openNpcDialogue(npc);
  expect((component as any).viewedNpcKeys().has(npc.key)).toBe(false);
  expect(component.dialogue()).toBeNull();

  response$.next({ flags: { viewedNpcKeys: [npc.key] } } as SimulationWorldState);
  expect((component as any).viewedNpcKeys().has(npc.key)).toBe(true);
  expect(component.dialogue()?.key).toBe(`npc-${npc.key}`);
});
```

Import `Subject` and `SimulationWorldState`; the test proves ordering rather than mock call count.

- [ ] **Step 2: Run it and confirm it fails because evidence is currently written optimistically**

Run: `npm run test:frontend -- --runInBand src/app/features/simulator/simulation-play.consent-gate.spec.ts`

Expected: `FAILED` because `viewedNpcKeys` already contains the key before `response$.next`.

- [ ] **Step 3: Move dialogue/evidence mutation into the success callback**

```typescript
const openDialogue = () => {
  if (!npc.dialogue?.lines?.length) return;
  this.dialogue.set(/* existing mapped DialogueState */);
};

if (game?.status === 'IN_PROGRESS') {
  this.simulationService.recordNpcInteraction(game.attemptId, game.attemptToken, npc.key).subscribe({
    next: world => { this.mergeViewedNpcKeysFromWorld(world); openDialogue(); },
    error: () => this.showActionError('No pudimos guardar la interacción con el NPC.'),
  });
  return;
}
openDialogue();
```

Do not call `persistViewedNpcKeys` or set `viewedNpcKeys` before the response. Keep non-running/read-only states able to render their informational dialogue without claiming attempt evidence.

- [ ] **Step 4: Re-run the focused frontend spec**

Run: `npm run test:frontend -- --runInBand src/app/features/simulator/simulation-play.consent-gate.spec.ts`

Expected: all tests in the spec pass.

- [ ] **Step 5: Commit the response-order guard**

```bash
git add frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts
git commit -m "fix(game): acreditar NPC tras respuesta autoritativa"
```

### Task 4: Re-run the vertical spatial evidence and record it

**Files:**
- Modify: `docs/audits/2026-07-11-calidad-9-10-evidencia.md`

- [ ] **Step 1: Run the complete relevant gate**

Run: `npm run test:backend -- apps/simulation/tests/test_world.py apps/simulation/tests/test_world_authority.py apps/simulation/tests/test_caso_pdf.py -q; npm run test:frontend; npm run test:e2e`

Expected: each command exits 0; E2E leaves no test containers or reserved ports.

- [ ] **Step 2: Append immutable evidence**

Record the exact counts and state that the server now derives door entries, tests a full 22x16 feet rectangle, rejects remote ambient NPCs, and the client does not grant NPC evidence before a 2xx response. Explicitly leave clinical loop, line-by-line narrative, Axe, and viewport matrix marked as pending.

- [ ] **Step 3: Commit the audited sub-slice**

```bash
git add docs/audits/2026-07-11-calidad-9-10-evidencia.md
git commit -m "docs(audit): registrar autoridad espacial completa"
```

## Self-review

- The plan covers each remaining GAME-SPATIAL-02 requirement from the approved design: full hitbox, server-owned ambient NPC coordinates/radius, and post-2xx client evidence.
- No task asks the client to send a coordinate or radius; all spatial claims are derived from server-owned data.
- Tests are endpoint/observable based and each behavior is red before its implementation.
- This plan intentionally does not claim Tiled art geometry as a separate authority: `SIM-VBG-001` uses the backend-mirrored `case-pdf-rooms.geometry.ts` only for client movement, while the server collision zones remain acceptance authority.
