import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

import { UiCard } from '../../shared/ui/card/ui-card';

export interface QuickAction {
  label: string;
  route: string;
  icon: string;
  accent?: boolean;
}

/**
 * Accesos del panel de docencia y administración (plan visual F7-1): ÚNICO sitio donde el panel ofrece sus destinos
 * (antes salían tres veces: cabecera, tarjeta de estado y acciones rápidas). Presentacional: cada acceso es una
 * tarjeta enlazada (`a[ui-card]`) con el rótulo como nombre accesible.
 */
@Component({
  selector: 'app-quick-actions',
  imports: [RouterLink, MatIconModule, UiCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="qa-list">
      @for (action of actions(); track action.route) {
        <li>
          <a ui-card class="qa-card" [routerLink]="action.route">
            <mat-icon class="qa-card__icon" aria-hidden="true">{{ action.icon }}</mat-icon>
            <span class="qa-card__label">{{ action.label }}</span>
            <mat-icon class="qa-card__go" aria-hidden="true">arrow_forward</mat-icon>
          </a>
        </li>
      }
    </ul>
  `,
  styles: [`
    :host {
      display: block;
      min-width: 0;
    }

    .qa-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
      gap: var(--ds-space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .qa-card {
      display: flex;
      align-items: center;
      gap: var(--ds-space-3);
      min-height: var(--ds-target-min);
      height: 100%;
    }

    .qa-card__icon {
      flex: none;
      color: var(--ds-primary);
    }

    .qa-card__label {
      flex: 1 1 auto;
      min-width: 0;
      font-weight: var(--ds-type-h3-weight);
    }

    .qa-card__go {
      flex: none;
      color: var(--ds-text-2);
    }
  `],
})
export class QuickActionsComponent {
  readonly actions = input.required<QuickAction[]>();
}
