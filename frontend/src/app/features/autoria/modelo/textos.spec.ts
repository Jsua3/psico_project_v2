import { plural } from './textos';

describe('plural', () => {
  it('escribe singular con 1 y plural con el resto', () => {
    expect(plural(1, 'línea', 'líneas')).toBe('1 línea');
    expect(plural(0, 'línea', 'líneas')).toBe('0 líneas');
    expect(plural(3, 'respuesta', 'respuestas')).toBe('3 respuestas');
  });
});
