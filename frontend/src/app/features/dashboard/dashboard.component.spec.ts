import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { GrupoService } from '../../core/api/grupo.service';
import { ReporteService } from '../../core/api/reporte.service';
import { InstructorApi } from '../../core/api/instructor.api';
import { SimulationService } from '../../core/api/simulation.service';
import { AdminUser, UserAdminService } from '../../core/api/user-admin.service';
import { AuthService } from '../../core/auth/auth.service';
import { Dashboard } from '../../core/models/sesion.model';
import { SimulationCaseSummary, StudentAttemptSummary } from '../../core/models/simulation.model';
import { DashboardComponent } from './dashboard.component';

function attempt(partial: Partial<StudentAttemptSummary>): StudentAttemptSummary {
  return {
    attemptId: 'a', caseVersionId: 1, caseTitle: 'Caso', status: 'COMPLETED',
    accumulatedScore: 0, adequateDecisions: 0, riskyDecisions: 0,
    inadequateDecisions: 0, prohibitedDecisions: 0, totalDurationSeconds: null,
    activeDurationSeconds: null, startedAt: '2026-09-01T10:00:00Z', endedAt: null,
    ...partial,
  };
}

// Plain ts-jest (no jest-preset-angular) cannot compile the templateUrl, so the
// component is only instantiated inside an injection context to exercise its
// presentation logic (tarjeta de estado, filas). The template is covered by
// `ng build` type-checking and the manual dashboard smoke.
function createDashboard(
  role: 'ESTUDIANTE' | 'PROFESOR' | 'ADMIN',
  services: { reporte?: object; simulation?: object; users?: object; grupos?: object } = {}
): DashboardComponent {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { hasRole: (...roles: string[]) => roles.includes(role) } },
      { provide: ReporteService, useValue: services.reporte ?? {} },
      { provide: SimulationService, useValue: services.simulation ?? {} },
      { provide: InstructorApi, useValue: services.simulation ?? {} },
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

function metricValue(component: DashboardComponent, label: string): string | undefined {
  return component.metrics().find(metric => metric.label === label)?.value;
}

function itemValue(component: DashboardComponent, label: string): string | undefined {
  return component.heroStatusCard().items.find(item => item.label === label)?.value;
}

describe('DashboardComponent', () => {
  describe('tarjeta de estado del estudiante', () => {
    it('muestra los conteos en cero como 0 y el tiempo sin datos como texto', () => {
      const component = createDashboard('ESTUDIANTE');
      component.loading.set(false);

      expect(itemValue(component, 'Casos asignados')).toBe('0');
      expect(itemValue(component, 'Intentos completados')).toBe('0');
      expect(itemValue(component, 'Tiempo activo')).toBe('Sin datos');
    });

    it('cuenta como completados solo los COMPLETED y no ofrece un segundo «Continuar simulación»', () => {
      const component = createDashboard('ESTUDIANTE');
      component.loading.set(false);
      component.studentHistory.set([
        attempt({ status: 'COMPLETED', activeDurationSeconds: 600 }),
        attempt({ status: 'SAFE_EXITED' }),
      ]);

      expect(itemValue(component, 'Intentos completados')).toBe('1');
      expect(itemValue(component, 'Tiempo activo')).toBe('10 min');
      expect(component.heroStatusCard().action).toBeUndefined();
    });

    it('no ofrece «Continuar simulación» mientras carga', () => {
      const component = createDashboard('ESTUDIANTE');

      expect(component.loading()).toBe(true);
      expect(component.heroStatusCard().action).toBeUndefined();
    });

    it('rotula el intento interrumpido como Interrumpido y no como Completado', () => {
      const component = createDashboard('ESTUDIANTE');
      component.studentHistory.set([
        attempt({ attemptId: 'ok', status: 'COMPLETED' }),
        attempt({ attemptId: 'cut', status: 'SAFE_EXITED' }),
      ]);

      expect(component.rows().map(row => row.estado)).toEqual(['Completado', 'Interrumpido']);
    });
  });

  describe('tarjeta de estado del profesor', () => {
    it('muestra los conteos en cero como 0 y no menciona rúbricas', () => {
      const component = createDashboard('PROFESOR');
      component.loading.set(false);

      expect(itemValue(component, 'Grupos activos')).toBe('0');
      expect(itemValue(component, 'Estudiantes asignados')).toBe('0');
      expect(itemValue(component, 'Intentos recientes')).toBe('0');
      expect(component.heroStatusCard().chips).toEqual(['Grupos', 'Intentos']);
    });

    it('mientras carga tampoco anuncia rúbricas y conserva su acción', () => {
      const component = createDashboard('PROFESOR');

      const card = component.heroStatusCard();
      expect(card.chips).toEqual(['Grupos', 'Intentos']);
      expect(card.action?.route).toBe('/portal/docente/trazabilidad');
    });

    it('«Revisar rúbricas» lleva a Rúbricas', () => {
      const component = createDashboard('PROFESOR');

      const rubricas = component.quickActions().find(action => action.label === 'Revisar rúbricas');
      expect(rubricas?.route).toBe('/portal/rubricas');
    });
  });

  describe('tarjeta de estado de administración', () => {
    it('muestra los conteos en cero como 0', () => {
      const component = createDashboard('ADMIN');
      component.loading.set(false);

      expect(itemValue(component, 'Usuarios activos')).toBe('0');
      expect(itemValue(component, 'Casos publicados')).toBe('0');
      expect(itemValue(component, 'Simulaciones completadas')).toBe('0');
      expect(itemValue(component, 'Intentos recientes')).toBe('0');
    });
  });

  describe('cargas fallidas: «Sin datos» y no un cero falso', () => {
    it('estudiante: si falla el historial, ningún conteo se muestra como 0', () => {
      const component = createDashboard('ESTUDIANTE', {
        simulation: { attemptHistory: httpFailure, listCases: () => of([]) },
      });
      component.ngOnInit();

      expect(component.error()).toBe(true);
      expect(itemValue(component, 'Casos asignados')).toBe('Sin datos');
      expect(itemValue(component, 'Intentos completados')).toBe('Sin datos');
      expect(itemValue(component, 'Mejor puntaje')).toBe('Sin datos');
      expect(metricValue(component, 'Casos asignados')).toBe('Sin datos');
      expect(metricValue(component, 'Simulaciones en progreso')).toBe('Sin datos');
      expect(metricValue(component, 'Intentos completados')).toBe('Sin datos');
      expect(metricValue(component, 'Recomendaciones pendientes')).toBe('Sin datos');
    });

    it('estudiante: si solo falla el catálogo, solo «Casos asignados» pierde el dato', () => {
      const component = createDashboard('ESTUDIANTE', {
        simulation: {
          attemptHistory: () => of([attempt({ status: 'COMPLETED' })]),
          listCases: httpFailure,
        },
      });
      component.ngOnInit();

      expect(component.error()).toBe(false);
      expect(itemValue(component, 'Casos asignados')).toBe('Sin datos');
      expect(metricValue(component, 'Casos asignados')).toBe('Sin datos');
      expect(itemValue(component, 'Intentos completados')).toBe('1');
      expect(metricValue(component, 'Intentos completados')).toBe('1');
      expect(metricValue(component, 'Simulaciones en progreso')).toBe('0');
    });

    it('estudiante: con las cargas correctas y sin intentos, el 0 sigue siendo 0', () => {
      const component = createDashboard('ESTUDIANTE', {
        simulation: { attemptHistory: () => of([]), listCases: () => of([]) },
      });
      component.ngOnInit();

      expect(itemValue(component, 'Casos asignados')).toBe('0');
      expect(itemValue(component, 'Intentos completados')).toBe('0');
      expect(metricValue(component, 'Casos asignados')).toBe('0');
      expect(metricValue(component, 'Intentos completados')).toBe('0');
    });

    it('profesor: si falla el panel, todos los conteos que dependen de él muestran «Sin datos»', () => {
      const component = createDashboard('PROFESOR', {
        reporte: { getDashboard: httpFailure },
        grupos: { listar: () => of([]) },
      });
      component.ngOnInit();

      expect(component.error()).toBe(true);
      expect(itemValue(component, 'Grupos activos')).toBe('Sin datos');
      expect(itemValue(component, 'Estudiantes asignados')).toBe('Sin datos');
      expect(itemValue(component, 'Intentos recientes')).toBe('Sin datos');
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
      expect(itemValue(component, 'Grupos activos')).toBe('Sin datos');
      expect(itemValue(component, 'Estudiantes asignados')).toBe('Sin datos');
      expect(itemValue(component, 'Intentos recientes')).toBe('0');
      expect(metricValue(component, 'Grupos activos')).toBe('Sin datos');
      expect(metricValue(component, 'Simulaciones completadas')).toBe('4');
    });

    it('profesor: con las cargas correctas y datos vacíos, el 0 sigue siendo 0', () => {
      const component = createDashboard('PROFESOR', {
        reporte: { getDashboard: () => of(dashboardData()) },
        grupos: { listar: () => of([]) },
      });
      component.ngOnInit();

      expect(itemValue(component, 'Grupos activos')).toBe('0');
      expect(itemValue(component, 'Estudiantes asignados')).toBe('0');
      expect(metricValue(component, 'Simulaciones completadas')).toBe('0');
      expect(metricValue(component, 'Decisiones críticas')).toBe('0');
    });

    it('administración: si falla todo, ningún conteo se muestra como 0', () => {
      const component = createDashboard('ADMIN', {
        reporte: { getDashboard: httpFailure },
        users: { list: httpFailure },
        simulation: { listCases: httpFailure, recentAttempts: httpFailure },
      });
      component.ngOnInit();

      expect(component.error()).toBe(true);
      expect(itemValue(component, 'Usuarios activos')).toBe('Sin datos');
      expect(itemValue(component, 'Casos publicados')).toBe('Sin datos');
      expect(itemValue(component, 'Simulaciones completadas')).toBe('Sin datos');
      expect(itemValue(component, 'Intentos recientes')).toBe('Sin datos');
      expect(metricValue(component, 'Total de usuarios')).toBe('Sin datos');
      expect(metricValue(component, 'Simulaciones en curso')).toBe('Sin datos');
    });

    it('administración: si falla solo la lista de usuarios, solo los conteos de usuarios pierden el dato', () => {
      const component = createDashboard('ADMIN', {
        reporte: { getDashboard: () => of(dashboardData({ simulacionesCompletadas: 3 })) },
        users: { list: httpFailure },
        simulation: { listCases: () => of([caseSummary('C1'), caseSummary('C2')]), recentAttempts: () => of([]) },
      });
      component.ngOnInit();

      expect(component.error()).toBe(false);
      expect(itemValue(component, 'Usuarios activos')).toBe('Sin datos');
      expect(itemValue(component, 'Casos publicados')).toBe('2');
      expect(itemValue(component, 'Simulaciones completadas')).toBe('3');
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
        simulation: { listCases: httpFailure, recentAttempts: () => of([]) },
      });
      component.ngOnInit();

      expect(itemValue(component, 'Casos publicados')).toBe('Sin datos');
      expect(metricValue(component, 'Casos publicados')).toBe('Sin datos');
      expect(itemValue(component, 'Simulaciones completadas')).toBe('3');
      expect(itemValue(component, 'Usuarios activos')).toBe('0');
    });

    it('administración: si falla solo el panel, solo sus conteos pierden el dato', () => {
      const component = createDashboard('ADMIN', {
        reporte: { getDashboard: httpFailure },
        users: { list: () => of([adminUser(true)]) },
        simulation: { listCases: () => of([caseSummary('C1')]), recentAttempts: () => of([]) },
      });
      component.ngOnInit();

      expect(component.dashboard()).toBeNull();
      expect(component.error()).toBe(false);
      expect(itemValue(component, 'Simulaciones completadas')).toBe('Sin datos');
      expect(metricValue(component, 'Simulaciones completadas')).toBe('Sin datos');
      expect(metricValue(component, 'Decisiones críticas')).toBe('Sin datos');
      expect(metricValue(component, 'Simulaciones en curso')).toBe('Sin datos');
      expect(itemValue(component, 'Casos publicados')).toBe('1');
      expect(itemValue(component, 'Usuarios activos')).toBe('1');
      expect(itemValue(component, 'Intentos recientes')).toBe('0');
    });

    it('administración: con todas las cargas correctas y datos vacíos, el 0 sigue siendo 0', () => {
      const component = createDashboard('ADMIN', {
        reporte: { getDashboard: () => of(dashboardData()) },
        users: { list: () => of([]) },
        simulation: { listCases: () => of([]), recentAttempts: () => of([]) },
      });
      component.ngOnInit();

      expect(itemValue(component, 'Usuarios activos')).toBe('0');
      expect(itemValue(component, 'Casos publicados')).toBe('0');
      expect(itemValue(component, 'Simulaciones completadas')).toBe('0');
      expect(itemValue(component, 'Intentos recientes')).toBe('0');
      expect(metricValue(component, 'Total de usuarios')).toBe('0');
      expect(metricValue(component, 'Decisiones críticas')).toBe('0');
    });
  });
});
