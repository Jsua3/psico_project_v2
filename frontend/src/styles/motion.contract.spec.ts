import { readFileSync } from 'fs';
import { join } from 'path';

function source(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf-8');
}

describe('movimiento: botones y páginas', () => {
  const styles = source('./styles.scss');

  it('define la curva ease-out fuerte como token', () => {
    expect(styles).toContain('--psy-ease-out: cubic-bezier(0.23, 1, 0.32, 1);');
  });

  it('los botones no tienen destello en hover y responden en 160 ms', () => {
    expect(styles).not.toContain('.psy-button::before');
    expect(styles).not.toContain('.psy-button:hover::before');
    expect(styles).toContain(
      'transition: transform 160ms var(--psy-ease-out), box-shadow 150ms ease, background-color 150ms ease;',
    );
    expect(styles).toMatch(/\.psy-button:active \{\s*transform: scale\(\.97\);/);
  });

  it('la entrada de página es un fundido corto sin desplazamiento ni desenfoque', () => {
    expect(styles).toContain('animation: psy-page-fade 150ms var(--psy-ease-out) backwards;');
    expect(styles).toMatch(/@keyframes psy-page-fade \{\s*from \{ opacity: 0; \}\s*\}/);
    expect(styles).not.toContain('psy-page-rise');
  });
});
