import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';

import { NotificationMessage, NotificationService, NotificationType } from '../../../core/notifications/notification.service';
import { UiIconButton } from '../button/ui-icon-button';

const ICONS: Record<NotificationType, string> = {
  success: 'check_circle',
  info: 'info',
  warning: 'warning',
  error: 'error',
};

/**
 * Avisos del sistema con el lenguaje visual (plan visual §2.5 y §2.7, F2-7) sobre `NotificationService` (≤ 4,
 * deduplicados, errores persistentes). NUNCA mueven el foco: los errores se anuncian con `role="alert"` y los
 * demás una sola vez por la región viva del CDK (un `role="status"` que nace con su texto no lo anuncian todos los
 * lectores). El puntero o el foco encima pausan el cierre automático (WCAG 2.2.1). Entrada 200 ms con
 * `@starting-style`; salida 160 ms con `animate.leave`.
 */
@Component({
  selector: 'ui-toast-host',
  imports: [MatIconModule, UiIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-toast-host' },
  template: `
    <section class="ui-toast-host__region" aria-label="Mensajes del sistema">
      @for (message of messages(); track message.id) {
        <article class="ui-toast ds-motion" [class]="'ui-toast--' + message.type" animate.leave="ui-toast--leaving"
          [attr.role]="message.type === 'error' ? 'alert' : null"
          (mouseenter)="notifications.pause(message.id)" (mouseleave)="onPointerLeave($event, message.id)"
          (focusin)="notifications.pause(message.id)" (focusout)="onFocusOut($event, message.id)">
          <mat-icon class="ui-toast__icon" aria-hidden="true">{{ icons[message.type] }}</mat-icon>
          <p class="ui-toast__text">{{ message.text }}</p>
          <button ui-icon-button icon="close" label="Cerrar aviso" (click)="notifications.dismiss(message.id)"></button>
        </article>
      }
    </section>
  `,
  styleUrl: './ui-toast-host.scss',
})
export class UiToastHost {
  protected readonly notifications = inject(NotificationService);
  protected readonly messages = toSignal(this.notifications.messages$, { initialValue: [] });
  protected readonly icons = ICONS;
  private readonly announcer = inject(LiveAnnouncer);
  private readonly announced = new Set<number>();

  constructor() {
    this.notifications.messages$.pipe(takeUntilDestroyed()).subscribe(messages => this.announceNew(messages));
  }

  /** El puntero sale: se reanuda solo si el foco no sigue dentro del aviso. */
  protected onPointerLeave(event: Event, id: number): void {
    const item = event.currentTarget as HTMLElement;
    if (item.contains(item.ownerDocument.activeElement)) return;
    this.notifications.resume(id);
  }

  /** El foco sale: se reanuda solo si no pasa a otro punto del aviso ni queda el puntero encima. */
  protected onFocusOut(event: Event, id: number): void {
    const item = event.currentTarget as HTMLElement;
    const next = (event as FocusEvent).relatedTarget;
    if (next instanceof Node && item.contains(next)) return;
    if (item.matches(':hover')) return;
    this.notifications.resume(id);
  }

  private announceNew(messages: readonly NotificationMessage[]): void {
    const visible = new Set(messages.map(message => message.id));
    for (const id of this.announced) if (!visible.has(id)) this.announced.delete(id);
    for (const message of messages) {
      if (message.type === 'error' || this.announced.has(message.id)) continue;
      this.announced.add(message.id);
      void this.announcer.announce(message.text, 'polite');
    }
  }
}
