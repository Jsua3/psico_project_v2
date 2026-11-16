import {
  EntradaCamara, EstadoCamara, Momento, Vista,
  asentada, avanzarCamara, comoDibujar, duracionDeViaje, enViaje, enViajeDentro, esperaDelGeneral, objetivoCamara, suavizar,
  zoomCaminar, zoomCercano, zoomGeneral,
} from './camara';

/** Sala del hospital (1200) y pasillo (1680); lienzos medidos: 1340×640 a 1366×768 y 1894×950 a 1920×1080. */
const SALA = { ancho: 1200, alto: 528 };
const PASILLO = { ancho: 1680, alto: 528 };
const vista = (ancho: number, alto: number, dpr = 1, cubiertoAbajo = 0, cubiertoArriba = 0): Vista =>
  ({ ancho, alto, dpr, cubiertoAbajo, cubiertoArriba });
const PORTATIL = vista(1340, 640);
const EXPLORAR: Momento = { tipo: 'explorar' };

function entrada(parcial: Partial<EntradaCamara>): EntradaCamara {
  return { jugador: { x: 600, y: 300 }, sala: SALA, vista: PORTATIL, momento: EXPLORAR, cercana: false, acercarAuto: true, ...parcial };
}

describe('camara: los tres planos son enteros', () => {
  it.each([
    ['portátil 1366×768, sala de 1200', PORTATIL, SALA, 1, 2],
    ['1920×1080, sala de 1200', vista(1894, 950), SALA, 2, 3],
    ['1920×1080, pasillo de 1680', vista(1894, 950), PASILLO, 1, 3],
    ['móvil 390 px a dpr 3, sala de 960', vista(1170, 1500, 3), { ancho: 960, alto: 528 }, 1, 2],
    ['vista diminuta: un solo plano', vista(600, 300), SALA, 1, 1],
  ])('%s', (_nombre, v, sala, general, caminar) => {
    expect(zoomGeneral(v, sala)).toBe(general);
    expect(zoomCaminar(v, sala)).toBe(caminar);
  });

  it('caminar nunca es más abierto que el general', () => {
    const chica = { ancho: 480, alto: 264 };
    expect(zoomCaminar(PORTATIL, chica)).toBeGreaterThanOrEqual(zoomGeneral(PORTATIL, chica));
  });

  it('la vista cercana manual sube un paso solo si aún se ve lo mínimo', () => {
    expect(zoomCercano(PORTATIL, 2)).toBe(3);
    expect(zoomCercano(vista(500, 260), 1)).toBe(1);
  });
});

describe('camara: plano general y plano de caminar', () => {
  it('el plano general del juego real (lienzo 1342×610, jugador en 600,440) centra la sala', () => {
    const o = objetivoCamara(entrada({ momento: { tipo: 'general' }, jugador: { x: 600, y: 440 }, vista: vista(1342, 610) }), null);
    expect(o).toEqual({ centro: { x: 600, y: 264 }, zoom: 1 });
  });

  it('el plano general muestra la sala entera, centrada', () => {
    expect(objetivoCamara(entrada({ momento: { tipo: 'general' } }), null)).toEqual({ centro: { x: 600, y: 264 }, zoom: 1 });
  });

  it('en un pasillo más ancho que la vista, el general se queda con el personaje sin salir de la sala', () => {
    const o = objetivoCamara(entrada({ momento: { tipo: 'general' }, sala: PASILLO, jugador: { x: 100, y: 300 } }), null);
    expect(o).toEqual({ centro: { x: 670, y: 264 }, zoom: 1 });
  });

  it('al caminar se cierra sobre el personaje y se detiene en los bordes', () => {
    expect(objetivoCamara(entrada({}), null)).toEqual({ centro: { x: 600, y: 266 }, zoom: 2 });
    expect(objetivoCamara(entrada({ jugador: { x: 1150, y: 300 } }), null).centro.x).toBe(865);
    expect(objetivoCamara(entrada({ jugador: { x: 20, y: 300 } }), null).centro.x).toBe(335);
  });

  it('dentro de la zona muerta la cámara no se mueve; fuera, lo justo', () => {
    const previo = { centro: { x: 600, y: 264 }, zoom: 2 };
    expect(objetivoCamara(entrada({ jugador: { x: 660, y: 300 } }), previo).centro).toEqual({ x: 600, y: 264 });
    expect(objetivoCamara(entrada({ jugador: { x: 700, y: 300 } }), previo).centro.x).toBe(633);
  });

  it('la vista cercana (Z) camina un paso más cerca', () => {
    expect(objetivoCamara(entrada({ cercana: true }), null).zoom).toBe(3);
  });
});

describe('camara: hablar, decidir, reaccionar y revisar', () => {
  const hablar = (parcial: Partial<EntradaCamara> = {}) =>
    objetivoCamara(entrada({ momento: { tipo: 'conversacion', con: { x: 680, y: 300 } }, ...parcial }), null);

  it('al hablar se acerca un paso al punto medio de los dos', () => {
    expect(hablar()).toEqual({ centro: { x: 640, y: 266 }, zoom: 3 });
  });

  it('con el cuadro de diálogo abajo, los dos quedan en el centro de lo libre', () => {
    const o = hablar({ vista: vista(1340, 640, 1, 140) });
    expect(o.zoom).toBe(3);
    expect(o.centro.y).toBeCloseTo(266 + 140 / 6, 6);
  });

  it('en la decisión, con franjas y opciones altas, se abre lo justo para no cortar cabezas', () => {
    const v = vista(1340, 640, 1, 355, 56);
    const { centro, zoom } = hablar({ vista: v });
    expect(zoom).toBe(2);
    const arribaLibre = centro.y - v.alto / (2 * zoom) + 56 / zoom;
    const abajoLibre = centro.y - v.alto / (2 * zoom) + (v.alto - 355) / zoom;
    expect(arribaLibre).toBeLessThanOrEqual(300 - 72);      // la cabeza bajo la franja de arriba
    expect(abajoLibre).toBeGreaterThanOrEqual(300);          // los pies sobre el cuadro
  });

  it('si ni el plano de caminar alcanza, abre hasta el general', () => {
    expect(hablar({ vista: vista(1340, 640, 1, 500) }).zoom).toBe(1);
  });

  it('con el acercamiento automático apagado encuadra sin acercarse', () => {
    expect(hablar({ acercarAuto: false })).toEqual({ centro: { x: 640, y: 266 }, zoom: 2 });
  });

  it('dos personas al pie de la sala no quedan detrás del cuadro de diálogo', () => {
    const v = vista(1340, 640, 1, 200);
    const { centro, zoom } = hablar({ jugador: { x: 600, y: 480 }, momento: { tipo: 'conversacion', con: { x: 680, y: 480 } }, vista: v });
    expect(centro.y - v.alto / (2 * zoom) + (v.alto - 200) / zoom).toBeGreaterThanOrEqual(480);
  });

  it('con el cuadro abajo no muestra vacío bajo la sala si los pies ya quedan libres', () => {
    const v = vista(1340, 640, 1, 140);
    const { centro, zoom } = hablar({ jugador: { x: 600, y: 300 }, vista: v });
    expect(centro.y + v.alto / (2 * zoom)).toBeLessThanOrEqual(528);
  });

  it('en la reacción la cámara va a quien reacciona', () => {
    const o = objetivoCamara(entrada({ momento: { tipo: 'reaccion', de: { x: 680, y: 300 } } }), null);
    expect(o).toEqual({ centro: { x: 680, y: 266 }, zoom: 3 });
  });

  it('al revisar un objeto se acerca a él', () => {
    expect(objetivoCamara(entrada({ momento: { tipo: 'objeto', en: { x: 600, y: 200 } } }), null)).toEqual({ centro: { x: 600, y: 184 }, zoom: 3 });
  });
});

describe('camara: viajes entre planos', () => {
  const desde: EstadoCamara = { centro: { x: 0, y: 0 }, zoom: 1 };
  const hacia: EstadoCamara = { centro: { x: 100, y: 40 }, zoom: 4 };

  it('la curva arranca y llega suave', () => {
    expect(suavizar(0)).toBe(0);
    expect(suavizar(1)).toBe(1);
    expect(suavizar(0.5)).toBe(0.5);
    expect(suavizar(0.1)).toBeLessThan(0.02);
    expect(suavizar(0.9)).toBeGreaterThan(0.98);
    expect(suavizar(0.3) + suavizar(0.7)).toBeCloseTo(1, 10);
  });

  it('a medio viaje el centro va por la mitad y el zoom por la media geométrica', () => {
    const medio = enViaje(desde, hacia, 0.5);
    expect(medio.centro).toEqual({ x: 50, y: 20 });
    expect(medio.zoom).toBeCloseTo(2, 10);
  });

  it('a mitad del viaje no asoma el vacío bajo la sala', () => {
    // Del plano general (×1, la sala entera centrada) al de caminar (×2, abajo en la sala), en el lienzo de 1340×640.
    const general = objetivoCamara(entrada({ momento: { tipo: 'general' }, jugador: { x: 600, y: 440 } }), null);
    const caminar = objetivoCamara(entrada({ jugador: { x: 600, y: 440 } }), null);
    const borde = (s: EstadoCamara) => s.centro.y + 640 / (2 * s.zoom);
    const limite = Math.max(528, borde(general), borde(caminar));
    for (let t = 0.05; t < 1; t += 0.05) {
      const s = enViajeDentro(general, caminar, t, PORTATIL, SALA);
      expect(borde(s)).toBeLessThanOrEqual(limite + 1e-6);
    }
    expect(enViajeDentro(general, caminar, 1, PORTATIL, SALA)).toEqual(caminar);
  });

  it('el viaje termina en el objetivo exacto: zoom entero', () => {
    expect(enViaje(desde, hacia, 1)).toEqual(hacia);
    expect(enViaje(desde, hacia, 1.7)).toEqual(hacia);
  });

  it('el general se cierra sin prisa, al hablar se acerca despacio y al volver a caminar se abre', () => {
    expect(duracionDeViaje('general', 'explorar')).toBe(1400);
    expect(duracionDeViaje('explorar', 'conversacion')).toBe(1100);
    expect(duracionDeViaje('conversacion', 'reaccion')).toBe(700);
    expect(duracionDeViaje('reaccion', 'conversacion')).toBe(700);
    expect(duracionDeViaje('conversacion', 'explorar')).toBe(900);
    expect(duracionDeViaje('explorar', 'objeto')).toBe(800);
  });

  it('el plano general se sostiene más la primera vez que se ve la sala', () => {
    expect(esperaDelGeneral(false)).toBe(900);
    expect(esperaDelGeneral(true)).toBe(350);
  });

  it('en reposo se dibuja al zoom entero; en viaje, al entero de abajo y se escala el lienzo compuesto', () => {
    expect(comoDibujar(2)).toEqual({ base: 2, escala: 1 });
    expect(comoDibujar(2.0000001)).toEqual({ base: 2, escala: 1 });
    expect(comoDibujar(1.5)).toEqual({ base: 1, escala: 1.5 });
    const viaje = comoDibujar(2.4);
    expect(viaje.base).toBe(2);
    expect(viaje.escala).toBeCloseTo(1.2, 10);
  });
});

describe('camara: seguimiento al caminar', () => {
  const desde: EstadoCamara = { centro: { x: 480, y: 264 }, zoom: 2 };
  const hacia: EstadoCamara = { centro: { x: 600, y: 300 }, zoom: 2 };

  it('con movimiento reducido es un corte', () => {
    expect(avanzarCamara(desde, hacia, 16, true)).toEqual(hacia);
  });

  it('un cuadro recorre 1 − e^(−6·dt) de lo que falta y se asienta exacto', () => {
    expect(avanzarCamara(desde, hacia, 1000 / 60, false).centro.x).toBeCloseTo(480 + 120 * (1 - Math.exp(-0.1)), 10);
    let estado = desde;
    for (let t = 0; t < 2000; t += 16) estado = avanzarCamara(estado, hacia, 16, false);
    expect(estado).toEqual(hacia);
    expect(asentada(estado, hacia)).toBe(true);
  });

  it('sin tiempo no cambia; tras una pausa larga llega de golpe', () => {
    expect(avanzarCamara(desde, hacia, 0, false)).toEqual(desde);
    expect(avanzarCamara(desde, hacia, 5000, false)).toEqual(hacia);
  });
});
