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
import { EMPTY, of } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { SimulationAttemptState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { SimulationPlayComponent } from './simulation-play.component';

/** Aviso del nodo sensible (ETH): el recordatorio que la franja bajo la cabecera muestra en todos los dispositivos. */
const WARNING = 'Este caso aborda violencia de género, tentativa de feminicidio y la muerte de una niña. Puedes usar la salida segura en cualquier momento.';

function attemptWith(node: Record<string, unknown>): SimulationAttemptState {
  return {
    attemptId: 'a1', attemptToken: 't1', caseVersionId: 7, status: 'IN_PROGRESS', stressIndex: 0,
    currentNode: { id: 1, key: 'hospital-urgencias', title: 'T', narrative: 'N', terminal: false, options: [], ...node },
  } as unknown as SimulationAttemptState;
}

describe('SimulationPlayComponent: aviso del nodo sensible', () => {
  let component: SimulationPlayComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: { getActiveAttempt: vi.fn(() => of(null)), getInterventionRules: vi.fn(() => EMPTY) } },
        { provide: AudioDirectorService, useValue: { init: vi.fn(), dispose: vi.fn(), stopIntroLament: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false) } },
        { provide: AuthService, useValue: {} },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: '7' }) } } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
  });

  afterEach(() => TestBed.resetTestingModule());

  it('sin intento no hay aviso', () => {
    expect(component.sensitiveNotice()).toBeNull();
  });

  it('un nodo sensible muestra la redacción del nodo sin cambiarla', () => {
    component.attempt.set(attemptWith({ sensitiveContent: true, warningMessage: WARNING }));

    expect(component.sensitiveNotice()).toBe(WARNING);
  });

  it('un nodo sin aviso ni salida segura obligatoria no muestra nada', () => {
    component.attempt.set(attemptWith({ sensitiveContent: false, warningMessage: null, safeExitRequired: false }));

    expect(component.sensitiveNotice()).toBeNull();
  });

  it('un nodo con salida segura obligatoria y sin texto propio usa la frase de respaldo, en español', () => {
    component.attempt.set(attemptWith({ warningMessage: null, safeExitRequired: true }));

    expect(component.sensitiveNotice()).toBe('Este momento permite salida segura: prioriza confidencialidad y rutas institucionales.');
  });

  it('el aviso cambia con el nodo: al pasar a una etapa sin aviso desaparece', () => {
    component.attempt.set(attemptWith({ warningMessage: WARNING }));
    expect(component.sensitiveNotice()).toBe(WARNING);

    component.attempt.set(attemptWith({ key: 'hospital-sala-escucha', warningMessage: null }));

    expect(component.sensitiveNotice()).toBeNull();
  });
});
