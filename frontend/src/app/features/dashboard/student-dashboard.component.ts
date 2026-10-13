import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { SimulationService } from '../../core/api/simulation.service';
import { SimulationCaseSummary, StudentAttemptSummary } from '../../core/models/simulation.model';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { plural, statusLabel } from '../../shared/ui/labels';
import { UiPageActions, UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { UiStat } from '../../shared/ui/stat/ui-stat';
import { errorKindFromStatus, uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiTable, UiTableRow, UiTableTable } from '../../shared/ui/table/ui-table';
import { UiTooltip } from '../../shared/ui/tooltip/ui-tooltip';
import { NO_DATA_LABEL, completedAttemptCount, totalActiveSeconds } from './dashboard-metrics.util';
import {
  attemptTone, caseProgress, decisionBreakdown, firstUseCopy, formatActiveTime, formatDate, openAttempt, scoreSeries,
} from './student-dashboard.util';

/** Lienzo del gráfico de puntaje (unidades del viewBox). */
const CHART_W = 280;
const CHART_H = 96;
const CHART_PAD = 8;
const RECENT_ROWS = 5;

/**
 * Panel del estudiante (plan visual F5-1). Antes vivía dentro del panel de los tres roles: repetía cuatro de seis
 * cifras, encendía tres señales de carga a la vez y, en el primer uso, cinco vacíos. Ahora: una cabecera, UN bloque
 * que depende del historial con sus cuatro estados resueltos de a uno (`uiDataState`: esqueleto, error con
 * «Reintentar», vacío de primer uso o el contenido) y el catálogo aislado en su única cifra («Casos asignados»).
 */
@Component({
  selector: 'app-student-dashboard',
  imports: [
    RouterLink, UiBadge, UiButton, UiCard, UiEmptyState, UiErrorState, UiPageActions, UiPageHeader,
    UiSection, UiSkeleton, UiStat, UiTable, UiTableRow, UiTableTable, UiTooltip,
  ],
  templateUrl: './student-dashboard.component.html',
  styleUrl: './student-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentDashboardComponent {
  private readonly simulation = inject(SimulationService);
  private readonly router = inject(Router);

  private readonly history = signal<StudentAttemptSummary[]>([]);
  private readonly historyLoading = signal(true);
  private readonly historyError = signal<{ status?: number } | null>(null);
  private readonly cases = signal<SimulationCaseSummary[]>([]);
  private readonly casesLoading = signal(true);
  private readonly casesFailed = signal(false);

  /**
   * Estado del bloque: espera al historial y al catálogo (una sola señal de carga); el error y el vacío son solo del
   * historial. Si falla el catálogo, solo «Casos asignados» pierde el dato.
   */
  protected readonly state = uiDataState({
    loading: computed(() => this.historyLoading() || this.casesLoading()),
    error: this.historyError,
    isEmpty: computed(() => this.history().length === 0),
  });
  /** Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia). */
  protected readonly statusText = computed(() => (this.state() === 'loading' ? 'Cargando tu avance…' : ''));
  protected readonly errorKind = computed(() => errorKindFromStatus(this.historyError()?.status));
  protected readonly errorStatus = computed(() => this.historyError()?.status ?? null);

  protected readonly firstUse = computed(() => firstUseCopy(this.casesFailed() ? null : this.cases().length));
  protected readonly open = computed(() => openAttempt(this.history()));

  protected readonly assignedCases = computed(() => {
    if (this.casesFailed()) return { value: NO_DATA_LABEL, hint: 'No se pudo cargar' };
    const count = this.cases().length || new Set(this.history().map(attempt => attempt.caseTitle)).size;
    return { value: String(count), hint: count > 0 ? 'Disponibles en la sala' : 'Sin casos por ahora' };
  });
  protected readonly completed = computed(() => completedAttemptCount(this.history()));
  protected readonly bestScore = computed(() => {
    const scores = this.history().map(attempt => attempt.accumulatedScore).filter(score => score > 0);
    return scores.length ? String(Math.max(...scores)) : 'Pendiente';
  });
  protected readonly activeTime = computed(() => {
    const seconds = totalActiveSeconds(this.history());
    return { value: formatActiveTime(seconds), hint: seconds === null ? 'Se calcula al terminar un intento' : 'Estimado, sin pausas' };
  });

  protected readonly scores = computed(() => scoreSeries(this.history()));
  protected readonly scoresHaveData = computed(() => this.scores().some(point => point.value > 0));
  protected readonly scorePoints = computed(() => {
    const points = this.scores();
    const max = Math.max(...points.map(point => point.value), 1);
    const usableH = CHART_H - 2 * CHART_PAD;
    return points.map((point, index) => ({
      ...point,
      x: points.length === 1 ? CHART_W / 2 : CHART_PAD + (index / (points.length - 1)) * (CHART_W - 2 * CHART_PAD),
      y: CHART_PAD + usableH - (point.value / max) * usableH,
      tooltip: `${point.label} · ${point.caseTitle}: ${plural(point.value, 'punto')}`,
    }));
  });
  protected readonly scorePolyline = computed(() => this.scorePoints().map(point => `${point.x},${point.y}`).join(' '));
  protected readonly scoreSummary = computed(() => {
    const points = this.scores();
    return `Evolución de puntaje: ${plural(points.length, 'intento')}, de ${points[0]?.value ?? 0} a ${points.at(-1)?.value ?? 0} puntos`;
  });
  protected readonly chartViewBox = `0 0 ${CHART_W} ${CHART_H}`;

  protected readonly progress = computed(() => caseProgress(this.history()).map(item => ({
    ...item,
    ratio: item.total ? item.completed / item.total : 0,
    tooltip: `${item.title}: ${item.completed} de ${plural(item.total, 'intento completado', 'intentos completados')}`,
  })));
  protected readonly decisions = computed(() => decisionBreakdown(this.history()));

  protected readonly recent = computed(() => this.history().slice(0, RECENT_ROWS));
  protected readonly statusLabel = statusLabel;
  protected readonly attemptTone = attemptTone;
  protected readonly formatDate = formatDate;

  constructor() {
    this.loadHistory();
    this.loadCases();
  }

  /** Recarga SOLO el historial (el «Reintentar» del bloque). */
  protected loadHistory(): void {
    this.historyLoading.set(true);
    this.simulation.attemptHistory().subscribe({
      next: history => {
        this.history.set(history);
        this.historyError.set(null);
        this.historyLoading.set(false);
      },
      error: (error: { status?: number }) => {
        this.historyError.set(error ?? {});
        this.historyLoading.set(false);
      },
    });
  }

  protected goToLobby(): void {
    void this.router.navigateByUrl('/portal/jugar');
  }

  private loadCases(): void {
    this.simulation.listCases().subscribe({
      next: cases => {
        this.cases.set(cases);
        this.casesLoading.set(false);
      },
      error: () => {
        this.casesFailed.set(true);
        this.casesLoading.set(false);
      },
    });
  }
}
