import type { CasoBorrador, Clasificacion, Respuesta } from './caso';
import { evaluarFinal, finalAutomatico } from './finales';

const r = (clasificacion: Clasificacion, id: string = clasificacion): Respuesta =>
  ({ id, texto: id, clasificacion, retroalimentacion: '', destinoId: null, marcaIa: false });

describe('finalAutomatico (regla provisional del sandbox)', () => {
  it('2 o más inadecuadas → crítico', () => {
    expect(finalAutomatico([r('inadecuada'), r('inadecuada'), r('adecuada')])).toBe('critico');
  });
  it('1 inadecuada → con riesgo', () => {
    expect(finalAutomatico([r('inadecuada'), r('adecuada'), r('adecuada'), r('adecuada'), r('adecuada')])).toBe('con-riesgo');
  });
  it('al menos el 80 % adecuadas → integral', () => {
    expect(finalAutomatico([r('adecuada'), r('adecuada'), r('adecuada'), r('adecuada'), r('con-riesgo')])).toBe('integral');
  });
  it('el resto → con brechas', () => {
    expect(finalAutomatico([r('adecuada'), r('con-riesgo')])).toBe('con-brechas');
  });
  it('0 respuestas → con brechas', () => {
    expect(finalAutomatico([])).toBe('con-brechas');
  });
});

function caso(modo: 'automatico' | 'propio'): CasoBorrador {
  const escena = (id: string, respuestas: Respuesta[]) =>
    ({ id, titulo: id, salaId: 'consultorio', lineas: [], respuestas, esFinal: false, posicion: { x: 0, y: 0 } });
  return {
    id: 'c', titulo: 'C', lugarId: 'universidad', salas: [], inicioId: 'a', modoFinales: modo,
    escenas: [
      escena('a', [r('adecuada', 'ra'), r('inadecuada', 'ri')]),
      escena('b', [r('inadecuada', 'rb')]),
      escena('fin', []),
    ],
    finales: [
      { id: 'f1', nombre: 'Llega al cierre', texto: 'Llegó al cierre.', condicion: { tipo: 'llega-a-escena', escenaId: 'fin' }, marcaIa: false },
      { id: 'f2', nombre: 'Demasiados errores', texto: 'Muchos errores.', condicion: { tipo: 'inadecuadas-al-menos', cantidad: 2 }, marcaIa: false },
    ],
    personajes: [], catalogo: { muebles: [], objetos: [], herramientas: [] },
  };
}

describe('evaluarFinal', () => {
  it('en modo propio usa el primer final que se cumple', () => {
    const c = caso('propio');
    const recorrido = [{ escenaId: 'a', respuestaId: 'ri' }, { escenaId: 'b', respuestaId: 'rb' }];
    expect(evaluarFinal(c, recorrido, 'fin')).toEqual({ nombre: 'Llega al cierre', texto: 'Llegó al cierre.' });
    expect(evaluarFinal(c, recorrido, 'b')).toEqual({ nombre: 'Demasiados errores', texto: 'Muchos errores.' });
  });

  it('sin finales propios que se cumplan cae al automático', () => {
    const c = caso('propio');
    const final = evaluarFinal(c, [{ escenaId: 'a', respuestaId: 'ra' }], 'b');
    expect(final.nombre).toBe('Cierre integral');
  });

  it('en modo automático ignora los finales propios', () => {
    const c = caso('automatico');
    const final = evaluarFinal(c, [{ escenaId: 'a', respuestaId: 'ri' }], 'fin');
    expect(final.nombre).toBe('Cierre con riesgo');
    expect(final.texto.length).toBeGreaterThan(10);
  });
});
