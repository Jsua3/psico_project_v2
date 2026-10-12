import {
  ChangeDetectionStrategy, Component, DestroyRef, Directive, ElementRef, ViewEncapsulation, afterNextRender,
  booleanAttribute, inject, input, signal, viewChild,
} from '@angular/core';

import { UiSkeleton } from '../skeleton/ui-skeleton';
import { UiDataStateValue } from '../state/ui-data-state';

/** Marca la tabla nativa que va dentro de `ui-table`: `<table ui-table>`. */
@Directive({ selector: 'table[ui-table]', host: { class: 'ui-table__table' } })
export class UiTableTable {}

/** Fila con hover (puntero fino) y, si se elige, selección: `<tr uiRow [selected]="…">`. */
@Directive({
  selector: 'tr[uiRow]',
  host: {
    class: 'ui-table__row',
    '[class.ui-table__row--selected]': 'selected()',
    '[attr.aria-selected]': "selected() ? 'true' : null",
  },
})
export class UiTableRow {
  readonly selected = input(false, { transform: booleanAttribute });
}

/** Contenido que se muestra cuando la tabla está vacía (p. ej. un `ui-empty-state`). */
@Directive({ selector: '[uiTableEmpty]' })
export class UiTableEmpty {}

/** Contenido que se muestra cuando la carga falló (p. ej. un `ui-error-state`). */
@Directive({ selector: '[uiTableError]' })
export class UiTableError {}

const SKELETON_ROWS = [0, 1, 2, 3, 4];

/**
 * Marco de tabla (plan visual F2-8) para tablas NATIVAS: región con nombre que se desplaza en horizontal y en
 * vertical (cabecera pegajosa dentro de su alto máximo), densidad cómoda o compacta, y los estados de datos DENTRO
 * del marco y de a uno (`state`, de `uiDataState()`): esqueleto de filas mientras carga (con `aria-busy`), el vacío
 * o el error proyectados. Si la tabla desborda, sombras en los bordes indican hacia dónde hay más y la región entra
 * en el orden de tabulación para desplazarse con el teclado.
 */
@Component({
  selector: 'ui-table',
  imports: [UiSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ui-table',
    '[class.ui-table--comfortable]': "density() === 'comfortable'",
    '[class.ui-table--compact]': "density() === 'compact'",
    '[class.ui-table--overflow-start]': 'overflowStart()',
    '[class.ui-table--overflow-end]': 'overflowEnd()',
  },
  template: `
    <div #scroller class="ui-table__scroll" role="region" [attr.aria-label]="label()"
      [attr.aria-busy]="state() === 'loading' ? 'true' : null" [attr.tabindex]="overflowing() ? 0 : null"
      (scroll)="measure()">
      <div class="ui-table__content" [hidden]="state() !== 'ready'"><ng-content select="table" /></div>
      @if (state() === 'loading') {
        <div class="ui-table__loading">
          @for (row of skeletonRows; track row) {
            <ui-skeleton shape="row" />
          }
        </div>
      }
      <div class="ui-table__state" [hidden]="state() !== 'empty'"><ng-content select="[uiTableEmpty]" /></div>
      <div class="ui-table__state" [hidden]="state() !== 'error'"><ng-content select="[uiTableError]" /></div>
    </div>
  `,
  styleUrl: './ui-table.scss',
})
export class UiTable {
  /** Nombre de la región (lo que contiene la tabla). */
  readonly label = input.required<string>();
  readonly density = input<'comfortable' | 'compact'>('comfortable');
  readonly state = input<UiDataStateValue>('ready');

  protected readonly skeletonRows = SKELETON_ROWS;
  protected readonly overflowing = signal(false);
  protected readonly overflowStart = signal(false);
  protected readonly overflowEnd = signal(false);
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.measure();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.measure());
      observer.observe(this.scroller().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected measure(): void {
    const { scrollLeft, scrollWidth, clientWidth } = this.scroller().nativeElement;
    const overflowing = scrollWidth > clientWidth + 1;
    this.overflowing.set(overflowing);
    this.overflowStart.set(overflowing && scrollLeft > 1);
    this.overflowEnd.set(overflowing && scrollLeft + clientWidth < scrollWidth - 1);
  }
}
