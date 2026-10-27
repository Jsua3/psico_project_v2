import { expect, test } from '@playwright/test';

import { crearCaso, esperarPantalla, rutas } from './ayudas';

for (const tamano of [{ width: 1366, height: 768 }, { width: 1280, height: 800 }]) {
  test(`ninguna pantalla se desborda a lo ancho a ${tamano.width}×${tamano.height}`, async ({ page }) => {
    await page.setViewportSize(tamano);
    await crearCaso(page);
    const desbordadas: string[] = [];
    for (const ruta of await rutas(page)) {
      await page.goto(ruta);
      await esperarPantalla(page);
      const { ancho, contenido } = await page.evaluate(() => ({ ancho: window.innerWidth, contenido: document.documentElement.scrollWidth }));
      if (contenido > ancho) desbordadas.push(`${ruta}: ${contenido} > ${ancho}`);
    }
    expect(desbordadas).toEqual([]);
  });
}

test('con el asistente de IA abierto, el mapa tampoco se desborda', async ({ page }) => {
  await crearCaso(page);
  await page.getByRole('button', { name: 'Asistente de IA' }).click();
  await expect(page.getByRole('heading', { name: 'Asistente de IA' })).toBeVisible();
  const { ancho, contenido } = await page.evaluate(() => ({ ancho: window.innerWidth, contenido: document.documentElement.scrollWidth }));
  expect(contenido).toBeLessThanOrEqual(ancho);
});

test('recarga: el caso sigue ahí después de recargar la página', async ({ page }) => {
  await crearCaso(page);
  await page.reload();
  await expect(page.locator('header')).toContainText('Atención en Bienestar');
  await expect(page.locator('button.escena')).toHaveCount(3);
});
