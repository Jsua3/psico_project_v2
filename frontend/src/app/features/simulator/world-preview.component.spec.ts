// Phaser inicializa un canvas WebGL al importarse, cosa que jsdom no soporta (mismo doble que el resto de specs
// del juego): el mundo real se sustituye por un doble que cuenta cuántas veces se monta y se desmonta.
vi.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class {},
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0 },
    Math: { Clamp: (value: number) => value },
    Input: { Keyboard: { JustDown: () => false } },
  },
}));

import { Component, DestroyRef, inject, input, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { Subject } from 'rxjs';

import { AuthoringApi } from '../../core/api/authoring.api';
import { MapObjectState, SimulationWorldState, WorldDefinition, WorldObject } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { GameWorldComponent } from './game-world.component';
import { WorldPreviewComponent } from './world-preview.component';

/**
 * Vista previa del editor de casos (plan visual F8-6): recargar y cambiar de nodo NO desmontan el tablero (antes
 * `worldState` pasaba a `null` y Phaser se destruía y se volvía a crear en cada recarga), una respuesta tardía no pisa
 * la última y NO hay métricas inventadas: el «Puntaje» sumaba 10 fijos por decisión y el «Estrés» era un 0 % que
 * nunca cambiaba. Lo que se cuenta es lo que pasó de verdad: objetos revisados y decisiones probadas. Pruebas
 * síncronas (el archivo lleva `vi.mock`): las respuestas del servidor son `Subject` que se resuelven a mano.
 */
@Component({ selector: 'app-game-world', template: '<canvas data-testid="tablero"></canvas>' })
class GameWorldStub {
  static created = 0;
  static destroyed = 0;
  readonly world = input<SimulationWorldState | null>(null);
  readonly nearbyInteraction = input<MapObjectState | null>(null);
  readonly selectedInteractionKey = input<string | null>(null);
  readonly reduceMotion = input(false);
  readonly proximity = output<MapObjectState | null>();
  readonly interact = output<MapObjectState>();
  readonly positionChange = output<{ x: number; y: number }>();
  readonly focus = vi.fn();

  constructor() {
    GameWorldStub.created++;
    inject(DestroyRef).onDestroy(() => GameWorldStub.destroyed++);
  }
}

function worldObject(key: string, over: Partial<WorldObject> = {}): WorldObject {
  return {
    id: 1, key, label: key, type: 'PERSON', x: 160, y: 160, width: 32, height: 32, zIndex: 0, facing: 'down',
    colorHex: '#4FA3A5', icon: '', shortCode: 'NPC', collision: false, visible: true, interactionPrompt: 'Hablar',
    interactionText: 'Hola', decisionOptionId: null, toolCode: null, unlockCondition: {}, movementPattern: {},
    metadata: {}, ...over,
  };
}

function definition(title: string, nodeId = 1, revision = 3): WorldDefinition {
  return {
    schemaVersion: 2, caseVersionId: 7, revision, nodeId,
    map: { id: nodeId, key: `m${nodeId}`, title, width: 960, height: 540, theme: 'original', spawnX: 64, spawnY: 64, ambient: {} },
    objects: [worldObject('npc-1', { id: 1 }), worldObject('puerta', { id: 2, type: 'EXIT' }), worldObject('oculto', { id: 3, visible: false })],
    collisionZones: [], rooms: [], dialogues: [], clinicalTools: [],
    safeExit: { configured: false, exitObjectKey: null, supportResources: [] },
    validation: { errors: [], warnings: [], canPublish: true }, availableDecisions: [],
  };
}

const NODES = [
  { id: 1, key: 'inicio', title: 'Inicio del caso' },
  { id: 2, key: 'urgencias', title: 'Urgencias' },
];

describe('WorldPreviewComponent: vista previa del autor', () => {
  let fixture: ComponentFixture<WorldPreviewComponent>;
  let component: WorldPreviewComponent;
  let requests: Array<{ nodeId: number | undefined; response: Subject<WorldDefinition> }>;
  let worldPreview: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    GameWorldStub.created = 0;
    GameWorldStub.destroyed = 0;
    requests = [];
    worldPreview = vi.fn((_caseVersionId: number, nodeId?: number) => {
      const response = new Subject<WorldDefinition>();
      requests.push({ nodeId, response });
      return response;
    });
    TestBed.configureTestingModule({
      imports: [WorldPreviewComponent],
      providers: [
        { provide: AuthoringApi, useValue: { worldPreview } },
        {
          provide: AudioDirectorService,
          useValue: {
            init: vi.fn(), setStressLevel: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false),
            dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn(),
          },
        },
      ],
    });
    TestBed.overrideComponent(WorldPreviewComponent, {
      remove: { imports: [GameWorldComponent] },
      add: { imports: [GameWorldStub] },
    });
    fixture = TestBed.createComponent(WorldPreviewComponent);
    fixture.componentRef.setInput('caseVersionId', 7);
    fixture.componentRef.setInput('nodes', NODES);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const respond = (index: number, def: WorldDefinition) => {
    requests[index].response.next(def);
    requests[index].response.complete();
    fixture.detectChanges();
  };
  const fail = (index: number, status: number) => {
    requests[index].response.error(new HttpErrorResponse({ status }));
    fixture.detectChanges();
  };
  const stubs = () => fixture.debugElement.queryAll(By.directive(GameWorldStub));
  const stub = () => stubs()[0].componentInstance as GameWorldStub;
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const reloadButton = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.preview-actions button')!;
  const nodeSelect = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('select')!;

  // req: RNF-04
  describe('carga', () => {
    it('al abrirse pide el primer nodo y, al llegar, monta el tablero con ese mundo', () => {
      expect(worldPreview).toHaveBeenCalledWith(7, 1);
      expect(stubs()).toHaveLength(0);

      respond(0, definition('Sala de espera'));

      expect(stubs()).toHaveLength(1);
      expect(stub().world()!.map.title).toBe('Sala de espera');
    });

    it('«Recargar» no desmonta el tablero: sigue montado mientras llega la respuesta y se actualiza en su sitio', () => {
      respond(0, definition('Sala de espera'));
      const before = stub();

      reloadButton().click();
      fixture.detectChanges();

      expect(worldPreview).toHaveBeenCalledTimes(2);
      expect(stubs()).toHaveLength(1);
      expect(stub()).toBe(before);
      expect(GameWorldStub.destroyed).toBe(0);

      respond(1, definition('Sala de espera (editada)', 1, 4));

      expect(stubs()).toHaveLength(1);
      expect(stub()).toBe(before);
      expect(GameWorldStub.created).toBe(1);
      expect(GameWorldStub.destroyed).toBe(0);
      expect(stub().world()!.map.title).toBe('Sala de espera (editada)');
    });

    it('cambiar de nodo conserva el tablero hasta que llega el otro mundo', () => {
      respond(0, definition('Sala de espera'));

      nodeSelect().value = '2';
      nodeSelect().dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(worldPreview).toHaveBeenLastCalledWith(7, 2);
      expect(stubs()).toHaveLength(1);
      respond(1, definition('Urgencias', 2));
      expect(GameWorldStub.created).toBe(1);
      expect(stub().world()!.map.title).toBe('Urgencias');
    });

    it('una respuesta tardía de una carga anterior no pisa la última', () => {
      respond(0, definition('Sala de espera'));
      nodeSelect().value = '2';
      nodeSelect().dispatchEvent(new Event('change'));
      fixture.detectChanges();
      // El selector vuelve al primer nodo antes de que llegue el segundo.
      nodeSelect().value = '1';
      nodeSelect().dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(requests).toHaveLength(3);

      respond(2, definition('Sala de espera', 1, 5));
      respond(1, definition('Urgencias', 2));

      expect(stub().world()!.map.title).toBe('Sala de espera');
      expect(component.definition()!.revision).toBe(5);
    });

    it('mientras carga, «Recargar» queda aria-disabled (no hay doble petición) y avisa «Actualizando…»', () => {
      respond(0, definition('Sala de espera'));
      reloadButton().click();
      fixture.detectChanges();

      expect(reloadButton().getAttribute('aria-disabled')).toBe('true');
      reloadButton().click();
      expect(worldPreview).toHaveBeenCalledTimes(2);
      expect((fixture.nativeElement as HTMLElement).querySelector('[role="status"]')!.textContent).toContain('Actualizando');
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('errores', () => {
    it('si la recarga falla conserva el último tablero cargado, lo dice y ofrece «Reintentar»', () => {
      respond(0, definition('Sala de espera'));
      reloadButton().click();
      fixture.detectChanges();

      fail(1, 500);

      expect(stubs()).toHaveLength(1);
      expect(stub().world()!.map.title).toBe('Sala de espera');
      expect(text()).toContain('No se pudo cargar');
      expect(text()).toContain('última versión');
      const retry = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
        .find(button => button.textContent?.trim() === 'Reintentar')!;
      retry.click();
      expect(worldPreview).toHaveBeenCalledTimes(3);
    });

    it('si falla la carga de OTRO nodo, no deja el tablero del anterior (ya no coincide con el selector)', () => {
      respond(0, definition('Sala de espera'));
      nodeSelect().value = '2';
      nodeSelect().dispatchEvent(new Event('change'));
      fixture.detectChanges();

      fail(1, 404);

      expect(stubs()).toHaveLength(0);
      expect(text()).toContain('No hay mapa configurado para este nodo');
    });
  });

  // req: RNF-04
  describe('sin métricas inventadas', () => {
    it('no muestra «Puntaje» ni «Estrés» (antes sumaba 10 fijos por decisión y un 0 % que no cambiaba)', () => {
      respond(0, definition('Sala de espera'));
      component.simulateDecision(5);
      fixture.detectChanges();

      expect(text()).not.toMatch(/Puntaje|Estrés/);
      expect(text()).not.toMatch(/\d+\s*%/);
    });

    it('cuenta lo que pasó de verdad: objetos visibles revisados y decisiones distintas probadas', () => {
      respond(0, definition('Sala de espera'));
      expect(text()).toContain('Objetos revisados: 0 de 2');
      expect(text()).toContain('Decisiones probadas: 0');

      stub().interact.emit(stub().world()!.objects[0]);
      stub().interact.emit(stub().world()!.objects[0]);
      component.simulateDecision(5);
      component.simulateDecision(5);
      component.simulateDecision(6);
      fixture.detectChanges();

      expect(text()).toContain('Objetos revisados: 1 de 2');
      expect(text()).toContain('Decisiones probadas: 2');
    });

    it('al probar una decisión lo dice sin prometer efectos: no se guarda ni se califica', () => {
      respond(0, definition('Sala de espera'));

      component.simulateDecision(5);
      fixture.detectChanges();

      const status = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]')!.textContent!;
      expect(status).toContain('Decisión probada');
      expect(text()).toContain('no se guarda ni se califica');
    });
  });

  // req: RNF-04, WCAG 4.1.2
  describe('selector de nodo', () => {
    it('tiene nombre accesible y muestra el título con su clave', () => {
      respond(0, definition('Sala de espera'));

      const select = nodeSelect();
      const label = (fixture.nativeElement as HTMLElement).querySelector(`label[for="${select.id}"]`);
      expect(label?.textContent).toContain('Nodo');
      expect(Array.from(select.options).map(option => option.textContent?.trim()))
        .toEqual(['Inicio del caso (inicio)', 'Urgencias (urgencias)']);
    });
  });
});
