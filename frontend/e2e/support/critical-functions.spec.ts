import { readFileSync } from 'fs';
import { join } from 'path';

import { CRITICAL_FUNCTIONS } from './critical-functions';

/**
 * El «100 %» de RNF-004 (plan visual F9-2, §11.3) solo vale si la tabla de funciones críticas y las pruebas de teclado
 * no se separan: cada función tiene su prueba en `keyboard-critical.e2e.ts` (el título empieza con `[ID]`), ninguna
 * prueba cuelga de un código que la tabla no nombra, y el archivo no contiene ni un clic ni un `fill` (que son del
 * puntero): lo que ahí se hace, se hace con teclas. El contador de `pointerdown` de la propia prueba lo confirma al
 * correr.
 */
// req: RNF-004, RNF-04, BLOQUE-H
describe('funciones críticas por teclado (§11.3)', () => {
  const source = readFileSync(join(__dirname, '..', 'keyboard-critical.e2e.ts'), 'utf-8');
  const titles = [...source.matchAll(/^\s*test\(\s*['"`]\[([A-Z]\d{2}(?:[ ,]+[A-Z]\d{2})*)\]\s+([^'"`]+)['"`]/gm)]
    .map(match => ({ ids: match[1].split(/[ ,]+/), title: match[2] }));
  const covered = new Set(titles.flatMap(item => item.ids));

  it('la tabla tiene las 29 funciones del plan: 6 de todos, 13 del estudiante, 6 del profesor y 4 del administrador', () => {
    const byRole = (role: string) => CRITICAL_FUNCTIONS.filter(item => item.role === role).length;
    expect([byRole('todos'), byRole('estudiante'), byRole('profesor'), byRole('admin')]).toEqual([6, 13, 6, 4]);
    expect(new Set(CRITICAL_FUNCTIONS.map(item => item.id)).size).toBe(CRITICAL_FUNCTIONS.length);
  });

  it('cada función tiene una prueba de teclado en keyboard-critical.e2e.ts', () => {
    expect(CRITICAL_FUNCTIONS.filter(item => !covered.has(item.id)).map(item => `${item.id} ${item.label}`)).toEqual([]);
  });

  it('ninguna prueba cuelga de un código que la tabla no nombra', () => {
    const known = new Set(CRITICAL_FUNCTIONS.map(item => item.id));
    expect([...covered].filter(id => !known.has(id))).toEqual([]);
  });

  it('el archivo no usa APIs del puntero (clic, doble clic, fill, check, hover, arrastre): solo teclas', () => {
    const pointerApis = source.split('\n')
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line) && /\.(click|dblclick|fill|check|uncheck|hover|dragTo|tap|selectOption|setInputFiles)\(/.test(line));
    expect(pointerApis.map(item => `línea ${item.number}: ${item.line.trim()}`)).toEqual([]);
  });

  it('cada prueba termina exigiendo que no hubo puntero', () => {
    const tests = source.split(/\n(?=test\()/).filter(block => /^test\(/.test(block));
    expect(tests.length).toBeGreaterThan(0);
    expect(tests.filter(block => !/expectNoPointer\(/.test(block)).map(block => block.split('\n')[0])).toEqual([]);
  });
});
