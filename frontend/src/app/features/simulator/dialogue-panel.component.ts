import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { AfterRenderRef, AfterViewChecked, Component, ElementRef, HostListener, Injector, OnDestroy, afterNextRender, computed, effect, inject, input, output, signal, untracked, ChangeDetectionStrategy } from '@angular/core';
import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { ShortcutSettings } from '../../core/a11y/shortcut-settings.service';
import { DialogueChoiceState, DialogueState, MapObjectState, Persona } from '../../core/models/simulation.model';
import { KitService } from '../character/kit/kit.service';
import { AudioDirectorService } from './audio-director.service';
import { MS_POR_CARACTER, pausaTras, tramos } from './caso/ritmo-texto';
import { choiceIndex } from './dialogue-keys.util';
import { MomentoDelDia, letraDe, variablesDeArte } from './dialogo-arte';
import { scrollShiftToUncoverText } from './dialogue-scroll.util';
import {
  activeDialogueLine,
  dialogueChoicesVisible,
  dialogueKeyAction,
  isFinalDialogueLine,
  nextDialogueLineIndex,
} from './dialogue-progression.util';
import { UiButton } from '../../shared/ui/button/ui-button';
import { DRAFT_COPY } from './draft-copy';
import { isSystemVoice, resolvePortraitAsset } from './portrait-resolver.util';
import { SafeExitButtonComponent } from './safe-exit-button.component';
import { HintAttemptRef, SceneHintComponent } from './scene-hint.component';

/** Ventana tras mostrar las opciones en la que se ignora un clic por teclado (Enter/Espacio mantenido). */
const CHOICE_ACTIVATION_GUARD_MS = 500;
/** Texto de la línea informativa de una conversación que pertenece a otra etapa. */
const STALE_NOTE = 'Esta conversación corresponde a otro momento del caso.';

@Component({
  selector: 'app-dialogue-panel',
  standalone: true,
  imports: [A11yModule, CommonModule, SafeExitButtonComponent, SceneHintComponent, UiButton],
  template: `
    @if (dialogue(); as d) {
      <div #dialogueBox
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        class="dialogue-strip"
        [class.dialogue-strip--side]="mode() === 'side'"
        [class.strip--warning]="interaction()?.type === 'WARNING'"
        [class.strip--supervisory]="activeSpeakerName(d) === 'Supervisión clínica'"
        [class.strip--quieto]="reduceMotion()"
        [style]="arte()"
        [attr.data-momento]="momento()"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'Diálogo con ' + activeSpeakerName(d)">

        <!-- Cabecera fija (REGLA-004, P5): el panel nunca atrapa, con o sin opciones y en ambos modos.
             Clases propias: los e2e pulsan «button.close-btn» para avanzar y cerrar diálogos. -->
        <header class="panel-head">
          <div class="panel-head__row">
            <button type="button" class="panel-back" (click)="close.emit()">
              <span class="panel-back__arrow" aria-hidden="true">◀</span> Volver al mapa
            </button>
            <app-safe-exit-button class="panel-head__exit" data-hide-key [pausing]="pausing()" (pause)="safeExit.emit()" />
          </div>
          @if (hasDecisionOptions(d)) {
            <p class="panel-head__note">
              <span class="panel-chip">{{ decisionLabel }}</span>
              <span>Tu elección queda registrada en tu seguimiento formativo.</span>
            </p>
          }
        </header>

        <div class="strip-main">
          <!-- La placa de quien habla: nombre en su pestaña, retrato que asoma sobre el marco, estado y la línea. -->
          <section class="placa">
            <p class="speaker-name">{{ activeSpeakerName(d) }}
              @if (showsEmotionCue(d) && emotionLabel(activeEmotion(d)); as em) {
                <span class="emotion-tag" [style.color]="emotionColor(activeEmotion(d))">{{ em }}</span>
              }
            </p>
            <div class="placa-cuerpo">
              <div class="portrait" aria-hidden="true" [style.color]="showsEmotionCue(d) ? emotionColor(activeEmotion(d)) : null">
                @if (portraitSrc(d); as src) {
                  <img class="portrait-img" [src]="src" alt="" width="96" height="96" (error)="onPortraitError(src)" />
                } @else {
                  <svg viewBox="0 0 48 48" class="portrait-svg" width="40" height="40">
                    <circle cx="24" cy="18" r="9" fill="currentColor"/>
                    <path d="M8 44 C8 33 15 28 24 28 C33 28 40 33 40 44 Z" fill="currentColor"/>
                  </svg>
                }
                @if (showsEmotionCue(d) && activeEmotion(d) !== 'neutral') {
                  <span class="emotion-chip" [attr.data-emotion]="activeEmotion(d)"></span>
                }
                @if (estadoPersona(d); as e) {
                  <i class="portrait-base" [attr.data-activation]="e.activation"></i>
                }
              </div>

              <div class="placa-habla">
                @if (estadoPersona(d); as e) {
                  <p class="persona-state"><i class="pulso" [attr.data-activation]="e.activation" aria-hidden="true"></i>{{ e.texto }}</p>
                }
                <!-- La línea se maqueta entera desde el principio (lo que falta va invisible): ninguna palabra salta de renglón. -->
                <p class="dialogue-text" aria-hidden="true">@for (t of piezas(); track $index) {<span [class.acot]="t.acotacion" [class.falta]="t.oculto">{{ t.texto }}</span>}</p>
                <!-- Texto completo de la línea para el cursor de lectura. Sin role ni aria-live (H-09): una región que
                     nace dentro del @if con su texto no se anuncia; la línea la anuncia el servicio de regiones vivas. -->
                <p class="visually-hidden">{{ fullText() }}</p>

                @if (staleNote(d); as note) {
                  <p class="stale-note" role="note">{{ note }}</p>
                }

                <div class="placa-pie">
                  @if (!isTypingComplete()) {
                    <button type="button" class="close-btn" ui-button variant="primary" cdkFocusInitial
                      (click)="skipTypewriter()"
                      aria-label="Saltar animación de texto">
                      Saltar <span aria-hidden="true">▶</span>
                    </button>
                  }
                  @if (isTypingComplete() && !isLastLine()) {
                    <button type="button" class="close-btn" ui-button variant="primary" cdkFocusInitial
                      (click)="advanceLine()"
                      aria-label="Mostrar siguiente intervención">
                      Siguiente <span aria-hidden="true">▶</span>
                    </button>
                  }
                  @if (isTypingComplete() && isLastLine() && !hasChoices(d)) {
                    <button type="button" class="close-btn" ui-button variant="primary" cdkFocusInitial
                      (click)="close.emit()">
                      Continuar <span aria-hidden="true">▶</span>
                    </button>
                  }
                </div>
              </div>
            </div>
          </section>

          <!-- Las fichas de respuesta, A a D. -->
          <div class="strip-body">
            @if (choicesVisible() && !d.stale) {
              @let notice = noticeText(d);
              @if (notice) {
                <p class="choices-notice" id="choices-notice" role="note">{{ notice }}</p>
              }
              <!-- La pista acompaña a quien decide: una confirmación de la interfaz («Explorar primero») no la ofrece. -->
              @if (offersHints(d) && hintAttempt(); as attemptRef) {
                <app-scene-hint [attemptId]="attemptRef.attemptId" [attemptToken]="attemptRef.attemptToken"
                  (consentRequired)="consentRequired.emit()" />
              }
              <div class="choices" role="group" aria-label="Opciones de intervención" tabindex="-1" cdkFocusInitial
                [attr.aria-describedby]="notice ? 'choices-notice' : null"
                [class.choices--locked]="chosenKey() !== null">
                @for (choice of d.choices; track choice.key; let i = $index) {
                  @if (subtitleBefore(d, i); as subtitle) {
                    <p class="choices-subtitle">{{ subtitle }}</p>
                  }
                  <button
                    type="button"
                    class="choice-btn"
                    [class.choice-btn--chosen]="chosenKey() === choice.key"
                    [class.choice-btn--unavailable]="choice.toolMissing"
                    [style.--stagger]="i"
                    [attr.aria-label]="letra(i) + '. ' + choice.text + (choice.toolMissing ? '. ' + toolMissingHint : '')"
                    [attr.aria-disabled]="choice.toolMissing ? 'true' : null"
                    (focus)="onChoiceFocus($event)"
                    (click)="onChoiceClick($event, choice)">
                    <!-- La letra se dibuja en pixel art; como texto queda solo para que el texto visible empiece por ella (WCAG 2.5.3). -->
                    <span class="choice-num" aria-hidden="true" [attr.data-letra]="letra(i)"><span class="choice-num__txt" [class.choice-num__txt--ver]="i > 3">{{ letra(i) }}</span></span>{{ ' ' }}<span class="choice-btn__body">
                      <span class="choice-btn__label">{{ choice.text }}</span>
                      @if (choice.toolMissing) {
                        {{ ' ' }}<span class="choice-btn__hint" [id]="'choice-hint-' + i">{{ toolMissingHint }}</span>
                      }
                    </span>
                    <i class="choice-btn__cursor" aria-hidden="true"></i>
                  </button>
                }
              </div>
            }

            <p class="keyboard-hint">{{ keyboardHint(d) }}</p>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    /* Hecho de la sala (bloque I1): la placa de quien habla y las fichas de respuesta son pixel art a la misma escala
       que el mundo, con la luz de la sala (canto cálido de lámpara de noche, claro de día). Los marcos, tramas y letras
       son PNG de assets/game/dialogo (tools/escenarios/dialogo_arte.py) que llegan como variables CSS (dialogo-arte.ts). */
    :host { display: block; }
    .dialogue-strip {
      --px: 2px; --tam: 17px; --retrato: 192px;
      /* Capas del panel: la pestaña del nombre tapa el canto de la placa; la cabecera fija va sobre lo que se desplaza. */
      --capa-pestana: 1; --capa-cabecera: 3;
      --tinta: #f2ecdf; --tinta-suave: #c3bccf; --tinta-oscura: #1b1530; --penumbra: #1b1826;
      --f-nombre: 'JetBrains Mono', ui-monospace, monospace;
      --f-texto: 'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif;
      position: relative;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: calc(4 * var(--px));
      padding: calc(4 * var(--px)) calc(8 * var(--px)) calc(10 * var(--px));
      max-height: 78vh;
      overflow-y: auto;
      background: transparent;
      color: var(--tinta);
      font-family: var(--f-texto);
      font-size: var(--tam);
      line-height: 1.45;
      animation: strip-rise 160ms steps(3, jump-none) both;
    }
    @media (min-width: 1800px) { .dialogue-strip { --px: 3px; --tam: 20px; --retrato: 288px; } }

    /* Marco de pixel art: borde de 4 px de mundo por lado y relleno con trama, sin esquinas suavizadas. */
    .placa-cuerpo, .speaker-name, .panel-back, .panel-head__note, .choice-btn, .stale-note, .choices-notice, .choices-subtitle, .keyboard-hint, .portrait {
      border-style: solid;
      border-width: calc(4 * var(--px));
      border-image: var(--m) 4 / calc(4 * var(--px)) stretch;
      border-radius: 0;
      background-color: var(--penumbra);
      background-image: var(--t);
      background-size: calc(8 * var(--px));
      background-clip: padding-box;
      background-origin: padding-box;
      image-rendering: pixelated;
    }

    .strip-main {
      display: grid;
      grid-template-columns: minmax(0, 11fr) minmax(0, 14fr);
      gap: calc(8 * var(--px));
      align-items: end;
    }
    .strip-main:not(:has(.choices)) { grid-template-columns: minmax(0, min(46em, 100%)); }
    .strip-main:not(:has(.choices)) .strip-body { display: none; }

    /* Cabecera fija del panel: «Volver al mapa» y «Salida segura» siempre a mano. */
    .panel-head {
      position: sticky;
      top: 0;
      z-index: var(--capa-cabecera);
      display: grid;
      gap: calc(3 * var(--px));
      justify-items: end;
    }
    .panel-head__row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: calc(4 * var(--px));
      flex-wrap: wrap;
    }
    .panel-head__note {
      --m: var(--marco-placa); --t: var(--trama-placa);
      margin: 0;
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 2px 12px;
      padding: 1px 10px 3px;
      font-size: .8em;
      line-height: 1.35;
      color: #c3bccf;
    }
    .panel-chip {
      font-family: var(--f-nombre);
      font-weight: 700;
      font-size: 1.05em;
      letter-spacing: .02em;
      color: #ffcd82;
    }
    .panel-back {
      --m: var(--marco-placa); --t: var(--trama-placa);
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      padding: 0 12px 1px 8px;
      color: #f2ecdf;
      font: inherit;
      font-size: .82em;
      font-weight: 600;
      cursor: pointer;
    }
    .panel-back::before, .close-btn::before {
      content: 'Esc';
      display: none;
      padding: 1px 6px calc(2 * var(--px));
      border-style: solid;
      border-width: calc(4 * var(--px));
      border-image: var(--marco-tecla) 4 / calc(4 * var(--px)) stretch;
      background: #3a3454 padding-box;
      image-rendering: pixelated;
      font-family: var(--f-nombre);
      font-size: .82em;
      font-weight: 700;
      line-height: 1;
      color: var(--tinta);
    }
    .close-btn::before { content: 'Enter'; }
    @media (hover: hover) and (pointer: fine) {
      .panel-back:hover { color: #ffcd82; }
      .panel-back::before, .close-btn::before { display: inline-block; }
    }
    .panel-back:active { transform: translateY(var(--px)); }
    .panel-back__arrow { font-size: .75em; }

    /* La placa. */
    .placa { min-width: 0; display: flex; flex-direction: column; }
    .speaker-name {
      --m: var(--marco-rotulo); --t: var(--trama-placa);
      align-self: flex-start;
      position: relative;
      z-index: var(--capa-pestana);
      margin: 0 0 calc(-1 * var(--px)) calc(var(--retrato) + 18 * var(--px));
      border-bottom-width: 0;
      padding: 1px calc(4 * var(--px)) calc(2 * var(--px));
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-family: var(--f-nombre);
      font-weight: 700;
      font-size: 1.1em;
      line-height: 1.2;
      letter-spacing: .01em;
      color: var(--luz);
    }
    .strip--supervisory .speaker-name { color: #9fd9a8; }
    .strip--warning .speaker-name { color: #f0a3b2; }
    .emotion-tag {
      opacity: 1;
      font-size: .7em;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: lowercase;
    }
    .emotion-tag::before { content: '· '; opacity: .6; }

    .placa-cuerpo {
      --m: var(--marco-placa); --t: var(--trama-placa);
      position: relative;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: calc(6 * var(--px));
      padding: calc(4 * var(--px)) calc(5 * var(--px)) calc(3 * var(--px)) calc(4 * var(--px));
    }
    .placa-cuerpo::after, .choice-btn::after {
      content: '';
      position: absolute;
      left: calc(-2 * var(--px));
      right: calc(-2 * var(--px));
      bottom: calc(-6 * var(--px));
      height: calc(2 * var(--px));
      background-image: var(--sombra);
      background-size: calc(2 * var(--px));
      image-rendering: pixelated;
      pointer-events: none;
    }

    /* El retrato asoma sobre el marco. Mide un múltiplo de 96: ya recibe un retrato fino de 96 px sin cambiar nada. */
    .portrait {
      --m: var(--marco-ficha); --t: none;
      --rp: calc(var(--retrato) / 32);
      position: relative;
      align-self: end;
      margin-top: calc(-14 * var(--px));
      width: calc(var(--retrato) + 8 * var(--px));
      height: calc(var(--retrato) + 8 * var(--px));
      display: grid;
      place-items: end center;
      overflow: hidden;
      background-color: #262238;
    }
    .portrait-svg { color: #b69cff; align-self: center; }
    .portrait-img {
      display: block;
      width: var(--retrato);
      height: var(--retrato);
      image-rendering: pixelated;
      /* Finito: 70 ciclos (unos 3 minutos) cubren cualquier conversación; después queda quieto. */
      animation: respira 2.6s steps(1) 70;
    }
    .portrait-base {
      position: absolute; left: 0; right: 0; bottom: 0; height: calc(2 * var(--px));
      background: #f0c46e;
    }
    .portrait-base[data-activation="CALM"] { background: #8fcf9a; }
    .portrait-base[data-activation="CRISIS"] { background: #ec9684; }
    .emotion-chip {
      position: absolute;
      top: calc(2 * var(--px));
      right: calc(2 * var(--px));
      width: calc(5 * var(--px));
      height: calc(5 * var(--px));
      background: #b69cff;
      box-shadow: 0 0 0 var(--px) #15131d;
    }
    .emotion-chip[data-emotion="positive"] { background: #6ec67a; }
    .emotion-chip[data-emotion="concerned"] { background: #f5b84b; }
    .emotion-chip[data-emotion="danger"] { background: #e25a4f; }

    .placa-habla { min-width: 0; display: flex; flex-direction: column; gap: calc(3 * var(--px)); padding-top: var(--px); }
    .persona-state { margin: 0; display: flex; align-items: center; gap: calc(4 * var(--px)); font-size: .84em; color: var(--tinta-suave); }
    .pulso {
      flex: none;
      width: calc(16 * var(--px));
      height: calc(8 * var(--px));
      background: var(--pulso-TENSE) 0 0 / calc(64 * var(--px)) calc(8 * var(--px)) no-repeat;
      image-rendering: pixelated;
      animation: pulso 1s steps(4) 180;
    }
    .pulso[data-activation="CALM"] { background-image: var(--pulso-CALM); animation-duration: 2s; }
    .pulso[data-activation="CRISIS"] { background-image: var(--pulso-CRISIS); animation-duration: .5s; }
    .dialogue-text {
      margin: 0;
      min-height: 4.35em;
      white-space: pre-line;
      overflow-wrap: break-word;
      color: var(--tinta);
    }
    .dialogue-text .acot { font-style: italic; color: var(--tinta-suave); }
    .dialogue-text .falta { visibility: hidden; }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .placa-pie { display: flex; justify-content: flex-end; align-items: center; min-height: 44px; }
    .dialogue-strip .close-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      padding: 0 2px;
      border: 0;
      background: transparent;
      box-shadow: none;
      color: var(--tinta);
      font: inherit;
      font-size: .9em;
      font-weight: 600;
    }
    @media (hover: hover) and (pointer: fine) {
      .dialogue-strip .close-btn:hover { background: transparent; color: var(--luz); }
    }

    /* Las fichas de respuesta. */
    .strip-body { min-width: 0; display: flex; flex-direction: column; gap: calc(4 * var(--px)); }
    .choices {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-auto-rows: 1fr;
      gap: calc(5 * var(--px));
      /* Deja libre la cabecera fija cuando scrollIntoView alinea el inicio de la lista. */
      scroll-margin-top: 72px;
      padding-left: calc(10 * var(--px));
      margin-left: calc(-10 * var(--px));
      outline: none;
    }
    .choice-btn {
      --m: var(--marco-ficha); --t: var(--trama-ficha);
      position: relative;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: calc(5 * var(--px));
      align-items: start;
      min-height: 48px;
      padding: calc(2 * var(--px)) calc(4 * var(--px)) calc(3 * var(--px)) calc(3 * var(--px));
      color: var(--tinta);
      font: inherit;
      font-size: .94em;
      line-height: 1.35;
      text-align: left;
      cursor: pointer;
      transition: border-color 150ms ease, background-color 150ms ease, opacity 240ms steps(3), transform 120ms steps(2);
    }
    @media (hover: hover) and (pointer: fine) {
      .choice-btn:hover { --m: var(--marco-ficha-sobre); --t: var(--trama-ficha-sobre); }
      .choice-btn:hover .choice-num { border-image-source: var(--marco-tecla-encendida); background-color: var(--luz); --lt: var(--lo); }
    }
    .choice-btn:focus-visible { --m: var(--marco-ficha-foco); --t: var(--trama-ficha-sobre); }
    .choice-btn:focus-visible .choice-num { border-image-source: var(--marco-tecla-encendida); background-color: var(--luz); --lt: var(--lo); }
    .choice-btn:focus-visible .choice-btn__cursor { display: block; }
    .choice-btn:active { transform: translateY(var(--px)); --m: var(--marco-ficha-pulsada); --t: var(--trama-ficha-pulsada); }
    .choice-btn:active::after { display: none; }
    /* Entrada escalonada de las fichas (por pasos, una sola vez). */
    .choice-btn {
      animation: choice-in 150ms steps(3, jump-none) backwards;
      animation-delay: calc(var(--stagger, 0) * 55ms);
    }
    /* Confirmación: la ficha elegida se enciende y las demás ceden. */
    .choices--locked .choice-btn { pointer-events: none; }
    .choices--locked .choice-btn:not(.choice-btn--chosen) { opacity: .45; }
    .choices .choice-btn.choice-btn--chosen {
      --m: var(--marco-ficha-elegida); --t: var(--trama-ficha-elegida);
      color: var(--tinta-oscura);
      animation: choice-confirm 170ms steps(2);
    }
    .choice-btn--chosen .choice-num { border-image-source: var(--marco-tecla-encendida); background-color: var(--luz); --lt: var(--lo); }
    @keyframes choice-in {
      from { opacity: 0; transform: translateY(calc(3 * var(--px))); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes choice-confirm {
      0%   { transform: translateY(var(--px)); }
      100% { transform: translateY(0); }
    }
    /* La letra de la ficha es pixel art propio: la C abierta, la B con cintura (no 0 ni 8). */
    .choice-num {
      --lc: none; --lo: none; --lt: var(--lc);
      display: grid;
      place-items: center;
      min-width: calc(15 * var(--px));
      min-height: calc(17 * var(--px));
      margin-top: 1px;
      border-width: calc(4 * var(--px));
      border-style: solid;
      border-image: var(--marco-tecla) 4 / calc(4 * var(--px)) stretch;
      background: #3a3454 padding-box;
      image-rendering: pixelated;
      font-family: var(--f-nombre);
      font-weight: 700;
      color: var(--tinta);
    }
    .choice-num::after {
      content: '';
      width: calc(7 * var(--px));
      height: calc(9 * var(--px));
      background: var(--lt) 0 0 / 100% 100% no-repeat;
      image-rendering: pixelated;
    }
    .choice-num__txt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
    .choice-num__txt--ver { position: static; width: auto; height: auto; clip: auto; }
    .choice-num:has(.choice-num__txt--ver)::after { display: none; }
    .choice-num[data-letra="A"] { --lc: var(--letra-A-clara); --lo: var(--letra-A-oscura); }
    .choice-num[data-letra="B"] { --lc: var(--letra-B-clara); --lo: var(--letra-B-oscura); }
    .choice-num[data-letra="C"] { --lc: var(--letra-C-clara); --lo: var(--letra-C-oscura); }
    .choice-num[data-letra="D"] { --lc: var(--letra-D-clara); --lo: var(--letra-D-oscura); }
    .choice-btn__cursor {
      display: none;
      position: absolute;
      left: calc(-11 * var(--px));
      top: 50%;
      width: calc(6 * var(--px));
      height: calc(7 * var(--px));
      margin-top: calc(-3.5 * var(--px));
      background: var(--cursor) 0 0 / 100% 100% no-repeat;
      image-rendering: pixelated;
    }
    .choice-btn__body { display: grid; gap: 5px; min-width: 0; padding-top: .1em; overflow-wrap: break-word; }
    .choice-btn__label { display: block; }
    .choice-btn__hint {
      width: fit-content;
      max-width: 100%;
      padding: 1px 6px;
      background: #3b2a12;
      color: #f5d49b;
      font-size: .8em;
      font-weight: 700;
      line-height: 1.3;
    }
    .choice-btn--unavailable { cursor: not-allowed; opacity: .72; }
    .choice-btn--unavailable:active { transform: none; }
    /* Aviso único de evidencia sobre las opciones (nunca por opción): informa, no bloquea. */
    .choices-notice {
      --m: var(--marco-placa); --t: var(--trama-placa);
      margin: 0;
      padding: 2px 10px 4px;
      color: #f5e3c0;
      font-size: .84em;
      line-height: 1.45;
    }
    .choices-subtitle {
      --m: var(--marco-placa); --t: var(--trama-placa);
      grid-column: 1 / -1;
      justify-self: start;
      margin: 4px 0 0;
      padding: 0 8px 1px;
      color: #ffcd82;
      font-family: var(--f-nombre);
      font-size: .8em;
      font-weight: 700;
    }
    .stale-note {
      --m: var(--marco-placa); --t: var(--trama-placa);
      margin: 0;
      padding: 2px 10px 4px;
      color: #f2ecdf;
      font-size: .86em;
      line-height: 1.45;
    }
    /* La pista de teclado solo existe donde hay teclado y puntero fino. */
    .keyboard-hint { display: none; --m: var(--marco-placa); --t: var(--trama-placa); align-self: flex-start; margin: 0; padding: 0 8px 1px; font-size: .78em; color: #c3bccf; }
    @media (hover: hover) and (pointer: fine) {
      .keyboard-hint { display: block; }
    }

    @keyframes strip-rise {
      from { transform: translateY(calc(6 * var(--px))); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    @keyframes respira {
      0%, 49% { transform: translateY(0); }
      50%, 100% { transform: translateY(calc(-1 * var(--rp))); }
    }
    @keyframes pulso { to { background-position: calc(-64 * var(--px)) 0; } }

    /* ── Modo lateral (panel derecho del HUD): la placa arriba y las fichas debajo, en una columna. ───────── */
    .dialogue-strip--side {
      --retrato: 96px;
      --tam: 16px;
      min-height: 0;
      height: 100%;
      overflow-y: auto;
      padding: calc(4 * var(--px)) calc(6 * var(--px)) calc(8 * var(--px));
      animation: none;
    }
    .dialogue-strip--side .panel-head { background: #15131d; }
    .dialogue-strip--side .panel-head { padding: calc(2 * var(--px)) 0 calc(3 * var(--px)); justify-items: stretch; }
    .dialogue-strip--side .strip-main { grid-template-columns: minmax(0, 1fr); align-items: stretch; }
    .dialogue-strip--side .choices { grid-template-columns: minmax(0, 1fr); grid-auto-rows: auto; }
    .dialogue-strip--side .portrait { margin-top: calc(-8 * var(--px)); }
    .dialogue-strip--side .speaker-name { margin-left: calc(var(--retrato) + 14 * var(--px)); }
    .dialogue-strip--side .dialogue-text { min-height: 2.9em; }
    @media (min-width: 1800px) { .dialogue-strip--side { --retrato: 192px; --tam: 19px; } }

    /* Pantallas bajas (844x390 táctil): todo más denso y las opciones a la vista. */
    @media (max-height: 520px) {
      .dialogue-strip { --retrato: 96px; padding-top: 0; }
      .panel-head__note { display: none; }
      .choices { scroll-margin-top: 52px; gap: calc(3 * var(--px)); }
      .dialogue-text { min-height: 0; }
      .choice-btn { min-height: 44px; }
    }
    @media (max-width: 560px) {
      .dialogue-strip { --retrato: 96px; padding-left: calc(4 * var(--px)); padding-right: calc(4 * var(--px)); }
      .strip-main { grid-template-columns: minmax(0, 1fr); }
      .choices { grid-template-columns: minmax(0, 1fr); grid-auto-rows: auto; }
      .speaker-name { margin-left: calc(var(--retrato) + 14 * var(--px)); }
    }
    .strip--quieto, .strip--quieto .portrait-img, .strip--quieto .pulso, .strip--quieto .choice-btn, .strip--quieto .choice-btn--chosen { animation: none; }
    .strip--quieto .choice-btn:active { transform: none; }
    @media (prefers-reduced-motion: reduce) {
      .dialogue-strip { animation: none; }
      .portrait-img, .pulso { animation: none; }
      .choice-btn, .choice-btn--chosen { animation: none; }
      .choice-btn:active { transform: none; }
    }
  `]
})
export class DialoguePanelComponent implements AfterViewChecked, OnDestroy {
  readonly dialogue    = input<DialogueState | null>(null);
  readonly interaction = input<MapObjectState | null>(null);
  /** 'cinematic' = franja inferior a lo ancho; 'side' = columna en panel derecho. */
  readonly mode        = input<'cinematic' | 'side'>('cinematic');
  /** Movimiento reducido del juego (interruptor del HUD o preferencia del sistema): la línea aparece completa, sin máquina de escribir. */
  readonly reduceMotion = input(false);
  /**
   * Token de liberación: el anfitrión lo incrementa cuando una acción fallida (decisión, herramienta,
   * apertura) debe devolver el panel a un estado utilizable. Sin esto `chosenKey` quedaba fijo
   * hasta que cambiaba el diálogo y el panel se quedaba atrapado (DLG-01).
   */
  /**
   * El intento en juego (F10-2): con él, las opciones de una decisión llevan las pistas de la escena (C9). Sin él —la vista
   * previa del editor no tiene intento— no hay pistas.
   */
  readonly hintAttempt = input<HintAttemptRef | null>(null);
  /** Aviso de una opción de herramienta sin la herramienta: se ve y forma parte de su nombre accesible (WCAG 2.5.3). */
  protected readonly toolMissingHint = 'Aún no tienes esta herramienta. Recógela en la sala.';
  readonly releaseToken = input(0);
  /** Hay una salida segura pedida que espera: el botón «Salida segura» del panel dice «Pausando…» (F6-6). */
  readonly pausing = input(false);
  /** Momento del día de la sala: los marcos toman su luz (cálida de lámpara de noche, clara de sol de día). */
  readonly momento = input<MomentoDelDia>('noche');
  /**
   * La persona consultante, solo cuando quien habla es ella: su estado se lee en un pulso dibujado y en palabras
   * («Se muestra cautelosa y tensa»), sin cifras. Sin ella, la placa no muestra estado.
   */
  readonly persona = input<Pick<Persona, 'bond' | 'activation' | 'label'> | null>(null);

  readonly close   = output<void>();
  /** Vocabulario educativo en borrador (VD-24): el chip de la cabecera sale del registro de borradores. */
  protected readonly decisionLabel = DRAFT_COPY.decisionLabel.text;
  private readonly shortcuts = inject(ShortcutSettings);
  /** Pausa reanudable pedida desde el panel (REGLA-004): el anfitrión llama a la salida segura real. */
  readonly safeExit = output<void>();
  readonly execute = output<number>();
  readonly useTool = output<string>();
  readonly frontendChoice = output<string>();
  /** Las pistas recibieron un 403 `CONSENT_REQUIRED` (S3-2b): el anfitrión vuelve al aviso de contenido. */
  readonly consentRequired = output<void>();

  readonly displayedText    = signal('');
  readonly isTypingComplete = signal(false);
  readonly lineIndex = signal(0);
  readonly activeLine = computed(() => activeDialogueLine(this.dialogue(), this.lineIndex()));
  readonly isLastLine = computed(() => isFinalDialogueLine(this.dialogue(), this.lineIndex()));
  readonly choicesVisible = computed(() => dialogueChoicesVisible(
    this.dialogue(),
    this.lineIndex(),
    this.isTypingComplete(),
  ));
  /** Opción ya elegida: pausa breve de confirmación antes de ejecutar. */
  readonly chosenKey = signal<string | null>(null);
  /** El arte de pixel del momento del día, como variables CSS del elemento raíz. */
  protected readonly arte = computed(() => variablesDeArte(this.momento()));
  /** La línea entera en tramos (acotación o no) y, de cada uno, lo ya escrito y lo que falta (invisible, ocupa su sitio). */
  protected readonly piezas = computed(() => {
    const texto = this.activeLine()?.text ?? '';
    const visto = this.displayedText().length;
    const lista: { texto: string; acotacion: boolean; oculto: boolean }[] = [];
    let desde = 0;
    for (const t of tramos(texto)) {
      const hasta = desde + t.texto.length;
      const corte = Math.max(desde, Math.min(hasta, visto));
      if (corte > desde) lista.push({ texto: texto.slice(desde, corte), acotacion: t.acotacion, oculto: false });
      if (hasta > corte) lista.push({ texto: texto.slice(corte, hasta), acotacion: t.acotacion, oculto: true });
      desde = hasta;
    }
    return lista;
  });
  /** Retrato cuya carga falló: cae a la silueta SVG (spike de retratos NPC). */
  private readonly failedPortrait = signal<string | null>(null);

  private typewriterHandle: ReturnType<typeof setTimeout> | null = null;
  private confirmHandle: ReturnType<typeof setTimeout> | null = null;
  /** Instante en que aparecieron las opciones: base de la guarda contra la decisión accidental. */
  private choicesShownAt = 0;
  /** La vista ya se asentó para la línea en curso (ancla abajo o opciones reveladas, una sola vez). */
  private settled = false;
  private focusRenderRef: AfterRenderRef | null = null;
  private readonly audio = inject(AudioDirectorService);
  private readonly kit = inject(KitService);
  private readonly liveAnnouncer = inject(LiveRegionAnnouncer);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  constructor() {
    this.kit.load().catch(() => undefined);
    effect(() => {
      const d = this.dialogue();
      this.stopTypewriter();
      this.lineIndex.set(0);
      this.chosenKey.set(null);
      this.failedPortrait.set(null);
      this.choicesShownAt = Date.now();
      this.settled = false;
      if (d?.lines?.length) {
        this.audio.playSfx('ui_select');
        this.startTypewriter(d.lines[0].text);
      } else {
        this.displayedText.set('');
        this.isTypingComplete.set(true);
      }
    });
    effect(() => {
      if (this.choicesVisible()) this.choicesShownAt = Date.now();
    });
    // La línea activa se anuncia por la región viva persistente de la app (F6-12, H-09). Cuenta la línea completa, no
    // la máquina de escribir, y solo cuando cambia el diálogo o la línea.
    effect(() => {
      const text = this.dialogue() ? this.activeLine()?.text ?? '' : '';
      untracked(() => { if (text) this.liveAnnouncer.announce(text, 'polite'); });
    });
    // Liberación: cada token nuevo suelta la elección en curso (y su ejecución pendiente).
    effect(() => {
      this.releaseToken();
      untracked(() => this.releaseSelection());
    });
  }

  /**
   * Retrato pixel-art de la línea actual (spec §8.2), o `null` si no hay retrato (voz sin
   * cuerpo, kit sin cargar o imagen fallida) → el panel muestra la silueta SVG.
   */
  portraitSrc(d: DialogueState): string | null {
    const line = this.activeLine();
    const lineSpeaker = line?.speakerName?.trim() || null;
    const treeSpeaker = d.speakerName?.trim() || null;
    // La receta y la clave del árbol valen para sus propias líneas, no para las de otro hablante.
    const sameSpeaker = !lineSpeaker || lineSpeaker === treeSpeaker;
    const asset = resolvePortraitAsset(this.kit.bundle(), {
      recipeId: sameSpeaker ? d.recipeId ?? null : null,
      portraitKey: sameSpeaker ? d.portraitKey : null,
      speakerName: lineSpeaker || treeSpeaker,
      emotion: line?.emotion?.trim() || d.emotion?.trim() || 'neutral',
    });
    return asset && this.failedPortrait() !== asset ? asset : null;
  }

  activeSpeakerName(d: DialogueState): string {
    return this.activeLine()?.speakerName?.trim() || d.speakerName?.trim() || 'Intervención';
  }

  activeEmotion(d: DialogueState): string {
    return this.activeLine()?.emotion?.trim() || d.emotion?.trim() || 'neutral';
  }

  onPortraitError(src: string): void {
    this.failedPortrait.set(src);
  }

  /** Color del retrato/etiqueta según la emoción del hablante. */
  emotionColor(emotion: string | null | undefined): string {
    switch (emotion) {
      case 'positive': return '#6EC67A';
      case 'concerned': return '#F5B84B';
      case 'danger': return '#E25A4F';
      default: return '#B69CFF';
    }
  }

  /** Estado emocional textual discreto (null = no se muestra). */
  emotionLabel(emotion: string | null | undefined): string | null {
    switch (emotion) {
      case 'positive': return 'receptiva';
      case 'concerned': return 'preocupada';
      case 'danger': return 'alerta';
      default: return null;
    }
  }

  /** Hay algo que elegir: una conversación de otra etapa nunca ofrece opciones. */
  hasChoices(d: DialogueState): boolean {
    return !d.stale && d.choices.length > 0;
  }

  /** Alguna opción activa registra una decisión (cabecera con el chip de decisión: VD-24). */
  hasDecisionOptions(d: DialogueState): boolean {
    return !d.stale && d.choices.some(choice => choice.decisionOptionId != null);
  }

  /**
   * Hay una acción del caso que decidir con ayuda: una decisión o una herramienta (en el caso demo la decisión de la sala se
   * alcanza por la herramienta, y sin ella la lista solo trae esa opción). Las confirmaciones de la interfaz, sin decisión ni
   * herramienta, no son un momento de decidir: no se ofrecen pistas ni se pide nada al servidor.
   */
  offersHints(d: DialogueState): boolean {
    return !d.stale && d.choices.some(choice => choice.decisionOptionId != null || choice.requiredToolCode != null);
  }

  /** La letra de la opción en la posición `i` (A a D, como en el documento del caso). */
  letra(i: number): string {
    return letraDe(i);
  }

  /** El estado de la persona consultante en palabras y su activación (para el pulso); nunca para una voz de sistema. */
  estadoPersona(d: DialogueState): { texto: string; activation: string } | null {
    const persona = this.persona();
    const label = persona?.label?.trim();
    if (!persona || !label || isSystemVoice(this.activeSpeakerName(d))) return null;
    return { texto: label.charAt(0).toUpperCase() + label.slice(1), activation: persona.activation };
  }

  /** Solo las voces de sistema llevan chip y etiqueta de emoción; las personas no (duelo, límite 2). */
  showsEmotionCue(d: DialogueState): boolean {
    return isSystemVoice(this.activeSpeakerName(d));
  }

  /**
   * Aviso único sobre las opciones. Llega ya decorado en `notice`; el respaldo lee la advertencia
   * heredada por opción (misma frase repetida) para no perder el aviso mientras el anfitrión migra.
   */
  noticeText(d: DialogueState): string | null {
    return d.notice || d.choices.find(choice => choice.evidenceWarning)?.evidenceWarning || null;
  }

  /** Línea informativa de «otro momento»; no se repite si la conversación ya la trae como línea. */
  staleNote(d: DialogueState): string | null {
    if (!d.stale) return null;
    return d.lines.some(line => line.text.includes(STALE_NOTE)) ? null : STALE_NOTE;
  }

  /** Subtítulo de grupo (solo cuando conviven herramientas y decisiones; sin reordenar). */
  subtitleBefore(d: DialogueState, index: number): string | null {
    const isTool = (c: DialogueChoiceState) => c.decisionOptionId == null && c.requiredToolCode != null;
    const isDecision = (c: DialogueChoiceState) => c.decisionOptionId != null;
    const firstTool = d.choices.findIndex(isTool);
    const firstDecision = d.choices.findIndex(isDecision);
    if (firstTool < 0 || firstDecision < 0) return null;
    if (index === firstTool) return 'Usar una herramienta';
    if (index === firstDecision) return DRAFT_COPY.decisionLabel.text;
    return null;
  }

  /** Pista de teclado (solo se pinta con puntero fino); sin los atajos de una tecla no promete los números. */
  keyboardHint(d: DialogueState): string {
    const count = this.hasChoices(d) ? d.choices.length : 0;
    if (count === 0 || !this.shortcuts.enabled()) return 'Enter: continuar · Esc: volver al mapa';
    const range = count === 1 ? letraDe(0) : `${letraDe(0)} a ${letraDe(count - 1)}`;
    return `Enter: continuar · ${range}: elegir · Esc: volver al mapa`;
  }

  /** El sonido de la opción acompaña al foco de teclado; el puntero no lo dispara al pasar por encima. */
  onChoiceFocus(event: FocusEvent): void {
    let keyboardFocus = false;
    try {
      keyboardFocus = (event.target as HTMLElement | null)?.matches(':focus-visible') ?? false;
    } catch {
      keyboardFocus = false;
    }
    if (keyboardFocus) this.audio.playSfx('ui_select');
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    const d = this.dialogue();
    if (!d) return;
    // La cabecera conserva su propia activación: sin esto, Enter o Espacio sobre «Volver al mapa»
    // o «Salida segura» avanzarían el texto y el preventDefault cancelaría el clic nativo.
    if (e.key !== 'Escape' && (e.target as HTMLElement | null)?.closest?.('.panel-head')) return;
    let action = dialogueKeyAction(
      e.key,
      this.isTypingComplete(),
      this.isLastLine(),
      this.hasChoices(d) ? d.choices.length : 0,
      e.repeat,
    );
    // Los números de las opciones son atajos de una tecla (F6-10, WCAG 2.1.4): apagados, ni eligen ni se consumen.
    if (action === 'choose' && !this.shortcuts.enabled()) action = 'none';

    if (action === 'none') return;
    e.preventDefault();

    if (action === 'close') {
      this.close.emit();
    } else if (action === 'complete') {
      this.skipTypewriter();
    } else if (action === 'advance') {
      this.advanceLine();
    } else if (action === 'choose') {
      const idx = choiceIndex(e.key);
      if (idx !== null && idx < d.choices.length) this.handleChoice(d.choices[idx]);
    }
  }

  ngAfterViewChecked() {
    const strip = this.host.nativeElement.querySelector<HTMLDivElement>('.dialogue-strip');
    if (!strip) return;
    if (!this.isTypingComplete()) {
      // Solo mientras se escribe se ancla abajo, para que la línea nueva no se salga de la vista.
      strip.scrollTop = strip.scrollHeight;
      this.settled = false;
      return;
    }
    if (this.settled) return;
    this.settled = true;
    // Al terminar la línea: las opciones se revelan una sola vez y el resto del tiempo el
    // estudiante manda sobre el scroll; sin opciones se deja a la vista el botón de avance.
    if (this.choicesVisible()) this.revealChoices(strip);
    else strip.scrollTop = strip.scrollHeight;
  }

  /**
   * Muestra las opciones sin pelear con el scroll del estudiante. Si la lista cabe bajo la
   * cabecera fija se desplaza lo mínimo; si no, se alinea su inicio para que se vean la 1 y la 2
   * (y no el final de la lista) en pantallas bajas (TOUCH-01).
   */
  private revealChoices(strip: HTMLElement): void {
    const choices = strip.querySelector<HTMLElement>('.choices');
    if (!choices || typeof choices.scrollIntoView !== 'function') return;
    const headHeight = strip.querySelector<HTMLElement>('.panel-head')?.offsetHeight ?? 0;
    const fits = choices.offsetHeight <= strip.clientHeight - headHeight;
    // La alineación por el inicio deja libre la cabecera fija que hay ahora (con o sin la nota de seguimiento), no una
    // altura supuesta; sin medida (cabecera aún sin pintar) vale la del CSS.
    if (headHeight > 0) choices.style.scrollMarginTop = `${headHeight}px`;
    choices.scrollIntoView({ block: fits ? 'nearest' : 'start' });
    this.uncoverText(strip, choices);
  }

  /**
   * El desplazamiento que revela las opciones puede dejar la línea del personaje a medias bajo la cabecera fija
   * («Decisión» + nota de seguimiento): se sube lo justo para que se lea entera, con tope: las opciones 1 y 2 nunca
   * salen de la vista (TOUCH-01). Si no caben juntas con el texto, ganan las opciones y el texto queda a un gesto.
   */
  private uncoverText(strip: HTMLElement, choices: HTMLElement): void {
    const head = strip.querySelector<HTMLElement>('.panel-head');
    if (!head) return;
    const blocks = Array.from(strip.querySelectorAll<HTMLElement>('.speaker-name, .dialogue-text, .stale-note, .choices-notice'))
      .map(el => el.getBoundingClientRect());
    const buttons = choices.querySelectorAll<HTMLElement>('.choice-btn');
    const protect = buttons.item(Math.min(1, buttons.length - 1));
    const guard = protect ? { protect: protect.getBoundingClientRect(), viewBottom: strip.getBoundingClientRect().bottom } : undefined;
    const shift = scrollShiftToUncoverText(head.getBoundingClientRect().bottom, blocks, guard);
    if (shift !== 0) strip.scrollTop += shift;
  }

  ngOnDestroy() {
    this.stopTypewriter();
    if (this.confirmHandle !== null) clearTimeout(this.confirmHandle);
    this.focusRenderRef?.destroy();
  }

  /** Suelta la elección pendiente: las opciones vuelven a ser activables. */
  private releaseSelection(): void {
    if (this.confirmHandle !== null) {
      clearTimeout(this.confirmHandle);
      this.confirmHandle = null;
    }
    this.chosenKey.set(null);
  }

  /**
   * Clic sobre una opción. Un clic con `detail === 0` es una activación por teclado (o de lector de
   * pantalla): en el instante en que aparecen las opciones suele ser el Enter o el Espacio con que
   * se avanzaba el texto, no una elección. Se ignora en la ventana de guarda (DLG-03).
   */
  onChoiceClick(event: MouseEvent, choice: DialogueChoiceState): void {
    if (event.detail === 0 && Date.now() - this.choicesShownAt < CHOICE_ACTIVATION_GUARD_MS) return;
    this.handleChoice(choice);
  }

  handleChoice(choice: DialogueChoiceState) {
    if (this.chosenKey() !== null) return;   // ya hay una elección en curso
    if (choice.toolMissing) return;          // sin la herramienta no hay acción: la opción informa, no ejecuta
    this.chosenKey.set(choice.key);
    this.audio.playSfx('ui_confirm');
    // Pausa breve de confirmación: la card elegida se resalta antes de ejecutar.
    this.confirmHandle = setTimeout(() => {
      this.confirmHandle = null;
      if (choice.decisionOptionId != null) {
        this.execute.emit(choice.decisionOptionId);
      } else if (choice.requiredToolCode != null) {
        this.useTool.emit(choice.requiredToolCode);
      } else if (choice.key.startsWith('frontend:')) {
        this.frontendChoice.emit(choice.key);
      }
    }, 170);
  }

  advanceLine(): void {
    const d = this.dialogue();
    const nextIndex = nextDialogueLineIndex(d, this.lineIndex());
    if (!d || nextIndex === null) return;

    this.stopTypewriter();
    this.lineIndex.set(nextIndex);
    this.failedPortrait.set(null);
    this.audio.playSfx('ui_select');
    this.startTypewriter(d.lines[nextIndex]?.text ?? '');
  }

  /** Skip typewriter animation — shows the active intervention immediately. */
  skipTypewriter(): void {
    if (this.isTypingComplete()) return;
    this.stopTypewriter();
    this.displayedText.set(this.activeLine()?.text ?? '');
    this.isTypingComplete.set(true);
    this.requestDialogueFocus();
  }

  fullText(): string {
    return this.activeLine()?.text ?? '';
  }

  private startTypewriter(text: string) {
    this.settled = false;
    // `untracked`: el efecto del constructor llama aquí y no debe reiniciar el diálogo cuando cambia el interruptor.
    if (untracked(() => this.reduceMotion())) {
      this.displayedText.set(text);
      this.isTypingComplete.set(true);
      this.requestDialogueFocus();
      return;
    }
    this.displayedText.set('');
    this.isTypingComplete.set(false);
    this.requestDialogueFocus();
    // Ritmo de la línea (caso/ritmo-texto): 30 caracteres por segundo y una pausa breve en la puntuación.
    let pos = 0;
    const paso = () => {
      pos++;
      this.displayedText.set(text.slice(0, pos));
      if (pos >= text.length) {
        this.typewriterHandle = null;
        this.isTypingComplete.set(true);
        this.requestDialogueFocus();
        return;
      }
      this.typewriterHandle = setTimeout(paso, MS_POR_CARACTER + pausaTras(text[pos - 1], text[pos]));
    };
    this.typewriterHandle = setTimeout(paso, MS_POR_CARACTER);
  }

  private stopTypewriter() {
    if (this.typewriterHandle !== null) {
      clearTimeout(this.typewriterHandle);
      this.typewriterHandle = null;
    }
  }

  private requestDialogueFocus(): void {
    this.focusRenderRef?.destroy();
    this.focusRenderRef = afterNextRender({
      write: () => {
        this.focusRenderRef = null;
        const dialogueBox = this.host.nativeElement.querySelector<HTMLElement>('.dialogue-strip');
        // Con opciones visibles el foco entra al grupo, nunca a una opción: un Enter que avanzaba
        // el texto no puede acabar activando la primera decisión (DLG-03).
        const target = dialogueBox?.querySelector<HTMLElement>('.choices')
          ?? dialogueBox?.querySelector<HTMLElement>('.close-btn:not([disabled])');
        target?.focus();
      },
    }, { injector: this.injector });
  }
}
