import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { NAV_ITEMS } from '../../shared/layout/nav-items';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';

/**
 * Nombre de la sección pedida, desde NAV_ITEMS (la única fuente de destinos); null si no es EXACTAMENTE un destino.
 * Una subruta no se nombra como su sección: `simulador/<id>` lo guarda otro rol que `simulador`, y decir «no puedes
 * ver Simulador» contradiría el menú del docente (revisión de F4, M-1).
 */
function sectionName(path: string | null): string | null {
  if (!path) return null;
  const clean = path.split(/[?#;]/, 1)[0];
  return NAV_ITEMS.find(item => clean === item.route)?.label ?? null;
}

/**
 * «Sin permiso» (plan visual F4-3; `portal/sin-permiso?desde=`): adonde manda roleGuard al negar una sección, en vez
 * de una redirección muda al panel (gancho de RF-02/RNF-002 de F3). Nombra la sección (NAV_ITEMS) y ofrece volver al
 * panel. Dentro del portal: el <main> lo pone el shell. `desde` solo se usa para nombrar, nunca para navegar.
 */
@Component({
  selector: 'app-forbidden',
  imports: [RouterLink, UiButton, UiErrorState, UiPageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sin-permiso">
      <ui-page-header title="Sin permiso" />
      <ui-error-state kind="forbidden" [message]="message" />
      <a ui-button routerLink="/portal/dashboard">Volver al panel</a>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .sin-permiso {
      display: grid;
      justify-items: start;
      gap: var(--ds-space-5);
      max-width: 40rem;
    }
    .sin-permiso ui-error-state { justify-self: stretch; }
  `],
})
export class ForbiddenComponent {
  /** Nombra la sección si es un destino conocido; si no, el mensaje general del lenguaje (null). */
  protected readonly message = (() => {
    const name = sectionName(inject(ActivatedRoute).snapshot.queryParamMap.get('desde'));
    return name ? `Tu cuenta no tiene permiso para ver «${name}». Si crees que es un error, escribe a la administración.` : null;
  })();
}
