import { describe, expect, it } from 'vitest';
import type { SalaCaso } from '../../modelo/caso';
import { actoresDeSala, salaParaLienzo } from './lienzo-de-sala';

const sala = (): SalaCaso => ({
  id: 's', nombre: '', descripcion: '', encuadre: 'una-pared', fondo: '', entrada: { x: 0, y: 0 },
  estructura: null, puertas: [], muebles: [], objetos: [], personajes: [], choques: {}, origen: null,
});

describe('adaptación al lienzo', () => {
  it('sin estructura no hay sala para el lienzo', () => expect(salaParaLienzo(sala())).toBeNull());
  it('las puertas sin muro no entran al lienzo', () => {
    const s = sala();
    s.estructura = { ancho: 960, acabados: { piso: 'p', muro: 'm', paleta: 'p' } };
    s.puertas = [
      { id: 'a', x: 0, y: 0, hacia: null, etiqueta: 'A' },
      { id: 'b', x: 0, y: 0, hacia: null, etiqueta: 'B', muro: 'fondo', pos: 20, modelo: 'm' },
    ];
    expect(salaParaLienzo(s)?.puertas).toEqual([{ id: 'b', muro: 'fondo', pos: 20, modelo: 'm', etiqueta: 'B' }]);
  });
  it('cada persona usa la fila de su orientación', () => {
    const s = sala();
    s.personajes = [
      { ref: 'a', x: 1, y: 2, mirando: 'izquierda', expresion: 'neutral' },
      { ref: 'b', x: 3, y: 4, mirando: 'derecha', expresion: 'neutral' },
    ];
    expect(actoresDeSala(s).map((a) => a.fila)).toEqual([2, 6]); // filas de idle.png: left y right (VIEW_ROWS)
    expect(actoresDeSala(s)[0].url).toBe('/assets/characters/kit/a/idle.png');
  });
  it('resuelve las piezas y recetas con el catálogo del caso', () => {
    const s = sala();
    s.muebles = [{ ref: 'mesa', x: 12, y: 30, espejo: true }];
    s.objetos = [{ ref: 'nota', x: 14, y: 20 }];
    s.personajes = [{ ref: 'p', x: 3, y: 4, mirando: 'derecha', expresion: 'neutral' }];
    const actores = actoresDeSala(s, {
      lugarId: 'casa',
      catalogo: {
        muebles: [{ id: 'mesa', nombre: '', arte: 'mesa.png', ancho: 32, alto: 40, colision: false }],
        objetos: [{ id: 'nota', nombre: '', tipo: 'NOTE', arte: 'nota.png', textoInteraccion: '' }],
        herramientas: [],
      },
      personajes: [{ id: 'p', nombre: '', rol: '', recipeId: 'kit' }],
    });
    expect(actores.map((a) => a.url)).toEqual([
      '/assets/biblioteca/escenarios/casa/mesa.png', '/assets/biblioteca/escenarios/casa/nota.png',
      '/assets/characters/kit/kit/idle.png',
    ]);
    expect(actores[0]).toMatchObject({ cuadroAncho: 32, cuadroAlto: 40, espejo: true });
  });
});
