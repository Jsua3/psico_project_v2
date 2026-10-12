import { Menu, MenuContent, MenuItem, MenuTrigger } from '@angular/aria/menu';
import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { UiButton, UiButtonVariant } from '../button/ui-button';
import { uniqueUiId } from '../button/click-guard';
import { UiIconButton } from '../button/ui-icon-button';

export interface UiMenuItem {
  value: string;
  label: string;
  icon?: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

/**
 * Menú de acciones (plan visual F2-6) sobre `@angular/aria/menu`: el botón anuncia `aria-haspopup`/`aria-expanded`
 * y abre una lista `role="menu"` nombrada por él; flechas, Inicio, Fin y búsqueda por letra (sobre el texto, no la
 * ligadura del icono) recorren los ítems; Esc cierra y devuelve el foco al botón; elegir un ítem emite
 * `itemSelected`, cierra y devuelve el foco. El panel es HIJO del componente y se posiciona con CSS junto al botón (D9 de la barra de vidrio: el menú de cuenta vive en
 * su módulo, sin capa aparte). Los ítems se pintan al abrir (`ngMenuContent`).
 */
@Component({
  selector: 'ui-menu',
  imports: [MatIconModule, Menu, MenuContent, MenuItem, MenuTrigger, UiButton, UiIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-menu',
    '[class.ui-menu--start]': "align() === 'start'",
  },
  template: `
    @if (iconOnly()) {
      <button ui-icon-button class="ui-menu__trigger" ngMenuTrigger [menu]="menu" [id]="triggerId"
        [icon]="icon() ?? 'more_vert'" [label]="label()" [variant]="variant()"></button>
    } @else {
      <button ui-button type="button" class="ui-menu__trigger" ngMenuTrigger [menu]="menu" [id]="triggerId"
        [variant]="variant()" [icon]="icon()" iconEnd="expand_more">{{ label() }}</button>
    }
    <div ngMenu #menu="ngMenu" class="ui-menu__panel ds-motion" [attr.aria-labelledby]="triggerId"
      (itemSelected)="itemSelected.emit($event)">
      <ng-template ngMenuContent>
        @for (item of items(); track item.value) {
          <div ngMenuItem class="ui-menu__item" [class.ui-menu__item--danger]="item.tone === 'danger'"
            [value]="item.value" [disabled]="!!item.disabled" [searchTerm]="item.label">
            @if (item.icon) {
              <mat-icon class="ui-menu__icon" aria-hidden="true">{{ item.icon }}</mat-icon>
            }
            <span class="ui-menu__label">{{ item.label }}</span>
          </div>
        }
      </ng-template>
    </div>
  `,
  styleUrl: './ui-menu.scss',
})
export class UiMenu {
  /** Texto del botón; con `iconOnly`, su nombre accesible y su globo. */
  readonly label = input.required<string>();
  readonly items = input.required<readonly UiMenuItem[]>();
  readonly icon = input<string | undefined>(undefined);
  readonly iconOnly = input(false, { transform: booleanAttribute });
  readonly variant = input<UiButtonVariant>('ghost');
  /** Borde del botón con el que se alinea el panel. */
  readonly align = input<'start' | 'end'>('end');
  readonly itemSelected = output<string | undefined>();

  protected readonly triggerId = uniqueUiId('ui-menu-trigger');
}
