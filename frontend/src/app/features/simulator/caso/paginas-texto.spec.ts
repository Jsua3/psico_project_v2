import { describe, expect, it } from 'vitest';

import { frasesDe, partirEnPaginas } from './paginas-texto';

describe('paginas-texto: un parlamento largo se parte en páginas por frases (U1, V5)', () => {
  it('separa las frases con su puntuación y lo que las cierra, y unidas dan el texto', () => {
    const texto = '(Baja la voz.) Está bien. ¿Quién es usted? «No sé…» Sigamos';
    expect(frasesDe(texto)).toEqual(['(Baja la voz.) ', 'Está bien. ', '¿Quién es usted? ', '«No sé…» ', 'Sigamos']);
    expect(frasesDe(texto).join('')).toBe(texto);
  });

  it('un texto sin puntuación es una sola frase', () => {
    expect(frasesDe('sin punto final')).toEqual(['sin punto final']);
  });

  it('agrupa tantas frases enteras como quepan según la medida de quien llama', () => {
    const texto = 'Uno dos. Tres cuatro. Cinco seis. Siete ocho.';
    // «Cabe» hasta 23 caracteres: dos frases por página.
    expect(partirEnPaginas(texto, pagina => pagina.length <= 23)).toEqual(['Uno dos. Tres cuatro.', 'Cinco seis. Siete ocho.']);
  });

  it('si todo cabe, una sola página con el texto entero', () => {
    const texto = 'Corto. Muy corto.';
    expect(partirEnPaginas(texto, () => true)).toEqual([texto]);
  });

  it('una frase que no cabe ni sola va sola en su página: no se corta a media frase', () => {
    const larga = 'Esta frase es más larga que cualquier página posible.';
    expect(partirEnPaginas(`Hola. ${larga} Adiós.`, pagina => pagina.length <= 10)).toEqual(['Hola.', larga, 'Adiós.']);
  });

  it('las páginas unidas conservan todo el texto', () => {
    const texto = 'Primera frase. Segunda frase algo más larga. Tercera. ¿Cuarta? ¡Quinta!';
    const paginas = partirEnPaginas(texto, pagina => pagina.length <= 30);
    expect(paginas.length).toBeGreaterThan(1);
    expect(paginas.join(' ')).toBe(texto);
  });
});
