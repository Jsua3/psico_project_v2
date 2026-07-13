# NARRATIVE-01 Line-by-Line Dialogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present one authored intervention at a time, with the active line controlling speaker, emotion, portrait, typewriter text, keyboard progression, and choice visibility.

**Architecture:** `DialoguePanelComponent` owns a reactive line index. Changing the dialogue resets it to zero; advancing a completed non-final line starts the typewriter for the next line. Choices remain hidden until the final line completes. The existing `DialogueState` stays stable; its per-line `speakerName` and `emotion` plus the dialogue portrait key drive active presentation.

**Tech Stack:** Angular 21 signals, Jest/jsdom, Angular CDK focus trap.

---

### Task 1: Prove and implement per-line progression

**Files:**

- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.spec.ts`
- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.ts`

- [x] Write an Angular component test with two lines (`Primera`, `Segunda`) and one choice. Assert only `Primera` is displayed initially; after completing the first typewriter, choices remain hidden; after `advanceLine()`, only `Segunda` is typed; choices appear only after completing the second line.
- [x] Run `npm run test:frontend -- --runInBand src/app/features/simulator/dialogue-panel.component.spec.ts` and confirm the old component exposes both lines as one string.
- [x] Replace the numeric `currentLineIndex` with a signal, add `currentLine()`, `isLastLine()` and `advanceLine()`, and start/skip the typewriter using only `currentLine().text`.
- [x] Bind speaker, emotion, portrait resolution and the dialog accessible name to the active line. Render choices only when `isLastLine()` and typing is complete.
- [x] Re-run the focused test and commit `feat(narrative): avanzar diálogo por intervención`.

### Task 2: Make Enter and Space deterministic

**Files:**

- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.spec.ts`
- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.ts`

- [x] Add a failing keyboard test: Enter/Space while typing completes the current line; the next press advances exactly one line; neither key skips two lines; on the completed final line they expose choices or close a no-choice dialogue.
- [x] Run the focused spec and verify the failure is progression-related.
- [x] Route Enter and Space through one method: skip current typewriter, advance a completed non-final line, and on the final line leave choices available or emit close when there are none. Preserve Escape and numeric-choice behavior.
- [x] Re-run the focused spec and all frontend tests; commit `fix(narrative): unificar avance por teclado`.

### Task 3: Verify rendered dialogue behavior

**Files:**

- Modify: `frontend/e2e/living-world.e2e.ts`
- Modify: `docs/audits/2026-07-11-calidad-9-10-evidencia.md`

- [x] Add a Playwright regression that opens a real multi-line dialogue, proves later text is absent before advancement, advances with keyboard, and confirms focus remains inside the dialog.
- [x] Run `npm run test:e2e` and record exact API/Playwright counts.
- [x] Append evidence without claiming Axe or the four-viewport matrix; commit `docs(audit): registrar narrativa por intervención`.

## Self-review

- The design keeps authored data stable and moves only presentation/progression responsibility.
- Speaker/emotion/portrait never come from a future line.
- Choices cannot appear before the final intervention is fully readable.
- Escape, numeric shortcuts, focus trap and reduced motion remain unchanged.
