import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { GrupoService, Grupo } from '../../core/api/grupo.service';
import { ReporteService } from '../../core/api/reporte.service';
import { InstructorApi } from '../../core/api/instructor.api';
import { SimulationService } from '../../core/api/simulation.service';
import { AdminUser, UserAdminService } from '../../core/api/user-admin.service';
import { AuthService } from '../../core/auth/auth.service';
import { APP_BRAND } from '../../core/config/brand.config';
import { Dashboard } from '../../core/models/sesion.model';
import { RecentAttempt, SimulationCaseSummary, StudentAttemptSummary } from '../../core/models/simulation.model';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { statusLabel } from '../../shared/ui/labels';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { UiStat } from '../../shared/ui/stat/ui-stat';
import { uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiTable, UiTableEmpty, UiTableRow, UiTableTable } from '../../shared/ui/table/ui-table';
import { DashboardChartsComponent } from './dashboard-charts.component';
import { NO_DATA_LABEL, attemptStateLabel, metricDisplay } from './dashboard-metrics.util';
import { QuickAction, QuickActionsComponent } from './quick-actions.component';
import { StudentDashboardComponent } from './student-dashboard.component';
import { openAttempt } from './student-dashboard.util';

/** Cada carga de la que depende algún conteo del tablero (docencia y administración). */
type DashboardSource = 'dashboard' | 'users' | 'cases' | 'recent' | 'grupos';

interface DashboardMetric {
  value: string;
  label: string;
  /** Aclaración bajo la cifra (qué cuenta o por qué no hay dato). */
  status: string;
}

interface LearningGap {
  titulo: string;
  texto: string;
  estado: string;
  tone: UiBadgeTone;
}

/** Ruta de la traza docente: «Ver detalle» abre el intento de la fila (F7-1), no la lista general. */
const TRACE_ROUTE = '/portal/docente/trazabilidad';

/**
 * Panel de inicio. El estudiante tiene el suyo (`app-student-dashboard`, plan visual F5-1); este componente pinta el
 * de docencia y administración (F7-1): una cabecera, UN bloque que resuelve sus cuatro estados de a uno
 * (`uiDataState`: esqueleto, error con «Reintentar», primer uso o el contenido), cada cifra una sola vez y cada
 * destino una sola vez (antes salían tres: cabecera, tarjeta de estado y acciones rápidas). «Retoma tu caso» ofrece
 * solo el intento abierto DE QUIEN MIRA, nunca el de un estudiante.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink, UiBadge, UiButton, UiCard, UiEmptyState, UiErrorState, UiPageHeader, UiSection, UiSkeleton, UiStat,
    UiTable, UiTableEmpty, UiTableRow, UiTableTable, DashboardChartsComponent, QuickActionsComponent,
    StudentDashboardComponent,
  ],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  readonly brand = APP_BRAND;
  readonly auth = inject(AuthService);
  private readonly reporteService = inject(ReporteService);
  private readonly simulationService = inject(SimulationService);
  private readonly instructorApi = inject(InstructorApi);
  private readonly userAdminService = inject(UserAdminService);
  private readonly grupoService = inject(GrupoService);
  private readonly router = inject(Router);

  readonly dashboard = signal<Dashboard | null>(null);
  readonly adminUsers = signal<AdminUser[]>([]);
  readonly grupos = signal<Grupo[]>([]);
  readonly simulationCases = signal<SimulationCaseSummary[]>([]);
  readonly recentAttempts = signal<RecentAttempt[]>([]);
  /** El historial PROPIO de quien mira (no el de sus estudiantes): de ahí sale «Retoma tu caso». */
  readonly ownHistory = signal<StudentAttemptSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  /** Cargas secundarias que fallaron sin tumbar el tablero: sus conteos no se pueden mostrar. */
  private readonly failedSources = signal<ReadonlySet<DashboardSource>>(new Set());

  readonly traceRoute = TRACE_ROUTE;
  readonly statusLabel = statusLabel;

  /** Primer uso: sin grupos ni intentos (docencia) o sin usuarios, casos ni intentos (administración). */
  protected readonly firstUse = computed(() => {
    if (this.loading() || this.error() || this.failedSources().size > 0) return false;
    const attempts = (this.dashboard()?.intentosRecientes?.length ?? 0) + this.recentAttempts().length;
    if (this.isAdmin()) return this.adminUsers().length === 0 && this.simulationCases().length === 0 && attempts === 0;
    return this.grupos().length === 0 && attempts === 0;
  });

  /** Estado del bloque (esqueleto, error, primer uso o listo): una sola señal, de a uno. */
  readonly state = uiDataState({ loading: this.loading, error: this.error, isEmpty: this.firstUse });
  /** Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia). */
  protected readonly statusText = computed(() => (this.state() === 'loading' ? 'Cargando el panel…' : ''));
  /** El intento abierto propio, si lo hay. */
  protected readonly ownOpen = computed(() => openAttempt(this.ownHistory()));

  ngOnInit() {
    if (this.auth.hasRole('ESTUDIANTE')) {
      // El panel del estudiante carga sus propios datos.
      this.loading.set(false);
    } else if (this.auth.hasRole('ADMIN')) {
      this.loadAdminDashboard();
    } else if (this.auth.hasRole('PROFESOR')) {
      this.loadProfessorDashboard();
    } else {
      this.loading.set(false);
      this.error.set(true);
    }
  }

  /** «Reintentar» del bloque: vuelve a pedir todo lo del panel. */
  reload(): void {
    this.error.set(false);
    this.failedSources.set(new Set());
    this.loading.set(true);
    this.ngOnInit();
  }

  /** La acción del primer uso: llevar a donde se crea lo primero. */
  goToFirstUse(): void {
    void this.router.navigateByUrl(this.isAdmin() ? '/portal/admin/usuarios' : '/portal/grupos');
  }

  firstUseCopy(): { title: string; description: string; action: string } {
    if (this.isAdmin()) {
      return {
        title: 'Aún no hay usuarios',
        description: 'Crea las cuentas de docentes y estudiantes para empezar a ver aquí su actividad.',
        action: 'Crear usuario',
      };
    }
    return {
      title: 'Aún no tienes grupos',
      description: 'Crea tu primer grupo, agrega estudiantes y asígnales un caso para ver aquí su avance.',
      action: 'Crear grupo',
    };
  }

  isAdmin(): boolean {
    return this.auth.hasRole('ADMIN');
  }

  isProfesor(): boolean {
    return this.auth.hasRole('PROFESOR');
  }

  isEstudiante(): boolean {
    return this.auth.hasRole('ESTUDIANTE');
  }

  chartsRole(): 'ADMIN' | 'PROFESOR' {
    return this.isAdmin() ? 'ADMIN' : 'PROFESOR';
  }

  hasData(): boolean {
    return !!this.dashboard() && !this.error();
  }

  metrics(): DashboardMetric[] {
    if (this.isAdmin()) return this.adminMetrics();
    if (this.isProfesor()) return this.professorMetrics();
    return [];
  }

  quickActions(): QuickAction[] {
    if (this.isAdmin()) {
      return [
        { label: 'Gestión de usuarios', route: '/portal/admin/usuarios', icon: 'manage_accounts', accent: true },
        { label: 'Gestión de casos', route: '/portal/casos', icon: 'account_tree' },
        { label: 'Trazabilidad', route: TRACE_ROUTE, icon: 'timeline' }
      ];
    }
    if (this.isProfesor()) {
      return [
        { label: 'Ver trazabilidad', route: TRACE_ROUTE, icon: 'timeline', accent: true },
        { label: 'Revisar rúbricas', route: '/portal/rubricas', icon: 'grading' },
        { label: 'Ver reportes', route: '/portal/reportes', icon: 'analytics' },
        { label: 'Gestionar grupos', route: '/portal/grupos', icon: 'groups' }
      ];
    }
    return [];
  }

  eyebrow(): string {
    return this.isAdmin() ? `Administración · ${this.brand.shortName}` : `Seguimiento docente · ${this.brand.shortName}`;
  }

  heroTitle(): string {
    return this.isAdmin() ? 'Panel de administración académica' : 'Seguimiento de tus grupos';
  }

  heroLead(): string {
    if (this.isAdmin()) {
      return 'Supervisa usuarios, casos publicados, simulaciones y el estado general del sistema formativo.';
    }
    return 'Revisa el avance de tus cohortes, detecta brechas formativas y accede a trazabilidad docente.';
  }

  adminMetrics(): DashboardMetric[] {
    const users = this.adminUsers();
    const data = this.dashboard();
    const published = this.publishedCasesCount();
    const criticas = this.criticalDecisions(data);

    const totalUsers = users.length;
    const activeStudents = users.filter(u => u.role === 'ESTUDIANTE' && u.activo).length;
    const activeTeachers = users.filter(u => u.role === 'PROFESOR' && u.activo).length;
    const completed = data?.simulacionesCompletadas ?? 0;
    const recentCount = data?.intentosRecientes?.length ?? this.recentAttempts().length;
    const inProgress = data?.simulacionesEnProgreso ?? 0;

    const usersDown = this.unavailable('users');
    const dashboardDown = this.unavailable('dashboard');

    return [
      this.metric(totalUsers, 'Total de usuarios', totalUsers > 0 ? 'Registro activo' : 'Sin usuarios', usersDown),
      this.metric(activeStudents, 'Estudiantes activos', activeStudents > 0 ? 'Cohortes activas' : 'Sin datos suficientes', usersDown),
      this.metric(activeTeachers, 'Profesores activos', activeTeachers > 0 ? 'Docentes habilitados' : 'Sin datos suficientes', usersDown),
      this.metric(published, 'Casos publicados', published > 0 ? 'Catálogo publicado' : 'Sin casos publicados', this.unavailable('cases')),
      this.metric(completed, 'Simulaciones completadas', completed > 0 ? 'Histórico registrado' : 'Aún no hay intentos registrados', dashboardDown),
      this.metric(recentCount, 'Intentos recientes', recentCount > 0 ? 'Actividad reciente' : 'Aún no hay intentos registrados', this.adminRecentUnavailable(data)),
      this.metric(criticas, 'Decisiones críticas', criticas > 0 ? 'Requiere revisión' : 'Sin alertas registradas', dashboardDown),
      this.metric(inProgress, 'Simulaciones en curso', inProgress > 0 ? 'En progreso' : 'Sin simulaciones activas', dashboardDown),
    ];
  }

  professorMetrics(): DashboardMetric[] {
    const data = this.dashboard();
    const grupos = this.grupos();
    const assignedStudents = grupos.reduce((sum, g) => sum + (g.totalEstudiantes ?? 0), 0);
    const casosAsignados = this.uniqueCasesCount(data);
    const promedioRaw = data?.puntajePromedioSimulacion ?? data?.puntajePromedioGlobal;
    const promedio = promedioRaw && promedioRaw > 0 ? String(Math.round(promedioRaw)) : 'Pendiente';
    const criticas = this.criticalDecisions(data);
    const recentCount = data?.intentosRecientes?.length ?? 0;
    const completed = data?.simulacionesCompletadas ?? 0;

    const gruposDown = this.unavailable('grupos');
    const dashboardDown = this.unavailable('dashboard');

    return [
      this.metric(grupos.length, 'Grupos activos', grupos.length > 0 ? 'Cohortes asignadas' : 'Sin grupos registrados', gruposDown),
      this.metric(assignedStudents, 'Estudiantes asignados', assignedStudents > 0 ? 'En tus grupos' : 'Sin estudiantes asignados', gruposDown),
      this.metric(recentCount, 'Intentos recientes', recentCount > 0 ? 'Últimas sesiones' : 'Aún no hay intentos registrados', dashboardDown),
      this.metric(casosAsignados, 'Casos asignados', casosAsignados > 0 ? 'Catálogo activo' : 'No hay casos asignados', dashboardDown),
      this.metric(completed, 'Simulaciones completadas', completed > 0 ? 'Avance registrado' : 'Aún no hay intentos registrados', dashboardDown),
      this.metric(promedio, 'Promedio de desempeño', promedio === 'Pendiente' ? 'Sin datos suficientes todavía' : 'Evaluación activa', dashboardDown),
      this.metric(criticas, 'Decisiones críticas', criticas > 0 ? 'Requiere revisión' : 'Sin alertas registradas', dashboardDown),
    ];
  }

  actividadDocenteVacia(): boolean {
    const data = this.dashboard();
    if (!data) return true;
    return (
      (data.simulacionesCompletadas ?? 0) === 0 &&
      (data.simulacionesEnProgreso ?? 0) === 0 &&
      (data.decisionesAdecuadas ?? 0) === 0
    );
  }

  brechasSinDatosSuficientes(): boolean {
    return !this.loading() && !this.error() && !this.hasData();
  }

  brechas(): LearningGap[] {
    const data = this.dashboard();
    if (!data) return [];

    const gaps: LearningGap[] = [];
    const criticas = this.criticalDecisions(data);

    if (criticas > 0) {
      gaps.push({
        titulo: 'Decisiones críticas',
        texto: `${criticas} decisión(es) requieren revisión docente.`,
        estado: 'En revisión',
        tone: 'warning'
      });
    }

    if ((data.simulacionesEnProgreso ?? 0) === 0 && (data.simulacionesCompletadas ?? 0) === 0) {
      gaps.push({
        titulo: 'Simulaciones',
        texto: 'Aún no hay simulaciones registradas en el periodo.',
        estado: 'Pendiente',
        tone: 'neutral'
      });
    } else if ((data.simulacionesEnProgreso ?? 0) > 0) {
      gaps.push({
        titulo: 'Seguimiento activo',
        texto: `${data.simulacionesEnProgreso} simulación(es) en progreso.`,
        estado: 'En curso',
        tone: 'info'
      });
    }

    if (!gaps.length) {
      gaps.push({
        titulo: 'Sin alertas formativas',
        texto: 'No hay alertas formativas con los datos actuales.',
        estado: 'Adecuado',
        tone: 'success'
      });
    }

    return gaps;
  }

  actividadDocente(): { titulo: string; valor: number | string }[] {
    const data = this.dashboard();
    if (!data) return [];

    return [
      { titulo: 'Simulaciones completadas', valor: data.simulacionesCompletadas ?? 0 },
      { titulo: 'Simulaciones en progreso', valor: data.simulacionesEnProgreso ?? 0 },
      { titulo: 'Decisiones adecuadas', valor: data.decisionesAdecuadas ?? 0 }
    ];
  }

  rows() {
    const data = this.dashboard();
    const source = data?.intentosRecientes ?? [];

    return source.map(item => {
      const estado = attemptStateLabel(item.estado);
      return {
        id: item.id,
        casoTitulo: item.casoTitulo,
        estudiante: item.estudiante,
        puntajeLabel: item.puntaje && item.puntaje > 0 ? String(item.puntaje) : 'Pendiente',
        estado,
        tone: (estado === 'Completado' ? 'success' : estado === 'En curso' ? 'info' : 'neutral') as UiBadgeTone,
      };
    });
  }

  private loadAdminDashboard() {
    forkJoin({
      dashboard: this.reporteService.getDashboard().pipe(catchError(() => this.sourceFailed<Dashboard | null>('dashboard', null))),
      users: this.userAdminService.list().pipe(catchError(() => this.sourceFailed('users', [] as AdminUser[]))),
      cases: this.simulationService.listCases().pipe(catchError(() => this.sourceFailed('cases', [] as SimulationCaseSummary[]))),
      recent: this.instructorApi.recentAttempts().pipe(catchError(() => this.sourceFailed('recent', [] as RecentAttempt[]))),
      own: this.ownAttempts(),
    }).subscribe({
      next: ({ dashboard, users, cases, recent, own }) => {
        this.dashboard.set(dashboard);
        this.adminUsers.set(users);
        this.simulationCases.set(cases);
        this.recentAttempts.set(recent);
        this.ownHistory.set(own);
        this.error.set(!dashboard && !users.length);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      }
    });
  }

  private loadProfessorDashboard() {
    // Sin historial propio: el docente no juega y el servidor se lo niega (403), lo que avisaría de un permiso que
    // falta en cada carga del panel. Solo quien puede jugar (estudiante y administrador) tiene intento propio.
    forkJoin({
      dashboard: this.reporteService.getDashboard(),
      grupos: this.grupoService.listar().pipe(catchError(() => this.sourceFailed('grupos', [] as Grupo[]))),
    }).subscribe({
      next: ({ dashboard, grupos }) => {
        this.dashboard.set(dashboard);
        this.grupos.set(grupos);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      }
    });
  }

  /** El historial del administrador (el único del personal que juega): si falla, solo desaparece «Retoma tu caso» (no es un conteo del panel). */
  private ownAttempts(): Observable<StudentAttemptSummary[]> {
    return this.simulationService.attemptHistory().pipe(catchError(() => of([] as StudentAttemptSummary[])));
  }

  /** Anota que una carga falló y devuelve su valor de reserva; sus conteos pasan a «Sin datos». */
  private sourceFailed<T>(source: DashboardSource, fallback: T): Observable<T> {
    this.failedSources.update(sources => new Set(sources).add(source));
    return of(fallback);
  }

  /** true si el tablero falló entero o alguna de las cargas de las que sale el conteo falló. */
  private unavailable(...sources: DashboardSource[]): boolean {
    if (this.error()) return true;
    const failed = this.failedSources();
    return sources.some(source => failed.has(source));
  }

  /** Sin el listado del panel, «Intentos recientes» sale de la carga propia de intentos recientes. */
  private adminRecentUnavailable(data: Dashboard | null): boolean {
    return data?.intentosRecientes ? this.unavailable() : this.unavailable('recent');
  }

  private metric(value: number | string, label: string, status: string, unavailable = false): DashboardMetric {
    if (unavailable) return { value: NO_DATA_LABEL, label, status: 'No se pudo cargar' };
    return { value: metricDisplay(value), label, status };
  }

  private criticalDecisions(data: Dashboard | null): number {
    if (!data) return 0;
    return (
      (data.decisionesRiesgosas ?? 0) +
      (data.decisionesInadecuadas ?? 0) +
      (data.decisionesProhibidas ?? 0)
    );
  }

  private uniqueCasesCount(data: Dashboard | null): number {
    if (!data) return 0;
    return new Set([
      ...(data.intentosRecientes?.map(i => i.casoTitulo) ?? []),
      ...(data.ultimosIntentos?.map(i => i.casoTitulo) ?? [])
    ]).size;
  }

  private publishedCasesCount(): number {
    const simCases = this.simulationCases().filter(c => c.status?.toUpperCase() === 'PUBLISHED').length;
    if (simCases > 0) return simCases;
    return this.simulationCases().length;
  }
}
