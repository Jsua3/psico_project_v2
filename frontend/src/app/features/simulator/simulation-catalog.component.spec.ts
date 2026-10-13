import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { AttemptCompletionReport, CatalogItem, SimulationCaseSummary, StudentAttemptSummary } from '../../core/models/simulation.model';
import { SimulationCatalogComponent } from './simulation-catalog.component';

type Role = 'ESTUDIANTE' | 'PROFESOR' | 'ADMIN';

function caseSummary(id: number, partial: Partial<SimulationCaseSummary> = {}): SimulationCaseSummary {
  return {
    caseVersionId: id, code: `SIM-${id}`, title: `Caso ${id}`, description: 'Descripción del caso.',
    semanticVersion: '2.0.0', nodeCount: 8, status: 'PUBLISHED', ...partial,
  };
}

function attempt(partial: Partial<StudentAttemptSummary>): StudentAttemptSummary {
  return {
    attemptId: 'a', caseVersionId: 1, caseTitle: 'Caso 1', status: 'COMPLETED',
    accumulatedScore: 0, adequateDecisions: 0, riskyDecisions: 0,
    inadequateDecisions: 0, prohibitedDecisions: 0, totalDurationSeconds: null,
    activeDurationSeconds: null, startedAt: '2026-09-01T10:00:00Z', endedAt: null,
    ...partial,
  };
}

function report(partial: Partial<AttemptCompletionReport> = {}): AttemptCompletionReport {
  return {
    attemptId: 'done', caseTitle: 'Caso 1', status: 'COMPLETED', finalScore: 72, finalStress: 35,
    metrics: { professionalScore: 0, sceneStress: 0, victimRisk: 0, userTrust: 0, institutionalRouteActivated: false, revictimizationRisk: false },
    totalDurationSeconds: 754, phaseDurations: [], adequateDecisions: 5, riskyDecisions: 1, inadequateDecisions: 0,
    prohibitedDecisions: 0, toolsUsed: 2, reflectionsCount: 3, safeExitUsed: false, visitedNodeTitles: [],
    competencies: [], recommendations: ['Activa la ruta institucional antes de cerrar el caso.'], summaryMessage: '',
    ...partial,
  };
}

const httpFailure = () => throwError(() => ({ status: 500 }));

interface Api {
  listCases: () => Observable<SimulationCaseSummary[]>;
  attemptHistory: () => Observable<StudentAttemptSummary[]>;
  studentReport: (attemptId: string) => Observable<AttemptCompletionReport>;
  getCatalog: () => Observable<CatalogItem[]>;
}

function catalogItem(caseVersionId: number, order: number, unlocked: boolean, completed = false): CatalogItem {
  return { caseVersionId, code: `SIM-${caseVersionId}`, title: `Caso ${caseVersionId}`, description: '', order, unlocked, completed, locked: !unlocked };
}

/**
 * Catálogo, historial y reporte propio (plan visual F5-2), en DOM: lo abierto se continúa y no se reinicia (RN-07,
 * parte de interfaz), el error del historial no se confunde con «sin intentos» (RF-24), el reporte se abre en un
 * diálogo con su propio error y los estados salen humanizados. Sustituye a la spec que leía el código fuente
 * (estados en español, tildes, nombres de botón del e2e): las mismas garantías, ahora sobre lo que se ve.
 */
// req: RN-07, RF-24, RNF-04, BLOQUE-H
describe('SimulationCatalogComponent', () => {
  let fixture: ComponentFixture<SimulationCatalogComponent>;
  let navigate: ReturnType<typeof vi.fn>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const spoken = (el: Element) => {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll('[aria-hidden="true"], [hidden]').forEach(node => node.remove());
    return text(copy);
  };
  const cards = () => [...host().querySelectorAll('.case-card')];
  const card = (title: string) => cards().find(el => text(el.querySelector('h3')) === title)!;
  const buttons = (root: Element) => [...root.querySelectorAll('button, a')].map(spoken);
  const historySection = () => host().querySelector('.catalog-history')!;
  const dialog = () => document.querySelector('.cdk-dialog-container');
  // Valor de un dato del reporte por su rótulo (dt → dd).
  const field = (label: string) =>
    text([...(dialog()?.querySelectorAll('dt') ?? [])].find(el => text(el) === label)?.nextElementSibling ?? null);

  let queryParams: BehaviorSubject<ParamMap>;

  async function render(role: Role, api: Partial<Api> = {}, query: Record<string, string> = {}) {
    queryParams = new BehaviorSubject(convertToParamMap(query));
    const service: Api = {
      listCases: () => of([caseSummary(1)]),
      attemptHistory: () => of([]),
      studentReport: () => of(report()),
      getCatalog: () => of([]),
      ...api,
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: SimulationService, useValue: service },
        { provide: AuthService, useValue: { hasRole: (...roles: string[]) => roles.includes(role) } },
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParams } },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>;
    fixture = TestBed.createComponent(SimulationCatalogComponent);
    await fixture.whenStable();
  }

  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach(node => node.replaceChildren()));

  it('un h1 y los casos como tarjetas con su estado en español (nunca PUBLISHED)', async () => {
    await render('ESTUDIANTE', { listCases: () => of([caseSummary(1), caseSummary(2, { status: 'IN_REVIEW' })]) });
    expect(host().querySelectorAll('h1')).toHaveLength(1);
    expect(cards().map(el => text(el.querySelector('h3')))).toEqual(['Caso 1', 'Caso 2']);
    expect(text(card('Caso 1'))).toContain('Publicado');
    expect(text(card('Caso 2'))).toContain('En revisión');
    expect(text(card('Caso 1'))).toContain('8 escenas');
    expect(host().textContent).not.toMatch(/PUBLISHED|IN_REVIEW/);
  });

  it('RN-07: con un intento abierto la tarjeta dice «Continuar» y no ofrece iniciar otro', async () => {
    await render('ESTUDIANTE', {
      listCases: () => of([caseSummary(1), caseSummary(2), caseSummary(3)]),
      attemptHistory: () => of([
        attempt({ attemptId: 'p', caseVersionId: 1, caseTitle: 'Caso 1', status: 'PAUSED' }),
        attempt({ attemptId: 'old', caseVersionId: 3, caseTitle: 'Caso 3', status: 'SAFE_EXITED' }),
      ]),
    });
    expect(buttons(card('Caso 1'))).toEqual(['Continuar']);
    expect(text(card('Caso 1').querySelector('ui-badge.case-card__attempt'))).toBe('En pausa (reanudable)');
    expect(buttons(card('Caso 2'))).toEqual(['Iniciar simulación']);
    expect(buttons(card('Caso 3'))).toEqual(['Iniciar nuevo intento']);

    (card('Caso 1').querySelector('button') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/portal/simulador', 1]);
  });

  it('historial: la fila en pausa o en curso ofrece «Continuar»; la cerrada, «Ver resumen»; estados humanizados', async () => {
    await render('ESTUDIANTE', {
      attemptHistory: () => of([
        attempt({ attemptId: 'p', caseVersionId: 1, status: 'PAUSED', accumulatedScore: 20 }),
        attempt({ attemptId: 'c', caseVersionId: 1, status: 'IN_PROGRESS' }),
        attempt({ attemptId: 'done', caseVersionId: 1, status: 'COMPLETED', adequateDecisions: 4, prohibitedDecisions: 1, totalDurationSeconds: 754 }),
      ]),
    });
    // La región de la tabla no repite el nombre de su sección (Axe landmark-unique).
    expect(historySection().querySelector('ui-table [role="region"]')?.getAttribute('aria-label')).toBe('Tabla del historial de intentos');
    expect(text(historySection().querySelector('h2'))).toBe('Historial de intentos');
    const rows = [...historySection().querySelectorAll('tbody tr')];
    expect(rows.every(row => row.classList.contains('ui-table__row'))).toBe(true);
    expect(rows.map(row => text(row.querySelector('ui-badge')))).toEqual(['En pausa (reanudable)', 'En curso', 'Finalizado']);
    expect(rows.map(row => buttons(row))).toEqual([['Continuar'], ['Continuar'], ['Ver resumen']]);
    expect(text(rows[2])).toContain('12 min 34 s');
    expect([...historySection().querySelectorAll('th')].map(text)).toContain('Alertas éticas');
    expect(historySection().textContent).not.toMatch(/PAUSED|IN_PROGRESS|COMPLETED/);
  });

  it('RF-24: si falla el historial, un error con «Reintentar» —no «Aún no tienes intentos»— y el catálogo sigue', async () => {
    let calls = 0;
    await render('ESTUDIANTE', {
      attemptHistory: () => (++calls === 1 ? httpFailure() : of([attempt({ attemptId: 'done' })])),
    });
    const error = historySection().querySelector('ui-error-state')!;
    expect(text(error)).toContain('No pudimos cargar tu historial de intentos.');
    expect(historySection().querySelector('ui-empty-state')).toBeNull();
    expect(cards()).toHaveLength(1);

    (error.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(calls).toBe(2);
    expect(historySection().querySelector('ui-error-state')).toBeNull();
    expect(historySection().querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('sin intentos: el vacío lo dice (y no es un error)', async () => {
    await render('ESTUDIANTE', { attemptHistory: () => of([]) });
    expect(text(historySection().querySelector('ui-empty-state'))).toContain('Aún no tienes intentos');
    expect(historySection().querySelector('ui-error-state')).toBeNull();
  });

  it('el reporte se abre en un diálogo junto a su fila, con su contenido, alertas y estrés con tildes', async () => {
    await render('ESTUDIANTE', { attemptHistory: () => of([attempt({ attemptId: 'done', caseTitle: 'Caso 1' })]) });
    (historySection().querySelector('tbody button') as HTMLButtonElement).click();
    await fixture.whenStable();
    const content = text(dialog());
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(content).toContain('Caso 1');
    expect(field('Puntaje')).toBe('72');
    expect(field('Estrés final')).toBe('35 %');
    expect(field('Tiempo total')).toBe('12 min 34 s');
    expect(content).toContain('Activa la ruta institucional antes de cerrar el caso.');
    expect(content).toContain('no realiza diagnósticos clínicos');
    // Un solo «Cerrar» (el del pie), como los demás diálogos del sistema.
    expect([...dialog()!.querySelectorAll('button')].filter(button => spoken(button) === 'Cerrar')).toHaveLength(1);
    expect(dialog()!.querySelector('[role="status"]')).not.toBeNull();
    // El reporte ya no se pega al final de la página.
    expect(host().querySelector('.report-panel')).toBeNull();
  });

  it('si falla el reporte, el error vive en el diálogo con «Reintentar» y el catálogo no cambia', async () => {
    let calls = 0;
    await render('ESTUDIANTE', {
      attemptHistory: () => of([attempt({ attemptId: 'done' })]),
      studentReport: () => (++calls === 1 ? httpFailure() : of(report())),
    });
    (historySection().querySelector('tbody button') as HTMLButtonElement).click();
    await fixture.whenStable();
    const error = dialog()!.querySelector('ui-error-state')!;
    expect(text(error)).toContain('No pudimos cargar el resumen de este intento.');
    expect(host().querySelector('ui-error-state')).toBeNull();
    expect(cards()).toHaveLength(1);

    (error.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(calls).toBe(2);
    expect(field('Puntaje')).toBe('72');
  });

  it('si falla el catálogo: error con «Reintentar»; sin casos: vacío que lo dice', async () => {
    let calls = 0;
    await render('ESTUDIANTE', { listCases: () => (++calls === 1 ? httpFailure() : of([])) });
    const error = host().querySelector('.catalog-cases ui-error-state')!;
    expect(text(error)).toContain('No pudimos cargar los casos.');
    (error.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(text(host().querySelector('.catalog-cases ui-empty-state'))).toContain('Aún no tienes casos asignados');
  });

  // req: SIEP-RF-12 (gancho de interfaz), BLOQUE-H (plan visual F5-5)
  it('F5-5: un caso bloqueado lo dice con motivo y su botón queda deshabilitado CON motivo (enfocable, no navega)', async () => {
    await render('ESTUDIANTE', {
      listCases: () => of([caseSummary(1), caseSummary(2)]),
      getCatalog: () => of([catalogItem(1, 1, true, true), catalogItem(2, 2, false)]),
    });
    const locked = card('Caso 2');
    expect(text(locked.querySelector('ui-badge.case-card__lock'))).toBe('Bloqueado');
    expect(text(locked.querySelector('.case-card__reason'))).toBe('Completa «Caso 1» para abrirlo.');
    const start = locked.querySelector('button') as HTMLButtonElement;
    expect(spoken(start)).toBe('Iniciar simulación');
    expect(start.disabled).toBe(false);
    expect(start.getAttribute('aria-disabled')).toBe('true');
    start.click();
    expect(navigate).not.toHaveBeenCalled();
    expect(text(card('Caso 1').querySelector('ui-badge.case-card__done'))).toBe('Resuelto');
  });

  it('F5-5: si el catálogo de desbloqueo falla, no se inventa ningún bloqueo (decide el servidor)', async () => {
    await render('ESTUDIANTE', { listCases: () => of([caseSummary(1), caseSummary(2)]), getCatalog: httpFailure });
    expect(host().querySelector('.case-card__lock')).toBeNull();
    expect(cards()).toHaveLength(2);
  });

  it('F5-5: al volver de un caso bloqueado pedido por dirección, el aviso dice cuál y por qué', async () => {
    await render('ESTUDIANTE', {
      listCases: () => of([caseSummary(1), caseSummary(2)]),
      getCatalog: () => of([catalogItem(1, 1, true), catalogItem(2, 2, false)]),
    }, { bloqueado: '2' });
    expect(spoken(host().querySelector('.catalog-notice')!)).toBe('«Caso 2» todavía está bloqueado: completa «Caso 1» para abrirlo.');
    expect(host().querySelector('.catalog-notice')!.closest('[role="status"]')).not.toBeNull();
    // La guardia puede redirigir a esta misma ruta (Angular reutiliza el componente): el aviso sigue a la dirección.
    queryParams.next(convertToParamMap({}));
    await fixture.whenStable();
    expect(host().querySelector('.catalog-notice')).toBeNull();
    expect(host().querySelector('.catalog-notice-region[role="status"]')).not.toBeNull();
  });

  it('F5-6: un intento abierto se continúa aunque el caso haya quedado bloqueado (RN-07 manda)', async () => {
    await render('ESTUDIANTE', {
      listCases: () => of([caseSummary(1), caseSummary(2)]),
      getCatalog: () => of([catalogItem(1, 1, true), catalogItem(2, 2, false)]),
      attemptHistory: () => of([attempt({ attemptId: 'p', caseVersionId: 2, caseTitle: 'Caso 2', status: 'PAUSED' })]),
    });
    const card2 = card('Caso 2');
    expect(card2.querySelector('.case-card__lock')).toBeNull();
    const button = card2.querySelector('button') as HTMLButtonElement;
    expect(spoken(button)).toBe('Continuar');
    expect(button.getAttribute('aria-disabled')).toBeNull();
  });

  it('F5-6: sin historial no se sabe si hay algo abierto: «Abrir caso», nunca «Iniciar» (RN-07)', async () => {
    await render('ESTUDIANTE', { attemptHistory: httpFailure });
    expect(buttons(card('Caso 1'))).toEqual(['Abrir caso']);
  });

  it('administración: «Iniciar simulación» y «Editor visual», sin historial propio', async () => {
    await render('ADMIN');
    expect(buttons(card('Caso 1'))).toEqual(['Iniciar simulación', 'Editor visual']);
    (card('Caso 1').querySelectorAll('button')[1] as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/portal/casos', 1, 'editor']);
    expect(host().querySelector('.catalog-history')).toBeNull();
  });

  it('docencia: ve los casos sin acciones de juego', async () => {
    await render('PROFESOR');
    expect(buttons(card('Caso 1'))).toEqual([]);
  });
});

// Las etiquetas de estado salen de labels.ts (T15.4): se conservan las del catálogo.
describe('catálogo de simulaciones: textos en español (T15.4)', () => {
  it('rotula el estado de la versión del caso y del intento en español, no el valor interno', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: SimulationService, useValue: { listCases: () => of([]) } },
        { provide: AuthService, useValue: { hasRole: () => false } },
      ],
    });
    const catalog = TestBed.createComponent(SimulationCatalogComponent).componentInstance;
    expect(catalog.statusLabel('PUBLISHED')).toBe('Publicado');
    expect(catalog.statusLabel('DRAFT')).toBe('Borrador');
    expect(catalog.statusLabel('IN_REVIEW')).toBe('En revisión');
    expect(catalog.statusLabel('ARCHIVED')).toBe('Archivado');
    expect(catalog.statusLabel('COMPLETED')).toBe('Finalizado');
    expect(catalog.statusLabel('PAUSED')).toBe('En pausa (reanudable)');
    expect(catalog.statusLabel('IN_PROGRESS')).toBe('En curso');
    expect(catalog.statusLabel('')).toBe('Sin estado');
  });
});
