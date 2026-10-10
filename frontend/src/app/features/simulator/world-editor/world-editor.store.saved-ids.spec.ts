import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthoringApi } from '../../../core/api/authoring.api';
import {
  SceneMapDefinition,
  WorldCollisionZone,
  WorldDefinition,
  WorldDialogueTree,
  WorldObject,
} from '../../../core/models/simulation.model';
import {
  MoveObjectCommand,
  PlaceCollisionZoneCommand,
  PlaceObjectCommand,
  UpsertDialogueCommand,
  WorldEditorStore,
} from './world-editor.store';

/**
 * A-05b — el editor adopta los ids reales que el servidor da a lo nuevo.
 *
 * Los objetos, zonas y diálogos nuevos se numeran en el editor con ids locales («el mayor id de
 * la sala + 1»). Tras cada guardado el servidor devuelve la sala con los ids reales; si el editor
 * no los adopta, el siguiente autoguardado vuelve a mandar el id local y el servidor (desde A-05,
 * que busca solo dentro de la sala) crea otra fila nueva y borra la anterior: sin duplicados, pero
 * con la fila cambiando de id en cada guardado. Aquí el editor toma los ids de la respuesta, por
 * clave, y no toca nada más del estado.
 */

function obj(key: string, id: number, overrides: Partial<WorldObject> = {}): WorldObject {
  return {
    id, key, label: key, type: 'PROP', x: 10, y: 20, width: 32, height: 32, zIndex: 0, facing: 'down',
    colorHex: '#fff', icon: '', shortCode: '', collision: false, visible: true, interactionPrompt: '',
    interactionText: '', decisionOptionId: null, toolCode: null, unlockCondition: {}, movementPattern: {},
    metadata: {}, ...overrides,
  };
}

function zone(key: string, id: number): WorldCollisionZone {
  return { id, key, label: null, x: 0, y: 0, width: 50, height: 60 };
}

function tree(key: string, id: number, objectKey: string, mapObjectId: number | null = null): WorldDialogueTree {
  return {
    id, key, speakerName: 'X', portraitKey: null, emotion: 'neutral',
    mapObjectId, mapObjectKey: objectKey, lines: [], choices: [],
  };
}

function map(): SceneMapDefinition {
  return { id: 1, key: 'm', title: 'M', width: 960, height: 540, theme: 't', spawnX: 5, spawnY: 6, ambient: {} };
}

function definition(overrides: Partial<WorldDefinition> = {}): WorldDefinition {
  return {
    schemaVersion: 2, caseVersionId: 1, revision: 4, nodeId: 3, map: map(),
    objects: [obj('a', 10), obj('b', 11)], collisionZones: [zone('z1', 20)], rooms: [],
    dialogues: [tree('d1', 30, 'a', 10)], clinicalTools: [],
    safeExit: { configured: false, exitObjectKey: null, supportResources: [] },
    validation: { errors: [], warnings: [], canPublish: true }, availableDecisions: [],
    ...overrides,
  };
}

describe('A-05b · el editor adopta los ids reales tras guardar', () => {
  let store: WorldEditorStore;
  let api: { worldEditor: ReturnType<typeof vi.fn>; saveWorld: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    api = {
      worldEditor: vi.fn(() => of(definition())),
      saveWorld: vi.fn(() => of(definition())),
    };
    TestBed.configureTestingModule({ providers: [WorldEditorStore, { provide: AuthoringApi, useValue: api }] });
    store = TestBed.inject(WorldEditorStore);
    store.load(1);
  });

  afterEach(() => vi.useRealTimers());

  const objectsById = () => Object.fromEntries(store.editorState()!.objects.map(o => [o.key, o.id]));

  it('un objeto nuevo toma el id que le dio el servidor', () => {
    store.execute(new PlaceObjectCommand(obj('nuevo', 12)));
    api.saveWorld.mockReturnValue(of(definition({
      objects: [obj('a', 10), obj('b', 11), obj('nuevo', 137)],
    })));

    vi.advanceTimersByTime(1500);

    expect(objectsById()).toEqual({ a: 10, b: 11, nuevo: 137 });
  });

  it('el siguiente autoguardado manda el id real y no el local', () => {
    store.execute(new PlaceObjectCommand(obj('nuevo', 12)));
    api.saveWorld.mockReturnValue(of(definition({ objects: [obj('a', 10), obj('b', 11), obj('nuevo', 137)] })));
    vi.advanceTimersByTime(1500);

    store.execute(new MoveObjectCommand('nuevo', 10, 20, 99, 77));
    vi.advanceTimersByTime(1500);

    expect(api.saveWorld).toHaveBeenCalledTimes(2);
    const second = api.saveWorld.mock.calls[1][1];
    expect(second.objects.find((o: WorldObject) => o.key === 'nuevo')).toMatchObject({ id: 137, x: 99, y: 77 });
  });

  it('una zona nueva y un diálogo nuevo toman sus ids; el diálogo apunta al id real de su objeto', () => {
    store.execute(new PlaceObjectCommand(obj('nuevo', 12)));
    store.execute(new PlaceCollisionZoneCommand(zone('zona-nueva', 13)));
    store.execute(new UpsertDialogueCommand('nuevo', tree('dlg-nuevo', 14, 'nuevo', 12)));
    api.saveWorld.mockReturnValue(of(definition({
      objects: [obj('a', 10), obj('b', 11), obj('nuevo', 137)],
      collisionZones: [zone('z1', 20), zone('zona-nueva', 201)],
      dialogues: [tree('d1', 30, 'a', 10), tree('dlg-nuevo', 301, 'nuevo', 137)],
    })));

    vi.advanceTimersByTime(1500);

    const state = store.editorState()!;
    expect(state.collisionZones.find(z => z.key === 'zona-nueva')!.id).toBe(201);
    const dialogue = state.dialogues.find(d => d.key === 'dlg-nuevo')!;
    expect(dialogue.id).toBe(301);
    expect(dialogue.mapObjectId).toBe(137);
  });

  it('lo que el servidor no devuelve conserva su id, y el resto del estado no cambia', () => {
    store.execute(new PlaceObjectCommand(obj('local', 12, { label: 'Editado', x: 321 })));
    api.saveWorld.mockReturnValue(of(definition({ objects: [obj('a', 10), obj('b', 11)] })));

    vi.advanceTimersByTime(1500);

    const local = store.editorState()!.objects.find(o => o.key === 'local')!;
    expect(local).toMatchObject({ id: 12, label: 'Editado', x: 321 });
  });

  it('adoptar los ids no apila un paso ni deja el estado sucio', () => {
    store.execute(new PlaceObjectCommand(obj('nuevo', 12)));
    api.saveWorld.mockReturnValue(of(definition({ objects: [obj('a', 10), obj('b', 11), obj('nuevo', 137)] })));
    vi.advanceTimersByTime(1500);

    // un único paso en la pila (colocar el objeto): deshacer lo agota
    expect(store.canUndo()).toBe(true);
    expect(store.dirty()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(api.saveWorld).toHaveBeenCalledTimes(1); // adoptar no dispara otro guardado
    store.undo();
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(true);
  });

  it('si ningún id cambia, el estado es el mismo objeto (no hay repintado)', () => {
    store.execute(new MoveObjectCommand('a', 10, 20, 50, 60));
    const before = store.editorState();
    api.saveWorld.mockReturnValue(of(definition({ objects: [obj('a', 10), obj('b', 11)] })));

    vi.advanceTimersByTime(1500);

    expect(store.editorState()).toBe(before);
  });
});
