import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationMessage {
  id: number;
  type: NotificationType;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 1;
  private readonly messagesSubject = new BehaviorSubject<NotificationMessage[]>([]);
  readonly messages$ = this.messagesSubject.asObservable();

  show(type: NotificationType, text: string, autoCloseMs = 5000): void {
    const message: NotificationMessage = { id: this.nextId++, type, text };
    this.messagesSubject.next([...this.messagesSubject.value, message]);

    if (autoCloseMs > 0) {
      setTimeout(() => this.dismiss(message.id), autoCloseMs);
    }
  }

  success(text: string): void {
    this.show('success', text);
  }

  error(text: string): void {
    this.show('error', text);
  }

  warning(text: string): void {
    this.show('warning', text);
  }

  info(text: string): void {
    this.show('info', text);
  }

  dismiss(id: number): void {
    this.messagesSubject.next(this.messagesSubject.value.filter(message => message.id !== id));
  }

  clear(): void {
    this.messagesSubject.next([]);
  }
}
