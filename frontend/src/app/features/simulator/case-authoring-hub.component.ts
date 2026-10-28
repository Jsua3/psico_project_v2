import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthoringApi } from '../../core/api/authoring.api';
import { SimulationCaseSummary } from '../../core/models/simulation.model';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { plural, statusLabel } from '../../shared/ui/labels';
import { UiPageActions, UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';

/**
 * Hub de edición de casos (plan visual F7-7): estados de la lista de a uno (esqueleto, error con «Reintentar», primer
 * uso con su acción) y el estado de cada caso con su etiqueta humana («Borrador», no `DRAFT`). Todo caso nuevo empieza
 * eligiendo un lugar (`casos/nuevo`): ya no hay formulario de caso en blanco.
 */
@Component({
  selector: 'app-case-authoring-hub',
  standalone: true,
  imports: [
    RouterLink,
    UiBadge, UiButton, UiCard, UiPageActions, UiPageHeader, UiSection, UiSkeleton,
    UiEmptyState, UiErrorState,
  ],
  templateUrl: './case-authoring-hub.component.html',
  styleUrl: './case-authoring-hub.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseAuthoringHubComponent implements OnInit {
  private readonly authoringApi = inject(AuthoringApi);
  private readonly router = inject(Router);

  readonly statusLabel = statusLabel;
  readonly plural = plural;
  readonly cases = signal<SimulationCaseSummary[]>([]);
  readonly loading = signal(true);
  /** La LISTA no pudo cargarse (el texto va en el estado de error de la lista). */
  readonly error = signal('');

  /** Estado de la lista de casos: una sola señal, de a uno. */
  readonly listState = uiDataState({
    loading: this.loading,
    error: this.error,
    isEmpty: computed(() => this.cases().length === 0),
  });
  /** Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia). */
  protected readonly statusText = computed(() => (this.listState() === 'loading' ? 'Cargando casos…' : ''));

  ngOnInit(): void {
    this.loadCases();
  }

  statusTone(status: string | null | undefined): UiBadgeTone {
    const normalized = (status ?? '').toUpperCase();
    if (normalized === 'PUBLISHED') return 'success';
    if (normalized === 'IN_REVIEW') return 'info';
    return 'neutral';
  }

  /** Crear un caso: elegir el lugar y las salas. */
  crearCaso(): void {
    void this.router.navigate(['/portal/casos/nuevo']);
  }

  loadCases(): void {
    this.loading.set(true);
    this.error.set('');
    this.authoringApi.listAuthoringCases().subscribe({
      next: cases => {
        this.cases.set(cases);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No fue posible cargar los casos disponibles.');
        this.loading.set(false);
      },
    });
  }
}
