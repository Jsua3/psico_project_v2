# E2E-VERTICAL-01 Axe and Responsive Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task by task and preserve the isolated E2E runner.

**Goal:** Prove that the live `SIM-VBG-001` path has no Axe `serious`/`critical` findings and no blocking geometry failures at `1600×900`, `1366×768`, `390×844`, and `412×915`.

**Architecture:** A Playwright-only support layer injects the already-installed `axe-core`, filters only blocking impacts, records actionable node summaries, and measures global overflow plus active game/dialog geometry. One tagged quality spec runs the same real states in four explicit viewports without multiplying the existing smoke suite.

**Tech Stack:** Playwright 1.60, axe-core 4.12, Angular 21, isolated Django/PostgreSQL runner.

---

### Task 1: Add reusable quality gates

**Files:**

- Add: `frontend/e2e/support/quality-gates.ts`
- Add: `frontend/e2e/support/siep-flow.ts`

- [ ] Add an Axe helper for WCAG 2.1 A/AA that fails only `serious`/`critical` and does not disable contrast.
- [ ] Add a geometry helper for document overflow, `.game-container`, `.canvas-zone`, canvas, active dialogs and their controls.
- [ ] Add resilient login/entry helpers that resolve resume, consent, video, narrative and Phaser readiness without fixed sleeps.

### Task 2: Run the four-viewport state matrix

**Files:**

- Add: `frontend/e2e/vertical-quality.e2e.ts`
- Modify as findings require: scoped frontend components/styles

- [ ] Write one `@quality` test per required viewport; desktop exercises keyboard and mobile exercises visible touch controls.
- [ ] Scan login, lobby, content warning, video, case context, stable world, settings, journal and a real multi-line NPC dialogue.
- [ ] Run `npm run test:e2e -- --grep @quality` red, preserve exact findings, and add focused regressions before each production fix.
- [ ] Iterate until all four variants pass Axe and geometry.

### Task 3: Preserve prior gates and document evidence

**Files:**

- Modify: `docs/audits/2026-07-11-calidad-9-10-evidencia.md`

- [ ] Run full frontend tests, production build and existing E2E suite.
- [ ] Run the final `@quality` matrix and verify teardown: ports 5544/8093/4315 and Compose resources at zero.
- [ ] Record exact counts and remaining manual screen-reader/SME limits without claiming the full six-decision vertical path yet.

## Acceptance

- Four required viewports execute real UI/API state transitions.
- Axe reports no `serious` or `critical` violations in scanned states.
- No accidental global horizontal overflow or off-viewport active modal/control is accepted.
- Canvas readiness, keyboard progression and touch controls are observed, not inferred from build output.
