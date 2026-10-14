import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialogActions, UiDialogFrame } from '../../shared/ui/dialog/ui-dialog';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { statusLabel } from '../../shared/ui/labels';

export interface ReplaceAttemptDialogData {
  studentAlias: string;
  caseTitle: string;
}

/** El máximo de `ReplaceAttemptRequest.reason` en el servidor (E1-2). */
export const REPLACE_REASON_MAX = 500;

/**
 * Motivo del reemplazo docente (plan visual F7b-7; E1-2, RN-07). El reemplazo cierra el intento abierto del estudiante
 * como «Reemplazado por un intento nuevo» y bloquea su bitácora; el motivo es obligatorio y queda registrado. Devuelve
 * el motivo (sin espacios de más) o `undefined` si se cancela.
 */
@Component({
  selector: 'app-replace-attempt-dialog',
  imports: [ReactiveFormsModule, UiButton, UiControl, UiDialogActions, UiDialogFrame, UiField],
  // Eager: el error del campo sale de `control.touched`, que no es una señal.
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <form novalidate [formGroup]="form" (ngSubmit)="confirm()">
      <ui-dialog-frame title="Reemplazar intento" [description]="description">
        <ui-field label="Motivo del reemplazo" required [hint]="hint" [error]="error()">
          <textarea uiControl rows="3" [attr.maxlength]="max" [formControl]="reason" data-autofocus></textarea>
        </ui-field>
        <button ui-button uiDialogActions type="button" variant="secondary" (click)="cancel()">Cancelar</button>
        <button ui-button uiDialogActions type="submit" variant="danger">Reemplazar intento</button>
      </ui-dialog-frame>
    </form>
  `,
})
export class ReplaceAttemptDialogComponent {
  private readonly ref = inject<DialogRef<string | undefined>>(DialogRef);
  private readonly data = inject<ReplaceAttemptDialogData>(DIALOG_DATA);

  protected readonly max = REPLACE_REASON_MAX;
  protected readonly reason = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(REPLACE_REASON_MAX)] });
  protected readonly form = new FormGroup({ reason: this.reason });
  protected readonly description =
    `El intento de ${this.data.studentAlias} en «${this.data.caseTitle}» se cerrará como «${statusLabel('REPLACED')}» ` +
    'y su bitácora quedará bloqueada; la próxima vez que entre al caso empezará uno nuevo.';
  protected readonly hint = `Queda registrado en el intento. Hasta ${REPLACE_REASON_MAX} caracteres.`;

  protected error(): string | null {
    if (!this.reason.touched) return null;
    if (!this.reason.value.trim()) return 'Escribe el motivo del reemplazo.';
    return this.reason.hasError('maxlength') ? `El motivo no puede pasar de ${REPLACE_REASON_MAX} caracteres.` : null;
  }

  protected confirm(): void {
    this.reason.markAsTouched();
    const value = this.reason.value.trim();
    if (!value || this.reason.invalid) return;
    this.ref.close(value);
  }

  protected cancel(): void {
    this.ref.close(undefined);
  }
}
