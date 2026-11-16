import { pintarSilueta, rumboDiscreto, RUMBOS_DE_SOMBRA, tenderSilueta } from './sombra-de-figura';

/**
 * La sombra proyectada de una figura es su silueta (el alfa del cuadro que se ve) tendida sobre el piso, en la dirección
 * contraria a la fuente y tan larga como dice la luz (regla 3 de calidad-visual). Aritmética entera.
 */
describe('sombra de figura', () => {
  // Un palito de 1 px de ancho y 10 de alto, con los pies en (2, 9) de un cuadro de 5 × 10.
  const ANCHO = 5, ALTO = 10;
  const palito = (): Uint8Array => {
    const a = new Uint8Array(ANCHO * ALTO);
    for (let y = 0; y < ALTO; y++) a[y * ANCHO + 2] = 255;
    return a;
  };
  const marcados = (s: ReturnType<typeof tenderSilueta>) => {
    const out: [number, number][] = [];
    for (let y = 0; y < s.alto; y++) for (let x = 0; x < s.ancho; x++) if (s.mascara[y * s.ancho + x]) out.push([x - s.origenX, y - s.origenY]);
    return out;
  };

  it('tendida hacia la derecha: la coronilla queda a `largo` px de los pies, sobre el piso', () => {
    const s = tenderSilueta(palito(), ANCHO, ALTO, 2, 9, [64, 0], 18);
    const puntos = marcados(s);
    expect(puntos).toContainEqual([0, 0]);                         // los pies
    expect(Math.max(...puntos.map(p => p[0]))).toBe(18);            // la coronilla, 18 px a la derecha
    expect(puntos.every(p => p[1] === 0)).toBe(true);               // todo en la fila de los pies: está en el piso
  });

  it('sin huecos aunque la sombra sea más larga que la figura', () => {
    const s = tenderSilueta(palito(), ANCHO, ALTO, 2, 9, [64, 0], 30);
    const xs = new Set(marcados(s).map(p => p[0]));
    for (let x = 0; x <= 30; x++) expect(xs.has(x)).toBe(true);
  });

  it('hacia la cámara (abajo) y en diagonal sigue el rumbo', () => {
    const abajo = marcados(tenderSilueta(palito(), ANCHO, ALTO, 2, 9, [0, 64], 12));
    expect(Math.max(...abajo.map(p => p[1]))).toBe(12);
    const diagonal = marcados(tenderSilueta(palito(), ANCHO, ALTO, 2, 9, [45, 45], 16));
    const lejos = diagonal.reduce((a, b) => (b[0] + b[1] > a[0] + a[1] ? b : a));
    expect(lejos[0]).toBe(lejos[1]);
    expect(lejos[0]).toBeGreaterThanOrEqual(10);
  });

  it('la silueta conserva su ancho: un cuerpo de 3 px deja una sombra de 3 px de ancho', () => {
    const a = new Uint8Array(ANCHO * ALTO);
    for (let y = 0; y < ALTO; y++) for (let x = 1; x <= 3; x++) a[y * ANCHO + x] = 255;
    const s = tenderSilueta(a, ANCHO, ALTO, 2, 9, [0, -64], 9);   // hacia el fondo
    const enLosPies = marcados(s).filter(p => p[1] === 0).map(p => p[0]).sort();
    expect(enLosPies).toEqual([-1, 0, 1]);
  });

  it('voltear refleja la silueta (el personaje mirando al otro lado)', () => {
    const a = new Uint8Array(ANCHO * ALTO);
    for (let y = 0; y < ALTO; y++) a[y * ANCHO + 4] = 255;   // palito a la derecha de los pies
    const normal = marcados(tenderSilueta(a, ANCHO, ALTO, 2, 9, [0, -64], 4));
    const volteada = marcados(tenderSilueta(a, ANCHO, ALTO, 2, 9, [0, -64], 4, true));
    expect(normal.every(p => p[0] === 2)).toBe(true);
    expect(volteada.every(p => p[0] === -2)).toBe(true);
  });

  it('dos escalones: cerca de los pies el oscuro, lejos el claro, y el paso entre ambos con el tramado de la casa', () => {
    const s = tenderSilueta(palito(), ANCHO, ALTO, 2, 9, [64, 0], 32);
    const pie = s.mascara[s.origenY * s.ancho + s.origenX];
    const punta = s.mascara[s.origenY * s.ancho + s.origenX + 32];
    expect(pie).toBe(2);
    expect(punta).toBe(1);
    const rgba = pintarSilueta(s, [100, 110, 130], [180, 185, 200]);
    const i = (s.origenY * s.ancho + s.origenX) * 4;
    expect([rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]).toEqual([100, 110, 130, 255]);
    const j = (s.origenY * s.ancho + s.origenX + 32) * 4;
    expect([rgba[j], rgba[j + 1], rgba[j + 2], rgba[j + 3]]).toEqual([180, 185, 200, 255]);
    // Fuera de la silueta, transparente.
    const diagonal = tenderSilueta(palito(), ANCHO, ALTO, 2, 9, [45, 45], 16);
    const vacia = diagonal.mascara.indexOf(0);
    expect(vacia).toBeGreaterThanOrEqual(0);
    expect(pintarSilueta(diagonal, [100, 110, 130], [180, 185, 200])[vacia * 4 + 3]).toBe(0);
  });

  it('el rumbo se lleva a uno de los 16 discretos', () => {
    expect(RUMBOS_DE_SOMBRA).toHaveLength(16);
    expect(rumboDiscreto(100, 3)).toEqual([64, 0]);
    expect(rumboDiscreto(-5, -80)).toEqual([0, -64]);
    expect(rumboDiscreto(40, 41)).toEqual([45, 45]);
  });
});
