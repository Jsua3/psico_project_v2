import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { DRAFT_COPY } from './draft-copy';
import { HELP_TEXT, HelpModality, firstTimeHelpLines, helpSections } from './game-help.content';

let nextHelpId = 0;

/**
 * Ayuda «Cómo se juega» (F§5.8, F§6.4). Presentacional: no lee ni escribe la memoria de ayuda
 * (`siep.ayuda.v1`); quien la aloja decide cuándo mostrarla y registra que se vio.
 *
 * Dos vistas del mismo componente:
 * - `card`: tarjeta de primera vez. NO modal: sin trampa de foco ni foco inicial, sin temporizador,
 *   sin manejo de teclado. No consume Esc, así que Esc sigue llegando a la cadena de la pantalla
 *   de juego (ayuda -> bitácora -> diálogo -> pausa).
 * - `screen`: pantalla permanente. El foco entra y queda dentro mientras está abierta
 *   (`cdkTrapFocus`), pero tampoco escucha Esc: «Cerrar ayuda» emite `closed` y la pantalla de
 *   juego cierra la ayuda con Esc antes de pausar. No hay ningún botón «Salida segura»: el pie
 *   del juego sigue operable con ratón y toque.
 *
 * La promesa de pausa y de la tecla Esc solo se escribe con `safeExitPromise`.
 * Los botones miden 44 px como mínimo y su nombre accesible es su texto visible (WCAG 2.5.3).
 * Sin animación ni desenfoque: no hay nada que apagar con movimiento reducido.
 */
@Component({
  selector: 'app-game-help',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule],
  template: `
    @if (view() === 'card') {
      <section class="help-card" data-help-view="card" [class.help-card--compact]="compact()"
        [attr.aria-labelledby]="titleId">
        <h2 class="help-card__title" [attr.id]="titleId">{{ text.title }}</h2>
        <div class="help-card__lines">
          @for (line of cardLines(); track line) {
            <p>{{ line }}</p>
          }
        </div>
        <div class="help-card__actions">
          <button type="button" class="help-btn help-btn--primary" data-help-action="dismiss"
            (click)="dismissed.emit()">{{ text.understood }}</button>
          <button type="button" class="help-btn" data-help-action="more"
            (click)="openFull.emit()">{{ text.moreHelp }}</button>
        </div>
      </section>
    } @else {
      <section class="help-screen" role="dialog" data-help-view="screen"
        cdkTrapFocus [cdkTrapFocusAutoCapture]="true" [attr.aria-labelledby]="titleId">
        <header class="help-screen__head">
          <h2 class="help-screen__title" [attr.id]="titleId">{{ text.title }}</h2>
          <button type="button" class="help-btn" data-help-action="close"
            (click)="closed.emit()">{{ text.closeHelp }}</button>
        </header>
        <div class="help-screen__body" tabindex="0" role="region" aria-label="Contenido de la ayuda">
          @for (section of sections(); track section.id) {
            <section class="help-section" [attr.data-help-section]="section.id">
              <h3 class="help-section__title">{{ section.title }}</h3>
              <p class="help-section__text">{{ section.text }}</p>
            </section>
          }
          <!-- Fuera del bloque validado (F6-10, VD-18): nota en borrador sobre los atajos de una tecla. -->
          <aside class="help-draft" data-help-draft="shortcuts" aria-label="Nota sobre los atajos de una tecla (borrador)">
            <p class="help-draft__tag">Borrador</p>
            <p class="help-section__text">{{ shortcutsNote }}</p>
          </aside>
        </div>
      </section>
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; }

    .help-card {
      display: grid;
      gap: 8px;
      box-sizing: border-box;
      max-width: 560px;
      padding: 12px 14px;
      border: 1px solid rgba(182,156,255,.4);
      border-radius: 12px;
      background: rgba(8,12,18,.96);
      /* Marco doble: línea interna oscura, igual que la tarjeta «Qué hacer». */
      box-shadow:
        inset 0 0 0 1px rgba(8,12,18,.95),
        0 12px 30px -22px rgba(124,77,255,.55);
      color: rgba(232,240,244,.92);
    }
    .help-card__title,
    .help-screen__title {
      margin: 0;
      font-size: .82rem;
      font-weight: 900;
      letter-spacing: .04em;
      color: #cdbcff;
    }
    .help-card__lines { display: grid; gap: 6px; }
    .help-card__lines p { margin: 0; font-size: .82rem; line-height: 1.45; }
    .help-card__actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .help-card--compact { gap: 6px; padding: 8px 10px; }
    .help-card--compact .help-card__title { font-size: .75rem; }
    .help-card--compact .help-card__lines p { font-size: .78rem; line-height: 1.4; }

    .help-btn {
      box-sizing: border-box;
      min-width: 44px;
      min-height: 44px;
      padding: 8px 16px;
      border: 1px solid rgba(182,156,255,.55);
      border-radius: 12px;
      background: transparent;
      color: #e8f0f4;
      font: inherit;
      font-size: .82rem;
      font-weight: 800;
      cursor: pointer;
    }
    .help-btn--primary { border-color: #b69cff; background: #b69cff; color: #0b0f1a; }
    .help-btn:focus-visible { outline: 3px solid #c9b3ff; outline-offset: 3px; }

    .help-screen {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      max-width: 640px;
      max-height: min(78vh, 560px);
      border: 1px solid rgba(182,156,255,.4);
      border-radius: 14px;
      background: rgba(8,12,18,.97);
      box-shadow:
        inset 0 0 0 1px rgba(8,12,18,.95),
        0 18px 48px -28px rgba(124,77,255,.6);
      color: rgba(232,240,244,.92);
    }
    .help-screen__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
      padding: 8px 12px 8px 16px;
      border-bottom: 1px solid rgba(182,156,255,.22);
    }
    .help-screen__title { font-size: .95rem; }
    .help-screen__body {
      display: grid;
      gap: 12px;
      min-height: 0;
      padding: 12px 16px 16px;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .help-screen__body:focus-visible { outline: 3px solid #c9b3ff; outline-offset: -3px; }
    /* Fuera del bloque validado: borde discontinuo (la forma, no solo el color, dice «borrador»). */
    .help-draft {
      display: grid;
      gap: 4px;
      padding: 8px 12px;
      border: 1px dashed var(--ds-border-strong);
      border-radius: var(--ds-radius-md);
    }
    .help-draft__tag {
      margin: 0; font-size: var(--ds-type-caption-size); font-weight: 900; letter-spacing: .06em;
      text-transform: uppercase; color: var(--ds-primary);
    }
    .help-section__title { margin: 0 0 2px; font-size: .8rem; font-weight: 900; color: #cdbcff; }
    .help-section__text { margin: 0; font-size: .82rem; line-height: 1.5; }

    @media (max-height: 520px) {
      .help-screen { max-height: 92vh; }
    }
  `],
})
export class GameHelpComponent {
  /** `card`: tarjeta de primera vez (no modal). `screen`: pantalla permanente «Cómo se juega». */
  readonly view = input<'card' | 'screen'>('card');
  /** Teclado y ratón, o pantalla táctil (decide las teclas y los gestos que se explican). */
  readonly modality = input<HelpModality>('keyboard');
  /** Pantalla baja: la tarjeta se reduce a una frase y se compacta. */
  readonly compact = input(false);
  /** Verdadero solo cuando «Salida segura» es alcanzable en todos los estados (F§6.3). */
  readonly safeExitPromise = input(false);
  /** Ajuste «Atajos de una tecla» (F6-10): apagado, el texto de teclado no promete WASD, E, J ni los números. */
  readonly shortcuts = input(true);

  /** «Entendido» en la tarjeta de primera vez. */
  readonly dismissed = output<void>();
  /** «Más ayuda» en la tarjeta de primera vez: abrir la pantalla permanente. */
  readonly openFull = output<void>();
  /** «Cerrar ayuda» en la pantalla permanente (Esc lo gestiona la pantalla de juego). */
  readonly closed = output<void>();

  protected readonly text = HELP_TEXT;
  protected readonly shortcutsNote = DRAFT_COPY.shortcutsHelpNote.text;
  protected readonly titleId = `game-help-title-${nextHelpId++}`;

  protected readonly cardLines = computed(() =>
    firstTimeHelpLines({
      modality: this.modality(),
      compact: this.compact(),
      safeExitPromise: this.safeExitPromise(),
      singleKeyShortcuts: this.shortcuts(),
    }),
  );
  protected readonly sections = computed(() =>
    helpSections({
      modality: this.modality(),
      safeExitPromise: this.safeExitPromise(),
      singleKeyShortcuts: this.shortcuts(),
    }),
  );
}
