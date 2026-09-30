import { AsyncPipe, NgClass } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NotificationService } from '../../core/notifications/notification.service';

@Component({
  selector: 'app-notification-host',
  standalone: true,
  imports: [AsyncPipe, NgClass, MatIconModule],
  template: `
    <section class="siep-notifications" aria-label="Mensajes del sistema">
      @for (message of notifications.messages$ | async; track message.id) {
        <article
          class="siep-notification"
          [ngClass]="'siep-notification--' + message.type"
          [attr.role]="message.type === 'error' ? 'alert' : 'status'"
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

  /*
   * La pausa del servicio es un booleano, no un contador: si el aviso conserva el cursor o el foco,
   * salir por el otro camino no debe reanudar el cierre automático.
   */

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
