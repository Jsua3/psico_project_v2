import { readFileSync } from 'fs';
import { join } from 'path';

import { contrastRatio } from './contrast.util';

function source(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf-8');
}

describe('bloque H: portada', () => {
  const scss = source('../app/features/public/landing.component.scss');

  it('el botón primario no baja de 4,5:1 con texto blanco en ningún tramo del degradado', () => {
    // Antes: #8b5cf6 → #7c3aed; el inicio daba 4,23:1.
    expect(scss).not.toContain('#8b5cf6');
    expect(scss).toMatch(/\.landing-btn--primary \{[^}]*background: linear-gradient\(135deg, #7c3aed 0%, #6d28d9 100%\);/);
    for (const stop of ['#7c3aed', '#6d28d9']) {
      expect(contrastRatio('#FFFFFF', stop)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
