import { readFileSync } from 'fs';
import { join } from 'path';
import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { InstructorApi } from '../../core/api/instructor.api';
import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { AttemptTrace, RecentAttempt, RubricCriterionView, RubricEvaluationView } from '../../core/models/simulation.model';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { InstructorTraceComponent } from './instructor-trace.component';
import { ReplaceAttemptDialogComponent } from './replace-attempt-dialog.component';
import { TraceFeedbackDialogComponent } from './trace-feedback-dialog.component';

/**
 * Traza del docente en el sistema de la biblioteca (plan visual F7-4): lista maestro-detalle, retroalimentación en un
 * diálogo (trampa de foco, foco inicial, Esc), «Selecciona un intento» solo si hay intentos, calificación con el rango
 * del contrato (SIEP-CU-04) y la valoración formativa rotulada como tal, sin ningún número que el servidor no envíe
 * (RN-09). La prueba del diálogo vive en `trace-feedback-dialog.component.spec.ts`.
 */
const attempt = (attemptId: string, overrides: Partial<RecentAttempt> = {}): RecentAttempt => ({
  attemptId, studentAlias: `Estudiante ${attemptId}`, caseTitle: `Caso ${attemptId}`, status: 'COMPLETED',
  accumulatedScore: 60, stressIndex: 20, startedAt: '2026-10-10T10:00:00Z', ...overrides,
});

const criterion = (id: number, title: string): RubricCriterionView => ({
  id, competency: 'ETICA', title, description: `Descripción de ${title}`, weight: 50, maxScore: 5, displayOrder: id,
});

function rubricFixture(overrides: Partial<RubricEvaluationView> = {}): RubricEvaluationView {
  return {
    attemptId: 'a-1', rubricId: 7, rubricName: 'Rúbrica básica de desempeño', description: 'Evalúa el desempeño formativo.',
    criteria: [criterion(1, 'Ética profesional'), criterion(2, 'Ruta de atención')], scores: [], totalScore: null,
    overallLevel: null, comment: '', ...overrides,
  };
}

function traceFixture(id = 'a-1', overrides: Partial<AttemptTrace> = {}): AttemptTrace {
  return {
    attemptId: id, studentAlias: `Estudiante ${id}`, caseTitle: `Caso ${id}`, status: 'COMPLETED', accumulatedScore: 60,
    stressIndex: 20, startedAt: '2026-10-10T10:00:00Z', endedAt: '2026-10-10T10:25:00Z', totalDurationSeconds: 1500,
    phaseDurations: [{ nodeId: 1, nodeTitle: 'Recepción', startedAt: '2026-10-10T10:00:00Z', endedAt: '2026-10-10T10:05:00Z', durationSeconds: 300 }],
    adequateDecisions: 3, riskyDecisions: 1, inadequateDecisions: 1, prohibitedDecisions: 0, safeExitUsed: false,
    timeline: [
      { atSeconds: 30, time: '00:30', type: 'DECISION_SELECTED', classification: 'ADEQUATE', prohibited: false, label: 'Escucha activa', scoreDelta: 5, stressDelta: -2 },
    ],
    visitedNodeTitles: ['Recepción'], events: [], reflections: [], rubricEvaluations: [], metrics: {}, world: {},
    ...overrides,
  } as unknown as AttemptTrace;
}

interface Api {
  recent: () => Observable<RecentAttempt[]>;
  trace: (id: string) => Observable<AttemptTrace>;
  rubric: (id: string) => Observable<RubricEvaluationView>;
  save: (...args: unknown[]) => Observable<RubricEvaluationView>;
}

describe('traza del docente en el sistema de la biblioteca (F7-4)', () => {
  let fixture: ComponentFixture<InstructorTraceComponent>;
  let api: Record<'recentAttempts' | 'attemptTrace' | 'rubric' | 'saveRubric' | 'replaceAttempt', ReturnType<typeof vi.fn>>;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let notify: Record<'success' | 'error' | 'warning' | 'info', ReturnType<typeof vi.fn>>;

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const status = () => text(host().querySelector('[role="status"].ds-sr-only'));
  const criteriaCards = () => [...host().querySelectorAll('.tr-criterion')];
  const scoreInput = (index: number) => criteriaCards()[index].querySelector('input[type="number"]') as HTMLInputElement;
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const saveButton = () => [...host().querySelectorAll('button')]
    .find(button => text(button.querySelector('.ui-button__label')).startsWith('Guardar evaluación')) as HTMLButtonElement;

  async function render(overrides: Partial<Api> = {}, { stable = true, query = {} } = {}) {
    api = {
      recentAttempts: vi.fn(overrides.recent ?? (() => of([attempt('a-1'), attempt('a-2', { status: 'IN_PROGRESS' })]))),
      attemptTrace: vi.fn(overrides.trace ?? ((id: string) => of(traceFixture(id)))),
      rubric: vi.fn(overrides.rubric ?? (() => of(rubricFixture()))),
      saveRubric: vi.fn(overrides.save ?? (() => of(rubricFixture({ overallLevel: 'LOGRADO' })))),
      replaceAttempt: vi.fn(),
    };
    dialog = { open: vi.fn() };
    notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      imports: [InstructorTraceComponent],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: InstructorApi, useValue: api },
        { provide: AuthService, useValue: { currentUser: () => ({ role: 'PROFESOR' }) } },
        { provide: UiDialog, useValue: dialog },
        { provide: NotificationService, useValue: notify },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    });
    fixture = TestBed.createComponent(InstructorTraceComponent);
    if (stable) await fixture.whenStable();
    else fixture.detectChanges();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // E1-2 (RN-07): reemplazar un intento ABIERTO es acción docente, con motivo y auditada
  // (`POST /api/instructor/attempts/{id}/replace`); el estudiante ya no puede forzar uno nuevo. F7 no lo construyó.
  // req: RN-07
  describe('reemplazo docente (E1-2)', () => {
    const openTrace = (status: string) => ({ trace: (id: string) => of(traceFixture(id, { status, endedAt: null })) });
    const replaceButton = () => [...host().querySelectorAll('button')]
      .find(button => text(button.querySelector('.ui-button__label')) === 'Reemplazar intento');

    it('solo un intento abierto (en curso o en pausa) ofrece «Reemplazar intento»', async () => {
      await render();
      expect(replaceButton()).toBeUndefined();
      for (const state of ['IN_PROGRESS', 'PAUSED']) {
        TestBed.resetTestingModule();
        await render(openTrace(state));
        expect(replaceButton(), state).toBeDefined();
      }
    });

    it('pide el motivo en un diálogo; con motivo, reemplaza, recarga la traza y lo anuncia', async () => {
      await render(openTrace('IN_PROGRESS'));
      api.replaceAttempt.mockReturnValue(of({ attemptId: 'a-1', status: 'REPLACED', reason: 'Se trabó el mundo', replacedAt: '2026-10-14T10:00:00Z' }));
      dialog.open.mockReturnValue({ closed: of('Se trabó el mundo') });
      replaceButton()!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(dialog.open).toHaveBeenCalledWith(ReplaceAttemptDialogComponent, expect.objectContaining({
        data: expect.objectContaining({ studentAlias: 'Estudiante a-1', caseTitle: 'Caso a-1' }),
      }));
      expect(api.replaceAttempt).toHaveBeenCalledWith('a-1', 'Se trabó el mundo');
      expect(api.attemptTrace).toHaveBeenCalledTimes(2);
      // Se anuncia UNA vez, por el aviso del sistema; la región de estado de la pantalla queda para lo suyo.
      expect(notify.success).toHaveBeenCalledWith(expect.stringContaining('Intento reemplazado'));
      expect(status()).not.toContain('Intento reemplazado');
    });

    it('si se cancela el diálogo no se envía nada', async () => {
      await render(openTrace('PAUSED'));
      dialog.open.mockReturnValue({ closed: of(undefined) });
      replaceButton()!.click();
      await fixture.whenStable();
      expect(api.replaceAttempt).not.toHaveBeenCalled();
    });

    it('si el intento ya se cerró (409), lo dice y no recarga a ciegas', async () => {
      await render(openTrace('IN_PROGRESS'));
      api.replaceAttempt.mockReturnValue(throwError(() => new HttpErrorResponse({
        status: 409, error: { success: false, code: 'ATTEMPT_NOT_OPEN', message: 'El intento ya está cerrado y no puede reemplazarse.' },
      })));
      dialog.open.mockReturnValue({ closed: of('motivo') });
      replaceButton()!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(notify.error).toHaveBeenCalledWith('El intento ya está cerrado y no puede reemplazarse.');
    });

    // Revisión de F7b: el resultado del reemplazo no se queda en la región de estado, donde tapaba los avisos de la
    // rúbrica (WCAG 4.1.3) y se repetía en cada recarga de la traza.
    it('tras un reemplazo, un fallo al guardar la rúbrica sí llega a la región de estado', async () => {
      await render({ ...openTrace('IN_PROGRESS'), save: () => throwError(() => new HttpErrorResponse({ status: 500 })) });
      api.replaceAttempt.mockReturnValue(of({ attemptId: 'a-1', status: 'REPLACED', reason: 'x', replacedAt: '2026-10-14T10:00:00Z' }));
      dialog.open.mockReturnValue({ closed: of('Se trabó el mundo') });
      replaceButton()!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      type(scoreInput(0), '4');
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(status()).toContain('No fue posible guardar la evaluación');
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('estados y maestro-detalle', () => {
    it('un solo h1, la región de estado siempre presente y sin restos del diseño anterior', async () => {
      await render();
      expect(host().querySelectorAll('h1')).toHaveLength(1);
      expect(text(host().querySelector('h1'))).toBe('Revisión formativa del intento');
      expect(host().querySelector('[role="status"].ds-sr-only')).not.toBeNull();
      expect(host().querySelector('[class*="pixel-"], mat-progress-bar, mat-icon[aria-label], .feedback-modal')).toBeNull();
    });

    it('sin intentos: el vacío de la lista dice qué pasa y NO aparece «Selecciona un intento»', async () => {
      await render({ recent: () => of([]) });
      expect(text(host().querySelector('.tr-list ui-empty-state'))).toContain('No hay intentos recientes para tus grupos');
      expect(text(host())).not.toContain('Selecciona un intento');
      expect(api.attemptTrace).not.toHaveBeenCalled();
    });

    it('con intentos abre el más reciente y muestra su detalle (sin «Selecciona un intento»)', async () => {
      await render();
      expect(api.attemptTrace).toHaveBeenCalledWith('a-1');
      expect(text(host().querySelector('.tr-overview h2'))).toBe('Caso a-1');
      expect(text(host())).not.toContain('Selecciona un intento');
      const items = [...host().querySelectorAll('.tr-attempt')];
      expect(items).toHaveLength(2);
      expect(items[0].getAttribute('aria-current')).toBe('true');
      expect(items[1].getAttribute('aria-current')).toBeNull();
      expect(text(items[1])).toContain('Estudiante a-2');
      expect(text(items[1])).toContain('En curso');
    });

    it('elegir otro intento abre ese y mueve la marca de seleccionado', async () => {
      await render();
      (host().querySelectorAll('.tr-attempt')[1] as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.attemptTrace).toHaveBeenLastCalledWith('a-2');
      const items = [...host().querySelectorAll('.tr-attempt')];
      expect(items[0].getAttribute('aria-current')).toBeNull();
      expect(items[1].getAttribute('aria-current')).toBe('true');
      expect(text(host().querySelector('.tr-overview h2'))).toBe('Caso a-2');
    });

    it('con intentos pero ninguno abierto aún, la pantalla invita a elegir uno', async () => {
      await render({ trace: () => new Subject<AttemptTrace>() }, { stable: false });
      fixture.componentInstance.trace.set(null);
      fixture.componentInstance.selectedAttemptId.set(null);
      fixture.componentInstance.loadingTrace.set(false);
      fixture.detectChanges();
      expect(text(host().querySelector('.tr-detail ui-empty-state'))).toContain('Selecciona un intento');
    });

    it('si la lista falla: UN error con «Reintentar» que la vuelve a pedir', async () => {
      let calls = 0;
      await render({ recent: () => (++calls === 1 ? throwError(() => new HttpErrorResponse({ status: 500 })) : of([attempt('a-1')])) });
      const errors = host().querySelectorAll('ui-error-state');
      expect(errors).toHaveLength(1);
      (errors[0].querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(calls).toBe(2);
      expect(host().querySelector('ui-error-state')).toBeNull();
      expect(host().querySelectorAll('.tr-attempt')).toHaveLength(1);
    });

    it('si falla la traza de un intento: el error vive en el detalle, la lista sigue ahí y «Reintentar» la vuelve a pedir', async () => {
      let calls = 0;
      await render({ trace: id => (++calls === 1 ? throwError(() => new HttpErrorResponse({ status: 500 })) : of(traceFixture(id))) });
      const error = host().querySelector('.tr-detail ui-error-state')!;
      expect(error).not.toBeNull();
      expect(host().querySelectorAll('.tr-attempt')).toHaveLength(2);

      (error.querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(calls).toBe(2);
      expect(text(host().querySelector('.tr-overview h2'))).toBe('Caso a-1');
    });

    it('mientras carga la traza: esqueleto con aria-busy y el estado leído', async () => {
      vi.useFakeTimers();
      await render({ trace: () => new Subject<AttemptTrace>() }, { stable: false });
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      expect(host().querySelector('.tr-detail [aria-busy="true"]')).not.toBeNull();
      expect(host().querySelectorAll('.tr-detail ui-skeleton').length).toBeGreaterThan(0);
      expect(status()).toBe('Cargando la trazabilidad…');
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('retroalimentación en un diálogo', () => {
    it('cada tarjeta de resumen es un botón que abre el diálogo de la biblioteca con su panel', async () => {
      await render();
      const cards = [...host().querySelectorAll('.tr-metric')] as HTMLButtonElement[];
      expect(cards.map(card => text(card.querySelector('.ui-stat__label')))).toEqual([
        'Total decisiones', 'Adecuadas', 'Riesgosas', 'Inadecuadas', 'Reflexiones', 'Evaluación', 'Tiempo total',
      ]);
      expect(cards.every(card => card.getAttribute('aria-haspopup') === 'dialog')).toBe(true);

      cards[1].click();
      expect(dialog.open).toHaveBeenCalledTimes(1);
      const [component, options] = dialog.open.mock.calls[0];
      expect(component).toBe(TraceFeedbackDialogComponent);
      expect(options.size).toBe('lg');
      expect(options.data.panel.key).toBe('ADEQUATE');
      expect(options.data.panel.title).toBe('Decisiones adecuadas');
    });

    it('ningún panel usa el vocabulario clínico (VD-24): el vacío de decisiones es educativo', async () => {
      await render({ trace: id => of(traceFixture(id, { events: [], timeline: [] })) });
      const cards = [...host().querySelectorAll('.tr-metric')] as HTMLButtonElement[];
      cards[0].click();
      const panel = dialog.open.mock.calls[0][1].data.panel;
      expect(panel.emptyMessage).toBe('Este intento aún no tiene decisiones guardadas.');
      expect(JSON.stringify(panel).toLowerCase()).not.toContain('clínic');
    });

    it('«Ver retroalimentación» de la línea de tiempo y de las reflexiones abren su panel', async () => {
      await render();
      const buttons = [...host().querySelectorAll('button')]
        .filter(button => text(button.querySelector('.ui-button__label')) === 'Ver retroalimentación');
      expect(buttons).toHaveLength(2);
      buttons[0].click();
      buttons[1].click();
      expect(dialog.open.mock.calls.map(call => call[1].data.panel.key)).toEqual(['RECORRIDO', 'REFLECTIONS']);
    });
  });

  // req: SIEP-CU-04, RNF-04
  describe('calificación con el rango del contrato (SIEP-CU-04)', () => {
    it('cada criterio pide de 1,0 al máximo del criterio en pasos de 0,5, y la ayuda lo dice', async () => {
      await render();
      expect(criteriaCards()).toHaveLength(2);
      const input = scoreInput(0);
      expect(input.getAttribute('min')).toBe('1');
      expect(input.getAttribute('max')).toBe('5');
      expect(input.getAttribute('step')).toBe('0.5');
      expect(text(criteriaCards()[0].querySelector('.ui-field__message'))).toBe('Rango 1,0 a 5');
    });

    it('un valor fuera de rango se rechaza en línea al escribirlo y no se envía: 0,5 y 0 no son del contrato', async () => {
      await render();
      type(scoreInput(0), '0.5');
      expect(text(criteriaCards()[0].querySelector('.ui-field__message--error'))).toBe('Debe estar entre 1,0 y 5.');
      expect(scoreInput(0).getAttribute('aria-invalid')).toBe('true');

      saveButton().click();
      await fixture.whenStable();
      expect(api.saveRubric).not.toHaveBeenCalled();

      type(scoreInput(0), '0');
      expect(text(criteriaCards()[0].querySelector('.ui-field__message--error'))).toBe('Debe estar entre 1,0 y 5.');
      type(scoreInput(0), '5.5');
      expect(text(criteriaCards()[0].querySelector('.ui-field__message--error'))).toBe('Debe estar entre 1,0 y 5.');
    });

    it('califica con 1,0 y con el máximo: ambos son válidos y viajan como números', async () => {
      await render();
      type(scoreInput(0), '1');
      type(scoreInput(1), '5');
      expect(criteriaCards()[0].querySelector('.ui-field__message--error')).toBeNull();
      expect(criteriaCards()[1].querySelector('.ui-field__message--error')).toBeNull();

      saveButton().click();
      await fixture.whenStable();

      expect(api.saveRubric).toHaveBeenCalledTimes(1);
      const [attemptId, rubricId, , scores] = api.saveRubric.mock.calls[0];
      expect(attemptId).toBe('a-1');
      expect(rubricId).toBe(7);
      expect(scores).toEqual([
        { criterionId: 1, score: 1, comment: '' },
        { criterionId: 2, score: 5, comment: '' },
      ]);
    });

    it('un criterio sin calificar no viaja como 0: se omite (el contrato rechaza el 0)', async () => {
      await render();
      type(scoreInput(1), '3.5');
      saveButton().click();
      await fixture.whenStable();

      expect(api.saveRubric.mock.calls[0][3]).toEqual([{ criterionId: 2, score: 3.5, comment: '' }]);
    });

    it('corregir el valor quita el error de ESE criterio y deja el de los demás', async () => {
      await render();
      type(scoreInput(0), '0.5');
      type(scoreInput(1), '9');
      expect(host().querySelectorAll('.ui-field__message--error')).toHaveLength(2);

      type(scoreInput(0), '2');
      expect(host().querySelectorAll('.ui-field__message--error')).toHaveLength(1);
      expect(text(criteriaCards()[1].querySelector('.ui-field__message--error'))).toBe('Debe estar entre 1,0 y 5.');
    });

    it('al guardar con éxito avisa con un aviso y refresca la traza', async () => {
      await render();
      type(scoreInput(0), '4');
      saveButton().click();
      await fixture.whenStable();

      expect(notify.success).toHaveBeenCalledWith('Evaluación guardada correctamente.');
      expect(api.attemptTrace.mock.calls.filter(call => call[0] === 'a-1').length).toBeGreaterThanOrEqual(2);
    });

    it('si el servidor rechaza el guardado, lo dice en línea junto al botón y no con un aviso de éxito', async () => {
      await render({ save: () => throwError(() => new HttpErrorResponse({ status: 500 })) });
      type(scoreInput(0), '4');
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text(host().querySelector('.tr-rubric__message'))).toContain('No fue posible guardar la evaluación');
      expect(notify.success).not.toHaveBeenCalled();
    });
  });

  // req: RN-09
  describe('valoración formativa (RN-09)', () => {
    it('rotula el total como «Valoración formativa» con el nivel que envía el servidor y ningún número si no lo envía', async () => {
      await render({
        rubric: () => of(rubricFixture({
          overallLevel: 'LOGRADO', totalScore: null,
          scores: [{ criterionId: 1, score: 4, level: 'LOGRADO', comment: null, evidence: {} }],
        })),
      });
      const valuation = host().querySelector('.tr-valuation')!;
      expect(text(valuation)).toContain('Valoración formativa');
      expect(text(valuation)).toContain('Logrado');
      expect(text(valuation)).not.toMatch(/\d/);
    });

    it('con el total numérico encendido en el servidor lo muestra, y sigue rotulado como valoración formativa', async () => {
      await render({ rubric: () => of(rubricFixture({ overallLevel: 'DESTACADO', totalScore: 4.5 })) });
      const valuation = host().querySelector('.tr-valuation')!;
      expect(text(valuation)).toContain('Valoración formativa');
      expect(text(valuation)).toContain('Destacado');
      expect(text(valuation)).toContain('4,5');
    });

    it('sin evaluación aún: «Pendiente»; nunca una suma local de lo que se escribe', async () => {
      await render();
      expect(text(host().querySelector('.tr-valuation'))).toContain('Pendiente');
      type(scoreInput(0), '4');
      type(scoreInput(1), '5');
      expect(text(host().querySelector('.tr-valuation'))).not.toMatch(/\d/);
    });

    it('cada criterio calificado muestra su nivel formativo', async () => {
      await render({
        rubric: () => of(rubricFixture({
          scores: [
            { criterionId: 1, score: 4, level: 'LOGRADO', comment: null, evidence: {} },
            { criterionId: 2, score: 2, level: 'EN_PROCESO', comment: null, evidence: {} },
          ],
          overallLevel: 'EN_PROCESO',
        })),
      });
      expect(text(criteriaCards()[0].querySelector('ui-badge'))).toBe('Logrado');
      expect(text(criteriaCards()[1].querySelector('ui-badge'))).toBe('En proceso');
      expect(scoreInput(0).value).toBe('4');
    });
  });

  // req: SIEP-CU-04, RNF-04 (revisión de F7)
  describe('arreglos de la revisión de F7', () => {
    it('un ?intento= fuera de la lista falla en el detalle con «Reintentar» que pide ESE mismo intento', async () => {
      let calls = 0;
      await render({
        trace: id => (++calls === 1 ? throwError(() => new HttpErrorResponse({ status: 500 })) : of(traceFixture(id))),
      }, { query: { intento: 'a-viejo' } });

      expect(api.attemptTrace).toHaveBeenCalledWith('a-viejo');
      const error = host().querySelector('.tr-detail ui-error-state')!;
      expect(error).not.toBeNull();

      (error.querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(api.attemptTrace).toHaveBeenLastCalledWith('a-viejo');
      expect(text(host().querySelector('.tr-overview h2'))).toBe('Caso a-viejo');
    });

    it('un ?intento= que no existe (404) lo dice en el detalle sin ofrecer reintentar algo que no va a aparecer', async () => {
      await render({ trace: () => throwError(() => new HttpErrorResponse({ status: 404 })) }, { query: { intento: 'a-borrado' } });

      const error = host().querySelector('.tr-detail ui-error-state')!;
      expect(error).not.toBeNull();
      expect(error.querySelector('button')).toBeNull();
      expect(host().querySelectorAll('.tr-attempt')).toHaveLength(2);
    });

    it('«Evaluación» solo dice «Aplicada» con una evaluación concluida: una a medias es «Pendiente»', async () => {
      const partial = { id: 1, rubricName: 'Rúbrica', totalScore: null, overallLevel: null, comment: null, evaluatedAt: '2026-10-10T11:00:00Z' };
      await render({ trace: id => of(traceFixture(id, { rubricEvaluations: [partial] })) });
      const card = [...host().querySelectorAll('.tr-metric')].find(el => text(el.querySelector('.ui-stat__label')) === 'Evaluación')!;
      expect(text(card.querySelector('.ui-stat__value'))).toBe('Pendiente');

      (card as HTMLButtonElement).click();
      expect(dialog.open.mock.calls.at(-1)![1].data.panel.intro).toContain('a medias');
    });

    it('con una evaluación concluida «Evaluación» dice «Aplicada»', async () => {
      const done = { id: 1, rubricName: 'Rúbrica', totalScore: null, overallLevel: 'LOGRADO' as const, comment: null, evaluatedAt: '2026-10-10T11:00:00Z' };
      await render({ trace: id => of(traceFixture(id, { rubricEvaluations: [done] })) });
      const card = [...host().querySelectorAll('.tr-metric')].find(el => text(el.querySelector('.ui-stat__label')) === 'Evaluación')!;
      expect(text(card.querySelector('.ui-stat__value'))).toBe('Aplicada');
    });

    it('la rúbrica de un intento que se abandonó no pisa la del abierto', async () => {
      const slowRubric = new Subject<RubricEvaluationView>();
      const rubrics: Record<string, Observable<RubricEvaluationView>> = {
        'a-1': slowRubric,
        'a-2': of(rubricFixture({ rubricId: 99, rubricName: 'Rúbrica del segundo' })),
      };
      await render({ rubric: id => rubrics[id] });
      (host().querySelectorAll('.tr-attempt')[1] as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.componentInstance.rubric()?.rubricName).toBe('Rúbrica del segundo');

      slowRubric.next(rubricFixture({ rubricId: 7, rubricName: 'Rúbrica del primero' }));
      slowRubric.complete();
      fixture.detectChanges();

      expect(fixture.componentInstance.rubric()?.rubricName).toBe('Rúbrica del segundo');
      expect(fixture.componentInstance.selectedAttemptId()).toBe('a-2');
    });

    it('la calificación pide pasos de 0,5: 2,3 se rechaza en línea y 2,5 es válido', async () => {
      await render();
      type(scoreInput(0), '2.3');
      expect(text(criteriaCards()[0].querySelector('.ui-field__message--error'))).toBe('Usa pasos de 0,5 (por ejemplo, 3,5).');

      type(scoreInput(0), '2.5');
      expect(criteriaCards()[0].querySelector('.ui-field__message--error')).toBeNull();
    });

    it('un valor inválido se ANUNCIA al lector de pantalla con el nombre del criterio', async () => {
      await render();
      const announce = vi.spyOn(TestBed.inject(LiveRegionAnnouncer), 'announce');

      type(scoreInput(0), '0.5');

      expect(announce).toHaveBeenCalledWith('Ética profesional: Debe estar entre 1,0 y 5.', 'polite');
    });

    it('cada criterio es un grupo con nombre: sus campos «Calificación» no quedan sueltos', async () => {
      await render();
      const group = criteriaCards()[1];
      expect(group.getAttribute('role')).toBe('group');
      const labelledBy = group.getAttribute('aria-labelledby')!;
      expect(text(host().querySelector('#' + labelledBy))).toBe('Ruta de atención');
      // `article` no admite role="group" (Axe: aria-allowed-role, 16 nodos en la línea base de F7): el grupo va sobre un
      // elemento que sí lo admite.
      expect(group.tagName).not.toBe('ARTICLE');
    });

    it('el mensaje de un fallo al guardar se anuncia en la región de estado de la pantalla', async () => {
      await render({ save: () => throwError(() => new HttpErrorResponse({ status: 500 })) });
      type(scoreInput(0), '4');
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(status()).toContain('No fue posible guardar la evaluación');
    });
  });

  // req: RN-09
  describe('la valoración formativa no llega al estudiante (RN-09)', () => {
    it('ninguna vista del estudiante lee la evaluación de rúbrica, su nivel ni su total', () => {
      const studentViews = [
        'attempt-outcome.component.ts',
        'student-report-dialog.component.ts',
        'simulation-catalog.component.ts',
        '../dashboard/student-dashboard.component.ts',
        '../dashboard/student-dashboard.component.html',
      ];
      for (const file of studentViews) {
        const source = readFileSync(join(__dirname, file), 'utf-8');
        expect(source, file).not.toMatch(/overallLevel|RubricEvaluationView|rubricEvaluations|formativeValuationLabel|Valoración formativa/);
      }
    });
  });
});
