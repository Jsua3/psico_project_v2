# CLINICAL-LOOP-01 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist evidence overrides and clinical HUD state in Django, then hydrate the simulator from that state.

**Architecture:** `choose_decision` receives bounded override metadata and writes it only on a committed decision event. `case_effects` derives a clinical DTO from the persisted attempt world state; attempt DTOs expose it on start, decision, refresh and resume. Angular stops applying a local feedback reducer after decisions.

**Tech Stack:** Django/DRF/pytest, Angular/Jest, existing `AttemptWorldState.flags_json`.

---

### Task 1: Trace an evidence override in the committed decision event

**Files:**

- Modify: `backend_django/apps/simulation/serializers/requests.py:9-12`
- Modify: `backend_django/apps/simulation/views/game_views.py:110-120`
- Modify: `backend_django/apps/simulation/services/game_service.py:302-374`
- Test: `backend_django/apps/simulation/tests/test_game.py`

- [ ] Write a failing endpoint test that posts `evidenceOverride: true` and `missingEvidence: ["Hablar con la familia", "Usar PAP"]`, then asserts the selected-decision `AttemptEvent.detail` contains both labels.
- [ ] Run `npm run test:backend -- apps/simulation/tests/test_game.py::test_decision_override_persists_missing_evidence -q` and confirm it fails before implementation.
- [ ] Extend `SelectDecisionRequest` with `evidenceOverride = serializers.BooleanField(required=False, default=False)` and `missingEvidence = serializers.ListField(child=serializers.CharField(max_length=160), required=False, default=list, max_length=8)`.
- [ ] Pass those fields into `choose_decision`; when the decision commits, normalize unique non-empty labels and append ` | Override de evidencia: <labels>` to its event detail. Never create this trace for a retry-required response.
- [ ] Re-run the focused test and commit `feat(clinical): trazar override de evidencia`.

### Task 2: Return persisted clinical state with every attempt DTO

**Files:**

- Modify: `backend_django/apps/simulation/services/case_effects.py:220-254`
- Modify: `backend_django/apps/simulation/serializers/game_dtos.py:225-246`
- Modify: `frontend/src/app/core/models/simulation.model.ts:35-58`
- Test: `backend_django/apps/simulation/tests/test_caso_pdf.py:196-208`

- [ ] Write a failing assertion after `h1-pap-contencion` for `state["clinicalState"]["papApplied"] is True` and persisted patient metrics in the decision DTO.
- [ ] Run `npm run test:backend -- apps/simulation/tests/test_caso_pdf.py::test_decision_hospital_recomendada_aplica_flags -q` and confirm `clinicalState` is absent.
- [ ] Add `clinical_state(attempt)` in `case_effects`: read persisted flags/metrics, set `papApplied`, and map `calidad_duelo`, `confianza`, `confianza`, and `crisis_emocional` to `emotionalState`, `trustLevel`, `openness`, and `crisisLevel` respectively.
- [ ] Add `clinicalState` to `game_dtos.attempt_state` and matching TypeScript interfaces.
- [ ] Re-run the focused test and commit `feat(clinical): exponer estado clínico autoritativo`.

### Task 3: Hydrate patient visuals from `clinicalState`

**Files:**

- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts:1494-1517,1852-1858`
- Modify: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`

- [ ] Write a failing observable-state test that resolves `chooseDecision` with an attempt containing `clinicalState.patient` and asserts `patientState()` equals that exact server value.
- [ ] Run `npm run test:frontend -- --runInBand src/app/features/simulator/simulation-play.consent-gate.spec.ts` and confirm it fails while the local reducer computes the value.
- [ ] Add one `hydrateClinicalState(attempt)` helper that updates the signal and Phaser visual from `attempt.clinicalState.patient`; call it after decision responses and world bootstrap/refresh. Remove `applyFeedbackToPatient` from the decision path.
- [ ] Run the focused spec and `npm run test:frontend`, then commit `fix(clinical): hidratar HUD desde servidor`.

### Task 4: Verify the vertical clinical slice and audit it

**Files:**

- Modify: `docs/audits/2026-07-11-calidad-9-10-evidencia.md`

- [ ] Run `npm run test:backend -- apps/simulation/tests/test_game.py apps/simulation/tests/test_caso_pdf.py -q`, `npm run test:frontend`, and `npm run test:e2e`.
- [ ] Record exact counts and explicitly leave SME content review, narrative line progression, Axe, and the viewport matrix as pending if still unverified.
- [ ] Commit `docs(audit): registrar bucle clínico autoritativo`.

## Self-review

- Override data is bounded audit evidence and is recorded only with a committed decision.
- Patient state is derived from persisted world metrics, so reload and resume do not depend on a browser reducer.
- The plan improves technical integrity but does not claim SME validation of the authored clinical material.
