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
import {
  AttemptTrace, FormativeLevel, RecentAttempt, RubricCriterionView, RubricEvaluationView, RubricLevelOption,
} from '../../core/models/simulation.model';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { InstructorTraceComponent } from './instructor-trace.component';
import { ReplaceAttemptDialogComponent } from './replace-attempt-dialog.component';
import { TraceFeedbackDialogComponent } from './trace-feedback-dialog.component';

/**
 * Traza del docente en el sistema de la biblioteca (plan visual F7-4): lista maestro-detalle, retroalimentación en un
 * diálogo (trampa de foco, foco inicial, Esc), «Selecciona un intento» solo si hay intentos, rúbrica por niveles
 * (un nivel por criterio, sin campo numérico) y la valoración formativa rotulada como tal (RN-09). La traza dice qué
 * hizo la persona (hitos, persona por escena, final con su razón, decisiones por clase) y no muestra puntaje ni
 * estrés; el perfil automático del sistema queda plegado hasta que el docente guarda su valoración. La prueba del
 * diálogo vive en `trace-feedback-dialog.component.spec.ts`.
 */
const attempt = (attemptId: string, overrides: Partial<RecentAttempt> = {}): RecentAttempt => ({
  attemptId, studentAlias: `Estudiante ${attemptId}`, caseTitle: `Caso ${attemptId}`, status: 'COMPLETED',
  startedAt: '2026-10-10T10:00:00Z', ...overrides,
});

const criterion = (id: number, title: string, competency = 'ETICA'): RubricCriterionView => ({
  id, competency, title, description: `Descripción de ${title}`, weight: 50, displayOrder: id,
});

const LEVELS: RubricLevelOption[] = [
  { value: 'EN_INICIO', label: 'En inicio', descriptor: 'Aún no muestra la conducta esperada.' },
  { value: 'EN_PROCESO', label: 'En proceso', descriptor: 'La muestra a veces y con apoyo.' },
  { value: 'LOGRADO', label: 'Logrado', descriptor: 'La muestra de forma sostenida.' },
  { value: 'DESTACADO', label: 'Destacado', descriptor: 'La muestra y además la fundamenta.' },
];

function rubricFixture(overrides: Partial<RubricEvaluationView> = {}): RubricEvaluationView {
  return {
    attemptId: 'a-1', rubricId: 7, rubricName: 'Rúbrica básica de desempeño', description: 'Evalúa el desempeño formativo.',
    criteria: [criterion(1, 'Ética profesional'), criterion(2, 'Ruta de atención', 'RUTA')], scores: [], levels: LEVELS,
    overallLevel: null, comment: '', ...overrides,
  };
}

const SYSTEM_EVALUATION = {
  id: 90, rubricName: 'Valoración del sistema', origin: 'SISTEMA' as const, overallLevel: 'EN_PROCESO' as const, comment: null,
  evaluatedAt: '2026-10-10T11:00:00Z',
  competencyLevels: [
    { code: 'ETICA', name: 'Ética profesional', level: 'EN_PROCESO' as const, basis: 'Dos decisiones recomendadas de tres.', evidence: [] },
    { code: 'RUTA', name: 'Ruta de atención', level: null, basis: null, evidence: [] },
  ],
};

function traceFixture(id = 'a-1', overrides: Partial<AttemptTrace> = {}): AttemptTrace {
  return {
    attemptId: id, studentAlias: `Estudiante ${id}`, caseTitle: `Caso ${id}`, status: 'COMPLETED',
    startedAt: '2026-10-10T10:00:00Z', endedAt: '2026-10-10T10:25:00Z', totalDurationSeconds: 1500, activeSeconds: 1400,
    phaseDurations: [{ nodeId: 1, nodeTitle: 'Recepción', startedAt: '2026-10-10T10:00:00Z', endedAt: '2026-10-10T10:05:00Z', durationSeconds: 300 }],
    counts: { recommended: 3, acceptable: 1, risky: 1, contraindicated: 0 }, safeExitUsed: false,
    milestones: {
      done: [{ key: 'escucha', label: 'Escuchar sin interrumpir', decisive: false }],
      missing: [{ key: 'proteccion', label: 'Recomendar medidas de protección', decisive: true }],
    },
    personaPorEscena: [
      { nodeId: 1, nodeTitle: 'Recepción', bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
      { nodeId: 2, nodeTitle: 'Cierre', bond: 'OPEN', activation: 'CALM', label: 'se muestra abierta y serena' },
    ],
    ending: {
      key: 'con_brechas', title: 'Cierre con brechas', message: 'El caso se cerró con pasos pendientes.', tone: 'neutral',
      reason: ['Faltó recomendar medidas de protección.', 'Hubo una respuesta con riesgo.'],
    },
    timeline: [
      { atSeconds: 30, time: '00:30', type: 'DECISION_SELECTED', class: 'RECOMMENDED', prohibited: false, label: 'Escucha activa' },
    ],
    visitedNodeTitles: ['Recepción'], events: [], reflections: [], rubricEvaluations: [], world: {},
    systemEvaluation: null, systemEvaluationAvailable: false,
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
  const levelSelect = (index: number) => criteriaCards()[index].querySelector('select') as HTMLSelectElement;
  /** Elige un nivel en el selector de un criterio, como lo haría el docente. */
  const pick = (index: number, level: FormativeLevel | '') => {
    const select = levelSelect(index);
    select.value = level;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const fillLevels = (first: FormativeLevel = 'LOGRADO', second: FormativeLevel = 'EN_PROCESO') => {
    pick(0, first);
    pick(1, second);
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

      fillLevels();
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
      // La lista dice quién, qué caso y cuándo: ningún puntaje ni estrés.
      expect(text(items[0])).not.toMatch(/Puntaje|Estrés/i);
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
        'Total decisiones', 'Recomendadas', 'Aceptables', 'Con riesgo', 'Contraindicadas', 'Reflexiones', 'Evaluación', 'Tiempo total',
      ]);
      // Son conteos de hechos por clase de respuesta (3 + 1 + 1 + 0), no una medida.
      expect(cards.map(card => text(card.querySelector('.ui-stat__value')))).toEqual(['5', '3', '1', '1', '0', '0', 'Pendiente', '25 min 0 s']);
      expect(cards.every(card => card.getAttribute('aria-haspopup') === 'dialog')).toBe(true);

      cards[1].click();
      expect(dialog.open).toHaveBeenCalledTimes(1);
      const [component, options] = dialog.open.mock.calls[0];
      expect(component).toBe(TraceFeedbackDialogComponent);
      expect(options.size).toBe('lg');
      expect(options.data.panel.key).toBe('RECOMMENDED');
      expect(options.data.panel.title).toBe('Decisiones recomendadas');
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

  // req: modelo de métricas
  describe('sin puntaje ni estrés', () => {
    it('la traza no muestra puntaje, estrés, impactos ni porcentajes: ni en el detalle, ni en la lista, ni en los paneles', async () => {
      await render();
      expect(text(host())).not.toMatch(/Puntaje|Estrés|Impacto|\d+\s?%/i);
      expect(host().querySelectorAll('input[type="number"]')).toHaveLength(0);

      for (const card of [...host().querySelectorAll('.tr-metric')] as HTMLButtonElement[]) card.click();
      const panels = dialog.open.mock.calls.map(call => JSON.stringify(call[1].data.panel));
      expect(panels.length).toBeGreaterThan(0);
      expect(panels.join(' ')).not.toMatch(/puntaje|estrés|impacto|scoreDelta|stressDelta/i);
    });

    it('la línea de tiempo dice la clase en palabras y nada más (sin deltas)', async () => {
      await render();
      const event = host().querySelector('.tr-event')!;
      expect(text(event.querySelector('ui-badge'))).toBe('Recomendada');
      expect(event.getAttribute('data-accent')).toBe('recommended');
      expect(text(event.querySelector('small'))).toBe('00:30');
    });
  });

  // req: RN-09, modelo de métricas
  describe('hitos, persona por escena y final', () => {
    it('«Hitos» separa los cumplidos de los que faltaron y marca «clave» el que decide el final', async () => {
      await render();
      const section = host().querySelector('.tr-milestones')!;
      expect(text(section.querySelector('h2'))).toBe('Hitos');
      const groups = [...section.querySelectorAll('.tr-milestone-groups > div')];
      expect(text(groups[0])).toContain('Cumplidos');
      expect(text(groups[0])).toContain('Escuchar sin interrumpir');
      expect(groups[0].querySelector('ui-badge')).toBeNull();
      expect(text(groups[1])).toContain('Faltaron');
      expect(text(groups[1])).toContain('Recomendar medidas de protección');
      expect(text(groups[1].querySelector('ui-badge'))).toBe('clave');
    });

    it('un caso sin hitos lo dice en vez de dejar el bloque vacío', async () => {
      await render({ trace: id => of(traceFixture(id, { milestones: { done: [], missing: [] } })) });
      expect(text(host().querySelector('.tr-milestones'))).toContain('Este caso no declara hitos.');
    });

    it('«La persona por escena» lista cada escena con la frase de cómo se mostró la persona', async () => {
      await render();
      const items = [...host().querySelectorAll('.tr-persona-list li')].map(text);
      expect(items).toEqual(['Recepción → se muestra cautelosa y tensa', 'Cierre → se muestra abierta y serena']);
    });

    it('el final lleva su título, su mensaje y la razón en palabras', async () => {
      await render();
      const ending = host().querySelector('.tr-ending')!;
      expect(text(ending)).toContain('Cierre con brechas');
      expect(text(ending)).toContain('El caso se cerró con pasos pendientes.');
      expect([...ending.querySelectorAll('.tr-reason-list li')].map(text)).toEqual([
        'Faltó recomendar medidas de protección.', 'Hubo una respuesta con riesgo.',
      ]);
    });

    it('un intento sin final (no se completó) no inventa uno', async () => {
      await render({ trace: id => of(traceFixture(id, { ending: null, status: 'IN_PROGRESS', endedAt: null })) });
      expect(host().querySelector('.tr-ending')).toBeNull();
    });
  });

  // req: RN-09, modelo de métricas
  describe('la valoración del sistema, plegada hasta que el docente guarda la suya', () => {
    const systemSection = () => host().querySelector('.tr-system');

    it('mientras el docente no guarda la suya no hay perfil: solo se avisa que se mostrará después', async () => {
      await render({ trace: id => of(traceFixture(id, { systemEvaluation: null, systemEvaluationAvailable: true })) });
      expect(text(systemSection())).toContain('La valoración del sistema se mostrará cuando registres tu propia valoración.');
      expect(systemSection()!.querySelector('table')).toBeNull();
      expect(text(host())).not.toContain('Dos decisiones recomendadas de tres.');
    });

    it('si el sistema no tiene valoración que mostrar, la sección no aparece', async () => {
      await render({ trace: id => of(traceFixture(id, { systemEvaluation: null, systemEvaluationAvailable: false })) });
      expect(systemSection()).toBeNull();
    });

    it('con la valoración presente se muestra junto a la del docente, competencia por competencia', async () => {
      await render({
        trace: id => of(traceFixture(id, { systemEvaluation: SYSTEM_EVALUATION, systemEvaluationAvailable: true })),
        rubric: () => of(rubricFixture({
          scores: [{ criterionId: 1, level: 'LOGRADO', comment: null, evidence: {} }], overallLevel: 'LOGRADO',
        })),
      });
      const table = systemSection()!.querySelector('table')!;
      expect([...table.querySelectorAll('thead th')].map(text)).toEqual([
        'Competencia', 'Tu valoración', 'Valoración del sistema', 'Con qué se calculó',
      ]);
      const rows = [...table.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('th, td')].map(text));
      expect(rows).toEqual([
        ['Ética profesional', 'Logrado', 'En proceso', 'Dos decisiones recomendadas de tres.'],
        ['Ruta de atención', 'Pendiente', 'Sin evidencia', '—'],
      ]);
    });

    it('al guardar su valoración, el docente recibe la traza de nuevo y el perfil aparece', async () => {
      let calls = 0;
      await render({
        trace: id => of(++calls === 1
          ? traceFixture(id, { systemEvaluation: null, systemEvaluationAvailable: true })
          : traceFixture(id, { systemEvaluation: SYSTEM_EVALUATION, systemEvaluationAvailable: true })),
      });
      expect(systemSection()!.querySelector('table')).toBeNull();

      fillLevels();
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(calls).toBe(2);
      expect(systemSection()!.querySelector('table')).not.toBeNull();
      expect(text(systemSection())).not.toContain('se mostrará cuando registres');
    });
  });

  // req: SIEP-CU-04, RNF-04
  describe('rúbrica por niveles', () => {
    it('cada criterio pide un nivel con un selector (sin campo numérico) y cada nivel trae su nombre', async () => {
      await render();
      expect(criteriaCards()).toHaveLength(2);
      expect(host().querySelectorAll('input[type="number"], [min], [max], [step]')).toHaveLength(0);
      for (const index of [0, 1]) {
        expect([...levelSelect(index).options].map(text)).toEqual(['Sin calificar', 'En inicio', 'En proceso', 'Logrado', 'Destacado']);
        expect(text(criteriaCards()[index].querySelector('label'))).toBe('Nivel logrado');
      }
      expect(text(host().querySelector('.tr-rubric'))).not.toMatch(/total de|Calificación|Rango/);
    });

    it('el descriptor de cada nivel está a la vista y la ayuda del criterio dice el del nivel elegido', async () => {
      await render();
      const descriptors = [...host().querySelectorAll('.tr-levels__list > div')]
        .map(item => `${text(item.querySelector('dt'))} ${text(item.querySelector('dd'))}`);
      expect(descriptors).toEqual([
        'En inicio Aún no muestra la conducta esperada.', 'En proceso La muestra a veces y con apoyo.',
        'Logrado La muestra de forma sostenida.', 'Destacado La muestra y además la fundamenta.',
      ]);
      expect(text(criteriaCards()[0].querySelector('.ui-field__message'))).toBe('Elige el nivel que mejor describe la evidencia de este criterio.');

      pick(0, 'LOGRADO');
      expect(text(criteriaCards()[0].querySelector('.ui-field__message'))).toBe('La muestra de forma sostenida.');
    });

    it('guardar sin elegir un nivel en cada criterio no envía nada, lo dice sin la palabra «puntaje» y marca el criterio', async () => {
      await render();
      pick(0, 'LOGRADO');
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.saveRubric).not.toHaveBeenCalled();
      expect(text(host().querySelector('.tr-rubric__message'))).toBe('Elige un nivel en cada criterio para guardar la valoración.');
      expect(text(host().querySelector('.tr-rubric__message'))).not.toMatch(/puntaje/i);
      expect(text(criteriaCards()[1].querySelector('.ui-field__message--error'))).toBe('Elige un nivel para este criterio.');
      expect(levelSelect(1).getAttribute('aria-invalid')).toBe('true');
      expect(criteriaCards()[0].querySelector('.ui-field__message--error')).toBeNull();
    });

    it('elegir el nivel que faltaba quita el error de ESE criterio', async () => {
      await render();
      saveButton().click();
      fixture.detectChanges();
      expect(host().querySelectorAll('.ui-field__message--error')).toHaveLength(2);

      pick(0, 'EN_INICIO');
      expect(host().querySelectorAll('.ui-field__message--error')).toHaveLength(1);
      pick(1, 'DESTACADO');
      expect(host().querySelectorAll('.ui-field__message--error')).toHaveLength(0);
      expect(host().querySelector('.tr-rubric__message--error')).toBeNull();
    });

    it('la falta de un nivel se anuncia a quien usa lector de pantalla', async () => {
      await render();
      const announce = vi.spyOn(TestBed.inject(LiveRegionAnnouncer), 'announce');
      saveButton().click();
      expect(announce).toHaveBeenCalledWith('Elige un nivel en cada criterio para guardar la valoración.', 'polite');
    });

    it('guardar envía por cada criterio {criterionId, level, comment}: nunca un número', async () => {
      await render();
      fillLevels('DESTACADO', 'EN_INICIO');
      const comments = host().querySelectorAll<HTMLTextAreaElement>('.tr-criterion textarea');
      comments[0].value = 'Validó sin juzgar.';
      comments[0].dispatchEvent(new Event('input'));
      saveButton().click();
      await fixture.whenStable();

      expect(api.saveRubric).toHaveBeenCalledTimes(1);
      const [attemptId, rubricId, , scores] = api.saveRubric.mock.calls[0];
      expect(attemptId).toBe('a-1');
      expect(rubricId).toBe(7);
      expect(scores).toEqual([
        { criterionId: 1, level: 'DESTACADO', comment: 'Validó sin juzgar.' },
        { criterionId: 2, level: 'EN_INICIO', comment: '' },
      ]);
      for (const score of scores as object[]) expect(score).not.toHaveProperty('score');
    });

    it('los niveles ya guardados parten elegidos en el formulario', async () => {
      await render({
        rubric: () => of(rubricFixture({
          scores: [
            { criterionId: 1, level: 'LOGRADO', comment: 'Bien.', evidence: {} },
            { criterionId: 2, level: 'EN_PROCESO', comment: null, evidence: {} },
          ],
          overallLevel: 'EN_PROCESO',
        })),
      });
      expect(levelSelect(0).value).toBe('LOGRADO');
      expect(levelSelect(1).value).toBe('EN_PROCESO');
      expect(text(criteriaCards()[0].querySelector('ui-badge'))).toBe('Logrado');
      expect(text(criteriaCards()[1].querySelector('ui-badge'))).toBe('En proceso');
      expect((criteriaCards()[0].querySelector('textarea') as HTMLTextAreaElement).value).toBe('Bien.');
    });

    it('si el servidor no manda los niveles con su descriptor, ofrece igual los cuatro nombres', async () => {
      await render({ rubric: () => of(rubricFixture({ levels: undefined })) });
      expect([...levelSelect(0).options].map(text)).toEqual(['Sin calificar', 'En inicio', 'En proceso', 'Logrado', 'Destacado']);
    });

    it('al guardar con éxito avisa con un aviso y refresca la traza', async () => {
      await render();
      fillLevels();
      saveButton().click();
      await fixture.whenStable();

      expect(notify.success).toHaveBeenCalledWith('Evaluación guardada correctamente.');
      expect(api.attemptTrace.mock.calls.filter(call => call[0] === 'a-1').length).toBeGreaterThanOrEqual(2);
    });

    it('si el servidor rechaza el guardado, lo dice en línea junto al botón y no con un aviso de éxito', async () => {
      await render({ save: () => throwError(() => new HttpErrorResponse({ status: 500 })) });
      fillLevels();
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text(host().querySelector('.tr-rubric__message'))).toContain('No fue posible guardar la evaluación');
      expect(notify.success).not.toHaveBeenCalled();
    });
  });

  // req: RN-09
  describe('valoración formativa (RN-09)', () => {
    it('rotula el total como «Valoración formativa» con el nivel que envía el servidor y ningún número', async () => {
      await render({
        rubric: () => of(rubricFixture({
          overallLevel: 'LOGRADO',
          scores: [{ criterionId: 1, level: 'LOGRADO', comment: null, evidence: {} }],
        })),
      });
      const valuation = host().querySelector('.tr-valuation')!;
      expect(text(valuation)).toContain('Valoración formativa');
      expect(text(valuation)).toContain('Logrado');
      expect(text(valuation)).not.toMatch(/\d/);
    });

    it('sin evaluación aún: «Pendiente»; nunca una suma local de lo que se elige', async () => {
      await render();
      expect(text(host().querySelector('.tr-valuation'))).toContain('Pendiente');
      fillLevels('DESTACADO', 'DESTACADO');
      expect(text(host().querySelector('.tr-valuation'))).toContain('Pendiente');
      expect(text(host().querySelector('.tr-valuation'))).not.toMatch(/\d/);
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
      const partial = { id: 1, rubricName: 'Rúbrica', overallLevel: null, comment: null, evaluatedAt: '2026-10-10T11:00:00Z' };
      await render({ trace: id => of(traceFixture(id, { rubricEvaluations: [partial] })) });
      const card = [...host().querySelectorAll('.tr-metric')].find(el => text(el.querySelector('.ui-stat__label')) === 'Evaluación')!;
      expect(text(card.querySelector('.ui-stat__value'))).toBe('Pendiente');

      (card as HTMLButtonElement).click();
      expect(dialog.open.mock.calls.at(-1)![1].data.panel.intro).toContain('a medias');
    });

    it('con una evaluación concluida «Evaluación» dice «Aplicada»', async () => {
      const done = { id: 1, rubricName: 'Rúbrica', overallLevel: 'LOGRADO' as const, comment: null, evaluatedAt: '2026-10-10T11:00:00Z' };
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
      fillLevels();
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
