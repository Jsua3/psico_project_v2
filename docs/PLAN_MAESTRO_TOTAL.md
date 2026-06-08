# PLAN MAESTRO TOTAL — SIEP
## Sistema de Entrenamiento Psicosocial
### Corporación Universitaria Empresarial Alexander Von Humboldt

**Versión:** 1.0  
**Fecha:** 2026-06-07  
**Estado del proyecto al momento de este plan:** ~55–60% de cumplimiento  
**Destino de cumplimiento:** 100% de todos los RQ-NEG, RNF, RF-027 y especificaciones visuales 2.5D

---

## CÓMO USAR ESTE DOCUMENTO

Este documento es la **biblia operativa** del proyecto SIEP. Tiene dos audiencias:

1. **Claude Code (agente de implementación de código):** Lee la sección `## PARA CLAUDE CODE`. Cada bloque tiene contexto exacto, archivos afectados, código de referencia, y criterio de "done". Sigue el orden de los bloques —algunos dependen de anteriores. Lee los archivos mencionados antes de hacer cambios. Nunca toques el backend Spring (`backend/`). Nunca generes migraciones Django (los modelos usan `managed=False`).

2. **ChatGPT / agente generador de assets visuales:** Lee la sección `## PARA CHATGPT — ASSETS VISUALES`. Cada sub-sección te dice exactamente qué generar, en qué resolución, con qué paleta, cuántos frames, cómo nombrar los archivos, y dónde colocarlos. El estilo es **pixel-art 2.5D, perspectiva 3/4, sin antialiasing**.

---

## REGLAS DE ORO — NO NEGOCIABLES

Estas reglas aplican a TODOS los cambios. Violarlas rompe el sistema.

```
REGLA-001: NUNCA tocar backend/ (Spring). Está congelado. Solo Django.
REGLA-002: NUNCA crear migraciones Django. Los modelos usan managed=False (RNF-010).
           Si necesitas persistencia nueva → usa localStorage o un campo JSON existente.
REGLA-003: ScenarioConfig coexiste con el sistema BD-driven (T3.1). No eliminar ninguno.
REGLA-004: La salida segura (safe_exit) SIEMPRE debe ser alcanzable para el estudiante,
           sin importar el nivel de estrés o el estado del caso.
REGLA-005: Las versiones PUBLISHED nunca se mutan. Solo se clonan (clone-version).
REGLA-006: Los audit_logs nunca interrumpen operaciones. Son fire-and-forget via signals.
REGLA-007: El repositorio DEBE ser privado. Tiene datos de dominio clínico. 
           Hacer privado en GitHub/GitLab antes de cualquier deploy.
REGLA-008: Avatar del estudiante → solo localStorage. Nunca en DB.
REGLA-009: Phaser config SIEMPRE con pixelArt: true, roundPixels: true, zoom 2x.
REGLA-010: Todo CSS del juego dentro de .game-container (scoped). No contaminar Angular global.
REGLA-011: Locking optimista: campo version en case_versions. Retornar 409 en conflicto.
REGLA-012: Antes de publicar un caso: WorldValidationService debe pasar sin errores.
```

---

## AUDITORÍA DE ESTADO ACTUAL

### ✅ QUÉ EXISTE Y FUNCIONA

| Componente | Archivo(s) | Estado |
|---|---|---|
| HUD líquido-glass | `simulation-hud.component.ts` | ✅ Completo |
| Panel de diálogo con typewriter | `dialogue-panel.component.ts` | ✅ Base funcional |
| Pantalla de resultados | `outcome-screen.component.ts` | ✅ Funcional |
| Editor de personaje (avatar) | `character-editor.component.ts` | ✅ Funcional (SVG placeholder) |
| World Editor Konva + undo/redo | `world-editor.store.ts` | ✅ Completo |
| World Preview efímero | `world-preview.component.ts` | ✅ Funcional |
| Motor Phaser DataDrivenWorldScene | `game-world.component.ts` | ✅ Base funcional |
| NPC con AmbientMover | `game-world.component.ts` | ✅ Funcional |
| Transiciones de sala (ScenarioConfig) | `game-world.component.ts` | ✅ Funcional |
| Audio básico (HTMLAudioElement) | `audio.service.ts` | ✅ Básico |
| WorldValidationService | `world_validation.py` | ✅ Completo |
| AuthoringService | `authoring_service.py` | ✅ Completo |
| GameService (port de Spring) | `game_service.py` | ✅ Completo |
| Audit logs (Django signals) | `signals.py` | ✅ Completo |
| Optimistic lock (version) | `models/case.py` | ✅ Completo |
| Workflow DRAFT→PUBLISHED | `authoring_service.py` | ✅ Completo |

### 🔧 QUÉ EXISTE PERO NECESITA ARREGLO O COMPLETADO

| Componente | Problema | Bloque de plan |
|---|---|---|
| `dialogue-panel.component.ts` | Sin modulación texto-como-síntoma, sin retratos dinámicos, sin QTE interrupciones | Bloque C |
| `audio.service.ts` | Sin Howler.js, sin stems adaptativos, sin AudioDirector | Bloque A |
| `game-world.component.ts` | Sin WebGL vignette pipeline, sin GameFeelSystem, avatar no conectado | Bloque B, D |
| `character-editor.component.ts` | SVG placeholder no conectado a sprite Phaser en juego | Bloque D |
| Repositorio | Público (crítico para dominio clínico) | Bloque L |

### ❌ QUÉ NO EXISTE Y HAY QUE AGREGAR

| Componente | Requisito origen | Bloque de plan |
|---|---|---|
| AudioDirector con Howler.js | PLAN_MAESTRO_EJECUCION_V3 Fase 3 | Bloque A |
| Social Mapping (sub-proyecto G) | psychosocial-sim-roadmap G | Bloque E |
| Verbal Tension Box (sub-proyecto I) | psychosocial-sim-roadmap I | Bloque F |
| RF-027: Asistente IA contextual | RF-027.md | Bloque G |
| WCAG 2.1 AA (contraste, teclado, screen reader) | RNF-004 | Bloque H |
| CI quality gates (GitHub Actions) | RNF-008, PLAN_MAESTRO Fase 8 | Bloque I |
| Avatar pixel-art conectado a Phaser | PROMPT_SIEP_2_5D Sección avatar | Bloque D |
| Semillas adicionales de escenarios (hospital, comisaría, hogar) | PROMPT_SIEP_2_5D Sección escenarios | Bloque J |
| Landing page refinada | RQ-NEG-001, RNF-001 | Bloque K |
| Textos de accesibilidad (aria, skip-links, focus rings) | RNF-004 | Bloque H |

### 🗑️ QUÉ HAY QUE ELIMINAR

| Elemento | Razón | Acción |
|---|---|---|
| Apps Python legacy de quiz (casos/sesiones) | T3.2: RETIRED. Tablas quedan por retención, código Python eliminado | Verificar que ya están eliminadas. Si no → `git rm` los archivos de apps |
| Cualquier referencia a `backend/` (Spring) en README o scripts | Spring DEFERRED hasta que Django esté en producción | Actualizar docs de "cómo correr" |
| Código muerto en `game-world.component.ts` (imports no usados, TODOs de Howler sin implementar) | Deuda técnica | Limpiar al implementar Bloque A |

---

## PARA CLAUDE CODE

> **Instrucciones de lectura:** Antes de ejecutar cualquier bloque, lee los archivos mencionados en "Archivos a leer primero". Ejecuta un bloque completo antes de pasar al siguiente. Corre `ng build` y los tests después de cada bloque.

---

### BLOQUE A — AudioDirector con Howler.js (Música Adaptativa)

**Requisito:** PLAN_MAESTRO_EJECUCION_V3 Fase 3. RQ-NEG-004 (satisfacción ≥85%).

**Archivos a leer primero:**
- `frontend/src/app/features/simulator/audio.service.ts` (reemplazar completamente)
- `frontend/package.json` (verificar si Howler ya está en deps)

**Qué hacer:**

1. Instalar Howler si no está:
```bash
cd frontend && npm install howler @types/howler
```

2. Crear `frontend/src/app/features/simulator/audio-director.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { Howl, Howler } from 'howler';
import { toSignal } from '@angular/core/rxjs-interop';
import { SimulationStore } from './simulation.store'; // ajustar path si difiere

export type MusicLayer = 'ambient' | 'tension' | 'resolution' | 'crisis';
export type SoundEffect = 'footstep_tile' | 'footstep_wood' | 'door_open' | 
  'ui_select' | 'ui_confirm' | 'ui_cancel' | 'dialogue_advance' | 
  'stress_high' | 'crisis_start' | 'session_complete';

interface StemTrack {
  howl: Howl;
  volume: number;
  targetVolume: number;
}

@Injectable({ providedIn: 'root' })
export class AudioDirectorService {
  private stems = new Map<MusicLayer, StemTrack>();
  private sfx = new Map<SoundEffect, Howl>();
  private masterVolume = 1.0;
  private musicVolume = 0.7;
  private sfxVolume = 0.8;
  private fadeInterval?: number;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Inicializar stems de música.
  // Los archivos de audio SON CREADOS POR EL EQUIPO DE DISEÑO (ver sección ChatGPT).
  // Mientras no existan, usar rutas a archivos CC0 de Kenney o silencio.
  init(): void {
    const stemFiles: Record<MusicLayer, string> = {
      ambient:    'assets/audio/music/siep_ambient.ogg',
      tension:    'assets/audio/music/siep_tension.ogg',
      resolution: 'assets/audio/music/siep_resolution.ogg',
      crisis:     'assets/audio/music/siep_crisis.ogg',
    };

    for (const [layer, src] of Object.entries(stemFiles) as [MusicLayer, string][]) {
      const howl = new Howl({
        src: [src],
        loop: true,
        volume: 0,
        preload: true,
        onloaderror: (_, err) => console.warn(`[AudioDirector] No se pudo cargar ${src}:`, err),
      });
      this.stems.set(layer, { howl, volume: 0, targetVolume: 0 });
    }

    const sfxFiles: Record<SoundEffect, string> = {
      footstep_tile:   'assets/audio/sfx/footstep_tile.ogg',
      footstep_wood:   'assets/audio/sfx/footstep_wood.ogg',
      door_open:       'assets/audio/sfx/door_open.ogg',
      ui_select:       'assets/audio/sfx/ui_select.ogg',
      ui_confirm:      'assets/audio/sfx/ui_confirm.ogg',
      ui_cancel:       'assets/audio/sfx/ui_cancel.ogg',
      dialogue_advance:'assets/audio/sfx/dialogue_advance.ogg',
      stress_high:     'assets/audio/sfx/stress_high.ogg',
      crisis_start:    'assets/audio/sfx/crisis_start.ogg',
      session_complete:'assets/audio/sfx/session_complete.ogg',
    };

    for (const [key, src] of Object.entries(sfxFiles) as [SoundEffect, string][]) {
      this.sfx.set(key, new Howl({ 
        src: [src], 
        volume: this.sfxVolume,
        preload: true,
        onloaderror: (_, err) => console.warn(`[AudioDirector] SFX error ${src}:`, err),
      }));
    }

    this.startFadeLoop();
  }

  // Llamar cuando cambia el nivel de tensión/estrés del paciente (0-100).
  // AudioDirector transiciona suavemente entre stems.
  setStressLevel(stress: number): void {
    // stress 0-30: solo ambient
    // stress 31-60: ambient + tension fade in
    // stress 61-85: tension dominante
    // stress 86-100: crisis
    const stems = this.stems;
    
    if (stress <= 30) {
      this.setTargetVolume('ambient', 1.0);
      this.setTargetVolume('tension', 0);
      this.setTargetVolume('resolution', 0);
      this.setTargetVolume('crisis', 0);
    } else if (stress <= 60) {
      const t = (stress - 30) / 30;
      this.setTargetVolume('ambient', 1.0 - t * 0.5);
      this.setTargetVolume('tension', t);
      this.setTargetVolume('resolution', 0);
      this.setTargetVolume('crisis', 0);
    } else if (stress <= 85) {
      this.setTargetVolume('ambient', 0.2);
      this.setTargetVolume('tension', 1.0);
      this.setTargetVolume('resolution', 0);
      this.setTargetVolume('crisis', 0);
    } else {
      this.setTargetVolume('ambient', 0);
      this.setTargetVolume('tension', 0.3);
      this.setTargetVolume('resolution', 0);
      this.setTargetVolume('crisis', 1.0);
    }

    // Asegurar que todos los stems están sonando
    stems.forEach(stem => {
      if (!stem.howl.playing()) stem.howl.play();
    });
  }

  // Llamar al resolver el caso exitosamente
  playResolution(): void {
    this.setTargetVolume('ambient', 0.3);
    this.setTargetVolume('tension', 0);
    this.setTargetVolume('resolution', 1.0);
    this.setTargetVolume('crisis', 0);
    this.stems.get('resolution')?.howl.play();
  }

  playSfx(effect: SoundEffect): void {
    if (this.reducedMotion && (effect === 'footstep_tile' || effect === 'footstep_wood')) return;
    this.sfx.get(effect)?.play();
  }

  setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    Howler.volume(this.masterVolume);
  }

  pause(): void { this.stems.forEach(s => s.howl.pause()); }
  resume(): void { this.stems.forEach(s => { if (!s.howl.playing()) s.howl.play(); }); }
  stopAll(): void { 
    this.stems.forEach(s => s.howl.stop()); 
    if (this.fadeInterval) clearInterval(this.fadeInterval);
  }

  private setTargetVolume(layer: MusicLayer, vol: number): void {
    const stem = this.stems.get(layer);
    if (stem) stem.targetVolume = vol * this.musicVolume;
  }

  // Loop de interpolación de volumen (60fps equivalente)
  private startFadeLoop(): void {
    const FADE_SPEED = 0.02; // por frame ~33ms → ~1.5s para fade completo
    this.fadeInterval = window.setInterval(() => {
      this.stems.forEach(stem => {
        const diff = stem.targetVolume - stem.volume;
        if (Math.abs(diff) > 0.001) {
          stem.volume += diff * FADE_SPEED;
          stem.howl.volume(Math.max(0, Math.min(1, stem.volume)));
        }
      });
    }, 33);
  }
}
```

3. Reemplazar `audio.service.ts` con un re-export que use `AudioDirectorService` para compatibilidad backward:
```typescript
// audio.service.ts — thin wrapper de compatibilidad
export { AudioDirectorService as AudioService } from './audio-director.service';
```

4. En `game-world.component.ts`, reemplazar todos los usos de `AudioService` por `AudioDirectorService`. Buscar las llamadas a `playSound('footstep')` etc. y mapearlas a los nuevos `SoundEffect` types.

5. Conectar `setStressLevel` al stream de estrés del store de simulación. En el lugar donde se actualiza el estrés del paciente (probablemente en `handleDecision` o en un efecto), llamar:
```typescript
this.audioDirector.setStressLevel(newStressValue);
```

6. Crear `frontend/src/assets/audio/` con la siguiente estructura de carpetas:
```
assets/audio/
├── music/
│   ├── siep_ambient.ogg       ← PLACEHOLDER (ver sección ChatGPT Bloque A)
│   ├── siep_tension.ogg
│   ├── siep_resolution.ogg
│   └── siep_crisis.ogg
└── sfx/
    ├── footstep_tile.ogg      ← Kenney CC0 mientras llega el definitivo
    ├── footstep_wood.ogg
    ├── door_open.ogg
    ├── ui_select.ogg
    ├── ui_confirm.ogg
    ├── ui_cancel.ogg
    ├── dialogue_advance.ogg
    ├── stress_high.ogg
    ├── crisis_start.ogg
    └── session_complete.ogg
```
Los archivos de Kenney CC0 se obtienen de https://kenney.nl/assets/ui-audio. Descargar y copiar manualmente.

**Criterio de Done:**
- `ng build` sin errores
- La música cambia de stem al aumentar el estrés del paciente durante una sesión
- Los SFX suenan en footsteps y clicks de UI
- `prefers-reduced-motion` suprime footsteps
- No hay errores de consola (solo warnings de archivos no encontrados, que desaparecen al poner los OGG)

---

### BLOQUE B — WebGL Pipeline + GameFeelSystem

**Requisito:** PLAN_MAESTRO_EJECUCION_V3 Fase 3. Undertale-tier game feel.

**Archivos a leer primero:**
- `frontend/src/app/features/simulator/game-world.component.ts` (leer completo)
- Verificar si existe `frontend/src/app/features/simulator/game-feel.service.ts`

**Qué hacer:**

1. Crear `frontend/src/app/features/simulator/effects/vignette-pipeline.ts`:

```typescript
// Phaser WebGL pipeline para vignette oscura en los bordes
// Activar con: this.cameras.main.setRenderToTexture(vignettePipeline)
import Phaser from 'phaser';

export class VignettePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private _intensity: number = 0.4;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: 'VignettePipeline',
      fragShader: `
        precision mediump float;
        uniform sampler2D uMainSampler;
        uniform float uIntensity;
        varying vec2 outTexCoord;
        void main(void) {
          vec4 color = texture2D(uMainSampler, outTexCoord);
          vec2 uv = outTexCoord * (1.0 - outTexCoord.yx);
          float vig = uv.x * uv.y * 15.0;
          vig = pow(vig, uIntensity);
          gl_FragColor = vec4(color.rgb * vig, color.a);
        }
      `
    });
  }

  onBoot(): void {
    this.set1f('uIntensity', this._intensity);
  }

  setIntensity(v: number): void {
    this._intensity = v;
    this.set1f('uIntensity', v);
  }

  // Llamar en update para pulsar la vignette cuando hay crisis
  pulseForCrisis(time: number): void {
    const pulse = 0.3 + Math.sin(time * 0.003) * 0.15;
    this.setIntensity(pulse);
  }
}
```

2. Crear `frontend/src/app/features/simulator/effects/game-feel.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import Phaser from 'phaser';

@Injectable({ providedIn: 'root' })
export class GameFeelService {
  private scene?: Phaser.Scene;

  init(scene: Phaser.Scene): void {
    this.scene = scene;
  }

  // Shake de cámara suave al tomar decisión de alto impacto
  shakeCamera(intensity = 0.003, duration = 200): void {
    this.scene?.cameras.main.shake(duration, intensity);
  }

  // Flash blanco breve al entrar a una nueva sala
  flashTransition(color = 0xffffff, duration = 150): void {
    this.scene?.cameras.main.flash(duration, 
      (color >> 16) & 255, 
      (color >> 8) & 255, 
      color & 255
    );
  }

  // Fade out + fade in para transición entre escenarios
  async fadeTransition(onMidpoint: () => void): Promise<void> {
    return new Promise(resolve => {
      this.scene?.cameras.main.fadeOut(300, 0, 0, 0, (_: any, progress: number) => {
        if (progress === 1) {
          onMidpoint();
          this.scene?.cameras.main.fadeIn(300, 0, 0, 0);
          resolve();
        }
      });
    });
  }

  // Squish & stretch en sprite al recibir daño emocional
  squishSprite(sprite: Phaser.GameObjects.Sprite, duration = 120): void {
    this.scene?.tweens.add({
      targets: sprite,
      scaleX: 0.85,
      scaleY: 1.15,
      duration: duration / 2,
      yoyo: true,
      ease: 'Bounce.Out',
    });
  }

  // Input buffer: cola de entradas para que nunca se "pierda" una tecla
  // Usar en combinación con el handler de decisiones del diálogo
  private inputBuffer: string[] = [];
  bufferInput(key: string): void {
    this.inputBuffer.push(key);
    // Procesar en el siguiente frame
    setTimeout(() => {
      const next = this.inputBuffer.shift();
      if (next) this.processBufferedInput(next);
    }, 16);
  }
  private processBufferedInput(key: string): void {
    // Override en el componente que lo use mediante subclassing o DI
    console.debug('[GameFeel] buffered input:', key);
  }
}
```

3. En `game-world.component.ts`, dentro del método `create()` de la escena Phaser:
```typescript
// Al inicio de create()
import { VignettePipeline } from './effects/vignette-pipeline';

// Registrar pipeline
this.scene.renderer // Phaser.WebGLRenderer
  ?.addPipeline?.('VignettePipeline', new VignettePipeline(this.scene.game));
this.cameras.main.setPostPipeline('VignettePipeline');

// Guardar referencia para update
this.vignettePipeline = this.cameras.main.getPostPipeline('VignettePipeline') as VignettePipeline;
```

4. En el método `update()`:
```typescript
// Pulsar vignette si estrés > 85
if (this.currentStressLevel > 85) {
  this.vignettePipeline?.pulseForCrisis(this.time.now);
} else {
  this.vignettePipeline?.setIntensity(0.4);
}
```

**Criterio de Done:**
- Vignette oscura visible en los bordes durante el juego
- Vignette pulsa en rojo/violeta cuando estrés > 85
- Flash de transición al cambiar de sala
- Shake suave al tomar decisiones de alto impacto
- `ng build` sin errores

---

### BLOQUE C — Diálogo Texto-como-Síntoma + Retratos Dinámicos

**Requisito:** psychosocial-sim-roadmap sub-proyecto F (Expressive Dialogue). RQ-NEG-002.

**Archivos a leer primero:**
- `frontend/src/app/features/simulator/dialogue-panel.component.ts` (leer completo)
- `frontend/src/app/features/simulator/dialogue-panel.component.html`
- `frontend/src/app/features/simulator/dialogue-panel.component.scss`

**Qué hacer:**

1. Crear el tipo `DialogueEmotion` y sus parámetros visuales:

```typescript
// En dialogue-panel.component.ts, agregar:
export type DialogueEmotion = 
  | 'neutral' | 'ansiedad' | 'tristeza' | 'enojo' 
  | 'disociacion' | 'crisis' | 'alivio' | 'esperanza';

interface EmotionStyle {
  typingSpeed: number;      // ms por carácter
  color: string;            // color del texto
  wobble: boolean;          // texto con movimiento
  glitch: boolean;          // efecto glitch (disociacion/crisis)
  fontSize: string;         // puede achicarse en disociación
  opacity: number;          // puede bajar en disociación
}

const EMOTION_STYLES: Record<DialogueEmotion, EmotionStyle> = {
  neutral:     { typingSpeed: 30,  color: '#F4F7FB', wobble: false, glitch: false, fontSize: '14px', opacity: 1   },
  ansiedad:    { typingSpeed: 15,  color: '#F5B84B', wobble: true,  glitch: false, fontSize: '14px', opacity: 1   },
  tristeza:    { typingSpeed: 55,  color: '#8899BB', wobble: false, glitch: false, fontSize: '14px', opacity: 0.9 },
  enojo:       { typingSpeed: 10,  color: '#E25A4F', wobble: true,  glitch: false, fontSize: '15px', opacity: 1   },
  disociacion: { typingSpeed: 40,  color: '#9988BB', wobble: false, glitch: true,  fontSize: '13px', opacity: 0.7 },
  crisis:      { typingSpeed: 8,   color: '#E25A4F', wobble: true,  glitch: true,  fontSize: '15px', opacity: 1   },
  alivio:      { typingSpeed: 35,  color: '#6EC67A', wobble: false, glitch: false, fontSize: '14px', opacity: 1   },
  esperanza:   { typingSpeed: 32,  color: '#B69CFF', wobble: false, glitch: false, fontSize: '14px', opacity: 1   },
};
```

2. Modificar el método typewriter existente para aplicar estilos por emoción:

```typescript
// Reemplazar el método typewriter existente
private async typewriterWithEmotion(text: string, emotion: DialogueEmotion): Promise<void> {
  const style = EMOTION_STYLES[emotion];
  this.displayText = '';
  this.dialogueTextStyle = { 
    color: style.color,
    fontSize: style.fontSize,
    opacity: style.opacity 
  };
  
  for (let i = 0; i < text.length; i++) {
    if (this.skipTypewriter) {
      this.displayText = text;
      break;
    }
    this.displayText += text[i];
    
    // Efecto glitch: ocasionalmente mostrar carácter equivocado brevemente
    if (style.glitch && Math.random() < 0.05) {
      const glitchChar = '▓░▒'[Math.floor(Math.random() * 3)];
      const saved = this.displayText;
      this.displayText = saved.slice(0, -1) + glitchChar;
      await this.sleep(style.typingSpeed * 2);
      this.displayText = saved;
    }
    
    await this.sleep(style.typingSpeed);
  }
  this.isTypingComplete = true;
}

// CSS: en dialogue-panel.component.scss agregar:
// .dialogue-text.wobble { animation: wobble 0.3s infinite; }
// @keyframes wobble { 0%,100%{transform:translateX(0)} 50%{transform:translateX(2px)} }
```

3. Agregar soporte para retratos con microexpresiones. El portrait es una imagen sprite con filas de expresiones:

```typescript
// En el template HTML, reemplazar el placeholder SVG con:
// <img [src]="portraitSrc" [style.clip-path]="portraitClip" class="npc-portrait" />
// 
// portraitSrc apunta al sprite sheet del NPC (ver sección ChatGPT Bloque C)
// portraitClip recorta la fila/columna correcta según emoción

getPortraitStyle(emotion: DialogueEmotion): { [key: string]: string } {
  // Los sprite sheets de portrait son 5 columnas × N filas
  // Columnas: neutral(0), positivo(1), negativo(2), ansioso(3), crisis(4)
  const emotionToCol: Record<DialogueEmotion, number> = {
    neutral: 0, alivio: 1, esperanza: 1,
    tristeza: 2, enojo: 2,
    ansiedad: 3, disociacion: 3,
    crisis: 4,
  };
  const col = emotionToCol[emotion] ?? 0;
  const PORTRAIT_W = 64; // px por frame
  const PORTRAIT_H = 80;
  return {
    'background-position': `-${col * PORTRAIT_W}px 0px`,
    'width': `${PORTRAIT_W}px`,
    'height': `${PORTRAIT_H}px`,
  };
}
```

4. QTE de interrupción: Agregar soporte para `interruptionPrompt` en el contrato de diálogo:

```typescript
// Cuando el diálogo trae interruptionPrompt, mostrar un prompt urgente
// que el estudiante debe responder en X segundos o el NPC se cierra emocionalmente
@Input() interruptionConfig?: { 
  prompt: string; 
  timeoutMs: number;
  onSuccess: () => void;
  onTimeout: () => void;
};

// En el template: <div *ngIf="showInterruption" class="interruption-banner">
//   {{ interruptionConfig.prompt }}
//   <div class="countdown-bar" [style.width.%]="interruptionProgress"></div>
// </div>
```

**Criterio de Done:**
- Texto de tristeza: lento, color azulado
- Texto de crisis: rápido, rojo, con glitch ocasional
- Texto de ansiedad: rápido, dorado, con wobble CSS
- Portrait cambia de expresión según emoción del diálogo
- QTE de interrupción aparece con countdown visible
- `ng build` sin errores

---

### BLOQUE D — Avatar Pixel-Art Conectado a Phaser

**Requisito:** PROMPT_SIEP_2_5D_PIXEL_ART_COMPLETO Sección avatar. RNF-001 (usabilidad).

**Archivos a leer primero:**
- `frontend/src/app/features/character/character-editor.component.ts` (leer completo)
- `frontend/src/app/features/simulator/game-world.component.ts` (buscar player spawn y render)

**Qué hacer:**

El avatar tiene estas capas (orden de renderizado, de abajo a arriba):
```
shadow → body → skin → uniform → labcoat → shoes → face → hair → accessories
```

Cada capa es un sprite sheet de 48×64px con 8 frames de animación (idle 4 frames + walk 4 frames por dirección: down, up, left, right).

1. Crear `frontend/src/app/features/character/avatar-config.model.ts`:
```typescript
export interface AvatarConfig {
  skinTone: 'light' | 'medium' | 'dark' | 'dark2';
  eyeType: number;    // 0-7
  browType: number;   // 0-5
  mouthType: number;  // 0-5
  hairStyle: number;  // 0-9
  hairColor: number;  // 0-7
  uniformType: 'clinic_white' | 'clinic_blue' | 'casual';
  labcoat: boolean;
  accessory: 'none' | 'glasses' | 'stethoscope' | 'badge';
}

// Key en localStorage
export const AVATAR_STORAGE_KEY = 'siep_avatar_config';

export function loadAvatarConfig(): AvatarConfig {
  const raw = localStorage.getItem(AVATAR_STORAGE_KEY);
  if (!raw) return getDefaultAvatarConfig();
  try { return JSON.parse(raw); } catch { return getDefaultAvatarConfig(); }
}

export function saveAvatarConfig(cfg: AvatarConfig): void {
  localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(cfg));
}

function getDefaultAvatarConfig(): AvatarConfig {
  return {
    skinTone: 'medium', eyeType: 0, browType: 0, mouthType: 0,
    hairStyle: 0, hairColor: 0, uniformType: 'clinic_white',
    labcoat: true, accessory: 'none',
  };
}
```

2. Crear `frontend/src/app/features/simulator/avatar-renderer.ts` (clase auxiliar para Phaser):
```typescript
import Phaser from 'phaser';
import { AvatarConfig } from '../character/avatar-config.model';

export class AvatarRenderer {
  private layers: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private container: Phaser.GameObjects.Container;
  private currentAnim: string = 'idle_down';

  // Los sprite sheets tienen el formato: avatar_<layer>_<variant>.png
  // Ejemplo: avatar_skin_medium.png, avatar_hair_0_color3.png
  // Ver sección ChatGPT Bloque D para specs exactas

  constructor(
    private scene: Phaser.Scene,
    private config: AvatarConfig,
    x: number,
    y: number,
  ) {
    this.container = scene.add.container(x, y);
  }

  preload(): void {
    const s = this.scene;
    const c = this.config;
    
    // Cargar solo las capas que corresponden a la config del avatar
    s.load.spritesheet('av_body',      'assets/sprites/avatar/avatar_body.png',        { frameWidth: 48, frameHeight: 64 });
    s.load.spritesheet(`av_skin_${c.skinTone}`, `assets/sprites/avatar/avatar_skin_${c.skinTone}.png`, { frameWidth: 48, frameHeight: 64 });
    s.load.spritesheet(`av_uniform_${c.uniformType}`, `assets/sprites/avatar/avatar_uniform_${c.uniformType}.png`, { frameWidth: 48, frameHeight: 64 });
    if (c.labcoat) {
      s.load.spritesheet('av_labcoat', 'assets/sprites/avatar/avatar_labcoat.png',     { frameWidth: 48, frameHeight: 64 });
    }
    s.load.spritesheet(`av_hair_${c.hairStyle}_${c.hairColor}`, 
      `assets/sprites/avatar/avatar_hair_${c.hairStyle}_${c.hairColor}.png`, { frameWidth: 48, frameHeight: 64 });
    s.load.spritesheet(`av_face_${c.eyeType}_${c.browType}_${c.mouthType}`,
      `assets/sprites/avatar/avatar_face_${c.eyeType}_${c.browType}_${c.mouthType}.png`, { frameWidth: 48, frameHeight: 64 });
    if (c.accessory !== 'none') {
      s.load.spritesheet(`av_acc_${c.accessory}`, `assets/sprites/avatar/avatar_acc_${c.accessory}.png`, { frameWidth: 48, frameHeight: 64 });
    }
  }

  create(): void {
    const layerOrder = ['body', 'skin', 'uniform', 'labcoat', 'hair', 'face', 'accessory'];
    // ... crear sprites por capa y añadir al container
    // Las animaciones de cada capa deben ser iguales (mismas frames)
    // así al llamar play() en una se reproduce en todas simultáneamente
    
    for (const layer of layerOrder) {
      const key = this.getTextureKey(layer);
      if (!this.scene.textures.exists(key)) continue;
      const sprite = this.scene.add.sprite(0, 0, key);
      sprite.setOrigin(0.5, 1); // feet-anchored
      this.layers.set(layer, sprite);
      this.container.add(sprite);
    }

    this.createAnimations();
  }

  // Dirección: 'down'|'up'|'left'|'right'
  // Estado: 'idle'|'walk'
  play(state: 'idle' | 'walk', direction: 'down' | 'up' | 'left' | 'right'): void {
    const animKey = `${state}_${direction}`;
    if (animKey === this.currentAnim) return;
    this.currentAnim = animKey;
    this.layers.forEach(sprite => {
      if (sprite.anims) sprite.play(`av_${animKey}`, true);
    });
  }

  setDepth(d: number): void { this.container.setDepth(d); }
  setPosition(x: number, y: number): void { this.container.setPosition(x, y); }
  getContainer(): Phaser.GameObjects.Container { return this.container; }

  private getTextureKey(layer: string): string {
    const c = this.config;
    switch(layer) {
      case 'skin':    return `av_skin_${c.skinTone}`;
      case 'uniform': return `av_uniform_${c.uniformType}`;
      case 'labcoat': return c.labcoat ? 'av_labcoat' : '';
      case 'hair':    return `av_hair_${c.hairStyle}_${c.hairColor}`;
      case 'face':    return `av_face_${c.eyeType}_${c.browType}_${c.mouthType}`;
      case 'accessory': return c.accessory !== 'none' ? `av_acc_${c.accessory}` : '';
      default: return `av_${layer}`;
    }
  }

  private createAnimations(): void {
    // Frames: 0-3 idle_down, 4-7 idle_up, 8-11 idle_left, 12-15 idle_right
    //         16-23 walk_down (8f), 24-31 walk_up, 32-39 walk_left, 40-47 walk_right
    // Estos frames son generados por ChatGPT/diseñador (ver sección PARA CHATGPT Bloque D)
    const anims = [
      { key: 'av_idle_down',  frames: [0,1,2,1],  frameRate: 4,  repeat: -1 },
      { key: 'av_idle_up',    frames: [4,5,6,5],  frameRate: 4,  repeat: -1 },
      { key: 'av_idle_left',  frames: [8,9,10,9], frameRate: 4,  repeat: -1 },
      { key: 'av_idle_right', frames: [12,13,14,13], frameRate: 4, repeat: -1 },
      { key: 'av_walk_down',  frames: [16,17,18,19,20,21,22,23], frameRate: 8, repeat: -1 },
      { key: 'av_walk_up',    frames: [24,25,26,27,28,29,30,31], frameRate: 8, repeat: -1 },
      { key: 'av_walk_left',  frames: [32,33,34,35,36,37,38,39], frameRate: 8, repeat: -1 },
      { key: 'av_walk_right', frames: [40,41,42,43,44,45,46,47], frameRate: 8, repeat: -1 },
    ];

    for (const anim of anims) {
      if (!this.scene.anims.exists(anim.key)) {
        this.scene.anims.create({
          key: anim.key,
          frames: this.scene.anims.generateFrameNumbers('av_body', { frames: anim.frames }),
          frameRate: anim.frameRate,
          repeat: anim.repeat,
        });
      }
    }
  }
}
```

3. En `game-world.component.ts`, reemplazar el player actual (que probablemente es un sprite de Kenney o rectángulo placeholder) con `AvatarRenderer`:

```typescript
// En preload():
const avatarConfig = loadAvatarConfig();
this.avatarRenderer = new AvatarRenderer(this, avatarConfig, 0, 0);
this.avatarRenderer.preload();

// En create(), después de crear el mapa:
this.avatarRenderer.create();
// Usar this.avatarRenderer.getContainer() como el "player" para la cámara
this.cameras.main.startFollow(this.avatarRenderer.getContainer());

// En update(), reemplazar el sprite.play del player:
const moving = velocityX !== 0 || velocityY !== 0;
const dir = this.getDirection(velocityX, velocityY);
this.avatarRenderer.play(moving ? 'walk' : 'idle', dir);
this.avatarRenderer.setDepth(this.avatarRenderer.getContainer().y); // Y-sort
```

**Criterio de Done:**
- Avatar con capas según config de localStorage aparece en el juego
- Animaciones walk/idle en 4 direcciones funcionan
- Y-sort depth funciona (el avatar queda detrás de objetos más abajo)
- Si no existen los PNGs de sprite, el avatar carga un placeholder sin crashear
- `ng build` sin errores

---

### BLOQUE E — Social Mapping (sub-proyecto G)

**Requisito:** psychosocial-sim-roadmap G. RQ-NEG-002 (competencias transferibles).

**Descripción:** Un mini-panel dentro del simulador que muestra una red de relaciones del paciente (familia, trabajo, red de apoyo) que se va revelando y modificando a medida que el estudiante toma decisiones. Ayuda a entender el contexto psicosocial.

**Archivos a leer primero:**
- `frontend/src/app/features/simulator/simulation-hud.component.ts`
- `backend_django/apps/simulation/models/world.py` (para ver campos JSON disponibles)
- `backend_django/apps/simulation/models/case.py`

**Qué hacer:**

1. Crear `frontend/src/app/features/simulator/social-map/social-map.component.ts`:

```typescript
import { Component, Input, OnChanges, computed, signal } from '@angular/core';

export interface SocialNode {
  id: string;
  label: string;
  type: 'patient' | 'family' | 'friend' | 'professional' | 'antagonist';
  revealed: boolean;
  affinity: number; // -1 a 1: negativo=conflicto, positivo=apoyo
}

export interface SocialEdge {
  from: string;
  to: string;
  strength: number; // 0-1
  type: 'support' | 'conflict' | 'neutral' | 'unknown';
}

@Component({
  selector: 'app-social-map',
  standalone: true,
  template: `
    <div class="social-map-panel glass-panel" [class.collapsed]="isCollapsed()">
      <button class="collapse-btn" (click)="toggleCollapse()">
        Red Social {{ isCollapsed() ? '▶' : '▼' }}
      </button>
      @if (!isCollapsed()) {
        <svg [attr.width]="svgWidth" [attr.height]="svgHeight" class="social-svg">
          <!-- Edges -->
          @for (edge of visibleEdges(); track edge.from + edge.to) {
            <line 
              [attr.x1]="nodePositions()[edge.from]?.x" 
              [attr.y1]="nodePositions()[edge.from]?.y"
              [attr.x2]="nodePositions()[edge.to]?.x"
              [attr.y2]="nodePositions()[edge.to]?.y"
              [class]="'edge edge-' + edge.type"
              [attr.stroke-width]="edge.strength * 3 + 1"
            />
          }
          <!-- Nodes -->
          @for (node of visibleNodes(); track node.id) {
            <g [attr.transform]="'translate(' + nodePositions()[node.id]?.x + ',' + nodePositions()[node.id]?.y + ')'">
              <circle r="18" [class]="'node node-' + node.type" />
              <text class="node-label" dy="32" text-anchor="middle">{{ node.label }}</text>
              @if (node.affinity !== 0) {
                <text class="affinity" dy="-22" text-anchor="middle">
                  {{ node.affinity > 0 ? '+' : '' }}{{ (node.affinity * 100).toFixed(0) }}%
                </text>
              }
            </g>
          }
        </svg>
      }
    </div>
  `,
  styles: [`
    .social-map-panel { 
      background: rgba(17,24,39,0.85);
      border: 1px solid rgba(124,77,255,0.3);
      border-radius: 8px;
      padding: 8px;
      backdrop-filter: blur(8px);
    }
    .collapse-btn { 
      background: none; border: none; color: #B69CFF; 
      cursor: pointer; font-size: 12px; 
    }
    .social-svg { display: block; }
    .edge { stroke-opacity: 0.6; }
    .edge-support { stroke: #6EC67A; }
    .edge-conflict { stroke: #E25A4F; }
    .edge-neutral  { stroke: #7D8290; }
    .edge-unknown  { stroke: #7D8290; stroke-dasharray: 4; }
    .node { fill-opacity: 0.9; }
    .node-patient      { fill: #7C4DFF; }
    .node-family       { fill: #4B7DAF; }
    .node-friend       { fill: #6CC0C7; }
    .node-professional { fill: #B69CFF; }
    .node-antagonist   { fill: #E25A4F; }
    .node-label { fill: #F4F7FB; font-size: 10px; }
    .affinity   { fill: #F5B84B; font-size: 9px; }
  `]
})
export class SocialMapComponent implements OnChanges {
  @Input() nodes: SocialNode[] = [];
  @Input() edges: SocialEdge[] = [];
  
  readonly svgWidth = 220;
  readonly svgHeight = 160;
  isCollapsed = signal(false);
  
  visibleNodes = computed(() => this.nodes.filter(n => n.revealed));
  visibleEdges = computed(() => 
    this.edges.filter(e => 
      this.nodes.find(n => n.id === e.from)?.revealed && 
      this.nodes.find(n => n.id === e.to)?.revealed
    )
  );

  nodePositions = computed(() => {
    // Layout circular simple centrado en el paciente
    const positions: Record<string, { x: number; y: number }> = {};
    const visible = this.visibleNodes();
    const cx = this.svgWidth / 2;
    const cy = this.svgHeight / 2;
    const r = Math.min(cx, cy) - 30;
    
    visible.forEach((node, i) => {
      if (node.type === 'patient') {
        positions[node.id] = { x: cx, y: cy };
      } else {
        const others = visible.filter(n => n.type !== 'patient');
        const idx = others.indexOf(node);
        const angle = (idx / others.length) * Math.PI * 2 - Math.PI / 2;
        positions[node.id] = {
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
        };
      }
    });
    return positions;
  });

  ngOnChanges(): void { /* signals se actualizan automáticamente */ }
  toggleCollapse(): void { this.isCollapsed.update(v => !v); }
}
```

2. Los datos de `nodes` y `edges` vienen del `metadata_json` de los objetos del caso o de un campo dedicado en el nodo de decisión. Si el caso no tiene datos de red social, mostrar solo el nodo del paciente con `revealed: false` en los demás.

3. Integrar en `simulation-hud.component.html`:
```html
<!-- En un panel lateral del HUD -->
<app-social-map 
  [nodes]="socialNodes()" 
  [edges]="socialEdges()">
</app-social-map>
```

4. En el `GameService`, al procesar cada decisión, evaluar si nuevos nodos se revelan (basado en `metadata_json` del nodo de decisión con campo `reveals_social_nodes: string[]`).

**Criterio de Done:**
- Panel Social Map visible en el HUD, colapsable
- Nodo paciente siempre visible en el centro
- Otros nodos se revelan conforme el estudiante avanza
- Afinity (+/-) se actualiza según decisiones
- Layout circular funciona con 1–8 nodos extra
- `ng build` sin errores

---

### BLOQUE F — Verbal Tension Box (sub-proyecto I)

**Requisito:** psychosocial-sim-roadmap I. RQ-NEG-003 (reducción de decisiones no recomendadas).

**Descripción:** Un indicador visual que mide la tensión acumulada en el intercambio verbal —NO el estrés general del paciente, sino la carga de la conversación actual. Se manifiesta como una barra o caja visual que crece con respuestas confrontativas y baja con respuestas empáticas. Si llega al máximo, el paciente se cierra o la sesión escala.

**Archivos a leer primero:**
- `frontend/src/app/features/simulator/simulation-hud.component.ts`
- `frontend/src/app/features/simulator/dialogue-panel.component.ts`

**Qué hacer:**

1. Agregar `verbal_tension_delta: number` al contrato de cada opción de diálogo (en el backend, campo en `decision_option_json` o `metadata_json` de la opción). Rango: -1.0 (muy empático) a +1.0 (muy confrontativo).

2. Crear `frontend/src/app/features/simulator/verbal-tension.component.ts`:

```typescript
import { Component, Input, computed, signal } from '@angular/core';

@Component({
  selector: 'app-verbal-tension',
  standalone: true,
  template: `
    <div class="vt-container" [class.critical]="isCritical()">
      <span class="vt-label">Tensión Verbal</span>
      <div class="vt-track">
        <div class="vt-fill" [style.width.%]="fillPercent()" [class]="fillClass()"></div>
        <!-- Marcador de zona segura -->
        <div class="vt-safe-marker" [style.left.%]="safeThreshold * 100"></div>
      </div>
      @if (isCritical()) {
        <span class="vt-warning">⚠ Paciente cierra comunicación</span>
      }
    </div>
  `,
  styles: [`
    .vt-container {
      display: flex; flex-direction: column; gap: 4px;
      padding: 6px 8px;
      background: rgba(17,24,39,0.7);
      border-radius: 6px;
      border: 1px solid rgba(124,77,255,0.2);
    }
    .vt-container.critical { border-color: #E25A4F; }
    .vt-label { font-size: 10px; color: #7D8290; text-transform: uppercase; letter-spacing: 0.5px; }
    .vt-track {
      position: relative;
      height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: visible;
    }
    .vt-fill {
      height: 100%; border-radius: 3px;
      transition: width 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }
    .vt-fill.low    { background: #6EC67A; }
    .vt-fill.medium { background: #F5B84B; }
    .vt-fill.high   { background: #E25A4F; }
    .vt-safe-marker {
      position: absolute; top: -3px; bottom: -3px;
      width: 2px; background: rgba(255,255,255,0.4);
      border-radius: 1px;
    }
    .vt-warning { font-size: 10px; color: #E25A4F; animation: blink 1s infinite; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
  `]
})
export class VerbalTensionComponent {
  @Input() tension = signal(0); // 0.0 - 1.0
  readonly safeThreshold = 0.7;

  fillPercent = computed(() => Math.max(0, Math.min(100, this.tension() * 100)));
  isCritical  = computed(() => this.tension() >= 0.9);
  fillClass   = computed(() => {
    const t = this.tension();
    if (t < 0.4) return 'low';
    if (t < 0.7) return 'medium';
    return 'high';
  });
}
```

3. En el store de simulación, mantener `verbalTension = signal(0)`. Al procesar cada decisión:
```typescript
const delta = selectedOption.metadata?.verbal_tension_delta ?? 0;
this.verbalTension.update(t => Math.max(0, Math.min(1, t + delta)));

// Si verbalTension >= 0.9, trigger estado "paciente cerrado"
if (this.verbalTension() >= 0.9) {
  this.triggerPatientWithdrawal();
}
// Al cambiar de sala/escena, resetear parcialmente la tensión
```

4. Integrar en el template del HUD junto al panel de diálogo.

**Criterio de Done:**
- Barra de tensión visible durante diálogos
- Color cambia low→medium→high según valor
- Al llegar a 90%: warning visible + efecto en diálogo
- Tensión se resetea parcialmente al cambiar sala
- `ng build` sin errores

---

### BLOQUE G — RF-027: Asistente IA Contextual

**Requisito:** `docs/Requisitos Funcionales (Simulador)/RF-027.md`. Prioridad Alta.

**Restricciones críticas (del doc RF-027):**
- NO revelar respuestas correctas ANTES de que el estudiante haya tomado una decisión
- Mantenerse en el scope del caso (solo contenido del caso actual)
- Registrar todas las interacciones en audit_logs

**Qué hacer:**

1. Crear endpoint en Django:
```python
# backend_django/apps/simulation/views/ai_assistant.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.views.decorators.csrf import csrf_exempt
import openai  # o el cliente que se use

class AIAssistantView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        attempt_id = request.data.get('attempt_id')
        question = request.data.get('question', '').strip()
        current_node_id = request.data.get('current_node_id')
        decision_already_taken = request.data.get('decision_already_taken', False)

        if not question or not attempt_id:
            return Response({'error': 'Parámetros incompletos'}, status=400)

        # Obtener contexto del caso (NO incluir las opciones correctas si no se ha decidido)
        attempt = SimulationAttempt.objects.select_related('case_version').get(
            id=attempt_id, student=request.user
        )
        case_context = self._build_context(attempt, current_node_id, decision_already_taken)

        # Llamar LLM
        response_text = self._call_llm(question, case_context)

        # Registrar en audit_log
        AuditLog.objects.create(
            user=request.user,
            action='AI_ASSISTANT_QUERY',
            resource_type='SimulationAttempt',
            resource_id=str(attempt_id),
            details={
                'question': question,
                'node': current_node_id,
                'decision_taken': decision_already_taken,
                'response_length': len(response_text),
            }
        )

        return Response({'response': response_text})

    def _build_context(self, attempt, node_id, decision_taken):
        """Construye el contexto del caso sin revelar opciones correctas si no se ha decidido."""
        ctx = f"""
Eres un asistente de apoyo para estudiantes de psicología que están en el simulador SIEP.
Caso: {attempt.case_version.title}
Nodo actual: {node_id}
El estudiante {'ya tomó' if decision_taken else 'NO ha tomado aún'} una decisión en este nodo.

{'Puedes mencionar el resultado de la decisión tomada.' if decision_taken 
 else 'NO puedes revelar qué decisión es la más adecuada. Solo puedes orientar conceptualmente.'}

Responde SOLO sobre el contenido del caso actual. No respondas preguntas fuera del scope del caso.
        """
        return ctx

    def _call_llm(self, question, context):
        # Implementar con OpenAI API, Anthropic API, o modelo local
        # Placeholder para no hardcodear la elección del provider
        raise NotImplementedError("Configurar LLM provider en settings.py")
```

2. Registrar la URL en `urls.py`:
```python
path('api/simulation/ai-assistant/', AIAssistantView.as_view(), name='ai-assistant'),
```

3. Crear `frontend/src/app/features/simulator/ai-assistant/ai-assistant.component.ts`:

```typescript
@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  template: `
    <div class="assistant-panel glass-panel" [class.open]="isOpen()">
      <button class="assistant-toggle" (click)="toggleOpen()" aria-label="Asistente IA">
        🤖 Orientación
      </button>
      @if (isOpen()) {
        <div class="chat-area" role="log" aria-live="polite">
          @for (msg of messages(); track $index) {
            <div class="message" [class]="msg.role">
              <span class="msg-text">{{ msg.text }}</span>
            </div>
          }
          @if (loading()) {
            <div class="message assistant loading">Pensando...</div>
          }
        </div>
        <div class="input-area">
          <input 
            [(ngModel)]="currentQuestion"
            (keyup.enter)="sendQuestion()"
            placeholder="Pregunta sobre el caso..."
            [disabled]="loading()"
            aria-label="Pregunta al asistente"
          />
          <button (click)="sendQuestion()" [disabled]="loading()">Enviar</button>
        </div>
        <p class="disclaimer">
          El asistente orienta conceptualmente. No revela respuestas antes de decidir.
        </p>
      }
    </div>
  `,
})
export class AIAssistantComponent {
  isOpen = signal(false);
  messages = signal<{role: 'user'|'assistant', text: string}[]>([]);
  loading = signal(false);
  currentQuestion = '';

  @Input() attemptId!: string;
  @Input() currentNodeId!: string;
  @Input() decisionAlreadyTaken = false;

  constructor(private http: HttpClient) {}

  toggleOpen(): void { this.isOpen.update(v => !v); }

  async sendQuestion(): Promise<void> {
    if (!this.currentQuestion.trim() || this.loading()) return;
    const q = this.currentQuestion;
    this.currentQuestion = '';
    this.messages.update(msgs => [...msgs, { role: 'user', text: q }]);
    this.loading.set(true);

    try {
      const resp = await firstValueFrom(this.http.post<{response: string}>(
        '/api/simulation/ai-assistant/',
        { 
          attempt_id: this.attemptId,
          question: q, 
          current_node_id: this.currentNodeId,
          decision_already_taken: this.decisionAlreadyTaken
        }
      ));
      this.messages.update(msgs => [...msgs, { role: 'assistant', text: resp.response }]);
    } catch(e) {
      this.messages.update(msgs => [...msgs, { 
        role: 'assistant', text: 'Error al conectar con el asistente.' 
      }]);
    } finally {
      this.loading.set(false);
    }
  }
}
```

4. En `settings.py`, añadir configuración del LLM:
```python
AI_ASSISTANT_PROVIDER = env('AI_ASSISTANT_PROVIDER', default='openai')
AI_ASSISTANT_API_KEY = env('AI_ASSISTANT_API_KEY', default='')
AI_ASSISTANT_MODEL = env('AI_ASSISTANT_MODEL', default='gpt-4o-mini')
```

**Criterio de Done:**
- Botón "Orientación" visible en el simulador
- Responde en contexto del caso
- Registra cada interacción en audit_logs
- NO revela respuestas si `decision_already_taken = false`
- `ng build` sin errores; test de integración para el endpoint

---

### BLOQUE H — WCAG 2.1 AA: Accesibilidad Completa

**Requisito:** RNF-004. Contraste ≥4.5:1, 100% teclado-navegable, 0 blockers screen reader.

**Archivos a leer primero:**
- `frontend/src/app/features/simulator/simulation-hud.component.html`
- `frontend/src/app/features/simulator/dialogue-panel.component.html`
- `frontend/src/app/features/simulator/outcome-screen.component.html`
- `frontend/src/styles.scss` o el archivo de estilos globales

**Qué hacer:**

1. **Verificar contraste de colores.** Usar la paleta actual para calcular:
   - `#F4F7FB` sobre `#1B2133` → ✅ ratio ~12:1
   - `#B69CFF` sobre `#111827` → verificar; si < 4.5:1, aclarar a `#C9B3FF`
   - `#7C4DFF` como color de texto → ❌ probablemente falla. Solo usar como borde/acento
   - Texto de estrés `#E25A4F` sobre fondo oscuro → verificar; posiblemente `#FF6B60` para pasar

2. **Agregar aria-labels y roles en todos los componentes:**

```html
<!-- simulation-hud.component.html -->
<div class="hud-container" role="complementary" aria-label="Interfaz del simulador">
  
  <!-- Stress hearts -->
  <div role="meter" 
       [attr.aria-valuenow]="stressLevel()" 
       aria-valuemin="0" 
       aria-valuemax="100"
       aria-label="Nivel de estrés del paciente">
    <!-- corazones SVG existentes -->
  </div>
  
  <!-- Barra de progreso de sesión -->
  <div role="progressbar"
       [attr.aria-valuenow]="sessionProgress()"
       aria-valuemin="0" aria-valuemax="100"
       aria-label="Progreso de la sesión">
  </div>

</div>
```

```html
<!-- dialogue-panel.component.html -->
<div role="dialog" aria-modal="true" [attr.aria-label]="'Diálogo con ' + speakerName()">
  
  <div class="dialogue-text" 
       role="status" 
       aria-live="polite"
       aria-atomic="false">
    {{ displayText }}
  </div>
  
  <div class="choices-list" role="group" aria-label="Opciones de respuesta">
    @for (choice of choices(); track choice.id; let i = $index) {
      <button 
        class="choice-btn"
        [attr.aria-label]="'Opción ' + (i+1) + ': ' + choice.text"
        (click)="selectChoice(choice)">
        <kbd aria-hidden="true">{{ i + 1 }}</kbd>
        {{ choice.text }}
      </button>
    }
  </div>

</div>
```

3. **Skip links** (para usuarios de teclado):
```html
<!-- En app.component.html, PRIMER elemento del body -->
<a href="#main-content" class="skip-link">Saltar al contenido principal</a>
<a href="#game-area" class="skip-link">Saltar al juego</a>
```
```scss
// En styles.scss
.skip-link {
  position: absolute;
  top: -100px;
  left: 0;
  z-index: 9999;
  padding: 8px 16px;
  background: #7C4DFF;
  color: white;
  text-decoration: none;
  border-radius: 0 0 4px 0;
  &:focus { top: 0; }
}
```

4. **Focus rings visibles** en todos los elementos interactivos:
```scss
// En styles.scss — global focus style
:focus-visible {
  outline: 2px solid #B69CFF;
  outline-offset: 2px;
  border-radius: 2px;
}
// Quitar outline por defecto solo si se reemplaza por el de arriba
button, a, input, select, [tabindex] {
  &:focus { outline: none; }
  &:focus-visible { outline: 2px solid #B69CFF; outline-offset: 2px; }
}
```

5. **Navegación por teclado en el panel de diálogo** (ya existe con 1-9, verificar que funcione):
```typescript
// En dialogue-panel.component.ts — verificar/agregar:
@HostListener('window:keydown', ['$event'])
handleKey(e: KeyboardEvent): void {
  if (!this.isVisible()) return;
  const num = parseInt(e.key);
  if (num >= 1 && num <= this.choices().length) {
    e.preventDefault();
    this.selectChoice(this.choices()[num - 1]);
  }
  if (e.key === ' ' || e.key === 'Enter') {
    if (!this.isTypingComplete()) {
      e.preventDefault();
      this.skipTypewriter = true;
    }
  }
  // Escape → safe exit siempre disponible (REGLA-004)
  if (e.key === 'Escape') {
    this.openSafeExitMenu();
  }
}
```

6. **Audit WCAG** — después de implementar, correr con axe-core:
```bash
cd frontend && npm install --save-dev @axe-core/angular
# Agregar en main.ts (solo en dev):
import { axe } from '@axe-core/angular';
if (!environment.production) { axe(document, 1000); }
```
Resolver todos los problemas reportados por axe antes de marcar este bloque como Done.

**Criterio de Done:**
- 0 violaciones axe-core en nivel AA
- Contraste ≥4.5:1 en todos los textos (verificado con Contrast Checker)
- Todas las opciones del diálogo navegables con teclado
- Skip links funcionales
- Screen reader anuncia progreso, diálogos y opciones

---

### BLOQUE I — CI Quality Gates (GitHub Actions)

**Requisito:** PLAN_MAESTRO_EJECUCION_V3 Fase 8. RNF-008 (modular, sin deploy de código).

**Qué hacer:**

1. Crear `.github/workflows/ci.yml` en la raíz del monorepo:

```yaml
name: SIEP CI

on:
  push:
    branches: [main, develop, 'feature/**']
  pull_request:
    branches: [main, develop]

jobs:
  backend:
    name: Django Backend
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: siep_test
          POSTGRES_USER: siep
          POSTGRES_PASSWORD: siep_test
        options: >-
          --health-cmd pg_isready --health-interval 10s 
          --health-timeout 5s --health-retries 5
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - name: Install deps
        run: |
          cd backend_django
          pip install -r requirements.txt --break-system-packages
      - name: Run tests
        env:
          DATABASE_URL: postgresql://siep:siep_test@localhost:5432/siep_test
          DJANGO_SETTINGS_MODULE: config.settings.test
          SECRET_KEY: test-secret-key-for-ci
        run: |
          cd backend_django
          python manage.py test --verbosity=2
      - name: Check migrations consistency
        run: |
          cd backend_django
          # Solo verificar que no hay migraciones pendientes INCONSISTENTES
          # (no crear nuevas migraciones — managed=False)
          python manage.py migrate --check

  frontend:
    name: Angular Frontend
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm', cache-dependency-path: frontend/package-lock.json }
      - name: Install deps
        run: cd frontend && npm ci
      - name: Type check
        run: cd frontend && npx tsc --noEmit
      - name: Lint
        run: cd frontend && npx ng lint
      - name: Tests
        run: cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --code-coverage
      - name: Build prod
        run: cd frontend && npx ng build --configuration=production
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          directory: frontend/coverage

  security:
    name: Security Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check for secrets in code
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
      - name: Python deps audit
        run: |
          pip install pip-audit --break-system-packages
          cd backend_django && pip-audit -r requirements.txt
      - name: Node deps audit
        run: cd frontend && npm audit --audit-level=high
```

2. Asegurarse de que el repositorio es **privado** antes de configurar CI (REGLA-007). El workflow no debe correr en repos públicos con secretos.

3. Crear `backend_django/config/settings/test.py`:
```python
from .base import *
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('POSTGRES_DB', 'siep_test'),
        'USER': os.environ.get('POSTGRES_USER', 'siep'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD', 'siep_test'),
        'HOST': os.environ.get('POSTGRES_HOST', 'localhost'),
        'PORT': os.environ.get('POSTGRES_PORT', '5432'),
    }
}
DEBUG = False
SECRET_KEY = os.environ.get('SECRET_KEY', 'test-secret')
ALLOWED_HOSTS = ['*']
```

**Criterio de Done:**
- GitHub Actions corre en cada push a `develop` y `main`
- Pipeline falla si tests de Django fallan
- Pipeline falla si `ng build --prod` falla
- Pipeline falla si hay secretos hardcodeados en el código
- Coverage report generado

---

### BLOQUE J — Semillas de Escenarios Adicionales

**Requisito:** PROMPT_SIEP_2_5D_PIXEL_ART_COMPLETO Sección escenarios. RQ-NEG-007 (nuevo caso en ≤4h).

Los escenarios se definen como fixtures de Django (JSON). Cada escenario tiene: `scenario_type`, `ambient_json` con parámetros de iluminación/ambiente, y al menos 1 mapa Tiled + objetos seed.

**Qué hacer:**

1. Crear `backend_django/apps/simulation/fixtures/scenario_seeds.json` con los 3 escenarios faltantes (hospital, comisaría de familia, vivienda):

Los escenarios ya definidos en el PROMPT_SIEP_2_5D son (ver sección ChatGPT para assets):
- `hospital_psiquiatrico` — sala de espera + consultorio
- `comisaria_familia` — sala de recepción + sala de entrevista
- `vivienda_urbana` — sala + cocina

Para cada uno, crear un fixture con estructura:
```json
{
  "model": "simulation.scenarioseed",
  "pk": null,
  "fields": {
    "name": "Hospital Psiquiátrico — Consultorio",
    "scenario_type": "hospital_psiquiatrico",
    "thumbnail_url": "/static/scenarios/hospital_consultorio_thumb.png",
    "default_map_width": 640,
    "default_map_height": 480,
    "ambient_json": {
      "time_of_day": "day",
      "light_temperature": "cool",
      "fog_density": 0.0,
      "overlay_color": "#E8F4FF",
      "overlay_alpha": 0.08,
      "ambient_sounds": ["hospital_hvac", "distant_footsteps"],
      "particle_effects": []
    },
    "tileset_key": "hospital_interior",
    "spawn_x": 320,
    "spawn_y": 400
  }
}
```

2. Crear el ScenarioConfig hardcoded para `comisaria_familia` (multi-room) en `game-world.component.ts`:

```typescript
const COMISARIA_SCENARIO: ScenarioConfig = {
  id: 'comisaria_familia',
  title: 'Comisaría de Familia',
  rooms: [
    {
      id: 'recepcion',
      label: 'Recepción',
      mapKey: 'comisaria_recepcion',
      mapPath: 'assets/maps/comisaria_recepcion.json',
      spawnX: 160, spawnY: 320,
      doors: [
        { x: 310, y: 180, width: 32, height: 16, targetRoom: 'entrevista', targetX: 160, targetY: 380 }
      ]
    },
    {
      id: 'entrevista',
      label: 'Sala de Entrevista',
      mapKey: 'comisaria_entrevista',
      mapPath: 'assets/maps/comisaria_entrevista.json',
      spawnX: 160, spawnY: 380,
      doors: [
        { x: 310, y: 420, width: 32, height: 16, targetRoom: 'recepcion', targetX: 160, targetY: 180 }
      ]
    }
  ]
};
```

3. Los archivos `.json` de Tiled y los tilesets PNG son generados por ChatGPT/diseñador (ver sección ChatGPT Bloque J).

**Criterio de Done:**
- 3 nuevos scenario seeds en fixtures y cargados con `loaddata`
- ScenarioConfig de comisaría con 2 salas funciona en el motor
- Los mapas placeholder (al menos con tiles básicos) no crashean el juego
- `ng build` sin errores

---

### BLOQUE K — Landing Page y Onboarding

**Requisito:** RNF-001 (≥90% completan primer nodo sin ayuda, funciones clave ≤30s). RQ-NEG-004 (≥85% satisfacción).

**Archivos a leer primero:**
- `frontend/src/app/features/landing/` (si existe)
- `frontend/src/app/app.routes.ts`

**Qué hacer:**

1. La landing page debe tener:
   - Nombre del sistema + logo (ver sección ChatGPT Bloque K)
   - Descripción en 2-3 líneas ("Simulador de práctica psicosocial para estudiantes de psicología")
   - Botón CTA principal: "Comenzar Simulación"
   - Indicador de si hay un caso en progreso (guardado en localStorage)
   - Acceso rápido al editor de personaje (avatar)

2. Crear/actualizar `frontend/src/app/features/landing/landing.component.ts`:
```typescript
@Component({
  selector: 'app-landing',
  standalone: true,
  template: `
    <main class="landing-main" id="main-content">
      <div class="hero">
        <img src="assets/ui/siep_logo.svg" alt="SIEP — Sistema de Entrenamiento Psicosocial" class="hero-logo" />
        <h1 class="hero-title">SIEP</h1>
        <p class="hero-subtitle">Sistema de Entrenamiento Psicosocial</p>
        <p class="hero-desc">
          Simulador de práctica clínica para estudiantes de psicología.<br>
          Corporación Universitaria Empresarial Alexander Von Humboldt.
        </p>
        
        @if (caseInProgress()) {
          <div class="in-progress-banner" role="status">
            <span>Tienes una sesión en progreso: "{{ caseInProgress()!.title }}"</span>
            <button (click)="resumeCase()" class="btn-primary">Continuar</button>
          </div>
        }
        
        <div class="cta-group">
          <button (click)="startNew()" class="btn-primary btn-large">
            Comenzar Simulación
          </button>
          <button (click)="goToAvatarEditor()" class="btn-secondary">
            Personalizar Personaje
          </button>
        </div>
      </div>
    </main>
  `,
})
export class LandingComponent {
  caseInProgress = signal<{id: string, title: string} | null>(null);
  
  constructor(private router: Router) {
    // Leer progreso del localStorage
    const progress = localStorage.getItem('siep_current_attempt');
    if (progress) {
      try { this.caseInProgress.set(JSON.parse(progress)); } catch {}
    }
  }
  
  startNew(): void { this.router.navigate(['/simulator/cases']); }
  resumeCase(): void { 
    const p = this.caseInProgress();
    if (p) this.router.navigate(['/simulator/game', p.id]);
  }
  goToAvatarEditor(): void { this.router.navigate(['/character']); }
}
```

3. Verificar que la ruta `/` apunta a `LandingComponent` en `app.routes.ts`.

**Criterio de Done:**
- Landing visible al entrar a la app
- Botón CTA funciona y lleva al listado de casos
- Banner "en progreso" aparece si hay intento guardado
- Logo y diseño usan la paleta morada/lavanda del sistema
- `ng build` sin errores

---

### BLOQUE L — Seguridad: Repositorio Privado + Secrets Audit

**Requisito:** REGLA-007. Dominio clínico — datos sensibles no deben estar en repos públicos.

**Qué hacer:**

1. **Hacer el repositorio privado** en GitHub/GitLab:
   - Settings → Danger Zone → Change repository visibility → Private
   - ⚠️ Esta acción la debe hacer el humano directamente en la interfaz de GitHub/GitLab

2. Audit de secretos en el código. Buscar y eliminar cualquier:
```bash
# Correr localmente
grep -r "SECRET_KEY\s*=" --include="*.py" . | grep -v "env(" | grep -v "os.environ"
grep -r "DATABASE_URL\s*=" --include="*.py" . | grep -v "env("
grep -r "API_KEY\s*=\s*['\"]" --include="*.py" .
grep -r "password\s*=\s*['\"]" --include="*.py" . | grep -v "test"
```

3. Verificar que `.gitignore` incluye:
```gitignore
# Secrets
.env
.env.*
!.env.example
*.pem
*.key
secrets/

# Django
backend_django/config/settings/local.py
backend_django/media/

# Angular
frontend/.env
frontend/src/environments/environment.prod.ts
```

4. Crear `.env.example` en la raíz con TODAS las variables requeridas (sin valores reales):
```bash
# Django
SECRET_KEY=your-secret-key-here
DATABASE_URL=postgresql://user:pass@localhost:5432/siep
DJANGO_SETTINGS_MODULE=config.settings.production
ALLOWED_HOSTS=your-domain.com

# AI Assistant (RF-027)
AI_ASSISTANT_PROVIDER=openai
AI_ASSISTANT_API_KEY=your-openai-key-here
AI_ASSISTANT_MODEL=gpt-4o-mini

# Security
CORS_ALLOWED_ORIGINS=https://your-frontend-domain.com
```

5. Verificar que `backend_django/config/settings/production.py` usa `env()` para TODOS los valores sensibles y que `DEBUG=False` en producción.

**Criterio de Done:**
- Repositorio marcado como privado
- 0 secretos hardcodeados en el código
- `.env.example` documentado y en el repo
- `DEBUG=False` en settings de producción
- TruffleHog/gitleaks no reporta secretos en el historial de git

---

## PARA CHATGPT — ASSETS VISUALES

> **Instrucciones de lectura:** Eres un agente generador de imágenes y assets pixel-art. Lee cada bloque, genera los assets con las especificaciones exactas, y coloca los archivos en las rutas indicadas. El estilo unificado para TODOS los assets es: **pixel-art 2.5D, perspectiva 3/4 isométrica suave, sin antialiasing, paleta limitada**.

---

### ESPECIFICACIONES GLOBALES DE ESTILO

```
ESTILO BASE:
- Técnica: Pixel art clásico
- Perspectiva: 3/4 top-down (isométrica suave, no ortogonal pura)
- Antialiasing: NINGUNO. Bordes duros.
- Escala de diseño: 1x (sin upscale). El juego hace zoom 2x.
- Exportar en PNG con fondo transparente (excepto fondos de escenario)
- Profundidad de color: 8-bit indexed preferred, pero PNG-32 con transparencia es OK

PALETA PRINCIPAL (usar siempre que sea posible):
#111827  — negro-azul (fondo, sombras profundas)
#1B2133  — azul muy oscuro (paneles, paredes en sombra)
#7C4DFF  — morado SIEP (acentos, portales, magia)
#B69CFF  — lavanda (brillos, highlights mágicos)
#4B7DAF  — azul (uniforme, paredes hospital)
#6CC0C7  — cian (detalles de agua, vidrio)
#7D8290  — gris piso (suelos, concreto)
#F4F7FB  — blanco cálido (texto, luces altas, paredes blancas)
#F5B84B  — dorado/alerta (detalles, alertas, calidez)
#E25A4F  — rojo estrés (detalles de crisis, sangre, peligro)
#6EC67A  — verde adecuado (plantas, OK, éxito)
#2A1F3D  — morado muy oscuro (sombras de personaje, bajo fondo)

COLORES DE PIEL DISPONIBLES:
- light: #FDDBB4 (luz) / #F0C48A (sombra) / #E0A870 (contorno)
- medium: #C68642 (luz) / #A0692A (sombra) / #7D4E1A (contorno)
- dark: #8D5524 (luz) / #6B3A16 (sombra) / #4A2508 (contorno)
- dark2: #3D1E0D (luz) / #2A1208 (sombra) / #1A0A04 (contorno)
```

---

### BLOQUE VISUAL A — Música y Audio (Iconos UI)

**Destino:** `frontend/src/assets/ui/icons/`

**Assets a generar:**

1. `icon_audio_on.png` — 16×16px. Altavoz con ondas sonoras. Color: #B69CFF. Fondo: transparente.
2. `icon_audio_off.png` — 16×16px. Altavoz con X. Color: #7D8290. Fondo: transparente.
3. `icon_music.png` — 16×16px. Nota musical doble. Color: #B69CFF. Fondo: transparente.
4. `icon_sfx.png` — 16×16px. Onda sonora pequeña. Color: #6CC0C7. Fondo: transparente.

---

### BLOQUE VISUAL B — Tilesets de Escenarios

**Destino:** `frontend/src/assets/tilesets/`

**TILESET 1: Consultorio Psicológico** (`tileset_consultorio.png`)

```
Tamaño de tile: 32×32px (perspectiva 3/4)
Dimensión del tileset: 256×256px (8×8 tiles = 64 tiles)
Fondo: transparente

Tiles requeridos (en orden, izquierda→derecha, arriba→abajo):
Fila 0 (suelo):
  [0,0] Suelo madera clara — tabla horizontal, color #C8A062 con grano de madera
  [1,0] Suelo madera oscura — variante más oscura #A07840
  [2,0] Suelo alfombra violeta — textura suave, color #4A3060
  [3,0] Suelo alfombra violeta (variante borde)
  [4,0] Suelo baldosa gris clara
  [5,0] Suelo baldosa gris oscura
  [6,0] Suelo madera (esquina empalme)
  [7,0] Vacío/transparente

Fila 1 (paredes — vista desde 3/4, parte superior visible):
  [0,1] Pared blanca hueso (#F0EFEA) — panel superior
  [1,1] Pared con zócalo inferior — transición pared/suelo
  [2,1] Pared con ventana — marco de madera, vidrio #6CC0C7 semi-transparente
  [3,1] Pared con cuadro (marco vacío/abstracto)
  [4,1] Pared esquina interna
  [5,1] Pared esquina externa
  [6,1] Pared ladrillo expuesto (variante) — textura ladrillo en tonos rojizos
  [7,1] Vacío

Fila 2 (mobiliario — objetos vistos desde 3/4, con sombra al sur):
  [0,2] Escritorio psicólogo (64×32 — ocupa 2 tiles ancho, exportar como 64×32 separado)
  [1,2] (parte derecha del escritorio, o usar formato 64×32 sprites separados)
  [2,2] Silla del psicólogo — con respaldo alto, color oscuro
  [3,2] Silla del paciente — tapizada, color neutro
  [4,2] Diván/camilla (vista lateral 3/4)
  [5,2] Librería/estante alto con libros (sprite 32×64 separado)
  [6,2] Planta en maceta — hojas verdes #6EC67A
  [7,2] Caja de pañuelos (prop pequeño 16×16)

Fila 3 (props y detalles):
  [0,3] Teléfono de escritorio
  [1,3] Lámpara de mesa encendida — con halo de luz dorado
  [2,3] Carpeta/expediente
  [3,3] Taza de café
  [4,3] Cuadro abstracto para pared
  [5,3] Marco de foto
  [6,3] Maceta pequeña
  [7,3] Papelera

Fila 4-7: Repetir con variantes para consultorio hospitalario (más clínico, menos cálido)
```

**TILESET 2: Hospital Psiquiátrico Interior** (`tileset_hospital.png`)
```
Tamaño tile: 32×32px. Dimensión: 256×256px.
Paleta dominante: blancos (#F0F4F8), azul hospital (#4B7DAF), grises (#7D8290)

Fila 0 (suelo): baldosa blanca, baldosa con junta gris, linóleo verde pálido, linóleo gris
Fila 1 (paredes): pared blanca lisa, pared con zócalo azul, pared con señalética, ventana hospital
Fila 2 (mobiliario): cama hospitalaria, silla de ruedas, camilla con sábana, mesa de noche
Fila 3 (props): monitor de signos vitales, gotero IV, mesita auxiliar, papelera médica
Fila 4 (puertas): puerta metálica gris, puerta vidriada, marco de puerta, puerta abierta
```

**TILESET 3: Comisaría de Familia** (`tileset_comisaria.png`)
```
Tamaño tile: 32×32px. Dimensión: 256×256px.
Paleta: concreto gris (#9AA3AF), verde gobierno (#3A5A40), mostaza (#C8A030)

Fila 0 (suelo): concreto gris, concreto con grietas, loseta verde oliva, alfombra verde
Fila 1 (paredes): pared gris gobierno, pared con ventanilla, pared con aviso
Fila 2 (mobiliario): escritorio de funcionario, silla de espera metálica, archivador
Fila 3 (props): formularios, sello, teléfono institucional, cartel de normas
```

**TILESET 4: Vivienda Urbana** (`tileset_vivienda.png`)
```
Tamaño tile: 32×32px. Dimensión: 256×256px.
Paleta: calidez doméstica — madera (#C8A062), crema (#F5E6C8), textil (#7C4DFF suave)

Fila 0 (suelo): parquet, baldosa, cemento, alfombra floral
Fila 1 (paredes): pared pintada beige, pared descascarada, ventana con cortina
Fila 2 (mobiliario): sofá familiar, mesa de comedor, silla de comedor, televisor
Fila 3 (props): foto familiar en pared, estante con adornos, cocina (vista frontal)
```

---

### BLOQUE VISUAL C — Retratos de NPCs (Portraits para Diálogos)

**Destino:** `frontend/src/assets/portraits/`

Cada NPC tiene un sprite sheet de portrait con 5 columnas de expresión × 1 fila (puede expandirse).

```
Tamaño por frame: 64×80px (cabeza + hombros)
Columnas: 0=neutral, 1=positivo/alivio, 2=negativo/tristeza, 3=ansioso/tenso, 4=crisis/colapso
Fondo por frame: transparente (el panel de diálogo pone su propio fondo)
Nombre de archivo: portrait_<npc_id>.png (resultado: 320×80px por NPC)
```

**NPCs a generar:**

```
portrait_paciente_adulto_m.png — Hombre adulto ~40 años. Rasgos latam.
  Col 0: expresión neutral, mirada directa pero cansada
  Col 1: leve sonrisa, cejas relajadas — hay esperanza
  Col 2: mirada abajo, comisuras caídas — tristeza contenida
  Col 3: cejas alzadas, ojos levemente abiertos — ansiedad
  Col 4: expresión disociada, mirada vacía, mandíbula caída

portrait_paciente_adulto_f.png — Mujer adulta ~35 años. Rasgos latam.
  Mismas 5 expresiones que arriba

portrait_paciente_joven_f.png — Joven ~19 años. Estudiante universitaria.
  Col 0: neutral pero alerta
  Col 1: sonrisa tímida
  Col 2: labios apretados, ojos vidriosos
  Col 3: respiración visible (boca entreabi), cejas fruncidas
  Col 4: llanto contenido

portrait_familiar_m.png — Familiar masculino ~50 años. Postura defensiva en expresiones negativas.
  Mismas 5 cols. En col 4: enojo/desesperación

portrait_funcionario_m.png — Funcionario de comisaría ~45 años. Uniforme institucional.
  En col 3: burocracia / desinterés. En col 4: reactividad.

portrait_guia_f.png — NPC guía del estudiante (psicóloga supervisora). ~38 años. Bata blanca.
  Siempre calmada. Col 0: neutral-amable. Col 1: aprobación. Col 2: preocupación suave.
  Col 3: seria/alerta. Col 4: no aplica — remplazar por col 0.
```

**Detalles de estilo de retratos:**
```
- Pixel art 1:1, sin antialiasing
- Líneas de contorno en #111827 (1px)
- Cabello con highlights de 1px en tono más claro que el color base
- Ojos: 2×2px para el iris, 1px highlight blanco en esquina superior-derecha
- Sombra bajo la barbilla: 1-2px en #1B2133
- Uniforme/ropa: colores de la paleta según rol
  - Psicólogo/guía: #F0EFEA (bata) + #4B7DAF (ropa interior)
  - Paciente adulto: ropa casual, colores neutros
  - Funcionario: verde institución #3A5A40 + detalles mostaza
- Cada portrait debe verse legible al tamaño 64×80px (no solo en zoom 2x)
```

---

### BLOQUE VISUAL D — Sprite Sheets de Avatar del Estudiante

**Destino:** `frontend/src/assets/sprites/avatar/`

El avatar tiene capas separadas. Cada capa es un PNG de la misma dimensión con fondo transparente, mismo layout de frames. El motor combina las capas en orden.

```
DIMENSIÓN POR FRAME: 48×64px
LAYOUT DEL SPRITE SHEET: 8 filas × 6 frames = 48 frames total
Dimensión del sheet: 288×512px

MAPA DE FRAMES:
Fila 0:  idle_down  — 4 frames (cols 0-3), frames 4-5 vacíos
Fila 1:  idle_up    — 4 frames
Fila 2:  idle_left  — 4 frames
Fila 3:  idle_right — 4 frames (o flip de left si es simétrico)
Fila 4:  walk_down  — 6 frames
Fila 5:  walk_up    — 6 frames
Fila 6:  walk_left  — 6 frames
Fila 7:  walk_right — 6 frames (o flip de left)

CICLO DE WALK: paso izquierdo → centro → paso derecho → centro (6f total)
El avatar mira hacia adelante en idle_down, hacia atrás en idle_up
```

**Capas a generar:**

```
CAPA: BODY (base)
Archivo: avatar_body.png
Descripción: silueta base del cuerpo SIN color de piel, SIN ropa. Solo la forma anatómica
con relleno neutro #CCC y contorno #111827. Esta capa define el movimiento.

CAPA: SKIN (4 variantes)
Archivos: avatar_skin_light.png, avatar_skin_medium.png, avatar_skin_dark.png, avatar_skin_dark2.png
Descripción: Solo las áreas de piel expuestas (cara, cuello, manos). 
El resto: transparente.

Para skin_medium (base de referencia):
- Piel: #C68642 (luz), #A0692A (media), #7D4E1A (sombra), #5C3410 (contorno)
- Cara frontal: ojos simples (2×2px iris oscuro, 1px highlight), nariz dot, boca 2px

CAPA: UNIFORM (3 variantes)
Archivos: avatar_uniform_clinic_white.png, avatar_uniform_clinic_blue.png, avatar_uniform_casual.png
Descripción: Ropa del torso y piernas.
- clinic_white: pantalón negro (#2A2A3A), camisa blanca (#F0EFEA)
- clinic_blue: pantalón azul oscuro (#1E3A5A), camisa azul media (#4B7DAF)
- casual: pantalón beige (#D4B896), camiseta gris medio (#7D8290)

CAPA: LABCOAT
Archivo: avatar_labcoat.png
Descripción: Bata blanca encima del uniforme. Visible en todas las animaciones.
Color principal: #F0EFEA. Sombra: #D8D0C8. Botones: #B0A898.
La bata se abre levemente en walk_down para dar sensación de movimiento.

CAPA: HAIR (10 estilos × 8 colores = 80 archivos)
Nomenclatura: avatar_hair_<style>_<color>.png (style: 0-9, color: 0-7)
Estilos (0-9):
  0: corto liso
  1: corto ondulado
  2: media melena lisa
  3: media melena ondulada
  4: cola de caballo alta
  5: trenzas
  6: afro corto
  7: afro mediano
  8: cabello muy corto (casi rapado)
  9: moño alto

Colores (0-7): negro (#1A1A2E), castaño oscuro (#3D2010), castaño (#7A4020),
  rubio miel (#C8A030), rubio claro (#E8D080), rojo (#8B2020), gris (#808090), blanco (#E8E8F0)

GENERACIÓN PRIORITARIA: generar primero estilos 0, 2, 4, 6 en colores 0, 1, 2 (18 archivos)
El resto se genera en fases posteriores.

CAPA: FACE (combinaciones de ojos × cejas × boca)
Eye types 0-7, Brow types 0-5, Mouth types 0-5
Nomenclatura: avatar_face_<eye>_<brow>_<mouth>.png
GENERACIÓN PRIORITARIA: generar ojos 0-3, cejas 0-2, bocas 0-2 = 24 combinaciones

Especificaciones por tipo:
Ojos:
  0: redondos normales
  1: almendrados
  2: pequeños y serios
  3: grandes expresivos
  4: semicerrados (cansado)
  5: con espejuelos (solo contorno, las lentes van en accesorios)
  6: ojos rasgados
  7: ojos grandes con pestañas

Cejas:
  0: rectas normales
  1: arqueadas suaves
  2: fruncidas (serias)
  3: finas arqueadas
  4: gruesas rectas
  5: levantadas (sorpresa habitual)

Bocas:
  0: línea neutra
  1: leve sonrisa
  2: seria/tensa
  3: sonrisa amplia
  4: boca abierta (hablando)
  5: mueca de preocupación

CAPA: ACCESSORIES
Archivos: avatar_acc_glasses.png, avatar_acc_stethoscope.png, avatar_acc_badge.png
- glasses: gafas rectangulares, montura #2A2A3A, lentes con highlight #6CC0C7 muy sutil
- stethoscope: fonendoscopio al cuello, colgando en pecho, color plateado #A8A8B8
- badge: identificación en bolsillo de bata, color blanco con borde #4B7DAF
```

---

### BLOQUE VISUAL E — Sprites de NPCs Ambientales

**Destino:** `frontend/src/assets/sprites/npcs/`

Los NPCs ambientales son personajes que deambulan por los escenarios. Cada uno tiene un sprite sheet de 32×48px (más pequeños que el avatar del jugador para dar perspectiva).

```
DIMENSIÓN: 32×48px por frame
LAYOUT: 4 direcciones × 4 frames walk = 16 frames
Dimensión del sheet: 128×48px (16 frames en una fila)
Frame layout: [walk_down×4] [walk_up×4] [walk_left×4] [walk_right×4]

NPCs a generar:

npc_enfermero.png — Enfermero(a) de hospital. Uniforme azul pálido.
  Movimiento: lento, purposeful. Lleva carpeta en mano.

npc_paciente_espera.png — Paciente en sala de espera. Ropa casual. Aspecto ansioso.
  Movimiento: lento, ligeramente encorvado.

npc_familiar_visita.png — Familiar de visita. Ropa casual de calle.
  Movimiento: normal.

npc_funcionario_comisaria.png — Funcionario caminando por comisaría. Uniforme verde institucional.
  Movimiento: rápido y distraído.

npc_vecino.png — Vecino genérico para escenario de vivienda.
  Movimiento: normal.

Para TODOS los NPCs:
- Cara simple de 2-3 colores (no se ve en detalle durante el juego)
- Contorno #111827
- Sombra en el suelo: elipse semi-transparente 20×6px bajo los pies (en la misma hoja, fila 1)
- Exportar con transparencia
```

---

### BLOQUE VISUAL F — Overlays de Iluminación y Ambiente

**Destino:** `frontend/src/assets/overlays/`

Los overlays son PNGs que se colocan encima del render del mapa en Phaser para crear efectos de ambiente. Se usan en modo `MULTIPLY` o `SCREEN` según el caso.

```
overlay_day_neutral.png — 640×480px
  Gradiente radial suave desde el centro. Centro: transparente. Bordes: #111827 @ 20% opacidad.
  Modo Phaser: MULTIPLY.

overlay_evening.png — 640×480px
  Tonalidad cálida anaranjada. Relleno semitransparente #FF8840 @ 15% opacidad + vignette oscura.
  Modo Phaser: MULTIPLY.

overlay_night.png — 640×480px
  Azul muy oscuro #0A0F1E @ 60% + vignette fuerte. Solo un "halo" de luz en el centro.
  Modo Phaser: MULTIPLY.

overlay_crisis.png — 640×480px
  Rojo muy sutil en bordes #E25A4F @ 15% + vignette intensa. Para crisis emocionales.
  Modo Phaser: SCREEN sobre overlay oscuro.

overlay_hospital_fluorescente.png — 640×480px
  Leve sobreexposición en el centro. Blancos fríos. Borde levemente azulado.
  Modo Phaser: SCREEN @ 10%.

light_cone_warm.png — 128×200px (con transparencia)
  Cono de luz cálido (#F5B84B) proyectado hacia abajo. Para lámparas de escritorio.
  El haz tiene difuminado en los bordes (simular con píxeles semi-transparentes en escalera).

light_cone_cool.png — 128×200px
  Igual pero en cian frío #6CC0C7. Para pantallas de monitor o luces de emergencia.

particle_dust.png — 4×4px
  Mota de polvo blanca. Usada en sistema de partículas Phaser para ambiente.

particle_leaf.png — 8×8px
  Hoja pequeña verde #6EC67A. Para escenas al aire libre o con plantas.
```

---

### BLOQUE VISUAL G — Interfaz de Usuario (UI Kit)

**Destino:** `frontend/src/assets/ui/`

```
PANEL BASE (glass-panel):
No requiere PNG — se hace en CSS. Ya implementado.

CORAZONES DE ESTRÉS:
heart_full.png — 16×16px. Corazón lleno, color #E25A4F. Pixel art sólido.
heart_half.png — 16×16px. Corazón mitad lleno. Mitad derecha vacía.
heart_empty.png — 16×16px. Corazón vacío, solo contorno #7D8290.

BARRA DE PROGRESO DE SESIÓN:
progress_fill.png — 4×8px. Tile que se repite. Gradiente izquierda-derecha #7C4DFF → #B69CFF.
  (En realidad el CSS puede hacer esto — solo generar si el diseñador quiere pixel art explícito)

ICONOS DE HERRAMIENTAS CLÍNICAS (16×16px cada uno):
icon_tool_interview.png — Burbuja de diálogo con persona
icon_tool_observation.png — Ojo abierto
icon_tool_genogram.png — Árbol de familia (triángulo sobre dos cuadrados conectados)
icon_tool_ecomap.png — Círculo con conexiones (red social)
icon_tool_assessment.png — Checklist/formulario
icon_tool_notes.png — Libreta con lápiz

CURSOR PERSONALIZADO (opcional):
cursor_default.png — 16×16px. Flecha pixel art en morado/lavanda.
cursor_interact.png — 16×16px. Mano con dedo índice para objetos interactivos.

LOGO SIEP:
siep_logo.svg — Logo vectorial del sistema. 
  Concepto: letra S estilizada en morado (#7C4DFF) con trazo que forma una silueta de persona
  o símbolo psicológico. Sobre fondo transparente. Legible en dark mode.
siep_logo_small.png — 32×32px versión pixel art del logo.

FLECHA DE GUÍA (guide arrow):
guide_arrow.png — 32×32px. Flecha apuntando hacia abajo, animada (sprite 4 frames bounce).
  Color: #F5B84B (dorado). Para indicar objetos interactivos al estudiante nuevo.
```

---

### BLOQUE VISUAL H — Efectos Visuales de Decisión

**Destino:** `frontend/src/assets/effects/`

Estos son sprites de efectos que aparecen brevemente al tomar una decisión.

```
effect_good_decision.png — 48×48px, 6 frames (en fila horizontal = 288×48px)
  Efecto: partículas/estrellas que explotan hacia afuera en verde/dorado.
  Frame 0: puntos centrales densos. Frame 5: partículas dispersas.
  Colores: #6EC67A + #F5B84B + #FFFFFF.

effect_bad_decision.png — 48×48px, 6 frames
  Efecto: fragmentos/grietas que se propagan en rojo.
  Colores: #E25A4F + #7C4DFF oscuro.

effect_neutral_decision.png — 32×32px, 4 frames
  Efecto: onda circular gris sutil.
  Colores: #7D8290 + #B69CFF.

effect_crisis_pulse.png — 64×64px, 8 frames
  Efecto: pulso de onda expansiva roja cuando el paciente entra en crisis.
  Colores: #E25A4F con borde #111827.

effect_door_transition.png — 320×240px, 4 frames
  Efecto: flash de luz desde un punto central (puerta) que cubre pantalla.
  Frame 0: pequeño halo. Frame 3: pantalla casi blanca. Luego el juego carga nueva sala.
```

---

### BLOQUE VISUAL I — Mapas Tiled (Archivos .json)

**Nota para ChatGPT:** Tiled es un editor de mapas. Los archivos `.json` de Tiled no son imágenes, pero ChatGPT puede generar el JSON con la estructura correcta. Cuando generes estos archivos, usa exactamente el formato de Tiled 1.10 y referencia los tilesets generados en el Bloque Visual B.

**Destino:** `frontend/src/assets/maps/`

**Mapa 1: Consultorio Psicológico Principal** (`consultorio_principal.json`)

El mapa debe tener exactamente 9 capas con estos nombres (orden de renderizado de fondo a frente):

```
1. "ground"       — suelo, toda la habitación. Tiles de suelo del tileset_consultorio.
2. "floor_detail" — alfombra central 4×3 tiles, centrada en la habitación.
3. "walls"        — paredes en los 3 bordes (norte, oeste, este). Borde sur = entrada.
4. "wall_decor"   — cuadros en paredes norte y este. Ventana en pared oeste.
5. "furniture_lo" — escritorio (posición norte-centro), silla psicólogo detrás.
6. "furniture_hi" — diván (posición oeste), estantería (pared este).
7. "objects"      — props: planta, caja pañuelos, lámpara en escritorio.
8. "triggers"     — capa de objetos Tiled (no tiles). Incluir:
                    - Objeto "door_exit" en borde sur, tipo "door", destino "sala_espera"
                    - Objeto "npc_guia_spawn" posición norte-este
                    - Objeto "patient_chair" trigger de interacción
9. "overhead"     — arcos o detalles superiores (puede estar vacía inicialmente)

Dimensiones del mapa: 20×15 tiles (640×480px a 32px/tile)
Punto de spawn del jugador: tile (10, 13) — cerca de la entrada sur
```

**Mapa 2: Sala de Espera Hospital** (`hospital_sala_espera.json`)

```
9 capas con los mismos nombres.
Dimensiones: 24×18 tiles (768×576px)
Layout:
  - Sillas de espera en filas, orientadas al sur (tiles de hospital_interior)
  - Mostrador de recepción en norte
  - Ventana grande en pared este
  - Puertas: "puerta_consultorio" al norte-centro, "salida_hospital" al sur
Spawn jugador: tile (12, 16)
```

**Mapa 3: Sala de Entrevista Comisaría** (`comisaria_entrevista.json`)

```
9 capas.
Dimensiones: 16×12 tiles (512×384px)
Layout: sala pequeña, mesa rectangular central, 2 sillas frente a frente
  - Espejo unidireccional (decorativo) en pared este
  - Puerta de retorno al norte
Spawn: tile (8, 10)
```

**Formato de capas Tiled para la capa "triggers" (tipo objectgroup):**
```json
{
  "name": "triggers",
  "type": "objectgroup",
  "objects": [
    {
      "id": 1, "name": "door_exit", "type": "door",
      "x": 304, "y": 464, "width": 32, "height": 16,
      "properties": [
        {"name": "target_scene", "type": "string", "value": "sala_espera"},
        {"name": "target_x", "type": "int", "value": 320},
        {"name": "target_y", "type": "int", "value": 80}
      ]
    }
  ]
}
```

---

### BLOQUE VISUAL J — Escenarios de Fondo (Backgrounds)

**Destino:** `frontend/src/assets/backgrounds/`

Estos son imágenes estáticas de fondo para pantallas que no son el juego Phaser (inicio de sesión, pantalla de resultados, carga).

```
bg_loading.png — 1280×720px
  Fondo oscuro morado (#111827 → #2A1F3D gradiente radial).
  Logo SIEP al centro, grande. Partículas de polvo/luz muy sutiles.
  Sin texto (el texto lo pone Angular).

bg_outcome_success.png — 1280×720px
  Fondo con tonos cálidos dorados y verdes. Iluminación desde arriba.
  Silueta abstracta de persona de pie en pose de logro.

bg_outcome_failure.png — 1280×720px
  Fondo en tonos fríos azules y morados. Lluvia ligera o niebla.
  Silueta abstracta en pose reflexiva/sentada.

bg_character_editor.png — 1280×720px
  Espacio de sala abstracta con ventana al fondo dando luz suave.
  Plataforma/pedestal circular donde se para el avatar.
  Tonos neutros para que las capas del avatar sean el foco.
```

---

## RESUMEN DE PRIORIDADES DE EJECUCIÓN

### Para Claude Code — orden recomendado:
1. **Bloque L** (seguridad/repo privado) — urgente, dominio clínico
2. **Bloque A** (AudioDirector) — mejora inmediata en experiencia
3. **Bloque H** (WCAG) — cumplimiento RNF-004 no negociable
4. **Bloque D** (Avatar en Phaser) — conecta el editor ya existente al juego
5. **Bloque B** (WebGL/GameFeel) — pulido visual
6. **Bloque C** (Diálogo texto-síntoma) — profundidad clínica
7. **Bloque E** (Social Mapping) — feature nuevo, RQ-NEG-002
8. **Bloque F** (Verbal Tension Box) — feature nuevo, RQ-NEG-003
9. **Bloque G** (RF-027 AI Assistant) — requiere API key de LLM
10. **Bloque I** (CI Quality Gates) — después de que tests existan
11. **Bloque J** (Escenarios adicionales) — requiere assets de ChatGPT
12. **Bloque K** (Landing page) — polish final

### Para ChatGPT — orden recomendado:
1. **Bloque Visual G** (UI Kit + corazones + iconos) — necesario para bloques A, H
2. **Bloque Visual D** (Avatar sprites, versión prioritaria) — necesario para Bloque D
3. **Bloque Visual B** (Tilesets, consultorio primero) — necesario para Bloque J
4. **Bloque Visual C** (Portraits NPCs) — necesario para Bloque C
5. **Bloque Visual E** (NPCs ambientales) — mejora visual
6. **Bloque Visual F** (Overlays de iluminación) — necesario para Bloque B
7. **Bloque Visual H** (Efectos de decisión) — polish
8. **Bloque Visual I** (Mapas Tiled JSON) — necesario para Bloque J
9. **Bloque Visual J** (Backgrounds) — polish final
10. **Bloque Visual A** (Iconos de audio) — menor prioridad

---

*Fin del PLAN_MAESTRO_TOTAL.md — versión 1.0 — 2026-06-07*
*Próxima revisión: cuando se complete el primer ciclo de bloques A-D*
