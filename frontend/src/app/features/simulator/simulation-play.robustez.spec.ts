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

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { EMPTY, NEVER, Subject, defer, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { DialogueState, MapObjectState, SimulationAttemptState, SimulationWorldState, WorldComment } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { SimulationPlayComponent } from './simulation-play.component';
import type { Mock } from 'vitest';

/**
 * Reacciones al acercarse y al explorar (bloque B, tarea 22): la pantalla solo cablea. Se ejercita la instancia con un mundo
 * falso (sin plantilla): lo que llega a las reacciones, cuándo se bloquean y que Esc sigue pausando con la burbuja a la vista.
 */

const COMENT_ABUELA_SIN_GESTO: WorldComment = { id: '7-0', objectKey: 'abuela', line: 'Gracias por venir.', emotion: 'triste', gesture: null };
const DIALOGO = {
  key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices: [],
} as unknown as DialogueState;

function makeWorld(comments?: WorldComment[]): SimulationWorldState {
  return {
    map: { key: 'sala', title: 'Sala' },
    objects: [
      { key: 'abuela', type: 'PERSON', label: 'Abuela', metadata: {} },
      { key: 'carpeta', type: 'OBJECT', label: 'Carpeta', metadata: {} },
    ],
    tools: [], inventory: [], usedToolKeys: [], inspectedObjectKeys: [], flags: {},
    ...(comments ? { comments } : {}),
  } as unknown as SimulationWorldState;
}

function makeAttempt(): SimulationAttemptState {
  return {
    attemptId: 'attempt-1', attemptToken: 'token-1', caseVersionId: 7, caseTitle: 'Caso demo', status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: { id: 1, key: 'n', title: 'Título', narrative: 'N', terminal: false, options: [{ id: 41, text: 'Opción' }] },
    completionReport: null,
  } as unknown as SimulationAttemptState;
}

interface Reacciones {
  setComments: Mock; setBlocked: Mock; setActivation: Mock; onProximity: Mock; onInspected: Mock; dispose: Mock;
}

describe('SimulationPlayComponent: reacciones al acercarse (4.3.7)', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;
  let mundo: Record<string, Mock>;

  const interno = () => component as unknown as Record<string, unknown> & {
    applyDecisionOptions(world: SimulationWorldState): void;
    doOpenBackendInteraction(o: MapObjectState): void;
    ensureReactions(): void;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    sessionStorage.clear();
    sim = {
      getActiveAttempt: vi.fn(() => EMPTY),
      safeExit: vi.fn(() => EMPTY),
      updateWorldState: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => EMPTY),
      getProgressMap: vi.fn(() => EMPTY),
      chooseDecision: vi.fn(() => EMPTY),
      startAttempt: vi.fn(() => EMPTY),
      openInteraction: vi.fn(() => EMPTY),
      useTool: vi.fn(() => NEVER),
      enterRoom: vi.fn(() => EMPTY),
      recordNpcInteraction: vi.fn(() => EMPTY),
      resumeAttempt: vi.fn(() => EMPTY),
      saveReflection: vi.fn(() => EMPTY),
      getAttempt: vi.fn(() => EMPTY),
    };
    const audio = {
      init: vi.fn(), dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn(),
      setScene: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false),
    };
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        { provide: AudioDirectorService, useValue: audio },
        { provide: AuthService, useValue: {} },
        { provide: CONSENT_RECORDER, useValue: new SessionConsentRecorder() },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: '7' }) } } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
    component.attempt.set(makeAttempt());
    component.world.set(makeWorld());
    // El mundo falso: cada llamada que la pantalla le haga es una función vacía salvo lo que la prueba mira.
    const mirado: Record<string, Mock> = { isKeyPerson: vi.fn(() => false), peopleNear: vi.fn(() => []), playGesture: vi.fn(() => Promise.resolve()) };
    mundo = mirado;
    interno()['gameWorld'] = new Proxy(mirado, { get: (t, k: string) => (t[k] ??= vi.fn()) });
  });

  afterEach(() => {
    component?.ngOnDestroy();
    vi.useRealTimers();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('descarta el acuse tardío de otra sala', () => {
    const respuesta = new Subject<any>();
    sim['updateWorldState'].mockReturnValue(respuesta);
    interno()['lastPosition'] = { x: 10, y: 20 };
    (interno() as any).persistPosition();
    const actual = { ...makeWorld(), map: { key: 'otra', title: 'Otra' } } as SimulationWorldState;
    component.world.set(actual);
    respuesta.next({ attemptId: 'attempt-1', map: { key: 'sala' }, player: { x: 10, y: 20 } });
    expect(component.world()).toBe(actual);
  });

  it('reserva la interacción durante la sincronización', () => {
    sim['updateWorldState'].mockReturnValue(NEVER);
    interno()['lastPosition'] = { x: 10, y: 20 };
    const objeto = makeWorld().objects[1];
    (interno() as any).openBackendInteraction(objeto);
    (interno() as any).openBackendInteraction(objeto);
    expect(sim['updateWorldState']).toHaveBeenCalledTimes(1);
    expect(component.busy()).toBe(true);
  });

  it('no envía la interacción si no logra guardar la posición', () => {
    const envios = vi.fn();
    sim['updateWorldState'].mockReturnValue(defer(() => { envios(); return throwError(() => new Error('sin red')); }));
    interno()['lastPosition'] = { x: 10, y: 20 };
    (interno() as any).openBackendInteraction(makeWorld().objects[1]);
    expect(envios).toHaveBeenCalledTimes(2);
    expect(sim['openInteraction']).not.toHaveBeenCalled();
    expect(component.busy()).toBe(false);
  });

  it('una herramienta sin respuesta libera la accion y avisa', () => {
    (interno() as any).doUseTool('herramienta', null);
    vi.advanceTimersByTime(30000);
    expect(component.busy()).toBe(false);
    expect(component.actionError()).toContain('tardando');
  });

  it('una decisión sin respuesta no habilita una elección distinta', () => {
    sim['chooseDecision'].mockReturnValue(NEVER);
    const intento = makeAttempt();
    intento.currentNode.options.push({ id: 42, text: 'Otra' } as any);
    component.attempt.set(intento);
    component.executeDecision(41);
    vi.advanceTimersByTime(30000);
    component.executeDecision(42);
    expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
    expect(component.busy()).toBe(false);
    expect((interno() as any).pendingDecisionRequest).not.toBeNull();
    component.executeDecision(41);
    expect(sim['chooseDecision']).toHaveBeenCalledTimes(2);
    expect(sim['chooseDecision'].mock.calls[1][5]).toBe(sim['chooseDecision'].mock.calls[0][5]);
  });

  describe('salida segura inmediata (REGLA-004)', () => {
    const conPosicionPendiente = () => {
      interno()['lastPosition'] = { x: 10, y: 20 };
      sim['updateWorldState'].mockReturnValue(NEVER);
    };

    it('no espera a guardar la posición: la pausa sale en el acto', () => {
      conPosicionPendiente();
      component.safeExit();
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });

    it('con una petición en vuelo la pausa sale en el acto, sin esperar su plazo', () => {
      component.busy.set(true);
      component.pauseFromOverlay();
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
      expect(component.pausing()).toBe(true);
    });

    it('la respuesta tardía de una interacción en vuelo no abre una conversación sobre la pausa', () => {
      const respuesta = new Subject<any>();
      sim['openInteraction'].mockReturnValue(respuesta);
      (interno() as any).openBackendInteraction(makeWorld().objects[1]);
      component.pauseFromOverlay();
      component.attempt.set({ ...makeAttempt(), status: 'PAUSED' } as SimulationAttemptState);
      respuesta.next({ world: makeWorld(), interaction: makeWorld().objects[1], dialogue: DIALOGO });
      expect(component.dialogue()).toBeNull();
      expect(component.busy()).toBe(false);
    });

    it('si la salida no recibe respuesta a tiempo avisa, no deja nada colgado y se puede pedir de nuevo', () => {
      sim['safeExit'].mockReturnValue(NEVER);
      component.safeExit();
      vi.advanceTimersByTime(15_000);
      expect(component.pausing()).toBe(false);
      expect(component.busy()).toBe(false);
      expect(component.actionError()).not.toBe('');
      component.safeExit();
      expect(sim['safeExit']).toHaveBeenCalledTimes(2);
    });
  });

  describe('plazos en puertas, personajes y el resto de acciones', () => {
    it('una puerta sin respuesta libera la acción, quita el fundido y avisa', () => {
      sim['enterRoom'].mockReturnValue(NEVER);
      const puerta = { key: 'puerta', type: 'EXIT', x: 500, y: 500, metadata: { targetNodeKey: 'otra' } } as unknown as MapObjectState;
      component.world.set({ ...makeWorld(), objects: [puerta] } as SimulationWorldState);
      (interno() as any).doorInteractionArmed = true;
      component.openInteraction(puerta);
      vi.advanceTimersByTime(400);
      expect(sim['enterRoom']).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(15_000);
      expect(component.busy()).toBe(false);
      expect(component.fadeActive()).toBe(false);
      expect(component.actionError()).toContain('tardando');
    });

    it('una conversación con un personaje sin respuesta libera la acción y avisa', () => {
      sim['recordNpcInteraction'].mockReturnValue(NEVER);
      component.openNpcDialogue({ key: 'vecino', displayName: 'Vecino', dialogue: { lines: [{ text: 'Hola' }] } } as any);
      vi.advanceTimersByTime(15_000);
      expect(component.busy()).toBe(false);
      expect(component.actionError()).toContain('tardando');
    });

    it('guardar la bitácora sin respuesta libera la acción y lo dice', () => {
      sim['saveReflection'].mockReturnValue(NEVER);
      component.saveReflection('algo');
      vi.advanceTimersByTime(15_000);
      expect(component.busy()).toBe(false);
      expect(component.journalSaveState()).toBe('error');
    });

    it('reanudar sin respuesta libera la acción y avisa', () => {
      sim['resumeAttempt'].mockReturnValue(NEVER);
      component.attempt.set({ ...makeAttempt(), status: 'PAUSED' } as SimulationAttemptState);
      component.resumeCurrentAttempt();
      vi.advanceTimersByTime(15_000);
      expect(component.busy()).toBe(false);
      expect(component.actionError()).not.toBe('');
    });

    it('cargar el mundo sin respuesta muestra el error con reintento en vez de quedarse colgado', () => {
      sim['getWorld'].mockReturnValue(NEVER);
      (interno() as any).loadWorld(makeAttempt());
      vi.advanceTimersByTime(15_000);
      expect(component.error()).not.toBe('');
      expect(component.loading()).toBe(false);
    });

    it('la respuesta tardía de una herramienta tras la pausa no pisa el mundo', () => {
      const respuesta = new Subject<any>();
      sim['useTool'].mockReturnValue(respuesta);
      const actual = makeWorld();
      component.world.set(actual);
      (interno() as any).doUseTool('t', null);
      component.attempt.set({ ...makeAttempt(), status: 'PAUSED' } as SimulationAttemptState);
      respuesta.next({ world: { ...makeWorld(), map: { key: 'x', title: 'X' } }, feedback: null });
      expect(component.world()).toBe(actual);
      expect(component.busy()).toBe(false);
    });
  });

  describe('decisión pendiente que sobrevive a recargar', () => {
    const http = (status: number) => new HttpErrorResponse({ status });
    const conDosOpciones = () => {
      const intento = makeAttempt();
      intento.currentNode.options.push({ id: 42, text: 'Otra' } as any);
      component.attempt.set(intento);
    };

    it('la intención (opción y requestId) se guarda al elegir', () => {
      sim['chooseDecision'].mockReturnValue(NEVER);
      component.executeDecision(41);
      const guardada = JSON.parse(sessionStorage.getItem('siep_decision_pendiente_attempt-1')!);
      expect(guardada).toMatchObject({ attemptId: 'attempt-1', nodeId: 1, decisionOptionId: 41 });
      expect(guardada.requestId).toBe(sim['chooseDecision'].mock.calls[0][5]);
    });

    it('al recargar con la intención guardada se restaura: no se puede elegir otra opción y la misma reenvía el mismo requestId', () => {
      sessionStorage.setItem('siep_decision_pendiente_attempt-1', JSON.stringify({ attemptId: 'attempt-1', nodeId: 1, decisionOptionId: 41, requestId: 'req-guardado' }));
      conDosOpciones();
      (interno() as any).restorePendingDecision(makeAttempt());
      component.executeDecision(42);
      expect(sim['chooseDecision']).not.toHaveBeenCalled();
      sim['chooseDecision'].mockReturnValue(NEVER);
      component.executeDecision(41);
      expect(sim['chooseDecision'].mock.calls[0][5]).toBe('req-guardado');
    });

    it('al recargar, si el servidor ya avanzó de nodo la intención se descarta', () => {
      sessionStorage.setItem('siep_decision_pendiente_attempt-1', JSON.stringify({ attemptId: 'attempt-1', nodeId: 99, decisionOptionId: 41, requestId: 'req-guardado' }));
      (interno() as any).restorePendingDecision(makeAttempt());
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).toBeNull();
      sim['chooseDecision'].mockReturnValue(NEVER);
      conDosOpciones();
      component.executeDecision(42);
      expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
    });

    it('un 4xx en el reenvío NO libera la intención sin consultar el estado del intento', () => {
      const error$ = new Subject<any>();
      sim['chooseDecision'].mockReturnValue(error$);
      const consulta = new Subject<SimulationAttemptState>();
      sim['getAttempt'].mockReturnValue(consulta);
      conDosOpciones();
      component.executeDecision(41);
      error$.error(http(400));
      expect(sim['getAttempt']).toHaveBeenCalledWith('attempt-1', 'token-1');
      expect((interno() as any).pendingDecisionRequest).not.toBeNull();
      component.executeDecision(42);
      expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
    });

    it('si la consulta dice que la decisión no se aplicó, ahí sí se libera', () => {
      sim['chooseDecision'].mockReturnValue(throwError(() => http(400)));
      sim['getAttempt'].mockReturnValue(of(makeAttempt()));
      conDosOpciones();
      component.executeDecision(41);
      expect((interno() as any).pendingDecisionRequest).toBeNull();
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).toBeNull();
    });

    it('si la consulta dice que la decisión SÍ se aplicó, se adopta el intento del servidor y no se pierde la decisión', () => {
      sim['chooseDecision'].mockReturnValue(throwError(() => http(409)));
      const avanzado = makeAttempt();
      avanzado.currentNode = { ...avanzado.currentNode, id: 2, key: 'siguiente' } as any;
      sim['getAttempt'].mockReturnValue(of(avanzado));
      sim['getWorld'].mockReturnValue(NEVER);
      conDosOpciones();
      component.executeDecision(41);
      expect(component.attempt()?.currentNode.id).toBe(2);
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).toBeNull();
      expect(sim['getWorld']).toHaveBeenCalledTimes(1);
    });

    it('si la consulta tampoco responde, la intención se conserva', () => {
      sim['chooseDecision'].mockReturnValue(throwError(() => http(400)));
      sim['getAttempt'].mockReturnValue(throwError(() => new Error('sin red')));
      conDosOpciones();
      component.executeDecision(41);
      expect((interno() as any).pendingDecisionRequest).not.toBeNull();
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).not.toBeNull();
    });

    it('al confirmarse la decisión se borra la intención guardada', () => {
      sim['chooseDecision'].mockReturnValue(of(makeAttempt()));
      component.executeDecision(41);
      expect(sessionStorage.getItem('siep_decision_pendiente_attempt-1')).toBeNull();
    });
  });

  describe('guardado automático de la posición', () => {
    const guardar = () => {
      interno()['lastPosition'] = { x: 10, y: 20 };
      (interno() as any).persistPosition();
    };

    it('reintenta con espera creciente tras un fallo y, si se logra, no avisa', () => {
      sim['updateWorldState'].mockReturnValueOnce(throwError(() => new Error('sin red')));
      sim['updateWorldState'].mockReturnValue(of({ attemptId: 'attempt-1', status: 'IN_PROGRESS', map: { key: 'sala' }, player: { x: 10, y: 20 } }));
      guardar();
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(599);
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(2);
      expect(component.actionError()).toBe('');
    });

    it('si no se pudo tras todos los reintentos avisa', () => {
      sim['updateWorldState'].mockReturnValue(throwError(() => new Error('sin red')));
      guardar();
      vi.advanceTimersByTime(60_000);
      expect(sim['updateWorldState']).toHaveBeenCalledTimes(4);
      expect(component.actionError()).toContain('posición');
    });

    it('una respuesta vieja, dentro de la misma sala, no pisa la posición sincronizada más nueva', () => {
      const primera = new Subject<any>();
      const segunda = new Subject<any>();
      sim['updateWorldState'].mockReturnValueOnce(primera).mockReturnValueOnce(segunda);
      interno()['lastPosition'] = { x: 10, y: 20 };
      (interno() as any).persistPosition();
      interno()['lastPosition'] = { x: 50, y: 60 };
      (interno() as any).persistPosition();
      const ack = (x: number, y: number) => ({ attemptId: 'attempt-1', status: 'IN_PROGRESS', map: { key: 'sala' }, player: { x, y } });
      segunda.next(ack(50, 60));
      primera.next(ack(10, 20));
      expect(interno()['lastSyncedPosition']).toEqual({ x: 50, y: 60 });
    });
  });

  describe('punto de lectura de un diálogo', () => {
    const dialogoDe = (key: string) => ({ key, speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [{ order: 1, text: 'a' }, { order: 2, text: 'b' }, { order: 3, text: 'c' }], choices: [] }) as unknown as DialogueState;

    it('se guarda qué conversación y en qué línea va', () => {
      (interno() as any).saveReadingPoint({ key: 'abuela', type: 'PERSON' }, dialogoDe('d1'), 2);
      expect(JSON.parse(sessionStorage.getItem('siep_punto_lectura_attempt-1')!)).toEqual({ attemptId: 'attempt-1', objectKey: 'abuela', dialogueKey: 'd1', line: 2 });
    });

    it('al cerrar la conversación el punto se borra', () => {
      (interno() as any).saveReadingPoint({ key: 'abuela', type: 'PERSON' }, dialogoDe('d1'), 1);
      (interno() as any).saveReadingPoint(null, null, 0);
      expect(sessionStorage.getItem('siep_punto_lectura_attempt-1')).toBeNull();
    });

    it('al recargar reabre esa conversación y arranca en la línea guardada', () => {
      sessionStorage.setItem('siep_punto_lectura_attempt-1', JSON.stringify({ attemptId: 'attempt-1', objectKey: 'carpeta', dialogueKey: 'd1', line: 2 }));
      const objeto = makeWorld().objects[1];
      sim['openInteraction'].mockReturnValue(of({ world: makeWorld(), interaction: objeto, dialogue: dialogoDe('d1') }));
      (interno() as any).restoreReadingPoint(makeWorld());
      expect(sim['openInteraction']).toHaveBeenCalledWith('attempt-1', 'token-1', 'carpeta');
      expect(component.dialogue()?.key).toBe('d1');
      expect(component.dialogueStart()).toEqual({ key: 'd1', line: 2 });
    });

    it('si el objeto ya no está en la sala, el punto se descarta', () => {
      sessionStorage.setItem('siep_punto_lectura_attempt-1', JSON.stringify({ attemptId: 'attempt-1', objectKey: 'fantasma', dialogueKey: 'd1', line: 1 }));
      (interno() as any).restoreReadingPoint(makeWorld());
      expect(sim['openInteraction']).not.toHaveBeenCalled();
      expect(sessionStorage.getItem('siep_punto_lectura_attempt-1')).toBeNull();
    });
  });
});
