import {
  CANVAS_ZOOM_MAX,
  CANVAS_ZOOM_MIN,
  cursorFor,
  fitView,
  snapZoneRect,
  wheelZoomFactor,
  zoomAtPoint,
} from './canvas-view.util';

/**
 * La vista del lienzo del editor de mundo (plan F8-4; KON-4, KON-5, KON-7): el cursor que corresponde a cada herramienta
 * y a lo que hay bajo el puntero, el zoom hacia el cursor, el ajuste a la vista y la geometría de una zona tras
 * arrastrarla o cambiarle el tamaño. Son funciones puras: Konva no corre en jsdom, así que el cableado va en el e2e.
 */
// req: RNF-04
describe('cursorFor: el cursor de cada herramienta', () => {
  it('seleccionar: flecha normal y «mover» sobre un objeto o una zona', () => {
    expect(cursorFor({ tool: 'select', hover: 'none', panning: false })).toBe('default');
    expect(cursorFor({ tool: 'select', hover: 'object', panning: false })).toBe('move');
    expect(cursorFor({ tool: 'select', hover: 'zone', panning: false })).toBe('move');
  });

  it('colocar objeto, zona o punto de aparición: cruz', () => {
    for (const tool of ['place-object', 'place-collision', 'place-spawn'] as const) {
      expect(cursorFor({ tool, hover: 'none', panning: false })).toBe('crosshair');
      // Colocando, lo que haya debajo no cambia el gesto: la cruz sigue.
      expect(cursorFor({ tool, hover: 'object', panning: false })).toBe('crosshair');
    }
  });

  it('mover lienzo: mano abierta y, arrastrando, mano cerrada', () => {
    expect(cursorFor({ tool: 'pan', hover: 'object', panning: false })).toBe('grab');
    expect(cursorFor({ tool: 'pan', hover: 'none', panning: true })).toBe('grabbing');
  });
});

// req: RNF-04
describe('zoomAtPoint: el zoom se hace hacia el cursor', () => {
  it('el punto del mundo que estaba bajo el cursor sigue bajo el cursor', () => {
    const view = { zoom: 1, x: 40, y: 30 };
    const pointer = { x: 300, y: 200 };
    const before = { x: (pointer.x - view.x) / view.zoom, y: (pointer.y - view.y) / view.zoom };

    const next = zoomAtPoint(view, pointer, 2);

    expect(next.zoom).toBe(2);
    expect({ x: (pointer.x - next.x) / next.zoom, y: (pointer.y - next.y) / next.zoom }).toEqual(before);
  });

  it('el zoom se acota a los límites del editor', () => {
    const view = { zoom: 1, x: 0, y: 0 };
    expect(zoomAtPoint(view, { x: 10, y: 10 }, 99).zoom).toBe(CANVAS_ZOOM_MAX);
    expect(zoomAtPoint(view, { x: 10, y: 10 }, 0.001).zoom).toBe(CANVAS_ZOOM_MIN);
  });

  it('con el cursor en el origen y sin desplazamiento, la vista solo escala', () => {
    expect(zoomAtPoint({ zoom: 1, x: 0, y: 0 }, { x: 0, y: 0 }, 2)).toEqual({ zoom: 2, x: 0, y: 0 });
  });
});

// req: RNF-04
describe('wheelZoomFactor: la rueda acerca y aleja de forma continua', () => {
  it('girar hacia arriba (deltaY negativo) agranda; hacia abajo achica; cero no cambia', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
  });

  it('un giro y su contrario se anulan', () => {
    expect(wheelZoomFactor(120) * wheelZoomFactor(-120)).toBeCloseTo(1, 10);
  });
});

// req: RNF-04
describe('fitView: ajustar el mapa al lienzo', () => {
  it('el mapa cabe por el lado más justo y queda centrado', () => {
    const view = fitView({ width: 1000, height: 500 }, { width: 960, height: 540 }, 0);

    expect(view.zoom).toBeCloseTo(500 / 540, 10);
    expect(view.x).toBeCloseTo((1000 - 960 * view.zoom) / 2, 10);
    expect(view.y).toBeCloseTo(0, 10);
  });

  it('un mapa pequeño no se agranda más allá del 200 %', () => {
    expect(fitView({ width: 2000, height: 2000 }, { width: 100, height: 100 }, 0).zoom).toBe(2);
  });

  it('un contenedor sin medida (aún no pintado) deja el 100 %', () => {
    expect(fitView({ width: 0, height: 0 }, { width: 960, height: 540 })).toEqual({ zoom: 1, x: 0, y: 0 });
  });
});

// req: RNF-04, KON-7
describe('snapZoneRect: la geometría de una zona tras arrastrarla o cambiarle el tamaño', () => {
  const grid = 16;

  it('arrastrar solo cambia x e y y encaja a la rejilla; el tamaño no se toca', () => {
    expect(snapZoneRect({ x: 37, y: 52, width: 64, height: 32, scaleX: 1, scaleY: 1 }, grid))
      .toEqual({ x: 32, y: 48, width: 64, height: 32 });
  });

  it('cambiar el tamaño con las asas: la escala del nodo se convierte en ancho y alto, encajados a la rejilla', () => {
    expect(snapZoneRect({ x: 32, y: 32, width: 64, height: 32, scaleX: 1.6, scaleY: 2.1 }, grid))
      .toEqual({ x: 32, y: 32, width: 96, height: 64 });
  });

  it('una zona no se reduce por debajo de una casilla', () => {
    expect(snapZoneRect({ x: 0, y: 0, width: 64, height: 64, scaleX: 0.01, scaleY: 0.05 }, grid))
      .toEqual({ x: 0, y: 0, width: 16, height: 16 });
  });

  it('un ancho o un alto negativo (asa arrastrada del otro lado) se toma en valor absoluto y la esquina se corrige', () => {
    expect(snapZoneRect({ x: 96, y: 64, width: 64, height: 32, scaleX: -1, scaleY: 1 }, grid))
      .toEqual({ x: 32, y: 64, width: 64, height: 32 });
  });
});
