import type { SiepInputMode } from './required-viewports';

/**
 * Viewports de las pruebas de orientación (guided-first-minute, safe-exit).
 * `required-viewports.ts` no incluye ningún móvil HORIZONTAL (844x390, el caso
 * más exigente del modo compacto) y es el contrato de los recorridos completos,
 * así que esta lista es propia y no lo toca.
 */
export const GUIDED_VIEWPORTS = [
  { name: 'desktop-1366', width: 1366, height: 768, inputMode: 'keyboard' },
  { name: 'touch-844x390', width: 844, height: 390, inputMode: 'touch' },
] as const satisfies ReadonlyArray<{
  name: string;
  width: number;
  height: number;
  inputMode: SiepInputMode;
}>;
