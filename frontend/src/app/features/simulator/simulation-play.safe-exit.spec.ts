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

import { readFileSync } from 'fs';
import { join } from 'path';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { EMPTY } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { SimulationAttemptState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { SimulationPlayComponent } from './simulation-play.component';

/**
 * Correcciones de la revisión adversarial sobre la salida segura (REGLA-004 / ETH-02): el fundido de escena no
 * tapa el pie (F1), la pausa en cola tiene plazo (F2), Esc mantenido no encadena acciones (F5) y ningún aviso
 * queda encima de la pantalla de pausa (F7). Instancia + contratos de fuente (Jest no renderiza la plantilla).
 */

const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

/** Cuerpo de la primera regla cuyo selector es exactamente `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`No se encontró la regla ${selector}`);
  return match[2];
}

const zIndex = (selector: string): number => Number(/z-index:\s*(\d+)/.exec(rule(selector))?.[1]);

function makeAttempt(overrides: Record<string, unknown> = {}): SimulationAttemptState {
  return {
    attemptId: 'attempt-1', attemptToken: 'token-1', caseVersionId: 7, caseTitle: 'Caso demo', status: 'IN_PROGRESS',
    accumulatedScore: 0, stressIndex: 0, metrics: { victimRisk: 50 },
    currentNode: { id: 1, key: 'hospital-urgencias', title: 'Urgencias', narrative: 'N', terminal: false, options: [] },
    feedback: null, completionReport: null, ...overrides,
  } as unknown as SimulationAttemptState;
}

describe('SimulationPlayComponent: salida segura (correcciones de la revisión)', () => {
  let component: SimulationPlayComponent;
  let sim: Record<string, jest.Mock>;
  let audio: Record<string, jest.Mock>;

  beforeEach(() => {
    jest.useFakeTimers();
    sessionStorage.clear();
    sim = {
      getInterventionRules: jest.fn(() => EMPTY),
      getActiveAttempt: jest.fn(() => EMPTY),
      safeExit: jest.fn(() => EMPTY),
      updateWorldState: jest.fn(() => EMPTY),
      getWorld: jest.fn(() => EMPTY),
      getProgressMap: jest.fn(() => EMPTY),
    };
    audio = {
      init: jest.fn(), dispose: jest.fn(), stopIntroLament: jest.fn(), playIntroLament: jest.fn(), playSfx: jest.fn(),
      setStressLevel: jest.fn(), isMusicMuted: jest.fn(() => false), isSfxMuted: jest.fn(() => false),
    };
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        { provide: AudioDirectorService, useValue: audio },
        { provide: AuthService, useValue: {} },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: '7' }) } } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
    component.attempt.set(makeAttempt());
  });

  afterEach(() => {
    jest.useRealTimers();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('F1: el fundido de escena no tapa «Salida segura»', () => {
    it('el pie sube por encima del fundido mientras este espera al servidor', () => {
      expect(component.footerAboveVeils()).toBe(false);

      component.fadeActive.set(true);

      expect(component.footerAboveVeils()).toBe(true);
    });

    it('también sube por encima de la nota de transición (z 340), que cubre la pantalla con 92 % de negro', () => {
      component.transitionNote.set('Quince días después…');

      expect(component.footerAboveVeils()).toBe(true);
    });

    it('con una superposición abierta el pie es inerte y no sube: la superposición trae su propio botón', () => {
      component.fadeActive.set(true);
      component.dialogue.set({ key: 'd', lines: [], choices: [] } as never);

      expect(component.footerAboveVeils()).toBe(false);
    });

    it('la plantilla enlaza la clase y el pie sigue inerte con una superposición', () => {
      expect(source).toMatch(/<footer class="bottom-zone" \[class\.bottom-zone--above-veils\]="footerAboveVeils\(\)"\s*\[attr\.inert\]="inputBlocked\(\)/);
    });

    it('el z-index del pie elevado supera al fundido (200) y a la nota de transición (340), y no al aviso de pausa (420)', () => {
      expect(zIndex('.bottom-zone--above-veils')).toBeGreaterThan(zIndex('.scene-fade'));
      expect(zIndex('.bottom-zone--above-veils')).toBeGreaterThan(zIndex('.transition-note'));
      expect(zIndex('.bottom-zone--above-veils')).toBeLessThan(zIndex('.pausing-notice'));
    });

    it('el fundido sigue a pantalla completa y capturando punteros: el mundo y la cabecera no se tocan mientras dura', () => {
      expect(rule('.scene-fade')).toMatch(/position: fixed; inset: 0; z-index: 200;/);
      expect(rule('.scene-fade--active')).toContain('pointer-events: auto;');
    });
  });
});
