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
