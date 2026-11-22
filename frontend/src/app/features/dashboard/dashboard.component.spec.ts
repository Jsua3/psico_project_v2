import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AccessRequestAdminService } from '../../core/api/access-request-admin.service';
import { AssignmentService } from '../../core/api/assignment.service';
import { AuthoringApi } from '../../core/api/authoring.api';
import { GrupoService } from '../../core/api/grupo.service';
import { InstructorApi } from '../../core/api/instructor.api';
import { ReporteService } from '../../core/api/reporte.service';
import { UserAdminService } from '../../core/api/user-admin.service';
import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { NavBadgesService } from '../../shared/layout/nav-badges.service';
import { DashboardComponent } from './dashboard.component';
import { StudentDashboardComponent } from './student-dashboard.component';

@Component({ selector: 'app-student-dashboard', template: '' }) class StudentStub {}
const caso = { caseVersionId: 7, title: 'Caso de prueba', status: 'IN_REVIEW' };
const pagina = { items: [{ attemptId: 'a1', studentAlias: 'Estudiante-123', caseTitle: 'Caso de prueba', endedAt: '2026-11-20T12:00:00Z' }], coverage: { shown: 1, total: 12 } };

describe('Inicio docente y administración', () => {
  let role: string;
  let instructor: { listAttempts: ReturnType<typeof vi.fn> };
  let groups: { listar: ReturnType<typeof vi.fn> };
  let authoring: { listAuthoringCases: ReturnType<typeof vi.fn> };
  let users: { list: ReturnType<typeof vi.fn> };
  let requests: { listPending: ReturnType<typeof vi.fn>; updateStatus: ReturnType<typeof vi.fn> };
  let notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let badges: { fijar: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    role = 'PROFESOR';
    instructor = { listAttempts: vi.fn(() => of(pagina)) };
    groups = { listar: vi.fn(() => of([{ id: 1, nombre: 'Grupo A', totalEstudiantes: 3 }])) };
    authoring = { listAuthoringCases: vi.fn(() => of([caso])) };
    users = { list: vi.fn(() => of([{ role: 'ESTUDIANTE', activo: true, pendingApproval: true }])) };
    requests = { listPending: vi.fn(() => of([{ id: 1, nombre: 'Ana', apellido: 'Ríos', email: 'ana@example.test', createdAt: '2026-11-20' }])), updateStatus: vi.fn(() => of({})) };
    notify = { success: vi.fn(), error: vi.fn() };
    badges = { fijar: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]),
      { provide: AuthService, useValue: { currentUser: signal({ nombre: 'María' }), hasRole: (r: string) => role === r } },
      { provide: InstructorApi, useValue: instructor }, { provide: GrupoService, useValue: groups },
      { provide: AuthoringApi, useValue: authoring }, { provide: UserAdminService, useValue: users },
      { provide: AccessRequestAdminService, useValue: requests }, { provide: NotificationService, useValue: notify }, { provide: NavBadgesService, useValue: badges },
      { provide: AssignmentService, useValue: { list: () => of([{ id: 2, active: true, caseVersionId: 7 }, { id: 3, active: true, caseVersionId: 9 }]) } },
      // Los publicados nombran las asignaciones que el docente no autoró (el 9 no está entre sus casos en edición).
      { provide: SimulationService, useValue: { listCases: () => of([{ caseVersionId: 9, title: 'Violencia en el aula', status: 'PUBLISHED' }]) } },
      { provide: ReporteService, useValue: { getReporteGrupo: () => of({ simulacion: { estudiantes: [{ intentosCompletados: 2 }, { intentosCompletados: 0 }] } }) } },
    ] }).overrideComponent(DashboardComponent, { remove: { imports: [StudentDashboardComponent] }, add: { imports: [StudentStub] } });
  });
  it('pide la bandeja filtrada y publica el total, no el tamaño de la página', () => {
    const fixture = TestBed.createComponent(DashboardComponent); fixture.detectChanges();
    expect(instructor.listAttempts).toHaveBeenCalledWith({ evaluacion: 'pendiente', pageSize: 5 });
    expect(badges.fijar).toHaveBeenCalledWith('trazabilidad', 12);
    expect(fixture.componentInstance.grupos()[0].avances[2]).toBe(1);
    expect(fixture.componentInstance.totalRevision()).toBe(12);
  });
  it('conserva errores parciales y los limpia al reintentar', () => {
    instructor.listAttempts.mockReturnValue(throwError(() => new Error('sin red')));
    groups.listar.mockReturnValue(throwError(() => new Error('sin red')));
    const fixture = TestBed.createComponent(DashboardComponent); fixture.detectChanges();
    expect([...fixture.componentInstance.failedSources()]).toEqual(expect.arrayContaining(['revision', 'grupos']));
    expect(fixture.componentInstance.casosEdicion()).toHaveLength(1);
    instructor.listAttempts.mockReturnValue(of(pagina)); groups.listar.mockReturnValue(of([]));
    fixture.componentInstance.reload();
    expect(fixture.componentInstance.failedSources().size).toBe(0);
  });
  it('admin cuenta las tres fuentes y escribe solo solicitudes y cuentas en la insignia', () => {
    role = 'ADMIN'; const fixture = TestBed.createComponent(DashboardComponent); fixture.detectChanges();
    expect(fixture.componentInstance.totalAdmin()).toBe(3);
    expect(badges.fijar).toHaveBeenCalledWith('usuarios', 2);
    expect(fixture.componentInstance.descripcion()).toContain('3 cosas');
  });
  it('no presenta un total parcial como insignia completa', () => {
    role = 'ADMIN'; requests.listPending.mockReturnValue(throwError(() => new Error('sin red')));
    const fixture = TestBed.createComponent(DashboardComponent); fixture.detectChanges();
    expect(fixture.componentInstance.failedSources().has('solicitudes')).toBe(true);
    expect(badges.fijar).toHaveBeenCalledWith('usuarios', 0);
    expect(fixture.componentInstance.descripcion()).toContain('fuentes disponibles');
  });
  it('nombra cada asignación con el título del caso publicado, no con «Caso N»', () => {
    const fixture = TestBed.createComponent(DashboardComponent); fixture.detectChanges();
    expect(fixture.componentInstance.nombreCaso(9)).toBe('Violencia en el aula');
    expect(fixture.componentInstance.nombreCaso(7)).toBe('Caso de prueba');
    expect(fixture.componentInstance.nombreCaso(99)).toBe('Caso 99');
  });
  it('distingue los intentos de la misma persona en el mismo caso y siempre dice cuándo terminó', () => {
    instructor.listAttempts.mockReturnValue(of({ items: [
      { attemptId: 'b', studentAlias: 'Estudiante-1', caseVersionId: 7, caseTitle: 'Caso de prueba', startedAt: '2026-11-02', endedAt: null },
      { attemptId: 'a', studentAlias: 'Estudiante-1', caseVersionId: 7, caseTitle: 'Caso de prueba', startedAt: '2026-11-01', endedAt: '2026-11-01T12:00:00Z' },
      { attemptId: 'c', studentAlias: 'Estudiante-2', caseVersionId: 7, caseTitle: 'Caso de prueba', startedAt: '2026-11-01', endedAt: null },
    ], coverage: { shown: 3, total: 3 } }));
    const fixture = TestBed.createComponent(DashboardComponent); fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.numeroIntento()).toEqual({ a: 'Intento 1 de 2', b: 'Intento 2 de 2' });
    expect(c.terminoTexto(null)).toBe('Sin fecha de término registrada');
    const filas = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.protagonista .fila')];
    expect(filas).toHaveLength(3);
    expect(filas.every(fila => !!fila.querySelector('small')?.textContent?.trim())).toBe(true);
    expect(c.descripcion()).toBe('Tienes 3 recorridos por revisar.');
  });
  it('un solo recorrido por revisar se dice en singular', () => {
    instructor.listAttempts.mockReturnValue(of({ ...pagina, coverage: { shown: 1, total: 1 } }));
    const fixture = TestBed.createComponent(DashboardComponent); fixture.detectChanges();
    expect(fixture.componentInstance.descripcion()).toBe('Tienes 1 recorrido por revisar.');
  });
  it('dice el avance del grupo en palabras y sin plural equivocado', () => {
    const c = TestBed.createComponent(DashboardComponent).componentInstance;
    expect(c.avanceTexto(1, 1)).toBe('1 de 1 terminó');
    expect(c.avanceTexto(4, 12)).toBe('4 de 12 terminaron');
    expect(c.avanceTexto(0, 0)).toBe('Aún sin estudiantes en el grupo');
    expect(c.avanceTexto(null, 3)).toBe('Avance no disponible');
    expect(c.cantidad(1, 'estudiante', 'estudiantes')).toBe('1 estudiante');
  });
  it('admin descarta una solicitud desde el inicio y la insignia baja', () => {
    role = 'ADMIN'; const fixture = TestBed.createComponent(DashboardComponent); fixture.detectChanges();
    fixture.componentInstance.descartar(fixture.componentInstance.solicitudes()[0]);
    expect(requests.updateStatus).toHaveBeenCalledWith(1, 'DISMISSED');
    expect(fixture.componentInstance.solicitudes()).toHaveLength(0);
    expect(badges.fijar).toHaveBeenLastCalledWith('usuarios', 1);
    expect(notify.success).toHaveBeenCalled();
  });
  it('si descartar falla, la solicitud sigue en la lista y se avisa', () => {
    role = 'ADMIN'; requests.updateStatus.mockReturnValue(throwError(() => new Error('x')));
    const fixture = TestBed.createComponent(DashboardComponent); fixture.detectChanges();
    fixture.componentInstance.descartar(fixture.componentInstance.solicitudes()[0]);
    expect(fixture.componentInstance.solicitudes()).toHaveLength(1);
    expect(notify.error).toHaveBeenCalled();
    expect(fixture.componentInstance.descartando()).toBeNull();
  });
});
