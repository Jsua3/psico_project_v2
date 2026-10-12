import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { UiButton } from '../button/ui-button';
import { EMPTY_STATE_COPY, UiEmptyKind } from './state-copy';

export type { UiEmptyKind } from './state-copy';

/**
 * Estado vacío (plan visual §2.5, F2-5; VD-8): título = qué falta; descripción = por qué o qué hacer; acción si es
 * accionable. Tres clases con textos de reserva distintos (`state-copy.ts`). La ilustración es pixel art del juego
 * a escala entera y decorativa. «Sin resultados» se anuncia (role="status"): es la respuesta a una búsqueda.
 * El título es un párrafo destacado, no un encabezado: no rompe la jerarquía de la pantalla que lo contiene.
 */
@Component({
  selector: 'ui-empty-state',
  imports: [UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-empty-state',
    '[class]': "'ui-empty-state--' + kind()",
    '[attr.role]': "kind() === 'no-results' ? 'status' : null",
    '[attr.title]': 'null',
  },
  template: `
    <img class="ui-empty-state__art" alt="" [src]="copy().art.src"
      [width]="copy().art.width * copy().art.scale" [height]="copy().art.height * copy().art.scale" />
    <p class="ui-empty-state__title">{{ title() || copy().title }}</p>
    <p class="ui-empty-state__description">{{ description() || copy().description }}</p>
    @if (actionLabel() || copy().actionLabel; as label) {
      <button ui-button type="button" [variant]="kind() === 'first-use' ? 'primary' : 'secondary'" (click)="action.emit()">{{ label }}</button>
    }
  `,
  styleUrl: './ui-empty-state.scss',
})
export class UiEmptyState {
  readonly kind = input<UiEmptyKind>('first-use');
  readonly title = input<string | null | undefined>(null);
  readonly description = input<string | null | undefined>(null);
  readonly actionLabel = input<string | null | undefined>(null);
  readonly action = output<void>();

  protected readonly copy = computed(() => EMPTY_STATE_COPY[this.kind()]);
}
