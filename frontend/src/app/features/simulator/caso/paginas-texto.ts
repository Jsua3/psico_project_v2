/**
 * Páginas de un parlamento largo (bloque U1, V5; pedido del usuario: «escribió mucho texto de corrido en una
 * conversación… al estudiante le toca scrollear mucho para leer»). Un parlamento no se lee desplazando: se parte en
 * páginas por frases enteras. Cuánto cabe en una página no es un número fijo de caracteres: lo dice `cabe`, que quien
 * llama mide sobre la placa real (su ancho, su letra y el alto que le queda). Módulo puro.
 */

/** Las frases del texto, con su puntuación y lo que la cierra (comillas, paréntesis). Unidas, dan el texto de nuevo. */
export function frasesDe(texto: string): string[] {
  const frases = texto.match(/[^.!?…]+(?:[.!?…]+["'»”’)\]]*\s*|$)/g)?.filter(frase => frase.trim().length > 0) ?? [];
  return frases.length > 0 ? frases : [texto];
}

/**
 * Agrupa las frases en páginas: cada página lleva tantas frases enteras como quepan. Una frase que no cabe ni sola va sola
 * en su página (no se corta a media frase). Sin nada que partir, devuelve el texto entero como única página.
 */
export function partirEnPaginas(texto: string, cabe: (pagina: string) => boolean): string[] {
  const paginas: string[] = [];
  let actual = '';
  for (const frase of frasesDe(texto)) {
    const prueba = actual + frase;
    if (actual.trim() && !cabe(prueba.trim())) {
      paginas.push(actual.trim());
      actual = frase;
    } else {
      actual = prueba;
    }
  }
  if (actual.trim()) paginas.push(actual.trim());
  return paginas.length > 0 ? paginas : [texto];
}
