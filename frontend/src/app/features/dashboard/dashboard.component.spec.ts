import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { GrupoService } from '../../core/api/grupo.service';
import { ReporteService } from '../../core/api/reporte.service';
import { InstructorApi } from '../../core/api/instructor.api';
import { SimulationService } from '../../core/api/simulation.service';
import { AdminUser, UserAdminService } from '../../core/api/user-admin.service';
import { AuthService } from '../../core/auth/auth.service';
import { Dashboard } from '../../core/models/sesion.model';
import { SimulationCaseSummary, StudentAttemptSummary } from '../../core/models/simulation.model';
import { DashboardComponent } from './dashboard.component';
import { StudentDashboardComponent } from './student-dashboard.component';

/** El panel del estudiante tiene su propia spec: aquí basta su sitio. */
@Component({ selector: 'app-student-dashboard', template: '' })
class StudentDashboardStub {}

type Role = 'ESTUDIANTE' | 'PROFESOR' | 'ADMIN';

interface Services {
  reporte?: object;
  simulation?: object;
  instructor?: object;
  users?: object;
  grupos?: object;
}

/** Instancia sin plantilla: ejercita la lógica de cifras (las pruebas de DOM están más abajo). */
function createDashboard(role: Role, services: Services = {}): DashboardComponent {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(), provideRouter([]),
      { provide: AuthService, useValue: { hasRole: (...roles: string[]) => roles.includes(role) } },
      { provide: ReporteService, useValue: services.reporte ?? {} },
      { provide: SimulationService, useValue: services.simulation ?? { attemptHistory: () => of([]) } },
      { provide: InstructorApi, useValue: services.instructor ?? services.simulation ?? {} },
      { provide: UserAdminService, useValue: services.users ?? {} },
      { provide: GrupoService, useValue: services.grupos ?? {} },
    ],
  });
  return TestBed.runInInjectionContext(() => new DashboardComponent());
}

const httpFailure = () => throwError(() => new Error('HTTP 500'));

function dashboardData(partial: Partial<Dashboard> = {}): Dashboard {
  return {
    estudiantesActivos: 0, simulacionesCompletadasHoy: 0, puntajePromedioGlobal: 0,
    simulacionesCompletadas: 0, simulacionesEnProgreso: 0, puntajePromedioSimulacion: 0,
    decisionesAdecuadas: 0, decisionesRiesgosas: 0, decisionesInadecuadas: 0,
    decisionesProhibidas: 0, ultimosIntentos: [], intentosRecientes: [],
    ...partial,
  };
}

function caseSummary(code: string): SimulationCaseSummary {
  return {
    caseVersionId: 1, code, title: code, description: '', semanticVersion: '1.0.0',
    nodeCount: 1, status: 'PUBLISHED',
  };
}

function adminUser(activo: boolean): AdminUser {
  return { id: 1, nombre: 'Ada', apellido: 'Lovelace', email: 'ada@example.test', role: 'ESTUDIANTE', activo };
}

function ownAttempt(partial: Partial<StudentAttemptSummary> = {}): StudentAttemptSummary {
  return {
    attemptId: 'own-1', caseVersionId: 7, caseTitle: 'Caso propio', status: 'IN_PROGRESS',
    accumulatedScore: 0, adequateDecisions: 0, riskyDecisions: 0, inadequateDecisions: 0, prohibitedDecisions: 0,
    totalDurationSeconds: null, activeDurationSeconds: null, startedAt: '2026-09-01T10:00:00Z', endedAt: null,
    ...partial,
  };
}

function metricValue(component: DashboardComponent, label: string): string | undefined {
  return component.metrics().find(metric => metric.label === label)?.value;
}

describe('DashboardComponent', () => {
  // Las garantías del estudiante (cero como 0, «Sin datos» si falla una carga, interrumpido ≠ completado, un solo
  // «Continuar», nada ofrecido mientras carga) viven desde el plan visual F5-1 en student-dashboard.component.spec.
  // req: RNF-04
  describe('estudiante', () => {
    it('pinta el panel del estudiante y no carga nada por su cuenta', async () => {
      const attemptHistory = vi.fn();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(), provideRouter([]),
          { provide: AuthService, useValue: { hasRole: (...roles: string[]) => roles.includes('ESTUDIANTE') } },
          { provide: ReporteService, useValue: {} },
          { provide: SimulationService, useValue: { attemptHistory, listCases: vi.fn() } },
          { provide: InstructorApi, useValue: {} },
          { provide: UserAdminService, useValue: {} },
          { provide: GrupoService, useValue: {} },
        ],
      });
      TestBed.overrideComponent(DashboardComponent, {
        remove: { imports: [StudentDashboardComponent] }, add: { imports: [StudentDashboardStub] },
      });
      const fixture = TestBed.createComponent(DashboardComponent);
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('app-student-dashboard')).not.toBeNull();
      expect(host.querySelector('.td-stats, ui-stat')).toBeNull();
      expect(attemptHistory).not.toHaveBeenCalled();
    });
  });

  // Las cifras del profesor y de administración salen de `metrics()`: es la ÚNICA fuente (antes también salían de una
  // tarjeta de estado que repetía tres de cuatro). El plan visual F7-1 la retira.
  describe('cifras del profesor', () => {
    it('muestra los conteos en cero como 0', () => {
      const component = createDashboard('PROFESOR');
      component.loading.set(false);

      expect(metricValue(component, 'Grupos activos')).toBe('0');
      expect(metricValue(component, 'Estudiantes asignados')).toBe('0');
      expect(metricValue(component, 'Intentos recientes')).toBe('0');
    });

    it('«Revisar rúbricas» lleva a Rúbricas', () => {
      const component = createDashboard('PROFESOR');

      const rubricas = component.quickActions().find(action => action.label === 'Revisar rúbricas');
      expect(rubricas?.route).toBe('/portal/rubricas');
    });
  });

  describe('cifras de administración', () => {
    it('muestra los conteos en cero como 0', () => {
      const component = createDashboard('ADMIN');
      component.loading.set(false);

      expect(metricValue(component, 'Total de usuarios')).toBe('0');
      expect(metricValue(component, 'Casos publicados')).toBe('0');
      expect(metricValue(component, 'Simulaciones completadas')).toBe('0');
      expect(metricValue(component, 'Intentos recientes')).toBe('0');
    });
  });

  describe('cargas fallidas: «Sin datos» y no un cero falso', () => {
    it('profesor: si falla el panel, todos los conteos que dependen de él muestran «Sin datos»', () => {
      const component = createDashboard('PROFESOR', {
        reporte: { getDashboard: httpFailure },
        grupos: { listar: () => of([]) },
      });
      component.ngOnInit();

      expect(component.error()).toBe(true);
      expect(metricValue(component, 'Grupos activos')).toBe('Sin datos');
      expect(metricValue(component, 'Estudiantes asignados')).toBe('Sin datos');
      expect(metricValue(component, 'Intentos recientes')).toBe('Sin datos');
      expect(metricValue(component, 'Simulaciones completadas')).toBe('Sin datos');
      expect(metricValue(component, 'Decisiones críticas')).toBe('Sin datos');
      expect(metricValue(component, 'Casos asignados')).toBe('Sin datos');
    });

    it('profesor: si solo fallan los grupos, solo los conteos de grupos pierden el dato', () => {
      const component = createDashboard('PROFESOR', {
        reporte: { getDashboard: () => of(dashboardData({ simulacionesCompletadas: 4 })) },
        grupos: { listar: httpFailure },
      });
      component.ngOnInit();

      expect(component.error()).toBe(false);
      expect(metricValue(component, 'Grupos activos')).toBe('Sin datos');
      expect(metricValue(component, 'Estudiantes asignados')).toBe('Sin datos');
      expect(metricValue(component, 'Intentos recientes')).toBe('0');
      expect(metricValue(component, 'Simulaciones completadas')).toBe('4');
    });

    it('profesor: con las cargas correctas y datos vacíos, el 0 sigue siendo 0', () => {
      const component = createDashboard('PROFESOR', {
        reporte: { getDashboard: () => of(dashboardData()) },
        grupos: { listar: () => of([]) },
      });
      component.ngOnInit();

      expect(metricValue(component, 'Grupos activos')).toBe('0');
      expect(metricValue(component, 'Estudiantes asignados')).toBe('0');
      expect(metricValue(component, 'Simulaciones completadas')).toBe('0');
      expect(metricValue(component, 'Decisiones críticas')).toBe('0');
    });

    it('administración: si falla todo, ningún conteo se muestra como 0', () => {
      const component = createDashboard('ADMIN', {
        reporte: { getDashboard: httpFailure },
        users: { list: httpFailure },
        simulation: { listCases: httpFailure, recentAttempts: httpFailure, attemptHistory: () => of([]) },
      });
      component.ngOnInit();

      expect(component.error()).toBe(true);
      expect(metricValue(component, 'Total de usuarios')).toBe('Sin datos');
      expect(metricValue(component, 'Casos publicados')).toBe('Sin datos');
      expect(metricValue(component, 'Simulaciones completadas')).toBe('Sin datos');
      expect(metricValue(component, 'Intentos recientes')).toBe('Sin datos');
      expect(metricValue(component, 'Simulaciones en curso')).toBe('Sin datos');
    });

    it('administración: si falla solo la lista de usuarios, solo los conteos de usuarios pierden el dato', () => {
      const component = createDashboard('ADMIN', {
        reporte: { getDashboard: () => of(dashboardData({ simulacionesCompletadas: 3 })) },
        users: { list: httpFailure },
        simulation: {
          listCases: () => of([caseSummary('C1'), caseSummary('C2')]), recentAttempts: () => of([]),
          attemptHistory: () => of([]),
        },
      });
      component.ngOnInit();

      expect(component.error()).toBe(false);
      expect(metricValue(component, 'Total de usuarios')).toBe('Sin datos');
      expect(metricValue(component, 'Estudiantes activos')).toBe('Sin datos');
      expect(metricValue(component, 'Profesores activos')).toBe('Sin datos');
      expect(metricValue(component, 'Casos publicados')).toBe('2');
      expect(metricValue(component, 'Simulaciones completadas')).toBe('3');
    });

    it('administración: si falla solo el catálogo de casos, solo «Casos publicados» pierde el dato', () => {
      const component = createDashboard('ADMIN', {
        reporte: { getDashboard: () => of(dashboardData({ simulacionesCompletadas: 3 })) },
        users: { list: () => of([]) },
        simulation: { listCases: httpFailure, recentAttempts: () => of([]), attemptHistory: () => of([]) },
      });
      component.ngOnInit();

      expect(metricValue(component, 'Casos publicados')).toBe('Sin datos');
      expect(metricValue(component, 'Simulaciones completadas')).toBe('3');
      expect(metricValue(component, 'Total de usuarios')).toBe('0');
    });

    it('administración: si falla solo el panel, solo sus conteos pierden el dato', () => {
      const component = createDashboard('ADMIN', {
        reporte: { getDashboard: httpFailure },
        users: { list: () => of([adminUser(true)]) },
        simulation: { listCases: () => of([caseSummary('C1')]), recentAttempts: () => of([]), attemptHistory: () => of([]) },
      });
      component.ngOnInit();

      expect(component.dashboard()).toBeNull();
      expect(component.error()).toBe(false);
      expect(metricValue(component, 'Simulaciones completadas')).toBe('Sin datos');
      expect(metricValue(component, 'Decisiones críticas')).toBe('Sin datos');
      expect(metricValue(component, 'Simulaciones en curso')).toBe('Sin datos');
      expect(metricValue(component, 'Casos publicados')).toBe('1');
      expect(metricValue(component, 'Total de usuarios')).toBe('1');
      expect(metricValue(component, 'Intentos recientes')).toBe('0');
    });

    it('administración: con todas las cargas correctas y datos vacíos, el 0 sigue siendo 0', () => {
      const component = createDashboard('ADMIN', {
        reporte: { getDashboard: () => of(dashboardData()) },
        users: { list: () => of([]) },
        simulation: { listCases: () => of([]), recentAttempts: () => of([]), attemptHistory: () => of([]) },
      });
      component.ngOnInit();

      expect(metricValue(component, 'Total de usuarios')).toBe('0');
      expect(metricValue(component, 'Casos publicados')).toBe('0');
      expect(metricValue(component, 'Simulaciones completadas')).toBe('0');
      expect(metricValue(component, 'Intentos recientes')).toBe('0');
      expect(metricValue(component, 'Decisiones críticas')).toBe('0');
    });
  });

  // ── En DOM (plan visual F7-1) ──────────────────────────────────────────────────────────────────────────────────
  // req: RNF-04, BLOQUE-H, RQ-NEG-006
  describe('plantilla de docencia y administración', () => {
    let fixture: ComponentFixture<DashboardComponent>;
    const host = () => fixture.nativeElement as HTMLElement;
    const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    /** Lo que se lee de un elemento: sin lo decorativo (aria-hidden, p. ej. la ligadura del icono). */
    const spoken = (el: Element) => {
      const copy = el.cloneNode(true) as Element;
      copy.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove());
      return text(copy);
    };

    interface Api {
      reporte: { getDashboard: () => Observable<Dashboard> };
      history: () => Observable<StudentAttemptSummary[]>;
      grupos: { listar: () => Observable<unknown[]> };
      users: { list: () => Observable<AdminUser[]> };
      cases: () => Observable<SimulationCaseSummary[]>;
      recent: () => Observable<unknown[]>;
    }

    async function render(role: Role, api: Partial<Api> = {}, { stable = true } = {}) {
      const resolved: Api = {
        reporte: { getDashboard: () => of(dashboardData()) },
        history: () => of([]),
        grupos: { listar: () => of([{ id: 1, nombre: 'Grupo A', codigo: 'GA', totalEstudiantes: 12 }]) },
        users: { list: () => of([adminUser(true)]) },
        cases: () => of([caseSummary('C1')]),
        recent: () => of([]),
        ...api,
      };
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(), provideRouter([]),
          { provide: AuthService, useValue: { hasRole: (...roles: string[]) => roles.includes(role) } },
          { provide: ReporteService, useValue: resolved.reporte },
          { provide: SimulationService, useValue: { attemptHistory: resolved.history, listCases: resolved.cases } },
          { provide: InstructorApi, useValue: { recentAttempts: resolved.recent } },
          { provide: UserAdminService, useValue: resolved.users },
          { provide: GrupoService, useValue: resolved.grupos },
        ],
      });
      fixture = TestBed.createComponent(DashboardComponent);
      if (stable) await fixture.whenStable();
      else fixture.detectChanges();
    }

    afterEach(() => vi.useRealTimers());

    it('un solo h1 y cada acceso una sola vez (antes salían tres veces: cabecera, tarjeta de estado y acciones rápidas)', async () => {
      await render('PROFESOR');
      expect(host().querySelectorAll('h1')).toHaveLength(1);
      expect(text(host().querySelector('h1'))).toBe('Seguimiento de tus grupos');

      const hrefs = [...host().querySelectorAll('a[href]')].map(link => link.getAttribute('href'));
      for (const route of ['/portal/docente/trazabilidad', '/portal/rubricas', '/portal/reportes', '/portal/grupos']) {
        expect(hrefs.filter(href => href === route), route).toHaveLength(1);
      }
    });

    it('cada cifra aparece una vez y el 0 se muestra como 0', async () => {
      await render('PROFESOR');
      const labels = [...host().querySelectorAll('.ui-stat__label')].map(text);
      expect(new Set(labels).size).toBe(labels.length);
      expect(labels).toEqual([
        'Grupos activos', 'Estudiantes asignados', 'Intentos recientes', 'Casos asignados',
        'Simulaciones completadas', 'Promedio de desempeño', 'Decisiones críticas',
      ]);
      const stat = (label: string) => [...host().querySelectorAll('ui-stat')]
        .find(el => text(el.querySelector('.ui-stat__label')) === label);
      expect(text(stat('Grupos activos')!.querySelector('.ui-stat__value'))).toBe('1');
      expect(text(stat('Estudiantes asignados')!.querySelector('.ui-stat__value'))).toBe('12');
      expect(text(stat('Decisiones críticas')!.querySelector('.ui-stat__value'))).toBe('0');
    });

    it('«Ver detalle» lleva al intento de esa fila, no a la lista general', async () => {
      await render('PROFESOR', {
        reporte: {
          getDashboard: () => of(dashboardData({
            intentosRecientes: [
              { id: 'a-1', casoTitulo: 'Caso 1', estudiante: 'Ana', puntaje: 40, estado: 'COMPLETED' },
              { id: 'a-2', casoTitulo: 'Caso 2', estudiante: 'Beto', puntaje: 0, estado: 'IN_PROGRESS' },
            ],
          })),
        },
      });
      const rows = [...host().querySelectorAll('tbody tr')];
      expect(rows).toHaveLength(2);
      const links = rows.map(row => row.querySelector('a')?.getAttribute('href'));
      expect(links).toEqual([
        '/portal/docente/trazabilidad?intento=a-1',
        '/portal/docente/trazabilidad?intento=a-2',
      ]);
      // El nombre accesible empieza por el texto visible (2.5.3) y dice de quién es el intento.
      const first = rows[0].querySelector('a')!;
      expect(spoken(first)).toBe('Ver detalle');
      expect(first.getAttribute('aria-label')).toMatch(/^Ver detalle/);
      expect(first.getAttribute('aria-label')).toContain('Ana');
    });

    // req: ED-5 (E2: el ADMIN no juega; desde entonces nadie del personal tiene intento propio que retomar)
    it('nunca ofrece continuar un intento: ni el de OTRA persona ni uno propio del administrador (ED-5)', async () => {
      const others = dashboardData({
        intentosRecientes: [{ id: 'x', casoTitulo: 'Caso de otra', estudiante: 'Carla', puntaje: 0, estado: 'IN_PROGRESS' }],
      });
      await render('ADMIN', {
        reporte: { getDashboard: () => of(others) },
        history: () => of([ownAttempt({ caseTitle: 'Caso propio', caseVersionId: 7 })]),
      });
      // La tabla de «Intentos recientes» sí lista el intento de otra persona; lo que no puede salir es la tarjeta
      // «Retoma tu caso» ni un acceso a continuar nada.
      expect(host().querySelector('.td-continue')).toBeNull();
      expect(host().textContent).not.toContain('Retoma tu caso');
      expect(host().querySelector('a[href^="/portal/simulador/"]')).toBeNull();
      expect(host().textContent).not.toMatch(/Continuar (entrenamiento|simulación)/);
    });

    it('ni el docente ni el administrador piden un historial propio (el servidor se lo niega con 403 a los dos desde E2 y saldría un aviso de permiso en cada carga)', async () => {
      const teacherHistory = vi.fn(() => of([] as StudentAttemptSummary[]));
      await render('PROFESOR', { history: teacherHistory });
      expect(teacherHistory).not.toHaveBeenCalled();

      TestBed.resetTestingModule();
      const adminHistory = vi.fn(() => of([] as StudentAttemptSummary[]));
      await render('ADMIN', { history: adminHistory });
      expect(adminHistory).not.toHaveBeenCalled();
    });

    it('una sola señal de carga: esqueleto con aria-busy y el estado leído; ninguna cifra mientras tanto', async () => {
      vi.useFakeTimers();
      const loading = new Subject<Dashboard>();
      await render('PROFESOR', { reporte: { getDashboard: () => loading } }, { stable: false });
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      expect(host().querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0);
      expect(host().querySelectorAll('ui-skeleton').length).toBeGreaterThan(0);
      expect(host().querySelectorAll('ui-stat')).toHaveLength(0);
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Cargando el panel…');
      expect(host().querySelector('.dashboard-loading-banner')).toBeNull();

      loading.next(dashboardData());
      loading.complete();
      await vi.advanceTimersByTimeAsync(400);
      fixture.detectChanges();
      expect(host().querySelectorAll('ui-skeleton')).toHaveLength(0);
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('');
    });

    it('si falla el panel: UN error con «Reintentar» que vuelve a pedirlo, y ninguna cifra en 0', async () => {
      let calls = 0;
      await render('PROFESOR', {
        reporte: { getDashboard: () => (++calls === 1 ? httpFailure() : of(dashboardData())) },
      });
      const errors = host().querySelectorAll('ui-error-state');
      expect(errors).toHaveLength(1);
      expect(text(errors[0])).toContain('No pudimos cargar el panel.');
      expect(host().querySelectorAll('ui-stat')).toHaveLength(0);
      expect(host().querySelector('ui-empty-state')).toBeNull();

      (errors[0].querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(calls).toBe(2);
      expect(host().querySelector('ui-error-state')).toBeNull();
      expect(host().querySelectorAll('ui-stat').length).toBeGreaterThan(0);
    });

    it('primer uso del docente: «Aún no tienes grupos» con «Crear grupo», que lleva a Grupos', async () => {
      await render('PROFESOR', { grupos: { listar: () => of([]) } });
      const empty = host().querySelector('ui-empty-state');
      expect(empty).not.toBeNull();
      expect(text(empty)).toContain('Aún no tienes grupos');
      expect(host().querySelectorAll('ui-stat')).toHaveLength(0);

      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      (empty!.querySelector('button') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith('/portal/grupos');
    });

    it('sin restos del diseño anterior: nada de pixel-*, barras con aria sin rol ni estados sin forma', async () => {
      await render('PROFESOR', {
        reporte: {
          getDashboard: () => of(dashboardData({
            simulacionesEnProgreso: 2, decisionesRiesgosas: 1,
            intentosRecientes: [{ id: 'a-1', casoTitulo: 'Caso 1', estudiante: 'Ana', puntaje: 40, estado: 'IN_PROGRESS' }],
          })),
        },
      });
      expect(host().querySelector('[class*="pixel-"], .psy-skeleton, mat-table, table[mat-table]')).toBeNull();
      // Los estados de «Lectura docente» son insignias de la biblioteca (texto y tono), no una cápsula de color propia.
      expect(host().querySelector('.learning-gap-card__status')).toBeNull();
      expect(host().querySelectorAll('.td-gap ui-badge').length).toBeGreaterThan(0);
      // Ningún elemento lleva aria-label sin un rol que lo admita (la causa del aria-prohibited-attr de Axe).
      const unnamed = [...host().querySelectorAll('[aria-label]')].filter(el => {
        const role = el.getAttribute('role');
        return !role && !['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'NAV', 'SECTION', 'ASIDE', 'FORM', 'TABLE', 'UL', 'OL', 'SVG', 'UI-TABLE'].includes(el.tagName.toUpperCase());
      });
      expect(unnamed.map(el => el.tagName + '.' + el.className)).toEqual([]);
    });
  });
});
