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
import { EMPTY, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { SimulationAttemptState } from '../../core/models/simulation.model';
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
  };
  let audio: {
    init: jest.Mock;
    setStressLevel: jest.Mock;
    isMusicMuted: jest.Mock;
    isSfxMuted: jest.Mock;
    dispose: jest.Mock;
    stopIntroLament: jest.Mock;
    playIntroLament: jest.Mock;
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
    component = TestBed.createComponent(SimulationPlayComponent).componentInstance;
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
    expect(component.showIntroVideo()).toBe(false);
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
});
