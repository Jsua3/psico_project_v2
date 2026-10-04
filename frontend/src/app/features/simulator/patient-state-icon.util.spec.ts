import { readFileSync } from 'fs';
import { join } from 'path';

import { PATIENT_ICON_KINDS, patientIconImage, patientIconKey, patientIconKind, patientIconView } from './patient-state-icon.util';

const palette = new Set<string>(JSON.parse(readFileSync(join(__dirname, '../../../../character-kit/palette.v2.json'), 'utf8')).masterColors);
const hex = (rgba: Uint8Array, i: number) => `#${[0, 1, 2].map(k => rgba[i + k]!.toString(16).padStart(2, '0')).join('')}`;

describe('icono del estado clínico (decisión 13)', () => {
  it.each([
    [{ crisisLevel: 70, trustLevel: 90, emotionalState: 90 }, 'crisis'],
    [{ crisisLevel: 10, trustLevel: 60, emotionalState: 60 }, 'confianza'],
    [{ crisisLevel: 10, trustLevel: 20, emotionalState: 25 }, 'decaida'],
    [{ crisisLevel: 69, trustLevel: 59, emotionalState: 40 }, null],
  ])('%j → %s (los umbrales del antiguo tinte)', (state, expected) => {
    expect(patientIconKind(state)).toBe(expected);
  });

  it('la vista del icono al crearlo: oculto sin estado o sin señal; visible con la textura de su tipo', () => {
    expect(patientIconView(null)).toEqual({ visible: false, key: 'patient-icon-crisis' });
    expect(patientIconView({ crisisLevel: 10, trustLevel: 10, emotionalState: 50 })).toEqual({ visible: false, key: 'patient-icon-crisis' });
    expect(patientIconView({ crisisLevel: 80, trustLevel: 0, emotionalState: 50 })).toEqual({ visible: true, key: 'patient-icon-crisis' });
    expect(patientIconView({ crisisLevel: 0, trustLevel: 70, emotionalState: 70 })).toEqual({ visible: true, key: 'patient-icon-confianza' });
    expect(patientIconView({ crisisLevel: 0, trustLevel: 0, emotionalState: 10 })).toEqual({ visible: true, key: 'patient-icon-decaida' });
  });

  it('pixel art del kit: alfa binario, colores de palette.v2 y mismo tamaño', () => {
    const images = PATIENT_ICON_KINDS.map(patientIconImage);
    for (const image of images) {
      expect([image.width, image.height]).toEqual([7, 8]);
      for (let i = 0; i < image.rgba.length; i += 4) {
        expect([0, 255]).toContain(image.rgba[i + 3]);
        if (image.rgba[i + 3]) expect(palette.has(hex(image.rgba, i))).toBe(true);
      }
    }
    expect(new Set(images.map(image => image.rgba.join(','))).size).toBe(3);
    expect(patientIconKey('crisis')).toBe('patient-icon-crisis');
  });
});
