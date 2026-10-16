import { expect, test } from '@playwright/test';

import { visitEditorTabs } from './support/editor-tabs';
import { TOUR_SCREENS, loginAs, openScreen } from './support/screen-tour';
import type { SignedRole, TourRole } from './support/screen-tour';
import { scanUi } from './support/ui-scan';
import type { UiScan } from './support/ui-scan';
import { scaled } from './support/time-scale';

/**
 * Escáner de estilos computados sobre todo el recorrido y las pestañas del editor (plan visual F9-2; RNF-04, WCAG 1.4.4
 * y 2.5.8): 0 textos visibles por debajo de 12 px (fuera del canvas), 0 objetivos por debajo de 24 px y, con puntero
 * táctil, 0 objetivos por debajo de 44 px. Se mide lo que el navegador pinta, con el puntero que corresponde: un contexto
 * de escritorio y otro táctil (`pointer: coarse`, `hover: none`) donde la biblioteca sube los controles a 44 px.
 */
const MODES = [
  { name: 'escritorio', options: { viewport: { width: 1440, height: 900 } }, touch: false },
  { name: 'táctil', options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, touch: true },
] as const;

function problemsOf(where: string, scan: UiScan, touch: boolean): string[] {
  return [
    ...scan.smallText.map(item => `${where}: texto < 12 px · ${item}`),
    ...scan.smallTargets.map(item => `${where}: objetivo < 24 px · ${item}`),
    ...(touch ? scan.touchTargets.map(item => `${where}: objetivo táctil < 44 px · ${item}`) : []),
  ];
}

for (const mode of MODES) {
  test.describe(`@a11y-scan ${mode.name}`, () => {
    test.use(mode.options);

    for (const role of ['publico', 'estudiante', 'profesor', 'admin'] as TourRole[]) {
      // req: RNF-04, WCAG 2.5.8
      test(`${role}: sin texto < 12 px ni objetivos pequeños`, async ({ page }) => {
        test.setTimeout(scaled(10 * 60_000));
        if (role !== 'publico') await loginAs(page, role as SignedRole);
        const problems: string[] = [];
        for (const screen of TOUR_SCREENS.filter(item => item.role === role)) {
          await openScreen(page, screen);
          await page.waitForTimeout(150);
          problems.push(...problemsOf(`${role}/${screen.id}`, await scanUi(page), mode.touch));
        }
        expect(problems.slice(0, 40), 'cifras fuera de criterio').toEqual([]);
      });
    }

    // req: RNF-04, WCAG 2.5.8
    test('editor de casos: cada pestaña sin texto < 12 px ni objetivos pequeños', async ({ page, request }) => {
      test.setTimeout(scaled(6 * 60_000));
      const problems: string[] = [];
      await visitEditorTabs(page, request, async tab => {
        problems.push(...problemsOf(`editor · ${tab}`, await scanUi(page), mode.touch));
      });
      expect(problems.slice(0, 60), 'cifras fuera de criterio').toEqual([]);
    });
  });
}
