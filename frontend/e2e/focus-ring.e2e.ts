import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { loginStudent } from './support/siep-flow';

/**
 * Anillo de foco en superficies oscuras (plan visual F1-5; revisión de F1, C1): las zonas oscuras del portal
 * declaran su propio --ds-focus. Se mide el contorno REAL del elemento enfocado con teclado.
 */
async function focusedOutline(page: Page): Promise<{ color: string; width: string; inside: string }> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const style = getComputedStyle(element);
    return { color: style.outlineColor, width: style.outlineWidth, inside: element.closest('[class]')?.className ?? '' };
  });
}

async function tabUntil(page: Page, selector: string, max = 40): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(sel => document.activeElement?.matches(sel) ?? false, selector)) return;
  }
  throw new Error(`El foco no llegó a ${selector} en ${max} pulsaciones de Tab`);
}

// req: RNF-04, RNF-004 (foco visible ≥ 3:1 sobre su fondo, WCAG 2.4.7 y 1.4.11)
test('@focus-ring el foco es claro en la cabecera oscura de la portada', async ({ page }) => {
  await page.goto('/');
  await page.locator('.landing-nav').waitFor({ state: 'visible' });
  await tabUntil(page, '.landing-nav a, .landing-nav button');
  expect(await focusedOutline(page)).toMatchObject({ color: 'rgb(201, 179, 255)', width: '3px' });
});

test('@focus-ring el foco es blanco en el menú lateral morado del portal', async ({ page }) => {
  await loginStudent(page);
  await page.locator('.portal-sidenav').waitFor({ state: 'visible' });
  await tabUntil(page, '.portal-sidenav a');
  expect(await focusedOutline(page)).toMatchObject({ color: 'rgb(255, 255, 255)', width: '3px' });
});
