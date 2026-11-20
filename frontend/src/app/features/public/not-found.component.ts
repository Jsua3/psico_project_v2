import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { TemaService } from '../../core/tema/tema.service';
import { PublicBarComponent } from '../../shared/layout/public-bar.component';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';

/**
 * Página no encontrada (plan visual F3-6). Antes, cualquier dirección desconocida redirigía en silencio al panel.
 * Dentro del portal (`portal/**`) se pinta en el <main> del shell, bajo su barra, con el estado del portal y «Volver
 * al panel». Fuera (`**` de la raíz, `data: { fueraDelPortal: true }`) es una pantalla pública (rediseño Metafrónesis
 * 2026-11-20): la barra pública, el tema claro u oscuro en su contenedor (REGLA-010) y una tarjeta breve, sin culpa ni
 * humor (guía de psicología de interfaces §4), con salida a la portada y al acceso y un contacto real. No repite la
 * dirección pedida: un texto escrito en la URL no debe aparecer como contenido del sitio.
 */
@Component({
  selector: 'app-not-found',
  imports: [MatIconModule, RouterLink, PublicBarComponent, UiButton, UiErrorState, UiPageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (outsidePortal) {
      <div class="perdida publico" [attr.data-skin]="tema.piel()">
        <app-public-bar mode="acceso" />
        <main id="main-content" tabindex="-1" class="perdida__main">
          <section class="perdida__tarjeta pub-vidrio" aria-labelledby="perdida-titulo">
            <span class="pub-icono pub-icono--lg perdida__icono" aria-hidden="true"><mat-icon>search_off</mat-icon></span>
            <p class="pub-etiqueta perdida__etiqueta">Error 404</p>
            <h1 id="perdida-titulo" class="perdida__titulo">No encontramos esta página</h1>
            <p class="perdida__texto">
              Puede que la dirección haya cambiado o que la página ya no exista. Desde aquí puedes volver al inicio o entrar
              a tu cuenta.
            </p>
            <div class="perdida__acciones">
              <a ui-button variant="primary" size="lg" routerLink="/">Volver al inicio</a>
              <a ui-button variant="secondary" size="lg" routerLink="/login">Iniciar sesión</a>
            </div>
            <p class="perdida__ayuda">
              ¿Necesitas ayuda? Escribe a
              <a class="perdida__enlace" href="mailto:secretariapsicologia@cue.edu.co">secretariapsicologia&#64;cue.edu.co</a>
            </p>
          </section>
        </main>
      </div>
    } @else {
      <section class="no-encontrada">
        <ui-page-header title="Página no encontrada" />
        <ui-error-state kind="not-found" />
        <a ui-button routerLink="/portal/dashboard">Volver al panel</a>
      </section>
    }
  `,
  styles: [`
    :host { display: block; }

    /* Dentro del portal: el estado del lenguaje del portal. */
    .no-encontrada {
      display: grid;
      justify-items: start;
      gap: var(--ds-space-5);
      max-width: 40rem;
    }
    .no-encontrada ui-error-state { justify-self: stretch; }

    /* Fuera del portal: pantalla pública. El vidrio, la baldosa, la etiqueta, los botones en cápsula y el foco salen de
       styles/components/_publico.scss; aquí solo la composición. */
    .perdida { min-height: 100svh; }
    .perdida__main {
      display: grid;
      place-items: center;
      min-height: 100svh;
      padding: calc(5.5rem + env(safe-area-inset-top, 0px)) var(--ds-space-4) var(--ds-space-7);
    }
    .perdida__tarjeta {
      display: grid;
      justify-items: center;
      width: min(34rem, 100%);
      padding: clamp(var(--ds-space-6), 6vw, 3rem) clamp(var(--ds-space-5), 6vw, 3rem);
      text-align: center;
    }
    .perdida__icono { margin-bottom: var(--ds-space-5); }
    .perdida .perdida__etiqueta { margin-bottom: var(--ds-space-3); }
    .perdida__titulo {
      margin: 0;
      color: var(--ds-text-1);
      font-size: clamp(var(--ds-type-h2-size), 4vw, var(--ds-type-h1-size));
      font-weight: 700;
      line-height: 1.12;
      letter-spacing: -0.02em;
      word-spacing: 0.06em;
      text-wrap: balance;
    }
    .perdida__texto {
      max-width: 26rem;
      margin: var(--ds-space-3) 0 0;
      color: var(--ds-text-2);
      font-size: var(--ds-type-body-size);
      line-height: var(--ds-type-body-line);
      text-wrap: pretty;
    }
    .perdida__acciones {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--ds-space-3);
      margin-top: var(--ds-space-6);
    }
    .perdida__ayuda {
      justify-self: stretch;
      margin: var(--ds-space-6) 0 0;
      padding-top: var(--ds-space-5);
      box-shadow: inset 0 1px 0 var(--l-filo);
      color: var(--ds-text-2);
      font-size: var(--ds-type-body-s-size);
      line-height: var(--ds-type-body-s-line);
      overflow-wrap: anywhere;
    }
    /* Enlace dentro de una frase: subrayado (no solo color, WCAG 1.4.1) y ≥ 24 px de alto (2.5.8). */
    .perdida__enlace {
      display: inline-block;
      min-height: 1.5rem;
      color: var(--l-acento-tinta);
      font-weight: 600;
      text-decoration: underline;
      text-decoration-color: color-mix(in oklab, currentColor 45%, transparent);
      text-decoration-thickness: 1px;
      text-underline-offset: 0.22em;
    }
    .perdida__enlace:active { opacity: 0.7; }
    @media (hover: hover) and (pointer: fine) {
      .perdida__enlace:hover { text-decoration-color: currentColor; }
    }
    @supports (corner-shape: squircle) {
      .perdida__tarjeta { border-radius: 2.75rem; }
    }
    @media (forced-colors: active) {
      .perdida__tarjeta { border: 1px solid CanvasText; }
    }
    /* Teléfono: la barra es una banda de 3,5rem y los botones van a lo ancho, uno sobre otro. */
    @media (max-width: 63.999rem) {
      .perdida__main {
        padding-top: calc(var(--asb-alto-modulo-superior) + env(safe-area-inset-top, 0px) + var(--ds-space-4));
      }
    }
    @media (max-width: 30rem) {
      .perdida__acciones { flex-direction: column; justify-self: stretch; }
    }
  `],
})
export class NotFoundComponent {
  protected readonly outsidePortal = inject(ActivatedRoute).snapshot.data['fueraDelPortal'] === true;
  protected readonly tema = inject(TemaService);
}
