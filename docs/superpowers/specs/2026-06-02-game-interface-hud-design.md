# Game Interface / HUD Reorganization — Design Spec

- **Date:** 2026-06-02
- **Status:** Approved (design); pending spec review → implementation plan
- **Builds on:** Sub-project B1 (Living World), merged to `feat/game-shell`.
- **Repo:** frontend `psicologia_proyecto/admin-panel` (Angular 21 + Phaser 3). No backend changes.
- **Approach (user-approved):** "Zonas arriba + dock inferior" — reorganize layout/hierarchy only; keep the current clinical visual style. No new assets, no game-mechanic changes.

## 1. Context

Live verification of the running game (SIM-VBG-001) surfaced concrete interface problems beyond the two B1 cosmetic nits:

- **Top HUD is overcrowded.** `app-simulation-hud` packs 7 sections into one 52px flex row (`hud-strip`): score, stress meter (fixed 260px), scene title (flex 1), step chip, objective (flex 1.2), status, patient C/B bars. On real widths the two flexing text sections — scene title and objective — **truncate with ellipsis** ("Sala de urg…", "Objetivo: Estabi…").
- **Bottom band collides.** In `simulation-play.component.ts`, the controls hint, the proximity hint, the tool inventory, and the journal toggle all sit ~110–120px from the bottom; the Phaser **guide bubble** and **world zone labels** ("Área médica restringida") occupy the same visual band → overlap.
- **Guide bubble clips** against the bottom screen edge when the guide is low in the viewport (confirmed live).
- **World labels** (NPC names, zone names) are large/opaque and overlap the action.
- **Menu:** the "CLÍNICA · SIEP" sign overlaps the case title (and the "Disponible" badge overlaps it too) when the first door sits near the sign.

These cluster into: (1) top-bar density/truncation, (2) bottom overlay collisions, (3) world-label overlaps, (4) menu nits.

## 2. Design

Keep the existing clinical palette, glass surfaces, and typography. Change only structure/positioning.

### 2.1 Top bar → primary strip + objective line (two tiers)

Refactor `app-simulation-hud`'s single `hud-strip` into a vertical stack of two attached tiers (same glass container, `border-radius: 0 0 16px 16px`):

- **Tier 1 — case vitals + location (one row, fixed-width zones, no ellipsis on chips):**
  - *Left zone — "vitals":* `Seguimiento` (score) · `Estrés` meter (narrow the track from `flex: 0 0 260px` to `~150px`) · `Paciente` C/B mini-bars. Grouped, fixed widths, always legible.
  - *Center zone:* location (`currentNode.title`, may ellipsis gracefully — it is also in the SR narrative + minimap) + the `Paso N/total` step chip.
  - *Right zone:* status (`En seguimiento` / `Finalizado` / `Salida segura`).
- **Tier 2 — objective line (full width):** a slim strip directly below tier 1: `🎯 Objetivo: <full text>`, full container width so it does **not** truncate (single line with room; wraps to 2 lines max on narrow widths). Hidden entirely when `sceneObjective()` is null (nodes without objective copy).

Layout consequences:
- HUD total height grows from ~52px to ~80px (tier1 ~52 + tier2 ~28).
- The minimap (`app-minimap`, currently `top: 62px`) moves down to ~`88px` so it clears tier 2.
- Existing `@media (max-width: 640px)` behavior is preserved/extended: on narrow widths the objective line wraps and the patient/vitals collapse as today.

### 2.2 Bottom → single contextual dock (priority-resolved)

Goal: never stack transient messages. Introduce one priority resolver and one centered dock.

- **Priority resolver (pure function, unit-tested):** `resolveDockMessage(state) → DockMessage | null`, where the inputs are the current UI flags (dialogue open?, nearby interaction?, …). Priority order:
  1. Dialogue/active panel open → dock hidden (the dialogue panel owns the bottom).
  2. Nearby interaction → show the proximity hint ("E para interactuar con …").
  3. Otherwise → null (no center dock).
- **Controls hint** (`Mover: WASD…`) is demoted from an always-on center sentence to a **compact collapsed pill** anchored bottom-left (icon `⌨`), expanding to the full text on hover/focus. It no longer competes in the center band.
- **Tool inventory** (left) and **journal toggle** (right) stay in their corners; spacing is set so the center dock and the corner controls never overlap (define explicit bottom offsets / a reserved center column).
- The **dialogue panel** remains the full-width bottom layer (z-index 60) and, when open, suppresses the dock (per the resolver).

### 2.3 World (Phaser) — guide bubble + labels

In `game-world.component.ts`:

- **Guide bubble clamping:** when positioning the guide bubble (`showGuideBubble`), clamp it within the camera's visible bounds — if the guide is near the bottom/edge, render the bubble **below** the guide or shift it inward so it is never clipped. (Fixes the live-observed clip.)
- **World labels:** reduce the NPC name labels and zone labels (`renderHospitalEnvironment` / `renderComisariaEnvironment` zone text, marker labels) in size and opacity, give them a subtle consistent background, and keep them at a lower depth so they read as ambient context rather than blocking the action.

### 2.4 Menu (`game-menu.component.ts`)

- Reposition the "CLÍNICA · SIEP" sign (raise it / cap width) and the per-door title + badge offsets so the sign and the first door's title/badge **do not overlap**, regardless of how many cases are in the catalog (the one-case case is the worst).

### 2.5 Isolation & accessibility

- All changes are template/CSS in `simulation-hud.component.ts`, overlay layout in `simulation-play.component.ts`, Phaser label/bubble code in `game-world.component.ts`, and `game-menu.component.ts`.
- Respect `prefers-reduced-motion` (existing behavior unchanged; the pill expand uses no motion when reduced).
- No change to game mechanics, decisions, the guide target logic, the backend, or auth.

## 3. Testing

- **Unit (Jest):** the dock priority resolver `resolveDockMessage` is a pure function → red/green tests for each priority branch (dialogue open hides; nearby interaction wins; empty → null).
- **Build:** `tsc -p tsconfig.app.json --noEmit` + `ng build`.
- **Visual (live + screenshots):** drive the running app (as in B1 verification) and confirm: top bar shows no ellipsis truncation on the objective; objective line readable; bottom shows one message at a time (no controls/proximity overlap); guide bubble never clips at the bottom; menu sign/title no longer overlap. Iterate the fine spacing live.

## 4. Out of scope

- Full visual restyle (new palette/typography/components) — explicitly declined in favor of layout-only.
- Side-rail HUD layout — declined.
- New audio/art assets.
- Any game-mechanic, backend, or routing change.
- Mobile-first redesign (existing 640px breakpoint behavior is preserved, not expanded).

## 5. Files affected

- `src/app/features/simulator/simulation-hud.component.ts` — two-tier top bar (template + styles).
- `src/app/features/simulator/simulation-play.component.ts` — bottom dock layout, collapsed controls pill, minimap offset; wire the dock resolver.
- `src/app/features/simulator/game-world.component.ts` — guide bubble clamping; softer world/zone labels.
- `src/app/features/simulator/game-menu.component.ts` — sign/title/badge anti-overlap.
- New: a small dock-resolver module (e.g. `hud-dock.util.ts`) + its `.spec.ts`.

## 6. Risks / open items

- Two-tier HUD increases top height; verify the minimap and the game canvas top inset still look right (canvas is `inset: 0 0 180px 0`; top is covered by the HUD overlay, not insetting the canvas — confirm visually).
- Collapsing the controls hint may hide discoverability for first-time players; the pill must remain obvious (icon + expand on hover/focus, and it stays visible).
- Softening world labels must not hurt readability of NPC names that matter (e.g., the guide) — keep the guide's name legible.
