import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { InvitationsApi } from '../../core/api/invitations.api';
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
import { DRAFT_COPY } from '../simulator/draft-copy';
import {
  attemptTone, caseProgress, firstUseCopy, formatActiveTime, formatDate, lastClosings, openAttempt,
} from './student-dashboard.util';

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
  private readonly invitations = inject(InvitationsApi);
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
    // Solo lo que dice /cases: contar los títulos del historial afirmaría casos que quizá ya no están asignados.
    const count = this.cases().length;
    return { value: String(count), hint: count > 0 ? 'Listos para practicar' : 'Sin casos por ahora' };
  });
  protected readonly completed = computed(() => completedAttemptCount(this.history()));
  protected readonly activeTime = computed(() => {
    const seconds = totalActiveSeconds(this.history());
    return { value: formatActiveTime(seconds), hint: seconds === null ? 'Se calcula al terminar un intento' : 'Estimado, sin pausas' };
  });

  protected readonly progress = computed(() => caseProgress(this.history()).map(item => ({
    ...item,
    ratio: item.total ? item.completed / item.total : 0,
    tooltip: `${item.title}: ${item.completed} de ${plural(item.total, 'intento completado', 'intentos completados')}`,
  })));
  /** Los últimos casos que completó: caso y fecha, sin cifras. */
  protected readonly closings = computed(() => lastClosings(this.history()));
  protected readonly draft = DRAFT_COPY;

  protected readonly recent = computed(() => this.history().slice(0, RECENT_ROWS));
  protected readonly statusLabel = statusLabel;
  protected readonly attemptTone = attemptTone;
  protected readonly formatDate = formatDate;

  /**
   * E2-10 (C5): invitaciones a grupos sin responder. Un estudiante invitado no ve los casos del grupo hasta aceptar;
   * el panel se lo dice. Si no cargan, no hay aviso (no es un error del panel).
   */
  protected readonly pendingInvitations = signal(0);
  protected readonly invitationsText = computed(() => {
    const count = this.pendingInvitations();
    return count === 1
      ? 'Tienes 1 invitación a un grupo sin responder. Al aceptarla verás los casos que te asigne tu docente.'
      : `Tienes ${count} invitaciones a grupos sin responder. Al aceptarlas verás los casos que te asignen tus docentes.`;
  });

  constructor() {
    this.loadHistory();
    this.loadCases();
    this.invitations.list().subscribe({
      next: list => this.pendingInvitations.set(list.filter(item => item.status === 'INVITED').length),
      error: () => this.pendingInvitations.set(0),
    });
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
