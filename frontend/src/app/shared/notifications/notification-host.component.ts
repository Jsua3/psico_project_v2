import { LiveAnnouncer } from '@angular/cdk/a11y';
import { AsyncPipe, NgClass } from '@angular/common';
import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { NotificationMessage, NotificationService } from '../../core/notifications/notification.service';

@Component({
  selector: 'app-notification-host',
  standalone: true,
  imports: [AsyncPipe, NgClass, MatIconModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="siep-notifications" aria-label="Mensajes del sistema">
      @for (message of notifications.messages$ | async; track message.id) {
        <article
          class="siep-notification"
          [ngClass]="'siep-notification--' + message.type"
          [attr.role]="message.type === 'error' ? 'alert' : null"
          (mouseenter)="notifications.pause(message.id)"
          (mouseleave)="onPointerLeave($event, message.id)"
          (focusin)="notifications.pause(message.id)"
          (focusout)="onFocusOut($event, message.id)"
        >
          <p>{{ message.text }}</p>
          <button type="button" aria-label="Cerrar aviso" (click)="notifications.dismiss(message.id)">
            <mat-icon aria-hidden="true">close</mat-icon>
          </button>
        </article>
      }
    </section>
  `
})
export class NotificationHostComponent {
  readonly notifications = inject(NotificationService);
  private readonly announcer = inject(LiveAnnouncer);
  /** Ids de avisos no error que ya se anunciaron; se poda con los avisos que siguen visibles. */
  private readonly announced = new Set<number>();

  constructor() {
    this.notifications.messages$
      .pipe(takeUntilDestroyed())
      .subscribe(messages => this.announceNew(messages));
  }

  /*
   * La pausa del servicio es un booleano, no un contador: si el aviso conserva el cursor o el foco,
   * salir por el otro camino no debe reanudar el cierre automático.
   */

  /*
   * Los errores se anuncian solos con role="alert" al insertarse. Los demás avisos van sin role y se
   * anuncian con cortesía por la región viva del CDK, una sola vez por aviso: un role="status" que nace
   * ya con su texto no lo anuncian de forma fiable todos los lectores de pantalla.
   */
  private announceNew(messages: readonly NotificationMessage[]): void {
    const visible = new Set(messages.map(message => message.id));
    for (const id of this.announced) {
      if (!visible.has(id)) this.announced.delete(id);
    }
    for (const message of messages) {
      if (message.type === 'error' || this.announced.has(message.id)) continue;
      this.announced.add(message.id);
      void this.announcer.announce(message.text, 'polite');
    }
  }

  /** El cursor sale del aviso: se reanuda solo si el foco no sigue dentro. */
  onPointerLeave(event: Event, id: number): void {
    const item = event.currentTarget as HTMLElement;
    if (item.contains(item.ownerDocument.activeElement)) return;
    this.notifications.resume(id);
  }

  /** El foco sale del aviso: se reanuda solo si no pasa a otro punto del aviso ni queda el cursor encima. */
  onFocusOut(event: Event, id: number): void {
    const item = event.currentTarget as HTMLElement;
    const next = (event as FocusEvent).relatedTarget;
    if (next instanceof Node && item.contains(next)) return;
    if (item.matches(':hover')) return;
    this.notifications.resume(id);
  }
}
