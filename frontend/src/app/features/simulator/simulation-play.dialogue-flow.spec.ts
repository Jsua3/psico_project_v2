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
 * Flujo del diálogo sin callejones (F§7.6, F§5.6, B§T8.3): un panel que se queda bloqueado tras un
 * rechazo o un error, un error que no dice la causa o un estado que sobrevive a un intento nuevo
 * dejan al estudiante sin salida. Se ejercita la instancia, como el resto de specs del juego.
 */

const CASE_VERSION_ID = 7;
/** Nodo sin evidencia exigida: la compuerta blanda no interviene en estos flujos. */
const FREE_NODE = 'nodo-sin-evidencia';

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
    currentNode: {
      key: FREE_NODE,
      title: 'Etapa',
      options: [{ id: 11, text: 'Opción de esta etapa' }],
    },
    feedback: null,
    completionReport: null,
    ...overrides,
  } as unknown as SimulationAttemptState;
}

function decisionDialogue(optionId: number): DialogueState {
  return {
    key: 'dialogue-decision',
    speakerName: 'Familia',
    portraitKey: null,
    emotion: 'neutral',
    lines: [{ order: 1, speakerName: 'Familia', text: 'Ayúdanos.', emotion: 'concerned' }],
    choices: [{
      key: `opt-${optionId}`, text: 'Opción', decisionOptionId: optionId,
      requiredToolCode: null, effect: {},
    }],
  } as unknown as DialogueState;
}

function http(status: number, message?: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: message ? { message } : null });
}

describe('SimulationPlayComponent: diálogo sin callejones', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, jest.Mock>;
  let audio: Record<string, jest.Mock>;

  beforeEach(() => {
    jest.useFakeTimers();
    sessionStorage.clear();
    sim = {
      getInterventionRules: jest.fn(() => throwError(() => new Error('sin reglas'))),
      getActiveAttempt: jest.fn(() => of(null)),
      startAttempt: jest.fn(() => of(makeAttempt({ attemptId: 'attempt-2', attemptToken: 'token-2' }))),
      getProgressMap: jest.fn(() => EMPTY),
      getWorld: jest.fn(() => EMPTY),
      getScenarioConfig: jest.fn(() => EMPTY),
      safeExit: jest.fn(() => EMPTY),
      enterRoom: jest.fn(() => EMPTY),
      recordNpcInteraction: jest.fn(() => EMPTY),
      updateWorldState: jest.fn(() => EMPTY),
      openInteraction: jest.fn(() => EMPTY),
      chooseDecision: jest.fn(() => EMPTY),
      useTool: jest.fn(() => EMPTY),
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
    component.attempt.set(makeAttempt());
    component.world.set({
      map: { key: 'hospital-urgencias' }, objects: [], tools: [], inventory: [],
      usedToolKeys: [], inspectedObjectKeys: [], flags: {},
    } as unknown as SimulationWorldState);
  });

  afterEach(() => {
    jest.useRealTimers();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('cerrar y empezar de nuevo', () => {
    it('cerrar el diálogo deja de marcar el objeto como seleccionado (DLG-31)', () => {
      component.selectedInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as MapObjectState);
      component.dialogue.set(decisionDialogue(11));

      component.closeDialogue();

      expect(component.dialogue()).toBeNull();
      expect(component.selectedInteraction()).toBeNull();
    });

    it('un intento nuevo no hereda el diálogo, la selección ni la bitácora abierta', () => {
      component.dialogue.set(decisionDialogue(11));
      component.selectedInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as MapObjectState);
      component.nearbyInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as MapObjectState);
      component.journalOpen.set(true);
      (component as any).pendingEvidenceDecisionId = 11;
      (component as any).pendingEvidenceMissing = ['npc:enfermera-urgencias'];

      component.startNewAttempt();

      expect(sim['startAttempt']).toHaveBeenCalledWith(CASE_VERSION_ID, true);
      expect(component.dialogue()).toBeNull();
      expect(component.selectedInteraction()).toBeNull();
      expect(component.nearbyInteraction()).toBeNull();
      expect(component.journalOpen()).toBe(false);
      expect((component as any).pendingEvidenceDecisionId).toBeNull();
      expect((component as any).pendingEvidenceMissing).toEqual([]);
    });
  });

  describe('elegir una opción', () => {
    it('una opción de otra etapa no llama al servidor, avisa y libera el panel', () => {
      component.dialogue.set(decisionDialogue(99));
      const before = component.dialogueReleaseToken();

      component.executeDecision(99);

      expect(sim['chooseDecision']).not.toHaveBeenCalled();
      expect(component.actionError()).toMatch(/otra etapa/i);
      expect(component.dialogueReleaseToken()).toBe(before + 1);
      expect(component.dialogue()).not.toBeNull();
    });

    it('con una petición en curso rechaza la elección sin dejarla bloqueada', () => {
      component.dialogue.set(decisionDialogue(11));
      component.busy.set(true);
      const before = component.dialogueReleaseToken();

      component.executeDecision(11);

      expect(sim['chooseDecision']).not.toHaveBeenCalled();
      expect(component.dialogueReleaseToken()).toBe(before + 1);
    });

    it('si el servidor falla libera el panel, devuelve la conversación y dice la causa real', () => {
      sim['chooseDecision'].mockReturnValue(throwError(() => http(400, 'Esta decisión ya fue registrada.')));
      const dialogue = decisionDialogue(11);
      component.dialogue.set(dialogue);
      const before = component.dialogueReleaseToken();

      component.executeDecision(11);
      jest.advanceTimersByTime(400);

      expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
      expect(component.actionError()).toBe('Esta decisión ya fue registrada.');
      expect(component.dialogueReleaseToken()).toBe(before + 1);
      expect(component.dialogue()).toBe(dialogue);
      expect(component.busy()).toBe(false);
      expect(component.fadeActive()).toBe(false);
    });

    it('un fallo sin mensaje del servidor usa el texto de respaldo', () => {
      sim['chooseDecision'].mockReturnValue(throwError(() => http(500)));
      component.dialogue.set(decisionDialogue(11));

      component.executeDecision(11);
      jest.advanceTimersByTime(400);

      expect(component.actionError()).toBe('No pudimos registrar tu decisión. Inténtalo de nuevo.');
    });

    it('un error que el interceptor ya comunicó (sin conexión) no duplica el aviso', () => {
      sim['chooseDecision'].mockReturnValue(throwError(() => http(0)));
      component.dialogue.set(decisionDialogue(11));
      const before = component.dialogueReleaseToken();

      component.executeDecision(11);
      jest.advanceTimersByTime(400);

      expect(component.actionError()).toBe('');
      expect(component.dialogueReleaseToken()).toBe(before + 1);
      expect(component.busy()).toBe(false);
    });
  });

  describe('usar una herramienta', () => {
    it('si el servidor falla libera el panel y dice la causa', () => {
      sim['useTool'].mockReturnValue(throwError(() => http(400, 'Esa herramienta no está en tu barra.')));
      component.selectedInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as MapObjectState);
      const before = component.dialogueReleaseToken();

      component.useTool('PAP');

      expect(sim['useTool']).toHaveBeenCalledWith('attempt-1', 'token-1', 'PAP', 'familia-crisis');
      expect(component.actionError()).toBe('Esa herramienta no está en tu barra.');
      expect(component.dialogueReleaseToken()).toBe(before + 1);
      expect(component.busy()).toBe(false);
    });

    it('sin mensaje del servidor usa el texto de respaldo', () => {
      sim['useTool'].mockReturnValue(throwError(() => http(500)));

      component.useTool('PAP');

      expect(component.actionError()).toBe('No pudimos usar la herramienta.');
    });

    it('con una petición en curso rechaza el uso sin dejar el panel bloqueado', () => {
      component.busy.set(true);
      const before = component.dialogueReleaseToken();

      component.useTool('PAP');

      expect(sim['useTool']).not.toHaveBeenCalled();
      expect(component.dialogueReleaseToken()).toBe(before + 1);
    });
  });

  describe('abrir una interacción', () => {
    const object = { key: 'familia-crisis', label: 'Familia', type: 'PERSON', x: 190, y: 420 } as MapObjectState;

    it('si el servidor falla suelta la selección, libera el panel y dice la causa', () => {
      sim['openInteraction'].mockReturnValue(throwError(() => http(400, 'Estás demasiado lejos de este objeto.')));
      const before = component.dialogueReleaseToken();

      component.openInteraction(object);

      expect(component.actionError()).toBe('Estás demasiado lejos de este objeto.');
      expect(component.selectedInteraction()).toBeNull();
      expect(component.dialogueReleaseToken()).toBe(before + 1);
      expect(component.busy()).toBe(false);
    });

    it('sin mensaje del servidor usa el texto de respaldo', () => {
      sim['openInteraction'].mockReturnValue(throwError(() => http(500)));

      component.openInteraction(object);

      expect(component.actionError()).toBe('No pudimos abrir la interacción.');
    });

    it('si falla el registro de la conversación con una persona dice cómo seguir', () => {
      sim['recordNpcInteraction'].mockReturnValue(throwError(() => http(500)));
      const npc = { key: 'enfermera-urgencias', displayName: 'Enfermera', dialogue: { lines: [{ text: 'Hola.' }] } } as NpcConfig;
      const before = component.dialogueReleaseToken();

      component.openNpcDialogue(npc);

      expect(component.actionError()).toBe(
        'No pudimos registrar la conversación. Acércate un poco más e inténtalo de nuevo.',
      );
      expect(component.dialogueReleaseToken()).toBe(before + 1);
      expect(component.busy()).toBe(false);
    });

    it('usa el mensaje del servidor cuando explica la distancia a una persona', () => {
      sim['recordNpcInteraction'].mockReturnValue(throwError(() => http(400, 'Estás demasiado lejos del NPC.')));
      const npc = { key: 'enfermera-urgencias', displayName: 'Enfermera', dialogue: { lines: [{ text: 'Hola.' }] } } as NpcConfig;

      component.openNpcDialogue(npc);

      expect(component.actionError()).toBe('Estás demasiado lejos del NPC.');
    });
  });
});
