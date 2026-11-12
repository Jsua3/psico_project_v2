import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import type { ElementoSala, GuiaEscena } from './caso/guia';
import { DRAFT_COPY } from './draft-copy';
import { type HintAttemptRef, SceneHintComponent } from './scene-hint.component';

/**
 * La ficha del objetivo de la escena (4.2): reemplaza la lista «Qué hacer». Plegada es un solo botón con el objetivo que
 * escribió la docente (o un texto de respaldo si la escena no trae); abierta suma «En esta sala» —quién está y qué ya
 * se revisó, con la marca en texto, nunca solo color— y el botón «Pedir una pista».
 *
 * Presentacional: pinta una `GuiaEscena` ya armada y no calcula nada del mundo. Va DENTRO del envoltorio
 * `.objective-card` de la pantalla de juego (que aporta posición, borde y fondo casi opaco). No tiene región viva propia
 * (los anuncios salen por `LiveRegionAnnouncer`) y Esc no la cierra: la cadena de Esc del juego no cambia. Arranca
 * plegada también en compacto: la sala ocupa la pantalla y quien quiere ver la lista la abre.
 */
@Component({
  selector: 'app-scene-goal-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SceneHintComponent],
  host: {
    '[attr.data-goal]': 'guia().objetivo',
    '[attr.data-collapsed]': '!open()',
  },
  template: `
    <section class="goal-card" [attr.aria-label]="copy.goalCardTitle.text" [class.goal-card--compact]="compact()">
      <button type="button" class="goal-card__toggle" [attr.aria-expanded]="open()" aria-controls="goal-card-body" (click)="toggle()">
        <span class="goal-card__kicker">{{ copy.goalCardTitle.text }}</span>
        <span class="goal-card__goal">{{ visibleGoal() }}</span>
        <svg class="goal-card__chevron" [class.goal-card__chevron--open]="open()" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
          <path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      @if (open()) {
        <div class="goal-card__body" id="goal-card-body">
          @if (guia().enEstaSala.length) {
            <h3 class="goal-card__list-title">{{ copy.roomListTitle.text }}</h3>
            <ul class="goal-card__list">
              @for (el of guia().enEstaSala; track el.key) {
                <li class="goal-card__item">{{ el.label }} · <span class="goal-card__mark">{{ mark(el) }}</span></li>
              }
            </ul>
          }
          @if (hintAttempt(); as attempt) {
            <app-scene-hint [attemptId]="attempt.attemptId" [attemptToken]="attempt.attemptToken"
              [buttonLabel]="copy.hintAskLabel.text" (consentRequired)="consentRequired.emit()" />
          }
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; min-width: 0; }

    .goal-card { display: grid; gap: 6px; min-width: 0; color: rgba(232,240,244,.92); }

    /* Objetivo táctil de 44 px de verdad con cualquier puntero; el texto no baja de 12 px. */
    .goal-card__toggle {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: 'kicker chevron' 'goal chevron';
      align-items: center;
      gap: 1px 10px;
      width: 100%;
      min-height: 44px;
      padding: 4px 10px;
      border: 1px solid rgba(182,156,255,.7);
      border-radius: 8px;
      background: transparent;
      color: #e8f0f4;
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: border-color 150ms ease, background-color 150ms ease;
    }
    .goal-card__kicker { grid-area: kicker; font-size: .75rem; font-weight: 800; letter-spacing: .04em; color: #cdbcff; }
    .goal-card__goal { grid-area: goal; min-width: 0; font-size: .82rem; line-height: 1.35; font-weight: 700; color: #f4f7fb; overflow-wrap: anywhere; }
    .goal-card__chevron { grid-area: chevron; color: #cdbcff; transition: transform 150ms ease; }
    .goal-card__chevron--open { transform: rotate(180deg); }
    @media (hover: hover) and (pointer: fine) {
      .goal-card__toggle:hover { border-color: rgba(182,156,255,.85); background: rgba(124,77,255,.18); }
    }
    @media (prefers-reduced-motion: reduce) {
      .goal-card__toggle, .goal-card__chevron { transition: none; }
    }

    .goal-card__body { display: grid; gap: 6px; min-width: 0; }
    .goal-card__list-title { margin: 4px 0 0; font-size: .75rem; font-weight: 800; color: #cdbcff; }
    .goal-card__list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
    .goal-card__item { font-size: .8rem; line-height: 1.35; color: rgba(232,240,244,.92); overflow-wrap: anywhere; }
    .goal-card__mark { color: rgba(232,240,244,.78); }

    /* La pista vive en el panel oscuro del juego: sus tokens siguen a la piel. */
    app-scene-hint { display: block; }
  `],
})
export class SceneGoalCardComponent {
  protected readonly copy = DRAFT_COPY;

  readonly guia = input.required<GuiaEscena>();
  readonly hintAttempt = input<HintAttemptRef | null>(null);
  /** Pantalla baja o táctil horizontal: la ficha pide menos sitio. Arranca plegada con o sin él. */
  readonly compact = input(false);
  /** Se abrió: la pantalla refresca «En esta sala» antes de que se lea. */
  readonly opened = output<void>();
  /** La pista recibió 403 `CONSENT_REQUIRED`: la pantalla vuelve al aviso previo como con cualquier otra orden. */
  readonly consentRequired = output<void>();

  protected readonly open = signal(false);
  protected readonly visibleGoal = computed(() => this.guia().objetivo || DRAFT_COPY.goalCardFallback.text);

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) this.opened.emit();
  }

  /** La marca va en texto: una persona se «habla», un objeto se «revisa». */
  protected mark(el: ElementoSala): string {
    if (!el.visto) return DRAFT_COPY.roomMarkNotYet.text;
    return el.tipo === 'persona' ? DRAFT_COPY.roomMarkTalked.text : DRAFT_COPY.roomMarkReviewed.text;
  }
}
