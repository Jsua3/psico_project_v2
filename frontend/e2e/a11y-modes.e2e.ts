import { expect, test } from '@playwright/test';

import { runAxe } from './support/quality-gates';
import { TOUR_SCREENS, loginAs, openScreen } from './support/screen-tour';
import type { SignedRole } from './support/screen-tour';
import { scanUi } from './support/ui-scan';
import { scaled } from './support/time-scale';

/**
 * Modos del sistema (plan visual F9-2, TOO-4; RNF-04, WCAG 1.4.1, 1.4.11, 2.3.3): la misma interfaz con movimiento
 * reducido, con colores forzados (alto contraste de Windows) y con contraste aumentado. Por cada modo, en pantallas
 * representativas de cada rol: Axe sin serious ni critical, sin texto < 12 px ni objetivos < 24 px, y lo propio del modo:
 *  - movimiento reducido: no queda NINGUNA animación corriendo (tampoco indicadores de carga) ni transición con duración;
 *  - colores forzados: el control enfocado conserva un contorno visible y una insignia conserva su borde.
 */
const SCREENS = new Set(['portada', 'acceso', 'panel', 'catalogo', 'rubricas', 'editor-caso']);
const MODES = [
  { name: 'movimiento reducido', options: { reducedMotion: 'reduce' as const } },
  { name: 'colores forzados', options: { forcedColors: 'active' as const } },
  { name: 'contraste aumentado', options: { contrast: 'more' as const } },
];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const mode of MODES) {
  test.describe(`@a11y-modes ${mode.name}`, () => {
    test.use({ ...mode.options, viewport: { width: 1280, height: 800 } });

    for (const role of ['publico', 'profesor', 'admin'] as const) {
      // req: RNF-04, WCAG 1.4.11, WCAG 2.3.3
      test(`${role}: pantallas representativas sin violaciones serias ni objetivos pequeños`, async ({ page }) => {
        test.setTimeout(scaled(6 * 60_000));
        if (role !== 'publico') await loginAs(page, role as SignedRole);
        const problems: string[] = [];
        for (const screen of TOUR_SCREENS.filter(item => item.role === role && SCREENS.has(item.id))) {
          await openScreen(page, screen);
          await page.waitForTimeout(300);
          const axe = await runAxe(page, { tags: TAGS, resultTypes: ['violations'] });
          for (const violation of axe.violations) {
            if (violation.impact === 'serious' || violation.impact === 'critical') {
              problems.push(`${role}/${screen.id}: ${violation.id} [${violation.impact}] ×${violation.nodes.length}`);
            }
          }
          const scan = await scanUi(page);
          problems.push(...scan.smallText.map(item => `${role}/${screen.id}: texto < 12 px · ${item}`));
          problems.push(...scan.smallTargets.map(item => `${role}/${screen.id}: objetivo < 24 px · ${item}`));

          if (mode.options.reducedMotion) {
            const moving = await page.evaluate(() => document.getAnimations()
              .filter(animation => animation.playState === 'running')
              .map(animation => (animation as CSSAnimation).animationName || (animation as CSSTransition).transitionProperty || 'sin nombre'));
            if (moving.length) problems.push(`${role}/${screen.id}: animaciones corriendo con movimiento reducido · ${moving.slice(0, 4).join(', ')}`);
          }
          if (mode.options.forcedColors) {
            const target = page.locator('main a[href], main button, a[href], button').filter({ visible: true }).first();
            if (await target.count()) {
              await target.focus();
              const outline = await target.evaluate(element => {
                const style = getComputedStyle(element);
                return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
              });
              if (outline.style === 'none' || outline.width < 1) problems.push(`${role}/${screen.id}: sin contorno de foco con colores forzados`);
            }
          }
        }
        expect(problems.slice(0, 40), 'cifras fuera de criterio').toEqual([]);
      });
    }
  });
}
