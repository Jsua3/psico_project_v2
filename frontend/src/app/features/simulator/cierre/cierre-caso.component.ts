import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { UiPageHeader } from '../../../shared/ui/page-header/ui-page-header';

/**
 * Cierre del caso (DISENO §4.5, DP-13): `/portal/simulador/:caseVersionId/cierre/:attemptId`. ESQUELETO del bloque B1:
 * deja la ruta viva para que Casos, Inicio y el resultado del juego puedan enlazarla. La página completa (apoyo,
 * objetivos, recorrido, retroalimentación docente y qué sigue) la construye B4d sobre este archivo.
 */
@Component({
  selector: 'app-cierre-caso',
  imports: [UiPageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ui-page-header eyebrow="Cierre del caso" title="Tu recorrido por el caso" />`,
})
export class CierreCasoComponent {
  /** Por `withComponentInputBinding`, desde la ruta. */
  readonly caseVersionId = input<string>();
  readonly attemptId = input<string>();
}
