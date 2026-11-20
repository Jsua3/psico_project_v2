import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TemaService } from '../../core/tema/tema.service';
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
  imports: [RouterLink, BottomTabsComponent, MarcaComponent, UiGlassBar, UiIconButton],
  // DESVÍO de la receta pedido por el usuario (2026-11-20): el logo NO cede al isotipo al hacer scroll; la marca completa
  // se queda siempre (más visible como botón de regreso al inicio).
  styles: `
    .barra-marca { --marca-alto: 1.75rem; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Receta de /barra-de-vidrio-modular: arriba una píldora (inicial); al bajar se quiebra en tres cápsulas (scroll); con
  // el cursor en la franja vuelve lo plegado (atención). El logo se queda completo en todos los estados. Roles y Ética son los
  // secundarios que se pliegan; «Ingresar» es la ficha compacta de la cuenta (.cta-vivo), no un botón-cápsula.
  template: `
    <header ui-glass-bar label="Navegación pública" [navSkip]="anchors().length > 0">
      <a class="modulo modulo-logo pulsable ds-motion" routerLink="/" aria-label="Metafrónesis: ir al inicio">
        <app-marca class="barra-marca" />
      </a>
      <div class="modulo modulo-principal ds-motion">
        @for (anchor of anchors(); track anchor.id) {
          <a class="nav-enlace ds-motion" [class.control-plegable]="secundario(anchor)" [href]="'#' + anchor.id">{{ anchor.label }}</a>
        }
        @if (anchors().length) {
          <span class="indicador-mas ds-motion" aria-hidden="true">···</span>
        }
      </div>
      <div class="modulo modulo-cuenta ds-motion">
        <button ui-icon-button class="tema" [icon]="iconoTema()" [label]="nombreTema()" (click)="tema.siguiente()"></button>
        @if (mode() === 'portada') {
          <a class="pulsable cta-vivo" routerLink="/login">Ingresar</a>
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

  /** Secundarios que se pliegan en «scroll» (D3 de la receta): los dos últimos destinos de la portada. */
  protected secundario(anchor: PublicAnchor): boolean {
    return anchor.id === 'roles' || anchor.id === 'etica';
  }

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
