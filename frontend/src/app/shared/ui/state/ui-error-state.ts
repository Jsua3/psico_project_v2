import {
  ChangeDetectionStrategy, Component, ElementRef, Injectable, afterNextRender, booleanAttribute, computed, inject, input,
  output, viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { UiButton } from '../button/ui-button';
import { ERROR_STATE_COPY, STATE_ACTION_COPY, UiErrorKind } from './state-copy';

export type { UiErrorKind } from './state-copy';

/** Ventana en la que un error recién pintado cuenta como «el reintento volvió a fallar». */
const RETRY_FOCUS_WINDOW_MS = 10_000;

/**
 * Recuerda que alguien pulsó «Reintentar». Lo normal es que el bloque pase a «cargando» (el estado de error se
 * desmonta, y con él el botón que tenía el foco) y, si falla otra vez, se monte un estado de error NUEVO: ese es
 * el que debe recibir el foco (WCAG 2.4.3), y solo ese.
 */
@Injectable({ providedIn: 'root' })
export class UiRetryTracker {
  private retriedAt = Number.NEGATIVE_INFINITY;

  markRetry(): void {
    this.retriedAt = Date.now();
  }

  consumeRecentRetry(): boolean {
    const recent = Date.now() - this.retriedAt < RETRY_FOCUS_WINDOW_MS;
    this.retriedAt = Number.NEGATIVE_INFINITY;
    return recent;
  }
}

/**
 * Estado de error (plan visual §2.5, F2-5): nunca tragado. Mensaje humano, «Reintentar» donde puede cambiar algo
 * (red, servidor) y el detalle técnico plegado con el código HTTP. Bloqueante: `role="alert"`; parcial (un bloque):
 * `role="status"` y el resto de la página sigue viva. Tras un reintento fallido el foco va a su título.
 */
@Component({
  selector: 'ui-error-state',
  imports: [MatIconModule, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-error-state',
    '[class.ui-error-state--blocking]': 'blocking()',
    '[attr.role]': "blocking() ? 'alert' : 'status'",
  },
  template: `
    <mat-icon class="ui-error-state__icon" aria-hidden="true">{{ copy().icon }}</mat-icon>
    <p #title class="ui-error-state__title" tabindex="-1">{{ copy().title }}</p>
    <p class="ui-error-state__message">{{ message() || copy().message }}</p>
    @if (copy().retry) {
      <button ui-button type="button" variant="secondary" (click)="onRetry()">{{ actions.retry }}</button>
    }
    @if (technical(); as technical) {
      <details class="ui-error-state__details">
        <summary>{{ actions.technicalDetail }}</summary>
        <code>{{ technical }}</code>
      </details>
    }
  `,
  styleUrl: './ui-error-state.scss',
})
export class UiErrorState {
  readonly kind = input<UiErrorKind>('server');
  readonly message = input<string | null | undefined>(null);
  readonly detail = input<string | null | undefined>(null);
  readonly status = input<number | null | undefined>(null);
  readonly blocking = input(false, { transform: booleanAttribute });
  readonly retry = output<void>();

  protected readonly actions = STATE_ACTION_COPY;
  protected readonly copy = computed(() => ERROR_STATE_COPY[this.kind()]);
  protected readonly technical = computed(() => {
    const status = this.status();
    const parts = [status === null || status === undefined ? null : `HTTP ${status}`, this.detail() || null];
    return parts.filter(Boolean).join(' · ') || null;
  });

  private readonly tracker = inject(UiRetryTracker);
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');

  constructor() {
    afterNextRender(() => {
      if (this.tracker.consumeRecentRetry()) this.title().nativeElement.focus();
    });
  }

  protected onRetry(): void {
    this.tracker.markRetry();
    this.retry.emit();
  }
}
