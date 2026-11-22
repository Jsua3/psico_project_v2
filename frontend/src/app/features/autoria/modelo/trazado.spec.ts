import { universidad } from '../testing/universidad';
import { copiarEscenarioAlCaso } from './copiar';
import type { CasoBorrador } from './caso';
import { ALTO_ESCENA, ANCHO_ESCENA, posicionLibre, trazarEscenas } from './trazado';

/** Tres escenas en fila: 1 → 2 → 3. */
function lineal(): CasoBorrador {
  const caso = copiarEscenarioAlCaso(universidad, ['pasillo', 'sala-espera', 'consultorio'], 'Caso');
  const [a, b, c] = caso.escenas;
  const respuesta = (id: string, destinoId: string) =>
    ({ id, texto: '', clase: 'RECOMMENDED' as const, razon: '', efectos: {}, retroalimentacion: '', destinoId, marcaIa: false });
  a.respuestas = [respuesta('r1', b.id)];
  b.respuestas = [respuesta('r2', c.id)];
  c.respuestas = [];
  return caso;
}

// req: EDITOR.md §4.2, regla 6 (Caminos: «De arriba abajo» además de «De izquierda a derecha»)
describe('trazarEscenas', () => {
  it('sin dirección ordena de izquierda a derecha, como siempre: cada paso de la historia es una columna', () => {
    const caso = lineal();
    const p = trazarEscenas(caso);
    const [a, b, c] = caso.escenas.map((e) => p.get(e.id)!);
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
    expect(new Set([a.y, b.y, c.y]).size).toBe(1);
    expect(trazarEscenas(caso, 'izquierda-derecha')).toEqual(p);
  });

  it('de arriba abajo, cada paso es una fila y las tarjetas no se pisan', () => {
    const caso = lineal();
    const p = trazarEscenas(caso, 'arriba-abajo');
    const [a, b, c] = caso.escenas.map((e) => p.get(e.id)!);
    expect(a.y).toBeLessThan(b.y);
    expect(b.y - a.y).toBeGreaterThanOrEqual(ALTO_ESCENA);
    expect(c.y - b.y).toBeGreaterThanOrEqual(ALTO_ESCENA);
    expect(new Set([a.x, b.x, c.x]).size).toBe(1);
  });

  it('las ramas de arriba abajo se reparten a lo ancho sin encimarse', () => {
    const caso = lineal();
    const [a, b, c] = caso.escenas;
    a.respuestas = [...a.respuestas, { ...a.respuestas[0], id: 'r3', destinoId: c.id }];
    b.respuestas = [];
    const p = trazarEscenas(caso, 'arriba-abajo');
    const pb = p.get(b.id)!, pc = p.get(c.id)!;
    expect(pb.y).toBe(pc.y);
    expect(Math.abs(pb.x - pc.x)).toBeGreaterThanOrEqual(ANCHO_ESCENA);
  });
});

describe('posicionLibre', () => {
  it('baja de a una tarjeta hasta encontrar un lugar sin escena', () => {
    expect(posicionLibre([{ x: 0, y: 0 }], { x: 0, y: 0 })).toEqual({ x: 0, y: ALTO_ESCENA + 20 });
    expect(posicionLibre([], { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
  });
});
