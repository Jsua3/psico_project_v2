/** Tramo vertical de un bloque, en las mismas coordenadas que el borde inferior de la cabecera fija. */
export interface VerticalSpan {
  readonly top: number;
  readonly bottom: number;
}

/**
 * Cuánto hay que mover el scroll del panel (negativo = hacia arriba) para que ningún bloque de texto quede
 * cortado a medias por la cabecera fija. Un bloque que empieza por encima del borde inferior de la cabecera y
 * termina por debajo está parcialmente tapado; se sube lo que haga falta para que quede entero. Sin bloques
 * cortados no se mueve nada.
 */
export function scrollShiftToUncoverText(headBottom: number, blocks: readonly VerticalSpan[]): number {
  let shift = 0;
  for (const block of blocks) {
    if (block.top < headBottom && block.bottom > headBottom) shift = Math.min(shift, block.top - headBottom);
  }
  return shift;
}
