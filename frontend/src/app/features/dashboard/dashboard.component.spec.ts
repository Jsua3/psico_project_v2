import { TestBed } from '@angular/core/testing';
import { GrupoService } from '../../core/api/grupo.service';
import { ReporteService } from '../../core/api/reporte.service';
import { SimulationService } from '../../core/api/simulation.service';
import { UserAdminService } from '../../core/api/user-admin.service';
import { AuthService } from '../../core/auth/auth.service';
import { StudentAttemptSummary } from '../../core/models/simulation.model';
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
function createDashboard(role: 'ESTUDIANTE' | 'PROFESOR' | 'ADMIN'): DashboardComponent {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { hasRole: (...roles: string[]) => roles.includes(role) } },
      { provide: ReporteService, useValue: {} },
      { provide: SimulationService, useValue: {} },
      { provide: UserAdminService, useValue: {} },
      { provide: GrupoService, useValue: {} },
    ],
  });
  return TestBed.runInInjectionContext(() => new DashboardComponent());
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
});
