import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import universidadJson from '../../../public/assets/biblioteca/universidad/escenario.json';
import type { Cambio } from '../ia/propuestas';
import { BibliotecaService } from '../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import type { Escenario } from '../modelo/escenario';
import { CasoStore } from './caso.store';

const universidad = universidadJson as unknown as Escenario;

function montar() {
  localStorage.clear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  });
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso'));
  return store;
}

describe('CasoStore · propuestas de la IA', () => {
  it('aplicar una propuesta es un solo paso: Ctrl+Z la deshace completa', () => {
    const store = montar();
    const id = store.caso()!.escenas[1].id;
    const cambios: Cambio[] = [
      { op: 'agregar-escena', id: 'nueva-1', salaId: 'sala-espera', titulo: 'Dudar en la espera', despuesDe: null },
      { op: 'agregar-linea', escenaId: id, personajeId: 'psicologa-bienestar', texto: 'Hola', expresion: 'neutral' },
    ];
    store.aplicarPropuesta(cambios, [true, true]);
    expect(store.caso()!.escenas).toHaveLength(3);
    expect(store.caso()!.escenas[1].lineas).toHaveLength(1);
    store.deshacer();
    expect(store.caso()!.escenas).toHaveLength(2);
    expect(store.caso()!.escenas[1].lineas).toHaveLength(0);
  });

  it('una propuesta que no cuadra no cambia nada y lo dice', () => {
    const store = montar();
    const antes = store.caso();
    expect(() => store.aplicarPropuesta([{ op: 'agregar-linea', escenaId: 'no-existe', personajeId: 'x', texto: '', expresion: 'neutral' }], [true])).toThrow();
    expect(store.caso()).toBe(antes);
    expect(store.puedeDeshacer()).toBe(false);
  });

  it('aceptar una escena creada por la IA le quita la marca', () => {
    const store = montar();
    store.aplicarPropuesta([{ op: 'agregar-escena', id: 'nueva-1', salaId: 'consultorio', titulo: 'Nueva', despuesDe: null }], [true]);
    const nueva = store.caso()!.escenas.at(-1)!;
    expect(nueva.marcaIa).toBe(true);
    store.aceptarIa({ escenaId: nueva.id });
    expect(store.caso()!.escenas.at(-1)!.marcaIa).toBe(false);
  });
});
