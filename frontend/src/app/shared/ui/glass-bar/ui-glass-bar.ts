import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewEncapsulation, afterEveryRender, afterNextRender, inject,
  input,
} from '@angular/core';

import { GlassBarMachine } from './glass-bar-machine';

const media = (query: string, fallback: boolean): (() => boolean) => {
  const list = typeof matchMedia === 'function' ? matchMedia(query) : null;
  return () => list?.matches ?? fallback;
};

/** Escape es del campo de texto con el foco: no suelta la atención (gemela, «enCampoDeTexto»). */
function focusInTextField(): boolean {
  const active = document.activeElement as HTMLElement | null;
  return !!active && (active.isContentEditable
    || active.matches('textarea, select, input:not([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="image"])'));
}

/**
 * Barra de vidrio modular (plan visual §2.8, F3; /barra-de-vidrio-modular, réplica Recomendada). El anfitrión ES el
 * `<header class="cromo">`: `<header ui-glass-bar label="…">`. El consumidor proyecta los tres módulos
 * (`.modulo.modulo-logo`, `.modulo.modulo-principal`, `.modulo.modulo-cuenta`), que quedan como hijos DIRECTOS de la
 * píldora; cualquier otro hijo (p. ej. la barra inferior fija) queda como hijo directo del header (invariante 3).
 *
 * El componente solo cablea eventos a `GlassBarMachine` y pinta `data-estado` (servido «inicial» desde la primera
 * pintura) y `data-modalidad`; la luz que sigue al ratón se escribe por CSSOM (`--puntero-x/y`), no con estilos en
 * línea del marcado. Los estilos son globales (src/styles/components/_glass-bar.scss): los selectores de estado
 * cruzan del header a los módulos proyectados.
 */
@Component({
  selector: 'header[ui-glass-bar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'cromo ds-motion',
    'data-vidrio': 'pseudo',
    '[attr.data-estado]': 'machine.state()',
    '[attr.data-modalidad]': 'machine.modality()',
    '(pointerenter)': 'machine.pointerEnter($any($event).pointerType)',
    '(pointerleave)': 'machine.pointerLeave($any($event).pointerType)',
    '(click)': 'onStripClick($event)',
  },
  template: `
    <nav class="bandeja ds-motion" [attr.aria-label]="label()" (pointermove)="followLight($event)" (pointerleave)="resetLight()">
      <ng-content select=".modulo-logo" />
      <ng-content select=".modulo-principal" />
      <ng-content select=".modulo-cuenta" />
    </nav>
    <ng-content />
  `,
})
export class UiGlassBar {
  readonly label = input.required<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly isFinePointer = media('(hover: hover) and (pointer: fine)', true);
  private readonly prefersReducedMotion = media('(prefers-reduced-motion: reduce)', false);
  protected readonly machine = new GlassBarMachine({
    isFinePointer: this.isFinePointer,
    isDesktop: media('(min-width: 64rem)', true),
  });

  constructor() {
    const cleanups: Array<() => void> = [];
    const listen = (target: EventTarget, type: string, fn: (event: Event) => void, options?: AddEventListenerOptions) => {
      target.addEventListener(type, fn, options);
      cleanups.push(() => target.removeEventListener(type, fn, options));
    };

    // Modalidad: en captura sobre document, para marcar el Tab antes de que el foco se mueva.
    listen(document, 'pointerdown', event => this.machine.pointerDown((event as PointerEvent).pointerType), { capture: true, passive: true });
    listen(document, 'keydown', event => {
      const key = (event as KeyboardEvent).key;
      if (key === 'Tab') this.machine.keyDown(key, false);
    }, { capture: true });
    listen(window, 'keydown', event => {
      const key = (event as KeyboardEvent).key;
      if (key === 'Escape') this.machine.keyDown(key, focusInTextField());
    });
    listen(window, 'scroll', () => this.machine.sync(window.scrollY), { passive: true });
    listen(document, 'click', event => {
      const principal = this.host.querySelector('.modulo-principal');
      this.machine.outsideClick(!!principal?.contains(event.target as Node));
    });
    const desktop = typeof matchMedia === 'function' ? matchMedia('(min-width: 64rem)') : null;
    if (desktop) listen(desktop, 'change', event => this.machine.setDesktop((event as MediaQueryListEvent).matches));

    // Una carga ya desplazada nace en su estado.
    afterNextRender(() => this.machine.sync(window.scrollY));
    // Techo de cada plegable = su ancho natural (desvío F3-a de _glass-bar.scss); se vuelve a medir tras cada
    // pintura (cambian los destinos al cambiar de rol) y cuando termina de cargar la fuente.
    afterEveryRender(() => this.measureFolds());
    void document.fonts?.ready.then(() => this.measureFolds());

    inject(DestroyRef).onDestroy(() => {
      cleanups.forEach(cleanup => cleanup());
      this.machine.destroy();
    });
  }

  /**
   * Ancho natural de cada plegable (su contenido más el relleno de 0,75rem por lado), escrito por CSSOM en
   * `--asb-ancho-natural`. `scrollWidth` incluye el contenido que desborda aunque el plegable esté cerrado; se le
   * resta el relleno de ese instante. Sin caja (oculto en móvil) no se toca el valor anterior.
   */
  private measureFolds(): void {
    for (const fold of this.host.querySelectorAll<HTMLElement>('a.control-plegable')) {
      if (!fold.scrollWidth) continue;
      const style = getComputedStyle(fold);
      const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const value = `calc(${Math.ceil(fold.scrollWidth - padding)}px + 1.5rem)`;
      if (fold.style.getPropertyValue('--asb-ancho-natural') !== value) fold.style.setProperty('--asb-ancho-natural', value);
    }
  }

  /** Con dedo, un toque en un hueco del módulo central (no en un enlace ni un botón) alterna la atención. */
  protected onStripClick(event: Event): void {
    const target = event.target as Element | null;
    if (!target?.closest('.modulo-principal')) return;
    this.machine.tapStrip(!!target.closest('a, button'));
  }

  /** Luz que sigue al ratón, en % de la píldora (gemela, «ESCENA»). */
  protected followLight(event: PointerEvent): void {
    if (this.prefersReducedMotion() || !this.isFinePointer() || event.pointerType !== 'mouse') return;
    const nav = event.currentTarget as HTMLElement;
    const box = nav.getBoundingClientRect();
    nav.style.setProperty('--puntero-x', String(((event.clientX - box.left) / (box.width || 1)) * 100));
    nav.style.setProperty('--puntero-y', String(((event.clientY - box.top) / (box.height || 1)) * 100));
  }

  protected resetLight(): void {
    const nav = this.host.querySelector<HTMLElement>('nav.bandeja');
    nav?.style.setProperty('--puntero-x', '50');
    nav?.style.setProperty('--puntero-y', '50');
  }
}
