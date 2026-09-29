import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { NotificationHostComponent } from './shared/notifications/notification-host.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NotificationHostComponent],
  template: `
    <a class="psy-skip-link" href="#main-content" (click)="skipTo($event, 'main-content')">Saltar al contenido principal</a>
    @if (isGameRoute()) {
      <a class="psy-skip-link" href="#game-area" (click)="skipTo($event, 'game-area')">Saltar al juego</a>
    }
    <app-notification-host />
    <router-outlet />
  `
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Solo dentro de un caso existe #game-area. */
  readonly isGameRoute = computed(() => /\/portal\/simulador\/\d+/.test(this.url()));

  /**
   * Con <base href="/">, un href="#x" navega a "/#x" (la portada). Se
   * intercepta el clic y se mueve el foco al destino o, si no existe, al
   * primer <main> de la página.
   */
  skipTo(event: Event, targetId: string): void {
    event.preventDefault();
    const target = document.getElementById(targetId) ?? document.querySelector<HTMLElement>('main');
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
  }
}
