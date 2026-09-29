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

describe('movimiento: hover sin desplazamiento en el portal', () => {
  const files: Record<string, string> = {
    shell: source('../app/shared/layout/shell.component.ts'),
    quickActions: source('../app/features/dashboard/quick-actions.component.ts'),
    trace: source('../app/features/simulator/instructor-trace.component.ts'),
    grupos: source('../app/features/grupos/grupo-list.component.ts'),
    preview: source('../app/features/simulator/world-preview.component.ts'),
    dashboard: source('../app/features/dashboard/dashboard.component.scss'),
  };

  it('ninguna tarjeta ni fila se mueve en hover', () => {
    expect(files['shell']).not.toContain('transform: translate(-1px, -1px);');
    expect(files['quickActions']).not.toContain('transform: translate(-1px, -1px);');
    expect(files['trace']).not.toContain('transform: translate(-2px, -2px);');
    expect(files['grupos']).not.toContain('.group-card:hover { transform: translateY(-1px);');
    expect(files['preview']).not.toMatch(/\.interaction-card:hover, \.interaction-card--selected \{\s*transform/);
  });

  it('el foco de teclado de las tarjetas no comparte regla con el hover', () => {
    expect(files['quickActions']).not.toMatch(/\.quick-action-card:hover,\s*\.quick-action-card:focus-visible/);
    expect(files['trace']).not.toMatch(/\.attempt-card:hover,\s*\.attempt-card:focus-visible/);
    expect(files['trace']).not.toMatch(/\.review-summary-card--action:hover,\s*\.review-summary-card--action:focus-visible/);
  });

  it('el botón pixel se hunde al presionar, no al pasar el cursor', () => {
    expect(files['dashboard']).toMatch(/\.pixel-button:active \{\s*transform: translate\(2px, 2px\);/);
    expect(files['dashboard']).not.toMatch(/\.pixel-button:hover \{\s*transform/);
  });
});

describe('movimiento: juego', () => {
  it('el aviso de interacción aparece sin animación', () => {
    const play = source('../app/features/simulator/simulation-play.component.ts');
    expect(play).not.toContain('hint-rise');
  });
});
