import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DoodlesComponent, UiPageHeader, UiVineta, type EscalaVineta, type NombreEscena } from '../../shared/ui';

let siguiente = 0;

/**
 * Cabecera de las herramientas del docente y del administrador (Revisión, Casos, Grupos, Reportes, Rúbricas,
 * Usuarios). Patrón Composite + presentacional (sin servicios): junta la cabecera de página (`ui-page-header`, el
 * único h1 y las acciones), una viñeta del simulador a la derecha y, detrás, los doodles suaves de la portada solo en
 * esta banda. Es más baja que la de los inicios: en una herramienta los datos mandan y el arte acompaña.
 *
 * Las acciones de la pantalla se proyectan con `uiHerramientaAcciones` y van en la última columna, a la derecha de la
 * viñeta (como la barra de una herramienta: título · arte · acción), alineadas con la última línea del texto.
 * Bajo 1024 px la viñeta se quita: es decorativa y el título y las acciones necesitan el ancho.
 */
@Component({
  selector: 'app-cabecera-herramienta',
  imports: [DoodlesComponent, UiPageHeader, UiVineta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'cabecera-herramienta', '[id]': 'id', '[attr.title]': 'null' },
  template: `
    <app-doodles [desde]="'#' + id" [hasta]="'#' + id" intensidad="suave" [interactivo]="false" />
    <ui-page-header class="cabecera-herramienta__texto" [eyebrow]="eyebrow()" [title]="title()"
      [description]="description()" [volverA]="volverA()" [volverEtiqueta]="volverEtiqueta()" />
    @if (escena(); as nombre) {
      <ui-vineta class="cabecera-herramienta__vineta" [escena]="nombre" [escala]="escala()" marco="ninguno" alinear="fin" />
    }
    <div class="cabecera-herramienta__acciones"><ng-content select="[uiHerramientaAcciones]" /></div>
  `,
  styles: `
    :host {
      position: relative;
      z-index: var(--ds-z-base);
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      align-items: end;
      gap: var(--ds-space-5);
      margin-block-end: var(--ds-space-5);
    }

    .cabecera-herramienta__texto {
      margin-block-end: 0;
    }

    .cabecera-herramienta__acciones {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ds-space-2);
    }

    .cabecera-herramienta__acciones:empty {
      display: none;
    }

    /* Sin viñeta (o sin acciones) la rejilla no deja una columna vacía con su hueco. */
    :host:not(:has(.cabecera-herramienta__vineta)),
    :host:has(.cabecera-herramienta__acciones:empty) {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    @media (max-width: 63.999rem) {
      :host,
      :host:not(:has(.cabecera-herramienta__vineta)),
      :host:has(.cabecera-herramienta__acciones:empty) {
        grid-template-columns: minmax(0, 1fr);
      }

      .cabecera-herramienta__vineta {
        display: none;
      }
    }
  `,
})
export class CabeceraHerramientaComponent {
  /** Id único de la banda: los doodles (fijos a la vista) se limitan a ella por selector. */
  protected readonly id = `cabecera-herramienta-${++siguiente}`;

  readonly title = input.required<string>();
  readonly eyebrow = input<string | null | undefined>(null);
  readonly description = input<string | null | undefined>(null);
  readonly volverA = input<string | null | undefined>(null);
  readonly volverEtiqueta = input('Volver');
  /** Escena del simulador a la derecha; sin ella, solo el texto y los doodles. */
  readonly escena = input<NombreEscena | null>(null);
  /** Escala máxima de la viñeta. En un espacio de trabajo de alto fijo (Revisión) se pide 1: el alto es para los datos. */
  readonly escala = input<EscalaVineta>(2);
}
