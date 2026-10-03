// Phaser inicializa un canvas WebGL al importarse, cosa que jsdom no soporta (mismo doble que el resto
// de specs de instancia del juego): solo se evalúa `extends Phaser.Scene` al cargar el módulo.
jest.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class {},
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0 },
    Math: { Clamp: (value: number) => value },
    Input: { Keyboard: { JustDown: () => false } },
  },
}));

import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { EMPTY, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import {
  DialogueState, MapObjectState, NpcConfig, SimulationAttemptState, SimulationWorldState,
} from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { SimulationPlayComponent } from './simulation-play.component';

/**
 * Integración de la orientación en la pantalla de juego (T9.1 a T9.11, T8.4): la tarjeta «Qué hacer»,
 * el contador único, la etapa nueva, las puertas, los avisos y las personas del mundo. Se ejercita la
 * instancia con las coordenadas y los nombres del seed, como el resto de specs de instancia del juego.
 */

const CASE_VERSION_ID = 7;

function obj(
  key: string, label: string, type: MapObjectState['type'], x: number, y: number, extra: Partial<MapObjectState> = {},
): MapObjectState {
  return {
    key, label, type, x, y, width: 40, height: 40, color: '#fff', icon: '', shortCode: '', collision: false,
    interactionPrompt: '', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null, ...extra,
  };
}

const door = (key: string, label: string, x: number, y: number, metadata?: Record<string, unknown>) =>
  obj(key, label, 'EXIT', x, y, { metadata });

function urgenciasObjects(collected = false): MapObjectState[] {
  return [
    obj('familia-crisis', 'Familia en crisis', 'PERSON', 190, 420),
    obj('zona-restringida', 'Acceso a quirófano', 'OBJECT', 660, 268),
    ...(collected ? [] : [obj('tool-pap', 'Kit PAP', 'TOOL', 318, 428, { toolCode: 'PAP' })]),
    door('puerta-sala-escucha', 'Sala de escucha familiar', 838, 440, {
      targetNodeKey: 'hospital-sala-escucha', requiresInspected: ['familia-crisis'], lockedMessage: 'Completa la contención de la familia.',
    }),
  ];
}

function makeWorld(mapKey: string, objects: MapObjectState[], extra: Record<string, unknown> = {}): SimulationWorldState {
  return {
    map: { key: mapKey, title: mapKey },
    objects,
    tools: [{ code: 'PAP', label: 'Primeros Auxilios Psicológicos', icon: 'healing', category: 'x', description: 'd', active: true }],
    inventory: [], usedToolKeys: [], inspectedObjectKeys: [], flags: {},
    ...extra,
  } as unknown as SimulationWorldState;
}

function makeAttempt(nodeKey = 'hospital-urgencias', overrides: Record<string, unknown> = {}): SimulationAttemptState {
  return {
    attemptId: 'attempt-1',
    attemptToken: 'token-1',
    caseVersionId: CASE_VERSION_ID,
    caseTitle: 'Caso demo',
    status: 'IN_PROGRESS',
    accumulatedScore: 0,
    stressIndex: 0,
    metrics: { victimRisk: 50 },
    currentNode: {
      id: 1, key: nodeKey, title: 'Título del nodo', narrative: 'Primera frase. Segunda frase.', terminal: false,
      options: [{ id: 101, text: 'Opción' }],
    },
    feedback: null,
    completionReport: null,
    ...overrides,
  } as unknown as SimulationAttemptState;
}

const http = (status: number, message?: string) => new HttpErrorResponse({ status, error: message ? { message } : null });

describe('SimulationPlayComponent: orientación integrada', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, jest.Mock>;
  let audio: Record<string, jest.Mock>;

  beforeEach(() => {
    jest.useFakeTimers();
    sessionStorage.clear();
    localStorage.clear();
    sim = {
      getInterventionRules: jest.fn(() => throwError(() => new Error('sin reglas'))),
      getActiveAttempt: jest.fn(() => of(null)),
      startAttempt: jest.fn(() => of(makeAttempt())),
      getProgressMap: jest.fn(() => EMPTY),
      getWorld: jest.fn(() => EMPTY),
      getScenarioConfig: jest.fn(() => throwError(() => new Error('sin escenario'))),
      safeExit: jest.fn(() => EMPTY),
      enterRoom: jest.fn(() => EMPTY),
      recordNpcInteraction: jest.fn(() => EMPTY),
      updateWorldState: jest.fn(() => EMPTY),
      openInteraction: jest.fn(() => EMPTY),
      chooseDecision: jest.fn(() => EMPTY),
      useTool: jest.fn(() => EMPTY),
    };
    audio = {
      init: jest.fn(), setStressLevel: jest.fn(), isMusicMuted: jest.fn(() => false), isSfxMuted: jest.fn(() => false),
      dispose: jest.fn(), stopIntroLament: jest.fn(), playIntroLament: jest.fn(), playSfx: jest.fn(),
      toggleMusicMuted: jest.fn(() => false), playResolution: jest.fn(),
    };
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        { provide: AudioDirectorService, useValue: audio },
        { provide: AuthService, useValue: {} },
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: String(CASE_VERSION_ID) }) } },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
  });

  afterEach(() => {
    jest.useRealTimers();
    sessionStorage.clear();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  /** Estado de una partida en Urgencias, al empezar. */
  function startInUrgencias(world = makeWorld('hospital-urgencias', urgenciasObjects())): void {
    component.attempt.set(makeAttempt());
    component.world.set(world);
  }

  const tick = (ms = 0) => { jest.advanceTimersByTime(ms); TestBed.tick(); };

  describe('T9.1: tarjeta «Qué hacer»', () => {
    it('sin mundo o sin intento no hay lista', () => {
      expect(component.sceneLog()).toBeNull();
      component.attempt.set(makeAttempt());
      expect(component.sceneLog()).toBeNull();
    });

    it('en la etapa 1 la lista empieza por recoger el material y lo marca como siguiente', () => {
      startInUrgencias();

      const log = component.sceneLog();

      expect(log?.number).toBe(1);
      expect(log?.title).toBe('Urgencia vital y crisis');
      expect(log?.next?.stepId).toBe('u1-recoger');
      expect(log?.nextLine).toMatch(/^Ahora: Recoge el material de apoyo de la sala · /);
    });

    it('tras recoger el kit el siguiente paso es hablar con la familia', () => {
      startInUrgencias();
      component.world.set(makeWorld('hospital-urgencias', urgenciasObjects(true), { inventory: ['PAP'] }));

      expect(component.sceneLog()?.next?.stepId).toBe('u1-familia');
    });

    it('un intento que no está en curso no tiene lista', () => {
      startInUrgencias();
      component.attempt.set(makeAttempt('hospital-urgencias', { status: 'PAUSED' }));

      expect(component.sceneLog()).toBeNull();
    });

    it('un mundo con forma inesperada no tumba la pantalla: la lista se omite', () => {
      component.attempt.set(makeAttempt());
      component.world.set({ map: { key: 'hospital-urgencias' }, objects: [] } as unknown as SimulationWorldState);

      expect(component.sceneLog()).toBeNull();
    });

    it('al cargar un mundo recuerda la sala en la señal y en sessionStorage', () => {
      component.attempt.set(makeAttempt());

      (component as any).applyLoadedWorld(makeWorld('hospital-urgencias', urgenciasObjects()));

      expect([...component.visitedRooms()]).toEqual(['urgencias']);
      expect(JSON.parse(sessionStorage.getItem(`siep_rooms_${CASE_VERSION_ID}_attempt-1`) ?? '[]')).toEqual(['urgencias']);
    });

    it('una sala que no es del caso no se recuerda', () => {
      component.attempt.set(makeAttempt());

      (component as any).applyLoadedWorld(makeWorld('mapa-del-editor', []));

      expect(component.visitedRooms().size).toBe(0);
    });

    it('al arrancar el mundo recupera las salas que ya se habían visitado', () => {
      sessionStorage.setItem(`siep_rooms_${CASE_VERSION_ID}_attempt-1`, JSON.stringify(['urgencias', 'sala-escucha']));

      (component as any).startWorld(makeAttempt());

      expect([...component.visitedRooms()].sort()).toEqual(['sala-escucha', 'urgencias']);
    });

    it('un intento nuevo olvida las salas y las notas del anterior', () => {
      component.attempt.set(makeAttempt());
      (component as any).applyLoadedWorld(makeWorld('hospital-urgencias', urgenciasObjects()));
      (component as any).pendingNotes.push('Anotado: algo.');

      component.startNewAttempt();

      expect(component.visitedRooms().size).toBe(0);
      expect(sessionStorage.getItem(`siep_rooms_${CASE_VERSION_ID}_attempt-1`)).toBeNull();
      expect((component as any).pendingNotes).toEqual([]);
    });
  });

  describe('T9.2: contador único y etapa nueva', () => {
    it('el HUD recibe «Decisión k de 6» según la etapa', () => {
      component.attempt.set(makeAttempt('hospital-accion-etica'));

      expect(component.stageLabel()).toBe('Decisión 3 de 6');
    });

    it('en el nodo final dice «Caso cerrado»', () => {
      component.attempt.set(makeAttempt('cierre-caso'));

      expect(component.stageLabel()).toBe('Caso cerrado');
    });

    it('un nodo sin etapa usa el contador por escenarios solo si hay mapa de progreso; si no, no hay chip', () => {
      component.attempt.set(makeAttempt('nodo-del-editor'));
      expect(component.stageLabel()).toBeNull();

      component.progressMap.set({
        currentNodeKey: 'nodo-del-editor', visitedNodeKeys: [],
        nodes: [{ key: 'a' }, { key: 'nodo-del-editor' }],
      } as never);
      expect(component.stageLabel()).toBe('Escenario 2 de 2');
    });

    /** Decide en `previousNode` (mundo `fromMap`) y deja que llegue el mundo `toMap` de la etapa nueva. */
    function decideTo(nextNodeKey: string, toMap: string, previousNode: string, fromMap = toMap): void {
      component.attempt.set(makeAttempt(previousNode));
      component.world.set(makeWorld(fromMap, []));
      sim['chooseDecision'].mockReturnValue(of(makeAttempt(nextNodeKey)));
      sim['getWorld'].mockReturnValue(of(makeWorld(toMap, [])));
      sim['getScenarioConfig'].mockReturnValue(of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] }));
      component.dialogue.set({
        key: 'd', speakerName: 'Alguien', portraitKey: null, emotion: 'neutral',
        lines: [{ order: 1, speakerName: 'Alguien', text: 'Texto.', emotion: 'neutral' }],
        choices: [{ key: 'o', text: 'Opción', decisionOptionId: 101, requiredToolCode: null, effect: {} }],
      } as DialogueState);
      component.executeDecision(101);
      // La compuerta blanda de la etapa avisa antes (nodos con evidencia): se decide igualmente.
      if (component.dialogue()?.key.startsWith('evidence-gate')) component.executeDecision(101);
      tick(340); // fundido
      tick(100); // el mundo nuevo ya se ve
    }

    it('al pasar a otra etapa con el mismo mapa hay banner «Nueva etapa: …» y la tarjeta anota «Decisión k registrada»', () => {
      decideTo('hospital-accion-etica', 'hospital-sala-escucha', 'hospital-sala-escucha');
      tick();

      expect(component.roomBanner()).toBe('Nueva etapa: Acción técnica y ética');
      expect(component.checklistNotice()).toBe('Decisión 2 registrada');
    });

    it('con la sala distinta el banner de etapa manda sobre el nombre de la sala', () => {
      decideTo('hospital-sala-escucha', 'hospital-sala-escucha', 'hospital-urgencias', 'hospital-urgencias');

      expect(component.roomBanner()).toBe('Nueva etapa: Marco normativo en salud');
    });

    it('la primera decisión se anota como «Decisión 1 registrada»', () => {
      decideTo('hospital-sala-escucha', 'hospital-sala-escucha', 'hospital-urgencias', 'hospital-urgencias');
      tick();

      expect(component.checklistNotice()).toBe('Decisión 1 registrada');
    });

    it('si la decisión no cambia de etapa (primera respuesta mala) no hay banner ni nota', () => {
      decideTo('hospital-urgencias', 'hospital-urgencias', 'hospital-urgencias');
      tick();

      expect(component.roomBanner()).toBe('');
      expect(component.checklistNotice()).toBeNull();
    });

    it('al recargar o reanudar con el mismo intento no reaparece el banner de etapa', () => {
      sessionStorage.setItem(`siep_case_consent_${CASE_VERSION_ID}_attempt-1`, 'given');
      sim['getWorld'].mockReturnValue(of(makeWorld('hospital-sala-escucha', [])));
      sim['getScenarioConfig'].mockReturnValue(of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] }));

      (component as any).bootstrapAttempt(makeAttempt('hospital-accion-etica'));
      tick(500);

      expect(component.roomBanner()).toBe('');
      expect(component.checklistNotice()).toBeNull();
    });
  });
});
