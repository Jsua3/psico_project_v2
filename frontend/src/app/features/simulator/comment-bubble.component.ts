/**
 * Burbuja de comentario (bloque B, 4.6): lo que dice un personaje al acercarse el estudiante, sobre su cabeza. No es
 * modal, no toma el foco ni consume teclas (Enter abre la conversación por el camino de siempre) y no detiene a
 * nadie. Se anuncia una vez por comentario por `LiveRegionAnnouncer`. Con movimiento reducido entra sin animación.
 */
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import type { Persona, WorldComment } from '../../core/models/simulation.model';
import type { PortraitState } from '../character/kit/kit-engine';
import type { CharacterVisual } from '../character/kit/character-visual.resolver';
import { KitFigureComponent } from '../character/kit/kit-figure.component';
import { caraDeReaccion } from './caso/reaccion';
import { DRAFT_COPY } from './draft-copy';

/** Si la pantalla no pasa el estado de la persona, la cara sale solo de la emoción escrita (o neutra). */
const PERSONA_NEUTRA: Pick<Persona, 'bond' | 'activation'> = { bond: 'GUARDED', activation: 'CALM' };

@Component({
  selector: 'app-comment-bubble',
  imports: [KitFigureComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (comment(); as c) {
      <div class="bubble-layer">
        <div class="bubble" role="group" [attr.data-comment]="c.id" [attr.aria-label]="label()"
          [class.bubble--enter]="!reduceMotion()" [class.bubble--floor]="!anchor()"
          [style.left.px]="anchor()?.x ?? null" [style.top.px]="anchor()?.y ?? null">
          @if (speaker()?.visual; as visual) {
            <app-kit-figure class="bubble-face" [visual]="visual" [portrait]="portrait()" [scale]="1" />
          }
          <p class="bubble-line">{{ c.line }}</p>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }
    .bubble-layer { position: absolute; inset: 0; z-index: 55; pointer-events: none; overflow: hidden; }
    .bubble {
      position: absolute; max-width: min(260px, 70%); display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; border-radius: 10px; border: 2px solid #3b4a5a;
      background: #0f1720; color: #f4f7fa; box-shadow: 0 4px 12px rgba(0, 0, 0, .45);
      /* La cola cuelga de la base y apunta a la cabeza: el ancla es la punta. */
      transform: translate(-50%, calc(-100% - 10px));
    }
    .bubble::after {
      content: ''; position: absolute; left: 50%; bottom: -8px; width: 12px; height: 12px;
      background: #0f1720; border-right: 2px solid #3b4a5a; border-bottom: 2px solid #3b4a5a;
      transform: translateX(-50%) rotate(45deg);
    }
    .bubble--floor { left: 50%; top: auto; bottom: 16px; transform: translateX(-50%); }
    .bubble--floor::after { display: none; }
    .bubble-face { flex: none; }
    .bubble-line { margin: 0; font-size: 0.95rem; line-height: 1.35; }
    @media (prefers-reduced-motion: no-preference) {
      .bubble--enter { animation: bubble-in 160ms ease-out both; }
    }
    @keyframes bubble-in { from { opacity: 0; } to { opacity: 1; } }
  `],
})
export class CommentBubbleComponent {
  private readonly announcer = inject(LiveRegionAnnouncer);

  readonly comment = input<WorldComment | null>(null);
  readonly speaker = input<{ nombre: string; visual: CharacterVisual | null } | null>(null);
  readonly anchor = input<{ x: number; y: number } | null>(null);
  readonly persona = input<Pick<Persona, 'bond' | 'activation'> | null>(null);
  readonly reduceMotion = input(false);

  protected readonly label = computed(() => DRAFT_COPY.commentBubbleLabel.text.replace('{nombre}', this.speaker()?.nombre ?? ''));
  /** La cara pedida si el personaje la tiene; si no, la neutra. */
  protected readonly portrait = computed<PortraitState>(() => {
    const c = this.comment();
    const cara = c ? caraDeReaccion(c.emotion, this.persona() ?? PERSONA_NEUTRA) : 'neutral';
    const visual = this.speaker()?.visual;
    return visual && !(cara in visual.portraits) ? 'neutral' : cara;
  });

  private anunciado: string | null = null;

  constructor() {
    // Una vez por comentario: mover la burbuja (el ancla cambia por cuadro) no vuelve a anunciar.
    effect(() => {
      const c = this.comment();
      if (!c) { this.anunciado = null; return; }
      if (c.id === this.anunciado) return;
      this.anunciado = c.id;
      const nombre = untracked(() => this.speaker()?.nombre);
      this.announcer.announce(nombre ? `${nombre}: ${c.line}` : c.line, 'polite');
    });
  }
}
