import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { AuthoringApi } from '../../../core/api/authoring.api';
import {
  SceneMapDefinition,
  WorldCollisionZone,
  WorldDefinition,
  WorldDialogueTree,
  WorldObject,
} from '../../../core/models/simulation.model';
import {
  DeleteCollisionZoneCommand,
  DeleteDialogueCommand,
  DeleteObjectCommand,
  EditorCommand,
  EditorState,
  MAX_UNDO_STEPS,
  MoveObjectCommand,
  PlaceCollisionZoneCommand,
  PlaceObjectCommand,
  ResizeZoneCommand,
  SetMapAmbientCommand,
  SetMapFieldsCommand,
  UpdateInspectorCommand,
  UpdateSpawnCommand,
  UpsertDialogueCommand,
  WorldEditorStore,
} from './world-editor.store';

/**
 * Caracteriza el editor de mundo ANTES de reorganizar sus comandos (Command + Composite):
 * qué hace cada uno de los 12 comandos, cómo se apila/deshace/rehace en el store y cómo
 * funciona el autoguardado con debounce. Incluye hallazgos que hoy son comportamiento real
 * (marcados «comportamiento actual») y que el cambio P-07 puede modificar a propósito.
 */

function obj(key: string, overrides: Partial<WorldObject> = {}): WorldObject {
  return {
    id: 1, key, label: key, type: 'PROP', x: 10, y: 20, width: 32, height: 32, zIndex: 0, facing: 'down',
    colorHex: '#fff', icon: '', shortCode: '', collision: false, visible: true, interactionPrompt: '',
    interactionText: '', decisionOptionId: null, toolCode: null, unlockCondition: {}, movementPattern: {},
    metadata: {}, ...overrides,
  };
}

function zone(key: string, overrides: Partial<WorldCollisionZone> = {}): WorldCollisionZone {
  return { id: 1, key, label: null, x: 0, y: 0, width: 50, height: 60, ...overrides };
}

function tree(key: string, objectKey: string): WorldDialogueTree {
  return {
    id: 1, key, speakerName: 'X', portraitKey: null, emotion: 'neutral',
    mapObjectId: null, mapObjectKey: objectKey, lines: [], choices: [],
  };
}

function map(overrides: Partial<SceneMapDefinition> = {}): SceneMapDefinition {
  return { id: 1, key: 'm', title: 'M', width: 960, height: 540, theme: 't', spawnX: 5, spawnY: 6, ambient: {}, ...overrides };
}

function state(overrides: Partial<EditorState> = {}): EditorState {
  return { map: map(), objects: [], collisionZones: [], dialogues: [], ...overrides };
}

function definition(overrides: Partial<WorldDefinition> = {}): WorldDefinition {
  return {
    schemaVersion: 2, caseVersionId: 1, revision: 4, nodeId: 3, map: map(),
    objects: [obj('a'), obj('b', { id: 2 })], collisionZones: [zone('z1')], rooms: [],
    dialogues: [tree('d1', 'a')], clinicalTools: [],
    safeExit: { configured: false, exitObjectKey: null, supportResources: [] },
    validation: { errors: [], warnings: [], canPublish: true }, availableDecisions: [],
    ...overrides,
  };
}

const keys = (list: { key: string }[]) => list.map(x => x.key);

describe('comandos del editor de mundo', () => {
  /** [nombre, comando, estado inicial, comprobación del estado tras ejecutar] */
  const cases: [string, () => EditorCommand, EditorState, (s: EditorState) => void][] = [
    ['PlaceObject', () => new PlaceObjectCommand(obj('n')), state({ objects: [obj('a')] }),
      s => expect(keys(s.objects)).toEqual(['a', 'n'])],
    ['MoveObject', () => new MoveObjectCommand('a', 10, 20, 100, 200), state({ objects: [obj('a'), obj('b')] }),
      s => {
        expect(s.objects[0]).toMatchObject({ x: 100, y: 200 });
        expect(s.objects[1]).toMatchObject({ x: 10, y: 20 });
      }],
    ['ResizeZone',
      () => new ResizeZoneCommand('z', { x: 0, y: 0, width: 50, height: 60 }, { x: 5, y: 6, width: 70, height: 80 }),
      state({ collisionZones: [zone('z')] }),
      s => expect(s.collisionZones[0]).toMatchObject({ x: 5, y: 6, width: 70, height: 80 })],
    ['DeleteObject', () => new DeleteObjectCommand('a'), state({ objects: [obj('a'), obj('b')] }),
      s => expect(keys(s.objects)).toEqual(['b'])],
    ['UpdateInspector', () => new UpdateInspectorCommand('a', { label: 'Nuevo', x: 99 }),
      state({ objects: [obj('a'), obj('b')] }),
      s => {
        expect(s.objects[0]).toMatchObject({ label: 'Nuevo', x: 99 });
        expect(s.objects[1].label).toBe('b');
      }],
    ['PlaceCollisionZone', () => new PlaceCollisionZoneCommand(zone('n')), state({ collisionZones: [zone('z')] }),
      s => expect(keys(s.collisionZones)).toEqual(['z', 'n'])],
    ['DeleteCollisionZone', () => new DeleteCollisionZoneCommand('z'),
      state({ collisionZones: [zone('z'), zone('y')] }),
      s => expect(keys(s.collisionZones)).toEqual(['y'])],
    ['UpdateSpawn', () => new UpdateSpawnCommand(300, 400), state(),
      s => expect(s.map).toMatchObject({ spawnX: 300, spawnY: 400 })],
    ['UpsertDialogue', () => new UpsertDialogueCommand('a', tree('nuevo', 'a')),
      state({ dialogues: [tree('viejo', 'a'), tree('otro', 'b')] }),
      s => expect(keys(s.dialogues).sort()).toEqual(['nuevo', 'otro'])],
    ['DeleteDialogue', () => new DeleteDialogueCommand('a'), state({ dialogues: [tree('d', 'a'), tree('e', 'b')] }),
      s => expect(keys(s.dialogues)).toEqual(['e'])],
    ['SetMapAmbient', () => new SetMapAmbientCommand({ lighting: 'warm' }), state({ map: map({ ambient: { x: 1 } }) }),
      s => expect(s.map.ambient).toEqual({ lighting: 'warm' })],
    ['SetMapFields', () => new SetMapFieldsCommand({ title: 'Otra', theme: 'clínica' }), state(),
      s => expect(s.map).toMatchObject({ title: 'Otra', theme: 'clínica', width: 960 })],
  ];

  it.each(cases)('%s: ejecuta, sin mutar el estado recibido', (_n, make, initial, check) => {
    const before = structuredClone(initial);

    const after = make().execute(initial);

    check(after);
    expect(initial).toEqual(before); // el estado anterior queda intacto (inmutabilidad)
    expect(after).not.toBe(initial);
  });

  it.each(cases)('%s: ejecutar y deshacer devuelve el mismo contenido', (_n, make, initial) => {
    const command = make();

    const roundTrip = command.undo(command.execute(initial));

    // Se compara como conjunto por clave: algunos deshacer reponen al final de la lista.
    const normalise = (s: EditorState) => ({
      map: s.map,
      objects: [...s.objects].sort((a, b) => a.key.localeCompare(b.key)),
      collisionZones: [...s.collisionZones].sort((a, b) => a.key.localeCompare(b.key)),
      dialogues: [...s.dialogues].sort((a, b) => a.key.localeCompare(b.key)),
    });
    expect(normalise(roundTrip)).toEqual(normalise(initial));
  });

  it.each(cases)('%s: expone un tipo de comando', (name, make) => {
    expect(make().type).toBe(name);
  });

  it('comportamiento actual: deshacer un borrado repone el elemento AL FINAL (no en su posición)', () => {
    const initial = state({ objects: [obj('a'), obj('b'), obj('c')] });
    const command = new DeleteObjectCommand('a');

    const restored = command.undo(command.execute(initial));

    expect(keys(restored.objects)).toEqual(['b', 'c', 'a']);
  });

  it('borrar o editar una clave inexistente no rompe y deshacer deja el estado igual', () => {
    const initial = state({ objects: [obj('a')], collisionZones: [zone('z')] });

    for (const command of [
      new DeleteObjectCommand('no-existe'), new UpdateInspectorCommand('no-existe', { label: 'x' }),
      new DeleteCollisionZoneCommand('no-existe'), new DeleteDialogueCommand('no-existe'),
    ]) {
      expect(command.undo(command.execute(initial))).toEqual(initial);
    }
  });

  it('UpsertDialogue deshecho sobre un objeto sin diálogo previo lo quita', () => {
    const command = new UpsertDialogueCommand('a', tree('nuevo', 'a'));

    const back = command.undo(command.execute(state()));

    expect(back.dialogues).toEqual([]);
  });

  it('SetMapFields deshace TODO el mapa a como estaba (no solo los campos tocados)', () => {
    const initial = state({ map: map({ title: 'Original', spawnX: 1 }) });
    const command = new SetMapFieldsCommand({ title: 'Nuevo' });
    const after = command.execute(initial);
    // Otro cambio posterior sobre el mismo mapa (p. ej. mover el spawn sin pasar por la pila).
    const edited = { ...after, map: { ...after.map, spawnX: 999 } };

    expect(command.undo(edited).map).toEqual(initial.map);
  });
});

describe('WorldEditorStore', () => {
  let store: WorldEditorStore;
  let sim: {
    worldEditor: ReturnType<typeof vi.fn>;
    saveWorld: ReturnType<typeof vi.fn>;
    validateWorld: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    sim = {
      worldEditor: vi.fn(() => of(definition())),
      saveWorld: vi.fn(() => of(definition({ revision: 5 }))),
      validateWorld: vi.fn(() => of({ errors: ['e'], warnings: [], canPublish: false })),
    };
    TestBed.configureTestingModule({
      providers: [WorldEditorStore, { provide: AuthoringApi, useValue: sim }],
    });
    store = TestBed.inject(WorldEditorStore);
  });

  afterEach(() => vi.useRealTimers());

  const loaded = (nodeId?: number) => {
    store.load(1, nodeId);
    return store;
  };

  describe('carga', () => {
    it('copia el mundo al estado editable y limpia el estado de la pila', () => {
      loaded();

      expect(sim.worldEditor).toHaveBeenCalledWith(1, undefined);
      expect(keys(store.editorState()!.objects)).toEqual(['a', 'b']);
      expect(store.objectCount()).toBe(2);
      expect(store.zoneCount()).toBe(1);
      expect([store.loading(), store.dirty(), store.canUndo(), store.canRedo()]).toEqual([false, false, false, false]);
    });

    it('resuelve la clave del objeto de un diálogo que solo trae mapObjectId', () => {
      sim.worldEditor.mockReturnValue(of(definition({
        dialogues: [{ ...tree('d', 'x'), mapObjectKey: undefined as never, mapObjectId: 2 }],
      })));

      loaded();

      expect(store.editorState()!.dialogues[0].mapObjectKey).toBe('b');
    });

    it('un error de carga deja un mensaje y apaga el indicador', () => {
      sim.worldEditor.mockReturnValue(throwError(() => new Error('x')));

      loaded();

      expect(store.error()).toBe('No se pudo cargar el mundo para edición.');
      expect(store.loading()).toBe(false);
      expect(store.editorState()).toBeNull();
    });

    it('recargar vacía las pilas de deshacer y rehacer', () => {
      loaded();
      store.execute(new DeleteObjectCommand('a'));
      store.undo();
      expect(store.canRedo()).toBe(true);

      store.load(1);

      expect([store.canUndo(), store.canRedo()]).toEqual([false, false]);
    });
  });

  describe('deshacer / rehacer', () => {
    it('sin mundo cargado, ejecutar no hace nada', () => {
      store.execute(new DeleteObjectCommand('a'));

      expect([store.editorState(), store.canUndo(), store.dirty()]).toEqual([null, false, false]);
    });

    it('ejecutar actualiza el estado, activa deshacer y marca el borrador como modificado', () => {
      loaded();

      store.execute(new DeleteObjectCommand('a'));

      expect(keys(store.editorState()!.objects)).toEqual(['b']);
      expect([store.canUndo(), store.canRedo(), store.dirty()]).toEqual([true, false, true]);
    });

    it('deshacer y rehacer recorren la pila en orden inverso', () => {
      loaded();
      store.execute(new MoveObjectCommand('a', 10, 20, 1, 1));
      store.execute(new MoveObjectCommand('a', 1, 1, 2, 2));

      store.undo();
      expect(store.editorState()!.objects[0]).toMatchObject({ x: 1, y: 1 });
      store.undo();
      expect(store.editorState()!.objects[0]).toMatchObject({ x: 10, y: 20 });
      expect([store.canUndo(), store.canRedo()]).toEqual([false, true]);

      store.redo();
      store.redo();
      expect(store.editorState()!.objects[0]).toMatchObject({ x: 2, y: 2 });
      expect([store.canUndo(), store.canRedo()]).toEqual([true, false]);
    });

    it('una acción nueva descarta lo que se podía rehacer', () => {
      loaded();
      store.execute(new DeleteObjectCommand('a'));
      store.undo();
      expect(store.canRedo()).toBe(true);

      store.execute(new DeleteObjectCommand('b'));

      expect(store.canRedo()).toBe(false);
    });

    it('con las pilas vacías, deshacer y rehacer no hacen nada', () => {
      loaded();
      const before = store.editorState();

      store.undo();
      store.redo();

      expect(store.editorState()).toBe(before);
      expect(store.dirty()).toBe(false);
    });

    it('deshacer y rehacer también marcan el borrador como modificado', () => {
      loaded();
      store.execute(new DeleteObjectCommand('a'));
      vi.advanceTimersByTime(1500); // guarda → dirty = false
      expect(store.dirty()).toBe(false);

      store.undo();

      expect(store.dirty()).toBe(true);
    });

    it('la pila tiene tope: tras 300 cambios solo se pueden deshacer los últimos MAX_UNDO_STEPS', () => {
      loaded();
      for (let i = 0; i < 300; i++) store.execute(new MoveObjectCommand('a', i, i, i + 1, i + 1));

      for (let i = 0; i < 300; i++) store.undo();

      expect(store.canUndo()).toBe(false);
      // Se perdieron los pasos más antiguos: ya no se llega a la posición inicial (0, 0).
      const lost = 300 - MAX_UNDO_STEPS;
      expect(store.editorState()!.objects[0]).toMatchObject({ x: lost, y: lost });
    });
  });

  describe('autoguardado', () => {
    it('guarda una sola vez 1500 ms después del último cambio, con la revisión y el estado editado', () => {
      loaded(3);
      store.execute(new DeleteObjectCommand('a'));
      vi.advanceTimersByTime(1000);
      store.execute(new DeleteObjectCommand('b'));
      vi.advanceTimersByTime(1499);
      expect(sim.saveWorld).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);

      expect(sim.saveWorld).toHaveBeenCalledTimes(1);
      const [caseVersionId, body, nodeId] = sim.saveWorld.mock.calls[0];
      expect([caseVersionId, nodeId]).toEqual([1, 3]);
      expect(body.revision).toBe(4);
      expect(body.objects).toEqual([]);
    });

    it('tras guardar bien: toma la definición nueva y limpia dirty y saving', () => {
      loaded();
      store.execute(new DeleteObjectCommand('a'));

      vi.advanceTimersByTime(1500);

      expect(store.definition()!.revision).toBe(5);
      expect([store.dirty(), store.saving()]).toEqual([false, false]);
    });

    // F8-5 (antes: «dispara el mismo guardado con debounce»: el botón «Guardar» y el atajo esperaban 1,5 s).
    it('saveNow guarda al instante, sin esperar el debounce, y el cambio ya guardado no se guarda otra vez', () => {
      loaded();
      store.execute(new DeleteObjectCommand('a'));

      store.saveNow();
      expect(sim.saveWorld).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1500);

      // El guardado inmediato no deja un segundo guardado por el debounce del mismo cambio.
      expect(sim.saveWorld).toHaveBeenCalledTimes(1);
      expect(store.dirty()).toBe(false);
    });

    it('tras guardar bien anota cuándo y no queda ningún error de guardado', () => {
      loaded();
      expect(store.lastSavedAt()).toBeNull();
      store.execute(new DeleteObjectCommand('a'));

      store.saveNow();

      expect(store.lastSavedAt()).not.toBeNull();
      expect(store.saveFailed()).toBe(false);
    });

    it('un 409 conserva los cambios locales y avisa del conflicto', () => {
      loaded();
      sim.saveWorld.mockReturnValue(throwError(() => ({ status: 409 })));
      store.execute(new DeleteObjectCommand('a'));

      vi.advanceTimersByTime(1500);

      expect(store.conflictDetected()).toBe(true);
      expect(store.error()).toContain('Este caso cambió en otra sesión');
      expect(store.dirty()).toBe(true);
      expect(store.saving()).toBe(false);
      expect(keys(store.editorState()!.objects)).toEqual(['b']);
    });

    it('otro error de guardado muestra un mensaje genérico', () => {
      loaded();
      sim.saveWorld.mockReturnValue(throwError(() => ({ status: 500 })));
      store.execute(new DeleteObjectCommand('a'));

      vi.advanceTimersByTime(1500);

      expect(store.error()).toBe('No se pudo guardar el borrador.');
      expect(store.conflictDetected()).toBe(false);
    });

    // F8-5 (antes: «comportamiento actual: tras un error de guardado el autoguardado queda muerto hasta recargar»).
    it('tras un error de guardado el autoguardado sigue vivo: el cambio siguiente se guarda solo', () => {
      loaded();
      sim.saveWorld.mockReturnValueOnce(throwError(() => ({ status: 500 })));
      store.execute(new DeleteObjectCommand('a'));
      vi.advanceTimersByTime(1500);
      expect(sim.saveWorld).toHaveBeenCalledTimes(1);
      expect(store.saveFailed()).toBe(true);

      store.execute(new DeleteObjectCommand('b'));
      vi.advanceTimersByTime(1500);

      expect(sim.saveWorld).toHaveBeenCalledTimes(2);
      expect(keys(sim.saveWorld.mock.calls[1][1].objects)).toEqual([]);
      expect(store.dirty()).toBe(false);
      expect(store.saveFailed()).toBe(false);
      expect(store.error()).toBe('');
    });

    it('«Reintentar» (retrySave) vuelve a guardar al instante lo que falló', () => {
      loaded();
      sim.saveWorld.mockReturnValueOnce(throwError(() => ({ status: 500 })));
      store.execute(new DeleteObjectCommand('a'));
      vi.advanceTimersByTime(1500);
      expect(store.saveFailed()).toBe(true);

      store.retrySave();

      expect(sim.saveWorld).toHaveBeenCalledTimes(2);
      expect(store.saveFailed()).toBe(false);
      expect(store.dirty()).toBe(false);
    });

    it('un 409 con el cuerpo del servidor guarda la revisión vigente; «Reintentar con mi cambio» la usa y guarda lo local', () => {
      loaded(3);
      const conflict = new HttpErrorResponse({
        status: 409,
        error: { success: false, code: 'REVISION_CONFLICT', message: 'otra sesión', revision: 9, current: { caseVersionId: 1, revision: 9 } },
      });
      sim.saveWorld.mockReturnValueOnce(throwError(() => conflict));
      store.execute(new DeleteObjectCommand('a'));
      vi.advanceTimersByTime(1500);

      expect(store.conflictDetected()).toBe(true);
      expect(store.conflict()).toMatchObject({ revision: 9 });
      expect(store.dirty()).toBe(true);

      store.retryAfterConflict();

      expect(sim.saveWorld).toHaveBeenCalledTimes(2);
      const [, body, nodeId] = sim.saveWorld.mock.calls[1];
      expect(body.revision).toBe(9);
      expect(nodeId).toBe(3);
      expect(keys(body.objects)).toEqual(['b']);
      expect([store.conflictDetected(), store.conflict(), store.error()]).toEqual([false, null, '']);
      expect(store.dirty()).toBe(false);
    });

    // F8-5 (antes: «comportamiento actual: recargar otro nodo con un guardado pendiente guarda el estado viejo bajo el
    // nodo nuevo»: el cambio de la sala anterior se escribía en la sala nueva).
    it('un guardado pendiente no escribe el estado de la sala anterior bajo el nodo nuevo', () => {
      loaded(3);
      store.execute(new DeleteObjectCommand('a')); // cambio de la sala del nodo 3
      const pending = new Subject<WorldDefinition>();
      sim.worldEditor.mockReturnValue(pending as unknown as Observable<WorldDefinition>);

      store.load(1, 8); // cambia de sala (descartando lo pendiente); la respuesta aún no llega
      vi.advanceTimersByTime(1500);

      expect(sim.saveWorld).not.toHaveBeenCalled();
    });

    it('switchRoom guarda primero la sala de origen con su nodo y luego carga la nueva', () => {
      loaded(3);
      store.execute(new DeleteObjectCommand('a'));
      const order: string[] = [];
      sim.saveWorld.mockImplementation((_id: number, _body: unknown, node: number) => {
        order.push(`guardar ${node}`);
        return of(definition({ revision: 5 }));
      });
      sim.worldEditor.mockImplementation((_id: number, node: number) => {
        order.push(`cargar ${node}`);
        return of(definition({ nodeId: node }));
      });

      store.switchRoom(8);

      expect(order).toEqual(['guardar 3', 'cargar 8']);
      expect(keys(sim.saveWorld.mock.calls[0][1].objects)).toEqual(['b']);
    });

    it('switchRoom con el guardado fallido NO cambia de sala: lo escrito sigue ahí y se avisa', () => {
      loaded(3);
      store.execute(new DeleteObjectCommand('a'));
      sim.saveWorld.mockReturnValue(throwError(() => ({ status: 500 })));
      const loadsBefore = sim.worldEditor.mock.calls.length;

      store.switchRoom(8);

      expect(sim.worldEditor.mock.calls.length).toBe(loadsBefore);
      expect(store.saveFailed()).toBe(true);
      expect(store.dirty()).toBe(true);
      expect(keys(store.editorState()!.objects)).toEqual(['b']);
    });

    it('una respuesta de guardado tardía de la sala anterior no pisa la sala nueva', () => {
      loaded(3);
      const inFlight = new Subject<WorldDefinition>();
      sim.saveWorld.mockReturnValueOnce(inFlight as unknown as Observable<WorldDefinition>);
      store.execute(new DeleteObjectCommand('a'));
      vi.advanceTimersByTime(1500); // el guardado de la sala 3 queda en vuelo
      sim.worldEditor.mockReturnValue(of(definition({ nodeId: 8, revision: 12 })));

      store.load(1, 8);
      inFlight.next(definition({ nodeId: 3, revision: 6 })); // llega tarde

      expect(store.definition()!.nodeId).toBe(8);
      expect(store.definition()!.revision).toBe(12);
    });
  });

  describe('selección, herramientas y vista', () => {
    it('selectedObject / selectedZone / selectedDialogue siguen a la clave seleccionada', () => {
      loaded();

      store.select('a');
      expect(store.selectedObject()?.key).toBe('a');
      expect(store.selectedDialogue()?.key).toBe('d1');
      expect(store.selectedZone()).toBeNull();

      store.select('z1');
      expect(store.selectedZone()?.key).toBe('z1');
      expect(store.selectedObject()).toBeNull();

      store.select(null);
      expect([store.selectedObject(), store.selectedZone(), store.selectedDialogue()]).toEqual([null, null, null]);
    });

    it('cambiar a una herramienta distinta de «select» deselecciona', () => {
      loaded();
      store.select('a');

      store.setTool('select');
      expect(store.selectedKey()).toBe('a');
      store.setTool('place-object');

      expect(store.selectedKey()).toBeNull();
      expect(store.activeTool()).toBe('place-object');
    });

    it('el zoom se limita entre 0.25 y 4', () => {
      store.setZoom(10);
      expect(store.zoom()).toBe(4);
      store.setZoom(0.01);
      expect(store.zoom()).toBe(0.25);
      store.setZoom(1.5);
      expect(store.zoom()).toBe(1.5);
    });

    it('nextLocalId es el mayor id (de objetos y zonas) más uno; 1 sin estado', () => {
      expect(store.nextLocalId()).toBe(1);
      sim.worldEditor.mockReturnValue(of(definition({
        objects: [obj('a', { id: 7 })], collisionZones: [zone('z', { id: 11 })],
      })));
      loaded();

      expect(store.nextLocalId()).toBe(12);
    });

    it('generateKey usa el prefijo pedido', () => {
      expect(store.generateKey('npc')).toMatch(/^npc-[0-9a-z]+$/);
    });
  });

  describe('validación y conflicto', () => {
    it('validate guarda el resultado del backend; un fallo deja un mensaje', () => {
      loaded();

      store.validate();
      expect(store.validationState()).toEqual({ errors: ['e'], warnings: [], canPublish: false });
      expect(sim.validateWorld).toHaveBeenCalledWith(1);

      sim.validateWorld.mockReturnValue(throwError(() => new Error('x')));
      store.validate();
      expect(store.error()).toBe('No se pudo ejecutar la validación.');
    });

    it('reloadAfterConflict apaga el aviso y vuelve a cargar el mismo nodo', () => {
      loaded(3);
      store.conflictDetected.set(true);

      store.reloadAfterConflict();

      expect(store.conflictDetected()).toBe(false);
      expect(sim.worldEditor).toHaveBeenLastCalledWith(1, 3);
    });
  });
});
