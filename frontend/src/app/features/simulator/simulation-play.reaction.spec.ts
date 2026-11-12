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
import { EMPTY, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { DialogueState, SimulationAttemptState, SimulationWorldState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER, SessionConsentRecorder } from './consent-recorder';
import { SimulationPlayComponent } from './simulation-play.component';
import type { FinReaccion } from './reaction-director.component';
import type { Mock } from 'vitest';

/**
 * 4.3.3: al elegir, el personaje reacciona en su sala (sin fundido antes de responder) y la nota de supervisión llega
 * después; el mundo de destino carga detrás de ella. Se ejercita la instancia con un director y un mundo falsos.
 */

const CASE_VERSION_ID = 7;
const CONSEQUENCE = { text: 'La estudiante asiente y pregunta por su familia.', source: 'OPTION' };
const REACTION = { line: 'Gracias por quedarse.', emotion: 'triste', gesture: 'se-acerca', objectKey: 'familia-duelo' };

function makeWorld(): SimulationWorldState {
  return {
    map: { key: 'hospital-sala-escucha', title: 'Sala de escucha' },
    objects: [{ key: 'familia-duelo', type: 'PERSON', label: 'Familia en crisis', metadata: {} }],
    tools: [], inventory: [], usedToolKeys: [], inspectedObjectKeys: [], flags: {},
  } as unknown as SimulationWorldState;
}

function makeAttempt(overrides: Record<string, unknown> = {}, nodeKey = 'hospital-seguimiento'): SimulationAttemptState {
  return {
    attemptId: 'attempt-1',
    attemptToken: 'token-1',
    caseVersionId: CASE_VERSION_ID,
    caseTitle: 'Caso demo',
    status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: {
      id: 1, key: nodeKey, title: 'Título del nodo', narrative: 'Primera frase.', terminal: false,
      options: [{ id: 41, text: 'Opción' }],
    },
    completionReport: null,
    ...overrides,
  } as unknown as SimulationAttemptState;
}

const RESPUESTA_CON_REACCION = {
  ...makeAttempt({ persona: { bond: 'OPEN', activation: 'CALM', label: 'se abre y está serena' } }, 'hospital-accion'),
  consequence: CONSEQUENCE, retry: null, reaction: REACTION,
} as unknown as SimulationAttemptState;

describe('SimulationPlayComponent: la reacción al elegir (4.3.3)', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, Mock>;
  let audio: Record<string, Mock>;
  let director: { play: Mock; cancel: Mock; terminar: (motivo?: FinReaccion) => void };
  let stage: { setPersonaState: Mock; updatePatientVisualState: Mock };

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
      chooseDecision: vi.fn(() => of(RESPUESTA_CON_REACCION)),
      useTool: vi.fn(() => EMPTY),
    };
    audio = {
      init: vi.fn(), setScene: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false),
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
    director = {
      play: vi.fn(),
      cancel: vi.fn(),
      terminar: (motivo: FinReaccion = 'completa') => component.afterReaction(motivo),
    };
    // El mundo falso: lo que la prueba mira (`stage`) y, para el resto de llamadas de la pantalla, funciones vacías.
    const mirado: Record<string, Mock> = { setPersonaState: vi.fn(), updatePatientVisualState: vi.fn() };
    stage = mirado as typeof stage;
    const mundo = new Proxy(mirado, { get: (t, k: string) => (t[k] ??= vi.fn()) });
    (component as unknown as Record<string, unknown>)['reaction'] = director;
    (component as unknown as Record<string, unknown>)['gameWorld'] = mundo;
  });

  afterEach(() => {
    component?.ngOnDestroy();
    vi.useRealTimers();
    sessionStorage.clear();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  function montarConDialogoDeDecision() {
    component.attempt.set(makeAttempt());
    component.world.set(makeWorld());
    component.dialogue.set({
      key: 'd', speakerName: 'A', portraitKey: null, emotion: 'neutral', lines: [],
      choices: [{ key: 'o', text: 'O', decisionOptionId: 41, requiredToolCode: null, effect: {} }],
    } as unknown as DialogueState);
    return { component, service: sim, director };
  }

  it('al elegir no hay fundido antes de responder: la reacción ocurre en la sala actual', () => {
    const { component, service } = montarConDialogoDeDecision();
    component.executeDecision(41);
    expect(component.fadeActive()).toBe(false);
    expect(service['chooseDecision']).toHaveBeenCalledTimes(1);
  });

  it('la reacción arranca con el estado antes y después, y el nombre de quien reacciona', () => {
    montarConDialogoDeDecision();
    component.executeDecision(41);
    expect(director.play).toHaveBeenCalledTimes(1);
    const [entrada, quien] = director.play.mock.calls[0];
    expect(entrada.reaction).toMatchObject({ line: 'Gracias por quedarse.' });
    expect(entrada.personaAntes.label).toBe('se muestra cautelosa y tensa');
    expect(entrada.personaDespues.label).toBe('se abre y está serena');
    expect(quien.nombre).toBe('Familia en crisis');
  });

  it('la nota de supervisión llega después de la reacción y el mundo de destino carga detrás', async () => {
    const { component, service } = montarConDialogoDeDecision();
    component.executeDecision(41);
    expect(component.reacting()).toBe(true);
    expect(component.dialogue()).toBeNull();
    expect(component.worldMotionPaused()).toBe(true);
    expect(component.inputBlocked()).toBe(false);
    director.terminar('completa');
    expect(component.reacting()).toBe(false);
    expect(component.dialogue()?.speakerName).toBe('Consecuencia');
    expect(service['getWorld']).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(service['getWorld']).toHaveBeenCalled();
  });

  it('la última decisión retiene el resultado tras la reacción, como antes', () => {
    const { component, service } = montarConDialogoDeDecision();
    service['chooseDecision'].mockReturnValue(of({ ...RESPUESTA_CON_REACCION, status: 'COMPLETED' }));
    component.executeDecision(41);
    director.terminar('saltada');
    expect(component.holdingOutcome()).toBe(true);
  });

  it('la segunda oportunidad también reacciona y luego avisa el reintento', () => {
    const { component, service } = montarConDialogoDeDecision();
    service['chooseDecision'].mockReturnValue(of({ ...RESPUESTA_CON_REACCION, consequence: null, retry: { allowed: true, message: '' } }));
    component.executeDecision(41);
    director.terminar('completa');
    expect(component.dialogue()?.lines.map(l => l.text)).toContain('No se avanzó el caso ni se aplicaron cambios acumulados. Revisa la escena y vuelve a responder.');
  });

  it('pedir la salida segura durante la reacción la corta y pausa en el acto', () => {
    const { component, service } = montarConDialogoDeDecision();
    component.executeDecision(41);
    component.pauseFromOverlay();
    TestBed.tick();
    expect(director.cancel).toHaveBeenCalled();
    expect(service['safeExit']).toHaveBeenCalledTimes(1);
    expect(component.dialogue()?.speakerName).not.toBe('Consecuencia');
    // El cierre «cancelada» del director no reabre la secuencia.
    director.terminar('cancelada');
    expect(component.dialogue()?.speakerName).not.toBe('Consecuencia');
  });

  it('una reacción null no rompe nada: sigue a la nota de supervisión', () => {
    const { component, service } = montarConDialogoDeDecision();
    service['chooseDecision'].mockReturnValue(of({ ...RESPUESTA_CON_REACCION, reaction: null }));
    component.executeDecision(41);
    director.terminar('completa');
    expect(component.dialogue()?.speakerName).toBe('Consecuencia');
  });

  it('una segunda elección durante la reacción no envía otra decisión', () => {
    const { component, service } = montarConDialogoDeDecision();
    component.executeDecision(41);
    component.executeDecision(41);
    expect(service['chooseDecision']).toHaveBeenCalledTimes(1);
  });

  it('durante la reacción solo Esc llega a la partida: Enter y E no abren nada', () => {
    const { component } = montarConDialogoDeDecision();
    component.executeDecision(41);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    component.handleGlobalInteraction(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(component.dialogue()).toBeNull();
  });

  it('el estado de la persona en palabras se pone sobre la persona clave fuera de la reacción', () => {
    montarConDialogoDeDecision();
    (component as unknown as { syncPersonaIcon(a: SimulationAttemptState): void }).syncPersonaIcon(RESPUESTA_CON_REACCION);
    expect(stage.setPersonaState).toHaveBeenCalledWith('se abre y está serena');
  });

  it('en la decisión, la etiqueta nueva no se adelanta: la dice la reacción en su paso', () => {
    const { component } = montarConDialogoDeDecision();
    component.executeDecision(41);
    expect(stage.setPersonaState).not.toHaveBeenCalled();
  });
});
