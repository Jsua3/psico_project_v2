import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AudioDirectorService } from './audio-director.service';

export type JournalSaveState = 'idle' | 'saving' | 'saved' | 'error';

@Component({
  selector: 'app-journal-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  host: { '[class.journal-open]': 'open()' },
  template: `
    <div class="journal-sheet"
      [class.journal-sheet--open]="open()"
      role="dialog"
      [attr.aria-modal]="open()"
      [attr.aria-hidden]="!open()"
      aria-labelledby="journal-heading">

      <div class="sheet-header">
        <mat-icon aria-hidden="true">menu_book</mat-icon>
        <h3 id="journal-heading">Bitácora reflexiva</h3>
        <button class="sheet-close" type="button" aria-label="Cerrar bitácora" (click)="onCloseClick()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <p class="psy-eyebrow sheet-sub">Razonamiento ético y formativo</p>

      <ul class="guided-prompts" aria-label="Preguntas guía">
        @for (prompt of prompts(); track prompt) {
          <li>{{ prompt }}</li>
        }
      </ul>

      <textarea
        [(ngModel)]="text"
        [disabled]="disabled() || saveState() === 'saving'"
        placeholder="Registra señales observadas, hipótesis de riesgo, ruta ética y decisión profesional."
        aria-labelledby="journal-heading"
        aria-describedby="encrypt-note journal-status">
      </textarea>

      <button class="psy-button psy-button--primary" type="button"
        (click)="save.emit(text)"
        [disabled]="!text.trim() || disabled() || saveState() === 'saving'">
        <mat-icon aria-hidden="true">{{ saveState() === 'saving' ? 'hourglass_top' : 'encrypted' }}</mat-icon>
        {{ saveState() === 'saving' ? 'Guardando…' : 'Guardar bitácora' }}
      </button>

      @if (message()) {
        <p id="journal-status" class="journal-message"
          [class.journal-message--error]="saveState() === 'error'"
          [class.journal-message--saved]="saveState() === 'saved'"
          role="status" aria-live="polite">{{ message() }}</p>
      }

      @if (visitedStages().length) {
        <div class="journal-trazabilidad">
          <p class="journal-section-label">
            <mat-icon aria-hidden="true">route</mat-icon>
            Trazabilidad del caso
          </p>
          <ol class="journal-stages">
            @for (stage of visitedStages(); track stage; let i = $index) {
              <li><span class="stage-num">{{ i + 1 }}</span>{{ stage }}</li>
            }
          </ol>
        </div>
      }

      @if (supportResources().length) {
        <div class="journal-resources">
          <p class="journal-section-label">
            <mat-icon aria-hidden="true">support_agent</mat-icon>
            Recursos de apoyo profesional
          </p>
          <ul class="journal-res-list">
            @for (res of supportResources(); track res) {
              <li>{{ res }}</li>
            }
          </ul>
        </div>
      }

      <p class="encrypt-note" id="encrypt-note">
        <mat-icon aria-hidden="true">lock</mat-icon>
        Las bitácoras se cifran con AES-GCM antes de guardarse.
      </p>

      <button class="psy-button psy-button--ghost journal-continue" type="button"
        (click)="onCloseClick()">
        Continuar simulación
      </button>
    </div>
  `,
  styles: [`
    :host {
      display: grid;
      place-items: center;
      background: transparent;
      pointer-events: none;
      transition: background 200ms ease;
    }
    :host(.journal-open) {
      pointer-events: auto;
      background: rgba(8,12,18,.72);
      backdrop-filter: blur(4px);
    }
    .journal-sheet {
      width: min(720px, 92vw);
      max-height: 88vh;
      overflow-y: auto;
      border-radius: 20px;
      transform: scale(.95) translateY(10px);
      opacity: 0;
      transition: transform 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms ease;
      pointer-events: none;
      display: grid;
      grid-template-rows: auto auto auto minmax(80px, 1fr) auto auto auto auto auto auto;
      gap: 14px;
      padding: 24px;
      background: rgba(8,12,18,.94);
      backdrop-filter: blur(20px) saturate(110%);
      border: 1px solid rgba(79,163,165,.22);
      color: #e8f0f4;
      box-shadow: 0 24px 64px -24px rgba(0,0,0,.7);
    }
    .journal-sheet--open {
      transform: scale(1) translateY(0);
      opacity: 1;
      pointer-events: auto;
    }
    .sheet-header { display: flex; align-items: center; gap: 10px; }
    .sheet-header mat-icon:first-child { color: #4fa3a5; flex-shrink: 0; }
    .sheet-header h3 {
      margin: 0; flex: 1;
      font-family: 'Poppins', system-ui, sans-serif;
      font-size: 1.1rem; color: rgba(232,240,244,.95);
    }
    .sheet-close {
      width: 36px; height: 36px; display: grid; place-items: center;
      border: 1px solid rgba(255,255,255,.1); border-radius: 8px;
      background: rgba(255,255,255,.05); color: rgba(232,240,244,.5); cursor: pointer;
    }
    .psy-eyebrow.sheet-sub { color: rgba(79,163,165,.75); margin: 0; }
    .guided-prompts {
      margin: 0; padding-left: 18px; display: grid; gap: 6px;
      color: rgba(232,240,244,.55); font-size: .78rem; line-height: 1.45;
    }
    textarea {
      width: 100%; min-height: 130px; resize: vertical; padding: 14px;
      border: 1px solid rgba(79,163,165,.2); border-radius: 12px;
      background: rgba(255,255,255,.04); color: #e8f0f4;
      font: inherit; line-height: 1.55; outline: none; box-sizing: border-box;
    }
    textarea:focus { border-color: rgba(79,163,165,.5); box-shadow: 0 0 0 3px rgba(79,163,165,.1); }
    textarea:disabled { opacity: .4; cursor: not-allowed; }
    .psy-button {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      min-height: 44px; padding: 10px 16px; border-radius: 12px;
      font-weight: 700; cursor: pointer; font: inherit; border: none;
    }
    .psy-button--primary {
      background: rgba(124,77,255,.9); border: 1px solid rgba(124,77,255,.6); color: #fff;
    }
    .psy-button--primary:disabled { opacity: .35; cursor: not-allowed; }
    .psy-button--ghost {
      background: transparent; border: 1px solid rgba(182,156,255,.3); color: #B69CFF;
    }
    .psy-button--primary mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .journal-message { margin: 0; font-weight: 800; font-size: .88rem; color: #5d9278; }
    .journal-message--error { color: #c97a86; }
    .journal-message--saved { color: #5d9278; }
    .journal-trazabilidad,
    .journal-resources {
      padding: 12px 14px;
      border: 1px solid rgba(79,163,165,.15);
      border-radius: 14px;
      background: rgba(79,163,165,.05);
    }
    .journal-section-label {
      display: flex; align-items: center; gap: 6px; margin: 0 0 10px;
      font-size: .72rem; font-weight: 900; letter-spacing: .07em; text-transform: uppercase;
      color: rgba(79,163,165,.8);
    }
    .journal-section-label mat-icon { font-size: 15px; width: 15px; height: 15px; }
    .journal-stages { margin: 0; padding-left: 0; list-style: none; display: grid; gap: 6px; }
    .journal-stages li {
      display: flex; align-items: baseline; gap: 8px;
      font-size: .8rem; color: rgba(232,240,244,.65); line-height: 1.4;
    }
    .stage-num {
      min-width: 18px; flex-shrink: 0;
      font-family: 'JetBrains Mono', monospace; font-weight: 900;
      font-size: .68rem; color: rgba(79,163,165,.7);
    }
    .journal-res-list { margin: 0; padding-left: 16px; display: grid; gap: 5px; }
    .journal-res-list li { font-size: .8rem; color: rgba(232,240,244,.6); line-height: 1.4; }
    .encrypt-note {
      display: flex; gap: 8px; align-items: center;
      margin: 0; font-size: .7rem; color: rgba(232,240,244,.25);
      border-top: 1px solid rgba(255,255,255,.06); padding-top: 12px;
    }
    .encrypt-note mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .journal-continue { width: 100%; }
  `]
})
export class JournalPanelComponent {
  readonly open            = input(false);
  readonly disabled        = input(false);
  readonly message         = input('');
  readonly saveState       = input<JournalSaveState>('idle');
  readonly visitedStages   = input<string[]>([]);
  readonly supportResources = input<string[]>([]);
  readonly prompts         = input<string[]>([
    '¿Qué señales de riesgo identificaste?',
    '¿Qué decisión cambiarías si repitieras el caso?',
    '¿Qué principio ético aplicaste?',
    '¿Qué ruta institucional consideraste?',
    '¿Cómo evitaste revictimizar a la persona afectada?'
  ]);
  readonly save        = output<string>();
  readonly closeSheet  = output<void>();

  text = '';
  private readonly audio = inject(AudioDirectorService);

  constructor() {
    effect(() => { if (this.open()) this.audio.playSfx('ui_select'); });
  }

  onCloseClick(): void {
    this.audio.playSfx('ui_cancel');
    this.closeSheet.emit();
  }

  clear() { this.text = ''; }
}
