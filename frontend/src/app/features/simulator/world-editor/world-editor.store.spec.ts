import {
  buildWorldSaveRequest,
  EditorState,
  UpsertDialogueCommand,
  DeleteDialogueCommand,
} from './world-editor.store';
import { WorldDefinition, WorldDialogueTree } from '../../../core/models/simulation.model';

function tree(key: string, objectKey: string): WorldDialogueTree {
  return {
    id: 1, key, speakerName: 'X', portraitKey: null, emotion: 'neutral',
    mapObjectId: null, mapObjectKey: objectKey, lines: [], choices: [],
  };
}

function emptyDef(): WorldDefinition {
  return {
    schemaVersion: 2, caseVersionId: 1, revision: 7, nodeId: 3,
    map: {
      id: 1, key: 'm', title: 'M', width: 960, height: 540, theme: 't',
      spawnX: 0, spawnY: 0, ambient: {},
    },
    objects: [], collisionZones: [],
    dialogues: [tree('old', 'npc-1')],
    clinicalTools: [],
    safeExit: { configured: false, exitObjectKey: null, supportResources: [] },
    validation: { errors: [], warnings: [], canPublish: true },
    availableDecisions: [],
  };
}

function state(dialogues: WorldDialogueTree[] = []): EditorState {
  return { map: emptyDef().map, objects: [], collisionZones: [], dialogues };
}

describe('buildWorldSaveRequest', () => {
  it('sends the EDITED dialogues from state, not the original definition', () => {
    const def = emptyDef();
    const s: EditorState = {
      map: def.map, objects: [], collisionZones: [],
      dialogues: [tree('edited', 'npc-1')],
    };
    const body = buildWorldSaveRequest(def, s);
    expect(body.revision).toBe(7);
    expect(body.dialogues).toHaveLength(1);
    expect(body.dialogues[0].key).toBe('edited');
  });
});

describe('UpsertDialogueCommand', () => {
  it('adds a new dialogue for an object key', () => {
    const cmd = new UpsertDialogueCommand('npc-1', tree('a', 'npc-1'));
    const next = cmd.execute(state());
    expect(next.dialogues).toHaveLength(1);
    expect(next.dialogues[0].key).toBe('a');
  });

  it('replaces the dialogue of the same object key', () => {
    const s = state([tree('a', 'npc-1')]);
    const cmd = new UpsertDialogueCommand('npc-1', tree('b', 'npc-1'));
    const next = cmd.execute(s);
    expect(next.dialogues).toHaveLength(1);
    expect(next.dialogues[0].key).toBe('b');
  });

  it('undo restores the previous dialogue', () => {
    const s = state([tree('a', 'npc-1')]);
    const cmd = new UpsertDialogueCommand('npc-1', tree('b', 'npc-1'));
    const after = cmd.execute(s);
    const back = cmd.undo(after);
    expect(back.dialogues[0].key).toBe('a');
  });
});

describe('DeleteDialogueCommand', () => {
  it('removes and undo restores', () => {
    const s = state([tree('a', 'npc-1')]);
    const cmd = new DeleteDialogueCommand('npc-1');
    const after = cmd.execute(s);
    expect(after.dialogues).toHaveLength(0);
    const back = cmd.undo(after);
    expect(back.dialogues[0].key).toBe('a');
  });
});
