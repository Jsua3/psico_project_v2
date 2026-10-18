import { deflateSync } from 'zlib';

import { classifyRatio, contrastRatio, decodePng, measureCrop, measureText, parseCssColor, requiredRatio } from './contrast-pixels';
import type { Rgb } from './contrast-pixels';

/**
 * La lectura de los `incomplete` de contraste de Axe (plan visual F9-2: «cada `incomplete` de contraste revisado»)
 * se hace midiendo los píxeles de lo que de verdad se ve. Estas pruebas fijan la matemática (WCAG 2.1 §1.4.3), el
 * lector de PNG que usa la medición (los recortes de Playwright) y la elección del color del fondo y de la tinta.
 */

// ── PNG de prueba: un codificador mínimo (sin dependencias) que también aplica los filtros por fila ───────────────────
const CRC_TABLE = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** `pixels[y][x]` = [r, g, b, a]. `colorType` 2 (RGB) o 6 (RGBA); `filters[y]` = tipo de filtro de la fila y. */
function encodePng(pixels: number[][][], colorType: 2 | 6, filters: number[] = []): Buffer {
  const height = pixels.length;
  const width = pixels[0].length;
  const bpp = colorType === 6 ? 4 : 3;
  const raw: number[][] = pixels.map(row => row.flatMap(px => (colorType === 6 ? [px[0], px[1], px[2], px[3]] : [px[0], px[1], px[2]])));
  const filtered: number[] = [];
  for (let y = 0; y < height; y += 1) {
    const type = filters[y] ?? 0;
    filtered.push(type);
    for (let i = 0; i < raw[y].length; i += 1) {
      const left = i >= bpp ? raw[y][i - bpp] : 0;
      const up = y > 0 ? raw[y - 1][i] : 0;
      const upLeft = y > 0 && i >= bpp ? raw[y - 1][i - bpp] : 0;
      const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][type];
      filtered.push((raw[y][i] - predictor) & 0xff);
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = colorType;
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from(filtered))),
    chunk('IEND', new Uint8Array(0)),
  ];
  return Buffer.concat(parts);
}

const hex = (value: string): Rgb => ({ r: parseInt(value.slice(1, 3), 16), g: parseInt(value.slice(3, 5), 16), b: parseInt(value.slice(5, 7), 16) });
const px = (value: string): number[] => { const c = hex(value); return [c.r, c.g, c.b, 255]; };

/** Un recorte `width`×`height` del color de fondo con rectángulos de tinta (x, y, w, h, color). */
function crop(width: number, height: number, background: string, inks: Array<[number, number, number, number, string]>): number[][][] {
  const rows = Array.from({ length: height }, () => Array.from({ length: width }, () => px(background)));
  for (const [x, y, w, h, color] of inks) {
    for (let j = y; j < y + h; j += 1) for (let i = x; i < x + w; i += 1) rows[j][i] = px(color);
  }
  return rows;
}

const measure = (rows: number[][][]) => measureCrop(decodePng(encodePng(rows, 6)));

// req: RNF-04, BLOQUE-H
describe('contraste WCAG 2.1 (§1.4.3)', () => {
  it('negro sobre blanco es 21:1 y un color sobre sí mismo es 1:1, sin importar el orden', () => {
    expect(contrastRatio(hex('#000000'), hex('#ffffff'))).toBeCloseTo(21, 5);
    expect(contrastRatio(hex('#ffffff'), hex('#000000'))).toBeCloseTo(21, 5);
    expect(contrastRatio(hex('#336699'), hex('#336699'))).toBeCloseTo(1, 5);
  });

  it('el gris #767676 sobre blanco es el más claro que cumple 4,5:1 y #777777 ya no', () => {
    expect(contrastRatio(hex('#767676'), hex('#ffffff'))).toBeCloseTo(4.54, 2);
    expect(contrastRatio(hex('#777777'), hex('#ffffff'))).toBeCloseTo(4.48, 2);
  });

  it('el texto grande (≥ 24 px, o ≥ 18,66 px en negrita) pide 3:1 y el resto 4,5:1', () => {
    expect(requiredRatio({ fontSizePx: 16, fontWeight: 400 })).toBe(4.5);
    expect(requiredRatio({ fontSizePx: 18.66, fontWeight: 400 })).toBe(4.5);
    expect(requiredRatio({ fontSizePx: 18.66, fontWeight: 700 })).toBe(3);
    expect(requiredRatio({ fontSizePx: 24, fontWeight: 400 })).toBe(3);
    expect(requiredRatio({ fontSizePx: 14, fontWeight: 700 })).toBe(4.5);
  });

  it('pasa con el umbral, falla por debajo y deja «borde» lo que roza el umbral (se revisa a ojo)', () => {
    expect(classifyRatio(4.5, 4.5)).toBe('pasa');
    expect(classifyRatio(7, 4.5)).toBe('pasa');
    expect(classifyRatio(4.3, 4.5)).toBe('borde');
    expect(classifyRatio(3.2, 4.5)).toBe('falla');
    expect(classifyRatio(null, 4.5)).toBe('sin-medida');
  });
});

// req: RNF-04, BLOQUE-H
describe('lector de PNG de los recortes', () => {
  it('lee RGBA y RGB y devuelve los mismos píxeles', () => {
    const rows = [[[10, 20, 30, 255], [40, 50, 60, 255], [70, 80, 90, 255]], [[1, 2, 3, 255], [4, 5, 6, 255], [7, 8, 9, 255]]];
    for (const colorType of [6, 2] as const) {
      const image = decodePng(encodePng(rows, colorType));
      expect([image.width, image.height]).toEqual([3, 2]);
      expect(Array.from(image.data.slice(0, 4))).toEqual([10, 20, 30, 255]);
      expect(Array.from(image.data.slice(4 * 5, 4 * 6))).toEqual([7, 8, 9, 255]);
    }
  });

  it('deshace los cinco filtros de fila (ninguno, Sub, Up, Average y Paeth)', () => {
    const rows = Array.from({ length: 5 }, (_, y) => Array.from({ length: 6 }, (_, x) => [(x * 37 + y * 11) & 255, (x * 5 + y * 90) & 255, (x * 200 + y * 3) & 255, 255]));
    const image = decodePng(encodePng(rows, 6, [0, 1, 2, 3, 4]));
    const expected = rows.flatMap(row => row.flat());
    expect(Array.from(image.data)).toEqual(expected);
  });

  it('rechaza lo que no es un PNG de 8 bits sin entrelazado', () => {
    expect(() => decodePng(Buffer.from('no soy un png'))).toThrow(/PNG/);
  });
});

// req: RNF-04, BLOQUE-H
describe('medir el contraste de un recorte', () => {
  it('texto negro sobre blanco: fondo blanco, tinta negra, 21:1', () => {
    const result = measure(crop(40, 20, '#ffffff', [[5, 5, 30, 10, '#000000']]));
    expect(result.background).toEqual(hex('#ffffff'));
    expect(result.ink).toEqual(hex('#000000'));
    expect(result.ratio).toBeCloseTo(21, 1);
  });

  it('distingue #767676 (pasa) de #777777 (no) sobre blanco', () => {
    expect(measure(crop(40, 20, '#ffffff', [[5, 5, 30, 10, '#767676']])).ratio).toBeCloseTo(4.54, 1);
    expect(measure(crop(40, 20, '#ffffff', [[5, 5, 30, 10, '#777777']])).ratio).toBeCloseTo(4.48, 1);
  });

  it('texto claro sobre un fondo oscuro', () => {
    const result = measure(crop(40, 20, '#0b1d2a', [[5, 5, 30, 10, '#e6eef5']]));
    expect(result.background).toEqual(hex('#0b1d2a'));
    expect(result.ink).toEqual(hex('#e6eef5'));
    expect(result.ratio).toBeGreaterThan(14);
  });

  it('los bordes suavizados de las letras no cambian la tinta: gana el color del trazo', () => {
    const rows = crop(60, 20, '#ffffff', [[10, 6, 40, 8, '#4a4a4a']]);
    // Una orla de grises intermedios, cada uno distinto, alrededor del trazo: así se reparte el suavizado de los bordes.
    for (let x = 9; x < 51; x += 1) {
      const gray = (0x90 + ((x * 7) % 80)).toString(16).padStart(2, '0');
      rows[5][x] = px(`#${gray}${gray}${gray}`);
      rows[14][x] = px(`#${gray}${gray}${gray}`);
    }
    const result = measure(rows);
    expect(result.ink).toEqual(hex('#4a4a4a'));
    expect(result.ratio).toBeCloseTo(contrastRatio(hex('#4a4a4a'), hex('#ffffff')), 1);
  });

  it('con dos colores de tinta importantes mide el peor (un texto oscuro con una pista pálida al lado)', () => {
    const result = measure(crop(80, 20, '#ffffff', [[2, 4, 30, 12, '#222222'], [40, 4, 30, 12, '#b0b0b0']]));
    expect(result.ratio).toBeCloseTo(contrastRatio(hex('#b0b0b0'), hex('#ffffff')), 1);
    expect(result.ink).toEqual(hex('#b0b0b0'));
  });

  it('en modo «tinta dominante» mide el color de tinta más frecuente y no el peor (para un texto cuyo color CSS no se ve)', () => {
    // El texto oscuro (360 px) con una pista pálida al lado (120 px): lo que se lee es el texto.
    const rows = crop(80, 20, '#ffffff', [[2, 4, 30, 12, '#222222'], [40, 4, 10, 12, '#b0b0b0']]);
    const result = measureCrop(decodePng(encodePng(rows, 6)), { dominantOnly: true });
    expect(result.ink).toEqual(hex('#222222'));
    expect(result.ratio).toBeCloseTo(contrastRatio(hex('#222222'), hex('#ffffff')), 1);
  });

  it('un recorte liso no tiene tinta: no se mide nada en vez de dar un aprobado', () => {
    const result = measure(crop(30, 12, '#ffffff', []));
    expect(result.ratio).toBeNull();
    expect(result.ink).toBeNull();
  });

  it('dice cuánto del recorte es el fondo, para desconfiar de los fondos con degradado', () => {
    expect(measure(crop(40, 20, '#ffffff', [[5, 5, 30, 10, '#000000']])).backgroundShare).toBeCloseTo(1 - 300 / 800, 3);
  });

  it('un texto sobre fondo liso concentra su tinta en un color; un degradado la reparte en muchos', () => {
    expect(measure(crop(40, 20, '#ffffff', [[5, 5, 30, 10, '#000000']])).inkConcentration).toBe(1);
    // Un degradado horizontal de blanco a negro: ningún color domina y no hay «tinta» que pueda medirse con confianza.
    const gradient = Array.from({ length: 20 }, () => Array.from({ length: 64 }, (_, x) => { const v = 255 - x * 4; return [v, v, v, 255]; }));
    const spread = measure(gradient);
    expect(spread.inkConcentration).not.toBeNull();
    expect(spread.inkConcentration!).toBeLessThan(0.2);
  });

  it('sin tinta no hay concentración que dar', () => {
    expect(measure(crop(30, 12, '#ffffff', [])).inkConcentration).toBeNull();
  });
});

// req: RNF-04, BLOQUE-H
describe('el color del texto viene del DOM y el fondo de los píxeles', () => {
  const text = (color: string, alpha = 1) => ({ color: hex(color), alpha });
  const measureText$ = (rows: number[][][], color: string, alpha = 1) => measureText(decodePng(encodePng(rows, 6)), text(color, alpha));

  it('un subrayado o un icono claro dentro de la caja no se toma por el texto', () => {
    // El texto #333 sobre blanco y, debajo, una barra fina azul claro (la raya del enlace activo): ese era el falso «2,3:1».
    const rows = crop(100, 30, '#ffffff', [[5, 5, 60, 14, '#333333'], [5, 26, 90, 2, '#87a8be']]);
    const result = measureText$(rows, '#333333');
    expect(result.ratio).toBeCloseTo(contrastRatio(hex('#333333'), hex('#ffffff')), 1);
    expect(result.fgSeen).toBe(true);
  });

  it('con un fondo en degradado se juzga contra el peor tramo del fondo', () => {
    // Mitad blanca y mitad gris #dddddd: #777777 pasa sobre el blanco (4,48) y falla sobre el gris (3,2).
    const rows = crop(80, 20, '#ffffff', [[40, 0, 40, 20, '#dddddd'], [10, 6, 20, 8, '#777777'], [50, 6, 20, 8, '#777777']]);
    const result = measureText$(rows, '#777777');
    expect(result.ratio).toBeCloseTo(contrastRatio(hex('#777777'), hex('#dddddd')), 1);
    expect(result.background).toEqual(hex('#dddddd'));
    expect(result.backgrounds).toBe(2);
  });

  it('un texto semitransparente se mezcla con el fondo antes de medir', () => {
    // Negro al 50 % sobre blanco se ve #808080: 3,95:1.
    const rows = crop(40, 20, '#ffffff', [[5, 5, 30, 10, '#808080']]);
    const result = measureText$(rows, '#000000', 0.5);
    expect(result.ratio).toBeCloseTo(contrastRatio(hex('#808080'), hex('#ffffff')), 1);
    expect(result.fgSeen).toBe(true);
  });

  it('si el color del texto no aparece en el recorte (tapado por otra capa) lo dice en vez de aprobar', () => {
    // Se espera texto #222222 pero lo que se ve es un bloque rojo: encima hay otra cosa.
    const rows = crop(40, 20, '#ffffff', [[5, 5, 30, 10, '#cc2200']]);
    const result = measureText$(rows, '#222222');
    expect(result.fgSeen).toBe(false);
  });

  it('un titular grande y en negrita, donde la tinta ocupa más que el fondo, no toma su propio color por fondo', () => {
    // 60 % del recorte es texto #14202e y 40 % es el blanco de debajo: el color más frecuente es el del texto (era el falso «1:1»).
    const rows = crop(100, 50, '#f5f7fa', [[0, 0, 100, 30, '#14202e']]);
    const result = measureText$(rows, '#14202e');
    expect(result.background).toEqual(hex('#f5f7fa'));
    expect(result.ratio).toBeCloseTo(contrastRatio(hex('#14202e'), hex('#f5f7fa')), 1);
  });

  it('un texto del mismo color que su fondo se queda en 1:1 (no hay otro fondo que elegir)', () => {
    const result = measureText$(crop(40, 20, '#14202e', []), '#14202e');
    expect(result.ratio).toBeCloseTo(1, 5);
  });

  it('un texto pequeño dentro de una caja grande (un número en un recuadro ancho) sigue viéndose', () => {
    // 300×100 px con apenas un puñado de píxeles de tinta: el 0,07 % del recorte, pero el texto está.
    const rows = crop(300, 100, '#ffffff', [[10, 40, 5, 4, '#14202e']]);
    expect(measureText$(rows, '#14202e').fgSeen).toBe(true);
  });

  it('un fondo oscuro con texto claro', () => {
    const rows = crop(40, 20, '#0b1d2a', [[5, 5, 30, 10, '#e6eef5']]);
    const result = measureText$(rows, '#e6eef5');
    expect(result.background).toEqual(hex('#0b1d2a'));
    expect(result.ratio).toBeGreaterThan(14);
  });
});

// req: RNF-04, BLOQUE-H
describe('colores CSS que devuelve getComputedStyle', () => {
  it('lee rgb(), rgba() y color(srgb …)', () => {
    expect(parseCssColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseCssColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseCssColor('color(srgb 0.5 0 1 / 0.25)')).toEqual({ r: 128, g: 0, b: 255, a: 0.25 });
    expect(parseCssColor('color(srgb 1 1 1)')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  it('devuelve null con lo que no entiende', () => {
    expect(parseCssColor('transparent')).toBeNull();
    expect(parseCssColor('')).toBeNull();
  });
});
