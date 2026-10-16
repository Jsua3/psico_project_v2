import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthoringApi } from '../../../core/api/authoring.api';
import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { WorldCollisionZone, WorldDefinition, WorldObject } from '../../../core/models/simulation.model';
import { WorldEditorComponent } from './world-editor.component';
import { UpdateSpawnCommand } from './world-editor.store';

/**
 * Teclado del lienzo del editor de mundo (plan F8-5; RNF-04, WCAG 2.1.1 y 2.1.4): colocar, seleccionar, mover con
 * flechas (una casilla; Mayús, ocho) y borrar sin ratón, con los atajos de una letra solo cuando el foco está en el
 * lienzo. Como las acciones del inspector, se ejercita la lógica sobre el store sin dibujar Konva.
 */
function obj(key: string, over: Partial<WorldObject> = {}): WorldObject {
  return {
    id: 1, key, label: key, type: 'PERSON', x: 160, y: 160, width: 32, height: 32, zIndex: 0, facing: 'down',
    colorHex: '#fff', icon: '', shortCode: '', collision: false, visible: true, interactionPrompt: '',
    interactionText: '', decisionOptionId: null, toolCode: null, unlockCondition: {}, movementPattern: {},
    metadata: {}, ...over,
  };
}

function zone(key: string, over: Partial<WorldCollisionZone> = {}): WorldCollisionZone {
  return { id: 5, key, label: 'Mesa', x: 320, y: 96, width: 96, height: 64, ...over };
}

function definition(): WorldDefinition {
  return {
    schemaVersion: 2, caseVersionId: 1, revision: 1, nodeId: 3,
    map: { id: 1, key: 'm', title: 'M', width: 960, height: 540, theme: 'original', spawnX: 64, spawnY: 64, ambient: {} },
    objects: [obj('npc-1'), obj('puerta', { id: 2, type: 'EXIT', x: 480, y: 160 })], collisionZones: [zone('z1')],
    rooms: [], dialogues: [], clinicalTools: [],
    safeExit: { configured: false, exitObjectKey: null, supportResources: [] },
    validation: { errors: [], warnings: [], canPublish: true }, availableDecisions: [],
  };
}

const key = (name: string, over: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...over });

describe('WorldEditorComponent: teclado del lienzo', () => {
  let component: WorldEditorComponent;
  let saveWorld: ReturnType<typeof vi.fn>;
  let announce: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    saveWorld = vi.fn(() => of(definition()));
    TestBed.configureTestingModule({
      imports: [WorldEditorComponent],
      providers: [{
        provide: AuthoringApi,
        useValue: { worldEditor: vi.fn(() => of(definition())), saveWorld, validateWorld: vi.fn(() => of(definition().validation)) },
      }],
    });
    const fixture = TestBed.createComponent(WorldEditorComponent);
    fixture.componentRef.setInput('caseVersionId', 1);
    component = fixture.componentInstance;
    component.store.load(1, 3);
    announce = vi.spyOn(TestBed.inject(LiveRegionAnnouncer), 'announce');
  });

  afterEach(() => vi.useRealTimers());

  const state = () => component.store.editorState()!;
  const objectOf = (name: string) => state().objects.find(o => o.key === name)!;
  const zoneOf = (name: string) => state().collisionZones.find(z => z.key === name)!;
  const press = (name: string, over: KeyboardEventInit = {}) => component.onCanvasKeydown(key(name, over));

  // req: RNF-04
  describe('flechas', () => {
    it('sin nada seleccionado mueven el cursor del teclado una casilla (Mayús: ocho), empezando en el punto de aparición', () => {
      expect(component.keyboardCursor()).toEqual({ x: 64, y: 64 });

      press('ArrowRight');
      expect(component.keyboardCursor()).toEqual({ x: 80, y: 64 });

      press('ArrowDown', { shiftKey: true });
      expect(component.keyboardCursor()).toEqual({ x: 80, y: 192 });
    });

    it('el cursor no sale del mapa', () => {
      press('ArrowLeft', { shiftKey: true });
      press('ArrowLeft', { shiftKey: true });
      press('ArrowUp', { shiftKey: true });

      expect(component.keyboardCursor()).toEqual({ x: 0, y: 0 });
    });

    it('con un objeto seleccionado lo mueven (un paso deshacible por pulsación) y Mayús lo mueve ocho casillas', () => {
      component.store.select('npc-1');

      press('ArrowRight');
      expect(objectOf('npc-1')).toMatchObject({ x: 176, y: 160 });

      press('ArrowDown', { shiftKey: true });
      expect(objectOf('npc-1')).toMatchObject({ x: 176, y: 288 });

      component.store.undo();
      expect(objectOf('npc-1')).toMatchObject({ x: 176, y: 160 });
    });

    it('con una zona seleccionada la mueven sin cambiarle el tamaño ni sacarla del mapa', () => {
      component.store.select('z1');

      press('ArrowUp', { shiftKey: true });
      expect(zoneOf('z1')).toMatchObject({ x: 320, y: 0, width: 96, height: 64 });

      for (let i = 0; i < 5; i++) press('ArrowRight', { shiftKey: true });
      expect(zoneOf('z1').x).toBe(864); // 960 - 96: la zona entera cabe
    });

    it('anuncian la posición nueva (región viva) para quien no ve el lienzo', () => {
      component.store.select('npc-1');

      press('ArrowRight');

      expect(announce).toHaveBeenLastCalledWith(expect.stringContaining('176, 160'), 'polite');
    });
  });

  // req: RNF-04
  describe('Intro y Espacio según la herramienta', () => {
    it('«Seleccionar»: elige lo que hay bajo el cursor; sobre el vacío, quita la selección', () => {
      component.keyboardCursor.set({ x: 160, y: 160 });
      press('Enter');
      expect(component.store.selectedKey()).toBe('npc-1');

      component.keyboardCursor.set({ x: 352, y: 128 });
      press(' ');
      expect(component.store.selectedKey()).toBe('z1');

      component.keyboardCursor.set({ x: 800, y: 480 });
      press('Enter');
      expect(component.store.selectedKey()).toBeNull();
    });

    it('«Colocar objeto»: crea el objeto en el cursor, lo selecciona y vuelve a «Seleccionar»', () => {
      component.store.setTool('place-object');
      component.keyboardCursor.set({ x: 240, y: 208 });

      press('Enter');

      const created = state().objects.find(o => !['npc-1', 'puerta'].includes(o.key))!;
      expect(created).toMatchObject({ x: 240, y: 208 });
      expect(component.store.selectedKey()).toBe(created.key);
      expect(component.store.activeTool()).toBe('select');
    });

    it('«Zona de colisión»: la primera pulsación fija una esquina y la segunda crea la zona; Esc cancela', () => {
      component.store.setTool('place-collision');
      component.keyboardCursor.set({ x: 480, y: 320 });
      press('Enter');
      expect(component.zoneAnchor()).toEqual({ x: 480, y: 320 });
      expect(state().collisionZones).toHaveLength(1);

      component.keyboardCursor.set({ x: 576, y: 400 });
      press('Enter');
      expect(component.zoneAnchor()).toBeNull();
      expect(state().collisionZones).toHaveLength(2);
      expect(state().collisionZones[1]).toMatchObject({ x: 480, y: 320, width: 96, height: 80 });

      component.store.setTool('place-collision');
      press('Enter');
      expect(component.zoneAnchor()).not.toBeNull();
      press('Escape');
      expect(component.zoneAnchor()).toBeNull();
      expect(state().collisionZones).toHaveLength(2);
    });

    it('«Punto de aparición»: mueve la aparición al cursor y vuelve a «Seleccionar»', () => {
      component.store.setTool('place-spawn');
      component.keyboardCursor.set({ x: 128, y: 96 });

      press('Enter');

      expect(state().map).toMatchObject({ spawnX: 128, spawnY: 96 });
      expect(component.store.activeTool()).toBe('select');
    });
  });

  // req: RNF-04
  describe('borrar y recorrer', () => {
    it('Supr y Retroceso borran lo seleccionado (objeto con su diálogo, o zona) en un paso deshacible', () => {
      component.store.select('npc-1');
      press('Delete');
      expect(state().objects.map(o => o.key)).toEqual(['puerta']);

      component.store.select('z1');
      press('Backspace');
      expect(state().collisionZones).toHaveLength(0);

      component.store.undo();
      expect(state().collisionZones).toHaveLength(1);
    });

    it('AvPág y RePág recorren los elementos (objetos y luego zonas) y los seleccionan, dando la vuelta', () => {
      press('PageDown');
      expect(component.store.selectedKey()).toBe('npc-1');
      press('PageDown');
      expect(component.store.selectedKey()).toBe('puerta');
      press('PageDown');
      expect(component.store.selectedKey()).toBe('z1');
      press('PageDown');
      expect(component.store.selectedKey()).toBe('npc-1');

      press('PageUp');
      expect(component.store.selectedKey()).toBe('z1');
    });

    it('Esc quita la selección', () => {
      component.store.select('npc-1');

      press('Escape');

      expect(component.store.selectedKey()).toBeNull();
    });
  });

  // req: RNF-04, WCAG 2.1.4
  describe('atajos de una letra', () => {
    it('V, O, C, S y H eligen herramienta (mayúsculas o minúsculas) con el foco en el lienzo', () => {
      const expected: Array<[string, string]> = [
        ['o', 'place-object'], ['c', 'place-collision'], ['s', 'place-spawn'], ['h', 'pan'], ['v', 'select'], ['O', 'place-object'],
      ];
      for (const [letter, tool] of expected) {
        press(letter);
        expect(component.store.activeTool(), letter).toBe(tool);
      }
    });

    it('con Ctrl, Alt o Meta una letra NO cambia de herramienta (Ctrl+C y Ctrl+V son del navegador)', () => {
      press('c', { ctrlKey: true });
      press('o', { altKey: true });
      press('s', { metaKey: true });

      expect(component.store.activeTool()).toBe('select');
    });

    it('con el foco en la barra de herramientas las letras también eligen herramienta, como anuncian sus aria-keyshortcuts', () => {
      component.onToolbarKeydown(key('c'));
      expect(component.store.activeTool()).toBe('place-collision');

      component.onToolbarKeydown(key('H'));
      expect(component.store.activeTool()).toBe('pan');

      // Con Ctrl o Alt la letra es del navegador, también aquí.
      component.onToolbarKeydown(key('o', { ctrlKey: true }));
      component.onToolbarKeydown(key('v', { altKey: true }));
      expect(component.store.activeTool()).toBe('pan');
    });

    it('Ctrl+Z y Ctrl+Y deshacen y rehacen', () => {
      component.store.select('npc-1');
      press('ArrowRight');
      expect(objectOf('npc-1').x).toBe(176);

      press('z', { ctrlKey: true });
      expect(objectOf('npc-1').x).toBe(160);

      press('y', { ctrlKey: true });
      expect(objectOf('npc-1').x).toBe(176);
    });
  });

  // req: RNF-04, RNF-08
  describe('Ctrl+S y el resto del editor', () => {
    it('Ctrl+S guarda al instante (sin esperar el autoguardado) aunque el foco no esté en el lienzo', () => {
      component.store.select('npc-1');
      press('ArrowRight');
      saveWorld.mockClear();
      const event = key('s', { ctrlKey: true });

      component.onEditorKeydown(event);

      expect(saveWorld).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('con el foco en un campo de texto, Ctrl+Z no deshace el lienzo (es del campo), pero Ctrl+S sí guarda', () => {
      component.store.select('npc-1');
      press('ArrowRight'); // una edición que se podría deshacer
      expect(objectOf('npc-1').x).toBe(176);
      const input = document.createElement('input');
      document.body.appendChild(input);
      const undo = key('z', { ctrlKey: true });
      Object.defineProperty(undo, 'target', { value: input });
      saveWorld.mockClear();

      component.onEditorKeydown(undo);
      expect(objectOf('npc-1').x).toBe(176);
      expect(undo.defaultPrevented).toBe(false);

      const save = key('s', { ctrlKey: true });
      Object.defineProperty(save, 'target', { value: input });
      component.onEditorKeydown(save);
      expect(saveWorld).toHaveBeenCalledTimes(1);
      input.remove();
    });

    it('los atajos de letra ya no escuchan a toda la ventana (WCAG 2.1.4)', () => {
      window.dispatchEvent(key('c'));
      document.body.dispatchEvent(key('o'));

      expect(component.store.activeTool()).toBe('select');
    });
  });

  // F8 · revisión (I1). req: RNF-04
  describe('cursor del teclado tras editar', () => {
    it('se queda donde estaba: un cambio del estado no lo devuelve al punto de aparición', () => {
      press('ArrowRight', { shiftKey: true });
      expect(component.keyboardCursor()).toEqual({ x: 192, y: 64 });

      press('o');
      press('Enter'); // coloca un objeto: cambia el estado del editor
      expect(component.keyboardCursor()).toEqual({ x: 192, y: 64 });

      press('ArrowDown'); // mueve el objeto recién colocado
      press('Delete'); // y lo borra: otro cambio
      expect(component.keyboardCursor()).toEqual({ x: 192, y: 80 });
    });

    it('cuando el punto de aparición sí cambia, el cursor lo sigue', () => {
      press('ArrowRight'); // (80, 64)
      expect(component.keyboardCursor()).toEqual({ x: 80, y: 64 });

      component.store.execute(new UpdateSpawnCommand(320, 96));

      expect(component.keyboardCursor()).toEqual({ x: 320, y: 96 });
    });
  });

  // F8 · revisión (I2). req: RNF-04
  describe('selector de sala', () => {
    const roomSelect = (chosen: number) => {
      const select = document.createElement('select');
      for (const id of [3, 8]) {
        const option = document.createElement('option');
        option.value = String(id);
        select.appendChild(option);
      }
      select.value = String(chosen);
      return select;
    };

    it('pide la sala elegida pero deja el selector en la que se ve: solo cambia cuando la nueva llega', () => {
      const switchRoom = vi.spyOn(component.store, 'switchRoom').mockImplementation(() => undefined);
      const select = roomSelect(8);

      component.onRoomChange({ target: select } as unknown as Event);

      expect(switchRoom).toHaveBeenCalledWith(8);
      expect(select.value).toBe('3');
    });
  });

  // F8 · revisión (I3). req: RNF-08
  describe('solo lectura', () => {
    beforeEach(() => component.store.readOnly.set(true));

    it('las flechas con algo seleccionado mueven el cursor, no editan ni anuncian que se movió', () => {
      component.store.select('npc-1');
      announce.mockClear();

      press('ArrowRight');

      expect(objectOf('npc-1').x).toBe(160);
      expect(component.store.dirty()).toBe(false);
      expect(announce.mock.calls.map((call: unknown[]) => String(call[0]))).not.toContain('npc-1: 176, 160');
      expect(component.keyboardCursor()).toEqual({ x: 80, y: 64 });
    });

    it('Supr no borra lo seleccionado ni anuncia que lo borró', () => {
      component.store.select('npc-1');
      announce.mockClear();

      press('Delete');

      expect(state().objects.map(o => o.key)).toContain('npc-1');
      expect(announce).not.toHaveBeenCalledWith('npc-1 eliminado', 'polite');
    });

    it('las herramientas de edición no se pueden elegir; «Seleccionar» y «Mover lienzo» sí', () => {
      press('o');
      press('c');
      press('s');
      expect(component.store.activeTool()).toBe('select');

      press('h');
      expect(component.store.activeTool()).toBe('pan');
      press('v');
      expect(component.store.activeTool()).toBe('select');
    });
  });

  // F8 · revisión (menor, nombre de los tipos en voz). req: RNF-04, BLOQUE-H
  describe('anuncios', () => {
    it('usan los nombres en español de los tipos de objeto (no PERSON ni EXIT)', () => {
      announce.mockClear();

      press('PageDown');
      press('PageDown');

      const said = announce.mock.calls.map((call: unknown[]) => String(call[0])).join(' | ');
      expect(said).toContain('Persona');
      expect(said).toContain('Salida');
      expect(said).not.toMatch(/PERSON|EXIT/);
    });
  });
});
