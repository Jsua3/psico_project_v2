import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AttemptOutcomeComponent } from './attempt-outcome.component';
import { AttemptCompletionReport } from '../../core/models/simulation.model';
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
