# FULL-VERTICAL-01 Six-Decision Case Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task by task, keep the path UI-driven, and preserve the isolated E2E runner.

**Goal:** Prove that a student can complete `SIM-VBG-001` through the rendered world, gather the authored evidence, commit all six recommended decisions, cross every required room transition, and receive the persisted integral completion report.

**Architecture:** A tagged Playwright journey extends the shared SIEP flow helpers with bounded movement, interaction, dialogue, tool and decision primitives. Every state change originates from visible UI or keyboard input; network listeners verify the resulting backend contracts and exact node/map transitions without using API calls as shortcuts.

**Tech Stack:** Playwright 1.60, Angular 21, Phaser 3.90, isolated Django/PostgreSQL runner.

---

### Task 1: Add deterministic world and dialogue primitives

**Files:**

- Modify: `frontend/e2e/support/siep-flow.ts`
- Test: `frontend/e2e/full-case.e2e.ts`

- [ ] Add bounded keyboard movement that stops only when the requested nearby action is visible and always releases held keys.
- [ ] Add an interaction helper that clicks the visible nearby action and verifies the expected mutating response.
- [ ] Add dialogue helpers that finish every authored line, expose choices, choose by exact learner-facing text and close supervision/tool feedback without fixed sleeps.
- [ ] Keep helpers semantic and fail with the missing action/room/decision label rather than coordinate-only errors.

### Task 2: Gather evidence and finish the hospital block

**Files:**

- Add: `frontend/e2e/full-case.e2e.ts`
- Modify as red findings require: scoped simulator components or E2E helpers

- [ ] Enter the case through consent, video and context, then talk to the nurse, acquire PAP and inspect the family before crossing to the listening room.
- [ ] Commit `h1-pap-contencion`, `h2-459-1257` and `h3-integral-psicosocial` from rendered choices.
- [ ] Acquire EPICEE before H3 and assert no evidence-warning/override branch is used.
- [ ] Verify each decision response advances to the exact next node and the institutional exit becomes reachable only after the hospital block closes.

### Task 3: Finish the Comisaría block and validate the report

**Files:**

- Modify: `frontend/e2e/full-case.e2e.ts`

- [ ] Cross to reception, inspect the expediente, enter the consultorio and acquire the structured risk instrument.
- [ ] Commit `c1-riesgo-proteccion-derechos`, `c2-2126-1098-1257` and `c3-integral-derechos` from rendered choices.
- [ ] Assert the final decision response is `COMPLETED`, ending key `integral`, six recommended and zero critical decisions.
- [ ] Assert the rendered outcome/report exposes completion, six recommended decisions, institutional route activated, score/metrics and retry/catalog actions.

### Task 4: Preserve all gates and evidence

**Files:**

- Modify: `docs/audits/2026-07-11-calidad-9-10-evidencia.md`

- [ ] Run the new `@full-case` journey red-to-green, then full frontend tests, clean production build and complete E2E suite.
- [ ] Verify teardown leaves ports 5544/8093/4315 and Compose containers/networks/volumes at zero.
- [ ] Record exact counts, the six decisions and the boundary between automated route proof and pending clinical SME/manual assistive-technology validation.

## Acceptance

- The full journey uses visible/keyboard gameplay controls; no direct test request mutates attempt state.
- Four evidence requirements are satisfied without choosing the incomplete-information override.
- Six distinct decision POSTs advance through the canonical nodes and end in `cierre-caso`.
- The backend and rendered report agree on `COMPLETED`, integral ending, recommended `6`, critical `0`, and activated institutional route.
