# Spec: Rediseño HUD Simulador SIEP

**Fecha:** 2026-06-08  
**Rama objetivo:** `feat/plan-maestro-total`  
**Referencia visual:** `docs/interfaces/` (ver lista en `docs/NUEVO HUD PARA JUEGO.md`)

---

## Problema

La pantalla de juego actual muestra simultáneamente: hero/header administrativo, minimapa fijo, panel derecho permanente (narrativa + decisión + trazabilidad + AI assistant + recursos), dock de herramientas vertical, diálogo inferior, bitácora flotante y canvas Phaser — todo al mismo tiempo. El resultado es saturado, el canvas queda aplastado (`inset: 198px 372px 124px 14px`), y el juego parece un dashboard 2D en lugar de un simulador 2.5D.

## Objetivo

Reconstruir el layout para que el escenario jugable sea el protagonista. El HUD debe tener estados claros. Solo un panel secundario grande a la vez.

---

## Tipos reales verificados

```typescript
// SimulationAttemptState.status
'IN_PROGRESS' | 'SAFE_EXITED' | 'COMPLETED'

// MapObjectState.type
'PERSON' | 'OBJECT' | 'ROUTE' | 'TOOL' | 'WARNING' | 'EXIT'

// ClinicalToolState
{ code: string; label: string; icon: string; category: string; description: string; active: boolean; }
```

---

## Layout principal

### CSS Grid en `simulation-play.component.scss`

```
game-container
  ├── Row 1: top-bar       → SimulationHudComponent
  ├── Row 2: canvas-zone   → GameWorldComponent + (panel derecho condicional)
  └── Row 3: bottom-zone   → safe-exit | ToolInventoryComponent | context-bar
```

**Alturas:**

| Breakpoint | Top bar height |
|---|---|
| Desktop (>1024px) | `clamp(72px, 8vh, 104px)` |
| Tablet (≤1024px) | `clamp(64px, 7vh, 88px)` |
| Mobile (≤760px) | `clamp(56px, 9vh, 72px)` |

`canvas-zone` usa `flex: 1` (ocupa todo el espacio restante).  
`bottom-zone` usa `height: auto` (se ajusta al contenido del dock).

### Canvas-zone: columnas condicionales

```scss
// Sin diálogo (explore, journal, outcome)
.canvas-zone { display: grid; grid-template-columns: 1fr; }

// Con panel derecho (dialogue-right)
.game-container[data-mode="dialogue-right"] .canvas-zone {
  grid-template-columns: 1fr clamp(340px, 28vw, 480px);
  transition: grid-template-columns 220ms ease;
}
```

**Mobile (≤760px):** nunca columna lateral. El panel derecho se convierte en bottom sheet (`position: fixed; bottom: 0; left: 0; right: 0; height: 65vh`).

---

## Estado `viewMode` (TypeScript signal)

```typescript
type ViewMode = 'explore' | 'dialogue-right' | 'dialogue-cinematic' | 'journal' | 'outcome';

readonly viewMode = computed<ViewMode>(() => {
  const att = this.attempt();
  // null/undefined → loading/error → mantener explore (overlays de loading/error ya existen)
  if (!att) return 'explore';
  if (att.status === 'COMPLETED' || att.status === 'SAFE_EXITED') return 'outcome';
  if (this.journalOpen()) return 'journal';
  const dlg = this.dialogue();
  if (dlg) {
    const hasChoices = (dlg.choices?.length ?? 0) > 0;
    const isPerson = this.selectedInteraction()?.type === 'PERSON';
    return (hasChoices && isPerson) ? 'dialogue-right' : 'dialogue-cinematic';
  }
  return 'explore';
});
```

**Regla:** `outcome` solo cuando el intento tiene status `COMPLETED` o `SAFE_EXITED`.  
`null` attempt siempre cae a `explore` porque los overlays de loading/error se renderizan por separado.

### Señales adicionales

```typescript
readonly aiAssistantOpen  = signal(false);
readonly socialMapOpen    = signal(false);
```

---

## DOM: qué desaparece

| Elemento actual | Acción |
|---|---|
| `.simulator-hero` (big header) | **Eliminar** — contenido absorbido por HudComponent |
| `.support-panel` (panel derecho permanente) | **Eliminar** — contenido redistribuido |
| `app-minimap.minimap-layer` | **Eliminar** de layout fijo → botón en top bar abre overlay |
| `.controls-hint` | **Eliminar** — redundante |
| `.journal-toggle` (botón flotante) | **Eliminar** → botón en top bar |
| `.safe-exit-btn` (botón absoluto suelto) | **Eliminar** → integrado en `bottom-zone` |
| `app-ai-assistant` (dentro de support-panel) | **Eliminar** del layout permanente → overlay desde top bar |

## DOM: qué se convierte en overlay

| Contenido | Nuevo destino |
|---|---|
| AI assistant | Modal overlay activado desde botón top bar |
| Social map | Modal overlay activado desde botón top bar |
| Minimap | Modal overlay activado desde botón top bar (si se conserva) |
| Journal / bitácora | `JournalPanelComponent` como modal centrado |
| Resultado final | `AttemptOutcomeComponent` como overlay full |

## Contenido redistribuido del `support-panel`

| Contenido anterior | Nuevo destino |
|---|---|
| Narrativa del escenario + título nodo | Panel derecho `DialoguePanelComponent` (Estado B) |
| Advertencia ética | Badge dentro del panel derecho Estado B |
| Panel de decisión (interaction seleccionada) | Panel derecho Estado B |
| Bitácora / trazabilidad | `JournalPanelComponent` (inputs adicionales) |
| Recursos de apoyo | `JournalPanelComponent` (section adicional) |
| AI assistant | Overlay desde botón top bar |

---

## Cambios por componente

### `SimulationPlayComponent`

**Responsabilidad:** orquestador de layout y estado. No renderiza lógica de juego.

**TS — solo añadir:**
- `viewMode` computed (ver arriba)
- `aiAssistantOpen = signal(false)`
- `socialMapOpen = signal(false)`
- Mantener todas las señales y métodos existentes sin cambios

**Template — estructura:**
```html
<div class="game-container" [attr.data-mode]="viewMode()">
  <!-- overlays globales existentes: loading, error, resume, scene-fade, stress-vignette -->

  @if (attempt(); as game) {
    <app-simulation-hud
      class="top-bar"
      [attempt]="game"
      [stressPulse]="stressPulse()"
      [nearbyInteractionKey]="nearbyInteraction()?.key ?? null"
      [verbalTension]="verbalTension()"
      (openJournal)="journalOpen.set(true)"
      (openAI)="aiAssistantOpen.set(true)"
      (openSocialMap)="socialMapOpen.set(true)" />

    <div class="canvas-zone">
      <app-game-world ... />          <!-- sin cambios en inputs/outputs -->

      <!-- Tarjeta de objetivo: flotante sobre canvas, esquina superior izquierda -->
      @if (sceneObjective(); as obj) {
        <div class="objective-card" role="status">
          <span class="obj-label">OBJETIVO ACTUAL</span>
          <p>{{ obj }}</p>
        </div>
      }

      <!-- Panel derecho: solo en Estado B, delegado a DialoguePanelComponent -->
      @if (viewMode() === 'dialogue-right') {
        <app-dialogue-panel
          class="right-panel"
          mode="side-panel"
          [dialogue]="dialogue()"
          [interaction]="selectedInteraction()"
          (close)="closeDialogue()"
          (execute)="executeDecision($event)"
          (useTool)="useTool($event)"
          (frontendChoice)="handleFrontendChoice($event)" />
      }
    </div>

    <div class="bottom-zone">
      <!-- Salida segura: bloque separado izquierda, NO dentro del tool-dock -->
      @if (game.status === 'IN_PROGRESS') {
        <button class="safe-exit" type="button" (click)="safeExit()" [disabled]="busy()">
          <mat-icon aria-hidden="true">exit_to_app</mat-icon>
          <span class="safe-exit__label">SALIDA SEGURA</span>
          <span class="safe-exit__sub">Finalizar simulación</span>
        </button>
      }

      <!-- Dock de herramientas horizontal -->
      <app-tool-inventory
        class="tool-dock"
        [tools]="world()?.tools ?? []"
        [inventory]="world()?.inventory ?? []"
        (select)="selectTool($event)" />

      <!-- Barra de contexto -->
      <div class="context-bar" aria-label="Contexto actual">
        <span>{{ contextDay() }}</span>
        <span class="ctx-sep" aria-hidden="true">|</span>
        <span>{{ game.currentNode.title }}</span>
        @if (contextTip()) {
          <span class="ctx-sep" aria-hidden="true">|</span>
          <span class="ctx-tip">{{ contextTip() }}</span>
        }
      </div>
    </div>

    <!-- Diálogo cinematográfico (Estado C) — fuera del canvas-zone -->
    @if (viewMode() === 'dialogue-cinematic') {
      <app-dialogue-panel
        class="dialogue-cinematic-layer"
        mode="cinematic"
        [dialogue]="dialogue()"
        [interaction]="selectedInteraction()"
        (close)="closeDialogue()"
        (execute)="executeDecision($event)"
        (useTool)="useTool($event)"
        (frontendChoice)="handleFrontendChoice($event)" />
    }

    <!-- Proximity hint (sin cambios) -->
    <!-- Overlays: journal, outcome, AI assistant, social map -->
    <app-journal-panel
      [open]="journalOpen()"
      [disabled]="game.status !== 'IN_PROGRESS' || busy()"
      [message]="journalMessage()"
      [saveState]="journalSaveState()"
      [visitedStages]="visitedStageLabels()"
      [supportResources]="supportResources()"
      (save)="saveReflection($event)"
      (closeSheet)="journalOpen.set(false)" />

    <app-attempt-outcome
      [report]="game.completionReport"
      [status]="game.status"
      (retry)="startNewAttempt()" />

    @if (aiAssistantOpen()) {
      <div class="ai-overlay" role="dialog">
        <button class="overlay-close" (click)="aiAssistantOpen.set(false)">
          <mat-icon>close</mat-icon>
        </button>
        <app-ai-assistant
          [attemptId]="game.attemptId"
          [currentNodeId]="game.currentNode.key"
          [decisionAlreadyTaken]="game.status !== 'IN_PROGRESS'" />
      </div>
    }
  }
</div>
```

**Métodos computed nuevos en TS (`SimulationPlayComponent`):**
```typescript
// Barra de contexto — usa datos ya disponibles, sin nuevo contrato con backend
readonly contextStage = computed(() =>
  this.currentStageLabel()); // ya existe en el componente

readonly contextTip = computed(() =>
  getSceneObjective(this.attempt()?.currentNode.key) ?? null); // ya existe via getSceneObjective

// selectedToolCode para estado activo del dock
readonly selectedToolCode = computed(() =>
  this.selectedInteraction()?.toolCode ?? null);
```

La barra de contexto muestra: `{etapa} | {currentNode.title} | {tip si existe}`

---

### `SimulationHudComponent`

**Responsabilidad:** barra superior con presencia de videojuego. Solo lectura de estado; emite eventos.

**Cambios en template:**
1. Eliminar `.hud-social-panel` (fila de social map)
2. Expandir `.hud-strip` a `min-height: clamp(72px, 8vh, 104px)`
3. Agregar zona central izquierda: `game.caseTitle` + etapa (`currentStageLabel`)
4. Agregar métricas como bloques compactos: progreso (bloques violetas + %), estrés (bloques naranja/rojo + %), puntaje (⭐ + pts)
5. Agregar 3 botones icono a la derecha: `(openJournal)`, `(openAI)`, `(openSocialMap)`
6. Eliminar `.hud-objective-line` → pasa a `objective-card` en canvas-zone del padre

**Outputs nuevos:**
```typescript
readonly openJournal   = output<void>();
readonly openAI        = output<void>();
readonly openSocialMap = output<void>();
```

**Inputs existentes:** todos se mantienen (`attempt`, `stressPulse`, `nearbyInteractionKey`, `verbalTension`).

---

### `ToolInventoryComponent`

**Responsabilidad:** dock horizontal de herramientas psicopedagógicas.

**Cambios:**
- `.tool-hud`: `flex-direction: row; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory`
- Cada botón: icono (28px) + nombre (`tool.label`) + descripción corta (1 línea, `tool.description` truncada a ~40 chars) + número de atajo + estado activo (borde violeta + glow)
- Input nuevo: `selectedToolCode = input<string | null>(null)` para estado activo visual — el padre lo pasa via `selectedToolCode()` computed desde `selectedInteraction()?.toolCode`
- Mobile: carrusel horizontal con `scroll-snap-align: start`
- `ClinicalToolState.active` se usa para indicar nivel/disponibilidad

**Contrato mantenido:** input `tools`, input `inventory`, output `select` — sin cambios.

---

### `DialoguePanelComponent`

**Responsabilidad:** renderiza diálogo en dos modos.

**Cambio único:**
```typescript
readonly mode = input<'cinematic' | 'side-panel'>('cinematic');
```

**Modo `cinematic` (Estado C):** layout actual — strip inferior ancho, portrait izquierda, texto centro, opciones derecha. Referencia: `interfaz_dialogos.png`.

**Modo `side-panel` (Estado B):** panel lateral derecho.
- Nombre NPC + rol (desde `dialogue.speakerName`)
- Retrato pequeño (portrait pixel art)
- Caja de texto del NPC con typing animation existente
- Opciones como tarjetas verticales, colores por intención (según modelo real `DialogueChoiceState`):
  - Violeta/brillo: `isRecommended === true`
  - Rojo/naranja: `isProhibited === true`
  - Neutral (blanco/gris): sin flag (default)
  - **Nota:** `DialogueChoiceState` no tiene campo `category`/`intent`; los colores dorado y azul de las referencias son aspiracionales y requieren extensión del modelo en una fase posterior.
- Los dos modos son mutuamente excluyentes; el padre decide cuál renderizar mediante `@if`.

**Nota:** el componente no renderiza dos modos simultáneamente. El padre usa dos instancias `@if` separadas.

---

### `JournalPanelComponent`

**Responsabilidad:** overlay modal centrado del diario de reflexión.

**Cambios estructurales:**
- De `position: absolute; right: 0; width: min(400px, 88vw)` → `position: fixed; inset: 0; display: grid; place-items: center; background: rgba(0,0,0,.72)`
- Panel interno: `max-width: 720px; width: 92vw; max-height: 88vh; overflow-y: auto`
- Al abrirse durante diálogo: no cierra el diálogo; al cerrarse vuelve al estado anterior (el `viewMode` computed lo maneja automáticamente)

**Inputs adicionales:**
```typescript
readonly visitedStages   = input<string[]>([]);
readonly supportResources = input<string[]>([]);
```

**Contenido nuevo en panel:**
- Sección de bitácora/trazabilidad (lista `visitedStages`)
- Sección de recursos de apoyo (`supportResources`)
- Botones: `GUARDAR REFLEXIÓN` (existente) + `CONTINUAR SIMULACIÓN` (cierra overlay)

---

### `AttemptOutcomeComponent`

**Responsabilidad:** overlay de cierre de simulación. Ya es un overlay; ajuste visual menor.

**Cambios:** actualizar estilos para que el panel central se parezca a la referencia `(4).png`: fondo oscurecido, panel centrado, título `SIMULACIÓN COMPLETADA`, métricas, retroalimentación, botones `VER RETROALIMENTACIÓN` / `REINTENTAR CASO` / `VOLVER AL PORTAL`.

---

## Capturas de verificación requeridas

Carpeta: `docs/audit-hud-redesign-2026-06-08/`

| Archivo | Estado validado |
|---|---|
| `desktop-explore.png` | Estado A: canvas dominante, HUD arriba, dock abajo, sin panel derecho |
| `desktop-dialogue-right.png` | Estado B: panel lateral `clamp(340px,28vw,480px)`, canvas comprimido |
| `desktop-dialogue-cinematic.png` | Estado C: strip inferior, escenario visible detrás |
| `desktop-journal.png` | Estado D: modal centrado sobre escenario oscurecido |
| `desktop-outcome.png` | Estado E: overlay de resultado sobre escenario |
| `mobile-explore.png` | Canvas dominante en 375px, dock horizontal scrollable |
| `mobile-dialogue.png` | Bottom sheet diálogo en lugar de columna lateral |

---

## Criterios de aceptación (de la spec original)

1. Exploración normal → HUD superior, escenario amplio, objetivo pequeño, dock inferior, salida segura.
2. Canvas dominante, no aplastado por paneles.
3. Panel derecho solo en diálogo/decisión.
4. Diálogo cinematográfico sin chocar con dock.
5. Diario como overlay modal.
6. Resultado como overlay modal.
7. Mobile: sin textos cortados, sin elementos encimados, sin botones inaccesibles.
8. Herramientas con icono + nombre + descripción + estado activo.
9. Progreso, estrés y puntaje como tarjetas compactas en barra superior.
10. Salida segura visible y funcional.
11. Sin errores 404 de assets ni errores de consola.
12. `npm run build` pasa.
13. Capturas reales desktop y mobile entregadas.
