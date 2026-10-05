import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { SimulationService } from '../../../core/api/simulation.service';
import { WorldCollisionZone, WorldDefinition, WorldDialogueTree, WorldObject } from '../../../core/models/simulation.model';
import { AUTHORING_SCENE_TEMPLATES } from '../authoring-catalog.config';
import { WorldEditorComponent } from './world-editor.component';

/**
 * Caracteriza las acciones del inspector del editor de mundo (`updateZoneLabel`,
 * `deleteSelected`, `applyScenePreset`, `addTemplate`) sin dibujar el lienzo Konva: el
 * componente se crea pero NO se renderiza (no hay `detectChanges`), así que solo se ejercita
 * su lógica sobre el store. Sirve de red de seguridad para el cambio P-07 (Command + Composite).
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
  return { id: 5, key, label: 'Mesa', x: 1, y: 2, width: 30, height: 40, ...overrides };
}

function tree(objectKey: string): WorldDialogueTree {
  return {
    id: 1, key: `dlg-${objectKey}`, speakerName: 'X', portraitKey: null, emotion: 'neutral',
    mapObjectId: null, mapObjectKey: objectKey, lines: [], choices: [],
  };
}

function definition(): WorldDefinition {
  return {
    schemaVersion: 2, caseVersionId: 1, revision: 1, nodeId: 3,
    map: { id: 1, key: 'm', title: 'M', width: 960, height: 540, theme: 'original', spawnX: 100, spawnY: 100, ambient: {} },
    objects: [obj('npc-1')], collisionZones: [zone('z1')], rooms: [], dialogues: [tree('npc-1')],
    clinicalTools: [], safeExit: { configured: false, exitObjectKey: null, supportResources: [] },
    validation: { errors: [], warnings: [], canPublish: true }, availableDecisions: [],
  };
}

describe('WorldEditorComponent: acciones del inspector', () => {
  let component: WorldEditorComponent;

  beforeEach(() => {
    vi.useFakeTimers();
    const sim = {
      worldEditor: vi.fn(() => of(definition())),
      saveWorld: vi.fn(() => of(definition())),
      validateWorld: vi.fn(() => of(definition().validation)),
    };
    TestBed.configureTestingModule({
      imports: [WorldEditorComponent],
      providers: [{ provide: SimulationService, useValue: sim }],
    });
    const fixture = TestBed.createComponent(WorldEditorComponent);
    fixture.componentRef.setInput('caseVersionId', 1);
    component = fixture.componentInstance;
    component.store.load(1);
  });

  afterEach(() => vi.useRealTimers());

  const state = () => component.store.editorState()!;
  const zoneOf = (key: string) => state().collisionZones.find(z => z.key === key)!;

  describe('updateZoneLabel', () => {
    it('cambia la etiqueta de la zona sin tocar su geometría', () => {
      component.updateZoneLabel('z1', 'Escritorio');

      expect(zoneOf('z1')).toMatchObject({ label: 'Escritorio', x: 1, y: 2, width: 30, height: 40 });
    });

    it('con una zona inexistente no hace nada', () => {
      component.updateZoneLabel('no-existe', 'x');

      expect(component.store.canUndo()).toBe(false);
      expect(state().collisionZones).toHaveLength(1);
    });

    it('comportamiento actual: registra un comando «ResizeZone» vacío en la pila', () => {
      component.updateZoneLabel('z1', 'Escritorio');

      expect(component.store.canUndo()).toBe(true);
    });

    it('comportamiento actual: deshacer NO revierte la etiqueta (se escribió fuera de la pila)', () => {
      component.updateZoneLabel('z1', 'Escritorio');

      component.store.undo();

      // El deshacer consume el comando vacío; la etiqueta se quedó cambiada.
      expect(zoneOf('z1').label).toBe('Escritorio');
      expect(component.store.canUndo()).toBe(false);
    });
  });

  describe('deleteSelected', () => {
    it('sin selección no hace nada', () => {
      component.deleteSelected();

      expect(component.store.canUndo()).toBe(false);
      expect(state().objects).toHaveLength(1);
    });

    it('borra el objeto seleccionado, limpia la selección y se puede deshacer', () => {
      component.store.select('npc-1');

      component.deleteSelected();

      expect(state().objects).toEqual([]);
      expect(component.store.selectedKey()).toBeNull();
      component.store.undo();
      expect(state().objects.map(o => o.key)).toEqual(['npc-1']);
    });

    it('borra la zona seleccionada y se puede deshacer', () => {
      component.store.select('z1');

      component.deleteSelected();

      expect(state().collisionZones).toEqual([]);
      component.store.undo();
      expect(state().collisionZones.map(z => z.key)).toEqual(['z1']);
    });

    it('comportamiento actual: borrar un objeto deja huérfano su diálogo', () => {
      component.store.select('npc-1');

      component.deleteSelected();

      expect(state().dialogues.map(d => d.mapObjectKey)).toEqual(['npc-1']);
    });

    it('una clave que no es ni objeto ni zona solo limpia la selección', () => {
      component.store.select('fantasma');

      component.deleteSelected();

      expect(component.store.selectedKey()).toBeNull();
      expect(component.store.canUndo()).toBe(false);
    });
  });

  describe('deleteSelectedZone', () => {
    it('borra la zona seleccionada con un único comando', () => {
      component.store.select('z1');

      component.deleteSelectedZone();
      expect(state().collisionZones).toEqual([]);
      expect(component.store.selectedKey()).toBeNull();

      component.store.undo();
      expect(component.store.canUndo()).toBe(false);
      expect(state().collisionZones).toHaveLength(1);
    });
  });

  describe('applyScenePreset', () => {
    it('aplica la plantilla en UN solo paso deshacible', () => {
      const template = AUTHORING_SCENE_TEMPLATES.find(t => t.id === 'hospital')!;

      component.applyScenePreset('hospital');

      expect(state().map.theme).toBe(template.theme);
      component.store.undo();
      expect(state().map.theme).toBe('original');
      expect(component.store.canUndo()).toBe(false);
    });

    it('una plantilla desconocida no hace nada', () => {
      component.applyScenePreset('no-existe');

      expect(state().map.theme).toBe('original');
      expect(component.store.canUndo()).toBe(false);
    });
  });

  describe('addTemplate', () => {
    it('coloca el objeto, lo selecciona y se puede deshacer', () => {
      component.addTemplate('npc');

      expect(state().objects).toHaveLength(2);
      const added = state().objects[1];
      expect(added.key).toMatch(/^npc-/);
      expect(added.type).toBe('PERSON');
      expect(component.store.selectedKey()).toBe(added.key);
      expect(added.id).toBe(6); // siguiente id local: máx(1, 5) + 1

      component.store.undo();
      expect(state().objects).toHaveLength(1);
    });

    it('una plantilla desconocida no hace nada', () => {
      component.addTemplate('no-existe');

      expect(state().objects).toHaveLength(1);
      expect(component.store.canUndo()).toBe(false);
    });
  });

  describe('updateObjectField', () => {
    it('cambia un campo del objeto con un comando deshacible', () => {
      component.updateObjectField('npc-1', 'label', 'Dra. López');
      expect(state().objects[0].label).toBe('Dra. López');

      component.store.undo();
      expect(state().objects[0].label).toBe('npc-1');
    });
  });
});
