/**
 * WorldPreviewComponent — Fase 5: Preview real (efimero, draft-safe)
 *
 * Mounts the SAME Phaser runtime (GameWorldComponent) fed by the
 * GET /world-preview endpoint, in ephemeral mode:
 *   - No SimulationAttempt created
 *   - No attempt_events persisted
 *   - No audit_logs for gameplay
 *   - Scoring only in memory
 *
 * Transforms WorldDefinition → SimulationWorldState for compatibility
 * with the existing GameWorldComponent contract.
 */
import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, inject, input, signal, effect } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SimulationService } from '../../core/api/simulation.service';
import {
  ClinicalToolState,
  CollisionZoneState,
  DialogueState,
  MapObjectState,
  SimulationWorldState,
  WorldClinicalTool,
  WorldCollisionZone,
  WorldDefinition,
  WorldDialogueTree,
  WorldObject
} from '../../core/models/simulation.model';
import { DialoguePanelComponent } from './dialogue-panel.component';
import { GameWorldComponent } from './game-world.component';
import { ToolInventoryComponent } from './tool-inventory.component';

// ─── In-memory ephemeral state ──────────────────────────────────────────────

interface EphemeralScore {
  accumulatedScore: number;
  stressIndex: number;
  interactionsCount: number;
  toolsUsed: string[];
  inspectedKeys: string[];
  viewedDialogues: string[];
}

@Component({
  selector: 'app-world-preview',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatProgressBarModule,
    GameWorldComponent,
    DialoguePanelComponent,
    ToolInventoryComponent
  ],
  template: `
    <div class="preview-root">
      <!-- Header bar -->
      <header class="preview-header">
        <div class="preview-badge">
          <mat-icon>visibility</mat-icon>
          <span>Vista previa efimera</span>
        </div>
        <div class="preview-info">
          @if (definition()) {
            <span class="info-chip">Rev {{ definition()!.revision }}</span>
            <span class="info-chip">Schema v{{ definition()!.schemaVersion }}</span>
          }
          @if (ephemeral(); as score) {
            <span class="info-chip score-chip">Puntaje: {{ score.accumulatedScore }}</span>
            <span class="info-chip stress-chip">Estres: {{ score.stressIndex }}%</span>
            <span class="info-chip">Interacciones: {{ score.interactionsCount }}</span>
          }
        </div>
        <div class="preview-actions">
          @if (nodeOptions().length > 1) {
            <select class="node-select" (change)="onNodeChange($event)" [value]="selectedNodeId()">
              @for (node of nodeOptions(); track node.id) {
                <option [value]="node.id">{{ node.label }}</option>
              }
            </select>
          }
          <button class="psy-button psy-button--glass" type="button" (click)="reload()" [disabled]="loading()">
            <mat-icon>refresh</mat-icon>Recargar
          </button>
        </div>
      </header>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @if (previewError()) {
        <div class="preview-error" role="alert">
          <mat-icon>error</mat-icon>
          <span>{{ previewError() }}</span>
          <button class="psy-button psy-button--ghost" type="button" (click)="reload()">Reintentar</button>
        </div>
      }

      @if (validationWarning()) {
        <div class="preview-warning" role="status">
          <mat-icon>warning</mat-icon>
          <span>{{ validationWarning() }}</span>
        </div>
      }

      @if (worldState(); as currentWorld) {
        <div class="preview-board">
          <main class="preview-main">
            <!-- Phaser canvas -->
            <app-game-world
              #gameWorld
              [world]="currentWorld"
              [nearbyInteraction]="nearbyInteraction()"
              [selectedInteractionKey]="selectedInteraction()?.key ?? null"
              (proximity)="nearbyInteraction.set($event)"
              (interact)="openInteraction($event)"
              (positionChange)="updatePosition($event.x, $event.y)" />

            <!-- Dialogue -->
            <app-dialogue-panel
              [dialogue]="dialogue()"
              [interaction]="selectedInteraction()"
              (close)="closeDialogue()"
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
                  {{ nearby.label }} ({{ nearby.type }})
                </span>
              }
            </div>
          </main>

          <aside class="preview-sidebar">
            <!-- Tools -->
            <app-tool-inventory
              [tools]="toolStates()"
              [inventory]="ephemeral().toolsUsed"
              (select)="selectTool($event)" />

            <!-- Accessible interaction list -->
            <section class="interaction-log liquid-glass psy-game-panel">
              <div class="panel-title">
                <p class="psy-eyebrow">Objetos del mapa</p>
                <h3>Exploracion accesible</h3>
              </div>
              <div class="interaction-list">
                @for (obj of currentWorld.objects; track obj.key) {
                  <button
                    type="button"
                    class="interaction-card psy-liquid-ripple"
                    [class.interaction-card--selected]="selectedInteraction()?.key === obj.key"
                    [class.interaction-card--inspected]="ephemeral().inspectedKeys.includes(obj.key)"
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
      }

      @if (!loading() && !worldState() && !previewError()) {
        <div class="preview-empty">
          <mat-icon>map</mat-icon>
          <h3>Sin mapa configurado</h3>
          <p>Este nodo no tiene un mapa asociado. Crea uno en la pestana "Mapas" para habilitar la vista previa.</p>
        </div>
      }
    </div>
  `,
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
    .preview-badge {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      padding: 8px 14px;
      border-radius: 999px;
      background: rgba(79,163,165,.12);
      color: var(--psy-teal-deep, #2a6f6f);
      font-size: .84rem;
      font-weight: 800;
    }
    .preview-info {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .info-chip {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(79,124,172,.08);
      color: var(--psy-blue-deep);
      font-size: .76rem;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
    }
    .score-chip { background: rgba(140,191,166,.16); color: #2f7c5f; }
    .stress-chip { background: rgba(169,155,214,.16); color: #5b4f8f; }

    .preview-actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .node-select {
      padding: 8px 12px;
      border: 1px solid rgba(79,124,172,.22);
      border-radius: 10px;
      background: rgba(255,255,255,.8);
      font-size: .86rem;
      color: var(--psy-ink);
      font-family: inherit;
      max-width: 220px;
    }
    .node-select:focus {
      outline: none;
      border-color: var(--psy-blue);
      box-shadow: 0 0 0 3px var(--psy-focus);
    }

    .preview-error, .preview-warning {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 12px 16px;
      border-radius: 14px;
      font-size: .88rem;
    }
    .preview-error {
      background: rgba(168,80,98,.08);
      border: 1px solid rgba(168,80,98,.24);
      color: #8b3145;
    }
    .preview-warning {
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
    .preview-main {
      display: grid;
      gap: 12px;
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
      transition: transform var(--psy-motion-fast), box-shadow var(--psy-motion-ui), border-color var(--psy-motion-ui);
    }
    .interaction-card:hover, .interaction-card--selected {
      transform: translateY(-1px);
      border-color: rgba(79,124,172,.36);
      box-shadow: 0 18px 34px -28px rgba(47,95,143,.45);
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

    .preview-empty {
      display: grid;
      justify-items: center;
      gap: 12px;
      padding: 48px 16px;
      text-align: center;
    }
    .preview-empty mat-icon {
      font-size: 52px;
      width: 52px;
      height: 52px;
      color: var(--psy-muted);
    }
    .preview-empty h3 {
      margin: 0;
      font-family: 'Poppins', system-ui, sans-serif;
      letter-spacing: 0;
      color: var(--psy-ink);
    }
    .preview-empty p {
      margin: 0;
      color: var(--psy-muted);
      max-width: 440px;
    }

    @media (max-width: 1100px) {
      .preview-board { grid-template-columns: 1fr; }
    }
    @media (max-width: 680px) {
      .preview-header { display: grid; }
      .preview-actions { width: 100%; }
      .node-select { width: 100%; max-width: none; }
    }
  `]
})
export class WorldPreviewComponent implements OnInit {
  private readonly simulationService = inject(SimulationService);

  /** Case version ID to preview — passed from the parent case editor. */
  readonly caseVersionId = input.required<number>();

  /** Available nodes from the editor model, for the node selector dropdown. */
  readonly nodes = input<{ id: number; key: string; title: string }[]>([]);

  @ViewChild('gameWorld') private gameWorld?: GameWorldComponent;

  readonly loading = signal(false);
  readonly previewError = signal('');
  readonly validationWarning = signal('');
  readonly definition = signal<WorldDefinition | null>(null);
  readonly worldState = signal<SimulationWorldState | null>(null);
  readonly selectedNodeId = signal<number | null>(null);
  readonly nearbyInteraction = signal<MapObjectState | null>(null);
  readonly selectedInteraction = signal<MapObjectState | null>(null);
  readonly dialogue = signal<DialogueState | null>(null);
  readonly playerPos = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  readonly toolStates = signal<ClinicalToolState[]>([]);

  readonly ephemeral = signal<EphemeralScore>({
    accumulatedScore: 0,
    stressIndex: 0,
    interactionsCount: 0,
    toolsUsed: [],
    inspectedKeys: [],
    viewedDialogues: []
  });

  /** Computed node options for the dropdown. */
  readonly nodeOptions = signal<{ id: number; label: string }[]>([]);

  constructor() {
    // React to node list changes from parent
    effect(() => {
      const nodes = this.nodes();
      this.nodeOptions.set(
        nodes.map(n => ({ id: n.id, label: `${n.key} — ${n.title}` }))
      );
      // Auto-select the first node if none selected
      if (!this.selectedNodeId() && nodes.length > 0) {
        this.selectedNodeId.set(nodes[0].id);
      }
    });
  }

  ngOnInit(): void {
    // Initial load is deferred until the first node is selected
    if (this.nodes().length > 0) {
      this.selectedNodeId.set(this.nodes()[0].id);
      this.loadPreview();
    }
  }

  onNodeChange(event: Event): void {
    const nodeId = Number((event.target as HTMLSelectElement).value);
    this.selectedNodeId.set(nodeId);
    this.resetEphemeral();
    this.loadPreview();
  }

  reload(): void {
    this.resetEphemeral();
    this.loadPreview();
  }

  // ─── Interaction (ephemeral, in-memory) ───────────────────────────────────

  openInteraction(obj: MapObjectState): void {
    this.selectedInteraction.set(obj);
    this.gameWorld?.focus(obj.key);

    // Track inspection in memory
    const eph = this.ephemeral();
    if (!eph.inspectedKeys.includes(obj.key)) {
      this.ephemeral.set({
        ...eph,
        inspectedKeys: [...eph.inspectedKeys, obj.key],
        interactionsCount: eph.interactionsCount + 1
      });
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

  /** Simulate a decision execution (ephemeral — score in memory only). */
  simulateDecision(decisionOptionId: number): void {
    // In ephemeral mode, we just show feedback without backend persistence
    const eph = this.ephemeral();
    this.ephemeral.set({
      ...eph,
      accumulatedScore: eph.accumulatedScore + 10, // placeholder score delta
      interactionsCount: eph.interactionsCount + 1
    });

    this.dialogue.set(null);
    this.selectedInteraction.set(null);
    this.nearbyInteraction.set(null);
  }

  /** Simulate tool usage (ephemeral — no backend persistence). */
  simulateToolUse(toolCode: string): void {
    const eph = this.ephemeral();
    if (!eph.toolsUsed.includes(toolCode)) {
      this.ephemeral.set({
        ...eph,
        toolsUsed: [...eph.toolsUsed, toolCode]
      });
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

  private loadPreview(): void {
    const cvId = this.caseVersionId();
    const nodeId = this.selectedNodeId() ?? undefined;

    if (!cvId) return;

    this.loading.set(true);
    this.previewError.set('');
    this.validationWarning.set('');
    this.worldState.set(null);
    this.definition.set(null);

    this.simulationService.worldPreview(cvId, nodeId).subscribe({
      next: (def: WorldDefinition) => {
        this.definition.set(def);

        // Check validation state for warnings
        if (def.validation && !def.validation.canPublish) {
          const errorCount = def.validation.errors?.length ?? 0;
          const warnCount = def.validation.warnings?.length ?? 0;
          this.validationWarning.set(
            `Validacion: ${errorCount} error(es), ${warnCount} advertencia(s). Corrige los errores antes de publicar.`
          );
        }

        // Transform WorldDefinition → SimulationWorldState
        const worldState = this.toWorldState(def);
        this.worldState.set(worldState);

        // Extract tool states
        this.toolStates.set(
          def.clinicalTools.map(t => this.toToolState(t))
        );

        // Set initial player position from map spawn
        this.playerPos.set({ x: def.map.spawnX, y: def.map.spawnY });

        this.loading.set(false);
      },
      error: (err) => {
        const status = err?.status;
        if (status === 404) {
          this.previewError.set('No hay mapa configurado para este nodo. Crea uno en la pestana "Mapas".');
        } else if (status === 400) {
          this.previewError.set('El caso no tiene un nodo con mapa asociado.');
        } else {
          this.previewError.set('No se pudo cargar la vista previa. Verifica que el caso exista y tengas permisos.');
        }
        this.loading.set(false);
      }
    });
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

  private resetEphemeral(): void {
    this.ephemeral.set({
      accumulatedScore: 0,
      stressIndex: 0,
      interactionsCount: 0,
      toolsUsed: [],
      inspectedKeys: [],
      viewedDialogues: []
    });
    this.selectedInteraction.set(null);
    this.nearbyInteraction.set(null);
    this.dialogue.set(null);
  }
}
