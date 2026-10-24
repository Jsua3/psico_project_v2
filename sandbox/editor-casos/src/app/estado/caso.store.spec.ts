import { TestBed } from '@angular/core/testing';

import type { CasoBorrador } from '../modelo/caso';
import { CLAVE_ALMACEN, CasoStore } from './caso.store';

function casoDePrueba(): CasoBorrador {
  return {
    id: 'caso-1',
    titulo: 'Primera escucha en Bienestar',
    lugarId: 'universidad',
    salas: [],
    escenas: [],
    inicioId: null,
    modoFinales: 'automatico',
    finales: [],
    personajes: [],
    catalogo: { muebles: [], objetos: [], herramientas: [] },
  };
}

describe('CasoStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => vi.restoreAllMocks());

  it('persiste en localStorage y se restaura', () => {
    const store = TestBed.inject(CasoStore);
    store.fijar(casoDePrueba());
    TestBed.tick();
    expect(localStorage.getItem(CLAVE_ALMACEN)).not.toBeNull();

    TestBed.resetTestingModule();
    const otro = TestBed.inject(CasoStore);
    otro.cargarDeLocal();
    expect(otro.caso()).toEqual(casoDePrueba());
  });

  it('un store nuevo no borra lo guardado antes de cargarlo', () => {
    localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(casoDePrueba()));
    const store = TestBed.inject(CasoStore);
    TestBed.tick();
    expect(store.caso()).toEqual(casoDePrueba());
    expect(localStorage.getItem(CLAVE_ALMACEN)).not.toBeNull();
  });

  it('reiniciar borra el caso y el almacenamiento', () => {
    const store = TestBed.inject(CasoStore);
    store.fijar(casoDePrueba());
    TestBed.tick();
    store.reiniciar();
    TestBed.tick();
    expect(store.caso()).toBeNull();
    expect(localStorage.getItem(CLAVE_ALMACEN)).toBeNull();
  });

  it('si localStorage lanza error el store sigue funcionando', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('almacenamiento lleno');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('almacenamiento bloqueado');
    });
    const store = TestBed.inject(CasoStore);
    store.fijar(casoDePrueba());
    expect(() => TestBed.tick()).not.toThrow();
    expect(store.caso()?.titulo).toBe('Primera escucha en Bienestar');
  });

  it('lo guardado que no es un caso se ignora', () => {
    localStorage.setItem(CLAVE_ALMACEN, '{roto');
    const store = TestBed.inject(CasoStore);
    expect(store.caso()).toBeNull();
  });
});
