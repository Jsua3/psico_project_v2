import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChildren,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { PreferenciaTema, TemaService } from '../../../core/tema/tema.service';

interface OpcionTema { valor: PreferenciaTema; nombre: string; icono: string; }

/**
 * Selector de tema (pedido del usuario, 2026-11-20): plegado es solo el icono de lo que está elegido; al pasar el ratón
 * (o con el foco del teclado, o con un toque) se EXPANDE en una cápsula con Claro · Oscuro · Automático y la elegida
 * marcada. La cápsula crece desde la opción activa hacia los lados, recortada con `clip-path`: lo elegido no se mueve
 * bajo el cursor y nada empuja a los enlaces vecinos (va por encima, en su propia capa opaca, sin un segundo vidrio).
 * Debajo, un rótulo corto con el nombre de la opción señalada (antes: «Tema: oscuro. Volver a seguir el sistema»,
 * confuso). Es un grupo de radios: Tab entra en la elegida, las flechas cambian, Escape pliega.
 */
@Component({
  selector: 'app-tema-selector',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tema-selector',
    '[class.abierto]': 'abierto()',
    '[attr.data-indice]': 'indiceActivo()',
    '(pointerenter)': 'alEntrar($event)',
    '(pointerleave)': 'alSalir($event)',
    '(focusin)': 'abrir()',
    '(focusout)': 'alSalirFoco($event)',
    '(keydown)': 'alTeclear($event)',
  },
  template: `
    <div class="capsula" role="radiogroup" aria-label="Tema de la página">
      @for (o of opciones; track o.valor; let i = $index) {
        <button #opcion type="button" role="radio" class="opcion ds-motion" [attr.aria-checked]="o.valor === tema.preferencia()"
          [attr.aria-label]="o.nombre" [attr.tabindex]="o.valor === tema.preferencia() ? 0 : -1"
          (click)="alPulsar(o.valor)" (pointerenter)="senalada.set(i)" (pointerleave)="senalada.set(null)">
          <mat-icon aria-hidden="true">{{ o.icono }}</mat-icon>
        </button>
      }
    </div>
    <span class="rotulo ds-motion" aria-hidden="true">{{ rotulo() }}</span>
  `,
  styles: `
    :host {
      --lado: 2.875rem;
      --radio: 0.875rem;
      --indice: 0;
      position: relative;
      display: inline-block;
      inline-size: var(--lado);
      block-size: var(--lado);
      flex: none;
      vertical-align: middle;
    }

    /* La posición de la elegida va por atributo (no por estilo en línea: la portada exige cero [style]). */
    :host([data-indice='1']) { --indice: 1; }
    :host([data-indice='2']) { --indice: 2; }

    /* La cápsula mide las tres opciones y se coloca para que la activa caiga en el hueco del botón; plegada se recorta
       a esa sola opción. */
    .capsula {
      position: absolute;
      inset-block-start: 0;
      inset-inline-start: calc(var(--indice) * var(--lado) * -1);
      z-index: var(--ds-z-elevado, 2);
      display: flex;
      inline-size: calc(var(--lado) * 3);
      block-size: var(--lado);
      border-radius: var(--radio);
      background-color: transparent;
      box-shadow: none;
      clip-path: inset(0 calc((2 - var(--indice)) * var(--lado)) 0 calc(var(--indice) * var(--lado)) round var(--radio));
      transition:
        clip-path var(--duracion-rebote, 520ms) var(--ease-rebote-vivo, cubic-bezier(0.32, 0.72, 0, 1)),
        background-color var(--duracion-entrada, 200ms) ease,
        box-shadow var(--duracion-entrada, 200ms) ease;
    }

    :host(.abierto) .capsula {
      clip-path: inset(0 0 0 0 round var(--radio));
      /* Capa propia casi opaca: tapa lo que hay debajo sin ser un segundo vidrio (invariante 4 de la barra). */
      background-color: color-mix(in oklab, var(--ds-surface-1, #fff) 96%, transparent);
      box-shadow:
        0 0 0 1px var(--asb-linea, color-mix(in oklab, var(--ds-text-1, #14202e) 14%, transparent)),
        0 10px 28px -12px rgb(0 0 0 / 0.35);
    }

    .opcion {
      position: relative;
      display: grid;
      place-items: center;
      inline-size: var(--lado);
      block-size: var(--lado);
      padding: 0;
      border: 0;
      border-radius: var(--radio);
      background: transparent;
      color: var(--asb-cromo-tinta, var(--ds-text-1));
      cursor: pointer;
      transition: background-color var(--duracion-boton, 140ms) ease, color var(--duracion-boton, 140ms) ease;
    }

    .opcion mat-icon {
      font-size: 1.25rem;
      inline-size: 1.25rem;
      block-size: 1.25rem;
    }

    /* La elegida lleva su tinte de acento solo con la cápsula abierta; plegada se ve como el botón de siempre. */
    :host(.abierto) .opcion[aria-checked='true'] {
      background-color: color-mix(in oklab, var(--l-acento, var(--ds-accent-sim, #5b3fd1)) 20%, transparent);
      color: var(--l-acento-tinta, var(--ds-primary, #004876));
    }

    @media (hover: hover) and (pointer: fine) {
      .opcion:hover {
        background-color: color-mix(in oklab, var(--ds-text-1, #14202e) 8%, transparent);
      }
    }

    .opcion:focus-visible {
      outline: 2px solid var(--ds-focus, currentColor);
      outline-offset: -2px;
    }

    .opcion:active {
      transform: scale(0.94);
    }

    .rotulo {
      position: absolute;
      inset-block-start: calc(100% + 0.5rem);
      inset-inline-start: 50%;
      z-index: var(--ds-z-elevado, 2);
      padding: 0.25rem 0.625rem;
      border-radius: 999px;
      background-color: color-mix(in oklab, var(--ds-surface-1, #fff) 96%, transparent);
      box-shadow: 0 0 0 1px var(--asb-linea, color-mix(in oklab, var(--ds-text-1, #14202e) 14%, transparent));
      color: var(--asb-cromo-tinta, var(--ds-text-1));
      font-size: 0.8125rem;
      font-weight: 600;
      line-height: 1.3;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      translate: -50% -0.25rem;
      transition: opacity var(--duracion-salida, 160ms) ease, translate var(--duracion-salida, 160ms) ease;
    }

    :host(.abierto) .rotulo {
      opacity: 1;
      translate: -50% 0;
      transition-duration: var(--duracion-entrada, 200ms);
    }

    @media (prefers-reduced-motion: reduce) {
      .capsula { transition-timing-function: cubic-bezier(0.32, 0.72, 0, 1); }
      .opcion:active { transform: none; }
      .rotulo, :host(.abierto) .rotulo { translate: -50% 0; }
    }

    @media (forced-colors: active) {
      :host(.abierto) .capsula { border: 1px solid CanvasText; background-color: Canvas; }
      :host(.abierto) .opcion[aria-checked='true'] { outline: 2px solid Highlight; outline-offset: -3px; }
      .rotulo { border: 1px solid CanvasText; background-color: Canvas; color: CanvasText; }
    }
  `,
})
export class TemaSelectorComponent {
  protected readonly tema = inject(TemaService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly botones = viewChildren<ElementRef<HTMLButtonElement>>('opcion');

  // Nombres sueltos con «icon» para que scripts/ui/icon-names.mjs los meta en el subconjunto de la fuente de iconos.
  private readonly iconClaro = 'light_mode';
  private readonly iconOscuro = 'dark_mode';
  private readonly iconSistema = 'brightness_auto';
  protected readonly opciones: readonly OpcionTema[] = [
    { valor: 'claro', nombre: 'Claro', icono: this.iconClaro },
    { valor: 'oscuro', nombre: 'Oscuro', icono: this.iconOscuro },
    { valor: 'sistema', nombre: 'Automático', icono: this.iconSistema },
  ];

  readonly abierto = signal(false);
  /** Opción bajo el cursor (su nombre va en el rótulo); sin cursor, el rótulo dice la elegida. */
  protected readonly senalada = signal<number | null>(null);
  protected readonly indiceActivo = computed(() => this.opciones.findIndex(o => o.valor === this.tema.preferencia()));
  protected readonly rotulo = computed(() => this.opciones[this.senalada() ?? this.indiceActivo()]?.nombre ?? '');

  private gracia = 0;

  constructor() {
    // Un toque o un clic fuera pliega la cápsula (con dedo no hay «salir del ratón»).
    const fuera = (ev: PointerEvent) => { if (this.abierto() && !this.host.contains(ev.target as Node)) this.cerrar(); };
    document.addEventListener('pointerdown', fuera, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('pointerdown', fuera, true);
      clearTimeout(this.gracia);
    });
  }

  abrir(): void {
    clearTimeout(this.gracia);
    this.abierto.set(true);
  }

  cerrar(): void {
    clearTimeout(this.gracia);
    this.abierto.set(false);
    this.senalada.set(null);
  }

  protected alEntrar(ev: PointerEvent): void {
    if (ev.pointerType === 'mouse') this.abrir();
  }

  /** Al irse el ratón se pliega con una gracia corta (como la atención de la barra): volver a entrar la cancela. */
  protected alSalir(ev: PointerEvent): void {
    if (ev.pointerType !== 'mouse' || this.host.contains(document.activeElement)) return;
    clearTimeout(this.gracia);
    this.gracia = window.setTimeout(() => this.cerrar(), 280);
  }

  protected alSalirFoco(ev: FocusEvent): void {
    if (!this.host.contains(ev.relatedTarget as Node | null)) this.cerrar();
  }

  /** Plegada, pulsar la opción visible abre (con dedo es la única forma); abierta, pulsar elige. */
  protected alPulsar(valor: PreferenciaTema): void {
    if (!this.abierto()) {
      this.abrir();
      return;
    }
    this.tema.fijar(valor);
  }

  protected alTeclear(ev: KeyboardEvent): void {
    if (ev.key === 'Escape' && this.abierto()) {
      ev.stopPropagation();
      this.cerrar();
      return;
    }
    const paso = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[ev.key];
    if (!paso) return;
    ev.preventDefault();
    const total = this.opciones.length;
    const siguiente = (this.indiceActivo() + paso + total) % total;
    this.abrir();
    this.tema.fijar(this.opciones[siguiente].valor);
    // El foco sigue a la elegida (patrón de radios con tabindex itinerante).
    queueMicrotask(() => this.botones()[siguiente]?.nativeElement.focus());
  }
}
