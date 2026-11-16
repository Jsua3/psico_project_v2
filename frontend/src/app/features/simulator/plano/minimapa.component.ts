import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Injector, afterNextRender, computed, inject, input, output, signal } from '@angular/core';

import { UiButton } from '../../../shared/ui/button/ui-button';
import { SafeExitButtonComponent } from '../safe-exit-button.component';
import { PlanoDelLugarComponent } from './plano-del-lugar.component';
import { PlanoDelLugar, textoDeLaSala } from './plano';

/** Ocultar el minimapa se recuerda por navegador, sin identificadores de persona. */
export const MINIMAPA_STORAGE_KEY = 'siep.minimapa.v1';

function leerOculto(): boolean {
  try {
    return localStorage.getItem(MINIMAPA_STORAGE_KEY) === 'oculto';
  } catch {
    return false;
  }
}

/**
 * Minimapa del lugar (bloque M1, §5.3): en la esquina del mundo, un botón con el plano en pequeño que abre el plano
 * completo (también con M). Su nombre accesible es la alternativa en texto («Estás en: … Puertas: …»). Se puede
 * ocultar y la preferencia se recuerda. Sin `layout` (casos del legado) no pinta nada.
 */
@Component({
  selector: 'app-minimapa',
  standalone: true,
  imports: [PlanoDelLugarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (plano(); as p) {
      @if (!oculto()) {
        <button type="button" class="minimapa__abrir" data-minimapa-abrir [attr.aria-label]="nombre()" (click)="abrir.emit()">
          <app-plano-del-lugar aria-hidden="true" [plano]="p" [actual]="actual()" [visitadas]="visitadas()" modo="mini" />
        </button>
      }
      <button type="button" class="minimapa__alternar" data-minimapa-alternar (click)="alternar()">
        {{ oculto() ? 'Mostrar plano' : 'Ocultar plano' }}
      </button>
    }
    <!-- Vista cercana (Z) también con botón, para quien no usa teclado o usa lector de pantalla. -->
    <button type="button" class="minimapa__alternar" data-vista-cercana [attr.aria-pressed]="cercana()"
      (click)="alternarCercana.emit()">Vista cercana (Z)</button>
  `,
  styles: [`
    :host {
      position: absolute; top: var(--ds-space-3); right: var(--ds-space-3); z-index: var(--ds-z-elevado);
      display: grid; justify-items: end; gap: var(--ds-space-1); pointer-events: none;
    }
    button { pointer-events: auto; font: inherit; cursor: pointer; }
    .minimapa__abrir {
      display: block; width: clamp(140px, 16vw, 220px); aspect-ratio: 16 / 9; padding: var(--ds-space-1);
      border: 1px solid var(--ds-border-strong); border-radius: var(--ds-radius-md);
      background: var(--ds-veil); box-shadow: var(--ds-shadow-e2);
    }
    .minimapa__alternar {
      min-height: var(--ds-target-min); padding: 0 var(--ds-space-2);
      border: 1px solid var(--ds-border); border-radius: var(--ds-radius-md);
      background: var(--ds-surface-1); color: var(--ds-text-2);
      font-size: var(--ds-type-caption-size); font-weight: 700;
    }
    @media (hover: hover) and (pointer: fine) {
      .minimapa__abrir:hover, .minimapa__alternar:hover { border-color: var(--ds-primary); }
    }
    .minimapa__abrir:active, .minimapa__alternar:active { transform: translateY(1px); }
    @media (prefers-reduced-motion: reduce) {
      .minimapa__abrir:active, .minimapa__alternar:active { transform: none; }
    }
  `],
})
export class MinimapaComponent {
  readonly plano = input<PlanoDelLugar | null>(null);
  readonly actual = input('');
  readonly visitadas = input<ReadonlySet<string>>(new Set());
  /** La vista cercana está puesta (su botón lo anuncia con `aria-pressed`). */
  readonly cercana = input(false);
  readonly abrir = output<void>();
  readonly alternarCercana = output<void>();

  protected readonly oculto = signal(leerOculto());
  protected readonly nombre = computed(() => {
    const plano = this.plano();
    return plano ? `Abrir plano (M). ${textoDeLaSala(plano, this.actual())}` : '';
  });

  protected alternar(): void {
    const next = !this.oculto();
    this.oculto.set(next);
    try {
      localStorage.setItem(MINIMAPA_STORAGE_KEY, next ? 'oculto' : 'visible');
    } catch {
      // Sin almacenamiento vale solo en esta sesión.
    }
  }
}

/**
 * Plano completo del lugar (bloque M1, §5.3): modal como «Ir a…», con el foco atrapado, su «Salida segura» (REGLA-004)
 * y la lista legible de las salas. Esc y M lo cierran y consumen la tecla, así que no llegan a la cadena del juego.
 * Quien lo aloja pausa el mundo, congela la cámara y devuelve el foco al minimapa.
 */
@Component({
  selector: 'app-plano-completo',
  standalone: true,
  imports: [A11yModule, PlanoDelLugarComponent, SafeExitButtonComponent, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="plano-dialogo" role="dialog" aria-modal="true" aria-labelledby="plano-titulo" cdkTrapFocus>
      <h2 id="plano-titulo">Plano del lugar</h2>
      <app-plano-del-lugar class="plano-dialogo__plano" [plano]="plano()" [actual]="actual()" [visitadas]="visitadas()" modo="completo" />
      <footer class="plano-dialogo__pie">
        <app-safe-exit-button data-hide-key [pausing]="pausing()" (pause)="safeExit.emit()" />
        <button ui-button variant="secondary" type="button" data-plano-cerrar (click)="closed.emit()">Cerrar</button>
      </footer>
    </section>
  `,
  styles: [`
    :host { display: contents; }
    .plano-dialogo {
      position: absolute; top: 50%; left: 50%; z-index: var(--ds-z-modal); transform: translate(-50%, -50%);
      width: min(880px, 94vw); max-height: min(680px, 88vh);
      display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: var(--ds-space-3); padding: var(--ds-space-4);
      border: 1px solid var(--ds-border-strong); border-radius: var(--ds-radius-lg);
      background: var(--ds-surface-1); box-shadow: var(--ds-shadow-e3); color: var(--ds-text-1);
    }
    /* El color va explícito: el estilo global de h2 no es el de la piel del juego (como en «Ir a…»). */
    h2 { margin: 0; font-size: var(--ds-type-lead-size); color: var(--ds-text-1); }
    .plano-dialogo__plano { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
    .plano-dialogo__pie { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-3); flex-wrap: wrap; }
  `],
})
export class PlanoCompletoComponent {
  readonly plano = input.required<PlanoDelLugar>();
  readonly actual = input('');
  readonly visitadas = input<ReadonlySet<string>>(new Set());
  /** Hay una salida segura pedida que espera: el botón dice «Pausando…». */
  readonly pausing = input(false);
  readonly closed = output<void>();
  readonly safeExit = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-plano-cerrar]')?.focus(), { injector: inject(Injector) });
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const letraM = (event.key === 'm' || event.key === 'M') && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (event.key !== 'Escape' && !letraM) return;
    event.preventDefault();
    if (!event.repeat) this.closed.emit();
  }
}
