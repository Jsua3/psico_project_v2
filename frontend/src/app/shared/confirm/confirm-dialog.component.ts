import { A11yModule } from '@angular/cdk/a11y';
import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

let nextConfirmDialogId = 0;

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatIconModule, A11yModule],
  template: `
    @if (open()) {
      <div class="confirm-backdrop" (click)="onBackdropClick($event)" (keydown.escape)="onEscape()">
        <div
          class="confirm-panel"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-labelledby]="dialogTitleId"
          [attr.aria-describedby]="dialogMessageId"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
        >
          <h3 [id]="dialogTitleId">{{ title() }}</h3>
          <p [id]="dialogMessageId">{{ message() }}</p>
          <div class="confirm-actions">
            <button
              type="button"
              class="psy-button psy-button--ghost"
              cdkFocusInitial
              (click)="cancel.emit()"
              [disabled]="loading()"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="psy-button psy-button--primary"
              (click)="confirm.emit()"
              [disabled]="loading()"
            >
              @if (loading()) {
                Procesando…
              } @else {
                {{ confirmLabel() }}
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .confirm-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1200;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(15, 23, 42, 0.45);
    }
    .confirm-panel {
      width: min(100%, 420px);
      padding: 22px;
      border-radius: 18px;
      background: var(--siep-surface, #fff);
      border: 1px solid var(--psy-border, #d8e2f0);
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18);
    }
    .confirm-panel h3 {
      margin: 0 0 10px;
      font-size: 1.15rem;
      color: var(--siep-blue, #1a3a6b);
    }
    .confirm-panel p {
      margin: 0 0 18px;
      color: var(--psy-muted, #5a6b82);
      line-height: 1.5;
    }
    .confirm-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
  `]
})
export class ConfirmDialogComponent {
  private readonly instanceId = ++nextConfirmDialogId;
  readonly dialogTitleId = `app-confirm-dialog-title-${this.instanceId}`;
  readonly dialogMessageId = `app-confirm-dialog-message-${this.instanceId}`;
  readonly open = input(false);
  readonly title = input('Confirmar acción');
  readonly message = input('');
  readonly confirmLabel = input('Confirmar');
  readonly loading = input(false);
  readonly cancel = output<void>();
  readonly confirm = output<void>();

  onEscape(): void {
    if (!this.loading()) this.cancel.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.loading()) this.cancel.emit();
  }
}
