import { blend, contrastRatio, hexToRgb, relativeLuminance } from './contrast.util';

describe('contrast.util', () => {
  it('lee #RGB y #RRGGBB sin distinguir mayúsculas y rechaza lo demás', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('#5C6bC0')).toEqual([92, 107, 192]);
    expect(() => hexToRgb('rojo')).toThrow('Color hexadecimal no válido');
    expect(() => hexToRgb('#12345')).toThrow('Color hexadecimal no válido');
  });

  it('negro sobre blanco es 21:1 y el orden de los colores no cambia la razón', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBe(0);
  });

  it('reproduce razones de referencia medidas con la fórmula WCAG 2.x', () => {
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2); // el gris mínimo AA sobre blanco
    expect(contrastRatio('#757575', '#F3F4F6')).toBeCloseTo(4.19, 2); // placeholder por defecto de Chrome sobre el campo del login
    expect(contrastRatio('#FFFFFF', '#7C3AED')).toBeCloseTo(5.7, 2); // texto blanco sobre el violeta del botón
  });

  it('mezcla un color translúcido sobre su fondo y devuelve un hex opaco en minúsculas', () => {
    expect(blend('#000000', 0.5, '#FFFFFF')).toBe('#808080');
    expect(blend('#FF0000', 0, '#0000FF')).toBe('#0000ff');
    expect(blend('#FFFFFF', 2, '#000000')).toBe('#ffffff');
    // rgba(255,255,255,.82) sobre #5c6bc0: lo que medía el texto pequeño del panel índigo del login
    expect(contrastRatio(blend('#FFFFFF', 0.82, '#5C6BC0'), '#5C6BC0')).toBeCloseTo(3.85, 2);
  });
});
