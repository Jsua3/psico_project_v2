import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { timeout } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogItem, SimulationCaseSummary, StudentAttemptSummary } from '../../core/models/simulation.model';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { plural, statusLabel } from '../../shared/ui/labels';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { errorKindFromStatus, uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiTable, UiTableRow, UiTableTable } from '../../shared/ui/table/ui-table';
import { attemptTone, formatDate, openAttempt } from '../dashboard/student-dashboard.util';
import { formatAttemptDuration, historyDurationSeconds } from './attempt-history-duration.util';
import { blockedNotice, lockReason } from './case-lock.util';
import { StudentReportDialogComponent, StudentReportDialogData } from './student-report-dialog.component';

type HttpLikeError = { status?: number };

/**
 * Catálogo, historial y reporte propio (plan visual F5-2). Lo abierto se continúa (RN-07, parte de interfaz): la
 * tarjeta de un caso con un intento en curso o en pausa ofrece «Continuar» y no «Iniciar»; sin abierto, «Iniciar
 * simulación» o, si ya hubo intentos, «Iniciar nuevo intento». El historial tiene su propio error con «Reintentar»,
 * distinto de «sin intentos» (RF-24), y el reporte se abre en un diálogo con sus propios estados. Para el estudiante,
 * cada caso dice si está bloqueado y por qué, o si ya lo resolvió (F5-5, con `/catalog`); si llegó aquí desde un caso
 * bloqueado pedido por dirección (`caseUnlockedGuard`), un aviso dice cuál y por qué.
 */
@Component({
  selector: 'app-simulation-catalog',
  imports: [
    MatIconModule, UiBadge, UiButton, UiCard, UiEmptyState, UiErrorState, UiPageHeader, UiSection, UiSkeleton, UiTable, UiTableRow,
    UiTableTable,
  ],
  templateUrl: './simulation-catalog.component.html',
  styleUrl: './simulation-catalog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SimulationCatalogComponent {
  private readonly simulationService = inject(SimulationService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(UiDialog);
  /** ?bloqueado=<id> de la guardia: reactivo (la guardia puede redirigir a esta misma ruta y Angular la reutiliza). */
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);
  private readonly blockedId = computed(() => Number(this.query()?.get('bloqueado')) || null);

  protected readonly isStudent = this.auth.hasRole('ESTUDIANTE');
  protected readonly canPlay = this.auth.hasRole('ESTUDIANTE', 'ADMIN');
  protected readonly canEdit = this.auth.hasRole('ADMIN');

  private readonly cases = signal<SimulationCaseSummary[]>([]);
  private readonly casesLoading = signal(true);
  private readonly casesError = signal<HttpLikeError | null>(null);
  private readonly history = signal<StudentAttemptSummary[]>([]);
  private readonly historyLoading = signal(false);
  private readonly historyError = signal<HttpLikeError | null>(null);
  /** Desbloqueo lineal del estudiante (SIEP-RF-12): si no llega, no se inventa ningún bloqueo. */
  private readonly catalogItems = signal<CatalogItem[]>([]);
  private readonly catalogSettled = signal(!this.isStudent);
  /** El historial respondió al menos una vez (bien o mal): hasta entonces las tarjetas no saben si hay algo abierto. */
  private readonly historySettled = signal(!this.isStudent);

  /** Las tarjetas esperan al primer historial (el botón de cada caso depende de él); un reintento no las recarga. */
  protected readonly casesState = uiDataState({
    loading: computed(() => this.casesLoading() || !this.historySettled() || !this.catalogSettled()),
    error: this.casesError,
    isEmpty: computed(() => this.cases().length === 0),
  });
  protected readonly historyState = uiDataState({
    loading: this.historyLoading,
    error: this.historyError,
    isEmpty: computed(() => this.history().length === 0),
  });
  protected readonly statusText = computed(() => (this.casesState() === 'loading' ? 'Cargando los casos…' : ''));
  protected readonly casesErrorKind = computed(() => errorKindFromStatus(this.casesError()?.status));
  protected readonly historyErrorKind = computed(() => errorKindFromStatus(this.historyError()?.status));

  protected readonly cards = computed(() => this.cases().map(item => {
    const attempts = this.history().filter(attempt => attempt.caseVersionId === item.caseVersionId);
    const open = openAttempt(attempts);
    // Sin historial no se sabe si hay algo abierto: un rótulo neutro y no «Iniciar» (RN-07); el juego ofrece reanudar.
    const startLabel = this.historyError() ? 'Abrir caso' : attempts.length ? 'Iniciar nuevo intento' : 'Iniciar simulación';
    // Un intento abierto se puede continuar aunque el caso haya quedado bloqueado (p. ej. el docente asignó uno
    // anterior): continuar, pausar o terminar (RN-07) manda sobre el desbloqueo lineal.
    const lock = open ? null : lockReason(this.catalogItems(), item.caseVersionId);
    const done = !open && !!this.catalogItems().find(entry => entry.caseVersionId === item.caseVersionId)?.completed;
    return { item, open, startLabel, lock, done };
  }));
  protected readonly rows = computed(() => this.history().map(attempt => ({
    attempt,
    open: attempt.status === 'IN_PROGRESS' || attempt.status === 'PAUSED',
    duration: formatAttemptDuration(historyDurationSeconds(attempt)),
  })));

  protected readonly emptyCases = this.isStudent
    ? { title: 'Aún no tienes casos asignados', description: 'Cuando tu docente te asigne un caso, aparecerá aquí para que puedas empezar.' }
    : { title: 'Aún no hay casos publicados', description: 'Cuando se publique un caso, aparecerá aquí.' };

  protected readonly notice = computed(() => {
    const id = this.blockedId();
    return id ? blockedNotice(this.catalogItems(), id) : null;
  });

  protected readonly plural = plural;
  protected readonly tone = attemptTone;
  protected readonly formatDate = formatDate;

  constructor() {
    this.loadCases();
    if (this.isStudent) {
      this.loadHistory();
      this.loadUnlocks();
    }
  }

  /** Etiqueta en español de un estado: el de un intento (historial) o el de una versión de caso. */
  statusLabel(status: string): string {
    return statusLabel(status);
  }

  protected loadCases(): void {
    this.casesLoading.set(true);
    this.simulationService.listCases().subscribe({
      next: cases => {
        this.cases.set(cases);
        this.casesError.set(null);
        this.casesLoading.set(false);
      },
      error: (error: HttpLikeError) => {
        this.casesError.set(error ?? {});
        this.casesLoading.set(false);
      },
    });
  }

  protected loadHistory(): void {
    this.historyLoading.set(true);
    this.simulationService.attemptHistory().subscribe({
      next: history => {
        this.history.set(history);
        this.historyError.set(null);
        this.historyLoading.set(false);
        this.historySettled.set(true);
      },
      error: (error: HttpLikeError) => {
        this.historyError.set(error ?? {});
        this.historyLoading.set(false);
        this.historySettled.set(true);
      },
    });
  }

  private loadUnlocks(): void {
    // Con tiempo límite: el desbloqueo solo matiza las tarjetas; si no llega, se pintan sin bloqueos.
    this.simulationService.getCatalog().pipe(timeout(4000)).subscribe({
      next: items => { this.catalogItems.set(items); this.catalogSettled.set(true); },
      error: () => this.catalogSettled.set(true),
    });
  }

  /** Entrar al caso: con un intento abierto, el juego ofrece reanudarlo (la tarjeta de reanudar es F6-2). */
  protected openCase(caseVersionId: number): void {
    void this.router.navigate(['/portal/simulador', caseVersionId]);
  }

  protected openEditor(caseVersionId: number): void {
    void this.router.navigate(['/portal/casos', caseVersionId, 'editor']);
  }

  protected openReport(attempt: StudentAttemptSummary): void {
    this.dialog.open<void, StudentReportDialogData>(StudentReportDialogComponent, {
      data: { attemptId: attempt.attemptId, caseTitle: attempt.caseTitle },
      size: 'md',
    });
  }
}
