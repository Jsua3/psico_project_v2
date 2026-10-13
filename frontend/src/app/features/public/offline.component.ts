import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, InjectionToken, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { safeReturnUrl } from '../../core/auth/return-url';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';

/**
 * Carga completa de una ruta. «Reintentar» sin conexión NO puede navegar con el Router: el navegador guarda en su
 * mapa de módulos la descarga fallida y otro import() de la misma URL fallaría aunque ya haya red.
 */
export const FULL_NAVIGATION = new InjectionToken<(url: string) => void>('FULL_NAVIGATION', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return (url: string) => document.location.assign(url);
  },
});

/**
 * «Sin conexión» (plan visual F4-3; `sin-conexion?desde=`): adonde lleva una navegación que no pudo descargar su
 * código (offline-navigation.ts). app.routes la importa DIRECTA (sin red, un loadComponent no llegaría), así que va
 * en el bundle inicial: por eso es mínima (sin barra ni enlaces del Router: con la barra pública, el bundle inicial
 * crecía ~120 kB). «Reintentar» carga de nuevo la ruta pedida si es interna; sin red, lo dice y no recarga.
 */
@Component({
  selector: 'app-offline',
  imports: [UiErrorState, UiPageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main-content" tabindex="-1" class="sin-red">
      <ui-page-header title="Sin conexión" />
      <ui-error-state kind="network" blocking (retry)="retry()" />
      @if (stillOffline()) {
        <p class="sin-red__aviso" role="status">Todavía no hay conexión. Vuelve a intentarlo en un momento.</p>
      }
    </main>
  `,
  styles: [`
    :host { display: block; }
    .sin-red {
      display: grid;
      justify-items: start;
      gap: var(--ds-space-5);
      max-width: 40rem;
      margin-inline: auto;
      padding: var(--ds-space-8) var(--ds-space-4);
    }
    .sin-red ui-error-state { justify-self: stretch; }
    .sin-red__aviso {
      margin: 0;
      color: var(--ds-text-2);
      font-size: var(--ds-type-body-s-size);
    }
  `],
})
export class OfflineComponent {
  private readonly from = inject(ActivatedRoute).snapshot.queryParamMap.get('desde');
  private readonly fullNavigation = inject(FULL_NAVIGATION);
  /** Se pulsó «Reintentar» sin red: se dice, en vez de recargar hacia la página de error del navegador. */
  protected readonly stillOffline = signal(false);

  /** «Reintentar»: carga completa de la ruta pedida si es interna (return-url.ts); si no, el inicio. */
  protected retry(): void {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.stillOffline.set(true);
      return;
    }
    this.fullNavigation(safeReturnUrl(this.from) ?? '/');
  }
}
