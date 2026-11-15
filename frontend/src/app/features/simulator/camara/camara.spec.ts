import {
  EntradaCamara, EstadoCamara, Momento, Vista,
  asentada, avanzarCamara, objetivoCamara, zoomCercano, zoomNormal,
} from './camara';

const SALA_960 = { ancho: 960, alto: 528 };
const SALA_1920 = { ancho: 1920, alto: 528 };
const vista = (ancho: number, alto: number, dpr = 1, cubiertoAbajo = 0): Vista => ({ ancho, alto, dpr, cubiertoAbajo });
const EXPLORAR: Momento = { tipo: 'explorar' };

function entrada(parcial: Partial<EntradaCamara>): EntradaCamara {
  return {
    jugador: { x: 480, y: 300 },
    sala: SALA_960,
    vista: vista(1366, 650),
    momento: EXPLORAR,
    cercana: false,
    acercarAuto: true,
    ...parcial,
  };
}

describe('camara: zoom normal', () => {
  it('una sala de 960 en 1366×650 se ve a ×1, igual que hoy', () => {
    expect(zoomNormal(vista(1366, 650), SALA_960)).toBe(1);
  });

  it('una sala ancha se ve a la misma escala que una de 960 (la cámara la recorre)', () => {
    expect(zoomNormal(vista(1366, 650), SALA_1920)).toBe(1);
    expect(zoomNormal(vista(1920, 950), { ancho: 1680, alto: 528 })).toBe(2);
  });
});

describe('camara: zoom cercano', () => {
  it.each([
    ['1366×650 a dpr 1', vista(1366, 650), 1, 2],
    ['1920×950 a dpr 1', vista(1920, 950), 2, 3],
    ['móvil 390 px a dpr 3: recortado para seguir viendo 320×176 de mundo', vista(1170, 1500, 3), 1, 3],
    ['vista diminuta: no hay acercamiento posible', vista(600, 300), 1, 1],
    ['el cuadro de diálogo tapa casi todo: no se acerca', vista(1366, 650, 1, 400), 1, 1],
  ])('%s', (_nombre, v, normal, esperado) => {
    expect(zoomCercano(v, normal)).toBe(esperado);
  });

  it('siempre es un entero', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 2.625, 3]) {
      const v = vista(Math.round(1366 * dpr), Math.round(650 * dpr), dpr);
      expect(Number.isInteger(zoomCercano(v, zoomNormal(v, SALA_960)))).toBe(true);
    }
  });
});

describe('camara: explorar una sala ancha', () => {
  const ancha = (x: number, previo: EstadoCamara | null = null) =>
    objetivoCamara(entrada({ jugador: { x, y: 300 }, sala: SALA_1920, vista: vista(1920, 950) }), previo);

  it('se detiene en los bordes de la sala', () => {
    expect(ancha(1800)).toEqual({ centro: { x: 1440, y: 266 }, zoom: 2 });
    expect(ancha(100).centro.x).toBe(480);
  });

  it('dentro de la zona muerta la cámara no se mueve; fuera, lo justo', () => {
    const previo = { centro: { x: 900, y: 264 }, zoom: 2 };
    expect(ancha(995, previo).centro).toEqual({ x: 900, y: 264 });
    expect(ancha(1100, previo).centro.x).toBe(1004);
  });

  it('una sala más chica que la vista queda centrada esté donde esté el jugador', () => {
    for (const x of [40, 480, 920]) {
      const previo = { centro: { x: 480, y: 264 }, zoom: 1 };
      expect(objetivoCamara(entrada({ jugador: { x, y: 500 } }), previo).centro).toEqual({ x: 480, y: 264 });
    }
  });

  it('la vista cercana sigue al jugador a zoom cercano', () => {
    const objetivo = objetivoCamara(entrada({ jugador: { x: 900, y: 300 }, sala: SALA_1920, cercana: true }), null);
    expect(objetivo).toEqual({ centro: { x: 900, y: 266 }, zoom: 2 });
  });
});

describe('camara: conversación, reacción y objeto', () => {
  const hablar = (parcial: Partial<EntradaCamara> = {}) => objetivoCamara(entrada({
    jugador: { x: 900, y: 300 },
    momento: { tipo: 'conversacion', con: { x: 980, y: 300 } },
    sala: SALA_1920,
    ...parcial,
  }), null);

  it('se acerca al punto medio entre los dos', () => {
    expect(hablar()).toEqual({ centro: { x: 940, y: 266 }, zoom: 2 });
  });

  it('con el cuadro de diálogo abajo, los dos quedan en el centro de lo que se ve', () => {
    expect(hablar({ vista: vista(1366, 650, 1, 200) }).centro.y).toBe(316);
  });

  it('si no caben de cerca, no se acerca y los encuadra igual', () => {
    const lejos = hablar({ jugador: { x: 300, y: 300 }, momento: { tipo: 'conversacion', con: { x: 1100, y: 300 } } });
    expect(lejos.zoom).toBe(1);
    expect(lejos.centro.x).toBe(700);
  });

  it('con el acercamiento automático apagado encuadra sin acercarse', () => {
    const objetivo = hablar({ acercarAuto: false });
    expect(objetivo.zoom).toBe(1);
    expect(objetivo.centro.x).toBe(940);
  });

  it('con la vista cercana manual y el acercamiento apagado se queda en la cercana', () => {
    expect(hablar({ acercarAuto: false, cercana: true }).zoom).toBe(2);
  });

  it('dos personas al pie de la sala no quedan detrás del cuadro de diálogo', () => {
    const v = vista(1366, 650, 1, 200);
    const { centro, zoom } = hablar({
      jugador: { x: 940, y: 520 }, momento: { tipo: 'conversacion', con: { x: 1000, y: 520 } }, vista: v,
    });
    const bordeLibre = centro.y - v.alto / (2 * zoom) + (v.alto - v.cubiertoAbajo) / zoom;
    expect(bordeLibre).toBeGreaterThanOrEqual(520);
  });

  it('con el panel abajo no muestra vacío bajo la sala si los pies ya quedan libres', () => {
    const v = vista(1366, 650, 1, 200);
    const { centro, zoom } = hablar({ jugador: { x: 940, y: 440 }, momento: { tipo: 'conversacion', con: { x: 1000, y: 440 } }, vista: v });
    const bordeDeVista = centro.y + v.alto / (2 * zoom);
    expect(bordeDeVista).toBeLessThanOrEqual(440 + 8 + v.cubiertoAbajo / zoom);
    expect(centro.y - v.alto / (2 * zoom) + (v.alto - v.cubiertoAbajo) / zoom).toBeGreaterThanOrEqual(440);
  });

  it('si el panel lateral encoge el lienzo a mitad de la conversación, sigue dentro de la sala', () => {
    const { centro, zoom } = hablar({ vista: vista(984, 650) });
    expect(zoom).toBe(2);
    expect(centro.x - 984 / (2 * zoom)).toBeGreaterThanOrEqual(0);
    expect(centro.x + 984 / (2 * zoom)).toBeLessThanOrEqual(1920);
  });

  it('al revisar un objeto se acerca a él', () => {
    const objetivo = objetivoCamara(entrada({ momento: { tipo: 'objeto', en: { x: 600, y: 200 } } }), null);
    expect(objetivo).toEqual({ centro: { x: 600, y: 184 }, zoom: 2 });
  });
});

describe('camara: avanzar hacia el objetivo', () => {
  const desde: EstadoCamara = { centro: { x: 480, y: 264 }, zoom: 1 };
  const hacia: EstadoCamara = { centro: { x: 600, y: 300 }, zoom: 2 };

  it('con movimiento reducido es un corte', () => {
    expect(avanzarCamara(desde, hacia, 16, true)).toEqual(hacia);
  });

  it('un cuadro acerca con la suavidad de la maqueta (1 − e^(−6·dt))', () => {
    const paso = avanzarCamara(desde, hacia, 1000 / 60, false);
    expect(paso.zoom).toBeCloseTo(1 + (1 - Math.exp(-0.1)), 10);
    expect(paso.centro.x).toBeCloseTo(480 + 120 * (1 - Math.exp(-0.1)), 10);
  });

  it('se asienta en el zoom entero exacto', () => {
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
