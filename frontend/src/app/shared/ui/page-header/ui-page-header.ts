import { ChangeDetectionStrategy, Component, Directive, input } from '@angular/core';

/** Marca las acciones de la cabecera de página: `<button uiPageActions …>`. */
@Directive({ selector: '[uiPageActions]' })
export class UiPageActions {}

/**
 * Cabecera de pantalla (plan visual F2-3; contrato F3 → F4…F8): antetítulo, el ÚNICO `h1` de la pantalla,
 * descripción y acciones. El `title` no queda como atributo del anfitrión (sería un globo nativo sobre toda la
 * cabecera).
 */
@Component({
  selector: 'ui-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-page-header', '[attr.title]': 'null' },
  template: `
    <div class="ui-page-header__text">
      @if (eyebrow()) {
        <p class="ui-page-header__eyebrow">{{ eyebrow() }}</p>
      }
      <h1 class="ui-page-header__title">{{ title() }}</h1>
      @if (description()) {
        <p class="ui-page-header__description">{{ description() }}</p>
      }
    </div>
    <div class="ui-page-header__actions"><ng-content select="[uiPageActions]" /></div>
  `,
  styleUrl: './ui-page-header.scss',
})
export class UiPageHeader {
  readonly title = input.required<string>();
  readonly eyebrow = input<string | null | undefined>(null);
  readonly description = input<string | null | undefined>(null);
}
