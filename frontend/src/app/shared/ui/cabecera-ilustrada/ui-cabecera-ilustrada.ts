import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { DoodlesComponent } from '../doodles/doodles.component';
import { UiPageHeader } from '../page-header/ui-page-header';
import { UiVineta } from '../vineta/ui-vineta';
import type { EscalaVineta, NombreEscena } from '../vineta/vineta-catalogo';

let siguiente = 0;

/**
 * Cabecera ilustrada (personalidad visual del portal, ronda 3). PatrÃ³n Composite + presentacional: junta la cabecera de
 * pÃ¡gina (`ui-page-header`, el Ãºnico h1), una viÃ±eta del simulador a la derecha y, detrÃ¡s, los doodles suaves de la
 * portada limitados a esta banda (borde corto, sin luz del cursor y desvanecidos hacia el tÃ­tulo: el texto manda).
 * La usan los inicios de los tres roles y las pantallas del estudiante, para que todas compartan el mismo armazÃ³n
 * (mismo margen superior, misma rejilla) sin copiar la maqueta en cada una. Sin servicios.
 *
 * Lo proyectado (`<ng-content>`) va debajo del texto, en la columna del tÃ­tulo: un aviso o una acciÃ³n de la cabecera.
 * En el telÃ©fono la viÃ±eta se quita (es decorativa y el tÃ­tulo necesita el ancho); los doodles se quedan.
 */
@Component({
  selector: 'ui-cabecera-ilustrada',
  imports: [DoodlesComponent, UiPageHeader, UiVineta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-cabecera-ilustrada', '[id]': 'id', '[attr.title]': 'null', '[class.ui-cabecera-ilustrada--herramienta]': 'herramienta()' },
  template: `
    @if (doodles()) {
      <app-doodles [desde]="'#' + id" [hasta]="'#' + id" intensidad="suave" [borde]="herramienta() ? 'amplio' : 'corto'" [hacia]="herramienta() ? 'todo' : 'fin'" [interactivo]="false" />
    }
    <div class="ui-cabecera-ilustrada__texto">
      <ui-page-header [eyebrow]="eyebrow()" [title]="title()" [description]="description()" [volverA]="volverA()"
        [volverEtiqueta]="volverEtiqueta()" />
      <ng-content />
    </div>
    @if (escena(); as nombre) {
      <ui-vineta class="ui-cabecera-ilustrada__vineta" [escena]="nombre" [personaje]="personaje()" [escala]="escala()" [marco]="herramienta() ? 'ninguno' : 'suelo'"
        alinear="fin" />
    }
    @if (herramienta()) { <div class="cabecera-herramienta__acciones"><ng-content select="[uiHerramientaAcciones]" /></div> }
  `,
  styleUrl: './ui-cabecera-ilustrada.scss',
})
export class UiCabeceraIlustrada {
  /** Id Ãºnico de la banda: los doodles (fijos a la vista) se limitan a ella por selector. */
  protected readonly id = `cabecera-ilustrada-${++siguiente}`;

  readonly title = input.required<string>();
  readonly eyebrow = input<string | null | undefined>(null);
  readonly description = input<string | null | undefined>(null);
  readonly volverA = input<string | null | undefined>(null);
  readonly volverEtiqueta = input('Volver');
  /** Escena de la viÃ±eta; sin ella, solo la cabecera y los doodles. */
  readonly escena = input<NombreEscena | null>(null);
  readonly personaje = input<string | null | undefined>(null);
  readonly escala = input<EscalaVineta>(2);
  readonly doodles = input(true);
  readonly herramienta = input(false);
}
