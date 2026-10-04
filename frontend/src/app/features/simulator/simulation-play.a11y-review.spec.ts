import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Correcciones de accesibilidad de la revisión adversarial sobre `simulation-play.component.ts` (F6, F9). Jest no
 * renderiza la plantilla ni mide el CSS: se fijan sus contratos como texto (las regex usan `\s*` entre líneas).
 */
const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

describe('F6: anuncios de las regiones vivas, una sola vez', () => {
  it('la leyenda de teclado sale de la lectura de la barra (que es una región viva): aria-hidden', () => {
    expect(source).toMatch(/<div class="context-bar" aria-live="polite" aria-atomic="true">/);
    expect(source).toMatch(/<p class="context-bar__hint" aria-hidden="true">WASD mover/);
  });

  it('el aviso de puerta no es role="alert": showDoorNotice ya lo anuncia por la región viva', () => {
    expect(source).toMatch(/<div class="door-notice">\s*<mat-icon aria-hidden="true">lock<\/mat-icon>/);
    expect(source).not.toMatch(/<div class="door-notice"[^>]*role=/);
    expect(source).toMatch(/private showDoorNotice\(message: string\): void \{\s*this\.doorNotice\.set\(message\);\s*this\.announce\(message\);/);
  });

  it('la herramienta no se anuncia dos veces: el panel de diálogo ya anuncia su línea', () => {
    const toolFeedback = source.slice(source.indexOf('private showToolFeedback('), source.indexOf('toggleMusicMute(): void'));
    expect(toolFeedback).not.toContain('this.announce(');
    expect(toolFeedback).toContain('lines: [');
  });

  it('la tarjeta «Qué hacer» y el aviso suave siguen con su única región viva (no se tocan)', () => {
    expect(source).toMatch(/<div class="soft-notice" role="status">\{\{ softNotice\(\) \}\}<\/div>/);
    expect(source).toMatch(/<div class="objective-card">\s*(<!--[^>]*-->\s*)?<div class="objective-card__scroll">/);
    expect(source).not.toMatch(/<div class="objective-card"[^>]*role=/);
  });
});
