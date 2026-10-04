import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'world-preview.component.ts'), 'utf-8').replace(/\r\n/g, '\n');

/**
 * El lienzo en píxeles físicos mide a su contenedor (pixel-canvas.ts). En la vista previa el
 * mundo vivía en una celda de grid sin alto propio: el contenedor medía 0 y el lienzo quedaba
 * de 1 px de alto. Con Scale.FIT no pasaba porque el lienzo ponía su alto por la relación 16:9.
 */
describe('vista previa del editor de casos: el mundo tiene caja propia', () => {
  it('el mundo vive dentro de un marco 16:9 de tamaño definido', () => {
    expect(source).toMatch(/<div class="preview-stage">\s*<!-- Phaser canvas -->\s*<app-game-world/);
    expect(source).toMatch(/\.preview-stage \{[^}]*position: relative;[^}]*aspect-ratio: 16 \/ 9;/);
    expect(source).toMatch(/\.preview-stage app-game-world \{[^}]*position: absolute;[^}]*inset: 0;/);
  });
});
