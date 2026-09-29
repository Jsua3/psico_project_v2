import { readFileSync } from 'fs';
import { join } from 'path';

function source(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf-8');
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('contraste: simulador', () => {
  const play = source('../app/features/simulator/simulation-play.component.ts');
  const styles = source('./styles.scss');

  it('la tarjeta de reanudar no usa el vidrio claro', () => {
    expect(play).not.toContain('resume-card liquid-glass');
    expect(play).toMatch(/\.resume-card \{[^}]*linear-gradient\(180deg, rgba\(18,24,42,\.96\), rgba\(8,12,18,\.98\)\)/);
  });

  it('el encabezado pequeño se aclara en modo juego', () => {
    expect(styles).toContain('body.game-mode .psy-eyebrow {');
    expect(styles).toMatch(/body\.game-mode \.psy-eyebrow \{\s*color: #B69CFF;/);
    expect(contrast('#B69CFF', '#12182A')).toBeGreaterThanOrEqual(4.5);
  });

  it('la ayuda de controles es legible', () => {
    expect(play).toMatch(/\.context-bar__hint \{[^}]*font-size: \.75rem;[^}]*color: rgba\(232,240,244,\.72\);/);
  });
});

describe('contraste: portada', () => {
  const data = source('../app/features/public/landing.component.ts');
  const scss = source('../app/features/public/landing.component.scss');
  const html = source('../app/features/public/landing.component.html');
  const accents = ['#6D28D9', '#115E59', '#9A3412', '#1D4ED8'];

  it('no quedan acentos claros que fallan AA', () => {
    for (const old of ['#7c3aed', '#14b8a6', '#f97316', '#3b82f6']) {
      expect(data).not.toContain(`'${old}'`);
    }
    for (const accent of accents) expect(data).toContain(`'${accent}'`);
  });

  it('los acentos pasan AA como texto y como fondo de texto blanco', () => {
    for (const accent of accents) {
      expect(contrast(accent, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('el titular no usa el tramo oscuro del degradado', () => {
    expect(scss).toContain('background: linear-gradient(135deg, #c4b5fd 0%, #a78bfa 100%);');
    expect(contrast('#a78bfa', '#151d32')).toBeGreaterThanOrEqual(4.5);
  });

  it('la cabecera tiene fondo sólido y el enlace Ingresar es visible', () => {
    expect(scss).not.toContain('rgba(12, 18, 34, 0.72) 70%, transparent 100%');
    expect(html).toContain('class="landing-btn landing-btn--sm landing-btn--outline" routerLink="/login"');
  });

  it('el foco es claro en las zonas oscuras y no hay variables inexistentes', () => {
    expect(scss).toMatch(/\.landing-nav,\s*\.landing-hero,\s*\.landing-cta__inner \{\s*--psy-focus: #C9B3FF;/);
    expect(scss).not.toContain('--siep-primary-glow');
    for (const bg of ['#151d32', '#0c1222', '#1a1040']) {
      expect(contrast('#C9B3FF', bg)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('contraste: login', () => {
  const scss = source('../app/features/login/login.component.scss');

  it('el foco se adapta a cada superficie', () => {
    expect(scss).toMatch(/\.siep-login \{\s*--psy-focus: #C9B3FF;\s*\}/);
    expect(scss).toMatch(/\.auth-container \.form-container \{\s*--psy-focus: rgba\(0, 72, 118, \.72\);\s*\}/);
    expect(scss).toMatch(/\.toggle-container \{\s*--psy-focus: #FFFFFF;\s*\}/);
    expect(contrast('#FFFFFF', '#5c6bc0')).toBeGreaterThanOrEqual(3);
  });

  it('el checkbox recupera su contorno de foco', () => {
    expect(scss).toMatch(/\.auth-remember input:focus-visible \{\s*outline: 3px solid var\(--psy-focus\);\s*outline-offset: 2px;\s*\}/);
  });
});
