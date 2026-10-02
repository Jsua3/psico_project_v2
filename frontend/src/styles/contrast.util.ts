export type Rgb = [number, number, number];

/** '#RGB' o '#RRGGBB' → [r, g, b] (0-255). Lanza si el formato no es válido. */
export function hexToRgb(hex: string): Rgb {
  const raw = hex.trim().replace(/^#/, '');
  const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Color hexadecimal no válido: ${hex}`);
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

export function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** Luminancia relativa de WCAG 2.x (0 = negro, 1 = blanco). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste WCAG 2.x entre dos colores opacos (de 1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Color opaco que resulta de pintar `fg` con opacidad `alpha` (0-1) sobre `bg`.
 * Para texto o anillos con rgba(): medir `contrastRatio(blend(fg, alpha, fondo), fondo)`.
 * Sobre un mapa o sobre un degradado, usar el peor fondo posible.
 */
export function blend(fg: string, alpha: number, bg: string): string {
  const a = Math.min(1, Math.max(0, alpha));
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  return rgbToHex(f.map((c, i) => c * a + b[i] * (1 - a)) as Rgb);
}
