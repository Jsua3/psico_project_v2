import { readFileSync } from 'fs';
import { join } from 'path';

const html = readFileSync(join(__dirname, 'landing.component.html'), 'utf-8');

describe('portada: navegación pública y semántica de la maqueta', () => {
  // F3-4: el menú móvil propio de la portada (botón «Menú de navegación» + lista desplegable) lo sustituye la
  // barra de vidrio compartida (app-public-bar); su accesibilidad se prueba en DOM en public-bar.component.spec.ts.
  it('la cabecera es la barra pública compartida, con las anclas de esta página', () => {
    expect(html).toContain('<app-public-bar [anchors]="anchors" />');
    expect(html).not.toContain('landing-nav');
  });

  it('la maqueta de decisiones es decorativa: sus botones deshabilitados no se leen', () => {
    expect(html).toContain('<p class="landing-preview-pixel__decisions-label" aria-hidden="true">Decisiones disponibles</p>');
    expect(html).toContain('<div class="landing-preview-pixel__decisions" aria-hidden="true">');
  });
});
