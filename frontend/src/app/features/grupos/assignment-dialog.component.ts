import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, signal } from '@angular/core';

import { Assignment } from '../../core/models/assignment.model';
import { SimulationCaseSummary } from '../../core/models/simulation.model';
import { uniqueUiId } from '../../shared/ui/button/click-guard';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialogActions, UiDialogFrame } from '../../shared/ui/dialog/ui-dialog';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { fromWindowIso, toWindowIso, windowError } from './assignment-window.util';

export interface AssignmentDialogData {
  mode: 'create' | 'edit';
  /** Casos publicados que todavía no están asignados al grupo (solo al asignar). */
  cases: SimulationCaseSummary[];
  /** Al cambiar las fechas: la asignación y el título de su caso. */
  assignment?: Assignment;
  title?: string;
}

/** Lo que la docente decidió: el caso (solo al asignar) y las dos fechas como instantes ISO; `null` = sin fecha. */
export interface AssignmentDialogResult {
  caseVersionId?: number;
  opensAt: string | null;
  closesAt: string | null;
}

type DialogField = 'caseVersionId' | 'opensAt' | 'closesAt';

/**
 * Asignar un caso a un grupo o cambiar su ventana (plan visual F10-5†; C7, RF-14, RF-15, CU-06): el caso, desde cuándo y
 * hasta cuándo. Las fechas son opcionales (sin ellas, abierto desde ya y sin cierre) y su ayuda dice qué pasa en cada
 * borde: tras el cierre nadie empieza el caso, pero quien ya lo empezó lo puede terminar (decisión 12). Cada error sale en
 * su campo y recibe el foco; cerrar sin guardar (Cancelar, Esc) no cambia nada.
 */
@Component({
  selector: 'app-assignment-dialog',
  imports: [UiButton, UiControl, UiDialogActions, UiDialogFrame, UiField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame [title]="title" [description]="description">
      <form class="ad-form" novalidate [id]="formId" (submit)="submit($event)">
        @if (data.mode === 'create') {
          <ui-field label="Caso" required [error]="errors().caseVersionId">
            <select uiControl [value]="caseVersionId()" (change)="caseVersionId.set(read($event))">
              <option value="">Elige un caso</option>
              @for (item of data.cases; track item.caseVersionId) {
                <option [value]="item.caseVersionId">{{ item.title }} · v{{ item.semanticVersion }}</option>
              }
            </select>
          </ui-field>
        }
        <ui-field label="Abre" hint="Déjalo vacío para que se abra desde ya." [error]="errors().opensAt">
          <input uiControl type="datetime-local" [value]="opensAt()" (input)="opensAt.set(read($event))" />
        </ui-field>
        <ui-field label="Cierra" hint="Déjalo vacío para que no cierre. Después del cierre nadie puede empezar el caso; quien ya lo empezó puede terminarlo."
          [error]="errors().closesAt">
          <input uiControl type="datetime-local" [value]="closesAt()" (input)="closesAt.set(read($event))" />
        </ui-field>
        <p class="ad-zone">La hora es la de tu navegador.</p>
      </form>
      <button ui-button uiDialogActions type="button" variant="secondary" (click)="ref.close()">Cancelar</button>
      <button ui-button uiDialogActions type="submit" [attr.form]="formId">{{ confirmLabel }}</button>
    </ui-dialog-frame>
  `,
  styles: [`
    :host { display: block; }
    .ad-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ds-space-4); }
    .ad-zone { margin: 0; color: var(--ds-text-2); font-size: var(--ds-type-body-s-size); line-height: var(--ds-type-body-s-line); }
  `],
})
export class AssignmentDialogComponent {
  protected readonly ref = inject<DialogRef<AssignmentDialogResult | undefined>>(DialogRef);
  protected readonly data = inject<AssignmentDialogData>(DIALOG_DATA);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly formId = uniqueUiId('ad-form');
  protected readonly title = this.data.mode === 'create' ? 'Asignar un caso al grupo' : `Fechas de «${this.data.title ?? 'el caso'}»`;
  protected readonly description = this.data.mode === 'create'
    ? 'Los estudiantes del grupo verán el caso en su catálogo dentro de las fechas que elijas.'
    : 'El cambio vale desde ya para todo el grupo.';
  protected readonly confirmLabel = this.data.mode === 'create' ? 'Asignar' : 'Guardar fechas';

  protected readonly caseVersionId = signal('');
  protected readonly opensAt = signal(fromWindowIso(this.data.assignment?.opensAt));
  protected readonly closesAt = signal(fromWindowIso(this.data.assignment?.closesAt));
  protected readonly errors = signal<Partial<Record<DialogField, string>>>({});

  protected read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors: Partial<Record<DialogField, string>> = {};
    if (this.data.mode === 'create' && !this.caseVersionId()) errors.caseVersionId = 'Elige un caso.';
    const window = windowError(this.opensAt(), this.closesAt());
    if (window) errors.closesAt = window;
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) {
      // Tras pintar los errores, el foco va al primer campo inválido (teclado y lector llegan al problema).
      afterNextRender(() => this.host.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), { injector: this.injector });
      return;
    }
    const result: AssignmentDialogResult = { opensAt: toWindowIso(this.opensAt()), closesAt: toWindowIso(this.closesAt()) };
    if (this.data.mode === 'create') result.caseVersionId = Number(this.caseVersionId());
    this.ref.close(result);
  }
}
