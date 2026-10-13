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
test('@focus-ring la barra pública de la portada usa el anillo global azul marino (F3-4)', async ({ page }) => {
  await page.goto('/');
  await page.locator('header.cromo').waitFor({ state: 'visible' });
  await tabUntil(page, 'header.cromo a');
  expect(await focusedOutline(page)).toMatchObject({ color: 'rgb(0, 72, 118)', width: '3px' });
});

test('@focus-ring el foco sigue claro en el héroe oscuro de la portada', async ({ page }) => {
  await page.goto('/');
  await page.locator('.landing-hero').waitFor({ state: 'visible' });
  await tabUntil(page, '.landing-hero a, .landing-hero button');
  expect(await focusedOutline(page)).toMatchObject({ color: 'rgb(201, 179, 255)', width: '3px' });
});

test('@focus-ring la barra de vidrio del portal usa el anillo global azul marino (F3-3; antes, menú lateral morado)', async ({ page }) => {
  await loginStudent(page);
  await page.locator('header.cromo').waitFor({ state: 'visible' });
  await tabUntil(page, 'header.cromo .modulo-principal a');
  expect(await focusedOutline(page)).toMatchObject({ color: 'rgb(0, 72, 118)', width: '3px' });
});

/**
 * Con colores forzados (alto contraste de Windows) el navegador respeta los colores del sistema que pone el autor:
 * un anillo que vale `Canvas` queda del color del fondo, que también pasa a ser `Canvas`. Auditoría del 2026-10-12:
 * el menú lateral y el panel lateral del acceso apuntaban a --ds-on-primary, que en este modo vale Canvas.
 */
async function canvasColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.setProperty('background-color', 'Canvas');
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  });
}

test.describe('@focus-ring colores forzados', () => {
  test.use({ forcedColors: 'active' });

  // req: RNF-04, RNF-004, BLOQUE-H (foco visible con contraste forzado, WCAG 2.4.7)
  // F4-2: el control que alterna los formularios dejó el panel lateral deslizante y vive en el formulario
  // («Solicitar acceso»); la garantía es la misma: su anillo se ve con colores forzados.
  test('el foco del control que alterna los formularios del acceso no se confunde con el fondo', async ({ page }) => {
    await page.goto('/login');
    await page.locator('.acceso__switch').waitFor({ state: 'visible' });
    await tabUntil(page, '.acceso__switch button');
    const ring = await focusedOutline(page);
    expect(ring.width).toBe('3px');
    expect(ring.color).not.toBe(await canvasColor(page));
  });

  test('el foco de la barra del portal no se confunde con el fondo', async ({ page }) => {
    await loginStudent(page);
    await page.locator('header.cromo').waitFor({ state: 'visible' });
    await tabUntil(page, 'header.cromo .modulo-principal a');
    const ring = await focusedOutline(page);
    expect(ring.width).toBe('3px');
    expect(ring.color).not.toBe(await canvasColor(page));
  });
});
