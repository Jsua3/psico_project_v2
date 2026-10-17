import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Botón «Salida segura» (REGLA-004 / ETH-02): LA implementación única. El pie del juego y todas las superposiciones
 * (diálogo, bitácora, introducción, contexto) lo comparten: el mismo rótulo, el mismo nombre accesible y el mismo
 * estado «Pausando…» (F6-6).
 *
 * Presentacional: solo emite `pause`; quien lo aloja decide cómo pausar el intento y si la pausa queda en cola tras
 * una petición en curso (`pausing`): el toque se acepta siempre, el botón no se deshabilita.
 * El nombre accesible es el texto visible (WCAG 2.5.3): la pista `Esc` y el icono van ocultos a las tecnologías de
 * apoyo, y la pista solo se pinta con puntero fino y hover. El foco lo pinta el anillo global de la piel
 * (`--ds-focus`): este botón no trae uno propio. Sin la clase `close-btn`: los e2e la pulsan para avanzar o cerrar
 * diálogos.
 */
@Component({
  selector: 'app-safe-exit-button',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <button type="button" class="safe-exit-btn" [class.safe-exit-btn--compact]="compact()"
      [attr.aria-busy]="pausing() ? 'true' : null" (click)="pause.emit()">
      <mat-icon class="safe-exit-btn__icon" aria-hidden="true">exit_to_app</mat-icon>
      <span class="safe-exit-btn__label">{{ pausing() ? 'Pausando…' : 'Salida segura' }}</span>
      <kbd class="safe-exit-btn__kbd" aria-hidden="true">Esc</kbd>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    .safe-exit-btn:active { transform: translateY(1px); }
    /* Pausa pedida: el toque ya está en cola; se ve apagado y con cursor de espera, sin deshabilitarse. */
    .safe-exit-btn[aria-busy='true'] { opacity: .75; cursor: progress; }
    .safe-exit-btn__icon { flex-shrink: 0; font-size: 19px; width: 19px; height: 19px; }
    .safe-exit-btn__kbd {
      display: none;
      font-family: 'JetBrains Mono', monospace;
      font-size: .75rem;
      font-weight: 700;
      color: rgba(241,167,159,.82);
    }
    /* El hover y la tecla solo donde existen un puntero fino y un teclado (un híbrido táctil no queda «pegado»). */
    @media (hover: hover) and (pointer: fine) {
      .safe-exit-btn:hover { border-color: rgba(226,90,79,.7); background: rgba(226,90,79,.18); }
      .safe-exit-btn__kbd {
        display: inline-block;
      }
    }
    /* Donde Esc hace otra cosa (panel de diálogo, bitácora: cierran y solo el segundo Esc pausa)
       el anfitrión añade data-hide-key y el botón no promete la tecla. */
    :host([data-hide-key]) .safe-exit-btn__kbd {
      display: none;
    }
    .safe-exit-btn--compact { padding: 4px 10px; gap: 6px; font-size: .75rem; }
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
  /** Hay una salida segura pedida que espera (a que termine una petición en curso): el rótulo pasa a «Pausando…». */
  readonly pausing = input(false);
  /** El estudiante pidió pausar el caso; el anfitrión llama a la salida segura real. */
  readonly pause = output<void>();
}
