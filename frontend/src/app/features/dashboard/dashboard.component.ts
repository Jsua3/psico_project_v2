import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { GrupoService, Grupo } from '../../core/api/grupo.service';
import { ReporteService } from '../../core/api/reporte.service';
import { SimulationService } from '../../core/api/simulation.service';
import { AdminUser, UserAdminService } from '../../core/api/user-admin.service';
import { AuthService } from '../../core/auth/auth.service';
import { APP_BRAND } from '../../core/config/brand.config';
import { Dashboard } from '../../core/models/sesion.model';
import {
  RecentAttempt,
  SimulationCaseSummary,
  StudentAttemptSummary
} from '../../core/models/simulation.model';
import { DashboardChartsComponent } from './dashboard-charts.component';
import {
  NO_DATA_LABEL,
  attemptStateLabel,
  completedAttemptCount,
  countDisplay,
  metricDisplay,
  totalActiveSeconds
} from './dashboard-metrics.util';
import { QuickAction, QuickActionsComponent } from './quick-actions.component';

/** Cada carga de la que depende algún conteo del tablero. */
type DashboardSource = 'dashboard' | 'users' | 'cases' | 'recent' | 'grupos' | 'history';

interface DashboardMetric {
  icon: string;
  value: string;
  label: string;
  status: string;
  badgeClass: 'green' | 'purple' | 'blue' | 'orange' | 'neutral';
}

interface LearningGap {
  titulo: string;
  texto: string;
  estado: string;
  icon: string;
  color: 'green' | 'purple' | 'orange' | 'blue';
}

interface TrainingResume {
  caso: string;
  rol: string;
  ultimaAccion: string;
  progreso: number;
  estado: string;
  attemptId?: string;
}

interface HeroStatusItem {
  label: string;
  value: string;
}

interface HeroStatusCard {
  title: string;
  chips: string[];
  items: HeroStatusItem[];
  action?: QuickAction;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MatChipsModule, MatIconModule, MatTableModule, DashboardChartsComponent, QuickActionsComponent],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  readonly brand = APP_BRAND;
  readonly auth = inject(AuthService);
  private readonly reporteService = inject(ReporteService);
  private readonly simulationService = inject(SimulationService);
  private readonly userAdminService = inject(UserAdminService);
  private readonly grupoService = inject(GrupoService);

  readonly dashboard = signal<Dashboard | null>(null);
  readonly studentHistory = signal<StudentAttemptSummary[]>([]);
  readonly adminUsers = signal<AdminUser[]>([]);
  readonly grupos = signal<Grupo[]>([]);
  readonly simulationCases = signal<SimulationCaseSummary[]>([]);
  readonly recentAttempts = signal<RecentAttempt[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  /** Cargas secundarias que fallaron sin tumbar el tablero: sus conteos no se pueden mostrar. */
  private readonly failedSources = signal<ReadonlySet<DashboardSource>>(new Set());
  readonly loadingMessage = signal('Cargando métricas académicas…');

  readonly cols = ['caso', 'estudiante', 'puntaje', 'estado', 'accion'];
  readonly studentCols = ['caso', 'puntaje', 'estado', 'accion'];
  readonly progressSegments = Array.from({ length: 10 });

  ngOnInit() {
    if (this.auth.hasRole('ESTUDIANTE')) {
      this.loadStudentDashboard();
    } else if (this.auth.hasRole('ADMIN')) {
      this.loadAdminDashboard();
    } else if (this.auth.hasRole('PROFESOR')) {
      this.loadProfessorDashboard();
    } else {
      this.loading.set(false);
      this.error.set(true);
    }
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

  chartsRole(): 'ADMIN' | 'PROFESOR' | 'ESTUDIANTE' {
    if (this.isAdmin()) return 'ADMIN';
    if (this.isProfesor()) return 'PROFESOR';
    return 'ESTUDIANTE';
  }

  hasData(): boolean {
    if (this.isEstudiante()) {
      return !this.error() && (this.studentHistory().length > 0 || this.simulationCases().length > 0);
    }
    return !!this.dashboard() && !this.error();
  }

  continuarEntrenamiento(): TrainingResume | null {
    if (this.isEstudiante()) {
      const active = this.studentHistory().find(a => a.status === 'IN_PROGRESS' || a.status === 'PAUSED');
      if (!active) return null;
      return {
        caso: active.caseTitle,
        rol: 'Psicólogo social en formación',
        ultimaAccion: active.status === 'PAUSED' ? 'Pausa segura activa' : 'Simulación en curso',
        progreso: active.accumulatedScore > 0 ? Math.min(100, active.accumulatedScore) : 0,
        estado: active.status === 'PAUSED' ? 'En pausa' : 'En curso',
        attemptId: active.attemptId
      };
    }

    const data = this.dashboard();
    const active = data?.intentosRecientes?.find(
      item => item.estado === 'EN_PROGRESO' || item.estado === 'IN_PROGRESS'
    );
    if (!active) return null;
    return {
      caso: active.casoTitulo,
      rol: 'Psicólogo social en formación',
      ultimaAccion: 'Simulación en curso',
      progreso: active.puntaje && active.puntaje > 0 ? Math.min(100, active.puntaje) : 0,
      estado: 'En curso'
    };
  }

  metrics(): DashboardMetric[] {
    if (this.isAdmin()) return this.adminMetrics();
    if (this.isProfesor()) return this.professorMetrics();
    if (this.isEstudiante()) return this.studentMetrics();
    return [];
  }

  quickActions(): QuickAction[] {
    if (this.isAdmin()) {
      return [
        { label: 'Gestión de usuarios', route: '/portal/admin/usuarios', icon: 'manage_accounts', accent: true },
        { label: 'Gestión de casos', route: '/portal/casos', icon: 'account_tree' },
        { label: 'Trazabilidad', route: '/portal/docente/trazabilidad', icon: 'timeline' }
      ];
    }
    if (this.isProfesor()) {
      return [
        { label: 'Ver trazabilidad', route: '/portal/docente/trazabilidad', icon: 'timeline', accent: true },
        { label: 'Revisar rúbricas', route: '/portal/rubricas', icon: 'grading' },
        { label: 'Ver reportes', route: '/portal/reportes', icon: 'analytics' },
        { label: 'Gestionar grupos', route: '/portal/grupos', icon: 'groups' }
      ];
    }
    return [
      { label: 'Ver casos y resultados', route: '/portal/simulador', icon: 'folder_open', accent: true }
    ];
  }

  heroTitle(): string {
    if (this.isAdmin()) return 'Panel de administración académica';
    if (this.isProfesor()) return 'Seguimiento de tus grupos';
    return 'Tu entrenamiento psicosocial';
  }

  heroLead(): string {
    if (this.isAdmin()) {
      return 'Supervisa usuarios, casos publicados, simulaciones y el estado general del sistema formativo.';
    }
    if (this.isProfesor()) {
      return 'Revisa el avance de tus cohortes, detecta brechas formativas y accede a trazabilidad docente.';
    }
    return 'Continúa tus simulaciones, consulta tu historial y revisa recomendaciones formativas pendientes.';
  }

  heroStatusCard(): HeroStatusCard {
    if (this.loading()) {
      return this.heroStatusLoadingCard();
    }
    if (this.isAdmin()) return this.heroStatusAdminCard();
    if (this.isProfesor()) return this.heroStatusProfessorCard();
    return this.heroStatusStudentCard();
  }

  private heroStatusLoadingCard(): HeroStatusCard {
    const action: QuickAction | undefined = this.isEstudiante()
      ? undefined
      : this.isProfesor()
        ? { label: 'Revisar trazabilidad', route: '/portal/docente/trazabilidad', icon: 'timeline', accent: true }
        : { label: 'Gestión de usuarios', route: '/portal/admin/usuarios', icon: 'manage_accounts', accent: true };

    return {
      title: this.isAdmin()
        ? 'Estado general de SIEP'
        : this.isProfesor()
          ? 'Estado de tus grupos'
          : 'Tu avance formativo',
      chips: this.isAdmin()
        ? ['Usuarios', 'Casos', 'Sistema']
        : this.isProfesor()
          ? ['Grupos', 'Intentos']
          : ['Casos', 'Progreso', 'Historial'],
      items: [
        { label: 'Cargando…', value: '—' },
        { label: 'Cargando…', value: '—' },
        { label: 'Cargando…', value: '—' },
        { label: 'Cargando…', value: '—' }
      ],
      action
    };
  }

  private heroStatusAdminCard(): HeroStatusCard {
    const users = this.adminUsers();
    const data = this.dashboard();
    const activeUsers = users.filter(u => u.activo).length;
    const published = this.publishedCasesCount();
    const completed = data?.simulacionesCompletadas ?? 0;
    const recentCount = data?.intentosRecientes?.length ?? this.recentAttempts().length;

    return {
      title: 'Estado general de SIEP',
      chips: ['Usuarios', 'Casos', 'Sistema'],
      items: [
        {
          label: 'Usuarios activos',
          value: countDisplay(activeUsers, this.unavailable('users'))
        },
        {
          label: 'Casos publicados',
          value: countDisplay(published, this.unavailable('cases'))
        },
        {
          label: 'Simulaciones completadas',
          value: countDisplay(completed, this.unavailable('dashboard'))
        },
        {
          label: 'Intentos recientes',
          value: countDisplay(recentCount, this.adminRecentUnavailable(data))
        }
      ],
      action: { label: 'Gestión de usuarios', route: '/portal/admin/usuarios', icon: 'manage_accounts', accent: true }
    };
  }

  private heroStatusProfessorCard(): HeroStatusCard {
    const data = this.dashboard();
    const grupos = this.grupos();
    const assignedStudents = grupos.reduce((sum, g) => sum + (g.totalEstudiantes ?? 0), 0);
    const recentCount = data?.intentosRecientes?.length ?? 0;

    return {
      title: 'Estado de tus grupos',
      chips: ['Grupos', 'Intentos'],
      items: [
        {
          label: 'Grupos activos',
          value: countDisplay(grupos.length, this.unavailable('grupos'))
        },
        {
          label: 'Estudiantes asignados',
          value: countDisplay(assignedStudents, this.unavailable('grupos'))
        },
        {
          label: 'Intentos recientes',
          value: countDisplay(recentCount, this.unavailable('dashboard'))
        }
      ],
      action: {
        label: 'Revisar trazabilidad',
        route: '/portal/docente/trazabilidad',
        icon: 'timeline',
        accent: true
      }
    };
  }

  private heroStatusStudentCard(): HeroStatusCard {
    const history = this.studentHistory();
    const cases = this.simulationCases();
    const assignedCases = cases.length > 0 ? cases.length : new Set(history.map(h => h.caseTitle)).size;
    const completed = this.studentCompletedCount();
    const historyDown = this.unavailable('history');
    const scores = history.filter(h => h.accumulatedScore > 0).map(h => h.accumulatedScore);
    const bestScore = historyDown ? NO_DATA_LABEL : scores.length ? String(Math.max(...scores)) : 'Pendiente';
    const activeSeconds = totalActiveSeconds(history);
    const totalTime = !historyDown && activeSeconds !== null ? this.formatDuration(activeSeconds) : NO_DATA_LABEL;

    return {
      title: 'Tu avance formativo',
      chips: ['Casos', 'Progreso', 'Historial'],
      items: [
        {
          label: 'Casos asignados',
          value: countDisplay(assignedCases, this.unavailable('history', 'cases'))
        },
        {
          label: 'Intentos completados',
          value: countDisplay(completed, historyDown)
        },
        {
          label: 'Mejor puntaje',
          value: bestScore
        },
        {
          label: 'Tiempo activo',
          value: totalTime
        }
      ]
    };
  }

  systemStatus(): { label: string; detail: string; ok: boolean } {
    if (this.error()) {
      return {
        label: 'Servicio interrumpido',
        detail: 'No fue posible confirmar el estado del sistema. Revisa la conexión.',
        ok: false
      };
    }
    if (this.loading()) {
      return {
        label: 'Verificando servicios',
        detail: 'Consultando métricas académicas del entorno SIEP.',
        ok: true
      };
    }
    return {
      label: 'Sistema operativo',
      detail: 'Servicios académicos respondiendo con normalidad.',
      ok: true
    };
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

    const usersDown = this.unavailable('users');
    const dashboardDown = this.unavailable('dashboard');

    return [
      this.metric('groups', totalUsers, 'Total de usuarios', totalUsers > 0 ? 'Registro activo' : 'Sin usuarios', totalUsers > 0 ? 'purple' : 'neutral', usersDown),
      this.metric('school', activeStudents, 'Estudiantes activos', activeStudents > 0 ? 'Cohortes activas' : 'Sin datos suficientes', activeStudents > 0 ? 'green' : 'neutral', usersDown),
      this.metric('co_present', activeTeachers, 'Profesores activos', activeTeachers > 0 ? 'Docentes habilitados' : 'Sin datos suficientes', activeTeachers > 0 ? 'blue' : 'neutral', usersDown),
      this.metric('account_tree', published, 'Casos publicados', published > 0 ? 'Catálogo publicado' : 'Sin casos publicados', published > 0 ? 'blue' : 'neutral', this.unavailable('cases')),
      this.metric('task_alt', completed, 'Simulaciones completadas', completed > 0 ? 'Histórico registrado' : 'Aún no hay intentos registrados', completed > 0 ? 'green' : 'neutral', dashboardDown),
      this.metric('history', recentCount, 'Intentos recientes', recentCount > 0 ? 'Actividad reciente' : 'Aún no hay intentos registrados', recentCount > 0 ? 'purple' : 'neutral', this.adminRecentUnavailable(data)),
      this.metric('warning_amber', criticas, 'Decisiones críticas', criticas > 0 ? 'Requiere revisión' : 'Sin alertas registradas', criticas > 0 ? 'orange' : 'neutral', dashboardDown),
      this.metric('monitor_heart', data?.simulacionesEnProgreso ?? 0, 'Simulaciones en curso', (data?.simulacionesEnProgreso ?? 0) > 0 ? 'En progreso' : 'Sin simulaciones activas', (data?.simulacionesEnProgreso ?? 0) > 0 ? 'purple' : 'neutral', dashboardDown)
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
      this.metric('groups', grupos.length, 'Grupos activos', grupos.length > 0 ? 'Cohortes asignadas' : 'Sin grupos registrados', grupos.length > 0 ? 'purple' : 'neutral', gruposDown),
      this.metric('people', assignedStudents, 'Estudiantes asignados', assignedStudents > 0 ? 'En tus grupos' : 'Sin estudiantes asignados', assignedStudents > 0 ? 'green' : 'neutral', gruposDown),
      this.metric('history', recentCount, 'Intentos recientes', recentCount > 0 ? 'Últimas sesiones' : 'Aún no hay intentos registrados', recentCount > 0 ? 'blue' : 'neutral', dashboardDown),
      this.metric('account_tree', casosAsignados, 'Casos asignados', casosAsignados > 0 ? 'Catálogo activo' : 'No hay casos asignados', casosAsignados > 0 ? 'blue' : 'neutral', dashboardDown),
      this.metric('task_alt', completed, 'Simulaciones completadas', completed > 0 ? 'Avance registrado' : 'Aún no hay intentos registrados', completed > 0 ? 'green' : 'neutral', dashboardDown),
      this.metric('analytics', promedio, 'Promedio de desempeño', promedio === 'Pendiente' ? 'Sin datos suficientes todavía' : 'Evaluación activa', promedio === 'Pendiente' ? 'neutral' : 'green', dashboardDown),
      this.metric('warning_amber', criticas, 'Decisiones críticas', criticas > 0 ? 'Requiere revisión' : 'Sin alertas registradas', criticas > 0 ? 'orange' : 'neutral', dashboardDown)
    ];
  }

  studentMetrics(): DashboardMetric[] {
    const history = this.studentHistory();
    const cases = this.simulationCases();
    const inProgress = history.filter(a => a.status === 'IN_PROGRESS' || a.status === 'PAUSED').length;
    const completed = completedAttemptCount(history);
    const assignedCases = cases.length > 0 ? cases.length : new Set(history.map(h => h.caseTitle)).size;
    const scores = history.filter(h => h.accumulatedScore > 0).map(h => h.accumulatedScore);
    const bestScore = scores.length ? String(Math.max(...scores)) : 'Pendiente';
    const activeSeconds = totalActiveSeconds(history);
    const totalTime = activeSeconds !== null ? this.formatDuration(activeSeconds) : NO_DATA_LABEL;
    const pendingReview = history.reduce(
      (sum, h) => sum + h.riskyDecisions + h.inadequateDecisions + h.prohibitedDecisions,
      0
    );
    const historyDown = this.unavailable('history');

    return [
      this.metric('account_tree', assignedCases, 'Casos asignados', assignedCases > 0 ? 'Disponibles' : 'No hay casos asignados', assignedCases > 0 ? 'blue' : 'neutral', this.unavailable('history', 'cases')),
      this.metric('play_circle', inProgress, 'Simulaciones en progreso', inProgress > 0 ? 'En curso' : 'Sin simulaciones activas', inProgress > 0 ? 'purple' : 'neutral', historyDown),
      this.metric('task_alt', completed, 'Intentos completados', completed > 0 ? 'Histórico personal' : 'Aún no hay intentos registrados', completed > 0 ? 'green' : 'neutral', historyDown),
      this.metric('emoji_events', bestScore, 'Mejor puntaje', bestScore === 'Pendiente' ? 'Sin datos suficientes todavía' : 'Mejor resultado', bestScore === 'Pendiente' ? 'neutral' : 'green', historyDown),
      this.metric('schedule', totalTime, 'Tiempo activo', totalTime === NO_DATA_LABEL ? 'Se calcula al terminar un intento' : 'Estimado, sin pausas', totalTime === NO_DATA_LABEL ? 'neutral' : 'blue', historyDown),
      this.metric('lightbulb', pendingReview, 'Recomendaciones pendientes', pendingReview > 0 ? 'Decisiones a revisar' : 'Sin recomendaciones pendientes', pendingReview > 0 ? 'orange' : 'neutral', historyDown)
    ];
  }

  studentCompletedCount(): number {
    return completedAttemptCount(this.studentHistory());
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
        icon: 'gavel',
        color: 'purple'
      });
    }

    if ((data.simulacionesEnProgreso ?? 0) === 0 && (data.simulacionesCompletadas ?? 0) === 0) {
      gaps.push({
        titulo: 'Simulaciones',
        texto: 'Aún no hay simulaciones registradas en el periodo.',
        estado: 'Pendiente',
        icon: 'travel_explore',
        color: 'blue'
      });
    } else if ((data.simulacionesEnProgreso ?? 0) > 0) {
      gaps.push({
        titulo: 'Seguimiento activo',
        texto: `${data.simulacionesEnProgreso} simulación(es) en progreso.`,
        estado: 'En curso',
        icon: 'play_circle',
        color: 'green'
      });
    }

    if (!gaps.length) {
      gaps.push({
        titulo: 'Sin alertas formativas',
        texto: 'No hay alertas formativas con los datos actuales.',
        estado: 'Adecuado',
        icon: 'verified',
        color: 'green'
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

  filledProgressSegments() {
    const training = this.continuarEntrenamiento();
    if (!training) return 0;
    return Math.round(training.progreso / 10);
  }

  rows() {
    if (this.isEstudiante()) {
      return this.studentHistory()
        .slice(0, 8)
        .map(item => ({
          casoTitulo: item.caseTitle,
          estudiante: '—',
          puntajeLabel: item.accumulatedScore > 0 ? String(item.accumulatedScore) : 'Pendiente',
          estado: attemptStateLabel(item.status),
          attemptId: item.attemptId,
          studentRow: true
        }));
    }

    const data = this.dashboard();
    const source = data?.intentosRecientes ?? [];

    return source.map(item => ({
      casoTitulo: item.casoTitulo,
      estudiante: item.estudiante,
      puntajeLabel: item.puntaje && item.puntaje > 0 ? String(item.puntaje) : 'Pendiente',
      estado: attemptStateLabel(item.estado),
      studentRow: false
    }));
  }

  tableColumns(): string[] {
    return this.isEstudiante() ? this.studentCols : this.cols;
  }

  private loadAdminDashboard() {
    this.loadingMessage.set('Cargando métricas académicas…');
    forkJoin({
      dashboard: this.reporteService.getDashboard().pipe(catchError(() => this.sourceFailed<Dashboard | null>('dashboard', null))),
      users: this.userAdminService.list().pipe(catchError(() => this.sourceFailed('users', [] as AdminUser[]))),
      cases: this.simulationService.listCases().pipe(catchError(() => this.sourceFailed('cases', [] as SimulationCaseSummary[]))),
      recent: this.simulationService.recentAttempts().pipe(catchError(() => this.sourceFailed('recent', [] as RecentAttempt[])))
    }).subscribe({
      next: ({ dashboard, users, cases, recent }) => {
        this.dashboard.set(dashboard);
        this.adminUsers.set(users);
        this.simulationCases.set(cases);
        this.recentAttempts.set(recent);
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
    this.loadingMessage.set('Cargando métricas académicas…');
    forkJoin({
      dashboard: this.reporteService.getDashboard(),
      grupos: this.grupoService.listar().pipe(catchError(() => this.sourceFailed('grupos', [] as Grupo[])))
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

  private loadStudentDashboard() {
    this.loadingMessage.set('Cargando métricas académicas…');
    forkJoin({
      history: this.simulationService.attemptHistory(),
      cases: this.simulationService.listCases().pipe(catchError(() => this.sourceFailed('cases', [] as SimulationCaseSummary[])))
    }).subscribe({
      next: ({ history, cases }) => {
        this.studentHistory.set(history);
        this.simulationCases.set(cases);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      }
    });
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

  private metric(
    icon: string,
    value: number | string,
    label: string,
    status: string,
    badgeClass: DashboardMetric['badgeClass'],
    unavailable = false
  ): DashboardMetric {
    if (unavailable) {
      return { icon, value: NO_DATA_LABEL, label, status: 'No se pudo cargar', badgeClass: 'neutral' };
    }
    return { icon, value: metricDisplay(value), label, status, badgeClass };
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

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours} h ${minutes} min`;
    if (minutes > 0) return `${minutes} min`;
    return `${seconds} s`;
  }
}
