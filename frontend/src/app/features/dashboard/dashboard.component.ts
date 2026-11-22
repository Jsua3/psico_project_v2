import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AccessRequest, AccessRequestAdminService } from '../../core/api/access-request-admin.service';
import { AssignmentService } from '../../core/api/assignment.service';
import { AuthoringApi } from '../../core/api/authoring.api';
import { Grupo, GrupoService } from '../../core/api/grupo.service';
import { InstructorApi } from '../../core/api/instructor.api';
import { ReporteService } from '../../core/api/reporte.service';
import { AdminUser, UserAdminService } from '../../core/api/user-admin.service';
import { AuthService } from '../../core/auth/auth.service';
import { Assignment } from '../../core/models/assignment.model';
import { InstructorAttemptsPage, SimulationCaseSummary } from '../../core/models/simulation.model';
import { haceCuanto } from '../simulator/trace-labels.util';
import { NavBadgesService } from '../../shared/layout/nav-badges.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiProgress } from '../../shared/ui/progress/ui-progress';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { StudentDashboardComponent } from './student-dashboard.component';

type Source = 'revision' | 'grupos' | 'casos' | 'solicitudes' | 'usuarios';
interface GrupoVista { grupo: Grupo; asignaciones: Assignment[] | null; avances: Record<number, number | null>; }

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, UiButton, UiProgress, UiPageHeader, UiSkeleton, UiEmptyState, UiErrorState, StudentDashboardComponent],
  templateUrl: './dashboard.component.html', styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly instructor = inject(InstructorApi);
  private readonly gruposApi = inject(GrupoService);
  private readonly asignacionesApi = inject(AssignmentService);
  private readonly reportes = inject(ReporteService);
  private readonly autoria = inject(AuthoringApi);
  private readonly usuariosApi = inject(UserAdminService);
  private readonly solicitudesApi = inject(AccessRequestAdminService);
  private readonly badges = inject(NavBadgesService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);
  /** Solicitud que se está descartando, para no mandar dos veces el mismo cambio. */
  readonly descartando = signal<number | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly failedSources = signal<ReadonlySet<Source>>(new Set());
  readonly revision = signal<InstructorAttemptsPage | null>(null);
  readonly grupos = signal<GrupoVista[]>([]);
  readonly casos = signal<SimulationCaseSummary[]>([]);
  readonly solicitudes = signal<AccessRequest[]>([]);
  readonly usuarios = signal<AdminUser[]>([]);
  readonly state = uiDataState({ loading: this.loading, error: this.error, isEmpty: computed(() => false) });
  readonly cuentasActivas = computed(() => this.usuarios().filter(u => u.activo));
  contarRol(rol: string): number { return this.cuentasActivas().filter(u => u.role === rol).length; }
  readonly pendientesCuentas = computed(() => this.usuarios().filter(u => u.pendingApproval).length);
  readonly casosRevision = computed(() => this.casos().filter(c => c.status === 'IN_REVIEW'));
  readonly casosEdicion = computed(() => this.casos().filter(c => c.status === 'DRAFT' || c.status === 'IN_REVIEW').slice(0, 3));
  readonly totalRevision = computed(() => this.revision()?.coverage.total ?? 0);
  readonly totalAdmin = computed(() => this.solicitudes().length + this.pendientesCuentas() + this.casosRevision().length);
  readonly titulo = computed(() => `Hola, ${this.auth.currentUser()?.nombre?.trim().split(/\s+/)[0] || 'bienvenido'}`);
  readonly descripcion = computed(() => {
    if (this.loading()) return 'Estamos preparando tu inicio.';
    if (this.isAdmin()) return this.failedSources().size ? 'Consulta las fuentes disponibles.' : this.totalAdmin() ? `Tienes ${this.totalAdmin()} cosas por atender.` : 'Todo al día.';
    return this.failedSources().has('revision') ? 'No pudimos consultar los recorridos pendientes.' : this.totalRevision() ? `Tienes ${this.totalRevision()} recorridos por revisar.` : 'No tienes nada pendiente por revisar.';
  });
  ngOnInit(): void { if (this.isEstudiante()) this.loading.set(false); else this.reload(); }
  isEstudiante(): boolean { return this.auth.hasRole('ESTUDIANTE'); }
  isAdmin(): boolean { return this.auth.hasRole('ADMIN'); }
  fallo(source: Source): boolean { return this.failedSources().has(source); }
  private fallar<T>(source: Source, fallback: T) {
    this.failedSources.update(s => new Set(s).add(source));
    return of(fallback);
  }
  reload(): void {
    this.loading.set(true); this.error.set(false); this.failedSources.set(new Set());
    const casos = this.autoria.listAuthoringCases().pipe(catchError(() => this.fallar('casos', [] as SimulationCaseSummary[])));
    if (this.isAdmin()) {
      forkJoin({ casos, solicitudes: this.solicitudesApi.listPending().pipe(catchError(() => this.fallar('solicitudes', [] as AccessRequest[]))), usuarios: this.usuariosApi.list().pipe(catchError(() => this.fallar('usuarios', [] as AdminUser[]))) }).subscribe(({ casos, solicitudes, usuarios }) => {
        this.casos.set(casos); this.solicitudes.set(solicitudes); this.usuarios.set(usuarios);
        // Una insignia incompleta parecería un conteo exacto.
        this.badges.fijar('usuarios', this.fallo('solicitudes') || this.fallo('usuarios') ? 0 : solicitudes.length + usuarios.filter(u => u.pendingApproval).length);
        this.loading.set(false);
      });
    } else {
      const grupos = this.gruposApi.listar().pipe(switchMap(items => {
        const primeros = items.slice(0, 4);
        if (!primeros.length) return of([] as GrupoVista[]);
        return forkJoin(primeros.map(grupo => this.asignacionesApi.list(grupo.id).pipe(
          switchMap(asignaciones => {
            const activas = asignaciones.filter(a => a.active);
            if (!activas.length) return of({ grupo, asignaciones: activas, avances: {} } as GrupoVista);
            return forkJoin(activas.map(a => this.reportes.getReporteGrupo(grupo.id, a.caseVersionId).pipe(
              // Se cuentan estudiantes, no intentos: una persona puede tener varios recorridos.
              catchError(() => this.fallar('grupos', null)),
            ))).pipe(switchMap(reportes => of({ grupo, asignaciones: activas, avances: Object.fromEntries(activas.map((a, i) => [a.id, reportes[i]?.simulacion ? reportes[i]!.simulacion!.estudiantes.filter(e => e.intentosCompletados > 0).length : null])) })));
          }), catchError(() => this.fallar('grupos', { grupo, asignaciones: null, avances: {} } as GrupoVista)),
        )));
      }), catchError(() => this.fallar('grupos', [] as GrupoVista[])));
      forkJoin({ casos, grupos, revision: this.instructor.listAttempts({ evaluacion: 'pendiente', pageSize: 5 }).pipe(catchError(() => this.fallar('revision', null as InstructorAttemptsPage | null))) }).subscribe(({ casos, grupos, revision }) => {
        this.casos.set(casos); this.grupos.set(grupos); this.revision.set(revision);
        this.badges.fijar('trazabilidad', revision?.coverage.total ?? 0); this.loading.set(false);
      });
    }
  }
  nombreCaso(id: number): string { return this.casos().find(c => c.caseVersionId === id)?.title ?? `Caso ${id}`; }
  /** «terminó hace 2 días»; vacío si la fecha no llegó, para no escribir «fecha no disponible» en cada fila. */
  hace(valor: string | null | undefined): string { return haceCuanto(valor); }
  /** El avance del grupo en palabras («4 de 12 terminaron»), sin porcentajes que parezcan una nota. */
  avanceTexto(terminaron: number | null | undefined, total: number): string {
    if (terminaron === null || terminaron === undefined) return 'Avance no disponible';
    if (!total) return 'Aún sin estudiantes en el grupo';
    return `${terminaron} de ${total} ${terminaron === 1 ? 'terminó' : 'terminaron'}`;
  }
  /** La ventana de la asignación en palabras: abierta, ya cerrada o sin fecha. */
  cierre(valor: string | null | undefined): string {
    if (!valor) return 'Sin fecha de cierre';
    const t = new Date(valor).getTime();
    return !Number.isNaN(t) && t < Date.now() ? `Cerró el ${this.fecha(valor)}` : `Abierto hasta el ${this.fecha(valor)}`;
  }
  /** Plural de la cantidad con su sustantivo: «1 estudiante», «12 estudiantes». */
  cantidad(n: number, uno: string, varios: string): string { return `${n} ${n === 1 ? uno : varios}`; }
  /** Descarta una solicitud desde el inicio (mismo cambio de estado que en Usuarios) y actualiza la insignia. */
  descartar(solicitud: AccessRequest): void {
    if (this.descartando() !== null) return;
    this.descartando.set(solicitud.id);
    this.solicitudesApi.updateStatus(solicitud.id, 'DISMISSED').subscribe({
      next: () => {
        this.solicitudes.update(items => items.filter(item => item.id !== solicitud.id));
        this.badges.fijar('usuarios', this.fallo('usuarios') ? 0 : this.solicitudes().length + this.pendientesCuentas());
        this.notify.success('Solicitud descartada.');
        this.descartando.set(null);
      },
      error: () => { this.notify.error('No pudimos descartar la solicitud. Inténtalo de nuevo.'); this.descartando.set(null); },
    });
  }
  fecha(valor: string | null | undefined): string { if (!valor) return 'Fecha no disponible'; const d = new Date(valor); return Number.isNaN(d.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(d); }
  irGrupos(): void { void this.router.navigateByUrl('/portal/grupos'); }
}
