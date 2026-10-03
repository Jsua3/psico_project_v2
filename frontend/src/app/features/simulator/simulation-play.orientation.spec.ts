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

  describe('T9.7: evidencia con una sola fuente', () => {
    const SLUG = /\b(npc:|tool:|inspected:)|enfermera-urgencias|familia-crisis|\bPAP\b|\bSPIKES\b|RISK_METER/;

    function openGate(nodeKey: string, world: SimulationWorldState): DialogueState | null {
      component.attempt.set(makeAttempt(nodeKey));
      component.world.set(world);
      component.dialogue.set({
        key: 'd', speakerName: 'Familia', portraitKey: null, emotion: 'neutral', lines: [],
        choices: [{ key: 'o', text: 'Opción', decisionOptionId: 101, requiredToolCode: null, effect: {} }],
      } as DialogueState);
      component.executeDecision(101);
      return component.dialogue();
    }

    it('el diálogo «Criterio profesional» dice lo que falta con los nombres que ve el jugador, sin claves', () => {
      const gate = openGate('hospital-urgencias', makeWorld('hospital-urgencias', urgenciasObjects()));

      expect(gate?.speakerName).toBe('Criterio profesional');
      const text = gate?.lines.map(line => line.text).join(' ') ?? '';
      expect(text).toMatch(/^Antes de decidir te falta: .*hablar con la Enfermera de urgencias/);
      expect(text).toContain('quedará registrada con información incompleta');
      expect(text).not.toMatch(SLUG);
    });

    it('es el mismo aviso que el de las opciones de la conversación', () => {
      startInUrgencias();
      const decorated = (component as any).decorateDialogue({
        key: 'd', speakerName: 'Familia', portraitKey: null, emotion: 'neutral', lines: [],
        choices: [{ key: 'o', text: 'Opción', decisionOptionId: 101, requiredToolCode: null, effect: {} }],
      } as DialogueState) as DialogueState;
      component.executeDecision(101);

      expect(decorated.notice).toBeTruthy();
      expect(component.dialogue()?.lines[0].text).toBe(decorated.notice);
    });

    it('con la evidencia completa no hay aviso y la decisión se registra', () => {
      const done = makeWorld('hospital-urgencias', urgenciasObjects(true), {
        inventory: ['PAP'], usedToolKeys: ['PAP'], inspectedObjectKeys: ['familia-crisis'],
        flags: { viewedNpcKeys: ['enfermera-urgencias'] },
      });
      const gate = openGate('hospital-urgencias', done);

      expect(gate?.key.startsWith('evidence-gate')).toBeFalsy();
      expect(sim['chooseDecision']).toHaveBeenCalledTimes(0); // el fundido aún no terminó
      tick(400);
      expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
    });

    it('el diálogo del aviso conserva «Explorar primero» y «Decidir con información incompleta»', () => {
      const gate = openGate('hospital-urgencias', makeWorld('hospital-urgencias', urgenciasObjects()));

      expect(gate?.choices.map(choice => choice.text)).toEqual(['Explorar primero', 'Decidir con información incompleta']);
    });
  });

  describe('T9.4: puertas con una sola fuente', () => {
    const exit = () => urgenciasObjects().find(o => o.key === 'puerta-sala-escucha')!;

    beforeEach(() => {
      (component as any).doorInteractionArmed = true;
    });

    it('doorStates marca como bloqueada la puerta que pide hablar con la familia', () => {
      startInUrgencias();

      expect(component.doorStates()).toEqual({ 'puerta-sala-escucha': 'locked' });
    });

    it('doorStates abre la puerta cuando ya se habló con la familia', () => {
      startInUrgencias(makeWorld('hospital-urgencias', urgenciasObjects(), { inspectedObjectKeys: ['familia-crisis'] }));

      expect(component.doorStates()).toEqual({ 'puerta-sala-escucha': 'open' });
    });

    it('sin intento ni mundo no hay estados de puerta', () => {
      expect(component.doorStates()).toEqual({});
    });

    it('una puerta bloqueada explica el motivo vivo, no el texto del seed, y no llama al servidor', () => {
      startInUrgencias();

      component.openInteraction(exit());

      expect(component.doorNotice()).toBe('Antes de pasar, habla con la Familia en crisis (en el extremo izquierdo, al frente).');
      expect(component.doorNotice()).not.toMatch(/contenci[oó]n/i);
      expect(sim['enterRoom']).not.toHaveBeenCalled();
      expect(audio['playSfx']).toHaveBeenCalledWith('ui_cancel');
    });

    it('el motivo del aviso es el mismo que ve la barra antes de pulsar', () => {
      startInUrgencias();

      component.openInteraction(exit());

      expect(component.doorNotice()).toBe(component.doorStatusFor(exit())?.message);
    });

    it('con la familia atendida la puerta se abre: fundido y entrada a la sala', () => {
      startInUrgencias(makeWorld('hospital-urgencias', urgenciasObjects(), { inspectedObjectKeys: ['familia-crisis'] }));
      sim['enterRoom'].mockReturnValue(of(makeWorld('hospital-sala-escucha', [])));
      sim['getScenarioConfig'].mockReturnValue(of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] }));

      component.openInteraction(exit());
      tick(400);

      expect(component.doorNotice()).toBe('');
      expect(sim['enterRoom']).toHaveBeenCalledWith('attempt-1', 'token-1', 'hospital-sala-escucha', 'puerta-sala-escucha');
    });

    it('si el servidor rechaza una puerta que el cliente creía abierta, no muestra el texto del seed', () => {
      startInUrgencias(makeWorld('hospital-urgencias', urgenciasObjects(), { inspectedObjectKeys: ['familia-crisis'] }));
      sim['enterRoom'].mockReturnValue(throwError(() => http(400, 'Completa la contención de la familia.')));

      component.openInteraction(exit());
      tick(400);

      expect(component.doorNotice()).toBe('Antes de pasar, revisa lo pendiente en «Qué hacer».');
      expect(component.actionError()).toBe('');
      expect(component.busy()).toBe(false);
      expect(component.fadeActive()).toBe(false);
    });

    it('al cruzar suena la puerta, no el avance de diálogo', () => {
      startInUrgencias(makeWorld('hospital-urgencias', urgenciasObjects(), { inspectedObjectKeys: ['familia-crisis'] }));
      sim['enterRoom'].mockReturnValue(EMPTY);

      component.openInteraction(exit());

      expect(audio['playSfx']).toHaveBeenCalledWith('door_open');
      expect(audio['playSfx']).not.toHaveBeenCalledWith('dialogue_advance');
    });

    it('decidir sigue sonando como el avance de diálogo', () => {
      component.attempt.set(makeAttempt('nodo-sin-evidencia'));
      component.world.set(makeWorld('hospital-urgencias', []));
      component.dialogue.set({
        key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [],
        choices: [{ key: 'o', text: 'O', decisionOptionId: 101, requiredToolCode: null, effect: {} }],
      } as DialogueState);

      component.executeDecision(101);

      expect(audio['playSfx']).toHaveBeenCalledWith('dialogue_advance');
    });

    it('un fallo de red al cruzar usa el mensaje del servidor o el de respaldo', () => {
      startInUrgencias(makeWorld('hospital-urgencias', urgenciasObjects(), { inspectedObjectKeys: ['familia-crisis'] }));
      sim['enterRoom'].mockReturnValue(throwError(() => http(500)));

      component.openInteraction(exit());
      tick(400);

      expect(component.actionError()).toBe('No pudimos cruzar la puerta.');
    });

    it('la puerta de la etapa de hospital explica cuántas decisiones faltan', () => {
      const gate = door('salida-institucional', 'Salida institucional', 838, 440, {
        targetNodeKey: 'comisaria-recepcion', requiresNodes: ['hospital-cierre-bloque'],
      });
      component.attempt.set(makeAttempt('hospital-accion-etica'));
      component.world.set(makeWorld('hospital-sala-escucha', [gate]));

      component.openInteraction(gate);

      expect(component.doorNotice()).toBe('Esta salida se abre cuando termines las decisiones del hospital. Te queda 1 decisión.');
    });
  });

  describe('T9.6: avisos', () => {
    const pickup = (): MapObjectState => urgenciasObjects().find(o => o.key === 'tool-pap')!;

    function openResult(interaction: MapObjectState, unlockedToolCode: string | null) {
      return of({
        world: makeWorld('hospital-urgencias', urgenciasObjects(true), { inventory: unlockedToolCode ? [unlockedToolCode] : [] }),
        interaction, dialogue: null, preparedDecisionOptionId: null, unlockedToolCode,
      });
    }

    it('recoger avisa «Obtuviste: …» con la etiqueta del objeto y suena item_pickup', () => {
      startInUrgencias();
      sim['openInteraction'].mockReturnValue(openResult(pickup(), 'PAP'));

      component.openInteraction(pickup());

      expect(component.softNotice()).toBe('Obtuviste: Kit PAP. Ya está en tu barra de herramientas.');
      expect(audio['playSfx']).toHaveBeenCalledWith('item_pickup');
    });

    it('el aviso se apaga solo a los 4,2 s', () => {
      startInUrgencias();
      sim['openInteraction'].mockReturnValue(openResult(pickup(), 'PAP'));
      component.openInteraction(pickup());

      jest.advanceTimersByTime(4100);
      expect(component.softNotice()).not.toBe('');
      jest.advanceTimersByTime(200);

      expect(component.softNotice()).toBe('');
    });

    it('revisar un objeto sin herramienta no avisa ni suena a recogida', () => {
      startInUrgencias();
      const zona = urgenciasObjects().find(o => o.key === 'zona-restringida')!;
      sim['openInteraction'].mockReturnValue(openResult(zona, null));

      component.openInteraction(zona);

      expect(component.softNotice()).toBe('');
      expect(audio['playSfx']).not.toHaveBeenCalledWith('item_pickup');
    });

    it('«Anotado: …» espera a que se cierre el diálogo y sale una sola vez', () => {
      startInUrgencias();
      tick(); // primera evaluación de la lista: no anota nada
      component.dialogue.set({
        key: 'npc-enfermera-urgencias', speakerName: 'Enfermera de urgencias', portraitKey: null, emotion: 'neutral', lines: [], choices: [],
      } as DialogueState);
      (component as any).viewedNpcKeys.set(new Set(['enfermera-urgencias']));
      tick();

      expect(component.checklistNotice()).toBeNull();

      component.closeDialogue();
      tick();

      expect(component.checklistNotice()).toBe('Anotado: hablaste con la Enfermera de urgencias.');
      tick(4300);
      expect(component.checklistNotice()).toBeNull();
      tick(10_000);
      expect(component.checklistNotice()).toBeNull();
    });

    it('usar la herramienta se anota con el nombre genérico, sin nombrar la técnica', () => {
      startInUrgencias(makeWorld('hospital-urgencias', urgenciasObjects(true), { inventory: ['PAP'], inspectedObjectKeys: ['familia-crisis'] }));
      tick();
      component.world.set(makeWorld('hospital-urgencias', urgenciasObjects(true), {
        inventory: ['PAP'], inspectedObjectKeys: ['familia-crisis'], usedToolKeys: ['PAP'],
      }));
      tick();

      expect(component.checklistNotice()).toBe('Anotado: usaste el material de apoyo de la sala en la conversación.');
      expect(component.checklistNotice()).not.toMatch(/PAP/);
    });

    it('dos pasos hechos a la vez se anotan uno tras otro', () => {
      startInUrgencias();
      tick();
      (component as any).viewedNpcKeys.set(new Set(['enfermera-urgencias']));
      component.world.set(makeWorld('hospital-urgencias', urgenciasObjects(), { inspectedObjectKeys: ['familia-crisis'] }));
      tick();

      const first = component.checklistNotice();
      tick(4300);
      const second = component.checklistNotice();

      expect([first, second].sort()).toEqual([
        'Anotado: hablaste con la Enfermera de urgencias.',
        'Anotado: hablaste con la Familia en crisis.',
      ]);
    });

    it('una pausa descarta las notas pendientes', () => {
      startInUrgencias();
      tick();
      component.dialogue.set({ key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices: [] } as DialogueState);
      (component as any).viewedNpcKeys.set(new Set(['enfermera-urgencias']));
      tick();

      (component as any).clearTransientOverlays();
      tick();

      expect(component.checklistNotice()).toBeNull();
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
