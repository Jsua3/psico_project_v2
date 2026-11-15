import { escenaDesde, puedeSerEnsayoPerdido } from './ensayo';

describe('escenaDesde', () => {
  it.each([['33', 33], ['1', 1], [null, null], [undefined, null], ['', null], ['abc', null], ['0', null], ['-2', null], ['3.5', null]] as const)(
    '«%s» da %s', (raw, esperado) => expect(escenaDesde(raw)).toBe(esperado));
});

describe('puedeSerEnsayoPerdido', () => {
  it('un 403 o un 404 de una ruta del juego puede ser un ensayo descartado; lo demás, no', () => {
    expect(puedeSerEnsayoPerdido({ status: 403 })).toBe(true);
    expect(puedeSerEnsayoPerdido({ status: 404 })).toBe(true);
    expect(puedeSerEnsayoPerdido({ status: 500 })).toBe(false);
    expect(puedeSerEnsayoPerdido({ status: 0 })).toBe(false);
    expect(puedeSerEnsayoPerdido(new Error('x'))).toBe(false);
    expect(puedeSerEnsayoPerdido(null)).toBe(false);
  });
});
