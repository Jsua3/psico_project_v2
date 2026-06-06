import { AsyncPipe, NgClass } from '@angular/common';
import { Component, inject } from '@angular/core';
import { NotificationService } from '../../core/notifications/notification.service';

@Component({
  selector: 'app-notification-host',
  standalone: true,
  imports: [AsyncPipe, NgClass],
  template: `
    <section class="siep-notifications" aria-live="polite" aria-label="Mensajes del sistema">
      @for (message of notifications.messages$ | async; track message.id) {
        <article class="siep-notification" [ngClass]="'siep-notification--' + message.type">
          <p>{{ message.text }}</p>
          <button type="button" aria-label="Cerrar mensaje" (click)="notifications.dismiss(message.id)">
            x
          </button>
        </article>
      }
    </section>
  `
})
export class NotificationHostComponent {
  readonly notifications = inject(NotificationService);
}
