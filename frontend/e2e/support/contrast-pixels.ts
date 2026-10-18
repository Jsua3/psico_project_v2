import { inflateSync } from 'zlib';

/**
 * Medir el contraste de lo que SE VE (plan visual F9-2: cada `incomplete` de contraste de Axe revisado). Axe no puede
 * decidir el contraste cuando el fondo es un degradado, una imagen, un vidrio con `backdrop-filter` o hay capas
 * encima, y lo deja como `incomplete`. Aquí se toma el recorte del elemento tal como lo pinta el navegador, se elige
 * el color de fondo (el más frecuente) y el de la tinta (el color más frecuente entre lo que no es fondo), y se calcula
 * la razón de contraste de WCAG 2.1 §1.4.3. Es una medición, no un veredicto: lo que roza el umbral o tiene un fondo
 * poco uniforme se mira a ojo (`borde`, `fondo no uniforme`).
 */
export interface Rgb { r: number; g: number; b: number }

/** Píxeles RGBA de 8 bits, fila a fila. */
export interface DecodedImage { width: number; height: number; data: Uint8Array }

export interface CropMeasure {
  background: Rgb;
  /** Parte del recorte (0–1) que no es el color de fondo: texto, bordes, iconos o un fondo que no es liso. */
  backgroundShare: number;
  ink: Rgb | null;
  inkPixels: number;
  /** Parte de la tinta (0–1) que es de UN color: alta en un texto sobre fondo liso, baja en un degradado (no fiable). */
  inkConcentration: number | null;
  ratio: number | null;
}

export type Verdict = 'pasa' | 'borde' | 'falla' | 'sin-medida';

const channel = (value: number): number => {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
};

export const luminance = ({ r, g, b }: Rgb): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** WCAG 1.4.3: el texto grande (≥ 24 px, o ≥ 18,66 px en negrita) pide 3:1; el resto, 4,5:1. */
export function requiredRatio({ fontSizePx, fontWeight }: { fontSizePx: number; fontWeight: number }): 3 | 4.5 {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
}

/** Lo que roza el umbral (hasta 0,5 por debajo) se deja como `borde`: la medición por píxeles tiene su margen. */
export function classifyRatio(ratio: number | null, required: number): Verdict {
  if (ratio === null) return 'sin-medida';
  if (ratio >= required) return 'pasa';
  return ratio >= required - 0.5 ? 'borde' : 'falla';
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const dLeft = Math.abs(estimate - left);
  const dUp = Math.abs(estimate - up);
  const dUpLeft = Math.abs(estimate - upLeft);
  return dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft;
}

/** Lee un PNG de 8 bits, RGB o RGBA, sin entrelazado: lo que producen las capturas de Playwright. */
export function decodePng(buffer: Uint8Array): DecodedImage {
  if (buffer.length < 8 || SIGNATURE.some((byte, index) => buffer[index] !== byte)) throw new Error('No es un PNG (firma inválida)');
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  const compressed: Uint8Array[] = [];
  while (offset + 12 <= buffer.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...buffer.subarray(offset + 4, offset + 8));
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      compressed.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(`PNG no admitido (profundidad ${bitDepth}, tipo de color ${colorType}, entrelazado ${interlace})`);
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(compressed));
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const source = y * (stride + 1) + 1;
    const target = y * stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= bytesPerPixel ? rows[target + i - bytesPerPixel] : 0;
      const up = y > 0 ? rows[target - stride + i] : 0;
      const upLeft = y > 0 && i >= bytesPerPixel ? rows[target - stride + i - bytesPerPixel] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : paeth(left, up, upLeft);
      rows[target + i] = (raw[source + i] + predictor) & 0xff;
    }
  }

  const data = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    data[pixel * 4] = rows[pixel * bytesPerPixel];
    data[pixel * 4 + 1] = rows[pixel * bytesPerPixel + 1];
    data[pixel * 4 + 2] = rows[pixel * bytesPerPixel + 2];
    data[pixel * 4 + 3] = colorType === 6 ? rows[pixel * 4 + 3] : 255;
  }
  return { width, height, data };
}

/** Un color más lejos que esto (distancia euclídea en RGB) del fondo cuenta como tinta; los bordes suavizados quedan repartidos. */
const INK_DISTANCE = 40;
/** Un segundo color de tinta pesa si tiene al menos esta parte de los píxeles del principal (el texto y su pista pálida). */
const SIGNIFICANT_SHARE = 0.2;

interface Cluster { count: number; r: number; g: number; b: number }

const bucketOf = (r: number, g: number, b: number): number => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
const meanOf = (cluster: Cluster): Rgb => ({ r: Math.round(cluster.r / cluster.count), g: Math.round(cluster.g / cluster.count), b: Math.round(cluster.b / cluster.count) });

function add(clusters: Map<number, Cluster>, key: number, r: number, g: number, b: number): void {
  const cluster = clusters.get(key);
  if (cluster) {
    cluster.count += 1;
    cluster.r += r;
    cluster.g += g;
    cluster.b += b;
  } else {
    clusters.set(key, { count: 1, r, g, b });
  }
}

/**
 * Fondo = el color más frecuente. Tinta = los colores más frecuentes entre lo que se aleja del fondo; con varias tintas
 * de peso se toma la de peor contraste (un texto oscuro con una pista pálida al lado se juzga por la pista).
 */
export function measureCrop(image: DecodedImage, options: { dominantOnly?: boolean } = {}): CropMeasure {
  const total = image.width * image.height;
  const all = new Map<number, Cluster>();
  for (let i = 0; i < total; i += 1) {
    const r = image.data[i * 4];
    const g = image.data[i * 4 + 1];
    const b = image.data[i * 4 + 2];
    add(all, bucketOf(r, g, b), r, g, b);
  }
  const top = [...all.values()].sort((a, b) => b.count - a.count)[0];
  const background = meanOf(top);

  const ink = new Map<number, Cluster>();
  let inkPixels = 0;
  for (let i = 0; i < total; i += 1) {
    const r = image.data[i * 4];
    const g = image.data[i * 4 + 1];
    const b = image.data[i * 4 + 2];
    if (Math.hypot(r - background.r, g - background.g, b - background.b) <= INK_DISTANCE) continue;
    inkPixels += 1;
    add(ink, bucketOf(r, g, b), r, g, b);
  }
  const backgroundShare = 1 - inkPixels / total;
  if (!ink.size) return { background, backgroundShare, ink: null, inkPixels: 0, inkConcentration: null, ratio: null };

  const clusters = [...ink.values()].sort((a, b) => b.count - a.count);
  // «Tinta dominante»: solo el color más frecuente (para un texto cuyo color CSS no se ve en el recorte, donde una raya o una
  // pista pálida no deben decidir); por defecto se juzga por el peor de los colores con peso.
  const weighty = options.dominantOnly ? [clusters[0]] : clusters.filter(cluster => cluster.count >= clusters[0].count * SIGNIFICANT_SHARE);
  const worst = weighty
    .map(cluster => ({ color: meanOf(cluster), ratio: contrastRatio(meanOf(cluster), background) }))
    .sort((a, b) => a.ratio - b.ratio)[0];
  return { background, backgroundShare, ink: worst.color, inkPixels, inkConcentration: clusters[0].count / inkPixels, ratio: worst.ratio };
}

export interface CssColor extends Rgb { a: number }

/** Lee lo que devuelve `getComputedStyle(...).color`: `rgb()`, `rgba()` o `color(srgb …)` (los colores mezclados con `color-mix`). */
export function parseCssColor(text: string): CssColor | null {
  const legacy = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(text.trim());
  if (legacy) return { r: Number(legacy[1]), g: Number(legacy[2]), b: Number(legacy[3]), a: alphaOf(legacy[4]) };
  const modern = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(text.trim());
  if (modern) return { r: Math.round(Number(modern[1]) * 255), g: Math.round(Number(modern[2]) * 255), b: Math.round(Number(modern[3]) * 255), a: alphaOf(modern[4]) };
  return null;
}

const alphaOf = (raw: string | undefined): number => {
  if (raw === undefined) return 1;
  return raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
};

export interface TextMeasure {
  /** El peor fondo (el que da menor contraste con el texto) entre los que ocupan una parte apreciable del recorte. */
  background: Rgb;
  /** Cuántos fondos distintos pesan en el recorte: 1 en un fondo liso, más en un degradado. */
  backgrounds: number;
  /** El color del texto ya mezclado con ese fondo (si tiene transparencia o hay una capa con opacidad por encima). */
  foreground: Rgb;
  ratio: number;
  /** El color esperado del texto aparece en el recorte; si no, algo lo tapa o no se pinta y la medición no vale. */
  fgSeen: boolean;
}

/** Un fondo «pesa» si ocupa al menos esta parte del recorte: la raya de un enlace o un icono pequeño no son el fondo. */
const BACKGROUND_SHARE = 0.08;
/** Un píxel a esta distancia (euclídea en RGB) del color esperado del texto cuenta como texto. */
const TEXT_DISTANCE = 45;
/** Con menos píxeles que estos del color del texto no se da por visto (a ×2, un glifo de 12 px tiene más de un centenar). */
const MIN_TEXT_PIXELS = 12;

const mix = (top: Rgb, below: Rgb, alpha: number): Rgb => ({
  r: Math.round(top.r * alpha + below.r * (1 - alpha)),
  g: Math.round(top.g * alpha + below.g * (1 - alpha)),
  b: Math.round(top.b * alpha + below.b * (1 - alpha)),
});

const distance = (a: Rgb, b: Rgb): number => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

/**
 * Mide el contraste de un texto del que se SABE el color (el de `getComputedStyle`, con la opacidad de sus ancestros en
 * `alpha`) contra el fondo tal como se ve en el recorte. El color del texto no se adivina de los píxeles (así una raya o un
 * icono dentro de la caja no se toman por texto) y el fondo se toma de los colores que ocupan una parte apreciable del
 * recorte: con un degradado se juzga por el peor tramo.
 */
export function measureText(image: DecodedImage, text: { color: Rgb; alpha?: number }): TextMeasure {
  const alpha = text.alpha ?? 1;
  const total = image.width * image.height;
  const all = new Map<number, Cluster>();
  for (let i = 0; i < total; i += 1) {
    const r = image.data[i * 4];
    const g = image.data[i * 4 + 1];
    const b = image.data[i * 4 + 2];
    add(all, bucketOf(r, g, b), r, g, b);
  }
  const clusters = [...all.values()].sort((a, b) => b.count - a.count);
  const top = meanOf(clusters[0]);

  // Fondos: los colores con peso que no son el texto. Un titular en negrita puede ocupar más del recorte que su fondo y su
  // propio color ser el más frecuente: ese no es un fondo. Si todos lo parecen (texto del mismo color que su fondo) se juzgan todos.
  const expectedOnTop = mix(text.color, top, alpha);
  const candidates = clusters.filter((cluster, index) => index === 0 || cluster.count >= total * BACKGROUND_SHARE).map(meanOf);
  const isText = (color: Rgb) => distance(color, text.color) <= TEXT_DISTANCE || distance(color, expectedOnTop) <= TEXT_DISTANCE;
  const apart = candidates.filter(color => !isText(color));
  const backgrounds = apart.length ? apart : candidates;

  const worst = backgrounds
    .map(background => {
      const foreground = mix(text.color, background, alpha);
      return { background, foreground, ratio: contrastRatio(foreground, background) };
    })
    .sort((a, b) => a.ratio - b.ratio)[0];

  // ¿Se ve el color del texto? Unos pocos píxeles a su alcance, que no sean del propio fondo. La cifra es absoluta y no un
  // porcentaje: un número de una cifra dentro de un recuadro ancho es una fracción mínima del recorte y está igual de a la vista.
  let near = 0;
  for (let i = 0; i < total; i += 1) {
    const pixel = { r: image.data[i * 4], g: image.data[i * 4 + 1], b: image.data[i * 4 + 2] };
    if (distance(pixel, expectedOnTop) <= TEXT_DISTANCE && distance(pixel, top) > TEXT_DISTANCE / 2) near += 1;
  }
  const fgSeen = near >= MIN_TEXT_PIXELS;

  return { background: worst.background, backgrounds: backgrounds.length, foreground: worst.foreground, ratio: worst.ratio, fgSeen };
}
