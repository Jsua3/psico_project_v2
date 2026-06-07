import { CommonModule, NgClass, NgStyle } from '@angular/common';
import { AfterViewChecked, Component, ElementRef, HostListener, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, computed, effect, inject, input, output, signal } from '@angular/core';
import { DialogueChoiceState, DialogueState, MapObjectState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { digitIndex } from './dialogue-keys.util';

// ─── Emotion system ───────────────────────────────────────────────────────────

export type DialogueEmotion =
  | 'neutral' | 'ansiedad' | 'tristeza' | 'enojo'
  | 'disociacion' | 'crisis' | 'alivio' | 'esperanza';

interface EmotionStyle {
  typingSpeed: number;  // ms per character
  color: string;
  wobble: boolean;
  glitch: boolean;
  fontSize: string;
  opacity: number;
}

const EMOTION_STYLES: Record<DialogueEmotion, EmotionStyle> = {
  neutral:     { typingSpeed: 30,  color: '#F4F7FB', wobble: false, glitch: false, fontSize: '14px', opacity: 1   },
  ansiedad:    { typingSpeed: 15,  color: '#F5B84B', wobble: true,  glitch: false, fontSize: '14px', opacity: 1   },
  tristeza:    { typingSpeed: 55,  color: '#8899BB', wobble: false, glitch: false, fontSize: '14px', opacity: 0.9 },
  enojo:       { typingSpeed: 10,  color: '#E25A4F', wobble: true,  glitch: false, fontSize: '15px', opacity: 1   },
  disociacion: { typingSpeed: 40,  color: '#9988BB', wobble: false, glitch: true,  fontSize: '13px', opacity: 0.7 },
  crisis:      { typingSpeed: 8,   color: '#E25A4F', wobble: true,  glitch: true,  fontSize: '15px', opacity: 1   },
  alivio:      { typingSpeed: 35,  color: '#6EC67A', wobble: false, glitch: false, fontSize: '14px', opacity: 1   },
  esperanza:   { typingSpeed: 32,  color: '#B69CFF', wobble: false, glitch: false, fontSize: '14px', opacity: 1   },
};

const GLITCH_CHARS = '!@#$%^&*<>?/\\|[]{}~`';
const GLITCH_PROBABILITY = 0.05; // 5% chance per char reveal

/** Resolve an arbitrary emotion string from the backend to a known DialogueEmotion. */
function resolveEmotion(raw: string | null | undefined): DialogueEmotion {
  if (!raw) return 'neutral';
  const lower = raw.toLowerCase().trim() as DialogueEmotion;
  return lower in EMOTION_STYLES ? lower : 'neutral';
}

// ─── QTE interruption config ──────────────────────────────────────────────────

export interface InterruptionConfig {
  prompt: string;
  timeoutMs: number;
  onSuccess: () => void;
  onTimeout: () => void;
}

// ─── Portrait layout constants ────────────────────────────────────────────────

const PORTRAIT_W = 64;
const PORTRAIT_H = 80;
const EMOTION_TO_COL: Record<DialogueEmotion, number> = {
  neutral: 0, alivio: 1, esperanza: 1,
  tristeza: 2, enojo: 2,
  ansiedad: 3, disociacion: 3,
  crisis: 4,
};

@Component({
  selector: 'app-dialogue-panel',
  standalone: true,
  imports: [CommonModule, NgStyle, NgClass],
  template: `
    @if (dialogue(); as d) {
      <div #dialogueBox
        class="dialogue-strip"
        [class.strip--warning]="interaction()?.type === 'WARNING'"
        [class.strip--supervisory]="d.speakerName === 'Supervisión clínica'"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="d.speakerName + ': ' + fullText()"
        (click)="onPanelClick()"
        (keydown.enter)="onPanelClick()">

        <!-- QTE Interruption banner -->
        @if (showInterruption()) {
          <div class="interruption-banner" role="alert" aria-live="assertive">
            <span>{{ interruptionConfig?.prompt }}</span>
            <div class="countdown-bar" [style.width.%]="interruptionProgress()"></div>
          </div>
        }

        <div class="portrait" aria-hidden="true">
          <!-- NPC portrait sprite — shows when portraitSrc is set -->
          @if (portraitSrc()) {
            <div class="npc-portrait" [ngStyle]="portraitStyle()"></div>
          } @else {
            <svg viewBox="0 0 48 48" class="portrait-svg" width="40" height="40">
              <circle cx="24" cy="18" r="9" fill="currentColor"/>
              <path d="M8 44 C8 33 15 28 24 28 C33 28 40 33 40 44 Z" fill="currentColor"/>
            </svg>
          }
          @if (d.emotion && d.emotion !== 'neutral') {
            <span class="emotion-chip" [attr.data-emotion]="d.emotion"></span>
          }
        </div>

        <!-- Text area -->
        <div class="strip-body">
          <p class="speaker-name">{{ d.speakerName }}</p>
          <p class="dialogue-text"
             [ngClass]="{ wobble: dialogueTextStyle().wobble, glitch: dialogueTextStyle().glitch }"
             [ngStyle]="{
               color: dialogueTextStyle().color,
               fontSize: dialogueTextStyle().fontSize,
               opacity: dialogueTextStyle().opacity
             }"
             role="status" aria-live="polite" aria-atomic="true">{{ displayedText() }}<span class="cursor" [class.cursor--done]="isTypingComplete()" aria-hidden="true">▋</span></p>

          @if (isTypingComplete() && d.choices.length) {
            <div class="choices" role="group" aria-label="Opciones de intervención">
              @for (choice of d.choices; track choice.key; let i = $index) {
                <button
                  type="button"
                  class="choice-btn"
                  [class.choice-btn--recommended]="choice.isRecommended"
                  [class.choice-btn--prohibited]="choice.isProhibited"
                  [attr.aria-label]="(i + 1) + '. ' + choice.text + (choice.isRecommended ? ' (recomendada)' : '') + (choice.isProhibited ? ' (contraindicada)' : '')"
                  (mouseenter)="onChoiceHover()"
                  (click)="handleChoice(choice)">
                  <span class="choice-num" aria-hidden="true">{{ i + 1 }}</span>
                  <span class="choice-btn__icon" aria-hidden="true"></span>
                  <span class="choice-btn__body">
                    <span class="choice-btn__label">{{ choice.text }}</span>
                    @if (choice.isRecommended) {
                      <span class="choice-btn__meta">Recomendada</span>
                    }
                    @if (choice.isProhibited) {
                      <span class="choice-btn__meta">Contraindicada</span>
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
          @if (isTypingComplete() && !d.choices.length) {
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
      flex-direction: column;
      align-items: stretch;
      gap: 0;
      padding: 0;
      background: rgba(8,12,18,.95);
      border-top: 2px solid rgba(182,156,255,.4);
      backdrop-filter: blur(16px) saturate(110%);
      animation: strip-rise 160ms cubic-bezier(.2,.8,.2,1) both;
    }

    /* Inner row containing portrait + body */
    .dialogue-strip > :not(.interruption-banner) {
      display: contents;
    }
    /* Override: make portrait + strip-body appear side-by-side below the banner */
    .portrait, .strip-body {
      display: flex;
    }
    .dialogue-strip {
      flex-direction: column;
    }

    .strip--warning {
      border-top-color: rgba(168,80,98,.6);
    }
    .strip--supervisory {
      border-top-color: rgba(79,163,100,.6);
      background: rgba(8,14,10,.95);
    }

    /* QTE Banner */
    .interruption-banner {
      background: rgba(226, 90, 79, 0.9);
      border-radius: 4px;
      padding: 8px 12px;
      margin: 8px 8px 0;
      font-weight: bold;
      color: white;
      font-size: .85rem;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .countdown-bar {
      height: 3px;
      background: white;
      transition: width 100ms linear;
      border-radius: 2px;
    }

    /* Re-establish side-by-side layout for portrait + body */
    .portrait {
      flex-shrink: 0;
      width: 88px;
      min-height: 160px;
      display: grid;
      place-items: center;
      border-right: 1px solid rgba(182,156,255,.2);
      background: rgba(124,77,255,.08);
      position: relative;
      align-self: stretch;
    }

    /* Wrap portrait + body in a flex row at the strip level */
    .dialogue-strip {
      display: flex;
      flex-direction: column;
    }
    /* The content row (portrait + body) */
    .dialogue-content-row {
      display: flex;
      flex-direction: row;
    }

    .portrait-svg {
      color: #B69CFF;
    }
    .npc-portrait {
      image-rendering: pixelated;
      flex-shrink: 0;
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
      font-size: .7rem;
      font-weight: 900;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: #B69CFF;
    }
    .strip--supervisory .speaker-name { color: #5d9278; }
    .strip--warning .speaker-name { color: #a85062; }

    .dialogue-text {
      margin: 0;
      font-size: .97rem;
      line-height: 1.6;
      color: rgba(232,240,244,.92);
      min-height: 1.6em;
      white-space: pre-line;
      transition: color 200ms ease, opacity 200ms ease;
    }

    /* Wobble animation */
    .dialogue-text.wobble {
      animation: wobble 0.3s infinite;
    }
    @keyframes wobble {
      0%, 100% { transform: translateX(0); }
      50%       { transform: translateX(2px); }
    }

    /* Glitch animation */
    .dialogue-text.glitch {
      animation: glitch-text 0.1s steps(2) infinite;
    }
    @keyframes glitch-text {
      0%   { clip-path: inset(0 0 95% 0); transform: translate(-1px, 0); }
      100% { clip-path: inset(90% 0 0 0);  transform: translate(1px, 0); }
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
      transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
    }
    .choice-btn:hover {
      transform: translateY(-1px);
      border-color: rgba(182,156,255,.7);
      background: rgba(124,77,255,.16);
    }
    .choice-btn:focus-visible {
      outline: 3px solid rgba(182,156,255,.5);
      outline-offset: 3px;
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
    .choice-btn--recommended .choice-btn__icon::before {
      width: 12px;
      height: 7px;
      border-top: 0;
      border-right: 0;
      border-radius: 0;
      transform: rotate(-45deg);
    }
    .choice-btn--prohibited .choice-btn__icon::before {
      content: '!';
      width: auto;
      height: auto;
      border: 0;
      font-weight: 900;
      line-height: 1;
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
    .choice-btn--recommended {
      border-color: rgba(108,192,199,.5);
      background: rgba(108,192,199,.12);
      color: #bfeef1;
    }
    .choice-btn--recommended:hover { border-color: rgba(108,192,199,.85); background: rgba(108,192,199,.2); }
    .choice-btn--prohibited {
      border-color: rgba(168,80,98,.45);
      background: rgba(168,80,98,.08);
      color: rgba(252,165,165,.88);
    }
    .choice-btn--prohibited:hover { border-color: rgba(168,80,98,.7); }

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
    @media (max-width: 560px) {
      .portrait { width: 60px; min-height: 180px; }
      .strip-body { padding: 12px 14px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .dialogue-strip { animation: none; }
      .cursor { animation: none; }
      .dialogue-text.wobble { animation: none; }
      .dialogue-text.glitch { animation: none; }
    }
  `]
})
export class DialoguePanelComponent implements AfterViewChecked, OnDestroy, OnChanges {
  readonly dialogue    = input<DialogueState | null>(null);
  readonly interaction = input<MapObjectState | null>(null);

  readonly close   = output<void>();
  readonly execute = output<number>();
  readonly useTool = output<string>();
  readonly frontendChoice = output<string>();

  /** Optional portrait sprite sheet URL. If empty the SVG placeholder is shown. */
  @Input() portraitSrc = signal<string>('');

  /** Optional QTE interruption config. Set to trigger countdown banner. */
  @Input() interruptionConfig?: InterruptionConfig;

  @ViewChild('dialogueBox') private dialogueBox?: ElementRef<HTMLDivElement>;

  readonly displayedText    = signal('');
  readonly isTypingComplete = signal(false);

  // ─── Emotion state ────────────────────────────────────────────────────────
  readonly currentEmotion = signal<DialogueEmotion>('neutral');
  readonly dialogueTextStyle = signal<{
    color: string; fontSize: string; opacity: number; wobble: boolean; glitch: boolean;
  }>({ color: '#F4F7FB', fontSize: '14px', opacity: 1, wobble: false, glitch: false });

  // ─── QTE state ────────────────────────────────────────────────────────────
  readonly showInterruption    = signal(false);
  readonly interruptionProgress = signal(100);

  private typewriterHandle: ReturnType<typeof setTimeout> | null = null;
  private abortTypewriter = false;
  private countdownHandle: ReturnType<typeof setInterval> | null = null;
  private currentLineIndex = 0;
  private readonly audio = inject(AudioDirectorService);

  /** Memoized portrait style — recomputes only when emotion or portraitSrc changes. */
  readonly portraitStyle = computed(() => {
    const emotion = this.currentEmotion();
    const col = EMOTION_TO_COL[emotion] ?? 0;
    return {
      'background-position': `-${col * PORTRAIT_W}px 0px`,
      'width':  `${PORTRAIT_W}px`,
      'height': `${PORTRAIT_H}px`,
      'background-image':  this.portraitSrc() ? `url(${this.portraitSrc()})` : 'none',
      'background-repeat': 'no-repeat',
    };
  });

  constructor() {
    effect(() => {
      const d = this.dialogue();
      this.stopTypewriter();
      this.currentLineIndex = 0;
      if (d?.lines?.length) {
        this.audio.playSfx('ui_select');
        // Determine initial emotion from dialogue header
        const emotion = resolveEmotion(d.emotion);
        this.applyEmotion(emotion);
        const fullText = d.lines.map(l => l.text).join('\n');
        this.startTypewriter(fullText, emotion);
      } else {
        this.displayedText.set('');
        this.isTypingComplete.set(true);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['interruptionConfig'] && this.interruptionConfig) {
      this.startInterruptionCountdown();
    }
  }

  onChoiceHover(): void {
    this.audio.playSfx('ui_select');
  }

  /** Click anywhere on panel = respond to QTE (if active), otherwise no-op. */
  onPanelClick(): void {
    if (this.showInterruption() && this.interruptionConfig) {
      this.resolveInterruption('success');
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    const d = this.dialogue();
    if (!d) return;

    // Escape: safe exit (REGLA-004 — always reachable via keyboard)
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close.emit();
      return;
    }

    // Space or Enter: skip typewriter animation when still typing
    // Also resolves QTE if active
    if ((e.key === ' ' || e.key === 'Enter') && !this.isTypingComplete()) {
      e.preventDefault();
      if (this.showInterruption() && this.interruptionConfig) {
        this.resolveInterruption('success');
      } else {
        this.skipTypewriter();
      }
      return;
    }

    // Enter while typing complete + QTE active
    if (e.key === 'Enter' && this.showInterruption() && this.interruptionConfig) {
      e.preventDefault();
      this.resolveInterruption('success');
      return;
    }

    if (!this.isTypingComplete()) return;

    // Digit keys: select choice by number
    if (d.choices.length) {
      const idx = digitIndex(e.key);
      if (idx !== null && idx < d.choices.length) {
        e.preventDefault();
        this.handleChoice(d.choices[idx]);
      }
    }
  }

  ngAfterViewChecked() {
    // Ensure dialogue box is scrolled to bottom when new text renders
    if (this.dialogueBox) {
      const el = this.dialogueBox.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  ngOnDestroy() {
    this.stopTypewriter();
    this.stopCountdown();
  }

  handleChoice(choice: DialogueChoiceState) {
    this.audio.playSfx(choice.isProhibited ? 'ui_cancel' : 'ui_confirm');
    if (choice.decisionOptionId != null) {
      this.execute.emit(choice.decisionOptionId);
    } else if (choice.requiredToolCode != null) {
      this.useTool.emit(choice.requiredToolCode);
    } else if (choice.key.startsWith('frontend:')) {
      this.frontendChoice.emit(choice.key);
    }
  }

  /** Skip typewriter animation — shows full text immediately. */
  skipTypewriter(): void {
    if (this.isTypingComplete()) return;
    this.stopTypewriter();
    const d = this.dialogue();
    if (d?.lines?.length) {
      this.displayedText.set(d.lines.map(l => l.text).join('\n'));
    }
    this.isTypingComplete.set(true);
  }

  fullText(): string {
    return this.dialogue()?.lines?.map(l => l.text).join(' ') ?? '';
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private applyEmotion(emotion: DialogueEmotion): void {
    this.currentEmotion.set(emotion);
    const style = EMOTION_STYLES[emotion];
    this.dialogueTextStyle.set({
      color:    style.color,
      fontSize: style.fontSize,
      opacity:  style.opacity,
      wobble:   style.wobble,
      glitch:   style.glitch,
    });
  }

  /**
   * Adaptive typewriter: uses setTimeout chain so each character can have
   * a different delay (based on emotion speed), and supports 5% glitch effect.
   */
  private startTypewriter(text: string, emotion: DialogueEmotion): void {
    this.abortTypewriter = false;
    this.displayedText.set('');
    this.isTypingComplete.set(false);
    let pos = 0;

    // Capture style ONCE — emotion is fixed for the lifetime of this typewriter run
    const style = EMOTION_STYLES[emotion];

    const tick = () => {
      if (this.abortTypewriter) return; // early exit if stopped externally
      pos++;

      // Glitch effect: 5% chance to briefly show a random char, then correct itself
      if (style.glitch && Math.random() < GLITCH_PROBABILITY && pos < text.length) {
        const randomChar = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        this.displayedText.set(text.slice(0, pos - 1) + randomChar);
        // Correct the glitch after 60ms
        this.typewriterHandle = setTimeout(() => {
          if (this.abortTypewriter) return;
          this.displayedText.set(text.slice(0, pos));
          if (pos >= text.length) {
            this.isTypingComplete.set(true);
            this.typewriterHandle = null;
          } else {
            this.typewriterHandle = setTimeout(tick, style.typingSpeed);
          }
        }, 60);
      } else {
        this.displayedText.set(text.slice(0, pos));
        if (pos >= text.length) {
          this.isTypingComplete.set(true);
          this.typewriterHandle = null;
        } else {
          this.typewriterHandle = setTimeout(tick, style.typingSpeed);
        }
      }
    };

    this.typewriterHandle = setTimeout(tick, style.typingSpeed);
  }

  private stopTypewriter() {
    this.abortTypewriter = true;
    if (this.typewriterHandle !== null) {
      clearTimeout(this.typewriterHandle);
      this.typewriterHandle = null;
    }
  }

  // ─── QTE countdown ─────────────────────────────────────────────────────────

  private startInterruptionCountdown(): void {
    if (!this.interruptionConfig) return;
    this.stopCountdown();
    this.showInterruption.set(true);
    this.interruptionProgress.set(100);

    const totalMs = this.interruptionConfig.timeoutMs;
    const tickMs  = 100;
    const steps   = totalMs / tickMs;
    const decrementPerTick = 100 / steps;
    let current = 100;

    this.countdownHandle = setInterval(() => {
      current -= decrementPerTick;
      this.interruptionProgress.set(Math.max(0, current));
      if (current <= 0) {
        this.resolveInterruption('timeout');
      }
    }, tickMs);
  }

  private resolveInterruption(result: 'success' | 'timeout'): void {
    this.stopCountdown();
    this.showInterruption.set(false);
    if (!this.interruptionConfig) return;
    if (result === 'success') {
      this.interruptionConfig.onSuccess();
    } else {
      this.interruptionConfig.onTimeout();
    }
  }

  private stopCountdown(): void {
    if (this.countdownHandle !== null) {
      clearInterval(this.countdownHandle);
      this.countdownHandle = null;
    }
  }
}
