# 13 — Rehacer la introducción como escena animada en código — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Estado:** TODO
- **Commit base:** `e68e61b` (rama `feat/ui-mes`). **Requiere el plan 11**: su tarea 3 crea `audio-director.service.spec.ts`, que aquí se amplía.
- **Severidad:** MEDIA-ALTA (primera impresión del juego; 1,7 MB de video con marca de agua de IA; 10 MB de música decodificada en memoria)
- **Categoría:** Movimiento / identidad / rendimiento de carga
- **Alcance estimado:** 1 util y 1 componente nuevos, 2 MP3 recomprimidos, 1 video borrado; 4 specs nuevos, 3 ampliados

**Goal:** Reemplazar el video de la intro por una escena corta, hecha en código, donde **el personaje que el estudiante eligió** entra caminando al servicio de urgencias. También: poder silenciar la música desde las tarjetas de la intro sin ver nombres internos de pistas, y bajar el peso y la memoria del audio largo.

**Architecture:**
- **Escena:** `CaseIntroSceneComponent` dibuja un escenario de 384×216 px nativos con CSS (pared, ventana nocturna, piso de baldosas, dos lámparas con cono de luz) y sprites que ya existen (`door_urgencias.png`, `chair.png`, `plant.png`). Lo escala a un múltiplo **entero** (1×-4×) según el espacio; en pantallas angostas recorta los lados en vez de escalar a fracciones.
  - El personaje sale de `AvatarStore` con la misma prioridad que el juego (v1 → elenco horneado → modular). Un util puro (`intro-scene.util.ts`) traduce cada tipo a capas, tamaño de hoja y cuadros.
  - El desplazamiento es una animación CSS de `transform` (3,6 s, lineal). El cambio de cuadro lo hace un `requestAnimationFrame` **fuera de la zona de Angular**, que solo escribe dos variables CSS en el elemento del actor.
  - Al terminar de caminar, el personaje queda de frente respirando con la hoja idle.
  - Con movimiento reducido, el gate ya salta la escena. Si aun así se muestra, empieza quieto y de frente.
- **Flujo:** el paso `'video'` de `intro-gate.util.ts` pasa a llamarse `'scene'`.
  - La tarjeta conserva el título «Antes de comenzar» y un único botón «Continuar», siempre visible. Así los e2e (`/saltar video|continuar/i`) siguen funcionando sin tocarlos.
  - El tema de la intro empieza con la escena y sigue en la tarjeta del caso.
  - Las dos tarjetas reemplazan el chip «PsicoLament está sonando» por un botón «Silenciar música» (`aria-pressed`).
- **Audio:** `PsicoLament.mp3` y `Musica_PsicoGame.mp3` pasan de 256 a 128 kbps (≈ 5 MB → ≈ 2,5 MB cada uno) y se cargan con `html5: true`. Así se transmiten, en vez de decodificarse enteros en Web Audio: unos 50 MB de PCM por pista de 150 s. Además, silenciar la música ahora también silencia el tema de la intro (hoy no lo hace).

**Tech Stack:** Angular 21 (signals, `viewChild`, `input`), CSS, Howler 2, ffmpeg 9 (en el PATH de Git Bash), Jest 30.

**Spec:** Auditoría del 2026-09-29: «Rehacer la introducción» (prioridad del mes n.º 13) y la decisión del usuario del 2026-09-29: «Escena animada en código». Este plan es autocontenido.

## Global Constraints

- Todas las rutas son relativas a la raíz del repo.
- No añadir dependencias npm.
- **Contrato e2e intocable:** la tarjeta de la escena es un `role="dialog"` que contiene el texto «Antes de comenzar» y un botón cuyo nombre accesible es exactamente «Continuar». La tarjeta del caso conserva «Contexto inicial del caso» y su botón «Continuar». No editar `frontend/e2e/**`: `e2e/support/siep-flow.ts` tiene trabajo sin commitear de otra sesión.
- Pixel art: el escenario solo se escala por enteros (`stageLayout`). Las hojas v1 se dibujan con `image-rendering: pixelated`. Las hojas 3×3 de 128×192 se reducen a 48×72 con suavizado (`image-rendering: auto`), igual que en el juego.
- Ningún texto visible nombra archivos ni pistas internas («PsicoLament», nombres de `.mp3`).
- El orden ETH-01 no cambia: consentimiento → escena → contexto del caso → juego.
- No tocar `game-world.component.ts`.
- Si un fragmento «Actual» no coincide con el archivo (drift), DETENERSE y reportar.
- Textos visibles en español con tildes. Commits en español `tipo(ámbito): descripción`.
- El árbol de trabajo usa CRLF (git `autocrlf=true`): en las regex de los specs de contrato, usar `\s*` o `\s+` entre líneas, nunca `\n` literal.

## Review Focus

- Con un personaje del elenco horneado (p. ej. Paula) o un avatar modular, la escena muestra a ese personaje, no a Valentina ni un hueco vacío.
- En un teléfono de 390 px, el escenario no desborda la tarjeta: se recorta por los lados y la puerta sigue visible.
- Silenciar en la escena, continuar y volver a activar en la tarjeta del caso: suena el tema de la intro, no la música del mapa encima.
- Enter o Espacio sobre «Silenciar música» alterna la música; no salta la tarjeta.
- En 1366×768, la tarjeta de la escena cabe sin barra de desplazamiento y el escenario sale a 2×.

## Problema

`frontend/src/app/features/simulator/simulation-play.component.ts`:
- Líneas 43-45: `const SIMULATOR_INTRO_VIDEO = 'assets/video/fondoHabitacion.mp4';` y `const CASE_INTRO_AUDIO = 'PsicoLament';`.
- Líneas 158-184: la tarjeta «Antes de comenzar» con `<video #introVideo …>`, un chip «Contexto visual del escenario» y un botón que alterna entre «Saltar video» y «Continuar».
- Línea 192: `<span>{{ caseIntroAudio }} está sonando</span>` en la tarjeta del caso.
- Líneas 605-689 y 909-915: estilos `.intro-video-*`, casi idénticos a los de `.case-intro-*`.
- Líneas 1172-1185: Enter/Espacio avanzan las tarjetas aunque el foco esté en otro botón.
- Líneas 1739-1744: `toggleMusicMute()` llama a `setStressLevel` al reactivar, aunque se esté en la intro, y anuncia «Musica» sin tilde.
- Líneas 1966-1986: `playIntroVideo`, `onIntroVideoEnded`, `continueFromIntroVideo`.

`frontend/src/assets/video/fondoHabitacion.mp4` (1 749 578 B, 10 s, 1280×720) es una ilustración generada con IA y conserva la marca de agua ✦ en la esquina inferior derecha.

`frontend/src/assets/game/audio/PsicoLament.mp3` (5 017 226 B, 156,7 s, 256 kbps) y `Musica_PsicoGame.mp3` (4 868 432 B, 152,1 s, 256 kbps) se cargan sin `html5: true` (`audio-director.service.ts` líneas 50-56 y 97-103). `setMusicMuted()` (líneas 180-189) no toca `introLament`.

---

### Task 1: Audio largo más liviano, en streaming y obediente al silencio

**Files:**
- Modify (binario): `frontend/src/assets/game/audio/PsicoLament.mp3`, `frontend/src/assets/game/audio/Musica_PsicoGame.mp3`
- Modify: `frontend/src/app/features/simulator/audio-director.service.ts` (líneas ~50-56, ~97-103, ~180-189)
- Modify: `frontend/src/app/features/simulator/audio-director.service.spec.ts` (creado por el plan 11)
- Create: `frontend/src/app/features/simulator/intro-audio.budget.spec.ts`

**Interfaces:**
- Consumes: el mock de `howler` y el `describe('AudioDirectorService: bucle de fundido')` del plan 11.
- Produces: nada nuevo en la API pública.

- [ ] **Step 1: Escribir los specs que fallan**

Crear `frontend/src/app/features/simulator/intro-audio.budget.spec.ts`:

```ts
import { statSync } from 'fs';
import { join } from 'path';

const audioBytes = (name: string) =>
  statSync(join(__dirname, '../../../assets/game/audio', name)).size;

describe('presupuesto del audio largo', () => {
  it.each(['PsicoLament.mp3', 'Musica_PsicoGame.mp3'])('%s pesa menos de 2,8 MB (128 kbps)', name => {
    expect(audioBytes(name)).toBeLessThan(2_800_000);
  });
});
```

Al final de `frontend/src/app/features/simulator/audio-director.service.spec.ts`, añadir:

```ts
describe('AudioDirectorService: pistas largas y silencio', () => {
  let service: AudioDirectorService;
  const howlOptions = () =>
    (Howl as unknown as jest.Mock).mock.calls.map(([options]) => options as { src: string[]; html5?: boolean });
  const howlFor = (src: string) => {
    const index = howlOptions().findIndex(options => options.src[0] === src);
    return (Howl as unknown as jest.Mock).mock.results[index].value;
  };

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
  });

  beforeEach(() => {
    (Howl as unknown as jest.Mock).mockClear();
    TestBed.resetTestingModule();
    service = TestBed.inject(AudioDirectorService);
    service.init();
  });

  afterEach(() => service.dispose());

  it('la música del mapa y el tema de la intro se transmiten con HTML5', () => {
    service.playIntroLament();
    const long = howlOptions().filter(options => options.src[0].endsWith('.mp3'));
    expect(long.map(options => options.src[0])).toEqual([
      'assets/game/audio/Musica_PsicoGame.mp3',
      'assets/game/audio/PsicoLament.mp3',
    ]);
    for (const options of long) expect(options.html5).toBe(true);
  });

  it('los efectos cortos siguen en Web Audio', () => {
    const sfx = howlOptions().filter(options => options.src[0].endsWith('.ogg'));
    expect(sfx.length).toBeGreaterThan(0);
    for (const options of sfx) expect(options.html5).toBeUndefined();
  });

  it('silenciar la música también silencia el tema de la intro', () => {
    service.playIntroLament();
    const lament = howlFor('assets/game/audio/PsicoLament.mp3');
    service.setMusicMuted(true);
    expect(lament.mute).toHaveBeenLastCalledWith(true);
    service.setMusicMuted(false);
    expect(lament.mute).toHaveBeenLastCalledWith(false);
  });
});
```

- [ ] **Step 2: Ejecutar los specs y verlos fallar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/intro-audio.budget.spec.ts src/app/features/simulator/audio-director.service.spec.ts`
Expected: FAIL (dos casos de presupuesto; `html5` es `undefined`; `mute` nunca se llama).

- [ ] **Step 3: Recomprimir las dos pistas**

Desde la raíz del repo, en Git Bash:

```bash
cd frontend/src/assets/game/audio
for f in PsicoLament Musica_PsicoGame; do
  ffmpeg -v error -y -i "$f.mp3" -map 0:a -codec:a libmp3lame -b:a 128k -ar 44100 -ac 2 -map_metadata 0 "$f.128.mp3" && mv "$f.128.mp3" "$f.mp3"
done
for f in PsicoLament Musica_PsicoGame; do
  ffprobe -v error -show_entries format=duration,bit_rate -of compact "$f.mp3"
done
cd -
```

Expected: `bit_rate` cercano a 128000 y `duration` igual a la original ±0,1 s (156,71 y 152,07).

- [ ] **Step 4: Cambiar el servicio**

En `audio-director.service.ts`, en el `new Howl({ ... })` de los stems (dentro del `for` de `stemFiles`), reemplazar:

```ts
        volume: 0,
        preload: true,
```

por:

```ts
        volume: 0,
        preload: true,
        // Pista de ~150 s: HTML5 la transmite; Web Audio la decodificaría entera (~50 MB de PCM).
        html5: true,
```

En `playIntroLament()`, reemplazar:

```ts
        volume: this.musicVolume,
        preload: true,
```

por:

```ts
        volume: this.musicVolume,
        preload: true,
        html5: true,
```

En `setMusicMuted()`, reemplazar:

```ts
  setMusicMuted(muted: boolean): void {
    this.musicMuted = muted;
    if (muted) {
```

por:

```ts
  setMusicMuted(muted: boolean): void {
    this.musicMuted = muted;
    this.introLament?.mute(muted);
    if (muted) {
```

- [ ] **Step 5: Ejecutar los specs y verlos pasar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/intro-audio.budget.spec.ts src/app/features/simulator/audio-director.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Escucha rápida**

Run: `ffplay -autoexit -t 12 frontend/src/assets/game/audio/PsicoLament.mp3` (y lo mismo con `Musica_PsicoGame.mp3`).
Expected: sin cortes, clics ni metal audible en los agudos. Si se oye degradado, repetir el paso 3 con `-b:a 160k` y subir el límite del spec a 3 400 000; anotarlo en el reporte.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/assets/game/audio/PsicoLament.mp3 frontend/src/assets/game/audio/Musica_PsicoGame.mp3 frontend/src/app/features/simulator/audio-director.service.ts frontend/src/app/features/simulator/audio-director.service.spec.ts frontend/src/app/features/simulator/intro-audio.budget.spec.ts
git commit -m "perf(audio): música larga a 128 kbps, en streaming y silenciable en la intro"
```

---

### Task 2: Util puro de la escena (actor, cuadros y escala entera)

**Files:**
- Create: `frontend/src/app/features/simulator/intro-scene.util.ts`
- Create: `frontend/src/app/features/simulator/intro-scene.util.spec.ts`

**Interfaces:**
- Consumes: `resolvePlayerVisual`, `v1SheetPath`, `V1_DIR_ROW`, `V1_WALK_COLS`, `V1_IDLE_COLS`, `V1_WALK_FPS`, `V1_IDLE_FPS` (`v1-avatar.util.ts`); `castAssetPath` (`baked-cast.util.ts`); `AVATAR_WALK_FRAMES`, `AVATAR_WALK_FRAME_RATE`, `avatarLayerSpecs`, `avatarRowLayerOrder` (`phaser-avatar-renderer.ts`; su spec ya lo importa en Jest sin problemas).
- Produces:
  - `INTRO_STAGE_WIDTH = 384`, `INTRO_STAGE_HEIGHT = 216`, `INTRO_FRAME_WIDTH = 48`, `INTRO_FRAME_HEIGHT = 72`.
  - `interface IntroFrame { x: number; y: number }`.
  - `interface IntroActorPhase { layers: string[]; sheetWidth: number; sheetHeight: number; frames: IntroFrame[]; fps: number }`.
  - `interface IntroActor { pixelated: boolean; walk: IntroActorPhase; idle: IntroActorPhase }`.
  - `introActor(config: AvatarConfig): IntroActor`.
  - `frameAt(elapsedMs: number, fps: number, count: number): number`.
  - `interface StageLayout { scale: number; frameWidth: number; frameHeight: number; offsetX: number }`.
  - `stageLayout(availableWidth: number, availableHeight: number): StageLayout`.

- [ ] **Step 1: Escribir el spec que falla**

Crear `frontend/src/app/features/simulator/intro-scene.util.spec.ts`:

```ts
import { defaultAvatar } from '../character/avatar-config.util';
import { avatarLayerSpecs } from './phaser-avatar-renderer';
import { frameAt, introActor, stageLayout } from './intro-scene.util';

describe('introActor', () => {
  it('un personaje v1 camina con su fila derecha y reposa de frente, en pixel art', () => {
    const actor = introActor(defaultAvatar()); // valentina (v1)
    expect(actor.pixelated).toBe(true);
    expect(actor.walk.layers).toEqual(['/assets/characters/v1/valentina/base/walk.png']);
    expect([actor.walk.sheetWidth, actor.walk.sheetHeight]).toEqual([288, 288]);
    expect(actor.walk.frames.map(f => f.x)).toEqual([0, 48, 96, 144, 192, 240]);
    expect(new Set(actor.walk.frames.map(f => f.y))).toEqual(new Set([144]));
    expect(actor.walk.fps).toBe(10);
    expect(actor.idle.layers).toEqual(['/assets/characters/v1/valentina/base/idle.png']);
    expect([actor.idle.sheetWidth, actor.idle.sheetHeight]).toEqual([192, 288]);
    expect(actor.idle.frames).toEqual([{ x: 0, y: 0 }, { x: 48, y: 0 }, { x: 96, y: 0 }, { x: 144, y: 0 }]);
    expect(actor.idle.fps).toBe(4);
  });

  it('un personaje del elenco horneado usa su hoja 3×3 reducida al cuadro de 48×72', () => {
    const actor = introActor({ ...defaultAvatar(), castId: 'paula' });
    expect(actor.pixelated).toBe(false);
    expect(actor.walk.layers).toEqual(['/assets/characters/cast/paula.png']);
    expect([actor.walk.sheetWidth, actor.walk.sheetHeight]).toEqual([144, 216]);
    // Ciclo de caminata lateral [4, 3, 5, 3] de la hoja 3×3.
    expect(actor.walk.frames).toEqual([{ x: 48, y: 72 }, { x: 0, y: 72 }, { x: 96, y: 72 }, { x: 0, y: 72 }]);
    expect(actor.walk.fps).toBe(8);
    expect(actor.idle.frames).toEqual([{ x: 0, y: 0 }]);
  });

  it('el avatar modular apila sus capas en el orden de cada fila', () => {
    const config = { ...defaultAvatar(), castId: undefined };
    const kindOf = (path: string) => avatarLayerSpecs(config).find(spec => spec.assetPath === path)?.kind;
    const actor = introActor(config);
    expect(actor.pixelated).toBe(false);
    expect(actor.walk.layers.length).toBeGreaterThan(1);
    // De perfil el rostro va sobre el flequillo; de frente, el flequillo sobre el rostro.
    const walkKinds = actor.walk.layers.map(kindOf);
    const idleKinds = actor.idle.layers.map(kindOf);
    expect(walkKinds.indexOf('face')).toBeGreaterThan(walkKinds.indexOf('body'));
    if (walkKinds.includes('hairFront')) {
      expect(walkKinds.indexOf('face')).toBeGreaterThan(walkKinds.indexOf('hairFront'));
      expect(idleKinds.indexOf('hairFront')).toBeGreaterThan(idleKinds.indexOf('face'));
    }
  });
});

describe('frameAt', () => {
  it('avanza según los fps y vuelve a empezar', () => {
    expect(frameAt(0, 10, 6)).toBe(0);
    expect(frameAt(100, 10, 6)).toBe(1);
    expect(frameAt(599, 10, 6)).toBe(5);
    expect(frameAt(650, 10, 6)).toBe(0);
  });

  it('una animación de un solo cuadro siempre da 0', () => {
    expect(frameAt(5000, 1, 1)).toBe(0);
  });
});

describe('stageLayout', () => {
  it('usa la mayor escala entera que cabe', () => {
    expect(stageLayout(812, 445)).toEqual({ scale: 2, frameWidth: 768, frameHeight: 432, offsetX: 0 });
  });

  it('nunca baja de 1×: en pantallas angostas recorta los lados, centrado', () => {
    expect(stageLayout(340, 500)).toEqual({ scale: 1, frameWidth: 340, frameHeight: 216, offsetX: -22 });
  });

  it('no pasa de 4×', () => {
    expect(stageLayout(5000, 5000).scale).toBe(4);
  });
});
```

- [ ] **Step 2: Ejecutar el spec y verlo fallar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/intro-scene.util.spec.ts`
Expected: FAIL (`Cannot find module './intro-scene.util'`).

- [ ] **Step 3: Crear el util**

Crear `frontend/src/app/features/simulator/intro-scene.util.ts`:

```ts
import { AvatarConfig } from '../character/avatar.model';
import { castAssetPath } from './baked-cast.util';
import {
  AVATAR_WALK_FRAMES,
  AVATAR_WALK_FRAME_RATE,
  avatarLayerSpecs,
  avatarRowLayerOrder,
} from './phaser-avatar-renderer';
import {
  V1_DIR_ROW,
  V1_IDLE_COLS,
  V1_IDLE_FPS,
  V1_WALK_COLS,
  V1_WALK_FPS,
  resolvePlayerVisual,
  v1SheetPath,
} from './v1-avatar.util';

/** Escenario de la intro en píxeles nativos (16:9). */
export const INTRO_STAGE_WIDTH = 384;
export const INTRO_STAGE_HEIGHT = 216;
/** Cuadro del personaje en la escena: el tamaño nativo de las hojas v1. */
export const INTRO_FRAME_WIDTH = 48;
export const INTRO_FRAME_HEIGHT = 72;

const INTRO_MAX_SCALE = 4;
const V1_ROWS = 4;
/** Hojas del elenco horneado y del avatar modular: 3×3 cuadros de 128×192. */
const SHEET3_COLS = 3;
const SHEET3_ROWS = 3;
const SHEET3_SIDE_ROW = 1;
const SHEET3_FRONT_ROW = 0;

export interface IntroFrame {
  x: number;
  y: number;
}

export interface IntroActorPhase {
  /** Capas de atrás hacia adelante (una sola para v1 y el elenco horneado). */
  layers: string[];
  /** Tamaño de la hoja completa, ya llevada al cuadro de 48×72. */
  sheetWidth: number;
  sheetHeight: number;
  /** Desplazamiento (px, positivo) de cada cuadro de la animación, en orden. */
  frames: IntroFrame[];
  fps: number;
}

export interface IntroActor {
  /** v1 es pixel art nativo; las hojas 3×3 se reducen con suavizado, como en el juego. */
  pixelated: boolean;
  walk: IntroActorPhase;
  idle: IntroActorPhase;
}

function rowFrames(row: number, cols: number): IntroFrame[] {
  return Array.from({ length: cols }, (_, col) => ({ x: col * INTRO_FRAME_WIDTH, y: row * INTRO_FRAME_HEIGHT }));
}

function sheet3Phase(layers: string[], frameIndexes: readonly number[], fps: number): IntroActorPhase {
  return {
    layers,
    sheetWidth: SHEET3_COLS * INTRO_FRAME_WIDTH,
    sheetHeight: SHEET3_ROWS * INTRO_FRAME_HEIGHT,
    frames: frameIndexes.map(index => ({
      x: (index % SHEET3_COLS) * INTRO_FRAME_WIDTH,
      y: Math.floor(index / SHEET3_COLS) * INTRO_FRAME_HEIGHT,
    })),
    fps,
  };
}

/** Capas del avatar modular en el orden de composición de esa fila. */
function modularLayers(config: AvatarConfig, row: number): string[] {
  const specs = avatarLayerSpecs(config);
  return avatarRowLayerOrder(row).flatMap(kind =>
    specs.filter(spec => spec.kind === kind).map(spec => spec.assetPath));
}

/**
 * Cómo dibujar al personaje del jugador en la intro: entra caminando hacia la
 * derecha y luego reposa de frente. Misma prioridad que el juego: v1 → elenco → modular.
 */
export function introActor(config: AvatarConfig): IntroActor {
  const visual = resolvePlayerVisual(config);
  if (visual.kind === 'v1') {
    return {
      pixelated: true,
      walk: {
        layers: [v1SheetPath(visual.id, 'walk')],
        sheetWidth: V1_WALK_COLS * INTRO_FRAME_WIDTH,
        sheetHeight: V1_ROWS * INTRO_FRAME_HEIGHT,
        frames: rowFrames(V1_DIR_ROW.right, V1_WALK_COLS),
        fps: V1_WALK_FPS,
      },
      idle: {
        layers: [v1SheetPath(visual.id, 'idle')],
        sheetWidth: V1_IDLE_COLS * INTRO_FRAME_WIDTH,
        sheetHeight: V1_ROWS * INTRO_FRAME_HEIGHT,
        frames: rowFrames(V1_DIR_ROW.down, V1_IDLE_COLS),
        fps: V1_IDLE_FPS,
      },
    };
  }
  const walkLayers = visual.kind === 'cast' ? [castAssetPath(visual.id)] : modularLayers(config, SHEET3_SIDE_ROW);
  const idleLayers = visual.kind === 'cast' ? [castAssetPath(visual.id)] : modularLayers(config, SHEET3_FRONT_ROW);
  return {
    pixelated: false,
    walk: sheet3Phase(walkLayers, AVATAR_WALK_FRAMES.side, AVATAR_WALK_FRAME_RATE),
    idle: sheet3Phase(idleLayers, [SHEET3_FRONT_ROW * SHEET3_COLS], 1),
  };
}

/** Cuadro que toca a los `elapsedMs` de una animación en bucle. */
export function frameAt(elapsedMs: number, fps: number, count: number): number {
  if (count <= 1 || elapsedMs <= 0) return 0;
  return Math.floor((elapsedMs * fps) / 1000) % count;
}

export interface StageLayout {
  /** Escala entera del escenario (1-4). */
  scale: number;
  /** Caja visible: el escenario escalado, recortado al ancho disponible. */
  frameWidth: number;
  frameHeight: number;
  /** Desplazamiento del escenario dentro de la caja (negativo cuando se recorta). */
  offsetX: number;
}

/** Mayor escala ENTERA que cabe; en pantallas angostas queda en 1× y se recortan los lados. */
export function stageLayout(availableWidth: number, availableHeight: number): StageLayout {
  const fit = Math.floor(Math.min(availableWidth / INTRO_STAGE_WIDTH, availableHeight / INTRO_STAGE_HEIGHT));
  const scale = Math.max(1, Math.min(INTRO_MAX_SCALE, fit));
  const stageWidth = INTRO_STAGE_WIDTH * scale;
  const frameWidth = Math.min(Math.max(0, Math.floor(availableWidth)), stageWidth);
  return {
    scale,
    frameWidth,
    frameHeight: INTRO_STAGE_HEIGHT * scale,
    offsetX: Math.round((frameWidth - stageWidth) / 2),
  };
}
```

- [ ] **Step 4: Ejecutar el spec y verlo pasar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/intro-scene.util.spec.ts`
Expected: PASS (9 pruebas).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/simulator/intro-scene.util.ts frontend/src/app/features/simulator/intro-scene.util.spec.ts
git commit -m "feat(intro): util puro del actor, los cuadros y la escala entera de la escena"
```

---

### Task 3: Componente `CaseIntroSceneComponent`

**Files:**
- Create: `frontend/src/app/features/simulator/case-intro-scene.component.ts`
- Create: `frontend/src/app/features/simulator/case-intro-scene.component.spec.ts`

**Interfaces:**
- Consumes: todo lo que produce la tarea 2; `AvatarStore` (`../character/avatar.store`, `avatar: Signal<AvatarConfig>`).
- Produces: `<app-case-intro-scene [reduceMotion]="boolean" />` (selector `app-case-intro-scene`, clase `CaseIntroSceneComponent`, input `reduceMotion`).

- [ ] **Step 1: Escribir el spec que falla**

Crear `frontend/src/app/features/simulator/case-intro-scene.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AvatarStore } from '../character/avatar.store';
import { CaseIntroSceneComponent } from './case-intro-scene.component';

type InputSignalNodeLike<T> = {
  applyValueToInputSignal(node: InputSignalNodeLike<T>, value: T): void;
};

function writeInputSignal<T>(inputSignal: () => T, value: T): void {
  const carrier = inputSignal as unknown as { [key: symbol]: InputSignalNodeLike<T> };
  const node = Object.getOwnPropertySymbols(inputSignal)
    .map(symbol => carrier[symbol])
    .find(candidate => typeof candidate?.applyValueToInputSignal === 'function');
  if (!node) throw new Error('No se encontró el nodo interno del input signal');
  node.applyValueToInputSignal(node, value);
}

const source = readFileSync(join(__dirname, 'case-intro-scene.component.ts'), 'utf-8');

describe('CaseIntroSceneComponent', () => {
  let fixture: ComponentFixture<CaseIntroSceneComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const actor = () => host().querySelector('.intro-actor') as HTMLElement;
  const layerImages = () =>
    Array.from(host().querySelectorAll<HTMLElement>('.intro-actor__layer')).map(layer => layer.style.backgroundImage);

  function create(options: { reduceMotion?: boolean; castId?: string } = {}): void {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [CaseIntroSceneComponent] });
    if (options.castId !== undefined) TestBed.inject(AvatarStore).update({ castId: options.castId });
    fixture = TestBed.createComponent(CaseIntroSceneComponent);
    if (options.reduceMotion) writeInputSignal(fixture.componentInstance.reduceMotion, true);
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('el personaje elegido entra caminando con su hoja de caminata, en pixel art', () => {
    create();
    expect(actor().classList).toContain('intro-actor--walking');
    expect(actor().classList).toContain('intro-actor--pixel');
    expect(layerImages()).toHaveLength(1);
    expect(layerImages()[0]).toContain('/assets/characters/v1/valentina/base/walk.png');
    // El primer cuadro ya está puesto antes del primer requestAnimationFrame (fila derecha).
    expect(actor().style.getPropertyValue('--frame-y')).toBe('-144px');
  });

  it('al terminar de caminar se queda de frente con la hoja de reposo', () => {
    create();
    actor().dispatchEvent(new Event('animationend'));
    fixture.detectChanges();
    expect(actor().classList).not.toContain('intro-actor--walking');
    expect(layerImages()[0]).toContain('/assets/characters/v1/valentina/base/idle.png');
    expect(actor().style.getPropertyValue('--frame-y')).toBe('0px');
  });

  it('con movimiento reducido empieza quieto, de frente y en su sitio', () => {
    create({ reduceMotion: true });
    expect(actor().classList).not.toContain('intro-actor--walking');
    expect(layerImages()[0]).toContain('/assets/characters/v1/valentina/base/idle.png');
    expect(actor().style.getPropertyValue('--frame-x')).toBe('0px');
  });

  it('un personaje del elenco horneado usa su hoja propia, reducida con suavizado', () => {
    create({ castId: 'paula' });
    expect(actor().classList).not.toContain('intro-actor--pixel');
    expect(layerImages()[0]).toContain('/assets/characters/cast/paula.png');
  });

  it('describe la escena a los lectores de pantalla', () => {
    create();
    expect(host().querySelector('[role="img"]')?.getAttribute('aria-label'))
      .toBe('Tu personaje entra de noche al servicio de urgencias del hospital.');
  });

  it('anima los cuadros fuera de la zona de Angular', () => {
    expect(source).toMatch(/this\.zone\.runOutsideAngular\(\(\) => \{\s*this\.frameId = requestAnimationFrame/);
  });
});
```

- [ ] **Step 2: Ejecutar el spec y verlo fallar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/case-intro-scene.component.spec.ts`
Expected: FAIL (`Cannot find module './case-intro-scene.component'`).

- [ ] **Step 3: Crear el componente**

Crear `frontend/src/app/features/simulator/case-intro-scene.component.ts`:

```ts
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { AvatarStore } from '../character/avatar.store';
import { INTRO_STAGE_HEIGHT, INTRO_STAGE_WIDTH, frameAt, introActor, stageLayout } from './intro-scene.util';

/** Parte del alto de la ventana que puede ocupar el escenario: en 1366×768 cabe a 2×. */
const STAGE_HEIGHT_SHARE = 0.58;
/** Centro de las dos lámparas del techo, en px del escenario. */
const LAMP_CENTERS = [150, 234] as const;

/**
 * Escena de la intro: el personaje del estudiante entra de noche a urgencias.
 * Todo es DOM/CSS a resolución nativa (384×216) escalado por enteros. El paso
 * de cuadros corre fuera de Angular y solo escribe dos variables CSS.
 */
@Component({
  selector: 'app-case-intro-scene',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #viewport class="intro-scene">
      <div class="intro-scene__frame" [style.width.px]="layout().frameWidth" [style.height.px]="layout().frameHeight">
        <div class="intro-stage" role="img"
          aria-label="Tu personaje entra de noche al servicio de urgencias del hospital."
          [style.left.px]="layout().offsetX"
          [style.transform]="'scale(' + layout().scale + ')'">
          <div class="intro-stage__wall"></div>
          <div class="intro-stage__window"><span class="intro-stage__moon"></span></div>
          <div class="intro-stage__floor"></div>
          @for (x of lamps; track x) {
            <span class="intro-stage__pool" [style.left.px]="x - 44"></span>
          }
          <img class="intro-stage__door" src="/assets/game/doors/door_urgencias.png" alt="" width="48" height="64">
          <img class="intro-stage__chair" src="/assets/game/furniture/chair.png" alt="" width="27" height="46">
          <img class="intro-stage__plant" src="/assets/game/furniture/plant.png" alt="" width="49" height="64">
          @for (x of lamps; track x) {
            <span class="intro-stage__lamp" [style.left.px]="x - 9"><span class="intro-stage__cone"></span></span>
          }
          <div #actorEl class="intro-actor"
            [class.intro-actor--pixel]="actor().pixelated"
            [class.intro-actor--walking]="phase() === 'walk'"
            (animationend)="onWalkEnd($event)">
            @for (layer of phaseSheet().layers; track layer) {
              <span class="intro-actor__layer"
                [style.background-image]="'url(' + layer + ')'"
                [style.background-size]="phaseSheet().sheetWidth + 'px ' + phaseSheet().sheetHeight + 'px'"></span>
            }
          </div>
        </div>
        <p class="intro-scene__caption" aria-hidden="true">Hospital · Urgencias · Noche</p>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .intro-scene { width: 100%; display: flex; justify-content: center; overflow: hidden; }
    .intro-scene__frame {
      position: relative;
      flex: none;
      overflow: hidden;
      border: 1px solid rgba(182,156,255,.24);
      border-radius: 12px;
      background: #1b1731;
    }
    .intro-stage {
      position: absolute;
      top: 0;
      width: 384px;
      height: 216px;
      transform-origin: 0 0;
      image-rendering: pixelated;
    }
    .intro-stage > * { position: absolute; }
    .intro-stage__wall {
      inset: 0 0 88px 0;
      background: repeating-linear-gradient(90deg, #2b2547 0 31px, #241f3d 31px 32px);
      box-shadow: inset 0 6px 0 #1d1934, inset 0 -4px 0 #1a1630;
    }
    .intro-stage__window {
      left: 28px;
      top: 30px;
      width: 64px;
      height: 44px;
      background: linear-gradient(#0b1533, #1a2a55);
      box-shadow: 0 0 0 2px #4b4378;
    }
    .intro-stage__window::after {
      content: '';
      position: absolute;
      left: 31px;
      top: 0;
      width: 2px;
      height: 100%;
      background: #4b4378;
    }
    .intro-stage__moon {
      position: absolute;
      left: 12px;
      top: 8px;
      width: 6px;
      height: 6px;
      background: #e8e4c9;
      box-shadow: 30px 4px 0 -2px #cfd6ff, 42px 16px 0 -2px #cfd6ff;
    }
    .intro-stage__floor {
      left: 0;
      right: 0;
      bottom: 0;
      height: 88px;
      background:
        repeating-linear-gradient(90deg, transparent 0 23px, rgba(0,0,0,.2) 23px 24px),
        repeating-linear-gradient(180deg, #3a3462 0 11px, #332d58 11px 12px);
    }
    .intro-stage__pool {
      top: 142px;
      width: 88px;
      height: 18px;
      border-radius: 50%;
      background: radial-gradient(closest-side, rgba(255,236,170,.16), transparent);
    }
    .intro-stage__door { left: 300px; top: 64px; }
    .intro-stage__chair { left: 104px; top: 96px; }
    .intro-stage__plant { left: 250px; top: 76px; }
    .intro-stage__lamp {
      top: 0;
      width: 18px;
      height: 20px;
      background: linear-gradient(#0f0c1d, #0f0c1d) 8px 0 / 2px 14px no-repeat;
    }
    .intro-stage__lamp::before {
      content: '';
      position: absolute;
      left: 0;
      top: 14px;
      width: 18px;
      height: 6px;
      border-radius: 3px 3px 0 0;
      background: #d9d2b8;
    }
    .intro-stage__cone {
      position: absolute;
      left: -32px;
      top: 20px;
      width: 82px;
      height: 108px;
      clip-path: polygon(40% 0, 60% 0, 100% 100%, 0 100%);
      background: linear-gradient(rgba(255,236,170,.2), rgba(255,236,170,.03));
    }
    /* Pies en y=184 (pivote v1 68/72): pisa el piso, entre las dos lámparas. */
    .intro-actor {
      left: 0;
      top: 116px;
      width: 48px;
      height: 72px;
      transform: translateX(168px);
    }
    .intro-actor--walking { animation: intro-walk 3600ms linear both; }
    .intro-actor__layer {
      position: absolute;
      inset: 0;
      background-repeat: no-repeat;
      background-position: var(--frame-x, 0) var(--frame-y, 0);
      image-rendering: auto;
    }
    .intro-actor--pixel .intro-actor__layer { image-rendering: pixelated; }
    .intro-scene__caption {
      position: absolute;
      left: 12px;
      bottom: 10px;
      margin: 0;
      padding: 4px 8px;
      border-radius: 6px;
      background: rgba(5,8,14,.72);
      color: rgba(244,247,251,.86);
      font-size: .74rem;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      animation: intro-caption-in 400ms var(--psy-ease-out) 500ms both;
    }
    @keyframes intro-walk {
      from { transform: translateX(-48px); }
      to   { transform: translateX(168px); }
    }
    @keyframes intro-caption-in {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: none; }
    }
  `],
})
export class CaseIntroSceneComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Con movimiento reducido el personaje ya está en su sitio, de frente y quieto. */
  readonly reduceMotion = input(false);

  private readonly zone = inject(NgZone);
  private readonly store = inject(AvatarStore);
  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');
  private readonly actorEl = viewChild.required<ElementRef<HTMLElement>>('actorEl');

  readonly lamps = LAMP_CENTERS;
  readonly actor = computed(() => introActor(this.store.avatar()));
  readonly phase = signal<'walk' | 'idle'>('walk');
  readonly phaseSheet = computed(() => (this.phase() === 'walk' ? this.actor().walk : this.actor().idle));
  readonly layout = signal(stageLayout(INTRO_STAGE_WIDTH, INTRO_STAGE_HEIGHT));

  private frameId = 0;
  private phaseStartedAt: number | null = null;
  private lastFrame = -1;
  private resizeObserver?: ResizeObserver;

  ngOnInit(): void {
    if (this.reduceMotion()) this.phase.set('idle');
  }

  ngAfterViewInit(): void {
    this.applyFrame(0);
    if (typeof ResizeObserver !== 'undefined') {
      this.zone.runOutsideAngular(() => {
        this.resizeObserver = new ResizeObserver(() => this.zone.run(() => this.measure()));
        this.resizeObserver.observe(this.viewport().nativeElement);
      });
    }
    if (this.reduceMotion()) return;
    this.zone.runOutsideAngular(() => {
      this.frameId = requestAnimationFrame(now => this.tick(now));
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver?.disconnect();
  }

  /** Fin del `intro-walk` del propio actor: pasa a reposo de frente. */
  onWalkEnd(event: Event): void {
    if (event.target !== event.currentTarget || this.phase() !== 'walk') return;
    this.phase.set('idle');
    this.phaseStartedAt = null;
    this.applyFrame(0);
  }

  private measure(): void {
    const next = stageLayout(this.viewport().nativeElement.clientWidth, window.innerHeight * STAGE_HEIGHT_SHARE);
    const current = this.layout();
    if (next.scale !== current.scale || next.frameWidth !== current.frameWidth) this.layout.set(next);
  }

  private tick(now: number): void {
    this.phaseStartedAt ??= now;
    const sheet = this.phaseSheet();
    const frame = frameAt(now - this.phaseStartedAt, sheet.fps, sheet.frames.length);
    if (frame !== this.lastFrame) this.applyFrame(frame);
    this.frameId = requestAnimationFrame(next => this.tick(next));
  }

  private applyFrame(index: number): void {
    const frame = this.phaseSheet().frames[index] ?? { x: 0, y: 0 };
    const style = this.actorEl().nativeElement.style;
    style.setProperty('--frame-x', `${-frame.x}px`);
    style.setProperty('--frame-y', `${-frame.y}px`);
    this.lastFrame = index;
  }
}
```

(`${-0}px` produce `"0px"`, que es lo que esperan las pruebas.)

- [ ] **Step 4: Ejecutar el spec y verlo pasar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/case-intro-scene.component.spec.ts`
Expected: PASS (6 pruebas).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/simulator/case-intro-scene.component.ts frontend/src/app/features/simulator/case-intro-scene.component.spec.ts
git commit -m "feat(intro): escena animada en código con el personaje del jugador"
```

---

### Task 4: Conectar la escena, quitar el video y el nombre de la pista

**Files:**
- Modify: `frontend/src/app/features/simulator/intro-gate.util.ts` y `intro-gate.util.spec.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts` (import línea 3; imports del componente; constantes 43-45; plantilla 158-193; estilos 605-689, 728-738 y 909-915; señales 969-974; `ngOnDestroy` ~1043; manejador global ~1172-1185; `applyIntroStep` ~1936; `toggleMusicMute` ~1739; métodos 1966-1986)
- Modify: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts` (tipo y mock de `audio`, línea 211, dos pruebas nuevas)
- Create: `frontend/src/app/features/simulator/simulation-play.intro.contract.spec.ts`
- Delete: `frontend/src/assets/video/fondoHabitacion.mp4`

**Interfaces:**
- Consumes: `CaseIntroSceneComponent` (tarea 3).
- Produces: `IntroGateStep = 'consent' | 'scene' | 'narrative' | 'none'`; en `SimulationPlayComponent`: `showIntroScene` (signal) y `continueFromIntroScene()`. Desaparecen `showIntroVideo`, `introVideoEnded`, `introVideoSrc`, `caseIntroAudio`, `playIntroVideo`, `onIntroVideoEnded` y `continueFromIntroVideo`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `frontend/src/app/features/simulator/simulation-play.intro.contract.spec.ts`:

```ts
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

describe('simulation-play: introducción', () => {
  it('la intro es una escena animada en código, no un video', () => {
    expect(source).toContain('<app-case-intro-scene [reduceMotion]="reduceMotion()" />');
    expect(source).not.toContain('<video');
    expect(source).not.toContain('fondoHabitacion');
    expect(existsSync(join(__dirname, '../../../assets/video/fondoHabitacion.mp4'))).toBe(false);
  });

  it('conserva el contrato de los e2e: «Antes de comenzar» con un botón «Continuar»', () => {
    expect(source).toContain('<h2 id="intro-scene-title">Antes de comenzar</h2>');
    expect(source).toMatch(/\(click\)="continueFromIntroScene\(\)">\s*Continuar\s*<\/button>/);
    expect(source).not.toContain('Saltar video');
  });

  it('ninguna tarjeta nombra la pista interna y ambas permiten silenciar la música', () => {
    expect(source).not.toContain('está sonando');
    expect(source).not.toContain('PsicoLament');
    const toggles = source.match(/class="intro-music-toggle" \[attr\.aria-pressed\]="musicMuted\(\)" \(click\)="toggleMusicMute\(\)"/g) ?? [];
    expect(toggles).toHaveLength(2);
  });

  it('los anuncios de música llevan tilde', () => {
    expect(source).toContain("'Música silenciada.'");
    expect(source).toContain("'Música activada.'");
  });
});
```

En `frontend/src/app/features/simulator/intro-gate.util.spec.ts`, reemplazar:

```ts
    it('tras consentir muestra el video en el nodo inicial', () => {
      expect(resolveIntroStep(ctx({ consentGiven: true }))).toBe('video');
```

por:

```ts
    it('tras consentir muestra la escena animada en el nodo inicial', () => {
      expect(resolveIntroStep(ctx({ consentGiven: true }))).toBe('scene');
```

y cambiar el título `'tras consentir con reduceMotion muestra la narrativa (sin video)'` por `'tras consentir con reduceMotion muestra la narrativa (sin escena)'`.

En `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`:

1. En el tipo de `audio`, después de `    playSfx: jest.Mock;`, añadir `    toggleMusicMuted: jest.Mock;`.
2. En el objeto `audio = { ... }` de `setup()`, después de `      playSfx: jest.fn(),`, añadir `      toggleMusicMuted: jest.fn(() => false),`.
3. Reemplazar `    expect(component.showIntroVideo()).toBe(false);` por `    expect(component.showIntroScene()).toBe(false);`.
4. Justo después del `it('no cancela Enter sobre un botón nativo cuando un diálogo bloquea el mundo', …)` completo, añadir:

```ts
  it('Enter sobre un botón de la tarjeta del caso lo activa en vez de saltar la tarjeta', () => {
    setup(makeAttempt());
    component.showCaseIntro.set(true);
    const button = document.createElement('button');
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    Object.defineProperty(event, 'target', { value: button });

    component.handleGlobalInteraction(event);

    expect(event.defaultPrevented).toBe(false);
    expect(component.showCaseIntro()).toBe(true);
  });

  it('activar la música durante la intro vuelve a su tema, no a la música del mapa', () => {
    setup(makeAttempt());
    component.showCaseIntro.set(true);

    component.toggleMusicMute();

    expect(audio.playIntroLament).toHaveBeenCalled();
    expect(audio.setStressLevel).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Ejecutar las pruebas y verlas fallar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/simulation-play.intro.contract.spec.ts src/app/features/simulator/intro-gate.util.spec.ts src/app/features/simulator/simulation-play.consent-gate.spec.ts`
Expected: FAIL (contrato; `'video'` ≠ `'scene'`; `showIntroScene` no existe; las dos pruebas nuevas).

- [ ] **Step 3: Renombrar el paso del gate**

En `intro-gate.util.ts`:
- Línea 6: `Tras consentir, se conserva el flujo previo: video de intro (o narrativa` → `Tras consentir, se conserva el flujo previo: escena de intro (o narrativa`.
- Línea 10: `export type IntroGateStep = 'consent' | 'video' | 'narrative' | 'none';` → `export type IntroGateStep = 'consent' | 'scene' | 'narrative' | 'none';`.
- Línea 21: `/** Intro (video + narrativa) ya completada…` → `/** Intro (escena + narrativa) ya completada…`.
- Línea 23: `/** \`prefers-reduced-motion\`: la intro salta el video y va a la narrativa. */` → `/** \`prefers-reduced-motion\`: la intro salta la escena y va a la narrativa. */`.
- Línea 35: `return ctx.reduceMotion ? 'narrative' : 'video';` → `return ctx.reduceMotion ? 'narrative' : 'scene';`.

- [ ] **Step 4: Imports y constantes de `simulation-play.component.ts`**

1. Línea 3: quitar `ElementRef, ` del import de `@angular/core` (solo lo usaba el video).
2. Después de `import { AttemptOutcomeComponent } from './attempt-outcome.component';`, añadir:

```ts
import { CaseIntroSceneComponent } from './case-intro-scene.component';
```

3. En el array `imports` del `@Component`, reemplazar `ToolInventoryComponent, JournalPanelComponent, AttemptOutcomeComponent` por `ToolInventoryComponent, JournalPanelComponent, AttemptOutcomeComponent, CaseIntroSceneComponent`.
4. Borrar las líneas `const SIMULATOR_INTRO_VIDEO = 'assets/video/fondoHabitacion.mp4';` y `const CASE_INTRO_AUDIO = 'PsicoLament';`.

- [ ] **Step 5: Plantilla**

Reemplazar el bloque completo `@if (showIntroVideo()) { … }` (desde `        @if (showIntroVideo()) {` hasta su `        }` de cierre, antes de `        @if (showCaseIntro()) {`) por:

```html
        @if (showIntroScene()) {
          <section class="case-intro-overlay" role="dialog" aria-modal="true" aria-labelledby="intro-scene-title">
            <article class="case-intro-card case-intro-card--scene" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
              <header class="case-intro-card__header">
                <p class="psy-eyebrow">Introducción</p>
                <h2 id="intro-scene-title">Antes de comenzar</h2>
              </header>

              <div class="case-intro-card__media">
                <app-case-intro-scene [reduceMotion]="reduceMotion()" />
              </div>

              <footer class="case-intro-card__actions">
                <button type="button" class="intro-music-toggle" [attr.aria-pressed]="musicMuted()" (click)="toggleMusicMute()">
                  <mat-icon aria-hidden="true">{{ musicMuted() ? 'music_off' : 'music_note' }}</mat-icon>
                  <span>Silenciar música</span>
                </button>
                <button cdkFocusInitial class="psy-button psy-button--primary" type="button" (click)="continueFromIntroScene()">
                  Continuar
                </button>
              </footer>
            </article>
          </section>
        }
```

En la tarjeta del caso, reemplazar:

```html
                <span>{{ caseIntroAudio }} está sonando</span>
```

por:

```html
                <button type="button" class="intro-music-toggle" [attr.aria-pressed]="musicMuted()" (click)="toggleMusicMute()">
                  <mat-icon aria-hidden="true">{{ musicMuted() ? 'music_off' : 'music_note' }}</mat-icon>
                  <span>Silenciar música</span>
                </button>
```

- [ ] **Step 6: Estilos**

1. Borrar todas las reglas `.intro-video-overlay`, `.intro-video-card`, `.intro-video-card__header`, `.intro-video-card__header h2`, `.intro-video-card__header span`, `.intro-video-card__media`, `.intro-video`, `.intro-video-card__actions`, `.intro-video-card__actions span` y `.intro-video-card__actions .psy-button` (bloque ~605-689).
2. En el `@media` móvil (~909-915), borrar las cinco líneas/reglas `.intro-video-overlay …`, `.intro-video-card …`, `.intro-video-card__actions { … }` y `.intro-video-card__actions .psy-button …`.
3. Reemplazar la regla `.case-intro-card__header span { … }` completa (~728-738) por:

```css
    .intro-music-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      width: fit-content;
      min-height: 44px;
      padding: 0 14px;
      border: 1px solid rgba(108,192,199,.32);
      border-radius: 999px;
      color: #bdeef2;
      background: rgba(108,192,199,.1);
      font: inherit;
      font-size: .8rem;
      font-weight: 700;
      cursor: pointer;
      transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
    }
    .intro-music-toggle[aria-pressed="true"] {
      color: rgba(244,247,251,.7);
      border-color: rgba(244,247,251,.24);
      background: transparent;
    }
    .intro-music-toggle mat-icon { width: 18px; height: 18px; font-size: 18px; }
    @media (hover: hover) and (pointer: fine) {
      .intro-music-toggle:hover { background: rgba(108,192,199,.18); }
    }
    .case-intro-card--scene { width: min(860px, 100%); max-height: min(88vh, 760px); }
    .case-intro-card__media {
      min-height: 0;
      display: grid;
      place-items: center;
      padding: 12px clamp(14px, 3vw, 24px);
      background: #05080e;
    }
```

- [ ] **Step 7: Señales y ciclo de vida**

Reemplazar:

```ts
  readonly showIntroVideo = signal(false);
  readonly introVideoEnded = signal(false);
  readonly introVideoSrc = SIMULATOR_INTRO_VIDEO;
  readonly showCaseIntro = signal(false);
  readonly caseIntroTitle = CASE_INTRO_TITLE;
  readonly caseIntroAudio = CASE_INTRO_AUDIO;
```

por:

```ts
  readonly showIntroScene = signal(false);
  readonly showCaseIntro = signal(false);
  readonly caseIntroTitle = CASE_INTRO_TITLE;
```

Borrar la línea `  @ViewChild('introVideo')   private introVideoRef?: ElementRef<HTMLVideoElement>;`.

En `ngOnDestroy()`, borrar la línea `    this.introVideoRef?.nativeElement?.pause();`.

En `inputBlocked`, reemplazar `this.showIntroVideo()` por `this.showIntroScene()`.

- [ ] **Step 8: Teclado de las tarjetas**

En `handleGlobalInteraction`, reemplazar:

```ts
    if (this.showIntroVideo()) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.continueFromIntroVideo();
      }
      return;
    }

    if (this.showCaseIntro()) {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.continueFromCaseIntro();
      }
      return;
    }
```

por:

```ts
    if (this.showIntroScene() || this.showCaseIntro()) {
      // Los botones de las tarjetas (Continuar, Silenciar música) se activan solos.
      if (tag === 'BUTTON' || tag === 'A') return;
      if (this.showIntroScene() && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        this.continueFromIntroScene();
      } else if (this.showCaseIntro() && event.key === 'Enter') {
        event.preventDefault();
        this.continueFromCaseIntro();
      }
      return;
    }
```

- [ ] **Step 9: Flujo y música**

En `applyIntroStep`, reemplazar:

```ts
      case 'video':
        this.introVideoEnded.set(false);
        this.showIntroVideo.set(true);
        return;
```

por:

```ts
      case 'scene':
        this.showIntroScene.set(true);
        // El tema acompaña la escena y sigue en la tarjeta del caso.
        this.audioDirector.playIntroLament();
        return;
```

Reemplazar los métodos `playIntroVideo()`, `onIntroVideoEnded()` y `continueFromIntroVideo()` completos por:

```ts
  continueFromIntroScene(): void {
    this.showIntroScene.set(false);
    this.revealCaseIntro();
  }
```

(`revealCaseIntro()` vuelve a llamar a `playIntroLament()`, que no reinicia la pista si ya suena.)

Reemplazar `toggleMusicMute()` completo:

```ts
  toggleMusicMute(): void {
    const muted = this.audioDirector.toggleMusicMuted();
    this.musicMuted.set(muted);
    if (!muted) this.audioDirector.setStressLevel(this.attempt()?.stressIndex ?? 0);
    this.announce(muted ? 'Musica silenciada.' : 'Musica activada.');
  }
```

por:

```ts
  toggleMusicMute(): void {
    const muted = this.audioDirector.toggleMusicMuted();
    this.musicMuted.set(muted);
    if (!muted) {
      // Durante la intro vuelve su tema; en la partida, la música adaptativa del mapa.
      if (this.showIntroScene() || this.showCaseIntro()) this.audioDirector.playIntroLament();
      else this.audioDirector.setStressLevel(this.attempt()?.stressIndex ?? 0);
    }
    this.announce(muted ? 'Música silenciada.' : 'Música activada.');
  }
```

- [ ] **Step 10: Borrar el video**

```bash
git rm frontend/src/assets/video/fondoHabitacion.mp4
```

- [ ] **Step 11: Ejecutar las pruebas y verlas pasar**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator`
Expected: PASS (todo el directorio del simulador).

- [ ] **Step 12: Build y e2e**

Run: `npm run build:frontend`
Expected: sin errores ni avisos nuevos de presupuesto.

Run: `npm run test:e2e -- vertical-quality living-world`
Expected: PASS. Los e2e encuentran «Antes de comenzar» y pulsan «Continuar» sin cambios, y axe no marca la escena (`role="img"` con nombre; imágenes decorativas con `alt=""`).

- [ ] **Step 13: Commit**

```bash
git add frontend/src/app/features/simulator/intro-gate.util.ts frontend/src/app/features/simulator/intro-gate.util.spec.ts frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts frontend/src/app/features/simulator/simulation-play.intro.contract.spec.ts
git commit -m "feat(intro): la escena reemplaza al video y la música se silencia desde las tarjetas"
```

---

## Verificación final

- [ ] `npm run test:frontend` → todo en verde.
- [ ] `npm run build:frontend` → sin errores; el bundle ya no copia `assets/video/`.
- [ ] `npm run test:e2e` → la suite completa en verde.
- [ ] **Comprobación a mano** (Chrome; entrar a un caso nuevo desde `/portal/jugar`):
  1. Con Valentina: tras el consentimiento, la escena muestra a Valentina entrando por la izquierda. Camina 3,6 s y queda de frente respirando, entre las dos lámparas. El tema suena desde el inicio.
  2. En el editor de personaje, elegir Paula; en un intento nuevo, la escena muestra a Paula.
  3. En DevTools, emular 390×844: el escenario sale a 1×, recortado por los lados, y la puerta se ve entera.
  4. En 1366×768, la tarjeta cabe sin barra de desplazamiento y el escenario sale a 2×.
  5. Pulsar «Silenciar música» (con clic y con Tab + Espacio): la música se corta, el botón queda en estado presionado y la tarjeta no avanza. Continuar a la tarjeta del caso y reactivar: vuelve el tema de la intro, no la música del mapa.
  6. DevTools → Network: no se pide ningún `.mp4`. `PsicoLament.mp3` pesa unos 2,5 MB y llega como *media* (HTML5), no como `fetch`/XHR.
  7. DevTools → Performance, grabar la escena: una sola tarea de Angular al terminar la caminata, no una por cuadro.
