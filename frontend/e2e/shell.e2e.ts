import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { loginAs } from './support/screen-tour';

/**
 * Barra de vidrio del portal (plan visual F3-3 y F3-5) en el navegador real: destinos por rol, destino activo, plegado
 * al desplazarse y vuelta con el teclado, menú de cuenta y ausencia de barra en el juego; en el teléfono, las pestañas
 * inferiores, la hoja «Más» y el plegado por dirección. El comportamiento fino de la barra de escritorio (resortes,
 * vidrio, huecos, 44 px, contraste) lo mide el arnés de la skill sobre /dev/barra.
 */

/** Alarga la página para poder desplazarse más de 8 px en cualquier pantalla. */
async function scrollDown(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.body.style.setProperty('min-height', '300vh');
    window.scrollTo({ top: 600, behavior: 'instant' });
  });
}

// req: BLOQUE-H (navegación del portal con teclado y puntero, plan visual F3-3)
test.describe('@shell barra de vidrio del portal', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('estudiante: sus cuatro destinos, el activo marcado y sin barra en la sala de juego', async ({ page }) => {
    await loginAs(page, 'estudiante');
    const bar = page.locator('header.cromo');
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    await expect(bar.locator('.modulo-principal a.nav-enlace')).toHaveText(['Panel', 'Simulador', 'Invitaciones', 'Mi personaje']);
    await bar.getByRole('link', { name: 'Simulador', exact: true }).click();
    await page.waitForURL(/\/portal\/simulador$/);
    await expect(bar.getByRole('link', { name: 'Simulador', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(bar.getByRole('link', { name: 'Panel', exact: true })).not.toHaveAttribute('aria-current', 'page');
    await page.goto('/portal/jugar');
    await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30_000 });
    await expect(page.locator('header.cromo')).toHaveCount(0);
  });

  test('docente: al desplazarse se pliegan Rúbricas, Grupos y Reportes, y vuelven con Tab', async ({ page }) => {
    await loginAs(page, 'profesor');
    const bar = page.locator('header.cromo');
    await expect(bar).toHaveAttribute('data-estado', 'inicial');
    await scrollDown(page);
    await expect(bar).toHaveAttribute('data-estado', 'scroll');
    const folded = bar.locator('a.control-plegable');
    await expect(folded).toHaveText(['Rúbricas', 'Grupos', 'Reportes']);
    for (const link of await folded.all()) await expect(link).toBeHidden();
    await expect(bar.getByRole('link', { name: 'Trazabilidad', exact: true })).toBeVisible();

    // Con Tab el foco entra a la barra y la despliega (data-modalidad="teclado" + :focus-within).
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => !!document.activeElement?.closest('header.cromo .modulo-principal'))) break;
    }
    await expect(bar).toHaveAttribute('data-modalidad', 'teclado');
    for (const link of await folded.all()) await expect(link).toBeVisible();
  });

  test('docente: tras un clic en la barra y con el ratón fuera, Tab desde «Trazabilidad» llega a «Rúbricas» plegada', async ({ page }) => {
    // Revisión de F3 (I-1): la modalidad se escribía en el DOM después de que Tab moviera el foco, así que el Tab que
    // sigue a un clic se saltaba los plegados (ocultos con modalidad «puntero»).
    await loginAs(page, 'profesor');
    const bar = page.locator('header.cromo');
    await page.goto('/portal/docente/trazabilidad');
    await scrollDown(page);
    await expect(bar).toHaveAttribute('data-estado', 'scroll');
    const trace = bar.getByRole('link', { name: 'Trazabilidad', exact: true });
    await trace.click();
    await page.mouse.move(700, 600); // fuera de la barra: vence la gracia y se repliega
    await expect(bar).toHaveAttribute('data-estado', 'scroll');
    await expect(bar).toHaveAttribute('data-modalidad', 'puntero');
    await expect(trace).toBeFocused();
    // El ocultado de los plegados llega con el retraso de su transición (620 ms): Tab cuando ya están ocultos.
    const rubrics = bar.getByRole('link', { name: 'Rúbricas', exact: true });
    await expect(rubrics).toBeHidden();
    await page.keyboard.press('Tab');
    await expect(rubrics).toBeFocused();
  });

  test('entrar y moverse por el portal no deja errores de Angular en la consola (p. ej. NG0600 por el foco)', async ({ page }) => {
    // El acceso retira el botón con foco mientras pinta: el focusout que dispara Chrome en ese instante no puede
    // escribir señales (la barra mide el teclado virtual con el foco).
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error' && /NG0\d+/.test(message.text())) errors.push(message.text()); });
    page.on('pageerror', error => { if (/NG0\d+/.test(error.message)) errors.push(error.message); });
    await loginAs(page, 'profesor');
    await page.locator('header.cromo').getByRole('link', { name: 'Trazabilidad', exact: true }).click();
    await page.waitForURL(/\/portal\/docente\/trazabilidad$/);
    expect(errors).toEqual([]);
  });

  test('la cuenta muestra nombre y rol, y su menú cierra la sesión', async ({ page }) => {
    await loginAs(page, 'profesor');
    const bar = page.locator('header.cromo');
    await expect(bar.locator('.cuenta-chip__rol')).toHaveText('Docente');
    await expect(bar.locator('.cuenta-chip__nombre')).not.toBeEmpty();
    await bar.getByRole('button', { name: 'Cuenta' }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });
});

// req: BLOQUE-H (WCAG 1.4.1: el destino actual no se distingue solo por color; revisión de F3, I-2)
test.describe('@shell colores forzados: el destino actual se distingue sin color', () => {
  test('escritorio: el enlace actual va subrayado y los demás no; teléfono: la pestaña actual lleva una raya', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, 'profesor');
    const principal = page.locator('header.cromo .modulo-principal');
    const current = principal.locator('a[aria-current="page"]');
    await expect(current).toHaveText('Panel');
    expect(await current.evaluate(el => getComputedStyle(el).textDecorationLine)).toContain('underline');
    const other = principal.getByRole('link', { name: 'Simulador', exact: true });
    expect(await other.evaluate(el => getComputedStyle(el).textDecorationLine)).not.toContain('underline');

    await page.setViewportSize({ width: 390, height: 844 });
    const tab = page.locator('header.cromo nav.modulo-inferior .pestana[aria-current="page"]');
    await expect(tab).toBeVisible();
    const edge = await tab.evaluate(el => ({ style: getComputedStyle(el).borderBottomStyle, width: parseFloat(getComputedStyle(el).borderBottomWidth) }));
    expect(edge.style).toBe('solid');
    expect(edge.width).toBeGreaterThanOrEqual(2);
  });
});

/** Un paso de desplazamiento (cada uno, un evento de scroll: la máquina móvil decide por la dirección). */
async function scrollStep(page: Page, top: number): Promise<void> {
  await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), top);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

// req: BLOQUE-H (navegación móvil con el dedo, plan visual F3-5; references/movil.md de /barra-de-vidrio-modular)
test.describe('@shell barra móvil: arriba marca y cuenta, abajo las pestañas', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('docente: pestañas de ≥ 44 px, y la hoja «Más» con sus destinos, trampa de foco y retorno a «Más»', async ({ page }) => {
    await loginAs(page, 'profesor');
    const top = page.getByRole('navigation', { name: 'Marca y cuenta' });
    const bottom = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(top).toBeVisible();
    await expect(bottom).toBeVisible();
    await expect(page.locator('header.cromo .modulo-principal')).toBeHidden();
    await expect(bottom.locator('.pestana__rotulo')).toHaveText(['Panel', 'Simulador', 'Trazabilidad', 'Más']);
    for (const tab of await bottom.locator('.pestana').all()) {
      const box = (await tab.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await expect(bottom.getByRole('link', { name: 'Panel', exact: true })).toHaveAttribute('aria-current', 'page');

    const more = bottom.getByRole('button', { name: 'Más' });
    await more.tap();
    const sheet = page.getByRole('dialog', { name: 'Más destinos' });
    await expect(sheet).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    // Nombres accesibles (el icono es decorativo; su ligadura no forma parte del nombre).
    await expect(sheet.getByRole('link')).toHaveCount(3);
    for (const name of ['Rúbricas', 'Grupos', 'Reportes']) await expect(sheet.getByRole('link', { name, exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();

    await more.tap();
    await page.getByRole('dialog', { name: 'Más destinos' }).getByRole('link', { name: 'Rúbricas' }).tap();
    await page.waitForURL(/\/portal\/rubricas$/);
    await expect(page.getByRole('dialog', { name: 'Más destinos' })).toHaveCount(0);
  });

  test('estudiante (412 × 915): bajar 24 px compacta y pliega los rótulos, subir 12 px los devuelve; el contenido no queda bajo las pestañas', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await loginAs(page, 'estudiante');
    const bar = page.locator('header.cromo');
    const bottom = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(bottom.locator('.pestana__rotulo')).toHaveText(['Panel', 'Simulador', 'Invitaciones', 'Mi personaje']);
    await expect(bottom.getByRole('button', { name: 'Más' })).toHaveCount(0);

    // Al final de la página, el área de contenido de main (sin su relleno) termina por encima de la barra inferior.
    // Desplazar y medir en el mismo turno: el panel crece cuando llegan sus datos.
    await page.waitForLoadState('networkidle');
    const gap = await page.evaluate(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      const main = document.querySelector('main.portal-main')!;
      const contentBottom = main.getBoundingClientRect().bottom - parseFloat(getComputedStyle(main).paddingBottom);
      return document.querySelector('header.cromo nav.modulo-inferior')!.getBoundingClientRect().top - contentBottom;
    });
    expect(gap).toBeGreaterThanOrEqual(0);

    await scrollStep(page, 0);
    await page.evaluate(() => document.body.style.setProperty('min-height', '300vh'));
    await expect(bar).toHaveAttribute('data-estado', 'inicial');
    await scrollStep(page, 20);
    await scrollStep(page, 40); // 40 − 0 = 40 > 24
    await expect(bar).toHaveAttribute('data-estado', 'scroll');
    await expect.poll(() => bottom.locator('.pestana__rotulo').first().evaluate(el => getComputedStyle(el).opacity)).toBe('0');
    await scrollStep(page, 30); // −10: aún no
    await expect(bar).toHaveAttribute('data-estado', 'scroll');
    await scrollStep(page, 25); // −15 > 12
    await expect(bar).toHaveAttribute('data-estado', 'inicial');
    await expect.poll(() => bottom.locator('.pestana__rotulo').first().evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  });

  test('con movimiento reducido la barra móvil nunca se compacta (WCAG 2.3.3)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loginAs(page, 'estudiante');
    const bar = page.locator('header.cromo');
    await page.evaluate(() => document.body.style.setProperty('min-height', '300vh'));
    for (const y of [40, 100, 160]) await scrollStep(page, y);
    await expect(bar).toHaveAttribute('data-estado', 'inicial');
  });
});
