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

describe('F9: el interruptor «Movimiento reducido» del juego apaga las animaciones CSS del simulador', () => {
  /** Los cuatro selectores de la regla: el contenedor y todo lo que hay dentro, también en componentes hijos (::ng-deep). */
  const selectors = [
    '.game-container--reduce-motion,',
    '.game-container--reduce-motion ::ng-deep *,',
    '.game-container--reduce-motion ::ng-deep *::before,',
    '.game-container--reduce-motion ::ng-deep *::after {',
  ];
  const reduceRule = source.slice(source.indexOf(selectors[0]), source.indexOf('}', source.indexOf(selectors[3])) + 1);

  it('el contenedor lleva la clase mientras el interruptor (reduceMotion) está activo', () => {
    expect(source).toMatch(/<div class="game-container" data-skin="game" id="main-content" tabindex="-1" \[attr\.data-mode\]="viewMode\(\)"\s*\[class\.game-container--reduce-motion\]="reduceMotion\(\)">/);
  });

  it('la regla alcanza al contenedor y a todos sus descendientes, también a los componentes hijos', () => {
    for (const selector of selectors) expect(reduceRule).toContain(selector);
  });

  it('apaga animaciones y transiciones igual que la regla global de prefers-reduced-motion', () => {
    expect(reduceRule).toContain('animation-duration: 1ms !important;');
    expect(reduceRule).toContain('animation-iteration-count: 1 !important;');
    expect(reduceRule).toContain('transition-duration: 1ms !important;');
    expect(reduceRule).toContain('scroll-behavior: auto !important;');
    // La red de seguridad global vive en styles/base/_motion.scss desde F1-6.
    const globalRule = readFileSync(join(__dirname, '../../../styles/base/_motion.scss'), 'utf-8');
    const media = globalRule.slice(globalRule.indexOf('@media (prefers-reduced-motion: reduce) {'));
    for (const declaration of ['animation-duration: 1ms !important;', 'animation-iteration-count: 1 !important;', 'transition-duration: 1ms !important;']) {
      expect(media).toContain(declaration);
    }
  });

  it('las animaciones que la revisión encontró encendidas existen y quedan dentro del alcance de la regla', () => {
    for (const name of ['sheet-up', 'panel-in', 'door-notice-in', 'fade-in']) {
      expect(source).toContain(`@keyframes ${name}`);
    }
    const dialogue = readFileSync(join(__dirname, 'dialogue-panel.component.ts'), 'utf-8');
    expect(dialogue).toContain('@keyframes choice-in');
    expect(readFileSync(join(__dirname, 'tool-inventory.component.ts'), 'utf-8')).toContain('@keyframes tool-pop');
    // La regla está en la hoja de la pantalla de juego, que contiene al panel y al inventario como hijos: ::ng-deep los alcanza.
    expect(source).toContain('<app-dialogue-panel');
    expect(source).toContain('<app-tool-inventory');
  });

  it('el ajuste del sistema sigue funcionando: la media query se conserva', () => {
    expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.scene-fade \{ transition: none; \}/);
  });
});
