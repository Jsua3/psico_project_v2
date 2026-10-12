import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';

import { AuthService } from '../../core/auth/auth.service';
import { UiGlassBar } from '../ui/glass-bar/ui-glass-bar';
import { roleLabel } from '../ui/labels';
import { UiMenu, UiMenuItem } from '../ui/menu/ui-menu';
import { UiRouteProgress } from '../ui/route-progress/ui-route-progress';
import { BottomTab, BottomTabsComponent } from './bottom-tabs.component';
import { NavItem, navItemsFor } from './nav-items';

const ACCOUNT_MENU: UiMenuItem[] = [{ value: 'salir', label: 'Cerrar sesión', icon: 'logout', tone: 'danger' }];

const toTab = ({ id, label, icon, route }: NavItem): BottomTab => ({ id, label, icon, route });

/**
 * Shell del portal (plan visual F3-3): la barra de vidrio modular arriba (sin barra lateral, VD-1) y la página
 * desplazándose en `window`. Los destinos salen de NAV_ITEMS (la misma fuente que los guards) y se pliegan según el
 * rol (D3). Por debajo de 64rem la navegación principal baja a pestañas fijas (D11, F3-5): arriba quedan marca y
 * cuenta, y los destinos plegables van a la hoja «Más». En el juego —rutas con `data: { chrome: 'hidden' }`— no hay barra y el contenido ocupa la ventana.
 *
 * La clase `game-mode` del `<body>` se conserva para el CSS heredado del juego hasta F6-1 (REGLA-010); ninguna regla
 * nueva la usa.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, BottomTabsComponent, UiGlassBar, UiMenu, UiRouteProgress],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!inGame()) {
      <header ui-glass-bar label="Navegación principal">
        <a class="modulo modulo-logo pulsable ds-motion" routerLink="/portal/dashboard" aria-label="SIEP: ir al panel">
          <span class="logo-doble ds-motion">
            <span class="logo-doble__completo ds-motion"><span class="logo-doble__marca" aria-hidden="true"></span><span class="logo-doble__nombre">SIEP</span></span>
            <span class="logo-doble__isotipo ds-motion" aria-hidden="true"><span class="logo-doble__marca" aria-hidden="true"></span></span>
          </span>
        </a>
        <div class="modulo modulo-principal ds-motion">
          @for (item of navItems(); track item.id) {
            <a class="nav-enlace ds-motion" [class.control-plegable]="folds(item)" [routerLink]="item.route"
              routerLinkActive="nav-enlace--activo" ariaCurrentWhenActive="page">{{ item.label }}</a>
          }
          <span class="indicador-mas ds-motion" aria-hidden="true">···</span>
        </div>
        <div class="modulo modulo-cuenta ds-motion">
          <span class="cuenta-chip">
            <span class="cuenta-chip__nombre">{{ userName() }}</span>
            <span class="cuenta-chip__rol">{{ userRole() }}</span>
          </span>
          <ui-menu label="Cuenta" icon="account_circle" iconOnly [items]="accountMenu" (itemSelected)="onAccount($event)" />
        </div>
        <nav app-bottom-tabs [tabs]="tabs()" [more]="moreTabs()"></nav>
        <ui-route-progress />
      </header>
    }

    <main class="portal-main" [class.portal-main--juego]="inGame()">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: block; }
    /* La barra es fija: el contenido arranca bajo ella (alto de la barra más su caída de 6 px). */
    .portal-main {
      display: block;
      padding: calc(5.5rem + env(safe-area-inset-top, 0px)) clamp(16px, 3vw, 36px) 44px;
    }
    .portal-main--juego {
      height: 100vh;
      padding: 0;
      overflow: hidden;
    }
    @media (max-width: 920px) {
      .portal-main:not(.portal-main--juego) { padding-inline: 16px; }
    }
    /* Móvil (F3-5): la barra de arriba es una banda de 3,5rem y abajo están las pestañas fijas; el contenido reserva
       los dos altos y la zona segura. */
    @media (max-width: 63.999rem) {
      .portal-main:not(.portal-main--juego) {
        padding-top: calc(var(--asb-alto-modulo-superior) + env(safe-area-inset-top, 0px) + 1rem);
        padding-bottom: calc(var(--asb-alto-modulo-inferior) + env(safe-area-inset-bottom, 0px) + 1.5rem);
      }
    }
  `],
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly chrome = toSignal(
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), map(() => this.readChrome())),
    { initialValue: this.readChrome() },
  );

  readonly inGame = computed(() => this.chrome() === 'hidden');
  readonly navItems = computed(() => navItemsFor(this.auth.currentUser()?.role));
  /** Móvil (D11): lo que no se pliega en escritorio es pestaña; lo que se pliega va a «Más». */
  protected readonly tabs = computed(() => this.navItems().filter(item => !this.folds(item)).map(toTab));
  protected readonly moreTabs = computed(() => this.navItems().filter(item => this.folds(item)).map(toTab));
  readonly userName = computed(() => {
    const user = this.auth.currentUser();
    const name = `${user?.nombre ?? ''} ${user?.apellido ?? ''}`.trim();
    return name || 'Cuenta institucional';
  });
  readonly userRole = computed(() => roleLabel(this.auth.currentUser()?.role));
  protected readonly accountMenu = ACCOUNT_MENU;

  constructor() {
    effect(() => document.body.classList.toggle('game-mode', this.inGame()));
    inject(DestroyRef).onDestroy(() => document.body.classList.remove('game-mode'));
  }

  /** El destino es secundario para el rol actual: se pliega al desplazarse (D3). */
  folds(item: NavItem): boolean {
    const role = this.auth.currentUser()?.role;
    return !!role && item.fold.includes(role);
  }

  onAccount(value: string | undefined): void {
    if (value === 'salir') this.auth.logout();
  }

  /** `chrome` del árbol de rutas activo: la ruta más profunda que diga `hidden` oculta la barra. */
  private readChrome(): 'full' | 'hidden' {
    let route = this.router.routerState.snapshot.root;
    let chrome: 'full' | 'hidden' = 'full';
    for (;;) {
      if (route.data?.['chrome'] === 'hidden') chrome = 'hidden';
      if (!route.firstChild) return chrome;
      route = route.firstChild;
    }
  }
}
