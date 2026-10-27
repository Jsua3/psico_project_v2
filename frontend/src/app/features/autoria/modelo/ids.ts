/** Identificador nuevo e irrepetible para escenas, líneas, respuestas y finales del caso. */
export function nuevoId(prefijo: string): string {
  return `${prefijo}-${crypto.randomUUID().slice(0, 8)}`;
}
