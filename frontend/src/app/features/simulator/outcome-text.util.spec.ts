import { levelWord, milestoneMark, responseClassWord } from './outcome-text.util';

// req: RN-08, RN-09 (el cierre habla en palabras, nunca en cifras)
describe('outcome-text.util', () => {
  it('la clase de una respuesta sale en palabras', () => {
    expect(responseClassWord('RECOMMENDED')).toBe('Recomendada');
    expect(responseClassWord('ACCEPTABLE')).toBe('Aceptable');
    expect(responseClassWord('RISKY')).toBe('Con riesgo');
    expect(responseClassWord('CONTRAINDICATED')).toBe('Contraindicada');
  });

  it('el nivel de una competencia sale en palabras y, sin nivel, «Sin evidencia»', () => {
    expect(levelWord('EN_INICIO')).toBe('En inicio');
    expect(levelWord('EN_PROCESO')).toBe('En proceso');
    expect(levelWord('LOGRADO')).toBe('Logrado');
    expect(levelWord('DESTACADO')).toBe('Destacado');
    expect(levelWord(null)).toBe('Sin evidencia');
  });

  it('un hito decisivo lleva la palabra «clave»; los demás, nada', () => {
    expect(milestoneMark({ decisive: true })).toBe('clave');
    expect(milestoneMark({ decisive: false })).toBeNull();
  });

  it('ninguna palabra lleva dígitos ni lenguaje de puntaje', () => {
    const words = [
      responseClassWord('RECOMMENDED'), responseClassWord('RISKY'), levelWord('LOGRADO'), levelWord(null), milestoneMark({ decisive: true }),
    ].join(' ');
    expect(words).not.toMatch(/\d|puntaje|estrés|desempeño/i);
  });
});
