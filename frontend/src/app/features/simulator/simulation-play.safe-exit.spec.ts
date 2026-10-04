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
import { EMPTY, Subject, of } from 'rxjs';

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
      chooseDecision: jest.fn(() => EMPTY),
      startAttempt: jest.fn(() => EMPTY),
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
  describe('F2: la pausa en cola tiene plazo (petición colgada)', () => {
    const DEADLINE_MS = 10_000;
    const paused = () => makeAttempt({ status: 'PAUSED' });

    it('con una petición colgada la pausa NO sale antes del plazo y sale al cumplirse, una sola vez', () => {
      component.busy.set(true); // una petición que nunca responde

      component.pauseFromOverlay();
      TestBed.tick();
      jest.advanceTimersByTime(DEADLINE_MS - 1);

      expect(sim['safeExit']).not.toHaveBeenCalled();
      expect(component.pausingSlow()).toBe(false);

      jest.advanceTimersByTime(1);

      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
      expect(sim['safeExit']).toHaveBeenCalledWith('attempt-1', 'token-1', 'Salida segura solicitada');
      expect(component.pausingSlow()).toBe(true);
    });

    it('el aviso del plazo es visible (texto del pie de pausa) y se anuncia, en español', () => {
      component.busy.set(true);
      component.pauseFromOverlay();

      jest.advanceTimersByTime(DEADLINE_MS);
      jest.advanceTimersByTime(60); // el anuncio se emite 50 ms después

      expect(component.slowPauseNotice).toBe('La acción en curso está tardando. Estamos pausando el caso igualmente.');
      expect(component.a11yAnnouncement()).toBe(component.slowPauseNotice);
      expect(source).toContain("{{ pausingSlow() ? slowPauseNotice : 'Pausando el caso…' }}");
    });

    it('si la petición termina mucho después, su liberación de busy no repite la pausa', () => {
      component.busy.set(true);
      component.pauseFromOverlay();
      jest.advanceTimersByTime(DEADLINE_MS);
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);

      component.busy.set(false); // llega tarde la respuesta colgada
      TestBed.tick();
      TestBed.tick();

      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });

    it('si busy se libera antes del plazo la pausa sale por la cola y el plazo ya no la repite', () => {
      component.busy.set(true);
      component.pauseFromOverlay();
      jest.advanceTimersByTime(2_000);
      expect(sim['safeExit']).not.toHaveBeenCalled();

      component.busy.set(false);
      TestBed.tick();
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(60_000);

      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });

    it('al terminar la pausa se apagan el estado, el aviso de lentitud y el plazo', () => {
      sim['safeExit'].mockReturnValue(of(paused()));
      component.busy.set(true);
      component.pauseFromOverlay();

      jest.advanceTimersByTime(DEADLINE_MS);

      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.pausing()).toBe(false);
      expect(component.pausingSlow()).toBe(false);
      jest.advanceTimersByTime(60_000);
      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
    });

    it('si el servidor rechaza la pausa enviada por el plazo, sale el aviso de error y se puede volver a pedir', () => {
      const failing = new Subject<never>();
      sim['safeExit'].mockReturnValue(failing);
      component.busy.set(true);
      component.pauseFromOverlay();
      jest.advanceTimersByTime(DEADLINE_MS);

      failing.error(new Error('sin red'));

      expect(component.pausing()).toBe(false);
      expect(component.pausingSlow()).toBe(false);
      expect(component.actionError()).toBe('No pudimos registrar la salida segura.');
      expect(component.busy()).toBe(false);
    });

    it('si la sincronización de la posición queda colgada, el plazo envía la pausa sin esperarla', () => {
      // Hay una posición pendiente: `startQueuedPause` primero la guarda y esa petición nunca responde.
      (component as unknown as { lastPosition: { x: number; y: number } }).lastPosition = { x: 120, y: 340 };
      component.world.set({ map: { key: 'hospital-urgencias' }, objects: [], tools: [], inventory: [], flags: {} } as never);

      component.pauseFromOverlay();

      expect(sim['updateWorldState']).toHaveBeenCalledTimes(1);
      expect(sim['safeExit']).not.toHaveBeenCalled();

      jest.advanceTimersByTime(DEADLINE_MS);

      expect(sim['safeExit']).toHaveBeenCalledTimes(1);
      expect(component.pausingSlow()).toBe(true);
    });

    it('la respuesta tardía de una decisión no pisa el estado de una pausa ya registrada', () => {
      const decision = new Subject<SimulationAttemptState>();
      sim['chooseDecision'].mockReturnValue(decision);
      sim['safeExit'].mockReturnValue(of(paused()));
      component.attempt.set(makeAttempt({
        currentNode: { id: 1, key: 'hospital-urgencias', title: 'U', narrative: 'N', terminal: false, options: [{ id: 101, text: 'Opción' }] },
      }));

      component.executeDecision(101);
      jest.advanceTimersByTime(340); // el fundido y luego la petición, que se cuelga
      expect(sim['chooseDecision']).toHaveBeenCalledTimes(1);
      component.pauseFromOverlay();
      jest.advanceTimersByTime(DEADLINE_MS);
      expect(component.attempt()?.status).toBe('PAUSED');

      decision.next(makeAttempt({ status: 'IN_PROGRESS', accumulatedScore: 10 }));

      expect(component.attempt()?.status).toBe('PAUSED');
      expect(component.busy()).toBe(false);
      expect(component.fadeActive()).toBe(false);
    });

    it('un intento nuevo apaga el plazo pendiente', () => {
      component.busy.set(true);
      component.pauseFromOverlay();

      component.startNewAttempt();
      jest.advanceTimersByTime(60_000);

      expect(sim['safeExit']).not.toHaveBeenCalled();
      expect(component.pausing()).toBe(false);
    });

    it('el aviso del pie admite varias líneas sin salirse de la pantalla', () => {
      expect(rule('.pausing-notice')).toMatch(/width: max-content; max-width: min\(92vw, 520px\);/);
    });
  });
});

describe('F3: el aviso de reanudar conserva sus tres salidas en pantallas bajas (844x390)', () => {
  it('la capa se desplaza por dentro y la tarjeta se centra con margen automático: si no cabe, no queda inalcanzable por arriba', () => {
    expect(rule('.resume-overlay')).toMatch(/overflow-y: auto;/);
    expect(rule('.resume-overlay')).toMatch(/place-items: start center;/);
    expect(rule('.resume-card')).toMatch(/margin-block: auto;/);
    // `place-items: center` con contenido más alto que la capa recortaba la parte de arriba sin scroll posible.
    expect(rule('.resume-overlay')).not.toMatch(/place-items: center;/);
  });

  it('en pantallas bajas la tarjeta se compacta: más ancha, con menos relleno y las tres salidas en una fila', () => {
    const start = source.indexOf('@media (max-height: 520px) {\n      .resume-overlay');
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, source.indexOf('\n    }\n', start));
    expect(block).toMatch(/\.resume-card \{ width: min\(760px, 100%\); padding: 14px 20px; \}/);
    expect(block).toMatch(/\.resume-actions \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  });

  it('las tres salidas siguen en la plantilla: reanudar, iniciar uno nuevo y volver al catálogo', () => {
    expect(source).toMatch(/resumeAttempt\(\)[\s\S]*?startNewAttempt\(\)[\s\S]*?routerLink="\/portal\/simulador">Volver al catálogo/);
  });
});
