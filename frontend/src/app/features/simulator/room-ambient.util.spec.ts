import { backgroundImage } from './room-ambient.util';

describe('room-ambient.util', () => {
  it('lee la imagen de fondo del ambiente de la sala', () => {
    expect(backgroundImage({ backgroundImage: 'a.png' })).toBe('a.png');
    expect(backgroundImage({ backgroundImage: 'a.png', encuadre: 2 })).toBe('a.png');
  });

  it('sin ambiente, sin fondo o con un valor que no es texto, no hay fondo', () => {
    expect(backgroundImage(null)).toBe('');
    expect(backgroundImage(undefined)).toBe('');
    expect(backgroundImage({})).toBe('');
    expect(backgroundImage({ backgroundImage: 42 })).toBe('');
  });
});
