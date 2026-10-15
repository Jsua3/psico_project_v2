/**
 * WorldPreviewComponent — Fase 5: Preview real (efimero, draft-safe)
 *
 * Mounts the SAME Phaser runtime (GameWorldComponent) fed by the
 * GET /world-preview endpoint, in ephemeral mode:
 *   - No SimulationAttempt created
 *   - No attempt_events persisted
 *   - No audit_logs for gameplay
 *   - No score: the preview only counts what the author did (objects inspected, decisions tried)
 *
 * Transforms WorldDefinition → SimulationWorldState for compatibility
 * with the existing GameWorldComponent contract.
 *
 * F8-6: reloading or changing node never unmounts the board (Phaser is not destroyed and recreated; the world
 * input changes in place), a late response from an earlier request is dropped, and there are no invented metrics.
 */
import {
  ChangeDetectionStrategy, Component, DestroyRef, ViewChild, computed, effect, inject, input, signal, untracked,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { AuthoringApi } from '../../core/api/authoring.api';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { objectTypeLabel, plural } from '../../shared/ui/labels';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { ERROR_STATE_COPY } from '../../shared/ui/state/state-copy';
import { errorKindFromStatus } from '../../shared/ui/state/ui-data-state';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import {
  ClinicalToolState,
  CollisionZoneState,
  DialogueState,
  MapObjectState,
  SimulationWorldState,
  WorldClinicalTool,
  WorldCollisionZone,
  WorldDefinition,
  WorldObject
} from '../../core/models/simulation.model';
import { nodeOptionLabel } from './case-editor.options';
import { DialoguePanelComponent } from './dialogue-panel.component';
import { GameWorldComponent } from './game-world.component';
import { ToolInventoryComponent } from './tool-inventory.component';

/** Lo que el autor ha hecho en esta vista previa (solo en memoria; nada de puntaje inventado). */
const DECISION_TRIED_TEXT =
  'Decisión probada: en la simulación real se registraría y el caso avanzaría; aquí no se guarda ni se califica.';

@Component({
  selector: 'app-world-preview',
  standalone: true,
  imports: [
    MatIconModule,
    GameWorldComponent,
    DialoguePanelComponent,
    ToolInventoryComponent,
    UiBadge,
    UiButton,
    UiControl,
    UiEmptyState,
    UiErrorState,
    UiField,
    UiSkeleton,
  ],
  template: `
    <div class="preview-root">
      <!-- Header bar -->
      <header class="preview-header">
        <div class="preview-heading">
          <ui-badge tone="info">Vista previa efímera</ui-badge>
          <p class="preview-note">Nada de lo que hagas aquí se guarda ni se califica.</p>
        </div>
        <div class="preview-info" role="group" aria-label="Estado de la vista previa">
          @if (definition(); as def) {
            <ui-badge>Revisión {{ def.revision }}</ui-badge>
            <ui-badge>Esquema v{{ def.schemaVersion }}</ui-badge>
          }
          @if (worldState(); as world) {
            <ui-badge>Objetos revisados: {{ inspectedKeys().length }} de {{ world.objects.length }}</ui-badge>
            <ui-badge>Decisiones probadas: {{ decisionsTried().length }}</ui-badge>
          }
        </div>
        <div class="preview-actions">
          @if (nodeOptions().length > 1) {
            <ui-field class="node-field" label="Nodo">
              <select uiControl (change)="onNodeChange($event)" [value]="selectedNodeId()">
                @for (node of nodeOptions(); track node.id) {
                  <option [value]="node.id">{{ node.label }}</option>
                }
              </select>
            </ui-field>
          }
          <button ui-button type="button" variant="secondary" icon="refresh" [loading]="loading()" (click)="reload()">
            Recargar
          </button>
        </div>
      </header>

      <!-- Región viva siempre presente: qué está pasando con la vista previa. -->
      <p class="preview-feedback" role="status">{{ statusText() }}</p>

      @if (previewError(); as message) {
        <ui-error-state
          [kind]="errorKind()"
          [message]="message"
          [status]="errorStatus()"
          (retry)="reload()" />
      }

      @if (validationWarning()) {
        <div class="preview-warning" role="status">
          <mat-icon>warning</mat-icon>
          <span>{{ validationWarning() }}</span>
        </div>
      }

      @if (worldState(); as currentWorld) {
        <div class="preview-board" [class.preview-board--refreshing]="loading()" [attr.aria-busy]="loading()">
          <div class="preview-main">
            <div class="preview-stage">
              <!-- Phaser canvas -->
              <app-game-world
                #gameWorld
                [world]="currentWorld"
                [nearbyInteraction]="nearbyInteraction()"
                [selectedInteractionKey]="selectedInteraction()?.key ?? null"
                [reduceMotion]="reduceMotion()"
                (proximity)="nearbyInteraction.set($event)"
                (interact)="openInteraction($event)"
                (positionChange)="updatePosition($event.x, $event.y)" />
            </div>

            <!-- Dialogue -->
            <app-dialogue-panel
              [reduceMotion]="reduceMotion()"
              [dialogue]="dialogue()"
              [interaction]="selectedInteraction()"
              (close)="closeDialogue()"
              (safeExit)="closeDialogue()"
              (execute)="simulateDecision($event)"
              (useTool)="simulateToolUse($event)" />

            <!-- Position & interaction info -->
            <div class="preview-status-bar">
              <span class="pos-indicator">
                <mat-icon>my_location</mat-icon>
                {{ playerPos().x }}, {{ playerPos().y }}
              </span>
              @if (nearbyInteraction(); as nearby) {
                <span class="proximity-indicator">
                  <mat-icon>touch_app</mat-icon>
                  {{ nearby.label }} ({{ objectTypeLabel(nearby.type) }})
                </span>
              }
            </div>
          </div>

          <aside class="preview-sidebar">
            <!-- Tools -->
            <app-tool-inventory
              [tools]="toolStates()"
              [inventory]="toolsUsed()"
              (select)="selectTool($event)" />

            <!-- Accessible interaction list -->
            <section class="interaction-log liquid-glass psy-game-panel">
              <div class="panel-title">
                <p class="psy-eyebrow">Objetos del mapa</p>
                <h3>Exploración accesible</h3>
              </div>
              <div class="interaction-list">
                @for (obj of currentWorld.objects; track obj.key) {
                  <button
                    type="button"
                    class="interaction-card psy-liquid-ripple"
                    [class.interaction-card--selected]="selectedInteraction()?.key === obj.key"
                    [class.interaction-card--inspected]="inspectedKeys().includes(obj.key)"
                    (click)="openInteraction(obj)">
                    <span class="interaction-dot" [style.background]="obj.color">{{ obj.shortCode }}</span>
                    <span>
                      <em>{{ obj.interactionPrompt }}</em>
                      <strong>{{ obj.label }}</strong>
                    </span>
                  </button>
                }
              </div>
            </section>
          </aside>
        </div>
      } @else if (loading()) {
        <!-- Primera carga: la forma del tablero, para que la pantalla no salte cuando llegue. -->
        <div class="preview-placeholder" aria-busy="true">
          <ui-skeleton shape="chart" />
        </div>
      } @else if (!previewError()) {
        <ui-empty-state
          title="Sin mapa configurado"
          description="Este nodo no tiene un mapa asociado. Crea uno en la pestaña «Mapas» para habilitar la vista previa." />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .preview-root { display: grid; gap: 14px; }

    .preview-header {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
    }
    .preview-heading {
      display: grid;
      gap: 6px;
      justify-items: start;
    }
    .preview-note {
      margin: 0;
      color: var(--ds-text-2);
      font-size: var(--ds-type-caption-size);
    }
    .preview-info {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .preview-actions {
      display: flex;
      gap: 10px;
      align-items: flex-end;
    }
    .node-field { min-width: 14rem; max-width: 22rem; }
    .preview-feedback {
      margin: 0;
      min-height: 1.25rem;
      color: var(--ds-text-2);
      font-size: var(--ds-type-body-s-size);
    }

    .preview-warning {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 12px 16px;
      border-radius: 14px;
      font-size: .88rem;
      background: rgba(198,168,80,.08);
      border: 1px solid rgba(198,168,80,.24);
      color: #7a6320;
    }

    .preview-board {
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(280px, .55fr);
      gap: 16px;
      align-items: start;
    }
    /* Recargando: el tablero sigue ahí (no se desmonta), solo se atenúa mientras llega lo nuevo. */
    .preview-board--refreshing .preview-stage { opacity: .6; }
    .preview-main {
      display: grid;
      gap: 12px;
    }
    /* El lienzo mide a su contenedor en píxeles físicos: el mundo necesita una caja de tamaño definido. */
    .preview-stage {
      position: relative;
      aspect-ratio: 16 / 9;
      transition: opacity var(--ds-dur-slow) var(--ds-ease-out);
    }
    @media (prefers-reduced-motion: reduce) {
      .preview-stage { transition: none; }
    }
    .preview-stage app-game-world {
      position: absolute;
      inset: 0;
    }
    .preview-placeholder {
      display: grid;
      aspect-ratio: 16 / 9;
      max-width: 100%;
    }

    .preview-status-bar {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      padding: 8px 4px;
    }
    .pos-indicator, .proximity-indicator {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      font-size: .78rem;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      color: var(--psy-muted);
    }
    .proximity-indicator {
      color: var(--psy-teal-deep, #2a6f6f);
    }

    .preview-sidebar { display: grid; gap: 14px; }

    .interaction-log {
      display: grid;
      gap: 14px;
      padding: 18px;
      border-radius: 22px;
    }
    .panel-title h3 { margin: 0; font-family: 'Poppins', system-ui, sans-serif; letter-spacing: 0; }
    .interaction-list {
      display: grid;
      gap: 10px;
      max-height: 340px;
      overflow: auto;
      padding-right: 2px;
    }
    .interaction-card {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      min-height: 60px;
      padding: 10px;
      border: 1px solid rgba(79,124,172,.16);
      border-radius: 16px;
      background: rgba(255,255,255,.62);
      color: var(--psy-ink);
      text-align: left;
      cursor: pointer;
      transition: box-shadow 150ms ease, border-color 150ms ease;
    }
    .interaction-card--selected {
      border-color: rgba(79,124,172,.36);
      box-shadow: 0 18px 34px -28px rgba(47,95,143,.45);
    }
    @media (hover: hover) and (pointer: fine) {
      .interaction-card:hover {
        border-color: rgba(79,124,172,.36);
        box-shadow: 0 18px 34px -28px rgba(47,95,143,.45);
      }
    }
    .interaction-card--inspected {
      border-color: rgba(140,191,166,.36);
      background: rgba(140,191,166,.06);
    }
    .interaction-dot {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: 14px;
      color: #fff;
      font-size: .72rem;
      font-weight: 900;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.45);
    }
    .interaction-card em {
      display: block;
      color: var(--psy-muted);
      font-size: .68rem;
      font-style: normal;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .interaction-card strong {
      display: block;
      margin-top: 3px;
      color: var(--psy-ink);
      line-height: 1.22;
    }

    @media (max-width: 1100px) {
      .preview-board { grid-template-columns: 1fr; }
    }
    @media (max-width: 680px) {
      .preview-header { display: grid; }
      .preview-actions { width: 100%; }
      .node-field { max-width: none; flex: 1; }
    }
  `]
})
export class WorldPreviewComponent {
  readonly objectTypeLabel = objectTypeLabel;
  private readonly authoringApi = inject(AuthoringApi);
  private readonly destroyRef = inject(DestroyRef);

  /** Case version ID to preview — passed from the parent case editor. */
  readonly caseVersionId = input.required<number>();

  /** Available nodes from the editor model, for the node selector dropdown. */
  readonly nodes = input<{ id: number; key: string; title: string }[]>([]);

  /** Preferencia del sistema; la vista previa no tiene el interruptor del HUD. */
  readonly reduceMotion = signal(
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  @ViewChild('gameWorld') private gameWorld?: GameWorldComponent;

  readonly loading = signal(false);
  readonly previewError = signal('');
  readonly errorStatus = signal<number | null>(null);
  readonly validationWarning = signal('');
  readonly definition = signal<WorldDefinition | null>(null);
  readonly worldState = signal<SimulationWorldState | null>(null);
  readonly selectedNodeId = signal<number | null>(null);
  readonly nearbyInteraction = signal<MapObjectState | null>(null);
  readonly selectedInteraction = signal<MapObjectState | null>(null);
  readonly dialogue = signal<DialogueState | null>(null);
  readonly playerPos = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  readonly toolStates = signal<ClinicalToolState[]>([]);

  /** Lo que el autor hizo en esta vista previa (en memoria; se reinicia al recargar o cambiar de nodo). */
  readonly inspectedKeys = signal<string[]>([]);
  readonly decisionsTried = signal<number[]>([]);
  readonly toolsUsed = signal<string[]>([]);

  /** El último aviso de una acción del autor («Vista previa actualizada», «Decisión probada…»). */
  private readonly lastMessage = signal('');

  /** Lo que dice la región viva: cargando, actualizada o lo que se hizo. */
  readonly statusText = computed(() => {
    if (this.loading()) return this.worldState() ? 'Actualizando la vista previa…' : 'Cargando la vista previa…';
    return this.lastMessage();
  });

  readonly errorKind = computed(() => errorKindFromStatus(this.errorStatus()));

  /** Computed node options for the dropdown ("Título (clave)"). */
  readonly nodeOptions = computed(() =>
    this.nodes().map(n => ({ id: n.id, label: nodeOptionLabel(n) })));

  /** La petición en vuelo: una nueva la cancela, y su respuesta tardía ya no pisa a la última. */
  private inflight: Subscription | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.inflight?.unsubscribe());
    // Primera carga: en cuanto hay nodos y ninguno elegido, se elige el primero y se carga su vista previa.
    effect(() => {
      const first = this.nodes()[0];
      if (!first || untracked(() => this.selectedNodeId()) !== null) return;
      untracked(() => {
        this.selectedNodeId.set(first.id);
        this.loadPreview();
      });
    });
  }

  onNodeChange(event: Event): void {
    const nodeId = Number((event.target as HTMLSelectElement).value);
    this.selectedNodeId.set(nodeId);
    this.resetProgress();
    this.loadPreview();
  }

  reload(): void {
    this.resetProgress();
    this.loadPreview();
  }

  // ─── Interaction (ephemeral, in-memory) ───────────────────────────────────

  openInteraction(obj: MapObjectState): void {
    this.selectedInteraction.set(obj);
    this.gameWorld?.focus(obj.key);

    // Track inspection in memory
    if (!this.inspectedKeys().includes(obj.key)) {
      this.inspectedKeys.update(keys => [...keys, obj.key]);
    }

    // Build dialogue from WorldDefinition if available
    const def = this.definition();
    if (def) {
      const dialogue = this.findDialogueForObject(obj.key, def);
      this.dialogue.set(dialogue);
    }
  }

  closeDialogue(): void {
    this.dialogue.set(null);
  }

  /**
   * Probar una decisión: en la vista previa no hay intento ni servidor que la evalúe, así que solo se anota que se
   * probó (sin puntaje) y se dice con claridad qué haría la simulación real.
   */
  simulateDecision(decisionOptionId: number): void {
    if (!this.decisionsTried().includes(decisionOptionId)) {
      this.decisionsTried.update(ids => [...ids, decisionOptionId]);
    }
    this.lastMessage.set(DECISION_TRIED_TEXT);
    this.dialogue.set(null);
    this.selectedInteraction.set(null);
    this.nearbyInteraction.set(null);
  }

  /** Simulate tool usage (ephemeral — no backend persistence). */
  simulateToolUse(toolCode: string): void {
    if (!this.toolsUsed().includes(toolCode)) {
      this.toolsUsed.update(codes => [...codes, toolCode]);
    }
  }

  selectTool(toolCode: string): void {
    const tool = this.toolStates().find(t => t.code === toolCode);
    if (!tool) return;

    // Show tool info as dialogue (same pattern as simulation-play)
    this.dialogue.set({
      key: tool.code,
      speakerName: 'Herramienta profesional',
      portraitKey: tool.icon,
      emotion: 'neutral',
      lines: [{ order: 1, speakerName: tool.label, text: tool.description, emotion: 'neutral' }],
      choices: []
    });
    this.selectedInteraction.set({
      key: `tool-${tool.code}`,
      label: tool.label,
      type: 'TOOL',
      x: 0, y: 0, width: 0, height: 0,
      color: '#4FA3A5',
      icon: tool.icon,
      shortCode: tool.code.slice(0, 4),
      collision: false,
      interactionPrompt: 'Herramienta profesional',
      interactionText: tool.description,
      decisionOptionId: null,
      toolCode: tool.code,
      dialogue: null
    });
  }

  updatePosition(x: number, y: number): void {
    this.playerPos.set({ x, y });
    // NO backend persistence in ephemeral mode
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Pide el mundo del nodo elegido. El tablero que ya está en pantalla NO se desmonta: mientras llega la respuesta
   * sigue ahí (atenuado) y al llegar el mundo cambia en su sitio. Una petición nueva cancela la anterior.
   */
  private loadPreview(): void {
    const cvId = this.caseVersionId();
    const nodeId = this.selectedNodeId() ?? undefined;

    if (!cvId) return;

    this.inflight?.unsubscribe();
    this.loading.set(true);
    this.previewError.set('');
    this.errorStatus.set(null);
    this.validationWarning.set('');
    this.lastMessage.set('');

    this.inflight = this.authoringApi.worldPreview(cvId, nodeId).subscribe({
      next: (def: WorldDefinition) => this.onLoaded(def),
      error: (err) => this.onFailed(err, nodeId),
    });
  }

  private onLoaded(def: WorldDefinition): void {
    const reloaded = this.worldState() !== null;
    this.definition.set(def);

    // Check validation state for warnings
    if (def.validation && !def.validation.canPublish) {
      const errorCount = def.validation.errors?.length ?? 0;
      const warnCount = def.validation.warnings?.length ?? 0;
      this.validationWarning.set(
        `Validación: ${plural(errorCount, 'error', 'errores')}, ${plural(warnCount, 'advertencia')}. Corrige los errores antes de publicar.`
      );
    }

    // Transform WorldDefinition → SimulationWorldState
    this.worldState.set(this.toWorldState(def));

    // Extract tool states
    this.toolStates.set(def.clinicalTools.map(t => this.toToolState(t)));

    // Set initial player position from map spawn
    this.playerPos.set({ x: def.map.spawnX, y: def.map.spawnY });

    this.lastMessage.set(reloaded ? 'Vista previa actualizada.' : 'Vista previa lista.');
    this.loading.set(false);
  }

  private onFailed(err: { status?: number } | null, requestedNodeId: number | undefined): void {
    const status = err?.status ?? null;
    // El tablero que hay en pantalla solo se conserva si es del mismo nodo que se pidió: si no, el selector dice
    // un nodo y el tablero muestra otro.
    const hadBoard = this.worldState() !== null;
    const sameNode = requestedNodeId === undefined || this.definition()?.nodeId === requestedNodeId;
    const keepBoard = hadBoard && sameNode;
    if (hadBoard && !keepBoard) {
      this.worldState.set(null);
      this.definition.set(null);
      this.toolStates.set([]);
    }

    let message: string;
    if (status === 404) {
      message = 'No hay mapa configurado para este nodo. Crea uno en la pestaña «Mapas».';
    } else if (status === 400) {
      message = 'El caso no tiene un nodo con mapa asociado.';
    } else {
      message = ERROR_STATE_COPY[errorKindFromStatus(status)].message;
    }
    if (keepBoard) message += ' Se conserva la última versión cargada.';

    this.errorStatus.set(status);
    this.previewError.set(message);
    this.loading.set(false);
  }

  /**
   * Transform WorldDefinition (Fase 2 contract) → SimulationWorldState
   * (the format GameWorldComponent expects from the student runtime).
   *
   * This is the key bridge between the authoring contract and the game engine.
   */
  private toWorldState(def: WorldDefinition): SimulationWorldState {
    return {
      attemptId: 'preview-ephemeral', // Sentinel — never persisted
      status: 'IN_PROGRESS',
      map: {
        id: def.map.id,
        key: def.map.key,
        title: def.map.title,
        width: def.map.width,
        height: def.map.height,
        theme: def.map.theme,
        spawnX: def.map.spawnX,
        spawnY: def.map.spawnY,
        ambient: def.map.ambient
      },
      player: {
        x: def.map.spawnX,
        y: def.map.spawnY
      },
      objects: def.objects
        .filter(o => o.visible)
        .map(o => this.toMapObjectState(o, def)),
      collisions: def.collisionZones.map(z => this.toCollisionState(z)),
      tools: def.clinicalTools.map(t => this.toToolState(t)),
      inventory: [],
      inspectedObjectKeys: [],
      viewedDialogueKeys: [],
      usedToolKeys: [],
      flags: {}
    };
  }

  private toMapObjectState(obj: WorldObject, def: WorldDefinition): MapObjectState {
    // Map WorldObjectType → MapObjectState type (V6 object types)
    const typeMap: Record<string, MapObjectState['type']> = {
      PERSON: 'PERSON',
      PROP: 'OBJECT',
      TOOL_TARGET: 'TOOL',
      EXIT: 'EXIT',
      TRIGGER: 'OBJECT',
      NOTE: 'OBJECT',
      RESOURCE: 'OBJECT',
      OBJECT: 'OBJECT',
      ROUTE: 'ROUTE',
      TOOL: 'TOOL',
      WARNING: 'WARNING'
    };

    // Find dialogue for this object
    const dialogueTree = def.dialogues.find(d => d.mapObjectId === obj.id);
    const dialogue: DialogueState | null = dialogueTree ? {
      key: dialogueTree.key,
      speakerName: dialogueTree.speakerName,
      portraitKey: dialogueTree.portraitKey,
      emotion: dialogueTree.emotion,
      lines: dialogueTree.lines.map(l => ({
        order: l.order,
        speakerName: l.speakerName,
        text: l.text,
        emotion: l.emotion
      })),
      choices: dialogueTree.choices.map(c => ({
        key: c.key,
        text: c.text,
        decisionOptionId: c.decisionOptionId,
        requiredToolCode: c.requiredToolCode,
        effect: c.effect
      }))
    } : null;

    return {
      key: obj.key,
      label: obj.label,
      type: typeMap[obj.type] ?? 'OBJECT',
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height,
      color: obj.colorHex,
      icon: obj.icon,
      shortCode: obj.shortCode,
      collision: obj.collision,
      interactionPrompt: obj.interactionPrompt,
      interactionText: obj.interactionText,
      decisionOptionId: obj.decisionOptionId,
      toolCode: obj.toolCode,
      dialogue
    };
  }

  private toCollisionState(zone: WorldCollisionZone): CollisionZoneState {
    return {
      key: zone.key,
      label: zone.label,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height
    };
  }

  private toToolState(tool: WorldClinicalTool): ClinicalToolState {
    return {
      code: tool.code,
      label: tool.label,
      icon: tool.icon,
      category: tool.category,
      description: tool.description,
      active: tool.active
    };
  }

  private findDialogueForObject(objectKey: string, def: WorldDefinition): DialogueState | null {
    // Find the WorldObject by key
    const obj = def.objects.find(o => o.key === objectKey);
    if (!obj) return null;

    // Find dialogue tree linked to this object
    const dialogueTree = def.dialogues.find(d => d.mapObjectId === obj.id);
    if (!dialogueTree) {
      // Fall back to object's own interaction text as simple dialogue
      if (obj.interactionText) {
        return {
          key: obj.key,
          speakerName: obj.label,
          portraitKey: null,
          emotion: 'neutral',
          lines: [{ order: 1, speakerName: obj.label, text: obj.interactionText, emotion: 'neutral' }],
          choices: []
        };
      }
      return null;
    }

    return {
      key: dialogueTree.key,
      speakerName: dialogueTree.speakerName,
      portraitKey: dialogueTree.portraitKey,
      emotion: dialogueTree.emotion,
      lines: dialogueTree.lines.map(l => ({
        order: l.order,
        speakerName: l.speakerName,
        text: l.text,
        emotion: l.emotion
      })),
      choices: dialogueTree.choices.map(c => ({
        key: c.key,
        text: c.text,
        decisionOptionId: c.decisionOptionId,
        requiredToolCode: c.requiredToolCode,
        effect: c.effect
      }))
    };
  }

  /** Reinicia lo que el autor hizo y cierra el diálogo: el mundo que viene es otro (o el mismo, recién leído). */
  private resetProgress(): void {
    this.inspectedKeys.set([]);
    this.decisionsTried.set([]);
    this.toolsUsed.set([]);
    this.selectedInteraction.set(null);
    this.nearbyInteraction.set(null);
    this.dialogue.set(null);
  }
}
