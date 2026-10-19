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

import { readFileSync } from 'fs';
import { join } from 'path';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { EMPTY, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { DialogueState, SimulationAttemptState, SimulationWorldState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { SimulationPlayComponent } from './simulation-play.component';
import type { Mock } from 'vitest';

/**
 * DLG-05 acotado a la última decisión: tras la sexta decisión el intento ya figura como COMPLETED, pero la
 * «Supervisión clínica» se lee primero sobre la escena y el resultado se abre al cerrarla (sin la decisión en
 * dos tiempos completa, T9.12). Se ejercita la instancia, como el resto de specs de instancia del juego.
 */

const CASE_VERSION_ID = 7;
const LAST_NODE = 'hospital-cierre';

const FEEDBACK = {
  classification: 'ADEQUATE', scoreDelta: 12, stressDelta: -5, trustDelta: 10, victimRiskDelta: -5,
  prohibitedConduct: false, institutionalRouteActivated: false, revictimizationRisk: false,
  message: 'La decisión quedó registrada.', prohibitionReason: null, retryRequired: false,
};

function makeWorld(): SimulationWorldState {
  return {
    map: { key: 'hospital-sala-escucha', title: 'Sala de escucha' },
    objects: [], tools: [], inventory: [], usedToolKeys: [], inspectedObjectKeys: [], flags: {},
  } as unknown as SimulationWorldState;
}

function makeAttempt(overrides: Record<string, unknown> = {}, nodeKey = 'hospital-seguimiento'): SimulationAttemptState {
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
      id: 1, key: nodeKey, title: 'Título del nodo', narrative: 'Primera frase.', terminal: false,
      options: [{ id: 101, text: 'Opción' }],
    },
    feedback: null,
    completionReport: null,
    ...overrides,
  } as unknown as SimulationAttemptState;
}

const completed = (extra: Record<string, unknown> = {}) =>
  makeAttempt({ status: 'COMPLETED', feedback: FEEDBACK, completionReport: { ending: null }, ...extra }, LAST_NODE);

describe('SimulationPlayComponent: supervisión de la última decisión (DLG-05)', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;
  let audio: Record<string, Mock>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    sessionStorage.clear();
    localStorage.clear();
    sim = {
      getActiveAttempt: vi.fn(() => of(null)),
      startAttempt: vi.fn(() => of(makeAttempt())),
      getProgressMap: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => of(makeWorld())),
      getScenarioConfig: vi.fn(() => throwError(() => new Error('sin escenario'))),
      safeExit: vi.fn(() => EMPTY),
      enterRoom: vi.fn(() => EMPTY),
      recordNpcInteraction: vi.fn(() => EMPTY),
      updateWorldState: vi.fn(() => EMPTY),
      openInteraction: vi.fn(() => EMPTY),
      chooseDecision: vi.fn(() => of(completed())),
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
        { provide: CONSENT_RECORDER, useValue: new SessionConsentRecorder() },
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

  const tick = (ms = 0) => { vi.advanceTimersByTime(ms); TestBed.tick(); };

  /** Decide por última vez: el servidor responde con el intento ya COMPLETED. */
  function decideLast(response: SimulationAttemptState = completed()): void {
    component.attempt.set(makeAttempt());
    component.world.set(makeWorld());
    sim['chooseDecision'].mockReturnValue(of(response));
    component.dialogue.set({
      key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [],
      choices: [{ key: 'o', text: 'O', decisionOptionId: 101, requiredToolCode: null, effect: {} }],
    } as unknown as DialogueState);
    component.executeDecision(101);
    // Sin evidencia pendiente en este nodo: solo el fundido y la respuesta del servidor.
    tick(340);
    tick(100);
  }

  const keydown = (key: string) => {
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    component.handleGlobalInteraction(event);
    TestBed.tick();
    return event;
  };

  describe('la supervisión se lee antes del resultado', () => {
    it('tras la última decisión el intento está COMPLETED y la supervisión queda a la vista, no el resultado', () => {
      decideLast();

      expect(component.attempt()?.status).toBe('COMPLETED');
      expect(component.holdingOutcome()).toBe(true);
      expect(component.viewMode()).toBe('dialogue-cinematic');
      expect(component.dialogue()?.speakerName).toBe('Supervisión clínica');
      expect(component.dialogue()?.key).toMatch(/^supervision-/);
      expect(component.dialogue()?.choices).toEqual([]);
    });

    it('la supervisión de la última decisión no depende de la espera de 400 ms de las demás', () => {
      decideLast();

      // Sin avanzar más el reloj: ya está, no hay un instante con el resultado destapado.
      expect(component.dialogue()).not.toBeNull();
      expect(component.viewMode()).not.toBe('outcome');
    });

    it('no suena el cierre del caso mientras se lee la supervisión', () => {
      decideLast();

      expect(audio['playResolution']).not.toHaveBeenCalled();
      expect(audio['playSfx']).not.toHaveBeenCalledWith('session_complete');
    });

    it('una decisión que no es la última sigue como antes: el intento sigue en curso y la supervisión llega a los 400 ms', () => {
      component.attempt.set(makeAttempt());
      component.world.set(makeWorld());
      sim['chooseDecision'].mockReturnValue(of(makeAttempt({ feedback: FEEDBACK }, 'hospital-accion')));
      component.dialogue.set({
        key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [],
        choices: [{ key: 'o', text: 'O', decisionOptionId: 101, requiredToolCode: null, effect: {} }],
      } as unknown as DialogueState);

      component.executeDecision(101);
      tick(340);
      tick(100);
      expect(component.dialogue()).toBeNull();
      tick(400);

      expect(component.holdingOutcome()).toBe(false);
      expect(component.dialogue()?.speakerName).toBe('Supervisión clínica');
      expect(component.viewMode()).toBe('dialogue-cinematic');
      expect(audio['playResolution']).not.toHaveBeenCalled();
    });
  });

  describe('cerrar la supervisión abre el resultado, sin callejones', () => {
    it('«Continuar» y «Volver al mapa» (closeDialogue) abren el resultado y suena su cierre', () => {
      decideLast();

      component.closeDialogue();
      TestBed.tick();

      expect(component.holdingOutcome()).toBe(false);
      expect(component.dialogue()).toBeNull();
      expect(component.viewMode()).toBe('outcome');
      expect(audio['playResolution']).toHaveBeenCalledTimes(1);
      expect(audio['playSfx']).toHaveBeenCalledWith('session_complete');
    });

    it('«Salida segura» del panel lleva al resultado igual que «Continuar» y no pide una pausa al servidor', () => {
      decideLast();

      component.pauseFromOverlay();
      TestBed.tick();

      expect(sim['safeExit']).not.toHaveBeenCalled();
      expect(component.viewMode()).toBe('outcome');
      expect(component.attempt()?.status).toBe('COMPLETED');
      expect(component.pausing()).toBe(false);
    });

    it('Esc cierra la supervisión y muestra el resultado, una sola vez', () => {
      decideLast();

      const event = keydown('Escape');

      expect(event.defaultPrevented).toBe(true);
      expect(component.viewMode()).toBe('outcome');
      keydown('Escape');
      expect(component.viewMode()).toBe('outcome');
      expect(audio['playResolution']).toHaveBeenCalledTimes(1);
    });

    it('el resultado no se esconde de nuevo: la retención no reaparece al reabrir nada', () => {
      decideLast();
      component.closeDialogue();
      TestBed.tick();

      component.dialogue.set({
        key: 'otro', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [], choices: [],
      } as unknown as DialogueState);

      expect(component.holdingOutcome()).toBe(false);
      expect(component.viewMode()).toBe('outcome');
    });

    it('si el diálogo desaparece por otro camino el resultado se abre igual', () => {
      decideLast();

      component.dialogue.set(null);
      TestBed.tick();

      expect(component.holdingOutcome()).toBe(false);
      expect(component.viewMode()).toBe('outcome');
      expect(audio['playResolution']).toHaveBeenCalledTimes(1);
    });

    it('con movimiento reducido es igual (no hay animación de la que depender)', () => {
      component.reduceMotion.set(true);
      decideLast();
      expect(component.viewMode()).toBe('dialogue-cinematic');

      component.pauseFromOverlay();
      TestBed.tick();

      expect(component.viewMode()).toBe('outcome');
    });

    it('con una petición en curso Esc igualmente cierra la supervisión (no queda en cola)', () => {
      decideLast();
      component.busy.set(true);

      keydown('Escape');

      expect(component.viewMode()).toBe('outcome');
    });
  });

  describe('el resultado se abre siempre', () => {
    it('sin feedback en la respuesta no hay supervisión: resultado directo y su sonido de cierre', () => {
      decideLast(completed({ feedback: null }));

      expect(component.holdingOutcome()).toBe(false);
      expect(component.viewMode()).toBe('outcome');
      expect(component.dialogue()).toBeNull();
      expect(audio['playResolution']).toHaveBeenCalledTimes(1);
    });

    it('si la supervisión no se puede armar, el resultado se abre igual', () => {
      const original = (component as any).buildSupervisionDialogue;
      (component as any).buildSupervisionDialogue = () => { throw new Error('feedback malformado'); };

      decideLast();

      expect(component.holdingOutcome()).toBe(false);
      expect(component.viewMode()).toBe('outcome');
      expect(audio['playResolution']).toHaveBeenCalledTimes(1);
      (component as any).buildSupervisionDialogue = original;
    });

    it('si el mapa no carga tras la última decisión, la supervisión no retiene el resultado', () => {
      sim['getWorld'].mockReturnValue(throwError(() => new Error('sin mapa')));

      decideLast();

      expect(component.error()).toBe('No pudimos cargar el mapa del caso.');
      expect(component.holdingOutcome()).toBe(false);
      expect(component.viewMode()).toBe('outcome');
    });

    it('una pausa nunca se esconde tras la supervisión (REGLA-004)', () => {
      decideLast();

      component.attempt.set(completed({ status: 'PAUSED' }));

      expect(component.holdingOutcome()).toBe(false);
      expect(component.viewMode()).toBe('outcome');
    });

    it('un intento nuevo empieza sin retención ni diálogo', () => {
      decideLast();
      sim['startAttempt'].mockReturnValue(of(makeAttempt()));

      component.startNewAttempt();
      TestBed.tick();

      expect(component.holdingOutcome()).toBe(false);
      expect(component.dialogue()).toBeNull();
      expect(component.viewMode()).toBe('explore');
      expect(audio['playResolution']).not.toHaveBeenCalled();
    });

    it('al recargar con el intento ya completado no hay supervisión retenida: se ve el resultado', () => {
      component.attempt.set(completed());

      expect(component.holdingOutcome()).toBe(false);
      expect(component.viewMode()).toBe('outcome');
    });
  });
});

describe('simulation-play: contrato de la supervisión retenida', () => {
  const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

  it('el modo de vista recibe la retención y el resultado solo se pinta cuando no hay retención', () => {
    expect(source).toMatch(/resolveViewMode\(\{[^}]*holdOutcome: this\.holdingOutcome\(\),\s*\}\)/);
    expect(source).toMatch(/@if \(!holdingOutcome\(\)\) \{\s*<app-attempt-outcome/);
  });

  it('la retención solo vale con el intento COMPLETED y con el diálogo a la vista', () => {
    expect(source).toMatch(
      /readonly holdingOutcome = computed\(\(\) =>\s*this\.supervisionHold\(\) && this\.dialogue\(\) !== null && this\.attempt\(\)\?\.status === 'COMPLETED'\);/,
    );
  });

  it('«Salida segura» con la supervisión retenida cierra el diálogo antes de mirar si hay algo que pausar', () => {
    expect(source).toMatch(
      /pauseFromOverlay\(\): void \{[^}]*if \(this\.holdingOutcome\(\)\) \{\s*this\.closeDialogue\(\);\s*return;\s*\}\s*const game = this\.attempt\(\);/,
    );
  });

  // F6-6 (H-05): el foco inicial lo toma el propio resultado, en su título (attempt-outcome.component.spec.ts lo fija
  // sobre el DOM); esta pantalla ya no enfoca nada y nunca un botón (Enter mantenida no reintenta el caso).
  it('la pantalla de juego no enfoca el resultado ni sus botones: lo hace el componente, en su título', () => {
    expect(source).not.toContain('app-attempt-outcome .outcome');
    expect(source).not.toMatch(/querySelector[^)]*oc-btn[^)]*\)\??\.focus/);
    expect(source).toMatch(/private releaseHeldOutcome\(\): void \{[^}]*this\.announce\('Se abre el resultado del caso\.'\);/);
  });
});
