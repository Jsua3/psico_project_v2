import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { UiButton } from '../ui/button/ui-button';
import { UiGlassBar } from '../ui/glass-bar/ui-glass-bar';
import { BottomTab, BottomTabsComponent } from './bottom-tabs.component';

export interface PublicAnchor { id: string; label: string; icon: string; }

/** Secciones de la portada a las que lleva la barra pública (mismos ids que landing.component.html). */
export const PUBLIC_ANCHORS: readonly PublicAnchor[] = [
  { id: 'simulador', label: 'Simulador', icon: 'play_circle' },
  { id: 'casos', label: 'Casos', icon: 'folder_open' },
  { id: 'como-funciona', label: 'Cómo funciona', icon: 'help_outline' },
  { id: 'roles', label: 'Roles', icon: 'groups' },
  { id: 'etica', label: 'Ética', icon: 'verified_user' },
];

/**
 * Cabecera pública (plan visual F3-4): la misma barra de vidrio del portal en la portada y en el acceso (antes, una
 * cabecera oscura propia con su menú móvil). En la portada lleva anclas a sus secciones y «Ingresar»; en el
 * acceso, el regreso a la portada. Por debajo de 64rem las anclas bajan a las pestañas inferiores (F3-5).
 */
@Component({
  selector: 'app-public-bar',
  imports: [RouterLink, BottomTabsComponent, UiButton, UiGlassBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header ui-glass-bar label="Navegación pública">
      <a class="modulo modulo-logo pulsable ds-motion" routerLink="/" aria-label="SIEP: ir al inicio">
        <span class="logo-doble ds-motion">
          <span class="logo-doble__completo ds-motion"><span class="logo-doble__marca" aria-hidden="true"></span><span class="logo-doble__nombre">SIEP</span></span>
          <span class="logo-doble__isotipo ds-motion" aria-hidden="true"><span class="logo-doble__marca" aria-hidden="true"></span></span>
        </span>
      </a>
      <div class="modulo modulo-principal ds-motion">
        @for (anchor of anchors(); track anchor.id) {
          <a class="nav-enlace ds-motion" [href]="'#' + anchor.id">{{ anchor.label }}</a>
        }
      </div>
      <div class="modulo modulo-cuenta ds-motion">
        @if (mode() === 'portada') {
          <a ui-button size="md" routerLink="/login">Ingresar</a>
        } @else {
          <a class="nav-enlace ds-motion" routerLink="/">Volver al inicio</a>
        }
      </div>
      @if (tabs().length) {
        <nav app-bottom-tabs label="Navegación pública" [tabs]="tabs()"></nav>
      }
    </header>
  `,
})
export class PublicBarComponent {
  readonly anchors = input<readonly PublicAnchor[]>([]);
  readonly mode = input<'portada' | 'acceso'>('portada');

  protected readonly tabs = computed<BottomTab[]>(() =>
    this.anchors().map(({ id, label, icon }) => ({ id, label, icon, href: `#${id}` })));
}
