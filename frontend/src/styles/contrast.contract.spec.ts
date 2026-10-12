import { readFileSync } from 'fs';
import { join } from 'path';

import { blend, contrastRatio } from './contrast.util';

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

describe('contraste: avisos', () => {
  const styles = source('./styles.scss');

  it('el foco del botón de cerrar contrasta sobre la tarjeta blanca también en modo juego', () => {
    // El anillo global de body.game-mode (#C9B3FF) no llega a 3:1 sobre blanco (WCAG 1.4.11).
    expect(contrast('#C9B3FF', '#FFFFFF')).toBeLessThan(3);
    expect(contrast('#004876', '#FFFFFF')).toBeGreaterThanOrEqual(3);
    // Tres clases/pseudoclases + un elemento (0,3,1) superan a body.game-mode :focus-visible (0,2,1).
    expect(styles).toMatch(
      /\.siep-notifications \.siep-notification button:focus-visible \{[^}]*outline: 2px solid var\(--siep-blue\);[^}]*outline-offset: -2px;[^}]*border-radius: 50%;/,
    );
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
    // Revisión de F1 (C1): el token que mueve el anillo es --ds-focus (+ halo), no el alias --psy-focus.
    expect(scss).toMatch(/\.landing-nav,\s*\.landing-hero,\s*\.landing-cta__inner \{\s*--ds-focus: var\(--ds-focus-on-dark\);\s*--ds-focus-halo: var\(--ds-focus-on-dark-halo\);/);
    expect(scss).not.toContain('--siep-primary-glow');
    for (const bg of ['#151d32', '#0c1222', '#1a1040']) {
      expect(contrast('#C9B3FF', bg)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('contraste: login', () => {
  const scss = source('../app/features/login/login.component.scss');

  it('el foco se adapta a cada superficie', () => {
    expect(scss).toMatch(/\.siep-login \{\s*--ds-focus: var\(--ds-focus-on-dark\);\s*--ds-focus-halo: var\(--ds-focus-on-dark-halo\);\s*\}/);
    expect(scss).toMatch(/\.auth-container \.form-container \{\s*--ds-focus: var\(--ds-primary\);\s*--ds-focus-halo: var\(--ds-surface-1\);\s*\}/);
    expect(scss).toMatch(/\.toggle-container \{\s*--ds-focus: var\(--ds-focus-on-primary\);\s*--ds-focus-halo: var\(--ds-focus-on-dark-halo\);\s*\}/);
    expect(contrast('#FFFFFF', '#5c6bc0')).toBeGreaterThanOrEqual(3);
  });

  it('el checkbox recupera su contorno de foco', () => {
    expect(scss).toMatch(/\.auth-remember input:focus-visible \{\s*outline: 3px solid var\(--ds-focus\);\s*outline-offset: 2px;\s*\}/);
  });
});

describe('contraste: portal', () => {
  it('los anillos locales usan el foco global', () => {
    const dash = source('../app/features/dashboard/dashboard.component.scss');
    const trace = source('../app/features/simulator/instructor-trace.component.ts');
    expect(dash).not.toContain('outline: 3px solid rgba(124, 77, 255, 0.45);');
    expect(dash).toMatch(/\.pixel-button:focus-visible \{\s*outline: 3px solid var\(--psy-focus\);/);
    expect(trace).not.toContain('outline: 3px solid rgba(111, 76, 175, .28);');
  });
});

describe('contraste: navegación lateral', () => {
  // F3-3: el menú lateral morado desapareció (VD-1). La barra de vidrio es clara: hereda el anillo global y su
  // texto usa los tokens propios de la barra. El velo es el 72 % del fondo de la página sobre lo que pase debajo.
  const shell = source('../app/shared/layout/shell.component.ts');
  const barTokens = source('./tokens/_glass-bar.scss');
  const page = '#F5F7FA';
  const veilOver = (under: string) => blend(page, 0.72, under);
  const underneath = [page, '#FFFFFF', '#004876', '#14202E']; // fondo, tarjeta, primario y el texto más oscuro

  it('la barra no redefine el foco: vale el anillo global azul marino de la piel portal', () => {
    expect(shell).not.toMatch(/--ds-focus\s*:/);
  });

  it('el anillo global (#004876) supera 3:1 sobre el velo de la barra con cualquier contenido debajo', () => {
    underneath.forEach(under => expect(contrastRatio('#004876', veilOver(under)), under).toBeGreaterThanOrEqual(3));
  });

  it('el texto tenue de la barra supera 4,5:1 sobre el velo encima del fondo y de las superficies claras', () => {
    const tenue = barTokens.match(/--asb-cromo-tinta-tenue:\s*(#[0-9A-Fa-f]{6});/)?.[1] ?? '';
    expect(tenue).toBe('#3D4B59');
    [page, '#FFFFFF', '#E6F0F7'].forEach(under => expect(contrastRatio(tenue, veilOver(under)), under).toBeGreaterThanOrEqual(4.5));
  });
});

describe('contraste: botón táctil «Interactuar» en reposo', () => {
  const world = source('../app/features/simulator/game-world.component.ts');
  const styles = source('./styles.scss');

  /** Color del texto en reposo en anchos >= 700 px (la primera regla, fuera de la media query de < 700 px). */
  const idleColor = /\.touch-interact--idle \{ color: (#[0-9a-fA-F]{6});/.exec(world)?.[1] ?? '';

  it('en reposo (>= 700 px) el texto es oscuro sobre el vidrio claro y llega a AA incluso sobre un mundo negro', () => {
    expect(idleColor).not.toBe('');
    // Vidrio de .psy-button--glass: blanco al 52 %. El peor fondo es el que tiene un mundo negro debajo.
    expect(styles).toMatch(/\.psy-button--glass \{\s*background: rgba\(255,255,255,\.52\);/);
    const worstGlass = blend('#FFFFFF', 0.52, '#000000');
    expect(contrastRatio(idleColor, worstGlass)).toBeGreaterThanOrEqual(4.5);
  });

  it('el color de antes (claro al 78 %) no llegaba: 2,3:1 sobre el vidrio medido', () => {
    expect(contrastRatio(blend('#E8F0F4', 0.78, '#8B8E95'), '#8B8E95')).toBeLessThan(3);
  });

  it('el reposo se marca también por forma (borde discontinuo), no solo por tono', () => {
    expect(world).toMatch(/\.touch-interact--idle \{ color: #[0-9a-fA-F]{6}; border-style: dashed; \}/);
  });

  it('en anchos < 700 px el texto en reposo es claro sobre el fondo oscuro translúcido, con la misma marca por forma', () => {
    expect(world).toMatch(/\.touch-interact \{ background: rgba\(8,12,18,\.6\);[^}]*color: #e8f0f4; \}/);
    expect(world).toMatch(/\.touch-interact--idle \{ color: rgba\(232,240,244,\.8\); border-style: dashed; \}/);
  });
});
