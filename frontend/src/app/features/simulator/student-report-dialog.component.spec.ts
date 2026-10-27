import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AttemptCompletionReport } from '../../core/models/simulation.model';
import { StudentReportDialogComponent } from './student-report-dialog.component';

/**
 * T20 · El resumen propio de un intento CERRADO ANTES del modelo de métricas (reporte congelado v1 o v2).
 *
 * El servidor ya sirve al estudiante una proyección sin las cifras viejas (I-2, R-17), pero la pantalla no depende de
 * eso: aunque llegara el reporte crudo —con puntaje, estrés y conteos por severidad—, este diálogo no lee esas claves,
 * no muestra ninguna cifra de evaluación y no se rompe porque falten las claves de la v3 (hitos, persona, final con razón).
 */
// req: RNF-04, RN-01
describe('StudentReportDialogComponent con un reporte v1/v2 ya cerrado', () => {
  let fixture: ComponentFixture<StudentReportDialogComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = () => (host().textContent ?? '').replace(/\s+/g, ' ').trim();

  /** Lo que el servicio le entrega al diálogo: el reporte con `phaseDurations` normalizado (lo hace `SimulationService`). */
  const report = (extra: Record<string, unknown>): AttemptCompletionReport => ({
    attemptId: 'a-1', caseTitle: 'Violencia basada en género', status: 'COMPLETED', totalDurationSeconds: 750,
    phaseDurations: [], toolsUsed: 2, reflectionsCount: 3, safeExitUsed: false, visitedNodeTitles: ['Urgencias'],
    recommendations: ['Practica estrategias de autorregulación antes de escenarios de alta carga emocional.'],
    summaryMessage: 'Intento finalizado.',
    ...extra,
  } as AttemptCompletionReport);

  async function open(value: AttemptCompletionReport): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: DialogRef, useValue: { close: vi.fn() } },
        { provide: DIALOG_DATA, useValue: { attemptId: 'a-1', caseTitle: 'Violencia basada en género' } },
        { provide: SimulationService, useValue: { studentReport: () => of(value) } },
      ],
    });
    fixture = TestBed.createComponent(StudentReportDialogComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('un reporte v2 crudo, con puntaje, estrés y conteos por severidad, no muestra ninguna de esas cifras', async () => {
    await open(report({
      schemaVersion: 2, finalScore: 7351, finalStress: 4271, metrics: { professionalScore: 7351, sceneStress: 4271 },
      adequateDecisions: 8111, riskyDecisions: 8222, inadequateDecisions: 8333, prohibitedDecisions: 8444,
      counts: { adequate: 8111, risky: 8222, inadequate: 8333, prohibited: 8444, retries: 0 },
      ending: { key: 'protectora', title: 'Intervención protectora', message: 'Cuidaste a la persona.', tone: 'positive',
        severityCounts: { adequate: 8111 }, caseMetrics: { confianza: 9123 }, caseFlags: { derivo: true } },
      timeline: [{ type: 'DECISION_SELECTED', classification: 'ADEQUATE', scoreDelta: 5, stressDelta: -2 }],
    }));

    const shown = text();
    expect(shown).toContain('Intervención protectora');
    expect(shown).toContain('Recomendaciones');
    for (const number of ['7351', '4271', '8111', '8222', '8333', '8444', '9123']) expect(shown).not.toContain(number);
    expect(shown).not.toMatch(/puntaje|estr[eé]s|score|stress/i);
  });

  it('un reporte v1 mínimo (sin final, sin hitos, sin persona) se lee sin romper y sin cifras', async () => {
    await open(report({ schemaVersion: 1, finalScore: 7351, finalStress: 4271, adequateDecisions: 8111 }));

    const shown = text();
    expect(shown).toContain('Violencia basada en género');
    expect(shown).toContain('Tiempo total');
    expect(shown).toContain('Recomendaciones');
    expect(host().querySelector('.sr-subtitle')?.textContent).not.toContain('Intervención');
    for (const number of ['7351', '4271', '8111']) expect(shown).not.toContain(number);
  });

  it('un reporte ya proyectado por el servidor (v2 sin cifras) muestra lo mismo que antes: final y recomendaciones', async () => {
    await open(report({
      schemaVersion: 2,
      ending: { key: 'protectora', title: 'Intervención protectora', message: 'Cuidaste a la persona.', tone: 'positive' },
    }));

    expect(text()).toContain('Intervención protectora');
    expect(text()).toContain('Practica estrategias de autorregulación');
  });
});
