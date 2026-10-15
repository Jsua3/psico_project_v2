/**
 * WorldEditorStore — Fase 4: Editor de mundo MVP
 *
 * Pure Signals-based state management with undo/redo command stack.
 * No NgRx — uses Angular Signals for reactive state + command pattern.
 *
 * Responsibilities:
 *   - Load WorldDefinition from backend
 *   - Track local edits via command stack (undo/redo)
 *   - Auto-save with debounce → PUT /world with revision (F8-5: sobrevive a un error, guarda al instante con
 *     `saveNow`/`retrySave` y no escribe el estado de una sala bajo otra). Los guardados van EN SERIE: uno que va en
 *     vuelo no se cancela (el servidor ya pudo aplicarlo) y el siguiente se arma cuando termina, con los ids reales
 *     y la revisión que devolvió; lo editado durante el vuelo sigue pendiente.
 *   - Handle 409 Conflict (optimistic lock) without silent data loss
 *   - Run validation on demand
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, Subject, Subscription, debounceTime, concatMap, catchError, of, EMPTY, map, merge } from 'rxjs';
import { AuthoringApi } from '../../../core/api/authoring.api';
import { RevisionConflict, revisionConflictOf } from '../../../core/api/revision-conflict.util';
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
  /** El 409 de la última orden de guardado: la revisión vigente del servidor (para «Reintentar con mi cambio»). */
  readonly conflict = signal<RevisionConflict | null>(null);
  /** El último intento de guardado falló (la orden «Reintentar» lo repite al instante). */
  readonly saveFailed = signal(false);
  /** Cuándo se guardó por última vez (null: aún no en esta sesión). */
  readonly lastSavedAt = signal<number | null>(null);
  /** La versión no es un borrador (o no hay permiso): se mira, no se edita ni se guarda. */
  readonly readOnly = signal(false);
  readonly validationState = signal<WorldValidationState | null>(null);
  readonly availableDecisions = signal<WorldOutgoingDecision[]>([]);
  readonly rooms = signal<WorldRoom[]>([]);

  // ─── Auto-save ────────────────────────────────────────────────────────
  /** Cada cambio: se guarda tras 1500 ms de calma. */
  private readonly saveSubject = new Subject<void>();
  /** «Guardar», Ctrl+S y «Reintentar»: se guarda ya. */
  private readonly flushSubject = new Subject<void>();
  /** Cambia en cada carga: un guardado de la sala anterior que llega tarde no pisa la sala nueva. */
  private generation = 0;
  /** Sube con cada edición: al terminar un guardado se sabe si hubo ediciones DESPUÉS de armar su cuerpo. */
  private editVersion = 0;
  private caseVersionId = 0;
  /** El nodo de la sala que HAY en pantalla (se fija al llegar la carga, no al pedirla). */
  private nodeId: number | undefined;
  /** Una sala pedida mientras había algo por guardar: se carga cuando ese guardado termine bien. */
  private pendingRoom: number | null = null;
  private loadSubscription: Subscription | null = null;

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
    // Auto-save pipeline: debounce 1500 ms (o ya, con saveNow/retrySave) → PUT /world.
    // El `catchError` va DENTRO de `executeSave`: un fallo cierra solo ESE guardado y el flujo sigue vivo (antes un error
    // lo completaba y los cambios siguientes ya no se guardaban solos hasta recargar).
    // `concatMap`: los guardados van en serie. Un guardado en vuelo NO se cancela (el servidor ya pudo aplicarlo y
    // cancelarlo perdía los ids reales: el siguiente volvía a crear lo nuevo y chocaba con la clave única) y el
    // cuerpo del siguiente se arma cuando le toca, con el estado, los ids y la revisión de ese momento.
    merge(this.saveSubject.pipe(debounceTime(1500)), this.flushSubject).pipe(
      concatMap(() => this.executeSave()),
    ).subscribe(result => {
      if (!result || result.generation !== this.generation) return;
      this.onSaved(result);
    });
  }

  /** Un intento de guardado empieza: «Guardando…» sustituye al aviso del fallo anterior. */
  private beginSave(): void {
    if (this.saveFailed()) this.error.set('');
    this.saveFailed.set(false);
    this.saving.set(true);
  }

  private onSaved(saved: { definition: WorldDefinition; editVersion: number }): void {
    this.definition.set(saved.definition);
    this.adoptSavedIds(saved.definition);
    this.saving.set(false);
    // Lo editado mientras el guardado iba en vuelo no estaba en su cuerpo: sigue pendiente (antes se daba por guardado).
    const pending = this.editVersion !== saved.editVersion;
    this.dirty.set(pending);
    this.saveFailed.set(false);
    this.conflictDetected.set(false);
    this.conflict.set(null);
    this.lastSavedAt.set(Date.now());

    if (this.pendingRoom !== null && !pending) {
      // Había una sala pedida detrás de este guardado: lo escrito ya está en el servidor, se carga la nueva.
      const room = this.pendingRoom;
      this.pendingRoom = null;
      this.load(this.caseVersionId, room);
    } else if (pending) {
      // Con una sala esperando se guarda ya; si no, el autoguardado de siempre.
      if (this.pendingRoom !== null) this.flushSubject.next();
      else this.saveSubject.next();
    }
  }

  /** Un guardado falló: se avisa (con el 409 aparte) y los cambios locales se conservan. */
  private onSaveError(err: unknown, generation: number): void {
    // Un fallo de una sala que ya no es la actual no es de nadie.
    if (generation !== this.generation) return;
    this.saving.set(false);
    this.saveFailed.set(true);
    // Si había una sala esperando este guardado, no se cambia: lo escrito sigue en pantalla y se avisa.
    this.pendingRoom = null;
    const conflict = revisionConflictOf(err);
    if (conflict || (err as { status?: number } | null)?.status === 409) {
      this.conflict.set(conflict ?? { revision: this.definition()?.revision ?? 0, current: null, message: '' });
      this.conflictDetected.set(true);
      this.error.set('Este caso cambió en otra sesión. Tus cambios locales se conservan. Recarga para ver la versión más reciente.');
    } else {
      this.error.set('No se pudo guardar el borrador.');
    }
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
    // Una carga nueva cancela la anterior: dos respuestas desordenadas no pueden dejar el estado de una sala bajo el
    // nodo de otra.
    this.loadSubscription?.unsubscribe();
    this.caseVersionId = caseVersionId;
    // Lo que estaba por guardarse de la sala anterior se descarta (para guardarlo antes: `switchRoom`); un guardado
    // en vuelo cuya respuesta llegue ahora ya no es de esta carga y se ignora.
    this.generation += 1;
    const generation = this.generation;
    this.pendingRoom = null;
    this.saving.set(false);
    this.saveFailed.set(false);
    this.conflict.set(null);
    this.loading.set(true);
    this.error.set('');
    this.conflictDetected.set(false);
    this.resetCommandStack();

    this.loadSubscription = this.authoringApi.worldEditor(caseVersionId, nodeId).subscribe({
      next: def => {
        if (generation !== this.generation) return;
        // El nodo de lo que hay en pantalla se fija AQUÍ: si la carga falla, la pantalla sigue siendo la sala de
        // origen y guardarla no puede escribirse bajo el nodo pedido (antes se fijaba al pedir).
        this.nodeId = def.nodeId ?? nodeId;
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
        if (generation !== this.generation) return;
        this.error.set('No se pudo cargar el mundo para edición.');
        this.loading.set(false);
      }
    });
  }

  // ─── Command execution ────────────────────────────────────────────────

  /**
   * Las ediciones se aceptan solo con una sala cargada y editable: en solo lectura no hay nada que guardar y,
   * mientras llega otra sala, lo escrito sobre la anterior se perdería al reemplazarla.
   */
  private get acceptsEdits(): boolean {
    return !this.readOnly() && !this.loading();
  }

  execute(command: EditorCommand): void {
    const current = this.editorState();
    if (!current || !this.acceptsEdits) return;

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
    if (!this.acceptsEdits) return;
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
    if (!this.acceptsEdits) return;
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
    // En solo lectura se puede seleccionar y recorrer el lienzo, no colocar nada.
    if (this.readOnly() && tool.startsWith('place-')) return;
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

  /** «Guardar» y Ctrl+S: guarda ya, sin esperar la calma del autoguardado. */
  saveNow(): void {
    this.flushSubject.next();
  }

  /** «Reintentar» tras un fallo de guardado: lo mismo que `saveNow`, con un nombre que dice para qué sirve. */
  retrySave(): void {
    this.flushSubject.next();
  }

  /**
   * «Reintentar con mi cambio» tras un 409: el guardado local se vuelve a mandar con la revisión vigente del servidor
   * (lo de la otra sesión en ESTA sala queda sustituido por lo que hay en pantalla).
   */
  retryAfterConflict(): void {
    const conflict = this.conflict();
    if (!conflict) return;
    this.definition.update(def => (def ? { ...def, revision: conflict.revision } : def));
    this.conflictDetected.set(false);
    this.conflict.set(null);
    this.error.set('');
    this.flushSubject.next();
  }

  /**
   * Cambia de sala SIN perder lo escrito: lo pendiente se guarda primero (por la misma cola de guardados, en la sala
   * de origen y con su nodo) y, si sale bien, se carga la nueva; si falla, no se cambia de sala (lo escrito sigue en
   * pantalla y se avisa). Mientras otra sala está cargando, o si es la misma sala, se ignora: pedir una tercera
   * guardaba el estado de la primera bajo el nodo de la segunda.
   */
  switchRoom(nodeId: number): void {
    if (this.loading() || nodeId === this.nodeId) return;
    if (!this.dirty() && !this.saving()) {
      this.load(this.caseVersionId, nodeId);
      return;
    }
    this.pendingRoom = nodeId;
    this.flushSubject.next();
  }

  // ─── Validate ─────────────────────────────────────────────────────────

  validate(): void {
    this.authoringApi.validateWorld(this.caseVersionId).subscribe({
      next: vs => this.validationState.set(vs),
      error: () => this.error.set('No se pudo ejecutar la validación.')
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
    this.editVersion += 1;
    this.dirty.set(true);
    this.saveSubject.next(); // Trigger debounced auto-save
  }

  /**
   * Un guardado, armado cuando le toca (la cola es en serie): lee el estado, los ids reales y la revisión de ESE
   * momento. Sin nada pendiente, en solo lectura o con otra sala cargando no hace nada.
   */
  private executeSave(): Observable<{ definition: WorldDefinition; generation: number; editVersion: number } | null> {
    const def = this.definition();
    const state = this.editorState();
    // Mientras carga otra sala no se guarda: el estado de pantalla aún es el de la anterior.
    if (!def || !state || this.loading() || this.readOnly()) return of(null);
    // Un cambio ya guardado (p. ej. por «Guardar» antes de que venza la espera) no se guarda otra vez.
    if (!this.dirty() && !this.saveFailed()) return of(null);

    const generation = this.generation;
    const editVersion = this.editVersion;
    this.beginSave();
    const body = buildWorldSaveRequest(def, state);
    return this.authoringApi.saveWorld(this.caseVersionId, body, this.nodeId).pipe(
      map(definition => ({ definition, generation, editVersion })),
      catchError(err => {
        this.onSaveError(err, generation);
        return EMPTY;
      }),
    );
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
