import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { AfterRenderRef, AfterViewChecked, Component, ElementRef, HostListener, Injector, OnDestroy, afterNextRender, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
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
import { resolvePortraitAsset } from './portrait-resolver.util';

const CHARS_PER_SEC = 22;
const TYPEWRITER_INTERVAL_MS = Math.round(1000 / CHARS_PER_SEC); // ~45ms

@Component({
  selector: 'app-dialogue-panel',
  standalone: true,
  imports: [A11yModule, CommonModule],
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

        <div class="portrait" aria-hidden="true" [style.color]="emotionColor(activeEmotion(d))">
          @if (portraitSrc(d); as src) {
            <img class="portrait-img" [src]="src" alt="" width="96" height="96" (error)="onPortraitError(src)" />
          } @else {
            <svg viewBox="0 0 48 48" class="portrait-svg" width="40" height="40">
              <circle cx="24" cy="18" r="9" fill="currentColor"/>
              <path d="M8 44 C8 33 15 28 24 28 C33 28 40 33 40 44 Z" fill="currentColor"/>
            </svg>
          }
          @if (activeEmotion(d); as emotion) {
            @if (emotion !== 'neutral') {
              <span class="emotion-chip" [attr.data-emotion]="emotion"></span>
            }
          }
        </div>

        <!-- Text area -->
        <div class="strip-body">
          <p class="speaker-name">{{ activeSpeakerName(d) }}
            @if (emotionLabel(activeEmotion(d)); as em) {
              <span class="emotion-tag" [style.color]="emotionColor(activeEmotion(d))">{{ em }}</span>
            }
          </p>
          <p class="dialogue-text" aria-hidden="true">{{ displayedText() }}<span class="cursor" [class.cursor--done]="isTypingComplete()">▋</span></p>
          <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{{ fullText() }}</p>

          @if (choicesVisible()) {
            <div class="choices" role="group" aria-label="Opciones de intervención"
              [class.choices--locked]="chosenKey() !== null">
              @for (choice of d.choices; track choice.key; let i = $index) {
                <button
                  type="button"
                  class="choice-btn"
                  [class.choice-btn--chosen]="chosenKey() === choice.key"
                  [style.--stagger]="i"
                  [attr.aria-label]="(i + 1) + '. ' + choice.text + (choice.evidenceWarning ? ' (información incompleta)' : '')"
                  (mouseenter)="onChoiceHover()"
                  (click)="handleChoice(choice)">
                  <span class="choice-num" aria-hidden="true">{{ i + 1 }}</span>
                  <span class="choice-btn__icon" aria-hidden="true"></span>
                  <span class="choice-btn__body">
                    <span class="choice-btn__label">{{ choice.text }}</span>
                    @if (choice.evidenceWarning) {
                      <span class="choice-btn__meta choice-btn__meta--evidence">Información incompleta</span>
                    }
                  </span>
                </button>
              }
            </div>
          }

          @if (!isTypingComplete()) {
            <button type="button" class="close-btn psy-button psy-button--ghost"
              (click)="skipTypewriter()"
              aria-label="Saltar animación de texto">
              Saltar <span aria-hidden="true">▶</span>
            </button>
          }
          @if (isTypingComplete() && !isLastLine()) {
            <button type="button" class="close-btn psy-button psy-button--ghost"
              (click)="advanceLine()"
              aria-label="Mostrar siguiente intervención">
              Siguiente <span aria-hidden="true">▶</span>
            </button>
          }
          @if (isTypingComplete() && isLastLine() && !d.choices.length) {
            <button type="button" class="close-btn psy-button psy-button--ghost"
              (click)="close.emit()"
              aria-label="Cerrar diálogo (Esc)">
              Continuar <span aria-hidden="true">▶</span>
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .dialogue-strip {
      width: 100%;
      min-height: 180px;
      display: flex;
      align-items: flex-start;
      gap: 0;
      padding: 0;
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
    .choice-btn__meta {
      width: fit-content;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid currentColor;
      font-size: .66rem;
      font-weight: 900;
      letter-spacing: .06em;
      text-transform: uppercase;
      opacity: .85;
    }
    .choice-btn__meta--evidence {
      border-color: rgba(245,184,75,.6);
      color: #f5d49b;
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

  readonly close   = output<void>();
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
      if (d?.lines?.length) {
        this.audio.playSfx('ui_select');
        this.startTypewriter(d.lines[0].text);
      } else {
        this.displayedText.set('');
        this.isTypingComplete.set(true);
      }
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

  onChoiceHover(): void {
    this.audio.playSfx('ui_select');
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    const d = this.dialogue();
    if (!d) return;
    const action = dialogueKeyAction(
      e.key,
      this.isTypingComplete(),
      this.isLastLine(),
      d.choices.length,
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
    // Ensure dialogue box is scrolled to bottom when new text renders
    const el = this.host.nativeElement.querySelector<HTMLDivElement>('.dialogue-strip');
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  ngOnDestroy() {
    this.stopTypewriter();
    if (this.confirmHandle !== null) clearTimeout(this.confirmHandle);
    this.focusRenderRef?.destroy();
  }

  handleChoice(choice: DialogueChoiceState) {
    if (this.chosenKey() !== null) return;   // ya hay una elección en curso
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
        dialogueBox
          ?.querySelector<HTMLElement>('.choice-btn:not([disabled]), .close-btn:not([disabled])')
          ?.focus();
      },
    }, { injector: this.injector });
  }
}
