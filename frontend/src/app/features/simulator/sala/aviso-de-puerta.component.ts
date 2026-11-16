import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * Aviso de la puerta de una sala por piezas (diseño, sección 4.4): «E · Pasar a la sala de espera», junto a la puerta que
 * se abrió. Siempre es un botón: con teclado lo dispara E (lo escucha la escena) o Enter y Espacio si tiene el foco; con
 * ratón o con el dedo se pulsa. Cerrada con llave dice qué falta, con un candado: la forma lo dice, no solo el color
 * (WCAG 1.4.1). El anuncio para el lector de pantalla lo hace la región viva que el juego ya usa para lo cercano.
 *
 * Presentacional: lo posiciona quien lo aloja (`x`, `y` en px del contenedor, el punto al que señala la cola) y él decide
 * qué hacer con `cruzar` (cruzar la puerta o, si está cerrada, sacudirla).
 */
@Component({
  selector: 'app-aviso-de-puerta',
  standalone: true,
  template: `
    <button type="button" class="aviso" [class.aviso--cerrada]="bloqueada()" [attr.aria-disabled]="bloqueada() ? 'true' : null"
      [style.left.px]="x()" [style.top.px]="y()" (click)="cruzar.emit()">
      @if (conTecla()) {
        <kbd class="aviso__tecla" aria-hidden="true">E</kbd><span class="aviso__sep" aria-hidden="true">·</span>
      }
      @if (bloqueada()) {
        <svg class="aviso__candado" viewBox="0 0 7 8" shape-rendering="crispEdges" aria-hidden="true">
          <path fill="currentColor" d="M1 3h5v5H1zM2 1h3v1H2zM1 2h1v1H1zM5 2h1v1H5z" /><path class="aviso__ojo" d="M3 5h1v2H3z" />
        </svg>
      }
      <span class="aviso__texto">{{ texto() }}</span>
      @if (bloqueada()) {
        <span class="aviso__falta"><span class="aviso__oculto">: cerrada.</span> {{ detalle() }}</span>
      }
    </button>
    <span class="aviso__cola" [style.left.px]="x()" [style.top.px]="y()" aria-hidden="true"></span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { position: absolute; inset: 0; pointer-events: none; }
    /* Un cartelito del mismo mundo: borde de dos tonos con esquinas en escalón y sombra dura, sin redondeos ni difuminado. */
    .aviso {
      position: absolute; transform: translate(-50%, calc(-100% - 6px)); pointer-events: auto;
      display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 6px 14px 6px 8px;
      font: 600 15px/1.2 Poppins, 'Segoe UI', system-ui, sans-serif; color: #f6ecd6; white-space: nowrap; cursor: pointer;
      background: #1b1420; border: 0;
      box-shadow: 0 0 0 2px #5c4436, 0 0 0 4px #281c18, 4px 4px 0 4px rgba(8, 6, 18, 0.45);
      clip-path: polygon(0 4px, 4px 4px, 4px 0, calc(100% - 4px) 0, calc(100% - 4px) 4px, 100% 4px, 100% calc(100% - 4px),
        calc(100% - 4px) calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 4px), 0 calc(100% - 4px));
      transition: transform 160ms cubic-bezier(.2, .8, .2, 1);
    }
    .aviso:active { transform: translate(-50%, calc(-100% - 5px)); }
    .aviso:focus-visible { outline: 3px solid #f6ecd6; outline-offset: 4px; }
    .aviso__tecla {
      font: 600 14px/1 Poppins, sans-serif; min-width: 26px; height: 26px; display: inline-grid; place-items: center;
      color: #281c18; background: #f2c46b; box-shadow: inset 0 -3px 0 #b8863a, 0 0 0 2px #281c18;
    }
    .aviso__sep { color: #c9bba0; }
    .aviso__candado { width: 14px; height: 16px; flex: none; }
    .aviso__ojo { fill: #281c18; }
    .aviso__falta { font-weight: 400; color: #c9bba0; }
    .aviso__oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .aviso__cola {
      position: absolute; width: 10px; height: 6px; transform: translate(-50%, -6px);
      background: #5c4436; clip-path: polygon(0 0, 100% 0, 50% 100%);
    }
    @media (prefers-reduced-motion: reduce) {
      .aviso { transition: none; }
      .aviso:active { transform: translate(-50%, calc(-100% - 6px)); }
    }
  `],
})
export class AvisoDePuertaComponent {
  /** Lo que hace la puerta: «Pasar a la sala de espera». */
  readonly texto = input.required<string>();
  /** Cerrada con llave (`door-status.util.ts`). */
  readonly bloqueada = input(false);
  /** Qué falta para pasar, cuando está cerrada. */
  readonly falta = input<string | null>(null);
  /** Muestra la tecla E: no en pantalla táctil ni con los atajos de una tecla apagados. */
  readonly conTecla = input(true);
  /** Punto al que señala la cola, en px del contenedor. */
  readonly x = input(0);
  readonly y = input(0);
  /** Quien juega quiere pasar (o intenta pasar por la puerta cerrada). */
  readonly cruzar = output<void>();

  protected readonly detalle = computed(() => this.falta() ?? 'Todavía no se puede pasar.');
}
