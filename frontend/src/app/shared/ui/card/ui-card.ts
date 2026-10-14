import { ChangeDetectionStrategy, Component, ElementRef, ViewEncapsulation, inject } from '@angular/core';

/**
 * Tarjeta del lenguaje visual (plan visual F2-3). `<ui-card>` es solo superficie (borde, sin sombra: VD-3). Para
 * que toda la tarjeta sea clicable se usa sobre un control nativo, `<a ui-card>` o `<button ui-card>`: foco,
 * teclado y lector correctos, cursor de mano, hover de borde y sombra y respuesta al presionar (§2.6). No hay
 * «tarjeta interactiva» sobre un `div`.
 */
@Component({
  selector: 'ui-card, a[ui-card], button[ui-card]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ui-card',
    '[class.ui-card--interactive]': 'interactive',
  },
  template: '<ng-content />',
  styleUrl: './ui-card.scss',
})
export class UiCard {
  protected readonly interactive = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.tagName !== 'UI-CARD';
}
