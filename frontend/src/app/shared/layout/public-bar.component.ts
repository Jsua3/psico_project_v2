import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TemaService } from '../../core/tema/tema.service';
import { UiButton } from '../ui/button/ui-button';
import { UiIconButton } from '../ui/button/ui-icon-button';
import { UiGlassBar } from '../ui/glass-bar/ui-glass-bar';
import { MarcaComponent } from '../ui/marca/marca.component';
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
  imports: [RouterLink, BottomTabsComponent, MarcaComponent, UiButton, UiGlassBar, UiIconButton],
  styles: `
    .barra-marca { --marca-alto: 1.875rem; }
    @media (max-width: 30rem) { .barra-marca { --marca-alto: 1.625rem; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header ui-glass-bar label="Navegación pública" forma="unida" [navSkip]="anchors().length > 0">
      <a class="modulo modulo-logo pulsable ds-motion" routerLink="/" aria-label="Metafrónesis: ir al inicio">
        <app-marca class="barra-marca" />
      </a>
      <div class="modulo modulo-principal ds-motion">
        @for (anchor of anchors(); track anchor.id) {
          <a class="nav-enlace ds-motion" [href]="'#' + anchor.id">{{ anchor.label }}</a>
        }
      </div>
      <div class="modulo modulo-cuenta ds-motion">
        <button ui-icon-button class="tema" [icon]="iconoTema()" [label]="nombreTema()" (click)="tema.siguiente()"></button>
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

  protected readonly tema = inject(TemaService);
  // Nombres sueltos con «icon» para que scripts/ui/icon-names.mjs los meta en el subconjunto de la fuente de iconos.
  private readonly iconSistema = 'brightness_auto';
  private readonly iconClaro = 'light_mode';
  private readonly iconOscuro = 'dark_mode';
  protected readonly iconoTema = computed(() =>
    ({ sistema: this.iconSistema, claro: this.iconClaro, oscuro: this.iconOscuro })[this.tema.preferencia()]);
  /** El nombre dice el estado actual y qué hace el clic (el botón cicla: sistema → claro → oscuro). */
  protected readonly nombreTema = computed(() => ({
    sistema: 'Tema: según el sistema. Cambiar a claro',
    claro: 'Tema: claro. Cambiar a oscuro',
    oscuro: 'Tema: oscuro. Volver a seguir el sistema',
  })[this.tema.preferencia()]);
}
