import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnInit, afterNextRender, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthoringApi } from '../../core/api/authoring.api';
import { SimulationCaseSummary } from '../../core/models/simulation.model';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { plural, statusLabel } from '../../shared/ui/labels';
import { UiPageActions, UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';

/**
 * Hub de edición de casos (plan visual F7-7): estados de la lista de a uno (esqueleto, error con «Reintentar», primer
 * uso con su acción), creación con su error y su reintento (con los mismos datos) y el estado de cada caso con su
 * etiqueta humana («Borrador», no `DRAFT`).
 */
@Component({
  selector: 'app-case-authoring-hub',
  standalone: true,
  imports: [
    ReactiveFormsModule, RouterLink,
    UiBadge, UiButton, UiCard, UiControl, UiField, UiPageActions, UiPageHeader, UiSection, UiSkeleton,
    UiEmptyState, UiErrorState,
  ],
  templateUrl: './case-authoring-hub.component.html',
  styleUrl: './case-authoring-hub.component.scss',
  // Eager: el error del campo sale de `control.touched`, que no es una señal.
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class CaseAuthoringHubComponent implements OnInit {
  private readonly authoringApi = inject(AuthoringApi);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly statusLabel = statusLabel;
  readonly plural = plural;
  readonly cases = signal<SimulationCaseSummary[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);
  readonly creatingCase = signal(false);
  /** La LISTA no pudo cargarse (el texto va en el estado de error de la lista). */
  readonly error = signal('');
  /** La creación falló: el error vive junto al formulario, con su «Reintentar». */
  readonly createFailed = signal(false);
  readonly newCaseForm = this.fb.group({
    title: ['', Validators.required],
    code: [''],
    description: [''],
  });

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

  /** Mensaje de error de un campo, solo cuando ya se tocó o se intentó enviar. */
  fieldError(control: AbstractControl, message: string): string | null {
    return control.touched && control.invalid ? message : null;
  }

  statusTone(status: string | null | undefined): UiBadgeTone {
    const normalized = (status ?? '').toUpperCase();
    if (normalized === 'PUBLISHED') return 'success';
    if (normalized === 'IN_REVIEW') return 'info';
    return 'neutral';
  }

  toggleCreate(): void {
    this.creating.update(value => !value);
    this.createFailed.set(false);
    if (this.creating()) {
      // El foco va al primer campo: el formulario aparece donde la persona acaba de pulsar.
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.hub-create input')?.focus(), { injector: this.injector });
    }
  }

  createCase(): void {
    if (this.creatingCase()) return;
    if (this.newCaseForm.invalid) {
      this.newCaseForm.markAllAsTouched();
      this.host.nativeElement.querySelector<HTMLElement>('.hub-create input.ng-invalid')?.focus();
      return;
    }
    const value = this.newCaseForm.getRawValue();
    this.creatingCase.set(true);
    this.createFailed.set(false);
    this.authoringApi.createCase({
      title: value.title ?? '',
      code: value.code || null,
      description: value.description || null,
    }).subscribe({
      next: model => {
        this.creatingCase.set(false);
        this.router.navigate(['/portal/casos', model.caseVersionId, 'editor']);
      },
      error: () => {
        this.createFailed.set(true);
        this.creatingCase.set(false);
      },
    });
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
