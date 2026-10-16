// Phaser inicializa un canvas WebGL al importarse, cosa que jsdom no soporta (mismo doble que el resto
// de specs de la pantalla de juego): solo se evalúa `extends Phaser.Scene` al cargar el módulo.
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

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { EMPTY } from 'rxjs';
import { readFileSync } from 'fs';
import { join } from 'path';

import { LIVE_WRITE_DELAY_MS, LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { SimulationAttemptState } from '../../core/models/simulation.model';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { AvatarStore } from '../character/avatar.store';
import { KitService } from '../character/kit/kit.service';
import { fakeKitService } from '../character/kit/testing/kit-testing';
import { AudioDirectorService } from './audio-director.service';
import { CONSENT_RECORDER } from './consent-recorder';
import { DRAFT_COPY } from './draft-copy';
import { SimulationPlayComponent } from './simulation-play.component';

/**
 * Las cuatro entradas del juego (plan visual F6-2): reanudar, consentimiento, introducción y contexto comparten
 * estructura, movimiento y comportamiento modal; el consentimiento pasa por un registro con estados (ETH-01: un
 * almacenamiento que falla NUNCA lo da por registrado y no arranca mundo, HUD ni audio); «Iniciar nuevo intento» pide
 * confirmar lo que se pierde (RN-07); el aviso de alcance va fuera del texto validado (RN-01). Los textos validados
 * por Psicología no cambian ni un byte. Pruebas síncronas (el archivo lleva `vi.mock`): los registros y diálogos de
 * prueba son «promesas» que se resuelven a mano y llaman a su continuación en el acto.
 */
const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

const CASE_VERSION_ID = 7;

const ATTEMPT = {
  attemptId: 'attempt-1', attemptToken: 'token-1', caseVersionId: CASE_VERSION_ID, caseTitle: 'Violencia Familiar',
  status: 'IN_PROGRESS', accumulatedScore: 12, stressIndex: 30, metrics: { victimRisk: 50 },
  currentNode: { id: 1, key: 'hospital-urgencias', title: 'Urgencias: crisis y contención', narrative: 'N', terminal: false, options: [] },
  feedback: null, completionReport: null,
} as unknown as SimulationAttemptState;

// Cadenas validadas (copiadas del juego tal como estaban antes de F6-2): la comparación es byte a byte.
const FROZEN = {
  resume: {
    eyebrow: 'Intento en progreso',
    title: 'Continuar simulación formativa',
    body: 'Ya tienes un intento activo en Violencia Familiar. Puedes retomarlo desde Urgencias: crisis y contención o iniciar uno nuevo.',
    metrics: ['Puntaje: 12', 'Estrés: 30%', 'Riesgo: 50%'],
    actions: ['Volver al catálogo', 'Iniciar nuevo intento', 'Continuar intento en progreso'],
  },
  consent: {
    eyebrow: 'Aviso de contenido',
    title: 'Antes de entrar al caso',
    chip: 'Simulación formativa con datos ficticios',
    paragraphs: [
      'Este caso presenta una situación ficticia de violencia basada en género y crisis familiar. Algunas escenas incluyen relatos y decisiones emocionalmente exigentes.',
      'Podrás pausar el caso en cualquier momento con el botón «Salida segura» (con teclado, también Esc). Tu avance se guarda y puedes retomarlo. Si prefieres no continuar ahora, vuelve al catálogo y retoma el caso cuando lo decidas.',
    ],
    actions: ['Volver al catálogo', 'Continuar'],
  },
  intro: { eyebrow: 'Introducción', title: 'Antes de comenzar', toggle: 'Silenciar música', actions: ['Salida segura', 'Continuar'] },
  context: {
    eyebrow: 'Primera escena',
    title: 'Contexto inicial del caso',
    paragraphs: [
      'Son las 11 de la noche en un barrio con altas condiciones de vulnerabilidad: pobreza, violencias urbanas, robos, expendio de drogas, presencia de grupos armados ilegales y riñas callejeras entre vecinos.',
      'Un hombre de aproximadamente 28 años entra a su domicilio, donde reside con su pareja actual, una mujer de 22 años. Ella tiene una hija de 3 años.',
      'En horas de la tarde, el hombre había tenido un altercado verbal con su pareja. Hubo groserías, maltrato psicológico y chantaje emocional: le dijo que sin él no era nadie, que era una mujer mantenida y que estaba seguro de que ella le era infiel.',
      'Esa noche, cuando él entra a la residencia, la mujer le reclama por llegar tarde y haberse perdido toda la tarde.',
      'El hombre, sin mediar palabra, saca una navaja y hiere a la niña de 3 años, causándole la muerte de manera inmediata. Luego hiere a la mujer con 28 heridas de arma cortopunzante, dejándola gravemente herida.',
      'Tu intervención inicia en urgencias. Lee el contexto con cuidado: cada conversación, herramienta y decisión puede cambiar el curso de la atención.',
    ],
    hint: 'Lee el contexto completo antes de iniciar la intervención.',
  },
} as const;

/** «Promesa» de prueba: la continuación corre en el acto al resolverla (sin microtareas). */
interface Deferred<T> extends PromiseLike<T> {
  resolve(value: T): void;
  reject(reason: Error): void;
}
function deferred<T = void>(): Deferred<T> {
  let onOk: ((value: T) => unknown) | undefined;
  let onFail: ((reason: Error) => unknown) | undefined;
  return {
    then(ok?: ((value: T) => unknown) | null, fail?: ((reason: Error) => unknown) | null) {
      onOk = ok ?? undefined;
      onFail = fail ?? undefined;
      return undefined as never;
    },
    resolve: value => { onOk?.(value); },
    reject: reason => { onFail?.(reason); },
  };
}

describe('SimulationPlayComponent: las cuatro entradas (F6-2)', () => {
  let fixture: ComponentFixture<SimulationPlayComponent>;
  let component: SimulationPlayComponent;
  let audio: Record<string, ReturnType<typeof vi.fn>>;
  let record: ReturnType<typeof vi.fn>;
  let consequence: ReturnType<typeof vi.fn>;
  let recordings: Array<Deferred<void>>;
  let consequences: Array<Deferred<'continue' | 'proceed'>>;
  const root = () => fixture.nativeElement as HTMLElement;
  const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const overlay = () => root().querySelector<HTMLElement>('.case-intro-overlay');
  /** Texto visible para la persona usuaria: sin iconos ni pistas de tecla (`aria-hidden`), como el nombre accesible. */
  const visibleText = (element: HTMLElement) => {
    const copy = element.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[aria-hidden="true"]').forEach(hidden => hidden.remove());
    return text(copy);
  };
  const buttonsOf = (scope: ParentNode) =>
    Array.from(scope.querySelectorAll<HTMLElement>('button, a')).map(element => visibleText(element));
  const region = (politeness: 'polite' | 'assertive') =>
    document.querySelector<HTMLElement>(`[data-live-region="${politeness}"]`)!;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    sessionStorage.clear();
    recordings = [];
    consequences = [];
    record = vi.fn(() => { const next = deferred<void>(); recordings.push(next); return next; });
    consequence = vi.fn(() => { const next = deferred<'continue' | 'proceed'>(); consequences.push(next); return next; });
    const sim = {
      getActiveAttempt: vi.fn(() => EMPTY),
      getProgressMap: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => EMPTY),
      safeExit: vi.fn(() => EMPTY),
      startAttempt: vi.fn(() => EMPTY),
    };
    audio = {
      init: vi.fn(), setStressLevel: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false),
      dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        { provide: AudioDirectorService, useValue: audio },
        { provide: AuthService, useValue: {} },
        { provide: KitService, useValue: fakeKitService() },
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
        { provide: UiDialog, useValue: { consequence } },
        { provide: CONSENT_RECORDER, useValue: { isGiven: () => false, record } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: String(CASE_VERSION_ID) }) } } },
      ],
    });
    TestBed.inject(LiveRegionAnnouncer);
    fixture = TestBed.createComponent(SimulationPlayComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  function showResume(): void {
    component.pendingActiveAttempt.set(ATTEMPT);
    component.showResumePrompt.set(true);
    component.loading.set(false);
    fixture.detectChanges();
  }

  function showConsent(): void {
    component.attempt.set(ATTEMPT);
    component.loading.set(false);
    component.showContentWarning.set(true);
    fixture.detectChanges();
  }

  describe('una sola forma para las cuatro', () => {
    // req: BLOQUE-H, RNF-04, REGLA-004
    it('reanudar, consentimiento, introducción y contexto comparten estructura y son modales', () => {
      showResume();
      const entries: Array<[string, () => void]> = [
        ['reanudar', () => undefined],
        ['consentimiento', () => { component.showResumePrompt.set(false); component.showContentWarning.set(true); }],
        ['introducción', () => { component.showContentWarning.set(false); component.worldStarted.set(true); component.showIntroScene.set(true); }],
        ['contexto', () => { component.showIntroScene.set(false); component.showCaseIntro.set(true); }],
      ];
      for (const [name, show] of entries) {
        show();
        component.attempt.set(ATTEMPT);
        fixture.detectChanges();
        const dialog = overlay()!;
        expect(dialog, name).not.toBeNull();
        expect(dialog.getAttribute('role'), name).toBe('dialog');
        expect(dialog.getAttribute('aria-modal'), name).toBe('true');
        expect(dialog.querySelector('article.case-intro-card'), name).not.toBeNull();
        expect(dialog.querySelector('.case-intro-card__header h2'), name).not.toBeNull();
        expect(dialog.querySelector('.case-intro-card__actions'), name).not.toBeNull();
        expect(dialog.getAttribute('aria-labelledby'), name).toBe(dialog.querySelector('h2')!.id);
        expect(root().querySelectorAll('.case-intro-overlay').length, `${name}: una sola entrada a la vez`).toBe(1);
      }
      expect(root().innerHTML).not.toMatch(/resume-(overlay|card|metrics|actions)/);
    });

    it('entran con el mismo movimiento (fundido y ascenso por tokens; con movimiento reducido, solo fundido)', () => {
      expect(source).not.toMatch(/\.resume-(overlay|card|metrics|actions)/);
      expect(source).toMatch(/\.case-intro-overlay \{[^}]*animation: case-intro-fade var\(--ds-dur-fade\) var\(--ds-ease-out\) both;/);
      expect(source).toMatch(/\.case-intro-card \{[^}]*animation: case-intro-rise var\(--ds-dur-base\) var\(--ds-ease-out\) both;/);
      expect(source).toMatch(/@keyframes case-intro-rise \{[^}]*translateY\(var\(--ds-space-3\)\)/);
      expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.case-intro-card \{ animation-name: case-intro-fade; \}/);
    });
  });

  describe('textos validados: idénticos byte a byte', () => {
    it('reanudar', () => {
      showResume();
      const dialog = overlay()!;
      expect(text(dialog.querySelector('.psy-eyebrow'))).toBe(FROZEN.resume.eyebrow);
      expect(text(dialog.querySelector('h2'))).toBe(FROZEN.resume.title);
      expect(text(dialog.querySelector('.case-intro-card__body > p'))).toBe(FROZEN.resume.body);
      expect(Array.from(dialog.querySelectorAll('.case-intro-card__metrics span')).map(span => text(span)))
        .toEqual([...FROZEN.resume.metrics]);
      expect(buttonsOf(dialog.querySelector('.case-intro-card__actions')!)).toEqual([...FROZEN.resume.actions]);
    });

    it('consentimiento', () => {
      showConsent();
      const dialog = overlay()!;
      expect(text(dialog.querySelector('.psy-eyebrow'))).toBe(FROZEN.consent.eyebrow);
      expect(text(dialog.querySelector('h2'))).toBe(FROZEN.consent.title);
      expect(text(dialog.querySelector('.case-intro-card__chip'))).toBe(FROZEN.consent.chip);
      expect(Array.from(dialog.querySelectorAll('#content-warning-body p')).map(p => text(p)))
        .toEqual([...FROZEN.consent.paragraphs]);
      expect(buttonsOf(dialog.querySelector('.case-intro-card__actions')!)).toEqual([...FROZEN.consent.actions]);
    });

    it('introducción y contexto', () => {
      component.attempt.set(ATTEMPT);
      component.worldStarted.set(true);
      component.loading.set(false);
      component.showIntroScene.set(true);
      fixture.detectChanges();
      let dialog = overlay()!;
      expect(text(dialog.querySelector('.psy-eyebrow'))).toBe(FROZEN.intro.eyebrow);
      expect(text(dialog.querySelector('h2'))).toBe(FROZEN.intro.title);
      expect(text(dialog.querySelector('.intro-music-toggle span'))).toBe(FROZEN.intro.toggle);
      expect(buttonsOf(dialog.querySelector('.case-intro-card__buttons')!)).toEqual([...FROZEN.intro.actions]);

      component.showIntroScene.set(false);
      component.showCaseIntro.set(true);
      fixture.detectChanges();
      dialog = overlay()!;
      expect(text(dialog.querySelector('.psy-eyebrow'))).toBe(FROZEN.context.eyebrow);
      expect(text(dialog.querySelector('h2'))).toBe(FROZEN.context.title);
      expect(Array.from(dialog.querySelectorAll('.case-intro-card__body p')).map(p => text(p)))
        .toEqual([...FROZEN.context.paragraphs]);
      expect(text(dialog.querySelector('.case-intro-card__actions > span'))).toBe(FROZEN.context.hint);
    });
  });

  describe('consentimiento con estados (ETH-01)', () => {
    // req: ETH-01, SIEP-RF-05, BLOQUE-H
    const continueButton = () => Array.from(root().querySelectorAll<HTMLButtonElement>('.case-intro-card__actions button'))
      .find(candidate => text(candidate) === 'Continuar')!;
    const clickContinue = () => {
      const button = continueButton();
      button.click();
      fixture.detectChanges();
      return button;
    };

    it('guardando: el botón muestra su estado, no se envía dos veces y se anuncia; el mundo no arranca', () => {
      showConsent();
      const button = clickContinue();

      expect(record).toHaveBeenCalledTimes(1);
      expect(button.getAttribute('aria-busy')).toBe('true');
      expect(component.worldStarted()).toBe(false);
      expect(audio['init']).not.toHaveBeenCalled();
      expect(root().querySelector('app-simulation-hud')).toBeNull();
      expect(root().querySelector('app-game-world')).toBeNull();

      button.click(); // doble envío: el registro no se repite
      fixture.detectChanges();
      expect(record).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
      expect(region('polite').textContent).toBe('Registrando tu consentimiento…');
      expect(buttonsOf(overlay()!)).toContain('Volver al catálogo');
    });

    it('registrado: se anuncia y RECIÉN entonces arranca el mundo (audio incluido)', () => {
      showConsent();
      clickContinue();
      expect(audio['init']).not.toHaveBeenCalled();

      recordings[0].resolve();
      fixture.detectChanges();

      expect(component.showContentWarning()).toBe(false);
      expect(component.worldStarted()).toBe(true);
      expect(audio['init']).toHaveBeenCalledTimes(1);
    });

    it('si el almacenamiento falla: error con «Reintentar», sin mundo, HUD ni audio, y «Volver al catálogo» operable', () => {
      showConsent();
      clickContinue();

      recordings[0].reject(new Error('almacenamiento bloqueado'));
      fixture.detectChanges();

      expect(component.worldStarted()).toBe(false);
      expect(component.showContentWarning()).toBe(true);
      expect(audio['init']).not.toHaveBeenCalled();
      expect(root().querySelector('app-simulation-hud')).toBeNull();
      const error = overlay()!.querySelector('.consent-error')!;
      expect(error).not.toBeNull();
      expect(buttonsOf(error)).toContain('Reintentar');
      const back = Array.from(overlay()!.querySelectorAll<HTMLElement>('.case-intro-card__actions button, .case-intro-card__actions a'))
        .find(candidate => text(candidate) === 'Volver al catálogo')!;
      expect(back.getAttribute('aria-disabled')).toBeNull();
      // Lo que falló es el navegador, no el contenido: se anuncia con firmeza (assertive) y dice cómo seguir.
      vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
      expect(region('assertive').textContent).toBe(DRAFT_COPY.consentStorageError.text);
    });

    // req: ETH-01 (revisión de F6: con un registro en servidor la respuesta puede llegar tarde)
    it('«Volver al catálogo» mientras se registra: al cumplirse el registro no arranca ni mundo ni audio', () => {
      showConsent();
      clickContinue();
      component.declineContentWarning();

      recordings[0].resolve();
      fixture.detectChanges();

      expect(component.showContentWarning()).toBe(false);
      expect(component.worldStarted()).toBe(false);
      expect(audio['init']).not.toHaveBeenCalled();
    });

    it('«Reintentar» vuelve a registrar y, si sale bien, arranca el mundo', () => {
      showConsent();
      clickContinue();
      recordings[0].reject(new Error('almacenamiento bloqueado'));
      fixture.detectChanges();

      const retry = Array.from(overlay()!.querySelectorAll<HTMLButtonElement>('.consent-error button'))
        .find(candidate => text(candidate) === 'Reintentar')!;
      retry.click();
      fixture.detectChanges();
      expect(record).toHaveBeenCalledTimes(2);
      expect(audio['init']).not.toHaveBeenCalled();

      recordings[1].resolve();
      fixture.detectChanges();
      expect(component.worldStarted()).toBe(true);
    });

    it('Esc no cierra el aviso, no pausa y no pide la salida segura', () => {
      showConsent();
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
      component.handleGlobalInteraction(event);
      expect(event.defaultPrevented).toBe(true);
      expect(component.showContentWarning()).toBe(true);
      expect(component.pausing()).toBe(false);
    });
  });

  describe('«Iniciar nuevo intento» confirma lo que se pierde (RN-07)', () => {
    // req: RN-07, BLOQUE-H
    const startFresh = () => Array.from(overlay()!.querySelectorAll<HTMLButtonElement>('button'))
      .find(candidate => text(candidate) === 'Iniciar nuevo intento')!;

    it('abre la consecuencia con su texto en borrador y NO inicia el intento hasta confirmar', () => {
      showResume();
      const startNew = vi.spyOn(component, 'startNewAttempt');
      startFresh().click();

      expect(consequence).toHaveBeenCalledTimes(1);
      expect(consequence.mock.calls[0][0]).toMatchObject({
        title: DRAFT_COPY.newAttemptConsequence.title,
        consequence: DRAFT_COPY.newAttemptConsequence.text,
        continueLabel: 'Continuar',
        proceedLabel: 'Iniciar nuevo intento',
      });
      expect(startNew).not.toHaveBeenCalled();
    });

    it('«Continuar» (o Esc) conserva el intento abierto; solo «Iniciar nuevo intento» lo reemplaza', () => {
      showResume();
      const startNew = vi.spyOn(component, 'startNewAttempt').mockImplementation(() => undefined);

      startFresh().click();
      consequences[0].resolve('continue');
      expect(startNew).not.toHaveBeenCalled();
      expect(component.showResumePrompt()).toBe(true);

      startFresh().click();
      consequences[1].resolve('proceed');
      expect(startNew).toHaveBeenCalledTimes(1);
    });
  });

  describe('aviso de alcance (RN-01, borrador)', () => {
    // req: RN-01, VD-23
    it('va en el aviso previo, FUERA del texto validado que lee aria-describedby', () => {
      showConsent();
      const notice = overlay()!.querySelector('ui-scope-notice');
      expect(notice).not.toBeNull();
      const body = overlay()!.querySelector('#content-warning-body')!;
      expect(body.contains(notice)).toBe(false);
      expect(overlay()!.getAttribute('aria-describedby')).toBe('content-warning-body');
    });
  });
});
