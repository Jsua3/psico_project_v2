import { cycleKey, elementAt, moveByKey, zoneBetween } from './keyboard-edit.util';

/**
 * Edición con teclado del lienzo (plan F8-5; RNF-04): flechas de una casilla (Mayús: ocho) para mover el cursor o lo
 * seleccionado, elegir lo que hay bajo el cursor, recorrer los elementos y dibujar una zona con dos pulsaciones.
 * Funciones puras: el cableado con Konva va en el componente y el e2e solo con teclado.
 */
const MAP = { width: 960, height: 540 };
const GRID = 16;

// req: RNF-04
describe('moveByKey: una flecha mueve una casilla; con Mayús, ocho', () => {
  it('cada flecha mueve en su dirección una casilla', () => {
    expect(moveByKey({ x: 160, y: 160 }, 'ArrowRight', false, GRID, MAP)).toEqual({ x: 176, y: 160 });
    expect(moveByKey({ x: 160, y: 160 }, 'ArrowLeft', false, GRID, MAP)).toEqual({ x: 144, y: 160 });
    expect(moveByKey({ x: 160, y: 160 }, 'ArrowDown', false, GRID, MAP)).toEqual({ x: 160, y: 176 });
    expect(moveByKey({ x: 160, y: 160 }, 'ArrowUp', false, GRID, MAP)).toEqual({ x: 160, y: 144 });
  });

  it('con Mayús salta ocho casillas', () => {
    expect(moveByKey({ x: 160, y: 160 }, 'ArrowRight', true, GRID, MAP)).toEqual({ x: 288, y: 160 });
    expect(moveByKey({ x: 160, y: 160 }, 'ArrowUp', true, GRID, MAP)).toEqual({ x: 160, y: 32 });
  });

  it('no sale del mapa: se detiene en el borde', () => {
    expect(moveByKey({ x: 0, y: 0 }, 'ArrowLeft', false, GRID, MAP)).toEqual({ x: 0, y: 0 });
    expect(moveByKey({ x: 944, y: 528 }, 'ArrowRight', true, GRID, MAP)).toEqual({ x: 960, y: 528 });
    expect(moveByKey({ x: 96, y: 528 }, 'ArrowDown', false, GRID, MAP)).toEqual({ x: 96, y: 540 });
  });

  it('una posición fuera de la rejilla se encaja a ella al moverse', () => {
    expect(moveByKey({ x: 37, y: 52 }, 'ArrowRight', false, GRID, MAP)).toEqual({ x: 48, y: 48 });
  });

  it('una tecla que no es flecha no mueve nada', () => {
    expect(moveByKey({ x: 10, y: 10 }, 'a', false, GRID, MAP)).toBeNull();
    expect(moveByKey({ x: 10, y: 10 }, 'Enter', false, GRID, MAP)).toBeNull();
  });
});

// req: RNF-04
describe('elementAt: lo que hay bajo el cursor', () => {
  const objects = [{ key: 'npc', x: 160, y: 160 }, { key: 'puerta', x: 400, y: 160 }];
  const zones = [{ key: 'mesa', x: 128, y: 128, width: 96, height: 64 }, { key: 'pared', x: 600, y: 100, width: 32, height: 200 }];

  it('un objeto cuyo centro está a menos de su radio', () => {
    expect(elementAt(objects, zones, { x: 168, y: 152 })).toEqual({ kind: 'object', key: 'npc' });
  });

  it('un objeto gana a la zona que lo contiene', () => {
    expect(elementAt(objects, zones, { x: 160, y: 160 })).toEqual({ kind: 'object', key: 'npc' });
  });

  it('una zona cuando el punto está dentro de su rectángulo y no hay objeto', () => {
    expect(elementAt(objects, zones, { x: 208, y: 128 })).toEqual({ kind: 'zone', key: 'mesa' });
    expect(elementAt(objects, zones, { x: 616, y: 250 })).toEqual({ kind: 'zone', key: 'pared' });
  });

  it('el vacío no devuelve nada', () => {
    expect(elementAt(objects, zones, { x: 800, y: 480 })).toBeNull();
  });
});

// req: RNF-04
describe('cycleKey: recorrer los elementos con AvPág y RePág', () => {
  it('avanza, vuelve al principio al pasar el último y, sin selección, empieza por el primero', () => {
    expect(cycleKey(['a', 'b', 'c'], null, false)).toBe('a');
    expect(cycleKey(['a', 'b', 'c'], 'a', false)).toBe('b');
    expect(cycleKey(['a', 'b', 'c'], 'c', false)).toBe('a');
  });

  it('hacia atrás: sin selección empieza por el último y desde el primero da la vuelta', () => {
    expect(cycleKey(['a', 'b', 'c'], null, true)).toBe('c');
    expect(cycleKey(['a', 'b', 'c'], 'b', true)).toBe('a');
    expect(cycleKey(['a', 'b', 'c'], 'a', true)).toBe('c');
  });

  it('con una selección que ya no existe, o sin elementos, no rompe', () => {
    expect(cycleKey(['a', 'b'], 'zz', false)).toBe('a');
    expect(cycleKey([], null, false)).toBeNull();
  });
});

// req: RNF-04
describe('zoneBetween: una zona con dos pulsaciones', () => {
  it('el rectángulo entre las dos esquinas, en cualquier orden', () => {
    expect(zoneBetween({ x: 64, y: 48 }, { x: 160, y: 112 }, GRID)).toEqual({ x: 64, y: 48, width: 96, height: 64 });
    expect(zoneBetween({ x: 160, y: 112 }, { x: 64, y: 48 }, GRID)).toEqual({ x: 64, y: 48, width: 96, height: 64 });
  });

  it('menos de una casilla en un eje no es una zona', () => {
    expect(zoneBetween({ x: 64, y: 48 }, { x: 64, y: 112 }, GRID)).toBeNull();
    expect(zoneBetween({ x: 64, y: 48 }, { x: 160, y: 52 }, GRID)).toBeNull();
  });
});
