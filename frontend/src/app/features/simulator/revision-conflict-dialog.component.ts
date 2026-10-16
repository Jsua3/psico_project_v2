import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialogActions, UiDialogFrame } from '../../shared/ui/dialog/ui-dialog';

export interface RevisionConflictDialogData {
  /** La revisión que esta pantalla tenía (null si no se sabe). */
  mineRevision: number | null;
  /** La revisión vigente en el servidor. */
  currentRevision: number;
  /** Lo que cambió, ya dicho en frases (`describeEditorChanges`). */
  changes: string[];
}

/** `retry` aplica lo propio sobre la versión vigente; `reload` descarta lo propio y carga la vigente. */
export type RevisionConflictAnswer = 'retry' | 'reload';

/**
 * El 409 `REVISION_CONFLICT` explicado (plan F8-1; RNF-08, REGLA-011): otra sesión editó el caso entre medias. Dice qué
 * revisión tenía esta pantalla y cuál hay, lista lo que cambió y ofrece dos salidas con nombre. El foco empieza en la
 * segura («Recargar el caso»: no pisa lo de la otra sesión). Cerrar sin elegir (Esc, «Cerrar») no cambia nada.
 * Lo comparten el editor de casos y el guardado del mundo.
 */
@Component({
  selector: 'app-revision-conflict-dialog',
  imports: [UiButton, UiDialogActions, UiDialogFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame title="Este caso cambió en otra sesión" [description]="summary()">
      @if (data.changes.length) {
        <p class="rc-lead">Lo que cambió en la otra sesión:</p>
        <ul class="rc-changes">
          @for (change of data.changes; track change) {
            <li>{{ change }}</li>
          }
        </ul>
      }
      <p class="rc-help">
        <strong>Recargar el caso</strong> carga la versión vigente y descarta lo que ibas a guardar.
        <strong>Reintentar con mi cambio</strong> lo aplica sobre la versión vigente.
      </p>
      <button ui-button uiDialogActions type="button" variant="secondary" (click)="ref.close('retry')">Reintentar con mi cambio</button>
      <button ui-button uiDialogActions type="button" data-autofocus (click)="ref.close('reload')">Recargar el caso</button>
    </ui-dialog-frame>
  `,
  styles: [`
    :host { display: block; }
    .rc-lead, .rc-help { margin: 0 0 var(--ds-space-3); color: var(--ds-text-1); }
    .rc-changes { margin: 0 0 var(--ds-space-3); padding-inline-start: var(--ds-space-5); color: var(--ds-text-1); }
    .rc-help { color: var(--ds-text-2); font-size: var(--ds-type-body-s-size); line-height: var(--ds-type-body-s-line); }
  `],
})
export class RevisionConflictDialogComponent {
  protected readonly ref = inject<DialogRef<RevisionConflictAnswer>>(DialogRef);
  protected readonly data = inject<RevisionConflictDialogData>(DIALOG_DATA);

  protected readonly summary = computed(() =>
    this.data.mineRevision === null
      ? `El caso va en la revisión ${this.data.currentRevision}.`
      : `Tu pantalla tenía la revisión ${this.data.mineRevision} y el caso va en la ${this.data.currentRevision}.`);
}
