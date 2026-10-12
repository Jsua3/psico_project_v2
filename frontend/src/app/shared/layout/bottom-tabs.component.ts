import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { UiDialog, UiDialogFrame } from '../ui/dialog/ui-dialog';
import { UiGlassBar } from '../ui/glass-bar/ui-glass-bar';

/** Un destino de la barra inferior: ruta de la app (`route`) o ancla de la página (`href`). */
export interface BottomTab {
  id: string;
  label: string;
  icon: string;
  route?: string;
  href?: string;
}

/** Como mucho cinco pestañas (references/movil.md §3): con más destinos, la quinta es «Más». */
const MAX_TABS = 5;

/**
 * Hoja «Más» del móvil (plan visual F3-5): los destinos que no caben en la barra inferior, en una hoja que sube
 * (UiDialog.sheet: trampa de foco, Esc y retorno del foco a «Más»). Elegir un destino navega y cierra la hoja.
 */
@Component({
  selector: 'app-more-sheet',
  imports: [MatIconModule, RouterLink, UiDialogFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame title="Más destinos">
      <ul class="hoja-mas">
        @for (tab of tabs; track tab.id) {
          <li>
            @if (tab.route) {
              <a class="hoja-mas__enlace" [routerLink]="tab.route" (click)="ref.close()">
                <mat-icon aria-hidden="true">{{ tab.icon }}</mat-icon><span>{{ tab.label }}</span>
              </a>
            } @else {
              <a class="hoja-mas__enlace" [href]="tab.href" (click)="ref.close()">
                <mat-icon aria-hidden="true">{{ tab.icon }}</mat-icon><span>{{ tab.label }}</span>
              </a>
            }
          </li>
        }
      </ul>
    </ui-dialog-frame>
  `,
  styles: [`
    .hoja-mas { display: grid; gap: var(--ds-space-1); margin: 0; padding: 0; list-style: none; }
    .hoja-mas__enlace {
      display: flex;
      align-items: center;
      gap: var(--ds-space-3);
      min-block-size: var(--ds-target-min);
      padding-inline: var(--ds-space-3);
      border-radius: var(--ds-radius-md);
      color: var(--ds-text-1);
      font-size: var(--ds-type-body-size);
      text-decoration: none;
    }
    .hoja-mas__enlace:active { background-color: var(--ds-primary-subtle); }
  `],
})
export class MoreSheetComponent {
  protected readonly ref = inject(DialogRef);
  protected readonly tabs = inject<BottomTab[]>(DIALOG_DATA);
}

/**
 * Barra inferior de pestañas del móvil (plan visual F3-5, decisión D11; /barra-de-vidrio-modular, references/movil.md
 * §3.3). Es la NAVEGACIÓN PRINCIPAL por debajo de 64rem; en escritorio no se muestra. Se usa como hijo directo del
 * `<header ui-glass-bar>` (los `fixed` de la barra cuelgan del header, nunca de la píldora): el anfitrión ES el
 * `<nav>`. Estilos globales en src/styles/components/_glass-bar.scss.
 */
@Component({
  selector: 'nav[app-bottom-tabs]',
  imports: [MatIconModule, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // En escritorio no existe para nadie (hidden), no solo para la vista: así nunca hay dos «Navegación principal».
  host: { class: 'modulo-inferior ds-motion', '[attr.aria-label]': 'label()', '[attr.hidden]': "bar?.desktop() ? '' : null" },
  template: `
    <div class="pestanas ds-motion">
      @for (tab of visible(); track tab.id) {
        @if (tab.route) {
          <a class="pestana ds-motion" [routerLink]="tab.route" routerLinkActive="pestana--activa" ariaCurrentWhenActive="page">
            <span class="pestana__icono"><mat-icon aria-hidden="true">{{ tab.icon }}</mat-icon></span>
            <span class="pestana__rotulo ds-motion"><span>{{ tab.label }}</span></span>
          </a>
        } @else {
          <a class="pestana ds-motion" [href]="tab.href">
            <span class="pestana__icono"><mat-icon aria-hidden="true">{{ tab.icon }}</mat-icon></span>
            <span class="pestana__rotulo ds-motion"><span>{{ tab.label }}</span></span>
          </a>
        }
      }
      @if (overflow().length) {
        <button class="pestana ds-motion" type="button" aria-haspopup="dialog" (click)="openMore()">
          <span class="pestana__icono"><mat-icon aria-hidden="true">menu</mat-icon></span>
          <span class="pestana__rotulo ds-motion"><span>Más</span></span>
        </button>
      }
    </div>
  `,
})
export class BottomTabsComponent {
  readonly tabs = input<readonly BottomTab[]>([]);
  /** Destinos secundarios (los que se pliegan en escritorio): van a «Más». */
  readonly more = input<readonly BottomTab[]>([]);
  readonly label = input('Navegación principal');

  private readonly dialog = inject(UiDialog);
  protected readonly bar = inject(UiGlassBar, { optional: true });

  private readonly fits = computed(() => this.tabs().length + (this.more().length ? 1 : 0) <= MAX_TABS);
  protected readonly visible = computed(() => (this.fits() ? this.tabs() : this.tabs().slice(0, MAX_TABS - 1)));
  protected readonly overflow = computed(() => (this.fits() ? this.more() : [...this.tabs().slice(MAX_TABS - 1), ...this.more()]));

  protected openMore(): void {
    this.dialog.sheet(MoreSheetComponent, { side: 'bottom', data: [...this.overflow()] });
  }
}
