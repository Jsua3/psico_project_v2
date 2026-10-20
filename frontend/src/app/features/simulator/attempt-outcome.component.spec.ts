import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { provideRouter } from '@angular/router';
import { AttemptOutcomeComponent } from './attempt-outcome.component';
import { AttemptCompletionReport } from '../../core/models/simulation.model';
import { KitFigureComponent } from '../character/kit/kit-figure.component';
import { AvatarStore } from '../character/avatar.store';
import { KitService } from '../character/kit/kit.service';
import { fakeKitService } from '../character/kit/testing/kit-testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { SimulationService } from '../../core/api/simulation.service';
import { DecisionReviewItem } from '../../core/models/simulation.model';
import { RECONSIDERED_LABEL } from './reconsidered.util';

/** El único servicio que la pantalla de resultado llama: «Tus decisiones» lee el reporte congelado del dueño (C2). */
const simulation = { studentReport: vi.fn() };

function makeReport(overrides: Partial<AttemptCompletionReport> = {}): AttemptCompletionReport {
  return {
    attemptId: 'a1',
    caseTitle: 'Caso',
    status: 'COMPLETED',
    finalScore: 42,
    finalStress: 30,
    metrics: {
      professionalScore: 0, sceneStress: 0, victimRisk: 0, userTrust: 0,
      institutionalRouteActivated: false, revictimizationRisk: false,
    },
    totalDurationSeconds: 125,
    phaseDurations: [],
    adequateDecisions: 3,
    riskyDecisions: 1,
    inadequateDecisions: 0,
    prohibitedDecisions: 0,
    toolsUsed: 2,
    reflectionsCount: 1,
    safeExitUsed: false,
    visitedNodeTitles: ['Escena 1', 'Escena 2'],
    competencies: ['Escucha activa'],
    recommendations: ['Sigue así'],
    summaryMessage: 'Buen trabajo',
    ...overrides,
  };
}

// Plain ts-jest (no jest-preset-angular) cannot wire signal inputs / render
// templates in TestBed, so — like the other simulator specs — we exercise the
// component's pure presentation helpers. `TestBed.createComponent` is only used
// to get an instance inside an injection context (the component injects AvatarStore).
// Template rendering is covered by `ng build` type-checking + manual smoke.
describe('AttemptOutcomeComponent', () => {
  let component: AttemptOutcomeComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AttemptOutcomeComponent],
      // `new AvatarStore()` sidesteps JIT reflection of its optional `Storage`
      // constructor param (NG0202 in ts-jest); it falls back to jsdom localStorage.
      providers: [
        provideRouter([]),
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
        { provide: KitService, useValue: fakeKitService() },
        { provide: SimulationService, useValue: simulation },
      ],
    });
    component = TestBed.createComponent(AttemptOutcomeComponent).componentInstance;
  });

  it('el encabezado muestra al jugador con el retrato neutral de su receta del kit', () => {
    const visual = component.playerVisual();
    expect(visual?.recipeId).toBe('valentina');
    expect(visual?.portraits.neutral).toEqual({ kind: 'url', url: '/assets/characters/kit/valentina/portrait-neutral.png' });
  });

  it('al crearse pide el kit: sin él el jugador del encabezado no se dibuja', () => {
    TestBed.resetTestingModule();
    const kit = fakeKitService();
    const load = vi.spyOn(kit, 'load');
    TestBed.configureTestingModule({
      imports: [AttemptOutcomeComponent],
      providers: [
        provideRouter([]),
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
        { provide: KitService, useValue: kit },
        { provide: SimulationService, useValue: simulation },
      ],
    });
    TestBed.createComponent(AttemptOutcomeComponent);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('la pausa habla de reanudar y el cierre terminal no finge pausa (ETH-02 A)', () => {
    expect(component.eyebrow('PAUSED')).toBe('Pausa segura activa');
    expect(component.headline('PAUSED')).toContain('retomarlo');
    expect(component.eyebrow('SAFE_EXITED')).toBe('Salida segura registrada');
    expect(component.headline('SAFE_EXITED')).toContain('cerrado');
    expect(component.headline('SAFE_EXITED')).not.toMatch(/pausa/i);
    expect(component.eyebrow('COMPLETED')).toBe('¡Simulación completada!');
  });

  it('el intento reemplazado no se presenta como salida segura', () => {
    expect(component.eyebrow('REPLACED')).toBe('Intento reemplazado');
    expect(component.headline('REPLACED')).toContain('nuevo');
    expect(component.headline('REPLACED')).not.toMatch(/salida segura|sin penalización/i);
  });

  it('perf labels performance from the report adequacy ratio', () => {
    expect(component.perf(makeReport({ adequateDecisions: 5, riskyDecisions: 0, inadequateDecisions: 0 }))).toBe('Excelente');
    expect(component.perf(makeReport({ adequateDecisions: 0, riskyDecisions: 0, inadequateDecisions: 0 }))).toBe('Sin decisiones');
  });

  it('barPct returns rounded percentages and 0 when there are no decisions', () => {
    expect(component.barPct(makeReport({ adequateDecisions: 3, riskyDecisions: 1, inadequateDecisions: 0 }), 3)).toBe(75);
    expect(component.barPct(makeReport({ adequateDecisions: 0, riskyDecisions: 0, inadequateDecisions: 0 }), 0)).toBe(0);
  });

  it('formatDuration renders minutes and seconds, or a fallback when unknown', () => {
    expect(component.formatDuration(125)).toBe('2 min 5 s');
    expect(component.formatDuration(40)).toBe('40 s');
    expect(component.formatDuration(null)).toBe('No disponible');
  });

  it('timelineTone: prohibida pisa la clasificación; sin clasificación = evento', () => {
    const base = { atSeconds: 10, time: '00:10', type: 'DECISION_SELECTED', label: 'x', scoreDelta: 5, stressDelta: -2 };
    expect(component.timelineTone({ ...base, classification: 'ADEQUATE', prohibited: false })).toBe('ADEQUATE');
    expect(component.timelineTone({ ...base, classification: 'INADEQUATE', prohibited: true })).toBe('PROHIBITED');
    expect(component.timelineTone({ ...base, type: 'ROOM_ENTERED', classification: null, prohibited: false })).toBe('EVENT');
  });

  it('el reporte acepta una línea de tiempo opcional (contrato aditivo)', () => {
    const report = makeReport({
      timeline: [{
        atSeconds: 135, time: '02:15', type: 'DECISION_SELECTED',
        classification: 'ADEQUATE', prohibited: false,
        label: 'Aplicar Primeros Auxilios Psicológicos', scoreDelta: 120, stressDelta: -10,
      }],
    });
    expect(report.timeline![0].time).toBe('02:15');
    expect(makeReport().timeline).toBeUndefined();
  });
});

type InputSignalNodeLike<T> = {
  applyValueToInputSignal(node: InputSignalNodeLike<T>, value: T): void;
};

function writeInputSignal<T>(inputSignal: () => T, value: T): void {
  const carrier = inputSignal as unknown as { [key: symbol]: InputSignalNodeLike<T> };
  const node = Object.getOwnPropertySymbols(inputSignal)
    .map(symbol => carrier[symbol])
    .find(candidate => typeof candidate?.applyValueToInputSignal === 'function');
  if (!node) throw new Error('No se encontró el nodo interno del input signal');
  node.applyValueToInputSignal(node, value);
}

const source = readFileSync(join(__dirname, 'attempt-outcome.component.ts'), 'utf-8');

/** La figura real exige entradas `input.required` que el TestBed no registra: se sustituye por un doble. */
@Component({ selector: 'app-kit-figure', standalone: true, changeDetection: ChangeDetectionStrategy.Eager,
 template: '' })
class KitFigureStubComponent {
  @Input() visual: unknown;
  @Input() portrait: unknown;
  @Input() scale: unknown;
}

describe('AttemptOutcomeComponent: pausa calmada renderizada (T12.1, AC-7)', () => {
  let fixture: ComponentFixture<AttemptOutcomeComponent>;
  let component: AttemptOutcomeComponent;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  function render(status: 'PAUSED' | 'COMPLETED' | 'SAFE_EXITED' | 'REPLACED' | 'IN_PROGRESS', options: { report?: AttemptCompletionReport | null; resources?: string[] } = {}): void {
    TestBed.configureTestingModule({
      imports: [AttemptOutcomeComponent],
      providers: [
        provideRouter([]),
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
        { provide: KitService, useValue: fakeKitService() },
        { provide: SimulationService, useValue: simulation },
      ],
    });
    TestBed.overrideComponent(AttemptOutcomeComponent, {
      remove: { imports: [KitFigureComponent] },
      add: { imports: [KitFigureStubComponent] },
    });
    fixture = TestBed.createComponent(AttemptOutcomeComponent);
    component = fixture.componentInstance;
    writeInputSignal(component.status, status);
    writeInputSignal(component.report, options.report === undefined ? makeReport({ status: status as AttemptCompletionReport['status'] }) : options.report);
    if (options.resources) writeInputSignal(component.supportResources, options.resources);
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('el título es «Tu caso está en pausa», dentro de un alertdialog nombrado por él', () => {
    render('PAUSED', { report: makeReport({ summaryMessage: 'Buen trabajo' }) });
    const dialog = host().querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-labelledby')).toBe('outcome-title');
    const title = host().querySelector('#outcome-title');
    expect(text(title)).toBe('Tu caso está en pausa');
    expect(text(title)).toMatch(/pausa/i);
    // El resumen del servidor no pisa el título de la pausa.
    expect(host().textContent).not.toContain('Buen trabajo');
  });

  it('muestra el texto tranquilizador exacto y ninguna clave interna', () => {
    render('PAUSED');
    expect(text(host().querySelector('.oc-pause-copy')))
      .toBe('Tu avance quedó guardado exactamente donde estabas. No hay penalización: puedes retomarlo cuando quieras.');
  });

  it('«Reanudar este intento» es la primera acción y «Volver al catálogo» la segunda', () => {
    render('PAUSED');
    const actions = Array.from(host().querySelectorAll('button, a')).filter(el => !el.closest('details'));
    expect(text(actions[0])).toBe('Reanudar este intento');
    expect(actions[0].tagName).toBe('BUTTON');
    expect(text(actions[1])).toBe('Volver al catálogo');
    expect(actions).toHaveLength(2);
  });

  it('«Reanudar este intento» emite resume y es el elemento con foco inicial', () => {
    render('PAUSED');
    const resume = vi.fn();
    component.resume.subscribe(resume);
    const button = host().querySelector('button.oc-btn--go') as HTMLButtonElement;
    expect(button.hasAttribute('cdkFocusInitial')).toBe(true);
    button.click();
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('la pausa captura el foco: el elemento activo es «Reanudar este intento»', async () => {
    render('PAUSED');
    await fixture.whenStable();
    expect(document.activeElement).toBe(host().querySelector('button.oc-btn--go'));
  });

  it('«Puntaje total» solo aparece dentro del details cerrado «Ver mi seguimiento»', () => {
    render('PAUSED');
    const details = host().querySelector('details') as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(text(details.querySelector('summary'))).toBe('Ver mi seguimiento');
    expect(text(details)).toContain('Puntaje total');
    const outside = Array.from(host().querySelectorAll('section > :not(details)')).map(el => el.textContent).join(' ');
    expect(outside).not.toContain('Puntaje total');
  });

  it('las acciones van antes que los recursos y que el tablero (visibles sin desplazarse)', () => {
    render('PAUSED', { resources: ['Línea 155 de orientación'] });
    const order = Array.from(host().querySelectorAll('.oc-pause-copy, .oc-actions--pause, .oc-support, details')).map(el => el.className || el.tagName);
    expect(order).toEqual(['oc-pause-copy', 'oc-actions oc-actions--pause', 'oc-block oc-support', 'oc-details']);
    expect(source).toMatch(/\.oc-actions--pause \{ justify-content: flex-start; margin-top: 0;/);
  });

  it('los recursos de apoyo solo se muestran si el intento los trae', () => {
    render('PAUSED', { resources: ['Línea 155 de orientación', 'Comisaría de Familia'] });
    expect(Array.from(host().querySelectorAll('.oc-support li')).map(li => text(li)))
      .toEqual(['Línea 155 de orientación', 'Comisaría de Familia']);
    fixture.destroy();
    TestBed.resetTestingModule();
    render('PAUSED');
    expect(host().querySelector('.oc-support')).toBeNull();
  });

  it('sin informe no hay details y la pausa sigue ofreciendo reanudar', () => {
    render('PAUSED', { report: null });
    expect(host().querySelector('details')).toBeNull();
    expect(text(host().querySelector('button.oc-btn--go'))).toBe('Reanudar este intento');
  });

  it('el resto de estados conserva su tablero y sus acciones', () => {
    render('COMPLETED');
    expect(host().querySelector('details')).toBeNull();
    expect(host().textContent).toContain('Puntaje total');
    expect(Array.from(host().querySelectorAll('footer button, footer a')).map(el => text(el)))
      .toEqual(['Reintentar caso', 'Volver al simulador', 'Volver al portal']);
    expect(host().querySelector('[role="alertdialog"]')?.classList).not.toContain('outcome--pause');
    fixture.destroy();
    TestBed.resetTestingModule();
    render('SAFE_EXITED');
    expect(Array.from(host().querySelectorAll('footer button, footer a')).map(el => text(el)))
      .toEqual(['Iniciar un nuevo intento', 'Volver al catálogo', 'Volver al portal']);
    fixture.destroy();
    TestBed.resetTestingModule();
    render('REPLACED');
    expect(Array.from(host().querySelectorAll('footer button, footer a')).map(el => text(el)))
      .toEqual(['Volver al catálogo', 'Volver al portal']);
  });

  it('con el intento en curso no se pinta nada', () => {
    render('IN_PROGRESS');
    expect(host().querySelector('section')).toBeNull();
  });

  // F6-6 (H-05, WCAG 4.1.3 y 2.4.3; RN-01 en borrador): el resultado es un diálogo modal de verdad.
  describe('resultado accesible (F6-6)', () => {
    // req: BLOQUE-H (H-05), REGLA-004, RNF-04
    it('es modal en todos los estados: aria-modal y trampa de foco (no solo en la pausa)', async () => {
      for (const status of ['COMPLETED', 'SAFE_EXITED', 'REPLACED', 'PAUSED'] as const) {
        render(status);
        await fixture.whenStable();
        const dialog = host().querySelector('[role="alertdialog"]') as HTMLElement;
        expect(dialog.getAttribute('aria-modal'), status).toBe('true');
        expect(host().querySelectorAll('.cdk-focus-trap-anchor').length, `${status}: trampa de foco`).toBe(2);
        fixture.destroy();
        TestBed.resetTestingModule();
      }
    });

    it('el foco inicial va al título (que lleva tabindex −1) cuando el intento terminó', async () => {
      render('COMPLETED');
      await fixture.whenStable();
      const title = host().querySelector('#outcome-title') as HTMLElement;
      expect(title.getAttribute('tabindex')).toBe('-1');
      expect(document.activeElement).toBe(title);
      // Nunca a un botón: un Enter mantenido al cerrar la supervisión activaría «Reintentar caso».
      expect((document.activeElement as HTMLElement).tagName).not.toBe('BUTTON');
    });

    it('en pausa el foco sigue en «Reanudar este intento»: lo primero es poder volver', async () => {
      render('PAUSED');
      await fixture.whenStable();
      expect(document.activeElement).toBe(host().querySelector('button.oc-btn--go'));
    });

    it('al reanudar el foco vuelve a donde estaba antes de la pausa, y si ese elemento ya no está, al juego', async () => {
      const before = document.createElement('button');
      before.textContent = 'Salida segura';
      document.body.appendChild(before);
      before.focus();
      render('PAUSED');
      await fixture.whenStable();
      expect(document.activeElement).not.toBe(before);

      writeInputSignal(component.status, 'IN_PROGRESS');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(before);

      // El elemento desapareció (p. ej. el pie se repintó): el foco cae a un elemento visible del juego, nunca a <body>.
      // El mundo (#game-area) es un contenedor sin tabindex: no puede recibirlo y se sigue con #main-content.
      const area = document.createElement('div');
      area.id = 'game-area';
      document.body.appendChild(area);
      const container = document.createElement('div');
      container.id = 'main-content';
      container.tabIndex = -1;
      document.body.appendChild(container);
      before.remove();
      const gone = document.createElement('button');
      document.body.appendChild(gone);
      gone.focus();
      writeInputSignal(component.status, 'PAUSED');
      fixture.detectChanges();
      await fixture.whenStable();
      gone.remove();
      writeInputSignal(component.status, 'IN_PROGRESS');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(container);
      container.remove();
      area.remove();
    });

    it('lleva el aviso de alcance (RN-01, borrador) fuera de los textos validados y no en la pausa calmada', () => {
      render('COMPLETED');
      expect(host().querySelector('ui-scope-notice')).not.toBeNull();
      expect(host().querySelector('ui-scope-notice')!.closest('.oc-ending, .oc-pause-copy, .oc-actions')).toBeNull();
      fixture.destroy();
      TestBed.resetTestingModule();
      render('PAUSED');
      // En la pausa solo está dentro del seguimiento plegado: lo primero a la vista son las acciones.
      expect(host().querySelector('section > ui-scope-notice')).toBeNull();
    });

    it('los textos congelados no cambian', () => {
      render('COMPLETED');
      expect(component.eyebrow('COMPLETED')).toBe('¡Simulación completada!');
      expect(host().textContent).toContain('Puntaje total');
      fixture.destroy();
      TestBed.resetTestingModule();
      render('PAUSED');
      expect(text(host().querySelector('#outcome-title'))).toBe('Tu caso está en pausa');
      expect(component.pauseMessage)
        .toBe('Tu avance quedó guardado exactamente donde estabas. No hay penalización: puedes retomarlo cuando quieras.');
      expect(text(host().querySelector('button.oc-btn--go'))).toBe('Reanudar este intento');
    });
  });

  describe('forma (F6-6)', () => {
    const rule = (selector: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return source.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    };
    const rem = (selector: string) => Number(/font-size:\s*([0-9.]+)rem/.exec(rule(selector))?.[1]);

    it('las acciones tienen hover protegido para híbridos y estilo de pulsado', () => {
      expect(source).not.toMatch(/\n {4}\.oc-btn[^{]*:hover/); // a nivel de hoja, sin la consulta
      expect(source).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.oc-btn:hover \{/);
      expect(source).toMatch(/\.oc-btn:active \{ transform: translateY\(1px\); \}/);
    });

    it('ningún rótulo del resultado baja de 12 px', () => {
      for (const selector of ['.oc-label', '.oc-eyebrow', '.oc-chip, .oc-tag', '.oc-tl__delta', '.oc-bar__k']) {
        const size = selector === '.oc-chip, .oc-tag'
          ? Number(/font-size:\s*([0-9.]+)rem/.exec(source.match(/\.oc-chip, \.oc-tag \{([^}]*)\}/)?.[1] ?? '')?.[1])
          : rem(selector);
        expect(size * 16, selector).toBeGreaterThanOrEqual(12);
      }
      // Las etiquetas de las métricas son un selector compuesto (`.oc-metric span`).
      const metricLabel = Number(/font-size:\s*([0-9.]+)rem/.exec(source.match(/\.oc-metric span \{([^}]*)\}/)?.[1] ?? '')?.[1]);
      expect(metricLabel * 16, '.oc-metric span').toBeGreaterThanOrEqual(12);
    });

    it('a 360 px las métricas, la barra y la línea de tiempo caben en una columna útil (sin desplazamiento horizontal)', () => {
      const narrow = source.match(/@media \(max-width: 480px\) \{([\s\S]*?)\n    \}/)?.[1] ?? '';
      expect(narrow).toMatch(/\.oc-metrics \{[^}]*grid-template-columns: repeat\(2, minmax\(0, ?1fr\)\)/);
      expect(narrow).toMatch(/\.oc-bar \{[^}]*grid-template-columns: [^;}]*minmax\(0, ?\d+px\)/);
      expect(narrow).toMatch(/\.oc-tl \{[^}]*grid-template-columns: \d+px minmax\(0, ?1fr\)/);
      expect(narrow).toMatch(/\.oc-tl__delta \{[^}]*grid-column: 2/);
      expect(narrow).toMatch(/\.oc-actions \{[^}]*flex-direction: column/);
    });
  });

  describe('respuestas reconsideradas (L-03)', () => {
    const chips = () => Array.from(host().querySelectorAll('.oc-chip')).map(el => text(el));

    it('con reintentos el cierre muestra el chip «Reconsideradas: N» junto a los de decisiones', () => {
      render('COMPLETED', { report: makeReport({ retries: 6 }) });
      expect(chips()).toContain('Reconsideradas: 6');
    });

    it('no son decisiones: no cambian las barras ni las alertas éticas ni el desempeño', () => {
      render('COMPLETED', { report: makeReport({ retries: 2, prohibitedRetries: 1 }) });
      expect(chips().some(chip => /alertas éticas/i.test(chip))).toBe(false);
      expect(host().textContent).toMatch(/Adecuadas\s*3/);
      expect(component.perf(makeReport({ retries: 6, adequateDecisions: 6 }))).toBe('Excelente');
    });

    it('sin reintentos (0 o ausente) no aparece el chip', () => {
      render('COMPLETED', { report: makeReport({ retries: 0 }) });
      expect(chips().some(chip => /reconsideradas/i.test(chip))).toBe(false);
      fixture.destroy();
      TestBed.resetTestingModule();
      render('COMPLETED', { report: makeReport() });
      expect(chips().some(chip => /reconsideradas/i.test(chip))).toBe(false);
    });

    it('la recomendación del servidor sobre lo reconsiderado llega tal cual a «Retroalimentación del sistema»', () => {
      render('COMPLETED', {
        report: makeReport({ retries: 1, recommendations: ['Reconsideraste 1 respuesta antes de decidir; revísala con tu docente.'] }),
      });
      expect(host().querySelector('.oc-feedback')?.textContent).toContain('Reconsideraste 1 respuesta antes de decidir; revísala con tu docente.');
    });
  });
});

// req: RN-08, RF-23, CU-13, RF-10 (F10-4: la retroalimentación pedagógica y su fundamento se leen al cierre, por C2)
describe('AttemptOutcomeComponent: tus decisiones y marcador (F10-4, C2)', () => {
  let fixture: ComponentFixture<AttemptOutcomeComponent>;
  let component: AttemptOutcomeComponent;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  const decision = (overrides: Partial<DecisionReviewItem> = {}): DecisionReviewItem => ({
    order: 1,
    nodeId: 4,
    nodeTitle: 'Sala de escucha',
    chosen: { optionId: 9, text: 'Escuchar sin juzgar' },
    consequence: 'La estudiante continúa la conversación.',
    feedback: { explanation: 'Validar antes de indagar protege la confianza.', theoryBasis: 'Primeros auxilios psicológicos' },
    classification: 'ADEQUATE',
    prohibited: false,
    ...overrides,
  });

  /** Renderiza el resultado con el reporte del dueño (C2) que devuelve el servicio, o con su error. */
  function render(options: {
    status?: 'COMPLETED' | 'PAUSED';
    items?: DecisionReviewItem[];
    error?: unknown;
    reviewAttemptId?: string | null;
    /** La respuesta de decidir ya trae el reporte con sus decisiones (la ruta normal) o no (la de respaldo). */
    reportHasDecisions?: boolean;
  } = {}): void {
    TestBed.configureTestingModule({
      imports: [AttemptOutcomeComponent],
      providers: [
        provideRouter([]),
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
        { provide: KitService, useValue: fakeKitService() },
        { provide: SimulationService, useValue: simulation },
      ],
    });
    TestBed.overrideComponent(AttemptOutcomeComponent, {
      remove: { imports: [KitFigureComponent] },
      add: { imports: [KitFigureStubComponent] },
    });
    const items = options.items ?? [decision()];
    simulation.studentReport.mockReset();
    simulation.studentReport.mockReturnValue(options.error
      ? throwError(() => options.error)
      : of(makeReport({ status: 'COMPLETED', decisionReview: items })));
    fixture = TestBed.createComponent(AttemptOutcomeComponent);
    component = fixture.componentInstance;
    writeInputSignal(component.status, options.status ?? 'COMPLETED');
    writeInputSignal(component.report, options.reportHasDecisions
      ? makeReport({ status: 'COMPLETED', decisionReview: items })
      : makeReport({ status: 'COMPLETED' }));
    writeInputSignal(component.reviewAttemptId, options.reviewAttemptId === undefined ? 'a1' : options.reviewAttemptId);
    fixture.detectChanges();
  }

  /** Deja que la carga del reporte llegue y se pinte. */
  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('«Tus decisiones» aparece al completar y pide el reporte del dueño', async () => {
    render();
    await settle();

    expect(simulation.studentReport).toHaveBeenCalledWith('a1');
    expect(text(host().querySelector('#oc-decisions-title'))).toBe('Tus decisiones');
  });

  it('si la respuesta de decidir ya trae las decisiones, no se pide nada más al cerrar (una petición menos)', async () => {
    render({ reportHasDecisions: true, items: [decision()] });
    await settle();

    expect(simulation.studentReport).not.toHaveBeenCalled();
    expect(host().querySelectorAll('.oc-decision')).toHaveLength(1);
  });

  it('sin pedirlo (pausa) no se pide el reporte ni aparece la sección', async () => {
    render({ status: 'PAUSED', reviewAttemptId: null });
    await settle();

    expect(simulation.studentReport).not.toHaveBeenCalled();
    expect(host().querySelector('.oc-decisions')).toBeNull();
  });

  it('cada decisión lleva la elección, la consecuencia, la explicación, el fundamento y su etiqueta formativa', async () => {
    render({ items: [decision()] });
    await settle();

    const item = host().querySelector('.oc-decision') as HTMLElement;
    expect(text(item)).toContain('Escuchar sin juzgar');
    expect(text(item)).toContain('La estudiante continúa la conversación.');
    expect(text(item)).toContain('Validar antes de indagar protege la confianza.');
    expect(text(item)).toContain('Primeros auxilios psicológicos');
    expect(text(item.querySelector('.oc-decision__tone'))).toBe('Adecuada');
  });

  it('la etiqueta de cada decisión es cualitativa: nunca un puntaje', async () => {
    render({ items: [decision({ classification: 'RISKY' }), decision({ order: 2, classification: 'INADEQUATE' })] });
    await settle();

    const labels = Array.from(host().querySelectorAll('.oc-decision__tone')).map(el => text(el));
    expect(labels).toEqual(['Con riesgo', 'Inadecuada']);
    expect(text(host().querySelector('.oc-decisions'))).not.toMatch(/\d+\s*pts|puntos/i);
  });

  it('una decisión sin explicación muestra su estado vacío y el resto de la lista sigue', async () => {
    render({ items: [decision({ feedback: { explanation: '' } }), decision({ order: 2 })] });
    await settle();

    const items = host().querySelectorAll('.oc-decision');
    expect(items).toHaveLength(2);
    expect(text(items[0].querySelector('.oc-decision__empty'))).toBe('El caso no trae una explicación para esta decisión.');
    expect(items[1].querySelector('.oc-decision__empty')).toBeNull();
  });

  it('con la primera respuesta no aplicada lo dice con la etiqueta congelada y la opción de entonces', async () => {
    render({ items: [decision({ reconsidered: { firstOptionId: 7, firstOptionText: 'Dar un consejo de inmediato' } })] });
    await settle();

    expect(text(host().querySelector('.oc-decision__first'))).toBe(`${RECONSIDERED_LABEL}: Dar un consejo de inmediato`);
  });

  it('una conducta prohibida se señala con la nota ética, sin alarma de puntaje', async () => {
    render({ items: [decision({ classification: 'INADEQUATE', prohibited: true })] });
    await settle();

    expect(text(host().querySelector('.oc-decision__note'))).toBe('Alerta ética: esta respuesta puede aumentar el riesgo de revictimización.');
  });

  it('sin decisiones que mostrar, el estado vacío lo dice y no hay error a la vez', async () => {
    render({ items: [] });
    await settle();

    expect(text(host().querySelector('.oc-decisions ui-empty-state'))).toContain('Este intento no tiene decisiones registradas para revisar.');
    // El texto por defecto del tipo «sin resultados» (filtros de búsqueda) no puede aparecer aquí.
    expect(text(host().querySelector('.oc-decisions ui-empty-state'))).not.toContain('Ningún elemento');
    expect(host().querySelector('.oc-decisions ui-error-state')).toBeNull();
  });

  it('un fallo al cargar muestra el error con «Reintentar», y reintentar vuelve a pedir el reporte', async () => {
    render({ error: new HttpErrorResponse({ status: 500 }) });
    await settle();

    const section = host().querySelector('.oc-decisions') as HTMLElement;
    expect(section.querySelector('ui-error-state')).not.toBeNull();
    expect(section.querySelector('.oc-decisions__list')).toBeNull();
    const retry = Array.from(section.querySelectorAll('button')).find(button => /reintentar/i.test(button.textContent ?? ''));
    expect(retry).toBeDefined();

    simulation.studentReport.mockReturnValue(of(makeReport({ status: 'COMPLETED', decisionReview: [decision()] })));
    retry!.click();
    await settle();

    expect(simulation.studentReport).toHaveBeenCalledTimes(2);
    expect(host().querySelectorAll('.oc-decision')).toHaveLength(1);
  });

  it('el marcador por defecto es «Puntaje total»; «progress» muestra el avance sin cifra; «hidden» no muestra marcador', async () => {
    render();
    await settle();
    const metrics = () => text(host().querySelector('.oc-metrics'));
    expect(metrics()).toContain('Puntaje total');
    expect(metrics()).toContain('42');

    writeInputSignal(component.scoreMarker, 'progress');
    fixture.detectChanges();
    expect(metrics()).toContain('Avance del caso');
    expect(metrics()).not.toMatch(/Puntaje total|42/);

    writeInputSignal(component.scoreMarker, 'hidden');
    fixture.detectChanges();
    expect(metrics()).not.toMatch(/Puntaje total|42|Avance/);
    expect(host().querySelector('.oc-metrics')?.children).toHaveLength(4);
  });
});

