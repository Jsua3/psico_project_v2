# Premium Audio Mixer and Clinical Atmosphere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one authoritative mixer for music, ambience, dialogue/text, and effects; drive footsteps from animation contact frames and authored surfaces; add sober room atmosphere, dialogue ducking, persistent independent controls, and a reduced-stimuli mode without duplicate playback.

**Architecture:** Angular owns one `AudioMixerService` backed by Howler and receives typed `AudioCue` events from both Angular UI and Phaser. Shared dialogue UI depends on a narrow `AudioCuePort`: `SimulationPlayComponent` aliases that port to its sole mixer, while the editor-only `WorldPreviewComponent` deliberately provides a no-op port and never constructs a second audio engine. Phaser no longer loads or plays audio; it only determines spatial/game facts such as surface, contact frame, and position. Room profiles select ambience/music/surface policy, while a versioned settings store applies bus gain and reduced-stimuli policy centrally.

**Tech Stack:** Angular 21 signals/DI, TypeScript 5.9, Howler 2.2, Phaser 3.90 event output only, Jest 30/jsdom, Playwright 1.60, Node 22 asset scripts, PowerShell import script.

**Product authority:** `docs/superpowers/specs/2026-07-13-sim-vbg-001-premium-gameplay-design.md` sections 9, 10, 13, 14, and 15.

**Prerequisite:** Complete the character, world-runtime, and dialogue/HUD plans first, then complete Tasks 1–9 of `docs/superpowers/plans/2026-07-13-living-case-npc-consequences.md`. This plan consumes the final six-frame contact metadata and dialogue/HUD call sites. Plan 1 owns the shared `ConsequenceTone`; the living-case plan consumes it in `ClinicalConsequence`; audio imports both without recreating either. The living-case Phase 4 handoff remains `PENDING`: audio neither performs nor simulates the final SME signature.

---

## File map

### Create

- `frontend/src/app/features/simulator/audio/audio-cue.model.ts` — buses, settings, surfaces, localized sources, and domain cue union.
- `frontend/src/app/features/simulator/audio/audio-settings.store.ts` — versioned persistent independent bus controls.
- `frontend/src/app/features/simulator/audio/audio-settings.store.spec.ts` — corrupt storage, clamping, and persistence tests.
- `frontend/src/app/features/simulator/audio/audio-catalog.ts` — typed asset catalogue with bus/base-gain ownership.
- `frontend/src/app/features/simulator/audio/audio-consequence-contract.spec.ts` — matrix 4 tones × 21 render plans across clinical, body, portrait and audio.
- `frontend/src/app/features/simulator/audio/audio-cue.port.ts` — narrow injectable cue sink shared by dialogue without granting playback ownership.
- `frontend/src/app/features/simulator/audio/audio-clip.port.ts` — testable boundary around Howler clips and master output.
- `frontend/src/app/features/simulator/audio/howler-clip.factory.ts` — only file that constructs `Howl` or calls `Howler`.
- `frontend/src/app/features/simulator/audio/howler-clip.factory.spec.ts` — pure adapter proof for pre-`Howl` context creation, gesture resume, and limiter installation.
- `frontend/src/app/features/simulator/audio/audio-mixer.service.ts` — sole playback authority.
- `frontend/src/app/features/simulator/audio/audio-mixer.service.spec.ts` — bus gain, no-repeat, ducking, pause/resume, and disposal tests.
- `frontend/src/app/features/simulator/journal-panel.component.spec.ts` — prove journal cues dispatch through `AudioMixerService`.
- `frontend/src/app/features/simulator/world-preview.component.spec.ts` — prove preview cue DI is deliberate and silent.
- `frontend/src/app/features/simulator/audio/room-audio-profile.ts` — build-time map atmosphere plus pure surface resolution; runtime consumes the package.
- `frontend/src/app/features/simulator/audio/room-audio-profile.spec.ts` — room/profile/surface resolution tests.
- `frontend/src/app/features/simulator/audio/scene-audio-authoring.ts` — versioned map profiles inserted into `ScenePackageV1` before hashing.
- `frontend/src/app/features/simulator/audio/footstep-sequencer.util.ts` — contact-frame deduplication.
- `frontend/src/app/features/simulator/audio/footstep-sequencer.util.spec.ts` — contact timing and blocked-motion tests.
- `frontend/src/app/features/simulator/audio/spatial-source-emitter.util.ts` — thresholded listener attenuation/pan cues.
- `frontend/src/app/features/simulator/audio/spatial-source-emitter.util.spec.ts` — entry/update/exit and no-frame-spam tests.
- `frontend/src/app/features/simulator/audio/door-audio-sequencer.util.ts` — authorized transition-only open/close sequencing without a second room-state authority.
- `frontend/src/app/features/simulator/audio/door-audio-sequencer.util.spec.ts` — denied, cancelled, duplicated, and successful transition sound tests.
- `tools/audio/import-kenney-rpg-audio.ps1` — reproducible CC0 foley import.
- `tools/audio/generate-premium-audio.mjs` — deterministic room-tone, localized bed, glass, and consequence-cue masters.
- `tools/audio/validate-premium-audio.mjs` — required-file, WAV header, duration, peak, and license gate.
- `frontend/src/assets/game/audio/premium/LICENSES.md` — provenance for generated masters and Kenney CC0 pack.
- `frontend/e2e/audio-settings.e2e.ts` — independent controls persist and no asset/playback duplication appears.

### Generate/import

- `frontend/src/assets/game/audio/premium/ambience/hospital-night.wav`
- `frontend/src/assets/game/audio/premium/ambience/waiting-room.wav`
- `frontend/src/assets/game/audio/premium/ambience/office-night.wav`
- `frontend/src/assets/game/audio/premium/localized/hospital-monitor.wav`
- `frontend/src/assets/game/audio/premium/localized/waiting-clock.wav`
- `frontend/src/assets/game/audio/premium/localized/office-vent.wav`
- `frontend/src/assets/game/audio/premium/ui/glass-open.wav`
- `frontend/src/assets/game/audio/premium/ui/glass-focus.wav`
- `frontend/src/assets/game/audio/premium/ui/glass-confirm.wav`
- `frontend/src/assets/game/audio/premium/consequence/relief.wav`
- `frontend/src/assets/game/audio/premium/consequence/steady.wav`
- `frontend/src/assets/game/audio/premium/consequence/tension.wav`
- `frontend/src/assets/game/audio/premium/consequence/rupture.wav`
- `frontend/src/assets/game/audio/premium/kenney-rpg/footstep00.ogg` through `footstep08.ogg`
- `frontend/src/assets/game/audio/premium/kenney-rpg/doorOpen_1.ogg`
- `frontend/src/assets/game/audio/premium/kenney-rpg/doorClose_1.ogg`

### Modify

- `frontend/src/app/features/simulator/runtime/game-world.port.ts` — carry
  `AudioCue` as one typed `GameWorldEvent` and retire Phaser-only `sfxMuted`.
- `frontend/src/app/features/simulator/runtime/game-world.port.spec.ts` — prove
  audio facts cross the existing port exactly once.
- `frontend/src/app/features/simulator/game-world.component.ts` — remove Phaser audio and emit `AudioCue` on contact/proximity/door facts.
- `frontend/src/app/features/simulator/simulation-play.component.ts` — initialize/dispatch/dispose mixer and persist settings.
- `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts` — update mixer mock and preserve pre-consent silence.
- `frontend/src/app/features/simulator/dialogue-panel.component.ts` — dispatch text/UI cues through the narrow cue port.
- `frontend/src/app/features/simulator/dialogue-panel.component.spec.ts` — update audio provider and cue assertions.
- `frontend/src/app/features/simulator/journal-panel.component.ts` — migrate journal open/close feedback to the sole mixer.
- `frontend/src/app/features/simulator/simulation-hud.component.ts` — four independent sliders and reduced-stimuli switch.
- `frontend/src/app/features/simulator/world-preview.component.ts` — provide an explicit no-op `AudioCuePort`, never another mixer.
- `frontend/package.json` — add asset validation script.

### Delete after all imports migrate

- `frontend/src/app/features/simulator/audio-director.service.ts`
- `frontend/src/app/features/simulator/audio.service.ts`

---

### Task 1: Define cues and a versioned independent settings store

**Files:**
- Create: `frontend/src/app/features/simulator/audio/audio-cue.model.ts`
- Create: `frontend/src/app/features/simulator/audio/audio-settings.store.ts`
- Test: `frontend/src/app/features/simulator/audio/audio-settings.store.spec.ts`

- [ ] **Step 1: Write the failing settings tests**

Create `frontend/src/app/features/simulator/audio/audio-settings.store.spec.ts`:

```ts
import {
  AUDIO_SETTINGS_KEY,
  AudioSettingsStore,
  loadAudioSettings,
} from './audio-settings.store';
import { DEFAULT_AUDIO_SETTINGS } from './audio-cue.model';

describe('AudioSettingsStore', () => {
  beforeEach(() => localStorage.clear());

  it('uses safe defaults for missing or corrupt storage', () => {
    expect(loadAudioSettings(localStorage)).toEqual(DEFAULT_AUDIO_SETTINGS);
    localStorage.setItem(AUDIO_SETTINGS_KEY, '{broken');
    expect(loadAudioSettings(localStorage)).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it('persists independent clamped bus values', () => {
    const store = new AudioSettingsStore();
    store.setVolume('music', .31);
    store.setVolume('ambience', 2);
    store.setVolume('voice', -.5);
    store.setVolume('sfx', .77);
    const restored = loadAudioSettings(localStorage);
    expect(restored.volumes).toEqual({
      master: .8, music: .31, ambience: 1, voice: 0, sfx: .77,
    });
  });

  it('persists reduced stimuli without conflating it with reduced motion', () => {
    const store = new AudioSettingsStore();
    store.setReducedStimuli(true);
    expect(loadAudioSettings(localStorage).reducedStimuli).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

```powershell
cd frontend
npx jest audio-settings.store.spec.ts --runInBand
```

Expected: `FAIL` with `Cannot find module './audio-settings.store'`.

- [ ] **Step 3: Define the complete cue/settings contract**

Create `frontend/src/app/features/simulator/audio/audio-cue.model.ts`:

```ts
import type { ConsequenceTone } from '../../../core/models/consequence-tone.model';

export type AudioBus = 'music' | 'ambience' | 'voice' | 'sfx';
export type AdjustableAudioBus = 'master' | AudioBus;
export type FootstepSurface = 'tile' | 'wood' | 'carpet';
export type LocalizedSourceKey =
  | 'source.hospital-monitor'
  | 'source.waiting-clock'
  | 'source.office-vent';
export type ConsequenceAudioKey = `consequence.${ConsequenceTone}`;

export interface SurfaceZoneV1 {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly surface: FootstepSurface;
}

export interface SceneAudioProfileV1 {
  readonly musicKey: 'music.main' | 'music.intro';
  readonly ambienceKey: 'ambience.hospital' | 'ambience.waiting' | 'ambience.office';
  readonly defaultSurface: FootstepSurface;
  readonly surfaceZones: readonly SurfaceZoneV1[];
  readonly localizedSources: readonly {
    readonly sourceId: string;
    readonly key: LocalizedSourceKey;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly baseGain: number;
  }[];
}

export const AUDIO_BUS_LABELS: Readonly<Record<AdjustableAudioBus, string>> = {
  master: 'general',
  music: 'música',
  ambience: 'ambiente',
  voice: 'texto y diálogo',
  sfx: 'efectos',
};

export type UiAudioKey =
  | 'ui.select'
  | 'ui.confirm'
  | 'ui.cancel'
  | 'dialogue.advance'
  | 'dialogue.blip'
  | 'glass.open'
  | 'glass.focus'
  | 'glass.confirm'
  | 'door.open'
  | 'door.close'
  | 'session.complete';

export type AudioCue =
  | { readonly type: 'scene.enter'; readonly mapKey: string; readonly sceneInstanceKey: string; readonly profile: SceneAudioProfileV1 }
  | { readonly type: 'intro'; readonly active: boolean }
  | { readonly type: 'ui'; readonly key: UiAudioKey; readonly pan?: number }
  | { readonly type: 'footstep'; readonly surface: FootstepSurface; readonly contactId: string; readonly pan: number }
  | { readonly type: 'spatial-source'; readonly sourceId: string; readonly key: LocalizedSourceKey; readonly active: boolean; readonly gain: number; readonly pan: number }
  | { readonly type: 'consequence'; readonly tone: ConsequenceTone }
  | { readonly type: 'dialogue'; readonly active: boolean; readonly sensitive: boolean }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'stop' };

export interface AudioSettingsV1 {
  readonly version: 1;
  readonly volumes: Readonly<Record<AdjustableAudioBus, number>>;
  readonly reducedStimuli: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettingsV1 = {
  version: 1,
  volumes: {
    master: .8,
    music: .42,
    ambience: .34,
    voice: .55,
    sfx: .5,
  },
  reducedStimuli: false,
};
```

- [ ] **Step 4: Implement storage validation and updates**

Create `frontend/src/app/features/simulator/audio/audio-settings.store.ts`:

```ts
import { Injectable, signal } from '@angular/core';
import {
  AdjustableAudioBus,
  AudioSettingsV1,
  DEFAULT_AUDIO_SETTINGS,
} from './audio-cue.model';

export const AUDIO_SETTINGS_KEY = 'siep_audio_settings_v1';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export function loadAudioSettings(storage: Storage): AudioSettingsV1 {
  try {
    const raw = storage.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) return DEFAULT_AUDIO_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AudioSettingsV1>;
    if (parsed.version !== 1 || !parsed.volumes) return DEFAULT_AUDIO_SETTINGS;
    return {
      version: 1,
      volumes: {
        master: clamp01(parsed.volumes.master ?? DEFAULT_AUDIO_SETTINGS.volumes.master),
        music: clamp01(parsed.volumes.music ?? DEFAULT_AUDIO_SETTINGS.volumes.music),
        ambience: clamp01(parsed.volumes.ambience ?? DEFAULT_AUDIO_SETTINGS.volumes.ambience),
        voice: clamp01(parsed.volumes.voice ?? DEFAULT_AUDIO_SETTINGS.volumes.voice),
        sfx: clamp01(parsed.volumes.sfx ?? DEFAULT_AUDIO_SETTINGS.volumes.sfx),
      },
      reducedStimuli: parsed.reducedStimuli === true,
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

@Injectable({ providedIn: 'root' })
export class AudioSettingsStore {
  readonly settings = signal<AudioSettingsV1>(loadAudioSettings(localStorage));

  setVolume(bus: AdjustableAudioBus, value: number): void {
    this.settings.update(current => ({
      ...current,
      volumes: { ...current.volumes, [bus]: clamp01(value) },
    }));
    this.persist();
  }

  setReducedStimuli(enabled: boolean): void {
    this.settings.update(current => ({ ...current, reducedStimuli: enabled }));
    this.persist();
  }

  private persist(): void {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(this.settings()));
  }
}
```

- [ ] **Step 5: Run the focused tests**

```powershell
cd frontend
npx jest audio-settings.store.spec.ts --runInBand
```

Expected: `PASS`, 3 tests.

- [ ] **Step 6: Commit settings contracts**

```powershell
git add frontend/src/app/features/simulator/audio/audio-cue.model.ts frontend/src/app/features/simulator/audio/audio-settings.store.ts frontend/src/app/features/simulator/audio/audio-settings.store.spec.ts
git commit -m "feat(audio): define cues and persistent bus settings"
```

---

### Task 2: Build reproducible premium foley, room-tone, glass, and consequence assets

**Files:**
- Create: `tools/audio/import-kenney-rpg-audio.ps1`
- Create: `tools/audio/generate-premium-audio.mjs`
- Create: `tools/audio/validate-premium-audio.mjs`
- Create: `frontend/src/assets/game/audio/premium/LICENSES.md`
- Create: `frontend/src/app/features/simulator/audio/room-audio-profile.ts`
- Generate/import: files listed in the file map
- Modify: `frontend/package.json`

- [ ] **Step 1: Add the exact CC0 import script**

Create `tools/audio/import-kenney-rpg-audio.ps1`:

```powershell
$ErrorActionPreference = 'Stop'
$url = 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$destination = Join-Path $repo 'frontend\src\assets\game\audio\premium\kenney-rpg'
$archive = Join-Path $env:TEMP 'kenney_rpg-audio.zip'
$expectedSha256 = '6DBEAF8544DA958D8F2ADCB4A4A4B76C1ADE34A05F8AB9EDCCD327DA7375F38B'
$expanded = Join-Path $env:TEMP 'kenney_rpg-audio-expanded'
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$expandedFull = [System.IO.Path]::GetFullPath($expanded)
if (-not $expandedFull.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Unsafe expansion target: $expandedFull"
}
Write-Host "Verified temporary expansion target: $expandedFull"

Invoke-WebRequest -Uri $url -OutFile $archive
$actualSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
if ($actualSha256 -ne $expectedSha256) {
  Remove-Item -LiteralPath $archive -Force
  throw "Kenney archive SHA-256 mismatch: $actualSha256"
}
if (Test-Path $expanded) { Remove-Item -LiteralPath $expanded -Recurse -Force }
Expand-Archive -LiteralPath $archive -DestinationPath $expanded -Force
New-Item -ItemType Directory -Force $destination | Out-Null

$files = @(
  'footstep00.ogg','footstep01.ogg','footstep02.ogg','footstep03.ogg','footstep04.ogg',
  'footstep05.ogg','footstep06.ogg','footstep07.ogg','footstep08.ogg',
  'doorOpen_1.ogg','doorClose_1.ogg'
)
foreach ($name in $files) {
  Copy-Item -LiteralPath (Join-Path $expanded "Audio\$name") -Destination (Join-Path $destination $name) -Force
}
Copy-Item -LiteralPath (Join-Path $expanded 'License.txt') -Destination (Join-Path $destination 'License.txt') -Force
```

The recursive deletion is restricted to the fixed `%TEMP%\kenney_rpg-audio-expanded`
path. Before running it, resolve and print `$expanded`; it must start with
`[System.IO.Path]::GetTempPath()`. The pinned SHA-256 was measured from the
official Kenney download; an upstream replacement fails closed until license,
contents and hash are reviewed together.

- [ ] **Step 2: Add deterministic room-tone, glass, and consequence generation**

Create `tools/audio/generate-premium-audio.mjs`:

```js
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(root, 'frontend/src/assets/game/audio/premium');
const rate = 48_000;

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function normalize(samples, ceiling = .78) {
  const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0) || 1;
  const gain = Math.min(1, ceiling / peak);
  return samples.map(value => value * gain);
}

function wav(path, mono) {
  const samples = normalize(mono);
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataBytes, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  samples.forEach((value, index) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + index * 2));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
}

function roomTone(seconds, seed, humHz, air, movement) {
  const random = rng(seed);
  const total = rate * seconds;
  const periodicNoise = (knots) => {
    const values = Array.from({ length: knots }, () => random() * 2 - 1);
    return Array.from({ length: total }, (_, index) => {
      const phase = index * knots / total;
      const left = Math.floor(phase) % knots;
      const amount = phase - Math.floor(phase);
      const smooth = amount * amount * (3 - 2 * amount);
      return values[left] * (1 - smooth) + values[(left + 1) % knots] * smooth;
    });
  };
  const low = periodicNoise(521);
  const high = periodicNoise(8191);
  const samples = Array.from({ length: total }, (_, index) => {
    const t = index / rate;
    const hum = Math.sin(2 * Math.PI * humHz * t) * .025
      + Math.sin(2 * Math.PI * humHz * 2 * t) * .009;
    const slow = Math.sin(2 * Math.PI * movement * t) * .012;
    return (low[index] * .72 + high[index] * .28) * air + hum + slow;
  });
  const dc = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return samples.map(value => value - dc);
}

function glass(seconds, frequencies, noiseAmount) {
  const random = rng(frequencies.reduce((sum, value) => sum + value, 0));
  const total = Math.round(rate * seconds);
  return Array.from({ length: total }, (_, index) => {
    const t = index / rate;
    const decay = Math.exp(-7 * t);
    const resonances = frequencies.reduce((sum, hz, band) =>
      sum + Math.sin(2 * Math.PI * hz * t + band * .6) * (1 / (band + 1)), 0);
    const water = (random() * 2 - 1) * noiseAmount * Math.exp(-13 * t);
    return (resonances * .12 + water) * decay;
  });
}

function periodicPulse(seconds, period, frequency, gain) {
  const total = rate * seconds;
  return Array.from({ length: total }, (_, index) => {
    const phase = (index / rate) % period;
    const envelope = phase < .18 ? Math.sin(Math.PI * phase / .18) * Math.exp(-18 * phase) : 0;
    return Math.sin(2 * Math.PI * frequency * phase) * envelope * gain;
  });
}

wav(resolve(out, 'ambience/hospital-night.wav'), roomTone(24, 101, 60, .34, .125));
wav(resolve(out, 'ambience/waiting-room.wav'), roomTone(24, 202, 50, .27, 1 / 12));
wav(resolve(out, 'ambience/office-night.wav'), roomTone(24, 303, 60, .19, 1 / 24));
wav(resolve(out, 'localized/hospital-monitor.wav'), periodicPulse(12, 2, 880, .16));
wav(resolve(out, 'localized/waiting-clock.wav'), periodicPulse(16, 1, 1320, .09));
wav(resolve(out, 'localized/office-vent.wav'), roomTone(20, 404, 50, .13, .1));
wav(resolve(out, 'ui/glass-open.wav'), glass(.42, [440, 659, 988], .09));
wav(resolve(out, 'ui/glass-focus.wav'), glass(.24, [523, 784], .045));
wav(resolve(out, 'ui/glass-confirm.wav'), glass(.5, [330, 494, 740], .075));
wav(resolve(out, 'consequence/relief.wav'), glass(.58, [392, 523, 659], .025));
wav(resolve(out, 'consequence/steady.wav'), glass(.44, [330, 440], .02));
wav(resolve(out, 'consequence/tension.wav'), glass(.5, [311, 466, 622], .035));
wav(resolve(out, 'consequence/rupture.wav'), glass(.56, [294, 370, 415], .04));
```

- [ ] **Step 3: Add a deterministic asset validator**

Create `tools/audio/validate-premium-audio.mjs`:

```js
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const base = resolve(root, 'frontend/src/assets/game/audio/premium');
const required = [
  'ambience/hospital-night.wav','ambience/waiting-room.wav','ambience/office-night.wav',
  'localized/hospital-monitor.wav','localized/waiting-clock.wav','localized/office-vent.wav',
  'ui/glass-open.wav','ui/glass-focus.wav','ui/glass-confirm.wav',
  'consequence/relief.wav','consequence/steady.wav',
  'consequence/tension.wav','consequence/rupture.wav',
  ...Array.from({ length: 9 }, (_, index) => `kenney-rpg/footstep${String(index).padStart(2, '0')}.ogg`),
  'kenney-rpg/doorOpen_1.ogg','kenney-rpg/doorClose_1.ogg',
  'kenney-rpg/License.txt','LICENSES.md',
];

const missing = required.filter(relative => !existsSync(resolve(base, relative)));
if (missing.length) throw new Error(`Missing premium audio:\n${missing.join('\n')}`);

const upstreamLicense = readFileSync(resolve(base, 'kenney-rpg/License.txt'), 'utf8');
const provenance = readFileSync(resolve(base, 'LICENSES.md'), 'utf8');
if (!/CC0/i.test(upstreamLicense) || !/Kenney RPG Audio 1\.0[\s\S]*CC0/i.test(provenance)) {
  throw new Error('Kenney RPG Audio CC0 provenance is missing or inconsistent');
}

for (const relative of required.filter(name => name.endsWith('.wav'))) {
  const data = readFileSync(resolve(base, relative));
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${relative}: invalid WAV header`);
  }
  const samples = new Int16Array(data.buffer, data.byteOffset + 44, (data.length - 44) / 2);
  const durationSeconds = samples.length / 48_000;
  const isLoop = relative.startsWith('ambience/') || relative.startsWith('localized/');
  const minimumDuration = relative.startsWith('ambience/') ? 20 : 12;
  if (isLoop && durationSeconds < minimumDuration) {
    throw new Error(`${relative}: loop is only ${durationSeconds.toFixed(2)}s`);
  }
  if ((relative.startsWith('ui/') || relative.startsWith('consequence/')) && durationSeconds > 1) {
    throw new Error(`${relative}: one-shot cue is ${durationSeconds.toFixed(2)}s`);
  }
  const normalized = Array.from(samples, sample => sample / 32768);
  const peak = normalized.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
  const dc = normalized.reduce((sum, sample) => sum + sample, 0) / normalized.length;
  const clipped = normalized.filter(sample => Math.abs(sample) >= .9999).length;
  if (peak > .8913) throw new Error(`${relative}: peak ${peak} exceeds -1 dBFS`);
  if (clipped > 0) throw new Error(`${relative}: ${clipped} clipped samples`);
  if (Math.abs(dc) > .002) throw new Error(`${relative}: DC offset ${dc}`);
  if (isLoop) {
    const amplitudeSeam = Math.abs(normalized[0] - normalized.at(-1));
    const headSlope = normalized[1] - normalized[0];
    const tailSlope = normalized.at(-1) - normalized.at(-2);
    const derivativeError = Math.abs(headSlope - tailSlope);
    const window = 12_000;
    const rms = values => Math.sqrt(
      values.reduce((sum, value) => sum + value * value, 0) / values.length,
    );
    const headRms = rms(normalized.slice(0, window));
    const tailRms = rms(normalized.slice(-window));
    const energyRatio = Math.max(headRms, tailRms) / Math.max(.000001, Math.min(headRms, tailRms));
    if (amplitudeSeam > .002) throw new Error(`${relative}: amplitude seam ${amplitudeSeam}`);
    if (derivativeError > .01) throw new Error(`${relative}: derivative seam ${derivativeError}`);
    if (energyRatio > 1.2) throw new Error(`${relative}: seam energy ratio ${energyRatio}`);
  }
}

console.log(`premium audio validated: ${required.length} files`);
```

- [ ] **Step 4: Create the minimal typed room profile required by the mixer**

Task 3 must compile before the complete scene/surface authoring in Task 4. Create
the narrow contract now; Task 4 expands its map coverage and moves spatial
surface authority into `ScenePackageV1`:

```typescript
import { SceneAudioProfileV1 } from './audio-cue.model';

export type RoomAudioProfile = SceneAudioProfileV1;

const hospital: RoomAudioProfile = {
  musicKey: 'music.main',
  ambienceKey: 'ambience.hospital',
  defaultSurface: 'tile',
  surfaceZones: [],
  localizedSources: [],
};

export function resolveRoomAudioProfile(mapKey: string): RoomAudioProfile {
  if (mapKey === 'hospital-urgencias') return hospital;
  return {
    musicKey: 'music.main',
    ambienceKey: 'ambience.office',
    defaultSurface: 'wood',
    surfaceZones: [],
    localizedSources: [],
  };
}
```

This bootstrap deliberately has no rectangle/coordinate zones and no claim of
complete map coverage. Task 4's red tests require both.

- [ ] **Step 5: Record provenance**

Create `frontend/src/assets/game/audio/premium/LICENSES.md`:

```md
# Premium audio provenance

- `kenney-rpg/*`: Kenney RPG Audio 1.0, downloaded from https://kenney.nl/assets/rpg-audio, Creative Commons CC0. The original `License.txt` is stored beside the files.
- `ambience/*.wav`, `localized/*.wav`, `ui/*.wav` and `consequence/*.wav`: deterministic original synthesis generated by `tools/audio/generate-premium-audio.mjs`; project-owned, no third-party samples.
- `Musica_PsicoGame.mp3` and `PsicoLament.mp3`: pre-existing project masters; provenance remains governed by the repository's existing asset records.
```

- [ ] **Step 6: Generate, import, and validate**

Add to `frontend/package.json` scripts:

```json
"audio:generate": "node ../tools/audio/generate-premium-audio.mjs",
"audio:validate": "node ../tools/audio/validate-premium-audio.mjs"
```

Run from the repository root:

```powershell
$expanded = Join-Path $env:TEMP 'kenney_rpg-audio-expanded'
if (-not ([System.IO.Path]::GetFullPath($expanded)).StartsWith([System.IO.Path]::GetTempPath())) { throw 'Unsafe temp path' }
powershell -ExecutionPolicy Bypass -File tools/audio/import-kenney-rpg-audio.ps1
node tools/audio/generate-premium-audio.mjs
node tools/audio/validate-premium-audio.mjs
npm run build:frontend
```

Expected: `premium audio validated: 26 files` and the frontend build passes with
the minimal typed profile.

- [ ] **Step 7: Audition before commit**

Listen to every generated master, all nine imported footsteps (`00–08`), and
both imported door cues. Compare the four consequence cues in sequence and
reject them if their emotional direction becomes an answer hint before the
decision, if `rupture` is alarmist, or if the set sounds futuristic. Also reject
and tune the synthesis constants or variant assignment if there is a click at
loop boundaries, audible DC offset, harsh high-frequency tone, mismatched
surface, or fatigue after five loop repetitions. Re-run the validator after any
tuning.

- [ ] **Step 8: Commit the reproducible asset pipeline and outputs**

```powershell
git add tools/audio frontend/src/assets/game/audio/premium frontend/src/app/features/simulator/audio/room-audio-profile.ts frontend/package.json
git commit -m "feat(audio): add reproducible premium atmosphere assets"
```

---

### Task 3: Create the single Howler-backed mixer and prove bus behavior

**Files:**
- Create: `frontend/src/app/features/simulator/audio/audio-catalog.ts`
- Create: `frontend/src/app/features/simulator/audio/audio-consequence-contract.spec.ts`
- Create: `frontend/src/app/features/simulator/audio/audio-cue.port.ts`
- Create: `frontend/src/app/features/simulator/audio/audio-clip.port.ts`
- Create: `frontend/src/app/features/simulator/audio/howler-clip.factory.ts`
- Test: `frontend/src/app/features/simulator/audio/howler-clip.factory.spec.ts`
- Create: `frontend/src/app/features/simulator/audio/audio-mixer.service.ts`
- Test: `frontend/src/app/features/simulator/audio/audio-mixer.service.spec.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`

- [ ] **Step 1: Write failing mixer tests with a fake clip factory**

Create `frontend/src/app/features/simulator/audio/audio-mixer.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import {
  AUDIO_CLIP_FACTORY,
  AUDIO_CONTEXT_GATE,
  AudioClip,
  AudioClipFactory,
} from './audio-clip.port';
import { AudioMixerService } from './audio-mixer.service';
import { AudioSettingsStore } from './audio-settings.store';
import { resolveRoomAudioProfile } from './room-audio-profile';

class FakeClip implements AudioClip {
  playCount = 0; pauseCount = 0; stopCount = 0; unloadCount = 0;
  currentVolume = 0; active = false; lastFade: [number, number, number] | null = null;
  lastStereo = 0;
  play() { this.playCount += 1; this.active = true; return this.playCount; }
  pause() { this.pauseCount += 1; this.active = false; }
  stop() { this.stopCount += 1; this.active = false; }
  playing() { return this.active; }
  volume(value?: number) { if (value !== undefined) this.currentVolume = value; return this.currentVolume; }
  fade(from: number, to: number, ms: number) { this.currentVolume = to; this.lastFade = [from, to, ms]; }
  rate() { return 1; }
  stereo(value: number) { this.lastStereo = value; }
  unload() { this.unloadCount += 1; }
}

describe('AudioMixerService', () => {
  const clips = new Map<string, FakeClip>();
  const factory: AudioClipFactory = (key) => {
    const clip = new FakeClip(); clips.set(key, clip); return clip;
  };
  let contextState: AudioContextState = 'suspended';
  const contextGate = {
    state: jest.fn(() => contextState),
    resume: jest.fn(async () => { contextState = 'running'; }),
  };
  let mixer: AudioMixerService;
  let settings: AudioSettingsStore;

  beforeEach(() => {
    localStorage.clear(); clips.clear();
    contextState = 'suspended';
    contextGate.resume.mockClear(); contextGate.state.mockClear();
    TestBed.configureTestingModule({ providers: [
      AudioMixerService,
      AudioSettingsStore,
      { provide: AUDIO_CLIP_FACTORY, useValue: factory },
      { provide: AUDIO_CONTEXT_GATE, useValue: contextGate },
    ] });
    mixer = TestBed.inject(AudioMixerService);
    settings = TestBed.inject(AudioSettingsStore);
    mixer.init();
  });

  afterEach(() => mixer.dispose());

  it('applies independent bus gain and master gain', () => {
    settings.setVolume('master', .5);
    settings.setVolume('sfx', .4);
    mixer.dispatch({ type: 'ui', key: 'ui.confirm' });
    expect(clips.get('ui.confirm')?.currentVolume).toBeCloseTo(.5 * .4 * .58, 5);
  });

  it('maps every semantic consequence tone to one authored cue', () => {
    const tones = ['relief', 'steady', 'tension', 'rupture'] as const;
    for (const tone of tones) {
      mixer.dispatch({ type: 'consequence', tone });
      expect(clips.get(`consequence.${tone}`)?.playCount).toBe(1);
    }
    settings.setReducedStimuli(true);
    TestBed.flushEffects();
    mixer.dispatch({ type: 'consequence', tone: 'rupture' });
    expect(clips.get('consequence.rupture')?.playCount).toBe(2);
    expect(clips.get('consequence.rupture')?.currentVolume)
      .toBeCloseTo(.8 * .5 * .3 * .65, 5);
  });

  it('unlocks only from the explicit post-consent gesture', async () => {
    await mixer.unlockFromGesture();
    expect(contextGate.resume).toHaveBeenCalledTimes(1);
    expect(mixer.contextState()).toBe('running');
  });

  it('ducks music by 8 dB over 500 ms and restores without restart', () => {
    mixer.dispatch({ type: 'scene.enter', mapKey: 'hospital-urgencias', sceneInstanceKey: 'attempt-1:hospital-urgencias:1:hash-a', profile: resolveRoomAudioProfile('hospital-urgencias') });
    const music = clips.get('music.main')!;
    expect(music.playCount).toBe(1);
    mixer.dispatch({ type: 'dialogue', active: true, sensitive: true });
    expect(music.lastFade?.[2]).toBe(500);
    expect(music.currentVolume).toBeCloseTo(.42 * .8 * Math.pow(10, -8 / 20), 5);
    mixer.dispatch({ type: 'dialogue', active: false, sensitive: false });
    expect(music.playCount).toBe(1);
  });

  it('crossfades room loops and stops the old loop only after the fade', () => {
    jest.useFakeTimers();
    try {
      mixer.dispatch({ type: 'scene.enter', mapKey: 'hospital-urgencias', sceneInstanceKey: 'attempt-1:hospital-urgencias:1:hash-a', profile: resolveRoomAudioProfile('hospital-urgencias') });
      mixer.dispatch({ type: 'scene.enter', mapKey: 'comisaria-consultorio', sceneInstanceKey: 'attempt-1:comisaria-consultorio:2:hash-b', profile: resolveRoomAudioProfile('comisaria-consultorio') });
      const outgoing = clips.get('ambience.hospital')!;
      expect(outgoing.lastFade?.[2]).toBe(320);
      expect(clips.get('ambience.office')?.playCount).toBe(1);
      jest.advanceTimersByTime(319);
      expect(outgoing.stopCount).toBe(0);
      jest.advanceTimersByTime(1);
      expect(outgoing.stopCount).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('never repeats the same footstep variant consecutively', () => {
    for (let index = 0; index < 100; index += 1) {
      mixer.dispatch({ type: 'footstep', surface: 'tile', contactId: String(index), pan: 0 });
    }
    const played = mixer.debugPlayedFootsteps();
    expect(played).toHaveLength(100);
    expect(played.every((key, index) => index === 0 || key !== played[index - 1])).toBe(true);
  });

  it('pause/resume does not create duplicate loops', () => {
    mixer.dispatch({ type: 'scene.enter', mapKey: 'hospital-urgencias', sceneInstanceKey: 'attempt-1:hospital-urgencias:1:hash-a', profile: resolveRoomAudioProfile('hospital-urgencias') });
    mixer.dispatch({ type: 'pause' });
    mixer.dispatch({ type: 'resume' });
    mixer.dispatch({ type: 'resume' });
    expect(clips.get('music.main')?.playCount).toBe(2);
    expect(clips.get('ambience.hospital')?.playCount).toBe(2);
  });

  it('plays one localized source, updates gain/pan, and removes it in reduced stimuli', () => {
    jest.useFakeTimers();
    try {
    mixer.dispatch({ type: 'scene.enter', mapKey: 'hospital-urgencias', sceneInstanceKey: 'attempt-1:hospital-urgencias:1:hash-a', profile: resolveRoomAudioProfile('hospital-urgencias') });
    mixer.dispatch({
      type: 'spatial-source', sourceId: 'monitor', key: 'source.hospital-monitor',
      active: true, gain: .5, pan: .25,
    });
    const source = clips.get('source.hospital-monitor')!;
    expect(source.playCount).toBe(1);
    expect(source.currentVolume).toBeCloseTo(.8 * .34 * .5 * .5, 5);
    expect(source.lastStereo).toBe(.25);
    expect(mixer.debugSnapshot().baseLoops.sort()).toEqual(
      ['ambience.hospital', 'music.main'].sort(),
    );
    expect(mixer.debugSnapshot().spatialLoops).toEqual(['source.hospital-monitor']);
    mixer.dispatch({
      type: 'spatial-source', sourceId: 'monitor', key: 'source.hospital-monitor',
      active: true, gain: .3, pan: -.2,
    });
    expect(source.playCount).toBe(1);
    expect(source.lastStereo).toBe(-.2);
    settings.setReducedStimuli(true);
    TestBed.flushEffects();
    expect(source.lastFade?.[2]).toBe(180);
    jest.advanceTimersByTime(180);
    expect(source.playing()).toBe(false);
    expect(mixer.debugSnapshot().spatialLoops).toEqual([]);
    settings.setReducedStimuli(false);
    TestBed.flushEffects();
    expect(source.playCount).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears localized playback when a new attempt reuses the same map content', () => {
    jest.useFakeTimers();
    try {
      const profile = resolveRoomAudioProfile('hospital-urgencias');
      mixer.dispatch({ type: 'scene.enter', mapKey: 'hospital-urgencias', sceneInstanceKey: 'attempt-1:hospital-urgencias:1:hash-a', profile });
      mixer.dispatch({ type: 'spatial-source', sourceId: 'monitor', key: 'source.hospital-monitor', active: true, gain: .5, pan: 0 });
      mixer.dispatch({ type: 'scene.enter', mapKey: 'hospital-urgencias', sceneInstanceKey: 'attempt-2:hospital-urgencias:1:hash-a', profile });
      expect(mixer.debugSnapshot().spatialSources).toEqual({});
      jest.advanceTimersByTime(180);
      expect(clips.get('source.hospital-monitor')?.playing()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('accepts the same contact token after sceneInstanceKey changes', () => {
    const profile = resolveRoomAudioProfile('hospital-urgencias');
    mixer.dispatch({ type: 'scene.enter', mapKey: 'hospital-urgencias', sceneInstanceKey: 'attempt-1:hospital-urgencias:1:hash-a', profile });
    mixer.dispatch({ type: 'footstep', surface: 'tile', contactId: 'walk-down:0', pan: 0 });
    mixer.dispatch({ type: 'scene.enter', mapKey: 'hospital-urgencias', sceneInstanceKey: 'attempt-2:hospital-urgencias:1:hash-a', profile });
    mixer.dispatch({ type: 'footstep', surface: 'tile', contactId: 'walk-down:0', pan: 0 });

    expect(mixer.debugPlayedFootsteps()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Define the catalogue and the cue/clip ports**

Create `frontend/src/app/features/simulator/audio/audio-catalog.ts`:

```ts
import {
  AudioBus,
  ConsequenceAudioKey,
  FootstepSurface,
  LocalizedSourceKey,
  UiAudioKey,
} from './audio-cue.model';

export type AudioAssetKey = UiAudioKey
  | 'music.main' | 'music.intro'
  | 'ambience.hospital' | 'ambience.waiting' | 'ambience.office'
  | LocalizedSourceKey
  | ConsequenceAudioKey
  | `footstep.${FootstepSurface}.${number}`;

export interface AudioCatalogEntry {
  readonly bus: AudioBus;
  readonly src: readonly string[];
  readonly loop: boolean;
  readonly baseGain: number;
}

const premium = '/assets/game/audio/premium';
const ui = '/assets/game/kenney/ui-audio/Audio';

export const AUDIO_CATALOG: Readonly<Record<AudioAssetKey, AudioCatalogEntry>> = {
  'music.main': { bus: 'music', src: ['/assets/game/audio/Musica_PsicoGame.mp3'], loop: true, baseGain: 1 },
  'music.intro': { bus: 'music', src: ['/assets/game/audio/PsicoLament.mp3'], loop: true, baseGain: 1 },
  'ambience.hospital': { bus: 'ambience', src: [`${premium}/ambience/hospital-night.wav`], loop: true, baseGain: .74 },
  'ambience.waiting': { bus: 'ambience', src: [`${premium}/ambience/waiting-room.wav`], loop: true, baseGain: .68 },
  'ambience.office': { bus: 'ambience', src: [`${premium}/ambience/office-night.wav`], loop: true, baseGain: .62 },
  'source.hospital-monitor': { bus: 'ambience', src: [`${premium}/localized/hospital-monitor.wav`], loop: true, baseGain: .5 },
  'source.waiting-clock': { bus: 'ambience', src: [`${premium}/localized/waiting-clock.wav`], loop: true, baseGain: .42 },
  'source.office-vent': { bus: 'ambience', src: [`${premium}/localized/office-vent.wav`], loop: true, baseGain: .38 },
  'ui.select': { bus: 'sfx', src: [`${ui}/rollover1.ogg`], loop: false, baseGain: .28 },
  'ui.confirm': { bus: 'sfx', src: [`${ui}/click1.ogg`], loop: false, baseGain: .58 },
  'ui.cancel': { bus: 'sfx', src: [`${ui}/mouserelease1.ogg`], loop: false, baseGain: .45 },
  'dialogue.advance': { bus: 'voice', src: [`${ui}/click2.ogg`], loop: false, baseGain: .24 },
  'dialogue.blip': { bus: 'voice', src: ['/assets/game/audio/blip_select.ogg'], loop: false, baseGain: .12 },
  'glass.open': { bus: 'sfx', src: [`${premium}/ui/glass-open.wav`], loop: false, baseGain: .3 },
  'glass.focus': { bus: 'sfx', src: [`${premium}/ui/glass-focus.wav`], loop: false, baseGain: .18 },
  'glass.confirm': { bus: 'sfx', src: [`${premium}/ui/glass-confirm.wav`], loop: false, baseGain: .34 },
  'consequence.relief': { bus: 'sfx', src: [`${premium}/consequence/relief.wav`], loop: false, baseGain: .32 },
  'consequence.steady': { bus: 'sfx', src: [`${premium}/consequence/steady.wav`], loop: false, baseGain: .27 },
  'consequence.tension': { bus: 'sfx', src: [`${premium}/consequence/tension.wav`], loop: false, baseGain: .29 },
  'consequence.rupture': { bus: 'sfx', src: [`${premium}/consequence/rupture.wav`], loop: false, baseGain: .3 },
  'door.open': { bus: 'sfx', src: [`${premium}/kenney-rpg/doorOpen_1.ogg`], loop: false, baseGain: .56 },
  'door.close': { bus: 'sfx', src: [`${premium}/kenney-rpg/doorClose_1.ogg`], loop: false, baseGain: .5 },
  'session.complete': { bus: 'sfx', src: [`${ui}/click5.ogg`], loop: false, baseGain: .5 },
  ...Object.fromEntries(Array.from({ length: 3 }, (_, index) => [
    `footstep.tile.${index}`, { bus: 'sfx', src: [`${premium}/kenney-rpg/footstep0${index}.ogg`], loop: false, baseGain: .34 },
  ])),
  ...Object.fromEntries(Array.from({ length: 3 }, (_, index) => [
    `footstep.wood.${index}`, { bus: 'sfx', src: [`${premium}/kenney-rpg/footstep0${index + 3}.ogg`], loop: false, baseGain: .31 },
  ])),
  ...Object.fromEntries(Array.from({ length: 3 }, (_, index) => [
    `footstep.carpet.${index}`, { bus: 'sfx', src: [`${premium}/kenney-rpg/footstep0${index + 6}.ogg`], loop: false, baseGain: .2 },
  ])),
} as Record<AudioAssetKey, AudioCatalogEntry>;
```

Crear `audio-consequence-contract.spec.ts` para impedir que cuerpo, retrato,
dominio clínico y audio diverjan silenciosamente:

```ts
import { CONSEQUENCE_TONES, type ConsequenceTone } from '../../../core/models/consequence-tone.model';
import type { ClinicalConsequence } from '../../../core/models/simulation.model';
import { resolveActorRenderPlan } from '../../character/actor-render-plan.util';
import { resolveAvatarRenderPlan } from '../../character/avatar-render-plan.util';
import { makeCharacterManifestFixture } from '../../character/character-test.fixture';
import { AUDIO_CATALOG } from './audio-catalog';

describe('clinical/visual/audio consequence contract', () => {
  it.each(CONSEQUENCE_TONES)('resolves %s for all 21 render plans', (tone: ConsequenceTone) => {
    const manifest = makeCharacterManifestFixture();
    expect(manifest.identities).toHaveLength(10);
    expect(manifest.actorVisuals).toHaveLength(11);
    expect(Object.keys(manifest.actorMappings)).toHaveLength(14);

    const avatars = manifest.identities.map(identity => {
      const variant = identity.variants.find(item => item.variantId === 'base') ?? identity.variants[0];
      if (!variant) throw new Error(`Missing variant for ${identity.characterId}`);
      return resolveAvatarRenderPlan(manifest, {
        schemaVersion: 1,
        manifestVersion: manifest.manifestVersion,
        characterId: identity.characterId,
        variantId: variant.variantId,
        contentHash: variant.contentHash,
      });
    });
    const actors = manifest.actorVisuals.map(visual => {
      const actorId = Object.entries(manifest.actorMappings)
        .find(([, visualId]) => visualId === visual.visualId)?.[0];
      if (!actorId) throw new Error(`Missing actor mapping for ${visual.visualId}`);
      return resolveActorRenderPlan(manifest, actorId);
    });
    const plans = [...avatars, ...actors];
    expect(plans).toHaveLength(21);

    const clinical: Pick<ClinicalConsequence, 'tone'> = { tone };
    const audioKey = `consequence.${clinical.tone}` as const;
    expect(AUDIO_CATALOG[audioKey]).toEqual(expect.objectContaining({ bus: 'sfx' }));
    for (const plan of plans) {
      const reaction = plan.consequenceReactions[clinical.tone];
      expect(plan.animations[reaction.animationId]).toBeDefined();
      expect(plan.portrait.states[reaction.portraitState]).toBeDefined();
      expect(reaction.portraitState).toBe(clinical.tone);
    }
  });
});
```

La tabla ejecuta 4 × 21 resoluciones reales y falla si falta una reacción, un
portrait state, un actor mapping o `AUDIO_CATALOG['consequence.' + tone]`; no
permite `unknown`, fallback visual ni cue genérico.

Create `frontend/src/app/features/simulator/audio/audio-clip.port.ts`:

```ts
import { InjectionToken } from '@angular/core';
import { AudioCatalogEntry } from './audio-catalog';

export interface AudioClip {
  play(): number;
  pause(): void;
  stop(): void;
  playing(): boolean;
  volume(value?: number): number;
  fade(from: number, to: number, ms: number): void;
  rate(value?: number): number;
  stereo(value: number): void;
  unload(): void;
}

export type AudioClipFactory = (key: string, entry: AudioCatalogEntry) => AudioClip;
export const AUDIO_CLIP_FACTORY = new InjectionToken<AudioClipFactory>('AUDIO_CLIP_FACTORY');

export interface AudioContextGate {
  state(): AudioContextState | 'unavailable';
  resume(): Promise<void>;
}

export const AUDIO_CONTEXT_GATE = new InjectionToken<AudioContextGate>('AUDIO_CONTEXT_GATE');
```

Create `frontend/src/app/features/simulator/audio/audio-cue.port.ts`. This port
can request a semantic cue but cannot initialize, unlock, inspect or dispose an
audio engine:

```ts
import { InjectionToken } from '@angular/core';
import type { AudioCue } from './audio-cue.model';

export interface AudioCuePort {
  dispatch(cue: AudioCue): void;
}

export const AUDIO_CUE_PORT = new InjectionToken<AudioCuePort>('AUDIO_CUE_PORT');

export const NOOP_AUDIO_CUE_PORT: AudioCuePort = Object.freeze({
  dispatch: (_cue: AudioCue): void => undefined,
});
```

`NOOP_AUDIO_CUE_PORT` is allowed only for non-playable editor preview. The real
simulator aliases `AUDIO_CUE_PORT` to its existing `AudioMixerService`; no
component may instantiate another mixer to satisfy this token.

- [ ] **Step 3: Write the red pure adapter test for a pre-`Howl` gesture**

Create `frontend/src/app/features/simulator/audio/howler-clip.factory.spec.ts`.
This is a pure module-boundary test: it does not use Angular `TestBed`, does not
construct a `Howl`, and deliberately models the conservative boundary where
`Howler.ctx`/`masterGain` remain `null` until the public setup-forcing call has
completed:

```ts
describe('howlerContextGate', () => {
  afterEach(() => {
    jest.dontMock('howler');
    jest.resetModules();
  });

  it('creates, resumes, and limits the context from the consent gesture before any Howl exists', async () => {
    jest.resetModules();
    let state: AudioContextState = 'suspended';
    const compressor = {
      threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 },
      attack: { value: 0 }, release: { value: 0 }, connect: jest.fn(),
    };
    const context = {
      get state() { return state; },
      resume: jest.fn(async () => { state = 'running'; }),
      createDynamicsCompressor: jest.fn(() => compressor),
      destination: {},
    };
    const masterGain = { disconnect: jest.fn(), connect: jest.fn() };
    const howler = {
      ctx: null as typeof context | null,
      masterGain: null as typeof masterGain | null,
      volume: jest.fn((value?: number) => {
        if (value !== undefined) {
          howler.ctx = context;
          howler.masterGain = masterGain;
        }
        return .8;
      }),
    };
    const Howl = jest.fn(() => { throw new Error('unlock must not construct a Howl'); });
    jest.doMock('howler', () => ({ Howl, Howler: howler }));

    const { howlerContextGate } = await import('./howler-clip.factory');
    await howlerContextGate.resume();

    expect(howler.volume.mock.calls).toEqual([[], [.8]]);
    expect(Howl).not.toHaveBeenCalled();
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(howlerContextGate.state()).toBe('running');
    expect(context.createDynamicsCompressor).toHaveBeenCalledTimes(1);
    expect(masterGain.disconnect).toHaveBeenCalledTimes(1);
    expect(masterGain.connect).toHaveBeenCalledWith(compressor);
    expect(compressor.connect).toHaveBeenCalledWith(context.destination);
  });
});
```

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/audio/howler-clip.factory.spec.ts
```

Expected: `FAIL`; `Howler.volume` has no setter call, `ctx` remains unavailable,
and `resume`/limiter installation do not occur.

- [ ] **Step 4: Implement the only Howler adapter**

Create `frontend/src/app/features/simulator/audio/howler-clip.factory.ts`:

```ts
import { Howl, Howler } from 'howler';
import { AudioClip, AudioClipFactory, AudioContextGate } from './audio-clip.port';

class HowlerClip implements AudioClip {
  constructor(private readonly howl: Howl) {}
  play(): number { return this.howl.play(); }
  pause(): void { this.howl.pause(); }
  stop(): void { this.howl.stop(); }
  playing(): boolean { return this.howl.playing(); }
  volume(value?: number): number {
    if (value !== undefined) this.howl.volume(value);
    return this.howl.volume();
  }
  fade(from: number, to: number, ms: number): void { this.howl.fade(from, to, ms); }
  rate(value?: number): number {
    if (value !== undefined) this.howl.rate(value);
    return this.howl.rate();
  }
  stereo(value: number): void { this.howl.stereo(value); }
  unload(): void { this.howl.unload(); }
}

let limiterInstalled = false;

function installMasterLimiter(): void {
  if (limiterInstalled) return;
  const context = Howler.ctx;
  const master = Howler.masterGain;
  if (!context || !master) return;
  let disconnected = false;
  try {
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = .003;
    limiter.release.value = .1;
    master.disconnect();
    disconnected = true;
    master.connect(limiter);
    limiter.connect(context.destination);
    limiterInstalled = true;
  } catch (error) {
    if (disconnected) {
      try { master.connect(context.destination); } catch {}
    }
    console.warn('[AudioMixer] Master limiter could not be installed', error);
  }
}

export const howlerClipFactory: AudioClipFactory = (_key, entry) => {
  const howl = new Howl({
    src: [...entry.src],
    loop: entry.loop,
    volume: 0,
    preload: true,
    html5: false,
    onloaderror: (_id, error) => console.warn(`[AudioMixer] Could not load ${entry.src[0]}`, error),
  });
  installMasterLimiter();
  return new HowlerClip(howl);
};

export const howlerContextGate: AudioContextGate = {
  state: () => Howler.ctx?.state ?? 'unavailable',
  resume: async () => {
    // The public volume round-trip forces Howler to create ctx/masterGain while
    // the consent/resume event still carries transient browser user activation.
    const currentVolume = Howler.volume();
    Howler.volume(currentVolume);
    const context = Howler.ctx;
    if (context?.state === 'suspended') await context.resume();
    installMasterLimiter();
  },
};
```

The getter-plus-setter is deliberate: Howler 2.2 currently enters its setup path
from `volume()` before either branch, while the setter makes the initialization
intent explicit and avoids depending on getter side effects in a future adapter
upgrade. `unlockFromGesture()` runs before `init()`/the first `Howl`. Never defer
this setter or `context.resume()` to a promise created outside the click handler.
Re-run the adapter spec: expected `PASS`, with `state() === 'running'` and no
`Howl` construction.

Register it in `SimulationPlayComponent.providers`:

```ts
import { AUDIO_CUE_PORT } from './audio/audio-cue.port';

providers: [
  AudioMixerService,
  { provide: AUDIO_CUE_PORT, useExisting: AudioMixerService },
  { provide: AUDIO_CLIP_FACTORY, useValue: howlerClipFactory },
  { provide: AUDIO_CONTEXT_GATE, useValue: howlerContextGate },
],
```

Import `AudioMixerService` in the component. In component tests that instantiate
`SimulationPlayComponent`, replace its component-level providers with both the
fake mixer and the same cue-port alias; a root provider alone does not replace a
component provider:

```ts
TestBed.overrideComponent(SimulationPlayComponent, {
  set: { providers: [
    { provide: AudioMixerService, useValue: audio },
    { provide: AUDIO_CUE_PORT, useExisting: AudioMixerService },
  ] },
});
```

- [ ] **Step 5: Implement the single mixer**

Create `frontend/src/app/features/simulator/audio/audio-mixer.service.ts`:

```ts
import { Injectable, effect, inject } from '@angular/core';
import type { ConsequenceTone } from '../../../core/models/consequence-tone.model';
import { AUDIO_CATALOG, AudioAssetKey } from './audio-catalog';
import { AUDIO_CLIP_FACTORY, AUDIO_CONTEXT_GATE, AudioClip } from './audio-clip.port';
import { AudioCue, FootstepSurface, LocalizedSourceKey, SceneAudioProfileV1 } from './audio-cue.model';
import type { AudioCuePort } from './audio-cue.port';
import { AudioSettingsStore } from './audio-settings.store';

const dbToGain = (db: number): number => Math.pow(10, db / 20);

@Injectable()
export class AudioMixerService implements AudioCuePort {
  private readonly factory = inject(AUDIO_CLIP_FACTORY);
  private readonly contextGate = inject(AUDIO_CONTEXT_GATE);
  private readonly settingsStore = inject(AudioSettingsStore);
  private readonly clips = new Map<AudioAssetKey, AudioClip>();
  private activeMusic: AudioAssetKey | null = null;
  private activeAmbience: AudioAssetKey | null = null;
  private currentMapKey: string | null = null;
  private currentSceneInstanceKey: string | null = null;
  private currentSceneProfile: SceneAudioProfileV1 | null = null;
  private introActive = false;
  private readonly transitionTimers = new Map<AudioAssetKey, number>();
  private readonly playCounts = new Map<AudioAssetKey, number>();
  private pausedLoopKeys: AudioAssetKey[] = [];
  private dialogueDuck = 1;
  private initialized = false;
  private readonly lastFootstepVariant = new Map<FootstepSurface, number>();
  private readonly footstepAudit: string[] = [];
  private lastFootstepContactId: string | null = null;
  private readonly spatialSources = new Map<string, {
    key: LocalizedSourceKey; active: boolean; gain: number; pan: number;
  }>();

  constructor() {
    effect(() => {
      const settings = this.settingsStore.settings();
      if (!this.initialized) return;
      if (this.currentSceneProfile) {
        this.switchLoop(
          'ambience',
          settings.reducedStimuli ? null : this.currentSceneProfile.ambienceKey,
        );
      }
      this.syncSpatialSources();
      this.applyAllGains(180);
    });
  }

  init(): void {
    if (this.initialized) return;
    for (const [key, entry] of Object.entries(AUDIO_CATALOG) as [AudioAssetKey, (typeof AUDIO_CATALOG)[AudioAssetKey]][]) {
      this.clips.set(key, this.factory(key, entry));
    }
    this.initialized = true;
    this.applyAllGains(0);
  }

  async unlockFromGesture(): Promise<void> {
    try {
      await this.contextGate.resume();
    } catch (error) {
      console.warn('[AudioMixer] Audio context could not be resumed', error);
    }
  }

  contextState(): AudioContextState | 'unavailable' {
    return this.contextGate.state();
  }

  debugSnapshot() {
    const baseLoops = [this.activeMusic, this.activeAmbience]
      .filter((key): key is AudioAssetKey => Boolean(key))
      .filter(key => Boolean(this.clips.get(key)?.playing()));
    const spatialLoops = [...new Set(
      [...this.spatialSources.values()]
        .filter(source => source.active && this.clips.get(source.key)?.playing())
        .map(source => source.key),
    )];
    return {
      contextState: this.contextGate.state(),
      activeMusic: this.activeMusic,
      activeAmbience: this.activeAmbience,
      sceneInstanceKey: this.currentSceneInstanceKey,
      baseLoops,
      spatialLoops,
      playCounts: Object.fromEntries(this.playCounts),
      spatialSources: Object.fromEntries(this.spatialSources),
    };
  }

  dispatch(cue: AudioCue): void {
    if (!this.initialized) return;
    if (cue.type === 'scene.enter') this.enterScene(cue.mapKey, cue.sceneInstanceKey, cue.profile);
    else if (cue.type === 'intro') this.setIntro(cue.active);
    else if (cue.type === 'ui') this.playUi(cue.key, cue.pan ?? 0);
    else if (cue.type === 'footstep') {
      if (cue.contactId === this.lastFootstepContactId) return;
      this.lastFootstepContactId = cue.contactId;
      this.playFootstep(cue.surface, cue.pan);
    }
    else if (cue.type === 'spatial-source') this.setSpatialSource(cue);
    else if (cue.type === 'consequence') this.playConsequence(cue.tone);
    else if (cue.type === 'dialogue') this.setDialogueDuck(cue.active, cue.sensitive);
    else if (cue.type === 'pause') this.pause();
    else if (cue.type === 'resume') this.resume();
    else if (cue.type === 'stop') this.stop();
  }

  debugPlayedFootsteps(): readonly string[] { return this.footstepAudit; }

  dispose(): void {
    this.stop();
    this.clips.forEach(clip => clip.unload());
    this.clips.clear();
    this.playCounts.clear();
    this.initialized = false;
  }

  private enterScene(mapKey: string, sceneInstanceKey: string, authoredProfile: SceneAudioProfileV1): void {
    if (this.currentSceneInstanceKey !== sceneInstanceKey) {
      this.clearSpatialSources();
      this.lastFootstepContactId = null;
    }
    this.currentMapKey = mapKey;
    this.currentSceneInstanceKey = sceneInstanceKey;
    this.currentSceneProfile = authoredProfile;
    if (this.introActive) return;
    const profile = this.currentSceneProfile;
    this.switchLoop('music', profile.musicKey);
    const ambience = this.settingsStore.settings().reducedStimuli ? null : profile.ambienceKey;
    this.switchLoop('ambience', ambience);
  }

  private setIntro(active: boolean): void {
    this.introActive = active;
    if (active) {
      this.switchLoop('ambience', null);
      this.switchLoop('music', 'music.intro');
      return;
    }
    if (this.currentMapKey && this.currentSceneInstanceKey && this.currentSceneProfile) this.enterScene(
      this.currentMapKey,
      this.currentSceneInstanceKey,
      this.currentSceneProfile,
    );
  }

  private switchLoop(bus: 'music' | 'ambience', next: AudioAssetKey | null): void {
    const field = bus === 'music' ? this.activeMusic : this.activeAmbience;
    if (field === next) return;
    if (field) {
      const outgoing = this.clips.get(field);
      if (outgoing) {
        outgoing.fade(outgoing.volume(), 0, 320);
        const previousTimer = this.transitionTimers.get(field);
        if (previousTimer !== undefined) window.clearTimeout(previousTimer);
        this.transitionTimers.set(field, window.setTimeout(() => {
          outgoing.stop();
          this.transitionTimers.delete(field);
        }, 320));
      }
    }
    if (bus === 'music') this.activeMusic = next; else this.activeAmbience = next;
    if (!next) return;
    const clip = this.clips.get(next);
    if (!clip) return;
    const staleTimer = this.transitionTimers.get(next);
    if (staleTimer !== undefined) {
      window.clearTimeout(staleTimer);
      this.transitionTimers.delete(next);
    }
    clip.volume(0);
    if (!clip.playing()) this.playClip(next, clip);
    clip.fade(0, this.gainFor(next), 320);
  }

  private playUi(key: AudioAssetKey, pan: number): void {
    const reduced = this.settingsStore.settings().reducedStimuli;
    if (reduced && (key === 'ui.select' || key === 'dialogue.blip' || key === 'glass.focus' || key === 'glass.open')) return;
    const clip = this.clips.get(key);
    if (!clip) return;
    clip.volume(this.gainFor(key));
    clip.stereo(Math.max(-.35, Math.min(.35, pan)));
    this.playClip(key, clip);
  }

  private playConsequence(tone: ConsequenceTone): void {
    const key = `consequence.${tone}` as const;
    const clip = this.clips.get(key);
    if (!clip) return;
    const reducedGain = this.settingsStore.settings().reducedStimuli ? .65 : 1;
    clip.volume(this.gainFor(key) * reducedGain);
    clip.stereo(0);
    this.playClip(key, clip);
  }

  private playFootstep(surface: FootstepSurface, pan: number): void {
    const last = this.lastFootstepVariant.get(surface) ?? -1;
    const next = (last + 1 + Math.floor(Math.random() * 2)) % 3;
    this.lastFootstepVariant.set(surface, next);
    const key = `footstep.${surface}.${next}` as AudioAssetKey;
    const clip = this.clips.get(key);
    if (!clip) return;
    clip.volume(this.gainFor(key) * (this.settingsStore.settings().reducedStimuli ? .55 : 1));
    clip.rate(.97 + Math.random() * .06);
    clip.stereo(Math.max(-.35, Math.min(.35, pan)));
    this.playClip(key, clip);
    this.footstepAudit.push(key);
  }

  private setDialogueDuck(active: boolean, sensitive: boolean): void {
    this.dialogueDuck = active ? dbToGain(sensitive ? -8 : -6) : 1;
    if (this.activeMusic) this.fadeToGain(this.activeMusic, active ? 500 : 650);
    if (this.activeAmbience) this.fadeToGain(this.activeAmbience, active ? 420 : 700);
  }

  private setSpatialSource(cue: Extract<AudioCue, { type: 'spatial-source' }>): void {
    this.spatialSources.set(cue.sourceId, {
      key: cue.key,
      active: cue.active,
      gain: Math.max(0, Math.min(1, cue.gain)),
      pan: Math.max(-.6, Math.min(.6, cue.pan)),
    });
    this.syncSpatialSources();
    if (!cue.active) this.spatialSources.delete(cue.sourceId);
  }

  private syncSpatialSources(): void {
    const reduced = this.settingsStore.settings().reducedStimuli;
    for (const state of this.spatialSources.values()) {
      const clip = this.clips.get(state.key);
      if (!clip) continue;
      if (!state.active || reduced || state.gain <= .01) {
        this.fadeOutSpatialSource(state.key);
        continue;
      }
      const staleTimer = this.transitionTimers.get(state.key);
      if (staleTimer !== undefined) {
        window.clearTimeout(staleTimer);
        this.transitionTimers.delete(state.key);
      }
      clip.stereo(state.pan);
      clip.volume(this.gainFor(state.key));
      if (!clip.playing()) this.playClip(state.key, clip);
    }
  }

  private clearSpatialSources(): void {
    for (const state of this.spatialSources.values()) this.fadeOutSpatialSource(state.key);
    this.spatialSources.clear();
  }

  private fadeOutSpatialSource(key: LocalizedSourceKey): void {
    const clip = this.clips.get(key);
    if (!clip?.playing() || this.transitionTimers.has(key)) return;
    clip.fade(clip.volume(), 0, 180);
    this.transitionTimers.set(key, window.setTimeout(() => {
      clip.stop();
      this.transitionTimers.delete(key);
    }, 180));
  }

  private pause(): void {
    this.pausedLoopKeys = [...new Set([
      this.activeMusic,
      this.activeAmbience,
      ...[...this.spatialSources.values()].filter(state => state.active).map(state => state.key),
    ].filter((key): key is AudioAssetKey => key !== null && Boolean(this.clips.get(key)?.playing())))];
    this.pausedLoopKeys.forEach(key => this.clips.get(key)?.pause());
  }

  private resume(): void {
    for (const key of this.pausedLoopKeys) {
      const clip = this.clips.get(key);
      if (clip && !clip.playing()) this.playClip(key, clip);
    }
    this.pausedLoopKeys = [];
  }

  private stop(): void {
    for (const timer of this.transitionTimers.values()) window.clearTimeout(timer);
    this.transitionTimers.clear();
    this.clips.forEach(clip => clip.stop());
    this.activeMusic = null;
    this.activeAmbience = null;
    this.currentMapKey = null;
    this.currentSceneInstanceKey = null;
    this.currentSceneProfile = null;
    this.introActive = false;
    this.pausedLoopKeys = [];
    this.lastFootstepContactId = null;
    this.spatialSources.clear();
    this.dialogueDuck = 1;
  }

  private applyAllGains(fadeMs: number): void {
    for (const key of this.clips.keys()) {
      if (fadeMs > 0) this.fadeToGain(key, fadeMs);
      else this.clips.get(key)?.volume(this.gainFor(key));
    }
  }

  private playClip(key: AudioAssetKey, clip: AudioClip): void {
    clip.play();
    this.playCounts.set(key, (this.playCounts.get(key) ?? 0) + 1);
  }

  private fadeToGain(key: AudioAssetKey, ms: number): void {
    const clip = this.clips.get(key);
    if (clip) clip.fade(clip.volume(), this.gainFor(key), ms);
  }

  private gainFor(key: AudioAssetKey): number {
    const entry = AUDIO_CATALOG[key];
    const settings = this.settingsStore.settings();
    const stimuliGain = settings.reducedStimuli
      ? entry.bus === 'ambience' ? 0 : entry.bus === 'music' ? .62 : 1
      : 1;
    const duck = entry.bus === 'music' ? this.dialogueDuck
      : entry.bus === 'ambience' && this.dialogueDuck < 1 ? Math.max(this.dialogueDuck, .5) : 1;
    const spatial = [...this.spatialSources.values()].find(state => state.key === key)?.gain ?? 1;
    return settings.volumes.master * settings.volumes[entry.bus] * entry.baseGain * stimuliGain * duck * spatial;
  }
}
```

Append this exact mixer test; it proves the mode removes decoration without erasing meaningful confirmation:

```ts
it('applies and reverses reduced stimuli without duplicating loops or confirmations', () => {
  jest.useFakeTimers();
  try {
    mixer.dispatch({ type: 'scene.enter', mapKey: 'hospital-urgencias', sceneInstanceKey: 'attempt-1:hospital-urgencias:1:hash-a', profile: resolveRoomAudioProfile('hospital-urgencias') });
    const music = clips.get('music.main')!;
    const ambience = clips.get('ambience.hospital')!;

    settings.setReducedStimuli(true);
    TestBed.flushEffects();
    expect(ambience.lastFade?.[2]).toBe(320);
    jest.advanceTimersByTime(320);
    expect(ambience.stopCount).toBe(1);
    expect(music.currentVolume).toBeCloseTo(.8 * .42 * .62, 5);

    mixer.dispatch({ type: 'ui', key: 'dialogue.blip' });
    mixer.dispatch({ type: 'ui', key: 'glass.open' });
    mixer.dispatch({ type: 'ui', key: 'glass.focus' });
    mixer.dispatch({ type: 'ui', key: 'ui.confirm' });
    expect(clips.get('dialogue.blip')?.playCount).toBe(0);
    expect(clips.get('glass.open')?.playCount).toBe(0);
    expect(clips.get('glass.focus')?.playCount).toBe(0);
    expect(clips.get('ui.confirm')?.playCount).toBe(1);

    settings.setReducedStimuli(false);
    TestBed.flushEffects();
    expect(ambience.playCount).toBe(2);
  } finally {
    jest.useRealTimers();
  }
});
```

- [ ] **Step 6: Run the adapter and mixer tests**

```powershell
cd frontend
npx jest howler-clip.factory.spec.ts audio-mixer.service.spec.ts audio-consequence-contract.spec.ts --runInBand
```

Expected: `PASS`, 16 tests (1 pure adapter + 11 mixer + 4 tone matrices); the pre-`Howl` gesture
creates/resumes the context, the 100-step audit has no adjacent duplicate,
scene identity resets contact deduplication, base/spatial loops are distinct,
reduced stimuli is reversible, and 4 tones × 21 render plans resolve the same
clinical/body/portrait/audio meaning.

- [ ] **Step 7: Commit the mixer**

```powershell
git add frontend/src/app/features/simulator/audio `
  frontend/src/app/features/simulator/simulation-play.component.ts
git commit -m "feat(audio): add single bus mixer authority"
```

---

### Task 4: Author room atmosphere and surface resolution

**Files:**
- Create: `frontend/src/app/features/simulator/audio/scene-audio-authoring.ts`
- Modify: `frontend/src/app/features/simulator/audio/room-audio-profile.ts`
- Test: `frontend/src/app/features/simulator/audio/room-audio-profile.spec.ts`
- Modify: `frontend/src/app/features/simulator/runtime/scene-package.model.ts`
- Modify: `frontend/src/app/features/simulator/runtime/scene-package.mapper.ts`
- Modify: `frontend/src/app/features/simulator/runtime/scene-package.mapper.spec.ts`

- [ ] **Step 1: Write failing room/surface tests**

Create `frontend/src/app/features/simulator/audio/room-audio-profile.spec.ts`:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  KNOWN_SIM_VBG_MAP_KEYS,
  resolveFootstepSurface,
  resolveRoomAudioProfile,
} from './room-audio-profile';

describe('room audio profiles', () => {
  it('gives hospital, waiting, and office spaces distinct ambience', () => {
    expect(resolveRoomAudioProfile('hospital-urgencias').ambienceKey).toBe('ambience.hospital');
    expect(resolveRoomAudioProfile('comisaria-recepcion').ambienceKey).toBe('ambience.waiting');
    expect(resolveRoomAudioProfile('comisaria-consultorio').ambienceKey).toBe('ambience.office');
    expect(resolveRoomAudioProfile('hospital-sala-escucha-accion').ambienceKey)
      .toBe('ambience.hospital');
  });

  it('authors an explicit profile for every shipped SIM-VBG-001 map key', () => {
    expect(KNOWN_SIM_VBG_MAP_KEYS).toEqual([
      'hospital-urgencias', 'hospital-sala-escucha',
      'hospital-sala-escucha-accion', 'hospital-sala-escucha-cierre',
      'comisaria-recepcion', 'comisaria-consultorio',
      'comisaria-consultorio-marco', 'comisaria-consultorio-cierre',
    ]);
    expect(KNOWN_SIM_VBG_MAP_KEYS.every(key => resolveRoomAudioProfile(key))).toBe(true);
  });

  it('matches the module-level MAPS authority in seed_caso_pdf exactly', () => {
    const seedPath = path.resolve(
      __dirname,
      '../../../../../../backend_django/apps/simulation/management/commands/seed_caso_pdf.py',
    );
    const source = fs.readFileSync(seedPath, 'utf8');
    // The tracked seed currently contains mixed LF/CRLF lines. Normalize only
    // the in-memory test input so the parser proves content, not checkout EOL.
    const normalizedSource = source.replace(/\r\n?/g, '\n');
    const start = normalizedSource.indexOf('MAPS = [');
    const end = normalizedSource.indexOf('\n]\n\n# ─── Objetos por mapa', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const keys = [...normalizedSource.slice(start, end).matchAll(/^ {8}"key": "([^"]+)",$/gm)]
      .map(match => match[1]);
    expect(keys).toEqual(KNOWN_SIM_VBG_MAP_KEYS);
  });

  it('resolves the package-owned surface zones before the room default', () => {
    const profile = resolveRoomAudioProfile('hospital-sala-escucha');
    expect(resolveFootstepSurface(profile, 480, 350)).toBe('carpet');
    expect(resolveFootstepSurface(profile, 100, 500)).toBe('tile');
  });

  it('authors at least one bounded localized source per shipped room profile', () => {
    for (const key of KNOWN_SIM_VBG_MAP_KEYS) {
      const sources = resolveRoomAudioProfile(key).localizedSources;
      expect(sources.length).toBeGreaterThan(0);
      expect(new Set(sources.map(source => source.sourceId)).size).toBe(sources.length);
      expect(sources.every(source => source.radius > 0 && source.baseGain > 0 && source.baseGain <= 1)).toBe(true);
    }
  });
});
```

Extend `scene-package.mapper.spec.ts` with a fixture that changes only one
audio surface rectangle and prove both `package.audio` and
`package.contentHash` change. Also prove the mapper rejects a zone outside map
bounds, zero/negative size, overlap with a different surface, an unknown
surface and a map without explicit audio authoring. Add the same red cases for
an empty `localizedSources`, duplicate `sourceId`/key, position outside bounds,
non-positive radius and `baseGain` outside `(0,1]`; each assertion matches the
specific error emitted by `validateSceneAudioProfile` below.

- [ ] **Step 2: Author every map once and make `ScenePackageV1` the only runtime authority**

Create `scene-audio-authoring.ts` with this shape and all eight exact map keys
from the `seed_caso_pdf.MAPS` authority:

```ts
import { SceneAudioProfileV1 } from './audio-cue.model';

const hospital: SceneAudioProfileV1 = {
  musicKey: 'music.main', ambienceKey: 'ambience.hospital', defaultSurface: 'tile', surfaceZones: [],
  localizedSources: [{ sourceId: 'hospital-monitor', key: 'source.hospital-monitor', x: 720, y: 278, radius: 360, baseGain: .5 }],
};
const listeningRoom: SceneAudioProfileV1 = {
  musicKey: 'music.main', ambienceKey: 'ambience.hospital', defaultSurface: 'tile',
  surfaceZones: [{ x: 250, y: 180, width: 460, height: 260, surface: 'carpet' }],
  localizedSources: [{ sourceId: 'listening-vent', key: 'source.office-vent', x: 640, y: 180, radius: 420, baseGain: .36 }],
};
const waiting: SceneAudioProfileV1 = {
  musicKey: 'music.main', ambienceKey: 'ambience.waiting', defaultSurface: 'wood',
  surfaceZones: [{ x: 80, y: 210, width: 350, height: 220, surface: 'carpet' }],
  localizedSources: [{ sourceId: 'waiting-clock', key: 'source.waiting-clock', x: 760, y: 176, radius: 460, baseGain: .42 }],
};
const office: SceneAudioProfileV1 = {
  musicKey: 'music.main', ambienceKey: 'ambience.office', defaultSurface: 'wood',
  surfaceZones: [{ x: 300, y: 160, width: 390, height: 260, surface: 'carpet' }],
  localizedSources: [{ sourceId: 'office-vent', key: 'source.office-vent', x: 690, y: 170, radius: 420, baseGain: .34 }],
};

export const KNOWN_SIM_VBG_MAP_KEYS = [
  'hospital-urgencias', 'hospital-sala-escucha',
  'hospital-sala-escucha-accion', 'hospital-sala-escucha-cierre',
  'comisaria-recepcion', 'comisaria-consultorio',
  'comisaria-consultorio-marco', 'comisaria-consultorio-cierre',
] as const;

export const SCENE_AUDIO_AUTHORING: Readonly<Record<
  (typeof KNOWN_SIM_VBG_MAP_KEYS)[number], SceneAudioProfileV1
>> = {
  'hospital-urgencias': hospital,
  'hospital-sala-escucha': listeningRoom,
  'hospital-sala-escucha-accion': listeningRoom,
  'hospital-sala-escucha-cierre': listeningRoom,
  'comisaria-recepcion': waiting,
  'comisaria-consultorio': office,
  'comisaria-consultorio-marco': office,
  'comisaria-consultorio-cierre': office,
};

const SOURCE_KEYS = new Set([
  'source.hospital-monitor', 'source.waiting-clock', 'source.office-vent',
]);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function validateSceneAudioProfile(
  profile: SceneAudioProfileV1,
  bounds: Readonly<{ width: number; height: number }>,
): SceneAudioProfileV1 {
  const surfaces = new Set(['tile', 'wood', 'carpet']);
  for (const zone of profile.surfaceZones) {
    if (!surfaces.has(zone.surface)) throw new Error(`unknown audio surface: ${zone.surface}`);
    if (zone.width <= 0 || zone.height <= 0) throw new Error('audio surface zone has non-positive size');
    if (zone.x < 0 || zone.y < 0 || zone.x + zone.width > bounds.width || zone.y + zone.height > bounds.height) {
      throw new Error('audio surface zone is outside map bounds');
    }
  }
  for (let left = 0; left < profile.surfaceZones.length; left += 1) {
    for (let right = left + 1; right < profile.surfaceZones.length; right += 1) {
      const a = profile.surfaceZones[left]; const b = profile.surfaceZones[right];
      const overlaps = a.x < b.x + b.width && a.x + a.width > b.x
        && a.y < b.y + b.height && a.y + a.height > b.y;
      if (overlaps && a.surface !== b.surface) throw new Error('audio surface zones conflict');
    }
  }
  if (profile.localizedSources.length === 0) throw new Error('room has no localized audio source');
  const ids = new Set<string>(); const keys = new Set<string>();
  for (const source of profile.localizedSources) {
    if (!source.sourceId.trim() || ids.has(source.sourceId)) throw new Error('localized sourceId missing or duplicated');
    if (!SOURCE_KEYS.has(source.key) || keys.has(source.key)) throw new Error('localized source key unknown or duplicated');
    if (source.x < 0 || source.y < 0 || source.x > bounds.width || source.y > bounds.height) {
      throw new Error('localized source is outside map bounds');
    }
    if (source.radius <= 0 || source.baseGain <= 0 || source.baseGain > 1) {
      throw new Error('localized source radius/baseGain invalid');
    }
    ids.add(source.sourceId); keys.add(source.key);
  }
  return deepFreeze(profile);
}
```

The shown rectangles are authored data, not a second live lookup. Validate and
deep-freeze them when `scene-package.mapper.ts` creates the package. Extend
`ScenePackageV1`:

```ts
import type { SceneAudioProfileV1 } from '../audio/audio-cue.model';

export interface ScenePackageV1 {
  readonly audio: SceneAudioProfileV1;
}
```

The block shows the exact additive member; retain every field already defined
by the runtime plan in the same interface.

`scene-package.mapper.ts` selects the exact map entry, validates it against
`package.map.bounds`, and includes `audio` before recomputing the canonical hash
of the complete *static* package: map renderer/Tiled path/camera, solids,
interactions, actors, exits and audio. Preserve the runtime plan's separate
`sceneInstanceKey = attemptId:mapKey:revision:contentHash`; attempt identity must
not enter `contentHash`. Do not copy the backend partial hash into
`ScenePackageV1.contentHash`; keep the runtime plan's lowercase 64-hex format.
Thus an audio/scenario change invalidates static content while a new
attempt with identical content still creates a new scene instance.

The mapper performs the insertion with these exact expressions before building
the canonical static payload:

```ts
const authoredAudio = SCENE_AUDIO_AUTHORING[world.map.key as keyof typeof SCENE_AUDIO_AUTHORING];
if (!authoredAudio) throw new Error(`Missing SceneAudioProfileV1 for ${world.map.key}`);
const audio = validateSceneAudioProfile(
  authoredAudio,
  staticPackageWithoutHash.map.bounds,
);
const staticPayload = { ...staticPackageWithoutHash, audio };
const contentHash = await canonicalSha256(staticPayload);
```

The runtime plan's final return must spread that augmented payload. Replace
`...staticPackageWithoutHash` in the `deepFreeze` return with
`...staticPayload`; otherwise audio would affect the hash but disappear from
the published package:

```ts
return deepFreeze({
  ...staticPayload,
  contentHash,
  sceneInstanceKey,
  attemptId: world.attemptId,
  player: { position: { ...world.player } },
});
```

Rewrite `room-audio-profile.ts` as the build-time adapter plus pure surface
resolver:

```ts
import { FootstepSurface, SceneAudioProfileV1 } from './audio-cue.model';
import { KNOWN_SIM_VBG_MAP_KEYS, SCENE_AUDIO_AUTHORING } from './scene-audio-authoring';

export { KNOWN_SIM_VBG_MAP_KEYS };

export function resolveRoomAudioProfile(mapKey: string): SceneAudioProfileV1 {
  const profile = SCENE_AUDIO_AUTHORING[
    mapKey as keyof typeof SCENE_AUDIO_AUTHORING
  ];
  if (!profile) throw new Error(`Missing SceneAudioProfileV1 for ${mapKey}`);
  return profile;
}

export function resolveFootstepSurface(
  profile: SceneAudioProfileV1,
  x: number,
  y: number,
): FootstepSurface {
  const zone = profile.surfaceZones.find(candidate =>
    x >= candidate.x && x <= candidate.x + candidate.width
      && y >= candidate.y && y <= candidate.y + candidate.height);
  return zone?.surface ?? profile.defaultSurface;
}
```

After Task 4, production code may call `resolveRoomAudioProfile` only inside the
scene-package mapper. `AudioMixerService` receives `cue.profile`, and the Phaser
footstep resolver reads `this.scenePackage.audio`; neither performs a second map-key
lookup. Task 3's isolated tests may call the Task 2 resolver to construct an
explicit profile, but `AudioCue.scene.enter.profile` is required at compile
time; production never falls back from a map key inside the mixer.

- [ ] **Step 3: Run the profile tests**

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/audio/room-audio-profile.spec.ts src/app/features/simulator/runtime/scene-package.mapper.spec.ts
```

Expected: `PASS`, 4 profile tests plus the scene-package mapper regressions.

- [ ] **Step 4: Commit authored room audio**

```powershell
git add frontend/src/app/features/simulator/audio/scene-audio-authoring.ts frontend/src/app/features/simulator/audio/room-audio-profile.ts frontend/src/app/features/simulator/audio/room-audio-profile.spec.ts frontend/src/app/features/simulator/runtime/scene-package.model.ts frontend/src/app/features/simulator/runtime/scene-package.mapper.ts frontend/src/app/features/simulator/runtime/scene-package.mapper.spec.ts
git commit -m "feat(audio): embed authored soundscape in scene package"
```

---

### Task 5: Replace Phaser playback/timers with contact-frame `AudioCue` emission

**Files:**
- Create: `frontend/src/app/features/simulator/audio/footstep-sequencer.util.ts`
- Test: `frontend/src/app/features/simulator/audio/footstep-sequencer.util.spec.ts`
- Create: `frontend/src/app/features/simulator/audio/spatial-source-emitter.util.ts`
- Test: `frontend/src/app/features/simulator/audio/spatial-source-emitter.util.spec.ts`
- Create: `frontend/src/app/features/simulator/audio/door-audio-sequencer.util.ts`
- Test: `frontend/src/app/features/simulator/audio/door-audio-sequencer.util.spec.ts`
- Modify: `frontend/src/app/features/simulator/runtime/game-world.port.ts`
- Modify: `frontend/src/app/features/simulator/runtime/game-world.port.spec.ts`
- Modify: `frontend/src/app/features/simulator/game-world.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`

- [ ] **Step 1: Write failing contact, spatial, and authorized-door tests**

Create `frontend/src/app/features/simulator/audio/footstep-sequencer.util.spec.ts`:

```ts
import { FootstepSequencer } from './footstep-sequencer.util';

describe('FootstepSequencer', () => {
  it('emits exactly once when entering each authored contact frame', () => {
    const sequencer = new FootstepSequencer();
    expect(sequencer.next(true, true, 'walk-down:1')).toBe('walk-down:1');
    expect(sequencer.next(true, true, 'walk-down:1')).toBeNull();
    expect(sequencer.next(true, false, 'walk-down:2')).toBeNull();
    expect(sequencer.next(true, true, 'walk-down:3')).toBe('walk-down:3');
  });

  it('never emits when collision prevents real movement', () => {
    const sequencer = new FootstepSequencer();
    expect(sequencer.next(false, true, 'walk-left:1')).toBeNull();
  });
});
```

Create `frontend/src/app/features/simulator/audio/spatial-source-emitter.util.spec.ts`:

```ts
import { SpatialSourceEmitter } from './spatial-source-emitter.util';

const source = {
  sourceId: 'monitor', key: 'source.hospital-monitor' as const,
  x: 100, y: 100, radius: 200, baseGain: .5,
};

describe('SpatialSourceEmitter', () => {
  it('emits entry, meaningful attenuation changes, and one exit', () => {
    const emitter = new SpatialSourceEmitter();
    expect(emitter.next([source], { x: 100, y: 100, cameraCenterX: 100, viewportWorldWidth: 960 }))
      .toEqual([{ type: 'spatial-source', sourceId: 'monitor', key: source.key, active: true, gain: .5, pan: 0 }]);
    expect(emitter.next([source], { x: 101, y: 100, cameraCenterX: 100, viewportWorldWidth: 960 })).toEqual([]);
    expect(emitter.next([source], { x: 180, y: 100, cameraCenterX: 100, viewportWorldWidth: 960 })[0])
      .toMatchObject({ active: true, gain: .18 });
    expect(emitter.next([source], { x: 299, y: 100, cameraCenterX: 100, viewportWorldWidth: 960 })[0])
      .toMatchObject({ active: false, gain: 0 });
    expect(emitter.next([source], { x: 300, y: 100, cameraCenterX: 100, viewportWorldWidth: 960 })).toEqual([]);
  });

  it('emits one inactive cue when a source disappears from the scene', () => {
    const emitter = new SpatialSourceEmitter();
    emitter.next([source], { x: 100, y: 100, cameraCenterX: 100, viewportWorldWidth: 960 });
    expect(emitter.next([], { x: 100, y: 100, cameraCenterX: 100, viewportWorldWidth: 960 }))
      .toEqual([{ type: 'spatial-source', sourceId: 'monitor', key: source.key, active: false, gain: 0, pan: 0 }]);
    expect(emitter.next([], { x: 100, y: 100, cameraCenterX: 100, viewportWorldWidth: 960 })).toEqual([]);
  });
});
```

Create `frontend/src/app/features/simulator/audio/door-audio-sequencer.util.spec.ts`:

```ts
import { DoorAudioSequencer } from './door-audio-sequencer.util';

describe('DoorAudioSequencer', () => {
  it('is silent before authorization and opens/closes an authorized success exactly once', () => {
    const sequencer = new DoorAudioSequencer();
    expect(sequencer.complete('transition-1', -.2)).toEqual([]);

    expect(sequencer.beginAuthorized('transition-1', .2)).toEqual([
      { type: 'ui', key: 'door.open', pan: .2 },
    ]);
    expect(sequencer.beginAuthorized('transition-1', .2)).toEqual([]);
    expect(sequencer.complete('transition-1', -.2)).toEqual([
      { type: 'ui', key: 'door.close', pan: -.2 },
    ]);
    expect(sequencer.complete('transition-1', -.2)).toEqual([]);
  });

  it('clears an authorized cancellation without manufacturing a close cue', () => {
    const sequencer = new DoorAudioSequencer();
    expect(sequencer.beginAuthorized('transition-2', 0)).toHaveLength(1);
    expect(sequencer.cancel('transition-2')).toEqual([]);
    expect(sequencer.complete('transition-2', 0)).toEqual([]);
  });
});
```

The first empty `complete` is the denied/pre-authorized boundary: merely
approaching or requesting a locked exit creates no audio state. Run the three
new utility specs. Expected: `FAIL` because the sequencer does not exist yet.

Extend the existing `GameWorldPort` spec with a red event-boundary test. The
scene emits facts through the port; it never calls an Angular mixer or a legacy
callback directly:

```ts
it('delivers one typed audio fact through the runtime port', () => {
  const port = new GameWorldPort();
  const events: GameWorldEvent[] = [];
  port.onEvent(event => events.push(event));
  port.emit({
    type: 'audio-cue',
    cue: { type: 'footstep', surface: 'tile', contactId: 'walk-down:0', pan: 0 },
  });
  expect(events).toEqual([{
    type: 'audio-cue',
    cue: { type: 'footstep', surface: 'tile', contactId: 'walk-down:0', pan: 0 },
  }]);
});
```

- [ ] **Step 2: Implement contact, spatial, and door-cue sequencing**

Create `frontend/src/app/features/simulator/audio/footstep-sequencer.util.ts`:

```ts
export class FootstepSequencer {
  private previousToken: string | null = null;

  next(moved: boolean, contactFrame: boolean, frameToken: string): string | null {
    if (!moved || !contactFrame) {
      if (!moved) this.previousToken = null;
      return null;
    }
    if (frameToken === this.previousToken) return null;
    this.previousToken = frameToken;
    return frameToken;
  }
}
```

Create `frontend/src/app/features/simulator/audio/spatial-source-emitter.util.ts`:

```ts
import type { AudioCue, SceneAudioProfileV1 } from './audio-cue.model';

type SpatialCue = Extract<AudioCue, { type: 'spatial-source' }>;
type ListenerFrame = Readonly<{
  x: number; y: number; cameraCenterX: number; viewportWorldWidth: number;
}>;

export class SpatialSourceEmitter {
  private readonly previous = new Map<string, SpatialCue>();

  next(
    sources: SceneAudioProfileV1['localizedSources'],
    listener: ListenerFrame,
  ): SpatialCue[] {
    const emitted: SpatialCue[] = [];
    const seen = new Set<string>();
    for (const source of sources) {
      seen.add(source.sourceId);
      const distance = Math.hypot(listener.x - source.x, listener.y - source.y);
      const normalized = Math.max(0, 1 - distance / source.radius);
      const gain = normalized <= .15 ? 0 : Number((normalized * normalized * source.baseGain).toFixed(3));
      const pan = Number(Math.max(-.6, Math.min(.6,
        (source.x - listener.cameraCenterX) / Math.max(1, listener.viewportWorldWidth / 2),
      )).toFixed(3));
      const cue: SpatialCue = {
        type: 'spatial-source', sourceId: source.sourceId, key: source.key,
        active: gain > 0, gain, pan,
      };
      const before = this.previous.get(source.sourceId);
      if (!before || before.active !== cue.active
        || Math.abs(before.gain - cue.gain) >= .04
        || Math.abs(before.pan - cue.pan) >= .04) emitted.push(cue);
      this.previous.set(source.sourceId, cue);
    }
    for (const [sourceId, before] of this.previous) {
      if (seen.has(sourceId)) continue;
      emitted.push({ ...before, active: false, gain: 0 });
      this.previous.delete(sourceId);
    }
    return emitted;
  }

  reset(): void { this.previous.clear(); }
}
```

Create `door-audio-sequencer.util.ts`. This helper owns only cue
deduplication; the runtime plan's `RoomTransitionState` remains the sole room
transaction authority:

```ts
import type { AudioCue } from './audio-cue.model';

type DoorCue = Extract<AudioCue, { type: 'ui' }>;

export class DoorAudioSequencer {
  private transitionId: string | null = null;

  beginAuthorized(transitionId: string, pan: number): readonly DoorCue[] {
    if (this.transitionId !== null) return [];
    this.transitionId = transitionId;
    return [{ type: 'ui', key: 'door.open', pan }];
  }

  cancel(transitionId: string): readonly DoorCue[] {
    if (this.transitionId === transitionId) this.transitionId = null;
    return [];
  }

  complete(transitionId: string, pan: number): readonly DoorCue[] {
    if (this.transitionId !== transitionId) return [];
    this.transitionId = null;
    return [{ type: 'ui', key: 'door.close', pan }];
  }

  reset(): void { this.transitionId = null; }
}
```

- [ ] **Step 3: Consume contact-frame metadata from `AvatarRenderPlan`**

Do not add a runtime constant. The character plan exports
`avatarPlan.animations.walk.contactSequenceIndices === [0, 3]`; assert that in
the scene integration test. Resolve Phaser's absolute atlas frame back to the
authored directional sequence, so no 0-based/1-based Phaser index assumption is
needed:

```ts
const walk = this.avatarPlan.animations.walk;
const sequence = walk.directions[step.direction];
const absoluteFrame = Number(this.playerSprite?.anims.currentFrame?.textureFrame);
const sequenceIndex = sequence.indexOf(absoluteFrame);
const contactFrame = (walk.contactSequenceIndices ?? []).includes(sequenceIndex);
```

Fail the manifest/build gate if walk has anything other than exactly two unique
contact indices within its six-frame sequence.

- [ ] **Step 4: Delete Phaser audio ownership and emit cues**

Extend the existing runtime boundary instead of recreating the deleted
`WorldCallbacks`. In `runtime/game-world.port.ts`, import `AudioCue` as a type,
remove obsolete `sfxMuted` from `set-preferences`, and add exactly one event:

```ts
import type { AudioCue } from '../audio/audio-cue.model';

// Replace the existing command member; every other member stays unchanged.
| { type: 'set-preferences'; reduceMotion: boolean }

// Append to GameWorldEvent.
| { type: 'audio-cue'; cue: AudioCue };
```

Update the port spec and every `set-preferences` fixture. In
`GameWorldComponent`, remove the `sfxMuted` input and send only
`{ type: 'set-preferences', reduceMotion }`; remove the corresponding binding
from `SimulationPlayComponent`. In the Phaser scene remove all
`this.load.audio(...)`, `this.sound.play(...)`, `setSfxMuted`, `stepTimer`, and
`STEP_INTERVAL` code. No callback or second event channel may bypass
`GameWorldPort`.

Apply these exact replacements left by Runtime Task 9:

```ts
private preferences = { reduceMotion: false };

// DataDrivenWorldScene.handleCommand
case 'set-preferences':
  this.preferences = { reduceMotion: command.reduceMotion };
  return;

// GameWorldComponent.ngOnChanges
if (changes['reduceMotion']) {
  this.port.send({
    type: 'set-preferences',
    reduceMotion: this.reduceMotion(),
  });
}
```

Delete the old `setSfxMuted(command.sfxMuted)` call, every
`preferences.sfxMuted` read and the `[sfxMuted]` template binding. Add a static
scan to the focused gate; `sfxMuted|setSfxMuted` must have zero matches in
`game-world.component.ts` and `runtime/game-world.port.ts`.

Add imports for `AudioCue`, `DoorAudioSequencer`, `FootstepSequencer`,
`SpatialSourceEmitter` and `resolveFootstepSurface`; `AvatarRenderPlan` and
`ScenePackageV1.audio` are already the immutable render/soundscape authorities.
Add these scene fields:

```ts
import type { AudioCue } from './audio/audio-cue.model';
import { DoorAudioSequencer } from './audio/door-audio-sequencer.util';
import { FootstepSequencer } from './audio/footstep-sequencer.util';
import { resolveFootstepSurface } from './audio/room-audio-profile';
import { SpatialSourceEmitter } from './audio/spatial-source-emitter.util';

private readonly footstepSequencer = new FootstepSequencer();
private readonly spatialSourceEmitter = new SpatialSourceEmitter();
private readonly doorAudioSequencer = new DoorAudioSequencer();
private activeAudioSceneInstanceKey = '';
```

Add the only scene-side adapter, then emit facts exclusively through the port:

```ts
private emitAudio(cue: AudioCue): void {
  this.port.emit({ type: 'audio-cue', cue });
}
```

After successful real movement and `applyPlayerPose`, add:

```ts
const animation = this.playerSprite?.anims.currentAnim?.key ?? `walk-${step.direction}`;
const walk = this.avatarPlan.animations.walk;
const absoluteFrame = Number(this.playerSprite?.anims.currentFrame?.textureFrame);
const sequenceIndex = walk.directions[step.direction].indexOf(absoluteFrame);
const contactFrame = (walk.contactSequenceIndices ?? []).includes(sequenceIndex);
const contactId = this.footstepSequencer.next(true, contactFrame, `${animation}:${sequenceIndex}`);
if (contactId && this.scenePackage) {
  const surface = resolveFootstepSurface(
    this.scenePackage.audio,
    this.player.x,
    this.player.y,
  );
  const cameraCenterX = this.cameras.main.worldView.centerX;
  const pan = Phaser.Math.Clamp((this.player.x - cameraCenterX) / 480, -.35, .35);
  this.emitAudio({ type: 'footstep', surface, contactId, pan });
}
```

In the non-moving and collision-blocked branches call
`this.footstepSequencer.next(false, false, 'idle')`.

At the successful end of `renderWorld`, after player, actors, camera and the
runtime `ready` event are stable, call this method. It deduplicates by
per-attempt `sceneInstanceKey`, not map/content hash:

```ts
this.publishStableSceneAudio();
```

```ts
private publishStableSceneAudio(): void {
  const scene = this.scenePackage;
  if (!scene) return;
  if (this.activeAudioSceneInstanceKey !== scene.sceneInstanceKey) {
    this.activeAudioSceneInstanceKey = scene.sceneInstanceKey;
    this.footstepSequencer.next(false, false, 'scene-change');
    this.spatialSourceEmitter.reset();
    this.emitAudio({
      type: 'scene.enter',
      mapKey: scene.map.key,
      sceneInstanceKey: scene.sceneInstanceKey,
      profile: scene.audio,
    });
  }
}
```

After camera/player positions are stable in each scene update, emit only
thresholded spatial changes:

```ts
if (this.scenePackage) {
  const view = this.cameras.main.worldView;
  const cues = this.spatialSourceEmitter.next(
    this.scenePackage.audio.localizedSources,
    {
      x: this.player.x,
      y: this.player.y,
      cameraCenterX: view.centerX,
      viewportWorldWidth: view.width,
    },
  );
  for (const cue of cues) this.emitAudio(cue);
}
```

Emit `{ type: 'ui', key: 'ui.select' }` only when proximity changes from a
different key to a new key. The authoritative-exit branch emits only the
existing `room-exit-requested` fact. It must not call `beginAuthorized`, emit
`door.open`, or create any pending audio state: Angular has not validated the
door yet.

The audio plan runs after Runtime Task 9. Amend its exact transition methods,
not the exit-request branch. In `beginRoomTransition`, insert this block only
after origin identity has passed and `this.activeRoomTransition = request` has
recorded the already-authorized `begin-room-transition` command:

```ts
const doorPan = Phaser.Math.Clamp((this.player.x - this.cameras.main.worldView.centerX) / 480, -.35, .35);
for (const cue of this.doorAudioSequencer.beginAuthorized(request.transitionId, doorPan)) {
  this.emitAudio(cue);
}
```

At the beginning of `cancelRoomTransition`, after the matching active request
guard, clear the audio sequence. It deliberately returns no cue:

```ts
this.doorAudioSequencer.cancel(transitionId);
```

In the successful `FADE_IN_COMPLETE` callback of `revealRoomTransition`, after
the matching transition-id guard and before emitting `room-transition-complete`,
close exactly once:

```ts
const doorPan = Phaser.Math.Clamp((this.player.x - this.cameras.main.worldView.centerX) / 480, -.35, .35);
for (const cue of this.doorAudioSequencer.complete(request.transitionId, doorPan)) {
  this.emitAudio(cue);
}
```

Replace the runtime plan's one-line shutdown callback with the exact combined
cleanup (do not register a second listener):

```ts
this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
  this.detachPort?.();
  this.doorAudioSequencer.reset();
});
```

Do not reintroduce local `transitionToRoom`: Angular still obtains and validates
the next authoritative package. An authorized transition that later fails may
have one `door.open`, but cancellation never manufactures `door.close`; a denied
door has neither cue because no `begin-room-transition` command exists.

Finally, expose the typed fact from the existing Angular wrapper without
bypassing the port. Add `readonly audioCue = output<AudioCue>();` to
`GameWorldComponent` and extend its exhaustive `handlePortEvent` switch:

```ts
function assertNeverWorldEvent(event: never): never {
  throw new Error(`Unhandled GameWorldEvent: ${JSON.stringify(event)}`);
}

// Inside handlePortEvent:
case 'audio-cue':
  this.audioCue.emit(event.cue);
  return;
default:
  return assertNeverWorldEvent(event);
```

No `WorldCallbacks`, `onAudioCue`, direct mixer injection, or second Phaser
event channel remains.

Extend `simulation-play.consent-gate.spec.ts` to prove the Angular wrapper does
not swallow or duplicate the port fact. Use the already rendered child after
the consent flow:

```ts
it('forwards one port audio fact through the GameWorldComponent output', () => {
  const world = fixture.debugElement.query(By.directive(GameWorldComponent))
    .componentInstance as GameWorldComponent;
  const observed = jest.fn();
  world.audioCue.subscribe(observed);
  const internal = world as unknown as { port: GameWorldPort };
  internal.port.emit({
    type: 'audio-cue',
    cue: { type: 'ui', key: 'ui.confirm', pan: 0 },
  });
  expect(observed).toHaveBeenCalledTimes(1);
  expect(observed).toHaveBeenCalledWith({ type: 'ui', key: 'ui.confirm', pan: 0 });
});
```

Import `By`, `GameWorldComponent` and `GameWorldPort` in that spec. This
test-only cast reaches the private port solely to exercise the wrapper adapter;
production code never exposes it.

Extend the runtime plan's denied-door component case in the same spec. Clear the
mixer mock, emit the existing locked `RoomExitRequested` fixture, and assert the
visible/ARIA locked notice remains while no transaction or sound begins:

```ts
audio.dispatch.mockClear();
const scene = component.scenePackage()!;
const lockedExit = scene.exits.find(exit => exit.interactionKey === 'puerta-sala-escucha');
expect(lockedExit).toBeDefined();
component.requestRoomTransition({
  type: 'room-exit-requested',
  originSceneInstanceKey: scene.sceneInstanceKey,
  targetRoomKey: lockedExit!.targetRoomKey,
  interactionKey: lockedExit!.interactionKey,
  expectedEntry: lockedExit!.entry,
});
fixture.detectChanges();
expect(component.roomTransitionState()).toEqual({ phase: 'idle' });
expect(component.activeRoomTransitionRequest()).toBeNull();
expect(fixture.nativeElement.querySelector('.door-notice[role="alert"]')?.textContent?.trim())
  .toBe(component.doorNotice());
expect(audio.dispatch).not.toHaveBeenCalled();
```

Keep the fixture's `familia-crisis` evidence absent so this exact authored exit
is locked. Remove every former legacy rejection SFX from both denied branches
of `validateDoorAccess` (missing evidence/stage and unarmed return); denial is a
quiet clinical boundary communicated by the existing localized notice and live
region. The assertion is total silence, not merely “no `door.open`”. The two
`DoorAudioSequencer` tests then prove authorized cancellation is open-only and
authorized success is exactly one open plus one close.

- [ ] **Step 5: Route cues to Angular's mixer**

In `simulation-play.component.ts`, use the mixer provided in Task 3 and bind the
Angular output that `GameWorldComponent` derives from `GameWorldPort`:

```ts
private readonly audioMixer = inject(AudioMixerService);

handleAudioCue(cue: AudioCue): void {
  this.audioMixer.dispatch(cue);
}
```

```html
(audioCue)="handleAudioCue($event)"
```

Replace direct `AudioDirectorService.playSfx` calls with `audioMixer.dispatch({ type: 'ui', key: ... })`. Replace initialization/disposal with `audioMixer.init()` and `audioMixer.dispose()`.

- [ ] **Step 6: Run contact/mixer tests and build**

```powershell
cd frontend
npx jest door-audio-sequencer.util.spec.ts footstep-sequencer.util.spec.ts spatial-source-emitter.util.spec.ts game-world.port.spec.ts audio-mixer.service.spec.ts simulation-play.consent-gate.spec.ts --runInBand
npm run build
cd ..
$legacySfx = Select-String -Path @(
  'frontend/src/app/features/simulator/game-world.component.ts',
  'frontend/src/app/features/simulator/runtime/game-world.port.ts'
) -Pattern 'sfxMuted|setSfxMuted|WorldCallbacks|onAudioCue'
if ($legacySfx) { $legacySfx | Format-Table Path,LineNumber,Line; exit 1 }
```

Expected: all six suites `PASS`; denied doors are silent, cancellation emits no
close, successful doors emit one open/one close, spatial sources emit only at
meaningful gain/pan transitions, and the build contains no `this.sound.play` or
Phaser `load.audio` in `game-world.component.ts`.

- [ ] **Step 7: Commit cue-only Phaser integration**

```powershell
git add frontend/src/app/features/simulator/audio `
  frontend/src/app/features/simulator/runtime/game-world.port.ts `
  frontend/src/app/features/simulator/runtime/game-world.port.spec.ts `
  frontend/src/app/features/simulator/game-world.component.ts `
  frontend/src/app/features/simulator/simulation-play.component.ts `
  frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts
git commit -m "feat(audio): emit contact spatial and authorized door cues"
```

---

### Task 6: Migrate dialogue/UI calls and add independent HUD controls

**Files:**
- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.ts`
- Test: `frontend/src/app/features/simulator/dialogue-panel.component.spec.ts`
- Modify: `frontend/src/app/features/simulator/world-preview.component.ts`
- Create: `frontend/src/app/features/simulator/world-preview.component.spec.ts`
- Modify: `frontend/src/app/features/simulator/simulation-hud.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Test: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`

- [ ] **Step 1: Update dialogue tests to assert typed cues**

In `dialogue-panel.component.spec.ts`, replace the audio provider with:

```ts
import { AUDIO_CUE_PORT } from './audio/audio-cue.port';

const cuePort = { dispatch: jest.fn() };
providers: [{ provide: AUDIO_CUE_PORT, useValue: cuePort }],
```

Add:

```ts
it('emits sober glass/text cues without owning a second audio engine', () => {
  render({
    ...MULTI_LINE_DIALOGUE,
    key: 'escucha-segura',
    presentation: { speakerId: 'sobreviviente-consulta', role: 'Consultante' },
    lines: [{
      ...MULTI_LINE_DIALOGUE.lines[0],
      speakerName: 'Sobreviviente (22 años)',
      presentation: { speakerId: 'sobreviviente-consulta', role: 'Consultante' },
    }, ...MULTI_LINE_DIALOGUE.lines.slice(1)],
  });
  expect(cuePort.dispatch).toHaveBeenCalledWith({ type: 'ui', key: 'glass.open' });
  acknowledgePreparedActor('escucha-segura', 'sobreviviente-consulta', 330);
  expect(component.textGateOpen()).toBe(true);
  component.skipTypewriter();
  component.advanceLine();
  expect(cuePort.dispatch).toHaveBeenCalledWith({ type: 'ui', key: 'dialogue.advance' });
});
```

Use the `acknowledgePreparedActor` helper created by the completed dialogue/HUD
plan; do not call `skipTypewriter` or `advanceLine` while the cinematic gate is
closed. The helper writes the real typed `actor-presentation-ready` input, so
this audio regression cannot bypass the runtime handshake with a mock-only flag.

- [ ] **Step 2: Migrate `DialoguePanelComponent` to the narrow cue port**

Replace `AudioDirectorService` with `AUDIO_CUE_PORT`; the shared component may
dispatch semantic cues but cannot initialize or inspect a mixer:

```ts
import { AUDIO_CUE_PORT } from './audio/audio-cue.port';

private readonly audioCues = inject(AUDIO_CUE_PORT);
```

Dispatch:

- `glass.open` once when a dialogue key opens;
- `ui.select` on choice hover;
- `glass.focus` on a real keyboard/gamepad focus transition (not every render);
- `glass.confirm` when a choice locks;
- `dialogue.advance` when advancing a line.

The concrete calls are:

```ts
this.audioCues.dispatch({ type: 'ui', key: 'glass.open' });
this.audioCues.dispatch({ type: 'ui', key: 'ui.select' });
this.audioCues.dispatch({ type: 'ui', key: 'glass.focus' });
this.audioCues.dispatch({ type: 'ui', key: 'glass.confirm' });
this.audioCues.dispatch({ type: 'ui', key: 'dialogue.advance' });
```

Inside the punctuation-aware `reveal` callback from the dialogue plan, emit a restrained text blip every third visible non-whitespace character:

```ts
const revealedCharacter = text[step.visibleCharacters - 1] ?? '';
if (step.visibleCharacters % 3 === 0 && revealedCharacter.trim()) {
  this.audioCues.dispatch({ type: 'ui', key: 'dialogue.blip' });
}
```

The `voice` slider controls this cue. Reduced-stimuli mode suppresses it centrally in `AudioMixerService`; the component does not branch on settings.

Route choice `focusin` and the semantic router's `focusChoice` result through one
de-duplicated `onChoiceFocus(choice.key)` method. Add a test that moving down
through three options emits exactly three `glass.focus` cues, while rerendering
or refocusing the same key emits none.

- [ ] **Step 3: Prove and provide a deliberate silent cue port in world preview**

Create `frontend/src/app/features/simulator/world-preview.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { SimulationService } from '../../core/api/simulation.service';
import {
  AUDIO_CUE_PORT,
  NOOP_AUDIO_CUE_PORT,
} from './audio/audio-cue.port';
import { WorldPreviewComponent } from './world-preview.component';

describe('WorldPreviewComponent audio boundary', () => {
  it('provides the deliberate no-op cue port without constructing a mixer', () => {
    TestBed.configureTestingModule({
      imports: [WorldPreviewComponent],
      providers: [{ provide: SimulationService, useValue: {} }],
    });
    const fixture = TestBed.createComponent(WorldPreviewComponent);
    fixture.componentRef.setInput('caseVersionId', 1);
    fixture.detectChanges();

    const cues = fixture.debugElement.injector.get(AUDIO_CUE_PORT);
    expect(cues).toBe(NOOP_AUDIO_CUE_PORT);
    expect(() => cues.dispatch({ type: 'ui', key: 'ui.confirm' })).not.toThrow();
  });
});
```

Run:

```powershell
npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/world-preview.component.spec.ts
```

Expected: `FAIL` with `NullInjectorError` for `AUDIO_CUE_PORT`.

In `world-preview.component.ts`, import the token/value and add the one explicit
component provider. Do not import `AudioMixerService`, the Howler factory or the
context gate:

```ts
import {
  AUDIO_CUE_PORT,
  NOOP_AUDIO_CUE_PORT,
} from './audio/audio-cue.port';

// Add this member to the existing @Component metadata object.
providers: [{ provide: AUDIO_CUE_PORT, useValue: NOOP_AUDIO_CUE_PORT }],
```

Run the same spec again, then enforce the preview boundary:

```powershell
$unexpectedPreviewAudio = Select-String `
  -Path 'frontend/src/app/features/simulator/world-preview.component.ts' `
  -Pattern 'AudioMixerService|AUDIO_CLIP_FACTORY|AUDIO_CONTEXT_GATE|new Howl\('
if ($unexpectedPreviewAudio) {
  $unexpectedPreviewAudio | Format-Table Path,LineNumber,Line
  exit 1
}
```

Expected: the spec passes and the scan exits `0`. `DialoguePanelComponent`
resolves the no-op cue port in preview, while playable simulation descendants
resolve the `useExisting: AudioMixerService` alias from Task 3. This is silence
by product policy, not an accidental optional injection or a second mixer.

- [ ] **Step 4: Add four sliders and reduced stimuli to the HUD settings dialog**

Add inputs/outputs to `SimulationHudComponent`:

```ts
import {
  AUDIO_BUS_LABELS,
  AdjustableAudioBus,
  AudioBus,
  AudioSettingsV1,
} from './audio/audio-cue.model';

readonly audioBuses: readonly AudioBus[] = ['music', 'ambience', 'voice', 'sfx'];
readonly audioBusLabels = AUDIO_BUS_LABELS;
readonly audioSettings = input.required<AudioSettingsV1>();
readonly audioVolumeChange = output<{ bus: AdjustableAudioBus; value: number }>();
readonly reducedStimuliChange = output<boolean>();

setAudioVolume(bus: AdjustableAudioBus, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  this.audioVolumeChange.emit({ bus, value });
}
```

Add inside `.settings-menu`, before motion settings:

```html
@for (bus of audioBuses; track bus) {
  <label class="audio-slider">
    <span>{{ audioBusLabels[bus] }}</span>
    <input type="range" min="0" max="1" step="0.05"
      [value]="audioSettings().volumes[bus]"
      [attr.aria-label]="'Volumen de ' + audioBusLabels[bus]"
      (input)="setAudioVolume(bus, $event)" />
    <strong>{{ (audioSettings().volumes[bus] * 100) | number:'1.0-0' }}%</strong>
  </label>
}
<button type="button" [attr.aria-pressed]="audioSettings().reducedStimuli"
  (click)="reducedStimuliChange.emit(!audioSettings().reducedStimuli)">
  <span class="pixel-hearing-icon" aria-hidden="true"></span>
  <span>Estímulos reducidos</span>
  <strong>{{ audioSettings().reducedStimuli ? 'On' : 'Off' }}</strong>
</button>
```

Add styles:

```css
.audio-slider { display: grid; grid-template-columns: 96px minmax(90px, 1fr) 42px; align-items: center; gap: 8px; min-height: 38px; padding: 7px 8px; }
.audio-slider span { color: rgba(232,240,244,.84); font-size: .74rem; font-weight: 800; }
.audio-slider input { width: 100%; accent-color: #b69cff; }
.audio-slider strong { color: rgba(232,240,244,.58); font-family: 'JetBrains Mono', monospace; font-size: .66rem; text-align: right; }
.pixel-hearing-icon { width: 16px; height: 16px; background: currentColor; clip-path: polygon(25% 0,75% 0,75% 12%,88% 12%,88% 50%,75% 50%,75% 75%,62% 75%,62% 100%,38% 100%,38% 62%,50% 62%,50% 38%,62% 38%,62% 12%,38% 12%,38% 38%,25% 38%); image-rendering: pixelated; }
```

Remove the old binary music/SFX mute buttons and inputs; a zero slider value is the single mute representation. Do not import `MatIcon` for this control: its icon is the authored CSS pixel glyph above.

- [ ] **Step 5: Bind the settings store in `SimulationPlayComponent`**

Import `AUDIO_BUS_LABELS`, `AdjustableAudioBus` and `AudioSettingsStore`, then add:

```ts
private readonly audioSettingsStore = inject(AudioSettingsStore);
readonly audioSettings = this.audioSettingsStore.settings;

setAudioVolume(change: { bus: AdjustableAudioBus; value: number }): void {
  this.audioSettingsStore.setVolume(change.bus, change.value);
  this.announce(
    `Volumen de ${AUDIO_BUS_LABELS[change.bus]}: ${Math.round(change.value * 100)}%.`,
  );
}

setReducedStimuli(enabled: boolean): void {
  this.audioSettingsStore.setReducedStimuli(enabled);
}
```

Bind:

```html
[audioSettings]="audioSettings()"
(audioVolumeChange)="setAudioVolume($event)"
(reducedStimuliChange)="setReducedStimuli($event)"
```

- [ ] **Step 6: Unlock from the real consent/resume gestures and update mocks**

Call `void this.audioMixer.unlockFromGesture()` synchronously at the beginning
of `acceptContentWarning()`, `resumeAttempt()` and `resumeCurrentAttempt()`.
Keep `audioMixer.init()` inside `startWorld()` so no clips are constructed
before consent. Do not unlock from a timer, lifecycle hook or automatic HTTP
completion: those no longer carry browser user activation.

Replace `AudioDirectorService` in `simulation-play.consent-gate.spec.ts` with an
`AudioMixerService` mock exposing `unlockFromGesture`, `contextState`, `init`,
`dispatch`, and `dispose`. Apply the exact `TestBed.overrideComponent` block from
Task 3 so `AUDIO_CUE_PORT` remains a `useExisting` alias to that same fake; do
not provide a second object for the port. Preserve the pre-consent assertions:

```ts
expect(audio.init).not.toHaveBeenCalled();
expect(audio.dispatch).not.toHaveBeenCalled();
expect(audio.unlockFromGesture).not.toHaveBeenCalled();
```

After pressing the real consent button, add these exact ordering assertions:

```ts
expect(audio.unlockFromGesture).toHaveBeenCalledTimes(1);
expect(audio.init).toHaveBeenCalledTimes(1);
expect(audio.unlockFromGesture.mock.invocationCallOrder[0])
  .toBeLessThan(audio.init.mock.invocationCallOrder[0]);
```

In the existing resume test, clear both mocks, click the actual resume control,
and assert:

```ts
expect(audio.unlockFromGesture).toHaveBeenCalledTimes(1);
expect(audio.init).not.toHaveBeenCalled();
```

Task 8 owns the E2E-only environment replacement, DOM attribute and
`window.__SIEP_AUDIO_DEBUG__` hook. Do not add a production debug label or an
unconditional window property in this task; expose only the public
`audioContextState(): AudioContextState | 'unavailable'` method that Task 8 will
bind behind the diagnostics flag.

```ts
audioContextState(): AudioContextState | 'unavailable' {
  return this.audioMixer.contextState();
}
```

- [ ] **Step 7: Run focused tests and build**

```powershell
cd frontend
npx jest dialogue-panel.component.spec.ts world-preview.component.spec.ts simulation-play.consent-gate.spec.ts audio-settings.store.spec.ts --runInBand
npm run build
```

Expected: all four suites `PASS`; four sliders render; dialogue resolves a real
cue-port alias in simulation and the deliberate no-op in preview; no direct
`AudioDirectorService` import remains in these files.

- [ ] **Step 8: Commit controls, dialogue cues, and the silent preview port**

```powershell
git add frontend/src/app/features/simulator/dialogue-panel.component.ts `
  frontend/src/app/features/simulator/dialogue-panel.component.spec.ts `
  frontend/src/app/features/simulator/world-preview.component.ts `
  frontend/src/app/features/simulator/world-preview.component.spec.ts `
  frontend/src/app/features/simulator/simulation-hud.component.ts `
  frontend/src/app/features/simulator/simulation-play.component.ts `
  frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts
git commit -m "feat(audio): expose independent accessible mixer controls"
```

---

### Task 7: Wire scene transitions, dialogue ducking, pause/resume, and remove legacy services

**Files:**
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Test: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`
- Modify: `frontend/src/app/features/simulator/journal-panel.component.ts`
- Create: `frontend/src/app/features/simulator/journal-panel.component.spec.ts`
- Delete: `frontend/src/app/features/simulator/audio-director.service.ts`
- Delete: `frontend/src/app/features/simulator/audio.service.ts`

- [ ] **Step 1: Dispatch lifecycle cues from one effect and existing transitions**

Add `effect` to Angular imports and add this constructor effect:

```ts
constructor() {
  effect(() => {
    const dialogue = this.dialogue();
    const sensitive = Boolean(
      dialogue && (dialogue.emotion === 'danger' || dialogue.emotion === 'vulnerable'
        || this.attempt()?.currentNode.sensitiveContent),
    );
    this.audioMixer.dispatch({ type: 'dialogue', active: dialogue !== null, sensitive });
  });
}
```

The mixer is not initialized until `startWorld` after consent; calls before initialization are prohibited by keeping the effect gated:

```ts
if (!this.worldStarted()) return;
```

Use these lifecycle calls:

```ts
this.audioMixer.dispatch({ type: 'pause' });   // browser pause/safe pause
this.audioMixer.dispatch({ type: 'resume' });  // successful resume
this.audioMixer.dispatch({ type: 'stop' });    // route teardown before dispose
```

`scene.enter` may arrive while the intro is active: it updates `currentMapKey`
but must not replace the intro loops. Dispatch the domain cue from the existing
intro open/close transitions:

```ts
this.audioMixer.dispatch({ type: 'intro', active: true });
this.audioMixer.dispatch({ type: 'intro', active: false });
```

Task 3's `introActive` priority switches to `music.intro` while active and, on
`intro: false`, crossfades once to the latest stored `currentMapKey`. Add a test
where two `scene.enter` cues arrive during intro and prove only the latest map
starts, with one music loop and one ambience loop.

- [ ] **Step 2: Dispatch one semantic cue only for a live consequence beat**

Plan 1 owns `ConsequenceTone`; living-case owns `ClinicalConsequence` and imports
that shared tone. Do not copy either type into the audio folder. In
`applyDecisionResult`, immediately
after the existing live-only `this.consequenceBeat.set(beat)`, add:

```ts
this.audioMixer.dispatch({ type: 'consequence', tone: beat.tone });
```

Do not add this call to `hydrateWorldConsequences`: hydration restores the body
and pending repair silently, without replaying sound or ARIA. Extend
`simulation-play.consent-gate.spec.ts` with the same mixer mock established in
Task 6:

```ts
it('emits one consequence cue live and none for hydration or duplicate receipt', () => {
  component.applyDecisionResult(ATTEMPT_WITH_RUPTURE);
  component.completeConsequenceBeat();
  component.applyDecisionResult(ATTEMPT_WITH_RUPTURE);
  component.hydrateWorldConsequences(WORLD_WITH_PERSISTED_RUPTURE);

  const consequenceCues = audio.dispatch.mock.calls
    .map(([cue]) => cue)
    .filter(cue => cue.type === 'consequence');
  expect(consequenceCues).toEqual([{ type: 'consequence', tone: 'rupture' }]);
});
```

Run:

```powershell
npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/simulation-play.consent-gate.spec.ts
```

Expected: PASS; a live receipt sounds once and reload/replay remain silent.

- [ ] **Step 3: Write the red journal cue regression**

Create `frontend/src/app/features/simulator/journal-panel.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { AudioMixerService } from './audio/audio-mixer.service';
import { JournalPanelComponent } from './journal-panel.component';

describe('JournalPanelComponent audio cues', () => {
  it('dispatches semantic open and close cues through the existing mixer', () => {
    const audio = { dispatch: jest.fn() };
    TestBed.configureTestingModule({
      imports: [JournalPanelComponent],
      providers: [{ provide: AudioMixerService, useValue: audio }],
    });
    const fixture = TestBed.createComponent(JournalPanelComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    TestBed.flushEffects();

    expect(audio.dispatch).toHaveBeenCalledWith({ type: 'ui', key: 'ui.select' });
    audio.dispatch.mockClear();

    fixture.componentInstance.onCloseClick();
    expect(audio.dispatch).toHaveBeenCalledTimes(1);
    expect(audio.dispatch).toHaveBeenCalledWith({ type: 'ui', key: 'ui.cancel' });
  });
});
```

Run:

```powershell
npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/journal-panel.component.spec.ts
```

Expected: `FAIL`; the journal still calls legacy `playSfx`, so the fake mixer's
`dispatch` has no matching calls.

- [ ] **Step 4: Migrate the journal to `AudioMixerService.dispatch`**

In `journal-panel.component.ts`, replace the legacy import/injection and both
calls exactly:

```ts
import { AudioMixerService } from './audio/audio-mixer.service';

private readonly audio = inject(AudioMixerService);

constructor() {
  effect(() => {
    if (this.open()) this.audio.dispatch({ type: 'ui', key: 'ui.select' });
  });
}

onCloseClick(): void {
  this.audio.dispatch({ type: 'ui', key: 'ui.cancel' });
  this.closeSheet.emit();
}
```

Remove the `AudioDirectorService` import. Do not provide or construct a mixer in
`JournalPanelComponent`; it inherits the one component-scoped instance owned by
`SimulationPlayComponent`. Run the journal spec again. Expected: `PASS`, with
one open cue and one close cue.

- [ ] **Step 5: Remove all legacy services only after a zero-reference scan**

Run:

```powershell
$legacy = @(
  (Resolve-Path 'frontend/src/app/features/simulator/audio-director.service.ts').Path,
  (Resolve-Path 'frontend/src/app/features/simulator/audio.service.ts').Path
)
$hits = Get-ChildItem 'frontend/src/app' -Recurse -File -Include *.ts |
  Where-Object { $_.FullName -notin $legacy } |
  Select-String -Pattern 'AudioDirectorService|AudioService|audio-director.service|audio.service'
$hits | Format-Table Path,LineNumber,Line
if ($hits) { exit 1 }
```

Migrate every listed consumer to `AudioMixerService`/`AudioCue`. The command
must exit `0` with no rows outside the two files being retired; then delete both
legacy service files with `apply_patch`.

- [ ] **Step 6: Prove Phaser and Angular have one audio constructor**

Run:

```powershell
$factoryPath = (Resolve-Path 'frontend/src/app/features/simulator/audio/howler-clip.factory.ts').Path
$typescript = Get-ChildItem 'frontend/src/app' -Recurse -File -Include *.ts
$howlConstructors = @($typescript | Select-String -Pattern 'new Howl\(')
$unexpectedHowl = @($howlConstructors | Where-Object { $_.Path -ne $factoryPath })
$forbiddenConstructors = @(
  $typescript | Select-String -Pattern 'new Audio\(|load\.audio\(|sound\.play\('
)
@($howlConstructors + $forbiddenConstructors) |
  Format-Table Path,LineNumber,Line
if ($howlConstructors.Count -ne 1 -or $unexpectedHowl.Count -ne 0 -or $forbiddenConstructors.Count -ne 0) {
  Write-Error "Audio ownership boundary failed: Howl=$($howlConstructors.Count), unexpectedHowl=$($unexpectedHowl.Count), forbidden=$($forbiddenConstructors.Count)"
  exit 1
}
```

Expected: exit `0`; the only `new Howl(` match is
`audio/howler-clip.factory.ts`. A missing constructor, any additional `Howl`
constructor, any `new Audio`, Phaser `load.audio`, or Phaser `sound.play` exits
`1` and blocks the commit.

- [ ] **Step 7: Run the full frontend suite**

```powershell
cd frontend
npm test -- --runInBand
npm run audio:validate
npm run build
```

Expected: all Jest suites `PASS`; 26 audio files validate; production build succeeds.

- [ ] **Step 8: Commit lifecycle integration, journal migration, and legacy deletion**

```powershell
git add frontend/src/app/features/simulator/simulation-play.component.ts `
  frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts `
  frontend/src/app/features/simulator/journal-panel.component.ts `
  frontend/src/app/features/simulator/journal-panel.component.spec.ts `
  frontend/src/app/features/simulator/audio
git rm frontend/src/app/features/simulator/audio-director.service.ts `
  frontend/src/app/features/simulator/audio.service.ts
git commit -m "refactor(audio): retire parallel playback services"
```

---

### Task 8: Add persistence, no-duplication, and 20-minute sensory quality gates

**Files:**
- Create: `frontend/src/environments/environment.ts`
- Create: `frontend/src/environments/environment.e2e.ts`
- Modify: `frontend/angular.json`
- Modify: `scripts/test-runner-support.mjs`
- Modify: `scripts/test-runner-support.test.mjs`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Create: `frontend/e2e/audio-settings.e2e.ts`
- Modify: `frontend/src/app/features/simulator/audio/audio-mixer.service.spec.ts`

- [ ] **Step 1: Create an E2E-only diagnostics seam and prove the runner selects it**

Create the environment files exactly:

```ts
// frontend/src/environments/environment.ts
export const environment = Object.freeze({ e2eDiagnostics: false });
```

```ts
// frontend/src/environments/environment.e2e.ts
export const environment = Object.freeze({ e2eDiagnostics: true });
```

Add this sibling to `build.configurations` in `frontend/angular.json`:

```json
"e2e": {
  "optimization": false,
  "extractLicenses": false,
  "sourceMap": true,
  "fileReplacements": [{
    "replace": "src/environments/environment.ts",
    "with": "src/environments/environment.e2e.ts"
  }]
}
```

Add this sibling to `serve.configurations`:

```json
"e2e": { "buildTarget": "psychosim-admin-panel:build:e2e" }
```

Append this red assertion to `scripts/test-runner-support.test.mjs` using the
test file's existing `runnerSupport` loader:

```js
test('Angular E2E command always selects the diagnostics-only configuration', () => {
  const command = runnerSupport.buildAngularCommand({
    node: process.execPath,
    cli: 'C:/repo/frontend/node_modules/@angular/cli/bin/ng.js',
    port: '4217',
    proxy: 'C:/temp/proxy.json',
    attestationNonce: 'nonce-1234567890abcdef',
  });
  assert.deepEqual(command.args.slice(2, 4), ['--configuration', 'e2e']);
});
```

Run: `node --test scripts/test-runner-support.test.mjs`

Expected: FAIL because `--configuration e2e` is absent.

Insert the two arguments immediately after `'serve'` in
`buildAngularCommand`:

```js
'serve',
'--configuration',
'e2e',
```

The repository already has a full `assert.deepEqual` for this builder. Update
that existing expected `args` array in the same red/green change; immediately
after its `'serve'` entry it must also contain:

```js
'--configuration',
'e2e',
```

Do not leave only the new `slice(2, 4)` assertion: the old full-array
expectation would remain red. Preserve the original host, port, proxy, headers,
nonce and `{ shell: false }` entries byte-for-byte after inserting this pair.

Run the same command again. Expected: PASS; existing host, port, proxy and
attestation assertions remain green.

In `SimulationPlayComponent`, import `environment` and install diagnostics only
when the replacement is true:

```ts
import { environment } from '../../../environments/environment';

readonly e2eDiagnostics = environment.e2eDiagnostics;

private installAudioDiagnostics(): void {
  if (!environment.e2eDiagnostics) return;
  const target = window as Window & {
    __SIEP_AUDIO_DEBUG__?: () => ReturnType<AudioMixerService['debugSnapshot']>;
  };
  target.__SIEP_AUDIO_DEBUG__ = () => this.audioMixer.debugSnapshot();
}

private removeAudioDiagnostics(): void {
  if (!environment.e2eDiagnostics) return;
  delete (window as Window & { __SIEP_AUDIO_DEBUG__?: unknown }).__SIEP_AUDIO_DEBUG__;
}
```

Call `installAudioDiagnostics()` immediately after the world successfully
starts and `removeAudioDiagnostics()` first in `ngOnDestroy`. Add this exact
entry to the component decorator's `host` object so the attribute is on
`<app-simulation-play>` and is absent, not merely empty, in production:

```ts
'[attr.data-audio-context-state]': 'e2eDiagnostics ? audioContextState() : null',
```

Add a unit test under the default environment that starts/destroys the world
and asserts `('__SIEP_AUDIO_DEBUG__' in window) === false` before and after.

- [ ] **Step 2: Add the Playwright settings and network gate**

Create `frontend/e2e/audio-settings.e2e.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import {
  acceptContentWarning,
  enterCaseAtContentWarning,
  finishCaseIntroduction,
  loginStudent,
  waitForWorldReady,
} from './support/siep-flow';

test.use({ viewport: { width: 1366, height: 768 } });

type AudioDebugSnapshot = {
  baseLoops: string[];
  spatialLoops: string[];
  playCounts: Record<string, number>;
};

const readAudioDebug = (page: Page): Promise<AudioDebugSnapshot> =>
  page.evaluate(() => (window as Window & {
    __SIEP_AUDIO_DEBUG__: () => AudioDebugSnapshot;
  }).__SIEP_AUDIO_DEBUG__());

test('@quality audio buses persist and every premium asset loads once', async ({ page }) => {
  const audioRequests = new Map<string, number>();
  page.on('request', request => {
    if (!request.url().includes('/assets/game/audio/')) return;
    audioRequests.set(request.url(), (audioRequests.get(request.url()) ?? 0) + 1);
  });

  await page.goto('/login');
  await loginStudent(page);
  await page.goto('/portal/jugar');
  const consent = await enterCaseAtContentWarning(page);
  const video = await acceptContentWarning(page, consent);
  const intro = await finishCaseIntroduction(page, video);
  await intro.getByRole('button', { name: /^continuar$/i }).click();
  await waitForWorldReady(page, 'hospital-urgencias');
  await expect(page.locator('app-simulation-play')).toHaveAttribute(
    'data-audio-context-state',
    'running',
  );
  await expect.poll(async () => (await readAudioDebug(page)).baseLoops.sort().join('|'))
    .toBe(['ambience.hospital', 'music.main'].sort().join('|'));
  await expect.poll(async () => (await readAudioDebug(page)).spatialLoops.join('|'))
    .toBe('source.hospital-monitor');
  await expect.poll(async () =>
    (await readAudioDebug(page)).playCounts['source.hospital-monitor'] ?? 0,
  ).toBe(1);

  const firstAudio = await readAudioDebug(page);
  expect(firstAudio.baseLoops.sort()).toEqual(
    ['ambience.hospital', 'music.main'].sort(),
  );
  expect(firstAudio.spatialLoops).toEqual(['source.hospital-monitor']);
  expect(firstAudio.playCounts['music.main']).toBe(1);
  expect(firstAudio.playCounts['ambience.hospital']).toBe(1);
  expect(firstAudio.playCounts['source.hospital-monitor']).toBe(1);

  await page.getByRole('button', { name: /abrir ajustes del juego/i }).click();
  await page.getByRole('slider', { name: /volumen de música/i }).fill('0.35');
  await page.getByRole('slider', { name: /volumen de ambiente/i }).fill('0.2');
  await page.getByRole('button', { name: /estímulos reducidos/i }).click();
  await expect.poll(async () => (await readAudioDebug(page)).spatialLoops.join('|'))
    .toBe('');

  await page.reload();
  const resume = page.getByRole('button', { name: /continuar intento|reanudar intento/i });
  await resume.click();
  await waitForWorldReady(page, 'hospital-urgencias');
  await expect(page.locator('app-simulation-play')).toHaveAttribute(
    'data-audio-context-state',
    'running',
  );
  const resumedAudio = await readAudioDebug(page);
  expect(resumedAudio.baseLoops).toEqual(['music.main']);
  expect(resumedAudio.spatialLoops).toEqual([]);
  expect(resumedAudio.playCounts['music.main']).toBe(1);
  expect(resumedAudio.playCounts['ambience.hospital'] ?? 0).toBe(0);
  expect(resumedAudio.playCounts['source.hospital-monitor'] ?? 0).toBe(0);
  await page.getByRole('button', { name: /abrir ajustes del juego/i }).click();

  await expect(page.getByRole('slider', { name: /volumen de música/i })).toHaveValue('0.35');
  await expect(page.getByRole('slider', { name: /volumen de ambiente/i })).toHaveValue('0.2');
  await expect(page.getByRole('button', { name: /estímulos reducidos/i })).toHaveAttribute('aria-pressed', 'true');
  expect([...audioRequests.values()].every(count => count <= 2)).toBe(true);
});
```

Two requests are allowed across a hard reload; more indicates duplicate initialization inside one page lifetime or an uncached asset path.
The authoritative `hospital-urgencias` spawn `(480,430)` is inside the authored
monitor radius centered at `(720,278)`, so the `expect.poll` calls wait for an
observable deterministic source instead of racing the first Phaser update.
Acceptance requires `source.hospital-monitor` in `spatialLoops` with
`playCount === 1`; after reduced stimuli and reload, `spatialLoops` is exactly
empty while the required `music.main` base loop remains.

- [ ] **Step 3: Add a 100-step/no-repeat and repeated pause test to the full suite**

The focused tests from Task 3 already cover this behavior. Keep them in `audio-mixer.service.spec.ts` and add:

```ts
it('is idempotent across repeated init/dispose boundaries', () => {
  mixer.init();
  mixer.init();
  mixer.dispatch({ type: 'scene.enter', mapKey: 'hospital-urgencias', sceneInstanceKey: 'attempt-1:hospital-urgencias:1:hash-a', profile: resolveRoomAudioProfile('hospital-urgencias') });
  expect(clips.get('music.main')?.playCount).toBe(1);
  mixer.dispose();
  expect([...clips.values()].every(clip => clip.unloadCount === 1)).toBe(true);
});
```

- [ ] **Step 4: Run automated verification**

From the repository root:

```powershell
node --test scripts/test-runner-support.test.mjs
node tools/audio/validate-premium-audio.mjs
cd frontend
npm test -- --runInBand
npm run build
cd ..
node scripts/test-e2e.mjs --project chromium --grep "audio buses persist"
```

Expected:

- runner-support tests pass and Angular E2E starts with `--configuration e2e`;
- validator reports 26 files;
- all Jest suites pass;
- production build succeeds;
- Playwright reports `1 passed`;
- first consent and resume both report `data-audio-context-state="running"`,
  including the real path where consent unlock precedes the first `Howl`;
- hospital spawn exposes one `source.hospital-monitor` spatial loop with
  `playCount === 1`, and reduced stimuli exposes no spatial loops;
- no duplicate loop appears after reload/resume.

- [ ] **Step 5: Commit the automated verification gate**

```powershell
git add frontend/src/environments frontend/angular.json scripts/test-runner-support.mjs scripts/test-runner-support.test.mjs frontend/src/app/features/simulator/simulation-play.component.ts frontend/e2e/audio-settings.e2e.ts frontend/src/app/features/simulator/audio/audio-mixer.service.spec.ts
git commit -m "test(audio): gate atmosphere persistence and playback integrity"
```

- [ ] **Step 6: Run the required 20-minute human audio capture on clean HEAD**

Confirm `git status --short` is empty. Play `SIM-VBG-001` continuously for at
least 20 minutes on headphones at 50% OS volume and again for five minutes on
laptop speakers. Record the session using the OS loopback recorder at 48 kHz/24-bit
under `.superpowers/evidence/<HEAD>/audio/`; include the HEAD SHA in the capture
manifest and do not alter tracked files afterward.

Audit the capture in one uninterrupted pass and record timestamps for any defect. Acceptance is all of the following:

- no click/pop at loop, door, dialogue, pause, resume, or room transition;
- first consent and resumed sessions report the audio context exactly `running`;
- no same footstep sample twice in a row;
- foot contact and sound stay within one 60 FPS frame visually and within the approved ±50 ms bound;
- music drops 6–10 dB in 250–800 ms during sensitive dialogue and restores without restarting;
- glass cues occur only at open/focus/confirm and never drip continuously;
- reduced stimuli removes optional ambience/hover cues while confirmations and visual meaning remain;
- diagnostics show base loops separately from spatial loops; hospital spawn has
  one monitor source, and reduced stimuli leaves the spatial list empty;
- no fatigue-producing resonance or obvious 24-second room-tone loop;
- recorded master peak does not exceed `-1 dBFS` and has zero clipped samples;
- pause/resume produces one music loop, one ambience loop and at most one
  instance per currently audible localized source, never duplicates.

Any failed item blocks the audio dimension at 8/10 and must be corrected before the branch can be presented for publication.

---

## Self-review

### Spec coverage

- One `AudioMixer` and typed `AudioCue`; Phaser emits facts through the existing
  `GameWorldPort`, with no callback or parallel playback stack: Tasks 1, 3, 5,
  and 7.
- Buses `music`, `ambience`, `voice/text`, `sfx` and independent persistent controls: Tasks 1, 3, and 6.
- Base ambience, room identity, localized pan, music state, transition cues: Tasks 2, 4, and 5.
- Door audio begins only from an authorized `begin-room-transition`; denial is
  silent, cancellation clears without close, and success opens/closes once: Task 5.
- Three variants per surface, no immediate repeat in 100 steps, contact-frame timing: Tasks 2, 3, 4, and 5.
- Dialogue ducking 6–10 dB in 250–800 ms and smooth recovery: Tasks 3 and 7.
- Four authored `ConsequenceTone` cues, emitted once only for the live beat and
  never replayed during hydration; the 4 × 21 contract matrix proves the same
  tone selects clinical value, body animation, portrait state and audio key:
  Tasks 2, 3, and 7.
- Sober glass resonances without permanent futuristic water: Tasks 2, 3, and 6.
- Reduced stimuli distinct from reduced motion, with visual meaning preserved: Tasks 1, 3, 6, and 8.
- Pause/resume integrity, zero duplicate loops, clicks/pops, clipping, and 20-minute capture: Tasks 3, 7, and 8.
- Browser autoplay is unlocked only by consent/resume gestures and verified live: Tasks 3, 6, and 8.
- A pure Howler adapter test proves the consent gesture creates `ctx` before any
  `Howl`, resumes it, and installs the limiter; Playwright proves `running`: Tasks 3 and 8.
- Diagnostics exist only in the isolated Angular `e2e` configuration and are absent from production runtime state: Task 8.
- Shared dialogue has one narrow cue dependency: playable simulation aliases it
  to the sole mixer and editor preview deliberately provides a tested no-op,
  never a second engine: Tasks 3 and 6.
- Journal open/close feedback is migrated and tested before the two legacy
  services are removed: Task 7.

### Placeholder scan

The plan contains no unresolved marker, unnamed asset, unspecified test, or deferred implementation instruction. Every binary file is either imported by an exact official CC0 URL or generated deterministically by a versioned script, then checked by an exact validator.

### Type consistency

- `AudioCue` is the only cross-boundary event. `GameWorldComponent` and
  `SimulationPlayComponent` forward it unchanged; `DialoguePanelComponent`
  depends only on `AudioCuePort`; `AudioMixerService implements AudioCuePort`;
  and `WorldPreviewComponent` binds the same token to the explicit no-op value.
- `AudioBus` uses `voice` internally and the HUD labels it “Texto y diálogo”; no second `text` bus exists.
- `FootstepSurface` has exactly `tile`, `wood`, and `carpet` in profiles, catalogue keys, sequencer output, and mixer selection.
- `AudioSettingsV1.version` and `AUDIO_SETTINGS_KEY` are both `1`/`siep_audio_settings_v1`.
- `JournalPanelComponent` dispatches `ui.select`/`ui.cancel` through the existing
  `AudioMixerService`; legacy `AudioDirectorService` and `AudioService` are
  deleted only after the zero-reference scan includes that consumer.
