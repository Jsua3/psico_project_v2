# Premium Dialogue, Contextual HUD, and Controlled Liquid Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current web-panel-like conversation flow with non-blocking ambient speech and a cinematic, accessible dialogue layer; synchronize portrait and world actor presentation, make the HUD contextual with controlled Liquid Glass, and remove the student chatbot completely.

**Architecture:** Angular remains the authority for dialogue/session/HUD state. Portrait and body identity are projected only from the active `SceneActorV1.renderPlan`, the selected player `AvatarRenderPlan`, or `resolveActorRenderPlan(CharacterManifestV1, actorId)` for an authored actor that is not spatially loaded; narrative portrait state comes only from Plan 1's `resolveNarrativePortraitState(CharacterManifestV1, emotion)` and fails closed for an unauthored emotion. Angular sends immutable `ActorPresentationState` and `AmbientDialogueState` values through the existing `GameWorldPort`; the ambient value is a stateful `set-ambient-dialogue` command, never a scene setter or a second callback. Cinematic copy remains closed until the same port emits the runtime-owned `actor-presentation-ready` event after its authored turn and pre-speech pause. Phaser owns only the in-world actor pose and ambient bubble rendering; cinematic text, focus, choices, accessibility, and Liquid Glass stay in Angular. The student chatbot is removed from the frontend bundle and its backend route is disabled by an explicit default-off feature flag.

**Tech Stack:** Angular 21 standalone components and signals, TypeScript 5.9, Phaser 3.90, Angular CDK a11y, Jest 30/jsdom, Playwright 1.60, Django REST Framework/pytest.

**Product authority:** `docs/superpowers/specs/2026-07-13-sim-vbg-001-premium-gameplay-design.md` sections 7, 10, 13, 14, and 15.

**Execution order:** First complete the character/manifest plan, including its generated `clinicalEmotionPortraitStates` and strict resolver, then Tasks 1–14 of `docs/superpowers/plans/2026-07-13-world-runtime-motion-camera.md`, including the actor-presentation port, semantic input router, and runtime gate. Then complete this plan before `docs/superpowers/plans/2026-07-13-audio-atmosphere-premium.md`; the audio plan replaces the compatibility `AudioDirectorService` calls left here with the single mixer.

---

## File map

### Create

- `frontend/src/app/features/simulator/dialogue/dialogue-presentation.model.ts` — ambient/cinematic dialogue-only contracts.
- `frontend/src/app/features/simulator/dialogue/dialogue-presentation.util.ts` — pure projection from backend dialogue data to actor/portrait presentation.
- `frontend/src/app/features/simulator/dialogue/dialogue-presentation.util.spec.ts` — projection, fallback, ambient/cinematic classification tests.
- `frontend/src/app/features/simulator/dialogue/punctuation-typewriter.util.ts` — punctuation-aware typewriter schedule.
- `frontend/src/app/features/simulator/dialogue/punctuation-typewriter.util.spec.ts` — speed, pause, and reduced-motion tests.
- `frontend/src/app/features/simulator/hud-visibility.util.ts` — one policy for contextual HUD visibility.
- `frontend/src/app/features/simulator/hud-visibility.util.spec.ts` — explore/dialogue/journal/outcome visibility matrix.
- `frontend/src/styles/_simulator-liquid-glass.scss` — simulator-scoped glass material, static fallback, ripple, and reduced-motion behavior.
- `frontend/e2e/dialogue-hud-premium.e2e.ts` — desktop visual/accessibility/chatbot-network gates.
- `backend_django/apps/simulation/tests/test_ai_assistant_disabled.py` — default-off endpoint contract.

### Modify

- `frontend/src/styles/styles.scss` — import the simulator-only glass partial.
- `frontend/src/app/core/models/simulation.model.ts` — optional presentation metadata without changing the backend-required fields.
- `frontend/src/app/features/simulator/runtime/game-world.port.ts` — add the stateful ambient-dialogue command to the existing Angular↔Phaser port.
- `frontend/src/app/features/simulator/runtime/game-world.port.spec.ts` — latest-value buffering and deterministic flush-order contract.
- `frontend/src/app/features/simulator/dialogue-panel.component.ts` — cinematic layout, portrait state, typewriter, semantic keyboard/gamepad focus, choices, and no render-loop scrolling.
- `frontend/src/app/features/simulator/dialogue-panel.component.spec.ts` — rendered accessibility, timing, fallback, and emitted actor state.
- `frontend/src/app/features/simulator/simulation-view-mode.util.ts` — all blocking conversations use one cinematic mode; ambient speech is separate.
- `frontend/src/app/features/simulator/simulation-view-mode.util.spec.ts` — new mode contract.
- `frontend/src/app/features/simulator/game-world.component.ts` — consume actor state and render/clear an anchored Phaser ambient bubble.
- `frontend/src/app/features/simulator/game-world.component.spec.ts` — wrapper-to-port plumbing, moving anchor, absent anchor, and reduced-motion regressions.
- `frontend/src/app/features/simulator/simulation-play.component.ts` — route ambient vs cinematic dialogue, pass actor state, collapse HUD, remove chatbot.
- `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts` — ambient non-blocking and chatbot absence regressions.
- `frontend/src/app/features/simulator/simulation-hud.component.ts` — contextual/compact HUD, consistent metric semantics, no chatbot controls.
- `frontend/src/app/features/simulator/hud-dock.util.ts` — accept the unified blocking-overlay flag.
- `frontend/src/app/features/simulator/hud-dock.util.spec.ts` — dialogue suppression regression.
- `backend_django/psychosim/settings/base.py` — explicit `AI_ASSISTANT_ENABLED=false` default.
- `backend_django/apps/simulation/views/ai_assistant.py` — fail closed while flag is off.

### Delete

- `frontend/src/app/features/simulator/ai-assistant/ai-assistant.component.ts` — no student runtime component or lazy chunk remains.
- `frontend/src/app/features/simulator/portrait-resolver.util.ts` — remove the legacy parallel portrait catalog; the character manifest is the only visual authority.
- `frontend/src/app/features/simulator/portrait-resolver.util.spec.ts` — remove tests for the deleted parallel catalog.

---

### Task 1: Consume the shared `ActorPresentationState` and define the dialogue projection

**Files:**
- Create: `frontend/src/app/features/simulator/dialogue/dialogue-presentation.model.ts`
- Create: `frontend/src/app/features/simulator/dialogue/dialogue-presentation.util.ts`
- Test: `frontend/src/app/features/simulator/dialogue/dialogue-presentation.util.spec.ts`
- Modify: `frontend/src/app/core/models/simulation.model.ts:231-258`
- Depends on: Tasks 1, 2, and 5 of `docs/superpowers/plans/2026-07-13-character-manifest-editor-premium.md`, which own and generate `clinicalEmotionPortraitStates` plus `resolveNarrativePortraitState`.
- Depends on: Task 2 of `docs/superpowers/plans/2026-07-13-world-runtime-motion-camera.md`, which creates `frontend/src/app/features/simulator/runtime/actor-presentation.model.ts`; that file is the only authority for actor presentation types.

- [ ] **Step 1: Write the failing projection tests**

Create `frontend/src/app/features/simulator/dialogue/dialogue-presentation.util.spec.ts`:

```ts
import { DialogueState, MapObjectState } from '../../../core/models/simulation.model';
import {
  defaultCharacterSelection,
  resolveAvatarRenderPlan,
} from '../../character/avatar-render-plan.util';
import { resolveActorRenderPlan } from '../../character/actor-render-plan.util';
import { makeCharacterManifestFixture } from '../../character/character-test.fixture';
import { SceneActorV1 } from '../runtime/scene-package.model';
import {
  dialoguePresentationKind,
  projectDialoguePresentation,
} from './dialogue-presentation.util';
import { DialogueVisualContext } from './dialogue-presentation.model';

const dialogue = {
  key: 'escucha-segura',
  speakerName: 'Sobreviviente (22 años)',
  emotion: 'sad',
  presentation: { speakerId: 'sobreviviente-consulta', role: 'Consultante' },
  lines: [
    { order: 1, speakerName: 'Sobreviviente (22 años)', text: 'Necesito tiempo.', emotion: 'sad' },
    {
      order: 2,
      speakerName: 'Psicóloga hospitalaria',
      text: 'Podemos ir despacio.',
      emotion: 'positive',
      presentation: { speakerId: 'psicologa-acompanante', role: 'Profesional' },
    },
  ],
  choices: [],
} as DialogueState;

const interaction = {
  key: 'escucha-segura', label: 'Consultante', type: 'PERSON',
} as MapObjectState;

const manifest = makeCharacterManifestFixture();
const survivorPlan = resolveActorRenderPlan(manifest, 'sobreviviente-consulta');
const visualContext: DialogueVisualContext = {
  actors: [{
    actorId: 'sobreviviente-consulta',
    displayName: 'Sobreviviente (22 años)',
    renderPlan: survivorPlan,
  } as SceneActorV1],
  manifest,
  playerRenderPlan: resolveAvatarRenderPlan(manifest, defaultCharacterSelection(manifest)),
  actorLookup: {
    'sobreviviente-22-anos': { actorId: 'sobreviviente-consulta', role: 'Consultante' },
    'psicologa-hospitalaria': { actorId: 'psicologa-acompanante', role: 'Profesional' },
  },
  theme: 'hospital',
};

describe('dialogue presentation', () => {
  it('takes portrait and body identity from the exact SceneActorV1 render plan', () => {
    const projection = projectDialoguePresentation(dialogue, 0, interaction, 'speaking', visualContext);
    expect(projection.actor).toEqual({
      dialogueKey: 'escucha-segura',
      speakerId: 'sobreviviente-consulta',
      listenerId: 'player',
      speakerName: 'Sobreviviente (22 años)',
      role: 'Consultante',
      emotion: 'sad',
      facing: 'toward-listener',
      pose: 'talk',
      speaking: true,
      portraitSrc: survivorPlan.portrait.src,
      usesPixelFallback: false,
    });
    expect(projection.portrait).toBe(survivorPlan.portrait);
    expect(projection.portraitFrames).toEqual(survivorPlan.portrait.states.concerned);
  });

  it('falla cerrado si backend introduce una emoción fuera del manifest', () => {
    const drifted = {
      ...dialogue,
      lines: [{
        order: 1, speakerName: 'Sobreviviente (22 años)',
        text: 'Necesito tiempo.', emotion: 'new-emotion',
      }],
    } as DialogueState;
    expect(() => projectDialoguePresentation(drifted, 0, interaction, 'speaking', visualContext))
      .toThrow(/clinicalEmotionPortraitStates.*new-emotion/);
  });

  it('uses the strict manifest ActorRenderPlan for an authored non-spatial speaker', () => {
    const projection = projectDialoguePresentation(dialogue, 1, interaction, 'speaking', visualContext);
    const expected = resolveActorRenderPlan(manifest, 'psicologa-acompanante');
    expect(projection.actor).toMatchObject({
      speakerId: 'psicologa-acompanante',
      role: 'Profesional',
      speakerName: 'Psicóloga hospitalaria',
      portraitSrc: expected.portrait.src,
      usesPixelFallback: false,
    });
    expect(projection.portrait).toEqual(expected.portrait);
  });

  it('locks the SIM-VBG-001 dialogue IDs to the authoritative manifest mappings', () => {
    expect(manifest.actorMappings['sobreviviente-consulta']).toBe('sobreviviente-vbg');
    expect(manifest.actorMappings['psicologa-acompanante']).toBe('psicologa-hospitalaria');
    expect(dialogue.presentation?.speakerId).toBe('sobreviviente-consulta');
    expect(dialogue.lines[1].presentation?.speakerId).toBe('psicologa-acompanante');
  });

  it('uses a theme-qualified CSS pixel fallback only for a non-actor speaker', () => {
    const unknown = {
      ...dialogue,
      key: 'object-note', speakerName: 'Registro de turno',
      presentation: { speakerId: 'object-note', role: 'Documento' },
      lines: [{ order: 1, speakerName: 'Registro de turno', text: 'Nota.', emotion: 'neutral' }],
    } as DialogueState;
    const projection = projectDialoguePresentation(unknown, 0, null, 'resting', visualContext);
    expect(projection).toMatchObject({
      portrait: null,
      theme: 'hospital',
      actor: { portraitSrc: null, usesPixelFallback: true, pose: 'idle', speaking: false },
    });
  });

  it('keeps short scenery observations ambient and all choices cinematic', () => {
    expect(dialoguePresentationKind({ ...dialogue, choices: [] }, 'Una nota breve del entorno.'))
      .toBe('ambient');
    expect(dialoguePresentationKind({ ...dialogue, choices: [{
      key: 'c1', text: 'Escuchar', decisionOptionId: 7,
      requiredToolCode: null, effect: {},
    }] }, 'Una nota breve del entorno.')).toBe('cinematic');
    expect(dialoguePresentationKind(dialogue, 'x'.repeat(161))).toBe('cinematic');
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run:

```powershell
cd frontend
npx jest dialogue-presentation.util.spec.ts --runInBand
```

Expected: `FAIL` with `Cannot find module './dialogue-presentation.util'`.

- [ ] **Step 3: Add optional backend-compatible presentation metadata**

In `frontend/src/app/core/models/simulation.model.ts`, add the optional field to `DialogueState` without changing any required API field:

```ts
export interface DialoguePresentationMetadata {
  speakerId?: string;
  role?: string;
}

// Add to the existing DialogueLineState and DialogueState without changing
// any other transport field:
// presentation?: DialoguePresentationMetadata;
```

Also add `presentation?: DialoguePresentationMetadata` to the existing
`DialogueLineState`; no other line field changes. Root metadata applies only
when the active line speaker matches the root speaker. Do not add a portrait
selector or asset path to either metadata interface: executable visual identity
comes from the character manifest contracts below. Existing backend transport
fields remain wire-compatible but are inert at this presentation boundary.

- [ ] **Step 4: Create the immutable presentation contracts**

Create `frontend/src/app/features/simulator/dialogue/dialogue-presentation.model.ts`. Do not redeclare `ActorPresentationState` here:

```ts
import type { AvatarRenderPlan } from '../../character/avatar-render-plan.model';
import type { CharacterManifestV1 } from '../../character/character-manifest.model';
import type { ActorPresentationState } from '../runtime/actor-presentation.model';
import type { SceneActorV1 } from '../runtime/scene-package.model';

export type DialoguePresentationKind = 'ambient' | 'cinematic';
export type DialoguePresentationPhase = 'prepare' | 'speaking' | 'resting';

export interface AmbientDialogueState {
  readonly key: string;
  readonly anchorKey: string;
  readonly speakerName: string;
  readonly text: string;
  readonly durationMs: number;
}

export interface DialogueActorLookupEntry {
  readonly actorId: string;
  readonly role: string | null;
}

export type DialogueActorLookup = Readonly<Record<string, DialogueActorLookupEntry>>;

export interface DialogueVisualContext {
  readonly actors: readonly SceneActorV1[];
  readonly manifest: CharacterManifestV1;
  readonly playerRenderPlan: AvatarRenderPlan;
  readonly actorLookup: DialogueActorLookup;
  readonly theme: string;
}

export interface DialoguePresentationProjection {
  readonly actor: ActorPresentationState;
  readonly portrait: AvatarRenderPlan['portrait'] | null;
  readonly portraitFrames: readonly number[];
  readonly theme: string;
}
```

`ActorRenderPlan['portrait']` and `AvatarRenderPlan['portrait']` are the same
shared render-core shape, so the projection stores that shape once through
`AvatarRenderPlan['portrait']`; it does not create another asset contract.

- [ ] **Step 5: Implement the pure projection**

Create `frontend/src/app/features/simulator/dialogue/dialogue-presentation.util.ts`:

```ts
import type { DialogueState, MapObjectState } from '../../../core/models/simulation.model';
import type { AvatarRenderPlan } from '../../character/avatar-render-plan.model';
import { resolveActorRenderPlan } from '../../character/actor-render-plan.util';
import { resolveNarrativePortraitState } from '../../character/clinical-emotion-portrait.util';
import type {
  DialoguePresentationKind,
  DialoguePresentationPhase,
  DialoguePresentationProjection,
  DialogueVisualContext,
} from './dialogue-presentation.model';

const AMBIENT_MAX_CHARACTERS = 160;

export function stableSpeakerId(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'narrator';
}

export function dialoguePresentationKind(
  dialogue: DialogueState,
  text: string,
): DialoguePresentationKind {
  if (dialogue.choices.length > 0) return 'cinematic';
  return text.trim().length <= AMBIENT_MAX_CHARACTERS ? 'ambient' : 'cinematic';
}

function renderPlanForSpeaker(
  speakerId: string,
  context: DialogueVisualContext,
): { readonly portrait: AvatarRenderPlan['portrait'] } | null {
  if (speakerId === 'player') return context.playerRenderPlan;
  const spatialActor = context.actors.find(actor => actor.actorId === speakerId);
  if (spatialActor) return spatialActor.renderPlan;
  if (Object.prototype.hasOwnProperty.call(context.manifest.actorMappings, speakerId)) {
    return resolveActorRenderPlan(context.manifest, speakerId);
  }
  return null;
}

export function projectDialoguePresentation(
  dialogue: DialogueState,
  lineIndex: number,
  interaction: MapObjectState | null,
  phase: DialoguePresentationPhase,
  context: DialogueVisualContext,
): DialoguePresentationProjection {
  const safeIndex = Math.min(Math.max(0, lineIndex), Math.max(0, dialogue.lines.length - 1));
  const line = dialogue.lines[safeIndex];
  const speakerName = line?.speakerName?.trim() || dialogue.speakerName.trim() || 'Intervención';
  const emotion = line?.emotion?.trim() || dialogue.emotion.trim() || 'neutral';
  const rootSpeaker = stableSpeakerId(dialogue.speakerName);
  const speakerKey = stableSpeakerId(speakerName);
  const isRootSpeaker = speakerKey === rootSpeaker;
  const linePresentation = line?.presentation;
  const actor = context.actorLookup[speakerKey];
  const interactionActorId = isRootSpeaker && interaction?.type === 'PERSON'
    && (context.actors.some(item => item.actorId === interaction.key)
      || Object.prototype.hasOwnProperty.call(context.manifest.actorMappings, interaction.key))
      ? interaction.key
      : null;
  const speakerId = linePresentation?.speakerId
    || actor?.actorId
    || (isRootSpeaker ? dialogue.presentation?.speakerId : null)
    || interactionActorId
    || stableSpeakerId(speakerName);
  const renderPlan = renderPlanForSpeaker(speakerId, context);
  const portrait = renderPlan?.portrait ?? null;
  const portraitState = resolveNarrativePortraitState(context.manifest, emotion);

  return {
    actor: {
      dialogueKey: dialogue.key,
      speakerId,
      listenerId: 'player',
      speakerName,
      role: linePresentation?.role?.trim()
        || actor?.role?.trim()
        || (isRootSpeaker ? dialogue.presentation?.role?.trim() : null)
        || (isRootSpeaker && interaction?.type === 'PERSON' ? interaction.label.trim() : null),
      emotion,
      facing: 'toward-listener',
      pose: phase === 'resting' ? 'idle' : 'talk',
      speaking: phase !== 'resting',
      portraitSrc: portrait?.src ?? null,
      usesPixelFallback: portrait === null,
    },
    portrait,
    portraitFrames: portrait?.states[portraitState] ?? [],
    theme: context.theme,
  };
}
```

Authority order is exact: `SceneActorV1.renderPlan` for a spatial actor, the
selected `AvatarRenderPlan` for `player`, then strict
`resolveActorRenderPlan(manifest, speakerId)` only when `actorMappings` contains
the authored ID. A strict resolver error propagates; it must not be caught and
converted into a generic visual. Only narrators/documents that are intentionally
not actors may return `portrait: null`, which selects the theme-qualified CSS
pixel silhouette in Task 3. The new projection may not infer a filename, slug,
tint, or preset; Task 3 deletes the old catalog immediately after migrating its
last panel consumer. Narrative emotion has the same fail-closed rule:
`resolveNarrativePortraitState` from Plan 1 reads
`CharacterManifestV1.clinicalEmotionPortraitStates`; this file contains no
second mapping and never converts an unknown value to `neutral`.

- [ ] **Step 6: Run the projection tests**

Run:

```powershell
cd frontend
npx jest dialogue-presentation.util.spec.ts --runInBand
$forbidden = @('portrait-resolver', ('portrait' + 'Key'))
$legacyReads = Select-String `
  -Path 'src/app/features/simulator/dialogue/dialogue-presentation.util.ts' `
  -Pattern $forbidden
if ($legacyReads) { $legacyReads | Format-Table; exit 1 }
```

Expected: `PASS`, 6 tests; the exact SIM-VBG-001 mappings, spatial plan,
manifest plan, manifest-backed emotion, unknown-emotion rejection and non-actor
fallback are covered; the new projection has no dependency on the old catalog
or its selector.

- [ ] **Step 7: Commit the presentation contract**

```powershell
git add frontend/src/app/core/models/simulation.model.ts frontend/src/app/features/simulator/dialogue
git commit -m "feat(dialogue): define actor presentation contract"
```

---

### Task 2: Replace the fixed interval with a punctuation-aware, reduced-motion-safe typewriter

**Files:**
- Create: `frontend/src/app/features/simulator/dialogue/punctuation-typewriter.util.ts`
- Test: `frontend/src/app/features/simulator/dialogue/punctuation-typewriter.util.spec.ts`
- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.ts:1-20, 444-602`
- Test: `frontend/src/app/features/simulator/dialogue-panel.component.spec.ts`

- [ ] **Step 1: Write the failing schedule tests**

Create `frontend/src/app/features/simulator/dialogue/punctuation-typewriter.util.spec.ts`:

```ts
import { typewriterSchedule } from './punctuation-typewriter.util';

describe('typewriterSchedule', () => {
  it('uses 40 characters per second for ordinary text', () => {
    expect(typewriterSchedule('Hola', false).map(step => step.delayMs))
      .toEqual([25, 25, 25, 25]);
  });

  it('adds authored pauses after punctuation without slowing spaces', () => {
    const schedule = typewriterSchedule('Sí, vamos.', false);
    expect(schedule[2].delayMs).toBe(115);
    expect(schedule.at(-1)?.delayMs).toBe(245);
  });

  it('returns one immediate complete step under reduced motion', () => {
    expect(typewriterSchedule('Texto completo', true)).toEqual([{
      visibleCharacters: 14,
      delayMs: 0,
    }]);
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run:

```powershell
cd frontend
npx jest punctuation-typewriter.util.spec.ts --runInBand
```

Expected: `FAIL` with a missing module error.

- [ ] **Step 3: Implement the schedule**

Create `frontend/src/app/features/simulator/dialogue/punctuation-typewriter.util.ts`:

```ts
export interface TypewriterStep {
  readonly visibleCharacters: number;
  readonly delayMs: number;
}

const BASE_DELAY_MS = 25; // 40 cps, inside the approved 35-45 cps range.
const PAUSE_MS: Readonly<Record<string, number>> = {
  ',': 90,
  ';': 130,
  ':': 130,
  '.': 220,
  '!': 220,
  '?': 220,
  '…': 300,
};

export function typewriterSchedule(text: string, reducedMotion: boolean): TypewriterStep[] {
  if (!text.length) return [];
  if (reducedMotion) return [{ visibleCharacters: text.length, delayMs: 0 }];
  return Array.from(text, (_, index) => ({
    visibleCharacters: index + 1,
    delayMs: BASE_DELAY_MS + (PAUSE_MS[text[index]] ?? 0),
  }));
}
```

- [ ] **Step 4: Make `DialoguePanelComponent` consume recursive timeouts and remove render-loop scrolling**

In `dialogue-panel.component.ts`:

1. Remove `AfterViewChecked` from the import and class declaration.
2. Remove `CHARS_PER_SEC`, `TYPEWRITER_INTERVAL_MS`, and `ngAfterViewChecked()`.
3. Import `typewriterSchedule`.
4. Add `readonly reducedMotion = input.required<boolean>();` beside `mode`; the
   parent supplies the already-combined OS/user policy.
5. Replace the interval field and methods with this complete block:

```ts
private typewriterHandle: ReturnType<typeof setTimeout> | null = null;

private startTypewriter(text: string): void {
  this.stopTypewriter();
  const schedule = typewriterSchedule(text, this.reducedMotion());
  if (!schedule.length || this.reducedMotion()) {
    this.displayedText.set(text);
    this.isTypingComplete.set(true);
    this.requestDialogueFocus();
    return;
  }

  this.displayedText.set('');
  this.isTypingComplete.set(false);
  this.requestDialogueFocus();
  let index = 0;
  const reveal = (): void => {
    const step = schedule[index];
    this.displayedText.set(text.slice(0, step.visibleCharacters));
    index += 1;
    if (index >= schedule.length) {
      this.typewriterHandle = null;
      this.isTypingComplete.set(true);
      this.requestDialogueFocus();
      return;
    }
    this.typewriterHandle = setTimeout(reveal, schedule[index - 1].delayMs);
  };
  this.typewriterHandle = setTimeout(reveal, schedule[0].delayMs);
}

private stopTypewriter(): void {
  if (this.typewriterHandle !== null) {
    clearTimeout(this.typewriterHandle);
    this.typewriterHandle = null;
  }
}
```

The hidden live region remains bound to `fullText()` once; the visible animated paragraph remains `aria-hidden="true"`.

- [ ] **Step 5: Replace the obsolete timing assertions with component behavior tests**

Append to `dialogue-panel.component.spec.ts`:

```ts
it('uses punctuation-aware typing and Enter completes without advancing twice', () => {
  jest.useFakeTimers();
  try {
    render({
      ...MULTI_LINE_DIALOGUE,
      lines: [{ order: 1, speakerName: 'Narradora', text: 'Sí, vamos.', emotion: 'neutral' }],
      choices: [],
    });
    jest.advanceTimersByTime(76);
    expect(component.displayedText()).toBe('Sí,');

    component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(component.displayedText()).toBe('Sí, vamos.');
    expect(component.isTypingComplete()).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

it('renders the whole line immediately when reduced motion is enabled', () => {
  writeInputSignal(component.reducedMotion, true);
  render(MULTI_LINE_DIALOGUE);
  expect(component.displayedText()).toBe('Primera');
  expect(component.isTypingComplete()).toBe(true);
});
```

- [ ] **Step 6: Run focused tests and build**

Run:

```powershell
cd frontend
npx jest punctuation-typewriter.util.spec.ts dialogue-panel.component.spec.ts --runInBand
npm run build
```

Expected: both Jest suites `PASS`; Angular production build succeeds without a component-style budget error.

- [ ] **Step 7: Commit the typewriter behavior**

```powershell
git add frontend/src/app/features/simulator/dialogue frontend/src/app/features/simulator/dialogue-panel.component.ts frontend/src/app/features/simulator/dialogue-panel.component.spec.ts
git commit -m "feat(dialogue): add punctuation aware accessible typewriter"
```

---

### Task 3: Emit portrait/body presentation state and rebuild the cinematic panel

**Files:**
- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.ts`
- Test: `frontend/src/app/features/simulator/dialogue-panel.component.spec.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Test: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`
- Delete: `frontend/src/app/features/simulator/portrait-resolver.util.ts`
- Delete: `frontend/src/app/features/simulator/portrait-resolver.util.spec.ts`
- Depends on: the runtime plan's typed actor-presentation timeline and
  `actor-presentation-ready` `GameWorldEvent`; this plan consumes but never
  redefines that timing contract.

- [ ] **Step 1: Write failing tests for state emission and the pixel fallback**

Append to `dialogue-panel.component.spec.ts`:

```ts
beforeEach(() => writeInputSignal(component.visualContext, visualContext));

it('emits matching portrait/body state when a line starts and stops speaking', () => {
  const states: ActorPresentationState[] = [];
  component.presentationChange.subscribe(state => {
    if (state) states.push(state);
  });
  render({
    ...MULTI_LINE_DIALOGUE,
    key: 'escucha-segura',
    speakerName: 'Sobreviviente (22 años)',
    emotion: 'vulnerable',
    presentation: { speakerId: 'sobreviviente-consulta', role: 'Consultante' },
    lines: [{ order: 1, speakerName: 'Sobreviviente (22 años)', text: 'Necesito apoyo.', emotion: 'vulnerable' }],
    choices: [],
  });
  expect(states.at(-1)).toMatchObject({ speakerId: 'sobreviviente-consulta', pose: 'talk', speaking: true });
  acknowledgePreparedActor('escucha-segura', 'sobreviviente-consulta', 330);
  component.skipTypewriter();
  expect(states.at(-1)).toMatchObject({ speakerId: 'sobreviviente-consulta', pose: 'idle', speaking: false });
});

it('renders a CSS pixel silhouette, not an SVG, when no portrait exists', () => {
  render({
    ...MULTI_LINE_DIALOGUE,
    speakerName: 'Registro de turno',
    presentation: { speakerId: 'object-note', role: 'Documento' },
    lines: [{ order: 1, speakerName: 'Registro de turno', text: 'Nota.', emotion: 'neutral' }],
    choices: [],
  });
  expect(fixture.nativeElement.querySelector('.portrait-fallback')).not.toBeNull();
  expect(fixture.nativeElement.querySelector('.portrait-fallback')?.getAttribute('data-theme'))
    .toBe('hospital');
  expect(fixture.nativeElement.querySelector('.portrait svg')).toBeNull();
  expect(fixture.nativeElement.querySelector('.emotion-tag')).toBeNull();
});

it('keeps cinematic copy closed until the matching runtime presentation is ready', () => {
  jest.useFakeTimers();
  try {
    render(SURVIVOR_DIALOGUE);
    expect(component.textGateOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="cinematic-copy"]')).toBeNull();

    jest.advanceTimersByTime(349);
    expect(component.textGateOpen()).toBe(false);

    const ready = {
      type: 'actor-presentation-ready',
      dialogueKey: 'escucha-segura',
      speakerId: 'sobreviviente-consulta',
      elapsedMs: 330,
    } as ActorPresentationReadyEvent;
    expect(ready.elapsedMs).toBeLessThanOrEqual(350);
    writeInputSignal(component.presentationReady, ready);
    fixture.detectChanges();

    expect(component.textGateOpen()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="cinematic-copy"]')).not.toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

it('reports a missed 350 ms budget without manufacturing readiness', () => {
  jest.useFakeTimers();
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    render(SURVIVOR_DIALOGUE);
    jest.advanceTimersByTime(351);
    expect(component.textGateOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="cinematic-copy"]')).toBeNull();
    expect(error).toHaveBeenCalledWith(
      '[dialogue] actor presentation readiness exceeded',
      { dialogueKey: 'escucha-segura', speakerId: 'sobreviviente-consulta', budgetMs: 350 },
    );
  } finally {
    error.mockRestore();
    jest.useRealTimers();
  }
});
```

Use `makeCharacterManifestFixture`, `resolveAvatarRenderPlan`,
`resolveActorRenderPlan`, and the same `visualContext` fixture from Task 1. Add
imports for `ActorPresentationState`, `GameWorldEvent`, and the extracted
`ActorPresentationReadyEvent`. The test fixture must use the exact payload
defined by the completed runtime plan; no local mock-only event interface is
allowed.

```ts
import { ActorPresentationState } from './runtime/actor-presentation.model';
```

- [ ] **Step 2: Add actor context and presentation outputs**

Add these imports and declarations to `DialoguePanelComponent`. The ready event
is owned by the runtime plan and is consumed through the existing
`GameWorldEvent` union; do not redeclare its payload here:

```ts
import type { ActorPresentationState } from './runtime/actor-presentation.model';
import type { GameWorldEvent } from './runtime/game-world.port';
import { projectDialoguePresentation } from './dialogue/dialogue-presentation.util';
import type {
  DialoguePresentationPhase,
  DialoguePresentationProjection,
  DialogueVisualContext,
} from './dialogue/dialogue-presentation.model';

type ActorPresentationReadyEvent = Extract<GameWorldEvent, {
  type: 'actor-presentation-ready';
}>;

readonly presentationChange = output<ActorPresentationState | null>();
readonly visualContext = input.required<DialogueVisualContext>();
readonly presentationReady = input<ActorPresentationReadyEvent | null>(null);
readonly activeProjection = signal<DialoguePresentationProjection | null>(null);
readonly textGateOpen = signal(false);
readonly acceptedReadyElapsedMs = signal<number | null>(null);
```

`prepare` and `speaking` both describe the same target actor state (`talk`,
`speaking:true`); `prepare` exists so the panel can hold its text while the
runtime performs the authored turn and pre-speech pause. Add these methods:

```ts
private projectPresentation(phase: DialoguePresentationPhase): DialoguePresentationProjection | null {
  const dialogue = this.dialogue();
  if (!dialogue) {
    this.activeProjection.set(null);
    this.presentationChange.emit(null);
    return null;
  }
  const projection = projectDialoguePresentation(
    dialogue,
    this.lineIndex(),
    this.interaction(),
    phase,
    this.visualContext(),
  );
  this.activeProjection.set(projection);
  this.presentationChange.emit(projection.actor);
  return projection;
}

private prepareCurrentLine(): void {
  this.stopTypewriter();
  this.stopPortraitAnimation();
  this.textGateOpen.set(false);
  this.acceptedReadyElapsedMs.set(null);
  const projection = this.projectPresentation('prepare');
  if (!projection) return;
  this.portraitFrameIndex.set(projection.portraitFrames[0] ?? 0);
  this.armPresentationWatchdog(projection.actor);
}

private acceptPresentationReady(event: ActorPresentationReadyEvent): void {
  const projection = this.activeProjection();
  if (!projection || this.textGateOpen()) return;
  if (event.dialogueKey !== projection.actor.dialogueKey
      || event.speakerId !== projection.actor.speakerId) return;
  this.clearPresentationWatchdog();
  this.acceptedReadyElapsedMs.set(event.elapsedMs);
  this.textGateOpen.set(true);
  this.startPortraitAnimation(projection);
  this.startTypewriter(this.fullText());
}
```

Add the complete timer/frame implementation (and import `computed`, `effect`,
and `isDevMode` from Angular):

```ts
const PRESENTATION_READY_BUDGET_MS = 350;

readonly portraitFrameIndex = signal(0);
readonly portraitColumn = computed(() => {
  const columns = this.activeProjection()?.portrait?.columns ?? 1;
  return this.portraitFrameIndex() % columns;
});
readonly portraitRow = computed(() => {
  const columns = this.activeProjection()?.portrait?.columns ?? 1;
  return Math.floor(this.portraitFrameIndex() / columns);
});

private portraitTimer: ReturnType<typeof setInterval> | null = null;
private presentationWatchdog: ReturnType<typeof setTimeout> | null = null;

private readonly presentationReadyEffect = effect(() => {
  const event = this.presentationReady();
  if (event) this.acceptPresentationReady(event);
});

private startPortraitAnimation(projection: DialoguePresentationProjection): void {
  this.stopPortraitAnimation();
  const frames = projection.portraitFrames;
  this.portraitFrameIndex.set(frames[0] ?? 0);
  const portrait = projection.portrait;
  if (!portrait || frames.length < 2 || this.reducedMotion()) return;
  let frameOffset = 0;
  const intervalMs = Math.max(16, Math.round(1000 / portrait.fps));
  this.portraitTimer = setInterval(() => {
    frameOffset = (frameOffset + 1) % frames.length;
    this.portraitFrameIndex.set(frames[frameOffset]);
  }, intervalMs);
}

private stopPortraitAnimation(): void {
  if (this.portraitTimer !== null) clearInterval(this.portraitTimer);
  this.portraitTimer = null;
}

private armPresentationWatchdog(state: ActorPresentationState): void {
  this.clearPresentationWatchdog();
  this.presentationWatchdog = setTimeout(() => {
    this.presentationWatchdog = null;
    if (!this.textGateOpen() && isDevMode()) {
      console.error('[dialogue] actor presentation readiness exceeded', {
        dialogueKey: state.dialogueKey,
        speakerId: state.speakerId,
        budgetMs: PRESENTATION_READY_BUDGET_MS,
      });
    }
  }, PRESENTATION_READY_BUDGET_MS + 1);
}

private clearPresentationWatchdog(): void {
  if (this.presentationWatchdog !== null) clearTimeout(this.presentationWatchdog);
  this.presentationWatchdog = null;
}
```

Set the first authored portrait frame in `prepareCurrentLine` immediately after
projection, before arming the watchdog, so a previous speaker frame can never
flash while waiting. `ngOnDestroy` calls both stop/clear methods. The readiness
effect is signal-only and creates no second event subscription.

The effect above passes each new non-null `presentationReady()` value to
`acceptPresentationReady`. On initial dialogue and every line advance, call
`prepareCurrentLine`; do not call `startTypewriter` by any other path. On skip,
natural completion, close, and destroy, project `resting` before clearing state.
The 350 ms watchdog is diagnostic only: it logs one development error and leaves
`textGateOpen=false`; it must never manufacture readiness or open the text.
Under reduced motion the runtime may emit readiness in the same task, but the
event remains mandatory.

In `SimulationPlayComponent`, derive one immutable `DialogueVisualContext` from
`ScenePackageV1.actors`, `CharacterProfileRepository.manifest()` and
`.renderPlan()`: normalize each actor `displayName`, preserve its exact
`actorId`, resolve role from the matching interaction label, and use
`scenePackage.map.theme`. Pass it as `[visualContext]`. Authored non-spatial
speakers must carry line/root `speakerId` metadata so the strict manifest
fallback can resolve them. Add an alternation component test using the two-line
fixture; assert body presentation changes from `sobreviviente-consulta` to
`psicologa-acompanante` rather than reusing the root actor.

Consume the runtime plan's existing wrapper output in `SimulationPlayComponent`:

```ts
type ActorPresentationReadyEvent = Extract<GameWorldEvent, {
  type: 'actor-presentation-ready';
}>;

readonly actorPresentationReady = signal<ActorPresentationReadyEvent | null>(null);

handleActorPresentation(state: ActorPresentationState | null): void {
  if (state?.speaking) this.actorPresentationReady.set(null);
  this.actorPresentation.set(state);
}
```

Bind `(actorPresentationReady)="actorPresentationReady.set($event)"` on
`<app-game-world>`, `[presentationReady]="actorPresentationReady()"` on the
panel, and route `(presentationChange)` through `handleActorPresentation`.
This is the same typed port event path, not a scene callback. Clearing the last
ready event before every speaking target prevents a stale same-speaker event
from opening a later line.

In `ngOnDestroy`, emit `null` after clearing typewriter, portrait, close, and
watchdog timers.

Update every pre-existing typewriter/keyboard component test to call one shared
`acknowledgePreparedActor(dialogueKey, speakerId, elapsedMs)` helper before it
expects visible copy or advances typing timers. Gate-specific tests deliberately
omit the helper. This keeps earlier tests honest after the runtime handshake is
introduced.

- [ ] **Step 3: Replace the portrait/name fragment with the approved cinematic hierarchy**

Replace the existing `.portrait` and speaker-name markup with:

```html
<div class="portrait" aria-hidden="true">
  @if (activeProjection(); as projection) {
    @if (projection.portrait && failedPortrait() !== projection.portrait.src) {
      <div class="portrait-frame">
        <img class="portrait-sheet"
          [src]="projection.portrait.src"
          [width]="projection.portrait.width"
          [height]="projection.portrait.height"
          [style.--portrait-column]="portraitColumn()"
          [style.--portrait-row]="portraitRow()"
          alt=""
          (error)="onPortraitError(projection.portrait.src)" />
      </div>
    } @else {
      <div class="portrait-fallback"
        data-testid="pixel-portrait-fallback"
        [attr.data-theme]="projection.theme">
        <span class="portrait-fallback__hair"></span>
        <span class="portrait-fallback__face"></span>
        <span class="portrait-fallback__body"></span>
      </div>
    }
  } @else {
    <div class="portrait-fallback" data-testid="pixel-portrait-fallback" data-theme="neutral">
      <span class="portrait-fallback__hair"></span>
      <span class="portrait-fallback__face"></span>
      <span class="portrait-fallback__body"></span>
    </div>
  }
</div>

<div class="strip-body">
  <header class="speaker-heading">
    <p class="speaker-name">{{ activeProjection()?.actor?.speakerName }}</p>
    @if (activeProjection()?.actor?.role; as role) {
      <p class="speaker-role">{{ role }}</p>
    }
  </header>
```

The role fallback is part of `projectDialoguePresentation`; delete any separate
component resolver so name, role, portrait, and body always come from the same
projection. Drive `portraitColumn`/`portraitRow` from `portraitFrames` and the
manifest-declared `fps`. Freeze on the first authored frame when
`reducedMotion()` is true; otherwise cycle only while `textGateOpen()` is true.
Never infer sheet dimensions or frame order in the component.

Keep manifest-plan absence and portrait-load failure observable in development
without replacing the fallback with a generic asset. Import `isDevMode` from
`@angular/core`, add this de-duplicated helper, call it when the projection has
`portrait: null`, and use this load-error implementation:

```ts
private readonly warnedPortraitFallbacks = new Set<string>();

private warnPortraitFallback(
  dialogueKey: string,
  speakerName: string,
  attemptedSrc: string | null,
): void {
  if (!isDevMode()) return;
  const key = `${dialogueKey}|${speakerName}|${attemptedSrc ?? 'unmapped'}`;
  if (this.warnedPortraitFallbacks.has(key)) return;
  this.warnedPortraitFallbacks.add(key);
  console.warn('[dialogue] pixel portrait fallback', {
    dialogueKey, speakerName, attemptedSrc,
  });
}

onPortraitError(src: string): void {
  this.failedPortrait.set(src);
  const projection = this.activeProjection();
  if (projection) {
    this.warnPortraitFallback(
      projection.actor.dialogueKey,
      projection.actor.speakerName,
      src,
    );
  }
}
```

When `projectPresentation` receives `portrait: null`, call
`warnPortraitFallback` with its projected dialogue/speaker data. Cover both
unmapped and failed-load branches with a `console.warn` spy; assert the exact
prefix/payload, one call per unique key, and restore the spy in `finally`.

Delete `.emotion-chip`, `.emotion-tag`, `emotionLabel()`, and every template use of them. Emotion remains in `ActorPresentationState`, portrait selection, body pose, and audio; it is no longer exposed as a quiz-like text chip.

Replace the existing choice markup at the same time. Before selection it may
render only number and `choice.text`; remove the `evidenceWarning` suffix from
`aria-label`, the `choice-btn__meta--evidence` element and its CSS. Keep the
backend field only for post-consequence/debrief logic. Add a component test with
four choices mixing `evidenceWarning: true/false` and assert their pre-choice DOM
contains neither `Información incompleta`, warning classes, evaluative icons nor
different accessible-name suffixes.

- [ ] **Step 4: Replace the main panel and choice CSS with the controlled glass treatment**

Give the root element these classes:

```html
class="dialogue-strip simulator-glass simulator-glass--dialogue simulator-glass--opening"
[class.simulator-glass--closing]="glassClosing()"
[class.dialogue-strip--waiting]="!textGateOpen()"
[attr.aria-busy]="!textGateOpen()"
[attr.data-presentation-elapsed-ms]="acceptedReadyElapsedMs()"
```

Add a `glassClosing` signal and a single 180 ms close timeout. Route the close button and the keyboard `close` action through `requestClose()`: emit immediately under reduced motion, otherwise set `glassClosing`, ignore repeated close requests, and emit `close` after 180 ms. Clear that timeout in `ngOnDestroy`. This keeps input locked until the exit wave finishes and prevents double close emission.

Do not place the visible paragraph, live-region text, continue control, or choices
in the DOM until `textGateOpen()` is true. The portrait/header may stage while
`aria-busy=true`; the cinematic text layer must not open merely because the
Angular panel mounted. The runtime event is the only opening gate.

Use this complete panel/portrait/choice override at the end of the component styles, then remove the obsolete `dialogue-strip--side` rules:

```css
.dialogue-strip {
  width: min(1180px, calc(100vw - 40px));
  min-height: 224px;
  margin: 0 auto 18px;
  display: grid;
  grid-template-columns: clamp(176px, 18vw, 244px) minmax(0, 1fr);
  overflow: hidden;
  --pixel-cut: 8px;
  border-radius: 0;
  clip-path: polygon(
    var(--pixel-cut) 0,
    calc(100% - var(--pixel-cut)) 0,
    calc(100% - var(--pixel-cut)) 4px,
    100% 4px,
    100% calc(100% - var(--pixel-cut)),
    calc(100% - 4px) calc(100% - var(--pixel-cut)),
    calc(100% - 4px) 100%,
    4px 100%,
    4px calc(100% - var(--pixel-cut)),
    0 calc(100% - var(--pixel-cut)),
    0 4px,
    var(--pixel-cut) 4px
  );
}
.portrait {
  position: relative;
  min-height: 224px;
  display: grid;
  place-items: end center;
  overflow: hidden;
  border-right: 2px solid rgba(199,181,255,.28);
  background: linear-gradient(180deg, rgba(43,34,76,.22), rgba(8,12,18,.56));
}
.portrait-frame {
  width: 96px;
  height: 96px;
  overflow: hidden;
  transform: scale(2);
  transform-origin: bottom center;
  filter: drop-shadow(0 12px 20px rgba(0,0,0,.38));
}
.portrait-sheet {
  display: block;
  max-width: none;
  image-rendering: pixelated;
  transform: translate(
    calc(var(--portrait-column) * -96px),
    calc(var(--portrait-row) * -96px)
  );
}
.portrait-fallback {
  position: relative;
  width: 96px;
  height: 144px;
  --fallback-hair: #242033;
  --fallback-face: #9e806f;
  --fallback-face-shadow: #8c7062;
  --fallback-body: #403b64;
  --fallback-body-shadow: #312d50;
  image-rendering: pixelated;
  filter: drop-shadow(8px 10px 0 rgba(8,12,18,.35));
}
.portrait-fallback[data-theme='hospital'] { --fallback-body: #31516c; --fallback-body-shadow: #23394d; }
.portrait-fallback[data-theme='comisaria'] { --fallback-body: #58456d; --fallback-body-shadow: #3c304b; }
.portrait-fallback[data-theme='consulta'] { --fallback-body: #456052; --fallback-body-shadow: #30453a; }
.portrait-fallback span { position: absolute; display: block; }
.portrait-fallback__hair { left: 22px; top: 14px; width: 52px; height: 44px; background: var(--fallback-hair); box-shadow: -8px 8px var(--fallback-hair), 8px 8px var(--fallback-hair); }
.portrait-fallback__face { left: 28px; top: 40px; width: 40px; height: 44px; background: var(--fallback-face); box-shadow: 0 8px var(--fallback-face-shadow); }
.portrait-fallback__body { left: 18px; top: 88px; width: 60px; height: 50px; background: var(--fallback-body); box-shadow: -8px 16px var(--fallback-body-shadow), 8px 16px var(--fallback-body-shadow); }
.strip-body { min-width: 0; padding: 22px 26px 20px; display: flex; flex-direction: column; gap: 14px; }
.speaker-heading { display: flex; align-items: baseline; gap: 10px; }
.speaker-name { margin: 0; color: #e7ddff; font-size: .84rem; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
.speaker-role { margin: 0; color: rgba(207,195,239,.62); font-size: .72rem; }
.dialogue-text { margin: 0; max-width: 76ch; min-height: 3.3em; color: #f4f1fb; font-family: 'Poppins', system-ui, sans-serif; font-size: clamp(1rem, 1.25vw, 1.16rem); line-height: 1.65; }
.choices { display: grid; grid-template-columns: minmax(0, 1fr); gap: 9px; margin-top: 2px; }
.choice-btn { grid-template-columns: 30px minmax(0, 1fr); min-height: 54px; padding: 11px 14px; border: 2px solid rgba(199,181,255,.28); border-radius: 0; clip-path: polygon(4px 0,calc(100% - 4px) 0,calc(100% - 4px) 2px,100% 2px,100% calc(100% - 4px),calc(100% - 2px) calc(100% - 4px),calc(100% - 2px) 100%,2px 100%,2px calc(100% - 4px),0 calc(100% - 4px),0 2px,4px 2px); background: rgba(20,18,36,.46); box-shadow: inset 0 1px rgba(255,255,255,.06); }
.choice-btn__icon { display: none; }
.choice-num { width: 26px; height: 26px; border-radius: 0; border: 2px solid rgba(199,181,255,.5); background: rgba(124,77,255,.14); image-rendering: pixelated; }
.choice-btn:hover, .choice-btn:focus-visible { border-color: rgba(213,202,255,.72); background: rgba(90,66,142,.28); }
.choice-btn--chosen { border-color: rgba(244,241,251,.9); background: rgba(124,77,255,.3); }
@media (max-width: 760px) {
  .dialogue-strip { width: calc(100vw - 16px); grid-template-columns: 96px minmax(0, 1fr); margin-bottom: 8px; }
  .portrait { min-height: 190px; }
  .strip-body { padding: 15px 14px; }
}
```

- [ ] **Step 5: Replace the duplicate document listener with the shared semantic input router**

Import `GameInputAction` and `GameInputRouterService` from the runtime plan.
Remove `@HostListener('document:keydown')`, `dialogueKeyAction` and `digitIndex`;
the router is already the single keyboard/gamepad owner. Subscribe with
`this.inputRouter.action$.pipe(takeUntilDestroyed()).subscribe(event =>
this.handleInputAction(event.action))` and route both sources through one method:

```typescript
private handleInputAction(action: GameInputAction): void {
  const dialogue = this.dialogue();
  if (!dialogue) return;

  if (action === 'cancel') {
    this.requestClose();
    return;
  }
  // The portrait/header may stage, but no semantic action may reveal, skip,
  // advance, choose, or close copy before the matching readiness event.
  if (!this.textGateOpen()) return;
  if (action === 'confirm') {
    if (!this.isTypingComplete()) {
      this.skipTypewriter();
      return;
    }
    if (!this.isLastLine()) {
      this.advanceLine();
      return;
    }
    const focused = this.host.nativeElement.querySelector<HTMLButtonElement>(
      '.choice-btn:focus',
    );
    if (focused) focused.click();
    else if (this.choicesVisible()) this.focusChoice(0);
    else this.requestClose();
    return;
  }
  if (action === 'up' || action === 'down') {
    if (this.choicesVisible()) this.moveChoiceFocus(action === 'down' ? 1 : -1);
    return;
  }
  const choiceIndex = ({ choice1: 0, choice2: 1, choice3: 2, choice4: 3 }
    as Partial<Record<GameInputAction, number>>)[action];
  if (choiceIndex !== undefined && this.choicesVisible()) {
    const choice = dialogue.choices[choiceIndex];
    if (choice) this.handleChoice(choice);
  }
}

private enabledChoiceButtons(): HTMLButtonElement[] {
  return [...this.host.nativeElement.querySelectorAll<HTMLButtonElement>(
    '.choice-btn:not(:disabled)',
  )].slice(0, 4);
}

private focusChoice(index: number): void {
  const buttons = this.enabledChoiceButtons();
  if (buttons.length === 0) return;
  const wrapped = ((index % buttons.length) + buttons.length) % buttons.length;
  buttons[wrapped].focus();
}

private moveChoiceFocus(delta: -1 | 1): void {
  const buttons = this.enabledChoiceButtons();
  if (buttons.length === 0) return;
  const active = this.document.activeElement;
  const current = buttons.findIndex(button => button === active);
  this.focusChoice((current < 0 ? 0 : current) + delta);
}
```

Inject `DOCUMENT`, the router and `DestroyRef`, then install the single
subscription in the constructor:

```ts
private readonly document = inject(DOCUMENT);
private readonly inputRouter = inject(GameInputRouterService);
private readonly destroyRef = inject(DestroyRef);

constructor() {
  this.inputRouter.action$
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(event => {
      if (event.scope === 'dialogue') this.handleInputAction(event.action);
    });
}
```

Add imports for `DOCUMENT`, `DestroyRef`, `takeUntilDestroyed`,
`GameInputAction`, `GameInputRouterService` and `RoutedInputAction`. In the spec,
provide one `Subject<RoutedInputAction>` as `action$` and append these exact
assertions to the existing render fixture:

```ts
it('keeps pre-ready input inert and routes ready dialogue semantics once', () => {
  jest.useFakeTimers();
  try {
let sequence = 0;
const route = (action: GameInputAction, source: 'keyboard' | 'gamepad'): void =>
  actions.next({ action, source, sequence: ++sequence, startedAt: performance.now(), scope: 'dialogue' });

render(SURVIVOR_DIALOGUE);
const beforeGate = {
  line: component.lineIndex(),
  typing: component.isTypingComplete(),
  projection: component.activeProjection(),
};
jest.advanceTimersByTime(349);
route('confirm', 'keyboard');
component.skipTypewriter();
expect(component.textGateOpen()).toBe(false);
expect(fixture.nativeElement.querySelector('[data-testid="cinematic-copy"]')).toBeNull();
expect({
  line: component.lineIndex(),
  typing: component.isTypingComplete(),
  projection: component.activeProjection(),
}).toEqual(beforeGate);

acknowledgePreparedActor('escucha-segura', 'sobreviviente-consulta', 330);
expect(component.textGateOpen()).toBe(true);

route('confirm', 'keyboard');
expect(component.isTypingComplete()).toBe(true);
expect(component.lineIndex()).toBe(0);
route('confirm', 'keyboard');
expect(component.lineIndex()).toBe(1);

component.skipTypewriter();
route('up', 'gamepad');
expect(document.activeElement).toBe(fixture.nativeElement.querySelectorAll('.choice-btn')[3]);
const choose = jest.spyOn(component, 'handleChoice');
route('confirm', 'gamepad');
expect(choose).toHaveBeenCalledTimes(1);

for (const [offset, action] of ['choice1','choice2','choice3','choice4'].entries()) {
  choose.mockClear();
  route(action as GameInputAction, 'keyboard');
  expect(choose).toHaveBeenCalledWith(component.dialogue()!.choices[offset]);
}
  } finally {
    jest.useRealTimers();
  }
});
```

Use fake timers for cancel, emit `cancel`, assert `presentationChange` has not
yet emitted `null`, advance 179 ms and assert the lock remains, then advance one
millisecond and assert both close and focus restoration occur. Update the Task 2
keyboard test to emit semantic `confirm` instead of calling the removed
`onKeydown` method. The methods query at most four enabled buttons, wrap focus
and never synthesize a click.

Make `skipTypewriter()` return immediately while `textGateOpen()` is false,
before it mutates typewriter, projection, line, focus, or dialogue state. The
semantic router permits `cancel` while waiting so the user is never trapped,
then rejects every other action until the matching `actor-presentation-ready`
event opens the gate. The 349 ms assertion above is mandatory and proves that
both the public skip method and routed confirmation are inert before readiness;
after readiness the same confirmation path must work normally.

- [ ] **Step 6: Run the component tests and build**

Run:

```powershell
cd frontend
npx jest dialogue-panel.component.spec.ts simulation-play.consent-gate.spec.ts --runInBand
npm run build
$legacyModule = Test-Path 'src/app/features/simulator/portrait-resolver.util.ts'
$forbidden = @('portrait-resolver', ('portrait' + 'Key'))
$legacyReads = Get-Item `
  'src/app/features/simulator/dialogue/dialogue-presentation.util.ts', `
  'src/app/features/simulator/dialogue-panel.component.ts' |
  Select-String -Pattern $forbidden
if ($legacyModule -or $legacyReads) { $legacyReads | Format-Table; exit 1 }
```

Expected: both suites `PASS`; no SVG fallback in the rendered test; the copy
gate remains closed until the matching runtime event; build succeeds; the old
catalog file and all selector reads are absent.

- [ ] **Step 7: Commit the cinematic component**

```powershell
git add -A frontend/src/app/features/simulator/dialogue-panel.component.ts frontend/src/app/features/simulator/dialogue-panel.component.spec.ts frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts frontend/src/app/features/simulator/portrait-resolver.util.ts frontend/src/app/features/simulator/portrait-resolver.util.spec.ts
git commit -m "feat(dialogue): present cinematic actor led conversations"
```

---

### Task 4: Separate ambient speech from blocking cinematic dialogue

**Files:**
- Modify: `frontend/src/app/features/simulator/simulation-view-mode.util.ts`
- Test: `frontend/src/app/features/simulator/simulation-view-mode.util.spec.ts`
- Modify: `frontend/src/app/features/simulator/runtime/game-world.port.ts`
- Test: `frontend/src/app/features/simulator/runtime/game-world.port.spec.ts`
- Modify: `frontend/src/app/features/simulator/game-world.component.ts`
- Create: `frontend/src/app/features/simulator/game-world.component.spec.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Test: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`
- Test: `frontend/src/app/features/simulator/dialogue-panel.component.spec.ts`

- [ ] **Step 1: Change the view-mode test to one cinematic route**

Replace the dialogue-specific expectations in `simulation-view-mode.util.spec.ts` with:

```ts
it('uses one cinematic mode for blocking dialogue, with or without choices', () => {
  expect(resolveViewMode({ status: 'IN_PROGRESS', journalOpen: false, dialogue: dialogueWith([choice]) }))
    .toBe('dialogue-cinematic');
  expect(resolveViewMode({ status: 'IN_PROGRESS', journalOpen: false, dialogue: dialogueWith([]) }))
    .toBe('dialogue-cinematic');
});
```

Run:

```powershell
cd frontend
npx jest simulation-view-mode.util.spec.ts --runInBand
```

Expected: `FAIL`; the choice dialogue still resolves to `dialogue-right`.

- [ ] **Step 2: Remove the right-panel mode**

Replace `SimulationViewMode` and the dialogue branch in `simulation-view-mode.util.ts`:

```ts
export type SimulationViewMode =
  | 'explore'
  | 'dialogue-cinematic'
  | 'journal'
  | 'outcome';

export function resolveViewMode(input: ViewModeInput): SimulationViewMode {
  if (input.status && input.status !== 'IN_PROGRESS') return 'outcome';
  if (input.journalOpen) return 'journal';
  if (input.dialogue) return 'dialogue-cinematic';
  return 'explore';
}
```

Run the focused spec again; expected: `PASS`.

- [ ] **Step 3: Write ambient, stateful-port, and wrapper regressions**

Append to `simulation-play.consent-gate.spec.ts`:

```ts
it('shows a short scenery line as ambient speech without locking the player', () => {
  setup(makeAttempt());
  const interaction = {
    key: 'ambient:cartel-turnos', label: 'Cartel de turnos', type: 'INFO',
    interactionText: 'Los turnos nocturnos se coordinan en recepción.',
  } as MapObjectState;

  (component as any).showAmbientDialogue(interaction);

  expect(component.ambientDialogue()).toMatchObject({
    anchorKey: 'ambient:cartel-turnos',
    speakerName: 'Cartel de turnos',
  });
  expect(component.dialogue()).toBeNull();
  expect(component.inputBlocked()).toBe(false);
});
```

Append to `runtime/game-world.port.spec.ts` (reuse its existing typed scene and
command fixtures):

```ts
it('buffers only the latest ambient dialogue and flushes it after selection state', () => {
  const port = new GameWorldPort();
  const received: GameWorldCommand[] = [];
  const latest: AmbientDialogueState = {
    key: 'ambient:cartel-turnos',
    anchorKey: 'ambient:cartel-turnos',
    speakerName: 'Cartel de turnos',
    text: 'Los turnos se coordinan en recepción.',
    durationMs: 4200,
  };

  port.send({ type: 'set-ambient-dialogue', state: { ...latest, text: 'obsoleto' } });
  port.send({ type: 'set-selected-interaction', interactionKey: latest.anchorKey });
  port.send({ type: 'set-ambient-dialogue', state: latest });
  port.attach(command => received.push(command));

  expect(received.map(command => command.type)).toEqual([
    'set-selected-interaction',
    'set-ambient-dialogue',
  ]);
  expect(received[1]).toEqual({ type: 'set-ambient-dialogue', state: latest });
});

it('buffers an explicit ambient clear as the latest state', () => {
  const port = new GameWorldPort();
  const received: GameWorldCommand[] = [];
  port.send({ type: 'set-ambient-dialogue', state: AMBIENT_FIXTURE });
  port.send({ type: 'set-ambient-dialogue', state: null });
  port.attach(command => received.push(command));
  expect(received).toEqual([{ type: 'set-ambient-dialogue', state: null }]);
});
```

Create `game-world.component.spec.ts` with a minimal standalone TestBed and a
local `writeInputSignal` helper matching the simulator component specs. Spy on
`GameWorldPort.prototype.send`, change the `ambientDialogue` input, run
`ngOnChanges`/change detection, and assert exactly
`{ type: 'set-ambient-dialogue', state }`. The fixture must provide the required
runtime inputs, prevent Phaser boot by leaving the host/package gate incomplete,
and must not instantiate a callback fixture or reach into
`DataDrivenWorldScene`.

- [ ] **Step 4: Extend the existing `GameWorldCommand` state machine**

In `runtime/game-world.port.ts`, type-import `AmbientDialogueState` from the
dialogue model and add exactly one union member:

```ts
import type { AmbientDialogueState } from '../dialogue/dialogue-presentation.model';

| { type: 'set-ambient-dialogue'; state: AmbientDialogueState | null }
```

Add that member to `StatefulCommand` and place it after selection but before
actor/camera presentation in the only flush order:

```ts
type StatefulCommand = Extract<GameWorldCommand, {
  type: 'load-scene' | 'set-input-lock' | 'set-preferences'
    | 'set-selected-interaction' | 'set-ambient-dialogue'
    | 'set-actor-presentation' | 'set-camera-shot';
}>;

const FLUSH_ORDER: readonly StatefulCommand['type'][] = [
  'load-scene',
  'set-preferences',
  'set-input-lock',
  'set-selected-interaction',
  'set-ambient-dialogue',
  'set-actor-presentation',
  'set-camera-shot',
];
```

Do not create another port, queue, callback, or replay effect. The existing
`Map<StatefulCommand['type'], StatefulCommand>` provides latest-value buffering,
including `null`. Preserve the runtime plan's `actor-presentation-ready` event
member unchanged.

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/runtime/game-world.port.spec.ts
```

Expected: the original port tests and both new ambient state tests pass.

- [ ] **Step 5: Add separate ambient and actor state in `SimulationPlayComponent`**

Add imports:

```ts
import { ActorPresentationState } from './runtime/actor-presentation.model';
import { AmbientDialogueState } from './dialogue/dialogue-presentation.model';
import { dialoguePresentationKind } from './dialogue/dialogue-presentation.util';
```

Add signals and timer:

```ts
readonly ambientDialogue = signal<AmbientDialogueState | null>(null);
readonly actorPresentation = signal<ActorPresentationState | null>(null);
private ambientDialogueTimer: number | null = null;
```

Add and unit-test the reading-time policy:

```ts
export function ambientReadDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(9000, Math.max(3000, Math.ceil((words / 3) * 1000) + 700));
}
```

Replace `showAmbientDialogue` with:

```ts
private showAmbientDialogue(interaction: MapObjectState): void {
  const mapKey = this.world()?.map.key;
  const text = interaction.key === 'ambient:protocolo-noticia-dificil'
    ? PROTOCOL_INFO_MESSAGE
    : COMISARIA_AMBIENT_INFO[interaction.key]
      ?? getSceneInteractionDescription(interaction, mapKey);
  const candidate = {
    key: interaction.key,
    speakerName: interaction.label,
    emotion: 'neutral',
    lines: [{ order: 1, speakerName: interaction.label, text, emotion: 'neutral' }],
    choices: [],
  } as DialogueState;

  if (dialoguePresentationKind(candidate, text) === 'cinematic') {
    this.selectedInteraction.set(interaction);
    this.dialogue.set(candidate);
    return;
  }

  this.selectedInteraction.set(null);
  this.dialogue.set(null);
  const durationMs = ambientReadDurationMs(text);
  this.ambientDialogue.set({
    key: candidate.key,
    anchorKey: interaction.key,
    speakerName: interaction.label,
    text,
    durationMs,
  });
  this.announce(`${interaction.label}: ${text}`);
  if (this.ambientDialogueTimer !== null) window.clearTimeout(this.ambientDialogueTimer);
  this.ambientDialogueTimer = window.setTimeout(
    () => this.ambientDialogue.set(null),
    durationMs,
  );
}
```

Replace `closeDialogue` with:

```ts
closeDialogue(): void {
  this.dialogue.set(null);
  this.actorPresentation.set(null);
  this.actorPresentationReady.set(null);
}
```

Clear `ambientDialogueTimer` in `ngOnDestroy`.

- [ ] **Step 6: Wire the world inputs and cinematic output**

Add to `<app-game-world>`:

```html
[ambientDialogue]="ambientDialogue()"
[actorPresentation]="actorPresentation()"
[reduceMotion]="effectiveReducedMotion()"
(actorPresentationReady)="actorPresentationReady.set($event)"
```

Use only one cinematic panel and pass the actor context/state callback:

```html
@if (viewMode() === 'dialogue-cinematic') {
  @if (dialogueVisualContext(); as visualContext) {
    <app-dialogue-panel
      class="dialogue-cinematic"
      [dialogue]="dialogue()"
      [interaction]="selectedInteraction()"
      [visualContext]="visualContext"
      [presentationReady]="actorPresentationReady()"
      [reducedMotion]="effectiveReducedMotion()"
      (presentationChange)="handleActorPresentation($event)"
      (close)="closeDialogue()"
      (execute)="executeDecision($event)"
      (useTool)="useTool($event)"
      (frontendChoice)="handleFrontendChoice($event)" />
  }
}
```

Delete the old `dialogue-right` `<aside>` and its CSS.

- [ ] **Step 7: Render an anchored ambient bubble through the runtime plan's port**

In `game-world.component.ts`, import the ambient contract and add the one new
input beside the runtime plan's existing actor-presentation input:

```ts
import { AmbientDialogueState } from './dialogue/dialogue-presentation.model';

readonly ambientDialogue = input<AmbientDialogueState | null>(null);
```

In `DataDrivenWorldScene`, add:

```ts
private ambientBubble?: Phaser.GameObjects.Container;
private ambientAnchorKey: string | null = null;
private pendingAmbientDialogue: AmbientDialogueState | null = null;

private applyAmbientDialogueState(state: AmbientDialogueState | null): void {
  this.ambientBubble?.destroy(true);
  this.ambientBubble = undefined;
  this.ambientAnchorKey = null;
  if (!state || !this.ready) return;
  const anchor = this.npcMarkers.get(state.anchorKey) || this.markers.get(state.anchorKey);
  if (!anchor) return;
  this.ambientAnchorKey = state.anchorKey;
  const copy = this.add.text(0, 0, state.text, {
    fontFamily: 'Atkinson Hyperlegible, Segoe UI, sans-serif',
    fontSize: '16px',
    color: '#f4f1fb',
    align: 'left',
    wordWrap: { width: 260 },
    padding: { x: 12, y: 10 },
    resolution: Math.max(2, window.devicePixelRatio),
  }).setOrigin(.5, 1);
  const bounds = copy.getBounds();
  const width = Math.ceil(bounds.width + 20);
  const height = Math.ceil(bounds.height + 16);
  const panel = this.add.graphics()
    .fillStyle(0x171426, .92)
    .lineStyle(2, 0xb69cff, .72)
    .fillPoints([
      new Phaser.Geom.Point(-width / 2 + 6, -height),
      new Phaser.Geom.Point(width / 2 - 6, -height),
      new Phaser.Geom.Point(width / 2, -height + 6),
      new Phaser.Geom.Point(width / 2, -6),
      new Phaser.Geom.Point(width / 2 - 6, 0),
      new Phaser.Geom.Point(-width / 2 + 6, 0),
      new Phaser.Geom.Point(-width / 2, -6),
      new Phaser.Geom.Point(-width / 2, -height + 6),
    ], true)
    .strokePath();
  this.ambientBubble = this.add.container(anchor.x, anchor.y - 86, [panel, copy])
    .setDepth(DEPTH.UI)
    .setAlpha(this.preferences.reduceMotion ? 1 : 0);
  if (!this.preferences.reduceMotion) {
    this.tweens.add({ targets: this.ambientBubble, alpha: 1, duration: 180, ease: 'Sine.Out' });
  }
}

private updateAmbientBubblePosition(): void {
  if (!this.ambientBubble || !this.ambientAnchorKey) return;
  const anchor = this.npcMarkers.get(this.ambientAnchorKey)
    || this.markers.get(this.ambientAnchorKey);
  if (!anchor) {
    this.ambientBubble.setVisible(false);
    return;
  }
  this.ambientBubble.setVisible(true).setPosition(
    Math.round(anchor.x),
    Math.round(anchor.y - 92),
  );
}
```

Extend the existing exhaustive `handleCommand` switch; this is the only entry
to the scene state:

```ts
case 'set-ambient-dialogue':
  this.pendingAmbientDialogue = command.state;
  this.applyAmbientDialogueState(command.state);
  return;
```

At the successful end of `renderWorld`, after actors and interaction markers
exist but before the `ready` event is published, call
`applyAmbientDialogueState(this.pendingAmbientDialogue)`. A command received
before Phaser creation therefore replays from the port and renders only when an
anchor can exist. Scene teardown destroys the container and clears the pending
reference.

Call `updateAmbientBubblePosition()` once from the existing scene update after NPC
movement; never capture `anchor.x/y` only at creation. Add tests for a moving NPC,
an absent/unloaded anchor, 16 px minimum text, calculated read duration and the
absence of any tween under reduced motion.

The world-runtime plan already owns the typed actor presentation timeline,
`actor-presentation-ready`, facing, talk/idle pose, and restoration; do not add
a second implementation here. `speakerId` does not guarantee a spatial body:
narrators, documents, and unloaded actors remain valid presentation states, and
the runtime must no-op body/camera mutation without throwing. `DEPTH.UI` puts
the bubble above actors and below Angular cinematic overlays. Do not add a
second Phaser scene or a DOM polling loop.

In `GameWorldComponent.ngOnChanges`, add only:

```ts
if (changes['ambientDialogue']) {
  this.port.send({ type: 'set-ambient-dialogue', state: this.ambientDialogue() });
}
```

Initial input delivery relies on the port's stateful buffering before scene
attachment, exactly like scene/preferences/lock state. Do not pass ambient state
through `boot`, the Phaser constructor, or any callback. The
`[actorPresentation]` binding added in Step 6 keeps using the runtime plan's
existing command and emits readiness back through the same typed event port.

- [ ] **Step 8: Run focused tests and build**

Run:

```powershell
cd frontend
npx jest runtime/game-world.port.spec.ts game-world.component.spec.ts simulation-view-mode.util.spec.ts simulation-play.consent-gate.spec.ts dialogue-panel.component.spec.ts --runInBand
npm run build
$bypass = Select-String -Path 'src/app/features/simulator/game-world.component.ts' `
  -Pattern 'scene\.[A-Za-z]*AmbientDialogue','startGame.*ambientDialogue'
if ($bypass) { $bypass | Format-Table; exit 1 }
```

Expected: all five suites `PASS`; build succeeds; short ambient speech does not
set `inputBlocked`; ambient state replays once through the port; the wrapper has
no direct scene/boot bypass. The runtime-owned timeline test must also prove the
matching `actor-presentation-ready` event is emitted only after the authored
turn (at most 220 ms) plus a 100–130 ms pre-speech pause, with total latency no
greater than 350 ms. `dialogue-panel.component.spec.ts` proves cinematic copy
does not enter the DOM before that event.

- [ ] **Step 9: Commit the two-level dialogue routing**

```powershell
git add frontend/src/app/features/simulator/runtime/game-world.port.ts frontend/src/app/features/simulator/runtime/game-world.port.spec.ts frontend/src/app/features/simulator/simulation-view-mode.util.ts frontend/src/app/features/simulator/simulation-view-mode.util.spec.ts frontend/src/app/features/simulator/game-world.component.ts frontend/src/app/features/simulator/game-world.component.spec.ts frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts frontend/src/app/features/simulator/dialogue-panel.component.spec.ts
git commit -m "feat(dialogue): separate ambient speech from cinematic scenes"
```

---

### Task 5: Make HUD visibility contextual and metric semantics consistent

**Files:**
- Create: `frontend/src/app/features/simulator/hud-visibility.util.ts`
- Test: `frontend/src/app/features/simulator/hud-visibility.util.spec.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-hud.component.ts`
- Modify: `frontend/src/app/features/simulator/hud-dock.util.ts`
- Test: `frontend/src/app/features/simulator/hud-dock.util.spec.ts`

- [ ] **Step 1: Write the failing HUD policy matrix**

Create `frontend/src/app/features/simulator/hud-visibility.util.spec.ts`:

```ts
import { resolveHudVisibility } from './hud-visibility.util';

describe('resolveHudVisibility', () => {
  it('shows exploration context without flooding the scene', () => {
    expect(resolveHudVisibility('explore', true)).toEqual({
      compactTop: false, showObjective: true, showBottom: true,
      showMetrics: true, showContextPrompt: true,
    });
  });

  it('collapses all secondary HUD during cinematic dialogue', () => {
    expect(resolveHudVisibility('dialogue-cinematic', true)).toEqual({
      compactTop: true, showObjective: false, showBottom: false,
      showMetrics: false, showContextPrompt: false,
    });
  });

  it('hides world HUD under journal and outcome', () => {
    expect(resolveHudVisibility('journal', false).showBottom).toBe(false);
    expect(resolveHudVisibility('outcome', false).showMetrics).toBe(false);
  });
});
```

- [ ] **Step 2: Implement the one policy**

Create `frontend/src/app/features/simulator/hud-visibility.util.ts`:

```ts
import { SimulationViewMode } from './simulation-view-mode.util';

export interface HudVisibility {
  readonly compactTop: boolean;
  readonly showObjective: boolean;
  readonly showBottom: boolean;
  readonly showMetrics: boolean;
  readonly showContextPrompt: boolean;
}

export function resolveHudVisibility(
  mode: SimulationViewMode,
  hasObjective: boolean,
): HudVisibility {
  if (mode === 'explore') {
    return {
      compactTop: false,
      showObjective: hasObjective,
      showBottom: true,
      showMetrics: true,
      showContextPrompt: true,
    };
  }
  if (mode === 'dialogue-cinematic') {
    return {
      compactTop: true,
      showObjective: false,
      showBottom: false,
      showMetrics: false,
      showContextPrompt: false,
    };
  }
  return {
    compactTop: true,
    showObjective: false,
    showBottom: false,
    showMetrics: false,
    showContextPrompt: false,
  };
}
```

- [ ] **Step 3: Wire the policy once in `SimulationPlayComponent`**

Add:

```ts
import { resolveHudVisibility } from './hud-visibility.util';

readonly hudVisibility = computed(() => resolveHudVisibility(
  this.viewMode(),
  this.sceneObjective() !== null,
));
```

Change the top HUD binding to `[compact]="hudVisibility().compactTop"`. Guard the objective card with `hudVisibility().showObjective`, and the entire bottom footer with `hudVisibility().showBottom`. This replaces scattered dialogue-specific CSS hiding.

- [ ] **Step 4: Make `SimulationHudComponent` compact and semantically consistent**

Add:

```ts
readonly compact = input(false);
```

Set the root class:

```html
<div class="hud-shell simulator-glass simulator-glass--hud"
  [class.hud-shell--compact]="compact()"
  role="complementary"
  aria-label="Indicadores del simulador">
```

Wrap patient state and score with `@if (!compact())`. Keep only case title, safe exit access, and settings access in compact mode. Replace the stress meter label/tooltip with one meaning everywhere:

```html
<div class="hud-stress"
  role="meter"
  [attr.aria-valuenow]="game.stressIndex"
  aria-valuemin="0" aria-valuemax="100"
  [attr.aria-label]="'Estrés del caso: ' + game.stressIndex + '%. ' + stressLabel()">
  <span class="hud-metric-label">Estrés</span>
  <span class="stress-pct" [style.color]="stressColor()">{{ game.stressIndex }}%</span>
</div>
```

Delete the heart visualization and all of its dead support code: the `Heart`/`stressToHearts` import, `hearts` computed value, `.hud-hearts*`, `.heart*`, and responsive heart rules. It encoded calm remaining while ARIA said stress, violating the approved semantic rule.

Add:

```css
.hud-shell { transition: min-height 180ms ease, background 180ms ease; }
.hud-shell--compact .hud-zone--center,
.hud-shell--compact .hud-patient,
.hud-shell--compact .hud-score,
.hud-shell--compact .hud-stress { display: none; }
.hud-shell--compact .hud-strip { height: 38px; }
```

- [ ] **Step 5: Run HUD unit tests and build**

Run:

```powershell
cd frontend
npx jest hud-visibility.util.spec.ts hud-dock.util.spec.ts --runInBand
npm run build
```

Expected: both suites `PASS`; the top bar remains rendered but compact during dialogue; bottom and objective are absent.

- [ ] **Step 6: Commit contextual HUD behavior**

```powershell
git add frontend/src/app/features/simulator/hud-visibility.util.ts frontend/src/app/features/simulator/hud-visibility.util.spec.ts frontend/src/app/features/simulator/hud-dock.util.ts frontend/src/app/features/simulator/hud-dock.util.spec.ts frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/simulation-hud.component.ts
git commit -m "feat(hud): make simulator chrome contextual"
```

---

### Task 6: Add simulator-scoped controlled Liquid Glass with fallback and reduced motion

**Files:**
- Create: `frontend/src/styles/_simulator-liquid-glass.scss`
- Modify: `frontend/src/styles/styles.scss:1`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`

- [ ] **Step 1: Create the controlled glass material**

Create `frontend/src/styles/_simulator-liquid-glass.scss`:

```scss
.game-container {
  --sim-glass-fill: rgba(18, 17, 34, .72);
  --sim-glass-edge: rgba(205, 191, 255, .34);
  --sim-glass-highlight: rgba(245, 242, 255, .18);
  --sim-glass-depth: 0 20px 58px -34px rgba(10, 7, 24, .9);
  --sim-glass-motion: 220ms cubic-bezier(.2, .8, .2, 1);
}

.game-container .simulator-glass {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background:
    linear-gradient(145deg, rgba(115, 89, 170, .12), transparent 42%),
    var(--sim-glass-fill);
  border: 1px solid var(--sim-glass-edge);
  box-shadow:
    inset 0 1px 0 var(--sim-glass-highlight),
    inset 0 -1px 0 rgba(4, 3, 12, .5),
    var(--sim-glass-depth);
}

@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .game-container .simulator-glass {
    background: linear-gradient(145deg, rgba(115, 89, 170, .1), rgba(12, 13, 26, .58));
    -webkit-backdrop-filter: blur(12px) saturate(122%) contrast(104%);
    backdrop-filter: blur(12px) saturate(122%) contrast(104%);
  }
}

.game-container .simulator-glass::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(110% 54% at 18% -12%, rgba(238, 232, 255, .18), transparent 58%),
    linear-gradient(90deg, rgba(115, 88, 171, .08), transparent 18% 82%, rgba(89, 149, 180, .08));
}

.game-container .simulator-glass--opening {
  animation: simulator-glass-open var(--sim-glass-motion) both;
}

.game-container .simulator-glass--closing {
  animation: simulator-glass-close 180ms cubic-bezier(.4, 0, 1, 1) both;
  pointer-events: none;
}

.game-container .simulator-glass button {
  position: relative;
  overflow: hidden;
}

.game-container .simulator-glass button::after {
  content: '';
  position: absolute;
  inset: 50% auto auto 50%;
  width: 12px;
  height: 12px;
  border: 1px solid rgba(224, 216, 255, .34);
  border-radius: 50%;
  opacity: 0;
  transform: translate(-50%, -50%) scale(.2);
  pointer-events: none;
}

.game-container .simulator-glass button:active::after,
.game-container .simulator-glass button:focus-visible::after,
.game-container .simulator-glass .choice-btn--chosen::after {
  animation: simulator-glass-ripple 180ms ease-out both;
}

@keyframes simulator-glass-open {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes simulator-glass-close {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(8px); }
}

@keyframes simulator-glass-ripple {
  0% { opacity: .55; transform: translate(-50%, -50%) scale(.2); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(5); }
}

.game-container[data-reduce-motion='true'] .simulator-glass--opening,
.game-container[data-reduce-motion='true'] .simulator-glass--closing,
.game-container[data-reduce-motion='true'] .simulator-glass button:active::after,
.game-container[data-reduce-motion='true'] .simulator-glass button:focus-visible::after,
.game-container[data-reduce-motion='true'] .simulator-glass .choice-btn--chosen::after {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .game-container .simulator-glass--opening,
  .game-container .simulator-glass--closing,
  .game-container .simulator-glass button:active::after,
  .game-container .simulator-glass button:focus-visible::after,
  .game-container .simulator-glass .choice-btn--chosen::after {
    animation: none;
  }
}
```

There is no perpetual sheen or idle water motion. Refractive work is limited to glass surfaces; text, icons, and portraits remain ordinary descendants without filters.

- [ ] **Step 2: Import the partial and expose the internal reduced-motion state**

Add at the top of `frontend/src/styles/styles.scss`:

```scss
@use 'simulator-liquid-glass';
```

Change the root of `SimulationPlayComponent`:

```html
<div class="game-container" id="main-content" tabindex="-1"
  [attr.data-mode]="viewMode()"
  [attr.data-reduce-motion]="effectiveReducedMotion()">
```

`SimulationPlayComponent.effectiveReducedMotion()` is the only OS/user policy.
The panel receives that boolean through its required `reducedMotion` input; the
world wrapper receives the same value through its existing `reduceMotion` input,
sends it in `set-preferences`, and `DataDrivenWorldScene` reads only
`this.preferences.reduceMotion`. Do not add another signal, `matchMedia` query,
scene field, or preference callback in this plan.

- [ ] **Step 3: Verify static fallback and motion CSS at build time**

Run:

```powershell
cd frontend
npm run build
Select-String -Path 'dist/psychosim-admin-panel/browser/styles-*.css' -Pattern 'simulator-glass-ripple','backdrop-filter','data-reduce-motion'
```

Expected: build succeeds and all three patterns are present in the emitted stylesheet.

- [ ] **Step 4: Commit the material**

```powershell
git add frontend/src/styles/_simulator-liquid-glass.scss frontend/src/styles/styles.scss frontend/src/app/features/simulator/simulation-play.component.ts
git commit -m "feat(hud): add controlled simulator liquid glass"
```

---

### Task 7: Remove the student chatbot from UI, DOM, bundle, and default backend runtime

**Files:**
- Delete: `frontend/src/app/features/simulator/ai-assistant/ai-assistant.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-hud.component.ts`
- Modify: `backend_django/psychosim/settings/base.py`
- Modify: `backend_django/apps/simulation/views/ai_assistant.py`
- Create: `backend_django/apps/simulation/tests/test_ai_assistant_disabled.py`

- [ ] **Step 1: Add the failing default-off backend test**

Create `backend_django/apps/simulation/tests/test_ai_assistant_disabled.py`:

```py
import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db
User = get_user_model()


@override_settings(AI_ASSISTANT_ENABLED=False)
def test_student_ai_assistant_route_is_dormant_by_default():
    student = User.objects.create_user(
        email="chatbot-off@example.test",
        password="x",
        nombre="Estudiante",
        apellido="Prueba",
        role="ESTUDIANTE",
    )
    client = APIClient()
    client.force_authenticate(user=student)

    response = client.post("/api/simulation/ai-assistant", {
        "attempt_id": "00000000-0000-0000-0000-000000000000",
        "question": "¿Qué hago?",
    }, format="json")

    assert response.status_code == 404
    assert response.data == {"detail": "Not found."}
```

- [ ] **Step 2: Verify it currently fails**

Run:

```powershell
npm run test:backend -- apps/simulation/tests/test_ai_assistant_disabled.py -q
```

Expected: `FAIL`; current endpoint returns its ordinary validation response instead of `404`.

- [ ] **Step 3: Add and enforce the explicit backend flag**

In `backend_django/psychosim/settings/base.py`, add:

```py
AI_ASSISTANT_ENABLED = os.environ.get("AI_ASSISTANT_ENABLED", "false").strip().lower() in {
    "1", "true", "yes", "on",
}
```

At the first line of `AIAssistantView.post`, add:

```py
if not getattr(settings, "AI_ASSISTANT_ENABLED", False):
    return Response({"detail": "Not found."}, status=404)
```

Run the focused pytest again. Expected: `1 passed`.

- [ ] **Step 4: Remove every frontend entry point and the component**

In `simulation-play.component.ts`, remove:

- the `AIAssistantComponent` import and standalone import;
- `[aiAssistantOpen]`, `(toggleAI)`, the standalone `.guide-chatbot-button`, and `<app-ai-assistant>`;
- the `aiAssistantOpen` signal and `.guide-chatbot-button` styles.

In `simulation-hud.component.ts`, remove:

- the guide button in `.hud-actions`;
- the guide button in `.settings-menu`;
- `aiAssistantOpen`, `toggleAI`, and `.hud-action--guide` styles.

Delete the file:

```powershell
# Delete `frontend/src/app/features/simulator/ai-assistant/ai-assistant.component.ts`
# with the editing tool's patch/delete operation; do not use a shell deletion command.
```

- [ ] **Step 5: Prove the source and production bundle contain no student chatbot**

Run:

```powershell
$hits = Get-ChildItem 'frontend/src/app/features/simulator' -Recurse -File -Include *.ts,*.html,*.scss |
  Select-String -Pattern 'app-ai-assistant|AIAssistantComponent|aiAssistantOpen|toggleAI|Instructor guia chatbot'
if ($hits) { $hits | Format-Table; exit 1 }
cd frontend
npm run build
$bundleFiles = @(Get-ChildItem 'dist/psychosim-admin-panel/browser' -Recurse -File -Filter '*.js')
if ($bundleFiles.Count -eq 0) { throw 'Bundle scan is vacuous: no JavaScript files found' }
$bundleHits = $bundleFiles |
  Select-String -Pattern 'simulation/ai-assistant|Instructor guia chatbot'
if ($bundleHits) { $bundleHits | Format-Table; exit 1 }
```

Expected: both scans produce no rows; build succeeds.

- [ ] **Step 6: Commit chatbot retirement**

```powershell
git add frontend/src/app/features/simulator backend_django/psychosim/settings/base.py backend_django/apps/simulation/views/ai_assistant.py backend_django/apps/simulation/tests/test_ai_assistant_disabled.py
git commit -m "feat(simulator): retire student chatbot runtime"
```

---

### Task 8: Add desktop dialogue/HUD accessibility and visual gates

**Files:**
- Create: `frontend/e2e/dialogue-hud-premium.e2e.ts`
- Modify: `frontend/e2e/support/siep-flow.ts`
- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.spec.ts`

- [ ] **Step 1: Add the Playwright gate**

Create `frontend/e2e/dialogue-hud-premium.e2e.ts`:

```ts
import { expect, test } from '@playwright/test';
import { assertQualityState } from './support/quality-gates';
import {
  acceptContentWarning,
  enterCaseAtContentWarning,
  finishCaseIntroduction,
  loginStudent,
  openFamilyDialogue,
  waitForWorldReady,
} from './support/siep-flow';

test.use({ viewport: { width: 1366, height: 768 } });

test('@quality cinematic dialogue and contextual HUD meet the premium gate', async ({ page }, testInfo) => {
  const assistantRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/simulation/ai-assistant')) assistantRequests.push(request.url());
  });

  await page.goto('/login');
  await loginStudent(page);
  await page.goto('/portal/jugar');
  const consent = await enterCaseAtContentWarning(page);
  const video = await acceptContentWarning(page, consent);
  const intro = await finishCaseIntroduction(page, video);
  await intro.getByRole('button', { name: /^continuar$/i }).click();
  await waitForWorldReady(page, 'hospital-urgencias');

  await expect(page.getByText(/Instructor guia chatbot/i)).toHaveCount(0);
  await expect(page.locator('app-ai-assistant')).toHaveCount(0);

  const dialogue = await openFamilyDialogue(page, false);
  await expect(dialogue).toBeVisible();
  await expect(dialogue).toHaveAttribute('aria-busy', 'false');
  await expect(dialogue.locator('.portrait-frame, .portrait-fallback')).toBeVisible();
  await expect(dialogue.locator('[data-testid="cinematic-copy"]')).toBeVisible();
  const presentationElapsedMs = Number(
    await dialogue.getAttribute('data-presentation-elapsed-ms'),
  );
  expect(presentationElapsedMs).toBeGreaterThanOrEqual(100);
  expect(presentationElapsedMs).toBeLessThanOrEqual(350);
  await expect(page.locator('.objective-card')).toHaveCount(0);
  await expect(page.locator('.bottom-zone')).toHaveCount(0);
  await expect(page.locator('.hud-shell')).toHaveClass(/hud-shell--compact/);

  const box = await dialogue.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(768);

  await page.keyboard.press('Enter');
  await expect(dialogue.getByRole('button', { name: /siguiente|continuar/i }).first()).toBeFocused();

  await assertQualityState(page, testInfo, 'premium-cinematic-dialogue');
expect(assistantRequests).toEqual([]);
});
```

Extract the test body into `runCinematicDialogueGate(page, testInfo, viewport)`
and invoke it in two separately named tests with `{ width: 1366, height: 768 }`
and `{ width: 1600, height: 900 }`; call `page.setViewportSize` before navigation.
Both tests run `assertQualityState` and attach a screenshot whose name includes
the viewport.

Add `openFirstFourChoiceDecision(page)` to `siep-flow.ts` using only visible
movement/interactions. A third test at 1366x768 must assert exactly four complete
choice buttons, no warning/evidence/recommended/prohibited metadata in visible or
accessible text, Arrow/D-pad focus wrap, `Digit1`–`Digit4`, and one XInput A
confirmation through Task 12's deterministic gamepad setter. It must hold the
axis during the dialogue and prove world coordinates and position PATCH count do
not change. No test may call a component, service or store through `page.evaluate`;
the only test hook is the standard-pad hardware stub.

- [ ] **Step 2: Run unit, backend, build, and the isolated E2E stack**

Run from the repository root:

```powershell
npm run test:frontend
npm run build:frontend
npm run test:backend -- apps/simulation/tests/test_ai_assistant_disabled.py -q
node scripts/test-e2e.mjs --project chromium --grep "cinematic dialogue"
```

Expected:

- all Jest suites pass;
- Angular production build succeeds;
- backend focused test reports `1 passed`;
- Playwright reports `3 passed` across both desktop viewports and the four-choice/gamepad state;
- no `/simulation/ai-assistant` request appears.

- [ ] **Step 3: Commit the automated verification gate**

```powershell
git add frontend/e2e/dialogue-hud-premium.e2e.ts frontend/e2e/support/siep-flow.ts frontend/src/app/features/simulator/dialogue-panel.component.spec.ts
git commit -m "test(dialogue): gate premium cinematic presentation"
```

- [ ] **Step 4: Capture human-review evidence on clean HEAD**

With the isolated stack still running and `git status --short` empty, play from
content warning through one NPC conversation and one decision. Save screenshots
outside the source tree under the tested SHA:

```powershell
$sha = (git rev-parse HEAD).Trim()
New-Item -ItemType Directory -Force ".superpowers/evidence/$sha/dialogue-hud" | Out-Null
```

Required evidence:

- exploration at `1366×768`, showing the scene-dominant HUD;
- short ambient bubble while movement remains possible;
- cinematic dialogue with large portrait and full text;
- four-choice state with every choice visible;
- same dialogue with reduced motion enabled;
- browser DevTools network filter `ai-assistant` showing zero requests.

Acceptance: no text clipping, layout jump, emotion chip, generic SVG, permanent glass animation, duplicated action, or HUD competition with the people in the scene.

Do not modify tracked files after capture; the final acceptance plan repeats the
states on the final integrated HEAD.

---

## Self-review

### Spec coverage

- Ambient versus cinematic dialogue: Tasks 1 and 4.
- Character-manifest portrait/body authority, exact SIM-VBG-001 actor mappings,
  camera/world facing, pose, speaking, and restoration: Tasks 1, 3, and 4.
- Authored turn at most 220 ms, 100–130 ms pre-speech pause, total readiness at
  most 350 ms, and no cinematic copy before typed readiness: Tasks 3, 4, and 8.
- Large pixel portrait-sheet frame, role, no artificial emotion tag, strict
  manifest fallback for actors, and themed CSS fallback only for non-actors:
  Tasks 1 and 3.
- 35–45 cps, punctuation pauses, first key completes, reduced motion, one screen-reader announcement: Task 2.
- Maximum four complete choices, keyboard `1–4`, focus, confirmation without pre-revealed correctness: existing choice contract retained and visually rebuilt in Task 3; verified in Task 8.
- Contextual HUD, hidden secondary UI during dialogue, consistent metric semantics: Task 5.
- Controlled Liquid Glass, edge refraction, 160–280 ms sober motion, no perpetual water, static fallback: Task 6.
- Chatbot absent from buttons, settings, DOM, bundle, and requests; backend dormant behind default-off flag: Task 7 and Task 8.
- Desktop-first `1366×768`, keyboard, Axe, visual and human verification: Task 8.

### Placeholder scan

The plan contains no unresolved markers, deferred implementation language,
unnamed error handling, or unspecified test request. Actor portraits come only
from immutable render plans; the non-actor fallback uses deterministic themed
CSS pixel blocks, so no untracked asset dependency remains.

### Type consistency

- `ActorPresentationState` is defined once by Task 2 of the world-runtime plan
  and consumed unchanged here. `DialoguePresentationProjection` adds only the
  exact shared portrait-plan shape and theme needed by Angular; it does not
  redefine body or asset contracts.
- `ActorPresentationReadyEvent` is extracted from the runtime-owned
  `GameWorldEvent` union. The panel cannot self-author readiness and cannot open
  copy on its 350 ms diagnostic watchdog.
- `AmbientDialogueState` is non-modal by construction, never participates in
  `resolveViewMode`/`inputBlocked`, and crosses Angular→Phaser only as the
  stateful `set-ambient-dialogue` member of the existing `GameWorldPort`.
- `SimulationViewMode` no longer contains `dialogue-right`; Tasks 4 and 5 use only `dialogue-cinematic`.
- `effectiveReducedMotion()` is the sole OS/user policy. Its boolean feeds the
  panel's `reducedMotion` input, the root CSS attribute, and the wrapper's typed
  `set-preferences` command; Phaser reads only `preferences.reduceMotion`.
- The chatbot backend flag is `AI_ASSISTANT_ENABLED` in both settings and view test.
