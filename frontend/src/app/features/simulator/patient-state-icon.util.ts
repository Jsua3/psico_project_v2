/**
 * Estado clínico de la paciente como icono de pixel art sobre su cabeza (decisión 13):
 * reemplaza al tinte rojo/verde/azul, que cambiaba los píxeles del sprite.
 */
import type { RgbaImage } from '../character/kit/kit-engine';
import type { PatientState } from '../../core/models/simulation.model';

export type PatientIconKind = 'crisis' | 'confianza' | 'decaida';
export const PATIENT_ICON_KINDS: readonly PatientIconKind[] = ['crisis', 'confianza', 'decaida'];

/** Los mismos umbrales que tenía el tinte; la crisis manda. */
export function patientIconKind(state: Pick<PatientState, 'crisisLevel' | 'trustLevel' | 'emotionalState'>): PatientIconKind | null {
  if (state.crisisLevel >= 70) return 'crisis';
  if (state.trustLevel >= 60 && state.emotionalState >= 60) return 'confianza';
  if (state.emotionalState <= 25) return 'decaida';
  return null;
}

/** Colores de palette.v2.json: contorno del kit, blanco, coral profundo, verde y azul. */
const ICON_COLORS: Record<string, string> = { o: '#15131d', w: '#ffffff', r: '#a95366', g: '#5b8d70', b: '#3d78a8' };

/** Globo de 7×8 con una marca blanca: «!» de crisis, corazón de confianza, gota de ánimo decaído. */
export const PATIENT_ICON_GRIDS: Readonly<Record<PatientIconKind, readonly string[]>> = Object.freeze({
  crisis: ['.ooooo.', 'orrwrro', 'orrwrro', 'orrwrro', 'orrrrro', 'orrwrro', '.ooooo.', '...o...'],
  confianza: ['.ooooo.', 'ogwgwgo', 'owwwwwo', 'owwwwwo', 'ogwwwgo', 'oggwggo', '.ooooo.', '...o...'],
  decaida: ['.ooooo.', 'obbwbbo', 'obwwwbo', 'owwwwwo', 'obwwwbo', 'obbbbbo', '.ooooo.', '...o...'],
});

export function patientIconImage(kind: PatientIconKind): RgbaImage {
  const grid = PATIENT_ICON_GRIDS[kind];
  const width = grid[0]!.length;
  const height = grid.length;
  const rgba = new Uint8Array(width * height * 4);
  grid.forEach((row, y) => [...row].forEach((ch, x) => {
    const color = ICON_COLORS[ch];
    if (!color) return;
    const i = (y * width + x) * 4;
    rgba[i] = parseInt(color.slice(1, 3), 16);
    rgba[i + 1] = parseInt(color.slice(3, 5), 16);
    rgba[i + 2] = parseInt(color.slice(5, 7), 16);
    rgba[i + 3] = 255;
  }));
  return { width, height, rgba };
}

export function patientIconKey(kind: PatientIconKind): string {
  return `patient-icon-${kind}`;
}
