import { Locator, Page, expect, test } from '@playwright/test';

import { runAxe } from './support/quality-gates';

/**
 * Estados de la biblioteca shared/ui en un navegador real (plan visual F2-9): la galería /dev/ui en las dos pieles,
 * auditada con Axe (WCAG 2.2 AA: sin hallazgos serios ni críticos), también con contraste forzado y con movimiento
 * reducido, más lo que jsdom no puede medir: el ancho estable del botón que carga, los 44 px en táctil, la trampa de
 * foco del diálogo, el foco del menú y el globo que no nace de un toque.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SKINS = ['portal', 'game'] as const;

async function openGallery(page: Page): Promise<void> {
  await page.goto('/dev/ui');
  await expect(page.getByRole('heading', { level: 1, name: 'Galería de componentes' })).toBeVisible();
  await expect(page.locator('.ui-gallery__skin[data-skin="game"] ui-table').last()).toBeVisible();
}

async function blockingViolations(page: Page, include: string): Promise<string[]> {
  const results = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations'], include });
  return results.violations
    .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
    .flatMap(violation => violation.nodes.map(node => `${violation.id} · ${node.target.join(' ')} · ${node.failureSummary ?? ''}`));
}

function panel(page: Page, skin: (typeof SKINS)[number]): Locator {
  return page.locator(`.ui-gallery__skin[data-skin="${skin}"]`);
}

test.describe('@ui-states galería en las dos pieles', () => {
  for (const skin of SKINS) {
    test(`Axe WCAG 2.2 AA sin hallazgos serios en la piel ${skin}`, async ({ page }) => {
      await openGallery(page);
      expect(await blockingViolations(page, `.ui-gallery__skin[data-skin="${skin}"]`)).toEqual([]);
    });
  }

  test('el botón que pasa a cargando conserva su ancho', async ({ page }) => {
    await openGallery(page);
    const save = panel(page, 'portal').locator('button.ui-gallery__save');
    const before = await save.boundingBox();
    await save.click();
    await expect(save.locator('ui-spinner')).toBeVisible();
    const during = await save.boundingBox();
    expect(Math.abs(during!.width - before!.width)).toBeLessThan(0.5);
    await expect(save).toHaveAttribute('aria-busy', 'true');
  });

  test('el diálogo atrapa el Tab y devuelve el foco al disparador con Esc', async ({ page }) => {
    await openGallery(page);
    const trigger = panel(page, 'portal').getByRole('button', { name: 'Abrir diálogo' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Editar grupo' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Nombre del grupo' })).toBeFocused();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('el menú abre con la flecha en su primer ítem y Esc devuelve el foco al botón', async ({ page }) => {
    await openGallery(page);
    const trigger = panel(page, 'portal').getByRole('button', { name: 'Cuenta' });
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    const first = panel(page, 'portal').getByRole('menuitem', { name: 'Mi perfil' });
    await expect(first).toBeVisible();
    await expect(first).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(panel(page, 'portal').getByRole('menuitem', { name: 'Mi personaje' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(first).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('el globo aparece con el ratón a los 400 ms y con el foco de teclado', async ({ page }) => {
    await openGallery(page);
    const exportButton = panel(page, 'portal').getByRole('button', { name: 'Exportar' });
    await exportButton.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Descarga el reporte del grupo en PDF');
    await page.mouse.move(0, 0);
    await expect(page.getByRole('tooltip')).toBeHidden();
    await exportButton.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tooltip')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toBeHidden();
    await expect(exportButton).toBeFocused();
  });
});

test.describe('@ui-states contraste forzado', () => {
  test.use({ forcedColors: 'active' });

  for (const skin of SKINS) {
    test(`Axe sin hallazgos serios con contraste forzado en la piel ${skin}`, async ({ page }) => {
      await openGallery(page);
      expect(await blockingViolations(page, `.ui-gallery__skin[data-skin="${skin}"]`)).toEqual([]);
    });
  }
});

test.describe('@ui-states movimiento reducido', () => {
  test.use({ reducedMotion: 'reduce' });

  test('esqueleto, indicador y progreso indeterminado quedan quietos', async ({ page }) => {
    await openGallery(page);
    const animations = await page.evaluate(() => [
      '.ui-skeleton__bone', 'ui-spinner', '.ui-progress--indeterminate .ui-progress__fill',
    ].map(selector => getComputedStyle(document.querySelector(selector)!).animationName));
    expect(animations).toEqual(['none', 'none', 'none']);
  });

  test('Axe sin hallazgos serios con movimiento reducido', async ({ page }) => {
    await openGallery(page);
    expect(await blockingViolations(page, '.ui-gallery__skin[data-skin="portal"]')).toEqual([]);
  });
});

test.describe('@ui-states táctil', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('todo objetivo de toque mide al menos 44 px', async ({ page }) => {
    await openGallery(page);
    const small = await page.evaluate(() => {
      const selectors = [
        'button[ui-button]', 'a[ui-button]', 'button[ui-icon-button]', '.ui-control', 'label[ui-check]',
        '.ui-tabs__tab', 'button[ui-card]', 'a[ui-card]',
      ];
      return [...document.querySelectorAll<HTMLElement>(selectors.join(','))]
        .filter(element => element.getClientRects().length > 0)
        .map(element => ({ element, box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.height < 44 - 0.5 || box.width < 44 - 0.5)
        .map(({ element, box }) => `${element.tagName.toLowerCase()}.${element.className.split(' ')[0]} ${box.width.toFixed(0)}×${box.height.toFixed(0)} «${element.textContent?.trim().slice(0, 30)}»`);
    });
    expect(small).toEqual([]);
  });

  test('un toque no abre el globo', async ({ page }) => {
    await openGallery(page);
    await panel(page, 'portal').getByRole('button', { name: 'Exportar' }).tap();
    await page.waitForTimeout(700);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });
});
