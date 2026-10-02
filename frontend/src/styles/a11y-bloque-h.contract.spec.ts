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

describe('bloque H: login (contraste)', () => {
  const scss = source('../app/features/login/login.component.scss');
  const muted = source('./styles.scss').match(/--siep-muted:\s*(#[0-9A-Fa-f]{6});/)?.[1] ?? '';

  it('el divisor y el estado de Google usan el token --siep-muted (≥ 4,5:1 sobre blanco)', () => {
    // Antes: rgba(120,120,140,.85) = 3,31:1 y rgba(120,120,140,.95) = 3,92:1.
    expect(muted).toBe('#5F6B76');
    expect(scss).toMatch(/\.auth-divider \{[^}]*color: var\(--siep-muted\);/);
    expect(scss).toMatch(/\.auth-google__status \{[^}]*color: var\(--siep-muted\);/);
    expect(contrastRatio(muted, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('el placeholder tiene color propio y llega a 4,5:1 sobre el campo gris', () => {
    // Sin regla, Chrome pinta #757575: 4,19:1 sobre #f3f4f6.
    expect(scss).toMatch(/\.auth-container input::placeholder \{\s*color: var\(--siep-muted\);\s*opacity: 1;\s*\}/);
    expect(contrastRatio(muted, '#F3F4F6')).toBeGreaterThanOrEqual(4.5);
  });

  it('el texto pequeño del panel índigo es blanco puro (4,86:1 incluso en el tramo más claro)', () => {
    // Antes: rgba(255,255,255,.82) = 3,85:1 sobre #5c6bc0.
    expect(scss).toMatch(/\.toggle-brand small \{[^}]*color: #fff;/);
    expect(contrastRatio('#FFFFFF', '#5C6BC0')).toBeGreaterThanOrEqual(4.5);
  });
});
