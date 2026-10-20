import { ChangeDetectionStrategy, Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, merge } from 'rxjs';
import { RubricAdmin, RubricService } from '../../core/api/rubric.service';
import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { SimulationCaseSummary } from '../../core/models/simulation.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { apiErrorMessage } from '../../core/api/api-error.util';
import { focusFirstInvalid } from '../../shared/forms/focus-first-invalid.util';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiIconButton } from '../../shared/ui/button/ui-icon-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { UiPageActions, UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';

/** E2-2: una rúbrica ajena (la global o la de otra persona) es de solo lectura para el docente. */
export const RUBRIC_READ_ONLY_MESSAGE = 'Esta rúbrica es de solo lectura: no la creaste tú. Duplícala para personalizarla.';
export const RUBRIC_GONE_MESSAGE = 'Esta rúbrica ya no está disponible.';
export const RUBRIC_CASE_NOT_OWNED_MESSAGE = 'Solo quien creó el caso puede asignarle una rúbrica.';

/**
 * Pantalla Rúbricas (plan visual F7-5): campos `ui-field`, esqueleto y error con «Reintentar» en la lista, lista vacía
 * con su acción, y cada botón que no se puede pulsar dice POR QUÉ («La ponderación debe sumar 100 %.», «Guarda la
 * rúbrica primero.») en vez de quedar apagado sin explicación. Mientras guarda dice «Guardando…».
 */
@Component({
  selector: 'app-rubrics',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiBadge, UiButton, UiIconButton, UiCard, UiControl, UiField, UiPageActions, UiPageHeader, UiSection, UiSkeleton,
    UiEmptyState, UiErrorState,
  ],
  templateUrl: './rubrics.component.html',
  styleUrl: './rubrics.component.scss',
  // Eager: los errores de los campos salen de `control.touched`, que no es una señal.
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class RubricsComponent implements OnInit {
  private readonly rubricService = inject(RubricService);
  private readonly simulationService = inject(SimulationService);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(NotificationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly formTick = signal(0);
  // @ViewChild y no viewChild(): ts-jest no aplica la transformación JIT de Angular a las queries con signals.
  @ViewChild(FormGroupDirective) private formDirective?: FormGroupDirective;

  /** E2-2: solo el administrador fija la rúbrica predeterminada (al docente el servidor le responde 403). */
  protected readonly canSetDefault = inject(AuthService).hasRole('ADMIN');
  /** E2-2: la rúbrica abierta resultó ajena (403 al modificarla): se dice y se ofrece duplicarla. */
  readonly readOnly = signal(false);

  rubrics = signal<RubricAdmin[]>([]);
  selected = signal<RubricAdmin | null>(null);
  cases = signal<SimulationCaseSummary[]>([]);
  caseVersionId = signal(0);
  query = signal('');
  statusFilter = signal('ALL');
  loading = signal(false);
  saving = signal(false);
  message = signal('');
  messageIsError = signal(false);
  /** La LISTA no pudo cargarse (distinto de no poder abrir una rúbrica: eso queda junto al formulario). */
  listError = signal(false);

  /** Estado de la lista (esqueleto, error con «Reintentar», primer uso o lista): una sola señal, de a uno. */
  readonly listState = uiDataState({
    loading: this.loading,
    error: this.listError,
    isEmpty: computed(() => this.rubrics().length === 0),
  });
  /**
   * Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia): la carga de la lista y
   * el aviso de no poder abrir una rúbrica (la lista caída ya la dice su propio estado de error).
   */
  protected readonly statusText = computed(() => {
    if (this.listState() === 'loading') return 'Cargando rúbricas…';
    return this.messageIsError() && this.listState() !== 'error' ? this.message() : '';
  });

  form = this.fb.group({
    name: ['', Validators.required],
    description: [''],
    version: ['1.0', Validators.required],
    criteria: this.fb.array([]),
  });

  constructor() {
    merge(this.form.valueChanges, this.form.statusChanges).subscribe(() => {
      this.formTick.update(v => v + 1);
    });
  }

  get criteria(): FormArray {
    return this.form.get('criteria') as FormArray;
  }

  ngOnInit(): void {
    this.load();
    this.simulationService.listCases().subscribe({
      next: cases => this.cases.set(cases),
      error: () => this.cases.set([]),
    });
  }

  filteredRubrics(): RubricAdmin[] {
    const query = this.query().trim().toLowerCase();
    const status = this.statusFilter();
    return this.rubrics().filter(rubric => {
      const matchesQuery = !query || rubric.name.toLowerCase().includes(query);
      const matchesStatus = status === 'ALL' || (status === 'ACTIVE' ? rubric.active : !rubric.active);
      return matchesQuery && matchesStatus;
    });
  }

  totalWeight(): number {
    this.formTick();
    return this.criteria.controls.reduce((sum, control) => sum + Number(control.get('weight')?.value || 0), 0);
  }

  /** Carga la lista. Con `keepMessage` (tras un 404) conserva el aviso que explica por qué se recargó. */
  load(keepMessage = false): void {
    this.loading.set(true);
    this.listError.set(false);
    this.rubricService.list().subscribe({
      next: rubrics => {
        this.rubrics.set(rubrics);
        if (!keepMessage) {
          this.message.set('');
          this.messageIsError.set(false);
        }
        this.loading.set(false);
        // `load` ya decidió qué hacer con el aviso (keepMessage): abrir la primera no lo retira.
        if (!this.selected() && !this.startedNew && rubrics.length) this.openRubric(rubrics[0].id, true);
      },
      error: () => {
        this.message.set('No fue posible cargar las rúbricas.');
        this.messageIsError.set(true);
        this.listError.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Mensaje de error de un campo, solo cuando ya se tocó o se intentó enviar. */
  fieldError(control: AbstractControl, message: string): string | null {
    return control.touched && control.invalid ? message : null;
  }

  clearFilters(): void {
    this.query.set('');
    this.statusFilter.set('ALL');
  }

  /** Por qué no se puede activar ni marcar como predeterminada la rúbrica abierta (null si se puede). */
  activateReason(): string | null {
    if (!this.selected()) return 'Guarda la rúbrica primero.';
    return this.totalWeight() !== 100 ? 'La ponderación debe sumar 100 %.' : null;
  }

  /** Por qué no se puede actuar sobre la rúbrica abierta (null si hay una guardada). */
  selectedReason(): string | null {
    return this.selected() ? null : 'Guarda la rúbrica primero.';
  }

  assignReason(): string | null {
    if (!this.selected()) return 'Guarda la rúbrica primero.';
    return this.caseVersionId() ? null : 'Elige una simulación publicada.';
  }

  rowLabel(rubric: RubricAdmin): string {
    return rubric.isDefault ? 'Predeterminada' : (rubric.active ? 'Activa' : 'Inactiva');
  }

  rowTone(rubric: RubricAdmin): UiBadgeTone {
    return rubric.isDefault ? 'success' : (rubric.active ? 'info' : 'neutral');
  }

  /**
   * La última apertura que la persona pidió (abrir una rúbrica o empezar una nueva). El detalle de una apertura anterior
   * puede llegar después —sobre todo el de la primera rúbrica, que `load` abre sola— y no debe pisar lo que ya se eligió.
   */
  private openRequest = 0;
  /** La persona ya empezó una rúbrica nueva: la lista que llegue tarde no abre la primera encima de su formulario. */
  private startedNew = false;

  /** Abre una rúbrica. Elegir otra retira el aviso de la anterior (salvo cuando la apertura es la de `load`). */
  openRubric(id: number, keepMessage = false): void {
    this.readOnly.set(false);
    if (!keepMessage) this.clearMessage();
    this.startedNew = false;
    const request = ++this.openRequest;
    this.rubricService.detail(id).subscribe({
      next: rubric => {
        if (request !== this.openRequest) return;
        this.selected.set(rubric);
        this.populate(rubric);
      },
      error: () => {
        if (request !== this.openRequest) return;
        this.message.set('No fue posible abrir la rúbrica.');
        this.messageIsError.set(true);
      },
    });
  }

  newRubric(): void {
    this.openRequest += 1;
    this.startedNew = true;
    this.readOnly.set(false);
    this.clearMessage();
    this.selected.set(null);
    this.resetRubricForm({ name: '', description: '', version: '1.0' });
    this.criteria.clear();
    this.addCriterion();
  }

  addCriterion(): void {
    this.criteria.push(this.fb.group({
      id: [null],
      title: ['', Validators.required],
      description: [''],
      weight: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
      displayOrder: [this.criteria.length + 1, [Validators.required, Validators.min(1)]],
      active: [true],
    }));
  }

  removeCriterion(index: number): void {
    this.criteria.removeAt(index);
  }

  save(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement);
      return;
    }
    const payload = this.payload();
    this.saving.set(true);
    const request = this.selected()
      ? this.rubricService.update(this.selected()!.id, payload)
      : this.rubricService.create(payload);
    request.subscribe({
      next: rubric => {
        this.selected.set(rubric);
        this.populate(rubric);
        this.notify.success('Rúbrica guardada.');
        this.saving.set(false);
        this.load();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.explainError(err, 'No fue posible guardar la rúbrica.');
      },
    });
  }

  activate(): void {
    this.withSelected(id => this.rubricService.activate(id), 'Rúbrica activada.');
  }

  deactivate(): void {
    this.withSelected(id => this.rubricService.deactivate(id), 'Rúbrica desactivada.');
  }

  duplicate(): void {
    // Con cambios sin guardar (p. ej. tras el 403 de una rúbrica ajena, que es justo cuando la pantalla ofrece duplicar)
    // la copia lleva LO ESCRITO: duplicar la versión guardada descartaría el trabajo del docente.
    if (!this.form.dirty) {
      this.withSelected(id => this.rubricService.duplicate(id), 'Rúbrica duplicada.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement);
      return;
    }
    const draft = this.payload();
    this.rubricService.create({
      ...draft,
      name: `Copia de ${draft.name}`,
      criteria: (draft.criteria ?? []).map(criterion => ({ ...criterion, id: undefined })),
    }).subscribe({
      next: copy => {
        this.readOnly.set(false);
        this.clearMessage();
        this.selected.set(copy);
        this.populate(copy);
        this.notify.success('Rúbrica duplicada con tus cambios.');
        this.load();
      },
      error: (err: unknown) => this.explainError(err, 'No fue posible duplicar la rúbrica.'),
    });
  }

  setDefault(): void {
    this.withSelected(id => this.rubricService.setDefault(id), 'Rúbrica predeterminada actualizada.');
  }

  assign(): void {
    const rubric = this.selected();
    const caseVersionId = this.caseVersionId();
    if (!rubric || !caseVersionId) return;
    this.rubricService.assignToCaseVersion(caseVersionId, rubric.id).subscribe({
      next: () => {
        this.notify.success('Rúbrica asignada a la simulación.');
      },
      error: (err: unknown) => {
        // E2-2: solo quien autora el caso (o el administrador) le asigna rúbrica.
        const text = err instanceof HttpErrorResponse && err.status === 403
          ? RUBRIC_CASE_NOT_OWNED_MESSAGE
          : apiErrorMessage(err, 'No fue posible asignar la rúbrica.');
        if (text) this.notify.error(text);
      },
    });
  }

  selectCaseVersion(value: string): void {
    this.caseVersionId.set(Number(value || 0));
  }

  /**
   * Reinicia valores Y el estado «enviado» del formulario (`form.reset()` deja `submitted` en true): así un formulario
   * recién abierto no hereda el envío fallido del anterior.
   */
  private resetRubricForm(value: { name: string; description: string; version: string }): void {
    if (this.formDirective) this.formDirective.resetForm(value);
    else this.form.reset(value);
  }

  private populate(rubric: RubricAdmin): void {
    this.resetRubricForm({
      name: rubric.name,
      description: rubric.description || '',
      version: rubric.version || '1.0',
    });
    this.criteria.clear();
    (rubric.criteria || []).forEach(item => {
      this.criteria.push(this.fb.group({
        id: [item.id ?? null],
        title: [item.title, Validators.required],
        description: [item.description || ''],
        weight: [item.weight, [Validators.required, Validators.min(0), Validators.max(100)]],
        displayOrder: [item.displayOrder, [Validators.required, Validators.min(1)]],
        active: [item.active],
      }));
    });
  }

  private payload(): Partial<RubricAdmin> {
    return {
      name: this.form.value.name || '',
      description: this.form.value.description || '',
      version: this.form.value.version || '1.0',
      criteria: this.criteria.controls.map((control, index) => ({
        id: control.get('id')?.value || undefined,
        title: control.get('title')?.value || '',
        competency: control.get('title')?.value || '',
        description: control.get('description')?.value || '',
        weight: Number(control.get('weight')?.value || 0),
        displayOrder: Number(control.get('displayOrder')?.value || index + 1),
        active: Boolean(control.get('active')?.value),
      })),
    };
  }

  /** El aviso de una rúbrica no acompaña a otra: se retira al abrir, crear o duplicar. */
  private clearMessage(): void {
    this.message.set('');
    this.messageIsError.set(false);
  }

  private withSelected(action: (id: number) => Observable<RubricAdmin>, success: string): void {
    const rubric = this.selected();
    if (!rubric) return;
    action(rubric.id).subscribe({
      next: updated => {
        this.readOnly.set(false);
        this.clearMessage();
        this.selected.set(updated);
        this.populate(updated);
        this.notify.success(success);
        this.load();
      },
      error: (err: unknown) => this.explainError(err, 'No fue posible actualizar la rúbrica.'),
    });
  }

  /**
   * E2-2: 403 = rúbrica ajena (solo lectura: se dice junto al formulario y se ofrece duplicarla); 404 = ya no está
   * disponible (se dice y la lista se vuelve a pedir); lo demás, el aviso de siempre.
   */
  private explainError(err: unknown, fallback: string): void {
    const status = err instanceof HttpErrorResponse ? err.status : null;
    if (status === 403) {
      this.readOnly.set(true);
      this.message.set(RUBRIC_READ_ONLY_MESSAGE);
      this.messageIsError.set(true);
      return;
    }
    if (status === 404) {
      this.message.set(RUBRIC_GONE_MESSAGE);
      this.messageIsError.set(true);
      this.startedNew = false;
      this.selected.set(null);
      this.load(true);
      return;
    }
    const text = apiErrorMessage(err, fallback);
    if (text) this.notify.error(text);
  }
}
