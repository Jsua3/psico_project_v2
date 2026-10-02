import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'dialogue-panel.component.ts'), 'utf-8');

describe('opciones del diálogo: movimiento', () => {
  it('la entrada escalonada no congela opacity ni transform al terminar', () => {
    expect(source).toContain('animation: choice-in 200ms var(--psy-ease-out) backwards;');
    expect(source).not.toMatch(/animation: choice-in[^;]*\bboth;/);
    expect(source).not.toMatch(/animation: choice-confirm[^;]*\bboth;/);
  });

  it('responde al presionar y el hover solo existe con puntero fino', () => {
    expect(source).toMatch(/\.choice-btn:active \{\s*transform: scale\(\.97\);\s*\}/);
    expect(source).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.choice-btn:hover \{/);
    expect(source).not.toMatch(/\.choice-btn:hover \{\s*transform: translateY\(-1px\);/);
  });

  it('transiciona solo propiedades explícitas', () => {
    expect(source).toContain(
      'transition: border-color 150ms ease, background-color 150ms ease, opacity 150ms ease, transform 160ms var(--psy-ease-out);',
    );
  });

  it('con movimiento reducido quita entrada y hundimiento, pero no el atenuado', () => {
    expect(source).toMatch(/\.choice-btn:active \{ transform: none; \}/);
    expect(source).not.toContain('.choice-btn:hover { transform: none; }');
    expect(source).toContain('.choices--locked .choice-btn:not(.choice-btn--chosen) { opacity: .45; }');
  });
});
