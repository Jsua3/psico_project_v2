// Phaser inicializa un canvas WebGL al importarse, cosa que jsdom no soporta (mismo doble que el resto
// de specs de instancia del juego): solo se evalúa `extends Phaser.Scene` al cargar el módulo.
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
import type { Mock } from 'vitest';

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
  let sim: Record<string, Mock>;
  let audio: Record<string, Mock>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    sessionStorage.clear();
    localStorage.clear();
    sim = {
      getActiveAttempt: vi.fn(() => of(null)),
      startAttempt: vi.fn(() => of(makeAttempt())),
      getProgressMap: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => EMPTY),
      getScenarioConfig: vi.fn(() => throwError(() => new Error('sin escenario'))),
      safeExit: vi.fn(() => EMPTY),
      enterRoom: vi.fn(() => EMPTY),
      recordNpcInteraction: vi.fn(() => EMPTY),
      updateWorldState: vi.fn(() => EMPTY),
      openInteraction: vi.fn(() => EMPTY),
      chooseDecision: vi.fn(() => EMPTY),
      useTool: vi.fn(() => EMPTY),
    };
    audio = {
      init: vi.fn(), setStressLevel: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false),
      dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn(),
      toggleMusicMuted: vi.fn(() => false), playResolution: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        { provide: AudioDirectorService, useValue: audio },
        { provide: AuthService, useValue: {} },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: String(CASE_VERSION_ID) }) } },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
  });

  afterEach(() => {
    component?.ngOnDestroy(); // cancela los temporizadores pendientes antes de que se desmonte el entorno
    vi.useRealTimers();
    sessionStorage.clear();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  /** Estado de una partida en Urgencias, al empezar. */
  function startInUrgencias(world = makeWorld('hospital-urgencias', urgenciasObjects())): void {
    component.attempt.set(makeAttempt());
    component.world.set(world);
  }

  const tick = (ms = 0) => { vi.advanceTimersByTime(ms); TestBed.tick(); };

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
      } as unknown as DialogueState);
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
      } as unknown as DialogueState) as DialogueState;
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
      } as unknown as DialogueState);

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

      vi.advanceTimersByTime(4100);
      expect(component.softNotice()).not.toBe('');
      vi.advanceTimersByTime(200);

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
      } as unknown as DialogueState);
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

    it('una nota que un diálogo tapó antes de leerse vuelve a mostrarse completa cuando el diálogo se cierra', () => {
      startInUrgencias();
      tick();
      (component as any).viewedNpcKeys.set(new Set(['enfermera-urgencias']));
      tick();
      expect(component.checklistNotice()).toBe('Anotado: hablaste con la Enfermera de urgencias.');

      component.dialogue.set({ key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices: [] } as unknown as DialogueState);
      tick(); // el diálogo tapa la tarjeta
      tick(10_000); // el jugador lee con calma: la nota no se consume por debajo
      expect(component.checklistNotice()).toBe('Anotado: hablaste con la Enfermera de urgencias.');

      component.closeDialogue();
      tick();
      expect(component.checklistNotice()).toBe('Anotado: hablaste con la Enfermera de urgencias.');
      tick(4300);
      expect(component.checklistNotice()).toBeNull();
    });

    it('una nota que ya se había leído y luego la cubre un diálogo no reaparece al cerrarlo', () => {
      startInUrgencias();
      tick();
      (component as any).viewedNpcKeys.set(new Set(['enfermera-urgencias']));
      tick();
      expect(component.checklistNotice()).toBe('Anotado: hablaste con la Enfermera de urgencias.');

      tick(2000); // el jugador la leyó
      component.dialogue.set({ key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices: [] } as unknown as DialogueState);
      tick();
      component.closeDialogue();
      tick();

      expect(component.checklistNotice()).toBeNull();
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
      component.dialogue.set({ key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices: [] } as unknown as DialogueState);
      (component as any).viewedNpcKeys.set(new Set(['enfermera-urgencias']));
      tick();

      (component as any).clearTransientOverlays();
      tick();

      expect(component.checklistNotice()).toBeNull();
      expect((component as any).pendingNotes).toEqual([]);
    });
  });

  describe('T9.3 y T9.5: barra contextual y personas', () => {
    const NURSE: NpcConfig = {
      key: 'enfermera-urgencias', npcType: 'colleague', displayName: 'Enfermera de urgencias', portrait: 'x', x: 560, y: 330,
      frameIndex: 0, dialogue: { lines: [{ text: 'Hola.' }] },
    } as unknown as NpcConfig;
    /** Lo que emite el mundo para una persona del escenario (clave `npc:`). */
    const nurseMarker = (): MapObjectState => obj('npc:enfermera-urgencias', 'Enfermera de urgencias', 'PERSON', 560, 330);
    const lockedDoor = () => urgenciasObjects().find(o => o.key === 'puerta-sala-escucha')!;

    function withScenario(): void {
      startInUrgencias();
      component.scenarioConfig.set({
        scenarioKey: 'hospital-urgencias', startRoomKey: 'hospital-urgencias',
        rooms: [{ key: 'hospital-urgencias', npcs: [NURSE] }],
      } as never);
    }

    it('una persona cercana se ofrece como «Hablar con …» con el nombre accesible «Interactuar: …»', () => {
      withScenario();
      component.nearbyInteraction.set(nurseMarker());

      const action = component.contextAction();

      expect(action?.verb.text).toBe('Hablar con Enfermera de urgencias');
      expect(action?.ariaLabel).toBe('Interactuar: Hablar con Enfermera de urgencias');
      expect(action?.ariaLabel).not.toMatch(/atajo/i);
    });

    it('una herramienta se ofrece como «Recoger …» y un objeto como «Revisar …»', () => {
      startInUrgencias();
      component.nearbyInteraction.set(urgenciasObjects().find(o => o.key === 'tool-pap')!);
      expect(component.contextAction()?.verb.text).toBe('Recoger Kit PAP');

      component.nearbyInteraction.set(urgenciasObjects().find(o => o.key === 'zona-restringida')!);
      expect(component.contextAction()?.verb.text).toBe('Revisar Acceso a quirófano');
    });

    it('el botón no usa la descripción sembrada del objeto como texto: queda solo en el title', () => {
      startInUrgencias();
      const tool = { ...urgenciasObjects().find(o => o.key === 'tool-pap')!, interactionPrompt: 'Aplicar PAP', interactionText: 'Material de primeros auxilios.' };
      component.nearbyInteraction.set(tool);

      const action = component.contextAction();

      expect(action?.verb.text).toBe('Recoger Kit PAP');
      expect(action?.ariaLabel).not.toContain('Aplicar PAP');
    });

    it('una puerta bloqueada muestra candado, el motivo vivo y lo dice en su nombre accesible', () => {
      startInUrgencias();
      component.nearbyInteraction.set(lockedDoor());

      const action = component.contextAction();

      expect(action?.verb.locked).toBe(true);
      expect(action?.verb.text).toBe('Pasar a Sala de escucha familiar');
      expect(action?.verb.reason).toBe('Antes de pasar, habla con la Familia en crisis (en el extremo izquierdo, al frente).');
      expect(action?.ariaLabel).toBe(
        'Interactuar: Pasar a Sala de escucha familiar, bloqueada: Antes de pasar, habla con la Familia en crisis (en el extremo izquierdo, al frente).');
      expect(action?.title).toContain(action?.verb.reason ?? '');
    });

    it('con el motivo cumplido la puerta ya no marca candado', () => {
      startInUrgencias(makeWorld('hospital-urgencias', urgenciasObjects(), { inspectedObjectKeys: ['familia-crisis'] }));
      component.nearbyInteraction.set(lockedDoor());

      const action = component.contextAction();

      expect(action?.verb.locked).toBe(false);
      expect(action?.ariaLabel).toBe('Interactuar: Pasar a Sala de escucha familiar');
    });

    it('el botón secundario solo existe junto a un principal y dice «Pasar a …» sin candado inventado', () => {
      startInUrgencias();
      component.nearbyAlso.set(lockedDoor());
      expect(component.contextAlso()).toBeNull();

      component.nearbyInteraction.set(urgenciasObjects().find(o => o.key === 'familia-crisis')!);

      expect(component.contextAlso()?.verb.text).toBe('Pasar a Sala de escucha familiar');
      expect(component.contextAction()?.verb.text).toBe('Hablar con Familia en crisis');
    });

    it('con una petición en curso o un diálogo abierto la barra vuelve a «Ahora: …»', () => {
      startInUrgencias();
      component.nearbyInteraction.set(urgenciasObjects().find(o => o.key === 'familia-crisis')!);
      expect(component.contextAction()).not.toBeNull();

      component.busy.set(true);
      expect(component.contextAction()).toBeNull();
      component.busy.set(false);
      component.dialogue.set({ key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices: [] } as unknown as DialogueState);
      expect(component.contextAction()).toBeNull();
    });

    it('URGENTE: pulsar el botón junto a una persona abre su diálogo y no pide `npc:…` al servidor', () => {
      withScenario();

      component.openInteraction(nurseMarker());

      expect(sim['openInteraction']).not.toHaveBeenCalled();
      expect(sim['recordNpcInteraction']).toHaveBeenCalledWith('attempt-1', 'token-1', 'enfermera-urgencias');
    });

    it('URGENTE: la tecla E junto a una persona abre su diálogo (una sola petición, aunque la tecla se repita)', () => {
      withScenario();
      component.nearbyInteraction.set(nurseMarker());
      const press = (repeat: boolean) => {
        const event = new KeyboardEvent('keydown', { key: 'e', repeat, cancelable: true });
        component.handleGlobalInteraction(event);
        return event;
      };

      const first = press(false);
      press(true);
      press(true);

      expect(first.defaultPrevented).toBe(true);
      expect(sim['recordNpcInteraction']).toHaveBeenCalledTimes(1);
      expect(sim['openInteraction']).not.toHaveBeenCalled();
    });

    it('la persona se muestra al responder el servidor, con su conversación', () => {
      withScenario();
      sim['recordNpcInteraction'].mockReturnValue(of(makeWorld('hospital-urgencias', urgenciasObjects(), { flags: { viewedNpcKeys: ['enfermera-urgencias'] } })));

      component.openInteraction(nurseMarker());

      expect(component.dialogue()?.speakerName).toBe('Enfermera de urgencias');
      expect(component.busy()).toBe(false);
    });

    it('una persona que el escenario no conoce no hace ninguna petición', () => {
      startInUrgencias();

      component.openInteraction(nurseMarker());

      expect(sim['recordNpcInteraction']).not.toHaveBeenCalled();
      expect(sim['openInteraction']).not.toHaveBeenCalled();
    });

    it('E sin nada cerca: el mundo avisa y la barra dice, 2,5 s y sin sonido, que no hay nada al alcance', () => {
      startInUrgencias();

      component.showNothingNearby();

      expect(component.nowLine()).toBe('No hay nada a tu alcance. Acércate a una persona o un objeto.');
      expect(audio['playSfx']).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2400);
      expect(component.nowLine()).toBe('No hay nada a tu alcance. Acércate a una persona o un objeto.');
      vi.advanceTimersByTime(200);
      expect(component.nowLine()).toMatch(/^Ahora: Recoge el material de apoyo de la sala/);
    });

    it('sin lista (nodo sin ruta) la barra invita a explorar, sin prometer teclas en táctil', () => {
      component.attempt.set(makeAttempt('nodo-del-editor', { currentNode: { key: 'nodo-del-editor', title: 'x', narrative: '', terminal: false } }));
      component.world.set(makeWorld('mapa-del-editor', []));

      expect(component.nowLine()).toBe('Explora la sala. Acércate a una persona o un objeto y pulsa E.');
      component.coarsePointer.set(true);
      expect(component.nowLine()).toBe('Explora la sala. Acércate a una persona o un objeto y toca «Interactuar».');
    });
  });

  describe('T9.9: destino y atenuados hacia el mundo', () => {
    it('el anillo empieza en el maletín y pasa a la familia al recogerlo', () => {
      startInUrgencias();
      expect(component.nextTargetKey()).toBe('tool-pap');

      component.world.set(makeWorld('hospital-urgencias', urgenciasObjects(true), { inventory: ['PAP'] }));

      expect(component.nextTargetKey()).toBe('familia-crisis');
    });

    it('sin lista no hay anillo', () => {
      expect(component.nextTargetKey()).toBeNull();
    });

    it('los objetos de decisión de otras etapas se atenúan; el de esta etapa no', () => {
      const choice = (id: number) => ({ key: `o${id}`, text: 'x', decisionOptionId: id, requiredToolCode: null, effect: {} });
      const withChoices = (key: string, ids: number[]) => obj(key, key, 'OBJECT', 100, 100, {
        dialogue: { key: `dlg-${key}`, speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices: ids.map(choice) },
      });
      component.attempt.set(makeAttempt('hospital-sala-escucha', { currentNode: { key: 'hospital-sala-escucha', title: 't', narrative: '', terminal: false, options: [{ id: 201, text: 'a' }] } }));
      component.world.set(makeWorld('hospital-sala-escucha', [withChoices('familia-duelo', [101]), withChoices('marco-normativo-hospital', [201])]));

      expect([...component.dimmedKeys()]).toEqual(['familia-duelo']);
    });
  });

  describe('T9.8: ayuda', () => {
    /** Partida ya en marcha: pasó el aviso de contenido, la introducción y el contexto. */
    function playing(): void {
      component.worldStarted.set(true);
      component.loading.set(false);
      startInUrgencias();
    }
    const esc = () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      component.handleGlobalInteraction(event);
      return event;
    };

    it('la tarjeta de primera vez aparece cuando ya se puede jugar', () => {
      playing();

      expect(component.showHelpCard()).toBe(true);
    });

    it.each([
      ['el aviso de contenido (ETH-01)', () => component.showContentWarning.set(true)],
      ['la introducción', () => component.showIntroScene.set(true)],
      ['el contexto inicial', () => component.showCaseIntro.set(true)],
      ['el aviso de reanudar', () => component.showResumePrompt.set(true)],
      ['un diálogo abierto', () => component.dialogue.set({ key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices: [] } as unknown as DialogueState)],
      ['la bitácora abierta', () => component.journalOpen.set(true)],
      ['la pantalla de ayuda abierta', () => component.helpOpen.set(true)],
      ['el mundo aún sin cargar', () => component.loading.set(true)],
      ['un intento en pausa', () => component.attempt.set(makeAttempt('hospital-urgencias', { status: 'PAUSED' }))],
    ])('no aparece con %s', (_name, hide) => {
      playing();
      hide();

      expect(component.showHelpCard()).toBe(false);
    });

    it('«Entendido» la marca como vista en el navegador (sin identificadores ni fechas) y no vuelve', () => {
      playing();

      component.markHelpCardSeen();

      expect(component.showHelpCard()).toBe(false);
      expect(JSON.parse(localStorage.getItem('siep.ayuda.v1') ?? 'null')).toEqual({ v: 1, vistas: ['primero'] });
    });

    it('un intento nuevo en el mismo navegador no la repite', () => {
      localStorage.setItem('siep.ayuda.v1', JSON.stringify({ v: 1, vistas: ['primero'] }));
      const again = TestBed.runInInjectionContext(() => new SimulationPlayComponent());

      expect(again.helpCardSeen()).toBe(true);
    });

    it('«Más ayuda» (y el botón «?») abren la pantalla y dan la tarjeta por vista', () => {
      playing();

      component.openHelp();

      expect(component.helpOpen()).toBe(true);
      expect(component.helpCardSeen()).toBe(true);
    });

    it('«Ver la ayuda otra vez» borra la marca y la tarjeta vuelve en esta misma sesión', () => {
      playing();
      component.markHelpCardSeen();

      component.resetHelpCard();

      expect(component.showHelpCard()).toBe(true);
      expect(localStorage.getItem('siep.ayuda.v1')).toBeNull();
    });

    it('si un diálogo o la bitácora tapan la tarjeta ya vista, no reaparece al cerrarlos', () => {
      playing();
      tick();
      expect(component.showHelpCard()).toBe(true);

      component.journalOpen.set(true);
      tick();
      component.journalOpen.set(false);
      tick();

      expect(component.helpCardSeen()).toBe(true);
      expect(component.showHelpCard()).toBe(false);
    });

    it('Esc cierra primero la ayuda y no pausa; el siguiente Esc sí pausa', () => {
      playing();
      component.helpOpen.set(true);

      const first = esc();
      expect(first.defaultPrevented).toBe(true);
      expect(component.helpOpen()).toBe(false);
      expect(sim['safeExit']).not.toHaveBeenCalled();

      esc();
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });

    it('con la tarjeta visible (no modal) Esc pausa directamente: la tarjeta no consume Esc', () => {
      playing();

      esc();

      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });

    it('con la pantalla de ayuda abierta E y J no actúan sobre el mundo de debajo, y el personaje no camina', () => {
      playing();
      component.nearbyInteraction.set(urgenciasObjects().find(o => o.key === 'tool-pap')!);
      component.helpOpen.set(true);

      component.handleGlobalInteraction(new KeyboardEvent('keydown', { key: 'e', cancelable: true }));
      component.handleGlobalInteraction(new KeyboardEvent('keydown', { key: 'j', cancelable: true }));

      expect(sim['openInteraction']).not.toHaveBeenCalled();
      expect(component.journalOpen()).toBe(false);
      expect(component.worldMotionPaused()).toBe(true);
    });

    it('pausar con la ayuda abierta la cierra', () => {
      playing();
      component.helpOpen.set(true);
      sim['safeExit'].mockReturnValue(of(makeAttempt('hospital-urgencias', { status: 'PAUSED' })));

      component.pauseFromOverlay();
      tick();

      expect(component.helpOpen()).toBe(false);
    });
  });

  describe('T9.11: supervisión sin números y herramienta sin «+0%»', () => {
    const feedback = (extra: Record<string, unknown> = {}) => ({
      classification: 'ADEQUATE', scoreDelta: 12, stressDelta: -5, trustDelta: 10, victimRiskDelta: -5,
      prohibitedConduct: false, institutionalRouteActivated: false, revictimizationRisk: false,
      message: 'La decisión quedó registrada.', prohibitionReason: null, retryRequired: false, ...extra,
    });

    /** La respuesta de decidir (C2): la consecuencia narrativa y, si la regla lo concede, el reintento. */
    function decide(fb: Record<string, unknown>, retry: unknown = null): DialogueState | null {
      component.attempt.set(makeAttempt('nodo-sin-evidencia'));
      component.world.set(makeWorld('hospital-urgencias', []));
      sim['chooseDecision'].mockReturnValue(of({
        ...makeAttempt('nodo-sin-evidencia', { feedback: fb }),
        consequence: retry ? null : { text: 'La estudiante asiente y pregunta por su familia.', source: 'OPTION' },
        retry,
      }));
      sim['getWorld'].mockReturnValue(of(makeWorld('hospital-urgencias', [])));
      sim['getScenarioConfig'].mockReturnValue(of({ scenarioKey: 'x', startRoomKey: 'x', rooms: [] }));
      component.dialogue.set({
        key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [],
        choices: [{ key: 'o', text: 'O', decisionOptionId: 101, requiredToolCode: null, effect: {} }],
      } as unknown as DialogueState);
      component.executeDecision(101);
      tick(340); tick(100); tick(400);
      return component.dialogue();
    }

    it('la consecuencia se lee con el aviso de que quedó registrada en el seguimiento, sin puntaje ni cifras', () => {
      const dialogue = decide(feedback());
      const lines = dialogue?.lines.map(line => line.text) ?? [];

      expect(dialogue?.speakerName).toBe('Consecuencia');
      expect(lines).toContain('La estudiante asiente y pregunta por su familia.');
      expect(lines).toContain('Tu decisión quedó registrada en tu seguimiento formativo.');
      expect(lines.join(' ')).not.toMatch(/Puntaje|Confianza|Riesgo|Estrés|\d/);
    });

    it('con una primera respuesta que no se aplica muestra el texto del reintento, no el mensaje evaluativo', () => {
      const dialogue = decide(
        feedback({ classification: 'RISKY', retryRequired: true, message: 'Decisión con riesgo: revisa.' }),
        { allowed: true, message: 'Decisión con riesgo: revisa.' },
      );
      const lines = dialogue?.lines.map(line => line.text) ?? [];

      expect(lines.join(' ')).toContain('No se avanzó el caso');
      expect(lines.join(' ')).not.toContain('Decisión con riesgo');
      expect(lines).not.toContain('Tu decisión quedó registrada en tu seguimiento formativo.');
    });

    function useToolWith(stressDelta: number): DialogueState | null {
      startInUrgencias();
      component.selectedInteraction.set(urgenciasObjects().find(o => o.key === 'familia-crisis')!);
      sim['useTool'].mockReturnValue(of({
        world: makeWorld('hospital-urgencias', urgenciasObjects(), { usedToolKeys: ['PAP'] }),
        toolCode: 'PAP', targetKey: 'familia-crisis', pertinent: true, stressDelta, feedbackMessage: 'La familia escucha con más calma.',
      }));
      component.useTool('PAP');
      return component.dialogue();
    }

    it('un cambio de estrés de 0 no se anuncia como «Estrés +0%»', () => {
      const lines = useToolWith(0)?.lines.map(line => line.text) ?? [];

      expect(lines).toEqual(['La familia escucha con más calma.']);
    });

    it('un cambio real de estrés sí se informa, con su signo', () => {
      expect(useToolWith(-4)?.lines.map(line => line.text)).toEqual(['La familia escucha con más calma.', 'Estrés -4%']);
      expect(useToolWith(3)?.lines.map(line => line.text)).toEqual(['La familia escucha con más calma.', 'Estrés +3%']);
    });
  });

  describe('T10: modo compacto', () => {
    const COMPACT = '(max-height: 520px), (pointer: coarse) and (orientation: landscape)';
    let original: typeof window.matchMedia | undefined;
    let listeners: Array<{ query: string; handler: (event: { matches: boolean }) => void }>;

    function mockMedia(matching: string[]): void {
      listeners = [];
      window.matchMedia = ((query: string) => ({
        matches: matching.includes(query),
        media: query,
        addEventListener: (_type: string, handler: (event: { matches: boolean }) => void) => listeners.push({ query, handler }),
        removeEventListener: (_type: string, handler: (event: { matches: boolean }) => void) => {
          listeners = listeners.filter(entry => entry.handler !== handler);
        },
      })) as unknown as typeof window.matchMedia;
    }

    beforeEach(() => { original = window.matchMedia; });
    afterEach(() => { window.matchMedia = original as typeof window.matchMedia; });

    it('una pantalla baja o táctil horizontal arranca en compacto y con puntero grueso', () => {
      mockMedia([COMPACT, '(pointer: coarse)']);
      const compact = TestBed.runInInjectionContext(() => new SimulationPlayComponent());

      expect(compact.compactMode()).toBe(true);
      expect(compact.coarsePointer()).toBe(true);
      expect(compact.helpModality()).toBe('touch');
    });

    it('un móvil vertical no es compacto, pero la tarjeta «Qué hacer» también arranca plegada', () => {
      mockMedia(['(max-width: 760px)', '(pointer: coarse)']);
      const phone = TestBed.runInInjectionContext(() => new SimulationPlayComponent());

      expect(phone.compactMode()).toBe(false);
      expect(phone.cardFolded()).toBe(true);
    });

    it('un portátil no es compacto y la ayuda habla de teclado', () => {
      mockMedia([]);
      const laptop = TestBed.runInInjectionContext(() => new SimulationPlayComponent());

      expect(laptop.compactMode()).toBe(false);
      expect(laptop.cardFolded()).toBe(false);
      expect(laptop.helpModality()).toBe('keyboard');
    });

    it('girar o redimensionar el dispositivo cambia el modo sin recargar, y se deja de escuchar al salir', () => {
      mockMedia([]);
      const device = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
      device.ngOnInit();
      expect(listeners.map(entry => entry.query)).toEqual([COMPACT, '(pointer: coarse)', '(max-width: 760px)']);

      listeners.find(entry => entry.query === COMPACT)?.handler({ matches: true });
      expect(device.compactMode()).toBe(true);

      device.ngOnDestroy();
      expect(listeners).toEqual([]);
    });

    it('con la bitácora, un diálogo o la ayuda a la vista el pie no cambia: la barra muestra siempre una sola cosa', () => {
      mockMedia([COMPACT]);
      const compact = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
      compact.attempt.set(makeAttempt());
      compact.world.set(makeWorld('hospital-urgencias', urgenciasObjects()));

      expect(compact.contextAction()).toBeNull();
      expect(compact.nowLine()).toMatch(/^Ahora: /);
      compact.nearbyInteraction.set(urgenciasObjects().find(o => o.key === 'tool-pap')!);
      expect(compact.contextAction()?.verb.text).toBe('Recoger Kit PAP');
      expect(compact.contextAlso()).toBeNull();
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

    it('la «Trazabilidad» de la bitácora recibe los títulos completos de las etapas visitadas', () => {
      // La API ya no recorta a 14 caracteres: estos dos nodos eran idénticos («Consultorio: …»).
      component.progressMap.set({
        currentNodeKey: 'comisaria-accion-final',
        visitedNodeKeys: ['comisaria-consultorio', 'comisaria-accion-final'],
        nodes: [
          { key: 'hospital-urgencias', label: 'Urgencias: crisis y contención' },
          { key: 'comisaria-consultorio', label: 'Consultorio: protección y marco' },
          { key: 'comisaria-accion-final', label: 'Consultorio: acción técnica y ética' },
        ],
      } as never);

      expect(component.visitedStageLabels()).toEqual([
        'Consultorio: protección y marco',
        'Consultorio: acción técnica y ética',
      ]);
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
      } as unknown as DialogueState);
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
