import { ChangeDetectionStrategy, Component, effect, input, signal, untracked } from '@angular/core';

import { DRAFT_COPY } from './draft-copy';

/** Cuánto se ve la franja completa al entrar a una escena con aviso, antes de plegarse a su chip. */
export const SENSITIVE_UNFOLDED_MS = 8000;

let nextNoticeId = 0;

/**
 * Aviso ético de la escena sensible (ETH-01), bajo la cabecera del juego. Al entrar a una escena con aviso se ve completo
 * `SENSITIVE_UNFOLDED_MS` y luego se pliega a un chip «Contenido sensible» que sigue siempre a la vista y lo despliega de nuevo.
 * Plegar no oculta el aviso a nadie: el texto completo queda en el DOM (solo para lectores de pantalla) y el chip es un
 * botón con `aria-expanded`. Ocupa su propio sitio en la cabecera (no flota), así que no tapa al personaje ni los controles.
 * Con movimiento reducido el pliegue ocurre sin animación.
 */
@Component({
  selector: 'app-sensitive-notice',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (text(); as notice) {
      <div class="sensitive-strip" [class.sensitive-strip--folded]="!unfolded()" [class.sensitive-strip--still]="reduceMotion()">
        <p class="sensitive-strip__text" [id]="textId" [class.sr-only]="!unfolded()">{{ notice }}</p>
        <button type="button" class="sensitive-strip__chip" [attr.aria-expanded]="unfolded()" [attr.aria-controls]="textId" (click)="toggle()">
          {{ copy.sensitiveChip.text }}
        </button>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    /* Legible (>= 12 px, también en compacto), contraste alto y sin desenfoque; ocupa su propio sitio en la cabecera. */
    .sensitive-strip {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 5px 14px;
      background: rgba(8,12,18,.94);
      border-bottom: 1px solid rgba(245,184,75,.28);
      color: #f3dfb5;
      font-size: .78rem;
      line-height: 1.35;
      text-align: center;
      animation: sensitive-strip-in .2s ease-out;
    }
    .sensitive-strip--folded { justify-content: flex-end; padding-top: 2px; padding-bottom: 2px; }
    .sensitive-strip__text { margin: 0; }
    .sensitive-strip__chip {
      flex: none;
      min-height: 24px;
      padding: 2px 10px;
      border: 1px solid rgba(245,184,75,.55);
      border-radius: 999px;
      background: transparent;
      color: #f3dfb5;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    @media (hover: hover) and (pointer: fine) {
      .sensitive-strip__chip:hover { background: rgba(245,184,75,.14); }
    }
    .sensitive-strip--still { animation: none; }
    @keyframes sensitive-strip-in { from { opacity: .4; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .sensitive-strip { animation: none; } }
    /* Compacto (apaisado táctil o poca altura): el mundo pierde lo mínimo, sin bajar de 12 px. */
    @media (max-height: 520px), (pointer: coarse) and (orientation: landscape) {
      .sensitive-strip { padding: 3px 12px; font-size: .75rem; line-height: 1.3; }
    }
  `],
})
export class SensitiveNoticeComponent {
  /** El aviso de la escena (`null` si no hay: no se pinta nada). */
  readonly text = input<string | null>(null);
  /** Identifica la escena: al cambiar, el aviso vuelve a verse completo. */
  readonly sceneKey = input<string | null>(null);
  /** Con el ajuste «Reducir movimiento» el pliegue no se anima. */
  readonly reduceMotion = input(false);

  protected readonly copy = DRAFT_COPY;
  protected readonly textId = `sensitive-notice-${nextNoticeId++}`;
  protected readonly unfolded = signal(true);

  constructor() {
    effect(onCleanup => {
      this.sceneKey();
      if (!this.text()) return;
      untracked(() => this.unfolded.set(true));
      const timer = setTimeout(() => this.unfolded.set(false), SENSITIVE_UNFOLDED_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected toggle(): void {
    this.unfolded.update(open => !open);
  }
}
