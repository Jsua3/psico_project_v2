import { readFileSync } from 'fs';
import { join } from 'path';

const html = readFileSync(join(__dirname, 'landing.component.html'), 'utf-8');

describe('portada: semántica del menú móvil y de la maqueta', () => {
  it('el botón del menú anuncia si está abierto y controla la navegación', () => {
    expect(html).toMatch(/class="landing-nav__toggle"\s*type="button"\s*aria-label="Menú de navegación"\s*aria-controls="landing-nav-links"\s*\[attr\.aria-expanded\]="menuOpen\(\)"/);
    expect(html).toContain('<nav id="landing-nav-links" class="landing-nav__links"');
    expect(html).not.toContain('aria-label="Abrir menú"');
  });

  it('la maqueta de decisiones es decorativa: sus botones deshabilitados no se leen', () => {
    expect(html).toContain('<p class="landing-preview-pixel__decisions-label" aria-hidden="true">Decisiones disponibles</p>');
    expect(html).toContain('<div class="landing-preview-pixel__decisions" aria-hidden="true">');
  });
});
