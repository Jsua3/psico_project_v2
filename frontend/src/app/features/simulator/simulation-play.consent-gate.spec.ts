// Phaser inicializa un canvas WebGL al importarse, cosa que jsdom no soporta.
// Solo se evalúa `extends Phaser.Scene` al cargar el módulo; el resto vive en
// métodos que estos tests nunca ejecutan (no se renderiza template).
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

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { EMPTY, of, Subject, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { DialogueState, MapObjectState, NpcConfig, SimulationAttemptState, SimulationWorldState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { SimulationPlayComponent } from './simulation-play.component';

/**
 * ETH-01 — puerta de consentimiento a nivel de bootstrap.
 *
 * Igual que los demás specs del simulador: ts-jest puro no renderiza
 * templates, así que se ejercita la instancia (TestBed solo aporta el
 * contexto de inyección). El contrato observable: nada de audio, mundo,
 * HUD ni media se inicializa antes de aceptar la advertencia.
 */

const CASE_VERSION_ID = 7;

function makeAttempt(overrides: Record<string, unknown> = {}): SimulationAttemptState {
  return {
    attemptId: 'attempt-1',
    attemptToken: 'token-1',
    caseVersionId: CASE_VERSION_ID,
    caseTitle: 'Caso demo',
    status: 'IN_PROGRESS',
    accumulatedScore: 0,
    stressIndex: 0,
    metrics: { victimRisk: 50 },
    currentNode: { key: 'hospital-urgencias', title: 'Urgencias' },
    feedback: null,
    completionReport: null,
    ...overrides,
  } as unknown as SimulationAttemptState;
}

function consentKey(attempt: SimulationAttemptState): string {
  return `siep_case_consent_${attempt.caseVersionId}_${attempt.attemptId}`;
}

describe('SimulationPlayComponent — puerta de consentimiento (ETH-01)', () => {
  let component: SimulationPlayComponent;
  let sim: {
    getInterventionRules: jest.Mock;
    getActiveAttempt: jest.Mock;
    startAttempt: jest.Mock;
    getProgressMap: jest.Mock;
    getWorld: jest.Mock;
    getScenarioConfig: jest.Mock;
    safeExit: jest.Mock;
    enterRoom: jest.Mock;
    recordNpcInteraction: jest.Mock;
    updateWorldState: jest.Mock;
  };
  let audio: {
    init: jest.Mock;
    setStressLevel: jest.Mock;
    isMusicMuted: jest.Mock;
    isSfxMuted: jest.Mock;
    dispose: jest.Mock;
    stopIntroLament: jest.Mock;
    playIntroLament: jest.Mock;
    playSfx: jest.Mock;
    toggleMusicMuted: jest.Mock;
  };
  let router: { navigate: jest.Mock };

  function setup(activeAttempt: SimulationAttemptState | null) {
    sessionStorage.clear();
    sim = {
      getInterventionRules: jest.fn(() => throwError(() => new Error('sin reglas'))),
      getActiveAttempt: jest.fn(() => of(activeAttempt)),
      startAttempt: jest.fn(() => of(makeAttempt())),
      getProgressMap: jest.fn(() => EMPTY),
      getWorld: jest.fn(() => EMPTY),
      getScenarioConfig: jest.fn(() => EMPTY),
      safeExit: jest.fn(() => EMPTY),
      enterRoom: jest.fn(() => EMPTY),
      recordNpcInteraction: jest.fn(() => EMPTY),
      updateWorldState: jest.fn(() => EMPTY),
      resumeAttempt: jest.fn(() => of(makeAttempt())),
    };
    audio = {
      init: jest.fn(),
      setStressLevel: jest.fn(),
      isMusicMuted: jest.fn(() => false),
      isSfxMuted: jest.fn(() => false),
      dispose: jest.fn(),
      stopIntroLament: jest.fn(),
      playIntroLament: jest.fn(),
      playSfx: jest.fn(),
      toggleMusicMuted: jest.fn(() => false),
    };
    router = { navigate: jest.fn() };

    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        { provide: AudioDirectorService, useValue: audio },
        { provide: AuthService, useValue: {} },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: String(CASE_VERSION_ID) }) } },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
  }

  afterEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('al reanudar sin consentimiento muestra la advertencia y NO inicializa audio ni mundo', () => {
    setup(makeAttempt());
    component.ngOnInit();
    component.resumeAttempt();

    expect(component.showContentWarning()).toBe(true);
    expect(component.worldStarted()).toBe(false);
    expect(audio.init).not.toHaveBeenCalled();
    expect(audio.setStressLevel).not.toHaveBeenCalled();
    expect(sim.getWorld).not.toHaveBeenCalled();
    expect(sim.getProgressMap).not.toHaveBeenCalled();
  });

  it('aceptar registra el consentimiento e inicializa audio y mundo UNA sola vez', () => {
    setup(makeAttempt());
    component.ngOnInit();
    component.resumeAttempt();

    component.acceptContentWarning();
    component.acceptContentWarning(); // doble clic / señal repetida

    expect(sessionStorage.getItem(consentKey(makeAttempt()))).toBe('given');
    expect(component.showContentWarning()).toBe(false);
    expect(component.worldStarted()).toBe(true);
    expect(audio.init).toHaveBeenCalledTimes(1);
    expect(sim.getWorld).toHaveBeenCalledTimes(1);
    expect(sim.getProgressMap).toHaveBeenCalledTimes(1);
    expect(audio.setStressLevel).toHaveBeenCalledTimes(1);
  });

  it('rechazar vuelve al catálogo sin inicializar nada y sin llamar safe-exit', () => {
    setup(makeAttempt());
    component.ngOnInit();
    component.resumeAttempt();

    component.declineContentWarning();

    expect(router.navigate).toHaveBeenCalledWith(['/portal/simulador']);
    expect(audio.init).not.toHaveBeenCalled();
    expect(sim.getWorld).not.toHaveBeenCalled();
    expect(sim.safeExit).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(consentKey(makeAttempt()))).toBeNull();
  });

  it('con consentimiento ya registrado en la sesión arranca directo (una vez) sin advertencia', () => {
    const attempt = makeAttempt();
    setup(attempt);
    sessionStorage.setItem(consentKey(attempt), 'given');

    component.ngOnInit();
    component.resumeAttempt();

    expect(component.showContentWarning()).toBe(false);
    expect(component.worldStarted()).toBe(true);
    expect(audio.init).toHaveBeenCalledTimes(1);
    expect(sim.getWorld).toHaveBeenCalledTimes(1);
  });

  it('Escape bajo la advertencia no dispara la salida segura', () => {
    setup(makeAttempt());
    component.ngOnInit();
    component.resumeAttempt();

    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    component.handleGlobalInteraction(event);

    expect(event.defaultPrevented).toBe(true);
    expect(sim.safeExit).not.toHaveBeenCalled();
    expect(component.showContentWarning()).toBe(true);
  });

  it('Enter/Espacio bajo la advertencia no activan controles del fondo ni avanzan el flujo', () => {
    setup(makeAttempt());
    component.ngOnInit();
    component.resumeAttempt();

    component.handleGlobalInteraction(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    component.handleGlobalInteraction(new KeyboardEvent('keydown', { key: ' ', cancelable: true }));

    expect(component.showContentWarning()).toBe(true);
    expect(component.showIntroScene()).toBe(false);
    expect(component.worldStarted()).toBe(false);
    expect(audio.init).not.toHaveBeenCalled();
    expect(sim.getWorld).not.toHaveBeenCalled();
  });

  it('reanudar un intento PAUSED pasa por el endpoint de resume y vuelve a pedir consentimiento', () => {
    setup(makeAttempt({ status: 'PAUSED' }));
    component.ngOnInit();
    expect(component.showResumePrompt()).toBe(true);

    component.resumeAttempt();

    expect(sim.resumeAttempt).toHaveBeenCalledWith('attempt-1', 'token-1');
    // El backend devolvió IN_PROGRESS (mismo attemptId); sin consentimiento
    // registrado, el gate ETH-01 vuelve a mostrarse antes de cargar nada.
    expect(component.attempt()?.status).toBe('IN_PROGRESS');
    expect(component.showContentWarning()).toBe(true);
    expect(sim.getWorld).not.toHaveBeenCalled();
  });

  it('un intento nuevo (otro attemptId) vuelve a pedir consentimiento', () => {
    const previous = makeAttempt();
    setup(previous);
    sessionStorage.setItem(consentKey(previous), 'given');
    sim.startAttempt = jest.fn(() => of(makeAttempt({ attemptId: 'attempt-2', attemptToken: 'token-2' })));

    component.ngOnInit();
    component.startNewAttempt();

    expect(component.showContentWarning()).toBe(true);
    expect(component.worldStarted()).toBe(false);
    expect(sim.getWorld).not.toHaveBeenCalled();
  });

  it('deriva un único bloqueo de input para consentimiento, diálogo y bitácora', () => {
    setup(makeAttempt());

    component.showContentWarning.set(true);
    expect(component.inputBlocked()).toBe(true);

    component.showContentWarning.set(false);
    component.dialogue.set({ key: 'dialogue-test', lines: [], choices: [] } as DialogueState);
    expect(component.inputBlocked()).toBe(true);

    component.dialogue.set(null);
    component.journalOpen.set(true);
    expect(component.inputBlocked()).toBe(true);
  });

  it('no abre una interacción cercana con E mientras un overlay bloquea el mundo', () => {
    setup(makeAttempt());
    component.nearbyInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as MapObjectState);
    component.dialogue.set({ key: 'dialogue-test', lines: [], choices: [] } as DialogueState);
    const open = jest.spyOn(component, 'openInteraction');

    component.handleGlobalInteraction(new KeyboardEvent('keydown', { key: 'e', cancelable: true }));

    expect(open).not.toHaveBeenCalled();
  });

  it('no cancela Enter sobre un botón nativo cuando un diálogo bloquea el mundo', () => {
    setup(makeAttempt());
    component.dialogue.set({ key: 'dialogue-test', lines: [], choices: [] } as DialogueState);
    const button = document.createElement('button');
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    Object.defineProperty(event, 'target', { value: button });

    component.handleGlobalInteraction(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('Enter sobre un botón de la tarjeta del caso lo activa en vez de saltar la tarjeta', () => {
    setup(makeAttempt());
    component.showCaseIntro.set(true);
    const button = document.createElement('button');
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    Object.defineProperty(event, 'target', { value: button });

    component.handleGlobalInteraction(event);

    expect(event.defaultPrevented).toBe(false);
    expect(component.showCaseIntro()).toBe(true);
  });

  it('activar la música durante la intro vuelve a su tema, no a la música del mapa', () => {
    setup(makeAttempt());
    component.showCaseIntro.set(true);

    component.toggleMusicMute();

    expect(audio.playIntroLament).toHaveBeenCalled();
    expect(audio.setStressLevel).not.toHaveBeenCalled();
  });

  describe('activación por teclado de los botones de las tarjetas de la intro', () => {
    function keydownOn(button: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
      Object.defineProperty(event, 'target', { value: button });
      return event;
    }

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('si Phaser cancela Enter o Espacio en window, el botón de la tarjeta se activa a mano', () => {
      setup(makeAttempt());
      component.showIntroScene.set(true);
      const button = document.createElement('button');
      const click = jest.spyOn(button, 'click');

      for (const key of ['Enter', ' ']) {
        const event = keydownOn(button, key);
        component.handleGlobalInteraction(event);
        expect(event.defaultPrevented).toBe(false); // el manejador no cancela: lo hace Phaser después
        event.preventDefault(); // Phaser captura estas teclas y cancela la activación nativa
        jest.runAllTimers();
      }

      expect(click).toHaveBeenCalledTimes(2);
      expect(component.showIntroScene()).toBe(true);
    });

    it('si nadie cancela la tecla, el botón se activa solo (sin doble activación)', () => {
      setup(makeAttempt());
      component.showCaseIntro.set(true);
      const button = document.createElement('button');
      const click = jest.spyOn(button, 'click');

      component.handleGlobalInteraction(keydownOn(button, 'Enter'));
      jest.runAllTimers();

      expect(click).not.toHaveBeenCalled();
    });

    it('mantener la tecla pulsada no repite la activación', () => {
      setup(makeAttempt());
      component.showIntroScene.set(true);
      const button = document.createElement('button');
      const click = jest.spyOn(button, 'click');

      const event = keydownOn(button, ' ', { repeat: true });
      component.handleGlobalInteraction(event);
      event.preventDefault();
      jest.runAllTimers();

      expect(click).not.toHaveBeenCalled();
    });
  });

  it('mantiene el atajo J aunque el foco venga del botón que cerró un overlay', () => {
    setup(makeAttempt());
    const button = document.createElement('button');
    const event = new KeyboardEvent('keydown', { key: 'j', cancelable: true });
    Object.defineProperty(event, 'target', { value: button });

    component.handleGlobalInteraction(event);

    expect(event.defaultPrevented).toBe(true);
    expect(component.journalOpen()).toBe(true);
  });

  it('no autocierra un feedback de herramienta antes de que el usuario lea sus líneas', () => {
    jest.useFakeTimers();
    try {
      setup(makeAttempt());
      const subject = component as unknown as {
        showToolFeedback(result: {
          toolCode: string;
          pertinent: boolean;
          feedbackMessage: string;
          stressDelta: number;
        }): void;
      };

      subject.showToolFeedback({
        toolCode: 'PAP',
        pertinent: true,
        feedbackMessage: 'Una explicación clínica extensa que debe avanzar manualmente.',
        stressDelta: -5,
      });
      jest.advanceTimersByTime(5_000);

      expect(component.dialogue()?.lines).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('no acredita NPC ni permite salida segura desde controles de fondo bloqueados', () => {
    setup(makeAttempt());
    component.attempt.set(makeAttempt());
    component.dialogue.set({ key: 'dialogue-test', lines: [], choices: [] } as DialogueState);

    component.openNpcDialogue({ key: 'enfermera-urgencias', dialogue: { lines: [] } } as NpcConfig);
    component.safeExit();

    expect(sim.recordNpcInteraction).not.toHaveBeenCalled();
    expect(sim.safeExit).not.toHaveBeenCalled();
  });

  it('acredita y abre el diálogo del NPC solo después del 2xx autoritativo', () => {
    setup(makeAttempt());
    component.attempt.set(makeAttempt());
    const response$ = new Subject<SimulationWorldState>();
    sim.recordNpcInteraction.mockReturnValue(response$);
    const npc = {
      key: 'enfermera-urgencias',
      displayName: 'Enfermera',
      dialogue: { lines: [{ text: 'Acércate.' }] },
    } as NpcConfig;

    component.openNpcDialogue(npc);

    expect((component as any).viewedNpcKeys().has(npc.key)).toBe(false);
    expect(component.dialogue()).toBeNull();

    response$.next({ flags: { viewedNpcKeys: [npc.key] } } as SimulationWorldState);

    expect((component as any).viewedNpcKeys().has(npc.key)).toBe(true);
    expect(component.dialogue()?.key).toBe(`npc-${npc.key}`);
  });

  it('sincroniza la posición pendiente antes de acreditar un NPC', () => {
    setup(makeAttempt());
    component.attempt.set(makeAttempt());
    const world = {
      map: { key: 'hospital-urgencias' },
      player: { x: 250, y: 430 },
      flags: {},
    } as SimulationWorldState;
    component.world.set(world);
    (component as any).lastPosition = { x: 560, y: 380 };
    const sync$ = new Subject<SimulationWorldState>();
    sim.updateWorldState.mockReturnValue(sync$);
    sim.recordNpcInteraction.mockReturnValue(EMPTY);
    const npc = {
      key: 'enfermera-urgencias',
      displayName: 'Enfermera',
      dialogue: { lines: [{ text: 'Acércate.' }] },
    } as NpcConfig;

    component.openNpcDialogue(npc);

    expect(sim.updateWorldState).toHaveBeenCalledWith(
      'attempt-1', 'token-1', 560, 380, 'hospital-urgencias',
    );
    expect(sim.recordNpcInteraction).not.toHaveBeenCalled();

    sync$.next(world);

    expect(sim.recordNpcInteraction).toHaveBeenCalledWith(
      'attempt-1', 'token-1', 'enfermera-urgencias',
    );
  });

  it('sincroniza la posición pendiente antes de pausar con salida segura', () => {
    setup(makeAttempt());
    component.attempt.set(makeAttempt());
    const world = {
      map: { key: 'hospital-sala-escucha' },
      player: { x: 320, y: 440 },
      flags: {},
    } as SimulationWorldState;
    component.world.set(world);
    (component as any).lastPosition = { x: 612, y: 444 };
    const sync$ = new Subject<SimulationWorldState>();
    sim.updateWorldState.mockReturnValue(sync$);
    sim.safeExit.mockReturnValue(EMPTY);

    component.safeExit();

    expect(sim.updateWorldState).toHaveBeenCalledWith(
      'attempt-1', 'token-1', 612, 444, 'hospital-sala-escucha',
    );
    expect(sim.safeExit).not.toHaveBeenCalled();

    sync$.next(world);

    expect(sim.safeExit).toHaveBeenCalledWith(
      'attempt-1', 'token-1', 'Salida segura solicitada',
    );
  });

  it('conserva la configuración autorada mientras carga la del mundo siguiente', () => {
    setup(makeAttempt());
    const previousConfig = {
      scenarioKey: 'hospital-urgencias',
      startRoomKey: 'hospital-urgencias',
      rooms: [],
    };
    const nextConfig = {
      scenarioKey: 'hospital-sala-escucha',
      startRoomKey: 'hospital-sala-escucha',
      rooms: [],
    };
    const nextWorld = {
      map: { key: 'hospital-sala-escucha' },
      player: { x: 160, y: 452 },
      flags: {},
    } as SimulationWorldState;
    const config$ = new Subject<typeof nextConfig>();
    component.scenarioConfig.set(previousConfig as any);
    sim.getScenarioConfig.mockReturnValue(config$);

    (component as any).applyWorldWithScenario(nextWorld);

    expect(component.scenarioConfig()).toBe(previousConfig);
    expect(component.world()).toBeNull();

    config$.next(nextConfig);

    expect(component.scenarioConfig()).toBe(nextConfig);
    expect(component.world()).toBe(nextWorld);
  });

  it('bloquea la puerta de retorno hasta alejarse del punto de entrada', () => {
    jest.useFakeTimers();
    try {
      setup(makeAttempt({ currentNode: { key: 'hospital-urgencias', title: 'Urgencias' } }));
      component.attempt.set(makeAttempt());
      const returnDoor = {
        key: 'puerta-urgencias',
        type: 'EXIT',
        x: 122,
        y: 460,
        metadata: { targetNodeKey: 'hospital-urgencias', entryX: 786, entryY: 440 },
      } as MapObjectState;
      component.world.set({
        map: { key: 'hospital-sala-escucha' },
        player: { x: 160, y: 447 },
        objects: [returnDoor],
        flags: {},
      } as SimulationWorldState);

      component.openInteraction(returnDoor);
      jest.advanceTimersByTime(400);

      expect(sim.enterRoom).not.toHaveBeenCalled();
      expect(component.doorNotice()).toMatch(/aléjate|avanza|pasos/i);

      component.rememberPosition(340, 450);
      component.rememberPosition(145, 455);
      (component as any).lastSyncedPosition = { x: 145, y: 455 };
      component.openInteraction(returnDoor);
      jest.advanceTimersByTime(400);

      expect(sim.enterRoom).toHaveBeenCalledWith(
        'attempt-1', 'token-1', 'hospital-urgencias', 'puerta-urgencias',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('hidrata el estado de paciente desde clinicalState al cargar el mundo', () => {
    setup(makeAttempt());
    const patient = {
      emotionalState: 65,
      trustLevel: 65,
      openness: 65,
      crisisLevel: 30,
    };
    component.attempt.set(makeAttempt({ clinicalState: { papApplied: true, patient } }));

    (component as any).applyLoadedWorld({
      map: { key: 'hospital-urgencias' },
      flags: {},
    } as SimulationWorldState);

    expect(component.patientState()).toEqual(patient);
  });

  it('expone un control de interacción únicamente para el objeto cercano sin overlay', () => {
    setup(makeAttempt());
    component.attempt.set(makeAttempt());
    const nearby = { key: 'familia-crisis', type: 'PERSON' } as MapObjectState;
    component.nearbyInteraction.set(nearby);

    expect(component.contextualInteraction()).toBe(nearby);

    component.dialogue.set({ key: 'dialogue-test', lines: [], choices: [] } as DialogueState);
    expect(component.contextualInteraction()).toBeNull();
  });
});
