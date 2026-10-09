import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Botón «Salida segura» reutilizable (REGLA-004 / ETH-02): el mismo rótulo y el mismo
 * nombre accesible en todas las superposiciones (diálogo, bitácora, introducción, contexto).
 *
 * Presentacional: solo emite `pause`; quien lo aloja decide cómo pausar el intento.
 * El nombre accesible es el texto visible (WCAG 2.5.3): la pista `Esc` y el icono van
 * ocultos a las tecnologías de apoyo, y la pista solo se pinta con puntero fino y hover.
 * Sin la clase `close-btn`: los e2e la pulsan para avanzar o cerrar diálogos.
 */
@Component({
  selector: 'app-safe-exit-button',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <button type="button" class="safe-exit-btn" [class.safe-exit-btn--compact]="compact()"
      (click)="pause.emit()">
      <mat-icon class="safe-exit-btn__icon" aria-hidden="true">exit_to_app</mat-icon>
      <span class="safe-exit-btn__label">Salida segura</span>
      <kbd class="safe-exit-btn__kbd" aria-hidden="true">Esc</kbd>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    :host { display: inline-flex; }
    .safe-exit-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 44px;
      min-width: 44px;
      padding: 6px 14px;
      border: 1px solid rgba(226,90,79,.4);
      border-radius: 12px;
      background: rgba(226,90,79,.1);
      color: #f1a79f;
      font: inherit;
      font-size: .8rem;
      font-weight: 900;
      letter-spacing: .03em;
      white-space: nowrap;
      cursor: pointer;
      transition: border-color 160ms, background 160ms;
    }
    .safe-exit-btn:hover { border-color: rgba(226,90,79,.7); background: rgba(226,90,79,.18); }
    .safe-exit-btn:focus-visible {
      outline: 2px solid #f1a79f;
      outline-offset: 2px;
    }
    .safe-exit-btn:active { transform: translateY(1px); }
    .safe-exit-btn__icon { flex-shrink: 0; font-size: 19px; width: 19px; height: 19px; }
    .safe-exit-btn__kbd {
      display: none;
      font-family: 'JetBrains Mono', monospace;
      font-size: .62rem;
      font-weight: 700;
      color: rgba(241,167,159,.82);
    }
    /* La tecla solo se anuncia donde existe un teclado y un puntero fino. */
    @media (hover: hover) and (pointer: fine) {
      .safe-exit-btn__kbd {
        display: inline-block;
      }
    }
    /* Donde Esc hace otra cosa (panel de diálogo, bitácora: cierran y solo el segundo Esc pausa)
       el anfitrión añade data-hide-key y el botón no promete la tecla. */
    :host([data-hide-key]) .safe-exit-btn__kbd {
      display: none;
    }
    .safe-exit-btn--compact { padding: 4px 10px; gap: 6px; font-size: .74rem; }
    .safe-exit-btn--compact .safe-exit-btn__kbd {
      display: none;
    }
    @media (prefers-reduced-motion: reduce) {
      .safe-exit-btn { transition: none; }
      .safe-exit-btn:active { transform: none; }
    }
  `]
})
export class SafeExitButtonComponent {
  /** Variante densa para pantallas bajas y táctiles: mismo texto, menos relleno, sin pista de tecla. */
  readonly compact = input(false);
  /** El estudiante pidió pausar el caso; el anfitrión llama a la salida segura real. */
  readonly pause = output<void>();
}
