import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { PublicBarComponent } from '../../shared/layout/public-bar.component';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';

/**
 * Página no encontrada (plan visual F3-6). Antes, cualquier dirección desconocida redirigía en silencio al panel.
 * Dentro del portal (`portal/**`) se pinta en el <main> del shell, bajo su barra; fuera (`**` de la raíz, con
 * `data: { fueraDelPortal: true }`) trae la barra pública y su propio <main>.
 */
@Component({
  selector: 'app-not-found',
  imports: [NgTemplateOutlet, RouterLink, PublicBarComponent, UiButton, UiErrorState, UiPageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #contenido>
      <ui-page-header title="Página no encontrada" />
      <ui-error-state kind="not-found" />
      <a ui-button routerLink="/portal/dashboard">Volver al panel</a>
    </ng-template>

    @if (outsidePortal) {
      <app-public-bar mode="acceso" />
      <main id="main-content" tabindex="-1" class="no-encontrada no-encontrada--fuera">
        <ng-container [ngTemplateOutlet]="contenido" />
      </main>
    } @else {
      <section class="no-encontrada">
        <ng-container [ngTemplateOutlet]="contenido" />
      </section>
    }
  `,
  styles: [`
    :host { display: block; }
    .no-encontrada {
      display: grid;
      justify-items: start;
      gap: var(--ds-space-5);
      max-width: 40rem;
    }
    .no-encontrada ui-error-state { justify-self: stretch; }
    /* Fuera del portal no hay shell: el relleno deja sitio a la barra fija, como el <main> del portal. */
    .no-encontrada--fuera {
      margin-inline: auto;
      padding: calc(5.5rem + env(safe-area-inset-top, 0px)) var(--ds-space-4) var(--ds-space-7);
    }
    @media (max-width: 63.999rem) {
      .no-encontrada--fuera {
        padding-top: calc(var(--asb-alto-modulo-superior) + env(safe-area-inset-top, 0px) + var(--ds-space-4));
      }
    }
  `],
})
export class NotFoundComponent {
  protected readonly outsidePortal = inject(ActivatedRoute).snapshot.data['fueraDelPortal'] === true;
}
