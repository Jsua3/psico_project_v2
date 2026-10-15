import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';

import { apiErrorMessage } from '../../core/api/api-error.util';
import { Invitation, InvitationsApi } from '../../core/api/invitations.api';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { invitationLabel } from '../../shared/ui/labels';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { errorKindFromStatus, uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { formatDate } from '../dashboard/student-dashboard.util';

const TONES: Record<Invitation['status'], UiBadgeTone> = { INVITED: 'info', ACTIVE: 'success', DECLINED: 'neutral', REMOVED: 'neutral' };

/**
 * Bandeja de invitaciones del estudiante (plan visual F7b-5; C5 de E2-10; decisión 22 del usuario: un docente no suma
 * a un estudiante sin su aceptación). Ruta propia del portal con entrada en la barra (decisión del usuario,
 * 2026-10-14). Aceptar, rechazar (confirma) y salir de un grupo (confirma); una invitación que ya no está vigente
 * (409) se dice y la lista se vuelve a pedir. Sin ella, con el servidor de E2 un estudiante invitado no tenía forma de
 * aceptar (hacía falta el puente `SIEP_INVITATIONS_AUTO_ACCEPT`).
 */
@Component({
  selector: 'app-invitations',
  imports: [UiBadge, UiButton, UiCard, UiEmptyState, UiErrorState, UiPageHeader, UiSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page-header eyebrow="Mi entrenamiento" title="Invitaciones"
      description="Tus docentes te invitan a sus grupos. Al aceptar, verás los casos que te asignen en ese grupo." />

    <p class="ds-sr-only" role="status">{{ statusText() }}</p>

    @switch (state()) {
      @case ('loading') {
        <div class="inv-loading" aria-busy="true">
          @for (bone of [1, 2, 3]; track bone) {
            <ui-skeleton shape="row" />
          }
        </div>
      }
      @case ('error') {
        <ui-error-state [kind]="errorKind()" [status]="errorStatus()" message="No pudimos cargar tus invitaciones." (retry)="load()" />
      }
      @case ('empty') {
        <ui-empty-state kind="first-use" title="No tienes invitaciones"
          description="Cuando un docente te invite a uno de sus grupos, la invitación aparecerá aquí para que la aceptes." />
      }
      @case ('ready') {
        <ul class="inv-list">
          @for (item of invitations(); track item.groupId) {
            <li>
              <ui-card class="inv-item">
                <div class="inv-item__text">
                  <h2 class="inv-item__title">{{ item.groupName }}</h2>
                  <p class="inv-item__meta">
                    <ui-badge [tone]="tone(item)">{{ label(item.status) }}</ui-badge>
                    <span>Te invitó {{ item.teacherName || 'tu docente' }} · {{ date(item.invitedAt) }}</span>
                  </p>
                </div>
                @if (item.status === 'INVITED') {
                  <div class="inv-item__actions">
                    <button ui-button type="button" [loading]="busy() === item.groupId"
                      [attr.aria-label]="'Aceptar la invitación a ' + item.groupName" (click)="accept(item)">Aceptar</button>
                    <button ui-button type="button" variant="secondary"
                      [attr.aria-label]="'Rechazar la invitación a ' + item.groupName" (click)="decline(item)">Rechazar</button>
                  </div>
                } @else if (item.status === 'ACTIVE') {
                  <div class="inv-item__actions">
                    <button ui-button type="button" variant="secondary" [loading]="busy() === item.groupId"
                      [attr.aria-label]="'Salir del grupo ' + item.groupName" (click)="leave(item)">Salir del grupo</button>
                  </div>
                }
              </ui-card>
            </li>
          }
        </ul>
      }
    }
  `,
  styles: [`
    :host { display: block; }
    .inv-loading,
    .inv-list {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ds-space-4);
      margin: var(--ds-space-6) 0 0;
      padding: 0;
      list-style: none;
    }
    .inv-item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ds-space-4);
    }
    .inv-item__text {
      display: grid;
      flex: 1 1 16rem;
      gap: var(--ds-space-2);
      min-width: 0;
    }
    .inv-item__title {
      margin: 0;
      font-size: var(--ds-type-h3-size);
      line-height: var(--ds-type-h3-line);
      font-weight: var(--ds-type-h3-weight);
      overflow-wrap: anywhere;
    }
    .inv-item__meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ds-space-3);
      margin: 0;
      color: var(--ds-text-2);
      font-size: var(--ds-type-body-s-size);
      line-height: var(--ds-type-body-s-line);
    }
    .inv-item__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ds-space-3);
    }
  `],
})
export class InvitationsComponent {
  private readonly api = inject(InvitationsApi);
  private readonly dialog = inject(UiDialog);
  private readonly notify = inject(NotificationService);

  protected readonly invitations = signal<Invitation[]>([]);
  private readonly loading = signal(true);
  private readonly error = signal<{ status?: number } | null>(null);
  /** El grupo cuya respuesta está en curso: sus botones esperan y nada se envía dos veces. */
  protected readonly busy = signal<number | null>(null);
  private readonly actionStatus = signal('');

  protected readonly state = uiDataState({
    loading: this.loading,
    error: this.error,
    isEmpty: computed(() => this.invitations().length === 0),
  });
  /** Región de estado SIEMPRE presente: la carga y el resultado de cada respuesta. */
  protected readonly statusText = computed(() => (this.state() === 'loading' ? 'Cargando tus invitaciones…' : this.actionStatus()));
  protected readonly errorKind = computed(() => errorKindFromStatus(this.error()?.status));
  protected readonly errorStatus = computed(() => this.error()?.status ?? null);

  protected readonly label = invitationLabel;
  protected readonly date = (value: string | null) => formatDate(value);
  private confirming = false;

  constructor() {
    this.load();
  }

  protected tone(item: Invitation): UiBadgeTone {
    return TONES[item.status] ?? 'neutral';
  }

  load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: invitations => {
        this.invitations.set(invitations);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (err: { status?: number } | null) => {
        this.error.set(err ?? {});
        this.loading.set(false);
      },
    });
  }

  protected accept(item: Invitation): void {
    this.respond(item, this.api.accept(item.groupId), `Te uniste a ${item.groupName}.`);
  }

  protected async decline(item: Invitation): Promise<void> {
    const confirmed = await this.confirmOnce({
      title: 'Rechazar invitación',
      message: `¿Rechazar la invitación a «${item.groupName}»? Tu docente podrá volver a invitarte.`,
      confirmLabel: 'Rechazar',
    });
    if (confirmed) this.respond(item, this.api.decline(item.groupId), `Rechazaste la invitación a ${item.groupName}.`);
  }

  protected async leave(item: Invitation): Promise<void> {
    const confirmed = await this.confirmOnce({
      title: 'Salir del grupo',
      message: `¿Salir de «${item.groupName}»? Dejarás de ver los casos de ese grupo. Tu docente podrá volver a invitarte.`,
      confirmLabel: 'Salir del grupo',
      tone: 'danger',
    });
    if (confirmed) this.respond(item, this.api.leave(item.groupId), `Saliste de ${item.groupName}.`);
  }

  private async confirmOnce(options: { title: string; message: string; confirmLabel: string; tone?: 'danger' }): Promise<boolean> {
    if (this.busy() !== null || this.confirming) return false;
    this.confirming = true;
    try {
      return await this.dialog.confirm(options);
    } finally {
      this.confirming = false;
    }
  }

  /** Envía la respuesta y pone en la lista la invitación que devuelve el servidor (sin recargar a ciegas). */
  private respond(item: Invitation, request: Observable<Invitation>, success: string): void {
    if (this.busy() !== null) return;
    this.busy.set(item.groupId);
    this.actionStatus.set('');
    request.subscribe({
      next: updated => {
        this.invitations.update(list => list.map(entry => (entry.groupId === updated.groupId ? updated : entry)));
        this.busy.set(null);
        this.actionStatus.set(success);
        this.notify.success(success);
      },
      error: (err: unknown) => {
        this.busy.set(null);
        const text = apiErrorMessage(err, 'No pudimos registrar tu respuesta. Inténtalo de nuevo.');
        if (text) {
          this.actionStatus.set(text);
          this.notify.error(text);
        }
        // 409: la invitación ya se respondió o dejó de estar vigente (otra pestaña, el docente la canceló).
        if (err instanceof HttpErrorResponse && err.status === 409) this.load();
      },
    });
  }
}
