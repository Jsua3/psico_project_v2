import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { visitEditorTabs } from './support/editor-tabs';
import { TOUR_SCREENS, loginAs, openScreen } from './support/screen-tour';
import type { SignedRole } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Presupuesto de vidrio (plan visual §2.4 y F9-3; RNF-05, RNF-005): como mucho 3 `backdrop-filter` VISIBLES a la vez
 * en el portal y 2 si hay un canvas a la vista. Se mide lo que el navegador pinta en cada pantalla del recorrido de los
 * cuatro roles y en cada pestaña del editor de casos, no las declaraciones del CSS (eso lo cuenta `ui:lint`).
 */
async function glass(page: Page): Promise<{ layers: number; canvas: boolean }> {
  return page.evaluate(() => {
    let layers = 0;
    for (const element of Array.from(document.querySelectorAll('*'))) {
      const style = getComputedStyle(element);
      const filter = style.backdropFilter || (style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter;
      if (!filter || filter === 'none' || style.display === 'none' || style.visibility === 'hidden') continue;
      const box = element.getBoundingClientRect();
      if (box.width > 1 && box.height > 1) layers++;
    }
    const canvas = Array.from(document.querySelectorAll('canvas')).some(item => item.getBoundingClientRect().width > 100);
    return { layers, canvas };
  });
}

const budgetOf = (canvas: boolean) => (canvas ? 2 : 3);

for (const role of ['publico', 'estudiante', 'profesor', 'admin'] as const) {
  // req: RNF-05, RNF-005
  test(`@glass-budget ${role}: no más de 3 capas de vidrio visibles (2 con canvas)`, async ({ page }) => {
    test.setTimeout(scaled(8 * 60_000));
    if (role !== 'publico') await loginAs(page, role as SignedRole);
    await page.setViewportSize({ width: 1440, height: 900 });
    const over: string[] = [];
    for (const screen of TOUR_SCREENS.filter(item => item.role === role)) {
      await openScreen(page, screen);
      const { layers, canvas } = await glass(page);
      if (layers > budgetOf(canvas)) over.push(`${role}/${screen.id}: ${layers} capas${canvas ? ' con canvas' : ''}`);
    }
    expect(over, 'pantallas por encima del presupuesto de vidrio').toEqual([]);
  });
}

// req: RNF-05, RNF-005
test('@glass-budget editor de casos: cada pestaña dentro del presupuesto de vidrio', async ({ page, request }) => {
  test.setTimeout(scaled(5 * 60_000));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const over: string[] = [];
  await visitEditorTabs(page, request, async tab => {
    const { layers, canvas } = await glass(page);
    if (layers > budgetOf(canvas)) over.push(`editor · ${tab}: ${layers} capas${canvas ? ' con canvas' : ''}`);
  });
  expect(over, 'pestañas por encima del presupuesto de vidrio').toEqual([]);
});
