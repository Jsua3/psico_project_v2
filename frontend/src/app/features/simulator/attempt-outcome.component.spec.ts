import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { provideRouter } from '@angular/router';
import { AttemptOutcomeComponent } from './attempt-outcome.component';
import { AttemptCompletionReport } from '../../core/models/simulation.model';
import { AvatarFigureComponent } from '../character/avatar-figure.component';
import { AvatarStore } from '../character/avatar.store';

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
      providers: [provideRouter([]), { provide: AvatarStore, useFactory: () => new AvatarStore() }],
    });
    component = TestBed.createComponent(AttemptOutcomeComponent).componentInstance;
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

/** El avatar real exige entradas `input.required` que ts-jest no registra: se sustituye por un doble. */
@Component({ selector: 'app-avatar-figure', standalone: true, template: '' })
class AvatarFigureStubComponent {
  @Input() config: unknown;
  @Input() portrait = false;
}

describe('AttemptOutcomeComponent: pausa calmada renderizada (T12.1, AC-7)', () => {
  let fixture: ComponentFixture<AttemptOutcomeComponent>;
  let component: AttemptOutcomeComponent;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  function render(status: 'PAUSED' | 'COMPLETED' | 'SAFE_EXITED' | 'REPLACED' | 'IN_PROGRESS', options: { report?: AttemptCompletionReport | null; resources?: string[] } = {}): void {
    TestBed.configureTestingModule({
      imports: [AttemptOutcomeComponent],
      providers: [provideRouter([]), { provide: AvatarStore, useFactory: () => new AvatarStore() }],
    });
    TestBed.overrideComponent(AttemptOutcomeComponent, {
      remove: { imports: [AvatarFigureComponent] },
      add: { imports: [AvatarFigureStubComponent] },
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
    const resume = jest.fn();
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
});

