import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { UiButton } from '../ui/button/ui-button';
import { UiGlassBar } from '../ui/glass-bar/ui-glass-bar';

export interface PublicAnchor { id: string; label: string; }

/** Secciones de la portada a las que lleva la barra pública (mismos ids que landing.component.html). */
export const PUBLIC_ANCHORS: readonly PublicAnchor[] = [
  { id: 'simulador', label: 'Simulador' },
  { id: 'casos', label: 'Casos' },
  { id: 'como-funciona', label: 'Cómo funciona' },
  { id: 'roles', label: 'Roles' },
  { id: 'etica', label: 'Ética' },
];

/**
 * Cabecera pública (plan visual F3-4): la misma barra de vidrio del portal en la portada y en el acceso (antes, una
 * cabecera oscura propia con su menú móvil). En la portada lleva anclas a sus secciones y «Ingresar»; en el
 * acceso, el regreso a la portada.
 */
@Component({
  selector: 'app-public-bar',
  imports: [RouterLink, UiButton, UiGlassBar],
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
    </header>
  `,
})
export class PublicBarComponent {
  readonly anchors = input<readonly PublicAnchor[]>([]);
  readonly mode = input<'portada' | 'acceso'>('portada');
}
