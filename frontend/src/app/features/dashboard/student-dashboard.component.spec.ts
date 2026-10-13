import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { SimulationCaseSummary, StudentAttemptSummary } from '../../core/models/simulation.model';
import { StudentDashboardComponent } from './student-dashboard.component';

function attempt(partial: Partial<StudentAttemptSummary>): StudentAttemptSummary {
  return {
    attemptId: 'a', caseVersionId: 1, caseTitle: 'Caso', status: 'COMPLETED',
    accumulatedScore: 0, adequateDecisions: 0, riskyDecisions: 0,
    inadequateDecisions: 0, prohibitedDecisions: 0, totalDurationSeconds: null,
    activeDurationSeconds: null, startedAt: '2026-09-01T10:00:00Z', endedAt: null,
    ...partial,
  };
}

function caseSummary(id: number): SimulationCaseSummary {
  return { caseVersionId: id, code: `C${id}`, title: `Caso ${id}`, description: '', semanticVersion: '1.0.0', nodeCount: 1, status: 'PUBLISHED' };
}

const httpFailure = () => throwError(() => ({ status: 500 }));

interface Api {
  attemptHistory: () => Observable<StudentAttemptSummary[]>;
  listCases: () => Observable<SimulationCaseSummary[]>;
}

/**
 * Panel del estudiante (plan visual F5-1), en DOM: cada cifra una vez, una sola señal de carga, error y vacío por
 * bloque con `ui-error-state`/`ui-empty-state` (uiDataState), «Continuar» solo para el intento abierto y gráficos con
 * estado sin datos, globo y tabla accesible. Recoge las garantías del estudiante que vivían en dashboard.component.spec
 * («Sin datos» y no un cero falso; interrumpido ≠ completado; un solo «Continuar»).
 */
// req: RNF-04, RNF-004, BLOQUE-H, RQ-NEG-008
describe('StudentDashboardComponent', () => {
  let fixture: ComponentFixture<StudentDashboardComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  /** Lo que se lee de un elemento: sin lo decorativo (aria-hidden, p. ej. la ligadura del icono). */
  const spoken = (el: Element) => {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove());
    return text(copy);
  };
  const stat = (label: string) => [...host().querySelectorAll('ui-stat')]
    .find(el => text(el.querySelector('.ui-stat__label')) === label);
  const statValue = (label: string) => text(stat(label)?.querySelector('.ui-stat__value') ?? null);
  const actions = (name: RegExp) => [...host().querySelectorAll('a, button')].filter(el => name.test(spoken(el)));

  /** `stable: false` para las pruebas con relojes falsos: whenStable esperaría a un temporizador que no avanza. */
  async function render(api: Partial<Api>, { stable = true } = {}) {
    const service: Api = { attemptHistory: () => of([]), listCases: () => of([]), ...api };
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: SimulationService, useValue: service }],
    });
    fixture = TestBed.createComponent(StudentDashboardComponent);
    if (stable) await fixture.whenStable();
    else fixture.detectChanges();
  }

  afterEach(() => vi.useRealTimers());

  it('un h1 con las dos acciones de la página: «Ir a la sala» y «Ver casos y resultados»', async () => {
    await render({ attemptHistory: () => of([attempt({})]) });
    expect(host().querySelectorAll('h1')).toHaveLength(1);
    expect(text(host().querySelector('h1'))).toBe('Tu entrenamiento psicosocial');
    expect(actions(/^Ir a la sala$/)[0]?.getAttribute('href')).toBe('/portal/jugar');
    expect(actions(/^Ver casos y resultados$/)[0]?.getAttribute('href')).toBe('/portal/simulador');
  });

  it('cada cifra aparece UNA vez (sin la tarjeta de estado que repetía cuatro de seis) y el 0 se muestra como 0', async () => {
    await render({
      attemptHistory: () => of([attempt({ status: 'SAFE_EXITED', accumulatedScore: 0 })]),
      listCases: () => of([caseSummary(1)]),
    });
    const labels = [...host().querySelectorAll('.ui-stat__label')].map(text);
    expect(labels).toEqual(['Casos asignados', 'Intentos completados', 'Mejor puntaje', 'Tiempo activo']);
    expect(new Set(labels).size).toBe(labels.length);
    expect(statValue('Casos asignados')).toBe('1');
    expect(statValue('Intentos completados')).toBe('0');
    expect(statValue('Mejor puntaje')).toBe('Pendiente');
    expect(statValue('Tiempo activo')).toBe('Sin datos');
  });

  it('cuenta como completados solo los COMPLETED; el interrumpido no se rotula como finalizado', async () => {
    await render({
      attemptHistory: () => of([
        attempt({ attemptId: 'ok', caseTitle: 'Caso A', status: 'COMPLETED', activeDurationSeconds: 600 }),
        attempt({ attemptId: 'cut', caseTitle: 'Caso B', status: 'SAFE_EXITED' }),
      ]),
    });
    expect(statValue('Intentos completados')).toBe('1');
    expect(statValue('Tiempo activo')).toBe('10 min');
    const states = [...host().querySelectorAll('tbody tr')].map(row => text(row.querySelector('ui-badge')));
    expect(states).toEqual(['Finalizado', 'Cerrado con salida segura']);
  });

  it('una sola señal de carga: esqueleto con aria-busy y el estado leído, sin franja ni «Cargando…» repetidos', async () => {
    vi.useFakeTimers();
    const history = new Subject<StudentAttemptSummary[]>();
    await render({ attemptHistory: () => history }, { stable: false });
    await vi.advanceTimersByTimeAsync(200);
    fixture.detectChanges();
    const busy = host().querySelectorAll('[aria-busy="true"]');
    expect(busy).toHaveLength(1);
    expect(busy[0].querySelectorAll('ui-skeleton').length).toBeGreaterThan(0);
    expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Cargando tu avance…');
    expect(host().textContent).not.toMatch(/Cargando métricas/);
    expect(actions(/^Continuar$/)).toHaveLength(0);

    history.next([attempt({})]);
    history.complete();
    await vi.advanceTimersByTimeAsync(400);
    fixture.detectChanges();
    expect(host().querySelectorAll('[aria-busy="true"]')).toHaveLength(0);
    expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('');
  });

  it('si falla el historial: UN error con «Reintentar» que recarga solo el historial, y ninguna cifra en 0', async () => {
    let calls = 0;
    const listCases = vi.fn(() => of([caseSummary(1)]));
    await render({
      attemptHistory: () => (++calls === 1 ? httpFailure() : of([attempt({ status: 'COMPLETED' })])),
      listCases,
    });
    const errors = host().querySelectorAll('ui-error-state');
    expect(errors).toHaveLength(1);
    expect(text(errors[0])).toContain('No pudimos cargar tu historial de intentos.');
    expect(host().querySelectorAll('ui-stat')).toHaveLength(0);
    expect(host().querySelector('ui-empty-state')).toBeNull();

    (errors[0].querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(calls).toBe(2);
    expect(listCases).toHaveBeenCalledTimes(1);
    expect(host().querySelector('ui-error-state')).toBeNull();
    expect(statValue('Intentos completados')).toBe('1');
  });

  it('si solo falla el catálogo, solo «Casos asignados» pierde el dato', async () => {
    await render({ attemptHistory: () => of([attempt({ status: 'COMPLETED' })]), listCases: httpFailure });
    expect(host().querySelector('ui-error-state')).toBeNull();
    expect(statValue('Casos asignados')).toBe('Sin datos');
    expect(text(stat('Casos asignados')!.querySelector('.ui-stat__hint'))).toBe('No se pudo cargar');
    expect(statValue('Intentos completados')).toBe('1');
  });

  it('primer uso: UN estado vacío con la sala como acción; ningún gráfico, cifra ni tabla vacíos', async () => {
    await render({ attemptHistory: () => of([]), listCases: () => of([caseSummary(1), caseSummary(2)]) });
    const empty = host().querySelectorAll('ui-empty-state');
    expect(empty).toHaveLength(1);
    expect(text(empty[0])).toContain('Aún no has empezado ningún caso');
    expect(text(empty[0])).toContain('Tienes 2 casos disponibles.');
    expect(spoken(empty[0].querySelector('button')!)).toBe('Ir a la sala');
    expect(host().querySelectorAll('ui-stat, table, svg, .sd-chart')).toHaveLength(0);
  });

  it('sin casos asignados (F5-5): el vacío lo dice y no ofrece una acción que no lleva a nada', async () => {
    await render({ attemptHistory: () => of([]), listCases: () => of([]) });
    const empty = host().querySelector('ui-empty-state')!;
    expect(text(empty)).toContain('Aún no tienes casos asignados');
    expect(empty.querySelector('button')).toBeNull();
  });

  it('intento abierto: UNA tarjeta «Continuar» que lleva al caso y dice si está en pausa, sin porcentaje inventado', async () => {
    await render({
      attemptHistory: () => of([
        attempt({ attemptId: 'p', caseVersionId: 7, caseTitle: 'Caso en pausa', status: 'PAUSED', accumulatedScore: 40 }),
        attempt({ attemptId: 'done', status: 'COMPLETED' }),
      ]),
    });
    const continuar = actions(/^Continuar$/);
    expect(continuar).toHaveLength(1);
    expect(continuar[0].getAttribute('href')).toBe('/portal/simulador/7');
    const card = continuar[0].closest('.sd-continue')!;
    expect(text(card)).toContain('Caso en pausa');
    expect(text(card.querySelector('ui-badge'))).toBe('En pausa (reanudable)');
    expect(text(card)).not.toMatch(/%/);
    expect(host().querySelector('[aria-label="Progreso de entrenamiento"]')).toBeNull();
  });

  it('sin intento abierto no hay «Continuar»', async () => {
    await render({ attemptHistory: () => of([attempt({ status: 'COMPLETED' }), attempt({ status: 'SAFE_EXITED' })]) });
    expect(actions(/^Continuar$/)).toHaveLength(0);
  });

  it('los tres gráficos tienen estado sin datos propio cuando su serie está vacía', async () => {
    await render({ attemptHistory: () => of([attempt({ status: 'IN_PROGRESS' })]) });
    const charts = [...host().querySelectorAll('.sd-chart')];
    expect(charts.map(chart => text(chart.querySelector('h3')))).toEqual(['Evolución de puntaje', 'Progreso por caso', 'Tus decisiones']);
    expect(text(charts[0].querySelector('.sd-chart__empty'))).toBe('Aún sin puntajes: aparecerán cuando tus intentos sumen puntos.');
    expect(charts[1].querySelector('.sd-chart__empty')).toBeNull();
    expect(text(charts[2].querySelector('.sd-chart__empty'))).toBe('Aún sin decisiones registradas.');
  });

  it('con datos, cada punto o barra tiene globo y los valores están en una tabla para el lector de pantalla', async () => {
    await render({
      attemptHistory: () => of([
        attempt({ attemptId: '1', caseTitle: 'Violencia familiar y tentativa de feminicidio', accumulatedScore: 30, adequateDecisions: 2, riskyDecisions: 1, startedAt: '2026-09-01T10:00:00Z' }),
        attempt({ attemptId: '2', caseTitle: 'Violencia familiar y tentativa de feminicidio', status: 'SAFE_EXITED', accumulatedScore: 45, adequateDecisions: 1, startedAt: '2026-09-02T10:00:00Z' }),
      ]),
    });
    const [score, progress, decisions] = [...host().querySelectorAll('.sd-chart')];
    const svg = score.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Evolución de puntaje: 2 intentos, de 30 a 45 puntos');
    expect(score.querySelectorAll('.sd-chart__hit')).toHaveLength(2);
    const cells = (row: Element) => [...row.querySelectorAll('th, td')].map(text).join(' ');
    expect([...score.querySelectorAll('.ds-sr-only table tbody tr')].map(cells)).toEqual([
      'Intento 1 Violencia familiar y tentativa de feminicidio 30',
      'Intento 2 Violencia familiar y tentativa de feminicidio 45',
    ]);
    // Título entero en el DOM (lo recorta el CSS, no el código) y la cuenta en el globo.
    expect(text(progress.querySelector('.sd-bar__label'))).toBe('Violencia familiar y tentativa de feminicidio');
    expect(text(progress.querySelector('.sd-bar__value'))).toBe('1 de 2');
    expect([...decisions.querySelectorAll('li')].map(text)).toEqual(['Adecuadas 3 (75 %)', 'Riesgosas 1 (25 %)']);
  });

  it('al pasar el ratón por un punto o una barra aparece su globo con el dato exacto', async () => {
    await render({
      attemptHistory: () => of([
        attempt({ attemptId: '1', caseTitle: 'Caso A', accumulatedScore: 30, startedAt: '2026-09-01T10:00:00Z' }),
        attempt({ attemptId: '2', caseTitle: 'Caso A', status: 'SAFE_EXITED', accumulatedScore: 45, startedAt: '2026-09-02T10:00:00Z' }),
      ]),
    });
    vi.useFakeTimers();
    // El globo visible es el panel del overlay (las descripciones de AriaDescriber también llevan role="tooltip").
    const tooltip = () => text(document.querySelector('ui-tooltip-panel'));
    const hover = async (el: Element) => {
      el.dispatchEvent(new MouseEvent('mouseenter'));
      await vi.advanceTimersByTimeAsync(450);
    };
    await hover(host().querySelectorAll('.sd-chart__hit')[1]);
    expect(tooltip()).toBe('Intento 2 · Caso A: 45 puntos');
    host().querySelectorAll('.sd-chart__hit')[1].dispatchEvent(new MouseEvent('mouseleave'));
    await vi.advanceTimersByTimeAsync(300);
    await hover(host().querySelector('.sd-bar')!);
    expect(tooltip()).toBe('Caso A: 1 de 2 intentos completados');
  });

  it('el historial reciente va en una tabla con nombre, estados humanizados y el enlace al historial completo', async () => {
    await render({ attemptHistory: () => of([attempt({ status: 'PAUSED', caseTitle: 'Caso A', accumulatedScore: 12 })]) });
    const table = host().querySelector('ui-table')!;
    expect(table.querySelector('[role="region"]')?.getAttribute('aria-label')).toBe('Tus últimos intentos');
    expect([...table.querySelectorAll('th')].map(text)).toEqual(['Caso', 'Inicio', 'Estado', 'Puntaje']);
    expect(text(table.querySelector('tbody ui-badge'))).toBe('En pausa (reanudable)');
    expect(table.querySelector('tbody')!.textContent).not.toMatch(/PAUSED|IN_PROGRESS/);
    expect(actions(/^Ver todo el historial$/)[0]?.getAttribute('href')).toBe('/portal/simulador');
  });

  // Los estilos en línea los vigila ui:lint (inlineStyleAttr); las barras usan [style.--var], que sí vale (GUIA).
  it('sin restos de la identidad «pixel» del panel anterior (VD-3)', async () => {
    await render({ attemptHistory: () => of([attempt({ accumulatedScore: 10 })]) });
    expect(host().querySelectorAll('.pixel-card, .pixel-panel, .pixel-badge, .pixel-progress')).toHaveLength(0);
  });
});
