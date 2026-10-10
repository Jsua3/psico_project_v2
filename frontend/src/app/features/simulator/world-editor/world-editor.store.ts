/**
 * WorldEditorStore — Fase 4: Editor de mundo MVP
 *
 * Pure Signals-based state management with undo/redo command stack.
 * No NgRx — uses Angular Signals for reactive state + command pattern.
 *
 * Responsibilities:
 *   - Load WorldDefinition from backend
 *   - Track local edits via command stack (undo/redo)
 *   - Auto-save with debounce → PUT /world with revision
 *   - Handle 409 Conflict (optimistic lock) without silent data loss
 *   - Run validation on demand
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Subject, debounceTime, switchMap, catchError, of, EMPTY } from 'rxjs';
import { AuthoringApi } from '../../../core/api/authoring.api';
import {
  WorldDefinition,
  WorldObject,
  WorldCollisionZone,
  WorldValidationState,
  WorldSaveRequest,
  SceneMapDefinition,
  WorldDialogueTree,
  WorldOutgoingDecision,
  WorldRoom
} from '../../../core/models/simulation.model';

// ─── Command Pattern ────────────────────────────────────────────────────────

export interface EditorCommand {
  readonly type: string;
  execute(state: EditorState): EditorState;
  undo(state: EditorState): EditorState;
}

export class PlaceObjectCommand implements EditorCommand {
  readonly type = 'PlaceObject';
  constructor(private readonly object: WorldObject) {}

  execute(state: EditorState): EditorState {
    return { ...state, objects: [...state.objects, this.object] };
  }

  undo(state: EditorState): EditorState {
    return { ...state, objects: state.objects.filter(o => o.key !== this.object.key) };
  }
}

export class MoveObjectCommand implements EditorCommand {
  readonly type = 'MoveObject';
  constructor(
    private readonly key: string,
    private readonly fromX: number,
    private readonly fromY: number,
    private readonly toX: number,
    private readonly toY: number
  ) {}

  execute(state: EditorState): EditorState {
    return {
      ...state,
      objects: state.objects.map(o =>
        o.key === this.key ? { ...o, x: this.toX, y: this.toY } : o
      )
    };
  }

  undo(state: EditorState): EditorState {
    return {
      ...state,
      objects: state.objects.map(o =>
        o.key === this.key ? { ...o, x: this.fromX, y: this.fromY } : o
      )
    };
  }
}

export class ResizeZoneCommand implements EditorCommand {
  readonly type = 'ResizeZone';
  constructor(
    private readonly key: string,
    private readonly from: { x: number; y: number; width: number; height: number },
    private readonly to: { x: number; y: number; width: number; height: number }
  ) {}

  execute(state: EditorState): EditorState {
    return {
      ...state,
      collisionZones: state.collisionZones.map(z =>
        z.key === this.key ? { ...z, ...this.to } : z
      )
    };
  }

  undo(state: EditorState): EditorState {
    return {
      ...state,
      collisionZones: state.collisionZones.map(z =>
        z.key === this.key ? { ...z, ...this.from } : z
      )
    };
  }
}

/** Cambia solo la etiqueta de una zona de colisión (su geometría no se toca). */
export class SetZoneLabelCommand implements EditorCommand {
  readonly type = 'SetZoneLabel';
  private previous: string | null = null;

  constructor(private readonly key: string, private readonly label: string) {}

  execute(state: EditorState): EditorState {
    this.previous = state.collisionZones.find(z => z.key === this.key)?.label ?? null;
    return this.withLabel(state, this.label);
  }

  undo(state: EditorState): EditorState {
    return this.withLabel(state, this.previous);
  }

  private withLabel(state: EditorState, label: string | null): EditorState {
    return {
      ...state,
      collisionZones: state.collisionZones.map(z =>
        z.key === this.key ? { ...z, label } : z
      )
    };
  }
}

export class DeleteObjectCommand implements EditorCommand {
  readonly type = 'DeleteObject';
  private deleted: WorldObject | null = null;

  constructor(private readonly key: string) {}

  execute(state: EditorState): EditorState {
    this.deleted = state.objects.find(o => o.key === this.key) ?? null;
    return { ...state, objects: state.objects.filter(o => o.key !== this.key) };
  }

  undo(state: EditorState): EditorState {
    if (!this.deleted) return state;
    return { ...state, objects: [...state.objects, this.deleted] };
  }
}

export class UpdateInspectorCommand implements EditorCommand {
  readonly type = 'UpdateInspector';
  private previous: WorldObject | null = null;

  constructor(private readonly key: string, private readonly updates: Partial<WorldObject>) {}

  execute(state: EditorState): EditorState {
    this.previous = state.objects.find(o => o.key === this.key) ?? null;
    return {
      ...state,
      objects: state.objects.map(o =>
        o.key === this.key ? { ...o, ...this.updates } : o
      )
    };
  }

  undo(state: EditorState): EditorState {
    if (!this.previous) return state;
    return {
      ...state,
      objects: state.objects.map(o =>
        o.key === this.key ? this.previous! : o
      )
    };
  }
}

export class PlaceCollisionZoneCommand implements EditorCommand {
  readonly type = 'PlaceCollisionZone';
  constructor(private readonly zone: WorldCollisionZone) {}

  execute(state: EditorState): EditorState {
    return { ...state, collisionZones: [...state.collisionZones, this.zone] };
  }

  undo(state: EditorState): EditorState {
    return { ...state, collisionZones: state.collisionZones.filter(z => z.key !== this.zone.key) };
  }
}

export class DeleteCollisionZoneCommand implements EditorCommand {
  readonly type = 'DeleteCollisionZone';
  private deleted: WorldCollisionZone | null = null;

  constructor(private readonly key: string) {}

  execute(state: EditorState): EditorState {
    this.deleted = state.collisionZones.find(z => z.key === this.key) ?? null;
    return { ...state, collisionZones: state.collisionZones.filter(z => z.key !== this.key) };
  }

  undo(state: EditorState): EditorState {
    if (!this.deleted) return state;
    return { ...state, collisionZones: [...state.collisionZones, this.deleted] };
  }
}

export class UpdateSpawnCommand implements EditorCommand {
  readonly type = 'UpdateSpawn';
  private previousX = 0;
  private previousY = 0;

  constructor(private readonly x: number, private readonly y: number) {}

  execute(state: EditorState): EditorState {
    this.previousX = state.map.spawnX;
    this.previousY = state.map.spawnY;
    return { ...state, map: { ...state.map, spawnX: this.x, spawnY: this.y } };
  }

  undo(state: EditorState): EditorState {
    return { ...state, map: { ...state.map, spawnX: this.previousX, spawnY: this.previousY } };
  }
}

// ─── Dialogue commands ───────────────────────────────────────────────────────

export class UpsertDialogueCommand implements EditorCommand {
  readonly type = 'UpsertDialogue';
  private previous: WorldDialogueTree | null = null;

  constructor(private readonly objectKey: string, private readonly tree: WorldDialogueTree) {}

  execute(state: EditorState): EditorState {
    this.previous = state.dialogues.find(d => d.mapObjectKey === this.objectKey) ?? null;
    const others = state.dialogues.filter(d => d.mapObjectKey !== this.objectKey);
    return { ...state, dialogues: [...others, this.tree] };
  }

  undo(state: EditorState): EditorState {
    const others = state.dialogues.filter(d => d.mapObjectKey !== this.objectKey);
    return { ...state, dialogues: this.previous ? [...others, this.previous] : others };
  }
}

export class DeleteDialogueCommand implements EditorCommand {
  readonly type = 'DeleteDialogue';
  private previous: WorldDialogueTree | null = null;

  constructor(private readonly objectKey: string) {}

  execute(state: EditorState): EditorState {
    this.previous = state.dialogues.find(d => d.mapObjectKey === this.objectKey) ?? null;
    return { ...state, dialogues: state.dialogues.filter(d => d.mapObjectKey !== this.objectKey) };
  }

  undo(state: EditorState): EditorState {
    if (!this.previous) return state;
    return { ...state, dialogues: [...state.dialogues, this.previous] };
  }
}

export class SetMapAmbientCommand implements EditorCommand {
  readonly type = 'SetMapAmbient';
  private previous: Record<string, unknown> = {};
  constructor(private readonly ambient: Record<string, unknown>) {}

  execute(state: EditorState): EditorState {
    this.previous = state.map.ambient;
    return { ...state, map: { ...state.map, ambient: this.ambient } };
  }

  undo(state: EditorState): EditorState {
    return { ...state, map: { ...state.map, ambient: this.previous } };
  }
}

export class SetMapFieldsCommand implements EditorCommand {
  readonly type = 'SetMapFields';
  private previous: SceneMapDefinition | null = null;
  constructor(private readonly updates: Partial<SceneMapDefinition>) {}

  execute(state: EditorState): EditorState {
    this.previous = state.map;
    return { ...state, map: { ...state.map, ...this.updates } };
  }

  undo(state: EditorState): EditorState {
    return this.previous ? { ...state, map: this.previous } : state;
  }
}

// ─── Composite ──────────────────────────────────────────────────────────────

/**
 * Varios comandos que se apilan, se ejecutan y se deshacen como uno solo.
 * Es un comando más (puede contener otros macros): el store no distingue uno simple de uno compuesto.
 */
export class MacroCommand implements EditorCommand {
  constructor(readonly type: string, private readonly commands: readonly EditorCommand[]) {}

  /** En orden: cada comando recibe el estado que dejó el anterior. */
  execute(state: EditorState): EditorState {
    return this.commands.reduce((current, command) => command.execute(current), state);
  }

  /** En orden inverso: el último comando ejecutado es el primero en deshacerse. */
  undo(state: EditorState): EditorState {
    return this.commands.reduceRight((current, command) => command.undo(current), state);
  }
}

/** Borra un objeto y el diálogo que colgaba de él, en un único paso del historial. */
export class DeleteObjectWithDialogueCommand extends MacroCommand {
  constructor(objectKey: string) {
    super('DeleteObjectWithDialogue', [
      new DeleteObjectCommand(objectKey),
      new DeleteDialogueCommand(objectKey)
    ]);
  }
}

// ─── Editor State ───────────────────────────────────────────────────────────

export interface EditorState {
  map: SceneMapDefinition;
  objects: WorldObject[];
  collisionZones: WorldCollisionZone[];
  dialogues: WorldDialogueTree[];
}

/** Pure builder for the world-save payload. Sends edited dialogues from state. */
export function buildWorldSaveRequest(def: WorldDefinition, state: EditorState): WorldSaveRequest {
  return {
    revision: def.revision,
    map: state.map,
    objects: state.objects,
    collisionZones: state.collisionZones,
    dialogues: state.dialogues,
    clinicalTools: def.clinicalTools,
  };
}

export type EditorTool = 'select' | 'place-object' | 'place-collision' | 'place-spawn' | 'pan';

/** Cuántos pasos recuerda el historial de deshacer; al pasarse, se descarta el más antiguo. */
export const MAX_UNDO_STEPS = 100;

// ─── Store ──────────────────────────────────────────────────────────────────

@Injectable()
export class WorldEditorStore {
  private readonly authoringApi = inject(AuthoringApi);

  // ─── Source of truth ───────────────────────────────────────────────────
  readonly definition = signal<WorldDefinition | null>(null);
  readonly editorState = signal<EditorState | null>(null);
  readonly selectedKey = signal<string | null>(null);
  readonly activeTool = signal<EditorTool>('select');
  readonly zoom = signal(1);
  readonly panOffset = signal({ x: 0, y: 0 });
  readonly pathEditMode = signal(false);

  // ─── Command stack ────────────────────────────────────────────────────
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);

  // ─── Status ───────────────────────────────────────────────────────────
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly dirty = signal(false);
  readonly error = signal('');
  readonly conflictDetected = signal(false);
  readonly validationState = signal<WorldValidationState | null>(null);
  readonly availableDecisions = signal<WorldOutgoingDecision[]>([]);
  readonly rooms = signal<WorldRoom[]>([]);

  // ─── Auto-save debounce ───────────────────────────────────────────────
  private readonly saveSubject = new Subject<void>();
  private caseVersionId = 0;
  private nodeId: number | undefined;

  // ─── Computed ─────────────────────────────────────────────────────────
  readonly selectedObject = computed(() => {
    const key = this.selectedKey();
    const state = this.editorState();
    if (!key || !state) return null;
    return state.objects.find(o => o.key === key) ?? null;
  });

  readonly selectedZone = computed(() => {
    const key = this.selectedKey();
    const state = this.editorState();
    if (!key || !state) return null;
    return state.collisionZones.find(z => z.key === key) ?? null;
  });

  readonly selectedDialogue = computed(() => {
    const key = this.selectedKey();
    const state = this.editorState();
    if (!key || !state) return null;
    return state.dialogues.find(d => d.mapObjectKey === key) ?? null;
  });

  readonly objectCount = computed(() => this.editorState()?.objects.length ?? 0);
  readonly zoneCount = computed(() => this.editorState()?.collisionZones.length ?? 0);

  constructor() {
    // Auto-save pipeline: debounce 1500ms → PUT /world
    this.saveSubject.pipe(
      debounceTime(1500),
      switchMap(() => this.executeSave()),
      catchError(err => {
        if (err?.status === 409) {
          this.conflictDetected.set(true);
          this.error.set('Este caso cambio en otra sesion. Tus cambios locales se conservan. Recarga para ver la version mas reciente.');
        } else {
          this.error.set('No se pudo guardar el borrador.');
        }
        this.saving.set(false);
        return EMPTY;
      })
    ).subscribe(def => {
      if (def) {
        this.definition.set(def);
        this.adoptSavedIds(def);
        this.saving.set(false);
        this.dirty.set(false);
      }
    });
  }

  /**
   * A-05b: lo nuevo se numera en el editor con ids locales y el servidor devuelve los reales. Se
   * adoptan por clave, sin tocar nada más y sin pasar por la pila de deshacer: así el siguiente
   * guardado actualiza las filas en lugar de volver a crearlas. Si ningún id cambia, el estado es
   * el mismo objeto (no hay repintado).
   */
  private adoptSavedIds(def: WorldDefinition): void {
    const objectIds = new Map(def.objects.map(o => [o.key, o.id]));
    const zoneIds = new Map(def.collisionZones.map(z => [z.key, z.id]));
    const treeIds = new Map(def.dialogues.map(d => [d.key, d.id]));

    this.editorState.update(state => {
      if (!state) return state;
      let changed = false;

      const objects = state.objects.map(o => {
        const id = objectIds.get(o.key);
        if (id === undefined || id === o.id) return o;
        changed = true;
        return { ...o, id };
      });
      const collisionZones = state.collisionZones.map(z => {
        const id = zoneIds.get(z.key);
        if (id === undefined || id === z.id) return z;
        changed = true;
        return { ...z, id };
      });
      const dialogues = state.dialogues.map(d => {
        const id = treeIds.get(d.key) ?? d.id;
        const owner = d.mapObjectKey !== undefined ? objectIds.get(d.mapObjectKey) : undefined;
        const mapObjectId = owner ?? d.mapObjectId;
        if (id === d.id && mapObjectId === d.mapObjectId) return d;
        changed = true;
        return { ...d, id, mapObjectId };
      });

      return changed ? { ...state, objects, collisionZones, dialogues } : state;
    });
  }

  // ─── Load ─────────────────────────────────────────────────────────────

  load(caseVersionId: number, nodeId?: number): void {
    this.caseVersionId = caseVersionId;
    this.nodeId = nodeId;
    this.loading.set(true);
    this.error.set('');
    this.conflictDetected.set(false);
    this.resetCommandStack();

    this.authoringApi.worldEditor(caseVersionId, nodeId).subscribe({
      next: def => {
        this.definition.set(def);
        const objKeyById = new Map(def.objects.map(o => [o.id, o.key]));
        const dialogues = def.dialogues.map(d => ({
          ...d,
          mapObjectKey: d.mapObjectKey
            ?? (d.mapObjectId != null ? objKeyById.get(d.mapObjectId) : undefined),
        }));
        this.editorState.set({
          map: { ...def.map },
          objects: [...def.objects],
          collisionZones: [...def.collisionZones],
          dialogues,
        });
        this.availableDecisions.set(def.availableDecisions ?? []);
        this.rooms.set(def.rooms ?? []);
        this.validationState.set(def.validation);
        this.loading.set(false);
        this.dirty.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el mundo para edicion.');
        this.loading.set(false);
      }
    });
  }

  // ─── Command execution ────────────────────────────────────────────────

  execute(command: EditorCommand): void {
    const current = this.editorState();
    if (!current) return;

    const next = command.execute(current);
    this.editorState.set(next);
    this.undoStack.push(command);
    // Tope: se descarta el paso más antiguo. Rehacer solo guarda pasos que salieron de esta pila,
    // así que deshacer y rehacer juntos tampoco superan MAX_UNDO_STEPS.
    if (this.undoStack.length > MAX_UNDO_STEPS) this.undoStack.shift();
    this.redoStack = []; // Clear redo on new action
    this.updateStackSignals();
    this.markDirty();
  }

  undo(): void {
    const command = this.undoStack.pop();
    if (!command) return;
    const current = this.editorState();
    if (!current) return;

    const prev = command.undo(current);
    this.editorState.set(prev);
    this.redoStack.push(command);
    this.updateStackSignals();
    this.markDirty();
  }

  redo(): void {
    const command = this.redoStack.pop();
    if (!command) return;
    const current = this.editorState();
    if (!current) return;

    const next = command.execute(current);
    this.editorState.set(next);
    this.undoStack.push(command);
    this.updateStackSignals();
    this.markDirty();
  }

  // ─── Selection ────────────────────────────────────────────────────────

  select(key: string | null): void {
    this.selectedKey.set(key);
  }

  // ─── Tools ────────────────────────────────────────────────────────────

  setTool(tool: EditorTool): void {
    this.activeTool.set(tool);
    if (tool !== 'select') this.selectedKey.set(null);
  }

  // ─── Zoom/Pan ─────────────────────────────────────────────────────────

  setZoom(z: number): void {
    this.zoom.set(Math.max(0.25, Math.min(4, z)));
  }

  setPan(x: number, y: number): void {
    this.panOffset.set({ x, y });
  }

  // ─── Save (manual) ───────────────────────────────────────────────────

  saveNow(): void {
    this.saveSubject.next();
  }

  // ─── Validate ─────────────────────────────────────────────────────────

  validate(): void {
    this.authoringApi.validateWorld(this.caseVersionId).subscribe({
      next: vs => this.validationState.set(vs),
      error: () => this.error.set('No se pudo ejecutar la validacion.')
    });
  }

  // ─── Reload after conflict ────────────────────────────────────────────

  reloadAfterConflict(): void {
    this.conflictDetected.set(false);
    this.load(this.caseVersionId, this.nodeId);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  /** Generate a unique key for new objects. */
  generateKey(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}`;
  }

  /** Next sequential ID (local only, backend assigns real IDs on save). */
  nextLocalId(): number {
    const state = this.editorState();
    if (!state) return 1;
    const maxObj = Math.max(0, ...state.objects.map(o => o.id));
    const maxZone = Math.max(0, ...state.collisionZones.map(z => z.id));
    return Math.max(maxObj, maxZone) + 1;
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private markDirty(): void {
    this.dirty.set(true);
    this.saveSubject.next(); // Trigger debounced auto-save
  }

  private executeSave() {
    const def = this.definition();
    const state = this.editorState();
    if (!def || !state) return of(null);

    this.saving.set(true);
    const body = buildWorldSaveRequest(def, state);
    return this.authoringApi.saveWorld(this.caseVersionId, body, this.nodeId);
  }

  private resetCommandStack(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.updateStackSignals();
  }

  private updateStackSignals(): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
  }
}
