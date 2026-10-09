import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { AfterRenderRef, AfterViewChecked, Component, ElementRef, HostListener, Injector, OnDestroy, afterNextRender, computed, effect, inject, input, output, signal, untracked, ChangeDetectionStrategy } from '@angular/core';
import { DialogueChoiceState, DialogueState, MapObjectState } from '../../core/models/simulation.model';
import { KitService } from '../character/kit/kit.service';
import { AudioDirectorService } from './audio-director.service';
import { digitIndex } from './dialogue-keys.util';
import {
  activeDialogueLine,
  dialogueChoicesVisible,
  dialogueKeyAction,
  isFinalDialogueLine,
  nextDialogueLineIndex,
} from './dialogue-progression.util';
import { isSystemVoice, resolvePortraitAsset } from './portrait-resolver.util';
import { SafeExitButtonComponent } from './safe-exit-button.component';

const CHARS_PER_SEC = 22;
const TYPEWRITER_INTERVAL_MS = Math.round(1000 / CHARS_PER_SEC); // ~45ms
/** Ventana tras mostrar las opciones en la que se ignora un clic por teclado (Enter/Espacio mantenido). */
const CHOICE_ACTIVATION_GUARD_MS = 500;
/** Texto de la línea informativa de una conversación que pertenece a otra etapa. */
const STALE_NOTE = 'Esta conversación corresponde a otro momento del caso.';

@Component({
  selector: 'app-dialogue-panel',
  standalone: true,
  imports: [A11yModule, CommonModule, SafeExitButtonComponent],
  template: `
    @if (dialogue(); as d) {
      <div #dialogueBox
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        class="dialogue-strip"
        [class.dialogue-strip--side]="mode() === 'side'"
        [class.strip--warning]="interaction()?.type === 'WARNING'"
        [class.strip--supervisory]="activeSpeakerName(d) === 'Supervisión clínica'"
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
            <app-safe-exit-button class="panel-head__exit" data-hide-key (pause)="safeExit.emit()" />
          </div>
          @if (hasDecisionOptions(d)) {
            <p class="panel-head__note">
              <span class="panel-chip">Decisión clínica</span>
              <span>Tu elección queda registrada en tu seguimiento formativo.</span>
            </p>
          }
        </header>

        <div class="strip-main">
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
        </div>

        <!-- Text area -->
        <div class="strip-body">
          <p class="speaker-name">{{ activeSpeakerName(d) }}
            @if (showsEmotionCue(d) && emotionLabel(activeEmotion(d)); as em) {
              <span class="emotion-tag" [style.color]="emotionColor(activeEmotion(d))">{{ em }}</span>
            }
          </p>
          <p class="dialogue-text" aria-hidden="true">{{ displayedText() }}<span class="cursor" [class.cursor--done]="isTypingComplete()">▋</span></p>
          <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{{ fullText() }}</p>

          @if (staleNote(d); as note) {
            <p class="stale-note" role="note">{{ note }}</p>
          }

          @if (choicesVisible() && !d.stale) {
            @let notice = noticeText(d);
            @if (notice) {
              <p class="choices-notice" id="choices-notice" role="note">{{ notice }}</p>
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
                  [attr.aria-label]="(i + 1) + '. ' + choice.text"
                  [attr.aria-disabled]="choice.toolMissing ? 'true' : null"
                  [attr.aria-describedby]="choice.toolMissing ? 'choice-hint-' + i : null"
                  (focus)="onChoiceFocus($event)"
                  (click)="onChoiceClick($event, choice)">
                  <span class="choice-num" aria-hidden="true">{{ i + 1 }}</span>
                  <span class="choice-btn__icon" aria-hidden="true"></span>
                  <span class="choice-btn__body">
                    <span class="choice-btn__label">{{ choice.text }}</span>
                    @if (choice.toolMissing) {
                      <span class="choice-btn__hint" [id]="'choice-hint-' + i">Aún no tienes esta herramienta. Recógela en la sala.</span>
                    }
                  </span>
                </button>
              }
            </div>
          }

          @if (!isTypingComplete()) {
            <button type="button" class="close-btn psy-button psy-button--ghost" cdkFocusInitial
              (click)="skipTypewriter()"
              aria-label="Saltar animación de texto">
              Saltar <span aria-hidden="true">▶</span>
            </button>
          }
          @if (isTypingComplete() && !isLastLine()) {
            <button type="button" class="close-btn psy-button psy-button--ghost" cdkFocusInitial
              (click)="advanceLine()"
              aria-label="Mostrar siguiente intervención">
              Siguiente <span aria-hidden="true">▶</span>
            </button>
          }
          @if (isTypingComplete() && isLastLine() && !hasChoices(d)) {
            <button type="button" class="close-btn psy-button psy-button--ghost" cdkFocusInitial
              (click)="close.emit()">
              Continuar <span aria-hidden="true">▶</span>
            </button>
          }

          <p class="keyboard-hint">{{ keyboardHint(d) }}</p>
        </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .dialogue-strip {
      width: 100%;
      min-height: 180px;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0;
      padding: 0;
      max-height: 78vh;
      overflow-y: auto;
      background: rgba(8,12,18,.95);
      border-top: 2px solid rgba(182,156,255,.4);
      animation: strip-rise 160ms cubic-bezier(.2,.8,.2,1) both;
    }
    .strip--warning {
      border-top-color: rgba(168,80,98,.6);
    }
    .strip--supervisory {
      border-top-color: rgba(79,163,100,.6);
      background: rgba(8,14,10,.95);
    }

    .strip-main { display: flex; align-items: flex-start; flex: 1 1 auto; min-width: 0; }

    /* Cabecera fija del panel: «Volver al mapa» y «Salida segura» siempre a mano. */
    .panel-head {
      position: sticky;
      top: 0;
      z-index: 3;
      display: grid;
      gap: 4px;
      padding: 6px 12px;
      border-bottom: 1px solid rgba(182,156,255,.18);
      background: #080c12;
    }
    .panel-head__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .panel-head__note {
      margin: 0;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px 8px;
      font-size: .75rem;
      line-height: 1.35;
      color: rgba(232,240,244,.78);
    }
    .panel-chip {
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid rgba(182,156,255,.5);
      background: rgba(124,77,255,.16);
      color: #d6c6ff;
      font-size: .72rem;
      font-weight: 800;
      letter-spacing: .04em;
    }
    .panel-back {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      padding: 6px 14px;
      border: 1px solid rgba(182,156,255,.4);
      border-radius: 12px;
      background: rgba(124,77,255,.12);
      color: #e8f0f4;
      font: inherit;
      font-size: .8rem;
      font-weight: 800;
      cursor: pointer;
    }
    .panel-back:hover { border-color: rgba(182,156,255,.75); background: rgba(124,77,255,.22); }
    .panel-back:focus-visible { outline: 3px solid #C9B3FF; outline-offset: 2px; }
    .panel-back__arrow { font-size: .62rem; }

    .portrait {
      position: relative;
      flex-shrink: 0;
      width: 112px;
      min-height: 180px;
      display: grid;
      place-items: center;
      border-right: 1px solid rgba(182,156,255,.2);
      background: rgba(124,77,255,.08);
    }
    .portrait-svg {
      color: #B69CFF;
    }
    .portrait-img {
      width: 96px;
      height: 96px;
      image-rendering: pixelated;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,.35));
    }
    .emotion-chip {
      position: absolute;
      bottom: 12px;
      right: 12px;
      width: 10px;
      height: 10px;
      background: #B69CFF;
      border: 2px solid rgba(8,12,18,.92);
      border-radius: 50%;
    }

    .strip-body {
      flex: 1;
      padding: 16px 22px 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }
    .speaker-name {
      margin: 0;
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: .7rem;
      font-weight: 900;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: #B69CFF;
    }
    .strip--supervisory .speaker-name { color: #5d9278; }
    .strip--warning .speaker-name { color: #d9798e; }
    .emotion-tag {
      font-size: .6rem;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: lowercase;
      opacity: 1;
    }
    .emotion-tag::before { content: '· '; opacity: .6; }

    .dialogue-text {
      margin: 0;
      font-size: .97rem;
      line-height: 1.65;
      letter-spacing: .01em;
      color: rgba(232,240,244,.92);
      min-height: 1.6em;
      white-space: pre-line;
    }
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
    .cursor {
      display: inline-block;
      animation: blink .6s step-end infinite;
      color: #B69CFF;
      margin-left: 1px;
    }
    .cursor--done { display: none; }

    .choices {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      margin-top: 4px;
      /* Deja libre la cabecera fija cuando scrollIntoView alinea el inicio de la lista. */
      scroll-margin-top: 72px;
      outline: none;
    }
    .choice-btn {
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr);
      gap: 10px;
      align-items: start;
      min-height: 64px;
      padding: 11px 12px;
      border-radius: 14px;
      border: 1px solid rgba(182,156,255,.3);
      background: rgba(255,255,255,.06);
      color: rgba(232,240,244,.9);
      font: inherit;
      font-size: .82rem;
      line-height: 1.35;
      text-align: left;
      cursor: pointer;
      box-shadow: 0 14px 34px -22px rgba(124,77,255,.5);
      transition: border-color 150ms ease, background-color 150ms ease, opacity 150ms ease, transform 160ms var(--psy-ease-out);
    }
    @media (hover: hover) and (pointer: fine) {
      .choice-btn:hover {
        border-color: rgba(182,156,255,.7);
        background: rgba(124,77,255,.16);
      }
    }
    .choice-btn:active {
      transform: scale(.97);
    }
    .choice-btn:focus-visible {
      outline: 3px solid #C9B3FF;
      outline-offset: 3px;
    }
    /* Entrada escalonada de opciones (sutil, una sola vez). */
    .choice-btn {
      animation: choice-in 200ms var(--psy-ease-out) backwards;
      animation-delay: calc(var(--stagger, 0) * 45ms);
    }
    /* Confirmación: la card elegida se resalta y las demás ceden. */
    .choices--locked .choice-btn { pointer-events: none; }
    .choices--locked .choice-btn:not(.choice-btn--chosen) { opacity: .45; }
    .choice-btn--chosen {
      border-color: rgba(232,240,244,.85) !important;
      background: rgba(124,77,255,.3);
      animation: choice-confirm 170ms ease;
    }
    @keyframes choice-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes choice-confirm {
      0%   { transform: scale(1); }
      45%  { transform: scale(.985); }
      100% { transform: scale(1); }
    }
    .choice-num {
      display: grid; place-items: center; width: 22px; height: 22px; flex-shrink: 0;
      border-radius: 7px; border: 1px solid rgba(182,156,255,.5);
      background: rgba(124,77,255,.16); color: #cdbcff;
      font-family: 'JetBrains Mono', monospace; font-weight: 900; font-size: .76rem;
    }
    .choice-btn__icon {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 9px;
      background: rgba(124,77,255,.14);
      color: #cdbcff;
    }
    .choice-btn__icon::before {
      content: '';
      width: 10px;
      height: 10px;
      border: 2px solid currentColor;
      border-radius: 50%;
    }
    .choice-btn__body { display: grid; gap: 5px; min-width: 0; }
    .choice-btn__label { display: block; }
    .choice-btn__hint {
      width: fit-content;
      max-width: 100%;
      padding: 2px 8px;
      border-radius: 8px;
      border: 1px solid rgba(245,184,75,.6);
      color: #f5d49b;
      font-size: .75rem;
      font-weight: 700;
      line-height: 1.3;
    }
    .choice-btn--unavailable { cursor: not-allowed; opacity: .72; box-shadow: none; }
    .choice-btn--unavailable:active { transform: none; }
    /* Aviso único de evidencia sobre las opciones (nunca por opción): informa, no bloquea. */
    .choices-notice {
      margin: 0;
      padding: 8px 12px;
      border-left: 3px solid #f5b84b;
      border-radius: 6px;
      background: rgba(245,184,75,.1);
      color: #f5e3c0;
      font-size: .8rem;
      line-height: 1.45;
    }
    .choices-subtitle {
      grid-column: 1 / -1;
      margin: 4px 0 0;
      color: #cdbcff;
      font-size: .75rem;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .stale-note {
      margin: 0;
      padding: 8px 12px;
      border-left: 3px solid rgba(182,156,255,.6);
      border-radius: 6px;
      background: rgba(124,77,255,.1);
      color: rgba(232,240,244,.88);
      font-size: .82rem;
      line-height: 1.45;
    }
    /* La pista de teclado solo existe donde hay teclado y puntero fino. */
    .keyboard-hint { display: none; margin: 0; font-size: .75rem; color: rgba(232,240,244,.72); }
    @media (hover: hover) and (pointer: fine) {
      .keyboard-hint { display: block; }
    }
    .close-btn {
      align-self: flex-end;
      font-size: .88rem;
      padding: 9px 20px;
      min-height: 42px;
      cursor: pointer;
    }

    @keyframes strip-rise {
      from { transform: translateY(100%); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0; }
    }
    /* ── Modo lateral (panel derecho del HUD redesign) ──────────────────── */
    .dialogue-strip--side {
      flex-direction: column;
      min-height: 0;
      height: 100%;
      border-top: none;
      background: transparent;
      backdrop-filter: none;
      animation: none;
      overflow-y: auto;
    }
    .dialogue-strip--side .strip-main { flex-direction: column; align-items: stretch; flex: 0 0 auto; }
    .dialogue-strip--side .panel-head { background: #121a2b; }
    .dialogue-strip--side .portrait {
      flex-direction: row;
      width: 100%;
      min-height: 0;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      justify-content: flex-start;
      border-right: none;
      border-bottom: 1px solid rgba(182,156,255,.18);
    }
    .dialogue-strip--side .portrait-svg { width: 30px; height: 30px; }
    .dialogue-strip--side .portrait-img { width: 96px; height: 96px; }
    .dialogue-strip--side .emotion-chip { position: static; }
    .dialogue-strip--side .strip-body {
      padding: 12px 16px 16px;
      gap: 10px;
    }
    .dialogue-strip--side .dialogue-text { font-size: .88rem; line-height: 1.55; }
    .dialogue-strip--side .choices { grid-template-columns: minmax(0, 1fr); }
    .dialogue-strip--side .choice-btn { min-height: 56px; }

    /* Pantallas bajas (844x390 táctil): todo más denso y las opciones a la vista. */
    @media (max-height: 520px) {
      .dialogue-strip { min-height: 0; }
      .portrait { min-height: 0; }
      .panel-head { padding: 0 10px; }
      .panel-head__note { display: none; }
      .choices { scroll-margin-top: 52px; gap: 8px; }
      .strip-body { padding: 8px 14px 10px; gap: 8px; }
      .dialogue-text { font-size: .86rem; line-height: 1.45; }
      .dialogue-strip--side .portrait { padding: 6px 12px; }
      .dialogue-strip--side .portrait-img { width: 64px; height: 64px; }
      .dialogue-strip--side .strip-body { padding: 8px 12px 12px; gap: 8px; }
      .dialogue-strip--side .choice-btn { min-height: 44px; padding: 6px 10px; gap: 8px; }
      .dialogue-strip--side .choice-btn__icon { display: none; }
      .dialogue-strip--side .choice-btn { grid-template-columns: auto minmax(0, 1fr); }
    }
    @media (max-width: 560px) {
      .portrait { width: 104px; min-height: 180px; }
      .dialogue-strip--side .portrait { width: 100%; min-height: 0; }
      .strip-body { padding: 12px 14px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .dialogue-strip { animation: none; }
      .cursor { animation: none; }
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
  readonly releaseToken = input(0);

  readonly close   = output<void>();
  /** Pausa reanudable pedida desde el panel (REGLA-004): el anfitrión llama a la salida segura real. */
  readonly safeExit = output<void>();
  readonly execute = output<number>();
  readonly useTool = output<string>();
  readonly frontendChoice = output<string>();

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
  /** Retrato cuya carga falló: cae a la silueta SVG (spike de retratos NPC). */
  private readonly failedPortrait = signal<string | null>(null);

  private typewriterHandle: ReturnType<typeof setInterval> | null = null;
  private confirmHandle: ReturnType<typeof setTimeout> | null = null;
  /** Instante en que aparecieron las opciones: base de la guarda contra la decisión accidental. */
  private choicesShownAt = 0;
  /** La vista ya se asentó para la línea en curso (ancla abajo o opciones reveladas, una sola vez). */
  private settled = false;
  private focusRenderRef: AfterRenderRef | null = null;
  private readonly audio = inject(AudioDirectorService);
  private readonly kit = inject(KitService);
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

  /** Alguna opción activa registra una decisión clínica (cabecera con el chip «Decisión clínica»). */
  hasDecisionOptions(d: DialogueState): boolean {
    return !d.stale && d.choices.some(choice => choice.decisionOptionId != null);
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
    if (index === firstDecision) return 'Decisión clínica';
    return null;
  }

  /** Pista de teclado (solo se pinta con puntero fino). */
  keyboardHint(d: DialogueState): string {
    const count = this.hasChoices(d) ? d.choices.length : 0;
    if (count === 0) return 'Enter: continuar · Esc: volver al mapa';
    const range = count === 1 ? '1' : `1 a ${count}`;
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
    const action = dialogueKeyAction(
      e.key,
      this.isTypingComplete(),
      this.isLastLine(),
      this.hasChoices(d) ? d.choices.length : 0,
      e.repeat,
    );

    if (action === 'none') return;
    e.preventDefault();

    if (action === 'close') {
      this.close.emit();
    } else if (action === 'complete') {
      this.skipTypewriter();
    } else if (action === 'advance') {
      this.advanceLine();
    } else if (action === 'choose') {
      const idx = digitIndex(e.key);
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
    choices.scrollIntoView({ block: fits ? 'nearest' : 'start' });
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
    let pos = 0;
    this.typewriterHandle = setInterval(() => {
      pos++;
      this.displayedText.set(text.slice(0, pos));
      if (pos >= text.length) {
        this.stopTypewriter();
        this.isTypingComplete.set(true);
        this.requestDialogueFocus();
      }
    }, TYPEWRITER_INTERVAL_MS);
  }

  private stopTypewriter() {
    if (this.typewriterHandle !== null) {
      clearInterval(this.typewriterHandle);
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
