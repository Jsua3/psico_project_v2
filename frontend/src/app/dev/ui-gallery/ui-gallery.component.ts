import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Galería de la biblioteca `shared/ui` (plan visual F0-4 y F2-9; VD-11): cada componente en todos sus
 * estados y en las dos pieles. Solo existe en desarrollo: la ruta va tras `ngDevMode` (ver `app.routes.ts`)
 * y `scripts/ui/check-dist-dev-only.mjs` comprueba que no llegue al build de producción.
 */
@Component({
  selector: 'app-ui-gallery',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main-content" class="ui-gallery" tabindex="-1">
      <h1>Galería de componentes</h1>
      <p>Solo en desarrollo. Aquí se ve cada componente de <code>shared/ui</code> en todos sus estados y en las dos pieles.</p>
      <p class="ui-gallery__empty">Aún no hay componentes: llegan con la fase F2.</p>
    </main>
  `,
  styles: [`
    .ui-gallery { max-width: 72rem; margin: 0 auto; padding: 2rem 1rem; }
    .ui-gallery:focus { outline: none; }
  `],
})
export class UiGalleryComponent {}
