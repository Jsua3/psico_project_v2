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
  DeleteObjectWithDialogueCommand,
  EditorCommand,
  EditorState,
  MacroCommand,
  MAX_UNDO_STEPS,
  MoveObjectCommand,
  SetZoneLabelCommand,
  UpdateInspectorCommand,
  WorldEditorStore,
} from './world-editor.store';

/**
 * P-07 · Command + Composite en el editor de mundo.
 *
 *  - `SetZoneLabelCommand` (Command): la etiqueta de una zona pasa por la pila de deshacer.
 *  - `MacroCommand` (Composite): varios comandos se apilan, ejecutan y deshacen como uno solo.
 *  - `DeleteObjectWithDialogueCommand`: un macro concreto, «borrar objeto + su diálogo».
 *  - `MAX_UNDO_STEPS`: el historial tiene tope.
 */

function obj(key: string, overrides: Partial<WorldObject> = {}): WorldObject {
  return {
    id: 1, key, label: key, type: 'PERSON', x: 10, y: 20, width: 32, height: 32, zIndex: 0, facing: 'down',
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

function map(): SceneMapDefinition {
  return { id: 1, key: 'm', title: 'M', width: 960, height: 540, theme: 't', spawnX: 5, spawnY: 6, ambient: {} };
}

function state(overrides: Partial<EditorState> = {}): EditorState {
  return { map: map(), objects: [], collisionZones: [], dialogues: [], ...overrides };
}

function definition(): WorldDefinition {
  return {
    schemaVersion: 2, caseVersionId: 1, revision: 4, nodeId: 3, map: map(),
    objects: [obj('a'), obj('b', { id: 2 })], collisionZones: [zone('z1', { label: 'Mesa' })], rooms: [],
    dialogues: [tree('d-a', 'a'), tree('d-b', 'b')], clinicalTools: [],
    safeExit: { configured: false, exitObjectKey: null, supportResources: [] },
    validation: { errors: [], warnings: [], canPublish: true }, availableDecisions: [],
  };
}

const keys = (list: { key: string }[]) => list.map(x => x.key);

/** Comando espía: anota en `log` cuándo se ejecuta (+) y cuándo se deshace (-). */
function spy(name: string, log: string[]): EditorCommand {
  return {
    type: name,
    execute: s => { log.push(`+${name}`); return s; },
    undo: s => { log.push(`-${name}`); return s; },
  };
}

describe('SetZoneLabelCommand', () => {
  const initial = () => state({
    collisionZones: [zone('z1', { label: 'Mesa', x: 1, y: 2, width: 30, height: 40 }), zone('z2', { label: 'Silla', x: 9 })],
  });

  it('cambia solo la etiqueta de la zona pedida', () => {
    const before = initial();

    const after = new SetZoneLabelCommand('z1', 'Escritorio').execute(before);

    expect(after.collisionZones[0]).toEqual({ ...before.collisionZones[0], label: 'Escritorio' });
    expect(after.collisionZones[1]).toEqual(before.collisionZones[1]);
  });

  it('no muta el estado recibido', () => {
    const before = initial();
    const snapshot = structuredClone(before);

    const after = new SetZoneLabelCommand('z1', 'Escritorio').execute(before);

    expect(before).toEqual(snapshot);
    expect(after).not.toBe(before);
  });

  it('deshacer devuelve la etiqueta anterior', () => {
    const command = new SetZoneLabelCommand('z1', 'Escritorio');
    const after = command.execute(initial());
    expect(after.collisionZones[0].label).toBe('Escritorio');

    const back = command.undo(after);

    expect(back).toEqual(initial());
  });

  it('deshacer devuelve null cuando la zona no tenía etiqueta', () => {
    const command = new SetZoneLabelCommand('z1', 'Escritorio');
    const unlabeled = state({ collisionZones: [zone('z1')] });
    const after = command.execute(unlabeled);
    expect(after.collisionZones[0].label).toBe('Escritorio');

    const back = command.undo(after);

    expect(back.collisionZones[0].label).toBeNull();
  });

  it('rehacer (ejecutar de nuevo tras deshacer) deja otra vez la etiqueta nueva', () => {
    const command = new SetZoneLabelCommand('z1', 'Escritorio');
    const undone = command.undo(command.execute(initial()));
    expect(undone.collisionZones[0].label).toBe('Mesa');

    const redone = command.execute(undone);

    expect(redone.collisionZones[0].label).toBe('Escritorio');
    expect(command.undo(redone)).toEqual(initial());
  });

  it('con una zona inexistente no cambia nada, ni al ejecutar ni al deshacer', () => {
    const command = new SetZoneLabelCommand('no-existe', 'x');

    expect(command.execute(initial())).toEqual(initial());
    expect(command.undo(initial())).toEqual(initial());
  });

  it('se identifica con el tipo «SetZoneLabel»', () => {
    expect(new SetZoneLabelCommand('z1', 'x').type).toBe('SetZoneLabel');
  });
});

describe('MacroCommand (Composite)', () => {
  const move = (key: string, from: number, to: number) => new MoveObjectCommand(key, from, from, to, to);

  it('ejecuta los comandos en orden y los deshace en el orden inverso', () => {
    const log: string[] = [];
    const macro = new MacroCommand('M', [spy('a', log), spy('b', log), spy('c', log)]);

    macro.execute(state());
    macro.undo(state());

    expect(log).toEqual(['+a', '+b', '+c', '-c', '-b', '-a']);
  });

  it('cada comando recibe el estado que dejó el anterior', () => {
    const macro = new MacroCommand('M', [move('a', 10, 1), move('a', 1, 2)]);
    const initial = state({ objects: [obj('a', { x: 10, y: 10 })] });

    const after = macro.execute(initial);

    expect(after.objects[0]).toMatchObject({ x: 2, y: 2 });
  });

  it('deshacer el conjunto devuelve el estado de antes de ejecutarlo', () => {
    // El orden inverso es lo que hace falta aquí: en orden directo quedaría en (1, 1).
    const macro = new MacroCommand('M', [move('a', 10, 1), move('a', 1, 2)]);
    const initial = state({ objects: [obj('a', { x: 10, y: 10 })] });
    const after = macro.execute(initial);
    expect(after.objects[0]).toMatchObject({ x: 2, y: 2 });

    const back = macro.undo(after);

    expect(back).toEqual(initial);
  });

  it('también deshace bien comandos que recuerdan el estado previo (UpdateInspector)', () => {
    const macro = new MacroCommand('M', [
      new UpdateInspectorCommand('a', { label: 'Uno' }),
      new UpdateInspectorCommand('a', { label: 'Dos' }),
    ]);
    const initial = state({ objects: [obj('a', { label: 'Original' })] });

    const after = macro.execute(initial);
    expect(after.objects[0].label).toBe('Dos');

    expect(macro.undo(after)).toEqual(initial);
  });

  it('ejecutar, deshacer y volver a ejecutar da siempre el mismo resultado', () => {
    // Si deshacer invirtiera la lista «en el sitio», la segunda ejecución correría al revés.
    const macro = new MacroCommand('M', [move('a', 10, 1), move('a', 1, 2)]);
    const initial = state({ objects: [obj('a', { x: 10, y: 10 })] });

    const first = macro.execute(initial);
    expect(first.objects[0]).toMatchObject({ x: 2, y: 2 });
    macro.undo(first);
    const second = macro.execute(initial);

    expect(second).toEqual(first);
  });

  it('un macro vacío deja el estado igual', () => {
    const macro = new MacroCommand('Vacío', []);
    const initial = state({ objects: [obj('a')] });

    expect(macro.execute(initial)).toEqual(initial);
    expect(macro.undo(initial)).toEqual(initial);
  });

  it('puede contener otro macro: se trata igual que un comando simple', () => {
    const inner = new MacroCommand('Interior', [move('a', 10, 1), move('a', 1, 2)]);
    const outer = new MacroCommand('Exterior', [inner, move('a', 2, 3)]);
    const initial = state({ objects: [obj('a', { x: 10, y: 10 })] });

    const after = outer.execute(initial);
    expect(after.objects[0]).toMatchObject({ x: 3, y: 3 });

    expect(outer.undo(after)).toEqual(initial);
  });

  it('no muta el estado recibido', () => {
    const macro = new MacroCommand('M', [move('a', 10, 1), new DeleteObjectWithDialogueCommand('a')]);
    const initial = state({ objects: [obj('a', { x: 10, y: 10 })], dialogues: [tree('d', 'a')] });
    const snapshot = structuredClone(initial);

    const after = macro.execute(initial);

    expect(after.objects).toEqual([]); // sí hizo su trabajo...
    expect(initial).toEqual(snapshot); // ...sin tocar el estado que recibió
  });

  it('se identifica con el nombre que se le da', () => {
    expect(new MacroCommand('MiMacro', []).type).toBe('MiMacro');
  });
});

describe('DeleteObjectWithDialogueCommand', () => {
  const initial = () => state({
    objects: [obj('a'), obj('b', { id: 2 })],
    dialogues: [tree('d-a', 'a'), tree('d-b', 'b')],
  });

  it('es un macro: reutiliza los comandos simples de borrar objeto y diálogo', () => {
    expect(new DeleteObjectWithDialogueCommand('a')).toBeInstanceOf(MacroCommand);
  });

  it('borra el objeto y su diálogo', () => {
    const after = new DeleteObjectWithDialogueCommand('a').execute(initial());

    expect(keys(after.objects)).toEqual(['b']);
    expect(keys(after.dialogues)).toEqual(['d-b']);
  });

  it('no toca los demás objetos ni sus diálogos', () => {
    const after = new DeleteObjectWithDialogueCommand('a').execute(initial());

    expect(after.objects[0]).toEqual(initial().objects[1]);
    expect(after.dialogues[0]).toEqual(initial().dialogues[1]);
  });

  it('un objeto sin diálogo se borra igual', () => {
    const noDialogue = state({ objects: [obj('a')], dialogues: [tree('d-x', 'otro')] });

    const after = new DeleteObjectWithDialogueCommand('a').execute(noDialogue);

    expect(after.objects).toEqual([]);
    expect(keys(after.dialogues)).toEqual(['d-x']);
  });

  it('deshacer repone el objeto y su diálogo', () => {
    const command = new DeleteObjectWithDialogueCommand('a');
    const after = command.execute(initial());
    expect(keys(after.objects)).toEqual(['b']);
    expect(keys(after.dialogues)).toEqual(['d-b']);

    const back = command.undo(after);

    expect(keys(back.objects).sort()).toEqual(['a', 'b']);
    expect(keys(back.dialogues).sort()).toEqual(['d-a', 'd-b']);
  });

  it('una clave inexistente no cambia nada', () => {
    const command = new DeleteObjectWithDialogueCommand('no-existe');

    expect(command.undo(command.execute(initial()))).toEqual(initial());
  });

  it('se identifica con el tipo «DeleteObjectWithDialogue»', () => {
    expect(new DeleteObjectWithDialogueCommand('a').type).toBe('DeleteObjectWithDialogue');
  });
});

describe('WorldEditorStore con comandos compuestos y tope de historial', () => {
  let store: WorldEditorStore;
  const move = (i: number) => new MoveObjectCommand('a', i, i, i + 1, i + 1);

  beforeEach(() => {
    vi.useFakeTimers();
    const api = {
      worldEditor: vi.fn(() => of(definition())),
      saveWorld: vi.fn(() => of(definition())),
      validateWorld: vi.fn(() => of(definition().validation)),
    };
    TestBed.configureTestingModule({
      providers: [WorldEditorStore, { provide: AuthoringApi, useValue: api }],
    });
    store = TestBed.inject(WorldEditorStore);
    store.load(1);
  });

  afterEach(() => vi.useRealTimers());

  const objects = () => store.editorState()!.objects;
  const dialogues = () => store.editorState()!.dialogues;

  describe('un macro es un único paso del historial', () => {
    it('borrar un objeto con su diálogo se deshace de una sola vez', () => {
      store.execute(new DeleteObjectWithDialogueCommand('a'));
      expect(keys(objects())).toEqual(['b']);
      expect(keys(dialogues())).toEqual(['d-b']);

      store.undo();

      expect(keys(objects()).sort()).toEqual(['a', 'b']);
      expect(keys(dialogues()).sort()).toEqual(['d-a', 'd-b']);
      expect(store.canUndo()).toBe(false); // un solo paso, no dos
    });

    it('rehacer vuelve a borrar los dos', () => {
      store.execute(new DeleteObjectWithDialogueCommand('a'));
      store.undo();

      store.redo();

      expect(keys(objects())).toEqual(['b']);
      expect(keys(dialogues())).toEqual(['d-b']);
      expect(store.canRedo()).toBe(false);
    });

    it('si un comando del macro falla, no cambia el estado ni se apila nada', () => {
      const boom: EditorCommand = { type: 'Boom', execute: () => { throw new Error('boom'); }, undo: s => s };
      const before = store.editorState();

      expect(() => store.execute(new MacroCommand('M', [move(0), boom]))).toThrow('boom');

      expect(store.editorState()).toBe(before);
      expect([store.canUndo(), store.dirty()]).toEqual([false, false]);
    });
  });

  describe('etiqueta de zona', () => {
    it('cambiarla es un paso del historial que se puede deshacer', () => {
      store.execute(new SetZoneLabelCommand('z1', 'Escritorio'));
      expect(store.editorState()!.collisionZones[0].label).toBe('Escritorio');

      store.undo();

      expect(store.editorState()!.collisionZones[0].label).toBe('Mesa');
      expect(store.canUndo()).toBe(false);
    });
  });

  describe('tope del historial', () => {
    it('el tope es razonable: el editor recuerda al menos 50 pasos', () => {
      expect(MAX_UNDO_STEPS).toBeGreaterThanOrEqual(50);
    });

    it('conserva exactamente MAX_UNDO_STEPS pasos deshacibles', () => {
      for (let i = 0; i < MAX_UNDO_STEPS + 25; i++) store.execute(move(i));

      let undone = 0;
      while (store.canUndo()) { store.undo(); undone++; }

      expect(undone).toBe(MAX_UNDO_STEPS);
    });

    it('hasta el tope no se pierde ningún paso', () => {
      for (let i = 0; i < MAX_UNDO_STEPS; i++) store.execute(move(i));

      for (let i = 0; i < MAX_UNDO_STEPS; i++) store.undo();

      expect(objects()[0]).toMatchObject({ x: 0, y: 0 }); // volvió a la posición inicial
    });

    it('al pasarse descarta los pasos más antiguos y conserva los más recientes', () => {
      const extra = 10;
      for (let i = 0; i < MAX_UNDO_STEPS + extra; i++) store.execute(move(i));

      while (store.canUndo()) store.undo();

      // Se perdieron los `extra` pasos más antiguos: se queda donde terminó el paso (extra - 1).
      expect(objects()[0]).toMatchObject({ x: extra, y: extra });
    });

    it('rehacer recorre todo el historial recortado hasta el último cambio', () => {
      const total = MAX_UNDO_STEPS + 10;
      for (let i = 0; i < total; i++) store.execute(move(i));
      while (store.canUndo()) store.undo();

      while (store.canRedo()) store.redo();

      expect(objects()[0]).toMatchObject({ x: total, y: total });
      expect(store.canUndo()).toBe(true);
    });
  });
});
