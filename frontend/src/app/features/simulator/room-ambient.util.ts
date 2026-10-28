/**
 * Lo que el juego lee del ambiente de una sala (`map.ambient`, un registro libre que guarda el servidor): la imagen de
 * fondo que el caso eligió para esa sala. Solo lectura y a prueba de datos raros: un valor que no es texto no es fondo.
 */
export type Json = Record<string, unknown>;

export function backgroundImage(ambient: Json | null | undefined): string {
  const v = (ambient as { backgroundImage?: unknown })?.backgroundImage;
  return typeof v === 'string' ? v : '';
}
