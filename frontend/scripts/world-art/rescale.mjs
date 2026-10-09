/**
 * Reescalado determinista de pixel art a un tamaño exacto (F8, spec §13.1).
 *
 * Trabaja con imágenes `{ width, height, data }` (RGBA, `data` es un Uint8Array/Buffer) y no
 * toca disco: la lectura y la escritura de PNG viven en build.mjs. El resultado usa solo
 * colores de la imagen de origen y alfa binario (0 o 255), como el resto del arte del mundo.
 */

/** Los colores con luminancia hasta este valor se tratan como contorno y pesan más al elegir. */
export const LINE_LUMINANCE = 70;
/** Peso extra de los contornos: así una línea de 1 px sobrevive a un reescalado por fracciones. */
export const LINE_BIAS = 1.5;
/** Fracción mínima de píxeles opacos del origen para que el píxel de destino sea opaco. */
export const MIN_COVERAGE = 0.5;

const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Caja que contiene todos los píxeles con alfa > 0, o null si la imagen está vacía. */
export function boundsOf(image) {
  let x0 = image.width;
  let y0 = image.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

export function cropTo(image, bounds) {
  const data = new Uint8Array(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y++) {
    const from = ((bounds.y + y) * image.width + bounds.x) * 4;
    data.set(image.data.subarray(from, from + bounds.width * 4), y * bounds.width * 4);
  }
  return { width: bounds.width, height: bounds.height, data };
}

/**
 * Cada píxel de destino cubre una región del origen (con fracciones de píxel). Es opaco si al
 * menos MIN_COVERAGE de esa región es opaca, y toma el color dominante por área: los contornos
 * oscuros valen LINE_BIAS veces más. Empate: el color de menor valor RGB (determinista).
 */
export function resample(image, width, height) {
  const out = new Uint8Array(width * height * 4);
  const stepX = image.width / width;
  const stepY = image.height / height;
  const area = stepX * stepY;
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const x0 = tx * stepX;
      const x1 = x0 + stepX;
      const y0 = ty * stepY;
      const y1 = y0 + stepY;
      const weights = new Map();
      let opaque = 0;
      for (let y = Math.floor(y0); y < Math.min(image.height, Math.ceil(y1)); y++) {
        const overlapY = Math.min(y1, y + 1) - Math.max(y0, y);
        for (let x = Math.floor(x0); x < Math.min(image.width, Math.ceil(x1)); x++) {
          const i = (y * image.width + x) * 4;
          if (image.data[i + 3] === 0) continue;
          const weight = (Math.min(x1, x + 1) - Math.max(x0, x)) * overlapY;
          opaque += weight;
          const color = (image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2];
          weights.set(color, (weights.get(color) ?? 0) + weight);
        }
      }
      if (Math.round((opaque / area) * 1e6) < MIN_COVERAGE * 1e6) continue;
      let best = -1;
      let bestWeight = -1;
      for (const [color, weight] of weights) {
        const isLine = luminance(color >> 16, (color >> 8) & 255, color & 255) <= LINE_LUMINANCE;
        const effective = Math.round(weight * (isLine ? LINE_BIAS : 1) * 1e6);
        if (effective > bestWeight || (effective === bestWeight && color < best)) {
          best = color;
          bestWeight = effective;
        }
      }
      const o = (ty * width + tx) * 4;
      out[o] = best >> 16;
      out[o + 1] = (best >> 8) & 255;
      out[o + 2] = best & 255;
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/** Quita los píxeles opacos sin ningún vecino opaco (las 8 direcciones): motas del reescalado. */
export function removeIsolatedPixels(image) {
  const data = new Uint8Array(image.data);
  const opaqueAt = (x, y) => x >= 0 && y >= 0 && x < image.width && y < image.height && image.data[(y * image.width + x) * 4 + 3] !== 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (!opaqueAt(x, y)) continue;
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && opaqueAt(x + dx, y + dy)) neighbors++;
      if (neighbors === 0) data.fill(0, (y * image.width + x) * 4, (y * image.width + x) * 4 + 4);
    }
  }
  return { width: image.width, height: image.height, data };
}

/** Recorta al cuerpo opaco, lo reescala al tamaño exacto y limpia las motas. */
export function rescaleSprite(image, width, height) {
  const bounds = boundsOf(image);
  if (!bounds) throw new Error('la imagen no tiene píxeles opacos');
  return removeIsolatedPixels(resample(cropTo(image, bounds), width, height));
}

/** Colores opacos distintos de una imagen, como enteros 0xRRGGBB. */
export function paletteOf(image) {
  const colors = new Set();
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] !== 0) colors.add((image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2]);
  }
  return colors;
}
