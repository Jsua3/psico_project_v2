/**
 * El ensayo del borrador (contrato 2.1, 7): reglas puras del modo ensayo de la pantalla del juego y del panel de autora.
 * Sin Angular ni Phaser.
 */

/** La escena `desde` de la dirección (`?desde=33`): un entero positivo, o `null` para empezar en la de inicio. */
export function escenaDesde(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Las rutas del juego de un ensayo descartado responden 403 (Ruling 3, 7.4) y las del panel 404: ante cualquiera de los dos
 * hay que confirmar con la lectura del bloque antes de decir «ya no existe».
 */
export function puedeSerEnsayoPerdido(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  return status === 403 || status === 404;
}
