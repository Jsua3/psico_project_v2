import universidadJson from '../../../public/assets/biblioteca/universidad/escenario.json';
import type { CasoBorrador } from '../modelo/caso';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import type { Escenario } from '../modelo/escenario';
import { aplicarPropuesta, dependencias, ejemploLocal, validarPropuesta, type Cambio } from './propuestas';

const universidad = universidadJson as unknown as Escenario;

function caso(): CasoBorrador {
  return copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso');
}

const linea = (escenaId: string, extra: Partial<Cambio> = {}) =>
  ({ op: 'agregar-linea', escenaId, personajeId: 'psicologa-bienestar', texto: 'Hola', expresion: 'neutral', ...extra }) as Cambio;

describe('validarPropuesta', () => {
  it('propuesta inválida no modifica el caso', () => {
    const c = caso();
    const antes = structuredClone(c);
    for (const basura of [null, 'texto', [{ op: 'borrar-todo' }], [{}], { cambios: [] }]) {
      expect(validarPropuesta(c, basura).ok).toBe(false);
    }
    expect(() => aplicarPropuesta(c, [{ op: 'borrar-todo' } as unknown as Cambio], [true])).toThrow();
    expect(c).toEqual(antes);
  });

  it('un cambio sobre una escena inexistente invalida toda la propuesta', () => {
    const c = caso();
    const r = validarPropuesta(c, [linea(c.escenas[0].id), linea('escena-que-no-existe')]);
    expect(r.ok).toBe(false);
  });

  it('una expresión fuera de las 4 invalida la propuesta', () => {
    const c = caso();
    expect(validarPropuesta(c, [linea(c.escenas[0].id, { expresion: 'furiosa' } as Partial<Cambio>)]).ok).toBe(false);
  });

  it('un personaje o una sala que no están en el caso invalidan la propuesta', () => {
    const c = caso();
    expect(validarPropuesta(c, [linea(c.escenas[0].id, { personajeId: 'desconocida' } as Partial<Cambio>)]).ok).toBe(false);
    expect(validarPropuesta(c, [{ op: 'agregar-escena', id: 'nueva-1', salaId: 'azotea', titulo: 'X', despuesDe: null }]).ok).toBe(false);
  });

  it('una propuesta bien formada es válida', () => {
    const c = caso();
    const r = validarPropuesta(c, [
      { op: 'agregar-escena', id: 'nueva-1', salaId: 'sala-espera', titulo: 'Dudar en la espera', despuesDe: c.escenas[0].id },
      linea('nueva-1'),
      { op: 'agregar-respuesta', escenaId: 'nueva-1', texto: 'Te acompaño', clasificacion: 'adecuada', retroalimentacion: 'Bien.', destino: c.escenas[1].id },
      { op: 'colocar-personaje', salaId: 'sala-espera', ref: 'companera-clase', x: 300, y: 350, expresion: 'preocupada' },
      { op: 'mover', salaId: 'consultorio', tipo: 'mueble', indice: 0, x: 400, y: 300 },
      { op: 'agregar-final', nombre: 'Se va sin ayuda', texto: 'Se fue.', condicion: { tipo: 'llega-a-escena', escenaId: 'nueva-1' } },
    ]);
    expect(r.ok).toBe(true);
  });
});

describe('aplicarPropuesta', () => {
  it('aplicar solo los seleccionados', () => {
    const c = caso();
    const id = c.escenas[0].id;
    const cambios = [linea(id, { texto: 'Uno' } as Partial<Cambio>), linea(id, { texto: 'Dos' } as Partial<Cambio>), linea(id, { texto: 'Tres' } as Partial<Cambio>)];
    const nuevo = aplicarPropuesta(c, cambios, [true, false, true]);
    expect(nuevo.escenas[0].lineas.map((l) => l.texto)).toEqual(['Uno', 'Tres']);
    expect(c.escenas[0].lineas).toEqual([]); // el original no cambia
  });

  it('todo lo aplicado queda con marcaIa true', () => {
    const c = caso();
    const nuevo = aplicarPropuesta(c, [
      { op: 'agregar-escena', id: 'nueva-1', salaId: 'sala-espera', titulo: 'Dudar', despuesDe: null },
      linea('nueva-1'),
      { op: 'agregar-respuesta', escenaId: 'nueva-1', texto: 'R', clasificacion: 'con-riesgo', retroalimentacion: 'F', destino: null },
      { op: 'agregar-final', nombre: 'F', texto: 'T', condicion: { tipo: 'inadecuadas-al-menos', cantidad: 2 } },
    ], [true, true, true, true]);
    const escena = nuevo.escenas.at(-1)!;
    expect(escena.marcaIa).toBe(true);
    expect(escena.lineas[0].marcaIa).toBe(true);
    expect(escena.respuestas[0].marcaIa).toBe(true);
    expect(nuevo.finales[0].marcaIa).toBe(true);
    expect(nuevo.modoFinales).toBe('propio');
  });

  it('destino nueva crea la escena y la conecta', () => {
    const c = caso();
    const id = c.escenas[1].id;
    const nuevo = aplicarPropuesta(c, [
      { op: 'agregar-respuesta', escenaId: id, texto: 'R', clasificacion: 'adecuada', retroalimentacion: 'F', destino: 'nueva' },
    ], [true]);
    expect(nuevo.escenas).toHaveLength(3);
    const destino = nuevo.escenas.find((e) => e.id === nuevo.escenas[1].respuestas[0].destinoId)!;
    expect(destino.salaId).toBe('consultorio');
    expect(destino.marcaIa).toBe(true);
  });

  it('una línea de una escena nueva no se puede aplicar sin su escena', () => {
    const c = caso();
    const cambios: Cambio[] = [
      { op: 'agregar-escena', id: 'nueva-1', salaId: 'sala-espera', titulo: 'Dudar', despuesDe: null },
      linea('nueva-1'),
    ];
    expect(dependencias(cambios)).toEqual([[], [0]]);
    expect(() => aplicarPropuesta(c, cambios, [false, true])).toThrow();
  });

  it('colocar un personaje fuera del piso lo deja en el borde', () => {
    const c = caso();
    const nuevo = aplicarPropuesta(c, [{ op: 'colocar-personaje', salaId: 'consultorio', ref: 'docente', x: 5000, y: 10, expresion: 'alegre' }], [true]);
    const p = nuevo.salas.find((s) => s.id === 'consultorio')!.personajes.at(-1)!;
    expect(p).toMatchObject({ ref: 'docente', x: 864, y: 236, expresion: 'alegre' });
  });

  it('el ejemplo sin conexión siempre es válido sobre el caso', () => {
    const c = caso();
    const ejemplo = ejemploLocal(c, null);
    expect(ejemplo.mensaje).toMatch(/sin conexión/i);
    expect(validarPropuesta(c, ejemplo.cambios).ok).toBe(true);
  });
});
